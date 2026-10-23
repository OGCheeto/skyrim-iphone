// Headless caves + chopping run at 852x393 touch (playwright-core; serve repo on :8765). Screenshots -> /tmp/cave-*.png, /tmp/chop-*.png
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ev = (f, a) => p.evaluate(f, a); const fails = []; const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails.push(m); };
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const calm = () => ev(() => { for (const e of window.__frost.ents) { e.x = -9999; e.y = -9999; } window.__frost.S.hp = window.__frost.S.maxHp; });
await p.goto('http://localhost:8765/'); await p.waitForTimeout(300);
await p.tap('#newBtn'); await p.tap('.cls >> nth=0'); await p.waitForTimeout(600);
const site = await ev(() => window.__frost.world.caves.find((c) => c.id === 'gloamfang'));
await ev((c) => { const f = window.__frost; f.P.x = (c.x + 0.5) * 32; f.P.y = (c.y + 1.3) * 32; }, site); await calm(); await p.waitForTimeout(250);
check(/Enter Gloamfang Den/.test(await p.textContent('#prompt')), 'prompt at cave mouth');
await p.screenshot({ path: '/tmp/cave-0-mouth.png' });
const outside = await ev(() => ({ x: window.__frost.P.x, y: window.__frost.P.y }));
await p.tap('#bUse'); await p.waitForTimeout(500);
let st = await ev(() => { const f = window.__frost; return { cave: f.S.cave, map: f.map.cave, ents: f.ents.map((e) => e.kind), amb: f.audioDebug?.().cave }; });
check(st.cave === 'gloamfang' && st.map === 'gloamfang', 'entered cave'); check(st.ents.includes('gloamfang') && st.ents.includes('cavewolf'), 'cave enemies spawned ' + st.ents);
check(/Underground/.test(await p.textContent('#info')), 'HUD says Underground');
await calm(); await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/cave-1-dark.png' });
const r0 = await ev(() => window.__frost.Cv.lightRadius(window.__frost.S));
await ev(() => { const f = window.__frost, t = f.C.item({ name: 'Torch', kind: 'torch', power: 0, value: 6 }); f.S.inv.push(t); f.Cv.lightTorch(f.S, t.id); });
check(await ev(() => window.__frost.Cv.lightRadius(window.__frost.S)) > r0, 'torch widens light');
await calm(); await p.waitForTimeout(1200); check(await ev(() => window.__frost.S.torch) < 150, 'torch burns underground');
await p.screenshot({ path: '/tmp/cave-2-torch.png' });
// unique chest
const ch = await ev(() => window.__frost.map.chests[0]);
await ev((c) => { const f = window.__frost; f.P.x = (c.x + 0.5) * 32 + 20; f.P.y = (c.y + 0.5) * 32; }, ch); await calm(); await p.waitForTimeout(250); await p.tap('#bUse'); await p.waitForTimeout(300);
check(await ev(() => window.__frost.S.lantern && window.__frost.S.inv.some((i) => i.name === 'Deepfrost Lantern')), 'unique Deepfrost Lantern looted');
await p.screenshot({ path: '/tmp/cave-3-chest.png' });
// save + reload inside the cave
await ev(() => { window.__frost.S.x = window.__frost.P.x; localStorage.setItem(window.__frost.C.SAVE_KEY, window.__frost.C.serialize(window.__frost.S)); });
await p.reload(); await p.waitForTimeout(300); await p.tap('#contBtn'); await p.waitForTimeout(600);
check(await ev(() => window.__frost.map.cave === 'gloamfang' && window.__frost.S.lantern), 'continue resumes inside the cave');
// exit back to the same spot
const ex = await ev(() => window.__frost.map.exit);
await ev((c) => { const f = window.__frost; f.P.x = (c.x + 0.5) * 32; f.P.y = (c.y + 1.2) * 32; }, ex); await calm(); await p.waitForTimeout(250);
check(/Leave/.test(await p.textContent('#prompt')), 'exit prompt'); await p.tap('#bUse'); await p.waitForTimeout(500);
const back = await ev(() => ({ cave: window.__frost.S.cave, map: window.__frost.map.cave, x: window.__frost.P.x, y: window.__frost.P.y }));
check(!back.cave && !back.map && Math.abs(back.x - outside.x) < 1 && Math.abs(back.y - outside.y) < 1, 'exit returns to the same spot');
// chopping with a touch hold on Use
const tree = await ev(() => { const f = window.__frost, w = f.world, P = f.P;
  const sx = Math.floor(P.x / 32), sy = Math.floor(P.y / 32), seen = new Set([sy * w.w + sx]), q = [{ x: sx, y: sy }];
  while (q.length) { const c = q.shift(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = c.x + dx, y = c.y + dy; if (f.Tr.canChop(w, x, y)) return { x, y, from: c }; if (w.walk(x, y) && !seen.has(y * w.w + x)) { seen.add(y * w.w + x); q.push({ x, y }); } } } });
