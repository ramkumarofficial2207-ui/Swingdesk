import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import axios from 'axios';
import prisma from './prismaClient';
import {
    buildNseBhavcopyUrl,
    buildNseDeliveryUrl,
    buildNseIndexReportUrl,
    buildNseLegacyBhavcopyUrl,
    NseEodRecord,
    parseNseDeliveryReport,
    parseNseIndexReport,
    parseNseLegacyBhavcopy,
    parseNseUdiffBhavcopy,
    upsertNseRecords,
} from './eodMarketDataService';

const UDIFF_START_DATE = '2024-07-08';
const DEFAULT_ARCHIVE_DIR = path.resolve(process.cwd(), 'data', 'nse_eod_archive');
const NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: '*/*',
    Referer: 'https://www.nseindia.com/',
};

type DateStatus = 'DOWNLOADED' | 'IMPORTED' | 'NON_TRADING_DAY' | 'FAILED';

interface ManifestEntry {
    status: DateStatus;
    format?: 'legacy' | 'udiff';
    equityRecords?: number;
    benchmarkRecords?: number;
    hasDelivery?: boolean;
    updatedAt: string;
    error?: string;
}

interface Manifest {
    version: 1;
    dates: Record<string, ManifestEntry>;
    updatedAt: string;
}

interface CliOptions {
    from: string;
    to: string;
    concurrency: number;
    archiveDir: string;
    importToDatabase: boolean;
    force: boolean;
    /** Re-import only trade-to-trade (BE/BZ) rows for dates already imported. */
    tradeToTradeOnly: boolean;
}

interface DayArtifacts {
    dateKey: string;
    format: 'legacy' | 'udiff';
    bhavPath: string;
    deliveryPath: string;
    indexPath: string;
}

interface ProcessResult {
    dateKey: string;
    entry: ManifestEntry;
}

function dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function latestIstDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseArgs(argv: string[]): CliOptions {
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const separator = arg.indexOf('=');
        if (separator > 2) values.set(arg.slice(2, separator), arg.slice(separator + 1));
        else flags.add(arg.slice(2));
    }

    const from = values.get('from') ?? '2020-01-01';
    const to = values.get('to') ?? latestIstDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        throw new Error(`Invalid date range: ${from} to ${to}. Use YYYY-MM-DD.`);
    }
    const importToDatabase = flags.has('import');
    const rawConcurrency = Number(values.get('concurrency') ?? (importToDatabase ? 1 : 3));
    // Consecutive trading dates update the same MarketInstrument keys. Keep
    // PostgreSQL imports serial to prevent cross-date UPSERT deadlocks while
    // retaining parallelism for network-only archive downloads.
    const requestedConcurrency = Number.isFinite(rawConcurrency) ? Math.max(1, Math.min(6, Math.trunc(rawConcurrency))) : 3;
    const concurrency = importToDatabase ? 1 : requestedConcurrency;
    return {
        from,
        to,
        concurrency,
        archiveDir: path.resolve(values.get('archive-dir') ?? DEFAULT_ARCHIVE_DIR),
        importToDatabase,
        force: flags.has('force'),
        tradeToTradeOnly: flags.has('trade-to-trade-only'),
    };
}

