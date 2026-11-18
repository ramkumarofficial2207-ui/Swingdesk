import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { scheduleMock, pushEventMock } = vi.hoisted(() => ({
    scheduleMock: vi.fn(),
    pushEventMock: vi.fn(),
}));

vi.mock('node-cron', () => ({ default: { schedule: scheduleMock } }));
vi.mock('../src/agentEvents', () => ({ pushEvent: pushEventMock }));

import { configuredNseHolidays, initAutoScanner, isConfiguredNseHoliday } from '../src/autoScannerJob';

describe('automatic scanner scheduling', () => {
    const originalEnabled = process.env.ENABLE_AUTO_SCAN;
    const originalHolidays = process.env.NSE_MARKET_HOLIDAYS;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.NSE_MARKET_HOLIDAYS;
    });

    afterEach(() => {
        if (originalEnabled === undefined) delete process.env.ENABLE_AUTO_SCAN;
        else process.env.ENABLE_AUTO_SCAN = originalEnabled;
        if (originalHolidays === undefined) delete process.env.NSE_MARKET_HOLIDAYS;
        else process.env.NSE_MARKET_HOLIDAYS = originalHolidays;
    });

    it('does not register scheduled work when auto-scan is disabled', () => {
        process.env.ENABLE_AUTO_SCAN = 'false';
        initAutoScanner(vi.fn());
        expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('registers trigger reconciliation and finalized EOD ingestion in IST', () => {
        process.env.ENABLE_AUTO_SCAN = 'true';
        initAutoScanner(vi.fn(), vi.fn(), vi.fn());

        expect(scheduleMock).toHaveBeenCalledTimes(2);
        expect(scheduleMock).toHaveBeenNthCalledWith(
            1,
            '45 9 * * 1-5',
            expect.any(Function),
            { timezone: 'Asia/Kolkata' },
        );
        expect(scheduleMock).toHaveBeenNthCalledWith(
            2,
            '35 16-18 * * 1-5',
            expect.any(Function),
            { timezone: 'Asia/Kolkata' },
        );
    });

    it('accepts only valid configured NSE holiday dates', () => {
        process.env.NSE_MARKET_HOLIDAYS = '2026-08-15, invalid, 2026-10-02';
        expect([...configuredNseHolidays()]).toEqual(['2026-08-15', '2026-10-02']);
        expect(isConfiguredNseHoliday(new Date('2026-08-15T06:00:00.000Z'))).toBe(true);
        expect(isConfiguredNseHoliday(new Date('2026-08-16T06:00:00.000Z'))).toBe(false);
    });

    it('uses 09:45 for reconciliation without starting a qualification scan', async () => {
        process.env.ENABLE_AUTO_SCAN = 'true';
        const startScan = vi.fn();
        const reconcile = vi.fn().mockResolvedValue(undefined);
        initAutoScanner(startScan, vi.fn(), reconcile);

        const callback = scheduleMock.mock.calls[0][1] as () => void;
        callback();
        await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
        expect(startScan).not.toHaveBeenCalled();
    });
});
