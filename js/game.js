import * as C from './core.js';
import * as Wx from './weather.js';
import * as F from './fishing.js';
import { sfx, unlockAudio, setScene, suspendAudio, resumeAudio, getSettings, setSettings, combatLevel, audioDebug } from './audio.js';

const { TILE, T } = C;
const $ = (id) => document.getElementById(id);
const cv = $('game'), g = cv.getContext('2d');
const world = new C.World();
const WW = world.w * TILE, WH = world.h * TILE;
let W = 0, H = 0, DPR = 1, ZOOM = 1.25;

let S = null;                 // save data
let ents = [], shots = [], fx = [], texts = [];
let P = null;                 // runtime player
let sinceCombat = 99, sceneT = 0;
let running = false, paused = false, last = 0, shoutCd = 0, regenT = 0, hudT = 0;
const input = { mx: 0, my: 0, attack: false, spell: false, shout: false, use: false };

// ---------- Layout ----------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ZOOM = H < 450 ? 1.15 : 1.5;
}
addEventListener('resize', resize); resize();

// ---------- Terrain pre-render ----------
const terrain = document.createElement('canvas'); terrain.width = WW; terrain.height = WH;
const fogC = document.createElement('canvas'); fogC.width = world.w; fogC.height = world.h;
(function drawTerrain() {
  const t = terrain.getContext('2d'), r = C.rng(77);
  const col = { [T.SNOW]: '#dfe8f0', [T.DEEP]: '#c9d6e3', [T.ROCK]: '#5d6672', [T.PINE]: '#d4dee9', [T.ROAD]: '#a99c8a', [T.ICE]: '#a9d4ec',
    [T.WALL]: '#4a4f5a', [T.FLOOR]: '#7c7f86', [T.ASH]: '#3a3432', [T.LAVA]: '#e0662b', [T.HUT]: '#c9d6e3' };
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const v = world.get(x, y), px = x * TILE, py = (world.h - 1 - y) * TILE;
    t.fillStyle = col[v]; t.fillRect(px, py, TILE, TILE);
    const j = r();
    if (v === T.SNOW || v === T.DEEP) { t.fillStyle = '#ffffff'; t.globalAlpha = 0.5; t.fillRect(px + j * 26, py + r() * 26, 3, 2); t.globalAlpha = 1; }
    if (v === T.ROCK) { t.fillStyle = '#7a8492'; t.beginPath(); t.moveTo(px + 2, py + 30); t.lineTo(px + 10 + j * 12, py + 4); t.lineTo(px + 30, py + 30); t.fill(); t.fillStyle = '#eef3f8'; t.beginPath(); t.moveTo(px + 8 + j * 12, py + 10); t.lineTo(px + 10 + j * 12, py + 4); t.lineTo(px + 14 + j * 12, py + 10); t.fill(); }
    if (v === T.PINE) { t.fillStyle = '#5a3d2a'; t.fillRect(px + 14, py + 24, 4, 7); t.fillStyle = j < 0.5 ? '#1f4a36' : '#26573f'; t.beginPath(); t.moveTo(px + 16, py + 1); t.lineTo(px + 4, py + 26); t.lineTo(px + 28, py + 26); t.fill(); t.fillStyle = '#f2f6fa'; t.beginPath(); t.moveTo(px + 16, py + 1); t.lineTo(px + 11, py + 11); t.lineTo(px + 21, py + 11); t.fill(); }
    if (v === T.ICE) { t.strokeStyle = '#ffffff88'; t.beginPath(); t.moveTo(px + 4, py + 8 + j * 10); t.lineTo(px + 26, py + 16); t.stroke(); }
    if (v === T.WALL) { t.strokeStyle = '#2c3038'; t.strokeRect(px + 1, py + 1, 14, 14); t.strokeRect(px + 16, py + 16, 14, 14); }
    if (v === T.FLOOR) { t.strokeStyle = '#6a6d74'; t.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1); }
    if (v === T.ASH) { t.fillStyle = '#5a4a44'; t.fillRect(px + j * 26, py + r() * 26, 4, 3); }
    if (v === T.LAVA) { t.fillStyle = '#ffb347'; t.fillRect(px + 6, py + 6 + j * 14, 10, 4); }
  }
  // huts: draw 2x2 roofs
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (world.get(x, y) !== T.HUT || world.get(x - 1, y) === T.HUT || world.get(x, y + 1) === T.HUT) continue;
    const px = x * TILE, py = (world.h - 1 - y) * TILE;
    t.fillStyle = '#6b4a32'; t.fillRect(px + 2, py + 20, 60, 42);
    t.fillStyle = '#4a3324'; t.beginPath(); t.moveTo(px - 4, py + 24); t.lineTo(px + 32, py - 2); t.lineTo(px + 68, py + 24); t.fill();
    t.fillStyle = '#f2f6fa'; t.fillRect(px - 2, py + 18, 68, 5);
    t.fillStyle = '#ffcf6a'; t.fillRect(px + 26, py + 44, 12, 18);
  }
})();
function rebuildFog() {
  const f = fogC.getContext('2d'); const img = f.createImageData(world.w, world.h);
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const o = ((world.h - 1 - y) * world.w + x) * 4; img.data[o + 3] = C.explored(S, y * world.w + x) ? 0 : 255;
    img.data[o] = 8; img.data[o + 1] = 12; img.data[o + 2] = 20;
  }
  f.putImageData(img, 0, 0);
}
function revealFog(list) {
  const f = fogC.getContext('2d');
  for (const i of list) { const x = i % world.w, y = Math.floor(i / world.w); f.clearRect(x, world.h - 1 - y, 1, 1); }
}

// ---------- Game setup ----------
function spawnEnemies() {
  ents = [];
  for (const sp of world.spawns) {
    if (sp.kind === 'boss' && S.boss) continue;
    const d = C.ENEMIES[sp.kind], c = world.center(sp);
    ents.push({ kind: sp.kind, d, x: c.x, y: c.y, hx: c.x, hy: c.y, hp: d.hp, cd: 0, stun: 0, kx: 0, ky: 0, flash: 0, t: Math.random() * 10, phase: 0, breath: 3 });
  }
}
function startGame(save) {
  S = save;
  P = { x: S.x, y: S.y, fx: 0, fy: -1, swing: 0, inv: 0, cast: 0, shoutFx: 0, walk: 0 };
  shots = []; fx = []; texts = []; shoutCd = 0;
  spawnEnemies(); rebuildFog();
  revealFog(C.reveal(S, world, Math.floor(P.x / TILE), Math.floor(P.y / TILE), 6));
  ['title', 'classSel', 'panel'].forEach((id) => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  running = true; paused = false; updateHud(true);
  toast(world.region(Math.floor(P.x / TILE), Math.floor(P.y / TILE)));
}
function save(quiet) {
  if (!S) return; S.x = P.x; S.y = P.y;
  try { localStorage.setItem(C.SAVE_KEY, C.serialize(S)); if (!quiet) toast('Game saved'); } catch (e) { toast('Save failed'); }
}
function loadSave() { const s = C.deserialize(localStorage.getItem(C.SAVE_KEY)); return s; }

// ---------- Messages ----------
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.style.opacity = 1; toastT = 2.6; }
function floatText(x, y, s, color = '#fff') { texts.push({ x, y, s, color, t: 1 }); }

