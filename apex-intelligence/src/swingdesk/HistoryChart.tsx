import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, HistogramSeries, Time } from 'lightweight-charts';
import { apiJson } from '../lib/api';

interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number }
interface History { candles: Candle[]; source: string; from: string; to: string; note: string }
export function HistoryChart({ ticker }: { ticker: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState('5Y');
  const [interval, setInterval] = useState('1wk');
  const [history, setHistory] = useState<History>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setHistory(undefined); setError('');
    apiJson<{ data: History }>(`/api/workspace/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`, { signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) setHistory(r.data); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [ticker, range, interval, retry]);
  useEffect(() => {
    if (!host.current || !history?.candles.length) return;
    const chart = createChart(host.current, {
      height: 358, width: host.current.clientWidth,
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#7b8984', fontFamily: 'Inter, Segoe UI, sans-serif', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#f0f3f1' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: .08, bottom: .23 } },
      timeScale: { borderVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: '#23866b', downColor: '#cc6f67', borderVisible: false, wickUpColor: '#23866b', wickDownColor: '#cc6f67' });
    series.setData(history.candles.map(c => ({ ...c, time: c.time as Time })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', priceLineVisible: false, lastValueVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: .85, bottom: 0 } });
    volume.setData(history.candles.map(c => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? '#d9ebe4' : '#f0deda' })));
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => { if (host.current) chart.applyOptions({ width: host.current.clientWidth }); });
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [history]);
  return <section className="sd-history" aria-label={`${ticker} historical chart`}>
    <div className="sd-chart-tools"><div className="sd-segment">{['1M','6M','1Y','5Y','ALL'].map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === 'ALL' ? 'All' : r}</button>)}</div>
      <select aria-label="Chart interval" value={interval} onChange={e => setInterval(e.target.value)}><option value="1d">Daily candles</option><option value="1wk">Weekly candles</option><option value="1mo">Monthly candles</option></select></div>
    {error ? <div className="sd-chart-empty" role="alert">{error}<button onClick={() => setRetry(r => r + 1)}>Retry chart</button></div> : !history ? <div className="sd-chart-empty" role="status">Loading price history…</div> : !history.candles.length ? <div className="sd-chart-empty">No history available.</div> : <div ref={host} className="sd-chart-canvas" />}
    <div className="sd-chart-caption">{history ? `${history.source} · ${history.from} — ${history.to}. ${history.note}` : 'Price & volume · NSE · INR'}</div>
  </section>;
}
