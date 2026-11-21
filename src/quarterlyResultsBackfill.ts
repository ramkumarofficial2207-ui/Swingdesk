import 'dotenv/config';
import axios from 'axios';
import prisma from './prismaClient';
import { parseNseDate } from './earningsValidator';
import { parseNseTimestamp } from './resultsCalendarBackfill';

/**
 * Downloads quarterly financial results from NSE (approved by the user on 2026-11-21):
 * the per-company filing list from the NSE API, then each filing's XBRL file from the
 * NSE archive. Keeps the FIRST filing per company, quarter and basis (what the market
 * saw), with NSE's dissemination time. Polite: two requests in flight, a pause between
 * requests, resumable (quarters already stored are skipped).
 *
 *   npm run data:quarterly-results                       every symbol ever in the universe
 *   npm run data:quarterly-results -- --symbols=TCS,INFY
 */

const PAGE = 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results';
const API = 'https://www.nseindia.com/api/corporates-financial-results';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': PAGE,
};
export const FIRST_PERIOD_END = '2018-01-01';
const PAUSE_MS = 600;

export interface ListingRow {
    symbol: string;
    periodStart: Date | null;
    periodEnd: Date;
    consolidated: boolean;
    publishedAt: Date;
    audited: string | null;
    bank: boolean;
    xbrlUrl: string | null;
    seqNumber: string | null;
}

/** Quarterly, non-cumulative filings from the listing, period end on or after FIRST_PERIOD_END. */
export function parseResultsListing(payload: unknown): ListingRow[] {
    const rows = Array.isArray(payload) ? payload : [];
    return rows.flatMap((item: any) => {
        if (item?.period !== 'Quarterly' || !/non-cumulative/i.test(String(item?.cumulative ?? ''))) return [];
        const periodEnd = parseNseDate(item?.toDate);
        const publishedAt = parseNseTimestamp(item?.exchdisstime) ?? parseNseTimestamp(item?.broadCastDate) ?? parseNseTimestamp(`${item?.filingDate}:00`);
        const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
        if (!symbol || !periodEnd || !publishedAt || periodEnd.toISOString().slice(0, 10) < FIRST_PERIOD_END) return [];
        const xbrl = typeof item?.xbrl === 'string' && /^https?:\/\/.+\.xml$/i.test(item.xbrl.trim()) ? item.xbrl.trim() : null;
        return [{
            symbol,
            periodStart: parseNseDate(item?.fromDate),
            periodEnd,
            consolidated: /^consolidated$/i.test(String(item?.consolidated ?? '').trim()),
            publishedAt,
            audited: typeof item?.audited === 'string' ? item.audited : null,
            bank: item?.bank === 'Y',
            xbrlUrl: xbrl,
            seqNumber: item?.seqNumber ? String(item.seqNumber) : null,
        }];
    });
}

const INTEGRATED_API = 'https://www.nseindia.com/api/integrated-filing-results';

/** "30-SEP-2026" or "30-Sep-2026" → UTC date. */
function parseAnyCaseDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
    return m ? parseNseDate(`${m[1]}-${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}-${m[3]}`) : null;
}

/** First day of the quarter that ends on periodEnd. */
export function quarterStart(periodEnd: Date): Date {
    return new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 2, 1));
}

/** Integrated filings (financials) used since 2025: same figures, different list format. */
export function parseIntegratedListing(payload: unknown): ListingRow[] {
    const rows = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.data) ? (payload as any).data : [];
    return rows.flatMap((item: any) => {
        if (!/financials/i.test(String(item?.type ?? ''))) return [];
        const periodEnd = parseAnyCaseDate(item?.qe_Date);
        const publishedAt = parseNseTimestamp(item?.broadcast_Date) ?? parseNseTimestamp(item?.creation_Date);
        const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
        if (!symbol || !periodEnd || !publishedAt || periodEnd.toISOString().slice(0, 10) < FIRST_PERIOD_END) return [];
        const xbrl = typeof item?.xbrl === 'string' && /^https?:\/\/.+\.xml$/i.test(item.xbrl.trim()) ? item.xbrl.trim() : null;
        return [{
            symbol,
            periodStart: quarterStart(periodEnd),
            periodEnd,
            consolidated: /^consolidated$/i.test(String(item?.consolidated ?? '').trim()),
            publishedAt,
            audited: typeof item?.audited === 'string' ? item.audited : null,
            bank: false,
            xbrlUrl: xbrl,
            seqNumber: item?.seq_Id ? String(item.seq_Id) : null,
        }];
    });
}

