// Headless weather smoke test (playwright-core; serve repo on :8765). Screenshots -> /tmp/wx-*.png
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ev = (f, a) => p.evaluate(f, a); const fails = []; const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails.push(m); };
await p.goto('http://localhost:8765/'); await p.waitForTimeout(300);
await p.tap('#newBtn'); await p.tap('.cls >> nth=1'); await p.waitForTimeout(800);
// find an open Highlands spot away from enemies
const spot = await ev(() => { const f = window.__frost, w = f.world; for (let y = 2; y < w.h - 2; y++) for (let x = 2; x < w.w - 2; x++) { if (w.region(x, y) !== 'Hrimvald Highlands') continue; let ok = true; for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) if (!w.walk(x + dx, y + dy) || w.get(x + dx, y + dy) === f.C.T?.FLOOR) ok = false; if (ok && !f.ents.some((e) => Math.hypot(e.x / 32 - x, e.y / 32 - y) < 12)) return { x: x * 32 + 16, y: y * 32 + 16 }; } });
check(!!spot, 'found open Highlands spot');
const go = (pt) => ev((pt) => { const f = window.__frost; f.P.x = pt.x; f.P.y = pt.y; f.S.hp = f.S.maxHp = 99999; }, pt);
await go(spot); await p.waitForTimeout(300);
for (const st of ['clear', 'windstorm', 'snowstorm', 'rainstorm']) {
  await ev((st) => { const w = window.__frost.weather; w.set(st, true); w.timer = 999; w.gust = w.gustTarget = 1; w.gustT = 99; w.dir = 1; if (st === 'rainstorm') { w.flash = 0; w.flashGap = 99; } }, st);
  await go(spot); const x0 = await ev(() => window.__frost.P.x); await p.waitForTimeout(1000);
  const r = await ev(() => { const f = window.__frost; return { x: f.P.x, push: f.push, info: document.getElementById('info').textContent, n: f.pool.active(f.gov.cap, f.weather.mix('density')), cap: f.gov.cap, a: f.audioDebug() }; });
  console.log(st, { drift: +(r.x - x0).toFixed(1), push: +r.push.toFixed(1), particles: r.n, cap: r.cap, info: r.info, wind: +r.a.wind.toFixed(2), rain: +r.a.rain.toFixed(2) });
  check(r.info.includes(await ev((st) => window.__frost.W.STATES[st].label, st)), `${st} shown in HUD`);
  if (st === 'clear') check(r.push === 0, 'clear: no push'); else check(r.push > 0 && r.push <= 30 && r.x - x0 > 5 && r.x - x0 < 35, `${st}: small push`);
  if (st === 'rainstorm') check(r.a.rain > 0.1, 'rain audio layer up');
  if (st === 'rainstorm') { await ev(() => { window.__frost.weather.flash = 1; }); await p.waitForTimeout(40); await p.screenshot({ path: '/tmp/wx-lightning.png' }); await p.waitForTimeout(400);
    check(await ev(() => window.__frost.weather.flash === 0), 'lightning decays fast'); }
  await p.screenshot({ path: `/tmp/wx-${st}.png` });
}
// projectile bending: fire a frost bolt straight up in a windstorm, it should gain +vx
await ev(() => { const w = window.__frost.weather; w.set('windstorm', true); w.timer = 999; w.gust = w.gustTarget = 1; w.gustT = 99; w.dir = 1; });
await go(spot); await p.waitForTimeout(200);
await ev(() => { const f = window.__frost; f.P.fx = 0; f.P.fy = 1; f.S.mp = 999; }); await p.tap('#bSpell'); await p.waitForTimeout(250);
const bolt = await ev(() => { const s = window.__frost.shots.find((s) => s.friendly); return s && { vx: s.vx, vy: s.vy }; });
check(bolt && bolt.vx > 5 && bolt.vx < 40 && bolt.vy > 300, `frost bolt bent by wind ${JSON.stringify(bolt)}`);
// zero-push zones
await ev(() => window.__frost.weather.set('windstorm', true));
const v = await ev(() => { const f = window.__frost, c = f.world.center(f.world.spawn); return c; }); await go(v); await p.waitForTimeout(500);
check(await ev(() => window.__frost.push) === 0, 'Kettleford: push 0');
const ruin = await ev(() => { const f = window.__frost, w = f.world; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.get(x, y) === 7) return { x: x * 32 + 16, y: y * 32 + 16 }; });
await go(ruin); await ev(() => { const w = window.__frost.weather; w.set('windstorm', true); w.timer = 999; w.gust = 1; }); await p.waitForTimeout(400);
check(await ev(() => window.__frost.push) === 0, 'ruins: push 0');
await ev(() => { const f = window.__frost, l = f.world.center(f.world.lair); f.P.x = l.x - 150; f.P.y = l.y; }); await p.waitForTimeout(1500);
await ev(() => { const w = window.__frost.weather; w.set('windstorm', true); w.timer = 999; w.gust = 1; }); await p.waitForTimeout(400);
const bf = await ev(() => ({ push: window.__frost.push, boss: window.__frost.bossFight, region: window.__frost.P.region }));
check(bf.boss && bf.push === 0, `dragon fight: push 0 (${bf.region})`);
await p.screenshot({ path: '/tmp/wx-boss.png' });
// ambience mute silences rain
await go(spot); await ev(() => { const w = window.__frost.weather; w.set('rainstorm', true); w.timer = 999; });
await p.tap('#menuBtn'); await p.tap('[data-tab=char]'); await p.tap('#mute-ambience'); await p.waitForTimeout(400);
check((await ev(() => window.__frost.audioDebug().amb)) < 0.01, 'ambience mute silences rain+wind bus');
await p.tap('#mute-ambience'); await p.tap('#menuBtn').catch(() => {}); await ev(() => document.querySelector('#panel .close, #closePanel')?.click());
// FPS valve in the live loop: feed slow frames, then fast ones
const fps = await ev(() => { const g = window.__frost.gov; for (let i = 0; i < 120; i++) g.sample(1 / 20); const low = g.cap; for (let i = 0; i < 2400; i++) g.sample(1 / 60); return { low, back: g.cap }; });
check(fps.low < 240 && fps.back === 240, `FPS valve ${JSON.stringify(fps)}`);
// save/load still works
await ev(() => { const f = window.__frost; f.S.gold = 4242; }); await ev(() => document.dispatchEvent(new Event('visibilitychange')));
await p.reload(); await p.waitForTimeout(300); await p.tap('#contBtn'); await p.waitForTimeout(800);
const ld = await ev(() => ({ r: window.__frost.running, info: document.getElementById('info').textContent }));
check(ld.r && /Clear|storm/.test(ld.info), `continue works: ${ld.info}`);
console.log('errors:', errs); await b.close(); const ok = !fails.length && !errs.length; console.log(ok ? 'WEATHER SMOKE PASS' : 'WEATHER SMOKE FAIL'); process.exit(ok ? 0 : 1);
