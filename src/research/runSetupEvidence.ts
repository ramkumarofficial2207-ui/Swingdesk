import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../prismaClient';
import { loadAdjustedDailySeries } from '../adjustedCandles';
import { computeIndicators, identifySetupType } from '../indicators';
import { computeSetupLevels, setupAtr14 } from '../setupLevels';
import { Candle } from '../types';
import { nonOverlapping, OutcomeStats, summarize, TradeLabel } from './fivePercentStudy';
import { decideTrustStatus, EVIDENCE_METHOD_VERSION, EVIDENCE_RULES, replayScannerSignal, TrustStatus } from './setupEvidence';
import { loadUniverse, pct, r, statsCells, TEST_START } from './studyData';

/**
 * npm run research:setup-evidence
 *
 * Replays every scanner setup type with the app's own levels and execution
 * rules (reports/setup-trust-rules.md), stores evidence + trust status in
 * SetupEvidence, and writes reports/setup-evidence.md.
 */

const INDICATOR_WINDOW = 300;
const TEST_YEARS = ['2024', '2025', '2026'];

interface EvidenceTrade {
    /** symbol|setupType, so trades are non-overlapping per stock and setup type. */
    symbol: string;
    index: number;
    date: string;
    label: TradeLabel;
    reachedGoalFirst: boolean;
}

interface TypeCounts {
    signals: number;
    triggered: number;
    skippedChase: number;
    notTriggered: number;
    trades: EvidenceTrade[];
}

function goalRate(trades: EvidenceTrade[]): number | null {
    return trades.length ? (100 * trades.filter(trade => trade.reachedGoalFirst).length) / trades.length : null;
}

const STATUS_LABEL: Record<TrustStatus, string> = {
    TRUSTED: '🟢 Trusted',
    ON_TRIAL: '🟡 On trial',
    RESEARCH_ONLY: '⚪ Research only',
};

