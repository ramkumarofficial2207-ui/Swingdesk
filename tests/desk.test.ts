import { describe, expect, it } from 'vitest';
import { drawdownBrake, journalStats, swingPlan } from '../apex-intelligence/src/lib/desk';
import type { Trade } from '../apex-intelligence/src/types';

const trade = (over: Partial<Trade>): Trade => ({ id: Math.random().toString(), userId: 'u', ticker: 'X', capCategory: 'UNKNOWN' as any, setupType: 'Manual', status: 'CLOSED' as any, entryDate: '2026-11-01', entryPrice: 100, quantity: 10, stopLossInit: 97.5, target1: 105, ...over });

describe('swing plan', () => {
  it('gives risk, the +5% target and its R multiple', () => {
    const p = swingPlan(100, 97.5)!;
    expect(p.riskPct).toBeCloseTo(2.5);
    expect(p.target).toBeCloseTo(105);
    expect(p.targetR).toBeCloseTo(2);
    expect(p.fitsLimit).toBe(true);
    expect(swingPlan(100, 90)!.fitsLimit).toBe(false);
    expect(swingPlan(100, 101)).toBeNull();
  });
});

describe('drawdown brake', () => {
  it('stays off while equity is near its peak', () => {
    const b = drawdownBrake([trade({ pnlRs: 2000, exitDate: '2026-11-02' }), trade({ pnlRs: -1000, exitDate: '2026-11-03' })], 100000, new Date('2026-11-20'));
    expect(b.active).toBe(false);
    expect(b.drawdownPct).toBeCloseTo((1 - 101000 / 102000) * 100, 4);
  });
  it('turns on at 5% below the peak and holds for 7 days', () => {
    const trades = [trade({ pnlRs: 2000, exitDate: '2026-11-02' }), trade({ pnlRs: -6000, exitDate: '2026-11-10' }), trade({ pnlRs: 2000, exitDate: '2026-11-11' })];
    expect(drawdownBrake(trades, 100000, new Date('2026-11-12')).active).toBe(true);
    expect(drawdownBrake(trades, 100000, new Date('2026-11-20')).active).toBe(false);
  });
});

describe('journal stats', () => {
  it('groups closed trades and reports win rate, average win/loss and R', () => {
    const s = journalStats([
      trade({ setupType: 'VCP', pnlPct: 5, rMultiple: 2, pnlRs: 500 }),
      trade({ setupType: 'VCP', pnlPct: -2.5, rMultiple: -1, pnlRs: -250 }),
      trade({ setupType: 'EMA20', pnlPct: -1, rMultiple: -0.4, pnlRs: -100 }),
      trade({ setupType: 'VCP', status: 'OPEN' as any }),
    ], t => t.setupType);
    const vcp = s.find(g => g.key === 'VCP')!;
    expect(vcp.n).toBe(2);
    expect(vcp.winRate).toBe(50);
    expect(vcp.avgWinPct).toBe(5);
    expect(vcp.avgLossPct).toBe(-2.5);
    expect(vcp.avgR).toBe(0.5);
    expect(vcp.totalRs).toBe(250);
  });
});
