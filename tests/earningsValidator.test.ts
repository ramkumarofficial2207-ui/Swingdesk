import { describe, expect, it } from 'vitest';
import { assessEarningsRisk, istToday, parseEventCalendar, parseNseDate } from '../src/earningsValidator';

// Shape returned by https://www.nseindia.com/api/event-calendar
const payload = [
    { symbol: 'GVPTECH', purpose: 'Financial Results', date: '20-Nov-2026', bm_desc: '...' },
    { symbol: 'INDIANB', purpose: 'Fund Raising', date: '20-Nov-2026' },
    { symbol: 'ACME', purpose: 'Financial Results/Other business matters', date: '30-Nov-2026' },
    { symbol: 'ACME', purpose: 'Financial Results', date: '15-Nov-2026' },
    { symbol: '', purpose: 'Financial Results', date: '20-Nov-2026' },
    { symbol: 'BAD', purpose: 'Financial Results', date: 'soon' },
];
const events = parseEventCalendar(payload);
const today = new Date(Date.UTC(2026, 10, 19)); // 19 Nov 2026

describe('NSE event calendar parsing', () => {
    it('parses NSE dates and drops malformed rows', () => {
        expect(parseNseDate('20-Nov-2026')?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
        expect(parseNseDate('2026-11-20')).toBeNull();
        expect(events.map(e => e.symbol)).toEqual(['GVPTECH', 'INDIANB', 'ACME', 'ACME']);
    });

    it('returns no events for an unexpected payload', () => {
        expect(parseEventCalendar({ error: 'blocked' })).toEqual([]);
    });
});

describe('assessEarningsRisk', () => {
    it('blocks a setup with results inside the window', () => {
        const result = assessEarningsRisk('GVPTECH.NS', events, 6, today);
        expect(result).toMatchObject({ blocked: true, checked: true, daysUntilEarnings: 1 });
        expect(result.reason).toMatch(/2026-11-20 \(in 1 day\)/);
    });

    it('ignores non-results meetings', () => {
        expect(assessEarningsRisk('INDIANB', events, 6, today)).toMatchObject({ blocked: false, checked: true });
    });

    it('ignores past meetings and allows results beyond the window', () => {
        const result = assessEarningsRisk('ACME', events, 6, today);
        expect(result).toMatchObject({ blocked: false, checked: true, daysUntilEarnings: 11 });
        expect(assessEarningsRisk('ACME', events, 11, today).blocked).toBe(true);
    });

    it('reports unknown risk when the calendar is unavailable, never "safe"', () => {
        const result = assessEarningsRisk('GVPTECH', null, 6, today);
        expect(result).toMatchObject({ blocked: false, checked: false });
        expect(result.reason).toMatch(/unavailable/);
    });
});

describe('istToday', () => {
    it('uses the Indian calendar date', () => {
        // 20:00 UTC on 18 Nov is 01:30 IST on 19 Nov.
        expect(istToday(new Date('2026-11-18T20:00:00Z')).toISOString()).toBe('2026-11-19T00:00:00.000Z');
    });
});
