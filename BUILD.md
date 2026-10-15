# Building "Build a RISC-V CPU from Zero"

This file is for whoever rebuilds the course from source. A learner does not
need any of it: they only need the built folder (`dist/`) and a browser.

## What you get

```
RIS5/
  src/            source code (TypeScript, Preact, CSS)
  scripts/        build.mjs, the build script
  dist/           the built course: copy this folder to the learner
  package.json    dependencies and npm scripts
  BUILD.md        this file
  RUN-ME.txt      the learner's instructions (copied into dist/)
```

`dist/` is self-contained and works when opened from disk (`file://`): no
server, no network, no install. It is about 0.7 MB.

## What to install (build machine only)

- **Node.js 20 or newer** (includes npm). Download from nodejs.org.

Nothing else. The build uses esbuild (bundler) and TypeScript (type checking);
the only runtime library is Preact. npm installs all three.

## Commands

From the `RIS5` folder:

```
npm install
npm run build
```

`npm run build` writes a fresh `dist/`. Copy the whole `dist/` folder to the
learner's computer (a USB stick or a .zip is fine; it must be extracted).

Optional:

```
npm test            # runs all unit tests in Node (simulator, layout, lessons, exercises)
npm run typecheck   # strict TypeScript check
npm run check:layout  # prints any diagram layout problem and the wire crossings
```

The same unit tests also run in the browser: open `dist/tests.html`.

If npm 11 prints "allow-scripts" warnings during `npm install`, they are
harmless: esbuild's optional platform package installs without its
post-install script.

## How the build works

- `src/ui/main.tsx` is bundled into one classic script, `dist/assets/app.js`
  (no `type="module"`, no dynamic imports, no `fetch`), because those fail on
  `file://`.
- Each lesson `src/lessons/lNN.ts` becomes its own small script in
  `dist/assets/lessons/` and is loaded on demand with a `<script>` tag, which
  does work on `file://`.
- `src/tests/browser.tsx` becomes `dist/assets/tests.js` for `tests.html`.
- All paths are relative. No fonts or files are fetched from the internet; the
  page uses the system font stack.

## Source map

| Folder | What is in it |
| --- | --- |
| `src/sim/` | The simulator, pure functions with no DOM: ISA table, encoder/decoder, assembler, immediate generator, ALU, control unit, gate-level decoder, memory, the single-cycle datapath (`evaluate` = one cycle of combinational logic, `commit` = the clock edge), timing model, sample programs. |
| `src/diagram/` | The datapath as data (`layout.ts`: blocks, ports, routed wires, the lesson that introduces each part), visibility per lesson, the SVG renderer, and the geometry checker (no wire through a block or label, junctions only within a net, crossings counted). |
| `src/lessons/` | One file per lesson: steps, worked examples, predictions, practice list. |
| `src/ui/` | The app: lesson engine, diagram component, four-level instruction card, look-inside panels, exercises, tools (control unit lab, program runner, timing lab, Verilog view, question bank), pages. |
| `src/tests/` | Test harness, reference ISA model, and the test suites. |

To add a lesson step, edit the lesson file; to move a block or reroute a wire,
edit `src/diagram/layout.ts` and run `npm run check:layout` and `npm test`.
