export const NUM_COLS = 6;
export const NUM_GAPS = 5;
export const NUM_ROWS = 5;
export const MIN_RUNGS = 5;
export const MAX_RUNGS = 15;

export const START_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const END_LABELS = ['1', '2', '3', '4', '5', '6'] as const;

export type GapState = 'unknown' | 'rung' | 'blocked';

export type BoardGrid = GapState[][]; // [row 0..5][gap 0..4]

export interface LockedPair {
  start: number;
  end: number;
}

export interface SolveResult {
  totalBoards: number;
  placedCount: number;
  /** probabilities[startCol][endCol] in range [0, 1] */
  probabilities: number[][];
  /** counts[startCol][endCol] exact number of valid boards */
  counts: number[][];
  /** deterministicPaths[startCol] = array of node columns [row0..row6] if deterministic under current placed rungs */
  isCompleteBoard: boolean;
  deterministicEnds: (number | null)[];
  error: string | null;
}

export interface PathPoint {
  row: number; // 0 = top start, 1..6 = after row r-1
  col: number;
}

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: NUM_ROWS }, () =>
    Array.from({ length: NUM_GAPS }, () => 'unknown' as GapState),
  );
}

interface RowPattern {
  mask: number;
  rungCount: number;
  touchedCols: number;
  nextCol: number[];
}

// Precompute all 13 valid 5-bit row patterns (no two adjacent rungs in the same row)
const ROW_PATTERNS: RowPattern[] = (() => {
  const list: RowPattern[] = [];
  for (let mask = 0; mask < 32; mask++) {
    if ((mask & (mask << 1)) !== 0) continue;

    let rungCount = 0;
    for (let g = 0; g < NUM_GAPS; g++) {
      if ((mask & (1 << g)) !== 0) rungCount++;
    }

    const touchedCols = mask | (mask << 1);
    const nextCol: number[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      if (c < NUM_GAPS && (mask & (1 << c)) !== 0) {
        nextCol.push(c + 1);
      } else if (c > 0 && (mask & (1 << (c - 1))) !== 0) {
        nextCol.push(c - 1);
      } else {
        nextCol.push(c);
      }
    }

    list.push({ mask, rungCount, touchedCols, nextCol });
  }
  return list;
})();

export function countPlacedRungs(board: BoardGrid): number {
  let count = 0;
  for (let r = 0; r < NUM_ROWS; r++) {
    for (let g = 0; g < NUM_GAPS; g++) {
      if (board[r][g] === 'rung') count++;
    }
  }
  return count;
}

export function hasAdjacentConflict(board: BoardGrid, row: number, gap: number): boolean {
  if (gap > 0 && board[row][gap - 1] === 'rung') return true;
  if (gap < NUM_GAPS - 1 && board[row][gap + 1] === 'rung') return true;
  return false;
}

/**
 * Traces the path of a starting column using ONLY the currently placed rungs on the board.
 * Useful when the board is complete (placedCount === targetRungs) or for previewing current rungs.
 */
export function traceCurrentPath(board: BoardGrid, startCol: number): PathPoint[] {
  const points: PathPoint[] = [{ row: 0, col: startCol }];
  let col = startCol;
  for (let r = 0; r < NUM_ROWS; r++) {
    // Vertical drop to row r level
    points.push({ row: r + 1, col });
    if (col < NUM_GAPS && board[r][col] === 'rung') {
      col = col + 1;
      points.push({ row: r + 1, col });
    } else if (col > 0 && board[r][col - 1] === 'rung') {
      col = col - 1;
      points.push({ row: r + 1, col });
    }
  }
  // Final drop to bottom reward line
  points.push({ row: NUM_ROWS + 1, col });
  return points;
}

interface PreparedConstraints {
  allowedByRow: RowPattern[][];
  minRemainingAfterRow: number[];
  maxRemainingAfterRow: number[];
  possibleTouchAfterRow: number[];
  forcedTouchedMask: number;
  error: string | null;
}

