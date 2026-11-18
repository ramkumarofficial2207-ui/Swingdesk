import { describe, expect, it } from 'vitest';
import { summarizeAllEvidence, summarizeSetupEvidence } from '../src/chat/setupEvidenceText';
import type { SetupEvidenceView } from '../src/setupEvidenceService';

const item = (setupType: string, status: SetupEvidenceView['status'], avgNetR: number, n = 800): SetupEvidenceView => ({
    setupType, status, reasons: [], goalRateTest: 24, generatedAt: '2026-11-19T00:00:00Z', methodVersion: 'setup-evidence-v1',
    test: { n, targetPct: 31, stopPct: 58, expiredPct: 11, avgNetR, ciNetR: 0.05 },
});
const evidence = [item('Bull Flag Breakout 🚩', 'RESEARCH_ONLY', -0.21), item('VCP Breakout 🔥', 'ON_TRIAL', 0.18), item('Leader Pullback Reclaim', 'TRUSTED', 0.25)];

describe('summarizeSetupEvidence', () => {
    it('states a research-only record plainly and warns against real money', () => {
        const summary = summarizeSetupEvidence('Bull Flag Breakout 🚩', evidence);
        expect(summary).toMatchObject({ label: 'Research only', tradeable: false });
        expect(summary.line).toContain('800 trades, average -0.21R after costs, target hit first 31%, +5% before the stop 24%');
        expect(summary.line).toContain('Do not risk real money');
    });

    it('keeps on-trial setups to paper trading', () => {
        const summary = summarizeSetupEvidence('VCP Breakout 🔥', evidence);
        expect(summary.tradeable).toBe(false);
        expect(summary.line).toMatch(/paper trade/);
    });

    it('marks only trusted setups as tradeable', () => {
        expect(summarizeSetupEvidence('Leader Pullback Reclaim', evidence).tradeable).toBe(true);
    });

    it('treats setups with no evidence as research only', () => {
        expect(summarizeSetupEvidence('Unknown Setup', evidence)).toMatchObject({ label: 'Research only', tradeable: false });
    });
});

describe('summarizeAllEvidence', () => {
    it('counts statuses and ranks by test result', () => {
        const lines = summarizeAllEvidence(evidence);
        expect(lines[0]).toContain('1 trusted, 1 on trial, 1 research only');
        expect(lines[1]).toContain('Leader Pullback Reclaim');
        expect(lines.at(-1)).toContain('Bull Flag Breakout');
    });

    it('says so when nothing has been replayed', () => {
        expect(summarizeAllEvidence([])[0]).toMatch(/research only/);
    });
});
