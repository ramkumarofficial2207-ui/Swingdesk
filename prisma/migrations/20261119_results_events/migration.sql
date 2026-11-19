-- Historical results board meetings (NSE board-meeting history).
CREATE TABLE "ResultsEvent" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "meetingDate" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "intimatedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'NSE_BOARD_MEETINGS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResultsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResultsEvent_symbol_meetingDate_key" ON "ResultsEvent"("symbol", "meetingDate");
CREATE INDEX "ResultsEvent_meetingDate_idx" ON "ResultsEvent"("meetingDate");
