import { describe, expect, it } from 'vitest';
import { classify, indiaToday, weekdaysBetween } from '../src/dataFreshness';

describe('weekdaysBetween', () => {
    it('skips weekends', () => {
        expect(weekdaysBetween('2026-11-13', '2026-11-16')).toBe(1); // Fri → Mon
        expect(weekdaysBetween('2026-11-19', '2026-11-19')).toBe(0);
        expect(weekdaysBetween('2026-07-31', '2026-11-19')).toBe(79); // Aug 21 + Sep 22 + Oct 22 + Nov 1–19 14
    });
});

describe('classify', () => {
    it('flags a feed past its allowed lag', () => {
        expect(classify('deals', '2026-07-31', '2026-11-19', 3, false).status).toBe('STALE');
        expect(classify('candles', '2026-11-18', '2026-11-19', 1, true).status).toBe('OK');
        expect(classify('empty', null, '2026-11-19', 1, true).status).toBe('EMPTY');
    });
});

describe('indiaToday', () => {
    it('uses the India date late in the UTC day', () => {
        expect(indiaToday(new Date('2026-11-19T19:00:00Z'))).toBe('2026-11-20');
        expect(indiaToday(new Date('2026-11-19T10:00:00Z'))).toBe('2026-11-19');
    });
});
