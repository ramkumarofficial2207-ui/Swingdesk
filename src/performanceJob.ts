import prisma from './prismaClient';
import { fetchHistoricalData } from './dataService';
import { syncTrackedSignalResolution } from './edgeAnalyticsService';
import { recordMlOutcomeForSetup } from './mlOutcomeService';
import { Candle } from './types';
import { calculateActualResultPct } from './executionIntegrity';
import { ensureTradePlan } from './tradePlanService';

function istDateKey(value: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(value);
}

export function resolveSetupOutcome(
    candles: Candle[],
    targetPrice: number,
    stopLoss: number,
): { status: 'WON' | 'LOST'; resolvedPrice: number; candle: Candle; ambiguous: boolean } | null {
    for (const candle of candles) {
        const targetHit = candle.high >= targetPrice;
        const stopHit = candle.low <= stopLoss;
        // Daily OHLC does not reveal touch order. Conservatively count a bar
        // that touches both levels as a stop instead of creating a false win.
        if (targetHit && stopHit) {
            return { status: 'LOST', resolvedPrice: stopLoss, candle, ambiguous: true };
        }
        if (stopHit) return { status: 'LOST', resolvedPrice: stopLoss, candle, ambiguous: false };
        if (targetHit) return { status: 'WON', resolvedPrice: targetPrice, candle, ambiguous: false };
    }
    return null;
}

async function executionForSetup(setup: any) {
    const fillPrice = Number(setup.tradePlan?.attempts?.[0]?.actualFillPrice ?? setup.triggeredPrice);
    if (!Number.isFinite(fillPrice) || fillPrice <= 0) return null;
    const plan = setup.tradePlan ?? await ensureTradePlan({
        historicalSetupId: setup.id,
        ticker: setup.ticker,
        setupType: setup.setupType,
        timeframe: setup.timeframe,
        entryPrice: setup.entryPrice,
        targetPrice: setup.targetPrice,
        stopLoss: setup.stopLoss,
        qualifiedAt: setup.qualifiedAt,
    });
    if (plan.historicalSetupId !== setup.id) return null;
    const fillAt = setup.tradePlan?.attempts?.[0]?.actualFillAt ?? setup.triggeredAt;
    if (!fillAt) return null;
    const attempt = setup.tradePlan?.attempts?.[0] ?? await prisma.tradeAttempt.upsert({
        where: { tradePlanId_leg: { tradePlanId: plan.id, leg: 'BREAKOUT' } },
        create: {
            tradePlanId: plan.id,
            leg: 'BREAKOUT',
            status: 'FILLED',
            plannedEntryLow: plan.breakoutPrice,
            plannedEntryHigh: plan.maxBreakoutPrice,
            maxEntryPrice: plan.maxBreakoutPrice,
            openingPrice: plan.openingPrice,
            actualFillPrice: fillPrice,
            actualFillAt: fillAt,
            source: 'nightly_legacy_import',
        },
        update: {},
    });
    return { plan, attempt, fillPrice, fillAt: new Date(fillAt) };
}

