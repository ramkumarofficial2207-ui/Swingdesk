import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, FileText, MessageSquare, Plus, RotateCcw, Send, Trash2, TrendingUp } from 'lucide-react';
import { apiJson } from '../lib/api';
import { ScanItem } from '../types';
import { AssistantContext } from './AssistantContext';
import './assistant.css';

type ChatResponse = {
  reply: string;
  sources: string[];
  stockCard?: { ticker: string; price: number; signal: string | null; buyZone?: number; target?: number; stopLoss?: number; riskReward?: number } | null;
  meta?: { supportLevel: 'supported' | 'partial' | 'unsupported'; grounded: boolean; liveDataUsed: boolean; scannerContextUsed: boolean; dataUsed: string[]; lastUpdated: string | null; notes: string[] };
};
type Turn = { id: string; prompt: string; ticker: string; answer?: ChatResponse; error?: string };
type Conversation = { id: string; title: string; ticker: string; turns: Turn[] };
type Notebook = { conversations: Conversation[]; activeId: string };
const STORAGE_KEY = 'swingdesk:personal:e58b2d72-4d01-4cb0-9347-33bf3fb6d490:research:v1';
const NOTEBOOK_KEY = 'swingdesk:personal:e58b2d72-4d01-4cb0-9347-33bf3fb6d490:conversations:v2';
const MAX_TURNS = 40;

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 100) : [];
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

// Browser storage and API responses both cross a runtime trust boundary.
function parseResponse(value: unknown): ChatResponse | undefined {
  const data = record(value);
  if (!data || typeof data.reply !== 'string' || !data.reply.trim()) return undefined;
  const response: ChatResponse = { reply: data.reply, sources: strings(data.sources) };
  const meta = record(data.meta);
  if (meta) response.meta = {
    supportLevel: meta.supportLevel === 'supported' || meta.supportLevel === 'partial' ? meta.supportLevel : 'unsupported',
    grounded: meta.grounded === true, liveDataUsed: meta.liveDataUsed === true, scannerContextUsed: meta.scannerContextUsed === true,
    dataUsed: strings(meta.dataUsed), lastUpdated: typeof meta.lastUpdated === 'string' ? meta.lastUpdated : null, notes: strings(meta.notes),
  };
  const stock = record(data.stockCard);
  if (stock && typeof stock.ticker === 'string' && finite(stock.price) !== undefined) response.stockCard = {
    ticker: stock.ticker, price: stock.price as number, signal: typeof stock.signal === 'string' ? stock.signal : null,
    buyZone: finite(stock.buyZone), target: finite(stock.target), stopLoss: finite(stock.stopLoss), riskReward: finite(stock.riskReward),
  };
  return response;
}

function readConversation(): Turn[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.slice(-MAX_TURNS).flatMap(item => {
      const data = record(item);
      if (!data || typeof data.id !== 'string' || typeof data.prompt !== 'string' || data.prompt.length > 1800 || typeof data.ticker !== 'string' || !/^[A-Z0-9&.-]{1,20}$/.test(data.ticker)) return [];
      const answer = parseResponse(data.answer);
      return [{ id: data.id, prompt: data.prompt, ticker: data.ticker, answer,
        error: answer ? undefined : typeof data.error === 'string' ? data.error : 'This request was interrupted. Retry when you are ready.' }];
    });
  } catch { return []; }
}

