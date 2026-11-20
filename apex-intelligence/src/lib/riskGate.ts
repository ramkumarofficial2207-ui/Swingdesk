import { ScanItem } from '../types';

/**
 * Stop-width limit for evening setups. Live picks from Aug–Oct 2026 had stops
 * averaging 9.1% below entry, and the stop-outs (−12.7% each) caused most of
 * the −5.22% loss (reports/AUDIT_FINDINGS.md). A setup whose structural stop
 * is wider than the trader's limit is not shown as a candidate.
 */
export const STOP_LIMIT_OPTIONS = [2.5, 3, 4, 5] as const;
export const DEFAULT_STOP_LIMIT = 3;

/** Stop distance below the entry in %, or null when the levels are missing. */
export function stopDistancePct(item: Pick<ScanItem, 'buyZoneMin' | 'stopLoss'> & { stopLossPct?: number }): number | null {
    if (item.buyZoneMin > 0 && item.stopLoss > 0 && item.stopLoss < item.buyZoneMin) {
        return ((item.buyZoneMin - item.stopLoss) / item.buyZoneMin) * 100;
    }
    return typeof item.stopLossPct === 'number' && item.stopLossPct > 0 ? item.stopLossPct : null;
}

export interface GatedSetups<T> {
    within: T[];
    wider: Array<T & { stopPct: number | null }>;
}

/** Split setups into those whose stop fits the limit and those that do not (missing levels count as not fitting). */
export function gateByStop<T extends Pick<ScanItem, 'buyZoneMin' | 'stopLoss'> & { stopLossPct?: number }>(items: T[], limitPct: number): GatedSetups<T> {
    const within: T[] = [];
    const wider: GatedSetups<T>['wider'] = [];
    for (const item of items) {
        const stopPct = stopDistancePct(item);
        if (stopPct !== null && stopPct <= limitPct) within.push(item);
        else wider.push({ ...item, stopPct });
    }
    return { within, wider };
}

/** "4.4–12.5%" style range of the hidden setups' stops. */
export function stopRangeLabel(values: Array<number | null>): string {
    const known = values.filter((value): value is number => value !== null);
    if (!known.length) return 'unknown';
    const low = Math.min(...known);
    const high = Math.max(...known);
    return low === high ? `${low.toFixed(1)}%` : `${low.toFixed(1)}–${high.toFixed(1)}%`;
}
