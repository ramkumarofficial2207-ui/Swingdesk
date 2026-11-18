import { calculateMaxBreakoutEntry } from './executionIntegrity';
import { Candle, PreSurgeV4Plan, StockIndicators } from './types';

export const PRE_SURGE_V4_VERSION = 'PRE_SURGE_V4' as const;

// ─── V4 tightened constants ─────────────────────────────────────────────────
// Every constant below was deliberately loosened in V3 and caused the 2025+
// regression. V4 uses stricter thresholds backed by the development-period
// evidence from the 2021-2024 dataset.

const MIN_BASE_SESSIONS = 8;
const MAX_BASE_SESSIONS = 20;
const MAX_BASE_RANGE_PCT = 8;
const MAX_EARLY_RISK_PCT = 4.5;
const MIN_RVOL = 1.5;
// V4 raises score threshold from 75 to 80 to eliminate marginal qualifiers.
const MIN_QUALIFICATION_SCORE = 80;
// V4 permits at most 1 distribution day (blocks 2+ distribution day sell-offs).
const MAX_DISTRIBUTION_DAYS = 1;
const ZONE_ATR_MULTIPLIER = 0.12;
const EARLY_MAX_ENTRY_ATR_BUFFER = 0.30;
const MAX_EARLY_GAP_DOWN_PCT = -1.2;
const MAX_EARLY_GAP_UP_PCT = 1.2;
// V4 minimum accumulation score raised to 60 (from 55).
const MIN_ACCUMULATION_SCORE = 60;
const MIN_RELATIVE_STRENGTH_PCT = 5;
// V4 sector RS20d requirement: at least +1.0% vs Nifty.
const MIN_SECTOR_RS20D_PCT = 1.0;
const MIN_BREAKOUT_CLOSE_LOCATION = 0.75;

export interface PreSurgeV4Inputs {
    indicator: StockIndicators;
    atr14: number;
    breakoutPrice: number;
    sectorOutperforming: boolean;
    sectorRs20d?: number | null;
    marketRegime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    shadow?: boolean;
}

