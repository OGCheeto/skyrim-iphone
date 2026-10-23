// Choppable pines, wood, and simple crafting (campfire, torch). Pure logic, no DOM.
import { T, item } from './core.js';

export const CHOP = { hits: 4, axeHits: 2, regrow: 300, fall: 0.7, holdEvery: 0.35 };
export const WOOD = { firewood: { name: 'Firewood', value: 4 }, logs: { name: 'Pine Logs', value: 9 } };
export const CAMP = { life: 180, restHp: 0.35, restSt: 0.5 };
export const RECIPES = {
  campfire: { label: 'Campfire', need: { firewood: 2 } },
  torch: { label: 'Torch', need: { logs: 1 } },
};
export const isAxe = (w) => !!w && /axe|hatchet/i.test(w.name);
export const woodItem = (k) => item({ name: WOOD[k].name, kind: 'wood', wood: k, power: 0, value: WOOD[k].value });
// Kettleford's pines are part of the village layout and stay put; caves have no trees.
export const canChop = (world, x, y) => !world.cave && world.get(x, y) === T.PINE && x > 0 && y > 0 && x < world.w - 1 && y < world.h - 1 && world.region(x, y) !== 'Kettleford';
export const hitsNeeded = (axe) => axe ? CHOP.axeHits : CHOP.hits;

/** One chop. `hits` is a runtime Map (tile index -> hits so far), not saved. */
export function chop(s, world, x, y, { axe = false, hits, r = Math.random } = {}) {
  if (!canChop(world, x, y)) return null;
  const i = y * world.w + x, n = (hits.get(i) || 0) + 1, need = hitsNeeded(axe);
  if (n < need) { hits.set(i, n); return { felled: false, left: need - n }; }
  hits.delete(i); world.set(x, y, T.STUMP); s.stumps[i] = CHOP.regrow; s.felled = (s.felled || 0) + 1;
  const it = woodItem(r() < 0.35 ? 'logs' : 'firewood'); s.inv.push(it);
  return { felled: true, left: 0, yield: it };
}
/** Regrowth counts in-game play time and is stored in the save as seconds remaining. */
export function tickRegrow(s, world, dt, occupied = () => false) {
  const grown = [];
  for (const k of Object.keys(s.stumps)) {
    s.stumps[k] -= dt; if (s.stumps[k] > 0) continue;
    const i = +k, x = i % world.w, y = (i / world.w) | 0;
    if (occupied(x, y)) { s.stumps[k] = 5; continue; } // never regrow on top of someone
    world.set(x, y, T.PINE); delete s.stumps[k]; grown.push({ x, y });
  }
  return grown;
}
/** Sync the shared world grid to a save: restore every stump, then apply this save's stumps. */
export function applyStumps(s, world) {
  for (let i = 0; i < world.t.length; i++) if (world.t[i] === T.STUMP) world.t[i] = T.PINE;
  for (const k of Object.keys(s.stumps || {})) if (world.t[+k] === T.PINE) world.t[+k] = T.STUMP; else delete s.stumps[k];
}

export const woodCount = (s, k) => s.inv.filter((i) => i.kind === 'wood' && i.wood === k).length;
export const canCraft = (s, r) => Object.entries(RECIPES[r].need).every(([k, n]) => woodCount(s, k) >= n);
/** Craft a recipe. Campfire is placed at `at` = {map, x, y} (tile). Returns a message or null. */
export function craft(s, r, at) {
  if (!canCraft(s, r)) return null;
  for (const [k, n] of Object.entries(RECIPES[r].need)) for (let j = 0; j < n; j++) s.inv.splice(s.inv.findIndex((i) => i.kind === 'wood' && i.wood === k), 1);
  if (r === 'torch') { s.inv.push(item({ name: 'Torch', kind: 'torch', power: 0, value: 6 })); return 'Crafted a Torch'; }
  s.camp = { map: at.map, x: at.x, y: at.y, t: CAMP.life, rested: false }; return 'Campfire built';
}
export function tickCamp(s, dt) { if (s.camp && (s.camp.t -= dt) <= 0) s.camp = null; }
export function rest(s) {
  if (!s.camp || s.camp.rested) return null;
  s.camp.rested = true; s.hp = Math.min(s.maxHp, s.hp + s.maxHp * CAMP.restHp); s.st = Math.min(s.maxSt, s.st + s.maxSt * CAMP.restSt);
  return 'You rest by the fire. Warmth returns.';
}
