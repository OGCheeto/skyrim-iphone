// Headless fishing smoke test (playwright-core; serve repo on :8765). Screenshots -> /tmp/fish-*.png
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ev = (f, a) => p.evaluate(f, a); const fails = []; const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails.push(m); };
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await p.goto('http://localhost:8765/'); await p.waitForTimeout(300);
await p.tap('#newBtn'); await p.tap('.cls >> nth=0'); await p.waitForTimeout(600);
const goTo = (o) => ev((o) => { const f = window.__frost; f.P.x = (o.x + 0.5) * 32 + o.dx; f.P.y = (o.y + 0.5) * 32; }, o);
const pond = await ev(() => window.__frost.world.fishing[0]);
await ev(() => { const w = window.__frost.weather; w.set('clear', true); w.timer = 999; });
// hunter: wolves quest then icefin quest
const hunter = await ev(() => window.__frost.world.npcs.find((n) => n.role === 'hunter'));
for (let i = 0; i < 2; i++) { await goTo({ ...hunter, dx: 0 }); await p.waitForTimeout(150); await p.tap('#bUse'); await p.waitForTimeout(200); await p.tap('#dlgBtns button >> nth=-1'); }
check(await ev(() => window.__frost.S.quests.fish.stage) === 1, 'icefin quest started from Brannoc');
await goTo({ ...pond, dx: -40 }); await p.waitForTimeout(250);
check(/Fish at Kettle Pond/.test(await p.textContent('#prompt')), 'Use prompt near Kettle Pond');
await p.screenshot({ path: '/tmp/fish-0-map.png' });
// cancel works
await p.tap('#bUse'); await p.waitForTimeout(200); check(await p.isVisible('#fishing'), 'overlay opens');
await p.tap('#fishCancel'); await p.waitForTimeout(500); check(!(await p.isVisible('#fishing')) && !(await ev(() => window.__frost.paused)), 'cancel closes and unpauses');
// full catch loop driven by touch
const catchOne = async (shots, kind) => {
  await p.tap('#bUse'); await p.waitForTimeout(300);
  const e0 = await ev(() => window.__frost.ents.map((e) => e.x + e.y).join());
  if (shots) await p.screenshot({ path: '/tmp/fish-1-wait.png' });
  await ev((kind) => { const f = window.__frost.fishing; f.t = 5; f.r = () => 0; const orig = window.__frost.F.rollFish; f.forceFish = kind; }, kind);
  await p.waitForFunction(() => window.__frost.fishing?.state === 'bite');
  await ev((kind) => { if (kind) window.__frost.fishing.fish = kind; window.__frost.fishing.r = Math.random; }, kind);
  if (shots) await p.screenshot({ path: '/tmp/fish-2-bite.png' });
  await p.tap('#fishing', { position: { x: 300, y: 200 } });
  check(await ev(() => window.__frost.fishing.state) === 'reel', 'tap during dip hooks fish');
  // real touch hold raises the marker
  const m0 = await ev(() => window.__frost.fishing.marker); await touch('touchStart', 300, 200); await p.waitForTimeout(350);
  const m1 = await ev(() => window.__frost.fishing.marker); await touch('touchEnd');
  check(m1 > m0, `touch-hold raises marker ${m0.toFixed(2)} -> ${m1.toFixed(2)}`);
  if (shots) await p.screenshot({ path: '/tmp/fish-3-reel.png' });
  // play it out with touch events driven by a predictive policy
  let held = false;
  for (let i = 0; i < 400; i++) {
    const f = await ev(() => { const f = window.__frost.fishing; return f && { m: f.marker, v: f.vel, z: f.zone, done: f.done, st: f.state }; });
    if (!f || f.done) break; const want = f.m + f.v * 0.35 < f.z;
    if (want !== held) { held = want; await touch(held ? 'touchStart' : 'touchEnd', 300, 200); }
    await p.waitForTimeout(30);
  }
  if (held) await touch('touchEnd');
  const res = await ev(() => window.__frost.fishing?.state); if (shots) await p.screenshot({ path: '/tmp/fish-4-result.png' });
  await p.waitForTimeout(1600);
  const e1 = await ev(() => window.__frost.ents.map((e) => e.x + e.y).join()); check(e0 === e1, 'world frozen while fishing');
  return res;
};
const results = []; for (let i = 0; i < 4; i++) results.push(await catchOne(i === 0, i === 3 ? 'frostgill' : 'icefin'));
console.log('results', results);
check(results.filter((r) => r === 'caught').length >= 3, 'touch play catches fish');
const inv = await ev(() => window.__frost.S.inv.filter((i) => i.kind === 'fish').map((i) => i.fish)); console.log('fish', inv);
// storm bonus wired in
await ev(() => { const w = window.__frost.weather; w.set('snowstorm', true); w.timer = 999; });
await p.tap('#bUse'); await p.waitForTimeout(200); const fs = await ev(() => ({ s: window.__frost.fishing.storm, m: window.__frost.weather.mix('storm') }));
check(fs.s > 0.5 && fs.s === fs.m, `storm passed to minigame (${fs.s})`); await p.screenshot({ path: '/tmp/fish-5-storm.png' }); await p.tap('#fishCancel'); await p.waitForTimeout(400);
// enemies nearby block fishing
await ev(() => { const f = window.__frost, w = f.ents.find((e) => e.kind === 'wolf'); f.__w = [w.x, w.y]; w.x = f.P.x + 100; w.y = f.P.y; w.awake = true; });
await p.tap('#bUse'); await p.waitForTimeout(150); check(!(await p.isVisible('#fishing')), 'blocked with enemy nearby');
await ev(() => { const f = window.__frost, w = f.ents.find((e) => e.kind === 'wolf'); [w.x, w.y] = f.__w; w.awake = false; f.S.hp = f.S.maxHp; });
// turn in icefin
const ice = inv.filter((k) => k === 'icefin').length;
if (ice >= 3) { await goTo({ ...hunter, dx: 0 }); await p.waitForTimeout(150); await p.tap('#bUse'); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/fish-6-hunter.png' }); await p.tap('#dlgBtns button >> nth=-1');
  check(await ev(() => window.__frost.S.quests.fish.stage === 2 && window.__frost.S.boneHook), 'icefin quest complete, Bone Hook'); }
