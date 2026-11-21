-- Quarterly financial results from NSE XBRL filings (src/quarterlyResultsBackfill.ts).
CREATE TABLE IF NOT EXISTS "QuarterlyResult" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "symbol" TEXT NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE NOT NULL,
    "consolidated" BOOLEAN NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "audited" TEXT,
    "revenue" DOUBLE PRECISION,
    "profitBeforeTax" DOUBLE PRECISION,
    "netProfit" DOUBLE PRECISION,
    "netProfitOwners" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "bank" BOOLEAN NOT NULL DEFAULT false,
    "xbrlUrl" TEXT,
    "seqNumber" TEXT,
    "parseStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuarterlyResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuarterlyResult_symbol_periodEnd_consolidated_key" ON "QuarterlyResult"("symbol", "periodEnd", "consolidated");
CREATE INDEX IF NOT EXISTS "QuarterlyResult_publishedAt_idx" ON "QuarterlyResult"("publishedAt");