const newConversation = (ticker: string): Conversation => ({ id: crypto.randomUUID(), title: 'New conversation', ticker, turns: [] });
function readNotebook(ticker: string): Notebook {
  try {
    const saved = record(JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || 'null'));
    if (saved && Array.isArray(saved.conversations)) {
      const conversations: Conversation[] = saved.conversations.slice(-30).flatMap(item => {
        const c = record(item);
        if (!c || typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.ticker !== 'string' || !/^[A-Z0-9&.-]{1,20}$/.test(c.ticker) || !Array.isArray(c.turns)) return [];
        const turns: Turn[] = c.turns.slice(-MAX_TURNS).flatMap(item => {
          const t = record(item);
          if (!t || typeof t.id !== 'string' || typeof t.prompt !== 'string' || t.prompt.length > 1800) return [];
          const answer = parseResponse(t.answer);
          return [{ id: t.id, prompt: t.prompt, ticker: c.ticker as string, answer, error: answer ? undefined : typeof t.error === 'string' ? t.error : 'This request was interrupted. Please retry.' }];
        });
        return [{ id: c.id, title: c.title.slice(0, 80), ticker: c.ticker, turns }];
      });
      if (conversations.length) {
        const active = conversations.find(c => c.id === saved.activeId && c.ticker === ticker) || conversations.find(c => c.ticker === ticker);
        if (active) return { conversations, activeId: active.id };
        const next = newConversation(ticker);
        return { conversations: [...conversations.slice(-29), next], activeId: next.id };
      }
    }
  } catch { /* A damaged browser record should not prevent opening the assistant. */ }
  const legacy = readConversation();
  const conversation = newConversation(ticker);
  conversation.turns = legacy.filter(t => t.ticker === ticker);
  if (conversation.turns.length) conversation.title = conversation.turns[0].prompt.slice(0, 45);
  const older = [...new Set(legacy.map(t => t.ticker))].filter(t => t !== ticker).map(t => ({ ...newConversation(t), title: `${t} research`, turns: legacy.filter(turn => turn.ticker === t) }));
  return { conversations: [...older, conversation], activeId: conversation.id };
}

