// "Look inside" panels: gate-level or RTL structure of each block, with the
// live values of the current example where that helps.

import { useState } from 'preact/hooks';
import type { Trace } from '../../sim/datapath';
import { compById } from '../../diagram/layout';
import { alu as aluFn, ALU, ALU_NAME, rippleTrace } from '../../sim/alu';
import { bin, hex, u32 } from '../../sim/bits';
import { loadExtend, storeAlign } from '../../sim/memory';

export function InsideToggle({ compId, trace }: { compId: string; trace: Trace | null }) {
  const [open, setOpen] = useState(false);
  const c = compById[compId];
  const name = INSIDE_NAME[c.inside!] ?? `${c.label} ${c.sub ?? ''}`;
  return (
    <div class="card tight">
      <button class="btn inside-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Look inside: {name}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div class="inside-body">
          <InsidePanel id={c.inside!} compId={compId} trace={trace} />
        </div>
      )}
    </div>
  );
}

const INSIDE_NAME: Record<string, string> = {
  mux: 'the multiplexer',
  pcreg: 'the PC register',
  imem: 'instruction memory',
  adder: 'the adder',
  rf: 'the register file',
  immgen: 'the immediate generator',
  alu: 'the ALU',
  brcond: 'the comparator and condition logic',
  pclogic: 'the PCSrc logic',
  dmem: 'data memory',
  stalign: 'the store-align unit',
  ldext: 'the load-extend unit',
  control: 'the control unit',
};

export function InsidePanel({ id, compId, trace }: { id: string; compId: string; trace: Trace | null }) {
  switch (id) {
    case 'adder':
      return <AdderInside compId={compId} trace={trace} />;
    case 'alu':
      return <AluInside trace={trace} />;
    case 'rf':
      return <RfInside trace={trace} />;
    case 'immgen':
      return <ImmInside trace={trace} />;
    case 'brcond':
      return <BrInside trace={trace} />;
    case 'mux':
      return <MuxInside compId={compId} trace={trace} />;
    case 'pcreg':
      return <PcInside trace={trace} />;
    case 'imem':
      return <ImemInside trace={trace} />;
    case 'dmem':
      return <DmemInside trace={trace} />;
    case 'stalign':
      return <StInside trace={trace} />;
    case 'ldext':
      return <LdInside trace={trace} />;
    case 'pclogic':
      return <PcLogicInside trace={trace} />;
    case 'control':
      return <p class="small">The control unit is derived step by step in Lesson 10: a main decoder (a truth table from opcode to control signals) and a small ALU decoder.</p>;
  }
  return null;
}

const B = ({ v }: { v: number }) => <span class="mono">{v}</span>;

/* ---------- Adder: ripple-carry and carry-lookahead ---------- */

