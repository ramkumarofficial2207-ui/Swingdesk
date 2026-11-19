import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { isMonthEnd, momentumScore, nextMonthEnd } from '../src/research/cards/monthlyMomentum';

/** Weekday sessions from 2023-01-02 with a given close path. */
function sessions(closes: number[]): PriceBar[] {
    const bars: PriceBar[] = [];
    let t = Date.UTC(2023, 0, 2);
    for (const close of closes) {
        while ([0, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
        bars.push({ date: new Date(t).toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 });
        t += 86_400_000;
    }
    return bars;
}

describe('month ends', () => {
    const bars = sessions(Array.from({ length: 70 }, () => 100));

    it('marks the last session of each month', () => {
        const jan31 = bars.findIndex(bar => bar.date === '2023-01-31');
        expect(isMonthEnd(bars, jan31)).toBe(true);
        expect(isMonthEnd(bars, jan31 - 1)).toBe(false);
        expect(bars[nextMonthEnd(bars, jan31)].date).toBe('2023-02-28');
    });

    it('returns -1 when the next month-end is past the data', () => {
        expect(nextMonthEnd(bars, bars.length - 3)).toBe(-1);
    });
});

describe('momentumScore', () => {
    it('ranks a steady riser above a flat stock and skips the last 21 sessions', () => {
        const wobble = (k: number) => (k % 2 ? 0.5 : -0.5);
        const riser = sessions(Array.from({ length: 300 }, (_, k) => 100 + k * 0.2 + wobble(k)));
        const flat = sessions(Array.from({ length: 300 }, (_, k) => 100 + wobble(k)));
        expect(momentumScore(riser, 299)!).toBeGreaterThan(momentumScore(flat, 299)!);
        // A spike inside the skipped last month adds no return (only volatility), so it cannot raise the score.
        const spiked = riser.map((bar, k) => (k > 290 ? { ...bar, close: bar.close * 1.5 } : bar));
        expect(momentumScore(spiked, 299)!).toBeLessThan(momentumScore(riser, 299)!);
        expect(momentumScore(riser, 200)).toBeNull();
    });

    it('uses only data up to the signal day', () => {
        const bars = sessions(Array.from({ length: 300 }, (_, k) => 100 + k * 0.1 + (k % 3)));
        expect(momentumScore(bars.slice(0, 281), 280)).toBeCloseTo(momentumScore(bars, 280)!);
    });
});
