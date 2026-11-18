CREATE TABLE "BrokerAuthSession" (
    "provider" TEXT NOT NULL,
    "accessTokenCiphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastValidatedAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerAuthSession_pkey" PRIMARY KEY ("provider")
);

CREATE INDEX "BrokerAuthSession_status_expiresAt_idx"
ON "BrokerAuthSession"("status", "expiresAt");
