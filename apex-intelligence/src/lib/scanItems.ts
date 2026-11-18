import { CapCategory, ScanItem, ScanSetupStatus, SignalType } from '../types';

type RawScanSetup = Record<string, unknown>;

function numberOr(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function signalOr(value: unknown): SignalType | undefined {
  return value === 'BUY' || value === 'LIGHT BUY' || value === 'WATCH' || value === 'REJECT'
    ? value
    : undefined;
}

function mlModelStatusOr(value: unknown): ScanItem['mlModelStatus'] {
  return value === 'READY' || value === 'DEGRADED' || value === 'OFFLINE' || value === 'DISABLED' || value === 'INVALID_RESPONSE'
    ? value
    : undefined;
}

function mlPostTriggerModelStatusOr(value: unknown): ScanItem['mlPostTriggerModelStatus'] {
  return value === 'READY' || value === 'DEGRADED' ? value : undefined;
}

function statusOr(raw: RawScanSetup, aiSignal?: SignalType): ScanSetupStatus {
  if (
    raw.status === 'TRIGGERED' ||
    raw.status === 'QUALIFIED' ||
    raw.status === 'IN_PROGRESS' ||
    raw.status === 'WON' ||
    raw.status === 'LOST' ||
    raw.status === 'MISSED_GAP' ||
    raw.status === 'INVALIDATED' ||
    raw.status === 'EXPIRED' ||
    raw.status === 'WATCHLIST'
  ) {
    return raw.status;
  }
  if (raw.isTriggered === true) return 'TRIGGERED';
  return aiSignal === 'WATCH' ? 'QUALIFIED' : 'WATCHLIST';
}

function capCategory(raw: RawScanSetup): CapCategory {
  if (raw.capCategory === 'LARGE' || raw.capCategory === 'MID' || raw.capCategory === 'SMALL') {
    return raw.capCategory;
  }
  const marketCapCr = optionalNumber(raw.marketCapCr);
  if (marketCapCr === undefined) return 'UNKNOWN';
  if (marketCapCr >= 20_000) return 'LARGE';
  if (marketCapCr >= 5_000) return 'MID';
  return 'SMALL';
}

function reasons(raw: RawScanSetup): string[] {
  if (Array.isArray(raw.aiReasons)) {
    const values = raw.aiReasons.filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0);
    if (values.length) return values;
  }

  return [raw.aiLogic, raw.catalyst, raw.newsSummary]
    .filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0);
}

/**
 * Converts the backend TradeSetup contract into the stable presentation model
 * used by all dashboard cards and trade modals.
 */
