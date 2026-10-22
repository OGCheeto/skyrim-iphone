import * as C from '../js/core.js';
import assert from 'node:assert/strict';
const w = new C.World();
assert.ok(w.walk(w.spawn.x, w.spawn.y), 'spawn walkable');
// BFS reachability from spawn to galestone, lair, chests, npcs
const seen = new Set([w.spawn.y * w.w + w.spawn.x]), q = [w.spawn];
while (q.length) { const p = q.shift(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = p.x + dx, y = p.y + dy, i = y * w.w + x; if (w.walk(x, y) && !seen.has(i)) { seen.add(i); q.push({ x, y }); } } }
const reach = (p) => seen.has(p.y * w.w + p.x) || [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => seen.has((p.y+dy)*w.w+p.x+dx));
assert.ok(reach(w.galestone), 'galestone reachable'); assert.ok(reach(w.lair), 'lair reachable');
w.chests.forEach((c) => assert.ok(reach(c), 'chest ' + c.id)); w.npcs.forEach((n) => assert.ok(reach(n), n.name));
w.fishing.forEach((f) => { assert.ok(reach(f), 'fishing ' + f.name); assert.equal(w.get(f.x, f.y), C.T.ICE, f.name + ' is ice'); }); assert.ok(reach(w.fire), 'fire reachable');
assert.equal(w.region(w.fishing[0].x, w.fishing[0].y), 'Kettleford', 'one spot in Kettleford'); assert.ok(w.fishing.length >= 2 && w.fishing.length <= 3);
w.spawns.forEach((s) => assert.ok(w.walk(s.x, s.y), 'spawn ' + s.kind));
assert.equal(new C.World().t.join(), w.t.join(), 'deterministic');
for (const cls of Object.keys(C.CLASSES)) {
  const s = C.newSave(cls, w);
  assert.equal(s.hp, C.CLASSES[cls].hp);
  // quest flow
  assert.match(C.talk(s, 'elder').text, /Galestone/); assert.equal(s.quests.main.stage, C.MAIN.STONE);
  s.quests.main.stage = C.MAIN.RETURN; s.inv.push(C.item({ name: 'Galestone', kind: 'quest' }));
  C.talk(s, 'elder'); assert.equal(s.quests.main.stage, C.MAIN.SLAY); assert.ok(C.empowered(s)); assert.ok(!s.inv.some((i) => i.name === 'Galestone'));
  C.talk(s, 'hunter'); assert.equal(s.quests.side.stage, 1);
  for (let i = 0; i < 5; i++) C.wolfKill(s); assert.equal(s.quests.side.stage, 2);
  const g0 = s.gold; C.talk(s, 'hunter'); assert.equal(s.quests.side.stage, 3); assert.equal(s.gold, g0 + 75);
  // leveling
  const lvl = s.level; C.gainXP(s, 10000); assert.ok(s.level > lvl + 5); assert.equal(s.hp, s.maxHp);
  // equipment & potions
  const armor = s.inv.find((i) => i.kind === 'armor'); C.equip(s, armor.id); assert.equal(s.armor, armor.id); assert.ok(C.mitigate(s, 100) < 100);
  s.hp = 1; const p = s.inv.find((i) => i.kind === 'hpot'); C.use(s, p.id); assert.equal(s.hp, 51);
  assert.equal(C.sell(s, s.weapon), 0, 'cannot sell equipped weapon');
  // fog
  const n = C.reveal(s, w, 10, 10, 3).length; assert.ok(n > 20); assert.equal(C.reveal(s, w, 10, 10, 3).length, 0);
  // save roundtrip
  const r = C.deserialize(C.serialize(s)); assert.equal(r.level, s.level); assert.equal(r.quests.side.stage, 3); assert.ok(C.explored(r, 10 * w.w + 10));
  assert.equal(C.deserialize('garbage'), null);
}
const boss = C.rollLoot(2); assert.equal(boss.gold, 400); assert.equal(boss.items.length, 3);
console.log('core tests passed; reachable tiles', seen.size);
