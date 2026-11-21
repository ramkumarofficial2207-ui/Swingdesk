import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { PriceBar } from '../../corporateActions';
import { ExitPlan } from '../harness';
import { loadStudyData, runSetupStudy, SetupCard, StudyData, StudyResult } from '../studyRunner';
import { TEST_START } from '../studyData';

/**
 * The user's idea (reports/volume-rise-ratchet-plan.md): volume rises for a few days
 * before a stock's big up-move; enter on the rising volume, exit with a ratcheting stop.
 *   npm run research:volume-ratchet
 */

export const RATCHET_EXIT: ExitPlan = {
    stopPct: 5.5,
    targetPct: 8.5,
    horizon: 15,
    maxGapUpPct: 3,
    ratchet: [{ at: 3.5, stopTo: 0 }, { at: 4.5, stopTo: 2.5 }, { at: 7, stopTo: 4.75 }],
};
export const OLD_EXIT: ExitPlan = { stopPct: 2.5, targetPct: 5, horizon: 15, maxGapUpPct: 3 };
const RULES = { topN: 3, maxPositions: 15, maxPerSector: 2 };

/** Volume ÷ average volume of the 20 sessions before i. */
export function volumeRatio(bars: PriceBar[], i: number): number | null {
    if (i < 21) return null;
    let sum = 0;
    for (let k = i - 20; k < i; k += 1) sum += bars[k].volume;
    return sum > 0 ? bars[i].volume / (sum / 20) : null;
}

/** Volume higher on each of the last 3 sessions and today ≥ 1.5× the 20-day average. */
export function volumeRising(bars: PriceBar[], i: number): boolean {
    const ratio = volumeRatio(bars, i);
    return ratio !== null && ratio >= 1.5 && bars[i].volume > bars[i - 1].volume && bars[i - 1].volume > bars[i - 2].volume;
}

export type Variant = 'V1' | 'V2' | 'V3' | 'V4';
export const VARIANTS: Record<Variant, string> = {
    V1: 'Volume rising 3 sessions in a row, today ≥ 1.5× its 20-day average',
    V2: 'V1 + today closed up',
    V3: 'V1 + price up 0–3% over the 3 sessions (move not started yet)',
    V4: 'V2 + close above the 50-day average',
};

export function variantSignal(v: Variant, bars: PriceBar[], sma50: number[], i: number): boolean {
    if (i < 50 || !volumeRising(bars, i)) return false;
    const up = bars[i].close > bars[i - 1].close;
    const r3 = bars[i].close / bars[i - 3].close - 1;
    if (v === 'V1') return true;
    if (v === 'V2') return up;
    if (v === 'V3') return r3 >= 0 && r3 <= 0.03;
    return up && bars[i].close > sma50[i];
}

function card(v: Variant, exit: ExitPlan, suffix: string): SetupCard {
    return {
        id: `volume-ratchet-${v.toLowerCase()}${suffix}`,
        name: `Rising volume before the move ${v}${suffix ? ' (old +5/−2.5 exit, comparison only)' : ' + ratcheting stop'}`,
        plan: 'volume-rise-ratchet-plan.md',
        thesis: `${VARIANTS[v]}. Top 3 per day by today's volume ratio.`,
        discoveryStart: '2021-01-01',
        testYears: ['2024', '2025', '2026'],
        rules: RULES,
        signal: (bars, ind, i) => (variantSignal(v, bars, ind.sma50, i) ? { score: volumeRatio(bars, i)!, exit } : null),
        control: { label: 'all universe stocks, same day and exit', include: () => true, exit },
    };
}

