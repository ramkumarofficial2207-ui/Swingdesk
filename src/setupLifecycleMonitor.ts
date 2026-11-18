import { pushEvent } from './agentEvents';
import { Prisma } from '@prisma/client';
import { resolveDhanSecurityId } from './dhanClient';
import { getDhanWebSocketInstance } from './dhanWebSocket';
import { calculateIntradayRvol, fetchIntradayPollingSnapshot, RvolObservation } from './intradayRvol';
import prisma from './prismaClient';
import { LiveTick, liveTickerStore } from './liveTickerStore';
import { syncTrackedSignalResolution } from './edgeAnalyticsService';
import { recordMlOutcomeForSetup } from './mlOutcomeService';
import {
    prepareMlTriggerSnapshot,
    scoreMlTriggerSnapshot,
    TriggerMarketContext,
    TriggerSetupInput,
} from './mlTriggerFeatureService';
import {
    calculateActualResultPct,
    evaluateBreakoutExecution,
    ExecutionDecision,
} from './executionIntegrity';
import { ensureTradePlan, strategyFamilyForSetupType } from './tradePlanService';
import { evaluateV3BreakoutShadow, evaluateV3EarlyShadow, evaluateV4BreakoutShadow } from './preSurgeV3Intraday';
import { PreSurgeV3Plan, PreSurgeV4Plan } from './types';

const MARKET_TIMEZONE = 'Asia/Kolkata';
const MARKET_OPEN_MINUTE = 9 * 60 + 15;
const POLL_INTERVAL_MS = 60_000;
const STALE_TICK_MS = 90_000;
const DEFAULT_TRIGGER_RVOL = 1.5;
const QUALIFIED_CACHE_TTL_MS = 10_000;
// Active trades need faster DB resolution cycles — use a shorter TTL so a
// price hitting target is resolved within the next tick, not up to 10 seconds later.
const ACTIVE_CACHE_TTL_MS = 3_000;
const MINIMUM_ACTUAL_RISK_REWARD = 2;

type LifecycleSource = 'dhan_tick' | 'rest_fallback';

let initialized = false;
let pollTimer: NodeJS.Timeout | null = null;
let pollInFlight = false;
let subscriptionRefreshInFlight = false;
const inFlightTickers = new Set<string>();
const v3TouchedPlans = new Set<string>();
const v3ConfirmedEarlyPlans = new Set<string>();
const v3EarlyEvaluationBucket = new Map<string, number>();
const v3ConfirmedBreakoutPlans = new Set<string>();
const v3BreakoutEvaluationBucket = new Map<string, number>();

function normalizeTicker(value: string): string {
    return value.trim().replace(/\.NS$/i, '').toUpperCase();
}

function triggerThreshold(setup: { triggerVolumeRatio?: number | null }): number {
    const value = Number(setup.triggerVolumeRatio);
    return Number.isFinite(value) ? Math.max(DEFAULT_TRIGGER_RVOL, value) : DEFAULT_TRIGGER_RVOL;
}

