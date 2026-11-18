import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { PreSurgeReplayArtifact, PreSurgeReplaySignal } from './preSurgeV2Replay';
import { assessV3BreakoutConfirmation, assessV3EarlyConfirmation, V3PriceBar } from './preSurgeV3Strategy';
import { Candle, PreSurgeV3Plan } from './types';

const IST_TIMEZONE = 'Asia/Kolkata';
const MARKET_OPEN_MINUTE = 9 * 60 + 15;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;
const PLAN_SESSIONS = 10;
const OUTCOME_SESSIONS = 20;
const RVOL_BASELINE_SESSIONS = 10;
const MIN_RVOL_SAMPLES = 5;
const ROUND_TRIP_COST_PCT = 0.25;

interface Options {
    input: string;
    cacheDir: string;
    outputJson: string;
    outputMarkdown: string;
}

interface IntradayCacheFile {
    ticker: string;
    candles: Candle[];
}

export interface V3ReplayBar extends Candle {
    replayTimestamp: number;
    tradingDate: string;
    tradingMinute: number;
    tradingBucket: string;
}

export interface V3ReplaySession {
    date: string;
    bars: V3ReplayBar[];
    cumulativeByBucket: Map<string, number>;
}

type ExitStatus = 'STOP' | 'PARTIAL_THEN_BREAKEVEN' | 'PARTIAL_THEN_TRAIL' | 'FINAL_TARGET' | 'TIME_EXIT';

export interface V3ExecutionResult {
    fillAt: string;
    fillPrice: number;
    stopLoss: number;
    partialTarget: number;
    finalTarget: number;
    partialHitAt: string | null;
    remainingExitAt: string;
    remainingExitPrice: number;
    status: ExitStatus;
    grossReturnPct: number;
    netReturnPct: number;
    rMultiple: number;
}

type AttemptStatus =
    | 'FILLED'
    | 'EOD_REJECTED'
    | 'INVALIDATED_PRE_ENTRY'
    | 'MISSED_OPEN_GAP'
    | 'MISSED_OVEREXTENDED'
    | 'TARGET_BEFORE_ENTRY'
    | 'MISSED_BREAKOUT'
    | 'EXPIRED'
    | 'INSUFFICIENT_DATA';

export interface V3Attempt {
    status: AttemptStatus;
    confirmedAt: string | null;
    openingPrice: number | null;
    triggerRvol: number | null;
    confirmationScore: number | null;
    reason: string;
    execution: V3ExecutionResult | null;
}

interface V3BacktestResult {
    ticker: string;
    signalDate: string;
    sector: string;
    score: number;
    eligible: boolean;
    rejectionReasons: string[];
    priceScaleFactor: number;
    early: V3Attempt;
    breakout: V3Attempt;
    combinedNetReturnPct: number;
    executed: boolean;
}

interface IstParts {
    date: string;
    minute: number;
    bucket: string;
}

function parseArgs(argv: string[]): Options {
    const values = new Map<string, string>();
    for (const arg of argv) {
        if (!arg.startsWith('--') || !arg.includes('=')) continue;
        const separator = arg.indexOf('=');
        values.set(arg.slice(2, separator), arg.slice(separator + 1));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
        input: resolve(values.get('input') ?? 'reports/backtests/presurge_v2_signals.json'),
        cacheDir: resolve(values.get('cache-dir') ?? 'reports/backtests/presurge_v2_intraday'),
        outputJson: resolve(values.get('output-json') ?? `reports/backtests/presurge_v3_intraday_${stamp}.json`),
        outputMarkdown: resolve(values.get('output-md') ?? `reports/backtests/presurge_v3_intraday_${stamp}.md`),
    };
}

