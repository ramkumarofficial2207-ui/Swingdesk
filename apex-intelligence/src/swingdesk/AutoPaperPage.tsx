import { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { apiJson } from '../lib/api';
import './auto-paper.css';

type Scorecard = {
  strategy: string; closed: number; targets: number; stops: number; expired: number;
  hitRate: number | null; avgNetPct: number | null; avgSessions: number | null;
  open: number; pending: number; skipped: number; verdict: string;
  vsNiftyPct?: number | null; vsControlPct?: number | null;
};
type PaperTrade = {
  id: string; strategy: string; symbol: string; signalDate: string; state: string; reason: string; signalClose: number;
  entryDate: string | null; entryPrice: number | null; exitDate: string | null; exitPrice: number | null; netPct: number | null; sessionsHeld: number | null;
};
export type AutoPaperView = {
  rules: { perStrategy: number; targetPct: number; stopPct: number; horizon: number; maxGapUpPct: number; costBps: number; verdictTrades: number; breakEvenHitRate: number };
  strategies: Record<string, string>;
  latestSignalDate: string | null;
  scorecards: Scorecard[];
  trades: PaperTrade[];
  lastRun: { at: string; ok: boolean; message: string } | null;
  running: boolean;
};

const NAMES: Record<string, string> = {
  TREND_PULLBACK: 'Trend pullback',
  SECTOR_MOMENTUM: 'Sector momentum',
  DELIVERY_OI: 'Delivery + OI',
  STRENGTH_PLUS_BUYING: 'Strength + buying',
  TOP5_HOLD: 'Top 5 · hold a month',
  TOP5_RATCHET: 'Top 5 · ratcheting stop',
  RANDOM5_HOLD: 'Random 5 · hold a month',
  RANDOM5_RATCHET: 'Random 5 · ratcheting stop',
};
const MONTHLY = new Set(['TOP5_HOLD', 'TOP5_RATCHET', 'RANDOM5_HOLD', 'RANDOM5_RATCHET']);
const STATE_LABEL: Record<string, string> = {
  PENDING: 'Waiting to enter', OPEN: 'Open', TARGET: 'Hit target', STOP: 'Stopped', EXPIRED: 'Time exit', SKIPPED_GAP: 'Skipped (gap up)',
};
const name = (s: string) => NAMES[s] ?? s;
const pct = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`);
const price = (v: number | null) => (v === null ? '—' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
const verdictClass = (v: string) => (v.startsWith('WORKING') ? 'working' : v.startsWith('NOT') ? 'failing' : 'collecting');

function MonthlyCard({ card, description }: { card: Scorecard; description: string }) {
  const isControl = card.strategy.startsWith('RANDOM');
  const progress = verdictProgress(card, 30);
  const tone = (v: number | null | undefined) => (v === null || v === undefined ? '' : v >= 0 ? 'sd-positive' : 'sd-negative');
  return (
    <section className={`sd-panel sd-ap-card ${isControl ? 'collecting' : verdictClass(card.verdict)}`} aria-label={`${name(card.strategy)} scorecard`}>
      <div className="sd-section-title"><h3>{name(card.strategy)}</h3><span className={`sd-ap-verdict ${isControl ? 'collecting' : verdictClass(card.verdict)}`}>{isControl ? 'Control' : card.verdict.startsWith('Collecting') ? 'Collecting' : card.verdict}</span></div>
      <p className="sd-ap-desc">{description}</p>
      <div className="sd-ap-figures">
        <div><span>Avg per trade</span><strong className={tone(card.avgNetPct)}>{pct(card.avgNetPct)}</strong><small>after costs</small></div>
        <div><span>vs NIFTY</span><strong className={tone(card.vsNiftyPct)}>{pct(card.vsNiftyPct ?? null)}</strong><small>same days</small></div>
        {isControl
          ? <div><span>Avg days held</span><strong>{card.avgSessions === null ? '—' : card.avgSessions.toFixed(1)}</strong><small>trading days</small></div>
          : <div><span>vs random 5</span><strong className={tone(card.vsControlPct)}>{pct(card.vsControlPct ?? null)}</strong><small>must be &gt; 0</small></div>}
      </div>
      {!isControl && <div className="sd-ap-progress" role="progressbar" aria-valuenow={card.closed} aria-valuemin={0} aria-valuemax={30} aria-label="Closed trades toward a verdict"><i style={{ width: `${progress}%` }} /></div>}
      <p className="sd-ap-counts">{card.closed}{isControl ? '' : '/30'} closed · {card.targets} hit target · {card.stops} stopped · {card.expired} time · {card.open} open · {card.pending} waiting</p>
    </section>
  );
}

/** Pure: progress toward a verdict, 0–100. */
export function verdictProgress(card: Scorecard, needed: number): number {
  return Math.min(100, Math.round((100 * card.closed) / Math.max(1, needed)));
}

function ScoreCard({ card, rules, description }: { card: Scorecard; rules: AutoPaperView['rules']; description: string }) {
  const progress = verdictProgress(card, rules.verdictTrades);
  return (
    <section className={`sd-panel sd-ap-card ${verdictClass(card.verdict)}`} aria-label={`${name(card.strategy)} scorecard`}>
      <div className="sd-section-title"><h3>{name(card.strategy)}</h3><span className={`sd-ap-verdict ${verdictClass(card.verdict)}`}>{card.verdict.startsWith('Collecting') ? 'Collecting' : card.verdict}</span></div>
      <p className="sd-ap-desc">{description}</p>
      <div className="sd-ap-figures">
        <div><span>Hit +{rules.targetPct}%</span><strong className={card.hitRate !== null && card.hitRate >= rules.breakEvenHitRate ? 'sd-positive' : ''}>{card.hitRate === null ? '—' : `${card.hitRate.toFixed(0)}%`}</strong><small>need ≥ {rules.breakEvenHitRate}%</small></div>
        <div><span>Avg per trade</span><strong className={(card.avgNetPct ?? 0) >= 0 ? 'sd-positive' : 'sd-negative'}>{pct(card.avgNetPct)}</strong><small>after costs</small></div>
        <div><span>Avg days held</span><strong>{card.avgSessions === null ? '—' : card.avgSessions.toFixed(1)}</strong><small>of {rules.horizon} max</small></div>
      </div>
      <div className="sd-ap-progress" role="progressbar" aria-valuenow={card.closed} aria-valuemin={0} aria-valuemax={rules.verdictTrades} aria-label="Closed trades toward a verdict"><i style={{ width: `${progress}%` }} /></div>
      <p className="sd-ap-counts">{card.closed}/{rules.verdictTrades} closed · {card.targets} hit · {card.stops} stopped · {card.expired} time · {card.open} open · {card.pending} waiting{card.skipped ? ` · ${card.skipped} skipped` : ''}</p>
    </section>
  );
}

export function AutoPaperPage({ ready, onOpenStock }: { ready: boolean; onOpenStock: (s: string) => void }) {
  const [view, setView] = useState<AutoPaperView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setView((await apiJson<{ data: AutoPaperView }>('/api/research/auto-paper')).data); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  const runNow = async () => {
    setRunning(true); setError(''); setMessage('');
    try { setMessage((await apiJson<{ data: { message: string } }>('/api/research/auto-paper/run', { method: 'POST' })).data.message); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  };
  useEffect(() => { if (ready) void load(); }, [ready]);

  const rules = view?.rules;
  const latest = view?.trades.filter(t => t.signalDate === view.latestSignalDate) ?? [];
  const trades = (view?.trades ?? []).filter(t => filter === 'ALL' || (filter === 'ACTIVE' ? ['OPEN', 'PENDING'].includes(t.state) : t.strategy === filter));

  return (
    <main className="sd-workspace sd-auto-paper">
      <div className="sd-workspace-heading">
        <div>
          <p className="sd-eyebrow">AUTO PAPER TRADING · NO ORDERS</p>
          <h1>Auto paper</h1>
          <p>Every evening the app picks the top {rules?.perStrategy ?? 3} stocks per strategy, enters them on paper at the next open and closes them by its rules. This is how we learn which strategy really works.</p>
        </div>
        <div className="sd-heading-actions">
          <button disabled={!ready || loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'sd-spin' : ''} />Refresh</button>
          <button className="sd-primary" disabled={!ready || running || view?.running} onClick={() => void runNow()}><Play size={15} className={running ? 'sd-spin' : ''} />{running || view?.running ? 'Updating…' : 'Update now'}</button>
        </div>
      </div>
      {error && <div className="sd-banner error" role="alert"><span>{error}</span></div>}
      {message && <div className="sd-banner" role="status"><span>{message}</span></div>}
      {!ready && <p className="sd-plan-help">Connect your workspace to load the paper record.</p>}

      {view && rules && <>
        <section className="sd-panel sd-desk-card sd-ap-monthly">
          <div className="sd-section-title"><h3>Monthly top 5 · trade less</h3><span>picked on the first trading day of each month</span></div>
          <p className="sd-ap-desc">Every stock is ranked by 12-1 momentum, residual momentum and its latest earnings surprise. Only the top 5 are taken (at most 2 per industry), next to 5 random stocks picked the same day. It works only if the top 5 beat both the random 5 and NIFTY after 30 closed trades.</p>
          <div className="sd-ap-grid">
            {view.scorecards.filter(c => MONTHLY.has(c.strategy)).map(card => <MonthlyCard key={card.strategy} card={card} description={view.strategies[card.strategy] ?? ''} />)}
          </div>
        </section>

        <h2 className="sd-ap-subhead">Daily strategies · +5% rule</h2>
        <section className="sd-panel sd-ap-rules">
          <div><span>Entry</span><strong>Next day's open</strong><small>skipped if it opens &gt; {rules.maxGapUpPct}% higher</small></div>
          <div><span>Target</span><strong className="sd-positive">+{rules.targetPct}%</strong></div>
          <div><span>Stop</span><strong className="sd-negative">−{rules.stopPct}%</strong></div>
          <div><span>Max hold</span><strong>{rules.horizon} trading days</strong></div>
          <div><span>Verdict after</span><strong>{rules.verdictTrades} closed trades</strong><small>works if ≥ {rules.breakEvenHitRate}% hit +{rules.targetPct}% and avg &gt; 0</small></div>
          <div><span>Evening update</span><strong>7:15 PM IST, weekdays</strong><small>{view.lastRun ? `${view.lastRun.ok ? 'last run' : 'last run failed'} ${new Date(view.lastRun.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'not run since the app started'}</small></div>
        </section>

        <div className="sd-ap-grid">
          {view.scorecards.filter(c => !MONTHLY.has(c.strategy)).map(card => <ScoreCard key={card.strategy} card={card} rules={rules} description={view.strategies[card.strategy] ?? ''} />)}
        </div>

        <section className="sd-panel sd-desk-card">
          <div className="sd-section-title"><h3>Latest picks</h3><span>{view.latestSignalDate ? `signals from the ${day(view.latestSignalDate)} close` : 'no picks yet'}</span></div>
          {latest.length ? (
            <div className="sd-table-wrap"><table>
              <thead><tr><th>Stock</th><th>Strategy</th><th>Why</th><th>Signal close</th><th>Status</th></tr></thead>
              <tbody>{latest.map(t => (
                <tr key={t.id}>
                  <td><button className="sd-text-button" onClick={() => onOpenStock(t.symbol)}>{t.symbol}</button></td>
                  <td>{name(t.strategy)}</td>
                  <td className="sd-ap-reason">{t.reason}</td>
                  <td>{price(t.signalClose)}</td>
                  <td><span className={`sd-ap-state ${t.state.toLowerCase()}`}>{STATE_LABEL[t.state] ?? t.state}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="sd-plan-help">No picks yet. Press “Update now” after the market data for the day is in.</p>}
        </section>

        <section className="sd-panel sd-desk-card">
          <div className="sd-section-title">
            <h3>All paper trades</h3>
            <label className="sd-ap-filter">Show
              <select aria-label="Filter paper trades" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="ALL">All ({view.trades.length})</option>
                <option value="ACTIVE">Open or waiting</option>
                {Object.keys(view.strategies).map(s => <option key={s} value={s}>{name(s)}</option>)}
              </select>
            </label>
          </div>
          {trades.length ? (
            <div className="sd-table-wrap"><table>
              <thead><tr><th>Signal</th><th>Stock</th><th>Strategy</th><th>Status</th><th>Entry</th><th>Exit</th><th>Result</th><th>Days</th></tr></thead>
              <tbody>{trades.map(t => (
                <tr key={t.id}>
                  <td>{day(t.signalDate)}</td>
                  <td><button className="sd-text-button" onClick={() => onOpenStock(t.symbol)}>{t.symbol}</button></td>
                  <td>{name(t.strategy)}</td>
                  <td><span className={`sd-ap-state ${t.state.toLowerCase()}`}>{STATE_LABEL[t.state] ?? t.state}</span></td>
                  <td>{price(t.entryPrice)}<small>{day(t.entryDate)}</small></td>
                  <td>{price(t.exitPrice)}<small>{day(t.exitDate)}</small></td>
                  <td className={t.netPct === null ? '' : t.netPct >= 0 ? 'sd-positive' : 'sd-negative'}>{pct(t.netPct)}</td>
                  <td>{t.sessionsHeld ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="sd-plan-help">No trades match this filter.</p>}
          <p className="sd-footnote">Results are after {rules.costBps / 100}% round-trip costs. A day that touches both the target and the stop counts as a stop. Paper results, not investment advice.</p>
        </section>
      </>}
    </main>
  );
}
