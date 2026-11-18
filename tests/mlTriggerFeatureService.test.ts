import { describe, expect, it } from 'vitest';
import { buildMlTriggerFeatures } from '../src/mlTriggerFeatureService';

describe('ML trigger-time feature capture', () => {
  it('captures only information available at the confirmed trigger timestamp', () => {
    const features = buildMlTriggerFeatures({
      setup: {
        id: 'setup-id',
        ticker: 'TEST',
        setupType: 'Pre-Surge Hybrid Base',
        timeframe: '1D',
        confidenceScore: 8,
        entryPrice: 100,
        targetPrice: 112,
        stopLoss: 94,
        qualifiedAt: new Date('2026-08-09T10:30:00.000Z'),
        triggerVolumeRatio: 1.5,
      },
      observedPrice: 101,
      observation: { rvol: 1.8, baselineVolume: 100_000, sampleCount: 5, bucket: '10:00' },
      source: 'dhan_tick',
      triggeredAt: new Date('2026-08-10T04:30:00.000Z'),
      qualificationFeatures: { marketRegime: 'BULLISH', sector: 'Capital Goods', rsi14: 58 },
      market: {
        prevClose: 98,
        dayHigh: 102,
        dayLow: 97,
        dayOpen: 99,
        averageTradePrice: 100.5,
        dayChangePct: 3.06,
        cumulativeVolume: 180_000,
      },
    });

    expect(features).toMatchObject({
      qualificationFeatureAvailable: 1,
      observedRvol: 1.8,
      rvolExcess: 0.3,
      triggerMinutesFromOpen: 45,
      priceExtensionPct: 1,
      stopDistancePct: 6,
      targetDistancePct: 12,
      triggerRiskReward: 2,
      dayRangePosition: 0.8,
      openGapPct: 1.020408,
      priceVsOpenPct: 2.020202,
      distanceFromAverageTradePricePct: 0.497512,
      hasLivePacket: 1,
      triggerSource: 'dhan_tick',
      marketRegime: 'BULLISH',
    });
    expect(features).not.toHaveProperty('outcome');
    expect(features).not.toHaveProperty('resolvedAt');
  });

  it('marks delayed REST snapshots without inventing unavailable day-range fields', () => {
    const features = buildMlTriggerFeatures({
      setup: {
        id: 'setup-id', ticker: 'TEST', setupType: 'Base', timeframe: '1D', confidenceScore: 7,
        entryPrice: 100, targetPrice: 110, stopLoss: 95,
        qualifiedAt: new Date('2026-08-09T10:30:00.000Z'), triggerVolumeRatio: 1.5,
      },
      observedPrice: 100,
      observation: { rvol: 1.6, baselineVolume: 100_000, sampleCount: 3, bucket: '09:45' },
      source: 'rest_fallback',
      triggeredAt: new Date('2026-08-10T04:15:00.000Z'),
    });
    expect(features).toMatchObject({
      qualificationFeatureAvailable: 0,
      hasLivePacket: 0,
      dayRangePosition: 0,
      triggerSource: 'rest_fallback',
    });
  });
});
