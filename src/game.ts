// Core puzzle logic: Queens / Star-Battle variant generator + solver.
// Rules: N x N grid, N regions, exactly one flag per row, column, region,
// no two flags touch (including diagonally).

export type CellMark = 0 | 1 | 2; // 0 empty, 1 = X, 2 = flag
export const EMPTY: CellMark = 0;
export const MARK_X: CellMark = 1;
export const FLAG: CellMark = 2;

export interface Puzzle {
  size: number;
  regions: number[][]; // regions[r][c] = region id 0..N-1
  solution: { r: number; c: number }[];
  solutionSet: Set<number>; // r * size + c
}

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random flag placement: one per row/col, none touching (incl. diagonally). */
function randomQueenPlacement(n: number): number[] | null {
  // cols[row] = col. Adjacency only possible between consecutive rows
  // (row diff >= 2 can never touch), so enforce |cols[i]-cols[i+1]| > 1.
  for (let attempt = 0; attempt < 2000; attempt++) {
    const cols = shuffled(Array.from({ length: n }, (_, i) => i));
    let ok = true;
    for (let i = 0; i + 1 < n; i++) {
      if (Math.abs(cols[i] - cols[i + 1]) <= 1) {
        ok = false;
        break;
      }
    }
    if (ok) return cols;
  }
  return null;
}

/** Grow N contiguous regions, one per queen seed, via random flood.
 *  Globally-random frontier pick gives varied region sizes (incl. small
 *  regions), which makes for better puzzles. */
function growRegions(n: number, queenCols: number[]): number[][] {
  const regions: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  for (let r = 0; r < n; r++) regions[r][queenCols[r]] = r;

  let unassigned = n * n - n;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (unassigned > 0) {
    // All (empty cell, adjacent region) pairs; pick one at random.
    const pairs: { r: number; c: number; rid: number }[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (regions[r][c] !== -1) continue;
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          if (regions[nr][nc] !== -1) pairs.push({ r, c, rid: regions[nr][nc] });
        }
      }
    }
    if (pairs.length === 0) break; // unreachable: grid is connected
    const pick = pairs[randInt(pairs.length)];
    regions[pick.r][pick.c] = pick.rid;
    unassigned--;
  }
  return regions;
}

export interface SolverStats {
  count: number;
}

/** Count solutions up to `limit`. Row-by-row backtracking. */
export function countSolutions(
  regions: number[][],
  limit = 2,
): number {
  return findSolutions(regions, limit).length;
}

/** Enumerate up to `limit` solutions. Each solution is an array of cols per row. */
export function findSolutions(regions: number[][], limit = 2): number[][] {
  const n = regions.length;
  const colUsed = new Array(n).fill(false);
  const regUsed = new Array(n).fill(false);
  const placedCols: number[] = [];
  const placed: { r: number; c: number }[] = [];
  const out: number[][] = [];

  function backtrack(row: number): void {
    if (out.length >= limit) return;
    if (row === n) {
      out.push(placedCols.slice());
      return;
    }
    for (let c = 0; c < n; c++) {
      if (colUsed[c]) continue;
      const rid = regions[row][c];
      if (regUsed[rid]) continue;
      let touch = false;
      for (const p of placed) {
        if (Math.abs(p.r - row) <= 1 && Math.abs(p.c - c) <= 1) {
          touch = true;
          break;
        }
      }
      if (touch) continue;
      colUsed[c] = true;
      regUsed[rid] = true;
      placed.push({ r: row, c });
      placedCols.push(c);
      backtrack(row + 1);
      placedCols.pop();
      placed.pop();
      regUsed[rid] = false;
      colUsed[c] = false;
      if (out.length >= limit) return;
    }
  }

  backtrack(0);
  return out;
}

/** Check a region stays orthogonally connected after removing one cell. */
function staysConnected(
  regions: number[][],
  rid: number,
  removeR: number,
  removeC: number,
): boolean {
  const n = regions.length;
  const cells: [number, number][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (regions[r][c] === rid && !(r === removeR && c === removeC)) cells.push([r, c]);
  if (cells.length === 0) return false;
  const seen = new Set<number>([cells[0][0] * n + cells[0][1]]);
  const stack: [number, number][] = [cells[0]];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      if (regions[nr][nc] !== rid || (nr === removeR && nc === removeC)) continue;
      const k = nr * n + nc;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Force uniqueness by repairing regions: while an alternative solution exists,
 * move one of its non-target cells into a neighboring region. That leaves the
 * cell's old region with zero flags of that solution, invalidating it —
 * while the target solution keeps exactly one queen per region.
 */
function repairToUnique(
  regions: number[][],
  targetCols: number[],
  maxIters = 400,
): boolean {
  const n = regions.length;
  const targetKey = targetCols.join(",");
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let iter = 0; iter < maxIters; iter++) {
    const sols = findSolutions(regions, 2);
    if (sols.length <= 1) return true;
    const alt = sols[0].join(",") !== targetKey ? sols[0] : sols[1];
    // Candidate cells: alt flags that are not target queens.
    const cands: [number, number][] = [];
    for (let r = 0; r < n; r++) {
      if (alt[r] !== targetCols[r]) cands.push([r, alt[r]]);
    }
    let moved = false;
    for (const [fr, fc] of shuffled(cands)) {
      const from = regions[fr][fc];
      const neighborRids = new Set<number>();
      for (const [dr, dc] of dirs) {
        const nr = fr + dr;
        const nc = fc + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        if (regions[nr][nc] !== from) neighborRids.add(regions[nr][nc]);
      }
      for (const to of shuffled([...neighborRids])) {
        if (!staysConnected(regions, from, fr, fc)) continue;
        regions[fr][fc] = to;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) return false; // stuck: caller restarts from scratch
  }
  return findSolutions(regions, 2).length === 1;
}

/** Generate a puzzle with a unique solution. Retries until unique (or throws). */
export function generatePuzzle(size: number, maxTries = 40): Puzzle {
  for (let t = 0; t < maxTries; t++) {
    const cols = randomQueenPlacement(size);
    if (!cols) continue;
    const regions = growRegions(size, cols);
    if (!repairToUnique(regions, cols)) continue;
    const solution = cols.map((c, r) => ({ r, c }));
    return {
      size,
      regions,
      solution,
      solutionSet: new Set(solution.map((s) => s.r * size + s.c)),
    };
  }
  throw new Error(`Failed to generate unique ${size}x${size} puzzle`);
}

/** Live rule conflicts among placed flags (for red highlight). Returns flag indexes in conflict. */
export function findConflicts(size: number, regions: number[][], marks: CellMark[]): Set<number> {
  const flags: number[] = [];
  for (let i = 0; i < marks.length; i++) if (marks[i] === FLAG) flags.push(i);
  const bad = new Set<number>();
  for (let a = 0; a < flags.length; a++) {
    for (let b = a + 1; b < flags.length; b++) {
      const i = flags[a];
      const j = flags[b];
      const ra = Math.floor(i / size);
      const ca = i % size;
      const rb = Math.floor(j / size);
      const cb = j % size;
      if (
        ra === rb ||
        ca === cb ||
        regions[ra][ca] === regions[rb][cb] ||
        (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1)
      ) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

/** Pastel color per region id. */
export function regionColor(rid: number, total: number): string {
  const hue = Math.round((rid * 360) / total);
  return `hsl(${hue} 65% 82%)`;
}
