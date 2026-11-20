import { describe, expect, it } from 'vitest';
import { gateByStop, stopDistancePct, stopRangeLabel } from '../apex-intelligence/src/lib/riskGate';

describe('evening setup stop limit', () => {
    it('measures stop distance from the entry', () => {
        expect(stopDistancePct({ buyZoneMin: 100, stopLoss: 97 })).toBeCloseTo(3);
        expect(stopDistancePct({ buyZoneMin: 0, stopLoss: 0, stopLossPct: 4.43 })).toBe(4.43);
        expect(stopDistancePct({ buyZoneMin: 100, stopLoss: 101 })).toBeNull();
    });

    it('keeps setups within the limit and hides wider or incomplete ones', () => {
        const items = [
            { ticker: 'TIGHT', buyZoneMin: 100, stopLoss: 97.5 },
            { ticker: 'EDGE', buyZoneMin: 100, stopLoss: 97 },
            { ticker: 'WIDE', buyZoneMin: 688.1, stopLoss: 602.3 },
            { ticker: 'NOLEVELS', buyZoneMin: 0, stopLoss: 0 },
        ];
        const { within, wider } = gateByStop(items, 3);
        expect(within.map(i => i.ticker)).toEqual(['TIGHT', 'EDGE']);
        expect(wider.map(i => i.ticker)).toEqual(['WIDE', 'NOLEVELS']);
        expect(wider[0].stopPct).toBeCloseTo(12.47, 1);
        expect(wider[1].stopPct).toBeNull();
    });

    it('labels the range of hidden stops', () => {
        expect(stopRangeLabel([12.47, 4.43, null, 8.3])).toBe('4.4–12.5%');
        expect(stopRangeLabel([5])).toBe('5.0%');
        expect(stopRangeLabel([null])).toBe('unknown');
    });
});
