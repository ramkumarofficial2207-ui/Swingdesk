import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../prismaClient';
import { loadUniverse } from './studyData';
import { fetchSymbol } from './intradayPilot';

/**
 * Full 5-minute history for the early-session study: every stock that was in
 * the point-in-time top-500 universe on any day since --from (default
 * 2023-11-20). Resumable: chunks already stored are skipped, so re-running
 * after an expired token or a crash continues where it stopped.
 *   npm run data:intraday-backfill -- --from=2023-11-20
 */
async function main(): Promise<void> {
    const from = process.argv.find(a => a.startsWith('--from='))?.split('=')[1] ?? '2023-11-20';
    const start = new Date(`${from}T00:00:00+05:30`);
    const end = new Date();
    const universe = await loadUniverse();
    const symbols = [...universe].filter(([, dates]) => [...dates].some(d => d >= from)).map(([symbol]) => symbol).sort();
    console.log(`[Backfill] ${symbols.length} symbols were in the top-500 universe since ${from}.`);
    const problems: string[] = [];
    let bars = 0;
    let done = 0;
    const workers = Math.max(1, Math.min(5, Number(process.argv.find(a => a.startsWith('--workers='))?.split('=')[1] ?? 5)));
    const queue = [...symbols];
    // Dhan Data APIs allow about 5 requests a second; each worker waits 250 ms between requests.
    const worker = async () => {
        for (let symbol = queue.shift(); symbol; symbol = queue.shift()) {
            const result = await fetchSymbol(symbol, start, end, true);
            bars += result.bars;
            done += 1;
            if (result.error) problems.push(`| ${symbol} | ${result.error} |`);
            if (done % 25 === 0 || result.error) console.log(`[Backfill] ${done}/${symbols.length} ${symbol}: +${result.bars} bars, ${result.skipped ?? 0} chunks already stored${result.error ? ` (${result.error})` : ''}`);
        }
    };
    await Promise.all(Array.from({ length: workers }, worker));
    problems.sort();
    writeFileSync(join('reports', 'intraday-backfill.md'), [
        '# Intraday backfill (Dhan 5-minute)',
        '',
        `Run finished ${new Date().toISOString()} · window ${from} → today · ${symbols.length} symbols ever in the point-in-time top-500 universe · ${bars.toLocaleString('en-IN')} new bars this run · ${problems.length} symbols with problems.`,
        '',
        '| Symbol | Problem |',
        '|---|---|',
        ...problems,
        '',
    ].join('\n'));
    console.log(`[Backfill] Done: ${bars} new bars, ${problems.length} problem symbols. Report: reports/intraday-backfill.md`);
}

main()
    .catch(error => { console.error('[Backfill] failed:', error?.message ?? error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
