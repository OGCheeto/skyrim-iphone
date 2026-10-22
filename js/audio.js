// Procedural WebAudio: SFX, ambient wind/rumble, and a lookahead-scheduled war-drum track.
// Graph: [sfx | music(combat, boss layers) | amb] buses -> master -> compressor/limiter -> destination
let ctx = null, master = null, noiseBuf = null, brownBuf = null, wind = null, rumble = null, rainL = null;
const buses = {};
const state = { region: '', lair: 0, combat: 0, outdoors: true };

// ---------- Settings (persisted) ----------
export const SETTINGS_KEY = 'frosthold.audio.v1';
export const DEFAULT_SETTINGS = { music: 0.7, ambience: 0.7, musicMuted: false, ambienceMuted: false };
export function normalizeSettings(o) {
  const s = { ...DEFAULT_SETTINGS, ...(o && typeof o === 'object' ? o : {}) };
  const c = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  return { music: c(s.music, 0.7), ambience: c(s.ambience, 0.7), musicMuted: !!s.musicMuted, ambienceMuted: !!s.ambienceMuted };
}
let settings = { ...DEFAULT_SETTINGS };
try { settings = normalizeSettings(JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) || 'null')); } catch { /* defaults */ }
export const getSettings = () => ({ ...settings });
export function setSettings(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  applyBusGains();
}
// Music/ambience buses sit well under SFX (0.8) so effects punch through.
export const busLevel = (s, which) => which === 'music' ? (s.musicMuted ? 0 : s.music * 0.45) : (s.ambienceMuted ? 0 : s.ambience * 0.5);
function applyBusGains() {
  if (!ctx) return; const t = ctx.currentTime;
  buses.music.gain.setTargetAtTime(busLevel(settings, 'music'), t, 0.1);
  buses.amb.gain.setTargetAtTime(busLevel(settings, 'amb'), t, 0.1);
}

// ---------- Drum patterns (pure, testable) ----------
// 8th-note steps: 'O' odaiko (deep), 'T' low tom, 't' high tom, 'k' rim click, '.' rest
export const PATTERNS = {
  combat: { bpm: 72, steps: 'O...t.T.O.t...T.O...t.T.O.T.t.tT' },
  boss:   { bpm: 92, steps: 'O.tTO.tTO.ttT.TkO.tTOOtTO.tTkTTT' },
};
export const hitsForStep = (p, i) => p.steps[i % p.steps.length];
// Which music layer should be playing: 0 none, 1 combat, 2 boss.
export function combatLevel({ bossAwake, nearestEngagedDist, sinceCombat }) {
  if (bossAwake) return 2;
  if (nearestEngagedDist < 320) return 1;
  return sinceCombat < 4 ? 1 : 0; // hang on a few seconds after the last fight
}
export const GUST = { 'Hrimvald Highlands': 1, 'Cinderhorn Peak': 0.8, 'Whitepass Vale': 0.6, 'Barrow of Ostmark': 0.35, 'Kettleford': 0.3 };

// ---------- Setup ----------
function makeNoise(seconds, brown) {
  const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  const f = Math.min(2000, n >> 4); for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[n - 1 - i] *= k; } // soft loop seam
  return b;
}
function loopLayer(buf, type, freq, q) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(buses.amb); src.start();
  return { src, f, g };
}
/** Call from inside a user gesture (touchstart/click/keydown). Safe to call repeatedly. */
export function unlockAudio() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); // iOS unlock
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(comp); comp.connect(ctx.destination);
    for (const k of ['sfx', 'music', 'amb']) { buses[k] = ctx.createGain(); buses[k].connect(master); }
    buses.sfx.gain.value = 0.8;
    buses.combat = ctx.createGain(); buses.combat.gain.value = 0; buses.combat.connect(buses.music);
    buses.boss = ctx.createGain(); buses.boss.gain.value = 0; buses.boss.connect(buses.music);
    applyBusGains();
    noiseBuf = makeNoise(3, false); brownBuf = makeNoise(4, true); // generated once, reused everywhere
    wind = loopLayer(noiseBuf, 'bandpass', 500, 0.7);
    wind.hi = loopLayer(noiseBuf, 'highpass', 3500, 0.5);
    rumble = loopLayer(brownBuf, 'lowpass', 140, 0.9);
    rainL = loopLayer(noiseBuf, 'highpass', 1800, 0.4); // rain hiss, on the ambience bus (respects volume/mute)
    startScheduler();
  }
  if (ctx.state !== 'running') ctx.resume();
}
export function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resumeAudio() { if (ctx && ctx.state !== 'running') ctx.resume(); }

