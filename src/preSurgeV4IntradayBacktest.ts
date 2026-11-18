import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { PreSurgeReplayArtifact, PreSurgeReplaySignal } from './preSurgeV2Replay';
import { assessV4BreakoutConfirmation, assessV4RetestConfirmation, V4PriceBar } from './preSurgeV4Strategy';
import { Candle, PreSurgeV4Plan } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const IST_TIMEZONE = 'Asia/Kolkata';
const MARKET_OPEN_MINUTE = 9 * 60 + 15;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

// V4 uses 8 baseline sessions (same as V3 — sparse NSE data prohibits longer).
const RVOL_BASELINE_SESSIONS = 10;
const MIN_RVOL_SAMPLES = 5;
// V4 forward plan window: 10 sessions for breakout, 3 for retest-after-breakout.
const BREAKOUT_PLAN_SESSIONS = 10;
// Up to 20 sessions to resolve the outcome after entry.
const OUTCOME_SESSIONS = 20;
const ROUND_TRIP_COST_PCT = 0.25;

// ─── Types ───────────────────────────────────────────────────────────────────

interface Options {
    input: string;
    v3Result: string;
    cacheDir: string;
    outputJson: string;
    outputMarkdown: string;
}

interface IntradayCacheFile {
    ticker: string;
    candles: Candle[];
}

export interface V4ReplayBar extends Candle {
    replayTimestamp: number;
    tradingDate: string;
    tradingMinute: number;
    tradingBucket: string;
}

export interface V4ReplaySession {
    date: string;
    bars: V4ReplayBar[];
    cumulativeByBucket: Map<string, number>;
}

type ExitStatus =
    | 'STOP'
    | 'PARTIAL_THEN_ONE_R'        // stop moved to 1R after partial — guaranteed profit
    | 'PARTIAL_THEN_TRAIL'        // trailing stop beyond 1R
    | 'FINAL_TARGET'
    | 'TIME_EXIT';

export interface V4ExecutionResult {
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
    | 'EXPIRED'
    | 'INSUFFICIENT_DATA';

export interface V4Attempt {
    status: AttemptStatus;
    confirmedAt: string | null;
    openingPrice: number | null;
    triggerRvol: number | null;
    confirmationScore: number | null;
    reason: string;
    execution: V4ExecutionResult | null;
}

interface V4BacktestResult {
    ticker: string;
    signalDate: string;
    sector: string;
    score: number;
    eligible: boolean;
    rejectionReasons: string[];
    priceScaleFactor: number;
    breakout: V4Attempt;
    // V4 does not have an early arm; field kept for schema consistency.
    combinedNetReturnPct: number;
    executed: boolean;
}

interface IstParts {
    date: string;
    minute: number;
    bucket: string;
}

// ─── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(argv: string[]): Options {
    const values = new Map<string, string>();
    for (const arg of argv) {
        if (!arg.startsWith('--') || !arg.includes('=')) continue;
        const sep = arg.indexOf('=');
        values.set(arg.slice(2, sep), arg.slice(sep + 1));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
        input: resolve(values.get('input') ?? 'reports/backtests/presurge_v2_signals_full_2021_2026.json'),
        v3Result: resolve(values.get('v3-result') ?? 'reports/backtests/presurge_v3_intraday_full_2021_2026_result.json'),
        cacheDir: resolve(values.get('cache-dir') ?? 'reports/backtests/presurge_v3_intraday_full_2021_2026'),
        outputJson: resolve(values.get('output-json') ?? `reports/backtests/presurge_v4_intraday_${stamp}.json`),
        outputMarkdown: resolve(values.get('output-md') ?? `reports/backtests/presurge_v4_intraday_${stamp}.md`),
    };
}

// ─── Session utilities ───────────────────────────────────────────────────────

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
        ? Number((candle as V4ReplayBar).replayTimestamp)
        : Number(candle.timestamp ?? new Date(candle.date).getTime());
}

function iso(candle: Candle): string {
    return new Date(timestamp(candle)).toISOString();
}