// ---------- Combat ----------
function hurtEnemy(e, dmg, kx = 0, ky = 0, stun = 0) {
  e.hp -= dmg; e.flash = 0.15; e.kx += kx; e.ky += ky; e.stun = Math.max(e.stun, stun);
  floatText(e.x, e.y + e.d.r + 10, Math.round(dmg), '#ffd27a'); sfx.hit();
  for (let i = 0; i < 5; i++) fx.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, t: 0.4, c: e.kind === 'wolf' ? '#b33' : '#999' });
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  ents = ents.filter((x) => x !== e);
  const loot = C.rollLoot(e.d.tier); S.gold += loot.gold; S.inv.push(...loot.items);
  const lv = C.gainXP(S, e.d.xp);
  let msg = `${e.d.name} slain  +${e.d.xp} XP`; if (loot.gold) msg += `  +${loot.gold}g`;
  if (loot.items.length) msg += '\n' + loot.items.map((i) => i.name).join(', ');
  if (e.kind === 'wolf') { const before = S.quests.side.stage; C.wolfKill(S); if (S.quests.side.stage !== before) { msg += '\nQuest updated: return to Brannoc'; sfx.quest(); } }
  if (e.kind === 'boss') { S.boss = true; S.quests.main.stage = C.MAIN.DONE; msg = 'VORTHRAX THE ASHWING HAS FALLEN\n+500 XP  +400 gold\nRuned Greatblade, Wardplate'; sfx.quest(); save(true); }
  toast(msg); if (loot.items.length || loot.gold) sfx.loot();
  if (lv) levelUp();
}
function levelUp() { sfx.level(); setTimeout(() => toast(`LEVEL UP!  You are now level ${S.level}`), 900); save(true); }
function hurtPlayer(dmg) {
  if (P.inv > 0 || S.hp <= 0) return;
  const d = C.mitigate(S, dmg); S.hp -= d; P.inv = 0.45; sfx.hurt();
  floatText(P.x, P.y + 20, Math.round(d), '#ff6b6b');
  if (S.hp <= 0) { S.hp = 0; die(); }
}
function die() {
  sfx.die(); paused = true;
  dialog('You have fallen', 'The cold takes you... but Hrimvald is not done with you yet.', [
    ['Load last save', () => { const s = loadSave(); s ? startGame(s) : respawn(); }],
    ['Wake in Kettleford (-10% gold)', respawn],
  ]);
}
function respawn() {
  closeDialog(); S.gold = Math.floor(S.gold * 0.9); S.hp = S.maxHp; S.st = S.maxSt; S.mp = S.maxMp;
  const c = world.center(world.spawn); S.x = c.x; S.y = c.y; startGame(S);
}

function doAttack() {
  const Cl = C.CLASSES[S.cls];
  if (P.swing > 0 || S.st < Cl.swing) return;
  S.st -= Cl.swing; P.swing = S.cls === 'rogue' ? 0.28 : 0.4; sfx.swing();
  const reach = 46;
  for (const e of [...ents]) {
    const dx = e.x - P.x, dy = e.y - P.y, dist = Math.hypot(dx, dy);
    if (dist > reach + e.d.r) continue;
    if (dist > 8 && (dx * P.fx + dy * P.fy) / dist < 0.2) continue;
    const { dmg, crit } = C.meleeDamage(S, Math.random());
    if (crit) floatText(e.x, e.y + 30, 'CRIT', '#ff4');
    hurtEnemy(e, dmg, (dx / (dist || 1)) * 60, (dy / (dist || 1)) * 60, 0.15);
  }
}
function doSpell() {
  const Cl = C.CLASSES[S.cls];
  if (P.cast > 0 || S.mp < Cl.cast) return;
  S.mp -= Cl.cast; P.cast = 0.45; sfx.spell();
  shots.push({ x: P.x + P.fx * 16, y: P.y + P.fy * 16, vx: P.fx * 380, vy: P.fy * 380, t: 1.1, dmg: C.spellDamage(S), friendly: true, pierce: S.cls === 'mage', hit: new Set(), c: '#9fd8ff', r: 6 });
}
function doShout() {
  if (shoutCd > 0) return;
  shoutCd = C.shoutCooldown(S); P.shoutFx = 0.6; sfx.shout();
  const range = C.empowered(S) ? 220 : 160;
  for (const e of [...ents]) {
    const dx = e.x - P.x, dy = e.y - P.y, dist = Math.hypot(dx, dy) || 1;
    if (dist > range + e.d.r || (dx * P.fx + dy * P.fy) / dist < 0.45) continue;
    const kb = e.kind === 'boss' ? 60 : 260;
    hurtEnemy(e, C.shoutDamage(S), (dx / dist) * kb, (dy / dist) * kb, e.kind === 'boss' ? 1.2 : 2.2);
  }
  shots = shots.filter((s) => s.friendly); // the gale blows enemy fire away
  for (let i = 0; i < 40; i++) { const a = Math.atan2(P.fy, P.fx) + (Math.random() - 0.5) * 1.3, v = 250 + Math.random() * 250; fx.push({ x: P.x, y: P.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.6, c: '#e8f4ff' }); }
}

// ---------- Interaction ----------
function nearest() {
  const tx = P.x / TILE - 0.5, ty = P.y / TILE - 0.5, near = (o) => Math.hypot(o.x - tx, o.y - ty) < 1.6;
  for (const n of world.npcs) if (near(n)) return { type: 'npc', n, label: `Talk to ${n.name}` };
  for (const c of world.chests) if (!S.chests.includes(c.id) && near(c)) return { type: 'chest', c, label: 'Open chest' };
  const gs = world.galestone; if (!S.galestone && near(gs)) return { type: 'stone', label: 'Take the Galestone' };
  const near2 = (o) => Math.hypot(o.x - tx, o.y - ty) < 2.2;
  for (const f of world.fishing) if (near2(f)) return { type: 'fish', f, label: `Fish at ${f.name}` };
  if (near2(world.fire) && S.inv.some(F.isRaw)) return { type: 'fire', label: 'Cook fish at the fire' };
  return null;
}
function doUse() {
  const it = nearest(); if (!it) return;
  sfx.click();
  if (it.type === 'npc') {
    const before = [S.quests.main.stage, S.quests.side.stage, S.quests.fish.stage], lvl = S.level, res = C.talk(S, it.n.role);
    if (before[0] !== S.quests.main.stage || before[1] !== S.quests.side.stage || before[2] !== S.quests.fish.stage) { sfx.quest(); save(true); }
    if (S.level > lvl) levelUp();
    const btns = res.shop ? [['Health potion (30g)', () => shop('hp')], ['Magicka potion (30g)', () => shop('mp')], ['Sell loot', () => { closeDialog(); openPanel('inv', true); }], ['Leave', closeDialog]] : [['Farewell', closeDialog]];
    dialog(it.n.name, res.text, btns);
  } else if (it.type === 'chest') {
    S.chests.push(it.c.id); const l = C.chestLoot(); S.gold += l.gold; S.inv.push(...l.items); sfx.loot();
    toast(`Chest: +${l.gold}g\n${l.items.map((i) => i.name).join(', ')}`); save(true);
  } else if (it.type === 'fish') startFishing(it.f);
  else if (it.type === 'fire') {
    const names = []; for (const f of S.inv.filter(F.isRaw)) names.push(F.cook(S, f.id, C.item));
    F.syncFishQuest(S); sfx.cook(); toast(`Cooked ${names.length}: ${[...new Set(names)].join(', ')}`); save(true);
  } else if (it.type === 'stone') {
    S.galestone = true; S.inv.push(C.item({ name: 'Galestone', kind: 'quest', power: 0, value: 0 }));
    if (S.quests.main.stage <= C.MAIN.STONE) S.quests.main.stage = C.MAIN.RETURN;
    sfx.quest(); toast('The Galestone hums with a trapped storm.\nQuest updated: return to Elder Maren'); save(true);
  }
}
function shop(k) { if (C.buy(S, k)) { sfx.loot(); toast(`Bought potion. ${S.gold}g left`); } else toast('Not enough gold'); }

