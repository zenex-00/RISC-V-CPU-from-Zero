// Random but realistic instructions and machine states for exercises.

import { DEF, type Mnemonic } from '../../sim/isa';
import type { Instr } from '../../sim/encode';
import { DMEM_BASE } from '../../sim/memory';
import type { Example } from '../../lessons/types';
import { disasm } from '../../sim/encode';

export const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** A random instruction with plausible operands (registers x1..x31, sensible immediates). */
export function randomInstr(op: Mnemonic): Instr {
  const d = DEF[op];
  const reg = () => rnd(1, 31);
  let imm = 0;
  switch (d.kind) {
    case 'shifti':
      imm = rnd(1, 31);
      break;
    case 'load':
    case 'store': {
      const size = 1 << ((d.funct3 ?? 2) & 3);
      imm = pick([0, 4, 8, 12, 16, 20, 24, 32, 64, -4, -8, -16, 100, 256, -256]) ;
      imm = Math.floor(imm / size) * size;
      if (Math.random() < 0.3) imm = rnd(-512, 511) * size;
      break;
    }
    case 'branch':
      imm = pick([-1, 1]) * rnd(1, 300) * 2;
      if (Math.random() < 0.25) imm = pick([-4096, 4094, -2048, 2046, 8, -8, 16]);
      break;
    case 'jal':
      imm = pick([-1, 1]) * rnd(2, 4000) * 2;
      if (Math.random() < 0.2) imm = pick([-1048576, 1048574, 4096, -2048]);
      break;
    case 'jalr':
      imm = pick([0, 0, 4, 8, -4, 16, 1]);
      break;
    case 'lui':
    case 'auipc':
      imm = (rnd(0, 0xfffff) << 12) | 0;
      break;
    default:
      imm = Math.random() < 0.3 ? pick([-1, -2048, 2047, 1024, -100]) : rnd(-2048, 2047);
  }
  const fmt = d.fmt;
  return {
    op,
    rd: fmt === 'S' || fmt === 'B' ? 0 : reg(),
    rs1: fmt === 'U' || fmt === 'J' ? 0 : reg(),
    rs2: fmt === 'R' || fmt === 'S' || fmt === 'B' ? reg() : 0,
    imm,
  };
}

/** A worked example (registers and memory) that makes the instruction meaningful and legal. */
export function exampleFor(op: Mnemonic): Example {
  const d = DEF[op];
  const r = () => rnd(1, 15);
  let rd = r(), rs1 = r(), rs2 = r();
  while (rs2 === rs1) rs2 = r();
  while (rd === rs1 || rd === rs2) rd = r();
  const regs: Record<number, number> = {};
  const mem: Record<number, number> = {};
  const val = () => (Math.random() < 0.3 ? rnd(-200, -1) : rnd(1, 300));
  let asm = '';
  const pc = rnd(4, 40) * 4;
  switch (d.kind) {
    case 'alu':
      regs[rs1] = val();
      regs[rs2] = d.name.startsWith('s') && d.name !== 'sub' && d.name !== 'slt' && d.name !== 'sltu' ? rnd(1, 8) : val();
      asm = `${op} x${rd}, x${rs1}, x${rs2}`;
      break;
    case 'alui':
      regs[rs1] = val();
      asm = `${op} x${rd}, x${rs1}, ${rnd(-100, 100)}`;
      break;
    case 'shifti':
      regs[rs1] = val();
      asm = `${op} x${rd}, x${rs1}, ${rnd(1, 8)}`;
      break;
    case 'load': {
      const size = 1 << ((d.funct3 ?? 2) & 3);
      const base = DMEM_BASE + rnd(1, 60) * 16;
      const off = rnd(-2, 6) * size;
      regs[rs1] = base;
      mem[(base + off) & ~3] = (Math.random() * 0xffffffff) >>> 0;
      asm = `${op} x${rd}, ${off}(x${rs1})`;
      break;
    }
    case 'store': {
      const size = 1 << ((d.funct3 ?? 2) & 3);
      const base = DMEM_BASE + rnd(1, 60) * 16;
      const off = rnd(-2, 6) * size;
      regs[rs1] = base;
      regs[rs2] = (Math.random() * 0xffffffff) | 0;
      mem[(base + off) & ~3] = 0;
      asm = `${op} x${rs2}, ${off}(x${rs1})`;
      break;
    }
    case 'branch': {
      regs[rs1] = val();
      regs[rs2] = Math.random() < 0.4 ? regs[rs1] : val();
      asm = `${op} x${rs1}, x${rs2}, ${pick([-1, 1]) * rnd(2, 20) * 4}`;
      break;
    }
    case 'jal':
      asm = `jal x${rd}, ${pick([-1, 1]) * rnd(2, 20) * 4}`;
      break;
    case 'jalr':
      regs[rs1] = rnd(16, 120) * 4;
      asm = `jalr x${rd}, ${pick([0, 4, 8, -4])}(x${rs1})`;
      break;
    case 'lui':
      asm = `lui x${rd}, 0x${rnd(1, 0xfffff).toString(16)}`;
      break;
    case 'auipc':
      asm = `auipc x${rd}, 0x${rnd(0, 0x20).toString(16)}`;
      break;
  }
  return { asm, regs, mem, pc: d.kind === 'branch' || d.kind === 'jal' ? Math.max(pc, 160) : pc };
}

export const asmOf = (i: Instr) => disasm(i);
