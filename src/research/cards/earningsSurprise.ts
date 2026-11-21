import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { PriceBar } from '../../corporateActions';
import { ExitPlan } from '../harness';
import { loadStudyData, runSetupStudy, SetupCard, StudyResult } from '../studyRunner';

/**
 * Earnings surprise (§3.2 of "151 Trading Strategies"): reports/earnings-surprise-plan.md.
 *   npm run research:earnings-surprise
 */

export const SUE_RULES = { minDiffs: 6, diffs: 8, maxDaysAfterQuarter: 75, lookbackDays: 365, minPeerEvents: 100, topFraction: 0.1 } as const;

export interface QuarterRow { periodEnd: string; netProfit: number | null; }

/**
 * Standardized unexpected earnings for the latest quarter in `quarters` (ascending, one per
 * quarter end): (P_q − P_{q−4}) ÷ sd of (P_k − P_{k−4}) over the 8 quarters before q.
 * Uses company net profit (not EPS) so bonuses and splits do not distort it.
 */
export function standardizedSurprise(quarters: QuarterRow[]): number | null {
    const byEnd = new Map(quarters.map(q => [q.periodEnd, q.netProfit]));
    const shift = (end: string, back: number) => {
        const d = new Date(`${end}T00:00:00Z`);
        const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3 * back + 1, 0));
        return target.toISOString().slice(0, 10);
    };
    const latest = quarters[quarters.length - 1];
    if (!latest) return null;
    const diff = (end: string) => {
        const now = byEnd.get(end);
        const ago = byEnd.get(shift(end, 4));
        return now === null || now === undefined || ago === null || ago === undefined ? null : now - ago;
    };
    const current = diff(latest.periodEnd);
    if (current === null) return null;
    const history: number[] = [];
    for (let k = 1; k <= SUE_RULES.diffs; k += 1) { const v = diff(shift(latest.periodEnd, k)); if (v !== null) history.push(v); }
    if (history.length < SUE_RULES.minDiffs) return null;
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    const sd = Math.sqrt(history.reduce((s, v) => s + (v - mean) ** 2, 0) / (history.length - 1));
    return sd > 0 ? current / sd : null;
}

export interface ResultEvent { symbol: string; eventDate: string; sue: number; periodEnd: string }

/** Day the market learned the result (IST date): board-meeting day if known, else NSE's publish time. */
export function eventDay(periodEnd: string, publishedAt: Date, meetingDates: string[]): string | null {
    const published = new Date(publishedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
    const latest = new Date(new Date(`${periodEnd}T00:00:00Z`).getTime() + SUE_RULES.maxDaysAfterQuarter * 86_400_000).toISOString().slice(0, 10);
    const meeting = meetingDates.filter(d => d > periodEnd && d <= published && d <= latest).sort()[0];
    if (meeting) return meeting;
    return published <= latest ? published : null;
}

/** Point-in-time top-decile flag: SUE above the 90th percentile of the previous year's events. */
export function topDecile(events: ResultEvent[]): Array<ResultEvent & { threshold: number }> {
    const sorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.symbol.localeCompare(b.symbol));
    const out: Array<ResultEvent & { threshold: number }> = [];
    let start = 0;
    for (let i = 0; i < sorted.length; i += 1) {
        const e = sorted[i];
        const from = new Date(new Date(`${e.eventDate}T00:00:00Z`).getTime() - SUE_RULES.lookbackDays * 86_400_000).toISOString().slice(0, 10);
        while (start < i && sorted[start].eventDate < from) start += 1;
        const peers: number[] = [];
        for (let k = start; k < i && sorted[k].eventDate < e.eventDate; k += 1) peers.push(sorted[k].sue);
        if (peers.length < SUE_RULES.minPeerEvents) continue;
        peers.sort((a, b) => a - b);
        const threshold = peers[Math.floor((1 - SUE_RULES.topFraction) * (peers.length - 1))];
        if (e.sue > threshold) out.push({ ...e, threshold });
    }
    return out;
}

export async function loadResultEvents(): Promise<ResultEvent[]> {
    const rows = await prisma.quarterlyResult.findMany({ where: { parseStatus: 'OK' }, orderBy: [{ symbol: 'asc' }, { periodEnd: 'asc' }], select: { symbol: true, periodEnd: true, netProfit: true, publishedAt: true } });
    const meetings = await prisma.resultsEvent.findMany({ select: { symbol: true, meetingDate: true } });
    const meetingsBy = new Map<string, string[]>();
    for (const m of meetings) { const list = meetingsBy.get(m.symbol) ?? []; list.push(m.meetingDate.toISOString().slice(0, 10)); meetingsBy.set(m.symbol, list); }
    const bySymbol = new Map<string, typeof rows>();
    for (const r of rows) { const list = bySymbol.get(r.symbol) ?? []; list.push(r); bySymbol.set(r.symbol, list); }
    const events: ResultEvent[] = [];
    for (const [symbol, list] of bySymbol) {
        const quarters = list.map(r => ({ periodEnd: r.periodEnd.toISOString().slice(0, 10), netProfit: r.netProfit }));
        for (let k = 0; k < list.length; k += 1) {
            const sue = standardizedSurprise(quarters.slice(0, k + 1));
            if (sue === null) continue;
            const day = eventDay(quarters[k].periodEnd, list[k].publishedAt, meetingsBy.get(symbol) ?? []);
            if (day) events.push({ symbol, eventDate: day, sue, periodEnd: quarters[k].periodEnd });
        }
    }
    return events;
}

