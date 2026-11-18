import { describe, expect, it } from 'vitest';
import {
    adjustBars,
    auditAdjustedJumps,
    classifyPriceFactor,
    findSuspiciousJumps,
    istDateFromUnixSeconds,
    parseYahooSplits,
    PriceBar,
    previousTradingDateLookup,
    reconcileEventDates,
} from '../src/corporateActions';

const bar = (date: string, close: number, volume = 1_000): PriceBar => ({
    date, open: close, high: close * 1.01, low: close * 0.99, close, volume,
});

// HDFC Bank 1:1 bonus, ex-date 26 Aug 2025, as it appears in raw NSE files.
const hdfcRaw: PriceBar[] = [
    bar('2025-08-21', 1991.2),
    bar('2025-08-22', 1964.6),
    bar('2025-08-25', 1964.1, 1_000),
    bar('2025-08-26', 973.4, 2_000),
    bar('2025-08-28', 957.8),
];
const hdfcSessions = previousTradingDateLookup(hdfcRaw.map(b => b.date));

describe('adjustBars', () => {
    it('scales prices before the ex-date and leaves later bars unchanged', () => {
        const adjusted = adjustBars(hdfcRaw, [{ exDate: '2025-08-26', priceFactor: 0.5 }]);
        expect(adjusted[2].close).toBeCloseTo(982.05);
        expect(adjusted[2].volume).toBe(2_000);
        expect(adjusted[3].close).toBe(973.4);
        expect(adjusted[3].volume).toBe(2_000);
        expect(hdfcRaw[2].close).toBe(1964.1); // input not mutated
    });

    it('compounds several events', () => {
        const adjusted = adjustBars([bar('2020-01-01', 1000), bar('2022-01-01', 500), bar('2024-01-01', 100)], [
            { exDate: '2021-01-01', priceFactor: 0.5 },
            { exDate: '2023-01-01', priceFactor: 0.2 },
        ]);
        expect(adjusted.map(b => +b.close.toFixed(2))).toEqual([100, 100, 100]);
    });

    it('ignores invalid factors', () => {
        expect(adjustBars(hdfcRaw, [{ exDate: '2025-08-26', priceFactor: 0 }])[0].close).toBe(1991.2);
    });
});

describe('jump detection and audit', () => {
    it('flags the raw bonus as a suspicious jump', () => {
        const jumps = findSuspiciousJumps(hdfcRaw, 25, hdfcSessions);
        expect(jumps).toHaveLength(1);
        expect(jumps[0]).toMatchObject({ date: '2025-08-26', previousDate: '2025-08-25' });
        expect(jumps[0].ratio).toBeCloseTo(0.4956, 3);
    });

    it('treats a recorded bonus as explained', () => {
        const { rawJumps, unexplained } = auditAdjustedJumps(hdfcRaw, [{ exDate: '2025-08-26', priceFactor: 0.5 }], 25, hdfcSessions);
        expect(rawJumps).toHaveLength(1);
        expect(unexplained).toEqual([]);
    });

    it('keeps a jump with no recorded event as unexplained', () => {
        expect(auditAdjustedJumps(hdfcRaw, [], 25, hdfcSessions).unexplained).toHaveLength(1);
    });

    it('does not treat a gap in the data as a price jump', () => {
        // The market traded on 2026-08-10 but this symbol has no row for it.
        const sessions = previousTradingDateLookup(['2026-08-07', '2026-08-10', '2026-08-11']);
        const bars = [bar('2026-08-07', 100), bar('2026-08-11', 160)];
        expect(findSuspiciousJumps(bars, 25, sessions)).toEqual([]);
        expect(findSuspiciousJumps(bars, 25)).toHaveLength(1);
    });
});

describe('Yahoo split parsing', () => {
    it('reads splits as price factors on the Indian calendar date', () => {
        // Yahoo stamps NSE events at 09:15 IST, i.e. 03:45 UTC the same day.
        const date = Date.parse('2025-08-26T03:45:00Z') / 1000;
        const payload = { chart: { result: [{ events: { splits: {
            [date]: { date, numerator: 2, denominator: 1, splitRatio: '2:1' },
            bad: { date, numerator: 0, denominator: 1 },
        } } }] } };
        expect(parseYahooSplits(payload)).toEqual([{ exDate: '2025-08-26', priceFactor: 0.5 }]);
    });

    it('returns nothing for an empty or malformed response', () => {
        expect(parseYahooSplits({})).toEqual([]);
        expect(parseYahooSplits(null)).toEqual([]);
    });

    it('converts late-evening UTC timestamps to the next IST date', () => {
        expect(istDateFromUnixSeconds(Date.parse('2025-08-25T20:00:00Z') / 1000)).toBe('2025-08-26');
    });
});

describe('reconcileEventDates', () => {
    const jumps = findSuspiciousJumps(hdfcRaw, 15, hdfcSessions);

    it('moves an event reported a day early onto the actual jump', () => {
        expect(reconcileEventDates([{ exDate: '2025-08-25', priceFactor: 0.5 }], jumps))
            .toEqual([{ exDate: '2025-08-26', priceFactor: 0.5 }]);
    });

    it('keeps the reported date when no jump of matching size is near', () => {
        expect(reconcileEventDates([{ exDate: '2025-08-25', priceFactor: 0.1 }], jumps))
            .toEqual([{ exDate: '2025-08-25', priceFactor: 0.1 }]);
    });
});

describe('classifyPriceFactor', () => {
    it('labels splits, bonuses and consolidations', () => {
        expect(classifyPriceFactor(0.5)).toEqual({ kind: 'SPLIT', ratio: '2:1' });
        expect(classifyPriceFactor(0.1)).toEqual({ kind: 'SPLIT', ratio: '10:1' });
        expect(classifyPriceFactor(0.8)).toEqual({ kind: 'SPLIT', ratio: '1.25:1' });
        expect(classifyPriceFactor(10)).toEqual({ kind: 'CONSOLIDATION', ratio: '1:10' });
    });
});
