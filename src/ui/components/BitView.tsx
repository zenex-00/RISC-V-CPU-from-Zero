// 32-bit instruction display, split into labelled fields like textbook figures.

import { bit, bits as bitsOf, hex } from '../../sim/bits';
import { decode } from '../../sim/encode';
import { LAYOUT, layoutFor, type FieldKind, type FieldSpan, type Fmt } from '../../sim/isa';
import { OPC } from '../../sim/isa';

export function layoutForWord(word: number): FieldSpan[] | null {
  const d = decode(word);
  if (d.ok) return layoutFor(d.d.def);
  const op = word & 0x7f;
  const fmt: Fmt | null =
    op === OPC.OP ? 'R' : op === OPC.OP_IMM || op === OPC.LOAD || op === OPC.JALR ? 'I' : op === OPC.STORE ? 'S'
      : op === OPC.BRANCH ? 'B' : op === OPC.LUI || op === OPC.AUIPC ? 'U' : op === OPC.JAL ? 'J' : null;
  return fmt ? LAYOUT[fmt] : null;
}

export function fieldValue(word: number, f: FieldSpan): string {
  const v = bitsOf(word, f.hi, f.lo);
  switch (f.kind) {
    case 'rd':
    case 'rs1':
    case 'rs2':
      return 'x' + v;
    case 'imm':
      return f.label === 'shamt' ? String(v) : '';
    default:
      return v.toString(2).padStart(f.hi - f.lo + 1, '0');
  }
}

export interface BitViewProps {
  word: number;
  layout?: FieldSpan[] | null;
  /** Fields to light up; others dim when this is non-empty. */
  lit?: FieldKind[];
  hover?: FieldKind | null;
  onHover?: (f: FieldKind | null) => void;
  /** Editable: click a bit to toggle it. */
  onToggle?: (bitIndex: number) => void;
  /** Field spans marked wrong (by hi bit). */
  wrong?: Set<number>;
  showValues?: boolean;
  showHex?: boolean;
  label?: string;
}

export function BitView(p: BitViewProps) {
  const layout = p.layout === undefined ? layoutForWord(p.word) : p.layout;
  const spans = layout ?? [{ kind: 'imm' as FieldKind, hi: 31, lo: 0, label: 'unknown format' }];
  const litSet = new Set(p.lit ?? []);
  if (p.hover) litSet.add(p.hover);
  const anyLit = litSet.size > 0;
  const spanOf = (i: number) => spans.find((s) => i <= s.hi && i >= s.lo)!;
  const cells = [];
  const nums = [];
  for (let i = 31; i >= 0; i--) {
    const s = spanOf(i);
    const isLit = litSet.has(s.kind);
    const cls = [
      'b', `k-${s.kind}`,
      i === s.hi ? 'fs' : '', i === s.lo ? 'fe' : '',
      anyLit && !isLit ? 'dim' : '', isLit ? 'lit' : '',
      p.wrong?.has(s.hi) ? 'wrong' : '',
    ].join(' ');
    nums.push(
      <div class="bn" key={'n' + i}>
        {i === s.hi || i === s.lo || i % 4 === 0 ? i : ''}
      </div>,
    );
    cells.push(
      <div
        key={'b' + i}
        class={cls}
        role={p.onToggle ? 'button' : undefined}
        tabIndex={p.onToggle ? 0 : undefined}
        aria-label={p.onToggle ? `bit ${i} of ${s.label}, value ${bit(p.word, i)}` : undefined}
        onClick={p.onToggle ? () => p.onToggle!(i) : undefined}
        onKeyDown={p.onToggle ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), p.onToggle!(i)) : undefined}
        onMouseEnter={p.onHover ? () => p.onHover!(s.kind) : undefined}
        onMouseLeave={p.onHover ? () => p.onHover!(null) : undefined}
      >
        {bit(p.word, i)}
      </div>,
    );
  }
  const labels = spans.map((s) => (
    <div
      key={'l' + s.hi}
      class={`fl f-${s.kind}${anyLit && !litSet.has(s.kind) ? ' dim' : ''}`}
      style={{ gridColumn: `${32 - s.hi} / ${33 - s.lo}` }}
      title={`${s.label}: bits ${s.hi}:${s.lo}`}
      onMouseEnter={p.onHover ? () => p.onHover!(s.kind) : undefined}
      onMouseLeave={p.onHover ? () => p.onHover!(null) : undefined}
    >
      {s.label}
    </div>
  ));
  const values = p.showValues
    ? spans.map((s) => (
        <div key={'v' + s.hi} class="fv" style={{ gridColumn: `${32 - s.hi} / ${33 - s.lo}` }}>
          {fieldValue(p.word, s)}
        </div>
      ))
    : null;
  return (
    <div class="bitview" aria-label={p.label ?? `instruction word ${hex(p.word)}`}>
      <div class={`bits${p.onToggle ? ' edit' : ''}`}>
        {nums}
        {cells}
        {labels}
        {values}
      </div>
      {p.showHex !== false && (
        <div class="hexline">
          hex <b>{hex(p.word)}</b>
        </div>
      )}
    </div>
  );
}
