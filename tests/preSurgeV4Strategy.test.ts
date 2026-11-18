import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Candle, StockIndicators } from '../src/types';

// Five-minute candles served by the mocked broker client for the intraday path.
let intradayCandles: Candle[] = [];
vi.mock('../src/dhanClient', () => ({
    getDhanApiFromEnv: () => ({ getHistoricalData: async () => intradayCandles }),
}));

import { assessPreSurgeV4, assessV4BreakoutConfirmation } from '../src/preSurgeV4Strategy';
import { clearV3IntradayCache, evaluateV4BreakoutShadow } from '../src/preSurgeV3Intraday';
import { shadowPlanForStorage } from '../src/scanStorage';
import { dedupeObservations } from '../src/setupValidationReport';

function dailyCandles(distributionDays = 0): Candle[] {
    const rows = Array.from({ length: 220 }, (_, index) => {
        const trend = 82 + (index * 0.08);
        const inBase = index >= 200;
        const close = inBase ? 99 + ((index % 4) * 0.2) : trend;
        return {
            date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
            open: close - 0.15,
            high: close + (inBase ? 0.45 : 0.8),
            low: close - (inBase ? 0.35 : 0.8),
            close,
            volume: inBase ? 60_000 : 100_000,
        };
    });
    // A distribution day is a down close on above-average volume.
    for (let n = 0; n < distributionDays; n += 1) {
        const row = rows[rows.length - 8 + n];
        row.open = row.close + 0.1;
        row.high = Math.max(row.high, row.open);
        row.volume = 120_000;
    }
    return rows;
}

function indicator(distributionDays = 0): StockIndicators {
    const rows = dailyCandles(distributionDays);
    return {
        ticker: 'TEST', ltp: rows.at(-1)!.close, dma200: 90, ema50: 96, ema20: 99,
        rsi14: 55, adx14: 25, ema50Slope: 1, avgVolume20d: 100_000,
        todayVolume: 60_000, volumeRatio: 0.6, high3m: 101, low3m: 88,
        high52w: 103, pctFrom52wHigh: 3, distFrom200: 10, returns3m: 16,
        returns1m: 4, returns6m: 22, returns10d: 1, nifty3mReturn: 8,
        nifty1mReturn: 2, outperformsNifty: true, accumulationScore: 65,
        timeSeriesMomentumBullish: true, isLeader: true, leaderScore: 8,
        isLeaderPullbackReclaim: false, isSecondEntryRetest: false,
        isEarningsReactionContinuation: false, isCompressionInLeaders: false,
        ichimokuTenkan: 99, ichimokuKijun: 97, ichimokuSpanA: 98,
        ichimokuSpanB: 95, ichimokuCloudTop: 98, ichimokuCloudBottom: 95,
        ichimokuBullish: true, supertrend: 98.8, supertrendBullish: true,
        supertrendBullishDays: 5, acceptanceScore: 7, absorptionScore: 7,
        efficiencyRatio: 0.7, efficiencyScore: 7, persistenceScore: 7,
        breakoutRetentionScore: 7, failureRiskScore: 3, relativeStrengthAcceleration: 2,
        relativeStrengthAccelerationScore: 7, preMoveScore: 7, isSqueeze: false,
        squeezeTightness: 4, isPocketPivot: false, candles: rows,
    };
}

function plan(distributionDays = 0) {
    return assessPreSurgeV4({
        indicator: indicator(distributionDays),
        atr14: 1,
        breakoutPrice: 101,
        sectorOutperforming: true,
        sectorRs20d: 2,
        marketRegime: 'BULLISH',
    });
}

// 2026-11-20 09:15 IST = 03:45 UTC.
const SESSION_OPEN_UTC = Date.parse('2026-11-20T03:45:00.000Z');
function fiveMinute(index: number, bar: { open: number; high: number; low: number; close: number }, volume = 50_000): Candle {
    const timestamp = SESSION_OPEN_UTC + index * 5 * 60_000;
    return { date: new Date(timestamp).toISOString(), timestamp, volume, ...bar } as Candle;
}
const AT_0931_IST = new Date(SESSION_OPEN_UTC + 16 * 60_000);

