import { Prisma } from '@prisma/client';
import AdmZip from 'adm-zip';
import axios from 'axios';
import { parse as parseCsv } from 'csv-parse/sync';
import { fetchHistoricalData } from './dataService';
import { inScannerUniverse, nifty500Symbols, nifty500Version, refreshNifty500IfNeeded, scannerUsesNifty500 } from './nifty500Universe';
import { getDhanApiFromEnv } from './dhanClient';
import prisma from './prismaClient';
import { Candle } from './types';
import { getActiveInstitutionalCandidates } from './services/institutionalCandidateService';

const NSE_TIMEZONE = 'Asia/Kolkata';
const NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: '*/*',
    Referer: 'https://www.nseindia.com/',
};

export interface NseEodRecord {
    source: 'NSE_UDIFF' | 'NSE_LEGACY' | 'NSE_INDEX';
    symbol: string;
    /** NSE series: EQ (normal), BE/BZ (trade-to-trade, often under surveillance) or INDEX. */
    series: string;
    securityId: string | null;
    isin: string | null;
    tradingDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    previousClose: number | null;
    volume: number;
    turnoverCr: number;
    totalTrades: number;
    deliveryQty: number | null;
    deliveryPct: number | null;
}

export interface PersistedScannerDataset {
    ready: boolean;
    dataAsOf: string | null;
    source: 'postgres_eod';
    rows: Array<{
        ticker: string;
        candles: Candle[];
        discoverySources: Array<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>;
        institutionalCandidateScore?: number;
        institutionalScore?: number;
        institutionalNetBuyCr?: number;
        institutionalDeliverySpikeRatio?: number;
        institutionalDeliveryPct?: number;
        institutionalSourceTypes?: string[];
    }>;
    message: string;
}

