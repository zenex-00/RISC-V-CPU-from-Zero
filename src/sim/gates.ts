// Gate-level main decoder: each control signal as a sum of products of the
// opcode bits b6..b2 (bits 1:0 are always 11 for 32-bit instructions).
// Don't-care rows were used to simplify. A unit test checks every equation
// against MAIN_TABLE for all nine opcodes.

export interface Term {
  /** Literals: [bit, value] pairs, e.g. [[6,1],[2,0]] = b6·¬b2. */
  lits: [number, 0 | 1][];
}

export interface Equation {
  signal: string;
  terms: Term[];
  /** Invert the sum (used for RegWrite = ¬(b5·¬b4·¬b2)). */
  invert?: boolean;
  note: string;
}

const t = (...lits: [number, 0 | 1][]): Term => ({ lits });

export const EQUATIONS: Equation[] = [
  { signal: 'RegWrite', terms: [t([5, 1], [4, 0], [2, 0])], invert: true, note: 'Only store (01000) and branch (11000) have b5 = 1, b4 = 0, b2 = 0.' },
  { signal: 'MemRead', terms: [t([6, 0], [5, 0], [4, 0])], note: 'Load (00000) is the only opcode with b6 = b5 = b4 = 0.' },
  { signal: 'MemWrite', terms: [t([6, 0], [5, 1], [4, 0])], note: 'Store is 01000.' },
  { signal: 'Branch', terms: [t([6, 1], [2, 0])], note: 'Branch is 11000; jal and jalr (also b6 = 1) have b2 = 1.' },
  { signal: 'Jump', terms: [t([6, 1], [2, 1])], note: 'jal 11011 and jalr 11001.' },
  { signal: 'PCTargetSrc', terms: [t([6, 1], [3, 0], [2, 1])], note: 'jalr 11001; jal has b3 = 1. A don\'t-care for non-jumps.' },
  { signal: 'ALUSrc', terms: [t([2, 1]), t([6, 0], [5, 0]), t([6, 0], [4, 0])], note: 'B = imm for every opcode except R-type (01100) and branch (11000). jal is a don\'t-care.' },
  { signal: 'ResultSrc[1]', terms: [t([6, 1], [2, 1])], note: 'PC + 4 for jal and jalr: the same function as Jump.' },
  { signal: 'ResultSrc[0]', terms: [t([6, 0], [5, 0], [4, 0])], note: 'Memory data for loads: the same function as MemRead.' },
  { signal: 'ALUSrcA[1]', terms: [t([5, 1], [4, 1], [2, 1])], note: 'Constant 0 for lui (01101).' },
  { signal: 'ALUSrcA[0]', terms: [t([5, 0], [4, 1], [2, 1])], note: 'PC for auipc (00101).' },
  { signal: 'ALUOp[1]', terms: [t([4, 1], [2, 0])], note: 'R-type 01100 and I-type ALU 00100 use funct3.' },
  { signal: 'ALUOp[0]', terms: [t([6, 1], [2, 0]), t([5, 0], [4, 1], [2, 0])], note: 'Branch (01) and I-type ALU (11).' },
  { signal: 'ImmSrc[2]', terms: [t([4, 1], [2, 1])], note: 'U-type (lui 01101, auipc 00101). R-type is a don\'t-care.' },
  { signal: 'ImmSrc[1]', terms: [t([6, 1], [3, 1]), t([6, 1], [2, 0])], note: 'B (010) for branch and J (011) for jal.' },
  { signal: 'ImmSrc[0]', terms: [t([6, 0], [5, 1], [4, 0]), t([6, 1], [3, 1])], note: 'S (001) for store and J (011) for jal.' },
];

export function evalEquation(eq: Equation, opcode: number): number {
  const bit = (i: number) => (opcode >> i) & 1;
  const sum = eq.terms.some((term) => term.lits.every(([i, v]) => bit(i) === v)) ? 1 : 0;
  return eq.invert ? 1 - sum : sum;
}

export function termText(term: Term): string {
  return term.lits.map(([i, v]) => (v ? `b${i}` : `¬b${i}`)).join('·');
}

export function equationText(eq: Equation): string {
  const s = eq.terms.map(termText).join(' + ');
  return eq.invert ? `¬(${s})` : s;
}
