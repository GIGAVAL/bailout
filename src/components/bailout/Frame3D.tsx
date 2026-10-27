import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { MEMBERS, NODES, BAYS, BAY_IN, STORIES, STORY_IN, type Band, type Member, type FlowSeg } from "@/lib/frame";

// 3D visualization only: the analyzed 2D frame is repeated on 3 parallel gridlines. Units: feet.
const GRID_FT = 30;
const LINES = [0, 1, 2].map((k) => (k - 1) * GRID_FT);
const WIDTH = (BAYS * BAY_IN) / 12;
const HEIGHT = (STORIES * STORY_IN) / 12;
const G = 32; // ft/s^2
const BANDS: Band[] = ["aaa", "a", "bbb", "junk", "d"];
type Colors = Record<Band | "--flow-compression" | "--flow-tension" | "--loss" | "--ghost" | "--background" | "--border" | "--muted" | "--dust" | "--slab" | "--light-sky" | "--light-ground", THREE.Color>;

/** Resolve CSS theme colors (oklch) to THREE colors via a canvas pixel. */
function useThemeColors() {
  const [colors, setColors] = useState<Colors | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const resolve = (v: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css.getPropertyValue(v).trim();
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return new THREE.Color().setRGB((r ?? 0) / 255, (g ?? 0) / 255, (b ?? 0) / 255, THREE.SRGBColorSpace);
    };
    const out: Record<string, THREE.Color> = {};
    BANDS.forEach((b) => (out[b] = resolve(`--rating-${b}`)));
    ["--flow-compression", "--flow-tension", "--loss", "--ghost", "--background", "--border", "--muted", "--dust", "--slab", "--light-sky", "--light-ground"].forEach((v) => (out[v] = resolve(v)));
    setColors(out as Colors);
  }, []);
  return colors;
}

function memberTransform(m: Member, z: number) {
  const a = NODES[m.i];
  const b = NODES[m.j];
  if (!a || !b) return { pos: [0, 0, z] as [number, number, number], len: 0, angle: 0 };
  const ax = a.x / 12 - WIDTH / 2;
  const bx = b.x / 12 - WIDTH / 2;
  const ay = a.y / 12;
  const by = b.y / 12;
  const len = Math.hypot(bx - ax, by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  return { pos: [(ax + bx) / 2, (ay + by) / 2, z] as [number, number, number], len, angle };
}

const thick = (m: Member) => (m.kind === "column" ? 1.3 : m.kind === "beam" ? 1.5 : 0.8);

/** Gravity tween: drops and tilts its children after a level-based delay once `start` is set. */
function Faller({ start, y0, seed, children }: { start: number | null; y0: number; seed: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (start === null) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      return;
    }
    const t = Math.max(0, clock.elapsedTime - start - (HEIGHT - y0) * 0.006 - (seed % 5) * 0.04);
    const drop = Math.min(0.5 * G * t * t, Math.max(y0 - 0.6, 0));
    const p = y0 > 0.6 ? drop / (y0 - 0.6) : 1;
    g.position.set(Math.sin(seed) * 6 * p, -drop, Math.cos(seed * 1.7) * 6 * p);
    g.rotation.set(Math.sin(seed * 3.1) * 0.9 * p, 0, Math.cos(seed * 2.3) * 1.1 * p);
  });
  return <group ref={ref}>{children}</group>;
}

function Dust({ start, color }: { start: number | null; color: THREE.Color }) {
  const puffs = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: Math.sin(i * 2.4) * WIDTH * 0.45,
        z: Math.cos(i * 1.9) * GRID_FT * 0.9,
        s: 6 + (i % 4) * 3,
        d: (i % 5) * 0.08,
      })),
    [],
  );
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    puffs.forEach((p, i) => {
      const m = refs.current[i];
      if (!m) return;
      if (start === null) return void (m.visible = false);
      const t = clock.elapsedTime - start - 0.5 - p.d;
      m.visible = t > 0 && t < 3;
      const k = Math.min(Math.max(t / 3, 0), 1);
      m.scale.setScalar(p.s * (0.3 + k * 1.4));
      m.position.y = 1 + k * 8;
      (m.material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - k);
    });
  });
  return (
    <>
      {puffs.map((p, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)} position={[p.x, 1, p.z]} visible={false}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={color} transparent opacity={0} depthWrite={false} roughness={1} />
        </mesh>
      ))}
    </>
  );
}

