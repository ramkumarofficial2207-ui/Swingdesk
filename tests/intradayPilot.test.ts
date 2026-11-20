import { describe, expect, it } from 'vitest';
import { chunkRange, dayQuality, istParts, pickSpread } from '../src/research/intradayPilot';

describe('intraday pilot helpers', () => {
    it('spreads picks across the whole ranked list', () => {
        const ranked = Array.from({ length: 500 }, (_, i) => i + 1);
        const picks = pickSpread(ranked, 50);
        expect(picks).toHaveLength(50);
        expect(picks[0]).toBe(1);
        expect(picks.at(-1)).toBe(491);
        expect(pickSpread([1, 2], 50)).toEqual([1, 2]);
    });

    it('chunks a year into windows Dhan accepts (≤ 90 days)', () => {
        const from = new Date('2025-11-20T00:00:00Z');
        const to = new Date('2026-11-20T00:00:00Z');
        const chunks = chunkRange(from, to, 89);
        expect(chunks[0][0]).toEqual(from);
        expect(chunks.at(-1)![1]).toEqual(to);
        for (const [start, end] of chunks) expect((end.getTime() - start.getTime()) / 86_400_000).toBeLessThanOrEqual(89);
        for (let i = 1; i < chunks.length; i += 1) expect(chunks[i][0]).toEqual(chunks[i - 1][1]);
    });

    it('converts instants to IST session date and time', () => {
        expect(istParts(new Date('2026-11-19T03:45:00Z'))).toEqual({ date: '2026-11-19', time: '09:15' });
        expect(istParts(new Date('2026-11-19T19:00:00Z'))).toEqual({ date: '2026-11-20', time: '00:30' });
    });

    it('scores a stock-day against the official daily candle', () => {
        const bars = [
            { time: '09:15', open: 100, high: 101, low: 99.5, close: 100.5, volume: 600 },
            { time: '09:20', open: 100.5, high: 102, low: 100, close: 101.8, volume: 400 },
        ];
        const q = dayQuality(bars, { open: 100, high: 102, low: 99.5, close: 102, volume: 1000 });
        expect(q.bars).toBe(2);
        expect(q.startsAt0915).toBe(true);
        expect(q.volumeRatio).toBe(1);
        expect(q.openGapPct).toBe(0);
        expect(q.closeGapPct).toBeCloseTo(-0.196, 2);
        expect(q.rangeInsideDaily).toBe(true);
        expect(dayQuality(bars, { open: 100, high: 101, low: 99.5, close: 102, volume: 1000 }).rangeInsideDaily).toBe(false);
        expect(dayQuality(bars, undefined).volumeRatio).toBeNull();
    });
});
