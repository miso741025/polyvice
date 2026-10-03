import * as THREE from 'three';
import { near, clamp, bounds, SHORE, groundAt, pushOut, colliders } from './grid.js';
import { makeLook, makeHuman, randomPedLook, Car, roam } from './entities.js';

// The story is written as plain async functions: each `await` waits on the game loop
// (a line of dialogue, the player reaching a marker, a fade), so a mission reads top to bottom.
// The episodes follow the plots of the show's first two; every line of dialogue is written for the game.

const TONY = 'Tony', MELFI = 'Dr. Melfi', CHRIS = 'Christopher', DEBTOR = 'Mahaffey', CARMELA = 'Carmela', AJ = 'AJ';
const JUNIOR = 'Uncle Junior', LIVIA = 'Livia', ARTIE = 'Artie', SILVIO = 'Silvio', PUSSY = 'Big Pussy', HESH = 'Hesh', KOLAR = 'Emil Kolar';
const PAULIE = 'Paulie', BRENDAN = 'Brendan', JACKIE = 'Jackie Aprile', GEORGIE = 'Georgie', MILLER = 'Mr. Miller';
const ROSALIE = 'Rosalie', MEADOW = 'Meadow', HUNTER = 'Hunter', MIKEY = 'Mikey Palmice', SHLOMO = 'Shlomo', ARIEL = 'Ariel', PHIL = 'Father Phil', CHARMAINE = 'Charmaine';
const NORTH = Math.PI, SOUTH = 0, EAST = Math.PI / 2, WEST = -Math.PI / 2;

// ---------- Saving: the number of the next mission, and the money ----------

const SAVE = 'sopranos-vice.save';
const readSave = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
export const savedMission = () => readSave().mission || 0;
export function clearSave() { try { localStorage.removeItem(SAVE); } catch { /* storage unavailable: nothing to clear */ } }
function save(mission, cash) { try { localStorage.setItem(SAVE, JSON.stringify({ mission, cash })); } catch { /* play on without saving */ } }

// ---------- Building blocks for scenes ----------

async function say(g, who, text, dur = Math.max(2.4, text.length * 0.065)) {
  g.hud.subtitle(who, text);
  const t0 = g.time;
  await g.until(() => g.time - t0 >= dur || (g.time - t0 > 0.3 && g.consume('Enter')));
  g.hud.subtitle();
}

// A run of dialogue: [speaker, text, who gestures]. The third entry is an actor, or g.player for the player.
async function talk(g, lines) {
  for (const [who, text, a] of lines) {
    const p = g.player, was = a && a !== p ? a.state : null;
    if (a === p) p.pose = 'talk'; else if (was === 'idle') a.set('talk');
    await say(g, who, text);
    if (a === p) p.pose = null; else if (was === 'idle') a.set('idle');
  }
}
const phone = (g, who, text) => say(g, who + ' (phone)', text);

async function fade(g, to, seconds) {
  g.hud.fade(to, seconds);
  await g.wait(seconds + 0.05);
}

// Fade out, rearrange the world, fade back in.
async function cut(g, arrange, seconds = 0.8) {
  await fade(g, 1, seconds);
  await arrange();
  await fade(g, 0, seconds);
}

async function titleCard(g, title, sub) {
  g.hud.card(title, sub);
  await g.wait(3.2);
  g.hud.card();
}

async function passed(g, reward, money = 0) {
  g.hud.passed(reward);
  if (money) g.addMoney(money);
  await g.wait(4);
  g.hud.passed();
}

// Put a character in the world for the length of a scene.
function actor(g, look, at, heading = 0, state = 'idle') {
  const a = makeLook(look);
  a.group.position.set(at.x, at.y ?? groundAt(at.x, at.z), at.z); // interior sets give their own height
  a.group.rotation.y = heading;
  a.set(state);
  g.track(a.group);
  return a;
}
const dismiss = (g, ...actors) => { for (const a of actors) { g.untrack(a.group); g.removeNpc?.(a); } };
const spot = (at, dx = 0, dz = 0) => ({ x: at.x + dx, z: at.z + dz });
const toward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// Stand the player somewhere, out of any car. The car, if `park` is given, is left there.
function place(g, at, heading, park) {
  const p = g.player, car = p.car;
  if (car) {
    g.leaveCar(at);
    car.speed = 0;
    if (park) { car.pos.set(park.x, 0, park.z); car.heading = park.h ?? car.heading; }
  }
  p.pos.set(at.x, 0, at.z);
  p.heading = heading;
  g.cam.yaw = heading;
}

// Stand the player a couple of steps from someone, facing them, so a conversation can be framed.
function approach(g, who, gap = 1.7) {
  const p = g.player, a = who.group.position;
  let dx = p.pos.x - a.x, dz = p.pos.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) { dx = -1; dz = 0; } else { dx /= d; dz /= d; }
  p.pos.set(a.x + dx * gap, 0, a.z + dz * gap);
  p.heading = toward(p.pos, a);
  who.group.rotation.y = toward(a, p.pos);
}
// A fixed camera at `from`, looking at `to` (both { x, z }), at the given heights above the ground.
function shot(g, from, to, height = 1.7, lift = 1.3) {
  g.cam.fixed = { pos: new THREE.Vector3(from.x, groundAt(from.x, from.z) + height, from.z), look: new THREE.Vector3(to.x, groundAt(to.x, to.z) + lift, to.z) };
}

const blocked = (x, z) => colliders.some(c => !c.thin && x > c.minX - 0.6 && x < c.maxX + 0.6 && z > c.minZ - 0.6 && z < c.maxZ + 0.6);
// Hold the camera on two people (or points) from the side, on whichever side is clear of walls.
function frame(g, a, b, { dist = 4.8, height = 1.7, lift = 1.3, side = 1 } = {}) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  let px = mx - dz / l * dist * side, pz = mz + dx / l * dist * side;
  if (blocked(px, pz)) { px = mx + dz / l * dist * side; pz = mz - dx / l * dist * side; }
  const y = groundAt(mx, mz);
  g.cam.fixed = { pos: new THREE.Vector3(px, y + height, pz), look: new THREE.Vector3(mx, y + lift, mz) };
}

// Wait until the player reaches a spot. `how` may be 'car' (must drive there) or 'foot' (must walk).
async function reach(g, at, text, { r = 6, how } = {}) {
  g.hud.objective(text);
  const m = g.addMarker(at.x, at.z, r), p = g.player;
  await g.until(() => near(p.pos, m, r + 0.4) && (how === 'car' ? p.car && Math.abs(p.car.speed) < 6 : how === 'foot' ? !p.car : true));
  g.removeMarker(m);
  g.hud.objective();
}

// Someone who walks with the player (or behind `lead`, another follower) and rides along in the car.
function follower(g, human, { lead, gap = 1.6, pace = 3.6, runs = true } = {}) {
  const f = { human, pos: human.group.position.clone(), on: true, stay: false, car: null };
  g.updaters.push(dt => {
    if (!f.on) return false;
    const p = g.player, group = human.group;
    if (f.stay) return true;
    if (p.car) { f.car = p.car; group.visible = false; f.pos.copy(p.car.pos); return true; }
    if (f.car) { // step out on the passenger side, one behind the other
      const c = f.car, back = lead ? 1.4 : 0;
      f.pos.set(c.pos.x - Math.cos(c.heading) * 2.1 - Math.sin(c.heading) * back, 0, c.pos.z + Math.sin(c.heading) * 2.1 - Math.cos(c.heading) * back);
      f.car = null; group.visible = true;
    }
    const target = lead ? lead.pos : p.pos, dx = target.x - f.pos.x, dz = target.z - f.pos.z, d = Math.hypot(dx, dz);
    if (d > gap + 0.25) {
      const speed = runs && d > 6 ? 7.2 : pace, step = Math.min(speed * dt, d - gap);
      f.pos.x += dx / d * step; f.pos.z += dz / d * step;
      pushOut(f.pos, 0.4);
      human.set(speed > 5 ? 'run' : 'walk', speed > 5 ? 1 : speed / 1.5);
      group.rotation.y = Math.atan2(dx, dz);
    } else human.set('idle');
    group.position.set(f.pos.x, groundAt(f.pos.x, f.pos.z), f.pos.z);
    return true;
  });
  return f;
}

// One character hits another, for a scene: a swing, a flinch, and the wait for both to settle.
async function punch(g, from, to, down = false) {
  const swing = from === g.player ? from.human : from;
  swing.play(Math.random() < 0.5 ? 'cross' : 'jab', 'idle', 1.3);
  await g.wait(0.3);
  if (down) { to.after = null; to.set('down'); } else to.play('hitHead', 'idle');
  await g.wait(0.9);
}
// Only fists for a while: for beatings that must not end in a shooting.
function fistsOnly(g, on) {
  const p = g.player;
  if (on) { g.setWeapon('fist'); p.weapons.pistol = false; } else p.weapons.pistol = true;
}
// Wait until every one of these fighters is down.
const allDown = (g, npcs) => g.until(() => npcs.every(n => n.dead || n.human.state === 'down'));

// A session with Dr. Melfi in the interior set. Leaves the screen black; the caller sets up what follows.
async function therapy(g, lines) {
  const { office } = g.places, p = g.player, night = g.night;
  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) p.car.speed = 0;
  p.hidden = true;
  g.setNight(0);
  g.cam.fixed = { pos: office.cam, look: office.look };
  await fade(g, 0, 1);
  for (const [who, text] of lines) await say(g, who, text);
  await fade(g, 1, 1);
  g.cam.fixed = null;
  p.hidden = false;
  g.setNight(night);
}

// The blurred, swaying onset of a panic attack. Returns a function that ends it.
function panic(g) {
  const t0 = g.time;
  let on = true;
  g.updaters.push(() => {
    const t = g.time - t0;
    if (on) { g.hud.panic(Math.min(1, t / 3)); g.cam.sway = Math.min(1, t / 2); }
    return on;
  });
  return () => { on = false; g.hud.panic(0); g.cam.sway = 0; };
}

// A fireball, flying debris and a column of smoke, then a fire that burns until stop() is called.
function explode(g, at) {
  const group = new THREE.Group(), t0 = g.time, rnd = (a, b) => a + Math.random() * (b - a);
  group.position.set(at.x, groundAt(at.x, at.z), at.z);
  g.track(group);
  const ballGeo = new THREE.SphereGeometry(1, 10, 8), boxGeo = new THREE.BoxGeometry(1, 1, 1), parts = [];
  const add = (geo, mat, kind, life) => {
    const m = new THREE.Mesh(geo, mat);
    m.userData = { kind, life, born: 0, v: new THREE.Vector3() };
    group.add(m); parts.push(m);
    return m;
  };
  const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const m = add(ballGeo, glowMat(i % 3 ? 0xff8a30 : 0xffe08a), 'fire', rnd(1.1, 2));
    m.position.set(rnd(-6, 6), rnd(1, 4), rnd(-6, 6)); m.userData.v.set(rnd(-3, 3), rnd(5, 13), rnd(-3, 3));
  }
  for (let i = 0; i < 40; i++) {
    const m = add(boxGeo, new THREE.MeshLambertMaterial({ color: i % 2 ? 0x2a2422 : 0x6a3a22 }), 'debris', rnd(2, 3.5));
    m.scale.set(rnd(0.2, 0.9), rnd(0.2, 0.6), rnd(0.2, 0.9)); m.position.set(rnd(-5, 5), rnd(1, 4), rnd(-5, 5));
    m.userData.v.set(rnd(-16, 16), rnd(8, 24), rnd(-16, 16));
  }
  for (let i = 0; i < 12; i++) {
    const m = add(ballGeo, new THREE.MeshBasicMaterial({ color: 0x241f24, transparent: true, opacity: 0.55, depthWrite: false }), 'smoke', 1e9);
    m.position.set(rnd(-5, 5), rnd(2, 6), rnd(-5, 5)); m.userData.born = -i * 1.3; m.userData.v.set(rnd(-0.4, 0.4), rnd(2.2, 3.4), rnd(-0.4, 0.4));
  }
  for (let i = 0; i < 7; i++) { // the fire that stays
    const m = add(ballGeo, glowMat(i % 2 ? 0xff7a20 : 0xffc040, 0.75), 'flame', 1e9);
    m.position.set(rnd(-7, 7), 0.8, rnd(-6, 6)); m.userData.seed = rnd(0, 9);
  }
  const light = new THREE.PointLight(0xff8a30, 0, 140);
  light.position.set(0, 7, 0);
  group.add(light);
  g.hud.flash('#fff3d0', 0.9);
  let on = true;
  g.updaters.push(dt => {
    if (!on) return false;
    const t = g.time - t0;
    light.intensity = t < 0.4 ? 2500 : 420 + Math.sin(g.time * 17) * 110 + Math.sin(g.time * 7.3) * 80;
    g.cam.sway = Math.max(0, 1.6 - t * 1.4);
    for (const m of parts) {
      const u = m.userData, age = t - u.born;
      if (u.kind === 'fire') {
        m.visible = age < u.life;
        m.position.addScaledVector(u.v, dt); m.scale.setScalar(1.5 + age * 5); m.material.opacity = Math.max(0, 1 - age / u.life);
      } else if (u.kind === 'debris') {
        m.visible = age < u.life;
        u.v.y -= 26 * dt; m.position.addScaledVector(u.v, dt); m.rotation.x += dt * 6; m.rotation.z += dt * 4;
        if (m.position.y < 0.2) { m.position.y = 0.2; u.v.set(0, 0, 0); }
      } else if (u.kind === 'smoke') {
        const a = ((age % 16) + 16) % 16; // each puff rises, thins out and starts again
        m.visible = age > 0;
        m.position.y = 3 + a * u.v.y; m.position.x += u.v.x * dt; m.scale.setScalar(2.5 + a * 0.9); m.material.opacity = 0.55 * (1 - a / 16);
      } else m.scale.set(2.1, 3.4 + Math.sin(g.time * 9 + u.seed) * 1.1 + Math.sin(g.time * 23 + u.seed) * 0.5, 2.1);
    }
    return true;
  });
  return { stop() { on = false; g.cam.sway = 0; g.untrack(group); } };
}

// A column of smoke from a spot, until stop() is called.
function smoke(g, at, height = 4) {
  const group = new THREE.Group(), geo = new THREE.SphereGeometry(1, 8, 6), puffs = [];
  group.position.set(at.x, groundAt(at.x, at.z) + height, at.z);
  g.track(group);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a3438, transparent: true, opacity: 0.5, depthWrite: false }));
    m.userData = { phase: i * 1.1, drift: Math.random() - 0.5 };
    group.add(m); puffs.push(m);
  }
  let on = true;
  g.updaters.push(() => {
    if (!on) return false;
    for (const m of puffs) {
      const a = (g.time + m.userData.phase) % 10;
      m.position.set(m.userData.drift * a, a * 1.6, a * 0.3); m.scale.setScalar(0.7 + a * 0.45); m.material.opacity = 0.5 * (1 - a / 10);
    }
    return true;
  });
  return { stop() { on = false; g.untrack(group); } };
}

