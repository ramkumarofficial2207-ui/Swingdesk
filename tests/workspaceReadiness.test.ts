import { describe, expect, it } from 'vitest';
import { assessWorkspaceReadiness } from '../src/workspaceReadiness';

const base = { now: new Date('2026-11-17T06:00:00Z'), marketOpen: true, eodDate: '2026-11-16', eodStatus: 'READY',
    scanAt: '2026-11-16T11:00:00Z', latestTickAt: '2026-11-17T05:59:45Z', feedConnected: true,
    automaticScanEnabled: true, automaticExecutionEnabled: false };

describe('workspace readiness', () => {
    it('separates current research from disabled order execution', () => {
        expect(assessWorkspaceReadiness(base)).toEqual({ eod: 'READY', scan: 'READY', tick: 'READY', automaticScan: 'READY', automaticExecution: 'DISABLED' });
    });
    it('flags an old scan and missing EOD run without treating a connected feed as a substitute', () => {
        expect(assessWorkspaceReadiness({ ...base, eodDate: null, scanAt: '2026-08-08T11:00:00Z' })).toMatchObject({ eod: 'MISSING', scan: 'STALE', tick: 'READY' });
    });
    it('does not call a disconnected or late market feed live', () => {
        expect(assessWorkspaceReadiness({ ...base, feedConnected: false }).tick).toBe('MISSING');
        expect(assessWorkspaceReadiness({ ...base, latestTickAt: '2026-11-17T05:59:00Z' }).tick).toBe('STALE');
    });
    it('labels a closed market without implying a feed failure', () => {
        expect(assessWorkspaceReadiness({ ...base, marketOpen: false, feedConnected: false }).tick).toBe('DISABLED');
    });
});
