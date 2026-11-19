-- Daily global market and commodity series (copper, crude, USD/INR, US indices, gold).
CREATE TABLE IF NOT EXISTS "GlobalMarketDaily" (
    "id" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "close" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'YAHOO_CHART',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GlobalMarketDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GlobalMarketDaily_series_date_key" ON "GlobalMarketDaily"("series", "date");
CREATE INDEX IF NOT EXISTS "GlobalMarketDaily_date_idx" ON "GlobalMarketDaily"("date");
