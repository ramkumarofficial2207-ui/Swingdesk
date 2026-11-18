import axios from 'axios';

/**
 * Blocks swing setups when the company reports results within the next few
 * days, using NSE's official board-meeting event calendar. When the calendar
 * cannot be fetched the check says so (checked: false) instead of reporting
 * the stock as safe.
 */

export interface EarningsRiskResult {
    blocked: boolean;
    /** False when the results calendar could not be read; risk is unknown. */
    checked: boolean;
    reason: string;
    nextEarningsDate?: Date;
    daysUntilEarnings?: number;
}

export interface BoardMeetingEvent {
    symbol: string;
    purpose: string;
    date: Date;
}

const CALENDAR_PAGE = 'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar';
const CALENDAR_API = 'https://www.nseindia.com/api/event-calendar';
const CACHE_TTL_MS = 6 * 60 * 60_000;
const FAILURE_RETRY_MS = 15 * 60_000;
const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
/** About four trading sessions. */
export const DEFAULT_EARNINGS_WINDOW_DAYS = 6;

let cache: { fetchedAt: number; events: BoardMeetingEvent[] | null } | null = null;
let inFlight: Promise<BoardMeetingEvent[] | null> | null = null;

/** Parse NSE's "20-Nov-2026" into a UTC midnight date. */
export function parseNseDate(value: string): Date | null {
    const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value?.trim() ?? '');
    if (!match || MONTHS[match[2]] === undefined) return null;
    return new Date(Date.UTC(Number(match[3]), MONTHS[match[2]], Number(match[1])));
}

export function parseEventCalendar(payload: unknown): BoardMeetingEvent[] {
    if (!Array.isArray(payload)) return [];
    return payload.flatMap(item => {
        const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
        const purpose = typeof item?.purpose === 'string' ? item.purpose : '';
        const date = parseNseDate(item?.date);
        return symbol && date ? [{ symbol, purpose, date }] : [];
    });
}

/** Today's date in India as UTC midnight, so it compares with NSE dates. */
export function istToday(now = new Date()): Date {
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Pure decision: a results meeting for this symbol from today through the window blocks the setup. */
export function assessEarningsRisk(
    ticker: string,
    events: BoardMeetingEvent[] | null,
    windowDays = DEFAULT_EARNINGS_WINDOW_DAYS,
    today = istToday(),
): EarningsRiskResult {
    if (!events) {
        return { blocked: false, checked: false, reason: 'NSE results calendar unavailable; check the results date before buying.' };
    }
    const symbol = ticker.trim().replace(/\.NS$/i, '').toUpperCase();
    const upcoming = events
        .filter(event => event.symbol === symbol && /financial results/i.test(event.purpose) && event.date.getTime() >= today.getTime())
        .sort((left, right) => left.date.getTime() - right.date.getTime())[0];
    if (!upcoming) return { blocked: false, checked: true, reason: `No results meeting listed by NSE in the next ${windowDays} days.` };
    const days = Math.round((upcoming.date.getTime() - today.getTime()) / 86_400_000);
    const when = upcoming.date.toISOString().slice(0, 10);
    if (days <= windowDays) {
        return {
            blocked: true, checked: true, nextEarningsDate: upcoming.date, daysUntilEarnings: days,
            reason: `Results on ${when} (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}); a results gap can jump past the stop.`,
        };
    }
    return { blocked: false, checked: true, nextEarningsDate: upcoming.date, daysUntilEarnings: days, reason: `Next results on ${when}.` };
}

async function fetchEventCalendar(): Promise<BoardMeetingEvent[] | null> {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': CALENDAR_PAGE,
    };
    try {
        const landing = await axios.get(CALENDAR_PAGE, { headers, timeout: 8000, validateStatus: status => status >= 200 && status < 400 });
        const cookie = Array.isArray(landing.headers['set-cookie'])
            ? landing.headers['set-cookie'].map(value => value.split(';')[0]).join('; ')
            : undefined;
        const response = await axios.get(CALENDAR_API, { headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) }, timeout: 8000 });
        const events = parseEventCalendar(response.data);
        return Array.isArray(response.data) ? events : null;
    } catch (error: any) {
        console.warn(`[Earnings] NSE event calendar unavailable: ${error?.response?.status ?? error?.message ?? error}`);
        return null;
    }
}

async function loadEventCalendar(): Promise<BoardMeetingEvent[] | null> {
    const now = Date.now();
    if (cache) {
        const ttl = cache.events ? CACHE_TTL_MS : FAILURE_RETRY_MS;
        if (now - cache.fetchedAt < ttl) return cache.events;
    }
    if (!inFlight) {
        inFlight = fetchEventCalendar()
            .then(events => { cache = { fetchedAt: Date.now(), events }; return events; })
            .finally(() => { inFlight = null; });
    }
    return inFlight;
}

/**
 * Checks whether a company reports results within the next safeWindowDays
 * calendar days, using NSE's event calendar (cached for six hours).
 */
export async function validateEarningsRisk(ticker: string, safeWindowDays = DEFAULT_EARNINGS_WINDOW_DAYS): Promise<EarningsRiskResult> {
    return assessEarningsRisk(ticker, await loadEventCalendar(), safeWindowDays);
}

export function clearEarningsCalendarCache(): void {
    cache = null;
    inFlight = null;
}
