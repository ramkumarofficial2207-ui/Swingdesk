CREATE TABLE IF NOT EXISTS "FnoDaily" (
    "symbol" TEXT NOT NULL,
    "tradingDate" DATE NOT NULL,
    "isIndex" BOOLEAN NOT NULL DEFAULT false,
    "futOi" BIGINT NOT NULL DEFAULT 0,
    "futOiChange" BIGINT NOT NULL DEFAULT 0,
    "futContracts" BIGINT NOT NULL DEFAULT 0,
    "nearExpiry" DATE,
    "nearFutClose" DOUBLE PRECISION,
    "callOi" BIGINT NOT NULL DEFAULT 0,
    "putOi" BIGINT NOT NULL DEFAULT 0,
    "callOiChange" BIGINT NOT NULL DEFAULT 0,
    "putOiChange" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FnoDaily_pkey" PRIMARY KEY ("symbol", "tradingDate")
);
CREATE INDEX IF NOT EXISTS "FnoDaily_tradingDate_idx" ON "FnoDaily"("tradingDate");