// ---------- Scene (call ~4x/sec) ----------
export function setScene({ region = '', lair = 0, combat = 0, outdoors = true, storm = 0, rain = 0 } = {}) {
  Object.assign(state, { region, lair, combat, outdoors, storm, rain });
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime, st = outdoors ? storm : 0, gust = Math.min(1.4, (GUST[region] ?? 0.5) + st * 0.5), g = Math.random() * gust * (1 + st * 0.5);
  const base = outdoors ? 0.25 + 0.35 * gust + 0.2 * st : 0.08;
  wind.g.gain.setTargetAtTime((base + g * 0.4) * (1 - lair * 0.6), t, 0.8);
  wind.f.frequency.setTargetAtTime(300 + g * 900 + gust * 200, t, 1.0);
  wind.hi.g.gain.setTargetAtTime((0.04 + g * 0.08 * gust) * (1 - lair * 0.7), t, 0.8);
  rainL.g.gain.setTargetAtTime(rain * (0.22 + Math.random() * 0.04), t, 1.5);
  rumble.g.gain.setTargetAtTime(lair * (0.9 + Math.random() * 0.3), t, 1.2);
  rumble.f.frequency.setTargetAtTime(90 + lair * 80 + Math.random() * 30, t, 1.5);
  buses.combat.gain.setTargetAtTime(combat === 1 ? 1 : 0, t, combat === 1 ? 0.6 : 1.5);
  buses.boss.gain.setTargetAtTime(combat === 2 ? 1 : 0, t, combat === 2 ? 0.5 : 2);
}

// ---------- Drum scheduler (lookahead) ----------
const LOOKAHEAD = 0.15, TICK_MS = 50;
function startScheduler() {
  const seq = { combat: { next: ctx.currentTime + 0.1, step: 0 }, boss: { next: ctx.currentTime + 0.1, step: 0 } };
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    for (const name of ['combat', 'boss']) {
      const s = seq[name], P = PATTERNS[name], dt = 60 / P.bpm / 2, out = buses[name];
      if (s.next < ctx.currentTime - 0.3) s.next = ctx.currentTime + 0.05; // resync after suspend
      const audible = state.combat === (name === 'boss' ? 2 : 1) || out.gain.value > 0.005; // silent layers cost nothing
      while (s.next < ctx.currentTime + LOOKAHEAD) {
        if (audible) drumHit(hitsForStep(P, s.step), s.next, out, name === 'boss');
        s.next += dt; s.step++;
      }
    }
  }, TICK_MS);
}
const DRUM = { O: [55, 0.9, 0.9, 38], T: [82, 0.55, 0.6, 55], t: [120, 0.35, 0.45, 85], k: [0, 0.06, 0.25, 0] };
function drumHit(kind, t, out, boss) {
  const spec = DRUM[kind]; if (!spec) return;
  const [f0, dur, vol, f1] = spec;
  if (f0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0 * (boss ? 1.06 : 1), t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
  n.buffer = noiseBuf; nf.type = kind === 'k' ? 'highpass' : 'lowpass'; nf.frequency.value = kind === 'k' ? 2500 : 900;
  ng.gain.setValueAtTime(kind === 'k' ? 0.15 : vol * 0.35, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'k' ? 0.05 : 0.12));
  n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t, Math.random() * 2, 0.2);
}

// ---------- SFX ----------
function tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
  if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(buses.sfx); o.start(t); o.stop(t + dur);
}
function noise(dur, vol = 0.3, freq = 800, q = 1) {
  if (!ctx) return; const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(buses.sfx); s.start(t, Math.random() * 1.5, Math.min(dur + 0.05, 1.4));
}
export const sfx = {
  swing: () => noise(0.12, 0.25, 1800, 2),
  hit: () => { noise(0.08, 0.4, 500); tone(120, 0.1, 'square', 0.15, -60); },
  hurt: () => tone(220, 0.2, 'sawtooth', 0.2, -120),
  spell: () => { tone(900, 0.25, 'sine', 0.2, 600); noise(0.2, 0.1, 4000, 5); },
  shout: () => { tone(90, 0.9, 'sawtooth', 0.35, -40); tone(135, 0.9, 'square', 0.15, -60); noise(0.9, 0.5, 300, 0.5); },
  loot: () => { tone(660, 0.08, 'triangle', 0.2); setTimeout(() => tone(990, 0.12, 'triangle', 0.2), 70); },
  level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.22), i * 110)),
  quest: () => [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sine', 0.22), i * 160)),
  roar: () => { tone(70, 1.2, 'sawtooth', 0.4, -30); noise(1.2, 0.4, 200, 0.7); },
  fire: () => noise(0.4, 0.3, 700, 0.8),
  splash: () => { noise(0.35, 0.35, 900, 0.7); noise(0.18, 0.2, 2600, 1.5); tone(180, 0.15, 'sine', 0.12, -90); },
  bite: () => { tone(1320, 0.18, 'sine', 0.22); setTimeout(() => tone(1760, 0.3, 'sine', 0.2), 90); },
  cook: () => { noise(0.6, 0.18, 3200, 0.8); tone(520, 0.12, 'triangle', 0.12); },
  click: () => tone(1200, 0.03, 'square', 0.08),
  die: () => tone(300, 1, 'triangle', 0.3, -250),
};
export const audioDebug = () => ctx ? { state: ctx.state, ...state, music: buses.music.gain.value, amb: buses.amb.gain.value,
  combatFade: buses.combat.gain.value, bossFade: buses.boss.gain.value, wind: wind.g.gain.value, rain: rainL.g.gain.value, rumble: rumble.g.gain.value } : null;
