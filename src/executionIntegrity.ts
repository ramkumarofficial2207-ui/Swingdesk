export type ExecutionDecisionStatus =
    | 'WAITING'
    | 'FILLED'
    | 'MISSED_GAP'
    | 'INVALIDATED'
    | 'EXPIRED';

export type ExecutionDecisionReason =
    | 'WAITING_FOR_BREAKOUT'
    | 'WAITING_FOR_RVOL'
    | 'ENTRY_CONFIRMED'
    | 'OPEN_GAP_ABOVE_MAX_ENTRY'
    | 'PRICE_ABOVE_MAX_ENTRY'
    | 'TARGET_ALREADY_REACHED'
    | 'INVALID_PRICE_LEVELS'
    | 'RISK_REWARD_BELOW_MINIMUM'
    | 'PLAN_EXPIRED';

export interface BreakoutExecutionPlan {
    breakoutPrice: number;
    maxEntryPrice: number;
    stopLoss: number;
    targetPrice: number;
    requiredRvol: number;
    minimumRiskReward?: number;
    expiresAt?: Date | null;
}

export interface BreakoutObservation {
    price: number;
    rvol?: number | null;
    openingPrice?: number | null;
    observedAt: Date;
}

export interface ExecutionDecision {
    status: ExecutionDecisionStatus;
    reason: ExecutionDecisionReason;
    fillPrice?: number;
    actualRiskReward?: number;
}

function finitePositive(value: number | null | undefined): value is number {
    return Number.isFinite(value) && Number(value) > 0;
}

export function calculateRiskReward(entryPrice: number, stopLoss: number, targetPrice: number): number {
    const risk = entryPrice - stopLoss;
    if (!finitePositive(entryPrice) || risk <= 0 || targetPrice <= entryPrice) return 0;
    return +((targetPrice - entryPrice) / risk).toFixed(2);
}

/**
 * The maximum executable breakout price prevents the monitor from converting
 * a valid plan into a late chase after an overnight gap or fast opening move.
 */
export function calculateMaxBreakoutEntry(breakoutPrice: number, atr?: number | null): number {
    if (!finitePositive(breakoutPrice)) return 0;
    const percentageCap = breakoutPrice * 1.02;
    const atrCap = finitePositive(atr)
        ? breakoutPrice + (0.5 * atr)
        : percentageCap;
    return +Math.min(percentageCap, atrCap).toFixed(2);
}

/** Add market sessions while skipping weekends. NSE holidays are handled by
 * live observations; the date is an upper-bound expiry, not a trading clock. */
export function addTradingSessions(start: Date, sessions: number): Date {
    const result = new Date(start);
    let remaining = Math.max(0, Math.floor(sessions));
    while (remaining > 0) {
        result.setUTCDate(result.getUTCDate() + 1);
        const day = result.getUTCDay();
        if (day !== 0 && day !== 6) remaining -= 1;
    }
    return result;
}

export function evaluateBreakoutExecution(
    plan: BreakoutExecutionPlan,
    observation: BreakoutObservation,
): ExecutionDecision {
    const minimumRiskReward = Number.isFinite(plan.minimumRiskReward)
        ? Math.max(0, Number(plan.minimumRiskReward))
        : 2;

    if (
        !finitePositive(plan.breakoutPrice) ||
        !finitePositive(plan.maxEntryPrice) ||
        !finitePositive(plan.stopLoss) ||
        !finitePositive(plan.targetPrice) ||
        plan.stopLoss >= plan.breakoutPrice ||
        plan.targetPrice <= plan.breakoutPrice ||
        plan.maxEntryPrice < plan.breakoutPrice
    ) {
        return { status: 'INVALIDATED', reason: 'INVALID_PRICE_LEVELS' };
    }

    if (plan.expiresAt && observation.observedAt.getTime() > plan.expiresAt.getTime()) {
        return { status: 'EXPIRED', reason: 'PLAN_EXPIRED' };
    }

    const openingPrice = finitePositive(observation.openingPrice)
        ? Number(observation.openingPrice)
        : null;
    if ((openingPrice !== null && openingPrice >= plan.targetPrice) || observation.price >= plan.targetPrice) {
        return { status: 'MISSED_GAP', reason: 'TARGET_ALREADY_REACHED' };
    }
    if (openingPrice !== null && openingPrice > plan.maxEntryPrice) {
        return { status: 'MISSED_GAP', reason: 'OPEN_GAP_ABOVE_MAX_ENTRY' };
    }
    if (observation.price < plan.breakoutPrice) {
        return { status: 'WAITING', reason: 'WAITING_FOR_BREAKOUT' };
    }
    if (observation.price > plan.maxEntryPrice) {
        return { status: 'MISSED_GAP', reason: 'PRICE_ABOVE_MAX_ENTRY' };
    }
    if (!finitePositive(observation.rvol) || Number(observation.rvol) < plan.requiredRvol) {
        return { status: 'WAITING', reason: 'WAITING_FOR_RVOL' };
    }

    const actualRiskReward = calculateRiskReward(observation.price, plan.stopLoss, plan.targetPrice);
    if (actualRiskReward < minimumRiskReward) {
        return {
            status: 'MISSED_GAP',
            reason: 'RISK_REWARD_BELOW_MINIMUM',
            actualRiskReward,
        };
    }

    return {
        status: 'FILLED',
        reason: 'ENTRY_CONFIRMED',
        fillPrice: +observation.price.toFixed(2),
        actualRiskReward,
    };
}

export function calculateActualResultPct(fillPrice: number, exitPrice: number): number {
    if (!finitePositive(fillPrice) || !finitePositive(exitPrice)) return 0;
    return +(((exitPrice - fillPrice) / fillPrice) * 100).toFixed(2);
}
