import { describe, expect, it } from 'vitest';
import { buildMlRankingFeatures, ML_FEATURE_SCHEMA_VERSION } from '../src/mlRankingService';

describe('ML ranking feature contract', () => {
  it('builds point-in-time technical, institutional and categorical features', () => {
    const setups = [{
      ticker: 'TEST',
      sector: 'Capital Goods',
      setupType: 'Pre-Surge Hybrid Base 🌱',
      setupFamily: 'PRE_SURGE',
      ltp: 102,
      buyZone: 104,
      target: 120,
      stopLoss: 96,
      targetPct: 15.38,
      slPct: 7.69,
      riskReward: 2,
      confidenceScore: 7.5,
      calibratedEdgeScore: 8.1,
      confluenceScore: 7.8,
      discoverySources: ['INSTITUTIONAL', 'LIQUIDITY'],
      institutionalCandidateScore: 82,
      institutionalScore: 88,
      institutionalNetBuyCr: 25,
      institutionalDeliverySpikeRatio: 1.7,
    }] as any;
    const indicators = [{
      ticker: 'TEST',
      ltp: 102,
      ema20: 100,
      ema50: 95,
      dma200: 80,
      rsi14: 58,
      adx14: 24,
      volumeRatio: 0.8,
      returns1m: 8,
      returns3m: 20,
      nifty1mReturn: 3,
      nifty3mReturn: 10,
      accumulationScore: 70,
      preMoveScore: 8,
      acceptanceScore: 7,
      persistenceScore: 6,
      breakoutRetentionScore: 5,
      failureRiskScore: 2,
      squeezeTightness: 8,
      candles: [{ date: '2026-08-07T00:00:00.000Z' }],
    }] as any;

    const [feature] = buildMlRankingFeatures(setups, indicators, { regime: 'BULLISH' } as any);
    expect(ML_FEATURE_SCHEMA_VERSION).toBe('apex-ranking-v1');
    expect(feature).toMatchObject({
      ticker: 'TEST',
      distanceFromEma20Pct: 2,
      distanceFromDma200Pct: 27.5,
      relativeStrength3mPct: 10,
      institutionalCandidateScore: 82,
      marketRegime: 'BULLISH',
      discoverySource: 'INSTITUTIONAL+LIQUIDITY',
    });
  });
});
