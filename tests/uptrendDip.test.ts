import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { computeSeriesIndicators } from '../src/research/momentumPullback';
import { isUptrendDip, pctStats, u1Trade, u2Trade } from '../src/research/uptrendDip';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({ date: day(n), open: close, high: close + 1, low: close - 1, close, volume: 1000, ...extra });

/** 60 sessions rising 80 → 139, then a 4-day dip ending with a -4% day at index 63, then flat at 132. */
function scenario(lastDip = 128) {
    const bars = Array.from({ length: 60 }, (_, n) => bar(n, 80 + n));
    bars.push(bar(60, 137), bar(61, 135), bar(62, 133.5), bar(63, lastDip));
    for (let n = 64; n < 80; n += 1) bars.push(bar(n, 132));
    return { bars, ind: computeSeriesIndicators(bars) };
}

describe('isUptrendDip', () => {
    it('fires on a ≥3% down day, ≥5% down over 5 sessions, still above the 50-day average', () => {
        const { bars, ind } = scenario();
        expect(isUptrendDip(bars, ind, 63)).toBe(true);
    });

    it('does not fire when the day is down less than 3%', () => {
        const { bars, ind } = scenario(130.5); // -2.2%
        expect(isUptrendDip(bars, ind, 63)).toBe(false);
    });

    it('does not fire below the 50-day average', () => {
        const { bars, ind } = scenario(100);
        expect(isUptrendDip(bars, ind, 63)).toBe(false);
    });

    it('only uses data up to the signal day', () => {
        const { bars } = scenario();
        const truncated = bars.slice(0, 64);
        expect(isUptrendDip(truncated, computeSeriesIndicators(truncated), 63)).toBe(true);
    });
});

describe('trades', () => {
    it('U1 buys the next open and sells the 5th close, net of 0.4%', () => {
        const { bars } = scenario();
        const trade = u1Trade(bars, 63)!;
        expect(trade.label.entry).toBe(132);
        expect(trade.label.exitIndex).toBe(68);
        expect(trade.netPct).toBeCloseTo(-0.4);
    });

    it('U1 returns null when the 5 sessions are not complete', () => {
        const { bars } = scenario();
        expect(u1Trade(bars.slice(0, 67), 63)).toBeNull();
    });

    it('U2 uses the ATR stop and reports net %', () => {
        const { bars, ind } = scenario();
        const trade = u2Trade(bars, ind, 63)!;
        expect(trade.label.entry).toBe(132);
        expect(['TARGET', 'STOP', 'EXPIRED']).toContain(trade.label.outcome);
        expect(trade.netPct).toBeCloseTo((trade.label.exit / 132 - 1) * 100 - 0.4);
    });
});

describe('pctStats', () => {
    it('averages per signal date for the day-clustered figure', () => {
        const stats = pctStats([
            { date: 'a', netPct: 10 }, { date: 'a', netPct: 10 }, { date: 'a', netPct: 10 },
            { date: 'b', netPct: -2 },
        ]);
        expect(stats.avg).toBeCloseTo(7);
        expect(stats.dayClustered).toBeCloseTo(4);
        expect(stats.days).toBe(2);
        expect(stats.winRate).toBe(75);
    });
});
