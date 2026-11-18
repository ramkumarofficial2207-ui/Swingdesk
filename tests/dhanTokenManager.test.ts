import { describe, expect, it, vi } from 'vitest';
import {
    decryptAccessToken,
    DhanAuthTransport,
    DhanTokenManager,
    DhanTokenSession,
    DhanTokenStore,
    encryptAccessToken,
    generateTotp,
    parseTokenEncryptionKey,
} from '../src/dhanTokenManager';

class MemoryTokenStore implements DhanTokenStore {
    session: DhanTokenSession | null;
    failures: string[] = [];

    constructor(session: DhanTokenSession | null = null) {
        this.session = session;
    }

    async load() { return this.session ? { ...this.session } : null; }
    async save(session: DhanTokenSession) { this.session = { ...session }; }
    async markValidated(at: Date) {
        if (this.session) this.session.lastValidatedAt = at;
    }
    async recordFailure(message: string) { this.failures.push(message); }
    async runExclusive<T>(operation: (store: DhanTokenStore) => Promise<T>) {
        return operation(this);
    }
}

function transport(overrides: Partial<DhanAuthTransport> = {}): DhanAuthTransport {
    return {
        validate: vi.fn().mockResolvedValue({ expiresAt: new Date('2026-08-10T09:00:00.000Z') }),
        renew: vi.fn().mockResolvedValue({
            accessToken: 'renewed-token',
            expiresAt: new Date('2026-08-10T09:00:00.000Z'),
            tokenSource: 'WEB_RENEWAL',
        }),
        generate: vi.fn().mockResolvedValue({
            accessToken: 'generated-token',
            expiresAt: new Date('2026-08-10T09:00:00.000Z'),
            tokenSource: 'TOTP',
        }),
        ...overrides,
    };
}

describe('Dhan token manager', () => {
    const now = () => new Date('2026-08-09T08:00:00.000Z');

    it('generates RFC 6238 compatible TOTP values', () => {
        const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        expect(generateTotp(secret, new Date(59_000), 8)).toBe('94287082');
    });

    it('encrypts persisted tokens with authenticated AES-256-GCM', () => {
        const key = parseTokenEncryptionKey('11'.repeat(32));
        const encrypted = encryptAccessToken('sensitive-token', key);

        expect(encrypted).not.toContain('sensitive-token');
        expect(decryptAccessToken(encrypted, key)).toBe('sensitive-token');
        expect(() => decryptAccessToken(encrypted, parseTokenEncryptionKey('22'.repeat(32)))).toThrow();
    });

    it('validates and persists an environment bootstrap token', async () => {
        const store = new MemoryTokenStore();
        const authTransport = transport();
        const manager = new DhanTokenManager({
            clientId: 'client',
            bootstrapAccessToken: 'bootstrap-token',
            autoRenewal: false,
            store,
            transport: authTransport,
            now,
        });

        await manager.initialize();

        expect(authTransport.validate).toHaveBeenCalledWith('bootstrap-token');
        expect(store.session?.accessToken).toBe('bootstrap-token');
        expect(manager.getStatus()).toMatchObject({ tokenAvailable: true, tokenSource: 'ENV_BOOTSTRAP' });
    });

    it('generates a new token through TOTP when no active session exists', async () => {
        const store = new MemoryTokenStore();
        const authTransport = transport();
        const manager = new DhanTokenManager({
            clientId: 'client',
            pin: '123456',
            totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
            autoRenewal: true,
            store,
            transport: authTransport,
            now,
        });

        await manager.initialize();

        expect(authTransport.generate).toHaveBeenCalledOnce();
        expect(store.session?.accessToken).toBe('generated-token');
        expect(await manager.getAccessToken()).toBe('generated-token');
    });

    it('accepts a newly deployed bootstrap token when the persisted token was revoked', async () => {
        const store = new MemoryTokenStore({
            accessToken: 'revoked-token',
            expiresAt: new Date('2026-08-10T09:00:00.000Z'),
            tokenSource: 'TOTP',
        });
        const validate = vi.fn()
            .mockRejectedValueOnce(new Error('Dhan authentication failed (401).'))
            .mockResolvedValueOnce({ expiresAt: new Date('2026-08-10T10:00:00.000Z') });
        const manager = new DhanTokenManager({
            clientId: 'client',
            bootstrapAccessToken: 'replacement-token',
            autoRenewal: false,
            store,
            transport: transport({ validate }),
            now,
        });

        await manager.initialize();

        expect(validate).toHaveBeenNthCalledWith(1, 'revoked-token');
        expect(validate).toHaveBeenNthCalledWith(2, 'replacement-token');
        expect(store.session?.accessToken).toBe('replacement-token');
    });

    it('allows a later scheduler check to recover after startup authentication failed', async () => {
        const validate = vi.fn()
            .mockRejectedValueOnce(new Error('temporary failure'))
            .mockResolvedValueOnce({ expiresAt: new Date('2026-08-10T10:00:00.000Z') });
        const manager = new DhanTokenManager({
            clientId: 'client',
            bootstrapAccessToken: 'bootstrap-token',
            autoRenewal: false,
            store: new MemoryTokenStore(),
            transport: transport({ validate }),
            now,
        });

        await expect(manager.initialize()).rejects.toThrow('temporary failure');
        await expect(manager.initialize()).resolves.toBeUndefined();
        expect(validate).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent forced refreshes into one Dhan request', async () => {
        const store = new MemoryTokenStore({
            accessToken: 'current-token',
            expiresAt: new Date('2026-08-10T09:00:00.000Z'),
            tokenSource: 'TOTP',
        });
        const authTransport = transport();
        const manager = new DhanTokenManager({
            clientId: 'client',
            pin: '123456',
            totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
            autoRenewal: true,
            store,
            transport: authTransport,
            now,
        });
        await manager.initialize();

        const values = await Promise.all([manager.refresh(true), manager.refresh(true), manager.refresh(true)]);

        expect(new Set(values)).toEqual(new Set(['generated-token']));
        expect(authTransport.generate).toHaveBeenCalledOnce();
    });
});
