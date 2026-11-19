import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { Candidate, ExitPlan } from '../harness';
import { runSetupStudy, SetupCard, StudyResult } from '../studyRunner';

/**
 * Phase 1: sector momentum (reports/sector-momentum-plan.md).
 *   npm run research:sector-momentum
 */

export const SECTOR_RULES = { topK: 30, minMembers: 4, horizon: 5, maxGapUpPct: 3 } as const;
const EXIT: ExitPlan = { stopPct: null, targetPct: null, horizon: SECTOR_RULES.horizon, maxGapUpPct: SECTOR_RULES.maxGapUpPct };

/** Industries with ≥ minMembers labelled stocks among the day's topK by today's return. */
export function hotIndustries(candidates: Candidate[], topK: number = SECTOR_RULES.topK, minMembers: number = SECTOR_RULES.minMembers): Set<string> {
    const top = [...candidates].sort((a, b) => (b.meta?.todayPct ?? -Infinity) - (a.meta?.todayPct ?? -Infinity) || a.symbol.localeCompare(b.symbol)).slice(0, topK);
    const counts = new Map<string, number>();
    for (const candidate of top) if (candidate.industry !== 'Unknown') counts.set(candidate.industry, (counts.get(candidate.industry) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count >= minMembers).map(([industry]) => industry));
}

/** Keep every labelled stock in a hot industry. */
export function sectorPerDay(_date: string, candidates: Candidate[]): Candidate[] {
    const hot = hotIndustries(candidates);
    return candidates.filter(candidate => candidate.industry !== 'Unknown' && hot.has(candidate.industry));
}

function card(id: 'S1' | 'S2'): SetupCard {
    return {
        id: `sector-momentum-${id.toLowerCase()}`,
        name: `Sector momentum ${id}${id === 'S2' ? ' (NIFTY above 50-day average)' : ' (no market filter)'}`,
        plan: 'sector-momentum-plan.md',
        thesis: 'Stocks in an industry that is moving together keep drifting for days as funds rotate in; buy its most liquid names.',
        discoveryStart: '2021-01-05',
        testYears: ['2024', '2025', '2026'],
        signal: (bars, _ind, i, ctx) => {
            if (id === 'S2' && ctx.marketUp(bars[i].date) !== true) return null;
            const turnover20 = bars.slice(i - 19, i + 1).reduce((sum, bar) => sum + bar.close * bar.volume, 0) / 20;
            return { score: turnover20, exit: EXIT, meta: { todayPct: (bars[i].close / bars[i - 1].close - 1) * 100 } };
        },
        perDay: sectorPerDay,
        control: { label: 'all labelled universe stocks, same day and exit', include: ctx => ctx.industry !== 'Unknown', exit: EXIT },
    };
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

async function main(): Promise<void> {
    const results: Array<{ id: string; result: StudyResult }> = [];
    for (const id of ['S1', 'S2'] as const) results.push({ id, result: await runSetupStudy(card(id)) });
    const primary = [...results].sort((a, b) => b.result.discovery.dayClustered - a.result.discovery.dayClustered)[0];
    const lines = [
        '# Sector momentum study (Phase 1)',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`sector-momentum-plan.md\`](sector-momentum-plan.md)`,
        '',
        `## Verdict: ${primary.result.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (better discovery day-clustered average): **${primary.id}**. Full checks in [\`sector-momentum-${primary.id.toLowerCase()}.md\`](sector-momentum-${primary.id.toLowerCase()}.md).`,
        '',
        '| Variant | Discovery trades | Discovery day-clustered | Discovery excess vs control | Test trades | Test avg | Test day-clustered | Test excess vs control | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ id, result }) => `| [${id}](sector-momentum-${id.toLowerCase()}.md) | ${result.discovery.n} | ${fmt(result.discovery.dayClustered)} | ${result.excess ? fmt(result.excess.discovery.avg) : '—'} | ${result.test.n} | ${fmt(result.test.avg)} | ${fmt(result.test.dayClustered)} | ${result.excess ? fmt(result.excess.test.avg) : '—'} | ${result.passed ? '✅' : '❌'} |`),
        '',
        primary.result.passed
            ? 'Per plan: add "Sector Momentum" as a scanner setup type, On trial for live paper tracking (≥ 30 signal days before Trusted).'
            : 'Per plan: no re-tuning on the test period. Next: Phase 2 (global and commodity cues).',
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'sector-momentum.md'), lines.join('\n'));
    console.log(`[Sector] Primary ${primary.id} → ${primary.result.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Sector] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
