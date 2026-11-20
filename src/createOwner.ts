import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from './prismaClient';

/**
 * Create or update the owner account for the hosted app (registration is closed).
 * The password is typed at a hidden prompt (or read from SWINGDESK_OWNER_PASSWORD
 * when there is no terminal), so it never appears in shell history or in this file.
 *
 *   npm run user:owner -- --email=you@example.com [--name="Your name"]
 *
 * Point DATABASE_URL at the database you want (local or hosted) before running.
 */
/** Read a line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
    return new Promise(resolve => {
        const stdin = process.stdin;
        process.stdout.write(question);
        stdin.setRawMode?.(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let value = '';
        const onData = (chunk: string) => {
            for (const ch of chunk) {
                if (ch === '\r' || ch === '\n') {
                    stdin.setRawMode?.(false);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    resolve(value);
                    return;
                }
                if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
                if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
                else value += ch;
            }
        };
        stdin.on('data', onData);
    });
}

async function main(): Promise<void> {
    const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const email = arg('email')?.trim().toLowerCase();
    const name = arg('name') ?? 'Owner';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Pass --email=you@example.com');
    let password = process.env.SWINGDESK_OWNER_PASSWORD ?? '';
    if (!password && process.stdin.isTTY) {
        password = await askHidden('Password (at least 10 characters): ');
        if (password !== await askHidden('Repeat password: ')) throw new Error('The passwords do not match.');
    }
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
