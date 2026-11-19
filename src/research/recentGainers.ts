import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { PriceBar } from '../corporateActions';

/**
 * npm run research:recent-gainers -- --days=10 --top=10
 *
 * For the last N trading days, lists each day's top gainers in the Nifty 500
 * and what was visible before the move, compared with all Nifty 500 stocks.
 * Size buckets are a proxy: rank by 20-session average turnover (top 100 =
 * Large, next 150 = Mid, rest = Small). Writes reports/recent-gainers.md.
 */

interface Constituent { symbol: string; industry: string }

/** Minimal CSV parser that handles quoted fields with commas. */
export function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted; }
        else if (char === ',' && !quoted) { out.push(current); current = ''; }
        else current += char;
    }
    out.push(current);
    return out.map(value => value.trim());
}

function loadConstituents(): Constituent[] {
    const lines = readFileSync(join('data', 'nifty500-constituents.csv'), 'utf8').trim().split(/\r?\n/);
    const header = parseCsvLine(lines[0]).map(value => value.toLowerCase());
    const symbolCol = header.indexOf('symbol');
    const industryCol = header.indexOf('industry');
    return lines.slice(1).map(parseCsvLine).map(cols => ({ symbol: cols[symbolCol], industry: cols[industryCol] || 'Unknown' })).filter(item => item.symbol);
}

export interface DayView {
    symbol: string;
    industry: string;
    changePct: number;
    /** Share of the day's move that was already in the opening price. */
    gapPct: number;
    openShare: number | null;
    volumeRatio: number;
    prevDayVolumeRatio: number;
    prior5dPct: number;
    fromHigh252Pct: number;
    aboveSma50: boolean;
    turnoverCr20: number;
    resultsRecent: boolean;
}

/** Everything about day i that was known before or at its open, plus the day's outcome. */
export function viewForDay(bars: PriceBar[], i: number): Omit<DayView, 'symbol' | 'industry' | 'resultsRecent' | 'turnoverCr20'> | null {
    if (i < 252 || i >= bars.length) return null;
    const previous = bars[i - 1];
    if (!(previous.close > 0)) return null;
    const avgVolume = (end: number) => bars.slice(end - 20, end).reduce((sum, bar) => sum + bar.volume, 0) / 20;
    const changePct = (bars[i].close / previous.close - 1) * 100;
    const gapPct = (bars[i].open / previous.close - 1) * 100;
    const high252 = Math.max(...bars.slice(i - 252, i).map(bar => bar.high));
    const sma50 = bars.slice(i - 50, i).reduce((sum, bar) => sum + bar.close, 0) / 50;
    return {
        changePct,
        gapPct,
        openShare: changePct > 0.5 ? Math.max(0, Math.min(1.5, gapPct / changePct)) : null,
        volumeRatio: bars[i].volume / Math.max(1, avgVolume(i)),
        prevDayVolumeRatio: previous.volume / Math.max(1, avgVolume(i - 1)),
        prior5dPct: (previous.close / bars[i - 6].close - 1) * 100,
        fromHigh252Pct: (previous.close / high252 - 1) * 100,
        aboveSma50: previous.close > sma50,
    };
}

const pct = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
const share = (count: number, total: number) => (total ? `${((100 * count) / total).toFixed(0)}%` : '—');

