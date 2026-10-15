# Build a RISC-V CPU from Zero

An interactive course on the RV32I single-cycle processor. It starts from an almost empty circuit and adds one block at a time, each when an instruction needs it, until the complete datapath and control unit appear in Lesson 11.

Every value shown on the diagram comes from a tested simulator of the same circuit.

## Use the course

Open `dist/index.html` in Chrome, Edge or Firefox. It runs from disk: no server, no install, no internet. See `dist/RUN-ME.txt` for troubleshooting.

## What is inside

- **15 lessons:** warm-up, fetch, R-type, I-type, loads, stores, branches (two lessons), jumps, lui and auipc, the control unit, the complete machine, timing, Verilog, and interview preparation.
- **Every instruction at four linked levels:** plain English, assembly, register transfer, and the 32 bits split into colour-coded fields.
- **Exercises:** predict-then-reveal, encode and decode by hand, set the control signals, trace the path, build mode, break the circuit, draw from memory, and design challenges (add a new instruction).
- **Tools:** a program runner with breakpoints and a register and memory view, a free sandbox, a timing lab, a Verilog view linked to the diagram, a control unit lab, a spaced review deck and a final assessment.

Scope: the 37 RV32I base instructions. ecall, ebreak, fence and the CSR instructions are out of scope.

## Build from source

You need Node.js 20 or newer. From the repository folder, run:

```
npm install
npm run build
```

This writes a fresh `dist/`. Run `npm test` for the unit tests, which cover the simulator, the diagram layout, the lesson content and the exercises. The same tests also run in the browser from `dist/tests.html`.

See `BUILD.md` for how the build works and a map of the source.
