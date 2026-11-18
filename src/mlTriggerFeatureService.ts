import { randomUUID } from 'crypto';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { RvolObservation } from './intradayRvol';

export const ML_TRIGGER_FEATURE_SCHEMA_VERSION = 'apex-trigger-v1';

const QUALIFICATION_NUMERIC_FEATURES = [
  'confidenceScore', 'calibratedEdgeScore', 'confluenceScore', 'riskReward', 'targetPct', 'stopLossPct',
  'rsi14', 'adx14', 'volumeRatio', 'distanceFromEma20Pct', 'distanceFromEma50Pct', 'distanceFromDma200Pct',
  'return1mPct', 'return3mPct', 'relativeStrength1mPct', 'relativeStrength3mPct', 'accumulationScore',
  'preMoveScore', 'acceptanceScore', 'persistenceScore', 'breakoutRetentionScore', 'failureRiskScore',
  'squeezeTightness', 'institutionalCandidateScore', 'institutionalScore', 'institutionalNetBuyCr',
  'institutionalDeliverySpikeRatio',
] as const;

export interface TriggerSetupInput {
  id: string;
  ticker: string;
  setupType: string;
  timeframe: string | null;
  confidenceScore: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  qualifiedAt: Date;
  triggerVolumeRatio: number | null;
}

export interface TriggerMarketContext {
  prevClose?: number;
  dayHigh?: number;
  dayLow?: number;
  dayOpen?: number;
  averageTradePrice?: number;
  dayChangePct?: number;
  cumulativeVolume?: number;
}

export interface MlTriggerFeatureRow extends Record<string, unknown> {
  ticker: string;
  asOf: string;
  qualificationFeatureAvailable: number;
  triggerPrice: number;
  observedPrice: number;
  priceExtensionPct: number;
  observedRvol: number;
  requiredRvol: number;
  rvolExcess: number;
  baselineVolume: number;
  rvolSampleCount: number;
  triggerMinutesFromOpen: number;
  qualifiedAgeHours: number;
  stopDistancePct: number;
  targetDistancePct: number;
  triggerRiskReward: number;
  priceVsPrevClosePct: number;
  openGapPct: number;
  priceVsOpenPct: number;
  distanceFromAverageTradePricePct: number;
  intradayRangePct: number;
  dayRangePosition: number;
  distanceFromDayHighPct: number;
  cumulativeVolume: number;
  hasLivePacket: number;
  triggerSource: string;
  triggerBucket: string;
}

export interface PreparedTriggerSnapshot {
  id: string;
  qualificationSnapshotId: string | null;
  features: MlTriggerFeatureRow;
  data: Prisma.MlTriggerFeatureSnapshotUncheckedCreateInput;
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? ((numerator - denominator) / denominator) * 100 : 0;
}

function minutesFromMarketOpen(bucket: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(bucket);
  if (!match) return 0;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return Math.max(0, minute - (9 * 60 + 15));
}

export function buildMlTriggerFeatures(params: {
  setup: TriggerSetupInput;
  observedPrice: number;
  observation: RvolObservation;
  source: 'dhan_tick' | 'rest_fallback';
  triggeredAt: Date;
  qualificationFeatures?: Record<string, unknown> | null;
  market?: TriggerMarketContext | null;
}): MlTriggerFeatureRow {
  const { setup, observation, source, triggeredAt } = params;
  const qualification = params.qualificationFeatures ?? {};
  const market = params.market ?? {};
  const entry = finite(setup.entryPrice);
  const observedPrice = finite(params.observedPrice, entry);
  const stop = finite(setup.stopLoss);
  const target = finite(setup.targetPrice);
  const risk = entry - stop;
  const dayHigh = finite(market.dayHigh);
  const dayLow = finite(market.dayLow);
  const prevClose = finite(market.prevClose);
  const dayOpen = finite(market.dayOpen);
  const averageTradePrice = finite(market.averageTradePrice);
  const hasLivePacket = source === 'dhan_tick' && prevClose > 0 && dayHigh > 0 && dayLow > 0 ? 1 : 0;
  const range = dayHigh - dayLow;
  const requiredRvol = Math.max(1.5, finite(setup.triggerVolumeRatio, 1.5));
  const qualificationNumbers = Object.fromEntries(QUALIFICATION_NUMERIC_FEATURES.map(name => [name, finite(qualification[name])]));
  qualificationNumbers.confidenceScore = finite(qualification.confidenceScore, setup.confidenceScore);
  qualificationNumbers.riskReward = risk > 0 ? (target - entry) / risk : finite(qualification.riskReward);

  return {
    ...qualification,
    ...qualificationNumbers,
    ticker: setup.ticker.toUpperCase(),
    asOf: triggeredAt.toISOString(),
    setupType: String(qualification.setupType ?? setup.setupType ?? 'UNKNOWN'),
    setupFamily: String(qualification.setupFamily ?? 'UNKNOWN'),
    sector: String(qualification.sector ?? 'UNKNOWN'),
    marketRegime: String(qualification.marketRegime ?? 'UNKNOWN'),
    discoverySource: String(qualification.discoverySource ?? 'UNKNOWN'),
    qualificationFeatureAvailable: Object.keys(qualification).length ? 1 : 0,
    triggerPrice: round(entry),
    observedPrice: round(observedPrice),
    priceExtensionPct: round(pct(observedPrice, entry)),
    observedRvol: round(finite(observation.rvol)),
    requiredRvol: round(requiredRvol),
    rvolExcess: round(finite(observation.rvol) - requiredRvol),
    baselineVolume: round(finite(observation.baselineVolume), 2),
    rvolSampleCount: Math.max(0, Math.round(finite(observation.sampleCount))),
    triggerMinutesFromOpen: minutesFromMarketOpen(observation.bucket),
    qualifiedAgeHours: round(Math.max(0, triggeredAt.getTime() - setup.qualifiedAt.getTime()) / 3_600_000, 3),
    stopDistancePct: round(entry > 0 ? ((entry - stop) / entry) * 100 : 0),
    targetDistancePct: round(entry > 0 ? ((target - entry) / entry) * 100 : 0),
    triggerRiskReward: round(risk > 0 ? (target - entry) / risk : 0),
    priceVsPrevClosePct: round(pct(observedPrice, prevClose)),
    openGapPct: round(pct(dayOpen, prevClose)),
    priceVsOpenPct: round(pct(observedPrice, dayOpen)),
    distanceFromAverageTradePricePct: round(pct(observedPrice, averageTradePrice)),
    intradayRangePct: round(prevClose > 0 && range > 0 ? (range / prevClose) * 100 : 0),
    dayRangePosition: round(range > 0 ? Math.min(1, Math.max(0, (observedPrice - dayLow) / range)) : 0),
    distanceFromDayHighPct: round(dayHigh > 0 ? ((dayHigh - observedPrice) / dayHigh) * 100 : 0),
    dayChangePct: round(finite(market.dayChangePct)),
    cumulativeVolume: Math.max(0, Math.round(finite(market.cumulativeVolume))),
    hasLivePacket,
    triggerSource: source,
    triggerBucket: observation.bucket,
  };
}

