import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, Sunrise } from 'lucide-react';
import { apiJson } from '../lib/api';
import { positionSize } from '../lib/setupTrust';
import './morning.css';

interface EarlySetup {
  symbol: string; sector: string; relativeVolume: number; returnPct: number; price945: number;
  openingRangeHigh: number; maxEntry: number; stop: number; stopPct: number; target: number; targetPct: number;
}
interface EarlyResult {
  version: string; date: string; generatedAt: string; mode: 'LIVE' | 'REPLAY'; universe: number; withData: number;
  clusters: Array<{ sector: string; inTop: number; universeShare: number; topShare: number }>;
  setups: EarlySetup[]; skippedWideStop: Array<{ symbol: string; stopPct: number }>; note?: string;
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const istNow = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString();

/** Morning 9:45 tab: the early-session scan (research only until its history test passes). */
export function MorningSession({ ready, capital, maxRiskPct, availableCash, onOpenStock }: {
  ready: boolean; capital?: number; maxRiskPct?: number; availableCash?: number; onOpenStock: (symbol: string) => void;
}) {
  const [result, setResult] = useState<EarlyResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [replayDate, setReplayDate] = useState('');
  const today = istNow().slice(0, 10);
  const time = istNow().slice(11, 16);
  const weekday = ![0, 6].includes(new Date(`${today}T00:00:00Z`).getUTCDay());
  const liveWindow = weekday && time >= '09:45' && time < '15:10';

  const load = useCallback(async () => {
    try { setResult((await apiJson<{ data: EarlyResult | null }>('/api/research/early-session')).data); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { if (ready) void load(); }, [ready, load]);

  async function run(date?: string) {
    setRunning(true); setError('');
    try {
      const r = await apiJson<{ data: EarlyResult }>('/api/research/early-session/run', { method: 'POST', body: JSON.stringify(date ? { date } : {}) });
      setResult(r.data);
    } catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  }

  const isToday = result?.date === today;
  return (
    <main className="sd-workspace sd-morning">
      <div className="sd-workspace-heading">
        <div>
          <p className="sd-eyebrow">EARLY SESSION · INTRADAY</p>
          <h1>Morning 9:45<span className="sd-trust-pill research_only">Research only</span></h1>
          <p>Stocks with unusual opening volume, in a sector moving together, that broke their 9:15–9:30 range. Exit the same day by 15:10.</p>
        </div>
        <div className="sd-heading-actions">
          <button disabled={!ready || running} onClick={() => void load()}><RefreshCw size={15} />Reload</button>
          <button className="sd-primary" disabled={!ready || running || !liveWindow} title={liveWindow ? '' : 'Runs on trading days between 09:45 and 15:10 IST'} onClick={() => void run()}>
            <Play size={15} />{running ? 'Scanning 500 stocks…' : 'Run 9:45 scan'}
          </button>
        </div>
      </div>

      {error && <div className="sd-banner error" role="alert"><span>{error}</span></div>}

      <div className="sd-morning-grid">
        <section className="sd-panel sd-morning-main">
          <div className="sd-section-title">
            <h3>{result ? `${isToday ? 'Today' : result.date} · ${result.setups.length} setup${result.setups.length === 1 ? '' : 's'}` : 'No scan yet'}</h3>
            {result && <span>{result.mode === 'REPLAY' ? 'Replay of stored data' : 'Live'} · {result.withData} of {result.universe} stocks with full 9:15–9:45 data · {new Date(result.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {!result ? (
            <div className="sd-empty"><Sunrise size={28} /><p>On a trading day, press <b>Run 9:45 scan</b> at or after 09:45 IST. It takes about two minutes to read 500 stocks.</p></div>
          ) : result.setups.length === 0 ? (
            <div className="sd-empty">
              <p><b>No early-session setup {isToday ? 'today' : 'on this day'}.</b></p>
              <p>{result.clusters.length ? `Sectors moving together: ${result.clusters.map(c => c.sector).join(', ')}, but no stock passed volume, breakout and the 1.25% stop limit together.` : 'No sector had 4 or more stocks among the top 30 gainers.'}</p>
            </div>
          ) : (
            <div className="sd-table-wrap">
              <table>
                <thead><tr><th>Stock</th><th>Volume vs usual</th><th>Up since open</th><th>9:45 price</th><th>Buy up to</th><th>Stop</th><th>Target</th><th>Shares</th><th>Exit</th></tr></thead>
                <tbody>
                  {result.setups.map(s => {
                    const size = capital && maxRiskPct ? positionSize({ capital, maxRiskPct, entry: s.maxEntry, stop: s.stop, availableCash }) : null;
                    return (
                      <tr key={s.symbol}>
                        <td><button className="sd-text-button" onClick={() => onOpenStock(s.symbol)}>{s.symbol}</button><small>{s.sector}</small></td>
                        <td>{s.relativeVolume.toFixed(1)}×</td>
                        <td className="sd-positive">+{s.returnPct.toFixed(2)}%</td>
                        <td>{money(s.price945)}</td>
                        <td>{money(s.maxEntry)}<small>skip if higher</small></td>
                        <td className="sd-negative">{money(s.stop)}<small>−{s.stopPct.toFixed(2)}%</small></td>
                        <td className="sd-positive">{money(s.target)}<small>+{s.targetPct.toFixed(2)}%</small></td>
                        <td>{size ? size.shares.toLocaleString('en-IN') : '—'}{size && <small>risk {money(size.riskAmount)}</small>}</td>
                        <td>15:10</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {result?.note && <p className="sd-footnote">{result.note}</p>}
          {result && result.skippedWideStop.length > 0 && (
            <p className="sd-footnote">Passed volume, sector and breakout but skipped because the stop was wider than 1.25%: {result.skippedWideStop.map(s => `${s.symbol} (${s.stopPct.toFixed(2)}%)`).join(', ')}.</p>
          )}
        </section>

        <aside className="sd-right-column">
          <section className="sd-panel sd-plan">
            <div className="sd-section-title"><h3>Sectors moving together</h3><span className="sd-outline-pill">TOP 30</span></div>
            {result?.clusters.length ? result.clusters.map(c => (
              <div className="sd-plan-level" key={c.sector}><span>{c.sector}</span><strong>{c.inTop} of top 30 · {(c.topShare / Math.max(c.universeShare, 0.0001)).toFixed(1)}× usual</strong></div>
            )) : <p className="sd-plan-help">None yet. A sector counts when 4+ of its stocks are in the top 30 gainers at 9:45 and it is 3× over-represented.</p>}
          </section>
          <section className="sd-panel sd-plan">
            <div className="sd-section-title"><h3>Rules (frozen, v1)</h3></div>
            <ul className="sd-morning-rules">
              <li>Volume 9:15–9:45 at least 2× its 20-day usual for that half hour.</li>
              <li>Sector has 4+ stocks in the top 30 gainers, 3× its normal share.</li>
              <li>9:45 price above the 9:15–9:30 high.</li>
              <li>Buy at 9:50, no more than 0.3% above the 9:45 price.</li>
              <li>Stop at the 9:15–9:30 low; skip if more than 1.25% away.</li>
              <li>Target 1.5× the risk. Exit everything by 15:10.</li>
            </ul>
            <p className="sd-footnote">Not yet tested on history. Paper trade only. Intraday costs are about 0.1% plus slippage, so it needs to win about 45% of the time to break even.</p>
          </section>
          <section className="sd-panel sd-plan">
            <div className="sd-section-title"><h3>Replay a past day</h3></div>
            <p className="sd-plan-help">Runs the same rules on stored 5-minute data.</p>
            <div className="sd-morning-replay">
              <input type="date" aria-label="Replay date" value={replayDate} max={today} onChange={e => setReplayDate(e.target.value)} />
              <button disabled={!ready || running || !replayDate} onClick={() => void run(replayDate)}>Replay</button>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
