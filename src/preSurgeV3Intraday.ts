import { getDhanApiFromEnv } from './dhanClient';
import {
    assessV3BreakoutConfirmation,
    assessV3EarlyConfirmation,
    V3ConfirmationDecision,
    V3PriceBar,
} from './preSurgeV3Strategy';
import { assessV4BreakoutConfirmation, V4ConfirmationDecision } from './preSurgeV4Strategy';
import { Candle, PreSurgeV3Plan, PreSurgeV4Plan } from './types';

const IST_TIMEZONE = 'Asia/Kolkata';
const CACHE_TTL_MS = 45_000;

export interface V3IntradayStructure {
    asOf: string;
    sessionDate: string;
    vwap: number;
    latest5m: V3PriceBar;
    previous5m: V3PriceBar | null;
    latest15m: V3PriceBar;
    fiveMinuteBars: number;
}

interface CacheEntry {
    fetchedAt: number;
    value: V3IntradayStructure | null;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<V3IntradayStructure | null>>();

function istParts(value: Date | string | number): { date: string; minute: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: IST_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
    return {
        date: `${part('year')}-${part('month')}-${part('day')}`,
        minute: Number(part('hour')) * 60 + Number(part('minute')),
    };
}

function candleTime(candle: Candle): number {
    return Number(candle.timestamp ?? new Date(candle.date).getTime());
}

function toBar(candle: Candle): V3PriceBar {
    return { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
}

function aggregate(bars: Candle[]): V3PriceBar | null {
    if (!bars.length) return null;
    return {
        open: bars[0].open,
        high: Math.max(...bars.map(bar => bar.high)),
        low: Math.min(...bars.map(bar => bar.low)),
        close: bars[bars.length - 1].close,
    };
}

async function fetchStructure(ticker: string, observedAt: Date): Promise<V3IntradayStructure | null> {
    const api = getDhanApiFromEnv();
    if (!api) return null;
    const current = istParts(observedAt);
    const candles = (await api.getHistoricalData(ticker, '5m', 2))
        .filter(candle => {
            const parts = istParts(candleTime(candle));
            return parts.date === current.date && parts.minute >= 9 * 60 + 15 && parts.minute <= 15 * 60 + 30;
        })
        // Dhan timestamps five-minute candles at the interval start. Exclude
        // the current incomplete candle so confirmation never sees future
        // high/low/close information.
        .filter(candle => candleTime(candle) + (5 * 60_000) <= observedAt.getTime())
        .sort((left, right) => candleTime(left) - candleTime(right));
    if (candles.length < 3) return null;
    let cumulativePriceVolume = 0;
    let cumulativeVolume = 0;
    for (const candle of candles) {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativePriceVolume += typicalPrice * Math.max(0, candle.volume || 0);
        cumulativeVolume += Math.max(0, candle.volume || 0);
    }
    const latest15m = aggregate(candles.slice(-3));
    if (!latest15m || cumulativeVolume <= 0) return null;
    return {
        asOf: observedAt.toISOString(),
        sessionDate: current.date,
        vwap: +(cumulativePriceVolume / cumulativeVolume).toFixed(2),
        latest5m: toBar(candles[candles.length - 1]),
        previous5m: candles.length > 1 ? toBar(candles[candles.length - 2]) : null,
        latest15m,
        fiveMinuteBars: candles.length,
    };
}

export async function loadV3IntradayStructure(ticker: string, observedAt = new Date()): Promise<V3IntradayStructure | null> {
    const normalized = ticker.trim().replace(/\.NS$/i, '').toUpperCase();
    const cached = cache.get(normalized);
    if (cached && observedAt.getTime() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;
    const pending = inFlight.get(normalized);
    if (pending) return pending;
    const request = fetchStructure(normalized, observedAt)
        .then(value => {
            cache.set(normalized, { fetchedAt: observedAt.getTime(), value });
            return value;
        })
        .finally(() => inFlight.delete(normalized));
    inFlight.set(normalized, request);
    return request;
}

export async function evaluateV3EarlyShadow(params: {
    ticker: string;
    plan: PreSurgeV3Plan;
    zoneTouched: boolean;
    dayOpen?: number | null;
    previousClose?: number | null;
    marketSafe?: boolean;
    observedAt?: Date;
}): Promise<{ decision: V3ConfirmationDecision; structure: V3IntradayStructure } | null> {
    const structure = await loadV3IntradayStructure(params.ticker, params.observedAt);
    if (!structure) return null;
    const openingGapPct = params.dayOpen && params.previousClose && params.previousClose > 0
        ? ((params.dayOpen - params.previousClose) / params.previousClose) * 100
        : 0;
    return {
        structure,
        decision: assessV3EarlyConfirmation({
            plan: params.plan,
            zoneTouched: params.zoneTouched,
            openingGapPct,
            vwap: structure.vwap,
            latest5m: structure.latest5m,
            previous5m: structure.previous5m,
            latest15m: structure.latest15m,
            marketSafe: params.marketSafe !== false,
        }),
    };
}

export async function evaluateV3BreakoutShadow(params: {
    ticker: string;
    plan: PreSurgeV3Plan;
    observedPrice: number;
    observedRvol: number;
    marketSafe?: boolean;
    observedAt?: Date;
}): Promise<{ decision: V3ConfirmationDecision; structure: V3IntradayStructure } | null> {
    const structure = await loadV3IntradayStructure(params.ticker, params.observedAt);
    if (!structure) return null;
    return {
        structure,
        decision: assessV3BreakoutConfirmation({
            plan: params.plan,
            // A breakout fill belongs to the completed 15-minute close, not a
            // later WebSocket tick that happened to request the evaluation.
            observedPrice: structure.latest15m.close,
            observedRvol: params.observedRvol,
            vwap: structure.vwap,
            latest15m: structure.latest15m,
            marketSafe: params.marketSafe !== false,
        }),
    };
}

/**
 * V4 breakout confirmation on the same completed-candle structure used by V3.
 * The decision uses the completed 15-minute bar and session VWAP, never the
 * live tick that requested the evaluation.
 */
export async function evaluateV4BreakoutShadow(params: {
    ticker: string;
    plan: PreSurgeV4Plan;
    observedRvol: number;
    observedAt?: Date;
}): Promise<{ decision: V4ConfirmationDecision; structure: V3IntradayStructure } | null> {
    const structure = await loadV3IntradayStructure(params.ticker, params.observedAt);
    if (!structure) return null;
    return {
        structure,
        decision: assessV4BreakoutConfirmation({
            plan: params.plan,
            observedPrice: structure.latest15m.close,
            observedRvol: params.observedRvol,
            stockVwap: structure.vwap,
            latest15m: structure.latest15m,
        }),
    };
}

export function clearV3IntradayCache(): void {
    cache.clear();
    inFlight.clear();
}