// ---------- Fishing ----------
let fishing = null, fishEndT = 0;
const fcv = $('fishCv'), fg = fcv.getContext('2d');
function startFishing(spot) {
  const threat = ents.some((e) => e.awake && Math.hypot(e.x - P.x, e.y - P.y) < 320);
  if (threat) { toast('Not with enemies this close!'); return; }
  fishing = new F.FishingGame({ storm: weather.mix('storm'), hook: S.boneHook }); fishing.spot = spot; fishEndT = 0;
  paused = true; $('fishing').classList.remove('hidden'); $('fishMsg').textContent = 'Waiting for a bite… tap when the bobber dips'; sfx.splash();
}
function endFishing() { fishing = null; $('fishing').classList.add('hidden'); paused = false; updateHud(true); }
function fishPress(on) {
  if (!fishing || fishing.done) return;
  if (on) { const st = fishing.state, r = fishing.tap(); if (st === 'bite' && r === 'reel') { sfx.splash(); $('fishMsg').textContent = 'Hold to raise · release to sink · keep the marker in the zone'; } fishing.hold(true); }
  else fishing.hold(false);
}
$('fishing').addEventListener('pointerdown', (e) => { if (e.target.id === 'fishCancel') return; e.preventDefault(); fishPress(true); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('fishing').addEventListener(ev, () => fishPress(false));
$('fishCancel').onclick = (e) => { e.stopPropagation(); if (fishing) { fishing.cancel(); finishFishing(); } };
function finishFishing() {
  const f = fishing; $('fishMsg').textContent = f.reason; fishEndT = 1.4;
  if (f.state === 'caught') { S.inv.push(F.rawFishItem(f.fish, C.item)); F.syncFishQuest(S); sfx.loot(); save(true); toast(`${F.FISH[f.fish].name} (${F.FISH[f.fish].rarity})`); }
  else if (f.state === 'snapped') sfx.hurt(); else if (f.state === 'cancelled') fishEndT = 0.2;
}
function updateFishing(dt) {
  if (!fishing) return;
  if (fishing.done) { fishEndT -= dt; if (fishEndT <= 0) endFishing(); return; }
  const before = fishing.state, r = fishing.update(dt);
  if (r === 'bite!') { sfx.bite(); $('fishMsg').textContent = 'BITE! Tap now!'; }
  if (fishing.done && before !== fishing.state) finishFishing();
}
function drawFishing(time) {
  const f = fishing; if (!f) return;
  const w = fcv.clientWidth, h = fcv.clientHeight; if (fcv.width !== w * DPR) { fcv.width = w * DPR; fcv.height = h * DPR; }
  fg.setTransform(DPR, 0, 0, DPR, 0, 0); fg.clearRect(0, 0, w, h);
  const cx = w * 0.38, cy = h * 0.52;
  fg.fillStyle = '#cfe3f0'; fg.beginPath(); fg.ellipse(cx, cy, w * 0.26, h * 0.3, 0, 0, 7); fg.fill(); // ice
  fg.fillStyle = '#123a5a'; fg.beginPath(); fg.ellipse(cx, cy, w * 0.11, h * 0.13, 0, 0, 7); fg.fill(); // hole
  const bob = f.state === 'bite' ? 10 + 6 * Math.sin(time / 40) : Math.sin(time / 400) * 2, by = cy + bob;
  fg.strokeStyle = '#fff8'; fg.lineWidth = 1; fg.beginPath(); fg.moveTo(cx + 120, cy - 140); fg.lineTo(cx, by - 8); fg.stroke();
  fg.fillStyle = '#e8463a'; fg.beginPath(); fg.arc(cx, by - 4, 7, Math.PI, 0); fg.fill(); fg.fillStyle = '#fff'; fg.beginPath(); fg.arc(cx, by - 4, 7, 0, Math.PI); fg.fill();
  if (f.state === 'bite') { fg.strokeStyle = '#ffffffaa'; fg.lineWidth = 2; for (let k = 1; k <= 2; k++) { fg.beginPath(); fg.ellipse(cx, by, 12 * k + (time / 30) % 10, 5 * k, 0, 0, 7); fg.stroke(); } }
  if (f.state === 'reel' || (f.done && f.fish && f.meter > 0)) {
    const bx = w * 0.72, bt = h * 0.12, bh = h * 0.7, bw = 34;
    fg.fillStyle = '#0b121ccc'; fg.fillRect(bx, bt, bw, bh); fg.strokeStyle = '#fff5'; fg.strokeRect(bx, bt, bw, bh);
    const zw = f.zoneWidth * bh, zy = bt + (1 - f.zone) * bh - zw / 2;
    fg.fillStyle = f.inZone ? '#3fa34dcc' : '#d4b04c99'; fg.fillRect(bx + 2, zy, bw - 4, zw);
    const my = bt + (1 - f.marker) * bh; fg.fillStyle = '#fff'; fg.fillRect(bx - 6, my - 3, bw + 12, 6);
    const mx = bx + bw + 16; fg.fillStyle = '#0b121ccc'; fg.fillRect(mx, bt, 12, bh); fg.fillStyle = f.out > 0.8 ? '#c0392b' : '#2f9fd6'; fg.fillRect(mx, bt + bh * (1 - Math.max(0, f.meter)), 12, bh * Math.max(0, f.meter));
    fg.fillStyle = '#fff'; fg.font = '11px Georgia'; fg.textAlign = 'center'; fg.fillText('Tension', bx + bw / 2, bt + bh + 14); fg.fillText('Catch', mx + 6, bt + bh + 14);
    if (f.out > 0.5 && !f.done) { fg.fillStyle = '#ff6b5a'; fg.fillText('Line straining!', bx + bw / 2, bt - 6); }
  }
  fg.fillStyle = '#d4b04c'; fg.font = 'bold 14px Georgia'; fg.textAlign = 'left'; fg.fillText(`${f.spot.name}${f.storm > 0.3 ? ' · storm: fish are biting' : ''}`, 16, 22);
}

// ---------- Dialog / panels ----------
function dialog(name, text, buttons) {
  paused = true; $('dlgName').textContent = name; $('dlgText').textContent = text;
  const b = $('dlgBtns'); b.innerHTML = '';
  for (const [label, fn] of buttons) { const el = document.createElement('button'); el.textContent = label; el.onclick = fn; b.appendChild(el); }
  $('dialog').classList.remove('hidden');
}
function closeDialog() { $('dialog').classList.add('hidden'); paused = false; }

let tab = 'inv', selling = false;
function openPanel(t = tab, sell = false) { tab = t; selling = sell; paused = true; $('panel').classList.remove('hidden'); renderPanel(); }
function closePanel() { $('panel').classList.add('hidden'); paused = false; selling = false; updateHud(true); }
function audioRow(k, label) {
  const st = getSettings(), muted = st[k === 'music' ? 'musicMuted' : 'ambienceMuted'];
  return `<div class="it"><span class="n">${label}</span><input type="range" id="vol-${k}" min="0" max="100" value="${Math.round(st[k] * 100)}" style="width:40%"><button id="mute-${k}">${muted ? 'Unmute' : 'Mute'}</button></div>`;
}
const kindLabel = { fish: 'Raw fish', food: 'Food', ward: 'Food', weapon: 'Weapon', armor: 'Armor', hpot: 'Potion', mpot: 'Potion', spot: 'Potion', quest: 'Quest', valuable: 'Valuable' };
function renderPanel() {
  document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const body = $('panelBody'); body.innerHTML = '';
  if (tab === 'inv') {
    const head = document.createElement('div'); head.className = 'it'; head.innerHTML = `<span class="n"><b>${S.gold} gold</b>${selling ? ' — selling to Ilsa' : ''}</span>`; body.appendChild(head);
    const order = ['weapon', 'armor', 'hpot', 'mpot', 'spot', 'food', 'ward', 'fish', 'valuable', 'quest'];
    for (const it of [...S.inv].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
      const row = document.createElement('div'); row.className = 'it';
      const eq = it.id === S.weapon || it.id === S.armor;
      const detail = { weapon: `Damage ${it.power}`, armor: `Armor ${it.power}`, hpot: `+${it.power} health`, mpot: `+${it.power} magicka`, spot: `+${it.power} stamina`, quest: 'Quest item', valuable: `Worth ${it.value}g`, fish: `${F.FISH[it.fish]?.rarity} · cook at the village fire`, food: `+${it.power} ${it.stat === 'st' ? 'stamina' : 'health'}`, ward: `Frost resistance ${it.power}s` }[it.kind];
      row.innerHTML = `<span class="n">${it.name} ${eq ? '<span class="eq">[equipped]</span>' : ''}<br><span class="d">${kindLabel[it.kind]} · ${detail}</span></span>`;
      const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); sfx.click(); renderPanel(); }; row.appendChild(b); };
      if (selling) { if (it.kind !== 'quest' && it.id !== S.weapon) add(`Sell ${C.sellPrice(it)}g`, () => C.sell(S, it.id)); }
      else if (it.kind === 'weapon' && !eq) add('Equip', () => C.equip(S, it.id));
      else if (it.kind === 'armor') add(eq ? 'Remove' : 'Wear', () => C.equip(S, it.id));
      else if (it.kind === 'fish') { if (nearest()?.type === 'fire') add('Cook', () => { const n = F.cook(S, it.id, C.item); F.syncFishQuest(S); sfx.cook(); toast(`Cooked ${n}`); }); }
      else if (it.kind === 'food' || it.kind === 'ward') add('Eat', () => { const m = C.use(S, it.id); if (m) toast(m); });
      else if (['hpot', 'mpot', 'spot'].includes(it.kind)) add('Drink', () => { const m = C.use(S, it.id); if (m) toast(m); });
      body.appendChild(row);
    }
  } else if (tab === 'journal') {
    for (const q of [S.quests.main, S.quests.side, S.quests.fish]) {
      const d = document.createElement('div'); d.className = 'q';
      const done = q.stage >= q.stages.length - 1;
      d.innerHTML = `<h4>${q.side ? 'Side' : 'Main'}: ${q.title} ${done ? '✔' : ''}</h4>` + q.stages.slice(0, q.stage).map((s) => `<div class="done">${s}</div>`).join('') + `<div>▸ ${q.stages[q.stage]}</div>`;
      body.appendChild(d);
    }
    const tip = document.createElement('div'); tip.className = 'q'; tip.innerHTML = '<span class="d">Kettleford lies south-west. The Barrow of Ostmark is north-east. Cinderhorn Peak smoulders to the south-east.</span>'; body.appendChild(tip);
  } else {
    const Cl = C.CLASSES[S.cls], w = C.weaponOf(S), a = C.armorOf(S);
    body.innerHTML = `<div class="q"><h4>${Cl.title} — Level ${S.level}</h4>
      XP ${S.xp} / ${C.xpNeeded(S.level)}<br>Health ${Math.round(S.hp)}/${S.maxHp} · Stamina ${Math.round(S.st)}/${S.maxSt} · Magicka ${Math.round(S.mp)}/${S.maxMp}<br>
      Weapon: ${w ? w.name + ' (' + w.power + ')' : 'none'} · Armor: ${a ? a.name + ' (' + a.power + ')' : 'none'}<br>
      Fish cooked: ${S.cooked || 0}${S.boneHook ? ' · Bone Hook' : ''}${S.frostWard > 0 ? ` · Frost ward ${Math.ceil(S.frostWard)}s` : ''}<br>
      Galecry: ${C.empowered(S) ? 'EMPOWERED' : 'awakened'} — ${Math.round(C.shoutDamage(S))} dmg, ${C.shoutCooldown(S)}s cooldown</div>
      <div class="row" style="margin-top:12px"><button class="big-btn" id="saveBtn">Save game</button><button class="big-btn" id="loadBtn">Load save</button><button class="big-btn" id="quitBtn">Title screen</button></div>
      <div class="q"><h4>Audio</h4>${audioRow('music', 'Music')}${audioRow('ambience', 'Ambience')}</div>`;
    for (const k of ['music', 'ambience']) {
      const mk = k === 'music' ? 'musicMuted' : 'ambienceMuted';
      $(`vol-${k}`).oninput = (ev) => setSettings({ [k]: ev.target.value / 100, [mk]: false });
      $(`mute-${k}`).onclick = () => { setSettings({ [mk]: !getSettings()[mk] }); renderPanel(); };
    }
    $('saveBtn').onclick = () => save(); $('loadBtn').onclick = () => { const s = loadSave(); s ? startGame(s) : toast('No save found'); };
    $('quitBtn').onclick = () => { save(true); running = false; $('panel').classList.add('hidden'); $('hud').classList.add('hidden'); showTitle(); };
  }
}
document.querySelectorAll('.tab[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; selling = false; sfx.click(); renderPanel(); });
$('closePanel').onclick = closePanel;
$('menuBtn').onclick = () => { sfx.click(); openPanel('inv'); };
$('potBtn').onclick = () => { const p = S.inv.find((i) => i.kind === 'hpot'); if (p) { toast(C.use(S, p.id)); sfx.loot(); } else toast('No health potions'); };

// ---------- Controls ----------
const stick = $('stick'), knob = $('knob'); let stickId = null;
function stickMove(t) {
  const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = t.clientX - cx, dy = t.clientY - cy; const m = Math.hypot(dx, dy), max = r.width / 2;
  if (m > max) { dx = dx / m * max; dy = dy / m * max; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const n = Math.min(1, m / max); input.mx = m > 6 ? dx / max : 0; input.my = m > 6 ? -dy / max : 0; void n;
}
stick.addEventListener('touchstart', (e) => { e.preventDefault(); unlockAudio(); const t = e.changedTouches[0]; stickId = t.identifier; stickMove(t); }, { passive: false });
stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t); }, { passive: false });
const stickEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; input.mx = input.my = 0; knob.style.transform = ''; } };
stick.addEventListener('touchend', stickEnd); stick.addEventListener('touchcancel', stickEnd);
// mouse fallback for desktop testing
stick.addEventListener('mousedown', (e) => { stickId = 'm'; stickMove(e); });
addEventListener('mousemove', (e) => { if (stickId === 'm') stickMove(e); });
addEventListener('mouseup', () => { if (stickId === 'm') { stickId = null; input.mx = input.my = 0; knob.style.transform = ''; } });

