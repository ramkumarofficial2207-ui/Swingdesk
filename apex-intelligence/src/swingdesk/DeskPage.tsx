import { useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiJson } from '../lib/api';
import { DESK, drawdownBrake, ExitAdviceView, GroupStats, journalStats, REGIME_COPY, RegimeView } from '../lib/desk';
import { Trade } from '../types';
import './desk.css';

const money = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`);
const ACTION_LABEL: Record<ExitAdviceView['action'], string> = { EXIT_STOP: 'Exit: stop', TAKE_HALF: 'Take half', TRAIL: 'Trail stop', TIME_EXIT: 'Exit: time', HOLD: 'Hold' };

/** Regime pill used in the header and the workspace banner. */
export function RegimePill({ regime }: { regime: RegimeView | null }) {
  if (!regime?.today) return <span className="sd-regime-pill unknown">Regime —</span>;
  return <span className={`sd-regime-pill ${regime.today.state.toLowerCase()}`} title={regime.today.reasons.join(' · ')}>{REGIME_COPY[regime.today.state].label}</span>;
}

/** Workspace banner: today's regime and what it allows. */
export function RegimeBanner({ regime }: { regime: RegimeView | null }) {
  if (!regime?.today) return null;
  const t = regime.today;
  return (
    <div className={`sd-regime-banner ${t.state.toLowerCase()}`} role="status">
      <RegimePill regime={regime} />
      <span><b>{REGIME_COPY[t.state].action}</b> {t.reasons.join(' · ')} · as of {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
    </div>
  );
}

function StatsTable({ title, rows }: { title: string; rows: GroupStats[] }) {
  return (
    <section className="sd-panel sd-desk-card">
      <div className="sd-section-title"><h3>{title}</h3><span>closed trades</span></div>
      {rows.length ? (
        <div className="sd-table-wrap"><table>
          <thead><tr><th>Group</th><th>Trades</th><th>Win rate</th><th>Avg win</th><th>Avg loss</th><th>Avg R</th><th>P&amp;L</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.key}><td>{r.key}</td><td>{r.n}</td><td>{r.winRate.toFixed(0)}%</td><td className="sd-positive">{pct(r.avgWinPct)}</td><td className="sd-negative">{pct(r.avgLossPct)}</td>
              <td className={(r.avgR ?? 0) >= 0 ? 'sd-positive' : 'sd-negative'}>{r.avgR === null ? '—' : `${r.avgR >= 0 ? '+' : ''}${r.avgR.toFixed(2)}R`}</td>
              <td className={r.totalRs >= 0 ? 'sd-positive' : 'sd-negative'}>{money(r.totalRs)}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <p className="sd-plan-help">No closed trades yet. Record paper trades from the Workspace or Morning tab; each one saves its setup and the market regime.</p>}
    </section>
  );
}

export function DeskPage({ ready, trades, capital, regime, onOpenStock }: { ready: boolean; trades: Trade[]; capital?: number; regime: RegimeView | null; onOpenStock: (s: string) => void }) {
  const [advice, setAdvice] = useState<ExitAdviceView[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { setAdvice((await apiJson<{ data: ExitAdviceView[] }>('/api/portfolio/exit-advice')).data || []); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (ready) void load(); }, [ready, trades.length]);

  const brake = capital ? drawdownBrake(trades, capital) : null;
  const open = trades.filter(t => t.status === 'OPEN');
  const closed = trades.filter(t => t.status === 'CLOSED');
  const overall = journalStats(trades, () => 'All closed trades');
  const history = regime?.history.slice(-120) ?? [];
  const counts = { GREEN: 0, AMBER: 0, RED: 0 };
  for (const d of history) counts[d.state] += 1;

  return (
    <main className="sd-workspace sd-desk">
      <div className="sd-workspace-heading">
        <div><p className="sd-eyebrow">TRADING DESK · RULES {`v1`}</p><h1>Desk</h1><p>Market conditions, open positions, exits and your record. Rules decide; nothing here places orders.</p></div>
        <div className="sd-heading-actions"><button disabled={!ready || loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'sd-spin' : ''} />Refresh</button></div>
      </div>
      {error && <div className="sd-banner error" role="alert"><span>{error}</span></div>}

      <div className="sd-desk-top">
        <section className={`sd-panel sd-desk-card sd-regime-card ${regime?.today?.state.toLowerCase() ?? ''}`}>
          <div className="sd-section-title"><h3>Market regime</h3><RegimePill regime={regime} /></div>
          {regime?.today ? <>
            <p className="sd-regime-action">{REGIME_COPY[regime.today.state].action}</p>
            <ul className="sd-reasons-plain">{regime.today.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            <div className="sd-regime-strip" aria-label="Regime, last 120 sessions">{history.map(d => <i key={d.date} className={d.state.toLowerCase()} title={`${d.date}: ${d.state}, ${d.breadthPct}%`} />)}</div>
            <p className="sd-footnote">Last 120 sessions: {counts.GREEN} green, {counts.AMBER} amber, {counts.RED} red. GREEN = NIFTY above its 50-day average and ≥ 50% of the top 500 above theirs; RED = NIFTY below its 200-day average or &lt; 35%. Untested until the regime backtest.</p>
          </> : <p className="sd-plan-help">Regime unavailable. Load NSE daily data.</p>}
        </section>

        <section className={`sd-panel sd-desk-card sd-brake-card ${brake?.active ? 'on' : ''}`}>
          <div className="sd-section-title"><h3>Drawdown brake</h3>{brake?.active ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}</div>
          {brake ? <>
            <p className="sd-regime-action">{brake.active ? `ON: no new trades${brake.until ? ` until ${new Date(brake.until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ' until equity recovers'}.` : 'Off. You may take new trades.'}</p>
            <div className="sd-plan-level"><span>Paper equity</span><strong>{money(brake.equity)}</strong></div>
            <div className="sd-plan-level"><span>Peak</span><strong>{money(brake.peak)}</strong></div>
            <div className="sd-plan-level"><span>Below peak</span><strong className={brake.drawdownPct >= DESK.drawdownBrakePct ? 'sd-negative' : ''}>{brake.drawdownPct.toFixed(2)}% (brake at {DESK.drawdownBrakePct}%)</strong></div>
          </> : <p className="sd-plan-help">Connect to load your capital.</p>}
        </section>
      </div>

      <section className="sd-panel sd-desk-card">
        <div className="sd-section-title"><h3>Open positions · exit assistant</h3><span>{open.length} open · from the latest NSE close</span></div>
        {open.length ? (
          <div className="sd-table-wrap"><table>
            <thead><tr><th>Stock</th><th>Entry</th><th>Last close</th><th>Gain</th><th>R now</th><th>Sessions</th><th>Do this</th><th>Stop to use</th></tr></thead>
            <tbody>{open.map(t => {
              const a = advice.find(x => x.tradeId === t.id);
              return (
                <tr key={t.id} className={a ? `sd-advice-${a.action.toLowerCase()}` : ''}>
                  <td><button className="sd-text-button" onClick={() => onOpenStock(t.ticker)}>{t.ticker}</button><small>{t.setupType}</small></td>
                  <td>₹{t.entryPrice.toLocaleString('en-IN')}</td>
                  <td>{a?.lastClose ? `₹${a.lastClose.toLocaleString('en-IN')}` : '—'}</td>
                  <td className={(a?.gainPct ?? 0) >= 0 ? 'sd-positive' : 'sd-negative'}>{pct(a?.gainPct)}</td>
                  <td>{a?.rNow == null ? '—' : `${a.rNow >= 0 ? '+' : ''}${a.rNow.toFixed(2)}R`}</td>
                  <td>{a?.sessionsHeld ?? '—'} / {DESK.timeStopSessions}</td>
                  <td><b>{a ? ACTION_LABEL[a.action] : '—'}</b><small>{a?.message}</small></td>
                  <td>{a ? `₹${a.suggestedStop.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <p className="sd-plan-help">No open positions.</p>}
      </section>

      <StatsTable title={`Your record (${closed.length} closed)`} rows={overall} />
      <div className="sd-desk-top">
        <StatsTable title="By setup" rows={journalStats(trades, t => t.setupType || 'Manual')} />
        <StatsTable title="By market regime at entry" rows={journalStats(trades, t => t.regimeAtEntry || 'Not recorded')} />
      </div>
    </main>
  );
}
