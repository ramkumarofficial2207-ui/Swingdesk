import { describe, expect, it } from 'vitest';
import { Bar } from '../src/earlySession';
import { intradayPortfolio, pickDaily, simulateIntradayTrade, STUDY } from '../src/research/earlySessionStudy';

const bar = (time: string, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 100 });
const levels = { maxEntry: 100.3, stop: 99, target: 101.5 };

describe('intraday trade simulation', () => {
    it('enters at the 09:50 open and exits at the target', () => {
        const t = simulateIntradayTrade([bar('09:45', 100, 100.2, 99.9, 100), bar('09:50', 100.1, 100.6, 100, 100.5), bar('09:55', 100.5, 101.6, 100.4, 101.4)], levels);
        expect(t).toMatchObject({ entry: 100.1, exit: 101.5, outcome: 'TARGET' });
        expect(t!.netPct).toBeCloseTo((101.5 / 100.1 - 1) * 100 - STUDY.costPct, 6);
    });

    it('counts a bar touching both levels as the stop', () => {
        const t = simulateIntradayTrade([bar('09:50', 100, 100.2, 99.9, 100), bar('09:55', 100, 101.8, 98.8, 100)], levels);
        expect(t).toMatchObject({ outcome: 'STOP', exit: 99 });
    });

    it('exits at the open when a bar gaps through the stop', () => {
        const t = simulateIntradayTrade([bar('09:50', 100, 100.2, 99.9, 100), bar('09:55', 98.5, 98.7, 98.2, 98.4)], levels);
        expect(t).toMatchObject({ outcome: 'STOP', exit: 98.5 });
    });

    it('skips the trade when 09:50 opens above the maximum entry or at the stop, or is missing', () => {
        expect(simulateIntradayTrade([bar('09:50', 100.4, 101, 100.3, 100.8)], levels)).toBeNull();
        expect(simulateIntradayTrade([bar('09:50', 99, 99.5, 98.9, 99.2)], levels)).toBeNull();
        expect(simulateIntradayTrade([bar('09:55', 100, 100.2, 99.9, 100)], levels)).toBeNull();
    });

    it('time-exits at the 15:10 open, or the last close if 15:10 is missing', () => {
        const day = [bar('09:50', 100, 100.2, 99.9, 100), bar('15:05', 100.3, 100.4, 100.2, 100.35), bar('15:10', 100.4, 100.5, 100.3, 100.45), bar('15:15', 99, 99, 98, 98)];
        expect(simulateIntradayTrade(day, levels)).toMatchObject({ outcome: 'TIME', exit: 100.4 });
        expect(simulateIntradayTrade(day.slice(0, 2), levels)).toMatchObject({ outcome: 'TIME', exit: 100.35 });
    });
});

describe('daily selection and portfolio', () => {
    it('takes at most 5 a day and 2 per sector, highest volume first', () => {
        const c = (symbol: string, sector: string, relativeVolume: number) => ({ symbol, sector, relativeVolume });
        const picked = pickDaily([c('A', 'Auto', 5), c('B', 'Auto', 4), c('C', 'Auto', 6), c('D', 'Bank', 3), c('E', 'IT', 2), c('F', 'IT', 2.5), c('G', 'Pharma', 2.1)]);
        expect(picked.map(p => p.symbol)).toEqual(['C', 'A', 'D', 'F', 'G']);
    });

    it('sizes by risk, caps the position, and tracks drawdown', () => {
        const t = (date: string, netPct: number, stopPct: number) => ({ symbol: 'X', sector: 'S', date, entry: 100, exit: 100, outcome: 'TIME' as const, netPct, stopPct });
        // 1% stop → 0.5% risk / 1% = 50% weight, capped at 20%.
        const p = intradayPortfolio([t('2025-01-01', 2, 1), t('2025-01-02', -5, 1)]);
        expect(p.days).toBe(2);
        expect(p.totalReturnPct).toBeCloseTo(((1 + 0.2 * 0.02) * (1 - 0.2 * 0.05) - 1) * 100, 6);
        expect(p.maxDrawdownPct).toBeCloseTo(1, 6);
    });
});
