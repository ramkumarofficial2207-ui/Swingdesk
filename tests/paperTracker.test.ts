import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { factorAfter, progressToUpdate, summarizeLive } from '../src/paperTracker';
import { advanceScannerSignal, decideTrustStatus, replayScannerSignal, TriggerMode } from '../src/research/setupEvidence';
import { OutcomeStats, progressTrade, simulateFrom } from '../src/research/fivePercentStudy';
import { SetupLevels } from '../src/setupLevels';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

/** Deterministic pseudo-random walk with occasional volume spikes. */
function walk(seed: number, length: number): PriceBar[] {
    let state = seed;
    const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    let close = 100;
    return Array.from({ length }, (_, n) => {
        const open = close * (1 + (rand() - 0.5) * 0.02);
        close = open * (1 + (rand() - 0.48) * 0.04);
        const high = Math.max(open, close) * (1 + rand() * 0.015);
        const low = Math.min(open, close) * (1 - rand() * 0.015);
        return { date: day(n), open, high, low, close, volume: rand() < 0.3 ? 3000 : 1000 };
    });
}

const levelsFor = (bars: PriceBar[], i: number): SetupLevels => {
    const entryPrice = bars[i].high * 1.001;
    return { entryPrice, stopLoss: entryPrice * 0.96, targetPrice: entryPrice * 1.08, target2: entryPrice * 1.1, slPct: 4, targetPct: 8 };
};

describe('progressTrade', () => {
    it('matches simulateFrom whenever the full horizon is available', () => {
        for (let seed = 1; seed <= 40; seed += 1) {
            const bars = walk(seed, 30);
            expect(progressTrade(bars, 5, bars[5].open, 3, 6, 10, 40)).toEqual(simulateFrom(bars, 5, bars[5].open, 3, 6, 10, 40));
        }
    });

    it('stays open while no exit has happened in the bars so far', () => {
        const flat: PriceBar[] = Array.from({ length: 4 }, (_, n) => ({ date: day(n), open: 100, high: 100.5, low: 99.5, close: 100, volume: 1 }));
        expect(progressTrade(flat, 0, 100, 3, 6, 10, 40)).toBeNull();
    });
});

describe('advanceScannerSignal (live) agrees with the replay', () => {
    const modes: TriggerMode[] = ['FULL_DAY_VOLUME', 'PRICE_ONLY', 'CLOSE_CONFIRMED_NEXT_OPEN'];
    it('reaches the replay outcome once every needed candle exists, from any checking day', () => {
        for (const mode of modes) {
            for (let seed = 1; seed <= 60; seed += 1) {
                const bars = walk(seed, 60);
                const signal = 25;
                const levels = levelsFor(bars, signal);
                const replay = replayScannerSignal(bars, signal, levels, 2, mode);
                if (replay.kind === 'INSUFFICIENT_DATA') continue;
                // Check on every intermediate day: never a different final answer.
                for (let known = signal + 1; known <= bars.length; known += 1) {
                    const live = advanceScannerSignal(bars.slice(0, known), signal, levels, 2, mode);
                    if (live.state === 'CLOSED') {
                        expect(replay.kind).toBe('TRADE');
                        if (replay.kind === 'TRADE') expect(live.trade.label).toEqual(replay.trade.label);
                    }
                    if (live.state === 'NOT_TRIGGERED' || live.state === 'SKIPPED_CHASE') expect(replay.kind).toBe(live.state);
                }
                const final = advanceScannerSignal(bars, signal, levels, 2, mode);
                if (replay.kind === 'TRADE') expect(final.state === 'CLOSED' && final.trade).toEqual(replay.trade);
                else expect(final.state).toBe(replay.kind);
            }
        }
    });

    it('reports PENDING while the plan window is still open, then NOT_TRIGGERED', () => {
        const quiet: PriceBar[] = Array.from({ length: 40 }, (_, n) => ({ date: day(n), open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 }));
        const levels: SetupLevels = { entryPrice: 105, stopLoss: 100, targetPrice: 115, target2: 120, slPct: 5, targetPct: 10 };
        expect(advanceScannerSignal(quiet.slice(0, 26), 20, levels, 2, 'PRICE_ONLY').state).toBe('PENDING');
        expect(advanceScannerSignal(quiet, 20, levels, 2, 'PRICE_ONLY').state).toBe('NOT_TRIGGERED');
    });
});

describe('progressToUpdate', () => {
    const dates = [day(0), day(1), day(2), day(3)];
    it('stores fill details for an open trade', () => {
        expect(progressToUpdate({ state: 'OPEN', fillIndex: 2, fill: 101 }, dates)).toMatchObject({ state: 'OPEN', fillPrice: 101, fillDate: new Date(`${day(2)}T00:00:00.000Z`), netR: null });
    });
    it('stores the outcome for a closed trade', () => {
        const update = progressToUpdate({
            state: 'CLOSED', goalResolved: false,
            trade: { fill: 100, fillIndex: 1, reachedGoalFirst: false, label: { outcome: 'TARGET', entry: 100, exit: 108, netR: 1.9, sessionsHeld: 2, exitIndex: 2 } },
        }, dates);
        expect(update).toMatchObject({ state: 'TARGET', exitPrice: 108, netR: 1.9, reachedGoalFirst: null });
    });
});

describe('factorAfter', () => {
    it('applies only splits after the signal date', () => {
        const events = [{ exDate: '2025-08-26', priceFactor: 0.5 }, { exDate: '2026-02-01', priceFactor: 0.2 }];
        expect(factorAfter(events, '2026-01-15')).toBeCloseTo(0.2);
        expect(factorAfter(events, '2025-01-01')).toBeCloseTo(0.1);
        expect(factorAfter(events, '2026-03-01')).toBe(1);
    });
});

describe('summarizeLive', () => {
    const closed = (netR: number, n: number) => ({ state: netR > 0 ? 'TARGET' : 'STOP', netR, exitDate: new Date(Date.UTC(2026, 0, n)) });
    it('counts closed, open and pending trades', () => {
        const record = summarizeLive([closed(2, 1), closed(-1, 2), { state: 'OPEN', netR: null, exitDate: null }, { state: 'PENDING', netR: null, exitDate: null }]);
        expect(record).toMatchObject({ closed: 2, avgNetR: 0.5, open: 1, pending: 1, targetHits: 1, recentAvgNetR: null });
    });
    it('reports the most recent 30 once 30 exist', () => {
        const signals = [...Array.from({ length: 10 }, (_, n) => closed(2, n + 1)), ...Array.from({ length: 30 }, (_, n) => closed(-1, n + 20))];
        expect(summarizeLive(signals).recentAvgNetR).toBe(-1);
    });
});

describe('live demotion', () => {
    const stats = (n: number, avgNetR: number): OutcomeStats => ({ n, avgNetR, ciNetR: 0.05, targetPct: 40, stopPct: 50, expiredPct: 10 });
    const years = [2024, 2025, 2026].map(year => ({ year: String(year), stats: stats(100, 0.2) }));
    it('demotes a setup whose recent 30 live trades lost money', () => {
        const decision = decideTrustStatus({ test: stats(300, 0.2), testYears: years, liveTrades: { n: 40, avgNetR: 0.1 }, recentLiveAvgNetR: -0.05 });
        expect(decision.status).toBe('RESEARCH_ONLY');
        expect(decision.reasons[0]).toMatch(/Demoted/);
    });
});
