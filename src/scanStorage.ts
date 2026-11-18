import fs from 'fs';
import path from 'path';
import prisma from './prismaClient';
import { trackHistoricalSetup } from './edgeAnalyticsService';
import { PreSurgeV3Plan, PreSurgeV4Plan, ScanResult } from './types';
import { ensureTradePlan, strategyFamilyForSetupType } from './tradePlanService';

type ScanMode = 'swing' | 'intraday';
const DEFAULT_TRIGGER_RVOL = 1.5;

const DATA_DIR = path.join(__dirname, '..', 'data');
const SWING_CACHE_FILE = path.join(DATA_DIR, 'last_scan.json');
const INTRADAY_CACHE_FILE = path.join(DATA_DIR, 'last_intraday_scan.json');

function getCacheFilePath(mode: ScanMode): string {
    return mode === 'intraday' ? INTRADAY_CACHE_FILE : SWING_CACHE_FILE;
}

/**
 * A trade plan carries one shadow strategy. V4 is the frozen candidate under
 * evaluation, so it takes precedence; V3 is kept only when V4 is unavailable.
 */
export function shadowPlanForStorage(setup: Pick<ScanResult['setups'][number], 'preSurgeV3' | 'preSurgeV4'>): {
    shadowStrategyVersion: string | null;
    shadowPlan: PreSurgeV3Plan | PreSurgeV4Plan | null;
} {
    if (setup.preSurgeV4) return { shadowStrategyVersion: 'PRE_SURGE_V4_SHADOW', shadowPlan: setup.preSurgeV4 };
    if (setup.preSurgeV3) return { shadowStrategyVersion: 'PRE_SURGE_V3_SHADOW', shadowPlan: setup.preSurgeV3 };
    return { shadowStrategyVersion: null, shadowPlan: null };
}

async function persistExecutionPlan(
    historicalSetupId: string,
    setup: ScanResult['setups'][number],
    qualifiedAt: Date,
): Promise<void> {
    await ensureTradePlan({
        historicalSetupId,
        ticker: setup.ticker,
        setupType: setup.setupType,
        timeframe: setup.timeframe,
        entryPrice: setup.buyZone || setup.ltp,
        targetPrice: setup.target || setup.ltp * 1.1,
        stopLoss: setup.stopLoss || setup.ltp * 0.95,
        qualifiedAt,
        atr14: setup.atr14,
        earlyEntryLow: setup.earlyBuy?.eligible ? setup.earlyBuy.zoneLow : null,
        earlyEntryHigh: setup.earlyBuy?.eligible ? setup.earlyBuy.zoneHigh : null,
        earlyBuyReady: setup.earlyBuy?.eligible === true,
        ...shadowPlanForStorage(setup),
        allowLevelRevision: true,
    });
}

