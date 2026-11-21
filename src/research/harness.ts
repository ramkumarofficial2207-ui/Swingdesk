/**
 * Evaluation harness v3 (SETUP_DISCOVERY_ROADMAP.md, Part 3).
 *
 * Every setup is judged the way a trader would run it: each signal day the
 * candidates are ranked, at most `maxPerSector` per industry and `topN` in
 * total are taken, a stock already held is skipped, and the portfolio never
 * holds more than `maxPositions`. Trades exit only on tradeable bars (not
 * suspended, not locked at a single price). Pure functions; no database.
 */
import { PriceBar } from '../corporateActions';

export interface HarnessRules {
    topN: number;
    maxPerSector: number;
    maxPositions: number;
    costBps: number;
    /** Fraction of equity at risk per trade when a stop is given (e.g. 0.01). */
    riskPerTrade: number;
}

export const DEFAULT_RULES: HarnessRules = { topN: 5, maxPerSector: 2, maxPositions: 5, costBps: 40, riskPerTrade: 0.01 };

export interface ExitPlan {
    /** Stop distance below entry in %, or null for no stop. */
    stopPct: number | null;
    /** Target distance above entry in %, or null for no target. */
    targetPct: number | null;
    /** Sessions held, counting the entry session. */
    horizon: number;
    /** Skip the trade if the next open is more than this % above the signal close. */
    maxGapUpPct?: number;
    /**
     * Buy-stop price for the entry session only: fill at the open if it is at or above,
     * at the trigger if the high reaches it, otherwise no trade.
     */
    entryTrigger?: number;
    /** After a close below its N-session average, sell at the next tradeable open. */
    trailSma?: number;
    /** Sell `fraction` at entry + atR × stop distance; the rest's stop moves to entry from the next session. */
    partial?: { atR: number; fraction: number };
    /**
     * Rule-based exit: when this returns true at the close of bar k (data up to k only),
     * sell at the next tradeable open (outcome TRAIL). Indices refer to the same bars array.
     */
    exitWhen?: (k: number) => boolean;
    /**
     * Ratcheting stop: once a session's high reaches entry × (1 + at%), the stop moves up to
     * entry × (1 + stopTo%) from the next session (never down). Conservative: the move is
     * not used on the session that reached the level.
     */
    ratchet?: Array<{ at: number; stopTo: number }>;
}

export interface Candidate {
    symbol: string;
    industry: string;
    /** Index of the signal bar in this symbol's bars. */
    index: number;
    /** Higher = better; used to rank candidates on the same day. */
    score: number;
    exit: ExitPlan;
    /** Extra per-candidate values for a card's cross-sectional step (e.g. today's return). */
    meta?: Record<string, number>;
}

export interface HarnessTrade {
    symbol: string;
    industry: string;
    signalDate: string;
    entryDate: string;
    exitDate: string;
    entryIndex: number;
    exitIndex: number;
    entry: number;
    exit: number;
    outcome: 'TARGET' | 'STOP' | 'TIME' | 'TRAIL';
    netPct: number;
    /** The exit had to wait for a tradeable bar (suspension or locked price). */
    delayedExit: boolean;
    stopPct: number | null;
    /** A partial exit filled before the final exit (see ExitPlan.partial). */
    partialFilled?: boolean;
}

/** A bar you could actually trade on: has volume and is not a single locked price. */
export function isTradeable(bar: PriceBar): boolean {
    if (!(bar.volume > 0) || !(bar.open > 0)) return false;
    return !(bar.high === bar.low && bar.open === bar.close && bar.high === bar.close);
}

/** Entry price for a plan on the entry bar, or null when a buy-stop is not reached. */
export function entryFill(bar: PriceBar, plan: ExitPlan): number | null {
    if (plan.entryTrigger === undefined) return bar.open;
    if (bar.open >= plan.entryTrigger) return bar.open;
    return bar.high >= plan.entryTrigger ? plan.entryTrigger : null;
}

/**
 * Simulate one long trade from the open of entryIndex (or the buy-stop fill).
 * Conservative ordering: a gap through the stop exits at the open; a bar that
 * touches both levels counts as the stop. Levels are only acted on in
 * tradeable bars; the time exit moves to the next tradeable bar's open if the
 * last bar is not tradeable. Null if the data ends before the trade can exit.
 */
