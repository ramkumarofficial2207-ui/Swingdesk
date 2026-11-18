import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateHistory, getWorkspaceHistory, type HistoryCandle } from '../src/workspaceChart';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
const candle = (time: string, open: number, high: number, low: number, close: number, volume = 10): HistoryCandle => ({ time, open, high, low, close, volume });
function providerData() {
    return { data: { chart: { result: [{ timestamp: [1609459200, 1609718400], indicators: { quote: [{ open: [10, 12], high: [13, 15], low: [9, 11], close: [12, 14], volume: [100, 200] }] } }] } } };
}

describe('workspace chart aggregation', () => {
    it('sorts unsorted candles and preserves OHLCV across a week and year boundary', () => {
        const input = [candle('2025-01-06', 20, 25, 19, 24), candle('2025-01-03', 12, 18, 11, 17), candle('2024-12-30', 10, 14, 9, 12)];
        const result = aggregateHistory(input, '1wk');
        expect(result).toEqual([candle('2024-12-30', 10, 18, 9, 17, 20), candle('2025-01-06', 20, 25, 19, 24)]);
        expect(input[0].time).toBe('2025-01-06');
    });
    it('keeps different months separate and daily candles ungrouped', () => {
        const input = [candle('2025-01-30', 10, 14, 9, 12), candle('2025-01-31', 12, 18, 11, 17), candle('2025-02-03', 20, 25, 19, 24)];
        expect(aggregateHistory(input, '1mo')).toEqual([candle('2025-01-30', 10, 18, 9, 17, 20), candle('2025-02-03', 20, 25, 19, 24)]);
        expect(aggregateHistory(input, '1d')).toEqual(input);
    });
});

describe('workspace history retrieval', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
        vi.mocked(axios.get).mockResolvedValue(providerData());
    });
    afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

    it('requests five full years instead of the scanner historical limit', async () => {
        await getWorkspaceHistory('TEST5Y', '5Y', '1wk');
        expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('TEST5Y.NS'), expect.objectContaining({ params: expect.objectContaining({
            period1: Date.parse('2021-11-17T12:00:00Z') / 1000, interval: '1d',
        }) }));
    });
    it('requests all provider history from epoch and labels coverage limitation', async () => {
        const result = await getWorkspaceHistory('TESTALL', 'ALL', '1mo') as { note: string };
        expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ params: expect.objectContaining({ period1: 0 }) }));
        expect(result.note).toMatch(/not guaranteed/);
    });
    it('reports the final raw trading date when the last monthly bar begins earlier', async () => {
        const result = await getWorkspaceHistory('TESTCOVERAGE', 'ALL', '1mo') as { candles: HistoryCandle[]; from: string; to: string };
        expect(result.candles).toHaveLength(1);
        expect(result.candles[0].time).toBe('2021-01-01');
        expect(result.from).toBe('2021-01-01');
        expect(result.to).toBe('2021-01-04');
    });
    it.each([['../SECRET', '5Y', '1d'], ['RELIANCE', '100Y', '1d'], ['RELIANCE', '5Y', '1s']])('rejects invalid selections before a network request', async (ticker, range, interval) => {
        await expect(getWorkspaceHistory(ticker, range, interval)).rejects.toThrow('Invalid chart selection');
        expect(axios.get).not.toHaveBeenCalled();
    });
    it('filters null and impossible OHLC rows instead of drawing fabricated zero prices', async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: { chart: { result: [{
            timestamp: [1609459200, 1609545600, 1609632000, 1609718400],
            indicators: { quote: [{ open: [10, null, 10, 12], high: [13, 5, 8, 15], low: [9, 2, 9, 11], close: [12, 4, 12, 14], volume: [100, 100, 100, 200] }] },
        }] } } });
        const result = await getWorkspaceHistory('TESTFILTER', 'ALL', '1d') as { candles: HistoryCandle[] };
        expect(result.candles).toHaveLength(2);
        expect(result.candles.map(c => c.close)).toEqual([12, 14]);
    });
    it('reports unavailable history when the provider has no usable candles', async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: { chart: { result: [] } } });
        await expect(getWorkspaceHistory('TESTEMPTY', 'ALL', '1d')).rejects.toThrow(/unavailable/);
    });
    it('caches identical selections only within its freshness window', async () => {
        await getWorkspaceHistory('TESTCACHE', '5Y', '1wk');
        await getWorkspaceHistory('TESTCACHE', '5Y', '1wk');
        expect(axios.get).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(300001);
        await getWorkspaceHistory('TESTCACHE', '5Y', '1wk');
        expect(axios.get).toHaveBeenCalledTimes(2);
    });
});