export function normalizeScanItems(value: unknown): ScanItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is RawScanSetup => Boolean(entry && typeof entry === 'object'))
    .map((raw, index) => {
      const ticker = String(raw.ticker || '').trim().toUpperCase();
      const ltp = numberOr(raw.ltp);
      const grounding = raw.marketGrounding && typeof raw.marketGrounding === 'object'
        ? raw.marketGrounding as RawScanSetup
        : {};
      const buyZone = numberOr(raw.buyZone, ltp);
      const target1 = numberOr(raw.target ?? raw.target1);
      const target2 = optionalNumber(raw.target2);
      const stopLoss = numberOr(raw.stopLoss);
      const aiSignal = signalOr(raw.aiSignal);
      const authorizedZone = raw.authorizedZone && typeof raw.authorizedZone === 'object'
        ? raw.authorizedZone as RawScanSetup
        : {};
      const earlyBuy = raw.earlyBuy && typeof raw.earlyBuy === 'object'
        ? raw.earlyBuy as RawScanSetup
        : {};
      const earlyBuyStatus: ScanItem['earlyBuyStatus'] = earlyBuy.status === 'EARLY_BUY_READY' || raw.executionStatus === 'EARLY_BUY_READY'
        ? 'EARLY_BUY_READY'
        : earlyBuy.status === 'MONITOR_BASE' ? 'MONITOR_BASE' : undefined;
      const rawV3 = raw.preSurgeV3 && typeof raw.preSurgeV3 === 'object'
        ? raw.preSurgeV3 as RawScanSetup
        : {};
      const rawV3Early = rawV3.earlyEntry && typeof rawV3.earlyEntry === 'object'
        ? rawV3.earlyEntry as RawScanSetup
        : {};
      const rawV3Breakout = rawV3.breakout && typeof rawV3.breakout === 'object'
        ? rawV3.breakout as RawScanSetup
        : {};
      const preSurgeV3 = rawV3.version === 'PRE_SURGE_V3'
        ? {
            ...rawV3,
            earlyEntry: {
              ...rawV3Early,
              // Backward-compatible defaults protect the dashboard if a
              // shadow JSON plan was stored before the chase guards existed.
              maxEntry: numberOr(rawV3Early.maxEntry, numberOr(rawV3Breakout.pivot) * 0.99),
              maximumGapDownPct: numberOr(rawV3Early.maximumGapDownPct, -1.5),
              maximumGapUpPct: numberOr(rawV3Early.maximumGapUpPct, 1.5),
            },
          } as unknown as ScanItem['preSurgeV3']
        : undefined;

      return {
        id: String(raw.id || `${ticker || 'setup'}-${index}`),
        ticker,
        companyName: String(raw.companyName || ticker),
        sector: String(raw.sector || 'Diversified'),
        capCategory: capCategory(raw),
        setupType: String(raw.setupType || 'Market setup'),
        entryTrigger: typeof raw.entryTrigger === 'string' ? raw.entryTrigger : undefined,
        triggerPrice: optionalNumber(raw.triggerPrice ?? authorizedZone.triggerPrice),
        triggerVolumeRatio: optionalNumber(raw.triggerVolumeRatio ?? authorizedZone.triggerVolumeRatio),
        triggeredPrice: optionalNumber(raw.triggeredPrice),
        triggeredVolumeRatio: optionalNumber(raw.triggeredVolumeRatio),
        confidenceScore: numberOr(raw.confidenceScore),
        aiSignal,
        status: statusOr(raw, aiSignal),
        triggerConfirmed: typeof raw.triggerConfirmed === 'boolean' ? raw.triggerConfirmed : undefined,
        qualifiedAt: typeof raw.qualifiedAt === 'string' ? raw.qualifiedAt : undefined,
        triggeredAt: typeof raw.triggeredAt === 'string' ? raw.triggeredAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
        resolvedAt: typeof raw.resolvedAt === 'string' ? raw.resolvedAt : undefined,
        resultPct: optionalNumber(raw.resultPct),
        executionStatus: typeof raw.executionStatus === 'string' ? raw.executionStatus : undefined,
        openingPrice: optionalNumber(raw.openingPrice),
        openingObservedAt: typeof raw.openingObservedAt === 'string' ? raw.openingObservedAt : undefined,
        plannedBreakoutPrice: optionalNumber(raw.plannedBreakoutPrice ?? raw.triggerPrice ?? authorizedZone.triggerPrice ?? buyZone),
        maxEntryPrice: optionalNumber(raw.maxEntryPrice),
        actualFillPrice: optionalNumber(raw.actualFillPrice ?? raw.triggeredPrice),
        actualFillAt: typeof raw.actualFillAt === 'string' ? raw.actualFillAt : undefined,
        actualExitPrice: optionalNumber(raw.actualExitPrice),
        actualExitAt: typeof raw.actualExitAt === 'string' ? raw.actualExitAt : undefined,
        executionMissReason: typeof raw.executionMissReason === 'string' ? raw.executionMissReason : undefined,
        strategyVersion: typeof raw.strategyVersion === 'string' ? raw.strategyVersion : undefined,
        earlyBuyStatus,
        earlyBuyScore: optionalNumber(earlyBuy.score ?? raw.earlyBuyScore),
        earlyEntryLow: optionalNumber(earlyBuy.zoneLow ?? raw.earlyEntryLow),
        earlyEntryHigh: optionalNumber(earlyBuy.zoneHigh ?? raw.earlyEntryHigh),
        earlyBuyShadow: typeof earlyBuy.shadow === 'boolean' ? earlyBuy.shadow : undefined,
        earlyBuyReasons: Array.isArray(earlyBuy.reasons)
          ? earlyBuy.reasons.filter((reason): reason is string => typeof reason === 'string')
          : undefined,
        shadowStrategyVersion: typeof raw.shadowStrategyVersion === 'string' ? raw.shadowStrategyVersion : undefined,
        preSurgeV3,
        newsRisk: Boolean(raw.newsRisk),
        earningsRisk: Boolean(raw.earningsRisk),
        ltp,
        changePct: numberOr(raw.changePct ?? grounding.gapPct),
        buyZoneMin: buyZone,
        buyZoneMax: numberOr(raw.buyZoneMax, buyZone),
        target1,
        target1Pct: numberOr(raw.target1Pct ?? raw.targetPct),
        target2,
        target2Pct: optionalNumber(raw.target2Pct),
        stopLoss,
        stopLossPct: numberOr(raw.stopLossPct ?? raw.slPct),
        riskReward: numberOr(raw.riskReward),
        dma200: numberOr(raw.dma200 ?? grounding.dma200),
        ema50: numberOr(raw.ema50 ?? grounding.ema50),
        ema20: numberOr(raw.ema20 ?? grounding.ema20),
        rsi14: numberOr(raw.rsi14 ?? grounding.rsi14),
        adx14: numberOr(raw.adx14),
        volumeRatio: numberOr(raw.volumeRatio ?? grounding.volumeRatio),
        pctFrom52wHigh: numberOr(raw.pctFrom52wHigh),
        ichimokuBullish: Boolean(raw.ichimokuBullish),
        supertrendBullish: Boolean(raw.supertrendBullish),
        isSqueeze: Boolean(raw.isSqueeze),
        sparkline: Array.isArray(raw.sparkline)
          ? raw.sparkline.map(value => numberOr(value)).filter(value => value > 0)
          : [],
        aiReasons: reasons(raw),
        discoverySources: Array.isArray(raw.discoverySources)
          ? raw.discoverySources.filter((source): source is 'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL' => (
              source === 'LIQUIDITY' || source === 'NEWS' || source === 'INSTITUTIONAL'
            ))
          : undefined,
        institutionalCandidateScore: optionalNumber(raw.institutionalCandidateScore),
        institutionalNetBuyCr: optionalNumber(raw.institutionalNetBuyCr),
        institutionalDeliverySpikeRatio: optionalNumber(raw.institutionalDeliverySpikeRatio),
        mlRank: optionalNumber(raw.mlRank),
        mlRankScore: optionalNumber(raw.mlRankScore),
        mlWinProbability: optionalNumber(raw.mlWinProbability),
        mlTriggerProbability: optionalNumber(raw.mlTriggerProbability),
        mlConditionalWinProbability: optionalNumber(raw.mlConditionalWinProbability),
        mlExpectedR: optionalNumber(raw.mlExpectedR),
        mlPostTriggerWinProbability: optionalNumber(raw.mlPostTriggerWinProbability),
        mlPostTriggerExpectedR: optionalNumber(raw.mlPostTriggerExpectedR),
        mlPostTriggerModelName: typeof raw.mlPostTriggerModelName === 'string' ? raw.mlPostTriggerModelName : undefined,
        mlPostTriggerModelVersion: typeof raw.mlPostTriggerModelVersion === 'string' ? raw.mlPostTriggerModelVersion : undefined,
        mlPostTriggerModelStatus: mlPostTriggerModelStatusOr(raw.mlPostTriggerModelStatus),
        mlModelName: typeof raw.mlModelName === 'string' ? raw.mlModelName : undefined,
        mlModelVersion: typeof raw.mlModelVersion === 'string' ? raw.mlModelVersion : undefined,
        mlModelStatus: mlModelStatusOr(raw.mlModelStatus),
        mlShadowMode: typeof raw.mlShadowMode === 'boolean' ? raw.mlShadowMode : undefined,
        mlProductionEligible: typeof raw.mlProductionEligible === 'boolean' ? raw.mlProductionEligible : undefined,
        mlDisagreement: optionalNumber(raw.mlDisagreement),
      };
    })
    .filter(item => item.ticker.length > 0 && item.ltp > 0);
}

/**
 * Returns true only for a resolved setup or a setup whose price trigger is
 * explicitly confirmed. The fallback protects older API payloads that do not
 * yet contain triggerConfirmed.
 */
export function hasConfirmedBuyTrigger(item: Pick<ScanItem, 'status' | 'triggerConfirmed' | 'triggerPrice' | 'buyZoneMin' | 'ltp'>): boolean {
  if (item.status === 'WON' || item.status === 'LOST') return true;
  if (item.triggerConfirmed === true) return true;
  if (item.triggerConfirmed === false) return false;

  const triggerPrice = item.triggerPrice && item.triggerPrice > 0
    ? item.triggerPrice
    : item.buyZoneMin;
  return item.status === 'TRIGGERED' && triggerPrice > 0 && item.ltp >= triggerPrice;
}
