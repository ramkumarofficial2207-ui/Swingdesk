import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { computeSeriesIndicators } from '../src/research/momentumPullback';
import { assessResultsSignal, eventIndex, resultsTrade } from '../src/research/postResultsDrift';
import { parseBoardMeetings, parseNseTimestamp } from '../src/resultsCalendarBackfill';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const quiet = (n: number, close = 100): PriceBar => ({ date: day(n), open: close, high: close + 1, low: close - 1, close, volume: 1000 });

/** 80 quiet sessions; results on day 80 (E) with a +8% two-day jump on heavy volume; flat NIFTY. */
function scenario(overrides: { e?: Partial<PriceBar>; s?: Partial<PriceBar>; next?: Partial<PriceBar> } = {}) {
    const bars = Array.from({ length: 80 }, (_, n) => quiet(n));
    bars.push({ ...quiet(80), open: 100, high: 104.5, low: 99.5, close: 104, volume: 3000, ...overrides.e });
    bars.push({ ...quiet(81), open: 104, high: 108.5, low: 103.5, close: 108, volume: 2500, ...overrides.s });
    bars.push({ ...quiet(82), open: 108.5, high: 109.5, low: 107.5, close: 109, ...overrides.next });
    for (let n = 83; n < 110; n += 1) bars.push(quiet(n, 109));
    const nifty = new Map(bars.map(bar => [bar.date, 20000]));
    return { bars, nifty, ind: computeSeriesIndicators(bars) };
}

describe('eventIndex', () => {
    it('maps a meeting on a non-trading day to the next session', () => {
        expect(eventIndex(['2024-01-05', '2024-01-08', '2024-01-09'], '2024-01-06')).toBe(1);
        expect(eventIndex(['2024-01-05', '2024-01-08'], '2024-01-05')).toBe(0);
        expect(eventIndex(['2024-01-05'], '2024-02-01')).toBe(-1);
    });
});

describe('assessResultsSignal', () => {
    it('fires on a strong, high-volume reaction that holds into the close', () => {
        const { bars, nifty, ind } = scenario();
        const signal = assessResultsSignal(bars, ind, 80, nifty)!;
        expect(signal.abnormalReactionPct).toBeCloseTo(8);
        expect(signal.reasons).toEqual([]);
        expect(signal.passes).toBe(true);
    });

    it('subtracts NIFTY over the same window', () => {
        const { bars, nifty, ind } = scenario();
        nifty.set(bars[81].date, 21000); // NIFTY +5% → abnormal 3%
        const signal = assessResultsSignal(bars, ind, 80, nifty)!;
        expect(signal.abnormalReactionPct).toBeCloseTo(3);
        expect(signal.reasons).toContain('reaction');
    });

    it('requires heavy volume and a close in the upper half', () => {
        const { bars, nifty, ind } = scenario({ e: { volume: 1500 }, s: { volume: 1500, high: 112, low: 103.5, close: 106.5 } });
        expect(assessResultsSignal(bars, ind, 80, nifty)!.reasons).toEqual(expect.arrayContaining(['volume', 'close']));
    });

    it('cannot see past the signal day', () => {
        const a = scenario();
        const b = scenario({ next: { open: 50, high: 51, low: 1, close: 2 } });
        expect(assessResultsSignal(b.bars, computeSeriesIndicators(b.bars.slice(0, 82)), 80, b.nifty))
            .toEqual(assessResultsSignal(a.bars, computeSeriesIndicators(a.bars.slice(0, 82)), 80, a.nifty));
    });
});

describe('resultsTrade', () => {
    it('enters at the E+2 open', () => {
        const { bars } = scenario();
        expect(resultsTrade(bars, 80, 2)).toMatchObject({ entry: 108.5 });
    });
    it('skips a gap of more than 3% above the signal close', () => {
        const { bars } = scenario({ next: { open: 111.5, high: 112, low: 111, close: 111.5 } });
        expect(resultsTrade(bars, 80, 2)).toBeNull();
    });
});

describe('NSE board-meeting parsing', () => {
    it('keeps results meetings and parses IST timestamps', () => {
        const rows = parseBoardMeetings([
            { bm_symbol: 'ACE', bm_date: '31-Jul-2021', bm_purpose: 'Financial Results/Fund Raising', bm_timestamp: '22-Jul-2021 14:25:00' },
            { bm_symbol: 'XYZ', bm_date: '31-Jul-2021', bm_purpose: 'Fund Raising' },
            { bm_symbol: 'BAD', bm_date: 'soon', bm_purpose: 'Financial Results' },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ symbol: 'ACE', meetingDate: new Date('2021-07-31T00:00:00Z') });
        expect(rows[0].intimatedAt?.toISOString()).toBe('2021-07-22T08:55:00.000Z');
        expect(parseNseTimestamp('nonsense')).toBeNull();
    });
});
