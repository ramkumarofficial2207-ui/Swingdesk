import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, PenLine, X } from 'lucide-react';
import { apiJson } from '../lib/api';
import './journal.css';

interface JournalTrade {
  id: string;
  ticker: string;
  setupType: string;
  status: 'OPEN' | 'CLOSED';
  entryDate: string;
  exitDate: string | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  stopLossInit: number;
  pnlRs: number | null;
  rMultiple: number | null;
  daysHeld: number | null;
  plannedEntry: number | null;
  entryReason: string | null;
  emotionAtEntry: string | null;
  followedPlan: boolean | null;
  mistakes: string[];
  grade: string | null;
  lesson: string | null;
  reviewedAt: string | null;
  maxFavorablePrice: number | null;
}

interface GroupStat { key: string; trades: number; avgR: number; totalR: number; winRate: number }

interface JournalStats {
  closed: number;
  open: number;
  reviewed: number;
  winRate: number | null;
  avgR: number | null;
  totalPnlRs: number;
  profitFactor: number | null;
  maxDrawdownR: number;
  longestLosingStreak: number;
  avgEntrySlippagePct: number | null;
  avgCaptureOfBestMovePct: number | null;
  followedPlan: GroupStat | null;
  brokePlan: GroupStat | null;
  byMistake: GroupStat[];
  bySetup: GroupStat[];
  byEmotion: GroupStat[];
  insights: string[];
}

interface JournalData { trades: JournalTrade[]; stats: JournalStats; mistakeTags: string[]; emotions: string[] }

