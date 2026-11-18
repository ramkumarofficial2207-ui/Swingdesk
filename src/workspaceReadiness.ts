export type ReadinessState = 'READY' | 'STALE' | 'MISSING' | 'DISABLED';
export function tradingDateInIst(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function assessWorkspaceReadiness(input: {
    eodDate?: string | null; eodStatus?: string | null; scanAt?: string | null;
    marketOpen: boolean; latestTickAt?: string | null; feedConnected: boolean;
    automaticScanEnabled: boolean; automaticExecutionEnabled: boolean; now?: Date;
}) {
    const now = input.now ?? new Date();
    const eod: ReadinessState = !input.eodDate ? 'MISSING' : input.eodStatus !== 'READY' ? 'STALE' :
        now.getTime() - new Date(`${input.eodDate}T00:00:00+05:30`).getTime() > 4 * 86400000 ? 'STALE' : 'READY';
    const scan: ReadinessState = !input.scanAt ? 'MISSING' : now.getTime() - Date.parse(input.scanAt) > 3 * 86400000 ? 'STALE' : 'READY';
    const tick: ReadinessState = !input.marketOpen ? 'DISABLED' : !input.feedConnected || !input.latestTickAt ? 'MISSING' :
        now.getTime() - Date.parse(input.latestTickAt) > 30000 ? 'STALE' : 'READY';
    return { eod, scan, tick, automaticScan: input.automaticScanEnabled ? 'READY' as const : 'DISABLED' as const,
        automaticExecution: input.automaticExecutionEnabled ? 'READY' as const : 'DISABLED' as const };
}
