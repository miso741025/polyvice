// Sound, all of it synthesised: there are no audio files in the project.
// Three kinds of thing make it up. Long-lived voices (the engine, the sea, the city's hum, the wind, crickets, a
// murmur of people) whose levels are set each frame from where the listener is. Emitters: places in the world
// with a sound of their own (a fountain, the carousel, a club's wall, the airport), heard by distance and to one
// side. And short one-shots (a shot, a footstep, a bird, a dog three streets away).

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain();
master.gain.value = 0.7;
// Everything goes through a gentle limiter, so a gunfight on top of traffic on top of the sea does not clip.
const limiter = ctx.createDynamicsCompressor();
limiter.threshold.value = -16; limiter.knee.value = 12; limiter.ratio.value = 5; limiter.attack.value = 0.004; limiter.release.value = 0.2;
master.connect(limiter); limiter.connect(ctx.destination);
const probe = ctx.createAnalyser(); probe.fftSize = 2048; limiter.connect(probe); // for sfx.meter(): how loud it really is

// Two seconds of white noise and of brown (each sample a small step from the last: all rumble, no hiss).
const NOISE = (() => {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
})();
const BROWN = (() => {
  const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0);
  let v = 0;
  for (let i = 0; i < d.length; i++) { v = (v + (Math.random() * 2 - 1) * 0.02) / 1.02; d[i] = v * 3.5; }
  return b;
})();
const noise = (buf = NOISE) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); return s; };
const gainAt = (v, to = dry) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
const filter = (type, f, q = 1, to = dry) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; };
const panTo = to => { const n = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); n.connect(to); return n; };
const lfo = (hz, depth, param, type = 'sine') => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; };
const smooth = (param, v, k = 0.08) => { if (Number.isFinite(v)) param.setTargetAtTime(v, ctx.currentTime, k); }; // a value that is not a number would silence everything downstream of it
const rnd = (a, b) => a + Math.random() * (b - a);

// ----- Buses -----
// dry: the short sounds (shots, doors, steps), which also feed the reverb. world: everything out of doors, shut
// behind a low-pass when the listener is in a room. rooms: what a room sounds like from inside.
const dry = ctx.createGain(); dry.connect(master);
const ambient = ctx.createGain(); ambient.connect(master); // the setting for how much of the world to hear
const worldLP = ctx.createBiquadFilter(); worldLP.type = 'lowpass'; worldLP.frequency.value = 20000; worldLP.Q.value = 0.3; worldLP.connect(ambient);
const world = ctx.createGain(); world.connect(worldLP);
const rooms = ctx.createGain(); rooms.gain.value = 0; rooms.connect(ambient);
const verb = ctx.createConvolver();
verb.buffer = (() => { // a room's worth of echo: noise that dies away
  const len = ctx.sampleRate * 2.4, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  return b;
})();
const wet = ctx.createGain(); wet.gain.value = 0.04; verb.connect(wet); wet.connect(master);
dry.connect(verb); rooms.connect(verb);

