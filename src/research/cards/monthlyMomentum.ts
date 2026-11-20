import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { PriceBar } from '../../corporateActions';
import { runSetupStudy, SetupCard, StudyResult } from '../studyRunner';

/**
 * Final test: monthly momentum (reports/monthly-momentum-plan.md).
 *   npm run research:monthly-momentum
 */

export const MOM_RULES = { lookback: 252, skip: 21, picks: 15, perSector: 4, maxGapUpPct: 3 } as const;

const month = (date: string) => date.slice(0, 7);

/** Bar i is the last session of its month (the next session is in a new month). */
export function isMonthEnd(bars: PriceBar[], i: number): boolean {
    return i + 1 < bars.length && month(bars[i + 1].date) !== month(bars[i].date);
}

/** Index of the next month-end after i, or -1 if the data ends first. */
export function nextMonthEnd(bars: PriceBar[], i: number): number {
    for (let k = i + 1; k < bars.length; k += 1) if (isMonthEnd(bars, k)) return k;
    return -1;
}

/** Risk-adjusted 12-1 momentum at the close of i (data up to i only), or null without enough history. */
export function momentumScore(bars: PriceBar[], i: number): number | null {
    if (i < MOM_RULES.lookback) return null;
    const then = bars[i - MOM_RULES.lookback].close;
    const recent = bars[i - MOM_RULES.skip].close;
    if (!(then > 0) || !(recent > 0)) return null;
    const returns: number[] = [];
    for (let k = i - MOM_RULES.lookback + 1; k <= i; k += 1) returns.push(bars[k].close / bars[k - 1].close - 1);
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const sd = Math.sqrt(returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1));
    return sd > 0 ? (recent / then - 1) / sd : null;
}

function card(id: 'M1' | 'M2'): SetupCard {
    return {
        id: `monthly-momentum-${id.toLowerCase()}`,
        name: `Monthly momentum ${id}${id === 'M2' ? ' (only when NIFTY is above its 200-day average)' : ' (always invested)'}`,
        plan: 'monthly-momentum-plan.md',
        thesis: 'Past-year winners (excluding the last month) keep beating other stocks for months; held as a monthly-rebalanced basket of 15.',
        discoveryStart: '2021-01-05',
        testYears: ['2024', '2025', '2026'],
        rules: { topN: MOM_RULES.picks, maxPositions: MOM_RULES.picks, maxPerSector: MOM_RULES.perSector },
        signal: (bars, _ind, i, ctx) => {
            if (!isMonthEnd(bars, i)) return null;
            if (id === 'M2' && ctx.marketAbove200(bars[i].date) !== true) return null;
            const score = momentumScore(bars, i);
            const exitAt = nextMonthEnd(bars, i);
            if (score === null || exitAt < 0) return null;
            return { score, exit: { stopPct: null, targetPct: null, horizon: exitAt - i, maxGapUpPct: MOM_RULES.maxGapUpPct } };
        },
        control: {
            label: 'all universe stocks, same rebalance day and exit',
            include: () => true,
            // Same holding period as the basket: the control is measured per rebalance day with a ~1-month hold.
            exit: { stopPct: null, targetPct: null, horizon: 21, maxGapUpPct: MOM_RULES.maxGapUpPct },
        },
    };
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

async function main(): Promise<void> {
    const results: Array<{ id: 'M1' | 'M2'; result: StudyResult }> = [];
    for (const id of ['M1', 'M2'] as const) results.push({ id, result: await runSetupStudy(card(id)) });
    const primary = [...results].sort((a, b) => b.result.discovery.dayClustered - a.result.discovery.dayClustered)[0];
    const lines = [
        '# Monthly momentum study (final test)',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`monthly-momentum-plan.md\`](monthly-momentum-plan.md)`,
        '',
        `## Verdict: ${primary.result.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (better discovery per-month average): **${primary.id}**. Full checks in [\`monthly-momentum-${primary.id.toLowerCase()}.md\`](monthly-momentum-${primary.id.toLowerCase()}.md).`,
        '',
        '| Variant | Discovery trades | Discovery per-month avg | Discovery excess vs control | Test trades | Test avg | Test per-month avg | Test excess vs control | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ id, result }) => `| [${id}](monthly-momentum-${id.toLowerCase()}.md) | ${result.discovery.n} | ${fmt(result.discovery.dayClustered)} | ${result.excess ? fmt(result.excess.discovery.avg) : '—'} | ${result.test.n} | ${fmt(result.test.avg)} | ${fmt(result.test.dayClustered)} | ${result.excess ? fmt(result.excess.test.avg) : '—'} | ${result.passed ? '✅' : '❌'} |`),
        '',
        primary.result.passed
            ? 'Per plan: "Monthly Momentum" becomes a tracked basket, On trial with a live paper record (≥ 12 monthly rebalances before Trusted).'
            : 'Per plan: no re-tuning on the test period. The agreed stopping rule applies: prediction work stops.',
        '',
        'Note: the control group holds 21 sessions from each rebalance day; basket positions hold until the next month-end (19–23 sessions).',
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'monthly-momentum.md'), lines.join('\n'));
    console.log(`[Momentum] Primary ${primary.id} → ${primary.result.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Momentum] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