for (const [id, key] of [['bAttack', 'attack'], ['bSpell', 'spell'], ['bShout', 'shout'], ['bUse', 'use']]) {
  const b = $(id);
  const down = (e) => { e.preventDefault(); unlockAudio(); input[key] = true; queued.add(key); b.classList.add('down'); };
  const up = (e) => { e.preventDefault(); input[key] = false; b.classList.remove('down'); };
  b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
  b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up);
}
const keys = new Set();
const queued = new Set(); // taps shorter than a frame still register
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase()); unlockAudio();
  const k = e.key.toLowerCase();
  if (k === 'j' || k === ' ') input.attack = true; if (k === 'k') input.spell = true; if (k === 'l' || k === 'q') input.shout = true; if (k === 'e') input.use = true;
  for (const [kk, a] of [['j','attack'],[' ','attack'],['k','spell'],['l','shout'],['q','shout'],['e','use']]) if (k === kk) queued.add(a);
  if (k === 'i' && running) (paused && !$('panel').classList.contains('hidden')) ? closePanel() : openPanel('inv');
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase(); keys.delete(k);
  if (k === 'j' || k === ' ') input.attack = false; if (k === 'k') input.spell = false; if (k === 'l' || k === 'q') input.shout = false; if (k === 'e') input.use = false;
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
let useLatch = false;

