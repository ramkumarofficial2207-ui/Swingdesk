/**
 * Equity baseline strategies from Kakushadze & Serur, "151 Trading Strategies"
 * (SSRN 3247865, 2018), sections 3.1–3.17 and 4.1–4.4, adapted to long-only
 * Indian cash equities. Pure, point-in-time: a signal at bar i uses bars 0..i only.
 *
 * Plan and every deviation from the paper: reports/paper151-plan.md.
 */
import { PriceBar } from '../../corporateActions';
import { ExitPlan } from '../harness';

export type BaselineId =
    | 'MOMENTUM' | 'LOW_VOL' | 'RESIDUAL_MOMENTUM' | 'MULTIFACTOR' | 'INDUSTRY_REVERSION' | 'IBS'
    | 'MA_SINGLE' | 'MA_TWO' | 'MA_THREE' | 'PIVOT' | 'DONCHIAN' | 'KNN' | 'DUAL_MOMENTUM';

export const BASELINES: Record<BaselineId, { section: string; name: string; rule: string }> = {
    MOMENTUM: { section: '3.1', name: 'Price momentum (12-1)', rule: 'Top 10% by return from 252 to 21 sessions ago; monthly rebalance' },
    LOW_VOL: { section: '3.4', name: 'Low-volatility anomaly', rule: 'Lowest 10% by 252-session volatility; rebalance every 6 months (June and December)' },
    RESIDUAL_MOMENTUM: { section: '3.7', name: 'Residual momentum', rule: 'Top 10% by mean ÷ volatility of 12 monthly residuals vs NIFTY 50 (beta from 24 months); monthly rebalance' },
    MULTIFACTOR: { section: '3.6', name: 'Multifactor (rank average)', rule: 'Top 10% by the average demeaned rank of momentum, low volatility and residual momentum; monthly rebalance' },
    INDUSTRY_REVERSION: { section: '3.9', name: 'Industry-neutral mean-reversion', rule: 'Bottom 10% by 5-session return minus own industry average; hold 5 sessions' },
    IBS: { section: '4.4', name: 'Internal bar strength', rule: 'Bottom 10% by (close − low) ÷ (high − low); hold 1 session' },
    MA_SINGLE: { section: '3.11', name: 'Single moving average', rule: 'Close crosses above its 50-day average; sell after a close below it (max 60 sessions)' },
    MA_TWO: { section: '3.12', name: 'Two moving averages', rule: '10-day average crosses above 30-day; sell when it crosses back or the close falls > 2% in a day (max 60)' },
    MA_THREE: { section: '3.13', name: 'Three moving averages', rule: '3 > 10 > 21-day averages newly lined up; sell when 3 ≤ 10 (max 60)' },
    PIVOT: { section: '3.14', name: 'Pivot support/resistance', rule: 'Close crosses above the pivot (H+L+C)/3 of the day before; sell at a close ≥ resistance 2C − L (max 20)' },
    DONCHIAN: { section: '3.15', name: 'Donchian channel', rule: 'Close at or below the 20-session low of closes (floor); sell at a close at or above the 20-session high (max 60)' },
    KNN: { section: '3.17', name: 'Single-stock k-nearest neighbours', rule: 'Predicted 10-session return from the 22 most similar past days (price and volume average ratios) > 0.4%; hold 10 sessions' },
    DUAL_MOMENTUM: { section: '4.1.2', name: 'Dual-momentum sector rotation', rule: 'Stocks of the top 10% industries by 6-month return (industry above its 100-day average), only when NIFTY 50 is above its 200-day average; monthly rebalance' },
};

export const BASELINE_IDS = Object.keys(BASELINES) as BaselineId[];

export interface BaselineSignal {
    score: number;
    /** Exit under the paper's own holding rule. */
    exit: ExitPlan;
    /** The own-rule entry only happens on this baseline's rebalance days; daily signals are for the 5% rule. */
    rebalanceDay: boolean;
    reason: string;
}

