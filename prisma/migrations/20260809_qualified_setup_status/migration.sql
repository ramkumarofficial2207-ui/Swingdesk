-- WATCH/qualified setups were previously persisted as IN_PROGRESS.
-- Keep them visible for research, but do not treat them as active trades.
UPDATE "HistoricalSetup"
SET "status" = 'QUALIFIED'
WHERE "status" = 'IN_PROGRESS'
  AND UPPER("aiSignal") IN ('WATCH', 'REJECT');
