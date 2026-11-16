import React from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { BoardMode, LadderBoard } from './components/LadderBoard';
import { LayerExamples } from './components/LayerExamples';
import { ProbabilityMatrix } from './components/ProbabilityMatrix';
import {
  BoardGrid,
  LockedPair,
  MAX_RUNGS,
  MIN_RUNGS,
  computeRouteHighlight,
  countPlacedRungs,
  createEmptyBoard,
  hasAdjacentConflict,
  solveLadder,
} from './utils/ladderSolver';

export default function App() {
  const [targetRungs, setTargetRungs] = React.useState<number>(5);
  const [rungInputText, setRungInputText] = React.useState<string>('5');
  const [board, setBoard] = React.useState<BoardGrid>(() => createEmptyBoard());
  const [boardMode, setBoardMode] = React.useState<BoardMode>('lock');
  const [selectedStart, setSelectedStart] = React.useState<number | null>(null);
  const [selectedEnd, setSelectedEnd] = React.useState<number | null>(null);
  const [lockedPairs, setLockedPairs] = React.useState<LockedPair[]>([]);
  const [conflictNotice, setConflictNotice] = React.useState<string | null>(null);

  const solveResult = React.useMemo(
    () => solveLadder(board, targetRungs, lockedPairs),
    [board, targetRungs, lockedPairs],
  );

  const routeHighlight = React.useMemo(() => {
    if (selectedStart === null || selectedEnd === null) return null;
    if (solveResult.totalBoards === 0) return null;
    return computeRouteHighlight(board, targetRungs, selectedStart, selectedEnd, lockedPairs);
  }, [board, targetRungs, selectedStart, selectedEnd, lockedPairs, solveResult.totalBoards]);

  const applyTargetRungs = (next: number) => {
    const clamped = Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, Math.round(next)));
    setTargetRungs(clamped);
    setRungInputText(String(clamped));
    setConflictNotice(null);
  };

  const handleRungInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setRungInputText(raw);
    if (raw === '') return;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= MIN_RUNGS && parsed <= MAX_RUNGS) {
      setTargetRungs(parsed);
      setConflictNotice(null);
    }
  };

  const handleRungInputBlur = () => {
    const parsed = Number.parseInt(rungInputText, 10);
    if (Number.isNaN(parsed)) {
      setRungInputText(String(targetRungs));
    } else {
      applyTargetRungs(parsed);
    }
  };

  const handleToggleGap = (row: number, gap: number) => {
    setConflictNotice(null);

    setBoard((prev) => {
      const current = prev[row][gap];
      const placed = countPlacedRungs(prev);

      if (current === 'rung') {
        const next = prev.map((r) => [...r]);
        next[row][gap] = 'unknown';
        return next;
      }
      if (hasAdjacentConflict(prev, row, gap)) {
        setConflictNotice('同一列相鄰橫線不可相連');
        return prev;
      }
      if (placed >= targetRungs) {
        setConflictNotice(`已達設定上限 ${targetRungs} 條橫線`);
        return prev;
      }
      const next = prev.map((r) => [...r]);
      next[row][gap] = 'rung';
      return next;
    });
  };

  const lockOrReplacePair = (startCol: number, endCol: number) => {
    setConflictNotice(null);
    setLockedPairs((prev) => {
      const filtered = prev.filter((p) => p.start !== startCol && p.end !== endCol);
      return [...filtered, { start: startCol, end: endCol }];
    });
    setSelectedStart(null);
    setSelectedEnd(null);
  };

  const handleUnlockPair = (startCol: number, endCol: number) => {
    setConflictNotice(null);
    setLockedPairs((prev) => prev.filter((p) => !(p.start === startCol && p.end === endCol)));
  };

  const handleChangeBoardMode = (mode: BoardMode) => {
    setBoardMode(mode);
    setConflictNotice(null);
    // Keep lockedPairs intact across mode switches; if both start+end were highlighted when returning to lock, clear pair highlight
    if (mode === 'lock' && selectedStart !== null && selectedEnd !== null) {
      setSelectedStart(null);
      setSelectedEnd(null);
    }
  };

  const handleClickStart = (col: number) => {
    setConflictNotice(null);

    if (boardMode === 'lock') {
      const existing = lockedPairs.find((p) => p.start === col);
      if (existing) {
        handleUnlockPair(existing.start, existing.end);
        return;
      }
      if (selectedEnd !== null) {
        if (solveResult.totalBoards > 0 && solveResult.probabilities[col][selectedEnd] <= 0) {
          setConflictNotice('該起終點目前無可行路徑，無法鎖定');
          return;
        }
        lockOrReplacePair(col, selectedEnd);
        return;
      }
      setSelectedStart((prev) => (prev === col ? null : col));
    } else {
      const locked = lockedPairs.find((p) => p.start === col);
      if (selectedStart === col && (selectedEnd === null || (locked && selectedEnd === locked.end))) {
        setSelectedStart(null);
        setSelectedEnd(null);
      } else {
        setSelectedStart(col);
        setSelectedEnd(locked ? locked.end : null);
      }
    }
  };

  const handleClickEnd = (col: number) => {
    setConflictNotice(null);

    if (boardMode === 'lock') {
      const existing = lockedPairs.find((p) => p.end === col);
      if (existing) {
        handleUnlockPair(existing.start, existing.end);
        return;
      }
      if (selectedStart !== null) {
        if (solveResult.totalBoards > 0 && solveResult.probabilities[selectedStart][col] <= 0) {
          setConflictNotice('該起終點目前無可行路徑，無法鎖定');
          return;
        }
        lockOrReplacePair(selectedStart, col);
        return;
      }
      setSelectedEnd((prev) => (prev === col ? null : col));
    } else {
      const locked = lockedPairs.find((p) => p.end === col);
      if (selectedEnd === col && (selectedStart === null || (locked && selectedStart === locked.start))) {
        setSelectedStart(null);
        setSelectedEnd(null);
      } else {
        setSelectedEnd(col);
        setSelectedStart(locked ? locked.start : null);
      }
    }
  };

  const handleSelectPairFromMatrix = (startCol: number, endCol: number) => {
    setConflictNotice(null);

    if (boardMode === 'lock') {
      const exists = lockedPairs.some((p) => p.start === startCol && p.end === endCol);
      if (exists) {
        handleUnlockPair(startCol, endCol);
      } else {
        if (solveResult.totalBoards > 0 && solveResult.probabilities[startCol][endCol] <= 0) {
          setConflictNotice('該起終點目前無可行路徑，無法鎖定');
          return;
        }
        lockOrReplacePair(startCol, endCol);
      }
      return;
    }

    if (selectedStart === startCol && selectedEnd === endCol) {
      setSelectedStart(null);
      setSelectedEnd(null);
    } else {
      setSelectedStart(startCol);
      setSelectedEnd(endCol);
    }
  };

  const handleReset = () => {
    setBoard(createEmptyBoard());
    setSelectedStart(null);
    setSelectedEnd(null);
    setLockedPairs([]);
    setConflictNotice(null);
  };

  return (
    <div className="min-h-screen bg-[#0b111b] text-slate-100">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Title + Rung Quantity Setting directly underneath */}
        <header className="mb-6 border-b border-slate-800/80 pb-5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-50">
            神木之芽 路線運算
          </h1>

          {/* Quantity control placed directly under the title */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="rung-count-input"
                className="text-sm font-medium text-slate-300 whitespace-nowrap"
              >
                橫線數量（{MIN_RUNGS}–{MAX_RUNGS}）
              </label>

              <div className="inline-flex items-center rounded-lg border border-slate-700 bg-[#111a28]">
                <button
                  type="button"
                  onClick={() => applyTargetRungs(targetRungs - 1)}
                  disabled={targetRungs <= MIN_RUNGS}
                  aria-label="減少橫線數量"
                  className="flex h-10 w-10 items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed rounded-l-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  id="rung-count-input"
                  type="number"
                  min={MIN_RUNGS}
                  max={MAX_RUNGS}
                  inputMode="numeric"
                  value={rungInputText}
                  onChange={handleRungInputChange}
                  onBlur={handleRungInputBlur}
                  className="h-10 w-14 bg-transparent text-center text-base font-semibold font-mono-num text-cyan-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => applyTargetRungs(targetRungs + 1)}
                  disabled={targetRungs >= MAX_RUNGS}
                  aria-label="增加橫線數量"
                  className="flex h-10 w-10 items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed rounded-r-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono-num">
                <span>
                  已放置 {solveResult.placedCount} / {targetRungs}
                </span>
                <span aria-hidden="true">·</span>
                <span>有效組合 {solveResult.totalBoards.toLocaleString('en-US')} 種</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111a28] px-4 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              重設
            </button>
          </div>
        </header>

        {/* Main Workspace: Ladder Board + Probability Matrix */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(400px,1.08fr)_1fr] lg:items-stretch">
          <LadderBoard
            board={board}
            boardMode={boardMode}
            onChangeBoardMode={handleChangeBoardMode}
            onToggleGap={handleToggleGap}
            selectedStart={selectedStart}
            selectedEnd={selectedEnd}
            onClickStart={handleClickStart}
            onClickEnd={handleClickEnd}
            lockedPairs={lockedPairs}
            onUnlockPair={handleUnlockPair}
            solveResult={solveResult}
            routeHighlight={routeHighlight}
            targetRungs={targetRungs}
            conflictNotice={conflictNotice}
          />

          <ProbabilityMatrix
            solveResult={solveResult}
            boardMode={boardMode}
            selectedStart={selectedStart}
            selectedEnd={selectedEnd}
            lockedPairs={lockedPairs}
            onSelectStart={handleClickStart}
            onSelectEnd={handleClickEnd}
            onSelectPair={handleSelectPairFromMatrix}
          />
        </div>

        <LayerExamples />
      </main>
    </div>
  );
}
