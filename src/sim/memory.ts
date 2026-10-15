// Memories and the load/store alignment logic.
// Harvard organisation: instruction memory and data memory are separate.
// IMEM: 0x0000_0000 .. 0x0000_0FFF (1024 words, read-only during execution)
// DMEM: 0x0000_1000 .. 0x0000_1FFF (4 KiB, byte-addressed, little-endian)
// The memory arrays are word-wide. A word read returns the aligned word;
// the load-extend unit picks the byte or halfword, and the store unit
// drives byte enables, exactly as a real 32-bit memory interface does.

import { signExtend, u32, hex } from './bits';

export const IMEM_BASE = 0x0000_0000;
export const IMEM_WORDS = 1024;
export const DMEM_BASE = 0x0000_1000;
export const DMEM_BYTES = 4096;

export function inDmem(addr: number): boolean {
  addr = u32(addr);
  return addr >= DMEM_BASE && addr < DMEM_BASE + DMEM_BYTES;
}

export class DataMemory {
  readonly bytes: Uint8Array;
  constructor(src?: Uint8Array) {
    this.bytes = src ? new Uint8Array(src) : new Uint8Array(DMEM_BYTES);
  }
  clone(): DataMemory {
    return new DataMemory(this.bytes);
  }
  /** Read the aligned word that contains addr. Caller checks range. */
  readWord(addr: number): number {
    const o = (u32(addr) - DMEM_BASE) & ~3;
    const b = this.bytes;
    return u32(b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24));
  }
  /** Write the lanes of `data` selected by the 4-bit byte enable. */
  writeWord(addr: number, data: number, be: number): void {
    const o = (u32(addr) - DMEM_BASE) & ~3;
    for (let i = 0; i < 4; i++) if ((be >> i) & 1) this.bytes[o + i] = (data >>> (8 * i)) & 0xff;
  }
  readByte(addr: number): number {
    return this.bytes[u32(addr) - DMEM_BASE];
  }
  setWord(addr: number, v: number): void {
    this.writeWord(addr, v, 0b1111);
  }
}

export type MemFault = string | null;

/** Size and alignment check for a data access. funct3[1:0]: 00 byte, 01 half, 10 word. */
export function checkAccess(addr: number, funct3: number, isStore: boolean): MemFault {
  addr = u32(addr);
  const size = funct3 & 3;
  const what = isStore ? 'store' : 'load';
  if (size === 3) return `funct3 ${funct3.toString(2).padStart(3, '0')} is not a valid ${what} size`;
  const bytes = 1 << size;
  if (!inDmem(addr) || !inDmem(addr + bytes - 1))
    return `${what} address ${hex(addr)} is outside data memory (${hex(DMEM_BASE)}..${hex(DMEM_BASE + DMEM_BYTES - 1)})`;
  if (addr % bytes !== 0)
    return `misaligned ${what}: a ${bytes}-byte access needs an address that is a multiple of ${bytes}, got ${hex(addr)}`;
  return null;
}

/**
 * Load-extend unit. Picks the byte or halfword lane given by addr[1:0] and
 * extends it. funct3: 000 lb, 001 lh, 010 lw, 100 lbu, 101 lhu.
 */
export function loadExtend(word: number, offset: number, funct3: number): number {
  const sh = 8 * (offset & 3);
  switch (funct3) {
    case 0b000:
      return u32(signExtend((word >>> sh) & 0xff, 8));
    case 0b001:
      return u32(signExtend((word >>> sh) & 0xffff, 16));
    case 0b100:
      return (word >>> sh) & 0xff;
    case 0b101:
      return (word >>> sh) & 0xffff;
    default:
      return u32(word);
  }
}

/**
 * Store unit. Replicates the low byte/halfword of rs2 across the lanes and
 * produces the byte enables BE[3:0] from addr[1:0] and funct3.
 */
export function storeAlign(rs2: number, offset: number, funct3: number): { wd: number; be: number } {
  const o = offset & 3;
  switch (funct3 & 3) {
    case 0: {
      const b = rs2 & 0xff;
      return { wd: u32(b * 0x01010101), be: 1 << o };
    }
    case 1: {
      const h = rs2 & 0xffff;
      return { wd: u32(h * 0x00010001), be: (0b0011 << (o & 2)) & 0xf };
    }
    default:
      return { wd: u32(rs2), be: 0b1111 };
  }
}
