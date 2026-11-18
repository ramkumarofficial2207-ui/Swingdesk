import 'dotenv/config';
import axios from 'axios';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import prisma from './prismaClient';
import {
    auditAdjustedJumps,
    classifyPriceFactor,
    CorporateActionEvent,
    findSuspiciousJumps,
    parseYahooSplits,
    PriceBar,
    PriceJump,
    reconcileEventDates,
    SUSPICIOUS_JUMP_PCT,
} from './corporateActions';
import { loadCorporateActions, loadTradingCalendar } from './adjustedCandles';

/**
 * Finds symbols whose raw daily history contains large one-day jumps, fetches
 * their split/bonus events from Yahoo, stores them in CorporateAction, and
 * writes reports/data-quality.md listing jumps that remain unexplained.
 *
 *   npm run data:corporate-actions            sync + report
 *   npm run data:corporate-actions -- --report-only
 */

const SOURCE = 'YAHOO_SPLITS';
const CONCURRENCY = 3;
const REQUEST_GAP_MS = 250;

function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadRawBars(symbol: string): Promise<PriceBar[]> {
    const rows = await prisma.dailyCandle.findMany({
        where: { symbol, isFinal: true },
        orderBy: { tradingDate: 'asc' },
        select: { tradingDate: true, open: true, high: true, low: true, close: true, volume: true },
    });
    return rows.map(row => ({
        date: dateKey(row.tradingDate),
        open: row.open, high: row.high, low: row.low, close: row.close,
        volume: Number(row.volume),
    }));
}

/** Symbols with at least one raw one-day move above the threshold between consecutive sessions. */
async function candidateSymbols(): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ symbol: string }>>`
        WITH sessions AS (
            SELECT "tradingDate" AS t, LAG("tradingDate") OVER (ORDER BY "tradingDate") AS prev_t
            FROM (SELECT "tradingDate" FROM "DailyCandle" WHERE "isFinal" = true
                  GROUP BY "tradingDate" HAVING COUNT(*) >= 500) s
        ),
        moves AS (
            SELECT symbol, "tradingDate" AS d, close,
                   LAG(close) OVER w AS prior, LAG("tradingDate") OVER w AS prior_d
            FROM "DailyCandle" WHERE "isFinal" = true
            WINDOW w AS (PARTITION BY symbol ORDER BY "tradingDate")
        )
        SELECT DISTINCT m.symbol FROM moves m JOIN sessions s ON s.t = m.d
        WHERE m.prior_d = s.prev_t AND m.prior > 0
          AND ABS(m.close / m.prior - 1) * 100 > ${SUSPICIOUS_JUMP_PCT}
        ORDER BY m.symbol`;
    return rows.map(row => row.symbol);
}

async function fetchYahooEvents(symbol: string): Promise<CorporateActionEvent[] | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${symbol}.NS`)}`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const { data } = await axios.get(url, {
                params: { range: 'max', interval: '3mo', events: 'split' },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15_000,
            });
            return parseYahooSplits(data);
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) return null; // not listed on Yahoo (delisted, renamed, ETF variants)
            if (attempt === 3) return null;
            await sleep(status === 429 ? 5_000 * attempt : 1_000 * attempt);
        }
    }
    return null;
}

interface SymbolResult {
    symbol: string;
    rawJumps: PriceJump[];
    unexplained: PriceJump[];
    stored: number;
    yahooFound: boolean;
}

async function syncSymbol(symbol: string, previousTradingDate: (date: string) => string | undefined, reportOnly: boolean): Promise<SymbolResult> {
    const raw = await loadRawBars(symbol);
    const rawJumps = findSuspiciousJumps(raw, SUSPICIOUS_JUMP_PCT, previousTradingDate);
    let stored = 0;
    let yahooFound = true;
    if (!reportOnly && rawJumps.length) {
        const fetched = await fetchYahooEvents(symbol);
        yahooFound = fetched !== null;
        const firstDate = raw[0]?.date ?? '9999-12-31';
        // Smaller detection threshold for matching, so 1:4 bonuses (-20%) still snap.
        const matchJumps = findSuspiciousJumps(raw, 15, previousTradingDate);
        const events = reconcileEventDates((fetched ?? []).filter(event => event.exDate > firstDate), matchJumps);
        for (const event of events) {
            const { kind, ratio } = classifyPriceFactor(event.priceFactor);
            await prisma.corporateAction.upsert({
                where: { symbol_exDate_source: { symbol, exDate: new Date(`${event.exDate}T00:00:00.000Z`), source: SOURCE } },
                create: { symbol, exDate: new Date(`${event.exDate}T00:00:00.000Z`), kind, ratio, priceFactor: event.priceFactor, source: SOURCE },
                update: { kind, ratio, priceFactor: event.priceFactor },
            });
            stored += 1;
        }
    }
    const events = await loadCorporateActions(symbol);
    const { unexplained } = auditAdjustedJumps(raw, events, SUSPICIOUS_JUMP_PCT, previousTradingDate);
    return { symbol, rawJumps, unexplained, stored, yahooFound };
}

