-- Preserve the full V3 research specification beside the executable V2 plan.
-- V3 remains shadow-only until untouched walk-forward promotion gates pass.
ALTER TABLE "TradePlan"
  ADD COLUMN "shadowStrategyVersion" TEXT,
  ADD COLUMN "shadowPlan" JSONB;

CREATE INDEX "TradePlan_shadowStrategyVersion_idx"
  ON "TradePlan"("shadowStrategyVersion");
