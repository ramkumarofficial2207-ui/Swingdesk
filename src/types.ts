// =====================================================
// types.ts — All strict TypeScript interfaces
// =====================================================

export interface Candle {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp?: string | number | Date;
}

export type MarketDataInterval = '1d' | '15m' | '5m';

export interface MarketDataApi {
    getLtp(ticker: string): Promise<number>;
    getHistoricalData(ticker: string, interval: MarketDataInterval, days?: number): Promise<Candle[]>;
}

export interface GttOrderRequest {
    ticker: string;
    entry: number;
    stopLoss: number;
    target: number;
    quantity: number;
}

export interface GttOrderResponse {
    orderId: string;
    status: 'accepted' | 'rejected';
    message: string;
}

export interface TradingApi extends MarketDataApi {
    placeGttOrder(order: GttOrderRequest): Promise<GttOrderResponse>;
}

export interface StockIndicators {
    ticker: string;
    discoverySources?: Array<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>;
    institutionalCandidateScore?: number;
    institutionalScore?: number;
    institutionalNetBuyCr?: number;
    institutionalDeliverySpikeRatio?: number;
    institutionalDeliveryPct?: number;
    institutionalSourceTypes?: string[];
    ltp: number;
    dma200: number;
    ema50: number;
    ema20: number;
    rsi14: number;
    adx14: number;           // ADX(14) trend strength
    ema50Slope: number;      // % change in 50EMA over 10 days (positive = rising)
    avgVolume20d: number;
    todayVolume: number;
    volumeRatio: number;     // todayVolume / avgVolume20d
    high3m: number;
    low3m: number;
    high52w: number;         // 52-week high price
    pctFrom52wHigh: number;  // % below 52W high (lower = closer to high)
    distFrom200: number;     // % above 200 DMA
    returns3m: number;       // 3-month return %
    returns1m: number;       // 1-month return %
    returns6m: number;       // 6-month return %
    returns10d: number;      // 10-day return %
    nifty3mReturn: number;
    nifty1mReturn: number;
    outperformsNifty: boolean;
    accumulationScore?: number; // Phase 4 Extension
    timeSeriesMomentumBullish: boolean;
    isLeader: boolean;
    leaderScore: number;
    isBullFlag?: boolean;
    isDeepValue?: boolean;
    isLeaderPullbackReclaim: boolean;
    isSecondEntryRetest: boolean;
    isEarningsReactionContinuation: boolean;
    isCompressionInLeaders: boolean;
    ichimokuTenkan: number;
    ichimokuKijun: number;
    ichimokuSpanA: number;
    ichimokuSpanB: number;
    ichimokuCloudTop: number;
    ichimokuCloudBottom: number;
    ichimokuBullish: boolean;
    supertrend: number;
    supertrendBullish: boolean;
    supertrendBullishDays?: number;
    acceptanceScore: number;
    absorptionScore: number;
    efficiencyRatio: number;
    efficiencyScore: number;
    persistenceScore: number;
    breakoutRetentionScore: number;
    failureRiskScore: number;
    relativeStrengthAcceleration: number;
    relativeStrengthAccelerationScore: number;
    preMoveScore: number;
    pcr?: number;
    totalOI?: number;
    oiChangePct?: number;
    derivativeStatus?: string;
    isSqueeze: boolean;
    squeezeTightness: number;
    isPocketPivot: boolean;
    candles: Candle[];
}

export type SetupType =
    | 'Pullback Continuation'
    | 'EMA50 Pullback'
    | 'EMA20 Pullback'
    | 'Leader Pullback Reclaim'
    | 'Second-Entry Retest'
    | 'Earnings Reaction Continuation'
    | 'Volatility Contraction (VCP)'
    | 'VCP Breakout 🔥'
    | 'VCP Contraction'
    | 'Compression Breakout'
    | 'Compression in Leaders'
    | 'Breakout Base'
    | 'EMA20 Bounce'
    | 'Momentum Continuation'
    | 'Acceptance Breakout'
    | 'Ichimoku Cloud Breakout'
    | 'Supertrend Continuation'
    | 'Bull Flag Breakout 🚩'
    | 'Deep Value Reversion 📉'
    | 'Squeeze Breakout'
    | 'Pre-Surge Hybrid Base 🌱';

export interface TriggerZone {
    triggerPrice: number;
    triggerVolumeRatio: number;
    authorizedAt: Date;
    expiresAt: Date;
}

export interface EarlyBuyPlan {
    eligible: boolean;
    status: 'EARLY_BUY_READY' | 'MONITOR_BASE';
    score: number;
    zoneLow: number;
    zoneHigh: number;
    stopLoss: number;
    targetPrice: number;
    plannedRiskReward: number;
    allocationPct: number;
    shadow: boolean;
    reasons: string[];
}

