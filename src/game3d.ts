// 3D variant: N x N x N cube, N flags, N volume regions.
// Rules: one flag per region, one flag per layer in each orientation
// (all flag coords distinct per axis), no two flags within Chebyshev dist 1.

export type CellMark = 0 | 1 | 2;
export const EMPTY: CellMark = 0;
export const MARK_X: CellMark = 1;
export const FLAG: CellMark = 2;

export interface Coord {
  x: number;
  y: number;
  z: number;
}

export interface Puzzle3D {
  size: number;
  regions: number[][][]; // regions[x][y][z] = region id
  solution: Coord[];
  solutionSet: Set<number>;
}

export const idx3 = (n: number, x: number, y: number, z: number) => (x * n + y) * n + z;
export const coords3 = (n: number, i: number): Coord => ({
  x: Math.floor(i / (n * n)),
  y: Math.floor(i / n) % n,
  z: i % n,
});

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

/** Random placement: xs/ys/zs each a permutation, pairwise Chebyshev >= 2. */
function randomPlacement3D(n: number): Coord[] | null {
  const base = Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < 5000; t++) {
    const ys = shuffled(base);
    const zs = shuffled(base);
    const flags: Coord[] = base.map((x, k) => ({ x, y: ys[k], z: zs[k] }));
    let ok = true;
    for (let a = 0; a < n && ok; a++)
      for (let b = a + 1; b < n; b++) {
        const f = flags[a];
        const g = flags[b];
        if (
          Math.abs(f.x - g.x) <= 1 &&
          Math.abs(f.y - g.y) <= 1 &&
          Math.abs(f.z - g.z) <= 1
        ) {
          ok = false;
          break;
        }
      }
    if (ok) return flags;
  }
  return null;
}

const DIRS6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Flood-grow N contiguous volume regions from flag seeds. */
function growRegions3D(n: number, flags: Coord[]): number[][][] {
  const R: number[][][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => Array(n).fill(-1)),
  );
  flags.forEach((f, i) => (R[f.x][f.y][f.z] = i));
  let unassigned = n * n * n - n;
  while (unassigned > 0) {
    const pairs: { x: number; y: number; z: number; rid: number }[] = [];
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        for (let z = 0; z < n; z++) {
          if (R[x][y][z] !== -1) continue;
          for (const [dx, dy, dz] of DIRS6) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            if (nx < 0 || nx >= n || ny < 0 || ny >= n || nz < 0 || nz >= n) continue;
            if (R[nx][ny][nz] !== -1) pairs.push({ x, y, z, rid: R[nx][ny][nz] });
          }
        }
    if (pairs.length === 0) break;
    const p = pairs[randInt(pairs.length)];
    R[p.x][p.y][p.z] = p.rid;
    unassigned--;
  }
  return R;
}

function cellsOfRegion(n: number, R: number[][][], rid: number): Coord[] {
  const out: Coord[] = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++) if (R[x][y][z] === rid) out.push({ x, y, z });
  return out;
}

/** Enumerate up to `limit` solutions (region-by-region backtracking). */
export function findSolutions3D(R: number[][][], limit = 2): Coord[][] {
  const n = R.length;
  const byRegion = Array.from({ length: n }, (_, r) => cellsOfRegion(n, R, r));
  const xU = new Array(n).fill(false);
  const yU = new Array(n).fill(false);
  const zU = new Array(n).fill(false);
  const placed: Coord[] = [];
  const out: Coord[][] = [];

  function bt(r: number): void {
    if (out.length >= limit) return;
    if (r === n) {
      out.push(placed.slice());
      return;
    }
    for (const c of byRegion[r]) {
      if (xU[c.x] || yU[c.y] || zU[c.z]) continue;
      let touch = false;
      for (const p of placed) {
        if (
          Math.abs(p.x - c.x) <= 1 &&
          Math.abs(p.y - c.y) <= 1 &&
          Math.abs(p.z - c.z) <= 1
        ) {
          touch = true;
          break;
        }
      }
      if (touch) continue;
      xU[c.x] = yU[c.y] = zU[c.z] = true;
      placed.push(c);
      bt(r + 1);
      placed.pop();
      xU[c.x] = yU[c.y] = zU[c.z] = false;
      if (out.length >= limit) return;
    }
  }
  bt(0);
  return out;
}

export function countSolutions3D(R: number[][][], limit = 2): number {
  return findSolutions3D(R, limit).length;
}