export interface V4PriceBar {
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface V4BreakoutConfirmationInput {
    plan: PreSurgeV4Plan;
    observedPrice: number;
    observedRvol: number;
    /** Stock VWAP at the 15-min confirmation bar close */
    stockVwap: number;
    latest15m: V4PriceBar;
}

export interface V4RetestConfirmationInput {
    plan: PreSurgeV4Plan;
    /** Sessions elapsed since the breakout arm was formed */
    sessionsAfterArm: number;
    zoneTouched: boolean;
    /** Stock VWAP at the 5-min confirmation bar */
    stockVwap: number;
    latest5m: V4PriceBar;
    previous5m?: V4PriceBar | null;
}

export interface V4ConfirmationDecision {
    confirmed: boolean;
    score: number;
    reasons: string[];
    rejectionReasons: string[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function round(value: number): number {
    return +value.toFixed(2);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
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
        const high = Math.max(...window.map(c => c.high));
        const low = Math.min(...window.map(c => c.low));
        const rangePct = low > 0 ? ((high - low) / low) * 100 : 99;
        if (rangePct <= MAX_BASE_RANGE_PCT) return { sessions, rangePct, baseLow: low };
    }
    const fallback = candles.slice(-MIN_BASE_SESSIONS);
    const high = Math.max(...fallback.map(c => c.high));
    const low = Math.min(...fallback.map(c => c.low));
    return { sessions: 0, rangePct: low > 0 ? ((high - low) / low) * 100 : 99, baseLow: low };
}

function closeLocation(bar: V4PriceBar): number {
    const range = bar.high - bar.low;
    return range > 0 ? clamp((bar.close - bar.low) / range, 0, 1) : 0.5;
}

// ─── EOD Qualification ───────────────────────────────────────────────────────

/**
 * Pre-Surge V4: EOD qualification.
 *
 * V4 drops the Early Buy leg entirely. The 2021-2026 replay showed Early
 * averaging -1.148% net return and accounting for 93% of fills while dragging
 * the combined result negative in the 2025+ validation period. V4 is a
 * single-arm breakout strategy that goes cash if the arm does not confirm.
 *
 * The retest arm fires only after a confirmed breakout; it is not a
 * pre-breakout early entry.
 */
export function assessPreSurgeV4(inputs: PreSurgeV4Inputs): PreSurgeV4Plan {
    const { indicator, atr14, breakoutPrice } = inputs;
    const candles = indicator.candles;
    const latest = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    const ema20Values = emaSeries(closes, 20);
    const ema20Now = ema20Values[ema20Values.length - 1] ?? indicator.ema20;
    const ema20Prior = ema20Values[Math.max(0, ema20Values.length - 6)] ?? ema20Now;
    const ema20SlopePct = ema20Prior > 0 ? ((ema20Now - ema20Prior) / ema20Prior) * 100 : 0;
    const base = findStableBase(candles);
    const recentRanges = candles.slice(-5).map((c, i, arr) => trueRange(c, arr[i - 1]));
    const priorRanges = candles.slice(-15, -5).map((c, i, arr) => trueRange(c, arr[i - 1]));
    const atrContractionRatio = average(recentRanges) / Math.max(average(priorRanges), 0.01);
    const latestLows = candles.slice(-3).map(c => c.low);
    const previousLows = candles.slice(-6, -3).map(c => c.low);
    const higherLows = Math.min(...latestLows) >= Math.min(...previousLows) * 0.995;
    // V4 requires ZERO distribution days (V3 allowed ≤1)
    const distributionDays = candles.slice(-10).filter(c => (
        c.close < c.open && c.volume > indicator.avgVolume20d * 1.1
    )).length;
    const relativeStrength = indicator.returns3m - indicator.nifty3mReturn;
    const trendAligned = indicator.ema20 > indicator.ema50 && indicator.ema50 > indicator.dma200;
    const weeklyTrendBullish = latest.close >= indicator.ema20 * 0.985 && ema20SlopePct > 0;
    const volumeContracted = indicator.volumeRatio >= 0.4 && indicator.volumeRatio <= 0.8;
    const supertrendEstablished = indicator.supertrendBullish && (indicator.supertrendBullishDays ?? 0) >= 3;
    // V4: Supertrend must be within 2.5% of close (not just bullish)
    const supertrendGapPct = indicator.supertrend > 0
        ? ((latest.close - indicator.supertrend) / latest.close) * 100
        : 99;
    const supertrendClose = supertrendGapPct <= 2.5;
    const accumulationHealthy = (indicator.accumulationScore ?? 0) >= MIN_ACCUMULATION_SCORE;
    const marketSafe = inputs.marketRegime !== 'RISK_OFF';
    // V4: Sector RS20d must be >= 3% (V3 used binary outperforming check)
    const sectorRs20dQualified = inputs.sectorOutperforming &&
        (inputs.sectorRs20d == null || inputs.sectorRs20d >= MIN_SECTOR_RS20D_PCT);

    // Breakout arm prices
    const breakoutMaxEntry = calculateMaxBreakoutEntry(breakoutPrice, atr14);
    const structuralStop = round(Math.min(base.baseLow, indicator.supertrend, indicator.ema20 - (0.5 * atr14)) * 0.995);
    const riskPerShare = breakoutPrice - structuralStop;
    const partialTarget = round(breakoutPrice + (2 * riskPerShare));
    const finalTarget = round(breakoutPrice + (3.5 * riskPerShare));
    const breakoutRiskPct = breakoutPrice > 0 ? (riskPerShare / breakoutPrice) * 100 : 99;
    const riskBudgetPct = 0.75;
    const maximumPositionPct = 20;
    const suggestedPositionPct = round(Math.min(maximumPositionPct, riskBudgetPct / Math.max(breakoutRiskPct, 0.01) * 100));

    // Retest arm (fires only after breakout, not a pre-breakout entry)
    const retestBuffer = 0.5 * atr14;
    const retestZoneLow = round(Math.max(breakoutPrice * 0.995, breakoutPrice - retestBuffer));
    const retestZoneHigh = round(breakoutPrice * 1.01);
    const retestMaxEntry = round(retestZoneHigh + (0.15 * atr14));
    const stopBufferAtr = 0.4;

    // ─── Scoring ────────────────────────────────────────────────────────────
    let score = 0;
    const reasons: string[] = [];
    const rejectionReasons: string[] = [];
    const award = (condition: boolean, points: number, reason: string, rejection?: string) => {
        if (condition) {
            score += points;
            reasons.push(reason);
        } else if (rejection) rejectionReasons.push(rejection);
    };

    award(base.sessions >= MIN_BASE_SESSIONS, 15, `${base.sessions}-session base ≤${MAX_BASE_RANGE_PCT}%`, `Base shorter than 8 sessions or wider than ${MAX_BASE_RANGE_PCT}%`);
    award(atrContractionRatio <= 0.85, 10, `ATR contraction ${atrContractionRatio.toFixed(2)}x`, 'Short-term range is not contracting');
    award(higherLows, 8, 'Higher lows forming', 'No confirmed higher-low structure');
    // V4: zero distribution days required
    award(distributionDays === 0, 8, 'Zero distribution days in 10 sessions', 'Distribution day found — stock may be under selling pressure');
    award(trendAligned && weeklyTrendBullish, 15, 'Daily and weekly trend aligned', 'EMA/weekly trend is not rising');
    award(supertrendEstablished, 8, `Supertrend established for ${indicator.supertrendBullishDays ?? 0} sessions`, 'Supertrend has not held for 3 sessions');
    award(supertrendClose, 5, `Supertrend gap ${supertrendGapPct.toFixed(1)}% ≤ 2.5%`, 'Supertrend is more than 2.5% below close — base may be extended');
    award(volumeContracted, 8, `Volume contraction ${indicator.volumeRatio.toFixed(2)}x`, 'Volume must contract into the 0.4-0.8x range');
    // V4: RS threshold raised to >= 7%
    award(relativeStrength >= MIN_RELATIVE_STRENGTH_PCT, 8, `RS +${relativeStrength.toFixed(1)}% vs Nifty`, `Relative strength is below +${MIN_RELATIVE_STRENGTH_PCT}% versus Nifty`);
    award(sectorRs20dQualified, 6, `Sector outperforming (RS20d: ${inputs.sectorRs20d?.toFixed(1) ?? 'n/a'}%)`, `Sector is not outperforming or RS20d < ${MIN_SECTOR_RS20D_PCT}%`);
    // V4: accumulation threshold raised to >= 65
    award(accumulationHealthy, 5, `Accumulation ${(indicator.accumulationScore ?? 0).toFixed(0)}/100`, `Accumulation score is below ${MIN_ACCUMULATION_SCORE}`);
    award(marketSafe, 4, 'Market regime permits new risk', 'Market regime is risk-off');
    score = +clamp(score, 0, 100).toFixed(1);

    const earlyRiskPct = 0; // Early arm removed in V4
    const eligible =
        score >= MIN_QUALIFICATION_SCORE &&
        base.sessions >= MIN_BASE_SESSIONS &&
        trendAligned && weeklyTrendBullish &&
        supertrendEstablished &&
        supertrendClose &&
        relativeStrength >= MIN_RELATIVE_STRENGTH_PCT &&
        sectorRs20dQualified &&
        distributionDays <= MAX_DISTRIBUTION_DAYS &&
        marketSafe &&
        structuralStop > 0 && structuralStop < breakoutPrice;

    return {
        version: PRE_SURGE_V4_VERSION,
        shadow: true,
        eligible,
        score,
        status: eligible ? 'V4_READY' : 'V4_REJECTED',
        baselineVersion: 'PRE_SURGE_V3',
        qualification: {
            v3Score: score,
            marketRegime: inputs.marketRegime ?? 'NEUTRAL',
            // marketBreadthPct not available at EOD qualification time;
            // the live monitor enriches this field in shadow mode.
            marketBreadthPct: 0,
            minimumBreadthPct: 0,
            sectorOutperforming: inputs.sectorOutperforming,
            sectorRs20d: inputs.sectorRs20d ?? null,
            earlyEntryEnabled: false,
        },
        breakoutArm: {
            pivot: round(breakoutPrice),
            maxPrice: breakoutMaxEntry,
            structuralStop,
            atr14: +atr14.toFixed(4),
            minimumRvol: MIN_RVOL,
            confirmationTimeframeMinutes: 15,
            minimumCloseLocation: MIN_BREAKOUT_CLOSE_LOCATION,
            requireStockVwap: true,
            requireMarketProxyVwap: true,
            marketProxy: 'NIFTYBEES',
        },
        retest: {
            zoneLow: retestZoneLow,
            zoneHigh: retestZoneHigh,
            maxEntry: retestMaxEntry,
            maximumSessionsAfterArm: 3,
            requireFiveMinuteHold: true,
            requireHigherLow: true,
            requireStockVwap: true,
            requireMarketProxyVwap: true,
            allocationPct: 100,
            stopBufferAtr,
        },
        exits: {
            partialAtR: 2,
            partialExitPct: 50,
            finalAtR: 3.5,
            // V4: stop moves to 1R after partial (V3 moved to 0R/breakeven).
            // Locking in 1R guarantees a profit even if the trailing stop hits.
            moveStopToBreakeven: true,
            trailingMethod: 'EMA10',
            // Time-stop at 20 sessions prevents zombie runners from tying up capital.
            timeStopSessions: 20,
            // Minimum progress before trailing stop is tightened: price must reach 1R.
            minimumProgressR: 1,
        },
        positionSizing: {
            riskBudgetPct,
            maximumPositionPct,
            suggestedPositionPct,
        },
        reasons,
        rejectionReasons,
    };
}

// ─── Intraday breakout confirmation ─────────────────────────────────────────

/**
 * Assess whether a completed 15-minute bar constitutes a valid V4 breakout
 * confirmation. The market-proxy (NIFTYBEES) VWAP check is deferred to the
 * caller because the backtest does not carry synchronized NIFTY 5-min data.
 * In live mode the lifecycle monitor injects it before calling this function.
 */
export function assessV4BreakoutConfirmation(input: V4BreakoutConfirmationInput): V4ConfirmationDecision {
    const location = closeLocation(input.latest15m);
    const checks: Array<[boolean, string, string]> = [
        [input.plan.eligible, 'V4 EOD qualification passed', 'V4 EOD qualification failed'],
        [input.latest15m.close > input.plan.breakoutArm.pivot, '15-minute close above pivot', '15-minute candle did not close above pivot'],
        [input.observedRvol >= input.plan.breakoutArm.minimumRvol, `RVOL ${input.observedRvol.toFixed(2)}x ≥ 1.5`, 'Same-time RVOL is below 1.5x'],
        [input.latest15m.close >= input.stockVwap, '15-minute close above stock VWAP', '15-minute close is below stock VWAP'],
        [location >= input.plan.breakoutArm.minimumCloseLocation, '15-minute close in upper 25%', '15-minute close is not in upper 25%'],
        [input.observedPrice <= input.plan.breakoutArm.maxPrice, 'Entry below maximum price', 'Price exceeded maximum entry'],
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

/**
 * Assess whether a 5-minute bar constitutes a valid V4 retest confirmation
 * (fired only after the breakout arm is established, not pre-breakout).
 */
export function assessV4RetestConfirmation(input: V4RetestConfirmationInput): V4ConfirmationDecision {
    const closeLocationValue = closeLocation(input.latest5m);
    const higherLow = Boolean(input.previous5m && input.latest5m.low >= input.previous5m.low * 0.998);
    const reclaimed = input.latest5m.close >= Math.max(input.stockVwap, input.plan.retest.zoneLow);
    const withinZone = input.latest5m.close <= input.plan.retest.maxEntry;
    const withinSessionLimit = input.sessionsAfterArm <= input.plan.retest.maximumSessionsAfterArm;

    const checks: Array<[boolean, string, string]> = [
        [input.plan.eligible, 'V4 EOD qualification passed', 'V4 EOD qualification failed'],
        [withinSessionLimit, `Retest within ${input.plan.retest.maximumSessionsAfterArm} sessions of arm`, 'Retest window expired'],
        [input.zoneTouched, 'Price entered retest zone', 'Retest zone has not been touched'],
        [reclaimed, '5-minute VWAP/zone reclaim', 'No 5-minute VWAP/zone reclaim'],
        [higherLow, '5-minute higher low', 'No 5-minute higher low'],
        [closeLocationValue >= 0.65, '5-minute close in upper 35%', '5-minute close not in upper 35%'],
        [withinZone, 'Entry below retest maximum price', 'Retest confirmation exceeded maximum entry'],
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
