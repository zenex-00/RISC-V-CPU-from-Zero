// Decode by hand: name the instruction, registers and immediate from a hex word.

import { useState } from 'preact/hooks';
import { BitView } from '../components/BitView';
import { DEF, ISA, layoutFor, type Mnemonic } from '../../sim/isa';
import { encode, disasm, usesFields, type Instr } from '../../sim/encode';
import { bin, bits, hex } from '../../sim/bits';
import { pick, randomInstr } from './gen';
import { recordConcept, recordExercise } from '../store';
import { parseImm, parseReg } from '../../sim/assembler';

const OPC_HINT: Record<number, string> = {
  0b0110011: 'opcode 0110011 = OP: an R-type ALU instruction; funct3 and funct7 name it.',
  0b0010011: 'opcode 0010011 = OP-IMM: an I-type ALU instruction; funct3 names it (and bit 30 for shifts).',
  0b0000011: 'opcode 0000011 = LOAD (I-type); funct3 gives the size and sign.',
  0b0100011: 'opcode 0100011 = STORE (S-type); the immediate is split across 31:25 and 11:7.',
  0b1100011: 'opcode 1100011 = BRANCH (B-type); funct3 gives the condition.',
  0b1101111: 'opcode 1101111 = JAL (J-type).',
  0b1100111: 'opcode 1100111 = JALR (I-type).',
  0b0110111: 'opcode 0110111 = LUI (U-type).',
  0b0010111: 'opcode 0010111 = AUIPC (U-type).',
};