export interface PreSurgeV3Plan {
    version: 'PRE_SURGE_V3';
    shadow: boolean;
    eligible: boolean;
    score: number;
    status: 'V3_READY' | 'V3_REJECTED';
    base: {
        sessions: number;
        rangePct: number;
        atrContractionRatio: number;
        higherLows: boolean;
        distributionDays: number;
    };
    earlyEntry: {
        zoneLow: number;
        zoneHigh: number;
        maxEntry: number;
        structuralStop: number;
        riskPct: number;
        allocationPct: number;
        requireZoneTouch: true;
        requireFiveMinuteReclaim: true;
        requireHigherLow: true;
        requireVwap: true;
        maximumGapDownPct: number;
        maximumGapUpPct: number;
    };
    breakout: {
        pivot: number;
        maxEntry: number;
        structuralStop: number;
        minimumRvol: number;
        confirmationTimeframeMinutes: 15;
        minimumCloseLocation: number;
        requireVwap: true;
        allocationPct: number;
    };
    exits: {
        partialTarget: number;
        partialAtR: number;
        partialExitPct: number;
        finalTarget: number;
        finalAtR: number;
        moveStopToBreakeven: true;
        trailingMethod: 'EMA10_OR_SUPERTREND';
    };
    positionSizing: {
        riskBudgetPct: number;
        maximumPositionPct: number;
        suggestedPositionPct: number;
    };
    reasons: string[];
    rejectionReasons: string[];
}

export interface PreSurgeV4Plan {
    version: 'PRE_SURGE_V4';
    shadow: true;
    eligible: boolean;
    score: number;
    status: 'V4_READY' | 'V4_REJECTED';
    baselineVersion: 'PRE_SURGE_V3';
    qualification: {
        v3Score: number;
        marketRegime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
        marketBreadthPct: number;
        minimumBreadthPct: number;
        sectorOutperforming: boolean;
        sectorRs20d: number | null;
        earlyEntryEnabled: false;
    };
    breakoutArm: {
        pivot: number;
        maxPrice: number;
        structuralStop: number;
        atr14: number;
        minimumRvol: number;
        confirmationTimeframeMinutes: 15;
        minimumCloseLocation: number;
        requireStockVwap: true;
        requireMarketProxyVwap: true;
        marketProxy: 'NIFTYBEES';
    };
    retest: {
        zoneLow: number;
        zoneHigh: number;
        maxEntry: number;
        maximumSessionsAfterArm: number;
        requireFiveMinuteHold: true;
        requireHigherLow: true;
        requireStockVwap: true;
        requireMarketProxyVwap: true;
        allocationPct: 100;
        stopBufferAtr: number;
    };
    exits: {
        partialAtR: 2;
        partialExitPct: 50;
        finalAtR: 3.5;
        moveStopToBreakeven: true;
        trailingMethod: 'EMA10';
        timeStopSessions: number;
        minimumProgressR: number;
    };
    positionSizing: {
        riskBudgetPct: number;
        maximumPositionPct: number;
        suggestedPositionPct: number;
    };
    reasons: string[];
    rejectionReasons: string[];
}

export interface SectorBreadthSnapshot {
    sector: string;
    qualifiedCount: number;
    setupCount: number;
    advancingRatio: number;
    breadthScore: number;
}

export interface ScannerSetupContext {
    setupType?: string | null;
    confidenceScore?: number | null;
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT' | null;
    riskReward?: number | null;
    targetPct?: number | null;
    slPct?: number | null;
}

export interface MarketGroundingContext {
    price?: number | null;
    gapPct?: number | null;
    dayHigh?: number | null;
    dayLow?: number | null;
    volumeRatio?: number | null;
    rsi14?: number | null;
    ema20?: number | null;
    ema50?: number | null;
    dma200?: number | null;
    scannerSetup?: ScannerSetupContext | null;
    regime?: string | null;
    sectorBreadth?: SectorBreadthSnapshot | null;
    confirmationScore?: number | null;
    confirmationStatus?: 'CONFIRMED' | 'PARTIAL' | 'UNCONFIRMED' | 'UNAVAILABLE';
    confirmationNotes?: string[];
}

export interface NewsDistributionContext {
    newsTailwindScore: number;
    newsRiskFlag: boolean;
    regulatoryRiskFlag: boolean;
    signalAlignment: 'ALIGNED' | 'MIXED' | 'CONFLICT' | 'UNAVAILABLE';
    alertEligible: boolean;
    eventTypes: string[];
    latestHeadline?: string | null;
    lastUpdated?: string | null;
}

export interface ExecutionQualityContext {
    breakoutQuality?: number | null;
    pullbackQuality?: number | null;
    gapQuality?: number | null;
    effectiveRiskReward?: number | null;
    slippagePct?: number | null;
    structure5m?: number | null;
    structure15m?: number | null;
    eventDurability?: number | null;
}

