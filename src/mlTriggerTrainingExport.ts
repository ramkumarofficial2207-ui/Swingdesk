import fs from 'fs';
import path from 'path';
import prisma from './prismaClient';

function csvCell(value: unknown): string {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const snapshots = await prisma.mlTriggerFeatureSnapshot.findMany({
    where: {
      historicalSetup: {
        triggerConfirmed: true,
        status: { in: ['WON', 'LOST'] },
        resolvedAt: { not: null },
      },
    },
    include: { historicalSetup: true },
    orderBy: { triggeredAt: 'asc' },
  });
  if (!snapshots.length) {
    throw new Error('No resolved live trigger snapshots exist yet. Keep trigger capture enabled until outcomes accumulate.');
  }

  const flattened = snapshots.map(snapshot => {
    const setup = snapshot.historicalSetup;
    const initialRisk = setup.entryPrice - setup.stopLoss;
    const pnlPerShare = setup.entryPrice * ((setup.resultPct ?? 0) / 100);
    return {
      ...(snapshot.features as Record<string, unknown>),
      ticker: snapshot.ticker,
      date: snapshot.triggeredAt.toISOString().slice(0, 10),
      triggeredAt: snapshot.triggeredAt.toISOString(),
      label: setup.status === 'WON' ? 1 : 0,
      outcome: setup.status,
      returnPct: setup.resultPct,
      rMultiple: initialRisk > 0 ? pnlPerShare / initialRisk : null,
      historicalSetupId: setup.id,
      featureSchemaVersion: snapshot.featureSchemaVersion,
    };
  });
  const headers = [...new Set(flattened.flatMap(row => Object.keys(row)))];
  const lines = [headers.join(','), ...flattened.map(row => headers.map(header => csvCell(row[header as keyof typeof row])).join(','))];
  const output = path.resolve(process.env.ML_TRIGGER_TRAINING_EXPORT_PATH || path.join('data', 'ml_trigger_training_features.csv'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf-8');
  console.log(`[ML] Exported ${flattened.length} resolved trigger snapshots to ${output}`);
}

main()
  .catch(error => {
    console.error('[ML] Trigger training export failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
