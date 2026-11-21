import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { ExitPlan, HarnessRules } from '../harness';
import { loadStudyData, runSetupStudy, SetupCard, StudyData, StudyResult } from '../studyRunner';
import { BASELINE_IDS, BASELINES, BaselineId, BaselineSignals, BaselineStock, computeBaselineSignals } from '../paper151/baselines';

/**
 * "151 Trading Strategies" equity baselines (reports/paper151-plan.md).
 * Every baseline is run twice: under the paper's own holding rule and under
 * SwingDesk's 5% swing rule. One run, results as they come.
 *
 *   npm run research:paper151
 */

export const SWING_EXIT: ExitPlan = { stopPct: 2.5, targetPct: 5, horizon: 15, maxGapUpPct: 3 };
export const SWING_RULES: Partial<HarnessRules> = { topN: 3, maxPositions: 15, maxPerSector: 2 };

const PORTFOLIO = { topN: 50, maxPositions: 50, maxPerSector: 50 };
export const OWN_RULES: Record<BaselineId, Partial<HarnessRules>> = {
    MOMENTUM: PORTFOLIO, LOW_VOL: PORTFOLIO, RESIDUAL_MOMENTUM: PORTFOLIO, MULTIFACTOR: PORTFOLIO, DUAL_MOMENTUM: PORTFOLIO,
    INDUSTRY_REVERSION: { topN: 5, maxPositions: 25, maxPerSector: 25 },
    IBS: { topN: 5, maxPositions: 5, maxPerSector: 5 },
    MA_SINGLE: { topN: 5, maxPositions: 20, maxPerSector: 20 },
    MA_TWO: { topN: 5, maxPositions: 20, maxPerSector: 20 },
    MA_THREE: { topN: 5, maxPositions: 20, maxPerSector: 20 },
    PIVOT: { topN: 5, maxPositions: 20, maxPerSector: 20 },
    DONCHIAN: { topN: 5, maxPositions: 20, maxPerSector: 20 },
    KNN: { topN: 5, maxPositions: 20, maxPerSector: 20 },
};
/** Control holding period (sessions) for the own-rule run: all universe stocks, same signal days. */
export const OWN_CONTROL_HORIZON: Record<BaselineId, number> = {
    MOMENTUM: 21, RESIDUAL_MOMENTUM: 21, MULTIFACTOR: 21, DUAL_MOMENTUM: 21, LOW_VOL: 126,
    INDUSTRY_REVERSION: 5, IBS: 1, MA_SINGLE: 20, MA_TWO: 20, MA_THREE: 20, PIVOT: 10, DONCHIAN: 20, KNN: 10,
};
const LABELLED_ONLY = new Set<BaselineId>(['INDUSTRY_REVERSION', 'DUAL_MOMENTUM']);

