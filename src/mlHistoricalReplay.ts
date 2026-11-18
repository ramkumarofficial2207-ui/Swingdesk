import 'dotenv/config';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { SECTOR_MAP } from './dataService';
import {
    computeAtr14,
    computeConfidence,
    computeIndicators,
    detectCompressionSetup,
    identifySetupType,
} from './indicators';
import { buildMlRankingFeatures, ML_FEATURE_SCHEMA_VERSION, MlRankingFeatureRow } from './mlRankingService';
import {
    calcEffectiveRiskReward,
    estimateSlippagePct,
    inferSetupFamily,
    scoreBreakoutQuality,
    scoreCompressionQuality,
    scoreConfluence,
    scoreFiveDaySwingPotential,
    scoreGapQuality,
    scorePullbackQuality,
    scoreSwingComposite,
    scoreTomorrowContinuation,
} from './scanner';
import { Candle, MarketStatus, StockIndicators, TradeSetup } from './types';

const REPLAY_VERSION = 'nse-eod-replay-v1';
const MIN_HISTORY_BARS = 220;
const HISTORY_WINDOW_BARS = 300;
const MIN_AVG_VOLUME = 150_000;
const MAX_ATR_PCT = 12;

interface ReplayOptions {
    from: string;
    to?: string;
    step: number;
    universeLimit: number;
    topPerDate: number;
    triggerWindow: number;
    outcomeWindow: number;
    symbolBatchSize: number;
    force: boolean;
}

interface ReplayDbCandle {
    symbol: string;
    tradingDate: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    turnoverCr: number | null;
    totalTrades: number | null;
    deliveryQty: bigint | null;
    deliveryPct: number | null;
}

export interface HistoricalOutcome {
    outcome: 'WON' | 'LOST' | 'EXPIRED';
    returnPct: number;
    rMultiple: number;
    resolvedAt: string;
    triggered: boolean;
    triggeredAt: string | null;
    daysToTrigger: number | null;
    postTriggerOutcome: 'WON' | 'LOST' | 'TIME_EXIT' | null;
    timeExit: boolean;
    maximumR: number | null;
    minimumR: number | null;
}

interface ReplayCandidate {
    ticker: string;
    date: string;
    compositeScore: number;
    feature: MlRankingFeatureRow;
    outcome: HistoricalOutcome;
}

function finite(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function dateKey(value: Date | string): string {
    return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

function utcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
}

function roundToNseTick(price: number): number {
    return +(Math.round(price / 0.05) * 0.05).toFixed(2);
}

export function deterministicUuid(value: string): string {
    const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseArgs(argv: string[]): ReplayOptions {
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const separator = arg.indexOf('=');
        if (separator > 2) values.set(arg.slice(2, separator), arg.slice(separator + 1));
        else flags.add(arg.slice(2));
    }
    const integer = (name: string, fallback: number, min: number, max: number): number => {
        const parsed = Number(values.get(name));
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
    };
    const from = values.get('from') ?? '2021-01-01';
    const to = values.get('to');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
        throw new Error('Replay dates must use YYYY-MM-DD.');
    }
    return {
        from,
        to,
        step: integer('step', 5, 1, 20),
        universeLimit: integer('universe', 500, 50, 1_500),
        topPerDate: integer('top', 30, 5, 100),
        triggerWindow: integer('trigger-window', 5, 1, 15),
        outcomeWindow: integer('outcome-window', 20, 5, 60),
        symbolBatchSize: integer('symbol-batch', 30, 5, 100),
        force: flags.has('force'),
    };
}

function toCandle(row: ReplayDbCandle): Candle {
    return {
        date: dateKey(row.tradingDate),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
    };
}

function historicalMarketStatus(niftyCandles: Candle[]): MarketStatus {
    const closes = niftyCandles.map(candle => candle.close);
    const average = (count: number): number => {
        const values = closes.slice(-count);
        return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    };
    const dma50 = average(50);
    const dma200 = average(200);
    const close = closes[closes.length - 1] ?? 0;
    const regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF' = close > dma200 && dma50 > dma200
        ? 'BULLISH'
        : close < dma200 && dma50 < dma200
            ? 'RISK_OFF'
            : 'NEUTRAL';
    return {
        niftyChange: 0,
        vixChange: 0,
        safeToTrade: regime !== 'RISK_OFF',
        warning: 'Historical EOD regime reconstructed without VIX.',
        regime,
        positionSizeMult: regime === 'BULLISH' ? 1 : regime === 'NEUTRAL' ? 0.5 : 0,
        nifty50dma: dma50,
        nifty200dma: dma200,
        dmaCrossPct: dma200 > 0 ? ((dma50 - dma200) / dma200) * 100 : 0,
    };
}

