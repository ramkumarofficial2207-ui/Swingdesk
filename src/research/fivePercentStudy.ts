/**
 * 5% move study: how often does a stock reach +5% before -2.5% within ten
 * sessions after a signal, and which conditions make that more likely?
 *
 * Everything here is pure and point-in-time: features at index i use bars
 * 0..i only; the trade enters at the open of i + 1.
 */
import { PriceBar } from '../corporateActions';

export interface StudyParams {
    targetPct: number;
    stopPct: number;
    horizon: number;
    /** Round-trip costs including fees and slippage, in basis points of traded value. */
    costBps: number;
}

export const DEFAULT_PARAMS: StudyParams = { targetPct: 5, stopPct: 2.5, horizon: 10, costBps: 40 };

export type Outcome = 'TARGET' | 'STOP' | 'EXPIRED';

export interface TradeLabel {
    outcome: Outcome;
    entry: number;
    exit: number;
    /** Net result in units of the stop distance, after costs. */
    netR: number;
    sessionsHeld: number;
    exitIndex: number;
}

/**
 * Simulate one trade from the close of signalIndex. Returns null when the
 * full horizon is not yet available.
 *
 * Conservative ordering: a gap through the stop exits at the open; a bar that
 * touches both levels counts as a stop, because daily bars hide which came first.
 */
export function labelTrade(bars: PriceBar[], signalIndex: number, params: StudyParams = DEFAULT_PARAMS): TradeLabel | null {
    if (signalIndex < 0 || signalIndex + 1 >= bars.length) return null;
    return simulateFrom(bars, signalIndex + 1, bars[signalIndex + 1].open, params.stopPct, params.targetPct, params.horizon, params.costBps);
}

/**
 * Core trade simulation from a known entry on bars[entryIndex]. The horizon
 * counts the entry session. Returns null if the horizon runs past the data.
 */
export function simulateFrom(
    bars: PriceBar[],
    entryIndex: number,
    entry: number,
    stopPct: number,
    targetPct: number,
    horizon: number,
    costBps: number,
): TradeLabel | null {
    const last = entryIndex + horizon - 1;
    if (last >= bars.length || !(entry > 0) || !(stopPct > 0)) return null;
    const target = entry * (1 + targetPct / 100);
    const stop = entry * (1 - stopPct / 100);
    let outcome: Outcome = 'EXPIRED';
    let exit = bars[last].close;
    let exitIndex = last;
    for (let index = entryIndex; index <= last; index += 1) {
        const bar = bars[index];
        if (index > entryIndex && bar.open <= stop) { outcome = 'STOP'; exit = bar.open; exitIndex = index; break; }
        if (index > entryIndex && bar.open >= target) { outcome = 'TARGET'; exit = bar.open; exitIndex = index; break; }
        if (bar.low <= stop) { outcome = 'STOP'; exit = stop; exitIndex = index; break; }
        if (bar.high >= target) { outcome = 'TARGET'; exit = target; exitIndex = index; break; }
    }
    const grossPct = ((exit - entry) / entry) * 100;
    const netR = (grossPct - costBps / 100) / stopPct;
    return { outcome, entry, exit, netR, sessionsHeld: exitIndex - entryIndex + 1, exitIndex };
}

/** A pre-registered exit design for the volatility-scaled study. */
export interface ExitDesign {
    id: string;
    label: string;
    entry: 'NEXT_OPEN' | 'BREAKOUT';
    /** Stop distance as a multiple of the signal-day ATR. */
    stopAtr: number;
    /** Target distance as a multiple of the stop distance. */
    targetR: number;
    horizon: number;
    costBps: number;
}

