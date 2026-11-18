import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, tx } = vi.hoisted(() => {
    const tx = {
        user: { findUniqueOrThrow: vi.fn() },
        trade: { findMany: vi.fn(), create: vi.fn() },
    };
    return { tx, db: { $transaction: vi.fn(), trade: { create: vi.fn() } } };
});
vi.mock('../src/prismaClient', () => ({ default: db }));
vi.mock('../src/newsIntel/service', () => ({ getTickerNewsDigest: vi.fn() }));
import { createTrade } from '../src/portfolioService';
import { PERSONAL_USER_ID } from '../src/personalWorkspace';

const limits = { tradingCapital: 100000, maxPositions: 5, maxRiskPct: 2, maxSectorConc: 2 };
const entry = { ticker: 'reliance', entryPrice: 1000, quantity: 10, stopLossInit: 990, target1: 1050, sector: 'Energy' };
const open = (cost: number, sector = 'Finance') => ({ status: 'OPEN', entryPrice: cost, quantity: 1, sector });
const closed = (pnlRs: number) => ({ status: 'CLOSED', entryPrice: 50000, quantity: 1, pnlRs });

describe('personal paper account limits', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
        tx.user.findUniqueOrThrow.mockResolvedValue(limits);
        tx.trade.findMany.mockResolvedValue([]);
        tx.trade.create.mockImplementation(async ({ data }) => ({ id: 'paper-entry', ...data }));
    });

    it('checks the owner account and inserts the entry inside serializable isolation', async () => {
        const result = await createTrade(PERSONAL_USER_ID, entry);
        expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: PERSONAL_USER_ID } });
        expect(tx.trade.findMany).toHaveBeenCalledWith({ where: { userId: PERSONAL_USER_ID } });
        expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
        expect(result).toEqual(expect.objectContaining({ userId: PERSONAL_USER_ID, ticker: 'RELIANCE', status: 'OPEN', initialRiskRs: 100, capitalDeployed: 10000 }));
        expect(db.trade.create).not.toHaveBeenCalled();
    });

    it('subtracts committed capital and realized losses before accepting a new entry', async () => {
        tx.trade.findMany.mockResolvedValue([open(40000), closed(-10000)]);
        await expect(createTrade(PERSONAL_USER_ID, { ...entry, quantity: 60 })).rejects.toThrow('Insufficient paper cash');
        expect(tx.trade.create).not.toHaveBeenCalled();
    });

    it('releases closed-trade capital and includes realized gains in available cash', async () => {
        tx.trade.findMany.mockResolvedValue([open(90000), closed(10000)]);
        await expect(createTrade(PERSONAL_USER_ID, { ...entry, quantity: 20 })).resolves.toHaveProperty('id', 'paper-entry');
    });

    it('rejects a paper entry above the per-trade risk limit despite sufficient cash', async () => {
        await expect(createTrade(PERSONAL_USER_ID, { ...entry, quantity: 100, stopLossInit: 970 })).rejects.toThrow('risk limit');
        expect(tx.trade.create).not.toHaveBeenCalled();
    });

    it('enforces position count using only currently open trades', async () => {
        tx.user.findUniqueOrThrow.mockResolvedValue({ ...limits, maxPositions: 1 });
        tx.trade.findMany.mockResolvedValue([open(1000), closed(500)]);
        await expect(createTrade(PERSONAL_USER_ID, entry)).rejects.toThrow('Maximum open positions');
        expect(tx.trade.create).not.toHaveBeenCalled();
    });

    it('blocks an extra position in a sector at its concentration limit', async () => {
        tx.user.findUniqueOrThrow.mockResolvedValue({ ...limits, maxSectorConc: 1 });
        tx.trade.findMany.mockResolvedValue([open(1000, 'Energy')]);
        await expect(createTrade(PERSONAL_USER_ID, entry)).rejects.toThrow('Sector position limit');
        expect(tx.trade.create).not.toHaveBeenCalled();
    });

    it('preserves the existing trade service path for other accounts', async () => {
        db.trade.create.mockResolvedValue({ id: 'existing-account-entry' });
        await expect(createTrade('existing-user', entry)).resolves.toHaveProperty('id', 'existing-account-entry');
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(db.trade.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'existing-user' }) });
    });
});
