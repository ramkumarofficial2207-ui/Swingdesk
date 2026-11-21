import prisma from './prismaClient';
import { loadAdjustedDailySeries } from './adjustedCandles';
import { PriceBar } from './corporateActions';
import { ExitPlan } from './research/harness';
import { demeanedRanks, momentum12_1, residualMomentum } from './research/paper151/baselines';
import { loadResultEvents, ResultEvent } from './research/cards/earningsSurprise';
import { loadIndustries } from './research/studyRunner';

/**
 * Monthly top-5 picks (forward paper test, never orders).
 *
 * On the first trading session of each month, every universe stock gets a combined
 * score = average demeaned rank of 12-1 momentum, residual momentum and (when it reported
 * in the last 100 days) its earnings surprise. The top 5 (at most 2 per industry) are
 * paper-bought at the next open. Five random universe stocks, chosen the same day with
 * a seed fixed by the date, are the control. Each set is tracked with two exits.
 */

export const TOP_PICKS = { count: 5, perIndustry: 2, sueMaxAgeDays: 100, historyDays: 1000 } as const;
export const TOP_EXITS: Record<'HOLD' | 'RATCHET', ExitPlan> = {
    HOLD: { stopPct: null, targetPct: null, horizon: 21 },
    RATCHET: { stopPct: 5.5, targetPct: 8.5, horizon: 15, ratchet: [{ at: 3.5, stopTo: 0 }, { at: 4.5, stopTo: 2.5 }, { at: 7, stopTo: 4.75 }] },
};

export interface ScoredStock {
    symbol: string;
    industry: string;
    momentum: number;
    residual: number;
    sue: number | null;
    score: number;
}

/** Pure: combined rank score. SUE ranks only among stocks with a recent result; others count as average (0). */
export function combineScores(rows: Array<Omit<ScoredStock, 'score'>>): ScoredStock[] {
    const mom = demeanedRanks(new Map(rows.map(r => [r.symbol, r.momentum])));
    const res = demeanedRanks(new Map(rows.map(r => [r.symbol, r.residual])));
    const withSue = rows.filter(r => r.sue !== null);
    // Scale SUE ranks to the same spread as the full-universe ranks.
    const sueRaw = demeanedRanks(new Map(withSue.map(r => [r.symbol, r.sue!])));
    const scale = withSue.length > 1 ? (rows.length - 1) / (withSue.length - 1) : 0;
    return rows.map(r => ({ ...r, score: (mom.get(r.symbol)! + res.get(r.symbol)! + (sueRaw.get(r.symbol) ?? 0) * scale) / 3 }));
}

/** Pure: top N by score with an industry cap. */
export function pickTop(scored: ScoredStock[], count: number = TOP_PICKS.count, perIndustry: number = TOP_PICKS.perIndustry): ScoredStock[] {
    const out: ScoredStock[] = [];
    const used = new Map<string, number>();
    for (const s of [...scored].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))) {
        const key = s.industry === 'Unknown' ? `?${s.symbol}` : s.industry;
        if ((used.get(key) ?? 0) >= perIndustry) continue;
        out.push(s);
        used.set(key, (used.get(key) ?? 0) + 1);
        if (out.length === count) break;
    }
    return out;
}

/** Pure: deterministic "random" sample seeded by the date (same date → same stocks). */
export function seededSample<T>(items: T[], count: number, seed: string): T[] {
    let h = 2166136261;
    for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rand = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy.slice(0, count);
}

/** Latest SUE per symbol announced in the window ending on `date` (inclusive). */
export function recentSurprise(events: ResultEvent[], date: string, maxAgeDays: number = TOP_PICKS.sueMaxAgeDays): Map<string, number> {
    const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
    const out = new Map<string, { date: string; sue: number }>();
    for (const e of events) {
        if (e.eventDate > date || e.eventDate < from) continue;
        const known = out.get(e.symbol);
        if (!known || e.eventDate > known.date) out.set(e.symbol, { date: e.eventDate, sue: e.sue });
    }
    return new Map([...out].map(([s, v]) => [s, v.sue]));
}

