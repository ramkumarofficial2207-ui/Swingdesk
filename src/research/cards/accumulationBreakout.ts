import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../../prismaClient';
import { loadCorporateActions } from '../../adjustedCandles';
import { PriceBar } from '../../corporateActions';
import { ExitPlan, HarnessTrade } from '../harness';
import { SeriesIndicators } from '../momentumPullback';
import { runSetupStudy, SetupCard, StudyResult } from '../studyRunner';
import { TEST_START } from '../studyData';
import {
    ACC_RULES, AccumulationSeries, alignByDate, entryEarlyDip, entrySurge, factorBefore, prepareAccumulation, smoothness, surgeScore,
} from '../accumulation';

/**
 * Accumulation then breakout (reports/accumulation-breakout-plan.md).
 *   npm run research:accumulation
 *
 * Variants: A (early dip) and B (first surge) are the candidates; W (every
 * watchlist stock-day) and R (every universe stock-day) are measurements that
 * answer "does the watchlist beat random stocks?".
 */

export const ACC_EXIT: ExitPlan = { stopPct: ACC_RULES.stopPct, targetPct: ACC_RULES.targetPct, horizon: ACC_RULES.horizon, maxGapUpPct: ACC_RULES.maxGapUpPct };
const TRADER_RULES = { topN: 3, maxPerSector: 2, maxPositions: 8, riskPerTrade: 0.01 };
const UNLIMITED = { topN: 1_000_000, maxPerSector: 1_000_000, maxPositions: 1_000_000, riskPerTrade: 0.01 };

/** Delivery % and split-adjusted futures OI for one stock, aligned with its adjusted bars. */
export async function loadAccumulationExtras(symbol: string, bars: PriceBar[]): Promise<Record<string, number[]>> {
    const [delivery, oi, events] = await Promise.all([
        prisma.dailyCandle.findMany({ where: { symbol, isFinal: true, deliveryPct: { not: null } }, select: { tradingDate: true, deliveryPct: true } }),
        prisma.fnoDaily.findMany({ where: { symbol, isIndex: false }, select: { tradingDate: true, futOi: true } }),
        loadCorporateActions(symbol),
    ]);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const deliveryPct = alignByDate(bars, new Map(delivery.map(row => [key(row.tradingDate), row.deliveryPct!])));
    const futOi = alignByDate(bars, new Map(oi.map(row => {
        const date = key(row.tradingDate);
        const raw = Number(row.futOi);
        return [date, raw > 0 ? raw / factorBefore(events, date) : NaN] as const;
    })));
    return { deliveryPct, futOi };
}

/** One prepared series per bars array (the runner calls signal for every day of a stock). */
const prepared = new WeakMap<PriceBar[], AccumulationSeries>();
function seriesFor(bars: PriceBar[], ind: SeriesIndicators, extra: Record<string, number[]> | undefined): AccumulationSeries | null {
    if (!extra) return null;
    let s = prepared.get(bars);
    if (!s) {
        s = prepareAccumulation(bars, ind, { deliveryPct: extra.deliveryPct, futOi: extra.futOi });
        prepared.set(bars, s);
    }
    return s;
}

/** Watchlist size per signal date (filled while W runs). */
export const watchlistSize = new Map<string, number>();

type VariantId = 'A' | 'B' | 'W' | 'R';
const NAMES: Record<VariantId, string> = {
    A: 'Accumulation A: early dip while on the watchlist',
    B: 'Accumulation B: first volume surge after the watchlist',
    W: 'Accumulation W: every watchlist stock-day (measurement)',
    R: 'Accumulation R: every universe stock-day (random baseline)',
};

export function accumulationCard(id: VariantId): SetupCard {
    return {
        id: `accumulation-${id.toLowerCase()}`,
        name: NAMES[id],
        plan: 'accumulation-breakout-plan.md',
        thesis: 'Stocks that climb quietly for 20–25 sessions while big buyers add (rising delivery, slowly rising futures OI) tend to break out; buy before or at the start of the surge, not after it.',
        discoveryStart: '2021-01-05',
        testYears: ['2024', '2025', '2026'],
        rules: id === 'A' || id === 'B' ? TRADER_RULES : UNLIMITED,
        extras: id === 'R' ? undefined : loadAccumulationExtras,
        signal: (bars, ind, i, ctx) => {
            if (id === 'R') return { score: 0, exit: ACC_EXIT };
            const s = seriesFor(bars, ind, ctx.extra);
            if (!s) return null;
            if (id === 'W') {
                if (!s.watch[i]) return null;
                watchlistSize.set(bars[i].date, (watchlistSize.get(bars[i].date) ?? 0) + 1);
                return { score: smoothness(s, i), exit: ACC_EXIT };
            }
            if (id === 'A') return entryEarlyDip(s, i) ? { score: smoothness(s, i), exit: ACC_EXIT } : null;
            return entrySurge(s, i) ? { score: surgeScore(s, i), exit: ACC_EXIT } : null;
        },
        control: { label: 'every universe stock, same day and exit', include: () => true, exit: ACC_EXIT },
    };
}