else await ev(() => { const f = window.__frost; f.S.inv.push(f.F.rawFishItem('icefin', f.C.item)); });
// journal shows quest
await p.tap('#menuBtn'); await p.tap('[data-tab=journal]'); check(/A Taste of Icefin/.test(await p.textContent('#panelBody')), 'journal lists fishing quest'); await p.screenshot({ path: '/tmp/fish-7-journal.png' }); await p.tap('#closePanel');
// sell fish to Ilsa
const ilsa = await ev(() => window.__frost.world.npcs.find((n) => n.role === 'merchant'));
check(ilsa.name === 'Ilsa the Trader', `trader name: ${ilsa.name}`);
await ev(() => { const f = window.__frost; f.S.inv.push(f.F.rawFishItem('silverjaw', f.C.item)); });
await goTo({ ...ilsa, dx: 0 }); await p.waitForTimeout(150); await p.tap('#bUse'); await p.waitForTimeout(200); await p.tap('text=Sell loot'); await p.waitForTimeout(200);
const g0 = await ev(() => window.__frost.S.gold); await p.tap('.it:has-text("Silverjaw") button'); const g1 = await ev(() => window.__frost.S.gold);
check(g1 - g0 === 12, `Ilsa bought Silverjaw for ${g1 - g0}g`); await p.tap('#closePanel');
// cook at the fire (add one common + the rare in case RNG cost us the frostgill)
await ev(() => { const f = window.__frost; f.S.inv.push(f.F.rawFishItem('icefin', f.C.item), f.F.rawFishItem('frostgill', f.C.item)); });
const fire = await ev(() => window.__frost.world.fire); await goTo({ ...fire, dx: 20 }); await p.waitForTimeout(250);
check(/Cook fish/.test(await p.textContent('#prompt')), 'cook prompt at fire'); await p.screenshot({ path: '/tmp/fish-8-fire.png' });
await p.tap('#bUse'); await p.waitForTimeout(200);
const cooked = await ev(() => ({ raw: window.__frost.S.inv.filter((i) => i.kind === 'fish').length, food: window.__frost.S.inv.filter((i) => i.kind === 'food' || i.kind === 'ward').map((i) => i.name), n: window.__frost.S.cooked }));
check(cooked.raw === 0 && cooked.n > 0, `cooked ${JSON.stringify(cooked)}`);
await p.tap('#menuBtn'); await p.tap('.it:has-text("Grilled Icefin") button').catch(() => {}); await p.tap('.it:has-text("Frostgill Jerky") button').catch(() => {});
const ward = await ev(() => window.__frost.S.frostWard); check(ward > 100, `frost ward ${ward}`); await p.tap('#closePanel');
// save / reload / continue
await ev(() => window.__frost.S.gold) ; await p.tap('#menuBtn'); await p.tap('[data-tab=char]'); await p.tap('#saveBtn'); await p.tap('#closePanel');
const before = await ev(() => { const S = window.__frost.S; return JSON.stringify({ q: S.quests.fish.stage, c: S.cooked, h: S.boneHook, inv: S.inv.map((i) => i.name).sort() }); });
await p.reload(); await p.waitForTimeout(300); await p.tap('#contBtn'); await p.waitForTimeout(500);
const after = await ev(() => { const S = window.__frost.S; return JSON.stringify({ q: S.quests.fish.stage, c: S.cooked, h: S.boneHook, inv: S.inv.map((i) => i.name).sort() }); });
check(before === after, 'save/load keeps fish, quest, cooking: ' + after);
console.log('errors:', errs); await b.close(); const ok = !fails.length && !errs.length; console.log(ok ? 'FISHING SMOKE PASS' : 'FISHING SMOKE FAIL'); process.exit(ok ? 0 : 1);