// ---------- Weather ----------
const weather = new Wx.Weather(), gov = new Wx.FpsGovernor(), pool = new Wx.ParticlePool();
let push = 0, bossFight = false;

// ---------- Update ----------
function update(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (!running || paused) return;
  const Cl = C.CLASSES[S.cls];
  let mx = input.mx, my = input.my;
  if (keys.has('a') || keys.has('arrowleft')) mx = -1; if (keys.has('d') || keys.has('arrowright')) mx = 1;
  if (keys.has('w') || keys.has('arrowup')) my = 1; if (keys.has('s') || keys.has('arrowdown')) my = -1;
  const mag = Math.min(1, Math.hypot(mx, my));
  if (mag > 0.05) {
    P.fx = mx / Math.hypot(mx, my); P.fy = my / Math.hypot(mx, my);
    const tile = world.get(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
    const slow = tile === T.DEEP ? 0.75 : tile === T.ROAD ? 1.15 : 1;
    const sp = Cl.speed * mag * slow * dt, nx = P.x + P.fx * sp, ny = P.y + P.fy * sp;
    if (world.canOccupy(nx, P.y, 10)) P.x = nx; if (world.canOccupy(P.x, ny, 10)) P.y = ny;
    P.walk += dt * 10 * mag;
  }
  {
    const tx = Math.floor(P.x / TILE), ty = Math.floor(P.y / TILE);
    const nw = C.reveal(S, world, tx, ty, 6); if (nw.length) revealFog(nw);
    const reg = world.region(tx, ty); if (reg !== P.region) { if (P.region) toast(reg); P.region = reg; }
  }
  {
    const tile = world.get(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
    bossFight = ents.some((e) => e.kind === 'boss' && e.awake);
    weather.update(dt, P.region);
    push = Wx.windPush({ region: P.region, indoors: tile === T.FLOOR, bossFight, storm: weather.mix('storm'), gust: weather.gust, dir: weather.dir });
    if (push && world.canOccupy(P.x + push * dt, P.y, 10)) P.x += push * dt;
  }
  P.swing = Math.max(0, P.swing - dt); P.cast = Math.max(0, P.cast - dt); P.inv = Math.max(0, P.inv - dt); P.shoutFx = Math.max(0, P.shoutFx - dt);
  shoutCd = Math.max(0, shoutCd - dt);
  const pressed = (k) => input[k] || queued.has(k);
  if (pressed('attack')) doAttack();
  if (pressed('spell')) doSpell();
  if (pressed('shout')) { doShout(); input.shout = false; }
  if (queued.has('use') || (input.use && !useLatch)) { useLatch = true; doUse(); } if (!input.use) useLatch = false;
  queued.clear();
  // regen
  S.st = Math.min(S.maxSt, S.st + (P.swing > 0 ? 4 : 18) * dt);
  S.mp = Math.min(S.maxMp, S.mp + 6 * dt);
  S.hp = Math.min(S.maxHp, S.hp + 1.2 * dt);
  if (S.frostWard > 0) S.frostWard = Math.max(0, S.frostWard - dt);

  // enemies
  for (const e of ents) {
    e.t += dt; e.cd -= dt; e.flash -= dt; e.stun -= dt;
    const kx = e.kx * dt * 6, ky = e.ky * dt * 6; e.kx -= kx; e.ky -= ky;
    if (world.canOccupy(e.x + kx, e.y, e.d.r * 0.6)) e.x += kx; if (world.canOccupy(e.x, e.y + ky, e.d.r * 0.6)) e.y += ky;
    if (e.stun > 0) continue;
    const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);
    let tx = 0, ty = 0;
    if (dist < e.d.aggro) {
      e.awake = true;
      if (e.kind === 'boss') {
        if (!e.roared) { e.roared = true; sfx.roar(); toast('Vorthrax the Ashwing descends!'); }
        const enraged = e.hp < e.d.hp / 2;
        e.breath -= dt;
        if (e.breath <= 0) {
          e.breath = enraged ? 2 : 3; sfx.fire();
          const a0 = Math.atan2(dy, dx);
          for (let k = -2; k <= 2; k++) { const a = a0 + k * 0.18; shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, t: 2, dmg: 14, friendly: false, c: '#ff8a3a', r: 8 }); }
        }
        if (dist > e.d.range) { tx = dx / dist; ty = dy / dist; }
        e.spd = enraged ? e.d.speed * 1.4 : e.d.speed;
      } else if (dist > e.d.range * 0.8) { tx = dx / dist; ty = dy / dist; }
      if (dist < e.d.range + 10 && e.cd <= 0) { e.cd = e.d.cd; e.lunge = 0.2; hurtPlayer(e.d.dmg * F.frostScale(S, e.kind)); }
    } else {
      const hx = e.hx - e.x, hy = e.hy - e.y, hd = Math.hypot(hx, hy);
      if (hd > 40 && (e.awake || hd > 120)) { tx = hx / hd; ty = hy / hd; } else e.awake = false;
      if (e.kind === 'boss' && !e.awake) e.hp = Math.min(e.d.hp, e.hp + 20 * dt);
    }
    e.lunge = Math.max(0, (e.lunge || 0) - dt);
    const sp = (e.spd || e.d.speed) * dt;
    if (tx || ty) {
      e.fx = tx; e.fy = ty;
      if (world.canOccupy(e.x + tx * sp, e.y, e.d.r * 0.6)) e.x += tx * sp; else if (world.canOccupy(e.x, e.y + Math.sign(ty || 1) * sp, e.d.r * 0.6)) e.y += Math.sign(ty || 1) * sp;
      if (world.canOccupy(e.x, e.y + ty * sp, e.d.r * 0.6)) e.y += ty * sp;
    }
  }
  // projectiles
  for (const s of shots) {
    Wx.driftProjectile(s, push, dt); s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt;
    if (!world.walk(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) && world.get(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) !== T.LAVA) s.t = 0;
    if (s.friendly) { for (const e of [...ents]) if (!s.hit.has(e) && Math.hypot(e.x - s.x, e.y - s.y) < e.d.r + s.r) { s.hit.add(e); hurtEnemy(e, s.dmg, s.vx * 0.15, s.vy * 0.15, 0.3); if (!s.pierce) s.t = 0; } }
    else if (Math.hypot(P.x - s.x, P.y - s.y) < 12 + s.r) { hurtPlayer(s.dmg); s.t = 0; }
    if (Math.random() < 0.5) fx.push({ x: s.x, y: s.y, vx: 0, vy: 0, t: 0.25, c: s.c });
  }
  shots = shots.filter((s) => s.t > 0);
  for (const f of fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.t -= dt; } fx = fx.filter((f) => f.t > 0);
  for (const t of texts) { t.y += 30 * dt; t.t -= dt; } texts = texts.filter((t) => t.t > 0);
  // hazard: lava
  if (world.get(Math.floor(P.x / TILE), Math.floor(P.y / TILE)) === T.LAVA) hurtPlayer(10);

  sinceCombat += dt;
  sceneT -= dt; if (sceneT <= 0) { sceneT = 0.25; updateScene(); }
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; updateHud(); }
  regenT += dt; if (regenT > 30) { regenT = 0; save(true); }
}

