import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { checkWatchlist, entryEarlyDip, entrySurge, factorBefore, prepareAccumulation } from '../src/research/accumulation';
import { tradeShape } from '../src/research/cards/accumulationBreakout';
import { computeSeriesIndicators } from '../src/research/momentumPullback';

const day = (n: number) => new Date(Date.UTC(2023, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

/** 100 flat sessions, then a smooth 20-session climb (+0.9% / +0.2% alternating ≈ +11.6%). */
function climber(extra: Array<{ close: number; volume?: number; low?: number; high?: number }> = []) {
    const closes: number[] = [];
    for (let n = 0; n < 100; n += 1) closes.push(100 * (n % 2 ? 1.003 : 0.997));
    let last = 100;
    for (let n = 0; n < 20; n += 1) { last *= n % 2 ? 1.002 : 1.009; closes.push(last); }
    const bars: PriceBar[] = closes.map((close, n) => ({ date: day(n), open: close, high: close * 1.004, low: close * 0.99, close, volume: 1000 }));
    for (const e of extra) {
        const n = bars.length;
        bars.push({ date: day(n), open: e.close, high: e.high ?? e.close * 1.004, low: e.low ?? e.close * 0.99, close: e.close, volume: e.volume ?? 1000 });
    }
    const deliveryPct = bars.map((_, n) => (n >= 110 ? 45 : 30));
    const futOi = bars.map((_, n) => (n >= 100 ? 1000 + (n - 99) * 5 : 1000));
    return { bars, deliveryPct, futOi };
}
const prep = (c: ReturnType<typeof climber>, overrides: Partial<{ deliveryPct: number[]; futOi: number[] }> = {}) =>
    prepareAccumulation(c.bars, computeSeriesIndicators(c.bars), { deliveryPct: overrides.deliveryPct ?? c.deliveryPct, futOi: overrides.futOi ?? c.futOi });

describe('watchlist (stage 1)', () => {
    it('accepts a smooth 8–15% climb with rising lows, rising delivery and slowly rising OI', () => {
        const s = prep(climber());
        const check = checkWatchlist(s, 119);
        expect(check.failed).toEqual([]);
        expect(check.climbPct).toBeGreaterThan(8);
        expect(check.climbPct).toBeLessThan(15);
        expect(s.watch[119]).toBe(true);
        expect(s.watch[99]).toBe(false); // still flat
    });

    it('rejects a single big jump (W2), a volume surge (W6), falling delivery (W7) and an OI spike (W8)', () => {
        const c = climber();
        const jump = climber();
        jump.bars[115] = { ...jump.bars[115], close: jump.bars[114].close * 1.05 };
        expect(checkWatchlist(prep(jump), 119).failed).toContain('W2');

        const surge = climber();
        surge.bars[112] = { ...surge.bars[112], volume: 3000 };
        expect(checkWatchlist(prep(surge), 119).failed).toContain('W6');

        expect(checkWatchlist(prep(c, { deliveryPct: c.bars.map((_, n) => (n >= 110 ? 20 : 30)) }), 119).failed).toContain('W7');
        expect(checkWatchlist(prep(c, { futOi: c.bars.map((_, n) => (n >= 110 ? 2000 : 1000)) }), 119).failed).toContain('W8');
    });

    it('skips the OI rule for stocks without F&O data', () => {
        const c = climber();
        const check = checkWatchlist(prep(c, { futOi: c.bars.map(() => NaN) }), 119);
        expect(check.on).toBe(true);
        expect(check.oiChangePct).toBeNull();
    });
});

describe('entries (stage 2)', () => {
    it('A: buys a quiet dip to the 10-day average while on the watchlist', () => {
        const base = climber();
        const last = base.bars[119].close;
        const c = climber([{ close: last * 0.995, low: last * 0.975, volume: 800 }]);
        const s = prep(c);
        expect(s.watch[120]).toBe(true);
        expect(entryEarlyDip(s, 120)).toBe(true);
        // Same dip on heavy volume is not quiet.
        expect(entryEarlyDip(prep(climber([{ close: last * 0.995, low: last * 0.975, volume: 1500 }])), 120)).toBe(false);
    });

    it('B: buys the first surge (≥ 1.5× volume, strong close, gain 0.5–3%) after the watchlist, not a big jump', () => {
        const last = climber().bars[119].close;
        const surge = (pct: number, volume: number) => {
            const close = last * (1 + pct / 100);
            return prep(climber([{ close, high: close * 1.001, low: last * 0.999, volume }]));
        };
        expect(entrySurge(surge(2, 2000), 120)).toBe(true);
        expect(entrySurge(surge(5, 2000), 120)).toBe(false); // already jumped: too late
        expect(entrySurge(surge(2, 1200), 120)).toBe(false); // no volume surge
    });

    it('B needs the stock on the watchlist in the previous 10 sessions', () => {
        const c = climber();
        const s = prep(c, { deliveryPct: c.bars.map(() => 30) }); // delivery never rises → never on the watchlist
        expect(s.watch.some(Boolean)).toBe(false);
        expect(entrySurge(s, 119)).toBe(false);
    });
});

describe('helpers', () => {
    it('divides OI before a 1:1 bonus by its factor', () => {
        const events = [{ exDate: '2024-10-28', priceFactor: 0.5 }];
        expect(factorBefore(events, '2024-10-25')).toBe(0.5);
        expect(factorBefore(events, '2024-10-28')).toBe(1);
        expect(2_000_000 / factorBefore(events, '2024-10-25')).toBe(4_000_000);
    });

    it('summarises trade shape', () => {
        const t = (outcome: 'TARGET' | 'STOP' | 'TIME', netPct: number, days: number) => ({ symbol: 'X', industry: 'I', signalDate: '2024-01-01', entryDate: '', exitDate: '', entryIndex: 0, exitIndex: days - 1, entry: 1, exit: 1, outcome, netPct, delayedExit: false, stopPct: 2.5 });
        expect(tradeShape([t('TARGET', 4.6, 6), t('STOP', -2.9, 2), t('TIME', 1, 15), t('STOP', -2.9, 3)])).toMatchObject({ n: 4, hitPct: 25, stopPct: 50, timePct: 25, avgDays: 6.5 });
    });
});
