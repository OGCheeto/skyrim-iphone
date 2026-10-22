import assert from 'node:assert/strict';
import * as W from '../js/weather.js';
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
// state machine
const w = new W.Weather(rnd); w.update(0.016, 'Hrimvald Highlands');
assert.ok(W.STATES[w.to]); assert.ok(w.timer >= W.DUR_MIN && w.timer <= W.DUR_MAX);
w.set('rainstorm', true); w.set('clear'); assert.equal(w.blend, 0);
w.update(W.FADE / 2, 'Hrimvald Highlands'); assert.ok(Math.abs(w.mix('gloom') - STATES_avg()) < 1e-9, 'linear crossfade');
function STATES_avg() { return (W.STATES.rainstorm.gloom + W.STATES.clear.gloom) / 2; }
w.update(W.FADE, 'Hrimvald Highlands'); assert.equal(w.blend, 1); assert.equal(w.state, 'clear');
const w2 = new W.Weather(rnd); w2.update(0.1, 'Whitepass Vale'); const t0 = w2.to; let changed = 0;
for (let i = 0; i < 20000; i++) { const before = w2.timer; w2.update(0.05, 'Whitepass Vale'); if (w2.timer > before) changed++; }
assert.ok(changed >= 3 && changed <= 9, `changes every few minutes in 1000s: ${changed}`);
// region rules
const counts = (reg) => { const c = { clear: 0, windstorm: 0, snowstorm: 0, rainstorm: 0 }; for (let i = 0; i < 5000; i++) c[W.pickState(reg, rnd)]++; return c; };
const k = counts('Kettleford'), pk = counts('Cinderhorn Peak');
assert.ok(k.clear > pk.clear * 2, 'village mostly clear'); for (const v of Object.values(pk)) assert.ok(v > 0);
assert.equal(W.pickState('Kettleford', () => 0), 'clear');
// push limits
const base = { storm: 1, gust: 1, dir: 1, indoors: false, bossFight: false };
assert.equal(W.windPush({ ...base, region: 'Kettleford' }), 0);
assert.equal(W.windPush({ ...base, region: 'Cinderhorn Peak', indoors: true }), 0);
assert.equal(W.windPush({ ...base, region: 'Cinderhorn Peak', bossFight: true }), 0);
assert.equal(W.windPush({ ...base, region: 'Hrimvald Highlands', storm: 0 }), 0, 'clear = no push');
for (const r of Object.keys(W.REGION_PUSH)) assert.ok(Math.abs(W.windPush({ ...base, region: r, storm: 5, gust: 5, dir: -1 })) <= W.PUSH_MAX);
assert.ok(W.PUSH_MAX < 135 * 0.25, 'player always out-walks wind');
assert.ok(W.windPush({ ...base, region: 'Cinderhorn Peak' }) > W.windPush({ ...base, region: 'Whitepass Vale' }), 'peaks strongest');
assert.equal(W.windPush({ ...base, region: 'Cinderhorn Peak', dir: -1 }), -30);
// projectile drift
const p = { vx: 380, vy: 0 }; for (let i = 0; i < 60; i++) W.driftProjectile(p, 20, 1 / 60);
assert.ok(Math.abs(p.vx - (380 + 20 * W.PROJ_DRIFT)) < 1e-6 && p.vy === 0);
const q = { vx: 0, vy: 380 }; W.driftProjectile(q, 0, 1); assert.equal(q.vx, 0, 'no wind no drift');
// particle cap
const pool = new W.ParticlePool(); assert.equal(pool.p.length, W.POOL_MAX); assert.ok(W.POOL_MAX >= 150 && W.POOL_MAX <= 300);
assert.equal(pool.active(9999, 1), W.POOL_MAX); assert.equal(pool.active(200, 0.5), 100);
const ref = pool.p[0]; pool.active(10, 1); assert.equal(pool.p[0], ref, 'reused, not reallocated');
// FPS fallback
const g = new W.FpsGovernor(); for (let i = 0; i < 120; i++) g.sample(1 / 25);
assert.ok(g.cap < W.POOL_MAX, `drops when slow: ${g.cap}`); for (let i = 0; i < 2000; i++) g.sample(1 / 10); assert.equal(g.cap, W.POOL_MIN, 'floored');
for (let i = 0; i < 60 * 60; i++) g.sample(1 / 60); assert.equal(g.cap, W.POOL_MAX, 'restores');
// lightning: rare, brief, never strobes
const L = new W.Weather(rnd); L.update(0, 'Barrow of Ostmark'); L.set('rainstorm', true); let flashes = 0, lastF = -99, minGap = 99, prev = 0;
for (let t = 0; t < 600; t += 1 / 60) { L.timer = 999; L.update(1 / 60, 'Barrow of Ostmark'); if (L.flash === 1 && prev < 1) { flashes++; minGap = Math.min(minGap, t - lastF); lastF = t; } prev = L.flash; }
assert.ok(flashes >= 10 && minGap >= 6, `flashes ${flashes}, min gap ${minGap.toFixed(1)}s`);
const C = new W.Weather(rnd); C.update(0, 'Kettleford'); C.set('clear', true); for (let i = 0; i < 6000; i++) { C.timer = 999; C.update(0.05, 'Kettleford'); assert.equal(C.flash, 0); }
console.log('weather tests passed', { flashes, minGap: +minGap.toFixed(1), kettleford: k, peak: pk });
