import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { PriceBar } from '../corporateActions';
import { parseCsvLine } from './recentGainers';
import { loadUniverse, TEST_START } from './studyData';

/**
 * npm run research:next-day-clues
 *
 * Exploration on the DISCOVERY period only (signals 2021-01-05 → 2023-12-29).
 * For every stock-day in the point-in-time top-500 universe, records clues
 * known at that day's close and what happened next (entry at the next open).
 * Used to choose the rules for a pre-registered study; the 2024+ test period
 * is never read here. Writes reports/next-day-clues-discovery.md.
 */

const DISCOVERY_START = '2021-01-05';
const COST_PCT = 0.4;

export interface ClueRow {
    date: string;
    symbol: string;
    industry: string;
    clues: Record<ClueId, boolean>;
    /** Today's close-to-close return; used for the sector-peer clue. */
    todayPct: number;
    /** Next session: open → close, % (enter at open, exit at close). */
    nextOpenToClosePct: number;
    /** Next session close vs today's close, % (used for top-gainer ranks). */
    nextClosePct: number;
    /** Open of next session → close 5 sessions later, %. */
    swing5Pct: number;
    /** Highest high in the 5 sessions from the next open reached +5% before the low hit -2.5% (conservative). */
    hit5First: boolean;
}

export const CLUES = [
    ['resultsToday', 'Results meeting today (may be released after the close)'],
    ['resultsTomorrow', 'Results meeting scheduled for the next session'],
    ['vol15', 'Volume today ≥ 1.5× 20-day average'],
    ['vol2', 'Volume today ≥ 2× 20-day average'],
    ['vol3', 'Volume today ≥ 3× 20-day average'],
    ['up3', 'Up ≥ 3% today'],
    ['up5', 'Up ≥ 5% today'],
    ['down3', 'Down ≥ 3% today'],
    ['strongClose', 'Closed in the top 10% of today\'s range'],
    ['prior5Up', 'Up ≥ 5% over the last 5 sessions'],
    ['prior5Down', 'Down ≥ 5% over the last 5 sessions'],
    ['nearHigh', 'Within 5% of 52-week high'],
    ['farBelowHigh', 'More than 25% below 52-week high'],
    ['aboveSma50', 'Close above 50-day average'],
    ['narrowRange', 'Narrowest range of the last 7 sessions (NR7)'],
    ['sectorHot', '≥ 4 same-industry stocks in today\'s top 30 gainers'],
] as const;
export type ClueId = typeof CLUES[number][0];

/** Clues computable from the stock's own bars at the close of day i (no future data). */
export function priceClues(bars: PriceBar[], i: number): Omit<Record<ClueId, boolean>, 'resultsToday' | 'resultsTomorrow' | 'sectorHot'> | null {
    if (i < 252 || i >= bars.length) return null;
    const bar = bars[i];
    const prev = bars[i - 1];
    if (!(prev.close > 0) || !(bar.close > 0)) return null;
    const avgVol = bars.slice(i - 20, i).reduce((sum, b) => sum + b.volume, 0) / 20;
    const volRatio = avgVol > 0 ? bar.volume / avgVol : 0;
    const today = (bar.close / prev.close - 1) * 100;
    const range = bar.high - bar.low;
    const prior5 = (bar.close / bars[i - 5].close - 1) * 100;
    const high252 = Math.max(...bars.slice(i - 251, i + 1).map(b => b.high));
    const sma50 = bars.slice(i - 49, i + 1).reduce((sum, b) => sum + b.close, 0) / 50;
    const ranges7 = bars.slice(i - 6, i).map(b => b.high - b.low);
    return {
        vol15: volRatio >= 1.5,
        vol2: volRatio >= 2,
        vol3: volRatio >= 3,
        up3: today >= 3,
        up5: today >= 5,
        down3: today <= -3,
        strongClose: range > 0 && bar.close >= bar.high - 0.1 * range,
        prior5Up: prior5 >= 5,
        prior5Down: prior5 <= -5,
        nearHigh: bar.close >= high252 * 0.95,
        farBelowHigh: bar.close < high252 * 0.75,
        aboveSma50: bar.close > sma50,
        narrowRange: range > 0 && range < Math.min(...ranges7),
    };
}