/** Exactly the four designs in reports/volatility-exit-study-plan.md. Do not edit after results. */
export const VOLATILITY_DESIGNS: ExitDesign[] = [
    { id: 'A', label: 'Next open · stop 1.0×ATR · target 2× · 10 sessions', entry: 'NEXT_OPEN', stopAtr: 1.0, targetR: 2, horizon: 10, costBps: 40 },
    { id: 'B', label: 'Next open · stop 1.5×ATR · target 2× · 15 sessions', entry: 'NEXT_OPEN', stopAtr: 1.5, targetR: 2, horizon: 15, costBps: 40 },
    { id: 'C', label: 'Next open · stop 1.5×ATR · target 2× · 20 sessions', entry: 'NEXT_OPEN', stopAtr: 1.5, targetR: 2, horizon: 20, costBps: 40 },
    { id: 'D', label: 'Breakout above signal high · stop 1.5×ATR · target 2× · 15 sessions', entry: 'BREAKOUT', stopAtr: 1.5, targetR: 2, horizon: 15, costBps: 40 },
];

export const BREAKOUT_TRIGGER_BUFFER = 0.001;

/**
 * Simulate a design from the close of signalIndex with the stop sized from
 * that day's ATR (% of close). A breakout design trades only if the next
 * session goes above the signal day's high; it fills at the trigger, or at
 * the open when the session gaps above it. Returns null for no trade or
 * insufficient future data.
 */
export function labelDesignTrade(bars: PriceBar[], signalIndex: number, atrPct: number, design: ExitDesign): TradeLabel | null {
    const entryIndex = signalIndex + 1;
    if (signalIndex < 0 || entryIndex >= bars.length || !(atrPct > 0)) return null;
    const next = bars[entryIndex];
    let entry: number;
    if (design.entry === 'NEXT_OPEN') {
        entry = next.open;
    } else {
        const trigger = bars[signalIndex].high * (1 + BREAKOUT_TRIGGER_BUFFER);
        if (next.open >= trigger) entry = next.open;
        else if (next.high >= trigger) entry = trigger;
        else return null;
    }
    const stopPct = design.stopAtr * atrPct;
    return simulateFrom(bars, entryIndex, entry, stopPct, stopPct * design.targetR, design.horizon, design.costBps);
}

export interface StockFeatures {
    atrPct: number;
    trendStack: boolean;
    aboveSma50: boolean;
    rs63: number;
    baseRange15Pct: number;
    fromHigh252Pct: number;
    volumeDryUp: number;
    breakout20: boolean;
    closeLocation: number;
    pullbackToSma20: boolean;
    return5Pct: number;
}

function mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(bars: PriceBar[], end: number, period: number): number {
    let sum = 0;
    for (let index = end - period + 1; index <= end; index += 1) sum += bars[index].close;
    return sum / period;
}

export const MIN_HISTORY = 252;