function prepareConstraints(board: BoardGrid, targetRungs: number): PreparedConstraints {
  const empty = {
    allowedByRow: [] as RowPattern[][],
    minRemainingAfterRow: [] as number[],
    maxRemainingAfterRow: [] as number[],
    possibleTouchAfterRow: [] as number[],
    forcedTouchedMask: 0,
  };

  if (targetRungs < MIN_RUNGS || targetRungs > MAX_RUNGS) {
    return { ...empty, error: `橫線數量須介於 ${MIN_RUNGS} 至 ${MAX_RUNGS} 條之間` };
  }

  const placedCount = countPlacedRungs(board);
  if (placedCount > targetRungs) {
    return {
      ...empty,
      error: `已放置 ${placedCount} 條橫線，超過設定數量 ${targetRungs} 條`,
    };
  }

  let forcedTouchedMask = 0;
  const allowedByRow: RowPattern[][] = [];

  for (let r = 0; r < NUM_ROWS; r++) {
    let requiredMask = 0;
    let blockedMask = 0;
    for (let g = 0; g < NUM_GAPS; g++) {
      if (board[r][g] === 'rung') {
        requiredMask |= 1 << g;
        forcedTouchedMask |= (1 << g) | (1 << (g + 1));
      }
      if (board[r][g] === 'blocked') blockedMask |= 1 << g;
    }

    if ((requiredMask & (requiredMask << 1)) !== 0) {
      return { ...empty, error: `第 ${r + 1} 列存在相連橫線，違反規則` };
    }

    const patterns = ROW_PATTERNS.filter(
      (p) => (p.mask & requiredMask) === requiredMask && (p.mask & blockedMask) === 0,
    );

    if (patterns.length === 0) {
      return { ...empty, error: `第 ${r + 1} 列無符合條件的橫線配置` };
    }
    allowedByRow.push(patterns);
  }

  const maxRemainingAfterRow = new Array<number>(NUM_ROWS + 1).fill(0);
  const minRemainingAfterRow = new Array<number>(NUM_ROWS + 1).fill(0);
  const possibleTouchAfterRow = new Array<number>(NUM_ROWS + 1).fill(0);

  for (let r = NUM_ROWS - 1; r >= 0; r--) {
    let maxRow = 0;
    let minRow = NUM_GAPS;
    let touchUnion = 0;
    for (const p of allowedByRow[r]) {
      if (p.rungCount > maxRow) maxRow = p.rungCount;
      if (p.rungCount < minRow) minRow = p.rungCount;
      touchUnion |= p.touchedCols;
    }
    maxRemainingAfterRow[r] = maxRemainingAfterRow[r + 1] + maxRow;
    minRemainingAfterRow[r] = minRemainingAfterRow[r + 1] + minRow;
    possibleTouchAfterRow[r] = possibleTouchAfterRow[r + 1] | touchUnion;
  }

  return {
    allowedByRow,
    minRemainingAfterRow,
    maxRemainingAfterRow,
    possibleTouchAfterRow,
    forcedTouchedMask,
    error: null,
  };
}

/**
 * Exact solver for 6-column, 6-row Amidakuji ladder with:
 * - Total horizontal rungs == targetRungs (5..15)
 * - No two horizontal rungs adjacent in the same row
 * - Every vertical line A-F connected to at least 1 horizontal rung
 * - Respects user-placed ('rung'), user-excluded ('blocked') gaps, and locked start->end pairs
 */
