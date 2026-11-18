import fs from 'fs';
import path from 'path';
import prisma from './prismaClient';

function csvCell(value: unknown): string {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const rows = await prisma.mlOutcome.findMany({
    include: { featureSnapshot: true },
    orderBy: { resolvedAt: 'asc' },
  });
  if (!rows.length) throw new Error('No resolved ML outcomes are available for export.');

  const flattened = rows.map(row => {
    const features = row.featureSnapshot.features as Record<string, unknown>;
    return {
      ...features,
      ticker: row.featureSnapshot.ticker,
      date: row.featureSnapshot.asOf.toISOString().slice(0, 10),
      label: row.outcome === 'WON' ? 1 : 0,
      triggerLabel: row.triggered ? 1 : 0,
      triggered: row.triggered,
      triggeredAt: row.triggeredAt?.toISOString().slice(0, 10) ?? null,
      daysToTrigger: row.daysToTrigger,
      postTriggerLabel: row.triggered ? (row.postTriggerOutcome === 'WON' ? 1 : 0) : null,
      postTriggerOutcome: row.postTriggerOutcome,
      timeExit: row.timeExit,
      maximumR: row.maximumR,
      minimumR: row.minimumR,
      outcome: row.outcome,
      returnPct: row.returnPct,
      rMultiple: row.rMultiple,
      featureSchemaVersion: row.featureSnapshot.featureSchemaVersion,
    };
  });
  const headers = [...new Set(flattened.flatMap(row => Object.keys(row)))];
  const lines = [headers.join(','), ...flattened.map(row => headers.map(header => csvCell(row[header as keyof typeof row])).join(','))];
  const output = path.resolve(process.env.ML_TRAINING_EXPORT_PATH || path.join('data', 'ml_training_features.csv'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf-8');
  console.log(`[ML] Exported ${flattened.length} labeled snapshots to ${output}`);
}

main()
  .catch(error => {
    console.error('[ML] Training export failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
