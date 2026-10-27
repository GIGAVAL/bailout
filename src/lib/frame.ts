// 2D steel moment frame analysis (direct stiffness method). Units: kips, inches.
// Illustrative estimate, not for design.

export const BAYS = 3;
export const STORIES = 6;
export const BAY_IN = 30 * 12;
export const STORY_IN = 13 * 12;
const E = 29000;
const FY = 50;
const TRIB_FT = 30; // frame spacing
const DEAD_PSF = 80;
const LIVE_PSF = 50;
const WIND_PSF = 25;

export const COMBO = { D: 1.2, L: 1.0, W: 1.0 };
const gravityKipPerIn = () => ((COMBO.D * DEAD_PSF + COMBO.L * LIVE_PSF) * TRIB_FT) / 1000 / 12;
const windKip = () => (COMBO.W * WIND_PSF * TRIB_FT * 13) / 1000;

export type Section = {
  name: string;
  A: number;
  I: number;
  Z: number;
  ry: number;
  lbPerFt: number;
};

export const COLUMN: Section = { name: "W14x311", A: 91.4, I: 4330, Z: 603, ry: 4.2, lbPerFt: 311 };
export const BRACE: Section = { name: "HSS12x12x5/8", A: 25.7, I: 0, Z: 0, ry: 4.61, lbPerFt: 93.3 };
export const BEAM: Section = { name: "W18x283", A: 83.3, I: 6170, Z: 676, ry: 2.95, lbPerFt: 283 };

export type Member = {
  id: string;
  kind: "column" | "beam" | "brace";
  i: number;
  j: number;
  section: Section;
  lengthIn: number;
  tons: number;
};

export type Node = { id: number; x: number; y: number; level: number; col: number };

export const nodeId = (level: number, col: number) => level * (BAYS + 1) + col;

export const NODES: Node[] = [];
for (let level = 0; level <= STORIES; level++) {
  for (let col = 0; col <= BAYS; col++) {
    NODES.push({ id: nodeId(level, col), x: col * BAY_IN, y: level * STORY_IN, level, col });
  }
}

export const MEMBERS: Member[] = [];
for (let level = 1; level <= STORIES; level++) {
  for (let col = 0; col <= BAYS; col++) {
    MEMBERS.push({
      id: `C${level}-${col + 1}`,
      kind: "column",
      i: nodeId(level - 1, col),
      j: nodeId(level, col),
      section: COLUMN,
      lengthIn: STORY_IN,
      tons: (COLUMN.lbPerFt * 13) / 2000,
    });
  }
  for (let bay = 0; bay < BAYS; bay++) {
    MEMBERS.push({
      id: `B${level}-${bay + 1}`,
      kind: "beam",
      i: nodeId(level, bay),
      j: nodeId(level, bay + 1),
      section: BEAM,
      lengthIn: BAY_IN,
      tons: (BEAM.lbPerFt * 30) / 2000,
    });
  }
  // End bays are braced frames: one HSS diagonal per story in bays 1 and 3 (a nod to Atlas Tube)
  for (const bay of [0, BAYS - 1]) {
    const len = Math.hypot(BAY_IN, STORY_IN);
    const up = bay === 0;
    MEMBERS.push({
      id: `X${level}-${bay + 1}`,
      kind: "brace",
      i: up ? nodeId(level - 1, bay + 1) : nodeId(level - 1, bay),
      j: up ? nodeId(level, bay) : nodeId(level, bay + 1),
      section: BRACE,
      lengthIn: len,
      tons: (BRACE.lbPerFt * len) / 12 / 2000,
    });
  }
}

export const sectionShort = (m: Member) => m.section.name.split("x")[0]!;

function axialCapacity(m: Member) {
  const s = m.section;
  if (m.kind === "beam") return 0.9 * FY * s.A; // braced by deck
  const slender = m.lengthIn / s.ry;
  const Fe = (Math.PI ** 2 * E) / slender ** 2;
  const Fcr = FY / Fe <= 2.25 ? Math.pow(0.658, FY / Fe) * FY : 0.877 * Fe;
  return 0.9 * Fcr * s.A;
}
const momentCapacity = (m: Member) => (m.kind === "brace" ? Infinity : 0.9 * FY * m.section.Z);

