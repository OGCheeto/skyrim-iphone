// Pure game logic: world generation, player data, quests, loot, saving. No DOM.
export const TILE = 32;
import * as F from './fishing.js';
export const T = { SNOW:0, DEEP:1, ROCK:2, PINE:3, ROAD:4, ICE:5, WALL:6, FLOOR:7, ASH:8, LAVA:9, HUT:10, CAVE:11, EXIT:12, STUMP:13 };
const BLOCK = new Set([T.ROCK, T.PINE, T.WALL, T.LAVA, T.HUT]);

export function rng(seed) {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const CLASSES = {
  warrior: { title: 'Shieldborn Warrior', blurb: 'Heavy blows, thick hide. Cheap swings.', hp: 140, st: 110, mp: 50, speed: 135, melee: 1.3, spell: 0.8, crit: 0.08, swing: 8, cast: 28,
    weapon: { name: 'Iron Hatchet', kind: 'weapon', power: 7, value: 20 } },
  mage: { title: 'Rimecaller Mage', blurb: 'Frail, but hurls piercing frost bolts.', hp: 90, st: 80, mp: 150, speed: 140, melee: 0.8, spell: 1.6, crit: 0.08, swing: 12, cast: 18,
    weapon: { name: 'Birch Staff', kind: 'weapon', power: 4, value: 15 } },
  rogue: { title: 'Veilstep Rogue', blurb: 'Fast feet, keen blades, frequent crits.', hp: 110, st: 130, mp: 70, speed: 165, melee: 1.0, spell: 0.8, crit: 0.3, swing: 9, cast: 28,
    weapon: { name: 'Twin Shivs', kind: 'weapon', power: 6, value: 20 } },
};

export const ENEMIES = {
  wolf:  { name: 'Frost Wolf', hp: 30, dmg: 7, speed: 120, aggro: 220, range: 34, cd: 1.1, xp: 15, tier: 0, r: 11 },
  wight: { name: 'Hollow Wight', hp: 60, dmg: 12, speed: 70, aggro: 180, range: 34, cd: 1.6, xp: 30, tier: 1, r: 12 },
  cavewolf:  { name: 'Gloam Wolf', hp: 38, dmg: 9, speed: 125, aggro: 170, range: 34, cd: 1.1, xp: 22, tier: 0, r: 11, wolf: true },
  gloamfang: { name: 'Gloamfang', hp: 190, dmg: 16, speed: 115, aggro: 200, range: 40, cd: 1.2, xp: 120, tier: 1, r: 16, wolf: true },
  boss:  { name: 'Vorthrax the Ashwing', hp: 650, dmg: 22, speed: 85, aggro: 420, range: 70, cd: 1.4, xp: 500, tier: 2, r: 30 },
};

let uid = 1;
export const item = (o) => ({ ...o, id: `${Date.now().toString(36)}${(uid++).toString(36)}${Math.random().toString(36).slice(2, 6)}` });
export const LOOT = {
  weapons: [{ name: 'Steel Longblade', kind: 'weapon', power: 11, value: 60 }, { name: 'Wight-Bone Axe', kind: 'weapon', power: 14, value: 90 }, { name: 'Runed Greatblade', kind: 'weapon', power: 18, value: 150 }],
  armors: [{ name: 'Fur Mantle', kind: 'armor', power: 3, value: 30 }, { name: 'Barrow Chain', kind: 'armor', power: 6, value: 80 }, { name: 'Wardplate', kind: 'armor', power: 9, value: 140 }],
  hp: () => item({ name: 'Snowberry Draught', kind: 'hpot', power: 50, value: 20 }),
  mp: () => item({ name: 'Azure Tincture', kind: 'mpot', power: 50, value: 20 }),
  sp: () => item({ name: 'Elk-Root Tonic', kind: 'spot', power: 60, value: 15 }),
  trinket: (r) => item({ name: ['Silver Torc', 'Frost Opal', 'Carved Antler', 'Old Coin Pouch'][Math.floor(r() * 4)], kind: 'valuable', power: 0, value: 15 + Math.floor(r() * 30) }),
};
export function rollLoot(tier, r = Math.random) {
  const items = [];
  let gold;
  if (tier === 0) { gold = Math.floor(r() * 7); if (r() < 0.15) items.push(LOOT.sp()); }
  else if (tier === 1) {
    gold = 8 + Math.floor(r() * 13); const x = r();
    if (x < 0.25) items.push(LOOT.hp()); else if (x < 0.4) items.push(LOOT.mp());
    else if (x < 0.5) items.push(item(LOOT.weapons[Math.floor(r() * 2)])); else if (x < 0.6) items.push(item(LOOT.armors[Math.floor(r() * 2)]));
  } else { gold = 400; items.push(item(LOOT.weapons[2]), item(LOOT.armors[2]), item({ name: 'Ashwing Heartscale', kind: 'quest', power: 0, value: 0 })); }
  return { gold, items };
}
export function chestLoot(r = Math.random) {
  const items = [LOOT.hp(), LOOT.trinket(r)];
  const x = r();
  if (x < 0.4) items.push(item(LOOT.weapons[Math.floor(r() * 3)])); else if (x < 0.8) items.push(item(LOOT.armors[Math.floor(r() * 3)])); else items.push(LOOT.mp());
  return { gold: 20 + Math.floor(r() * 40), items };
}

// ---------- World ----------
// Shared tile-grid behaviour for the overworld and cave interiors.
export class Grid {
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.t[y * this.w + x] : T.ROCK; }
  set(x, y, v) { if (x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1) this.t[y * this.w + x] = v; }
  walk(x, y) { return !BLOCK.has(this.get(x, y)); }
  canOccupy(px, py, rad) {
    for (const [ox, oy] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]])
      if (!this.walk(Math.floor((px + ox) / TILE), Math.floor((py + oy) / TILE))) return false;
    return true;
  }
  center(p) { return { x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE }; }
  disk(c, rad, v) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) this.set(c.x + dx, c.y + dy, v); }
}
// Overworld cave mouths (interiors are generated in caves.js).
export const CAVE_SITES = [
  { id: 'grotto', name: 'Pinehollow Grotto', x: 22, y: 17 },
  { id: 'rimewater', name: 'Rimewater Hollow', x: 24, y: 46 },
  { id: 'gloamfang', name: 'Gloamfang Den', x: 46, y: 28 },
];
export class World extends Grid {
  constructor(seed = 0xf2057401) {
    super();
    this.w = 72; this.h = 54;
    this.t = new Uint8Array(this.w * this.h);
    this.village = { x: 12, y: 12 }; this.ruins = { x: 56, y: 42 }; this.lair = { x: 58, y: 11 };
    const r = rng(seed);
    this.terrain(r);
    this.road(this.village, this.ruins, r); this.road(this.village, this.lair, r);
    this.buildVillage(); this.buildRuins(); this.buildLair(); this.buildFishing(); this.buildCaves(); this.placeChests(); this.placeEnemies(r);
  }
  get spawn() { return { x: this.village.x, y: this.village.y - 3 }; }
  get galestone() { return { x: this.ruins.x, y: this.ruins.y + 2 }; }
  region(tx, ty) {
    const d = (c) => Math.abs(c.x - tx) + Math.abs(c.y - ty);
    if (d(this.village) < 9) return 'Kettleford';
    if (d(this.ruins) < 10) return 'Barrow of Ostmark';
    if (d(this.lair) < 11) return 'Cinderhorn Peak';
    return ty < this.h / 2 ? 'Hrimvald Highlands' : 'Whitepass Vale';
  }
  terrain(r) {
    const cell = 6, gw = Math.floor(this.w / cell) + 2, gh = Math.floor(this.h / cell) + 2;
    const L = Array.from({ length: gw * gh }, r);
    const lerp = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell), tx = (x % cell) / cell, ty = (y % cell) / cell;
      const n = lerp(lerp(L[gy * gw + gx], L[gy * gw + gx + 1], tx), lerp(L[(gy + 1) * gw + gx], L[(gy + 1) * gw + gx + 1], tx), ty) + (r() - 0.5) * 0.16;
      const edge = x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1;
      let v = T.SNOW;
      if (edge || n > 0.78) v = T.ROCK; else if (n > 0.66) v = T.PINE; else if (n < 0.12) v = T.ICE; else if (n < 0.3) v = T.DEEP; else if (r() < 0.04) v = T.PINE;
      this.t[y * this.w + x] = v;
    }
  }
  road(a, b, r) {
    const p = { ...a };
    while (p.x !== b.x || p.y !== b.y) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!this.walk(p.x + dx, p.y + dy)) this.set(p.x + dx, p.y + dy, T.SNOW);
      this.set(p.x, p.y, T.ROAD);
      const hz = Math.abs(b.x - p.x) > Math.abs(b.y - p.y) ? 0.75 : 0.25;
      if (r() < hz && p.x !== b.x) p.x += Math.sign(b.x - p.x);
      else if (p.y !== b.y) p.y += Math.sign(b.y - p.y); else p.x += Math.sign(b.x - p.x);
    }
  }
  buildVillage() {
    const c = this.village; this.disk(c, 7, T.SNOW);
    for (let d = -7; d <= 7; d++) { this.set(c.x + d, c.y, T.ROAD); this.set(c.x, c.y + d, T.ROAD); }
    for (const [hx, hy] of [[-4, 2], [3, 2], [-4, -3], [3, -3]]) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) this.set(c.x + hx + dx, c.y + hy + dy, T.HUT);
    this.npcs = [
      { role: 'elder', name: 'Elder Maren', x: c.x + 1, y: c.y + 1, color: '#c9a0ff' },
      { role: 'hunter', name: 'Hunter Brannoc', x: c.x - 3, y: c.y - 1, color: '#8fd16a' },
      { role: 'merchant', name: 'Ilsa the Trader', x: c.x + 2, y: c.y - 1, color: '#ffcf6a' },
    ];
  }
  buildRuins() {
    const c = this.ruins; this.disk(c, 8, T.DEEP);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) this.set(c.x + dx, c.y + dy, (Math.abs(dx) === 6 || Math.abs(dy) === 5) ? T.WALL : T.FLOOR);
    for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) this.set(c.x + dx, c.y + dy, T.WALL);
    for (let d = -1; d <= 1; d++) this.set(c.x + d, c.y - 5, T.FLOOR);
    this.set(c.x - 6, c.y, T.FLOOR); this.set(c.x - 6, c.y - 1, T.FLOOR);
  }
  buildLair() {
    const c = this.lair; this.disk(c, 8, T.ASH);
    for (const [dx, dy] of [[-4, 3], [5, -2], [-2, -5], [2, 5]]) { this.set(c.x + dx, c.y + dy, T.LAVA); this.set(c.x + dx + 1, c.y + dy, T.LAVA); }
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) { const q = dx * dx + dy * dy; if (q >= 72 && q <= 90 && !(dx < 0 && Math.abs(dy) < 3)) this.set(c.x + dx, c.y + dy, T.ROCK); }
  }
  clear(c, rad) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad && !this.walk(c.x + dx, c.y + dy) && this.get(c.x + dx, c.y + dy) !== T.HUT) this.set(c.x + dx, c.y + dy, T.SNOW); }
  // Small frozen ponds/streams with fishing holes. Clear a snow margin so they're always reachable.
  buildFishing() {
    const v = this.village;
    this.fire = { x: v.x - 1, y: v.y + 3 }; // village cookfire
    const ponds = [{ name: 'Kettle Pond', c: { x: v.x + 6, y: v.y + 2 }, r: 1 }, { name: 'Highland Tarn', c: { x: 30, y: 9 }, r: 2 }];
    this.fishing = ponds.map((p, id) => { this.clear(p.c, p.r + 2); this.disk(p.c, p.r, T.ICE); return { id, name: p.name, x: p.c.x, y: p.c.y }; });
    // frozen stream in Whitepass Vale; fish from its bank
    for (let x = 32; x <= 40; x++) { for (let y = 35; y <= 39; y++) if (!this.walk(x, y)) this.set(x, y, T.SNOW); this.set(x, 37, T.ICE); }
    this.fishing.push({ id: 2, name: 'Vale Stream', x: 36, y: 37 });
    for (const [x, y] of [[32, 37], [40, 37]]) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!this.walk(x + dx, y + dy)) this.set(x + dx, y + dy, T.SNOW); }
  }
  // Cave mouths: clear a snow apron so each is reachable; the arch is drawn as a sprite.
  buildCaves() {
    this.caves = CAVE_SITES.map((c) => { this.clear(c, 2); this.set(c.x, c.y, T.SNOW); return { ...c }; });
  }
  placeChests() {
    const R = this.ruins, Lr = this.lair;
    this.chests = [[R.x + 4, R.y + 3], [R.x - 4, R.y - 3], [30, 30], [40, 18], [22, 44], [Lr.x + 6, Lr.y + 3]].map(([x, y], id) => {
      if (!this.walk(x, y)) this.set(x, y, T.SNOW); return { id, x, y };
    });
  }
  placeEnemies(r) {
    const s = []; let tries = 0;
    const far = (c, x, y, d) => Math.abs(c.x - x) + Math.abs(c.y - y) > d;
    while (s.length < 14 && tries++ < 4000) {
      const x = 2 + Math.floor(r() * (this.w - 4)), y = 2 + Math.floor(r() * (this.h - 4));
      if (this.walk(x, y) && far(this.village, x, y, 14) && far(this.ruins, x, y, 9) && far(this.lair, x, y, 11)) s.push({ kind: 'wolf', x, y });
    }
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -3], [-2, 3], [2, 3], [5, -3]]) s.push({ kind: 'wight', x: this.ruins.x + dx, y: this.ruins.y + dy });
    s.push({ kind: 'boss', x: this.lair.x, y: this.lair.y });
    this.spawns = s;
  }
}

