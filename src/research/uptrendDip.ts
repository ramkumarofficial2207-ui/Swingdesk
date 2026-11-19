/**
 * Uptrend dip study (reports/uptrend-dip-plan.md). Pure helpers: the signal
 * uses bars up to the close of day i; entry is the open of day i+1.
 */
import { PriceBar } from '../corporateActions';
import { simulateFrom, TradeLabel } from './fivePercentStudy';
import { SeriesIndicators } from './momentumPullback';

export const UD_RULES = {
    maxDayPct: -3,
    max5dPct: -5,
    costBps: 40,
    u1Horizon: 5,
    u2StopAtr: 1.5,
    u2TargetR: 2,
    u2Horizon: 10,
} as const;

/** Signal at the close of day i (all three rules). */
export function isUptrendDip(bars: PriceBar[], ind: SeriesIndicators, i: number): boolean {
    if (i < 50 || i >= bars.length) return false;
    const close = bars[i].close;
    const prev = bars[i - 1].close;
    const fiveAgo = bars[i - 5].close;
    if (!(close > 0 && prev > 0 && fiveAgo > 0) || !Number.isFinite(ind.sma50[i])) return false;
    return close <= prev * (1 + UD_RULES.maxDayPct / 100)
        && close <= fiveAgo * (1 + UD_RULES.max5dPct / 100)
        && close > ind.sma50[i];
}

export interface DipTrade {
    label: TradeLabel;
    /** Net % return after costs. */
    netPct: number;
}

const net = (label: TradeLabel): number => ((label.exit - label.entry) / label.entry) * 100 - UD_RULES.costBps / 100;

/** U1: buy the next open, sell at the close of the 5th session (entry day = session 1). No stop. */
export function u1Trade(bars: PriceBar[], i: number): DipTrade | null {
    const entryIndex = i + 1;
    const last = entryIndex + UD_RULES.u1Horizon - 1;
    if (last >= bars.length || !(bars[entryIndex].open > 0)) return null;
    const entry = bars[entryIndex].open;
    const exit = bars[last].close;
    const label: TradeLabel = { outcome: 'EXPIRED', entry, exit, netR: NaN, sessionsHeld: UD_RULES.u1Horizon, exitIndex: last };
    return { label, netPct: net(label) };
}

/** U2: stop 1.5 × ATR(14 at day i) below the next open, target 2 × stop, 10 sessions. */
export function u2Trade(bars: PriceBar[], ind: SeriesIndicators, i: number): DipTrade | null {
    const entryIndex = i + 1;
    if (entryIndex >= bars.length) return null;
    const atrPct = (ind.atr14[i] / bars[i].close) * 100;
    if (!(atrPct > 0)) return null;
    const stopPct = UD_RULES.u2StopAtr * atrPct;
    const label = simulateFrom(bars, entryIndex, bars[entryIndex].open, stopPct, UD_RULES.u2TargetR * stopPct, UD_RULES.u2Horizon, UD_RULES.costBps);
    return label ? { label, netPct: net(label) } : null;
}

export interface PctStats { n: number; avg: number; ci: number; dayClustered: number; days: number; winRate: number }

/** Mean net %, its 95% half-width, and the mean of per-signal-date averages. */
export function pctStats(rows: Array<{ date: string; netPct: number }>): PctStats {
    const n = rows.length;
    if (!n) return { n: 0, avg: 0, ci: 0, dayClustered: 0, days: 0, winRate: 0 };
    const avg = rows.reduce((sum, row) => sum + row.netPct, 0) / n;
    const variance = n > 1 ? rows.reduce((sum, row) => sum + (row.netPct - avg) ** 2, 0) / (n - 1) : 0;
    const byDate = new Map<string, number[]>();
    for (const row of rows) { const list = byDate.get(row.date) ?? []; list.push(row.netPct); byDate.set(row.date, list); }
    const daily = [...byDate.values()].map(list => list.reduce((sum, value) => sum + value, 0) / list.length);
    return {
        n,
        avg,
        ci: 1.96 * Math.sqrt(variance / n),
        dayClustered: daily.reduce((sum, value) => sum + value, 0) / daily.length,
        days: daily.length,
        winRate: (100 * rows.filter(row => row.netPct > 0).length) / n,
    };
}