/**
 * One basis per company so quarters compare like with like: consolidated if the company
 * filed consolidated results for at least as many quarters as standalone, else standalone.
 * Within that basis, the earliest filing per quarter.
 */
export function chooseFilings(rows: ListingRow[]): ListingRow[] {
    const quarters = (consolidated: boolean) => new Set(rows.filter(r => r.consolidated === consolidated).map(r => r.periodEnd.getTime())).size;
    const basis = quarters(true) >= quarters(false) && quarters(true) > 0;
    const first = new Map<number, ListingRow>();
    for (const row of rows.filter(r => r.consolidated === basis)) {
        const known = first.get(row.periodEnd.getTime());
        if (!known || row.publishedAt < known.publishedAt) first.set(row.periodEnd.getTime(), row);
    }
    return [...first.values()].sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime());
}

export interface XbrlValues {
    revenue: number | null;
    profitBeforeTax: number | null;
    netProfit: number | null;
    netProfitOwners: number | null;
    eps: number | null;
}

/**
 * Figures for the quarter itself: facts whose context is a plain duration (no dimensions)
 * exactly matching the quarter (normally "OneD"; "FourD" is year-to-date and is ignored).
 */
export function parseXbrl(xml: string, periodStart: string | null, periodEnd: string): XbrlValues {
    const contexts = new Set<string>();
    for (const match of xml.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)) {
        const body = match[2];
        if (/<xbrli:scenario>/.test(body)) continue;
        const start = /<xbrli:startDate>([^<]+)<\/xbrli:startDate>/.exec(body)?.[1]?.trim();
        const end = /<xbrli:endDate>([^<]+)<\/xbrli:endDate>/.exec(body)?.[1]?.trim();
        if (end === periodEnd && (!periodStart || start === periodStart)) contexts.add(match[1]);
    }
    // Older NSE files (2018–2022) reference "OneD" (current quarter, duration) without defining it.
    if (!contexts.size && !/<xbrli:context id="OneD"/.test(xml)) contexts.add('OneD');
    const pick = (...tags: string[]): number | null => {
        for (const tag of tags) {
            const re = new RegExp(`<[a-z-]+:${tag}\\b[^>]*contextRef="([^"]+)"[^>]*>([^<]*)<`, 'g');
            for (const m of xml.matchAll(re)) {
                const value = Number(m[2].trim());
                if (contexts.has(m[1]) && Number.isFinite(value)) return value;
            }
        }
        return null;
    };
    return {
        revenue: pick('RevenueFromOperations', 'Income', 'TotalIncome'),
        profitBeforeTax: pick('ProfitBeforeTax', 'ProfitLossBeforeTax'),
        netProfit: pick('ProfitLossForPeriod', 'ProfitLossForThePeriod', 'NetProfitLossForThePeriod', 'ProfitLossFromOrdinaryActivitiesAfterTax'),
        netProfitOwners: pick('ProfitOrLossAttributableToOwnersOfParent', 'ProfitLossAttributableToOwnersOfParent', 'NetProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates'),
        eps: pick('BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations', 'BasicEarningsLossPerShareFromContinuingOperations', 'BasicEarningsPerShareAfterExtraordinaryItems', 'BasicEarningsPerShareBeforeExtraordinaryItems'),
    };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

let cookie = '';
async function refreshSession(): Promise<void> {
    const landing = await axios.get(PAGE, { headers: HEADERS, timeout: 20000, validateStatus: s => s >= 200 && s < 400 });
    cookie = Array.isArray(landing.headers['set-cookie']) ? landing.headers['set-cookie'].map(v => v.split(';')[0]).join('; ') : '';
}

async function fetchListing(symbol: string, integrated = false): Promise<unknown> {
    const url = integrated ? INTEGRATED_API : API;
    const params = integrated ? { index: 'equities', type: 'Integrated Filing- Financials', symbol } : { index: 'equities', period: 'Quarterly', symbol };
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            const res = await axios.get(url, { params, headers: { ...HEADERS, Cookie: cookie }, timeout: 30000 });
            return res.data;
        } catch (error: any) {
            const status = error?.response?.status;
            if (attempt === 4) throw new Error(`listing ${symbol}: ${status ?? error?.message}`);
            await sleep(2000 * attempt);
            if (status === 401 || status === 403) await refreshSession();
        }
    }
    return [];
}