// ---------- Quests ----------
export const WOLF_TARGET = 5;
export const MAIN = { TALK: 0, STONE: 1, RETURN: 2, SLAY: 3, DONE: 4 };
export function initialQuests() {
  return {
    main: { title: 'The Ashwing Wakes', stage: 0, side: false, stages: [
      'Speak with Elder Maren in Kettleford.',
      'Recover the Galestone from the Barrow of Ostmark (north-east).',
      'Return the Galestone to Elder Maren.',
      'Slay Vorthrax the Ashwing atop Cinderhorn Peak (south-east).',
      'Vorthrax is dead. Hrimvald breathes again.'] },
    side: { title: 'Teeth in the Snow', stage: 0, side: true, stages: [
      'Speak with Hunter Brannoc in Kettleford.',
      `Slay frost wolves roaming the passes (0/${WOLF_TARGET}).`,
      'Return to Hunter Brannoc for your reward.',
      "Brannoc's flock is safe. Reward claimed."] },
    fish: F.fishQuest(),
  };
}

// ---------- Player save data ----------
export function newSave(cls, world) {
  const C = CLASSES[cls], w = item(C.weapon), sp = world.center(world.spawn);
  return {
    v: 1, cls, level: 1, xp: 0, gold: 25,
    maxHp: C.hp, maxSt: C.st, maxMp: C.mp, hp: C.hp, st: C.st, mp: C.mp,
    inv: [w, LOOT.hp(), LOOT.hp(), LOOT.mp()], weapon: w.id, armor: null,
    quests: initialQuests(), cave: null, ret: null, caveFog: {}, lantern: false, gloamfang: false, torch: 0, stumps: {}, felled: 0, camp: null, cooked: 0, frostWard: 0, boneHook: false, wolves: 0, boss: false, galestone: false, chests: [],
    x: sp.x, y: sp.y, fog: new Array(Math.ceil(world.w * world.h / 32)).fill(0), savedAt: 0,
  };
}

