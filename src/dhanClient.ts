// =====================================================
// dhanClient.ts — Dhan HQ API Market Data Client
// Replaces Yahoo Finance as data source
// Access tokens are supplied by dhanTokenManager and rotate without restart.
// Docs: https://dhanhq.co/docs/v2/
// =====================================================

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { Candle, MarketDataApi, MarketDataInterval } from './types';
import {
    getManagedDhanAccessToken,
    isDhanAuthConfigured,
    refreshDhanTokenAfterUnauthorized,
} from './dhanTokenManager';

const DHAN_BASE_URL = 'https://api.dhan.co/v2';
const DHAN_BASE_URL_SANDBOX = 'https://api.dhan.co/v2';

// Security master cache path (downloaded once daily)
const SECURITY_MASTER_CACHE = path.join(__dirname, '..', '.dhan_securities.json');

interface DhanSecurity {
    SEM_SMST_SECURITY_ID: string;   // Dhan internal security ID
    SEM_TRADING_SYMBOL: string;     // NSE symbol e.g. "RELIANCE"
    SEM_EXCH_INSTRM_TYPE: string;   // "ES" for equity
    SEM_SEGMENT: string;            // "NSE_EQ"
}

interface DhanCandlePayload {
    open?: unknown[];
    high?: unknown[];
    low?: unknown[];
    close?: unknown[];
    volume?: unknown[];
    start_Time?: unknown[];
    timestamp?: unknown[];
}

function formatDhanDate(value: Date, includeTime: boolean): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...(includeTime ? {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        } : {}),
    });
    const parts = formatter.formatToParts(value);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    return includeTime ? `${date} ${part('hour')}:${part('minute')}:${part('second')}` : date;
}

/**
 * Dhan returns parallel arrays. Intraday timestamps must remain full ISO
 * instants; reducing them to YYYY-MM-DD destroys candle ordering and the
 * same-time cumulative-volume baseline used by RVOL.
 */
export function parseDhanCandles(data: DhanCandlePayload): Candle[] {
    const opens = Array.isArray(data?.open) ? data.open : [];
    const highs = Array.isArray(data?.high) ? data.high : [];
    const lows = Array.isArray(data?.low) ? data.low : [];
    const closes = Array.isArray(data?.close) ? data.close : [];
    const volumes = Array.isArray(data?.volume) ? data.volume : [];
    const timestamps = Array.isArray(data?.start_Time)
        ? data.start_Time
        : Array.isArray(data?.timestamp) ? data.timestamp : [];

    const candles: Candle[] = [];
    for (let index = 0; index < closes.length; index += 1) {
        const rawOpen = Number(opens[index]);
        const rawHigh = Number(highs[index]);
        const rawLow = Number(lows[index]);
        const rawClose = Number(closes[index]);
        const rawVolume = Number(volumes[index]);
        if (!Number.isFinite(rawClose) || rawClose <= 0 || !Number.isFinite(rawOpen) || rawOpen <= 0) continue;

        const timestampSeconds = Number(timestamps[index]);
        const timestamp = Number.isFinite(timestampSeconds) && timestampSeconds > 0
            ? timestampSeconds * 1_000
            : undefined;
        const isoDate = timestamp != null
            ? new Date(timestamp).toISOString()
            : new Date().toISOString();
        const open = rawOpen;
        const close = rawClose;
        const high = Number.isFinite(rawHigh) && rawHigh > 0
            ? Math.max(rawHigh, open, close)
            : Math.max(open, close);
        const low = Number.isFinite(rawLow) && rawLow > 0
            ? Math.min(rawLow, open, close)
            : Math.min(open, close);
        const volume = Number.isFinite(rawVolume) && rawVolume >= 0 ? rawVolume : 0;
        candles.push({ date: isoDate, timestamp, open, high, low, close, volume });
    }
    return candles.sort((left, right) => {
        const leftTime = Number(left.timestamp ?? new Date(left.date).getTime());
        const rightTime = Number(right.timestamp ?? new Date(right.date).getTime());
        return leftTime - rightTime;
    });
}