function enumerateWeekdays(from: string, to: string): string[] {
    const result: string[] = [];
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) {
        const weekday = cursor.getUTCDay();
        if (weekday !== 0 && weekday !== 6) result.push(dateKey(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
}

function artifactsFor(archiveDir: string, tradingDate: string): DayArtifacts {
    const date = new Date(`${tradingDate}T00:00:00.000Z`);
    const format = tradingDate >= UDIFF_START_DATE ? 'udiff' : 'legacy';
    const directory = path.join(archiveDir, tradingDate.slice(0, 4), tradingDate.slice(5, 7));
    const bhavName = path.basename(format === 'udiff' ? buildNseBhavcopyUrl(date) : buildNseLegacyBhavcopyUrl(date));
    return {
        dateKey: tradingDate,
        format,
        bhavPath: path.join(directory, bhavName),
        deliveryPath: path.join(directory, path.basename(buildNseDeliveryUrl(date))),
        indexPath: path.join(directory, path.basename(buildNseIndexReportUrl(date))),
    };
}

async function existsWithData(filePath: string): Promise<boolean> {
    try {
        return (await fs.stat(filePath)).size > 0;
    } catch {
        return false;
    }
}

async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.part`;
    await fs.writeFile(temporaryPath, data);
    await fs.rename(temporaryPath, filePath);
}

function statusCode(error: unknown): number | undefined {
    return axios.isAxiosError(error) ? error.response?.status : undefined;
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function download(url: string, optional = false): Promise<Buffer | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            await sleep(100 + Math.floor(Math.random() * 125));
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30_000,
                headers: NSE_HEADERS,
            });
            return Buffer.from(response.data);
        } catch (error) {
            lastError = error;
            const status = statusCode(error);
            if (status === 404 || (optional && status === 403)) return null;
            if (status !== 429 && (!status || status < 500) && attempt === 0) break;
            if (attempt < 3) await sleep(750 * (2 ** attempt) + Math.floor(Math.random() * 300));
        }
    }
    throw lastError;
}

function parseEquityArchive(archive: Buffer, artifacts: DayArtifacts, deliveryText: string | null): NseEodRecord[] {
    const zip = new AdmZip(archive);
    const csvEntry = zip.getEntries().find(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.csv'));
    if (!csvEntry) throw new Error(`${artifacts.format} Bhavcopy archive has no CSV file.`);
    const delivery = deliveryText ? parseNseDeliveryReport(deliveryText) : new Map();
    const csvText = csvEntry.getData().toString('utf8');
    const records = artifacts.format === 'udiff'
        ? parseNseUdiffBhavcopy(csvText, delivery)
        : parseNseLegacyBhavcopy(csvText, delivery);
    if (records.length < 50) throw new Error(`Bhavcopy has only ${records.length} valid EQ records.`);
    if (records.some(record => record.tradingDate !== artifacts.dateKey)) {
        throw new Error(`Bhavcopy trading date does not match ${artifacts.dateKey}.`);
    }
    return records;
}

async function readOrDownload(filePath: string, url: string, optional = false): Promise<Buffer | null> {
    if (await existsWithData(filePath)) return fs.readFile(filePath);
    const data = await download(url, optional);
    if (data) await writeAtomic(filePath, data);
    return data;
}

/**
 * Backfill for the BE/BZ series that older imports dropped: reads the archived
 * Bhavcopy only (never downloads) and upserts just the non-EQ rows, leaving
 * the date's manifest entry unchanged.
 */
async function importTradeToTrade(options: CliOptions, previous: ManifestEntry | undefined, tradingDate: string): Promise<ProcessResult> {
    const unchanged = { dateKey: tradingDate, entry: previous ?? { status: 'NON_TRADING_DAY' as const, updatedAt: new Date().toISOString() } };
    if (previous?.status !== 'IMPORTED' && previous?.status !== 'DOWNLOADED') return unchanged;
    const artifacts = artifactsFor(options.archiveDir, tradingDate);
    if (!(await existsWithData(artifacts.bhavPath))) {
        tradeToTradeMissingArchives.push(tradingDate);
        return unchanged;
    }
    const delivery = (await existsWithData(artifacts.deliveryPath)) ? (await fs.readFile(artifacts.deliveryPath)).toString('utf8') : null;
    const records = parseEquityArchive(await fs.readFile(artifacts.bhavPath), artifacts, delivery).filter(record => record.series !== 'EQ');
    if (options.importToDatabase && records.length) await upsertNseRecords(records, { historical: true });
    tradeToTradeRows += records.length;
    return unchanged;
}

let tradeToTradeRows = 0;
const tradeToTradeMissingArchives: string[] = [];

async function processDate(options: CliOptions, manifest: Manifest, tradingDate: string): Promise<ProcessResult> {
    const previous = manifest.dates[tradingDate];
    if (options.tradeToTradeOnly) return importTradeToTrade(options, previous, tradingDate);
    if (!options.force && previous?.status === 'NON_TRADING_DAY') {
        return { dateKey: tradingDate, entry: previous };
    }
    if (!options.force && previous?.status === 'IMPORTED' && options.importToDatabase) {
        return { dateKey: tradingDate, entry: previous };
    }
    if (!options.force && previous?.status === 'DOWNLOADED' && !options.importToDatabase) {
        return { dateKey: tradingDate, entry: previous };
    }

    const artifacts = artifactsFor(options.archiveDir, tradingDate);
    const date = new Date(`${tradingDate}T00:00:00.000Z`);
    const bhavUrl = artifacts.format === 'udiff' ? buildNseBhavcopyUrl(date) : buildNseLegacyBhavcopyUrl(date);
    try {
        const archive = await readOrDownload(artifacts.bhavPath, bhavUrl);
        if (!archive) {
            return {
                dateKey: tradingDate,
                entry: { status: 'NON_TRADING_DAY', format: artifacts.format, updatedAt: new Date().toISOString() },
            };
        }

        const [deliveryBuffer, indexBuffer] = await Promise.all([
            readOrDownload(artifacts.deliveryPath, buildNseDeliveryUrl(date), true),
            readOrDownload(artifacts.indexPath, buildNseIndexReportUrl(date), true),
        ]);
        const equityRecords = parseEquityArchive(archive, artifacts, deliveryBuffer?.toString('utf8') ?? null);
        const benchmarkRecords = indexBuffer ? parseNseIndexReport(indexBuffer.toString('utf8'), tradingDate) : [];
        if (options.importToDatabase) await upsertNseRecords([...equityRecords, ...benchmarkRecords]);

        return {
            dateKey: tradingDate,
            entry: {
                status: options.importToDatabase ? 'IMPORTED' : 'DOWNLOADED',
                format: artifacts.format,
                equityRecords: equityRecords.length,
                benchmarkRecords: benchmarkRecords.length,
                hasDelivery: Boolean(deliveryBuffer),
                updatedAt: new Date().toISOString(),
            },
        };
    } catch (error: any) {
        if (statusCode(error) === 404) {
            return {
                dateKey: tradingDate,
                entry: { status: 'NON_TRADING_DAY', format: artifacts.format, updatedAt: new Date().toISOString() },
            };
        }
        return {
            dateKey: tradingDate,
            entry: {
                status: 'FAILED',
                format: artifacts.format,
                updatedAt: new Date().toISOString(),
                error: String(error?.message ?? error).slice(0, 500),
            },
        };
    }
}

async function loadManifest(manifestPath: string): Promise<Manifest> {
    try {
        const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest;
        return parsed.version === 1 && parsed.dates ? parsed : { version: 1, dates: {}, updatedAt: new Date().toISOString() };
    } catch {
        return { version: 1, dates: {}, updatedAt: new Date().toISOString() };
    }
}

async function saveManifest(manifestPath: string, manifest: Manifest): Promise<void> {
    manifest.updatedAt = new Date().toISOString();
    await writeAtomic(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const manifestPath = path.join(options.archiveDir, 'manifest.json');
    const manifest = await loadManifest(manifestPath);
    const dates = enumerateWeekdays(options.from, options.to);
    let processed = 0;

    console.log(`[NSE] ${options.importToDatabase ? 'Download + PostgreSQL import' : 'Archive download'} ${options.from} to ${options.to}`);
    console.log(`[NSE] ${dates.length} weekdays, concurrency ${options.concurrency}, archive ${options.archiveDir}`);

    for (let index = 0; index < dates.length; index += options.concurrency) {
        const batch = dates.slice(index, index + options.concurrency);
        const results = await Promise.all(batch.map(item => processDate(options, manifest, item)));
        if (!options.tradeToTradeOnly) for (const result of results) manifest.dates[result.dateKey] = result.entry;
        processed += results.length;
        if (!options.tradeToTradeOnly) await saveManifest(manifestPath, manifest);
        if (processed % 24 === 0 || processed === dates.length) {
            const selected = dates.map(item => manifest.dates[item]).filter(Boolean);
            const downloaded = selected.filter(item => item.status === 'DOWNLOADED' || item.status === 'IMPORTED').length;
            const nonTrading = selected.filter(item => item.status === 'NON_TRADING_DAY').length;
            const failed = selected.filter(item => item.status === 'FAILED').length;
            console.log(`[NSE] ${processed}/${dates.length} checked; ${downloaded} trading days ready, ${nonTrading} holidays, ${failed} failed.`);
        }
    }

    const selected = dates.map(item => manifest.dates[item]).filter(Boolean);
    const downloaded = selected.filter(item => item.status === 'DOWNLOADED' || item.status === 'IMPORTED').length;
    const imported = selected.filter(item => item.status === 'IMPORTED').length;
    const failed = selected.filter(item => item.status === 'FAILED');
    if (options.tradeToTradeOnly) console.log(`[NSE] Trade-to-trade (BE/BZ) rows ${options.importToDatabase ? 'imported' : 'found'}: ${tradeToTradeRows}; dates without an archived Bhavcopy: ${tradeToTradeMissingArchives.length}${tradeToTradeMissingArchives.length ? ` (first: ${tradeToTradeMissingArchives.slice(0, 5).join(', ')})` : ''}`);
    console.log(`[NSE] Complete: ${downloaded} trading days downloaded; ${imported} imported; ${failed.length} failed.`);
    if (failed.length) {
        console.log(`[NSE] Re-run the same command to retry failed dates. First failures: ${failed.slice(0, 5).map(item => item.error).join(' | ')}`);
        process.exitCode = 1;
    }
}

main()
    .catch(error => {
        console.error('[NSE] Historical backfill failed:', error?.message ?? error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