export const xpNeeded = (lvl) => 80 + lvl * 60;
export function gainXP(s, amt) {
  s.xp += amt; let g = 0;
  while (s.xp >= xpNeeded(s.level)) { s.xp -= xpNeeded(s.level); s.level++; g++; s.maxHp += 12; s.maxSt += 8; s.maxMp += s.cls === 'mage' ? 14 : 6; }
  if (g) { s.hp = s.maxHp; s.st = s.maxSt; s.mp = s.maxMp; }
  return g;
}
export const weaponOf = (s) => s.inv.find((i) => i.id === s.weapon);
export const armorOf = (s) => s.inv.find((i) => i.id === s.armor);
export function meleeDamage(s, roll) {
  const C = CLASSES[s.cls], base = ((weaponOf(s)?.power) ?? 2) * C.melee + s.level * 1.5, crit = roll < C.crit;
  return { dmg: crit ? base * 2 : base, crit };
}
export const spellDamage = (s) => (10 + s.level * 2.5) * CLASSES[s.cls].spell;
export const empowered = (s) => s.quests.main.stage >= MAIN.SLAY;
export const shoutDamage = (s) => empowered(s) ? 30 + s.level * 4 : 12 + s.level * 2;
export const shoutCooldown = (s) => empowered(s) ? 9 : 15;
export const mitigate = (s, raw) => Math.max(1, raw * (1 - Math.min(0.6, ((armorOf(s)?.power) ?? 0) * 0.05)));

