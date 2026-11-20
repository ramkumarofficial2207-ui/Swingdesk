import { describe, expect, it } from 'vitest';
import { PriceBar } from '../src/corporateActions';
import { pickDeliveryOi, pickSectorMomentum, progressAutoTrade, scorecard, StockSnapshot } from '../src/autoPaper';
import { aggregateFno, buildFnoUrl, parseFnoBhavcopy } from '../src/fnoBhavcopy';
import { computeSeriesIndicators } from '../src/research/momentumPullback';

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const bar = (n: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({ date: day(n), open: close, high: close + 1, low: close - 1, close, volume: 1000, ...extra });

describe('progressAutoTrade', () => {
    const base = () => Array.from({ length: 20 }, (_, n) => bar(n, 100));

    it('waits for the entry session, then stays open until an exit', () => {
        expect(progressAutoTrade(base().slice(0, 1), 0).state).toBe('PENDING');
        expect(progressAutoTrade(base().slice(0, 5), 0)).toMatchObject({ state: 'OPEN', entryPrice: 100 });
    });

    it('hits +5% before the stop', () => {
        const bars = base();
        bars[3] = bar(3, 104, { high: 105.5 });
        expect(progressAutoTrade(bars, 0)).toMatchObject({ state: 'TARGET', exitPrice: 105, netPct: expect.closeTo(4.6) });
    });

    it('stops at −2.5% and counts a bar touching both as the stop', () => {
        const bars = base();
        bars[2] = bar(2, 100, { high: 106, low: 97 });
        expect(progressAutoTrade(bars, 0)).toMatchObject({ state: 'STOP', exitPrice: 97.5 });
    });

    it('exits at the close of session 15 and skips gaps above 3%', () => {
        expect(progressAutoTrade(base(), 0)).toMatchObject({ state: 'EXPIRED', exitIndex: 15 });
        const gap = base();
        gap[1] = bar(1, 104, { open: 103.5 });
        expect(progressAutoTrade(gap, 0).state).toBe('SKIPPED_GAP');
    });
});

function stock(symbol: string, industry: string, changes: number[], extra: Partial<StockSnapshot> = {}): StockSnapshot {
    const closes = Array.from({ length: 80 }, (_, n) => 100 + n * 0.2);
    let last = closes[closes.length - 1];
    for (const change of changes) { last *= 1 + change / 100; closes.push(last); }
    const bars = closes.map((close, n) => bar(n, close, { high: close * 1.005, low: close * 0.99 }));
    return { symbol, industry, bars, ind: computeSeriesIndicators(bars), i: bars.length - 1, strength: 0.2, turnover20: 1, deliveryPct: null, avgDeliveryPct20: null, futOiChangePct: null, ...extra };
}

describe('pickers', () => {
    it('sector momentum needs ≥ 4 of an industry in the top 30 gainers, ranks by turnover, keeps 3', () => {
        const autos = Array.from({ length: 5 }, (_, k) => stock(`AUTO${k}`, 'Auto', [3 + k], { turnover20: k }));
        const others = Array.from({ length: 40 }, (_, k) => stock(`X${k}`, `S${k % 10}`, [k < 25 ? 2 : -1]));
        const picks = pickSectorMomentum([...autos, ...others]);
        expect(picks.map(p => p.symbol)).toEqual(['AUTO4', 'AUTO3', 'AUTO2']);
    });

    it('delivery + OI needs a strong close, 1.5× delivery and futures OI up 3%', () => {
        const good = stock('GOOD', 'X', [2], { deliveryPct: 60, avgDeliveryPct20: 30, futOiChangePct: 5 });
        const lowOi = stock('LOWOI', 'X', [2], { deliveryPct: 60, avgDeliveryPct20: 30, futOiChangePct: 1 });
        const noFno = stock('NOFNO', 'X', [2], { deliveryPct: 60, avgDeliveryPct20: 30 });
        const normalDelivery = stock('NORMAL', 'X', [2], { deliveryPct: 35, avgDeliveryPct20: 30, futOiChangePct: 5 });
        expect(pickDeliveryOi([good, lowOi, noFno, normalDelivery]).map(p => p.symbol)).toEqual(['GOOD']);
    });
});

describe('scorecard', () => {
    it('waits for 30 closed trades, then needs a 40% hit rate and a positive average', () => {
        const trades = (targets: number, stops: number) => [
            ...Array.from({ length: targets }, () => ({ state: 'TARGET', netPct: 4.6, sessionsHeld: 6 })),
            ...Array.from({ length: stops }, () => ({ state: 'STOP', netPct: -2.9, sessionsHeld: 4 })),
            { state: 'OPEN', netPct: null, sessionsHeld: 2 },
        ];
        expect(scorecard('DELIVERY_OI', trades(5, 5)).verdict).toBe('Collecting (10/30 closed)');
        expect(scorecard('DELIVERY_OI', trades(14, 16))).toMatchObject({ verdict: 'WORKING on paper', open: 1 });
        expect(scorecard('DELIVERY_OI', trades(9, 21)).verdict).toBe('NOT WORKING');
    });
});

describe('F&O Bhavcopy', () => {
    it('builds both archive URLs', () => {
        expect(buildFnoUrl('2023-11-17')).toBe('https://nsearchives.nseindia.com/content/historical/DERIVATIVES/2023/NOV/fo17NOV2023bhav.csv.zip');
        expect(buildFnoUrl('2026-11-19')).toBe('https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_20261119_F_0000.csv.zip');
    });

    it('aggregates legacy futures over expiries and options by side', () => {
        const csv = [
            'INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP,',
            'FUTSTK,ABC,30-Nov-2023,0,XX,1,1,1,101,101,10,1,1000,100,17-NOV-2023,',
            'FUTSTK,ABC,28-Dec-2023,0,XX,1,1,1,102,102,5,1,500,-50,17-NOV-2023,',
            'OPTSTK,ABC,30-Nov-2023,100,CE,1,1,1,5,5,3,1,200,20,17-NOV-2023,',
            'OPTSTK,ABC,30-Nov-2023,100,PE,1,1,1,5,5,3,1,300,-30,17-NOV-2023,',
        ].join('\n');
        const { tradingDate, contracts } = parseFnoBhavcopy(csv);
        expect(tradingDate).toBe('2023-11-17');
        expect(aggregateFno(tradingDate!, contracts)).toEqual([{
            symbol: 'ABC', tradingDate: '2023-11-17', isIndex: false, futOi: 1500, futOiChange: 50, futContracts: 15,
            nearExpiry: '2023-11-30', nearFutClose: 101, callOi: 200, putOi: 300, callOiChange: 20, putOiChange: -30,
        }]);
    });

    it('reads the UDiFF format', () => {
        const csv = [
            'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4',
            '2026-11-19,2026-11-19,FO,NSE,STF,1,,ABC,,2026-11-23,2026-11-23,,,ABC26NOVFUT,1,1,1,373,1,1,1,1,4700,-2100,62,1,1,F1,500,,,,,',
            '2026-11-19,2026-11-19,FO,NSE,IDF,2,,NIFTY,,2026-11-23,2026-11-23,,,NIFTY26NOVFUT,1,1,1,25533,1,1,1,1,900,80,12,1,1,F1,75,,,,,',
        ].join('\n');
        const { tradingDate, contracts } = parseFnoBhavcopy(csv);
        const rows = aggregateFno(tradingDate!, contracts);
        expect(rows.find(r => r.symbol === 'ABC')).toMatchObject({ futOi: 4700, futOiChange: -2100, futContracts: 62, nearFutClose: 373, isIndex: false });
        expect(rows.find(r => r.symbol === 'NIFTY')?.isIndex).toBe(true);
    });
});
