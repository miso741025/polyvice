// Sound, all of it synthesised: there are no audio files in the project. Everything runs through one
// master gain; the engine, the sea and the sirens are long-lived voices whose levels are set each frame,
// the rest are short one-shots.

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain();
master.gain.value = 0.7;
master.connect(ctx.destination);

// A buffer of white noise, shared by every noisy sound.
const NOISE = (() => {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
})();
const noise = () => { const s = ctx.createBufferSource(); s.buffer = NOISE; s.loop = true; return s; };
const gainAt = (v, to = master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
const filter = (type, f, q = 1, to = master) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; };
const env = (param, t0, peak, attack, decay, floor = 0.0001) => {
  param.cancelScheduledValues(t0); param.setValueAtTime(floor, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  param.exponentialRampToValueAtTime(floor, t0 + attack + decay);
};
// A short tone with its own envelope.
function tone(type, freq, t0, peak, attack, decay, { to = master, slide, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + attack + decay);
  env(g.gain, t0, peak, attack, decay);
  o.connect(g); g.connect(to);
  o.start(t0); o.stop(t0 + attack + decay + 0.05);
  return o;
}
// A burst of filtered noise.
function burst(f, q, t0, peak, attack, decay, type = 'bandpass') {
  const s = noise(), fl = filter(type, f, q), g = gainAt(0, fl);
  env(g.gain, t0, peak, attack, decay);
  s.connect(g); s.start(t0); s.stop(t0 + attack + decay + 0.05);
}

// ----- Long-lived voices -----

// The engine: a low saw and a square an octave up, through a low-pass that opens with the throttle.
const engine = (() => {
  const out = gainAt(0), lp = filter('lowpass', 400, 2, out);
  const a = ctx.createOscillator(), b = ctx.createOscillator(), rumble = noise();
  a.type = 'sawtooth'; b.type = 'square';
  const bg = gainAt(0.25, lp), rg = gainAt(0.08, lp), rl = filter('lowpass', 120, 1, rg);
  a.connect(lp); b.connect(bg); rumble.connect(rl);
  a.start(); b.start(); rumble.start();
  return { out, lp, a, b };
})();
// The sea, heard on the beach: slow swells of low noise.
const sea = (() => {
  const out = gainAt(0), lp = filter('lowpass', 500, 0.7, out), s = noise();
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 0.11; lg.gain.value = 180;
  lfo.connect(lg); lg.connect(lp.frequency);
  s.connect(lp); s.start(); lfo.start();
  return { out };
})();
// The city: a faint hum of traffic and air conditioning, with the wind in it.
const city = (() => {
  const out = gainAt(0), bp = filter('bandpass', 220, 0.5, out), s = noise();
  s.connect(bp); s.start();
  return { out };
})();
// Sirens: a two-tone wail that comes and goes with the police.
const siren = (() => {
  const out = gainAt(0), o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = 720; lfo.type = 'sine'; lfo.frequency.value = 0.8; lg.gain.value = 180;
  lfo.connect(lg); lg.connect(o.frequency); o.connect(out);
  o.start(); lfo.start();
  return { out };
})();
// Tyres: a squeal while sliding.
const skid = (() => {
  const out = gainAt(0), bp = filter('bandpass', 1800, 6, out), s = noise();
  s.connect(bp); s.start();
  return { out, bp };
})();
const smooth = (param, v, k = 0.08) => param.setTargetAtTime(v, ctx.currentTime, k);

let unlocked = false;
export const sfx = {
  // Browsers keep audio silent until the page is clicked; call this from the Start button.
  unlock() { if (!unlocked) { ctx.resume(); unlocked = true; } },
  get ready() { return unlocked && ctx.state === 'running'; },
  setVolume(v) { master.gain.value = v; },

  // Per-frame levels. speed in m/s, throttle 0..1, inCar: whether the player drives; shore: 0..1 how close to the sea;
  // police: 0..1 how near the nearest siren is; sliding: 0..1 tyre slip; inside: in a room (everything muffled).
  ambience({ speed = 0, throttle = 0, inCar = false, shore = 0, police = 0, sliding = 0, inside = false, night = 0 }) {
    if (!unlocked) return;
    const rpm = inCar ? 60 + Math.abs(speed) * 7 + throttle * 25 : 0;
    smooth(engine.a.frequency, Math.max(40, rpm), 0.06); smooth(engine.b.frequency, Math.max(80, rpm * 2), 0.06);
    smooth(engine.lp.frequency, 300 + throttle * 900 + Math.abs(speed) * 20);
    smooth(engine.out.gain, inCar ? 0.16 + throttle * 0.1 : 0);
    smooth(sea.out.gain, inside ? 0 : 0.05 + shore * 0.3, 0.3);
    smooth(city.out.gain, inside ? 0.015 : 0.05 - night * 0.02, 0.3);
    smooth(siren.out.gain, inside ? 0 : police * 0.12, 0.2);
    smooth(skid.out.gain, inCar ? sliding * 0.2 : 0, 0.04);
  },

  shot() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    burst(1800, 0.6, t, 0.9, 0.003, 0.09, 'highpass');
    burst(300, 1.2, t, 0.8, 0.004, 0.18, 'lowpass');
    tone('sine', 110, t, 0.5, 0.004, 0.12, { slide: 40 });
  },
  punch(hit = true) {
    if (!unlocked) return;
    const t = ctx.currentTime;
    burst(hit ? 240 : 900, 1.5, t, hit ? 0.7 : 0.25, 0.004, hit ? 0.12 : 0.06, 'lowpass');
    if (hit) tone('sine', 90, t, 0.4, 0.004, 0.1, { slide: 45 });
  },
  hurt() { // the player takes a blow
    if (!unlocked) return;
    const t = ctx.currentTime;
    burst(180, 1.2, t, 0.6, 0.004, 0.14, 'lowpass'); tone('triangle', 160, t, 0.2, 0.01, 0.2, { slide: 70 });
  },
  cash() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    tone('square', 1320, t, 0.12, 0.004, 0.07); tone('square', 1760, t + 0.07, 0.12, 0.004, 0.14);
  },
  door() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    burst(700, 2, t, 0.3, 0.003, 0.05); burst(180, 1, t + 0.06, 0.4, 0.004, 0.12, 'lowpass');
  },
  carDoor() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    burst(260, 1.4, t, 0.5, 0.003, 0.08, 'lowpass'); burst(1400, 1, t + 0.01, 0.15, 0.002, 0.04);
  },
  horn(pitch = 1, loud = 0.1) {
    if (!unlocked) return;
    const t = ctx.currentTime;
    for (const f of [370, 466]) tone('sawtooth', f * pitch, t, loud, 0.02, 0.35, { to: filter('lowpass', 1400, 1) });
  },
  crash(strength = 1) { // a car hitting something
    if (!unlocked) return;
    const t = ctx.currentTime, s = Math.min(1, strength);
    burst(160, 0.8, t, 0.7 * s, 0.003, 0.25 + 0.2 * s, 'lowpass'); burst(2600, 1.4, t, 0.3 * s, 0.002, 0.08);
  },
  explosion() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    burst(80, 0.7, t, 1.2, 0.01, 1.6, 'lowpass'); burst(900, 0.6, t, 0.6, 0.005, 0.5); tone('sine', 60, t, 0.9, 0.01, 1.2, { slide: 25 });
  },
  passed() { // the mission sting: a rising major arpeggio with a shimmer on top
    if (!unlocked) return;
    const t = ctx.currentTime;
    [261.6, 329.6, 392, 523.3].forEach((f, n) => { tone('triangle', f, t + n * 0.12, 0.18, 0.01, 0.9, { detune: 4 }); tone('sine', f * 2, t + n * 0.12, 0.06, 0.01, 0.6); });
    tone('sine', 1046.5, t + 0.5, 0.08, 0.02, 1.4);
  },
  failed() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    [196, 185, 174.6].forEach((f, n) => tone('sawtooth', f, t + n * 0.35, 0.12, 0.02, 0.6, { to: filter('lowpass', 900, 1) }));
  },
  wasted() {
    if (!unlocked) return;
    const t = ctx.currentTime;
    tone('sawtooth', 110, t, 0.2, 0.05, 2.2, { slide: 55, to: filter('lowpass', 600, 1) });
    burst(120, 1, t, 0.5, 0.01, 0.6, 'lowpass');
  },
  phone() { // a ring, twice
    if (!unlocked) return;
    const t = ctx.currentTime;
    for (const r of [0, 0.6]) for (let k = 0; k < 8; k++) tone('square', k % 2 ? 1180 : 1040, t + r + k * 0.05, 0.05, 0.005, 0.04);
  },
  click() {
    if (!unlocked) return;
    burst(2400, 3, ctx.currentTime, 0.12, 0.002, 0.03);
  },
  // The crowd: a scream when someone is shot at, a shout when someone is hit.
  scream() {
    if (!unlocked) return;
    const t = ctx.currentTime + Math.random() * 0.1, f = 700 + Math.random() * 400;
    tone('sawtooth', f, t, 0.07, 0.03, 0.4, { slide: f * 0.7, to: filter('bandpass', f, 2) });
  },
};
