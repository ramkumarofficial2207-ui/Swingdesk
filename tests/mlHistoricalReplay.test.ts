import { describe, expect, it } from 'vitest';
import { deterministicUuid, resolveHistoricalOutcome } from '../src/mlHistoricalReplay';

function row(date: string, high: number, low: number, volume = 100): any {
    return {
        symbol: 'TEST',
        tradingDate: new Date(`${date}T00:00:00.000Z`),
        open: (high + low) / 2,
        high,
        low,
        close: (high + low) / 2,
        volume: BigInt(volume),
        turnoverCr: 10,
        totalTrades: 1_000,
        deliveryQty: null,
        deliveryPct: null,
    };
}

function history(future: Array<{ high: number; low: number; volume?: number }>): any[] {
    const rows = Array.from({ length: 25 }, (_, index) => row(`2023-01-${String(index + 1).padStart(2, '0')}`, 99, 95, 100));
    future.forEach((value, index) => rows.push(row(`2023-02-${String(index + 1).padStart(2, '0')}`, value.high, value.low, value.volume ?? 100)));
    while (rows.length < 55) rows.push(row(`2023-03-${String(rows.length - 24).padStart(2, '0')}`, 102, 98, 100));
    return rows;
}

describe('historical ML replay', () => {
    it('creates stable UUIDs for idempotent replay writes', () => {
        const first = deterministicUuid('batch:2023-01-01');
        expect(first).toBe(deterministicUuid('batch:2023-01-01'));
        expect(first).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('labels a volume-confirmed trigger that reaches target as WON', () => {
        const rows = history([
            { high: 101, low: 99, volume: 200 },
            { high: 112, low: 101, volume: 120 },
        ]);
        const result = resolveHistoricalOutcome({
            rows,
            signalIndex: 24,
            entryPrice: 100,
            stopLoss: 95,
            targetPrice: 110,
            triggerWindow: 5,
            outcomeWindow: 20,
        });
        expect(result).toMatchObject({
            outcome: 'WON',
            rMultiple: 2,
            triggered: true,
            triggeredAt: '2023-02-01',
            daysToTrigger: 1,
            postTriggerOutcome: 'WON',
            timeExit: false,
        });
        expect(result?.maximumR).toBeGreaterThanOrEqual(2);
    });

    it('resolves same-bar target and stop ambiguity conservatively as LOST', () => {
        const rows = history([{ high: 112, low: 94, volume: 200 }]);
        const result = resolveHistoricalOutcome({
            rows,
            signalIndex: 24,
            entryPrice: 100,
            stopLoss: 95,
            targetPrice: 110,
            triggerWindow: 5,
            outcomeWindow: 20,
        });
        expect(result).toMatchObject({ outcome: 'LOST', rMultiple: -1, triggered: true, postTriggerOutcome: 'LOST' });
    });

    it('labels a setup without price and volume confirmation as EXPIRED', () => {
        const rows = history(Array.from({ length: 5 }, () => ({ high: 99, low: 96, volume: 200 })));
        const result = resolveHistoricalOutcome({
            rows,
            signalIndex: 24,
            entryPrice: 100,
            stopLoss: 95,
            targetPrice: 110,
            triggerWindow: 5,
            outcomeWindow: 20,
        });
        expect(result).toMatchObject({
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
            { high: 101, low: 99, volume: 200 },
            ...Array.from({ length: 20 }, () => ({ high: 104, low: 97, volume: 100 })),
        ]);
        const result = resolveHistoricalOutcome({
            rows,
            signalIndex: 24,
            entryPrice: 100,
            stopLoss: 95,
            targetPrice: 110,
            triggerWindow: 5,
            outcomeWindow: 20,
        });
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
