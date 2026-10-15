// Build script. Produces dist/ (the self-contained course) from src/.
// Usage: node scripts/build.mjs [--tests-only] [--watch]
import * as esbuild from 'esbuild';
import { readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const out = join(root, 'dist');
const tmp = join(root, 'build-tmp');

const common = {
  bundle: true,
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  logLevel: 'warning',
  legalComments: 'none',
};

async function buildTests() {
  mkdirSync(tmp, { recursive: true });
  await esbuild.build({ ...common, entryPoints: [join(root, 'src/tests/node.ts')], outfile: join(tmp, 'tests-node.js'), platform: 'node', format: 'cjs' });
}

async function buildApp() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets/lessons'), { recursive: true });
  // Main application: one classic (IIFE) script, works from file://
  await esbuild.build({ ...common, entryPoints: [join(root, 'src/ui/main.tsx')], outfile: join(out, 'assets/app.js'), format: 'iife', minify: true, sourcemap: false });
  // Tests page bundle
  await esbuild.build({ ...common, entryPoints: [join(root, 'src/tests/browser.tsx')], outfile: join(out, 'assets/tests.js'), format: 'iife', minify: true });
  // Lessons: one classic script each, loaded on demand with a <script> tag.
  const lessonDir = join(root, 'src/lessons');
  const lessons = readdirSync(lessonDir).filter((f) => /^l\d\d\.tsx?$/.test(f));
  await Promise.all(lessons.map((f) => esbuild.build({ ...common, entryPoints: [join(lessonDir, f)], outfile: join(out, 'assets/lessons', f.replace(/\.tsx?$/, '.js')), format: 'iife', minify: true })));
  // CSS
  await esbuild.build({ ...common, entryPoints: [join(root, 'src/styles/app.css')], outfile: join(out, 'assets/app.css'), minify: true });
  for (const f of ['index.html', 'tests.html']) copyFileSync(join(root, 'src', f), join(out, f));
  copyFileSync(join(root, 'RUN-ME.txt'), join(out, 'RUN-ME.txt'));
  let total = 0;
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else total += s.size; } };
  walk(out);
  console.log(`dist/ built: ${(total / 1024).toFixed(0)} KB total, ${lessons.length} lessons`);
}

await buildTests();
if (!args.has('--tests-only')) await buildApp();
