import { describe, expect, it } from 'vitest';
import { hasConfirmedBuyTrigger, normalizeScanItems } from '../apex-intelligence/src/lib/scanItems';

describe('scan item API normalization', () => {
    it('maps backend TradeSetup fields into the dashboard presentation model', () => {
        const [item] = normalizeScanItems([{
            ticker: 'RELIANCE',
            sector: 'Energy',
            ltp: 1500,
            buyZone: 1490,
            target: 1620,
            target2: 1710,
            targetPct: 8,
            slPct: 4,
            stopLoss: 1440,
            riskReward: 2,
            confidenceScore: 7.5,
            aiSignal: 'BUY',
            status: 'TRIGGERED',
            catalyst: 'Volume confirmation',
            marketGrounding: { rsi14: 61, ema20: 1485, ema50: 1410 },
        }]);

        expect(item).toMatchObject({
            ticker: 'RELIANCE',
            buyZoneMin: 1490,
            buyZoneMax: 1490,
            target1: 1620,
            target2: 1710,
            target1Pct: 8,
            stopLoss: 1440,
            stopLossPct: 4,
            status: 'TRIGGERED',
            aiReasons: ['Volume confirmation'],
            rsi14: 61,
            ema20: 1485,
            ema50: 1410,
        });
    });

    it('filters unusable records and assigns monitor status to watch signals', () => {
        const items = normalizeScanItems([
            { ticker: 'TCS', ltp: 3000, aiSignal: 'WATCH' },
            { ticker: 'INVALID', ltp: 0 },
            null,
        ]);

        expect(items).toHaveLength(1);
        expect(items[0].status).toBe('QUALIFIED');
    });

    it('preserves lifecycle statuses and does not invent missing risk levels', () => {
        const [item] = normalizeScanItems([{
            ticker: 'PGEL',
            ltp: 644.6,
            status: 'IN_PROGRESS',
            aiSignal: 'WATCH',
            setupType: 'Historical setup',
        }]);

        expect(item.status).toBe('IN_PROGRESS');
        expect(item.target1).toBe(0);
        expect(item.stopLoss).toBe(0);
        expect(item.riskReward).toBe(0);
    });

    it('preserves durable qualification and trigger timestamps', () => {
        const [item] = normalizeScanItems([{
            ticker: 'INFY',
            ltp: 1500,
            status: 'TRIGGERED',
            qualifiedAt: '2026-08-08T09:15:00.000Z',
            triggeredAt: '2026-08-08T10:20:00.000Z',
            updatedAt: '2026-08-08T10:20:00.000Z',
            resolvedAt: null,
        }]);

        expect(item).toMatchObject({
            qualifiedAt: '2026-08-08T09:15:00.000Z',
            triggeredAt: '2026-08-08T10:20:00.000Z',
            updatedAt: '2026-08-08T10:20:00.000Z',
        });
        expect(item.resolvedAt).toBeUndefined();
    });

    it('does not treat an unconfirmed active-looking record as a live trade', () => {
        const [item] = normalizeScanItems([{
            ticker: 'PGEL',
            ltp: 630.65,
            buyZone: 644.60,
            status: 'IN_PROGRESS',
            triggerConfirmed: false,
        }]);

        expect(hasConfirmedBuyTrigger(item)).toBe(false);
    });

    it('preserves opening, actual fill, missed entry and early-buy audit fields', () => {
        const [item] = normalizeScanItems([{
            ticker: 'EXAMPLE',
            ltp: 110,
            buyZone: 100,
            status: 'MISSED_GAP',
            openingPrice: 110,
            maxEntryPrice: 102,
            executionMissReason: 'OPEN_GAP_ABOVE_MAX_ENTRY',
            earlyBuy: {
                status: 'EARLY_BUY_READY',
                score: 78,
                zoneLow: 90,
                zoneHigh: 93,
                shadow: true,
                reasons: ['Supertrend bullish'],
            },
        }]);

        expect(item).toMatchObject({
            status: 'MISSED_GAP',
            openingPrice: 110,
            maxEntryPrice: 102,
            executionMissReason: 'OPEN_GAP_ABOVE_MAX_ENTRY',
            earlyBuyStatus: 'EARLY_BUY_READY',
            earlyBuyScore: 78,
            earlyEntryLow: 90,
            earlyEntryHigh: 93,
            earlyBuyShadow: true,
        });
        expect(hasConfirmedBuyTrigger(item)).toBe(false);
    });

    it('confirms a legacy trigger only when price has reached the entry', () => {
        const [waiting] = normalizeScanItems([{
            ticker: 'PGEL',
            ltp: 630.65,
            buyZone: 644.60,
            status: 'TRIGGERED',
        }]);
        const [hit] = normalizeScanItems([{
            ticker: 'PGEL',
            ltp: 644.60,
            buyZone: 644.60,
            status: 'TRIGGERED',
        }]);

        expect(hasConfirmedBuyTrigger(waiting)).toBe(false);
        expect(hasConfirmedBuyTrigger(hit)).toBe(true);
    });

    it('adds safe chase-guard defaults to an older stored V3 shadow plan', () => {
        const [item] = normalizeScanItems([{
            ticker: 'TEST', ltp: 99, status: 'QUALIFIED',
            preSurgeV3: {
                version: 'PRE_SURGE_V3', shadow: true, eligible: true, score: 80, status: 'V3_READY',
                earlyEntry: { zoneLow: 97, zoneHigh: 99, structuralStop: 95, riskPct: 4, allocationPct: 20 },
                breakout: { pivot: 101, maxEntry: 103, minimumRvol: 1.5, confirmationTimeframeMinutes: 15, minimumCloseLocation: 0.75, allocationPct: 80 },
            },
        }]);

        expect(item.preSurgeV3?.earlyEntry.maxEntry).toBeCloseTo(99.99);
        expect(item.preSurgeV3?.earlyEntry.maximumGapDownPct).toBe(-1.5);
        expect(item.preSurgeV3?.earlyEntry.maximumGapUpPct).toBe(1.5);
    });
});