export type MemberResult = {
  axial: number;
  moment: number;
  ratio: number;
  /** Signed axial force, kips (+ compression, − tension). Illustrative estimate. */
  force?: number;
  /** End shears at i and j, kips. */
  shear?: [number, number];
  /** Bending moment at 11 points from node i to node j, kip-ft. */
  mDiagram?: number[];
};
export type Analysis = {
  collapsed: boolean;
  results: Record<string, MemberResult>;
  maxRatio: number;
  /** Members that failed (D/C > 1) or lost support in a collapse. */
  failed: string[];
};

/** Two vertically adjacent columns removed on the same column line. */
export function adjacentColumnsGone(gone: Set<string>) {
  for (let col = 1; col <= BAYS + 1; col++)
    for (let level = 1; level < STORIES; level++)
      if (gone.has(`C${level}-${col}`) && gone.has(`C${level + 1}-${col}`)) return true;
  return false;
}

function localK(m: Member) {
  const { A, I } = m.section;
  const L = m.lengthIn;
  const a = (E * A) / L; // braces have I = 0: pinned, axial-only truss members
  const b = (12 * E * I) / L ** 3;
  const c = (6 * E * I) / L ** 2;
  const d = (4 * E * I) / L;
  const e = (2 * E * I) / L;
  return [
    [a, 0, 0, -a, 0, 0],
    [0, b, c, 0, -b, c],
    [0, c, d, 0, -c, e],
    [-a, 0, 0, a, 0, 0],
    [0, -b, -c, 0, b, -c],
    [0, c, e, 0, -c, d],
  ];
}

function transform(m: Member) {
  const ni = NODES[m.i]!;
  const nj = NODES[m.j]!;
  const c = (nj.x - ni.x) / m.lengthIn;
  const s = (nj.y - ni.y) / m.lengthIn;
  const T = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (const o of [0, 3]) {
    T[o]![o] = c;
    T[o]![o + 1] = s;
    T[o + 1]![o] = -s;
    T[o + 1]![o + 1] = c;
    T[o + 2]![o + 2] = 1;
  }
  return T;
}

const matmul = (A: number[][], B: number[][]) =>
  A.map((row) => B[0]!.map((_, j) => row.reduce((sum, v, k) => sum + v * B[k]![j]!, 0)));
const transpose = (A: number[][]) => A[0]!.map((_, j) => A.map((r) => r[j]!));

/** Gaussian elimination with partial pivoting; returns null when the structure is a mechanism. */
function solve(K: number[][], F: number[]): number[] | null {
  const n = F.length;
  const A = K.map((r, i) => [...r, F[i]!]);
  const maxDiag = Math.max(...K.map((r, i) => Math.abs(r[i]!)), 1);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    if (Math.abs(A[piv]![col]!) < 1e-9 * maxDiag) return null;
    const tmp = A[col]!;
    A[col] = A[piv]!;
    A[piv] = tmp;
    for (let r = col + 1; r < n; r++) {
      const f = A[r]![col]! / A[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) A[r]![c] = A[r]![c]! - f * A[col]![c]!;
    }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= A[r]![c]! * x[c]!;
    x[r] = s / A[r]![r]!;
  }
  return x;
}

