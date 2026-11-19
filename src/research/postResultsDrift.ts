/**
 * Post-results drift study (reports/post-results-drift-plan.md). Pure helpers;
 * the signal at E+1 uses bars up to E+1 only; entry is the open of E+2.
 */
import { PriceBar } from '../corporateActions';
import { simulateFrom, TradeLabel } from './fivePercentStudy';
import { SeriesIndicators } from './momentumPullback';

export const PRD_RULES = {
    minAbnormalReactionPct: 5,
    volumeMultiple: 2,
    volumeLookback: 20,
    minAtrPct: 1,
    maxAtrPct: 6,
    maxGapUpPct: 3,
    stopAtr: 1.5,
    targetR: 2,
    horizon: 15,
    costBps: 40,
} as const;

/** First session on or after the meeting date (E). */
export function eventIndex(dates: string[], meetingDate: string): number {
    let low = 0;
    let high = dates.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (dates[mid] < meetingDate) low = mid + 1; else high = mid;
    }
    return low < dates.length ? low : -1;
}

export interface ResultsSignal {
    /** All plan rules except the variant-specific trend rule. */
    passes: boolean;
    /** Close before E was above its 50-day average (variant D2). */
    aboveSma50BeforeEvent: boolean;
    abnormalReactionPct: number;
    atrPct: number;
    reasons: string[];
}

/**
 * Evaluate the signal at the close of E+1. niftyClose maps dates to NIFTY 50
 * closes; the reaction window is close(E-1) → close(E+1).
 */
export function assessResultsSignal(bars: PriceBar[], ind: SeriesIndicators, e: number, niftyClose: Map<string, number>): ResultsSignal | null {
    const s = e + 1;
    if (e < Math.max(PRD_RULES.volumeLookback, 50) + 1 || s >= bars.length) return null;
    const before = bars[e - 1];
    const niftyBefore = niftyClose.get(before.date);
    const niftyAfter = niftyClose.get(bars[s].date);
    if (!niftyBefore || !niftyAfter || !(before.close > 0)) return null;
    const stockReturn = (bars[s].close / before.close - 1) * 100;
    const abnormalReactionPct = stockReturn - (niftyAfter / niftyBefore - 1) * 100;
    const prior = bars.slice(e - PRD_RULES.volumeLookback, e);
    const averageVolume = prior.reduce((sum, bar) => sum + bar.volume, 0) / prior.length;
    const volumeOk = averageVolume > 0 && Math.max(bars[e].volume, bars[s].volume) >= PRD_RULES.volumeMultiple * averageVolume;
    const range = bars[s].high - bars[s].low;
    const heldClose = range <= 0 || bars[s].close >= bars[s].low + range / 2;
    const atrPct = (ind.atr14[s] / bars[s].close) * 100;
    const atrOk = atrPct >= PRD_RULES.minAtrPct && atrPct <= PRD_RULES.maxAtrPct;
    const reasons: string[] = [];
    if (!(abnormalReactionPct >= PRD_RULES.minAbnormalReactionPct)) reasons.push('reaction');
    if (!volumeOk) reasons.push('volume');
    if (!heldClose) reasons.push('close');
    if (!atrOk) reasons.push('atr');
    return {
        passes: reasons.length === 0,
        aboveSma50BeforeEvent: before.close > ind.sma50[e - 1],
        abnormalReactionPct,
        atrPct,
        reasons,
    };
}

/** Trade from the open of E+2. Null if it gaps more than 3% above the E+1 close or the horizon is incomplete. */
export function resultsTrade(bars: PriceBar[], e: number, atrPct: number, horizon: number = PRD_RULES.horizon): TradeLabel | null {
    const entryIndex = e + 2;
    if (entryIndex >= bars.length) return null;
    const entry = bars[entryIndex].open;
    if (!(entry > 0) || entry > bars[e + 1].close * (1 + PRD_RULES.maxGapUpPct / 100)) return null;
    const stopPct = PRD_RULES.stopAtr * atrPct;
    return simulateFrom(bars, entryIndex, entry, stopPct, PRD_RULES.targetR * stopPct, horizon, PRD_RULES.costBps);
}
