CREATE TABLE IF NOT EXISTS "IntradayCandle" (
    "symbol" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "tradingDate" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DHAN_5M',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntradayCandle_pkey" PRIMARY KEY ("symbol", "startTime")
);
CREATE INDEX IF NOT EXISTS "IntradayCandle_tradingDate_symbol_idx" ON "IntradayCandle"("tradingDate", "symbol");