const label = (value: string) => /^(FOMO)$/.test(value) ? value : value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
const money = (value: number | null | undefined) => typeof value === 'number' ? `${value < 0 ? '−' : ''}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';
const rText = (value: number | null | undefined) => typeof value === 'number' ? `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}R` : '—';
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';

function Stat({ name, value, tone }: { name: string; value: string; tone?: 'up' | 'down' }) {
  return <div className="sd-j-stat"><span>{name}</span><strong className={tone === 'up' ? 'sd-positive' : tone === 'down' ? 'sd-negative' : ''}>{value}</strong></div>;
}

function GroupTable({ title, rows, empty, raw = false }: { title: string; rows: GroupStat[]; empty: string; raw?: boolean }) {
  return (
    <section className="sd-panel sd-j-card">
      <h3>{title}</h3>
      {rows.length ? (
        <table>
          <thead><tr><th></th><th>Trades</th><th>Avg</th><th>Total</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.key}><td>{raw ? row.key : label(row.key)}</td><td>{row.trades}</td><td className={row.avgR >= 0 ? 'sd-positive' : 'sd-negative'}>{rText(row.avgR)}</td><td>{rText(row.totalR)}</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="sd-j-empty">{empty}</p>}
    </section>
  );
}

function ReviewDialog({ trade, data, onClose, onSaved }: { trade: JournalTrade; data: JournalData; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mistakes, setMistakes] = useState<string[]>(trade.mistakes);
  const [followed, setFollowed] = useState<boolean | null>(trade.followedPlan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  const toggle = (tag: string) => setMistakes(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    setSaving(true);
    setError('');
    try {
      await apiJson(`/api/journal/trades/${trade.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          entryReason: text('entryReason'),
          emotionAtEntry: text('emotionAtEntry') || null,
          followedPlan: followed,
          mistakes,
          grade: text('grade') || null,
          lesson: text('lesson'),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="sd-dialog sd-j-dialog" onCancel={e => { e.preventDefault(); onClose(); }}>
      <div className="sd-dialog-head"><h2>Review {trade.ticker}</h2><button className="sd-icon" aria-label="Close review" onClick={onClose}><X size={18} /></button></div>
      <p className="sd-dialog-description">
        {trade.setupType} · entry {money(trade.entryPrice)}{trade.plannedEntry ? ` (planned ${money(trade.plannedEntry)})` : ''}
        {trade.status === 'CLOSED' ? ` · result ${rText(trade.rMultiple)}` : ' · still open'}
      </p>
      <form onSubmit={save}>
        <label className="sd-j-field">Why did you take this trade?
          <textarea name="entryReason" rows={2} maxLength={1000} defaultValue={trade.entryReason ?? ''} placeholder="The setup, the level, what had to happen" />
        </label>
        <div className="sd-j-row">
          <label className="sd-j-field">How did you feel at entry?
            <select name="emotionAtEntry" defaultValue={trade.emotionAtEntry ?? ''}>
              <option value="">Not recorded</option>
              {data.emotions.map(emotion => <option key={emotion} value={emotion}>{label(emotion)}</option>)}
            </select>
          </label>
          <label className="sd-j-field">Self-grade
            <select name="grade" defaultValue={trade.grade ?? ''}>
              <option value="">Not graded</option>
              <option value="A">A — textbook</option>
              <option value="B">B — minor slips</option>
              <option value="C">C — should not have traded</option>
            </select>
          </label>
        </div>
        <fieldset className="sd-j-field">
          <legend>Did you follow your plan?</legend>
          <div className="sd-j-choice">
            <button type="button" aria-pressed={followed === true} onClick={() => setFollowed(true)}>Yes</button>
            <button type="button" aria-pressed={followed === false} onClick={() => setFollowed(false)}>No</button>
            <button type="button" aria-pressed={followed === null} onClick={() => setFollowed(null)}>Not sure</button>
          </div>
        </fieldset>
        <fieldset className="sd-j-field">
          <legend>Mistakes (if any)</legend>
          <div className="sd-j-tags">
            {data.mistakeTags.map(tag => (
              <button type="button" key={tag} aria-pressed={mistakes.includes(tag)} onClick={() => toggle(tag)}>
                {mistakes.includes(tag) && <Check size={12} />}{label(tag)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="sd-j-field">Lesson for next time
          <textarea name="lesson" rows={2} maxLength={2000} defaultValue={trade.lesson ?? ''} placeholder="One sentence you want to remember" />
        </label>
        {error && <p className="sd-inline-error">{error}</p>}
        <div className="sd-dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="sd-primary" disabled={saving}>{saving ? 'Saving…' : 'Save review'}</button>
        </div>
      </form>
    </dialog>
  );
}

export function Journal() {
  const [data, setData] = useState<JournalData>();
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState<JournalTrade>();

  const load = useCallback(async () => {
    try {
      const response = await apiJson<{ data: JournalData }>('/api/journal');
      setData(response.data);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="sd-workspace"><p className="sd-inline-error">Journal unavailable: {error}</p></main>;
  if (!data) return <main className="sd-workspace"><p className="sd-j-empty">Loading your journal…</p></main>;
  const { stats, trades } = data;
  const toReview = trades.filter(trade => trade.status === 'CLOSED' && !trade.reviewedAt).length;

  return (
    <main className="sd-workspace sd-journal">
      <div className="sd-workspace-heading">
        <div>
          <p className="sd-eyebrow">TRADE JOURNAL</p>
          <h1><BookOpen size={22} /> What actually works for you</h1>
          <p>Plan against actual, mistakes and lessons. Review every closed trade; patterns appear after 20–30.</p>
        </div>
        {toReview > 0 && <span className="sd-outline-pill">{toReview} closed trade{toReview === 1 ? '' : 's'} to review</span>}
      </div>

      <section className="sd-panel sd-j-stats">
        <Stat name="Closed trades" value={String(stats.closed)} />
        <Stat name="Win rate" value={stats.winRate === null ? '—' : `${stats.winRate}%`} />
        <Stat name="Average result" value={rText(stats.avgR)} tone={stats.avgR === null ? undefined : stats.avgR >= 0 ? 'up' : 'down'} />
        <Stat name="Profit factor" value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)} />
        <Stat name="Total P&L" value={money(stats.totalPnlRs)} tone={stats.totalPnlRs >= 0 ? 'up' : 'down'} />
        <Stat name="Max drawdown" value={`${stats.maxDrawdownR.toFixed(1)}R`} />
        <Stat name="Losing streak" value={String(stats.longestLosingStreak)} />
        <Stat name="Entry vs plan" value={stats.avgEntrySlippagePct === null ? '—' : `${stats.avgEntrySlippagePct >= 0 ? '+' : ''}${stats.avgEntrySlippagePct}%`} />
      </section>

      <div className="sd-j-grid">
        <section className="sd-panel sd-j-card sd-j-insights">
          <h3>Insights</h3>
          {stats.insights.length ? <ul>{stats.insights.map(text => <li key={text}>{text}</li>)}</ul> : <p className="sd-j-empty">No patterns yet.</p>}
        </section>
        <section className="sd-panel sd-j-card">
          <h3>Plan discipline</h3>
          {stats.followedPlan || stats.brokePlan ? (
            <div className="sd-j-discipline">
              <div><span>Followed plan</span><strong className="sd-positive">{rText(stats.followedPlan?.avgR)}</strong><small>{stats.followedPlan?.trades ?? 0} trade{stats.followedPlan?.trades === 1 ? '' : 's'}</small></div>
              <div><span>Broke plan</span><strong className="sd-negative">{rText(stats.brokePlan?.avgR)}</strong><small>{stats.brokePlan?.trades ?? 0} trade{stats.brokePlan?.trades === 1 ? '' : 's'}</small></div>
            </div>
          ) : <p className="sd-j-empty">Review closed trades and mark whether you followed your plan.</p>}
        </section>
      </div>

      <div className="sd-j-grid sd-j-grid-3">
        <GroupTable title="Cost of mistakes" rows={stats.byMistake} empty="No mistakes tagged yet." />
        <GroupTable title="By setup" rows={stats.bySetup} empty="No closed trades yet." raw />
        <GroupTable title="By emotion at entry" rows={stats.byEmotion} empty="Record how you felt at entry." />
      </div>

      <section className="sd-panel sd-j-card">
        <h3>Trades</h3>
        {trades.length ? (
          <div className="sd-table-wrap">
            <table>
              <thead><tr><th>Stock</th><th>Setup</th><th>Entry</th><th>vs plan</th><th>Result</th><th>Days</th><th>Plan</th><th>Mistakes</th><th></th></tr></thead>
              <tbody>{trades.map(trade => {
                const slip = trade.plannedEntry ? ((trade.entryPrice - trade.plannedEntry) / trade.plannedEntry) * 100 : null;
                return (
                  <tr key={trade.id}>
                    <td><strong>{trade.ticker}</strong><small>{date(trade.entryDate)}{trade.exitDate ? ` → ${date(trade.exitDate)}` : ' · open'}</small></td>
                    <td>{trade.setupType}</td>
                    <td>{money(trade.entryPrice)}</td>
                    <td>{slip === null ? '—' : `${slip >= 0 ? '+' : ''}${slip.toFixed(1)}%`}</td>
                    <td className={(trade.rMultiple ?? 0) >= 0 ? 'sd-positive' : 'sd-negative'}>{trade.status === 'CLOSED' ? rText(trade.rMultiple) : '—'}</td>
                    <td>{trade.daysHeld ?? '—'}</td>
                    <td>{trade.followedPlan === null ? '—' : trade.followedPlan ? 'Followed' : 'Broke'}</td>
                    <td>{trade.mistakes.length ? trade.mistakes.map(label).join(', ') : '—'}</td>
                    <td><button className="sd-j-review" onClick={() => setReviewing(trade)}><PenLine size={13} />{trade.reviewedAt ? 'Edit' : 'Review'}</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <p className="sd-j-empty">Record a paper trade from the Workspace trade plan; it will appear here for review.</p>}
      </section>

      {reviewing && <ReviewDialog trade={reviewing} data={data} onClose={() => setReviewing(undefined)} onSaved={() => { setReviewing(undefined); void load(); }} />}
    </main>
  );
}
