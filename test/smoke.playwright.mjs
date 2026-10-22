import { chromium } from 'playwright-core' // npm i playwright-core;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8765/'); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/s1.png' });
await p.tap('#newBtn'); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/s2.png' });
await p.tap('.cls >> nth=0'); await p.waitForTimeout(600);
// walk to elder & talk
await p.evaluate(() => { const f = window.__frost, c = f.world.center(f.world.npcs[0]); f.P.x = c.x; f.P.y = c.y - 20; });
await p.tap('#bUse'); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/s3.png' });
await p.tap('#dlgBtns button'); 
// joystick drag
const box = await p.locator('#stick').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const cdp = await ctx.newCDPSession(p);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 50, y: cy }] });
const x0 = await p.evaluate(() => window.__frost.P.x); await p.waitForTimeout(800);
const x1 = await p.evaluate(() => window.__frost.P.x);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
console.log('joystick moved px:', Math.round(x1 - x0));
// teleport near wolves and fight; shout
await p.evaluate(() => { const f = window.__frost, w = f.ents.find((e) => e.kind === 'wolf'); f.P.x = w.x - 30; f.P.y = w.y; f.P.fx = 1; f.P.fy = 0; });
await p.tap('#bShout'); for (let i = 0; i < 6; i++) { await p.tap('#bAttack'); await p.waitForTimeout(150); }
await p.screenshot({ path: '/tmp/s4.png' });
// boss
await p.evaluate(() => { const f = window.__frost, c = f.world.center(f.world.lair); f.P.x = c.x - 150; f.P.y = c.y; f.S.hp = 9999; f.S.maxHp = 9999; });
await p.waitForTimeout(3000); console.log(await p.evaluate(()=>{const f=window.__frost;return JSON.stringify({p:f.paused,r:f.running,x:f.P.x,y:f.P.y,dlg:document.getElementById('dialog').className, t:document.getElementById('dlgText').textContent})})); await p.screenshot({ path: '/tmp/s5.png' });
await p.evaluate(() => { const f = window.__frost; f.ents.find((e) => e.kind === 'boss').hp = 1; const b = f.ents.find((e) => e.kind === 'boss'); f.P.x = b.x - 40; f.P.y = b.y; f.P.fx = 1; f.P.fy = 0; });
for (let i=0;i<4;i++){await p.tap('#bAttack'); await p.waitForTimeout(450);}
console.log('boss dead:', await p.evaluate(() => window.__frost.S.boss), 'main stage', await p.evaluate(() => window.__frost.S.quests.main.stage), 'level', await p.evaluate(() => window.__frost.S.level));
await p.tap('#menuBtn'); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/s6.png' });
await p.tap('[data-tab=journal]'); await p.waitForTimeout(100); await p.screenshot({ path: '/tmp/s7.png' });
await p.tap('[data-tab=char]'); await p.tap('#saveBtn');
await p.reload(); await p.waitForTimeout(400); console.log('continue enabled:', !(await p.isDisabled('#contBtn')));
await p.tap('#contBtn'); await p.waitForTimeout(300); console.log('loaded boss flag:', await p.evaluate(() => window.__frost.S.boss));
console.log('errors:', errs);
await b.close();
