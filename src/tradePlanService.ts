import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import {
    addTradingSessions,
    calculateMaxBreakoutEntry,
    calculateRiskReward,
} from './executionIntegrity';
import { PreSurgeV3Plan, PreSurgeV4Plan } from './types';

export const EXECUTION_STRATEGY_VERSION = 'PRE_SURGE_V2';
export const DEFAULT_PLAN_SESSIONS = 10;
type TradePlanWithAttempts = Prisma.TradePlanGetPayload<{ include: { attempts: true } }>;

export interface TradePlanSetupInput {
    historicalSetupId: string;
    ticker: string;
    setupType: string;
    timeframe?: string | null;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    qualifiedAt: Date;
    atr14?: number | null;
    earlyEntryLow?: number | null;
    earlyEntryHigh?: number | null;
    earlyBuyReady?: boolean;
    shadowStrategyVersion?: string | null;
    shadowPlan?: PreSurgeV3Plan | PreSurgeV4Plan | null;
    allowLevelRevision?: boolean;
}

export function strategyFamilyForSetupType(setupType: string): string {
    const normalized = String(setupType || '').toUpperCase();
    if (normalized.includes('PRE-SURGE')) return 'PRE_SURGE';
    if (normalized.includes('PULLBACK') || normalized.includes('RETEST') || normalized.includes('BOUNCE')) return 'PULLBACK';
    if (normalized.includes('COMPRESSION') || normalized.includes('VCP') || normalized.includes('SQUEEZE')) return 'COMPRESSION';
    if (normalized.includes('BREAKOUT')) return 'BREAKOUT';
    return 'SWING_SETUP';
}

export function activePlanKey(ticker: string, strategyFamily: string, timeframe: string): string {
    return `${ticker.trim().replace(/\.NS$/i, '').toUpperCase()}:${strategyFamily}:${timeframe.toUpperCase()}`;
}

function isPrismaUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

/**
 * Creates the execution boundary for a scanner candidate. Repeated scans may
 * refine an unfilled plan, but cannot rewrite levels after an actual fill.
 */