const PER_SEG = 3;
const MAX_SEGS = 80;
/** Load-path particles flowing toward the ground on every gridline; frozen red on crash. Visual only. */
function Flow3D({ flow, crashed, colors }: { flow: FlowSeg[]; crashed: boolean; colors: Colors }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = MAX_SEGS * PER_SEG * LINES.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const maxK = Math.max(1, ...flow.map((f) => f.kips));
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    flow.slice(0, MAX_SEGS).forEach((f) => LINES.forEach(() => { for (let p = 0; p < PER_SEG; p++) mesh.setColorAt(n++, crashed ? colors["--loss"] : f.compression ? colors["--flow-compression"] : colors["--flow-tension"]); }));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [flow, crashed, colors]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    const t = crashed ? 0 : clock.elapsedTime;
    for (const f of flow.slice(0, MAX_SEGS)) {
      const k = f.kips / maxK;
      const len = Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 12 || 1;
      const speed = (4 + k * 22) / len;
      for (const z of LINES) {
        for (let p = 0; p < PER_SEG; p++) {
          const u = (t * speed + p / PER_SEG) % 1;
          dummy.position.set((f.x1 + (f.x2 - f.x1) * u) / 12 - WIDTH / 2, (f.y1 + (f.y2 - f.y1) * u) / 12, z + 0.9);
          dummy.scale.setScalar(0.35 + k * 0.9);
          dummy.updateMatrix();
          mesh.setMatrixAt(n++, dummy.matrix);
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Shaker({ start, children }: { start: number | null; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = start === null ? 99 : clock.elapsedTime - start - 0.3;
    const amp = t > 0 && t < 1.2 ? (1 - t / 1.2) * 0.9 : 0;
    ref.current.position.set(Math.sin(t * 61) * amp, Math.sin(t * 47) * amp * 0.5, Math.cos(t * 53) * amp);
  });
  return <group ref={ref}>{children}</group>;
}

type Props = {
  flow: FlowSeg[] | null;
  removed: string[];
  bands: Record<string, Band>;
  crashed: boolean;
  failed: string[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onPull: (id: string) => void;
};

function Building({ removed, bands, crashed, failed, hovered, onHover, onPull, colors }: Props & { colors: Colors }) {
  const [start, setStart] = useState<number | null>(null);
  const clockRef = useRef(0);
  useFrame(({ clock }) => void (clockRef.current = clock.elapsedTime));
  useEffect(() => setStart(crashed ? clockRef.current : null), [crashed]);
  const failSet = new Set(failed);
  // Failed members and everything above the lowest failure fall.
  const lowest = Math.min(...failed.map((id) => {
    const member = MEMBERS.find((m) => m.id === id);
    return member ? NODES[member.i]?.level ?? STORIES : STORIES;
  }), STORIES);
  const falls = (m: Member) => crashed && (failSet.has(m.id) || Math.max(NODES[m.i]?.level ?? 0, NODES[m.j]?.level ?? 0) > lowest);

  const over = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(id);
    document.body.style.cursor = crashed ? "default" : "pointer";
  };
  const out = () => {
    onHover(null);
    document.body.style.cursor = "default";
  };

  return (
    <Shaker start={start}>
      {MEMBERS.map((m, idx) =>
        LINES.map((z, li) => {
          const gone = removed.includes(m.id);
          const { pos, len, angle } = memberTransform(m, z);
          const color = gone ? colors["--ghost"] : colors[crashed && failSet.has(m.id) ? "d" : (bands[m.id] ?? "d")];
          const t = gone ? 0.25 : thick(m);
          const hot = hovered === m.id && !gone;
          return (
            <Faller key={`${m.id}-${li}`} start={falls(m) && !gone ? start : null} y0={pos[1]} seed={idx * 3 + li + 1}>
              <mesh
                position={pos}
                rotation={[0, 0, angle]}
                castShadow={!gone}
                onPointerOver={(e) => !gone && over(m.id)(e)}
                onPointerOut={() => !gone && out()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!gone && !crashed) onPull(m.id);
                }}
              >
                <boxGeometry args={[len, t, t]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={hot ? 1.2 : 0.65}
                  metalness={0.5}
                  roughness={0.45}
                  transparent={gone}
                  opacity={gone ? 0.25 : 1}
                />
              </mesh>
            </Faller>
          );
        }),
      )}
      {/* Transverse beams + slabs (visual only) */}
      {Array.from({ length: STORIES }, (_, k) => {
        const level = k + 1;
        const y = (level * STORY_IN) / 12;
        const fall = crashed && level > lowest;
        return (
          <Faller key={`lvl${level}`} start={fall ? start : null} y0={y} seed={level * 7.3}>
            {Array.from({ length: BAYS + 1 }, (_, col) => (
              <mesh key={col} position={[col * (WIDTH / BAYS) - WIDTH / 2, y, 0]}>
                <boxGeometry args={[1, 1.2, GRID_FT * 2]} />
                <meshStandardMaterial color={colors["--ghost"]} metalness={0.6} roughness={0.5} />
              </mesh>
            ))}
            <mesh position={[0, y + 0.85, 0]} receiveShadow>
              <boxGeometry args={[WIDTH, 0.5, GRID_FT * 2]} />
              <meshStandardMaterial color={colors["--slab"]} transparent opacity={0.07} wireframe depthWrite={false} roughness={0.9} />
            </mesh>
          </Faller>
        );
      })}
      <Dust start={start} color={colors["--dust"]} />
    </Shaker>
  );
}

export default function Frame3D(props: Props) {
  const colors = useThemeColors();
  const [autoRotate, setAutoRotate] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(idle.current), []);
  if (!colors) return null;
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [110, 82, 140], fov: 40 }} onPointerMissed={() => props.onHover(null)}>
      <color attach="background" args={[colors["--background"]]} />
      <fog attach="fog" args={[colors["--background"], 220, 420]} />
      <hemisphereLight args={[colors["--light-sky"], colors["--light-ground"], 0.7]} />
      <directionalLight position={[60, 120, 80]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-90, 90, 90, -90, 1, 400]} />
      </directionalLight>
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[0, 60, 0]} scale={[80, 80, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} color={colors.a} position={[-80, 20, 0]} rotation-y={Math.PI / 2} scale={[100, 20, 1]} />
      </Environment>
      <gridHelper args={[280, 28, colors["--border"], colors["--border"]]} position={[0, -0.05, 0]} />
      <Building {...props} colors={colors} />
      {props.flow && <Flow3D flow={props.flow} crashed={props.crashed} colors={colors} />}
      <OrbitControls
        target={[0, HEIGHT / 2 - 6, 0]}
        enablePan={false}
        minDistance={60}
        maxDistance={300}
        maxPolarAngle={Math.PI / 2 - 0.05}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        onStart={() => {
          clearTimeout(idle.current);
          setAutoRotate(false);
        }}
        onEnd={() => {
          idle.current = setTimeout(() => setAutoRotate(true), 4000);
        }}
      />
    </Canvas>
  );
}