export async function prepareMlTriggerSnapshot(params: {
  setup: TriggerSetupInput;
  observedPrice: number;
  observation: RvolObservation;
  source: 'dhan_tick' | 'rest_fallback';
  triggeredAt: Date;
  market?: TriggerMarketContext | null;
}): Promise<PreparedTriggerSnapshot> {
  const lowerBound = new Date(params.setup.qualifiedAt.getTime() - 7 * 86_400_000);
  const qualificationSnapshot = await prisma.mlFeatureSnapshot.findFirst({
    where: {
      ticker: params.setup.ticker.toUpperCase(),
      asOf: { gte: lowerBound, lte: params.triggeredAt },
    },
    orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, features: true },
  });
  const qualificationFeatures = qualificationSnapshot?.features && typeof qualificationSnapshot.features === 'object'
    ? qualificationSnapshot.features as Record<string, unknown>
    : null;
  const features = buildMlTriggerFeatures({ ...params, qualificationFeatures });
  const id = randomUUID();
  return {
    id,
    qualificationSnapshotId: qualificationSnapshot?.id ?? null,
    features,
    data: {
      id,
      historicalSetupId: params.setup.id,
      qualificationSnapshotId: qualificationSnapshot?.id ?? null,
      ticker: params.setup.ticker.toUpperCase(),
      triggeredAt: params.triggeredAt,
      featureSchemaVersion: ML_TRIGGER_FEATURE_SCHEMA_VERSION,
      source: params.source,
      triggerPrice: params.setup.entryPrice,
      observedPrice: params.observedPrice,
      observedRvol: params.observation.rvol,
      requiredRvol: Math.max(1.5, finite(params.setup.triggerVolumeRatio, 1.5)),
      baselineVolume: params.observation.baselineVolume,
      sampleCount: params.observation.sampleCount,
      triggerBucket: params.observation.bucket,
      features: features as Prisma.InputJsonValue,
    },
  };
}

interface PostTriggerResponse {
  status: 'READY' | 'DEGRADED';
  featureSchemaVersion: string;
  productionEligible: boolean;
  prediction?: {
    modelName?: string;
    modelVersion?: string;
    rankScore?: number | null;
    winProbability?: number | null;
    expectedR?: number | null;
    action?: string;
  } | null;
}

export async function scoreMlTriggerSnapshot(snapshotId: string, features: MlTriggerFeatureRow): Promise<boolean> {
  if (process.env.ML_RANKING_ENABLED !== 'true') return false;
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').replace(/\/$/, '');
  if (!serviceUrl) return false;
  const startedAt = Date.now();
  try {
    const token = process.env.ML_SERVICE_TOKEN;
    const response = await axios.post<PostTriggerResponse>(`${serviceUrl}/v1/post-trigger`, {
      featureSchemaVersion: ML_TRIGGER_FEATURE_SCHEMA_VERSION,
      candidate: features,
    }, {
      timeout: Math.min(15_000, Math.max(500, finite(process.env.ML_SERVICE_TIMEOUT_MS, 4_000))),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = response.data;
    const prediction = payload?.prediction;
    if (payload?.featureSchemaVersion !== ML_TRIGGER_FEATURE_SCHEMA_VERSION || !prediction?.modelName || !prediction.modelVersion) {
      return false;
    }
    if (prediction.winProbability != null && !Number.isFinite(Number(prediction.winProbability))) return false;
    if (prediction.expectedR != null && !Number.isFinite(Number(prediction.expectedR))) return false;
    await prisma.mlPostTriggerPrediction.create({
      data: {
        triggerSnapshotId: snapshotId,
        modelName: prediction.modelName,
        modelVersion: prediction.modelVersion,
        rankScore: prediction.rankScore == null ? null : finite(prediction.rankScore),
        winProbability: prediction.winProbability == null ? null : finite(prediction.winProbability),
        expectedR: prediction.expectedR == null ? null : finite(prediction.expectedR),
        action: prediction.action || 'SHADOW',
        shadow: payload.productionEligible !== true,
        productionEligible: payload.productionEligible === true,
        latencyMs: Date.now() - startedAt,
      },
    });
    return true;
  } catch (error: any) {
    console.warn('[ML] Post-trigger model unavailable; lifecycle remains deterministic:', error?.message || error);
    return false;
  }
}
