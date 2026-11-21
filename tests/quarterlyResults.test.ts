import { describe, expect, it } from 'vitest';
import { chooseFilings, parseIntegratedListing, parseResultsListing, parseXbrl, quarterStart } from '../src/quarterlyResultsBackfill';

const classic = (toDate: string, consolidated: string, at: string, extra: Record<string, unknown> = {}) => ({
    period: 'Quarterly', cumulative: 'Non-cumulative', symbol: 'ABC', fromDate: '01-Oct-2024', toDate, consolidated,
    exchdisstime: at, audited: 'Audited', bank: 'N', seqNumber: '1', xbrl: 'https://nsearchives.nseindia.in/corporate/xbrl/X.xml', ...extra,
});

describe('quarterly results parsing', () => {
    it('keeps quarterly non-cumulative rows with an IST publish time', () => {
        const rows = parseResultsListing([
            classic('31-Dec-2024', 'Consolidated', '09-Jan-2025 21:40:06'),
            classic('31-Dec-2024', 'Consolidated', '09-Jan-2025 21:40:06', { cumulative: 'Cumulative' }),
            classic('31-Dec-2017', 'Consolidated', '09-Jan-2018 21:40:06'),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].publishedAt.toISOString()).toBe('2025-01-09T16:10:06.000Z');
        expect(rows[0].consolidated).toBe(true);
    });

    it('chooses one basis per company and the earliest filing per quarter', () => {
        const rows = parseResultsListing([
            classic('31-Dec-2024', 'Consolidated', '10-Jan-2025 10:00:00'),
            classic('31-Dec-2024', 'Consolidated', '09-Jan-2025 21:40:06'),
            classic('31-Dec-2024', 'Non-Consolidated', '09-Jan-2025 21:36:00'),
            classic('30-Sep-2024', 'Consolidated', '10-Oct-2024 18:59:00'),
        ]);
        const chosen = chooseFilings(rows);
        expect(chosen.map(r => [r.periodEnd.toISOString().slice(0, 10), r.consolidated, r.publishedAt.toISOString().slice(0, 10)]))
            .toEqual([['2024-09-30', true, '2024-10-10'], ['2024-12-31', true, '2025-01-09']]);
    });

    it('reads the integrated-filing list (2025+)', () => {
        const rows = parseIntegratedListing([{ type: 'Integrated Filing- Financials', symbol: 'TCS', qe_Date: '30-SEP-2026', broadcast_Date: '08-Oct-2026 22:07:33', consolidated: 'Consolidated', xbrl: 'https://nsearchives.nseindia.in/corporate/xbrl/I.xml' },
            { type: 'Integrated Filing- Governance', symbol: 'TCS', qe_Date: '30-SEP-2026', broadcast_Date: '08-Oct-2026 22:07:33' }]);
        expect(rows).toHaveLength(1);
        expect(rows[0].periodStart!.toISOString().slice(0, 10)).toBe('2026-07-01');
        expect(quarterStart(new Date('2026-03-31T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-01-01');
    });

    it('takes the quarter figures, not year-to-date', () => {
        const ctx = (id: string, start: string, end: string) => `<xbrli:context id="${id}"><xbrli:entity/><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
        const xml = ctx('FourD', '2024-04-01', '2024-12-31') + ctx('OneD', '2024-10-01', '2024-12-31')
            + '<in-bse-fin:ProfitLossForPeriod contextRef="FourD" unitRef="INR">300</in-bse-fin:ProfitLossForPeriod>'
            + '<in-bse-fin:ProfitLossForPeriod contextRef="OneD" unitRef="INR">100</in-bse-fin:ProfitLossForPeriod>'
            + '<in-capmkt:BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations contextRef="OneD" decimals="INF">3.5</in-capmkt:BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations>';
        expect(parseXbrl(xml, '2024-10-01', '2024-12-31')).toMatchObject({ netProfit: 100, eps: 3.5 });
        // Older files reference OneD without defining it.
        expect(parseXbrl('<in-bse-fin:ProfitLossForPeriod contextRef="OneD" unitRef="INR">42</in-bse-fin:ProfitLossForPeriod>', '2021-04-01', '2021-06-30').netProfit).toBe(42);
    });
});
