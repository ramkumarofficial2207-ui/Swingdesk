import { describe, expect, it } from 'vitest';
import { parseDhanCandles } from '../src/dhanClient';

describe('Dhan candle parsing', () => {
    it('preserves and sorts full intraday timestamps', () => {
        const candles = parseDhanCandles({
            open: [101, 100],
            high: [102, 101],
            low: [100, 99],
            close: [101.5, 100.5],
            volume: [200, 100],
            timestamp: [1_725_594_600, 1_725_594_300],
        });

        expect(candles).toHaveLength(2);
        expect(candles[0].timestamp).toBe(1_725_594_300_000);
        expect(candles[0].date).toContain('T');
        expect(candles[1].timestamp).toBe(1_725_594_600_000);
    });

    it('normalizes malformed high and low values without dropping valid prices', () => {
        const candles = parseDhanCandles({
            open: [100],
            high: [0],
            low: [0],
            close: [102],
            volume: [-4],
            timestamp: [1_725_594_300],
        });

        expect(candles[0]).toMatchObject({ high: 102, low: 100, volume: 0 });
    });
});