export async function updatePerformanceRecords() {
    console.log('[Performance] Running nightly execution verifier job...');
    try {
        const inProgress = await prisma.historicalSetup.findMany({
            where: {
                status: { in: ['TRIGGERED', 'IN_PROGRESS', 'MONITORED'] },
                triggerConfirmed: true,
                resolvedAt: null,
            },
            include: {
                tradePlan: {
                    include: {
                        attempts: { where: { leg: 'BREAKOUT' }, take: 1 },
                    },
                },
            },
        });

        console.log(`[Performance] Found ${inProgress.length} active setups to verify.`);
        let updatedCount = 0;

        for (const setup of inProgress) {
            try {
                const execution = await executionForSetup(setup);
                // A target/stop outcome is impossible without an auditable fill.
                if (!execution) {
                    console.warn(`[Performance] Skipping ${setup.ticker}: no actual fill evidence.`);
                    continue;
                }
                const targetPrice = execution.plan.targetPrice;
                const stopLoss = execution.plan.stopLoss;
                if (targetPrice <= execution.fillPrice || stopLoss >= execution.fillPrice) {
                    await prisma.$transaction(async transaction => {
                        await transaction.historicalSetup.update({
                            where: { id: setup.id },
                            data: { status: 'INVALIDATED', resultPct: null, resolvedAt: new Date() },
                        });
                        await transaction.tradePlan.update({
                            where: { id: execution.plan.id },
                            data: { status: 'INVALIDATED', activeKey: null },
                        });
                        await transaction.tradeAttempt.update({
                            where: { id: execution.attempt.id },
                            data: { status: 'CANCELLED', missReason: 'INVALID_LEVELS_AFTER_FILL' },
                        });
                        await transaction.setupLifecycleEvent.create({
                            data: {
                                tradePlanId: execution.plan.id,
                                tradeAttemptId: execution.attempt.id,
                                eventType: 'INVALIDATED',
                                fromStatus: execution.plan.status,
                                toStatus: 'INVALIDATED',
                                observedAt: new Date(),
                                source: 'nightly_ohlcv',
                                metadata: {
                                    fillPrice: execution.fillPrice,
                                    targetPrice,
                                    stopLoss,
                                },
                            },
                        });
                    });
                    updatedCount += 1;
                    continue;
                }

                const candles = await fetchHistoricalData(`${setup.ticker}.NS`, 45);
                if (!candles.length) continue;
                const fillDate = istDateKey(execution.fillAt);
                const postFillCandles = candles.filter(candle => String(candle.date).slice(0, 10) >= fillDate);
                const outcome = resolveSetupOutcome(postFillCandles, targetPrice, stopLoss);
                if (!outcome) continue;

                const resolvedAt = new Date(outcome.candle.date);
                const resultPct = calculateActualResultPct(execution.fillPrice, outcome.resolvedPrice);
                const resolved = await prisma.$transaction(async transaction => {
                    const row = await transaction.historicalSetup.update({
                        where: { id: setup.id },
                        data: {
                            status: outcome.status,
                            resultPct,
                            resolvedAt,
                            aiLogic: outcome.ambiguous
                                ? `${setup.aiLogic || ''} | Conservative resolution: target and stop touched within the same daily candle.`.trim()
                                : setup.aiLogic,
                        },
                    });
                    await transaction.tradeAttempt.update({
                        where: { id: execution.attempt.id },
                        data: {
                            status: outcome.status,
                            exitPrice: outcome.resolvedPrice,
                            exitAt: resolvedAt,
                            resultPct,
                        },
                    });
                    await transaction.tradePlan.update({
                        where: { id: execution.plan.id },
                        data: { status: outcome.status, activeKey: null },
                    });
                    await transaction.setupLifecycleEvent.create({
                        data: {
                            tradePlanId: execution.plan.id,
                            tradeAttemptId: execution.attempt.id,
                            eventType: outcome.status === 'WON' ? 'TARGET_HIT' : 'STOP_LOSS_HIT',
                            fromStatus: execution.plan.status,
                            toStatus: outcome.status,
                            observedPrice: outcome.resolvedPrice,
                            observedAt: resolvedAt,
                            source: 'nightly_ohlcv',
                            metadata: { fillPrice: execution.fillPrice, resultPct, ambiguous: outcome.ambiguous },
                        },
                    });
                    return row;
                });
                await syncTrackedSignalResolution(setup.id, outcome.status, resultPct, resolvedAt);
                await recordMlOutcomeForSetup(resolved).catch(error => {
                    console.warn(`[ML] Outcome link failed for ${setup.ticker}:`, error?.message || error);
                });
                updatedCount += 1;
            } catch (err: any) {
                console.error(`[Performance] Error verifying ${setup.ticker}:`, err.message);
            }
        }

        console.log(`[Performance] Job complete. Updated ${updatedCount} records.`);
    } catch (error: any) {
        console.error('[Performance] Tracker job failed:', error.message);
    }
}
