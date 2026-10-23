import * as C from '../js/core.js';
import * as Tr from '../js/trees.js';
import * as Cv from '../js/caves.js';
import assert from 'node:assert/strict';
const w = new C.World(), T = C.T;
const pines = []; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.get(x, y) === T.PINE) pines.push({ x, y });
assert.ok(pines.filter((p) => Tr.canChop(w, p.x, p.y)).length > 30, 'plenty of choppable pines');
assert.ok(pines.filter((p) => w.region(p.x, p.y) === 'Kettleford').every((p) => !Tr.canChop(w, p.x, p.y)), 'Kettleford pines are protected');
assert.ok(!Tr.canChop(Cv.getCave('grotto'), 5, 5), 'no trees in caves');
assert.ok(Tr.isAxe({ name: 'Iron Hatchet' }) && Tr.isAxe({ name: 'Wight-Bone Axe' }) && !Tr.isAxe({ name: 'Twin Shivs' }) && !Tr.isAxe(undefined));
const reachSet = (world) => { const seen = new Set([world.spawn.y * world.w + world.spawn.x]), q = [world.spawn]; while (q.length) { const p = q.pop(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = p.x + dx, y = p.y + dy, i = y * world.w + x; if (world.walk(x, y) && !seen.has(i)) { seen.add(i); q.push({ x, y }); } } } return seen; };
const before = reachSet(w);
// chop state machine
const s = C.newSave('rogue', w), hits = new Map(), t0 = pines.find((p) => Tr.canChop(w, p.x, p.y));
for (let k = Tr.CHOP.hits - 1; k >= 1; k--) assert.deepEqual(Tr.chop(s, w, t0.x, t0.y, { hits }), { felled: false, left: k });
assert.equal(w.get(t0.x, t0.y), T.PINE);
const res = Tr.chop(s, w, t0.x, t0.y, { hits, r: () => 0.1 }); assert.ok(res.felled); assert.equal(res.yield.name, 'Pine Logs');
assert.equal(w.get(t0.x, t0.y), T.STUMP); assert.ok(w.walk(t0.x, t0.y), 'stump is walkable'); assert.equal(s.felled, 1); assert.equal(hits.size, 0);
assert.equal(Tr.chop(s, w, t0.x, t0.y, { hits }), null, 'stumps cannot be chopped');
// axe: fewer hits
const t1 = pines.filter((p) => Tr.canChop(w, p.x, p.y))[5];
assert.equal(Tr.chop(s, w, t1.x, t1.y, { hits, axe: true }).left, 1); assert.ok(Tr.chop(s, w, t1.x, t1.y, { hits, axe: true, r: () => 0.9 }).felled);
assert.equal(s.inv.at(-1).name, 'Firewood');
// yields distribution
let logs = 0; const s2 = C.newSave('mage', w), w2 = new C.World(), r = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(7);
const choppable = pines.filter((p) => Tr.canChop(w2, p.x, p.y));
for (const p of choppable) { const h = new Map(); let out; for (let k = 0; k < 2; k++) out = Tr.chop(s2, w2, p.x, p.y, { hits: h, axe: true, r }); if (out.yield.wood === 'logs') logs++; }
assert.equal(s2.inv.filter((i) => i.kind === 'wood').length, choppable.length, 'one wood per tree');
assert.ok(logs / choppable.length > 0.2 && logs / choppable.length < 0.5, `logs ratio ${logs}/${choppable.length}`);
// chopping only opens paths; after felling everything, everything reachable before is still reachable
const after = reachSet(w2); for (const i of before) assert.ok(after.has(i), 'reachability kept');
// regrowth (in-game seconds, persisted in the save)
assert.equal(Tr.tickRegrow(s, w, Tr.CHOP.regrow - 10).length, 0);
const saved = C.deserialize(C.serialize(s)); assert.equal(Object.keys(saved.stumps).length, 2);
const w3 = new C.World(); Tr.applyStumps(saved, w3); assert.equal(w3.get(t0.x, t0.y), T.STUMP, 'stumps restored from save');
Tr.applyStumps(C.newSave('rogue', w3), w3); assert.equal(w3.get(t0.x, t0.y), T.PINE, 'new game resets stumps');
const blocked = Tr.tickRegrow(s, w, 20, (x, y) => x === t0.x && y === t0.y); assert.equal(blocked.length, 1, 'occupied tree waits'); assert.equal(w.get(t0.x, t0.y), T.STUMP);
assert.deepEqual(Tr.tickRegrow(s, w, 6), [{ x: t0.x, y: t0.y }]); assert.equal(w.get(t0.x, t0.y), T.PINE); assert.deepEqual(s.stumps, {});
const s3 = C.newSave('rogue', w); s3.stumps = { 5: 10 }; Tr.applyStumps(s3, w); assert.deepEqual(s3.stumps, {}, 'bogus stump keys dropped');
// selling + crafting
const c = C.newSave('warrior', w); c.inv.push(Tr.woodItem('firewood'), Tr.woodItem('firewood'), Tr.woodItem('logs'), Tr.woodItem('logs'));
assert.equal(C.sellPrice(c.inv.at(-1)), Tr.WOOD.logs.value); assert.equal(C.sellPrice(c.inv.at(-3)), Tr.WOOD.firewood.value);
const g0 = c.gold; C.sell(c, c.inv.at(-1).id); assert.equal(c.gold, g0 + 9, 'Ilsa buys logs');
assert.ok(Tr.canCraft(c, 'campfire') && Tr.canCraft(c, 'torch'));
assert.equal(Tr.craft(c, 'torch'), 'Crafted a Torch'); assert.equal(Tr.woodCount(c, 'logs'), 0); assert.ok(c.inv.some((i) => i.kind === 'torch')); assert.equal(Tr.craft(c, 'torch'), null);
assert.equal(Tr.craft(c, 'campfire', { map: 'world', x: 20, y: 20 }), 'Campfire built'); assert.equal(Tr.woodCount(c, 'firewood'), 0);
assert.deepEqual({ ...c.camp }, { map: 'world', x: 20, y: 20, t: Tr.CAMP.life, rested: false });
c.hp = 10; c.st = 0; assert.ok(Tr.rest(c)); assert.equal(c.hp, Math.min(c.maxHp, 10 + c.maxHp * Tr.CAMP.restHp)); assert.equal(Tr.rest(c), null, 'one rest per fire');
assert.equal(C.deserialize(C.serialize(c)).camp.rested, true, 'campfire saved');
Tr.tickCamp(c, Tr.CAMP.life + 1); assert.equal(c.camp, null, 'campfire burns out');
console.log('tree tests passed; choppable', choppable.length, 'logs', logs);