export async function saveScanResults(scanResult: ScanResult, mode: ScanMode = 'swing'): Promise<void> {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const filePath = getCacheFilePath(mode);
        fs.writeFileSync(filePath, JSON.stringify(scanResult, null, 2), 'utf-8');
        console.log(`[Storage] Saved scan result cache to ${filePath}`);

        // Persist every qualified setup into PostgreSQL. A setup gets one
        // lifecycle record while it remains unresolved; repeated scans update
        // that record instead of creating a duplicate card each time.
        if (scanResult.setups && scanResult.setups.length > 0) {
            let savedCount = 0;
            for (const s of scanResult.setups) {
                // A scanner signal is a candidate, not an executed trade. Even
                // when an EOD/intraday scan sees price and daily volume above
                // its thresholds, only the lifecycle monitor has same-time RVOL
                // evidence and may create a durable TRIGGERED transition.
                const isTriggeredTrade = false;
                const requestedTriggerRvol = Number(s.authorizedZone?.triggerVolumeRatio);
                const triggerVolumeRatio = Number.isFinite(requestedTriggerRvol)
                    ? Math.max(DEFAULT_TRIGGER_RVOL, requestedTriggerRvol)
                    : DEFAULT_TRIGGER_RVOL;
                const qualifiedAt = new Date(scanResult.timestamp);
                const activeStatuses = ['QUALIFIED', 'TRIGGERED', 'IN_PROGRESS', 'AUTHORIZED', 'MONITORED'];
                const exists = await prisma.historicalSetup.findFirst({
                    where: {
                        ticker: s.ticker,
                        status: { in: activeStatuses },
                    },
                    orderBy: { qualifiedAt: 'desc' },
                });

                if (!exists) {
                    const created = await prisma.historicalSetup.create({
                        data: {
                            ticker: s.ticker,
                            setupType: s.setupType || 'Breakout',
                            timeframe: s.timeframe || '1D',
                            aiSignal: s.aiSignal || 'WATCH',
                            confidenceScore: s.confidenceScore || 5.0,
                            entryPrice: s.buyZone || s.ltp,
                            targetPrice: s.target || s.ltp * 1.1,
                            stopLoss: s.stopLoss || s.ltp * 0.95,
                            aiLogic: s.aiLogic || s.catalyst || '',
                            status: isTriggeredTrade ? 'TRIGGERED' : 'QUALIFIED',
                            triggerConfirmed: isTriggeredTrade,
                            triggerVolumeRatio,
                            triggeredPrice: isTriggeredTrade ? Number(s.ltp) : null,
                            triggeredVolumeRatio: null,
                            qualifiedAt,
                            triggeredAt: isTriggeredTrade ? qualifiedAt : null,
                        },
                    });

                    // Track in performance engine
                    await trackHistoricalSetup(created.id, s, scanResult.marketStatus?.regime || 'NEUTRAL').catch(err => {
                        console.error(`[Storage] Failed to track historical setup for ${s.ticker}:`, err?.message);
                    });
                    await persistExecutionPlan(created.id, s, qualifiedAt);

                    savedCount++;
                } else {
                    const existingIsTriggered = exists.triggerConfirmed === true;
                    const nextStatus = existingIsTriggered
                        ? exists.status
                        : isTriggeredTrade
                        ? 'TRIGGERED'
                        : 'QUALIFIED';
                    await prisma.historicalSetup.updateMany({
                        where: {
                            id: exists.id,
                            // Never let a stale scan downgrade a live tick
                            // transition that has already confirmed price.
                            ...(existingIsTriggered || isTriggeredTrade ? {} : { triggerConfirmed: false }),
                        },
                        data: {
                            setupType: s.setupType || exists.setupType,
                            timeframe: s.timeframe || exists.timeframe,
                            aiSignal: s.aiSignal || exists.aiSignal,
                            confidenceScore: s.confidenceScore || exists.confidenceScore,
                            // Execution levels become immutable after a real
                            // fill; later scans may enrich analysis but cannot
                            // move the live trade's entry, target or stop.
                            entryPrice: existingIsTriggered ? exists.entryPrice : (s.buyZone || s.ltp || exists.entryPrice),
                            targetPrice: existingIsTriggered ? exists.targetPrice : (s.target || s.ltp * 1.1 || exists.targetPrice),
                            stopLoss: existingIsTriggered ? exists.stopLoss : (s.stopLoss || s.ltp * 0.95 || exists.stopLoss),
                            aiLogic: s.aiLogic || s.catalyst || exists.aiLogic,
                            status: nextStatus,
                            triggerConfirmed: existingIsTriggered || isTriggeredTrade,
                            triggerVolumeRatio: exists.triggerVolumeRatio || triggerVolumeRatio,
                            triggeredPrice: exists.triggeredPrice || (isTriggeredTrade ? Number(s.ltp) : null),
                            triggeredVolumeRatio: exists.triggeredVolumeRatio || null,
                            triggeredAt: exists.triggeredAt || (isTriggeredTrade ? qualifiedAt : null),
                        },
                    });
                    await persistExecutionPlan(exists.id, s, exists.qualifiedAt);
                }
            }
            console.log(`[Storage] Persisted ${savedCount} new setup lifecycle records to PostgreSQL.`);
        }
    } catch (err: any) {
        console.error('[Storage] Error saving scan results:', err?.message || err);
    }
}

export async function loadScanResults(mode: ScanMode = 'swing'): Promise<ScanResult | null> {
    let baseResult: ScanResult | null = null;
    try {
        const completed = await prisma.scanJob.findFirst({
            where: { mode, status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            select: { result: true },
        });
        const data = completed?.result as unknown as ScanResult | null;
        if (data && Array.isArray(data.setups)) {
            baseResult = data;
        }
    } catch (err: any) {
        console.warn('[Storage] Durable scan lookup unavailable:', err?.message || err);
    }

    if (!baseResult) {
        try {
            const filePath = getCacheFilePath(mode);
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const data: ScanResult = JSON.parse(raw);
                if (data && data.setups && Array.isArray(data.setups)) {
                    baseResult = data;
                }
            }
        } catch (err: any) {
            console.warn(`[Storage] Failed to read JSON scan cache:`, err?.message || err);
        }
    }

    if (!baseResult) return null;

    // Older scan payloads used IN_PROGRESS for every stored setup. Reclassify
    // WATCH payloads as qualified bases before the frontend derives lifecycle tabs.
    baseResult.setups = baseResult.setups.map((setup) => {
        const rawSetup = setup as any;
        if (rawSetup.status === 'IN_PROGRESS' && String(rawSetup.aiSignal || '').toUpperCase() === 'WATCH') {
            return { ...rawSetup, status: 'QUALIFIED' };
        }
        return setup;
    });

    return baseResult;
}