function istParts(candle: Candle): IstParts {
    const value = new Date(Number(candle.timestamp ?? new Date(candle.date).getTime()));
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: IST_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(value);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
    const hour = Number(part('hour'));
    const minute = Number(part('minute'));
    return {
        date: `${part('year')}-${part('month')}-${part('day')}`,
        minute: (hour * 60) + minute,
        bucket: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
}

function timestamp(candle: Candle): number {
    return 'replayTimestamp' in candle
        ? Number((candle as V3ReplayBar).replayTimestamp)
        : Number(candle.timestamp ?? new Date(candle.date).getTime());
}

function iso(candle: Candle): string {
    return new Date(timestamp(candle)).toISOString();
}

export function buildV3Sessions(candles: Candle[]): V3ReplaySession[] {
    const byDate = new Map<string, V3ReplayBar[]>();
    for (const candle of candles) {
        const parts = istParts(candle);
        if (parts.minute < MARKET_OPEN_MINUTE || parts.minute > MARKET_CLOSE_MINUTE) continue;
        if (![candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(value) && value > 0)) continue;
        const values = byDate.get(parts.date) ?? [];
        values.push({
            ...candle,
            replayTimestamp: timestamp(candle),
            tradingDate: parts.date,
            tradingMinute: parts.minute,
            tradingBucket: parts.bucket,
        });
        byDate.set(parts.date, values);
    }
    return [...byDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, values]) => {
            const bars = values.sort((left, right) => timestamp(left) - timestamp(right));
            const cumulativeByBucket = new Map<string, number>();
            let cumulative = 0;
            for (const bar of bars) {
                cumulative += Math.max(0, bar.volume || 0);
                cumulativeByBucket.set(bar.tradingBucket, cumulative);
            }
            return { date, bars, cumulativeByBucket };
        });
}

function marketBars(sessions: V3ReplaySession[]): V3ReplayBar[] {
    return sessions.flatMap(session => session.bars).sort((left, right) => timestamp(left) - timestamp(right));
}

function cumulativeAtOrBefore(session: V3ReplaySession, bucket: string): number | null {
    const values = [...session.cumulativeByBucket.entries()]
        .filter(([key]) => key <= bucket)
        .sort(([left], [right]) => right.localeCompare(left));
    return values[0]?.[1] ?? null;
}

