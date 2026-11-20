import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from './prismaClient';

/**
 * Create or update the owner account for the hosted app (registration is closed).
 * The password is read from the SWINGDESK_OWNER_PASSWORD environment variable so
 * it never appears in shell history or in this file.
 *
 *   SWINGDESK_OWNER_PASSWORD=... npm run user:owner -- --email=you@example.com [--name="Your name"]
 *
 * Point DATABASE_URL at the database you want (local or hosted) before running.
 */
async function main(): Promise<void> {
    const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const email = arg('email')?.trim().toLowerCase();
    const name = arg('name') ?? 'Owner';
    const password = process.env.SWINGDESK_OWNER_PASSWORD ?? '';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Pass --email=you@example.com');
    if (password.length < 10) throw new Error('Set SWINGDESK_OWNER_PASSWORD (at least 10 characters).');
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
        where: { email },
        update: { password: hash, subscriptionStatus: 'ACTIVE', subscriptionExpiry: null },
        create: { email, name, password: hash, subscriptionStatus: 'ACTIVE', tradingCapital: 100000, notifyBuySignals: false, notifyEmail: false },
        select: { id: true, email: true },
    });
    console.log(`[Owner] Ready: ${user.email} (${user.id}). Sign in with this email and the password you set.`);
}

main()
    .catch(error => { console.error('[Owner] failed:', error?.message ?? error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
