import prisma from './prismaClient';

type SavedSetup = { ticker: string; buyZone: number; stopLoss: number; target: number; setupType?: string };
export type EodResearchSignal = {
    ticker: string; setupType: string; status: 'WAITING' | 'EOD_CONFIRMED' | 'INVALIDATED' | 'EXPIRED';
    entry: number; stop: number; target: number; observedDate: string | null;
    close: number | null; volumeRatio: number | null; reason: string;
};

async function evaluateScan(job: { result: unknown; completedAt: Date | null }): Promise<{ scanAt: string | null; signals: EodResearchSignal[] }> {
    const result = job?.result as unknown as { timestamp?: string; setups?: SavedSetup[] } | null;
    if (!result?.setups || !job?.completedAt) return { scanAt: null, signals: [] };
    const scanAt = result.timestamp ?? job.completedAt.toISOString();
    const scanDay = new Date(scanAt.slice(0, 10) + 'T00:00:00.000Z');
    const symbols = result.setups.map(setup => setup.ticker);
    const historyStart = new Date(scanDay);
    historyStart.setUTCDate(historyStart.getUTCDate() - 50);
    const candles = await prisma.dailyCandle.findMany({
        where: { symbol: { in: symbols }, tradingDate: { gte: historyStart }, isFinal: true },
        orderBy: [{ symbol: 'asc' }, { tradingDate: 'asc' }],
        select: { symbol: true, tradingDate: true, close: true, volume: true },
    });
    const bySymbol = new Map<string, typeof candles>();
    for (const candle of candles) {
        const rows = bySymbol.get(candle.symbol) ?? [];
        rows.push(candle);
        bySymbol.set(candle.symbol, rows);
    }
    const signals = result.setups.map((setup): EodResearchSignal => {
        const rows = bySymbol.get(setup.ticker) ?? [];
        const later = rows.filter(row => row.tradingDate > scanDay).slice(0, 5);
        const base = { ticker: setup.ticker, setupType: setup.setupType ?? 'Swing', entry: setup.buyZone, stop: setup.stopLoss, target: setup.target };
        if (!(base.stop > 0 && base.stop < base.entry && base.target > base.entry)) return { ...base, status: 'INVALIDATED', observedDate: null, close: null, volumeRatio: null, reason: 'Saved price plan is invalid.' };
        for (const row of later) {
            const prior = rows.filter(candidate => candidate.tradingDate < row.tradingDate).slice(-20);
            const meanVolume = prior.length === 20 ? prior.reduce((sum, candidate) => sum + Number(candidate.volume), 0) / 20 : 0;
            const volumeRatio = meanVolume > 0 ? Number(row.volume) / meanVolume : null;
            const observedDate = row.tradingDate.toISOString().slice(0, 10);
            if (row.close <= base.stop) return { ...base, status: 'INVALIDATED', observedDate, close: row.close, volumeRatio, reason: 'Finalized close is at or below the planned stop.' };
            if (row.close > base.entry && volumeRatio !== null && volumeRatio >= 1.5) return { ...base, status: 'EOD_CONFIRMED', observedDate, close: row.close, volumeRatio, reason: 'Finalized close cleared entry with at least 1.5× the prior 20-session average volume.' };
        }
        const last = later.at(-1);
        return { ...base, status: later.length >= 5 ? 'EXPIRED' : 'WAITING', observedDate: last?.tradingDate.toISOString().slice(0, 10) ?? null, close: last?.close ?? null, volumeRatio: null, reason: later.length >= 5 ? 'No EOD confirmation within five sessions.' : 'Awaiting a later finalized session with price and volume confirmation.' };
    });
    return { scanAt, signals };
}

export async function getEodResearchSignals(): Promise<{ scanAt: string | null; signals: EodResearchSignal[] }> {
    // The next day's scan replaces the latest result, so retain recent scan
    // cohorts long enough to evaluate their subsequent finalized sessions.
    const jobs = await prisma.scanJob.findMany({ where: { mode: 'swing', status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, take: 10, select: { result: true, completedAt: true } });
    if (!jobs.length) return { scanAt: null, signals: [] };
    const evaluated = await Promise.all(jobs.map(evaluateScan));
    const latest = evaluated[0];
    const confirmed = evaluated.flatMap(batch => batch.signals.filter(signal => signal.status === 'EOD_CONFIRMED'));
    const seen = new Set<string>();
    const uniqueConfirmed = confirmed.filter(signal => { if (seen.has(signal.ticker)) return false; seen.add(signal.ticker); return true; });
    return { scanAt: latest.scanAt, signals: [...uniqueConfirmed, ...latest.signals.filter(signal => signal.status !== 'EOD_CONFIRMED')] };
}
