// ================================================================
// nseDiscovery.ts — Dynamic NSE Universe · Zero Hardcoding
// ================================================================
// Every trading day NSE publishes a free public Bhavcopy CSV with
// OHLCV for EVERY listed stock. We download it, parse it, and use
// it as the live universe — no static list anywhere.
// ================================================================

import { fetchLatestFinalNseEod } from './eodMarketDataService';

export interface BhavRecord {
    symbol: string;         // NSE symbol e.g. DALMIASUG
    yahooTicker: string;    // Yahoo Finance ticker e.g. DALMIASUG.NS
    open: number;
    high: number;
    low: number;
    close: number;
    prevClose: number;
    pctChange: number;
    totalVolQty: number;    // shares traded
    totalTradValCr: number; // daily turnover in crores
    totalTrades: number;    // number of trades (best liquidity proxy)
    isin: string;
}

// ── In-memory cache (avoids re-downloading on every scan) ────────
let _cache: { records: BhavRecord[]; timestamp: number; dateLabel: string } | null = null;

async function fetchLatestBhavcopy(): Promise<BhavRecord[]> {
    const bundle = await fetchLatestFinalNseEod();
    return bundle.records.map(row => ({
        symbol: row.symbol,
        yahooTicker: `${row.symbol}.NS`,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        prevClose: row.previousClose ?? row.close,
        pctChange: row.previousClose && row.previousClose > 0
            ? +(((row.close - row.previousClose) / row.previousClose) * 100).toFixed(2)
            : 0,
        totalVolQty: row.volume,
        totalTradValCr: row.turnoverCr,
        totalTrades: row.totalTrades,
        isin: row.isin ?? '',
    }));
}

// ── Public: raw bhavcopy with cache ─────────────────────────────
export async function getNseBhavcopy(): Promise<BhavRecord[]> {
    const now = Date.now();
    // Refresh every 4 hours; the official report is finalized once per session.
    if (_cache && now - _cache.timestamp < 4 * 60 * 60 * 1000) {
        return _cache.records;
    }

    const records = await fetchLatestBhavcopy();
    if (records.length > 0) {
        const today = new Date().toDateString();
        _cache = { records, timestamp: now, dateLabel: today };
    }
    return _cache?.records ?? [];
}

// ── Public: full liquid equity universe from bhavcopy ────────────
// No hardcoded stocks. Every NSE-listed EQ-series stock that clears
// basic liquidity thresholds is included automatically.
export async function getDynamicUniverse(options: {
    minClose?: number;
    minTurnoverCr?: number;
    minTrades?: number;
} = {}): Promise<BhavRecord[]> {
    const {
        minClose      = 20,    // ₹20 minimum price
        minTurnoverCr = 2,     // ₹2 Cr minimum daily turnover
        minTrades     = 300,   // at least 300 trades (not just a few block deals)
    } = options;

    const all = await getNseBhavcopy();
    return all.filter(r =>
        r.close      >= minClose       &&
        r.totalTradValCr >= minTurnoverCr &&
        r.totalTrades    >= minTrades
    );
}

// ── Public: momentum pre-screen ──────────────────────────────────
// Returns top N stocks ranked by a composite score of:
//   - recent % gain
//   - volume intensity relative to market
//   - green candle (close > prevClose)
// This is used to limit expensive Yahoo Finance API calls to only
// the most promising candidates, while still covering the full NSE.
export async function getMomentumCandidates(limit = 250): Promise<BhavRecord[]> {
    const universe = await getDynamicUniverse({
        minClose: 20,
        minTurnoverCr: 3,
        minTrades: 500,
    });

    if (!universe.length) return [];

    const maxVal = Math.max(...universe.map(r => r.totalTradValCr), 1);

    const scored = universe.map(r => ({
        ...r,
        _score:
            Math.max(0, r.pctChange) * 0.45 +                    // price momentum
            (r.totalTradValCr / maxVal) * 100 * 0.35 +           // volume intensity
            (r.close > r.prevClose ? 0.15 : 0) +                 // trending green
            (r.totalTrades > 5000 ? 0.05 : 0),                   // institution-level activity
    }));

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, limit);
}

// ── Public: top gainers for alerts / diagnostics ─────────────────
export async function getTopGainersToday(minPct = 3, limit = 50): Promise<BhavRecord[]> {
    const universe = await getDynamicUniverse({ minTurnoverCr: 2 });
    return universe
        .filter(r => r.pctChange >= minPct)
        .sort((a, b) => b.pctChange - a.pctChange)
        .slice(0, limit);
}

// ── Public: check if bhavcopy is loaded (for health endpoints) ───
export function getBhavcopyCacheStatus(): { loaded: boolean; symbolCount: number; dateLabel: string | null } {
    return {
        loaded:      !!_cache && _cache.records.length > 0,
        symbolCount: _cache?.records.length ?? 0,
        dateLabel:   _cache?.dateLabel ?? null,
    };
}