function AdderInside({ compId, trace }: { compId: string; trace: Trace | null }) {
  const [tab, setTab] = useState<'rca' | 'cla'>('rca');
  let a = 0x10, b = 4;
  if (trace) {
    if (compId === 'bradd') {
      a = trace.PC;
      b = trace.ImmExt;
    } else {
      a = trace.PC;
      b = 4;
    }
  }
  const r = rippleTrace(a, b, 0);
  // Longest run of carries propagating through consecutive bits.
  let run = 0, best = 0;
  for (let i = 1; i <= 32; i++) {
    if (r.c[i]) run++;
    else run = 0;
    best = Math.max(best, run);
  }
  return (
    <div class="stack">
      <div class="seg" role="tablist">
        <button class={`btn small ${tab === 'rca' ? 'on' : ''}`} onClick={() => setTab('rca')}>
          Ripple-carry
        </button>
        <button class={`btn small ${tab === 'cla' ? 'on' : ''}`} onClick={() => setTab('cla')}>
          Carry-lookahead
        </button>
      </div>
      {tab === 'rca' ? (
        <>
          <svg viewBox="0 0 330 120" class="mini-svg inside-svg" role="img" aria-label="Ripple-carry adder: a chain of full adders">
            {[0, 1, 2, 3].map((k) => {
              const x = 250 - k * 78;
              const bitIdx = k === 3 ? 31 : k;
              return (
                <g key={k}>
                  <rect x={x} y={40} width={52} height={40} class="ib" />
                  <text x={x + 26} y={64} class="it">FA{bitIdx}</text>
                  <text x={x + 14} y={30} class="is">a{bitIdx}</text>
                  <text x={x + 38} y={30} class="is">b{bitIdx}</text>
                  <line x1={x + 14} y1={33} x2={x + 14} y2={40} class="il" />
                  <line x1={x + 38} y1={33} x2={x + 38} y2={40} class="il" />
                  <line x1={x + 26} y1={80} x2={x + 26} y2={94} class="il" />
                  <text x={x + 26} y={106} class="is">s{bitIdx}</text>
                  {k < 3 && <line x1={x} y1={60} x2={x - 26} y2={60} class="il carry" />}
                  {k === 2 && <text x={x - 39} y={64} class="it">…</text>}
                </g>
              );
            })}
            <line x1={302} y1={60} x2={320} y2={60} class="il" />
            <text x={322} y={50} class="is" text-anchor="end">c0</text>
            <text x={16} y={64} class="is">c32</text>
          </svg>
          <p class="small">
            Each full adder computes s<sub>i</sub> = a<sub>i</sub> ⊕ b<sub>i</sub> ⊕ c<sub>i</sub> and c<sub>i+1</sub> = a<sub>i</sub>b<sub>i</sub> + c<sub>i</sub>(a<sub>i</sub> ⊕ b<sub>i</sub>).
            The carry must ripple through all 32 stages in the worst case, so the delay grows linearly with the width: about 32 carry delays.
          </p>
          <div class="tablewrap">
            <table class="t">
              <tbody>
                <tr><th class="l">a</th><td class="mono l">{bin(a, 32)}</td></tr>
                <tr><th class="l">b</th><td class="mono l">{bin(b, 32)}</td></tr>
                <tr><th class="l">carries c32..c1</th><td class="mono l">{r.c.slice(1).reverse().join('')}</td></tr>
                <tr><th class="l">sum</th><td class="mono l">{bin(u32(a + b), 32)} = {hex(u32(a + b))}</td></tr>
              </tbody>
            </table>
          </div>
          <p class="small muted">For these operands the longest chain of consecutive carries is {best} bits. Timing analysis must still assume the worst case, 32.</p>
        </>
      ) : (
        <ClaView a={a} b={b} />
      )}
    </div>
  );
}

function ClaView({ a, b }: { a: number; b: number }) {
  const g: number[] = [], p: number[] = [];
  for (let i = 0; i < 32; i++) {
    g.push(((a >>> i) & 1) & ((b >>> i) & 1));
    p.push(((a >>> i) & 1) ^ ((b >>> i) & 1));
  }
  const blocks = Array.from({ length: 8 }, (_, k) => {
    const [g0, g1, g2, g3] = [g[4 * k], g[4 * k + 1], g[4 * k + 2], g[4 * k + 3]];
    const [p0, p1, p2, p3] = [p[4 * k], p[4 * k + 1], p[4 * k + 2], p[4 * k + 3]];
    return { G: g3 | (p3 & g2) | (p3 & p2 & g1) | (p3 & p2 & p1 & g0), P: p3 & p2 & p1 & p0 };
  });
  return (
    <>
      <p class="small">
        Each bit computes <b>generate</b> g<sub>i</sub> = a<sub>i</sub>b<sub>i</sub> (this bit makes a carry) and <b>propagate</b> p<sub>i</sub> = a<sub>i</sub> ⊕ b<sub>i</sub> (this bit passes an incoming carry on).
        Then c<sub>i+1</sub> = g<sub>i</sub> + p<sub>i</sub>c<sub>i</sub>, and expanding that recurrence gives every carry in a 4-bit block in two gate levels:
      </p>
      <p class="small mono">G = g3 + p3·g2 + p3·p2·g1 + p3·p2·p1·g0, P = p3·p2·p1·p0, c4 = G + P·c0</p>
      <p class="small">
        Blocks then pass carries block to block (8 hops instead of 32), or a second lookahead level combines the block G and P values, giving a delay that grows with log<sub>2</sub> of the width.
      </p>
      <div class="tablewrap">
        <table class="t">
          <thead>
            <tr><th>block (bits)</th>{blocks.map((_, k) => <th key={k}>{4 * k + 3}:{4 * k}</th>).reverse()}</tr>
          </thead>
          <tbody>
            <tr><th>G</th>{blocks.map((x, k) => <td key={k} class="mono">{x.G}</td>).reverse()}</tr>
            <tr><th>P</th>{blocks.map((x, k) => <td key={k} class="mono">{x.P}</td>).reverse()}</tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">Values for a = {hex(a)}, b = {hex(b)}.</p>
    </>
  );
}