export interface BaselineStock {
    symbol: string;
    industry: string;
    bars: PriceBar[];
    /** Whether the stock is in the trading universe at bar i. */
    eligible: (i: number) => boolean;
}

/** Signals per baseline → symbol → bar index. */
export type BaselineSignals = Map<BaselineId, Map<string, Map<number, BaselineSignal>>>;

export const TOP_FRACTION = 0.1;
export const COST_PCT = 0.4;

// ---------- pure helpers ----------

export function rollingMean(values: number[], period: number): number[] {
    const out = new Array<number>(values.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

const month = (date: string) => date.slice(0, 7);

/** Index of the n-th month-end after i in these bars (a bar whose next bar is in a new month), or -1. */
export function nthMonthEndAfter(bars: PriceBar[], i: number, n: number): number {
    let seen = 0;
    for (let k = i + 1; k + 1 < bars.length; k += 1) {
        if (month(bars[k + 1].date) !== month(bars[k].date)) { seen += 1; if (seen === n) return k; }
    }
    return -1;
}

/** §3.1 cumulative 12-1 return: close 21 sessions ago ÷ close 252 sessions ago − 1. */
export function momentum12_1(bars: PriceBar[], i: number): number | null {
    if (i < 252) return null;
    const then = bars[i - 252].close;
    const recent = bars[i - 21].close;
    return then > 0 && recent > 0 ? recent / then - 1 : null;
}

/** §3.4 sample standard deviation of the 252 daily log returns ending at i. */
export function volatility252(bars: PriceBar[], i: number): number | null {
    if (i < 252) return null;
    const r: number[] = [];
    for (let k = i - 251; k <= i; k += 1) {
        if (!(bars[k].close > 0) || !(bars[k - 1].close > 0)) return null;
        r.push(Math.log(bars[k].close / bars[k - 1].close));
    }
    const mean = r.reduce((s, v) => s + v, 0) / r.length;
    return Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / (r.length - 1));
}

export const RESIDUAL = { month: 21, betaMonths: 24, formationMonths: 12, skipMonths: 1 } as const;

/**
 * §3.7 residual momentum with the market as the only factor (no Indian Fama-French
 * series available): monthly (21-session) returns, beta from the 24 months before the
 * skip month, residuals ε = R − β·MKT over the 12 formation months, score = mean(ε) ÷ sd(ε).
 */
export function residualMomentum(bars: PriceBar[], i: number, marketClose: (date: string) => number | undefined): number | null {
    const m = RESIDUAL.month;
    const months = RESIDUAL.betaMonths;
    const end = i - RESIDUAL.skipMonths * m;
    if (end - months * m < 0) return null;
    const stock: number[] = [];
    const market: number[] = [];
    for (let k = months; k >= 1; k -= 1) {
        const a = end - k * m;
        const b = a + m;
        const ma = marketClose(bars[a].date);
        const mb = marketClose(bars[b].date);
        if (!(bars[a].close > 0) || ma === undefined || mb === undefined || !(ma > 0)) return null;
        stock.push(bars[b].close / bars[a].close - 1);
        market.push(mb / ma - 1);
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    const ms = mean(stock);
    const mm = mean(market);
    let cov = 0;
    let varM = 0;
    for (let k = 0; k < months; k += 1) { cov += (stock[k] - ms) * (market[k] - mm); varM += (market[k] - mm) ** 2; }
    if (!(varM > 0)) return null;
    const beta = cov / varM;
    const eps = stock.slice(-RESIDUAL.formationMonths).map((r, k) => r - beta * market[months - RESIDUAL.formationMonths + k]);
    const me = mean(eps);
    const sd = Math.sqrt(eps.reduce((s, v) => s + (v - me) ** 2, 0) / (eps.length - 1));
    return sd > 0 ? me / sd : null;
}

/** §4.4 internal bar strength of one bar, or null for a bar with no range. */
export function ibs(bar: PriceBar): number | null {
    return bar.high > bar.low ? (bar.close - bar.low) / (bar.high - bar.low) : null;
}

/** §3.6 demeaned ranks (rank 1 = smallest value), formula (276). */
export function demeanedRanks(values: Map<string, number>): Map<string, number> {
    const sorted = [...values].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const mean = (sorted.length + 1) / 2;
    return new Map(sorted.map(([symbol], k) => [symbol, k + 1 - mean]));
}

/** Symbols in the top `fraction` of values (at least 1 when any exist). */
export function topFraction(values: Map<string, number>, fraction = TOP_FRACTION): Array<[string, number]> {
    const sorted = [...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return sorted.slice(0, Math.max(1, Math.floor(sorted.length * fraction)));
}

export const KNN = { horizon: 10, train: 500, minTrain: 200 } as const;

/** §3.17 features at t: moving-average ratios of volume (5/20) and price (5/20, 20/50). */
export function knnFeatures(bars: PriceBar[]): number[][] {
    const closes = bars.map(b => b.close);
    const volumes = bars.map(b => b.volume);
    const v5 = rollingMean(volumes, 5);
    const v20 = rollingMean(volumes, 20);
    const p5 = rollingMean(closes, 5);
    const p20 = rollingMean(closes, 20);
    const p50 = rollingMean(closes, 50);
    return bars.map((_, t) => [v20[t] > 0 ? v5[t] / v20[t] : NaN, p5[t] / p20[t], p20[t] / p50[t]]);
}

/**
 * §3.17 prediction at i: average realised 10-session return of the k nearest past
 * days (k = floor(√T*)), features min-max scaled on the training window. Training
 * days t' ≤ i − 10, so every target is known at i.
 */
export function knnPredict(bars: PriceBar[], features: number[][], i: number): number | null {
    const h = KNN.horizon;
    const last = i - h;
    const first = Math.max(50, last - KNN.train + 1);
    const rows: number[] = [];
    for (let t = first; t <= last; t += 1) if (features[t].every(Number.isFinite) && bars[t].close > 0) rows.push(t);
    if (rows.length < KNN.minTrain || !features[i].every(Number.isFinite)) return null;
    const dims = features[i].length;
    const lo = new Array<number>(dims).fill(Infinity);
    const hi = new Array<number>(dims).fill(-Infinity);
    for (const t of rows) for (let d = 0; d < dims; d += 1) { lo[d] = Math.min(lo[d], features[t][d]); hi[d] = Math.max(hi[d], features[t][d]); }
    const scale = (value: number, d: number) => (hi[d] > lo[d] ? (value - lo[d]) / (hi[d] - lo[d]) : 0);
    const q = features[i].map(scale);
    const k = Math.floor(Math.sqrt(rows.length));
    const best: Array<{ dist: number; y: number }> = [];
    for (const t of rows) {
        let dist = 0;
        for (let d = 0; d < dims; d += 1) dist += (scale(features[t][d], d) - q[d]) ** 2;
        if (best.length === k && dist >= best[k - 1].dist) continue;
        const y = bars[t + h].close / bars[t].close - 1;
        let at = best.length;
        while (at > 0 && best[at - 1].dist > dist) at -= 1;
        best.splice(at, 0, { dist, y });
        if (best.length > k) best.pop();
    }
    return best.reduce((s, b) => s + b.y, 0) / best.length;
}

// ---------- the cross-sectional engine ----------

interface Prepared {
    stock: BaselineStock;
    at: Map<string, number>;
    closes: number[];
    sma: Record<3 | 10 | 21 | 30 | 50, number[]>;
    turnover20: number[];
    knnFeat: number[][] | null;
}

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}%`;

/**
 * Compute every baseline's signals. `dates` limits the output to those signal dates
 * (the live app passes only the latest session). The market series must be NIFTY 50.
 */
export function computeBaselineSignals(stocks: BaselineStock[], nifty: PriceBar[], dates?: Set<string>): BaselineSignals {
    const out: BaselineSignals = new Map(BASELINE_IDS.map(id => [id, new Map()]));
    const add = (id: BaselineId, symbol: string, i: number, signal: BaselineSignal) => {
        const bySymbol = out.get(id)!;
        if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Map());
        bySymbol.get(symbol)!.set(i, signal);
    };

    const niftyClose = new Map(nifty.map(b => [b.date, b.close]));
    const niftySma200 = rollingMean(nifty.map(b => b.close), 200);
    const niftyAbove200 = new Map(nifty.map((b, k) => [b.date, Number.isFinite(niftySma200[k]) ? b.close > niftySma200[k] : false]));
    const calendar = nifty.map(b => b.date);
    const monthEnd = new Set(calendar.filter((d, k) => k + 1 < calendar.length && month(calendar[k + 1]) !== month(d)));

    const prepared: Prepared[] = stocks.map(stock => {
        const closes = stock.bars.map(b => b.close);
        const value = stock.bars.map(b => b.close * b.volume);
        return {
            stock,
            at: new Map(stock.bars.map((b, k) => [b.date, k])),
            closes,
            sma: { 3: rollingMean(closes, 3), 10: rollingMean(closes, 10), 21: rollingMean(closes, 21), 30: rollingMean(closes, 30), 50: rollingMean(closes, 50) },
            turnover20: rollingMean(value, 20),
            knnFeat: null,
        };
    });

    // Industry equal-weight indexes for §4.1 (built over every date, used on the requested ones).
    const industryLevel = new Map<string, number[]>();

    const wanted = (date: string) => !dates || dates.has(date);
    for (const date of calendar) {
        const today = prepared.flatMap(p => {
            const i = p.at.get(date);
            return i !== undefined && i >= 1 && p.stock.eligible(i) ? [{ p, i }] : [];
        });
        // Industry index update (members with a previous close).
        const byIndustry = new Map<string, number[]>();
        for (const { p, i } of today) {
            if (p.stock.industry === 'Unknown' || !(p.closes[i - 1] > 0)) continue;
            const list = byIndustry.get(p.stock.industry) ?? [];
            list.push(p.closes[i] / p.closes[i - 1] - 1);
            byIndustry.set(p.stock.industry, list);
        }
        // Each industry's levels run from its first day with members to today (one entry per calendar day).
        for (const industry of new Set([...industryLevel.keys(), ...byIndustry.keys()])) {
            const levels = industryLevel.get(industry) ?? [];
            const returns = byIndustry.get(industry);
            const prev = levels.length ? levels[levels.length - 1] : 1;
            levels.push(returns ? prev * (1 + returns.reduce((s, v) => s + v, 0) / returns.length) : prev);
            industryLevel.set(industry, levels);
        }
        if (!wanted(date)) continue;

        const isMonthEnd = monthEnd.has(date);
        const isHalfYearEnd = isMonthEnd && ['06', '12'].includes(date.slice(5, 7));
        const monthly = (bars: PriceBar[], i: number, months: number): ExitPlan => {
            const exitAt = nthMonthEndAfter(bars, i, months);
            return { stopPct: null, targetPct: null, horizon: exitAt > i ? exitAt - i : 0 };
        };

        // §3.1, §3.4, §3.7, §3.6
        const mom = new Map<string, number>();
        const lowVol = new Map<string, number>();
        const resid = new Map<string, number>();
        const ref = new Map<string, { p: Prepared; i: number }>();
        for (const { p, i } of today) {
            ref.set(p.stock.symbol, { p, i });
            const m = momentum12_1(p.stock.bars, i);
            const v = volatility252(p.stock.bars, i);
            const r = residualMomentum(p.stock.bars, i, d => niftyClose.get(d));
            if (m !== null) mom.set(p.stock.symbol, m);
            if (v !== null && v > 0) lowVol.set(p.stock.symbol, -v);
            if (r !== null) resid.set(p.stock.symbol, r);
        }
        const emitTop = (id: BaselineId, values: Map<string, number>, rebalanceDay: boolean, months: number, why: (symbol: string, value: number) => string) => {
            for (const [symbol, value] of topFraction(values)) {
                const { p, i } = ref.get(symbol)!;
                const exit = monthly(p.stock.bars, i, months);
                add(id, symbol, i, { score: value, exit, rebalanceDay: rebalanceDay && exit.horizon > 0, reason: why(symbol, value) });
            }
        };
        emitTop('MOMENTUM', mom, isMonthEnd, 1, (_s, v) => `12-1 month return ${fmtPct(v)}`);
        emitTop('LOW_VOL', lowVol, isHalfYearEnd, 6, (_s, v) => `daily volatility ${(-100 * v).toFixed(2)}%`);
        emitTop('RESIDUAL_MOMENTUM', resid, isMonthEnd, 1, (_s, v) => `residual momentum ${v.toFixed(2)}`);
        const all3 = [...resid.keys()].filter(s => mom.has(s) && lowVol.has(s));
        if (all3.length) {
            const pick = (src: Map<string, number>) => new Map(all3.map(s => [s, src.get(s)!]));
            const [a, b, c] = [demeanedRanks(pick(mom)), demeanedRanks(pick(lowVol)), demeanedRanks(pick(resid))];
            const combined = new Map(all3.map(s => [s, (a.get(s)! + b.get(s)! + c.get(s)!) / 3]));
            emitTop('MULTIFACTOR', combined, isMonthEnd, 1, (s, v) => `rank score ${v.toFixed(0)} (momentum ${a.get(s)!.toFixed(0)}, low vol ${b.get(s)!.toFixed(0)}, residual ${c.get(s)!.toFixed(0)})`);
        }

        // §3.9 industry-neutral mean-reversion over 5 sessions.
        const rev = new Map<string, number[]>();
        const ret5 = new Map<string, number>();
        for (const { p, i } of today) {
            if (p.stock.industry === 'Unknown' || i < 5 || !(p.closes[i - 5] > 0)) continue;
            const r = Math.log(p.closes[i] / p.closes[i - 5]);
            ret5.set(p.stock.symbol, r);
            const list = rev.get(p.stock.industry) ?? [];
            list.push(r);
            rev.set(p.stock.industry, list);
        }
        const demeaned = new Map<string, number>();
        for (const [symbol, r] of ret5) {
            const peers = rev.get(ref.get(symbol)!.p.stock.industry)!;
            if (peers.length < 5) continue;
            demeaned.set(symbol, -(r - peers.reduce((s, v) => s + v, 0) / peers.length));
        }
        for (const [symbol, score] of topFraction(demeaned)) {
            if (!(score > 0)) continue;
            const { i } = ref.get(symbol)!;
            add('INDUSTRY_REVERSION', symbol, i, { score, exit: { stopPct: null, targetPct: null, horizon: 5 }, rebalanceDay: true, reason: `5-day return ${fmtPct(-score)} vs its industry` });
        }

        // §4.4 IBS.
        const ibsValues = new Map<string, number>();
        for (const { p, i } of today) { const v = ibs(p.stock.bars[i]); if (v !== null) ibsValues.set(p.stock.symbol, -v); }
        for (const [symbol, score] of topFraction(ibsValues)) {
            const { i } = ref.get(symbol)!;
            add('IBS', symbol, i, { score, exit: { stopPct: null, targetPct: null, horizon: 1 }, rebalanceDay: true, reason: `closed ${(-100 * score).toFixed(0)}% up the day's range` });
        }

        // §3.11–3.15 and §3.17: single-stock signals.
        for (const { p, i } of today) {
            const { bars } = p.stock;
            const c = p.closes;
            const s = p.sma;
            const symbol = p.stock.symbol;
            const liquidity = p.turnover20[i];
            if (!Number.isFinite(liquidity)) continue;
            if (Number.isFinite(s[50][i - 1]) && c[i] > s[50][i] && c[i - 1] <= s[50][i - 1]) {
                add('MA_SINGLE', symbol, i, { score: liquidity, exit: { stopPct: null, targetPct: null, horizon: 60, trailSma: 50 }, rebalanceDay: true, reason: 'closed above its 50-day average' });
            }
            if (Number.isFinite(s[30][i - 1]) && s[10][i] > s[30][i] && s[10][i - 1] <= s[30][i - 1]) {
                add('MA_TWO', symbol, i, { score: liquidity, exit: { stopPct: null, targetPct: null, horizon: 60, exitWhen: k => s[10][k] < s[30][k] || c[k] < 0.98 * c[k - 1] }, rebalanceDay: true, reason: '10-day average crossed above the 30-day' });
            }
            const lined = (k: number) => s[3][k] > s[10][k] && s[10][k] > s[21][k];
            if (Number.isFinite(s[21][i - 1]) && lined(i) && !lined(i - 1)) {
                add('MA_THREE', symbol, i, { score: liquidity, exit: { stopPct: null, targetPct: null, horizon: 60, exitWhen: k => s[3][k] <= s[10][k] }, rebalanceDay: true, reason: '3, 10 and 21-day averages lined up' });
            }
            if (i >= 2) {
                const pivot = (k: number) => (bars[k - 1].high + bars[k - 1].low + bars[k - 1].close) / 3;
                if (c[i] > pivot(i) && c[i - 1] <= pivot(i - 1)) {
                    add('PIVOT', symbol, i, { score: liquidity, exit: { stopPct: null, targetPct: null, horizon: 20, exitWhen: k => c[k] >= 2 * pivot(k) - bars[k - 1].low }, rebalanceDay: true, reason: `closed above the pivot ${pivot(i).toFixed(2)}` });
                }
            }
            if (i >= 21) {
                const prior = (k: number) => c.slice(k - 20, k);
                if (c[i] <= Math.min(...prior(i))) {
                    add('DONCHIAN', symbol, i, { score: liquidity, exit: { stopPct: null, targetPct: null, horizon: 60, exitWhen: k => k >= 20 && c[k] >= Math.max(...prior(k)) }, rebalanceDay: true, reason: 'closed at the 20-day channel floor' });
                }
            }
            if (!p.knnFeat) p.knnFeat = knnFeatures(bars);
            const y = knnPredict(bars, p.knnFeat, i);
            if (y !== null && 100 * y > COST_PCT) {
                add('KNN', symbol, i, { score: y, exit: { stopPct: null, targetPct: null, horizon: KNN.horizon }, rebalanceDay: true, reason: `nearest-neighbour forecast ${fmtPct(y)} over 10 sessions` });
            }
        }

        // §4.1.1 + §4.1.2 dual-momentum industry rotation.
        if (niftyAbove200.get(date)) {
            const ranked = new Map<string, number>();
            for (const [industry, levels] of industryLevel) {
                if ((byIndustry.get(industry)?.length ?? 0) < 5 || levels.length <= 126) continue;
                ranked.set(industry, levels[levels.length - 1] / levels[levels.length - 127] - 1);
            }
            const chosen = topFraction(ranked, Math.max(TOP_FRACTION, ranked.size ? 2 / ranked.size : 0));
            const keep = new Map(chosen.filter(([industry]) => {
                const levels = industryLevel.get(industry)!;
                const ma = levels.slice(-100).reduce((s, v) => s + v, 0) / 100;
                return levels[levels.length - 1] > ma;
            }));
            for (const { p, i } of today) {
                const ret = keep.get(p.stock.industry);
                if (ret === undefined) continue;
                const exit = monthly(p.stock.bars, i, 1);
                add('DUAL_MOMENTUM', p.stock.symbol, i, { score: ret, exit, rebalanceDay: isMonthEnd && exit.horizon > 0, reason: `${p.stock.industry} up ${fmtPct(ret)} over 6 months` });
            }
        }
    }
    return out;
}