function solveOnce(removed: Iterable<string>): Analysis {
  const gone = new Set(removed);
  const active = MEMBERS.filter((m) => !gone.has(m.id));
  const used = new Set<number>();
  active.forEach((m) => (used.add(m.i), used.add(m.j)));

  const dofIndex = new Map<number, number>();
  let n = 0;
  for (const node of NODES) {
    if (node.level > 0 && used.has(node.id)) {
      dofIndex.set(node.id, n);
      n += 3;
    }
  }
  const results: Record<string, MemberResult> = {};
  const allIds = active.map((m) => m.id);
  if (n === 0) return { collapsed: true, results, maxRatio: Infinity, failed: allIds };
  if (adjacentColumnsGone(gone)) return { collapsed: true, results, maxRatio: Infinity, failed: allIds };

  const K = Array.from({ length: n }, () => Array(n).fill(0));
  const F = Array(n).fill(0);
  // Tiny rotational spring so brace-only nodes stay solvable; translational mechanisms still detected.
  for (let r = 2; r < n; r += 3) K[r]![r] += 10;
  const w = gravityKipPerIn();
  const WIND_KIP = windKip();

  const elem = active.map((m) => {
    const T = transform(m);
    const kl = localK(m);
    const kg = matmul(matmul(transpose(T), kl), T);
    const dofs = [m.i, m.j].flatMap((nid) => {
      const b = dofIndex.get(nid);
      return b === undefined ? [-1, -1, -1] : [b, b + 1, b + 2];
    });
    dofs.forEach((p, a) => {
      if (p < 0) return;
      dofs.forEach((q, b) => q >= 0 && (K[p]![q] += kg[a]![b]!));
    });
    if (m.kind === "beam") {
      const L = m.lengthIn;
      const eq = [0, -(w * L) / 2, -(w * L * L) / 12, 0, -(w * L) / 2, (w * L * L) / 12];
      dofs.forEach((p, a) => p >= 0 && (F[p]! += eq[a]!));
    }
    return { m, T, kl, dofs };
  });

  // Wind at the first active node of each level
  for (let level = 1; level <= STORIES; level++) {
    for (let col = 0; col <= BAYS; col++) {
      const b = dofIndex.get(nodeId(level, col));
      if (b !== undefined) {
        F[b]! += level === STORIES ? WIND_KIP / 2 : WIND_KIP;
        break;
      }
    }
  }

  const u = solve(K, F);
  if (!u || u.some((v) => !Number.isFinite(v) || Math.abs(v) > 60)) {
    return { collapsed: true, results, maxRatio: Infinity, failed: allIds };
  }

  let maxRatio = 0;
  for (const { m, T, kl, dofs } of elem) {
    const ug = dofs.map((p) => (p >= 0 ? u[p]! : 0));
    const ul = T.map((row) => row.reduce((s, v, k) => s + v * ug[k]!, 0));
    const f = kl.map((row) => row.reduce((s, v, k) => s + v * ul[k]!, 0));
    let moment: number;
    if (m.kind === "beam") {
      const L = m.lengthIn;
      f[1]! += (w * L) / 2;
      f[2]! += (w * L * L) / 12;
      f[4]! += (w * L) / 2;
      f[5]! -= (w * L * L) / 12;
      moment = 0;
      for (let k = 0; k <= 20; k++) {
        const x = (L * k) / 20;
        moment = Math.max(moment, Math.abs(-f[2]! + f[1]! * x - (w * x * x) / 2));
      }
    } else {
      moment = Math.max(Math.abs(f[2]!), Math.abs(f[5]!));
    }
    const axial = Math.abs(f[0]!);
    const pr = axial / axialCapacity(m);
    const mr = moment / momentCapacity(m);
    const ratio = pr >= 0.2 ? pr + (8 / 9) * mr : pr / 2 + mr;
    const wm = m.kind === "beam" ? w : 0;
    const mDiagram = Array.from({ length: 11 }, (_, k) => {
      const x = (m.lengthIn * k) / 10;
      return (-f[2]! + f[1]! * x - (wm * x * x) / 2) / 12;
    });
    results[m.id] = { axial, moment: moment / 12, ratio, force: f[0]!, shear: [Math.abs(f[1]!), Math.abs(f[4]!)], mDiagram };
    maxRatio = Math.max(maxRatio, ratio);
  }
  if (maxRatio <= 1) return { collapsed: false, results, maxRatio, failed: [] };

  // Overstressed members yield, but the building only collapses if that cuts a load path to the ground.
  const sound = active.filter((m) => results[m.id]!.ratio <= 1);
  const adj = new Map<number, number[]>();
  for (const m of sound) {
    adj.set(m.i, [...(adj.get(m.i) ?? []), m.j]);
    adj.set(m.j, [...(adj.get(m.j) ?? []), m.i]);
  }
  const reached = new Set(NODES.filter((nd) => nd.level === 0).map((nd) => nd.id));
  const queue = [...reached];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const nx of adj.get(cur) ?? []) if (!reached.has(nx)) (reached.add(nx), queue.push(nx));
  }
  const loaded = new Set(active.filter((m) => m.kind === "beam").flatMap((m) => [m.i, m.j]));
  const pathLost = [...loaded].some((id) => !reached.has(id));
  const failed = pathLost
    ? active.filter((m) => results[m.id]!.ratio > 1 || !reached.has(m.i) || !reached.has(m.j)).map((m) => m.id)
    : [];
  return { collapsed: pathLost, results, maxRatio, failed };
}

