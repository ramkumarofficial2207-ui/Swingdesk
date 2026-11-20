import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { PriceBar } from '../corporateActions';
import { HarnessTrade, simulateTrade, TradeStats, tradeStats } from './harness';
import { loadUniverse } from './studyData';

/**
 * Score the setups the scanner recorded live (Railway backup), per
 * reports/live-setups-scoring-plan.md.
 *   npm run research:score-live-setups -- --dir=data/backups/railway-apex-db-2026-11-19
 */

const COST_BPS = 40;
const L1_HOLD = 5;
const L2_WINDOW = 5;
const L2_HOLD = 10;
const L2_VOLUME = 1.5;

export interface LiveSetup { ticker: string; setupType: string; createdAtUtc: string; entry: number; stop: number; target: number }

/** IST date and minutes after midnight for a UTC timestamp like '2026-08-04 03:46:01.139'. */
export function istParts(createdAtUtc: string): { date: string; minutes: number } {
    const t = new Date(`${createdAtUtc.replace(' ', 'T')}Z`).getTime() + 5.5 * 3_600_000;
    const d = new Date(t);
    return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** First bar whose open comes after the setup was created (before 09:15 IST → that day's open, else the next session). */
export function firstFillIndex(bars: PriceBar[], createdAtUtc: string): number {
    const { date, minutes } = istParts(createdAtUtc);
    const beforeOpen = minutes < 9 * 60 + 15;
    return bars.findIndex(bar => (beforeOpen ? bar.date >= date : bar.date > date));
}

/** L2 trigger: a close ≥ entry on volume ≥ 1.5× its 20-day average within the window; returns the trigger bar index or -1. */
export function closeConfirmedTrigger(bars: PriceBar[], from: number, entry: number, window = L2_WINDOW, volumeMultiple = L2_VOLUME): number {
    for (let k = from; k < Math.min(bars.length, from + window); k += 1) {
        if (k < 20) continue;
        const avg = bars.slice(k - 20, k).reduce((s, b) => s + b.volume, 0) / 20;
        if (bars[k].close >= entry && avg > 0 && bars[k].volume >= volumeMultiple * avg) return k;
    }
    return -1;
}

interface Scored { setup: LiveSetup; trade: HarnessTrade }

function nonOverlapping(rows: Scored[]): Scored[] {
    const busy = new Map<string, string>();
    const kept: Scored[] = [];
    for (const row of [...rows].sort((a, b) => a.trade.entryDate.localeCompare(b.trade.entryDate))) {
        const until = busy.get(row.setup.ticker);
        if (until && row.trade.entryDate <= until) continue;
        kept.push(row);
        busy.set(row.setup.ticker, row.trade.exitDate);
    }
    return kept;
}

const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

async function main(): Promise<void> {
    const dir = process.argv.find(a => a.startsWith('--dir='))?.split('=')[1] ?? 'data/backups/railway-apex-db-2026-11-19';
    const raw = parse(readFileSync(join(dir, 'HistoricalSetup.csv')), { columns: true }) as any[];
    const setups: LiveSetup[] = raw.map(r => ({ ticker: r.ticker, setupType: r.setupType, createdAtUtc: r.createdAt, entry: Number(r.entryPrice), stop: Number(r.stopLoss), target: Number(r.targetPrice) }));

    const bars = new Map<string, PriceBar[]>();
    const counts = { setups: setups.length, noPrices: 0, l2NoTrigger: 0, l2SkippedLevels: 0 };
    const l1: Scored[] = [];
    const l2: Scored[] = [];
    for (const setup of setups) {
        if (!bars.has(setup.ticker)) bars.set(setup.ticker, (await loadAdjustedDailySeries(setup.ticker)).bars);
        const series = bars.get(setup.ticker)!;
        const k0 = firstFillIndex(series, setup.createdAtUtc);
        if (k0 < 0 || !series.length) { counts.noPrices += 1; continue; }
        const t1 = simulateTrade(series, k0, { stopPct: null, targetPct: null, horizon: L1_HOLD }, COST_BPS);
        if (t1) l1.push({ setup, trade: { symbol: setup.ticker, industry: setup.setupType, signalDate: t1.entryDate, ...t1 } });

        const trig = closeConfirmedTrigger(series, k0, setup.entry);
        if (trig < 0 || trig + 1 >= series.length) { counts.l2NoTrigger += 1; continue; }
        const fill = series[trig + 1].open;
        if (!(fill > setup.stop) || !(fill < setup.target)) { counts.l2SkippedLevels += 1; continue; }
        const t2 = simulateTrade(series, trig + 1, { stopPct: (1 - setup.stop / fill) * 100, targetPct: (setup.target / fill - 1) * 100, horizon: L2_HOLD }, COST_BPS);
        if (t2) l2.push({ setup, trade: { symbol: setup.ticker, industry: setup.setupType, signalDate: t2.entryDate, ...t2 } });
    }
    const L1 = nonOverlapping(l1);
    const L2 = nonOverlapping(l2);

    // Control: every top-500 universe stock bought at the same open, held 5 sessions.
    const fillDates = new Set([...L1, ...L2].map(r => r.trade.entryDate));
    const universe = await loadUniverse();
    const controlSum = new Map<string, { s: number; n: number }>();
    for (const [symbol, eligible] of universe) {
        const series = (await loadAdjustedDailySeries(symbol)).bars;
        const at = new Map(series.map((b, k) => [b.date, k]));
        for (const date of fillDates) {
            const k = at.get(date);
            if (k === undefined || k < 1 || !eligible.has(series[k - 1].date)) continue;
            const t = simulateTrade(series, k, { stopPct: null, targetPct: null, horizon: L1_HOLD }, COST_BPS);
            if (!t) continue;
            const c = controlSum.get(date) ?? { s: 0, n: 0 };
            c.s += t.netPct; c.n += 1; controlSum.set(date, c);
        }
    }
    const control = new Map([...controlSum].map(([d, c]) => [d, c.s / c.n]));
    const excess = (rows: Scored[]) => {
        const xs = rows.filter(r => control.has(r.trade.entryDate)).map(r => r.trade.netPct - control.get(r.trade.entryDate)!);
        return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
    };
    const row = (label: string, rows: Scored[]) => {
        const s: TradeStats = tradeStats(rows.map(r => r.trade));
        return `| ${label} | ${s.n} | ${s.days} | ${s.winRate.toFixed(1)}% | ${fmt(s.avg)} ± ${s.ci.toFixed(2)} | ${fmt(s.dayClustered)} | ${Number.isFinite(excess(rows)) ? fmt(excess(rows)) : '—'} |`;
    };
    const head = '| Group | Trades | Fill days | Win rate | Avg net (95% range) | Per-day avg | Excess vs control |\n|---|---:|---:|---:|---:|---:|---:|';
    const byType = (rows: Scored[]) => {
        const types = new Map<string, Scored[]>();
        for (const r of rows) { const l = types.get(r.setup.setupType) ?? []; l.push(r); types.set(r.setup.setupType, l); }
        return [...types].filter(([, l]) => l.length >= 10).sort((a, b) => b[1].length - a[1].length).map(([t, l]) => row(t, l));
    };
    const ctrlAll = [...control.values()];
    const l2Outcomes = (o: string) => L2.filter(r => r.trade.outcome === o).length;
    const lines = [
        '# Live setups (Aug–Oct 2026): scored',
        '',
        `Generated: ${new Date().toISOString()} · rules: [\`live-setups-scoring-plan.md\`](live-setups-scoring-plan.md) (committed before scoring) · source: Railway production backup.`,
        '',
        `Setups recorded live: ${counts.setups} (2026-08-03 → 2026-10-16). No local prices: ${counts.noPrices}. L2: never triggered ${counts.l2NoTrigger}, skipped because the fill was past the stop or target ${counts.l2SkippedLevels}. One position per stock at a time.`,
        '',
        `Control (average top-500 stock bought at the same opens, held 5 sessions): ${ctrlAll.length ? fmt(ctrlAll.reduce((s, v) => s + v, 0) / ctrlAll.length) : '—'} per fill day.`,
        '',
        '## Overall',
        '',
        head,
        row('**L1** Buy at the next open, hold 5 sessions', L1),
        row('**L2** App\'s plan: close-confirmed trigger, own stop/target, ≤ 10 sessions', L2),
        '',
        `L2 exits: target ${l2Outcomes('TARGET')}, stop ${l2Outcomes('STOP')}, time ${l2Outcomes('TIME')}.`,
        '',
        '## L1 by setup type (≥ 10 trades)',
        '',
        head,
        ...byType(L1),
        '',
        '## L2 by setup type (≥ 10 trades)',
        '',
        head,
        ...byType(L2),
        '',
        'A small live sample from one 2.5-month period: it can show the picks did not work, not prove that they do. Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'live-setups-scoring.md'), lines.join('\n'));
    console.log(`[Live] L1 n=${L1.length}, L2 n=${L2.length}. Report: reports/live-setups-scoring.md`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Live] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
