-- Persist the volume-confirmation contract for the two-stage scanner.
ALTER TABLE "HistoricalSetup" ADD COLUMN "triggerVolumeRatio" DOUBLE PRECISION;
ALTER TABLE "HistoricalSetup" ADD COLUMN "triggeredPrice" DOUBLE PRECISION;
ALTER TABLE "HistoricalSetup" ADD COLUMN "triggeredVolumeRatio" DOUBLE PRECISION;

UPDATE "HistoricalSetup"
SET "triggerVolumeRatio" = 1.5
WHERE "triggerVolumeRatio" IS NULL;

ALTER TABLE "HistoricalSetup" ALTER COLUMN "triggerVolumeRatio" SET NOT NULL;
ALTER TABLE "HistoricalSetup" ALTER COLUMN "triggerVolumeRatio" SET DEFAULT 1.5;
