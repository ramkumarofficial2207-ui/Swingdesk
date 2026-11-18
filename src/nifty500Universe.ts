import { readFileSync, statSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { createHash } from 'crypto';

export const NIFTY500_SOURCE = 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv';
const snapshot = join(__dirname, '..', 'data', 'nifty500-constituents.csv');
let cached: ReadonlySet<string> | null = null;

export function scannerUsesNifty500(): boolean {
    return process.env.SCANNER_UNIVERSE === 'nifty500';
}

export function nifty500Symbols(): ReadonlySet<string> {
    if (cached) return cached;
    const lines = readFileSync(snapshot, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const columns = lines.shift()?.split(',').map(value => value.trim().toLowerCase()) ?? [];
    const symbolIndex = columns.indexOf('symbol');
    if (symbolIndex < 0) throw new Error('Nifty 500 snapshot has no Symbol column.');
    const symbols = new Set(lines.map(line => line.split(',')[symbolIndex]?.trim().toUpperCase()).filter((value): value is string => !!value && /^[A-Z0-9&-]+$/.test(value)));
    if (symbols.size < 450 || symbols.size > 550) throw new Error(`Nifty 500 snapshot has an invalid symbol count (${symbols.size}).`);
    cached = symbols;
    return cached;
}

export function inScannerUniverse(symbol: string): boolean {
    return !scannerUsesNifty500() || nifty500Symbols().has(symbol.replace(/\.NS$/i, '').toUpperCase());
}

export function nifty500Version(): string {
    return createHash('sha256').update([...nifty500Symbols()].sort().join(',')).digest('hex').slice(0, 12);
}

export async function refreshNifty500IfNeeded(): Promise<void> {
    if (!scannerUsesNifty500()) return;
    const checkedDay = statSync(snapshot).mtime.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (checkedDay === today) return;
    try {
        const response = await axios.get<string>(NIFTY500_SOURCE, { timeout: 20000, responseType: 'text' });
        const csv = String(response.data).replace(/^\uFEFF/, '');
        const lines = csv.split(/\r?\n/).filter(Boolean);
        const columns = lines.shift()?.split(',').map(value => value.trim().toLowerCase()) ?? [];
        const symbolIndex = columns.indexOf('symbol');
        const symbols = new Set(lines.map(line => line.split(',')[symbolIndex]?.trim().toUpperCase()).filter(Boolean));
        if (symbolIndex < 0 || symbols.size < 450 || symbols.size > 550) throw new Error(`invalid symbol count ${symbols.size}`);
        const temporary = `${snapshot}.tmp`;
        writeFileSync(temporary, csv);
        renameSync(temporary, snapshot);
        cached = null;
        console.log(`[Nifty 500] Updated official membership (${symbols.size} symbols).`);
    } catch (error: any) {
        console.warn('[Nifty 500] Official refresh unavailable; using last validated membership:', error?.message || error);
    }
}
