CREATE TABLE IF NOT EXISTS "MlTriggerFeatureSnapshot" (
    "id" UUID NOT NULL,
    "historicalSetupId" UUID NOT NULL,
    "qualificationSnapshotId" UUID,
    "ticker" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "featureSchemaVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "triggerPrice" DOUBLE PRECISION NOT NULL,
    "observedPrice" DOUBLE PRECISION NOT NULL,
    "observedRvol" DOUBLE PRECISION NOT NULL,
    "requiredRvol" DOUBLE PRECISION NOT NULL,
    "baselineVolume" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "triggerBucket" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlTriggerFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MlPostTriggerPrediction" (
    "id" UUID NOT NULL,
    "triggerSnapshotId" UUID NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "rankScore" DOUBLE PRECISION,
    "winProbability" DOUBLE PRECISION,
    "expectedR" DOUBLE PRECISION,
    "action" TEXT NOT NULL DEFAULT 'SHADOW',
    "shadow" BOOLEAN NOT NULL DEFAULT true,
    "productionEligible" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlPostTriggerPrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MlTriggerFeatureSnapshot_historicalSetupId_key"
ON "MlTriggerFeatureSnapshot"("historicalSetupId");
CREATE INDEX IF NOT EXISTS "MlTriggerFeatureSnapshot_ticker_triggeredAt_idx"
ON "MlTriggerFeatureSnapshot"("ticker", "triggeredAt");
CREATE INDEX IF NOT EXISTS "MlTriggerFeatureSnapshot_triggeredAt_idx"
ON "MlTriggerFeatureSnapshot"("triggeredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MlPostTriggerPrediction_triggerSnapshotId_modelName_modelVersion_key"
ON "MlPostTriggerPrediction"("triggerSnapshotId", "modelName", "modelVersion");
CREATE INDEX IF NOT EXISTS "MlPostTriggerPrediction_modelName_modelVersion_createdAt_idx"
ON "MlPostTriggerPrediction"("modelName", "modelVersion", "createdAt");
CREATE INDEX IF NOT EXISTS "MlPostTriggerPrediction_shadow_productionEligible_idx"
ON "MlPostTriggerPrediction"("shadow", "productionEligible");

DO $$ BEGIN
    ALTER TABLE "MlTriggerFeatureSnapshot"
    ADD CONSTRAINT "MlTriggerFeatureSnapshot_historicalSetupId_fkey"
    FOREIGN KEY ("historicalSetupId") REFERENCES "HistoricalSetup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "MlPostTriggerPrediction"
    ADD CONSTRAINT "MlPostTriggerPrediction_triggerSnapshotId_fkey"
    FOREIGN KEY ("triggerSnapshotId") REFERENCES "MlTriggerFeatureSnapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
