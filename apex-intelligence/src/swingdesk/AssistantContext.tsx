import { useEffect, useRef, useState } from 'react';
import { AreaSeries, ColorType, createChart, Time } from 'lightweight-charts';
import { apiJson } from '../lib/api';
import { hasConfirmedBuyTrigger } from '../lib/scanItems';
import { ScanItem } from '../types';
import './assistant-context.css';

type History = { candles: { time: string; close: number }[]; source?: string; from?: string; to?: string; note?: string };
type Props = { ticker: string; capital?: number; setup?: ScanItem; onOpenWorkspace: () => void };
const formatMoney = (amount?: number) => typeof amount === 'number' && Number.isFinite(amount)
  ? `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'Unavailable';

export function AssistantContext({ ticker, capital, setup, onOpenWorkspace }: Props) {
  const [range, setRange] = useState('5Y');
  const [history, setHistory] = useState<History>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const chartHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setHistory(undefined); setError('');
    apiJson<{ data: History }>(`/api/workspace/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1wk`, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(response.data?.candles)) throw new Error('Price history is unavailable.');
        const unique = new Map<string, { time: string; close: number }>();
        for (const candle of response.data.candles) {
          if (typeof candle?.time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candle.time) && Number.isFinite(Date.parse(candle.time)) && Number.isFinite(candle.close) && candle.close > 0) unique.set(candle.time, candle);
        }
        setHistory({ ...response.data, candles: [...unique.values()].sort((a, b) => a.time.localeCompare(b.time)) });
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Price history is unavailable.'); });
    return () => controller.abort();
  }, [ticker, range, retry]);

  useEffect(() => {
    const host = chartHost.current;
    if (!host || !history?.candles.length) return;
    const chart = createChart(host, {
      width: host.clientWidth, height: 190,
      layout: { background: { type: ColorType.Solid, color: '#f8faf8' }, textColor: '#78867f', fontFamily: 'Inter, Segoe UI, sans-serif', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      leftPriceScale: { visible: true, borderVisible: true, borderColor: '#d6e2da', scaleMargins: { top: .09, bottom: .02 } },
      rightPriceScale: { visible: false },
      timeScale: { borderColor: '#d6e2da', timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      handleScale: false, handleScroll: false,
      crosshair: { vertLine: { color: '#a3c4b0', labelBackgroundColor: '#176b50' }, horzLine: { color: '#a3c4b0', labelBackgroundColor: '#176b50' } },
    });
    const series = chart.addSeries(AreaSeries, {
      priceScaleId: 'left', lineColor: '#176b50', lineWidth: 2,
      topColor: 'rgba(70, 145, 99, .22)', bottomColor: 'rgba(70, 145, 99, .01)',
      priceLineVisible: false, lastValueVisible: false,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    series.setData(history.candles.map(c => ({ time: c.time as Time, value: c.close })));
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth }));
    observer.observe(host);
    return () => { observer.disconnect(); chart.remove(); };
  }, [history]);

  const matchedSetup = setup?.ticker === ticker ? setup : undefined;
  const entryStatus = !matchedSetup ? 'Unavailable' : ['WON', 'LOST', 'EXPIRED', 'INVALIDATED', 'MISSED_GAP'].includes(matchedSetup.status || '')
    ? (matchedSetup.status || '').replace(/_/g, ' ').toLowerCase()
    : hasConfirmedBuyTrigger(matchedSetup) ? 'Confirmed' : 'Waiting';

  return <aside className="sd-assistant-context" aria-label="Stock and account context">
    <h2>In context</h2>
    <section className="sd-context-history" aria-label={`${ticker} price history`}>
      <div className="sd-context-stock-heading">
        <button className="sd-context-ticker" onClick={onOpenWorkspace} aria-label={`Open ${ticker} in workspace`}>{ticker}</button>
        <div className="sd-context-ranges" aria-label="Context chart range">{['1Y', '5Y', 'ALL'].map(item => <button key={item} aria-pressed={range === item} onClick={() => setRange(item)}>{item === 'ALL' ? 'All' : item}</button>)}</div>
      </div>
      {error ? <div className="sd-context-chart-state" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry context chart</button></div>
        : !history ? <div className="sd-context-chart-state" role="status">Loading price history…</div>
        : !history.candles.length ? <div className="sd-context-chart-state">No price history available.</div>
        : <div className="sd-context-chart" ref={chartHost} />}
      {history && <details className="sd-context-source"><summary>Price data · {history.source || 'Available provider'}</summary><p>{history.from || 'Unknown start'} — {history.to || 'Unknown end'}</p>{history.note && <p>{history.note}</p>}</details>}
    </section>
    <dl className="sd-context-facts">
      <div><dt>Mode</dt><dd>Paper</dd></div>
      <div><dt>Account capital</dt><dd>{formatMoney(capital)}</dd></div>
      <div><dt>Entry status</dt><dd className="sd-context-entry-status">{entryStatus}</dd></div>
    </dl>
    <p className="sd-context-note">Answers use available data. Missing inputs are shown explicitly.</p>
  </aside>;
}
