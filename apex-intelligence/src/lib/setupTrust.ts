export type TrustStatus = 'RESEARCH_ONLY' | 'ON_TRIAL' | 'TRUSTED';

export interface SetupEvidenceView {
  setupType: string;
  status: TrustStatus;
  reasons: string[];
  test: { n: number; targetPct: number; stopPct: number; expiredPct: number; avgNetR: number; ciNetR: number };
  goalRateTest: number | null;
  generatedAt: string;
  live?: { closed: number; avgNetR: number | null; recentAvgNetR: number | null; open: number; pending: number; targetHits: number } | null;
}

export interface TrustSummary {
  status: TrustStatus;
  label: string;
  /** One sentence a trader can act on. */
  headline: string;
  evidence?: SetupEvidenceView;
}

const LABELS: Record<TrustStatus, string> = {
  TRUSTED: 'Trusted',
  ON_TRIAL: 'On trial',
  RESEARCH_ONLY: 'Research only',
};

/** Trust for a setup type. Anything without evidence is research-only. */
export function trustFor(setupType: string | undefined, evidence: SetupEvidenceView[]): TrustSummary {
  const item = setupType ? evidence.find(entry => entry.setupType === setupType) : undefined;
  if (!item) {
    return { status: 'RESEARCH_ONLY', label: LABELS.RESEARCH_ONLY, headline: 'Not yet tested on past data. Do not trade it with money.' };
  }
  const headline = item.status === 'TRUSTED'
    ? 'Passed the 2024+ test and its live paper record. Eligible for small real-money trades.'
    : item.status === 'ON_TRIAL'
      ? 'Passed the 2024+ test. Paper trade only until 30 live trades prove it.'
      : 'Lost money or lacked evidence on 2024+ data. Do not trade it with money.';
  return { status: item.status, label: LABELS[item.status], headline, evidence: item };
}

/** "−0.12R per trade" style result with sign. */
export function formatR(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}R`;
}

export interface PositionSize {
  shares: number;
  amount: number;
  riskAmount: number;
  /** What capped the size, for the explanation shown next to it. */
  limitedBy: 'RISK' | 'POSITION_CAP' | 'CASH' | 'NONE';
}

/** Largest share of capital any single position may use. */
export const MAX_POSITION_PCT = 20;

/**
 * Shares to buy so that a stop-out loses at most maxRiskPct of capital,
 * capped at MAX_POSITION_PCT of capital and the cash available.
 */
export function positionSize(params: {
  capital: number;
  maxRiskPct: number;
  entry: number;
  stop: number;
  availableCash?: number;
}): PositionSize | null {
  const { capital, maxRiskPct, entry, stop, availableCash } = params;
  if (!(capital > 0) || !(maxRiskPct > 0) || !(entry > 0) || !(stop > 0) || stop >= entry) return null;
  const perShareRisk = entry - stop;
  const byRisk = Math.floor((capital * maxRiskPct) / 100 / perShareRisk);
  const byCap = Math.floor((capital * MAX_POSITION_PCT) / 100 / entry);
  const byCash = availableCash === undefined ? Infinity : Math.floor(Math.max(0, availableCash) / entry);
  const shares = Math.max(0, Math.min(byRisk, byCap, byCash));
  const limitedBy: PositionSize['limitedBy'] = shares === 0 && byCash === 0
    ? 'CASH'
    : shares === byRisk ? 'RISK' : shares === byCap ? 'POSITION_CAP' : shares === byCash ? 'CASH' : 'NONE';
  return { shares, amount: +(shares * entry).toFixed(2), riskAmount: +(shares * perShareRisk).toFixed(2), limitedBy };
}
