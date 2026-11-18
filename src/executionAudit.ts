import prisma from './prismaClient';
import { calculateActualResultPct } from './executionIntegrity';
import { strategyFamilyForSetupType } from './tradePlanService';

type AuditSeverity = 'ERROR' | 'WARNING';

interface AuditIssue {
    setupId: string;
    ticker: string;
    status: string;
    severity: AuditSeverity;
    code: string;
    detail: string;
    expectedResultPct?: number;
}

async function auditResolvedSetups(): Promise<AuditIssue[]> {
    const activeRows = await prisma.historicalSetup.findMany({
        where: {
            status: { in: ['QUALIFIED', 'TRIGGERED', 'IN_PROGRESS', 'MONITORED', 'AUTHORIZED'] },
            resolvedAt: null,
        },
        orderBy: [
            { triggerConfirmed: 'desc' },
            { confidenceScore: 'desc' },
            { qualifiedAt: 'desc' },
        ],
    });
    const activeGroups = new Map<string, typeof activeRows>();
    for (const row of activeRows) {
        const key = `${row.ticker.replace(/\.NS$/i, '').toUpperCase()}:${strategyFamilyForSetupType(row.setupType)}:${row.timeframe || 'Short Swing'}`;
        activeGroups.set(key, [...(activeGroups.get(key) || []), row]);
    }
    const rows = await prisma.historicalSetup.findMany({
        where: { status: { in: ['WON', 'LOST'] } },
        include: {
            tradePlan: {
                include: { attempts: { where: { leg: 'BREAKOUT' }, take: 1 } },
            },
        },
        orderBy: { resolvedAt: 'desc' },
    });
    const issues: AuditIssue[] = [];
    for (const group of activeGroups.values()) {
        for (const duplicate of group.slice(1)) {
            issues.push({
                setupId: duplicate.id,
                ticker: duplicate.ticker,
                status: duplicate.status,
                severity: 'ERROR',
                code: 'DUPLICATE_ACTIVE_SETUP',
                detail: 'A higher-priority setup already owns this ticker/strategy/timeframe lifecycle.',
            });
        }
    }
    for (const row of rows) {
        const attempt = row.tradePlan?.attempts[0];
        const fillPrice = Number(attempt?.actualFillPrice ?? row.triggeredPrice);
        if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
            issues.push({
                setupId: row.id,
                ticker: row.ticker,
                status: row.status,
                severity: 'ERROR',
                code: 'NO_ACTUAL_FILL',
                detail: 'Resolved setup has no persisted actual fill and cannot be counted as a trade.',
            });
            continue;
        }
        if (row.targetPrice <= fillPrice || row.stopLoss >= fillPrice) {
            issues.push({
                setupId: row.id,
                ticker: row.ticker,
                status: row.status,
                severity: 'ERROR',
                code: 'INVALID_LEVELS_AT_FILL',
                detail: `Fill ${fillPrice}; target ${row.targetPrice}; stop ${row.stopLoss}.`,
            });
            continue;
        }
        const exitPrice = row.status === 'WON' ? row.targetPrice : row.stopLoss;
        const expectedResultPct = calculateActualResultPct(fillPrice, exitPrice);
        if (row.resultPct == null || Math.abs(row.resultPct - expectedResultPct) > 0.01) {
            issues.push({
                setupId: row.id,
                ticker: row.ticker,
                status: row.status,
                severity: 'ERROR',
                code: 'PLANNED_ENTRY_RETURN',
                detail: `Stored ${row.resultPct ?? 'null'}%; actual-fill result ${expectedResultPct}%.`,
                expectedResultPct,
            });
        }
        if (!row.tradePlan?.openingPrice) {
            issues.push({
                setupId: row.id,
                ticker: row.ticker,
                status: row.status,
                severity: 'WARNING',
                code: 'OPENING_NOT_CAPTURED',
                detail: 'The market opening price is unavailable for this historical setup.',
            });
        }
    }
    return issues;
}

async function applyRepairs(issues: AuditIssue[]): Promise<void> {
    const actionable = issues.filter(issue => issue.severity === 'ERROR');
    for (const issue of actionable) {
        const row = await prisma.historicalSetup.findUnique({
            where: { id: issue.setupId },
            include: { tradePlan: { include: { attempts: { where: { leg: 'BREAKOUT' }, take: 1 } } } },
        });
        if (!row) continue;
        if (issue.code === 'PLANNED_ENTRY_RETURN' && issue.expectedResultPct != null) {
            await prisma.$transaction(async transaction => {
                await transaction.historicalSetup.update({
                    where: { id: row.id },
                    data: { resultPct: issue.expectedResultPct },
                });
                const attempt = row.tradePlan?.attempts[0];
                if (attempt) {
                    await transaction.tradeAttempt.update({
                        where: { id: attempt.id },
                        data: { resultPct: issue.expectedResultPct },
                    });
                    await transaction.setupLifecycleEvent.create({
                        data: {
                            tradePlanId: row.tradePlan!.id,
                            tradeAttemptId: attempt.id,
                            eventType: 'AUDIT_RESULT_CORRECTED',
                            fromStatus: row.status,
                            toStatus: row.status,
                            observedAt: new Date(),
                            source: 'execution_audit',
                            metadata: { resultPct: issue.expectedResultPct },
                        },
                    });
                }
            });
            continue;
        }

        await prisma.$transaction(async transaction => {
            await transaction.historicalSetup.update({
                where: { id: row.id },
                data: { status: 'INVALIDATED', triggerConfirmed: false, resultPct: null, resolvedAt: row.resolvedAt || new Date() },
            });
            if (row.tradePlan) {
                await transaction.tradePlan.update({
                    where: { id: row.tradePlan.id },
                    data: { status: 'INVALIDATED', activeKey: null },
                });
                const attempt = row.tradePlan.attempts[0];
                if (attempt) {
                    await transaction.tradeAttempt.update({
                        where: { id: attempt.id },
                        data: { status: 'CANCELLED', resultPct: null, missReason: issue.code },
                    });
                }
                await transaction.setupLifecycleEvent.create({
                    data: {
                        tradePlanId: row.tradePlan.id,
                        tradeAttemptId: attempt?.id,
                        eventType: 'AUDIT_INVALIDATED',
                        fromStatus: row.status,
                        toStatus: 'INVALIDATED',
                        observedAt: new Date(),
                        source: 'execution_audit',
                        metadata: { reason: issue.code },
                    },
                });
            }
        });
    }
}

async function main(): Promise<void> {
    const apply = process.argv.includes('--apply');
    const issues = await auditResolvedSetups();
    console.table(issues.map(issue => ({
        ticker: issue.ticker,
        status: issue.status,
        severity: issue.severity,
        code: issue.code,
        detail: issue.detail,
    })));
    console.log(`[Execution Audit] ${issues.length} issue(s). Mode: ${apply ? 'APPLY' : 'DRY RUN'}.`);
    if (apply) {
        await applyRepairs(issues);
        console.log('[Execution Audit] Repairs applied. Re-run without --apply to verify.');
    } else {
        console.log('[Execution Audit] No data changed. Review results, then use --apply explicitly.');
    }
}

main()
    .catch(error => {
        console.error('[Execution Audit] Failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
