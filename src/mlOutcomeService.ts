import prisma from './prismaClient';

interface ResolvedSetup {
  id: string;
  ticker: string;
  status: string;
  resultPct: number | null;
  entryPrice: number;
  stopLoss: number;
  qualifiedAt: Date;
  triggeredAt: Date | null;
  resolvedAt: Date | null;
}

/**
 * Attach a resolved lifecycle outcome to the earliest feature snapshot that
 * represented this setup before its trigger. This creates a leakage-safe label
 * source for the next offline training run.
 */
export async function recordMlOutcomeForSetup(setup: ResolvedSetup): Promise<boolean> {
  if (!setup.resolvedAt || (setup.status !== 'WON' && setup.status !== 'LOST')) return false;
  const alreadyLinked = await prisma.mlOutcome.findFirst({
    where: { historicalSetupId: setup.id },
    select: { id: true },
  });
  if (alreadyLinked) return false;

  const snapshot = await prisma.mlFeatureSnapshot.findFirst({
    where: {
      ticker: setup.ticker.toUpperCase(),
      createdAt: {
        gte: new Date(setup.qualifiedAt.getTime() - 60 * 60 * 1000),
        lte: setup.triggeredAt ?? setup.resolvedAt,
      },
      outcome: null,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!snapshot) return false;

  const initialRisk = setup.entryPrice - setup.stopLoss;
  const pnlPerShare = setup.entryPrice * ((setup.resultPct ?? 0) / 100);
  const rMultiple = initialRisk > 0 ? pnlPerShare / initialRisk : null;
  await prisma.mlOutcome.create({
    data: {
      featureSnapshotId: snapshot.id,
      historicalSetupId: setup.id,
      outcome: setup.status,
      returnPct: setup.resultPct,
      rMultiple,
      triggered: true,
      triggeredAt: setup.triggeredAt ?? setup.qualifiedAt,
      daysToTrigger: Math.max(0, Math.round(((setup.triggeredAt ?? setup.qualifiedAt).getTime() - setup.qualifiedAt.getTime()) / 86_400_000)),
      postTriggerOutcome: setup.status,
      timeExit: false,
      resolvedAt: setup.resolvedAt,
    },
  });
  return true;
}
