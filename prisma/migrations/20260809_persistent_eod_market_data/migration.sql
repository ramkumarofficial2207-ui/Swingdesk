-- Canonical finalized EOD market-data store for scanner qualification.
CREATE TABLE "MarketInstrument" (
    "symbol" TEXT NOT NULL,
    "securityId" TEXT,
    "exchangeSegment" TEXT NOT NULL DEFAULT 'NSE_EQ',
    "instrumentType" TEXT NOT NULL DEFAULT 'EQUITY',
    "series" TEXT NOT NULL DEFAULT 'EQ',
    "isin" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketInstrument_pkey" PRIMARY KEY ("symbol")
);

CREATE TABLE "DailyCandle" (
    "symbol" TEXT NOT NULL,
    "tradingDate" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "previousClose" DOUBLE PRECISION,
    "volume" BIGINT NOT NULL,
    "turnoverCr" DOUBLE PRECISION,
    "totalTrades" INTEGER,
    "deliveryQty" BIGINT,
    "deliveryPct" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCandle_pkey" PRIMARY KEY ("symbol", "tradingDate")
);

CREATE TABLE "EodIngestionRun" (
    "id" UUID NOT NULL,
    "tradingDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "source" TEXT NOT NULL DEFAULT 'NSE_UDIFF_DHAN',
    "symbolCount" INTEGER NOT NULL DEFAULT 0,
    "readySymbolCount" INTEGER NOT NULL DEFAULT 0,
    "minimumCandles" INTEGER NOT NULL DEFAULT 220,
    "message" TEXT,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "qualificationQueuedAt" TIMESTAMP(3),
    "qualificationScanId" UUID,
    "qualificationCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EodIngestionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketInstrument_securityId_idx" ON "MarketInstrument"("securityId");
CREATE INDEX "MarketInstrument_isActive_idx" ON "MarketInstrument"("isActive");
CREATE INDEX "DailyCandle_tradingDate_isFinal_idx" ON "DailyCandle"("tradingDate", "isFinal");
CREATE INDEX "DailyCandle_tradingDate_turnoverCr_idx" ON "DailyCandle"("tradingDate", "turnoverCr");
CREATE UNIQUE INDEX "EodIngestionRun_tradingDate_key" ON "EodIngestionRun"("tradingDate");
CREATE INDEX "EodIngestionRun_status_tradingDate_idx" ON "EodIngestionRun"("status", "tradingDate");

ALTER TABLE "DailyCandle"
ADD CONSTRAINT "DailyCandle_symbol_fkey"
FOREIGN KEY ("symbol") REFERENCES "MarketInstrument"("symbol")
ON DELETE CASCADE ON UPDATE CASCADE;
