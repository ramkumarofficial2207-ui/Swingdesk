export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'FREE' | 'EXPIRED';
export type CapCategory = 'LARGE' | 'MID' | 'SMALL' | 'UNKNOWN';
export type TradeStatus = 'OPEN' | 'CLOSED';
export type ExitReason = 'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL';
export type SignalType = 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type MarketRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'RISK_OFF';
export type SetupStatus = 'QUALIFIED' | 'IN_PROGRESS' | 'WON' | 'LOST' | 'MISSED_GAP' | 'INVALIDATED' | 'EXPIRED';
export type ScanSetupStatus = 'QUALIFIED' | 'TRIGGERED' | 'IN_PROGRESS' | 'WON' | 'LOST' | 'WATCHLIST' | 'MISSED_GAP' | 'INVALIDATED' | 'EXPIRED';
export type SetupType = 'Breakout' | 'Pullback' | 'Squeeze';
export type ZoneStatus = 'IN_ZONE' | 'WAIT' | 'EXTENDED' | 'STOPPED';

export interface User {
  id: string;
  email: string;
  mobileNumber?: string;
  name?: string;
  subscriptionStatus: SubscriptionStatus;
  isAdmin?: boolean;
  subscriptionExpiry?: string;
  telegramChatId?: string;
  notifyBuySignals: boolean;
  notifyEmail: boolean;
  tradingCapital: number;
  maxRiskPct: number;
  maxPositions: number;
  maxSectorConc: number;
  brokerConfig?: BrokerConfig;
}

export interface BrokerConfig {
  isConnectedDhan: boolean;
  isConnectedZerodha: boolean;
}

export interface Trade {
  id: string;
  userId: string;
  ticker: string;
  companyName?: string;
  sector?: string;
  capCategory: CapCategory;
  setupType: string;
  regimeAtEntry?: MarketRegime;
  confidenceScore?: number;
  status: TradeStatus;
  entryDate: string;
  exitDate?: string;
  entryPrice: number;
  quantity: number;
  stopLossInit: number;
  stopLossTrail?: number;
  target1: number;
  target2?: number;
  exitPrice?: number;
  exitReason?: ExitReason;
  currentPrice?: number;
  pnlRs?: number;
  pnlPct?: number;
  rMultiple?: number;
  initialRiskRs?: number;
  capitalDeployed?: number;
  daysHeld?: number;
  notes?: string;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  ticker: string;
  companyName?: string;
  sector?: string;
  signal?: SignalType;
  ltp?: number;
  target?: number;
  stopLoss?: number;
  targetPct?: number;
  slPct?: number;
  riskReward?: number;
  confidenceScore?: number;
  setupType?: string;
  buyZone?: number;
  snapshot?: Record<string, unknown> | null;
  addedAt: string;
}

export interface InstitutionalFlowSnapshot {
  id: string;
  tradingDate: string;
  fiiBuy: number;
  fiiSell: number;
  fiiNet: number;
  diiBuy: number;
  diiSell: number;
  diiNet: number;
  totalNet: number;
  marketBias: MarketBias;
  source: string;
}

export interface HistoricalSetup {
  id: string;
  ticker: string;
  setupType: string;
  timeframe?: string;
  aiSignal: SignalType;
  confidenceScore: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  aiLogic?: string;
  status: SetupStatus;
  triggerConfirmed: boolean;
  resultPct?: number;
  executionStatus?: string;
  openingPrice?: number;
  openingObservedAt?: string;
  plannedBreakoutPrice?: number;
  maxEntryPrice?: number;
  actualFillPrice?: number;
  actualFillAt?: string;
  actualExitPrice?: number;
  actualExitAt?: string;
  executionMissReason?: string;
  strategyVersion?: string;
  earlyBuyStatus?: 'EARLY_BUY_READY' | 'MONITOR_BASE';
  earlyBuyScore?: number;
  earlyEntryLow?: number;
  earlyEntryHigh?: number;
  earlyBuyShadow?: boolean;
  earlyBuyReasons?: string[];
  shadowStrategyVersion?: string;
  preSurgeV3?: PreSurgeV3View;
  qualifiedAt: string;
  triggeredAt?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
}

export interface PreSurgeV3View {
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
    maximumGapDownPct: number;
    maximumGapUpPct: number;
  };
  breakout: {
    pivot: number;
    maxEntry: number;
    minimumRvol: number;
    confirmationTimeframeMinutes: number;
    minimumCloseLocation: number;
    allocationPct: number;
  };
  exits: {
    partialTarget: number;
    partialAtR: number;
    partialExitPct: number;
    finalTarget: number;
    finalAtR: number;
    moveStopToBreakeven: boolean;
    trailingMethod: string;
  };
  positionSizing: {
    riskBudgetPct: number;
    maximumPositionPct: number;
    suggestedPositionPct: number;
  };
  reasons: string[];
  rejectionReasons: string[];
}

