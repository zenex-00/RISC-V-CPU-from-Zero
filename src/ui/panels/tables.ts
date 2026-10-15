import { aluDecode } from '../../sim/control';
export { ALU_NAME } from '../../sim/alu';

/** ALU decoder as a function of (funct3, bit30) for a fixed ALUOp. */
export const aluDecodeTable = (aluOp: number) => (funct3: number, b30: number) => aluDecode(aluOp, funct3, b30);
