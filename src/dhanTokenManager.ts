import axios from 'axios';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import cron, { ScheduledTask } from 'node-cron';
import prisma from './prismaClient';

const DHAN_PROVIDER = 'DHAN';
const DHAN_PROFILE_URL = 'https://api.dhan.co/v2/profile';
const DHAN_RENEW_URL = 'https://api.dhan.co/v2/RenewToken';
const DHAN_GENERATE_URL = 'https://auth.dhan.co/app/generateAccessToken';
const DEFAULT_REFRESH_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_NAMESPACE = 214177;
const ADVISORY_LOCK_KEY = 2207;

export interface DhanTokenSession {
    accessToken: string;
    expiresAt: Date;
    tokenSource: string;
    lastValidatedAt?: Date | null;
    lastRefreshAt?: Date | null;
}

export interface DhanTokenStore {
    load(): Promise<DhanTokenSession | null>;
    save(session: DhanTokenSession): Promise<void>;
    markValidated(at: Date): Promise<void>;
    recordFailure(message: string): Promise<void>;
    runExclusive<T>(operation: (store: DhanTokenStore) => Promise<T>): Promise<T>;
}

export interface DhanAuthTransport {
    validate(accessToken: string): Promise<{ expiresAt: Date }>;
    renew(clientId: string, accessToken: string): Promise<DhanTokenSession>;
    generate(clientId: string, pin: string, totp: string): Promise<DhanTokenSession>;
}

export interface DhanTokenManagerOptions {
    clientId: string;
    bootstrapAccessToken?: string;
    pin?: string;
    totpSecret?: string;
    autoRenewal?: boolean;
    refreshWindowMs?: number;
    store: DhanTokenStore;
    transport: DhanAuthTransport;
    now?: () => Date;
}

function safeAuthError(error: any): string {
    const status = Number(error?.response?.status || 0);
    if (status) return `Dhan authentication failed (${status}).`;
    return 'Dhan authentication request failed.';
}

function parseDhanDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const iso = new Date(value);
    if (Number.isFinite(iso.getTime())) return iso;

    const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, day, month, year, hour, minute] = match;
    const ist = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+05:30`);
    return Number.isFinite(ist.getTime()) ? ist : null;
}

export function decodeJwtExpiry(accessToken: string): Date | null {
    try {
        const payload = accessToken.split('.')[1];
        if (!payload) return null;
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        const expirySeconds = Number(decoded?.exp);
        return Number.isFinite(expirySeconds) ? new Date(expirySeconds * 1000) : null;
    } catch {
        return null;
    }
}

function decodeBase32(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const normalized = value.toUpperCase().replace(/[\s=-]/g, '');
    if (!normalized || [...normalized].some(char => !alphabet.includes(char))) {
        throw new Error('DHAN_TOTP_SECRET is not valid Base32.');
    }

    let bits = '';
    for (const char of normalized) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
    const bytes: number[] = [];
    for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
        bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
    }
    return Buffer.from(bytes);
}

export function generateTotp(secret: string, at = new Date(), digits = 6, periodSeconds = 30): string {
    const counter = BigInt(Math.floor(at.getTime() / 1000 / periodSeconds));
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(counter);
    const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
        | ((digest[offset + 1] & 0xff) << 16)
        | ((digest[offset + 2] & 0xff) << 8)
        | (digest[offset + 3] & 0xff);
    return String(binary % (10 ** digits)).padStart(digits, '0');
}

export function parseTokenEncryptionKey(raw: string): Buffer {
    const normalized = raw.trim();
    const key = /^[a-f\d]{64}$/i.test(normalized)
        ? Buffer.from(normalized, 'hex')
        : Buffer.from(normalized, 'base64');
    if (key.length !== 32) {
        throw new Error('DHAN_TOKEN_ENCRYPTION_KEY must contain exactly 32 bytes (64 hex characters or Base64).');
    }
    return key;
}

export function encryptAccessToken(accessToken: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptAccessToken(value: string, key: Buffer): string {
    const [version, ivValue, authTagValue, ciphertextValue] = value.split(':');
    if (version !== 'v1' || !ivValue || !authTagValue || !ciphertextValue) {
        throw new Error('Stored Dhan access token has an unsupported encryption format.');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

class PrismaDhanTokenStore implements DhanTokenStore {
    constructor(private readonly key: Buffer, private readonly db: any = prisma) {}

    async load(): Promise<DhanTokenSession | null> {
        const row = await this.db.brokerAuthSession.findUnique({ where: { provider: DHAN_PROVIDER } });
        if (!row) return null;
        return {
            accessToken: decryptAccessToken(row.accessTokenCiphertext, this.key),
            expiresAt: row.expiresAt,
            tokenSource: row.tokenSource,
            lastValidatedAt: row.lastValidatedAt,
            lastRefreshAt: row.lastRefreshAt,
        };
    }

    async save(session: DhanTokenSession): Promise<void> {
        const accessTokenCiphertext = encryptAccessToken(session.accessToken, this.key);
        await this.db.brokerAuthSession.upsert({
            where: { provider: DHAN_PROVIDER },
            create: {
                provider: DHAN_PROVIDER,
                accessTokenCiphertext,
                expiresAt: session.expiresAt,
                tokenSource: session.tokenSource,
                status: 'ACTIVE',
                lastValidatedAt: session.lastValidatedAt,
                lastRefreshAt: session.lastRefreshAt,
            },
            update: {
                accessTokenCiphertext,
                expiresAt: session.expiresAt,
                tokenSource: session.tokenSource,
                status: 'ACTIVE',
                lastValidatedAt: session.lastValidatedAt,
                lastRefreshAt: session.lastRefreshAt,
                lastError: null,
            },
        });
    }

    async markValidated(at: Date): Promise<void> {
        await this.db.brokerAuthSession.updateMany({
            where: { provider: DHAN_PROVIDER },
            data: { lastValidatedAt: at, status: 'ACTIVE', lastError: null },
        });
    }

    async recordFailure(message: string): Promise<void> {
        await this.db.brokerAuthSession.updateMany({
            where: { provider: DHAN_PROVIDER },
            data: { status: 'ERROR', lastError: message.slice(0, 240) },
        });
    }

    async runExclusive<T>(operation: (store: DhanTokenStore) => Promise<T>): Promise<T> {
        if (typeof this.db.$transaction !== 'function') return operation(this);
        return this.db.$transaction(async (tx: any) => {
            await tx.$queryRawUnsafe(
                'SELECT pg_advisory_xact_lock($1, $2)',
                ADVISORY_LOCK_NAMESPACE,
                ADVISORY_LOCK_KEY,
            );
            return operation(new PrismaDhanTokenStore(this.key, tx));
        }, { maxWait: 5_000, timeout: 20_000 });
    }
}

class VolatileDhanTokenStore implements DhanTokenStore {
    private session: DhanTokenSession | null = null;
    async load() { return this.session; }
    async save(session: DhanTokenSession) { this.session = { ...session }; }
    async markValidated(at: Date) {
        if (this.session) this.session.lastValidatedAt = at;
    }
    async recordFailure(_message: string) {}
    async runExclusive<T>(operation: (store: DhanTokenStore) => Promise<T>): Promise<T> { return operation(this); }
}

function tokenResponse(data: any, source: string, now: Date): DhanTokenSession {
    const accessToken = String(data?.accessToken || data?.access_token || '').trim();
    if (!accessToken) throw new Error('Dhan did not return an access token.');
    const expiresAt = parseDhanDate(data?.expiryTime || data?.expiry_time)
        || decodeJwtExpiry(accessToken)
        || new Date(now.getTime() + DEFAULT_TOKEN_LIFETIME_MS);
    return { accessToken, expiresAt, tokenSource: source, lastRefreshAt: now };
}

class AxiosDhanAuthTransport implements DhanAuthTransport {
    async validate(accessToken: string): Promise<{ expiresAt: Date }> {
        try {
            const { data } = await axios.get(DHAN_PROFILE_URL, {
                headers: { 'access-token': accessToken },
                timeout: 10_000,
            });
            const expiresAt = parseDhanDate(data?.tokenValidity) || decodeJwtExpiry(accessToken);
            if (!expiresAt) throw new Error('Dhan profile did not return token validity.');
            return { expiresAt };
        } catch (error: any) {
            throw new Error(safeAuthError(error));
        }
    }

    async renew(clientId: string, accessToken: string): Promise<DhanTokenSession> {
        try {
            const now = new Date();
            const { data } = await axios.get(DHAN_RENEW_URL, {
                headers: { 'access-token': accessToken, dhanClientId: clientId },
                timeout: 10_000,
            });
            return tokenResponse(data, 'WEB_RENEWAL', now);
        } catch (error: any) {
            throw new Error(safeAuthError(error));
        }
    }

    async generate(clientId: string, pin: string, totp: string): Promise<DhanTokenSession> {
        try {
            const now = new Date();
            const { data } = await axios.post(DHAN_GENERATE_URL, undefined, {
                params: { dhanClientId: clientId, pin, totp },
                timeout: 10_000,
            });
            return tokenResponse(data, 'TOTP', now);
        } catch (error: any) {
            throw new Error(safeAuthError(error));
        }
    }
}

export class DhanTokenManager extends EventEmitter {
    private accessToken: string | null = null;
    private expiresAt: Date | null = null;
    private tokenSource: string | null = null;
    private lastValidatedAt: Date | null = null;
    private lastRefreshAt: Date | null = null;
    private lastError: string | null = null;
    private initialization: Promise<void> | null = null;
    private refreshInFlight: Promise<string> | null = null;

    constructor(private readonly options: DhanTokenManagerOptions) {
        super();
    }

    private now(): Date {
        return this.options.now?.() ?? new Date();
    }

    private refreshWindowMs(): number {
        return this.options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;
    }

    private install(session: DhanTokenSession, emitRotation: boolean): void {
        const changed = this.accessToken !== session.accessToken;
        this.accessToken = session.accessToken;
        this.expiresAt = session.expiresAt;
        this.tokenSource = session.tokenSource;
        this.lastValidatedAt = session.lastValidatedAt ?? this.lastValidatedAt;
        this.lastRefreshAt = session.lastRefreshAt ?? this.lastRefreshAt;
        this.lastError = null;
        if (emitRotation && changed) this.emit('tokenRotated', session.accessToken, session.expiresAt);
    }

    private isExpiring(reference = this.now()): boolean {
        return !this.expiresAt || this.expiresAt.getTime() - reference.getTime() <= this.refreshWindowMs();
    }

    async initialize(): Promise<void> {
        if (!this.initialization) {
            this.initialization = this.initializeInternal().catch(error => {
                this.initialization = null;
                throw error;
            });
        }
        return this.initialization;
    }

    private async initializeInternal(): Promise<void> {
        const persisted = await this.options.store.load().catch(() => null);
        const bootstrapToken = this.options.bootstrapAccessToken?.trim();
        const bootstrapExpiry = bootstrapToken ? decodeJwtExpiry(bootstrapToken) : null;
        const persistedIsActive = !!persisted && persisted.expiresAt > this.now();
        const session = persistedIsActive ? persisted : (bootstrapToken ? {
            accessToken: bootstrapToken,
            expiresAt: bootstrapExpiry || new Date(0),
            tokenSource: 'ENV_BOOTSTRAP',
        } : persisted);

        if (session) {
            this.install(session, false);
            try {
                const validation = await this.options.transport.validate(session.accessToken);
                const validatedAt = this.now();
                this.expiresAt = validation.expiresAt;
                this.lastValidatedAt = validatedAt;
                await this.options.store.save({
                    ...session,
                    expiresAt: validation.expiresAt,
                    lastValidatedAt: validatedAt,
                });
                this.emit('tokenRotated', session.accessToken, validation.expiresAt);
                if (this.isExpiring() && this.options.autoRenewal) await this.refresh(true);
                return;
            } catch (error: any) {
                this.lastError = error?.message || 'Dhan token validation failed.';
                if (bootstrapToken && bootstrapToken !== session.accessToken) {
                    try {
                        const validation = await this.options.transport.validate(bootstrapToken);
                        const replacement: DhanTokenSession = {
                            accessToken: bootstrapToken,
                            expiresAt: validation.expiresAt,
                            tokenSource: 'ENV_BOOTSTRAP',
                            lastValidatedAt: this.now(),
                        };
                        await this.options.store.save(replacement);
                        this.install(replacement, true);
                        if (this.isExpiring() && this.options.autoRenewal) await this.refresh(true);
                        return;
                    } catch (bootstrapError: any) {
                        this.lastError = bootstrapError?.message || 'Dhan bootstrap token validation failed.';
                    }
                }
                if (!this.options.autoRenewal) throw error;
            }
        }

        if (this.options.autoRenewal) {
            await this.refresh(true);
            return;
        }
        throw new Error('No valid Dhan access token is configured.');
    }

    async getAccessToken(): Promise<string> {
        await this.initialize();
        if (this.options.autoRenewal && this.isExpiring()) {
            try {
                await this.refresh(false);
            } catch (error: any) {
                if (!this.accessToken || !this.expiresAt || this.expiresAt <= this.now()) throw error;
                console.warn('[Dhan Auth] Renewal deferred; the current token remains active.');
            }
        }
        if (!this.accessToken) throw new Error('Dhan access token is unavailable.');
        return this.accessToken;
    }

    async refresh(force = false): Promise<string> {
        if (!this.options.autoRenewal) throw new Error('Automatic Dhan token renewal is not configured.');
        if (!this.refreshInFlight) {
            this.refreshInFlight = this.refreshInternal(force).finally(() => {
                this.refreshInFlight = null;
            });
        }
        return this.refreshInFlight;
    }

    async refreshAfterUnauthorized(rejectedToken: string): Promise<string> {
        if (this.accessToken && this.accessToken !== rejectedToken) return this.accessToken;
        return this.refresh(true);
    }

    private async refreshInternal(force: boolean): Promise<string> {
        try {
            return await this.options.store.runExclusive(async lockedStore => {
                const latest = await lockedStore.load();
                if (latest && latest.accessToken !== this.accessToken && latest.expiresAt > this.now()) {
                    this.install(latest, true);
                    return latest.accessToken;
                }
                if (!force && latest && latest.expiresAt.getTime() - this.now().getTime() > this.refreshWindowMs()) {
                    this.install(latest, true);
                    return latest.accessToken;
                }

                const pin = this.options.pin?.trim();
                const totpSecret = this.options.totpSecret?.trim();
                let session: DhanTokenSession;
                if (pin && totpSecret) {
                    const totp = generateTotp(totpSecret, this.now());
                    session = await this.options.transport.generate(this.options.clientId, pin, totp);
                } else {
                    const currentToken = latest?.accessToken || this.accessToken;
                    const currentExpiry = latest?.expiresAt || this.expiresAt;
                    if (!currentToken || !currentExpiry || currentExpiry <= this.now()) {
                        throw new Error('Dhan token expired; configure DHAN_PIN and DHAN_TOTP_SECRET for recovery.');
                    }
                    session = await this.options.transport.renew(this.options.clientId, currentToken);
                }

                await lockedStore.save(session);
                this.install(session, true);
                console.log(`[Dhan Auth] Access token rotated; valid until ${session.expiresAt.toISOString()}.`);
                return session.accessToken;
            });
        } catch (error: any) {
            const message = String(error?.message || 'Dhan token renewal failed.').slice(0, 240);
            this.lastError = message;
            await this.options.store.recordFailure(message).catch(() => undefined);
            throw error;
        }
    }

    async validateCurrentToken(): Promise<void> {
        const token = await this.getAccessToken();
        const validation = await this.options.transport.validate(token);
        const validatedAt = this.now();
        this.expiresAt = validation.expiresAt;
        this.lastValidatedAt = validatedAt;
        await this.options.store.markValidated(validatedAt);
    }

    getCurrentAccessToken(): string | null {
        return this.accessToken;
    }

    getStatus() {
        const now = this.now();
        return {
            configured: true,
            autoRenewal: !!this.options.autoRenewal,
            tokenAvailable: !!this.accessToken,
            tokenSource: this.tokenSource,
            expiresAt: this.expiresAt?.toISOString() ?? null,
            minutesRemaining: this.expiresAt
                ? Math.max(0, Math.floor((this.expiresAt.getTime() - now.getTime()) / 60_000))
                : null,
            lastValidatedAt: this.lastValidatedAt?.toISOString() ?? null,
            lastRefreshAt: this.lastRefreshAt?.toISOString() ?? null,
            lastError: this.lastError,
        };
    }
}

let singleton: DhanTokenManager | null = null;
let renewalTask: ScheduledTask | null = null;

function totpRecoveryConfigured(): boolean {
    return !!(
        process.env.DHAN_PIN
        && process.env.DHAN_TOTP_SECRET
        && process.env.DHAN_TOKEN_ENCRYPTION_KEY
    );
}

export function isDhanAuthConfigured(): boolean {
    return !!process.env.DHAN_CLIENT_ID && !!(
        process.env.DHAN_ACCESS_TOKEN
        || totpRecoveryConfigured()
    );
}

export function isDhanAutoRenewalConfigured(): boolean {
    return process.env.DHAN_AUTO_TOKEN_RENEWAL !== 'false'
        && !!process.env.DHAN_TOKEN_ENCRYPTION_KEY
        && !!(process.env.DHAN_ACCESS_TOKEN || (process.env.DHAN_PIN && process.env.DHAN_TOTP_SECRET));
}

export function getDhanTokenManager(): DhanTokenManager | null {
    if (singleton) return singleton;
    const clientId = process.env.DHAN_CLIENT_ID?.trim();
    if (!clientId || !isDhanAuthConfigured()) return null;

    const encryptionKey = process.env.DHAN_TOKEN_ENCRYPTION_KEY?.trim();
    const store = encryptionKey
        ? new PrismaDhanTokenStore(parseTokenEncryptionKey(encryptionKey))
        : new VolatileDhanTokenStore();
    singleton = new DhanTokenManager({
        clientId,
        bootstrapAccessToken: process.env.DHAN_ACCESS_TOKEN,
        pin: process.env.DHAN_PIN,
        totpSecret: process.env.DHAN_TOTP_SECRET,
        autoRenewal: isDhanAutoRenewalConfigured(),
        refreshWindowMs: Number(process.env.DHAN_TOKEN_REFRESH_WINDOW_MINUTES || 60) * 60_000,
        store,
        transport: new AxiosDhanAuthTransport(),
    });
    return singleton;
}

export async function initializeDhanTokenManager(): Promise<DhanTokenManager | null> {
    const manager = getDhanTokenManager();
    if (!manager) {
        console.warn('[Dhan Auth] Dhan credentials are not configured.');
        return null;
    }
    await manager.initialize();
    return manager;
}

export async function getManagedDhanAccessToken(): Promise<string> {
    const manager = getDhanTokenManager();
    if (!manager) throw new Error('Dhan authentication is not configured.');
    return manager.getAccessToken();
}

export function getCurrentDhanAccessToken(): string | null {
    return getDhanTokenManager()?.getCurrentAccessToken() || null;
}

export async function refreshDhanTokenAfterUnauthorized(rejectedToken: string): Promise<string> {
    const manager = getDhanTokenManager();
    if (!manager) throw new Error('Dhan authentication is not configured.');
    return manager.refreshAfterUnauthorized(rejectedToken);
}

export function initDhanTokenRenewalScheduler(): void {
    if (renewalTask || !isDhanAutoRenewalConfigured()) return;
    const manager = getDhanTokenManager();
    if (!manager) return;
    renewalTask = cron.schedule('*/15 * * * *', () => {
        void manager.getAccessToken().catch((error: any) => {
            console.error('[Dhan Auth] Scheduled renewal check failed:', error?.message || error);
        });
    }, { timezone: 'Asia/Kolkata' });
    console.log('[Dhan Auth] Automatic token checks scheduled every 15 minutes.');
}
