import assert from 'node:assert/strict';
const store = {}; globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const A = await import('../js/audio.js');
assert.deepEqual(A.normalizeSettings(null), A.DEFAULT_SETTINGS);
assert.deepEqual(A.normalizeSettings({ music: 5, ambience: -1, musicMuted: 1 }), { music: 1, ambience: 0, musicMuted: true, ambienceMuted: false });
assert.equal(A.normalizeSettings({ music: NaN }).music, 0.7);
A.setSettings({ music: 0.3, ambienceMuted: true });
assert.deepEqual(JSON.parse(store[A.SETTINGS_KEY]), { music: 0.3, ambience: 0.7, musicMuted: false, ambienceMuted: true });
assert.equal(A.busLevel(A.getSettings(), 'amb'), 0); assert.ok(A.busLevel({ ...A.DEFAULT_SETTINGS, music: 1 }, 'music') < 0.8, 'music under sfx bus');
for (const p of Object.values(A.PATTERNS)) { assert.equal(p.steps.length, 32); assert.match(p.steps, /^[OTtk.]+$/); assert.equal(A.hitsForStep(p, 32), p.steps[0]); }
assert.ok(A.PATTERNS.boss.bpm > A.PATTERNS.combat.bpm);
assert.ok([...A.PATTERNS.boss.steps].filter((c) => c !== '.').length > [...A.PATTERNS.combat.steps].filter((c) => c !== '.').length, 'boss denser');
assert.equal(A.combatLevel({ bossAwake: true, nearestEngagedDist: 999, sinceCombat: 99 }), 2);
assert.equal(A.combatLevel({ bossAwake: false, nearestEngagedDist: 100, sinceCombat: 0 }), 1);
assert.equal(A.combatLevel({ bossAwake: false, nearestEngagedDist: Infinity, sinceCombat: 2 }), 1);
assert.equal(A.combatLevel({ bossAwake: false, nearestEngagedDist: Infinity, sinceCombat: 5 }), 0);
assert.ok(A.GUST['Hrimvald Highlands'] > A.GUST['Kettleford']);
assert.equal(A.audioDebug(), null); A.setScene({ region: 'x' }); // no ctx: must not throw
console.log('audio tests passed');
