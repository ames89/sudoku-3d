import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  EMPTY,
  FLAG,
  MARK_X,
  autoXCells3D,
  coords3,
  findConflicts3D,
  generatePuzzle3D,
  idx3,
  regionColor3D,
  type CellMark,
  type Coord,
  type Puzzle3D,
} from "./game3d";

type Status = "playing" | "won" | "lost";
type Axis = "x" | "y" | "z";
interface Change {
  idx: number;
  prev: CellMark;
  next: CellMark;
}

const N = 4;
const SPREAD = 1.7;
const HOLD_MS = 450;

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}

/** Layer offset: depth d peels d front layers off as a fanned slab. */
function layerOffset(layer: number, depth: number): number {
  if (layer < N - depth) return 0;
  return (layer - (N - depth - 1)) * SPREAD;
}

export default function CubeView() {
  const [puzzle, setPuzzle] = useState<Puzzle3D | null>(null);
  const [marks, setMarks] = useState<CellMark[]>([]);
  const [hearts, setHearts] = useState(3);
  const [mode, setMode] = useState<CellMark>(MARK_X);
  const [autoX, setAutoX] = useState(true);
  const [status, setStatus] = useState<Status>("playing");
  const [mistakes, setMistakes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [history, setHistory] = useState<Change[][]>([]);
  const [errorIdx, setErrorIdx] = useState<number | null>(null);
  const [depth, setDepth] = useState(0);
  const [axis, setAxis] = useState<Axis>("z");
  const [busy, setBusy] = useState(false);

  const holdTimer = useRef<number | undefined>(undefined);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const lastPeel = useRef(0);
  const errTimer = useRef<number | undefined>(undefined);

  const newGame = () => {
    setBusy(true);
    window.setTimeout(() => {
      try {
        const p = generatePuzzle3D(N);
        setPuzzle(p);
        setMarks(new Array(N * N * N).fill(EMPTY));
        setHearts(3);
        setMistakes(0);
        setSeconds(0);
        setHistory([]);
        setStatus("playing");
        setDepth(0);
        setErrorIdx(null);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  useEffect(() => {
    newGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (status !== "playing" || !puzzle) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [status, puzzle]);
  useEffect(() => () => {
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(errTimer.current);
  }, []);

  const flagCount = useMemo(() => marks.filter((m) => m === FLAG).length, [marks]);
  const conflicts = useMemo(
    () => (puzzle ? findConflicts3D(N, puzzle.regions, marks) : new Set<number>()),
    [puzzle, marks],
  );

  // Exploded positions, recentered.
  const posOf = (c: Coord): [number, number, number] => {
    const off = layerOffset(axis === "x" ? c.x : axis === "y" ? c.y : c.z, depth);
    let mean = 0;
    for (let l = 0; l < N; l++) mean += layerOffset(l, depth);
    mean /= N;
    const p: [number, number, number] = [c.x - 1.5, c.y - 1.5, c.z - 1.5];
    if (axis === "x") p[0] += off - mean;
    else if (axis === "y") p[1] += off - mean;
    else p[2] += off - mean;
    return p;
  };

  function commit(changes: Change[]) {
    setMarks((prev) => {
      const next = prev.slice();
      for (const ch of changes) next[ch.idx] = ch.next;
      return next;
    });
    setHistory((h) => [...h, changes]);
  }

  function flash(i: number) {
    setErrorIdx(i);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setErrorIdx(null), 600);
  }

  function handleCell(i: number, forceFlag = false) {
    if (!puzzle || status !== "playing" || busy) return;
    if (Date.now() - lastPeel.current < 600) return; // peel gesture, not a tap
    const cur = marks[i];
    if (!forceFlag && cur !== EMPTY) {
      commit([{ idx: i, prev: cur, next: EMPTY }]);
      return;
    }
    const want: CellMark = forceFlag ? FLAG : mode;
    if (want === MARK_X) {
      if (cur === EMPTY) commit([{ idx: i, prev: cur, next: MARK_X }]);
      return;
    }
    if (cur === FLAG) {
      commit([{ idx: i, prev: cur, next: EMPTY }]);
      return;
    }
    if (!puzzle.solutionSet.has(i)) {
      flash(i);
      const left = hearts - 1;
      setHearts(left);
      setMistakes((m) => m + 1);
      if (left <= 0) setStatus("lost");
      return;
    }
    const changes: Change[] = [{ idx: i, prev: cur, next: FLAG }];
    if (autoX) {
      const c = coords3(N, i);
      for (const j of autoXCells3D(N, puzzle.regions, c))
        if (marks[j] === EMPTY) changes.push({ idx: j, prev: EMPTY, next: MARK_X });
    }
    const flagged = marks.filter((m) => m === FLAG).length + 1;
    commit(changes);
    if (flagged === N) setStatus("won");
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
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
    setMarks(new Array(N * N * N).fill(EMPTY));
    setHearts(3);
    setMistakes(0);
    setSeconds(0);
    setHistory([]);
    setStatus("playing");
    setErrorIdx(null);
  }

  function hint() {
    if (!puzzle || status !== "playing") return;
    for (const s of puzzle.solution) {
      const i = idx3(N, s.x, s.y, s.z);
      if (marks[i] !== FLAG) {
        handleCell(i, true);
        return;
      }
    }
  }

  // Long-press (no drag) steps peel depth. Drag cancels -> orbit.
  function onDown(e: React.PointerEvent) {
    downPos.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      lastPeel.current = Date.now();
      setDepth((d) => (d + 1) % (N + 1));
    }, HOLD_MS);
  }
  function onMove(e: React.PointerEvent) {
    const d0 = downPos.current;
    if (d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 8) {
      downPos.current = null;
      window.clearTimeout(holdTimer.current);
    }
  }
  function onUp() {
    downPos.current = null;
    window.clearTimeout(holdTimer.current);
  }

  return (
    <div>
      <div className="statbar">
        <div className="stat">
          <span className="k">Flags</span>
          <span className="v">{flagCount}/{N}</span>
        </div>
        <div className="stat">
          <span className="k">Peel</span>
          <span className="v">{depth}/{N}</span>
        </div>
        <div className="stat">
          <span className="k">Time</span>
          <span className="v">{fmt(seconds)}</span>
        </div>
        <div className="hearts" aria-label="hearts">
          {[0, 1, 2].map((k) => (
            <span key={k} className={k < hearts ? "heart on" : "heart off"}>♥</span>
          ))}
        </div>
      </div>

      <div className="rules">
        <span>{N} flags in {N}³</span>·<span>1 per region</span>·
        <span>1 per layer, every direction</span>·<span>no touching in 3D</span>
      </div>
      <div className="cubehint">Press + hold cube to peel one layer deeper. Hold again to close after full open.</div>

      <div
        className="canvaswrap"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {busy || !puzzle ? (
          <div className="loading">Generating cube…</div>
        ) : (
          <Canvas camera={{ position: [6.5, 5.5, 8], fov: 42 }}>
            <ambientLight intensity={1.1} />
            <directionalLight position={[6, 9, 6]} intensity={1.4} />
            <directionalLight position={[-6, -4, -6]} intensity={0.35} />
            <Suspense fallback={null}>
              {marks.map((m, i) => {
                const c = coords3(N, i);
                const rid = puzzle.regions[c.x][c.y][c.z];
                const p = posOf(c);
                const isErr = errorIdx === i;
                const isCon = conflicts.has(i);
                const color = isErr
                  ? "#ef4444"
                  : isCon && m === FLAG
                    ? "#ef4444"
                    : m === FLAG
                      ? "#1f2937"
                      : m === MARK_X
                        ? "#6b7280"
                        : regionColor3D(rid, N);
                return (
                  <group key={i} position={p}>
                    <mesh
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCell(i, (e.nativeEvent as MouseEvent).button === 2);
                      }}
                    >
                      <boxGeometry args={m === MARK_X ? [0.62, 0.62, 0.62] : [0.9, 0.9, 0.9]} />
                      <meshStandardMaterial
                        color={color}
                        roughness={0.55}
                        metalness={0.05}
                        transparent={m === MARK_X}
                        opacity={m === MARK_X ? 0.55 : 1}
                      />
                    </mesh>
                    {m === FLAG && (
                      <mesh position={[0, 0.78, 0]}>
                        <coneGeometry args={[0.2, 0.5, 12]} />
                        <meshStandardMaterial color={isCon ? "#ef4444" : "#f59e0b"} roughness={0.4} />
                      </mesh>
                    )}
                    {m === MARK_X && (
                      <mesh>
                        <boxGeometry args={[0.66, 0.12, 0.66]} />
                        <meshStandardMaterial color="#111827" roughness={0.6} />
                      </mesh>
                    )}
                  </group>
                );
              })}
            </Suspense>
            <OrbitControls makeDefault enablePan={false} minDistance={4} maxDistance={24} />
          </Canvas>
        )}
      </div>

      <div className="modestack">
        <div className="modeseg" role="group" aria-label="input mode">
          <button className={mode === MARK_X ? "seg on" : "seg"} onClick={() => setMode(MARK_X)}>
            ✕ Mark
          </button>
          <button className={mode === FLAG ? "seg on" : "seg"} onClick={() => setMode(FLAG)}>
            ⚑ Flag
          </button>
        </div>
        <div className="modeseg axisseg" role="group" aria-label="peel axis">
          {(["x", "y", "z"] as Axis[]).map((a) => (
            <button key={a} className={axis === a ? "seg on" : "seg"} onClick={() => setAxis(a)}>
              {a.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="autox">
          <input type="checkbox" checked={autoX} onChange={(e) => setAutoX(e.target.checked)} />
          Auto-✕
        </label>
      </div>

      <div className="actions">
        <button onClick={undo} disabled={history.length === 0}>Undo</button>
        <button onClick={hint} disabled={status !== "playing"}>Hint</button>
        <button onClick={reset}>Reset</button>
        <button className="primary" onClick={newGame}>New cube</button>
      </div>

      {status === "won" && (
        <div className="overlay">
          <div className="card">
            <h2>Solved 🎉</h2>
            <p>4³ cube in {fmt(seconds)} · {mistakes} mistake{mistakes === 1 ? "" : "s"}</p>
            <div className="cardrow">
              <button onClick={newGame} className="primary">Next cube</button>
            </div>
          </div>
        </div>
      )}
      {status === "lost" && (
        <div className="overlay">
          <div className="card">
            <h2>Out of hearts 💔</h2>
            <p>Peel layers and ✕ out blocked cells first.</p>
            <div className="cardrow">
              <button onClick={reset} className="primary">Retry</button>
              <button onClick={newGame}>New cube</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
