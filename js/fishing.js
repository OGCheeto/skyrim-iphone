// Frosthold fishing: pure logic (fish table, minigame state machine, cooking, Brannoc's icefin quest).
export const FISH = {
  icefin:    { name: 'Icefin',         rarity: 'common',   weight: 50, value: 8,  zone: 0.34, speed: 0.35,
               cooked: { name: 'Grilled Icefin', kind: 'food', stat: 'hp', power: 35, value: 12 } },
  silverjaw: { name: 'Silverjaw',      rarity: 'common',   weight: 30, value: 12, zone: 0.30, speed: 0.45,
               cooked: { name: 'Smoked Silverjaw', kind: 'food', stat: 'st', power: 60, value: 16 } },
  pike:      { name: 'Glacier Pike',   rarity: 'uncommon', weight: 15, value: 26, zone: 0.26, speed: 0.6,
               cooked: { name: 'Pike Steak', kind: 'food', stat: 'hp', power: 70, value: 34 } },
  frostgill: { name: 'Frostgill Eel',  rarity: 'rare',     weight: 5,  value: 60, zone: 0.22, speed: 0.75,
               cooked: { name: 'Frostgill Jerky', kind: 'ward', stat: 'frost', power: 120, value: 70 } },
};
export const ICEFIN_TARGET = 3;
export const WARD_REDUCTION = 0.3; // Frostgill Jerky: -30% damage from frost wolves & wights while active
export const BITE = { base: 0.22, stormBonus: 0.8, minWait: 1.5, window: 0.8 };
export const REEL = { start: 0.3, fill: 0.28, drain: 0.32, snapAfter: 1.2, lift: 2.6, gravity: 1.9, hookBonus: 1.2 };

export function rollFish(r = Math.random) {
  const tot = Object.values(FISH).reduce((a, f) => a + f.weight, 0); let x = r() * tot;
  for (const [k, f] of Object.entries(FISH)) { x -= f.weight; if (x < 0) return k; }
  return 'icefin';
}
/** Per-second bite chance; storms (0..1) raise it. */
export const biteRate = (storm = 0) => BITE.base * (1 + BITE.stormBonus * Math.max(0, Math.min(1, storm)));

/** Minigame: wait -> bite -> reel -> caught | lost | snapped | cancelled. */
export class FishingGame {
  constructor({ storm = 0, hook = false, r = Math.random } = {}) {
    this.r = r; this.storm = storm; this.hook = hook; this.state = 'wait'; this.t = 0; this.reason = '';
    this.fish = null; this.marker = 0.5; this.vel = 0; this.zone = 0.5; this.zoneTarget = 0.5; this.meter = 0; this.out = 0; this.holding = false; this.dip = 0;
  }
  get done() { return ['caught', 'lost', 'snapped', 'cancelled'].includes(this.state); }
  get zoneWidth() { return FISH[this.fish]?.zone * (this.hook ? REEL.hookBonus : 1) || 0.3; }
  get inZone() { return Math.abs(this.marker - this.zone) <= this.zoneWidth / 2; }
  end(state, reason) { this.state = state; this.reason = reason; this.holding = false; return state; }
  cancel() { if (!this.done) this.end('cancelled', 'You reel in your line.'); }
  /** Tap: hooks the fish if it's biting; tapping early spooks it. */
  tap() {
    if (this.state === 'wait') return this.end('lost', 'Too eager — the fish spooked.');
    if (this.state === 'bite') { this.state = 'reel'; this.t = 0; this.meter = REEL.start; this.marker = 0.5; this.vel = 0; this.zone = this.zoneTarget = 0.5; return 'reel'; }
    return this.state;
  }
  hold(on) { if (this.state === 'reel') this.holding = !!on; }
  update(dt) {
    if (this.done) return this.state;
    this.t += dt;
    if (this.state === 'wait') {
      if (this.t >= BITE.minWait && this.r() < biteRate(this.storm) * dt) { this.state = 'bite'; this.t = 0; this.fish = rollFish(this.r); return 'bite!'; }
    } else if (this.state === 'bite') {
      this.dip = 1 - this.t / BITE.window;
      if (this.t > BITE.window) return this.end('lost', 'Too slow — it stole the bait.');
    } else if (this.state === 'reel') {
      const f = FISH[this.fish];
      this.vel += (this.holding ? REEL.lift : -REEL.gravity) * dt; this.vel *= Math.pow(0.15, dt);
      this.marker += this.vel * dt; if (this.marker < 0) { this.marker = 0; this.vel = 0; } if (this.marker > 1) { this.marker = 1; this.vel = 0; }
      if (Math.abs(this.zone - this.zoneTarget) < 0.02) this.zoneTarget = 0.15 + this.r() * 0.7;
      this.zone += Math.sign(this.zoneTarget - this.zone) * Math.min(Math.abs(this.zoneTarget - this.zone), f.speed * dt);
      if (this.inZone) { this.meter += REEL.fill * dt; this.out = 0; } else { this.meter -= REEL.drain * dt; this.out += dt; }
      if (this.meter >= 1) return this.end('caught', `Caught a ${f.name}!`);
      if (this.meter <= 0) return this.end('lost', 'It slipped the hook.');
      if (this.out >= REEL.snapAfter) return this.end('snapped', 'Snap! The line broke.');
    }
    return this.state;
  }
}

