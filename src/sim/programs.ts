// Sample programs used by the complete-machine lesson, the sandbox and the tests.

import type { MachineState } from './datapath';
import { DMEM_BASE } from './memory';

export interface Program {
  id: string;
  name: string;
  description: string;
  source: string;
  setup?: (s: MachineState) => void;
  /** Returns an error message, or null when the final state is right. */
  check: (s: MachineState) => string | null;
}

const expect = (got: number, want: number, what: string): string | null =>
  got >>> 0 === want >>> 0 ? null : `${what}: expected ${want >>> 0}, got ${got >>> 0}`;

export const PROGRAMS: Program[] = [
  {
    id: 'sum',
    name: 'Sum 1 to 10 (loop)',
    description: 'A counted loop: add, addi and a backward blt.',
    source: `# Sum the integers 1..10 into a0.
        li   t0, 1          # i = 1
        li   t1, 11         # loop limit
        li   a0, 0          # sum = 0
loop:   add  a0, a0, t0     # sum = sum + i
        addi t0, t0, 1      # i = i + 1
        blt  t0, t1, loop   # repeat while i < 11
done:   j    done           # stop: jump to self
`,
    check: (s) => expect(s.regs[10], 55, 'a0 (x10)'),
  },
  {
    id: 'call',
    name: 'Function call (jal / jalr)',
    description: 'main calls sum_to(10), stores the result to memory and reads it back.',
    source: `# main: call sum_to(10), store the result, read it back.
main:   li   a0, 10         # argument n = 10
        jal  ra, sum_to     # call: ra = return address
        lui  t2, 0x1        # t2 = 0x1000, start of data memory
        sw   a0, 0(t2)      # store the result
        lw   a1, 0(t2)      # load it back into a1
halt:   j    halt           # stop

# sum_to(n): return 1 + 2 + ... + n in a0
sum_to: li   t0, 1          # i = 1
        li   t1, 0          # sum = 0
loop:   add  t1, t1, t0     # sum = sum + i
        addi t0, t0, 1      # i = i + 1
        bge  a0, t0, loop   # while n >= i
        mv   a0, t1         # return value
        jalr x0, 0(ra)      # return to the caller
`,
    check: (s) =>
      expect(s.regs[10], 55, 'a0') ?? expect(s.regs[11], 55, 'a1') ?? expect(s.dmem.readWord(DMEM_BASE), 55, 'mem[0x1000]') ?? expect(s.regs[1], 8, 'ra'),
  },
  {
    id: 'bytes',
    name: 'Bytes and halfwords',
    description: 'sb, sh, lb, lbu, lh, lhu on the same word.',
    source: `# Byte and halfword access at 0x1000.
        lui  s0, 0x1        # s0 = 0x1000
        li   t0, -128       # 0xFFFFFF80
        sb   t0, 1(s0)      # byte 1 = 0x80
        li   t1, 0x1234
        sh   t1, 2(s0)      # bytes 3:2 = 0x1234
        lw   a0, 0(s0)      # a0 = 0x12348000
        lb   a1, 1(s0)      # a1 = -128 (sign-extended)
        lbu  a2, 1(s0)      # a2 = 128 (zero-extended)
        lh   a3, 0(s0)      # a3 = 0xFFFF8000
        lhu  a4, 2(s0)      # a4 = 0x1234
end:    j    end
`,
    check: (s) =>
      expect(s.regs[10], 0x12348000, 'a0') ?? expect(s.regs[11], -128, 'a1') ?? expect(s.regs[12], 128, 'a2') ??
      expect(s.regs[13], 0xffff8000, 'a3') ?? expect(s.regs[14], 0x1234, 'a4'),
  },
  {
    id: 'compare',
    name: 'Signed versus unsigned',
    description: 'The same bits compared two ways.',
    source: `# -1 is 0xFFFFFFFF: smallest signed, largest unsigned.
        li   t0, -1
        li   t1, 1
        slt  a0, t0, t1     # signed: -1 < 1 -> 1
        sltu a1, t0, t1     # unsigned: 0xFFFFFFFF < 1 -> 0
        li   a2, 0
        bltu t0, t1, skip   # not taken
        li   a2, 7
skip:   j    skip
`,
    check: (s) => expect(s.regs[10], 1, 'a0') ?? expect(s.regs[11], 0, 'a1') ?? expect(s.regs[12], 7, 'a2'),
  },
  {
    id: 'upper',
    name: 'lui, auipc and shifts',
    description: 'Build constants and compute a PC-relative address.',
    source: `# lui/auipc and shifts.
        lui  a0, 0xABCDE    # a0 = 0xABCDE000
        srai a1, a0, 12     # arithmetic shift keeps the sign
        srli a2, a0, 12     # logical shift fills with zeros
        auipc a3, 0         # a3 = PC of this instruction = 12
        li   t0, 4
        sll  a4, t0, t0     # 4 << 4 = 64
        sub  a5, x0, t0     # -4
        sra  a6, a5, t0     # -4 >> 4 = -1
end:    j    end
`,
    check: (s) =>
      expect(s.regs[10], 0xabcde000, 'a0') ?? expect(s.regs[11], 0xfffabcde, 'a1') ?? expect(s.regs[12], 0x000abcde, 'a2') ??
      expect(s.regs[13], 12, 'a3') ?? expect(s.regs[14], 64, 'a4') ?? expect(s.regs[16], -1, 'a6'),
  },
];
