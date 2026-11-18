import { describe, expect, it } from 'vitest';
import { resolveSetupOutcome } from '../src/performanceJob';

const candle = (date: string, low: number, high: number) => ({
  date,
  open: 100,
  high,
  low,
  close: 100,
  volume: 1_000,
});

describe('chronological setup outcome resolution', () => {
  it('uses the first post-trigger level touch', () => {
    const result = resolveSetupOutcome([
      candle('2026-08-01', 98, 105),
      candle('2026-08-02', 99, 111),
      candle('2026-08-03', 94, 103),
    ], 110, 95);
    expect(result).toMatchObject({ status: 'WON', resolvedPrice: 110, ambiguous: false });
  });

  it('resolves same-bar target and stop touches conservatively', () => {
    const result = resolveSetupOutcome([
      candle('2026-08-01', 94, 111),
    ], 110, 95);
    expect(result).toMatchObject({ status: 'LOST', resolvedPrice: 95, ambiguous: true });
  });
});
