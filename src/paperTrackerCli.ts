import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import prisma from './prismaClient';
import { runPaperTracking } from './paperTracker';
import { ScanResult } from './types';

/**
 * npm run paper:track                      advance open paper signals, update trust status
 * npm run paper:track -- --record-last-scan   also record signals from data/last_scan.json
 *
 * Only record from a scan that ran after the market closed, so its candles are final.
 */
async function main(): Promise<void> {
    let scan: ScanResult | null = null;
    if (process.argv.includes('--record-last-scan')) {
        const path = join(__dirname, '..', 'data', 'last_scan.json');
        if (!existsSync(path)) throw new Error(`No saved scan at ${path}`);
        scan = JSON.parse(readFileSync(path, 'utf8')) as ScanResult;
        const istHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date(scan.timestamp)));
        if (istHour < 16) throw new Error(`Saved scan ran at ${scan.timestamp} (before 16:00 IST); its candles may not be final.`);
    }
    await runPaperTracking(scan);
}

main()
    .catch(error => { console.error('[PaperTracker] failed:', error?.message ?? error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
