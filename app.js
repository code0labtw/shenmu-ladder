'use strict';

/* ================= 求解器 ================= */

const NUM_COLS = 6;
const NUM_GAPS = 5;
const NUM_ROWS = 5;
const MIN_RUNGS = 5;
const MAX_RUNGS = 15;

const START_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const END_LABELS = ['1', '2', '3', '4', '5', '6'];

function createEmptyBoard() {
  return Array.from({ length: NUM_ROWS }, () =>
    Array.from({ length: NUM_GAPS }, () => 'unknown'),
  );
}

// Precompute all 13 valid 5-bit row patterns (no two adjacent rungs in the same row)
const ROW_PATTERNS = (() => {
  const list = [];
  for (let mask = 0; mask < 32; mask++) {
    if ((mask & (mask << 1)) !== 0) continue;

    let rungCount = 0;
    for (let g = 0; g < NUM_GAPS; g++) {
      if ((mask & (1 << g)) !== 0) rungCount++;
    }

    const touchedCols = mask | (mask << 1);
    const nextCol = [];
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

function countPlacedRungs(board) {
  let count = 0;
  for (let r = 0; r < NUM_ROWS; r++) {
    for (let g = 0; g < NUM_GAPS; g++) {
      if (board[r][g] === 'rung') count++;
    }
  }
  return count;
}

function hasAdjacentConflict(board, row , gap ) {
  if (gap > 0 && board[row][gap - 1] === 'rung') return true;
  if (gap < NUM_GAPS - 1 && board[row][gap + 1] === 'rung') return true;
  return false;
}

/**
 * Traces the path of a starting column using ONLY the currently placed rungs on the board.
 * Useful when the board is complete (placedCount === targetRungs) or for previewing current rungs.
 */
function traceCurrentPath(board, startCol ) {
  const points = [{ row: 0, col: startCol }];
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

function prepareConstraints(board, targetRungs ) {
  const empty = {
    allowedByRow: [] ,
    minRemainingAfterRow: [] ,
    maxRemainingAfterRow: [] ,
    possibleTouchAfterRow: [] ,
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
  const allowedByRow = [];

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

  const maxRemainingAfterRow = new Array (NUM_ROWS + 1).fill(0);
  const minRemainingAfterRow = new Array (NUM_ROWS + 1).fill(0);
  const possibleTouchAfterRow = new Array (NUM_ROWS + 1).fill(0);

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
function solveLadder(
  board ,
  targetRungs ,
  lockedPairs = [],
) {
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

  const counts = Array.from({ length: NUM_COLS }, () => Array(NUM_COLS).fill(0));
  const probabilities = Array.from({ length: NUM_COLS }, () => Array(NUM_COLS).fill(0));
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
    const lockedTarget = new Array (NUM_COLS).fill(-1);
    const usedEnd = new Set ();
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
      r ,
      used ,
      touch ,
      p0 ,
      p1 ,
      p2 ,
      p3 ,
      p4 ,
      p5 ,
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

  const deterministicEnds = Array(NUM_COLS).fill(null);
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

/**
 * Computes exact segment-level traversal probabilities across all valid boards
 * where startCol reaches endCol, respecting any lockedPairs.
 */
function computeRouteHighlight(
  board ,
  targetRungs ,
  startCol ,
  endCol ,
  lockedPairs = [],
) {
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

      const rowPats = [];
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
    const lockedTarget = new Array (NUM_COLS).fill(-1);
    const usedEnd = new Set ();
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
      r ,
      used ,
      touch ,
      p0 ,
      p1 ,
      p2 ,
      p3 ,
      p4 ,
      p5 ,
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


/* ================= UI ================= */

const ICONS = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
};

const DEFAULT_EXAMPLES = [1, 2, 3, 4, 5].map((n) => {
  const label = '第 0' + n + ' 層';
  const rungs = n + 4;
  return {
    layer: n,
    layerLabel: label,
    rungs,
    src: 'examples/layer-0' + n + '-rungs-' + rungs + '.webp',
    alt: label + '盤面範例，橫線數量 ' + rungs + ' 條',
  };
});

const SVG_W = 600;
const SVG_H = 330;
const TOP_Y = 18;
const BOT_Y = 312;
const ROW_START_Y = 67;
const ROW_STEP_Y = 49;

const colX = (col) => (col + 0.5) * 100;
const rowY = (row) => ROW_START_Y + row * ROW_STEP_Y;
const segYStart = (seg) => (seg === 0 ? TOP_Y : rowY(seg - 1));
const segYEnd = (seg) => (seg === NUM_ROWS ? BOT_Y : rowY(seg));

function formatPct(p) {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  return (p * 100).toFixed(1) + '%';
}

function formatCellPct(p) {
  if (p <= 0) return '—';
  if (p >= 1) return '100%';
  return (p * 100).toFixed(1) + '%';
}

const state = {
  targetRungs: 5,
  board: createEmptyBoard(),
  boardMode: 'lock',
  selectedStart: null,
  selectedEnd: null,
  lockedPairs: [],
  conflictNotice: null,
  solveResult: null,
  routeHighlight: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  input: $('rung-count-input'),
  minus: $('rung-minus'),
  plus: $('rung-plus'),
  reset: $('reset-btn'),
  placed: $('stat-placed'),
  total: $('stat-total'),
  board: $('board-section'),
  matrix: $('matrix-section'),
  grid: $('examples-grid'),
  modal: $('modal'),
};

function recompute() {
  const s = state;
  s.solveResult = solveLadder(s.board, s.targetRungs, s.lockedPairs);
  if (s.selectedStart === null || s.selectedEnd === null || s.solveResult.totalBoards === 0) {
    s.routeHighlight = null;
  } else {
    s.routeHighlight = computeRouteHighlight(
      s.board, s.targetRungs, s.selectedStart, s.selectedEnd, s.lockedPairs,
    );
  }
}

function update() {
  recompute();
  renderHeader();
  renderBoard();
  renderMatrix();
}

/* ---------- header ---------- */

function renderHeader() {
  const { solveResult, targetRungs } = state;
  els.placed.textContent = '已放置 ' + solveResult.placedCount + ' / ' + targetRungs;
  els.total.textContent = '有效組合 ' + solveResult.totalBoards.toLocaleString('en-US') + ' 種';
  els.minus.disabled = targetRungs <= MIN_RUNGS;
  els.plus.disabled = targetRungs >= MAX_RUNGS;
  $('rung-label').textContent = '橫線數量（' + MIN_RUNGS + '–' + MAX_RUNGS + '）';
  els.input.min = MIN_RUNGS;
  els.input.max = MAX_RUNGS;
}

function applyTargetRungs(next) {
  const clamped = Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, Math.round(next)));
  state.targetRungs = clamped;
  els.input.value = String(clamped);
  state.conflictNotice = null;
  update();
}

els.minus.addEventListener('click', () => applyTargetRungs(state.targetRungs - 1));
els.plus.addEventListener('click', () => applyTargetRungs(state.targetRungs + 1));
els.input.addEventListener('input', () => {
  const raw = els.input.value;
  if (raw === '') return;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= MIN_RUNGS && parsed <= MAX_RUNGS) {
    state.targetRungs = parsed;
    state.conflictNotice = null;
    update();
  }
});
els.input.addEventListener('blur', () => {
  const parsed = Number.parseInt(els.input.value, 10);
  if (Number.isNaN(parsed)) {
    els.input.value = String(state.targetRungs);
  } else {
    applyTargetRungs(parsed);
  }
});
els.reset.addEventListener('click', () => {
  state.board = createEmptyBoard();
  state.selectedStart = null;
  state.selectedEnd = null;
  state.lockedPairs = [];
  state.conflictNotice = null;
  update();
});

/* ---------- actions ---------- */

function toggleGap(row, gap) {
  state.conflictNotice = null;
  const board = state.board;
  const current = board[row][gap];
  if (current === 'rung') {
    board[row][gap] = 'unknown';
  } else if (hasAdjacentConflict(board, row, gap)) {
    state.conflictNotice = '同一列相鄰橫線不可相連';
  } else if (countPlacedRungs(board) >= state.targetRungs) {
    state.conflictNotice = '已達設定上限 ' + state.targetRungs + ' 條橫線';
  } else {
    board[row][gap] = 'rung';
  }
  update();
}

function lockOrReplacePair(startCol, endCol) {
  state.conflictNotice = null;
  state.lockedPairs = state.lockedPairs
    .filter((p) => p.start !== startCol && p.end !== endCol)
    .concat([{ start: startCol, end: endCol }]);
  state.selectedStart = null;
  state.selectedEnd = null;
}

function unlockPair(startCol, endCol) {
  state.conflictNotice = null;
  state.lockedPairs = state.lockedPairs.filter((p) => !(p.start === startCol && p.end === endCol));
}

function changeMode(mode) {
  state.boardMode = mode;
  state.conflictNotice = null;
  if (mode === 'lock' && state.selectedStart !== null && state.selectedEnd !== null) {
    state.selectedStart = null;
    state.selectedEnd = null;
  }
  update();
}

function clickStart(col) {
  const s = state;
  s.conflictNotice = null;
  if (s.boardMode === 'lock') {
    const existing = s.lockedPairs.find((p) => p.start === col);
    if (existing) {
      unlockPair(existing.start, existing.end);
    } else if (s.selectedEnd !== null) {
      if (s.solveResult.totalBoards > 0 && s.solveResult.probabilities[col][s.selectedEnd] <= 0) {
        s.conflictNotice = '該起終點目前無可行路徑，無法鎖定';
      } else {
        lockOrReplacePair(col, s.selectedEnd);
      }
    } else {
      s.selectedStart = s.selectedStart === col ? null : col;
    }
  } else {
    const locked = s.lockedPairs.find((p) => p.start === col);
    if (s.selectedStart === col && (s.selectedEnd === null || (locked && s.selectedEnd === locked.end))) {
      s.selectedStart = null;
      s.selectedEnd = null;
    } else {
      s.selectedStart = col;
      s.selectedEnd = locked ? locked.end : null;
    }
  }
  update();
}

function clickEnd(col) {
  const s = state;
  s.conflictNotice = null;
  if (s.boardMode === 'lock') {
    const existing = s.lockedPairs.find((p) => p.end === col);
    if (existing) {
      unlockPair(existing.start, existing.end);
    } else if (s.selectedStart !== null) {
      if (s.solveResult.totalBoards > 0 && s.solveResult.probabilities[s.selectedStart][col] <= 0) {
        s.conflictNotice = '該起終點目前無可行路徑，無法鎖定';
      } else {
        lockOrReplacePair(s.selectedStart, col);
      }
    } else {
      s.selectedEnd = s.selectedEnd === col ? null : col;
    }
  } else {
    const locked = s.lockedPairs.find((p) => p.end === col);
    if (s.selectedEnd === col && (s.selectedStart === null || (locked && s.selectedStart === locked.start))) {
      s.selectedStart = null;
      s.selectedEnd = null;
    } else {
      s.selectedEnd = col;
      s.selectedStart = locked ? locked.start : null;
    }
  }
  update();
}

function selectPair(startCol, endCol) {
  const s = state;
  s.conflictNotice = null;
  if (s.boardMode === 'lock') {
    const exists = s.lockedPairs.some((p) => p.start === startCol && p.end === endCol);
    if (exists) {
      unlockPair(startCol, endCol);
    } else if (s.solveResult.totalBoards > 0 && s.solveResult.probabilities[startCol][endCol] <= 0) {
      s.conflictNotice = '該起終點目前無可行路徑，無法鎖定';
    } else {
      lockOrReplacePair(startCol, endCol);
    }
  } else if (s.selectedStart === startCol && s.selectedEnd === endCol) {
    s.selectedStart = null;
    s.selectedEnd = null;
  } else {
    s.selectedStart = startCol;
    s.selectedEnd = endCol;
  }
  update();
}

/* ---------- board ---------- */

function renderBoard() {
  const s = state;
  const { probabilities, totalBoards, placedCount, isCompleteBoard } = s.solveResult;
  const { board, selectedStart, selectedEnd, lockedPairs, routeHighlight, boardMode, targetRungs } = s;

  const hasPairSelected = selectedStart !== null && selectedEnd !== null;
  const hasActivePairHighlight =
    hasPairSelected && routeHighlight !== null && routeHighlight.matchingBoards > 0;

  const lockedByStart = new Map();
  const lockedByEnd = new Map();
  for (const p of lockedPairs) {
    lockedByStart.set(p.start, p.end);
    lockedByEnd.set(p.end, p.start);
  }

  let bestStartProb = -1;
  if (selectedEnd !== null && totalBoards > 0) {
    for (let c = 0; c < NUM_COLS; c++) {
      if (probabilities[c][selectedEnd] > bestStartProb) bestStartProb = probabilities[c][selectedEnd];
    }
  }
  let bestEndProb = -1;
  if (selectedStart !== null && totalBoards > 0) {
    for (let e = 0; e < NUM_COLS; e++) {
      if (probabilities[selectedStart][e] > bestEndProb) bestEndProb = probabilities[selectedStart][e];
    }
  }

  let tracedPoints = null;
  if (selectedStart !== null && !hasPairSelected && (isCompleteBoard || placedCount >= targetRungs)) {
    tracedPoints = traceCurrentPath(board, selectedStart)
      .map((pt) => {
        const y = pt.row === 0 ? TOP_Y : pt.row > NUM_ROWS ? BOT_Y : rowY(pt.row - 1);
        return colX(pt.col) + ',' + y;
      })
      .join(' ');
  }

  const hasAnyTopSub = lockedPairs.length > 0 || selectedEnd !== null;
  const hasAnyBotSub = lockedPairs.length > 0 || selectedStart !== null;

  /* mode switch */
  let html =
    '<div class="mode-switch" role="group" aria-label="操作模式">' +
    '<button type="button" data-mode="lock" class="' + (boardMode === 'lock' ? 'on-lock' : '') + '">' +
    ICONS.lock + '鎖定已知路線</button>' +
    '<button type="button" data-mode="inspect" class="' + (boardMode === 'inspect' ? 'on-inspect' : '') + '">' +
    ICONS.search + '查詢機率</button></div>';

  /* status line */
  let status;
  if (s.conflictNotice) {
    status = '<p role="status" class="status err">' + s.conflictNotice + '</p>';
  } else if (hasPairSelected) {
    if (totalBoards > 0 && routeHighlight && routeHighlight.matchingBoards > 0) {
      status =
        '<p role="status" class="status hit">已高亮：' + START_LABELS[selectedStart] + ' → ' + END_LABELS[selectedEnd] +
        '（命中率 <span class="mono">' + formatPct(probabilities[selectedStart][selectedEnd]) + '</span>）</p>';
    } else {
      status =
        '<p role="status" class="status warn">' + START_LABELS[selectedStart] + ' → ' + END_LABELS[selectedEnd] +
        ' 目前無可行路徑（0%）</p>';
    }
  } else if (boardMode === 'lock') {
    let msg;
    if (selectedStart !== null) {
      msg = '已選起點 <b>' + START_LABELS[selectedStart] + '</b>，再點下方終點 <b>1–6</b> 即可鎖定';
    } else if (selectedEnd !== null) {
      msg = '已選終點 <b>' + END_LABELS[selectedEnd] + '</b>，再點上方起點 <b>A–F</b> 即可鎖定';
    } else {
      msg = '依序點「起點 → 終點」鎖定已知路線（切至「查詢機率」不會清除鎖定）';
    }
    status = '<p class="status">' + msg + '</p>';
  } else {
    status =
      '<p class="status dim">點 <em>A–F</em> 查落點機率 · 點 <em>1–6</em> 找最佳起點（鎖定路線維持不變）</p>';
  }
  html += '<div class="status-wrap">' + status + '</div>';

  /* start nodes */
  html += '<div class="node-row top">';
  START_LABELS.forEach((label, col) => {
    const isSelected = selectedStart === col;
    const lockedEnd = lockedByStart.get(col);
    const isLocked = lockedEnd !== undefined;
    const targetProb = selectedEnd !== null && totalBoards > 0 ? probabilities[col][selectedEnd] : null;
    const isBest =
      targetProb !== null && !isLocked && bestStartProb > 0 && Math.abs(targetProb - bestStartProb) < 1e-9;
    const cls = isSelected ? 'sel' : isLocked ? 'locked' : isBest ? 'best' : '';
    let sub = '';
    if (hasAnyTopSub) {
      if (isLocked) sub = '<span class="sub lk">' + ICONS.lock + '<span>鎖定 ' + END_LABELS[lockedEnd] + '</span></span>';
      else if (targetProb !== null)
        sub = '<span class="sub ' + (isBest ? 'bst' : '') + '">' + (isBest ? '最佳 ' + formatPct(targetProb) : formatPct(targetProb)) + '</span>';
      else sub = '<span class="sub none">—</span>';
    }
    html +=
      '<button type="button" class="node ' + cls + '" data-start="' + col + '" aria-pressed="' + (isSelected || isLocked) + '">' +
      '<span class="lbl">' + label + '</span>' + sub + '</button>';
  });
  html += '</div>';

  /* canvas */
  let svg =
    '<svg viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" aria-hidden="true">' +
    '<defs><filter id="rungGlow" x="-20%" y="-40%" width="140%" height="180%">' +
    '<feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

  for (let r = 0; r < NUM_ROWS; r++) {
    svg += '<line x1="' + colX(0) + '" y1="' + rowY(r) + '" x2="' + colX(NUM_COLS - 1) + '" y2="' + rowY(r) +
      '" stroke="rgba(148, 163, 184, 0.08)" stroke-width="1" stroke-dasharray="4 4"/>';
  }

  for (let c = 0; c < NUM_COLS; c++) {
    const x = colX(c);
    const hiTop = selectedStart === c;
    const hiBot = selectedEnd === c;
    const lineStroke = hasPairSelected
      ? 'rgba(56, 189, 248, 0.18)'
      : hiTop ? 'rgba(56, 189, 248, 0.7)' : 'rgba(56, 189, 248, 0.42)';
    svg += '<line x1="' + x + '" y1="' + TOP_Y + '" x2="' + x + '" y2="' + BOT_Y + '" stroke="' + lineStroke +
      '" stroke-width="4" stroke-linecap="round"/>';
    svg += '<circle cx="' + x + '" cy="' + TOP_Y + '" r="5.5" fill="#0a101a" stroke="' + (hiTop ? '#fbbf24' : '#38bdf8') + '" stroke-width="2.5"/>';
    svg += '<circle cx="' + x + '" cy="' + BOT_Y + '" r="5.5" fill="#0a101a" stroke="' + (hiBot ? '#fbbf24' : '#38bdf8') + '" stroke-width="2.5"/>';
    for (let r = 0; r < NUM_ROWS; r++) {
      svg += '<circle cx="' + x + '" cy="' + rowY(r) + '" r="3.2" fill="#e2e8f0" opacity="' + (hasPairSelected ? '0.45' : '0.85') + '"/>';
    }
  }

  if (hasActivePairHighlight) {
    routeHighlight.verticalProb.forEach((cols, seg) => {
      cols.forEach((prob, col) => {
        if (prob <= 0) return;
        const x = colX(col);
        const certain = prob >= 0.999;
        const opacity = certain ? 1 : 0.28 + 0.65 * prob;
        svg += '<line x1="' + x + '" y1="' + segYStart(seg) + '" x2="' + x + '" y2="' + segYEnd(seg) +
          '" stroke="#fbbf24" stroke-width="' + (certain ? 5 : 4) + '" stroke-linecap="round" opacity="' + opacity + '"' +
          (certain ? ' filter="url(#rungGlow)"' : '') + '/>';
      });
    });

    board.forEach((rowArr, r) => {
      rowArr.forEach((cell, g) => {
        if (cell !== 'unknown') return;
        const prob = routeHighlight.gapProb[r][g];
        if (prob <= 0) return;
        const certain = prob >= 0.999;
        svg += '<line x1="' + colX(g) + '" y1="' + rowY(r) + '" x2="' + colX(g + 1) + '" y2="' + rowY(r) +
          '" stroke="#fbbf24" stroke-width="' + (certain ? 4 : 3) + '"' +
          (certain ? '' : ' stroke-dasharray="6 5"') + ' stroke-linecap="round" opacity="' +
          (certain ? 0.95 : 0.25 + 0.6 * prob) + '"/>';
      });
    });
  }

  board.forEach((rowArr, r) => {
    rowArr.forEach((cell, g) => {
      if (cell !== 'rung') return;
      const x1 = colX(g);
      const x2 = colX(g + 1);
      const y = rowY(r);
      const pairGapProb = hasActivePairHighlight ? routeHighlight.gapProb[r][g] : 0;
      const isHi = pairGapProb > 0;
      const certain = pairGapProb >= 0.999;
      const opacity =
        hasActivePairHighlight && !isHi ? 0.35 : isHi && !certain ? 0.45 + 0.55 * pairGapProb : 1;
      svg +=
        '<g filter="url(#rungGlow)" opacity="' + opacity + '">' +
        '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + (isHi ? '#fbbf24' : '#22d3ee') + '" stroke-width="5" stroke-linecap="round"/>' +
        '<circle cx="' + x1 + '" cy="' + y + '" r="4.5" fill="' + (isHi ? '#fef3c7' : '#ecfeff') + '"/>' +
        '<circle cx="' + x2 + '" cy="' + y + '" r="4.5" fill="' + (isHi ? '#fef3c7' : '#ecfeff') + '"/></g>';
    });
  });

  if (tracedPoints) {
    svg += '<polyline points="' + tracedPoints + '" fill="none" stroke="#fbbf24" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#rungGlow)"/>';
  }
  svg += '</svg>';

  let hits = '';
  board.forEach((rowArr, r) => {
    rowArr.forEach((cell, g) => {
      const adjacentBlocked = cell !== 'rung' && hasAdjacentConflict(board, r, g);
      const left = ((g + 0.5) / NUM_COLS) * 100;
      const width = (1 / NUM_COLS) * 100;
      const top = ((rowY(r) - 22) / SVG_H) * 100;
      const height = (44 / SVG_H) * 100;
      const hoverable = cell === 'unknown' && !adjacentBlocked;
      hits +=
        '<button type="button" class="hit ' + (adjacentBlocked ? 'blocked' : 'hoverable') + '" data-row="' + r + '" data-gap="' + g + '"' +
        ' aria-label="第 ' + (r + 1) + ' 列 ' + START_LABELS[g] + ' 與 ' + START_LABELS[g + 1] + ' 之間，目前為' + (cell === 'rung' ? '已放置橫線' : '未放置橫線') + '"' +
        ' style="left:' + left + '%;width:' + width + '%;top:' + top + '%;height:' + height + '%"><span></span></button>';
    });
  });
  html += '<div class="canvas">' + svg + hits + '</div>';

  /* end nodes */
  html += '<div class="node-row bottom">';
  END_LABELS.forEach((label, col) => {
    const isSelected = selectedEnd === col;
    const lockedStart = lockedByEnd.get(col);
    const isLocked = lockedStart !== undefined;
    const startProb = selectedStart !== null && totalBoards > 0 ? probabilities[selectedStart][col] : null;
    const isBest =
      startProb !== null && !isLocked && bestEndProb > 0 && Math.abs(startProb - bestEndProb) < 1e-9;
    const cls = isSelected ? 'sel' : isLocked ? 'locked' : isBest ? 'best' : '';
    let sub = '';
    if (hasAnyBotSub) {
      if (isLocked) sub = '<span class="sub lk">' + ICONS.lock + '<span>鎖定 ' + START_LABELS[lockedStart] + '</span></span>';
      else if (startProb !== null) sub = '<span class="sub ' + (isBest ? 'bst' : '') + '">' + formatPct(startProb) + '</span>';
      else sub = '<span class="sub none">—</span>';
    }
    html +=
      '<button type="button" class="node end ' + cls + '" data-end="' + col + '" aria-pressed="' + (isSelected || isLocked) + '">' +
      '<span class="lbl">' + label + '</span>' + sub + '</button>';
  });
  html += '</div>';

  if (lockedPairs.length > 0) {
    html += '<div class="locked-bar"><span>已鎖定路線：</span>';
    lockedPairs.forEach((pair) => {
      html +=
        '<button type="button" class="chip" data-unlock-start="' + pair.start + '" data-unlock-end="' + pair.end + '"' +
        ' aria-label="解除鎖定 ' + START_LABELS[pair.start] + ' 到 ' + END_LABELS[pair.end] + '">' +
        ICONS.lock + '<span>' + START_LABELS[pair.start] + ' → ' + END_LABELS[pair.end] + '</span>' + ICONS.x + '</button>';
    });
    html += '</div>';
  }

  els.board.innerHTML = html;
}

els.board.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || !els.board.contains(t)) return;
  if (t.dataset.mode) return changeMode(t.dataset.mode);
  if (t.dataset.start !== undefined) return clickStart(Number(t.dataset.start));
  if (t.dataset.end !== undefined) return clickEnd(Number(t.dataset.end));
  if (t.dataset.row !== undefined) return toggleGap(Number(t.dataset.row), Number(t.dataset.gap));
  if (t.dataset.unlockStart !== undefined) {
    unlockPair(Number(t.dataset.unlockStart), Number(t.dataset.unlockEnd));
    update();
  }
});

/* ---------- matrix ---------- */

function renderMatrix() {
  const { solveResult, selectedStart, selectedEnd, lockedPairs, boardMode } = state;
  const { totalBoards, probabilities, error } = solveResult;

  const colMax = Array(NUM_COLS).fill(0);
  if (totalBoards > 0) {
    for (let e = 0; e < NUM_COLS; e++) {
      for (let c = 0; c < NUM_COLS; c++) {
        if (probabilities[c][e] > colMax[e]) colMax[e] = probabilities[c][e];
      }
    }
  }

  let bestForEnd = null;
  if (selectedEnd !== null && totalBoards > 0 && colMax[selectedEnd] > 0) {
    const maxP = colMax[selectedEnd];
    bestForEnd = {
      labels: START_LABELS.filter((_, c) => Math.abs(probabilities[c][selectedEnd] - maxP) < 1e-9).join(' / '),
      pct: formatCellPct(maxP),
    };
  }
  const selectedPairPct =
    selectedStart !== null && selectedEnd !== null && totalBoards > 0
      ? probabilities[selectedStart][selectedEnd]
      : null;

  let head;
  if (selectedStart !== null && selectedEnd !== null && selectedPairPct !== null) {
    head = '<p class="hl">已選路徑：' + START_LABELS[selectedStart] + ' → ' + END_LABELS[selectedEnd] +
      '（<span class="mono">' + formatCellPct(selectedPairPct) + '</span>）</p>';
  } else if (bestForEnd) {
    head = '<p class="hl">目標 ' + END_LABELS[selectedEnd] + ' 最佳起點：' + bestForEnd.labels +
      '（<span class="mono">' + bestForEnd.pct + '</span>）</p>';
  } else {
    head = '<p>' + (boardMode === 'lock' ? '點機率格可直接鎖定／解鎖該路線' : '點機率格可在左側盤面高亮該路線') + '</p>';
  }

  let html = '<div><div class="matrix-head"><h2>起點對終點機率表</h2>' + head + '</div>';

  if (error) {
    html += '<div role="alert" class="alert">' + error + '</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th class="corner">起點 \\ 終點</th>';
    END_LABELS.forEach((label, e) => {
      html += '<th><button type="button" class="hbtn ' + (selectedEnd === e ? 'on' : '') + '" data-mend="' + e + '" aria-pressed="' + (selectedEnd === e) + '">' + label + '</button></th>';
    });
    html += '</tr></thead><tbody>';
    START_LABELS.forEach((startLabel, c) => {
      const rowActive = selectedStart === c;
      html += '<tr class="' + (rowActive ? 'row-active' : '') + '"><td class="rowhead"><button type="button" class="vbtn ' + (rowActive ? 'on' : '') + '" data-mstart="' + c + '" aria-pressed="' + rowActive + '">' + startLabel + '</button></td>';
      END_LABELS.forEach((endLabel, e) => {
        const p = probabilities[c][e];
        const isBestInCol = p > 0 && colMax[e] > 0 && Math.abs(p - colMax[e]) < 1e-9;
        const focusedCol = selectedEnd === e;
        const picked = selectedStart === c && selectedEnd === e;
        const locked = lockedPairs.some((lp) => lp.start === c && lp.end === e);
        const exact = Math.abs(p - 1) < 1e-9;
        let cls = '';
        if (picked) cls = 'picked';
        else if (locked) cls = 'locked';
        else if (p <= 0) cls = 'zero';
        else if (exact) cls = 'exact';
        else if (isBestInCol && focusedCol) cls = 'bestfocus';
        else if (isBestInCol) cls = 'best';
        html +=
          '<td class="' + (focusedCol ? 'col-focus' : '') + '"><button type="button" class="cell ' + cls + '" data-mpair-s="' + c + '" data-mpair-e="' + e + '" aria-pressed="' + picked + '"' +
          ' aria-label="起點 ' + startLabel + ' 到終點 ' + endLabel + '，機率 ' + formatCellPct(p) + (locked ? '（已鎖定）' : '') + '">' +
          (locked ? ICONS.lock : '') + '<span>' + formatCellPct(p) + '</span></button></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }

  html += '</div><div class="rules">' +
    '<p>計算規則：6 條直線（A–F）各 5 個節點、橫線數量可設定 5–15 條、每條直線最少連上 1 條橫線，且同列橫線不相連。</p>' +
    '<p>層數對應：橫線的數量對應當前層數，第 1 層為 5 條、第 2 層為 6 條，依此類推。</p></div>';

  els.matrix.innerHTML = html;
}

els.matrix.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || !els.matrix.contains(t)) return;
  if (t.dataset.mend !== undefined) return clickEnd(Number(t.dataset.mend));
  if (t.dataset.mstart !== undefined) return clickStart(Number(t.dataset.mstart));
  if (t.dataset.mpairS !== undefined) selectPair(Number(t.dataset.mpairS), Number(t.dataset.mpairE));
});

/* ---------- examples ---------- */

let examples = DEFAULT_EXAMPLES;

function renderExamples() {
  els.grid.innerHTML = examples
    .map(
      (item, i) =>
        '<button type="button" class="ex-item" data-ex="' + i + '" aria-label="放大檢視 ' + item.layerLabel + '，橫線 ' + item.rungs + ' 條範例圖">' +
        '<div class="ex-top"><span class="name">' + item.layerLabel + '</span><span class="cnt">橫線 ×' + item.rungs + '</span></div>' +
        '<div class="ex-thumb"><img src="' + item.src + '" alt="' + item.alt + '" loading="lazy"/>' +
        '<span class="zoom">' + ICONS.zoom + '</span></div></button>',
    )
    .join('');
}

function openExample(item) {
  els.modal.setAttribute('aria-label', item.layerLabel + ' 範例截圖');
  els.modal.innerHTML =
    '<div class="modal-box"><div class="modal-head"><div class="info"><b>' + item.layerLabel + '</b>' +
    '<span>橫線數量：' + item.rungs + ' 條</span></div>' +
    '<button type="button" class="modal-close" data-close aria-label="關閉預覽">' + ICONS.x + '</button></div>' +
    '<div class="modal-body"><img src="' + item.src + '" alt="' + item.alt + '"/></div></div>';
  els.modal.hidden = false;
}

function closeModal() {
  els.modal.hidden = true;
  els.modal.innerHTML = '';
}

els.grid.addEventListener('click', (e) => {
  const t = e.target.closest('.ex-item');
  if (t) openExample(examples[Number(t.dataset.ex)]);
});
els.modal.addEventListener('click', (e) => {
  if (e.target === els.modal || e.target.closest('[data-close]')) closeModal();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.modal.hidden) closeModal();
});

/* ---------- start ---------- */

update();
renderExamples();

// data.json 提供範例圖清單；以 file:// 直接開啟而讀不到時，沿用內建預設
fetch('data.json')
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (data && Array.isArray(data.examples) && data.examples.length > 0) {
      examples = data.examples;
      renderExamples();
    }
  })
  .catch(() => {});
