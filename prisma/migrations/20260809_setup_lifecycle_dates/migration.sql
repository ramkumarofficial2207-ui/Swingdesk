-- Preserve the original qualification moment for every historical setup and
-- add an explicit trigger moment for lifecycle tracking in the UI.
ALTER TABLE "HistoricalSetup" ADD COLUMN "qualifiedAt" TIMESTAMP(3);
ALTER TABLE "HistoricalSetup" ADD COLUMN "triggeredAt" TIMESTAMP(3);
ALTER TABLE "HistoricalSetup" ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "HistoricalSetup"
SET
    "qualifiedAt" = "createdAt",
    "triggeredAt" = CASE
        WHEN UPPER("status") IN ('QUALIFIED') THEN NULL
        WHEN UPPER("aiSignal") IN ('WATCH', 'REJECT') AND UPPER("status") = 'QUALIFIED' THEN NULL
        ELSE "createdAt"
    END,
    "updatedAt" = COALESCE("resolvedAt", "createdAt");

ALTER TABLE "HistoricalSetup" ALTER COLUMN "qualifiedAt" SET NOT NULL;
ALTER TABLE "HistoricalSetup" ALTER COLUMN "qualifiedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "HistoricalSetup" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX "HistoricalSetup_qualifiedAt_idx" ON "HistoricalSetup"("qualifiedAt");