function dashboardStatus(rawStatus: string, aiSignal: string, triggerConfirmed: boolean): string {
    const status = String(rawStatus || '').toUpperCase();
    if (status === 'WON') return 'WON';
    if (status === 'LOST') return 'LOST';
    if (status === 'MISSED_GAP') return 'MISSED_GAP';
    if (status === 'INVALIDATED') return 'INVALIDATED';
    if (status === 'EXPIRED') return 'EXPIRED';
    if (!triggerConfirmed) return 'QUALIFIED';
    if (status === 'TRIGGERED') return 'TRIGGERED';
    if (status === 'IN_PROGRESS' || status === 'AUTHORIZED' || status === 'MONITORED') return 'IN_PROGRESS';
    if (status === 'QUALIFIED') return 'QUALIFIED';
    return aiSignal.toUpperCase() === 'WATCH' ? 'QUALIFIED' : 'WATCHLIST';
}

function historicalToDashboardSetup(history: any): Record<string, unknown> {
    const plan = history.tradePlan;
    const breakoutAttempt = plan?.attempts?.find((attempt: any) => attempt.leg === 'BREAKOUT');
    const entryPrice = Number(plan?.breakoutPrice ?? history.entryPrice) || 0;
    const actualFillPrice = Number(breakoutAttempt?.actualFillPrice ?? history.triggeredPrice) || undefined;
    const targetPrice = Number(plan?.targetPrice ?? history.targetPrice) || 0;
    const stopLoss = Number(plan?.stopLoss ?? history.stopLoss) || 0;
    const returnBase = actualFillPrice || entryPrice;
    const targetPct = returnBase > 0 ? ((targetPrice - returnBase) / returnBase) * 100 : 0;
    const stopLossPct = returnBase > 0 ? ((returnBase - stopLoss) / returnBase) * 100 : 0;
    const postTriggerPrediction = history.mlTriggerFeatureSnapshot?.predictions?.[0];

    return {
        id: history.id,
        ticker: history.ticker,
        companyName: history.ticker,
        sector: 'Historical setup',
        setupType: history.setupType,
        timeframe: history.timeframe,
        aiSignal: history.aiSignal,
        confidenceScore: history.confidenceScore,
        status: dashboardStatus(history.status, history.aiSignal, history.triggerConfirmed === true),
        triggerConfirmed: history.triggerConfirmed === true,
        triggerPrice: entryPrice,
        triggerVolumeRatio: Number(history.triggerVolumeRatio) || DEFAULT_TRIGGER_RVOL,
        triggeredPrice: actualFillPrice,
        triggeredVolumeRatio: Number(history.triggeredVolumeRatio) || undefined,
        ltp: entryPrice,
        changePct: 0,
        buyZone: entryPrice,
        buyZoneMax: entryPrice,
        target: targetPrice,
        target1: targetPrice,
        target1Pct: targetPct,
        stopLoss,
        stopLossPct,
        riskReward: stopLoss < returnBase && targetPrice > returnBase ? (targetPrice - returnBase) / (returnBase - stopLoss) : 0,
        entryTrigger: `Tracked from ${history.qualifiedAt.toISOString()}`,
        aiLogic: history.aiLogic || '',
        qualifiedAt: history.qualifiedAt.toISOString(),
        triggeredAt: history.triggeredAt?.toISOString(),
        updatedAt: history.updatedAt?.toISOString(),
        resolvedAt: history.resolvedAt?.toISOString(),
        resultPct: history.resultPct,
        executionStatus: plan?.status || history.status,
        openingPrice: Number(plan?.openingPrice) || undefined,
        openingObservedAt: plan?.openingObservedAt?.toISOString(),
        plannedBreakoutPrice: entryPrice,
        maxEntryPrice: Number(plan?.maxBreakoutPrice) || undefined,
        actualFillPrice,
        actualFillAt: breakoutAttempt?.actualFillAt?.toISOString() || history.triggeredAt?.toISOString(),
        actualExitPrice: Number(breakoutAttempt?.exitPrice) || undefined,
        actualExitAt: breakoutAttempt?.exitAt?.toISOString(),
        executionMissReason: breakoutAttempt?.missReason || undefined,
        earlyEntryLow: Number(plan?.earlyEntryLow) || undefined,
        earlyEntryHigh: Number(plan?.earlyEntryHigh) || undefined,
        strategyVersion: plan?.strategyVersion || undefined,
        shadowStrategyVersion: plan?.shadowStrategyVersion || undefined,
        preSurgeV3: plan?.shadowStrategyVersion === 'PRE_SURGE_V3_SHADOW' ? plan.shadowPlan || undefined : undefined,
        preSurgeV4: plan?.shadowStrategyVersion === 'PRE_SURGE_V4_SHADOW' ? plan.shadowPlan || undefined : undefined,
        mlPostTriggerWinProbability: postTriggerPrediction?.winProbability ?? undefined,
        mlPostTriggerExpectedR: postTriggerPrediction?.expectedR ?? undefined,
        mlPostTriggerModelName: postTriggerPrediction?.modelName ?? undefined,
        mlPostTriggerModelVersion: postTriggerPrediction?.modelVersion ?? undefined,
        mlPostTriggerModelStatus: postTriggerPrediction
            ? (postTriggerPrediction.productionEligible ? 'READY' : 'DEGRADED')
            : undefined,
    };
}