// Driving something that must arrive in one piece: three hard crashes and `reset` puts things back.
function careful(g, label, failText, reset) {
  const p = g.player;
  let hits = 0, last = 0, on = true;
  g.updaters.push(() => {
    if (!on) return false;
    const speed = p.car ? Math.abs(p.car.speed) : 0;
    if (last > 9 && speed < last * 0.5) { hits++; g.hud.flash('#ff3b4a', 0.3); }
    last = speed;
    return true;
  });
  const meter = () => ` &nbsp; ${label} <b>${'●'.repeat(3 - Math.min(3, hits))}${'○'.repeat(Math.min(3, hits))}</b>`;
  return {
    stop() { on = false; },
    // Drive to `at`; `car`, if given, is the one that has to get there.
    async to(at, text, car) {
      for (;;) {
        const m = g.addMarker(at.x, at.z, 6);
        g.hud.objective(text + meter());
        await g.until(() => { g.hud.objective(text + meter()); return hits >= 3 || (p.car && (!car || p.car === car) && near(p.pos, m, 6.5) && Math.abs(p.car.speed) < 6); });
        g.removeMarker(m);
        g.hud.objective();
        if (hits < 3) return;
        p.locked = true;
        await fade(g, 1, 0.8);
        await say(g, '', failText);
        reset();
        hits = 0; last = 0;
        await fade(g, 0, 0.8);
        p.locked = false;
      }
    },
  };
}

// A scene inside the Bada Bing. `arrange(room)` places the cast and returns them; `cam` names one of the room's cameras.
async function bingRoom(g, cam, arrange, play) {
  const room = g.places.bingRoom, p = g.player, night = g.night;
  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) p.car.speed = 0;
  p.hidden = true;
  g.setNight(1);
  for (const a of room.ambient) a.group.visible = false;
  const cast = arrange(room);
  g.cam.fixed = room[cam];
  await fade(g, 0, 1);
  try { await play(cast); } finally { for (const a of room.ambient) a.group.visible = true; }
  await fade(g, 1, 1);
  dismiss(g, ...Object.values(cast));
  g.cam.fixed = null;
  p.hidden = false;
  g.setNight(night);
}

// A scene in a room other than the Bing (the hospital ward): the room gives its own camera.
async function roomScene(g, room, arrange, play) {
  const p = g.player, night = g.night;
  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) p.car.speed = 0;
  p.hidden = true;
  g.setNight(0);
  const cast = arrange(room);
  g.cam.fixed = room.cam;
  await fade(g, 0, 1);
  await play(cast);
  await fade(g, 1, 1);
  dismiss(g, ...Object.values(cast));
  g.cam.fixed = null;
  p.hidden = false;
  g.setNight(night);
}
// Someone lying in a bed: the fall of the death clip, played through to its last frame.
function lying(g, look, at, heading) {
  const a = actor(g, look, at, heading, 'down');
  a.mixer.update(4);
  return a;
}

// Put Tony back at home in his own body, by day, with his car in the drive. The screen should be black.
function homeAsTony(g, tony) {
  const { home } = g.places, p = g.player;
  if (p.car) g.leaveCar();
  if (tony && p.human !== tony) { const other = p.human; g.setPlayer(tony); g.scene.remove(other.group); }
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.setNight(0);
  p.pos.set(home.wake.x, 0, home.wake.z);
  g.cam.fixed = null; g.cam.yaw = p.heading = 0;
}

// ---------- The episodes ----------

const EPISODES = [
  { name: 'Episode One', missions: [theDucks, collections, familyBusiness, greenGrove, garbage, insurance, secondOpinion, theParty] },
  { name: 'Episode Two', title: '46 Long', missions: [backRoom, hijack, sitDown, millersCar, kitchenFire, fortySixLong, closingTime] },
  { name: 'Episode Three', title: 'Denial, Anger, Acceptance', missions: [visitingHours, studyAid, patience, theMotel, denial, theBenefit, acceptance] },
];

export async function runStory(g) {
  const total = EPISODES.reduce((n, e) => n + e.missions.length, 0);
  const saved = readSave(), from = clamp(saved.mission || 0, 0, total);
  if (from > 0) { // pick up a saved game at home
    const { home, vesuvio } = g.places, p = g.player;
    if (saved.cash) g.addMoney(saved.cash);
    if (from > 5) vesuvio.burn();
    for (const d of home.ducks) d.group.visible = false;
    p.pos.set(home.wake.x, 0, home.wake.z);
    g.cam.fixed = null; g.cam.yaw = p.heading = 0; g.cam.pitch = 0.22;
    p.locked = false;
    g.hud.show(true);
    await fade(g, 0, 1.2);
  }
  let n = 0;
  for (const [e, episode] of EPISODES.entries()) {
    for (const [k, mission] of episode.missions.entries()) {
      if (n++ < from) continue;
      if (k === 0 && e > 0) { await g.wait(1.5); await titleCard(g, episode.title, episode.name); }
      for (;;) { // a mission is played again from the start if Tony is killed during it
        g.missionActive = true;
        try { await mission(g); break; } catch (err) { if (err !== g.WASTED) throw err; }
        finally { g.missionActive = false; }
        await g.respawn();
      }
      save(n, g.cash);
      await g.wait(1.5);
      if (k === episode.missions.length - 1) {
        g.hud.card(`End of ${episode.name}`, e === EPISODES.length - 1 ? 'Vice City is yours until the next one.' : '');
        await g.wait(6);
        g.hud.card();
      }
    }
  }
}

// ---------- 1. The Ducks ----------
// AJ's birthday. Tony's ducks leave the pool, he collapses, and ends up in a psychiatrist's office.

