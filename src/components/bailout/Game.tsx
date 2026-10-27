import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  analyze,
  band,
  rate,
  redundancy,
  MEMBERS,
  NODES,
  BAY_IN,
  BAYS,
  STORIES,
  STORY_IN,
  RATING_ORDER,
  STEEL_PRICE_PER_TON,
  COST_OF_FAILURE,
  COLUMN,
  BEAM,
  BRACE,
  sectionShort,
  loadFlow,
  rerouted,
  type Band,
  type Rating,
} from "@/lib/frame";

import { Button } from "@/components/ui/button";
import { terminalKeyAction } from "@/lib/terminal";
import { LoadPath2D, type Reroute } from "./LoadPath2D";

const S = 0.5; // px per inch
const PAD = 40;
const W = BAYS * BAY_IN * S + PAD * 2;
const H = STORIES * STORY_IN * S + PAD * 2;
const px = (x: number) => PAD + x * S;
const py = (y: number) => PAD + (STORIES * STORY_IN - y) * S;
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const bandColor = (b: Band) => `var(--rating-${b})`;

const BAND_LABEL: Record<Band, string> = {
  aaa: "AAA",
  a: "AA/A",
  bbb: "BBB",
  junk: "BB/B junk",
  d: "D default",
};

const QUOTES = {
  start: ["Every member AAA-adjacent. Buy with confidence.", "Our models show no risk. Our models are great."],
  hold: ["Still AAA. Trust us.", "Rating affirmed. Fees collected.", "Nothing to see here. Keep pulling.", "Fundamentally sound. Probably."],
  downgrade: [
    "Minor downgrade. Totally contained.",
    "It's not junk, it's 'high yield'.",
    "Load path? We rate the paperwork, not the steel.",
    "Revised outlook: negative. Still buy.",
  ],
  junk: ["Junk, but the coupon is great.", "That beam is now a subprime tranche."],
  crash: ["We could not have foreseen this. (We were paid not to.)", "Rating withdrawn. Effective immediately."],
};
const pick = (arr: string[], n: number) => arr[n % arr.length];

const Frame3D = lazy(() => import("./Frame3D"));

type Entry = { bet: number; actual: number; odds: number; won: boolean; payout: number };

