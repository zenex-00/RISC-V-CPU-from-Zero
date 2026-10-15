// RV32I instruction table (unprivileged ISA, base integer subset taught here).
// ecall, ebreak, fence and CSR instructions are out of scope for this course.

export type Fmt = 'R' | 'I' | 'S' | 'B' | 'U' | 'J';

export type Kind =
  | 'alu' // R-type register-register
  | 'alui' // I-type register-immediate (non-shift)
  | 'shifti' // I-type shift by immediate
  | 'load'
  | 'store'
  | 'branch'
  | 'jal'
  | 'jalr'
  | 'lui'
  | 'auipc';

export type Mnemonic =
  | 'add' | 'sub' | 'sll' | 'slt' | 'sltu' | 'xor' | 'srl' | 'sra' | 'or' | 'and'
  | 'addi' | 'slti' | 'sltiu' | 'xori' | 'ori' | 'andi' | 'slli' | 'srli' | 'srai'
  | 'lb' | 'lh' | 'lw' | 'lbu' | 'lhu'
  | 'sb' | 'sh' | 'sw'
  | 'beq' | 'bne' | 'blt' | 'bge' | 'bltu' | 'bgeu'
  | 'jal' | 'jalr' | 'lui' | 'auipc';

export interface InstrDef {
  name: Mnemonic;
  fmt: Fmt;
  kind: Kind;
  opcode: number;
  funct3?: number;
  funct7?: number;
  /** Plain-English template. {rd} {rs1} {rs2} {imm} are substituted. */
  english: string;
  /** Generic register-transfer line. */
  rtl: string;
}

export const OPC = {
  OP: 0b0110011,
  OP_IMM: 0b0010011,
  LOAD: 0b0000011,
  STORE: 0b0100011,
  BRANCH: 0b1100011,
  JAL: 0b1101111,
  JALR: 0b1100111,
  LUI: 0b0110111,
  AUIPC: 0b0010111,
  MISC_MEM: 0b0001111,
  SYSTEM: 0b1110011,
  CUSTOM0: 0b0001011,
  CUSTOM1: 0b0101011,
} as const;

const R = (name: Mnemonic, f3: number, f7: number, english: string, rtl: string): InstrDef => ({
  name, fmt: 'R', kind: 'alu', opcode: OPC.OP, funct3: f3, funct7: f7, english, rtl,
});
const IA = (name: Mnemonic, f3: number, english: string, rtl: string): InstrDef => ({
  name, fmt: 'I', kind: 'alui', opcode: OPC.OP_IMM, funct3: f3, english, rtl,
});
const IS = (name: Mnemonic, f3: number, f7: number, english: string, rtl: string): InstrDef => ({
  name, fmt: 'I', kind: 'shifti', opcode: OPC.OP_IMM, funct3: f3, funct7: f7, english, rtl,
});
const L = (name: Mnemonic, f3: number, english: string, rtl: string): InstrDef => ({
  name, fmt: 'I', kind: 'load', opcode: OPC.LOAD, funct3: f3, english, rtl,
});
const S = (name: Mnemonic, f3: number, english: string, rtl: string): InstrDef => ({
  name, fmt: 'S', kind: 'store', opcode: OPC.STORE, funct3: f3, english, rtl,
});
const B = (name: Mnemonic, f3: number, english: string, rtl: string): InstrDef => ({
  name, fmt: 'B', kind: 'branch', opcode: OPC.BRANCH, funct3: f3, english, rtl,
});

