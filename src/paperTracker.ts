import prisma from './prismaClient';
import { loadAdjustedDailySeries, loadCorporateActions } from './adjustedCandles';
import { ScanResult } from './types';
import {
    advanceScannerSignal,
    decideTrustStatus,
    EVIDENCE_METHOD_VERSION,
    EVIDENCE_RULES,
    EVIDENCE_TRIGGER_MODE,
    SignalProgress,
    TriggerMode,
    TrustStatus,
} from './research/setupEvidence';
import { OutcomeStats } from './research/fivePercentStudy';

/**
 * Live paper tracking (Phase 3). After each finalized after-close scan:
 *   1. advance every open paper signal with the new finalized candles,
 *   2. record new signals for setup types that are On trial or Trusted,
 *   3. promote or demote setup types from their live record.
 * Uses exactly the replay's rules (advanceScannerSignal). Never places orders.
 */

/** Live paper signals use the same trigger that decides trust status (rules v2). */
export const PAPER_TRIGGER_MODE: TriggerMode = EVIDENCE_TRIGGER_MODE;
const LOOKBACK_DAYS_FOR_VOLUME = 45;
const TRACKED_STATUSES: TrustStatus[] = ['ON_TRIAL', 'TRUSTED'];
export const OPEN_STATES = ['PENDING', 'OPEN'] as const;
export const CLOSED_STATES = ['TARGET', 'STOP', 'EXPIRED'] as const;

function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function utcDate(key: string): Date {
    return new Date(`${key}T00:00:00.000Z`);
}

/** Product of split/bonus factors with ex-date after the signal date. */
export function factorAfter(events: Array<{ exDate: string; priceFactor: number }>, signalDate: string): number {
    return events.filter(event => event.exDate > signalDate).reduce((product, event) => product * event.priceFactor, 1);
}

/** Map a progress state onto stored columns. */
export function progressToUpdate(progress: SignalProgress, dates: string[]): {
    state: string;
    fillDate: Date | null;
    fillPrice: number | null;
    exitDate: Date | null;
    exitPrice: number | null;
    netR: number | null;
    reachedGoalFirst: boolean | null;
} {
    const empty = { fillDate: null, fillPrice: null, exitDate: null, exitPrice: null, netR: null, reachedGoalFirst: null };
    switch (progress.state) {
        case 'PENDING':
        case 'NOT_TRIGGERED':
        case 'SKIPPED_CHASE':
            return { state: progress.state, ...empty };
        case 'OPEN':
            return { state: 'OPEN', ...empty, fillDate: utcDate(dates[progress.fillIndex]), fillPrice: progress.fill };
        case 'CLOSED': {
            const { trade } = progress;
            return {
                state: trade.label.outcome,
                fillDate: utcDate(dates[trade.fillIndex]),
                fillPrice: trade.fill,
                exitDate: utcDate(dates[trade.label.exitIndex]),
                exitPrice: trade.label.exit,
                netR: trade.label.netR,
                reachedGoalFirst: progress.goalResolved ? trade.reachedGoalFirst : null,
            };
        }
    }
}

/** Advance every PENDING / OPEN paper signal with the finalized candles available now. */
export async function resolvePaperSignals(): Promise<{ checked: number; closed: number }> {
    const open = await prisma.paperSignal.findMany({ where: { state: { in: [...OPEN_STATES] } } });
    let closed = 0;
    for (const signal of open) {
        const signalKey = dateKey(signal.signalDate);
        const from = new Date(signal.signalDate.getTime() - LOOKBACK_DAYS_FOR_VOLUME * 86_400_000);
        const [series, events] = await Promise.all([loadAdjustedDailySeries(signal.ticker, { from }), loadCorporateActions(signal.ticker)]);
        const dates = series.bars.map(bar => bar.date);
        const signalIndex = dates.indexOf(signalKey);
        if (signalIndex < 0) continue;
        // Levels were stored in signal-day prices; express them in today's share count.
        const factor = factorAfter(events, signalKey);
        const levels = {
            entryPrice: signal.entryPrice * factor,
            stopLoss: signal.stopLoss * factor,
            targetPrice: signal.targetPrice * factor,
            target2: signal.targetPrice * factor,
            slPct: 0,
            targetPct: 0,
        };
        const progress = advanceScannerSignal(series.bars, signalIndex, levels, signal.atr14 * factor, signal.triggerMode as TriggerMode);
        const update = progressToUpdate(progress, dates);
        if ((CLOSED_STATES as readonly string[]).includes(update.state)) closed += 1;
        await prisma.paperSignal.update({
            where: { id: signal.id },
            data: { ...update, lastCheckedDate: utcDate(dates[dates.length - 1]) },
        });
    }
    return { checked: open.length, closed };
}

/** Latest finalized session on or before the scan time, per ticker. */
async function signalDateFor(ticker: string, scanAt: Date): Promise<string | null> {
    const row = await prisma.dailyCandle.findFirst({
        where: { symbol: ticker, isFinal: true, tradingDate: { lte: scanAt } },
        orderBy: { tradingDate: 'desc' },
        select: { tradingDate: true },
    });
    return row ? dateKey(row.tradingDate) : null;
}

/**
 * Record paper signals for setups whose type is On trial or Trusted. One open
 * signal per stock and setup type at a time, as in the replay.
 */
