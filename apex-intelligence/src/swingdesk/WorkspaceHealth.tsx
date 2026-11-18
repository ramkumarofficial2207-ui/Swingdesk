import { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import './workspace-health.css';

type State = 'READY' | 'STALE' | 'MISSING' | 'DISABLED';
type Snapshot = { state: { eod: State; scan: State; tick: State; automaticScan: State; automaticExecution: State };
    eod: { tradingDate: string; status: string; readySymbolCount: number; symbolCount: number } | null;
    scan: { lastSuccessfulScanAt: string | null; active?: { stage: string; progressPct: number } | null };
    feed: { connected: boolean; latestTickAt: string | null; trackedSymbols: number };
    market: { isOpen: boolean; label: string }; mode: string; checkedAt: string };
const time = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No run recorded';
function Item({ label, status, detail }: { label: string; status: State; detail: string }) {
    return <div className="sd-health-item"><span>{label}<b className={`sd-health-state ${status.toLowerCase()}`}>{status.toLowerCase()}</b></span><small>{detail}</small></div>;
}
export function WorkspaceHealth({ ready }: { ready: boolean }) {
    const [data, setData] = useState<Snapshot>();
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        if (!ready) return;
        let active = true;
        const load = () => apiJson<{ data: Snapshot }>('/api/workspace/readiness')
            .then(result => { if (active) { setData(result.data); setError(''); } })
            .catch(() => { if (active) setError('Operating status unavailable.'); });
        void load(); const timer = setInterval(() => void load(), 30000);
        return () => { active = false; clearInterval(timer); };
    }, [ready, refresh]);
    if (!ready) return null;
    return <section className="sd-health" aria-label="Trading system status"><div className="sd-health-heading"><strong>System readiness</strong><span>{data?.mode === 'PERSONAL_RESEARCH' ? 'Personal research mode' : 'Server mode'} · Checked {time(data?.checkedAt)}</span><button onClick={() => setRefresh(n => n + 1)}>Refresh status</button></div>
        {error && <p role="alert">{error}</p>}
        {data && <div className="sd-health-grid">
            <Item label="NSE daily data" status={data.state.eod} detail={data.eod ? `${data.eod.tradingDate} · ${data.eod.readySymbolCount}/${data.eod.symbolCount} ready` : 'No EOD ingestion recorded'} />
            <Item label="Qualified scan" status={data.state.scan} detail={data.scan.active ? `${data.scan.active.stage} · ${data.scan.active.progressPct}%` : `Last success ${time(data.scan.lastSuccessfulScanAt)}`} />
            <Item label="Live feed" status={data.state.tick} detail={!data.market.isOpen ? data.market.label : data.feed.connected ? `${data.feed.trackedSymbols} symbols · ${time(data.feed.latestTickAt)}` : 'Broker feed disconnected'} />
            <Item label="Automatic scan" status={data.state.automaticScan} detail={data.state.automaticScan === 'DISABLED' ? 'Disabled in this mode' : 'Scheduled'} />
            <Item label="Live execution" status={data.state.automaticExecution} detail={data.state.automaticExecution === 'DISABLED' ? 'No automatic real orders' : 'Check broker and risk controls'} />
        </div>}
    </section>;
}
