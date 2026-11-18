import { describe, expect, it } from 'vitest';
import { formatR, positionSize, SetupEvidenceView, trustFor } from '../apex-intelligence/src/lib/setupTrust';

const evidence = (setupType: string, status: SetupEvidenceView['status']): SetupEvidenceView => ({
  setupType, status, reasons: ['reason'], goalRateTest: 30, generatedAt: '2026-11-19T00:00:00Z',
  test: { n: 500, targetPct: 30, stopPct: 60, expiredPct: 10, avgNetR: -0.1, ciNetR: 0.05 },
});

describe('trustFor', () => {
  it('treats untested setup types as research-only', () => {
    expect(trustFor('Mystery Setup', [])).toMatchObject({ status: 'RESEARCH_ONLY', label: 'Research only' });
    expect(trustFor(undefined, [evidence('X', 'TRUSTED')]).status).toBe('RESEARCH_ONLY');
  });

  it('uses the stored status and explains it', () => {
    const list = [evidence('Bull Flag Breakout 🚩', 'RESEARCH_ONLY'), evidence('VCP Breakout 🔥', 'ON_TRIAL'), evidence('Leader Pullback Reclaim', 'TRUSTED')];
    expect(trustFor('Bull Flag Breakout 🚩', list).headline).toMatch(/Do not trade/);
    expect(trustFor('VCP Breakout 🔥', list)).toMatchObject({ status: 'ON_TRIAL', label: 'On trial' });
    expect(trustFor('VCP Breakout 🔥', list).headline).toMatch(/Paper trade only/);
    expect(trustFor('Leader Pullback Reclaim', list).status).toBe('TRUSTED');
  });
});

describe('positionSize', () => {
  it('sizes so a stop-out loses at most the risk budget', () => {
    // ₹1,00,000 × 1% = ₹1,000 risk; ₹5 per share → 200 shares, but 20% cap = ₹20,000 / ₹100 = 200.
    expect(positionSize({ capital: 100_000, maxRiskPct: 1, entry: 100, stop: 95 }))
      .toEqual({ shares: 200, amount: 20_000, riskAmount: 1_000, limitedBy: 'RISK' });
  });

  it('caps a tight stop at 20% of capital per position', () => {
    // ₹1,000 / ₹1 = 1,000 shares by risk, but the cap allows 200.
    expect(positionSize({ capital: 100_000, maxRiskPct: 1, entry: 100, stop: 99 }))
      .toMatchObject({ shares: 200, riskAmount: 200, limitedBy: 'POSITION_CAP' });
  });

  it('never exceeds available cash', () => {
    expect(positionSize({ capital: 100_000, maxRiskPct: 1, entry: 100, stop: 95, availableCash: 5_050 }))
      .toMatchObject({ shares: 50, amount: 5_000, limitedBy: 'CASH' });
    expect(positionSize({ capital: 100_000, maxRiskPct: 1, entry: 100, stop: 95, availableCash: 0 }))
      .toMatchObject({ shares: 0, limitedBy: 'CASH' });
  });

  it('rejects invalid levels', () => {
    expect(positionSize({ capital: 100_000, maxRiskPct: 1, entry: 100, stop: 100 })).toBeNull();
    expect(positionSize({ capital: 0, maxRiskPct: 1, entry: 100, stop: 95 })).toBeNull();
  });
});

describe('formatR', () => {
  it('shows a sign', () => {
    expect(formatR(0.234)).toBe('+0.23R');
    expect(formatR(-0.1)).toBe('−0.10R');
  });
});
