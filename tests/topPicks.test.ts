import { describe, expect, it } from 'vitest';
import { combineScores, pickTop, recentSurprise, seededSample } from '../src/topPicks';
import { exitFor, progressAutoTrade, scorecard } from '../src/autoPaper';
import { PriceBar } from '../src/corporateActions';

const row = (symbol: string, momentum: number, residual: number, sue: number | null, industry = 'X') => ({ symbol, industry, momentum, residual, sue });

describe('monthly top picks', () => {
    it('averages ranks and treats a missing surprise as average', () => {
        const scored = combineScores([row('A', 3, 3, null), row('B', 2, 2, 5), row('C', 1, 1, -5)]);
        const by = new Map(scored.map(s => [s.symbol, s.score]));
        expect(by.get('A')!).toBeCloseTo(2 / 3); // ranks +1, +1, 0
        expect(by.get('B')!).toBeCloseTo(1 / 3); // 0, 0, +2 × scale 1
        expect(by.get('C')!).toBeCloseTo(-1);
    });

    it('caps two per industry and is deterministic for random picks', () => {
        const scored = combineScores([row('A', 5, 5, null, 'Bank'), row('B', 4, 4, null, 'Bank'), row('C', 3, 3, null, 'Bank'), row('D', 2, 2, null, 'IT')]);
        expect(pickTop(scored, 3).map(s => s.symbol)).toEqual(['A', 'B', 'D']);
        const items = Array.from({ length: 50 }, (_, k) => k);
        expect(seededSample(items, 5, '2026-12-01')).toEqual(seededSample(items, 5, '2026-12-01'));
        expect(seededSample(items, 5, '2026-12-01')).not.toEqual(seededSample(items, 5, '2027-01-01'));
    });

    it('uses only results announced in the last 100 days, latest first', () => {
        const events = [
            { symbol: 'A', eventDate: '2026-08-01', sue: 1, periodEnd: '2026-06-30' },
            { symbol: 'A', eventDate: '2026-11-01', sue: 3, periodEnd: '2026-09-30' },
            { symbol: 'B', eventDate: '2026-07-01', sue: 9, periodEnd: '2026-06-30' },
            { symbol: 'C', eventDate: '2026-12-05', sue: 9, periodEnd: '2026-09-30' },
        ];
        expect([...recentSurprise(events, '2026-12-01')]).toEqual([['A', 3]]);
    });
});

describe('Auto Paper monthly exits', () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
    const bar = (n: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({ date: day(n), open: close, high: close + 0.5, low: close - 0.5, close, volume: 1000, ...extra });

    it('monthly hold has no gap filter and exits at session 21', () => {
        const bars = Array.from({ length: 30 }, (_, n) => bar(n, 100));
        bars[1] = bar(1, 105, { open: 105 }); // 5% gap up: still entered
        const p = progressAutoTrade(bars, 0, exitFor('TOP5_HOLD'));
        expect(p.state).toBe('EXPIRED');
        expect(p.exitIndex).toBe(21);
    });

    it('control strategies get a "Control" verdict; top-5 compares with its control', () => {
        expect(scorecard('RANDOM5_HOLD', []).verdict).toBe('Control (random picks)');
        const trades = Array.from({ length: 30 }, () => ({ state: 'EXPIRED', netPct: 1, sessionsHeld: 21, niftyPct: 0.5 }));
        expect(scorecard('TOP5_HOLD', trades, 0.2)).toMatchObject({ verdict: 'WORKING on paper', vsControlPct: expect.closeTo(0.8), vsNiftyPct: expect.closeTo(0.5) });
        expect(scorecard('TOP5_HOLD', trades, 2).verdict).toBe('NOT WORKING');
    });
});
