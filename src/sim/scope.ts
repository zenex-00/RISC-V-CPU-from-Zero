// Which instructions the circuit can run at each build level, and why not.

import { DEF, type Mnemonic } from './isa';

const LEVEL_OF_KIND: Record<string, number> = {
  alu: 2, alui: 3, shifti: 3, load: 4, store: 5, branch: 7, jal: 8, jalr: 8, lui: 9, auipc: 9,
};

export function levelNeeded(op: Mnemonic): number {
  if (op === 'beq') return 6;
  return LEVEL_OF_KIND[DEF[op].kind];
}

export const LEVEL_REASON: Record<number, string> = {
  2: 'the register file and ALU (Lesson 2)',
  3: 'the immediate generator and ALUSrc mux (Lesson 3)',
  4: 'data memory and the result mux (Lesson 4)',
  5: 'the store path (Lesson 5)',
  6: 'the branch adder and PC mux (Lesson 6)',
  7: 'the branch condition logic (Lesson 7)',
  8: 'the jump hardware (Lesson 8)',
  9: 'the SrcA mux (Lesson 9)',
};

export function canRun(op: Mnemonic, level: number): boolean {
  return levelNeeded(op) <= level;
}
