// What build mode asks for at each level: the lesson's new blocks and the wires to connect.

import { COMPS, WIRES, compById, type Wire } from '../../diagram/layout';
import { allKeys, isVisible } from '../../diagram/visibility';

const compOfPort = (p: string) => p.split('.')[0];

export function buildPlan(level: number) {
  const keys = allKeys(level);
  const comps = COMPS.filter((c) => isVisible(c, level, keys));
  const wires = WIRES.filter((w) => isVisible(w, level, keys));
  const newComps = comps.filter((c) => c.from.l === level && c.shape !== 'const' && c.id !== 'ctrl');
  const consts = comps.filter((c) => c.from.l === level && c.shape === 'const');
  const isConstWire = (w: Wire) => !!w.src && compById[compOfPort(w.src)]?.shape === 'const';
  const need = wires.filter((w) => w.from.l === level && (w.kind === 'data' || w.kind === 'field') && w.src && w.dst && !isConstWire(w));
  const auto = wires.filter((w) => w.from.l === level && !need.includes(w));
  return { comps, wires, newComps, consts, need, auto };
}
