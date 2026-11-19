import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { ExitPlan } from '../harness';
import { runSetupStudy, SetupCard, StudyResult } from '../studyRunner';

/**
 * Phase 3: institutional bulk buys (reports/institutional-buys-plan.md).
 *   npm run research:institutional-buys
 */

export const INST_RULES = { minNetBuyCr: 5, horizon: 10, maxGapUpPct: 3 } as const;
const EXIT: ExitPlan = { stopPct: null, targetPct: null, horizon: INST_RULES.horizon, maxGapUpPct: INST_RULES.maxGapUpPct };

const INSTITUTION = /MUTUAL FUND|\bMF\b|LIFE INSURANCE|INSURANCE COMPANY|GENERAL INSURANCE|ASSURANCE|PENSION|PROVIDENT FUND|SOVEREIGN|GOVERNMENT OF SINGAPORE|MONETARY AUTHORITY|ABU DHABI INVESTMENT AUTHORITY|NORGES|VANGUARD|BLACKROCK|FIDELITY|ISHARES|\bFUNDS?\b|\bFD\b|INDEXFD|TRUSTEE/;
const NOT_INVESTOR = /ARBITRAGE|SECURITIES|BROKING|BROKERS|TRADING|TRADETECH|COMMODITIES|FINANCIAL MARKETS|CAPITAL MARKETS|MARKETS LLP|QUANT|RESEARCH/;
const PASSIVE = /INDEX|INDEXFD|ETF|ISHARES|VANGUARD/;

export function isInstitution(clientName: string, activeOnly: boolean): boolean {
    const name = clientName.toUpperCase();
    if (!INSTITUTION.test(name) || NOT_INVESTOR.test(name)) return false;
    return !(activeOnly && PASSIVE.test(name));
}

export interface DealRow { symbol: string; clientName: string; tradeDate: string; dealType: string; totalValue: number }

/**
 * Stock-day → total net buy (₹ crore) from institutions that were each a net
 * buyer of at least minNetBuyCr that day.
 */
export function institutionalBuyEvents(deals: DealRow[], activeOnly: boolean, minNetBuyCr: number = INST_RULES.minNetBuyCr): Map<string, number> {
    const perClient = new Map<string, number>();
    for (const deal of deals) {
        if (!isInstitution(deal.clientName, activeOnly)) continue;
        const key = `${deal.symbol}|${deal.tradeDate}|${deal.clientName.toUpperCase().trim()}`;
        perClient.set(key, (perClient.get(key) ?? 0) + (deal.dealType === 'SELL' ? -1 : 1) * deal.totalValue);
    }
    const events = new Map<string, number>();
    for (const [key, net] of perClient) {
        if (net < minNetBuyCr) continue;
        const stockDay = key.split('|').slice(0, 2).join('|');
        events.set(stockDay, (events.get(stockDay) ?? 0) + net);
    }
    return events;
}

async function loadDeals(): Promise<DealRow[]> {
    const rows = await prisma.institutionalDeal.findMany({
        where: { remarks: { not: 'BLOCK' } },
        select: { symbol: true, clientName: true, tradeDate: true, dealType: true, totalValue: true },
    });
    return rows.map(row => ({ ...row, tradeDate: row.tradeDate.toISOString().slice(0, 10) }));
}

function card(id: 'F1' | 'F2', events: Map<string, number>): SetupCard {
    return {
        id: `institutional-buys-${id.toLowerCase()}`,
        name: `Institutional bulk buys ${id}${id === 'F2' ? ' (active funds only)' : ' (all institutions)'}`,
        plan: 'institutional-buys-plan.md',
        thesis: 'A long-only institution buying ≥ 0.5% of a company in a day keeps buying for weeks, lifting the price after the deal is public.',
        discoveryStart: '2021-01-05',
        testYears: ['2024', '2025', '2026'],
        signal: (bars, _ind, i, ctx) => {
            const value = events.get(`${ctx.symbol}|${bars[i].date}`);
            return value === undefined ? null : { score: value, exit: EXIT };
        },
        control: { label: 'all universe stocks, same day and exit', include: () => true, exit: EXIT },
    };
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

async function main(): Promise<void> {
    const deals = await loadDeals();
    const results: Array<{ id: 'F1' | 'F2'; events: number; result: StudyResult }> = [];
    for (const id of ['F1', 'F2'] as const) {
        const events = institutionalBuyEvents(deals, id === 'F2');
        results.push({ id, events: events.size, result: await runSetupStudy(card(id, events)) });
    }
    const primary = [...results].sort((a, b) => b.result.discovery.dayClustered - a.result.discovery.dayClustered)[0];
    const lines = [
        '# Institutional bulk buys study (Phase 3)',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`institutional-buys-plan.md\`](institutional-buys-plan.md)`,
        '',
        `Bulk deals used: ${deals.length.toLocaleString('en-IN')} (2021-01 → 2026-07). Test period ends with signals on 2026-07-31 (Aug–Nov 2026 deals are missing).`,
        '',
        `## Verdict: ${primary.result.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (better discovery day-clustered average): **${primary.id}**. Full checks in [\`institutional-buys-${primary.id.toLowerCase()}.md\`](institutional-buys-${primary.id.toLowerCase()}.md).`,
        '',
        '| Variant | Events (all stocks) | Discovery trades | Discovery day-clustered | Discovery excess vs control | Test trades | Test avg | Test day-clustered | Test excess vs control | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ id, events, result }) => `| [${id}](institutional-buys-${id.toLowerCase()}.md) | ${events} | ${result.discovery.n} | ${fmt(result.discovery.dayClustered)} | ${result.excess ? fmt(result.excess.discovery.avg) : '—'} | ${result.test.n} | ${fmt(result.test.avg)} | ${fmt(result.test.dayClustered)} | ${result.excess ? fmt(result.excess.test.avg) : '—'} | ${result.passed ? '✅' : '❌'} |`),
        '',
        primary.result.passed
            ? 'Per plan: add "Institutional Buy" as a scanner setup type, On trial for live paper tracking (≥ 30 signal days before Trusted).'
            : 'Per plan: no re-tuning on the test period. Next: Phase 4 (company announcements and results numbers).',
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'institutional-buys.md'), lines.join('\n'));
    console.log(`[Institutional] Primary ${primary.id} → ${primary.result.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Institutional] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
