import { ScanItem } from '../types';

export function confirmedDiscoverSetups(current: ScanItem[], lifecycle: ScanItem[], scanAt?: string): ScanItem[] {
  const scanTime = scanAt ? Date.parse(scanAt) : NaN;
  if (!Number.isFinite(scanTime)) return [];
  const byTicker = new Map(lifecycle.map(item => [item.ticker, item]));
  return current.flatMap(item => {
    const confirmed = byTicker.get(item.ticker);
    if (!confirmed || confirmed.triggerConfirmed !== true || confirmed.status !== 'TRIGGERED') return [];
    const triggerTime = confirmed.triggeredAt ? Date.parse(confirmed.triggeredAt) : NaN;
    if (!Number.isFinite(triggerTime) || triggerTime < scanTime) return [];
    if (!(confirmed.buyZoneMin > 0 && confirmed.stopLoss > 0 && confirmed.stopLoss < confirmed.buyZoneMin && confirmed.target1 >= confirmed.buyZoneMin * 1.05)) return [];
    return [confirmed];
  });
}