async function theDucks(g) {
  const { home, melfi } = g.places, p = g.player;

  p.locked = true;
  p.pos.set(home.spawn.x, 0, home.spawn.z);
  g.cam.yaw = p.heading = Math.atan2(home.pool.x - home.spawn.x, home.pool.z - home.spawn.z);
  g.cam.pitch = 0.22;
  g.cam.fixed = null;
  const carmela = actor(g, 'carmela', home.grill, WEST), meadow = actor(g, 'meadow', spot(home.patio, -3, 2.5), EAST), aj = actor(g, 'aj', spot(home.pool, -1.2, 4), EAST);
  await g.wait(0.5);
  g.hud.show(true);
  g.hud.fade(0, 1.5);
  await titleCard(g, 'The Ducks', 'North Shore, Vice City');
  await talk(g, [
    [TONY, 'There they are. The whole family, right in my pool.', p],
    [CARMELA, 'Tony! The coals are dying and your son turns thirteen today. Leave the ducks alone.', carmela],
    [TONY, 'One minute. They gotta eat too.', p],
  ]);

  p.locked = false;
  await reach(g, home.pool, 'Walk over to the <b>pool</b> and feed the ducks.', { r: 1.6, how: 'foot' });

  p.locked = true;
  p.heading = EAST;
  await say(g, TONY, 'Look at you. You hungry? Come here, I got bread.');

  // The ducks take off toward the ocean.
  const t0 = g.time;
  g.updaters.push(dt => {
    const t = g.time - t0;
    home.ducks.forEach((d, i) => {
      if (t < i * 0.25) return;
      d.wingL.visible = d.wingR.visible = true;
      const flap = Math.sin(g.time * 26 + i) * 0.9;
      d.wingL.rotation.z = flap; d.wingR.rotation.z = -flap;
      d.group.rotation.y = Math.PI / 2 - 0.4 + i * 0.12;
      d.group.rotation.x = -0.35;
      d.group.position.x += (5 + i) * dt; d.group.position.y += (2.2 + i * 0.3) * dt; d.group.position.z -= (1 + i * 0.6) * dt;
    });
    if (t < 9) return true;
    home.ducks.forEach(d => { d.group.visible = false; });
    return false;
  });
  await g.wait(1.6);
  await say(g, TONY, 'Hey... where you going? No, no, no. Come back.');
  await say(g, AJ, "Dad, they're leaving! All of them!", 2.4);

  const calm = panic(g);
  await say(g, TONY, "I can't... I can't breathe.", 3);
  p.down = 1;
  await say(g, CARMELA, 'Tony? Tony! Meadow, call an ambulance!', 2.6);
  await fade(g, 1, 1.2);
  calm();
  dismiss(g, carmela, meadow, aj);

  await say(g, '', "Tony blacked out by the pool, in front of everyone at his son's birthday.");
  await say(g, '', 'His neighbour, Dr. Cusamano, ran every test there is. His heart was fine.');
  await say(g, '', 'The diagnosis: a panic attack. He left with the name of a psychiatrist.');

  p.down = 0;
  p.pos.set(home.wake.x, 0, home.wake.z);
  g.cam.yaw = p.heading = 0;
  await fade(g, 0, 1.2);
  await say(g, TONY, "A shrink. If the crew ever hears about this, I'm finished.");

  p.locked = false;
  g.hud.objective('Get in your <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, melfi.park, "Drive to <b>Dr. Melfi's office</b>.", { how: 'car' });

  await therapy(g, [
    [MELFI, 'Mr. Soprano. Your doctor tells me you collapsed. What do you think happened?'],
    [TONY, "I don't know. One minute I'm feeding the ducks, the next I'm on the ground. Stress, maybe."],
    [MELFI, 'What line of work are you in?'],
    [TONY, 'Waste management consultant.'],
    [MELFI, 'Tell me about the ducks.'],
    [TONY, 'They landed in my pool a couple months back. Had their babies there. It was nice, having them around.'],
    [TONY, 'Then they flew off.'],
    [MELFI, 'And when they left, you felt you were losing something.'],
    [TONY, 'Lately I got this feeling... like I showed up after the best part was already over.'],
    [MELFI, "That's a good place to start. Same time next week, Mr. Soprano."],
  ]);
  place(g, melfi.door, 0, melfi.kerb);
  g.cam.yaw = Math.PI * 0.75; // look back at Tony with the office behind him
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. Collections ----------
// A gambler who owes the family is spotted on the beach; run him down.

async function collections(g) {
  const { ocean } = g.places, p = g.player;

  await g.wait(1.5);
  g.hud.card('Collections', 'Ocean Drive');
  await phone(g, CHRIS, "T, it's me. That degenerate Mahaffey is down on the beach, working on his tan.");
  await phone(g, CHRIS, 'He owes us ten grand and he walks around like he won the lottery.');
  await say(g, TONY, "Stay on him. I'm on my way.");
  g.hud.card();

  const chris = actor(g, 'christopher', ocean.chris, WEST);
  const debtor = actor(g, 'mahaffey', ocean.debtor, EAST);
  const d = { pos: new THREE.Vector3(ocean.debtor.x, 0, ocean.debtor.z), side: -1, caught: false };
  const alex = g.addNpc(debtor, { health: 90, cash: 0, stays: true }); // he can be hit, and he goes down rather than dies
  alex.die = () => { alex.health = 1; d.caught = true; };
  fistsOnly(g, true);

  g.hud.objective('Meet Christopher on <b>Ocean Drive</b>.');
  const m = g.addMarker(ocean.marker.x, ocean.marker.z, 7);
  await g.until(() => near(p.pos, m, 9) || near(p.pos, d.pos, 22));
  g.removeMarker(m);

  const blip = { x: d.pos.x, z: d.pos.z, color: '#ff3b4a' };
  g.blips.push(blip);
  g.updaters.push(dt => {
    if (d.caught) return false;
    if (debtor.busy) { d.pos.copy(debtor.group.position); return true; }
    let ax = d.pos.x - p.pos.x, az = d.pos.z - p.pos.z;
    const dist = Math.hypot(ax, az) || 1;
    if ((p.car && dist < 2.6 && Math.abs(p.car.speed) > 3) || alex.health < 40) { d.caught = true; return false; }
    if (dist < 70) {
      ax /= dist; az /= dist;
      // Keep him running along the beach rather than pinned against the water.
      const minZ = bounds.minZ + 4, maxZ = bounds.maxZ - 4;
      if (d.pos.z <= minZ + 1) d.side = 1; else if (d.pos.z >= maxZ - 1) d.side = -1;
      if (Math.abs(az) < 0.55) { az = 0.85 * d.side; const n = Math.hypot(ax, az); ax /= n; az /= n; } else d.side = Math.sign(az);
      d.pos.x = clamp(d.pos.x + ax * 6.3 * dt, SHORE + 6, bounds.maxX - 3);
      d.pos.z = clamp(d.pos.z + az * 6.3 * dt, minZ, maxZ);
      debtor.set('sprint');
      debtor.group.rotation.y = Math.atan2(ax, az);
      debtor.group.position.set(d.pos.x, groundAt(d.pos.x, d.pos.z), d.pos.z);
    } else debtor.set('idle');
    blip.x = d.pos.x; blip.z = d.pos.z;
    return true;
  });
  g.hud.objective('Chase down <b>Mahaffey</b>. Run him over, or catch him and beat it out of him.');
  say(g, CHRIS, "That's him by the water. He's seen us, he's running!", 3);
  await g.until(() => d.caught);

  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();
  p.locked = true;
  if (p.car) p.car.speed = 0;
  g.removeNpc(debtor);
  debtor.after = null; debtor.set('down');
  fistsOnly(g, false);
  await g.wait(0.8);
  await talk(g, [
    [DEBTOR, "My leg! Tony, please, I'll have it Friday, I swear on my mother!"],
    [TONY, 'You had Friday. Three Fridays ago.', p],
    [DEBTOR, "Here, here, take what I got on me. It's a grand. I'll get the rest!"],
    [TONY, 'Tomorrow. Or next time I back up over you.', p],
  ]);
  await passed(g, '$1,000', 1000);

  // Christopher catches up, with something on his mind.
  const tail = follower(g, chris, { gap: 2 });
  const t0 = g.time;
  await g.until(() => near(tail.pos, p.pos, 3.2) || p.car || g.time - t0 > 25);
  await talk(g, [
    [CHRIS, 'While I got you, T. The Kolar brothers undercut us on the Triborough Towers hauling contract.', chris],
    [TONY, 'Garbage is our bread and butter. They know whose stop that is.', p],
    [CHRIS, 'So let me handle it. Let me show you what I can do.', chris],
    [TONY, 'Talk to them. You hear me? Talk.', p],
  ]);
  p.locked = false;
  tail.on = false;
  chris.set('idle');
  await g.wait(3);
  dismiss(g, chris, debtor);
}

// ---------- 3. Family Business ----------
// Uncle Junior means to kill a man in Artie Bucco's restaurant. Tony asks him to do it anywhere else.

async function familyBusiness(g) {
  const { vesuvio: v } = g.places, p = g.player;

  g.hud.card('Family Business', 'Vesuvio, Ocean Heights');
  await phone(g, SILVIO, "Tone. Your uncle's holding court on the terrace at Vesuvio.");
  await phone(g, SILVIO, "Word is he's planning something for that place. You should hear it from him.");
  g.hud.card();
  await reach(g, v.kerb, "Drive to <b>Vesuvio</b>, Artie Bucco's restaurant.");

  p.locked = true;
  let artie, junior;
  await cut(g, () => {
    place(g, spot(v.door, -1.6, 0.6), NORTH, v.kerb);
    artie = actor(g, 'artie', spot(v.door, 0, -1.6), SOUTH);
    junior = actor(g, 'junior', v.seat, WEST, 'sit');
    frame(g, p.pos, artie.group.position, { dist: 5.2 });
  });
  await talk(g, [
    [ARTIE, 'Tony! Look who it is. You eat yet? Sit, I made the rabbit today.', artie],
    [TONY, 'Place looks beautiful, Artie. Full every night, I hear.', p],
    [ARTIE, "Twelve years of my life in these walls. Go on, your uncle's on the terrace.", artie],
  ]);
  await cut(g, () => {
    place(g, spot(v.seat, -3.2, 1.3), EAST);
    p.heading = toward(p.pos, v.seat);
    frame(g, p.pos, v.seat, { dist: 4.4, height: 1.5, lift: 1.1 });
  }, 0.4);
  await talk(g, [
    [JUNIOR, 'My nephew. Running around like he owns the town.'],
    [TONY, "I hear Little Pussy Malanga's been eating here.", p],
    [JUNIOR, 'Every Thursday. Same table, same veal. A man with habits makes it easy.'],
    [TONY, "Not here. You do it in Artie's place, nobody eats here again. He's a friend. We went to school together.", p],
    [JUNIOR, 'How many places you think Malanga goes? He comes here. So it happens here.'],
    [TONY, "Find another spot, Uncle Jun. I'm asking you.", p],
    [JUNIOR, "You're asking. Your father never asked me for nothing. He knew who was older."],
    [JUNIOR, 'Go see your mother. She says you never call.'],
  ]);
  await cut(g, () => {
    dismiss(g, artie, junior);
    g.cam.fixed = null;
    place(g, spot(v.door, 0, 2), SOUTH);
  });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. Green Grove ----------
// Tony tries to move his mother into a retirement community. She calls it a nursing home. He collapses again.

async function greenGrove(g) {
  const { livia: house, grove, melfi } = g.places, p = g.player;

  await g.wait(1);
  g.hud.card('Green Grove', 'A retirement community');
  await say(g, TONY, "She had a fire on the stove last week. She can't be alone in that house.");
  g.hud.card();
  await reach(g, house.kerb, 'Visit your mother at <b>her house</b>.');

  p.locked = true;
  let ma;
  await cut(g, () => {
    place(g, house.path, NORTH, house.kerb);
    ma = actor(g, 'livia', house.porch, SOUTH);
    frame(g, p.pos, house.porch, { dist: 4.6 });
  });
  await talk(g, [
    [LIVIA, 'Oh. He remembers he has a mother.', ma],
    [TONY, 'Ma. I brought you the pastry you like.', p],
    [LIVIA, "I can't eat that. I had a fire in the kitchen. Nobody came.", ma],
    [TONY, "That's what I'm talking about. I want to show you a place. Green Grove. It's beautiful.", p],
    [LIVIA, 'A nursing home.', ma],
    [TONY, "It's a retirement community! They got a pool, they got day trips, they got a chef.", p],
    [LIVIA, "I've seen those places. People go in. They don't come out.", ma],
    [TONY, 'Just look at it. For me. Get in the car.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  const mother = follower(g, ma, { pace: 2.3, runs: false });
  g.hud.objective('Get in your <b>car</b>. Your mother will follow.');
  await g.until(() => p.car);

  // She has opinions about the driving.
  let nagged = false;
  g.updaters.push(() => {
    if (!mother.on || nagged) return false;
    if (p.car && p.car.speed > 24) { nagged = true; say(g, LIVIA, 'Slow down! You drive like your father. Look where it got him.', 3.5); }
    return true;
  });
  await reach(g, grove.kerb, 'Drive your mother to <b>Green Grove</b>.', { how: 'car' });

  place(g, grove.gate, WEST, grove.kerb);
  const together = at => g.until(() => !p.car && near(p.pos, at, 3.5) && near(mother.pos, at, 5.5));
  let m = g.addMarker(grove.fountain.x, grove.fountain.z, 2.4);
  g.hud.objective('Show her the <b>gardens</b>. Wait for her to keep up.');
  await together(grove.fountain);
  g.removeMarker(m);
  g.hud.objective();
  await talk(g, [
    [TONY, 'Look at this. A fountain. Flowers. Bingo on Tuesdays.', p],
    [LIVIA, "They're all sitting here waiting to die. Look at their faces.", ma],
  ]);
  m = g.addMarker(grove.gazebo.x, grove.gazebo.z, 2.4);
  g.hud.objective('Walk her to the <b>gazebo</b>.');
  await together(grove.gazebo);
  g.removeMarker(m);
  g.hud.objective();

  p.locked = true;
  p.heading = toward(p.pos, mother.pos);
  await talk(g, [
    [TONY, "You'd have your own room. Your own things. Somebody to cook for you.", p],
    [LIVIA, 'My own son, putting me away. Your father would never have let you.', ma],
    [TONY, "Ma, nobody's putting you away. I'm trying to do a good thing here.", p],
    [LIVIA, 'Go on. Leave me here. I wish the Lord would take me now.', ma],
  ]);
  const calm = panic(g);
  await say(g, TONY, "I'm just trying to... I can't...", 3);
  p.down = 1;
  await g.wait(2.4);
  await fade(g, 1, 1.2);
  calm();
  p.down = 0;
  mother.on = false;
  dismiss(g, ma);
  await say(g, '', 'Livia went home in a taxi. She told the driver her son had tried to abandon her.');

  await therapy(g, [
    [MELFI, "That's twice now. Both times you were thinking about your family."],
    [TONY, "It's my mother. Nothing I do is right with her. I find her the best place in the state and I'm a criminal."],
    [MELFI, 'How do you feel when she says those things?'],
    [TONY, "How do I feel. She's my mother. You're supposed to take care of your mother."],
    [MELFI, "That isn't what I asked."],
    [TONY, "...Like I can't get a breath. There. You happy?"],
    [MELFI, "I'd like to start you on a medication. And I'd like you to keep talking."],
    [TONY, 'Medication. Wonderful.'],
  ]);
  place(g, melfi.door, 0);
  g.tonyCar.pos.set(melfi.kerb.x, 0, melfi.kerb.z); g.tonyCar.heading = melfi.kerb.h; g.tonyCar.speed = 0;
  g.cam.yaw = Math.PI * 0.75;
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Garbage ----------
// Played as Christopher, at night. He settles the Triborough Towers contract his own way,
// then has a body to get rid of. Big Pussy talks him out of sending a message with it.

async function garbage(g) {
  const { satriale, kolar, marsh, home } = g.places, p = g.player, tony = p.human;
  let emil, pussy;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'That night, Christopher decided to settle the Triborough Towers contract his own way.');
  if (p.car) g.leaveCar();
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.setNight(1);
  const chris = makeLook('christopher');
  g.setPlayer(chris);
  const ride = g.spawnCar(satriale.kerb.x, satriale.kerb.z, satriale.kerb.h, 0x1d1d24, 'coupe');
  p.pos.set(satriale.door.x + 2, 0, satriale.door.z);
  g.cam.yaw = p.heading = NORTH;
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Garbage', "Satriale's Pork Store, after hours");
  await say(g, CHRIS, 'Emil Kolar wants to talk about the contract. Fine. We talk in the back.');
  p.locked = false;
  await reach(g, satriale.back, "Go around to the <b>back door</b> of Satriale's.", { r: 1.8, how: 'foot' });

  p.locked = true;
  await cut(g, () => {
    p.pos.set(satriale.back.x, 0, satriale.back.z);
    emil = actor(g, 'kolar', spot(satriale.back, -3, 0.2), EAST);
    p.heading = toward(p.pos, emil.group.position);
    shot(g, spot(satriale.back, 3.4, -1.3), spot(satriale.back, -1.6, 0.2));
  }, 0.5);
  await talk(g, [
    [KOLAR, 'Christopher? Emil Kolar. My brothers send their respect. It smells like meat back here.', emil],
    [CHRIS, "It's a pork store. Come inside, I got something to show you about that bid of yours.", p],
    [KOLAR, 'In the old country, this is how business is done. At night, between men.', emil],
    [CHRIS, 'Yeah? Here too.', p],
  ]);
  // Emil turns to look at the door. Christopher has the gun.
  emil.group.rotation.y = NORTH;
  const mark = g.addNpc(emil, { health: 60, cash: 0, stays: true });
  g.cam.fixed = null;
  g.setWeapon('pistol');
  p.locked = false;
  g.hud.objective('Emil has his back to you. <b>Do it.</b>');
  await g.until(() => mark.dead);
  g.hud.objective();
  g.pardon(); // nobody saw
  p.locked = true;
  // The camera looks away, up at the pig on the roof.
  await cut(g, () => {
    g.removeNpc(emil); dismiss(g, emil);
    const pig = satriale.pig;
    g.cam.fixed = { pos: new THREE.Vector3(pig.x + 7, pig.y - 3, pig.z + 10), look: new THREE.Vector3(pig.x, pig.y, pig.z) };
  }, 0.4);
  await g.wait(1.6);
  await say(g, '', 'Emil Kolar would not be bidding on any more contracts.');
  g.setWeapon('fist');

  await cut(g, () => {
    pussy = actor(g, 'pussy', spot(satriale.back, 2.6, 0.3), WEST);
    p.heading = toward(p.pos, pussy.group.position);
    shot(g, spot(satriale.back, -3.6, -1.3), spot(satriale.back, 1.4, 0.2));
  }, 0.5);
  await talk(g, [
    [PUSSY, "Madonn'. You did this in the store? Where they cut the meat?", pussy],
    [CHRIS, "The Kolars pull their bid now. Tony's gonna see what I can do.", p],
    [PUSSY, "First we clean up. Then we worry what Tony sees. He goes in your trunk, and we go.", pussy],
  ]);
  const big = follower(g, pussy);

  // The drive: every hard crash loosens the trunk.
  let hits = 0, last = 0, watching = true;
  const trunk = () => ` &nbsp; Trunk <b>${'●'.repeat(3 - Math.min(3, hits))}${'○'.repeat(Math.min(3, hits))}</b>`;
  g.updaters.push(() => {
    if (!watching) return false;
    const speed = p.car ? Math.abs(p.car.speed) : 0;
    if (last > 9 && speed < last * 0.5) { hits++; g.hud.flash('#ff3b4a', 0.3); }
    last = speed;
    return true;
  });
  const drive = async (at, text) => {
    for (;;) {
      const m = g.addMarker(at.x, at.z, 6);
      g.hud.objective(text + trunk());
      await g.until(() => { g.hud.objective(text + trunk()); return hits >= 3 || (p.car && near(p.pos, m, 6.5) && Math.abs(p.car.speed) < 6); });
      g.removeMarker(m);
      g.hud.objective();
      if (hits < 3) return;
      p.locked = true;
      await fade(g, 1, 0.8);
      await say(g, '', 'The trunk flew open in the middle of the street. Nobody looks away from a thing like that.');
      if (p.car) g.leaveCar();
      ride.pos.set(satriale.kerb.x, 0, satriale.kerb.z); ride.heading = satriale.kerb.h; ride.speed = 0;
      g.enterCar(ride);
      hits = 0; last = 0;
      await fade(g, 0, 0.8);
      p.locked = false;
    }
  };
  await cut(g, () => { g.cam.fixed = null; g.enterCar(ride); }, 0.6);
  p.locked = false;
  say(g, CHRIS, "We leave him in the Kolars' own bin. They open it in the morning, they get the message.", 4);
  await drive(kolar.gate, 'Drive to the <b>Kolar Bros. yard</b>. Go easy: a crash will spring the trunk.');

  p.locked = true;
  if (p.car) p.car.speed = 0;
  await talk(g, [
    [PUSSY, "Wait. Think. They find him in their bin, the cops find him too. Then Tony's got a headache with your name on it."],
    [CHRIS, "So what, he just disappears? Where's the message in that?"],
    [PUSSY, "A brother who goes out one night and never comes home. That's a message. Nobody finds him."],
    [CHRIS, '...Where?'],
    [PUSSY, 'The marsh, out past the west road. I got a shovel in my trunk too.'],
  ]);
  p.locked = false;
  await drive(marsh, 'Drive to the <b>marsh</b> on the west shore.');
  watching = false;

  p.locked = true;
  await fade(g, 1, 1.2);
  await say(g, '', 'They dug until the sky turned pink.');
  big.on = false;
  dismiss(g, pussy);
  g.removeCar(ride);
  g.setPlayer(tony);
  g.scene.remove(chris.group);
  g.setNight(0);
  p.pos.set(home.wake.x, 0, home.wake.z);
  g.cam.yaw = p.heading = 0;
  await fade(g, 0, 1.2);
  await phone(g, CHRIS, "It's done, T. The Kolars are out of Triborough. You won't be hearing from Emil.");
  await say(g, TONY, 'I said talk to them. ...We will discuss this. Not on the phone.');
  p.locked = false;
  await passed(g, 'Triborough Towers');
}

// ---------- 6. Insurance ----------
// Junior will not move the hit. Artie will not take a holiday. So the restaurant has an accident.

async function insurance(g) {
  const { vesuvio: v, bing } = g.places, p = g.player;
  let artie, sil;

  await g.wait(1);
  g.hud.card('Insurance', 'Vesuvio');
  await phone(g, SILVIO, "Your uncle won't move it. Thursday, at Artie's, like he said.");
  await say(g, TONY, "Then Artie's closed Thursday. I got an idea.");
  g.hud.card();
  await reach(g, v.kerb, 'Bring Artie the cruise tickets at <b>Vesuvio</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, spot(v.door, -1.6, 0.6), NORTH, v.kerb);
    artie = actor(g, 'artie', spot(v.door, 0, -1.6), SOUTH);
    frame(g, p.pos, artie.group.position, { dist: 5.2 });
  });
  await talk(g, [
    [TONY, 'Artie. Two tickets. Three weeks on a boat, the islands. A guy owed me. You and Charmaine leave Wednesday.', p],
    [ARTIE, "Three weeks? I can't close for three weeks. ...But Charmaine's wanted a vacation for nine years. Let me ask her.", artie],
  ]);
  await fade(g, 1, 0.8);
  await say(g, '', 'An hour later, Artie called.');
  await phone(g, ARTIE, "Charmaine says we can't take them. She says she knows where free tickets come from. I'm sorry, Tone.");
  await say(g, TONY, 'Forget about it, Artie. It was a thought.');
  await phone(g, TONY, 'Sil. Meet me at the Bing tonight. Bring what you used on that body shop.');
  dismiss(g, artie);
  g.cam.fixed = null;
  place(g, spot(v.door, 0, 2), SOUTH);
  g.setNight(1);
  await fade(g, 0, 1);
  p.locked = false;
  await reach(g, bing.door, 'Meet Silvio at the <b>Bada Bing</b>.', { r: 4 });

  p.locked = true;
  await cut(g, () => {
    place(g, bing.door, NORTH, bing.park);
    sil = actor(g, 'silvio', spot(bing.door, 2.2, -1.2), WEST);
    p.heading = toward(p.pos, sil.group.position);
    frame(g, p.pos, sil.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [SILVIO, "You sure about this? Artie's a friend.", sil],
    [TONY, "That's why. A fire, he gets the insurance money and a new kitchen. A hit in his dining room, he gets empty tables for life.", p],
    [SILVIO, 'And your uncle?', sil],
    [TONY, "Can't whack a guy in a restaurant that ain't there.", p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  const partner = follower(g, sil);
  g.hud.objective('Get in a <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, v.kerb, 'Drive Silvio to <b>Vesuvio</b>.', { how: 'car' });

  let bomb = null;
  for (;;) {
    if (bomb) g.untrack(bomb);
    await reach(g, v.back, 'Carry the charge to the <b>kitchen door</b> round the back.', { r: 1.8, how: 'foot' });
    p.locked = true;
    p.pos.set(v.back.x, 0, v.back.z); p.heading = SOUTH; // the kitchen door is behind the spot
    g.hud.objective('Setting the charge…');
    p.human.play('kneel', 'idle');
    bomb = new THREE.Group();
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
    bomb.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.28), new THREE.MeshLambertMaterial({ color: 0x2a2422 })), lamp);
    lamp.position.set(0.12, 0.13, 0.1);
    bomb.position.set(v.back.x, groundAt(v.back.x, v.back.z) + 0.11, v.back.z + 0.8);
    g.track(bomb);
    const tb = g.time;
    g.updaters.push(() => { lamp.visible = Math.floor((g.time - tb) * 4) % 2 === 0; return bomb.parent !== null; });
    await g.wait(5);
    p.human.after = null; p.human.set('idle');
    p.locked = false;
    say(g, SILVIO, 'Fifteen seconds. Move!', 2.5);
    const t0 = g.time, far = () => Math.hypot(p.pos.x - v.centre.x, p.pos.z - v.centre.z);
    await g.until(() => {
      const left = Math.ceil(15 - (g.time - t0));
      g.hud.objective(`Get clear of the building! <b>${Math.max(0, left)}</b>` + (far() > 38 ? ' &nbsp; Far enough.' : ''));
      return left <= 0;
    });
    g.hud.objective();
    if (far() > 38) break;
    // Too close: the blast takes Tony with it, and the night starts over.
    g.hud.flash('#fff3d0', 1.2);
    p.locked = true; p.down = 1;
    await g.wait(1.5);
    await fade(g, 1, 0.8);
    await say(g, '', 'Too close. Tony woke up in a hospital bed, with a detective waiting to ask what he was doing there.');
    p.down = 0;
    place(g, spot(v.back, 6, -1), WEST);
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  v.burn();
  g.untrack(bomb);
  const fire = explode(g, v.centre);
  p.locked = true;
  if (p.car) p.car.speed = 0;
  shot(g, spot(v.centre, 9, 31), v.centre, 2.4, 5); // from across the street
  await g.wait(3.5);
  await talk(g, [
    [SILVIO, "Madonn'. Twelve years, gone in ten seconds."],
    [TONY, "He'll rebuild. Bigger. Let's go, before the trucks get here."],
  ]);
  await passed(g, 'Respect +');

  // The morning after.
  await fade(g, 1, 1);
  fire.stop();
  partner.on = false;
  dismiss(g, sil);
  g.setNight(0);
  place(g, spot(v.door, -1.4, 1.4), NORTH, v.kerb);
  artie = actor(g, 'artie', spot(v.door, 0.6, 0.2), NORTH);
  frame(g, p.pos, artie.group.position, { dist: 5.5, side: -1 });
  await fade(g, 0, 1);
  await talk(g, [
    [ARTIE, "A gas leak, they think. Everything. My father's recipes were in that office.", artie],
    [TONY, "You're insured. You'll come back better than before. I'm gonna help you, Artie.", p],
    [ARTIE, "You're a good friend, Tony.", artie],
  ]);
  await say(g, '', 'Uncle Junior had to find somewhere else for Little Pussy Malanga. He did not forget who made him look.');
  await cut(g, () => { dismiss(g, artie); g.cam.fixed = null; });
  p.locked = false;
}

// ---------- 7. Second Opinion ----------
// Mahaffey cannot pay. Hesh sees that his employer can: a clinic on paper, billing scans that never happen.

async function secondOpinion(g) {
  const { hesh: label, ocean, pier } = g.places, p = g.player;
  let hesh, pussy;

  await g.wait(1);
  g.hud.card('Second Opinion', 'F-Note Records');
  await phone(g, HESH, 'Anthony. Come by the label. I had a thought about your friend the gambler.');
  g.hud.card();
  await reach(g, label.kerb, "Drive to <b>F-Note Records</b>, Hesh's label.");

  p.locked = true;
  await cut(g, () => {
    place(g, spot(label.door, 0, -1.6), SOUTH, label.kerb);
    hesh = actor(g, 'hesh', spot(label.door, -1, 1.4), NORTH);
    pussy = actor(g, 'pussy', spot(label.door, 1.5, 1.2), NORTH);
    frame(g, p.pos, spot(label.door, 0, 1.3), { dist: 5.4 });
  });
  await talk(g, [
    [HESH, 'Your Mahaffey works for a health plan, yes? He approves the claims. He signs, they pay.', hesh],
    [TONY, "He can't cover ten grand. With the vig he's into us for twice that.", p],
    [HESH, "He doesn't pay. His company pays. We open a clinic on paper. Scans that never happen, billed to his desk.", hesh],
    [PUSSY, "He's gonna say no. He's scared of his own boss.", pussy],
    [HESH, 'Then we explain it to him somewhere with a view.', hesh],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  const a = follower(g, hesh), b = follower(g, pussy, { lead: a });
  g.hud.objective('Get in the <b>car</b> with Hesh and Pussy.');
  await g.until(() => p.car);
  await reach(g, ocean.marker, 'Pick up <b>Mahaffey</b> on Ocean Drive.', { how: 'car' });

  p.locked = true;
  if (p.car) p.car.speed = 0;
  const alex = actor(g, 'mahaffey', ocean.chris, WEST);
  await talk(g, [
    [DEBTOR, 'Tony! I was just coming to see you, I swear. I got two hundred on me.', alex],
    [PUSSY, "Keep it. Get in the car, Alex. We're going for a walk."],
  ]);
  const c = follower(g, alex, { lead: b });
  p.locked = false;
  await reach(g, pier.start, 'Drive to the <b>pier</b>.', { how: 'car' });
  g.hud.objective('Walk Mahaffey to the <b>end of the pier</b>.');
  const m = g.addMarker(pier.end.x, pier.end.z, 2.4);
  await g.until(() => !p.car && near(p.pos, m, 3) && near(c.pos, m, 10));
  g.removeMarker(m);
  g.hud.objective();

  p.locked = true;
  await cut(g, () => {
    for (const f of [a, b, c]) f.stay = true;
    const stand = (who, dx, dz, heading) => { who.group.position.set(pier.end.x + dx, groundAt(pier.end.x + dx, pier.end.z + dz), pier.end.z + dz); who.group.rotation.y = heading; who.set('idle'); };
    stand(alex, 3.6, 0, WEST); stand(pussy, 2.2, -1.4, EAST); stand(hesh, 1.6, 1.5, EAST);
    p.pos.set(pier.end.x, 0, pier.end.z); p.heading = EAST;
    g.cam.fixed = { pos: new THREE.Vector3(pier.end.x - 2.5, groundAt(pier.end.x, pier.end.z) + 2.1, pier.end.z + 6.5), look: new THREE.Vector3(pier.end.x + 2.6, 1.6, pier.end.z) };
  }, 0.6);
  await talk(g, [
    [DEBTOR, "Guys. Come on. I can't swim. You know I can't swim.", alex],
    [PUSSY, "Nobody's swimming. Long way down, though, when the tide's out.", pussy],
    [DEBTOR, "I'm not signing anything! You can't make me!", alex],
    [PUSSY, 'Tony. Explain it to him.', pussy],
  ]);
  const soft = g.addNpc(alex, { health: 100, cash: 0, stays: true });
  soft.die = () => { soft.health = 1; };
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('<b>Rough him up</b> until he listens.');
  await g.until(() => soft.health < 40);
  g.hud.objective();
  g.removeNpc(alex);
  fistsOnly(g, false);
  p.locked = true;
  p.heading = toward(p.pos, alex.group.position);
  alex.group.rotation.y = toward(alex.group.position, p.pos);
  frame(g, p.pos, alex.group.position, { dist: 4.2 });
  await talk(g, [
    [DEBTOR, 'Okay! Okay. Jesus. I was listening.', alex],
    [HESH, "Alex. You have a sickness, the gambling. We're your friends, so we found a way for you to pay that costs you nothing.", hesh],
    [DEBTOR, "Phony claims? That's fraud. I could go to prison!", alex],
    [TONY, 'Look down. Now look at me. Which one scares you more?', p],
    [DEBTOR, "...Okay. Okay! Send the paperwork. I'll sign whatever comes across my desk.", alex],
    [HESH, 'A sensible man. Mazel tov.', hesh],
  ]);
  await cut(g, () => {
    for (const f of [a, b, c]) f.on = false;
    dismiss(g, hesh, pussy, alex);
    g.cam.fixed = null;
    g.cam.yaw = WEST;
  });
  p.locked = false;
  await passed(g, '$5,000', 5000);
}

// ---------- 8. The Party ----------
// AJ's birthday, the second attempt. Everyone comes, including the two people who should not be talking.

async function theParty(g) {
  const { home } = g.places, p = g.player;
  const cast = {};

  await g.wait(1);
  g.hud.card('The Party', "AJ's birthday, take two");
  await phone(g, CARMELA, "Anthony, people are arriving. Your son's party. Again. Try to stay on your feet for this one.");
  g.hud.card();
  await reach(g, home.road, 'Drive <b>home</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, home.drive, EAST, home.car);
    const at = (dx, dz) => spot(home.patio, dx, dz);
    cast.carmela = actor(g, 'carmela', at(2.2, 2.8), WEST);
    cast.aj = actor(g, 'aj', spot(home.pool, -1.4, 3.5), NORTH);
    cast.meadow = actor(g, 'meadow', spot(home.pool, -1.8, 5.2), NORTH, 'talk');
    cast.pussy = actor(g, 'pussy', at(-5, 0), EAST, 'talk');
    cast.silvio = actor(g, 'silvio', at(-3.4, -0.8), WEST);
    cast.paulie = actor(g, 'paulie', at(-3.8, 1.2), WEST, 'talk');
    cast.hesh = actor(g, 'hesh', at(-1, 6.5), EAST);
    cast.artie = actor(g, 'artie', at(1, 7), WEST);
    cast.chris = actor(g, 'christopher', spot(home.drive, 5, 5), SOUTH);
    g.cam.fixed = null;
  });
  p.locked = false;

  await reach(g, home.grill, 'Take over at the <b>grill</b>.', { r: 1.4, how: 'foot' });
  p.locked = true; p.heading = NORTH;
  await talk(g, [
    [TONY, 'Who wants sausage? AJ! Thirteen years old. Come here.', p],
    [AJ, "Is Grandma coming? She said she's not coming. So that means she's coming, right?", cast.aj],
    [TONY, "That's exactly what it means.", p],
  ]);
  p.locked = false;

  await reach(g, cast.carmela.group.position, 'Talk to <b>Carmela</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  approach(g, cast.carmela);
  frame(g, p.pos, cast.carmela.group.position, { dist: 4 });
  await talk(g, [
    [TONY, "Carm. That thing I been doing Thursdays. It's not what you think. I'm seeing a therapist. A psychiatrist.", p],
    [CARMELA, '...A psychiatrist. You.', cast.carmela],
    [TONY, 'And I take a pill for it. Nobody can know. Nobody.', p],
    [CARMELA, "I think that's wonderful. I think it's the bravest thing you've done in years.", cast.carmela],
    [TONY, "Brave. If it gets out, I'm dead. That's how brave.", p],
  ]);
  g.cam.fixed = null;
  p.locked = false;

  await reach(g, cast.chris.group.position, 'Christopher is sulking by the drive. <b>Talk to him</b>.', { r: 1.7, how: 'foot' });
  p.locked = true;
  approach(g, cast.chris);
  frame(g, p.pos, cast.chris.group.position, { dist: 4 });
  await talk(g, [
    [TONY, "What's with the face? It's a party.", p],
    [CHRIS, "I took care of the Kolar thing. Triborough is ours again. Not one word from you. Not a 'good job.'", cast.chris],
    [TONY, "You're right. I should've said something. That's my mother in me, I don't know how.", p],
    [CHRIS, "My cousin's girl works for a guy in Hollywood. She says I could sell my life story. Mob stuff, they eat it up.", cast.chris],
    [TONY, 'You want to write a movie? About this? Are you out of your mind?', p],
  ]);
  await punch(g, p, cast.chris);
  await talk(g, [
    [CHRIS, "No! I'm just saying. I'm frustrated, T.", cast.chris],
    [TONY, 'You did good on Triborough. You are going to move up. But the Hollywood talk, you bury it deeper than Kolar.', p],
  ]);

  // Out at the kerb, a car pulls up.
  let car, junior, livia;
  await cut(g, () => {
    car = g.spawnCar(home.guest.x, home.guest.z, home.guest.h, 0xd9c7a0, 'sedan');
    junior = actor(g, 'junior', spot(home.guest, -1.6, -4.4), NORTH);
    livia = actor(g, 'livia', spot(home.guest, 0.6, -4.6), NORTH);
    shot(g, spot(home.guest, -2.6, -8), spot(home.guest, -0.5, -4.5), 2.05, 1.35); // over the hedge, from the garden
  });
  await talk(g, [
    [JUNIOR, "Look at him back there. King of the barbecue. He burned Artie's place to make a fool of me, you know.", junior],
    [LIVIA, "I don't know anything about that. He wants to put me in a home.", livia],
    [JUNIOR, 'Something may have to be done about your son, Livia.', junior],
  ]);
  await g.wait(1.6);
  await say(g, '', 'Livia looked at the hedge for a long moment. She did not say no.');

  await cut(g, () => {
    dismiss(g, junior, livia);
    g.removeCar(car);
    p.pos.set(home.pool.x, 0, home.pool.z); p.heading = EAST;
    g.cam.fixed = null; g.cam.yaw = EAST; g.cam.pitch = 0.2;
  });
  await say(g, TONY, 'Not one. Not even a feather.');

  await therapy(g, [
    [TONY, 'I had a dream. A bird flew off with something of mine. Something I need. Never mind what.'],
    [MELFI, 'What kind of bird?'],
    [TONY, "A seagull, I don't know. Something off the water. ...A duck."],
    [MELFI, 'Those ducks raised their young in your pool. They became a family. And then they left.'],
    [TONY, 'I was sad to see them go. Jesus. Look at this, now he cries.'],
    [TONY, "I'm afraid I'm gonna lose my family. Like I lost the ducks. That's what I'm full of dread about. It's always with me."],
    [MELFI, 'What are you so afraid is going to happen?'],
    [TONY, "I don't know. ...But I'll be here next week."],
  ]);
  dismiss(g, ...Object.values(cast));
  p.pos.set(home.wake.x, 0, home.wake.z);
  g.cam.yaw = p.heading = 0;
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode one complete', 2500);
}

// ==================== Episode two: 46 Long ====================

// ---------- 1. The Back Room ----------
// Thursday night at the Bing: the week's money, the television, and the question nobody wants to ask about Jackie.

async function backRoom(g) {
  const { bing } = g.places, p = g.player;

  g.hud.card('The Back Room', 'The Bada Bing');
  await phone(g, PAULIE, "T. We're counting at the Bing. Sil's doing his voices again. Come save us.");
  g.hud.card();
  await reach(g, bing.door, 'Go to the <b>Bada Bing</b>.', { r: 4 });

  await bingRoom(g, 'tableCam', room => {
    const sit = (look, n) => actor(g, look, room.seats[n], room.seats[n].h, 'sit');
    return { tony: sit('tony', 5), silvio: sit('silvio', 0), paulie: sit('paulie', 1), pussy: sit('pussy', 2), chris: sit('christopher', 4) };
  }, async () => {
    await say(g, '', "Thursday night. The week's envelopes were on the table and the television was on.");
    await talk(g, [
      [PAULIE, "Look at this guy. A prosecutor, selling a book. 'The mob is finished.' He says it like he's sorry."],
      [PUSSY, "He ain't wrong. Guys flip before the cuffs are closed. There's no standards no more."],
    ]);
    await say(g, '', 'Silvio did his Pacino. He does it every week. They laughed, every week.');
    await talk(g, [
      [TONY, "Jackie's back in the hospital. The chemo ain't doing what they said it would."],
      [CHRIS, 'So who runs things, if he... you know.'],
      [TONY, "He runs things. He's the boss. Count the money."],
      [PAULIE, "All I'm saying, somebody's gotta steer. Your uncle thinks it's him."],
      [TONY, 'My uncle thinks a lot of things.'],
    ]);
  });
  place(g, bing.door, SOUTH, bing.park);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. Hijack ----------
// Played as Christopher, at night, with Brendan Filone. The truck they take pays protection to Uncle Junior.

async function hijack(g) {
  const { bing } = g.places, p = g.player, tony = p.human;
  let brendan, driver;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Christopher and his friend Brendan Filone had their own idea for making the week better.');
  if (p.car) g.leaveCar();
  g.setNight(1);
  const chris = makeLook('christopher');
  g.setPlayer(chris);
  const ride = g.spawnCar(bing.door.x + 6, bing.door.z + 2, EAST, 0x1d1d24, 'coupe');
  p.pos.set(bing.door.x, 0, bing.door.z);
  g.cam.fixed = null; g.cam.yaw = p.heading = EAST;
  brendan = actor(g, 'brendan', spot(bing.door, 2.2, 0.6), WEST);
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Hijack', 'Ocean Drive, after midnight');
  await talk(g, [
    [BRENDAN, 'DVD players. A whole truck of them. Comley runs one up Ocean Drive every night about now.', brendan],
    [CHRIS, 'Comley pays protection to Junior.', p],
    [BRENDAN, 'To Junior. Not to us.', brendan],
  ]);
  const pal = follower(g, brendan);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);

  // The truck is out on its round. Ram it three times, or sit in its way until the driver gives up.
  const truck = g.spawnCar(0, 0, 0, 0xf2f0ea, 'truck');
  truck.driverless = true; // the driver is dealt with in the scene that follows
  roam(truck, 8, 4, 3, 11);
  const blip = { x: truck.pos.x, z: truck.pos.z, color: '#ffe066' };
  g.blips.push(blip);
  let rams = 0, cool = 0, boxed = 0, stopped = false;
  g.hud.objective('Stop the <b>Comley truck</b>: ram it, or block its way.');
  g.updaters.push(dt => {
    if (stopped) return false;
    blip.x = truck.pos.x; blip.z = truck.pos.z;
    cool -= dt;
    let d = 99;
    if (p.car && p.car !== truck) for (const o of [-truck.reach, 0, truck.reach]) d = Math.min(d, Math.hypot(p.pos.x - truck.pos.x - Math.sin(truck.heading) * o, p.pos.z - truck.pos.z - Math.cos(truck.heading) * o));
    if (d < 4 && cool <= 0 && Math.abs(p.car.speed) > 7) { rams++; cool = 1.5; truck.speed *= 0.4; g.hud.flash('#ffe066', 0.25); }
    boxed = d < 12 && Math.abs(truck.speed) < 1 ? boxed + dt : 0;
    stopped = rams >= 3 || boxed > 4 || p.car === truck; // climbing into the cab works too
    return !stopped;
  });
  await g.until(() => {
    g.hud.objective(`Stop the <b>Comley truck</b>: ram it, or block its way. &nbsp; <b>${'●'.repeat(Math.min(3, rams))}${'○'.repeat(3 - Math.min(3, rams))}</b>`);
    return stopped;
  });
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();
  truck.nav = null; truck.speed = 0;

  p.locked = true;
  await cut(g, () => {
    const side = { x: truck.pos.x + Math.cos(truck.heading) * 2.4, z: truck.pos.z - Math.sin(truck.heading) * 2.4 };
    if (p.car) { p.car.speed = 0; g.leaveCar(spot(side, Math.cos(truck.heading) * 2.2, -Math.sin(truck.heading) * 2.2)); }
    driver = actor(g, 'trucker', side, toward(side, p.pos));
    p.heading = toward(p.pos, side);
    frame(g, p.pos, side, { dist: 4.6 });
  }, 0.5);
  await talk(g, [
    [BRENDAN, "Out! Keys stay in it! Don't look at us!"],
    ['Driver', "Take it, take it. I got two kids. Do me one favour: give me a shot in the face, so my boss believes me.", driver],
    [CHRIS, "You're asking me to hit you.", p],
    ['Driver', 'Not the teeth.', driver],
  ]);
  const poor = g.addNpc(driver, { health: 100, cash: 0, stays: true });
  poor.die = () => { poor.health = 1; };
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('<b>Hit the driver</b>, like he asked.');
  await g.until(() => poor.health < 100);
  g.hud.objective();
  g.removeNpc(driver);
  fistsOnly(g, false);
  driver.after = null; driver.set('down');
  await g.wait(1.2);
  await say(g, '', 'Christopher obliged him. It seemed only polite.');
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('Get in the <b>truck</b>.');
  await g.until(() => p.car === truck);
  g.hud.objective('Drive the truck to the <b>Bada Bing</b> car park.');
  const m = g.addMarker(bing.door.x, bing.door.z + 2, 6);
  await g.until(() => p.car === truck && near(p.pos, m, 7) && Math.abs(truck.speed) < 6);
  g.removeMarker(m);
  g.hud.objective();

  p.locked = true;
  await fade(g, 1, 1.2);
  await say(g, '', 'By morning the DVD players were gone, at forty cents on the dollar.');
  pal.on = false;
  dismiss(g, brendan, driver);
  homeAsTony(g, tony);
  g.removeCar(truck); g.removeCar(ride);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'A truckload of DVD players');
}

// ---------- 3. The Sit-Down ----------
// Junior wants satisfaction for his truck. Jackie Aprile, sick as he is, still makes the ruling.

async function sitDown(g) {
  const { satriale, bing } = g.places, p = g.player, t = satriale.table;
  let junior, jackie, chris, brendan;

  await g.wait(1);
  g.hud.card('The Sit-Down', "Satriale's Pork Store");
  await phone(g, JUNIOR, "Your nephew robbed a truck that pays me. You, me and Jackie. Satriale's. Now.");
  g.hud.card();
  await reach(g, satriale.kerb, "Drive to <b>Satriale's</b>.");

  p.locked = true;
  await cut(g, () => {
    place(g, spot(t, -1.5, 2.1), NORTH, satriale.kerb);
    p.heading = toward(p.pos, t);
    junior = actor(g, 'junior', spot(t, -0.95, 0), EAST, 'sit');
    jackie = actor(g, 'jackie', spot(t, 0.95, 0), WEST, 'sit');
    shot(g, spot(t, 2.8, 4.6), spot(t, -0.3, 0.5), 1.6, 1.1);
  });
  await talk(g, [
    [JUNIOR, 'Comley Trucking has paid me every month since before your nephew could shave.'],
    [TONY, "He didn't know whose stop it was. He's a kid.", p],
    [JUNIOR, 'He knew. That friend of his, Filone, he knew.'],
    [JACKIE, "Enough. I'm tired, and not from this. Christopher makes restitution. Fifteen thousand to Junior. Tony, you see it's paid."],
    [TONY, 'Fifteen. Done.', p],
    [JACKIE, "And you two. I won't always be here to referee. Work it out between you before I'm gone."],
    [JUNIOR, "Don't talk like that, Jackie."],
  ]);
  await cut(g, () => { dismiss(g, junior, jackie); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, bing.door, 'Find Christopher and Brendan at the <b>Bada Bing</b>.', { r: 4 });

  p.locked = true;
  await cut(g, () => {
    place(g, bing.door, NORTH, bing.park);
    chris = actor(g, 'christopher', spot(bing.door, -1, -2.2), SOUTH);
    brendan = actor(g, 'brendan', spot(bing.door, 1.2, -2.4), SOUTH);
    frame(g, p.pos, spot(bing.door, 0, -2.3), { dist: 5 });
  });
  await talk(g, [
    [TONY, 'Fifteen grand to my uncle. By Friday.', p],
    [BRENDAN, 'Fifteen? For what? We did the work, we took the risk...', brendan],
  ]);
  await punch(g, p, brendan);
  await talk(g, [
    [TONY, 'Was I talking to you? Comley is off the menu. For both of you. Say it back.', p],
    [CHRIS, "Comley's off the menu.", chris],
    [TONY, "And my end comes off the top of those DVD players. That's the tax for making me sit through that.", p],
  ]);
  await cut(g, () => { dismiss(g, chris, brendan); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, '$4,000', 4000);
}

// ---------- 4. Mr. Miller's Car ----------
// Played as Big Pussy, with Paulie. AJ's science teacher had his car stolen; Carmela wants it found.

async function millersCar(g) {
  const { bodyshop, cafe, chop, melfi, school, home } = g.places, p = g.player, tony = p.human;
  let paulie, eddie, miller, aj;

  await g.wait(1);
  g.hud.card("Mr. Miller's Car", 'Verbum Dei School');
  await phone(g, CARMELA, "AJ's science teacher had his car stolen out of the school lot. Mr. Miller. He's a nice man, Tony, and your son has a D in that class.");
  await say(g, TONY, 'What am I, the police?');
  await phone(g, CARMELA, 'You know people who know people.');
  await phone(g, TONY, "Puss. A tan sedan, belongs to a schoolteacher. Find it. Don't ask.");
  g.hud.card();

  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) g.leaveCar();
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  const pussy = makeLook('pussy');
  g.setPlayer(pussy);
  const ride = g.spawnCar(bodyshop.kerb.x, bodyshop.kerb.z, bodyshop.kerb.h, 0x2f6b4a, 'sedan');
  p.pos.set(bodyshop.door.x, 0, bodyshop.door.z);
  g.cam.fixed = null; g.cam.yaw = p.heading = NORTH;
  paulie = actor(g, 'paulie', spot(bodyshop.door, 1.8, -0.6), WEST);
  await fade(g, 0, 1);
  await talk(g, [
    [PAULIE, "A teacher's car. This is what we do now. We're the auto club.", paulie],
    [PUSSY, 'The kid at that coffee place sees everything that moves on four wheels. We start there.', p],
  ]);
  const pal = follower(g, paulie);
  p.locked = false;
  g.hud.objective('Get in your <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, cafe.kerb, 'Drive to <b>Bean Scene</b>, the coffee bar.', { how: 'car' });

  p.locked = true;
  await cut(g, () => {
    place(g, spot(cafe.door, -0.9, 0.4), NORTH, cafe.kerb);
    pal.stay = true;
    paulie.group.visible = true;
    paulie.group.position.set(cafe.door.x + 1, groundAt(cafe.door.x, cafe.door.z), cafe.door.z + 0.2); paulie.group.rotation.y = WEST; paulie.set('idle');
    p.heading = EAST;
    frame(g, p.pos, paulie.group.position, { dist: 4.2 });
  });
  await talk(g, [
    [PAULIE, 'Four dollars. For an espresso. We invented this. My grandmother made it on the stove for nothing.', paulie],
    [PUSSY, "It's a coffee, Paulie.", p],
    [PAULIE, "It's a robbery. They took the pizza, they took the coffee. What have we got left?", paulie],
    [PUSSY, "The kid says Eddie's boys had a tan sedan up at the north end of the beach.", p],
  ]);
  g.cam.fixed = null;
  pal.pos.copy(paulie.group.position); pal.stay = false;
  p.locked = false;
  await reach(g, chop, 'Drive to the <b>north end of the beach</b>.', { how: 'car', r: 7 });

  // Too late: the car is already in pieces.
  p.locked = true;
  const shell = new Car(g.scene, chop.x + 5, chop.z - 3, 0.6, 0xd9c7a0, 'sedan');
  g.track(shell.mesh);
  for (const w of shell.mesh.userData.wheels) w.visible = false;
  shell.mesh.position.y -= 0.24;
  await cut(g, () => {
    place(g, spot(chop, 1.5, 0.5), NORTH);
    eddie = actor(g, 'eddie', spot(chop, 2.6, -1.8), SOUTH);
    frame(g, p.pos, eddie.group.position, { dist: 4.6, side: -1 });
  });
  const thug = (at, h) => { const a = makeHuman(randomPedLook()); a.group.position.set(at.x, groundAt(at.x, at.z), at.z); a.group.rotation.y = h; g.track(a.group); return a; };
  const thugs = [thug(spot(chop, 6, 3), WEST), thug(spot(chop, -4, -5), SOUTH)];
  await talk(g, [
    ['Eddie', "The teacher's car? Aw, man. It's parts already. I didn't know he was a friend of yours.", eddie],
    [PAULIE, 'So put it back together.'],
    ['Eddie', "Hey, you don't come down here and talk to me like that. Boys!", eddie],
  ]);
  const crew = thugs.map(t => g.makeEnemy(t, { health: 70, damage: 9, cash: 40 }));
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective("<b>Deal with Eddie's crew.</b>");
  await allDown(g, crew);
  g.hud.objective();
  fistsOnly(g, false);
  p.locked = true;
  approach(g, eddie, 2);
  frame(g, p.pos, eddie.group.position, { dist: 4.2 });
  await talk(g, [
    ['Eddie', "Okay! Okay. It's gone, man, I can't un-sell a car.", eddie],
    [PUSSY, 'Forget it. We get him another one, same model. Nobody counts the bolts.', p],
  ]);
  const target = g.spawnCar(melfi.park.x - 14, melfi.park.z - 3, EAST, 0x29c7c0, 'sedan');
  const blip = { x: target.pos.x, z: target.pos.z, color: '#ffe066' };
  await cut(g, () => { dismiss(g, eddie, ...thugs); g.cam.fixed = null; });
  g.blips.push(blip);
  p.locked = false;
  g.hud.objective('Take the <b>sedan</b> parked by the glass office block.');
  await g.until(() => { blip.x = target.pos.x; blip.z = target.pos.z; return p.car === target; });
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();

  const load = careful(g, 'Bodywork', 'A teacher will not take a car with the front pushed in. They went and found another.', () => {
    if (p.car) g.leaveCar();
    target.pos.set(melfi.park.x - 14, 0, melfi.park.z - 3); target.heading = EAST; target.speed = 0;
    g.enterCar(target);
  });
  await load.to(bodyshop.kerb, "Drive it to <b>Pussy's body shop</b>. Don't dent it.", target);
  p.locked = true;
  await fade(g, 1, 1);
  target.repaint(0xcdb98a);
  target.speed = 0;
  await say(g, '', "Pussy's cousin sprayed it tan. Close to tan.");
  await fade(g, 0, 1);
  p.locked = false;
  await load.to(school.gate, 'Deliver it to <b>Verbum Dei School</b>.', target);
  load.stop();

  p.locked = true;
  await cut(g, () => {
    g.leaveCar(spot(school.lot, -2.4, 1));
    target.pos.set(school.lot.x, 0, school.lot.z); target.heading = EAST; target.speed = 0;
    p.heading = WEST;
    pal.stay = true;
    paulie.group.visible = true;
    paulie.group.position.set(school.lot.x - 2.2, groundAt(school.lot.x, school.lot.z), school.lot.z + 2.6); paulie.group.rotation.y = WEST; paulie.set('idle');
    miller = actor(g, 'miller', spot(school.lot, -5.4, 1.4), EAST);
    aj = actor(g, 'aj', spot(school.lot, -5.8, 3), EAST);
    shot(g, spot(school.lot, -3.6, 7.5), spot(school.lot, -3.2, 1.2), 1.7, 1.2);
  });
  await talk(g, [
    [MILLER, 'This is... is this my car? Mine was beige. This is more of a sand.', miller],
    [PUSSY, "It's your car.", p],
    [MILLER, "My key doesn't fit the door.", miller],
    [PAULIE, 'So here is a new key. You want the car, or you want to stand here?', paulie],
    [AJ, "Mr. Miller, I'd take the car.", aj],
  ]);
  await fade(g, 1, 1);
  await say(g, '', 'AJ finished the term with a B in science. Nobody could say exactly why.');
  pal.on = false;
  dismiss(g, paulie, miller, aj);
  g.untrack(shell.mesh);
  homeAsTony(g, tony);
  g.removeCar(ride);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Kitchen Fire ----------
// Livia sets fire to her kitchen, sees off the help, and puts her best friend in the hospital. Green Grove it is.

async function kitchenFire(g) {
  const { livia: house, grove } = g.places, p = g.player;
  let ma, help, fanny;

  await g.wait(1);
  g.hud.card('Kitchen Fire', "Livia's house");
  await phone(g, 'Neighbour', "Mr. Soprano? There's smoke coming out of your mother's kitchen window.");
  g.hud.card();
  const fire = smoke(g, spot(house.porch, -4, -7), 5);
  const t0 = g.time, m = g.addMarker(house.kerb.x, house.kerb.z, 6);
  await g.until(() => {
    const left = Math.ceil(80 - (g.time - t0));
    g.hud.objective(`Get to <b>your mother's house</b>! ` + (left > 0 ? `<b>${left}</b>` : 'The fire engines beat you to it.'));
    return near(p.pos, m, 6.4);
  });
  const late = g.time - t0 > 80;
  g.removeMarker(m);
  g.hud.objective();

  p.locked = true;
  await cut(g, () => {
    fire.stop();
    place(g, house.path, NORTH, house.kerb);
    ma = actor(g, 'livia', house.porch, SOUTH);
    help = actor(g, 'perrilyn', spot(house.path, 1.8, 0.6), NORTH);
    frame(g, p.pos, house.porch, { dist: 5 });
  });
  await talk(g, [
    [LIVIA, late ? 'The firemen came before my own son did.' : 'I was only making mushrooms. I turn my back one minute.', ma],
    [TONY, "Ma, this is Perrilyn. She's going to help around the house. Cook, clean, drive you.", p],
    [LIVIA, "A stranger in my house. She'll steal. They all steal.", ma],
    ['Perrilyn', 'Mrs. Soprano, I have looked after families for twenty years.', help],
    [LIVIA, 'Then go and look after them.', ma],
  ]);
  await fade(g, 1, 0.8);
  dismiss(g, help);
  await say(g, '', 'Perrilyn lasted one afternoon.');
  await say(g, '', 'That Friday, Livia drove her friend Fanny home from the hairdresser.');

  // The car lurches forward in the drive.
  const drive = spot(house.porch, 4.4, 0.6), car = g.spawnCar(drive.x, drive.z, SOUTH, 0xd9c7a0, 'sedan');
  ma.group.visible = false;
  p.hidden = true;
  fanny = actor(g, 'fanny', spot(drive, 0, 6.2), NORTH);
  shot(g, spot(drive, 6.5, 9.5), spot(drive, 0, 3.6), 1.9, 1);
  await fade(g, 0, 0.8);
  await say(g, 'Fanny', "Put it in park, Livia! I haven't shut the door!", 2.2);
  const t1 = g.time;
  g.updaters.push(() => { if (g.time - t1 > 0.75) return false; car.speed = 5.2; return true; });
  await g.wait(0.75);
  car.speed = 0;
  g.hud.flash('#ffffff', 0.4);
  fanny.set('down');
  await g.wait(1.6);
  await fade(g, 1, 0.8);
  await say(g, '', "Fanny's hip was broken in two places. Livia said the car did it by itself.");
  dismiss(g, fanny);
  g.removeCar(car);
  ma.group.visible = true;
  p.hidden = false;
  g.cam.fixed = null;
  await fade(g, 0, 0.8);
  await talk(g, [
    [TONY, "That's it. You can't cook, you can't drive. You're going to Green Grove. Today.", p],
    [LIVIA, 'Then kill me now. Go on. Take a knife and do it.', ma],
  ]);
  p.locked = false;
  const mother = follower(g, ma, { pace: 2.3, runs: false });
  g.hud.objective('Get in your <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, grove.kerb, 'Drive your mother to <b>Green Grove</b>.', { how: 'car' });

  p.locked = true;
  await cut(g, () => {
    place(g, spot(grove.gate, -2, 0), WEST, grove.kerb);
    mother.stay = true;
    ma.group.visible = true;
    ma.group.position.set(grove.gate.x - 4, groundAt(grove.gate.x - 4, grove.gate.z), grove.gate.z + 0.8); ma.group.rotation.y = EAST; ma.set('idle');
    p.heading = toward(p.pos, ma.group.position);
    frame(g, p.pos, ma.group.position, { dist: 4.6 });
  });
  await talk(g, [
    [LIVIA, 'Look at this place. A nursing home.', ma],
    [TONY, "It's a retirement community. You got your own apartment, your own furniture. It costs a fortune.", p],
    [LIVIA, 'Go. You did what you came to do. Leave your mother with strangers.', ma],
  ]);
  await cut(g, () => { mother.on = false; dismiss(g, ma); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Green Grove');
}

// ---------- 6. 46 Long ----------
// Brendan takes another Comley truck, and this time a driver dies. Tony sends the truck back, less a few suits.

async function fortySixLong(g) {
  const { bing, comley, livia: house } = g.places, p = g.player;
  const cast = {};

  await g.wait(1);
  g.hud.card('46 Long', 'The Bada Bing');
  await phone(g, CHRIS, 'T. Brendan went out last night with two guys I never saw before. Another Comley truck. Italian suits.');
  await say(g, TONY, 'After what I told you.');
  await phone(g, CHRIS, "I wasn't there! I stayed home, I swear. T... the driver's dead. One of them dropped his gun and it went off.");
  g.hud.card();
  const lot = spot(bing.door, -9, 2.5), truck = g.spawnCar(lot.x, lot.z, EAST, 0xf2f0ea, 'truck');
  await reach(g, bing.door, 'Get to the <b>Bada Bing</b>.', { r: 4 });

  p.locked = true;
  await cut(g, () => {
    g.setNight(1);
    place(g, bing.door, WEST, bing.park);
    cast.brendan = actor(g, 'brendan', spot(bing.door, -3, -0.8), EAST);
    cast.chris = actor(g, 'christopher', spot(bing.door, -3.2, 1), EAST);
    cast.paulie = actor(g, 'paulie', spot(bing.door, -1, -2.6), SOUTH);
    cast.silvio = actor(g, 'silvio', spot(bing.door, 0.8, -2.8), SOUTH);
    cast.pussy = actor(g, 'pussy', spot(bing.door, 2.4, -2.2), SOUTH);
    shot(g, spot(bing.door, 2.5, 5.6), spot(bing.door, -1.4, -0.6), 1.9, 1.2);
  });
  await talk(g, [
    [TONY, 'A man is dead over a load of suits. A working man, driving a truck that pays my uncle.', p],
    [BRENDAN, 'It was an accident, Tony, the gun just...', cast.brendan],
  ]);
  await punch(g, p, cast.brendan);
  await punch(g, p, cast.brendan, true);
  await talk(g, [
    [TONY, "You don't talk. You are finished talking. The truck goes back to Comley tonight. Every stitch.", p],
    [PAULIE, "Every stitch? Tone. It's Italian wool. Where's the harm in a taste?", cast.paulie],
    [SILVIO, 'What are you, a 44?', cast.silvio],
    [TONY, '...46 long.', p],
  ]);
  await say(g, '', 'The truck went back a little lighter than it arrived.');
  await cut(g, () => {
    dismiss(g, cast.brendan, cast.paulie, cast.silvio, cast.pussy);
    g.cam.fixed = null;
  });
  const nephew = follower(g, cast.chris);
  p.locked = false;
  g.hud.objective('Get in the <b>truck</b>.');
  await g.until(() => p.car === truck);
  const load = careful(g, 'Cargo', "Suits all over the road, and a patrol car slowing down to look. Tony had it loaded again.", () => {
    if (p.car) g.leaveCar();
    truck.pos.set(lot.x, 0, lot.z); truck.heading = EAST; truck.speed = 0;
    g.enterCar(truck);
  });
  await load.to(comley.dock, 'Drive the truck back to <b>Comley Trucking</b>. Keep the load in one piece.', truck);
  load.stop();

  p.locked = true;
  truck.speed = 0;
  await talk(g, [
    [CHRIS, 'We just leave it here?'],
    [TONY, 'Keys on the seat. Comley finds it in the morning, and my uncle stops calling me.'],
    [CHRIS, "And Brendan?"],
    [TONY, "Brendan is your problem. Keep him away from me, and keep him off the crank."],
  ]);
  await passed(g, 'Respect +');

  // Saturday, at his mother's empty house.
  await fade(g, 1, 1.2);
  nephew.on = false;
  dismiss(g, cast.chris);
  if (p.car) g.leaveCar();
  g.removeCar(truck);
  g.setNight(0);
  await say(g, '', "Saturday, Tony went to clear out his mother's house.");
  place(g, house.path, NORTH);
  g.tonyCar.pos.set(house.kerb.x, 0, house.kerb.z); g.tonyCar.heading = house.kerb.h; g.tonyCar.speed = 0;
  await fade(g, 0, 1.2);
  p.locked = false;
  await reach(g, house.porch, 'Go in and <b>pack her things</b>.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.heading = NORTH;
  await say(g, TONY, 'Forty years in this house. Look at this one. Me and my sisters on the stoop. Pop with the hat.');
  const calm = panic(g);
  await say(g, TONY, 'She kept every picture. ...I gotta sit down.', 3);
  p.down = 1;
  await g.wait(2.4);
  await fade(g, 1, 1.2);
  calm();
  p.down = 0;
}

// ---------- 7. Closing Time ----------
// Dr. Melfi says a word Tony will not hear about his mother. Georgie picks the wrong night to fumble a phone.

async function closingTime(g) {
  const { melfi, bing } = g.places, p = g.player;

  await therapy(g, [
    [MELFI, 'You collapsed while you were looking at photographs of your mother.'],
    [TONY, "I was packing boxes. It's dusty in there. I got allergies."],
    [MELFI, "You've moved her out of her home. It's natural to feel guilt about that. It's also natural to feel anger. She has made this very hard for you."],
    [TONY, 'Anger. At my mother.'],
    [MELFI, "It can be hard to admit that we have feelings of hatred toward a parent."],
    [TONY, "Hatred. That's my mother you're talking about, not some case in a book. Where I come from we don't use that word."],
    [MELFI, 'Then tell me one warm memory of her. Just one.'],
    [TONY, "...She was a good mother. We're done for today."],
  ]);
  place(g, melfi.door, 0);
  g.tonyCar.pos.set(melfi.kerb.x, 0, melfi.kerb.z); g.tonyCar.heading = melfi.kerb.h; g.tonyCar.speed = 0;
  g.setNight(1);
  g.cam.yaw = Math.PI * 0.75;
  await fade(g, 0, 1);
  g.hud.card('Closing Time', 'The Bada Bing');
  p.locked = false;
  await g.wait(2.5);
  g.hud.card();
  await reach(g, bing.door, 'Go to the <b>Bada Bing</b>.', { r: 4 });

  await bingRoom(g, 'barCam', room => ({
    tony: actor(g, 'tony', room.bar, NORTH),
    georgie: actor(g, 'georgie', room.tender, SOUTH),
    silvio: actor(g, 'silvio', room.stool, WEST),
  }), async cast => {
    await talk(g, [
      [TONY, 'Georgie. Get me Green Grove on the phone. I want to know she ate.', cast.tony],
      [GEORGIE, 'Sure, Tone. ...How do you get an outside line on this thing? It keeps ringing the kitchen.', cast.georgie],
      [TONY, 'Push nine.', cast.tony],
      [GEORGIE, "I pushed nine. Now it's beeping. Is it supposed to beep?", cast.georgie],
    ]);
    await punch(g, cast.tony, cast.georgie);
    g.hud.flash('#ffffff', 0.4);
    g.cam.sway = 1;
    await punch(g, cast.tony, cast.georgie, true);
    g.cam.sway = 0;
    await say(g, '', "Tony took the receiver out of Georgie's hand and showed him how it worked. Several times.");
    await talk(g, [[SILVIO, "He's fine. Georgie, you're fine. Put some ice on it.", cast.silvio]]);
    await say(g, '', 'Nobody at the Bing asked Tony about his mother that night.');
  });
  g.setNight(0);
  place(g, bing.door, SOUTH, bing.park);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode two complete', 3000);
}

// ==================== Episode three: Denial, Anger, Acceptance ====================

// ---------- 1. Visiting Hours ----------
// Jackie Aprile is in Vice General. He asks for one thing: to be made to laugh.

async function visitingHours(g) {
  const { hospital, bing, wardRoom } = g.places, p = g.player;

  g.hud.card('Visiting Hours', 'Vice General Hospital');
  await phone(g, SILVIO, "Tone. Jackie's back in Vice General. He's asking for you.");
  g.hud.card();
  await reach(g, hospital.kerb, 'Drive to the <b>hospital</b>.');

  await roomScene(g, wardRoom, room => ({
    jackie: lying(g, 'jackie', room.bed, EAST),
    rosalie: actor(g, 'rosalie', room.chair, NORTH, 'sit'),
    tony: actor(g, 'tony', spot(room.bed, 0.4, 1.6), NORTH),
  }), async cast => {
    await talk(g, [
      [ROSALIE, "He's been asking since this morning. Twenty minutes, the nurse says. Then he sleeps.", cast.rosalie],
      [JACKIE, 'Tony. Look at this. Tubes. I got a tube for everything.'],
      [TONY, 'You look good. Better than Silvio.', cast.tony],
      [JACKIE, "Don't. ...They talk about me like I'm a photograph already. Junior's out there measuring the chair."],
      [TONY, "Nobody's measuring anything. You get well.", cast.tony],
      [JACKIE, 'Do me a favour. Make me laugh. One time, before this is over.'],
    ]);
  });
  place(g, spot(hospital.door, 0, -2), SOUTH, hospital.kerb);
  await fade(g, 0, 1);
  await say(g, TONY, "Make him laugh. ...Sil's got a girl at the Bing who could make a bishop laugh.");
  p.locked = false;
  await reach(g, bing.door, 'Go to the <b>Bada Bing</b>.', { r: 4 });

  p.locked = true;
  let sil, girl;
  await cut(g, () => {
    place(g, bing.door, NORTH, bing.park);
    sil = actor(g, 'silvio', spot(bing.door, -1.6, -2.4), SOUTH);
    girl = actor(g, 'dancer', spot(bing.door, 1.2, -2.6), SOUTH);
    frame(g, p.pos, spot(bing.door, 0, -2.5), { dist: 4.8 });
  });
  await talk(g, [
    [TONY, "Sil. Jackie wants a laugh. Lend me Tiffany for an hour. We'll get her a nurse's outfit.", p],
    [SILVIO, "A nurse. In a cancer ward. Tone, I love it.", sil],
    ['Tiffany', "Do I have to touch anything medical?", girl],
    [TONY, 'Only the chart.', p],
  ]);
  g.cam.fixed = null;
  dismiss(g, sil);
  const nurse = follower(g, girl);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Tiffany.');
  await g.until(() => p.car);
  await reach(g, hospital.kerb, 'Drive her to the <b>hospital</b>.', { how: 'car' });
  await reach(g, spot(hospital.door, 0, -2), "Take her in to <b>Jackie's room</b>.", { r: 2, how: 'foot' });
  nurse.on = false;
  dismiss(g, girl);

  await roomScene(g, wardRoom, room => ({
    jackie: lying(g, 'jackie', room.bed, EAST),
    tiffany: actor(g, 'dancer', spot(room.bed, 0, 1.1), NORTH),
    paulie: actor(g, 'paulie', spot(room.bed, 2.6, 1.4), WEST),
    silvio: actor(g, 'silvio', spot(room.bed, 3.4, 0.2), WEST),
    tony: actor(g, 'tony', spot(room.bed, 1.4, 2.4), NORTH),
  }), async cast => {
    await say(g, '', "The 'nurse' took Jackie's temperature. Paulie read the chart upside down.");
    await talk(g, [
      [PAULIE, 'Nurse, I think the patient needs a sponge bath. Says so right here.', cast.paulie],
      ['Tiffany', 'It says nothing of the kind.', cast.tiffany],
      [JACKIE, 'Get out. Get out, all of you, before Ro comes back and kills me herself.'],
      [SILVIO, "He's laughing. Look at him. He's laughing.", cast.silvio],
    ]);
    await say(g, '', 'For four minutes, nobody in the room was dying.');
  });
  place(g, spot(hospital.door, 0, -2), SOUTH);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. Study Aid ----------
// Played as Christopher. Meadow and Hunter need to stay awake for the SATs, and he knows a man on the beach.

async function studyAid(g) {
  const { bing, pier, school } = g.places, p = g.player, tony = p.human;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Meadow and her friend Hunter had the SATs on Saturday and three days to learn a year of chemistry.');
  if (p.car) g.leaveCar();
  const chris = makeLook('christopher');
  g.setPlayer(chris);
  const ride = g.spawnCar(bing.park.x, bing.park.z, bing.park.h, 0x1d1d24, 'coupe');
  place(g, bing.door, SOUTH);
  const meadow = actor(g, 'meadow', spot(bing.door, -1, 2.6), NORTH), hunter = actor(g, 'hunter', spot(bing.door, 0.8, 2.8), NORTH);
  frame(g, p.pos, spot(bing.door, 0, 2.7), { dist: 4.6 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Study Aid', 'The Bada Bing, after school');
  await talk(g, [
    [MEADOW, "Christopher. We need something to stay awake. Not coffee. You know what I mean.", meadow],
    [CHRIS, 'Are you out of your mind? Your father would bury me under the pool.', p],
    [HUNTER, "Fine. We get it from some guy on the beach instead. He'd like that better?", hunter],
    [CHRIS, '...Go home. Both of you. Study.', p],
  ]);
  await cut(g, () => { dismiss(g, meadow, hunter); g.cam.fixed = null; });
  await say(g, '', 'He went to the beach instead.');
  p.locked = false;
  await reach(g, pier.start, 'Drive to the <b>pier</b>; the man is called Rico.', { r: 7 });

  p.locked = true;
  let rico;
  const thug = (at, h) => { const a = makeHuman(randomPedLook()); a.group.position.set(at.x, groundAt(at.x, at.z), at.z); a.group.rotation.y = h; g.track(a.group); return a; };
  const muscle = [thug(spot(pier.start, -5, -5), SOUTH), thug(spot(pier.start, -4, 6), NORTH)];
  await cut(g, () => {
    place(g, spot(pier.start, -2, 0), WEST, { x: pier.start.x - 10, z: pier.start.z + 6, h: EAST });
    rico = actor(g, 'dealer', spot(pier.start, -6, 0), EAST);
    frame(g, p.pos, rico.group.position, { dist: 4.6 });
  });
  await talk(g, [
    ['Rico', "The Bing guy. Crank's eighty a bag, and the bag's small.", rico],
    [CHRIS, "Here's forty. It's for kids with a test.", p],
    ['Rico', "Here's nothing. And for forty, my boys take the forty.", rico],
  ]);
  const crew = [g.makeEnemy(rico, { health: 90, damage: 9, cash: 150 }), ...muscle.map(m => g.makeEnemy(m, { health: 50, damage: 6, cash: 30 }))];
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective("<b>Rico and his boys</b> want your money. Change their minds.");
  await allDown(g, crew);
  g.hud.objective();
  fistsOnly(g, false);
  await reach(g, rico.group.position, 'Take the <b>bag</b> off Rico.', { r: 1.4, how: 'foot' });
  p.locked = true;
  p.human.play('pickup', 'idle');
  await g.wait(1);
  g.pardon();
  p.locked = false;
  await reach(g, school.gate, 'Bring it to <b>Verbum Dei</b>. Meadow is waiting in the lot.', { r: 6 });

  p.locked = true;
  let m2, h2;
  await cut(g, () => {
    dismiss(g, rico, ...muscle);
    place(g, spot(school.lot, -2, 2), WEST, school.gate);
    m2 = actor(g, 'meadow', spot(school.lot, -4.6, 1.6), EAST); h2 = actor(g, 'hunter', spot(school.lot, -5, 3.2), EAST);
    frame(g, p.pos, m2.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [CHRIS, "One each. One. You feel funny, you call me. You never, ever tell your father.", p],
    [MEADOW, 'Thanks, Chris. Really.', m2],
    [HUNTER, "What's it like? Does it make you smart?", h2],
    [CHRIS, "It makes you awake. Smart you have to bring yourself.", p],
  ]);
  await fade(g, 1, 1);
  await say(g, '', 'They scored 1,230 and 1,210. Tony framed the letter. Nobody told him how.');
  dismiss(g, m2, h2);
  homeAsTony(g, tony);
  g.removeCar(ride);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 3. Patience ----------
// Junior has run out of it. In the park, Tony trades Brendan's life for Christopher's.

async function patience(g) {
  const { park, bing } = g.places, p = g.player;
  let junior, mikey, chris, brendan;

  await g.wait(1);
  g.hud.card('Patience', 'The park');
  await phone(g, JUNIOR, 'The park. Now. Bring nobody.');
  g.hud.card();
  await reach(g, park.kerb, 'Meet Uncle Junior in the <b>park</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, spot(park.bench, 2.2, 1.4), WEST, park.kerb);
    junior = actor(g, 'junior', spot(park.bench, 0, 0.2), SOUTH, 'sit');
    mikey = actor(g, 'mikey', spot(park.bench, -2.4, 1.2), EAST);
    shot(g, spot(park.bench, 0.6, 5.2), spot(park.bench, 0, 0.6), 1.6, 1.1);
  });
  await talk(g, [
    [JUNIOR, 'Your nephew and his friend. Comley, again. After the sit-down. After Jackie ruled on it.'],
    [TONY, "I'll handle Christopher.", p],
    [JUNIOR, 'You handled him last time. Mikey handles things so they stay handled.'],
    [MIKEY, 'Both of them, Junior says.', mikey],
    [TONY, "Not Christopher. You want an example, make it Filone. Christopher I'll make understand myself.", p],
    [JUNIOR, '...Filone, then. And your nephew gets a lesson he remembers.'],
    [TONY, "He'll remember.", p],
  ]);
  await say(g, '', 'Tony drove away knowing exactly what he had agreed to.');
  await cut(g, () => { dismiss(g, junior, mikey); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, bing.door, 'Find Christopher and Brendan at the <b>Bada Bing</b>.', { r: 4 });

  p.locked = true;
  await cut(g, () => {
    place(g, bing.door, NORTH, bing.park);
    chris = actor(g, 'christopher', spot(bing.door, -1, -2.2), SOUTH);
    brendan = actor(g, 'brendan', spot(bing.door, 1.4, -2.4), SOUTH, 'talk');
    frame(g, p.pos, spot(bing.door, 0, -2.3), { dist: 5 });
  });
  await talk(g, [
    [TONY, "Lay low. Both of you. Nobody goes near Comley, nobody goes near my uncle's people. You don't exist for a month.", p],
    [BRENDAN, "Junior's an old man with a hat. What's he gonna—", brendan],
  ]);
  await punch(g, p, brendan);
  await talk(g, [
    [TONY, "You've been warned. That's more than you'll get from them.", p],
    [CHRIS, 'T. What did he say? What did Junior say?', chris],
    [TONY, 'Lay low.', p],
  ]);
  await cut(g, () => { dismiss(g, chris, brendan); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. The Motel ----------
// Shlomo Teittleman's son-in-law will not grant a divorce without half the motel. Tony takes the job.

async function theMotel(g) {
  const { satriale, motel } = g.places, p = g.player, t = satriale.table;
  let shlomo, ariel, paulie, silvio;

  await g.wait(1);
  g.hud.card('The Motel', "Satriale's");
  await phone(g, SILVIO, "There's a man here with a hat and a problem. Says Hesh sent him. Says he pays.");
  g.hud.card();
  await reach(g, satriale.kerb, "Meet the man at <b>Satriale's</b>.");

  p.locked = true;
  await cut(g, () => {
    place(g, spot(t, -1.5, 2.1), NORTH, satriale.kerb);
    p.heading = toward(p.pos, t);
    shlomo = actor(g, 'shlomo', spot(t, 0.95, 0), WEST, 'sit');
    shot(g, spot(t, 2.8, 4.6), spot(t, -0.3, 0.5), 1.6, 1.1);
  });
  await talk(g, [
    [SHLOMO, 'My daughter wants a divorce. In our faith the husband must grant it, and he will not. He says: half the motel, or she stays married.', shlomo],
    [TONY, "And you'd like someone to explain the situation to him.", p],
    [SHLOMO, "Twenty-five thousand. He is at the motel every evening, he counts the towels.", shlomo],
    [TONY, "Twenty-five. Done. Go home, Mr. Teittleman.", p],
  ]);
  await cut(g, () => {
    dismiss(g, shlomo);
    paulie = actor(g, 'paulie', spot(t, -3, 3.4), EAST); silvio = actor(g, 'silvio', spot(t, 3, 3.6), WEST);
    g.cam.fixed = null;
  });
  const a = follower(g, paulie), b = follower(g, silvio, { lead: a });
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Paulie and Silvio.');
  await g.until(() => p.car);
  await reach(g, motel.kerb, 'Drive to the <b>Teittleman Motor Lodge</b>.', { how: 'car' });
  await reach(g, motel.office, 'Find Ariel at the <b>office</b>.', { r: 2.2, how: 'foot' });

  p.locked = true;
  const thug = (at, h) => { const m = makeHuman(randomPedLook()); m.group.position.set(at.x, groundAt(at.x, at.z), at.z); m.group.rotation.y = h; g.track(m.group); return m; };
  const helpers = [thug(spot(motel.court, 4, -4), SOUTH), thug(spot(motel.court, 6, 3), WEST)];
  await cut(g, () => {
    place(g, spot(motel.office, 2.2, 0), WEST);
    ariel = actor(g, 'ariel', motel.office, EAST);
    a.stay = b.stay = true;
    frame(g, p.pos, ariel.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [ARIEL, "You're the ones Shlomo sent. I know what you are.", ariel],
    [TONY, 'Then you know how this ends. Sign the paper.', p],
    [ARIEL, "At Masada, nine hundred Jews held off the Roman army for two years and chose death over surrender. You're the Romans.", ariel],
    [TONY, "Then we'll do this the Roman way.", p],
  ]);
  const fight = [g.makeEnemy(ariel, { health: 140, damage: 9, cash: 0 }), ...helpers.map(h => g.makeEnemy(h, { health: 50, damage: 6, cash: 25 }))];
  fight[0].die = () => { fight[0].health = 1; fight[0].human.after = null; fight[0].human.set('down'); fight[0].ai = null; fight[0].stays = true; };
  fistsOnly(g, true);
  g.cam.fixed = null; a.stay = b.stay = false;
  p.locked = false;
  g.hud.objective('<b>Beat it into him.</b> He has help.');
  await g.until(() => fight[0].ai === null && fight.slice(1).every(n => n.dead));
  g.hud.objective();
  fistsOnly(g, false);
  g.removeNpc(ariel);
  p.locked = true;
  approach(g, ariel, 1.6);
  frame(g, p.pos, ariel.group.position, { dist: 4.2, height: 1.4, lift: 0.7 });
  await talk(g, [
    [ARIEL, "Do what you want. I don't sign. I don't sign!", ariel],
    [TONY, "Sil. Call Hesh. Ask him what they take off a man who won't give his wife a divorce.", p],
  ]);
  await phone(g, HESH, 'In my experience, Anthony? Everything below the belt. The paper starts to look reasonable after that.');
  await talk(g, [
    [TONY, 'Paulie. The bolt cutters are in the trunk.', p],
    [ARIEL, '...Wait. Wait! Give me the paper. Give me the paper.', ariel],
  ]);
  await fade(g, 1, 1);
  await say(g, '', 'Ariel signed. Shlomo got his daughter back. Tony, who had been promised twenty-five thousand, took twenty-five per cent of the motel instead.');
  await phone(g, SHLOMO, 'A golem I made. A Frankenstein.');
  await say(g, TONY, 'Enjoy the seventy-five per cent, Mr. Teittleman.');
  a.on = b.on = false;
  dismiss(g, ariel, paulie, silvio, ...helpers);
  g.pardon();
  g.cam.fixed = null;
  place(g, spot(motel.court, 0, 6), SOUTH);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, '25% of a motel', 6000);
}

// ---------- 5. Denial ----------
// Dr. Melfi names the stages. Jackie is worse. On the way to the car, a stranger finds out which stage Tony is in.

async function denial(g) {
  const { melfi, hospital, wardRoom } = g.places, p = g.player;

  await g.wait(1);
  await therapy(g, [
    [MELFI, 'Your friend is dying.'],
    [TONY, "He's got the best doctors in the state. He's a strong guy."],
    [MELFI, 'When someone we care about is dying, we pass through stages. Denial. Anger. Bargaining. Depression. And then, if we are lucky, acceptance.'],
    [TONY, "I'm not on a stage. I'm in a chair."],
    [MELFI, 'Which one would you say you are in?'],
    [TONY, "...Same time next week."],
  ]);
  place(g, melfi.door, 0);
  g.tonyCar.pos.set(melfi.kerb.x, 0, melfi.kerb.z); g.tonyCar.heading = melfi.kerb.h; g.tonyCar.speed = 0;
  g.cam.yaw = Math.PI * 0.75;
  await fade(g, 0, 1);
  g.hud.card('Denial', 'Vice General Hospital');
  p.locked = false;
  await g.wait(2.5);
  g.hud.card();
  await reach(g, hospital.kerb, 'Drive to the <b>hospital</b>.');

  await roomScene(g, wardRoom, room => ({
    jackie: lying(g, 'jackie', room.bed, EAST),
    rosalie: actor(g, 'rosalie', room.chair, NORTH, 'sit'),
    tony: actor(g, 'tony', spot(room.bed, 0.4, 1.6), NORTH),
  }), async cast => {
    await talk(g, [
      [JACKIE, 'Tony. You hear what Junior is doing. With your nephew.'],
      [TONY, 'I hear everything, Jackie. Rest.', cast.tony],
      [JACKIE, "When I'm gone. Don't let it be a war. Promise me that."],
      [TONY, "You're not going anywhere.", cast.tony],
      [ROSALIE, 'He needs to sleep now, Tony.', cast.rosalie],
      [JACKIE, 'Promise me.'],
    ]);
    await say(g, '', 'Tony did not promise. He straightened the blanket and left.');
  });
  place(g, spot(hospital.door, 0, -2), SOUTH, hospital.kerb);
  const stranger = makeHuman(randomPedLook());
  stranger.group.position.set(hospital.door.x + 1.2, groundAt(hospital.door.x, hospital.door.z + 4), hospital.door.z + 4); stranger.group.rotation.y = NORTH;
  g.track(stranger.group);
  await fade(g, 0, 1);
  await say(g, '', 'On the way to the car, a stranger told Tony to watch where he was walking.');
  await talk(g, [['Stranger', "Hey. Watch it, fat man. You own the sidewalk?", stranger]]);
  const mark = g.makeEnemy(stranger, { health: 80, damage: 8, cash: 60 });
  fistsOnly(g, true);
  p.locked = false;
  g.hud.objective('<b>Anger.</b>');
  await allDown(g, [mark]);
  g.hud.objective();
  fistsOnly(g, false);
  g.pardon();
  await say(g, TONY, "...Sorry. Sorry about that. Here, that's for the dry cleaning.");
  await passed(g, 'Respect +');
}

// ---------- 6. The Benefit ----------
// Carmela's fundraiser. Father Phil, the Buccos doing the food, and a thing Charmaine has carried for years.

async function theBenefit(g) {
  const { home } = g.places, p = g.player;
  const cast = {};

  await g.wait(1);
  g.hud.card('The Benefit', 'The Soprano house');
  await phone(g, CARMELA, "The benefit is tonight. The Buccos are doing the food, Father Phil is coming, and you are coming, Anthony. In a jacket.");
  g.hud.card();
  await reach(g, home.road, 'Drive <b>home</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, home.drive, EAST, home.car);
    const at = (dx, dz) => spot(home.patio, dx, dz);
    cast.carmela = actor(g, 'carmela', at(2.2, 2.8), WEST);
    cast.charmaine = actor(g, 'charmaine', at(4.2, 1.4), WEST);
    cast.phil = actor(g, 'priest', at(-3, 4), EAST, 'talk');
    cast.meadow = actor(g, 'meadow', at(-4.5, 5), WEST);
    cast.aj = actor(g, 'aj', spot(home.pool, -1.4, 3.5), NORTH);
    cast.artie = actor(g, 'artie', spot(home.drive, 3, -3), SOUTH);
    cast.g1 = actor(g, 'hesh', at(-1, 7), EAST); cast.g2 = actor(g, 'rosalie', at(1, 7.4), WEST, 'talk');
    g.cam.fixed = null;
  });
  p.locked = false;

  await reach(g, cast.phil.group.position, 'Say hello to <b>Father Phil</b>.', { r: 1.7, how: 'foot' });
  p.locked = true;
  approach(g, cast.phil);
  frame(g, p.pos, cast.phil.group.position, { dist: 4 });
  await talk(g, [
    [PHIL, "Tony. Carmela tells me you've been under a strain.", cast.phil],
    [TONY, 'Carmela tells you a lot, Father.', p],
    [PHIL, 'Only what she needs to. The ziti, by the way, is a religious experience.', cast.phil],
    [TONY, "That's Artie's. Charmaine's. Enjoy it, Father.", p],
  ]);
  g.cam.fixed = null;
  p.locked = false;

  await reach(g, cast.artie.group.position, 'Give Artie a hand with the <b>wine</b>.', { r: 1.8, how: 'foot' });
  p.locked = true;
  approach(g, cast.artie);
  p.human.play('pickup', 'idle');
  await g.wait(1);
  await talk(g, [
    [ARTIE, "Charmaine's doing the whole thing with two cooks. We lost the staff when we lost the restaurant.", cast.artie],
    [TONY, "You'll have a new place by spring. I'm telling you.", p],
    [ARTIE, "From your mouth. Take that one to the patio, it's the good stuff.", cast.artie],
  ]);
  p.locked = false;
  await reach(g, home.patio, 'Carry the case to the <b>patio</b>.', { r: 2, how: 'foot' });
  p.locked = true;
  p.human.play('pickup', 'idle');
  await g.wait(0.8);

  // Across the patio, Charmaine has had enough of being pointed at.
  await cut(g, () => {
    cast.carmela.group.position.set(home.patio.x + 1, groundAt(home.patio.x, home.patio.z), home.patio.z + 2.2); cast.carmela.group.rotation.y = EAST;
    cast.charmaine.group.position.set(home.patio.x + 3.2, groundAt(home.patio.x, home.patio.z), home.patio.z + 2.2); cast.charmaine.group.rotation.y = WEST;
    shot(g, spot(home.patio, 2.1, 5.8), spot(home.patio, 2.1, 2.2), 1.6, 1.3);
  }, 0.5);
  await talk(g, [
    [CARMELA, 'Charmaine, the glasses go on the left, and could you tell your girl the ice—', cast.carmela],
    [CHARMAINE, "You can stop pointing, Carmela. I know where the kitchen is. I've been in it.", cast.charmaine],
    [CARMELA, "I didn't mean anything by—", cast.carmela],
    [CHARMAINE, 'When you two were engaged, and you went to Florida with your mother? Tony and I spent a weekend. It was nothing. I just want you to stop looking at me like the help.', cast.charmaine],
  ]);
  await say(g, '', 'Carmela said nothing. She moved the glasses to the left herself.');
  await cut(g, () => { g.cam.fixed = null; p.pos.set(home.drive.x, 0, home.drive.z); p.heading = EAST; g.cam.yaw = EAST; });
  await phone(g, SILVIO, "Tone. It's tonight. Mikey's people picked up the kid an hour ago.");
  await say(g, TONY, 'Both of them?');
  await phone(g, SILVIO, 'Both.');
  await say(g, TONY, "...I'm at a benefit for the pediatric wing. I don't know anything.");
  await cut(g, () => { dismiss(g, ...Object.values(cast)); });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 7. Acceptance ----------
// Played as Christopher. Brendan does not come to the Bing. Mikey Palmice does. Then Meadow sings.

async function acceptance(g) {
  const { bing, marsh, school } = g.places, p = g.player, tony = p.human;
  let mikey, goon;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'That night Christopher waited for Brendan at the Bing. Brendan never came.');
  if (p.car) g.leaveCar();
  g.setNight(1);
  const chris = makeLook('christopher');
  g.setPlayer(chris);
  place(g, bing.door, SOUTH);
  mikey = actor(g, 'mikey', spot(bing.door, -1.2, 3.4), NORTH);
  goon = actor(g, 'trucker', spot(bing.door, 1.6, 3.6), NORTH);
  frame(g, p.pos, spot(bing.door, 0, 3.5), { dist: 4.6 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Acceptance', 'The Bada Bing, late');
  await talk(g, [
    [MIKEY, "Christopher Moltisanti. Junior wants a word. Get in the car.", mikey],
    [CHRIS, "Where's Brendan?", p],
    [MIKEY, "Brendan's in the bath. Get in the car, or we do the word here.", mikey],
  ]);
  await fade(g, 1, 1.2);
  await say(g, '', 'They drove west, out past the last road, where the city stops and the reeds start.');

  // On his knees in the marsh.
  dismiss(g, mikey, goon);
  place(g, spot(marsh, 2, 0), WEST);
  p.pose = 'crouch';
  mikey = actor(g, 'mikey', spot(marsh, 3.8, 0.4), WEST); mikey.arm(true); mikey.set('aim');
  goon = actor(g, 'trucker', spot(marsh, 0, -2.6), SOUTH);
  shot(g, spot(marsh, -3, 3.4), spot(marsh, 2.6, 0.2), 1.5, 0.9);
  await fade(g, 0, 1.2);
  await talk(g, [
    [MIKEY, "Brendan Filone is in his bathtub with a hole where his eye was. You're the lucky one, Moltisanti.", mikey],
    [CHRIS, 'Please. Mikey. Please.', p],
    [MIKEY, 'Junior says you get to live. Say thank you.', mikey],
    [CHRIS, 'Thank you. Thank you.', p],
  ]);
  mikey.play('shoot', 'aim');
  g.hud.flash('#ffffff', 0.15);
  g.cam.sway = 1.2;
  await g.wait(0.6);
  g.cam.sway = 0;
  await talk(g, [
    [MIKEY, "That one was empty. The next one won't be. Comley is finished. You are finished. Walk home.", mikey],
  ]);
  await fade(g, 1, 1);
  dismiss(g, mikey, goon);
  p.pose = null;
  g.cam.fixed = null; g.cam.yaw = EAST; p.heading = EAST;
  await fade(g, 0, 1);
  await say(g, CHRIS, "...Walk home. From here.");
  p.locked = false;
  await reach(g, bing.door, 'Get back to the <b>Bada Bing</b>. Find a car.', { r: 4 });

  p.locked = true;
  let tonyActor;
  await cut(g, () => {
    place(g, bing.door, NORTH, bing.park);
    tonyActor = actor(g, 'tony', spot(bing.door, 0.8, -2.4), SOUTH);
    frame(g, p.pos, tonyActor.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [TONY, "Brendan's dead. You're alive because I asked an old man for a favour, and I'll be paying for it the rest of my life.", tonyActor],
    [CHRIS, "T. I didn't... they put a gun...", p],
    [TONY, "Don't. ...Get inside. Have a drink. Tomorrow you start being somebody I can use.", tonyActor],
  ]);
  await fade(g, 1, 1.2);
  dismiss(g, tonyActor);
  homeAsTony(g, tony);
  g.setNight(1);
  await say(g, '', "Across town, at Verbum Dei, the choir was already on its second song.");
  const choir = [spot(school.lot, -4, -3), spot(school.lot, -2, -3), spot(school.lot, 0, -3), spot(school.lot, 2, -3), spot(school.lot, 4, -3)].map((at, n) => actor(g, n === 2 ? 'meadow' : n % 2 ? 'hunter' : 'dancer', at, SOUTH, 'talk'));
  place(g, spot(school.lot, 0, 6), NORTH);
  shot(g, spot(school.lot, 3, 9), spot(school.lot, 0, -1), 1.7, 1.3);
  await fade(g, 0, 1.2);
  await say(g, '', "Meadow sang. Tony sat in the third row and did not hear a note.");
  await say(g, '', 'Denial. Anger. Acceptance.');
  await fade(g, 1, 1.5);
  dismiss(g, ...choir);
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode three complete', 4000);
}
