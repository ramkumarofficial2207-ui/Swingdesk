import 'dotenv/config';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { PriceBar } from '../corporateActions';
import { computeSeriesIndicators } from './momentumPullback';
import { priceClues } from './nextDayClues';
import { isUptrendDip } from './uptrendDip';

/**
 * Forward paper check: freeze a list of picks at a close, then score it later.
 *
 *   npm run research:forward-check -- --make --date=2026-11-19
 *   npm run research:forward-check -- --check --date=2026-11-19
 *
 * Picks come only from fixed rules (no hand-picking). Entry is the next
 * session's open; results are shown after 1, 2 and 3 sessions, net of 0.4%
 * round-trip costs, against the average universe stock and NIFTY 50.
 * Research output, not investment advice.
 */

const COST_PCT = 0.4;
const SESSIONS = 3;

interface Frozen {
    signalDate: string;
    createdAt: string;
    lists: Record<string, string[]>;
    universe: string[];
}

const LIST_RULES: Record<string, string> = {
    dip: 'Uptrend dip: down ≥ 3% today, down ≥ 5% over 5 sessions, close above 50-day average (best pooled result in reports/uptrend-dip.md, but FAILED the day-clustered rule).',
    surge: 'Volume surge: volume ≥ 2× 20-day average, up ≥ 3% today, close in top 10% of the range (4.3× more likely to be a next-day top-10 gainer in 2021–23, but did not make money after costs).',
};

async function topUniverse(date: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string }>>`
        WITH t AS (
            SELECT c.symbol, c."tradingDate" AS d, AVG(c."turnoverCr") OVER w AS t20, COUNT(c."turnoverCr") OVER w AS cnt
            FROM "DailyCandle" c JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%' AND c."tradingDate" BETWEEN (${date}::date - 45) AND ${date}::date
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        )
        SELECT symbol FROM t WHERE d = ${date}::date AND cnt = 20 ORDER BY t20 DESC LIMIT 500`;
    return rows.map(row => row.symbol);
}

export const FORWARD_DIR = join('reports', 'forward-checks');

/** Frozen lists live in reports/forward-checks/ (the first one, 2026-11-19, was committed to reports/). */
function path(date: string, ext: string): string {
    const legacy = join('reports', `forward-check-${date}.${ext}`);
    return existsSync(legacy) ? legacy : join(FORWARD_DIR, `forward-check-${date}.${ext}`);
}

export function isFrozen(date: string): boolean {
    return existsSync(path(date, 'json'));
}

export function frozenDates(): string[] {
    const fromDir = existsSync(FORWARD_DIR) ? readdirSync(FORWARD_DIR) : [];
    const names = [...fromDir, ...readdirSync('reports')];
    return [...new Set(names.map(name => /^forward-check-(d{4}-d{2}-d{2}).json$/.exec(name)?.[1]).filter((d): d is string => !!d))].sort();
}

/** Freeze the picks at a close. Never overwrites an existing frozen list. */
export async function make(date: string): Promise<void> {
    if (isFrozen(date)) { console.log(`[Forward] ${date} already frozen; not overwriting.`); await check(date); return; }
    const universe = await topUniverse(date);
    const lists: Record<string, string[]> = { dip: [], surge: [] };
    for (const symbol of universe) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        const i = bars.findIndex(bar => bar.date === date);
        if (i < 252) continue;
        if (isUptrendDip(bars, computeSeriesIndicators(bars), i)) lists.dip.push(symbol);
        const clues = priceClues(bars, i);
        if (clues?.vol2 && clues.up3 && clues.strongClose) lists.surge.push(symbol);
    }
    const frozen: Frozen = { signalDate: date, createdAt: new Date().toISOString(), lists, universe };
    mkdirSync(FORWARD_DIR, { recursive: true });
    writeFileSync(path(date, 'json'), JSON.stringify(frozen, null, 2));
    console.log(`[Forward] Froze picks for ${date}: dip ${lists.dip.length}, surge ${lists.surge.length}, universe ${universe.length}.`);
    await check(date);
}