const env = (param, t0, peak, attack, decay, floor = 0.0001) => {
  param.cancelScheduledValues(t0); param.setValueAtTime(floor, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  param.exponentialRampToValueAtTime(floor, t0 + attack + decay);
};
// A short tone with its own envelope.
function tone(type, freq, t0, peak, attack, decay, { to = dry, slide, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + attack + decay);
  env(g.gain, t0, peak, attack, decay);
  o.connect(g); g.connect(to);
  o.start(t0); o.stop(t0 + attack + decay + 0.05);
  return o;
}
// A burst of filtered noise.
function burst(f, q, t0, peak, attack, decay, type = 'bandpass', to = dry) {
  const s = noise(), fl = filter(type, f, q, to), g = gainAt(0, fl);
  env(g.gain, t0, peak, attack, decay);
  s.connect(g); s.start(t0); s.stop(t0 + attack + decay + 0.05);
}
// Somewhere to put a one-off sound in the world: at a level, to one side.
const spotAt = (level, pan = 0, to = world) => { const p = panTo(to), g = ctx.createGain(); if (p.pan) p.pan.value = pan; g.gain.value = level; g.connect(p); return g; };

// ----- The player's car -----

// The engine. Two saws and a square an octave down make the firing; a soft clipper gives it grit; and two
// resonances, like an exhaust and an intake, put most of it between 300 and 1500 Hz, where a laptop's speakers can
// actually reproduce it. (The first version lived below 200 Hz and could not be heard on anything small.)
const engine = (() => {
  const out = gainAt(0, master), body = filter('lowpass', 1500, 0.5, out);
  const f1 = filter('bandpass', 340, 0.9, gainAt(1.1, body)), f2 = filter('bandpass', 820, 1.1, gainAt(0.28, body)), low = filter('lowpass', 240, 0.7, gainAt(0.9, body));
  const shape = ctx.createWaveShaper(), curve = new Float32Array(1024);
  for (let k = 0; k < 1024; k++) curve[k] = Math.tanh((k / 512 - 1) * 1.3); // only a little grit: any more and it rasps
  shape.curve = curve; shape.connect(f1); shape.connect(f2); shape.connect(low);
  const pre = ctx.createGain(); pre.gain.value = 0.7; pre.connect(shape);
  const a = ctx.createOscillator(), b = ctx.createOscillator(), c = ctx.createOscillator();
  a.type = 'sawtooth'; b.type = 'triangle'; c.type = 'triangle';
  a.connect(gainAt(0.5, pre)); b.connect(gainAt(0.35, pre)); c.connect(gainAt(0.5, pre));
  const rasp = gainAt(0, body), rb = filter('bandpass', 700, 0.6, rasp), rn = noise(BROWN); rn.connect(rb);
  a.start(); b.start(); c.start(); rn.start();
  return { out, a, b, c, f1, f2, rasp };
})();
// A box of five gears: where in which gear a speed (m/s) falls, 0..1. The note climbs through each and drops at the change.
const GEARS = [0, 8, 16, 25, 35, 60];
const revs = v => { const k = Math.max(0, GEARS.findIndex(g => v < g) - 1), lo = GEARS[k], hi = GEARS[k + 1] ?? 80; return { gear: k, frac: Math.min(1, (v - lo) / (hi - lo)) }; };
// The road under the tyres, and the air over the roof: both grow with speed.
const road = (() => { const out = gainAt(0, master), bp = filter('lowpass', 420, 0.6, out), s = noise(BROWN); s.connect(bp); s.start(); return { out, bp }; })();
const rush = (() => { const out = gainAt(0, master), hp = filter('bandpass', 1100, 0.4, out), s = noise(); s.connect(hp); s.start(); return { out }; })();
// Tyres: a squeal while sliding.
const skid = (() => {
  const out = gainAt(0, master), bp = filter('bandpass', 1800, 6, out), s = noise();
  s.connect(bp); s.start();
  return { out, bp };
})();

// ----- The outdoors -----

// The sea: a low swell that comes and goes, and the hiss of the foam a moment behind it. It lies to one side.
const sea = (() => {
  const pan = panTo(world), out = gainAt(0, pan);
  const lp = filter('lowpass', 420, 0.7, out), s = noise(BROWN), swell = gainAt(0.9, lp);
  s.connect(swell); s.start();
  lfo(0.11, 190, lp.frequency); lfo(0.11, 0.35, swell.gain);
  const foam = gainAt(0.05, out), bp = filter('bandpass', 2600, 0.5, foam), w = noise();
  w.connect(bp); w.start();
  lfo(0.085, 0.045, foam.gain); lfo(0.19, 700, bp.frequency);
  return { out, pan };
})();
// The city: the far hum of traffic and air conditioning.
const city = (() => {
  const out = gainAt(0, world), lp = filter('lowpass', 210, 0.6, out), s = noise(BROWN);
  s.connect(lp); s.start();
  const air = gainAt(0.05, out), bp = filter('bandpass', 950, 0.4, air), a = noise();
  a.connect(bp); a.start();
  lfo(0.05, 0.02, air.gain);
  return { out };
})();
// The wind: a band of noise that wanders, louder on the pier and the bridge.
const wind = (() => {
  const out = gainAt(0, world), bp = filter('bandpass', 480, 0.9, out), s = noise();
  s.connect(bp); s.start();
  lfo(0.07, 240, bp.frequency); lfo(0.23, 90, bp.frequency);
  return { out };
})();
// Crickets, after dark where there is grass: two of them, a little apart in pitch and to either side.
const crickets = (() => {
  const out = gainAt(0, world);
  for (const [f, side, rate] of [[4300, -0.6, 0.62], [4720, 0.55, 0.47], [3980, 0.1, 0.83]]) {
    const p = panTo(out), gate = ctx.createGain(), chirp = ctx.createGain(), o = ctx.createOscillator();
    if (p.pan) p.pan.value = side;
    o.type = 'sine'; o.frequency.value = f;
    chirp.gain.value = 0.5; gate.gain.value = 0.5;
    lfo(31 + side * 4, 0.5, chirp.gain, 'square'); lfo(rate, 0.5, gate.gain, 'square');
    o.connect(chirp); chirp.connect(gate); gate.connect(p); o.start();
  }
  return { out };
})();
// Sirens: a two-tone wail that comes and goes with the police.
const siren = (() => {
  const out = gainAt(0, world), o = ctx.createOscillator();
  o.type = 'triangle'; o.frequency.value = 720;
  lfo(0.8, 180, o.frequency);
  o.connect(out); o.start();
  return { out };
})();
// Other people's cars: the nearest four each get an engine of their own, to the left or the right of the listener.
const passers = [0, 1, 2, 3].map(() => {
  const pan = panTo(world), out = gainAt(0, pan), lp = filter('lowpass', 520, 1.2, out), o = ctx.createOscillator(), t = noise(BROWN), tg = gainAt(0.9, lp);
  o.type = 'sawtooth'; o.frequency.value = 70;
  const og = gainAt(0.35, lp);
  o.connect(og); t.connect(tg); o.start(); t.start();
  return { out, pan, lp, o };
});

// ----- Things in the world that make a noise of their own -----
// Each has a place and a reach; its level and its side are worked out from where the listener stands.
let emitters = [];
function emitter(e) {
  const pan = panTo(world), out = gainAt(0, pan), v = { ...e, out, pan, level: 0, in: out, next: 0 };
  if (e.kind === 'water') { // a fountain, a pond, a pool filter: a bright trickle that never repeats
    const bp = filter('bandpass', 1900, 1.4, out), s = noise(), g = gainAt(0.5, bp);
    s.connect(g); s.start();
    const wob = noise(BROWN), wl = ctx.createBiquadFilter(), wg = ctx.createGain();
    wl.type = 'lowpass'; wl.frequency.value = 9; wg.gain.value = 5200;
    wob.connect(wl); wl.connect(wg); wg.connect(bp.frequency); wob.start();
  } else if (e.kind === 'jets') { // the airport: a turbine's whine over a low roar
    const bp = filter('bandpass', 2900, 9, out), s = noise(), g = gainAt(0.5, bp);
    s.connect(g); s.start();
    const lp = filter('lowpass', 160, 0.7, out), r = noise(BROWN), rg = gainAt(1.4, lp);
    r.connect(rg); r.start();
    lfo(0.06, 500, bp.frequency);
  } else if (e.kind === 'freeway') { // eight lanes overhead: a steady wash
    const lp = filter('lowpass', 340, 0.5, out), s = noise(BROWN), g = gainAt(1.6, lp);
    s.connect(g); s.start();
    const hi = filter('bandpass', 1300, 0.5, out), h = noise(), hg = gainAt(0.07, hi);
    h.connect(hg); h.start(); lfo(0.3, 0.04, hg.gain);
  } else if (e.kind === 'film') { // the drive-in: a picture's soundtrack out of two hundred tin speakers
    const bp = filter('bandpass', 1500, 2.5, out), s = noise(), g = gainAt(0.25, bp);
    s.connect(g); s.start(); lfo(0.9, 0.2, g.gain); lfo(0.13, 600, bp.frequency);
  } else if (e.kind === 'club') { // music through a wall: only the bottom of it gets out
    v.in = filter('lowpass', 150, 1.5, out);
  }
  return v;
}

// ----- Rooms -----
// A murmur of people, a refrigerator's hum, a church's held breath, a grill; each room asks for some of each.
const walla = (() => {
  const out = gainAt(0, rooms), bp = filter('bandpass', 520, 0.9, out), s = noise(), g = gainAt(0.6, bp);
  s.connect(g); s.start();
  const hi = filter('bandpass', 1500, 1.2, out), h = noise(), hg = gainAt(0.2, hi);
  h.connect(hg); h.start();
  for (const [node, depth] of [[g, 0.5], [hg, 0.18]]) { const m = noise(BROWN), ml = ctx.createBiquadFilter(), mg = ctx.createGain(); ml.type = 'lowpass'; ml.frequency.value = 3; mg.gain.value = depth * 6; m.connect(ml); ml.connect(mg); mg.connect(node.gain); m.start(); }
  return { out };
})();
const hum = (() => {
  const out = gainAt(0, rooms);
  for (const [f, v] of [[60, 0.6], [120, 0.3], [180, 0.08]]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(gainAt(v, out)); o.start(); }
  const lp = filter('lowpass', 300, 0.5, out), s = noise(BROWN), g = gainAt(0.5, lp); s.connect(g); s.start();
  return { out };
})();
const drone = (() => { // a big stone room: two low notes, barely there
  const out = gainAt(0, rooms);
  for (const f of [110, 164.8, 220.6]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = gainAt(0.3, out); o.connect(g); lfo(rnd(0.05, 0.11), 0.15, g.gain); o.start(); }
  return { out };
})();
const sizzle = (() => { const out = gainAt(0, rooms), hp = filter('highpass', 5200, 0.5, out), s = noise(), g = gainAt(0.6, hp); s.connect(g); s.start(); lfo(7, 0.25, g.gain); lfo(0.4, 0.2, g.gain); return { out }; })();
const music = (() => { const out = gainAt(0, rooms), lp = filter('lowpass', 6500, 0.6, out); return { out, in: lp }; })();
// What each kind of room is made of. verb: how much it rings.
const ROOMS = {
  bar: { walla: 0.2, music: 0.5, clink: 3, verb: 0.1 },
  diner: { walla: 0.19, sizzle: 0.03, clink: 2.4, verb: 0.09 },
  hall: { walla: 0.1, clink: 5, verb: 0.24 },
  store: { hum: 0.018, verb: 0.07, chime: true },
  guns: { hum: 0.03, range: 3, verb: 0.2 },
  church: { drone: 0.02, verb: 0.4 },
  garage: { hum: 0.04, clank: 3.5, verb: 0.3 },
  house: { hum: 0.01, tick: true, verb: 0.07 },
  office: { tick: true, verb: 0.05 },
  ward: { hum: 0.02, beep: true, verb: 0.1 },
  plain: { hum: 0.01, verb: 0.1 },
};

// ----- Things that happen in time: a beat, a waltz, a clock -----
// Notes are scheduled a quarter of a second ahead of the audio clock, from the game's frames.
const seqs = [];
const every = (step, play) => { const q = { step, play, next: 0, n: 0 }; seqs.push(q); return q; };
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// The club: a kick on the beat, a hat off it, a bass that walks three notes. Heard whole in a bar, as a thump outside one.
let clubTargets = [];
every(0.25, (t, n) => {
  for (const to of clubTargets) {
    if (n % 2 === 0) tone('sine', 68, t, 0.9, 0.004, 0.2, { to, slide: 38 });
    else burst(7200, 0.8, t, 0.1, 0.002, 0.04, 'highpass', to);
    if (n % 8 === 4) burst(1800, 0.9, t, 0.22, 0.002, 0.11, 'bandpass', to);
    const bass = [33, 0, 0, 33, 0, 36, 0, 31][n % 8];
    if (bass) { const lp = filter('lowpass', 420, 2, to); tone('sawtooth', midi(bass), t, 0.32, 0.01, 0.2, { to: lp }); }
    if (n % 16 === 0 || n % 16 === 6 || n % 16 === 11) for (const k of [57, 60, 64]) tone('triangle', midi(k + (Math.floor(n / 16) % 2 ? 2 : 0)), t, 0.045, 0.01, 0.3, { to });
  }
});
// The carousel: a waltz on a fairground organ. The tune is the game's own.
const WALTZ = [76, 79, 84, 79, 76, 79, 77, 81, 84, 81, 77, 81, 74, 79, 83, 79, 74, 79, 76, 79, 84, 88, 84, 79], ROOTS = [48, 53, 55, 48];
let waltzTargets = [];
every(0.3, (t, n) => {
  for (const to of waltzTargets) {
    const bar = Math.floor(n / 6) % 4, beat = n % 3, pipe = filter('lowpass', 1500, 0.7, to);
    // (The owner heard this as a slot machine: it was square waves, high and loud, all along the beach. It is a
    // music box now: sine and triangle, an octave down, quiet, and only near the ride.)
    tone('sine', midi(WALTZ[n % 24] - 12), t, 0.05, 0.02, 0.3, { to: pipe }); tone('triangle', midi(WALTZ[n % 24] - 12), t, 0.02, 0.02, 0.26, { to: pipe, detune: 5 });
    if (beat === 0) tone('sine', midi(ROOTS[bar]), t, 0.1, 0.02, 0.36, { to });
    else for (const k of [0, 7]) tone('sine', midi(ROOTS[bar] + 12 + k), t, 0.02, 0.02, 0.18, { to });
  }
});

// ----- Recordings -----
// Files in the sounds/ folder, by name (see sounds/README.md). Where one exists it is used in place of the synthesised
// layer it stands for; where none does, the synthesiser carries on.
const beds = {};
async function loadBeds() {
  let names = [];
  try { names = await (await fetch('sounds/list.json')).json(); } catch { return []; }
  await Promise.all(names.map(async name => {
    try { beds[name.replace(/\.[^.]+$/, '').toLowerCase()] = { buffer: await ctx.decodeAudioData(await (await fetch('sounds/' + encodeURIComponent(name))).arrayBuffer()) }; } catch { /* not a file the browser can read: the synthesiser covers for it */ }
  }));
  return Object.keys(beds);
}
// Set a recording's level (starting it, somewhere in its middle, the first time it is wanted). False if there is no such file.
function bed(key, to, level, k = 0.5, rate) {
  const b = beds[key];
  if (!b) return false;
  if (!b.src) {
    if (level < 0.002) return true;
    b.src = ctx.createBufferSource(); b.src.buffer = b.buffer; b.src.loop = true;
    b.gain = gainAt(0, to); b.src.connect(b.gain); b.src.start(0, Math.random() * b.buffer.duration);
  }
  smooth(b.gain.gain, level, k);
  if (rate) smooth(b.src.playbackRate, rate, 0.12);
  return true;
}

// ----- The radio -----
// The player's own songs, from the music/ folder: in the car, and in the bars. One song after another; it stops when
// he gets out and carries on from the same bar of the same song when he gets back in.
const radio = (() => {
  const el = new Audio(), out = gainAt(0, master), tone0 = filter('lowpass', 18000, 0.5, out);
  el.preload = 'auto';
  const r = { tracks: [], i: 0, on: true, vol: 0.7, title: '', playing: false, wired: false, idle: 0, onChange: null };
  const pretty = name => name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d+\s*[-._)]*\s*/, '').trim();
  r.cue = (d = 0) => {
    if (!r.tracks.length) return;
    r.i = (r.i + d + r.tracks.length) % r.tracks.length;
    el.src = 'music/' + encodeURIComponent(r.tracks[r.i]);
    r.title = pretty(r.tracks[r.i]);
    if (r.playing) { el.play().catch(() => {}); r.onChange?.(r.title); }
  };
  el.addEventListener('ended', () => r.cue(1));
  el.addEventListener('error', () => { if (r.tracks.length > 1 && r.playing) r.cue(1); }); // a file the browser cannot play: the next one
  r.load = async () => {
    try { r.tracks = await (await fetch('music/list.json')).json(); } catch { r.tracks = []; }
    if (r.tracks.length) { r.i = Math.floor(Math.random() * r.tracks.length); r.cue(0); }
    return r.tracks.length;
  };
  // Called each frame: should it be heard, and how (through a bar's speakers it has less top).
  r.heard = (want, room) => {
    const listen = want && r.on && r.tracks.length > 0 && r.vol > 0;
    if (listen && !r.playing) {
      if (!r.wired) { ctx.createMediaElementSource(el).connect(tone0); r.wired = true; }
      r.playing = true; el.play().catch(() => { r.playing = false; });
      r.onChange?.(r.title);
    }
    if (!listen && r.playing) { r.playing = false; r.idle = ctx.currentTime + 0.7; }
    if (!r.playing && r.idle && ctx.currentTime > r.idle) { el.pause(); r.idle = 0; }
    smooth(out.gain, listen ? r.vol * (room ? 0.55 : 0.9) : 0, 0.18);
    smooth(tone0.frequency, room ? 5200 : 18000, 0.2);
  };
  return r;
})();

