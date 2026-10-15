// Minimal test harness shared by the browser tests page and the Node runner.

export interface TestResult {
  group: string;
  name: string;
  pass: boolean;
  msg: string;
  ms: number;
}

type Fn = () => void;
const registry: { group: string; name: string; fn: Fn }[] = [];
let currentGroup = 'general';

export function group(name: string, body: () => void) {
  const prev = currentGroup;
  currentGroup = name;
  body();
  currentGroup = prev;
}

export function test(name: string, fn: Fn) {
  registry.push({ group: currentGroup, name, fn });
}

export class AssertionError extends Error {}

const show = (v: unknown): string => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v > 9 ? `${v} (0x${(v >>> 0).toString(16)})` : String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export function eq<T>(actual: T, expected: T, what = 'value') {
  const a = typeof actual === 'number' ? actual : JSON.stringify(actual);
  const e = typeof expected === 'number' ? expected : JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${what}: expected ${show(expected)}, got ${show(actual)}`);
}

export function ok(cond: unknown, what: string) {
  if (!cond) throw new AssertionError(what);
}

export function throws(fn: () => unknown, what: string, match?: RegExp) {
  try {
    fn();
  } catch (e) {
    if (match && !match.test(String((e as Error).message))) throw new AssertionError(`${what}: wrong error "${(e as Error).message}"`);
    return;
  }
  throw new AssertionError(`${what}: expected an error`);
}

/** Deterministic PRNG so failures are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  return {
    u32: next,
    int: (lo: number, hi: number) => lo + (next() % (hi - lo + 1)),
    pick: <T,>(a: T[]): T => a[next() % a.length],
  };
}

export function runAll(): TestResult[] {
  const out: TestResult[] = [];
  for (const t of registry) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let pass = true;
    let msg = '';
    try {
      t.fn();
    } catch (e) {
      pass = false;
      msg = e instanceof Error ? e.message : String(e);
    }
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    out.push({ group: t.group, name: t.name, pass, msg, ms: t1 - t0 });
  }
  return out;
}