/**
 * Build the dashboard setup list from the current scan plus every durable
 * HistoricalSetup lifecycle record. Current scan fields enrich matching
 * historical rows, while the database status/timestamps remain authoritative.
 */
export async function buildDashboardScan(baseResult: ScanResult | null, mode: ScanMode = 'swing'): Promise<ScanResult | null> {
    const scan = baseResult ?? await loadScanResults(mode);
    if (!scan) return null;

    const history = await prisma.historicalSetup.findMany({
        orderBy: { qualifiedAt: 'desc' },
        include: {
            tradePlan: {
                include: {
                    attempts: { orderBy: { createdAt: 'asc' } },
                },
            },
            mlTriggerFeatureSnapshot: {
                include: {
                    predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
                },
            },
        },
    });
    const activeStatuses = new Set(['QUALIFIED', 'TRIGGERED', 'IN_PROGRESS', 'MONITORED', 'AUTHORIZED']);
    const canonicalActiveIds = new Set<string>();
    const seenActiveKeys = new Set<string>();
    [...history]
        .filter(row => activeStatuses.has(row.status) && row.resolvedAt == null)
        .sort((a, b) => b.confidenceScore - a.confidenceScore || b.qualifiedAt.getTime() - a.qualifiedAt.getTime())
        .forEach(row => {
            const key = `${row.ticker.replace(/\.NS$/i, '').toUpperCase()}:${strategyFamilyForSetupType(row.setupType)}:${row.timeframe || 'Short Swing'}`;
            if (seenActiveKeys.has(key)) return;
            seenActiveKeys.add(key);
            canonicalActiveIds.add(row.id);
        });
    const visibleHistory = history.filter(row => (
        !activeStatuses.has(row.status) || row.resolvedAt != null || canonicalActiveIds.has(row.id)
    ));
    const currentByTicker = new Map(scan.setups.map(setup => [setup.ticker.toUpperCase(), setup]));
    const historicalTickers = new Set<string>();
    const combined = visibleHistory.map(historyRow => {
        const ticker = historyRow.ticker.toUpperCase();
        historicalTickers.add(ticker);
        const historicalSetup = historicalToDashboardSetup(historyRow);
        const currentSetup = currentByTicker.get(ticker);
        return currentSetup
            ? {
                ...currentSetup,
                ...historicalSetup,
                // Keep the richer live-scan analytical fields when available.
                companyName: (currentSetup as any).companyName || historicalSetup.companyName,
                sector: (currentSetup as any).sector || historicalSetup.sector,
                ltp: (currentSetup as any).ltp || historicalSetup.ltp,
            }
            : historicalSetup;
    });

    // A scan can contain a setup whose persistence failed; keep it visible
    // until the next successful save rather than silently dropping it.
    const currentOnly = scan.setups.filter(setup => !historicalTickers.has(setup.ticker.toUpperCase()));
    return { ...scan, setups: [...combined, ...currentOnly] as any };
}