let unlocked = false;
// Browsers keep a page silent until it is clicked or a key is pressed, and a game that starts itself (a mission picked
// from the menu reloads straight into play) has had neither. So every click and every key tries again, for as long as
// it takes; and nothing is scheduled while the clock is stopped, or it would all sound at once when it starts.
const wake = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) addEventListener(ev, wake, true);
const live = () => unlocked && ctx.state === 'running';
// What the world is doing, as of the last frame.
const st = { room: null, last: 0, stride: 0, bird: 0, gull: 0, event: 0, clink: 0, clank: 0, range: 0, tick: 0, beep: 0, hour: -1, harbour: 0, ship: 0 };
// One footfall, by what is underfoot.
function step(surface, run) {
  const t = ctx.currentTime, v = run ? 1.25 : 1;
  st.steps = (st.steps || 0) + 1; st.under = surface;
  if (surface === 'sand') burst(500, 0.6, t, 0.1 * v, 0.012, 0.11, 'lowpass');
  else if (surface === 'grass') { burst(1300, 0.7, t, 0.045 * v, 0.008, 0.08); burst(300, 0.8, t, 0.05 * v, 0.006, 0.06, 'lowpass'); }
  else if (surface === 'wood') { tone('sine', 150, t, 0.16 * v, 0.004, 0.09, { slide: 85 }); burst(600, 1.5, t, 0.07 * v, 0.003, 0.05); }
  else if (surface === 'tile') { burst(2100, 2, t, 0.06 * v, 0.002, 0.03); burst(380, 1, t, 0.09 * v, 0.003, 0.06, 'lowpass'); }
  else if (surface === 'carpet') burst(320, 0.8, t, 0.05 * v, 0.006, 0.07, 'lowpass');
  else { burst(850, 1.1, t, 0.085 * v, 0.003, 0.05, 'lowpass'); burst(2600, 1.5, t, 0.03 * v, 0.002, 0.02); } // pavement, tarmac
}
// A bird: a few quick notes that slide. A gull: a cry that falls, twice or three times.
function bird(pan) {
  const t = ctx.currentTime, to = spotAt(rnd(0.3, 0.6), pan), base = rnd(2600, 3800), n = 2 + Math.floor(Math.random() * 2), gap = rnd(0.09, 0.14);
  for (let k = 0; k < n; k++) tone('sine', base * rnd(0.95, 1.08), t + k * gap, 0.018, 0.008, rnd(0.04, 0.09), { to, slide: base * rnd(0.75, 1.4) });
}
function gull(pan) {
  const t = ctx.currentTime, to = filter('bandpass', 1900, 2.2, spotAt(rnd(0.5, 1), pan)), n = 2 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) tone('sawtooth', rnd(1250, 1500), t + k * rnd(0.26, 0.34), 0.035, 0.03, rnd(0.16, 0.26), { to, slide: rnd(820, 980) });
}
// Something a long way off: a dog, a horn, a siren that is somebody else's trouble, a plane.
function faraway(kind, pan) {
  const t = ctx.currentTime, to = filter('lowpass', 1500, 0.5, spotAt(1, pan));
  if (kind === 'dog') for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) { const at = t + k * rnd(0.22, 0.34); tone('sawtooth', rnd(380, 520), at, 0.05, 0.01, 0.09, { to, slide: 260 }); burst(900, 2, at, 0.04, 0.005, 0.08, 'bandpass', to); }
  else if (kind === 'horn') for (const f of [350, 440]) tone('sawtooth', f * rnd(0.85, 1.1), t, 0.02, 0.03, rnd(0.3, 0.9), { to: filter('lowpass', 900, 1, to) });
  else if (kind === 'siren') { const o = tone('triangle', 640, t, 0.018, 0.8, 4.5, { to }); for (let k = 1; k <= 6; k++) o.frequency.linearRampToValueAtTime(k % 2 ? 900 : 640, t + k * 0.85); }
  else if (kind === 'plane') { const s = noise(BROWN), lp = filter('lowpass', 260, 0.6, to), g = gainAt(0, lp); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 4); g.gain.linearRampToValueAtTime(0.0001, t + 11); lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(140, t + 11); s.connect(g); s.start(t); s.stop(t + 11.2); }
  else if (kind === 'ship') tone('sawtooth', 98, t, 0.1, 0.25, 2.2, { to: filter('lowpass', 320, 1, to) });
}
const strike = (to, t) => { for (const [m, v, d] of [[1, 0.22, 2.8], [2.76, 0.09, 1.6], [5.4, 0.04, 0.9], [0.5, 0.1, 3.2]]) tone('sine', 392 * m, t, v, 0.005, d, { to }); };