let cache: { data: StudyData; signals: BaselineSignals } | null = null;
function signalsFor(data: StudyData): BaselineSignals {
    if (cache?.data === data) return cache.signals;
    const stocks: BaselineStock[] = [...data.series].map(([symbol, { bars }]) => {
        const eligible = data.universe.get(symbol) ?? new Set<string>();
        return { symbol, industry: data.industries.get(symbol) ?? 'Unknown', bars, eligible: (i: number) => eligible.has(bars[i].date) };
    });
    const started = Date.now();
    const signals = computeBaselineSignals(stocks, data.nifty);
    console.log(`[Paper151] signals for ${stocks.length} stocks in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    cache = { data, signals };
    return signals;
}

export function paper151Card(id: BaselineId, mode: 'own' | 'swing'): SetupCard {
    const meta = BASELINES[id];
    let bySymbol: Map<string, Map<number, { score: number; exit: ExitPlan; rebalanceDay: boolean }>> = new Map();
    return {
        id: `paper151-${id.toLowerCase().replace(/_/g, '-')}-${mode}`,
        name: `151 Strategies §${meta.section} ${meta.name} — ${mode === 'own' ? "paper's own holding rule" : '5% swing rule'}`,
        plan: 'paper151-plan.md',
        thesis: `${meta.rule}.`,
        discoveryStart: '2021-01-01',
        testYears: ['2024', '2025', '2026'],
        rules: mode === 'own' ? OWN_RULES[id] : SWING_RULES,
        prepare: data => { bySymbol = signalsFor(data).get(id)!; },
        signal: (_bars, _ind, i, ctx) => {
            const hit = bySymbol.get(ctx.symbol)?.get(i);
            if (!hit) return null;
            if (mode === 'own') return hit.rebalanceDay ? { score: hit.score, exit: hit.exit } : null;
            return { score: hit.score, exit: SWING_EXIT };
        },
        control: {
            label: LABELLED_ONLY.has(id) ? 'all universe stocks with an industry label, same day and exit' : 'all universe stocks, same day and exit',
            include: ctx => !LABELLED_ONLY.has(id) || ctx.industry !== 'Unknown',
            exit: mode === 'own' ? { stopPct: null, targetPct: null, horizon: OWN_CONTROL_HORIZON[id] } : SWING_EXIT,
        },
    };
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export interface Paper151Row { id: BaselineId; mode: 'own' | 'swing'; result: StudyResult; consistent: boolean; reportId: string }

async function main(): Promise<void> {
    const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',') as BaselineId[] | undefined;
    const started = Date.now();
    const data = await loadStudyData();
    console.log(`[Paper151] loaded ${data.series.size} stocks in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    const rows: Paper151Row[] = [];
    for (const id of only ?? BASELINE_IDS) {
        for (const mode of ['own', 'swing'] as const) {
            const card = paper151Card(id, mode);
            const result = await runSetupStudy(card, 'pre-registered', undefined, data);
            // Pre-registered extra rule: the edge over the control must also be there in discovery.
            const consistent = result.passed && !!result.excess && result.excess.discovery.avg > 0;
            rows.push({ id, mode, result, consistent, reportId: card.id });
        }
    }
    const kept = rows.filter(row => row.consistent);
    const lines = [
        '# "151 Trading Strategies": equity baselines on NSE data',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`paper151-plan.md\`](paper151-plan.md) · ${rows.length} trials in this run`,
        '',
        '"Kept" = every harness check passes on the test period (2024–2026), the test edge over the control group is positive (average and per day), and the discovery-period edge over the control is positive too.',
        '',
        '| § | Strategy | Rule | Test trades | Test avg net | Test per-day avg | Excess vs control (test) | Excess vs control (discovery) | Checks | Kept |',
        '|---|---|---|---:|---:|---:|---:|---:|:---:|:---:|',
        ...rows.map(({ id, mode, result, consistent, reportId }) => `| ${BASELINES[id].section} | [${BASELINES[id].name}](${reportId}.md) | ${mode === 'own' ? 'own' : '5% swing'} | ${result.test.n} | ${fmt(result.test.avg)} | ${fmt(result.test.dayClustered)} | ${result.excess ? fmt(result.excess.test.avg) : '—'} | ${result.excess ? fmt(result.excess.discovery.avg) : '—'} | ${result.passed ? '✅' : '❌'} | ${consistent ? '**yes**' : 'no'} |`),
        '',
        kept.length
            ? `Kept: ${kept.map(row => `${BASELINES[row.id].name} (${row.mode === 'own' ? 'own rule' : '5% rule'})`).join('; ')}. Per plan these go to forward paper tracking only, never straight to Trusted.`
            : 'Nothing kept. Per plan, no strategy from the paper is added to the app as a signal; the code stays as a reusable baseline library.',
        '',
        `With ${rows.length} trials, about one false pass is expected by chance at the usual 5% level; that is why a kept strategy still has to earn its record forward on paper.`,
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', only ? 'paper151-partial.md' : 'paper151.md'), lines.join('\n'));
    console.log(`[Paper151] done in ${((Date.now() - started) / 60000).toFixed(1)} min; kept: ${kept.map(row => `${row.id}/${row.mode}`).join(', ') || 'none'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Paper151] failed:', error?.stack ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
