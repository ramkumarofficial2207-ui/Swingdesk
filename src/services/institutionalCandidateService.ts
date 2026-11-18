import prisma from '../prismaClient';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INT = 2_147_483_647;

export type InstitutionalCandidateStatus = 'ACTIVE' | 'EXPIRED' | 'REJECTED';

export interface InstitutionalCandidateScoreInput {
  netInstitutionalCr: number;
  sourceTypes: string[];
  daysSinceAccumulation: number;
  deliverySpikeRatio: number;
  deliveryPct: number;
  turnoverCr: number;
  totalTrades: number;
}

export interface InstitutionalCandidateScore {
  institutionalScore: number;
  liquidityScore: number;
  candidateScore: number;
}

export interface ScannerInstitutionalCandidate {
  symbol: string;
  candidateScore: number;
  institutionalScore: number;
  netInstitutionalCr: number;
  deliverySpikeRatio: number;
  deliveryPct: number;
  sourceTypes: string[];
  lastAccumulationDate: Date;
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Transparent candidate score. It is deliberately deterministic: ML ranks
 * technically valid setups later and never decides which disclosures exist.
 */
export function scoreInstitutionalCandidate(input: InstitutionalCandidateScoreInput): InstitutionalCandidateScore {
  const flowMagnitude = clamp(Math.log10(1 + Math.max(0, input.netInstitutionalCr)) / Math.log10(101) * 65);
  const sourceAlignment = input.sourceTypes.length >= 2 ? 10 : input.sourceTypes.length === 1 ? 5 : 0;
  const recency = clamp(15 * (1 - Math.max(0, input.daysSinceAccumulation) / 30));
  const deliveryEvidence = input.deliverySpikeRatio >= 1.5
    ? 10
    : input.deliverySpikeRatio >= 1.2
      ? 7
      : input.deliveryPct >= 50
        ? 4
        : 0;
  const institutionalScore = clamp(flowMagnitude + sourceAlignment + recency + deliveryEvidence);

  const turnoverScore = clamp(Math.log10(1 + Math.max(0, input.turnoverCr)) / Math.log10(501) * 70);
  const tradesScore = clamp(Math.log10(1 + Math.max(0, input.totalTrades)) / Math.log10(500_001) * 30);
  const liquidityScore = clamp(turnoverScore + tradesScore);
  const candidateScore = clamp((institutionalScore * 0.75) + (liquidityScore * 0.25));

  return {
    institutionalScore: round(institutionalScore),
    liquidityScore: round(liquidityScore),
    candidateScore: round(candidateScore),
  };
}

function dateOnly(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Rebuild the durable stock-level institutional discovery pool from official
 * bulk-deal rows and the latest finalized EOD liquidity/delivery evidence.
 */
export async function refreshInstitutionalCandidatePool(at = new Date()): Promise<{
  active: number;
  rejected: number;
  expired: number;
  asOf: string | null;
}> {
  const lookbackDays = Math.round(envNumber('INSTITUTIONAL_LOOKBACK_DAYS', 30, 5, 180));
  const expiryDays = Math.round(envNumber('INSTITUTIONAL_CANDIDATE_EXPIRY_DAYS', 30, 5, 180));
  const minNetCr = envNumber('INSTITUTIONAL_MIN_NET_CR', 1, 0.1, 1_000);
  const minCandidateScore = envNumber('INSTITUTIONAL_MIN_CANDIDATE_SCORE', 45, 0, 100);
  const approvedSourceTypes = [...new Set(
    String(process.env.INSTITUTIONAL_SOURCE_TYPES || 'FII,DII')
      .split(',')
      .map(value => value.trim().toUpperCase())
      .filter(value => ['FII', 'DII', 'PROMOTER', 'HNI'].includes(value)),
  )];
  const cutoff = new Date(at.getTime() - lookbackDays * DAY_MS);

  const readyRun = await prisma.eodIngestionRun.findFirst({
    where: { status: 'READY' },
    orderBy: { tradingDate: 'desc' },
    select: { tradingDate: true },
  });
  if (!readyRun) return { active: 0, rejected: 0, expired: 0, asOf: null };

  const deals = await prisma.institutionalDeal.findMany({
    where: {
      tradeDate: { gte: cutoff },
      entityType: { in: approvedSourceTypes.length ? approvedSourceTypes : ['FII', 'DII'] },
    },
    orderBy: { tradeDate: 'asc' },
  });

  const grouped = new Map<string, {
    netQty: number;
    netCr: number;
    latestDate: Date;
    sourceNet: Map<string, number>;
  }>();
  for (const deal of deals) {
    const symbol = deal.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const direction = deal.dealType === 'BUY' ? 1 : -1;
    const aggregate = grouped.get(symbol) ?? {
      netQty: 0,
      netCr: 0,
      latestDate: deal.tradeDate,
      sourceNet: new Map<string, number>(),
    };
    aggregate.netQty += direction * deal.quantity;
    aggregate.netCr += direction * deal.totalValue;
    if (direction > 0 && deal.tradeDate > aggregate.latestDate) aggregate.latestDate = deal.tradeDate;
    aggregate.sourceNet.set(
      deal.entityType,
      (aggregate.sourceNet.get(deal.entityType) ?? 0) + direction * deal.totalValue,
    );
    grouped.set(symbol, aggregate);
  }

  const symbols = [...grouped.keys()];
  const historyStart = new Date(readyRun.tradingDate);
  historyStart.setUTCDate(historyStart.getUTCDate() - 45);
  const candleRows = symbols.length ? await prisma.dailyCandle.findMany({
    where: {
      symbol: { in: symbols },
      tradingDate: { gte: historyStart, lte: readyRun.tradingDate },
      isFinal: true,
    },
    orderBy: [{ symbol: 'asc' }, { tradingDate: 'asc' }],
    select: {
      symbol: true,
      tradingDate: true,
      close: true,
      turnoverCr: true,
      totalTrades: true,
      deliveryPct: true,
    },
  }) : [];
  const candlesBySymbol = new Map<string, typeof candleRows>();
  for (const row of candleRows) {
    const current = candlesBySymbol.get(row.symbol) ?? [];
    current.push(row);
    candlesBySymbol.set(row.symbol, current);
  }

  let active = 0;
  let rejected = 0;
  const evaluatedSymbols: string[] = [];
  for (const [symbol, aggregate] of grouped) {
    evaluatedSymbols.push(symbol);
    const rows = candlesBySymbol.get(symbol) ?? [];
    const latest = rows[rows.length - 1];
    const previousDelivery = rows
      .slice(-21, -1)
      .map(row => Number(row.deliveryPct))
      .filter(value => Number.isFinite(value) && value > 0);
    const avgDeliveryPct = previousDelivery.length
      ? previousDelivery.reduce((sum, value) => sum + value, 0) / previousDelivery.length
      : 0;
    const deliveryPct = Number(latest?.deliveryPct) || 0;
    const deliverySpikeRatio = avgDeliveryPct > 0 ? deliveryPct / avgDeliveryPct : 0;
    const turnoverCr = Number(latest?.turnoverCr) || 0;
    const totalTrades = Number(latest?.totalTrades) || 0;
    const sourceTypes = [...aggregate.sourceNet.entries()]
      .filter(([, netCr]) => netCr > 0)
      .map(([source]) => source)
      .sort();
    const daysSinceAccumulation = Math.max(0, Math.floor((dateOnly(at).getTime() - dateOnly(aggregate.latestDate).getTime()) / DAY_MS));
    const scores = scoreInstitutionalCandidate({
      netInstitutionalCr: aggregate.netCr,
      sourceTypes,
      daysSinceAccumulation,
      deliverySpikeRatio,
      deliveryPct,
      turnoverCr,
      totalTrades,
    });

    let rejectionReason: string | null = null;
    if (aggregate.netCr < minNetCr) rejectionReason = `Net classified buying below Rs ${minNetCr} Cr.`;
    else if (!latest || latest.tradingDate.getTime() !== readyRun.tradingDate.getTime()) rejectionReason = 'No candle in latest finalized EOD session.';
    else if (latest.close < 20 || turnoverCr < 2 || totalTrades < 300) rejectionReason = 'Failed scanner liquidity gate.';
    else if (scores.candidateScore < minCandidateScore) rejectionReason = `Candidate score below ${minCandidateScore}.`;

    const status: InstitutionalCandidateStatus = rejectionReason ? 'REJECTED' : 'ACTIVE';
    if (status === 'ACTIVE') active++; else rejected++;
    const expiresAt = new Date(aggregate.latestDate.getTime() + expiryDays * DAY_MS);
    await prisma.institutionalCandidatePool.upsert({
      where: { symbol },
      create: {
        symbol,
        lastAccumulationDate: aggregate.latestDate,
        netInstitutionalQty: Math.round(clamp(aggregate.netQty, -MAX_INT, MAX_INT)),
        netInstitutionalCr: round(aggregate.netCr),
        deliverySpikeRatio: round(deliverySpikeRatio),
        deliveryPct: round(deliveryPct),
        institutionalScore: scores.institutionalScore,
        liquidityScore: scores.liquidityScore,
        candidateScore: scores.candidateScore,
        sourceTypes,
        status,
        expiresAt,
        lastEvaluatedAt: at,
        rejectionReason,
      },
      update: {
        lastAccumulationDate: aggregate.latestDate,
        netInstitutionalQty: Math.round(clamp(aggregate.netQty, -MAX_INT, MAX_INT)),
        netInstitutionalCr: round(aggregate.netCr),
        deliverySpikeRatio: round(deliverySpikeRatio),
        deliveryPct: round(deliveryPct),
        institutionalScore: scores.institutionalScore,
        liquidityScore: scores.liquidityScore,
        candidateScore: scores.candidateScore,
        sourceTypes,
        status,
        expiresAt,
        lastEvaluatedAt: at,
        rejectionReason,
      },
    });
  }

  const expiredUpdate = await prisma.institutionalCandidatePool.updateMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { expiresAt: { lt: at } },
        ...(evaluatedSymbols.length ? [{ symbol: { notIn: evaluatedSymbols } }] : []),
      ],
    },
    data: {
      status: 'EXPIRED',
      lastEvaluatedAt: at,
      rejectionReason: 'Institutional accumulation window expired.',
    },
  });

  return {
    active,
    rejected,
    expired: expiredUpdate.count,
    asOf: readyRun.tradingDate.toISOString().slice(0, 10),
  };
}

export async function getActiveInstitutionalCandidates(limit = 250): Promise<ScannerInstitutionalCandidate[]> {
  const now = new Date();
  const rows = await prisma.institutionalCandidatePool.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
    orderBy: [{ candidateScore: 'desc' }, { lastAccumulationDate: 'desc' }],
    take: Math.max(1, Math.min(limit, 1_000)),
  });
  return rows.map(row => ({
    symbol: row.symbol,
    candidateScore: row.candidateScore,
    institutionalScore: row.institutionalScore,
    netInstitutionalCr: row.netInstitutionalCr,
    deliverySpikeRatio: row.deliverySpikeRatio,
    deliveryPct: row.deliveryPct,
    sourceTypes: row.sourceTypes,
    lastAccumulationDate: row.lastAccumulationDate,
  }));
}