export interface TradeSetup {
    ticker: string;
    sector: string;
    setupFamily?: 'BREAKOUT' | 'PULLBACK' | 'COMPRESSION' | 'REVERSAL' | 'CONTINUATION' | 'LEADER' | 'EVENT_DRIVEN' | 'PRE_SURGE';
    marketCapCr?: number;
    ltp: number;
    trendStatus: string;
    volumeSpike: string;
    entryTrigger: string;
    buyZone: number;
    target: number;
    stopLoss: number;
    target2?: number;
    atr14?: number;
    targetPct: number;
    slPct: number;
    riskReward: number;
    catalyst: string;
    confidenceScore: number;
    confidenceBreakdown?: {
        scoreTrend: number   // 0–2
        scoreVolume: number   // 0–2
        scoreRS: number   // 0–2
        scoreSetup: number   // 0–2
        scoreRR: number   // 0–2
    };
    setupType: SetupType;
    setupCategory?: 'TOMORROW' | 'SWING_2_5';
    thesisHorizonDays?: number;
    timeframe: 'Intraday' | 'Short Swing' | 'Medium Swing';
    earningsRisk: boolean;
    newsRisk: boolean;
    newsSummary: string;
    headlines?: string[];
    momentumRank: number;
    volatilityHitProb: number;
    institutionalDemand?: number; // Phase 4 Extension
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    aiLogic?: string;
    aiTargetRange?: string;
    aiStopLoss?: string;
    sparkline?: number[];
    mlWinProbability?: number;
    mlTriggerProbability?: number;
    mlConditionalWinProbability?: number;
    mlExpectedR?: number;
    mlPostTriggerWinProbability?: number;
    mlPostTriggerExpectedR?: number;
    mlPostTriggerModelName?: string;
    mlPostTriggerModelVersion?: string;
    mlPostTriggerModelStatus?: 'READY' | 'DEGRADED';
    mlAction?: string;
    mlRank?: number;
    mlRankScore?: number;
    mlModelName?: string;
    mlModelVersion?: string;
    mlModelStatus?: 'READY' | 'DEGRADED' | 'OFFLINE' | 'DISABLED' | 'INVALID_RESPONSE';
    mlShadowMode?: boolean;
    mlProductionEligible?: boolean;
    mlDisagreement?: number;
    discoverySources?: Array<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>;
    institutionalCandidateScore?: number;
    institutionalScore?: number;
    institutionalNetBuyCr?: number;
    institutionalDeliverySpikeRatio?: number;
    institutionalDeliveryPct?: number;
    institutionalSourceTypes?: string[];
    // Phase 6 Extension
    pcr?: number;
    totalOI?: number;
    oiChangePct?: number;
    derivativeStatus?: string;
    isTriggered?: boolean;
    status?: 'TRIGGERED' | 'QUALIFIED' | 'IN_PROGRESS' | 'WON' | 'LOST' | 'WATCHLIST';
    // Phase 1 Latency Fix
    authorizedZone?: TriggerZone;
    earlyBuy?: EarlyBuyPlan;
    preSurgeV3?: PreSurgeV3Plan;
    preSurgeV4?: PreSurgeV4Plan;
    marketGrounding?: MarketGroundingContext;

    newsDistribution?: NewsDistributionContext;
    executionQuality?: ExecutionQualityContext;
    calibratedEdgeScore?: number;
    confluenceScore?: number;
    positionSizePct?: number;
    riskFlags?: string[];
    rejectionReasons?: string[];
    confidenceDrivers?: string[];
    alertStage?: 'SETUP_DETECTED' | 'TRIGGER_ARMED' | 'TRADE_READY' | 'THESIS_INVALIDATED';
}

export interface MarketStatus {
    niftyChange: number;
    vixChange: number;
    niftyNext50Change?: number;
    niftyMidcapChange?: number;
    sensexChange?: number;
    goldChange?: number;
    silverChange?: number;
    safeToTrade: boolean;
    warning: string;
    // Regime fields (added in Phase 2)
    regime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    regimeLabel?: string;
    regimeDetail?: string;
    regimeColor?: string;
    positionSizeMult?: number;
    nifty50dma?: number;
    nifty200dma?: number;
    dmaCrossPct?: number;
    vixLevel?: number;
    institutionalBias?: 'RISK_ON' | 'RISK_OFF' | 'MIXED';
    institutionalScore?: number;
    institutionalNet1dCr?: number;
    institutionalNet5dCr?: number;
    breadthPct?: number;
    institutionalNet20dCr?: number;
    institutionalLastTradingDate?: string;
    institutionalDetail?: string;
}

export interface ScanDiagnostics {
    mode: 'swing' | 'intraday';
    universeCount: number;
    qualifiedCount: number;
    setupCount: number;
    rejectionCounts: Record<string, number>;
    notes?: string[];
    summary?: string;
    recommendedAction?: 'WAIT' | 'WATCHLIST' | 'TRADE_READY';
    nearMisses?: Array<{
        ticker: string;
        setupType: string;
        confidenceScore: number;
        primaryReason: string;
        movePct?: number;
        source?: 'QUALIFIED_WATCHLIST' | 'TOP_GAINER';
    }>;
    avoids?: Array<{
        ticker: string;
        setupType: string;
        confidenceScore: number;
        primaryReason: string;
        movePct?: number;
        source?: 'QUALIFIED_EXHAUSTED' | 'TOP_GAINER';
    }>;
}

export interface ScanResult {
    timestamp: string;
    marketStatus: MarketStatus;
    setups: TradeSetup[];
    sectorBreadth?: Record<string, SectorBreadthSnapshot>;
    diagnostics?: ScanDiagnostics;
}
