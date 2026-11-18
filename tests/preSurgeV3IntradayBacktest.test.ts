import { describe, expect, it } from 'vitest';
import {
    buildV3Sessions,
    resolveV3Outcome,
    simulateV3Breakout,
} from '../src/preSurgeV3IntradayBacktest';
import { Candle, PreSurgeV3Plan } from '../src/types';

function timestampAt(date: string, hour: number, minute: number): number {
    // IST is UTC+05:30; these tests use January dates with no DST.
    return Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
        hour - 6,
        minute + 30,
    );
}

function bar(date: string, hour: number, minute: number, open: number, high: number, low: number, close: number, volume = 100): Candle {
    return { date: new Date(timestampAt(date, hour, minute)).toISOString(), timestamp: timestampAt(date, hour, minute), open, high, low, close, volume };
}

function plan(): PreSurgeV3Plan {
    return {
        version: 'PRE_SURGE_V3', shadow: true, eligible: true, score: 90, status: 'V3_READY',
        base: { sessions: 10, rangePct: 5, atrContractionRatio: 0.75, higherLows: true, distributionDays: 0 },
        earlyEntry: {
            zoneLow: 98, zoneHigh: 99, maxEntry: 100, structuralStop: 95, riskPct: 4,
            allocationPct: 20, requireZoneTouch: true, requireFiveMinuteReclaim: true,
            requireHigherLow: true, requireVwap: true, maximumGapDownPct: -1.5, maximumGapUpPct: 1.5,
        },
        breakout: {
            pivot: 101, maxEntry: 102.5, structuralStop: 95, minimumRvol: 1.5,
            confirmationTimeframeMinutes: 15, minimumCloseLocation: 0.75, requireVwap: true, allocationPct: 80,
        },
        exits: {
            partialTarget: 113, partialAtR: 2, partialExitPct: 50, finalTarget: 122,
            finalAtR: 3.5, moveStopToBreakeven: true, trailingMethod: 'EMA10_OR_SUPERTREND',
        },
        positionSizing: { riskBudgetPct: 0.75, maximumPositionPct: 20, suggestedPositionPct: 12.5 },
        reasons: [], rejectionReasons: [],
    };
}

function breakoutHistory(firstFutureOpen = 100): Candle[] {
    const rows: Candle[] = [];
    for (let day = 1; day <= 15; day += 1) {
        const date = `2025-01-${String(day).padStart(2, '0')}`;
        const baseline = day <= 5;
        const volume = baseline ? 50 : 100;
        if (day === 6) {
            rows.push(bar(date, 9, 15, firstFutureOpen, 100.7, 99.8, 100.4, volume));
            rows.push(bar(date, 9, 20, 100.4, 101, 100.2, 100.8, volume));
            rows.push(bar(date, 9, 25, 100.8, 102, 100.7, 101.8, volume));
        } else {
            rows.push(bar(date, 9, 15, 100, 100.5, 99.5, 100, volume));
            rows.push(bar(date, 9, 20, 100, 100.5, 99.5, 100, volume));
            rows.push(bar(date, 9, 25, 100, 100.5, 99.5, 100, volume));
        }
    }
    return rows;
}

describe('Pre-Surge V3 intraday replay', () => {
    it('fills a breakout only on a completed 15-minute confirmation with same-time RVOL', () => {
        const sessions = buildV3Sessions(breakoutHistory());
        const bars = sessions.flatMap(session => session.bars);
        const result = simulateV3Breakout('2025-01-05', plan(), sessions, bars);
        expect(result.status).toBe('FILLED');
        expect(result.triggerRvol).toBeGreaterThanOrEqual(1.5);
        expect(result.confirmationScore).toBe(100);
        expect(result.execution?.fillPrice).toBe(101.8);
    });

    it('rejects a breakout when the first opening is already above the maximum entry', () => {
        const sessions = buildV3Sessions(breakoutHistory(103));
        const bars = sessions.flatMap(session => session.bars);
        const result = simulateV3Breakout('2025-01-05', plan(), sessions, bars);
        expect(result.status).toBe('MISSED_OPEN_GAP');
        expect(result.execution).toBeNull();
    });

    it('takes half at 2R and trails the remainder using information available before the next bar', () => {
        const rows = [
            bar('2025-01-06', 9, 15, 100, 101, 99, 100),
            bar('2025-01-06', 9, 20, 100, 110.5, 100, 110),
            bar('2025-01-06', 9, 25, 110, 112, 101, 102),
        ];
        const sessions = buildV3Sessions(rows);
        const bars = sessions.flatMap(session => session.bars);
        const result = resolveV3Outcome(sessions, bars, bars[0], 100, 95);
        expect(result.partialHitAt).not.toBeNull();
        expect(result.status).toBe('PARTIAL_THEN_TRAIL');
        expect(result.netReturnPct).toBeGreaterThan(4);
    });
});