export function solveLadder(
  board: BoardGrid,
  targetRungs: number,
  lockedPairs: LockedPair[] = [],
): SolveResult {
  const placedCount = countPlacedRungs(board);
  const emptyProb = Array.from({ length: NUM_COLS }, () => Array(NUM_COLS).fill(0));
  const emptyCounts = Array.from({ length: NUM_COLS }, () => Array(NUM_COLS).fill(0));

  const prep = prepareConstraints(board, targetRungs);
  if (prep.error) {
    return {
      totalBoards: 0,
      placedCount,
      probabilities: emptyProb,
      counts: emptyCounts,
      isCompleteBoard: false,
      deterministicEnds: Array(NUM_COLS).fill(null),
      error: prep.error,
    };
  }

  const { allowedByRow, minRemainingAfterRow, maxRemainingAfterRow, possibleTouchAfterRow } = prep;

  const counts: number[][] = Array.from({ length: NUM_COLS }, () => Array(NUM_COLS).fill(0));
  const probabilities: number[][] = Array.from({ length: NUM_COLS }, () => Array(NUM_COLS).fill(0));
  let totalBoards = 0;

  if (lockedPairs.length === 0) {
    // Fast DP path (~1.5 ms) when no start->end pairs are locked
    const numUsed = targetRungs + 1;
    const numTouch = 64;
    const strideUsed = numTouch;
    const strideCol = numUsed * numTouch;
    const totalStateSize = NUM_COLS * strideCol;

    let cur = new Float64Array(totalStateSize);
    let nxt = new Float64Array(totalStateSize);

    for (let startCol = 0; startCol < NUM_COLS; startCol++) {
      cur.fill(0);
      cur[startCol * strideCol] = 1;

      for (let r = 0; r < NUM_ROWS; r++) {
        nxt.fill(0);
        const patterns = allowedByRow[r];
        const maxAfter = maxRemainingAfterRow[r + 1];
        const minAfter = minRemainingAfterRow[r + 1];

        for (let col = 0; col < NUM_COLS; col++) {
          const colBase = col * strideCol;
          for (let used = 0; used <= targetRungs; used++) {
            const usedBase = colBase + used * strideUsed;
            for (let touch = 0; touch < numTouch; touch++) {
              const val = cur[usedBase + touch];
              if (val === 0) continue;

              for (let pi = 0; pi < patterns.length; pi++) {
                const p = patterns[pi];
                const nextUsed = used + p.rungCount;
                if (nextUsed + minAfter > targetRungs) continue;
                if (nextUsed + maxAfter < targetRungs) continue;

                const nextCol = p.nextCol[col];
                const nextTouch = touch | p.touchedCols;
                const nextIdx = nextCol * strideCol + nextUsed * strideUsed + nextTouch;
                nxt[nextIdx] += val;
              }
            }
          }
        }

        const tmp = cur;
        cur = nxt;
        nxt = tmp;
      }

      let sumForStart = 0;
      for (let endCol = 0; endCol < NUM_COLS; endCol++) {
        const val = cur[endCol * strideCol + targetRungs * strideUsed + 63];
        counts[startCol][endCol] = val;
        sumForStart += val;
      }
      if (startCol === 0) {
        totalBoards = sumForStart;
      }
    }
  } else {
    // Exact pruned scalar DFS when one or more start->end connections are locked
    const lockedTarget = new Array<number>(NUM_COLS).fill(-1);
    const usedEnd = new Set<number>();
    for (const pair of lockedPairs) {
      if (lockedTarget[pair.start] !== -1 || usedEnd.has(pair.end)) {
        return {
          totalBoards: 0,
          placedCount,
          probabilities: emptyProb,
          counts: emptyCounts,
          isCompleteBoard: false,
          deterministicEnds: Array(NUM_COLS).fill(null),
          error: '鎖定連線之間存在起點或終點重複衝突',
        };
      }
      lockedTarget[pair.start] = pair.end;
      usedEnd.add(pair.end);
    }

    const lt0 = lockedTarget[0];
    const lt1 = lockedTarget[1];
    const lt2 = lockedTarget[2];
    const lt3 = lockedTarget[3];
    const lt4 = lockedTarget[4];
    const lt5 = lockedTarget[5];

    const dfs = (
      r: number,
      used: number,
      touch: number,
      p0: number,
      p1: number,
      p2: number,
      p3: number,
      p4: number,
      p5: number,
    ) => {
      const remRows = NUM_ROWS - r;
      if (used + minRemainingAfterRow[r] > targetRungs) return;
      if (used + maxRemainingAfterRow[r] < targetRungs) return;
      if ((touch | possibleTouchAfterRow[r]) !== 63) return;

      if (lt0 !== -1 && Math.abs(p0 - lt0) > remRows) return;
      if (lt1 !== -1 && Math.abs(p1 - lt1) > remRows) return;
      if (lt2 !== -1 && Math.abs(p2 - lt2) > remRows) return;
      if (lt3 !== -1 && Math.abs(p3 - lt3) > remRows) return;
      if (lt4 !== -1 && Math.abs(p4 - lt4) > remRows) return;
      if (lt5 !== -1 && Math.abs(p5 - lt5) > remRows) return;

      if (r === NUM_ROWS) {
        totalBoards++;
        counts[0][p0]++;
        counts[1][p1]++;
        counts[2][p2]++;
        counts[3][p3]++;
        counts[4][p4]++;
        counts[5][p5]++;
        return;
      }

      const pats = allowedByRow[r];
      const nextR = r + 1;
      for (let pi = 0; pi < pats.length; pi++) {
        const pat = pats[pi];
        const nu = used + pat.rungCount;
        if (nu > targetRungs) continue;
        const nc = pat.nextCol;
        dfs(
          nextR,
          nu,
          touch | pat.touchedCols,
          nc[p0],
          nc[p1],
          nc[p2],
          nc[p3],
          nc[p4],
          nc[p5],
        );
      }
    };

    dfs(0, 0, 0, 0, 1, 2, 3, 4, 5);
  }

  if (totalBoards === 0) {
    return {
      totalBoards: 0,
      placedCount,
      probabilities: emptyProb,
      counts: emptyCounts,
      isCompleteBoard: false,
      deterministicEnds: Array(NUM_COLS).fill(null),
      error:
        lockedPairs.length > 0
          ? '目前的橫線配置與已鎖定連線無法同時滿足所有規則'
          : '目前的橫線配置無法滿足「所有直線至少連上 1 條橫線」或總數量條件',
    };
  }

  const deterministicEnds: (number | null)[] = Array(NUM_COLS).fill(null);
  for (let s = 0; s < NUM_COLS; s++) {
    for (let e = 0; e < NUM_COLS; e++) {
      const p = counts[s][e] / totalBoards;
      probabilities[s][e] = p;
      if (counts[s][e] === totalBoards) {
        deterministicEnds[s] = e;
      }
    }
  }

  return {
    totalBoards,
    placedCount,
    probabilities,
    counts,
    isCompleteBoard: totalBoards === 1 && placedCount === targetRungs,
    deterministicEnds,
    error: null,
  };
}

