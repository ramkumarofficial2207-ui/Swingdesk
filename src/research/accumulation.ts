/**
 * Accumulation then breakout (reports/accumulation-breakout-plan.md).
 * Pure, point-in-time logic shared by the backtest card and live auto paper:
 * everything at index i uses bars 0..i only.
 *
 * Stage 1 (watchlist): a quiet, smooth 20-session climb with rising lows,
 * delivery % rising and futures OI building slowly (F&O stocks).
 * Stage 2 (entries): A = quiet dip to the 10-day average while on the
 * watchlist; B = first volume surge after being on the watchlist, while the
 * day's gain is still small.
 */
import { PriceBar } from '../corporateActions';
import { SeriesIndicators } from './momentumPullback';

export const ACC_RULES = {
    climbWindow: 20,
    minClimbPct: 8,
    maxClimbPct: 15,
    maxDayGainPct: 4,
    maxDailyStdPct: 2.5,
    lowsHalf: 10,
    smaRiseLag: 5,
    minClosesAboveSma20: 15,
    maxVolumeSurge: 2.5,
    deliveryRecent: 10,
    deliveryBase: 40,
    minDeliveryValues: 30,
    oiWindow: 20,
    minOiChangePct: 0,
    maxOiChangePct: 40,
    // Entry A
    dipAtr: 0.25,
    minDipDayPct: -2,
    maxDipDayPct: 1,
    // Entry B
    lookbackSessions: 10,
    surgeVolume: 1.5,
    closeInRangeTop: 0.75,
    minSurgeDayPct: 0.5,
    maxSurgeDayPct: 3,
    breakoutWindow: 20,
    // Trade
    targetPct: 5,
    stopPct: 2.5,
    horizon: 15,
    maxGapUpPct: 3,
} as const;

/** Extra per-bar series aligned with bars; NaN where missing. */
export interface AccumulationExtras {
    deliveryPct: number[];
    /** Futures OI (all expiries), divided by the split/bonus factor like volume. */
    futOi: number[];
}

export interface AccumulationSeries {
    bars: PriceBar[];
    ind: SeriesIndicators;
    extras: AccumulationExtras;
    /** Daily close-to-close return (fraction); NaN at 0. */
    ret: number[];
    sma10: number[];
    /** Average volume of the previous 20 / 50 sessions (excluding the day itself). */
    volPrior20: number[];
    volPrior50: number[];
    /** Watchlist flag per bar (computed once). */
    watch: boolean[];
}

