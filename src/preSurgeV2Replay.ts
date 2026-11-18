import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { assessEarlyBuy } from './earlyBuyStrategy';
import { calculateMaxBreakoutEntry, calculateRiskReward } from './executionIntegrity';
import { computeAtr14, computeIndicators, detectCompressionSetup, identifySetupType } from './indicators';
import { SECTOR_MAP } from './dataService';
import { assessPreSurgeV3 } from './preSurgeV3Strategy';
import { roundToNseTick } from './pricingUtils';
import { Candle, PreSurgeV3Plan, StockIndicators } from './types';

const MIN_HISTORY_BARS = 220;
const HISTORY_WINDOW_BARS = 300;
const MAX_ATR_PCT = 12;
const MIN_AVG_VOLUME = 225_000;

interface ReplayOptions {
    from: string;
    to?: string;
    step: number;
    universeLimit: number;
    topPerDate: number;
    symbolBatchSize: number;
    output: string;
}

interface DbCandle {
    symbol: string;
    tradingDate: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    turnoverCr: number | null;
    totalTrades: number | null;
}

interface LiquidityMember {
    symbol: string;
    tradingDate: Date;
}

export interface PreSurgeReplaySignal {
    ticker: string;
    signalDate: string;
    score: number;
    regime: 'BULLISH' | 'NEUTRAL';
    close: number;
    atr14: number;
    volumeRatio: number;
    breakoutPrice: number;
    maxBreakoutPrice: number;
    breakoutStop: number;
    targetPrice: number;
    plannedBreakoutRiskReward: number;
    earlyEntryLow: number;
    earlyEntryHigh: number;
    earlyStop: number;
    plannedEarlyRiskReward: number;
    earlyAllocationPct: number;
    breakoutAllocationPct: number;
    reasons: string[];
    sector?: string;
    sectorRs20d?: number;
    sectorSampleSize?: number;
    preSurgeV3?: PreSurgeV3Plan;
}

export interface PreSurgeReplayArtifact {
    generatedAt: string;
    strategyVersion: 'PRE_SURGE_V2';
    pointInTime: true;
    options: ReplayOptions;
    dataRange: { from: string; to: string };
    diagnostics: Record<string, number>;
    signals: PreSurgeReplaySignal[];
}

interface ReplayCandidate {
    signal: PreSurgeReplaySignal;
    indicator: StockIndicators;
    atr14: number;
    breakoutPrice: number;
    regime: 'BULLISH' | 'NEUTRAL';
}

function finite(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function dateKey(value: Date | string): string {
    return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

function utcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
}

function toCandle(row: DbCandle): Candle {
    return {
        date: dateKey(row.tradingDate),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
    };
}

function parseArgs(argv: string[]): ReplayOptions {
    const values = new Map<string, string>();
    for (const arg of argv) {
        if (!arg.startsWith('--') || !arg.includes('=')) continue;
        const separator = arg.indexOf('=');
        values.set(arg.slice(2, separator), arg.slice(separator + 1));
    }
    const integer = (name: string, fallback: number, min: number, max: number): number => {
        const parsed = Number(values.get(name));
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
    };
    const from = values.get('from') ?? '2021-09-01';
    const to = values.get('to');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
        throw new Error('Replay dates must use YYYY-MM-DD.');
    }
    return {
        from,
        to,
        step: integer('step', 1, 1, 20),
        universeLimit: integer('universe', 500, 50, 1_500),
        topPerDate: integer('top', 30, 1, 100),
        symbolBatchSize: integer('symbol-batch', 30, 5, 100),
        output: values.get('output') ?? 'reports/backtests/presurge_v2_signals.json',
    };
}

function average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ema(values: number[], period: number): number {
    if (values.length < period) return 0;
    const multiplier = 2 / (period + 1);
    let result = average(values.slice(0, period));
    for (const value of values.slice(period)) result = ((value - result) * multiplier) + result;
    return result;
}

function historicalRegime(nifty: Candle[]): 'BULLISH' | 'NEUTRAL' | 'RISK_OFF' {
    const closes = nifty.map(row => row.close);
    const dma50 = average(closes.slice(-50));
    const dma200 = average(closes.slice(-200));
    const close = closes[closes.length - 1] ?? 0;
    if (close > dma200 && dma50 > dma200) return 'BULLISH';
    if (close < dma200 && dma50 < dma200) return 'RISK_OFF';
    return 'NEUTRAL';
}

