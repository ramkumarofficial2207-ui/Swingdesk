import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { OutcomeStats } from '../src/research/fivePercentStudy';
import { decideTrustStatus, replayScannerSignal } from '../src/research/setupEvidence';
import { SetupLevels } from '../src/setupLevels';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const quiet = (n: number, close = 100): PriceBar => ({ date: day(n), open: close, high: close + 0.5, low: close - 0.5, close, volume: 1000 });

/** 20 quiet bars, a signal bar at index 20, then the given future bars, padded to cover plan + hold windows. */
function bars(future: Array<Partial<PriceBar>>): PriceBar[] {
    const history = Array.from({ length: 21 }, (_, n) => quiet(n));
    const after = future.map((bar, k) => ({ ...quiet(21 + k), ...bar, date: day(21 + k) }));
    const padding = Array.from({ length: 25 }, (_, k) => quiet(21 + after.length + k));
    return [...history, ...after, ...padding];
}

// Entry 101, stop 98, target 107; ATR 2 → max entry min(103.02, 102) = 102.
const levels: SetupLevels = { entryPrice: 101, stopLoss: 98, targetPrice: 107, target2: 110, slPct: 2.97, targetPct: 5.94 };
const SIGNAL = 20;

describe('replayScannerSignal (v1 full-day-volume trigger)', () => {
    it('fills at entry when price reaches it on 1.5× volume, and resolves at the target', () => {
        const result = replayScannerSignal(bars([
            { open: 100, high: 101.5, low: 99.8, close: 101.2, volume: 1600 },
            { open: 101.2, high: 107.5, low: 101, close: 107 },
        ]), SIGNAL, levels, 2, 'FULL_DAY_VOLUME');
        expect(result.kind).toBe('TRADE');
        if (result.kind !== 'TRADE') return;
        expect(result.trade).toMatchObject({ fill: 101, fillIndex: 21 });
        expect(result.trade.label.outcome).toBe('TARGET');
        expect(result.trade.reachedGoalFirst).toBe(true); // 101 × 1.05 = 106.05 reached
    });

    it('waits for volume confirmation before triggering', () => {
        const result = replayScannerSignal(bars([
            { open: 100, high: 101.5, low: 99.8, close: 101, volume: 1200 },
            { open: 101, high: 101.8, low: 100.5, close: 101.5, volume: 2000 },
        ]), SIGNAL, levels, 2, 'FULL_DAY_VOLUME');
        expect(result.kind === 'TRADE' && result.trade.fillIndex).toBe(22);
    });

    it('skips a session that opens above the maximum entry (no chasing)', () => {
        expect(replayScannerSignal(bars([{ open: 102.5, high: 104, low: 102, close: 103, volume: 3000 }]), SIGNAL, levels, 2, 'FULL_DAY_VOLUME').kind).toBe('SKIPPED_CHASE');
    });

    it('fills at the open when it gaps above entry but within the cap', () => {
        const result = replayScannerSignal(bars([{ open: 101.6, high: 102, low: 101.2, close: 101.8, volume: 3000 }]), SIGNAL, levels, 2, 'FULL_DAY_VOLUME');
        expect(result.kind === 'TRADE' && result.trade.fill).toBe(101.6);
    });

    it('reports a plan that never triggers within 10 sessions', () => {
        expect(replayScannerSignal(bars([]), SIGNAL, levels, 2, 'FULL_DAY_VOLUME').kind).toBe('NOT_TRIGGERED');
    });

    it('needs enough future data for the plan window', () => {
        expect(replayScannerSignal(bars([]).slice(0, 25), SIGNAL, levels, 2, 'FULL_DAY_VOLUME').kind).toBe('INSUFFICIENT_DATA');
    });
});

const stats = (n: number, avgNetR: number, ciNetR = 0.05): OutcomeStats => ({ n, avgNetR, ciNetR, targetPct: 40, stopPct: 50, expiredPct: 10 });
const years = (...avg: number[]) => avg.map((value, k) => ({ year: String(2024 + k), stats: stats(50, value) }));

