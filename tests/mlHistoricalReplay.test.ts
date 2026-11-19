import { describe, expect, it } from 'vitest';
import { deterministicUuid, resolveHistoricalOutcome } from '../src/mlHistoricalReplay';

interface Bar { high: number; low: number; open?: number; close?: number; volume?: number }

function row(date: string, bar: Bar): any {
    const mid = (bar.high + bar.low) / 2;
    return {
        symbol: 'TEST',
        tradingDate: new Date(`${date}T00:00:00.000Z`),
        open: bar.open ?? mid,
        high: bar.high,
        low: bar.low,
        close: bar.close ?? mid,
        volume: BigInt(bar.volume ?? 100),
        turnoverCr: 10,
        totalTrades: 1_000,
        deliveryQty: null,
        deliveryPct: null,
    };
}

function history(future: Bar[]): any[] {
    const rows = Array.from({ length: 25 }, (_, index) => row(`2023-01-${String(index + 1).padStart(2, '0')}`, { high: 99, low: 95 }));
    future.forEach((value, index) => rows.push(row(`2023-02-${String(index + 1).padStart(2, '0')}`, value)));
    while (rows.length < 55) rows.push(row(`2023-03-${String(rows.length - 24).padStart(2, '0')}`, { high: 102, low: 98 }));
    return rows;
}

const plan = { signalIndex: 24, entryPrice: 100, stopLoss: 95, targetPrice: 110, triggerWindow: 5, outcomeWindow: 20 };

describe('historical ML replay', () => {
    it('creates stable UUIDs for idempotent replay writes', () => {
        const first = deterministicUuid('batch:2023-01-01');
        expect(first).toBe(deterministicUuid('batch:2023-01-01'));
        expect(first).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('triggers on a volume-confirmed close above entry and fills at the next open', () => {
        const rows = history([
            { high: 102, low: 99, close: 101, volume: 200 },
            { open: 101, high: 112, low: 100, volume: 120 },
        ]);
        const result = resolveHistoricalOutcome({ rows, ...plan });
        expect(result).toMatchObject({
            outcome: 'WON',
            rMultiple: 1.5, // (110 − 101) / (101 − 95)
            triggered: true,
            triggeredAt: '2023-02-01',
            daysToTrigger: 1,
            postTriggerOutcome: 'WON',
            timeExit: false,
        });
    });

    it('does not trigger on an intraday high that closes back below entry (old look-ahead case)', () => {
        const rows = history([
            { high: 103, low: 98, close: 99, volume: 300 },
            ...Array.from({ length: 4 }, () => ({ high: 99, low: 96 })),
        ]);
        expect(resolveHistoricalOutcome({ rows, ...plan })).toMatchObject({ outcome: 'EXPIRED', triggered: false });
    });

    it('resolves same-bar target and stop ambiguity conservatively as LOST', () => {
        const rows = history([
            { high: 101, low: 99, close: 100, volume: 200 },
            { open: 100, high: 112, low: 94 },
        ]);
        expect(resolveHistoricalOutcome({ rows, ...plan })).toMatchObject({ outcome: 'LOST', rMultiple: -1, triggered: true, postTriggerOutcome: 'LOST' });
    });

    it('takes a gap below the stop as a loss at the open', () => {
        const rows = history([
            { high: 101, low: 99, close: 100, volume: 200 },
            { open: 100, high: 101, low: 99 },
            { open: 90, high: 92, low: 88 },
        ]);
        const result = resolveHistoricalOutcome({ rows, ...plan })!;
        expect(result.outcome).toBe('LOST');
        expect(result.rMultiple).toBe(-2); // (90 − 100) / (100 − 95)
    });

    it('skips a fill that opens above the target as a chase', () => {
        const rows = history([
            { high: 101, low: 99, close: 100, volume: 200 },
            { open: 111, high: 113, low: 110 },
        ]);
        expect(resolveHistoricalOutcome({ rows, ...plan })).toMatchObject({ outcome: 'EXPIRED', triggered: false });
    });

    it('labels a setup without price and volume confirmation as EXPIRED', () => {
        const rows = history(Array.from({ length: 5 }, () => ({ high: 99, low: 96, volume: 200 })));
        expect(resolveHistoricalOutcome({ rows, ...plan })).toMatchObject({
            outcome: 'EXPIRED',
            triggered: false,
            triggeredAt: null,
            daysToTrigger: null,
            postTriggerOutcome: null,
            rMultiple: 0,
        });
    });

    it('separates a triggered time exit from a setup that never triggered', () => {
        const rows = history([
            { high: 101, low: 99, close: 100, volume: 200 },
            ...Array.from({ length: 20 }, () => ({ open: 100, high: 104, low: 97 })),
        ]);
        const result = resolveHistoricalOutcome({ rows, ...plan });
        expect(result).toMatchObject({
            outcome: 'EXPIRED',
            triggered: true,
            postTriggerOutcome: 'TIME_EXIT',
            timeExit: true,
            daysToTrigger: 1,
        });
        expect(result?.maximumR).toBe(0.8);
        expect(result?.minimumR).toBe(-0.6);
    });
});