function rollingMean(values: number[], period: number): number[] {
    const out = new Array<number>(values.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

/** Mean of the `period` values before i (excluding i). */
function priorMean(values: number[], period: number): number[] {
    const inclusive = rollingMean(values, period);
    return values.map((_, i) => (i >= period ? inclusive[i - 1] : NaN));
}

const finite = (v: number) => Number.isFinite(v);

export interface WatchCheck {
    on: boolean;
    /** Which rules failed (empty when on). */
    failed: string[];
    climbPct: number;
    dailyStdPct: number;
    oiChangePct: number | null;
    deliveryRecent: number | null;
    deliveryBase: number | null;
}

/** Stage 1 rules W1–W8 at the close of i. */
export function checkWatchlist(s: Omit<AccumulationSeries, 'watch'>, i: number): WatchCheck {
    const { bars, ind, extras, ret, volPrior50 } = s;
    const w = ACC_RULES.climbWindow;
    const empty = { on: false, failed: ['history'], climbPct: NaN, dailyStdPct: NaN, oiChangePct: null, deliveryRecent: null, deliveryBase: null };
    if (i < Math.max(70, ACC_RULES.deliveryRecent + ACC_RULES.deliveryBase) || !(bars[i - w].close > 0) || !finite(ind.sma50[i])) return empty;
    const failed: string[] = [];
    const close = bars[i].close;
    const climbPct = (close / bars[i - w].close - 1) * 100;
    if (climbPct < ACC_RULES.minClimbPct || climbPct > ACC_RULES.maxClimbPct) failed.push('W1');

    const window = ret.slice(i - w + 1, i + 1);
    if (Math.max(...window) * 100 > ACC_RULES.maxDayGainPct) failed.push('W2');
    const mean = window.reduce((a, b) => a + b, 0) / w;
    const dailyStdPct = 100 * Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / (w - 1));
    if (!(dailyStdPct <= ACC_RULES.maxDailyStdPct)) failed.push('W3');

    let recentLow = Infinity;
    let earlierLow = Infinity;
    for (let k = i - ACC_RULES.lowsHalf + 1; k <= i; k += 1) recentLow = Math.min(recentLow, bars[k].low);
    for (let k = i - 2 * ACC_RULES.lowsHalf + 1; k <= i - ACC_RULES.lowsHalf; k += 1) earlierLow = Math.min(earlierLow, bars[k].low);
    if (!(recentLow > earlierLow)) failed.push('W4');

    let above = 0;
    for (let k = i - w + 1; k <= i; k += 1) if (bars[k].close > ind.sma20[k]) above += 1;
    const trendOk = close > ind.sma20[i] && ind.sma20[i] > ind.sma20[i - ACC_RULES.smaRiseLag] && close > ind.sma50[i] && above >= ACC_RULES.minClosesAboveSma20;
    if (!trendOk) failed.push('W5');

    let surged = false;
    for (let k = i - w + 1; k <= i; k += 1) if (!(volPrior50[k] > 0) || bars[k].volume > ACC_RULES.maxVolumeSurge * volPrior50[k]) { surged = true; break; }
    if (surged) failed.push('W6');

    const recent = extras.deliveryPct.slice(i - ACC_RULES.deliveryRecent + 1, i + 1).filter(finite);
    const base = extras.deliveryPct.slice(i - ACC_RULES.deliveryRecent - ACC_RULES.deliveryBase + 1, i - ACC_RULES.deliveryRecent + 1).filter(finite);
    const avg = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    const deliveryRecent = recent.length ? avg(recent) : null;
    const deliveryBase = base.length ? avg(base) : null;
    if (recent.length + base.length < ACC_RULES.minDeliveryValues || !recent.length || !base.length || !(deliveryRecent! > deliveryBase!)) failed.push('W7');

    const oiNow = extras.futOi[i];
    const oiThen = extras.futOi[i - ACC_RULES.oiWindow];
    let oiChangePct: number | null = null;
    if (oiNow > 0 && oiThen > 0) {
        oiChangePct = (oiNow / oiThen - 1) * 100;
        if (oiChangePct < ACC_RULES.minOiChangePct || oiChangePct > ACC_RULES.maxOiChangePct) failed.push('W8');
    }
    return { on: failed.length === 0, failed, climbPct, dailyStdPct, oiChangePct, deliveryRecent, deliveryBase };
}

export function prepareAccumulation(bars: PriceBar[], ind: SeriesIndicators, extras: AccumulationExtras): AccumulationSeries {
    const ret = bars.map((bar, i) => (i > 0 && bars[i - 1].close > 0 ? bar.close / bars[i - 1].close - 1 : NaN));
    const volumes = bars.map(bar => bar.volume);
    const base = { bars, ind, extras, ret, sma10: rollingMean(bars.map(bar => bar.close), 10), volPrior20: priorMean(volumes, 20), volPrior50: priorMean(volumes, 50) };
    const watch = bars.map((_, i) => checkWatchlist(base, i).on);
    return { ...base, watch };
}

/** Smoothness score: 20-session return ÷ standard deviation of daily returns. */
export function smoothness(s: AccumulationSeries, i: number): number {
    const c = checkWatchlist(s, i);
    return c.dailyStdPct > 0 ? c.climbPct / c.dailyStdPct : 0;
}

/** Entry A: on the watchlist today and a quiet dip to the 10-day average. */
export function entryEarlyDip(s: AccumulationSeries, i: number): boolean {
    if (!s.watch[i]) return false;
    const bar = s.bars[i];
    const atr = s.ind.atr14[i];
    const dayPct = 100 * s.ret[i];
    return atr > 0
        && bar.low <= s.sma10[i] + ACC_RULES.dipAtr * atr
        && bar.close >= s.ind.sma20[i]
        && dayPct >= ACC_RULES.minDipDayPct && dayPct <= ACC_RULES.maxDipDayPct
        && s.volPrior20[i] > 0 && bar.volume <= s.volPrior20[i];
}

/** Entry B: on the watchlist in the previous 10 sessions, today the first surge with a small gain. */
export function entrySurge(s: AccumulationSeries, i: number): boolean {
    if (i < ACC_RULES.breakoutWindow + 1) return false;
    let recentlyWatched = false;
    for (let k = i - ACC_RULES.lookbackSessions; k < i; k += 1) if (k >= 0 && s.watch[k]) { recentlyWatched = true; break; }
    if (!recentlyWatched) return false;
    const bar = s.bars[i];
    const dayPct = 100 * s.ret[i];
    const range = bar.high - bar.low;
    let priorHigh = -Infinity;
    for (let k = i - ACC_RULES.breakoutWindow; k < i; k += 1) priorHigh = Math.max(priorHigh, s.bars[k].close);
    return s.volPrior20[i] > 0 && bar.volume >= ACC_RULES.surgeVolume * s.volPrior20[i]
        && range > 0 && (bar.close - bar.low) / range >= ACC_RULES.closeInRangeTop
        && dayPct >= ACC_RULES.minSurgeDayPct && dayPct <= ACC_RULES.maxSurgeDayPct
        && bar.close > priorHigh;
}

export function surgeScore(s: AccumulationSeries, i: number): number {
    return s.volPrior20[i] > 0 ? s.bars[i].volume / s.volPrior20[i] : 0;
}

/** Product of split/bonus factors with ex-date after `date` (1 when none): raw OI ÷ this = adjusted OI. */
export function factorBefore(events: Array<{ exDate: string; priceFactor: number }>, date: string): number {
    return events.filter(e => Number.isFinite(e.priceFactor) && e.priceFactor > 0 && date < e.exDate).reduce((p, e) => p * e.priceFactor, 1);
}

/** Align date-keyed values with bars; NaN where missing. */
export function alignByDate(bars: PriceBar[], values: Map<string, number>): number[] {
    return bars.map(bar => values.get(bar.date) ?? NaN);
}
