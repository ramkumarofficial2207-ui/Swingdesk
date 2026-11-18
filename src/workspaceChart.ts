import axios from 'axios';

export interface HistoryCandle { time: string; open: number; high: number; low: number; close: number; volume: number }
export function aggregateHistory(candles: HistoryCandle[], interval: string): HistoryCandle[] {
    const groups = new Map<string, HistoryCandle>();
    for (const c of [...candles].sort((a, b) => a.time.localeCompare(b.time))) {
        const date = new Date(`${c.time}T00:00:00Z`);
        if (interval === '1wk') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
        const key = interval === '1mo' ? c.time.slice(0, 7) : interval === '1wk' ? date.toISOString().slice(0, 10) : c.time;
        const old = groups.get(key);
        if (old) { old.high = Math.max(old.high, c.high); old.low = Math.min(old.low, c.low); old.close = c.close; old.volume += c.volume; }
        else groups.set(key, { ...c });
    }
    return [...groups.values()];
}
const cache = new Map<string, { at: number; data: unknown }>();
export async function getWorkspaceHistory(ticker: string, range: string, interval: string) {
    if (!/^[A-Z0-9&.-]{1,20}$/.test(ticker) || !['1M', '6M', '1Y', '5Y', 'ALL'].includes(range) || !['1d', '1wk', '1mo'].includes(interval)) throw new Error('Invalid chart selection.');
    const key = `${ticker}:${range}:${interval}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 300000) return hit.data;
    const start = new Date();
    if (range === '1M') start.setUTCMonth(start.getUTCMonth() - 1);
    if (range === '6M') start.setUTCMonth(start.getUTCMonth() - 6);
    if (range === '1Y' || range === '5Y') start.setUTCFullYear(start.getUTCFullYear() - (range === '5Y' ? 5 : 1));
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker + '.NS')}`, {
        params: { period1: range === 'ALL' ? 0 : Math.floor(start.getTime() / 1000), period2: Math.floor(Date.now() / 1000), interval: '1d', includePrePost: false },
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000,
    });
    const result = response.data?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const unique = new Map<string, HistoryCandle>();
    (result?.timestamp || []).forEach((time: number, i: number) => {
        if (typeof time !== 'number' || !Number.isFinite(time) || Number.isNaN(new Date(time * 1000).getTime())) return;
        const values = [quote?.open?.[i], quote?.high?.[i], quote?.low?.[i], quote?.close?.[i]];
        if (!values.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) return;
        const [open, high, low, close] = values;
        if (high < Math.max(open, close) || low > Math.min(open, close)) return;
        const day = new Date(time * 1000).toISOString().slice(0, 10);
        const volume = Number(quote.volume?.[i]);
        unique.set(day, { time: day, open, high, low, close, volume: Number.isFinite(volume) ? Math.max(0, volume) : 0 });
    });
    const daily = [...unique.values()].sort((a, b) => a.time.localeCompare(b.time));
    const candles = aggregateHistory(daily, interval);
    if (!candles.length) throw new Error('Historical prices are unavailable for this stock.');
    const data = { ticker, range, interval, candles, source: 'Yahoo Finance', from: daily[0].time, to: daily[daily.length - 1].time,
        note: range === 'ALL' ? 'All history available from the provider; listing-date coverage is not guaranteed.' : 'Historical provider prices. Latest bar may be incomplete.' };
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), data });
    return data;
}