/** Features from bars[0..i]. Requires i >= MIN_HISTORY. niftyReturn63Pct is the index's 63-session return at the same date. */
export function computeFeatures(bars: PriceBar[], i: number, niftyReturn63Pct: number): StockFeatures | null {
    if (i < MIN_HISTORY || i >= bars.length) return null;
    const bar = bars[i];
    if (!(bar.close > 0)) return null;
    const trueRanges: number[] = [];
    for (let index = i - 13; index <= i; index += 1) {
        const current = bars[index];
        const previousClose = bars[index - 1].close;
        trueRanges.push(Math.max(current.high - current.low, Math.abs(current.high - previousClose), Math.abs(current.low - previousClose)));
    }
    const atrPct = (mean(trueRanges) / bar.close) * 100;
    const sma20 = sma(bars, i, 20);
    const sma50 = sma(bars, i, 50);
    const sma200 = sma(bars, i, 200);
    const close63 = bars[i - 63].close;
    const rs63 = (close63 > 0 ? (bar.close / close63 - 1) * 100 : 0) - niftyReturn63Pct;
    const window15 = bars.slice(i - 14, i + 1);
    const high15 = Math.max(...window15.map(b => b.high));
    const low15 = Math.min(...window15.map(b => b.low));
    const high252 = Math.max(...bars.slice(i - 251, i + 1).map(b => b.high));
    const avgVolume10 = mean(bars.slice(i - 9, i + 1).map(b => b.volume));
    const avgVolume50Prior = mean(bars.slice(i - 50, i).map(b => b.volume));
    const priorHigh20 = Math.max(...bars.slice(i - 20, i).map(b => b.high));
    const range = bar.high - bar.low;
    const trendStack = bar.close > sma20 && sma20 > sma50 && sma50 > sma200;
    return {
        atrPct,
        trendStack,
        aboveSma50: bar.close > sma50,
        rs63,
        baseRange15Pct: low15 > 0 ? (high15 / low15 - 1) * 100 : 99,
        fromHigh252Pct: high252 > 0 ? (bar.close / high252 - 1) * 100 : -99,
        volumeDryUp: avgVolume50Prior > 0 ? avgVolume10 / avgVolume50Prior : 1,
        breakout20: bar.close > priorHigh20 && avgVolume50Prior > 0 && bar.volume >= 1.5 * avgVolume50Prior,
        closeLocation: range > 0 ? (bar.close - bar.low) / range : 0.5,
        pullbackToSma20: trendStack && bar.close >= sma20 && bar.close <= sma20 * 1.03,
        return5Pct: bars[i - 5].close > 0 ? (bar.close / bars[i - 5].close - 1) * 100 : 0,
    };
}

export interface MarketContext {
    /** NIFTY 50 above its 50-day average, and the 50-day above the 200-day. */
    niftyGreen: boolean;
    /** Share of the day's universe trading above their 50-day average, 0-100. */
    breadthPct: number;
}

export interface StudyRow {
    symbol: string;
    date: string;
    features: StockFeatures;
    market: MarketContext;
    label: TradeLabel;
    /** Signal date index in the symbol's series, for non-overlapping selection. */
    index: number;
    /** The trade window touches an unexplained price jump. */
    touchesUnverifiedJump: boolean;
}

export interface Condition {
    id: string;
    label: string;
    test: (row: StudyRow) => boolean;
}

export const CONDITIONS: Condition[] = [
    { id: 'atr_lt_1_5', label: 'Daily range (ATR) below 1.5%', test: r => r.features.atrPct < 1.5 },
    { id: 'atr_1_5_3_5', label: 'Daily range (ATR) 1.5–3.5%', test: r => r.features.atrPct >= 1.5 && r.features.atrPct <= 3.5 },
    { id: 'atr_gt_3_5', label: 'Daily range (ATR) above 3.5%', test: r => r.features.atrPct > 3.5 },
    { id: 'trend_stack', label: 'Trend stack: close > 20 > 50 > 200-day average', test: r => r.features.trendStack },
    { id: 'rs_pos', label: 'Beat NIFTY over 3 months', test: r => r.features.rs63 > 0 },
    { id: 'rs_10', label: 'Beat NIFTY by 10%+ over 3 months', test: r => r.features.rs63 > 10 },
    { id: 'tight_base', label: 'Tight 15-day base (range < 10%)', test: r => r.features.baseRange15Pct < 10 },
    { id: 'near_high', label: 'Within 5% of 52-week high', test: r => r.features.fromHigh252Pct >= -5 },
    { id: 'vol_dry', label: 'Volume dry-up (10-day < 0.8× 50-day)', test: r => r.features.volumeDryUp < 0.8 },
    { id: 'breakout', label: '20-day breakout on 1.5× volume', test: r => r.features.breakout20 },
    { id: 'strong_close', label: 'Close in top 25% of day range', test: r => r.features.closeLocation >= 0.75 },
    { id: 'pullback', label: 'Pullback to 20-day average in uptrend', test: r => r.features.pullbackToSma20 },
    { id: 'market_green', label: 'Market green: NIFTY > 50 > 200-day', test: r => r.market.niftyGreen },
    { id: 'breadth_60', label: 'Breadth above 60%', test: r => r.market.breadthPct > 60 },
    { id: 'extended', label: 'Extended: up 10%+ in 5 days', test: r => r.features.return5Pct > 10 },
];