export async function recordPaperSignals(scan: ScanResult, scanId?: string): Promise<number> {
    const evidence = await prisma.setupEvidence.findMany({
        where: { methodVersion: EVIDENCE_METHOD_VERSION, status: { in: TRACKED_STATUSES } },
        select: { setupType: true, status: true },
    });
    const statusByType = new Map(evidence.map(item => [item.setupType, item.status]));
    const scanAt = new Date(scan.timestamp);
    let recorded = 0;
    for (const setup of scan.setups) {
        const status = statusByType.get(setup.setupType);
        if (!status) continue;
        const entryPrice = setup.buyZone;
        const { stopLoss, target: targetPrice } = setup;
        const atr14 = Number(setup.atr14);
        if (!(entryPrice > 0 && stopLoss > 0 && stopLoss < entryPrice && targetPrice > entryPrice && atr14 > 0)) continue;
        const busy = await prisma.paperSignal.findFirst({
            where: { ticker: setup.ticker, setupType: setup.setupType, state: { in: [...OPEN_STATES] } },
            select: { id: true },
        });
        if (busy) continue;
        const signalKey = await signalDateFor(setup.ticker, scanAt);
        if (!signalKey) continue;
        const created = await prisma.paperSignal.createMany({
            data: [{
                ticker: setup.ticker, setupType: setup.setupType, signalDate: utcDate(signalKey), scanId: scanId ?? null,
                entryPrice, stopLoss, targetPrice, atr14, triggerMode: PAPER_TRIGGER_MODE,
                statusAtSignal: status, state: 'PENDING',
            }],
            skipDuplicates: true,
        });
        recorded += created.count;
    }
    return recorded;
}

export interface LiveRecord {
    closed: number;
    avgNetR: number | null;
    recentAvgNetR: number | null;
    open: number;
    pending: number;
    targetHits: number;
}

export function summarizeLive(signals: Array<{ state: string; netR: number | null; exitDate: Date | null }>): LiveRecord {
    const closedSignals = signals
        .filter(signal => (CLOSED_STATES as readonly string[]).includes(signal.state) && signal.netR !== null)
        .sort((left, right) => (left.exitDate?.getTime() ?? 0) - (right.exitDate?.getTime() ?? 0));
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const recent = closedSignals.slice(-EVIDENCE_RULES.trustedMinLiveTrades);
    return {
        closed: closedSignals.length,
        avgNetR: average(closedSignals.map(signal => signal.netR!)),
        recentAvgNetR: recent.length >= EVIDENCE_RULES.trustedMinLiveTrades ? average(recent.map(signal => signal.netR!)) : null,
        open: signals.filter(signal => signal.state === 'OPEN').length,
        pending: signals.filter(signal => signal.state === 'PENDING').length,
        targetHits: closedSignals.filter(signal => signal.state === 'TARGET').length,
    };
}

export async function getLiveRecords(): Promise<Map<string, LiveRecord>> {
    const signals = await prisma.paperSignal.findMany({ select: { setupType: true, state: true, netR: true, exitDate: true } });
    const byType = new Map<string, typeof signals>();
    for (const signal of signals) {
        const list = byType.get(signal.setupType) ?? [];
        list.push(signal);
        byType.set(signal.setupType, list);
    }
    return new Map([...byType].map(([setupType, list]) => [setupType, summarizeLive(list)]));
}

/** Re-decide each setup type's status from its test evidence and live paper record. */
export async function updateTrustFromPaper(): Promise<Array<{ setupType: string; from: string; to: string }>> {
    const [rows, live] = await Promise.all([
        prisma.setupEvidence.findMany({ where: { methodVersion: EVIDENCE_METHOD_VERSION } }),
        getLiveRecords(),
    ]);
    const changes: Array<{ setupType: string; from: string; to: string }> = [];
    for (const row of rows) {
        const record = live.get(row.setupType);
        if (!record || !record.closed) continue;
        const decision = decideTrustStatus({
            test: row.test as unknown as OutcomeStats,
            testYears: row.testYears as unknown as Array<{ year: string; stats: OutcomeStats }>,
            liveTrades: { n: record.closed, avgNetR: record.avgNetR ?? 0 },
            recentLiveAvgNetR: record.recentAvgNetR,
        });
        if (decision.status !== row.status || JSON.stringify(decision.reasons) !== JSON.stringify(row.reasons)) {
            await prisma.setupEvidence.update({ where: { id: row.id }, data: { status: decision.status, reasons: decision.reasons } });
            if (decision.status !== row.status) changes.push({ setupType: row.setupType, from: row.status, to: decision.status });
        }
    }
    return changes;
}

/** The full nightly cycle. Safe to run repeatedly; it never places orders. */
export async function runPaperTracking(scan?: ScanResult | null, scanId?: string): Promise<{ checked: number; closed: number; recorded: number; changes: Array<{ setupType: string; from: string; to: string }> }> {
    const { checked, closed } = await resolvePaperSignals();
    const recorded = scan ? await recordPaperSignals(scan, scanId) : 0;
    const changes = await updateTrustFromPaper();
    console.log(`[PaperTracker] checked ${checked}, closed ${closed}, recorded ${recorded}${changes.length ? `, status changes: ${changes.map(change => `${change.setupType} ${change.from}→${change.to}`).join('; ')}` : ''}`);
    return { checked, closed, recorded, changes };
}