function updateScene() {
  let nearest = Infinity, bossAwake = false;
  for (const e of ents) if (e.awake) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < nearest) nearest = d; if (e.kind === 'boss') bossAwake = true; }
  if (nearest < 320) sinceCombat = 0;
  const tx = P.x / TILE, ty = P.y / TILE, dl = Math.hypot(tx - world.lair.x, ty - world.lair.y);
  const lair = Math.max(0, Math.min(1, (18 - dl) / 10));
  const tile = world.get(Math.floor(tx), Math.floor(ty));
  setScene({ region: P.region || '', lair, combat: combatLevel({ bossAwake, nearestEngagedDist: nearest, sinceCombat }), outdoors: tile !== T.FLOOR, storm: weather.mix('windAudio'), rain: tile === T.FLOOR ? 0 : weather.mix('rain') });
}
function updateHud(force) {
  const pct = (a, b) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
  $('hpBar').style.width = pct(S.hp, S.maxHp); $('stBar').style.width = pct(S.st, S.maxSt); $('mpBar').style.width = pct(S.mp, S.maxMp);
  $('xpBar').style.width = pct(S.xp, C.xpNeeded(S.level));
  $('hpTxt').textContent = `${Math.ceil(S.hp)} / ${S.maxHp}`; $('stTxt').textContent = `${Math.ceil(S.st)}`; $('mpTxt').textContent = `${Math.ceil(S.mp)}`;
  $('info').textContent = `Lv ${S.level} · ${S.gold}g · ${P.region || ''} · ${Wx.STATES[weather.state].label}`;
  const m = S.quests.main, sq = S.quests.side;
  $('objective').textContent = m.stage < C.MAIN.DONE ? m.stages[m.stage] : (sq.stage < 3 ? sq.stages[sq.stage] : 'Hrimvald is free. Explore at will.');
  $('shoutCd').textContent = shoutCd > 0 ? Math.ceil(shoutCd) : '';
  const boss = ents.find((e) => e.kind === 'boss' && e.awake);
  $('bossbar').classList.toggle('hidden', !boss); if (boss) $('bossHp').style.width = pct(boss.hp, boss.d.hp);
  const n = nearest(); $('prompt').classList.toggle('hidden', !n); if (n) $('prompt').textContent = `✋ ${n.label}`;
  $('potBtn').textContent = `⚗ Heal ×${S.inv.filter((i) => i.kind === 'hpot').length}`;
}

