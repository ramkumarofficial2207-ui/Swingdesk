import cron from 'node-cron';
import { pushEvent } from './agentEvents';
import type { ScanTrigger } from './scanCoordinator';

const NSE_TIMEZONE = 'Asia/Kolkata';

export interface ScheduledScanResult {
    started: boolean;
    job: { id: string; status: string };
}

export type ScheduledScanStarter = (trigger: ScanTrigger) => Promise<ScheduledScanResult>;
export type ScheduledTask = () => Promise<void>;

function istDateKey(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: NSE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function configuredNseHolidays(): Set<string> {
    return new Set(
        (process.env.NSE_MARKET_HOLIDAYS ?? '')
            .split(',')
            .map(value => value.trim())
            .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    );
}

export function isConfiguredNseHoliday(date = new Date()): boolean {
    return configuredNseHolidays().has(istDateKey(date));
}

async function triggerScheduledScan(startScan: ScheduledScanStarter, trigger: ScanTrigger): Promise<void> {
    if (isConfiguredNseHoliday()) {
        console.log(`[AutoScanner] Skipped ${trigger} scan on configured NSE holiday.`);
        return;
    }

    try {
        const result = await startScan(trigger);
        if (result.started) {
            console.log(`[AutoScanner] ${trigger} scan ${result.job.id} queued.`);
        } else {
            console.log(`[AutoScanner] ${trigger} scan skipped; ${result.job.id} is already active.`);
        }
    } catch (error: any) {
        console.error(`[AutoScanner] Unable to queue ${trigger} scan:`, error?.message || error);
        pushEvent('SCAN_FAILED', 'critical', 'Auto Scan Could Not Start',
            'The scheduler could not queue the market scan. Existing setups remain available.');
    }
}

/**
 * Registers one scheduler per API instance. Railway currently runs one API
 * replica; durable ScanJob overlap checks prevent a second scan if a replica
 * or manual request races the scheduler.
 */
export function initAutoScanner(
    startScan: ScheduledScanStarter,
    runEodQualification?: ScheduledTask,
    reconcileQualifiedTriggers?: ScheduledTask,
): void {
    if (process.env.ENABLE_AUTO_SCAN !== 'true') {
        console.log('[AutoScanner] Scheduled scanning is disabled.');
        return;
    }

    // Intraday jobs never rebuild qualification from a partial daily candle.
    // The lifecycle monitor already processes live ticks continuously; 09:45
    // is an explicit subscription + REST reconciliation checkpoint.
    cron.schedule('45 9 * * 1-5', () => {
        void (reconcileQualifiedTriggers?.() ?? Promise.resolve()).catch(error => {
            console.warn('[AutoScanner] 09:45 trigger reconciliation failed:', error?.message || error);
        });
    }, {
        timezone: NSE_TIMEZONE,
    });

    // NSE delivery data is normally available after 16:29. Repeated,
    // idempotent attempts handle publication delays and configured holidays.
    cron.schedule('35 16-18 * * 1-5', () => {
        if (isConfiguredNseHoliday()) return;
        if (runEodQualification) {
            void runEodQualification().catch(error => {
                console.error('[AutoScanner] EOD ingestion/qualification failed:', error?.message || error);
            });
            return;
        }
        void triggerScheduledScan(startScan, 'post_market');
    }, { timezone: NSE_TIMEZONE });

    console.log('[AutoScanner] 09:45 trigger reconciliation and finalized EOD qualification schedules are active.');
    pushEvent('SYSTEM', 'success', 'Auto Scanner Enabled',
        'Qualification runs only after finalized NSE EOD ingestion; intraday monitoring only reconciles qualified triggers.');
}
