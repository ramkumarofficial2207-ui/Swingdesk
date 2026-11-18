import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { calculateRiskReward } from './executionIntegrity';
import { PreSurgeReplayArtifact, PreSurgeReplaySignal } from './preSurgeV2Replay';
import { Candle } from './types';

const IST_TIMEZONE = 'Asia/Kolkata';
const MARKET_OPEN_MINUTE = 9 * 60 + 15;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;
const REQUIRED_RVOL = 1.5;
const PLAN_SESSIONS = 10;
const OUTCOME_SESSIONS = 20;
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

interface Session {
    date: string;
    bars: ReplayBar[];
    cumulativeByBucket: Map<string, number>;
}

interface ReplayBar extends Candle {
    replayTimestamp: number;
    tradingDate: string;
    tradingMinute: number;
    tradingBucket: string;
}

type LegStatus = 'TARGET' | 'STOP' | 'TIME_EXIT';

interface LegResult {
    filled: true;
    status: LegStatus;
    fillAt: string;
    exitAt: string;
    fillPrice: number;
    exitPrice: number;
    grossReturnPct: number;
    netReturnPct: number;
    rMultiple: number;
}

type BreakoutStatus =
    | 'FILLED'
    | 'MISSED_OPEN_GAP'
    | 'MISSED_OVEREXTENDED'
    | 'TARGET_BEFORE_ENTRY'
    | 'RISK_REWARD_REJECTED'
    | 'INVALIDATED_PRE_TRIGGER'
    | 'EXPIRED'
    | 'INSUFFICIENT_DATA';

interface BreakoutAttempt {
    status: BreakoutStatus;
    terminalAt: string | null;
    openingPrice: number | null;
    triggerRvol: number | null;
    reason: string;
    leg: LegResult | null;
}

interface EarlyAttempt {
    status: 'FILLED' | 'INVALIDATED_PRE_ENTRY' | 'EXPIRED' | 'INSUFFICIENT_DATA';
    terminalAt: string | null;
    reason: string;
    leg: LegResult | null;
}

interface BacktestResult {
    ticker: string;
    signalDate: string;
    score: number;
    breakoutPrice: number;
    maxBreakoutPrice: number;
    targetPrice: number;
    priceScaleFactor: number;
    early: EarlyAttempt;
    breakout: BreakoutAttempt;
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
        outputJson: resolve(values.get('output-json') ?? `reports/backtests/presurge_v2_intraday_${stamp}.json`),
        outputMarkdown: resolve(values.get('output-md') ?? `reports/backtests/presurge_v2_intraday_${stamp}.md`),
    };
}

function istParts(candle: Candle): IstParts {
    const value = new Date(Number(candle.timestamp ?? new Date(candle.date).getTime()));
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
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
        ? Number((candle as ReplayBar).replayTimestamp)
        : Number(candle.timestamp ?? new Date(candle.date).getTime());
}

function iso(candle: Candle): string {
    return new Date(timestamp(candle)).toISOString();
}

