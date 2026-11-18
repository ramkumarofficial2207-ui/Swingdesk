import { describe, expect, it } from 'vitest';
import { scoreInstitutionalCandidate } from '../src/services/institutionalCandidateService';

describe('institutional candidate scoring', () => {
  it('rewards stronger, recent multi-source accumulation with delivery evidence', () => {
    const weak = scoreInstitutionalCandidate({
      netInstitutionalCr: 1,
      sourceTypes: ['HNI'],
      daysSinceAccumulation: 25,
      deliverySpikeRatio: 0.8,
      deliveryPct: 30,
      turnoverCr: 3,
      totalTrades: 500,
    });
    const strong = scoreInstitutionalCandidate({
      netInstitutionalCr: 25,
      sourceTypes: ['DII', 'FII'],
      daysSinceAccumulation: 1,
      deliverySpikeRatio: 1.7,
      deliveryPct: 62,
      turnoverCr: 150,
      totalTrades: 100_000,
    });

    expect(strong.institutionalScore).toBeGreaterThan(weak.institutionalScore);
    expect(strong.liquidityScore).toBeGreaterThan(weak.liquidityScore);
    expect(strong.candidateScore).toBeGreaterThan(weak.candidateScore);
    expect(strong.candidateScore).toBeLessThanOrEqual(100);
  });

  it('keeps every component bounded and deterministic', () => {
    const input = {
      netInstitutionalCr: 10_000,
      sourceTypes: ['DII', 'FII', 'PROMOTER'],
      daysSinceAccumulation: 0,
      deliverySpikeRatio: 10,
      deliveryPct: 100,
      turnoverCr: 100_000,
      totalTrades: 10_000_000,
    };
    expect(scoreInstitutionalCandidate(input)).toEqual(scoreInstitutionalCandidate(input));
    expect(scoreInstitutionalCandidate(input)).toEqual({
      institutionalScore: 100,
      liquidityScore: 100,
      candidateScore: 100,
    });
  });
});
