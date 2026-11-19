import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { Candidate, DEFAULT_RULES, isTradeable, judge, selectTrades, simulatePortfolio, simulateTrade, tradeStats } from '../src/research/harness';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({ date: day(n), open: close, high: close + 1, low: close - 1, close, volume: 1000, ...extra });
const flat = (length: number, close = 100) => Array.from({ length }, (_, n) => bar(n, close));
const timeExit = (horizon: number) => ({ stopPct: null, targetPct: null, horizon });

describe('isTradeable', () => {
    it('rejects zero volume and single locked prices', () => {
        expect(isTradeable(bar(0, 100))).toBe(true);
        expect(isTradeable(bar(0, 100, { volume: 0 }))).toBe(false);
        expect(isTradeable({ date: day(0), open: 50, high: 50, low: 50, close: 50, volume: 10 })).toBe(false);
    });
});

describe('simulateTrade', () => {
    it('time-exits at the close of the last session, net of costs', () => {
        const bars = flat(10);
        bars[5] = bar(5, 110);
        const trade = simulateTrade(bars, 1, timeExit(5), 40)!;
        expect(trade.exitIndex).toBe(5);
        expect(trade.outcome).toBe('TIME');
        expect(trade.netPct).toBeCloseTo(9.6);
    });

    it('waits through a locked lower circuit and exits at the next tradeable open', () => {
        const bars = flat(10);
        bars[2] = { date: day(2), open: 90, high: 90, low: 90, close: 90, volume: 5 };
        bars[3] = { date: day(3), open: 81, high: 81, low: 81, close: 81, volume: 5 };
        bars[4] = bar(4, 75);
        const trade = simulateTrade(bars, 1, { stopPct: 5, targetPct: 10, horizon: 10 }, 40)!;
        expect(trade.outcome).toBe('STOP');
        expect(trade.exitIndex).toBe(4);
        expect(trade.exit).toBe(75);
        expect(trade.delayedExit).toBe(true);
    });

    it('counts a bar touching both levels as the stop', () => {
        const bars = flat(10);
        bars[2] = bar(2, 100, { high: 111, low: 94 });
        expect(simulateTrade(bars, 1, { stopPct: 5, targetPct: 10, horizon: 5 }, 40)!.outcome).toBe('STOP');
    });

    it('returns null when the data ends first', () => {
        expect(simulateTrade(flat(4), 1, timeExit(5), 40)).toBeNull();
    });
});

describe('selectTrades', () => {
    const bars = new Map<string, PriceBar[]>();
    for (const symbol of ['A', 'B', 'C', 'D']) bars.set(symbol, flat(30));
    const candidate = (symbol: string, industry: string, index: number, score: number): Candidate => ({ symbol, industry, index, score, exit: timeExit(5) });

    it('takes the top-ranked candidates and caps each sector', () => {
        const trades = selectTrades([
            candidate('A', 'Auto', 3, 4), candidate('B', 'Auto', 3, 3), candidate('C', 'Auto', 3, 2), candidate('D', 'IT', 3, 1),
        ], bars, { ...DEFAULT_RULES, maxPerSector: 2 });
        expect(trades.map(trade => trade.symbol)).toEqual(['A', 'B', 'D']);
    });

    it('respects topN and does not re-enter a stock it already holds', () => {
        const trades = selectTrades([
            candidate('A', 'Auto', 3, 4), candidate('B', 'IT', 3, 3),
            candidate('A', 'Auto', 4, 9), // still held
            candidate('A', 'Auto', 10, 9), // exited on index 8
        ], bars, { ...DEFAULT_RULES, topN: 1 });
        expect(trades.map(trade => `${trade.symbol}@${trade.entryIndex}`)).toEqual(['A@4', 'A@11']);
    });

    it('skips a gap-up beyond the limit', () => {
        const gapped = new Map(bars);
        const series = flat(30);
        series[4] = bar(4, 110);
        gapped.set('A', series);
        const trades = selectTrades([{ ...candidate('A', 'Auto', 3, 1), exit: { ...timeExit(5), maxGapUpPct: 3 } }], gapped);
        expect(trades).toHaveLength(0);
    });
});

describe('tradeStats and judge', () => {
    const make = (date: string, netPct: number) => ({ symbol: 'X', industry: 'I', signalDate: date, entryDate: date, exitDate: date, entryIndex: 0, exitIndex: 0, entry: 1, exit: 1, outcome: 'TIME' as const, netPct, delayedExit: false, stopPct: null });

    it('averages by day and drops the 5 best days', () => {
        const trades = [make('d1', 10), make('d1', 10), make('d2', -1), make('d3', -1), make('d4', -1), make('d5', -1), make('d6', -1), make('d7', -2)];
        const stats = tradeStats(trades);
        expect(stats.avg).toBeCloseTo(13 / 8);
        expect(stats.days).toBe(7);
        expect(stats.dayClustered).toBeCloseTo((10 - 7) / 7);
        expect(stats.withoutBest5Days).toBeCloseTo(-1.5);
    });

    it('fails when the portfolio is missing', () => {
        const stats = tradeStats(Array.from({ length: 120 }, (_, k) => make(`d${k}`, 1)));
        const verdict = judge(stats, [{ year: '2024', stats }, { year: '2025', stats }], ['2024', '2025', '2026'], null);
        expect(verdict.passed).toBe(false);
        expect(verdict.checks.filter(check => !check.pass).map(check => check.rule)).toEqual([
            'Portfolio: net CAGR above 0', 'Portfolio: max drawdown ≤ 20%', 'Portfolio: beats NIFTY 50 CAGR or has a lower drawdown',
        ]);
    });
});

describe('simulatePortfolio', () => {
    it('grows equity by slot-sized trades and tracks drawdown', () => {
        const series = flat(30);
        for (let n = 4; n < 30; n += 1) series[n] = bar(n, 110);
        const bars = new Map([['A', series]]);
        const trades = selectTrades([{ symbol: 'A', industry: 'I', index: 1, score: 1, exit: timeExit(5) }], bars);
        const calendar = series.map(b => b.date);
        const result = simulatePortfolio(trades, bars, flat(30), calendar)!;
        // One slot = 20% of 100; the trade nets +9.6% → +1.92.
        expect(result.finalEquity).toBeCloseTo(101.92, 1);
        // Only dip: costs charged at exit (102.00 marked → 101.92 realised).
        expect(result.maxDrawdownPct).toBeCloseTo(0.078, 2);
    });
});