export function equip(s, id) {
  const it = s.inv.find((i) => i.id === id); if (!it) return;
  if (it.kind === 'weapon') s.weapon = id;
  if (it.kind === 'armor') s.armor = s.armor === id ? null : id;
}
export function use(s, id) {
  const i = s.inv.findIndex((x) => x.id === id); if (i < 0) return null;
  const it = s.inv[i];
  if (it.kind === 'hpot') s.hp = Math.min(s.maxHp, s.hp + it.power);
  else if (it.kind === 'mpot') s.mp = Math.min(s.maxMp, s.mp + it.power);
  else if (it.kind === 'spot') s.st = Math.min(s.maxSt, s.st + it.power);
  else if (it.kind === 'food' || it.kind === 'ward') { const m = F.eat(s, it); s.inv.splice(i, 1); F.syncFishQuest(s); return m; }
  else return null;
  s.inv.splice(i, 1); return `Drank ${it.name}`;
}
export function sell(s, id) {
  const i = s.inv.findIndex((x) => x.id === id); if (i < 0) return 0;
  const it = s.inv[i]; if (it.kind === 'quest' || it.id === s.weapon) return 0;
  if (it.id === s.armor) s.armor = null;
  const p = sellPrice(it); s.inv.splice(i, 1); s.gold += p; F.syncFishQuest(s); return p;
}
export const sellPrice = (it) => (it.kind === 'fish' || it.kind === 'wood') ? it.value : Math.max(1, Math.floor(it.value / 2)); // Ilsa pays full price for fresh fish and wood
export function wolfKill(s) {
  const q = s.quests.side; if (q.stage !== 1) return;
  s.wolves++;
  if (s.wolves >= WOLF_TARGET) q.stage = 2; else q.stages[1] = `Slay frost wolves roaming the passes (${s.wolves}/${WOLF_TARGET}).`;
}

