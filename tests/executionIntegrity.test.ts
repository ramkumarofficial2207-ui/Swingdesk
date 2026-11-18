import { describe, expect, it } from 'vitest';
import {
    addTradingSessions,
    calculateActualResultPct,
    calculateMaxBreakoutEntry,
    evaluateBreakoutExecution,
} from '../src/executionIntegrity';

const plan = {
    breakoutPrice: 100,
    maxEntryPrice: 102,
    stopLoss: 95,
    targetPrice: 115,
    requiredRvol: 1.5,
    minimumRiskReward: 2,
    expiresAt: new Date('2026-08-31T10:00:00.000Z'),
};

describe('execution integrity policy', () => {
    it('fills only inside the authorized range with confirmed RVOL', () => {
        expect(evaluateBreakoutExecution(plan, {
            price: 101,
            openingPrice: 99,
            rvol: 1.8,
            observedAt: new Date('2026-08-12T04:00:00.000Z'),
        })).toMatchObject({
            status: 'FILLED',
            reason: 'ENTRY_CONFIRMED',
            fillPrice: 101,
        });
    });

    it('does not call an overnight gap a buy', () => {
        expect(evaluateBreakoutExecution(plan, {
            price: 110,
            openingPrice: 110,
            rvol: 4,
            observedAt: new Date('2026-08-12T04:00:00.000Z'),
        })).toMatchObject({ status: 'MISSED_GAP', reason: 'OPEN_GAP_ABOVE_MAX_ENTRY' });
    });

    it('cannot create a win when the target was already reached before entry', () => {
        expect(evaluateBreakoutExecution(plan, {
            price: 116,
            openingPrice: 116,
            rvol: 8,
            observedAt: new Date('2026-08-12T04:00:00.000Z'),
        })).toMatchObject({ status: 'MISSED_GAP', reason: 'TARGET_ALREADY_REACHED' });
    });

    it('waits for volume after the price breakout', () => {
        expect(evaluateBreakoutExecution(plan, {
            price: 101,
            openingPrice: 99,
            rvol: 1.2,
            observedAt: new Date('2026-08-12T04:00:00.000Z'),
        })).toMatchObject({ status: 'WAITING', reason: 'WAITING_FOR_RVOL' });
    });

    it('calculates caps, expiry and results from actual prices', () => {
        expect(calculateMaxBreakoutEntry(100, 2)).toBe(101);
        expect(calculateActualResultPct(110, 125)).toBe(13.64);
        expect(addTradingSessions(new Date('2026-08-14T10:00:00.000Z'), 1).toISOString())
            .toBe('2026-08-17T10:00:00.000Z');
    });
});
