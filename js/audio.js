// Procedural WebAudio sound effects. No audio files.
let ctx = null, master = null;
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
function tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
  if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
function noise(dur, vol = 0.3, freq = 800, q = 1) {
  if (!ctx) return; const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
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
  click: () => tone(1200, 0.03, 'square', 0.08),
  die: () => tone(300, 1, 'triangle', 0.3, -250),
};
