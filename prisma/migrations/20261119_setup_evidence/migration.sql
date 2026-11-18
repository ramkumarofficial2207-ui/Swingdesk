-- Replay evidence and trust status per scanner setup type.
CREATE TABLE "SetupEvidence" (
    "id" UUID NOT NULL,
    "setupType" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "discovery" JSONB NOT NULL,
    "test" JSONB NOT NULL,
    "testYears" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "goalRateTest" DOUBLE PRECISION,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SetupEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SetupEvidence_setupType_methodVersion_key"
  ON "SetupEvidence"("setupType", "methodVersion");
CREATE INDEX "SetupEvidence_status_idx" ON "SetupEvidence"("status");
