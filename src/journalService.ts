import prisma from './prismaClient';

/**
 * Trade journal: plan vs actual, review on close, and the statistics that
 * show what actually drives results — especially what broken rules cost.
 */

export const MISTAKE_TAGS = [
    'CHASED_ENTRY',
    'MOVED_STOP',
    'NO_STOP',
    'EARLY_EXIT',
    'LATE_EXIT',
    'OVERSIZED',
    'IGNORED_RESULTS_DATE',
    'TRADED_AGAINST_MARKET',
    'FOMO',
    'REVENGE_TRADE',
] as const;
export type MistakeTag = typeof MISTAKE_TAGS[number];

export const EMOTIONS = ['CALM', 'CONFIDENT', 'ANXIOUS', 'FOMO', 'REVENGE'] as const;
export const GRADES = ['A', 'B', 'C'] as const;

export interface JournalTrade {
    id: string;
    ticker: string;
    setupType: string;
    status: string;
    entryDate: Date;
    exitDate: Date | null;
    entryPrice: number;
    exitPrice: number | null;
    quantity: number;
    stopLossInit: number;
    target1: number;
    pnlRs: number | null;
    rMultiple: number | null;
    daysHeld: number | null;
    exitReason: string | null;
    plannedEntry: number | null;
    plannedStop: number | null;
    plannedTarget: number | null;
    entryReason: string | null;
    emotionAtEntry: string | null;
    followedPlan: boolean | null;
    mistakes: string[];
    grade: string | null;
    lesson: string | null;
    reviewedAt: Date | null;
    maxFavorablePrice: number | null;
    maxAdversePrice: number | null;
}

export interface GroupStat {
    key: string;
    trades: number;
    avgR: number;
    totalR: number;
    winRate: number;
}

export interface JournalStats {
    closed: number;
    open: number;
    reviewed: number;
    winRate: number | null;
    avgR: number | null;
    avgWinR: number | null;
    avgLossR: number | null;
    totalPnlRs: number;
    profitFactor: number | null;
    maxDrawdownR: number;
    longestLosingStreak: number;
    avgDaysHeld: number | null;
    /** Average (actual entry − planned entry) / planned entry, in %. Positive = paid more than planned. */
    avgEntrySlippagePct: number | null;
    /** Average best price reached during the trade, in R from entry. */
    avgMaxFavorableR: number | null;
    /** Average share of the best move that winners kept, in %. */
    avgCaptureOfBestMovePct: number | null;
    followedPlan: GroupStat | null;
    brokePlan: GroupStat | null;
    byMistake: GroupStat[];
    bySetup: GroupStat[];
    byEmotion: GroupStat[];
    insights: string[];
}

