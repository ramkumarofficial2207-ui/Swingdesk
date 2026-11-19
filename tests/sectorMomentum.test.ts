import { describe, expect, it } from 'vitest';
import { Candidate } from '../src/research/harness';
import { hotIndustries, sectorPerDay } from '../src/research/cards/sectorMomentum';
import { excessStats } from '../src/research/studyRunner';

const exit = { stopPct: null, targetPct: null, horizon: 5 };
const c = (symbol: string, industry: string, todayPct: number): Candidate => ({ symbol, industry, index: 0, score: 1, exit, meta: { todayPct } });

describe('hotIndustries', () => {
    it('marks an industry with enough members among the top gainers', () => {
        const list = [c('A1', 'Auto', 9), c('A2', 'Auto', 8), c('I1', 'IT', 7), c('A3', 'Auto', 6), c('A4', 'Auto', 1), c('U1', 'Unknown', 10)];
        // Top 5 = U1, A1, A2, I1, A3: the unlabelled stock takes a slot but is not counted.
        expect([...hotIndustries(list, 5, 3)]).toEqual(['Auto']);
        expect(hotIndustries(list, 4, 3).size).toBe(0);
    });

    it('never counts unlabelled stocks toward a sector', () => {
        const list = [c('U1', 'Unknown', 9), c('U2', 'Unknown', 8), c('U3', 'Unknown', 7)];
        expect(hotIndustries(list, 3, 2).size).toBe(0);
    });
});

describe('sectorPerDay', () => {
    it('keeps every labelled stock in a hot industry, including ones that fell today', () => {
        const list = [
            ...Array.from({ length: 4 }, (_, k) => c(`A${k}`, 'Auto', 10 - k)),
            ...Array.from({ length: 26 }, (_, k) => c(`X${k}`, `S${k}`, 5 - k / 10)),
            c('A9', 'Auto', -2),
            c('U1', 'Unknown', 9),
        ];
        expect(sectorPerDay('2024-01-01', list).map(item => item.symbol).sort()).toEqual(['A0', 'A1', 'A2', 'A3', 'A9']);
    });
});

describe('excessStats', () => {
    it('subtracts each day\'s control mean and averages per day', () => {
        const trade = (signalDate: string, netPct: number) => ({ symbol: 'X', industry: 'I', signalDate, entryDate: signalDate, exitDate: signalDate, entryIndex: 0, exitIndex: 0, entry: 1, exit: 1, outcome: 'TIME' as const, netPct, delayedExit: false, stopPct: null });
        const result = excessStats([trade('d1', 3), trade('d1', 1), trade('d2', 0)], new Map([['d1', 1], ['d2', 1]]));
        // Excess: d1 → +2, 0; d2 → −1.
        expect(result.avg).toBeCloseTo(1 / 3);
        expect(result.dayClustered).toBeCloseTo((1 + -1) / 2);
    });
});
