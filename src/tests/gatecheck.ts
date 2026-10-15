// Expected bit for each gate-level equation, from the main decoder table.
import { MAIN_TABLE, type MainRow } from '../sim/control';
import { IMMSRC_CODE } from '../sim/immgen';
export { MAIN_TABLE };

export function IMMSRC_CODE_FOR(r: MainRow, signal: string): number | null {
  const m = /^(\w+)(?:\[(\d)\])?$/.exec(signal)!;
  const name = m[1] as keyof MainRow['ctrl'];
  if (r.dc.includes(name)) return null;
  let v = r.ctrl[name] as number | string;
  if (name === 'ImmSrc') v = IMMSRC_CODE[v as keyof typeof IMMSRC_CODE];
  const n = Number(v);
  return m[2] !== undefined ? (n >> Number(m[2])) & 1 : n;
}
