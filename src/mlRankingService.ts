import { randomUUID } from 'crypto';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { MarketStatus, StockIndicators, TradeSetup } from './types';

export const ML_FEATURE_SCHEMA_VERSION = 'apex-ranking-v1';

export interface MlRankingFeatureRow {
  ticker: string;
  asOf: string;
  technicalScore: number;
  confidenceScore: number;
  calibratedEdgeScore: number;
  confluenceScore: number;
  riskReward: number;
  targetPct: number;
  stopLossPct: number;
  rsi14: number;
  adx14: number;
  volumeRatio: number;
  distanceFromEma20Pct: number;
  distanceFromEma50Pct: number;
  distanceFromDma200Pct: number;
  return1mPct: number;
  return3mPct: number;
  relativeStrength1mPct: number;
  relativeStrength3mPct: number;
  accumulationScore: number;
  preMoveScore: number;
  acceptanceScore: number;
  persistenceScore: number;
  breakoutRetentionScore: number;
  failureRiskScore: number;
  squeezeTightness: number;
  institutionalCandidateScore: number;
  institutionalScore: number;
  institutionalNetBuyCr: number;
  institutionalDeliverySpikeRatio: number;
  sector: string;
  setupType: string;
  setupFamily: string;
  marketRegime: string;
  discoverySource: string;
}

interface RankModelPrediction {
  modelName: string;
  modelVersion: string;
  modelRole: 'TRIGGER' | 'CHAMPION' | 'CHALLENGER' | 'BASELINE';
  rankScore?: number | null;
  winProbability?: number | null;
  triggerProbability?: number | null;
  conditionalWinProbability?: number | null;
  expectedR?: number | null;
  rank?: number | null;
  action?: string;
  productionEligible?: boolean;
}

interface RankPrediction {
  ticker: string;
  rank?: number | null;
  rankScore?: number | null;
  winProbability?: number | null;
  triggerProbability?: number | null;
  conditionalWinProbability?: number | null;
  expectedR?: number | null;
  action?: string;
  disagreement?: number | null;
  primaryModel?: string;
  primaryVersion?: string;
  models?: RankModelPrediction[];
}

interface RankResponse {
  status: 'READY' | 'DEGRADED';
  featureSchemaVersion: string;
  productionEligible: boolean;
  predictions: RankPrediction[];
  models?: Array<{
    name: string;
    version: string;
    role: 'TRIGGER' | 'CHAMPION' | 'CHALLENGER' | 'BASELINE';
    status: string;
    productionEligible: boolean;
    metrics?: Record<string, unknown>;
  }>;
}

interface RankContext {
  scanId?: string;
  mode?: 'swing' | 'intraday';
}

