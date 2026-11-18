-- Institutional discovery lifecycle and auditable hybrid ML ranking.
CREATE TABLE IF NOT EXISTS "institutional_candidate_pool" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccumulationDate" TIMESTAMP(3) NOT NULL,
    "netInstitutionalQty" INTEGER NOT NULL,
    "netInstitutionalCr" DOUBLE PRECISION NOT NULL,
    "deliverySpikeRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "institutional_candidate_pool_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "institutional_candidate_pool_symbol_key"
ON "institutional_candidate_pool"("symbol");

ALTER TABLE "institutional_candidate_pool"
ADD COLUMN IF NOT EXISTS "institutionalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "liquidityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "candidateScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "sourceTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

DROP INDEX IF EXISTS "institutional_candidate_pool_symbol_idx";
CREATE INDEX "institutional_candidate_pool_status_candidateScore_idx"
ON "institutional_candidate_pool"("status", "candidateScore");
CREATE INDEX "institutional_candidate_pool_lastAccumulationDate_idx"
ON "institutional_candidate_pool"("lastAccumulationDate");

CREATE TABLE "MlFeatureSnapshot" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "scanJobId" UUID,
    "ticker" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "featureSchemaVersion" TEXT NOT NULL,
    "deterministicScore" DOUBLE PRECISION NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MlPrediction" (
    "id" UUID NOT NULL,
    "featureSnapshotId" UUID NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "modelRole" TEXT NOT NULL,
    "rankScore" DOUBLE PRECISION,
    "winProbability" DOUBLE PRECISION,
    "rank" INTEGER,
    "action" TEXT NOT NULL DEFAULT 'SHADOW',
    "shadow" BOOLEAN NOT NULL DEFAULT true,
    "productionEligible" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MlPrediction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MlOutcome" (
    "id" UUID NOT NULL,
    "featureSnapshotId" UUID NOT NULL,
    "historicalSetupId" UUID,
    "outcome" TEXT NOT NULL,
    "returnPct" DOUBLE PRECISION,
    "rMultiple" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MlOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MlModelVersion" (
    "id" UUID NOT NULL,
    "modelName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SHADOW',
    "featureSchemaVersion" TEXT NOT NULL,
    "artifactUri" TEXT,
    "datasetHash" TEXT,
    "trainingWindowStart" TIMESTAMP(3),
    "trainingWindowEnd" TIMESTAMP(3),
    "metrics" JSONB,
    "promotionReport" JSONB,
    "productionEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    CONSTRAINT "MlModelVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MlFeatureSnapshot_batchId_ticker_key" ON "MlFeatureSnapshot"("batchId", "ticker");
CREATE INDEX "MlFeatureSnapshot_ticker_asOf_idx" ON "MlFeatureSnapshot"("ticker", "asOf");
CREATE INDEX "MlFeatureSnapshot_scanJobId_idx" ON "MlFeatureSnapshot"("scanJobId");
CREATE UNIQUE INDEX "MlPrediction_featureSnapshotId_modelName_modelVersion_key"
ON "MlPrediction"("featureSnapshotId", "modelName", "modelVersion");
CREATE INDEX "MlPrediction_modelName_modelVersion_createdAt_idx"
ON "MlPrediction"("modelName", "modelVersion", "createdAt");
CREATE INDEX "MlPrediction_shadow_productionEligible_idx"
ON "MlPrediction"("shadow", "productionEligible");
CREATE UNIQUE INDEX "MlOutcome_featureSnapshotId_key" ON "MlOutcome"("featureSnapshotId");
CREATE INDEX "MlOutcome_outcome_resolvedAt_idx" ON "MlOutcome"("outcome", "resolvedAt");
CREATE INDEX "MlOutcome_historicalSetupId_idx" ON "MlOutcome"("historicalSetupId");
CREATE UNIQUE INDEX "MlModelVersion_modelName_version_key" ON "MlModelVersion"("modelName", "version");
CREATE INDEX "MlModelVersion_role_status_idx" ON "MlModelVersion"("role", "status");
CREATE INDEX "MlModelVersion_productionEligible_idx" ON "MlModelVersion"("productionEligible");

ALTER TABLE "MlPrediction"
ADD CONSTRAINT "MlPrediction_featureSnapshotId_fkey"
FOREIGN KEY ("featureSnapshotId") REFERENCES "MlFeatureSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MlOutcome"
ADD CONSTRAINT "MlOutcome_featureSnapshotId_fkey"
FOREIGN KEY ("featureSnapshotId") REFERENCES "MlFeatureSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