export const ISA: InstrDef[] = [
  R('add', 0b000, 0b0000000, 'Add {rs1} and {rs2}; write the sum to {rd}.', 'R[rd] ← R[rs1] + R[rs2]'),
  R('sub', 0b000, 0b0100000, 'Subtract {rs2} from {rs1}; write the difference to {rd}.', 'R[rd] ← R[rs1] − R[rs2]'),
  R('sll', 0b001, 0b0000000, 'Shift {rs1} left by the low 5 bits of {rs2}; write to {rd}.', 'R[rd] ← R[rs1] << R[rs2][4:0]'),
  R('slt', 0b010, 0b0000000, 'Write 1 to {rd} if {rs1} < {rs2} as signed numbers, else 0.', 'R[rd] ← (R[rs1] <s R[rs2]) ? 1 : 0'),
  R('sltu', 0b011, 0b0000000, 'Write 1 to {rd} if {rs1} < {rs2} as unsigned numbers, else 0.', 'R[rd] ← (R[rs1] <u R[rs2]) ? 1 : 0'),
  R('xor', 0b100, 0b0000000, 'Bitwise XOR of {rs1} and {rs2}; write to {rd}.', 'R[rd] ← R[rs1] ^ R[rs2]'),
  R('srl', 0b101, 0b0000000, 'Shift {rs1} right by the low 5 bits of {rs2}, filling with zeros; write to {rd}.', 'R[rd] ← R[rs1] >>u R[rs2][4:0]'),
  R('sra', 0b101, 0b0100000, 'Shift {rs1} right by the low 5 bits of {rs2}, copying the sign bit; write to {rd}.', 'R[rd] ← R[rs1] >>s R[rs2][4:0]'),
  R('or', 0b110, 0b0000000, 'Bitwise OR of {rs1} and {rs2}; write to {rd}.', 'R[rd] ← R[rs1] | R[rs2]'),
  R('and', 0b111, 0b0000000, 'Bitwise AND of {rs1} and {rs2}; write to {rd}.', 'R[rd] ← R[rs1] & R[rs2]'),

  IA('addi', 0b000, 'Add the immediate {imm} to {rs1}; write the sum to {rd}.', 'R[rd] ← R[rs1] + SignExt(imm)'),
  IA('slti', 0b010, 'Write 1 to {rd} if {rs1} < {imm} as signed numbers, else 0.', 'R[rd] ← (R[rs1] <s SignExt(imm)) ? 1 : 0'),
  IA('sltiu', 0b011, 'Write 1 to {rd} if {rs1} < the sign-extended immediate as unsigned numbers, else 0.', 'R[rd] ← (R[rs1] <u SignExt(imm)) ? 1 : 0'),
  IA('xori', 0b100, 'Bitwise XOR of {rs1} and the immediate {imm}; write to {rd}.', 'R[rd] ← R[rs1] ^ SignExt(imm)'),
  IA('ori', 0b110, 'Bitwise OR of {rs1} and the immediate {imm}; write to {rd}.', 'R[rd] ← R[rs1] | SignExt(imm)'),
  IA('andi', 0b111, 'Bitwise AND of {rs1} and the immediate {imm}; write to {rd}.', 'R[rd] ← R[rs1] & SignExt(imm)'),
  IS('slli', 0b001, 0b0000000, 'Shift {rs1} left by {imm}; write to {rd}.', 'R[rd] ← R[rs1] << shamt'),
  IS('srli', 0b101, 0b0000000, 'Shift {rs1} right by {imm}, filling with zeros; write to {rd}.', 'R[rd] ← R[rs1] >>u shamt'),
  IS('srai', 0b101, 0b0100000, 'Shift {rs1} right by {imm}, copying the sign bit; write to {rd}.', 'R[rd] ← R[rs1] >>s shamt'),

  L('lb', 0b000, 'Load the byte at address {rs1} + {imm}, sign-extend it, and write it to {rd}.', 'R[rd] ← SignExt(M[R[rs1] + SignExt(imm)][7:0])'),
  L('lh', 0b001, 'Load the halfword at address {rs1} + {imm}, sign-extend it, and write it to {rd}.', 'R[rd] ← SignExt(M[R[rs1] + SignExt(imm)][15:0])'),
  L('lw', 0b010, 'Load the word at address {rs1} + {imm} into {rd}.', 'R[rd] ← M[R[rs1] + SignExt(imm)]'),
  L('lbu', 0b100, 'Load the byte at address {rs1} + {imm}, zero-extend it, and write it to {rd}.', 'R[rd] ← ZeroExt(M[R[rs1] + SignExt(imm)][7:0])'),
  L('lhu', 0b101, 'Load the halfword at address {rs1} + {imm}, zero-extend it, and write it to {rd}.', 'R[rd] ← ZeroExt(M[R[rs1] + SignExt(imm)][15:0])'),

  S('sb', 0b000, 'Store the low byte of {rs2} at address {rs1} + {imm}.', 'M[R[rs1] + SignExt(imm)][7:0] ← R[rs2][7:0]'),
  S('sh', 0b001, 'Store the low halfword of {rs2} at address {rs1} + {imm}.', 'M[R[rs1] + SignExt(imm)][15:0] ← R[rs2][15:0]'),
  S('sw', 0b010, 'Store the word in {rs2} at address {rs1} + {imm}.', 'M[R[rs1] + SignExt(imm)] ← R[rs2]'),

  B('beq', 0b000, 'If {rs1} equals {rs2}, jump to PC {imm}; otherwise go to the next instruction.', 'if (R[rs1] == R[rs2]) PC ← PC + imm'),
  B('bne', 0b001, 'If {rs1} does not equal {rs2}, jump to PC {imm}.', 'if (R[rs1] != R[rs2]) PC ← PC + imm'),
  B('blt', 0b100, 'If {rs1} < {rs2} as signed numbers, jump to PC {imm}.', 'if (R[rs1] <s R[rs2]) PC ← PC + imm'),
  B('bge', 0b101, 'If {rs1} ≥ {rs2} as signed numbers, jump to PC {imm}.', 'if (R[rs1] ≥s R[rs2]) PC ← PC + imm'),
  B('bltu', 0b110, 'If {rs1} < {rs2} as unsigned numbers, jump to PC {imm}.', 'if (R[rs1] <u R[rs2]) PC ← PC + imm'),
  B('bgeu', 0b111, 'If {rs1} ≥ {rs2} as unsigned numbers, jump to PC {imm}.', 'if (R[rs1] ≥u R[rs2]) PC ← PC + imm'),

  { name: 'jal', fmt: 'J', kind: 'jal', opcode: OPC.JAL, english: 'Save the return address PC + 4 in {rd}, then jump to PC {imm}.', rtl: 'R[rd] ← PC + 4;  PC ← PC + imm' },
  { name: 'jalr', fmt: 'I', kind: 'jalr', opcode: OPC.JALR, funct3: 0, english: 'Save PC + 4 in {rd}, then jump to {rs1} + {imm} with bit 0 cleared.', rtl: 'R[rd] ← PC + 4;  PC ← (R[rs1] + SignExt(imm)) & ~1' },
  { name: 'lui', fmt: 'U', kind: 'lui', opcode: OPC.LUI, english: 'Write the 20-bit immediate into the upper bits of {rd}; the low 12 bits become 0.', rtl: 'R[rd] ← imm[31:12] << 12' },
  { name: 'auipc', fmt: 'U', kind: 'auipc', opcode: OPC.AUIPC, english: 'Add the upper immediate to the PC and write the sum to {rd}.', rtl: 'R[rd] ← PC + (imm[31:12] << 12)' },
];

