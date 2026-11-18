import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.hoisted(() => vi.fn());
vi.mock('../src/prismaClient', () => ({ default: { user: { upsert } } }));
import { isLocalWorkspaceRequest, isPersonalSession, openPersonalWorkspace, personalMode, PERSONAL_USER_ID } from '../src/personalWorkspace';
import { requireAuth, type AuthRequest } from '../src/authMiddleware';
import { requireSubscription } from '../src/subscriptionMiddleware';

function request(headers: Record<string, string> = {}, remoteAddress = '127.0.0.1') {
    return { headers: { host: 'localhost:3000', origin: 'http://localhost:5173', ...headers }, socket: { remoteAddress } } as Request;
}

describe('local personal workspace boundary', () => {
    beforeEach(() => {
        vi.stubEnv('SWINGDESK_PERSONAL_MODE', 'true');
        vi.stubEnv('NODE_ENV', 'development');
        upsert.mockResolvedValue({ id: PERSONAL_USER_ID, tradingCapital: 100000 });
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

    it('requires explicit opt-in and never enables in production', () => {
        expect(personalMode()).toBe(true);
        vi.stubEnv('SWINGDESK_PERSONAL_MODE', 'false');
        expect(isLocalWorkspaceRequest(request())).toBe(false);
        vi.stubEnv('SWINGDESK_PERSONAL_MODE', 'true');
        vi.stubEnv('NODE_ENV', 'production');
        expect(isLocalWorkspaceRequest(request())).toBe(false);
    });

    it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('accepts genuine loopback socket %s', remote => {
        expect(isLocalWorkspaceRequest(request({}, remote))).toBe(true);
    });

    it('rejects remote sockets even with forged proxy headers', () => {
        expect(isLocalWorkspaceRequest(request({ 'x-forwarded-for': '127.0.0.1' }, '192.168.1.2'))).toBe(false);
    });

    it.each([
        { host: 'rebound.example:3000' },
        { origin: 'https://untrusted.example' },
        { origin: 'null' },
        { origin: 'not-a-url' },
        { host: 'localhost.attacker.example' },
    ])('rejects nonlocal or invalid origin/host %j', headers => {
        expect(isLocalWorkspaceRequest(request(headers))).toBe(false);
    });

    it('provisions a distinct owner without resetting saved capital or enabling notifications', async () => {
        const session = await openPersonalWorkspace();
        expect(session.token).toMatch(/^[0-9a-f]{64}$/);
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: PERSONAL_USER_ID }, update: {},
            create: expect.objectContaining({ tradingCapital: 100000, notifyEmail: false, notifyBuySignals: false }),
        }));
    });

    it('requires the issued token and a local request for personal auth and subscription access', async () => {
        const { token } = await openPersonalWorkspace();
        expect(isPersonalSession(request())).toBe(false);
        expect(isPersonalSession(request({ authorization: 'Bearer wrong' }))).toBe(false);
        const req = request({ authorization: `Bearer ${token}` }) as AuthRequest;
        expect(isPersonalSession(req)).toBe(true);
        expect(isPersonalSession(request({ authorization: `Bearer ${token}` }, '192.168.1.2'))).toBe(false);
        const next = vi.fn();
        const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
        requireAuth(req, res, next);
        expect(req.userId).toBe(PERSONAL_USER_ID);
        expect(next).toHaveBeenCalledOnce();
        next.mockClear();
        await requireSubscription(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});