// In-memory symbol → securityId map
let securityMap: Map<string, string> | null = null;
let securityMapLoadedAt: number = 0;
let securityMasterLoadPromise: Promise<void> | null = null;
const SECURITY_MAP_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class DhanMarketDataApi implements MarketDataApi {
    private readonly clientId: string;
    private readonly accessToken: string | (() => Promise<string>);
    private readonly baseUrl: string;
    private readonly onUnauthorized?: (rejectedToken: string) => Promise<string>;

    constructor(
        clientId: string,
        accessToken: string | (() => Promise<string>),
        sandbox = false,
        onUnauthorized?: (rejectedToken: string) => Promise<string>,
    ) {
        this.clientId = clientId;
        this.accessToken = accessToken;
        this.baseUrl = sandbox ? DHAN_BASE_URL_SANDBOX : DHAN_BASE_URL;
        this.onUnauthorized = onUnauthorized;
    }

    private async resolveAccessToken(): Promise<string> {
        return typeof this.accessToken === 'function' ? this.accessToken() : this.accessToken;
    }

    private getHeaders(accessToken: string) {
        return {
            'access-token': accessToken,
            'client-id': this.clientId,
            'Content-Type': 'application/json',
        };
    }

    private async postWithAuth<T>(url: string, body: unknown, timeout: number): Promise<T> {
        const execute = async (accessToken: string) => axios.post<T>(url, body, {
            headers: this.getHeaders(accessToken),
            timeout,
        });
        const accessToken = await this.resolveAccessToken();
        try {
            return (await execute(accessToken)).data;
        } catch (error: any) {
            if (error?.response?.status !== 401 || !this.onUnauthorized) throw error;
            const refreshedToken = await this.onUnauthorized(accessToken);
            return (await execute(refreshedToken)).data;
        }
    }

    // ── Load security master from Dhan CDN ───────────────────────────
    private async loadSecurityMap(): Promise<Map<string, string>> {
        const now = Date.now();

        if (securityMap && (now - securityMapLoadedAt) < SECURITY_MAP_TTL) {
            return securityMap;
        }

        if (!securityMasterLoadPromise) {
            securityMasterLoadPromise = this.refreshSecurityMap(now).finally(() => {
                securityMasterLoadPromise = null;
            });
        }
        await securityMasterLoadPromise;
        if (!securityMap) throw new Error('Dhan security master unavailable');
        return securityMap;
    }

    private async refreshSecurityMap(now: number): Promise<void> {

        // Try loading from disk cache
        if (fs.existsSync(SECURITY_MASTER_CACHE)) {
            try {
                const cached = JSON.parse(fs.readFileSync(SECURITY_MASTER_CACHE, 'utf-8'));
                if (cached.loadedAt && (now - cached.loadedAt) < SECURITY_MAP_TTL) {
                    securityMap = new Map(Object.entries(cached.data));
                    securityMapLoadedAt = cached.loadedAt;
                    console.log(`[Dhan] 📦 Loaded security master from disk cache (${securityMap.size} symbols)`);
                    return;
                }
            } catch { /* ignore, re-download */ }
        }

        // Download fresh security master from Dhan CDN
        console.log('[Dhan] 📥 Downloading security master from Dhan CDN...');
        try {
            const { data } = await axios.get(
                'https://images.dhan.co/api-data/api-scrip-master.csv',
                { timeout: 30000, responseType: 'text' }
            );

            const lines = (data as string).split('\n');
            const header = lines[0].split(',');
            const idxExch   = header.findIndex(h => h.trim() === 'SEM_EXM_EXCH_ID');
            const idxSeg    = header.findIndex(h => h.trim() === 'SEM_SEGMENT');
            const idxSecId  = header.findIndex(h => h.trim() === 'SEM_SMST_SECURITY_ID');
            const idxSymbol = header.findIndex(h => h.trim() === 'SEM_TRADING_SYMBOL');
            const idxSeries = header.findIndex(h => h.trim() === 'SEM_SERIES');

            const map = new Map<string, string>();
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (!cols[idxExch] || !cols[idxSeg]) continue;
                const exch   = cols[idxExch]?.trim();
                const seg    = cols[idxSeg]?.trim();
                const series = cols[idxSeries]?.trim();

                // Only NSE Equity (NSE exchange, E segment, EQ series)
                if (exch === 'NSE' && seg === 'E' && (series === 'EQ' || !series)) {
                    const sym   = cols[idxSymbol]?.trim().toUpperCase();
                    const secId = cols[idxSecId]?.trim();
                    if (sym && secId) map.set(sym, secId);
                }
            }

            securityMap = map;
            securityMapLoadedAt = now;

            // Persist to disk
            fs.writeFileSync(SECURITY_MASTER_CACHE, JSON.stringify({
                loadedAt: now,
                data: Object.fromEntries(map)
            }));

            console.log(`[Dhan] ✅ Security master loaded: ${map.size} NSE equity symbols`);
            return;
        } catch (e: any) {
            console.error('[Dhan] ❌ Failed to download security master:', e.message);
            throw new Error('Dhan security master unavailable');
        }
    }

    private async getSecurityId(ticker: string): Promise<string> {
        const sym = ticker.replace(/\.NS$/i, '').toUpperCase();
        const map = await this.loadSecurityMap();
        const secId = map.get(sym);
        if (!secId) throw new Error(`[Dhan] Security ID not found for ${sym}`);
        return secId;
    }

    /** Resolve a ticker for live-feed subscription without making a quote request. */
    public async resolveSecurityId(ticker: string): Promise<string> {
        return this.getSecurityId(ticker);
    }

    // ── Live LTP ─────────────────────────────────────────────────────
    async getLtp(ticker: string): Promise<number> {
        const secId = await this.getSecurityId(ticker);
        const data: any = await this.postWithAuth(
            `${this.baseUrl}/marketfeed/ltp`,
            { NSE_EQ: [parseInt(secId)] },
            5000,
        );
        const ltp = data?.data?.NSE_EQ?.[secId]?.last_price;
        if (!ltp) throw new Error(`[Dhan] LTP unavailable for ${ticker}`);
        return Number(ltp);
    }

    // ── Historical Candles ────────────────────────────────────────────
    async getHistoricalData(
        ticker: string,
        interval: MarketDataInterval,
        days: number = 300
    ): Promise<Candle[]> {
        const to = new Date();
        const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
        return this.getHistoricalDataRange(ticker, interval, from, to);
    }

    /** Fetch an explicit historical window. Dhan limits minute data to 90
     * calendar days per request; callers doing backfills must chunk ranges. */
    async getHistoricalDataRange(
        ticker: string,
        interval: MarketDataInterval,
        from: Date,
        to: Date,
    ): Promise<Candle[]> {
        if (!(from instanceof Date) || !(to instanceof Date) || from >= to) {
            throw new Error('[Dhan] Historical range must have from < to.');
        }
        const rangeDays = (to.getTime() - from.getTime()) / 86_400_000;
        if (interval !== '1d' && rangeDays > 90.01) {
            throw new Error('[Dhan] Intraday history requests cannot exceed 90 days.');
        }
        const secId = await this.getSecurityId(ticker);

        if (interval === '1d') {
            // Daily candles
            const data: any = await this.postWithAuth(
                `${this.baseUrl}/charts/historical`,
                {
                    securityId: secId,
                    exchangeSegment: 'NSE_EQ',
                    instrument: 'EQUITY',
                    fromDate: formatDhanDate(from, false),
                    toDate: formatDhanDate(to, false),
                },
                15000,
            );
            return parseDhanCandles(data);
        } else {
            // Intraday candles (5m or 15m)
            const dhanInterval = interval === '5m' ? 5 : 15;
            const data: any = await this.postWithAuth(
                `${this.baseUrl}/charts/intraday`,
                {
                    securityId: secId,
                    exchangeSegment: 'NSE_EQ',
                    instrument: 'EQUITY',
                    interval: String(dhanInterval),
                    fromDate: formatDhanDate(from, true),
                    toDate: formatDhanDate(to, true),
                },
                15000,
            );
            return parseDhanCandles(data);
        }
    }

}