/* ---------- ALU ---------- */

function AluInside({ trace }: { trace: Trace | null }) {
  const A = trace?.SrcA ?? 23, Bv = trace?.SrcB ?? 19, ctl = trace?.ALUControl ?? ALU.ADD;
  const o = aluFn(A, Bv, ctl);
  return (
    <div class="stack">
      <svg viewBox="0 0 340 250" class="mini-svg inside-svg" role="img" aria-label="ALU internals">
        <text x={8} y={22} class="is" text-anchor="start">A</text>
        <text x={8} y={62} class="is" text-anchor="start">B</text>
        <line x1={20} y1={18} x2={330} y2={18} class="il" />
        <line x1={20} y1={58} x2={60} y2={58} class="il" />
        {/* inverter mux for subtract */}
        <rect x={60} y={44} width={46} height={28} class="ib" />
        <text x={83} y={62} class="it">B ⊕ Sub</text>
        <line x1={106} y1={58} x2={130} y2={58} class="il" />
        <rect x={130} y={10} width={64} height={62} class="ib hl" />
        <text x={162} y={38} class="it">adder</text>
        <text x={162} y={54} class="is">cin = Sub</text>
        <line x1={162} y1={72} x2={162} y2={90} class="il" />
        <text x={162} y={102} class="is">Sum, Cout, N, V</text>
        <rect x={130} y={118} width={64} height={22} class="ib" /><text x={162} y={133} class="is">A &amp; B</text>
        <rect x={130} y={144} width={64} height={22} class="ib" /><text x={162} y={159} class="is">A | B</text>
        <rect x={130} y={170} width={64} height={22} class="ib" /><text x={162} y={185} class="is">A ^ B</text>
        <rect x={130} y={196} width={64} height={22} class="ib" /><text x={162} y={211} class="is">shifter</text>
        <rect x={40} y={110} width={76} height={42} class="ib" />
        <text x={78} y={127} class="is">SLT = N ⊕ V</text>
        <text x={78} y={142} class="is">SLTU = ¬Cout</text>
        <path d="M240,20 L270,36 L270,214 L240,230 Z" class="ib" />
        <text x={255} y={124} class="is">mux</text>
        {[40, 106, 133, 159, 185, 211].map((y, i) => <line key={i} x1={i === 1 ? 116 : 194} y1={y} x2={240} y2={y} class="il" />)}
        <line x1={270} y1={125} x2={310} y2={125} class="il" />
        <text x={316} y={129} class="is" text-anchor="start">Y</text>
        <text x={255} y={246} class="is">ALUControl</text>
        <line x1={255} y1={230} x2={255} y2={236} class="il" />
        <text x={300} y={160} class="is">Zero =</text>
        <text x={300} y={174} class="is">NOR(Y)</text>
      </svg>
      <p class="small">
        One adder does both add and subtract. When <span class="ctl">Sub</span> = 1 the B input is inverted (XOR with Sub) and the carry-in is 1, so the adder computes A + ~B + 1 = A − B in two's complement.
        sub, slt and sltu set Sub = 1. The result mux, steered by ALUControl, picks one unit's output.
      </p>
      <table class="t">
        <tbody>
          <tr><th class="l">ALUControl</th><td class="mono l">{ctl.toString(2).padStart(4, '0')} = {ALU_NAME[ctl] ?? '?'}</td></tr>
          <tr><th class="l">A, B</th><td class="mono l">{hex(A)}, {hex(Bv)}</td></tr>
          <tr><th class="l">Sub, B ⊕ Sub</th><td class="mono l">{o.sub}, {hex(o.sub ? ~Bv : Bv)}</td></tr>
          <tr><th class="l">Sum, Cout</th><td class="mono l">{hex(o.sum)}, {o.cout}</td></tr>
          <tr><th class="l">N, V</th><td class="mono l">{o.n}, {o.v}</td></tr>
          <tr><th class="l">LT = N ⊕ V, LTU = ¬Cout</th><td class="mono l">{o.lt}, {o.ltu}</td></tr>
          <tr><th class="l">Y, Zero</th><td class="mono l">{hex(o.y)} ({o.y | 0}), {o.zero}</td></tr>
        </tbody>
      </table>
      <p class="small muted">LT and LTU mean "A &lt; B" only when the adder subtracts. V = 1 when A and B have different signs and the difference's sign differs from A's: then N alone gives the wrong answer, so LT = N ⊕ V.</p>
    </div>
  );
}

