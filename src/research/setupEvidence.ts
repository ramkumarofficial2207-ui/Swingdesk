/**
 * Setup evidence: replay each scanner setup type with the app's own levels
 * and execution rules, then decide its trust status by the pre-registered
 * rules in reports/setup-trust-rules.md. Pure functions only.
 */
import { PriceBar } from '../corporateActions';
import { calculateMaxBreakoutEntry } from '../executionIntegrity';
import { SetupLevels } from '../setupLevels';
import { OutcomeStats, progressTrade, TradeLabel } from './fivePercentStudy';

/**
 * v2 (trust rules v2): trigger is confirmed at the close and filled at the
 * next open. v1 confirmed volume with the session's final volume, which an
 * intraday buyer cannot know; that look-ahead created the v1 'On trial' results.
 */
export const EVIDENCE_METHOD_VERSION = 'setup-evidence-v2';

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

/**
 * How the trigger is confirmed:
 * - FULL_DAY_VOLUME (pre-registered default): the session's high reaches entry
 *   and the session's total volume is >= 1.5x. Uses the day's final volume,
 *   which an intraday buyer does not yet know: optimistic.
 * - PRICE_ONLY: buy when price reaches entry, no volume check. No look-ahead.
 * - CLOSE_CONFIRMED_NEXT_OPEN: the session closes above entry on >= 1.5x
 *   volume; buy at the next session's open. Known at the close. No look-ahead.
 */
export type TriggerMode = 'FULL_DAY_VOLUME' | 'PRICE_ONLY' | 'CLOSE_CONFIRMED_NEXT_OPEN';

/** Trigger that decides trust status (trust rules v2). */
export const EVIDENCE_TRIGGER_MODE: TriggerMode = 'CLOSE_CONFIRMED_NEXT_OPEN';

export type ScannerTradeResult =
    | { kind: 'TRADE'; trade: ScannerTrade }
    | { kind: 'NOT_TRIGGERED' | 'SKIPPED_CHASE' | 'INSUFFICIENT_DATA' };

/**
 * Progress of one scanner signal given the bars known so far. Used both by
 * the historical replay and by live paper tracking, so both apply exactly
 * the same rules:
 * - plan valid for 10 sessions after the signal;
 * - trigger per TriggerMode (see above);
 * - no trade if the triggering session opens above the app's maximum entry;
 * - fill at entry, or at the open if it gapped above entry within the cap;
 * - then stop / target / 10-session time exit (conservative ordering).
 */
export type SignalProgress =
    | { state: 'PENDING' }
    | { state: 'NOT_TRIGGERED' | 'SKIPPED_CHASE' }
    | { state: 'OPEN'; fillIndex: number; fill: number }
    | { state: 'CLOSED'; trade: ScannerTrade; goalResolved: boolean };

export function advanceScannerSignal(bars: PriceBar[], signalIndex: number, levels: SetupLevels, atr14: number, mode: TriggerMode): SignalProgress {
    const { entryPrice, stopLoss, targetPrice } = levels;
    const maxEntry = calculateMaxBreakoutEntry(entryPrice, atr14);
    const lastPlanIndex = signalIndex + EVIDENCE_RULES.planSessions;
    const lastKnown = Math.min(lastPlanIndex, bars.length - 1);
    for (let index = signalIndex + 1; index <= lastKnown; index += 1) {
        const bar = bars[index];
        if (bar.high < entryPrice) continue;
        if (bar.open > maxEntry) return { state: 'SKIPPED_CHASE' };
        const prior = bars.slice(Math.max(0, index - 20), index);
        const averageVolume = prior.reduce((sum, item) => sum + item.volume, 0) / Math.max(prior.length, 1);
        const volumeConfirmed = averageVolume > 0 && bar.volume >= EVIDENCE_RULES.triggerVolumeRatio * averageVolume;
        let fillIndex = index;
        let fill = Math.max(entryPrice, bar.open);
        if (mode === 'FULL_DAY_VOLUME' && !volumeConfirmed) continue;
        if (mode === 'CLOSE_CONFIRMED_NEXT_OPEN') {
            if (!volumeConfirmed || bar.close < entryPrice) continue;
            fillIndex = index + 1;
            if (fillIndex >= bars.length) return { state: 'PENDING' };
            fill = bars[fillIndex].open;
            if (fill > maxEntry) return { state: 'SKIPPED_CHASE' };
        }
        if (!(fill > stopLoss) || !(targetPrice > fill)) return { state: 'SKIPPED_CHASE' };
        const stopPct = ((fill - stopLoss) / fill) * 100;
        const targetPct = ((targetPrice - fill) / fill) * 100;
        const label = progressTrade(bars, fillIndex, fill, stopPct, targetPct, EVIDENCE_RULES.holdSessions, EVIDENCE_RULES.costBps);
        if (!label) return { state: 'OPEN', fillIndex, fill };
        const goal = progressTrade(bars, fillIndex, fill, stopPct, EVIDENCE_RULES.goalPct, EVIDENCE_RULES.holdSessions, EVIDENCE_RULES.costBps);
        return {
            state: 'CLOSED',
            goalResolved: !!goal,
            trade: { label, fillIndex, fill, reachedGoalFirst: goal?.outcome === 'TARGET' },
        };
    }
    return lastKnown < lastPlanIndex ? { state: 'PENDING' } : { state: 'NOT_TRIGGERED' };
}

