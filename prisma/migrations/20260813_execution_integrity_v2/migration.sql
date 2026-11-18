CREATE TABLE "TradePlan" (
    "id" UUID NOT NULL,
    "historicalSetupId" UUID NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategyFamily" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL DEFAULT 'PRE_SURGE_V2',
    "timeframe" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUALIFIED',
    "activeKey" TEXT,
    "earlyEntryLow" DOUBLE PRECISION,
    "earlyEntryHigh" DOUBLE PRECISION,
    "breakoutPrice" DOUBLE PRECISION NOT NULL,
    "maxBreakoutPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "plannedRiskReward" DOUBLE PRECISION NOT NULL,
    "earlyAllocationPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "breakoutAllocationPct" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openingPrice" DOUBLE PRECISION,
    "openingObservedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeAttempt" (
    "id" UUID NOT NULL,
    "tradePlanId" UUID NOT NULL,
    "leg" TEXT NOT NULL DEFAULT 'BREAKOUT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "plannedEntryLow" DOUBLE PRECISION NOT NULL,
    "plannedEntryHigh" DOUBLE PRECISION NOT NULL,
    "maxEntryPrice" DOUBLE PRECISION NOT NULL,
    "openingPrice" DOUBLE PRECISION,
    "actualFillPrice" DOUBLE PRECISION,
    "actualFillAt" TIMESTAMP(3),
    "triggerRvol" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "exitAt" TIMESTAMP(3),
    "resultPct" DOUBLE PRECISION,
    "missReason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SetupLifecycleEvent" (
    "id" UUID NOT NULL,
    "tradePlanId" UUID NOT NULL,
    "tradeAttemptId" UUID,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "observedPrice" DOUBLE PRECISION,
    "observedRvol" DOUBLE PRECISION,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SetupLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TradePlan_historicalSetupId_key" ON "TradePlan"("historicalSetupId");
CREATE UNIQUE INDEX "TradePlan_activeKey_key" ON "TradePlan"("activeKey");
CREATE INDEX "TradePlan_ticker_strategyFamily_timeframe_idx" ON "TradePlan"("ticker", "strategyFamily", "timeframe");
CREATE INDEX "TradePlan_status_expiresAt_idx" ON "TradePlan"("status", "expiresAt");
CREATE UNIQUE INDEX "TradeAttempt_tradePlanId_leg_key" ON "TradeAttempt"("tradePlanId", "leg");
CREATE INDEX "TradeAttempt_status_actualFillAt_idx" ON "TradeAttempt"("status", "actualFillAt");
CREATE INDEX "SetupLifecycleEvent_tradePlanId_observedAt_idx" ON "SetupLifecycleEvent"("tradePlanId", "observedAt");
CREATE INDEX "SetupLifecycleEvent_eventType_observedAt_idx" ON "SetupLifecycleEvent"("eventType", "observedAt");

ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_historicalSetupId_fkey"
FOREIGN KEY ("historicalSetupId") REFERENCES "HistoricalSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeAttempt" ADD CONSTRAINT "TradeAttempt_tradePlanId_fkey"
FOREIGN KEY ("tradePlanId") REFERENCES "TradePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SetupLifecycleEvent" ADD CONSTRAINT "SetupLifecycleEvent_tradePlanId_fkey"
FOREIGN KEY ("tradePlanId") REFERENCES "TradePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SetupLifecycleEvent" ADD CONSTRAINT "SetupLifecycleEvent_tradeAttemptId_fkey"
FOREIGN KEY ("tradeAttemptId") REFERENCES "TradeAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
