import { describe, expect, it } from 'vitest';
import { localDate, parseChart } from '../src/globalMarketBackfill';

describe('localDate', () => {
    it('dates bars in the exchange time zone across daylight saving', () => {
        expect(localDate(Date.UTC(2024, 6, 1, 4, 0) / 1000, 'America/New_York')).toBe('2024-07-01'); // 00:00 EDT
        expect(localDate(Date.UTC(2024, 11, 2, 5, 0) / 1000, 'America/New_York')).toBe('2024-12-02'); // 00:00 EST
        expect(localDate(Date.UTC(2024, 5, 30, 23, 0) / 1000, 'Europe/London')).toBe('2024-07-01'); // 00:00 BST
    });
});

describe('parseChart', () => {
    const payload = (timestamps: number[], closes: Array<number | null>) => ({
        chart: { result: [{ meta: { exchangeTimezoneName: 'America/New_York' }, timestamp: timestamps, indicators: { quote: [{ open: closes, high: closes, low: closes, close: closes }] } }] },
    });

    it('drops null closes and the still-trading current day', () => {
        const ts = [Date.UTC(2024, 6, 1, 4) / 1000, Date.UTC(2024, 6, 2, 4) / 1000, Date.UTC(2024, 6, 3, 13, 30) / 1000];
        const bars = parseChart(payload(ts, [4.1, null, 4.3]), new Date(Date.UTC(2024, 6, 3, 15)));
        expect(bars).toEqual([{ date: '2024-07-01', open: 4.1, high: 4.1, low: 4.1, close: 4.1 }]);
    });

    it('returns nothing for an empty response', () => {
        expect(parseChart({ chart: { result: null } })).toEqual([]);
    });
});
