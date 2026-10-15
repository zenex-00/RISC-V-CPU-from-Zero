// Build mode: place this lesson's new blocks from a tray onto their slots,
// then connect the missing wires port to port.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { compById, COMP_NAME, portName, type Comp } from '../../diagram/layout';
import { allKeys } from '../../diagram/visibility';
import { buildPlan } from './buildplan';
import type { DatapathView } from '../../diagram/render';
import { Diagram } from '../components/Diagram';
import { recordExercise } from '../store';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>, parent: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
};

const compOfPort = (p: string) => p.split('.')[0];
const portLabel = (p: string) => portName(p);

export function BuildEx({ level, exId }: { level: number; exId: string }) {
  const keys = useMemo(() => allKeys(level), [level]);
  const plan = useMemo(() => buildPlan(level), [level]);
  const order = useMemo(() => [...plan.newComps].sort(() => Math.random() - 0.5), [plan]);
  const [placed, setPlaced] = useState<Set<string>>(new Set());
  const [conn, setConn] = useState<Set<string>>(new Set());
  const [chip, setChip] = useState<string | null>(null);
  const [port, setPort] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const view = useRef<DatapathView | null>(null);
  const allPlaced = plan.newComps.every((c) => placed.has(c.id));
  const done = allPlaced && plan.need.every((w) => conn.has(w.id));

  // Parts still hidden: unplaced blocks, their stubs and constants, unconnected wires.
  const hidden = useMemo(() => {
    const h: string[] = [];
    for (const c of plan.newComps) if (!placed.has(c.id)) h.push(c.id);
    for (const c of plan.consts) {
      const partner = plan.wires.find((w) => w.src === `${c.id}.y`)?.dst?.split('.')[0];
      if (partner && !placed.has(partner) && compById[partner].from.l === level) h.push(c.id);
    }
    for (const w of plan.need) if (!conn.has(w.id)) h.push(w.id);
    for (const w of plan.auto) {
      const d = w.dst ? compOfPort(w.dst) : null;
      if (w.kind === 'ctrl' || w.kind === 'clk' || (w.src && compById[compOfPort(w.src)]?.shape === 'const')) {
        if (d && compById[d].from.l === level && !placed.has(d)) h.push(w.id);
      } else if (!w.dst) {
        // Bus segments appear once any wire from the same source is connected.
        if (!plan.need.some((x) => x.src === w.src && conn.has(x.id)) && !(w.src && placed.has(compOfPort(w.src)) && w.id === 'w_instr')) h.push(w.id);
      }
    }
    return h;
  }, [placed, conn, plan, level]);

  const tryPlace = (id: string, slot: string) => {
    if (placed.has(slot)) return;
    if (id === slot) {
      const np = new Set(placed);
      np.add(id);
      setPlaced(np);
      setChip(null);
      setMsg({ ok: true, text: `${COMP_NAME[id]} placed.` });
    } else {
      setMistakes((m) => m + 1);
      const s = compById[slot];
      const ins = Object.keys(s.ports).length;
      setMsg({ ok: false, text: `That slot needs a different block: it has ${ins} connection points and sits ${slotHint(s)}. ${COMP_NAME[id]} belongs elsewhere.` });
    }
  };

  const clickPort = (p: string) => {
    if (!port) return setPort(p);
    if (port === p) return setPort(null);
    const a = port;
    setPort(null);
    const w = plan.need.find((x) => !conn.has(x.id) && ((x.src === a && x.dst === p) || (x.src === p && x.dst === a)));
    if (w) {
      const n = new Set(conn);
      n.add(w.id);
      setConn(n);
      setMsg({ ok: true, text: `Connected: ${w.desc}${w.bits ? ` (bits ${w.bits})` : ''}.` });
      return;
    }
    if (plan.need.some((x) => conn.has(x.id) && ((x.src === a && x.dst === p) || (x.src === p && x.dst === a))))
      return setMsg({ ok: true, text: 'Those two are already connected.' });
    setMistakes((m) => m + 1);
    const into = plan.wires.find((x) => x.dst === p || x.dst === a);
    const dstPort = into ? into.dst! : p;
    setMsg({ ok: false, text: into ? `${portLabel(a)} does not connect to ${portLabel(p)}. ${portLabel(dstPort)} receives: ${into.desc}.` : `${portLabel(a)} and ${portLabel(p)} are not connected in this design.` });
  };

  useEffect(() => {
    if (done) recordExercise(exId, Math.max(0.3, 1 - mistakes * 0.06));
  }, [done]);

  // Overlay: slots and ports are rebuilt only when blocks are placed, so keyboard
  // focus survives selecting a port. Selection and completion only toggle classes.
  const latest = useRef({ chip, tryPlace, clickPort });
  latest.current = { chip, tryPlace, clickPort };
  const portEls = useRef(new Map<string, SVGElement>());
  const slotEls = useRef(new Map<string, SVGElement>());
  const ghost = useRef<SVGGElement | null>(null);
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const g = v.overlay();
    g.textContent = '';
    portEls.current.clear();
    slotEls.current.clear();
    plan.newComps.forEach((c) => {
      if (placed.has(c.id)) return;
      const n = order.indexOf(c) + 1;
      const r = svgEl('rect', { x: c.x - 4, y: c.y - 4, width: c.w + 8, height: c.h + 8, rx: 4, class: 'slot', tabindex: 0, role: 'button', 'aria-label': `Empty slot ${String.fromCharCode(64 + n)}` }, g);
      const go = () => latest.current.chip && latest.current.tryPlace(latest.current.chip, c.id);
      r.addEventListener('click', go);
      r.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && go());
      slotEls.current.set(c.id, r);
      const t = svgEl('text', { x: c.x + c.w / 2, y: c.y + c.h / 2 + 4, class: 'slot-n' }, g);
      t.textContent = 'slot ' + String.fromCharCode(64 + n);
    });
    if (allPlaced) {
      const ports = new Set<string>();
      for (const w of plan.need) {
        ports.add(w.src!);
        ports.add(w.dst!);
      }
      for (const p of ports) {
        const [cid, pn] = p.split('.');
        const pt = compById[cid].ports[pn];
        const circ = svgEl('circle', { cx: pt.x, cy: pt.y, r: 6, class: 'port', tabindex: 0, role: 'button', 'aria-label': `Port ${portLabel(p)}` }, g);
        circ.addEventListener('click', (e) => { e.stopPropagation(); latest.current.clickPort(p); });
        circ.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && latest.current.clickPort(p));
        portEls.current.set(p, circ);
      }
    }
    ghost.current = svgEl('g', { class: 'ghost-layer' }, g) as SVGGElement;
  }, [placed, allPlaced, viewTick]);

  useEffect(() => {
    for (const [p, el] of portEls.current) {
      const doneHere = plan.need.filter((w) => w.src === p || w.dst === p).every((w) => conn.has(w.id));
      el.classList.toggle('sel', port === p);
      el.classList.toggle('done', port !== p && doneHere);
    }
  }, [port, conn, placed, allPlaced, viewTick]);

  useEffect(() => {
    for (const [id, el] of slotEls.current) el.classList.toggle('hot', !!drag && near(drag, compById[id]));
    const gl = ghost.current;
    if (!gl) return;
    gl.textContent = '';
    if (drag) {
      const c = compById[drag.id];
      svgEl('rect', { x: drag.x - c.w / 2, y: drag.y - c.h / 2, width: c.w, height: c.h, rx: 3, class: 'ghost' }, gl);
      const t = svgEl('text', { x: drag.x, y: drag.y + 4, class: 'ghost-t' }, gl);
      t.textContent = COMP_NAME[c.id];
    }
  }, [drag]);

  const startDrag = (id: string, e: PointerEvent) => {
    e.preventDefault();
    setChip(id);
    const move = (ev: PointerEvent) => {
      const v = view.current;
      if (!v) return;
      const [x, y] = v.toDiagram(ev.clientX, ev.clientY);
      setDrag({ id, x, y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const v = view.current;
      setDrag(null);
      if (!v) return;
      const [x, y] = v.toDiagram(ev.clientX, ev.clientY);
      const slot = plan.newComps.find((c) => !placed.has(c.id) && near({ x, y }, c));
      if (slot) tryPlace(id, slot.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const reset = () => {
    setPlaced(new Set());
    setConn(new Set());
    setPort(null);
    setChip(null);
    setMistakes(0);
    setMsg(null);
  };

  return (
    <div class="stack">
      <p class="small muted">
        {!allPlaced
          ? 'Drag each new block from the tray onto its dashed slot (or select a block, then click a slot). Blocks from earlier lessons are already in place.'
          : done
            ? 'Done.'
            : `Now connect the ${plan.need.length - conn.size} missing wire${plan.need.length - conn.size === 1 ? '' : 's'}: click one port, then the port it connects to.`}
      </p>
      <div class="tray" aria-label="Block tray">
        {order.filter((c) => !placed.has(c.id)).map((c) => (
          <span
            key={c.id}
            class="chip"
            role="button"
            tabIndex={0}
            aria-pressed={chip === c.id}
            style={chip === c.id ? { outline: '2px solid var(--ink)' } : undefined}
            onPointerDown={(e) => startDrag(c.id, e as unknown as PointerEvent)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setChip(c.id))}
            onClick={() => setChip(c.id)}
          >
            {trayName(c)}
          </span>
        ))}
        {allPlaced && <span class="small muted">All blocks placed.</span>}
      </div>
      <Diagram
        level={level}
        revealed={keys}
        trace={null}
        hide={hidden}
        camera="fit"
        legend={false}
        onView={(v) => { if (view.current !== v) { view.current = v; setViewTick((x) => x + 1); } }}
        label="Build the circuit"
      />
      <div class="toolbar">
        <button class="btn" onClick={reset}>Start over</button>
        <span class="small muted">Mistakes: {mistakes}</span>
      </div>
      {msg && <div class={`feedback ${msg.ok ? 'good' : 'bad'}`} role="status">{msg.text}</div>}
      {done && <div class="feedback good" role="status"><strong>Circuit complete.</strong> <span class="fb-body">Every new block is in place and every wire connects the right ports.</span></div>}
    </div>
  );
}

function trayName(c: Comp): string {
  return COMP_NAME[c.id] ?? c.desc.split(':')[0];
}

function slotHint(c: Comp): string {
  if (c.x < 200) return 'at the far left, next to the PC';
  if (c.y > 560) return 'in the lower part of the circuit';
  if (c.x > 1150) return 'at the far right';
  if (c.x > 850) return 'right of the ALU';
  if (c.x > 640) return 'just before the ALU';
  return 'in the middle of the circuit';
}

function near(p: { x: number; y: number }, c: Comp): boolean {
  return p.x > c.x - 40 && p.x < c.x + c.w + 40 && p.y > c.y - 40 && p.y < c.y + c.h + 40;
}
