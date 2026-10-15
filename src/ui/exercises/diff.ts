// Architectural outcome of one cycle, and a readable difference between two.
import type { Trace } from '../../sim/datapath';
import { hex } from '../../sim/bits';

export interface Outcome {
  reg: string | null;
  mem: string | null;
  pc: string;
  fault: string | null;
}

export function outcome(t: Trace): Outcome {
  return {
    reg: t.regWrite && !t.regWrite.ignored ? `x${t.regWrite.r} = ${hex(t.regWrite.v)}` : null,
    mem: t.memWrite ? `M[${hex(t.memWrite.addr)}] bytes ${t.memWrite.be.toString(2).padStart(4, '0')} ← ${hex(t.memWrite.data)}` : null,
    pc: hex(t.PCNext),
    fault: t.fault,
  };
}

export const same = (a: Outcome, b: Outcome) => a.reg === b.reg && a.mem === b.mem && a.pc === b.pc && a.fault === b.fault;

export function describeDiff(ref: Trace, got: Trace): string[] {
  const a = outcome(ref);
  const b = outcome(got);
  const out: string[] = [];
  if (b.fault && b.fault !== a.fault) out.push(`the circuit faults: ${b.fault}`);
  if (a.reg !== b.reg) {
    if (!b.reg) out.push(`${a.reg ?? 'no register'} should be written, but nothing is written`);
    else if (!a.reg) out.push(`a register should not change, but ${b.reg} is written`);
    else out.push(`${a.reg.split(' =')[0]} should get ${a.reg.split('= ')[1]}, but the circuit writes ${b.reg}`);
  }
  if (a.mem !== b.mem) {
    if (!b.mem) out.push(`memory should be written (${a.mem}), but it is not`);
    else if (!a.mem) out.push(`memory should not change, but the circuit writes ${b.mem}`);
    else out.push(`memory should get ${a.mem}, but the circuit writes ${b.mem}`);
  }
  if (a.pc !== b.pc) out.push(`the next PC should be ${a.pc}, but it is ${b.pc}`);
  return out;
}