/**
 * Historical replay of one signal. Requires the full plan window and the full
 * holding window to exist (pre-registered method), otherwise INSUFFICIENT_DATA.
 */
export function replayScannerSignal(bars: PriceBar[], signalIndex: number, levels: SetupLevels, atr14: number, mode: TriggerMode = EVIDENCE_TRIGGER_MODE): ScannerTradeResult {
    if (signalIndex + EVIDENCE_RULES.planSessions >= bars.length) return { kind: 'INSUFFICIENT_DATA' };
    const progress = advanceScannerSignal(bars, signalIndex, levels, atr14, mode);
    if (progress.state === 'NOT_TRIGGERED' || progress.state === 'SKIPPED_CHASE') return { kind: progress.state };
    if (progress.state !== 'CLOSED') return { kind: 'INSUFFICIENT_DATA' };
    if (progress.trade.fillIndex + EVIDENCE_RULES.holdSessions - 1 >= bars.length) return { kind: 'INSUFFICIENT_DATA' };
    return { kind: 'TRADE', trade: progress.trade };
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
    /** Average net R of the most recent 30 live trades, once 30 exist. */
    recentLiveAvgNetR?: number | null;
}): StatusDecision {
    const { test, testYears, liveTrades, recentLiveAvgNetR } = params;
    const positiveYears = testYears.filter(item => item.stats.n > 0 && item.stats.avgNetR > 0).length;
    const failures: string[] = [];
    if (test.n < EVIDENCE_RULES.minTestTrades) failures.push(`Only ${test.n} test trades (needs ${EVIDENCE_RULES.minTestTrades})`);
    if (!(test.avgNetR > 0)) failures.push(`Average result ${test.avgNetR.toFixed(2)}R is not positive`);
    if (!(test.avgNetR - test.ciNetR > 0)) failures.push('95% range includes zero or below');
    if (positiveYears < EVIDENCE_RULES.minPositiveTestYears) failures.push(`Positive in ${positiveYears} of ${testYears.length} test years (needs ${EVIDENCE_RULES.minPositiveTestYears})`);
    if (failures.length) return { status: 'RESEARCH_ONLY', reasons: failures };
    if (recentLiveAvgNetR != null && recentLiveAvgNetR <= 0) {
        return {
            status: 'RESEARCH_ONLY',
            reasons: [`Demoted: the most recent ${EVIDENCE_RULES.trustedMinLiveTrades} live paper trades averaged ${recentLiveAvgNetR.toFixed(2)}R`],
        };
    }
    if (liveTrades && liveTrades.n >= EVIDENCE_RULES.trustedMinLiveTrades && liveTrades.avgNetR > 0) {
        return { status: 'TRUSTED', reasons: [`Passed the test period and ${liveTrades.n} live paper trades averaging ${liveTrades.avgNetR.toFixed(2)}R`] };
    }
    return {
        status: 'ON_TRIAL',
        reasons: [`Passed the test period; ${liveTrades?.n ?? 0} of ${EVIDENCE_RULES.trustedMinLiveTrades} live paper trades recorded`],
    };
}