// ---------- Items, cooking, quest (operate on the save object) ----------
export const rawFishItem = (key, mk) => mk({ name: FISH[key].name, kind: 'fish', fish: key, power: 0, value: FISH[key].value });
export const isRaw = (it) => it && it.kind === 'fish';
export function cook(s, id, mk) {
  const i = s.inv.findIndex((x) => x.id === id); const it = s.inv[i]; if (!isRaw(it)) return null;
  const c = FISH[it.fish].cooked; s.inv.splice(i, 1, mk({ ...c })); s.cooked = (s.cooked || 0) + 1; return c.name;
}
export function eat(s, it) {
  if (it.kind === 'food') { const k = it.stat === 'st' ? 'st' : 'hp', mx = k === 'st' ? s.maxSt : s.maxHp; s[k] = Math.min(mx, s[k] + it.power); return `Ate ${it.name}`; }
  if (it.kind === 'ward') { s.frostWard = Math.max(s.frostWard || 0, it.power); return `Ate ${it.name}: frost resistance for ${it.power}s`; }
  return null;
}
export const frostScale = (s, kind) => (s.frostWard > 0 && (kind === 'wolf' || kind === 'wight')) ? 1 - WARD_REDUCTION : 1;
export const icefinCount = (s) => s.inv.filter((i) => i.kind === 'fish' && i.fish === 'icefin').length;
export function fishQuest() {
  return { title: 'A Taste of Icefin', stage: 0, side: true, stages: [
    'Ask Hunter Brannoc in Kettleford what he needs.',
    `Bring Hunter Brannoc ${ICEFIN_TARGET} raw Icefin (0/${ICEFIN_TARGET}). Try Kettle Pond on the east side of the village.`,
    "Brannoc's smokehouse is full. Reward claimed."] };
}
export function syncFishQuest(s) {
  const q = s.quests.fish; if (q && q.stage === 1) q.stages[1] = q.stages[1].replace(/\(\d+\/\d+\)/, `(${Math.min(ICEFIN_TARGET, icefinCount(s))}/${ICEFIN_TARGET})`);
}
/** Hunter dialogue for the fishing quest. Returns text or null if nothing to say. */
export function hunterFish(s, mk) {
  const q = s.quests.fish;
  if (q.stage === 0) { q.stage = 1; syncFishQuest(s); return `One more thing — my smokehouse is empty. Bring me ${ICEFIN_TARGET} raw Icefin. Kettle Pond, east side of the village; tap Use at the hole. Storms make them bite.`; }
  if (q.stage === 1 && icefinCount(s) >= ICEFIN_TARGET) {
    let n = ICEFIN_TARGET; s.inv = s.inv.filter((i) => !(i.kind === 'fish' && i.fish === 'icefin' && n-- > 0));
    q.stage = 2; s.gold += 60; s.boneHook = true; s.inv.push(mk({ name: 'Bone Hook', kind: 'quest', power: 0, value: 0 }));
    return 'Fat ones! Here — 60 gold, and my old bone hook. It holds a line steadier. (+60 gold, Bone Hook: wider tension zone)';
  }
  if (q.stage === 1) { syncFishQuest(s); return `Icefin: ${Math.min(ICEFIN_TARGET, icefinCount(s))}/${ICEFIN_TARGET}. Kettle Pond's on the east side of the village.`; }
  return null;
}
