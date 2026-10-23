// Cave interiors: small seeded tile grids with darkness, a light radius and their own fog. Pure logic, no DOM.
import { Grid, T, TILE, rng, CAVE_SITES, item, chestLoot } from './core.js';

export const LIGHT = { base: 3.5, torch: 2.5, lantern: 1.5 }; // radius in tiles
export const TORCH_BURN = 150;                                  // seconds a torch burns (only ticks underground)
// Interior layouts. Feature points are fractions of the grid; tunnels are carved so every one is reachable.
export const CAVES = {
  grotto:    { w: 26, h: 18, seed: 11, enemies: ['cavewolf', 'cavewolf', 'wolf'], blurb: 'Roots hang from the ceiling. Something growls.' },
  rimewater: { w: 30, h: 20, seed: 23, enemies: ['wight', 'cavewolf', 'wight'], pool: true, blurb: 'Black water drips into a frozen pool.' },
  gloamfang: { w: 32, h: 22, seed: 37, enemies: ['cavewolf', 'cavewolf', 'wight', 'gloamfang'], unique: true, blurb: 'Bones everywhere. A huge wolf lairs here.' },
};
const SPOTS = [[0.25, 0.5], [0.75, 0.5], [0.5, 0.72], [0.2, 0.8]];
export const CHEST_BASE = 100; // cave chest ids live in s.chests as 100 + cave index

export class Cave extends Grid {
  constructor(id) {
    super();
    const site = CAVE_SITES.find((c) => c.id === id), d = CAVES[id];
    Object.assign(this, { cave: id, name: site.name, site, w: d.w, h: d.h, blurb: d.blurb });
    this.t = new Uint8Array(this.w * this.h).fill(T.ROCK);
    const r = rng(d.seed * 7919);
    // cellular automata cave
    let a = Array.from({ length: this.w * this.h }, (_, i) => { const x = i % this.w, y = (i / this.w) | 0; return x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1 || r() < 0.44 ? 1 : 0; });
    for (let k = 0; k < 4; k++) a = a.map((v, i) => { const x = i % this.w, y = (i / this.w) | 0; if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) return 1; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += a[(y + dy) * this.w + x + dx]; return n >= 5 ? 1 : 0; });
    a.forEach((v, i) => { if (!v) this.t[i] = T.CAVE; });
    const P = (fx, fy) => ({ x: Math.max(2, Math.min(this.w - 3, Math.round(fx * this.w))), y: Math.max(2, Math.min(this.h - 3, Math.round(fy * this.h))) });
    this.exit = { x: this.w >> 1, y: 1 }; this.arrive = { x: this.w >> 1, y: 2 };
    this.chestAt = P(0.5, 0.86);
    const pts = d.enemies.map((_, i) => P(...SPOTS[i % SPOTS.length]));
    const poolAt = d.pool ? P(0.8, 0.75) : null;
    for (const q of [this.chestAt, ...pts, ...(poolAt ? [poolAt] : [])]) { this.tunnel(this.arrive, q, r); this.open(q, 1); }
    this.open(this.arrive, 1);
    // drop pockets not connected to the entrance
    const seen = this.flood(this.arrive);
    for (let i = 0; i < this.t.length; i++) if (this.t[i] !== T.ROCK && !seen.has(i)) this.t[i] = T.ROCK;
    this.t[this.exit.y * this.w + this.exit.x] = T.EXIT;
    this.spawns = d.enemies.map((kind, i) => ({ kind, ...pts[i] }));
    const idx = CAVE_SITES.findIndex((c) => c.id === id);
    this.chests = [{ id: CHEST_BASE + idx, ...this.chestAt, unique: !!d.unique }];
    this.fishing = [];
    if (poolAt) { this.disk(poolAt, 1, T.ICE); this.fishing.push({ id: 10 + idx, name: 'Rimewater Pool', x: poolAt.x, y: poolAt.y, cave: true }); }
    this.npcs = []; this.fire = null; this.galestone = null; this.lair = { x: -999, y: -999 }; this.caves = [];
  }
  get spawn() { return this.arrive; }
  region() { return this.name; }
  open(c, rad) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (this.get(c.x + dx, c.y + dy) === T.ROCK) this.set(c.x + dx, c.y + dy, T.CAVE); }
  tunnel(a, b, r) {
    const p = { ...a };
    while (p.x !== b.x || p.y !== b.y) {
      if (this.get(p.x, p.y) === T.ROCK) this.set(p.x, p.y, T.CAVE);
      if ((r() < 0.5 && p.x !== b.x) || p.y === b.y) p.x += Math.sign(b.x - p.x); else p.y += Math.sign(b.y - p.y);
    }
    if (this.get(p.x, p.y) === T.ROCK) this.set(p.x, p.y, T.CAVE);
  }
  flood(s) {
    const seen = new Set([s.y * this.w + s.x]), q = [s];
    while (q.length) { const p = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = p.x + dx, y = p.y + dy, i = y * this.w + x; if (this.walk(x, y) && !seen.has(i)) { seen.add(i); q.push({ x, y }); } } }
    return seen;
  }
}
const cache = {};
export const getCave = (id) => (cache[id] ||= new Cave(id));

export const lightRadius = (s) => LIGHT.base + (s.torch > 0 ? LIGHT.torch : 0) + (s.lantern ? LIGHT.lantern : 0);
export function tickTorch(s, dt, inCave) { if (inCave && s.torch > 0) s.torch = Math.max(0, s.torch - dt); }
export function lightTorch(s, id) {
  const i = s.inv.findIndex((x) => x.id === id && x.kind === 'torch'); if (i < 0) return null;
  s.inv.splice(i, 1); s.torch += TORCH_BURN; return `Torch lit (${Math.round(s.torch)}s)`;
}
/** Enter: remember the exact overworld spot (pixels) and move to the cave mouth inside. */
export function enterCave(s, cave, from) {
  s.ret = { x: from.x, y: from.y }; s.cave = cave.cave;
  const c = cave.center(cave.arrive); s.x = c.x; s.y = c.y; return c;
}
/** Exit: back to where you stood when you went in (falls back to just south of the mouth). */
export function exitCave(s, world) {
  const site = CAVE_SITES.find((c) => c.id === s.cave);
  const back = s.ret || (site ? world.center({ x: site.x, y: site.y - 1 }) : world.center(world.spawn));
  s.cave = null; s.ret = null; s.x = back.x; s.y = back.y; return back;
}
export function caveChestLoot(chest, s, r = Math.random) {
  const l = chestLoot(r);
  if (chest.unique && !s.lantern) { s.lantern = true; l.items.push(item({ name: 'Deepfrost Lantern', kind: 'quest', power: 0, value: 0 })); l.gold += 60; }
  return l;
}
export { TILE };