export function simulateTrade(bars: PriceBar[], entryIndex: number, plan: ExitPlan, costBps: number):
    Omit<HarnessTrade, 'symbol' | 'industry' | 'signalDate'> | null {
    if (entryIndex >= bars.length || !isTradeable(bars[entryIndex])) return null;
    const filled = entryFill(bars[entryIndex], plan);
    if (filled === null) return null;
    const entry = filled;
    let stop = plan.stopPct === null ? null : entry * (1 - plan.stopPct / 100);
    const target = plan.targetPct === null ? null : entry * (1 + plan.targetPct / 100);
    const partialLevel = plan.partial && plan.stopPct !== null ? entry * (1 + (plan.partial.atR * plan.stopPct) / 100) : null;
    let partialPrice: number | null = null;
    let moveStopToEntry = false;
    let trailDue = false;
    let ratchetStop: number | null = null;
    let closeSum = 0;
    const period = plan.trailSma ?? 0;
    if (period > 0) for (let j = Math.max(0, entryIndex - period); j < entryIndex; j += 1) closeSum += bars[j].close;
    const last = entryIndex + plan.horizon - 1;
    let delayed = false;
    const blended = (exit: number) => partialPrice === null
        ? (exit / entry - 1) * 100
        : plan.partial!.fraction * (partialPrice / entry - 1) * 100 + (1 - plan.partial!.fraction) * (exit / entry - 1) * 100;
    const done = (outcome: HarnessTrade['outcome'], exit: number, k: number) => ({
        entryDate: bars[entryIndex].date,
        exitDate: bars[k].date,
        entryIndex,
        exitIndex: k,
        entry,
        exit,
        outcome,
        netPct: blended(exit) - costBps / 100,
        delayedExit: delayed,
        stopPct: plan.stopPct,
        ...(plan.partial ? { partialFilled: partialPrice !== null } : {}),
    });
    for (let k = entryIndex; k < bars.length; k += 1) {
        const bar = bars[k];
        // Rolling sum of the last `period` closes up to k (data known at k's close).
        if (period > 0) { closeSum += bar.close; if (k - period >= 0) closeSum -= bars[k - period].close; }
        if (!isTradeable(bar)) { delayed = true; continue; }
        if (moveStopToEntry) { stop = Math.max(stop ?? entry, entry); moveStopToEntry = false; }
        if (ratchetStop !== null) stop = Math.max(stop ?? ratchetStop, ratchetStop);
        if (k > last) return done('TIME', bar.open, k); // time exit was due on an untradeable bar
        if (trailDue) return done('TRAIL', bar.open, k);
        if (k > entryIndex && stop !== null && bar.open <= stop) return done('STOP', bar.open, k);
        if (k > entryIndex && target !== null && bar.open >= target) return done('TARGET', bar.open, k);
        if (stop !== null && bar.low <= stop) return done('STOP', stop, k);
        if (target !== null && bar.high >= target) return done('TARGET', target, k);
        if (partialLevel !== null && partialPrice === null && bar.high >= partialLevel) {
            partialPrice = k > entryIndex && bar.open >= partialLevel ? bar.open : partialLevel;
            moveStopToEntry = true;
        }
        if (k === last) return done('TIME', bar.close, k);
        if (plan.ratchet) for (const step of plan.ratchet) {
            if (bar.high >= entry * (1 + step.at / 100)) ratchetStop = Math.max(ratchetStop ?? -Infinity, entry * (1 + step.stopTo / 100));
        }
        if (period > 0 && k >= period - 1 && bar.close < closeSum / period) trailDue = true;
        if (plan.exitWhen && plan.exitWhen(k)) trailDue = true;
    }
    return null;
}

/**
 * Turn all candidates into the trades a disciplined trader would take.
 * barsBySymbol must hold the same arrays the candidate indices refer to.
 */