async function main(): Promise<void> {
    const arg = (name: string, fallback: number) => Number(process.argv.find(item => item.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
    const days = arg('days', 10);
    const top = arg('top', 10);
    const constituents = loadConstituents();
    const industryOf = new Map(constituents.map(item => [item.symbol, item.industry]));

    const sessions = (await prisma.$queryRaw<Array<{ d: Date }>>`
        SELECT "tradingDate" AS d FROM "DailyCandle" WHERE "isFinal" = true
        GROUP BY "tradingDate" HAVING COUNT(*) >= 500 ORDER BY "tradingDate" DESC LIMIT ${days}`).map(row => row.d.toISOString().slice(0, 10)).reverse();
    const firstSession = sessions[0];
    const events = await prisma.resultsEvent.findMany({
        where: { symbol: { in: constituents.map(item => item.symbol) }, meetingDate: { gte: new Date(new Date(`${firstSession}T00:00:00Z`).getTime() - 10 * 86_400_000) } },
        select: { symbol: true, meetingDate: true },
    });
    const resultsBySymbol = new Map<string, string[]>();
    for (const event of events) {
        const list = resultsBySymbol.get(event.symbol) ?? [];
        list.push(event.meetingDate.toISOString().slice(0, 10));
        resultsBySymbol.set(event.symbol, list);
    }

    const byDay = new Map<string, DayView[]>(sessions.map(day => [day, []]));
    for (const { symbol, industry } of constituents) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        const index = new Map(bars.map((bar, i) => [bar.date, i]));
        for (const day of sessions) {
            const i = index.get(day);
            if (i === undefined || bars[i - 1] === undefined) continue;
            const view = viewForDay(bars, i);
            if (!view) continue;
            const turnoverCr20 = bars.slice(i - 20, i).reduce((sum, bar) => sum + bar.close * bar.volume, 0) / 20 / 1e7;
            // Results announced on the previous session or the same day (released after the close or during the session).
            const resultsRecent = (resultsBySymbol.get(symbol) ?? []).some(meeting => meeting >= bars[i - 1].date && meeting <= day);
            byDay.get(day)!.push({ symbol, industry, turnoverCr20, resultsRecent, ...view });
        }
    }

    const lines: string[] = [
        '# Recent top gainers: what was visible before the move',
        '',
        `Generated: ${new Date().toISOString()} · last ${days} sessions (${sessions[0]} → ${sessions.at(-1)}) · Nifty 500 (current list) · top ${top} gainers per day.`,
        '',
        'Size is a proxy from 20-session average turnover: top 100 = Large, next 150 = Mid, rest = Small. "At open" is the share of the day\'s gain already in the opening price (news known before 9:15). "Vol" is the day\'s volume vs its 20-day average; "Prev vol" is the day before. "Sector peers" counts other stocks from the same industry in that day\'s top 30.',
        '',
    ];

    const gainers: DayView[] = [];
    const everyone: DayView[] = [];
    for (const day of sessions) {
        const list = byDay.get(day)!;
        const ranked = [...list].sort((left, right) => right.turnoverCr20 - left.turnoverCr20);
        const bucket = new Map(ranked.map((view, i) => [view.symbol, i < 100 ? 'Large' : i < 250 ? 'Mid' : 'Small']));
        const sorted = [...list].sort((left, right) => right.changePct - left.changePct);
        const top30 = sorted.slice(0, 30);
        const topN = sorted.slice(0, top);
        const advancing = list.filter(view => view.changePct > 0).length;
        gainers.push(...topN);
        everyone.push(...list);
        lines.push(`## ${day} — ${advancing} of ${list.length} rose`, '');
        lines.push('| Stock | Size | Industry | Change | At open | Vol | Prev vol | Prior 5d | From 52w high | Results | Sector peers |');
        lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|:---:|---:|');
        for (const view of topN) {
            const peers = top30.filter(other => other.symbol !== view.symbol && other.industry === view.industry).length;
            lines.push(`| ${view.symbol} | ${bucket.get(view.symbol)} | ${view.industry} | ${pct(view.changePct)} | ${view.openShare === null ? '—' : `${(view.openShare * 100).toFixed(0)}%`} | ${view.volumeRatio.toFixed(1)}× | ${view.prevDayVolumeRatio.toFixed(1)}× | ${pct(view.prior5dPct)} | ${pct(view.fromHigh252Pct)} | ${view.resultsRecent ? '✅' : ''} | ${peers} |`);
        }
        const sectorCounts = new Map<string, number>();
        for (const view of top30) sectorCounts.set(view.industry, (sectorCounts.get(view.industry) ?? 0) + 1);
        const leadingSectors = [...sectorCounts].filter(([, count]) => count >= 4).sort((left, right) => right[1] - left[1]);
        if (leadingSectors.length) lines.push('', `Sector clusters in the top 30: ${leadingSectors.map(([name, count]) => `${name} (${count})`).join(', ')}.`);
        lines.push('');
    }

    const clue = (name: string, test: (view: DayView) => boolean) => {
        const g = gainers.filter(test).length;
        const a = everyone.filter(test).length;
        const lift = a && gainers.length ? (g / gainers.length) / (a / everyone.length) : NaN;
        return `| ${name} | ${share(g, gainers.length)} | ${share(a, everyone.length)} | ${Number.isFinite(lift) ? `${lift.toFixed(1)}×` : '—'} |`;
    };
    lines.push(
        `## Summary across ${gainers.length} top-gainer days vs all ${everyone.length.toLocaleString('en-IN')} stock-days`,
        '',
        'Lift = how much more common the clue is among top gainers than among all stocks. Above 1× means the clue helps; known-before-the-move clues are the ones the agent can use.',
        '',
        '| Clue | Top gainers | All stocks | Lift | ',
        '|---|---:|---:|---:|',
        '| **Known the evening before** | | | |',
        clue('Results announced day before or same day', view => view.resultsRecent),
        clue('Previous-day volume ≥ 1.5× average', view => view.prevDayVolumeRatio >= 1.5),
        clue('Up ≥ 5% over the prior 5 days', view => view.prior5dPct >= 5),
        clue('Down ≥ 5% over the prior 5 days', view => view.prior5dPct <= -5),
        clue('Within 5% of 52-week high', view => view.fromHigh252Pct >= -5),
        clue('More than 25% below 52-week high', view => view.fromHigh252Pct < -25),
        clue('Above 50-day average', view => view.aboveSma50),
        '| **Known at the open (9:15)** | | | |',
        clue('Opened ≥ 2% higher', view => view.gapPct >= 2),
        clue('Most of the gain was in the opening price', view => (view.openShare ?? 0) >= 0.5),
        '| **Only known during/after the day** | | | |',
        clue('Volume ≥ 2× average on the day', view => view.volumeRatio >= 2),
        '',
        'Research output, not investment advice.',
        '',
    );
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'recent-gainers.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[Gainers] ${sessions.length} sessions, ${gainers.length} gainer rows. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Gainers] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