/** Step A: how often rising volume shows up 2 days before a ≥ 5% 5-session gain, vs all stock-days. */
function lookback(data: StudyData): string[] {
    const count = { discovery: { all: 0, gain: 0, allVol: 0, gainVol: 0 }, test: { all: 0, gain: 0, allVol: 0, gainVol: 0 } };
    for (const [symbol, { bars }] of data.series) {
        const eligible = data.universe.get(symbol)!;
        for (let d = 60; d + 5 < bars.length; d += 1) {
            if (!eligible.has(bars[d].date)) continue;
            const c = bars[d].date < TEST_START ? count.discovery : count.test;
            // Gainer = the next 5 sessions close ≥ 5% above today's close. Clue = volume rising at today's close.
            const gain = bars[d + 5].close / bars[d].close - 1 >= 0.05;
            const vol = volumeRising(bars, d);
            c.all += 1; if (gain) c.gain += 1; if (vol) c.allVol += 1; if (gain && vol) c.gainVol += 1;
        }
    }
    const row = (label: string, c: typeof count.test) => {
        const base = (100 * c.gain) / c.all;
        const withVol = (100 * c.gainVol) / Math.max(1, c.allVol);
        return `| ${label} | ${c.all.toLocaleString('en-IN')} | ${base.toFixed(1)}% | ${c.allVol.toLocaleString('en-IN')} | ${withVol.toFixed(1)}% | ${(withVol / base).toFixed(2)}× |`;
    };
    return [
        '## Step A: does rising volume come before the gainers?',
        '',
        'Gainer = closes ≥ 5% higher 5 sessions later. Clue = volume rising 3 sessions in a row with the last ≥ 1.5× its 20-day average, seen at the close before.',
        '',
        '| Period | Stock-days | Share that became gainers | Days with the clue | Share of those that became gainers | Lift |',
        '|---|---:|---:|---:|---:|---:|',
        row('Discovery 2021–23', count.discovery),
        row('Test 2024–26', count.test),
        '',
        'Lift above 1 means gainers are more common after the clue. It does not say whether the move is up only: big down-moves can follow too (Step B decides with real trades).',
        '',
    ];
}

const fmt = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

async function main(): Promise<void> {
    const data = await loadStudyData();
    const stepA = lookback(data);
    const results: Array<{ v: Variant; result: StudyResult }> = [];
    for (const v of Object.keys(VARIANTS) as Variant[]) results.push({ v, result: await runSetupStudy(card(v, RATCHET_EXIT, ''), 'pre-registered', undefined, data) });
    const primary = [...results].sort((a, b) => b.result.discovery.dayClustered - a.result.discovery.dayClustered)[0];
    const old = await runSetupStudy(card(primary.v, OLD_EXIT, '-old-exit'), 'exploration', 'Same entry as the primary with the old exit, for comparison only.', data);
    const row = (label: string, r: StudyResult) => `| ${label} | ${r.discovery.n} | ${fmt(r.discovery.dayClustered)} | ${r.test.n} | ${r.test.winRate.toFixed(1)}% | ${fmt(r.test.avg)} | ${fmt(r.test.dayClustered)} | ${r.excess ? fmt(r.excess.test.avg) : '—'} | ${r.passed ? '✅' : '❌'} |`;
    const lines = [
        '# Rising volume before the move + ratcheting stop',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`volume-rise-ratchet-plan.md\`](volume-rise-ratchet-plan.md)`,
        '',
        `## Verdict: ${primary.result.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (best discovery per-day average): **${primary.v}** — ${VARIANTS[primary.v]}. Full checks in [\`volume-ratchet-${primary.v.toLowerCase()}.md\`](volume-ratchet-${primary.v.toLowerCase()}.md).`,
        '',
        ...stepA,
        '## Step B: real trades',
        '',
        'Exit: stop −5.5%, target +8.5%; after a high of +3.5% the stop moves to the buy price, after +4.5% to +2.5%, after +7% to +4.75% (from the next session); sell at the close of session 15. 0.4% costs.',
        '',
        '| Entry | Discovery trades | Discovery per-day avg | Test trades | Test win rate | Test avg net | Test per-day avg | Excess vs control (test) | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...results.map(({ v, result }) => row(`${v}${v === primary.v ? ' (primary)' : ''}`, result)),
        row(`${primary.v} with the old +5/−2.5 exit`, old),
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'volume-rise-ratchet.md'), lines.join('\n'));
    console.log(`[VolumeRatchet] primary ${primary.v} → ${primary.result.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[VolumeRatchet] failed:', error?.stack ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