export function selectTrades(candidates: Candidate[], barsBySymbol: Map<string, PriceBar[]>, rules: HarnessRules = DEFAULT_RULES): HarnessTrade[] {
    const byDate = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
        const bars = barsBySymbol.get(candidate.symbol);
        if (!bars) continue;
        const date = bars[candidate.index].date;
        const list = byDate.get(date) ?? [];
        list.push(candidate);
        byDate.set(date, list);
    }
    const open: HarnessTrade[] = [];
    const taken: HarnessTrade[] = [];
    for (const date of [...byDate.keys()].sort()) {
        // Positions whose exit date is on or before this signal date are closed by its close.
        for (let k = open.length - 1; k >= 0; k -= 1) if (open[k].exitDate <= date) open.splice(k, 1);
        const ranked = byDate.get(date)!.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
        const perSector = new Map<string, number>();
        for (const held of open) perSector.set(held.industry, (perSector.get(held.industry) ?? 0) + 1);
        let today = 0;
        for (const candidate of ranked) {
            if (today >= rules.topN || open.length >= rules.maxPositions) break;
            if (open.some(held => held.symbol === candidate.symbol)) continue;
            const sectorKey = candidate.industry === 'Unknown' ? `?${candidate.symbol}` : candidate.industry;
            if ((perSector.get(sectorKey) ?? 0) >= rules.maxPerSector) continue;
            const bars = barsBySymbol.get(candidate.symbol)!;
            const entryIndex = candidate.index + 1;
            if (entryIndex >= bars.length) continue;
            const maxGap = candidate.exit.maxGapUpPct;
            if (maxGap !== undefined && bars[entryIndex].open > bars[candidate.index].close * (1 + maxGap / 100)) continue;
            // An unfilled buy-stop still used one of today's orders: no picking the ones that filled.
            if (isTradeable(bars[entryIndex]) && entryFill(bars[entryIndex], candidate.exit) === null) { today += 1; continue; }
            const result = simulateTrade(bars, entryIndex, candidate.exit, rules.costBps);
            if (!result) continue;
            const trade: HarnessTrade = { symbol: candidate.symbol, industry: sectorKey, signalDate: date, ...result };
            open.push(trade);
            taken.push(trade);
            perSector.set(sectorKey, (perSector.get(sectorKey) ?? 0) + 1);
            today += 1;
        }
    }
    return taken;
}

export interface TradeStats {
    n: number;
    avg: number;
    ci: number;
    dayClustered: number;
    days: number;
    winRate: number;
    /** Average after removing all trades from the 5 best signal days. */
    withoutBest5Days: number;
    delayedExits: number;
}

export function tradeStats(trades: HarnessTrade[]): TradeStats {
    const n = trades.length;
    if (!n) return { n: 0, avg: 0, ci: 0, dayClustered: 0, days: 0, winRate: 0, withoutBest5Days: 0, delayedExits: 0 };
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const values = trades.map(trade => trade.netPct);
    const avg = mean(values);
    const variance = n > 1 ? values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (n - 1) : 0;
    const byDay = new Map<string, number[]>();
    for (const trade of trades) { const list = byDay.get(trade.signalDate) ?? []; list.push(trade.netPct); byDay.set(trade.signalDate, list); }
    const days = [...byDay].map(([date, list]) => ({ date, avg: mean(list) }));
    const best5 = new Set([...days].sort((a, b) => b.avg - a.avg).slice(0, 5).map(day => day.date));
    return {
        n,
        avg,
        ci: 1.96 * Math.sqrt(variance / n),
        dayClustered: mean(days.map(day => day.avg)),
        days: days.length,
        winRate: (100 * values.filter(value => value > 0).length) / n,
        withoutBest5Days: mean(trades.filter(trade => !best5.has(trade.signalDate)).map(trade => trade.netPct)),
        delayedExits: trades.filter(trade => trade.delayedExit).length,
    };
}

export interface PortfolioResult {
    startDate: string;
    endDate: string;
    finalEquity: number;
    cagrPct: number;
    maxDrawdownPct: number;
    benchmarkCagrPct: number;
    benchmarkMaxDrawdownPct: number;
}

/**
 * Daily mark-to-market portfolio. Each position is sized at
 * min(equity / maxPositions, equity × riskPerTrade / stop%) at entry;
 * time-exit trades without a stop use the equal slot. Costs are taken
 * through each trade's net return at exit. calendar = all session dates.
 */
