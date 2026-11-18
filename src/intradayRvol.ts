import { fetchHistoricalData, NSE_UNIVERSE } from './dataService';
import { Candle } from './types';

const IST_TIMEZONE = 'Asia/Kolkata';
const MARKET_OPEN_MINUTE = 9 * 60 + 15;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;
const BASELINE_TTL_MS = 5 * 60 * 1000;

export interface RvolObservation {
    rvol: number;
    baselineVolume: number;
    sampleCount: number;
    bucket: string;
}

export interface IntradayPollingSnapshot extends RvolObservation {
    ticker: string;
    ltp: number;
    cumulativeVolume: number;
    fetchedAt: number;
}

interface IstParts {
    date: string;
    minute: number;
    bucket: string;
}

interface VolumeBaseline {
    fetchedAt: number;
    byBucket: Map<string, number[]>;
}

const baselineCache = new Map<string, VolumeBaseline>();

function envInt(name: string, fallback: number, min: number, max: number): number {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function istParts(value: Date | string | number): IstParts {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '0';
    const hour = Number(part('hour'));
    const minute = Number(part('minute'));
    const sessionMinute = hour * 60 + minute;
    const bucketMinute = Math.floor(sessionMinute / 5) * 5;
    return {
        date: `${part('year')}-${part('month')}-${part('day')}`,
        minute: sessionMinute,
        bucket: `${String(Math.floor(bucketMinute / 60)).padStart(2, '0')}:${String(bucketMinute % 60).padStart(2, '0')}`,
    };
}

function isMarketMinute(minute: number): boolean {
    return minute >= MARKET_OPEN_MINUTE && minute <= MARKET_CLOSE_MINUTE;
}

function buildBaseline(candles: Candle[], currentDate: string): VolumeBaseline {
    const byDate = new Map<string, Map<string, number>>();

    for (const candle of candles) {
        if (!candle.date || !Number.isFinite(candle.volume) || candle.volume <= 0) continue;
        const parts = istParts(candle.date);
        if (!isMarketMinute(parts.minute) || parts.date === currentDate) continue;
        const session = byDate.get(parts.date) ?? new Map<string, number>();
        session.set(parts.bucket, (session.get(parts.bucket) ?? 0) + candle.volume);
        byDate.set(parts.date, session);
    }

    const byBucket = new Map<string, number[]>();
    for (const session of byDate.values()) {
        let cumulative = 0;
        const buckets = Array.from(session.entries()).sort(([a], [b]) => a.localeCompare(b));
        for (const [bucket, volume] of buckets) {
            cumulative += volume;
            const samples = byBucket.get(bucket) ?? [];
            samples.push(cumulative);
            byBucket.set(bucket, samples);
        }
    }

    return { fetchedAt: Date.now(), byBucket };
}

function samplesAtOrBefore(baseline: VolumeBaseline, bucket: string): number[] {
    const entries = Array.from(baseline.byBucket.entries())
        .filter(([key]) => key <= bucket)
        .sort(([a], [b]) => b.localeCompare(a));
    return entries[0]?.[1] ?? [];
}

async function loadBaseline(ticker: string, currentDate: string, candles?: Candle[]): Promise<VolumeBaseline> {
    const normalizedTicker = ticker.toUpperCase();
    const cached = baselineCache.get(normalizedTicker);
    if (cached && Date.now() - cached.fetchedAt < BASELINE_TTL_MS) return cached;

    const sourceCandles = candles ?? await fetchHistoricalData(
        NSE_UNIVERSE[normalizedTicker] ?? `${normalizedTicker}.NS`,
        envInt('RVOL_LOOKBACK_DAYS', 10, 5, 10),
        '5m',
    );
    const baseline = buildBaseline(sourceCandles, currentDate);
    baselineCache.set(normalizedTicker, baseline);
    return baseline;
}

/**
 * Computes cumulative same-time RVOL. The live volume supplied by Dhan must
 * be the current-session cumulative volume, which is what the Dhan ticker
 * packet exposes. Historical Yahoo 5m candles provide the comparison curve.
 */
export async function calculateIntradayRvol(
    ticker: string,
    currentCumulativeVolume: number,
    at = new Date(),
    candles?: Candle[],
): Promise<RvolObservation | null> {
    if (!Number.isFinite(currentCumulativeVolume) || currentCumulativeVolume <= 0) return null;
    const now = istParts(at);
    if (!isMarketMinute(now.minute)) return null;

    const baseline = await loadBaseline(ticker, now.date, candles);
    const samples = samplesAtOrBefore(baseline, now.bucket);
    const minimumSamples = envInt('RVOL_MIN_SESSIONS', 3, 3, 10);
    if (samples.length < minimumSamples) return null;

    const baselineVolume = samples.reduce((sum, volume) => sum + volume, 0) / samples.length;
    if (!Number.isFinite(baselineVolume) || baselineVolume <= 0) return null;

    return {
        rvol: +(currentCumulativeVolume / baselineVolume).toFixed(2),
        baselineVolume: +baselineVolume.toFixed(2),
        sampleCount: samples.length,
        bucket: now.bucket,
    };
}

/**
 * REST fallback used only when the Dhan stream is unavailable. Yahoo intraday
 * data can be delayed, so the result is still audited as a fallback source
 * and never presented as a broker-executed fill.
 */
export async function fetchIntradayPollingSnapshot(ticker: string, at = new Date()): Promise<IntradayPollingSnapshot | null> {
    const yahooTicker = NSE_UNIVERSE[ticker.toUpperCase()] ?? `${ticker.toUpperCase()}.NS`;
    const candles = await fetchHistoricalData(yahooTicker, 2, '5m');
    if (!candles.length) return null;

    const now = istParts(at);
    const todayCandles = candles.filter(candle => istParts(candle.date).date === now.date);
    const latest = todayCandles[todayCandles.length - 1];
    if (!latest || !Number.isFinite(latest.close) || latest.close <= 0) return null;

    const cumulativeVolume = todayCandles
        .filter(candle => isMarketMinute(istParts(candle.date).minute))
        .reduce((sum, candle) => sum + Math.max(0, candle.volume || 0), 0);
    const observation = await calculateIntradayRvol(ticker, cumulativeVolume, at, candles);
    if (!observation) return null;

    return {
        ticker: ticker.toUpperCase(),
        ltp: +latest.close.toFixed(2),
        cumulativeVolume,
        fetchedAt: Date.now(),
        ...observation,
    };
}

export function clearIntradayRvolCache(): void {
    baselineCache.clear();
}
