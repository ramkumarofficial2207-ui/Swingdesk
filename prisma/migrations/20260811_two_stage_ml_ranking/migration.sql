-- Additive two-stage ML lifecycle fields. Existing one-stage rows remain valid
-- and are backfilled by the historical replay before the next training run.
ALTER TABLE "MlOutcome"
    ADD COLUMN IF NOT EXISTS "triggered" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "triggeredAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "daysToTrigger" INTEGER,
    ADD COLUMN IF NOT EXISTS "postTriggerOutcome" TEXT,
    ADD COLUMN IF NOT EXISTS "timeExit" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "maximumR" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "minimumR" DOUBLE PRECISION;

ALTER TABLE "MlPrediction"
    ADD COLUMN IF NOT EXISTS "triggerProbability" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "conditionalWinProbability" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "expectedR" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "MlOutcome_triggered_postTriggerOutcome_idx"
    ON "MlOutcome"("triggered", "postTriggerOutcome");
