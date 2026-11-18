import { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
type Quote = { ticker: string; live: boolean; price: number | null; lastTradeAt: string | null; source: string | null; market: string; reason: string };
export function LiveQuote({ ticker, fallback, ready }: { ticker: string; fallback?: number; ready: boolean }) {
    const [quote, setQuote] = useState<Quote>();
    useEffect(() => {
        if (!ready) return;
        let active = true;
        setQuote(undefined);
        const load = () => apiJson<{ data: Quote }>(`/api/workspace/live-quote/${encodeURIComponent(ticker)}`)
            .then(r => { if (active) setQuote(r.data); }).catch(() => { if (active) setQuote(undefined); });
        void load(); const timer = setInterval(() => void load(), 15000);
        return () => { active = false; clearInterval(timer); };
    }, [ticker, ready]);
    const price = quote?.live ? quote.price : fallback;
    return <><strong>{typeof price === 'number' && Number.isFinite(price) ? `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</strong>
        <small>{quote?.live ? `Live · ${quote.source} · ${new Date(quote.lastTradeAt!).toLocaleTimeString('en-IN')}` : `Research snapshot · ${quote?.reason || 'No live quote available'}`}</small>
    </>;
}