function compressionScore(candles: Candle[]): number {
    const compression = detectCompressionSetup(candles);
    let score = 4.2 + (compression.quality * 0.65);
    if (compression.volumeDryUp) score += 0.8;
    if (compression.pctFromPivot <= 2.5) score += 0.9;
    else if (compression.pctFromPivot > 4) score -= 0.7;
    if (compression.rangeTightnessPct <= 4.5) score += 0.9;
    else if (compression.rangeTightnessPct > 6.5) score -= 1.1;
    return +Math.min(10, Math.max(0, score)).toFixed(1);
}

function buildSignal(ticker: string, signalDate: string, candles: Candle[], nifty: Candle[]): ReplayCandidate | null {
    const latest = candles[candles.length - 1];
    const atr14 = computeAtr14(candles);
    if (!latest || atr14 <= 0 || latest.close <= 0) return null;
    const indicator = computeIndicators(ticker, candles, nifty);
    if (!indicator || !identifySetupType(indicator).includes('Pre-Surge')) return null;

    const recentHigh5 = Math.max(...candles.slice(-5).map(candle => candle.high));
    const recentLow8 = Math.min(...candles.slice(-8).map(candle => candle.low));
    const breakoutPrice = roundToNseTick(Math.max(latest.high, recentHigh5) * 1.001);
    let rawBreakoutStop = Math.min(recentLow8, indicator.ema20 * 0.985, breakoutPrice - (1.5 * atr14));
    if (breakoutPrice - rawBreakoutStop > 2.5 * atr14) rawBreakoutStop = breakoutPrice - (2.5 * atr14);
    if (rawBreakoutStop >= breakoutPrice) rawBreakoutStop = breakoutPrice - atr14;
    const breakoutStop = roundToNseTick(rawBreakoutStop);
    const targetPrice = roundToNseTick(breakoutPrice + (4 * atr14));
    if (breakoutStop <= 0 || targetPrice <= breakoutPrice) return null;

    const early = assessEarlyBuy({
        ltp: indicator.ltp,
        ema20: indicator.ema20,
        ema50: indicator.ema50,
        dma200: indicator.dma200,
        supertrend: indicator.supertrend,
        supertrendBullish: indicator.supertrendBullish,
        supertrendBullishDays: indicator.supertrendBullishDays,
        rsi14: indicator.rsi14,
        volumeRatio: indicator.volumeRatio,
        relativeStrengthVsNifty: indicator.returns3m - indicator.nifty3mReturn,
        accumulationScore: indicator.accumulationScore ?? 0,
        preMoveScore: indicator.preMoveScore,
        relativeStrengthAccelerationScore: indicator.relativeStrengthAccelerationScore,
        compressionQuality: compressionScore(candles),
        atr14,
        recentLow: recentLow8,
        breakoutPrice,
        targetPrice,
    });
    if (!early.eligible) return null;
    const regime = historicalRegime(nifty);
    if (regime === 'RISK_OFF') return null;

    return {
        indicator,
        atr14,
        breakoutPrice,
        regime,
        signal: {
            ticker,
            signalDate,
            score: early.score,
            regime,
            close: +latest.close.toFixed(2),
            atr14,
            volumeRatio: +indicator.volumeRatio.toFixed(3),
            breakoutPrice,
            maxBreakoutPrice: calculateMaxBreakoutEntry(breakoutPrice, atr14),
            breakoutStop,
            targetPrice,
            plannedBreakoutRiskReward: calculateRiskReward(breakoutPrice, breakoutStop, targetPrice),
            earlyEntryLow: early.zoneLow,
            earlyEntryHigh: early.zoneHigh,
            earlyStop: early.stopLoss,
            plannedEarlyRiskReward: early.plannedRiskReward,
            earlyAllocationPct: early.allocationPct,
            breakoutAllocationPct: 100 - early.allocationPct,
            reasons: early.reasons,
        },
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const niftyRows = await prisma.dailyCandle.findMany({
        where: { symbol: 'NIFTY_50', isFinal: true },
        orderBy: { tradingDate: 'asc' },
    }) as DbCandle[];
    if (niftyRows.length < MIN_HISTORY_BARS + 30) throw new Error('Insufficient NIFTY_50 history.');
    const niftyCandles = niftyRows.map(toCandle);
    const latestSignalIndex = niftyRows.length - 31;
    const replayDates: string[] = [];
    let sequence = 0;
    for (let index = MIN_HISTORY_BARS - 1; index <= latestSignalIndex; index += 1) {
        const key = dateKey(niftyRows[index].tradingDate);
        if (key < options.from || (options.to && key > options.to)) continue;
        if (sequence % options.step === 0) replayDates.push(key);
        sequence += 1;
    }
    if (!replayDates.length) throw new Error('No replay dates matched the requested range.');
    console.log(`[Pre-Surge V2] Selecting point-in-time top-${options.universeLimit} universe across ${replayDates.length} dates.`);

    const firstDate = utcDate(replayDates[0]);
    const lastDate = utcDate(replayDates[replayDates.length - 1]);
    const liquidityRows = await prisma.$queryRaw<LiquidityMember[]>(Prisma.sql`
        SELECT ranked."symbol", ranked."tradingDate"
        FROM (
            SELECT candle."symbol", candle."tradingDate",
                   ROW_NUMBER() OVER (
                       PARTITION BY candle."tradingDate"
                       ORDER BY candle."turnoverCr" DESC NULLS LAST, candle."totalTrades" DESC NULLS LAST
                   ) AS liquidity_rank
            FROM "DailyCandle" candle
            WHERE candle."tradingDate" >= ${firstDate}
              AND candle."tradingDate" <= ${lastDate}
              AND candle."symbol" <> 'NIFTY_50'
              AND candle."isFinal" = true
              AND candle."close" >= 50
              AND candle."turnoverCr" >= 2
              AND candle."totalTrades" >= 300
        ) ranked
        WHERE ranked.liquidity_rank <= ${options.universeLimit}
    `);
    const replayDateSet = new Set(replayDates);
    const eligibleDatesBySymbol = new Map<string, Set<string>>();
    for (const row of liquidityRows) {
        const key = dateKey(row.tradingDate);
        if (!replayDateSet.has(key)) continue;
        const dates = eligibleDatesBySymbol.get(row.symbol) ?? new Set<string>();
        dates.add(key);
        eligibleDatesBySymbol.set(row.symbol, dates);
    }
    const symbols = [...eligibleDatesBySymbol.keys()].sort();
    console.log(`[Pre-Surge V2] ${symbols.length} symbols entered the point-in-time universe.`);

    const niftyIndexByDate = new Map(niftyCandles.map((candle, index) => [candle.date, index]));
    const candidatesByDate = new Map<string, ReplayCandidate[]>();
    const sectorRsByDate = new Map<string, number[]>();
    let liquidityEvaluations = 0;
    let quickGateMatches = 0;
    let indicatorEvaluations = 0;
    const historyStart = niftyRows[0].tradingDate;
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
        }) as DbCandle[];
        const rowsBySymbol = new Map<string, DbCandle[]>();
        for (const row of rows) {
            const values = rowsBySymbol.get(row.symbol) ?? [];
            values.push(row);
            rowsBySymbol.set(row.symbol, values);
        }

        for (const symbol of batch) {
            const symbolRows = rowsBySymbol.get(symbol) ?? [];
            const indexByDate = new Map(symbolRows.map((row, index) => [dateKey(row.tradingDate), index]));
            let nextEligibleIndex = 0;
            for (const key of [...(eligibleDatesBySymbol.get(symbol) ?? [])].sort()) {
                const signalIndex = indexByDate.get(key);
                if (signalIndex == null || signalIndex < nextEligibleIndex || signalIndex < MIN_HISTORY_BARS - 1) continue;
                liquidityEvaluations += 1;
                const historyRows = symbolRows.slice(Math.max(0, signalIndex - HISTORY_WINDOW_BARS + 1), signalIndex + 1);
                if (historyRows.length < MIN_HISTORY_BARS) continue;
                const candles = historyRows.map(toCandle);
                const closes = candles.map(candle => candle.close);
                const latest = candles[candles.length - 1];
                const avgVolume20 = average(candles.slice(-20).map(candle => candle.volume));
                const volumeRatio = latest.volume / Math.max(avgVolume20, 1);
                const ema20 = ema(closes, 20);
                const ema50 = ema(closes, 50);
                const dma200 = average(closes.slice(-200));
                const atr14 = computeAtr14(candles);
                const niftyIndex = niftyIndexByDate.get(key);
                if (niftyIndex == null) continue;
                const niftyHistory = niftyCandles.slice(Math.max(0, niftyIndex - HISTORY_WINDOW_BARS + 1), niftyIndex + 1);
                const stock3m = closes.length >= 64 ? ((latest.close / closes[closes.length - 64]) - 1) * 100 : 0;
                const nifty3m = niftyHistory.length >= 64
                    ? ((niftyHistory[niftyHistory.length - 1].close / niftyHistory[niftyHistory.length - 64].close) - 1) * 100
                    : 0;
                const stock1m = closes.length >= 23 ? ((latest.close / closes[closes.length - 23]) - 1) * 100 : 0;
                const nifty1m = niftyHistory.length >= 23
                    ? ((niftyHistory[niftyHistory.length - 1].close / niftyHistory[niftyHistory.length - 23].close) - 1) * 100
                    : 0;
                const sector = SECTOR_MAP[symbol];
                if (sector) {
                    const sectorKey = `${key}|${sector}`;
                    const samples = sectorRsByDate.get(sectorKey) ?? [];
                    samples.push(stock1m - nifty1m);
                    sectorRsByDate.set(sectorKey, samples);
                }
                if (
                    avgVolume20 < MIN_AVG_VOLUME ||
                    latest.close < 50 ||
                    atr14 <= 0 ||
                    (atr14 / latest.close) * 100 > MAX_ATR_PCT ||
                    Math.abs(latest.close - ema20) / Math.max(ema20, 1) > 0.022 ||
                    volumeRatio > 0.92 ||
                    !(ema20 > ema50 && ema50 > dma200) ||
                    stock3m - nifty3m < 4.5 ||
                    historicalRegime(niftyHistory) === 'RISK_OFF'
                ) continue;
                quickGateMatches += 1;
                indicatorEvaluations += 1;
                const candidate = buildSignal(symbol, key, candles, niftyHistory);
                if (!candidate) continue;
                const values = candidatesByDate.get(key) ?? [];
                values.push(candidate);
                candidatesByDate.set(key, values);
                // The production active key prevents repeated plans while one
                // setup is alive. Thirty sessions is a conservative replay lock.
                nextEligibleIndex = signalIndex + 30;
            }
        }
        if (batchIndex === 0 || batchIndex + batch.length === symbols.length || batchIndex % (options.symbolBatchSize * 10) === 0) {
            const found = [...candidatesByDate.values()].reduce((sum, values) => sum + values.length, 0);
            console.log(`[Pre-Surge V2] ${Math.min(batchIndex + batch.length, symbols.length)}/${symbols.length} symbols; ${indicatorEvaluations} full indicator evaluations; ${found} eligible signals.`);
        }
    }

    const signals = [...candidatesByDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([key, values]) => values
            .sort((left, right) => right.signal.score - left.signal.score || left.signal.ticker.localeCompare(right.signal.ticker))
            .slice(0, options.topPerDate)
            .map(candidate => {
                const sector = SECTOR_MAP[candidate.signal.ticker] ?? 'UNKNOWN';
                const sectorSamples = sectorRsByDate.get(`${key}|${sector}`) ?? [];
                const sectorRs20d = median(sectorSamples);
                const positiveBreadth = sectorSamples.filter(value => value > 0).length / Math.max(sectorSamples.length, 1);
                const sectorOutperforming = sector !== 'UNKNOWN' && sectorSamples.length >= 3 && sectorRs20d > 0 && positiveBreadth >= 0.5;
                const preSurgeV3 = assessPreSurgeV3({
                    indicator: candidate.indicator,
                    atr14: candidate.atr14,
                    breakoutPrice: candidate.breakoutPrice,
                    sectorOutperforming,
                    sectorRs20d,
                    marketRegime: candidate.regime,
                    shadow: true,
                });
                return {
                    ...candidate.signal,
                    sector,
                    sectorRs20d: +sectorRs20d.toFixed(3),
                    sectorSampleSize: sectorSamples.length,
                    preSurgeV3,
                };
            }));
    const v3EligibleSignals = signals.filter(signal => signal.preSurgeV3?.eligible).length;
    const artifact: PreSurgeReplayArtifact = {
        generatedAt: new Date().toISOString(),
        strategyVersion: 'PRE_SURGE_V2',
        pointInTime: true,
        options,
        dataRange: { from: replayDates[0], to: replayDates[replayDates.length - 1] },
        diagnostics: {
            replayDates: replayDates.length,
            universeSymbols: symbols.length,
            liquidityEvaluations,
            quickGateMatches,
            indicatorEvaluations,
            eligibleSignals: signals.length,
            v3EligibleSignals,
        },
        signals,
    };
    const output = resolve(options.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(`[Pre-Surge V2] Wrote ${signals.length} point-in-time signals to ${output}.`);
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error('[Pre-Surge V2] Replay failed:', error?.message ?? error);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
