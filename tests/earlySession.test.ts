import { describe, expect, it } from 'vitest';
import { Bar, EARLY_RULES, scoreEarlySession, StockSession } from '../src/earlySession';

const TIMES = [...EARLY_RULES.signalBars];

/** Six bars from 100: drift per bar, opening-range low `low`, volume per bar. */
function session(symbol: string, sector: string, opts: { drift?: number; volume?: number; baseline?: number | null; low?: number; lastClose?: number; missing?: string } = {}): StockSession {
    const drift = opts.drift ?? 0;
    const bars: Bar[] = TIMES.filter(time => time !== opts.missing).map((time, i) => {
        const open = 100 + drift * i;
        const close = i === TIMES.length - 1 && opts.lastClose ? opts.lastClose : open + drift;
        return { time, open, high: Math.max(open, close) + 0.05, low: i === 0 && opts.low ? opts.low : Math.min(open, close) - 0.05, close, volume: opts.volume ?? 100 };
    });
    return { symbol, sector, bars, baselineVolume: opts.baseline === undefined ? 600 : opts.baseline };
}

/** 200 slightly falling stocks over 50 sectors (like a 500-stock universe), so a 4-stock sector in the top 30 is over-represented. */
function background(): StockSession[] {
    return Array.from({ length: 200 }, (_, i) => session(`FLAT${i}`, `Sector${i % 50}`, { drift: -0.01 - (i % 7) * 0.001 }));
}

describe('early-session scan rules', () => {
    it('flags a clustered sector with 2x volume and an opening-range breakout', () => {
        const autos = [
            session('AUTO1', 'Auto', { drift: 0.2, volume: 300 }),
            session('AUTO2', 'Auto', { drift: 0.15, volume: 100 }),
            session('AUTO3', 'Auto', { drift: 0.15, volume: 100 }),
            session('AUTO4', 'Auto', { drift: 0.15, volume: 100 }),
        ];
        const result = scoreEarlySession([...background(), ...autos]);
        expect(result.withData).toBe(204);
        expect(result.clusters.map(c => c.sector)).toEqual(['Auto']);
        // Only AUTO1 has relative volume ≥ 2 (1,800 vs a 600 baseline).
        expect(result.setups.map(s => s.symbol)).toEqual(['AUTO1']);
        const setup = result.setups[0];
        expect(setup.relativeVolume).toBe(3);
        expect(setup.price945).toBeGreaterThan(setup.openingRangeHigh);
        expect(setup.stopPct).toBeLessThanOrEqual(EARLY_RULES.maxStopPct);
        expect(setup.target - setup.price945).toBeCloseTo(EARLY_RULES.targetR * (setup.price945 - setup.stop), 1);
        expect(setup.maxEntry).toBeCloseTo(setup.price945 * 1.003, 1);
    });

    it('ignores volume without a sector cluster', () => {
        const result = scoreEarlySession([...background(), session('LONE', 'Pharma', { drift: 0.3, volume: 500 })]);
        expect(result.clusters).toHaveLength(0);
        expect(result.setups).toHaveLength(0);
    });

    it('skips a setup whose opening-range stop is wider than the limit', () => {
        const autos = [
            session('WIDE', 'Auto', { drift: 0.2, volume: 300, low: 97 }),
            session('AUTO2', 'Auto', { drift: 0.15 }),
            session('AUTO3', 'Auto', { drift: 0.15 }),
            session('AUTO4', 'Auto', { drift: 0.15 }),
        ];
        const result = scoreEarlySession([...background(), ...autos]);
        expect(result.setups).toHaveLength(0);
        expect(result.skippedWideStop[0].symbol).toBe('WIDE');
        expect(result.skippedWideStop[0].stopPct).toBeGreaterThan(EARLY_RULES.maxStopPct);
    });

    it('needs all six bars and a volume baseline', () => {
        const autos = [
            session('NOBAR', 'Auto', { drift: 0.2, volume: 300, missing: '09:40' }),
            session('NOBASE', 'Auto', { drift: 0.2, volume: 300, baseline: null }),
            session('AUTO3', 'Auto', { drift: 0.15 }),
            session('AUTO4', 'Auto', { drift: 0.15 }),
            session('AUTO5', 'Auto', { drift: 0.15 }),
        ];
        const result = scoreEarlySession([...background(), ...autos]);
        expect(result.withData).toBe(204); // NOBAR dropped
        expect(result.setups.map(s => s.symbol)).not.toContain('NOBASE');
    });

    it('does not count the Unknown sector as a cluster', () => {
        const unknown = Array.from({ length: 5 }, (_, i) => session(`U${i}`, 'Unknown', { drift: 0.2, volume: 300 }));
        expect(scoreEarlySession([...background(), ...unknown]).clusters).toHaveLength(0);
    });
});
