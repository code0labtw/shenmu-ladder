import React from 'react';
import { Lock } from 'lucide-react';
import { END_LABELS, LockedPair, NUM_COLS, START_LABELS, SolveResult } from '../utils/ladderSolver';

interface ProbabilityMatrixProps {
  solveResult: SolveResult;
  boardMode: 'lock' | 'inspect';
  selectedStart: number | null;
  selectedEnd: number | null;
  lockedPairs: LockedPair[];
  onSelectStart: (col: number) => void;
  onSelectEnd: (col: number) => void;
  onSelectPair: (startCol: number, endCol: number) => void;
}

function formatCellPct(p: number): string {
  if (p <= 0) return '—';
  if (p >= 1) return '100%';
  return `${(p * 100).toFixed(1)}%`;
}

export const ProbabilityMatrix: React.FC<ProbabilityMatrixProps> = ({
  solveResult,
  boardMode,
  selectedStart,
  selectedEnd,
  lockedPairs,
  onSelectStart,
  onSelectEnd,
  onSelectPair,
}) => {
  const { totalBoards, probabilities, error } = solveResult;

  // Compute best start(s) for each reward column
  const colMaxProb = React.useMemo(() => {
    const maxes = Array(NUM_COLS).fill(0);
    if (totalBoards === 0) return maxes;
    for (let e = 0; e < NUM_COLS; e++) {
      let m = 0;
      for (let s = 0; s < NUM_COLS; s++) {
        if (probabilities[s][e] > m) m = probabilities[s][e];
      }
      maxes[e] = m;
    }
    return maxes;
  }, [probabilities, totalBoards]);

  // Compute best recommendation text if a target reward is selected
  const bestForSelectedEnd = React.useMemo(() => {
    if (selectedEnd === null || totalBoards === 0) return null;
    const maxP = colMaxProb[selectedEnd];
    if (maxP <= 0) return null;
    const bestStarts = START_LABELS.filter(
      (_, s) => Math.abs(probabilities[s][selectedEnd] - maxP) < 1e-9,
    );
    return {
      labels: bestStarts.join(' / '),
      pct: formatCellPct(maxP),
    };
  }, [selectedEnd, totalBoards, colMaxProb, probabilities]);

  const selectedPairPct =
    selectedStart !== null && selectedEnd !== null && totalBoards > 0
      ? probabilities[selectedStart][selectedEnd]
      : null;

  return (
    <section
      aria-label="路線機率矩陣"
      className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-[#111a28] p-4 sm:p-5"
    >
      <div>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100">起點對終點機率表</h2>
          {selectedStart !== null && selectedEnd !== null && selectedPairPct !== null ? (
            <p className="text-xs text-amber-300 font-medium">
              已選路徑：{START_LABELS[selectedStart]} → {END_LABELS[selectedEnd]}（
              <span className="font-mono-num">{formatCellPct(selectedPairPct)}</span>）
            </p>
          ) : bestForSelectedEnd ? (
            <p className="text-xs text-amber-300 font-medium">
              目標 {END_LABELS[selectedEnd!]} 最佳起點：{bestForSelectedEnd.labels}（
              <span className="font-mono-num">{bestForSelectedEnd.pct}</span>）
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              {boardMode === 'lock'
                ? '點機率格可直接鎖定／解鎖該路線'
                : '點機率格可在左側盤面高亮該路線'}
            </p>
          )}
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200"
          >
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-2.5 pr-2 text-left text-xs font-medium text-slate-400 whitespace-nowrap">
                    起點 \ 終點
                  </th>
                  {END_LABELS.map((label, e) => {
                    const active = selectedEnd === e;
                    return (
                      <th key={label} className="p-1">
                        <button
                          type="button"
                          onClick={() => onSelectEnd(e)}
                          aria-pressed={active}
                          className={`w-full rounded-md py-1.5 text-xs font-semibold font-mono-num transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            active
                              ? 'bg-amber-500/20 text-amber-200 border border-amber-400/60'
                              : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          {label}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {START_LABELS.map((startLabel, s) => {
                  const rowActive = selectedStart === s;
                  return (
                    <tr
                      key={startLabel}
                      className={rowActive ? 'bg-amber-500/6' : 'hover:bg-slate-800/25'}
                    >
                      <td className="py-2 pr-2 text-left">
                        <button
                          type="button"
                          onClick={() => onSelectStart(s)}
                          aria-pressed={rowActive}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            rowActive
                              ? 'bg-amber-500/20 text-amber-200 border border-amber-400/60'
                              : 'bg-[#0b111b] text-slate-200 border border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          {startLabel}
                        </button>
                      </td>
                      {END_LABELS.map((endLabel, e) => {
                        const p = probabilities[s][e];
                        const isBestInCol =
                          p > 0 && colMaxProb[e] > 0 && Math.abs(p - colMaxProb[e]) < 1e-9;
                        const isFocusedCol = selectedEnd === e;
                        const isPairSelected = selectedStart === s && selectedEnd === e;
                        const isLocked = lockedPairs.some((lp) => lp.start === s && lp.end === e);
                        const isExact = Math.abs(p - 1) < 1e-9;

                        return (
                          <td
                            key={e}
                            className={`p-1 ${isFocusedCol ? 'bg-amber-500/6' : ''}`}
                          >
                            <button
                              type="button"
                              onClick={() => onSelectPair(s, e)}
                              aria-pressed={isPairSelected}
                              aria-label={`起點 ${startLabel} 到終點 ${endLabel}，機率 ${formatCellPct(p)}${
                                isLocked ? '（已鎖定）' : ''
                              }`}
                              className={`inline-flex w-full items-center justify-center gap-1 rounded-md py-1.5 px-1 font-mono-num text-xs sm:text-[13px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
                                isPairSelected
                                  ? 'bg-amber-500/25 text-amber-200 font-semibold border border-amber-400/80'
                                  : isLocked
                                    ? 'bg-cyan-500/15 text-cyan-200 font-semibold border border-cyan-500/40'
                                    : `border border-transparent hover:bg-slate-800/70 ${
                                        p <= 0
                                          ? 'text-slate-600'
                                          : isExact
                                            ? 'text-cyan-300 font-semibold'
                                            : isBestInCol && isFocusedCol
                                              ? 'text-amber-300 font-semibold'
                                              : isBestInCol
                                                ? 'text-slate-100 font-medium'
                                                : 'text-slate-400'
                                      }`
                              }`}
                            >
                              {isLocked && <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}
                              <span>{formatCellPct(p)}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Concise rules summary at bottom */}
      <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-1 text-xs leading-relaxed text-slate-400">
        <p>
          計算規則：6 條直線（A–F）各 5 個節點、橫線數量可設定 5–15 條、每條直線最少連上 1 條橫線，且同列橫線不相連。
        </p>
        <p>
          層數對應：橫線的數量對應當前層數，第 1 層為 5 條、第 2 層為 6 條，依此類推。
        </p>
      </div>
    </section>
  );
};