await ev((t) => { const f = window.__frost; f.P.x = (t.from.x + 0.5) * 32; f.P.y = (t.from.y + 0.5) * 32; f.P.fx = t.x - t.from.x; f.P.fy = t.y - t.from.y; }, tree); await calm(); await p.waitForTimeout(250);
{ const pr = await p.textContent('#prompt'); check(/Chop pine \([24] hits\)/.test(pr), 'chop prompt shows hits: ' + pr); }
const bb = await p.locator('#bUse').boundingBox(); await touch('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.waitForFunction(() => window.__frost.falling.length > 0, null, { timeout: 4000 }).catch(() => {});
await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/chop-1-falling.png' }); await touch('touchEnd');
const tt = await ev((t) => ({ tile: window.__frost.world.get(t.x, t.y), felled: window.__frost.S.felled, wood: window.__frost.S.inv.filter((i) => i.kind === 'wood').map((i) => i.name) }), tree);
check(tt.tile === 13 && tt.felled === 1 && tt.wood.length === 1, 'hold-to-chop fells tree: ' + JSON.stringify(tt));
await p.waitForTimeout(800); await p.screenshot({ path: '/tmp/chop-2-stump.png' });
// axe chop via Attack
await ev(() => { const f = window.__frost; f.S.inv.push(f.C.item({ name: 'Iron Hatchet', kind: 'weapon', power: 9, value: 20 })); f.C.equip(f.S, f.S.inv.at(-1).id); });
const t2 = await ev(() => { const f = window.__frost, w = f.world, P = f.P, px = Math.floor(P.x / 32), py = Math.floor(P.y / 32);
  for (let r = 1; r < 30; r++) for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (f.Tr.canChop(w, x, y) && w.walk(x + dx, y + dy) && !f.Tr.canChop(w, x + dx, y + dy)) return { x, y, from: { x: x + dx, y: y + dy } }; });
await ev((t) => { const f = window.__frost; f.P.x = (t.from.x + 0.5) * 32; f.P.y = (t.from.y + 0.5) * 32; f.P.fx = t.x - t.from.x; f.P.fy = t.y - t.from.y; }, t2); await calm();
for (let i = 0; i < 2; i++) { await p.tap('#bAttack'); await p.waitForTimeout(650); }
check(await ev((t) => window.__frost.world.get(t.x, t.y), t2) === 13, 'axe fells in 2 attacks');
// craft campfire + rest
await ev(() => { const f = window.__frost; for (let i = 0; i < 2; i++) f.S.inv.push(f.Tr.woodItem('firewood')); f.S.hp = 20; });
await p.tap('#menuBtn'); await p.waitForTimeout(300);
const craftBtn = p.locator('#panelBody button', { hasText: /Campfire/ }); check(await craftBtn.count() > 0, 'Craft row in inventory');
if (await craftBtn.count()) await craftBtn.first().tap(); await p.waitForTimeout(200); await p.tap('#closePanel').catch(() => {}); await p.waitForTimeout(300);
check(!!(await ev(() => window.__frost.S.camp)), 'campfire placed'); await calm(); await p.waitForTimeout(250);
check(/Rest by the campfire/.test(await p.textContent('#prompt')), 'rest prompt'); await p.tap('#bUse'); await p.waitForTimeout(200);
check(await ev(() => window.__frost.S.hp) > 20, 'rest heals'); await p.screenshot({ path: '/tmp/chop-3-campfire.png' });
console.log('errors', errs); check(errs.length === 0, 'no JS errors');
await b.close(); if (fails.length) { console.log('FAILED', fails); process.exit(1); } console.log('caves playwright passed');
