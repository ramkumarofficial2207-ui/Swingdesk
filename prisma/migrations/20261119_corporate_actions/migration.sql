-- Split/bonus/consolidation events for read-time price adjustment.
-- Raw DailyCandle rows are left unchanged.
CREATE TABLE "CorporateAction" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "exDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "ratio" TEXT NOT NULL,
    "priceFactor" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CorporateAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CorporateAction_symbol_exDate_source_key"
  ON "CorporateAction"("symbol", "exDate", "source");
CREATE INDEX "CorporateAction_symbol_exDate_idx"
  ON "CorporateAction"("symbol", "exDate");
