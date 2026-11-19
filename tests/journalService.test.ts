import { describe, expect, it } from 'vitest';
import { computeJournalStats, JournalTrade, priceExcursions } from '../src/journalService';
import { journalReviewSchema, portfolioTradeSchema } from '../src/validation';

let id = 0;
function trade(overrides: Partial<JournalTrade>): JournalTrade {
    id += 1;
    return {
        id: String(id), ticker: 'ACME', setupType: 'Bull Flag Breakout 🚩', status: 'CLOSED',
        entryDate: new Date(Date.UTC(2026, 0, id)), exitDate: new Date(Date.UTC(2026, 0, id + 3)),
        entryPrice: 100, exitPrice: 100, quantity: 10, stopLossInit: 95, target1: 110,
        pnlRs: 0, rMultiple: 0, daysHeld: 3, exitReason: 'MANUAL',
        plannedEntry: null, plannedStop: null, plannedTarget: null, entryReason: null, emotionAtEntry: null,
        followedPlan: null, mistakes: [], grade: null, lesson: null, reviewedAt: null,
        maxFavorablePrice: null, maxAdversePrice: null,
        ...overrides,
    };
}

describe('computeJournalStats', () => {
    it('summarizes results, drawdown and losing streak in R', () => {
        const stats = computeJournalStats([
            trade({ rMultiple: 2, pnlRs: 100 }),
            trade({ rMultiple: -1, pnlRs: -50 }),
            trade({ rMultiple: -1, pnlRs: -50 }),
            trade({ rMultiple: -1, pnlRs: -50 }),
            trade({ rMultiple: 3, pnlRs: 150 }),
            trade({ status: 'OPEN', rMultiple: null, exitDate: null }),
        ]);
        expect(stats).toMatchObject({
            closed: 5, open: 1, winRate: 40, avgR: 0.4, avgWinR: 2.5, avgLossR: -1,
            totalPnlRs: 100, profitFactor: 1.67, maxDrawdownR: 3, longestLosingStreak: 3,
        });
    });

    it('shows what breaking the plan costs', () => {
        const stats = computeJournalStats([
            trade({ rMultiple: 1.5, followedPlan: true }),
            trade({ rMultiple: 0.5, followedPlan: true }),
            trade({ rMultiple: -2, followedPlan: false, mistakes: ['MOVED_STOP'] }),
            trade({ rMultiple: -1, followedPlan: false, mistakes: ['CHASED_ENTRY', 'FOMO'] }),
        ]);
        expect(stats.followedPlan).toMatchObject({ trades: 2, avgR: 1, totalR: 2 });
        expect(stats.brokePlan).toMatchObject({ trades: 2, avgR: -1.5, totalR: -3 });
        expect(stats.byMistake[0]).toMatchObject({ key: 'MOVED_STOP', totalR: -2 });
        expect(stats.insights.join(' ')).toMatch(/Breaking the plan cost 3\.0R/);
        expect(stats.insights.join(' ')).toMatch(/costliest mistake is moved stop/);
    });

    it('measures chasing and how much of the best move winners kept', () => {
        const stats = computeJournalStats([
            trade({ plannedEntry: 100, entryPrice: 102, stopLossInit: 97, exitPrice: 106, rMultiple: 0.8, maxFavorablePrice: 112 }),
            trade({ plannedEntry: 100, entryPrice: 101, stopLossInit: 96, exitPrice: 103, rMultiple: 0.4, maxFavorablePrice: 109 }),
        ]);
        expect(stats.avgEntrySlippagePct).toBe(1.5);
        // (106-102)/(112-102) = 40%, (103-101)/(109-101) = 25% → 32.5%
        expect(stats.avgCaptureOfBestMovePct).toBe(32.5);
        expect(stats.avgMaxFavorableR).toBe(1.8); // (10/5 + 8/5) / 2
        expect(stats.insights.join(' ')).toMatch(/above the planned price/);
        expect(stats.insights.join(' ')).toMatch(/kept only 33%/);
    });

    it('handles an empty journal', () => {
        const stats = computeJournalStats([]);
        expect(stats).toMatchObject({ closed: 0, winRate: null, avgR: null, profitFactor: null, maxDrawdownR: 0 });
        expect(stats.insights[0]).toMatch(/Only 0 closed trades/);
    });
});

describe('priceExcursions', () => {
    it('finds the best and worst price', () => {
        expect(priceExcursions([{ high: 105, low: 98 }, { high: 110, low: 101 }, { high: 104, low: 96 }])).toEqual({ maxFavorablePrice: 110, maxAdversePrice: 96 });
        expect(priceExcursions([])).toBeNull();
    });
});

describe('journal validation', () => {
    it('accepts planned levels and an entry emotion on a new trade', () => {
        const parsed = portfolioTradeSchema.parse({ ticker: 'ACME', entryPrice: 101, quantity: 5, stopLossInit: 96, target1: 110, plannedEntry: 100, emotionAtEntry: 'CALM' });
        expect(parsed).toMatchObject({ plannedEntry: 100, emotionAtEntry: 'CALM' });
    });

    it('accepts known mistake tags and rejects unknown ones', () => {
        expect(journalReviewSchema.safeParse({ followedPlan: false, mistakes: ['MOVED_STOP'], grade: 'C' }).success).toBe(true);
        expect(journalReviewSchema.safeParse({ mistakes: ['BAD_LUCK'] }).success).toBe(false);
        expect(journalReviewSchema.safeParse({}).success).toBe(false);
    });
});