const round = (value: number, digits = 2) => +value.toFixed(digits);
const fmtR = (value: number, digits = 2) => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}R`;
const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

function group(trades: JournalTrade[], keys: (trade: JournalTrade) => string[]): GroupStat[] {
    const map = new Map<string, number[]>();
    for (const trade of trades) {
        for (const key of keys(trade)) {
            const list = map.get(key) ?? [];
            list.push(trade.rMultiple ?? 0);
            map.set(key, list);
        }
    }
    return [...map].map(([key, rs]) => ({
        key,
        trades: rs.length,
        avgR: round(mean(rs)!),
        totalR: round(rs.reduce((sum, value) => sum + value, 0)),
        winRate: round((100 * rs.filter(value => value > 0).length) / rs.length, 1),
    })).sort((left, right) => left.totalR - right.totalR);
}

function riskPerShare(trade: JournalTrade): number {
    return trade.entryPrice - trade.stopLossInit;
}

/** Statistics over the journal. Only closed trades with an R multiple count toward results. */
export function computeJournalStats(trades: JournalTrade[]): JournalStats {
    const closed = trades
        .filter(trade => trade.status === 'CLOSED' && trade.rMultiple !== null)
        .sort((left, right) => (left.exitDate?.getTime() ?? 0) - (right.exitDate?.getTime() ?? 0));
    const rs = closed.map(trade => trade.rMultiple!);
    const wins = rs.filter(value => value > 0);
    const losses = rs.filter(value => value <= 0);
    let equity = 0, peak = 0, maxDrawdownR = 0, streak = 0, longestLosingStreak = 0;
    for (const value of rs) {
        equity += value;
        peak = Math.max(peak, equity);
        maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
        streak = value <= 0 ? streak + 1 : 0;
        longestLosingStreak = Math.max(longestLosingStreak, streak);
    }
    const grossWin = wins.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));

    const slippages = trades
        .filter(trade => trade.plannedEntry && trade.plannedEntry > 0)
        .map(trade => ((trade.entryPrice - trade.plannedEntry!) / trade.plannedEntry!) * 100);
    const favorable = closed
        .filter(trade => trade.maxFavorablePrice !== null && riskPerShare(trade) > 0)
        .map(trade => (trade.maxFavorablePrice! - trade.entryPrice) / riskPerShare(trade));
    const captures = closed
        .filter(trade => (trade.rMultiple ?? 0) > 0 && trade.maxFavorablePrice !== null && trade.exitPrice !== null && trade.maxFavorablePrice! > trade.entryPrice)
        .map(trade => (100 * (trade.exitPrice! - trade.entryPrice)) / (trade.maxFavorablePrice! - trade.entryPrice));

    const reviewed = closed.filter(trade => trade.followedPlan !== null);
    const planGroups = group(reviewed, trade => [trade.followedPlan ? 'FOLLOWED' : 'BROKE']);
    const followedPlan = planGroups.find(item => item.key === 'FOLLOWED') ?? null;
    const brokePlan = planGroups.find(item => item.key === 'BROKE') ?? null;
    const byMistake = group(closed.filter(trade => trade.mistakes.length), trade => trade.mistakes);
    const bySetup = group(closed, trade => [trade.setupType || 'Manual']);
    const byEmotion = group(closed.filter(trade => trade.emotionAtEntry), trade => [trade.emotionAtEntry!]);

    const avgSlippage = mean(slippages);
    const avgCapture = mean(captures);
    const insights: string[] = [];
    if (closed.length < 20) insights.push(`Only ${closed.length} closed trade${closed.length === 1 ? '' : 's'} so far; patterns become reliable after about 20–30.`);
    if (followedPlan && brokePlan) {
        const gap = followedPlan.avgR - brokePlan.avgR;
        insights.push(gap > 0
            ? `Trades where you followed your plan averaged ${fmtR(followedPlan.avgR)}; trades where you broke it averaged ${fmtR(brokePlan.avgR)}. Breaking the plan cost ${Math.abs(brokePlan.totalR).toFixed(1)}R in total.`
            : `Trades where you broke your plan did no worse (${fmtR(brokePlan.avgR)} vs ${fmtR(followedPlan.avgR)}). Review whether the plan itself needs changing.`);
    }
    const costliest = byMistake.find(item => item.totalR < 0);
    if (costliest) insights.push(`Your costliest mistake is ${costliest.key.toLowerCase().replace(/_/g, ' ')}: ${costliest.trades} trade${costliest.trades === 1 ? '' : 's'}, ${fmtR(costliest.totalR, 1)} in total.`);
    if (avgSlippage !== null && avgSlippage > 0.5) insights.push(`You enter on average ${avgSlippage.toFixed(1)}% above the planned price. Chasing raises risk per share and lowers reward.`);
    if (avgCapture !== null && avgCapture < 50) insights.push(`Winners kept only ${avgCapture.toFixed(0)}% of their best move. Consider a trailing stop instead of exiting early.`);
    const worstEmotion = byEmotion.find(item => item.avgR < 0 && item.trades >= 3);
    if (worstEmotion) insights.push(`Trades entered feeling ${worstEmotion.key.toLowerCase()} averaged ${fmtR(worstEmotion.avgR)}.`);
    if (longestLosingStreak >= 4) insights.push(`Longest losing streak: ${longestLosingStreak}. Size so that a streak twice that long is survivable.`);

    return {
        closed: closed.length,
        open: trades.filter(trade => trade.status === 'OPEN').length,
        reviewed: closed.filter(trade => trade.reviewedAt).length,
        winRate: rs.length ? round((100 * wins.length) / rs.length, 1) : null,
        avgR: rs.length ? round(mean(rs)!) : null,
        avgWinR: wins.length ? round(mean(wins)!) : null,
        avgLossR: losses.length ? round(mean(losses)!) : null,
        totalPnlRs: round(closed.reduce((sum, trade) => sum + (trade.pnlRs ?? 0), 0)),
        profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : null,
        maxDrawdownR: round(maxDrawdownR),
        longestLosingStreak,
        avgDaysHeld: closed.length ? round(mean(closed.map(trade => trade.daysHeld ?? 0))!, 1) : null,
        avgEntrySlippagePct: avgSlippage === null ? null : round(avgSlippage),
        avgMaxFavorableR: favorable.length ? round(mean(favorable)!) : null,
        avgCaptureOfBestMovePct: avgCapture === null ? null : round(avgCapture, 1),
        followedPlan,
        brokePlan,
        byMistake,
        bySetup,
        byEmotion,
        insights,
    };
}

/** Highest high and lowest low from entry date through exit date (inclusive). */
export function priceExcursions(candles: Array<{ high: number; low: number }>): { maxFavorablePrice: number; maxAdversePrice: number } | null {
    if (!candles.length) return null;
    return {
        maxFavorablePrice: Math.max(...candles.map(candle => candle.high)),
        maxAdversePrice: Math.min(...candles.map(candle => candle.low)),
    };
}

function utcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Fill in best/worst price for closed trades that do not have them yet. */
async function fillExcursions(trades: JournalTrade[]): Promise<void> {
    for (const trade of trades) {
        if (trade.status !== 'CLOSED' || !trade.exitDate || trade.maxFavorablePrice !== null) continue;
        const candles = await prisma.dailyCandle.findMany({
            where: { symbol: trade.ticker, isFinal: true, tradingDate: { gte: utcDay(trade.entryDate), lte: utcDay(trade.exitDate) } },
            select: { high: true, low: true },
        });
        const excursions = priceExcursions(candles);
        if (!excursions) continue;
        await prisma.trade.update({ where: { id: trade.id }, data: excursions });
        Object.assign(trade, excursions);
    }
}

export async function getJournal(userId: string): Promise<{ trades: JournalTrade[]; stats: JournalStats; mistakeTags: readonly string[]; emotions: readonly string[] }> {
    const trades = await prisma.trade.findMany({ where: { userId }, orderBy: { entryDate: 'desc' } }) as unknown as JournalTrade[];
    await fillExcursions(trades);
    return { trades, stats: computeJournalStats(trades), mistakeTags: MISTAKE_TAGS, emotions: EMOTIONS };
}

export interface JournalReview {
    entryReason?: string;
    emotionAtEntry?: typeof EMOTIONS[number] | null;
    followedPlan?: boolean | null;
    mistakes?: MistakeTag[];
    grade?: typeof GRADES[number] | null;
    lesson?: string;
}

export async function reviewTrade(userId: string, tradeId: string, review: JournalReview) {
    const result = await prisma.trade.updateMany({
        where: { id: tradeId, userId },
        data: { ...review, mistakes: review.mistakes ? [...new Set(review.mistakes)] : undefined, reviewedAt: new Date() },
    });
    if (result.count !== 1) throw new Error('Trade not found.');
    return prisma.trade.findFirstOrThrow({ where: { id: tradeId, userId } });
}