function sourceUrl(source: string): string | null {
  try { const url = new URL(source); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function timestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const money = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'Unavailable';

function Answer({ response }: { response: ChatResponse }) {
  const meta = response.meta;
  const updated = timestamp(meta?.lastUpdated);
  const sources = Array.isArray(response.sources) ? response.sources.filter((source): source is string => typeof source === 'string') : [];
  return <>
    <div className="sd-chat-answer-text">{response.reply}</div>
    {response.stockCard && <div className="sd-chat-stock-summary" aria-label="Stock context">
      <div><strong>{response.stockCard.ticker}</strong><span>Research snapshot</span></div>
      <dl><div><dt>Price</dt><dd>{money(response.stockCard.price)}</dd></div>
        <div><dt>Entry zone</dt><dd>{money(response.stockCard.buyZone)}</dd></div>
        <div><dt>Target</dt><dd>{money(response.stockCard.target)}</dd></div>
        <div><dt>Stop loss</dt><dd>{money(response.stockCard.stopLoss)}</dd></div></dl>
    </div>}
    {meta && <div className="sd-chat-evidence">
      <span><CheckCircle2 size={13} aria-hidden="true" />{meta.grounded ? 'Grounded response' : 'General explanation'}</span>
      <span>{meta.supportLevel === 'partial' ? 'Partial data support' : meta.supportLevel === 'unsupported' ? 'Outside supported scope' : 'Supported scope'}</span>
      {meta.liveDataUsed && <span>Live data used</span>}
      {meta.scannerContextUsed && <span>Scanner context used</span>}
      {updated && <span>Data updated {updated}</span>}
    </div>}
    {sources.length > 0 && <div className="sd-chat-sources"><span>Sources</span>{sources.map((source, index) => {
      const url = sourceUrl(source);
      return url ? <a key={`${index}-${source}`} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}<ChevronRight size={12} aria-hidden="true" /></a> : <span className="sd-chat-source-label" key={`${index}-${source}`}>{source}</span>;
    })}</div>}
    {Array.isArray(meta?.notes) && meta.notes.length > 0 && <details className="sd-chat-notes"><summary>Data notes</summary><ul>{meta.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
  </>;
}

export function ResearchAssistant({ ticker, capital, setups = [], onOpenWorkspace, onContextChange }: {
  ticker: string; capital?: number; setups?: ScanItem[];
  onOpenWorkspace?: (ticker: string, tab?: string) => void;
  onContextChange?: (ticker: string) => void;
}) {
  const [notebook, setNotebook] = useState<Notebook>(() => readNotebook(ticker));
  const active = notebook.conversations.find(c => c.id === notebook.activeId)!;
  const turns = active.turns;
  const selected = setups.find(s => s.ticker === active.ticker);
  const [draft, setDraft] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const attachDialog = useRef<HTMLDialogElement>(null);
  const [attachment, setAttachment] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const contextTicker = active.ticker;

  useEffect(() => {
    try {
      localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(notebook));
      localStorage.removeItem(STORAGE_KEY);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [notebook]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, [notebook.activeId, turns.length, pendingId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  function updateTurn(conversationId: string, turnId: string, change: Partial<Turn>) {
    setNotebook(current => ({ ...current, conversations: current.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id === turnId ? { ...t, ...change } : t) }) }));
  }
  async function ask(turn: Turn, conversationId: string) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 60000);
    setPendingId(turn.id);
    updateTurn(conversationId, turn.id, { error: undefined });
    try {
      const payload = await apiJson<unknown>('/api/chat', {
        method: 'POST', body: JSON.stringify({ message: 'Regarding NSE ' + turn.ticker + ': ' + turn.prompt }), signal: controller.signal,
      });
      const response = parseResponse(payload);
      if (!response) throw new Error('The assistant returned no response. Please retry.');
      if (mounted.current && !controller.signal.aborted) updateTurn(conversationId, turn.id, { answer: response, error: undefined });
    } catch (error) {
      if (mounted.current && (!controller.signal.aborted || controller.signal.reason === 'timeout')) updateTurn(conversationId, turn.id, {
        error: controller.signal.reason === 'timeout' ? 'The assistant took too long to respond. Please retry.' : error instanceof Error ? error.message : 'The assistant is unavailable. Please retry.',
      });
    } finally {
      window.clearTimeout(timeout);
      if (mounted.current) { setPendingId(null); input.current?.focus(); }
      if (request.current === controller) request.current = null;
    }
  }
  function send(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const prompt = (suggested ?? draft).trim();
    if (request.current || prompt.length < 3 || prompt.length > 1800) return;
    const turn: Turn = { id: crypto.randomUUID(), ticker: contextTicker, prompt };
    setNotebook(current => ({ ...current, conversations: current.conversations.map(c => c.id !== active.id ? c : {
      ...c, title: c.turns.length ? c.title : prompt.slice(0, 45), turns: [...c.turns, turn].slice(-MAX_TURNS),
    }) }));
    setDraft('');
    void ask(turn, active.id);
  }
  function startConversation() {
    if (pendingId) return;
    const conversation = newConversation(contextTicker);
    setNotebook(current => ({ conversations: [...current.conversations.slice(-29), conversation], activeId: conversation.id }));
    setDraft(''); input.current?.focus();
  }
  function selectConversation(conversation: Conversation) {
    setNotebook(current => ({ ...current, activeId: conversation.id }));
    onContextChange?.(conversation.ticker); setDraft('');
  }
  function deleteConversation(id: string) {
    if (pendingId) return;
    let remaining = notebook.conversations.filter(c => c.id !== id);
    if (!remaining.length) remaining = [newConversation(contextTicker)];
    const next = id === active.id ? remaining[remaining.length - 1] : active;
    setNotebook({ conversations: remaining, activeId: next.id }); setDraft('');
    onContextChange?.(next.ticker);
  }
  const openWorkspace = (tab = 'Overview') => onOpenWorkspace?.(contextTicker, tab);
  return <section className="sd-chat-shell" aria-label="Research Assistant">
    <aside className="sd-conversations" aria-label="Saved conversations">
      <h2>Conversations</h2>
      <button className="sd-new-conversation" onClick={startConversation} disabled={!!pendingId}><Plus size={20}/>New conversation</button>
      <nav aria-label="Conversation history">
        {[...notebook.conversations].reverse().map(conversation => <div className={'sd-conversation-row ' + (conversation.id === active.id ? 'is-active' : '')} key={conversation.id}>
          <button className="sd-conversation-select" onClick={() => selectConversation(conversation)} aria-current={conversation.id === active.id ? 'true' : undefined} title={conversation.title}>
            <MessageSquare size={18}/><span>{conversation.title}</span>
          </button>
          <button className="sd-conversation-delete" aria-label={'Delete conversation: ' + conversation.title} disabled={!!pendingId} onClick={() => deleteConversation(conversation.id)}><Trash2 size={14}/></button>
        </div>)}
      </nav>
      <div className="sd-conversations-footer"><BarChart3 size={20}/><span>Research assistant</span></div>
    </aside>
    <div className="sd-chat">
      <header className="sd-chat-header"><h1>Research, with context.</h1><p>Grounded in your workspace and market data.</p></header>
      <div className="sd-chat-context"><TrendingUp size={17}/><strong>{contextTicker}</strong><span>· Latest available data</span></div>
      <div className="sd-chat-thread" role="log" aria-label="Research conversation" aria-live="polite" aria-busy={!!pendingId}>
        {!turns.length && <div className="sd-chat-welcome"><span className="sd-chat-welcome-mark"><TrendingUp size={28}/></span><h2>A clearer view of your next trade.</h2><p>Ask about {contextTicker}, review your watchlist, or explore the risks in a setup.</p>
          <div className="sd-chat-prompts">{[
            ['Review this setup', 'Does ' + contextTicker + ' fit my swing setup? What confirms an entry?'],
            ['Review my watchlist', 'Review my watchlist and explain which setups need attention.'],
            ['Review my portfolio', 'Review my portfolio concentration and open risk.'],
          ].map(([label,prompt]) => <button key={label} onClick={() => send(undefined,prompt)} disabled={!!pendingId}><MessageSquare size={15}/>{label}<ChevronRight size={14}/></button>)}</div>
        </div>}
        {turns.map(turn => <article className="sd-chat-turn" key={turn.id}>
          <div className="sd-chat-question"><p>{turn.prompt}</p></div>
          <div className="sd-chat-response"><span className="sd-chat-avatar" aria-label="SwingDesk"><TrendingUp size={23}/><small>SD</small></span>
            <div className="sd-chat-response-body">
              {turn.answer ? <><Answer response={turn.answer}/><div className="sd-chat-answer-actions"><button onClick={() => openWorkspace()}><TrendingUp size={15}/>Price history</button>{selected && <button onClick={() => openWorkspace()}><FileText size={15}/>Saved trade plan</button>}<button className="sd-open-workspace" onClick={() => openWorkspace()}>Open in workspace<ArrowUpRight size={16}/></button></div></> :
              pendingId === turn.id ? <p className="sd-chat-thinking" role="status">Checking available research and data…</p> :
              <div className="sd-chat-error" role="alert"><p>{turn.error || 'This request was interrupted.'}</p><button disabled={!!pendingId} onClick={() => void ask(turn, active.id)}><RotateCcw size={14}/>Retry response</button></div>}
            </div>
          </div>
        </article>)}
        <div ref={bottom}/>
      </div>
      <div className="sd-chat-bottom">
        <div className="sd-chat-followups"><button disabled={!!pendingId} onClick={() => send(undefined, 'Explain the technical, earnings, and news risks for ' + contextTicker + '.')}>Explain the risks</button><button disabled={!!pendingId} onClick={() => send(undefined, 'Compare ' + contextTicker + ' with the stocks in my watchlist.')}>Compare with my watchlist</button></div>
        <form className="sd-chat-composer" onSubmit={send}>
          <div className="sd-chat-input-wrap"><MessageSquare size={20} className="sd-composer-icon" aria-hidden="true"/><label className="sd-sr-only" htmlFor="sd-research-prompt">Ask about a stock, setup, or your portfolio</label><textarea ref={input} id="sd-research-prompt" value={draft} rows={1} maxLength={1800} placeholder="Ask about a stock, setup, or your portfolio…" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/><button type="submit" aria-label="Send research question" disabled={!!pendingId || draft.trim().length < 3}><Send size={21}/></button></div>
        </form>
        <p className="sd-chat-storage-note">{storageError ? 'Browser storage is unavailable; conversations will not be saved.' : 'Saved on this browser · Up to 30 conversations, 40 questions each.'} Each question uses the selected stock; earlier messages are not sent.</p>
      </div>
    </div>
    <AssistantContext ticker={contextTicker} capital={capital} setup={selected} onOpenWorkspace={() => openWorkspace()}/>
  </section>;
}
