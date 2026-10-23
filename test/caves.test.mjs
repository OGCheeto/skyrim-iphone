import * as C from '../js/core.js';
import * as Cv from '../js/caves.js';
import assert from 'node:assert/strict';
const w = new C.World();
for (const site of w.caves) {
  const c = Cv.getCave(site.id);
  assert.equal(Cv.getCave(site.id), c, 'cached'); assert.equal(new Cv.Cave(site.id).t.join(), c.t.join(), 'deterministic ' + site.id);
  assert.equal(c.get(c.exit.x, c.exit.y), C.T.EXIT); assert.ok(c.walk(c.arrive.x, c.arrive.y));
  // everything reachable from the arrival tile
  const seen = c.flood(c.arrive), at = (p) => seen.has(p.y * c.w + p.x);
  assert.ok(at(c.exit), 'exit reachable'); c.chests.forEach((ch) => assert.ok(at(ch), 'chest ' + site.id));
  c.spawns.forEach((s) => assert.ok(at(s), `spawn ${s.kind} in ${site.id}`));
  c.fishing.forEach((f) => { assert.equal(c.get(f.x, f.y), C.T.ICE); assert.ok([[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]].some(([dx, dy]) => at({ x: f.x + dx, y: f.y + dy })), 'pool bank reachable'); });
  assert.ok(c.spawns.length >= 3 && c.spawns.every((s) => C.ENEMIES[s.kind]), 'enemies');
  assert.ok(c.chests[0].id >= Cv.CHEST_BASE && !w.chests.some((x) => x.id === c.chests[0].id), 'chest ids do not collide');
  assert.ok(seen.size > 60, 'decent size'); assert.equal(c.region(), site.name);
}
assert.ok(Cv.getCave('rimewater').fishing.length === 1, 'Rimewater has a fishing pool');
assert.ok(Cv.getCave('gloamfang').spawns.some((s) => s.kind === 'gloamfang') && Cv.getCave('gloamfang').chests[0].unique, 'Gloamfang den: elite + unique chest');
// enter / exit / save while inside
const s = C.newSave('rogue', w), cave = Cv.getCave('grotto'), from = { x: 700.5, y: 555.25 };
Cv.enterCave(s, cave, from); assert.equal(s.cave, 'grotto'); assert.deepEqual(s.ret, from); assert.deepEqual({ x: s.x, y: s.y }, cave.center(cave.arrive));
const n = C.reveal(s, cave, cave.arrive.x, cave.arrive.y, 3).length; assert.ok(n > 5); assert.ok(s.caveFog.grotto.length === Math.ceil(cave.w * cave.h / 32));
assert.ok(s.fog.every((v) => v === 0), 'cave reveal does not touch overworld fog');
const r = C.deserialize(C.serialize(s)); assert.equal(r.cave, 'grotto'); assert.deepEqual(r.ret, from); assert.equal(r.x, s.x);
assert.equal(C.reveal(r, cave, cave.arrive.x, cave.arrive.y, 3).length, 0, 'cave fog persisted');
Cv.exitCave(r, w); assert.equal(r.cave, null); assert.deepEqual({ x: r.x, y: r.y }, from, 'exit to the same spot');
const r2 = C.newSave('mage', w); r2.cave = 'gloamfang'; r2.ret = null; Cv.exitCave(r2, w); assert.deepEqual({ x: r2.x, y: r2.y }, w.center({ x: 46, y: 27 }), 'fallback exit by the mouth');
// old saves migrate
const old = JSON.parse(C.serialize(C.newSave('warrior', w))); for (const k of ['cave', 'ret', 'caveFog', 'lantern', 'torch', 'stumps', 'camp']) delete old[k];
const m = C.deserialize(JSON.stringify(old)); assert.equal(m.cave, null); assert.deepEqual(m.stumps, {}); assert.equal(m.torch, 0);
// lighting + torch + lantern
const L = C.newSave('warrior', w); assert.equal(Cv.lightRadius(L), Cv.LIGHT.base);
L.inv.push(C.item({ name: 'Torch', kind: 'torch', power: 0, value: 6 })); const tid = L.inv.at(-1).id;
assert.match(Cv.lightTorch(L, tid), /Torch lit/); assert.ok(!L.inv.some((i) => i.kind === 'torch'));
assert.equal(Cv.lightRadius(L), Cv.LIGHT.base + Cv.LIGHT.torch);
Cv.tickTorch(L, 50, false); assert.equal(L.torch, Cv.TORCH_BURN, 'torch does not burn outdoors');
Cv.tickTorch(L, Cv.TORCH_BURN + 1, true); assert.equal(L.torch, 0); assert.equal(Cv.lightRadius(L), Cv.LIGHT.base);
const loot = Cv.caveChestLoot({ unique: true }, L, () => 0.5); assert.ok(L.lantern && loot.items.some((i) => i.name === 'Deepfrost Lantern'));
assert.equal(Cv.lightRadius(L), Cv.LIGHT.base + Cv.LIGHT.lantern);
assert.ok(!Cv.caveChestLoot({ unique: true }, L, () => 0.5).items.some((i) => i.name === 'Deepfrost Lantern'), 'lantern only once');
console.log('cave tests passed');
