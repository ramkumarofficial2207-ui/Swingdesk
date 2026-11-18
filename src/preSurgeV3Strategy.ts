import { calculateMaxBreakoutEntry } from './executionIntegrity';
import { Candle, PreSurgeV3Plan, StockIndicators } from './types';

export const PRE_SURGE_V3_VERSION = 'PRE_SURGE_V3' as const;
export const PRE_SURGE_V3_SHADOW_VERSION = 'PRE_SURGE_V3_SHADOW' as const;

const MIN_BASE_SESSIONS = 8;
const MAX_BASE_SESSIONS = 20;
const MAX_BASE_RANGE_PCT = 8;
// A 3% hard stop excluded nearly every otherwise valid NSE swing base. V3
// permits up to 4.5%, while the 0.75%-of-capital risk budget automatically
// reduces position size as structural risk widens.
const MAX_EARLY_RISK_PCT = 4.5;
const MIN_RVOL = 1.5;

export interface PreSurgeV3Inputs {
    indicator: StockIndicators;
    atr14: number;
    breakoutPrice: number;
    sectorOutperforming: boolean;
    sectorRs20d?: number | null;
    marketRegime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    shadow?: boolean;
}

export interface V3PriceBar {
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface V3EarlyConfirmationInput {
    plan: PreSurgeV3Plan;
    zoneTouched: boolean;
    openingGapPct: number;
    vwap: number;
    latest5m: V3PriceBar;
    previous5m?: V3PriceBar | null;
    latest15m?: V3PriceBar | null;
    marketSafe: boolean;
}

export interface V3BreakoutConfirmationInput {
    plan: PreSurgeV3Plan;
    observedPrice: number;
    observedRvol: number;
    vwap: number;
    latest15m: V3PriceBar;
    marketSafe: boolean;
}

export interface V3ConfirmationDecision {
    confirmed: boolean;
    score: number;
    reasons: string[];
    rejectionReasons: string[];
}

function round(value: number): number {
    return +value.toFixed(2);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function trueRange(current: Candle, previous?: Candle): number {
    if (!previous) return current.high - current.low;
    return Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
    );
}

function emaSeries(values: number[], period: number): number[] {
    if (!values.length) return [];
    const multiplier = 2 / (period + 1);
    let current = average(values.slice(0, Math.min(period, values.length)));
    return values.map((value, index) => {
        if (index < period - 1) return current;
        current = ((value - current) * multiplier) + current;
        return current;
    });
}

function findStableBase(candles: Candle[]): { sessions: number; rangePct: number; baseLow: number } {
    for (let sessions = Math.min(MAX_BASE_SESSIONS, candles.length); sessions >= MIN_BASE_SESSIONS; sessions -= 1) {
        const window = candles.slice(-sessions);
        const high = Math.max(...window.map(candle => candle.high));
        const low = Math.min(...window.map(candle => candle.low));
        const rangePct = low > 0 ? ((high - low) / low) * 100 : 99;
        if (rangePct <= MAX_BASE_RANGE_PCT) return { sessions, rangePct, baseLow: low };
    }
    const fallback = candles.slice(-MIN_BASE_SESSIONS);
    const high = Math.max(...fallback.map(candle => candle.high));
    const low = Math.min(...fallback.map(candle => candle.low));
    return { sessions: 0, rangePct: low > 0 ? ((high - low) / low) * 100 : 99, baseLow: low };
}

function closeLocation(bar: V3PriceBar): number {
    const range = bar.high - bar.low;
    return range > 0 ? clamp((bar.close - bar.low) / range, 0, 1) : 0.5;
}

export function assessPreSurgeV3(inputs: PreSurgeV3Inputs): PreSurgeV3Plan {
    const { indicator, atr14, breakoutPrice } = inputs;
    const candles = indicator.candles;
    const latest = candles[candles.length - 1];
    const closes = candles.map(candle => candle.close);
    const ema20Values = emaSeries(closes, 20);
    const ema20Now = ema20Values[ema20Values.length - 1] ?? indicator.ema20;
    const ema20Prior = ema20Values[Math.max(0, ema20Values.length - 6)] ?? ema20Now;
    const ema20SlopePct = ema20Prior > 0 ? ((ema20Now - ema20Prior) / ema20Prior) * 100 : 0;
    const base = findStableBase(candles);
    const recentRanges = candles.slice(-5).map((candle, index, values) => trueRange(candle, values[index - 1]));
    const priorSlice = candles.slice(-15, -5);
    const priorRanges = priorSlice.map((candle, index, values) => trueRange(candle, values[index - 1]));
    const atrContractionRatio = average(recentRanges) / Math.max(average(priorRanges), 0.01);
    const latestLows = candles.slice(-3).map(candle => candle.low);
    const previousLows = candles.slice(-6, -3).map(candle => candle.low);
    const higherLows = Math.min(...latestLows) >= Math.min(...previousLows) * 0.995;
    const distributionDays = candles.slice(-10).filter(candle => (
        candle.close < candle.open && candle.volume > indicator.avgVolume20d * 1.1
    )).length;
    const relativeStrength = indicator.returns3m - indicator.nifty3mReturn;
    const trendAligned = indicator.ema20 > indicator.ema50 && indicator.ema50 > indicator.dma200;
    // A flat consolidation can finish slightly below its close five sessions
    // ago while its intermediate trend remains intact. EMA20 slope plus price
    // acceptance near EMA20 is a cleaner point-in-time weekly-trend proxy.
    const weeklyTrendBullish = latest.close >= indicator.ema20 * 0.985 && ema20SlopePct > 0;
    const volumeContracted = indicator.volumeRatio >= 0.4 && indicator.volumeRatio <= 0.8;
    const supertrendEstablished = indicator.supertrendBullish && (indicator.supertrendBullishDays ?? 0) >= 3;
    const accumulationHealthy = (indicator.accumulationScore ?? 0) >= 55;
    const marketSafe = inputs.marketRegime !== 'RISK_OFF';

    const lowerReference = Math.min(latest.close, indicator.ema20);
    const upperReference = Math.max(latest.close, indicator.ema20);
    const zoneLow = round(Math.max(indicator.supertrend, lowerReference - (0.15 * atr14)));
    const zoneHigh = round(Math.max(zoneLow, Math.min(breakoutPrice * 0.975, upperReference + (0.15 * atr14))));
    const earlyMaxEntry = round(Math.min(breakoutPrice * 0.99, zoneHigh + (0.35 * atr14)));
    const structuralStop = round(Math.min(base.baseLow, indicator.supertrend, indicator.ema20 - (0.5 * atr14)) * 0.995);
    const earlyRiskPct = zoneHigh > 0 ? ((zoneHigh - structuralStop) / zoneHigh) * 100 : 99;
    const riskPerShare = breakoutPrice - structuralStop;
    const partialTarget = round(breakoutPrice + (2 * riskPerShare));
    const finalTarget = round(breakoutPrice + (3.5 * riskPerShare));
    const breakoutRiskPct = breakoutPrice > 0 ? (riskPerShare / breakoutPrice) * 100 : 99;
    const riskBudgetPct = 0.75;
    const maximumPositionPct = 20;
    const suggestedPositionPct = round(Math.min(maximumPositionPct, riskBudgetPct / Math.max(breakoutRiskPct, 0.01) * 100));

    let score = 0;
    const reasons: string[] = [];
    const rejectionReasons: string[] = [];
    const award = (condition: boolean, points: number, reason: string, rejection?: string) => {
        if (condition) {
            score += points;
            reasons.push(reason);
        } else if (rejection) rejectionReasons.push(rejection);
    };
    award(base.sessions >= MIN_BASE_SESSIONS, 15, `${base.sessions}-session base`, 'Base is shorter than 8 sessions or wider than 8%');
    award(atrContractionRatio <= 0.85, 10, `ATR contraction ${atrContractionRatio.toFixed(2)}x`, 'Short-term range is not contracting');
    award(higherLows, 8, 'Higher lows forming', 'No confirmed higher-low structure');
    award(distributionDays <= 1, 8, `${distributionDays} distribution day`, 'More than one distribution day in the last 10 sessions');
    award(trendAligned && weeklyTrendBullish, 15, 'Daily and weekly trend aligned', 'EMA/weekly trend is not rising');
    award(supertrendEstablished, 10, `Supertrend established for ${indicator.supertrendBullishDays ?? 0} sessions`, 'Supertrend has not held for 3 sessions');
    award(volumeContracted, 10, `Volume contraction ${indicator.volumeRatio.toFixed(2)}x`, 'Volume must contract into the 0.4-0.8x range');
    award(relativeStrength >= 5, 8, `RS +${relativeStrength.toFixed(1)}% vs Nifty`, 'Relative strength is below +5% versus Nifty');
    award(inputs.sectorOutperforming, 6, `Sector outperforming${inputs.sectorRs20d != null ? ` (${inputs.sectorRs20d.toFixed(1)}%)` : ''}`, 'Sector is not outperforming Nifty');
    award(accumulationHealthy, 5, `Accumulation ${(indicator.accumulationScore ?? 0).toFixed(0)}/100`, 'Accumulation score is below 55');
    award(marketSafe, 5, 'Market regime permits new risk', 'Market regime is risk-off');
    award(earlyRiskPct > 0 && earlyRiskPct <= MAX_EARLY_RISK_PCT, 5, `Structural risk ${earlyRiskPct.toFixed(1)}%`, `Structural stop requires more than ${MAX_EARLY_RISK_PCT}% risk`);
    score = +clamp(score, 0, 100).toFixed(1);

    const eligible =
        score >= 75 &&
        base.sessions >= MIN_BASE_SESSIONS &&
        trendAligned && weeklyTrendBullish &&
        supertrendEstablished &&
        relativeStrength >= 5 &&
        inputs.sectorOutperforming &&
        marketSafe &&
        earlyRiskPct > 0 && earlyRiskPct <= MAX_EARLY_RISK_PCT &&
        structuralStop > 0 && structuralStop < zoneLow &&
        zoneHigh < breakoutPrice;

    return {
        version: PRE_SURGE_V3_VERSION,
        shadow: inputs.shadow !== false,
        eligible,
        score,
        status: eligible ? 'V3_READY' : 'V3_REJECTED',
        base: {
            sessions: base.sessions,
            rangePct: +base.rangePct.toFixed(2),
            atrContractionRatio: +atrContractionRatio.toFixed(2),
            higherLows,
            distributionDays,
        },
        earlyEntry: {
            zoneLow,
            zoneHigh,
            maxEntry: earlyMaxEntry,
            structuralStop,
            riskPct: +earlyRiskPct.toFixed(2),
            allocationPct: 20,
            requireZoneTouch: true,
            requireFiveMinuteReclaim: true,
            requireHigherLow: true,
            requireVwap: true,
            maximumGapDownPct: -1.5,
            maximumGapUpPct: 1.5,
        },
        breakout: {
            pivot: round(breakoutPrice),
            maxEntry: calculateMaxBreakoutEntry(breakoutPrice, atr14),
            structuralStop,
            minimumRvol: MIN_RVOL,
            confirmationTimeframeMinutes: 15,
            minimumCloseLocation: 0.75,
            requireVwap: true,
            allocationPct: 80,
        },
        exits: {
            partialTarget,
            partialAtR: 2,
            partialExitPct: 50,
            finalTarget,
            finalAtR: 3.5,
            moveStopToBreakeven: true,
            trailingMethod: 'EMA10_OR_SUPERTREND',
        },
        positionSizing: { riskBudgetPct, maximumPositionPct, suggestedPositionPct },
        reasons,
        rejectionReasons,
    };
}

export function assessV3EarlyConfirmation(input: V3EarlyConfirmationInput): V3ConfirmationDecision {
    const closeLocationValue = closeLocation(input.latest5m);
    const higherLow = Boolean(input.previous5m && input.latest5m.low >= input.previous5m.low * 0.998);
    const reclaimed = input.latest5m.close >= Math.max(input.vwap, input.plan.earlyEntry.zoneHigh);
    const entryNotChased = input.latest5m.close <= input.plan.earlyEntry.maxEntry;
    const remainsPreBreakout = input.latest5m.close < input.plan.breakout.pivot;
    const fifteenMinuteSupport = !input.latest15m || input.latest15m.close >= input.vwap;
    const checks: Array<[boolean, string, string]> = [
        [input.plan.eligible, 'V3 qualification passed', 'V3 EOD qualification failed'],
        [input.zoneTouched, 'Early zone touched before reclaim', 'Early zone has not been touched'],
        [input.openingGapPct >= input.plan.earlyEntry.maximumGapDownPct, 'Opening gap accepted', 'Opening gap-down exceeds limit'],
        [input.openingGapPct <= input.plan.earlyEntry.maximumGapUpPct, 'Opening gap-up accepted', 'Opening gap-up exceeds early-entry limit'],
        [input.marketSafe, 'Market regime permits risk', 'Market regime is unsafe'],
        [reclaimed, 'Five-minute VWAP/zone reclaim', 'No five-minute VWAP/zone reclaim'],
        [entryNotChased, 'Entry remains below Early maximum', 'Early confirmation exceeded maximum entry'],
        [remainsPreBreakout, 'Entry remains below breakout pivot', 'Early confirmation arrived after the breakout pivot'],
        [higherLow, 'Five-minute higher low', 'No five-minute higher low'],
        [closeLocationValue >= 0.7, 'Five-minute close in upper 30%', 'Five-minute close is not in upper 30%'],
        [fifteenMinuteSupport, '15-minute price holds VWAP', '15-minute close is below VWAP'],
    ];
    const reasons = checks.filter(([passed]) => passed).map(([, reason]) => reason);
    const rejectionReasons = checks.filter(([passed]) => !passed).map(([, , rejection]) => rejection);
    return {
        confirmed: rejectionReasons.length === 0,
        score: +(reasons.length / checks.length * 100).toFixed(1),
        reasons,
        rejectionReasons,
    };
}

export function assessV3BreakoutConfirmation(input: V3BreakoutConfirmationInput): V3ConfirmationDecision {
    const location = closeLocation(input.latest15m);
    const checks: Array<[boolean, string, string]> = [
        [input.plan.eligible, 'V3 qualification passed', 'V3 EOD qualification failed'],
        [input.marketSafe, 'Market regime permits risk', 'Market regime is unsafe'],
        [input.latest15m.close > input.plan.breakout.pivot, '15-minute close above pivot', '15-minute candle did not close above pivot'],
        [input.observedRvol >= input.plan.breakout.minimumRvol, `RVOL ${input.observedRvol.toFixed(2)}x`, 'Same-time RVOL is below 1.5x'],
        [input.latest15m.close >= input.vwap, '15-minute close above VWAP', '15-minute close is below VWAP'],
        [location >= input.plan.breakout.minimumCloseLocation, '15-minute close in upper 25%', '15-minute close is not in upper 25%'],
        [input.observedPrice <= input.plan.breakout.maxEntry, 'Entry below maximum price', 'Price exceeded maximum entry'],
    ];
    const reasons = checks.filter(([passed]) => passed).map(([, reason]) => reason);
    const rejectionReasons = checks.filter(([passed]) => !passed).map(([, , rejection]) => rejection);
    return {
        confirmed: rejectionReasons.length === 0,
        score: +(reasons.length / checks.length * 100).toFixed(1),
        reasons,
        rejectionReasons,
    };
}