export interface EodPipelineResult {
    ready: boolean;
    alreadyReady: boolean;
    shouldQualify: boolean;
    tradingDate: string | null;
    symbolCount: number;
    readySymbolCount: number;
    message: string;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

function envFloat(name: string, fallback: number, min: number, max: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function finiteNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function positivePrice(value: unknown): number {
    const parsed = finiteNumber(value);
    return parsed > 0 ? parsed : 0;
}

export function dateKeyToUtcDate(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00.000Z`);
}

function utcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function istDate(at = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: NSE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
    return dateKeyToUtcDate(`${part('year')}-${part('month')}-${part('day')}`);
}

function compactDate(date: Date): string {
    return utcDateKey(date).replace(/-/g, '');
}

function deliveryDate(date: Date): string {
    const key = utcDateKey(date);
    return `${key.slice(8, 10)}${key.slice(5, 7)}${key.slice(0, 4)}`;
}

const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function legacyDate(date: Date): string {
    const key = utcDateKey(date);
    return `${key.slice(8, 10)}${MONTH_CODES[date.getUTCMonth()]}${key.slice(0, 4)}`;
}

export function buildNseBhavcopyUrl(date: Date): string {
    return `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${compactDate(date)}_F_0000.csv.zip`;
}

export function buildNseLegacyBhavcopyUrl(date: Date): string {
    const year = String(date.getUTCFullYear());
    const month = MONTH_CODES[date.getUTCMonth()];
    return `https://nsearchives.nseindia.com/content/historical/EQUITIES/${year}/${month}/cm${legacyDate(date)}bhav.csv.zip`;
}

export function buildNseDeliveryUrl(date: Date): string {
    return `https://nsearchives.nseindia.com/archives/equities/mto/MTO_${deliveryDate(date)}.DAT`;
}

export function buildNseIndexReportUrl(date: Date): string {
    return `https://nsearchives.nseindia.com/content/indices/ind_close_all_${deliveryDate(date)}.csv`;
}

function parseLegacyDate(value: unknown): string | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    const numericMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
    if (numericMatch) {
        const year = numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3];
        return `${year}-${numericMatch[2].padStart(2, '0')}-${numericMatch[1].padStart(2, '0')}`;
    }
    const match = normalized.match(/^(\d{1,2})-([A-Z]{3})-(\d{2}|\d{4})$/);
    if (!match) return null;
    const month = MONTH_CODES.indexOf(match[2]);
    if (month < 0) return null;
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

/**
 * Equity series kept from the Bhavcopy. EQ is normal trading; BE and BZ are
 * trade-to-trade segments a stock is moved into (often under ASM/GSM
 * surveillance). Dropping BE/BZ left months-long holes in a stock's history,
 * so research treated the next stored bar as the next session.
 */
export const TRADED_EQUITY_SERIES = new Set(['EQ', 'BE', 'BZ']);

/** One row per symbol and date; EQ wins if NSE lists a symbol in two series. */
function oneRowPerSymbol(records: NseEodRecord[]): NseEodRecord[] {
    const bySymbol = new Map<string, NseEodRecord>();
    for (const record of records) {
        const existing = bySymbol.get(record.symbol);
        if (!existing || (existing.series !== 'EQ' && record.series === 'EQ')) bySymbol.set(record.symbol, record);
    }
    return [...bySymbol.values()];
}

export function parseNseDeliveryReport(text: string): Map<string, { quantity: number; percentage: number }> {
    const result = new Map<string, { quantity: number; percentage: number }>();
    for (const line of text.split(/\r?\n/)) {
        const columns = line.trim().split(',');
        if (columns[0] !== '20' || columns.length < 7) continue;
        const symbol = String(columns[2] ?? '').trim().toUpperCase();
        const series = String(columns[3] ?? '').trim().toUpperCase();
        const quantity = finiteNumber(columns[5]);
        const percentage = finiteNumber(columns[6]);
        if (symbol && TRADED_EQUITY_SERIES.has(series) && quantity >= 0 && percentage >= 0) {
            if (series === 'EQ' || !result.has(symbol)) result.set(symbol, { quantity, percentage });
        }
    }
    return result;
}

export function parseNseUdiffBhavcopy(
    csvText: string,
    delivery = new Map<string, { quantity: number; percentage: number }>(),
): NseEodRecord[] {
    const rows = parseCsv(csvText, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as Record<string, string>[];

    const records: NseEodRecord[] = [];
    for (const row of rows) {
        const segment = String(row.Sgmt ?? '').toUpperCase();
        const instrumentType = String(row.FinInstrmTp ?? '').toUpperCase();
        const series = String(row.SctySrs ?? '').toUpperCase();
        const symbol = String(row.TckrSymb ?? '').trim().toUpperCase();
        const tradingDate = String(row.TradDt ?? '').slice(0, 10);
        if (segment !== 'CM' || instrumentType !== 'STK' || !TRADED_EQUITY_SERIES.has(series) || !symbol) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate)) continue;

        const open = positivePrice(row.OpnPric);
        const high = positivePrice(row.HghPric);
        const low = positivePrice(row.LwPric);
        const close = positivePrice(row.ClsPric);
        if (!open || !high || !low || !close) continue;

        const deliveryRow = delivery.get(symbol);
        records.push({
            source: 'NSE_UDIFF',
            symbol,
            series,
            securityId: String(row.FinInstrmId ?? '').trim() || null,
            isin: String(row.ISIN ?? '').trim() || null,
            tradingDate,
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            previousClose: positivePrice(row.PrvsClsgPric) || null,
            volume: Math.max(0, Math.trunc(finiteNumber(row.TtlTradgVol))),
            turnoverCr: Math.max(0, finiteNumber(row.TtlTrfVal) / 10_000_000),
            totalTrades: Math.max(0, Math.trunc(finiteNumber(row.TtlNbOfTxsExctd))),
            deliveryQty: deliveryRow ? Math.trunc(deliveryRow.quantity) : null,
            deliveryPct: deliveryRow?.percentage ?? null,
        });
    }
    return oneRowPerSymbol(records);
}

