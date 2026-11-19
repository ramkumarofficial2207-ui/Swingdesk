import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { GlobalBar, loadGlobalSeries } from '../../globalMarketBackfill';
import { ExitPlan, HarnessTrade, tradeStats } from '../harness';
import { runSetupStudy, SetupCard, StudyResult } from '../studyRunner';

/**
 * Phase 2: global and commodity cues (reports/global-cues-plan.md).
 *   npm run research:global-cues
 */

export const CUE_RULES = { lookback: 60, horizon: 5, maxGapUpPct: 3 } as const;
const EXIT: ExitPlan = { stopPct: null, targetPct: null, horizon: CUE_RULES.horizon, maxGapUpPct: CUE_RULES.maxGapUpPct };

export interface Cue {
    id: 'C1' | 'C2' | 'C3' | 'C4';
    series: 'COPPER' | 'BRENT' | 'USDINR' | 'NASDAQ';
    /** -1: fires on a fall; +1: fires on a rise. */
    direction: -1 | 1;
    label: string;
    industries: string[];
    symbols: string[];
}

export const CUES: Cue[] = [
    { id: 'C1', series: 'COPPER', direction: -1, label: 'Copper falls → consumer durables', industries: ['Consumer Durables'], symbols: [] },
    { id: 'C2', series: 'BRENT', direction: -1, label: 'Brent falls → autos, paints, refiners, airline', industries: ['Automobile and Auto Components', 'Consumer Durables'], symbols: ['BPCL', 'HINDPETRO', 'IOC', 'INDIGO'] },
    { id: 'C3', series: 'USDINR', direction: 1, label: 'Rupee weakens → IT and pharma exporters', industries: ['Information Technology', 'Healthcare'], symbols: [] },
    { id: 'C4', series: 'NASDAQ', direction: 1, label: 'Nasdaq rises → IT', industries: ['Information Technology'], symbols: [] },
];

/** z = today's log return ÷ std dev of the previous `lookback` log returns. Keyed by bar date. */
export function shockZ(bars: GlobalBar[], lookback: number = CUE_RULES.lookback): Map<string, number> {
    const out = new Map<string, number>();
    const returns = bars.map((bar, k) => (k > 0 && bars[k - 1].close > 0 ? Math.log(bar.close / bars[k - 1].close) : NaN));
    for (let k = lookback + 1; k < bars.length; k += 1) {
        const prior = returns.slice(k - lookback, k);
        if (prior.some(value => !Number.isFinite(value))) continue;
        const mean = prior.reduce((s, v) => s + v, 0) / lookback;
        const sd = Math.sqrt(prior.reduce((s, v) => s + (v - mean) ** 2, 0) / (lookback - 1));
        if (sd > 0 && Number.isFinite(returns[k])) out.set(bars[k].date, returns[k] / sd);
    }
    return out;
}

/** Sorted dates on which the cue fires at this threshold. */
export function cueDates(z: Map<string, number>, direction: -1 | 1, threshold: number): string[] {
    return [...z].filter(([, value]) => direction * value >= threshold).map(([date]) => date).sort();
}

/** True if any date in `sorted` lies in [from, to): a shock known before the open of the session dated `to`. */
export function firesInWindow(sorted: string[], from: string, to: string): boolean {
    let low = 0;
    let high = sorted.length;
    while (low < high) { const mid = (low + high) >> 1; if (sorted[mid] < from) low = mid + 1; else high = mid; }
    return low < sorted.length && sorted[low] < to;
}

export function isBeneficiary(cue: Cue, symbol: string, industry: string): boolean {
    return cue.symbols.includes(symbol) || cue.industries.includes(industry);
}

async function loadCueDates(threshold: number): Promise<Map<Cue['id'], string[]>> {
    const out = new Map<Cue['id'], string[]>();
    for (const cue of CUES) out.set(cue.id, cueDates(shockZ(await loadGlobalSeries(cue.series)), cue.direction, threshold));
    return out;
}