export interface ScanItem {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  capCategory: CapCategory;
  setupType: string;
  entryTrigger?: string;
  triggerPrice?: number;
  triggerVolumeRatio?: number;
  triggeredPrice?: number;
  triggeredVolumeRatio?: number;
  confidenceScore: number;
  aiSignal?: SignalType;
  status?: ScanSetupStatus;
  triggerConfirmed?: boolean;
  qualifiedAt?: string;
  triggeredAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
  resultPct?: number;
  executionStatus?: string;
  openingPrice?: number;
  openingObservedAt?: string;
  plannedBreakoutPrice?: number;
  maxEntryPrice?: number;
  actualFillPrice?: number;
  actualFillAt?: string;
  actualExitPrice?: number;
  actualExitAt?: string;
  executionMissReason?: string;
  strategyVersion?: string;
  earlyBuyStatus?: 'EARLY_BUY_READY' | 'MONITOR_BASE';
  earlyBuyScore?: number;
  earlyEntryLow?: number;
  earlyEntryHigh?: number;
  earlyBuyShadow?: boolean;
  earlyBuyReasons?: string[];
  shadowStrategyVersion?: string;
  preSurgeV3?: PreSurgeV3View;
  newsRisk?: boolean;
  earningsRisk?: boolean;
  ltp: number;
  changePct: number;
  buyZoneMin: number;
  buyZoneMax: number;
  target1: number;
  target1Pct: number;
  target2?: number;
  target2Pct?: number;
  stopLoss: number;
  stopLossPct: number;
  riskReward: number;
  dma200: number;
  ema50: number;
  ema20: number;
  rsi14: number;
  adx14: number;
  volumeRatio: number;
  pctFrom52wHigh: number;
  ichimokuBullish: boolean;
  supertrendBullish: boolean;
  isSqueeze: boolean;
  sparkline: number[];
  aiReasons: string[];
  discoverySources?: Array<'LIQUIDITY' | 'NEWS' | 'INSTITUTIONAL'>;
  institutionalCandidateScore?: number;
  institutionalNetBuyCr?: number;
  institutionalDeliverySpikeRatio?: number;
  mlRank?: number;
  mlRankScore?: number;
  mlWinProbability?: number;
  mlTriggerProbability?: number;
  mlConditionalWinProbability?: number;
  mlExpectedR?: number;
  mlPostTriggerWinProbability?: number;
  mlPostTriggerExpectedR?: number;
  mlPostTriggerModelName?: string;
  mlPostTriggerModelVersion?: string;
  mlPostTriggerModelStatus?: 'READY' | 'DEGRADED';
  mlModelName?: string;
  mlModelVersion?: string;
  mlModelStatus?: 'READY' | 'DEGRADED' | 'OFFLINE' | 'DISABLED' | 'INVALID_RESPONSE';
  mlShadowMode?: boolean;
  mlProductionEligible?: boolean;
  mlDisagreement?: number;
}

export interface LiveIndex {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
}

export interface MarketStatus {
  isOpen: boolean;
  session: 'PRE_MARKET' | 'REGULAR' | 'POST_MARKET' | 'CLOSED';
  lastUpdated: string;
  label?: string;
  nextEvent?: string;
}

export interface ScanDiagnostics {
  mode: 'swing' | 'intraday';
  universeCount: number;
  qualifiedCount: number;
  setupCount: number;
  rejectionCounts: Record<string, number>;
  summary?: string;
  recommendedAction?: 'WAIT' | 'WATCHLIST' | 'TRADE_READY';
  notes?: string[];
  nearMisses?: Array<{ ticker: string; setupType: string; confidenceScore: number; primaryReason: string }>;
  avoids?: Array<{ ticker: string; setupType: string; confidenceScore: number; primaryReason: string }>;
}

// Legacy dashboard components consume this normalized presentation model.
export interface Setup {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  confidence: number;
  type: SetupType;
  buyZone: string;
  target1: number;
  target2: number;
  stopLoss: number;
  rr: string;
  sparkline: number[];
  reasons: string[];
  bullCase: string;
  bearCase: string;
  mlWinProbability?: number | string;
  mlTriggerProbability?: number | string;
  mlConditionalWinProbability?: number | string;
  mlExpectedR?: number | string;
  mlAction?: string;
}

export interface IndexData {
  name: string;
  val: string;
  chg: string;
  up: boolean;
}

export interface Holding {
  ticker: string;
  qty: number;
  cost: number;
  ltp: number;
  pnl: number;
  pct: number;
}

export interface FlowEntry {
  day: string;
  fii: number;
  dii: number;
}

export interface BreadthMetric {
  label: string;
  val: string;
  status: string;
  color: string;
}

export interface RiskPlan {
  qty: number;
  cost: number;
  maxLoss: number;
  profitT1: number;
  profitT2: number;
}
