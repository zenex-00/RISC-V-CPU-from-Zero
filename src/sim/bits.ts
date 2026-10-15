// Bit-level helpers. All values are JS numbers holding 32-bit patterns.
// u32() views a pattern as unsigned, s32() as two's-complement signed.

export const u32 = (x: number): number => x >>> 0;
export const s32 = (x: number): number => x | 0;

/** Extract bits hi..lo (inclusive) of x as an unsigned number. */
export function bits(x: number, hi: number, lo: number): number {
  const w = hi - lo + 1;
  if (w >= 32) return x >>> 0;
  return ((x >>> lo) & (2 ** w - 1)) >>> 0;
}

/** Bit i of x (0 or 1). */
export const bit = (x: number, i: number): number => (x >>> i) & 1;

/** Sign-extend the low `width` bits of v to 32 bits (signed result). */
export function signExtend(v: number, width: number): number {
  const shift = 32 - width;
  return (v << shift) >> shift;
}

export function hex(x: number, digits = 8): string {
  return '0x' + (x >>> 0).toString(16).padStart(digits, '0');
}

export function bin(x: number, width: number): string {
  return (x >>> 0).toString(2).padStart(32, '0').slice(32 - width);
}

/** Format a value as signed decimal. */
export const dec = (x: number): string => String(x | 0);

/** Signed offset with explicit sign: +16, -8, +0. */
export const signed = (x: number): string => ((x | 0) >= 0 ? '+' : '') + (x | 0);
