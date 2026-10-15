// Draw from memory: place blocks on a blank canvas, wire their ports, then
// compare with the reference connections for a chosen instruction subset.

import { useMemo, useRef, useState } from 'preact/hooks';
import { COMPS, WIRES, COMP_NAME, compById, type Comp } from '../../diagram/layout';
import { allKeys, isVisible, LESSON_KEYS } from '../../diagram/visibility';
import { shapePath } from '../../diagram/render';
import { Diagram } from '../components/Diagram';
import { recordExercise, recordConcept } from '../store';

const SUBSETS: Record<string, { level: number; title: string }> = {
  rtype: { level: 2, title: 'R-type instructions only' },
  memory: { level: 5, title: 'R-type, I-type ALU, loads and stores' },
  branch: { level: 7, title: 'Everything up to branches (no jumps, lui or auipc)' },
  full: { level: 11, title: 'The complete RV32I datapath' },
};

interface Placed {
  id: string;
  x: number;
  y: number;
}

const blockName = (c: Comp) => COMP_NAME[c.id] ?? c.id;
const portName = (c: Comp, p: string) => c.ports[p].label ?? c.muxIn?.[p] ?? p;

export function DrawEx({ subset, exId }: { subset: string; exId: string }) {
  const [sub, setSub] = useState(subset in SUBSETS ? subset : 'memory');
  const level = SUBSETS[sub].level;
  const model = useMemo(() => {
    const keys = level >= 11 ? new Set<string>() : allKeys(level);
    const comps = COMPS.filter((c) => isVisible(c, level, keys) && c.shape !== 'const' && c.id !== 'clr0');
    const ids = new Set(comps.map((c) => c.id));
    const edges = WIRES.filter((w) => isVisible(w, level, keys) && (w.kind === 'data' || w.kind === 'field') && w.src && w.dst)
      .map((w) => {
        let src = w.src!;
        // The "clear bit 0" box is drawn as part of the target mux input here.
        if (w.id === 'w_jt2') src = 'alu.y';
        return { src, dst: w.dst!, desc: w.desc };
      })
      .filter((e) => ids.has(e.src.split('.')[0]) && ids.has(e.dst.split('.')[0]) && e.src !== e.dst);
    const uniq = new Map(edges.map((e) => [`${e.src}>${e.dst}`, e]));
    return { comps, edges: [...uniq.values()] };
  }, [level]);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [lines, setLines] = useState<[string, string][]>([]);
  const [placing, setPlacing] = useState<string | null>(null);
  const [selPort, setSelPort] = useState<string | null>(null);
  const [checked, setChecked] = useState<null | { ok: Set<string>; bad: Set<string>; missing: { desc: string }[]; score: number }>(null);
  const [showRef, setShowRef] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current!.getScreenCTM()!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const posOf = (id: string) => placed.find((p) => p.id === id);
  const portXY = (pp: string): [number, number] | null => {
    const [cid, pn] = pp.split('.');
    const p = posOf(cid);
    if (!p) return null;
    const c = compById[cid];
    return [p.x + (c.ports[pn].x - c.x), p.y + (c.ports[pn].y - c.y)];
  };
  const reset = () => {
    setPlaced([]);
    setLines([]);
    setChecked(null);
    setSelPort(null);
  };
  const clickCanvas = (e: MouseEvent) => {
    if (!placing) return;
    const c = compById[placing];
    const [x, y] = toSvg(e);
    setPlaced([...placed.filter((p) => p.id !== placing), { id: placing, x: Math.round(x - c.w / 2), y: Math.round(y - c.h / 2) }]);
    setPlacing(null);
    setChecked(null);
  };
  const clickPort = (pp: string) => {
    setChecked(null);
    if (!selPort) return setSelPort(pp);
    if (selPort === pp || selPort.split('.')[0] === pp.split('.')[0]) return setSelPort(null);
    const exists = lines.findIndex((l) => (l[0] === selPort && l[1] === pp) || (l[0] === pp && l[1] === selPort));
    if (exists < 0) setLines([...lines, [selPort, pp]]);
    setSelPort(null);
  };
  const check = () => {
    const key = (a: string, b: string) => [a, b].sort().join('|');
    const req = new Map(model.edges.map((e) => [key(e.src, e.dst), e]));
    const ok = new Set<string>(), bad = new Set<string>();
    for (const l of lines) (req.has(key(l[0], l[1])) ? ok : bad).add(key(l[0], l[1]));
    const missing = [...req.entries()].filter(([k]) => !ok.has(k)).map(([, e]) => e);
    const score = Math.max(0, ok.size / req.size - bad.size * 0.05);
    setChecked({ ok, bad, missing, score });
    recordExercise(exId, score);
    recordConcept(`draw:${sub}`, missing.length === 0 && bad.size === 0);
  };
  const notPlaced = model.comps.filter((c) => !posOf(c.id));

  return (
    <div class="stack">
      <div class="row">
        <label class="small">Subset{' '}
          <select value={sub} onChange={(e) => { setSub((e.target as HTMLSelectElement).value); reset(); setShowRef(false); }}>
            {Object.entries(SUBSETS).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
          </select>
        </label>
      </div>
      <p class="small muted">Pick a block, then click the canvas to place it (drag to move). Connect ports by clicking one port and then another; click a line to delete it. Layout is up to you: only the connections are checked. {model.edges.length} connections are needed.</p>
      <div class="pill-row" aria-label="Blocks to place">
        {notPlaced.map((c) => (
          <button key={c.id} class={`btn small ${placing === c.id ? 'on' : ''}`} onClick={() => setPlacing(placing === c.id ? null : c.id)}>
            {blockName(c)}
          </button>
        ))}
        {!notPlaced.length && <span class="small muted">All blocks placed.</span>}
      </div>
      <div class="draw-canvas">
        <svg
          ref={svgRef}
          viewBox="0 0 1440 860"
          role="application"
          aria-label="Drawing canvas"
          onClick={(e) => clickCanvas(e as unknown as MouseEvent)}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const [x, y] = toSvg(e);
            setPlaced(placed.map((p) => (p.id === d.id ? { ...p, x: Math.round(x - d.dx), y: Math.round(y - d.dy) } : p)));
          }}
          onPointerUp={() => (dragRef.current = null)}
        >
          {placing && <text x={720} y={30} text-anchor="middle" class="pt-t" style={{ fontSize: '14px' }}>Click to place: {blockName(compById[placing])}</text>}
          {lines.map((l, i) => {
            const a = portXY(l[0]), b = portXY(l[1]);
            if (!a || !b) return null;
            const k = [l[0], l[1]].sort().join('|');
            const cls = checked ? (checked.ok.has(k) ? ' ok' : ' bad') : '';
            const mx = (a[0] + b[0]) / 2;
            const d = `M${a[0]},${a[1]} H${mx} V${b[1]} H${b[0]}`;
            return (
              <g key={i} onClick={(e) => { e.stopPropagation(); setLines(lines.filter((_, j) => j !== i)); setChecked(null); }}>
                <path d={d} class="cn-hit" />
                <path d={d} class={`cn${cls}`} />
              </g>
            );
          })}
          {placed.map((p) => {
            const c = compById[p.id];
            const moved = { ...c, x: p.x, y: p.y };
            return (
              <g key={p.id}>
                <path
                  d={shapePath(moved)}
                  class="blk"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const [x, y] = toSvg(e);
                    dragRef.current = { id: p.id, dx: x - p.x, dy: y - p.y };
                    (e.target as Element).setPointerCapture?.((e as PointerEvent).pointerId);
                  }}
                />
                <text x={p.x + c.w / 2} y={p.y + c.h / 2 + 4} class="blk-t">{c.shape === 'mux' ? 'mux' : c.label || ''}</text>
                {Object.keys(c.ports).filter((pn) => model.edges.some((e) => e.src === `${c.id}.${pn}` || e.dst === `${c.id}.${pn}`)).map((pn) => {
                  const xy = portXY(`${c.id}.${pn}`)!;
                  const id = `${c.id}.${pn}`;
                  return (
                    <g key={pn}>
                      <circle cx={xy[0]} cy={xy[1]} r={6} class={`pt${selPort === id ? ' sel' : ''}`} tabIndex={0} role="button" aria-label={`${blockName(c)} port ${portName(c, pn)}`}
                        onClick={(e) => { e.stopPropagation(); clickPort(id); }}
                        onKeyDown={(e) => e.key === 'Enter' && clickPort(id)} />
                      <text x={xy[0] + 8} y={xy[1] - 6} class="pt-t">{portName(c, pn)}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div class="toolbar">
        <button class="btn primary" onClick={check} disabled={!lines.length}>Compare with the reference</button>
        <button class="btn" onClick={reset}>Clear</button>
        <button class="btn" onClick={() => setShowRef(!showRef)}>{showRef ? 'Hide' : 'Show'} the reference diagram</button>
      </div>
      {checked && (
        <div class={`feedback ${checked.missing.length || checked.bad.size ? 'warn' : 'good'}`} role="status">
          <strong>{checked.ok.size} of {model.edges.length} connections correct{checked.bad.size ? `, ${checked.bad.size} wrong (dashed red)` : ''}.</strong>
          {checked.missing.length > 0 && (
            <div class="fb-body">
              Missing:
              <ul>{checked.missing.map((m, i) => <li key={i}>{m.desc}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {showRef && <Diagram level={Math.min(level, 11)} revealed={new Set(LESSON_KEYS[level] ?? [])} trace={null} camera="fit" legend={false} label="Reference datapath" />}
    </div>
  );
}