export const sfx = {
  // Browsers keep audio silent until the page is clicked; call this from the Start button.
  unlock() { unlocked = true; wake(); },
  get ready() { return live(); },
  get state() { return ctx.state; }, // 'running', or 'suspended' while the browser is still holding it back
  setVolume(v) { master.gain.value = v; },
  setAmbience(v) { ambient.gain.value = v; },
  // The radio: `radio.load()` reads the music folder; next(±1), toggle(), volume(v); `onChange` is told each new title.
  radio: {
    load: () => radio.load(), next: d => { if (radio.tracks.length) { radio.cue(d); if (!radio.playing) radio.onChange?.(radio.title); } }, toggle: () => { radio.on = !radio.on; return radio.on; },
    volume: v => { radio.vol = v; }, set onChange(fn) { radio.onChange = fn; }, get count() { return radio.tracks.length; }, get title() { return radio.title; }, get on() { return radio.on; }, get playing() { return radio.playing; },
  },
  // Recordings of real places, from the sounds/ folder. Resolves to the names found.
  loadRecordings: () => loadBeds(),
  get recordings() { return Object.keys(beds); },
  // Tell the audio where the world's own noises are: [{ kind, x, z, r }].
  place(list) { for (const e of emitters) e.out.disconnect(); emitters = list.map(emitter); },
  // How much of the mix lies in a band of frequencies (Hz), 0..1 of full scale: to check that something can be heard on small speakers.
  band(lo, hi) {
    const d = new Uint8Array(probe.frequencyBinCount); probe.getByteFrequencyData(d);
    const hz = ctx.sampleRate / probe.fftSize; let sum = 0, n = 0;
    for (let k = Math.floor(lo / hz); k <= Math.min(d.length - 1, Math.ceil(hi / hz)); k++) { sum += d[k]; n++; }
    return +(sum / n / 255).toFixed(3);
  },
  // How loud the mix is right now, after the limiter: for whoever is checking it.
  meter() {
    const d = new Float32Array(probe.fftSize); probe.getFloatTimeDomainData(d);
    let peak = 0, sum = 0; for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), state: ctx.state, room: st.room, steps: st.steps || 0, under: st.under, world: +world.gain.value.toFixed(2), sea: +sea.out.gain.value.toFixed(3), city: +city.out.gain.value.toFixed(3), wind: +wind.out.gain.value.toFixed(3), crickets: +crickets.out.gain.value.toFixed(3), engine: +engine.out.gain.value.toFixed(3), radio: radio.playing ? radio.title : '', emitters: emitters.filter(e => e.level > 0.005).map(e => e.kind + ':' + e.level.toFixed(2)), passers: passers.map(v => +v.out.gain.value.toFixed(3)) };
  },

  // Per-frame levels. The car: speed in m/s, throttle 0..1, sliding 0..1. The listener: `ear` {x, z}, `right` the unit
  // vector to his right, `room` the kind of room he is in (or null), `surface` and `foot` (m/s) for his steps.
  // The place: `shore` 0..1 and `seaward` {x, z} toward the nearest water, `green` and `dense` 0..1 for trees and
  // towers, `exposed` 0..1 for open decks, `night` 0..1, `hour` of the clock, `cars` [{ dx, dz, speed, heavy }] nearby.
  ambience({ speed = 0, throttle = 0, inCar = false, shore = 0, police = 0, sliding = 0, night = 0, ear = { x: 0, z: 0 }, right = { x: 1, z: 0 }, room = null,
    surface = 'pave', foot = 0, seaward = { x: 1, z: 0 }, green = 0.2, dense = 0.5, exposed = 0, hour = -1, cars = [], la = false }) {
    if (!live()) return;
    const now = ctx.currentTime, dt = Math.min(0.1, Math.max(0, now - st.last)), inside = !!room, out = inside ? 0 : 1, day = 1 - night;
    st.last = now;
    const side = (dx, dz) => { const d = Math.hypot(dx, dz) || 1; return Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / d)); };

    // The car he is driving.
    const v = Math.abs(speed), { gear, frac } = revs(v), fire = v < 0.6 ? 27 + throttle * 26 : 34 + gear * 3 + frac * 72 + throttle * 7;
    const quiet = radio.playing ? 0.6 : 1, car = bed('car', master, inCar ? (0.3 + throttle * 0.14) * quiet : 0, 0.15, 0.6 + (v < 0.6 ? throttle * 0.35 : 0.12 + frac * 0.85));
    smooth(engine.a.frequency, fire, 0.07); smooth(engine.b.frequency, fire * 2.01, 0.07); smooth(engine.c.frequency, fire / 2, 0.07);
    smooth(engine.f1.frequency, 300 + fire * 2.2, 0.1); smooth(engine.f2.frequency, 720 + fire * 5, 0.1);
    smooth(engine.rasp.gain, inCar ? throttle * 0.03 + frac * 0.012 : 0, 0.1);
    smooth(engine.out.gain, inCar && !car ? (0.07 + throttle * 0.05 + frac * 0.025) * quiet : 0, 0.35); // it comes up over a second, so getting in is not a jolt
    smooth(road.out.gain, inCar ? Math.min(0.16, v / 40 * 0.16) * (surface === 'sand' || surface === 'grass' ? 1.5 : 1) : 0, 0.3);
    smooth(road.bp.frequency, surface === 'wood' ? 260 : 300 + v * 8, 0.3);
    smooth(rush.out.gain, inCar ? Math.min(0.012, (v / 38) ** 2 * 0.012) : 0, 0.4);
    smooth(skid.out.gain, inCar ? sliding * 0.2 : 0, 0.04);

    // Indoors the street is behind a wall.
    smooth(worldLP.frequency, inside ? 480 : 20000, 0.12); smooth(world.gain, inside ? 0.22 : 1, 0.12);
    smooth(rooms.gain, inside ? 1 : 0, 0.15);

    // The outdoors.
    // Recordings first: a real street for the hour and the district, a real beach. What they cover, the synthesiser leaves alone.
    const town = la ? 'la' : 'vice', leafy = green > 0.6, dayKey = leafy && beds['suburb-day'] ? 'suburb-day' : town + '-day', nightKey = leafy && beds['suburb-night'] ? 'suburb-night' : town + '-night';
    let covered = 0;
    for (const key of [town + '-day', town + '-night', 'suburb-day', 'suburb-night']) {
      const level = key === dayKey ? day : key === nightKey ? night : 0;
      if (bed(key, world, level * 0.55 * (1 - shore * 0.45), 0.9)) covered += level;
    }
    covered = Math.min(1, covered);
    const surf = bed('beach', world, shore * 0.6 + exposed * 0.2, 0.6) ? 0 : 1, synth = 1 - covered;
    smooth(sea.out.gain, (0.02 + shore * 0.27 + exposed * 0.1) * surf, 0.4);
    if (sea.pan.pan) smooth(sea.pan.pan, exposed > 0.5 ? 0 : side(seaward.x, seaward.z) * (0.25 + shore * 0.6), 0.3);
    smooth(city.out.gain, (0.04 + dense * 0.09) * (1 - night * 0.45) * (1 - exposed * 0.6) * synth, 0.5);
    smooth(wind.out.gain, 0.012 + shore * 0.02 + exposed * 0.06 + (1 - dense) * 0.01, 0.5);
    smooth(crickets.out.gain, night * green * 0.05 * (1 - shore * 0.5) * synth, 0.8);
    smooth(siren.out.gain, police * 0.12, 0.2);
    for (const [k, voice] of passers.entries()) {
      const c = cars[k];
      if (!c) { smooth(voice.out.gain, 0, 0.12); continue; }
      const d = Math.hypot(c.dx, c.dz), sp = Math.abs(c.speed);
      smooth(voice.o.frequency, (c.heavy ? 34 : 50) + sp * (c.heavy ? 3 : 4.6), 0.1);
      smooth(voice.lp.frequency, 320 + sp * 26, 0.1);
      smooth(voice.out.gain, Math.min(0.3, (0.25 + sp / 18) * (c.heavy ? 1.2 : 0.85) / (1 + (d / 9) ** 2)), 0.09);
      if (voice.pan.pan) smooth(voice.pan.pan, side(c.dx, c.dz) * 0.9, 0.08);
    }
    for (const e of emitters) {
      const dx = e.x - ear.x, dz = e.z - ear.z, d = Math.hypot(dx, dz);
      e.level = d < e.r ? (1 - d / e.r) ** 2 * (e.vol ?? 1) : 0;
      smooth(e.out.gain, e.level * (e.kind === 'water' ? 0.16 : e.kind === 'jets' ? 0.12 : e.kind === 'freeway' ? 0.14 : e.kind === 'film' ? 0.1 : e.kind === 'carousel' ? 0.22 : e.kind === 'club' ? 0.38 : 0.5), 0.15);
      if (e.pan.pan) smooth(e.pan.pan, d < 4 ? 0 : side(dx, dz) * Math.min(1, d / 14), 0.12);
    }

    // The room, if he is in one.
    let R = ROOMS[room] || (inside ? ROOMS.plain : {});
    const roomKey = room ? 'room-' + (room === 'office' ? 'house' : room) : null;
    for (const key in beds) if (key.startsWith('room-')) bed(key, rooms, key === roomKey ? 0.6 : 0, 0.3);
    if (roomKey && beds[roomKey]) R = { verb: R.verb, music: R.music, chime: R.chime }; // the recording is the room; only its music and its echo are ours
    radio.heard(inCar || room === 'bar', room === 'bar');
    const ownMusic = radio.playing ? 0 : R.music || 0;
    smooth(walla.out.gain, R.walla || 0, 0.3); smooth(hum.out.gain, R.hum || 0, 0.3); smooth(drone.out.gain, R.drone || 0, 0.6);
    smooth(sizzle.out.gain, R.sizzle || 0, 0.3); smooth(music.out.gain, ownMusic, 0.25);
    smooth(wet.gain, inside ? R.verb ?? 0.1 : 0.035, 0.2);
    if (room !== st.room) {
      if (R.chime) { tone('sine', 1318, now + 0.25, 0.09, 0.005, 0.5); tone('sine', 1046, now + 0.6, 0.09, 0.005, 0.8); } // the bell over a shop door
      st.room = room;
    }
    if (R.clink && now > st.clink) { st.clink = now + rnd(2.5, 7) * R.clink; const f = rnd(2300, 3600), to = spotAt(1, rnd(-0.8, 0.8), rooms); tone('sine', f, now, 0.035, 0.002, 0.12, { to }); if (Math.random() < 0.5) tone('sine', f * 1.19, now + 0.07, 0.03, 0.002, 0.1, { to }); }
    if (R.clank && now > st.clank) { st.clank = now + rnd(4, 10) * R.clank; const to = spotAt(1, rnd(-0.7, 0.7), rooms); if (Math.random() < 0.5) { burst(1100, 5, now, 0.2, 0.002, 0.2, 'bandpass', to); tone('triangle', rnd(320, 520), now, 0.08, 0.002, 0.3, { to }); } else for (let k = 0; k < 9; k++) burst(2400, 3, now + k * 0.045, 0.1, 0.002, 0.025, 'bandpass', to); }
    if (R.range && now > st.range) { st.range = now + rnd(2.5, 7) * R.range; const to = filter('lowpass', 500, 0.7, spotAt(1, rnd(-0.3, 0.3), rooms)); burst(260, 1.1, now, 0.5, 0.004, 0.2, 'lowpass', to); }
    if (R.tick && now > st.tick) { st.tick = now + 1; burst(st.n ? 3300 : 2700, 6, now, 0.03, 0.001, 0.02, 'bandpass', rooms); st.n = !st.n; }
    if (R.beep && now > st.beep) { st.beep = now + 1.6; tone('sine', 880, now, 0.012, 0.005, 0.07, { to: rooms }); }

    // Feet. His walk is a brisk one: three steps a second, four at a run.
    if (!inCar && foot > 0.6) {
      st.stride += foot * dt;
      const run = foot > 5.2;
      if (st.stride > (run ? 2.1 : 1.3)) { st.stride = 0; step(inside ? (room === 'house' || room === 'office' || room === 'hall' ? 'carpet' : 'tile') : surface, run); }
    } else st.stride = 0.5;

    // Life: birds by day where there are trees, gulls by the water, and now and then something a long way off.
    if (out) {
      if (now > st.bird) { st.bird = now + rnd(6, 16) / (0.4 + green * 0.6); if (day > 0.5 && synth > 0.5 && Math.random() < 0.25 + green * 0.4) bird(rnd(-1, 1)); } // (owner: the one-shots were jumping out; they are rarer and quieter now)
      if (now > st.gull) { st.gull = now + rnd(12, 30); if (day > 0.4 && shore > 0.35 && surf) gull(side(seaward.x, seaward.z) * rnd(0.2, 1)); }
      if (now > st.event && synth > 0.5) {
        st.event = now + rnd(35, 80);
        const r = Math.random(), pan = rnd(-0.9, 0.9);
        if (la && r < 0.22) faraway('plane', pan);
        else if (green > 0.6 && r < 0.6) faraway('dog', pan);
        else if (shore > 0.5 && r < 0.3) faraway('ship', side(seaward.x, seaward.z));
        else if (dense > 0.6 && r < 0.75) faraway(r < 0.2 ? 'siren' : 'horn', pan);
        else if (r < 0.25) faraway('horn', pan);
      }
    }
    // Bells on the hour, from any church near enough to hear; the harbour's cranes and its ships.
    if (hour !== st.hour) {
      if (st.hour >= 0) for (const e of emitters) if (e.kind === 'bell' && e.level > 0.002) { const to = spotAt(e.level * 0.9, e.pan.pan ? e.pan.pan.value : 0); for (let k = 0; k < 3; k++) strike(to, now + 0.2 + k * 1.5); }
      st.hour = hour;
    }
    for (const e of emitters) if (e.kind === 'harbour' && e.level > 0.01 && now > e.next) { e.next = now + rnd(2.5, 7); burst(rnd(700, 1400), 5, now, 0.5, 0.003, 0.3, 'bandpass', e.out); tone('triangle', rnd(180, 300), now, 0.25, 0.003, 0.5, { to: e.out }); }

    // The sequencers: whoever can hear the beat or the waltz gets its notes.
    clubTargets = emitters.filter(e => e.kind === 'club' && e.level > 0.004).map(e => e.in);
    if (ownMusic) clubTargets.push(music.in);
    waltzTargets = emitters.filter(e => e.kind === 'carousel' && e.level > 0.004).map(e => e.out);
    for (const q of seqs) {
      if (q.next < now - 0.5) { q.next = now + 0.05; } // the page was asleep: start again from here
      while (q.next < now + 0.25) { q.play(q.next, q.n++); q.next += q.step; }
    }
  },

  shot() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(1800, 0.6, t, 0.9, 0.003, 0.09, 'highpass');
    burst(300, 1.2, t, 0.8, 0.004, 0.18, 'lowpass');
    tone('sine', 110, t, 0.5, 0.004, 0.12, { slide: 40 });
  },
  punch(hit = true) {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(hit ? 240 : 900, 1.5, t, hit ? 0.7 : 0.25, 0.004, hit ? 0.12 : 0.06, 'lowpass');
    if (hit) tone('sine', 90, t, 0.4, 0.004, 0.1, { slide: 45 });
  },
  hurt() { // the player takes a blow
    if (!live()) return;
    const t = ctx.currentTime;
    burst(180, 1.2, t, 0.6, 0.004, 0.14, 'lowpass'); tone('triangle', 160, t, 0.2, 0.01, 0.2, { slide: 70 });
  },
  cash() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone('square', 1320, t, 0.12, 0.004, 0.07); tone('square', 1760, t + 0.07, 0.12, 0.004, 0.14);
  },
  // A spray gun: a long hiss with a rasp in it. Also does for sausage on a grill, quieter.
  spray(v = 1) {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(5200, 0.6, t, 0.13 * v, 0.08, 0.95, 'highpass'); burst(2400, 1.2, t + 0.05, 0.07 * v, 0.1, 0.8);
  },
  // A shovel going into wet ground.
  dig() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(700, 0.8, t, 0.2, 0.01, 0.16, 'lowpass'); burst(2600, 1.4, t + 0.02, 0.07, 0.004, 0.09); tone('sine', 110, t, 0.14, 0.004, 0.12, { slide: 60 });
  },
  door() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(700, 2, t, 0.3, 0.003, 0.05); burst(180, 1, t + 0.06, 0.4, 0.004, 0.12, 'lowpass');
  },
  carDoor() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(260, 1.4, t, 0.5, 0.003, 0.08, 'lowpass'); burst(1400, 1, t + 0.01, 0.15, 0.002, 0.04);
  },
  horn(pitch = 1, loud = 0.1) {
    if (!live()) return;
    const t = ctx.currentTime;
    for (const f of [370, 466]) tone('sawtooth', f * pitch, t, loud, 0.02, 0.35, { to: filter('lowpass', 1400, 1) });
  },
  crash(strength = 1) { // a car hitting something
    if (!live()) return;
    const t = ctx.currentTime, s = Math.min(1, strength);
    burst(160, 0.8, t, 0.7 * s, 0.003, 0.25 + 0.2 * s, 'lowpass'); burst(2600, 1.4, t, 0.3 * s, 0.002, 0.08);
  },
  explosion() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(80, 0.7, t, 1.2, 0.01, 1.6, 'lowpass'); burst(900, 0.6, t, 0.6, 0.005, 0.5); tone('sine', 60, t, 0.9, 0.01, 1.2, { slide: 25 });
  },
  passed() { // the mission sting: a rising major arpeggio with a shimmer on top
    if (!live()) return;
    const t = ctx.currentTime;
    [261.6, 329.6, 392, 523.3].forEach((f, n) => { tone('triangle', f, t + n * 0.12, 0.18, 0.01, 0.9, { detune: 4 }); tone('sine', f * 2, t + n * 0.12, 0.06, 0.01, 0.6); });
    tone('sine', 1046.5, t + 0.5, 0.08, 0.02, 1.4);
  },
  failed() {
    if (!live()) return;
    const t = ctx.currentTime;
    [196, 185, 174.6].forEach((f, n) => tone('sawtooth', f, t + n * 0.35, 0.12, 0.02, 0.6, { to: filter('lowpass', 900, 1) }));
  },
  wasted() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone('sawtooth', 110, t, 0.2, 0.05, 2.2, { slide: 55, to: filter('lowpass', 600, 1) });
    burst(120, 1, t, 0.5, 0.01, 0.6, 'lowpass');
  },
  phone() { // a ring, twice
    if (!live()) return;
    const t = ctx.currentTime;
    for (const r of [0, 0.6]) for (let k = 0; k < 8; k++) tone('square', k % 2 ? 1180 : 1040, t + r + k * 0.05, 0.05, 0.005, 0.04);
  },
  click() {
    if (!live()) return;
    burst(2400, 3, ctx.currentTime, 0.12, 0.002, 0.03);
  },
  // The crowd: a scream when someone is shot at, a shout when someone is hit.
  scream() {
    if (!live()) return;
    const t = ctx.currentTime + Math.random() * 0.1, f = 700 + Math.random() * 400;
    tone('sawtooth', f, t, 0.07, 0.03, 0.4, { slide: f * 0.7, to: filter('bandpass', f, 2) });
  },
};