export function simulatePortfolio(trades: HarnessTrade[], barsBySymbol: Map<string, PriceBar[]>, benchmark: PriceBar[], calendar: string[], rules: HarnessRules = DEFAULT_RULES, start = 100): PortfolioResult | null {
    if (!trades.length) return null;
    const first = trades.reduce((min, trade) => (trade.entryDate < min ? trade.entryDate : min), trades[0].entryDate);
    const lastDate = trades.reduce((max, trade) => (trade.exitDate > max ? trade.exitDate : max), trades[0].exitDate);
    const days = calendar.filter(date => date >= first && date <= lastDate);
    const entriesByDate = new Map<string, HarnessTrade[]>();
    for (const trade of trades) { const list = entriesByDate.get(trade.entryDate) ?? []; list.push(trade); entriesByDate.set(trade.entryDate, list); }
    const closeOf = new Map<string, Map<string, number>>();
    for (const [symbol, bars] of barsBySymbol) closeOf.set(symbol, new Map(bars.map(bar => [bar.date, bar.close])));

    let cash = start;
    const held: Array<{ trade: HarnessTrade; shares: number; lastClose: number }> = [];
    let peak = start;
    let maxDrawdown = 0;
    let equity = start;
    for (const date of days) {
        const markValue = () => held.reduce((sum, pos) => sum + pos.shares * pos.lastClose, 0);
        for (const trade of entriesByDate.get(date) ?? []) {
            const equityNow = cash + markValue();
            let size = equityNow / rules.maxPositions;
            if (trade.stopPct) size = Math.min(size, (equityNow * rules.riskPerTrade) / (trade.stopPct / 100));
            size = Math.min(size, cash);
            if (size <= 0) continue;
            cash -= size;
            held.push({ trade, shares: size / trade.entry, lastClose: trade.entry });
        }
        for (let k = held.length - 1; k >= 0; k -= 1) {
            const pos = held[k];
            const close = closeOf.get(pos.trade.symbol)?.get(date);
            if (close !== undefined) pos.lastClose = close;
            if (pos.trade.exitDate === date) {
                cash += pos.shares * pos.trade.entry * (1 + pos.trade.netPct / 100);
                held.splice(k, 1);
            }
        }
        equity = cash + markValue();
        peak = Math.max(peak, equity);
        maxDrawdown = Math.max(maxDrawdown, (1 - equity / peak) * 100);
    }
    const years = Math.max(1 / 252, days.length / 252);
    const benchmarkBars = benchmark.filter(bar => bar.date >= first && bar.date <= lastDate);
    let benchPeak = 0;
    let benchDrawdown = 0;
    for (const bar of benchmarkBars) { benchPeak = Math.max(benchPeak, bar.close); benchDrawdown = Math.max(benchDrawdown, (1 - bar.close / benchPeak) * 100); }
    const benchReturn = benchmarkBars.length > 1 ? benchmarkBars.at(-1)!.close / benchmarkBars[0].open : 1;
    return {
        startDate: first,
        endDate: lastDate,
        finalEquity: equity,
        cagrPct: ((equity / start) ** (1 / years) - 1) * 100,
        maxDrawdownPct: maxDrawdown,
        benchmarkCagrPct: (benchReturn ** (1 / years) - 1) * 100,
        benchmarkMaxDrawdownPct: benchDrawdown,
    };
}

export interface Verdict {
    passed: boolean;
    checks: Array<{ rule: string; value: string; pass: boolean }>;
}

const sign = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

/** The pass rules from SETUP_DISCOVERY_ROADMAP.md Part 3 (historical stage), applied to the test period. */
export function judge(test: TradeStats, yearly: Array<{ year: string; stats: TradeStats }>, testYears: string[], portfolio: PortfolioResult | null): Verdict {
    const positiveYears = yearly.filter(item => testYears.includes(item.year) && item.stats.n > 0 && item.stats.avg > 0).length;
    const checks = [
        { rule: 'At least 100 test trades', value: String(test.n), pass: test.n >= 100 },
        { rule: 'Average net return above 0', value: sign(test.avg), pass: test.avg > 0 },
        { rule: 'Lower end of 95% range above 0', value: sign(test.avg - test.ci), pass: test.avg - test.ci > 0 },
        { rule: 'Day-clustered average above 0', value: sign(test.dayClustered), pass: test.dayClustered > 0 },
        { rule: 'Still positive without the 5 best signal days', value: sign(test.withoutBest5Days), pass: test.withoutBest5Days > 0 },
        { rule: `Positive in at least 2 of ${testYears.length} test years`, value: `${positiveYears} of ${testYears.length}`, pass: positiveYears >= 2 },
        {
            rule: 'Portfolio: net CAGR above 0',
            value: portfolio ? sign(portfolio.cagrPct) : '—',
            pass: !!portfolio && portfolio.cagrPct > 0,
        },
        {
            rule: 'Portfolio: max drawdown ≤ 20%',
            value: portfolio ? `${portfolio.maxDrawdownPct.toFixed(1)}%` : '—',
            pass: !!portfolio && portfolio.maxDrawdownPct <= 20,
        },
        {
            rule: 'Portfolio: beats NIFTY 50 CAGR or has a lower drawdown',
            value: portfolio ? `${sign(portfolio.cagrPct)} vs ${sign(portfolio.benchmarkCagrPct)}; DD ${portfolio.maxDrawdownPct.toFixed(1)}% vs ${portfolio.benchmarkMaxDrawdownPct.toFixed(1)}%` : '—',
            pass: !!portfolio && (portfolio.cagrPct > portfolio.benchmarkCagrPct || portfolio.maxDrawdownPct < portfolio.benchmarkMaxDrawdownPct),
        },
    ];
    return { passed: checks.every(check => check.pass), checks };
}