function card(id: 'G1' | 'G2', fired: Map<Cue['id'], string[]>): SetupCard {
    return {
        id: `global-cues-${id.toLowerCase()}`,
        name: `Global and commodity cues ${id} (|z| ≥ ${id === 'G1' ? '1.5' : '2.0'})`,
        plan: 'global-cues-plan.md',
        thesis: 'A sharp overnight move in a cost input or export driver keeps re-pricing the sectors it helps for about a week.',
        discoveryStart: '2021-01-05',
        testYears: ['2024', '2025', '2026'],
        signal: (bars, _ind, i, ctx) => {
            if (i + 1 >= bars.length) return null;
            const from = bars[i].date;
            const to = bars[i + 1].date;
            const hit = CUES.some(cue => isBeneficiary(cue, ctx.symbol, ctx.industry) && firesInWindow(fired.get(cue.id)!, from, to));
            if (!hit) return null;
            const turnover20 = bars.slice(i - 19, i + 1).reduce((sum, bar) => sum + bar.close * bar.volume, 0) / 20;
            return { score: turnover20, exit: EXIT };
        },
        control: { label: 'all labelled universe stocks, same day and exit', include: ctx => ctx.industry !== 'Unknown', exit: EXIT },
    };
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

/** Information only: which cues fired for each trade (a trade can belong to several). */
function perCue(trades: HarnessTrade[], fired: Map<Cue['id'], string[]>, industries: Map<string, string>): string[] {
    return CUES.map(cue => {
        const rows = trades.filter(trade => isBeneficiary(cue, trade.symbol, industries.get(trade.symbol) ?? 'Unknown') && firesInWindow(fired.get(cue.id)!, trade.signalDate, trade.entryDate));
        const test = tradeStats(rows.filter(trade => trade.signalDate >= '2024-01-01'));
        const discovery = tradeStats(rows.filter(trade => trade.signalDate < '2024-01-01'));
        return `| ${cue.id}: ${cue.label} | ${fired.get(cue.id)!.length} | ${discovery.n} | ${discovery.n ? fmt(discovery.avg) : '—'} | ${test.n} | ${test.n ? fmt(test.avg) : '—'} | ${test.n ? fmt(test.dayClustered) : '—'} |`;
    });
}

async function main(): Promise<void> {
    const { loadIndustries } = await import('../studyRunner');
    const industries = loadIndustries();
    const results: Array<{ id: 'G1' | 'G2'; fired: Map<Cue['id'], string[]>; result: StudyResult }> = [];
    for (const [id, threshold] of [['G1', 1.5], ['G2', 2.0]] as const) {
        const fired = await loadCueDates(threshold);
        results.push({ id, fired, result: await runSetupStudy(card(id, fired)) });
    }
    const primary = [...results].sort((a, b) => b.result.discovery.dayClustered - a.result.discovery.dayClustered)[0];
    const lines = [
        '# Global and commodity cues study (Phase 2)',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`global-cues-plan.md\`](global-cues-plan.md)`,
        '',
        `## Verdict: ${primary.result.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (better discovery day-clustered average): **${primary.id}**. Full checks in [\`global-cues-${primary.id.toLowerCase()}.md\`](global-cues-${primary.id.toLowerCase()}.md).`,
        '',
        '| Variant | Discovery trades | Discovery day-clustered | Discovery excess vs control | Test trades | Test avg | Test day-clustered | Test excess vs control | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ id, result }) => `| [${id}](global-cues-${id.toLowerCase()}.md) | ${result.discovery.n} | ${fmt(result.discovery.dayClustered)} | ${result.excess ? fmt(result.excess.discovery.avg) : '—'} | ${result.test.n} | ${fmt(result.test.avg)} | ${fmt(result.test.dayClustered)} | ${result.excess ? fmt(result.excess.test.avg) : '—'} | ${result.passed ? '✅' : '❌'} |`),
        '',
        primary.result.passed
            ? 'Per plan: add "Global Cue" as a scanner setup type, On trial for live paper tracking (≥ 30 signal days before Trusted).'
            : 'Per plan: no re-tuning on the test period. Next: Phase 3 (institutional flow), after repairing the bulk/block deal feed.',
        '',
        `## Per cue, primary ${primary.id} (information only; does not change the verdict)`,
        '',
        '| Cue | Shock days 2019–26 | Discovery trades | Discovery avg | Test trades | Test avg | Test day-clustered |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...perCue(primary.result.trades, primary.fired, industries),
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'global-cues.md'), lines.join('\n'));
    console.log(`[Global cues] Primary ${primary.id} → ${primary.result.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Global cues] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