async function main(): Promise<void> {
    const generatedAt = new Date();
    console.log('[Evidence] Loading universe…');
    const universe = await loadUniverse();
    const nifty = (await loadAdjustedDailySeries('NIFTY_50')).bars;
    const niftyIndex = new Map(nifty.map((bar, index) => [bar.date, index]));
    const byType = new Map<string, TypeCounts>();

    let processed = 0;
    for (const [symbol, eligibleDates] of universe) {
        const bars = (await loadAdjustedDailySeries(symbol)).bars;
        for (let i = INDICATOR_WINDOW - 1; i < bars.length; i += 1) {
            const date = bars[i].date;
            if (!eligibleDates.has(date)) continue;
            const n = niftyIndex.get(date);
            if (n === undefined || n < INDICATOR_WINDOW - 1) continue;
            const ind = computeIndicators(
                symbol,
                bars.slice(i - INDICATOR_WINDOW + 1, i + 1) as Candle[],
                nifty.slice(n - INDICATOR_WINDOW + 1, n + 1) as Candle[],
            );
            if (!ind) continue;
            const setupType = identifySetupType(ind);
            const atr14 = setupAtr14(ind.candles);
            const levels = computeSetupLevels(setupType, ind, atr14);
            if (!levels) continue;
            const result = replayScannerSignal(bars, i, levels, atr14);
            if (result.kind === 'INSUFFICIENT_DATA') continue;
            const counts = byType.get(setupType) ?? { signals: 0, triggered: 0, skippedChase: 0, notTriggered: 0, trades: [] };
            counts.signals += 1;
            if (result.kind === 'SKIPPED_CHASE') counts.skippedChase += 1;
            else if (result.kind === 'NOT_TRIGGERED') counts.notTriggered += 1;
            else if (result.kind === 'TRADE') {
                counts.triggered += 1;
                counts.trades.push({ symbol: `${symbol}|${setupType}`, index: i, date, label: result.trade.label, reachedGoalFirst: result.trade.reachedGoalFirst });
            }
            byType.set(setupType, counts);
        }
        processed += 1;
        if (processed % 200 === 0) console.log(`[Evidence] ${processed}/${universe.size} symbols`);
    }

    interface TypeResult {
        setupType: string;
        counts: TypeCounts;
        discovery: OutcomeStats;
        test: OutcomeStats;
        testYears: Array<{ year: string; stats: OutcomeStats }>;
        goalRateTest: number | null;
        status: TrustStatus;
        reasons: string[];
    }

    const results: TypeResult[] = [];
    for (const [setupType, counts] of byType) {
        const trades = nonOverlapping(counts.trades);
        const discoveryTrades = trades.filter(trade => trade.date < TEST_START);
        const testTrades = trades.filter(trade => trade.date >= TEST_START);
        const test = summarize(testTrades);
        const testYears = TEST_YEARS.map(year => ({ year, stats: summarize(testTrades.filter(trade => trade.date.startsWith(year))) }));
        const decision = decideTrustStatus({ test, testYears });
        results.push({
            setupType, counts,
            discovery: summarize(discoveryTrades),
            test, testYears,
            goalRateTest: goalRate(testTrades),
            status: decision.status,
            reasons: decision.reasons,
        });
    }
    results.sort((left, right) => right.test.avgNetR - left.test.avgNetR);

    for (const result of results) {
        const data = {
            status: result.status,
            reasons: result.reasons as unknown as Prisma.InputJsonValue,
            discovery: result.discovery as unknown as Prisma.InputJsonValue,
            test: result.test as unknown as Prisma.InputJsonValue,
            testYears: result.testYears as unknown as Prisma.InputJsonValue,
            signals: {
                signals: result.counts.signals,
                triggered: result.counts.triggered,
                skippedChase: result.counts.skippedChase,
                notTriggered: result.counts.notTriggered,
            } as Prisma.InputJsonValue,
            goalRateTest: result.goalRateTest,
            generatedAt,
        };
        await prisma.setupEvidence.upsert({
            where: { setupType_methodVersion: { setupType: result.setupType, methodVersion: EVIDENCE_METHOD_VERSION } },
            create: { setupType: result.setupType, methodVersion: EVIDENCE_METHOD_VERSION, ...data },
            update: data,
        });
    }

    const header = 'Trades | Target first | Stop first | Expired | Avg net R (95% range)';
    const lines = [
        '# Setup evidence',
        '',
        `Generated: ${generatedAt.toISOString()} · method \`${EVIDENCE_METHOD_VERSION}\``,
        '',
        'Every scanner setup type, replayed with the **same entry, stop and target the app shows** and the app\'s execution rules. Status follows the pre-registered [trust rules](setup-trust-rules.md); only the 2024+ test period decides it.',
        '',
        `"+5% first" is the share of trades that reached +${EVIDENCE_RULES.goalPct}% before the stop from the same fill: your goal, reported for context.`,
        '',
        '## Status by setup type',
        '',
        '| Setup type | Status | Test trades | Test avg net R (95% range) | Test target first | +5% first | Discovery avg net R |',
        '|---|---|---:|---:|---:|---:|---:|',
        ...results.map(result => `| ${result.setupType} | ${STATUS_LABEL[result.status]} | ${result.test.n.toLocaleString('en-IN')} | ${result.test.n ? `${r(result.test.avgNetR)} ± ${result.test.ciNetR.toFixed(3)}` : '—'} | ${result.test.n ? pct(result.test.targetPct) : '—'} | ${result.goalRateTest === null ? '—' : pct(result.goalRateTest)} | ${result.discovery.n ? r(result.discovery.avgNetR) : '—'} |`),
        '',
        `Summary: ${results.filter(item => item.status === 'TRUSTED').length} trusted, ${results.filter(item => item.status === 'ON_TRIAL').length} on trial, ${results.filter(item => item.status === 'RESEARCH_ONLY').length} research only.`,
        '',
        '## Details',
        '',
        ...results.flatMap(result => [
            `### ${result.setupType} — ${STATUS_LABEL[result.status]}`,
            '',
            `Signals ${result.counts.signals.toLocaleString('en-IN')}; triggered ${result.counts.triggered.toLocaleString('en-IN')}; skipped as chasing ${result.counts.skippedChase.toLocaleString('en-IN')}; never triggered ${result.counts.notTriggered.toLocaleString('en-IN')}.`,
            '',
            ...result.reasons.map(reason => `- ${reason}`),
            '',
            `| Period | ${header} |`,
            '|---|---:|---:|---:|---:|---:|',
            `| Discovery 2021–2023 | ${statsCells(result.discovery)} |`,
            ...result.testYears.map(item => `| ${item.year} (test) | ${statsCells(item.stats)} |`),
            `| **Test total** | **${statsCells(result.test)}** |`,
            '',
        ]),
        'Research output, not investment advice. The replay tests each setup type without the scanner\'s extra ranking filters, and does not model earnings dates.',
        '',
    ];
    mkdirSync('reports', { recursive: true });
    const path = join('reports', 'setup-evidence.md');
    writeFileSync(path, lines.join('\n'));
    console.log(`[Evidence] ${results.length} setup types; ${results.filter(item => item.status !== 'RESEARCH_ONLY').length} not research-only. Report: ${path}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Evidence] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