// ---------- Render ----------
let camX = 0, camY = 0;
const toS = (x, y) => [(x - camX) * ZOOM + W / 2, H / 2 - (y - camY) * ZOOM];
function render(time) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#0c1420'; g.fillRect(0, 0, W, H);
  if (!S || !P) { drawTitleBg(time); return; }
  const vw = W / ZOOM / 2, vh = H / ZOOM / 2;
  camX = Math.max(vw, Math.min(WW - vw, P.x)); camY = Math.max(vh, Math.min(WH - vh, P.y));
  g.imageSmoothingEnabled = false;
  const [ox, oy] = toS(0, WH);
  g.drawImage(terrain, ox, oy, WW * ZOOM, WH * ZOOM);
  // galestone pedestal
  if (!S.galestone) { const c = world.center(world.galestone), [sx, sy] = toS(c.x, c.y); g.fillStyle = '#555'; g.fillRect(sx - 10 * ZOOM, sy, 20 * ZOOM, 8 * ZOOM); g.fillStyle = `hsl(195,90%,${60 + Math.sin(time / 200) * 15}%)`; g.beginPath(); g.arc(sx, sy - 6 * ZOOM, 7 * ZOOM, 0, 7); g.fill(); }
  for (const c of world.chests) { const p = world.center(c), [sx, sy] = toS(p.x, p.y), o = S.chests.includes(c.id); g.fillStyle = o ? '#5a4030' : '#8b5a2b'; g.fillRect(sx - 10 * ZOOM, sy - 7 * ZOOM, 20 * ZOOM, 14 * ZOOM); g.fillStyle = '#d4b04c'; g.fillRect(sx - 2 * ZOOM, sy - 3 * ZOOM, 4 * ZOOM, 5 * ZOOM); }
  for (const n of world.npcs) { const p = world.center(n); drawHuman(p.x, p.y, n.color, '#3a2a20', 0, -1, Math.sin(time / 500) * 0.3); const [sx, sy] = toS(p.x, p.y); g.fillStyle = '#fff'; g.font = `${10 * ZOOM | 0}px Georgia`; g.textAlign = 'center'; g.fillText(n.name, sx, sy - 22 * ZOOM); if (questMarker(n.role)) { g.fillStyle = '#d4b04c'; g.font = `bold ${16 * ZOOM | 0}px Georgia`; g.fillText('!', sx, sy - 32 * ZOOM); } }
  for (const f of world.fishing) { const p = world.center(f), [sx, sy] = toS(p.x, p.y); g.fillStyle = '#123a5a'; g.beginPath(); g.ellipse(sx, sy, 9 * ZOOM, 6 * ZOOM, 0, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#e8463a'; g.fillRect(sx - 2, sy - 3 - Math.abs(Math.sin(time / 500)) * 3, 4, 4); }
  { const p = world.center(world.fire), [sx, sy] = toS(p.x, p.y); g.fillStyle = '#5a4030'; g.fillRect(sx - 9 * ZOOM, sy + 2 * ZOOM, 18 * ZOOM, 4 * ZOOM); for (let k = 0; k < 3; k++) { g.fillStyle = ['#ff8a3a', '#ffc04a', '#ff5a2a'][k]; g.beginPath(); g.arc(sx + (k - 1) * 4 * ZOOM, sy - Math.abs(Math.sin(time / 120 + k)) * 5 * ZOOM, (4 - k) * ZOOM, 0, 7); g.fill(); } }
  for (const e of ents) drawEnemy(e, time);
  const Cl = { warrior: '#9a3b2f', mage: '#3b5ea8', rogue: '#3f4a3a' }[S.cls];
  if (!(P.inv > 0 && Math.floor(time / 60) % 2)) drawHuman(P.x, P.y, Cl, '#e0c9a6', P.fx, P.fy, Math.sin(P.walk) * 0.5, true);
  if (P.swing > 0) { const [sx, sy] = toS(P.x, P.y), a = Math.atan2(-P.fy, P.fx), k = 1 - P.swing / 0.4; g.strokeStyle = '#ffffffcc'; g.lineWidth = 3 * ZOOM; g.beginPath(); g.arc(sx, sy, 34 * ZOOM, a - 1 + k * 2 - 1, a - 1 + k * 2); g.stroke(); }
  if (P.shoutFx > 0) { const [sx, sy] = toS(P.x, P.y), a = Math.atan2(-P.fy, P.fx), r = (0.6 - P.shoutFx) / 0.6 * (C.empowered(S) ? 220 : 160) * ZOOM; g.strokeStyle = `rgba(220,240,255,${P.shoutFx})`; g.lineWidth = 6 * ZOOM; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(sx, sy, Math.max(1, r - k * 18 * ZOOM), a - 0.8, a + 0.8); g.stroke(); } }
  for (const s of shots) { const [sx, sy] = toS(s.x, s.y); g.fillStyle = s.c; g.beginPath(); g.arc(sx, sy, s.r * ZOOM, 0, 7); g.fill(); }
  for (const f of fx) { const [sx, sy] = toS(f.x, f.y); g.globalAlpha = Math.min(1, f.t * 3); g.fillStyle = f.c; g.fillRect(sx - 2, sy - 2, 4, 4); } g.globalAlpha = 1;
  // fog of war
  g.imageSmoothingEnabled = true; g.drawImage(fogC, ox, oy, WW * ZOOM, WH * ZOOM);
  for (const t of texts) { const [sx, sy] = toS(t.x, t.y); g.globalAlpha = t.t; g.fillStyle = t.color; g.font = `bold ${13 * ZOOM | 0}px Georgia`; g.textAlign = 'center'; g.fillText(t.s, sx, sy); } g.globalAlpha = 1;
  drawWeather(time); drawMinimap();
}
function questMarker(role) { const m = S.quests.main.stage, q = S.quests.side.stage; return (role === 'elder' && (m === 0 || m === 2)) || (role === 'hunter' && (q === 0 || q === 2)); }
function drawHuman(x, y, body, skin, fx, fy, sw, player) {
  const [sx, sy] = toS(x, y), z = ZOOM;
  g.fillStyle = '#0003'; g.beginPath(); g.ellipse(sx, sy + 12 * z, 10 * z, 4 * z, 0, 0, 7); g.fill();
  g.fillStyle = '#2a2420'; g.fillRect(sx - 6 * z, sy + 4 * z + sw * 3 * z, 4 * z, 8 * z); g.fillRect(sx + 2 * z, sy + 4 * z - sw * 3 * z, 4 * z, 8 * z);
  g.fillStyle = body; g.fillRect(sx - 8 * z, sy - 8 * z, 16 * z, 14 * z);
  g.fillStyle = skin; g.beginPath(); g.arc(sx, sy - 13 * z, 6 * z, 0, 7); g.fill();
  if (player) {
    g.fillStyle = '#ddd'; g.beginPath(); g.moveTo(sx - 6 * z, sy - 17 * z); g.lineTo(sx - 9 * z, sy - 25 * z); g.lineTo(sx - 3 * z, sy - 18 * z); g.moveTo(sx + 6 * z, sy - 17 * z); g.lineTo(sx + 9 * z, sy - 25 * z); g.lineTo(sx + 3 * z, sy - 18 * z); g.fill();
    g.strokeStyle = S.cls === 'mage' ? '#a87b4a' : '#cfd6de'; g.lineWidth = 3 * z; g.beginPath(); g.moveTo(sx + fx * 8 * z, sy - fy * 8 * z); g.lineTo(sx + fx * 22 * z, sy - fy * 22 * z); g.stroke();
  }
}
function drawEnemy(e, time) {
  const [sx, sy] = toS(e.x, e.y), z = ZOOM, fl = e.flash > 0;
  if (e.kind === 'wolf') {
    g.fillStyle = '#0003'; g.beginPath(); g.ellipse(sx, sy + 8 * z, 14 * z, 4 * z, 0, 0, 7); g.fill();
    const dir = (e.fx || 1) >= 0 ? 1 : -1;
    g.fillStyle = fl ? '#fff' : '#b8c6d4'; g.beginPath(); g.ellipse(sx, sy, 14 * z, 7 * z, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(sx + dir * 10 * z, sy - 4 * z); g.lineTo(sx + dir * 22 * z, sy); g.lineTo(sx + dir * 10 * z, sy + 5 * z); g.fill();
    g.fillStyle = '#7a8a9a'; g.fillRect(sx - dir * 18 * z, sy - 2 * z, 6 * z, 3 * z);
    g.fillStyle = '#7fd4ff'; g.fillRect(sx + dir * 15 * z, sy - 2 * z, 2 * z, 2 * z);
  } else if (e.kind === 'wight') {
    g.fillStyle = '#0003'; g.beginPath(); g.ellipse(sx, sy + 12 * z, 10 * z, 4 * z, 0, 0, 7); g.fill();
    g.fillStyle = fl ? '#fff' : '#4a5060'; g.fillRect(sx - 8 * z, sy - 8 * z, 16 * z, 18 * z);
    g.fillStyle = '#b9b39a'; g.beginPath(); g.arc(sx, sy - 13 * z, 6 * z, 0, 7); g.fill();
    g.fillStyle = '#4fe3ff'; g.fillRect(sx - 4 * z, sy - 15 * z, 2 * z, 2 * z); g.fillRect(sx + 2 * z, sy - 15 * z, 2 * z, 2 * z);
    g.strokeStyle = '#8a7a5a'; g.lineWidth = 3 * z; g.beginPath(); g.moveTo(sx + 8 * z, sy); g.lineTo(sx + 16 * z, sy - (12 + (e.lunge > 0 ? 8 : 0)) * z); g.stroke();
  } else {
    const flap = Math.sin(time / (e.awake ? 120 : 400)) * 0.5;
    g.fillStyle = '#0004'; g.beginPath(); g.ellipse(sx, sy + 26 * z, 40 * z, 10 * z, 0, 0, 7); g.fill();
    g.fillStyle = fl ? '#fff' : '#3a2a2a';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(sx + s * 10 * z, sy - 4 * z); g.lineTo(sx + s * 70 * z, sy - (30 + flap * 30) * z); g.lineTo(sx + s * 55 * z, sy + 10 * z); g.lineTo(sx + s * 30 * z, sy + 4 * z); g.fill(); }
    g.fillStyle = fl ? '#fff' : '#5a2f24'; g.beginPath(); g.ellipse(sx, sy, 22 * z, 16 * z, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(sx, sy - 24 * z, 10 * z, 12 * z, 0, 0, 7); g.fill();
    g.fillStyle = '#ffb347'; g.fillRect(sx - 6 * z, sy - 28 * z, 3 * z, 3 * z); g.fillRect(sx + 3 * z, sy - 28 * z, 3 * z, 3 * z);
    g.fillStyle = '#c9b48a'; g.beginPath(); g.moveTo(sx - 8 * z, sy - 32 * z); g.lineTo(sx - 14 * z, sy - 44 * z); g.lineTo(sx - 4 * z, sy - 34 * z); g.moveTo(sx + 8 * z, sy - 32 * z); g.lineTo(sx + 14 * z, sy - 44 * z); g.lineTo(sx + 4 * z, sy - 34 * z); g.fill();
  }
  if (e.hp < e.d.hp && e.kind !== 'boss') { g.fillStyle = '#000a'; g.fillRect(sx - 14 * z, sy - 26 * z, 28 * z, 4 * z); g.fillStyle = '#c0392b'; g.fillRect(sx - 14 * z, sy - 26 * z, 28 * z * Math.max(0, e.hp / e.d.hp), 4 * z); }
  if (e.stun > 0) { g.fillStyle = '#fff'; g.font = `${10 * z | 0}px Georgia`; g.textAlign = 'center'; g.fillText('✶', sx, sy - 30 * z); }
}
function drawWeather() {
  const nearLair = Math.hypot(P.x / TILE - world.lair.x, P.y / TILE - world.lair.y) < 14;
  const tile = world.get(Math.floor(P.x / TILE), Math.floor(P.y / TILE)), indoors = tile === T.FLOOR;
  const gloom = indoors ? 0 : weather.mix('gloom'), storm = weather.mix('storm'), rain = indoors ? 0 : weather.mix('rain');
  if (gloom > 0.01) { g.fillStyle = `rgba(20,28,40,${gloom.toFixed(3)})`; g.fillRect(0, 0, W, H); } // one tint pass
  const wind = (weather.dir * (0.0004 + 0.004 * storm * weather.gust)), n = pool.active(gov.cap, indoors ? 0.15 : weather.mix('density'));
  const nRain = Math.floor(n * rain), sl = wind * W * 5;
  g.fillStyle = nearLair ? '#3a302cbb' : '#ffffffcc';
  for (let i = nRain; i < n; i++) { const f = pool.p[i]; f.y += (0.0012 + 0.002 * storm) * f.s; f.x += wind * f.s; if (f.y > 1) f.y -= 1; f.x -= Math.floor(f.x); g.fillRect(f.x * W, f.y * H, 2 * f.s, 2 * f.s); }
  if (nRain) { // all rain streaks in one batched path
    g.strokeStyle = '#a8c4e0aa'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < nRain; i++) { const f = pool.p[i]; f.y += 0.02 * f.s; f.x += wind * 3 * f.s; if (f.y > 1) f.y -= 1; f.x -= Math.floor(f.x); const x = f.x * W, y = f.y * H; g.moveTo(x, y); g.lineTo(x + sl * f.s, y + 14 * f.s); }
    g.stroke();
  }
  if (weather.flash > 0 && !indoors) { g.fillStyle = `rgba(255,255,255,${(0.45 * weather.flash).toFixed(3)})`; g.fillRect(0, 0, W, H); }
}
const flakes = pool.p;
function drawMinimap() {
  const s = H < 450 ? 1.3 : 2, mw = world.w * s, mh = world.h * s, x0 = $('menuBtn').getBoundingClientRect().right - mw, y0 = $('menuBtn').getBoundingClientRect().bottom + 8;
  g.globalAlpha = 0.8; g.drawImage(terrain, x0, y0, mw, mh); g.drawImage(fogC, x0, y0, mw, mh); g.globalAlpha = 1;
  g.strokeStyle = '#fff5'; g.strokeRect(x0, y0, mw, mh);
  g.fillStyle = '#ff4'; g.fillRect(x0 + P.x / TILE * s - 2, y0 + mh - P.y / TILE * s - 2, 4, 4);
}
function drawTitleBg(time) {
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#1a2940'); grd.addColorStop(1, '#0c1420'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b3b52'; g.beginPath(); g.moveTo(0, H); for (let i = 0; i <= 10; i++) g.lineTo(i * W / 10, H * (0.55 + 0.2 * Math.sin(i * 2.3))); g.lineTo(W, H); g.fill();
  drawSnowTitle(time);
}
function drawSnowTitle() { g.fillStyle = '#fff9'; for (const f of flakes) { f.y += 0.001 * f.s; if (f.y > 1) f.y = 0; g.fillRect(f.x * W, f.y * H, 2 * f.s, 2 * f.s); } }

