import { describe, expect, it } from 'vitest';
import {
    assessPreSurgeV3,
    assessV3BreakoutConfirmation,
    assessV3EarlyConfirmation,
} from '../src/preSurgeV3Strategy';
import { Candle, StockIndicators } from '../src/types';

function candles(): Candle[] {
    return Array.from({ length: 220 }, (_, index) => {
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
}

function indicator(): StockIndicators {
    const rows = candles();
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

describe('Pre-Surge V3 strategy', () => {
    it('creates a shadow plan with confirmed-entry and partial-exit rules', () => {
        const plan = assessPreSurgeV3({
            indicator: indicator(),
            atr14: 1,
            breakoutPrice: 101,
            sectorOutperforming: true,
            sectorRs20d: 2,
            marketRegime: 'BULLISH',
        });

        expect(plan.version).toBe('PRE_SURGE_V3');
        expect(plan.shadow).toBe(true);
        expect(plan.earlyEntry.allocationPct).toBe(20);
        expect(plan.earlyEntry.maxEntry).toBeLessThan(plan.breakout.pivot);
        expect(plan.earlyEntry.maximumGapUpPct).toBe(1.5);
        expect(plan.breakout.confirmationTimeframeMinutes).toBe(15);
        expect(plan.exits).toMatchObject({ partialAtR: 2, partialExitPct: 50, finalAtR: 3.5, moveStopToBreakeven: true });
    });

    it('rejects a late Early confirmation above its price cap or breakout pivot', () => {
        const plan = assessPreSurgeV3({
            indicator: indicator(), atr14: 1, breakoutPrice: 101,
            sectorOutperforming: true, marketRegime: 'BULLISH',
        });
        const latePrice = plan.breakout.pivot + 0.5;
        const decision = assessV3EarlyConfirmation({
            plan,
            zoneTouched: true,
            openingGapPct: 0,
            vwap: 99,
            previous5m: { open: 99, high: 100, low: 98.8, close: 99.5 },
            latest5m: { open: 99.5, high: latePrice + 0.1, low: 99, close: latePrice },
            latest15m: { open: 99, high: latePrice + 0.1, low: 98.8, close: latePrice },
            marketSafe: true,
        });
        expect(decision.confirmed).toBe(false);
        expect(decision.rejectionReasons).toContain('Early confirmation arrived after the breakout pivot');
    });

    it('rejects an Early Buy without a prior zone touch and higher low', () => {
        const plan = assessPreSurgeV3({
            indicator: indicator(), atr14: 1, breakoutPrice: 101,
            sectorOutperforming: true, marketRegime: 'BULLISH',
        });
        const decision = assessV3EarlyConfirmation({
            plan,
            zoneTouched: false,
            openingGapPct: 0,
            vwap: 99,
            previous5m: { open: 99, high: 100, low: 99, close: 99.5 },
            latest5m: { open: 99, high: 100.5, low: 98.5, close: 100.4 },
            latest15m: { open: 99, high: 100.5, low: 98.5, close: 100.4 },
            marketSafe: true,
        });
        expect(decision.confirmed).toBe(false);
        expect(decision.rejectionReasons).toContain('Early zone has not been touched');
    });

    it('requires a strong 15-minute close, VWAP and RVOL for breakout confirmation', () => {
        const plan = assessPreSurgeV3({
            indicator: indicator(), atr14: 1, breakoutPrice: 101,
            sectorOutperforming: true, marketRegime: 'BULLISH',
        });
        const decision = assessV3BreakoutConfirmation({
            plan,
            observedPrice: 101.5,
            observedRvol: 1.7,
            vwap: 100,
            latest15m: { open: 100, high: 101.6, low: 99.8, close: 101.5 },
            marketSafe: true,
        });
        expect(decision.rejectionReasons).not.toContain('Same-time RVOL is below 1.5x');
        expect(decision.rejectionReasons).not.toContain('15-minute close is below VWAP');
    });
});