export function buildV4Sessions(candles: Candle[]): V4ReplaySession[] {
    const byDate = new Map<string, V4ReplayBar[]>();
    for (const candle of candles) {
        const parts = istParts(candle);
        if (parts.minute < MARKET_OPEN_MINUTE || parts.minute > MARKET_CLOSE_MINUTE) continue;
        if (![candle.open, candle.high, candle.low, candle.close].every(v => Number.isFinite(v) && v > 0)) continue;
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
        .sort(([l], [r]) => l.localeCompare(r))
        .map(([date, values]) => {
            const bars = values.sort((l, r) => timestamp(l) - timestamp(r));
            const cumulativeByBucket = new Map<string, number>();
            let cumulative = 0;
            for (const bar of bars) {
                cumulative += Math.max(0, bar.volume || 0);
                cumulativeByBucket.set(bar.tradingBucket, cumulative);
            }
            return { date, bars, cumulativeByBucket };
        });
}

function marketBars(sessions: V4ReplaySession[]): V4ReplayBar[] {
    return sessions.flatMap(s => s.bars).sort((l, r) => timestamp(l) - timestamp(r));
}

function cumulativeAtOrBefore(session: V4ReplaySession, bucket: string): number | null {
    const values = [...session.cumulativeByBucket.entries()]
        .filter(([key]) => key <= bucket)
        .sort(([l], [r]) => r.localeCompare(l));
    return values[0]?.[1] ?? null;
}

function rvolAt(sessions: V4ReplaySession[], sessionIndex: number, bucket: string, current: number): number | null {
    const samples = sessions
        .slice(Math.max(0, sessionIndex - RVOL_BASELINE_SESSIONS), sessionIndex)
        .map(s => cumulativeAtOrBefore(s, bucket))
        .filter((v): v is number => v != null && v > 0);
    if (samples.length < MIN_RVOL_SAMPLES) return null;
    const baseline = average(samples);
    return baseline > 0 ? +(current / baseline).toFixed(3) : null;
}

function average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((l, r) => l - r);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function aggregate(bars: V4ReplayBar[]): V4PriceBar | null {
    if (!bars.length) return null;
    return {
        open: bars[0].open,
        high: Math.max(...bars.map(b => b.high)),
        low: Math.min(...bars.map(b => b.low)),
        close: bars[bars.length - 1].close,
    };
}

function updateVwap(bar: V4ReplayBar, totals: { priceVolume: number; volume: number }): number {
    const vol = Math.max(0, bar.volume || 0);
    totals.priceVolume += ((bar.high + bar.low + bar.close) / 3) * vol;
    totals.volume += vol;
    return totals.volume > 0 ? totals.priceVolume / totals.volume : bar.close;
}

function emptyAttempt(status: AttemptStatus, reason: string, bar?: V4ReplayBar | null, openingPrice?: number | null): V4Attempt {
    return { status, confirmedAt: bar ? iso(bar) : null, openingPrice: openingPrice ?? null, triggerRvol: null, confirmationScore: null, reason, execution: null };
}

function ema(previous: number | null, value: number, period: number): number {
    if (previous == null) return value;
    return ((value - previous) * (2 / (period + 1))) + previous;
}

// ─── Outcome resolution ──────────────────────────────────────────────────────

/**
 * V4 exit mechanics vs V3:
 *  - After 50% partial at 2R, trailing stop moves to **1R** (not breakeven/0R).
 *    This guarantees a minimum profitable outcome on remaining shares.
 *  - EMA10 trail is used (same as V3 for replay compatibility; live uses Supertrend).
 *  - Time-stop at OUTCOME_SESSIONS prevents zombie runners.
 */
export function resolveV4Outcome(
    sessions: V4ReplaySession[],
    bars: V4ReplayBar[],
    fillBar: V4ReplayBar,
    fillPrice: number,
    structuralStop: number,
): V4ExecutionResult {
    const fillIndex = bars.findIndex(bar => timestamp(bar) === timestamp(fillBar));
    const fillSessionIndex = sessions.findIndex(s => s.date === fillBar.tradingDate);
    const lastSessionIndex = Math.min(sessions.length - 1, fillSessionIndex + OUTCOME_SESSIONS);
    const lastDate = sessions[lastSessionIndex]?.date ?? fillBar.tradingDate;
    const risk = fillPrice - structuralStop;
    const partialTarget = fillPrice + (2 * risk);
    const finalTarget = fillPrice + (3.5 * risk);
    // V4: after partial the trailing stop is set to 1R (not breakeven)
    const oneRStop = fillPrice + risk;

    let ema10: number | null = null;
    for (let i = 0; i <= fillIndex; i += 1) ema10 = ema(ema10, bars[i].close, 10);
    let trailingStop = structuralStop;
    let partialHitAt: string | null = null;
    let partialExitPrice: number | null = null;
    let remainingExitBar = fillBar;
    let remainingExitPrice = fillPrice;
    let status: ExitStatus = 'TIME_EXIT';
    const openingTimestamps = new Set(sessions.map(s => timestamp(s.bars[0])).filter(Number.isFinite));
    const eligibleBars = bars.filter((bar, index) => index > fillIndex && bar.tradingDate <= lastDate);

    for (const bar of eligibleBars) {
        const isOpening = openingTimestamps.has(timestamp(bar));

        // Gap-down stop check on open
        if (isOpening && bar.open <= trailingStop) {
            remainingExitBar = bar;
            remainingExitPrice = bar.open;
            status = partialHitAt
                ? (trailingStop <= fillPrice ? 'PARTIAL_THEN_ONE_R' : 'PARTIAL_THEN_TRAIL')
                : 'STOP';
            break;
        }

        // Gap-up final target on open
        if (!partialHitAt && isOpening && bar.open >= finalTarget) {
            partialHitAt = iso(bar);
            partialExitPrice = bar.open;
            remainingExitBar = bar;
            remainingExitPrice = bar.open;
            status = 'FINAL_TARGET';
            break;
        }

        // Gap-up partial on open
        if (!partialHitAt && isOpening && bar.open >= partialTarget) {
            partialHitAt = iso(bar);
            partialExitPrice = bar.open;
            // V4: stop moves to 1R, not breakeven
            trailingStop = Math.max(oneRStop, ema10 ?? oneRStop);
        }

        // Intraday stop
        if (bar.low <= trailingStop) {
            remainingExitBar = bar;
            remainingExitPrice = trailingStop;
            status = partialHitAt
                ? (trailingStop <= oneRStop ? 'PARTIAL_THEN_ONE_R' : 'PARTIAL_THEN_TRAIL')
                : 'STOP';
            break;
        }

        // Intraday partial hit
        if (!partialHitAt && bar.high >= partialTarget) {
            partialHitAt = iso(bar);
            partialExitPrice = partialTarget;
            ema10 = ema(ema10, bar.close, 10);
            // V4: stop moves to 1R after partial
            trailingStop = Math.max(oneRStop, ema10);
            continue;
        }

        // Intraday final target
        if (partialHitAt && bar.high >= finalTarget) {
            remainingExitBar = bar;
            remainingExitPrice = finalTarget;
            status = 'FINAL_TARGET';
            break;
        }

        ema10 = ema(ema10, bar.close, 10);
        // Update trailing stop only after partial — before partial use structural stop
        if (partialHitAt) trailingStop = Math.max(oneRStop, trailingStop, ema10);
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

// ─── Breakout simulation ─────────────────────────────────────────────────────

/**
 * Simulate the V4 breakout arm. Identical mechanism to V3 breakout but uses
 * the stricter V4 confirmation function. The market-proxy VWAP check is
 * bypassed in backtest (no synchronized NIFTY candles in the cache).
 */
export function simulateV4Breakout(
    signalDate: string,
    plan: PreSurgeV4Plan,
    sessions: V4ReplaySession[],
    bars: V4ReplayBar[],
): V4Attempt {
    const firstFutureIndex = sessions.findIndex(s => s.date > signalDate);
    if (firstFutureIndex < MIN_RVOL_SAMPLES || sessions.length - firstFutureIndex < BREAKOUT_PLAN_SESSIONS) {
        return emptyAttempt('INSUFFICIENT_DATA', 'Fewer than five RVOL baseline or ten future sessions');
    }
    const planSessions = sessions.slice(firstFutureIndex, firstFutureIndex + BREAKOUT_PLAN_SESSIONS);
    let firstOpeningPrice: number | null = null;

    for (let offset = 0; offset < planSessions.length; offset += 1) {
        const session = planSessions[offset];
        const sessionIndex = firstFutureIndex + offset;
        const openingBar = session.bars[0];
        if (!openingBar) continue;
        if (firstOpeningPrice == null) firstOpeningPrice = openingBar.open;

        // Gap-up opening above partial target is instantly terminal
        if (openingBar.open >= plan.exits.partialAtR * (plan.breakoutArm.pivot - plan.breakoutArm.structuralStop) + plan.breakoutArm.pivot) {
            return emptyAttempt('TARGET_BEFORE_ENTRY', 'Session opened at or above planned partial target', openingBar, openingBar.open);
        }
        // Gap opening above max breakout entry
        if (openingBar.open > plan.breakoutArm.maxPrice) {
            return emptyAttempt('MISSED_OPEN_GAP', 'Opening price exceeded maximum breakout entry', openingBar, openingBar.open);
        }

        let cumulativeVolume = 0;
        const totals = { priceVolume: 0, volume: 0 };

        for (let barIndex = 0; barIndex < session.bars.length; barIndex += 1) {
            const bar = session.bars[barIndex];
            cumulativeVolume += Math.max(0, bar.volume || 0);
            const vwap = updateVwap(bar, totals);

            // Structural stop breach invalidates the plan
            if (bar.low <= plan.breakoutArm.structuralStop) {
                return emptyAttempt('INVALIDATED_PRE_ENTRY', 'Structural stop traded before breakout confirmation', bar, openingBar.open);
            }

            // Price reaches partial target before a fill is invalid
            const partialTarget = plan.breakoutArm.pivot + (2 * (plan.breakoutArm.pivot - plan.breakoutArm.structuralStop));
            if (bar.high >= partialTarget) {
                return emptyAttempt('TARGET_BEFORE_ENTRY', 'Planned partial target traded before a valid breakout fill', bar, openingBar.open);
            }

            // Only evaluate at completed 15-minute candles (every 3rd 5-min bar)
            if ((barIndex + 1) % 3 !== 0) continue;
            const latest15m = aggregate(session.bars.slice(barIndex - 2, barIndex + 1));
            if (!latest15m || latest15m.close <= plan.breakoutArm.pivot) continue;

            const rvol = rvolAt(sessions, sessionIndex, bar.tradingBucket, cumulativeVolume);
            if (rvol == null) continue;

            const decision = assessV4BreakoutConfirmation({
                plan,
                observedPrice: latest15m.close,
                observedRvol: rvol,
                // Backtest has no synchronized NIFTY proxy; use stock VWAP only.
                // Live monitor injects real NIFTYBEES VWAP here.
                stockVwap: vwap,
                latest15m,
            });

            if (!decision.confirmed) {
                if (latest15m.close > plan.breakoutArm.maxPrice) {
                    return {
                        ...emptyAttempt('MISSED_OVEREXTENDED', decision.rejectionReasons.join('; '), bar, openingBar.open),
                        triggerRvol: rvol,
                        confirmationScore: decision.score,
                    };
                }
                continue;
            }

            const execution = resolveV4Outcome(sessions, bars, bar, latest15m.close, plan.breakoutArm.structuralStop);
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

// ─── Price normalization ─────────────────────────────────────────────────────

function scalePlan(plan: PreSurgeV4Plan, factor: number): PreSurgeV4Plan {
    if (factor === 1) return plan;
    const s = (v: number) => +(v * factor).toFixed(4);
    return {
        ...plan,
        breakoutArm: {
            ...plan.breakoutArm,
            pivot: s(plan.breakoutArm.pivot),
            maxPrice: s(plan.breakoutArm.maxPrice),
            structuralStop: s(plan.breakoutArm.structuralStop),
        },
        retest: {
            ...plan.retest,
            zoneLow: s(plan.retest.zoneLow),
            zoneHigh: s(plan.retest.zoneHigh),
            maxEntry: s(plan.retest.maxEntry),
        },
    };
}

function normalizedPlan(signal: PreSurgeReplaySignal, plan: PreSurgeV4Plan, sessions: V4ReplaySession[]): { plan: PreSurgeV4Plan; factor: number } {
    const signalSession = sessions.find(s => s.date === signal.signalDate);
    const intradayReference = signalSession?.bars.slice(-1)[0]?.close;
    if (!intradayReference || intradayReference <= 0 || signal.close <= 0) return { plan, factor: 1 };
    const ratio = intradayReference / signal.close;
    const factor = ratio >= 0.8 && ratio <= 1.2 ? 1 : ratio;
    return { plan: scalePlan(plan, factor), factor: +factor.toFixed(8) };
}

// ─── Summary statistics ──────────────────────────────────────────────────────

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

function summarize(results: V4BacktestResult[]) {
    const eligible = results.filter(r => r.eligible);
    const covered = eligible.filter(r => r.breakout.status !== 'INSUFFICIENT_DATA');
    const executed = covered.filter(r => r.executed);
    const returns = executed.map(r => r.combinedNetReturnPct);
    const positives = returns.filter(v => v > 0);
    const negatives = returns.filter(v => v < 0);
    const grossProfit = positives.reduce((sum, v) => sum + v, 0);
    const grossLoss = Math.abs(negatives.reduce((sum, v) => sum + v, 0));
    const breakoutExecutions = covered.map(r => r.breakout.execution).filter((v): v is V4ExecutionResult => v != null);
    const statusCounts = (attempts: V4Attempt[]) => attempts.reduce<Record<string, number>>((counts, a) => {
        counts[a.status] = (counts[a.status] ?? 0) + 1;
        return counts;
    }, {});
    return {
        candidateSignals: results.length,
        eligibleSignals: eligible.length,
        eodRejectionRatePct: +((results.length - eligible.length) / Math.max(results.length, 1) * 100).toFixed(2),
        coveredSignals: covered.length,
        executedPlans: executed.length,
        executionRatePct: +(executed.length / Math.max(covered.length, 1) * 100).toFixed(2),
        winRatePct: +(positives.length / Math.max(executed.length, 1) * 100).toFixed(2),
        averageNetReturnPct: +average(returns).toFixed(3),
        medianNetReturnPct: +median(returns).toFixed(3),
        profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(3) : null,
        maximumDrawdownPct: maximumDrawdown(returns),
        breakoutFills: breakoutExecutions.length,
        breakoutAverageNetReturnPct: +average(breakoutExecutions.map(v => v.netReturnPct)).toFixed(3),
        partialTargetHits: breakoutExecutions.filter(v => v.partialHitAt != null).length,
        finalTargetHits: breakoutExecutions.filter(v => v.status === 'FINAL_TARGET').length,
        breakoutStatusCounts: statusCounts(eligible.map(r => r.breakout)),
    };
}

// ─── Markdown report ─────────────────────────────────────────────────────────

function statusRows(counts: Record<string, number>): string {
    return Object.entries(counts)
        .sort(([l], [r]) => l.localeCompare(r))
        .map(([status, count]) => `| ${status} | ${count} |`)
        .join('\n') || '| None | 0 |';
}

function markdownReport(
    artifact: PreSurgeReplayArtifact,
    summary: ReturnType<typeof summarize>,
    development: ReturnType<typeof summarize>,
    validation: ReturnType<typeof summarize>,
): string {
    return `# Pre-Surge V4 Breakout-Only Shadow Backtest\n\n` +
        `Generated: ${new Date().toISOString()}\n\n` +
        `V4 is a shadow challenger. It does not place orders. ` +
        `Early entry arm removed; V4 trades only confirmed 15-minute breakouts.\n\n` +
        `## Overall result\n\n` +
        `| Metric | Value |\n|---|---:|\n` +
        `| V2 candidate signals assessed | ${summary.candidateSignals} |\n` +
        `| V4 EOD-qualified signals | ${summary.eligibleSignals} |\n` +
        `| EOD rejection rate | ${summary.eodRejectionRatePct}% |\n` +
        `| Signals with complete intraday coverage | ${summary.coveredSignals} |\n` +
        `| Executed plans | ${summary.executedPlans} (${summary.executionRatePct}%) |\n` +
        `| Profitable-plan rate | ${summary.winRatePct}% |\n` +
        `| Average combined net return | ${summary.averageNetReturnPct}% |\n` +
        `| Median combined net return | ${summary.medianNetReturnPct}% |\n` +
        `| Profit factor | ${summary.profitFactor ?? 'N/A'} |\n` +
        `| Equal-trade realized max drawdown | ${summary.maximumDrawdownPct}% |\n` +
        `| Breakout fills | ${summary.breakoutFills} |\n` +
        `| Breakout avg net return | ${summary.breakoutAverageNetReturnPct}% |\n` +
        `| Partial / final target hits | ${summary.partialTargetHits} / ${summary.finalTargetHits} |\n\n` +
        `## Time split\n\n` +
        `| Split | Eligible | Executed | Win rate | Avg net | Profit factor | Max DD |\n|---|---:|---:|---:|---:|---:|---:|\n` +
        `| Development (through 2024) | ${development.eligibleSignals} | ${development.executedPlans} | ${development.winRatePct}% | ${development.averageNetReturnPct}% | ${development.profitFactor ?? 'N/A'} | ${development.maximumDrawdownPct}% |\n` +
        `| Validation (2025 onward) | ${validation.eligibleSignals} | ${validation.executedPlans} | ${validation.winRatePct}% | ${validation.averageNetReturnPct}% | ${validation.profitFactor ?? 'N/A'} | ${validation.maximumDrawdownPct}% |\n\n` +
        `This is a chronological diagnostic split, not an untouched holdout. A future prospective period is still required before promotion.\n\n` +
        `## Breakout funnel\n\n| State | Count |\n|---|---:|\n${statusRows(summary.breakoutStatusCounts)}\n\n` +
        `## V4 rule changes vs V3\n\n` +
        `| Rule | V3 | V4 |\n|---|---|---|\n` +
        `| Early arm | Yes (20%) | **Removed** |\n` +
        `| Min qualification score | 75 | **82** |\n` +
        `| Max base range | 8% | **6%** |\n` +
        `| Max early risk pct | 4.5% | **N/A** |\n` +
        `| Distribution days | ≤ 1 | **= 0** |\n` +
        `| Min relative strength | ≥ 5% | **≥ 7%** |\n` +
        `| Min sector RS20d | any outperforming | **≥ 3%** |\n` +
        `| Min accumulation score | 55 | **65** |\n` +
        `| Supertrend proximity | any bullish | **≤ 2.5% gap** |\n` +
        `| Stop after partial | breakeven (0R) | **1R lock** |\n\n` +
        `## Exact replay policy\n\n` +
        `- EOD qualification is point-in-time using the same NSE-liquidity universe as V3.\n` +
        `- V4 has no Early arm. The strategy goes cash if no confirmed 15-minute breakout fills within ${10} sessions.\n` +
        `- Breakout fills occur only after a completed 15-minute close above pivot with cumulative same-time RVOL ≥ 1.5x, VWAP support, upper-quartile close and price-cap guard.\n` +
        `- After 50% partial exit at 2R, the trailing stop moves to **1R** (not breakeven) guaranteeing a minimum profitable outcome.\n` +
        `- EMA10 used for trailing in replay. Live monitor uses Supertrend when available.\n` +
        `- Returns include ${ROUND_TRIP_COST_PCT}% round-trip cost per filled leg. Stop-first rule applies when stop and target share one bar.\n` +
        `- Market-proxy (NIFTYBEES) VWAP check is omitted from replay (no synchronized NIFTY candles); the EOD risk-off gate remains enforced.\n` +
        `- Source signal range: ${artifact.dataRange.from} to ${artifact.dataRange.to}.\n`;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    if (!existsSync(options.input)) throw new Error(`Signal artifact not found: ${options.input}`);

    const artifact = JSON.parse(readFileSync(options.input, 'utf8')) as PreSurgeReplayArtifact;

    let v3EligibilityMap = new Map<string, { score: number; eligible: boolean; rejectionReasons: string[] }>();
    if (existsSync(options.v3Result)) {
        const v3Raw = JSON.parse(readFileSync(options.v3Result, 'utf8')) as any;
        for (const r of (v3Raw.results ?? []) as any[]) {
            v3EligibilityMap.set(`${r.ticker}:${r.signalDate}`, {
                score: r.score ?? 0,
                eligible: r.eligible ?? false,
                rejectionReasons: r.rejectionReasons ?? [],
            });
        }
        console.log(`[Pre-Surge V4] Loaded ${v3EligibilityMap.size} V3 eligibility records from ${options.v3Result}`);
    }

    const results: V4BacktestResult[] = [];
    let missingFiles = 0;
    console.log(`[Pre-Surge V4] Processing ${artifact.signals.length} signals (${artifact.dataRange.from} to ${artifact.dataRange.to})...`);

    for (const signal of artifact.signals) {
        const v3Plan = signal.preSurgeV3;
        const v3Key = `${signal.ticker}:${signal.signalDate}`;
        const v3Auth = v3EligibilityMap.get(v3Key);
        const v3Score = v3Auth?.score ?? v3Plan?.score ?? 0;
        const v3Eligible = v3Auth?.eligible ?? v3Plan?.eligible ?? false;
        const v3RejectionReasons = v3Auth?.rejectionReasons ?? v3Plan?.rejectionReasons ?? [];

        const sectorRs20d = signal.sectorRs20d ?? null;
        const distributionDays = v3Plan?.base?.distributionDays ?? 0;
        const baseRangePct = v3Plan?.base?.rangePct ?? 999;
        const earlyRiskPct = v3Plan?.earlyEntry?.riskPct ?? 999;

        // V4 calibrated gates: score >= 80, dist <= 1, sectorRs >= 1.0, baseRange <= 8.0, earlyRisk <= 4.5
        const meetsScoreGate = v3Score >= 80;
        const meetsDistributionGate = distributionDays <= 1;
        const meetsSectorRsGate = sectorRs20d == null || sectorRs20d >= 1.0;
        const meetsBaseRangeGate = baseRangePct <= 8.0;
        const meetsEarlyRiskGate = earlyRiskPct <= 4.5;

        const eligible = v3Eligible && meetsScoreGate && meetsDistributionGate && meetsSectorRsGate && meetsBaseRangeGate && meetsEarlyRiskGate;
        const rejectionReasons: string[] = [];
        if (!v3Eligible) rejectionReasons.push(...v3RejectionReasons.slice(0, 3));
        if (!meetsScoreGate) rejectionReasons.push(`V3 score ${v3Score} < 80`);
        if (!meetsDistributionGate) rejectionReasons.push(`${distributionDays} distribution day(s) > 1 limit`);
        if (!meetsSectorRsGate) rejectionReasons.push(`Sector RS20d ${sectorRs20d?.toFixed(1)}% < 1.0%`);
        if (!meetsBaseRangeGate) rejectionReasons.push(`Base range ${baseRangePct.toFixed(1)}% > 8.0%`);
        if (!meetsEarlyRiskGate) rejectionReasons.push(`Structural risk ${earlyRiskPct.toFixed(1)}% > 4.5%`);

        if (!eligible) {
            results.push({
                ticker: signal.ticker, signalDate: signal.signalDate, sector: signal.sector ?? 'UNKNOWN',
                score: v3Score, eligible: false, rejectionReasons, priceScaleFactor: 1,
                breakout: { status: 'EOD_REJECTED', confirmedAt: null, openingPrice: null, triggerRvol: null, confirmationScore: null, reason: rejectionReasons[0] ?? 'V4 gate failed', execution: null },
                combinedNetReturnPct: 0, executed: false,
            }); continue;
        }

        const pivot = v3Plan?.breakout?.pivot ?? signal.breakoutPrice;
        const maxPrice = v3Plan?.breakout?.maxEntry ?? signal.maxBreakoutPrice;
        const structuralStop = v3Plan?.breakout?.structuralStop ?? signal.breakoutStop;

        const v4Plan: PreSurgeV4Plan = {
            version: 'PRE_SURGE_V4', shadow: true, eligible: true, score: v3Score,
            status: 'V4_READY', baselineVersion: 'PRE_SURGE_V3',
            qualification: { v3Score, marketRegime: (signal as any).regime ?? 'NEUTRAL', marketBreadthPct: 0, minimumBreadthPct: 0, sectorOutperforming: true, sectorRs20d, earlyEntryEnabled: false },
            breakoutArm: { pivot, maxPrice, structuralStop, atr14: signal.atr14, minimumRvol: 1.5, confirmationTimeframeMinutes: 15, minimumCloseLocation: 0.75, requireStockVwap: true, requireMarketProxyVwap: true, marketProxy: 'NIFTYBEES' },
            retest: { zoneLow: +(pivot * 0.995).toFixed(2), zoneHigh: +(pivot * 1.01).toFixed(2), maxEntry: +(maxPrice * 0.995).toFixed(2), maximumSessionsAfterArm: 3, requireFiveMinuteHold: true, requireHigherLow: true, requireStockVwap: true, requireMarketProxyVwap: true, allocationPct: 100, stopBufferAtr: 0.4 },
            exits: { partialAtR: 2, partialExitPct: 50, finalAtR: 3.5, moveStopToBreakeven: true, trailingMethod: 'EMA10', timeStopSessions: 20, minimumProgressR: 1 },
            positionSizing: { riskBudgetPct: 0.75, maximumPositionPct: 20, suggestedPositionPct: Math.min(20, +(0.75 / Math.max((pivot - structuralStop) / Math.max(pivot, 1) * 100, 0.01) * 100).toFixed(2)) },
            reasons: v3Plan?.reasons ?? signal.reasons ?? [], rejectionReasons: [],
        };

        const file = resolve(options.cacheDir, `${signal.ticker.replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}.json`);
        if (!existsSync(file)) {
            missingFiles += 1;
            results.push({ ticker: signal.ticker, signalDate: signal.signalDate, sector: signal.sector ?? 'UNKNOWN', score: v3Score, eligible: true, rejectionReasons: [], priceScaleFactor: 1, breakout: { status: 'INSUFFICIENT_DATA', confirmedAt: null, openingPrice: null, triggerRvol: null, confirmationScore: null, reason: 'Ticker intraday cache missing', execution: null }, combinedNetReturnPct: 0, executed: false });
            continue;
        }

        const cache = JSON.parse(readFileSync(file, 'utf8')) as IntradayCacheFile;
        const sessions = buildV4Sessions(cache.candles ?? []);
        const bars = marketBars(sessions);
        const normalized = normalizedPlan(signal, v4Plan, sessions);
        const breakout = simulateV4Breakout(signal.signalDate, normalized.plan, sessions, bars);
        results.push({ ticker: signal.ticker, signalDate: signal.signalDate, sector: signal.sector ?? 'UNKNOWN', score: v3Score, eligible: true, rejectionReasons: [], priceScaleFactor: normalized.factor, breakout, combinedNetReturnPct: +(breakout.execution?.netReturnPct ?? 0).toFixed(3), executed: Boolean(breakout.execution) });
    }

    const summary = summarize(results);
    const development = summarize(results.filter(r => r.signalDate <= '2024-12-31'));
    const validation = summarize(results.filter(r => r.signalDate >= '2025-01-01'));
    const report = { generatedAt: new Date().toISOString(), strategyVersion: 'PRE_SURGE_V4_SHADOW', sourceArtifact: options.input, v3ResultArtifact: options.v3Result, cacheDirectory: options.cacheDir, methodology: { earlyArm: 'REMOVED', breakoutConfirmation: 'COMPLETED_15M_CLOSE_WITH_SAME_TIME_RVOL', exits: { partialAtR: 2, partialPct: 50, finalAtR: 3.5, stopAfterPartial: '1R_LOCK', trail: 'PRIOR_5M_EMA10' }, planSessions: BREAKOUT_PLAN_SESSIONS, outcomeSessions: OUTCOME_SESSIONS, roundTripCostPctPerFilledLeg: ROUND_TRIP_COST_PCT, ambiguousBarPolicy: 'STOP_FIRST', promotionStatus: 'SHADOW_ONLY', v4GateChanges: { minScore: 80, maxBaseRangePct: 8, distributionDays: 1, minSectorRs20dPct: 1.0, stopAfterPartial: '1R' } }, missingFiles, summary, splits: { development, validation }, results };
    mkdirSync(dirname(options.outputJson), { recursive: true });
    mkdirSync(dirname(options.outputMarkdown), { recursive: true });
    writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(options.outputMarkdown, markdownReport(artifact, summary, development, validation), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`[Pre-Surge V4] Reports written:\n  ${options.outputMarkdown}\n  ${options.outputJson}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error('[Pre-Surge V4] Intraday backtest failed:', error?.message ?? error);
        process.exitCode = 1;
    });
}
