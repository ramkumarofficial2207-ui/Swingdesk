import { describe, expect, it } from 'vitest';
import { adviseExit, classifyRegime, confirmAt945 } from '../src/tradingDesk';

describe('market regime', () => {
    it('is GREEN with NIFTY above both averages and broad participation', () => {
        expect(classifyRegime({ breadthPct: 62, nifty: 25500, niftySma50: 25000, niftySma200: 24500 }).state).toBe('GREEN');
    });
    it('is RED below the 200-day average or with weak breadth', () => {
        expect(classifyRegime({ breadthPct: 70, nifty: 24000, niftySma50: 23500, niftySma200: 24500 }).state).toBe('RED');
        expect(classifyRegime({ breadthPct: 30, nifty: 25500, niftySma50: 25000, niftySma200: 24500 }).state).toBe('RED');
    });
    it('is AMBER in between', () => {
        expect(classifyRegime({ breadthPct: 45, nifty: 25500, niftySma50: 25000, niftySma200: 24500 }).state).toBe('AMBER');
        expect(classifyRegime({ breadthPct: 60, nifty: 24900, niftySma50: 25000, niftySma200: 24500 }).state).toBe('AMBER');
    });
});

const bars = (closes: number[], lows?: number[]) => ['09:15', '09:20', '09:25', '09:30', '09:35', '09:40'].map((time, i) => ({ time, high: closes[i] + 0.2, low: lows?.[i] ?? closes[i] - 0.2, close: closes[i] }));

describe('morning confirmation at 09:45', () => {
    it('confirms above yesterday’s high with a tight stop under the day’s low', () => {
        const c = confirmAt945('X', bars([100, 100.5, 101, 101.2, 101.4, 101.6]), 101);
        expect(c.status).toBe('CONFIRMED');
        expect(c.stop).toBeCloseTo(99.8);
        expect(c.stopPct).toBeLessThan(2.5);
        expect(c.target).toBeCloseTo(101.6 * 1.05);
        expect(c.maxEntry).toBeCloseTo(101.6 * 1.003);
    });
    it('waits when the price has not cleared yesterday’s high', () => {
        expect(confirmAt945('X', bars([100, 100, 100, 100, 100, 100.5]), 101).status).toBe('NOT_TRIGGERED');
    });
    it('rejects a stop wider than 2.5%', () => {
        expect(confirmAt945('X', bars([100, 100.5, 101, 101.2, 101.4, 101.6], [97, 100, 100, 100, 100, 100]), 101).status).toBe('STOP_TOO_WIDE');
    });
    it('needs all six bars and yesterday’s high', () => {
        expect(confirmAt945('X', bars([100, 101, 102, 103, 104, 105]).slice(0, 5), 101).status).toBe('NO_DATA');
        expect(confirmAt945('X', bars([100, 101, 102, 103, 104, 105]), null).status).toBe('NO_DATA');
    });
});

describe('exit assistant', () => {
    const trade = { id: 't', ticker: 'X', entryPrice: 100, stopLossInit: 97.5 };
    const day = (high: number, low: number, close: number) => ({ high, low, close });
    it('exits when the stop traded', () => {
        expect(adviseExit(trade, [day(101, 97, 98)], 2).action).toBe('EXIT_STOP');
    });
    it('takes half at +5% and moves the stop to entry', () => {
        const a = adviseExit(trade, [day(101, 99, 100.5), day(105.5, 102, 104)], 2);
        expect(a.action).toBe('TAKE_HALF');
        expect(a.suggestedStop).toBe(100);
    });
    it('trails under the last low once the stop is at entry', () => {
        const a = adviseExit({ ...trade, stopLossTrail: 100 }, [day(105.5, 102, 104), day(107, 104.5, 106.5)], 3);
        expect(a.action).toBe('TRAIL');
        expect(a.suggestedStop).toBe(104.5);
    });
    it('time-stops after 7 sessions without the target', () => {
        expect(adviseExit(trade, Array.from({ length: 7 }, () => day(102, 99, 101)), 7).action).toBe('TIME_EXIT');
    });
    it('holds otherwise and reports R', () => {
        const a = adviseExit(trade, [day(102, 99, 101.25)], 1);
        expect(a.action).toBe('HOLD');
        expect(a.rNow).toBeCloseTo(0.5);
    });
});