function isNseMarketHours(at = new Date()): boolean {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MARKET_TIMEZONE,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(at);
    const weekday = parts.find(part => part.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
    const totalMinutes = hour * 60 + minute;
    return !['Sat', 'Sun'].includes(weekday) && totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 35;
}

function marketDate(at: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: MARKET_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(at);
}

async function queryQualifiedSetups() {
    const rows = await prisma.historicalSetup.findMany({
        where: {
            triggerConfirmed: false,
            status: 'QUALIFIED',
            resolvedAt: null,
        },
        select: {
            id: true,
            ticker: true,
            entryPrice: true,
            targetPrice: true,
            stopLoss: true,
            setupType: true,
            timeframe: true,
            confidenceScore: true,
            qualifiedAt: true,
            triggerVolumeRatio: true,
            tradePlan: {
                select: {
                    id: true,
                    status: true,
                    shadowStrategyVersion: true,
                    shadowPlan: true,
                    earlyEntryLow: true,
                    earlyEntryHigh: true,
                },
            },
        },
        orderBy: [
            { confidenceScore: 'desc' },
            { qualifiedAt: 'desc' },
        ],
    });
    // Old deployments could leave duplicate active rows. Only one canonical
    // setup per strategy identity is allowed to observe a live trigger.
    const seen = new Set<string>();
    return rows.filter(row => {
        const key = `${normalizeTicker(row.ticker)}:${strategyFamilyForSetupType(row.setupType)}:${row.timeframe || 'Short Swing'}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function preSurgeV3Plan(value: unknown): PreSurgeV3Plan | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<PreSurgeV3Plan>;
    return candidate.version === 'PRE_SURGE_V3' && candidate.shadow === true
        ? candidate as PreSurgeV3Plan
        : null;
}

async function observeV3EarlyShadow(
    setup: Awaited<ReturnType<typeof queryQualifiedSetups>>[number],
    tick: LiveTick,
): Promise<void> {
    const tradePlan = setup.tradePlan;
    const plan = preSurgeV3Plan(tradePlan?.shadowPlan);
    if (!tradePlan || tradePlan.shadowStrategyVersion !== 'PRE_SURGE_V3_SHADOW' || !plan?.eligible) return;
    if (v3ConfirmedEarlyPlans.has(tradePlan.id)) return;
    const touchKey = `${tradePlan.id}:${marketDate(new Date(tick.lastUpdated))}`;
    const touched = tick.dayLow <= plan.earlyEntry.zoneHigh && tick.dayHigh >= plan.earlyEntry.zoneLow;
    if (touched) v3TouchedPlans.add(touchKey);
    if (!v3TouchedPlans.has(touchKey) || tick.ltp < plan.earlyEntry.zoneHigh) return;
    const bucket = Math.floor(tick.lastUpdated / (5 * 60_000));
    if (v3EarlyEvaluationBucket.get(tradePlan.id) === bucket) return;
    v3EarlyEvaluationBucket.set(tradePlan.id, bucket);
    const evaluated = await evaluateV3EarlyShadow({
        ticker: setup.ticker,
        plan,
        zoneTouched: true,
        dayOpen: tick.dayOpen,
        previousClose: tick.prevClose,
        // The EOD V3 plan already passed the NIFTY risk-off gate. A stock's
        // own day change is not a valid substitute for synchronized intraday
        // NIFTY regime data.
        marketSafe: true,
        observedAt: new Date(tick.lastUpdated),
    });
    if (!evaluated?.decision.confirmed) return;
    const existing = await prisma.setupLifecycleEvent.findFirst({
        where: { tradePlanId: tradePlan.id, eventType: 'V3_EARLY_BUY_CONFIRMED_SHADOW' },
        select: { id: true },
    });
    if (existing) {
        v3ConfirmedEarlyPlans.add(tradePlan.id);
        return;
    }
    await prisma.setupLifecycleEvent.create({
        data: {
            tradePlanId: tradePlan.id,
            eventType: 'V3_EARLY_BUY_CONFIRMED_SHADOW',
            fromStatus: tradePlan.status,
            toStatus: tradePlan.status,
            observedPrice: evaluated.structure.latest5m.close,
            observedAt: new Date(tick.lastUpdated),
            source: 'dhan_v3_shadow',
            metadata: JSON.parse(JSON.stringify({
                decision: evaluated.decision,
                structure: evaluated.structure,
                earlyEntry: plan.earlyEntry,
                noOrderPlaced: true,
            })) as Prisma.InputJsonValue,
        },
    });
    v3ConfirmedEarlyPlans.add(tradePlan.id);
}

function v3QuarterHourBucket(at: Date): number | null {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MARKET_TIMEZONE,
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
    const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
    const elapsed = (hour * 60 + minute) - MARKET_OPEN_MINUTE;
    if (elapsed < 15 || elapsed % 15 >= 5) return null;
    return Math.floor(elapsed / 15);
}

async function observeV3BreakoutShadow(
    setup: Awaited<ReturnType<typeof queryQualifiedSetups>>[number],
    price: number,
    observation: RvolObservation | null,
    observedAt: Date,
): Promise<void> {
    const tradePlan = setup.tradePlan;
    const v3Plan = preSurgeV3Plan(tradePlan?.shadowPlan);
    if (!tradePlan || tradePlan.shadowStrategyVersion !== 'PRE_SURGE_V3_SHADOW' || !v3Plan?.eligible) return;
    if (v3ConfirmedBreakoutPlans.has(tradePlan.id) || !observation || price < v3Plan.breakout.pivot) return;
    const interval = v3QuarterHourBucket(observedAt);
    if (interval == null) return;
    const bucket = (Math.floor(observedAt.getTime() / 86_400_000) * 100) + interval;
    if (v3BreakoutEvaluationBucket.get(tradePlan.id) === bucket) return;
    v3BreakoutEvaluationBucket.set(tradePlan.id, bucket);
    const evaluated = await evaluateV3BreakoutShadow({
        ticker: setup.ticker,
        plan: v3Plan,
        observedPrice: price,
        observedRvol: observation.rvol,
        observedAt,
    });
    // A failed interval is not terminal. The qualified plan remains eligible
    // for a later completed 15-minute confirmation during its plan window.
    if (!evaluated?.decision.confirmed) return;
    const existing = await prisma.setupLifecycleEvent.findFirst({
        where: { tradePlanId: tradePlan.id, eventType: 'V3_BREAKOUT_CONFIRMED_SHADOW' },
        select: { id: true },
    });
    if (existing) {
        v3ConfirmedBreakoutPlans.add(tradePlan.id);
        return;
    }
    await prisma.setupLifecycleEvent.create({
        data: {
            tradePlanId: tradePlan.id,
            eventType: 'V3_BREAKOUT_CONFIRMED_SHADOW',
            fromStatus: tradePlan.status,
            toStatus: tradePlan.status,
            observedPrice: evaluated.structure.latest15m.close,
            observedRvol: observation.rvol,
            observedAt,
            source: 'dhan_v3_shadow',
            metadata: JSON.parse(JSON.stringify({
                decision: evaluated.decision,
                structure: evaluated.structure,
                breakout: v3Plan.breakout,
                noOrderPlaced: true,
            })) as Prisma.InputJsonValue,
        },
    });
    v3ConfirmedBreakoutPlans.add(tradePlan.id);
}

function preSurgeV4Plan(raw: unknown): PreSurgeV4Plan | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<PreSurgeV4Plan>;
    if (item.version !== 'PRE_SURGE_V4' || typeof item.eligible !== 'boolean') return null;
    return item as PreSurgeV4Plan;
}

const v4ConfirmedBreakoutPlans = new Set<string>();
const v4BreakoutEvaluationBucket = new Map<string, number>();

async function observeV4BreakoutShadow(
    setup: Awaited<ReturnType<typeof queryQualifiedSetups>>[number],
    price: number,
    observation: RvolObservation | null,
    observedAt: Date,
): Promise<void> {
    const tradePlan = setup.tradePlan;
    const v4Plan = preSurgeV4Plan(tradePlan?.shadowPlan);
    if (!tradePlan || !v4Plan?.eligible) return;
    if (v4ConfirmedBreakoutPlans.has(tradePlan.id) || !observation || price < v4Plan.breakoutArm.pivot) return;
    const interval = v3QuarterHourBucket(observedAt);
    if (interval == null) return;
    const bucket = (Math.floor(observedAt.getTime() / 86_400_000) * 100) + interval;
    if (v4BreakoutEvaluationBucket.get(tradePlan.id) === bucket) return;
    v4BreakoutEvaluationBucket.set(tradePlan.id, bucket);

    // Evaluate the completed 15-minute bar and session VWAP. A failed interval
    // is not terminal; a later completed bar may still confirm.
    const evaluated = await evaluateV4BreakoutShadow({
        ticker: setup.ticker,
        plan: v4Plan,
        observedRvol: observation.rvol,
        observedAt,
    });
    if (!evaluated?.decision.confirmed) return;
    const { decision, structure } = evaluated;
    const confirmedPrice = structure.latest15m.close;
    const existing = await prisma.setupLifecycleEvent.findFirst({
        where: { tradePlanId: tradePlan.id, eventType: 'V4_BREAKOUT_CONFIRMED_SHADOW' },
        select: { id: true },
    });
    if (existing) {
        v4ConfirmedBreakoutPlans.add(tradePlan.id);
        return;
    }
    await prisma.setupLifecycleEvent.create({
        data: {
            tradePlanId: tradePlan.id,
            eventType: 'V4_BREAKOUT_CONFIRMED_SHADOW',
            fromStatus: tradePlan.status,
            toStatus: tradePlan.status,
            observedPrice: confirmedPrice,
            observedRvol: observation.rvol,
            observedAt,
            source: 'dhan_v4_shadow',
            metadata: JSON.parse(JSON.stringify({
                decision,
                structure,
                breakoutArm: v4Plan.breakoutArm,
                noOrderPlaced: true,
            })) as Prisma.InputJsonValue,
        },
    });
    v4ConfirmedBreakoutPlans.add(tradePlan.id);
    console.log(`[V4 Shadow] 🚀 V4 Breakout confirmed for ${setup.ticker} at ₹${confirmedPrice.toFixed(2)} (RVOL ${observation.rvol.toFixed(2)}x)`);
}

async function queryActiveSetups() {
    const rows = await prisma.historicalSetup.findMany({
        where: {
            triggerConfirmed: true,
            status: { in: ['TRIGGERED', 'IN_PROGRESS', 'MONITORED'] },
            resolvedAt: null,
        },
        select: {
            id: true,
            ticker: true,
            entryPrice: true,
            targetPrice: true,
            stopLoss: true,
            setupType: true,
            timeframe: true,
            confidenceScore: true,
            qualifiedAt: true,
            triggeredPrice: true,
            triggeredAt: true,
            tradePlan: {
                include: {
                    attempts: {
                        where: { leg: 'BREAKOUT' },
                        take: 1,
                    },
                },
            },
        },
        orderBy: [{ triggeredAt: 'asc' }, { confidenceScore: 'desc' }],
    });
    const seen = new Set<string>();
    return rows.filter(row => {
        const key = `${normalizeTicker(row.ticker)}:${strategyFamilyForSetupType(row.setupType)}:${row.timeframe || 'Short Swing'}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

let qualifiedCache: { fetchedAt: number; setups: Awaited<ReturnType<typeof queryQualifiedSetups>> } | null = null;
let activeCache: { fetchedAt: number; setups: Awaited<ReturnType<typeof queryActiveSetups>> } | null = null;

async function qualifiedSetups(force = false) {
    if (!force && qualifiedCache && Date.now() - qualifiedCache.fetchedAt < QUALIFIED_CACHE_TTL_MS) {
        return qualifiedCache.setups;
    }
    const setups = await queryQualifiedSetups();
    qualifiedCache = { fetchedAt: Date.now(), setups };
    return setups;
}

async function activeSetups(force = false) {
    // Active setups use a shorter TTL so target/stop resolution fires within
    // seconds of price crossing the level, not after the full 10-second window.
    if (!force && activeCache && Date.now() - activeCache.fetchedAt < ACTIVE_CACHE_TTL_MS) {
        return activeCache.setups;
    }
    const setups = await queryActiveSetups();
    activeCache = { fetchedAt: Date.now(), setups };
    return setups;
}

/** Subscribe from the backend, independent of whether a dashboard is open. */
export async function refreshQualifiedSetupSubscriptions(): Promise<void> {
    if (subscriptionRefreshInFlight) return;
    const dhanWs = getDhanWebSocketInstance();
    if (!dhanWs) return;

    subscriptionRefreshInFlight = true;
    try {
        const [qualified, active] = await Promise.all([qualifiedSetups(true), activeSetups(true)]);
        const byTicker = new Map([...qualified, ...active].map(setup => [normalizeTicker(setup.ticker), setup]));
        const resolved = await Promise.all([...byTicker.keys()].map(async ticker => ({
            ticker,
            securityId: await resolveDhanSecurityId(ticker),
        })));
        const valid = resolved.filter(item => item.securityId) as Array<{ ticker: string; securityId: string }>;
        valid.forEach(item => liveTickerStore.registerSymbolMapping(item.securityId, item.ticker));
        if (valid.length) dhanWs.subscribe(valid.map(item => item.securityId));
        console.log(`[Lifecycle] Subscription refresh: ${valid.length}/${byTicker.size} unique qualified + active tickers.`);
    } catch (error: any) {
        console.warn('[Lifecycle] Qualified subscription refresh failed:', error?.message || error);
    } finally {
        subscriptionRefreshInFlight = false;
    }
}

async function persistOpeningObservation(
    plan: Awaited<ReturnType<typeof ensureTradePlan>>,
    openingPrice: number | null | undefined,
    observedAt: Date,
    source: LifecycleSource,
): Promise<number | null> {
    if (
        Number.isFinite(plan.openingPrice) &&
        Number(plan.openingPrice) > 0 &&
        plan.openingObservedAt &&
        marketDate(plan.openingObservedAt) === marketDate(observedAt)
    ) {
        return Number(plan.openingPrice);
    }
    if (!Number.isFinite(openingPrice) || Number(openingPrice) <= 0) return null;
    const value = +Number(openingPrice).toFixed(2);
    await prisma.$transaction(async transaction => {
        const updated = await transaction.tradePlan.updateMany({
            where: {
                id: plan.id,
                openingObservedAt: plan.openingObservedAt,
            },
            data: { openingPrice: value, openingObservedAt: observedAt },
        });
        if (updated.count) {
            await transaction.setupLifecycleEvent.create({
                data: {
                    tradePlanId: plan.id,
                    eventType: 'OPENING_OBSERVED',
                    fromStatus: plan.status,
                    toStatus: plan.status,
                    observedPrice: value,
                    observedAt,
                    source,
                },
            });
        }
    });
    return value;
}

async function persistRejectedEntry(
    setupId: string,
    plan: Awaited<ReturnType<typeof ensureTradePlan>>,
    decision: ExecutionDecision,
    price: number,
    rvol: number | null,
    openingPrice: number | null,
    observedAt: Date,
    source: LifecycleSource,
): Promise<boolean> {
    if (decision.status === 'WAITING' || decision.status === 'FILLED') return false;
    return prisma.$transaction(async transaction => {
        const updated = await transaction.historicalSetup.updateMany({
            where: { id: setupId, triggerConfirmed: false, status: 'QUALIFIED', resolvedAt: null },
            data: { status: decision.status, resolvedAt: observedAt },
        });
        if (!updated.count) return false;
        const attempt = await transaction.tradeAttempt.upsert({
            where: { tradePlanId_leg: { tradePlanId: plan.id, leg: 'BREAKOUT' } },
            create: {
                tradePlanId: plan.id,
                leg: 'BREAKOUT',
                status: decision.status,
                plannedEntryLow: plan.breakoutPrice,
                plannedEntryHigh: plan.maxBreakoutPrice,
                maxEntryPrice: plan.maxBreakoutPrice,
                openingPrice,
                missReason: decision.reason,
                source,
            },
            update: {
                status: decision.status,
                openingPrice,
                missReason: decision.reason,
                source,
            },
        });
        await transaction.tradePlan.update({
            where: { id: plan.id },
            data: { status: decision.status, activeKey: null },
        });
        await transaction.setupLifecycleEvent.create({
            data: {
                tradePlanId: plan.id,
                tradeAttemptId: attempt.id,
                eventType: decision.status,
                fromStatus: plan.status,
                toStatus: decision.status,
                observedPrice: price,
                observedRvol: rvol,
                observedAt,
                source,
                metadata: { reason: decision.reason, maxEntryPrice: plan.maxBreakoutPrice },
            },
        });
        return true;
    });
}

async function transitionIfConfirmed(
    setup: Awaited<ReturnType<typeof queryQualifiedSetups>>[number],
    price: number,
    observation: RvolObservation | null,
    source: LifecycleSource,
    market?: TriggerMarketContext,
    observedAt = new Date(),
): Promise<void> {
    const lockKey = normalizeTicker(setup.ticker);
    if (!Number.isFinite(price) || price <= 0 || inFlightTickers.has(lockKey)) return;

    inFlightTickers.add(lockKey);
    try {
        const threshold = triggerThreshold(setup);
        const plan = await ensureTradePlan({
            historicalSetupId: setup.id,
            ticker: setup.ticker,
            setupType: setup.setupType,
            timeframe: setup.timeframe,
            entryPrice: setup.entryPrice,
            targetPrice: setup.targetPrice,
            stopLoss: setup.stopLoss,
            qualifiedAt: setup.qualifiedAt,
        });
        if (plan.historicalSetupId !== setup.id || !plan.activeKey) return;

        const openingPrice = await persistOpeningObservation(plan, market?.dayOpen, observedAt, source);
        const decision = evaluateBreakoutExecution({
            breakoutPrice: plan.breakoutPrice,
            maxEntryPrice: plan.maxBreakoutPrice,
            stopLoss: plan.stopLoss,
            targetPrice: plan.targetPrice,
            requiredRvol: threshold,
            minimumRiskReward: MINIMUM_ACTUAL_RISK_REWARD,
            expiresAt: plan.expiresAt,
        }, {
            price,
            rvol: observation?.rvol,
            openingPrice,
            observedAt,
        });

        if (decision.status !== 'FILLED') {
            const rejected = await persistRejectedEntry(
                setup.id,
                plan,
                decision,
                price,
                observation?.rvol ?? null,
                openingPrice,
                observedAt,
                source,
            );
            if (rejected) {
                qualifiedCache = null;
                pushEvent(
                    'TRADE_ALERT',
                    'warning',
                    `ENTRY SKIPPED: ${setup.ticker}`,
                    `${setup.ticker} was not buyable: ${decision.reason}. Planned breakout ₹${plan.breakoutPrice.toFixed(2)}, maximum entry ₹${plan.maxBreakoutPrice.toFixed(2)}.`,
                    { ticker: setup.ticker, data: { source, ltp: price, decision: decision.status, reason: decision.reason } },
                );
            }
            return;
        }

        if (!observation || decision.fillPrice == null) return;
        const triggeredAt = observedAt;
        const updateData = {
            status: 'TRIGGERED',
            triggerConfirmed: true,
            triggeredAt,
            triggeredPrice: decision.fillPrice,
            triggeredVolumeRatio: observation.rvol,
        } as const;
        let preparedSnapshot: Awaited<ReturnType<typeof prepareMlTriggerSnapshot>> | null = null;
        if (process.env.ML_TRIGGER_FEATURE_LOGGING_ENABLED !== 'false') {
            preparedSnapshot = await prepareMlTriggerSnapshot({
                setup: setup as TriggerSetupInput,
                observedPrice: decision.fillPrice,
                observation,
                source,
                triggeredAt,
                market,
            }).catch(error => {
                console.warn(`[ML] Could not prepare trigger snapshot for ${setup.ticker}:`, error?.message || error);
                return null;
            });
        }

        const persistFill = async (withSnapshot: boolean): Promise<boolean> => prisma.$transaction(async transaction => {
            const updated = await transaction.historicalSetup.updateMany({
                where: { id: setup.id, triggerConfirmed: false, status: 'QUALIFIED', resolvedAt: null },
                data: updateData,
            });
            if (!updated.count) return false;
            const attempt = await transaction.tradeAttempt.upsert({
                where: { tradePlanId_leg: { tradePlanId: plan.id, leg: 'BREAKOUT' } },
                create: {
                    tradePlanId: plan.id,
                    leg: 'BREAKOUT',
                    status: 'FILLED',
                    plannedEntryLow: plan.breakoutPrice,
                    plannedEntryHigh: plan.maxBreakoutPrice,
                    maxEntryPrice: plan.maxBreakoutPrice,
                    openingPrice,
                    actualFillPrice: decision.fillPrice,
                    actualFillAt: triggeredAt,
                    triggerRvol: observation.rvol,
                    source,
                },
                update: {
                    status: 'FILLED',
                    openingPrice,
                    actualFillPrice: decision.fillPrice,
                    actualFillAt: triggeredAt,
                    triggerRvol: observation.rvol,
                    missReason: null,
                    source,
                },
            });
            await transaction.tradePlan.update({
                where: { id: plan.id },
                data: { status: 'BREAKOUT_TRIGGERED' },
            });
            await transaction.setupLifecycleEvent.create({
                data: {
                    tradePlanId: plan.id,
                    tradeAttemptId: attempt.id,
                    eventType: 'BUY_TRIGGERED',
                    fromStatus: plan.status,
                    toStatus: 'BREAKOUT_TRIGGERED',
                    observedPrice: decision.fillPrice,
                    observedRvol: observation.rvol,
                    observedAt: triggeredAt,
                    source,
                    metadata: {
                        plannedBreakout: plan.breakoutPrice,
                        maxEntryPrice: plan.maxBreakoutPrice,
                        actualRiskReward: decision.actualRiskReward,
                    },
                },
            });
            if (withSnapshot && preparedSnapshot) {
                await transaction.mlTriggerFeatureSnapshot.upsert({
                    where: { historicalSetupId: setup.id },
                    create: preparedSnapshot.data,
                    update: {},
                });
            }
            return true;
        });

        let persisted = false;
        let snapshotPersisted = false;
        try {
            persisted = await persistFill(Boolean(preparedSnapshot));
            snapshotPersisted = persisted && Boolean(preparedSnapshot);
        } catch (error: any) {
            if (!preparedSnapshot) throw error;
            console.error(`[ML] Atomic trigger snapshot failed for ${setup.ticker}; preserving execution audit:`, error?.message || error);
            persisted = await persistFill(false);
        }

        if (persisted) {
            qualifiedCache = null;
            activeCache = null;
            // Re-subscribe immediately so the newly-active ticker starts receiving
            // live Dhan WebSocket ticks without waiting the full 60-second interval.
            // The subscriptionRefreshInFlight guard inside the function prevents
            // concurrent calls if multiple tickers trigger at the same time.
            void refreshQualifiedSetupSubscriptions();
            pushEvent(
                'TRADE_ALERT',
                'success',
                `BUY TRIGGERED: ${setup.ticker}`,
                `Actual fill ₹${decision.fillPrice.toFixed(2)} within the allowed ₹${plan.breakoutPrice.toFixed(2)}-₹${plan.maxBreakoutPrice.toFixed(2)} range with RVOL ${observation.rvol.toFixed(2)}x.`,
                {
                    ticker: setup.ticker,
                    data: {
                        source,
                        openingPrice,
                        plannedBreakout: plan.breakoutPrice,
                        maxEntryPrice: plan.maxBreakoutPrice,
                        actualFillPrice: decision.fillPrice,
                        actualRiskReward: decision.actualRiskReward,
                        rvol: observation.rvol,
                        baselineVolume: observation.baselineVolume,
                        sampleCount: observation.sampleCount,
                    },
                },
            );
            if (snapshotPersisted && preparedSnapshot) {
                void scoreMlTriggerSnapshot(preparedSnapshot.id, preparedSnapshot.features);
            }
            console.log(`[Lifecycle] ${setup.ticker} filled at ₹${decision.fillPrice.toFixed(2)} with RVOL ${observation.rvol.toFixed(2)}x (${source}).`);
        }
    } catch (error: any) {
        console.error(`[Lifecycle] Failed to transition ${setup.ticker}:`, error?.message || error);
    } finally {
        inFlightTickers.delete(lockKey);
    }
}

async function ensureActiveAttempt(setup: Awaited<ReturnType<typeof queryActiveSetups>>[number]) {
    let plan = setup.tradePlan ?? await ensureTradePlan({
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
    let attempt = plan.attempts.find(item => item.leg === 'BREAKOUT');
    if (!attempt && setup.triggeredPrice && setup.triggeredPrice > 0) {
        const fillAt = setup.triggeredAt ?? new Date();
        attempt = await prisma.tradeAttempt.upsert({
            where: { tradePlanId_leg: { tradePlanId: plan.id, leg: 'BREAKOUT' } },
            create: {
                tradePlanId: plan.id,
                leg: 'BREAKOUT',
                status: 'FILLED',
                plannedEntryLow: plan.breakoutPrice,
                plannedEntryHigh: plan.maxBreakoutPrice,
                maxEntryPrice: plan.maxBreakoutPrice,
                openingPrice: plan.openingPrice,
                actualFillPrice: setup.triggeredPrice,
                actualFillAt: fillAt,
                source: 'legacy_trigger_import',
            },
            update: {},
        });
        await prisma.tradePlan.update({ where: { id: plan.id }, data: { status: 'BREAKOUT_TRIGGERED' } });
        plan = { ...plan, status: 'BREAKOUT_TRIGGERED', attempts: [attempt] };
    }
    return attempt ? { plan, attempt } : null;
}

async function resolveActiveSetup(
    setup: Awaited<ReturnType<typeof queryActiveSetups>>[number],
    price: number,
    source: LifecycleSource,
    observedAt = new Date(),
): Promise<void> {
    const lockKey = `resolve:${setup.id}`;
    if (!Number.isFinite(price) || price <= 0 || inFlightTickers.has(lockKey)) return;
    const targetPrice = setup.tradePlan?.targetPrice ?? setup.targetPrice;
    const stopLoss = setup.tradePlan?.stopLoss ?? setup.stopLoss;
    const status = price >= targetPrice ? 'WON' : price <= stopLoss ? 'LOST' : null;
    if (!status) return;

    inFlightTickers.add(lockKey);
    try {
        const execution = await ensureActiveAttempt(setup);
        // actualFillPrice can be null for legacy/manually-seeded setups that only
        // have triggeredPrice recorded on the HistoricalSetup row. Fall back to
        // that value so target/stop resolution still fires correctly instead of
        // silently returning and leaving the trade open forever.
        const rawFill = execution?.attempt.actualFillPrice ?? setup.triggeredPrice ?? 0;
        if (!execution || rawFill <= 0) return;
        const fillPrice = rawFill;
        if (targetPrice <= fillPrice || stopLoss >= fillPrice) {
            await prisma.$transaction(async transaction => {
                const updated = await transaction.historicalSetup.updateMany({
                    where: { id: setup.id, resolvedAt: null },
                    data: { status: 'INVALIDATED', resultPct: null, resolvedAt: observedAt },
                });
                if (!updated.count) return;
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
                        observedPrice: price,
                        observedAt,
                        source,
                        metadata: { fillPrice, targetPrice, stopLoss },
                    },
                });
            });
            activeCache = null;
            return;
        }

        const resolvedPrice = status === 'WON' ? targetPrice : stopLoss;
        const resultPct = calculateActualResultPct(fillPrice, resolvedPrice);
        const resolvedAt = observedAt;
        const resolved = await prisma.$transaction(async transaction => {
            const updated = await transaction.historicalSetup.updateMany({
                where: {
                    id: setup.id,
                    triggerConfirmed: true,
                    status: { in: ['TRIGGERED', 'IN_PROGRESS', 'MONITORED'] },
                    resolvedAt: null,
                },
                data: { status, resultPct, resolvedAt },
            });
            if (!updated.count) return null;
            await transaction.tradeAttempt.update({
                where: { id: execution.attempt.id },
                data: { status, exitPrice: resolvedPrice, exitAt: resolvedAt, resultPct },
            });
            await transaction.tradePlan.update({
                where: { id: execution.plan.id },
                data: { status, activeKey: null },
            });
            await transaction.setupLifecycleEvent.create({
                data: {
                    tradePlanId: execution.plan.id,
                    tradeAttemptId: execution.attempt.id,
                    eventType: status === 'WON' ? 'TARGET_HIT' : 'STOP_LOSS_HIT',
                    fromStatus: execution.plan.status,
                    toStatus: status,
                    observedPrice: price,
                    observedAt: resolvedAt,
                    source,
                    metadata: { fillPrice, exitPrice: resolvedPrice, resultPct },
                },
            });
            return transaction.historicalSetup.findUnique({ where: { id: setup.id } });
        });
        if (!resolved) return;

        activeCache = null;
        await syncTrackedSignalResolution(setup.id, status, resultPct, resolvedAt).catch(() => undefined);
        await recordMlOutcomeForSetup(resolved).catch(() => undefined);
        pushEvent(
            'TRADE_ALERT',
            status === 'WON' ? 'success' : 'warning',
            `${status === 'WON' ? 'TARGET HIT' : 'STOP LOSS HIT'}: ${setup.ticker}`,
            `${setup.ticker} ${status === 'WON' ? 'reached target' : 'reached stop loss'} at ₹${price.toFixed(2)}. Result ${resultPct.toFixed(2)}% from actual fill ₹${fillPrice.toFixed(2)}.`,
            { ticker: setup.ticker, data: { source, ltp: price, fillPrice, exitPrice: resolvedPrice, status, resultPct } },
        );
        console.log(`[Lifecycle] ${setup.ticker} resolved ${status} at ₹${price.toFixed(2)} from fill ₹${fillPrice.toFixed(2)} (${source}).`);
    } catch (error: any) {
        console.error(`[Lifecycle] Failed to resolve ${setup.ticker}:`, error?.message || error);
    } finally {
        inFlightTickers.delete(lockKey);
    }
}

async function processTick(tick: LiveTick): Promise<void> {
    const ticker = normalizeTicker(tick.ticker);
    if (!ticker || !Number.isFinite(tick.ltp) || tick.ltp <= 0 || !isNseMarketHours(new Date(tick.lastUpdated))) return;

    const setups = (await qualifiedSetups()).filter(setup => normalizeTicker(setup.ticker) === ticker);
    for (const setup of setups) {
        await observeV3EarlyShadow(setup, tick).catch(error => {
            console.warn(`[V3 Shadow] Early-entry audit failed for ${setup.ticker}:`, error?.message || error);
        });
        const needsRvol = tick.ltp >= setup.entryPrice && Number.isFinite(tick.volume) && tick.volume > 0;
        const observation = needsRvol
            ? await calculateIntradayRvol(ticker, tick.volume, new Date(tick.lastUpdated))
            : null;
        await observeV3BreakoutShadow(setup, tick.ltp, observation, new Date(tick.lastUpdated)).catch(error => {
            console.warn(`[V3 Shadow] Breakout audit failed for ${setup.ticker}:`, error?.message || error);
        });
        await observeV4BreakoutShadow(setup, tick.ltp, observation, new Date(tick.lastUpdated)).catch(error => {
            console.warn(`[V4 Shadow] Breakout audit failed for ${setup.ticker}:`, error?.message || error);
        });
        await transitionIfConfirmed(setup, tick.ltp, observation, 'dhan_tick', {
            prevClose: tick.prevClose,
            dayHigh: tick.dayHigh,
            dayLow: tick.dayLow,
            dayOpen: tick.dayOpen,
            averageTradePrice: tick.averageTradePrice,
            dayChangePct: tick.dayChangePct,
            cumulativeVolume: tick.volume,
        }, new Date(tick.lastUpdated));
    }
    const active = (await activeSetups()).filter(setup => normalizeTicker(setup.ticker) === ticker);
    for (const setup of active) {
        await resolveActiveSetup(setup, tick.ltp, 'dhan_tick', new Date(tick.lastUpdated));
    }
}

/**
 * REST reconciliation for a disconnected/stale WebSocket. It is deliberately
 * conservative: if intraday volume or the RVOL baseline is unavailable, the
 * setup remains QUALIFIED.
 */
async function pollStaleQualifiedSetups(): Promise<void> {
    if (pollInFlight || !isNseMarketHours()) return;
    pollInFlight = true;
    try {
        const setups = await qualifiedSetups();
        const now = Date.now();
        const stale = setups.filter(setup => {
            const tick = liveTickerStore.getTick(normalizeTicker(setup.ticker));
            return !tick || now - tick.lastUpdated > STALE_TICK_MS;
        });

        const snapshots = await Promise.allSettled(stale.map(setup => fetchIntradayPollingSnapshot(normalizeTicker(setup.ticker))));
        for (let index = 0; index < snapshots.length; index += 1) {
            const result = snapshots[index];
            if (result.status !== 'fulfilled' || !result.value) continue;
            const setup = stale[index];
            await transitionIfConfirmed(setup, result.value.ltp, result.value, 'rest_fallback', {
                cumulativeVolume: result.value.cumulativeVolume,
            }, new Date(result.value.fetchedAt));
        }

        const active = await activeSetups();
        const staleActive = active.filter(setup => {
            const tick = liveTickerStore.getTick(normalizeTicker(setup.ticker));
            return !tick || now - tick.lastUpdated > STALE_TICK_MS;
        });
        const activeSnapshots = await Promise.allSettled(
            staleActive.map(setup => fetchIntradayPollingSnapshot(normalizeTicker(setup.ticker))),
        );
        for (let index = 0; index < activeSnapshots.length; index += 1) {
            const result = activeSnapshots[index];
            if (result.status !== 'fulfilled' || !result.value) continue;
            await resolveActiveSetup(staleActive[index], result.value.ltp, 'rest_fallback', new Date(result.value.fetchedAt));
        }
    } catch (error: any) {
        console.warn('[Lifecycle] REST reconciliation failed:', error?.message || error);
    } finally {
        pollInFlight = false;
    }
}

/** Explicit scheduler/admin reconciliation without waiting for the interval. */
export async function reconcileQualifiedSetupTriggers(): Promise<void> {
    await refreshQualifiedSetupSubscriptions();
    await pollStaleQualifiedSetups();
}

export function initSetupLifecycleMonitor(): void {
    if (initialized) return;
    initialized = true;
    liveTickerStore.on('tick', tick => {
        void processTick(tick);
    });
    pollTimer = setInterval(() => {
        void refreshQualifiedSetupSubscriptions();
        void pollStaleQualifiedSetups();
    }, POLL_INTERVAL_MS);
    pollTimer.unref?.();
    console.log('[Lifecycle] Execution-integrity monitor enabled (opening + actual fill + actual outcome).');
}