async function fetchXbrl(url: string): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const res = await axios.get(url, { headers: { 'User-Agent': HEADERS['User-Agent'], Referer: 'https://www.nseindia.com/' }, timeout: 30000, responseType: 'text' });
            return String(res.data);
        } catch (error: any) {
            if (attempt === 3) throw error;
            await sleep(1500 * attempt);
        }
    }
    return '';
}

async function symbolsToLoad(): Promise<string[]> {
    const arg = process.argv.find(a => a.startsWith('--symbols='))?.slice(10);
    if (arg) return arg.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const rows = await prisma.$queryRaw<Array<{ symbol: string }>>`
        WITH t AS (
            SELECT c.symbol, c.series, AVG(c."turnoverCr") OVER w AS t20, COUNT(c."turnoverCr") OVER w AS cnt, c."tradingDate" AS d
            FROM "DailyCandle" c JOIN "MarketInstrument" m ON m.symbol = c.symbol
            WHERE c."isFinal" = true AND m.isin LIKE 'INE%'
            WINDOW w AS (PARTITION BY c.symbol ORDER BY c."tradingDate" ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
        ), r AS (SELECT symbol, RANK() OVER (PARTITION BY d ORDER BY t20 DESC) AS rk FROM t WHERE cnt = 20 AND series = 'EQ')
        SELECT DISTINCT symbol FROM r WHERE rk <= 500 ORDER BY symbol`;
    return rows.map(r => r.symbol);
}

async function loadSymbol(symbol: string): Promise<{ added: number; ok: number }> {
    const classic = parseResultsListing(await fetchListing(symbol));
    await sleep(PAUSE_MS);
    const integrated = parseIntegratedListing(await fetchListing(symbol, true));
    await sleep(PAUSE_MS);
    const filings = chooseFilings([...classic, ...integrated]);
    const have = new Set((await prisma.quarterlyResult.findMany({ where: { symbol }, select: { periodEnd: true, consolidated: true } }))
        .map(r => `${day(r.periodEnd)}|${r.consolidated}`));
    let added = 0;
    let ok = 0;
    for (const f of filings) {
        if (have.has(`${day(f.periodEnd)}|${f.consolidated}`)) continue;
        let values: XbrlValues | null = null;
        let status = 'NO_XBRL';
        if (f.xbrlUrl) {
            try {
                values = parseXbrl(await fetchXbrl(f.xbrlUrl), day(f.periodStart), day(f.periodEnd)!);
                status = values.netProfit === null && values.eps === null ? 'NO_VALUES' : 'OK';
            } catch {
                status = 'FETCH_FAILED';
            }
            await sleep(PAUSE_MS);
        }
        if (status === 'FETCH_FAILED') continue; // retried on the next run
        await prisma.quarterlyResult.create({
            data: {
                symbol, periodStart: f.periodStart, periodEnd: f.periodEnd, consolidated: f.consolidated, publishedAt: f.publishedAt,
                audited: f.audited, bank: f.bank, xbrlUrl: f.xbrlUrl, seqNumber: f.seqNumber, parseStatus: status, ...(values ?? {}),
            },
        });
        added += 1;
        if (status === 'OK') ok += 1;
    }
    return { added, ok };
}

async function main(): Promise<void> {
    const symbols = await symbolsToLoad();
    const workers = Math.max(1, Number(process.argv.find(a => a.startsWith('--workers='))?.slice(10) ?? 2));
    await refreshSession();
    console.log(`[QuarterlyResults] ${symbols.length} symbols, ${workers} workers`);
    let next = 0;
    let done = 0;
    const failed: string[] = [];
    const started = Date.now();
    await Promise.all(Array.from({ length: workers }, async () => {
        while (next < symbols.length) {
            const symbol = symbols[next++];
            try {
                const { added, ok } = await loadSymbol(symbol);
                done += 1;
                if (done % 25 === 0 || added) console.log(`[QuarterlyResults] ${done}/${symbols.length} ${symbol}: +${added} (${ok} with figures) · ${((Date.now() - started) / 60000).toFixed(1)} min`);
            } catch (error: any) {
                failed.push(symbol);
                console.warn(`[QuarterlyResults] ${symbol} failed: ${error?.message ?? error}`);
            }
            if (next % 100 === 0) await refreshSession().catch(() => undefined);
        }
    }));
    console.log(`[QuarterlyResults] done: ${done} symbols in ${((Date.now() - started) / 60000).toFixed(1)} min; failed ${failed.length}${failed.length ? `: ${failed.join(',')}` : ''}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[QuarterlyResults] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