/** Signal bar: the last session on or before the event day (entry is the next open, after the release). */
export function signalIndex(bars: PriceBar[], eventDate: string): number {
    let lo = 0;
    let hi = bars.length - 1;
    let found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].date <= eventDate) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found;
}

export const OWN_EXIT: ExitPlan = { stopPct: null, targetPct: null, horizon: 126 };
export const RATCHET_EXIT: ExitPlan = { stopPct: 5.5, targetPct: 8.5, horizon: 15, ratchet: [{ at: 3.5, stopTo: 0 }, { at: 4.5, stopTo: 2.5 }, { at: 7, stopTo: 4.75 }] };

function card(id: 'own' | 'ratchet', top: Map<string, Map<string, number>>): SetupCard {
    const exit = id === 'own' ? OWN_EXIT : RATCHET_EXIT;
    let bySymbol = new Map<string, Map<number, number>>();
    return {
        id: `earnings-surprise-${id}`,
        name: `Earnings surprise (top 10% SUE) — ${id === 'own' ? 'hold 6 months (paper)' : 'ratcheting-stop swing'}`,
        plan: 'earnings-surprise-plan.md',
        thesis: 'Companies whose quarterly profit beats the same quarter last year by far more than usual keep outperforming for months (post-earnings drift).',
        discoveryStart: '2021-01-01',
        testYears: ['2024', '2025', '2026'],
        rules: id === 'own' ? { topN: 10, maxPositions: 50, maxPerSector: 50 } : { topN: 3, maxPositions: 15, maxPerSector: 2 },
        prepare: data => {
            bySymbol = new Map();
            for (const [symbol, { bars }] of data.series) {
                const hits = new Map<number, number>();
                for (const [date, sue] of top.get(symbol) ?? []) { const i = signalIndex(bars, date); if (i >= 0) hits.set(i, sue); }
                bySymbol.set(symbol, hits);
            }
        },
        signal: (_bars, _ind, i, ctx) => { const sue = bySymbol.get(ctx.symbol)?.get(i); return sue === undefined ? null : { score: sue, exit }; },
        // Control: every universe stock that reported results that day (any surprise), same exit.
        control: { label: 'all universe stocks reporting results the same day', include: () => true, exit },
    };
}

const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

async function main(): Promise<void> {
    const events = await loadResultEvents();
    const top = topDecile(events);
    const toMap = (list: ResultEvent[]) => {
        const m = new Map<string, Map<string, number>>();
        for (const e of list) { const inner = m.get(e.symbol) ?? new Map(); inner.set(e.eventDate, e.sue); m.set(e.symbol, inner); }
        return m;
    };
    const allDates = new Map<string, Set<string>>();
    for (const e of events) { const s = allDates.get(e.symbol) ?? new Set(); s.add(e.eventDate); allDates.set(e.symbol, s); }
    console.log(`[EarningsSurprise] ${events.length} results with a surprise score; ${top.length} in the point-in-time top 10%`);
    const data = await loadStudyData();
    const results: Array<{ id: 'own' | 'ratchet'; result: StudyResult }> = [];
    for (const id of ['own', 'ratchet'] as const) {
        const c = card(id, toMap(top));
        // Control: stocks whose results were announced for this same signal session.
        const reportedOn = new Map<string, Set<string>>();
        c.prepare = (base => (d: Parameters<NonNullable<SetupCard['prepare']>>[0]) => {
            base?.(d);
            for (const [symbol, { bars }] of d.series) {
                const dates = new Set<string>();
                for (const date of allDates.get(symbol) ?? []) { const i = signalIndex(bars, date); if (i >= 0) dates.add(bars[i].date); }
                reportedOn.set(symbol, dates);
            }
        })(c.prepare);
        c.control!.includeOn = (symbol, date) => reportedOn.get(symbol)?.has(date) ?? false;
        results.push({ id, result: await runSetupStudy(c, 'pre-registered', undefined, data) });
    }
    const byYear = new Map<string, number>();
    for (const e of events) byYear.set(e.eventDate.slice(0, 4), (byYear.get(e.eventDate.slice(0, 4)) ?? 0) + 1);
    const lines = [
        '# Earnings surprise (§3.2): results',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`earnings-surprise-plan.md\`](earnings-surprise-plan.md)`,
        '',
        `Results with a surprise score: ${events.length.toLocaleString('en-IN')} (${[...byYear].sort().map(([y, n]) => `${y}: ${n}`).join(', ')}); in the point-in-time top 10%: ${top.length.toLocaleString('en-IN')}.`,
        '',
        '| Rule | Discovery trades | Discovery avg | Test trades | Test win rate | Test avg net | Test per-day avg | Excess vs results-day control (test) | Excess (discovery) | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ id, result: r }) => `| [${id === 'own' ? 'Hold 6 months (paper)' : 'Ratcheting-stop swing'}](earnings-surprise-${id}.md) | ${r.discovery.n} | ${fmt(r.discovery.avg)} | ${r.test.n} | ${r.test.winRate.toFixed(1)}% | ${fmt(r.test.avg)} | ${fmt(r.test.dayClustered)} | ${r.excess ? fmt(r.excess.test.avg) : '—'} | ${r.excess ? fmt(r.excess.discovery.avg) : '—'} | ${r.passed ? '✅' : '❌'} |`),
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'earnings-surprise.md'), lines.join('\n'));
    console.log(`[EarningsSurprise] ${results.map(r => `${r.id}: ${r.result.passed ? 'PASS' : 'FAIL'}`).join(', ')}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[EarningsSurprise] failed:', error?.stack ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
