import prisma from './prismaClient';
import { EVIDENCE_METHOD_VERSION } from './research/setupEvidence';

/** Trust status and test-period evidence per setup type, for the app and chat. */
export interface SetupEvidenceView {
    setupType: string;
    status: 'RESEARCH_ONLY' | 'ON_TRIAL' | 'TRUSTED';
    reasons: string[];
    test: { n: number; targetPct: number; stopPct: number; expiredPct: number; avgNetR: number; ciNetR: number };
    goalRateTest: number | null;
    generatedAt: string;
    methodVersion: string;
}

export async function getSetupEvidence(): Promise<SetupEvidenceView[]> {
    const rows = await prisma.setupEvidence.findMany({
        where: { methodVersion: EVIDENCE_METHOD_VERSION },
        orderBy: { setupType: 'asc' },
    });
    return rows.map(row => ({
        setupType: row.setupType,
        status: row.status as SetupEvidenceView['status'],
        reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
        test: row.test as unknown as SetupEvidenceView['test'],
        goalRateTest: row.goalRateTest,
        generatedAt: row.generatedAt.toISOString(),
        methodVersion: row.methodVersion,
    }));
}

/** Evidence for one setup type; unknown types are research-only by default. */
export async function getSetupEvidenceFor(setupType: string): Promise<SetupEvidenceView | null> {
    const all = await getSetupEvidence();
    return all.find(item => item.setupType === setupType) ?? null;
}