function rvolAt(sessions: V3ReplaySession[], sessionIndex: number, bucket: string, currentCumulative: number): number | null {
    const samples = sessions
        .slice(Math.max(0, sessionIndex - RVOL_BASELINE_SESSIONS), sessionIndex)
        .map(session => cumulativeAtOrBefore(session, bucket))
        .filter((value): value is number => value != null && value > 0);
    if (samples.length < MIN_RVOL_SAMPLES) return null;
    const baseline = average(samples);
    return baseline > 0 ? +(currentCumulative / baseline).toFixed(3) : null;
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

function aggregate(bars: V3ReplayBar[]): V3PriceBar | null {
    if (!bars.length) return null;
    return {
        open: bars[0].open,
        high: Math.max(...bars.map(bar => bar.high)),
        low: Math.min(...bars.map(bar => bar.low)),
        close: bars[bars.length - 1].close,
    };
}

function updateVwap(bar: V3ReplayBar, totals: { priceVolume: number; volume: number }): number {
    const volume = Math.max(0, bar.volume || 0);
    totals.priceVolume += ((bar.high + bar.low + bar.close) / 3) * volume;
    totals.volume += volume;
    return totals.volume > 0 ? totals.priceVolume / totals.volume : bar.close;
}

function emptyAttempt(status: AttemptStatus, reason: string, bar?: V3ReplayBar | null, openingPrice?: number | null): V3Attempt {
    return {
        status,
        confirmedAt: bar ? iso(bar) : null,
        openingPrice: openingPrice ?? null,
        triggerRvol: null,
        confirmationScore: null,
        reason,
        execution: null,
    };
}

function ema(previous: number | null, value: number, period: number): number {
    if (previous == null) return value;
    const multiplier = 2 / (period + 1);
    return ((value - previous) * multiplier) + previous;
}

export function resolveV3Outcome(
    sessions: V3ReplaySession[],
    bars: V3ReplayBar[],
    fillBar: V3ReplayBar,
    fillPrice: number,
    structuralStop: number,
): V3ExecutionResult {
    const fillIndex = bars.findIndex(bar => timestamp(bar) === timestamp(fillBar));
    const fillSessionIndex = sessions.findIndex(session => session.date === fillBar.tradingDate);
    const lastSessionIndex = Math.min(sessions.length - 1, fillSessionIndex + OUTCOME_SESSIONS);
    const lastDate = sessions[lastSessionIndex]?.date ?? fillBar.tradingDate;
    const risk = fillPrice - structuralStop;
    const partialTarget = fillPrice + (2 * risk);
    const finalTarget = fillPrice + (3.5 * risk);
    let ema10: number | null = null;
    for (let index = 0; index <= fillIndex; index += 1) ema10 = ema(ema10, bars[index].close, 10);
    let trailingStop = structuralStop;
    let partialHitAt: string | null = null;
    let partialExitPrice: number | null = null;
    let remainingExitBar = fillBar;
    let remainingExitPrice = fillPrice;
    let status: ExitStatus = 'TIME_EXIT';
    const openingTimestamps = new Set(sessions.map(session => timestamp(session.bars[0])).filter(Number.isFinite));
    const eligibleBars = bars.filter((bar, index) => index > fillIndex && bar.tradingDate <= lastDate);

    for (const bar of eligibleBars) {
        const isOpeningBar = openingTimestamps.has(timestamp(bar));
        if (isOpeningBar && bar.open <= trailingStop) {
            remainingExitBar = bar;
            remainingExitPrice = bar.open;
            status = partialHitAt ? (trailingStop <= fillPrice ? 'PARTIAL_THEN_BREAKEVEN' : 'PARTIAL_THEN_TRAIL') : 'STOP';
            break;
        }
        if (!partialHitAt && isOpeningBar && bar.open >= finalTarget) {
            partialHitAt = iso(bar);
            partialExitPrice = bar.open;
            remainingExitBar = bar;
            remainingExitPrice = bar.open;
            status = 'FINAL_TARGET';
            break;
        }
        if (!partialHitAt && isOpeningBar && bar.open >= partialTarget) {
            partialHitAt = iso(bar);
            partialExitPrice = bar.open;
            trailingStop = Math.max(fillPrice, ema10 ?? fillPrice);
        }
        // Stop-first is deliberately conservative when both levels occur in
        // the same five-minute candle and tick ordering is unavailable.
        if (bar.low <= trailingStop) {
            remainingExitBar = bar;
            remainingExitPrice = trailingStop;
            status = partialHitAt ? (trailingStop <= fillPrice ? 'PARTIAL_THEN_BREAKEVEN' : 'PARTIAL_THEN_TRAIL') : 'STOP';
            break;
        }
        if (!partialHitAt && bar.high >= partialTarget) {
            partialHitAt = iso(bar);
            partialExitPrice = partialTarget;
            trailingStop = fillPrice;
            ema10 = ema(ema10, bar.close, 10);
            trailingStop = Math.max(trailingStop, ema10);
            continue;
        }
        if (partialHitAt && bar.high >= finalTarget) {
            remainingExitBar = bar;
            remainingExitPrice = finalTarget;
            status = 'FINAL_TARGET';
            break;
        }
        ema10 = ema(ema10, bar.close, 10);
        if (partialHitAt) trailingStop = Math.max(fillPrice, trailingStop, ema10);
        remainingExitBar = bar;
        remainingExitPrice = bar.close;
    }

    if (!eligibleBars.length) {
        remainingExitBar = fillBar;
        remainingExitPrice = fillPrice;
    }
    const partialPct = partialHitAt ? 0.5 : 0;
    const remainingPct = 1 - partialPct;
    const weightedExitPrice = ((partialExitPrice ?? 0) * partialPct) + (remainingExitPrice * remainingPct);
    const grossReturnPct = ((weightedExitPrice - fillPrice) / fillPrice) * 100;
    const netReturnPct = grossReturnPct - ROUND_TRIP_COST_PCT;
    const netPricePnl = (weightedExitPrice - fillPrice) - (fillPrice * ROUND_TRIP_COST_PCT / 100);
    return {
        fillAt: iso(fillBar),
        fillPrice: +fillPrice.toFixed(2),
        stopLoss: +structuralStop.toFixed(2),
        partialTarget: +partialTarget.toFixed(2),
        finalTarget: +finalTarget.toFixed(2),
        partialHitAt,
        remainingExitAt: iso(remainingExitBar),
        remainingExitPrice: +remainingExitPrice.toFixed(2),
        status,
        grossReturnPct: +grossReturnPct.toFixed(3),
        netReturnPct: +netReturnPct.toFixed(3),
        rMultiple: risk > 0 ? +(netPricePnl / risk).toFixed(3) : 0,
    };
}

export function simulateV3Early(
    signalDate: string,
    plan: PreSurgeV3Plan,
    sessions: V3ReplaySession[],
    bars: V3ReplayBar[],
): V3Attempt {
    const firstFutureSessionIndex = sessions.findIndex(session => session.date > signalDate);
    if (firstFutureSessionIndex < MIN_RVOL_SAMPLES || sessions.length - firstFutureSessionIndex < PLAN_SESSIONS) {
        return emptyAttempt('INSUFFICIENT_DATA', 'Insufficient baseline or ten-session forward coverage');
    }
    const planSessions = sessions.slice(firstFutureSessionIndex, firstFutureSessionIndex + PLAN_SESSIONS);
    let firstOpeningPrice: number | null = null;
    for (let offset = 0; offset < planSessions.length; offset += 1) {
        const session = planSessions[offset];
        const openingBar = session.bars[0];
        if (!openingBar) continue;
        if (firstOpeningPrice == null) firstOpeningPrice = openingBar.open;
        const priorSession = sessions[firstFutureSessionIndex + offset - 1];
        const previousClose = priorSession?.bars.slice(-1)[0]?.close ?? 0;
        const gapPct = previousClose > 0 ? ((openingBar.open - previousClose) / previousClose) * 100 : 0;
        let zoneTouched = false;
        const totals = { priceVolume: 0, volume: 0 };
        for (let barIndex = 0; barIndex < session.bars.length; barIndex += 1) {
            const bar = session.bars[barIndex];
            const vwap = updateVwap(bar, totals);
            if (bar.low <= plan.earlyEntry.structuralStop) {
                return emptyAttempt('INVALIDATED_PRE_ENTRY', 'Structural stop traded before Early confirmation', bar, openingBar.open);
            }
            if (bar.low <= plan.earlyEntry.zoneHigh && bar.high >= plan.earlyEntry.zoneLow) zoneTouched = true;
            if (bar.close >= plan.breakout.pivot) {
                return emptyAttempt('MISSED_BREAKOUT', 'Price reached the breakout pivot before a valid Early confirmation', bar, openingBar.open);
            }
            if (!zoneTouched || barIndex < 2) continue;
            const latest15m = aggregate(session.bars.slice(barIndex - 2, barIndex + 1));
            const decision = assessV3EarlyConfirmation({
                plan,
                zoneTouched,
                openingGapPct: gapPct,
                vwap,
                latest5m: bar,
                previous5m: session.bars[barIndex - 1],
                latest15m,
                marketSafe: true,
            });
            if (!decision.confirmed) continue;
            const execution = resolveV3Outcome(sessions, bars, bar, bar.close, plan.earlyEntry.structuralStop);
            return {
                status: 'FILLED', confirmedAt: iso(bar), openingPrice: openingBar.open,
                triggerRvol: null, confirmationScore: decision.score,
                reason: 'Same-session zone touch followed by 5m VWAP reclaim, higher low and below-pivot price cap',
                execution,
            };
        }
    }
    const terminal = planSessions[planSessions.length - 1]?.bars.slice(-1)[0];
    return emptyAttempt('EXPIRED', 'No valid Early confirmation within ten sessions', terminal, firstOpeningPrice);
}

export function simulateV3Breakout(
    signalDate: string,
    plan: PreSurgeV3Plan,
    sessions: V3ReplaySession[],
    bars: V3ReplayBar[],
): V3Attempt {
    const firstFutureSessionIndex = sessions.findIndex(session => session.date > signalDate);
    if (firstFutureSessionIndex < MIN_RVOL_SAMPLES || sessions.length - firstFutureSessionIndex < PLAN_SESSIONS) {
        return emptyAttempt('INSUFFICIENT_DATA', 'Fewer than five RVOL baseline or ten future sessions');
    }
    const planSessions = sessions.slice(firstFutureSessionIndex, firstFutureSessionIndex + PLAN_SESSIONS);
    let firstOpeningPrice: number | null = null;
    for (let offset = 0; offset < planSessions.length; offset += 1) {
        const session = planSessions[offset];
        const sessionIndex = firstFutureSessionIndex + offset;
        const openingBar = session.bars[0];
        if (!openingBar) continue;
        if (firstOpeningPrice == null) firstOpeningPrice = openingBar.open;
        if (openingBar.open >= plan.exits.partialTarget) {
            return emptyAttempt('TARGET_BEFORE_ENTRY', 'Session opened at/above planned partial target', openingBar, openingBar.open);
        }
        if (openingBar.open > plan.breakout.maxEntry) {
            return emptyAttempt('MISSED_OPEN_GAP', 'Opening price exceeded maximum breakout entry', openingBar, openingBar.open);
        }
        let cumulativeVolume = 0;
        const totals = { priceVolume: 0, volume: 0 };
        for (let barIndex = 0; barIndex < session.bars.length; barIndex += 1) {
            const bar = session.bars[barIndex];
            cumulativeVolume += Math.max(0, bar.volume || 0);
            const vwap = updateVwap(bar, totals);
            if (bar.low <= plan.breakout.structuralStop) {
                return emptyAttempt('INVALIDATED_PRE_ENTRY', 'Structural stop traded before breakout confirmation', bar, openingBar.open);
            }
            if (bar.high >= plan.exits.partialTarget) {
                return emptyAttempt('TARGET_BEFORE_ENTRY', 'Planned partial target traded before a valid breakout fill', bar, openingBar.open);
            }
            if ((barIndex + 1) % 3 !== 0) continue;
            const latest15m = aggregate(session.bars.slice(barIndex - 2, barIndex + 1));
            if (!latest15m || latest15m.close <= plan.breakout.pivot) continue;
            const rvol = rvolAt(sessions, sessionIndex, bar.tradingBucket, cumulativeVolume);
            if (rvol == null) continue;
            const decision = assessV3BreakoutConfirmation({
                plan,
                observedPrice: latest15m.close,
                observedRvol: rvol,
                vwap,
                latest15m,
                marketSafe: true,
            });
            if (!decision.confirmed) {
                if (latest15m.close > plan.breakout.maxEntry) {
                    return {
                        ...emptyAttempt('MISSED_OVEREXTENDED', decision.rejectionReasons.join('; '), bar, openingBar.open),
                        triggerRvol: rvol,
                        confirmationScore: decision.score,
                    };
                }
                continue;
            }
            const execution = resolveV3Outcome(sessions, bars, bar, latest15m.close, plan.breakout.structuralStop);
            return {
                status: 'FILLED', confirmedAt: iso(bar), openingPrice: openingBar.open,
                triggerRvol: rvol, confirmationScore: decision.score,
                reason: 'Completed 15m close above pivot with same-time RVOL, VWAP, close-location and price-cap confirmation',
                execution,
            };
        }
    }
    const terminal = planSessions[planSessions.length - 1]?.bars.slice(-1)[0];
    return emptyAttempt('EXPIRED', 'No valid 15-minute breakout confirmation within ten sessions', terminal, firstOpeningPrice);
}

function cacheFile(cacheDir: string, ticker: string): string {
    return resolve(cacheDir, `${ticker.replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}.json`);
}

function scalePlan(plan: PreSurgeV3Plan, factor: number): PreSurgeV3Plan {
    if (factor === 1) return plan;
    const scaled = (value: number) => +(value * factor).toFixed(4);
    return {
        ...plan,
        earlyEntry: {
            ...plan.earlyEntry,
            zoneLow: scaled(plan.earlyEntry.zoneLow),
            zoneHigh: scaled(plan.earlyEntry.zoneHigh),
            maxEntry: scaled(plan.earlyEntry.maxEntry),
            structuralStop: scaled(plan.earlyEntry.structuralStop),
        },
        breakout: {
            ...plan.breakout,
            pivot: scaled(plan.breakout.pivot),
            maxEntry: scaled(plan.breakout.maxEntry),
            structuralStop: scaled(plan.breakout.structuralStop),
        },
        exits: {
            ...plan.exits,
            partialTarget: scaled(plan.exits.partialTarget),
            finalTarget: scaled(plan.exits.finalTarget),
        },
    };
}

function normalizedPlan(signal: PreSurgeReplaySignal, plan: PreSurgeV3Plan, sessions: V3ReplaySession[]): { plan: PreSurgeV3Plan; factor: number } {
    const signalSession = sessions.find(session => session.date === signal.signalDate);
    const intradayReference = signalSession?.bars.slice(-1)[0]?.close;
    if (!intradayReference || intradayReference <= 0 || signal.close <= 0) return { plan, factor: 1 };
    const ratio = intradayReference / signal.close;
    const factor = ratio >= 0.8 && ratio <= 1.2 ? 1 : ratio;
    return { plan: scalePlan(plan, factor), factor: +factor.toFixed(8) };
}

function maximumDrawdown(returns: number[]): number {
    let equity = 1;
    let peak = 1;
    let maximum = 0;
    for (const value of returns) {
        equity *= 1 + (value / 100);
        peak = Math.max(peak, equity);
        maximum = Math.max(maximum, ((peak - equity) / peak) * 100);
    }
    return +maximum.toFixed(2);
}

function summarize(results: V3BacktestResult[]) {
    const eligible = results.filter(result => result.eligible);
    const covered = eligible.filter(result => result.early.status !== 'INSUFFICIENT_DATA' && result.breakout.status !== 'INSUFFICIENT_DATA');
    const executed = covered.filter(result => result.executed);
    const returns = executed.map(result => result.combinedNetReturnPct);
    const positives = returns.filter(value => value > 0);
    const negatives = returns.filter(value => value < 0);
    const grossProfit = positives.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(negatives.reduce((sum, value) => sum + value, 0));
    const earlyExecutions = covered.map(result => result.early.execution).filter((value): value is V3ExecutionResult => value != null);
    const breakoutExecutions = covered.map(result => result.breakout.execution).filter((value): value is V3ExecutionResult => value != null);
    const statusCounts = (attempts: V3Attempt[]) => attempts.reduce<Record<string, number>>((counts, attempt) => {
        counts[attempt.status] = (counts[attempt.status] ?? 0) + 1;
        return counts;
    }, {});
    return {
        candidateSignals: results.length,
        eligibleSignals: eligible.length,
        eodRejectionRatePct: +((results.length - eligible.length) / Math.max(results.length, 1) * 100).toFixed(2),
        coveredSignals: covered.length,
        executedPlans: executed.length,
        executionRatePct: +(executed.length / Math.max(covered.length, 1) * 100).toFixed(2),
        profitablePlans: positives.length,
        losingPlans: negatives.length,
        winRatePct: +(positives.length / Math.max(executed.length, 1) * 100).toFixed(2),
        averageNetReturnPct: +average(returns).toFixed(3),
        medianNetReturnPct: +median(returns).toFixed(3),
        profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(3) : null,
        maximumDrawdownPct: maximumDrawdown(returns),
        earlyFills: earlyExecutions.length,
        earlyAverageNetReturnPct: +average(earlyExecutions.map(value => value.netReturnPct)).toFixed(3),
        breakoutFills: breakoutExecutions.length,
        breakoutAverageNetReturnPct: +average(breakoutExecutions.map(value => value.netReturnPct)).toFixed(3),
        partialTargetHits: [...earlyExecutions, ...breakoutExecutions].filter(value => value.partialHitAt != null).length,
        finalTargetHits: [...earlyExecutions, ...breakoutExecutions].filter(value => value.status === 'FINAL_TARGET').length,
        earlyStatusCounts: statusCounts(eligible.map(result => result.early)),
        breakoutStatusCounts: statusCounts(eligible.map(result => result.breakout)),
    };
}

function statusRows(counts: Record<string, number>): string {
    return Object.entries(counts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => `| ${status} | ${count} |`)
        .join('\n') || '| None | 0 |';
}

function markdownReport(
    artifact: PreSurgeReplayArtifact,
    summary: ReturnType<typeof summarize>,
    development: ReturnType<typeof summarize>,
    validation: ReturnType<typeof summarize>,
): string {
    return `# Pre-Surge V3 Five/15-Minute Shadow Backtest\n\n` +
        `Generated: ${new Date().toISOString()}\n\n` +
        `V3 is a shadow challenger. It does not place orders and this report does not promote it to production execution.\n\n` +
        `## Overall result\n\n` +
        `| Metric | Value |\n|---|---:|\n` +
        `| V2 candidate signals assessed | ${summary.candidateSignals} |\n` +
        `| V3 EOD-qualified signals | ${summary.eligibleSignals} |\n` +
        `| EOD rejection rate | ${summary.eodRejectionRatePct}% |\n` +
        `| Signals with complete intraday coverage | ${summary.coveredSignals} |\n` +
        `| Executed plans | ${summary.executedPlans} (${summary.executionRatePct}%) |\n` +
        `| Profitable-plan rate | ${summary.winRatePct}% |\n` +
        `| Average combined net return | ${summary.averageNetReturnPct}% |\n` +
        `| Median combined net return | ${summary.medianNetReturnPct}% |\n` +
        `| Profit factor | ${summary.profitFactor ?? 'N/A'} |\n` +
        `| Equal-trade realized max drawdown | ${summary.maximumDrawdownPct}% |\n` +
        `| Early / breakout fills | ${summary.earlyFills} / ${summary.breakoutFills} |\n` +
        `| Partial / final target hits | ${summary.partialTargetHits} / ${summary.finalTargetHits} |\n\n` +
        `## Time split\n\n` +
        `| Split | Eligible | Executed | Win rate | Avg net | Profit factor | Max DD |\n|---|---:|---:|---:|---:|---:|---:|\n` +
        `| Development (through 2024) | ${development.eligibleSignals} | ${development.executedPlans} | ${development.winRatePct}% | ${development.averageNetReturnPct}% | ${development.profitFactor ?? 'N/A'} | ${development.maximumDrawdownPct}% |\n` +
        `| Validation (2025 onward) | ${validation.eligibleSignals} | ${validation.executedPlans} | ${validation.winRatePct}% | ${validation.averageNetReturnPct}% | ${validation.profitFactor ?? 'N/A'} | ${validation.maximumDrawdownPct}% |\n\n` +
        `This is a chronological diagnostic split, not an untouched holdout. A future prospective period is still required before promotion.\n\n` +
        `## Early funnel\n\n| State | Count |\n|---|---:|\n${statusRows(summary.earlyStatusCounts)}\n\n` +
        `## Breakout funnel\n\n| State | Count |\n|---|---:|\n${statusRows(summary.breakoutStatusCounts)}\n\n` +
        `## Exact replay policy\n\n` +
        `- EOD qualification is point-in-time and uses an NSE-liquidity universe plus cross-sectional 20-session sector relative strength available on that date.\n` +
        `- Early fills occur at the confirming five-minute close only after a same-session zone touch, VWAP reclaim, higher low, opening-gap guard, maximum-entry cap and below-pivot guard. Merely touching the zone is not a fill.\n` +
        `- Breakout fills occur only after a completed 15-minute close above pivot with cumulative same-time RVOL >= 1.5x, VWAP support, upper-quartile close and maximum-entry cap.\n` +
        `- Capital weights are 20% Early and 80% Breakout. Unfilled capital remains cash.\n` +
        `- Each filled leg takes 50% off at 2R, moves the rest to breakeven, then trails on the prior five-minute EMA10 toward 3.5R. The replay uses EMA10 because historical intraday Supertrend is not persisted separately.\n` +
        `- Returns include ${ROUND_TRIP_COST_PCT}% round-trip cost per filled leg. If stop and target share one five-minute candle, stop is assumed first.\n` +
        `- Intraday market-regime confirmation is not claimed because the cache contains stock candles, not synchronized NIFTY five-minute candles; the EOD risk-off gate remains enforced.\n` +
        `- Source signal range: ${artifact.dataRange.from} to ${artifact.dataRange.to}.\n`;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    if (!existsSync(options.input)) throw new Error(`Signal artifact not found: ${options.input}`);
    const artifact = JSON.parse(readFileSync(options.input, 'utf8')) as PreSurgeReplayArtifact;
    const results: V3BacktestResult[] = [];
    let missingFiles = 0;
    for (const signal of artifact.signals) {
        const plan = signal.preSurgeV3;
        if (!plan?.eligible) {
            const rejected = emptyAttempt('EOD_REJECTED', plan?.rejectionReasons.join('; ') || 'V3 plan missing from replay artifact');
            results.push({
                ticker: signal.ticker, signalDate: signal.signalDate, sector: signal.sector ?? 'UNKNOWN',
                score: plan?.score ?? 0, eligible: false, rejectionReasons: plan?.rejectionReasons ?? ['V3 plan missing'],
                priceScaleFactor: 1, early: rejected, breakout: rejected, combinedNetReturnPct: 0, executed: false,
            });
            continue;
        }
        const file = cacheFile(options.cacheDir, signal.ticker);
        if (!existsSync(file)) {
            missingFiles += 1;
            const missing = emptyAttempt('INSUFFICIENT_DATA', 'Ticker intraday cache missing');
            results.push({
                ticker: signal.ticker, signalDate: signal.signalDate, sector: signal.sector ?? 'UNKNOWN',
                score: plan.score, eligible: true, rejectionReasons: [], priceScaleFactor: 1,
                early: missing, breakout: missing, combinedNetReturnPct: 0, executed: false,
            });
            continue;
        }
        const cache = JSON.parse(readFileSync(file, 'utf8')) as IntradayCacheFile;
        const sessions = buildV3Sessions(cache.candles ?? []);
        const bars = marketBars(sessions);
        const normalized = normalizedPlan(signal, plan, sessions);
        const early = simulateV3Early(signal.signalDate, normalized.plan, sessions, bars);
        const breakout = simulateV3Breakout(signal.signalDate, normalized.plan, sessions, bars);
        const earlyReturn = early.execution ? (normalized.plan.earlyEntry.allocationPct / 100) * early.execution.netReturnPct : 0;
        const breakoutReturn = breakout.execution ? (normalized.plan.breakout.allocationPct / 100) * breakout.execution.netReturnPct : 0;
        results.push({
            ticker: signal.ticker, signalDate: signal.signalDate, sector: signal.sector ?? 'UNKNOWN',
            score: plan.score, eligible: true, rejectionReasons: [], priceScaleFactor: normalized.factor,
            early, breakout, combinedNetReturnPct: +(earlyReturn + breakoutReturn).toFixed(3),
            executed: Boolean(early.execution || breakout.execution),
        });
    }
    const summary = summarize(results);
    const development = summarize(results.filter(result => result.signalDate <= '2024-12-31'));
    const validation = summarize(results.filter(result => result.signalDate >= '2025-01-01'));
    const report = {
        generatedAt: new Date().toISOString(),
        strategyVersion: 'PRE_SURGE_V3_SHADOW',
        sourceArtifact: options.input,
        cacheDirectory: options.cacheDir,
        methodology: {
            signalTiming: 'EOD qualification; entries begin next session',
            earlyConfirmation: 'SAME_SESSION_ZONE_TOUCH_THEN_5M_RECLAIM',
            breakoutConfirmation: 'COMPLETED_15M_CLOSE_WITH_SAME_TIME_RVOL',
            allocations: { earlyPct: 20, breakoutPct: 80 },
            exits: { partialAtR: 2, partialPct: 50, finalAtR: 3.5, trail: 'PRIOR_5M_EMA10' },
            planSessions: PLAN_SESSIONS,
            outcomeSessions: OUTCOME_SESSIONS,
            roundTripCostPctPerFilledLeg: ROUND_TRIP_COST_PCT,
            ambiguousBarPolicy: 'STOP_FIRST',
            promotionStatus: 'SHADOW_ONLY',
        },
        missingFiles,
        summary,
        splits: { development, validation },
        results,
    };
    mkdirSync(dirname(options.outputJson), { recursive: true });
    mkdirSync(dirname(options.outputMarkdown), { recursive: true });
    writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(options.outputMarkdown, markdownReport(artifact, summary, development, validation), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`[Pre-Surge V3] Reports: ${options.outputMarkdown} and ${options.outputJson}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error('[Pre-Surge V3] Intraday backtest failed:', error?.message ?? error);
        process.exitCode = 1;
    });
}
