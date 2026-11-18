import { roundToNseTick } from './pricingUtils';
import { StockIndicators } from './types';

/**
 * Entry, stop and target for a classified setup: the single source of truth
 * shared by the live scanner, the historical replay and the setup evidence
 * study, so the levels shown in the app are the levels that were tested.
 */
export interface SetupLevels {
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    target2: number;
    slPct: number;
    targetPct: number;
}

function average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

/** 14-period average true range over the last 15 candles. */
export function setupAtr14(candles: StockIndicators['candles']): number {
    if (candles.length < 15) return 0;
    const ranges: number[] = [];
    for (let index = candles.length - 14; index < candles.length; index += 1) {
        const current = candles[index];
        const previousClose = candles[index - 1].close;
        ranges.push(Math.max(current.high - current.low, Math.abs(current.high - previousClose), Math.abs(current.low - previousClose)));
    }
    return average(ranges);
}

export function computeSetupLevels(setupType: string, ind: StockIndicators, atr14: number): SetupLevels | null {
    const candles = ind.candles;
    if (candles.length < 21 || !(atr14 > 0)) return null;
    const lastCandle = candles[candles.length - 1];
    const previousClose = candles[candles.length - 2]?.close ?? lastCandle.close;
    const high = (count: number) => Math.max(...candles.slice(-count).map(candle => candle.high));
    const low = (count: number) => Math.min(...candles.slice(-count).map(candle => candle.low));

    let rawEntryPrice = lastCandle.high * 1.001;
    if (setupType.includes('Pre-Surge')) rawEntryPrice = Math.max(lastCandle.high, high(5)) * 1.001;
    else if (setupType === 'Leader Pullback Reclaim') rawEntryPrice = Math.max(lastCandle.high, ind.ema20, high(10)) * 1.001;
    else if (setupType === 'Second-Entry Retest') rawEntryPrice = Math.max(lastCandle.high, high(20)) * 1.0012;
    else if (setupType === 'Earnings Reaction Continuation') rawEntryPrice = Math.max(lastCandle.high, high(10), ind.ema20) * 1.001;
    else if (setupType === 'Compression in Leaders') rawEntryPrice = Math.max(lastCandle.high, high(5)) * 1.0015;
    const entryPrice = roundToNseTick(rawEntryPrice);

    let rawStopLoss: number;
    if (setupType.includes('Pre-Surge')) rawStopLoss = Math.min(low(8), ind.ema20 * 0.985, entryPrice - 1.5 * atr14);
    else if (ind.isDeepValue) rawStopLoss = low(15) * 0.99;
    else if (setupType === 'Leader Pullback Reclaim') rawStopLoss = Math.min(low(8), ind.ema20 * 0.993, entryPrice - 1.3 * atr14);
    else if (setupType === 'Second-Entry Retest') rawStopLoss = Math.min(low(12), ind.ema20 * 0.992, entryPrice - 1.5 * atr14);
    else if (setupType === 'Earnings Reaction Continuation') rawStopLoss = Math.min(low(5), previousClose * 0.995, entryPrice - 1.4 * atr14);
    else if (setupType === 'Compression in Leaders') rawStopLoss = Math.min(low(5), ind.ema20 * 0.994, entryPrice - 1.25 * atr14);
    else if (setupType.includes('VCP') || ind.isBullFlag || setupType === 'Squeeze Breakout' || setupType === 'Compression Breakout') rawStopLoss = low(5) * 0.993;
    else if (setupType.includes('Pullback')) rawStopLoss = low(8) * 0.994;
    else rawStopLoss = Math.min(ind.ema20 * 0.99, entryPrice - 1.5 * atr14);

    if (entryPrice - rawStopLoss > 2.5 * atr14) rawStopLoss = entryPrice - 2.5 * atr14;
    if (rawStopLoss >= entryPrice) rawStopLoss = entryPrice - atr14;
    const stopLoss = roundToNseTick(rawStopLoss);
    if (stopLoss <= 0 || stopLoss >= entryPrice) return null;

    const targetAtrMultiplier = setupType.includes('Pre-Surge') ? 4.0
        : setupType === 'Leader Pullback Reclaim' ? 2.8
            : setupType === 'Second-Entry Retest' ? 3.1
                : setupType === 'Earnings Reaction Continuation' ? 3.4
                    : setupType === 'Compression in Leaders' ? 3.2
                        : setupType === 'Deep Value Reversion 📉' ? 2.6 : 3.0;
    let targetPrice = roundToNseTick(entryPrice + targetAtrMultiplier * atr14);
    if (ind.isDeepValue && ind.ema50 > entryPrice + (2.0 * atr14)) targetPrice = roundToNseTick(ind.ema50);
    const target2 = roundToNseTick(targetPrice + 1.5 * atr14);

    return {
        entryPrice,
        stopLoss,
        targetPrice,
        target2,
        slPct: +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2),
        targetPct: +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2),
    };
}
