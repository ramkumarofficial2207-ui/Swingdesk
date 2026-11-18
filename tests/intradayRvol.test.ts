import { describe, expect, it } from 'vitest';
import { calculateIntradayRvol } from '../src/intradayRvol';
import { Candle } from '../src/types';

function candle(utc: string, volume: number, close = 100): Candle {
    return {
        date: utc,
        open: close,
        high: close,
        low: close,
        close,
        volume,
    };
}

describe('same-time intraday RVOL', () => {
    it('compares current cumulative volume with prior-session cumulative volume', async () => {
        const candles = [
            candle('2026-08-05T03:45:00.000Z', 100), // 09:15 IST
            candle('2026-08-05T04:30:00.000Z', 100), // 10:00 IST
            candle('2026-08-06T03:45:00.000Z', 100),
            candle('2026-08-06T04:30:00.000Z', 100),
            candle('2026-08-07T03:45:00.000Z', 100),
            candle('2026-08-07T04:30:00.000Z', 100),
        ];

        const observation = await calculateIntradayRvol(
            'RVOL_TEST_A',
            300,
            new Date('2026-08-10T04:30:00.000Z'), // 10:00 IST
            candles,
        );

        expect(observation).toMatchObject({
            rvol: 1.5,
            baselineVolume: 200,
            sampleCount: 3,
            bucket: '10:00',
        });
    });

    it('does not confirm RVOL when the historical sample is too small', async () => {
        const candles = [
            candle('2026-08-07T03:45:00.000Z', 100),
            candle('2026-08-07T04:30:00.000Z', 100),
        ];

        const observation = await calculateIntradayRvol(
            'RVOL_TEST_B',
            300,
            new Date('2026-08-10T04:30:00.000Z'),
            candles,
        );

        expect(observation).toBeNull();
    });

    it('ignores pre-market and post-market candles in the baseline', async () => {
        const candles = [
            candle('2026-08-05T03:00:00.000Z', 10000), // 08:30 IST
            candle('2026-08-05T03:45:00.000Z', 100),
            candle('2026-08-05T04:30:00.000Z', 100),
            candle('2026-08-06T03:45:00.000Z', 100),
            candle('2026-08-06T04:30:00.000Z', 100),
            candle('2026-08-07T03:45:00.000Z', 100),
            candle('2026-08-07T04:30:00.000Z', 100),
        ];

        const observation = await calculateIntradayRvol(
            'RVOL_TEST_C',
            300,
            new Date('2026-08-10T04:30:00.000Z'),
            candles,
        );

        expect(observation?.rvol).toBe(1.5);
    });
});
