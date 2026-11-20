CREATE TABLE IF NOT EXISTS "AutoPaperTrade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "strategy" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "signalDate" DATE NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "signalClose" DOUBLE PRECISION NOT NULL,
    "state" TEXT NOT NULL,
    "entryDate" DATE,
    "entryPrice" DOUBLE PRECISION,
    "exitDate" DATE,
    "exitPrice" DOUBLE PRECISION,
    "netPct" DOUBLE PRECISION,
    "sessionsHeld" INTEGER,
    "lastCheckedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoPaperTrade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutoPaperTrade_strategy_symbol_signalDate_key" ON "AutoPaperTrade"("strategy", "symbol", "signalDate");
CREATE INDEX IF NOT EXISTS "AutoPaperTrade_state_idx" ON "AutoPaperTrade"("state");
