import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import {
    computeFeatures,
    Condition,
    DEFAULT_PARAMS,
    ExitDesign,
    greedySelect,
    labelDesignTrade,
    labelTrade,
    MIN_HISTORY,
    nonOverlapping,
    StudyRow,
    summarize,
} from '../src/research/fivePercentStudy';

const day = (n: number) => new Date(Date.UTC(2023, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, open: number, high: number, low: number, close: number, volume = 1000): PriceBar =>
    ({ date: day(n), open, high, low, close, volume });

/** Signal bar at index 0, then the given future bars; entry is bars[1].open. */
function series(...future: Array<[number, number, number, number]>): PriceBar[] {
    return [bar(0, 100, 100, 100, 100), ...future.map(([o, h, l, c], i) => bar(i + 1, o, h, l, c))];
}
const flat = (n: number): Array<[number, number, number, number]> => Array.from({ length: n }, () => [100, 101, 99, 100]);
const costR = DEFAULT_PARAMS.costBps / 100 / DEFAULT_PARAMS.stopPct;

describe('labelTrade', () => {
    it('hits the target first', () => {
        const label = labelTrade(series([100, 101, 99, 100], [100, 105.5, 99.5, 105], ...flat(8)), 0)!;
        expect(label).toMatchObject({ outcome: 'TARGET', entry: 100, exit: 105, sessionsHeld: 2 });
        expect(label.netR).toBeCloseTo(2 - costR);
    });

    it('hits the stop first', () => {
        const label = labelTrade(series([100, 101, 97, 98], ...flat(9)), 0)!;
        expect(label).toMatchObject({ outcome: 'STOP', exit: 97.5, sessionsHeld: 1 });
        expect(label.netR).toBeCloseTo(-1 - costR);
    });

    it('counts a day that touches both levels as a stop', () => {
        expect(labelTrade(series([100, 106, 97, 101], ...flat(9)), 0)!.outcome).toBe('STOP');
    });

    it('exits at the open when price gaps through the stop', () => {
        const label = labelTrade(series([100, 101, 99, 100], [94, 95, 93, 94], ...flat(8)), 0)!;
        expect(label).toMatchObject({ outcome: 'STOP', exit: 94 });
        expect(label.netR).toBeCloseTo(-6 / 2.5 - costR);
    });

    it('takes a gap above the target at the open', () => {
        expect(labelTrade(series([100, 101, 99, 100], [108, 109, 107, 108], ...flat(8)), 0)).toMatchObject({ outcome: 'TARGET', exit: 108 });
    });

    it('expires at the last close inside the horizon', () => {
        const future = flat(10);
        future[9] = [100, 102, 99, 102];
        const label = labelTrade(series(...future), 0)!;
        expect(label).toMatchObject({ outcome: 'EXPIRED', exit: 102, sessionsHeld: 10, exitIndex: 10 });
    });

    it('needs the full horizon of future bars', () => {
        expect(labelTrade(series(...flat(9)), 0)).toBeNull();
    });
});

describe('computeFeatures', () => {
    const rising = Array.from({ length: MIN_HISTORY + 1 }, (_, n) => {
        const close = 100 + n * 0.2;
        return bar(n, close - 0.1, close + 0.5, close - 0.5, close);
    });

    it('uses only data up to the signal bar', () => {
        const at = computeFeatures(rising, MIN_HISTORY, 0)!;
        const withFuture = computeFeatures([...rising, bar(999, 1, 1000, 1, 1000)], MIN_HISTORY, 0)!;
        expect(withFuture).toEqual(at);
    });

    it('describes a steady uptrend', () => {
        const f = computeFeatures(rising, MIN_HISTORY, 0)!;
        expect(f.trendStack).toBe(true);
        expect(f.fromHigh252Pct).toBeGreaterThan(-1);
        expect(f.rs63).toBeGreaterThan(0);
        expect(f.atrPct).toBeGreaterThan(0.5);
        expect(f.atrPct).toBeLessThan(1.5);
    });

    it('requires a year of history', () => {
        expect(computeFeatures(rising, MIN_HISTORY - 1, 0)).toBeNull();
    });
});

function row(symbol: string, index: number, netR: number, exitIndex = index + 3, date = '2022-01-01', flag = false): StudyRow {
    return {
        symbol, index, date, touchesUnverifiedJump: false,
        market: { niftyGreen: flag, breadthPct: 50 },
        features: {
            atrPct: 2, trendStack: flag, aboveSma50: true, rs63: 0, baseRange15Pct: 5, fromHigh252Pct: -2,
            volumeDryUp: 1, breakout20: false, closeLocation: 0.5, pullbackToSma20: false, return5Pct: 0,
        },
        label: { outcome: netR > 0 ? 'TARGET' : 'STOP', entry: 100, exit: 100, netR, sessionsHeld: 3, exitIndex },
    };
}

describe('nonOverlapping', () => {
    it('skips signals while a trade in the same stock is open', () => {
        const kept = nonOverlapping([row('A', 10, 1, 13), row('A', 11, 1), row('A', 13, 1), row('A', 14, 1), row('B', 11, 1)]);
        expect(kept.map(r => `${r.symbol}${r.index}`)).toEqual(['A10', 'A14', 'B11']);
    });
});

describe('summarize', () => {
    it('reports hit rates and average net R', () => {
        const stats = summarize([row('A', 1, 2), row('B', 1, -1), row('C', 1, -1), row('D', 1, 2)]);
        expect(stats).toMatchObject({ n: 4, targetPct: 50, stopPct: 50, expiredPct: 0, avgNetR: 0.5 });
        expect(stats.ciNetR).toBeGreaterThan(0);
    });
});

describe('greedySelect', () => {
    const good: Condition = { id: 'good', label: 'good', test: r => r.features.trendStack };
    // Mixed winners and losers: never better than the discovery baseline.
    const noise: Condition = { id: 'noise', label: 'noise', test: r => r.index % 3 === 0 };
    // Winners on even indexes; 'good' marks a subset of winners.
    const discovery = Array.from({ length: 40 }, (_, i) => row(`S${i}`, i, i % 2 === 0 ? 1.5 : -1, i + 3, '2022-01-01', i % 4 === 0));

    it('adds conditions that improve discovery results and stops when none do', () => {
        const steps = greedySelect(discovery, [noise, good], 4, 5);
        expect(steps.map(step => step.conditions.map(c => c.id))).toEqual([['good']]);
        expect(steps[0].discovery.avgNetR).toBeCloseTo(1.5);
    });

    it('respects the minimum trade count', () => {
        expect(greedySelect(discovery, [good], 4, 50)).toEqual([]);
    });
});

describe('labelDesignTrade', () => {
    const nextOpen: ExitDesign = { id: 'T', label: 't', entry: 'NEXT_OPEN', stopAtr: 1.5, targetR: 2, horizon: 5, costBps: 0 };
    const breakout: ExitDesign = { ...nextOpen, entry: 'BREAKOUT' };
    // Signal bar high is 100, so the breakout trigger is 100.1.
    const withNext = (next: [number, number, number, number], rest = flat(4)) => series(next, ...rest);

    it('sizes the stop and target from ATR', () => {
        // ATR 2% → stop 3% (97), target 6% (106).
        const label = labelDesignTrade(withNext([100, 101, 99, 100], [[100, 106.5, 99, 106], ...flat(3)]), 0, 2, nextOpen)!;
        expect(label).toMatchObject({ outcome: 'TARGET', entry: 100, exit: 106, netR: 2 });
        expect(labelDesignTrade(withNext([100, 101, 96.5, 98]), 0, 2, nextOpen)).toMatchObject({ outcome: 'STOP', exit: 97, netR: -1 });
    });

    it('counts the horizon from the entry session', () => {
        expect(labelDesignTrade(withNext([100, 101, 99, 100], flat(3)), 0, 2, nextOpen)).toBeNull();
        expect(labelDesignTrade(withNext([100, 101, 99, 100]), 0, 2, nextOpen)).toMatchObject({ outcome: 'EXPIRED', sessionsHeld: 5, exitIndex: 5 });
    });

    it('takes no breakout trade when the next session stays below the trigger', () => {
        expect(labelDesignTrade(withNext([99, 100.05, 98, 99]), 0, 2, breakout)).toBeNull();
    });

    it('fills a breakout at the trigger price', () => {
        expect(labelDesignTrade(withNext([99.5, 101, 99.4, 100.8]), 0, 2, breakout)).toMatchObject({ entry: 100.1 });
    });

    it('fills a gap above the trigger at the open, not the better trigger price', () => {
        expect(labelDesignTrade(withNext([102, 103, 101.5, 102.5]), 0, 2, breakout)).toMatchObject({ entry: 102 });
    });

    it('rejects a missing ATR', () => {
        expect(labelDesignTrade(withNext([100, 101, 99, 100]), 0, 0, nextOpen)).toBeNull();
    });
});
