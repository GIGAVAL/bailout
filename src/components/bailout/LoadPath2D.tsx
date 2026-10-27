import { BAYS, BAY_IN, MEMBERS, NODES, STORIES, STORY_IN, groundReactions, loadFlow, type FlowSeg, type MemberResult } from "@/lib/frame";

export type Reroute = { key: number; pulled: string; fade: FlowSeg[]; gains: { id: string; pct: number }[] };

type Props = {
  results: Record<string, MemberResult>;
  removed: string[];
  flow: boolean;
  diagrams: boolean;
  crashed: boolean;
  reroute: Reroute | null;
  px: (x: number) => number;
  py: (y: number) => number;
};

/** SVG overlay: animated load path, applied floor loads, ground reactions and force diagrams (visual only). */
export function LoadPath2D({ results, removed, flow, diagrams, crashed, reroute, px, py }: Props) {
  const segs = loadFlow(results, removed);
  const maxK = Math.max(1, ...segs.map((s) => s.kips));
  const surge = new Map((reroute?.gains ?? []).map((g) => [g.id, g.pct]));
  const members = MEMBERS.filter((m) => !removed.includes(m.id) && results[m.id]);
  const maxF = Math.max(1, ...members.map((m) => Math.abs(results[m.id]?.force ?? 0)));
  const maxM = Math.max(1, ...members.flatMap((m) => (results[m.id]?.mDiagram ?? []).map(Math.abs)));

  const line = (s: FlowSeg, cls: string, extra?: React.CSSProperties) => {
    const k = s.kips / maxK;
    const color = crashed ? "var(--loss)" : s.compression ? "var(--flow-compression)" : "var(--flow-tension)";
    return (
      <line
        key={`${cls}-${s.id}-${s.x2}-${s.y2}`}
        x1={px(s.x1)}
        y1={py(s.y1)}
        x2={px(s.x2)}
        y2={py(s.y2)}
        stroke={color}
        className={cls}
        strokeLinecap="round"
        strokeDasharray="1 11"
        style={{ strokeWidth: 1.5 + k * 5, animationDuration: `${(2.6 - k * 2).toFixed(2)}s`, ...extra }}
      />
    );
  };

  return (
    <g pointerEvents="none">
      {flow && (
        <>
          {/* Applied floor load (illustrative) */}
          {Array.from({ length: STORIES }, (_, k) => (k + 1) * STORY_IN).map((y) =>
            Array.from({ length: BAYS * 2 }, (_, i) => ((i + 0.5) * BAY_IN) / 2).map((x) => (
              <g key={`${x}-${y}`} className="load-arrow">
                <line x1={px(x)} x2={px(x)} y1={py(y) - 18} y2={py(y) - 8} strokeWidth={1} />
                <path d={`M${px(x) - 3},${py(y) - 9} L${px(x) + 3},${py(y) - 9} L${px(x)},${py(y) - 5} Z`} />
              </g>
            )),
          )}
          <text x={px(0)} y={py(STORIES * STORY_IN) - 22} fontSize={9} className="load-arrow-text">
            ↓ 80 PSF DEAD + 50 PSF LIVE · ILLUSTRATIVE
          </text>
          {/* Ground reactions */}
          {groundReactions(results, removed).map(({ node, kips }) => (
            <g key={node.id} className="reaction-arrow">
              <line x1={px(node.x)} x2={px(node.x)} y1={py(0) + 34} y2={py(0) + 14} strokeWidth={1.5} />
              <path d={`M${px(node.x) - 4},${py(0) + 16} L${px(node.x) + 4},${py(0) + 16} L${px(node.x)},${py(0) + 10} Z`} />
              <text x={px(node.x) + 6} y={py(0) + 32} fontSize={9}>
                {Math.round(kips)}k
              </text>
            </g>
          ))}
          <text x={px(BAYS * BAY_IN)} y={py(0) + 46} fontSize={8} textAnchor="end" className="load-arrow-text">
            GROUND REACTIONS, KIPS · ILLUSTRATIVE ESTIMATE
          </text>
          {segs.map((s) =>
            line(s, crashed ? "flow-frozen" : surge.has(s.id) ? "flow-dash flow-surge" : "flow-dash", surge.has(s.id) ? { animationDuration: `${(1.2 - (s.kips / maxK) * 0.9).toFixed(2)}s, 1.5s` } : undefined),
          )}
          {!crashed && reroute?.fade.map((s) => line(s, "flow-dash flow-fade"))}
        </>
      )}
      {diagrams &&
        members.map((m) => {
          const a = NODES[m.i]!;
          const b = NODES[m.j]!;
          const r = results[m.id]!;
          const x1 = px(a.x), y1 = py(a.y), x2 = px(b.x), y2 = py(b.y);
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
          const ax = (Math.abs(r.force ?? 0) / maxF) * 12;
          const pts = (r.mDiagram ?? []).map((v, k) => {
            const t = k / 10;
            const o = (v / maxM) * 16;
            return `${x1 + (x2 - x1) * t + nx * o},${y1 + (y2 - y1) * t + ny * o}`;
          });
          return (
            <g key={m.id} className="force-diagram">
              {m.kind !== "beam" && <polygon points={`${x1},${y1} ${x2},${y2} ${x2 - nx * ax},${y2 - ny * ax} ${x1 - nx * ax},${y1 - ny * ax}`} />}
              {m.kind !== "brace" && <polyline points={`${x1},${y1} ${pts.join(" ")} ${x2},${y2}`} />}
            </g>
          );
        })}
      {flow &&
        !crashed &&
        reroute?.gains.slice(0, 6).map(({ id, pct }) => {
          const m = MEMBERS.find((x) => x.id === id)!;
          const a = NODES[m.i]!, b = NODES[m.j]!;
          const x = (px(a.x) + px(b.x)) / 2, y = (py(a.y) + py(b.y)) / 2 - 14;
          return (
            <g key={`${reroute.key}-${id}`} className="load-tag">
              <rect x={x - 26} y={y - 8} width={52} height={13} />
              <text x={x} y={y + 2} textAnchor="middle" fontSize={9} fontWeight={700}>
                +{pct}% load
              </text>
            </g>
          );
        })}
    </g>
  );
}
