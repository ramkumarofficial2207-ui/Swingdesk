import { Trade } from '../types';

/** Same v1 values as src/tradingDesk.ts (DESK_RULES). */
export const DESK = { maxStopPct: 2.5, firstTargetPct: 5, timeStopSessions: 7, drawdownBrakePct: 5, brakeDays: 7 } as const;

export type RegimeState = 'GREEN' | 'AMBER' | 'RED';
export interface RegimeView {
  today: { date: string; state: RegimeState; breadthPct: number; nifty: number; niftySma50: number; niftySma200: number; reasons: string[] } | null;
  history: Array<{ date: string; state: RegimeState; breadthPct: number }>;
}
export interface CatalystView { symbol: string; sector: string; resultsDate: string | null; sector5dPct: number | null; sectorRank: number | null; sectorCount: number }
export interface ExitAdviceView { tradeId: string; ticker: string; action: 'EXIT_STOP' | 'TAKE_HALF' | 'TRAIL' | 'TIME_EXIT' | 'HOLD'; message: string; lastClose: number | null; gainPct: number | null; rNow: number | null; sessionsHeld: number; suggestedStop: number }

export const REGIME_COPY: Record<RegimeState, { label: string; action: string }> = {
  GREEN: { label: 'GREEN · trade', action: 'Broad uptrend. New setups allowed, normal size.' },
  AMBER: { label: 'AMBER · caution', action: 'Mixed market. Setups shown with a warning; consider half size or skip.' },
  RED: { label: 'RED · stay in cash', action: 'Weak market. No new setups. Manage open positions only.' },
};

/** The v1 swing plan from an entry and stop: risk %, R multiple of the +5% target, and the follow-up rules. */
export function swingPlan(entry: number, stop: number) {
  if (!(entry > 0) || !(stop > 0) || stop >= entry) return null;
  const riskPct = ((entry - stop) / entry) * 100;
  const target = entry * (1 + DESK.firstTargetPct / 100);
  return { riskPct, target, targetR: DESK.firstTargetPct / riskPct, fitsLimit: riskPct <= DESK.maxStopPct };
}

/**
 * Drawdown brake: equity = capital + realized P&L in exit order (plus open P&L at
 * current prices). If equity falls the brake % below its peak, new trades pause
 * for brakeDays from that date, and stay paused while equity is still below the line.
 */
export function drawdownBrake(trades: Trade[], capital: number, now = new Date()) {
  const closed = trades.filter(t => t.status === 'CLOSED' && t.exitDate).sort((a, b) => a.exitDate!.localeCompare(b.exitDate!));
  let equity = capital;
  let peak = capital;
  let breachAt: string | null = null;
  for (const t of closed) {
    equity += t.pnlRs || 0;
    peak = Math.max(peak, equity);
    if (equity <= peak * (1 - DESK.drawdownBrakePct / 100)) breachAt = t.exitDate!;
  }
  const openPnl = trades.filter(t => t.status === 'OPEN').reduce((s, t) => s + ((t.currentPrice ?? t.entryPrice) - t.entryPrice) * t.quantity, 0);
  const current = equity + openPnl;
  const drawdownPct = peak > 0 ? Math.max(0, (1 - current / peak) * 100) : 0;
  const until = breachAt ? new Date(new Date(breachAt).getTime() + DESK.brakeDays * 86_400_000) : null;
  const active = drawdownPct >= DESK.drawdownBrakePct || (until !== null && until > now);
  return { equity: current, peak, drawdownPct, active, until: until?.toISOString() ?? null };
}

export interface GroupStats { key: string; n: number; winRate: number; avgWinPct: number; avgLossPct: number; avgR: number | null; totalRs: number }

/** Closed-trade statistics grouped by a key (setup type, regime at entry…). */
export function journalStats(trades: Trade[], keyOf: (t: Trade) => string): GroupStats[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades.filter(x => x.status === 'CLOSED')) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  return [...groups].map(([key, list]) => {
    const pct = list.map(t => t.pnlPct ?? (t.exitPrice ? (t.exitPrice / t.entryPrice - 1) * 100 : 0));
    const rs = list.map(t => t.rMultiple ?? (t.exitPrice && t.entryPrice > t.stopLossInit ? (t.exitPrice - t.entryPrice) / (t.entryPrice - t.stopLossInit) : NaN)).filter(Number.isFinite);
    return {
      key,
      n: list.length,
      winRate: (100 * pct.filter(p => p > 0).length) / list.length,
      avgWinPct: mean(pct.filter(p => p > 0)),
      avgLossPct: mean(pct.filter(p => p <= 0)),
      avgR: rs.length ? mean(rs) : null,
      totalRs: list.reduce((s, t) => s + (t.pnlRs || 0), 0),
    };
  }).sort((a, b) => b.n - a.n);
}
