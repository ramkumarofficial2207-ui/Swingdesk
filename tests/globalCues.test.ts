import { describe, expect, it } from 'vitest';
import { CUES, cueDates, firesInWindow, isBeneficiary, shockZ } from '../src/research/cards/globalCues';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

/** Alternating ±1% moves (std dev ≈ 1%), then one −4% day at index 70. */
function series() {
    const bars = [{ date: day(0), open: null, high: null, low: null, close: 100 }];
    for (let n = 1; n <= 75; n += 1) {
        const move = n === 70 ? -0.04 : n % 2 ? 0.01 : -0.01;
        bars.push({ date: day(n), open: null, high: null, low: null, close: bars[n - 1].close * Math.exp(move) });
    }
    return bars;
}

describe('shockZ', () => {
    it('scales the day\'s move by the previous 60 days\' volatility', () => {
        const z = shockZ(series(), 60);
        expect(z.get(day(70))!).toBeCloseTo(-4, 0);
        expect(Math.abs(z.get(day(69))!)).toBeLessThan(1.1);
        expect(z.has(day(60))).toBe(false); // needs 60 prior returns
    });

    it('only uses returns before the day', () => {
        const full = shockZ(series(), 60);
        const cut = shockZ(series().slice(0, 71), 60);
        expect(cut.get(day(70))).toBeCloseTo(full.get(day(70))!);
    });
});

describe('cueDates', () => {
    it('fires in the cue direction only', () => {
        const z = new Map([['a', -2.1], ['b', 1.8], ['c', -1.6]]);
        expect(cueDates(z, -1, 1.5)).toEqual(['a', 'c']);
        expect(cueDates(z, -1, 2.0)).toEqual(['a']);
        expect(cueDates(z, 1, 1.5)).toEqual(['b']);
    });
});

describe('firesInWindow', () => {
    it('assigns a shock dated D to the Indian session i with date(i) ≤ D < date(i+1)', () => {
        const fired = ['2024-03-08', '2024-03-15'];
        expect(firesInWindow(fired, '2024-03-08', '2024-03-11')).toBe(true); // Fri shock → Mon entry
        expect(firesInWindow(fired, '2024-03-11', '2024-03-12')).toBe(false);
        expect(firesInWindow(fired, '2024-03-14', '2024-03-15')).toBe(false); // shock on the entry date itself is not known yet
        expect(firesInWindow(fired, '2024-03-15', '2024-03-18')).toBe(true);
    });
});

describe('isBeneficiary', () => {
    it('matches by industry or explicit symbol', () => {
        const brent = CUES.find(cue => cue.id === 'C2')!;
        expect(isBeneficiary(brent, 'BPCL', 'Oil Gas & Consumable Fuels')).toBe(true);
        expect(isBeneficiary(brent, 'ONGC', 'Oil Gas & Consumable Fuels')).toBe(false);
        expect(isBeneficiary(brent, 'MARUTI', 'Automobile and Auto Components')).toBe(true);
    });
});
