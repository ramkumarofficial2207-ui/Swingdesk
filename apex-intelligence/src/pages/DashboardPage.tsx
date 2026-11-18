import React, { useState } from 'react';
import { 
  Zap, 
  Flame, 
  ShieldAlert, 
  MoreHorizontal,
  Calendar,
  BarChart2,
  Clock,
  ChevronDown
} from 'lucide-react';
import { ScanDiagnostics, ScanItem, InstitutionalFlowSnapshot, LiveIndex, MarketStatus, User } from '../types';
import { SetupCard } from '../components/SetupCard';
import { hasConfirmedBuyTrigger } from '../lib/scanItems';

interface DashboardPageProps {
  scanItems: ScanItem[];
  user: User;
  institutionalFlow: InstitutionalFlowSnapshot;
  indices: LiveIndex[];
  marketStatus: MarketStatus;
  watchlistIds: Set<string>;
  onAddToWatchlist: (item: ScanItem) => void;
  onOpenLogTrade: (item: ScanItem) => void;
  onOpenDeepAnalysis: (item: ScanItem) => void;
  onTriggerScan: () => void;
  isScanning: boolean;
  scanProgressStep?: string;
  scanProgressPct?: number;
  scanProcessedStocks?: number;
  scanTotalStocks?: number;
  scanError?: string;
  autoScanEnabled?: boolean;
  lastSuccessfulScanAt?: string | null;
  scanDiagnostics?: ScanDiagnostics | null;
  realtimeConnected?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  scanItems,
  user,
  institutionalFlow,
  indices,
  marketStatus,
  watchlistIds,
  onAddToWatchlist,
  onOpenLogTrade,
  onOpenDeepAnalysis,
  onTriggerScan,
  isScanning,
  scanProgressStep,
  scanProgressPct = 0,
  scanProcessedStocks = 0,
  scanTotalStocks = 0,
  scanError = '',
  autoScanEnabled = false,
  lastSuccessfulScanAt = null,
  scanDiagnostics = null,
  realtimeConnected = false,
}) => {
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [minConfidence, setMinConfidence] = useState<number>(3.0);
  const [statusTabFilter, setStatusTabFilter] = useState<'ALL' | 'QUALIFIED' | 'TRIGGERED' | 'WON' | 'LOST' | 'SKIPPED'>('ALL');

  const safeScanItems = Array.isArray(scanItems) ? scanItems : [];
  const averageConfidence = safeScanItems.length
    ? safeScanItems.reduce((sum, item) => sum + (Number(item.confidenceScore) || 0), 0) / safeScanItems.length
    : null;
  const bullishSignals = safeScanItems.filter(item => item.aiSignal === 'BUY' || item.aiSignal === 'LIGHT BUY').length;
  const riskSetups = safeScanItems.filter(item => item.aiSignal === 'REJECT' || item.newsRisk || item.earningsRisk).length;
  const setupCounts = safeScanItems.reduce<Record<string, number>>((counts, item) => {
    if (item.setupType) counts[item.setupType] = (counts[item.setupType] || 0) + 1;
    return counts;
  }, {});
  const dominantSetups = Object.entries(setupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([setup]) => setup);
  const safeIndices = Array.isArray(indices) ? indices : [];
  const hasInstitutionalFlow = Boolean(institutionalFlow.id && institutionalFlow.tradingDate);
  const lastScanLabel = lastSuccessfulScanAt
    ? new Date(lastSuccessfulScanAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'No successful scan yet';
  const topRejectionGates = Object.entries(scanDiagnostics?.rejectionCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const recommendedActionLabel = scanDiagnostics?.recommendedAction === 'TRADE_READY'
    ? 'Trade-ready candidates exist'
    : scanDiagnostics?.recommendedAction === 'WATCHLIST'
    ? 'Wait for confirmation / monitor watchlist'
    : scanDiagnostics?.recommendedAction === 'WAIT'
    ? 'Wait for a cleaner market setup'
    : 'Diagnostics unavailable';

  const isMonitorItem = (item: ScanItem) => {
    return !['WON', 'LOST', 'MISSED_GAP', 'INVALIDATED', 'EXPIRED'].includes(String(item.status)) && !hasConfirmedBuyTrigger(item);
  };

  const isWonItem = (item: ScanItem) => item.status === 'WON';

  const isLostItem = (item: ScanItem) => item.status === 'LOST';
  const isSkippedItem = (item: ScanItem) =>
    item.status === 'MISSED_GAP' || item.status === 'INVALIDATED' || item.status === 'EXPIRED';

  const qualifiedItems = safeScanItems.filter(i => isMonitorItem(i) && !isWonItem(i) && !isLostItem(i));
  const triggeredItems = safeScanItems.filter(i => !isMonitorItem(i) && !isWonItem(i) && !isLostItem(i) && !isSkippedItem(i));
  const wonItems = safeScanItems.filter(i => isWonItem(i));
  const lostItems = safeScanItems.filter(i => isLostItem(i));
  const skippedItems = safeScanItems.filter(i => isSkippedItem(i));

  const filteredItems = safeScanItems.filter((item) => {
    if (!item) return false;
    if (selectedSector !== 'ALL' && !item.sector?.toUpperCase().includes(selectedSector.toUpperCase())) {
      return false;
    }
    if ((item.confidenceScore ?? 0) < minConfidence) {
      return false;
    }
    if (statusTabFilter === 'QUALIFIED') return isMonitorItem(item) && !isWonItem(item) && !isLostItem(item) && !isSkippedItem(item);
    if (statusTabFilter === 'TRIGGERED') return !isMonitorItem(item) && !isWonItem(item) && !isLostItem(item) && !isSkippedItem(item);
    if (statusTabFilter === 'WON') return isWonItem(item);
    if (statusTabFilter === 'LOST') return isLostItem(item);
    if (statusTabFilter === 'SKIPPED') return isSkippedItem(item);
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Main Title & Run Scanner CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Market Scanner</h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <span>⚡</span>
            <span className={autoScanEnabled ? 'text-emerald-400' : 'text-amber-400'}>
              {autoScanEnabled
                ? 'Auto-scan active every 30 min during market hours (9:15–3:30 IST)'
                : 'Auto-scan disabled — manual fallback available'}
            </span>
          </p>
          <p className="text-[10px] text-gray-500 mt-1">Last successful scan: {lastScanLabel}</p>
          <p className={`text-[10px] mt-1 flex items-center gap-1.5 ${realtimeConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${realtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {realtimeConnected ? 'Live scan updates connected' : 'Live updates reconnecting — polling fallback active'}
          </p>
        </div>

        <button
          onClick={onTriggerScan}
          disabled={isScanning}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Zap className={`w-4 h-4 text-amber-300 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanning Market...' : 'Run Scanner Now'}</span>
        </button>
      </div>

      {/* Dominant Setups & Nifty Regime Badges Banner */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0D1117] border border-amber-500/20 text-amber-300 font-sans text-xs">
          <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
          <span className="font-bold text-amber-400">Dominant Setups:</span>
          <span className="text-gray-200">{dominantSetups.length ? dominantSetups.join(' • ') : 'Data unavailable'}</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0D1117] border border-amber-500/20 text-amber-300 font-sans text-xs">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-400">Nifty Market Regime:</span>
          <span className="text-gray-200">{marketStatus.label || 'Regime data unavailable'}</span>
        </div>
      </div>

      {/* SSE Real-time Progress Bar */}
      {isScanning && (
        <div className="bg-[#0D1117] border border-indigo-500/30 rounded-2xl p-4 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-indigo-300 font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 animate-spin text-indigo-400" />
              {scanProgressStep || 'Running real-time ApexScan Nifty 500 scanner...'}
            </span>
            <span className="text-cyan-400 font-extrabold">{scanProgressPct}%</span>
          </div>
          {scanTotalStocks > 0 && (
            <div className="text-[10px] text-gray-400 font-mono">
              Processed {scanProcessedStocks.toLocaleString('en-IN')} / {scanTotalStocks.toLocaleString('en-IN')} stocks
            </div>
          )}
          <div className="w-full h-2 bg-[#080B10] rounded-full overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${scanProgressPct}%` }}
            ></div>
          </div>
        </div>
      )}

      {!isScanning && scanError && (
        <div className="bg-red-950/30 border border-red-500/40 rounded-2xl px-4 py-3 text-xs text-red-300">
          <strong className="text-red-200">Latest scan failed:</strong> {scanError} The last successful setups remain available.
        </div>
      )}

      {scanDiagnostics && (
        <section className="bg-[#0D1117] border border-cyan-500/20 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Scan Funnel & Integrity</h2>
              <p className="text-[11px] text-gray-400 mt-1">{scanDiagnostics.summary || 'Latest completed scanner diagnostics.'}</p>
            </div>
            <div className="text-right text-[10px] font-mono text-gray-500">
              <div>{scanDiagnostics.mode.toUpperCase()} · {recommendedActionLabel}</div>
              <div className="mt-1">Completed: {lastScanLabel}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ['Universe', scanDiagnostics.universeCount],
              ['First-stage pass', scanDiagnostics.qualifiedCount],
              ['Final setups', scanDiagnostics.setupCount],
              ['Triggered', triggeredItems.length],
              ['Qualified base', qualifiedItems.length],
            ].map(([label, count]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-[#080B10] px-3 py-2">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
                <div className="mt-1 text-lg font-black text-cyan-300 font-mono">{Number(count).toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>

          {topRejectionGates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
              <span className="text-gray-500 uppercase tracking-wider">Top rejection gates:</span>
              {topRejectionGates.map(([reason, count]) => (
                <span key={reason} className="rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-red-300">
                  {reason.replace(/_/g, ' ')} · {count}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Summary KPI Metrics Row (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block font-sans">TODAY'S SETUPS</span>
          <span className="text-3xl font-black text-indigo-400 font-mono">{safeScanItems.length}</span>
        </div>

        {/* Card 2 */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block font-sans">AVG CONFIDENCE</span>
          <span className="text-3xl font-black text-amber-400 font-mono">{averageConfidence === null ? '—' : averageConfidence.toFixed(1)}</span>
        </div>

        {/* Card 3 */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block font-sans">BULLISH SIGNALS</span>
          <span className="text-3xl font-black text-emerald-400 font-mono">{bullishSignals}</span>
        </div>

        {/* Card 4 */}
        <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 shadow-xl space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block font-sans">RISK SETUPS</span>
          <span className="text-3xl font-black text-gray-400 font-mono">{riskSetups}</span>
        </div>
      </div>

      {/* Status Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-[#0D1117] border border-white/10 text-xs font-sans">
        <button
          onClick={() => setStatusTabFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
            statusTabFilter === 'ALL'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          All Setups ({safeScanItems.length})
        </button>

        <button
          onClick={() => setStatusTabFilter('TRIGGERED')}
          className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            statusTabFilter === 'TRIGGERED'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-emerald-400 hover:bg-emerald-950/40'
          }`}
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>Triggered / In Progress ({triggeredItems.length})</span>
        </button>

        <button
          onClick={() => setStatusTabFilter('QUALIFIED')}
          className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            statusTabFilter === 'QUALIFIED'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-amber-400 hover:bg-amber-950/40'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Qualified Base ({qualifiedItems.length})</span>
        </button>

        <button
          onClick={() => setStatusTabFilter('WON')}
          className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            statusTabFilter === 'WON'
              ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
              : 'text-emerald-300 hover:bg-emerald-950/30'
          }`}
        >
          <span>🎯 Won ({wonItems.length})</span>
        </button>

        <button
          onClick={() => setStatusTabFilter('LOST')}
          className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            statusTabFilter === 'LOST'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
              : 'text-red-400 hover:bg-red-950/30'
          }`}
        >
          <span>💥 Lost ({lostItems.length})</span>
        </button>

        <button
          onClick={() => setStatusTabFilter('SKIPPED')}
          className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            statusTabFilter === 'SKIPPED'
              ? 'bg-slate-600 text-white shadow-md shadow-slate-600/30'
              : 'text-slate-300 hover:bg-slate-800/50'
          }`}
        >
          <span>Skipped / Invalid ({skippedItems.length})</span>
        </button>
      </div>

      {/* Additional setup filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 font-mono text-xs">
        <label className="flex items-center gap-3 text-gray-300 font-sans font-medium">
          <span>Min Confidence: <strong className="text-white">{minConfidence.toFixed(1)}</strong></span>
          <input
            type="range"
            min="1.0"
            max="10.0"
            step="0.5"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="w-28 accent-indigo-500 cursor-pointer"
          />
        </label>

        <div className="relative">
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="bg-[#0D1117] border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none cursor-pointer pr-8 font-sans"
          >
            <option value="ALL">All Sectors ({safeScanItems.length})</option>
            {Array.from(new Set(safeScanItems.map(i => i.sector).filter(Boolean))).sort().map(sec => (
              <option key={sec} value={sec}>{sec}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Main 2-Column Section: Stock Setups Grid on Left, Market Intelligence Sidebar on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Stock Setup Cards Grid (3 Columns on Desktop) */}
        <div className="lg:col-span-3 space-y-8">
          {filteredItems.length === 0 ? (
            <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-8 text-center text-gray-400 space-y-2 font-sans">
              <p className="text-base font-bold text-white">No setups found matching current filters.</p>
              <p className="text-xs text-gray-500">Try adjusting the confidence slider, sector dropdown, or status category tab.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <SetupCard
                  key={item.id}
                  item={item}
                  onAddToWatchlist={onAddToWatchlist}
                  onOpenLogTrade={onOpenLogTrade}
                  onOpenDeepAnalysis={onOpenDeepAnalysis}
                  isInWatchlist={watchlistIds.has(item.ticker)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Widgets Sidebar (1 Column) */}
        <div className="space-y-4">
          {/* Widget 1: Session Status */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className={marketStatus.isOpen ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                {marketStatus.label || (marketStatus.isOpen ? 'Market Open' : 'Market Closed')}
              </span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                {marketStatus.session}
              </span>
            </div>
            <p className="text-gray-400 text-[11px]">{marketStatus.nextEvent || 'Session timing unavailable'}</p>
          </div>

          {/* Widget 2: Last Close Indices */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-200">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-400" />
                <span>Last Close</span>
              </div>
              <MoreHorizontal className="w-4 h-4 text-gray-500 cursor-pointer" />
            </div>

            {safeIndices.length ? (
              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                {safeIndices.slice(0, 3).map(index => (
                  <div key={index.symbol} className="p-2 rounded-xl bg-[#080B10] border border-white/5 space-y-1">
                    <span className="text-[9px] text-gray-400 block font-sans">{index.name}</span>
                    <span className="text-white font-bold block">{index.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    <span className={`text-[10px] font-bold block ${index.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {index.changePct >= 0 ? '+' : ''}{index.changePct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-3">Market index data unavailable</p>
            )}

            <p className="text-[10px] text-gray-500 text-center font-sans">Verified market feed</p>
          </div>

          {/* Widget 3: FII / DII Flow */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-indigo-400">📊</span>
                <span>FII / DII Flow</span>
              </div>
              <MoreHorizontal className="w-4 h-4 text-gray-500 cursor-pointer" />
            </div>
            {hasInstitutionalFlow ? (
              <div className="grid grid-cols-2 gap-2 pt-2 text-center font-mono text-[11px]">
                <div className="rounded-lg bg-[#080B10] p-2">
                  <span className="block text-gray-500">FII Net</span>
                  <span className={institutionalFlow.fiiNet >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    ₹{institutionalFlow.fiiNet.toLocaleString('en-IN')} Cr
                  </span>
                </div>
                <div className="rounded-lg bg-[#080B10] p-2">
                  <span className="block text-gray-500">DII Net</span>
                  <span className={institutionalFlow.diiNet >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    ₹{institutionalFlow.diiNet.toLocaleString('en-IN')} Cr
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 pt-2 text-center">Institutional flow unavailable</p>
            )}
          </div>

          {/* Widget 4: Economic Calendar */}
          <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-200">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Economic Calendar</span>
              </div>
              <MoreHorizontal className="w-4 h-4 text-gray-500 cursor-pointer" />
            </div>

            <p className="text-xs text-gray-500 text-center py-2">Authoritative calendar feed not configured</p>
          </div>
        </div>
      </div>
    </div>
  );
};