export const DEF: Record<Mnemonic, InstrDef> = Object.fromEntries(ISA.map((d) => [d.name, d])) as Record<Mnemonic, InstrDef>;

export const MNEMONICS = ISA.map((d) => d.name);

export const ABI = [
  'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1',
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
  't3', 't4', 't5', 't6',
];

/** Field kinds used for consistent colouring across the whole app. */
export type FieldKind = 'opcode' | 'rd' | 'funct3' | 'rs1' | 'rs2' | 'funct7' | 'imm';

export interface FieldSpan {
  kind: FieldKind;
  hi: number;
  lo: number;
  /** Label as textbooks print it, e.g. imm[11:5] or rs1. */
  label: string;
}

/** Field layout per format, from bit 31 down to bit 0. */
export const LAYOUT: Record<Fmt, FieldSpan[]> = {
  R: [
    { kind: 'funct7', hi: 31, lo: 25, label: 'funct7' },
    { kind: 'rs2', hi: 24, lo: 20, label: 'rs2' },
    { kind: 'rs1', hi: 19, lo: 15, label: 'rs1' },
    { kind: 'funct3', hi: 14, lo: 12, label: 'funct3' },
    { kind: 'rd', hi: 11, lo: 7, label: 'rd' },
    { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
  ],
  I: [
    { kind: 'imm', hi: 31, lo: 20, label: 'imm[11:0]' },
    { kind: 'rs1', hi: 19, lo: 15, label: 'rs1' },
    { kind: 'funct3', hi: 14, lo: 12, label: 'funct3' },
    { kind: 'rd', hi: 11, lo: 7, label: 'rd' },
    { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
  ],
  S: [
    { kind: 'imm', hi: 31, lo: 25, label: 'imm[11:5]' },
    { kind: 'rs2', hi: 24, lo: 20, label: 'rs2' },
    { kind: 'rs1', hi: 19, lo: 15, label: 'rs1' },
    { kind: 'funct3', hi: 14, lo: 12, label: 'funct3' },
    { kind: 'imm', hi: 11, lo: 7, label: 'imm[4:0]' },
    { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
  ],
  B: [
    { kind: 'imm', hi: 31, lo: 25, label: 'imm[12|10:5]' },
    { kind: 'rs2', hi: 24, lo: 20, label: 'rs2' },
    { kind: 'rs1', hi: 19, lo: 15, label: 'rs1' },
    { kind: 'funct3', hi: 14, lo: 12, label: 'funct3' },
    { kind: 'imm', hi: 11, lo: 7, label: 'imm[4:1|11]' },
    { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
  ],
  U: [
    { kind: 'imm', hi: 31, lo: 12, label: 'imm[31:12]' },
    { kind: 'rd', hi: 11, lo: 7, label: 'rd' },
    { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
  ],
  J: [
    { kind: 'imm', hi: 31, lo: 12, label: 'imm[20|10:1|11|19:12]' },
    { kind: 'rd', hi: 11, lo: 7, label: 'rd' },
    { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
  ],
};

/** I-type shifts split the immediate field into funct7 and shamt. */
export const LAYOUT_SHIFTI: FieldSpan[] = [
  { kind: 'funct7', hi: 31, lo: 25, label: 'funct7' },
  { kind: 'imm', hi: 24, lo: 20, label: 'shamt' },
  { kind: 'rs1', hi: 19, lo: 15, label: 'rs1' },
  { kind: 'funct3', hi: 14, lo: 12, label: 'funct3' },
  { kind: 'rd', hi: 11, lo: 7, label: 'rd' },
  { kind: 'opcode', hi: 6, lo: 0, label: 'opcode' },
];

export function layoutFor(def: InstrDef): FieldSpan[] {
  return def.kind === 'shifti' ? LAYOUT_SHIFTI : LAYOUT[def.fmt];
}

export const regName = (r: number): string => 'x' + r;
