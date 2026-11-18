import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getDhanApiFromEnv } from './dhanClient';
import { PreSurgeReplayArtifact } from './preSurgeV2Replay';
import { Candle } from './types';

interface DateRange {
    from: string;
    to: string;
}

interface IntradayCacheFile {
    ticker: string;
    interval: '5m';
    downloadedAt: string;
    requestedRanges: DateRange[];
    candles: Candle[];
}

interface Options {
    input: string;
    cacheDir: string;
    baselineDays: number;
    forwardDays: number;
    delayMs: number;
    force: boolean;
    v3Only: boolean;
}

function parseArgs(argv: string[]): Options {
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const separator = arg.indexOf('=');
        if (separator > 2) values.set(arg.slice(2, separator), arg.slice(separator + 1));
        else flags.add(arg.slice(2));
    }
    const integer = (name: string, fallback: number, min: number, max: number): number => {
        const value = Number(values.get(name));
        return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
    };
    return {
        input: resolve(values.get('input') ?? 'reports/backtests/presurge_v2_signals.json'),
        cacheDir: resolve(values.get('cache-dir') ?? 'reports/backtests/presurge_v2_intraday'),
        baselineDays: integer('baseline-days', 20, 10, 45),
        forwardDays: integer('forward-days', 45, 30, 75),
        delayMs: integer('delay-ms', 250, 200, 2_000),
        force: flags.has('force'),
        v3Only: flags.has('v3-only'),
    };
}

function shiftDate(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function rangeForSignal(signalDate: string, baselineDays: number, forwardDays: number): DateRange {
    return {
        from: shiftDate(signalDate, -baselineDays),
        to: shiftDate(signalDate, forwardDays),
    };
}

function mergeRanges(ranges: DateRange[]): DateRange[] {
    const sorted = [...ranges].sort((left, right) => left.from.localeCompare(right.from));
    const merged: DateRange[] = [];
    for (const range of sorted) {
        const previous = merged[merged.length - 1];
        if (!previous || range.from > shiftDate(previous.to, 1)) {
            merged.push({ ...range });
            continue;
        }
        if (range.to > previous.to) previous.to = range.to;
    }
    return merged;
}

function splitRanges(ranges: DateRange[], maximumDays = 89): DateRange[] {
    const result: DateRange[] = [];
    for (const range of ranges) {
        let cursor = range.from;
        while (cursor < range.to) {
            const boundary = shiftDate(cursor, maximumDays);
            const to = boundary < range.to ? boundary : range.to;
            result.push({ from: cursor, to });
            if (to === range.to) break;
            cursor = to;
        }
    }
    return result;
}

function containsRange(ranges: DateRange[], target: DateRange): boolean {
    return ranges.some(range => range.from <= target.from && range.to >= target.to);
}

function istInstant(date: string, time: string): Date {
    return new Date(`${date}T${time}+05:30`);
}

function cachePath(cacheDir: string, ticker: string): string {
    return resolve(cacheDir, `${ticker.replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}.json`);
}

function loadCache(file: string, ticker: string): IntradayCacheFile {
    if (!existsSync(file)) {
        return { ticker, interval: '5m', downloadedAt: '', requestedRanges: [], candles: [] };
    }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as IntradayCacheFile;
    return {
        ticker,
        interval: '5m',
        downloadedAt: parsed.downloadedAt ?? '',
        requestedRanges: Array.isArray(parsed.requestedRanges) ? parsed.requestedRanges : [],
        candles: Array.isArray(parsed.candles) ? parsed.candles : [],
    };
}

function deduplicate(candles: Candle[]): Candle[] {
    const byTimestamp = new Map<number, Candle>();
    for (const candle of candles) {
        const timestamp = Number(candle.timestamp ?? new Date(candle.date).getTime());
        if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
        byTimestamp.set(timestamp, { ...candle, timestamp });
    }
    return [...byTimestamp.values()].sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    if (!existsSync(options.input)) throw new Error(`Signal artifact not found: ${options.input}`);
    const artifact = JSON.parse(readFileSync(options.input, 'utf8')) as PreSurgeReplayArtifact;
    if (artifact.strategyVersion !== 'PRE_SURGE_V2' || !Array.isArray(artifact.signals)) {
        throw new Error('Input is not a PRE_SURGE_V2 signal artifact.');
    }
    mkdirSync(options.cacheDir, { recursive: true });
    const api = getDhanApiFromEnv();
    if (!api) throw new Error('Dhan authentication is not configured.');
    const sourceSignals = options.v3Only
        ? artifact.signals.filter(signal => signal.preSurgeV3?.eligible)
        : artifact.signals;
    const rangesByTicker = new Map<string, DateRange[]>();
    for (const signal of sourceSignals) {
        const values = rangesByTicker.get(signal.ticker) ?? [];
        values.push(rangeForSignal(signal.signalDate, options.baselineDays, options.forwardDays));
        rangesByTicker.set(signal.ticker, values);
    }
    const tickers = [...rangesByTicker.keys()].sort();
    let requestCount = 0;
    let downloadedCandles = 0;
    const failures: Array<{ ticker: string; range: DateRange; message: string }> = [];

    for (let tickerIndex = 0; tickerIndex < tickers.length; tickerIndex += 1) {
        const ticker = tickers[tickerIndex];
        const file = cachePath(options.cacheDir, ticker);
        const cache = loadCache(file, ticker);
        const requiredRanges = splitRanges(mergeRanges(rangesByTicker.get(ticker) ?? []));
        for (const range of requiredRanges) {
            if (!options.force && containsRange(cache.requestedRanges, range)) continue;
            try {
                const from = istInstant(range.from, '09:15:00');
                const to = istInstant(range.to, '15:30:00');
                const candles = await api.getHistoricalDataRange(ticker, '5m', from, to);
                cache.candles = deduplicate([...cache.candles, ...candles]);
                cache.requestedRanges = mergeRanges([...cache.requestedRanges, range]);
                cache.downloadedAt = new Date().toISOString();
                writeFileSync(file, `${JSON.stringify(cache)}\n`, 'utf8');
                requestCount += 1;
                downloadedCandles += candles.length;
                await sleep(options.delayMs);
            } catch (error: any) {
                const message = String(error?.response?.data?.errorMessage || error?.message || error).slice(0, 240);
                failures.push({ ticker, range, message });
                console.warn(`[Dhan 5m] ${ticker} ${range.from}..${range.to} failed: ${message}`);
            }
        }
        if (tickerIndex === 0 || tickerIndex + 1 === tickers.length || (tickerIndex + 1) % 10 === 0) {
            console.log(`[Dhan 5m] ${tickerIndex + 1}/${tickers.length} tickers; ${requestCount} requests; ${downloadedCandles} candles; ${failures.length} failures.`);
        }
    }
    const manifest = {
        generatedAt: new Date().toISOString(),
        sourceSignals: options.input,
        signalFilter: options.v3Only ? 'V3_ELIGIBLE_ONLY' : 'ALL_V2_SIGNALS',
        signals: sourceSignals.length,
        tickers: tickers.length,
        requests: requestCount,
        downloadedCandles,
        failures,
    };
    writeFileSync(resolve(options.cacheDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`[Dhan 5m] Backfill complete: ${downloadedCandles} candles, ${failures.length} failures.`);
    if (failures.length > Math.max(3, Math.ceil(requestCount * 0.05))) process.exitCode = 2;
}

if (require.main === module) {
    main().catch(error => {
        console.error('[Dhan 5m] Backfill failed:', error?.message ?? error);
        process.exitCode = 1;
    });
}