export interface OutcomeStats {
    n: number;
    targetPct: number;
    stopPct: number;
    expiredPct: number;
    avgNetR: number;
    /** 95% confidence half-width of avgNetR (normal approximation). */
    ciNetR: number;
}

/** The fields the statistics helpers need; StudyRow and other study rows satisfy it. */
export interface LabelledTrade {
    symbol: string;
    index: number;
    label: TradeLabel;
}

export function summarize(rows: LabelledTrade[]): OutcomeStats {
    const n = rows.length;
    if (!n) return { n: 0, targetPct: 0, stopPct: 0, expiredPct: 0, avgNetR: 0, ciNetR: 0 };
    let target = 0, stop = 0, sum = 0, sumSquares = 0;
    for (const row of rows) {
        if (row.label.outcome === 'TARGET') target += 1;
        else if (row.label.outcome === 'STOP') stop += 1;
        sum += row.label.netR;
        sumSquares += row.label.netR * row.label.netR;
    }
    const avg = sum / n;
    const variance = n > 1 ? Math.max(0, (sumSquares - n * avg * avg) / (n - 1)) : 0;
    return {
        n,
        targetPct: (100 * target) / n,
        stopPct: (100 * stop) / n,
        expiredPct: (100 * (n - target - stop)) / n,
        avgNetR: avg,
        ciNetR: 1.96 * Math.sqrt(variance / n),
    };
}

/**
 * Keep one trade per symbol at a time: after a trade is taken, later signals
 * for that symbol are skipped until the trade has exited. This is what a
 * trader could actually take, and avoids counting one move many times.
 */
export function nonOverlapping<T extends LabelledTrade>(rows: T[]): T[] {
    const sorted = [...rows].sort((left, right) => left.symbol.localeCompare(right.symbol) || left.index - right.index);
    const kept: T[] = [];
    let currentSymbol = '';
    let busyUntil = -1;
    for (const row of sorted) {
        if (row.symbol !== currentSymbol) { currentSymbol = row.symbol; busyUntil = -1; }
        if (row.index <= busyUntil) continue;
        kept.push(row);
        busyUntil = row.label.exitIndex;
    }
    return kept;
}

export function matchesAll(row: StudyRow, conditions: Condition[]): boolean {
    for (const condition of conditions) if (!condition.test(row)) return false;
    return true;
}

export interface GreedyStep {
    conditions: Condition[];
    discovery: OutcomeStats;
}

/**
 * Forward selection on the discovery period only: repeatedly add the
 * condition that most improves non-overlapping average net R, while keeping
 * at least minTrades trades. Never looks at the test period.
 */
export function greedySelect(discovery: StudyRow[], candidates: Condition[], maxConditions = 4, minTrades = 300): GreedyStep[] {
    const steps: GreedyStep[] = [];
    let chosen: Condition[] = [];
    let pool = discovery;
    let best = summarize(nonOverlapping(pool));
    for (let step = 0; step < maxConditions; step += 1) {
        let next: { condition: Condition; stats: OutcomeStats; rows: StudyRow[] } | null = null;
        for (const condition of candidates) {
            if (chosen.some(item => item.id === condition.id)) continue;
            const rows = pool.filter(condition.test);
            const stats = summarize(nonOverlapping(rows));
            if (stats.n < minTrades) continue;
            if (!next || stats.avgNetR > next.stats.avgNetR) next = { condition, stats, rows };
        }
        if (!next || next.stats.avgNetR <= best.avgNetR) break;
        chosen = [...chosen, next.condition];
        pool = next.rows;
        best = next.stats;
        steps.push({ conditions: chosen, discovery: next.stats });
    }
    return steps;
}