function staysConnected3D(R: number[][][], rid: number, rm: Coord): boolean {
  const n = R.length;
  const cells = cellsOfRegion(n, R, rid).filter(
    (c) => !(c.x === rm.x && c.y === rm.y && c.z === rm.z),
  );
  if (cells.length === 0) return false;
  const seen = new Set<number>([idx3(n, cells[0].x, cells[0].y, cells[0].z)]);
  const stack: Coord[] = [cells[0]];
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const [dx, dy, dz] of DIRS6) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      const nz = c.z + dz;
      if (nx < 0 || nx >= n || ny < 0 || ny >= n || nz < 0 || nz >= n) continue;
      if (R[nx][ny][nz] !== rid || (nx === rm.x && ny === rm.y && nz === rm.z)) continue;
      const k = idx3(n, nx, ny, nz);
      if (!seen.has(k)) {
        seen.add(k);
        stack.push({ x: nx, y: ny, z: nz });
      }
    }
  }
  return seen.size === cells.length;
}

const solKey = (s: Coord[]) =>
  s
    .map((c) => `${c.x},${c.y},${c.z}`)
    .sort()
    .join(";");

/** Repair regions until the target placement is the unique solution. */
function repairToUnique3D(R: number[][][], target: Coord[], maxIters = 400): boolean {
  const n = R.length;
  const tKey = solKey(target);
  const tSet = new Set(target.map((c) => idx3(n, c.x, c.y, c.z)));
  for (let iter = 0; iter < maxIters; iter++) {
    const sols = findSolutions3D(R, 2);
    if (sols.length <= 1) return true;
    const alt = solKey(sols[0]) !== tKey ? sols[0] : sols[1];
    const cands = shuffled(alt.filter((c) => !tSet.has(idx3(n, c.x, c.y, c.z))));
    let moved = false;
    for (const f of cands) {
      const from = R[f.x][f.y][f.z];
      const nbs = new Set<number>();
      for (const [dx, dy, dz] of DIRS6) {
        const nx = f.x + dx;
        const ny = f.y + dy;
        const nz = f.z + dz;
        if (nx < 0 || nx >= n || ny < 0 || ny >= n || nz < 0 || nz >= n) continue;
        if (R[nx][ny][nz] !== from) nbs.add(R[nx][ny][nz]);
      }
      for (const to of shuffled([...nbs])) {
        if (!staysConnected3D(R, from, f)) continue;
        R[f.x][f.y][f.z] = to;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) return false;
  }
  return findSolutions3D(R, 2).length === 1;
}

export function generatePuzzle3D(size: number, maxTries = 40): Puzzle3D {
  for (let t = 0; t < maxTries; t++) {
    const flags = randomPlacement3D(size);
    if (!flags) continue;
    const regions = growRegions3D(size, flags);
    if (!repairToUnique3D(regions, flags)) continue;
    return {
      size,
      regions,
      solution: flags,
      solutionSet: new Set(flags.map((f) => idx3(size, f.x, f.y, f.z))),
    };
  }
  throw new Error(`Failed to generate unique 3D ${size}x${size}x${size} puzzle`);
}

/** Flag indexes violating a rule (share layer-plane, region, or touch). */
export function findConflicts3D(
  size: number,
  regions: number[][][],
  marks: CellMark[],
): Set<number> {
  const flags: number[] = [];
  for (let i = 0; i < marks.length; i++) if (marks[i] === FLAG) flags.push(i);
  const bad = new Set<number>();
  const C = flags.map((i) => coords3(size, i));
  for (let a = 0; a < flags.length; a++)
    for (let b = a + 1; b < flags.length; b++) {
      const f = C[a];
      const g = C[b];
      if (
        f.x === g.x ||
        f.y === g.y ||
        f.z === g.z ||
        regions[f.x][f.y][f.z] === regions[g.x][g.y][g.z] ||
        (Math.abs(f.x - g.x) <= 1 && Math.abs(f.y - g.y) <= 1 && Math.abs(f.z - g.z) <= 1)
      ) {
        bad.add(flags[a]);
        bad.add(flags[b]);
      }
    }
  return bad;
}

/** All cell indexes auto-blocked by a flag at `at` (for Auto-X). */
export function autoXCells3D(size: number, regions: number[][][], at: Coord): number[] {
  const out = new Set<number>();
  const rid = regions[at.x][at.y][at.z];
  for (let x = 0; x < size; x++)
    for (let y = 0; y < size; y++)
      for (let z = 0; z < size; z++) {
        if (x === at.x && y === at.y && z === at.z) continue;
        if (
          x === at.x ||
          y === at.y ||
          z === at.z ||
          regions[x][y][z] === rid ||
          (Math.abs(x - at.x) <= 1 && Math.abs(y - at.y) <= 1 && Math.abs(z - at.z) <= 1)
        )
          out.add(idx3(size, x, y, z));
      }
  return [...out];
}

export function regionColor3D(rid: number, total: number): string {
  const hue = Math.round((rid * 360) / total);
  return `hsl(${hue}, 65%, 62%)`;
}