/* ---------- Register file ---------- */

function RfInside({ trace }: { trace: Trace | null }) {
  const a1 = trace?.A1 ?? 6, a2 = trace?.A2 ?? 7, a3 = trace?.A3 ?? 5, we = trace?.ctrl.RegWrite ?? 1;
  return (
    <div class="stack">
      <svg viewBox="0 0 340 230" class="mini-svg inside-svg" role="img" aria-label="Register file internals">
        <text x={10} y={30} class="is" text-anchor="start">A3</text>
        <line x1={28} y1={26} x2={44} y2={26} class="il" />
        <rect x={44} y={10} width={44} height={170} class="ib" />
        <text x={66} y={95} class="it" transform="rotate(-90 66 95)">5:32 decoder</text>
        <text x={10} y={202} class="is" text-anchor="start">WE3</text>
        <line x1={34} y1={198} x2={104} y2={198} class="il ctlw" />
        {[0, 1, 2, 3].map((k) => {
          const y = 22 + k * 40;
          const reg = k === 3 ? 31 : k;
          const lit = we && reg === a3 && reg !== 0;
          return (
            <g key={k}>
              {reg !== 0 && (
                <>
                  <line x1={88} y1={y + 10} x2={110} y2={y + 10} class={`il${lit ? ' on' : ''}`} />
                  <path d={`M110,${y + 2} h8 a8,8 0 0 1 0,16 h-8 z`} class="ib" />
                  <line x1={104} y1={198} x2={104} y2={y + 15} class="il ctlw" />
                  <line x1={104} y1={y + 15} x2={110} y2={y + 15} class="il ctlw" />
                  <line x1={126} y1={y + 10} x2={146} y2={y + 10} class={`il${lit ? ' on' : ''}`} />
                </>
              )}
              <rect x={146} y={y} width={70} height={26} class={`ib${reg === 0 ? ' zero' : ''}`} />
              <text x={181} y={y + 17} class="is">{reg === 0 ? 'x0 = 0' : `x${reg}`}</text>
              {reg !== 0 && <text x={150} y={y + 9} class="tiny">EN</text>}
              <line x1={216} y1={y + 13} x2={262} y2={y + 13} class="il" />
              {k === 2 && <text x={181} y={y + 38} class="it">⋮</text>}
            </g>
          );
        })}
        <path d="M262,10 L292,22 L292,88 L262,100 Z" class="ib" />
        <text x={277} y={58} class="tiny">32:1</text>
        <path d="M262,118 L292,130 L292,196 L262,208 Z" class="ib" />
        <text x={277} y={166} class="tiny">32:1</text>
        <line x1={292} y1={55} x2={320} y2={55} class="il" /><text x={322} y={59} class="is" text-anchor="start">RD1</text>
        <line x1={292} y1={163} x2={320} y2={163} class="il" /><text x={322} y={167} class="is" text-anchor="start">RD2</text>
        <text x={277} y={8} class="tiny">A1</text>
        <text x={277} y={226} class="tiny">A2</text>
      </svg>
      <p class="small">
        Write side: a 5-to-32 decoder turns A3 into 32 enable lines, each ANDed with WE3 (RegWrite). Only the selected register's flip-flops load WD3 at the clock edge; the others hold their value. Register 0 has no flip-flops: its output is wired to constant 0, so writes to x0 vanish.
      </p>
      <p class="small">
        Read side: each read port is a 32-to-1 multiplexer of 32-bit values, steered by A1 or A2. Reads are combinational, so RD1 and RD2 follow the addresses within the same cycle.
      </p>
      <p class="small mono">Now: A1 = x{a1}, A2 = x{a2}, A3 = x{a3}, WE3 = {we}{a3 === 0 && we ? ' (write to x0 is ignored)' : ''}</p>
    </div>
  );
}

/* ---------- Immediate generator ---------- */