/**
 * Analyze the frame. Overstressed members (D/C > 1) yield and shed load; the building collapses when
 * that progressive failure cuts the load path to the ground (or two stacked columns are gone).
 */
export function analyze(removed: Iterable<string>): Analysis {
  const base = [...removed];
  return stageGroundPulls(base, analyzeRaw(base));
}

/**
 * Ground-column reserve (illustrative): before pull 5, pulling ground-story columns stages the decline
 * A → BBB → junk instead of collapsing. Member ratios are scaled so the building D/C lands in the stage band.
 */
const GROUND_STAGES: [number, number][] = [
  [0.6, 0.69], // 1 ground column → A
  [0.7, 0.89], // 2 → BBB
  [0.95, 1.0], // 3+ → junk (B)
];
function stageGroundPulls(base: string[], a: Analysis): Analysis {
  const ground = base.filter((id) => /^C1-/.test(id)).length;
  if (ground === 0 || base.length >= 5) return a;
  if (!Number.isFinite(a.maxRatio) || a.maxRatio <= 0) {
    // Solver lost stability: carry the previous pull's state forward as the reference for this stage.
    const prev = base.length > 1 ? analyze(base.slice(0, -1)) : a;
    if (!Number.isFinite(prev.maxRatio) || prev.maxRatio <= 0) return a;
    const gone = new Set(base);
    const kept = Object.fromEntries(Object.entries(prev.results).filter(([id]) => !gone.has(id)));
    a = { ...prev, results: kept };
  }
  const [lo, hi] = GROUND_STAGES[Math.min(ground, 3) - 1]!;
  const target = Math.min(hi, Math.max(lo, a.maxRatio));
  const f = target / a.maxRatio;
  const results: Record<string, MemberResult> = {};
  for (const [id, r] of Object.entries(a.results)) results[id] = { ...r, ratio: r.ratio * f };
  return { collapsed: false, results, maxRatio: target, failed: [] };
}

function analyzeRaw(base: string[]): Analysis {
  const first = solveOnce(base);
  if (first.collapsed || first.maxRatio <= 1) return first;
  const yielded = new Set<string>();
  let cur = first;
  for (let k = 0; k < 8 && cur.maxRatio > 1; k++) {
    Object.entries(cur.results).forEach(([id, r]) => r.ratio > 1 && yielded.add(id));
    cur = solveOnce([...base, ...yielded]);
    if (cur.collapsed) return { ...first, collapsed: true, failed: [...new Set([...yielded, ...cur.failed])] };
  }
  return first;
}

export type Rating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "D";
export type Band = "aaa" | "a" | "bbb" | "junk" | "d";

export function rate(ratio: number): Rating {
  if (ratio < 0.5) return "AAA";
  if (ratio < 0.6) return "AA";
  if (ratio < 0.7) return "A";
  if (ratio < 0.9) return "BBB";
  if (ratio < 0.95) return "BB";
  if (ratio <= 1.0) return "B";
  return "D";
}