export function DecodeEx({ ops, exId }: { ops: Mnemonic[]; exId: string }) {
  const [target, setTarget] = useState<Instr>(() => randomInstr(pick(ops)));
  const [ans, setAns] = useState({ op: '', rd: '', rs1: '', rs2: '', imm: '' });
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<{ msgs: [boolean, string][]; score: number } | null>(null);
  const word = encode(target);
  const d = DEF[target.op];
  const chosen = DEF[ans.op as Mnemonic];
  const uses = chosen ? usesFields(chosen) : null;
  const check = () => {
    const msgs: [boolean, string][] = [];
    const okOp = ans.op === target.op;
    msgs.push([okOp, okOp ? `Instruction: ${d.name}.` : `Instruction: it is ${d.name}, not ${ans.op || '(none)'}. ${OPC_HINT[d.opcode]} funct3 = ${bin(d.funct3 ?? 0, 3)}${d.funct7 !== undefined ? `, funct7 = ${bin(d.funct7, 7)}` : ''}.`]);
    const u = usesFields(d);
    const regCheck = (name: 'rd' | 'rs1' | 'rs2', hi: number, lo: number) => {
      const r = parseReg(ans[name]);
      const want = target[name];
      const ok = r === want;
      msgs.push([ok, ok ? `${name} = x${want}.` : `${name}: bits ${hi}:${lo} are ${bin(bits(word, hi, lo), 5)} = x${want}${ans[name] ? `, not ${ans[name]}` : ''}.`]);
    };
    if (u.rd) regCheck('rd', 11, 7);
    if (u.rs1) regCheck('rs1', 19, 15);
    if (u.rs2) regCheck('rs2', 24, 20);
    if (u.imm) {
      let v = parseImm(ans.imm);
      const want = d.fmt === 'U' ? target.imm >>> 12 : target.imm;
      if (v !== null && d.fmt === 'U') v = v >>> 0;
      const ok = v !== null && (d.fmt === 'U' ? (v & 0xfffff) === want : v === want);
      const show = d.fmt === 'U' ? hex(want, 5) : String(want);
      msgs.push([ok, ok ? `immediate = ${show}.` : `immediate: ${show}${ans.imm ? `, not ${ans.imm}` : ''}. ${d.fmt === 'B' || d.fmt === 'J' ? 'Remember bit 0 is an implicit 0, and the sign comes from bit 31.' : d.fmt === 'S' ? 'Join bits 31:25 and 11:7, then sign-extend from bit 31.' : d.fmt === 'U' ? 'It is bits 31:12 as a 20-bit value.' : d.kind === 'shifti' ? 'For shifts the amount is bits 24:20.' : 'Bits 31:20, sign-extended from bit 31.'}`]);
    }
    const right = msgs.filter((m) => m[0]).length;
    const score = Math.max(0, right / msgs.length - hints * 0.1);
    setResult({ msgs, score });
    recordExercise(exId, score);
    recordConcept(`decode:${d.fmt}`, right === msgs.length);
  };
  const next = () => {
    setTarget(randomInstr(pick(ops)));
    setAns({ op: '', rd: '', rs1: '', rs2: '', imm: '' });
    setHints(0);
    setResult(null);
  };
  const field = (name: 'rd' | 'rs1' | 'rs2' | 'imm', label: string, show: boolean) =>
    show ? (
      <label class="small" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span class={`f-${name}`} style={{ fontWeight: 600 }}>{label}</span>
        <input type="text" value={ans[name]} placeholder={name === 'imm' ? (chosen?.fmt === 'U' ? '0x12345' : 'e.g. -12') : 'x5'} style={{ width: '110px', fontFamily: 'var(--mono)' }} onInput={(e) => setAns({ ...ans, [name]: (e.target as HTMLInputElement).value })} />
      </label>
    ) : null;
  return (
    <div class="stack">
      <div class="row">
        <span class="muted small">Decode:</span>
        <span class="prompt-asm">{hex(word)}</span>
      </div>
      <BitView word={word} layout={hints >= 2 ? layoutFor(d) : [{ kind: 'imm', hi: 31, lo: 0, label: '' }]} showHex={false} />
      <div class="row" style={{ alignItems: 'flex-end' }}>
        <label class="small" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 600 }}>instruction</span>
          <select value={ans.op} onChange={(e) => setAns({ ...ans, op: (e.target as HTMLSelectElement).value })}>
            <option value="">choose…</option>
            {ISA.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        </label>
        {field('rd', 'rd', !uses || uses.rd)}
        {field('rs1', 'rs1', !uses || uses.rs1)}
        {field('rs2', 'rs2', !uses || uses.rs2)}
        {field('imm', chosen?.kind === 'shifti' ? 'shamt' : 'immediate', !uses || uses.imm)}
      </div>
      <div class="toolbar">
        <button class="btn primary" onClick={check}>Check</button>
        <button class="btn" onClick={() => setHints(Math.min(3, hints + 1))} disabled={hints >= 3}>Hint ({hints}/3)</button>
        <button class="btn" onClick={next}>New word</button>
      </div>
      {hints >= 1 && <div class="route small">Hint 1: bits 6:0 = {bin(word & 0x7f, 7)}. {OPC_HINT[d.opcode]}</div>}
      {hints >= 2 && <div class="route small">Hint 2: the field boundaries for this format are now shown above.</div>}
      {hints >= 3 && <div class="route small">Hint 3: funct3 = {bin(bits(word, 14, 12), 3)}{d.fmt === 'R' || d.kind === 'shifti' ? `, bit 30 = ${bits(word, 30, 30)}` : ''}.</div>}
      {result && (
        <div class={`feedback ${result.msgs.every((m) => m[0]) ? 'good' : 'bad'}`} role="status">
          <strong>Score {Math.round(result.score * 100)}%{hints ? ` (${hints} hint${hints > 1 ? 's' : ''} used)` : ''}.</strong>
          <ul class="fb-body">
            {result.msgs.map((m, i) => <li key={i}>{m[0] ? '✓' : '✗'} {m[1]}</li>)}
          </ul>
          {result.msgs.every((m) => m[0]) && <div class="fb-body">{disasm(target)}</div>}
        </div>
      )}
    </div>
  );
}