// ── Factory — auto-creates from .env ─────────────────────────────────
let dhanApiInstance: DhanMarketDataApi | null = null;

export function getDhanApiFromEnv(): DhanMarketDataApi | null {
    const clientId    = process.env.DHAN_CLIENT_ID;
    const sandbox     = process.env.DHAN_SANDBOX === 'true';

    if (!clientId || !isDhanAuthConfigured()) {
        return null;
    }

    if (dhanApiInstance) return dhanApiInstance;

    console.log(`[Dhan] ✅ Dhan API initialized (${sandbox ? 'Sandbox' : 'Production'}).`);
    dhanApiInstance = new DhanMarketDataApi(
        clientId,
        getManagedDhanAccessToken,
        sandbox,
        refreshDhanTokenAfterUnauthorized,
    );
    return dhanApiInstance;
}

/**
 * Resolve an NSE equity ticker to Dhan's security ID for live WebSocket feeds.
 * The security master is cached by the module, so repeated stream connections
 * do not download it again during its 24-hour TTL.
 */
export async function resolveDhanSecurityId(ticker: string): Promise<string | null> {
    const normalizedTicker = ticker.replace(/\.NS$/i, '').toUpperCase();
    try {
        return await new DhanMarketDataApi('', '').resolveSecurityId(normalizedTicker);
    } catch {
        return null;
    }
}
