import 'dotenv/config';
import AdmZip from 'adm-zip';
import axios from 'axios';
import { parse as parseCsv } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';

/**
 * NSE F&O Bhavcopy → one FnoDaily row per underlying and trading date.
 * Open interest is in shares (both formats); volume is in contracts.
 *
 *   npm run fno:backfill -- --from=2021-01-01 --to=2026-11-20 [--concurrency=3]
 *   npm run fno:backfill                       (last 10 weekdays, for the nightly job)
 */

export const FNO_UDIFF_START = '2024-07-08';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: '*/*',
    Referer: 'https://www.nseindia.com/',
};

export function buildFnoUrl(dateKey: string): string {
    const [y, m, d] = dateKey.split('-');
    if (dateKey >= FNO_UDIFF_START) return `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${y}${m}${d}_F_0000.csv.zip`;
    const month = MONTHS[Number(m) - 1];
    return `https://nsearchives.nseindia.com/content/historical/DERIVATIVES/${y}/${month}/fo${d}${month}${y}bhav.csv.zip`;
}

export interface FnoDailyRow {
    symbol: string;
    tradingDate: string;
    isIndex: boolean;
    /** Futures OI summed over all expiries (shares). */
    futOi: number;
    futOiChange: number;
    futContracts: number;
    /** Nearest-expiry future. */
    nearExpiry: string | null;
    nearFutClose: number | null;
    callOi: number;
    putOi: number;
    callOiChange: number;
    putOiChange: number;
}

interface Contract {
    symbol: string;
    kind: 'FUT' | 'CE' | 'PE';
    isIndex: boolean;
    expiry: string;
    close: number;
    oi: number;
    oiChange: number;
    contracts: number;
}

const num = (value: unknown) => {
    const parsed = Number(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
};

function legacyDate(value: string): string | null {
    const match = String(value ?? '').trim().toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
    if (!match) return null;
    const month = MONTHS.indexOf(match[2]);
    return month < 0 ? null : `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

/** Parse either Bhavcopy format into contracts plus the file's trading date. */
export function parseFnoBhavcopy(csvText: string): { tradingDate: string | null; contracts: Contract[] } {
    const rows = parseCsv(csvText, { bom: true, columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
    const contracts: Contract[] = [];
    let tradingDate: string | null = null;
    for (const row of rows) {
        if ('FinInstrmTp' in row) {
            const type = row.FinInstrmTp;
            const isIndex = type === 'IDF' || type === 'IDO';
            const isFuture = type === 'STF' || type === 'IDF';
            const isOption = type === 'STO' || type === 'IDO';
            if (!isFuture && !isOption) continue;
            const kind = isFuture ? 'FUT' : row.OptnTp === 'CE' ? 'CE' : row.OptnTp === 'PE' ? 'PE' : null;
            if (!kind) continue;
            tradingDate ??= row.TradDt || null;
            contracts.push({ symbol: row.TckrSymb, kind, isIndex, expiry: row.XpryDt, close: num(row.ClsPric), oi: num(row.OpnIntrst), oiChange: num(row.ChngInOpnIntrst), contracts: num(row.TtlTradgVol) });
        } else if ('INSTRUMENT' in row) {
            const type = row.INSTRUMENT;
            const isIndex = type === 'FUTIDX' || type === 'OPTIDX';
            const isFuture = type === 'FUTSTK' || type === 'FUTIDX';
            const isOption = type === 'OPTSTK' || type === 'OPTIDX';
            if (!isFuture && !isOption) continue;
            const kind = isFuture ? 'FUT' : row.OPTION_TYP === 'CE' ? 'CE' : row.OPTION_TYP === 'PE' ? 'PE' : null;
            const expiry = legacyDate(row.EXPIRY_DT);
            if (!kind || !expiry) continue;
            tradingDate ??= legacyDate(row.TIMESTAMP);
            contracts.push({ symbol: row.SYMBOL, kind, isIndex, expiry, close: num(row.CLOSE), oi: num(row.OPEN_INT), oiChange: num(row.CHG_IN_OI), contracts: num(row.CONTRACTS) });
        }
    }
    return { tradingDate, contracts };
}

export function aggregateFno(tradingDate: string, contracts: Contract[]): FnoDailyRow[] {
    const bySymbol = new Map<string, FnoDailyRow>();
    for (const c of contracts) {
        if (!c.symbol) continue;
        let row = bySymbol.get(c.symbol);
        if (!row) {
            row = { symbol: c.symbol, tradingDate, isIndex: c.isIndex, futOi: 0, futOiChange: 0, futContracts: 0, nearExpiry: null, nearFutClose: null, callOi: 0, putOi: 0, callOiChange: 0, putOiChange: 0 };
            bySymbol.set(c.symbol, row);
        }
        if (c.kind === 'FUT') {
            row.futOi += c.oi;
            row.futOiChange += c.oiChange;
            row.futContracts += c.contracts;
            if (c.expiry >= tradingDate && (row.nearExpiry === null || c.expiry < row.nearExpiry)) {
                row.nearExpiry = c.expiry;
                row.nearFutClose = c.close > 0 ? c.close : null;
            }
        } else if (c.kind === 'CE') {
            row.callOi += c.oi;
            row.callOiChange += c.oiChange;
        } else {
            row.putOi += c.oi;
            row.putOiChange += c.oiChange;
        }
    }
    return [...bySymbol.values()];
}

export async function fetchFnoDay(dateKey: string): Promise<FnoDailyRow[] | null> {
    try {
        const response = await axios.get(buildFnoUrl(dateKey), { responseType: 'arraybuffer', timeout: 60_000, headers: NSE_HEADERS });
        const entry = new AdmZip(Buffer.from(response.data)).getEntries().find(item => !item.isDirectory && item.entryName.toLowerCase().endsWith('.csv'));
        if (!entry) throw new Error('archive has no CSV');
        const { tradingDate, contracts } = parseFnoBhavcopy(entry.getData().toString('utf8'));
        if (tradingDate !== dateKey) throw new Error(`file date ${tradingDate} does not match ${dateKey}`);
        return aggregateFno(dateKey, contracts);
    } catch (error: any) {
        if (error?.response?.status === 404) return null; // holiday or not yet published
        throw error;
    }
}

export async function upsertFnoRows(rows: FnoDailyRow[]): Promise<void> {
    const now = new Date();
    const big = (value: number) => BigInt(Math.round(value));
    for (let index = 0; index < rows.length; index += 300) {
        const batch = rows.slice(index, index + 300);
        await prisma.$executeRaw(Prisma.sql`
            INSERT INTO "FnoDaily" ("symbol", "tradingDate", "isIndex", "futOi", "futOiChange", "futContracts", "nearExpiry", "nearFutClose", "callOi", "putOi", "callOiChange", "putOiChange", "updatedAt")
            VALUES ${Prisma.join(batch.map(row => Prisma.sql`
                (${row.symbol}, ${new Date(`${row.tradingDate}T00:00:00.000Z`)}, ${row.isIndex}, ${big(row.futOi)}, ${big(row.futOiChange)}, ${big(row.futContracts)},
                 ${row.nearExpiry ? new Date(`${row.nearExpiry}T00:00:00.000Z`) : null}, ${row.nearFutClose}, ${big(row.callOi)}, ${big(row.putOi)}, ${big(row.callOiChange)}, ${big(row.putOiChange)}, ${now})
            `))}
            ON CONFLICT ("symbol", "tradingDate") DO UPDATE SET
                "isIndex" = EXCLUDED."isIndex", "futOi" = EXCLUDED."futOi", "futOiChange" = EXCLUDED."futOiChange", "futContracts" = EXCLUDED."futContracts",
                "nearExpiry" = EXCLUDED."nearExpiry", "nearFutClose" = EXCLUDED."nearFutClose", "callOi" = EXCLUDED."callOi", "putOi" = EXCLUDED."putOi",
                "callOiChange" = EXCLUDED."callOiChange", "putOiChange" = EXCLUDED."putOiChange", "updatedAt" = EXCLUDED."updatedAt"
        `);
    }
}

function weekdays(from: string, to: string): string[] {
    const out: string[] = [];
    for (const cursor = new Date(`${from}T00:00:00.000Z`); cursor <= new Date(`${to}T00:00:00.000Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) out.push(cursor.toISOString().slice(0, 10));
    }
    return out;
}

function istToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Load F&O days in [from, to]. Days already stored are skipped unless force. */
export async function backfillFno(from: string, to: string, options: { concurrency?: number; force?: boolean; log?: boolean } = {}): Promise<{ loaded: number; holidays: number; failed: string[] }> {
    const stored = new Set((await prisma.$queryRaw<Array<{ d: Date }>>`SELECT DISTINCT "tradingDate" AS d FROM "FnoDaily" WHERE "tradingDate" BETWEEN ${new Date(`${from}T00:00:00.000Z`)} AND ${new Date(`${to}T00:00:00.000Z`)}`)
        .map(row => row.d.toISOString().slice(0, 10)));
    const queue = weekdays(from, to).filter(day => options.force || !stored.has(day));
    let loaded = 0;
    let holidays = 0;
    const failed: string[] = [];
    const worker = async () => {
        for (let day = queue.shift(); day; day = queue.shift()) {
            try {
                const rows = await fetchFnoDay(day);
                if (!rows) { holidays += 1; continue; }
                await upsertFnoRows(rows);
                loaded += 1;
                if (options.log && loaded % 50 === 0) console.log(`[F&O] ${loaded} days loaded (latest ${day})`);
            } catch (error: any) {
                failed.push(`${day}: ${error?.response?.status ?? error?.message ?? error}`);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(4, options.concurrency ?? 2)) }, worker));
    return { loaded, holidays, failed };
}

async function main(): Promise<void> {
    const args = new Map(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true'] as const; }));
    const to = args.get('to') ?? istToday();
    const fallbackFrom = new Date(`${to}T00:00:00.000Z`);
    fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - 14);
    const from = args.get('from') ?? fallbackFrom.toISOString().slice(0, 10);
    const result = await backfillFno(from, to, { concurrency: Number(args.get('concurrency') ?? 2), force: args.has('force'), log: true });
    console.log(`[F&O] ${from} → ${to}: loaded ${result.loaded} days, ${result.holidays} holidays/unpublished, ${result.failed.length} failed`);
    if (result.failed.length) console.log(result.failed.slice(0, 20).join('\n'));
}

if (require.main === module) {
    main()
        .catch(error => { console.error('[F&O] failed:', error?.message ?? error); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
