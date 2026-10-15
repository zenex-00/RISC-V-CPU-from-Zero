// Panels for the control unit lesson.

import type { Trace } from '../../sim/datapath';
import { MAIN_TABLE, CTRL_KEYS, aluDecode, type CtrlKey } from '../../sim/control';
import { bin } from '../../sim/bits';
import { ALU_NAME } from '../../sim/alu';
import { EQUATIONS, equationText, evalEquation, termText } from '../../sim/gates';

export const SIGNAL_INFO: { name: string; steers: string; values: string; lesson: number }[] = [
  { name: 'RegWrite', steers: 'register file write enable (WE3)', values: '1 = write rd at the clock edge', lesson: 2 },
  { name: 'ALUControl', steers: 'ALU operation (from the ALU decoder)', values: 'add, sub, and, or, xor, slt, sltu, sll, srl, sra', lesson: 2 },
  { name: 'ImmSrc', steers: 'immediate generator layout', values: 'I, S, B, J, U', lesson: 3 },
  { name: 'ALUSrc', steers: 'ALU input B mux', values: '0 = RD2, 1 = ImmExt', lesson: 3 },
  { name: 'MemRead', steers: 'data memory read enable', values: '1 = the read is used', lesson: 4 },
  { name: 'ResultSrc', steers: 'write-back (result) mux', values: '00 ALUResult, 01 memory, 10 PC + 4', lesson: 4 },
  { name: 'MemWrite', steers: 'data memory write enable', values: '1 = write at the clock edge', lesson: 5 },
  { name: 'Branch', steers: 'AND gate before PCSrc', values: '1 = conditional branch', lesson: 6 },
  { name: 'Jump', steers: 'OR gate before PCSrc', values: '1 = jal or jalr', lesson: 8 },
  { name: 'PCTargetSrc', steers: 'target mux', values: '0 = PC + imm, 1 = (rs1 + imm) & ~1', lesson: 8 },
  { name: 'ALUSrcA', steers: 'ALU input A mux', values: '00 RD1, 01 PC, 10 zero', lesson: 9 },
];

export function CtrlSignals() {
  return (
    <div class="card">
      <h3>The control signals you have met</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th class="l">signal</th><th class="l">steers</th><th class="l">values</th><th>lesson</th></tr></thead>
          <tbody>
            {SIGNAL_INFO.map((s) => (
              <tr key={s.name}><td class="l"><span class="ctl">{s.name}</span></td><td class="l">{s.steers}</td><td class="l">{s.values}</td><td>{s.lesson}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="small">PCSrc is not on this list: it is computed in the datapath from Branch, Jump and the branch condition, late in the cycle.</p>
    </div>
  );
}

export function fmtCell(k: CtrlKey, v: number | string): string {
  if (k === 'ALUOp' || k === 'ResultSrc' || k === 'ALUSrcA') return bin(Number(v), 2);
  return String(v);
}

export function MainTable({ trace }: { trace: Trace | null }) {
  const keys = CTRL_KEYS;
  return (
    <div class="card">
      <h3>Main decoder truth table</h3>
      <div class="tablewrap">
        <table class="t">
          <thead>
            <tr><th class="l">class</th><th>opcode</th>{keys.map((k) => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {MAIN_TABLE.map((r) => (
              <tr key={r.name} class={trace && trace.f.opcode === r.opcode ? 'sel' : ''}>
                <td class="l">{r.name}</td>
                <td class="mono">{bin(r.opcode, 7)}</td>
                {keys.map((k) => (r.dc.includes(k) ? <td key={k} class="mono x">x</td> : <td key={k} class="mono">{fmtCell(k, r.ctrl[k] as number | string)}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="small">x marks a don't-care. The simulator drives don't-cares as 0. PCTargetSrc is x for non-jumps only when Branch = 0; branches need 0 (a PC-relative target).</p>
    </div>
  );
}

export function AluTable({ trace }: { trace: Trace | null }) {
  const rows: [number, string, string][] = [
    [0, 'xxx', 'x'], [1, 'xxx', 'x'],
    [2, '000', '0'], [2, '000', '1'], [2, '001', 'x'], [2, '010', 'x'], [2, '011', 'x'], [2, '100', 'x'], [2, '101', '0'], [2, '101', '1'], [2, '110', 'x'], [2, '111', 'x'],
    [3, '000', 'x'], [3, '001', 'x'], [3, '010', 'x'], [3, '011', 'x'], [3, '100', 'x'], [3, '101', '0'], [3, '101', '1'], [3, '110', 'x'], [3, '111', 'x'],
  ];
  const cur = trace ? { op: trace.ctrl.ALUOp, f3: trace.f.funct3, b30: trace.b30 } : null;
  return (
    <div class="card">
      <h3>ALU decoder</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>ALUOp</th><th>funct3</th><th>bit 30</th><th>ALUControl</th><th class="l">operation</th><th class="l">used by</th></tr></thead>
          <tbody>
            {rows.map(([op, f3, b], i) => {
              const f = f3 === 'xxx' ? 0 : parseInt(f3, 2);
              const ctl = aluDecode(op, f, b === '1' ? 1 : 0);
              const sel = cur && cur.op === op && (f3 === 'xxx' || f === cur.f3) && (b === 'x' || +b === cur.b30);
              const who = op === 0 ? 'loads, stores, jalr, lui, auipc' : op === 1 ? 'branches' : op === 2 ? 'R-type' : 'I-type ALU';
              return (
                <tr key={i} class={sel ? 'sel' : ''}>
                  <td class="mono">{bin(op, 2)}</td><td class="mono">{f3}</td><td class="mono">{b}</td><td class="mono">{bin(ctl, 4)}</td><td class="l">{ALU_NAME[ctl]}</td><td class="l small">{who}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small">ALUControl = {'{'}bit 30, funct3{'}'} for R-type. For I-type bit 30 only counts when funct3 = 101 (srli/srai): elsewhere it is an immediate bit.</p>
    </div>
  );
}

export function Gates({ trace, opcode }: { trace: Trace | null; opcode?: number }) {
  const op = opcode ?? trace?.f.opcode ?? 0b0110011;
  return (
    <div class="card">
      <h3>Main decoder as gates</h3>
      <p class="small">Opcode bits b6..b2 (b1 = b0 = 1). A term lights up when it is true for opcode {bin(op, 7)}.</p>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th class="l">signal</th><th class="l">equation</th><th>value</th></tr></thead>
          <tbody>
            {EQUATIONS.map((e) => {
              const v = evalEquation(e, op);
              return (
                <tr key={e.signal}>
                  <td class="l"><span class="ctl">{e.signal}</span></td>
                  <td class="l mono">
                    {e.invert ? '¬(' : ''}
                    {e.terms.map((t, i) => {
                      const on = t.lits.every(([b, val]) => ((op >> b) & 1) === val);
                      return (
                        <span key={i}>
                          {i > 0 ? ' + ' : ''}
                          <span style={on ? { background: 'var(--hl)', fontWeight: 700, padding: '0 2px' } : undefined}>{termText(t)}</span>
                        </span>
                      );
                    })}
                    {e.invert ? ')' : ''}
                  </td>
                  <td class="mono"><b>{v}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small muted">Each equation is a sum of products: AND gates feeding an OR gate (and an inverter for RegWrite). Equivalently, a small ROM or PLA indexed by the opcode.</p>
      <span class="hidden">{EQUATIONS.map(equationText).join()}</span>
    </div>
  );
}