export function Game() {
  const [removed, setRemoved] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ ids: string[]; key: number }>({ ids: [], key: 0 });
  const [quote, setQuote] = useState(QUOTES.start[0]);
  const [bet, setBet] = useState<number | null>(null);
  const [betInput, setBetInput] = useState("3");
  const [stake] = useState(100);
  const [board, setBoard] = useState<Entry[]>([]);
  const [lockedOdds, setLockedOdds] = useState<number | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; w: number } | null>(null);

  const [clock, setClock] = useState("--:--:--");
  const [news, setNews] = useState<{ time: string; text: string; loss: boolean; pull?: number }[]>([]);
  const [showFlow, setShowFlow] = useState(true);
  const [showDiagrams, setShowDiagrams] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [reroute, setReroute] = useState<Reroute | null>(null);
  useEffect(() => {
    if (!reroute) return;
    const t = setTimeout(() => setReroute(null), 1500);
    return () => clearTimeout(t);
  }, [reroute]);
  const [history, setHistory] = useState<number[]>([]);
  const [quoteMoves, setQuoteMoves] = useState<Record<string, number>>({});
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const analysis = useMemo(() => analyze(removed), [removed]);
  const lastGood = useMemo(() => analyze(removed.slice(0, analysis.collapsed ? -1 : undefined)), [removed, analysis.collapsed]);
  const red = useMemo(() => (analysis.collapsed ? 0 : redundancy(removed)), [removed, analysis.collapsed]);
  const crashed = analysis.collapsed;

  const ratings: Record<string, Rating> = {};
  for (const m of MEMBERS) {
    if (removed.includes(m.id)) continue;
    const r = crashed ? lastGood.results[m.id] : analysis.results[m.id];
    ratings[m.id] = r ? rate(r.ratio) : "D";
  }

  const tons = removed.reduce((s, id) => s + (MEMBERS.find((m) => m.id === id)?.tons ?? 0), 0);
  const savings = tons * STEEL_PRICE_PER_TON;
  const failure = COST_OF_FAILURE.replacement + COST_OF_FAILURE.demolition + COST_OF_FAILURE.litigation;

  const remaining = MEMBERS.length - removed.length;
  const counts: Record<Band, number> = { aaa: 0, a: 0, bbb: 0, junk: 0, d: 0 };
  Object.values(ratings).forEach((r) => counts[band(r)]++);
  if (crashed) (Object.keys(counts) as Band[]).forEach((k) => (counts[k] = k === "d" ? remaining : 0));
  const worst: Rating = crashed
    ? "D"
    : Object.values(ratings).reduce<Rating>((w, r) => (RATING_ORDER.indexOf(r) > RATING_ORDER.indexOf(w) ? r : w), "AAA");

  // Odds for collapse on exactly pull k, if pulls are random with p = 1 - redundancy
  const oddsFor = (k: number) => {
    const p = Math.min(Math.max(1 - red, 0.02), 0.98);
    const prob = Math.pow(1 - p, k - 1) * p;
    return Math.min(Math.max(1 / prob - 1, 0.1), 999);
  };

  function pull(id: string) {
    if (crashed || removed.includes(id)) return;
    const next = [...removed, id];
    const before = analysis.results;
    const after = analyze(next);
    const moves: Record<string, number> = {};
    for (const member of MEMBERS) {
      if (next.includes(member.id)) continue;
      moves[member.id] = (before[member.id]?.ratio ?? 0) - (after.results[member.id]?.ratio ?? before[member.id]?.ratio ?? 0);
    }
    setQuoteMoves(moves);
    const cuts = Object.keys(after.results).filter((key) => RATING_ORDER.indexOf(rate(after.results[key]?.ratio ?? 0)) > RATING_ORDER.indexOf(rate(before[key]?.ratio ?? 0)));
    const worstOf = (res: Record<string, { ratio: number }>) => Object.values(res).reduce<Rating>((w, x) => (RATING_ORDER.indexOf(rate(x.ratio)) > RATING_ORDER.indexOf(w) ? rate(x.ratio) : w), "AAA");
    const afterWorst: Rating = after.collapsed ? "D" : worstOf(after.results);
    const beforeWorst: Rating = worstOf(before);
    const agency = ["MOODY MOON", "STANDARD & PANIC", "FITCH FICTION"][next.length % 3];
    const headline = after.collapsed
      ? `MARKET CRASH · PULL #${next.length} · ALL STRUCTURAL TRADING HALTED`
      : RATING_ORDER.indexOf(afterWorst) > RATING_ORDER.indexOf(beforeWorst)
        ? `${agency} CUTS BUILDING TO ${afterWorst} · PULL #${next.length} · ${id} REMOVED`
        : `${agency} AFFIRMS BUILDING AT ${afterWorst} · PULL #${next.length} · VE BOOKS ${usd((MEMBERS.find((m) => m.id === id)?.tons ?? 0) * STEEL_PRICE_PER_TON)}`;
    const gains = after.collapsed ? [] : rerouted(before, after.results);
    const pct = (g: { id: string; pct: number }) => `${g.id} (+${g.pct}%)`;
    const rerouteLine = gains.length
      ? `LOAD FROM ${id} REROUTED TO ${gains.slice(0, 2).map(pct).join(" AND ")} · ILLUSTRATIVE ESTIMATE`
      : null;
    setReroute(after.collapsed ? null : { key: next.length, pulled: id, fade: loadFlow(before, removed).filter((s) => s.id === id), gains });
    const stamp = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
    setNews((items) => [{ time: stamp, text: headline, loss: after.collapsed || cuts.length > 0, pull: next.length }, ...(rerouteLine ? [{ time: stamp, text: rerouteLine, loss: false, pull: next.length }] : []), ...items].slice(0, 40));
    if (after.collapsed) {
      setQuote(pick(QUOTES.crash, next.length));
      if (bet !== null && lockedOdds !== null) {
        const won = bet === next.length;
        setBoard((b) =>
          [...b, { bet, actual: next.length, odds: lockedOdds, won, payout: won ? stake * lockedOdds : -stake }].sort(
            (x, y) => y.payout - x.payout,
          ),
        );
      }
    } else {
      const down = Object.keys(after.results).filter(
        (k) => RATING_ORDER.indexOf(rate(after.results[k]?.ratio ?? 0)) > RATING_ORDER.indexOf(rate(before[k]?.ratio ?? 0)),
      );
      setFlash({ ids: down, key: Date.now() });
      const anyJunk = Object.values(after.results).some((r) => r.ratio >= 0.9);
      setQuote(pick(anyJunk ? QUOTES.junk : down.length ? QUOTES.downgrade : QUOTES.hold, next.length));
    }
    if (removed.length === 0 && bet !== null) setLockedOdds(oddsFor(bet));
    setRemoved(next);
  }

  function undo() {
    setRemoved((r) => r.slice(0, -1));
    setQuote("Undo approved. Moral hazard noted.");
    setNews((items) => items.filter((n) => n.pull !== removed.length));
    setReroute(null);
    setQuoteMoves({});
    setFlash({ ids: [], key: 0 });
  }
  function reset() {
    setRemoved([]);
    setNews([]);
    setReroute(null);
    setQuoteMoves({});
    setBet(null);
    setBoard([]);
    setLockedOdds(null);
    setQuote(QUOTES.start[1]);
    setFlash({ ids: [], key: 0 });
  }

  const bands: Record<string, Band> = {};
  for (const id in ratings) bands[id] = crashed ? "d" : band(ratings[id] ?? "D");
  const hoverMember = hovered ? MEMBERS.find((m) => m.id === hovered) : undefined;
  const hoverRes = hovered ? (crashed ? analysis.results[hovered] ?? lastGood.results[hovered] : analysis.results[hovered]) : undefined;
  const hoverLabel =
    hoverMember && !removed.includes(hoverMember.id)
      ? `${hoverMember.id} · ${sectionShort(hoverMember)} · ${crashed ? "D" : ratings[hoverMember.id]} · D/C ${hoverRes ? hoverRes.ratio.toFixed(2) : "—"}${showDiagrams && hoverRes?.force !== undefined ? ` · P ${Math.abs(hoverRes.force).toFixed(0)}k ${hoverRes.force >= 0 ? "COMP" : "TENS"} · M ${hoverRes.moment.toFixed(0)} k-ft · ILLUSTRATIVE` : ""}`
      : null;

  useEffect(() => {
    setHistory((points) => [...points.slice(0, removed.length), red * 100]);
  }, [removed.length, red]);

  function placeShort() {
    if (bet === null && removed.length === 0) setBet(Math.max(1, Math.min(MEMBERS.length, Number(betInput) || 1)));
    else document.getElementById("short-desk")?.focus();
  }
  function toggleView() { setView((current) => current === "2d" ? "3d" : "2d"); setHovered(null); }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = terminalKeyAction(event.key);
      if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (action === "undo") undo();
      if (action === "reset") reset();
      if (action === "view") toggleView();
      if (action === "short") placeShort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const previousWorst = removed.length ? Object.values(analyze(removed.slice(0, -1)).results).reduce<Rating>((w, result) => RATING_ORDER.indexOf(rate(result.ratio)) > RATING_ORDER.indexOf(w) ? rate(result.ratio) : w, "AAA") : "AAA";
  const ratingDirection = RATING_ORDER.indexOf(worst) > RATING_ORDER.indexOf(previousWorst) ? "▼" : RATING_ORDER.indexOf(worst) < RATING_ORDER.indexOf(previousWorst) ? "▲" : "↔";
  const tickerItems = MEMBERS.filter((m) => ratings[m.id]).map((m) => {
    const move = quoteMoves[m.id] ?? 0;
    return <span key={m.id} className="quote-item"><span className="text-label">{m.id}</span> <span className={band(ratings[m.id] ?? "D")}>{ratings[m.id]}</span> <span className={move < 0 ? "text-loss" : "text-gain"}>{move < 0 ? "▼" : "▲"}{move < 0 ? "-" : ""}{Math.abs(move).toFixed(2)}</span></span>;
  });

  return (
    <div className={`terminal ${crashed ? "terminal-crashed" : ""}`}>
      <header className="terminal-command"><div className="flex flex-wrap items-center gap-x-5"><h1>BAILOUT TERMINAL</h1><span>BLDG &lt;GO&gt; <span className="text-foreground">6STY-3BAY</span> W14/W18 <span className="text-muted-foreground">ILLUSTRATIVE</span></span></div><time className="text-foreground" aria-label="Live clock">{clock}</time></header>
      <div className="quote-tape"><div className={`ticker-track flex gap-6 whitespace-nowrap ${crashed ? "ticker-frozen" : ""}`}>{tickerItems}{tickerItems}</div></div>
      {crashed && <div className="halt-bar">*** TRADING HALTED *** BUILDING RATING: D *** MARKET CRASH · PULL #{removed.length} ***</div>}
      <main className="terminal-main">
        <section className="structure-section">
          <div className="terminal-heading"><h2>1) STRUCTURE &lt;GO&gt;{showFlow || showDiagrams ? <span className="text-foreground"> · LOAD PATH &lt;GO&gt;</span> : null}</h2><div className="flex gap-1" role="group" aria-label="View">{(["2d", "3d"] as const).map((v) => <Button key={v} variant="terminal" size="terminal" aria-pressed={view === v} onClick={() => { setView(v); setHovered(null); }} className={view === v ? "terminal-active" : ""}>{v.toUpperCase()}</Button>)}</div><div className="flex gap-1" role="group" aria-label="Load path">{([["FLOW", showFlow, setShowFlow], ["DIAGRAMS", showDiagrams, setShowDiagrams], ["EXPLAIN", showExplain, setShowExplain]] as const).map(([label, on, set]) => <Button key={label} variant="terminal" size="terminal" aria-pressed={on} onClick={() => set(!on)} className={on ? "terminal-active" : ""}>{label}</Button>)}</div><span className={crashed ? "text-loss" : "text-foreground"}>{crashed ? `Collapsed on pull #${removed.length}` : `Pulls: ${removed.length} · Next: #${removed.length + 1}`}</span></div>
          <div className="structure-viewport" onPointerMove={(e) => { const box = e.currentTarget.getBoundingClientRect(); setCursor({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width }); }} onPointerLeave={() => setCursor(null)}>
            {hoverLabel && cursor && <div className={`cursor-label ${bands[hovered ?? ""] ?? "d"}`} style={cursor.x > cursor.w / 2 ? { right: cursor.w - cursor.x + 14, top: cursor.y + 14 } : { left: cursor.x + 14, top: cursor.y + 14 }}>{hoverLabel}</div>}
            <div className="member-readout">{hoverLabel ? <span className={bands[hovered ?? ""] ?? "d"}>{hoverLabel}</span> : <span className="text-muted-foreground">{COLUMN.name} / {BEAM.name} / {BRACE.name} · MOMENT + END-BAY BRACING</span>}</div>
            {view === "3d" ? <ClientOnly fallback={<div className="loading-view">LOADING 3D…</div>}><Suspense fallback={<div className="loading-view">LOADING 3D…</div>}><Frame3D flow={showFlow ? loadFlow(crashed ? lastGood.results : analysis.results, removed) : null} removed={removed} bands={bands} crashed={crashed} failed={analysis.failed} hovered={hovered} onHover={setHovered} onPull={pull} /></Suspense></ClientOnly> : (
            <svg viewBox={`0 0 ${W} ${H + 20}`} className={`mx-auto block h-full w-full ${crashed ? "tower-shake pointer-events-none" : ""}`} role="img" aria-label="Steel frame tower">
              <line x1={10} x2={W - 10} y1={py(0) + 8} y2={py(0) + 8} stroke="var(--border)" strokeWidth={4} />
              {MEMBERS.map((m, idx) => {
                const a = NODES[m.i];
                const b = NODES[m.j];
                if (!a || !b) return null;
                const isGone = removed.includes(m.id);
                const isLast = removed[removed.length - 1] === m.id;
                const r = ratings[m.id] ?? "D";
                const color = isGone ? "var(--ghost)" : bandColor(crashed ? "d" : band(r));
                const mx = (px(a.x) + px(b.x)) / 2;
                const my = (py(a.y) + py(b.y)) / 2;
                const fallStyle = crashed
                  ? ({
                      "--dx": `${((idx * 37) % 120) - 60}px`,
                      "--rot": `${((idx * 53) % 180) - 90}deg`,
                      "--delay": `${(STORIES - a.level) * 0.05 + (idx % 4) * 0.03}s`,
                    } as React.CSSProperties)
                  : undefined;
                return (
                  <g
                    key={`${m.id}-${flash.ids.includes(m.id) ? flash.key : 0}`}
                    className={`${crashed && !isGone ? "member-fall" : ""} ${flash.ids.includes(m.id) ? "member-downgrade" : ""} ${isGone || crashed ? "" : "cursor-pointer"}`}
                    style={fallStyle}
                    onClick={() => !isGone && !crashed && pull(m.id)}
                    onMouseEnter={() => !isGone && setHovered(m.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>{isGone ? `${m.id} pulled` : `${m.id} ${m.section.name} — ${r}`}</title>
                    <line
                      x1={px(a.x)}
                      y1={py(a.y)}
                      x2={px(b.x)}
                      y2={py(b.y)}
                      stroke={color}
                      strokeWidth={isGone ? 2 : m.kind === "column" ? 12 : m.kind === "brace" ? 6 : 10}
                      strokeDasharray={isGone ? "6 6" : undefined}
                      strokeOpacity={isGone ? (isLast && crashed ? 1 : 0.7) : 0.9}
                    />
                    {!isGone && hovered === m.id && (
                      <line x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} stroke="var(--foreground)" strokeWidth={2} />
                    )}
                    {!isGone && (
                      <line x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} stroke="transparent" strokeWidth={22} />
                    )}
                    {!isGone && (
                      <g pointerEvents="none">
                        <rect x={mx - 15} y={my - 7} width={30} height={14} rx={0} fill="var(--background)" stroke={color} />
                        <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
                          {crashed ? "D" : r}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              <LoadPath2D results={crashed ? lastGood.results : analysis.results} removed={removed} flow={showFlow} diagrams={showDiagrams} crashed={crashed} reroute={reroute} px={px} py={py} />
            </svg>
            )}
            {crashed && showFlow && <div className="crash-caption">NO LOAD PATH TO GROUND. THE MARKET HAS NO BUYER.</div>}
            {showExplain && <div className="explain-box" role="note"><p>Gravity pushes on each floor. Beams carry it sideways to columns.</p><p>Columns carry it down to the ground.</p><p>Pull a member and the load has to find another way, until it can't.</p></div>}
            <div className="structure-stamp"><span className="text-label">STEEL FRAME / 01</span><span>{crashed ? "PULLS FROZEN" : "LIVE"}</span></div>
          </div>
          <div className="function-strip">
            <Button variant="terminal" size="terminal" onClick={undo} disabled={!removed.length}>F1 UNDO</Button>
            <Button variant="terminal" size="terminal" onClick={reset}>F2 RESET</Button>
            <Button variant="terminal" size="terminal" onClick={toggleView}>F3 2D/3D</Button>
            <Button variant="terminal" size="terminal" onClick={placeShort}>F4 SHORT</Button>
            <div className="terminal-legend">{(Object.keys(BAND_LABEL) as Band[]).map((b) => <span key={b} className={b}><i />{BAND_LABEL[b].toUpperCase()}</span>)}</div>
          </div>
          <div className="frame-specs">30 FT BAYS · 13 FT STORIES · 80D / 50L / 25W PSF · 1.2D+1.0L+1.0W · {usd(STEEL_PRICE_PER_TON)}/TON<br />3D: 3 REPEATED GRIDLINES, VISUAL ONLY · ILLUSTRATIVE ESTIMATES, NOT FOR DESIGN</div>
        </section>
        <aside className="terminal-sidebar">
          <section className="desk-panel pnl-panel"><h2 className="terminal-heading">2) VE P&amp;L</h2><div className="desk-body"><div className={`big-value ${crashed ? "text-loss" : "text-gain"}`}>{usd(savings)}</div><div className="data-row"><span>REALIZED SAVINGS</span><span className="text-foreground">{tons.toFixed(2)} TONS PULLED</span></div>
          {crashed && <div className="failure-summary"><span>FAILURE COST</span><div className="big-value text-loss">{usd(failure)}</div><div className="data-row"><span>VS SAVINGS</span><strong className="text-loss">{usd(savings)}</strong></div><div className="data-row"><span>REPLACEMENT</span><span>{usd(COST_OF_FAILURE.replacement)}</span></div><div className="data-row"><span>DEMOLITION &amp; CLEANUP</span><span>{usd(COST_OF_FAILURE.demolition)}</span></div><div className="data-row"><span>LITIGATION</span><span>{usd(COST_OF_FAILURE.litigation)}</span></div><div className="text-loss">{Math.round(failure / Math.max(savings, 1)).toLocaleString()}× SAVINGS</div></div>}
          </div></section>
          <section className="desk-panel"><h2 className="terminal-heading">3) RATING</h2><div className="desk-body rating-body"><div className={`rating-value ${band(worst)}`}>{worst} <span className={ratingDirection === "▼" ? "text-loss" : "text-gain"}>{ratingDirection}</span></div><p className="agency-quote">“{quote}”</p></div></section>
          <section className="desk-panel"><h2 className="terminal-heading">4) TRANCHE MIX</h2><div className="desk-body"><div className="tranche-stack">{(Object.keys(BAND_LABEL) as Band[]).map((b) => <div key={b} className={b} style={{ flexGrow: counts[b] }} title={`${BAND_LABEL[b]} ${remaining ? Math.round(counts[b] / remaining * 100) : 0}%`} />)}</div><div className="tranche-labels">{(Object.keys(BAND_LABEL) as Band[]).map((b) => <div key={b}><span className={b}>{b === "a" ? "AA-A" : b.toUpperCase()}</span><span className="text-foreground">{remaining ? (counts[b] / remaining * 100).toFixed(0) : 0}%</span></div>)}</div><div className="data-row"><span>MEMBERS OPEN</span><span className="text-foreground">{remaining}/{MEMBERS.length}</span></div></div></section>
          <section className="desk-panel"><h2 className="terminal-heading">5) REDUNDANCY</h2><div className="desk-body redundancy-body"><div className="text-foreground redundancy-value">{Math.round(red * 100)}<small>/100</small></div><svg viewBox="0 0 220 42" role="img" aria-label="Redundancy score per pull"><line x1="0" y1="40" x2="220" y2="40" stroke="var(--border)"/><polyline fill="none" stroke="var(--label)" strokeWidth="2" points={history.map((score, i) => `${i * 220 / Math.max(history.length - 1, 1)},${40 - score * .36}`).join(" ")}/>{history.map((score, i) => <circle key={i} cx={i * 220 / Math.max(history.length - 1, 1)} cy={40 - score * .36} r="2" fill="var(--label)"/>)}</svg></div></section>
          <section className="desk-panel short-panel" id="short-desk" tabIndex={-1}><h2 className="terminal-heading">6) SHORT DESK</h2><div className="desk-body">
            {bet === null && removed.length === 0 ? <><div className="data-row"><label htmlFor="bet">COLLAPSE ON PULL</label><input id="bet" type="number" min={1} max={MEMBERS.length} value={betInput} onChange={(e) => setBetInput(e.target.value)} /></div><div className="data-row"><span>ODDS</span><span className="text-foreground">{oddsFor(Math.max(1, Number(betInput) || 1)).toFixed(1)}:1</span></div><Button variant="terminal" size="terminal" className="short-button" onClick={placeShort}>SHORT THE BUILDING · $100</Button></> : bet !== null ? <p>SHORT ON <strong className="text-foreground">PULL #{bet}</strong> AT {(lockedOdds ?? oddsFor(bet)).toFixed(1)}:1.{crashed && (bet === removed.length ? <span className="text-gain"> YOU CALLED IT. PAID OUT.</span> : <span className="text-loss"> MISSED — COLLAPSED ON #{removed.length}.</span>)}</p> : <p className="text-muted-foreground">BOOK CLOSED AFTER FIRST PULL. RESET TO PLACE A SHORT.</p>}
            <p className="short-disclaimer">PLAY MONEY ONLY · RANDOM-PULL ODDS · ILLUSTRATIVE</p>
            {board.length > 0 && <div className="short-results"><table><thead><tr><th>BET</th><th>ACTUAL</th><th>ODDS</th><th>P&amp;L</th></tr></thead><tbody>{board.slice(0, 8).map((e, i) => <tr key={i}><td>#{e.bet}</td><td>#{e.actual}</td><td>{e.odds.toFixed(1)}:1</td><td className={e.won ? "text-gain" : "text-loss"}>{e.won ? "+" : ""}{usd(e.payout)}</td></tr>)}</tbody></table></div>}
          </div></section>
        </aside>
      </main>
      <section className="news-wire"><h2>NEWS &lt;GO&gt; <span className="text-muted-foreground">/ STRUCTURAL CREDIT WIRE</span></h2><div className="news-lines">{news.length ? news.map((item, i) => <div key={i}><time className="text-label">{item.time}</time><span className={item.loss ? "text-loss" : "text-foreground"}>*{item.text}</span></div>) : <><div><span className="text-label">--:--</span><span>BAILOUT TERMINAL OPENS · ALL MEMBERS RATED · STRUCTURAL MARKET LIVE</span></div><div><span className="text-label">--:--</span><span className="text-muted-foreground">STANDARD &amp; PANIC: “OUR MODELS SHOW NO RISK. OUR MODELS ARE GREAT.”</span></div></>}</div></section>
      <footer className="terminal-footer"><span>IN BUILDINGS, THERE'S NO BAILOUT.</span><span className="text-muted-foreground">{crashed ? "MARKET CLOSED" : "MARKET OPEN"} · NO REAL MONEY</span></footer>
    </div>
  );
}
