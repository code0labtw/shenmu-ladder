import React from 'react';
import { Lock, Search, X } from 'lucide-react';
import {
  BoardGrid,
  END_LABELS,
  LockedPair,
  NUM_COLS,
  NUM_ROWS,
  RouteHighlight,
  START_LABELS,
  SolveResult,
  hasAdjacentConflict,
  traceCurrentPath,
} from '../utils/ladderSolver';

export type BoardMode = 'lock' | 'inspect';

interface LadderBoardProps {
  board: BoardGrid;
  boardMode: BoardMode;
  onChangeBoardMode: (mode: BoardMode) => void;
  onToggleGap: (row: number, gap: number) => void;
  selectedStart: number | null;
  selectedEnd: number | null;
  onClickStart: (col: number) => void;
  onClickEnd: (col: number) => void;
  lockedPairs: LockedPair[];
  onUnlockPair: (startCol: number, endCol: number) => void;
  solveResult: SolveResult;
  routeHighlight: RouteHighlight | null;
  targetRungs: number;
  conflictNotice: string | null;
}

const SVG_W = 600;
const SVG_H = 330;
const TOP_Y = 18;
const BOT_Y = 312;
const ROW_START_Y = 67;
const ROW_STEP_Y = 49;

function colX(col: number): number {
  return (col + 0.5) * 100;
}

function rowY(row: number): number {
  return ROW_START_Y + row * ROW_STEP_Y;
}

function segYStart(seg: number): number {
  return seg === 0 ? TOP_Y : rowY(seg - 1);
}

function segYEnd(seg: number): number {
  return seg === NUM_ROWS ? BOT_Y : rowY(seg);
}

function formatPct(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  return `${(p * 100).toFixed(1)}%`;
}

