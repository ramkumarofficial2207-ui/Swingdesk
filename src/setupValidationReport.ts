import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const db = new PrismaClient();
const horizon = 10;
const costBps = Number(process.env.REPLAY_ROUND_TRIP_COST_BPS ?? 40);
if (!Number.isFinite(costBps) || costBps < 0 || costBps > 500) throw new Error('Invalid REPLAY_ROUND_TRIP_COST_BPS.');
type Setup = { ticker: string; setupType?: string; buyZone: number; stopLoss: number; target: number; confidenceScore?: number };
type PerformanceRow = { setupType: string; outcome: string; netR: number | null; exitDay: string };
type Observation = { scanDay: string; setup: Setup };

const DUPLICATE_WINDOW_DAYS = 14; // about ten trading sessions, matching the outcome horizon

/**
 * A setup that stays on the scanner for several days, or appears twice in one
 * day's scans, is one trade opportunity. Counting each sighting would inflate
 * the sample, so only the first observation of a stock + setup type within the
 * outcome window is kept.
 */
export function dedupeObservations(observations: Observation[]): { kept: Observation[]; duplicates: number } {
    const sorted = [...observations].sort((a, b) => a.scanDay.localeCompare(b.scanDay));
    const lastKept = new Map<string, number>();
    const kept: Observation[] = [];
    for (const observation of sorted) {
        const key = `${observation.setup.ticker.trim().toUpperCase()}|${observation.setup.setupType ?? 'Unknown'}`;
        const day = Date.parse(`${observation.scanDay}T00:00:00.000Z`);
        const previous = lastKept.get(key);
        if (previous !== undefined && (day - previous) / 86_400_000 < DUPLICATE_WINDOW_DAYS) continue;
        lastKept.set(key, day);
        kept.push(observation);
    }
    return { kept, duplicates: observations.length - kept.length };
}