export interface ShapeRow { n: number; hitPct: number; stopPct: number; timePct: number; avgWin: number; avgLoss: number; avgDays: number }
export function tradeShape(trades: HarnessTrade[]): ShapeRow {
    const n = trades.length;
    const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
    const share = (o: string) => (n ? (100 * trades.filter(t => t.outcome === o).length) / n : 0);
    return {
        n,
        hitPct: share('TARGET'),
        stopPct: share('STOP'),
        timePct: share('TIME'),
        avgWin: mean(trades.filter(t => t.netPct > 0).map(t => t.netPct)),
        avgLoss: mean(trades.filter(t => t.netPct <= 0).map(t => t.netPct)),
        avgDays: mean(trades.map(t => t.exitIndex - t.entryIndex + 1)),
    };
}

const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

async function main(): Promise<void> {
    const results = new Map<VariantId, StudyResult>();
    for (const id of ['R', 'W', 'A', 'B'] as VariantId[]) {
        const kind = id === 'A' || id === 'B' ? 'pre-registered' : 'exploration';
        const note = id === 'W' || id === 'R' ? 'Measurement for the accumulation study, not a tradeable candidate; its verdict is ignored.' : undefined;
        results.set(id, await runSetupStudy(accumulationCard(id), kind, note));
    }
    const a = results.get('A')!;
    const b = results.get('B')!;
    const primaryId: VariantId = a.discovery.dayClustered >= b.discovery.dayClustered ? 'A' : 'B';
    const primary = results.get(primaryId)!;
    const split = (r: StudyResult) => ({ d: r.trades.filter(t => t.signalDate < TEST_START), t: r.trades.filter(t => t.signalDate >= TEST_START) });
    const sizes = [...watchlistSize.values()];
    const sizeMean = sizes.length ? sizes.reduce((x, y) => x + y, 0) / sizes.length : 0;
    const shapeRow = (label: string, s: ShapeRow) => `| ${label} | ${s.n.toLocaleString('en-IN')} | ${s.hitPct.toFixed(1)}% | ${s.stopPct.toFixed(1)}% | ${s.timePct.toFixed(1)}% | ${fmt(s.avgWin)} | ${fmt(s.avgLoss)} | ${s.avgDays.toFixed(1)} |`;

    const lines = [
        '# Accumulation then breakout',
        '',
        `Generated: ${new Date().toISOString()} · evaluation harness v3 · pre-registered plan: [\`accumulation-breakout-plan.md\`](accumulation-breakout-plan.md)`,
        '',
        `## Verdict: ${primary.passed ? '**PASS**' : '**FAIL**'}`,
        '',
        `Primary (better discovery day-clustered average of A and B): **${primaryId}**. Full checks in [\`accumulation-${primaryId.toLowerCase()}.md\`](accumulation-${primaryId.toLowerCase()}.md).`,
        '',
        '| Variant | Discovery trades | Discovery avg | Discovery day-clustered | Discovery excess vs random | Test trades | Test avg | Test day-clustered | Test excess vs random | All checks |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
        ...(['A', 'B', 'W', 'R'] as VariantId[]).map(id => {
            const r = results.get(id)!;
            const tradeable = id === 'A' || id === 'B';
            return `| [${id}](accumulation-${id.toLowerCase()}.md)${tradeable ? '' : ' (measurement)'} | ${r.discovery.n.toLocaleString('en-IN')} | ${fmt(r.discovery.avg)} | ${fmt(r.discovery.dayClustered)} | ${r.excess ? fmt(r.excess.discovery.avg) : '—'} | ${r.test.n.toLocaleString('en-IN')} | ${fmt(r.test.avg)} | ${fmt(r.test.dayClustered)} | ${r.excess ? fmt(r.excess.test.avg) : '—'} | ${tradeable ? (r.passed ? '✅' : '❌') : '—'} |`;
        }),
        '',
        '## Does the watchlist beat random stocks? (+5% / −2.5% / 15 sessions)',
        '',
        '| Group / period | Trades | Hit +5% first | Stopped | Time exit | Avg winner | Avg loser | Avg days |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        ...(['R', 'W', 'A', 'B'] as VariantId[]).flatMap(id => {
            const { d, t } = split(results.get(id)!);
            const label = { R: 'Random (all stocks)', W: 'Watchlist (all days)', A: 'A: early dip', B: 'B: first surge' }[id];
            return [shapeRow(`${label}, discovery`, tradeShape(d)), shapeRow(`${label}, **test**`, tradeShape(t))];
        }),
        '',
        `Watchlist size: ${sizes.length} signal days with at least one stock, ${sizeMean.toFixed(1)} stocks on average, largest ${sizes.length ? Math.max(...sizes) : 0}.`,
        '',
        'With +5% / −2.5% and 0.4% costs, a strategy needs about 40% of trades hitting +5% to break even.',
        '',
        primary.passed
            ? `Per plan: add ${primaryId} to Auto Paper as ACCUMULATION_BREAKOUT and show the evening watchlist there.`
            : 'Per plan: do not trade it and do not re-tune on the test period. If W beats R while A and B fail, the stock selection works and the entry timing is the problem.',
        '',
        'Research output, not investment advice.',
        '',
    ];
    writeFileSync(join('reports', 'accumulation-breakout.md'), lines.join('\n'));
    console.log(`[Accumulation] Primary ${primaryId} → ${primary.passed ? 'PASS' : 'FAIL'}`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Accumulation] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