function futureVolumeRatio(rows: ReplayDbCandle[], index: number): number {
    const prior = rows.slice(Math.max(0, index - 20), index).map(row => Number(row.volume));
    const average = prior.reduce((sum, value) => sum + value, 0) / Math.max(prior.length, 1);
    return average > 0 ? Number(rows[index].volume) / average : 0;
}

export function resolveHistoricalOutcome(params: {
    rows: ReplayDbCandle[];
    signalIndex: number;
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    triggerWindow: number;
    outcomeWindow: number;
    triggerVolumeRatio?: number;
}): HistoricalOutcome | null {
    const {
        rows,
        signalIndex,
        entryPrice,
        stopLoss,
        targetPrice,
        triggerWindow,
        outcomeWindow,
        triggerVolumeRatio = 1.5,
    } = params;
    const requiredLastIndex = signalIndex + triggerWindow + outcomeWindow;
    if (requiredLastIndex >= rows.length) return null;
    const risk = entryPrice - stopLoss;
    if (risk <= 0 || targetPrice <= entryPrice) return null;

    let triggerIndex = -1;
    for (let index = signalIndex + 1; index <= signalIndex + triggerWindow; index += 1) {
        if (rows[index].high >= entryPrice && futureVolumeRatio(rows, index) >= triggerVolumeRatio) {
            triggerIndex = index;
            break;
        }
    }

    if (triggerIndex < 0) {
        return {
            outcome: 'EXPIRED',
            returnPct: 0,
            rMultiple: 0,
            resolvedAt: dateKey(rows[signalIndex + triggerWindow].tradingDate),
            triggered: false,
            triggeredAt: null,
            daysToTrigger: null,
            postTriggerOutcome: null,
            timeExit: false,
            maximumR: null,
            minimumR: null,
        };
    }

    const lastOutcomeIndex = Math.min(rows.length - 1, triggerIndex + outcomeWindow);
    let maximumR = Number.NEGATIVE_INFINITY;
    let minimumR = Number.POSITIVE_INFINITY;
    for (let index = triggerIndex; index <= lastOutcomeIndex; index += 1) {
        const row = rows[index];
        maximumR = Math.max(maximumR, (row.high - entryPrice) / risk);
        minimumR = Math.min(minimumR, (row.low - entryPrice) / risk);
        const hitStop = row.low <= stopLoss;
        const hitTarget = row.high >= targetPrice;
        // Daily candles do not reveal intraday ordering. If both levels trade
        // on one bar, resolve as a loss to avoid optimistic label leakage.
        if (hitStop) {
            return {
                outcome: 'LOST',
                returnPct: +(((stopLoss - entryPrice) / entryPrice) * 100).toFixed(4),
                rMultiple: -1,
                resolvedAt: dateKey(row.tradingDate),
                triggered: true,
                triggeredAt: dateKey(rows[triggerIndex].tradingDate),
                daysToTrigger: triggerIndex - signalIndex,
                postTriggerOutcome: 'LOST',
                timeExit: false,
                maximumR: +maximumR.toFixed(4),
                minimumR: +minimumR.toFixed(4),
            };
        }
        if (hitTarget) {
            return {
                outcome: 'WON',
                returnPct: +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(4),
                rMultiple: +((targetPrice - entryPrice) / risk).toFixed(4),
                resolvedAt: dateKey(row.tradingDate),
                triggered: true,
                triggeredAt: dateKey(rows[triggerIndex].tradingDate),
                daysToTrigger: triggerIndex - signalIndex,
                postTriggerOutcome: 'WON',
                timeExit: false,
                maximumR: +maximumR.toFixed(4),
                minimumR: +minimumR.toFixed(4),
            };
        }
    }

    const exit = rows[lastOutcomeIndex].close;
    return {
        outcome: 'EXPIRED',
        returnPct: +(((exit - entryPrice) / entryPrice) * 100).toFixed(4),
        rMultiple: +((exit - entryPrice) / risk).toFixed(4),
        resolvedAt: dateKey(rows[lastOutcomeIndex].tradingDate),
        triggered: true,
        triggeredAt: dateKey(rows[triggerIndex].tradingDate),
        daysToTrigger: triggerIndex - signalIndex,
        postTriggerOutcome: 'TIME_EXIT',
        timeExit: true,
        maximumR: +maximumR.toFixed(4),
        minimumR: +minimumR.toFixed(4),
    };
}

