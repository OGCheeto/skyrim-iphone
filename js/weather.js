// Frosthold weather: pure, DOM-free logic (state machine, wind push, particles budget, FPS valve).
export const STATES = {
  clear:     { label: 'Clear',      storm: 0,   gloom: 0,    particle: 'snow', density: 0.25, windAudio: 0,   rain: 0 },
  windstorm: { label: 'Windstorm',  storm: 1,   gloom: 0.18, particle: 'snow', density: 0.45, windAudio: 1,   rain: 0 },
  snowstorm: { label: 'Snowstorm',  storm: 0.8, gloom: 0.28, particle: 'snow', density: 1,    windAudio: 0.7, rain: 0 },
  rainstorm: { label: 'Rainstorm',  storm: 0.7, gloom: 0.38, particle: 'rain', density: 1,    windAudio: 0.6, rain: 1 },
};
// Relative odds per region. Peaks are stormier; Kettleford (sheltered valley) is mostly clear.
export const REGION_WEIGHTS = {
  'Kettleford':         { clear: 6, windstorm: 1, snowstorm: 2, rainstorm: 1 },
  'Whitepass Vale':     { clear: 4, windstorm: 2, snowstorm: 3, rainstorm: 2 },
  'Hrimvald Highlands': { clear: 2, windstorm: 3, snowstorm: 4, rainstorm: 2 },
  'Barrow of Ostmark':  { clear: 3, windstorm: 2, snowstorm: 2, rainstorm: 3 },
  'Cinderhorn Peak':    { clear: 2, windstorm: 4, snowstorm: 2, rainstorm: 3 },
};
// Max sideways push (px/s) per region. 0 = never pushed there.
export const REGION_PUSH = { 'Kettleford': 0, 'Whitepass Vale': 14, 'Barrow of Ostmark': 12, 'Hrimvald Highlands': 24, 'Cinderhorn Peak': 30 };
export const PUSH_MAX = 30;            // hard cap: <25% of slowest class speed (135) so the player always out-walks it
export const DUR_MIN = 120, DUR_MAX = 240, FADE = 8; // seconds
export const PROJ_DRIFT = 2.5;         // projectiles feel gusts 2.5x as much as the player (they're light)
export const POOL_MAX = 240, POOL_MIN = 60;

export function pickState(region, r = Math.random) {
  const w = REGION_WEIGHTS[region] || REGION_WEIGHTS['Whitepass Vale'];
  const tot = Object.values(w).reduce((a, b) => a + b, 0); let x = r() * tot;
  for (const [k, v] of Object.entries(w)) { x -= v; if (x < 0) return k; }
  return 'clear';
}

/** Wind push in px/s (signed by dir). Off in Kettleford, ruins (indoors) and the dragon fight (documented choice). */
export function windPush({ region, indoors, bossFight, storm, gust, dir = 1 }) {
  if (indoors || bossFight) return 0;
  const reg = REGION_PUSH[region] ?? 0;
  const v = reg * Math.max(0, Math.min(1, storm)) * Math.max(0, Math.min(1, gust));
  return Math.sign(dir || 1) * Math.min(PUSH_MAX, v);
}
/** Bend a projectile by the current wind (mutates s.vx). */
export function driftProjectile(s, push, dt) { s.vx += push * PROJ_DRIFT * dt; return s; }

export class Weather {
  constructor(r = Math.random) { this.r = r; this.region = ''; this.from = 'clear'; this.to = 'clear'; this.blend = 1; this.timer = 0;
    this.gust = 0; this.gustTarget = 0; this.gustT = 0; this.dir = 1; this.flash = 0; this.flashGap = 6; }
  get state() { return this.blend >= 0.5 ? this.to : this.from; }
  /** Crossfaded value of a numeric STATES field. */
  mix(key) { return STATES[this.from][key] * (1 - this.blend) + STATES[this.to][key] * this.blend; }
  set(state, instant = false) { if (!STATES[state]) return; this.from = instant ? state : this.state; this.to = state; this.blend = instant ? 1 : 0;
    this.timer = DUR_MIN + this.r() * (DUR_MAX - DUR_MIN); this.dir = this.r() < 0.5 ? -1 : 1; }
  update(dt, region) {
    if (region && region !== this.region) { this.region = region; this.set(pickState(region, this.r)); }
    this.timer -= dt; if (this.timer <= 0) this.set(pickState(this.region, this.r));
    this.blend = Math.min(1, this.blend + dt / FADE);
    // gusts: pick a new target every 3-7s, ramp toward it slowly (time constant ~1.5s)
    this.gustT -= dt; if (this.gustT <= 0) { this.gustT = 3 + this.r() * 4; this.gustTarget = 0.3 + this.r() * 0.7; }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt / 1.5);
    // lightning: rainstorm only, at least 6s apart, ~0.18s decay -> never strobes
    this.flash = Math.max(0, this.flash - dt / 0.18); this.flashGap -= dt;
    if (this.mix('rain') > 0.6 && this.flashGap <= 0 && this.r() < dt / 10) { this.flash = 1; this.flashGap = 6 + this.r() * 8; }
  }
}

/** FPS safety valve: shrinks the particle budget when frames are slow, restores it slowly. */
export class FpsGovernor {
  constructor(max = POOL_MAX, min = POOL_MIN) { this.max = max; this.min = min; this.cap = max; this.fps = 60; this.low = 0; this.high = 0; }
  sample(dt) {
    if (!(dt > 0)) return this.cap;
    this.fps += (1 / dt - this.fps) * 0.1;
    if (this.fps < 45) { this.low += dt; this.high = 0; } else if (this.fps > 55) { this.high += dt; this.low = 0; } else { this.low = this.high = 0; }
    if (this.low > 1) { this.cap = Math.max(this.min, Math.floor(this.cap * 0.75)); this.low = 0; }
    if (this.high > 3 && this.cap < this.max) { this.cap = Math.min(this.max, Math.ceil(this.cap * 1.15)); this.high = 0; }
    return this.cap;
  }
}

/** Fixed pool of particles (allocated once). active() is how many to simulate/draw this frame. */
export class ParticlePool {
  constructor(n = POOL_MAX, r = Math.random) { this.n = n; this.p = Array.from({ length: n }, () => ({ x: r(), y: r(), s: 0.5 + r() })); }
  active(cap, density) { return Math.max(0, Math.min(this.n, Math.floor(cap * density))); }
}
