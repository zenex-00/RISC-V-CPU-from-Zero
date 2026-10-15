// The four linked levels of an instruction: plain English, assembly,
// register transfer, and the real 32 bits.

import { useState } from 'preact/hooks';
import { DEF, type FieldKind } from '../../sim/isa';
import { english, rtlConcrete, type Decoded, type Instr } from '../../sim/encode';
import { hex, signed } from '../../sim/bits';
import { BitView } from './BitView';

type Tok = { t: string; f?: FieldKind };

export function asmTokens(i: Instr): Tok[] {
  const d = DEF[i.op];
  const x = (r: number) => 'x' + r;
  const sp: Tok = { t: ', ' };
  const name: Tok = { t: d.name + ' ' };
  switch (d.fmt) {
    case 'R':
      return [name, { t: x(i.rd), f: 'rd' }, sp, { t: x(i.rs1), f: 'rs1' }, sp, { t: x(i.rs2), f: 'rs2' }];
    case 'I':
      if (d.kind === 'load' || d.kind === 'jalr')
        return [name, { t: x(i.rd), f: 'rd' }, sp, { t: String(i.imm), f: 'imm' }, { t: '(' }, { t: x(i.rs1), f: 'rs1' }, { t: ')' }];
      return [name, { t: x(i.rd), f: 'rd' }, sp, { t: x(i.rs1), f: 'rs1' }, sp, { t: String(i.imm), f: 'imm' }];
    case 'S':
      return [name, { t: x(i.rs2), f: 'rs2' }, sp, { t: String(i.imm), f: 'imm' }, { t: '(' }, { t: x(i.rs1), f: 'rs1' }, { t: ')' }];
    case 'B':
      return [name, { t: x(i.rs1), f: 'rs1' }, sp, { t: x(i.rs2), f: 'rs2' }, sp, { t: signed(i.imm), f: 'imm' }];
    case 'U':
      return [name, { t: x(i.rd), f: 'rd' }, sp, { t: hex(i.imm >>> 12, 5), f: 'imm' }];
    case 'J':
      return [name, { t: x(i.rd), f: 'rd' }, sp, { t: signed(i.imm), f: 'imm' }];
  }
}

function rtlTokens(rtl: string): Tok[] {
  const out: Tok[] = [];
  const re = /(R\[rd\]|R\[rs1\]|R\[rs2\]|SignExt\(imm\)|imm\[31:12\]|imm|shamt)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rtl))) {
    if (m.index > last) out.push({ t: rtl.slice(last, m.index) });
    const t = m[0];
    const f: FieldKind = t.includes('rd') ? 'rd' : t.includes('rs1') ? 'rs1' : t.includes('rs2') ? 'rs2' : 'imm';
    out.push({ t, f });
    last = m.index + t.length;
  }
  if (last < rtl.length) out.push({ t: rtl.slice(last) });
  return out;
}

function Toks({ toks, hover, lit, onHover }: { toks: Tok[]; hover: FieldKind | null; lit: FieldKind[]; onHover: (f: FieldKind | null) => void }) {
  return (
    <>
      {toks.map((k, i) =>
        k.f ? (
          <span
            key={i}
            class={`f-${k.f}`}
            style={{ textDecoration: hover === k.f || lit.includes(k.f) ? 'underline' : undefined, textDecorationThickness: '2px' }}
            onMouseEnter={() => onHover(k.f!)}
            onMouseLeave={() => onHover(null)}
          >
            {k.t}
          </span>
        ) : (
          <span key={i}>{k.t}</span>
        ),
      )}
    </>
  );
}

export function InstrCard({ d, lit = [], compact = false }: { d: Decoded; lit?: FieldKind[]; compact?: boolean }) {
  const [hover, setHover] = useState<FieldKind | null>(null);
  const def = d.def;
  return (
    <div class="strip" aria-label="Instruction at four levels">
      <div class="strip-grid">
        <div class="levels">
          <span class="k">English</span>
          <span class="v eng">{english(d)}</span>
          <span class="k">Assembly</span>
          <span class="v asm">
            <Toks toks={asmTokens(d)} hover={hover} lit={lit} onHover={setHover} />
          </span>
          <span class="k">Transfer</span>
          <span class="v rtl">
            <Toks toks={rtlTokens(def.rtl)} hover={hover} lit={lit} onHover={setHover} />
            {!compact && <span class="concrete">{rtlConcrete(d)}</span>}
          </span>
          <span class="k">Format</span>
          <span class="v small muted">
            {def.fmt}-type{def.kind === 'shifti' ? ' (shift: imm[11:5] acts as funct7)' : ''}
          </span>
        </div>
        <BitView word={d.word} lit={lit} hover={hover} onHover={setHover} showValues />
      </div>
    </div>
  );
}
