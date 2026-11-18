import { describe, expect, it } from 'vitest';
import { assessEarlyBuy } from '../src/earlyBuyStrategy';

describe('Pre-Surge early buy assessment', () => {
    it('marks a supported, dry-volume base as shadow-ready', () => {
        const result = assessEarlyBuy({
            ltp: 92,
            ema20: 91.5,
            ema50: 88,
            dma200: 80,
            supertrend: 87,
            supertrendBullish: true,
            supertrendBullishDays: 6,
            rsi14: 56,
            volumeRatio: 0.65,
            relativeStrengthVsNifty: 8,
            accumulationScore: 68,
            preMoveScore: 8,
            relativeStrengthAccelerationScore: 7,
            compressionQuality: 8,
            atr14: 2,
            recentLow: 88,
            breakoutPrice: 100,
            targetPrice: 125,
        });

        expect(result).toMatchObject({
            eligible: true,
            status: 'EARLY_BUY_READY',
            shadow: true,
            allocationPct: 30,
        });
        expect(result.zoneHigh).toBeLessThan(100);
        expect(result.plannedRiskReward).toBeGreaterThanOrEqual(2.5);
    });

    it('rejects a bearish Supertrend even when price is near EMA20', () => {
        const result = assessEarlyBuy({
            ltp: 92,
            ema20: 91.5,
            ema50: 88,
            dma200: 80,
            supertrend: 95,
            supertrendBullish: false,
            rsi14: 56,
            volumeRatio: 0.65,
            relativeStrengthVsNifty: 8,
            accumulationScore: 68,
            preMoveScore: 8,
            relativeStrengthAccelerationScore: 7,
            compressionQuality: 8,
            atr14: 2,
            recentLow: 88,
            breakoutPrice: 100,
            targetPrice: 125,
        });

        expect(result.eligible).toBe(false);
        expect(result.status).toBe('MONITOR_BASE');
    });
});
