ALTER TABLE "DailyCandle" ADD COLUMN IF NOT EXISTS "series" TEXT NOT NULL DEFAULT 'EQ';
UPDATE "DailyCandle" SET "series" = 'INDEX' WHERE "symbol" = 'NIFTY_50' AND "series" <> 'INDEX';