function buildReplaySetup(
    ind: StockIndicators,
    marketStatus: MarketStatus,
    currentRow: ReplayDbCandle,
): { setup: TradeSetup; feature: MlRankingFeatureRow } | null {
    const setupType = identifySetupType(ind) as TradeSetup['setupType'];
    const lastCandle = ind.candles[ind.candles.length - 1];
    const previousClose = ind.candles[ind.candles.length - 2]?.close ?? lastCandle.close;
    const atr14 = computeAtr14(ind.candles);
    if (!Number.isFinite(atr14) || atr14 <= 0) return null;
    const recentHigh5 = Math.max(...ind.candles.slice(-5).map(candle => candle.high));
    const recentHigh10 = Math.max(...ind.candles.slice(-10).map(candle => candle.high));
    const recentHigh20 = Math.max(...ind.candles.slice(-20).map(candle => candle.high));
    const recentLow5 = Math.min(...ind.candles.slice(-5).map(candle => candle.low));
    const recentLow8 = Math.min(...ind.candles.slice(-8).map(candle => candle.low));
    const recentLow12 = Math.min(...ind.candles.slice(-12).map(candle => candle.low));

    let rawEntryPrice = lastCandle.high * 1.001;
    if (setupType.includes('Pre-Surge')) rawEntryPrice = Math.max(lastCandle.high, recentHigh5) * 1.001;
    else if (setupType === 'Leader Pullback Reclaim') rawEntryPrice = Math.max(lastCandle.high, ind.ema20, recentHigh10) * 1.001;
    else if (setupType === 'Second-Entry Retest') rawEntryPrice = Math.max(lastCandle.high, recentHigh20) * 1.0012;
    else if (setupType === 'Earnings Reaction Continuation') rawEntryPrice = Math.max(lastCandle.high, recentHigh10, ind.ema20) * 1.001;
    else if (setupType === 'Compression in Leaders') rawEntryPrice = Math.max(lastCandle.high, recentHigh5) * 1.0015;
    const entryPrice = roundToNseTick(rawEntryPrice);

    let rawStopLoss: number;
    if (setupType.includes('Pre-Surge')) rawStopLoss = Math.min(recentLow8, ind.ema20 * 0.985, entryPrice - 1.5 * atr14);
    else if (ind.isDeepValue) rawStopLoss = Math.min(...ind.candles.slice(-15).map(candle => candle.low)) * 0.99;
    else if (setupType === 'Leader Pullback Reclaim') rawStopLoss = Math.min(recentLow8, ind.ema20 * 0.993, entryPrice - 1.3 * atr14);
    else if (setupType === 'Second-Entry Retest') rawStopLoss = Math.min(recentLow12, ind.ema20 * 0.992, entryPrice - 1.5 * atr14);
    else if (setupType === 'Earnings Reaction Continuation') rawStopLoss = Math.min(recentLow5, previousClose * 0.995, entryPrice - 1.4 * atr14);
    else if (setupType === 'Compression in Leaders') rawStopLoss = Math.min(recentLow5, ind.ema20 * 0.994, entryPrice - 1.25 * atr14);
    else if (setupType.includes('VCP') || ind.isBullFlag || setupType === 'Squeeze Breakout' || setupType === 'Compression Breakout') rawStopLoss = recentLow5 * 0.993;
    else if (setupType.includes('Pullback')) rawStopLoss = recentLow8 * 0.994;
    else rawStopLoss = Math.min(ind.ema20 * 0.99, entryPrice - 1.5 * atr14);
    if (entryPrice - rawStopLoss > 2.5 * atr14) rawStopLoss = entryPrice - 2.5 * atr14;
    if (rawStopLoss >= entryPrice) rawStopLoss = entryPrice - atr14;
    const stopLoss = roundToNseTick(rawStopLoss);
    if (stopLoss <= 0 || stopLoss >= entryPrice) return null;

    const targetAtrMultiplier = setupType.includes('Pre-Surge') ? 4
        : setupType === 'Leader Pullback Reclaim' ? 2.8
            : setupType === 'Second-Entry Retest' ? 3.1
                : setupType === 'Earnings Reaction Continuation' ? 3.4
                    : setupType === 'Compression in Leaders' ? 3.2
                        : ind.isDeepValue ? 2.6 : 3;
    let targetPrice = roundToNseTick(entryPrice + targetAtrMultiplier * atr14);
    if (ind.isDeepValue && ind.ema50 > entryPrice + 2 * atr14) targetPrice = roundToNseTick(ind.ema50);
    const target2 = roundToNseTick(targetPrice + 1.5 * atr14);
    const targetPct = +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);
    const slPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
    const averageTurnover = (ind.avgVolume20d * ind.ltp) / 10_000_000;
    const estimatedMarketCap = Math.max(250, averageTurnover * 50);
    const slippagePct = estimateSlippagePct(estimatedMarketCap, ind.volumeRatio, 'Swing');
    const riskReward = calcEffectiveRiskReward(entryPrice, stopLoss, targetPrice, slippagePct);
    if (riskReward <= 0) return null;

    const recentSwingHigh = Math.max(...ind.candles.slice(-21, -1).map(candle => candle.high));
    const recentSwingLow = Math.min(...ind.candles.slice(-10).map(candle => candle.low));
    const gapPct = previousClose > 0 ? ((lastCandle.open - previousClose) / previousClose) * 100 : 0;
    const breakoutQuality = scoreBreakoutQuality({
        breakoutPct: ((lastCandle.close - recentSwingHigh) / Math.max(recentSwingHigh, 1)) * 100,
        volumeRatio: ind.volumeRatio,
        alignedTrend: ind.ema20 >= ind.ema50 * 0.99,
        aboveReference: lastCandle.close >= recentSwingHigh * 0.997,
        trendStrength: ind.adx14,
    });
    const pullbackQuality = scorePullbackQuality({
        distanceToReferencePct: Math.min(
            Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) * 100,
            Math.abs(ind.ltp - ind.ema50) / Math.max(ind.ema50, 1) * 100,
        ),
        holdsReference: lastCandle.close >= ind.ema20 * 0.995,
        bounceStrengthPct: ((lastCandle.close - lastCandle.low) / Math.max(lastCandle.low, 1)) * 100,
        volumeRatio: ind.volumeRatio,
        shallowRetracePct: ((Math.max(...ind.candles.slice(-10).map(candle => candle.high)) - recentSwingLow) / Math.max(ind.ltp, 1)) * 100,
    });
    const gapQuality = scoreGapQuality(gapPct, lastCandle.close >= ind.ema20 && ind.ema20 >= ind.ema50 * 0.99);
    const compression = detectCompressionSetup(ind.candles);
    const compressionQuality = scoreCompressionQuality(compression);
    const setupFamily = inferSetupFamily(setupType, ind);
    const tomorrowScore = scoreTomorrowContinuation({ ind, lastCandle, breakoutQuality, gapQuality });
    const fiveDayScore = scoreFiveDaySwingPotential({ ind, breakoutQuality, pullbackQuality });
    const confluenceScore = scoreConfluence({
        ind,
        setupFamily,
        breakoutQuality,
        pullbackQuality,
        gapQuality,
        compressionQuality,
        effectiveRiskReward: riskReward,
    });
    const predictiveEdge = (tomorrowScore * 0.46) + (fiveDayScore * 0.34) + (confluenceScore * 0.2);
    const regime = marketStatus.regime ?? 'NEUTRAL';
    let regimeMultiplier = 1;
    if (regime === 'BULLISH') {
        if (setupType === 'Squeeze Breakout' || ind.isBullFlag || setupType.includes('Breakout') || setupType === 'Momentum Continuation') regimeMultiplier = 1.2;
        else if (ind.isDeepValue) regimeMultiplier = 0.65;
    } else if (regime === 'NEUTRAL') {
        if (setupType === 'Compression Breakout' || setupType.includes('Contraction') || setupType.includes('Pullback') || setupType.includes('Bounce')) regimeMultiplier = 1.15;
        else if (setupType === 'Momentum Continuation' || ind.isBullFlag) regimeMultiplier = 0.8;
    } else if (ind.isDeepValue) regimeMultiplier = 1.3;
    else regimeMultiplier = 0.5;
    const confidence = clamp(computeConfidence(ind, riskReward, setupType).total * regimeMultiplier, 1, 10);
    const calibratedEdgeScore = clamp(predictiveEdge * regimeMultiplier, 1, 10);

    const deliveryPrior = finite(currentRow.deliveryPct);
    const setup: TradeSetup = {
        ticker: ind.ticker,
        sector: SECTOR_MAP[ind.ticker] ?? 'UNKNOWN',
        setupFamily,
        ltp: ind.ltp,
        trendStatus: 'Point-in-time historical replay',
        volumeSpike: `${ind.volumeRatio.toFixed(2)}x`,
        entryTrigger: `Historical confirmation above ${entryPrice}`,
        buyZone: entryPrice,
        target: targetPrice,
        target2,
        stopLoss,
        targetPct,
        slPct,
        riskReward,
        catalyst: 'Official NSE EOD point-in-time replay',
        confidenceScore: +confidence.toFixed(1),
        setupType,
        timeframe: 'Short Swing',
        earningsRisk: false,
        newsRisk: false,
        newsSummary: 'Context intentionally omitted from technical replay',
        momentumRank: 0,
        volatilityHitProb: 0,
        calibratedEdgeScore: +calibratedEdgeScore.toFixed(1),
        confluenceScore,
        discoverySources: ['LIQUIDITY'],
        institutionalCandidateScore: 0,
        institutionalScore: 0,
        institutionalNetBuyCr: 0,
        institutionalDeliverySpikeRatio: ind.institutionalDeliverySpikeRatio ?? 0,
        institutionalDeliveryPct: deliveryPrior,
        status: 'QUALIFIED',
        isTriggered: false,
    };
    const feature = buildMlRankingFeatures([setup], [ind], marketStatus)[0];
    return { setup, feature };
}