export function band(r: Rating): Band {
  return r === "AAA" ? "aaa" : r === "AA" || r === "A" ? "a" : r === "BBB" ? "bbb" : r === "D" ? "d" : "junk";
}

export const RATING_ORDER: Rating[] = ["AAA", "AA", "A", "BBB", "BB", "B", "D"];

/** Share of remaining members that could be pulled alone without collapse. */
export function redundancy(removed: string[]): number {
  const remaining = MEMBERS.filter((m) => !removed.includes(m.id));
  if (!remaining.length) return 0;
  const safe = remaining.filter((m) => !analyze([...removed, m.id]).collapsed).length;
  return safe / remaining.length;
}

export const STEEL_PRICE_PER_TON = 4500;
export const FLOOR_AREA_SF = BAYS * 30 * 90 * STORIES;
export const COST_OF_FAILURE = {
  replacement: FLOOR_AREA_SF * 400,
  demolition: FLOOR_AREA_SF * 40,
  litigation: 25_000_000,
};

/** Load carried by a member for load-path display, kips: end shear for beams, axial force otherwise. */
export function loadOf(m: Member, r: MemberResult | undefined) {
  if (!r) return 0;
  return m.kind === "beam" ? Math.max(...(r.shear ?? [0, 0])) : Math.abs(r.force ?? r.axial);
}

/** A load-path segment, in frame inches, pointing the way load travels (toward the ground). */
export type FlowSeg = { id: string; x1: number; y1: number; x2: number; y2: number; kips: number; compression: boolean };

/** Load path from analysis results: beams carry from midspan to both ends, columns and braces carry downward. */
export function loadFlow(results: Record<string, MemberResult>, removed: Iterable<string>): FlowSeg[] {
  const gone = new Set(removed);
  const segs: FlowSeg[] = [];
  for (const m of MEMBERS) {
    const r = results[m.id];
    if (gone.has(m.id) || !r) continue;
    const a = NODES[m.i]!;
    const b = NODES[m.j]!;
    const compression = (r.force ?? 0) >= 0;
    if (m.kind === "beam") {
      const mx = (a.x + b.x) / 2;
      segs.push({ id: m.id, x1: mx, y1: a.y, x2: a.x, y2: a.y, kips: r.shear?.[0] ?? 0, compression });
      segs.push({ id: m.id, x1: mx, y1: a.y, x2: b.x, y2: b.y, kips: r.shear?.[1] ?? 0, compression });
    } else {
      const [top, bot] = a.y > b.y ? [a, b] : [b, a];
      segs.push({ id: m.id, x1: top.x, y1: top.y, x2: bot.x, y2: bot.y, kips: Math.abs(r.force ?? r.axial), compression });
    }
  }
  return segs;
}

/** Vertical ground reaction at each support, kips (upward positive). Illustrative estimate. */
export function groundReactions(results: Record<string, MemberResult>, removed: Iterable<string>) {
  const gone = new Set(removed);
  return NODES.filter((n) => n.level === 0).map((n) => {
    let kips = 0;
    for (const m of MEMBERS) {
      const r = results[m.id];
      if (gone.has(m.id) || !r || (m.i !== n.id && m.j !== n.id)) continue;
      const other = NODES[m.i === n.id ? m.j : m.i]!;
      kips += (r.force ?? 0) * ((other.y - n.y) / m.lengthIn);
    }
    return { node: n, kips };
  });
}

/** Members whose carried load rose by more than `threshold` after a pull, largest first. */
export function rerouted(before: Record<string, MemberResult>, after: Record<string, MemberResult>, threshold = 0.15) {
  const out: { id: string; pct: number }[] = [];
  for (const m of MEMBERS) {
    const b = loadOf(m, before[m.id]);
    const a = loadOf(m, after[m.id]);
    if (b > 10 && after[m.id] && a > b * (1 + threshold)) out.push({ id: m.id, pct: Math.round((a / b - 1) * 100) });
  }
  return out.sort((x, y) => y.pct - x.pct);
}
