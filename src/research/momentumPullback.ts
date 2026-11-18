/**
 * Momentum pullback study (reports/momentum-pullback-plan.md). Pure,
 * point-in-time helpers: everything at index i uses bars 0..i only.
 */
import { PriceBar } from '../corporateActions';

export const MP_RULES = {
    momentumLookback: 126,
    momentumSkip: 5,
    topFraction: 0.2,
    extendedWindow: 10,
    extendedAtr: 2,
    nearAverageAtr: 1,
    minAtrPct: 1,
    maxAtrPct: 4,
    stopAtr: 1.5,
    targetR: 2,
    horizon: 10,
    costBps: 40,
} as const;

export interface SeriesIndicators {
    sma20: number[];
    sma50: number[];
    sma200: number[];
    atr14: number[];
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

export function computeSeriesIndicators(bars: PriceBar[]): SeriesIndicators {
    const closes = bars.map(bar => bar.close);
    const trueRanges = bars.map((bar, i) => i === 0
        ? bar.high - bar.low
        : Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)));
    // ATR(14) at i averages the true ranges of sessions i-13..i (each uses its previous close).
    const atr14 = rollingMean(trueRanges, 14).map((value, i) => (i >= 14 ? value : NaN));
    return { sma20: rollingMean(closes, 20), sma50: rollingMean(closes, 50), sma200: rollingMean(closes, 200), atr14 };
}

/** 126-session return ending 5 sessions before i (skips the most recent week). */
export function momentumReturn(bars: PriceBar[], i: number): number | null {
    const end = i - MP_RULES.momentumSkip;
    const start = end - MP_RULES.momentumLookback;
    if (start < 0 || !(bars[start].close > 0)) return null;
    return bars[end].close / bars[start].close - 1;
}

export interface PullbackCheck {
    passes: boolean;
    atrPct: number;
}

/** Trend, pullback, resumption and ATR range at the close of i (momentum rank checked separately). */
export function pullbackSignal(bars: PriceBar[], ind: SeriesIndicators, i: number): PullbackCheck {
    const fail = { passes: false, atrPct: NaN };
    if (i < 200 || i < MP_RULES.extendedWindow + 1) return fail;
    const close = bars[i].close;
    const atr = ind.atr14[i];
    if (!(close > 0) || !(atr > 0) || !(ind.sma200[i] > 0)) return fail;
    const atrPct = (atr / close) * 100;
    if (atrPct < MP_RULES.minAtrPct || atrPct > MP_RULES.maxAtrPct) return { passes: false, atrPct };
    const uptrend = close > ind.sma50[i] && ind.sma50[i] > ind.sma200[i];
    let extended = false;
    for (let k = i - MP_RULES.extendedWindow; k < i; k += 1) {
        if (bars[k].close >= ind.sma20[k] + MP_RULES.extendedAtr * ind.atr14[k]) { extended = true; break; }
    }
    const previous = i - 1;
    const dippedToAverage = Math.abs(bars[previous].close - ind.sma20[previous]) <= MP_RULES.nearAverageAtr * ind.atr14[previous];
    const resumed = close > bars[previous].high;
    return { passes: uptrend && extended && dippedToAverage && resumed, atrPct };
}

/** Value at the given upper fraction (e.g. 0.2 → 80th percentile) of a list. */
export function topThreshold(values: number[], fraction: number): number {
    if (!values.length) return Infinity;
    const sorted = [...values].sort((left, right) => left - right);
    // The top `fraction` are the last ceil(n × fraction) values; return the first of them.
    const count = Math.max(1, Math.ceil(sorted.length * fraction));
    return sorted[sorted.length - count];
}
