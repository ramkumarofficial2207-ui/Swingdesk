import { describe, expect, it } from 'vitest';
import { DealRow, institutionalBuyEvents, isInstitution } from '../src/research/cards/institutionalBuys';

describe('isInstitution', () => {
    it('accepts long-only funds and rejects trading desks', () => {
        expect(isInstitution('SBI MUTUAL FUND', false)).toBe(true);
        expect(isInstitution('NORGES BANK ON ACCOUNT OF THE GOVERNMENT PENSION FUND GLOBAL', false)).toBe(true);
        expect(isInstitution('ICICI PRUDENTIAL LIFE INSURANCE COMPANY LIMITED', false)).toBe(true);
        expect(isInstitution('GRAVITON RESEARCH CAPITAL LLP', false)).toBe(false);
        expect(isInstitution('BNP PARIBAS ARBITRAGE', false)).toBe(false);
        expect(isInstitution('QE SECURITIES LLP', false)).toBe(false);
        expect(isInstitution('ANKITA VISHAL SHAH', false)).toBe(false);
    });

    it('drops passive index funds in the active-only variant', () => {
        const vanguard = 'THE VANGUARD GROUP INC A/C VANGUARD EMERG. MKTS STOCK INDEXFD';
        expect(isInstitution(vanguard, false)).toBe(true);
        expect(isInstitution(vanguard, true)).toBe(false);
        expect(isInstitution('HDFC MUTUAL FUND', true)).toBe(true);
    });
});

describe('institutionalBuyEvents', () => {
    const deal = (clientName: string, dealType: string, totalValue: number, symbol = 'ABC', tradeDate = '2024-02-01'): DealRow => ({ symbol, clientName, tradeDate, dealType, totalValue });

    it('nets each institution\'s buys and sells and keeps net buyers of at least 5 crore', () => {
        const events = institutionalBuyEvents([
            deal('SBI MUTUAL FUND', 'BUY', 12), deal('SBI MUTUAL FUND', 'SELL', 4), // net 8
            deal('HDFC MUTUAL FUND', 'BUY', 6), deal('HDFC MUTUAL FUND', 'SELL', 3), // net 3: too small
            deal('GRAVITON RESEARCH CAPITAL LLP', 'BUY', 500), // not an institution
            deal('KOTAK MAHINDRA MUTUAL FUND', 'BUY', 7, 'XYZ'),
        ], false);
        expect(events.get('ABC|2024-02-01')).toBe(8);
        expect(events.get('XYZ|2024-02-01')).toBe(7);
        expect(events.size).toBe(2);
    });

    it('adds up several qualifying institutions in one stock-day', () => {
        const events = institutionalBuyEvents([deal('SBI MUTUAL FUND', 'BUY', 6), deal('GOVERNMENT OF SINGAPORE', 'BUY', 9)], false);
        expect(events.get('ABC|2024-02-01')).toBe(15);
    });
});
