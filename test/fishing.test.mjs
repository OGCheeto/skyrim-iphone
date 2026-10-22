import assert from 'node:assert/strict';
import * as F from '../js/fishing.js';
import * as C from '../js/core.js';
const seeded = (a = 7) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
const dt = 1 / 60;
const toBite = (g) => { for (let i = 0; i < 60 * 600 && g.state === 'wait'; i++) g.update(dt); return g; };
// state machine + timing window
let g = toBite(new F.FishingGame({ r: seeded() })); assert.equal(g.state, 'bite'); assert.ok(F.FISH[g.fish]);
assert.equal(g.tap(), 'reel', 'tap inside window hooks');
g = toBite(new F.FishingGame({ r: seeded(3) })); for (let t = 0; t < F.BITE.window + 0.05; t += dt) g.update(dt); assert.equal(g.state, 'lost', 'missing window loses fish');
g = new F.FishingGame({ r: seeded() }); g.tap(); assert.equal(g.state, 'lost', 'tapping before bite spooks');
g = new F.FishingGame({ r: () => 0 }); g.update(F.BITE.minWait / 2); assert.equal(g.state, 'wait', 'no bite before min wait');
g = new F.FishingGame(); g.cancel(); assert.equal(g.state, 'cancelled'); assert.ok(g.done); g.tap(); g.update(1); assert.equal(g.state, 'cancelled', 'terminal');
// tension: perfect tracking catches; never holding snaps or drains
const reelWith = (policy, seed, hook = false) => { const x = toBite(new F.FishingGame({ r: seeded(seed), hook })); x.tap(); for (let i = 0; i < 60 * 60 && !x.done; i++) { x.hold(policy(x)); x.update(dt); } return x; };
const smart = (x) => x.marker + x.vel * 0.35 < x.zone; // simple predictive player
let caught = 0; for (let s = 1; s <= 20; s++) if (reelWith(smart, s).state === 'caught') caught++;
assert.ok(caught >= 16, `skilled play catches most fish: ${caught}/20`);
const idle = reelWith(() => false, 5); assert.ok(['snapped', 'lost'].includes(idle.state), 'idle line fails: ' + idle.state);
const spam = reelWith(() => true, 6); assert.ok(['snapped', 'lost'].includes(spam.state), 'always-hold fails: ' + spam.state);
const t0 = toBite(new F.FishingGame({ r: seeded(9) })); t0.tap(); t0.meter = 0.8; t0.zone = t0.zoneTarget = 0.1; t0.marker = 0.9; let st; for (let i = 0; i < 200 && !t0.done; i++) { t0.zoneTarget = 0.1; t0.zone = 0.1; t0.marker = 0.9; t0.vel = 0; st = t0.update(dt); }
assert.equal(t0.state, 'snapped', 'out of zone too long snaps'); assert.ok(t0.t <= F.REEL.snapAfter + 0.05);
const t1 = toBite(new F.FishingGame({ r: seeded(9) })); t1.tap(); for (let i = 0; i < 200 && !t1.done; i++) { t1.zone = t1.zoneTarget = 0.1; t1.marker = 0.9; t1.vel = 0; t1.update(dt); } assert.equal(t1.state, 'lost', 'low meter drains to escape');
const h1 = new F.FishingGame({ hook: true }); h1.fish = 'icefin'; const h0 = new F.FishingGame(); h0.fish = 'icefin'; assert.ok(h1.zoneWidth > h0.zoneWidth, 'bone hook widens zone');
// storm bite bonus
assert.ok(F.biteRate(1) > F.biteRate(0) * 1.5); assert.equal(F.biteRate(5), F.biteRate(1)); 
const avgWait = (storm) => { let tot = 0; for (let s = 1; s <= 200; s++) { const x = new F.FishingGame({ storm, r: seeded(s) }); let t = 0; while (x.state === 'wait') { x.update(0.05); t += 0.05; } tot += t; } return tot / 200; };
const calm = avgWait(0), storm = avgWait(1); assert.ok(storm < calm * 0.8, `storm bites faster: ${storm.toFixed(1)}s vs ${calm.toFixed(1)}s`);
// rarity
const n = {}; const r = seeded(11); for (let i = 0; i < 10000; i++) { const k = F.rollFish(r); n[k] = (n[k] || 0) + 1; }
assert.ok(n.icefin > n.silverjaw && n.silverjaw > n.pike && n.pike > n.frostgill && n.frostgill > 200, JSON.stringify(n));
// cooking, eating, selling, frost ward
const w = new C.World(), s = C.newSave('warrior', w);
const ice = F.rawFishItem('icefin', C.item), eel = F.rawFishItem('frostgill', C.item), jaw = F.rawFishItem('silverjaw', C.item); s.inv.push(ice, eel, jaw);
assert.equal(C.sellPrice(jaw), F.FISH.silverjaw.value, 'fish sell at full value'); const g0 = s.gold; C.sell(s, jaw.id); assert.equal(s.gold, g0 + F.FISH.silverjaw.value);
assert.equal(F.cook(s, ice.id, C.item), 'Grilled Icefin'); assert.equal(s.cooked, 1); assert.equal(F.cook(s, s.weapon, C.item), null, 'cannot cook a sword');
const food = s.inv.find((i) => i.name === 'Grilled Icefin'); s.hp = 10; C.use(s, food.id); assert.equal(s.hp, 45); assert.ok(!s.inv.includes(food));
F.cook(s, eel.id, C.item); const jerky = s.inv.find((i) => i.kind === 'ward'); assert.match(C.use(s, jerky.id), /frost resistance/);
assert.equal(s.frostWard, 120); assert.equal(F.frostScale(s, 'wolf'), 0.7); assert.equal(F.frostScale(s, 'boss'), 1); s.frostWard = 0; assert.equal(F.frostScale(s, 'wolf'), 1);
// quest: hunter wolves first, then icefin
C.talk(s, 'hunter'); assert.equal(s.quests.side.stage, 1); assert.equal(s.quests.fish.stage, 0);
assert.match(C.talk(s, 'hunter').text, /Icefin/); assert.equal(s.quests.fish.stage, 1);
s.inv.push(F.rawFishItem('icefin', C.item), F.rawFishItem('icefin', C.item)); F.syncFishQuest(s); assert.match(s.quests.fish.stages[1], /\(2\/3\)/);
C.talk(s, 'hunter'); assert.equal(s.quests.fish.stage, 1, 'not enough yet');
s.inv.push(F.rawFishItem('icefin', C.item), F.rawFishItem('icefin', C.item)); const g1 = s.gold; C.talk(s, 'hunter');
assert.equal(s.quests.fish.stage, 2); assert.equal(s.gold, g1 + 60); assert.ok(s.boneHook); assert.equal(F.icefinCount(s), 1, 'took exactly 3');
for (let i = 0; i < 5; i++) C.wolfKill(s); C.talk(s, 'hunter'); assert.equal(s.quests.side.stage, 3, 'wolf quest still completes');
// save/load
s.frostWard = 33; const r2 = C.deserialize(C.serialize(s));
assert.equal(r2.quests.fish.stage, 2); assert.equal(r2.cooked, 2); assert.equal(r2.frostWard, 33); assert.ok(r2.boneHook); assert.equal(F.icefinCount(r2), 1);
const old = JSON.parse(C.serialize(s)); delete old.quests.fish; delete old.cooked; delete old.boneHook; delete old.frostWard;
const mig = C.deserialize(JSON.stringify(old)); assert.equal(mig.quests.fish.stage, 0); assert.equal(mig.cooked, 0, 'old saves migrate');
console.log('fishing tests passed', { caught, calm: +calm.toFixed(1), storm: +storm.toFixed(1), rarity: n });
