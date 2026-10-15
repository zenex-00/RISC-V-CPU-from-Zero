// SVG renderer for the datapath. The DOM is built once per lesson level.
// Steps only toggle classes and update text on the parts that changed, and
// the camera moves with a CSS transform, so stepping stays cheap.

import type { Trace } from '../sim/datapath';
import { COMPS, WIRES, VIEW, type Comp, type Wire } from './layout';
import { inLesson, isVisible, isNew } from './visibility';
import { FONT, textWidth } from './geom';
import { fmtValue, netText, sigValue } from './signals';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

export function shapePath(c: Comp): string {
  const { x, y, w, h } = c;
  switch (c.shape) {
    case 'mux':
      return `M${x},${y} L${x + w},${y + 12} L${x + w},${y + h - 12} L${x},${y + h} Z`;
    case 'alu':
      return `M${x},${y} L${x + w},${y + 30} L${x + w},${y + h - 30} L${x},${y + h} L${x},${y + h * 0.588} L${x + 15},${y + h / 2} L${x},${y + h * 0.412} Z`;
    case 'adder':
      return `M${x},${y} L${x + w},${y + h * 0.25} L${x + w},${y + h * 0.75} L${x},${y + h} L${x},${y + h * 0.6} L${x + w * 0.2},${y + h / 2} L${x},${y + h * 0.4} Z`;
    case 'and':
      return `M${x},${y} H${x + w - h / 2} A${h / 2},${h / 2} 0 0 1 ${x + w - h / 2},${y + h} H${x} Z`;
    case 'or':
      return `M${x},${y} Q${x + w * 0.55},${y} ${x + w},${y + h / 2} Q${x + w * 0.55},${y + h} ${x},${y + h} Q${x + w * 0.3},${y + h / 2} ${x},${y} Z`;
    default:
      return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  }
}

export interface FlowState {
  trace: Trace | null;
  /** Parts whose signal is arriving in this step. */
  active: Set<string>;
  /** Parts already used earlier in this cycle. */
  used: Set<string>;
  /** Extra emphasis (e.g. the block a step talks about). */
  focus?: Set<string>;
  /** Fade parts that carry nothing useful for this instruction. */
  fadeIdle?: boolean;
  /** Show the clock-edge state (state elements pulse). */
  edge?: boolean;
}

interface WireEls {
  w: Wire;
  g: SVGGElement;
  tag?: { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; last: string };
  net?: { text: SVGTextElement; last: string };
  dots: SVGCircleElement[];
}

interface CompEls {
  c: Comp;
  g: SVGGElement;
  muxLabels: { port: string; t: SVGTextElement }[];
}

export type ClickHandler = (id: string, kind: 'comp' | 'wire') => void;

export interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class DatapathView {
  readonly svg: SVGSVGElement;
  private cam: SVGGElement;
  private level = 0;
  private wires = new Map<string, WireEls>();
  private comps = new Map<string, CompEls>();
  private revealed = new Set<string>();
  private lastClass = new Map<Element, string>();
  private onClick: ClickHandler | null = null;
  private interactive = false;
  private camera: Camera = { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
  /** Height of the SVG viewBox; width is always VIEW.w. Set per lesson from the circuit's shape. */
  private viewH = VIEW.h;

  constructor(host: HTMLElement, label = 'Datapath diagram') {
    this.svg = el('svg', { viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, class: 'dp', role: 'group', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
    this.cam = el('g', { class: 'cam' }, this.svg);
    host.appendChild(this.svg);
    this.svg.addEventListener('click', (e) => {
      const t = (e.target as Element).closest('[data-id]');
      if (!t || !this.onClick) return;
      this.onClick(t.getAttribute('data-id')!, t.getAttribute('data-kind') as 'comp' | 'wire');
    });
    this.svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = (e.target as Element).closest('[data-id]');
      if (!t || !this.onClick) return;
      e.preventDefault();
      this.onClick(t.getAttribute('data-id')!, t.getAttribute('data-kind') as 'comp' | 'wire');
    });
  }

  setClickHandler(fn: ClickHandler | null, interactive: boolean) {
    this.onClick = fn;
    if (this.interactive !== interactive) {
      this.interactive = interactive;
      this.svg.classList.toggle('interactive', interactive);
      for (const { g } of this.comps.values()) setFocusable(g, interactive);
      for (const { g } of this.wires.values()) setFocusable(g, interactive);
    }
  }

  /** Build the DOM for every part that exists in this lesson. */
  setLevel(level: number, revealed: Set<string>) {
    this.level = level;
    // The complete machine is drawn in full ink: nothing is "earlier" any more.
    this.svg.classList.toggle('complete', level >= 11);
    this.cam.textContent = '';
    this.wires.clear();
    this.comps.clear();
    this.lastClass.clear();
    const wireLayer = el('g', { class: 'wires' }, this.cam);
    const compLayer = el('g', { class: 'comps' }, this.cam);
    const labelLayer = el('g', { class: 'labels' }, this.cam);
    for (const c of COMPS) if (inLesson(c, level)) this.buildComp(c, compLayer);
    for (const w of WIRES) if (inLesson(w, level)) this.buildWire(w, wireLayer, labelLayer);
    this.setRevealed(revealed);
    if (this.interactive) {
      for (const { g } of this.comps.values()) setFocusable(g, true);
      for (const { g } of this.wires.values()) setFocusable(g, true);
    }
  }

  private buildComp(c: Comp, layer: SVGGElement) {
    const g = el('g', { class: `comp shape-${c.shape}`, 'data-id': c.id, 'data-kind': 'comp' }, layer);
    g.setAttribute('aria-label', c.desc);
    el('path', { d: shapePath(c), class: 'body' }, g);
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (c.shape === 'reg') {
      // Clock input triangle on the bottom edge.
      const px = c.ports.clk.x;
      el('path', { d: `M${px - 7},${c.y + c.h} L${px},${c.y + c.h - 8} L${px + 7},${c.y + c.h}`, class: 'clk-tri' }, g);
    }
    if (c.ports.clk && c.shape !== 'reg') {
      const px = c.ports.clk.x;
      el('path', { d: `M${px - 7},${c.y + c.h} L${px},${c.y + c.h - 8} L${px + 7},${c.y + c.h}`, class: 'clk-tri' }, g);
    }
    if (c.shape === 'const') {
      const t = el('text', { x: cx, y: cy + 4, class: 'const-text', 'text-anchor': 'middle' }, g);
      t.textContent = c.label;
    } else if (c.shape === 'alu') {
      const t = el('text', { x: c.x + c.w * 0.62, y: cy + 5, class: 'comp-title', 'text-anchor': 'middle' }, g);
      t.textContent = c.label;
    } else if (c.shape === 'adder') {
      const t = el('text', { x: c.x + c.w * 0.6, y: cy + 6, class: 'comp-title plus', 'text-anchor': 'middle' }, g);
      t.textContent = '+';
    } else if (c.label && c.shape !== 'mux' && c.shape !== 'and' && c.shape !== 'or') {
      const lines = c.sub ? [c.label, c.sub] : [c.label];
      const top = cy - (lines.length - 1) * 8 + 4;
      lines.forEach((s, i) => {
        const t = el('text', { x: cx, y: top + i * 16, class: c.shape === 'small' ? 'comp-small' : 'comp-title', 'text-anchor': 'middle' }, g);
        t.textContent = s;
      });
    }
    // Port labels inside the block.
    for (const p of Object.values(c.ports)) {
      if (!p.label) continue;
      let x = p.x;
      let y = p.y + 3.5;
      let anchor = 'middle';
      if (p.x === c.x) {
        x += 5;
        anchor = 'start';
      } else if (p.x === c.x + c.w) {
        x -= 5;
        anchor = 'end';
      } else if (p.y === c.y) y = p.y + 12;
      else if (p.y === c.y + c.h) y = p.y - 6;
      const t = el('text', { x, y, class: 'port-label', 'text-anchor': anchor }, g);
      t.textContent = p.label;
    }
    const muxLabels: CompEls['muxLabels'] = [];
    if (c.muxIn) {
      for (const [port, txt] of Object.entries(c.muxIn)) {
        const p = c.ports[port];
        const t = el('text', { x: p.x + 5, y: p.y + 3.5, class: 'port-label mux-in', 'text-anchor': 'start' }, g);
        t.textContent = txt;
        muxLabels.push({ port, t });
      }
    }
    this.comps.set(c.id, { c, g, muxLabels });
  }

  private buildWire(w: Wire, layer: SVGGElement, labels: SVGGElement) {
    const g = el('g', { class: `wire kind-${w.kind}${w.field ? ' field-' + w.field : ''}`, 'data-id': w.id, 'data-kind': 'wire' }, layer);
    g.setAttribute('aria-label', w.desc);
    const d = 'M' + w.pts.map((p) => p.join(',')).join(' L');
    el('path', { d, class: 'hit' }, g);
    el('path', { d, class: 'line' }, g);
    el('path', { d, class: 'flow' }, g);
    // Arrowhead into the destination port for data wires.
    if (w.dst && w.kind !== 'ctrl' && w.kind !== 'clk') {
      const [x2, y2] = w.pts[w.pts.length - 1];
      const [x1, y1] = w.pts[w.pts.length - 2];
      const dx = Math.sign(x2 - x1);
      const dy = Math.sign(y2 - y1);
      const a = 5;
      el('path', { d: `M${x2},${y2} L${x2 - dx * a * 1.4 - dy * a * 0.8},${y2 - dy * a * 1.4 - dx * a * 0.8} L${x2 - dx * a * 1.4 + dy * a * 0.8},${y2 - dy * a * 1.4 + dx * a * 0.8} Z`, class: 'arrow' }, g);
    }
    const lg = el('g', { class: `wire-labels kind-${w.kind}${w.field ? ' field-' + w.field : ''}`, 'data-for': w.id }, labels);
    if (w.bits && w.bitsAt) {
      const t = el('text', { x: w.bitsAt[0], y: w.bitsAt[1], class: 'bits', 'text-anchor': 'middle' }, lg);
      t.textContent = w.bits;
    }
    const els: WireEls = { w, g, dots: [] };
    if (w.net) {
      const t = el('text', { x: w.net.at[0], y: w.net.at[1], class: 'net', 'text-anchor': w.net.anchor }, lg);
      t.textContent = w.net.text;
      els.net = { text: t, last: w.net.text };
    }
    if (w.tag) {
      const tg = el('g', { class: 'tag' }, lg);
      const rect = el('rect', { rx: 2, ry: 2, height: 14, y: w.tag.at[1] - 11 }, tg);
      const text = el('text', { x: w.tag.at[0], y: w.tag.at[1], 'text-anchor': w.tag.anchor ?? 'middle' }, tg);
      els.tag = { g: tg, rect, text, last: '' };
    }
    (g as unknown as { _labels: SVGGElement })._labels = lg;
    this.wires.set(w.id, els);
  }

  /** Show parts introduced so far in this lesson; also places junction dots. */
  setRevealed(revealed: Set<string>) {
    this.revealed = new Set(revealed);
    const vis = (p: Comp | Wire) => isVisible(p, this.level, this.revealed);
    for (const { c, g, muxLabels } of this.comps.values()) {
      g.classList.toggle('hidden', !vis(c));
      g.classList.toggle('is-new', isNew(c, this.level));
      for (const m of muxLabels) {
        const used = [...this.wires.values()].some((x) => x.w.dst === `${c.id}.${m.port}` && vis(x.w));
        m.t.classList.toggle('hidden', !used);
      }
    }
    for (const x of this.wires.values()) {
      const v = vis(x.w);
      x.g.classList.toggle('hidden', !v);
      x.g.classList.toggle('is-new', isNew(x.w, this.level));
      labelsOf(x.g).classList.toggle('hidden', !v);
    }
    this.placeDots();
  }

  private placeDots() {
    for (const x of this.wires.values()) {
      for (const d of x.dots) d.remove();
      x.dots = [];
    }
    // A junction dot goes where three or more arms of the same net meet.
    const visible = [...this.wires.values()].filter((x) => !x.g.classList.contains('hidden') && x.w.kind !== 'ctrl' && x.w.kind !== 'clk');
    const seen = new Set<string>();
    for (const x of visible) {
      for (const p of [x.w.pts[0], x.w.pts[x.w.pts.length - 1]]) {
        const key = p.join(',') + '|' + x.w.sig;
        if (seen.has(key)) continue;
        seen.add(key);
        let arms = 0;
        for (const y of visible) {
          if (!(y.w.sig === x.w.sig || (x.w.src && x.w.src === y.w.src))) continue;
          arms += armsAt(p, y.w);
        }
        if (arms >= 3) x.dots.push(el('circle', { cx: p[0], cy: p[1], r: 3.2, class: 'dot' }, x.g));
      }
    }
  }

  isShown(id: string): boolean {
    const x = this.wires.get(id) ?? this.comps.get(id);
    return !!x && !x.g.classList.contains('hidden');
  }

  /** Update states and values. Only touches elements whose class or text changed. */
  setFlow(s: FlowState) {
    const t = s.trace;
    for (const x of this.wires.values()) {
      if (x.g.classList.contains('hidden')) continue;
      const id = x.w.id;
      const relevant = !t || !x.w.active || x.w.active(t);
      let st = 'state-none';
      if (s.active.has(id)) st = relevant ? 'state-active' : 'state-idle';
      else if (s.used.has(id)) st = relevant ? 'state-used' : 'state-idle';
      else if (t && s.fadeIdle && !relevant) st = 'state-idle';
      if (s.focus?.has(id)) st += ' focus';
      this.setState(x.g, st);
      this.setState(labelsOf(x.g), st);
      const showVal = !!t && relevant && (s.active.has(id) || s.used.has(id));
      if (x.tag) {
        const txt = showVal ? fmtValue(sigValue(t!, x.w.sig), x.w.tag!.fmt, t!) : '';
        if (txt !== x.tag.last) {
          x.tag.last = txt;
          x.tag.text.textContent = txt;
          x.tag.g.classList.toggle('hidden', !txt);
          if (txt) {
            const w = textWidth(txt, FONT.tag, true) + 6;
            const a = x.w.tag!.anchor ?? 'middle';
            const at = x.w.tag!.at[0];
            const left = a === 'start' ? at : a === 'end' ? at - w : at - w / 2;
            x.tag.rect.setAttribute('x', String(left));
            x.tag.rect.setAttribute('width', String(w));
            x.tag.text.setAttribute('x', String(a === 'start' ? at + 3 : a === 'end' ? at - 3 : at));
          }
        }
      }
      if (x.net) {
        const txt = netText(x.w.net!.text, x.w.sig, showVal || (t && (s.active.has(id) || s.used.has(id))) ? t : null);
        if (txt !== x.net.last) {
          x.net.last = txt;
          x.net.text.textContent = txt;
        }
      }
    }
    for (const x of this.comps.values()) {
      if (x.g.classList.contains('hidden')) continue;
      const id = x.c.id;
      let st = 'state-none';
      if (s.active.has(id)) st = 'state-active';
      else if (s.used.has(id)) st = 'state-used';
      if (s.focus?.has(id)) st += ' focus';
      if (s.edge && s.active.has(id)) st += ' edge';
      this.setState(x.g, st);
    }
  }

  private setState(e: Element, st: string) {
    if (this.lastClass.get(e) === st) return;
    const prev = this.lastClass.get(e);
    if (prev) for (const c of prev.split(' ')) e.classList.remove(c);
    for (const c of st.split(' ')) e.classList.add(c);
    this.lastClass.set(e, st);
  }

  private overlayG: SVGGElement | null = null;

  /** A group above the diagram (in diagram coordinates) for exercise graphics. */
  overlay(): SVGGElement {
    if (!this.overlayG || !this.overlayG.isConnected) this.overlayG = el('g', { class: 'overlay' }, this.cam);
    return this.overlayG;
  }

  /** Convert a pointer position to diagram coordinates. */
  toDiagram(clientX: number, clientY: number): [number, number] {
    const m = this.cam.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  /** Mark parts with an extra class (trace exercise, Verilog link, critical path). */
  mark(ids: Iterable<string>, cls: string) {
    const set = new Set(ids);
    for (const x of this.wires.values()) {
      x.g.classList.toggle(cls, set.has(x.w.id));
      labelsOf(x.g).classList.toggle(cls, set.has(x.w.id));
    }
    for (const x of this.comps.values()) x.g.classList.toggle(cls, set.has(x.c.id));
  }

  /** Bounding box of the visible parts (or of the given ids). */
  bbox(ids?: Iterable<string>): Camera {
    const pick = ids ? new Set(ids) : null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const add = (x: number, y: number) => {
      x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
    };
    for (const x of this.comps.values()) {
      if (x.g.classList.contains('hidden') || (pick && !pick.has(x.c.id))) continue;
      add(x.c.x, x.c.y);
      add(x.c.x + x.c.w, x.c.y + x.c.h);
    }
    for (const x of this.wires.values()) {
      if (x.g.classList.contains('hidden') || (pick && !pick.has(x.w.id))) continue;
      for (const p of x.w.pts) add(p[0], p[1]);
      if (x.w.net) add(x.w.net.at[0], x.w.net.at[1] + 4);
    }
    if (!isFinite(x1)) return { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /** Set the viewBox aspect (height / width). Changing it is a layout change, so only do it per lesson. */
  setAspect(aspect: number) {
    const h = Math.round(VIEW.w * aspect);
    if (h === this.viewH) return;
    this.viewH = h;
    this.svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${h}`);
  }

  /** Move the camera so the rectangle fills the view (transform only). */
  setCamera(r: Camera, pad = 24, maxScale = 1.7) {
    const want = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
    const s = Math.min(VIEW.w / want.w, this.viewH / want.h, maxScale);
    const tx = VIEW.w / 2 - (want.x + want.w / 2) * s;
    const ty = this.viewH / 2 - (want.y + want.h / 2) * s;
    this.camera = want;
    this.cam.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
  }

  getCamera(): Camera {
    return this.camera;
  }

  /** Fit the SVG's own aspect to the camera so no space is wasted. */
  aspectFor(r: Camera, pad = 24): number {
    return (r.h + 2 * pad) / (r.w + 2 * pad);
  }

  destroy() {
    this.svg.remove();
  }
}

function labelsOf(g: SVGGElement): SVGGElement {
  return (g as unknown as { _labels: SVGGElement })._labels;
}

function setFocusable(g: SVGGElement, on: boolean) {
  if (on) {
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
  } else {
    g.removeAttribute('tabindex');
    g.removeAttribute('role');
  }
}

/** How many wire arms of w leave point p: 1 at an end, 2 at a bend or along a segment. */
function armsAt(p: [number, number], w: Wire): number {
  const s = w.pts[0];
  const e = w.pts[w.pts.length - 1];
  if ((p[0] === s[0] && p[1] === s[1]) || (p[0] === e[0] && p[1] === e[1])) return 1;
  for (let i = 1; i < w.pts.length; i++) {
    const a = w.pts[i - 1];
    const b = w.pts[i];
    if (a[0] === b[0] && p[0] === a[0] && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) return 2;
    if (a[1] === b[1] && p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])) return 2;
  }
  return 0;
}
