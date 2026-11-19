import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { closeConfirmedTrigger, firstFillIndex, istParts } from '../src/research/scoreLiveSetups';

const bar = (date: string, close: number, volume = 1000): PriceBar => ({ date, open: close, high: close + 1, low: close - 1, close, volume });

describe('istParts', () => {
    it('converts the stored UTC time to India time', () => {
        expect(istParts('2026-08-04 03:46:01.139')).toEqual({ date: '2026-08-04', minutes: 9 * 60 + 16 });
        expect(istParts('2026-08-04 19:00:00')).toEqual({ date: '2026-08-05', minutes: 30 });
    });
});

describe('firstFillIndex', () => {
    const bars = [bar('2026-08-03', 100), bar('2026-08-04', 101), bar('2026-08-05', 102)];

    it('uses the same day\'s open only when the setup was created before 09:15 IST', () => {
        expect(firstFillIndex(bars, '2026-08-04 03:40:00')).toBe(1); // 09:10 IST
        expect(firstFillIndex(bars, '2026-08-04 03:46:00')).toBe(2); // 09:16 IST: market already open
        expect(firstFillIndex(bars, '2026-08-04 10:30:00')).toBe(2); // 16:00 IST
    });

    it('returns -1 when no later session exists', () => {
        expect(firstFillIndex(bars, '2026-08-05 11:00:00')).toBe(-1);
    });
});

describe('closeConfirmedTrigger', () => {
    const base = Array.from({ length: 25 }, (_, k) => bar(`2026-07-${String(k + 1).padStart(2, '0')}`, 100));

    it('needs a close at or above entry with heavy volume', () => {
        const bars = [...base, bar('2026-08-01', 106, 1200), bar('2026-08-02', 106, 2000)];
        expect(closeConfirmedTrigger(bars, 25, 105)).toBe(26);
    });

    it('ignores days outside the window', () => {
        const bars = [...base, ...Array.from({ length: 5 }, (_, k) => bar(`2026-08-0${k + 1}`, 100)), bar('2026-08-09', 110, 5000)];
        expect(closeConfirmedTrigger(bars, 25, 105)).toBe(-1);
    });
});