function addCandidate(topByDate: Map<string, ReplayCandidate[]>, candidate: ReplayCandidate, limit: number): void {
    const rows = topByDate.get(candidate.date) ?? [];
    rows.push(candidate);
    if (rows.length > limit * 2) {
        rows.sort((a, b) => b.compositeScore - a.compositeScore || a.ticker.localeCompare(b.ticker));
        rows.length = limit;
    }
    topByDate.set(candidate.date, rows);
}

async function persistReplay(candidates: ReplayCandidate[], force: boolean): Promise<void> {
    const snapshotRows = candidates.map(candidate => {
        const batchId = deterministicUuid(`${REPLAY_VERSION}:batch:${candidate.date}`);
        const id = deterministicUuid(`${REPLAY_VERSION}:snapshot:${candidate.date}:${candidate.ticker}`);
        return {
            id,
            batchId,
            ticker: candidate.ticker,
            asOf: utcDate(candidate.date),
            featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
            deterministicScore: candidate.feature.technicalScore,
            features: candidate.feature as unknown as Prisma.InputJsonValue,
        };
    });
    if (force) {
        for (let index = 0; index < snapshotRows.length; index += 1_000) {
            await prisma.mlFeatureSnapshot.deleteMany({
                where: { id: { in: snapshotRows.slice(index, index + 1_000).map(row => row.id) } },
            });
        }
    }
    for (let index = 0; index < snapshotRows.length; index += 500) {
        const snapshots = snapshotRows.slice(index, index + 500);
        await prisma.mlFeatureSnapshot.createMany({ data: snapshots, skipDuplicates: true });
        const candidateSlice = candidates.slice(index, index + 500);
        await prisma.mlOutcome.createMany({
            data: candidateSlice.map((candidate, offset) => ({
                id: deterministicUuid(`${REPLAY_VERSION}:outcome:${candidate.date}:${candidate.ticker}`),
                featureSnapshotId: snapshots[offset].id,
                outcome: candidate.outcome.outcome,
                returnPct: candidate.outcome.returnPct,
                rMultiple: candidate.outcome.rMultiple,
                triggered: candidate.outcome.triggered,
                triggeredAt: candidate.outcome.triggeredAt ? utcDate(candidate.outcome.triggeredAt) : null,
                daysToTrigger: candidate.outcome.daysToTrigger,
                postTriggerOutcome: candidate.outcome.postTriggerOutcome,
                timeExit: candidate.outcome.timeExit,
                maximumR: candidate.outcome.maximumR,
                minimumR: candidate.outcome.minimumR,
                resolvedAt: utcDate(candidate.outcome.resolvedAt),
            })),
            skipDuplicates: true,
        });
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const niftyRows = await prisma.dailyCandle.findMany({
        where: { symbol: 'NIFTY_50', isFinal: true },
        orderBy: { tradingDate: 'asc' },
    });
    if (niftyRows.length < MIN_HISTORY_BARS + options.triggerWindow + options.outcomeWindow) {
        throw new Error(`NIFTY history is insufficient (${niftyRows.length} rows).`);
    }
    const allNiftyCandles = niftyRows.map(row => ({
        date: dateKey(row.tradingDate),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
    }));
    const latestAllowedIndex = niftyRows.length - options.triggerWindow - options.outcomeWindow - 1;
    const replayDates: string[] = [];
    for (let index = MIN_HISTORY_BARS - 1, sequence = 0; index <= latestAllowedIndex; index += 1) {
        const key = dateKey(niftyRows[index].tradingDate);
        if (key < options.from || (options.to && key > options.to)) continue;
        if (sequence % options.step === 0) replayDates.push(key);
        sequence += 1;
    }
    if (replayDates.length < 60) throw new Error(`Only ${replayDates.length} replay dates selected; at least 60 are required.`);
    console.log(`[ML Replay] ${replayDates.length} point-in-time dates selected (${replayDates[0]} to ${replayDates[replayDates.length - 1]}).`);

    const liquidityRows = await prisma.dailyCandle.findMany({
        where: {
            tradingDate: { in: replayDates.map(utcDate) },
            symbol: { not: 'NIFTY_50' },
            isFinal: true,
            close: { gte: 50 },
            turnoverCr: { gte: 2 },
            totalTrades: { gte: 300 },
        },
        select: { symbol: true, tradingDate: true, turnoverCr: true, totalTrades: true },
    });
    const liquidityByDate = new Map<string, typeof liquidityRows>();
    for (const row of liquidityRows) {
        const key = dateKey(row.tradingDate);
        const values = liquidityByDate.get(key) ?? [];
        values.push(row);
        liquidityByDate.set(key, values);
    }
    const eligibleDatesBySymbol = new Map<string, Set<string>>();
    for (const key of replayDates) {
        const rows = liquidityByDate.get(key) ?? [];
        rows.sort((a, b) => finite(b.turnoverCr) - finite(a.turnoverCr) || finite(b.totalTrades) - finite(a.totalTrades));
        for (const row of rows.slice(0, options.universeLimit)) {
            const dates = eligibleDatesBySymbol.get(row.symbol) ?? new Set<string>();
            dates.add(key);
            eligibleDatesBySymbol.set(row.symbol, dates);
        }
    }
    const symbols = [...eligibleDatesBySymbol.keys()].sort();
    console.log(`[ML Replay] ${symbols.length} symbols entered at least one daily top-${options.universeLimit} liquidity universe.`);

    const niftyIndexByDate = new Map(allNiftyCandles.map((candle, index) => [candle.date, index]));
    const topByDate = new Map<string, ReplayCandidate[]>();
    let evaluated = 0;
    let validPlans = 0;
    const historyStart = utcDate(allNiftyCandles[Math.max(0, MIN_HISTORY_BARS - HISTORY_WINDOW_BARS)].date);
    const maximumDate = niftyRows[niftyRows.length - 1].tradingDate;

    for (let batchIndex = 0; batchIndex < symbols.length; batchIndex += options.symbolBatchSize) {
        const batch = symbols.slice(batchIndex, batchIndex + options.symbolBatchSize);
        const rows = await prisma.dailyCandle.findMany({
            where: {
                symbol: { in: batch },
                tradingDate: { gte: historyStart, lte: maximumDate },
                isFinal: true,
            },
            orderBy: [{ symbol: 'asc' }, { tradingDate: 'asc' }],
        }) as ReplayDbCandle[];
        const bySymbol = new Map<string, ReplayDbCandle[]>();
        for (const row of rows) {
            const values = bySymbol.get(row.symbol) ?? [];
            values.push(row);
            bySymbol.set(row.symbol, values);
        }

        for (const symbol of batch) {
            const symbolRows = bySymbol.get(symbol) ?? [];
            const rowIndexByDate = new Map(symbolRows.map((row, index) => [dateKey(row.tradingDate), index]));
            for (const key of eligibleDatesBySymbol.get(symbol) ?? []) {
                const signalIndex = rowIndexByDate.get(key);
                if (signalIndex == null || signalIndex + options.triggerWindow + options.outcomeWindow >= symbolRows.length) continue;
                const historyRows = symbolRows.slice(Math.max(0, signalIndex - HISTORY_WINDOW_BARS + 1), signalIndex + 1);
                if (historyRows.length < MIN_HISTORY_BARS) continue;
                const candles = historyRows.map(toCandle);
                const last20 = candles.slice(-20);
                const avgVolume = last20.reduce((sum, candle) => sum + candle.volume, 0) / Math.max(last20.length, 1);
                if (avgVolume < MIN_AVG_VOLUME) continue;
                const atr = computeAtr14(candles);
                const close = candles[candles.length - 1].close;
                if (close < 50 || close <= 0 || atr / close * 100 > MAX_ATR_PCT) continue;
                const niftyIndex = niftyIndexByDate.get(key);
                if (niftyIndex == null) continue;
                const niftyHistory = allNiftyCandles.slice(Math.max(0, niftyIndex - HISTORY_WINDOW_BARS + 1), niftyIndex + 1);
                const marketStatus = historicalMarketStatus(niftyHistory);
                if (marketStatus.regime === 'RISK_OFF') continue;

                evaluated += 1;
                const indicator = computeIndicators(symbol, candles, niftyHistory);
                if (!indicator) continue;
                const current = symbolRows[signalIndex];
                const priorDelivery = symbolRows
                    .slice(Math.max(0, signalIndex - 20), signalIndex)
                    .map(row => row.deliveryQty == null ? 0 : Number(row.deliveryQty))
                    .filter(value => value > 0);
                const averageDelivery = priorDelivery.reduce((sum, value) => sum + value, 0) / Math.max(priorDelivery.length, 1);
                indicator.discoverySources = ['LIQUIDITY'];
                indicator.institutionalDeliverySpikeRatio = averageDelivery > 0 && current.deliveryQty != null
                    ? Number(current.deliveryQty) / averageDelivery
                    : 0;
                indicator.institutionalDeliveryPct = current.deliveryPct ?? 0;

                const replaySetup = buildReplaySetup(indicator, marketStatus, current);
                if (!replaySetup) continue;
                const outcome = resolveHistoricalOutcome({
                    rows: symbolRows,
                    signalIndex,
                    entryPrice: replaySetup.setup.buyZone,
                    stopLoss: replaySetup.setup.stopLoss,
                    targetPrice: replaySetup.setup.target,
                    triggerWindow: options.triggerWindow,
                    outcomeWindow: options.outcomeWindow,
                });
                if (!outcome) continue;
                validPlans += 1;
                addCandidate(topByDate, {
                    ticker: symbol,
                    date: key,
                    compositeScore: scoreSwingComposite(indicator),
                    feature: replaySetup.feature,
                    outcome,
                }, options.topPerDate);
            }
        }
        if (batchIndex === 0 || batchIndex + batch.length === symbols.length || (batchIndex / options.symbolBatchSize) % 10 === 0) {
            console.log(`[ML Replay] ${Math.min(batchIndex + batch.length, symbols.length)}/${symbols.length} symbols; ${evaluated} indicator evaluations; ${validPlans} valid plans.`);
        }
    }

    const selected = [...topByDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([, rows]) => rows
            .sort((a, b) => b.compositeScore - a.compositeScore || a.ticker.localeCompare(b.ticker))
            .slice(0, options.topPerDate));
    const wins = selected.filter(candidate => candidate.outcome.outcome === 'WON').length;
    const losses = selected.filter(candidate => candidate.outcome.outcome === 'LOST').length;
    const expired = selected.filter(candidate => candidate.outcome.outcome === 'EXPIRED').length;
    if (selected.length < 2_000 || topByDate.size < 60) {
        throw new Error(`Replay produced only ${selected.length} samples across ${topByDate.size} dates; training gates require 2,000 samples and 60 dates.`);
    }
    await persistReplay(selected, options.force);
    console.log(`[ML Replay] Persisted ${selected.length} samples across ${topByDate.size} dates: ${wins} WON, ${losses} LOST, ${expired} EXPIRED.`);
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error('[ML Replay] Failed:', error?.message ?? error);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
