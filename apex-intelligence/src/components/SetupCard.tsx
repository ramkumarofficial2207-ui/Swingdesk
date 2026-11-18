import React, { useState } from 'react';
import { 
  Star, 
  CheckCircle2, 
  Zap,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { ScanItem } from '../types';
import { hasConfirmedBuyTrigger } from '../lib/scanItems';

interface SetupCardProps {
  item: ScanItem;
  onAddToWatchlist: (item: ScanItem) => void;
  onOpenLogTrade: (item: ScanItem) => void;
  onOpenDeepAnalysis: (item: ScanItem) => void;
  isInWatchlist: boolean;
}

export const SetupCard: React.FC<SetupCardProps> = ({
  item,
  onAddToWatchlist,
  onOpenLogTrade,
  onOpenDeepAnalysis,
  isInWatchlist,
}) => {
  const formatLifecycleDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const buyMin = item.buyZoneMin || item.ltp * 0.99;
  const buyMax = item.buyZoneMax || item.ltp * 1.01;

  const hasTradeLifecycle = hasConfirmedBuyTrigger(item);
  // Outcome badges are database events, never a client-side price guess.
  const isWon = item.status === 'WON';
  const isLost = item.status === 'LOST';
  const isTerminalSkipped = item.status === 'MISSED_GAP' || item.status === 'INVALIDATED' || item.status === 'EXPIRED';
  const isMonitorBase = !isWon && !isLost && !isTerminalSkipped && !hasTradeLifecycle;
  const isInProgress = hasTradeLifecycle && !isWon && !isLost && !isTerminalSkipped;
  const actualFillPrice = item.actualFillPrice || item.triggeredPrice;

  const buyZoneLabel = buyMax > buyMin
    ? `₹${buyMin.toFixed(2)} - ₹${buyMax.toFixed(2)}`
    : `₹${buyMin.toFixed(2)}`;
  const triggerLabel = item.triggerPrice && item.triggerPrice > 0
    ? `₹${item.triggerPrice.toFixed(2)}`
    : buyZoneLabel;
  const rationale = item.aiReasons?.length
    ? item.aiReasons.join(' • ')
    : 'No grounded rationale is available for this setup.';

  const actionHint = isWon
    ? 'Target achieved! Trade closed in profit.'
    : isLost
    ? 'Stop loss hit. Trade closed to preserve capital.'
    : isTerminalSkipped
    ? `No trade was opened. ${item.executionMissReason || item.status}.`
    : isMonitorBase
    ? item.entryTrigger || (item.triggerPrice
      ? `Wait for trigger above ₹${item.triggerPrice.toFixed(2)} with volume confirmation before entry.`
      : 'Wait for trigger-price and volume confirmation before entry.')
    : `${item.setupType} setup active: track live SL & Target distances.`;

  const hasTarget1 = item.target1 > 0;
  const hasStopLoss = item.stopLoss > 0;
  const hasRiskReward = item.riskReward > 0;
  const canTrade = hasTradeLifecycle && !isWon && !isLost && !isTerminalSkipped;

  // Calculate visual progress from SL to T1 only when a real risk plan exists.
  const sl = hasStopLoss ? item.stopLoss : 0;
  const t1 = hasTarget1 ? item.target1 : 0;
  const range = t1 - sl || 1;
  const hasProgressPlan = canTrade && hasTarget1 && hasStopLoss && t1 > sl;
  const currentPosPct = hasProgressPlan
    ? Math.min(Math.max(((item.ltp - sl) / range) * 100, 5), 95)
    : 0;

  const targetDistPct = item.target1 > 0 ? (((item.target1 - item.ltp) / item.ltp) * 100).toFixed(1) : '0.0';
  const slDistPct = item.stopLoss > 0 ? (((item.ltp - item.stopLoss) / item.ltp) * 100).toFixed(1) : '0.0';

  return (
    <div 
      onClick={() => onOpenDeepAnalysis(item)}
      className="bg-[#080B10] border border-cyan-500/20 hover:border-cyan-400/50 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer group"
    >
      {/* Card Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-extrabold text-white tracking-tight font-mono group-hover:text-cyan-400 transition-colors">{item.ticker}</h3>
          
          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
            {item.sector}
          </span>

          {/* Status Badge per State */}
          {isWon ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-500/50 flex items-center gap-1">
              🎯 TARGET HIT (WIN)
            </span>
          ) : isLost ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-500/50 flex items-center gap-1">
              💥 STOP LOSS HIT (LOSS)
            </span>
          ) : isTerminalSkipped ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-900 text-slate-300 border border-slate-500/40 flex items-center gap-1">
              {item.status === 'MISSED_GAP' ? 'ENTRY MISSED (GAP)' : item.status}
            </span>
          ) : isMonitorBase ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              QUALIFIED BASE
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400" />
              {item.status === 'TRIGGERED' ? 'TRIGGERED' : 'IN PROGRESS'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onAddToWatchlist(item);
            }}
            className={`p-1 rounded-lg transition-colors ${
              isInWatchlist ? 'text-amber-400 fill-amber-400' : 'text-gray-400 hover:text-white'
            }`}
            title={isInWatchlist ? 'Saved in Watchlist' : 'Add to Watchlist'}
          >
            <Star className={`w-4 h-4 ${isInWatchlist ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Confidence Circle Ring */}
          <div className="w-7 h-7 rounded-full border-2 border-cyan-400 text-cyan-300 font-mono text-xs font-black flex items-center justify-center bg-cyan-500/10 shrink-0">
            {Math.round(item.confidenceScore)}
          </div>
        </div>
      </div>

      {(item.discoverySources?.includes('INSTITUTIONAL') || (item.mlModelStatus && item.mlModelStatus !== 'DISABLED')) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono">
          {item.discoverySources?.includes('INSTITUTIONAL') && (
            <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-300">
              INSTITUTIONAL DISCOVERY{item.institutionalCandidateScore != null ? ` ${item.institutionalCandidateScore.toFixed(0)}/100` : ''}
            </span>
          )}
          {item.mlModelStatus && item.mlModelStatus !== 'DISABLED' && (
            <span
              className={`rounded border px-2 py-1 ${item.mlModelStatus === 'READY' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}
              title={item.mlModelName ? `${item.mlModelName} ${item.mlModelVersion || ''}` : 'ML model service status'}
            >
              ML {item.mlShadowMode === false ? 'RANK' : 'SHADOW'}{item.mlRank ? ` #${item.mlRank}` : ''} · {item.mlModelStatus}
            </span>
          )}
        </div>
      )}

      {(item.mlTriggerProbability != null || item.mlConditionalWinProbability != null || item.mlExpectedR != null) && (
        <div
          className="grid grid-cols-3 divide-x divide-cyan-500/10 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] px-2 py-2 font-mono"
          title="Shadow-model estimates only. Trigger probability is separate from win probability after entry."
        >
          <div className="px-1 text-center">
            <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">Trigger</span>
            <span className="text-[11px] font-black text-amber-300">
              {item.mlTriggerProbability != null ? `${item.mlTriggerProbability.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="px-1 text-center">
            <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">Win if triggered</span>
            <span className="text-[11px] font-black text-cyan-300">
              {item.mlConditionalWinProbability != null ? `${item.mlConditionalWinProbability.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="px-1 text-center">
            <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">Expected R</span>
            <span className={`text-[11px] font-black ${(item.mlExpectedR ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {item.mlExpectedR != null ? `${item.mlExpectedR >= 0 ? '+' : ''}${item.mlExpectedR.toFixed(2)}R` : '—'}
            </span>
          </div>
        </div>
      )}

      {hasTradeLifecycle && (item.mlPostTriggerWinProbability != null || item.mlPostTriggerExpectedR != null) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.05] px-3 py-2 font-mono">
          <div>
            <span className="block text-[8px] font-bold uppercase tracking-wider text-violet-300">
              Post-trigger ML · {item.mlPostTriggerModelStatus === 'READY' ? 'validated' : 'shadow'}
            </span>
            <span className="text-[9px] text-gray-500">Uses captured entry-time price and RVOL context</span>
          </div>
          <div className="flex shrink-0 gap-3 text-center">
            <div>
              <span className="block text-[8px] uppercase text-gray-500">Win</span>
              <span className="text-[11px] font-black text-violet-200">
                {item.mlPostTriggerWinProbability != null ? `${item.mlPostTriggerWinProbability.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div>
              <span className="block text-[8px] uppercase text-gray-500">Expected</span>
              <span className={`text-[11px] font-black ${(item.mlPostTriggerExpectedR ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {item.mlPostTriggerExpectedR != null
                  ? `${item.mlPostTriggerExpectedR >= 0 ? '+' : ''}${item.mlPostTriggerExpectedR.toFixed(2)}R`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Live LTP & Buy Zone Info Row */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
          <span>
            {hasTradeLifecycle
              ? `Actual Fill: ${actualFillPrice ? `₹${actualFillPrice.toFixed(2)}` : triggerLabel}`
              : isTerminalSkipped
              ? 'No Buy - Entry Skipped'
              : `Planned Buy: ${triggerLabel}`}
          </span>
        </div>
        <div className="text-white font-black bg-white/5 px-2 py-0.5 rounded border border-white/10">
          LTP ₹{item.ltp ? item.ltp.toFixed(2) : '—'}
        </div>
      </div>

      {/* Auditable sequence: planned breakout -> opening -> actual fill -> exit. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] px-3 py-2 text-[10px] font-mono">
        <div>
          <span className="block text-[8px] uppercase tracking-wider text-gray-500">Planned breakout</span>
          <span className="text-indigo-200">₹{(item.plannedBreakoutPrice || item.triggerPrice || item.buyZoneMin).toFixed(2)}</span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-wider text-gray-500">Maximum entry</span>
          <span className="text-indigo-200">{item.maxEntryPrice ? `₹${item.maxEntryPrice.toFixed(2)}` : '—'}</span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-wider text-gray-500">Market open</span>
          <span className={item.openingPrice ? 'text-amber-200' : 'text-gray-500'}>
            {item.openingPrice ? `₹${item.openingPrice.toFixed(2)}` : 'Not observed'}
          </span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-wider text-gray-500">Actual fill</span>
          <span className={actualFillPrice ? 'text-emerald-300' : 'text-gray-500'}>
            {actualFillPrice ? `₹${actualFillPrice.toFixed(2)}` : 'No fill'}
          </span>
        </div>
        {(item.actualExitPrice || item.executionMissReason) && (
          <div className="col-span-2 border-t border-white/10 pt-2">
            <span className="block text-[8px] uppercase tracking-wider text-gray-500">
              {item.actualExitPrice ? 'Recorded exit' : 'Entry decision'}
            </span>
            <span className={item.actualExitPrice ? 'text-cyan-300' : 'text-slate-300'}>
              {item.actualExitPrice ? `₹${item.actualExitPrice.toFixed(2)}` : item.executionMissReason}
            </span>
          </div>
        )}
      </div>

      {item.earlyBuyStatus === 'EARLY_BUY_READY' && item.earlyEntryLow && item.earlyEntryHigh ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.06] px-3 py-2 text-[10px] font-mono">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-violet-200">EARLY BUY {item.earlyBuyShadow !== false ? 'SHADOW' : 'READY'}</span>
            <span className="text-violet-300">{item.earlyBuyScore?.toFixed(0) || '—'}/100</span>
          </div>
          <p className="mt-1 text-gray-400">
            Zone ₹{item.earlyEntryLow.toFixed(2)}-₹{item.earlyEntryHigh.toFixed(2)} · 30% starter allocation. Breakout confirmation remains separate.
          </p>
        </div>
      ) : null}

      {item.preSurgeV3 ? (
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-mono ${
          item.preSurgeV3.eligible
            ? 'border-cyan-400/30 bg-cyan-400/[0.06]'
            : 'border-slate-500/20 bg-slate-500/[0.04]'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={item.preSurgeV3.eligible ? 'font-bold text-cyan-200' : 'font-bold text-slate-400'}>
              PRE-SURGE V3 SHADOW · {item.preSurgeV3.eligible ? 'READY' : 'FILTERED'}
            </span>
            <span className={item.preSurgeV3.eligible ? 'text-cyan-300' : 'text-slate-500'}>
              {item.preSurgeV3.score.toFixed(0)}/100
            </span>
          </div>
          {item.preSurgeV3.eligible ? (
            <div className="mt-1 space-y-1 text-gray-400">
              <p>{item.preSurgeV3.base.sessions}-session base · {item.preSurgeV3.base.rangePct.toFixed(1)}% range · {item.preSurgeV3.earlyEntry.riskPct.toFixed(1)}% structural risk</p>
              <p>20% early ₹{item.preSurgeV3.earlyEntry.zoneLow.toFixed(2)}-₹{item.preSurgeV3.earlyEntry.zoneHigh.toFixed(2)} · never chase above ₹{item.preSurgeV3.earlyEntry.maxEntry.toFixed(2)}</p>
              <p>Requires same-session zone touch, 5m VWAP reclaim, higher low and opening gap within limits</p>
              <p>80% add: 15m close above ₹{item.preSurgeV3.breakout.pivot.toFixed(2)} · RVOL ≥ {item.preSurgeV3.breakout.minimumRvol.toFixed(1)}x</p>
              <p>T1 ₹{item.preSurgeV3.exits.partialTarget.toFixed(2)} at 2R (50%) · T2 ₹{item.preSurgeV3.exits.finalTarget.toFixed(2)} then trail</p>
            </div>
          ) : (
            <p className="mt-1 text-slate-500">
              {item.preSurgeV3.rejectionReasons.slice(0, 2).join(' · ') || 'V3 quality gates not met'}
            </p>
          )}
        </div>
      ) : null}

      {/* Live progress starts only after trigger confirmation. */}
      {isMonitorBase ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200 font-mono">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold uppercase tracking-wider">Projected levels</span>
            <span className="text-amber-300 font-bold">WAITING FOR TRIGGER</span>
          </div>
          <p className="mt-1 text-gray-400">Live SL/T1 tracking begins after price and volume confirmation.</p>
        </div>
      ) : hasProgressPlan ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-red-400 font-bold">SL ₹{sl.toFixed(1)} {isInProgress && `(-${slDistPct}%)`}</span>
            <span className="text-cyan-400 font-bold">T1 ₹{t1.toFixed(1)} {isInProgress && `(+${targetDistPct}%)`}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden relative border border-white/5">
            <div
              className={`h-full rounded-full ${
                isWon ? 'bg-emerald-400' : isLost ? 'bg-red-500' : 'bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400'
              }`}
              style={{ width: `${currentPosPct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] text-gray-500 font-mono">
          Live risk plan unavailable.
        </div>
      )}

      {/* Targets & Stop Loss 2-Column Grid Box */}
      <div className="grid grid-cols-2 gap-3 p-2.5 rounded-xl bg-[#0D1117] border border-white/5 text-xs font-mono">
        {/* Targets Col */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block font-sans">
            {isMonitorBase ? 'PROJECTED LEVELS' : 'TARGETS'}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">{isMonitorBase ? 'Projected T1' : 'T1'}</span>
            <span className="text-emerald-400 font-bold">{hasTarget1 ? `₹${item.target1.toFixed(2)}` : 'Unavailable'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">T2</span>
            <span className="text-emerald-400 font-bold">{item.target2 ? `₹${item.target2.toFixed(2)}` : 'Unavailable'}</span>
          </div>
        </div>

        {/* Stop Loss Col */}
        <div className="space-y-1 border-l border-white/10 pl-3">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block font-sans">
            {isMonitorBase ? 'PROJECTED RISK' : 'STOP LOSS'}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">{isMonitorBase ? 'Projected SL' : 'SL'}</span>
            <span className="text-red-400 font-bold">{hasStopLoss ? `₹${item.stopLoss.toFixed(2)}` : 'Unavailable'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-[10px]">R:R</span>
            <span className="text-white font-bold">{hasRiskReward ? `${item.riskReward.toFixed(1)} : 1` : 'Unavailable'}</span>
          </div>
        </div>
      </div>

      {/* Grounded AI Triggers Box */}
      <div className="p-2 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[11px] text-cyan-200/90 leading-relaxed font-sans">
        <p className="line-clamp-3">
          {rationale}
        </p>
      </div>

      {/* Durable lifecycle timestamps make every historical setup auditable. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] font-mono">
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-gray-500">Qualified</span>
          <span className="text-gray-300">{formatLifecycleDate(item.qualifiedAt)}</span>
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-gray-500">Triggered</span>
          <span className={item.actualFillAt || item.triggeredAt ? 'text-emerald-300' : 'text-amber-300'}>
            {formatLifecycleDate(item.actualFillAt || item.triggeredAt)}
          </span>
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-gray-500">Updated</span>
          <span className="text-gray-300">{formatLifecycleDate(item.updatedAt)}</span>
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-gray-500">Resolved</span>
          <span className={item.resolvedAt ? 'text-cyan-300' : 'text-gray-500'}>
            {formatLifecycleDate(item.resolvedAt)}
          </span>
        </div>
        {item.triggeredVolumeRatio ? (
          <div className="col-span-2 border-t border-white/10 pt-2">
            <span className="block text-[9px] uppercase tracking-wider text-gray-500">Trigger confirmation</span>
            <span className="text-emerald-300">
              RVOL {item.triggeredVolumeRatio.toFixed(2)}x{item.triggeredPrice ? ` at ₹${item.triggeredPrice.toFixed(2)}` : ''}
            </span>
          </div>
        ) : null}
      </div>

      {/* Action Hint Banner */}
      <div className="p-2 rounded-lg bg-teal-950/40 border border-teal-500/30 text-[10px] text-teal-300 font-medium">
        {actionHint}
      </div>

      {/* Bottom Action Row */}
      <div className="flex items-center justify-between pt-1">
        <button 
          onClick={() => onOpenDeepAnalysis(item)}
          className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold underline decoration-cyan-500/30 underline-offset-2"
        >
          View Technicals
        </button>

        <button
          disabled={!canTrade}
          onClick={(e) => {
            e.stopPropagation();
            if (canTrade) onOpenLogTrade(item);
          }}
          title={canTrade ? 'Log active trade' : 'Wait for trigger confirmation before trading'}
          className={`px-4 py-1.5 rounded-lg font-extrabold text-xs flex items-center gap-1.5 transition-all ${
            canTrade
              ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 cursor-pointer'
              : 'bg-gray-800 text-gray-500 border border-white/10 cursor-not-allowed'
          }`}
        >
          <span>{canTrade ? 'Trade' : isMonitorBase ? 'Wait for Trigger' : isTerminalSkipped ? 'No Trade' : 'Closed'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