/** True when `date` is the first NSE session of its month (NIFTY 50 candles). */
export async function isFirstSessionOfMonth(date: string): Promise<boolean> {
    const monthStart = `${date.slice(0, 7)}-01`;
    const earlier = await prisma.dailyCandle.count({ where: { symbol: 'NIFTY_50', isFinal: true, tradingDate: { gte: new Date(`${monthStart}T00:00:00Z`), lt: new Date(`${date}T00:00:00Z`) } } });
    const today = await prisma.dailyCandle.count({ where: { symbol: 'NIFTY_50', isFinal: true, tradingDate: new Date(`${date}T00:00:00Z`) } });
    return today > 0 && earlier === 0;
}

export async function scoreUniverse(date: string, symbols: string[]): Promise<{ scored: ScoredStock[]; bars: Map<string, PriceBar[]> }> {
    const to = new Date(`${date}T00:00:00Z`);
    const from = new Date(to.getTime() - TOP_PICKS.historyDays * 86_400_000);
    const nifty = (await loadAdjustedDailySeries('NIFTY_50', { from, to })).bars;
    const niftyClose = new Map(nifty.map(b => [b.date, b.close]));
    const industries = loadIndustries();
    const sue = recentSurprise(await loadResultEvents(), date);
    const rows: Array<Omit<ScoredStock, 'score'>> = [];
    const bars = new Map<string, PriceBar[]>();
    for (const symbol of symbols) {
        const series = (await loadAdjustedDailySeries(symbol, { from, to })).bars;
        const i = series.length - 1;
        if (i < 0 || series[i].date !== date) continue;
        const momentum = momentum12_1(series, i);
        const residual = residualMomentum(series, i, d => niftyClose.get(d));
        if (momentum === null || residual === null) continue;
        bars.set(symbol, series);
        rows.push({ symbol, industry: industries.get(symbol) ?? 'Unknown', momentum, residual, sue: sue.get(symbol) ?? null });
    }
    return { scored: combineScores(rows), bars };
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(0)}%`;

/** Record this month's top-5 and random-5 paper picks (safe to re-run). Returns how many were added. */
export async function recordTopPicks(date: string, universe: string[], force = false): Promise<number> {
    if (!force && !(await isFirstSessionOfMonth(date))) return 0;
    const already = await prisma.autoPaperTrade.count({ where: { strategy: { in: ['TOP5_HOLD', 'TOP5_RATCHET'] }, signalDate: { gte: new Date(`${date.slice(0, 7)}-01T00:00:00Z`) } } });
    if (already) return 0;
    const { scored, bars } = await scoreUniverse(date, universe);
    if (scored.length < 100) throw new Error(`Only ${scored.length} stocks could be scored on ${date}.`);
    const top = pickTop(scored);
    const random = seededSample([...scored].sort((a, b) => a.symbol.localeCompare(b.symbol)), TOP_PICKS.count, date);
    const closeOf = (s: string) => bars.get(s)!.at(-1)!.close;
    const rows = [
        ...top.flatMap((s, k) => (['TOP5_HOLD', 'TOP5_RATCHET'] as const).map(strategy => ({ strategy, s, k, reason: `Rank score ${s.score.toFixed(0)}: 12-1 momentum ${pct(s.momentum)}, residual ${s.residual.toFixed(2)}${s.sue === null ? ', no recent result' : `, earnings surprise ${s.sue.toFixed(1)}`}` }))),
        ...random.flatMap((s, k) => (['RANDOM5_HOLD', 'RANDOM5_RATCHET'] as const).map(strategy => ({ strategy, s, k, reason: 'Random universe stock (control)' }))),
    ];
    for (const { strategy, s, k, reason } of rows) {
        await prisma.autoPaperTrade.upsert({
            where: { strategy_symbol_signalDate: { strategy, symbol: s.symbol, signalDate: new Date(`${date}T00:00:00Z`) } },
            create: { strategy, symbol: s.symbol, signalDate: new Date(`${date}T00:00:00Z`), rank: k + 1, score: s.score, reason, signalClose: closeOf(s.symbol), state: 'PENDING' },
            update: {},
        });
    }
    return rows.length;
}