describe('Pre-Surge V4 qualification', () => {
    it('qualifies a clean base with zero distribution days', () => {
        const result = plan(0);
        expect(result.version).toBe('PRE_SURGE_V4');
        expect(result.eligible).toBe(true);
    });

    it('allows at most one distribution day, as the rule documents', () => {
        expect(plan(1).eligible).toBe(true);
        expect(plan(2).eligible).toBe(false);
    });
});

describe('Pre-Surge V4 live breakout confirmation', () => {
    beforeEach(() => clearV3IntradayCache());

    it('rejects a flat bar, which the old live path fabricated from the tick price', () => {
        const decision = assessV4BreakoutConfirmation({
            plan: plan(),
            observedPrice: 101.4,
            observedRvol: 2,
            stockVwap: 101.4,
            latest15m: { open: 101.4, high: 101.4, low: 101.4, close: 101.4 },
        });
        expect(decision.confirmed).toBe(false);
        expect(decision.rejectionReasons).toContain('15-minute close is not in upper 25%');
    });

    it('confirms on real completed 5-minute bars aggregated to 15 minutes with session VWAP', async () => {
        intradayCandles = [
            fiveMinute(0, { open: 100.2, high: 100.6, low: 100.0, close: 100.5 }),
            fiveMinute(1, { open: 100.5, high: 101.0, low: 100.4, close: 100.9 }),
            fiveMinute(2, { open: 100.9, high: 101.5, low: 100.8, close: 101.45 }),
            // Still forming at 09:31 IST; must be ignored.
            fiveMinute(3, { open: 101.45, high: 103, low: 99, close: 99.2 }),
        ];
        const result = await evaluateV4BreakoutShadow({
            ticker: 'TEST', plan: plan(), observedRvol: 1.8, observedAt: AT_0931_IST,
        });
        expect(result).not.toBeNull();
        expect(result!.structure.fiveMinuteBars).toBe(3);
        expect(result!.structure.latest15m.close).toBe(101.45);
        expect(result!.decision.rejectionReasons).toEqual([]);
        expect(result!.decision.confirmed).toBe(true);
    });

    it('rejects a breakout that closes weak in its 15-minute range', async () => {
        intradayCandles = [
            fiveMinute(0, { open: 100.2, high: 100.6, low: 100.0, close: 100.5 }),
            fiveMinute(1, { open: 100.5, high: 102.0, low: 100.4, close: 101.8 }),
            fiveMinute(2, { open: 101.8, high: 101.9, low: 100.9, close: 101.1 }),
        ];
        const result = await evaluateV4BreakoutShadow({
            ticker: 'TEST', plan: plan(), observedRvol: 1.8, observedAt: AT_0931_IST,
        });
        expect(result!.decision.confirmed).toBe(false);
        expect(result!.decision.rejectionReasons).toContain('15-minute close is not in upper 25%');
    });
});

describe('V4 persistence', () => {
    it('stores the V4 plan so the live V4 observer can find it', () => {
        const v4 = plan();
        expect(shadowPlanForStorage({ preSurgeV4: v4, preSurgeV3: undefined })).toEqual({
            shadowStrategyVersion: 'PRE_SURGE_V4_SHADOW', shadowPlan: v4,
        });
        expect(shadowPlanForStorage({ preSurgeV4: undefined, preSurgeV3: undefined })).toEqual({
            shadowStrategyVersion: null, shadowPlan: null,
        });
    });
});

describe('validation report duplicates', () => {
    const setup = (ticker: string, setupType = 'Bull Flag Breakout') => ({ ticker, setupType, buyZone: 100, stopLoss: 95, target: 110 });

    it('counts a setup seen on repeated scans once within the outcome window', () => {
        const { kept, duplicates } = dedupeObservations([
            { scanDay: '2026-11-18', setup: setup('CUPID') },
            { scanDay: '2026-11-18', setup: setup('CUPID') },
            { scanDay: '2026-11-20', setup: setup('cupid') },
            { scanDay: '2026-11-18', setup: setup('CUPID', 'EMA50 Pullback') },
            { scanDay: '2026-12-10', setup: setup('CUPID') },
        ]);
        expect(duplicates).toBe(2);
        expect(kept.map(o => `${o.scanDay}:${o.setup.setupType}`)).toEqual([
            '2026-11-18:Bull Flag Breakout',
            '2026-11-18:EMA50 Pullback',
            '2026-12-10:Bull Flag Breakout',
        ]);
    });
});
