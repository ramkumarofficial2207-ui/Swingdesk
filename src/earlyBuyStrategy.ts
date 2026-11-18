import { calculateRiskReward } from './executionIntegrity';

export interface EarlyBuyInputs {
    ltp: number;
    ema20: number;
    ema50: number;
    dma200: number;
    supertrend: number;
    supertrendBullish: boolean;
    supertrendBullishDays?: number;
    rsi14: number;
    volumeRatio: number;
    relativeStrengthVsNifty: number;
    accumulationScore: number;
    preMoveScore: number;
    relativeStrengthAccelerationScore: number;
    compressionQuality: number;
    atr14: number;
    recentLow: number;
    breakoutPrice: number;
    targetPrice: number;
}

export interface EarlyBuyAssessment {
    eligible: boolean;
    status: 'EARLY_BUY_READY' | 'MONITOR_BASE';
    score: number;
    zoneLow: number;
    zoneHigh: number;
    stopLoss: number;
    targetPrice: number;
    plannedRiskReward: number;
    allocationPct: number;
    shadow: boolean;
    reasons: string[];
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function roundPrice(value: number): number {
    return +value.toFixed(2);
}

/**
 * Scores an early entry inside an existing Pre-Surge base. This does not
 * replace the breakout trigger. It creates a smaller, explicitly shadowed
 * first leg only when trend, support, dry-up and relative strength agree.
 */
export function assessEarlyBuy(inputs: EarlyBuyInputs, shadow = true): EarlyBuyAssessment {
    const distanceToEma20Pct = Math.abs(inputs.ltp - inputs.ema20) / Math.max(inputs.ema20, 1) * 100;
    const trendAligned = inputs.ema20 > inputs.ema50 && inputs.ema50 > inputs.dma200;
    const supertrendSupport = inputs.supertrendBullish && inputs.ltp > inputs.supertrend;
    const volumeDryUp = inputs.volumeRatio >= 0.25 && inputs.volumeRatio <= 0.9;
    const momentumBalanced = inputs.rsi14 >= 45 && inputs.rsi14 <= 67;

    let score = 0;
    const reasons: string[] = [];
    if (trendAligned) {
        score += 20;
        reasons.push('EMA20 > EMA50 > DMA200');
    }
    if (supertrendSupport) {
        score += 18;
        reasons.push(`Supertrend bullish${inputs.supertrendBullishDays ? ` for ${inputs.supertrendBullishDays} sessions` : ''}`);
    }
    if (distanceToEma20Pct <= 2) {
        score += 14;
        reasons.push(`Price ${distanceToEma20Pct.toFixed(1)}% from EMA20`);
    } else if (distanceToEma20Pct <= 3) {
        score += 8;
    }
    if (volumeDryUp) {
        score += 13;
        reasons.push(`Volume dry-up ${inputs.volumeRatio.toFixed(2)}x`);
    }
    if (inputs.relativeStrengthVsNifty >= 5) {
        score += 12;
        reasons.push(`RS +${inputs.relativeStrengthVsNifty.toFixed(1)}% vs Nifty`);
    } else if (inputs.relativeStrengthVsNifty >= 2) {
        score += 7;
    }
    if (inputs.accumulationScore >= 55) {
        score += 8;
        reasons.push(`Accumulation ${inputs.accumulationScore.toFixed(0)}/100`);
    }
    score += clamp(inputs.preMoveScore, 0, 10) * 0.6;
    score += clamp(inputs.compressionQuality, 0, 10) * 0.5;
    score += clamp(inputs.relativeStrengthAccelerationScore, 0, 10) * 0.4;
    if (momentumBalanced) score += 4;
    score = +clamp(score, 0, 100).toFixed(1);

    const lowerReference = Math.min(inputs.ltp, inputs.ema20);
    const upperReference = Math.max(inputs.ltp, inputs.ema20);
    const zoneLow = roundPrice(Math.max(inputs.supertrend, lowerReference - (0.25 * inputs.atr14)));
    const zoneHigh = roundPrice(Math.max(
        zoneLow,
        Math.min(inputs.breakoutPrice * 0.98, upperReference + (0.25 * inputs.atr14)),
    ));
    const structuralStop = Math.min(inputs.recentLow, inputs.supertrend, inputs.ema20 - inputs.atr14);
    const stopLoss = roundPrice(structuralStop * 0.995);
    const plannedEntry = zoneHigh;
    const plannedRiskReward = calculateRiskReward(plannedEntry, stopLoss, inputs.targetPrice);
    const eligible =
        score >= 70 &&
        trendAligned &&
        supertrendSupport &&
        volumeDryUp &&
        momentumBalanced &&
        zoneHigh < inputs.breakoutPrice &&
        stopLoss > 0 &&
        stopLoss < zoneLow &&
        plannedRiskReward >= 2.5;

    return {
        eligible,
        status: eligible ? 'EARLY_BUY_READY' : 'MONITOR_BASE',
        score,
        zoneLow,
        zoneHigh,
        stopLoss,
        targetPrice: roundPrice(inputs.targetPrice),
        plannedRiskReward,
        allocationPct: 30,
        shadow,
        reasons,
    };
}