export async function ensureTradePlan(input: TradePlanSetupInput): Promise<TradePlanWithAttempts> {
    const ticker = input.ticker.trim().replace(/\.NS$/i, '').toUpperCase();
    const timeframe = input.timeframe || 'Short Swing';
    const strategyFamily = strategyFamilyForSetupType(input.setupType);
    const strategyVersion = strategyFamily === 'PRE_SURGE' ? EXECUTION_STRATEGY_VERSION : 'EXECUTION_V2';
    const activeKey = activePlanKey(ticker, strategyFamily, timeframe);
    const breakoutPrice = +input.entryPrice.toFixed(2);
    const maxBreakoutPrice = calculateMaxBreakoutEntry(breakoutPrice, input.atr14);
    const plannedRiskReward = calculateRiskReward(breakoutPrice, input.stopLoss, input.targetPrice);
    const expiresAt = addTradingSessions(input.qualifiedAt, DEFAULT_PLAN_SESSIONS);
    const planStatus = input.earlyBuyReady ? 'EARLY_BUY_READY' : 'QUALIFIED';
    const requestedShadowStrategyVersion = input.shadowStrategyVersion;
    const requestedShadowPlan = input.shadowPlan
        ? JSON.parse(JSON.stringify(input.shadowPlan)) as Prisma.InputJsonValue
        : undefined;

    const existing = await prisma.tradePlan.findUnique({
        where: { historicalSetupId: input.historicalSetupId },
        include: { attempts: true },
    });
    if (existing) {
        const hasFill = existing.attempts.some(attempt => attempt.actualFillPrice != null);
        if (hasFill || !existing.activeKey || !input.allowLevelRevision) return existing;
        const nextEarlyLow = input.earlyEntryLow ?? existing.earlyEntryLow;
        const nextEarlyHigh = input.earlyEntryHigh ?? existing.earlyEntryHigh;
        const nextShadowStrategyVersion = requestedShadowStrategyVersion === undefined
            ? existing.shadowStrategyVersion
            : requestedShadowStrategyVersion;
        const nextShadowPlan: Prisma.InputJsonValue | typeof Prisma.JsonNull = input.shadowPlan === undefined
            ? existing.shadowPlan == null
                ? Prisma.JsonNull
                : existing.shadowPlan as Prisma.InputJsonValue
            : requestedShadowPlan ?? Prisma.JsonNull;
        const changed =
            existing.status !== planStatus ||
            existing.earlyEntryLow !== nextEarlyLow ||
            existing.earlyEntryHigh !== nextEarlyHigh ||
            existing.breakoutPrice !== breakoutPrice ||
            existing.maxBreakoutPrice !== maxBreakoutPrice ||
            existing.stopLoss !== input.stopLoss ||
            existing.targetPrice !== input.targetPrice ||
            existing.plannedRiskReward !== plannedRiskReward ||
            existing.shadowStrategyVersion !== nextShadowStrategyVersion ||
            JSON.stringify(existing.shadowPlan ?? null) !== JSON.stringify(nextShadowPlan ?? null) ||
            existing.expiresAt.getTime() !== expiresAt.getTime();
        if (!changed) return existing;
        return prisma.$transaction(async transaction => {
            const updated = await transaction.tradePlan.update({
                where: { id: existing.id },
                data: {
                    status: planStatus,
                    earlyEntryLow: nextEarlyLow,
                    earlyEntryHigh: nextEarlyHigh,
                    breakoutPrice,
                    maxBreakoutPrice,
                    stopLoss: input.stopLoss,
                    targetPrice: input.targetPrice,
                    plannedRiskReward,
                    shadowStrategyVersion: nextShadowStrategyVersion,
                    shadowPlan: nextShadowPlan,
                    expiresAt,
                },
                include: { attempts: true },
            });
            await transaction.setupLifecycleEvent.create({
                data: {
                    tradePlanId: existing.id,
                    eventType: 'PLAN_REVISED',
                    fromStatus: existing.status,
                    toStatus: planStatus,
                    observedPrice: breakoutPrice,
                    observedAt: new Date(),
                    source: 'scanner',
                    metadata: {
                        previous: {
                            breakoutPrice: existing.breakoutPrice,
                            maxBreakoutPrice: existing.maxBreakoutPrice,
                            stopLoss: existing.stopLoss,
                            targetPrice: existing.targetPrice,
                        },
                        next: {
                            breakoutPrice,
                            maxBreakoutPrice,
                            stopLoss: input.stopLoss,
                            targetPrice: input.targetPrice,
                            shadowStrategyVersion: nextShadowStrategyVersion,
                        },
                    },
                },
            });
            return updated;
        });
    }

    try {
        return await prisma.tradePlan.create({
            data: {
                historicalSetupId: input.historicalSetupId,
                ticker,
                strategyFamily,
                strategyVersion,
                shadowStrategyVersion: requestedShadowStrategyVersion ?? null,
                shadowPlan: requestedShadowPlan,
                timeframe,
                status: planStatus,
                activeKey,
                earlyEntryLow: input.earlyEntryLow,
                earlyEntryHigh: input.earlyEntryHigh,
                breakoutPrice,
                maxBreakoutPrice,
                stopLoss: input.stopLoss,
                targetPrice: input.targetPrice,
                plannedRiskReward,
                earlyAllocationPct: 30,
                breakoutAllocationPct: 70,
                expiresAt,
                events: {
                    create: {
                        eventType: input.earlyBuyReady ? 'EARLY_BUY_READY' : 'SETUP_QUALIFIED',
                        toStatus: planStatus,
                        observedPrice: input.earlyEntryHigh ?? breakoutPrice,
                        observedAt: input.qualifiedAt,
                        source: 'scanner',
                        metadata: {
                            breakoutPrice,
                            maxBreakoutPrice,
                            targetPrice: input.targetPrice,
                            stopLoss: input.stopLoss,
                            strategyVersion,
                            shadowStrategyVersion: requestedShadowStrategyVersion ?? null,
                        },
                    },
                },
            },
            include: { attempts: true },
        });
    } catch (error) {
        if (!isPrismaUniqueConflict(error)) throw error;
        const canonical = await prisma.tradePlan.findUnique({
            where: { activeKey },
            include: { attempts: true },
        });
        if (!canonical) throw error;
        return canonical;
    }
}
