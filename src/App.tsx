import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY,
  FLAG,
  MARK_X,
  findConflicts,
  generatePuzzle,
  regionColor,
  type CellMark,
  type Puzzle,
} from "./game";
const CubeView = lazy(() => import("./CubeView"));
import "./App.css";

type Status = "playing" | "won" | "lost";
type Mode = CellMark; // MARK_X or FLAG

interface Change {
  idx: number;
  prev: CellMark;
  next: CellMark;
}

const SIZES = [6, 7, 8, 9, 10];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [size, setSize] = useState(7);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [marks, setMarks] = useState<CellMark[]>([]);
  const [hearts, setHearts] = useState(3);
  const [mode, setMode] = useState<Mode>(MARK_X);
  const [autoX, setAutoX] = useState(true);
  const [status, setStatus] = useState<Status>("playing");
  const [mistakes, setMistakes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [history, setHistory] = useState<Change[][]>([]);
  const [errorIdx, setErrorIdx] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const errorTimer = useRef<number | undefined>(undefined);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ r: number; c: number } | null>(null);
  const dragEnd = useRef<{ r: number; c: number } | null>(null);
  const [dragCells, setDragCells] = useState<Set<number>>(new Set());

  const newGame = useCallback((n: number) => {
    setGenerating(true);
    // Defer heavy gen so spinner paints.
    window.setTimeout(() => {
      try {
        const p = generatePuzzle(n);
        setPuzzle(p);
        setMarks(new Array(n * n).fill(EMPTY));
        setHearts(3);
        setMistakes(0);
        setSeconds(0);
        setHistory([]);
        setStatus("playing");
        setErrorIdx(null);
        setDragCells(new Set());
        dragStart.current = null;
        dragEnd.current = null;
      } finally {
        setGenerating(false);
      }
    }, 30);
  }, []);

  useEffect(() => {
    newGame(size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "playing" || !puzzle) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [status, puzzle]);

  useEffect(() => () => window.clearTimeout(errorTimer.current), []);

  const flagCount = useMemo(() => marks.filter((m) => m === FLAG).length, [marks]);

  const conflicts = useMemo(() => {
    if (!puzzle) return new Set<number>();
    return findConflicts(puzzle.size, puzzle.regions, marks);
  }, [puzzle, marks]);

  function applyChanges(changes: Change[]) {
    setMarks((prev) => {
      const next = prev.slice();
      for (const ch of changes) next[ch.idx] = ch.next;
      return next;
    });
    setHistory((h) => [...h, changes]);
  }

  function autoXFor(idx: number, base: CellMark[]): Change[] {
    if (!puzzle || !autoX) return [];
    const n = puzzle.size;
    const r = Math.floor(idx / n);
    const c = idx % n;
    const rid = puzzle.regions[r][c];
    const out: Change[] = [];
    for (let i = 0; i < n; i++) {
      // same row
      const ri = r * n + i;
      if (ri !== idx && base[ri] === EMPTY) out.push({ idx: ri, prev: EMPTY, next: MARK_X });
      // same column
      const ci = i * n + c;
      if (ci !== idx && base[ci] === EMPTY) out.push({ idx: ci, prev: EMPTY, next: MARK_X });
    }
    // 8 neighbors
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        const ni = nr * n + nc;
        if (base[ni] === EMPTY && !out.some((o) => o.idx === ni))
          out.push({ idx: ni, prev: EMPTY, next: MARK_X });
      }
    }
    // same region
    for (let rr = 0; rr < n; rr++) {
      for (let cc = 0; cc < n; cc++) {
        if (puzzle.regions[rr][cc] !== rid) continue;
        const ni = rr * n + cc;
        if (ni !== idx && base[ni] === EMPTY && !out.some((o) => o.idx === ni))
          out.push({ idx: ni, prev: EMPTY, next: MARK_X });
      }
    }
    return out;
  }

  function flashError(idx: number) {
    setErrorIdx(idx);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setErrorIdx(null), 600);
  }

  function getCellFromPointer(e: React.PointerEvent<HTMLDivElement>): { r: number; c: number } | null {
    if (!puzzle || !boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const n = puzzle.size;
    const cellW = rect.width / n;
    const cellH = rect.height / n;
    const c = Math.floor(x / cellW);
    const r = Math.floor(y / cellH);
    if (r < 0 || r >= n || c < 0 || c >= n) return null;
    return { r, c };
  }

  function computeDragCells(s?: { r: number; c: number } | null, end?: { r: number; c: number } | null) {
    if (!puzzle) return new Set<number>();
    const n = puzzle.size;
    if (!s || !end) return new Set<number>();
    const sr = Math.min(s.r, end.r);
    const er = Math.max(s.r, end.r);
    const sc = Math.min(s.c, end.c);
    const ec = Math.max(s.c, end.c);
    const set = new Set<number>();
    for (let r = sr; r <= er; r++) {
      for (let c = sc; c <= ec; c++) {
        set.add(r * n + c);
      }
    }
    return set;
  }
  // Shared flag placement. Mutates `working`; returns changes, or null if wrong cell.
  function placeFlag(idx: number, working: CellMark[]): Change[] {
    const cur = working[idx];
    if (cur === FLAG) return [];
    if (!puzzle!.solutionSet.has(idx)) return null;
    const changes: Change[] = [{ idx, prev: cur, next: FLAG }];
    working[idx] = FLAG;
    for (const ax of autoXFor(idx, working)) {
      changes.push(ax);
      working[ax.idx] = MARK_X;
    }
    return changes;
  }

  function loseHeart(flashIdx: number | null) {
    if (flashIdx !== null) flashError(flashIdx);
    const left = hearts - 1;
    setHearts(left);
    setMistakes((m) => m + 1);
    if (left <= 0) setStatus("lost");
  }

  function handleCell(i: number, forceFlag = false) {
    if (!puzzle || status !== "playing" || generating) return;
    const cur = marks[i];
    // Tap placed mark/flag -> clear.
    if (!forceFlag && cur !== EMPTY) {
      applyChanges([{ idx: i, prev: cur, next: EMPTY }]);
      return;
    }
    const want: CellMark = forceFlag ? FLAG : mode;
    if (want === MARK_X) {
      if (cur === EMPTY) applyChanges([{ idx: i, prev: cur, next: MARK_X }]);
      return;
    }
    // Placing a flag.
    if (cur === FLAG) {
      applyChanges([{ idx: i, prev: cur, next: EMPTY }]);
      return;
    }
    const working = marks.slice();
    const changes = placeFlag(i, working);
    if (changes === null) {
      // Wrong cell -> lose heart, don't place.
      loseHeart(i);
      return;
    }
    if (changes.length > 0) applyChanges(changes);
    // Win check: all solution cells flagged.
    if (working.filter((m) => m === FLAG).length === puzzle.size) setStatus("won");
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setMarks((prev) => {
        const next = prev.slice();
        for (const ch of last) next[ch.idx] = ch.prev;
        return next;
      });
      if (status !== "playing") setStatus("playing");
      return h.slice(0, -1);
    });
  }

  function reset() {
    if (!puzzle) return;
    setMarks(new Array(puzzle.size * puzzle.size).fill(EMPTY));
    setHearts(3);
    setMistakes(0);
    setSeconds(0);
    setHistory([]);
    setStatus("playing");
    setErrorIdx(null);
    setDragCells(new Set());
    dragStart.current = null;
    dragEnd.current = null;
  }

  function hint() {
    if (!puzzle || status !== "playing") return;
    // Reveal first unflagged solution cell. Costs nothing in v1 (could cost heart later).
    for (const s of puzzle.solution) {
      const i = s.r * puzzle.size + s.c;
      if (marks[i] !== FLAG) {
        handleCell(i, true);
        return;
      }
    }
  }

  const n = puzzle?.size ?? size;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Flag Logic</h1>
          <p className="sub">Sudoku placement × Minesweeper deduction</p>
        </div>
        <div className="hearts" aria-label="hearts">
          {[0, 1, 2].map((k) => (
            <span key={k} className={k < hearts ? "heart on" : "heart off"}>
              ♥
            </span>
          ))}
        </div>
      </header>

      <div className="viewtoggle" role="group" aria-label="view">
        <button className={view === "2d" ? "seg on" : "seg"} onClick={() => setView("2d")}>
          ▦ 2D Board
        </button>
        <button className={view === "3d" ? "seg on" : "seg"} onClick={() => setView("3d")}>
          ◈ 3D Cube
        </button>
      </div>

      {view === "3d" ? (
        <Suspense fallback={<div className="loading">Loading 3D…</div>}>
          <CubeView />
        </Suspense>
      ) : (
      <>
      <div className="statbar">
        <div className="stat">
          <span className="k">Flags</span>
          <span className="v">
            {flagCount}/{n}
          </span>
        </div>
        <div className="stat">
          <span className="k">Time</span>
          <span className="v">{fmtTime(seconds)}</span>
        </div>
        <div className="stat">
          <span className="k">Mistakes</span>
          <span className="v">{mistakes}/3</span>
        </div>
        <label className="sizepick">
          Size
          <select
            value={size}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSize(v);
              newGame(v);
            }}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rules">
        <span>1 flag per color region</span>·<span>1 per row & column</span>·
        <span>no touching, even diagonally</span>
      </div>

      <main className="boardwrap">
        {generating || !puzzle ? (
          <div className="loading">Generating puzzle…</div>
        ) : (
          <div
            ref={boardRef}
            className="board"
            style={{
              gridTemplateColumns: `repeat(${n}, 1fr)`,
              gridTemplateRows: `repeat(${n}, 1fr)`,
            }}
            role="grid"
            aria-label={`${n} by ${n} puzzle`}
            onPointerDown={(e) => {
              if (status !== "playing" || generating) return;
              const c = getCellFromPointer(e);
              if (!c) return;
              dragStart.current = c;
              dragEnd.current = c;
              setDragCells(computeDragCells(c, c));
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragStart.current) return;
              const c = getCellFromPointer(e);
              if (!c) return;
              dragEnd.current = c;
              setDragCells(computeDragCells(dragStart.current, c));
            }}
            onPointerUp={(e) => {
              if (!dragStart.current) return;
              const cells = computeDragCells(dragStart.current, dragEnd.current);
              if (cells.size > 0) {
                const changes: Change[] = [];
                const working = marks.slice();
                let wrong = false;
                for (const idx of cells) {
                  if (mode === MARK_X) {
                    if (marks[idx] === EMPTY) {
                      changes.push({ idx, prev: EMPTY, next: MARK_X });
                      working[idx] = MARK_X;
                    } else if (cells.size === 1 && marks[idx] === MARK_X) {
                      // simple click on marked cell toggles it off
                      changes.push({ idx, prev: MARK_X, next: EMPTY });
                      working[idx] = EMPTY;
                    }
                  } else {
                    if (marks[idx] === FLAG) {
                      if (cells.size === 1) {
                        changes.push({ idx, prev: FLAG, next: EMPTY });
                        working[idx] = EMPTY;
                      }
                      continue;
                    }
                    const ch = placeFlag(idx, working);
                    if (ch === null) {
                      wrong = true; // one heart per gesture, even across cells
                    } else if (ch.length > 0) {
                      changes.push(...ch);
                    }
                  }
                }
                if (wrong) loseHeart(null);
                if (changes.length > 0) applyChanges(changes);
                if (working.filter((m) => m === FLAG).length === puzzle.size && !wrong)
                  setStatus("won");
              }
              dragStart.current = null;
              dragEnd.current = null;
              setDragCells(new Set());
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }}
            onPointerLeave={(e) => {
              if (dragStart.current) {
                dragStart.current = null;
                dragEnd.current = null;
                setDragCells(new Set());
                try {
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {}
              }
            }}
          >
            {marks.map((m, i) => {
              const r = Math.floor(i / n);
              const c = i % n;
              const rid = puzzle.regions[r][c];
              const sameUp = r > 0 && puzzle.regions[r - 1][c] === rid;
              const sameLeft = c > 0 && puzzle.regions[r][c - 1] === rid;
              return (
                <button
                  key={i}
                  role="gridcell"
                  aria-label={`row ${r + 1} col ${c + 1}`}
                  className={
                    "cell" +
                    (m === FLAG ? " is-flag" : "") +
                    (conflicts.has(i) ? " is-conflict" : "") +
                    (errorIdx === i ? " is-error" : "") +
                    (dragCells.has(i) ? " is-drag" : "")
                  }
                  style={{
                    background: regionColor(rid, n),
                    borderTopWidth: sameUp ? 1 : 3,
                    borderLeftWidth: sameLeft ? 1 : 3,
                    borderRightWidth: c === n - 1 ? 3 : 1,
                    borderBottomWidth: r === n - 1 ? 3 : 1,
                  }}
                  onClick={() => handleCell(i)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    handleCell(i, true);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleCell(i, true);
                  }}
                >
                  {m === FLAG ? (
                    <span className="flag">⚑</span>
                  ) : m === MARK_X ? (
                    <span className="ex">×</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </main>

      <div className=" modestack">
        <div className="modeseg" role="group" aria-label="input mode">
          <button
            className={mode === MARK_X ? "seg on" : "seg"}
            onClick={() => setMode(MARK_X)}
          >
            ✕ Mark
          </button>
          <button
            className={mode === FLAG ? "seg on" : "seg"}
            onClick={() => setMode(FLAG)}
          >
            ⚑ Flag
          </button>
        </div>
        <label className="autox">
          <input type="checkbox" checked={autoX} onChange={(e) => setAutoX(e.target.checked)} />
          Auto-✕
        </label>
      </div>

      <div className="actions">
        <button onClick={undo} disabled={history.length === 0}>
          Undo
        </button>
        <button onClick={hint} disabled={status !== "playing"}>
          Hint
        </button>
        <button onClick={reset}>Reset</button>
        <button className="primary" onClick={() => newGame(size)}>
          New game
        </button>
      </div>

      <details className="howto">
        <summary>How to play</summary>
        <ul>
          <li>Tap a cell to place ✕ (blocked). Switch to Flag mode, or double-click / right-click, to place ⚑.</li>
          <li>Tap a placed ⚑/✕ to clear it.</li>
          <li>Each color region holds exactly one flag. Each row and column holds exactly one flag.</li>
          <li>Flags can't touch, even diagonally.</li>
          <li>Wrong flag costs a heart. Lose all 3 and the level ends.</li>
        </ul>
      </details>

      {status === "won" && (
        <div className="overlay">
          <div className="card">
            <h2>Solved 🎉</h2>
            <p>
              {n}×{n} in {fmtTime(seconds)} · {mistakes} mistake{mistakes === 1 ? "" : "s"}
            </p>
            <div className="cardrow">
              <button onClick={() => newGame(size)} className="primary">
                Next puzzle
              </button>
            </div>
          </div>
        </div>
      )}
      {status === "lost" && (
        <div className="overlay">
          <div className="card">
            <h2>Out of hearts 💔</h2>
            <p>Use ✕ marks to rule cells out before flagging.</p>
            <div className="cardrow">
              <button onClick={reset} className="primary">
                Retry
              </button>
              <button onClick={() => newGame(size)}>New puzzle</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