export function parseNseLegacyBhavcopy(
    csvText: string,
    delivery = new Map<string, { quantity: number; percentage: number }>(),
): NseEodRecord[] {
    const rows = parseCsv(csvText, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as Record<string, string>[];

    const records: NseEodRecord[] = [];
    for (const row of rows) {
        const symbol = String(row.SYMBOL ?? '').trim().toUpperCase();
        const series = String(row.SERIES ?? '').trim().toUpperCase();
        const tradingDate = parseLegacyDate(row.TIMESTAMP);
        if (!symbol || !TRADED_EQUITY_SERIES.has(series) || !tradingDate) continue;

        const open = positivePrice(row.OPEN);
        const high = positivePrice(row.HIGH);
        const low = positivePrice(row.LOW);
        const close = positivePrice(row.CLOSE);
        if (!open || !high || !low || !close) continue;

        const deliveryRow = delivery.get(symbol);
        records.push({
            source: 'NSE_LEGACY',
            symbol,
            series,
            securityId: null,
            isin: String(row.ISIN ?? '').trim() || null,
            tradingDate,
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            previousClose: positivePrice(row.PREVCLOSE) || null,
            volume: Math.max(0, Math.trunc(finiteNumber(row.TOTTRDQTY))),
            turnoverCr: Math.max(0, finiteNumber(row.TOTTRDVAL) / 10_000_000),
            totalTrades: Math.max(0, Math.trunc(finiteNumber(row.TOTALTRADES))),
            deliveryQty: deliveryRow ? Math.trunc(deliveryRow.quantity) : null,
            deliveryPct: deliveryRow?.percentage ?? null,
        });
    }
    return oneRowPerSymbol(records);
}

export function parseNseIndexReport(csvText: string, expectedTradingDate?: string): NseEodRecord[] {
    const rows = parseCsv(csvText, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as Record<string, string>[];
    const row = rows.find(item => String(item['Index Name'] ?? '').trim().toUpperCase() === 'NIFTY 50');
    if (!row) return [];
    // NSE index archives have used both DD-MM-YYYY and MM-DD-YYYY. The file
    // name is authoritative during daily ingestion, so use its requested date
    // to avoid silently moving ambiguous dates into the wrong month.
    const tradingDate = expectedTradingDate && /^\d{4}-\d{2}-\d{2}$/.test(expectedTradingDate)
        ? expectedTradingDate
        : parseLegacyDate(row['Index Date']);
    const open = positivePrice(row['Open Index Value']);
    const high = positivePrice(row['High Index Value']);
    const low = positivePrice(row['Low Index Value']);
    const close = positivePrice(row['Closing Index Value']);
    if (!tradingDate || !open || !high || !low || !close) return [];
    return [{
        source: 'NSE_INDEX',
        symbol: 'NIFTY_50',
        series: 'INDEX',
        securityId: null,
        isin: null,
        tradingDate,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        previousClose: null,
        volume: Math.max(0, Math.trunc(finiteNumber(row.Volume))),
        turnoverCr: Math.max(0, finiteNumber(row['Turnover (Rs. Cr.)'])),
        totalTrades: 0,
        deliveryQty: null,
        deliveryPct: null,
    }];
}

async function fetchNseBundleForDate(date: Date): Promise<{ tradingDate: string; records: NseEodRecord[] }> {
    const bhavResponse = await axios.get(buildNseBhavcopyUrl(date), {
        responseType: 'arraybuffer',
        timeout: 30_000,
        headers: NSE_HEADERS,
    });
    const zip = new AdmZip(Buffer.from(bhavResponse.data));
    const csvEntry = zip.getEntries().find(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.csv'));
    if (!csvEntry) throw new Error('NSE UDiFF archive did not contain a CSV file.');

    let delivery = new Map<string, { quantity: number; percentage: number }>();
    try {
        const deliveryResponse = await axios.get(buildNseDeliveryUrl(date), {
            responseType: 'text',
            timeout: 20_000,
            headers: NSE_HEADERS,
        });
        delivery = parseNseDeliveryReport(String(deliveryResponse.data));
    } catch (error: any) {
        console.warn(`[EOD] Delivery report unavailable for ${utcDateKey(date)}:`, error?.message || error);
    }

    const records = parseNseUdiffBhavcopy(csvEntry.getData().toString('utf8'), delivery);
    if (records.length < 50) throw new Error(`NSE UDiFF report contained only ${records.length} valid EQ records.`);
    return { tradingDate: records[0].tradingDate, records };
}

export async function fetchLatestFinalNseEod(reference = new Date()): Promise<{ tradingDate: string; records: NseEodRecord[] }> {
    const cursor = istDate(reference);
    const errors: string[] = [];
    for (let offset = 0; offset < 10; offset += 1) {
        const candidate = new Date(cursor);
        candidate.setUTCDate(candidate.getUTCDate() - offset);
        const weekday = candidate.getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        try {
            return await fetchNseBundleForDate(candidate);
        } catch (error: any) {
            errors.push(`${utcDateKey(candidate)}: ${error?.response?.status || error?.message || 'unavailable'}`);
        }
    }
    throw new Error(`No finalized NSE Bhavcopy found in the lookback window (${errors.join('; ')}).`);
}

/**
 * historical: rows from an old archive (e.g. the BE/BZ backfill). Instruments
 * that already exist are left untouched, so an old row cannot mark a delisted
 * stock active again; new ones are created inactive.
 */
export async function upsertNseRecords(records: NseEodRecord[], options: { historical?: boolean } = {}): Promise<void> {
    const now = new Date();
    for (let index = 0; index < records.length; index += 200) {
        const batch = records.slice(index, index + 200);
        if (options.historical) {
            await prisma.$executeRaw(Prisma.sql`
                INSERT INTO "MarketInstrument"
                    ("symbol", "securityId", "exchangeSegment", "instrumentType", "series", "isin", "isActive", "lastSeenAt", "createdAt", "updatedAt")
                VALUES ${Prisma.join(batch.map(row => Prisma.sql`
                    (${row.symbol}, ${row.securityId}, 'NSE_EQ', 'EQUITY', 'EQ', ${row.isin}, false, ${now}, ${now}, ${now})
                `))}
                ON CONFLICT ("symbol") DO NOTHING
            `);
        } else await prisma.$executeRaw(Prisma.sql`
            INSERT INTO "MarketInstrument"
                ("symbol", "securityId", "exchangeSegment", "instrumentType", "series", "isin", "isActive", "lastSeenAt", "createdAt", "updatedAt")
            VALUES ${Prisma.join(batch.map(row => Prisma.sql`
                (${row.symbol}, ${row.securityId}, ${row.source === 'NSE_INDEX' ? 'NSE_INDEX' : 'NSE_EQ'}, ${row.source === 'NSE_INDEX' ? 'INDEX' : 'EQUITY'}, ${row.source === 'NSE_INDEX' ? 'INDEX' : 'EQ'}, ${row.isin}, true, ${now}, ${now}, ${now})
            `))}
            ON CONFLICT ("symbol") DO UPDATE SET
                "securityId" = COALESCE(EXCLUDED."securityId", "MarketInstrument"."securityId"),
                "exchangeSegment" = EXCLUDED."exchangeSegment",
                "instrumentType" = EXCLUDED."instrumentType",
                "series" = EXCLUDED."series",
                "isin" = COALESCE(EXCLUDED."isin", "MarketInstrument"."isin"),
                "isActive" = true,
                "lastSeenAt" = EXCLUDED."lastSeenAt",
                "updatedAt" = EXCLUDED."updatedAt"
        `);

        await prisma.$executeRaw(Prisma.sql`
            INSERT INTO "DailyCandle"
                ("symbol", "tradingDate", "series", "open", "high", "low", "close", "previousClose", "volume", "turnoverCr", "totalTrades", "deliveryQty", "deliveryPct", "source", "isFinal", "createdAt", "updatedAt")
            VALUES ${Prisma.join(batch.map(row => Prisma.sql`
                (${row.symbol}, ${dateKeyToUtcDate(row.tradingDate)}, ${row.series}, ${row.open}, ${row.high}, ${row.low}, ${row.close}, ${row.previousClose}, ${BigInt(row.volume)}, ${row.turnoverCr}, ${row.totalTrades}, ${row.deliveryQty == null ? null : BigInt(row.deliveryQty)}, ${row.deliveryPct}, ${row.source}, true, ${now}, ${now})
            `))}
            ON CONFLICT ("symbol", "tradingDate") DO UPDATE SET
                "series" = EXCLUDED."series",
                "open" = EXCLUDED."open",
                "high" = EXCLUDED."high",
                "low" = EXCLUDED."low",
                "close" = EXCLUDED."close",
                "previousClose" = EXCLUDED."previousClose",
                "volume" = EXCLUDED."volume",
                "turnoverCr" = EXCLUDED."turnoverCr",
                "totalTrades" = EXCLUDED."totalTrades",
                "deliveryQty" = COALESCE(EXCLUDED."deliveryQty", "DailyCandle"."deliveryQty"),
                "deliveryPct" = COALESCE(EXCLUDED."deliveryPct", "DailyCandle"."deliveryPct"),
                "source" = EXCLUDED."source",
                "isFinal" = true,
                "updatedAt" = EXCLUDED."updatedAt"
        `);
    }
}

async function persistHistory(symbol: string, candles: Candle[], source: string, maximumDate: string): Promise<number> {
    const valid = [...candles]
        .filter(candle => /^\d{4}-\d{2}-\d{2}/.test(candle.date) && candle.date.slice(0, 10) <= maximumDate)
        .filter(candle => [candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(value) && value > 0))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (!valid.length) return 0;

    await prisma.marketInstrument.upsert({
        where: { symbol },
        create: { symbol, isActive: true },
        update: { isActive: true },
    });

    let inserted = 0;
    for (let index = 0; index < valid.length; index += 500) {
        const batch = valid.slice(index, index + 500);
        const result = await prisma.dailyCandle.createMany({
            data: batch.map((candle, batchIndex) => ({
                symbol,
                tradingDate: dateKeyToUtcDate(candle.date.slice(0, 10)),
                open: candle.open,
                high: Math.max(candle.high, candle.open, candle.close),
                low: Math.min(candle.low, candle.open, candle.close),
                close: candle.close,
                previousClose: batchIndex > 0 ? batch[batchIndex - 1].close : undefined,
                volume: BigInt(Math.max(0, Math.trunc(candle.volume))),
                source,
                isFinal: true,
            })),
            skipDuplicates: true,
        });
        inserted += result.count;
    }
    return inserted;
}

async function ensureBenchmarkHistory(maximumDate: string): Promise<void> {
    const candles = await fetchHistoricalData('^NSEI', 730, '1d');
    if (candles.length < 220) {
        throw new Error(`Nifty benchmark history is incomplete (${candles.length}/220 candles).`);
    }
    await persistHistory('NIFTY_50', candles, 'YAHOO_INDEX', maximumDate);
}

async function ensureUniverseHistory(records: NseEodRecord[], runId: string): Promise<{ selected: number; ready: number; errors: string[] }> {
    const minimumCandles = envInt('EOD_MIN_CANDLES', 220, 200, 500);
    const universeLimit = envInt('SCANNER_UNIVERSE_LIMIT', 500, 50, 1_500);
    const selectedRecords = [...records]
        // Trade-to-trade (BE/BZ) stocks are stored for continuous history but never scanned.
        .filter(row => row.series === 'EQ' && inScannerUniverse(row.symbol) && row.close >= 20 && row.turnoverCr >= 2 && row.totalTrades >= 300)
        .sort((a, b) => b.turnoverCr - a.turnoverCr || b.totalTrades - a.totalTrades)
        .slice(0, universeLimit);
    const symbols = selectedRecords.map(row => row.symbol);
    const counts = symbols.length
        ? await prisma.dailyCandle.groupBy({
            by: ['symbol'],
            where: { symbol: { in: symbols }, isFinal: true },
            _count: { _all: true },
        })
        : [];
    const countMap = new Map(counts.map(row => [row.symbol, row._count._all]));
    const missing = symbols.filter(symbol => (countMap.get(symbol) ?? 0) < minimumCandles);
    const errors: string[] = [];
    const dhan = process.env.SWINGDESK_DATA_PROVIDER === 'yahoo' ? null : getDhanApiFromEnv();
    let dhanDisabled = !dhan;
    let consecutiveDhanFailures = 0;
    const allowYahooFallback = process.env.EOD_ALLOW_YAHOO_BACKFILL !== 'false';
    const maximumDate = records[0]?.tradingDate ?? utcDateKey(istDate());

    for (let index = 0; index < missing.length; index += 1) {
        const symbol = missing[index];
        let candles: Candle[] = [];
        let source = 'DHAN_HISTORICAL';
        if (!dhanDisabled && dhan) {
            try {
                candles = await dhan.getHistoricalData(symbol, '1d', 730);
                if (candles.length < minimumCandles) throw new Error(`only ${candles.length} candles returned`);
                consecutiveDhanFailures = 0;
            } catch (error: any) {
                consecutiveDhanFailures += 1;
                errors.push(`${symbol} Dhan: ${error?.response?.status || error?.message || 'failed'}`);
                if (consecutiveDhanFailures >= 3) {
                    dhanDisabled = true;
                    console.warn('[EOD] Dhan historical backfill disabled for this run after three consecutive failures.');
                }
            }
        }

        if (candles.length < minimumCandles && allowYahooFallback) {
            source = 'YAHOO_BACKFILL';
            candles = await fetchHistoricalData(`${symbol}.NS`, 730, '1d');
        }

        if (candles.length >= minimumCandles) {
            await persistHistory(symbol, candles, source, maximumDate);
        } else {
            errors.push(`${symbol}: insufficient finalized history (${candles.length}/${minimumCandles})`);
        }

        if ((index + 1) % 20 === 0 || index === missing.length - 1) {
            await prisma.eodIngestionRun.update({
                where: { id: runId },
                data: { message: `Historical backfill ${index + 1}/${missing.length}` },
            });
        }

        if (!dhanDisabled) await new Promise(resolve => setTimeout(resolve, 210));
    }

    const finalCounts = symbols.length
        ? await prisma.dailyCandle.groupBy({
            by: ['symbol'],
            where: { symbol: { in: symbols }, isFinal: true },
            _count: { _all: true },
        })
        : [];
    const ready = finalCounts.filter(row => row._count._all >= minimumCandles).length;
    return { selected: symbols.length, ready, errors };
}

let pipelineInFlight: Promise<EodPipelineResult> | null = null;

async function executeEodPipeline(force = false): Promise<EodPipelineResult> {
    await refreshNifty500IfNeeded();
    const bundle = await fetchLatestFinalNseEod();
    const tradingDate = dateKeyToUtcDate(bundle.tradingDate);
    const existing = await prisma.eodIngestionRun.findUnique({ where: { tradingDate } });
    if (!force && existing?.status === 'READY' && (!scannerUsesNifty500() || existing.message?.includes(`[NIFTY500:${nifty500Version()}]`))) {
        const queuedJob = existing.qualificationScanId
            ? await prisma.scanJob.findUnique({ where: { id: existing.qualificationScanId }, select: { status: true } })
            : null;
        const queueIsStale = existing.qualificationQueuedAt
            ? Date.now() - existing.qualificationQueuedAt.getTime() > 30 * 60_000
            : false;
        return {
            ready: true,
            alreadyReady: true,
            shouldQualify: !existing.qualificationCompletedAt && (!existing.qualificationQueuedAt || queueIsStale || queuedJob?.status === 'TIMED_OUT' || queuedJob?.status === 'FAILED'),
            tradingDate: bundle.tradingDate,
            symbolCount: existing.symbolCount,
            readySymbolCount: existing.readySymbolCount,
            message: existing.message ?? 'Finalized EOD data is ready.',
        };
    }

    const run = await prisma.eodIngestionRun.upsert({
        where: { tradingDate },
        create: {
            tradingDate,
            status: 'RUNNING',
            symbolCount: bundle.records.length,
            message: 'Persisting finalized NSE UDiFF Bhavcopy.',
        },
        update: {
            status: 'RUNNING',
            symbolCount: bundle.records.length,
            readySymbolCount: 0,
            message: 'Persisting finalized NSE UDiFF Bhavcopy.',
            errors: Prisma.DbNull,
            startedAt: new Date(),
            completedAt: null,
            qualificationQueuedAt: force ? null : undefined,
            qualificationScanId: force ? null : undefined,
            qualificationCompletedAt: force ? null : undefined,
        },
    });

    try {
        await upsertNseRecords(bundle.records);
        await ensureBenchmarkHistory(bundle.tradingDate);
        const history = await ensureUniverseHistory(bundle.records, run.id);
        const minimumCandles = envInt('EOD_MIN_CANDLES', 220, 200, 500);
        const readyRatio = envFloat('EOD_READY_RATIO', 0.8, 0.5, 1);
        const minimumReadySymbols = Math.min(history.selected, envInt('EOD_MIN_READY_SYMBOLS', 50, 10, 500));
        const required = Math.max(minimumReadySymbols, Math.ceil(history.selected * readyRatio));
        const ready = history.selected > 0 && history.ready >= required;
        const message = ready
            ? `${history.ready}/${history.selected} liquid symbols have at least ${minimumCandles} finalized candles.`
            : `EOD history is partial: ${history.ready}/${history.selected} symbols ready; ${required} required.`;

        await prisma.eodIngestionRun.update({
            where: { id: run.id },
            data: {
                status: ready ? 'READY' : 'PARTIAL',
                symbolCount: history.selected,
                readySymbolCount: history.ready,
                minimumCandles,
                message: scannerUsesNifty500() ? `[NIFTY500:${nifty500Version()}] ${message}` : message,
                errors: history.errors.length ? history.errors.slice(0, 100) : Prisma.DbNull,
                completedAt: new Date(),
            },
        });

        return {
            ready,
            alreadyReady: false,
            shouldQualify: ready,
            tradingDate: bundle.tradingDate,
            symbolCount: history.selected,
            readySymbolCount: history.ready,
            message,
        };
    } catch (error: any) {
        const message = error?.message || 'EOD market-data pipeline failed.';
        await prisma.eodIngestionRun.update({
            where: { id: run.id },
            data: { status: 'FAILED', message, errors: [message], completedAt: new Date() },
        }).catch(() => undefined);
        throw error;
    }
}

export function runEodMarketDataPipeline(force = false): Promise<EodPipelineResult> {
    if (pipelineInFlight) return pipelineInFlight;
    pipelineInFlight = executeEodPipeline(force).finally(() => {
        pipelineInFlight = null;
    });
    return pipelineInFlight;
}

export async function markEodQualificationQueued(tradingDate: string, scanId: string): Promise<void> {
    await prisma.eodIngestionRun.update({
        where: { tradingDate: dateKeyToUtcDate(tradingDate) },
        data: { qualificationQueuedAt: new Date(), qualificationScanId: scanId },
    });
}

export async function markEodQualificationCompleted(scanId: string): Promise<void> {
    await prisma.eodIngestionRun.updateMany({
        where: { qualificationScanId: scanId },
        data: { qualificationCompletedAt: new Date() },
    });
}

export async function getEodMarketDataStatus() {
    const latest = await prisma.eodIngestionRun.findFirst({ orderBy: { tradingDate: 'desc' } });
    return latest ? {
        tradingDate: utcDateKey(latest.tradingDate),
        status: latest.status,
        source: latest.source,
        symbolCount: latest.symbolCount,
        readySymbolCount: latest.readySymbolCount,
        minimumCandles: latest.minimumCandles,
        message: latest.message,
        completedAt: latest.completedAt?.toISOString() ?? null,
        qualificationQueuedAt: latest.qualificationQueuedAt?.toISOString() ?? null,
        qualificationCompletedAt: latest.qualificationCompletedAt?.toISOString() ?? null,
    } : null;
}

export async function loadPersistedBenchmarkCandles(limit = 300): Promise<Candle[]> {
    const rows = await prisma.dailyCandle.findMany({
        where: { symbol: 'NIFTY_50', isFinal: true },
        orderBy: { tradingDate: 'desc' },
        take: limit,
    });
    return rows.reverse().map(row => ({
        date: utcDateKey(row.tradingDate),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
    }));
}

export async function loadPersistedScannerDataset(
    newsCatalystTickers: string[] = [],
    limit = envInt('SCANNER_UNIVERSE_LIMIT', 500, 50, 1_500),
): Promise<PersistedScannerDataset> {
    const run = await prisma.eodIngestionRun.findFirst({
        where: { status: 'READY' },
        orderBy: { tradingDate: 'desc' },
    });
    if (!run) {
        return { ready: false, dataAsOf: null, source: 'postgres_eod', rows: [], message: 'No READY EOD ingestion exists.' };
    }

    const asOf = run.tradingDate;
    const membership = scannerUsesNifty500() ? [...nifty500Symbols()] : undefined;
    const latestRows = await prisma.dailyCandle.findMany({
        where: {
            ...(membership ? { symbol: { in: membership } } : {}),
            tradingDate: asOf,
            isFinal: true,
            series: 'EQ',
            close: { gte: 20 },
            turnoverCr: { gte: 2 },
            totalTrades: { gte: 300 },
        },
        orderBy: [{ turnoverCr: 'desc' }, { totalTrades: 'desc' }],
        take: limit,
        select: { symbol: true },
    });

    const symbols = latestRows.map(row => row.symbol);
    const existing = new Set(symbols);
    const discoverySources = new Map<string, Set<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>>(
        symbols.map(symbol => [symbol, new Set(['LIQUIDITY' as const])]),
    );
    const institutionalBySymbol = new Map(
        (await getActiveInstitutionalCandidates().catch(error => {
            console.warn('[EOD] Institutional candidate pool unavailable; continuing with liquidity and news sources:', error?.message || error);
            return [];
        })).map(candidate => [candidate.symbol, candidate]),
    );
    const requestedCatalysts = [...new Set(newsCatalystTickers
        .map(raw => raw.replace(/\.NS$/i, '').toUpperCase())
        .filter(symbol => symbol && inScannerUniverse(symbol)))];
    const finalizedCatalysts = requestedCatalysts.length
        ? await prisma.dailyCandle.findMany({
            where: { symbol: { in: requestedCatalysts }, tradingDate: asOf, isFinal: true },
            select: { symbol: true },
        })
        : [];
    for (const { symbol } of finalizedCatalysts) {
        if (!existing.has(symbol)) {
            symbols.push(symbol);
            existing.add(symbol);
        }
        const sources = discoverySources.get(symbol) ?? new Set<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>();
        sources.add('NEWS');
        discoverySources.set(symbol, sources);
    }

    const institutionalSymbols = [...institutionalBySymbol.keys()].filter(inScannerUniverse);
    const finalizedInstitutional = institutionalSymbols.length
        ? await prisma.dailyCandle.findMany({
            where: { symbol: { in: institutionalSymbols }, tradingDate: asOf, isFinal: true },
            select: { symbol: true },
        })
        : [];
    for (const { symbol } of finalizedInstitutional) {
        if (!existing.has(symbol)) {
            symbols.push(symbol);
            existing.add(symbol);
        }
        const sources = discoverySources.get(symbol) ?? new Set<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>();
        sources.add('INSTITUTIONAL');
        discoverySources.set(symbol, sources);
    }

    const historyStart = new Date(asOf);
    historyStart.setUTCDate(historyStart.getUTCDate() - 900);
    const candles = symbols.length ? await prisma.dailyCandle.findMany({
        where: {
            symbol: { in: symbols },
            tradingDate: { gte: historyStart, lte: asOf },
            isFinal: true,
        },
        orderBy: [{ symbol: 'asc' }, { tradingDate: 'asc' }],
    }) : [];

    const grouped = new Map<string, Candle[]>();
    for (const row of candles) {
        const rows = grouped.get(row.symbol) ?? [];
        rows.push({
            date: utcDateKey(row.tradingDate),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: Number(row.volume),
        });
        grouped.set(row.symbol, rows);
    }

    const minimumCandles = run.minimumCandles;
    const resultRows = symbols
        .map(ticker => {
            const institutional = institutionalBySymbol.get(ticker);
            return {
                ticker,
                candles: grouped.get(ticker) ?? [],
                discoverySources: [...(discoverySources.get(ticker) ?? new Set(['LIQUIDITY' as const]))],
                institutionalCandidateScore: institutional?.candidateScore,
                institutionalScore: institutional?.institutionalScore,
                institutionalNetBuyCr: institutional?.netInstitutionalCr,
                institutionalDeliverySpikeRatio: institutional?.deliverySpikeRatio,
                institutionalDeliveryPct: institutional?.deliveryPct,
                institutionalSourceTypes: institutional?.sourceTypes,
            };
        })
        .filter(row => row.candles.length >= minimumCandles);
    return {
        ready: resultRows.length > 0,
        dataAsOf: utcDateKey(asOf),
        source: 'postgres_eod',
        rows: resultRows,
        message: `${resultRows.length}/${symbols.length} selected symbols loaded from finalized PostgreSQL candles (${finalizedInstitutional.length} institutional candidates merged).`,
    };
}
