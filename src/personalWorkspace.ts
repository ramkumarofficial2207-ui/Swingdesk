import { randomBytes } from 'crypto';
import { Request } from 'express';
import prisma from './prismaClient';

export const PERSONAL_USER_ID = 'e58b2d72-4d01-4cb0-9347-33bf3fb6d490';
const sessionToken = randomBytes(32).toString('hex');
export const personalMode = () => process.env.SWINGDESK_PERSONAL_MODE === 'true' && process.env.NODE_ENV !== 'production';
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(host);
export function isLocalWorkspaceRequest(req: Request): boolean {
    if (!personalMode() || !loopback(req.socket.remoteAddress || '')) return false;
    try {
        if (!loopback(new URL(`http://${req.headers.host}`).hostname)) return false;
        if (req.headers.origin && !loopback(new URL(req.headers.origin).hostname)) return false;
        return true;
    } catch { return false; }
}
export function isPersonalSession(req: Request): boolean {
    return isLocalWorkspaceRequest(req) && req.headers.authorization === `Bearer ${sessionToken}`;
}
export async function openPersonalWorkspace() {
    const user = await prisma.user.upsert({
        where: { id: PERSONAL_USER_ID }, update: {},
        create: { id: PERSONAL_USER_ID, email: 'personal-workspace@swingdesk.invalid', name: 'Personal workspace',
            password: `disabled:${randomBytes(48).toString('hex')}`, tradingCapital: 100000,
            notifyBuySignals: false, notifyEmail: false },
        select: { id: true, name: true, tradingCapital: true, maxRiskPct: true, maxPositions: true, maxSectorConc: true },
    });
    return { user, token: sessionToken, mode: 'personal' };
}
