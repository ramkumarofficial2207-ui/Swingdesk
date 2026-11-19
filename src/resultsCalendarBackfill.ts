import 'dotenv/config';
import axios from 'axios';
import prisma from './prismaClient';
import { parseNseDate } from './earningsValidator';

/**
 * Downloads NSE board-meeting history month by month and stores meetings that
 * consider financial results in ResultsEvent.
 *
 *   npm run data:results-calendar                      2020-01 to this month
 *   npm run data:results-calendar -- --from=2024-01 --to=2024-12
 */

const PAGE = 'https://www.nseindia.com/companies-listing/corporate-filings-board-meetings';
const API = 'https://www.nseindia.com/api/corporate-board-meetings';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': PAGE,
};

export interface BoardMeetingRow {
    symbol: string;
    meetingDate: Date;
    purpose: string;
    intimatedAt: Date | null;
}

/** Parse "22-Jul-2021 14:25:00" (IST) into a UTC instant. */
export function parseNseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return null;
    const day = parseNseDate(match[1]);
    if (!day) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3]) - (5 * 60 + 30);
    return new Date(day.getTime() + minutes * 60_000 + Number(match[4] ?? 0) * 1000);
}

/** Keep only meetings whose purpose includes financial results. */
export function parseBoardMeetings(payload: unknown): BoardMeetingRow[] {
    const rows = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.data) ? (payload as any).data : [];
    return rows.flatMap((item: any) => {
        const symbol = typeof item?.bm_symbol === 'string' ? item.bm_symbol.trim().toUpperCase() : '';
        const purpose = typeof item?.bm_purpose === 'string' ? item.bm_purpose : '';
        const meetingDate = parseNseDate(item?.bm_date);
        if (!symbol || !meetingDate || !/financial results/i.test(purpose)) return [];
        return [{ symbol, meetingDate, purpose, intimatedAt: parseNseTimestamp(item?.bm_timestamp) }];
    });
}

function monthRanges(from: string, to: string): Array<{ label: string; fromDate: string; toDate: string }> {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const out: Array<{ label: string; fromDate: string; toDate: string }> = [];
    for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y += 1, m = 1) : (m += 1)) {
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const mm = String(m).padStart(2, '0');
        out.push({ label: `${y}-${mm}`, fromDate: `01-${mm}-${y}`, toDate: `${last}-${mm}-${y}` });
    }
    return out;
}

async function session(): Promise<string> {
    const landing = await axios.get(PAGE, { headers: HEADERS, timeout: 15000, validateStatus: status => status >= 200 && status < 400 });
    return Array.isArray(landing.headers['set-cookie']) ? landing.headers['set-cookie'].map(value => value.split(';')[0]).join('; ') : '';
}

async function main(): Promise<void> {
    const arg = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))?.split('=')[1];
    const now = new Date();
    const from = arg('from') ?? '2020-01';
    const to = arg('to') ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    let cookie = await session();
    let total = 0;
    for (const month of monthRanges(from, to)) {
        let rows: BoardMeetingRow[] | null = null;
        let raw = 0;
        for (let attempt = 1; attempt <= 4 && !rows; attempt += 1) {
            try {
                const response = await axios.get(API, {
                    params: { index: 'equities', from_date: month.fromDate, to_date: month.toDate },
                    headers: { ...HEADERS, Cookie: cookie },
                    timeout: 30000,
                });
                raw = Array.isArray(response.data) ? response.data.length : 0;
                rows = parseBoardMeetings(response.data);
            } catch (error: any) {
                const status = error?.response?.status;
                console.warn(`[Results] ${month.label} attempt ${attempt} failed (${status ?? error?.message})`);
                await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
                cookie = await session().catch(() => cookie);
            }
        }
        if (!rows) { console.warn(`[Results] ${month.label} skipped after retries`); continue; }
        const created = await prisma.resultsEvent.createMany({ data: rows, skipDuplicates: true });
        total += created.count;
        console.log(`[Results] ${month.label}: ${raw} meetings, ${rows.length} results, ${created.count} new`);
        await new Promise(resolve => setTimeout(resolve, 1200));
    }
    console.log(`[Results] Done: ${total} new results events; ${await prisma.resultsEvent.count()} stored.`);
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[Results] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