// fog bitset (32 bits per entry)
export const explored = (s, i) => (s.fog[i >> 5] >>> (i & 31)) & 1;
// Each cave keeps its own explored bitset in s.caveFog[id]; the overworld uses s.fog.
export function fogOf(s, world) {
  if (!world.cave) return s.fog;
  return (s.caveFog[world.cave] ||= new Array(Math.ceil(world.w * world.h / 32)).fill(0));
}
export function reveal(s, world, tx, ty, rad) {
  const out = [], fog = fogOf(s, world);
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (dx * dx + dy * dy > rad * rad) continue;
    const x = tx + dx, y = ty + dy; if (!world.in(x, y)) continue;
    const i = y * world.w + x;
    if (!((fog[i >> 5] >>> (i & 31)) & 1)) { fog[i >> 5] |= (1 << (i & 31)); out.push(i); }
  }
  return out;
}

// NPC dialogue: mutates save, returns {text, shop?}
export function talk(s, role) {
  const m = s.quests.main, q = s.quests.side;
  if (role === 'elder') {
    if (m.stage === MAIN.TALK) { m.stage = MAIN.STONE; return { text: "The Ashwing stirs on Cinderhorn. Ash falls on our roofs like black snow. Only the old Galecry can break its wings - and the Galestone that holds it lies in the Barrow of Ostmark, north-east. Bring it to me." }; }
    if (m.stage === MAIN.STONE) return { text: 'The Barrow lies north-east, past the pines. The Hollow Wights guard it jealously.' };
    if (m.stage === MAIN.RETURN) {
      m.stage = MAIN.SLAY; s.inv = s.inv.filter((i) => i.name !== 'Galestone'); gainXP(s, 120); s.gold += 100;
      return { text: 'The stone sings! Breathe with it... There. Your Galecry now carries the storm itself. Go south-east to Cinderhorn and end Vorthrax. (+100 gold, Galecry empowered)' };
    }
    if (m.stage === MAIN.SLAY) return { text: 'Cinderhorn waits to the south-east. Use your Galecry when its wings are spread.' };
    return { text: 'The skies are clear for the first time in a generation. Kettleford owes you everything.' };
  }
  if (role === 'hunter') {
    if (q.stage !== 0 && q.stage !== 2) { const f = F.hunterFish(s, item); if (f) { if (s.quests.fish.stage === 2) gainXP(s, 40); return { text: f }; } }
    if (q.stage === 0) { q.stage = 1; return { text: `Frost wolves have been taking my goats. Thin their numbers - ${WOLF_TARGET} pelts' worth - and I'll make it worth your while.` }; }
    if (q.stage === 1) return { text: `Still hearing howls. ${s.wolves}/${WOLF_TARGET} so far.` };
    if (q.stage === 2) { q.stage = 3; s.gold += 75; gainXP(s, 60); s.inv.push(item(LOOT.armors[0]), LOOT.sp()); return { text: 'Quiet nights at last! Take this mantle and some coin. (+75 gold, Fur Mantle)' }; }
    return { text: 'My goats thank you. Well, they would if they could.' };
  }
  return { text: 'Potions, 30 gold apiece. I buy whatever you drag out of those barrows - and fresh fish or good pine, full price.', shop: true };
}
export function buy(s, kind) {
  if (s.gold < 30) return false;
  s.gold -= 30; s.inv.push(kind === 'mp' ? LOOT.mp() : kind === 'sp' ? LOOT.sp() : LOOT.hp()); return true;
}

export const SAVE_KEY = 'frosthold.save.v1';
export const serialize = (s) => JSON.stringify({ ...s, savedAt: Date.now() });
export function deserialize(str) {
  try {
    const s = JSON.parse(str); if (!(s && s.v === 1 && CLASSES[s.cls])) return null;
    s.quests.fish ||= F.fishQuest(); s.cooked ||= 0; s.frostWard ||= 0; s.boneHook ||= false; // migrate pre-fishing saves
    s.cave ??= null; s.ret ??= null; s.caveFog ||= {}; s.lantern ||= false; s.gloamfang ||= false; s.torch ||= 0; s.stumps ||= {}; s.felled ||= 0; s.camp ??= null; // pre-cave saves
    return s;
  } catch { return null; }
}