/** Outcomes after day i, entering at the open of i+1. Null if 5 sessions are not available. */
export function forwardOutcome(bars: PriceBar[], i: number): Pick<ClueRow, 'nextOpenToClosePct' | 'nextClosePct' | 'swing5Pct' | 'hit5First'> | null {
    if (i + 5 >= bars.length) return null;
    const entry = bars[i + 1].open;
    if (!(entry > 0)) return null;
    let hit5First = false;
    for (let k = i + 1; k <= i + 5; k += 1) {
        // Conservative: a bar touching both levels counts as the stop.
        if (bars[k].low <= entry * 0.975) break;
        if (bars[k].high >= entry * 1.05) { hit5First = true; break; }
    }
    return {
        nextOpenToClosePct: (bars[i + 1].close / entry - 1) * 100,
        nextClosePct: (bars[i + 1].close / bars[i].close - 1) * 100,
        swing5Pct: (bars[i + 5].close / entry - 1) * 100,
        hit5First,
    };
}

function sortedDates(list: string[]): string[] { return [...new Set(list)].sort(); }

function anyBetween(sorted: string[] | undefined, after: string, upTo: string): boolean {
    if (!sorted) return false;
    return sorted.some(date => date > after && date <= upTo);
}

async function main(): Promise<void> {
    const universe = await loadUniverse();
    const csv = readFileSync(join('data', 'nifty500-constituents.csv'), 'utf8').trim().split(/\r?\n/).map(parseCsvLine);
    const header = csv[0].map(value => value.toLowerCase());
    const industryOf = new Map(csv.slice(1).map(cols => [cols[header.indexOf('symbol')], cols[header.indexOf('industry')] || 'Unknown']));
    const events = await prisma.resultsEvent.findMany({ select: { symbol: true, meetingDate: true } });
    const results = new Map<string, string[]>();
    for (const event of events) {
        const list = results.get(event.symbol) ?? [];
        list.push(event.meetingDate.toISOString().slice(0, 10));
        results.set(event.symbol, list);
    }
    for (const [symbol, list] of results) results.set(symbol, sortedDates(list));

    const rows: ClueRow[] = [];
    let symbols = 0;
    for (const [symbol, eligible] of universe) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        if (bars.length < 260) continue;
        symbols += 1;
        for (let i = 252; i < bars.length - 5; i += 1) {
            const date = bars[i].date;
            if (date < DISCOVERY_START || date >= TEST_START || !eligible.has(date)) continue;
            const price = priceClues(bars, i);
            const outcome = forwardOutcome(bars, i);
            if (!price || !outcome) continue;
            rows.push({
                date,
                symbol,
                industry: industryOf.get(symbol) ?? 'Unknown',
                todayPct: (bars[i].close / bars[i - 1].close - 1) * 100,
                clues: {
                    ...price,
                    resultsToday: anyBetween(results.get(symbol), bars[i - 1].date, date),
                    resultsTomorrow: anyBetween(results.get(symbol), date, bars[i + 1].date),
                    sectorHot: false,
                },
                ...outcome,
            });
        }
    }

    // Per-day ranks: sector heat today (known at close) and next-day top-10 membership (outcome).
    const byDate = new Map<string, ClueRow[]>();
    for (const row of rows) { const list = byDate.get(row.date) ?? []; list.push(row); byDate.set(row.date, list); }
    const nextTop10 = new Set<ClueRow>();
    for (const list of byDate.values()) {
        const top30 = [...list].sort((a, b) => b.todayPct - a.todayPct).slice(0, 30);
        const counts = new Map<string, number>();
        for (const row of top30) if (row.industry !== 'Unknown') counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
        for (const row of list) row.clues.sectorHot = (counts.get(row.industry) ?? 0) >= 4;
        for (const row of [...list].sort((a, b) => b.nextClosePct - a.nextClosePct).slice(0, 10)) nextTop10.add(row);
    }

    const stat = (subset: ClueRow[]) => {
        const n = subset.length;
        const mean = (f: (row: ClueRow) => number) => subset.reduce((sum, row) => sum + f(row), 0) / Math.max(1, n);
        const sd = (f: (row: ClueRow) => number) => { const m = mean(f); return Math.sqrt(subset.reduce((s, row) => s + (f(row) - m) ** 2, 0) / Math.max(1, n - 1)); };
        return {
            n,
            top10: subset.filter(row => nextTop10.has(row)).length / Math.max(1, n),
            oc: mean(row => row.nextOpenToClosePct),
            swing: mean(row => row.swing5Pct),
            swingCi: 1.96 * sd(row => row.swing5Pct) / Math.sqrt(Math.max(1, n)),
            hit: subset.filter(row => row.hit5First).length / Math.max(1, n),
        };
    };
    const base = stat(rows);
    const fmt = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
    const line = (name: string, subset: ClueRow[]) => {
        const s = stat(subset);
        return `| ${name} | ${s.n.toLocaleString('en-IN')} | ${(base.top10 ? s.top10 / base.top10 : 0).toFixed(1)}× | ${fmt(s.oc - COST_PCT)} | ${fmt(s.swing - COST_PCT)} ± ${s.swingCi.toFixed(2)} | ${(100 * s.hit).toFixed(1)}% |`;
    };
    const has = (...ids: ClueId[]) => rows.filter(row => ids.every(id => row.clues[id]));
    const combos: Array<[string, ClueId[]]> = [
        ['Volume ≥ 2× + up ≥ 3% + strong close', ['vol2', 'up3', 'strongClose']],
        ['Volume ≥ 2× + up ≥ 3% + strong close + above 50-day', ['vol2', 'up3', 'strongClose', 'aboveSma50']],
        ['Volume ≥ 2× + up ≥ 3% + near 52-week high', ['vol2', 'up3', 'nearHigh']],
        ['Volume ≥ 3× + up ≥ 5%', ['vol3', 'up5']],
        ['Results today + up ≥ 3% + volume ≥ 2×', ['resultsToday', 'up3', 'vol2']],
        ['Results tomorrow + above 50-day', ['resultsTomorrow', 'aboveSma50']],
        ['NR7 + above 50-day + near 52-week high', ['narrowRange', 'aboveSma50', 'nearHigh']],
        ['Sector hot + up ≥ 3% + strong close', ['sectorHot', 'up3', 'strongClose']],
        ['Down ≥ 3% + down ≥ 5% over 5 days + above 50-day', ['down3', 'prior5Down', 'aboveSma50']],
    ];

    const lines = [
        '# Next-day movers: clue scan (discovery period only)',
        '',
        `Generated: ${new Date().toISOString()} · signals ${DISCOVERY_START} → 2023-12-29 · point-in-time top-500 universe · ${symbols} symbols · ${rows.length.toLocaleString('en-IN')} stock-days.`,
        '',
        'Exploration to choose rules for a pre-registered study. **The 2024–26 test period was not read.** All clues are known at the close; entry is the next open. Returns are net of 0.4% round-trip costs.',
        '',
        '- **Top-10 lift**: how much more often the stock is among the next day\'s 10 biggest gainers than an average stock.',
        '- **Next day**: open → close of the next session.',
        '- **5-day swing**: next open → close 5 sessions later (± 95% range).',
        '- **+5% first**: reached +5% before −2.5% within 5 sessions (a bar touching both counts as −2.5%).',
        '',
        '| Clue | Stock-days | Top-10 lift | Next day (net) | 5-day swing (net) | +5% first |',
        '|---|---:|---:|---:|---:|---:|',
        line('**All stocks (baseline)**', rows),
        ...CLUES.map(([id, label]) => line(label, has(id))),
        '| **Combinations** | | | | | |',
        ...combos.map(([label, ids]) => line(label, has(...ids))),
        '',
        'Research output, not investment advice.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'next-day-clues-discovery.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[Clues] ${rows.length} discovery stock-days. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Clues] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
