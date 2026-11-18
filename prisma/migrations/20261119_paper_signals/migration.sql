-- Live paper tracking of On-trial / Trusted setups. No orders are placed.
CREATE TABLE "PaperSignal" (
    "id" UUID NOT NULL,
    "ticker" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "signalDate" DATE NOT NULL,
    "scanId" TEXT,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "atr14" DOUBLE PRECISION NOT NULL,
    "triggerMode" TEXT NOT NULL,
    "statusAtSignal" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "fillDate" DATE,
    "fillPrice" DOUBLE PRECISION,
    "exitDate" DATE,
    "exitPrice" DOUBLE PRECISION,
    "netR" DOUBLE PRECISION,
    "reachedGoalFirst" BOOLEAN,
    "lastCheckedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaperSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaperSignal_ticker_setupType_signalDate_key"
  ON "PaperSignal"("ticker", "setupType", "signalDate");
CREATE INDEX "PaperSignal_state_idx" ON "PaperSignal"("state");
CREATE INDEX "PaperSignal_setupType_state_idx" ON "PaperSignal"("setupType", "state");
