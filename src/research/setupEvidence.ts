/**
 * Setup evidence: replay each scanner setup type with the app's own levels
 * and execution rules, then decide its trust status by the pre-registered
 * rules in reports/setup-trust-rules.md. Pure functions only.
 */
import { PriceBar } from '../corporateActions';
import { calculateMaxBreakoutEntry } from '../executionIntegrity';
import { SetupLevels } from '../setupLevels';
import { OutcomeStats, simulateFrom, TradeLabel } from './fivePercentStudy';

export const EVIDENCE_METHOD_VERSION = 'setup-evidence-v1';

export const EVIDENCE_RULES = {
    planSessions: 10,
    triggerVolumeRatio: 1.5,
    holdSessions: 10,
    costBps: 40,
    goalPct: 5,
    minTestTrades: 100,
    minPositiveTestYears: 2,
    trustedMinLiveTrades: 30,
} as const;

export type TrustStatus = 'RESEARCH_ONLY' | 'ON_TRIAL' | 'TRUSTED';

export interface ScannerTrade {
    label: TradeLabel;
    fillIndex: number;
    fill: number;
    /** The +5% goal was reached before the stop, from the same fill. */
    reachedGoalFirst: boolean;
}

export type ScannerTradeResult =
    | { kind: 'TRADE'; trade: ScannerTrade }
    | { kind: 'NOT_TRIGGERED' | 'SKIPPED_CHASE' | 'INSUFFICIENT_DATA' };

/**
 * Replay one scanner signal from the close of signalIndex:
 * - plan valid for 10 sessions;
 * - triggers on the first session whose high reaches entry with volume
 *   ≥ 1.5× the prior 20-session average;
 * - if that session opens above the app's maximum entry, the trade is
 *   skipped (no chasing), as the app would block it;
 * - fill at entry, or at the open if it gapped above entry within the cap.
 */
export function replayScannerSignal(bars: PriceBar[], signalIndex: number, levels: SetupLevels, atr14: number): ScannerTradeResult {
    const { entryPrice, stopLoss, targetPrice } = levels;
    const maxEntry = calculateMaxBreakoutEntry(entryPrice, atr14);
    const lastPlanIndex = signalIndex + EVIDENCE_RULES.planSessions;
    if (lastPlanIndex >= bars.length) return { kind: 'INSUFFICIENT_DATA' };
    for (let index = signalIndex + 1; index <= lastPlanIndex; index += 1) {
        const bar = bars[index];
        if (bar.high < entryPrice) continue;
        if (bar.open > maxEntry) return { kind: 'SKIPPED_CHASE' };
        const prior = bars.slice(Math.max(0, index - 20), index);
        const averageVolume = prior.reduce((sum, item) => sum + item.volume, 0) / Math.max(prior.length, 1);
        if (!(averageVolume > 0) || bar.volume < EVIDENCE_RULES.triggerVolumeRatio * averageVolume) continue;
        const fill = Math.max(entryPrice, bar.open);
        if (!(fill > stopLoss) || !(targetPrice > fill)) return { kind: 'SKIPPED_CHASE' };
        const stopPct = ((fill - stopLoss) / fill) * 100;
        const targetPct = ((targetPrice - fill) / fill) * 100;
        const label = simulateFrom(bars, index, fill, stopPct, targetPct, EVIDENCE_RULES.holdSessions, EVIDENCE_RULES.costBps);
        const goal = simulateFrom(bars, index, fill, stopPct, EVIDENCE_RULES.goalPct, EVIDENCE_RULES.holdSessions, EVIDENCE_RULES.costBps);
        if (!label || !goal) return { kind: 'INSUFFICIENT_DATA' };
        return { kind: 'TRADE', trade: { label, fillIndex: index, fill, reachedGoalFirst: goal.outcome === 'TARGET' } };
    }
    return { kind: 'NOT_TRIGGERED' };
}

export interface StatusDecision {
    status: TrustStatus;
    reasons: string[];
}

/**
 * Status from the test period by the pre-registered rules. Live paper trades
 * after the setup became On trial can promote it to Trusted.
 */
export function decideTrustStatus(params: {
    test: OutcomeStats;
    testYears: Array<{ year: string; stats: OutcomeStats }>;
    liveTrades?: { n: number; avgNetR: number };
}): StatusDecision {
    const { test, testYears, liveTrades } = params;
    const positiveYears = testYears.filter(item => item.stats.n > 0 && item.stats.avgNetR > 0).length;
    const failures: string[] = [];
    if (test.n < EVIDENCE_RULES.minTestTrades) failures.push(`Only ${test.n} test trades (needs ${EVIDENCE_RULES.minTestTrades})`);
    if (!(test.avgNetR > 0)) failures.push(`Average result ${test.avgNetR.toFixed(2)}R is not positive`);
    if (!(test.avgNetR - test.ciNetR > 0)) failures.push('95% range includes zero or below');
    if (positiveYears < EVIDENCE_RULES.minPositiveTestYears) failures.push(`Positive in ${positiveYears} of ${testYears.length} test years (needs ${EVIDENCE_RULES.minPositiveTestYears})`);
    if (failures.length) return { status: 'RESEARCH_ONLY', reasons: failures };
    if (liveTrades && liveTrades.n >= EVIDENCE_RULES.trustedMinLiveTrades && liveTrades.avgNetR > 0) {
        return { status: 'TRUSTED', reasons: [`Passed the test period and ${liveTrades.n} live paper trades averaging ${liveTrades.avgNetR.toFixed(2)}R`] };
    }
    return {
        status: 'ON_TRIAL',
        reasons: [`Passed the test period; ${liveTrades?.n ?? 0} of ${EVIDENCE_RULES.trustedMinLiveTrades} live paper trades recorded`],
    };
}
