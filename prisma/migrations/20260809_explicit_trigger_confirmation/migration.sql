-- Separate a qualified scanner candidate from a price-confirmed trade.
-- Older rows used TRIGGERED/IN_PROGRESS for scanner confidence alone, so they
-- are safely reclassified as waiting candidates unless they already resolved
-- or were explicitly monitored after a trigger.
ALTER TABLE "HistoricalSetup" ADD COLUMN "triggerConfirmed" BOOLEAN;

UPDATE "HistoricalSetup"
SET "triggerConfirmed" = CASE
    WHEN UPPER("status") IN ('WON', 'LOST', 'MONITORED') THEN TRUE
    ELSE FALSE
END;

UPDATE "HistoricalSetup"
SET
    "status" = 'QUALIFIED',
    "triggeredAt" = NULL
WHERE "triggerConfirmed" = FALSE
  AND UPPER("status") IN ('TRIGGERED', 'IN_PROGRESS', 'AUTHORIZED');

ALTER TABLE "HistoricalSetup" ALTER COLUMN "triggerConfirmed" SET NOT NULL;
ALTER TABLE "HistoricalSetup" ALTER COLUMN "triggerConfirmed" SET DEFAULT FALSE;