// ---------- Title / class select ----------
function showTitle() {
  S = null; P = null; $('title').classList.remove('hidden'); $('contBtn').disabled = !loadSave();
}
$('newBtn').onclick = () => {
  unlockAudio(); sfx.click(); $('title').classList.add('hidden'); $('classSel').classList.remove('hidden');
  const box = $('classes'); box.innerHTML = '';
  for (const [k, c] of Object.entries(C.CLASSES)) {
    const d = document.createElement('button'); d.className = 'cls';
    d.innerHTML = `<h3>${c.title}</h3><p>${c.blurb}</p><div class="stats">HP ${c.hp} · ST ${c.st} · MP ${c.mp}<br>Starts with ${c.weapon.name}</div>`;
    d.onclick = () => { sfx.quest(); const s = C.newSave(k, world); startGame(s); save(true); toast(`${c.title}\nSeek Elder Maren in Kettleford`); };
    box.appendChild(d);
  }
};
$('contBtn').onclick = () => { unlockAudio(); const s = loadSave(); if (s) startGame(s); };

// ---------- Loop ----------
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (running && !paused && !document.hidden) gov.sample(dt);
  updateFishing(dt); update(dt); render(t); drawFishing(t); requestAnimationFrame(frame);
}
// Audio must be created/resumed inside a user gesture (iOS Safari).
for (const ev of ['touchstart', 'touchend', 'pointerdown', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (running) save(true); suspendAudio(); } else resumeAudio(); });
addEventListener('pagehide', suspendAudio); addEventListener('pageshow', resumeAudio);
setInterval(() => { if (!running) setScene({ region: 'Whitepass Vale', lair: 0, combat: 0, outdoors: true }); }, 500);
showTitle(); requestAnimationFrame(frame);

// test hook
window.__frost = { audioDebug, getSettings, get paused() { return paused; }, get running() { return running; }, get S() { return S; }, get P() { return P; }, get ents() { return ents; }, world, C, input, weather, gov, pool, W: Wx, get push() { return push; }, get fishing() { return fishing; }, F, get shots() { return shots; }, get bossFight() { return bossFight; } };
