import type { SetupEvidenceView } from '../setupEvidenceService';

/** Plain-language trust wording shared by chat replies. */

export const STATUS_TEXT: Record<SetupEvidenceView['status'], string> = {
    TRUSTED: 'Trusted',
    ON_TRIAL: 'On trial',
    RESEARCH_ONLY: 'Research only',
};

function r(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

export interface EvidenceSummary {
    label: string;
    tradeable: boolean;
    line: string;
}

export function summarizeSetupEvidence(setupType: string, evidence: SetupEvidenceView[]): EvidenceSummary {
    const item = evidence.find(entry => entry.setupType === setupType);
    if (!item) {
        return {
            label: STATUS_TEXT.RESEARCH_ONLY,
            tradeable: false,
            line: `Setup evidence: ${setupType} has not been tested on past data yet, so it is research only.`,
        };
    }
    const { test } = item;
    const record = test.n
        ? `2024+ test with the app's own levels: ${test.n.toLocaleString('en-IN')} trades, average ${r(test.avgNetR)} after costs, target hit first ${test.targetPct.toFixed(0)}%${item.goalRateTest == null ? '' : `, +5% before the stop ${item.goalRateTest.toFixed(0)}%`}.`
        : 'No 2024+ test trades.';
    const guidance = item.status === 'TRUSTED'
        ? 'It passed both the test period and its live paper record.'
        : item.status === 'ON_TRIAL'
            ? 'It passed the test period; paper trade it until 30 live trades confirm it.'
            : 'Do not risk real money on it.';
    const live = item.status !== 'RESEARCH_ONLY'
        ? item.live?.closed
            ? ` Live paper record: ${item.live.closed} of 30 trades closed, average ${r(item.live.avgNetR ?? 0)}.`
            : ' Live paper record: no closed paper trades yet.'
        : '';
    return {
        label: STATUS_TEXT[item.status],
        tradeable: item.status === 'TRUSTED',
        line: `Setup evidence: ${setupType} is ${STATUS_TEXT[item.status].toLowerCase()}. ${record} ${guidance}${live}`,
    };
}

export function summarizeAllEvidence(evidence: SetupEvidenceView[]): string[] {
    if (!evidence.length) {
        return ['Setup evidence: no setup type has been replayed yet (run npm run research:setup-evidence). Treat every setup as research only.'];
    }
    const count = (status: SetupEvidenceView['status']) => evidence.filter(item => item.status === status).length;
    const ranked = [...evidence].filter(item => item.test.n > 0).sort((left, right) => right.test.avgNetR - left.test.avgNetR).slice(0, 5);
    return [
        `Setup evidence (2024+ test, app's own levels, after costs): ${count('TRUSTED')} trusted, ${count('ON_TRIAL')} on trial, ${count('RESEARCH_ONLY')} research only.`,
        ...ranked.map(item => `- ${item.setupType}: ${STATUS_TEXT[item.status]}, ${item.test.n.toLocaleString('en-IN')} trades, average ${r(item.test.avgNetR)}`),
    ];
}