export interface MlRankingHealth {
  enabled: boolean;
  reachable: boolean;
  shadowMode: boolean;
  liveRerankRequested: boolean;
  serviceUrlConfigured: boolean;
  featureSchemaVersion: string;
  serviceStatus: string;
  models: unknown[];
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export async function getMlRankingHealth(): Promise<MlRankingHealth> {
  const enabled = process.env.ML_RANKING_ENABLED === 'true';
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').replace(/\/$/, '');
  const base: MlRankingHealth = {
    enabled,
    reachable: false,
    shadowMode: process.env.ML_SHADOW_MODE !== 'false',
    liveRerankRequested: process.env.ML_ALLOW_LIVE_RERANK === 'true',
    serviceUrlConfigured: Boolean(serviceUrl),
    featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
    serviceStatus: enabled ? 'OFFLINE' : 'DISABLED',
    models: [],
  };
  if (!enabled || !serviceUrl) return base;
  try {
    const token = process.env.ML_SERVICE_TOKEN;
    const response = await axios.get(`${serviceUrl}/health`, {
      timeout: Math.min(5_000, Math.max(500, finite(process.env.ML_SERVICE_TIMEOUT_MS, 4_000))),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return {
      ...base,
      reachable: true,
      serviceStatus: String(response.data?.status || 'READY'),
      models: Array.isArray(response.data?.models) ? response.data.models : [],
    };
  } catch {
    return base;
  }
}

function latestDate(indicator: StockIndicators | undefined): string {
  const raw = indicator?.candles[indicator.candles.length - 1]?.date;
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function buildMlRankingFeatures(
  setups: TradeSetup[],
  indicators: StockIndicators[],
  marketStatus?: MarketStatus | null,
): MlRankingFeatureRow[] {
  const indicatorByTicker = new Map(indicators.map(indicator => [indicator.ticker.toUpperCase(), indicator]));
  return setups.map(setup => {
    const indicator = indicatorByTicker.get(setup.ticker.toUpperCase());
    const ema20 = finite(indicator?.ema20);
    const ema50 = finite(indicator?.ema50);
    const dma200 = finite(indicator?.dma200);
    const ltp = finite(indicator?.ltp, setup.ltp);
    const sources = setup.discoverySources ?? indicator?.discoverySources ?? ['LIQUIDITY'];
    return {
      ticker: setup.ticker.toUpperCase(),
      asOf: latestDate(indicator),
      technicalScore: round(finite(setup.calibratedEdgeScore, setup.confidenceScore)),
      confidenceScore: round(finite(setup.confidenceScore)),
      calibratedEdgeScore: round(finite(setup.calibratedEdgeScore, setup.confidenceScore)),
      confluenceScore: round(finite(setup.confluenceScore, setup.confidenceScore)),
      riskReward: round(finite(setup.riskReward)),
      targetPct: round(finite(setup.targetPct)),
      stopLossPct: round(finite(setup.slPct)),
      rsi14: round(finite(indicator?.rsi14)),
      adx14: round(finite(indicator?.adx14)),
      volumeRatio: round(finite(indicator?.volumeRatio)),
      distanceFromEma20Pct: round(ema20 > 0 ? ((ltp - ema20) / ema20) * 100 : 0),
      distanceFromEma50Pct: round(ema50 > 0 ? ((ltp - ema50) / ema50) * 100 : 0),
      distanceFromDma200Pct: round(dma200 > 0 ? ((ltp - dma200) / dma200) * 100 : 0),
      return1mPct: round(finite(indicator?.returns1m)),
      return3mPct: round(finite(indicator?.returns3m)),
      relativeStrength1mPct: round(finite(indicator?.returns1m) - finite(indicator?.nifty1mReturn)),
      relativeStrength3mPct: round(finite(indicator?.returns3m) - finite(indicator?.nifty3mReturn)),
      accumulationScore: round(finite(indicator?.accumulationScore)),
      preMoveScore: round(finite(indicator?.preMoveScore)),
      acceptanceScore: round(finite(indicator?.acceptanceScore)),
      persistenceScore: round(finite(indicator?.persistenceScore)),
      breakoutRetentionScore: round(finite(indicator?.breakoutRetentionScore)),
      failureRiskScore: round(finite(indicator?.failureRiskScore)),
      squeezeTightness: round(finite(indicator?.squeezeTightness)),
      institutionalCandidateScore: round(finite(setup.institutionalCandidateScore, indicator?.institutionalCandidateScore)),
      institutionalScore: round(finite(setup.institutionalScore, indicator?.institutionalScore)),
      institutionalNetBuyCr: round(finite(setup.institutionalNetBuyCr, indicator?.institutionalNetBuyCr)),
      institutionalDeliverySpikeRatio: round(finite(setup.institutionalDeliverySpikeRatio, indicator?.institutionalDeliverySpikeRatio)),
      sector: setup.sector || 'UNKNOWN',
      setupType: String(setup.setupType || 'UNKNOWN'),
      setupFamily: String(setup.setupFamily || 'UNKNOWN'),
      marketRegime: marketStatus?.regime || 'NEUTRAL',
      discoverySource: [...sources].sort().join('+'),
    };
  });
}

function isValidRankResponse(value: unknown, tickers: Set<string>): value is RankResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<RankResponse>;
  if (response.status !== 'READY' && response.status !== 'DEGRADED') return false;
  if (response.featureSchemaVersion !== ML_FEATURE_SCHEMA_VERSION) return false;
  if (!Array.isArray(response.predictions)) return false;
  const predictionsValid = response.predictions.every(prediction => (
    prediction &&
    typeof prediction.ticker === 'string' &&
    tickers.has(prediction.ticker.toUpperCase()) &&
    (prediction.rankScore == null || Number.isFinite(Number(prediction.rankScore))) &&
    (prediction.winProbability == null || Number.isFinite(Number(prediction.winProbability))) &&
    (prediction.triggerProbability == null || Number.isFinite(Number(prediction.triggerProbability))) &&
    (prediction.conditionalWinProbability == null || Number.isFinite(Number(prediction.conditionalWinProbability))) &&
    (prediction.expectedR == null || Number.isFinite(Number(prediction.expectedR)))
  ));
  if (!predictionsValid) return false;
  if (response.productionEligible === true) {
    return response.predictions.every(prediction => (
      prediction.primaryModel &&
      prediction.primaryModel !== 'deterministic_technical' &&
      Number.isFinite(Number(prediction.rankScore)) &&
      Number.isFinite(Number(prediction.triggerProbability)) &&
      Number.isFinite(Number(prediction.conditionalWinProbability)) &&
      Number.isFinite(Number(prediction.expectedR))
    ));
  }
  return true;
}

async function persistFeatureSnapshots(
  batchId: string,
  features: MlRankingFeatureRow[],
  scanId?: string,
): Promise<Map<string, string>> {
  const ids = new Map(features.map(row => [row.ticker, randomUUID()]));
  if (process.env.ML_FEATURE_LOGGING_ENABLED === 'false') return ids;
  try {
    await prisma.mlFeatureSnapshot.createMany({
      data: features.map(row => ({
        id: ids.get(row.ticker)!,
        batchId,
        scanJobId: scanId,
        ticker: row.ticker,
        asOf: new Date(row.asOf),
        featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
        deterministicScore: row.technicalScore,
        features: row as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  } catch (error: any) {
    console.warn('[ML] Feature snapshot persistence unavailable:', error?.message || error);
  }
  return ids;
}

async function persistRankResponse(
  response: RankResponse,
  snapshotIds: Map<string, string>,
  latencyMs: number,
  shadow: boolean,
): Promise<void> {
  try {
    if (response.models?.length) {
      await Promise.all(response.models.map(model => prisma.mlModelVersion.upsert({
        where: { modelName_version: { modelName: model.name, version: model.version } },
        create: {
          modelName: model.name,
          version: model.version,
          role: model.role,
          status: model.status,
          featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
          metrics: (model.metrics ?? {}) as Prisma.InputJsonValue,
          productionEligible: model.productionEligible,
        },
        update: {
          role: model.role,
          status: model.status,
          metrics: (model.metrics ?? {}) as Prisma.InputJsonValue,
          productionEligible: model.productionEligible,
        },
      })));
    }
    const rows = response.predictions.flatMap(prediction => {
      const featureSnapshotId = snapshotIds.get(prediction.ticker.toUpperCase());
      if (!featureSnapshotId) return [];
      return (prediction.models ?? []).map(model => ({
        featureSnapshotId,
        modelName: model.modelName,
        modelVersion: model.modelVersion,
        modelRole: model.modelRole,
        rankScore: model.rankScore == null ? null : finite(model.rankScore),
        winProbability: model.winProbability == null ? null : finite(model.winProbability),
        triggerProbability: model.triggerProbability == null ? null : finite(model.triggerProbability),
        conditionalWinProbability: model.conditionalWinProbability == null ? null : finite(model.conditionalWinProbability),
        expectedR: model.expectedR == null ? null : finite(model.expectedR),
        rank: model.rank == null ? null : Math.round(finite(model.rank)),
        action: model.action || 'SHADOW',
        shadow,
        productionEligible: model.productionEligible === true,
        latencyMs,
      }));
    });
    if (rows.length) await prisma.mlPrediction.createMany({ data: rows, skipDuplicates: true });
  } catch (error: any) {
    console.warn('[ML] Prediction audit persistence unavailable:', error?.message || error);
  }
}

/**
 * Batch-rank technically valid setups. Shadow mode is the default and leaves
 * deterministic ordering untouched. A model can influence ordering only when
 * the service says it is production eligible and both live gates are enabled.
 */
export async function rankTradeSetupsWithMl(
  setups: TradeSetup[],
  indicators: StockIndicators[],
  marketStatus?: MarketStatus | null,
  context: RankContext = {},
): Promise<TradeSetup[]> {
  if (!setups.length) return setups;
  const features = buildMlRankingFeatures(setups, indicators, marketStatus);
  const batchId = randomUUID();
  const snapshotIds = await persistFeatureSnapshots(batchId, features, context.scanId);
  const shadowMode = process.env.ML_SHADOW_MODE !== 'false';
  const enabled = process.env.ML_RANKING_ENABLED === 'true';
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').replace(/\/$/, '');

  for (const setup of setups) {
    setup.mlShadowMode = true;
    setup.mlModelStatus = enabled && serviceUrl ? 'OFFLINE' : 'DISABLED';
  }
  if (!enabled || !serviceUrl) return setups;

  const startedAt = Date.now();
  try {
    const token = process.env.ML_SERVICE_TOKEN;
    const timeoutMs = Math.min(15_000, Math.max(500, finite(process.env.ML_SERVICE_TIMEOUT_MS, 4_000)));
    const result = await axios.post(`${serviceUrl}/v1/rank`, {
      batchId,
      asOf: features[0]?.asOf ?? new Date().toISOString(),
      featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
      mode: context.mode ?? 'swing',
      candidates: features,
    }, {
      timeout: timeoutMs,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const tickerSet = new Set(setups.map(setup => setup.ticker.toUpperCase()));
    if (!isValidRankResponse(result.data, tickerSet)) {
      for (const setup of setups) setup.mlModelStatus = 'INVALID_RESPONSE';
      return setups;
    }

    const response = result.data;
    const latencyMs = Date.now() - startedAt;
    const responseByTicker = new Map(response.predictions.map(prediction => [prediction.ticker.toUpperCase(), prediction]));
    const liveInfluenceAllowed = !shadowMode &&
      process.env.ML_ALLOW_LIVE_RERANK === 'true' &&
      response.status === 'READY' &&
      response.productionEligible === true;

    for (const setup of setups) {
      const prediction = responseByTicker.get(setup.ticker.toUpperCase());
      setup.mlModelStatus = response.status;
      setup.mlShadowMode = !liveInfluenceAllowed;
      setup.mlProductionEligible = response.productionEligible === true;
      if (!prediction) continue;
      const hasTrainedPrimaryRanker = prediction.primaryModel && prediction.primaryModel !== 'deterministic_technical';
      setup.mlRank = !hasTrainedPrimaryRanker || prediction.rank == null ? undefined : Math.round(finite(prediction.rank));
      setup.mlRankScore = !hasTrainedPrimaryRanker || prediction.rankScore == null ? undefined : round(finite(prediction.rankScore));
      setup.mlWinProbability = prediction.winProbability == null
        ? undefined
        : round(clamp(finite(prediction.winProbability), 0, 100), 2);
      setup.mlTriggerProbability = prediction.triggerProbability == null
        ? undefined
        : round(clamp(finite(prediction.triggerProbability), 0, 100), 2);
      setup.mlConditionalWinProbability = prediction.conditionalWinProbability == null
        ? undefined
        : round(clamp(finite(prediction.conditionalWinProbability), 0, 100), 2);
      setup.mlExpectedR = prediction.expectedR == null ? undefined : round(finite(prediction.expectedR), 4);
      setup.mlAction = prediction.action || 'SHADOW';
      setup.mlDisagreement = prediction.disagreement == null ? undefined : round(finite(prediction.disagreement));
      setup.mlModelName = hasTrainedPrimaryRanker ? prediction.primaryModel : undefined;
      setup.mlModelVersion = hasTrainedPrimaryRanker ? prediction.primaryVersion : undefined;
    }
    await persistRankResponse(response, snapshotIds, latencyMs, !liveInfluenceAllowed);

    if (liveInfluenceAllowed) {
      setups.sort((a, b) => (
        finite(b.mlRankScore) - finite(a.mlRankScore) ||
        b.confidenceScore - a.confidenceScore
      ));
    }
    return setups;
  } catch (error: any) {
    console.warn('[ML] Batch ranker unavailable; deterministic ranking retained:', error?.message || error);
    for (const setup of setups) {
      setup.mlModelStatus = 'OFFLINE';
      setup.mlShadowMode = true;
    }
    return setups;
  }
}
