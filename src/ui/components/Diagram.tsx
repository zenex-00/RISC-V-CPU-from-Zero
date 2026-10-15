// Preact wrapper around the imperative DatapathView.

import { useEffect, useRef, useState } from 'preact/hooks';
import { DatapathView, type ClickHandler, type FlowState } from '../../diagram/render';
import type { Trace } from '../../sim/datapath';
import { LESSON_KEYS } from '../../diagram/visibility';

export interface DiagramProps {
  level: number;
  revealed: Set<string>;
  trace: Trace | null;
  active?: Set<string>;
  used?: Set<string>;
  focus?: Set<string>;
  edge?: boolean;
  fadeIdle?: boolean;
  onClick?: ClickHandler;
  interactive?: boolean;
  /** Extra marks: class name -> ids. */
  marks?: Record<string, Iterable<string>>;
  camera?: 'fit' | 'follow' | 'auto';
  /** Optional ids to frame (overrides camera mode). */
  frame?: string[];
  toolbar?: preact.ComponentChildren;
  /** Receives the view once it exists (exercises draw overlays on it). */
  onView?: (v: DatapathView) => void;
  /** Extra class marks applied with a custom class name. */
  hide?: Iterable<string>;
  legend?: boolean;
  label?: string;
}

const EMPTY = new Set<string>();

let visHooked = false;
function hookVisibility() {
  if (visHooked) return;
  visHooked = true;
  const upd = () => document.body.classList.toggle('anim-paused', document.hidden);
  document.addEventListener('visibilitychange', upd);
  upd();
}

export function Diagram(p: DiagramProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<DatapathView | null>(null);
  const [mode, setMode] = useState<'auto' | 'fit' | 'full' | 'zoom'>('auto');
  const levelRef = useRef(-1);

  useEffect(() => {
    hookVisibility();
    view.current = new DatapathView(host.current!, p.label);
    return () => view.current?.destroy();
  }, []);

  useEffect(() => {
    const v = view.current!;
    if (levelRef.current !== p.level) {
      levelRef.current = p.level;
      v.setLevel(p.level, p.revealed);
      // Aspect from everything this lesson will show, so the box keeps one size for the whole lesson.
      v.setRevealed(new Set(LESSON_KEYS[p.level] ?? []));
      const b = v.bbox();
      v.setAspect(Math.min(0.62, Math.max(0.42, (b.h + 48) / (b.w + 48))));
      v.setRevealed(p.revealed);
    } else v.setRevealed(p.revealed);
  }, [p.level, p.revealed]);

  useEffect(() => {
    view.current!.setClickHandler(p.onClick ?? null, !!p.interactive);
  }, [p.onClick, p.interactive]);

  // Hand the view to the parent once per level (not per render: the parent may re-render in response).
  const onViewRef = useRef(p.onView);
  onViewRef.current = p.onView;
  useEffect(() => {
    if (onViewRef.current && view.current) onViewRef.current(view.current);
  }, [p.level]);

  useEffect(() => {
    const v = view.current!;
    const s: FlowState = {
      trace: p.trace,
      active: p.active ?? EMPTY,
      used: p.used ?? EMPTY,
      focus: p.focus,
      fadeIdle: p.fadeIdle ?? !!p.trace,
      edge: p.edge,
    };
    v.setFlow(s);
    for (const cls of ['mark-trace', 'mark-link', 'mark-crit', 'mark-cut', 'mark-wrong']) v.mark(p.marks?.[cls] ?? [], cls);
    v.mark(p.hide ?? [], 'build-hidden');
    // Camera
    let target;
    const all0 = v.bbox();
    const cam = p.camera ?? 'auto';
    const follow = cam === 'follow' || (cam === 'auto' && all0.w > 900);
    if (mode === 'zoom') {
      v.setCamera(all0, 24, 1);
      return;
    }
    if (mode === 'full') target = all0;
    else if (p.frame && p.frame.length) target = v.bbox(p.frame);
    else if (mode === 'auto' && follow && (s.active.size || (p.focus && p.focus.size))) {
      const ids = new Set([...s.active, ...(p.focus ?? [])]);
      const b = v.bbox(ids);
      const all = v.bbox();
      // Keep enough context: at least 640 x 360 units, inside the visible circuit.
      const w = Math.max(b.w, 640);
      const h = Math.max(b.h, 360);
      const x = Math.min(Math.max(b.x - (w - b.w) / 2, all.x - 20), all.x + all.w - w + 20);
      const y = Math.min(Math.max(b.y - (h - b.h) / 2, all.y - 20), all.y + all.h - h + 20);
      target = { x, y, w, h };
    } else target = v.bbox();
    v.setCamera(target, 24, 2.4);
  });

  return (
    <div class="diagram">
      <div class="diagram-bar">
        {p.toolbar}
        <span class="sp" />
        <div class="seg" role="group" aria-label="Diagram view">
          <button class={`btn small ${mode === 'auto' ? 'on' : ''}`} onClick={() => setMode('auto')} title="Frame the parts this step is about">
            {p.camera === 'fit' ? 'Fit' : 'Follow'}
          </button>
          <button class={`btn small ${mode === 'full' ? 'on' : ''}`} onClick={() => setMode('full')} title="Show every part built so far">
            Whole circuit
          </button>
          <button class={`btn small ${mode === 'zoom' ? 'on' : ''}`} onClick={() => setMode('zoom')} title="Full size; scroll inside the box">
            100%
          </button>
        </div>
      </div>
      <div class={`diagram-box${mode === 'zoom' ? ' zoomed' : ''}`} ref={host} />
      {p.legend !== false && <Legend />}
    </div>
  );
}

export function Legend() {
  return (
    <div class="legend" aria-label="Legend">
      <span>
        <i class="l-active" /> signal arriving now
      </span>
      <span>
        <i class="l-used" /> used earlier this cycle
      </span>
      <span>
        <i class="l-idle" /> not used by this instruction
      </span>
      <span>
        <i class="l-ctrl" /> control signal
      </span>
      <span>
        <i class="l-new" /> new in this lesson
      </span>
      <span title="Wires that cross without a dot are not connected. Wires connect only where one starts or ends on another, marked with a dot.">
        <i class="l-dot" /> crossing wires are connected only where one starts or ends (dot)
      </span>
    </div>
  );
}
