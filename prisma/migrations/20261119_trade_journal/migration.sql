-- Trade journal: plan at entry, review on close, price excursions.
ALTER TABLE "Trade"
  ADD COLUMN "plannedEntry" DOUBLE PRECISION,
  ADD COLUMN "plannedStop" DOUBLE PRECISION,
  ADD COLUMN "plannedTarget" DOUBLE PRECISION,
  ADD COLUMN "entryReason" TEXT,
  ADD COLUMN "emotionAtEntry" TEXT,
  ADD COLUMN "followedPlan" BOOLEAN,
  ADD COLUMN "mistakes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "grade" TEXT,
  ADD COLUMN "lesson" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "maxFavorablePrice" DOUBLE PRECISION,
  ADD COLUMN "maxAdversePrice" DOUBLE PRECISION;
