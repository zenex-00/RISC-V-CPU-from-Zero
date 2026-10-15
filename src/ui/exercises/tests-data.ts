// Fixed test instructions used by the break-the-circuit and design exercises.
import type { Mnemonic } from '../../sim/isa';
import type { Example } from '../../lessons/types';

export const TESTS: { name: string; op: Mnemonic; e: Example }[] = [
  { name: 'add', op: 'add', e: { asm: 'add x5, x6, x7', regs: { 6: 23, 7: 19 } } },
  { name: 'addi', op: 'addi', e: { asm: 'addi x5, x6, -12', regs: { 6: 40 } } },
  { name: 'lw', op: 'lw', e: { asm: 'lw x5, 8(x6)', regs: { 6: 0x1000 }, mem: { 0x1008: 1234 } } },
  { name: 'lb', op: 'lb', e: { asm: 'lb x5, 1(x6)', regs: { 6: 0x1000 }, mem: { 0x1000: 0x12348056 } } },
  { name: 'sw', op: 'sw', e: { asm: 'sw x7, 12(x6)', regs: { 6: 0x1000, 7: 0x12345678 }, mem: { 0x100c: 0xaaaaaaaa } } },
  { name: 'sb', op: 'sb', e: { asm: 'sb x7, 13(x6)', regs: { 6: 0x1000, 7: 0x12345678 }, mem: { 0x100c: 0xaaaaaaaa } } },
  { name: 'beq (taken)', op: 'beq', e: { asm: 'beq x5, x6, +16', pc: 0x10, regs: { 5: 7, 6: 7 } } },
  { name: 'beq (not taken)', op: 'beq', e: { asm: 'beq x5, x6, +16', pc: 0x10, regs: { 5: 7, 6: 9 } } },
  { name: 'blt (taken)', op: 'blt', e: { asm: 'blt x5, x6, +12', pc: 0x10, regs: { 5: -3, 6: 2 } } },
  { name: 'jal', op: 'jal', e: { asm: 'jal x1, +64', pc: 0x10 } },
  { name: 'jalr', op: 'jalr', e: { asm: 'jalr x0, 0(x1)', pc: 0x58, regs: { 1: 0x14 } } },
  { name: 'lui', op: 'lui', e: { asm: 'lui x5, 0x12345', pc: 0x10 } },
  { name: 'auipc', op: 'auipc', e: { asm: 'auipc x5, 0x1', pc: 0x10 } },
];