describe('decideTrustStatus', () => {
    it('keeps a losing setup research-only and says why', () => {
        const decision = decideTrustStatus({ test: stats(300, -0.1), testYears: years(-0.1, 0.1, -0.2) });
        expect(decision.status).toBe('RESEARCH_ONLY');
        expect(decision.reasons.join(' ')).toMatch(/not positive/);
        expect(decision.reasons.join(' ')).toMatch(/1 of 3 test years/);
    });

    it('requires 100 test trades even when results look good', () => {
        expect(decideTrustStatus({ test: stats(60, 0.5), testYears: years(0.5, 0.5, 0.5) }).status).toBe('RESEARCH_ONLY');
    });

    it('requires the 95% range to stay above zero', () => {
        expect(decideTrustStatus({ test: stats(200, 0.04, 0.06), testYears: years(0.1, 0.1, -0.1) }).status).toBe('RESEARCH_ONLY');
    });

    it('puts a setup that passes the test period on trial', () => {
        expect(decideTrustStatus({ test: stats(200, 0.2), testYears: years(0.3, -0.1, 0.2) }).status).toBe('ON_TRIAL');
    });

    it('trusts only after 30 positive live paper trades', () => {
        const passing = { test: stats(200, 0.2), testYears: years(0.3, 0.1, 0.2) };
        expect(decideTrustStatus({ ...passing, liveTrades: { n: 29, avgNetR: 0.3 } }).status).toBe('ON_TRIAL');
        expect(decideTrustStatus({ ...passing, liveTrades: { n: 30, avgNetR: -0.01 } }).status).toBe('ON_TRIAL');
        expect(decideTrustStatus({ ...passing, liveTrades: { n: 30, avgNetR: 0.2 } }).status).toBe('TRUSTED');
    });
});

describe('look-ahead-free trigger modes', () => {
    // Crosses entry intraday on low volume, closes below entry.
    const weakDay = { open: 100, high: 101.5, low: 99.8, close: 100.5, volume: 1000 };
    // Crosses entry, closes above it on 2x volume; next session opens at 101.4.
    const strongDay = { open: 100.2, high: 101.8, low: 100, close: 101.5, volume: 2000 };
    const nextDay = { open: 101.4, high: 102, low: 101, close: 101.8 };

    it('PRICE_ONLY buys when price crosses entry, without knowing the day volume', () => {
        const result = replayScannerSignal(bars([weakDay]), SIGNAL, levels, 2, 'PRICE_ONLY');
        expect(result.kind === 'TRADE' && result.trade).toMatchObject({ fill: 101, fillIndex: 21 });
    });

    it('CLOSE_CONFIRMED_NEXT_OPEN waits for a confirmed close and buys the next open', () => {
        const result = replayScannerSignal(bars([weakDay, strongDay, nextDay]), SIGNAL, levels, 2, 'CLOSE_CONFIRMED_NEXT_OPEN');
        expect(result.kind === 'TRADE' && result.trade).toMatchObject({ fill: 101.4, fillIndex: 23 });
    });

    it('CLOSE_CONFIRMED_NEXT_OPEN skips a next open above the maximum entry', () => {
        expect(replayScannerSignal(bars([strongDay, { ...nextDay, open: 102.5 }]), SIGNAL, levels, 2, 'CLOSE_CONFIRMED_NEXT_OPEN').kind).toBe('SKIPPED_CHASE');
    });
});

describe('v2 default trigger', () => {
    it('uses the close-confirmed, next-open trigger by default', () => {
        const strongDay = { open: 100.2, high: 101.8, low: 100, close: 101.5, volume: 2000 };
        const result = replayScannerSignal(bars([strongDay, { open: 101.4, high: 102, low: 101, close: 101.8 }]), SIGNAL, levels, 2);
        expect(result.kind === 'TRADE' && result.trade).toMatchObject({ fill: 101.4, fillIndex: 22 });
    });
});
