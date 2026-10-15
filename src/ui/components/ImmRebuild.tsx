// Immediate rebuild: lines from each instruction bit to its place in ImmExt.

import { bit, hex } from '../../sim/bits';
import { immGen, immMap, type ImmSrc } from '../../sim/immgen';
import { LAYOUT, type FieldKind } from '../../sim/isa';

const W = 20;
const X0 = 36;
const TOP = 34;
const BOT = 160;

const WHY: Record<ImmSrc, string> = {
  I: 'imm[11:0] sits in bits 31:20. Bit 31 is always the sign bit, so the hardware copies instruction bit 31 into every upper bit (sign extension) without first working out the format.',
  S: 'The immediate is split so that rs1, rs2 and funct3 stay in exactly the same bit positions as in R-type. imm[4:0] takes the slot where rd sits in other formats; imm[11:5] takes the funct7 slot. Fixed field positions mean the register file can start reading before decoding finishes.',
  B: 'Branch offsets are multiples of 2 (instructions are 2- or 4-byte aligned), so bit 0 is always 0 and is not stored. That frees one bit, which is spent on imm[12] for twice the range. imm[11] moves to bit 7 so that bits 30:25 and 11:8 carry the same immediate bits as S-type, which keeps the immediate mux small. The sign bit is still bit 31.',
  U: 'The 20-bit immediate goes straight into ImmExt[31:12]; the low 12 bits are 0. Bit 31 is again the most significant bit of the result.',
  J: 'imm[19:12] stays where U-type keeps its bits (19:12); imm[10:1] sits where I-type keeps imm[10:1]; imm[11] uses the spare bit 20. Bit 0 is always 0 and not stored, and the sign bit is bit 31. Each ImmExt bit then has at most a few possible sources across all formats.',
};

export function ImmRebuild({ word, src }: { word: number; src: ImmSrc }) {
  const map = immMap(src);
  const value = immGen(word, src);
  const layout = LAYOUT[src];
  const kindOf = (i: number): FieldKind => layout.find((s) => i <= s.hi && i >= s.lo)?.kind ?? 'opcode';
  const cx = (i: number) => X0 + (31 - i) * W + W / 2;
  // Highest bit taken directly (not as sign extension).
  const direct = map.filter((m) => m.instBit !== null && !m.signExt);
  const sxBits = map.filter((m) => m.signExt).map((m) => m.immBit);
  const sxTop = sxBits.length ? Math.max(...sxBits) : -1;
  const sxLow = sxBits.length ? Math.min(...sxBits) : -1;
  const width = X0 + 32 * W + 12;
  return (
    <div class="card">
      <h4>Rebuilding the {src}-type immediate</h4>
      <div class="tablewrap">
        <svg class="mini-svg imm-rebuild" viewBox={`0 0 ${width} 214`} width={width} role="img" aria-label={`Instruction bits mapped to ImmExt for ${src}-type`}>
          <text x={4} y={TOP + 16} class="ir-lbl">instr</text>
          <text x={4} y={BOT + 16} class="ir-lbl">ImmExt</text>
          {Array.from({ length: 32 }, (_, k) => {
            const i = 31 - k;
            const kind = kindOf(i);
            const used = map.some((m) => m.instBit === i);
            return (
              <g key={'t' + i}>
                <text x={cx(i)} y={TOP - 6} class="ir-num">{i % 4 === 3 || i === 0 ? i : ''}</text>
                <rect x={X0 + k * W} y={TOP} width={W} height={22} class={`ir-cell k-${kind}${used ? ' used' : ' unused'}`} />
                <text x={cx(i)} y={TOP + 15} class="ir-bit">{bit(word, i)}</text>
              </g>
            );
          })}
          {direct.map((m) => (
            <line key={'l' + m.immBit} x1={cx(m.instBit!)} y1={TOP + 22} x2={cx(m.immBit)} y2={BOT} class={`ir-line k-${kindOf(m.instBit!)}`} />
          ))}
          {sxTop >= 0 && (
            <>
              <line x1={cx(31)} y1={TOP + 22} x2={cx(31)} y2={BOT - 18} class="ir-line sx" />
              <line x1={cx(sxTop)} y1={BOT - 18} x2={cx(sxLow)} y2={BOT - 18} class="ir-line sx" />
              {sxBits.map((b) => (
                <line key={'s' + b} x1={cx(b)} y1={BOT - 18} x2={cx(b)} y2={BOT} class="ir-line sx" />
              ))}
              <text x={(cx(sxTop) + cx(sxLow)) / 2} y={BOT - 23} class="ir-note">copies of bit 31 (sign extension)</text>
            </>
          )}
          {Array.from({ length: 32 }, (_, k) => {
            const i = 31 - k;
            const m = map[i];
            const v = m.instBit === null ? 0 : bit(word, m.instBit);
            return (
              <g key={'b' + i}>
                <rect x={X0 + k * W} y={BOT} width={W} height={22} class={`ir-cell ${m.instBit === null ? 'zero' : m.signExt ? 'sxc' : 'k-imm used'}`} />
                <text x={cx(i)} y={BOT + 15} class="ir-bit">{v}</text>
                <text x={cx(i)} y={BOT + 36} class="ir-num">{i % 4 === 3 || i === 0 ? i : ''}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div class="hexline">
        ImmExt = <b>{hex(value)}</b> = <b>{value | 0}</b>
        {src === 'B' || src === 'J' ? ' (a byte offset, always even)' : ''}
      </div>
      <p class="small" style={{ marginTop: 8 }}>{WHY[src]}</p>
    </div>
  );
}