export function buildSessions(candles: Candle[]): Session[] {
    const byDate = new Map<string, ReplayBar[]>();
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

function cumulativeAtOrBefore(session: Session, bucket: string): number | null {
    const values = [...session.cumulativeByBucket.entries()]
        .filter(([key]) => key <= bucket)
        .sort(([left], [right]) => right.localeCompare(left));
    return values[0]?.[1] ?? null;
}

function rvolAt(sessions: Session[], sessionIndex: number, bucket: string, currentCumulative: number): number | null {
    const samples = sessions
        .slice(Math.max(0, sessionIndex - 10), sessionIndex)
        .map(session => cumulativeAtOrBefore(session, bucket))
        .filter((value): value is number => value != null && value > 0);
    if (samples.length < 5) return null;
    const baseline = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return baseline > 0 ? +(currentCumulative / baseline).toFixed(3) : null;
}

function marketBars(sessions: Session[]): ReplayBar[] {
    return sessions.flatMap(session => session.bars).sort((left, right) => timestamp(left) - timestamp(right));
}

function resolveLegOutcome(
    sessions: Session[],
    bars: ReplayBar[],
    fillBar: ReplayBar,
    fillPrice: number,
    stopLoss: number,
    targetPrice: number,
    includeFillBarStop: boolean,
): LegResult {
    const fillTimestamp = timestamp(fillBar);
    const fillSessionIndex = sessions.findIndex(session => session.date === fillBar.tradingDate);
    const lastSessionIndex = Math.min(sessions.length - 1, fillSessionIndex + OUTCOME_SESSIONS);
    const lastDate = sessions[lastSessionIndex]?.date ?? fillBar.tradingDate;
    const openingTimestamps = new Set(sessions.map(session => timestamp(session.bars[0])).filter(Number.isFinite));
    const eligibleBars = bars.filter(bar => {
        const time = timestamp(bar);
        return time >= fillTimestamp && bar.tradingDate <= lastDate;
    });

    for (const bar of eligibleBars) {
        const isFillBar = timestamp(bar) === fillTimestamp;
        if (isFillBar && !includeFillBarStop) continue;
        const isOpeningBar = openingTimestamps.has(timestamp(bar));
        if (!isFillBar && isOpeningBar) {
            if (bar.open <= stopLoss) return legResult('STOP', fillBar, bar, fillPrice, bar.open, stopLoss);
            if (bar.open >= targetPrice) return legResult('TARGET', fillBar, bar, fillPrice, bar.open, stopLoss);
        }
        const hitStop = bar.low <= stopLoss;
        const hitTarget = bar.high >= targetPrice;
        // Five-minute candles still have no tick ordering. Stop-first is the
        // conservative answer when both levels occur inside the same bar.
        if (hitStop) return legResult('STOP', fillBar, bar, fillPrice, stopLoss, stopLoss);
        if (!isFillBar && hitTarget) return legResult('TARGET', fillBar, bar, fillPrice, targetPrice, stopLoss);
    }
    const exitBar = eligibleBars[eligibleBars.length - 1] ?? fillBar;
    return legResult('TIME_EXIT', fillBar, exitBar, fillPrice, exitBar.close, stopLoss);
}

function legResult(
    status: LegStatus,
    fillBar: ReplayBar,
    exitBar: ReplayBar,
    fillPrice: number,
    exitPrice: number,
    stopLoss: number,
): LegResult {
    const grossReturnPct = ((exitPrice - fillPrice) / fillPrice) * 100;
    const netReturnPct = grossReturnPct - ROUND_TRIP_COST_PCT;
    const risk = fillPrice - stopLoss;
    const netPricePnl = (exitPrice - fillPrice) - (fillPrice * ROUND_TRIP_COST_PCT / 100);
    return {
        filled: true,
        status,
        fillAt: iso(fillBar),
        exitAt: iso(exitBar),
        fillPrice: +fillPrice.toFixed(2),
        exitPrice: +exitPrice.toFixed(2),
        grossReturnPct: +grossReturnPct.toFixed(3),
        netReturnPct: +netReturnPct.toFixed(3),
        rMultiple: risk > 0 ? +(netPricePnl / risk).toFixed(3) : 0,
    };
}

export function simulateBreakout(signal: PreSurgeReplaySignal, sessions: Session[], bars: ReplayBar[]): BreakoutAttempt {
    const firstFutureSessionIndex = sessions.findIndex(session => session.date > signal.signalDate);
    if (firstFutureSessionIndex < 5 || sessions.length - firstFutureSessionIndex < PLAN_SESSIONS) {
        return { status: 'INSUFFICIENT_DATA', terminalAt: null, openingPrice: null, triggerRvol: null, reason: 'Fewer than five baseline or ten future sessions', leg: null };
    }
    const planSessions = sessions.slice(firstFutureSessionIndex, firstFutureSessionIndex + PLAN_SESSIONS);
    let firstOpeningPrice: number | null = null;
    for (let offset = 0; offset < planSessions.length; offset += 1) {
        const session = planSessions[offset];
        const sessionIndex = firstFutureSessionIndex + offset;
        const openingBar = session.bars[0];
        if (!openingBar) continue;
        if (firstOpeningPrice == null) firstOpeningPrice = openingBar.open;
        if (openingBar.open >= signal.targetPrice) {
            return { status: 'TARGET_BEFORE_ENTRY', terminalAt: iso(openingBar), openingPrice: openingBar.open, triggerRvol: null, reason: 'Session opened at/above target', leg: null };
        }
        if (openingBar.open > signal.maxBreakoutPrice) {
            return { status: 'MISSED_OPEN_GAP', terminalAt: iso(openingBar), openingPrice: openingBar.open, triggerRvol: null, reason: 'Opening price exceeded maximum executable entry', leg: null };
        }
        let cumulativeVolume = 0;
        for (const bar of session.bars) {
            cumulativeVolume += Math.max(0, bar.volume || 0);
            if (bar.low <= signal.breakoutStop) {
                return { status: 'INVALIDATED_PRE_TRIGGER', terminalAt: iso(bar), openingPrice: openingBar.open, triggerRvol: null, reason: 'Structure traded through stop before entry', leg: null };
            }
            if (bar.high >= signal.targetPrice) {
                return { status: 'TARGET_BEFORE_ENTRY', terminalAt: iso(bar), openingPrice: openingBar.open, triggerRvol: null, reason: 'Target traded before a valid fill', leg: null };
            }
            if (bar.high > signal.maxBreakoutPrice) {
                return { status: 'MISSED_OVEREXTENDED', terminalAt: iso(bar), openingPrice: openingBar.open, triggerRvol: null, reason: 'Live price exceeded maximum entry before confirmation', leg: null };
            }
            if (bar.close < signal.breakoutPrice) continue;
            const rvol = rvolAt(sessions, sessionIndex, bar.tradingBucket, cumulativeVolume);
            if (rvol == null || rvol < REQUIRED_RVOL) continue;
            const fillPrice = bar.close;
            const actualRiskReward = calculateRiskReward(fillPrice, signal.breakoutStop, signal.targetPrice);
            if (actualRiskReward < 2) {
                return { status: 'RISK_REWARD_REJECTED', terminalAt: iso(bar), openingPrice: openingBar.open, triggerRvol: rvol, reason: `Actual R:R ${actualRiskReward.toFixed(2)} below 2.0`, leg: null };
            }
            const leg = resolveLegOutcome(sessions, bars, bar, fillPrice, signal.breakoutStop, signal.targetPrice, false);
            return { status: 'FILLED', terminalAt: iso(bar), openingPrice: openingBar.open, triggerRvol: rvol, reason: 'Five-minute close and same-time cumulative RVOL confirmed', leg };
        }
    }
    const terminalBar = planSessions[planSessions.length - 1]?.bars.slice(-1)[0];
    return { status: 'EXPIRED', terminalAt: terminalBar ? iso(terminalBar) : null, openingPrice: firstOpeningPrice, triggerRvol: null, reason: 'No valid breakout within ten sessions', leg: null };
}

function simulateEarly(signal: PreSurgeReplaySignal, sessions: Session[], bars: ReplayBar[], breakout: BreakoutAttempt): EarlyAttempt {
    const firstFutureSessionIndex = sessions.findIndex(session => session.date > signal.signalDate);
    if (firstFutureSessionIndex < 5 || sessions.length - firstFutureSessionIndex < PLAN_SESSIONS) {
        return { status: 'INSUFFICIENT_DATA', terminalAt: null, reason: 'Insufficient baseline or forward sessions', leg: null };
    }
    const cutoff = breakout.terminalAt ? new Date(breakout.terminalAt).getTime() : Number.POSITIVE_INFINITY;
    const planSessions = sessions.slice(firstFutureSessionIndex, firstFutureSessionIndex + PLAN_SESSIONS);
    for (const session of planSessions) {
        for (const bar of session.bars) {
            if (timestamp(bar) >= cutoff && breakout.status !== 'EXPIRED') {
                return { status: 'EXPIRED', terminalAt: breakout.terminalAt, reason: 'Breakout lifecycle ended before an early fill', leg: null };
            }
            if (bar.low <= signal.earlyStop) {
                return { status: 'INVALIDATED_PRE_ENTRY', terminalAt: iso(bar), reason: 'Early-entry structure failed before fill', leg: null };
            }
            const intersects = bar.low <= signal.earlyEntryHigh && bar.high >= signal.earlyEntryLow;
            if (!intersects) continue;
            let fillPrice = signal.earlyEntryHigh;
            if (bar.open >= signal.earlyEntryLow && bar.open <= signal.earlyEntryHigh) fillPrice = bar.open;
            else if (bar.open < signal.earlyEntryLow) fillPrice = signal.earlyEntryLow;
            const leg = resolveLegOutcome(sessions, bars, bar, fillPrice, signal.earlyStop, signal.targetPrice, true);
            return { status: 'FILLED', terminalAt: leg.exitAt, reason: 'Price traded inside the planned Early Buy zone', leg };
        }
    }
    const terminalBar = planSessions[planSessions.length - 1]?.bars.slice(-1)[0];
    return { status: 'EXPIRED', terminalAt: terminalBar ? iso(terminalBar) : null, reason: 'Early Buy zone was not filled within ten sessions', leg: null };
}

function cacheFile(cacheDir: string, ticker: string): string {
    return resolve(cacheDir, `${ticker.replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}.json`);
}

function average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

export function normalizeSignalPriceScale(signal: PreSurgeReplaySignal, sessions: Session[]): {
    signal: PreSurgeReplaySignal;
    factor: number;
} {
    const signalSession = sessions.find(session => session.date === signal.signalDate);
    const intradayReference = signalSession?.bars.slice(-1)[0]?.close;
    if (!intradayReference || intradayReference <= 0 || signal.close <= 0) return { signal, factor: 1 };
    const observedRatio = intradayReference / signal.close;
    // A small mismatch can be a missing closing-auction candle. A large one
    // means Dhan adjusted history for a later split/bonus while the official
    // NSE EOD signal retained its original price scale.
    const factor = observedRatio >= 0.8 && observedRatio <= 1.2 ? 1 : observedRatio;
    if (factor === 1) return { signal, factor };
    const scaled = (value: number): number => +(value * factor).toFixed(4);
    return {
        factor: +factor.toFixed(8),
        signal: {
            ...signal,
            close: scaled(signal.close),
            atr14: scaled(signal.atr14),
            breakoutPrice: scaled(signal.breakoutPrice),
            maxBreakoutPrice: scaled(signal.maxBreakoutPrice),
            breakoutStop: scaled(signal.breakoutStop),
            targetPrice: scaled(signal.targetPrice),
            earlyEntryLow: scaled(signal.earlyEntryLow),
            earlyEntryHigh: scaled(signal.earlyEntryHigh),
            earlyStop: scaled(signal.earlyStop),
        },
    };
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

function summarize(results: BacktestResult[]) {
    const covered = results.filter(result => result.breakout.status !== 'INSUFFICIENT_DATA' && result.early.status !== 'INSUFFICIENT_DATA');
    const executed = covered.filter(result => result.executed);
    const returns = executed.map(result => result.combinedNetReturnPct);
    const positives = returns.filter(value => value > 0);
    const negatives = returns.filter(value => value < 0);
    const grossProfit = positives.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(negatives.reduce((sum, value) => sum + value, 0));
    const statusCounts = covered.reduce<Record<string, number>>((counts, result) => {
        counts[result.breakout.status] = (counts[result.breakout.status] ?? 0) + 1;
        return counts;
    }, {});
    const earlyLegs = covered.map(result => result.early.leg).filter((leg): leg is LegResult => leg != null);
    const breakoutLegs = covered.map(result => result.breakout.leg).filter((leg): leg is LegResult => leg != null);
    return {
        signals: results.length,
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
        earlyFills: earlyLegs.length,
        earlyTargetHits: earlyLegs.filter(leg => leg.status === 'TARGET').length,
        earlyStops: earlyLegs.filter(leg => leg.status === 'STOP').length,
        earlyAverageNetReturnPct: +average(earlyLegs.map(leg => leg.netReturnPct)).toFixed(3),
        breakoutFills: breakoutLegs.length,
        breakoutTargetHits: breakoutLegs.filter(leg => leg.status === 'TARGET').length,
        breakoutStops: breakoutLegs.filter(leg => leg.status === 'STOP').length,
        breakoutAverageNetReturnPct: +average(breakoutLegs.map(leg => leg.netReturnPct)).toFixed(3),
        breakoutStatusCounts: statusCounts,
    };
}

function markdownReport(artifact: PreSurgeReplayArtifact, results: BacktestResult[], summary: ReturnType<typeof summarize>): string {
    const gapExamples = results
        .filter(result => result.breakout.status === 'MISSED_OPEN_GAP' || result.breakout.status === 'TARGET_BEFORE_ENTRY')
        .slice(0, 10);
    const statusRows = Object.entries(summary.breakoutStatusCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => `| ${status} | ${count} |`)
        .join('\n');
    const exampleRows = gapExamples.length
        ? gapExamples.map(result => `| ${result.signalDate} | ${result.ticker} | ${result.breakout.status} | ₹${result.breakout.openingPrice?.toFixed(2) ?? '—'} | ₹${result.breakoutPrice.toFixed(2)} | ₹${result.maxBreakoutPrice.toFixed(2)} |`).join('\n')
        : '| — | No opening-gap or target-before-entry cases | — | — | — | — |';
    return `# Pre-Surge V2 Five-Minute Backtest\n\n` +
        `Generated: ${new Date().toISOString()}\n\n` +
        `Data: official Dhan five-minute OHLCV around ${artifact.signals.length} point-in-time NSE signals (${artifact.dataRange.from} to ${artifact.dataRange.to}).\n\n` +
        `## Result\n\n` +
        `| Metric | Value |\n|---|---:|\n` +
        `| Signals | ${summary.signals} |\n` +
        `| Signals with complete intraday coverage | ${summary.coveredSignals} |\n` +
        `| Executed plans | ${summary.executedPlans} (${summary.executionRatePct}%) |\n` +
        `| Profitable-plan rate | ${summary.winRatePct}% |\n` +
        `| Average combined net return | ${summary.averageNetReturnPct}% |\n` +
        `| Median combined net return | ${summary.medianNetReturnPct}% |\n` +
        `| Profit factor | ${summary.profitFactor ?? 'N/A'} |\n` +
        `| Equal-trade realized max drawdown | ${summary.maximumDrawdownPct}% |\n` +
        `| Early fills / targets / stops | ${summary.earlyFills} / ${summary.earlyTargetHits} / ${summary.earlyStops} |\n` +
        `| Breakout fills / targets / stops | ${summary.breakoutFills} / ${summary.breakoutTargetHits} / ${summary.breakoutStops} |\n\n` +
        `Returns include ${ROUND_TRIP_COST_PCT}% round-trip cost per filled leg. Combined return weights the Early Buy leg at 30% and the confirmed breakout leg at 70%; unfilled capital remains cash.\n\n` +
        `## Breakout funnel\n\n| State | Count |\n|---|---:|\n${statusRows}\n\n` +
        `## Gap-integrity examples\n\n| Signal | Ticker | Decision | First opening | Breakout | Maximum entry |\n|---|---|---|---:|---:|---:|\n${exampleRows}\n\n` +
        `## Methodology and limitations\n\n` +
        `- Signals are generated after the daily close with only historical data available on that date. Earliest entry is the next NSE session.\n` +
        `- RVOL is cumulative volume compared with the prior ten sessions at the same five-minute bucket; at least five baseline sessions are required.\n` +
        `- Dhan split/bonus-adjusted intraday prices are normalized against the official signal-date close before comparing entry, stop and target levels.\n` +
        `- Breakout fills use the confirming five-minute close, require RVOL ≥ ${REQUIRED_RVOL}x and actual R:R ≥ 2.0, and reject any observed price above the maximum entry.\n` +
        `- If stop and target both occur in one five-minute candle, stop is assumed first. This prevents optimistic ordering but exact tick replay would be more precise.\n` +
        `- Maximum drawdown is an equal-trade realized sequence, not a mark-to-market portfolio simulation. This validation must remain shadow-only until broader walk-forward results are acceptable.\n`;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    if (!existsSync(options.input)) throw new Error(`Signal artifact not found: ${options.input}`);
    const artifact = JSON.parse(readFileSync(options.input, 'utf8')) as PreSurgeReplayArtifact;
    const results: BacktestResult[] = [];
    let missingFiles = 0;
    for (let index = 0; index < artifact.signals.length; index += 1) {
        const signal = artifact.signals[index];
        const file = cacheFile(options.cacheDir, signal.ticker);
        if (!existsSync(file)) {
            missingFiles += 1;
            results.push({
                ticker: signal.ticker,
                signalDate: signal.signalDate,
                score: signal.score,
                breakoutPrice: signal.breakoutPrice,
                maxBreakoutPrice: signal.maxBreakoutPrice,
                targetPrice: signal.targetPrice,
                priceScaleFactor: 1,
                early: { status: 'INSUFFICIENT_DATA', terminalAt: null, reason: 'Ticker cache missing', leg: null },
                breakout: { status: 'INSUFFICIENT_DATA', terminalAt: null, openingPrice: null, triggerRvol: null, reason: 'Ticker cache missing', leg: null },
                combinedNetReturnPct: 0,
                executed: false,
            });
            continue;
        }
        const cache = JSON.parse(readFileSync(file, 'utf8')) as IntradayCacheFile;
        const sessions = buildSessions(cache.candles ?? []);
        const bars = marketBars(sessions);
        const normalized = normalizeSignalPriceScale(signal, sessions);
        const replaySignal = normalized.signal;
        const breakout = simulateBreakout(replaySignal, sessions, bars);
        const early = simulateEarly(replaySignal, sessions, bars, breakout);
        const earlyReturn = early.leg ? (signal.earlyAllocationPct / 100) * early.leg.netReturnPct : 0;
        const breakoutReturn = breakout.leg ? (signal.breakoutAllocationPct / 100) * breakout.leg.netReturnPct : 0;
        results.push({
            ticker: signal.ticker,
            signalDate: signal.signalDate,
            score: signal.score,
            breakoutPrice: replaySignal.breakoutPrice,
            maxBreakoutPrice: replaySignal.maxBreakoutPrice,
            targetPrice: replaySignal.targetPrice,
            priceScaleFactor: normalized.factor,
            early,
            breakout,
            combinedNetReturnPct: +(earlyReturn + breakoutReturn).toFixed(3),
            executed: Boolean(early.leg || breakout.leg),
        });
    }
    const summary = summarize(results);
    const report = {
        generatedAt: new Date().toISOString(),
        strategyVersion: artifact.strategyVersion,
        sourceArtifact: options.input,
        cacheDirectory: options.cacheDir,
        methodology: {
            signalTiming: 'EOD qualification; entries begin next session',
            rvol: 'Cumulative same-time 5m volume vs prior 10 sessions; minimum 5 samples',
            requiredRvol: REQUIRED_RVOL,
            planSessions: PLAN_SESSIONS,
            outcomeSessions: OUTCOME_SESSIONS,
            roundTripCostPctPerFilledLeg: ROUND_TRIP_COST_PCT,
            ambiguousBarPolicy: 'STOP_FIRST',
        },
        missingFiles,
        summary,
        results,
    };
    mkdirSync(dirname(options.outputJson), { recursive: true });
    mkdirSync(dirname(options.outputMarkdown), { recursive: true });
    writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(options.outputMarkdown, markdownReport(artifact, results, summary), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`[Pre-Surge V2] Reports: ${options.outputMarkdown} and ${options.outputJson}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error('[Pre-Surge V2] Intraday backtest failed:', error?.message ?? error);
        process.exitCode = 1;
    });
}