function ImmInside({ trace }: { trace: Trace | null }) {
  const cur = trace?.ctrl.ImmSrc ?? 'I';
  const rows: [string, string, string, string, string, string][] = [
    ['31', 'i31', 'i31', 'i31', 'i31', 'i31'],
    ['30:20', 'i31', 'i31', 'i31', 'i30:20', 'i31'],
    ['19:12', 'i31', 'i31', 'i31', 'i19:12', 'i19:12'],
    ['11', 'i31', 'i31', 'i7', '0', 'i20'],
    ['10:5', 'i30:25', 'i30:25', 'i30:25', '0', 'i30:25'],
    ['4:1', 'i24:21', 'i11:8', 'i11:8', '0', 'i24:21'],
    ['0', 'i20', 'i7', '0', '0', '0'],
  ];
  const cols = ['I', 'S', 'B', 'U', 'J'];
  return (
    <div class="stack">
      <p class="small">
        Each ImmExt bit group is a small multiplexer steered by ImmSrc. The table lists which instruction bit (i<sub>n</sub>) feeds each group. The layouts were chosen so that each column has as few distinct sources as possible.
      </p>
      <div class="tablewrap">
        <table class="t">
          <thead>
            <tr><th>ImmExt</th>{cols.map((c) => <th key={c} style={c === cur ? { background: 'var(--hl)' } : undefined}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td class="mono">[{r[0]}]</td>
                {r.slice(1).map((v, i) => <td key={i} class="mono" style={cols[i] === cur ? { background: 'var(--hl)' } : undefined}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="small">
        Bit 31 of the result always comes from instruction bit 31: that is the sign bit in every format, so sign extension is just wiring, with no mux. Bits 10:5 come from i30:25 in four of five formats. Sign extension costs no logic: the upper bits are copies of one wire, fanned out.
      </p>
    </div>
  );
}

/* ---------- Comparator / branch condition ---------- */

function BrInside({ trace }: { trace: Trace | null }) {
  const f3 = trace?.f.funct3 ?? 0;
  const zero = trace?.Zero ?? 0, lt = trace?.LT ?? 0, ltu = trace?.LTU ?? 0;
  const cond = f3 & 4 ? (f3 & 2 ? ltu : lt) : zero;
  return (
    <div class="stack">
      <svg viewBox="0 0 330 150" class="mini-svg inside-svg" role="img" aria-label="Branch condition logic">
        <text x={8} y={30} class="is" text-anchor="start">Zero</text>
        <text x={8} y={70} class="is" text-anchor="start">LT</text>
        <text x={8} y={100} class="is" text-anchor="start">LTU</text>
        <line x1={40} y1={26} x2={170} y2={26} class="il" />
        <line x1={40} y1={66} x2={90} y2={66} class="il" />
        <line x1={40} y1={96} x2={90} y2={96} class="il" />
        <path d="M90,52 L112,60 L112,102 L90,110 Z" class="ib" />
        <text x={101} y={128} class="tiny">f3[1]</text>
        <line x1={112} y1={81} x2={170} y2={81} class="il" />
        <path d="M170,14 L194,24 L194,84 L170,94 Z" class="ib" />
        <text x={182} y={110} class="tiny">f3[2]</text>
        <line x1={194} y1={54} x2={230} y2={54} class="il" />
        <path d="M230,40 q14,14 0,28 M236,40 q14,14 0,28 q22,-2 34,-14 q-12,-12 -34,-14" class="ib" />
        <line x1={210} y1={62} x2={232} y2={62} class="il" />
        <text x={206} y={78} class="tiny">f3[0]</text>
        <line x1={270} y1={54} x2={300} y2={54} class="il" />
        <text x={304} y={58} class="is" text-anchor="start">Take</text>
      </svg>
      <p class="small">
        The flags come from the ALU subtracting A − B. <b>Zero</b> = NOR of all 32 result bits (built as a tree of smaller NOR/OR gates). <b>LT</b> = N ⊕ V, the sign of the true difference. <b>LTU</b> = ¬Cout: with A + ~B + 1, a carry out means no borrow, so A ≥ B unsigned.
      </p>
      <p class="small">
        funct3[2] picks equality (Zero) or a less-than flag; funct3[1] picks LT or LTU; funct3[0] inverts, turning beq into bne, blt into bge, bltu into bgeu.
      </p>
      <p class="small mono">Now: funct3 = {f3.toString(2).padStart(3, '0')}, Zero = {zero}, LT = {lt}, LTU = {ltu}, selected = {cond}, Take = {cond ^ (f3 & 1)}</p>
    </div>
  );
}

/* ---------- Mux ---------- */

function MuxInside({ compId, trace }: { compId: string; trace: Trace | null }) {
  const three = compId === 'resmux' || compId === 'srcamux';
  let sel: number | null = null;
  if (trace) {
    if (compId === 'srcbmux') sel = trace.ctrl.ALUSrc;
    if (compId === 'srcamux') sel = trace.ctrl.ALUSrcA;
    if (compId === 'resmux') sel = trace.ctrl.ResultSrc;
    if (compId === 'pcmux') sel = trace.PCSrc;
    if (compId === 'tgtmux') sel = trace.ctrl.PCTargetSrc;
  }
  return (
    <div class="stack">
      <svg viewBox="0 0 300 120" class="mini-svg inside-svg" role="img" aria-label="Two-to-one multiplexer from gates">
        <text x={8} y={30} class="is" text-anchor="start">d0</text>
        <text x={8} y={90} class="is" text-anchor="start">d1</text>
        <text x={8} y={116} class="is" text-anchor="start">s</text>
        <line x1={26} y1={26} x2={120} y2={26} class="il" />
        <line x1={26} y1={86} x2={120} y2={86} class="il" />
        <line x1={24} y1={112} x2={90} y2={112} class="il ctlw" />
        <line x1={90} y1={112} x2={90} y2={96} class="il ctlw" />
        <line x1={90} y1={96} x2={120} y2={96} class="il ctlw" />
        <line x1={60} y1={112} x2={60} y2={50} class="il ctlw" />
        <path d="M60,50 l-6,-12 h12 z" class="ib" />
        <circle cx={60} cy={34} r={3} class="ib" />
        <line x1={60} y1={31} x2={60} y2={36} class="il ctlw" />
        <line x1={60} y1={36} x2={120} y2={36} class="il ctlw" />
        <path d="M120,18 h14 a13,13 0 0 1 0,26 h-14 z" class="ib" />
        <path d="M120,78 h14 a13,13 0 0 1 0,26 h-14 z" class="ib" />
        <line x1={147} y1={31} x2={180} y2={31} class="il" />
        <line x1={147} y1={91} x2={180} y2={91} class="il" />
        <path d="M176,22 q30,0 44,39 q-14,39 -44,39 q12,-39 0,-78" class="ib" />
        <line x1={220} y1={61} x2={260} y2={61} class="il" />
        <text x={266} y={65} class="is" text-anchor="start">y</text>
      </svg>
      <p class="small">
        Per bit, y = s̄·d0 + s·d1: two AND gates, an inverter and an OR gate. A 32-bit mux is 32 copies sharing the select line.
        {three ? ' A 3-input mux uses a 2-bit select; it can be built as two 2:1 levels or as one AND-OR level with decoded one-hot selects.' : ''}
      </p>
      {sel !== null && <p class="small mono">Now: select = {sel}</p>}
      <p class="small muted">A mux always outputs one of its inputs. Every input is computed every cycle; the select only decides which value is used.</p>
    </div>
  );
}

/* ---------- State elements and memories ---------- */

function PcInside({ trace }: { trace: Trace | null }) {
  return (
    <div class="stack">
      <p class="small">
        The PC is 32 edge-triggered D flip-flops sharing one clock (and a reset that loads the start address). At each rising edge, each flip-flop copies its D input to Q; between edges Q holds still no matter what D does.
      </p>
      <p class="small">
        Three timing numbers describe it: <b>setup time</b> (D must be stable this long before the edge), <b>hold time</b> (and this long after), and <b>clock-to-Q</b> delay (how long after the edge Q shows the new value). Lesson 12 uses them to compute the clock period.
      </p>
      {trace && <p class="small mono">Now: Q = {hex(trace.PC)}, D = {hex(trace.PCNext)}</p>}
    </div>
  );
}

function ImemInside({ trace }: { trace: Trace | null }) {
  const pc = trace?.PC ?? 0x10;
  return (
    <div class="stack">
      <p class="small">
        Instruction memory is an array of 1024 words (4 KiB) holding the program. The byte address is word-aligned, so bits [1:0] are 00 and bits [11:2] select the word. Here it is read-only and its read is combinational: RD follows A after the access time.
      </p>
      <p class="small">
        Instructions and data are in separate memories (a Harvard organisation) so that one cycle can fetch an instruction and access data at the same time. A single shared memory would need two ports.
      </p>
      <p class="small mono">Now: A = {hex(pc)}, word index = A[11:2] = {(pc >>> 2) & 0x3ff}</p>
    </div>
  );
}

function DmemInside({ trace }: { trace: Trace | null }) {
  return (
    <div class="stack">
      <p class="small">
        Data memory here is 4 KiB at addresses 0x1000 to 0x1FFF, organised as 1024 words of 4 byte lanes. A[11:2] selects the word. Reads are combinational and return the whole aligned word; the load-extend unit then picks the bytes it needs.
      </p>
      <p class="small">
        Writes happen only at the clock edge, and only when WE (MemWrite) = 1. BE[3:0] enables each byte lane separately, which is how sb and sh change one or two bytes without disturbing the others. In this model RD is 0 when RE (MemRead) = 0.
      </p>
      <p class="small">
        Misaligned accesses (lw at an address not divisible by 4, lh at an odd address) are not supported by this hardware. The RISC-V spec allows a core to trap on them; this simulator stops and reports the error. So do accesses outside the data memory range.
      </p>
      {trace && <p class="small mono">Now: A = {hex(trace.MemAddr)}, word = {hex(trace.MemAddr & ~3)}, RE = {trace.ctrl.MemRead}, WE = {trace.ctrl.MemWrite}{trace.ctrl.MemWrite ? `, BE = ${bin(trace.BE, 4)}` : ''}</p>}
    </div>
  );
}

function StInside({ trace }: { trace: Trace | null }) {
  const rs2 = trace?.RD2 ?? 0x12345678;
  const f3 = trace?.f.funct3 ?? 0;
  const off = trace ? trace.MemAddr & 3 : 1;
  const rows: [string, number, number[]][] = [['sb', 0, [0, 1, 2, 3]], ['sh', 1, [0, 2]], ['sw', 2, [0]]];
  return (
    <div class="stack">
      <p class="small">
        The memory writes whole words through byte lanes. For sb, the low byte of rs2 is copied into all four lanes and only one byte enable is set; for sh, the low halfword is copied into both halves and two enables are set. The address bits [1:0] choose the lane.
      </p>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>addr[1:0]</th><th>BE[3:0]</th><th>WD</th></tr></thead>
          <tbody>
            {rows.flatMap(([name, f, offs]) =>
              offs.map((o) => {
                const s = storeAlign(rs2, o, f);
                return (
                  <tr key={name + o} class={f === (f3 & 3) && o === off ? 'sel' : ''}>
                    <td class="mono">{name}</td><td class="mono">{bin(o, 2)}</td><td class="mono">{bin(s.be, 4)}</td><td class="mono">{hex(s.wd)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <p class="small muted">Values shown for rs2 = {hex(rs2)}.</p>
    </div>
  );
}

function LdInside({ trace }: { trace: Trace | null }) {
  const word = trace?.ReadWord ?? 0x80ff1234;
  const off = trace ? trace.MemAddr & 3 : 0;
  const ops: [string, number][] = [['lb', 0], ['lbu', 4], ['lh', 1], ['lhu', 5], ['lw', 2]];
  return (
    <div class="stack">
      <p class="small">
        A 4:1 mux steered by addr[1:0] picks the byte lane; a 2:1 mux steered by addr[1] picks the halfword. Then the value is extended to 32 bits: funct3[2] = 0 copies the top bit of the byte or halfword (sign extension, lb and lh), funct3[2] = 1 fills with zeros (lbu and lhu). funct3[1:0] gives the size.
      </p>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>funct3</th><th>result for word {hex(word)}, offset {off}</th></tr></thead>
          <tbody>
            {ops.map(([n, f]) => {
              const ok = f === 2 ? off === 0 : f === 1 || f === 5 ? off % 2 === 0 : true;
              return (
                <tr key={n} class={trace && trace.f.funct3 === f ? 'sel' : ''}>
                  <td class="mono">{n}</td><td class="mono">{bin(f, 3)}</td>
                  <td class="mono">{ok ? `${hex(loadExtend(word, off, f))} (${loadExtend(word, off, f) | 0})` : 'misaligned'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PcLogicInside({ trace }: { trace: Trace | null }) {
  return (
    <div class="stack">
      <p class="small mono">PCSrc = Jump + (Branch · Take)</p>
      <p class="small">
        A branch changes the PC only if it is a branch (Branch = 1) and its condition holds. A jump always changes it. Every other instruction has Branch = Jump = 0, so PCSrc = 0 and the PC mux passes PC + 4.
      </p>
      {trace && <p class="small mono">Now: Branch = {trace.ctrl.Branch}, Take = {trace.Take}, Jump = {trace.ctrl.Jump}, PCSrc = {trace.PCSrc}</p>}
    </div>
  );
}

void B;
