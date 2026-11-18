import { describe, expect, it } from 'vitest';
import {
    buildSessions,
    normalizeSignalPriceScale,
    simulateBreakout,
} from '../src/preSurgeV2IntradayBacktest';
import { PreSurgeReplaySignal } from '../src/preSurgeV2Replay';
import { Candle } from '../src/types';

function candle(date: string, open: number, high = open, low = open, close = open, volume = 100): Candle {
    const timestamp = new Date(`${date}T09:15:00+05:30`).getTime();
    return { date: new Date(timestamp).toISOString(), timestamp, open, high, low, close, volume };
}

function signal(overrides: Partial<PreSurgeReplaySignal> = {}): PreSurgeReplaySignal {
    return {
        ticker: 'TEST',
        signalDate: '2025-01-07',
        score: 80,
        regime: 'BULLISH',
        close: 100,
        atr14: 2,
        volumeRatio: 0.7,
        breakoutPrice: 105,
        maxBreakoutPrice: 110,
        breakoutStop: 95,
        targetPrice: 125,
        plannedBreakoutRiskReward: 2,
        earlyEntryLow: 98,
        earlyEntryHigh: 101,
        earlyStop: 94,
        plannedEarlyRiskReward: 4,
        earlyAllocationPct: 30,
        breakoutAllocationPct: 70,
        reasons: [],
        ...overrides,
    };
}

describe('Pre-Surge V2 intraday integrity', () => {
    it('normalizes official levels when Dhan history is corporate-action adjusted', () => {
        const sessions = buildSessions([candle('2025-01-07', 100, 101, 99, 100)]);
        const normalized = normalizeSignalPriceScale(signal({
            close: 1_000,
            breakoutPrice: 1_050,
            maxBreakoutPrice: 1_100,
            targetPrice: 1_250,
        }), sessions);

        expect(normalized.factor).toBe(0.1);
        expect(normalized.signal.breakoutPrice).toBe(105);
        expect(normalized.signal.targetPrice).toBe(125);
    });

    it('rejects a later session whose opening gaps above maximum entry', () => {
        const dates = [
            '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05',
            '2025-01-07', '2025-01-08', '2025-01-09', '2025-01-10', '2025-01-11',
            '2025-01-12', '2025-01-13', '2025-01-14', '2025-01-15', '2025-01-16', '2025-01-17',
        ];
        const candles = dates.map(date => candle(date, date === '2025-01-08' ? 120 : 100));
        const sessions = buildSessions(candles);
        const bars = sessions.flatMap(session => session.bars);
        const result = simulateBreakout(signal(), sessions, bars);

        expect(result.status).toBe('MISSED_OPEN_GAP');
        expect(result.openingPrice).toBe(120);
    });
});