export async function check(date: string): Promise<void> {
    if (!existsSync(path(date, 'json'))) throw new Error(`No frozen list for ${date}; run --make first.`);
    const frozen: Frozen = JSON.parse(readFileSync(path(date, 'json'), 'utf8'));
    const result = (bars: PriceBar[], k: number): number | null => {
        const i = bars.findIndex(bar => bar.date === date);
        if (i < 0 || i + k >= bars.length || !(bars[i + 1].open > 0)) return null;
        return (bars[i + k].close / bars[i + 1].open - 1) * 100 - COST_PCT;
    };
    const perSymbol = new Map<string, { close: number; returns: Array<number | null>; dates: string[] }>();
    for (const symbol of [...frozen.universe, 'NIFTY_50']) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        const i = bars.findIndex(bar => bar.date === date);
        if (i < 0) continue;
        perSymbol.set(symbol, {
            close: bars[i].close,
            returns: Array.from({ length: SESSIONS }, (_, k) => result(bars, k + 1)),
            dates: bars.slice(i + 1, i + 1 + SESSIONS).map(bar => bar.date),
        });
    }
    const avg = (symbols: string[], k: number) => {
        const values = symbols.map(symbol => perSymbol.get(symbol)?.returns[k]).filter((value): value is number => value !== null && value !== undefined);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const fmt = (value: number | null | undefined) => (value === null || value === undefined ? 'pending' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`);
    const sessionDates = perSymbol.get('NIFTY_50')?.dates ?? [];
    const head = Array.from({ length: SESSIONS }, (_, k) => `After ${k + 1} session${k ? 's' : ''}${sessionDates[k] ? ` (${sessionDates[k]})` : ''}`);
    const lines = [
        `# Forward paper check: picks frozen at the ${date} close`,
        '',
        `Frozen: ${frozen.createdAt} (before the next session's open). Last checked: ${new Date().toISOString()}.`,
        '',
        'Picks come only from the fixed rules below, applied to the top 500 stocks by 20-day turnover. Entry = next session\'s open; result = close after 1, 2, 3 sessions vs that open, minus 0.4% costs. NIFTY 50 is shown without costs.',
        '',
        '**Three sessions with a handful of stocks is mostly luck either way.** A good rule can lose three days running; a bad one can win. This is a sanity check, not a verdict; the 2024–26 tests are the evidence.',
        '',
        '## Group averages',
        '',
        `| Group | Stocks | ${head.join(' | ')} |`,
        `|---|---:|${head.map(() => '---:').join('|')}|`,
        ...Object.keys(frozen.lists).map(key => `| ${key === 'dip' ? 'Uptrend dip' : 'Volume surge'} | ${frozen.lists[key].length} | ${Array.from({ length: SESSIONS }, (_, k) => fmt(avg(frozen.lists[key], k))).join(' | ')} |`),
        `| Average top-500 stock | ${frozen.universe.length} | ${Array.from({ length: SESSIONS }, (_, k) => fmt(avg(frozen.universe, k))).join(' | ')} |`,
        `| NIFTY 50 (no costs) | — | ${Array.from({ length: SESSIONS }, (_, k) => { const v = perSymbol.get('NIFTY_50')?.returns[k]; return fmt(v === null || v === undefined ? v : v + COST_PCT); }).join(' | ')} |`,
        '',
    ];
    for (const [key, symbols] of Object.entries(frozen.lists)) {
        lines.push(`## ${key === 'dip' ? 'Uptrend dip' : 'Volume surge'}`, '', LIST_RULES[key], '');
        if (!symbols.length) { lines.push('No stocks matched today.', ''); continue; }
        lines.push(`| Stock | Close ${date} | ${head.join(' | ')} |`, `|---|---:|${head.map(() => '---:').join('|')}|`);
        for (const symbol of symbols) {
            const row = perSymbol.get(symbol);
            lines.push(`| ${symbol} | ${row?.close.toFixed(2) ?? '—'} | ${Array.from({ length: SESSIONS }, (_, k) => fmt(row?.returns[k])).join(' | ')} |`);
        }
        lines.push('');
    }
    lines.push('Research output, not investment advice. Neither rule passed its pre-registered test.', '');
    writeFileSync(path(date, 'md'), lines.join('\n'));
    console.log(`[Forward] Report: ${path(date, 'md')}`);
}

if (require.main === module) {
    const date = process.argv.find(item => item.startsWith('--date='))?.split('=')[1];
    if (!date) throw new Error('Pass --date=YYYY-MM-DD');
    (process.argv.includes('--make') ? make(date) : check(date))
        .catch(error => { console.error('[Forward] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