function writeReport(results: SymbolResult[], totalEvents: number): string {
    const rawJumpCount = results.reduce((sum, item) => sum + item.rawJumps.length, 0);
    const unexplained = results.flatMap(item => item.unexplained.map(jump => ({ symbol: item.symbol, ...jump })))
        .sort((left, right) => right.date.localeCompare(left.date));
    const explained = rawJumpCount - unexplained.length;
    const missingOnYahoo = results.filter(item => !item.yahooFound).map(item => item.symbol);
    const lines = [
        '# Daily price data quality',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        `A one-day move above ${SUSPICIOUS_JUMP_PCT}% between consecutive sessions is treated as suspicious. Splits and bonuses are stored in \`CorporateAction\` and applied when candles are read; raw candles are unchanged.`,
        '',
        '| Measure | Count |',
        '|---|---:|',
        `| Symbols with suspicious raw jumps | ${results.length} |`,
        `| Raw suspicious jumps | ${rawJumpCount} |`,
        `| Explained by a recorded split/bonus | ${explained} |`,
        `| Still unexplained after adjustment | ${unexplained.length} |`,
        `| Corporate action records stored | ${totalEvents} |`,
        `| Symbols not found on Yahoo | ${missingOnYahoo.length} |`,
        '',
        'Unexplained jumps are either genuine extreme moves (e.g. March 2020, single-stock crashes) or corporate actions with no record (demergers, combined split + bonus). They are exposed as `loadAdjustedDailySeries().unverifiedJumpDates`. Do not drop them blindly: excluding genuine crashes would make strategy results look better than they are. Review each one, and add a MANUAL CorporateAction row only for a confirmed split, bonus or consolidation.',
        '',
        '## Unexplained jumps (most recent 150)',
        '',
        '| Date | Symbol | Previous close | Close | Move |',
        '|---|---|---:|---:|---:|',
        ...unexplained.slice(0, 150).map(jump => `| ${jump.date} | ${jump.symbol} | ${jump.previousClose.toFixed(2)} | ${jump.close.toFixed(2)} | ${((jump.ratio - 1) * 100).toFixed(1)}% |`),
        '',
        missingOnYahoo.length ? `Symbols not found on Yahoo: ${missingOnYahoo.slice(0, 200).join(', ')}${missingOnYahoo.length > 200 ? ' …' : ''}` : '',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'data-quality.md');
    writeFileSync(path, lines.join('\n'));
    return path;
}

async function main(): Promise<void> {
    const reportOnly = process.argv.includes('--report-only');
    const previousTradingDate = await loadTradingCalendar();
    const symbols = await candidateSymbols();
    console.log(`[CorporateActions] ${symbols.length} symbols with raw jumps above ${SUSPICIOUS_JUMP_PCT}%${reportOnly ? ' (report only)' : ''}`);
    const results: SymbolResult[] = [];
    for (let index = 0; index < symbols.length; index += CONCURRENCY) {
        const batch = symbols.slice(index, index + CONCURRENCY);
        results.push(...await Promise.all(batch.map(symbol => syncSymbol(symbol, previousTradingDate, reportOnly))));
        if (!reportOnly) await sleep(REQUEST_GAP_MS);
        if ((index / CONCURRENCY) % 40 === 0) console.log(`[CorporateActions] ${Math.min(index + CONCURRENCY, symbols.length)}/${symbols.length}`);
    }
    const totalEvents = await prisma.corporateAction.count();
    const path = writeReport(results, totalEvents);
    const unexplained = results.reduce((sum, item) => sum + item.unexplained.length, 0);
    console.log(`[CorporateActions] ${totalEvents} events stored; ${unexplained} jumps still unexplained. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[CorporateActions] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
