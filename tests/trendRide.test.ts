import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { Candidate, DEFAULT_RULES, entryFill, selectTrades, simulateTrade } from '../src/research/harness';
import { exitProfile, strengthPerDay, trendRideExit, trendRidePullback } from '../src/research/cards/trendRide';
import { computeSeriesIndicators } from '../src/research/momentumPullback';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({ date: day(n), open: close, high: close + 1, low: close - 1, close, volume: 1000, ...extra });
const flat = (length: number, close = 100) => Array.from({ length }, (_, n) => bar(n, close));

describe('buy-stop entry', () => {
    const plan = { stopPct: 5, targetPct: null, horizon: 5, entryTrigger: 102 };
    it('fills at the open when it gaps above, at the trigger when the high reaches it, else not at all', () => {
        expect(entryFill(bar(0, 100, { open: 103, high: 104 }), plan)).toBe(103);
        expect(entryFill(bar(0, 100, { high: 102.5 }), plan)).toBe(102);
        expect(entryFill(bar(0, 100, { high: 101.9 }), plan)).toBeNull();
        expect(simulateTrade(flat(10), 1, plan, 40)).toBeNull();
    });

    it('counts an unfilled order as one of the day’s slots', () => {
        const bars = new Map<string, PriceBar[]>([['A', flat(20)], ['B', flat(20)]]);
        const exit = (trigger: number) => ({ stopPct: 5, targetPct: null, horizon: 5, entryTrigger: trigger });
        const candidates: Candidate[] = [
            { symbol: 'A', industry: 'X', index: 3, score: 2, exit: exit(150) },
            { symbol: 'B', industry: 'Y', index: 3, score: 1, exit: exit(100) },
        ];
        expect(selectTrades(candidates, bars, { ...DEFAULT_RULES, topN: 1 })).toHaveLength(0);
        expect(selectTrades(candidates, bars, { ...DEFAULT_RULES, topN: 2 }).map(t => t.symbol)).toEqual(['B']);
    });
});

describe('trailing exit', () => {
    it('sells at the next open after a close below the average', () => {
        const bars = flat(40);
        for (let n = 20; n < 30; n += 1) bars[n] = bar(n, 100 + (n - 19) * 2); // rising run
        bars[30] = bar(30, 90); // closes below its 3-session average
        bars[31] = bar(31, 92, { open: 91 });
        const trade = simulateTrade(bars, 21, { stopPct: 20, targetPct: null, horizon: 30, trailSma: 3 }, 40)!;
        expect(trade.outcome).toBe('TRAIL');
        expect(trade.exitIndex).toBe(31);
        expect(trade.exit).toBe(91);
    });
});

describe('partial exit', () => {
    it('sells half at +2R and moves the stop on the rest to entry from the next session', () => {
        const bars = flat(20);
        bars[3] = bar(3, 108, { high: 111 }); // +2R with a 5% stop is 110
        bars[4] = bar(4, 99.5, { open: 104, low: 99 }); // falls back through entry
        const trade = simulateTrade(bars, 1, { stopPct: 5, targetPct: null, horizon: 10, partial: { atR: 2, fraction: 0.5 } }, 40)!;
        expect(trade.partialFilled).toBe(true);
        expect(trade.outcome).toBe('STOP');
        expect(trade.exit).toBe(100);
        expect(trade.netPct).toBeCloseTo(0.5 * 10 + 0.5 * 0 - 0.4);
    });

    it('counts a bar touching the stop and the partial level as the stop', () => {
        const bars = flat(20);
        bars[2] = bar(2, 100, { high: 111, low: 94 });
        const trade = simulateTrade(bars, 1, { stopPct: 5, targetPct: null, horizon: 10, partial: { atR: 2, fraction: 0.5 } }, 40)!;
        expect(trade.partialFilled).toBe(false);
        expect(trade.netPct).toBeCloseTo(-5.4);
    });
});

describe('trend ride rules', () => {
    // 260 sessions rising 0.3% a day, then a 5% dip over the last 4 sessions, with a 3% daily range.
    const rising = Array.from({ length: 260 }, (_, n) => {
        const close = 100 * 1.003 ** n;
        return bar(n, close, { high: close * 1.015, low: close * 0.985 });
    });
    const peak = rising[259].close;
    const dip = [0.985, 0.97, 0.96, 0.955].map((f, k) => {
        const close = peak * f;
        return bar(260 + k, close, { high: close * 1.015, low: close * 0.985 });
    });
    const bars = [...rising, ...dip];
    const ind = computeSeriesIndicators(bars);

    it('accepts a strong uptrend that pulled back 3–8% toward the 20-day average', () => {
        const check = trendRidePullback(bars, ind, bars.length - 1);
        expect(check.atrPct).toBeGreaterThan(2);
        expect(check.passes).toBe(true);
    });

    it('rejects the same stock before it dipped', () => {
        expect(trendRidePullback(bars, ind, 259).passes).toBe(false);
    });

    it('builds the exit: 1.5 × ATR stop, buy-stop at the high, 20-day trail, 40 sessions', () => {
        const exit = trendRideExit(bars, 263, 3, true);
        expect(exit).toMatchObject({ stopPct: 4.5, targetPct: null, horizon: 40, trailSma: 20, entryTrigger: bars[263].high, partial: { atR: 2, fraction: 0.5 } });
        expect(trendRideExit(bars, 263, 3, false).partial).toBeUndefined();
    });

    it('keeps only setups in the top 10% of the whole day’s strength', () => {
        const exit = { stopPct: null, targetPct: null, horizon: 1 };
        const list: Candidate[] = Array.from({ length: 20 }, (_, k) => ({ symbol: `S${k}`, industry: 'X', index: 0, score: k, exit, meta: { setup: k % 2 } }));
        // Top 10% of 20 = scores 18 and 19; only 19 is a setup.
        expect(strengthPerDay('2024-01-01', list).map(c => c.symbol)).toEqual(['S19']);
    });

    it('summarises winners, losers and exit types', () => {
        const base = { industry: 'X', signalDate: '2024-01-01', entryDate: '', exitDate: '', entry: 1, exit: 1, delayedExit: false, stopPct: 3 };
        const p = exitProfile([
            { ...base, symbol: 'A', entryIndex: 0, exitIndex: 9, outcome: 'TRAIL', netPct: 8 },
            { ...base, symbol: 'B', entryIndex: 0, exitIndex: 1, outcome: 'STOP', netPct: -3 },
        ]);
        expect(p).toMatchObject({ n: 2, avgWinner: 8, avgLoser: -3, avgSessions: 6, byOutcome: { TRAIL: 1, STOP: 1 } });
    });
});
