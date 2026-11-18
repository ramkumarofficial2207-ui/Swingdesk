import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { computeSeriesIndicators, momentumReturn, pullbackSignal, topThreshold } from '../src/research/momentumPullback';

const day = (n: number) => new Date(Date.UTC(2023, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, close: number, range = 1.5): PriceBar => ({ date: day(n), open: close, high: close + range / 2, low: close - range / 2, close, volume: 1000 });

/**
 * 230 sessions of steady uptrend (≈ +0.25/session from 100), a 6-session surge
 * well above the 20-day average, a 5-session dip back to it, then a resumption day.
 */
function scenario(): PriceBar[] {
    const bars: PriceBar[] = [];
    let close = 100;
    for (let n = 0; n < 230; n += 1) { close += 0.25; bars.push(bar(n, close)); }
    for (let n = 230; n < 236; n += 1) { close += 2.2; bars.push(bar(n, close)); }
    for (let n = 236; n < 241; n += 1) { close -= 2.0; bars.push(bar(n, close)); }
    const dipClose = close;
    bars.push({ date: day(241), open: dipClose, high: dipClose + 3.2, low: dipClose - 0.2, close: dipClose + 3, volume: 1500 });
    return bars;
}

describe('momentum pullback signal', () => {
    it('fires on a resumption after a dip to the 20-day average in an uptrend', () => {
        const bars = scenario();
        const ind = computeSeriesIndicators(bars);
        const i = bars.length - 1;
        const check = pullbackSignal(bars, ind, i);
        expect(Math.abs(bars[i - 1].close - ind.sma20[i - 1])).toBeLessThanOrEqual(ind.atr14[i - 1]);
        expect(check.atrPct).toBeGreaterThan(1);
        expect(check.passes).toBe(true);
    });

    it('does not fire without a resumption above the previous high', () => {
        const bars = scenario();
        const last = bars[bars.length - 1];
        bars[bars.length - 1] = { ...last, close: bars[bars.length - 2].high - 0.1, high: bars[bars.length - 2].high };
        expect(pullbackSignal(bars, computeSeriesIndicators(bars), bars.length - 1).passes).toBe(false);
    });

    it('uses only data up to the signal day', () => {
        const bars = scenario();
        const i = bars.length - 1;
        const before = pullbackSignal(bars, computeSeriesIndicators(bars), i);
        const withFuture = [...bars, bar(242, 10), bar(243, 1000)];
        expect(pullbackSignal(withFuture, computeSeriesIndicators(withFuture), i)).toEqual(before);
    });
});

describe('momentumReturn', () => {
    it('measures 126 sessions ending 5 sessions back', () => {
        const bars = Array.from({ length: 200 }, (_, n) => bar(n, 100 + n));
        // end = 199 - 5 = 194 (close 294), start = 194 - 126 = 68 (close 168)
        expect(momentumReturn(bars, 199)).toBeCloseTo(294 / 168 - 1);
        expect(momentumReturn(bars, 100)).toBeNull();
    });
});

describe('topThreshold', () => {
    it('returns the value at the start of the top fraction', () => {
        const values = Array.from({ length: 10 }, (_, n) => n + 1);
        expect(topThreshold(values, 0.2)).toBe(9);
        expect(values.filter(value => value >= topThreshold(values, 0.2))).toEqual([9, 10]);
        expect(topThreshold([], 0.2)).toBe(Infinity);
    });
});
