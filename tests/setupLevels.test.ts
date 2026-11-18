import { describe, expect, it } from 'vitest';
import { computeSetupLevels, setupAtr14 } from '../src/setupLevels';
import { Candle, StockIndicators } from '../src/types';

// 30 flat candles: high 101, low 99, close 100 → true range 2, ATR 2.
function candles(): Candle[] {
    return Array.from({ length: 30 }, (_, n) => ({ date: `2025-01-${String(n + 1).padStart(2, '0')}`, open: 100, high: 101, low: 99, close: 100, volume: 1000 }));
}

function ind(overrides: Partial<StockIndicators> = {}): StockIndicators {
    return { candles: candles(), ema20: 99.5, ema50: 98, isDeepValue: false, isBullFlag: false, ...overrides } as StockIndicators;
}

describe('setupAtr14', () => {
    it('averages the last 14 true ranges', () => {
        expect(setupAtr14(candles())).toBe(2);
        expect(setupAtr14(candles().slice(0, 10))).toBe(0);
    });
});

describe('computeSetupLevels', () => {
    it('Pre-Surge: entry above 5-day high, stop at the tightest of base/EMA/ATR, target 4×ATR', () => {
        const levels = computeSetupLevels('Pre-Surge Hybrid Base 🌱', ind(), 2)!;
        expect(levels.entryPrice).toBe(101.1); // 101 × 1.001
        // min(low8 99, ema20×0.985 98.0075, 101.1 − 3) → 98.0075, rounded to tick
        expect(levels.stopLoss).toBe(98);
        expect(levels.targetPrice).toBe(109.1); // 101.1 + 4 × 2
        expect(levels.target2).toBe(112.1);
        expect(levels.slPct).toBeCloseTo(3.07, 2);
    });

    it('Pullback: stop below the 8-day low, target 3×ATR', () => {
        const levels = computeSetupLevels('EMA20 Pullback', ind(), 2)!;
        expect(levels.entryPrice).toBe(101.1);
        expect(levels.stopLoss).toBe(98.4); // 99 × 0.994 = 98.406
        expect(levels.targetPrice).toBe(107.1);
    });

    it('caps the stop at 2.5×ATR below entry', () => {
        const wide = candles();
        wide[25] = { ...wide[25], low: 80 };
        const levels = computeSetupLevels('EMA20 Pullback', ind({ candles: wide }), 2)!;
        expect(levels.stopLoss).toBe(96.1); // 101.1 − 5
    });

    it('returns nothing without a valid ATR or enough history', () => {
        expect(computeSetupLevels('EMA20 Pullback', ind(), 0)).toBeNull();
        expect(computeSetupLevels('EMA20 Pullback', ind({ candles: candles().slice(0, 10) }), 2)).toBeNull();
    });
});
