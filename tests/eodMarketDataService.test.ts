import { describe, expect, it } from 'vitest';
import {
    buildNseBhavcopyUrl,
    buildNseDeliveryUrl,
    buildNseIndexReportUrl,
    buildNseLegacyBhavcopyUrl,
    parseNseDeliveryReport,
    parseNseIndexReport,
    parseNseLegacyBhavcopy,
    parseNseUdiffBhavcopy,
} from '../src/eodMarketDataService';

describe('finalized NSE EOD ingestion', () => {
    it('builds current official NSE report URLs', () => {
        const date = new Date('2026-08-07T00:00:00.000Z');
        expect(buildNseBhavcopyUrl(date)).toContain('BhavCopy_NSE_CM_0_0_0_20260807_F_0000.csv.zip');
        expect(buildNseDeliveryUrl(date)).toContain('MTO_07082026.DAT');
        expect(buildNseIndexReportUrl(date)).toContain('ind_close_all_07082026.csv');
        expect(buildNseLegacyBhavcopyUrl(new Date('2023-01-02T00:00:00.000Z')))
            .toContain('/2023/JAN/cm02JAN2023bhav.csv.zip');
    });

    it('parses EQ delivery rows and ignores other series', () => {
        const report = [
            'Security Wise Delivery Position - Compulsory Rolling Settlement',
            '20,1,RELIANCE,EQ,1000,700,70.00',
            '20,2,TESTBE,BE,100,80,80.00',
        ].join('\n');
        const rows = parseNseDeliveryReport(report);
        expect(rows.get('RELIANCE')).toEqual({ quantity: 700, percentage: 70 });
        expect(rows.has('TESTBE')).toBe(false);
    });

    it('parses finalized UDiFF OHLCV and merges delivery data', () => {
        const csv = [
            'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,OpnPric,HghPric,LwPric,ClsPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd',
            '2026-08-07,2026-08-07,CM,NSE,STK,2885,INE002A01018,RELIANCE,EQ,1400,1450,1390,1440,1395,1000000,1440000000,250000',
            '2026-08-07,2026-08-07,CM,NSE,STK,999,TEST,IGNORED,BE,10,11,9,10,10,100,1000,10',
        ].join('\n');
        const delivery = new Map([['RELIANCE', { quantity: 650000, percentage: 65 }]]);
        const rows = parseNseUdiffBhavcopy(csv, delivery);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            symbol: 'RELIANCE',
            securityId: '2885',
            tradingDate: '2026-08-07',
            close: 1440,
            volume: 1000000,
            turnoverCr: 144,
            totalTrades: 250000,
            deliveryQty: 650000,
            deliveryPct: 65,
        });
    });

    it('parses legacy EQ Bhavcopy rows and delivery data', () => {
        const csv = [
            'SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN',
            'RELIANCE,EQ,2500,2550,2490,2540,2539,2495,1000000,2540000000,02-Jan-23,100000,INE002A01018',
            'TESTBE,BE,10,11,9,10,10,10,100,1000,02-JAN-2023,10,TEST',
        ].join('\n');
        const delivery = new Map([['RELIANCE', { quantity: 700000, percentage: 70 }]]);
        const rows = parseNseLegacyBhavcopy(csv, delivery);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            source: 'NSE_LEGACY',
            symbol: 'RELIANCE',
            tradingDate: '2023-01-02',
            close: 2540,
            turnoverCr: 254,
            totalTrades: 100000,
            deliveryQty: 700000,
        });
    });

    it('parses the official NIFTY 50 daily index row', () => {
        const csv = [
            'Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.)',
            'Nifty 50,02-01-2023,18131.7,18215.15,18086.5,18197.45,92.15,.51,256073979,11793.06',
        ].join('\n');
        expect(parseNseIndexReport(csv)[0]).toMatchObject({
            source: 'NSE_INDEX',
            symbol: 'NIFTY_50',
            tradingDate: '2023-01-02',
            close: 18197.45,
            volume: 256073979,
        });
        expect(parseNseIndexReport(csv.replace('02-01-2023', '04-06-2023'), '2023-04-06')[0].tradingDate)
            .toBe('2023-04-06');
    });
});