export interface RouteHighlight {
  /** Probability [0, 1] that valid s -> e paths pass through vertical segment [seg 0..6][col 0..5] */
  verticalProb: number[][];
  /** Probability [0, 1] that valid s -> e paths traverse horizontal gap [row 0..5][gap 0..4] */
  gapProb: number[][];
  /** Total valid boards matching s -> e */
  matchingBoards: number;
}

/**
 * Computes exact segment-level traversal probabilities across all valid boards
 * where startCol reaches endCol, respecting any lockedPairs.
 */
export function computeRouteHighlight(
  board: BoardGrid,
  targetRungs: number,
  startCol: number,
  endCol: number,
  lockedPairs: LockedPair[] = [],
): RouteHighlight | null {
  const emptyVert = () => Array.from({ length: NUM_ROWS + 1 }, () => Array(NUM_COLS).fill(0));
  const emptyGap = () => Array.from({ length: NUM_ROWS }, () => Array(NUM_GAPS).fill(0));

  const prep = prepareConstraints(board, targetRungs);
  if (prep.error) return null;

  const {
    allowedByRow,
    minRemainingAfterRow,
    maxRemainingAfterRow,
    possibleTouchAfterRow,
    forcedTouchedMask,
  } = prep;

  const verticalCount = emptyVert();
  const gapCount = emptyGap();
  let matchingBoards = 0;

  if (lockedPairs.length === 0) {
    const numUsed = targetRungs + 1;
    const stateSize = NUM_COLS * numUsed;
    const fwd = Array.from({ length: NUM_ROWS + 1 }, () => new Float64Array(stateSize));
    const bwd = Array.from({ length: NUM_ROWS + 1 }, () => new Float64Array(stateSize));

    for (let forbidden = 0; forbidden < 64; forbidden++) {
      if ((forbidden & forcedTouchedMask) !== 0) continue;

      let bits = 0;
      let x = forbidden;
      while (x > 0) {
        bits += x & 1;
        x >>= 1;
      }
      const sign = bits % 2 === 0 ? 1 : -1;

      const rowPats: RowPattern[][] = [];
      let possible = true;
      for (let r = 0; r < NUM_ROWS; r++) {
        const filtered = allowedByRow[r].filter((p) => (p.touchedCols & forbidden) === 0);
        if (filtered.length === 0) {
          possible = false;
          break;
        }
        rowPats.push(filtered);
      }
      if (!possible) continue;

      for (let r = 0; r <= NUM_ROWS; r++) fwd[r].fill(0);
      fwd[0][startCol * numUsed + 0] = 1;

      for (let r = 0; r < NUM_ROWS; r++) {
        const pats = rowPats[r];
        const cur = fwd[r];
        const nxt = fwd[r + 1];
        for (let col = 0; col < NUM_COLS; col++) {
          const base = col * numUsed;
          for (let used = 0; used <= targetRungs; used++) {
            const val = cur[base + used];
            if (val === 0) continue;
            for (let pi = 0; pi < pats.length; pi++) {
              const p = pats[pi];
              const nu = used + p.rungCount;
              if (nu > targetRungs) continue;
              nxt[p.nextCol[col] * numUsed + nu] += val;
            }
          }
        }
      }

      const totalForSubset = fwd[NUM_ROWS][endCol * numUsed + targetRungs];
      if (totalForSubset === 0) continue;

      matchingBoards += sign * totalForSubset;

      for (let r = 0; r <= NUM_ROWS; r++) bwd[r].fill(0);
      bwd[NUM_ROWS][endCol * numUsed + targetRungs] = 1;

      for (let r = NUM_ROWS - 1; r >= 0; r--) {
        const pats = rowPats[r];
        const cur = bwd[r];
        const nxt = bwd[r + 1];
        for (let col = 0; col < NUM_COLS; col++) {
          const base = col * numUsed;
          for (let used = 0; used <= targetRungs; used++) {
            let sum = 0;
            for (let pi = 0; pi < pats.length; pi++) {
              const p = pats[pi];
              const nu = used + p.rungCount;
              if (nu > targetRungs) continue;
              sum += nxt[p.nextCol[col] * numUsed + nu];
            }
            cur[base + used] = sum;
          }
        }
      }

      for (let seg = 0; seg <= NUM_ROWS; seg++) {
        const f = fwd[seg];
        const b = bwd[seg];
        for (let col = 0; col < NUM_COLS; col++) {
          const base = col * numUsed;
          let segWays = 0;
          for (let used = 0; used <= targetRungs; used++) {
            segWays += f[base + used] * b[base + used];
          }
          if (segWays !== 0) {
            verticalCount[seg][col] += sign * segWays;
          }
        }
      }

      for (let r = 0; r < NUM_ROWS; r++) {
        const pats = rowPats[r];
        const f = fwd[r];
        const b = bwd[r + 1];
        for (let col = 0; col < NUM_COLS; col++) {
          const base = col * numUsed;
          for (let used = 0; used <= targetRungs; used++) {
            const fw = f[base + used];
            if (fw === 0) continue;
            for (let pi = 0; pi < pats.length; pi++) {
              const p = pats[pi];
              const nu = used + p.rungCount;
              if (nu > targetRungs) continue;
              const nextCol = p.nextCol[col];
              if (nextCol === col) continue;
              const bw = b[nextCol * numUsed + nu];
              if (bw === 0) continue;
              const gap = nextCol > col ? col : nextCol;
              gapCount[r][gap] += sign * fw * bw;
            }
          }
        }
      }
    }
  } else {
    const lockedTarget = new Array<number>(NUM_COLS).fill(-1);
    const usedEnd = new Set<number>();
    for (const pair of lockedPairs) {
      if (lockedTarget[pair.start] !== -1 || usedEnd.has(pair.end)) return null;
      lockedTarget[pair.start] = pair.end;
      usedEnd.add(pair.end);
    }
    if (lockedTarget[startCol] !== -1 && lockedTarget[startCol] !== endCol) {
      return { verticalProb: emptyVert(), gapProb: emptyGap(), matchingBoards: 0 };
    }
    if (usedEnd.has(endCol) && lockedTarget[startCol] !== endCol) {
      return { verticalProb: emptyVert(), gapProb: emptyGap(), matchingBoards: 0 };
    }
    lockedTarget[startCol] = endCol;

    const lt0 = lockedTarget[0];
    const lt1 = lockedTarget[1];
    const lt2 = lockedTarget[2];
    const lt3 = lockedTarget[3];
    const lt4 = lockedTarget[4];
    const lt5 = lockedTarget[5];

    const histCol = new Int32Array(NUM_ROWS + 1);
    const histGap = new Int32Array(NUM_ROWS);
    histCol[0] = startCol;

    const dfs = (
      r: number,
      used: number,
      touch: number,
      p0: number,
      p1: number,
      p2: number,
      p3: number,
      p4: number,
      p5: number,
    ) => {
      const remRows = NUM_ROWS - r;
      if (used + minRemainingAfterRow[r] > targetRungs) return;
      if (used + maxRemainingAfterRow[r] < targetRungs) return;
      if ((touch | possibleTouchAfterRow[r]) !== 63) return;

      if (lt0 !== -1 && Math.abs(p0 - lt0) > remRows) return;
      if (lt1 !== -1 && Math.abs(p1 - lt1) > remRows) return;
      if (lt2 !== -1 && Math.abs(p2 - lt2) > remRows) return;
      if (lt3 !== -1 && Math.abs(p3 - lt3) > remRows) return;
      if (lt4 !== -1 && Math.abs(p4 - lt4) > remRows) return;
      if (lt5 !== -1 && Math.abs(p5 - lt5) > remRows) return;

      if (r === NUM_ROWS) {
        matchingBoards++;
        for (let seg = 0; seg <= NUM_ROWS; seg++) {
          verticalCount[seg][histCol[seg]]++;
        }
        for (let row = 0; row < NUM_ROWS; row++) {
          const g = histGap[row];
          if (g >= 0) gapCount[row][g]++;
        }
        return;
      }

      const pats = allowedByRow[r];
      const nextR = r + 1;
      const curTargetCol = histCol[r];
      for (let pi = 0; pi < pats.length; pi++) {
        const pat = pats[pi];
        const nu = used + pat.rungCount;
        if (nu > targetRungs) continue;
        const nc = pat.nextCol;
        const nextTargetCol = nc[curTargetCol];
        histCol[nextR] = nextTargetCol;
        histGap[r] =
          nextTargetCol === curTargetCol
            ? -1
            : nextTargetCol > curTargetCol
              ? curTargetCol
              : nextTargetCol;
        dfs(
          nextR,
          nu,
          touch | pat.touchedCols,
          nc[p0],
          nc[p1],
          nc[p2],
          nc[p3],
          nc[p4],
          nc[p5],
        );
      }
    };

    dfs(0, 0, 0, 0, 1, 2, 3, 4, 5);
  }

  if (matchingBoards <= 0) {
    return {
      verticalProb: emptyVert(),
      gapProb: emptyGap(),
      matchingBoards: 0,
    };
  }

  const verticalProb = emptyVert();
  const gapProb = emptyGap();

  for (let seg = 0; seg <= NUM_ROWS; seg++) {
    for (let col = 0; col < NUM_COLS; col++) {
      const ratio = verticalCount[seg][col] / matchingBoards;
      verticalProb[seg][col] = ratio <= 1e-12 ? 0 : Math.min(1, ratio);
    }
  }

  for (let r = 0; r < NUM_ROWS; r++) {
    for (let g = 0; g < NUM_GAPS; g++) {
      const ratio = gapCount[r][g] / matchingBoards;
      gapProb[r][g] = ratio <= 1e-12 ? 0 : Math.min(1, ratio);
    }
  }

  return {
    verticalProb,
    gapProb,
    matchingBoards,
  };
}