async function main() {
    const jobs = await db.scanJob.findMany({
        where: { mode: 'swing', status: 'COMPLETED' },
        orderBy: { completedAt: 'asc' },
        select: { id: true, completedAt: true, result: true },
    });
    const rawObservations: Observation[] = [];
    for (const job of jobs) {
        const result = job.result as unknown as { timestamp?: string; setups?: Setup[] } | null;
        const scanDay = (result?.timestamp ?? job.completedAt?.toISOString() ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(scanDay)) continue;
        for (const setup of result?.setups ?? []) rawObservations.push({ scanDay, setup });
    }
    const replayPath = join('reports', 'backtests', 'presurge_v2_validation.json');
    let replayCount = 0;
    if (existsSync(replayPath)) {
        const artifact = JSON.parse(readFileSync(replayPath, 'utf8')) as { pointInTime?: boolean; signals?: Array<{ ticker: string; signalDate: string; score: number; breakoutPrice: number; breakoutStop: number; targetPrice: number }> };
        if (artifact.pointInTime !== true || !Array.isArray(artifact.signals)) throw new Error('Pre-Surge replay artifact is not a valid point-in-time signal set.');
        for (const signal of artifact.signals) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(signal.signalDate)) continue;
            rawObservations.push({ scanDay: signal.signalDate, setup: { ticker: signal.ticker, setupType: 'Pre-Surge V2 historical replay', buyZone: signal.breakoutPrice, stopLoss: signal.breakoutStop, target: signal.targetPrice, confidenceScore: signal.score } });
            replayCount++;
        }
    }
    const { kept: observations, duplicates } = dedupeObservations(rawObservations);
    const rows: string[] = [];
    let resolved = 0;
    let wins = 0;
    const performance: PerformanceRow[] = [];
    for (const { scanDay: dateKey, setup } of observations) {
        const scanDay = new Date(`${dateKey}T00:00:00.000Z`);
        const { buyZone: entry, stopLoss: stop, target } = setup;
        if (![entry, stop, target].every(Number.isFinite) || !(stop < entry && entry < target)) continue;
        const candles = await db.dailyCandle.findMany({ where: { symbol: setup.ticker, tradingDate: { gt: scanDay }, isFinal: true }, orderBy: { tradingDate: 'asc' }, take: horizon, select: { tradingDate: true, open: true, high: true, low: true, close: true } });
        let entered = false, outcome = 'PENDING', entryDay = '', exitDay = '';
        let exitPrice: number | null = null;
        for (const candle of candles) {
            const day = candle.tradingDate.toISOString().slice(0, 10);
            if (!entered) { if (candle.open > entry || candle.high < entry) continue; entered = true; entryDay = day; if (candle.low <= stop) { outcome = 'AMBIGUOUS'; break; } }
            if (candle.low <= stop && candle.high >= target) { outcome = 'AMBIGUOUS'; exitDay = day; break; }
            if (candle.low <= stop) { outcome = 'STOP'; exitDay = day; exitPrice = candle.open < stop ? candle.open : stop; break; }
            if (candle.high >= target) { outcome = 'TARGET'; exitDay = day; exitPrice = candle.open > target ? candle.open : target; break; }
        }
        if (!entered && candles.length >= horizon) outcome = 'NOT_TRIGGERED';
        if (entered && outcome === 'PENDING' && candles.length >= horizon) { outcome = 'OPEN_AT_HORIZON'; exitPrice = candles.at(-1)!.close; exitDay = candles.at(-1)!.tradingDate.toISOString().slice(0, 10); }
        if (outcome === 'TARGET' || outcome === 'STOP') { resolved++; if (outcome === 'TARGET') wins++; }
        const netR = exitPrice === null ? null : (exitPrice - entry - (entry + exitPrice) * costBps / 20_000) / (entry - stop);
        performance.push({ setupType: setup.setupType ?? 'Unknown', outcome, netR, exitDay });
        rows.push(`| ${dateKey} | ${setup.ticker} | ${setup.setupType ?? ''} | ${entry.toFixed(2)} | ${stop.toFixed(2)} | ${target.toFixed(2)} | ${setup.confidenceScore ?? ''} | ${candles.length}/${horizon} | ${entryDay || '—'} | ${exitDay || '—'} | ${outcome} | ${netR === null ? '—' : netR.toFixed(2)} |`);
    }
    const priced = performance.filter(row => row.netR !== null).sort((a, b) => a.exitDay.localeCompare(b.exitDay));
    const expectancy = priced.length ? priced.reduce((sum, row) => sum + row.netR!, 0) / priced.length : null;
    let equity = 0, peak = 0, drawdown = 0, losingStreak = 0, maxLosingStreak = 0;
    for (const row of priced) { equity += row.netR!; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); losingStreak = row.netR! < 0 ? losingStreak + 1 : 0; maxLosingStreak = Math.max(maxLosingStreak, losingStreak); }
    const strategyRows = [...new Set(performance.map(row => row.setupType))].sort().map(type => {
        const group = performance.filter(row => row.setupType === type);
        const exits = group.filter(row => row.netR !== null);
        const avg = exits.length ? exits.reduce((sum, row) => sum + row.netR!, 0) / exits.length : null;
        return `| ${type} | ${group.length} | ${group.filter(row => !['PENDING', 'NOT_TRIGGERED'].includes(row.outcome)).length} | ${exits.length} | ${group.filter(row => row.outcome === 'TARGET').length} | ${group.filter(row => row.outcome === 'STOP').length} | ${group.filter(row => row.outcome === 'AMBIGUOUS').length} | ${avg === null ? '—' : avg.toFixed(2)} |`;
    });
    const report = [
        '# Swing setup performance', '',
        `Generated: ${new Date().toISOString()}`, `Completed scans: ${jobs.length}; point-in-time Pre-Surge V2 replay signals: ${replayCount}; setup observations: ${rows.length} (${duplicates} repeat sightings of the same stock and setup within ${DUPLICATE_WINDOW_DAYS} days removed); priced outcomes: ${priced.length}.`,
        'The historical Pre-Surge V2 replay is a separate strategy cohort selected from the historical top-500 liquidity universe. It is not a replay of the current Nifty 500 scanner. Do not combine its expectancy with the live scanner to claim current-strategy performance.',
        `Round-trip cost assumption: ${costBps} basis points of traded value, including estimated fees and slippage.`,
        `Net expectancy: ${expectancy === null ? 'not measurable' : expectancy.toFixed(2) + ' R'}; maximum cumulative drawdown: ${priced.length ? drawdown.toFixed(2) + ' R' : 'not measurable'}; longest losing streak: ${priced.length ? maxLosingStreak : 'not measurable'}.`,
        priced.length < 30 ? '**Evidence status: insufficient.** Fewer than 30 priced outcomes; this report cannot establish a repeatable edge.' : '',
        `Resolved targets/stops: ${resolved}; target hits: ${wins}; target-hit share: ${resolved ? (100 * wins / resolved).toFixed(1) + '%' : 'not measurable'}.`, '',
        'Uses only finalized daily candles after each scan date. Entry is assumed at the saved buy zone; a gap above entry is skipped. Same-day entry/stop and target/stop collisions are AMBIGUOUS because daily bars do not show event order. Open positions are marked at the tenth close. PENDING means fewer than ten later sessions. These are simulated setup outcomes, not broker fills.', '',
        '## By setup type', '', '| Setup | Found | Entered or ambiguous | Priced | Targets | Stops | Ambiguous | Net expectancy (R) |', '|---|---:|---:|---:|---:|---:|---:|---:|', ...strategyRows, '',
        '## Setup ledger', '', '| Scan date | Stock | Setup | Entry | Stop | Target | Score | Bars | Entry day | Exit day | Outcome | Net R |',
        '|---|---|---|---:|---:|---:|---:|---:|---|---|---|---:|',
        ...rows, '',
    ].join('\n');
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'setup-validation.md');
    writeFileSync(path, report);
    console.log(`${path}: ${jobs.length} scans, ${rows.length} setups, ${resolved} resolved`);
}

if (require.main === module) {
    main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
}
