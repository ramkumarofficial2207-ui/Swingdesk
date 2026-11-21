import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { simulateTrade } from '../src/research/harness';
import { computeBaselineSignals, demeanedRanks, ibs, knnFeatures, knnPredict, momentum12_1, nthMonthEndAfter, residualMomentum, topFraction, volatility252 } from '../src/research/paper151/baselines';

const day = (n: number) => new Date(Date.UTC(2021, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({ date: day(n), open: close, high: close + 1, low: close - 1, close, volume: 1000, ...extra });

describe('paper151 helpers', () => {
    it('12-1 momentum skips the latest month', () => {
        const bars = Array.from({ length: 300 }, (_, n) => bar(n, 100 + n));
        expect(momentum12_1(bars, 251)).toBeNull();
        expect(momentum12_1(bars, 299)).toBeCloseTo((100 + 278) / (100 + 47) - 1);
    });

    it('volatility is zero for a constant-growth series and positive otherwise', () => {
        const flat = Array.from({ length: 260 }, (_, n) => bar(n, 100 * 1.01 ** n));
        expect(volatility252(flat, 259)).toBeCloseTo(0, 10);
        const zig = Array.from({ length: 260 }, (_, n) => bar(n, n % 2 ? 101 : 99));
        expect(volatility252(zig, 259)!).toBeGreaterThan(0.01);
    });

    it('residual momentum removes the market move', () => {
        const n = 600;
        const market = Array.from({ length: n }, (_, k) => 100 * (1 + 0.1 * Math.sin(k / 15)));
        const marketClose = new Map(market.map((c, k) => [day(k), c]));
        // Same moves as the market plus a steady own drift → strongly positive score.
        const drift = Array.from({ length: n }, (_, k) => bar(k, market[k] * 1.002 ** k));
        const pure = Array.from({ length: n }, (_, k) => bar(k, market[k]));
        expect(residualMomentum(drift, n - 1, d => marketClose.get(d))!).toBeGreaterThan(1);
        expect(residualMomentum(pure, n - 1, d => marketClose.get(d))).toBeNull(); // residuals are all zero → no score
        expect(residualMomentum(drift, 400, d => marketClose.get(d))).toBeNull(); // not enough history
    });

    it('IBS, ranks and top fraction', () => {
        expect(ibs(bar(0, 100, { high: 110, low: 100 }))).toBe(0);
        expect(ibs(bar(0, 100, { high: 100, low: 100 }))).toBeNull();
        expect([...demeanedRanks(new Map([['A', 5], ['B', 1], ['C', 3]]))]).toEqual([['B', -1], ['C', 0], ['A', 1]]);
        const values = new Map(Array.from({ length: 25 }, (_, k) => [`S${k}`, k] as [string, number]));
        expect(topFraction(values).map(([s]) => s)).toEqual(['S24', 'S23']);
    });

    it('finds the n-th month-end', () => {
        const bars = Array.from({ length: 80 }, (_, n) => bar(n, 100));
        expect(bars[nthMonthEndAfter(bars, 0, 1)].date).toBe('2021-01-31');
        expect(bars[nthMonthEndAfter(bars, 0, 2)].date).toBe('2021-02-28');
    });

    it('KNN predicts from past days only', () => {
        // Repeating 20-day cycle: the forecast at a cycle bottom must be positive.
        const bars = Array.from({ length: 800 }, (_, n) => bar(n, 100 + 10 * Math.sin((2 * Math.PI * n) / 20), { volume: 1000 + (n % 20) }));
        const features = knnFeatures(bars);
        // n ≡ 15 (mod 20) is the low of the cycle: 10 sessions later the price is at its high.
        const y = knnPredict(bars, features, 795);
        expect(y!).toBeGreaterThan(0.1);
        expect(knnPredict(bars, features, 785)!).toBeLessThan(-0.1); // the high: 10 sessions later is the low
        expect(knnPredict(bars.slice(0, 100), features, 99)).toBeNull();
    });
});

describe('rule exits in the harness', () => {
    it('sells at the next open after exitWhen fires', () => {
        const bars = Array.from({ length: 10 }, (_, n) => bar(n, 100 + n));
        const trade = simulateTrade(bars, 1, { stopPct: null, targetPct: null, horizon: 8, exitWhen: k => k === 4 }, 40)!;
        expect(trade.outcome).toBe('TRAIL');
        expect(trade.exitIndex).toBe(5);
        expect(trade.exit).toBe(105);
    });
});

describe('computeBaselineSignals', () => {
    it('produces moving-average, IBS and channel signals without look-ahead', () => {
        const n = 120;
        const up = Array.from({ length: n }, (_, k) => bar(k, k < 80 ? 200 - k : 120 + 3 * (k - 80)));
        const flat = Array.from({ length: n }, (_, k) => bar(k, 100, { high: 101, low: 99, close: k % 2 ? 99.2 : 100.8 }));
        const nifty = Array.from({ length: n }, (_, k) => bar(k, 1000));
        const stocks = [up, flat].map((bars, k) => ({ symbol: k ? 'FLAT' : 'UP', industry: 'X', bars, eligible: () => true }));
        const all = computeBaselineSignals(stocks, nifty);
        const crossDays = [...(all.get('MA_SINGLE')!.get('UP')?.keys() ?? [])];
        expect(crossDays.length).toBe(1);
        expect(up[crossDays[0]].close).toBeGreaterThan(up[crossDays[0] - 1].close);
        expect(all.get('DONCHIAN')!.get('UP')!.has(79)).toBe(true);
        // Later bars must not change an earlier signal.
        const cut = computeBaselineSignals(stocks.map(s => ({ ...s, bars: s.bars.slice(0, 90) })), nifty.slice(0, 90));
        expect(cut.get('MA_SINGLE')!.get('UP')?.has(crossDays[0])).toBe(crossDays[0] < 90);
    });
});