export const LadderBoard: React.FC<LadderBoardProps> = ({
  board,
  boardMode,
  onChangeBoardMode,
  onToggleGap,
  selectedStart,
  selectedEnd,
  onClickStart,
  onClickEnd,
  lockedPairs,
  onUnlockPair,
  solveResult,
  routeHighlight,
  targetRungs,
  conflictNotice,
}) => {
  const { probabilities, totalBoards, placedCount, isCompleteBoard } = solveResult;

  const hasPairSelected = selectedStart !== null && selectedEnd !== null;
  const hasActivePairHighlight =
    hasPairSelected && routeHighlight !== null && routeHighlight.matchingBoards > 0;

  const lockedByStart = new Map<number, number>();
  const lockedByEnd = new Map<number, number>();
  for (const p of lockedPairs) {
    lockedByStart.set(p.start, p.end);
    lockedByEnd.set(p.end, p.start);
  }

  let bestStartProb = -1;
  if (selectedEnd !== null && totalBoards > 0) {
    for (let s = 0; s < NUM_COLS; s++) {
      if (probabilities[s][selectedEnd] > bestStartProb) {
        bestStartProb = probabilities[s][selectedEnd];
      }
    }
  }

  let bestEndProb = -1;
  if (selectedStart !== null && totalBoards > 0) {
    for (let e = 0; e < NUM_COLS; e++) {
      if (probabilities[selectedStart][e] > bestEndProb) {
        bestEndProb = probabilities[selectedStart][e];
      }
    }
  }

  const tracedPathPoints = React.useMemo(() => {
    if (selectedStart === null || hasPairSelected) return null;
    if (!isCompleteBoard && placedCount < targetRungs) return null;
    const pts = traceCurrentPath(board, selectedStart);
    return pts
      .map((pt) => {
        const y = pt.row === 0 ? TOP_Y : pt.row > NUM_ROWS ? BOT_Y : rowY(pt.row - 1);
        return `${colX(pt.col)},${y}`;
      })
      .join(' ');
  }, [board, selectedStart, hasPairSelected, isCompleteBoard, placedCount, targetRungs]);

  const hasAnyTopSub = lockedPairs.length > 0 || selectedEnd !== null;
  const hasAnyBotSub = lockedPairs.length > 0 || selectedStart !== null;

  return (
    <section
      aria-label="迷宮路線盤面"
      className="rounded-xl border border-slate-800/90 bg-[#111a28] p-4 sm:p-5"
    >
      {/* 2-mode switch: Lock known routes vs Query probabilities (locks are preserved) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="操作模式"
          className="inline-flex items-center rounded-lg bg-[#0b111b] p-1 border border-slate-800"
        >
          <button
            type="button"
            onClick={() => onChangeBoardMode('lock')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
              boardMode === 'lock'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            鎖定已知路線
          </button>
          <button
            type="button"
            onClick={() => onChangeBoardMode('inspect')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
              boardMode === 'inspect'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            查詢機率
          </button>
        </div>
      </div>

      {/* Clear 1-line guidance / status */}
      <div className="min-h-6 mb-2.5 flex items-center">
        {conflictNotice ? (
          <p role="status" className="text-xs font-medium text-rose-400">
            {conflictNotice}
          </p>
        ) : hasPairSelected ? (
          totalBoards > 0 && routeHighlight && routeHighlight.matchingBoards > 0 ? (
            <p role="status" className="text-xs font-medium text-amber-300">
              已高亮：{START_LABELS[selectedStart!]} → {END_LABELS[selectedEnd!]}（命中率{' '}
              <span className="font-mono-num">
                {formatPct(probabilities[selectedStart!][selectedEnd!])}
              </span>
              ）
            </p>
          ) : (
            <p role="status" className="text-xs font-medium text-rose-300">
              {START_LABELS[selectedStart!]} → {END_LABELS[selectedEnd!]} 目前無可行路徑（0%）
            </p>
          )
        ) : boardMode === 'lock' ? (
          <p className="text-xs text-slate-300">
            {selectedStart !== null ? (
              <>
                已選起點{' '}
                <span className="text-amber-300 font-semibold">{START_LABELS[selectedStart]}</span>
                ，再點下方終點 <span className="text-amber-300 font-semibold">1–6</span> 即可鎖定
              </>
            ) : selectedEnd !== null ? (
              <>
                已選終點{' '}
                <span className="text-amber-300 font-semibold">{END_LABELS[selectedEnd]}</span>
                ，再點上方起點 <span className="text-amber-300 font-semibold">A–F</span> 即可鎖定
              </>
            ) : (
              '依序點「起點 → 終點」鎖定已知路線（切至「查詢機率」不會清除鎖定）'
            )}
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            點 <span className="text-slate-200 font-medium">A–F</span> 查落點機率 · 點{' '}
            <span className="text-slate-200 font-medium">1–6</span> 找最佳起點（鎖定路線維持不變）
          </p>
        )}
      </div>

      {/* Start Nodes (A - F) */}
      <div className="grid grid-cols-6 gap-1.5 sm:gap-2 mb-2">
        {START_LABELS.map((label, col) => {
          const isSelected = selectedStart === col;
          const lockedEnd = lockedByStart.get(col);
          const isLocked = lockedEnd !== undefined;
          const targetProb =
            selectedEnd !== null && totalBoards > 0 ? probabilities[col][selectedEnd] : null;
          const isBest =
            targetProb !== null &&
            !isLocked &&
            bestStartProb > 0 &&
            Math.abs(targetProb - bestStartProb) < 1e-9;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onClickStart(col)}
              aria-pressed={isSelected || isLocked}
              className={`flex flex-col items-center justify-center rounded-lg px-1 h-[54px] border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : isLocked
                    ? 'border-cyan-500/45 bg-cyan-950/35 text-cyan-100 hover:border-cyan-400'
                    : isBest
                      ? 'border-amber-400/60 bg-amber-500/10 text-amber-100 hover:border-amber-400'
                      : 'border-slate-700/80 bg-[#0d1522] text-slate-200 hover:border-slate-500 hover:bg-slate-800/60'
              }`}
            >
              <span className="text-base font-bold leading-none">{label}</span>
              {hasAnyTopSub && (
                <span className="mt-1.5 h-3.5 inline-flex items-center justify-center gap-1 text-[11px] font-mono-num leading-none whitespace-nowrap">
                  {isLocked ? (
                    <span className="inline-flex items-center gap-1 text-cyan-300 font-medium">
                      <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      <span>鎖定 {END_LABELS[lockedEnd]}</span>
                    </span>
                  ) : targetProb !== null ? (
                    <span className={isBest ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                      {isBest ? `最佳 ${formatPct(targetProb)}` : formatPct(targetProb)}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Interactive Ladder Canvas */}
      <div className="relative w-full aspect-[600/330] select-none rounded-lg bg-[#0a101a] border border-slate-800/80 overflow-hidden">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="h-full w-full block" aria-hidden="true">
          <defs>
            <filter id="rungGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Subtle horizontal row guide lines */}
          {Array.from({ length: NUM_ROWS }).map((_, r) => (
            <line
              key={`guide-${r}`}
              x1={colX(0)}
              y1={rowY(r)}
              x2={colX(NUM_COLS - 1)}
              y2={rowY(r)}
              stroke="rgba(148, 163, 184, 0.08)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          {/* Base vertical lines A-F */}
          {Array.from({ length: NUM_COLS }).map((_, c) => {
            const x = colX(c);
            const isHighlightedTop = selectedStart === c;
            const isHighlightedBot = selectedEnd === c;
            return (
              <g key={`col-${c}`}>
                <line
                  x1={x}
                  y1={TOP_Y}
                  x2={x}
                  y2={BOT_Y}
                  stroke={
                    hasPairSelected
                      ? 'rgba(56, 189, 248, 0.18)'
                      : isHighlightedTop
                        ? 'rgba(56, 189, 248, 0.7)'
                        : 'rgba(56, 189, 248, 0.42)'
                  }
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <circle
                  cx={x}
                  cy={TOP_Y}
                  r="5.5"
                  fill="#0a101a"
                  stroke={isHighlightedTop ? '#fbbf24' : '#38bdf8'}
                  strokeWidth="2.5"
                />
                <circle
                  cx={x}
                  cy={BOT_Y}
                  r="5.5"
                  fill="#0a101a"
                  stroke={isHighlightedBot ? '#fbbf24' : '#38bdf8'}
                  strokeWidth="2.5"
                />
                {Array.from({ length: NUM_ROWS }).map((__, r) => (
                  <circle
                    key={`dot-${c}-${r}`}
                    cx={x}
                    cy={rowY(r)}
                    r="3.2"
                    fill="#e2e8f0"
                    opacity={hasPairSelected ? '0.45' : '0.85'}
                  />
                ))}
              </g>
            );
          })}

          {/* Highlighted vertical segments for selected start -> end pair */}
          {hasActivePairHighlight &&
            routeHighlight!.verticalProb.map((cols, seg) =>
              cols.map((prob, col) => {
                if (prob <= 0) return null;
                const x = colX(col);
                const isCertain = prob >= 0.999;
                const opacity = isCertain ? 1 : 0.28 + 0.65 * prob;
                return (
                  <line
                    key={`h-vert-${seg}-${col}`}
                    x1={x}
                    y1={segYStart(seg)}
                    x2={x}
                    y2={segYEnd(seg)}
                    stroke="#fbbf24"
                    strokeWidth={isCertain ? 5 : 4}
                    strokeLinecap="round"
                    opacity={opacity}
                    filter={isCertain ? 'url(#rungGlow)' : undefined}
                  />
                );
              }),
            )}

          {/* Possible unplaced horizontal bridges along matching start -> end routes */}
          {hasActivePairHighlight &&
            board.map((rowArr, r) =>
              rowArr.map((cell, g) => {
                if (cell !== 'unknown') return null;
                const prob = routeHighlight!.gapProb[r][g];
                if (prob <= 0) return null;
                const x1 = colX(g);
                const x2 = colX(g + 1);
                const y = rowY(r);
                const isCertain = prob >= 0.999;
                return (
                  <line
                    key={`h-ghost-${r}-${g}`}
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    stroke="#fbbf24"
                    strokeWidth={isCertain ? 4 : 3}
                    strokeDasharray={isCertain ? undefined : '6 5'}
                    strokeLinecap="round"
                    opacity={isCertain ? 0.95 : 0.25 + 0.6 * prob}
                  />
                );
              }),
            )}

          {/* Blocked markers and Placed Rungs */}
          {board.map((rowArr, r) =>
            rowArr.map((cell, g) => {
              const x1 = colX(g);
              const x2 = colX(g + 1);
              const y = rowY(r);
              if (cell === 'rung') {
                const pairGapProb = hasActivePairHighlight ? routeHighlight!.gapProb[r][g] : 0;
                const isPairHighlightedRung = pairGapProb > 0;
                const isCertain = pairGapProb >= 0.999;

                return (
                  <g
                    key={`rung-${r}-${g}`}
                    filter="url(#rungGlow)"
                    opacity={
                      hasActivePairHighlight && !isPairHighlightedRung
                        ? 0.35
                        : isPairHighlightedRung && !isCertain
                          ? 0.45 + 0.55 * pairGapProb
                          : 1
                    }
                  >
                    <line
                      x1={x1}
                      y1={y}
                      x2={x2}
                      y2={y}
                      stroke={isPairHighlightedRung ? '#fbbf24' : '#22d3ee'}
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={x1}
                      cy={y}
                      r="4.5"
                      fill={isPairHighlightedRung ? '#fef3c7' : '#ecfeff'}
                    />
                    <circle
                      cx={x2}
                      cy={y}
                      r="4.5"
                      fill={isPairHighlightedRung ? '#fef3c7' : '#ecfeff'}
                    />
                  </g>
                );
              }
              return null;
            }),
          )}

          {/* Deterministic traced route overlay when only start is selected on complete board */}
          {tracedPathPoints && (
            <polyline
              points={tracedPathPoints}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#rungGlow)"
            />
          )}
        </svg>

        {/* Accessible interactive hit-targets aligned precisely over every gap */}
        {board.map((rowArr, r) =>
          rowArr.map((cell, g) => {
            const adjacentBlocked = cell !== 'rung' && hasAdjacentConflict(board, r, g);
            const leftPct = ((g + 0.5) / NUM_COLS) * 100;
            const widthPct = (1 / NUM_COLS) * 100;
            const topPct = ((rowY(r) - 22) / SVG_H) * 100;
            const heightPct = (44 / SVG_H) * 100;

            return (
              <button
                key={`hit-${r}-${g}`}
                type="button"
                onClick={() => onToggleGap(r, g)}
                aria-label={`第 ${r + 1} 列 ${START_LABELS[g]} 與 ${START_LABELS[g + 1]} 之間，目前為${
                  cell === 'rung' ? '已放置橫線' : '未放置橫線'
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: `${topPct}%`,
                  height: `${heightPct}%`,
                }}
                className={`group absolute flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  adjacentBlocked ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <span
                  className={`h-1.5 w-[72%] rounded-full transition-opacity duration-150 ${
                    cell === 'unknown' && !adjacentBlocked
                      ? 'bg-cyan-400/0 group-hover:bg-cyan-400/35'
                      : 'opacity-0'
                  }`}
                />
              </button>
            );
          }),
        )}
      </div>

      {/* End / Reward Nodes (1 - 6) */}
      <div className="grid grid-cols-6 gap-1.5 sm:gap-2 mt-2">
        {END_LABELS.map((label, col) => {
          const isSelected = selectedEnd === col;
          const lockedStart = lockedByEnd.get(col);
          const isLocked = lockedStart !== undefined;
          const startProb =
            selectedStart !== null && totalBoards > 0 ? probabilities[selectedStart][col] : null;
          const isBest =
            startProb !== null &&
            !isLocked &&
            bestEndProb > 0 &&
            Math.abs(startProb - bestEndProb) < 1e-9;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onClickEnd(col)}
              aria-pressed={isSelected || isLocked}
              className={`flex flex-col items-center justify-center rounded-lg px-1 h-[54px] border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : isLocked
                    ? 'border-cyan-500/45 bg-cyan-950/35 text-cyan-100 hover:border-cyan-400'
                    : isBest
                      ? 'border-amber-400/60 bg-amber-500/10 text-amber-100 hover:border-amber-400'
                      : 'border-slate-700/80 bg-[#0d1522] text-slate-200 hover:border-slate-500 hover:bg-slate-800/60'
              }`}
            >
              <span className="text-base font-bold font-mono-num leading-none">{label}</span>
              {hasAnyBotSub && (
                <span className="mt-1.5 h-3.5 inline-flex items-center justify-center gap-1 text-[11px] font-mono-num leading-none whitespace-nowrap">
                  {isLocked ? (
                    <span className="inline-flex items-center gap-1 text-cyan-300 font-medium">
                      <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      <span>鎖定 {START_LABELS[lockedStart]}</span>
                    </span>
                  ) : startProb !== null ? (
                    <span className={isBest ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                      {formatPct(startProb)}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Locked connections bar (only visible when pairs are locked) */}
      {lockedPairs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">已鎖定路線：</span>
          {lockedPairs.map((pair) => (
            <button
              key={`${pair.start}-${pair.end}`}
              type="button"
              onClick={() => onUnlockPair(pair.start, pair.end)}
              aria-label={`解除鎖定 ${START_LABELS[pair.start]} 到 ${END_LABELS[pair.end]}`}
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-xs font-mono-num font-medium text-cyan-200 hover:bg-cyan-500/25 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              <span>
                {START_LABELS[pair.start]} → {END_LABELS[pair.end]}
              </span>
              <X className="h-3 w-3 opacity-80" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
