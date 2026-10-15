// Reading and formatting wire values from a simulator trace.

import { ALU_NAME } from '../sim/alu';
import { bits, hex } from '../sim/bits';
import type { Trace } from '../sim/datapath';
import type { ValueFmt } from './layout';

export function sigValue(t: Trace, sig: string): number | string | null {
  if (sig.startsWith('ctrl.')) {
    const k = sig.slice(5) as keyof Trace['ctrl'];
    const v = t.ctrl[k];
    return v === undefined ? null : (v as number | string);
  }
  switch (sig) {
    case 'FOUR':
      return 4;
    case 'ZERO':
      return 0;
    case 'CLK':
      return null;
    case 'rs1':
      return t.f.rs1;
    case 'rs2':
      return t.f.rs2;
    case 'rd':
      return t.f.rd;
    case 'opcode':
      return t.f.opcode;
    case 'funct3':
      return t.f.funct3;
    case 'b30':
      return t.b30;
    case 'Instr31_7':
      return bits(t.Instr, 31, 7);
    case 'Off':
      return t.MemAddr & 3;
    case 'ALUControl':
      return t.ALUControl;
    default: {
      const v = (t as unknown as Record<string, unknown>)[sig];
      return typeof v === 'number' ? v : null;
    }
  }
}

export function fmtValue(v: number | string | null, fmt: ValueFmt, t?: Trace): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  switch (fmt) {
    case 'hex':
      return hex(v);
    case 'dec': {
      const s = v | 0;
      return s >= -9999999 && s <= 99999999 ? String(s) : hex(v);
    }
    case 'udec':
      return String(v >>> 0);
    case 'imm':
      if (t && t.ctrl.ImmSrc === 'U') return hex(v);
      return fmtValue(v, 'dec');
    case 'bit':
      return String(v & 1);
    case 'reg':
      return 'x' + v;
    case 'bin2':
      return (v & 3).toString(2).padStart(2, '0');
    case 'bin3':
      return (v & 7).toString(2).padStart(3, '0');
    case 'be':
      return (v & 15).toString(2).padStart(4, '0');
    case 'alu':
      return ALU_NAME[v] ?? (v & 15).toString(2).padStart(4, '0');
    case 'immsrc':
      return String(v);
  }
}

/** How a control/net label shows its value, and the longest such text. */
export const NET_FMT: Record<string, { fmt: ValueFmt; chars: number }> = {
  'ctrl.RegWrite': { fmt: 'bit', chars: 1 },
  'ctrl.ImmSrc': { fmt: 'immsrc', chars: 1 },
  'ctrl.ALUSrcA': { fmt: 'bin2', chars: 2 },
  'ctrl.ALUSrc': { fmt: 'bit', chars: 1 },
  'ctrl.MemRead': { fmt: 'bit', chars: 1 },
  'ctrl.MemWrite': { fmt: 'bit', chars: 1 },
  'ctrl.ResultSrc': { fmt: 'bin2', chars: 2 },
  'ctrl.Branch': { fmt: 'bit', chars: 1 },
  'ctrl.Jump': { fmt: 'bit', chars: 1 },
  'ctrl.PCTargetSrc': { fmt: 'bit', chars: 1 },
  ALUControl: { fmt: 'alu', chars: 4 },
  PCSrc: { fmt: 'bit', chars: 1 },
  funct3: { fmt: 'bin3', chars: 3 },
};

export function netText(name: string, sig: string, t: Trace | null): string {
  const f = NET_FMT[sig];
  if (!t || !f) return name;
  return `${name}=${fmtValue(sigValue(t, sig), f.fmt, t)}`;
}

/** Longest label text a net stub can show (for the layout checker). */
export function netTextMax(name: string, sig: string): string {
  const f = NET_FMT[sig];
  return f ? `${name}=${'x'.repeat(f.chars)}` : name;
}
