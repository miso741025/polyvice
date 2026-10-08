import * as THREE from 'three';
import { CITY, STORY_KEY, near, clamp, bounds, SHORE, groundAt, pushOut, colliders, nodeX, nodeZ, NX, NZ } from './grid.js';
import { HEAT } from './heat.js';
import { NEXUS_STORY } from './nexus.js';
import { BLADE_STORY } from './bladerunner.js';
import { makeLook, makeHuman, randomPedLook, Car, roam, nearestNode } from './entities.js';

// The story is written as plain async functions: each `await` waits on the game loop
// (a line of dialogue, the player reaching a marker, a fade), so a mission reads top to bottom.
// The episodes follow the plots of the show's first two; every line of dialogue is written for the game.

const TONY = 'Tony', MELFI = 'Dr. Melfi', CHRIS = 'Christopher', DEBTOR = 'Mahaffey', CARMELA = 'Carmela', AJ = 'AJ';
const JUNIOR = 'Uncle Junior', LIVIA = 'Livia', ARTIE = 'Artie', SILVIO = 'Silvio', PUSSY = 'Big Pussy', HESH = 'Hesh', KOLAR = 'Emil Kolar';
const PAULIE = 'Paulie', BRENDAN = 'Brendan', JACKIE = 'Jackie Aprile', GEORGIE = 'Georgie', MILLER = 'Mr. Miller';
const ROSALIE = 'Rosalie', MEADOW = 'Meadow', HUNTER = 'Hunter', MIKEY = 'Mikey Palmice', SHLOMO = 'Shlomo', ARIEL = 'Ariel', PHIL = 'Father Phil', CHARMAINE = 'Charmaine';
const FEBBY = 'Febby';
const MAKAZIAN = 'Vin Makazian', RANDALL = 'Randall', PRINCIPAL = 'Mrs. Gaetano', PIOCOSTA = 'Mr. Piocosta', JEREMY = 'Jeremy', ADRIANA = 'Adriana';
export const NORTH = Math.PI, SOUTH = 0, EAST = Math.PI / 2, WEST = -Math.PI / 2;

// ---------- Saving: the number of the next mission, and the money ----------

const SAVE = CITY === 'la' ? 'heat-la.save' : CITY === 'nexus' ? (STORY_KEY === '2019' ? 'br-2019.save' : 'br-nexus.save') : 'sopranos-vice.save';
const readSave = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
export const savedMission = () => readSave().mission || 0;
export function clearSave() { try { localStorage.removeItem(SAVE); } catch { /* storage unavailable: nothing to clear */ } }
// For the settings menu: every chapter with its mission titles, and a way to put the save at any one of them.
export const storyList = () => (CITY === 'la' ? HEAT : CITY === 'nexus' ? (STORY_KEY === '2019' ? BLADE_STORY : NEXUS_STORY) : EPISODES).map(e => ({ name: e.name, title: e.title, titles: e.titles }));
export function jumpTo(n, cash) { save(n, cash); }
function save(mission, cash, more = {}) { try { localStorage.setItem(SAVE, JSON.stringify({ ...readSave(), mission, cash, ...more })); } catch { /* play on without saving */ } }
// Everything beside the mission number: each character's pockets, what each mission paid, who has been introduced.
const keep = g => ({ chars: g.profilesOut?.(), earned: g.ledger || {}, met: [...(g.met || [])], stakes: g.stakes?.out(), dates: g.dates?.out() });

// ---------- Who is who ----------
// A line for each person, shown the first time they speak and kept on the People page. Written for the game.
const BIOS = {
  'Tony': 'Waste management consultant. Captain of a crew, father of two', 'Dr. Melfi': 'Psychiatrist. Thursdays at four', 'Christopher': "Tony's nephew. Wants his name in the book",
  'Carmela': "Tony's wife", 'AJ': "Tony's son. Thirteen", 'Meadow': "Tony's daughter. College next year", 'Uncle Junior': "Tony's uncle. Thinks it is his turn",
  'Livia': "Tony's mother. Nobody visits", 'Artie': 'Chef. Owns Vesuvio. A friend since school', 'Charmaine': "Artie's wife. Wants no favours", 'Silvio': "Runs the Bada Bing. Tony's right hand",
  'Big Pussy': 'Soldier. A body shop on the side', 'Paulie': 'Soldier. Takes everything personally', 'Hesh': "Lends money. Advised Tony's father", 'Emil Kolar': 'Kolar Brothers Sanitation',
  'Brendan': "Christopher's friend. Takes trucks he should leave alone", 'Jackie Aprile': 'Acting boss of the family. Ill', 'Georgie': 'Tends bar at the Bing', 'Mr. Miller': "AJ's science teacher",
  'Rosalie': "Jackie's wife", 'Hunter': "Meadow's friend", 'Mikey Palmice': "Junior's driver, and his right hand", 'Father Phil': 'Parish priest. Likes a baked ziti',
  'Febby': 'Once a made man. Now a travel agent with another name', 'Vin Makazian': 'Detective. Owes Tony money', 'Mrs. Gaetano': 'Principal of Verbum Dei', 'Adriana': "Christopher's girlfriend",
  'Jimmy Altieri': 'Captain. His card game is at the motor lodge', 'Larry Boy': 'Captain', 'Raymond Curto': 'Captain. The quiet one', 'Sammy Grigio': "Deals Jimmy's card game", 'Rusty Irish': 'Sells by the pond in the park',
  'Johnny Sack': 'Underboss, across the river', 'Agent Harris': 'F.B.I. Polite about it', 'Coach Hauser': 'Coaches the girls at Verbum Dei. A university wants him', 'Johnny Boy': "Tony's father, in 1967", 'Anthony': 'Tony, at eleven',
  'Neil': 'Takes scores. Owns nothing he would turn around for', 'Chris': 'Boxman. Married to Charlene, more or less', 'Cheritto': 'Ten years in the crew. Eats like it is a sport', 'Trejo': 'The driver',
  'Waingro': 'New. Recommended by a man somebody trusts', 'Nate': 'Sells what Neil takes, and finds the next one', 'Hanna': 'Lieutenant, Major Crimes. On his third marriage', 'Eady': 'Works in a bookstore. Draws letters',
  'Van Zant': 'Whose bonds they were', 'Drucker': 'Sergeant, Major Crimes', 'Casals': 'Detective, Major Crimes', 'Justine': "Hanna's wife", 'Lauren': "Justine's daughter", 'Charlene': "Chris's wife",
  'Kelso': 'Listens to what banks say to each other', 'Breedan': 'Out eight months. Works a grill',
};
const introduce = (g, who) => {
  const name = who.replace(/ \((phone|radio)\)$/, '');
  if (!BIOS[name] || (g.met ??= new Set()).has(name)) return;
  g.met.add(name);
  g.hud.intro?.(name, BIOS[name]);
};
// Everybody met so far, for the People page.
export const people = g => [...(g.met || [])].map(name => ({ name, role: BIOS[name] }));

// ---------- Building blocks for scenes ----------

export async function say(g, who, text, dur = Math.max(2.4, text.length * 0.065)) {
  if (who) introduce(g, who);
  g.hud.subtitle(who, text);
  const t0 = g.time;
  await g.until(() => g.time - t0 >= dur || (g.time - t0 > 0.3 && g.consume('Enter')));
  g.hud.subtitle();
}

// Before a scene plays, a look through the lens: people standing in each other are moved apart, and if
// someone hides someone else from a fixed camera, the camera is walked round (or lifted) until everyone shows.
function direct(g, cast, withPlayer) {
  const p = g.player, all = cast.map(a => ({ a, pos: a.group.position, seated: a.state === 'sit' || a.state === 'down' }));
  if (withPlayer && !p.hidden && !p.car) all.push({ a: p, pos: p.pos, seated: p.pose === 'sit', player: true });
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j], dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz);
    if (d >= 0.72 || (A.seated && B.seated)) continue;
    const move = B.seated ? A : B, sgn = B.seated ? -1 : 1, nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
    move.pos.x += sgn * nx * (0.74 - d); move.pos.z += sgn * nz * (0.74 - d);
    if (!move.player) pushOut(move.pos, 0.3);
  }
  const fixed = g.cam.fixed;
  if (!fixed) { audit(g, all, 0); return; }
  const hidden = (cx, cy, cz) => { // how many people are behind somebody else, seen from there
    let n = 0;
    for (const T of all) for (const O of all) {
      if (O === T) continue;
      const tx = T.pos.x - cx, tz = T.pos.z - cz, tl = Math.hypot(tx, tz) || 1, ox = O.pos.x - cx, oz = O.pos.z - cz;
      const along = (ox * tx + oz * tz) / tl, off = Math.abs(ox * tz - oz * tx) / tl;
      if (along > 0.3 && along < tl - 0.25 && off < 0.42 && cy < 2.4) { n++; break; }
    }
    return n;
  };
  const c0 = fixed.pos, L = fixed.look, r = Math.hypot(c0.x - L.x, c0.z - L.z), a0 = Math.atan2(c0.x - L.x, c0.z - L.z);
  if (!hidden(c0.x, c0.y, c0.z)) { audit(g, all, 0); return; }
  let best = null;
  for (const lift of [0, 0.5, 1.1]) for (const turn of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.4, -1.4]) {
    if (!lift && !turn) continue;
    const x = L.x + Math.sin(a0 + turn) * r, z = L.z + Math.cos(a0 + turn) * r, y = c0.y + lift;
    if (blocked(x, z) || all.some(o => Math.hypot(o.pos.x - x, o.pos.z - z) < 0.9)) continue;
    const score = hidden(x, y, z) * 10 + Math.abs(turn) + lift * 1.5;
    if (!best || score < best.score) best = { x, y, z, score };
  }
  if (best && best.score < hidden(c0.x, c0.y, c0.z) * 10) fixed.pos.set(best.x, best.y, best.z);
  audit(g, all, hidden(fixed.pos.x, fixed.pos.y, fixed.pos.z));
}
// A note of anything still wrong with a scene's staging, for whoever is checking them (window.game.audit).
function audit(g, all, hiddenCount) {
  const issues = [];
  if (hiddenCount) issues.push(`${hiddenCount} hidden from the camera`);
  for (let i = 0; i < all.length; i++) {
    const A = all[i];
    if (!A.seated && !A.player && blocked(A.pos.x, A.pos.z) && !colliders.some(c => c.thin && Math.abs(A.pos.x - (c.minX + c.maxX) / 2) < 1)) issues.push('someone stands inside something');
    if (!A.seated && !A.player && Math.abs(A.pos.y - groundAt(A.pos.x, A.pos.z)) > 0.07) issues.push(`feet ${(A.pos.y - groundAt(A.pos.x, A.pos.z)).toFixed(2)} off the ground`);
    for (let j = i + 1; j < all.length; j++) if (Math.hypot(all[j].pos.x - A.pos.x, all[j].pos.z - A.pos.z) < 0.55 && !(A.seated && all[j].seated)) issues.push('two people overlap');
  }
  const f = g.cam.fixed;
  if (f && blocked(f.pos.x, f.pos.z) && f.pos.y < 3) issues.push('camera inside a wall');
  if (issues.length) (g.audit ??= []).push(`${g.progress?.mission || '?'}: ${[...new Set(issues)].join('; ')}`);
}

// A run of dialogue: [speaker, text, who gestures]. The third entry is an actor, or g.player for the player.
// The speaker gestures (talking, pointing, calming hands, or talking from a chair), the others turn to face
// them, and a fixed camera eases toward whoever is speaking.
export async function talk(g, lines) {
  const p = g.player, cast = [...new Set(lines.map(l => l[2]).filter(a => a && a !== p))];
  const fixed = g.cam.fixed, look0 = fixed && fixed.look.clone();
  let target = null, talking = true;
  if (fixed) g.updaters.push(dt => { if (!talking || g.cam.fixed !== fixed) return false; if (target) fixed.look.lerp(target, 1 - Math.exp(-2.5 * dt)); return true; });
  const posOf = a => (a === p ? p.pos : a.group.position);
  direct(g, cast, lines.some(l => l[2] === p));
  const standing = a => ['idle', 'talk', 'guard'].includes(a.state) && !a.busy;
  const free = a => (standing(a) || a.state === 'sit') && !a.topOnce;
  for (const [who, text, a] of lines) {
    const was = a && a !== p ? a.state : null;
    const loud = /!/.test(text), ask = /\?/.test(text), r = Math.random();
    // The hands: a finger for a raised voice, open palms for a question, a beating hand otherwise; sometimes just the mouth.
    const gesture = text.length < 14 ? null : loud ? (r < 0.5 ? 'say3' : 'say1') : ask ? (r < 0.55 ? 'say2' : null) : r < 0.4 ? 'say1' : r < 0.6 ? 'say2' : null;
    if (a) {
      const at = posOf(a);
      if (fixed) target = look0.clone().lerp(new THREE.Vector3(at.x, (at.y ?? groundAt(at.x, at.z)) + 1.45, at.z), 0.4);
      for (const o of cast) if (o !== a && standing(o) && near(o.group.position, at, 7)) o.group.rotation.y = toward(o.group.position, at);
    }
    let talked = false;
    const pose0 = p.pose; // a player who is seated stays seated and talks with the hands
    if (a === p) { if (gesture || pose0) p.topPose = gesture || 'say1'; else p.pose = 'talk'; }
    else if (a && free(a)) {
      if (gesture) a.layer(gesture);
      else if (standing(a)) { a.set('talk'); talked = true; }
    }
    await say(g, who, text);
    if (a === p) { p.pose = pose0; p.topPose = null; }
    else if (a) { if (!a.topOnce) a.layer(null); if (talked && a.state === 'talk') a.set(was === 'talk' ? 'talk' : 'idle'); }
    // Someone listening nods, now and then.
    if (!ask && Math.random() < 0.3) { const others = cast.filter(c => c !== a && free(c)), o = others[Math.floor(Math.random() * others.length)]; if (o) o.layer(/^No\b|n't/.test(text) && Math.random() < 0.3 ? 'no' : 'nod', { once: true }); }
  }
  talking = false;
}
// A telephone call. It rings, he takes the phone out and holds it to his ear (walking or standing; in a car it
// cannot be seen), and puts it away a few seconds after the last thing said.
export const phone = (g, who, text) => {
  const p = g.player;
  if (!g.ringing) { g.ringing = true; g.sfx?.phone(); g.wait(1.5).then(() => { g.ringing = false; }).catch(() => {}); }
  if (!p.car && !p.hidden) {
    if (!p.onPhone) {
      const who0 = p.human;
      p.onPhone = true; p.topPose = 'phone'; who0.arm('phone');
      g.updaters.push(() => {
        if (p.human === who0 && !p.car && !p.hidden && g.time < g.hangUp) { if (!p.topPose) p.topPose = 'phone'; return true; }
        p.onPhone = false;
        if (p.topPose === 'phone') p.topPose = null;
        who0.arm(false);
        if (p.human === who0) g.setWeapon(p.weapon, true); // whatever he was holding, back in his hand
        return false;
      });
    }
    g.hangUp = g.time + Math.max(2.4, text.length * 0.065) + 3.6;
  }
  return say(g, who + ' (phone)', text);
};

export async function fade(g, to, seconds) {
  g.hud.fade(to, seconds);
  await g.wait(seconds + 0.05);
}

// Fade out, rearrange the world, fade back in.
export async function cut(g, arrange, seconds = 0.8) {
  await fade(g, 1, seconds);
  await arrange();
  await fade(g, 0, seconds);
  g.setCheckpoint?.();
}

export async function titleCard(g, title, sub) {
  g.hud.card(title, sub);
  await g.wait(3.2);
  g.hud.card();
}

// A mission is done. It always pays: `money` if the mission names a sum, otherwise a fee that grows as the story goes on.
// What it paid is written in the ledger (Settings > Earnings), so it can be looked up after the banner has gone.
export async function passed(g, reward, money = 0) {
  const pr = g.progress || {}, n = pr.n || 1, pay = money || Math.round((700 + n * 110) / 50) * 50;
  const sum = '$' + pay.toLocaleString('en-US'), label = /^Respect/.test(reward) || /^\$/.test(reward) ? sum : `${reward}  ·  ${sum}`;
  (g.ledger ??= {})[n] = { t: pr.mission || '', m: pay };
  g.hud.passed(label, pr.mission, Object.values(g.ledger).reduce((a, r) => a + r.m, 0));
  g.sfx?.passed();
  g.addMoney(pay);
  await g.wait(6);
  g.hud.passed();
}

// Say plainly whose shoes the player is in, whenever it is not the hero's.
export async function playing(g, name, role) { g.hud.card(name, role); await g.wait(2.8); g.hud.card(); }
// A lens on somebody: the view narrows on them, and a click (or E, or Enter) takes the picture.
export async function photograph(g, who, name, from, { fov: narrow = 14, lift = 1.45, height = 1.7 } = {}) {
  const at = who.group.position, fov = g.camera.fov;
  g.cam.fixed = { pos: new THREE.Vector3(from.x, groundAt(from.x, from.z) + height, from.z), look: new THREE.Vector3(at.x, at.y + lift, at.z) };
  g.camera.fov = narrow; g.camera.updateProjectionMatrix();
  g.hud.objective(`<b>Photograph</b> ${name}: click, or press E.`);
  await g.until(() => !g.keys.Mouse0 && !g.keys.KeyE);
  await g.until(() => g.keys.Mouse0 || g.keys.KeyE || g.consume('Enter'));
  g.sfx?.click(); g.hud.flash('#ffffff', 0.18);
  g.hud.objective();
  await g.wait(0.6);
  g.camera.fov = fov; g.camera.updateProjectionMatrix();
}

// Put a character in the world for the length of a scene.
export function actor(g, look, at, heading = 0, state = 'idle') {
  const a = makeLook(look);
  a.group.position.set(at.x, at.y ?? groundAt(at.x, at.z), at.z); // interior sets give their own height
  a.group.rotation.y = heading;
  a.set(state);
  a.group.userData.human = a; // so a set can find the people standing on it
  g.track(a.group);
  return a;
}
export const dismiss = (g, ...actors) => { for (const a of actors) { g.untrack(a.group); g.removeNpc?.(a); } };
export const spot = (at, dx = 0, dz = 0) => ({ x: at.x + dx, z: at.z + dz });
export const toward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// Stand the player somewhere, out of any car. The car, if `park` is given, is left there.
// Out of whatever room he was standing in: a scene is about to put him somewhere else.
export function outdoors(g) {
  const p = g.player;
  if (!p.inside) return;
  for (const h of p.inside.hide || []) h.group.visible = true;
  p.inside = null;
}
// Where he is, for the purpose of "is he already there": the street door of the room he is in, if he is in one.
export const whereabouts = g => g.player.inside?.outside || g.player.pos;
export function place(g, at, heading, park) {
  const p = g.player, car = p.car;
  if (!(at.x > 2500)) outdoors(g);                       // (the rooms are out past x = 2600: a spot in one of them is not the street)
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
export function approach(g, who, gap = 1.7) {
  const p = g.player, a = who.group.position;
  let dx = p.pos.x - a.x, dz = p.pos.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) { dx = -1; dz = 0; } else { dx /= d; dz /= d; }
  p.pos.set(a.x + dx * gap, 0, a.z + dz * gap);
  p.heading = toward(p.pos, a);
  who.group.rotation.y = toward(a, p.pos);
}
// A fixed camera at `from`, looking at `to` (both { x, z }), at the given heights above the ground.
export function shot(g, from, to, height = 1.7, lift = 1.3) {
  g.cam.fixed = { pos: new THREE.Vector3(from.x, groundAt(from.x, from.z) + height, from.z), look: new THREE.Vector3(to.x, groundAt(to.x, to.z) + lift, to.z) };
}

export const blocked = (x, z) => colliders.some(c => !c.thin && x > c.minX - 0.6 && x < c.maxX + 0.6 && z > c.minZ - 0.6 && z < c.maxZ + 0.6);
// Hold the camera on two people (or points) from the side, on whichever side is clear of walls.
export function frame(g, a, b, { dist = 4.8, height = 1.7, lift = 1.3, side = 1 } = {}) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  let px = mx - dz / l * dist * side, pz = mz + dx / l * dist * side;
  if (blocked(px, pz)) { px = mx + dz / l * dist * side; pz = mz - dx / l * dist * side; }
  const y = groundAt(mx, mz);
  g.cam.fixed = { pos: new THREE.Vector3(px, y + height, pz), look: new THREE.Vector3(mx, y + lift, mz) };
}

// Wait until the player reaches a spot. `how` may be 'car' (must drive there) or 'foot' (must walk).
export async function reach(g, at, text, { r = 6, how, color } = {}) {
  { // He took the job standing at a yellow marker. If the first place it sends him is where he already is, he is not sent.
    const hub = g.hubAt, pl = g.player; g.hubAt = null;
    if (hub && near(hub, at, 45) && near(whereabouts(g), at, 55) && !(how === 'foot' && pl.car)) { // 45 m: the marker at home is at the door, and "drive home" means the road outside
      let there = true;
      if (how === 'car' && !pl.car) { // it wants him at the wheel: his car is at the kerb
        const car = g.tonyCar;
        if (car && !car.wreck && !pl.inside) { car.pos.set(at.x, 0, at.z); car.heading = at.h ?? car.heading; car.speed = 0; car.sync?.(); g.enterCar(car); } else there = false;
      }
      if (there) { g.setCheckpoint?.(); return; }
    }
  }
  g.hud.objective(text);
  const m = color ? g.addMarker(at.x, at.z, r, color) : g.addMarker(at.x, at.z, r), p = g.player;
  if (color) m.color = '#' + color.toString(16).padStart(6, '0');
  if (!p.locked) g.setCheckpoint?.();   // killed on the way: back to where the errand was given
  await g.until(() => near(p.pos, m, r + 0.4) && (how === 'car' ? p.car && Math.abs(p.car.speed) < 6 : how === 'foot' ? !p.car : true));
  g.removeMarker(m);
  g.hud.objective();
  g.setCheckpoint?.();                  // and from here on, back to here
}
// Get into one particular car: it is marked on the radar and has an arrow over it until he does.
export async function wantCar(g, car, text) {
  const p = g.player;
  g.hud.objective(text);
  if (p.car === car) { g.hud.objective(); return; }
  const blip = { x: car.pos.x, z: car.pos.z, color: '#49e0d0' };
  g.blips.push(blip);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.75, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x49e0d0, depthTest: false, transparent: true, opacity: 0.95 }));
  arrow.renderOrder = 6;
  g.track(arrow);
  let on = true;
  g.updaters.push(() => {
    if (!on) return false;
    blip.x = car.pos.x; blip.z = car.pos.z;
    const k = 1 + Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) * 0.05;
    arrow.scale.setScalar(k); arrow.position.set(car.pos.x, groundAt(car.pos.x, car.pos.z) + 2.6 + k * 0.4 + Math.sin(g.time * 5) * 0.12, car.pos.z); arrow.rotation.y = g.time * 2;
    return true;
  });
  try { await g.until(() => p.car === car); }
  finally { on = false; g.untrack(arrow); const i = g.blips.indexOf(blip); if (i >= 0) g.blips.splice(i, 1); }
  g.hud.objective();
}

// Someone who walks with the player (or behind `lead`, another follower) and rides along in the car.
export function follower(g, human, { lead, gap = 1.6, pace = 3.6, runs = true } = {}) {
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
    if (d > 60 || (p.inside && d > 13)) { f.pos.set(target.x - 1.2, 0, target.z - 1.2); pushOut(f.pos, 0.4); } // the player went through a door (or took a lift, indoors): so did they
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
export async function punch(g, from, to, down = false) {
  const swing = from === g.player ? from.human : from;
  // Step in first: a punch thrown from across the room hits nothing.
  const fp = from === g.player ? from.pos : from.group.position, tp = to.group.position, dx = fp.x - tp.x, dz = fp.z - tp.z, d = Math.hypot(dx, dz);
  if (d > 1.15 && swing.state !== 'sit') {
    fp.x = tp.x + dx / d * 1.05; fp.z = tp.z + dz / d * 1.05;
    if (from === g.player) from.heading = Math.atan2(-dx, -dz); else from.group.rotation.y = Math.atan2(-dx, -dz);
    await g.wait(0.15);
  }
  swing.play(Math.random() < 0.5 ? 'cross' : 'jab', 'idle', 1.3);
  await g.wait(0.3);
  if (down) { to.after = null; to.set('down'); if (to.floorY !== undefined) to.group.position.y = to.floorY; }
  else if (to.state === 'sit') to.layer('nod', { once: true, speed: 0.6 }); // seated: the head snaps, the rest of him stays in the chair
  else to.play('hitHead', 'idle');
  await g.wait(0.9);
}
// Someone to be run down: a blip on the radar and the map, and an arrow over his head that shows through walls,
// both following him until `stop()` is called.
export function quarry(g, npc) {
  const blip = { x: npc.pos.x, z: npc.pos.z, color: '#ffd23f' };
  g.blips.push(blip);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true, opacity: 0.95 }));
  arrow.renderOrder = 6;
  g.track(arrow);
  let on = true;
  g.updaters.push(() => {
    if (!on) return false;
    blip.x = npc.pos.x; blip.z = npc.pos.z;
    const far = Math.hypot(npc.pos.x - g.player.pos.x, npc.pos.z - g.player.pos.z), k = 1 + far * 0.07; // bigger the farther he is, so it can be seen across a block
    arrow.scale.setScalar(k);
    arrow.position.set(npc.pos.x, npc.pos.y + 2.3 + k * 0.4 + Math.sin(g.time * 5) * 0.12, npc.pos.z); arrow.rotation.y = g.time * 2;
    return true;
  });
  return () => { on = false; g.untrack(arrow); const i = g.blips.indexOf(blip); if (i >= 0) g.blips.splice(i, 1); };
}
// Only fists for a while: for beatings that must not end in a shooting.
export function fistsOnly(g, on) { g.fistsOnly(on); }
// Wait until every one of these fighters is down.
export const allDown = (g, npcs) => g.until(() => npcs.every(n => n.dead || n.human.state === 'down'));

// A session with Dr. Melfi in the interior set. Leaves the screen black; the caller sets up what follows.
export async function therapy(g, lines) {
  const { office } = g.places, p = g.player, night = g.night, { tony, melfi } = office.cast, T = tony.group.position, M = melfi.group.position;
  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) p.car.speed = 0;
  p.hidden = true;
  g.setNight(0);
  tony.group.visible = melfi.group.visible = true;
  // Three ways of looking at it: the two of them across the rug, and each over the other's shoulder.
  const v = (x, y, z) => new THREE.Vector3(x, T.y + y, z), cx = (T.x + M.x) / 2;
  const wide = { pos: office.cam.clone(), look: office.look.clone() };
  const onTony = { pos: v(M.x - 0.5, 1.42, M.z + 1.25), look: v(T.x, 1.12, T.z) }, onMelfi = { pos: v(T.x + 0.5, 1.42, T.z + 1.25), look: v(M.x, 1.12, M.z) };
  const low = { pos: v(cx + 0.2, 0.85, T.z + 3.1), look: v(cx, 1, T.z) };
  g.cam.fixed = wide;
  await fade(g, 0, 1);
  await g.wait(0.8);
  let last = null, n = 0;
  for (const [who, text] of lines) {
    const a = who === TONY ? tony : who === MELFI ? melfi : null, other = a === tony ? melfi : tony;
    n++;
    // A new speaker is a new shot; a long silence, or a line of narration, goes back to the room.
    if (!a) g.cam.fixed = n % 2 ? wide : low;
    else if (a !== last) g.cam.fixed = a === tony ? onTony : onMelfi;
    else if (text.length > 110) g.cam.fixed = wide;
    last = a;
    if (a) {
      const loud = /!/.test(text), ask = /\?/.test(text), r = Math.random();
      const gesture = text.length < 16 ? null : loud ? 'say3' : ask ? (r < 0.6 ? 'say2' : 'say1') : r < 0.55 ? 'say1' : r < 0.8 ? 'say2' : null;
      if (gesture) a.layer(gesture); else if (/^\.\.\./.test(text)) a.layer('no', { once: true, speed: 0.5 });
      other.layer(r < 0.5 ? 'listen' : null);
    }
    await say(g, who, text);
    if (a) { a.layer(null); other.layer(null); if (!/\?$/.test(text) && Math.random() < 0.4) other.layer('nod', { once: true }); }
  }
  g.cam.fixed = wide;
  await g.wait(0.6);
  await fade(g, 1, 1);
  tony.layer(null); melfi.layer(null);
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
export function explode(g, at) {
  g.sfx?.explosion();
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
export function smoke(g, at, height = 4) {
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
export function careful(g, label, failText, reset) {
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

// Go into the Bing for a scene: the player reaches the car park, is taken through the door, and has to find
// whoever is waiting inside. `setup(club)` places them (the screen is black); `club.door` is a spot on the
// floor by the bar that stands in for the door the outdoor scenes were written around.
async function intoBing(g, text, setup, find = 'They are <b>inside</b>, by the bar.') {
  const { bing, bingRoom } = g.places, p = g.player;
  await reach(g, bing.door, text, { r: 4 });
  p.locked = true;
  await fade(g, 1, 0.5);
  if (p.car) { const car = p.car; g.leaveCar(); car.speed = 0; car.pos.set(bing.park.x, 0, bing.park.z); car.heading = bing.park.h; }
  g.sfx?.door();
  const club = { door: { x: bingRoom.inside.x - 4.2, y: bingRoom.y, z: bingRoom.inside.z - 5.4 }, park: bing.park };
  p.inside = g.places.doors.find(d => d.inside === bingRoom.inside);
  p.pos.set(bingRoom.inside.x, 0, bingRoom.inside.z); p.heading = g.cam.yaw = bingRoom.inside.h;
  g.cam.fixed = null;
  const before = new Set(g.tracked);
  setup(club);
  // Whoever is waiting sits at the bar, turned on a stool to face the room; a man with a gun out stays on his feet.
  let n = 0;
  for (const obj of g.tracked) {
    const who = obj.userData?.human;
    if (before.has(obj) || !who || !['idle', 'talk'].includes(who.state)) continue;
    const st = bingRoom.stools[n++];
    if (!st) break;
    who.group.position.set(st.x, st.y, st.z); who.group.rotation.y = SOUTH; who.floorY = bingRoom.y; who.set('sit');
  }
  await fade(g, 0, 0.5);
  p.locked = false;
  await reach(g, club.door, find, { r: 2.6, how: 'foot' });
  p.locked = true;
  return club;
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

// A walk from here to there, through these points, at this pace; it resolves when he has arrived.
export function walkTo(g, who, pts, pace = 1.3) {
  return new Promise((resolve, reject) => {
    const pos = who.group.position, mine = who.walking = {}; let k = 0, last = g.time;   // a new walk (or `who.walking = null`) ends the one before it
    who.set('walk', pace / 1.4);
    g.until(() => {
      if (who.walking !== mine) return true;
      const to = pts[k], dx = to.x - pos.x, dz = to.z - pos.z, d = Math.hypot(dx, dz), dt = Math.min(0.1, g.time - last);
      last = g.time;
      if (d < 0.12) { k++; return k >= pts.length; }
      const step = Math.min(pace * dt, d);
      pos.x += dx / d * step; pos.z += dz / d * step; who.group.rotation.y = Math.atan2(dx, dz);
      return false;
    }).then(() => { if (who.walking === mine) { who.walking = null; who.set('idle'); } resolve(); }, reject);
  });
}
// The ways of looking at the bed in Jackie's room: the room from the door, the man in the bed, whoever is standing over
// him, his wife in her chair, and the door from the bed.
const wardCams = g => {
  const w = g.places.wardRoom, b = w.bed, y = b.y - 0.95, v = (x, yy, z) => new THREE.Vector3(x, y + yy, z);
  return { wide: w.cam, jackie: { pos: v(b.x + 1.6, 1.35, b.z + 1.5), look: v(b.x - 0.7, 1, b.z) }, tony: { pos: v(b.x - 1.6, 1.2, b.z - 0.1), look: v(b.x + 0.5, 1.5, b.z + 1.5) },
    rosalie: { pos: v(b.x + 1.4, 1.4, b.z + 0.7), look: v(w.chair.x, 1.15, w.chair.z) }, door: { pos: v(b.x + 0.4, 1.7, b.z - 1.6), look: v(w.inside.x, 1.25, w.inside.z + 0.6) }, floor: y };
};
// Up to Jackie's room on foot: in at the front of the hospital, the desk (if `ask` gives the exchange to have there), the
// lift, the corridor, his door. It ends with the player standing in the room, ready for the scene to begin.
async function intoWard(g, ask, text = 'Go <b>in</b>.') {
  const p = g.player, { wardRoom } = g.places, LOBBY = g.places.rooms.HOSPITAL, HALL = g.places.rooms.WARDHALL, door = g.places.doors.find(d => d.inside === LOBBY.inside);
  const inHall = () => Math.abs(p.pos.z - HALL.Z) < 4, inHis = () => Math.abs(p.pos.z - (wardRoom.inside.z - 3.2)) < 5.5;
  const hop = async (words, from, to, done) => { // a marker at a lift or a door; F there does it too
    g.hud.objective(words);
    const m = g.addMarker(from.x, from.z, 1.3);
    await g.until(() => near(p.pos, from, 1.4) || done());
    g.removeMarker(m); g.hud.objective();
    if (!done()) { p.locked = true; await fade(g, 1, 0.35); g.sfx?.door(); p.pos.set(to.x, 0, to.z); p.heading = g.cam.yaw = to.h; await fade(g, 0, 0.35); p.locked = false; }
  };
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  await reach(g, door.outside, text, { r: 1.8, how: 'foot' });
  await enter(g, LOBBY);
  if (ask) {
    await reach(g, LOBBY.desk, 'Find the <b>information desk</b>.', { r: 1.4, how: 'foot' });
    p.locked = true; p.heading = NORTH;
    g.cam.fixed = inRoom(LOBBY, [3.2, 0.8], [-0.9, -3.2], 1.6, 1.3).cam;
    await talk(g, ask(LOBBY.clerk));
    g.cam.fixed = null; p.locked = false;
  }
  await hop('Find the <b>lifts</b>: the blue line leads to them.', LOBBY.lifts, HALL.lift, () => inHall() || inHis());
  if (!inHis()) await hop('Find <b>room 412</b>, at the far end of the corridor.', HALL.his, { x: wardRoom.inside.x, z: wardRoom.inside.z + 0.6, h: Math.PI }, inHis);
}
// Down again: he is standing by the lifts in the lobby (the screen should be black), and walks out when he likes.
function downToLobby(g) {
  const p = g.player, LOBBY = g.places.rooms.HOSPITAL;
  p.inside = g.places.doors.find(d => d.inside === LOBBY.inside);
  p.pos.set(LOBBY.lifts.x, 0, LOBBY.lifts.z + 0.6); p.heading = g.cam.yaw = SOUTH; g.cam.pitch = 0.2;
  g.cam.fixed = null;
  return LOBBY;
}
// Or straight out to the pavement, for a scene that is waiting there.
function outOfHospital(g) {
  const p = g.player, door = p.inside;
  for (const h of door?.hide || []) h.group.visible = true;
  p.inside = null;
}
// ----- An evening out (a side job, offered at the pink ring between missions). She is waiting at her door; he takes
// her somewhere, they walk and talk, he drives her home. It costs what an evening costs, and he feels better for it.
// `k` is how many evenings there have been: the place and the talk go round. Every line is written for the game. -----
const IRINA = 'Irina';
export async function evening(g, her, home, k) {
  const p = g.player, { pier, rideland, cafe } = g.places, COST = 150, VIOLET = 0x9b6bff, tag = '<span style="color:#b79bff">Side job · Irina</span> &nbsp; ';
  const plans = [
    { name: 'the <b>pier</b>', drive: pier.start, walk: pier.end, card: 'The pier', lines: [
      [IRINA, 'When I was small I thought the sea was the same sea everywhere. One sea. You could walk in at home and walk out here.', her],
      [TONY, 'You would have been walking a long time.', p],
      [IRINA, 'I had time. Now I have a man who looks at his watch on a pier.', her],
      [TONY, 'I am not looking at it. ...I am not looking at it now.', p]] },
    { name: '<b>Rideland</b>', drive: rideland.kerb, walk: spot(rideland.wheel, -6, -4), card: 'Rideland', lines: [
      [IRINA, 'You will not go on the wheel. A man like you, and the wheel is too much.', her],
      [TONY, 'I went on it when I was nine. It stopped at the top for twenty minutes. I have been on it.', p],
      [IRINA, 'Then win me the bear. The big one, with the stupid face.', her],
      [TONY, 'The big one is nailed down. I know the man who nails it.', p]] },
    { name: '<b>Bean Scene</b>', drive: cafe.kerb, walk: spot(cafe.door, 0, 1.2), card: 'Bean Scene', lines: [
      [IRINA, 'Four dollars for this. In my country four dollars is the coffee, the cup, and the woman who washes it.', her],
      [TONY, 'You sound like Paulie.', p],
      [IRINA, 'Who is Paulie? You never tell me who anybody is.', her],
      [TONY, 'That is the nicest thing I do for you.', p]] },
  ], plan = plans[k % plans.length];
  let f = null;
  p.locked = true;
  her.group.rotation.y = toward(her.group.position, p.pos); p.heading = toward(p.pos, her.group.position);
  frame(g, p.pos, her.group.position, { dist: 4 });
  try {
    if (g.cash < COST) {
      await talk(g, [[IRINA, 'You come to my door with empty pockets? Go and be a big man somewhere first. Then come.', her]]);
      return false;
    }
    await talk(g, [
      [IRINA, ['You said seven. It is a quarter to eight. I counted.', 'So he remembers where I live.', 'I put the dress on an hour ago. Look at it, at least.'][k % 3], her],
      [TONY, ['I am here now. Where do you want to go?', 'I remember. Get your coat.', 'I am looking. Come on, I have the car.'][k % 3], p],
    ]);
    g.cam.fixed = null; p.locked = false;
    g.addMoney(-COST);
    f = follower(g, her, { pace: 3.2 });
    g.hud.card('An evening out', plan.card); g.wait(3).then(() => g.hud.card()).catch(() => {});
    if (!p.car) { g.hud.objective(tag + 'Get in the <b>car</b> with her.'); await g.until(() => p.car); }
    await reach(g, plan.drive, `${tag}Take her to ${plan.name}.`, { how: 'car', r: 7, color: VIOLET });
    await reach(g, plan.walk, tag + 'Walk with her.', { r: 2.6, how: 'foot', color: VIOLET });
    p.locked = true;
    f.stay = true;
    const side = spot(p.pos, 1.3, 0.3);
    her.group.position.set(side.x, groundAt(side.x, side.z), side.z); her.group.rotation.y = toward(side, p.pos); her.set('idle'); f.pos.set(side.x, 0, side.z);
    p.heading = toward(p.pos, side);
    frame(g, p.pos, side, { dist: 4.2, side: -1 });
    await talk(g, plan.lines);
    g.cam.fixed = null; p.locked = false; f.stay = false;
    await reach(g, home, tag + 'Drive her <b>home</b>.', { how: 'car', r: 7, color: VIOLET });
    p.locked = true;
    if (p.car) { p.car.speed = 0; g.leaveCar(); }
    await g.wait(0.8);
    frame(g, p.pos, her.group.position, { dist: 4 });
    await talk(g, [
      [IRINA, ['Next time, seven means seven.', 'It was a good night. Do not look so surprised.', 'Call me. Before the week is out, not after.'][k % 3], her],
      [TONY, ['Seven.', 'I am not surprised. I am tired.', 'I will call.'][k % 3], p],
    ]);
    p.health = 100; g.hud.health(100);
    await say(g, '', 'For an hour or two nobody had asked him for anything. He felt it in his shoulders all the way home.', 4.2);
    return true;
  } finally { if (f) f.on = false; g.cam.fixed = null; p.locked = false; g.hud.objective(); g.hud.card(); }
}

// To the office on his own wheels and in at the door: a session is somewhere he goes, not somewhere he finds himself.
async function toMelfi(g, text = "Thursday. Drive to <b>Dr. Melfi's office</b>.") {
  const { melfi } = g.places, p = g.player, office = g.places.doors.find(d => d.name === "Dr. Melfi's office");
  p.locked = false; g.cam.fixed = null;
  await reach(g, melfi.kerb, text);
  await reach(g, office.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
}
// After a scene in the Bing he is still in the Bing: on his feet by the crew's table, the car outside where he left it.
function stayInBing(g, park) {
  const { bingRoom } = g.places, p = g.player;
  if (p.car) { const car = p.car; g.leaveCar(); car.speed = 0; if (park) { car.pos.set(park.x, 0, park.z); car.heading = park.h ?? car.heading; } }
  p.inside = g.places.doors.find(d => d.inside === bingRoom.inside);
  p.pos.set(bingRoom.table.x + 2.9, 0, bingRoom.table.z - 1.3); p.heading = g.cam.yaw = WEST; g.cam.pitch = 0.2;
  g.cam.fixed = null;
}
// A scene in a room other than the Bing (the hospital ward): the room gives its own camera.
export async function roomScene(g, room, arrange, play, { night: dark = 0 } = {}) {
  const p = g.player, night = g.night;
  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) p.car.speed = 0;
  p.hidden = true;
  g.setNight(dark);
  for (const a of room.ambient || []) a.group.visible = false; // whoever lives there steps out for the scene
  const cast = arrange(room);
  g.cam.fixed = room.cam;
  await fade(g, 0, 1);
  try { await play(cast); } finally { for (const a of room.ambient || []) a.group.visible = true; }
  await fade(g, 1, 1);
  dismiss(g, ...Object.values(cast));
  g.cam.fixed = null;
  p.hidden = false;
  g.setNight(night);
}
// Through a door on foot, and free to walk about inside: the room's own people are there, and whoever the mission adds.
export async function enter(g, room) {
  const p = g.player;
  p.locked = true;
  await fade(g, 1, 0.45);
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  g.sfx?.door();
  const door = g.places.doors.filter(d => d.inside === room.inside).sort((a, b) => Math.hypot(a.outside.x - p.pos.x, a.outside.z - p.pos.z) - Math.hypot(b.outside.x - p.pos.x, b.outside.z - p.pos.z))[0]
    || { inside: room.inside, outside: { x: p.pos.x, z: p.pos.z, h: p.heading + Math.PI }, name: 'the house' }; // a house of somebody's own: its door is wherever he came in // several shops share a room: the door he is standing at
  for (const h of door.hide || []) h.group.visible = false;
  p.inside = door;
  p.pos.set(room.inside.x, 0, room.inside.z); p.heading = g.cam.yaw = room.inside.h;
  g.cam.fixed = null;
  await fade(g, 0, 0.45);
  p.locked = false;
  return door;
}
// And out again, onto the step outside (unless the player has already walked out by himself).
export async function leave(g) {
  const p = g.player, door = p.inside;
  if (!door) return;
  p.locked = true;
  await fade(g, 1, 0.45);
  g.sfx?.door();
  for (const h of door.hide || []) h.group.visible = true;
  p.inside = null;
  p.pos.set(door.outside.x, 0, door.outside.z); p.heading = g.cam.yaw = door.outside.h;
  await fade(g, 0, 0.45);
  p.locked = false;
}
// One of the rooms behind the shop doors, with a camera: `from` and `to` are [x, z] in room coordinates.
export function inRoom(q, from, to, height = 1.6, lift = 1.1) {
  return { ...q, cam: { pos: new THREE.Vector3(q.X + from[0], q.Y + height, q.Z + from[1]), look: new THREE.Vector3(q.X + to[0], q.Y + lift, q.Z + to[1]) } };
}
// A spot inside such a room, with the room's floor height.
export const roomSpot = (q, x, z) => ({ x: q.X + x, y: q.Y, z: q.Z + z });
// Someone lying in a bed: the fall of the death clip, played through to its last frame.
export function lying(g, look, at, heading) {
  const a = actor(g, look, at, heading, 'down');
  a.mixer.update(4);
  return a;
}

// Put Tony back at home in his own body, by day, with his car in the drive. The screen should be black.
function homeAsTony(g, tony) {
  const { home } = g.places, p = g.player;
  if (p.car) g.leaveCar();
  outdoors(g);
  if (tony && p.human !== tony) { const other = p.human; g.setPlayer(tony); g.scene.remove(other.group); }
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.setNight(0);
  p.pos.set(home.wake.x, 0, home.wake.z);
  g.cam.fixed = null; g.cam.yaw = p.heading = 0;
}

// ========== Episode Six: Pax Soprana ==========
// Junior is boss, and squeezes. Tony has to make him generous without being seen to. Follows the plot of the
// sixth episode; every line is written for the game.

const JIMMY = 'Jimmy Altieri', LARRY = 'Larry Boy', RAYMOND = 'Raymond Curto', SAMMY = 'Sammy Grigio', RUSTY = 'Rusty Irish', JOHNNY = 'Johnny Sack';
// Step into somebody else's shoes for a mission.
function asOther(g, look, at, heading) {
  const p = g.player;
  if (p.car) g.leaveCar();
  const who = makeLook(look);
  g.setPlayer(who);
  place(g, at, heading);
  return who;
}
// A passer-by with a part in it.
function extraAt(g, at, heading, state = 'idle', look = randomPedLook()) {
  const who = makeHuman(look);
  who.group.position.set(at.x, at.y ?? groundAt(at.x, at.z), at.z); who.group.rotation.y = heading; who.set(state);
  g.track(who.group);
  return who;
}
// A car a mission puts somewhere; it is cleared away with the mission.
function propCar(g, at, heading, color, kind = 'sedan') {
  // Whatever is already standing in that space (his own car, left there by an earlier job) is rolled into the next one.
  for (const o of g.cars) if (!o.nav && o !== g.player.car && Math.hypot(o.pos.x - at.x, o.pos.z - at.z) < 4) { o.pos.x += Math.cos(heading) * 3.4; o.pos.z -= Math.sin(heading) * 3.4; o.speed = 0; o.sync?.(); }
  const car = g.spawnCar(at.x, at.z, heading, color, kind);
  car.driverless = true; car.mission = true; car.speed = 0;
  return car;
}
const between = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
// Walk out of the room the player is in: a marker at its door, and then the street.
export async function walkOut(g, room, text) {
  const p = g.player;
  g.hud.objective(text);
  const m = g.addMarker(room.inside.x, room.inside.z, 1.5);
  await g.until(() => !p.inside || near(p.pos, room.inside, 1.9));
  g.removeMarker(m);
  g.hud.objective();
  await leave(g);
}

// ---------- 1. Starter Motor ----------
// Dr. Melfi's car will not start. Tony knows a man.

async function starterMotor(g) {
  const { melfi, bodyshop } = g.places, p = g.player, SHOP = g.places.rooms.BODYSHOP;
  const office = g.places.doors.find(d => d.name === "Dr. Melfi's office"), space = { x: melfi.park.x - 14, z: melfi.park.z - 3 };

  await g.wait(1);
  g.hud.card('Starter Motor', "Dr. Melfi's office");
  await say(g, '', "Thursday, four o'clock. Tony had begun to look forward to Thursdays, which was the part that worried him.");
  g.hud.card();
  const hers = propCar(g, space, EAST, 0x8a1c2a); // it is in its space when he arrives
  await reach(g, melfi.kerb, "Drive to <b>Dr. Melfi's office</b>.");
  await reach(g, office.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await therapy(g, [
    [MELFI, 'You are quiet today.'],
    [TONY, 'The pills work. I do not fall down. I also do not feel like doing anything else. With my wife. You follow me.'],
    [MELFI, 'That is a known effect. We can look at the dose.'],
    [TONY, 'My uncle is the boss now. I made him the boss. He is sixty-nine and he is taxing everybody like it is his last week on earth.'],
    [MELFI, 'And you cannot tell him to stop.'],
    [TONY, 'I can tell him. He has to think he thought of it. That is the whole job, with him. With everybody.'],
    [MELFI, 'Who does that for you?'],
    [TONY, '...You, I guess. Thursdays.'],
  ]);
  // Outside, afterwards: the car park, and a starter that only clicks.
  if (p.car) g.leaveCar();
  place(g, spot(space, 1.2, -3.4), SOUTH);
  const doc = actor(g, 'melfi', spot(space, 3.2, -1.9), WEST);
  shot(g, spot(space, 7.4, -5.2), spot(space, 2, -2.2), 1.6, 1.2);
  await fade(g, 0, 1);
  for (let n = 0; n < 3; n++) { g.sfx?.click(); await g.wait(0.6); }
  await talk(g, [
    [MELFI, 'Come on. Not tonight.', doc],
    [TONY, 'That is your starter. Hear it? It clicks, it does not turn.', p],
    [MELFI, 'Thank you. I will call the auto club.', doc],
    [TONY, 'I know a guy. It would be done by morning.', p],
    [MELFI, 'I am sure you do. Good night, Anthony.', doc],
  ]);
  await fade(g, 1, 1);
  dismiss(g, doc);
  g.setNight(1);
  await say(g, '', 'The auto club said two hours. She took a taxi, and left the car where it was. Tony sat in his own until the street was empty.');
  await phone(g, PUSSY, 'A starter for a German sedan, tonight? Bring it round. I do not ask whose.');
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  await wantCar(g, hers, "Get in <b>Dr. Melfi's car</b>, the dark red sedan.");
  hers.driverless = false;
  g.hud.objective();
  await say(g, '', 'It caught on the fourth try.', 2.2);
  const back = at => () => { if (p.car) g.leaveCar(); hers.pos.set(at.x, 0, at.z); hers.heading = at.h ?? EAST; hers.speed = 0; g.enterCar(hers); };
  const out = careful(g, 'Her car', 'She would see a dent before she noticed that it started. He took it back and began again.', back(space));
  await out.to(bodyshop.kerb, '<b>Drive</b> it to the body shop. Not a mark on it.', hers);
  out.stop();
  const pussy = actor(g, 'pussy', roomSpot(SHOP, -0.2, -1.2), EAST);
  await reach(g, g.places.doors.find(d => d.inside === SHOP.inside).outside, 'Go <b>in</b>. Pussy is waiting.', { r: 1.8, how: 'foot' });
  await enter(g, SHOP);
  await reach(g, roomSpot(SHOP, 1.7, -1.2), 'Find <b>Pussy</b>, by the lift.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.pos.set(SHOP.X + 1.7, 0, SHOP.Z - 1.2); p.heading = WEST;
  g.cam.fixed = inRoom(SHOP, [1.2, 2.6], [0.7, -1.2], 1.6, 1.25).cam;
  await talk(g, [
    [PUSSY, "A doctor's car. What happened, you ran her over and feel bad?", pussy],
    [TONY, 'She is a friend. The starter is gone. A new one, tonight, and it goes back where it was before she is up.', p],
    [PUSSY, 'And the bill goes to who?', pussy],
    [TONY, 'There is no bill. There is no you. It was the fairies.', p],
    [PUSSY, 'The fairies do nice work. Go and get a coffee. Two hours.', pussy],
  ]);
  await fade(g, 1, 1);
  await say(g, '', 'By four in the morning it turned over like the day it was built.');
  dismiss(g, pussy);
  g.cam.fixed = null;
  await leave(g);
  await wantCar(g, hers, "Get in <b>Dr. Melfi's car</b>.");
  const home = careful(g, 'Her car', 'A scrape down the door would take some explaining. He went back to Pussy and they did it again.', back(bodyshop.kerb));
  await home.to(space, '<b>Drive</b> it back and put it in her space. Exactly as it was.', hers);
  home.stop();
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'In the morning it started on the first turn. On the passenger seat was the old starter, in a paper bag, and no note. She sat for a while with her hands on the wheel.');
  g.removeCar(hers);
  homeAsTony(g, p.human);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. Junior's Week ----------
// Played as Mikey Palmice. A card game that never paid, and a dealer who sold to the wrong boy.

async function juniorsWeek(g) {
  const { diner, motel, park, bridge } = g.places, p = g.player, tony = p.human, DINER = g.places.rooms.DINER, ROOM = g.places.rooms.CARDROOM;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Corrado Soprano had been boss for nine days, and he wanted it noticed.');
  asOther(g, 'mikey', between(diner.kerb, diner.door, 0.4), toward(diner.kerb, diner.door));
  await playing(g, 'Mikey Palmice', "Junior's driver. You play him in this one");
  const car = propCar(g, diner.kerb, diner.kerb.h, 0x16161c);
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, "Junior's Week", 'The luncheonette');
  p.locked = false;
  await reach(g, diner.door, 'Go <b>in</b>. Mr. Soprano does not like to wait.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(DINER, [2.9, 4.5], [5.3, 1.5], 1.5, 1.1), q => ({
    junior: actor(g, 'junior', roomSpot(q, 5.1, 1.3), SOUTH, 'sit'),
    mikey: actor(g, 'mikey', roomSpot(q, 3.7, 2.5), EAST),
  }), async cast => {
    await talk(g, [
      [JUNIOR, 'Two things. I want them done so that people talk about it.', cast.junior],
      [JUNIOR, "Sammy Grigio has a card game at the motor lodge, room six. It is Jimmy Altieri's game. Four years, and not one envelope has come to this table.", cast.junior],
      [MIKEY, 'Jackie let it go. He liked Jimmy.', cast.mikey],
      [JUNIOR, "Jackie is dead. Go and take tonight's pot, and break something on your way out.", cast.junior],
      [JUNIOR, 'The second. My tailor. Forty years that man has done my trousers. His grandson bought something off a mutt called Rusty Irish and went off the bridge. Fourteen years old.', cast.junior],
      [MIKEY, 'You want Rusty spoken to.', cast.mikey],
      [JUNIOR, 'I want Rusty to see what the boy saw. Same bridge.', cast.junior],
    ]);
    await say(g, '', 'He waited for dark, because card games do.');
  });
  g.setNight(1);
  place(g, diner.door, toward(diner.door, diner.kerb));
  // Room six: five at the table, the mattresses against the wall.
  const sammy = actor(g, 'sammy', ROOM.seats[2], ROOM.seats[2].h, 'sit');
  const players = [0, 1, 3, 4].map(n => extraAt(g, ROOM.seats[n], ROOM.seats[n].h, 'sit', { ...randomPedLook(), body: 'male' }));
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, motel.kerb, '<b>Drive</b> to the motor lodge.', { how: 'car', r: 7 });
  await reach(g, motel.room, 'Room six, the middle door. <b>Go in.</b>', { r: 1.6, how: 'foot' });
  await enter(g, ROOM);
  p.locked = true;
  g.cam.fixed = inRoom(ROOM, [3.2, 2.9], [-0.4, -0.6], 1.9, 0.9).cam;
  await talk(g, [
    [SAMMY, 'Private game, pal. Whoever you are looking for is in another room.', sammy],
    [MIKEY, 'I am looking for four years of envelopes. Mr. Soprano sends his regards, and asks why he had to send them.', p],
    [SAMMY, "This is Jimmy's game. You go and talk to Jimmy.", sammy],
    [MIKEY, 'I am talking to the table.', p],
  ]);
  g.cam.fixed = null;
  g.noHeat = true;
  fistsOnly(g, true);
  for (const h of [sammy, players[0], players[3]]) { h.after = null; h.set('crouch'); }
  const foes = [players[1], players[2]].map(h => { h.set('idle'); return g.makeEnemy(h, { health: 60, damage: 7, cash: 0 }); });
  p.locked = false;
  g.hud.objective('Two of them get up. <b>Put them down.</b>');
  await g.until(() => foes.every(n => n.dead));
  await reach(g, ROOM.pot, 'Scoop up the <b>pot</b>.', { r: 1.3, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, ROOM.table);
  p.human.play('pickup', 'idle');
  await g.wait(1);
  g.sfx?.cash();
  await talk(g, [
    [MIKEY, 'Tell Jimmy the game is still his. It has a partner now.', p],
    [SAMMY, 'He is going to go to Tony with this.', sammy],
    [MIKEY, 'Good. Let him.', p],
  ]);
  fistsOnly(g, false);
  p.locked = false;
  await walkOut(g, ROOM, 'Eleven thousand and change. <b>Go.</b>');
  dismiss(g, sammy, ...players);

  // Rusty Irish, by the pond in the park.
  const lair = spot(park.pond, 4, 2.5), rusty = actor(g, 'rusty', lair, WEST, 'talk'), buyer = extraAt(g, spot(lair, -1.4, 0.2), EAST);
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  g.hud.objective('<b>Drive</b> to the park. Rusty Irish sells by the pond.');
  const mk = g.addMarker(park.kerb.x, park.kerb.z, 6);
  await g.until(() => near(p.pos, lair, 38) || near(p.pos, park.kerb, 8));
  g.removeMarker(mk);
  const runner = g.addNpc(rusty, { health: 400, ai: 'flee', cash: 0, stays: true });
  runner.threat = p.pos.clone();
  const found = quarry(g, runner);
  fistsOnly(g, true);
  say(g, '', 'He knew the car. He was running before it stopped.', 3).catch(() => {});
  g.hud.objective('He has seen the car. <b>Chase down</b> Rusty Irish: follow the <b>yellow arrow</b>.');
  await g.until(() => runner.health < 400 || runner.dead || (p.car && near(p.pos, runner.pos, 2.6) && Math.abs(p.car.speed) > 3));
  found();
  g.hud.objective();
  g.removeNpc(rusty);
  fistsOnly(g, false);
  p.locked = true;
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  rusty.after = null; rusty.set('idle');
  approach(g, rusty, 1.6);
  frame(g, p.pos, rusty.group.position, { dist: 4 });
  await talk(g, [
    [RUSTY, 'I got money! Eleven hundred, in my sock! Take it!', rusty],
    [MIKEY, 'Keep it. You are going for a drive.', p],
  ]);
  await fade(g, 1, 0.8);
  rusty.group.visible = false;
  dismiss(g, buyer);
  car.pos.set(p.pos.x + 2.4, 0, p.pos.z); car.speed = 0;
  g.enterCar(car);
  g.cam.fixed = null;
  await say(g, '', 'He went in the trunk, which was not what Rusty had hoped a drive would mean.');
  await fade(g, 0, 0.8);
  p.locked = false;
  await reach(g, bridge.mid, '<b>Drive</b> to the middle of the bridge.', { how: 'car', r: 7 });
  p.locked = true;
  const m = bridge.mid, rail = { x: m.x - 4, z: m.rail };
  await cut(g, () => {
    car.speed = 0; g.leaveCar();
    car.pos.set(m.x, 0, m.z); car.heading = WEST; car.sync?.();
    place(g, { x: rail.x - 1.5, z: rail.z - 0.3 }, EAST);
    rusty.group.position.set(rail.x, m.y, rail.z); rusty.group.rotation.y = WEST; rusty.group.visible = true; rusty.set('idle');
    shot(g, { x: rail.x - 5.5, z: rail.z - 3.4 }, { x: rail.x - 0.6, z: rail.z }, 1.6, 1.3);
  });
  await talk(g, [
    [RUSTY, 'It was a dime bag! I never knew the kid. I never even saw his face!', rusty],
    [MIKEY, "Mr. Soprano's tailor saw it. He measured the boy for his confirmation suit.", p],
    [RUSTY, 'Tell him I am sorry. Tell him I will pay. Whatever he wants, I...', rusty],
  ]);
  p.human.play('cross', 'idle', 1.2);
  await g.wait(0.3);
  g.sfx?.scream();
  const t0 = g.time, side = Math.sign(m.rail - m.z) || 1;
  g.updaters.push(() => {
    const t = g.time - t0, at = rusty.group.position;
    at.z = rail.z + side * Math.min(2.6, t * 3.2);
    at.y = m.y + 1.5 * Math.min(1, t * 2.4) - Math.max(0, t - 0.4) ** 2 * 9;
    rusty.group.rotation.x = -t * 2.2;
    if (at.y > -1.5) return true;
    rusty.group.visible = false;
    return false;
  });
  await g.wait(1.8);
  await say(g, '', 'It is a long way down from the middle of the bridge. Mikey counted to four, and then went to find a sandwich.');
  await fade(g, 1, 1);
  dismiss(g, rusty);
  g.removeCar(car);
  g.noHeat = false;
  g.pardon();
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Corrado is pleased');
}

// ---------- 3. Complaints ----------
// Three captains at the bar, a napkin with a number on it, and a man from New York at the end of the pier.

async function complaints(g) {
  const { bing, bingRoom: club, hesh, pier } = g.places, p = g.player, FNOTE = g.places.rooms.FNOTE;
  let jimmy, larry, ray;

  await g.wait(1);
  g.hud.card('Complaints', 'The Bada Bing');
  await phone(g, SILVIO, 'You should come in. I have three captains at my bar and not one of them is drinking.');
  g.hud.card();
  const room = await intoBing(g, 'Drive to the <b>Bada Bing</b>.', c => {
    jimmy = actor(g, 'jimmy', spot(c.door, 2.2, -1.2), WEST); larry = actor(g, 'larry', spot(c.door, 0.8, -2.2), SOUTH); ray = actor(g, 'raymond', spot(c.door, -0.8, -2.2), SOUTH);
  });
  await cut(g, () => {
    place(g, room.door, NORTH, bing.park);
    frame(g, p.pos, larry.group.position, { dist: 5 });
  }, 0.4);
  await talk(g, [
    [JIMMY, 'Mikey Palmice walked into my card game last night and walked out with the table. Four years I have had that game.', jimmy],
    [LARRY, 'And he put a kid off the bridge. A dealer, fine, nobody cries. But in front of God and the traffic?', larry],
    [RAYMOND, "Jackie never reached into a man's pocket. Your uncle has both hands in mine.", ray],
    [TONY, 'He is the boss. You all said yes. I stood there and watched you say it.', p],
    [JIMMY, 'We said yes because you said to.', jimmy],
    [TONY, '...I will talk to him. Nobody does anything. Nobody says a word outside this room.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await phone(g, HESH, 'Anthony. Your uncle sent a boy to my house with a number written on a napkin. Come and look at the napkin.');
  await walkOut(g, club, 'Go out to the <b>car</b>.');
  dismiss(g, jimmy, larry, ray);

  const hs = actor(g, 'hesh', roomSpot(FNOTE, -4.5, 2.6), SOUTH, 'sit');
  await reach(g, hesh.kerb, 'Drive to <b>F-Note Records</b>.');
  await reach(g, g.places.doors.find(d => d.inside === FNOTE.inside).outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, FNOTE);
  await reach(g, roomSpot(FNOTE, -4.5, 4.1), 'Find <b>Hesh</b>. He is on the sofa.', { r: 1.4, how: 'foot' });
  p.locked = true;
  p.pos.set(FNOTE.X - 4.5, 0, FNOTE.Z + 4.15); p.heading = NORTH;
  g.cam.fixed = inRoom(FNOTE, [-0.9, 3.4], [-4.5, 3.2], 1.5, 1.05).cam;
  await talk(g, [
    [HESH, 'Five hundred thousand, back tax. And two points a week on everything I lend, from now until one of us is dead. He is seventy, so he likes his odds.', hs],
    [TONY, "You were my father's friend. You never paid Jackie a dime.", p],
    [HESH, 'I paid your father in advice. He thought it was cheap at the price. I can pay this. That is not the point. If I pay it, next year there is another napkin.', hs],
    [TONY, 'If I go at him, he digs in. Somebody he looks up to has to say it over lunch, like it is nothing.', p],
    [HESH, 'New York.', hs],
    [TONY, 'New York.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, FNOTE, 'Go back out to the <b>car</b>.');
  dismiss(g, hs);
  await phone(g, JOHNNY, 'Anthony. The fishing pier, the far end of it. One hour. And come by yourself: I mean by yourself.');
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  // Two men in a grey sedan who do not talk to each other.
  const mine = p.car, unit = propCar(g, { x: mine.pos.x - Math.sin(mine.heading) * 34, z: mine.pos.z - Math.cos(mine.heading) * 34 }, mine.heading, 0x8d8a8e);
  dispatch(g, unit, unit.pos, p.pos, 15); unit.nav.goal = p.pos;
  const blip = { x: unit.pos.x, z: unit.pos.z, color: '#ff3b4a' }; g.blips.push(blip);
  let clear = 0;
  g.updaters.push(dt => {
    if (!g.blips.includes(blip)) return false;
    blip.x = unit.pos.x; blip.z = unit.pos.z;
    clear = Math.hypot(unit.pos.x - p.pos.x, unit.pos.z - p.pos.z) > 150 ? clear + dt : 0;
    return true;
  });
  await say(g, TONY, 'Grey sedan. Two men who do not talk to each other. Federal.', 3);
  g.hud.objective('<b>Drive.</b> Lose the grey sedan before you go anywhere near the pier.');
  await g.until(() => clear > 2.5);
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.removeCar(unit);
  const john = actor(g, 'johnnysack', spot(pier.end, 0, 0.9), NORTH);
  await reach(g, pier.start, '<b>Drive</b> to the pier.', { how: 'car', r: 7 });
  await reach(g, pier.end, 'Walk out to <b>Johnny Sack</b>, at the far end.', { r: 3, how: 'foot' });
  p.locked = true;
  p.pos.set(pier.end.x, 0, pier.end.z - 0.9); p.heading = SOUTH;
  shot(g, spot(pier.end, -4.6, 0), spot(pier.end, 0.4, 0), 1.6, 1.35);
  await talk(g, [
    [JOHNNY, 'You were followed.', john],
    [TONY, 'I was. I am not now.', p],
    [JOHNNY, 'So. Your uncle. Nine days, and I am hearing about him on my side of the river.', john],
    [TONY, 'He taxed Hesh. He took a game off his own captain. He is not wrong that it is his to take. He is wrong to take all of it.', p],
    [JOHNNY, 'New York does not tell New Jersey how to cut its bread.', john],
    [TONY, 'No. But a friend, over lunch, could remember out loud how the old men got to be old. They left something on the table.', p],
    [JOHNNY, 'I am having lunch with Corrado on Friday. It may come up. It will not have come from you.', john],
    [TONY, 'I was never here.', p],
  ]);
  await cut(g, () => { dismiss(g, john); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. Pax Soprana ----------
// Tony drives his uncle to a sit-down and tells him about a Roman.

async function paxSoprana(g) {
  const { diner, hesh } = g.places, p = g.player, FNOTE = g.places.rooms.FNOTE, fdoor = g.places.doors.find(d => d.inside === FNOTE.inside).outside;
  const wait = between(diner.kerb, diner.door, 0.55), facing = toward(diner.door, diner.kerb);

  await g.wait(1);
  g.hud.card('Pax Soprana', 'The luncheonette');
  await phone(g, JUNIOR, 'John Sacrimoni bought me a lunch and talked about generosity for an hour. I know a message when I eat one. Come and get me. We are going to see Hesh.');
  g.hud.card();
  const junior = actor(g, 'junior', wait, facing), mikey = actor(g, 'mikey', spot(wait, 1.5, 0.4), facing);
  await reach(g, diner.kerb, 'Pick up <b>Uncle Junior</b> at the luncheonette.', { how: 'car', r: 7 });
  p.locked = true;
  await cut(g, () => {
    const at = between(diner.kerb, diner.door, 0.2);
    place(g, at, toward(at, wait), diner.kerb);
    frame(g, p.pos, junior.group.position, { dist: 4.6 });
  });
  await talk(g, [
    [JUNIOR, 'You drive. Mikey stays. I do not want Hesh to feel outnumbered. I want him to feel generous.', junior],
    [MIKEY, 'I could follow in the other car.', mikey],
    [JUNIOR, 'You could stay here and finish my eggs.', junior],
    [TONY, 'Get in, Uncle Jun.', p],
  ]);
  g.cam.fixed = null;
  let ride = follower(g, junior, { pace: 2.4, runs: false });
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  const nerves = careful(g, "Junior's nerves", "At the third bump he got out, said a word about Tony's mother, and waved down a taxi. Tony went round the block and started again.", () => {
    const c = p.car || g.tonyCar; g.enterCar(c); c.pos.set(diner.kerb.x, 0, diner.kerb.z); c.heading = diner.kerb.h; c.speed = 0;
  });
  await nerves.to(hesh.kerb, '<b>Drive</b> Uncle Junior to F-Note Records. He is seventy: drive like it.');
  nerves.stop();
  await reach(g, fdoor, 'Take him <b>in</b>.', { r: 1.8, how: 'foot' });
  ride.on = false; junior.group.visible = false;
  // Through reception and into Hesh's office (owner: the three of them on the reception couch made no sense). Hesh is behind
  // his desk; Junior takes the guest chair nearest him; Tony sits in the other, a little back, and does the talking.
  const OFFICE = g.places.rooms.HESH;
  await enter(g, FNOTE);
  junior.group.visible = true; junior.group.position.set(FNOTE.inside.x - 1.1, FNOTE.Y, FNOTE.inside.z + 0.3); junior.set('idle');
  ride = follower(g, junior, { gap: 1.6, runs: false, pace: 2.2 }); ride.pos.copy(junior.group.position);
  p.locked = true; p.heading = NORTH;
  g.cam.fixed = inRoom(FNOTE, [2.7, 0.6], [0, -3], 1.6, 1.3).cam;
  await talk(g, [['Receptionist', 'Mr. Soprano. Mr. Rabkin said to bring your uncle straight through.', FNOTE.clerk], [JUNIOR, 'He said my name? He said "the uncle"?', junior], [TONY, 'Uncle Jun. The door.', p]]);
  g.cam.fixed = null; p.locked = false;
  { const at = roomSpot(FNOTE, -5.4, -3.7), inOffice = () => p.pos.z < FNOTE.Z - 6;
    g.hud.objective('Take him through the door marked <b>H. RABKIN</b>.');
    const m = g.addMarker(at.x, at.z, 1.2);
    await g.until(() => near(p.pos, at, 1.3) || inOffice());
    g.removeMarker(m); g.hud.objective();
    if (!inOffice()) { p.locked = true; await fade(g, 1, 0.35); g.sfx?.door(); p.pos.set(OFFICE.inside.x, 0, OFFICE.inside.z + 1); p.heading = g.cam.yaw = NORTH; await fade(g, 0, 0.35); p.locked = false; } }
  ride.on = false;
  await reach(g, roomSpot(OFFICE, 0.5, 0.6), 'Hesh is at his <b>desk</b>. Sit your uncle down.', { r: 1.3, how: 'foot' });
  p.locked = true;
  await cut(g, () => {
    junior.group.position.set(OFFICE.guests[0].x, OFFICE.guests[0].y, OFFICE.guests[0].z); junior.group.rotation.y = OFFICE.guests[0].h; junior.set('sit');
    p.pos.set(OFFICE.guests[1].x, 0, OFFICE.guests[1].z + 0.25); p.heading = OFFICE.guests[1].h; p.pose = 'sit';
    g.cam.fixed = inRoom(OFFICE, [-3.6, 1.6], [0.8, -2.2], 1.55, 1.05).cam; // from the couch side: Hesh at his desk, the two chairs before it
  }, 0.5);
  const heshA = actor(g, 'hesh', OFFICE.chair, OFFICE.chair.h, 'sit');
  await talk(g, [
    [JUNIOR, "Twenty years you earned under this family's roof, and the roof never saw a dollar.", junior],
    [HESH, 'I paid your brother in friendship, Corrado. He never sent it back.', heshA],
    [JUNIOR, 'My brother is dead. I am not sentimental. Five hundred, and two points.', junior],
    [TONY, 'There was a Roman. Augustus. He ran that thing longer than anybody before him or after. You know how? He did not squeeze. Everybody under him ate, so nobody under him wanted him gone. They called it a peace.', p],
    [JUNIOR, 'A year and a half of college, and this is what I get for it.', junior],
    [TONY, 'Johnny Sack says the same thing, with no Romans in it.', p],
    [JUNIOR, '...Three hundred. A point and a half.', junior],
    [HESH, 'Three hundred I can live with. The point and a half I will complain about every week, as is my right.', heshA],
    [JUNIOR, 'And the three hundred I cut five ways, with my captains. Let them see who feeds them.', junior],
    [TONY, 'That is a boss talking.', p],
  ]);
  await cut(g, () => { g.cam.fixed = { pos: new THREE.Vector3(OFFICE.X + 3.2, OFFICE.Y + 1.5, OFFICE.Z - 3.4), look: new THREE.Vector3(OFFICE.X + 0.2, OFFICE.Y + 1.05, OFFICE.Z - 0.6) }; }, 0.4);   // over Hesh's shoulder: the two of them in his chairs
  await say(g, '', 'Tony had put every word of it in his mouth, and his uncle would remember all of it as his own. That was the peace.');
  await fade(g, 1, 1);
  dismiss(g, heshA);
  p.pose = null; outdoors(g);
  place(g, fdoor, toward(fdoor, hesh.kerb));
  junior.group.position.set(fdoor.x + 1.3, groundAt(fdoor.x + 1.3, fdoor.z), fdoor.z); junior.group.visible = true; junior.set('idle');
  ride = follower(g, junior, { pace: 2.4, runs: false });
  ride.pos.copy(junior.group.position);
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, diner.kerb, '<b>Drive</b> Uncle Junior back to the luncheonette.', { how: 'car', r: 7 });
  p.locked = true;
  if (p.car) p.car.speed = 0;
  await say(g, JUNIOR, 'You were always a good boy. Mouthy. But good.', 3);
  await fade(g, 1, 0.8);
  ride.on = false;
  dismiss(g, junior, mikey);
  await fade(g, 0, 0.8);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Anniversary ----------
// Carmela goes to see a priest about a doctor. Tony remembers what day it is with an hour to spare.

async function anniversary(g) {
  const { home, church, pawn, houseRoom } = g.places, p = g.player, tony = p.human, CHURCH = g.places.rooms.CHURCH, PAWN = g.places.rooms.PAWN;
  const R = { X: houseRoom.inside.x - 2, Y: -0.1, Z: houseRoom.inside.z - 3.2, ambient: houseRoom.ambient }, front = g.places.doors.find(d => d.name === 'home').outside;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Saturday would be eighteen years. Carmela had bought a dress for it. On Thursday she went to see a priest.');
  const carm = asOther(g, 'carmela', spot(home.guest, -3, -3), EAST);
  await playing(g, 'Carmela Soprano', 'You play her in this one');
  const wagon = propCar(g, home.guest, home.guest.h, 0xb9a58a, 'suv');
  g.setNight(0);
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Anniversary', 'North Shore');
  p.locked = false;
  await wantCar(g, wagon, 'Get in the <b>station wagon</b>.');
  wagon.driverless = false;
  await reach(g, church.kerb, '<b>Drive</b> to the church.', { how: 'car', r: 7 });
  await reach(g, church.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, CHURCH);
  const phil = CHURCH.clerk;
  await reach(g, CHURCH.till, 'Find <b>Father Phil</b>, at the altar.', { r: 1.7, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, phil.group.position);
  phil.group.rotation.y = toward(phil.group.position, p.pos);
  g.cam.fixed = inRoom(CHURCH, [4, -5.4], [0.8, -8.4], 1.7, 1.4).cam;
  await talk(g, [
    [PHIL, 'Carmela. There is no mass until five.', phil],
    [CARMELA, 'I did not come for mass. I am jealous, Father. Of a woman I have never met.', p],
    [PHIL, 'His doctor.', phil],
    [CARMELA, 'He tells her things. He comes home empty. Eighteen years I waited for him to talk, and now he pays someone else to listen.', p],
    [PHIL, 'Is it the woman you resent, or that the help did not come from you?', phil],
    [CARMELA, '...I wanted to be the one. That is a sin, I suppose. Wanting the credit.', p],
    [PHIL, 'It is a very ordinary one. Go home. Let him be helped, by whoever.', phil],
  ]);
  await fade(g, 1, 1);
  phil.group.rotation.y = NORTH;
  g.cam.fixed = null;
  for (const h of p.inside?.hide || []) h.group.visible = true;
  p.inside = null;
  g.removeCar(wagon);
  await say(g, '', "Saturday, five o'clock. Tony was in the driveway with a hose in his hand when it came to him what day it was.");
  homeAsTony(g, tony);
  void carm;
  await fade(g, 0, 1);
  await say(g, TONY, 'Eighteen years. ...Today. It is today.', 2.6);
  p.locked = false;
  // The pawnbroker shuts at six.
  const LIMIT = 150, t0 = g.time, mk = g.addMarker(pawn.kerb.x, pawn.kerb.z, 6);
  const left = () => Math.max(0, Math.ceil(LIMIT - (g.time - t0)));
  await g.until(() => { g.hud.objective(`<b>Drive</b> to the pawnbroker before he shuts. &nbsp; <b>${Math.floor(left() / 60)}:${String(left() % 60).padStart(2, '0')}</b>`); return p.car && near(p.pos, mk, 6.5) && Math.abs(p.car.speed) < 6; });
  const late = left() === 0;
  g.removeMarker(mk);
  await reach(g, pawn.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, PAWN);
  await reach(g, PAWN.till, 'Talk to the <b>pawnbroker</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  const broker = PAWN.clerk;
  p.heading = toward(p.pos, broker.group.position);
  { const b = broker.group.position; g.cam.fixed = { pos: new THREE.Vector3(b.x + 2.6, PAWN.Y + 2.05, b.z + 3.4), look: new THREE.Vector3(b.x + 0.2, PAWN.Y + 1.45, b.z + 0.6) }; } // over the glass case, so the man behind it can be seen
  await talk(g, [
    ['Pawnbroker', late ? 'I was closed. You leaned on that bell like a man with a problem.' : 'Five minutes to six. You have the look of a man who forgot something.', broker],
    [TONY, 'Eighteen years married. Show me what a woman forgives a man for.', p],
    ['Pawnbroker', 'A sapphire, the size of a regret. A widow in Ocean Heights. She cried when she sold it, if that helps.', broker],
    [TONY, 'It does not. Wrap it.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, PAWN, 'Go back out to the <b>car</b>.');
  await reach(g, home.road, 'Drive <b>home</b>.');
  await reach(g, front, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(R, [-3.6, 2.6], [-4, -1.5], 1.6, 1.15), q => ({ // across the kitchen island
    carmela: actor(g, 'carmela', roomSpot(q, -6.2, -1.5), EAST),
    tony: actor(g, 'tony', roomSpot(q, -1.7, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [CARMELA, 'You remembered.', cast.carmela],
      [TONY, 'Eighteen years. I had it in the car all week.', cast.tony],
      [CARMELA, 'The box says Ocean Heights Loan and Pawn, Tony.', cast.carmela],
      [TONY, '...It is a good stone.', cast.tony],
      [CARMELA, 'It is. I went to see Father Phil. I told him I was jealous of your doctor.', cast.carmela],
      [TONY, 'Of Melfi? Carm. She is a mechanic. Something is broken, she fixes it.', cast.tony],
      [CARMELA, 'I wanted to be the one who fixed it.', cast.carmela],
      [TONY, 'You are the reason there is anything to fix. Put the dress on. I got us a table.', cast.tony],
    ]);
    await say(g, '', 'They went to dinner. He was charming for three hours, and she let him be.');
  });
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. The Board ----------
// Tony says a thing he cannot take back. Then a dinner for the new boss, and a waiter who is not one.

async function theBoard(g) {
  const { melfi, manor } = g.places, p = g.player, tony = p.human, HALL = g.places.rooms.BANQUET;
  const office = g.places.doors.find(d => d.name === "Dr. Melfi's office");

  await g.wait(1);
  g.hud.card('The Board', "Dr. Melfi's office");
  await say(g, '', 'Thursday again.', 2);
  g.hud.card();
  await reach(g, melfi.kerb, "Drive to <b>Dr. Melfi's office</b>.");
  await reach(g, office.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await therapy(g, [
    [MELFI, 'My car was taken in the night and came back repaired. There was a starter motor in a paper bag on the seat.'],
    [TONY, 'You are welcome.'],
    [MELFI, 'I did not thank you. You had someone go into my car. You know where it sleeps. That is not a kindness, Anthony. It is a liberty.'],
    [TONY, 'It was broken. I fixed it. That is what I do for people I...'],
    [MELFI, 'For people you what?'],
    [TONY, 'I dream about you. I think about Thursday on a Monday. I am in love with you. There. It is said.'],
    [MELFI, 'What you feel is real. It is also the treatment. You talk in this room and nothing bad happens, and that feels like love because so little else does. It has a name.'],
    [TONY, 'Do not give it a name.'],
    ['', 'He got up, crossed the rug in two steps and kissed her. She did not move. Then she did, backward.'],
    [MELFI, 'Sit down, or leave. Those are the two things that can happen now.'],
    [TONY, '...Same time Thursday?'],
    [MELFI, 'Same time Thursday.'],
  ]);
  if (p.car) g.leaveCar();
  place(g, office.outside, SOUTH);
  g.setNight(1);
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  await phone(g, JUNIOR, "Tonight. The Manor, eight o'clock. Every captain. I have envelopes for them and I want to watch them not open them. Wear a tie.");
  await reach(g, manor.kerb, 'Drive to <b>the Manor</b>, at the south end of Ocean Drive.', { how: 'car', r: 7 });
  await reach(g, manor.door, 'Go <b>in</b>.', { r: 2, how: 'foot' });

  // The other side of the tray.
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Twenty-two tables. The caterer had taken on extra waiters for the night, and three of them had never carried a tray before.');
  const agent = makeLook('waiter');
  g.setPlayer(agent);
  p.inside = g.places.doors.find(d => d.inside === HALL.inside);
  p.pos.set(HALL.inside.x, 0, HALL.inside.z); p.heading = g.cam.yaw = NORTH;
  const names = ['mikey', 'larry', 'junior', 'tony', 'jimmy', 'raymond'], seated = names.map((n, k) => actor(g, n, HALL.head[k], SOUTH, 'sit'));
  const [mk, la, ju, to, ji, ra] = seated;
  const guests = HALL.rounds.flatMap((t, n) => [n % 4, (n + 2) % 4].map(k => extraAt(g, t.seats[k], t.seats[k].h, 'sit')));
  await playing(g, 'Special Agent Grasso', 'F.B.I., dressed as a waiter. You play him in this one');
  // The owner's own song for this scene, if a file with "paparazzi" in its name is in the music/ folder (nothing is downloaded
  // for him); and while it plays, other people's cameras go off round the hall. (Owner, 2026-10-08.)
  const song = g.sfx?.cue?.('paparazzi', 0.5);
  if (song) g.hud.radio?.(song);
  let flashing = true;
  g.updaters.push(() => { if (!flashing) return false; if (Math.random() < 0.012) { g.hud.flash('#ffffff', 0.07); g.sfx?.click?.(); } return true; });
  g.cam.fixed = inRoom(HALL, [0, 1.6], [0, -6.8], 1.8, 1.2).cam;
  await fade(g, 0, 1);
  await talk(g, [
    [JUNIOR, 'Sit, sit. I am no good at speeches, so I had my nephew tell me what I think.', ju],
    [JUNIOR, 'A boss who eats alone dies alone. There is an envelope under every plate at this table. Open it at home.', ju],
    [TONY, 'Salute, Uncle Jun.', to],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  const order = [[2, JUNIOR, 'Corrado Soprano. Seventy. He looked straight into the buttonhole and asked for more ice.'], [3, 'Tony Soprano', 'Anthony Soprano. He put his hand over his glass, and looked at the waiter a moment longer than a man looks at a waiter.'],
    [0, MIKEY, 'Michael Palmice, who did not look up.'], [4, JIMMY, 'James Altieri, counting the thickness of an envelope with his thumb.'], [1, LARRY, 'Lorenzo Barese, laughing at something nobody had said.'], [5, RAYMOND, 'Raymond Curto, who thanked him for the wine.']];
  for (const [k, name, note] of order) {
    await reach(g, HALL.serve[k], `Pour the wine. Carry the tray to <b>${name}</b>.`, { r: 1, how: 'foot' });
    p.locked = true; p.hidden = true;
    await photograph(g, seated[k], name, HALL.serve[k], { fov: 40, lift: 1.1, height: 1.45 });
    await say(g, '', note, 3.4);
    g.cam.fixed = null;
    p.hidden = false; p.locked = false;
  }
  p.locked = true;
  flashing = false; g.sfx?.cue?.(null);
  await fade(g, 1, 1.2);
  await say(g, '', 'By midnight the film was in Newark.');
  await say(g, '', "A man with his sleeves rolled took one photograph off the cork board, pinned it at the top, and wrote BOSS under it with a marker. It was Corrado Soprano's.");
  await say(g, '', "Anthony's stayed where it was, one row down. Nobody in that office thought it meant he had less to say. Nobody at the Manor thought so either, except one old man.");
  dismiss(g, ...seated, ...guests);
  void mk; void la; void ji; void ra;
  p.inside = null;
  g.setPlayer(tony); g.scene.remove(agent.group);
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode six complete', 5000);
}

// ========== Episode Seven: Down Neck ==========
// AJ gets into the altar wine, a school psychologist says a word about how he is made, and Tony goes back to 1967
// to see how he was. Follows the plot of the seventh episode; every line is written for the game.

const BOY = 'Anthony', DAD = 'Johnny Boy', COACH = 'Coach', SHRINK = 'School psychologist';
// Somebody walking a beat round `loop` for ever, red on the radar. `seen` goes true once the player comes within `r` of him on foot.
function beat(g, human, loop, { speed = 1.7, r = 7, start = 0 } = {}) {
  const at = human.group.position, b = { on: true, leg: start, seen: false, r };
  const blip = { x: at.x, z: at.z, color: '#ff3b4a' };
  g.blips.push(blip);
  g.updaters.push(dt => {
    if (!b.on) { const k = g.blips.indexOf(blip); if (k >= 0) g.blips.splice(k, 1); return false; }
    const to = loop[(b.leg + 1) % loop.length], dx = to.x - at.x, dz = to.z - at.z, d = Math.hypot(dx, dz), p = g.player;
    if (d < 0.5) b.leg = (b.leg + 1) % loop.length;
    else if (!p.locked) { at.x += dx / d * speed * dt; at.z += dz / d * speed * dt; at.y = groundAt(at.x, at.z); human.group.rotation.y = Math.atan2(dx, dz); human.set('walk'); }
    blip.x = at.x; blip.z = at.z;
    if (!p.locked && !p.car && near(at, p.pos, b.r)) b.seen = true;
    return true;
  });
  b.reset = () => { const s = loop[start]; at.set(s.x, groundAt(s.x, s.z), s.z); b.leg = start; b.seen = false; };
  return b;
}
// A drive (or a run) against a clock shown in the objective. Resolves true if the player got there in time.
async function against(g, at, text, seconds, { r = 6, how = 'car' } = {}) {
  const p = g.player, t0 = g.time, mk = g.addMarker(at.x, at.z, r);
  const left = () => Math.max(0, Math.ceil(seconds - (g.time - t0)));
  await g.until(() => { g.hud.objective(`${text} &nbsp; <b>${Math.floor(left() / 60)}:${String(left() % 60).padStart(2, '0')}</b>`); return left() === 0 || (near(p.pos, mk, r + 0.5) && (how === 'car' ? p.car && Math.abs(p.car.speed) < 6 : !p.car)); });
  g.removeMarker(mk);
  g.hud.objective();
  return left() > 0;
}
// The Sopranos' kitchen, for scenes across the island.
const kitchen = g => { const h = g.places.houseRoom; return { X: h.inside.x - 2, Y: -0.1, Z: h.inside.z - 3.2, ambient: h.ambient }; };

// ---------- 1. Sacramental Wine ----------
// Played as AJ. Three boys, a sacristy, and a physical education class.

async function sacramentalWine(g) {
  const { school } = g.places, p = g.player, tony = p.human, c = { x: school.door.x, z: school.door.z + 8.4 }, start = spot(school.lot, -6, 2);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Verbum Dei, second period. Three boys had a plan, which is two more boys than a plan needs.');
  g.setNight(0);
  asOther(g, 'aj', start, NORTH);
  await playing(g, 'AJ Soprano', 'Thirteen years old. You play him in this one');
  const k1 = actor(g, 'kida', spot(start, 1.5, -1.3), toward(spot(start, 1.5, -1.3), start)), k2 = actor(g, 'kidb', spot(start, -1.3, -1.5), toward(spot(start, -1.3, -1.5), start));
  frame(g, p.pos, k1.group.position, { dist: 4, height: 1.3, lift: 1 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Sacramental Wine', 'Verbum Dei School');
  await talk(g, [
    ['Kevin', 'The sacristy door is round the back. He locks the cupboard, he never locks the door.', k1],
    [AJ, 'What if Father Hagy is in there?', p],
    ['Ryan', 'He walks round the whole building all second period with his hands behind him. Like a duck.', k2],
    [AJ, 'Do not talk about ducks.', p],
    ['Kevin', 'You are the fastest. We will keep watch. From here.', k1],
  ]);
  g.cam.fixed = null;
  const loop = [[-24.6, -28.3], [24.6, -28.3], [24.6, -7.2], [-24.6, -7.2]].map(([x, z]) => ({ x: c.x + x, z: c.z + z }));
  const father = actor(g, 'priest', loop[2], WEST, 'walk'), walk = beat(g, father, loop, { start: 2, r: 8 }), back = { x: c.x - 9, z: c.z - 27.9 };
  p.locked = false;
  for (;;) {
    walk.seen = false;
    let m = g.addMarker(back.x, back.z, 1.5);
    g.hud.objective('Sneak round to the <b>sacristy door</b> behind the school. Keep away from <b>Father Hagy</b>: he is red on the radar.');
    await g.until(() => walk.seen || (near(p.pos, back, 1.9) && !p.car));
    g.removeMarker(m);
    if (!walk.seen) {
      p.locked = true;
      p.heading = SOUTH;
      p.human.play('kneel', 'idle');
      await say(g, '', 'Three bottles, under a folded surplice. They clinked all the way out.', 3);
      p.locked = false;
      m = g.addMarker(start.x, start.z, 1.6);
      g.hud.objective('Back to the <b>others</b>. Do not walk into him now.');
      await g.until(() => walk.seen || near(p.pos, start, 2));
      g.removeMarker(m);
      if (!walk.seen) break;
    }
    p.locked = true;
    await say(g, 'Father Hagy', 'Mr. Soprano. The lavatories are in the other direction.', 3);
    await fade(g, 1, 0.8);
    await say(g, '', 'He was walked back to class by the ear. They tried again at the next bell.');
    place(g, start, NORTH);
    walk.reset();
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  walk.on = false;
  // Third period.
  p.locked = true;
  g.hud.objective();
  await fade(g, 1, 1);
  await say(g, '', 'They drank it behind the equipment shed in eleven minutes. Third period was gym.');
  dismiss(g, father);
  const lot = school.lot, coach = actor(g, 'coach', spot(lot, 5, -3), WEST);
  k1.group.position.set(lot.x - 4, groundAt(lot.x - 4, lot.z - 4), lot.z - 4); k1.after = null; k1.set('crouch');
  k2.group.position.set(lot.x - 5.6, groundAt(lot.x - 5.6, lot.z - 3), lot.z - 3); k2.after = null; k2.set('down');
  place(g, spot(lot, 2, -2), EAST);
  g.hud.panic(0.24); g.cam.sway = 0.85;
  shot(g, spot(lot, -1.5, 2.5), spot(lot, 4, -3), 1.4, 1.3);
  await fade(g, 0, 1);
  await say(g, COACH, 'Soprano! Two laps. What is the matter with your legs?', 3);
  g.cam.fixed = null;
  p.locked = false;
  for (const at of [spot(lot, 11, 5), spot(lot, -9, 6), spot(lot, 10, -5), spot(lot, 1, 1)]) await reach(g, at, 'Two laps. <b>Run.</b> The ground will not keep still.', { r: 2.2, how: 'foot' });
  p.locked = true;
  p.human.play('kneel', 'idle');
  await say(g, '', 'On the free-throw line he was sick. It was purple, and it smelled of church.');
  await say(g, COACH, '...Nobody move. Nobody touch it. I am getting Mrs. Gaetano.', 3.2);
  await fade(g, 1, 1);
  g.hud.panic(0); g.cam.sway = 0;
  dismiss(g, k1, k2, coach);
  await say(g, '', 'The school telephoned his mother. His mother telephoned his father.');
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Detention');
}

// ---------- 2. The Principal's Office ----------
// A word nobody in the family has heard before, and a sentence.

async function principalsOffice(g) {
  const { school, home } = g.places, p = g.player, SCHOOL = g.places.rooms.SCHOOL, front = g.places.doors.find(d => d.name === 'home').outside;

  await g.wait(1);
  g.hud.card("The Principal's Office", 'Verbum Dei School');
  await phone(g, CARMELA, "Your son is in the principal's office. Drunk. At eleven in the morning, on communion wine. I am already here. Come now.");
  g.hud.card();
  await reach(g, school.gate, 'Drive to the <b>school</b>.');
  await reach(g, school.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(SCHOOL, [3.8, 2.7], [-0.6, -1]), q => ({
    principal: actor(g, 'principal', roomSpot(q, -1.9, -2.2), SOUTH),
    shrink: actor(g, 'psychologist', roomSpot(q, -3.3, -1.5), EAST),
    aj: actor(g, 'aj', roomSpot(q, -0.3, -1), SOUTH),
    carmela: actor(g, 'carmela', roomSpot(q, 1.5, -0.2), WEST),
    tony: actor(g, 'tony', roomSpot(q, 0, 1.5), NORTH),
  }), async cast => {
    await talk(g, [
      [PRINCIPAL, 'Three boys, three bottles of altar wine, and a physical education class. I will spare you the free-throw line.', cast.principal],
      [TONY, 'He will pay for the wine. He will wash the floor.', cast.tony],
      [SHRINK, 'Mr. Soprano, this is not his first visit to this office. He fidgets, he drifts, he is two years behind in reading. I would like to test him for an attention deficit.', cast.shrink],
      [TONY, 'He stole wine. When I was a kid that already had a name. It was called being thirteen.', cast.tony],
      [CARMELA, 'Tony. Let her finish.', cast.carmela],
      [SHRINK, 'It may be how he is made, not how he is raised. That is good news, if we know it.', cast.shrink],
      [TONY, '...How he is made.', cast.tony],
      [AJ, 'Can I go home? My head hurts.', cast.aj],
    ]);
  });
  place(g, school.door, SOUTH);
  const aj = actor(g, 'aj', spot(school.door, 1.3, 1.2), SOUTH), ride = follower(g, aj, { pace: 3 });
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with AJ.');
  await g.until(() => p.car);
  await reach(g, home.road, 'Drive AJ <b>home</b>.', { how: 'car', r: 7 });
  p.locked = true;
  if (p.car) p.car.speed = 0;
  await say(g, AJ, 'Dad. Were you ever in trouble? At school?', 3);
  await say(g, TONY, 'I was a good kid.', 2);
  await say(g, AJ, 'Grandma says you were a holy terror.', 2.6);
  await say(g, TONY, 'Your grandmother says a lot of things.', 2.6);
  p.locked = false;
  await reach(g, front, 'Take him <b>in</b>.', { r: 1.8, how: 'foot' });
  ride.on = false; aj.group.visible = false;
  await roomScene(g, inRoom(kitchen(g), [-3.6, 2.8], [-4, -1.5], 1.6, 1.15), q => ({
    carmela: actor(g, 'carmela', roomSpot(q, -6.2, -1.5), EAST),
    aj: actor(g, 'aj', roomSpot(q, -4, 0.6), NORTH),
    tony: actor(g, 'tony', roomSpot(q, -1.7, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [CARMELA, 'No television. No video games. No skateboard. Three weeks.', cast.carmela],
      [AJ, 'Three weeks!', cast.aj],
      [TONY, 'And Sundays you go and see your grandmother at Green Grove. Every Sunday.', cast.tony],
      [AJ, 'That is not a punishment, that is... okay, it is a punishment.', cast.aj],
      [TONY, 'Go to your room. Drink some water.', cast.tony],
    ]);
    cast.aj.group.visible = false;
    await talk(g, [
      [CARMELA, 'She wants him tested, Tony. Maybe she is right. Maybe it is something he was born with.', cast.carmela],
      [TONY, 'Born with from who?', cast.tony],
      [CARMELA, 'I did not say that.', cast.carmela],
      [TONY, 'No. You did not.', cast.tony],
    ]);
  });
  dismiss(g, aj);
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 3. 1967 ----------
// Thursday, and then a Saturday thirty years earlier, played as a boy of eleven.

async function nineteenSixtySeven(g) {
  const { melfi, livia, satriale } = g.places, p = g.player, tony = p.human, office = g.places.doors.find(d => d.name === "Dr. Melfi's office");
  const yard = spot(livia.path, -2.6, 0.6);

  await g.wait(1);
  g.hud.card('1967', "Dr. Melfi's office");
  await say(g, '', 'Born with from who. He took the question to Thursday.');
  g.hud.card();
  await reach(g, melfi.kerb, "Drive to <b>Dr. Melfi's office</b>.");
  await reach(g, office.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await therapy(g, [
    [MELFI, 'You say your son may have inherited something. From whom?'],
    [TONY, 'My father was a great guy. Everybody loved him. He had the whole neighbourhood.'],
    [MELFI, 'What did he do?'],
    [TONY, 'He had interests. Retail meat. Some other things.'],
    [MELFI, 'When did you first understand what the other things were?'],
    [TONY, '...I was eleven. It was a Saturday. I was supposed to stay in the yard.'],
  ]);
  // The same streets, the colour of a photograph.
  if (p.car) g.leaveCar();
  g.hud.era(true);
  g.setNight(0);
  asOther(g, 'tonyboy', yard, EAST);
  await playing(g, 'Anthony Soprano, 1967', 'Eleven years old. You play him in this one');
  const car = propCar(g, livia.kerb, livia.kerb.h, 0x1f6b4a);
  let dad = actor(g, 'johnnyboy', spot(livia.path, 0.4, 3.4), SOUTH), jun = actor(g, 'junior67', spot(livia.kerb, -2.4, -3), EAST);
  const ma = actor(g, 'livia67', livia.porch, SOUTH);
  shot(g, spot(livia.kerb, 6, -1.5), livia.path, 1.5, 1.3);
  await fade(g, 0, 1);
  await talk(g, [
    [LIVIA, 'Anthony! You stay in that yard. Your father has business.', ma],
    [DAD, 'Listen to your mother. I am back by supper.', dad],
    [JUNIOR, 'Come on, John. Rocco is not going to wait in for us.', jun],
  ]);
  g.cam.fixed = null;
  dismiss(g, dad, jun);
  p.locked = false;
  for (;;) {
    dispatch(g, car, livia.kerb, satriale.kerb, 6);
    const blip = { x: car.pos.x, z: car.pos.z, color: '#ffffff' }; g.blips.push(blip);
    g.hud.objective("Keep your father's <b>green car</b> in sight, on foot. Not too close: he has a mirror.");
    let lost = 0, res = null;
    g.updaters.push(dt => {
      if (res !== null) return false;
      blip.x = car.pos.x; blip.z = car.pos.z;
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      if (near(car.pos, satriale.kerb, 20)) res = 'there';
      else if (d < 7.5) res = 'seen';
      else if (d > 85) { lost += dt; if (lost > 6) res = 'lost'; } else lost = 0;
      if (car.nav) car.nav.cruise = 6; // a boy at a run keeps up; at a walk he does not
      return true;
    });
    await g.until(() => res !== null);
    g.blips.splice(g.blips.indexOf(blip), 1);
    g.hud.objective();
    car.nav = null; car.speed = 0;
    if (res === 'there') break;
    p.locked = true;
    await say(g, '', res === 'seen' ? 'His father saw him in the mirror, stopped the car, and pointed at the house without a word. He went back to the yard and tried again.' : 'He lost them at a corner, and for another thirty years would have gone on thinking his father sold meat. He tried again.');
    await cut(g, () => { place(g, yard, EAST); car.pos.set(livia.kerb.x, 0, livia.kerb.z); car.heading = livia.kerb.h; car.sync?.(); });
    p.locked = false;
  }
  // Outside the pork store.
  p.locked = true;
  const front = satriale.table, watch = spot(front, -9, 6);
  let rocco;
  await cut(g, () => {
    car.pos.set(satriale.kerb.x, 0, satriale.kerb.z); car.heading = satriale.kerb.h; car.sync?.();
    place(g, watch, toward(watch, front));
    rocco = actor(g, 'rocco', spot(front, 0, 0.4), WEST);
    dad = actor(g, 'johnnyboy', spot(front, -1.5, 0.4), EAST); jun = actor(g, 'junior67', spot(front, 1.4, 1.2), WEST);
    shot(g, spot(watch, -1.6, 1.8), front, 1.2, 1.2);
  });
  await talk(g, [
    [DAD, 'Rocco. You bought a new car.', dad],
    ['Rocco', 'Johnny, I was coming by Friday, I swear on my mother, I...', rocco],
  ]);
  await punch(g, dad, rocco);
  await punch(g, dad, rocco, true);
  await say(g, '', 'His father hit the man the way he did everything, without hurrying. His uncle held the hat.');
  await say(g, '', 'Anthony was not frightened. That was the part he would have to explain thirty years later. He was proud.');
  dad.group.rotation.y = toward(dad.group.position, p.pos);
  await say(g, DAD, '...Is that my kid?', 2.4);
  g.cam.fixed = null;
  for (;;) {
    p.locked = false;
    if (await against(g, livia.path, '<b>Run</b> home before he gets there.', 75, { r: 2.2, how: 'foot' })) break;
    p.locked = true;
    await say(g, '', 'The green car was in the drive when he came round the corner. That is not how it happened. Again.');
    await cut(g, () => place(g, watch, toward(watch, livia.path)));
  }
  p.locked = true;
  p.heading = toward(p.pos, livia.porch);
  frame(g, p.pos, livia.porch, { dist: 4.4, height: 1.4, lift: 1.2 });
  await talk(g, [
    [LIVIA, 'Where were you? I called, and called.', ma],
    [BOY, 'In the yard.', p],
    [LIVIA, 'You are a liar, like him. Wash your hands. If your father asks, you were in the yard.', ma],
  ]);
  await fade(g, 1, 1);
  g.hud.era(false);
  await say(g, '', "He told Dr. Melfi all of it but the last word. He said 'scared'. She wrote something down.");
  dismiss(g, dad, jun, ma, rocco);
  g.removeCar(car);
  g.cam.fixed = null;
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. Rideland ----------
// Played as the boy again. Sundays his father took Janice to the rides.

async function ridelandSunday(g) {
  const { rideland: R } = g.places, p = g.player, tony = p.human, LIVIA_ROOM = g.places.rooms.LIVIA;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Sundays his father took Janice to Rideland, on the beach, and never once took him. One Sunday he got on the bus.');
  if (p.car) g.leaveCar();
  g.hud.era(true);
  g.setNight(0);
  asOther(g, 'tonyboy', R.stop, EAST);
  await playing(g, 'Anthony Soprano, 1967', 'You play him in this one');
  const back = spot(R.carousel, 6, 2), dad = actor(g, 'johnnyboy', back, WEST, 'talk');
  const men = [extraAt(g, spot(back, -1.4, 0.5), EAST, 'idle', { jacket: 0x4a4038, shirt: 0xf4f4f4, pants: 0x4a4038, hat: 'fedora', bulk: 1.15 }), extraAt(g, spot(back, -0.4, -1.4), SOUTH, 'talk', { jacket: 0x55585f, shirt: 0xcfe8ff, pants: 0x55585f, hair: 0x9a9690, bulk: 1.25, age: 0.7 })];
  const janice = actor(g, 'janice', R.horses[5], R.horses[5].h, 'sit');
  const crowd = [1, 3, 6].map(k => extraAt(g, R.horses[k], R.horses[k].h, 'sit', { body: 'female', shirt: [0x9fd0f5, 0xffe066, 0xf7a8c4][k % 3], tee: true, pants: 0xf5f0e6, hair: 0x4a3324, hairMesh: 'long', height: 0.82, head: 1.15 }));
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Rideland', 'A Sunday in 1967');
  p.locked = false;
  await reach(g, R.gate, 'Go in under the <b>arch</b>.', { r: 2.2, how: 'foot' });
  await reach(g, R.hide, 'Hide behind the <b>ticket booth</b>, where he will not see you.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, back);
  shot(g, spot(R.hide, -1.2, 1.8), spot(R.carousel, 3, 0.5), 1.2, 1.4);
  await say(g, '', 'It was not for the rides. The fathers stood behind the carousel and handed each other envelopes while their daughters went round and round.');
  await say(g, '', 'A man with a little girl on his shoulders is a man nobody stops.');
  g.sfx?.horn?.(0.8, 0.04);
  const cops = [actor(g, 'cop', spot(back, -2.4, 1.6), EAST), actor(g, 'cop', spot(back, 1.6, 1.8), WEST)];
  dad.set('idle');
  for (const m of men) { m.after = null; m.set('idle'); }
  await say(g, '', 'Then there were policemen, walking fast and not running, which is worse.');
  await talk(g, [
    [DAD, 'Not in front of my daughter. I am coming. Just not in front of her.', dad],
  ]);
  janice.set('idle');
  await say(g, '', 'Janice screamed for a long time. Nobody on the carousel got off.');
  g.cam.fixed = null;
  dismiss(g, dad, ...men);
  // Out again, past the uniforms.
  const walks = [beat(g, cops[0], [spot(R.gate, 3, -5), spot(R.gate, 3, 5), spot(R.gate, 9, 5), spot(R.gate, 9, -5)], { r: 5, speed: 2 }), beat(g, cops[1], [spot(R.gate, -4, 7), spot(R.gate, -4, -7)], { r: 5, speed: 1.6 })];
  for (;;) {
    for (const w of walks) w.seen = false;
    p.locked = false;
    const m = g.addMarker(R.stop.x, R.stop.z, 2);
    g.hud.objective('Policemen at the arch, red on the radar. <b>Slip out</b> to the bus stop without being stopped.');
    await g.until(() => walks.some(w => w.seen) || near(p.pos, R.stop, 2.4));
    g.removeMarker(m);
    g.hud.objective();
    if (!walks.some(w => w.seen)) break;
    p.locked = true;
    await say(g, 'Officer', 'You lost, son? Where is your mother?', 2.8);
    await fade(g, 1, 0.8);
    await say(g, '', 'That is not how it went. Nobody stopped him. Nobody ever looked at him at all. Again.');
    place(g, R.hide, WEST);
    for (const w of walks) w.reset();
    await fade(g, 0, 0.8);
  }
  for (const w of walks) w.on = false;
  // That night, at the table.
  await roomScene(g, inRoom(LIVIA_ROOM, [5, -1.4], [2.5, -3.7], 1.5, 1.05), q => ({
    ma: actor(g, 'livia67', roomSpot(q, 2.5, -4.6), SOUTH, 'sit'),
    boy: actor(g, 'tonyboy', roomSpot(q, 2.4, -2.2), NORTH),
  }), async cast => {
    await talk(g, [
      [LIVIA, 'Your father has to be away a few days. Business.', cast.ma],
      [BOY, 'I saw the policemen.', cast.boy],
      [LIVIA, 'You saw nothing. You were in the yard. You are always in the yard.', cast.ma],
      [BOY, 'He takes Janice. He never takes me.', cast.boy],
      [LIVIA, 'Be glad. ...He wants to take us out west, to the desert, with that Rocco. I told him what I would do to you children before I let that happen. He did not ask twice.', cast.ma],
      [BOY, 'What would you do?', cast.boy],
      [LIVIA, 'Eat your supper.', cast.ma],
    ]);
  });
  g.hud.era(false);
  dismiss(g, janice, ...crowd, ...cops);
  await say(g, '', 'He had not thought about Rideland in thirty years. Nor about the desert.');
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Loose Lips ----------
// AJ's first Sunday at Green Grove, and what he says there.

async function looseLips(g) {
  const { home, grove, diner } = g.places, p = g.player, GROVE = g.places.rooms.GROVE;
  const two = (q, other) => ({
    livia: actor(g, 'livia', roomSpot(q, -4.68, -2), EAST, 'sit'),   // on the front of the cushion, feet on the floor
    [other]: actor(g, other, roomSpot(q, -2.32, -2), WEST, 'sit'),
    tony: actor(g, 'tony', roomSpot(q, -3.5, -3.6), SOUTH),
  });
  const camEast = inRoom(GROVE, [-0.9, 0.7], [-4, -2.3], 1.5, 1.1), camWest = inRoom(GROVE, [-6.1, 0.7], [-3, -2.3], 1.5, 1.1); // over one armchair at the face in the other

  await g.wait(1);
  g.hud.card('Loose Lips', 'The first Sunday');
  await say(g, '', 'AJ served the first Sunday of his sentence in a clean shirt.');
  g.hud.card();
  let aj = actor(g, 'aj', spot(home.drive, 2, 0), WEST), ride = follower(g, aj, { pace: 3 });
  g.hud.objective('Get in the <b>car</b> with AJ.');
  await g.until(() => p.car);
  await reach(g, grove.kerb, 'Drive AJ to <b>Green Grove</b>.', { how: 'car', r: 7 });
  await reach(g, grove.door, 'Take him <b>in</b>.', { r: 1.8, how: 'foot' });
  ride.on = false; aj.group.visible = false;
  await roomScene(g, camEast, q => two(q, 'aj'), async cast => {
    await talk(g, [
      [LIVIA, 'So. They made you come.', cast.livia],
      [AJ, 'I got in trouble. They think there is something wrong with my brain. Dad says it is nothing, and he would know, he goes to a psychiatrist.', cast.aj],
      [TONY, 'AJ. Go and get a soda.', cast.tony],
      [LIVIA, 'A psychiatrist.', cast.livia],
      [TONY, 'It is for the fainting, Ma.', cast.tony],
      [LIVIA, 'He goes to a stranger to complain about his mother. That is what they do there. I watch television. I know.', cast.livia],
      [TONY, 'Nobody talks about you.', cast.tony],
      [LIVIA, 'Everybody talks about me. Now I know to who.', cast.livia],
    ]);
  });
  place(g, grove.door, toward(grove.door, grove.kerb));
  aj.group.position.set(grove.door.x + 1.3, groundAt(grove.door.x + 1.3, grove.door.z), grove.door.z + 1); aj.group.visible = true; aj.set('idle');
  ride = follower(g, aj, { pace: 3 }); ride.pos.copy(aj.group.position);
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with AJ.');
  await g.until(() => p.car);
  await reach(g, home.road, 'Drive AJ <b>home</b>.', { how: 'car', r: 7 });
  p.locked = true;
  if (p.car) p.car.speed = 0;
  await say(g, AJ, 'Was I not supposed to say that?', 2.6);
  await say(g, TONY, 'Go inside.', 1.8);
  ride.on = false;
  dismiss(g, aj);
  await phone(g, SILVIO, 'Just so you know. Your uncle left the luncheonette a minute ago with a box of pastry. Sunday. He is going to see your mother.');
  await say(g, TONY, '...And today she has something to tell him.', 2.6);
  // Get there first.
  let his = null;
  for (;;) {
    if (his) g.removeCar(his);
    his = propCar(g, diner.kerb, diner.kerb.h, 0x55525a);
    dispatch(g, his, diner.kerb, grove.kerb, 10.5);
    const blip = { x: his.pos.x, z: his.pos.z, color: '#ffffff' }; g.blips.push(blip);
    const mk = g.addMarker(grove.kerb.x, grove.kerb.z, 7);
    g.hud.objective('<b>Drive</b> back to Green Grove before Uncle Junior gets there. He is white on the radar.');
    p.locked = false;
    let won = null;
    await g.until(() => { blip.x = his.pos.x; blip.z = his.pos.z; if (his.nav) his.nav.cruise = 10.5; if (near(his.pos, grove.kerb, 18)) won = false; else if (p.car && near(p.pos, mk, 7.5) && Math.abs(p.car.speed) < 6) won = true; return won !== null; });
    g.blips.splice(g.blips.indexOf(blip), 1);
    g.removeMarker(mk);
    g.hud.objective();
    if (won) break;
    p.locked = true;
    await fade(g, 1, 0.8);
    await say(g, '', 'He got there second. By then she had said it, slowly, and watched it land. That is the version he drove back to stop.');
    const mine = p.car || g.tonyCar; g.enterCar(mine); mine.pos.set(home.road.x, 0, home.road.z); mine.speed = 0;
    await fade(g, 0, 0.8);
  }
  his.nav = null; his.speed = 0;
  await reach(g, grove.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, camWest, q => two(q, 'junior'), async cast => {
    await talk(g, [
      [JUNIOR, 'Anthony. Twice in one day. Your mother will think she is dying.', cast.junior],
      [LIVIA, 'My son has a great deal on his mind. He needs people to talk to.', cast.livia],
      [TONY, 'Ma.', cast.tony],
      [LIVIA, 'I am only saying. Some people cannot talk to their own family. They have to pay.', cast.livia],
      [JUNIOR, 'Pay who? What is she talking about?', cast.junior],
      [TONY, 'The cable company. She wants the premium channels.', cast.tony],
      [LIVIA, '...I do not want anything. I am an old woman. Who listens.', cast.livia],
    ]);
    await say(g, '', 'She let it go, the way a cat lets a thing go. For now.');
  });
  g.removeCar(his);
  place(g, grove.door, toward(grove.door, grove.kerb));
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. Sundaes ----------
// What a man gets from his father, and what he does not have to.

async function sundaes(g) {
  const { melfi, home, gas } = g.places, p = g.player, KIOSK = g.places.rooms.KIOSK, office = g.places.doors.find(d => d.name === "Dr. Melfi's office");
  const front = g.places.doors.find(d => d.name === 'home').outside;
  const store = g.places.doors.filter(d => d.inside === KIOSK.inside).sort((a, b) => Math.hypot(a.outside.x - gas.kerb.x, a.outside.z - gas.kerb.z) - Math.hypot(b.outside.x - gas.kerb.x, b.outside.z - gas.kerb.z))[0];

  await g.wait(1);
  g.hud.card('Sundaes', "Dr. Melfi's office");
  await say(g, '', 'Thursday.', 1.8);
  g.hud.card();
  await reach(g, melfi.kerb, "Drive to <b>Dr. Melfi's office</b>.");
  await reach(g, office.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await therapy(g, [
    [TONY, 'So that is my father. And that is me. And now a woman with a clipboard tells me my son is wired wrong.'],
    [MELFI, 'You think he inherited it. Whatever it is.'],
    [TONY, 'I think my father was who he was, and I am who I am, and the kid looks at me the way I looked at him from behind that car.'],
    [MELFI, 'How did you look at him?'],
    [TONY, '...Proud. I was proud. That is what scares me.'],
    [MELFI, 'Nobody showed you there was a choice. You can show him. Not everything comes down in the blood.'],
    [TONY, 'You believe that?'],
    [MELFI, 'It is the only reason to sit in this chair.'],
  ]);
  if (p.car) g.leaveCar();
  g.setNight(1);
  place(g, office.outside, SOUTH);
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  const aj = actor(g, 'aj', spot(front, 1.2, 1.6), SOUTH);
  await reach(g, home.road, 'Drive <b>home</b>.', { how: 'car', r: 7 });
  await reach(g, spot(front, 0, 2.4), 'AJ is sitting on the <b>front step</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  approach(g, aj, 1.6);
  frame(g, p.pos, aj.group.position, { dist: 3.8, height: 1.4, lift: 1.1 });
  await talk(g, [
    [AJ, 'I cannot sleep. I am grounded from everything. Even sleeping.', aj],
    [TONY, 'Get your jacket. We are out of ice cream.', p],
    [AJ, 'It is eleven at night.', aj],
    [TONY, 'So it will not melt.', p],
  ]);
  g.cam.fixed = null;
  const ride = follower(g, aj, { pace: 3.2 });
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with AJ.');
  await g.until(() => p.car);
  await reach(g, gas.kerb, 'Drive to the <b>gas station</b>.', { how: 'car', r: 7 });
  await reach(g, store.outside, 'Go <b>in</b> to the shop.', { r: 1.8, how: 'foot' });
  await enter(g, KIOSK);
  await reach(g, KIOSK.till, 'Buy <b>ice cream</b>. And everything that goes on it.', { r: 1.6, how: 'foot' });
  p.locked = true;
  const clerk = KIOSK.clerk;
  p.heading = toward(p.pos, clerk.group.position);
  { const b = clerk.group.position; g.cam.fixed = { pos: new THREE.Vector3(b.x + 2.6, KIOSK.Y + 1.7, b.z + 2.8), look: new THREE.Vector3(b.x + 0.2, KIOSK.Y + 1.3, b.z + 0.9) }; }
  await talk(g, [
    ['Clerk', 'Vanilla, chocolate, or the one with the swirl.', clerk],
    [TONY, 'All three. The can of whipped cream. Nuts.', p],
    [AJ, 'And sprinkles.', aj],
    [TONY, 'And sprinkles. He is in training.', p],
  ]);
  g.sfx?.cash();
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, KIOSK, 'Back out to the <b>car</b>.');
  await reach(g, home.road, 'Drive <b>home</b> before it melts.', { how: 'car', r: 7 });
  await reach(g, front, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  ride.on = false; aj.group.visible = false;
  await roomScene(g, inRoom(kitchen(g), [-3.6, 2.8], [-4, -1.5], 1.6, 1.15), q => ({
    aj: actor(g, 'aj', roomSpot(q, -6.2, -1.5), EAST),
    tony: actor(g, 'tony', roomSpot(q, -1.7, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [AJ, 'Dad. Am I in trouble for the rest of my life?', cast.aj],
      [TONY, 'Till a week from Friday.', cast.tony],
      [AJ, 'Grandma was mad I said about the doctor.', cast.aj],
      [TONY, 'Your grandmother was born mad.', cast.tony],
      [AJ, 'Is it true what the school lady said? That it is how I am made?', cast.aj],
      [TONY, 'You are made fine. You are made like me. That is not the same as having to be me. Pass the whipped cream.', cast.tony],
    ]);
    await say(g, '', 'They ate standing up at the counter at midnight, like two men who had got away with something.');
  }, { night: 1 });
  dismiss(g, aj);
  g.setNight(0);
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode seven complete', 5000);
}

// ========== Episode Eight: The Legend of Tennessee Moltisanti ==========
// Word comes that a grand jury has finished its work. Everybody cleans house. Christopher, who is in nobody's
// newspaper, cannot sleep. Follows the plot of the eighth episode; every line is written for the game.

const LARRYB = 'Larry Boy', AGENT = 'Agent Harris';
// A house some way from a place: the suburbs are full of them.
const aHouse = (g, to, want) => g.places.flats.filter(f => f.door !== g.places.chris?.door).sort((a, b) => Math.abs(Math.hypot(a.kerb.x - to.x, a.kerb.z - to.z) - want) - Math.abs(Math.hypot(b.kerb.x - to.x, b.kerb.z - to.z) - want))[0];
// Indoors at the Sopranos': the player walks about the kitchen and the den.
function intoHome(g) {
  const p = g.player, door = g.places.doors.find(d => d.name === 'home');
  for (const h of door.hide || []) h.group.visible = false;
  p.inside = door;
  p.pos.set(door.inside.x, 0, door.inside.z); p.heading = g.cam.yaw = door.inside.h;
  g.cam.fixed = null;
  return door;
}

// ---------- 1. The Wedding ----------
// A reception at the Manor, a telephone call, and eleven empty tables.

async function theWedding(g) {
  const { manor, home } = g.places, p = g.player, HALL = g.places.rooms.BANQUET, T = HALL.rounds[4], T2 = HALL.rounds[5];

  await g.wait(1);
  g.hud.card('The Wedding', 'The Manor');
  await phone(g, CARMELA, "Larry Boy's daughter is getting married in forty minutes and you are not dressed. The Manor. I am leaving without you.");
  g.hud.card();
  const larry = actor(g, 'larry', T.seats[0], T.seats[0].h, 'sit'), jimmy = actor(g, 'jimmy', T.seats[1], T.seats[1].h, 'sit'), pussy = actor(g, 'pussy', T.seats[3], T.seats[3].h, 'sit');
  const wife = actor(g, 'carmela', T2.seats[0], T2.seats[0].h, 'sit'), guests = HALL.rounds.slice(0, 4).flatMap(t => [0, 2].map(k => extraAt(g, t.seats[k], t.seats[k].h, 'sit')));
  await reach(g, manor.kerb, 'Drive to <b>the Manor</b>.', { how: 'car', r: 7 });
  await reach(g, manor.door, 'Go <b>in</b>.', { r: 2, how: 'foot' });
  await enter(g, HALL);
  const stand = { x: T.x + 0.2, y: HALL.Y, z: T.z + 2.5 };
  await reach(g, stand, 'Find <b>Larry Boy</b>. He is at a round table, not eating.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.pos.set(stand.x, 0, stand.z); p.heading = NORTH;
  g.cam.fixed = { pos: new THREE.Vector3(T.x + 4.2, HALL.Y + 1.7, T.z + 3.6), look: new THREE.Vector3(T.x, HALL.Y + 1.1, T.z) };
  await talk(g, [
    [LARRYB, 'Sit. Smile. My girl is cutting a cake over there. ...I got a call an hour ago. The grand jury is finished.', larry],
    [TONY, 'Finished on who?', p],
    [JIMMY, 'Nobody knows on who. That is the beauty of it. It could be every man at this table by Friday.', jimmy],
    [PUSSY, "I have a guy in the clerk's office. He says boxes. They have ordered boxes.", pussy],
    [TONY, 'Then by tonight nobody has anything in the house. Not a gun, not a receipt, not a matchbook. Kiss the bride and go home.', p],
    [LARRYB, 'I paid for two hundred dinners.', larry],
    [TONY, 'Then they are going to be very good dinners for the hundred and sixty who stay.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, HALL, 'Go. <b>Home</b>, before a man with a warrant gets there first.');
  dismiss(g, larry, jimmy, pussy, wife, ...guests);
  for (;;) {
    if (!p.car) { g.hud.objective('Get in the <b>car</b>.'); await g.until(() => p.car); }
    if (await against(g, home.road, '<b>Drive</b> home.', 110, { r: 7 })) break;
    p.locked = true;
    await fade(g, 1, 0.8);
    await say(g, '', 'There were two grey sedans in the drive when he got there. That is the version he was driving to avoid. Again.');
    const c = p.car || g.tonyCar; g.enterCar(c); c.pos.set(manor.kerb.x, 0, manor.kerb.z); c.heading = manor.kerb.h; c.speed = 0;
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  // Twenty years of things a man keeps.
  const spots = [spot(home.car, 0.5, -25), home.grill, home.pool], notes = [
    'Behind the paint cans in the garage: two shoe boxes, heavier than shoes.',
    'Under the gas grill, in an oven glove: a pistol he had forgotten he owned.',
    'In the housing of the pool filter: the jewellery Carmela pretended not to know the price of.'];
  await rounds(g, spots, 'Go round the house. <b>Get everything out.</b>', async k => {
    p.locked = true;
    p.human.play('pickup', 'idle');
    await say(g, '', notes[k]);
    p.locked = false;
  }, { r: 2.6 });
  await reach(g, home.car, 'Put it all in the <b>car</b>.', { r: 3 });
  await say(g, TONY, 'It cannot stay in the car. And it cannot go to anybody who has ever been fingerprinted.', 3.6);
  await passed(g, 'Respect +');
}

// ---------- 2. Spring Cleaning ----------
// Everybody is burning something. Tony's goes on a shelf above his mother's good coat.

async function springCleaning(g) {
  const { bing, satriale, bodyshop, grove } = g.places, p = g.player, GROVE = g.places.rooms.GROVE;

  await g.wait(1);
  g.hud.card('Spring Cleaning', 'Thursday');
  await phone(g, SILVIO, 'Everybody is asking me what to do. I am telling them to do what you are doing. What are you doing?');
  await say(g, TONY, 'Going round to see that they do it.', 2.6);
  g.hud.card();
  const lines = [
    [SILVIO, 'The books are in the dumpster and the dumpster is on fire. Georgie is toasting a roll on it.'],
    [PAULIE, 'I am cutting up my credit cards. I do not know why. It feels right.'],
    [PUSSY, 'I have three cars in here with no papers. By tonight I will have one car, and a lot of spare parts.'],
  ];
  const fire = [];
  await rounds(g, [bing.park, satriale.kerb, bodyshop.kerb], '<b>Drive</b> round the crew. See that every one of them is cleaning house.', async k => {
    if (k === 0) fire.push(smoke(g, spot(bing.park, 6, -6), 2));
    await say(g, lines[k][0], lines[k][1]);
  });
  await say(g, TONY, 'And now mine. ...There is one closet in this state no federal judge will sign for.', 3.6);
  await shake(g, '<b>Drive.</b> Two antennas on a grey sedan. Lose it before you go anywhere near Green Grove.', { color: 0x8d8a8e });
  const ma = actor(g, 'livia', roomSpot(GROVE, -4.68, -2), EAST, 'sit');
  await reach(g, grove.kerb, 'Drive to <b>Green Grove</b>.', { how: 'car', r: 7 });
  await reach(g, grove.door, 'Carry the box <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, GROVE);
  await reach(g, roomSpot(GROVE, -3.4, -0.9), 'Find <b>your mother</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.pos.set(GROVE.X - 3.2, 0, GROVE.Z - 1.2); p.heading = toward(p.pos, ma.group.position);
  g.cam.fixed = inRoom(GROVE, [-0.9, 0.7], [-4, -2.3], 1.5, 1.1).cam;
  await talk(g, [
    [TONY, 'Ma. I need to leave a few things in your closet. Winter clothes.', p],
    [LIVIA, 'In May.', ma],
    [TONY, "They are Carmela's. She has no room.", p],
    [LIVIA, 'Put them where you like. Nobody asks me. What is in the box?', ma],
    [TONY, 'Shoes.', p],
    [LIVIA, 'It is very heavy, for shoes.', ma],
  ]);
  await say(g, '', 'He put forty thousand dollars and a pistol on the shelf above her good coat, and kissed her on the top of the head.');
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, GROVE, 'Go back out to the <b>car</b>.');
  dismiss(g, ma);
  for (const f of fire) f?.stop?.();
  await passed(g, 'Respect +');
}

// ---------- 3. Bad Dreams ----------
// Played as Christopher. A man he buried in the winter keeps coming back to say where the bullet is.

async function badDreams(g) {
  const { satriale, bing, marsh } = g.places, p = g.player, tony = p.human;
  const lane = { x: nodeX(0), z: marsh.z }, north = { x: nodeX(NX) + 3.6, z: bounds.minZ + 34 }, sand = g.places.chop;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Christopher had not slept through a night in a week.');
  if (p.car) g.leaveCar();
  g.setNight(1);
  // The dream is in the store, where it happened.
  const store = g.places.shopRoom, dx = store.inside.x, dz = store.inside.z - 3.2;
  asOther(g, 'christopher', { x: dx + 0.2, z: dz - 0.2 }, NORTH);
  for (const a of store.ambient) a.group.visible = false;
  const emil = actor(g, 'kolar', { x: dx - 1.3, y: -0.1, z: dz - 2 }, SOUTH);
  g.hud.panic(0.35); g.cam.sway = 0.5;
  g.cam.fixed = { pos: new THREE.Vector3(dx + 3.4, 1.5, dz + 2), look: new THREE.Vector3(dx - 0.6, 1.1, dz - 1.4) };
  await fade(g, 0, 1.2);
  await talk(g, [
    ['Emil Kolar', 'You left one in the table, Christopher. A bullet. They will dig it out of the wood, and it will have your name on it.', emil],
    [CHRIS, 'You are dead. I did it myself.', p],
    ['Emil Kolar', 'So come and look.', emil],
  ]);
  await fade(g, 1, 0.8);
  g.hud.panic(0); g.cam.sway = 0;
  dismiss(g, emil);
  for (const a of store.ambient) a.group.visible = true;
  g.cam.fixed = null;
  // Awake, at the Bing, at two in the morning.
  place(g, spot(bing.door, 0, 1.6), SOUTH);
  const car = propCar(g, bing.park, bing.park.h, 0x8a1c2a, 'coupe'), georgie = actor(g, 'georgie', spot(bing.door, 1.6, 2.4), WEST);
  frame(g, p.pos, georgie.group.position, { dist: 4.2 });
  await playing(g, 'Christopher Moltisanti', "Tony's nephew. You play him in this one");
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Bad Dreams', 'The Bada Bing, 2 a.m.');
  await talk(g, [
    [CHRIS, 'Georgie. Get a shovel. Get two shovels.', p],
    [GEORGIE, 'For what?', georgie],
    [CHRIS, 'We planted something in the marsh in the winter. I want to see that it is still planted.', p],
    [GEORGIE, 'Now? It is two in the morning.', georgie],
    [CHRIS, 'When did you want to do it, lunch?', p],
  ]);
  g.cam.fixed = null;
  const with_ = follower(g, georgie);
  p.locked = false;
  await wantCar(g, car, 'Get in the <b>red coupe</b>.');
  car.driverless = false;
  await reach(g, lane, '<b>Drive</b> out to the marsh road.', { how: 'car', r: 7 });
  await reach(g, marsh, 'Walk out into the <b>reeds</b>.', { r: 2.6, how: 'foot' });
  // Digging, and a pair of headlamps.
  const dig = async (n, of) => { g.hud.objective(`Dig. &nbsp; <b>${n} of ${of}</b>`); p.locked = true; p.human.play('kneel', 'idle'); await g.wait(2.3); g.sfx?.punch?.(false); p.locked = false; };
  await dig(1, 3);
  await dig(2, 3);
  const patrol = propCar(g, { x: lane.x + 3.6, z: lane.z - 120 }, SOUTH, 0xf4f4f0, 'police');
  for (;;) {
    patrol.pos.set(lane.x + 3.6, 0, lane.z - 120); patrol.speed = 0;
    let moved = false, gone = false;
    g.hud.objective('Headlamps on the marsh road. <b>Keep still</b> until they have gone by.');
    g.updaters.push(dt => { if (gone) return false; patrol.pos.z += 13 * dt; patrol.sync?.(); if (patrol.pos.z > lane.z + 130) gone = true; return true; });
    await g.wait(1.2);
    await g.until(() => { if (p.motion !== 'idle' || p.car) moved = true; return gone || moved; });
    g.hud.objective();
    if (!moved) break;
    gone = true;
    p.locked = true;
    await fade(g, 1, 0.8);
    await say(g, '', 'The car slowed. A torch came over the reeds. They lay in six inches of water for ten minutes, and then started again.');
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  g.removeCar(patrol);
  await dig(3, 3);
  p.locked = true;
  await talk(g, [
    [GEORGIE, 'Oh, Madonna. He has still got his watch on.', georgie],
    [CHRIS, 'Take the feet.', p],
  ]);
  p.locked = false;
  await wantCar(g, car, 'Carry him to the <b>car</b>.');
  const trunk = careful(g, 'The trunk', 'The trunk came up at a bump. They stopped under a street lamp to shut it, which is not where anybody wants to shut a trunk. Again.', () => { if (p.car) g.leaveCar(); car.pos.set(lane.x, 0, lane.z); car.heading = NORTH; car.speed = 0; g.enterCar(car); });
  await trunk.to(north, '<b>Drive</b> to the north end of the beach. Nothing that makes anybody look.', car);
  trunk.stop();
  await reach(g, sand, 'Out on the <b>sand</b>, past the last lamp.', { r: 2.6, how: 'foot' });
  await dig(1, 2);
  await dig(2, 2);
  p.locked = true;
  with_.on = false;
  shot(g, spot(sand, -4, 3), sand, 1.5, 1);
  await talk(g, [
    [CHRIS, 'Now nobody knows where he is but us.', p],
    [GEORGIE, 'And him.', georgie],
    [CHRIS, '...Do not say things like that to me this week.', p],
  ]);
  await fade(g, 1, 1);
  dismiss(g, georgie);
  g.removeCar(car);
  g.cam.fixed = null;
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. The Bakery ----------
// Played as Christopher. Tony sends him for pastry. There is a line.

async function theBakery(g) {
  const { cafe, bing } = g.places, p = g.player, tony = p.human, SHOP = g.places.rooms.BEAN, clerk = SHOP.clerk;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Tony sent him for pastry. It was that kind of week.');
  if (p.car) g.leaveCar();
  g.setNight(0);
  asOther(g, 'christopher', between(cafe.kerb, cafe.door, 0.4), toward(cafe.kerb, cafe.door));
  await playing(g, 'Christopher Moltisanti', 'You play him in this one');
  const car = propCar(g, cafe.kerb, cafe.kerb.h, 0x8a1c2a, 'coupe');
  const line = [extraAt(g, { x: SHOP.till.x, y: SHOP.Y, z: SHOP.till.z + 0.2 }, NORTH), extraAt(g, { x: SHOP.till.x + 0.2, y: SHOP.Y, z: SHOP.till.z + 1.5 }, NORTH)];
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'The Bakery', 'A box of sfogliatelle, for the Bing');
  p.locked = false;
  await reach(g, cafe.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, SHOP);
  const queue = { x: SHOP.till.x - 0.1, y: SHOP.Y, z: SHOP.till.z + 2.9 };
  await reach(g, queue, 'There is a line. <b>Stand in it.</b>', { r: 1.2, how: 'foot' });
  p.locked = true;
  p.pos.set(queue.x, 0, queue.z); p.heading = NORTH;
  clerk.group.rotation.y = SOUTH;
  g.cam.fixed = { pos: new THREE.Vector3(SHOP.till.x + 3.4, SHOP.Y + 1.9, SHOP.till.z + 3.4), look: new THREE.Vector3(SHOP.till.x, SHOP.Y + 1.3, SHOP.till.z - 0.4) };
  await say(g, '', 'Four minutes. Six. A woman who had come in after him was served a loaf.');
  await talk(g, [
    ['Clerk', 'Thirty-four.', clerk],
    [CHRIS, 'I have been standing here ten minutes.', p],
    ['Clerk', 'You have to take a number, sir. Thirty-four?', clerk],
    [CHRIS, 'Do you know who I am?', p],
    ['Clerk', 'A man with no number.', clerk],
    [CHRIS, '...Christopher Moltisanti. Remember it. You will want to write it on a cake.', p],
  ]);
  g.cam.fixed = null;
  dismiss(g, ...line);
  g.noHeat = true;
  g.giveWeapon('pistol');
  const mark = g.addNpc(clerk, { health: 600, cash: 0, stays: true });
  p.locked = false;
  g.hud.objective('<b>Do it.</b> One, in the floor, by his foot.');
  await g.until(() => mark.health < 600);
  g.hud.objective();
  g.removeNpc(clerk);
  p.locked = true;
  g.sfx?.scream();
  clerk.after = null; clerk.set('crouch');
  await talk(g, [
    ['Clerk', 'My foot! You shot me in the foot!', clerk],
    [CHRIS, 'It will heal. A box of the sfogliatelle. And the cannoli, the ones at the back you were keeping.', p],
  ]);
  g.sfx?.cash();
  p.locked = false;
  await walkOut(g, SHOP, 'Take the box and <b>go</b>.');
  clerk.set('idle'); clerk.group.rotation.y = SOUTH;
  await loseHeat(g, 2, 'Somebody has telephoned. <b>Lose the police</b> before you go near the Bing.');
  await reach(g, bing.park, '<b>Drive</b> the box to the Bada Bing.', { how: 'car', r: 7 });
  p.locked = true;
  let boss;
  await cut(g, () => {
    boss = actor(g, 'tony', spot(bing.door, 0, 1.4), SOUTH);
    place(g, spot(bing.door, 0.4, 3.4), NORTH, bing.park);
    frame(g, p.pos, boss.group.position, { dist: 4.2 });
  });
  await talk(g, [
    [TONY, 'Forty minutes, for pastry.', boss],
    [CHRIS, 'There was a line.', p],
    [TONY, 'Why is there a hole in the box?', boss],
  ]);
  await fade(g, 1, 1);
  dismiss(g, boss);
  g.removeCar(car);
  g.noHeat = false;
  g.pardon();
  g.cam.fixed = null;
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. The Raid ----------
// Played as an agent with a warrant, in a house where there is nothing left to find.

async function theRaid(g) {
  const { home } = g.places, p = g.player, tony = p.human, R = kitchen(g), front = g.places.doors.find(d => d.name === 'home');

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Thursday, six in the evening. The Sopranos were sitting down to eat when the bell went.');
  if (p.car) g.leaveCar();
  g.setNight(0);
  asOther(g, 'agent', spot(front.outside, 0.9, 1.6), NORTH);
  await playing(g, 'Agent Grasso', 'F.B.I. You play him in this one');
  const cars = [propCar(g, home.road, EAST, 0x8d8a8e), propCar(g, spot(home.road, 9, 0), EAST, 0x23232b)];
  const harris = actor(g, 'agent', spot(front.outside, -0.6, 0.9), NORTH), wife = actor(g, 'carmela', spot(front.outside, 0, -0.9), SOUTH);
  shot(g, spot(front.outside, 4, 4.6), spot(front.outside, 0, 0), 1.6, 1.4);
  g.hud.fade(0, 1.2);
  await titleCard(g, 'The Raid', 'North Shore, 6:04 p.m.');
  await talk(g, [
    [AGENT, 'Mrs. Soprano. We have a warrant for the house and the garage. We will try not to be long.', harris],
    [CARMELA, 'You have a warrant, you wipe your feet.', wife],
  ]);
  await fade(g, 1, 0.6);
  dismiss(g, harris, wife);
  intoHome(g);
  const at = (x, z) => roomSpot(R, x, z);
  const fam = { tony: actor(g, 'tony', at(-1.7, -1.5), WEST), carmela: actor(g, 'carmela', at(-6.2, -1.5), EAST), aj: actor(g, 'aj', at(-5.4, 0.9), EAST), meadow: actor(g, 'meadow', at(-2.6, 0.9), WEST) };
  const boss = actor(g, 'agent', at(-0.4, 2.4), WEST);
  await fade(g, 0, 0.6);
  p.locked = false;
  const finds = [
    'The kitchen drawers: takeaway menus, batteries, a rosary, and the instructions for a bread machine.',
    'The freezer: steaks. Forty pounds of steaks, and nothing under them.',
    'The den: a computer. It goes in a box. It will turn out to be full of homework.',
    'The hall cupboard. A bowl comes off the shelf with the coats, and breaks on the tile.'];
  await rounds(g, [at(-4, -3.6), at(-6.1, 1.4), at(3, -1.6), at(-3.4, 3.4)], 'Search the house. <b>Everything.</b>', async k => {
    p.locked = true;
    p.human.play('pickup', 'idle');
    if (k === 3) g.sfx?.crash?.(0.4);
    await say(g, '', finds[k]);
    p.locked = false;
  }, { r: 1.5 });
  p.locked = true;
  g.cam.fixed = inRoom(R, [-3.6, 3.4], [-3.2, -0.6], 1.6, 1.2).cam;
  await talk(g, [
    [TONY, "That was my mother-in-law's.", fam.tony],
    [AGENT, 'Grasso. Pick it up.', boss],
  ]);
  p.human.play('pickup', 'idle');
  await say(g, '', 'Agent Grasso picked up the pieces of a bowl while a gangster watched him do it. It was the only thing the Bureau took out of that house all week that it was sorry about.');
  await fade(g, 1, 1);
  dismiss(g, boss, ...Object.values(fam));
  for (const h of p.inside?.hide || []) h.group.visible = true;
  p.inside = null;
  for (const c of cars) g.removeCar(c);
  g.cam.fixed = null;
  homeAsTony(g, tony);
  // Afterwards, at the table.
  await roomScene(g, inRoom(R, [-3.6, 2.8], [-4, -1.5], 1.6, 1.15), q => ({
    carmela: actor(g, 'carmela', roomSpot(q, -6.2, -1.5), EAST),
    aj: actor(g, 'aj', roomSpot(q, -4.6, 0.7), NORTH),
    meadow: actor(g, 'meadow', roomSpot(q, -3.2, 0.7), NORTH),
    tony: actor(g, 'tony', roomSpot(q, -1.7, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [AJ, 'Why do they hate us?', cast.aj],
      [TONY, 'They do not hate us. It is a job. They get a pension out of it.', cast.tony],
      [MEADOW, 'One of them was Italian. Grasso.', cast.meadow],
      [TONY, 'He was. And somewhere his mother tells the neighbours he is in insurance.', cast.tony],
      [CARMELA, 'Eat. It has been in and out of the oven twice.', cast.carmela],
    ]);
  });
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. In the Paper ----------
// A man wants his name known. Then it is.

async function inThePaper(g) {
  const { bing, cafe, diner, gas } = g.places, p = g.player, tony = p.human, his = g.places.flat || aHouse(g, bing.door, 260);

  await g.wait(1);
  g.hud.card('In the Paper', "Christopher's place");
  await phone(g, ADRIANA, 'He will not get off the couch. He says he has no arc. I do not know what that is, and I do not think he does.');
  g.hud.card();
  const chris = actor(g, 'christopher', spot(his.door, 0.2, 1.3), SOUTH);
  await reach(g, his.kerb, "Drive to <b>Christopher's place</b>.");
  await reach(g, spot(his.door, 0.2, 3.2), 'He is on the <b>step</b>.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, chris.group.position);
  frame(g, p.pos, chris.group.position, { dist: 4 });
  await talk(g, [
    [TONY, 'You shot a man in a bakery.', p],
    [CHRIS, 'In the foot.', chris],
    [TONY, 'What is the matter with you?', p],
    [CHRIS, 'Brendan is dead, and he is in the newspaper. A soldier, they called him. I am alive and I am nobody. Where is my name?', chris],
    [TONY, 'Your name. The whole point of the thing is that nobody knows your name.', p],
    [CHRIS, 'I dream about a man I put in the ground. I think I have the cancer.', chris],
    [TONY, 'You have self-pity. There is a lot of it going round. Go to work.', p],
  ]);
  await fade(g, 1, 1);
  dismiss(g, chris);
  g.cam.fixed = null;
  // The next morning.
  await say(g, '', 'At seven the next morning his mother telephoned. She had seen the newspaper.');
  asOther(g, 'christopher', spot(his.door, 0.2, 1.6), SOUTH);
  await playing(g, 'Christopher Moltisanti', 'You play him in this one');
  const car = propCar(g, his.kerb, his.kerb.h, 0x8a1c2a, 'coupe');
  await fade(g, 0, 1);
  p.locked = false;
  await wantCar(g, car, 'Get in the <b>red coupe</b>.');
  car.driverless = false;
  const said = ['Page eleven, under the furniture sale. He read it standing in the road.', '"Christopher Moltisanti, reputed associate of the Soprano crew." Spelled right.', 'He took every copy in the box, and left the quarter.'];
  await rounds(g, [cafe.kerb, (diner || gas).kerb, bing.park], '<b>Drive</b> round the newspaper boxes. Take every copy.', async k => { p.human.play?.('pickup', 'idle'); await say(g, '', said[k]); });
  p.locked = true;
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  const passer = extraAt(g, spot(p.pos, 2, 1.2), toward(spot(p.pos, 2, 1.2), p.pos));
  frame(g, p.pos, passer.group.position, { dist: 4 });
  await talk(g, [
    [CHRIS, 'Hey. You. That is me. Moltisanti. With an S in the middle.', p],
    ['Passer-by', 'Congratulations?', passer],
  ]);
  await fade(g, 1, 1);
  g.untrack(passer.group);
  g.removeCar(car);
  g.cam.fixed = null;
  await say(g, '', 'At Green Grove that afternoon Livia Soprano mentioned to her brother-in-law, in passing, the way one mentions the weather, that her son was seeing a psychiatrist.');
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode eight complete', 5000);
}

// ========== Episode Nine: Boca ==========
// A soccer coach who is leaving, fathers who would rather he stayed, and then something that changes what they
// want. And a walk in the park with Uncle Junior. Follows the plot of the ninth episode; every line is written for the game.

const HAUSER = 'Coach Hauser';

// ---------- 1. The Coach ----------
// The semi-final, and an announcement on the touchline.

async function theCoach(g) {
  const { home, school } = g.places, p = g.player, lot = school.lot, line = spot(lot, -9, 5);

  await g.wait(1);
  g.setNight(0);
  g.hud.card('The Coach', 'Saturday morning');
  const meadow = actor(g, 'meadow', spot(home.drive, 2, 0.5), WEST), ride = follower(g, meadow, { pace: 3.2 });
  await say(g, MEADOW, 'Dad! Kick-off is at ten. If I am late Coach benches me, and it is the semi-final.', 3.6);
  g.hud.card();
  // The field is there before they are: the coach, the girls, two fathers on the line.
  const coach = actor(g, 'hauser', spot(lot, 1, -7), SOUTH), artie = actor(g, 'artie', spot(line, 1.6, -0.4), NORTH), sil = actor(g, 'silvio', spot(line, 3.2, 0), NORTH);
  const girl = k => ({ body: 'female', shirt: 0x2f56c8, tee: true, pants: 0xf4f4f0, shoes: 0xf2efe8, hair: [0x2a1a14, 0xd9b25a, 0x7a3b1a, 0x111111][k % 4], hairMesh: 'long', height: 0.88, head: 1.1 });
  const team = [[-5, -3], [3, -2], [7, 1], [-2, 2], [5, 5]].map(([x, z], k) => extraAt(g, spot(lot, x, z), k % 2 ? EAST : WEST, k % 2 ? 'run' : 'idle', girl(k)));
  for (;;) {
    g.hud.objective('Get in the <b>car</b> with Meadow.');
    await g.until(() => p.car);
    const hush = banter(g, [[MEADOW, 'Coach Hauser says I read the game better than anybody he has had.'], [TONY, 'You get that from me.'], [MEADOW, 'He says a scout from a university is coming in the spring.'], [TONY, 'For you?'], [MEADOW, 'For him.']]);
    const ok = await against(g, school.gate, '<b>Drive</b> Meadow to the match.', 100, { r: 7 });
    hush();
    if (ok) break;
    p.locked = true;
    await fade(g, 1, 0.8);
    await say(g, '', 'They came through the gate at ten past. She did not speak to him again until Tuesday. He drove it again.');
    const c = p.car || g.tonyCar; g.enterCar(c); c.pos.set(home.road.x, 0, home.road.z); c.speed = 0;
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  await reach(g, line, 'Stand on the <b>touchline</b> with the other fathers.', { r: 2, how: 'foot' });
  p.locked = true;
  ride.on = false;
  meadow.group.position.set(lot.x + 0.5, groundAt(lot.x, lot.z), lot.z + 0.5); meadow.group.visible = true; meadow.set('run');
  p.pos.set(line.x, 0, line.z); p.heading = NORTH;
  shot(g, spot(line, -3.4, 2.6), spot(line, 2.4, -1), 1.6, 1.3);
  await talk(g, [
    [ARTIE, 'Your girl is the best one out there, Tony. Mine runs like she is late for a bus.', artie],
    [SILVIO, 'It is the coach. Three years ago this school could not beat a convent.', sil],
  ]);
  await say(g, '', 'Verbum Dei won four to one. Meadow made two of them and scored the last.');
  for (const t of team) t.set('idle');
  meadow.set('idle');
  coach.group.position.set(line.x + 1.2, groundAt(line.x, line.z), line.z - 2.6); coach.group.rotation.y = SOUTH;
  await talk(g, [
    [HAUSER, 'Gentlemen. I wanted the fathers to hear it from me, and not in a letter. I have taken a job at a university, upstate. This is my last season.', coach],
    [TONY, 'In the middle of a winning streak.', p],
    [HAUSER, 'It is a very good job, Mr. Soprano.', coach],
  ]);
  coach.group.visible = false;
  await talk(g, [
    [ARTIE, 'So that is that.', artie],
    [TONY, 'Nothing is ever that. A man can be shown he is appreciated.', p],
    [SILVIO, 'A television. Everybody likes a television.', sil],
    [TONY, 'A big one.', p],
  ]);
  await cut(g, () => { dismiss(g, coach, artie, sil, meadow, ...team); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. A Gift ----------
// Played as Paulie. Fifty inches, a pickup, and a man who will not take it.

async function aGift(g) {
  const { bing, pawn, school } = g.places, p = g.player, tony = p.human, his = aHouse(g, school.gate, 300), dh = his.door.h ?? SOUTH, step = spot(his.door, 0, Math.cos(dh) * 2.6);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Showing appreciation fell to Paulie Gualtieri, who had opinions about it.');
  if (p.car) g.leaveCar();
  g.setNight(0);
  asOther(g, 'paulie', spot(bing.door, 0, 1.6), SOUTH);
  await playing(g, 'Paulie', 'Soldier. You play him in this one');
  const truck = propCar(g, bing.park, bing.park.h, 0x3b4a66, 'pickup'), chris = actor(g, 'christopher', spot(bing.door, 1.6, 2.6), WEST);
  const coach = actor(g, 'hauser', spot(his.door, 0, Math.cos(dh) * 1.1), dh);
  frame(g, p.pos, chris.group.position, { dist: 4.2 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'A Gift', 'From the fathers');
  await talk(g, [
    [CHRIS, 'Fifty inches. It is in the back room at the pawnbroker. He is expecting you.', chris],
    [PAULIE, 'I am a made man, and I am delivering a television.', p],
    [CHRIS, 'With a remote.', chris],
  ]);
  g.cam.fixed = null;
  dismiss(g, chris);
  p.locked = false;
  await wantCar(g, truck, 'Get in the <b>pickup</b>.');
  truck.driverless = false;
  await reach(g, pawn.kerb, "<b>Drive</b> to the pawnbroker's.", { how: 'car', r: 7 });
  p.locked = true;
  truck.speed = 0;
  await say(g, '', 'It took two men and a blanket, and Paulie supervised.');
  p.locked = false;
  const load = careful(g, 'The screen', 'Something inside the box went "tink". He turned round and went back for another.', () => { if (p.car) g.leaveCar(); truck.pos.set(pawn.kerb.x, 0, pawn.kerb.z); truck.heading = pawn.kerb.h; truck.speed = 0; g.enterCar(truck); });
  await load.to(his.kerb, "<b>Drive</b> it to the coach's house. Glass side up.", truck);
  load.stop();
  await reach(g, step, 'Carry it to the <b>door</b>.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, coach.group.position);
  frame(g, p.pos, coach.group.position, { dist: 4 });
  await talk(g, [
    [HAUSER, 'What is this?', coach],
    [PAULIE, 'A token. From the fathers. So you know how the team feels about you staying.', p],
    [HAUSER, 'I cannot accept that. Please thank Mr. Soprano for me. But I am going, and it is not about a television.', coach],
    [PAULIE, 'It has a picture inside the picture. You can watch two games.', p],
    [HAUSER, 'Good night.', coach],
  ]);
  await say(g, '', 'Paulie left it on the lawn, on the principle that a gift cannot be handed back if nobody is holding it.');
  g.cam.fixed = null;
  dismiss(g, coach);
  p.locked = false;
  await wantCar(g, truck, 'Get in the <b>pickup</b>.');
  const hush = banter(g, [[PAULIE, 'A university. What does a university want with soccer.'], [PAULIE, 'In my day you gave a man a television, he stayed where he was.']]);
  await reach(g, bing.park, '<b>Drive</b> back to the Bing.', { how: 'car', r: 7 });
  hush();
  p.locked = true;
  await fade(g, 1, 1);
  g.removeCar(truck);
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 3. Boca ----------
// A walk round the pond with Uncle Junior, who is back from Florida with something he does not want known.

async function boca(g) {
  const { park } = g.places, p = g.player, bench = park.bench, pond = park.pond;

  await g.wait(1);
  g.setNight(0);
  g.hud.card('Boca', 'The park');
  await phone(g, JUNIOR, 'I am back from Florida. Come and walk with me. The doctor says I should walk, and I will not do it alone, like a widow.');
  g.hud.card();
  const junior = actor(g, 'junior', spot(bench, 0, 0.2), SOUTH, 'sit'), mikey = actor(g, 'mikey', spot(park.kerb, -2, -2.4), WEST), car = propCar(g, spot(park.kerb, 0, -9), park.kerb.h, 0x55525a);
  await reach(g, park.kerb, 'Drive to the <b>park</b>.');
  await reach(g, spot(bench, 1.8, 1.6), 'He is on the <b>bench</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, junior.group.position);
  shot(g, spot(bench, 0.6, 5), spot(bench, 0.4, 0.6), 1.6, 1.1);
  await talk(g, [
    [JUNIOR, 'Florida. Seventy-eight degrees, and everybody is dying. I loved it.', junior],
    [TONY, 'I hear you had company.', p],
    [JUNIOR, 'A friend. Sixteen years. It is nobody else\'s business. Help me up.', junior],
  ]);
  g.cam.fixed = null;
  junior.set('idle');
  junior.group.position.set(bench.x + 0.6, groundAt(bench.x, bench.z), bench.z + 1.4);
  const walk = follower(g, junior, { gap: 1.5, pace: 2.6, runs: false });
  walk.pos.copy(junior.group.position);
  p.locked = false;
  // Three stretches of path, and what gets said on each.
  const legs = [
    [spot(pond, 11.5, 4), [[TONY, 'Carmela hears things at the nail place. About Boca. About how attentive you are.'], [JUNIOR, 'Who said that? Who is saying that?'], [TONY, 'It is a compliment, Uncle Jun. In some circles.']]],
    [spot(pond, 2, 12), [[JUNIOR, 'You think it is funny. A man of my age, in my position. If that goes round, they will make jokes at the table.'], [TONY, 'I would never.'], [JUNIOR, 'You are doing it now.']]],
    [spot(pond, -11.5, 3), [[JUNIOR, 'At least I can talk to a woman without paying her by the hour. With a diploma on her wall.'], [TONY, '...What did you say?'], [JUNIOR, 'I said what I said. You walk on. My hip hurts.']]],
  ];
  for (const [at, lines] of legs) {
    await reach(g, at, 'Walk round the <b>pond</b> with him. He does not hurry.', { r: 2.2, how: 'foot' });
    for (const [who, text] of lines) await say(g, who, text);
  }
  p.locked = true;
  walk.stay = true;
  junior.group.rotation.y = toward(junior.group.position, p.pos);
  frame(g, p.pos, junior.group.position, { dist: 4.4 });
  await say(g, '', 'He ran through who knew, on the way back to the car. It was a short list, and he did not like one name on it.');
  await say(g, '', 'That night Corrado Soprano ended sixteen years with one telephone call, so that there would be nothing left for anybody to laugh at.');
  await cut(g, () => { walk.on = false; dismiss(g, junior, mikey); g.removeCar(car); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. What Meadow Said ----------
// Something the team knows and the school does not. Then two men in a parked car, played as Silvio.

async function whatMeadowSaid(g) {
  const { home, bing, bingRoom: club, school } = g.places, p = g.player, tony = p.human, front = g.places.doors.find(d => d.name === 'home').outside, his = aHouse(g, school.gate, 300);
  let sil, paulie, chris;

  await g.wait(1);
  g.hud.card('What Meadow Said', 'North Shore');
  await say(g, '', 'On Monday Meadow came home from practice and did not go to her room.');
  g.hud.card();
  await reach(g, home.road, 'Drive <b>home</b>.');
  await reach(g, front, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(kitchen(g), [-3.6, 2.8], [-4, -1.5], 1.6, 1.15), q => ({
    carmela: actor(g, 'carmela', roomSpot(q, -6.2, -1.5), EAST),
    meadow: actor(g, 'meadow', roomSpot(q, -4, 0.7), NORTH),
    tony: actor(g, 'tony', roomSpot(q, -1.7, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [MEADOW, 'Ally is in the hospital. She took something. They say she is going to be all right.', cast.meadow],
      [CARMELA, 'Ally? Why would a girl like that...', cast.carmela],
      [MEADOW, 'Because of Coach Hauser. He has been seeing her. Since the autumn. She is fifteen, Mom.', cast.meadow],
      [TONY, '...Who else knows this?', cast.tony],
      [MEADOW, 'The team. Not the school. She made every one of us swear.', cast.meadow],
      [TONY, 'Go upstairs.', cast.tony],
    ]);
    await say(g, '', 'He stood in the kitchen for a while with one hand flat on the counter. Carmela knew the look, and did not ask what it meant.');
  });
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1);
  p.locked = false;
  const room = await intoBing(g, 'Drive to the <b>Bada Bing</b>.', c => {
    sil = actor(g, 'silvio', spot(c.door, 2.2, -1.2), WEST); paulie = actor(g, 'paulie', spot(c.door, 0.8, -2.2), SOUTH); chris = actor(g, 'christopher', spot(c.door, -0.8, -2.2), SOUTH);
  });
  await cut(g, () => { place(g, room.door, NORTH, bing.park); frame(g, p.pos, paulie.group.position, { dist: 5 }); }, 0.4);
  await talk(g, [
    [TONY, 'The coach. He does not get as far as the university.', p],
    [PAULIE, 'The television man? I carried a television up his path.', paulie],
    [TONY, 'He has been at one of the girls. A child. She is in the hospital.', p],
    [SILVIO, '...Say when.', sil],
    [TONY, 'Find out where he is at night. Then you wait until I say.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, club, 'Go out to the <b>car</b>.');
  dismiss(g, sil, paulie, chris);
  // Silvio, that night, outside the school.
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Evening practice finished at eight.');
  g.setNight(1);
  asOther(g, 'silvio', spot(school.gate, -14, 3), EAST);
  await playing(g, 'Silvio Dante', "Tony's right hand. You play him in this one");
  const mine = propCar(g, spot(school.gate, -14, 0), EAST, 0x23232b), wagon = propCar(g, school.gate, EAST, 0xb9a58a, 'suv');
  const kid = actor(g, 'christopher', spot(school.gate, -12.4, 3.6), WEST), with_ = follower(g, kid);
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  await wantCar(g, mine, 'Get in the <b>black sedan</b>.');
  mine.driverless = false;
  for (;;) {
    dispatch(g, wagon, school.gate, his.kerb, 9);
    if (await tail(g, wagon, his.kerb, "<b>Follow the</b> coach's wagon home. Stay back.")) break;
    p.locked = true;
    await say(g, CHRIS, 'We lost him. Go round. He will come out of the school gate again, he forgot his whistle.', 3.4);
    await cut(g, () => { g.enterCar(mine); mine.pos.set(school.gate.x - 14, 0, school.gate.z); mine.heading = EAST; mine.speed = 0; wagon.pos.set(school.gate.x, 0, school.gate.z); wagon.sync?.(); });
    p.locked = false;
  }
  p.locked = true;
  if (p.car) p.car.speed = 0;
  with_.on = false;
  await say(g, '', 'They parked under a tree with the engine off. Christopher ate sunflower seeds. The telephone did not ring.');
  await fade(g, 1, 1);
  dismiss(g, kid);
  g.removeCar(mine); g.removeCar(wagon);
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Hesitation ----------
// A friend at the door, a doctor's question, and a car under a tree with its telephone switched off.

async function hesitation(g) {
  const { melfi, school } = g.places, p = g.player, front = g.places.doors.find(d => d.name === 'home').outside, his = aHouse(g, school.gate, 300), dh = his.door.h ?? SOUTH;
  const office = g.places.doors.find(d => d.name === "Dr. Melfi's office"), along = { x: Math.sin(his.kerb.h), z: Math.cos(his.kerb.h) };

  await g.wait(1);
  g.setNight(1);
  g.hud.card('Hesitation', 'North Shore, nine at night');
  const artie = actor(g, 'artie', spot(front, 0.3, 1.4), SOUTH);
  await say(g, '', 'Artie Bucco came to the house that night, and would not come in.');
  g.hud.card();
  await reach(g, spot(front, 0.3, 3.4), 'Artie is at the <b>door</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, artie.group.position);
  frame(g, p.pos, artie.group.position, { dist: 4 });
  await talk(g, [
    [ARTIE, 'Charmaine heard, from one of the mothers. And then I heard what you mean to do about it.', artie],
    [TONY, 'You heard nothing.', p],
    [ARTIE, 'I wanted to do it myself, Tony. I stood in my kitchen holding a knife. And then what am I? What do I tell my girl I am?', artie],
    [TONY, 'You tell her nothing. That is how it is done.', p],
    [ARTIE, 'There are police. It is what they are for. Just this one time, let it be them.', artie],
    [TONY, 'Go home, Artie.', p],
  ]);
  await cut(g, () => { dismiss(g, artie); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, melfi.kerb, "Drive to <b>Dr. Melfi's office</b>. She is seeing him late.");
  await reach(g, office.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await therapy(g, [
    [TONY, 'A man hurt a child. Everybody knows it. And I am supposed to wait for twelve people and a judge.'],
    [MELFI, 'Why does it fall to you?'],
    [TONY, 'Because I can. Because nobody else will.'],
    [MELFI, 'Somebody else will. There is a whole machinery for it. It is slow, and it is often stupid, and it is not you.'],
    [TONY, 'You want me to do nothing.'],
    [MELFI, 'I want to know why doing nothing is the one thing you cannot bear.'],
    [TONY, '...I have to make a telephone call.'],
  ]);
  if (p.car) g.leaveCar();
  place(g, office.outside, SOUTH);
  g.setNight(1);
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  await say(g, TONY, 'Silvio. Pick up. ...Pick up.', 2.8);
  await say(g, '', 'The telephone in the car under the tree had been switched off, the way he had taught them.');
  // Get there before they stop waiting.
  const sil = actor(g, 'silvio', { x: his.kerb.x - along.x * 9 + along.z * 2, z: his.kerb.z - along.z * 9 - along.x * 2 }, his.kerb.h), kid = actor(g, 'christopher', { x: his.kerb.x - along.x * 10.6 + along.z * 2.4, z: his.kerb.z - along.z * 10.6 - along.x * 2.4 }, his.kerb.h);
  const theirs = propCar(g, { x: his.kerb.x - along.x * 12, z: his.kerb.z - along.z * 12 }, his.kerb.h, 0x23232b), coach = actor(g, 'hauser', spot(his.door, 0, Math.cos(dh) * 1.1), dh);
  coach.group.visible = false;
  for (;;) {
    if (!p.car) { g.hud.objective('Get in the <b>car</b>.'); await g.until(() => p.car); }
    if (await against(g, his.kerb, "<b>Drive</b> to the coach's street before they stop waiting.", 105, { r: 7 })) break;
    p.locked = true;
    await fade(g, 1, 0.8);
    await say(g, '', 'He was two minutes late. He was always going to be two minutes late, unless he drove it again.');
    const c = p.car || g.tonyCar; g.enterCar(c); c.pos.set(melfi.kerb.x, 0, melfi.kerb.z); c.heading = melfi.kerb.h; c.speed = 0;
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  p.locked = true;
  await cut(g, () => {
    const at = { x: his.kerb.x - along.x * 7 + along.z * 2.2, z: his.kerb.z - along.z * 7 - along.x * 2.2 };
    place(g, at, toward(at, sil.group.position), his.kerb);
    sil.group.rotation.y = kid.group.rotation.y = toward(sil.group.position, at);
    frame(g, p.pos, sil.group.position, { dist: 4.6 });
  });
  await talk(g, [
    [TONY, 'Go home.', p],
    [SILVIO, 'Tone?', sil],
    [CHRIS, 'We have been sitting here four hours.', kid],
    [TONY, 'Somebody is going to telephone a detective tonight. Nobody will ever know who. Go home.', p],
  ]);
  // And then the other machinery.
  const cars = [propCar(g, { x: his.kerb.x + along.x * 60, z: his.kerb.z + along.z * 60 }, his.kerb.h + Math.PI, 0xf4f4f0, 'police'), propCar(g, { x: his.kerb.x + along.x * 72, z: his.kerb.z + along.z * 72 }, his.kerb.h + Math.PI, 0xf4f4f0, 'police')];
  let rolling = true;
  g.updaters.push(dt => { if (!rolling) return false; for (const [k, c] of cars.entries()) { const stop = 6 + k * 8, d = (c.pos.x - his.kerb.x) * along.x + (c.pos.z - his.kerb.z) * along.z; if (d > stop) { c.pos.x -= along.x * 11 * dt; c.pos.z -= along.z * 11 * dt; c.sync?.(); } } return true; });
  shot(g, between(his.kerb, his.door, -0.6), his.door, 1.5, 1.4);
  await say(g, '', 'Twenty minutes later two cars came up the street with their lamps off, and stopped at the right house.');
  coach.group.visible = true;
  const cops = [actor(g, 'cop', spot(his.door, -0.9, Math.cos(dh) * 2.2), dh + Math.PI), actor(g, 'cop', spot(his.door, 0.9, Math.cos(dh) * 2.4), dh + Math.PI)];
  await say(g, '', 'He came to the door in his socks. He did not ask them what it was about.');
  await fade(g, 1, 1);
  rolling = false;
  dismiss(g, sil, kid, coach, ...cops);
  for (const c of [theirs, ...cars]) g.removeCar(c);
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. I Didn't Hurt Nobody ----------
// The one time he did nothing. He celebrates it badly.

async function didntHurtNobody(g) {
  const { home, bing, bingRoom: club } = g.places, p = g.player, front = g.places.doors.find(d => d.name === 'home').outside;
  let sil;

  await g.wait(1);
  g.setNight(1);
  g.hud.card("I Didn't Hurt Nobody", 'The Bada Bing');
  await say(g, '', 'It was on the eleven o\'clock news. Tony watched it from a bar stool.');
  g.hud.card();
  const room = await intoBing(g, 'Go to the <b>Bada Bing</b>.', c => { sil = actor(g, 'silvio', spot(c.door, 2.2, -1.2), WEST); });
  await cut(g, () => { place(g, room.door, NORTH, bing.park); frame(g, p.pos, sil.group.position, { dist: 4.4 }); }, 0.4);
  await talk(g, [
    [SILVIO, 'That is four.', sil],
    [TONY, 'I did not hurt nobody, Sil.', p],
    [SILVIO, 'I know. I was there for it.', sil],
    [TONY, 'Pour one for the machinery.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, club, 'Go out to the <b>car</b>. Carefully.');
  dismiss(g, sil);
  g.hud.panic(0.22); g.cam.sway = 1;
  if (!p.car) { g.hud.objective('Get in the <b>car</b>.'); await g.until(() => p.car); }
  const mine = p.car;
  const weave = careful(g, 'The car', 'He put it into a hedge. Somebody very kind backed it out for him and pointed him at the road again.', () => { g.enterCar(mine); mine.pos.set(bing.park.x, 0, bing.park.z); mine.heading = bing.park.h; mine.speed = 0; });
  await weave.to(home.road, '<b>Drive</b> home. The road will not hold still.');
  weave.stop();
  await reach(g, front, 'Find the <b>front door</b>.', { r: 1.8, how: 'foot' });
  g.hud.panic(0.12);
  await roomScene(g, inRoom(kitchen(g), [-3.6, 2.8], [-4, -1.5], 1.5, 0.9), q => ({
    carmela: actor(g, 'carmela', roomSpot(q, -6.2, -1.5), EAST),
    tony: actor(g, 'tony', roomSpot(q, -2, -0.2), WEST, 'crouch'),
  }), async cast => {
    await talk(g, [
      [CARMELA, 'Tony? It was on the news. They arrested the coach from Verbum Dei.', cast.carmela],
      [TONY, 'I did not hurt nobody.', cast.tony],
      [CARMELA, 'What are you talking about? Get up off my floor.', cast.carmela],
      [TONY, 'I did not hurt nobody, Carm. I got it right. One time.', cast.tony],
    ]);
    await say(g, '', 'She got him as far as the couch.');
  }, { night: 1 });
  g.hud.panic(0); g.cam.sway = 0;
  await say(g, '', 'In a house across town Corrado Soprano sat with the lamps off, thinking about a nephew who told his troubles to a doctor, and what else a man like that might tell.');
  g.setNight(0);
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode nine complete', 5000);
}

// ---------- The episodes ----------

const EPISODES = [
  { name: 'Episode One', title: 'The Sopranos', missions: [theDucks, collections, familyBusiness, greenGrove, garbage, insurance, secondOpinion, theParty],
    titles: ['The Ducks', 'Collections', 'Family Business', 'Green Grove', 'Garbage', 'Insurance', 'Second Opinion', 'The Party'] },
  { name: 'Episode Two', title: '46 Long', missions: [backRoom, hijack, sitDown, millersCar, kitchenFire, fortySixLong, closingTime],
    titles: ['The Back Room', 'Hijack', 'The Sit-Down', "Mr. Miller's Car", 'Kitchen Fire', '46 Long', 'Closing Time'] },
  { name: 'Episode Three', title: 'Denial, Anger, Acceptance', missions: [visitingHours, studyAid, patience, theMotel, denial, theBenefit, acceptance],
    titles: ['Visiting Hours', 'Study Aid', 'Patience', 'The Motel', 'Denial', 'The Benefit', 'Acceptance'] },
  { name: 'Episode Four', title: 'Meadowlands', missions: [theDream, messageJob, theTail, schoolyard, figurehead, theBoss, meadowlands],
    titles: ['The Dream', 'Message Job', 'The Tail', 'Schoolyard', 'Figurehead', 'The Boss', 'Meadowlands'] },
  { name: 'Episode Five', title: 'College', missions: [collegeTrip, fredPeters, homeSick, theStakeout, theInterview, oneFace],
    titles: ['College', 'Fred Peters', 'Home Sick', 'The Stakeout', 'The Interview', 'One Face'] },
  { name: 'Episode Six', title: 'Pax Soprana', missions: [starterMotor, juniorsWeek, complaints, paxSoprana, anniversary, theBoard],
    titles: ['Starter Motor', "Junior's Week", 'Complaints', 'Pax Soprana', 'Anniversary', 'The Board'] },
  { name: 'Episode Seven', title: 'Down Neck', missions: [sacramentalWine, principalsOffice, nineteenSixtySeven, ridelandSunday, looseLips, sundaes],
    titles: ['Sacramental Wine', "The Principal's Office", '1967', 'Rideland', 'Loose Lips', 'Sundaes'] },
  { name: 'Episode Eight', title: 'The Legend of Tennessee Moltisanti', missions: [theWedding, springCleaning, badDreams, theBakery, theRaid, inThePaper],
    titles: ['The Wedding', 'Spring Cleaning', 'Bad Dreams', 'The Bakery', 'The Raid', 'In the Paper'] },
  { name: 'Episode Nine', title: 'Boca', missions: [theCoach, aGift, boca, whatMeadowSaid, hesitation, didntHurtNobody],
    titles: ['The Coach', 'A Gift', 'Boca', 'What Meadow Said', 'Hesitation', "I Didn't Hurt Nobody"] },
];

// ---------- Things to do ----------
// The pieces missions are built from, beside driving somewhere and talking: a round of calls, a car to run down,
// a tail to shake, the police to lose, a conversation that happens while he drives.

// Several places to call at, in any order: a marker at each and a count in the objective. `each(k)` runs at stop k.
// The spray bay: the car is driven in one colour and backed out another, seen from across the forecourt. `bay` is the mouth
// of the bay and `into` the heading that points into it. The player stays at the wheel throughout.
export async function respray(g, car, bay, into, hex, line) {
  const p = g.player, fx = Math.sin(into), fz = Math.cos(into), y = groundAt(bay.x, bay.z);
  const out = { x: bay.x - fx * 10, z: bay.z - fz * 10 }, inn = { x: bay.x + fx * 4.6, z: bay.z + fz * 4.6 };
  p.locked = true; car.speed = 0; car.nav = null;
  const roll = (a, b, secs) => new Promise((resolve, reject) => {
    const t0 = g.time;
    g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / secs), e = k * k * (3 - 2 * k); car.pos.set(a.x + (b.x - a.x) * e, 0, a.z + (b.z - a.z) * e); car.heading = into; car.speed = 0; car.sync?.(); return k < 1; });
    g.wait(secs).then(resolve, reject);
  });
  await cut(g, () => {
    car.pos.set(out.x, 0, out.z); car.heading = into; car.sync?.();
    g.cam.fixed = { pos: new THREE.Vector3(bay.x - fx * 13 + fz * 7.5, y + 2.6, bay.z - fz * 13 - fx * 7.5), look: new THREE.Vector3(bay.x - fx * 2, y + 1.2, bay.z - fz * 2) };
  }, 0.4);
  await roll(out, inn, 3);
  // Inside: the gun hisses, colour drifts out of the mouth of the bay, the light in there stutters.
  const tint = new THREE.Color(hex), mist = Array.from({ length: 9 }, (_, k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 5), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.3, depthWrite: false })); m.userData.k = k / 9; g.track(m); return m; });
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.5 })); lamp.position.set(bay.x - fx * 0.12, y + 1.7, bay.z - fz * 0.12); lamp.rotation.y = into + Math.PI; g.track(lamp);
  const t1 = g.time; let on = true;
  g.updaters.push(() => {
    if (!on) return false;
    lamp.material.opacity = 0.25 + 0.3 * (Math.sin(g.time * 31) > 0 ? 1 : 0.4);
    for (const m of mist) { const k = ((g.time - t1) * 0.45 + m.userData.k) % 1; m.position.set(bay.x - fx * (0.4 + k * 3.4) + fz * Math.sin(m.userData.k * 40) * 1.4, y + 0.5 + k * 2 + m.userData.k, bay.z - fz * (0.4 + k * 3.4) - fx * Math.sin(m.userData.k * 40) * 1.4); m.scale.setScalar(0.6 + k * 1.8); m.material.opacity = 0.34 * (1 - k); }
    return true;
  });
  if (line) say(g, '', line, 3.4).catch(() => {});
  for (let k = 0; k < 3; k++) { g.sfx?.spray?.(); await g.wait(1.1); }
  car.repaint(hex);
  await g.wait(0.5);
  on = false; for (const m of mist) g.untrack(m); g.untrack(lamp);
  await roll(inn, out, 3.4);
  g.sfx?.horn?.();
  await g.wait(0.6);
  await cut(g, () => { g.cam.fixed = null; g.cam.yaw = into + Math.PI; }, 0.4);
  p.locked = false;
}
// Something small changes hands: the giver reaches out, it crosses the gap, the player pockets it. Without a giver it
// is picked up from where it lies (`from`).
export async function handover(g, giver, { hex = 0xe9e2cf, from, sound = true } = {}) {
  const p = g.player, was = p.locked, a = from || giver.group.position, y0 = from?.y ?? (giver ? giver.group.position.y : groundAt(a.x, a.z)) + (giver ? 1.12 : 0.1), y1 = groundAt(p.pos.x, p.pos.z) + 1.1;
  p.locked = true;
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  if (giver) { giver.group.rotation.y = toward(a, p.pos); giver.play?.('interact', 'idle'); }
  p.heading = toward(p.pos, a);
  const env = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.025), new THREE.MeshLambertMaterial({ color: hex }));
  env.position.set(a.x, y0, a.z); env.rotation.y = p.heading;
  g.track(env);
  await g.wait(0.4);
  p.human.play(giver ? 'interact' : 'pickup', 'idle');
  const t0 = g.time, ux = p.pos.x - a.x, uz = p.pos.z - a.z;
  g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / 0.6), e = k * k * (3 - 2 * k); env.position.set(a.x + ux * (0.2 + e * 0.7), y0 + (y1 - y0) * e + Math.sin(k * Math.PI) * 0.14, a.z + uz * (0.2 + e * 0.7)); env.scale.setScalar(1 - e * 0.5); return k < 1; });
  await g.wait(0.75);
  g.untrack(env);
  if (sound) g.sfx?.cash();
  p.locked = was;
}
export async function rounds(g, stops, text, each, { r = 5 } = {}) {
  const p = g.player, left = stops.map((s, k) => ({ x: s.x, z: s.z, k, m: g.addMarker(s.x, s.z, r) }));
  while (left.length) {
    g.hud.objective(`${text} &nbsp; <b>${stops.length - left.length} of ${stops.length}</b>`);
    await g.until(() => left.some(s => near(p.pos, s, r + 0.8) && (!p.car || Math.abs(p.car.speed) < 6)));
    const s = left.find(st => near(p.pos, st, r + 0.8));
    g.removeMarker(s.m); left.splice(left.indexOf(s), 1);
    g.hud.objective();
    g.setCheckpoint?.();
    await each?.(s.k, s);
  }
}
// A car that runs. Ram it, or shoot it, until it has had enough and stops. It is red on the radar.
export async function runDown(g, car, text, { speed = 16 } = {}) {
  const p = g.player, corners = [[1, 1], [NX - 1, 1], [NX - 1, NZ - 1], [1, NZ - 1]].map(([i, j]) => ({ x: nodeX(i), z: nodeZ(j) }));
  const far = () => corners.slice().sort((a, b) => Math.hypot(b.x - car.pos.x, b.z - car.pos.z) - Math.hypot(a.x - car.pos.x, a.z - car.pos.z))[Math.floor(Math.random() * 2)];
  car.hp = 100; car.mission = false; car.driverless = true; // it can be hurt all the way
  let goal = far();
  dispatch(g, car, car.pos, goal, speed);
  const blip = { x: car.pos.x, z: car.pos.z, color: '#ff3b4a' };
  g.blips.push(blip);
  g.setCheckpoint?.();
  await g.until(() => {
    blip.x = car.pos.x; blip.z = car.pos.z;
    if (car.nav) car.nav.cruise = speed * (car.hp < 60 ? 0.8 : 1);
    if (!car.nav || near(car.pos, goal, 30)) { goal = far(); dispatch(g, car, car.pos, goal, speed); }
    const hp = Math.max(0, car.hp - 35), pips = Math.ceil(hp / 13);
    g.hud.objective(`${text} &nbsp; <b>${'▮'.repeat(pips)}${'▯'.repeat(5 - pips)}</b>`);
    return car.hp <= 35 || car.wreck;
  });
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();
  car.nav = null; car.speed = 0; car.mission = true; car.hp = Math.max(car.hp, 20); car.wreck = false; car.dieAt = 0;
}
// Somebody is following. He is red on the radar. He is lost by sight, not by distance: while he can see the car he
// keeps a few lengths back and matches its speed; when a building comes between them he drives to where he last saw
// it, and if he has not picked it up again in six seconds he gives up.
export async function shake(g, text, { color = 0x23232b, kind = 'sedan' } = {}) {
  const p = g.player, NEED = 6;
  if (!p.car) { g.hud.objective('Get in the <b>car</b>.'); await g.until(() => p.car); }
  const mine = p.car, unit = propCar(g, { x: mine.pos.x - Math.sin(mine.heading) * 34, z: mine.pos.z - Math.cos(mine.heading) * 34 }, mine.heading, color, kind);
  const seen = { x: p.pos.x, z: p.pos.z };               // where he last had eyes on him: that is where he is going
  dispatch(g, unit, unit.pos, seen, 13);
  const blip = { x: unit.pos.x, z: unit.pos.z, color: '#ff3b4a' };
  g.blips.push(blip);
  let lost = 0, last = g.time, look = 0, sight = true;
  await g.until(() => {
    blip.x = unit.pos.x; blip.z = unit.pos.z;
    const d = Math.hypot(unit.pos.x - p.pos.x, unit.pos.z - p.pos.z), dt = Math.min(0.1, g.time - last), mine = Math.abs(p.car?.speed || 0);
    last = g.time;
    if (g.time > look) { look = g.time + 0.25; sight = d < 120 && (d < 14 || g.sees(unit.pos, p.pos)); } // a look four times a second
    if (sight) { seen.x = p.pos.x; seen.z = p.pos.z; }
    if (!unit.nav) dispatch(g, unit, unit.pos, seen, 13);
    unit.nav.goal = seen;
    unit.nav.cruise = sight ? (d < 16 ? Math.min(6, mine) : d < 45 ? clamp(mine + 1.5, 8, 19) : 20) : 14;   // a tail hangs back; he does not ram
    lost = clamp(lost + (sight ? -dt * 1.6 : dt), 0, NEED);
    const pips = Math.round(lost / NEED * 8);
    g.hud.objective(`${text} &nbsp; <span style="color:${sight ? '#ff3b4a' : '#3fd16b'}">${sight ? 'HE CAN SEE YOU: put a corner between you' : 'OUT OF HIS SIGHT: keep going'}</span> &nbsp; <b>${'▮'.repeat(pips)}${'▯'.repeat(8 - pips)}</b>`);
    return lost >= NEED;
  });
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.removeCar(unit);
  g.hud.objective();
}
// The police want him: nothing else happens until he has lost them.
export async function loseHeat(g, stars, text) {
  g.noHeat = false;
  g.heat(stars);
  g.hud.objective(text);
  await g.until(() => g.wanted < 1);
  g.hud.objective();
}
// Talk in the car: lines that come up one after another while he drives, without stopping him. Call what it returns to end it.
export function banter(g, lines) {
  let on = true;
  (async () => {
    await g.wait(2.5);
    for (const [who, text] of lines) {
      if (!on || !g.player.car) break;
      introduce(g, who);
      g.hud.subtitle(who, text);
      await g.wait(Math.max(2.8, text.length * 0.07));
      if (on) g.hud.subtitle();
      await g.wait(1.4);
    }
  })().catch(() => {});
  return () => { if (on) { on = false; g.hud.subtitle(); } };
}

// A man in a tarpaulin: something long, tied in two places, that takes two to carry. Nothing of him shows.
export function bundle(g, at) {
  const grp = new THREE.Group(), tarp = new THREE.MeshLambertMaterial({ color: 0x3f4a44 }), rope = new THREE.MeshLambertMaterial({ color: 0xc9b79c });
  const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.25, 5, 10), tarp);
  roll.rotation.z = Math.PI / 2;
  grp.add(roll);
  for (const x of [-0.42, 0.38]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.018, 5, 14), rope); r.rotation.y = Math.PI / 2; r.position.x = x; grp.add(r); }
  grp.position.set(at.x, groundAt(at.x, at.z) + 0.27, at.z);
  g.track(grp);
  return grp;
}
// Two people carry it: it hangs between the player and whoever has the other end, until what this returns is called.
export function carry(g, load, other) {
  let on = true;
  g.updaters.push(() => {
    if (!on) return false;
    const a = g.player.pos, b = other.group.position;
    load.visible = !g.player.car;
    load.position.set((a.x + b.x) / 2, groundAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.85 + Math.sin(g.time * 9) * 0.015, (a.z + b.z) / 2);
    load.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    return true;
  });
  return () => { on = false; };
}
// The lid of a car's trunk, for a scene played at the back of it. A car is one piece, so this is a second lid laid over
// the first, hinged under the rear window, and the dark of the well beneath it. `well` is where something put in lies.
export function trunkLid(g, car) {
  const k = car.k, hl = k.L / 2, [dz, dy] = k.deck, len = dz + hl - 0.07, shutAt = Math.atan2(k.tail - dy, len), openAt = 1.2;
  const paint = new THREE.MeshPhongMaterial({ color: car.color, shininess: 90, specular: 0x777777 }), dark = new THREE.MeshBasicMaterial({ color: 0x08080a });
  const hinge = new THREE.Group(), lid = new THREE.Mesh(new THREE.BoxGeometry(k.W - 0.16, 0.03, len).translate(0, 0.016, -len / 2), paint);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(k.W - 0.16, 0.11, 0.03).translate(0, -0.04, -len + 0.015), paint), under = new THREE.Mesh(new THREE.BoxGeometry(k.W - 0.26, 0.012, len - 0.08).translate(0, -0.004, -len / 2), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  hinge.add(lid, lip, under); hinge.position.set(0, dy + 0.012, dz); hinge.rotation.x = shutAt;
  const well = new THREE.Mesh(new THREE.BoxGeometry(k.W - 0.3, 0.02, len - 0.1), dark); well.position.set(0, Math.max(dy, k.tail) + 0.004, dz - len / 2); well.visible = false;
  // The courtesy lamp under the lid: it is what the two of them are seen by.
  const lamp = new THREE.PointLight(0xffe2b0, 0, 5.5), bulb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.06).translate(0, -0.014, -len * 0.45), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  lamp.position.set(0, dy + 0.55, dz - len - 0.25); hinge.add(bulb);
  car.mesh.add(hinge, well, lamp);
  const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) }, mid = dz - len / 2;
  let run = 0;
  const swing = (to, secs) => new Promise(done => {
    const from = hinge.rotation.x, t0 = g.time, me = ++run;
    if (to > shutAt + 0.05) { well.visible = true; lamp.intensity = 16; }
    g.updaters.push(() => {
      if (me !== run) { done(); return false; }
      const u = Math.min(1, (g.time - t0) / secs), e = u * u * (3 - 2 * u);
      hinge.rotation.x = from + (to - from) * e;
      if (u < 1) return true;
      if (to <= shutAt + 0.05) { well.visible = false; lamp.intensity = 0; }
      done(); return false;
    });
  });
  return {
    swing, open: () => { g.sfx?.trunk(false); return swing(openAt, 0.5); }, shut: async (secs = 0.28) => { await swing(shutAt, secs); g.sfx?.trunk(true); },
    well: { x: car.pos.x + f.x * mid, y: groundAt(car.pos.x, car.pos.z) + dy - 0.19, z: car.pos.z + f.z * mid },
    // Where two people stand to load it, one at each end of what they carry, and where it is set down between them.
    stand: side => ({ x: car.pos.x - f.x * (hl + 0.62) + f.z * side * 1.02, z: car.pos.z - f.z * (hl + 0.62) - f.x * side * 1.02 }),
    ground: { x: car.pos.x - f.x * (hl + 0.72), z: car.pos.z - f.z * (hl + 0.72) },
    cam: (back = 3.5, side = 1.5, height = 2.25) => ({ pos: new THREE.Vector3(car.pos.x - f.x * (hl + back) - f.z * side, groundAt(car.pos.x, car.pos.z) + height, car.pos.z - f.z * (hl + back) + f.x * side), look: new THREE.Vector3(car.pos.x + f.x * (mid + 0.3), groundAt(car.pos.x, car.pos.z) + dy, car.pos.z + f.z * (mid + 0.3)) }),
    remove: () => { run++; car.mesh.remove(hinge, well, lamp); },
    // Which side of the car something is on: 1 for the side stand(1) is, -1 for the other.
    sideOf: at => (Math.sign(f.z * (at.x - car.pos.x) - f.x * (at.z - car.pos.z)) || 1),
  };
}
// Move something along a line over a time, with a rise in the middle of it. `ease` 1 starts slowly, as a heave does.
const heave = (g, thing, to, secs, rise = 0, ease = 0) => new Promise(done => {
  const from = thing.position.clone(), t0 = g.time;
  g.updaters.push(() => {
    const u = Math.min(1, (g.time - t0) / secs), e = ease ? u * u : u * u * (3 - 2 * u);
    thing.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e + Math.sin(u * Math.PI) * rise, from.z + (to.z - from.z) * e);
    if (u < 1) return true;
    done(); return false;
  });
});
// Two men put what they are carrying into the trunk of a car: set down, the lid up, a lift, a swing on three, and the lid
// down on the second try. The player is one of them; `other` has the far end. `lines` are what gets said, in order.
export async function stow(g, car, load, other, lines = [], backdrop = null) {
  const p = g.player, lid = trunkLid(g, car), a = lid.stand(-1), b = lid.stand(1), gy = groundAt(lid.ground.x, lid.ground.z), h = car.heading, f = { x: Math.sin(h), z: Math.cos(h) };
  const speak = n => lines[n] && say(g, lines[n][0], lines[n][1], lines[n][2] || 2.4);
  p.locked = true;
  await cut(g, () => {
    p.pos.set(a.x, 0, a.z); p.heading = toward(a, lid.well);
    other.group.position.set(b.x, groundAt(b.x, b.z), b.z); other.group.rotation.y = toward(b, lid.well); other.set('idle');
    load.visible = true; load.position.set(lid.ground.x, gy + 0.27, lid.ground.z); load.rotation.set(0, h, 0);
    g.cam.fixed = lid.cam(3.4, 1.5 * (backdrop ? lid.sideOf(backdrop) : 1), 2.25);   // from the side away from the backdrop, so that it is behind them
  }, 0.35);
  speak(0);
  await g.wait(0.7);
  p.heading = h; p.human.play('interact', 'idle');                       // he pops the lid
  await g.wait(0.35);
  await lid.open();
  await g.wait(0.3);
  p.heading = toward(a, lid.ground); other.group.rotation.y = toward(b, lid.ground);
  p.human.play('pickup', 'idle'); other.play('pickup', 'idle');           // both bend to him
  await g.wait(0.45);
  const held = { x: lid.ground.x, y: gy + 0.92, z: lid.ground.z };
  await heave(g, load, held, 0.55);
  // One, two: a swing away from the car and back, twice. On three he goes.
  speak(1);
  for (let n = 0; n < 2; n++) {
    await heave(g, load, { x: held.x - f.x * 0.34, y: held.y + 0.06, z: held.z - f.z * 0.34 }, 0.36);
    await heave(g, load, { x: held.x + f.x * 0.16, y: held.y, z: held.z + f.z * 0.16 }, 0.36);
  }
  await heave(g, load, { x: held.x - f.x * 0.42, y: held.y + 0.08, z: held.z - f.z * 0.42 }, 0.4);
  p.heading = toward(a, lid.well); other.group.rotation.y = toward(b, lid.well);
  p.human.play('cross', 'idle', 0.8); other.play('cross', 'idle', 0.8);  // the arms go through with it
  await heave(g, load, { x: lid.well.x, y: lid.well.y + 0.1, z: lid.well.z }, 0.36, 0.34, 1);
  g.sfx?.thump();
  { const t0 = g.time, y0 = lid.well.y; g.updaters.push(() => { const u = (g.time - t0) / 0.5; load.position.y = y0 + 0.1 * Math.max(0, 1 - u) * Math.abs(Math.cos(u * 7)); return u < 1; }); } // and settles
  await g.wait(0.7);
  // The lid: it lands on him and comes back up. A shove, and again.
  p.pos.set(lid.ground.x - f.z * 0.25, 0, lid.ground.z + f.x * 0.25); p.heading = h; p.human.play('interact', 'idle');
  await g.wait(0.3);
  await lid.swing(0.3, 0.26);
  g.sfx?.thump();
  await lid.swing(0.75, 0.3);
  await speak(2);
  other.group.rotation.y = toward(b, lid.well); other.play('interact', 'idle');
  await heave(g, load, { x: lid.well.x, y: lid.well.y - 0.16, z: lid.well.z }, 0.35);
  p.human.play('interact', 'idle');
  await g.wait(0.25);
  await lid.shut();
  load.visible = false;
  await g.wait(0.5);
  lid.remove();
}
// And out again at the other end: the lid up, the two of them lift him clear of the sill, and the lid is put down quietly.
export async function unstow(g, car, load, other) {
  const p = g.player, lid = trunkLid(g, car), a = lid.stand(-1), b = lid.stand(1), gy = groundAt(lid.ground.x, lid.ground.z), h = car.heading;
  p.locked = true;
  await cut(g, () => {
    p.pos.set(a.x, 0, a.z); p.heading = h;
    other.group.visible = true; other.group.position.set(b.x, groundAt(b.x, b.z), b.z); other.group.rotation.y = toward(b, lid.well); other.set('idle');
    load.position.set(lid.well.x, lid.well.y - 0.16, lid.well.z); load.rotation.set(0, h, 0); load.visible = false;
    g.cam.fixed = lid.cam(3.3, -1.5, 2.2);
  }, 0.35);
  await g.wait(0.4);
  p.human.play('interact', 'idle');
  await g.wait(0.35);
  load.visible = true;
  await lid.open();
  await g.wait(0.5);
  p.heading = toward(a, lid.well); p.human.play('pickup', 'idle'); other.play('pickup', 'idle');
  await g.wait(0.45);
  await heave(g, load, { x: lid.well.x, y: lid.well.y + 0.2, z: lid.well.z }, 0.5);
  await heave(g, load, { x: lid.ground.x, y: gy + 0.85, z: lid.ground.z }, 0.7, 0.16);
  other.group.rotation.y = h; other.play('interact', 'idle');
  await g.wait(0.3);
  await lid.shut(0.5);
  await g.wait(0.3);
  lid.remove();
  g.cam.fixed = null;
  p.locked = false;
}
// A hole in the ground and the earth that came out of it. dig(k) deepens it (k from 0 to 1); fill(k) puts the earth back.
export function pit(g, at) {
  const y = groundAt(at.x, at.z);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0c0a0a }));
  const heap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 6), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  hole.position.set(at.x, y + 0.03, at.z); hole.scale.set(0.01, 1, 0.01); hole.scale.x = hole.scale.z = 0.01;
  heap.position.set(at.x + 1.5, y, at.z + 0.2); heap.scale.set(0.01, 0.01, 0.01);
  g.track(hole); g.track(heap);
  { // the shovel, standing in the mud beside it when it is not in his hands
    const spade = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x8a6a44 }), steel = new THREE.MeshLambertMaterial({ color: 0x8a8d96 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), wood), blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), steel), grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), wood);
    shaft.position.y = 0.7; blade.position.y = 0.1; grip.position.y = 1.26;
    spade.add(shaft, blade, grip); spade.position.set(at.x - 1.3, y, at.z + 0.5); spade.rotation.z = 0.12;
    g.track(spade);
  }
  const set = (h, m) => { hole.scale.set(Math.max(0.01, h * 1.05), 1, Math.max(0.01, h * 0.62)); heap.scale.set(Math.max(0.01, m), Math.max(0.01, m * 0.55), Math.max(0.01, m * 0.8)); };
  return { at, hole, heap, dig: k => set(k, k), fill: k => { set(1 - k, 1 - k); if (k >= 1) { heap.scale.set(1.3, 0.12, 0.8); heap.position.set(at.x, y, at.z); } } };
}
// A spell with the shovel, done by hand: each press of F is one stroke. He bends to it, earth flies, `each` is told how far along it is.
export async function shovel(g, n, of, word = 'Dig', each, heap, thud = true) {
  const p = g.player, strokes = 4;
  p.locked = true;                                   // he stands at the hole; F is the shovel and nothing else
  for (let k = 0; k < strokes; k++) {
    g.hud.objective(`${word}: press <b>F</b>. &nbsp; ${of > 1 ? `<b>${n} of ${of}</b> &nbsp; ` : ''}${'●'.repeat(k)}${'○'.repeat(strokes - k)}`);
    g.consume('KeyF');
    await g.until(() => g.consume('KeyF'));
    p.human.play('kneel', 'idle');
    await g.wait(0.3); if (thud) (g.sfx?.dig || g.sfx?.punch)?.call(g.sfx, false); else g.sfx?.spray?.(0.5);
    if (heap) clod(g, p.pos, heap);
    each?.((k + 1) / strokes);
    await g.wait(0.28);
  }
  p.locked = false;
  g.hud.objective();
}
// A shovelful of earth thrown from one place to another.
function clod(g, from, to) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  const y0 = groundAt(from.x, from.z) + 0.5, t0 = g.time;
  g.track(m);
  g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / 0.45); m.position.set(from.x + (to.x - from.x) * k, y0 + Math.sin(k * Math.PI) * 1.1 - k * 0.4, from.z + (to.z - from.z) * k); if (k >= 1) g.untrack(m); return k < 1; });
}
// Headlamps go by on a road. He has to be still until they have gone; if he moves, `caught` plays and it comes round again.
export async function headlamps(g, from, to, text, caught) {
  const p = g.player, car = g.spawnCar(from.x, from.z, toward(from, to), 0xf4f4f0, 'police');
  car.driverless = true; car.mission = true;
  const len = Math.hypot(to.x - from.x, to.z - from.z), ux = (to.x - from.x) / len, uz = (to.z - from.z) / len;
  for (;;) {
    car.pos.set(from.x, 0, from.z); car.speed = 0;
    let moved = false, gone = false, s = 0;
    g.hud.objective(text);
    g.updaters.push(dt => { if (gone) return false; s += 13 * dt; car.pos.set(from.x + ux * s, 0, from.z + uz * s); car.sync?.(); if (s > len) gone = true; return true; });
    await g.wait(1.2);
    await g.until(() => { if (p.motion !== 'idle' || p.car) moved = true; return gone || moved; });
    g.hud.objective();
    if (!moved) break;
    gone = true;
    p.locked = true;
    await fade(g, 1, 0.8);
    await say(g, '', caught);
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  g.removeCar(car);
}

// ---------- Between missions ----------
// The story waits for the player. When one mission is done the next is a yellow marker somewhere that makes sense
// for it (home, the Bing, the doctor's, the precinct), and it starts when he walks or drives into it.
const HUBS = {
  home: g => spot(g.places.home.spawn, 0, 4), bing: g => g.places.bing && spot(g.places.bing.door, -7, 7), melfi: g => g.places.melfi?.kerb, school: g => g.places.school?.gate, hospital: g => g.places.hospital?.kerb,
  satriale: g => g.places.satriale?.kerb, grove: g => g.places.grove?.kerb, bar: g => g.places.bar?.kerb, precinct: g => g.places.precinct?.kerb, kates: g => g.places.kates?.kerb, yard: g => g.places.yard?.gate, truckstop: g => g.places.truckstop?.kerb,
};
// Where each job is picked up (the yellow marker). The rule: the marker is where the job's first scene is, or it is home,
// where the telephone finds him. A job is never offered at the place its own first line then sends him to.
const STARTS = {
  sitDown: 'satriale', fortySixLong: 'bing', theMotel: 'bing', complaints: 'bing', inThePaper: 'bing', didntHurtNobody: 'bing', figurehead: 'bing',
  theTail: 'melfi', denial: 'melfi', starterMotor: 'melfi', theBoard: 'melfi', nineteenSixtySeven: 'melfi', sundaes: 'melfi',
  farEastPacific: 'kates',
};
// These follow straight on from the one before: the story does not stop between them.
const CHAIN = new Set(['fredPeters', 'homeSick', 'theStakeout', 'theInterview', 'oneFace', 'theStreet', 'theRunway', 'ridelandSunday', 'closingTime']);
// These open somewhere else, as somebody else (Christopher, Carmela, Mikey, the lieutenant, one of the crew): there is no
// place for the player to go to begin them. They are offered wherever he is.
const ANYWHERE = new Set(['garbage', 'hijack', 'studyAid', 'acceptance', 'messageJob', 'juniorsWeek', 'anniversary', 'sacramentalWine', 'badDreams', 'theBakery', 'theRaid', 'aGift',
  'slick', 'eyesOn', 'justine', 'coffee', 'laurenNight', 'wheels', 'hardware', 'theLine', 'charleneSign']);
async function offer(g, mission, title, straight) {
  g.hubAt = null;
  if (straight || CHAIN.has(mission.name)) return;
  const p = g.player, anywhere = ANYWHERE.has(mission.name), at = (HUBS[STARTS[mission.name] || 'home'] || HUBS.home)(g) || HUBS.home(g);
  // Some missions end in the dark with the player held still, for the next one to pick up. Between missions he is free.
  Object.assign(p, { locked: false, hidden: false, pose: null, topPose: null });
  g.cam.fixed = null; g.cam.sway = 0;
  g.hud.panic(0); g.hud.era?.(false); g.hud.subtitle(); g.hud.card();
  g.hud.fade(0, 1);
  const far = `Next: <b>${title}</b>. Go to the <span style="color:#ffe066">yellow marker</span> when you are ready.`, close = `Next: <b>${title}</b>. Press <b>Enter</b> to begin, when you are ready.`;
  for (;;) {
    // If the last job left him where this one starts (at home; in the club), he is not made to walk away and come back:
    // Enter begins it. If he wanders off instead, it is the marker as usual. In a room, "where he is" is its street door.
    const dist = () => { const w = whereabouts(g); return Math.hypot(w.x - at.x, w.z - at.z); }, t0 = g.time;
    let here = anywhere || dist() < 45, armed = false, away = false;
    const m = anywhere ? null : g.addMarker(at.x, at.z, 3.2, 0xffe066);
    if (m) { m.color = '#ffe066'; m.name = title; }
    g.hud.objective(here ? close : far);
    try {
      await g.until(() => {
        const d = dist();
        if (m) m.mesh.visible = !here || d > 7;             // standing on it, it is not drawn: from inside, its wall filled the bottom of the screen with a yellow wedge (the "blob" at K's spawn)
        if (d > 7) armed = true;
        if (here && !anywhere && d > 55) { here = false; g.hud.objective(far); }
        if (g.sideBusy) { away = true; return false; }     // out with Irina, or collecting: the story waits
        if (away) { away = false; g.hud.objective(here ? close : far); } // and says again what is next when he is back
        if (here && g.time - t0 > 1.2 && !p.locked && g.consume('Enter')) return true;
        return !anywhere && armed && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 3.8 && !p.locked && !p.inside && (!p.car || Math.abs(p.car.speed) < 9);
      });
      if (m) g.removeMarker(m);
      g.hud.objective();
      g.hubAt = anywhere ? null : { x: at.x, z: at.z };
      return;
    } catch (err) {
      if (m) g.removeMarker(m);
      if (err !== g.WASTED) throw err;
      while (p.dying) await new Promise(r => setTimeout(r, 250)); // killed between missions: home, and the marker is put back
    }
  }
}
export async function runStory(g) {
  const STORY = CITY === 'la' ? HEAT : CITY === 'nexus' ? (STORY_KEY === '2019' ? BLADE_STORY : NEXUS_STORY) : EPISODES; // each city tells its own
  const total = STORY.reduce((n, e) => n + e.missions.length, 0);
  const saved = readSave(), from = clamp(saved.mission || 0, 0, total);
  if (from > 0) { // pick up a saved game at home
    const { home, vesuvio } = g.places, p = g.player;
    g.profilesIn?.(saved.chars); g.ledger = saved.earned || {}; g.met = new Set(saved.met || []);
    g.stakes?.load(saved.stakes, from); g.dates?.load(saved.dates, from);
    if (saved.cash && !g.arrived) { g.hud.cash = g.cash + saved.cash; g.addMoney(saved.cash); } // what was saved is not a windfall: no "+$" beside the counter // over the bridge, the money in hand is the money
    if (from > 5) vesuvio?.burn();
    for (const d of home.ducks) d.group.visible = false;
    if (!g.arrived) { p.pos.set(home.wake.x, 0, home.wake.z); g.cam.yaw = p.heading = 0; g.cam.pitch = 0.22; }
    if (!g.arrived && CITY === 'la' && from >= total) { const pr = g.places.precinct; p.pos.set(pr.door.x, 0, pr.door.z - 2); g.cam.yaw = p.heading = NORTH; g.tonyCar.pos.set(pr.kerb.x, 0, pr.kerb.z); g.tonyCar.heading = pr.kerb.h; } // the story is over: the lieutenant starts his day at Major Crimes
    g.cam.fixed = null;
    p.locked = false;
    g.hud.show(true);
    await fade(g, 0, 1.2);
  }
  let n = 0;
  for (const [e, episode] of STORY.entries()) {
    for (const [k, mission] of episode.missions.entries()) {
      if (n++ < from) continue;
      g.progress = { episode: episode.name, title: episode.title, mission: episode.titles[k], k: k + 1, of: episode.missions.length, n, total };
      if (k === 0 && e > 0) { await g.wait(1.5); await titleCard(g, episode.title, episode.name); }
      await offer(g, mission, episode.titles[k], n === 1 || (n - 1 === from && sessionStorage.getItem('straight')));
      sessionStorage.removeItem('straight');
      for (;;) { // a mission is played again from the start if he is killed before its first checkpoint
        g.missionActive = true; g.checkpoint = null; g.topUp?.();
        if (g.tonyCar) g.tonyCar.hp = Math.max(g.tonyCar.hp ?? 100, 70);
        try { await mission(g); break; } catch (err) { if (err !== g.WASTED) throw err; }
        finally { g.missionActive = false; }
        await g.respawn();
      }
      g.checkpoint = null;
      g.stakes?.pay(n); g.dates?.done(n);                               // every place he has a piece of puts his end by
      save(n, g.cash, keep(g));
      await g.wait(1.5);
      if (k === episode.missions.length - 1) {
        g.hud.card(`End of ${episode.name}`, e === STORY.length - 1 ? (CITY === 'la' ? 'Los Angeles is yours until the next one.' : CITY === 'nexus' ? 'Nexus is yours until the next one.' : 'Vice City is yours until the next one.') : '');
        await g.wait(6);
        g.hud.card();
      }
    }
  }
  g.progress = { done: true, total };
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
  await phone(g, CHRIS, "T, it's me. I found that degenerate Mahaffey. He owes us ten grand and he walks around like he won the lottery.");
  await phone(g, CHRIS, "Pick me up on Ocean Drive. I'll show you where he spends our money.");
  await say(g, TONY, "Stay there. I'm on my way.");
  g.hud.card();

  const chris = actor(g, 'christopher', ocean.chris, WEST);
  await reach(g, ocean.marker, 'Meet Christopher on <b>Ocean Drive</b>.', { r: 7 });
  p.locked = true;
  if (p.car) p.car.speed = 0;
  if (!p.car) approach(g, chris, 2);
  chris.group.rotation.y = toward(chris.group.position, p.pos);
  frame(g, p.pos, chris.group.position, { dist: 5 });
  await talk(g, [
    [CHRIS, "He's not here no more. Every afternoon he's down the south end of the promenade, chatting up tourists. Three blocks.", chris],
    [TONY, 'With my ten grand in his pocket. Get in.', p],
    [CHRIS, 'He sees this car, T, he is gonna run. He always runs.', chris],
  ]);
  g.cam.fixed = null;
  const tail = follower(g, chris, { gap: 2 });
  p.locked = false;

  // Three blocks down: Mahaffey, with company, not looking at the road.
  const spotH = ocean.hangout;
  const friend = makeHuman({ ...randomPedLook(), body: 'female' });
  friend.group.position.set(spotH.x + 1.3, groundAt(spotH.x + 1.3, spotH.z + 0.3), spotH.z + 0.3); friend.group.rotation.y = WEST; friend.set('idle'); g.track(friend.group);
  const debtor = actor(g, 'mahaffey', spotH, EAST, 'talk');
  const d = { pos: new THREE.Vector3(spotH.x, 0, spotH.z), side: 1, caught: false };
  const alex = g.addNpc(debtor, { health: 90, cash: 0, stays: true }); // he can be hit, and he goes down rather than dies
  alex.die = () => { alex.health = 1; d.caught = true; };
  fistsOnly(g, true);
  if (!p.car) { g.hud.objective('Get in the <b>car</b> with Christopher.'); await g.until(() => p.car); }
  g.hud.objective('<b>Drive</b> down Ocean Drive. Mahaffey is at the south end of the promenade.');
  const m = g.addMarker(ocean.approach.x, ocean.approach.z, 6);
  await g.until(() => near(p.pos, d.pos, 34) || alex.health < 90);
  g.removeMarker(m);

  // He looks up, sees the car, and is gone.
  const blip = { x: d.pos.x, z: d.pos.z, color: '#ff3b4a' };
  g.blips.push(blip);
  say(g, CHRIS, "That's him, with the girl. ...He's seen the car. He's running!", 3.2);
  debtor.set('idle'); debtor.group.rotation.y = toward(debtor.group.position, p.pos);
  friend.group.rotation.y = toward(friend.group.position, p.pos);
  g.hud.objective('Chase down <b>Mahaffey</b>. Run him over, or catch him and beat it out of him.');
  const bolt = g.time + 0.9; // the moment it takes him to believe it
  g.updaters.push(dt => {
    if (d.caught) return false;
    if (debtor.busy) { d.pos.copy(debtor.group.position); return true; }
    let ax = d.pos.x - p.pos.x, az = d.pos.z - p.pos.z;
    const dist = Math.hypot(ax, az) || 1;
    if ((p.car && dist < 2.6 && Math.abs(p.car.speed) > 3) || alex.health < 40) { d.caught = true; return false; }
    if (g.time < bolt) return true;
    if (dist < 80) {
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
    } else debtor.set('idle'); // out of sight, he stops to get his breath
    blip.x = d.pos.x; blip.z = d.pos.z;
    return true;
  });
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
  g.untrack(friend.group);
}

// ---------- 3. Family Business ----------
// Uncle Junior means to kill a man in Artie Bucco's restaurant. Tony asks him to do it anywhere else.

async function familyBusiness(g) {
  const { vesuvio: v } = g.places, p = g.player;

  g.hud.card('Family Business', 'Vesuvio, Ocean Heights');
  await phone(g, SILVIO, "Tone. Your uncle's holding court on the terrace at Vesuvio.");
  await phone(g, SILVIO, "Word is he's planning something for that place. You should hear it from him.");
  g.hud.card();
  // Junior is at his table on the terrace from the moment the car pulls up; Artie is inside, behind his bar.
  const junior = actor(g, 'junior', v.seat, WEST, 'sit');
  await reach(g, v.kerb, "Drive to <b>Vesuvio</b>, Artie Bucco's restaurant.");
  const VES = g.places.rooms.VESUVIO, artie = VES.clerk, way = g.places.doors.find(d => d.inside === VES.inside);
  await reach(g, way.outside, 'Go <b>in</b>. Say hello to Artie first.', { r: 1.8, how: 'foot' });
  await enter(g, VES);
  await reach(g, VES.till, 'Find <b>Artie</b>. He is behind the bar.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.pos.set(VES.till.x, 0, VES.till.z + 0.3); p.heading = NORTH;
  artie.group.rotation.y = SOUTH;
  g.cam.fixed = inRoom(VES, [6.9, -6.2], [3.4, -2.6], 1.75, 1.2).cam; // over Artie's shoulder: Tony at the bar, and the dining room behind him
  await talk(g, [
    [ARTIE, 'Tony! Look who it is. You eat yet? Sit, I made the rabbit today.', artie],
    [TONY, 'Place looks beautiful, Artie. Full every night, I hear.', p],
    [ARTIE, "Twelve years of my life in these walls. My father's oven is still back there.", artie],
    [TONY, 'I came to see my uncle.', p],
    [ARTIE, "On the terrace, since noon. Same table. He's been asking who comes in and what night. Go on, I'll send out a plate.", artie],
  ]);
  artie.set('talk');
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('Go out to the <b>terrace</b>.');
  const out = g.addMarker(VES.inside.x, VES.inside.z, 1.5);
  await g.until(() => !p.inside || near(p.pos, VES.inside, 1.9));
  g.removeMarker(out);
  g.hud.objective();
  await leave(g);
  await reach(g, spot(v.seat, -3.2, 1.3), "<b>Uncle Junior</b> is at his table on the terrace. Sit down with him.", { r: 1.6, how: 'foot' });
  p.locked = true;
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
    dismiss(g, junior);
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
  let ma;
  ma = actor(g, 'livia', house.porch, SOUTH); // there before he arrives
  await reach(g, house.kerb, 'Visit your mother at <b>her house</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, house.path, NORTH, house.kerb);
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
  g.cam.fixed = null;
  await fade(g, 0, 1.2);
  await say(g, '', 'He sat on the kerb until the street stopped moving. Then he looked at his watch. It was Thursday.', 4.4);
  await toMelfi(g, "Drive to <b>Dr. Melfi's office</b>. You are late.");

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
  const FLAT = g.places.rooms.CHRIS, his = g.places.chris;
  let emil, pussy;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'That night, Christopher decided to settle the Triborough Towers contract his own way.');
  if (p.car) g.leaveCar();
  outdoors(g);
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.setNight(1);
  const chris = makeLook('christopher');
  g.setPlayer(chris);
  // His own place, a little after midnight: the television on with the sound down, and him on the couch not watching it.
  const ride = propCar(g, his.kerb, his.kerb.h, 0x1d1d24, 'sedan'), front = g.places.doors.find(d => d.inside === FLAT.inside) || { name: "Christopher's place", inside: FLAT.inside, outside: his.door };
  ride.driverless = false;
  p.inside = front;
  p.pos.set(FLAT.couch.x, 0, FLAT.couch.z); p.heading = FLAT.couch.h; p.pose = 'sit';
  g.cam.fixed = inRoom(FLAT, [-0.3, 0.2], [-3.4, -1.7], 1.5, 0.85).cam;
  // The shop is ready before he is: the lights low, the butcher gone home, and a grey sedan at the kerb that was not there at closing.
  const shop = g.places.shopRoom, sx = shop.inside.x, sz = shop.inside.z - 3.2, floorY = -0.1;
  const street = g.places.doors.find(d => d.inside === shop.inside).outside;
  for (const a of shop.ambient) a.group.visible = false;
  emil = actor(g, 'kolar', { x: sx - 1.3, y: floorY, z: sz - 2 }, NORTH);
  propCar(g, { x: satriale.kerb.x - Math.sin(satriale.kerb.h) * 13, z: satriale.kerb.z - Math.cos(satriale.kerb.h) * 13 }, satriale.kerb.h, 0x6f747c, 'sedan');
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Garbage', "Christopher's place, a little after midnight");
  await playing(g, 'Christopher Moltisanti', "Tony's nephew. You play him in this one");
  g.cam.fixed = inRoom(FLAT, [-4.9, -2.75], [-2.5, -1.25], 1.25, 0.95).cam;          // from beside the screen, on the side the telephone is: his face in the light of it
  await phone(g, KOLAR, 'Kolar. Who is calling this house, at this hour?');
  await say(g, CHRIS, 'Christopher, from the carting. You wanted to talk about Triborough Towers, Emil. So we talk.', 4.6);
  await phone(g, KOLAR, 'Now? It is past midnight. My brothers are asleep.');
  await say(g, CHRIS, "Let them sleep. You know Satriale's, the pork store? Half an hour. I got something that changes your mind about that bid.", 5.4);
  await phone(g, KOLAR, '...Half an hour. I bring nobody.');
  g.hangUp = g.time;
  await g.wait(0.6);
  await cut(g, () => { p.pose = null; p.pos.set(FLAT.couch.x + 1.5, 0, FLAT.couch.z + 0.9); p.heading = g.cam.yaw = EAST; g.cam.fixed = null; }, 0.35);
  p.locked = false;
  await reach(g, FLAT.drawer, 'Find the <b>pistol</b>: the kitchen drawer, under the take-away menus.', { r: 1.1, how: 'foot' });
  p.locked = true;
  p.pos.set(FLAT.drawer.x, 0, FLAT.drawer.z); p.heading = NORTH;
  p.human.play('pickup', 'idle');
  g.sfx?.click();
  await g.wait(0.9);
  g.setWeapon('pistol');
  await say(g, CHRIS, 'Tony wants the Kolars out of the bidding. So tomorrow they are out, and he knows who did it.', 4.2);
  g.setWeapon('fist');
  p.locked = false;
  await walkOut(g, FLAT, 'Go out to the <b>car</b>.');
  await wantCar(g, ride, 'Get in the <b>black sedan</b>.');
  say(g, CHRIS, 'We talk in the store, with the blinds down. Nobody on that street after eleven but the pig.', 4.6);
  await reach(g, satriale.kerb, "<b>Drive</b> to Satriale's Pork Store.", { how: 'car', r: 7 });
  p.locked = true;
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  await say(g, '', 'A grey sedan was at the kerb already, its engine ticking. Emil Kolar had come early, and by himself, as he had said.', 4.8);
  p.locked = false;
  await reach(g, street, "Go <b>in</b> to Satriale's.", { r: 1.8, how: 'foot' });
  await enter(g, shop);
  await reach(g, { x: sx + 0.2, z: sz - 0.9 }, 'Emil is at the <b>counter</b>.', { r: 1.5, how: 'foot' });

  p.locked = true;
  p.pos.set(sx + 0.2, 0, sz - 0.9); p.heading = toward(p.pos, emil.group.position);
  emil.group.rotation.y = toward(emil.group.position, p.pos);
  g.cam.fixed = { pos: new THREE.Vector3(sx + 3.6, floorY + 1.6, sz + 1.6), look: new THREE.Vector3(sx - 0.6, floorY + 1.2, sz - 1.6) };
  await talk(g, [
    [KOLAR, 'Christopher? Emil Kolar. My brothers send their respect. It smells like meat in here.', emil],
    [CHRIS, "It's a pork store. Come and look in the case, I got something to show you about that bid of yours.", p],
    [KOLAR, 'In the old country, this is how business is done. At night, between men.', emil],
    [CHRIS, 'Yeah? Here too.', p],
  ]);
  // Emil bends to look into the cold case. Christopher has the gun.
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

  let body;
  await cut(g, () => {
    pussy = actor(g, 'pussy', { x: sx + 0.9, y: floorY, z: sz + 2.2 }, NORTH);
    p.pos.set(sx + 0.2, 0, sz - 0.6); p.heading = toward(p.pos, pussy.group.position);
    body = bundle(g, { x: sx - 1.3, z: sz - 1.9 }); body.position.y = floorY + 0.27; body.visible = false;
    g.cam.fixed = { pos: new THREE.Vector3(sx - 4.2, floorY + 1.6, sz + 0.2), look: new THREE.Vector3(sx + 0.5, floorY + 1.1, sz + 0.6) };
  }, 0.5);
  await talk(g, [
    [PUSSY, "Madonn'. You did this in the store? Where they cut the meat?", pussy],
    [CHRIS, "The Kolars pull their bid now. Tony's gonna see what I can do.", p],
    [PUSSY, "First we clean up. Then we worry what Tony sees. He goes in your trunk, and we go.", pussy],
  ]);
  // Out of the shop, between them, in the plastic the hams come in.
  g.cam.fixed = null;
  p.locked = false;
  await reach(g, { x: sx - 0.6, z: sz - 1.5 }, '<b>Wrap him</b> in the plastic sheeting from behind the counter.', { r: 1.4, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, { x: sx - 1.3, z: sz - 1.9 });
  p.human.play('kneel', 'idle');
  await g.wait(2.2);
  body.visible = true;
  await say(g, PUSSY, 'Feet first. Not through the front like a delivery. ...Fine, through the front. Quick.', 3.6);
  p.locked = false;
  const big = follower(g, pussy, { gap: 1.9, runs: false, pace: 3.2 });
  big.pos.copy(pussy.group.position);
  let carrying = carry(g, body, pussy);
  await walkOut(g, shop, 'Carry him out to the <b>street</b>. Pussy has the other end.');
  for (const a of shop.ambient) a.group.visible = true;
  const boot = { x: ride.pos.x - Math.sin(ride.heading) * 3.1, z: ride.pos.z - Math.cos(ride.heading) * 3.1 };
  await reach(g, boot, 'Carry him round to the <b>trunk</b> of the black sedan.', { r: 1.5, how: 'foot' });
  carrying();
  big.stay = true;
  await stow(g, ride, body, pussy, [[PUSSY, 'Down. Get it open.', 1.8], [PUSSY, 'On three. One. Two...', 2.3], [PUSSY, 'His knees. Fold him, he is not going to complain.', 2.6]], satriale.door);
  await say(g, '', 'The lid came down on the second try.', 2.4);
  big.pos.copy(pussy.group.position); big.stay = false;

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

  // The marsh. This part is done by hand.
  p.locked = true;
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  await say(g, PUSSY, 'Kill the lamps. Nobody comes out here but the gulls, and I would like to keep it that way.', 3.6);
  p.locked = false;
  const back = { x: ride.pos.x - Math.sin(ride.heading) * 3, z: ride.pos.z - Math.cos(ride.heading) * 3 }, grave = spot(marsh, -4.5, 7), hole = pit(g, grave);
  await reach(g, back, 'Open the <b>trunk</b>.', { r: 1.5, how: 'foot' });
  big.stay = true;
  await unstow(g, ride, body, pussy);
  big.pos.copy(pussy.group.position); big.stay = false;
  carrying = carry(g, body, pussy);
  await reach(g, spot(grave, 0.2, 1.5), 'Carry him out into the <b>reeds</b>, away from the road.', { r: 1.1, how: 'foot' });
  carrying();
  body.position.set(grave.x - 0.2, groundAt(grave.x, grave.z) + 0.27, grave.z - 1.7); body.rotation.set(0, 0.2, 0);   // laid down on the far side of where the hole will be
  big.stay = true;
  const digging = ['', 'Deeper. The tide comes up here, and what the tide finds it gives back.', 'A little more. I want him under the roots.'];
  for (let n = 1; n <= 3; n++) {
    p.heading = g.cam.yaw = toward(p.pos, grave);
    if (digging[n - 1]) await say(g, PUSSY, digging[n - 1], 3);
    await shovel(g, n, 3, 'Dig', k => hole.dig((n - 1 + k) / 3), hole.heap.position);
    if (n === 2) await headlamps(g, { x: nodeX(0) + 3.6, z: marsh.z - 130 }, { x: nodeX(0) + 3.6, z: marsh.z + 130 }, 'Headlamps on the west road. <b>Keep still</b> until they have gone by.', 'The patrol car stopped. A torch went over the reeds, and over a shovel standing up in the mud. That is not how it went. Again.');
  }
  await reach(g, spot(grave, -0.2, -2.6), 'Go round behind him and <b>roll him in</b>.', { r: 0.9, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, grave);
  p.human.play('kneel', 'idle');
  { const t0 = g.time, from = body.position.clone(), y0 = groundAt(grave.x, grave.z);
    g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / 1.4); body.position.set(from.x + (grave.x - from.x) * k, y0 + 0.27 - k * k * 0.55, from.z + (grave.z - from.z) * k); body.rotation.x = k * 3; return k < 1; }); }
  await g.wait(1.7);
  body.visible = false;
  p.locked = false;
  p.heading = g.cam.yaw = toward(p.pos, grave);
  for (let n = 1; n <= 2; n++) await shovel(g, n, 2, 'Fill it in', k => hole.fill((n - 1 + k) / 2), grave);
  p.locked = true;
  frame(g, p.pos, pussy.group.position, { dist: 4.6 });
  await talk(g, [
    [PUSSY, 'Tread it flat. In a week the reeds will be over it.', pussy],
    [CHRIS, 'That is one Kolar the less.', p],
    [PUSSY, 'Do not count them. Go home, and burn the shoes.', pussy],
  ]);
  await fade(g, 1, 1.2);
  await say(g, '', 'It was getting light when they found the road again.');
  g.cam.fixed = null;
  g.untrack(hole.hole); g.untrack(hole.heap); g.untrack(body);
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
  artie = actor(g, 'artie', spot(v.door, 0, -1.6), SOUTH); // there before he arrives
  await reach(g, v.kerb, 'Bring Artie the cruise tickets at <b>Vesuvio</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, spot(v.door, -1.6, 0.6), NORTH, v.kerb);
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
  const club = await intoBing(g, 'Meet Silvio at the <b>Bada Bing</b>.', club => {
    sil = actor(g, 'silvio', spot(club.door, 2.2, -1.2), WEST);
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    p.heading = toward(p.pos, sil.group.position);
    frame(g, p.pos, sil.group.position, { dist: 4.4 });
  }, 0.4);
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
  const { hesh: label, ocean, pier } = g.places, p = g.player, FNOTE = g.places.rooms.FNOTE, OFFICE = g.places.rooms.HESH, fdoor = g.places.doors.find(d => d.inside === FNOTE.inside);
  let hesh, pussy;

  await g.wait(1);
  g.hud.card('Second Opinion', 'F-Note Records');
  await phone(g, HESH, 'Anthony. Come by the label. I had a thought about your friend the gambler.');
  g.hud.card();
  // They are in his office before Tony is through the front door: Hesh behind his desk, Pussy on the couch.
  hesh = actor(g, 'hesh', OFFICE.chair, SOUTH, 'sit');
  pussy = actor(g, 'pussy', OFFICE.couch[0], WEST, 'sit');
  await reach(g, label.kerb, "Drive to <b>F-Note Records</b>, Hesh's label.");
  await reach(g, fdoor.outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, FNOTE);
  await reach(g, roomSpot(FNOTE, 0, -1.5), 'Find the <b>desk</b>, and ask for Hesh.', { r: 1.4, how: 'foot' });
  p.locked = true; p.heading = NORTH;
  g.cam.fixed = inRoom(FNOTE, [2.7, 0.6], [0, -3], 1.6, 1.3).cam;
  await talk(g, [
    ['Receptionist', 'Mr. Soprano. He said to send you straight through. The door on the left, with his name on it.', FNOTE.clerk],
    [TONY, 'How long has he had his name on a door?', p],
    ['Receptionist', 'Since before I was born, he tells me. He tells everybody.', FNOTE.clerk],
  ]);
  g.cam.fixed = null; p.locked = false;
  { // Through the door with the brass plate. (F at the door does it too.)
    const at = roomSpot(FNOTE, -5.4, -3.7), inOffice = () => p.pos.z < FNOTE.Z - 6;
    g.hud.objective('Find the door marked <b>H. RABKIN</b>, and go through.');
    const m = g.addMarker(at.x, at.z, 1.2);
    await g.until(() => near(p.pos, at, 1.3) || inOffice());
    g.removeMarker(m); g.hud.objective();
    if (!inOffice()) { p.locked = true; await fade(g, 1, 0.35); g.sfx?.door(); p.pos.set(OFFICE.inside.x, 0, OFFICE.inside.z + 1); p.heading = g.cam.yaw = NORTH; await fade(g, 0, 0.35); p.locked = false; }
  }
  await reach(g, roomSpot(OFFICE, 0.5, -0.2), 'Find <b>Hesh</b>. He is behind his desk.', { r: 1.3, how: 'foot' });
  p.locked = true;
  p.pos.set(OFFICE.X + 0.5, 0, OFFICE.Z - 0.2); p.heading = NORTH;
  g.cam.fixed = inRoom(OFFICE, [-2.8, 1.1], [1.4, -2.5], 1.6, 1.1).cam;
  await talk(g, [
    [HESH, 'Sit, stand, as you like. Your Mahaffey works for a health plan, yes? He approves the claims. He signs, they pay.', hesh],
    [TONY, "He can't cover ten grand. With the vig he's into us for twice that.", p],
    [HESH, "He doesn't pay. His company pays. We open a clinic on paper. Scans that never happen, billed to his desk.", hesh],
    [PUSSY, "He's gonna say no. He's scared of his own boss.", pussy],
    [HESH, 'Then we explain it to him somewhere with a view.', hesh],
  ]);
  // All three, out on the pavement.
  await fade(g, 1, 0.6);
  g.sfx?.door();
  for (const h of fdoor.hide || []) h.group.visible = true;
  p.inside = null;
  { const o = fdoor.outside, fx = Math.sin(o.h), fz = Math.cos(o.h);
    p.pos.set(o.x, 0, o.z); p.heading = g.cam.yaw = o.h;
    for (const [who, r] of [[hesh, 1.1], [pussy, -1.1]]) { const x = o.x - fx * 0.6 + fz * r, z = o.z - fz * 0.6 - fx * r; who.set('idle'); who.group.position.set(x, groundAt(x, z), z); who.group.rotation.y = o.h; } }
  g.cam.fixed = null;
  await fade(g, 0, 0.6);
  p.locked = false;
  const a = follower(g, hesh), b = follower(g, pussy, { lead: a });
  // Mahaffey is on Ocean Drive already, talking to a man about a horse.
  const alex = actor(g, 'mahaffey', ocean.chris, WEST, 'talk'), tout = extraAt(g, spot(ocean.chris, -1.3, 0.3), EAST, 'idle', { shirt: 0xd9c7a0, pants: 0x4a3324, hair: 0x8d8a8e, hairStyle: 'balding', bulk: 1.1, age: 0.5 });
  g.hud.objective('Get in the <b>car</b> with Hesh and Pussy.');
  await g.until(() => p.car);
  await reach(g, ocean.marker, 'Pick up <b>Mahaffey</b> on Ocean Drive.', { how: 'car' });

  p.locked = true;
  if (p.car) p.car.speed = 0;
  { // He sees whose car it is, and remembers somewhere else he has to be.
    const pos = alex.group.position, away = toward(p.pos, pos), t0 = g.time;
    alex.set('walk', 1.25); alex.group.rotation.y = away;
    g.updaters.push(dt => { if (g.time - t0 > 2.1 || !g.tracked.has(alex.group)) return false; pos.x += Math.sin(away) * 2.3 * dt; pos.z += Math.cos(away) * 2.3 * dt; pushOut(pos, 0.4); pos.y = groundAt(pos.x, pos.z); return true; });
    await say(g, PUSSY, 'Alex! Alex. Do not make me get out of this car.', 2.4);
    alex.set('idle'); alex.group.rotation.y = toward(pos, p.pos);
    g.untrack(tout.group);
  }
  await talk(g, [
    [DEBTOR, 'Tony! I was just coming to see you, I swear. I got two hundred on me.', alex],
    [PUSSY, "Keep it. Get in the car, Alex. We're going for a walk."],
  ]);
  const c = follower(g, alex, { lead: b });
  p.locked = false;
  // The pier has its evening on it before they come: a man fishing off the end, gulls along the rail.
  const E = pier.end, deckY = groundAt(E.x, E.z);
  const angler = extraAt(g, spot(E, 2.6, -1.95), NORTH, 'idle', { shirt: 0x5a6a4a, sleeves: 'long', pants: 0x4a4652, hair: 0x8d8a8e, hat: 'cap', hatColor: 0x2f5a3f, bulk: 1.05, age: 0.6 });
  { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 2.6, 4).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: 0x3a2a1c })); rod.rotation.x = 0.9; rod.position.set(0.2, 0.9, 0.2); angler.group.add(rod); }
  const gulls = [0.4, 1.3, 2.1, 3.4].map((dz, k) => {
    const grp = new THREE.Group(), white = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), grey = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6).scale(1, 0.9, 1.7), white), head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), white), beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
    head.position.set(0, 0.1, 0.16); beak.position.set(0, 0.09, 0.24);
    const wings = [-1, 1].map(sd => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.16).translate(sd * 0.21, 0, 0), grey); w.position.set(sd * 0.05, 0.04, 0); w.rotation.z = sd * 1.3; grp.add(w); return w; });
    grp.add(body, head, beak);
    grp.position.set(E.x + 5, deckY + 1.12, E.z - 2 + dz); grp.rotation.y = EAST + (k - 1.5) * 0.5;
    g.track(grp);
    return { grp, wings, k };
  });
  await reach(g, pier.start, 'Drive to the <b>pier</b>.', { how: 'car' });
  g.hud.objective('Walk Mahaffey to the <b>end of the pier</b>.');
  const m = g.addMarker(E.x, E.z, 2.4);
  let flown = 0, packed = false;
  g.updaters.push(dt => { // the birds go up when the four of them are close; the man with the rod decides he has caught enough
    if (gulls.every(gl => !gl.grp.parent)) return false;
    const d = Math.hypot(p.pos.x - E.x - 5, p.pos.z - E.z);
    if (!flown && d < 13) flown = g.time;
    if (!packed && d < 22 && g.tracked.has(angler.group)) { packed = true; mill(g, angler, [spot(E, -14, -1.6), spot(pier.start, 4, -1.4), spot(pier.start, -14, -3)], { pace: 1.5 }); g.wait(34).then(() => g.untrack(angler.group)).catch(() => {}); }
    if (flown) for (const { grp, wings, k } of gulls) {
      const t = g.time - flown - k * 0.25; if (t < 0 || !grp.parent) continue;
      grp.position.x += (2.2 + k * 0.4) * dt; grp.position.y += (1.5 - Math.min(1.2, t * 0.2)) * dt; grp.position.z += Math.sin(t * 0.8 + k) * 1.6 * dt; grp.rotation.y = EAST + Math.sin(t * 0.8 + k) * 0.6;
      for (const [n, w] of wings.entries()) w.rotation.z = (n ? 1 : -1) * Math.sin(g.time * 13 + k) * 0.75;
      if (t > 9) g.untrack(grp);
    }
    return true;
  });
  await g.until(() => !p.car && near(p.pos, m, 3) && near(c.pos, m, 10));
  g.removeMarker(m);
  g.hud.objective();

  p.locked = true;
  const stand = (who, dx, dz, heading) => { who.group.position.set(E.x + dx, groundAt(E.x + dx, E.z + dz), E.z + dz); who.group.rotation.set(0, heading, 0); who.set('idle'); };
  // A slow step: somebody moves a little way while the talk goes on.
  const drift = (who, dx, dz, secs, state = 'walk') => { const pos = who.group.position, x0 = pos.x, z0 = pos.z, t0 = g.time; who.set(state, 0.7); g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / secs); pos.x = x0 + dx * k; pos.z = z0 + dz * k; if (k >= 1) who.set('idle'); return k < 1 && g.tracked.has(who.group); }); };
  await cut(g, () => {
    for (const f of [a, b, c]) f.stay = true;
    stand(alex, 3.3, 0, WEST); stand(pussy, 1.4, -1.4, EAST); stand(hesh, 0.8, 1.6, EAST);
    p.pos.set(E.x - 0.4, 0, E.z); p.heading = EAST;
    g.cam.fixed = { pos: new THREE.Vector3(E.x - 2.5, deckY + 1.7, E.z + 6.5), look: new THREE.Vector3(E.x + 2.6, deckY + 1.2, E.z) };
  }, 0.6);
  drift(alex, 1.1, 0.2, 2.6, 'talk');                    // he backs away until the rail is in the small of his back
  await talk(g, [
    [DEBTOR, "Guys. Come on. I can't swim. You know I can't swim.", alex],
  ]);
  drift(pussy, 1.5, 0.9, 1.6);
  await talk(g, [
    [PUSSY, "Nobody's swimming. Long way down, though, when the tide's out.", pussy],
    [DEBTOR, "I'm not signing anything! You can't make me!", alex],
    [PUSSY, 'Tony. Explain it to him.', pussy],
  ]);
  const soft = g.addNpc(alex, { health: 100, cash: 0, stays: true });
  soft.die = () => { soft.health = 1; };
  const arrow = quarry(g, soft);
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('<b>Rough him up</b> until he listens. &nbsp; <b>Click</b> or <b>E</b>.');
  await g.until(() => soft.health < 40);
  arrow();
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
    [PUSSY, 'He is still doing sums. Show him the view, T.', pussy],
  ]);
  // Over the rail: Tony has him by the belt, and the camera is out over the water looking back at all four of them.
  await cut(g, () => {
    stand(alex, 4.72, -0.2, EAST); alex.group.position.y = deckY + 0.16; alex.group.rotation.x = 0.7; alex.set('talk');
    p.pos.set(E.x + 3.9, 0, E.z - 0.62); p.heading = EAST + 0.25;
    stand(pussy, 3.95, 1.0, EAST - 0.6); stand(hesh, 2.3, 1.95, EAST - 0.25);
    g.cam.fixed = { pos: new THREE.Vector3(E.x + 9.4, deckY + 1.25, E.z - 2.8), look: new THREE.Vector3(E.x + 4.2, deckY + 1.4, E.z - 0.1) };
  }, 0.5);
  { let held = 0, last = g.time, said = 0;
    const yell = ['I am listening! I am LISTENING!', 'There are rocks! Tony, there are rocks down there!', 'My glasses! My glasses went in!'];
    await g.until(() => {
      const dt = Math.min(0.1, g.time - last); last = g.time;
      held = g.keys.KeyF ? held + dt : Math.max(0, held - dt * 0.6);
      alex.group.rotation.x = 0.7 + Math.min(1, held / 3.2) * 0.55 + Math.sin(g.time * 9) * 0.02 * held;
      alex.group.position.y = deckY + 0.16 + Math.min(1, held / 3.2) * 0.2;
      if (said < 3 && held > 0.5 + said * 0.95) { say(g, DEBTOR, yell[said], 1.7).catch(() => {}); said++; }
      const pips = Math.min(8, Math.floor(held / 3.2 * 8));
      g.hud.objective(`Tip him out over the rail: press <b>F</b> and hold it. &nbsp; <b>${'▮'.repeat(pips)}${'▯'.repeat(8 - pips)}</b>`);
      return held >= 3.2;
    });
    g.hud.objective(); }
  await talk(g, [
    [TONY, 'Look down. Now look at me. Which one scares you more?', p],
    [DEBTOR, "...Okay. Okay! Send the paperwork. I'll sign whatever comes across my desk. Pull me up!", alex],
  ]);
  await cut(g, () => {
    stand(alex, 3.6, -0.1, WEST); alex.set('kneel');
    p.pos.set(E.x + 2.4, 0, E.z - 0.5); p.heading = EAST;
    frame(g, p.pos, alex.group.position, { dist: 4.6, side: -1 });
  }, 0.4);
  await talk(g, [
    [HESH, 'A sensible man. Mazel tov. Somebody find him his glasses.', hesh],
  ]);
  for (const gl of gulls) g.untrack(gl.grp);
  if (g.tracked.has(angler.group)) g.untrack(angler.group);
  await cut(g, () => {
    for (const f of [a, b, c]) f.on = false;
    dismiss(g, hesh, pussy, alex);
    g.cam.fixed = null;
    g.cam.yaw = WEST;
  });
  p.locked = false;
  await passed(g, '$5,000', 5000);
}

// Somebody with somewhere to be: walks (or runs) a loop of points for as long as he is in the scene. What it returns stops him.
export function mill(g, who, pts, { pace = 1.4, pause = 0, run = false } = {}) {
  let k = 0, hold = 0, on = true;
  const pos = who.group.position, gait = run ? 'run' : 'walk';
  g.updaters.push(dt => {
    if (!on || !g.tracked.has(who.group)) return false;
    if (hold > 0) { hold -= dt; return true; }
    const to = pts[k], dx = to.x - pos.x, dz = to.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { k = (k + 1) % pts.length; if (pause) { hold = pause * (0.6 + Math.random() * 0.8); who.set(to.state || 'idle'); if (to.h !== undefined) who.group.rotation.y = to.h; } return true; }
    const step = Math.min(pace * dt, d);
    pos.x += dx / d * step; pos.z += dz / d * step; pos.y = groundAt(pos.x, pos.z);
    who.group.rotation.y = Math.atan2(dx, dz);
    if (who.state !== gait) who.set(gait, run ? 1 : pace / 1.5);
    return true;
  });
  return () => { on = false; };
}
// A garden dressed for a thirteenth birthday: balloons, the banner, presents, the cake, paper cups. Returns what clears it away.
function partyDress(g) {
  const { home } = g.places, P = home.patio, y = groundAt(P.x, P.z), things = [], at = (dx, dz) => ({ x: P.x + dx, z: P.z + dz });
  const add = m => { things.push(m); return g.track(m); };
  const box = (hex, w, h, d, x, yy, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: hex })); m.position.set(x, yy + h / 2, z); return add(m); };
  const COL = [0xd8342c, 0xffe066, 0x49e0d0, 0xff5fd2, 0x2f56c8, 0xff8a30, 0x8a5cff];
  const bobs = [];
  const balloons = (x, z, h = 2.1, n = 3) => {
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.22, 1), new THREE.MeshLambertMaterial({ color: COL[(k + Math.round(x * 3)) % 7] }));
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 3), new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }));
      add(b); add(s); bobs.push({ b, s, x: x + (k - (n - 1) / 2) * 0.24, z: z + (k % 2) * 0.16, y0: groundAt(x, z) + h + (k % 2) * 0.28, y1: groundAt(x, z) + h - 1.1, ph: k * 1.9 + x });
    }
  };
  g.updaters.push(() => { if (!things.length) return false; for (const o of bobs) { const sw = Math.sin(g.time * 1.3 + o.ph) * 0.07; o.b.position.set(o.x + sw, o.y0 + Math.sin(g.time * 0.9 + o.ph) * 0.04, o.z + sw * 0.5); o.s.position.set(o.x + sw / 2, (o.y0 + o.y1) / 2 - 0.12, o.z + sw / 4); o.s.scale.y = o.y0 - o.y1; } return true; });
  for (const [dx, dz] of [[-5, 3.6], [7, 3.6], [2.1, -5.3], [7.1, -5.3], [-4.6, 3.5], [-13, 24.3], [-18.3, 23], [10.5, 8], [10.5, 14], [24.4, 6.6]]) balloons(P.x + dx, P.z + dz, dz === 3.6 ? 3.3 : 2.2);
  // HAPPY BIRTHDAY, strung between the posts of the lights.
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x2 = c.getContext('2d');
  x2.fillStyle = '#f4f4f0'; x2.fillRect(0, 0, 1024, 128); for (let k = 0; k < 16; k++) { x2.fillStyle = ['#d8342c', '#ffe066', '#49e0d0', '#ff5fd2'][k % 4]; x2.beginPath(); x2.moveTo(k * 64, 0); x2.lineTo(k * 64 + 64, 0); x2.lineTo(k * 64 + 32, 26); x2.fill(); }
  x2.fillStyle = '#2f56c8'; x2.font = 'bold 76px "Bebas Neue", Impact, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('HAPPY  BIRTHDAY  A.J.  ·  13', 512, 78);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const turn of [0, Math.PI]) { const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.8), new THREE.MeshBasicMaterial({ map: tex })); banner.position.set(P.x + 1, y + 2.3, P.z + 3.62 + (turn ? -0.01 : 0.01)); banner.rotation.y = turn; add(banner); } // read the right way round from the house and from the lawn
  // The presents, on their own table; the cake, on the long one; cups and plates; a bowl of something orange.
  const gt = at(-5.6, 3.0);
  box(0xf4f4f0, 1.7, 0.03, 0.8, gt.x, y + 0.72, gt.z); for (const [dx, dz] of [[-0.75, -0.3], [0.75, -0.3], [-0.75, 0.3], [0.75, 0.3]]) box(0x8a8d96, 0.04, 0.72, 0.04, gt.x + dx, y, gt.z + dz);
  [[-0.55, 0.36, 0.3, 0xd8342c, 0xffe066], [-0.1, 0.5, 0.22, 0x2f56c8, 0xf4f4f0], [0.4, 0.3, 0.4, 0x49e0d0, 0xff5fd2], [0.62, 0.22, 0.18, 0xffe066, 0xd8342c], [-0.3, 0.2, 0.14, 0x8a5cff, 0xffe066]].forEach(([dx, w, h, hex, rib], k) => {
    const yy = y + 0.75 + (k === 4 ? 0.22 : 0); box(hex, w, h, w * 0.8, gt.x + dx, yy, gt.z + (k % 2) * 0.1 - 0.05); box(rib, w + 0.01, h + 0.01, 0.04, gt.x + dx, yy, gt.z + (k % 2) * 0.1 - 0.05); box(rib, 0.04, h + 0.012, w * 0.8 + 0.01, gt.x + dx, yy, gt.z + (k % 2) * 0.1 - 0.05);
  });
  const ck = at(5.6, -4.1); // on the long table under the pergola
  const tier = (r, h, yy, hex) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), new THREE.MeshLambertMaterial({ color: hex })); m.position.set(ck.x, yy + h / 2, ck.z); add(m); };
  tier(0.36, 0.02, y + 0.86, 0xc9cbd2); tier(0.3, 0.14, y + 0.88, 0xf4f4f0); tier(0.31, 0.03, y + 0.92, 0x2f56c8);
  for (let k = 0; k < 13; k++) { const a = k / 13 * Math.PI * 2; const cnd = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 4), new THREE.MeshBasicMaterial({ color: COL[k % 7] })); cnd.position.set(ck.x + Math.sin(a) * 0.22, y + 1.065, ck.z + Math.cos(a) * 0.22); add(cnd); const fl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffd060 })); fl.position.set(cnd.position.x, y + 1.125, cnd.position.z); add(fl); }
  for (let k = 0; k < 10; k++) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.1, 8), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xd8342c : 0x2f56c8 })); cup.position.set(P.x + 3.2 + (k % 5) * 0.14, y + 0.91, P.z - 3.85 - Math.floor(k / 5) * 0.14); add(cup); }
  for (let k = 0; k < 5; k++) box(0xf4f4f0, 0.24, 0.006, 0.24, P.x + 6.4, y + 0.86 + k * 0.007, P.z - 4.1);
  // Folding chairs out on the lawn, a few already taken; a ball; a water gun somebody will regret.
  const seats = [[-7.6, 9.6, 0.4], [-6.3, 10.4, -0.3], [-1.4, 9.2, 2.6], [0, 9.6, -2.8]].map(([dx, dz, h]) => {
    const s = at(dx, dz); const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), mat); seat.position.y = 0.44; const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.04), mat); back.position.set(0, 0.72, -0.22); grp.add(seat, back);
    for (const [fx, fz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 4), mat); leg.position.set(fx, 0.22, fz); grp.add(leg); }
    grp.position.set(s.x, groundAt(s.x, s.z), s.z); grp.rotation.y = h; add(grp); return { ...s, h };
  });
  { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf4f4f0 })); m.position.set(P.x - 9, y + 0.2, P.z + 7); add(m); box(0x49e0d0, 0.3, 0.1, 0.06, P.x + 6.6, y + 0.1, P.z + 9.5); }
  return { seats, clear: () => { for (const m of things) g.untrack(m); things.length = 0; } };
}

// The same garden on a night when the tickets were two hundred dollars: round tables in white cloths with a candle on
// each, the board that says how much has been raised, a banner, the buffet under the pergola. Returns the seats at the
// tables and what clears it all away.
function benefitDress(g) {
  const { home } = g.places, P = home.patio, y = groundAt(P.x, P.z), things = [], at = (dx, dz) => ({ x: P.x + dx, z: P.z + dz });
  const add = m => { things.push(m); return g.track(m); };
  const mesh = (geo, hex, x, yy, z, glow) => { const m = new THREE.Mesh(geo, glow ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex })); m.position.set(x, yy, z); return add(m); };
  const seats = [];
  for (const [dx, dz] of [[-6.4, 9.6], [-2.6, 11.4], [1.8, 11.8], [-10.6, 6.6]]) { // (clear of the fountain)
    const t = at(dx, dz), ty = groundAt(t.x, t.z);
    mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.74, 18), 0xf4f4f0, t.x, ty + 0.37, t.z); mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 14), 0x8a1c2a, t.x, ty + 0.75, t.z);
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8), 0xcfe8ff, t.x, ty + 0.83, t.z); mesh(new THREE.SphereGeometry(0.03, 6, 5), 0xffd060, t.x, ty + 0.93, t.z, true);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6, sx = t.x + Math.sin(a) * 1.25, sz = t.z + Math.cos(a) * 1.25, grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), mat); seat.position.y = 0.44; const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.04), mat); back.position.set(0, 0.72, -0.22); grp.add(seat, back);
      for (const [fx, fz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 4), mat); leg.position.set(fx, 0.22, fz); grp.add(leg); }
      grp.position.set(sx, ty, sz); grp.rotation.y = a + Math.PI; add(grp); seats.push({ x: sx, z: sz, h: a + Math.PI });
      mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 12), 0xf4f4f0, t.x + Math.sin(a) * 0.5, ty + 0.76, t.z + Math.cos(a) * 0.5); mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.12, 6), 0xcfe8ff, t.x + Math.sin(a + 0.4) * 0.5, ty + 0.81, t.z + Math.cos(a + 0.4) * 0.5); }
  }
  // The banner, and the board with the thermometer on it.
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x2 = c.getContext('2d');
  x2.fillStyle = '#1f3a5a'; x2.fillRect(0, 0, 1024, 128); x2.strokeStyle = '#d9b25a'; x2.lineWidth = 6; x2.strokeRect(8, 8, 1008, 112);
  x2.fillStyle = '#f4f0e0'; x2.font = 'bold 58px "Bebas Neue", Impact, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('VICE GENERAL  ·  PEDIATRIC WING BENEFIT', 512, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const turn of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.82), new THREE.MeshBasicMaterial({ map: tex })); b.position.set(P.x + 1, y + 2.3, P.z + 3.62 + (turn ? -0.01 : 0.01)); b.rotation.y = turn; add(b); }
  const eb = at(-6.2, 1.4);
  mesh(new THREE.BoxGeometry(0.9, 1.3, 0.04), 0xf4f4f0, eb.x, y + 1.35, eb.z).rotation.y = 0.5; for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 4), 0x8a6a44, eb.x + s * 0.3, y + 0.95, eb.z + s * 0.16);
  { const th = mesh(new THREE.BoxGeometry(0.14, 0.7, 0.05), 0xd8342c, eb.x + 0.02, y + 1.2, eb.z + 0.03); th.rotation.y = 0.5; const top = mesh(new THREE.BoxGeometry(0.14, 0.3, 0.05), 0xe9e2cf, eb.x + 0.02, y + 1.7, eb.z + 0.03); top.rotation.y = 0.5; }
  // The buffet, on the long table: three dishes kept hot, the plates, bread, and a queue forming.
  const bt = at(4.6, -4.1);
  for (let k = 0; k < 3; k++) { mesh(new THREE.BoxGeometry(0.6, 0.16, 0.4), 0xc9cbd2, bt.x - 1.2 + k * 0.9, y + 0.95, bt.z); mesh(new THREE.BoxGeometry(0.52, 0.03, 0.32), [0xd8703a, 0xe9d9a8, 0x8a3a22][k], bt.x - 1.2 + k * 0.9, y + 1.04, bt.z); mesh(new THREE.BoxGeometry(0.2, 0.03, 0.14), 0x4f8cff, bt.x - 1.2 + k * 0.9, y + 0.86, bt.z, true); }
  for (let k = 0; k < 8; k++) mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 12), 0xf4f4f0, bt.x + 1.7, y + 0.87 + k * 0.014, bt.z);
  mesh(new THREE.BoxGeometry(0.4, 0.1, 0.26), 0xc79a6a, bt.x - 1.9, y + 0.92, bt.z);
  // Wine at the top of the drive, where the van was unloaded; flowers either side of the path.
  const w = spot(home.drive, 4.2, -3.6), crates = [];
  for (let k = 0; k < 4; k++) crates.push(mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36), 0x8a6a44, w.x + (k % 2) * 0.56, groundAt(w.x, w.z) + 0.16 + Math.floor(k / 2) * 0.33, w.z));
  for (const [dx, dz] of [[-2.2, -3.2], [0.2, -3.2], [-2.2, -0.2], [0.2, -0.2]]) { const f = at(dx, dz); mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.4, 8), 0xf4f4f0, f.x, y + 0.2, f.z); for (let k = 0; k < 5; k++) mesh(new THREE.SphereGeometry(0.08, 6, 5), [0xf4f4f0, 0xffe066, 0xff8ad8][k % 3], f.x + Math.sin(k * 1.3) * 0.1, y + 0.5 + (k % 2) * 0.08, f.z + Math.cos(k * 1.3) * 0.1); }
  return { seats, crates, clear: () => { for (const m of things) g.untrack(m); things.length = 0; } };
}

// ---------- 8. The Party ----------
// AJ's birthday, the second attempt. Everyone comes, including the two people who should not be talking.

async function theParty(g) {
  const { home, houseRoom, melfi, house2 } = g.places, p = g.player, K = kitchen(g), front = g.places.doors.find(d => d.name === 'home');
  const cast = {}, crowd = [];

  // He wakes upstairs in his own bed. The garden is already full: everything out there is in place before he comes down.
  p.locked = true;
  await fade(g, 1, 0.8);
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.setNight(0);
  const at = (dx, dz) => spot(home.patio, dx, dz);
  cast.carmela = actor(g, 'carmela', at(2.2, 2.8), WEST);
  cast.aj = actor(g, 'aj', spot(home.pool, -1.4, 3.5), NORTH);
  cast.meadow = actor(g, 'meadow', spot(home.pool, -1.8, 5.2), NORTH, 'talk');
  cast.pussy = actor(g, 'pussy', at(-5, 0), EAST, 'talk');
  cast.silvio = actor(g, 'silvio', at(-3.4, -0.8), WEST);
  cast.paulie = actor(g, 'paulie', at(-3.8, 1.2), WEST, 'talk');
  cast.hesh = actor(g, 'hesh', at(-1, 6.5), EAST);
  cast.artie = actor(g, 'artie', at(1, 7), WEST, 'talk');
  cast.chris = actor(g, 'christopher', spot(home.drive, 5, 5), SOUTH);
  const dress = partyDress(g);
  { // Everybody else: neighbours on the folding chairs, people at the cabana, a couple under the umbrella, children who will not stop running
    const guest = (where, h, state, look) => { const who = extraAt(g, where, h, state, look); crowd.push(who); return who; };
    const KID = [{ shirt: 0xd8342c, tee: true, pants: 0x3b6ea8, hair: 0x3a2a1c, height: 0.7, head: 1.26 }, { shirt: 0xffe066, tee: true, pants: 0x23232b, hair: 0x111111, height: 0.66, head: 1.28, dark: true }, { body: 'female', shirt: 0xff8ad8, tee: true, pants: 0xf4f4f0, hair: 0xd9b25a, hairMesh: 'long', height: 0.68, head: 1.24 }];
    const fo = g.places.fountain, ring = k => Array.from({ length: 8 }, (_, n) => { const a = (n + k) * Math.PI / 4; return { x: fo.x + Math.sin(a) * 3.3, z: fo.z + Math.cos(a) * 3.3 }; });
    KID.forEach((look, k) => { const kid = guest(ring(k * 3)[0], 0, 'run', look); mill(g, kid, ring(k * 3), { pace: 3.4 + k * 0.3, run: true }); });
    dress.seats.forEach((st, k) => { if (k !== 2) guest({ x: st.x, z: st.z }, st.h, 'sit'); });
    guest(at(27.6, 8.5), WEST, 'idle', { shirt: 0xf4f4f0, sleeves: 'long', tucked: true, pants: 0x23232b, hair: 0x2b1b12, hairMesh: 'parted' });       // the man they hired for the bar
    guest(at(24.5, 7.5), EAST, 'talk'); guest(at(24.5, 9.6), EAST, 'idle');
    guest(at(18.25, 18.5), EAST, 'sit'); guest(at(20.15, 18.5), WEST, 'sit', { body: 'female', shirt: 0xff8a5c, tee: true, pants: 0xf4f4f0, hair: 0x2a1a14, hairMesh: 'long' });
    guest(at(-6.2, 13), EAST, 'talk'); guest(at(-4.9, 13.3), WEST, 'idle', { body: 'female', shirt: 0x49e0d0, tee: true, pants: 0x23232b, hair: 0xb5392a, hairMesh: 'long' });
    crowd.push(actor(g, 'hunter', spot(home.pool, -1, 6.6), NORTH));
    // And a girl with a tray, round and round: the table, the pool, the lawn, the table.
    const tray = guest(at(3, -2.6), 0, 'walk', { body: 'female', shirt: 0x16161c, sleeves: 'long', pants: 0x16161c, hair: 0x111111, hairMesh: 'long' });
    mill(g, tray, [at(3, -2.6), at(-2.6, 2.6), at(-4, 9), at(3, 9.6), spot(home.pool, -1.2, 1), at(6.2, 4)], { pace: 1.3, pause: 2.2 });
  }
  for (const a of houseRoom.ambient) a.group.visible = false;   // Carmela is out in the garden with everybody else
  p.inside = front;
  p.pos.set(house2.bedside.x, 0, house2.bedside.z); p.heading = g.cam.yaw = EAST; g.cam.pitch = 0.22;
  g.cam.fixed = null;
  g.hud.card('The Party', "AJ's birthday, take two");
  await fade(g, 0, 1.2);
  await say(g, '', 'Saturday. He had lain down for ten minutes at noon. It was a quarter to two now, and there were voices in the garden.');
  await say(g, CARMELA, "Anthony! People are here! Your son's party. Again. Try to stay on your feet for this one.");
  g.hud.card();
  p.locked = false;
  g.setCheckpoint?.();
  // Out of the bedroom, along the landing, and down his own stairs.
  await reach(g, house2.stairTop, 'Find the <b>stairs</b>: out of the bedroom door, and along the landing to the end.', { r: 1.3, how: 'foot' });
  await reach(g, house2.stairFoot, 'Go down. Find the <b>kitchen</b>.', { r: 1.3, how: 'foot' });
  // The kitchen: Carmela has left the tray where he cannot miss it.
  const tray = new THREE.Group();
  { const steel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.4), new THREE.MeshLambertMaterial({ color: 0xc9cbd2 })); tray.add(steel);
    for (let k = 0; k < 8; k++) { const sg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 6).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc8705a })); sg.position.set(-0.14 + (k % 2) * 0.26, 0.04, -0.14 + Math.floor(k / 2) * 0.09); tray.add(sg); } }
  tray.position.set(K.X - 4, K.Y + 0.98, K.Z - 1.1); g.track(tray);
  await reach(g, roomSpot(K, -4, 0.25), 'Find the tray of <b>sausage</b> on the kitchen island.', { r: 1.2, how: 'foot' });
  p.locked = true; p.heading = NORTH;
  await say(g, TONY, 'Eight pounds of sweet, eight of hot. For thirteen-year-olds.', 2.8);
  await handover(g, null, { from: { x: tray.position.x, y: tray.position.y, z: tray.position.z }, hex: 0xc9cbd2, sound: false });
  g.untrack(tray);
  p.locked = false;
  await walkOut(g, houseRoom, 'Go out to the <b>garden</b>: the front door.');
  for (const a of houseRoom.ambient) a.group.visible = true;
  p.locked = true;
  shot(g, spot(front.outside, -3, -0.2), at(1, 4), 2.2, 1.2);       // the whole garden, from the step
  await say(g, '', 'Balloons on the mailbox. Sixty people. A man he had never seen was running his bar.', 3.4);
  g.cam.fixed = null;
  p.locked = false;

  await reach(g, home.grill, 'Take over at the <b>grill</b>.', { r: 1.4, how: 'foot' });
  p.locked = true; p.heading = NORTH;
  p.pos.set(home.grill.x, 0, home.grill.z);
  await say(g, PAULIE, 'There he is. Sleeping Beauty. I been turning these for you, T, they are a little ahead of schedule.', 3.4);
  p.locked = false;
  await shovel(g, 1, 1, 'Turn the sausage', null, null, false);
  p.locked = true;
  frame(g, p.pos, cast.aj.group.position, { dist: 5.2 });
  await talk(g, [
    [TONY, 'Who wants sausage? AJ! Thirteen years old. Come here.', p],
    [AJ, "Is Grandma coming? She said she's not coming. So that means she's coming, right?", cast.aj],
    [TONY, "That's exactly what it means.", p],
  ]);
  g.cam.fixed = null;
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
  await fade(g, 1, 1);
  await say(g, '', 'The last of them left at nine. On Thursday he had somewhere to be.');
  dismiss(g, ...Object.values(cast));
  for (const who of crowd) g.untrack(who.group);
  dress.clear();
  g.setNight(0);
  p.pos.set(home.wake.x, 0, home.wake.z); g.cam.yaw = p.heading = 0;
  await fade(g, 0, 1);
  await toMelfi(g);

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
  place(g, melfi.door, 0);
  g.cam.yaw = Math.PI * 0.75;
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
  // On the way in: three envelopes that are late.
  await phone(g, SILVIO, 'Before you come in. Three envelopes did not turn up this week: the cafe, the auto body, the motor lodge. You are passing all three.');
  const { cafe, bodyshop, motel } = g.places;
  let runner = null, got = 0;
  // The people who owe are where they work, before he gets there.
  const at0 = between(cafe.kerb, cafe.door, 0.3), at1 = between(bodyshop.kerb, bodyshop.door, 0.3), at2 = spot(motel.kerb, -3, -6);
  const owner = extraAt(g, at0, toward(at0, cafe.kerb), 'idle', { shirt: 0xf4f4f0, sleeves: 'long', tucked: true, pants: 0x23232b, hair: 0x8d8a8e, hairStyle: 'balding', mustache: 0x8d8a8e, bulk: 1.1, age: 0.6 });
  const man = extraAt(g, at1, toward(at1, bodyshop.kerb), 'idle', { shirt: 0x2f56c8, sleeves: 'long', tucked: true, pants: 0x2f56c8, hair: 0x4a3324, hairMesh: 'buzzed', bulk: 1.25, stubble: 0.5 });
  const clerk = extraAt(g, at2, toward(at2, motel.kerb), 'idle', { shirt: 0xd9c7a0, tee: true, pants: 0x3b4a66, hair: 0x2b1b12, hairMesh: 'parted', bulk: 0.9, glasses: 'clear' });
  const meet = async who => { // he gets out; they have seen the car, and come over to it
    p.locked = true;
    if (p.car) { p.car.speed = 0; g.leaveCar(); }
    const pos = who.group.position;
    who.set('walk', 1);
    let last = g.time;
    await g.until(() => {
      const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, d = Math.hypot(dx, dz), dt = Math.min(0.1, g.time - last);
      last = g.time;
      if (d < 1.9) return true;
      const step = Math.min(2.6 * dt, d - 1.8);
      pos.x += dx / d * step; pos.z += dz / d * step; pushOut(pos, 0.35); pos.y = groundAt(pos.x, pos.z);
      who.group.rotation.y = Math.atan2(dx, dz);
      return false;
    });
    who.set('idle');
    p.heading = toward(p.pos, pos); who.group.rotation.y = toward(pos, p.pos);
    frame(g, p.pos, pos, { dist: 4.2 });
  };
  await rounds(g, [cafe.kerb, bodyshop.kerb, motel.kerb], '<b>Drive</b> round and collect the three envelopes.', async k => {
    const at = [cafe.kerb, bodyshop.kerb, motel.kerb][k];
    if (k === 0) {
      await meet(owner);
      await talk(g, [
        ['Owner', 'It is all there, Mr. Soprano. I had it ready Tuesday. Nobody came for it.', owner],
        [TONY, 'Then Tuesday was somebody else being lazy. Not you.', p],
      ]);
      await handover(g, owner);
      await say(g, '', `Envelope ${++got} of 3.`, 1.6);
      g.cam.fixed = null; p.locked = false;
      g.wait(8).then(() => g.untrack(owner.group)).catch(() => {});
    } else if (k === 1) {
      await meet(man);
      await talk(g, [
        ['Mechanic', 'I pay your uncle now. A man came round. He said the arrangement had changed.', man],
        [TONY, 'Did he. Then let us change it back.', p],
      ]);
      g.cam.fixed = null; p.locked = false;
      const foe = g.makeEnemy(man, { health: 90, damage: 7, cash: 0 });
      foe.die = () => { foe.health = 1; foe.dead = true; foe.ai = null; man.after = null; man.set('down'); };
      const mark = quarry(g, foe);                       // an arrow over him: this is who
      fistsOnly(g, true);
      g.hud.objective('<b>Rough him up</b>: the mechanic, under the yellow arrow, until he remembers who he pays. &nbsp; <b>Click</b> or <b>E</b> to hit.');
      await g.until(() => foe.dead);
      mark();
      g.hud.objective();
      fistsOnly(g, false);
      g.removeNpc(man);
      p.locked = true;
      frame(g, p.pos, man.group.position, { dist: 4 });
      await say(g, 'Mechanic', 'Okay! Okay. It is in my shirt. All of it. Take it.', 3);
      await handover(g, null, { from: { x: man.group.position.x, z: man.group.position.z } });
      await say(g, '', `Envelope ${++got} of 3.`, 1.6);
      g.cam.fixed = null; p.locked = false;
      g.pardon();
      g.wait(6).then(() => g.untrack(man.group)).catch(() => {});
    } else {
      await meet(clerk);
      clerk.set('talk');
      await talk(g, [
        ['Night man', 'You are the second tonight. A fellow was in ten minutes ago. He said he collects for the family now. I gave it to him. That is him, pulling out.', clerk],
        [TONY, 'Which family did he say.', p],
      ]);
      clerk.set('idle');
      g.cam.fixed = null; p.locked = false;
      runner = propCar(g, spot(at, 26, 0), at.h ?? EAST, 0x2f56c8, 'coupe');
      if (!p.car) { g.hud.objective('Get in the <b>car</b>.'); await g.until(() => p.car); }
      await runDown(g, runner, '<b>Stop the</b> blue coupe. Ram it until it gives up.');
      // He gets out with his hands where they can be seen, and the envelope in one of them.
      const side = { x: runner.pos.x + Math.cos(runner.heading) * 1.9, z: runner.pos.z - Math.sin(runner.heading) * 1.9 };
      const driver = extraAt(g, side, toward(side, p.pos), 'idle', { jacket: 0x2a2a30, shirt: 0x8a1c1c, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', stubble: 0.5 });
      g.sfx?.carDoor();
      await meet(driver);
      await talk(g, [
        ['Driver', 'It is right here! Take it! I was told nobody was working this side any more!', driver],
        [TONY, 'Told by who? ...Never mind. I know by who.', p],
      ]);
      await handover(g, driver);
      await say(g, '', `Envelope ${++got} of 3.`, 1.6);
      g.cam.fixed = null; p.locked = false;
      g.wait(8).then(() => g.untrack(driver.group)).catch(() => {});
      g.untrack(clerk.group);
    }
  });
  await reach(g, bing.door, 'Three envelopes. Take them to the <b>Bada Bing</b>.', { r: 4 });
  if (runner && g.cars.includes(runner)) g.removeCar(runner);

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
  stayInBing(g, bing.park);                              // the count is over; he is still in the club, and walks out when he likes
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

  // The stop, staged: the driver down from his cab with his back to it, Christopher in front of him, Brendan off to one
  // side with the gun on him, their car behind, the truck's flashers going. Nobody stands in anybody.
  p.locked = true;
  const fw = { x: Math.sin(truck.heading), z: Math.cos(truck.heading) }, rt = { x: Math.cos(truck.heading), z: -Math.sin(truck.heading) };
  const along = (f, r) => ({ x: truck.pos.x + fw.x * f + rt.x * r, z: truck.pos.z + fw.z * f + rt.z * r });
  const cab = along(2.2, 2.1), mine = along(2.2, 4.4), his = along(-0.6, 4.6), rear = along(-truck.reach - 0.2, 0);
  const load = [];
  await cut(g, () => {
    const own = p.car && p.car !== truck ? p.car : null;
    if (p.car) { p.car.speed = 0; g.leaveCar(mine); }
    if (own) { const at = along(-truck.reach - 8, 0.4); own.pos.set(at.x, 0, at.z); own.heading = truck.heading; own.speed = 0; own.sync?.(); }
    p.pos.set(mine.x, 0, mine.z); p.heading = toward(mine, cab);
    driver = actor(g, 'trucker', cab, toward(cab, mine));
    pal.stay = true; pal.car = null; pal.pos.set(his.x, 0, his.z);
    brendan.group.visible = true; brendan.group.position.set(his.x, groundAt(his.x, his.z), his.z); brendan.group.rotation.y = toward(his, cab);
    brendan.arm(true); brendan.set('aim');
    // Flashers at the four corners.
    const amber = new THREE.MeshBasicMaterial({ color: 0xffa020 });
    for (const [f, r] of [[truck.reach, 1.05], [truck.reach, -1.05], [-truck.reach, 1.05], [-truck.reach, -1.05]]) { const at = along(f, r), m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), amber); m.position.set(at.x, 0.95, at.z); g.track(m); load.push(m); }
    g.updaters.push(() => { if (!load.length) return false; amber.color.setHex(Math.floor(g.time * 2.4) % 2 ? 0xffa020 : 0x3a2408); return true; });
    shot(g, along(7.4, 8.2), along(1.2, 3.4), 1.9, 1.25);
  }, 0.5);
  await talk(g, [
    [BRENDAN, "Out! Keys stay in it! Don't look at us!", brendan],
    ['Driver', "Take it, take it. I got two kids. Do me one favour: give me a shot in the face, so my boss believes me.", driver],
    [CHRIS, "You're asking me to hit you.", p],
    ['Driver', 'Not the teeth.', driver],
  ]);
  const poor = g.addNpc(driver, { health: 100, cash: 0, stays: true });
  poor.die = () => { poor.health = 1; };
  const who = quarry(g, poor);
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('<b>Hit the driver</b>, like he asked. &nbsp; <b>Click</b> or <b>E</b>.');
  await g.until(() => poor.health < 100);
  who();
  g.hud.objective();
  g.removeNpc(driver);
  fistsOnly(g, false);
  driver.after = null; driver.set('down');
  await g.wait(1.2);
  await say(g, '', 'Christopher obliged him. It seemed only polite.');
  // Brendan has the back open: floor to roof.
  p.locked = true;
  await cut(g, () => {
    brendan.arm(false); brendan.set('idle');
    const bs = along(-truck.reach - 1.6, 1.3), ps = along(-truck.reach - 2.6, -0.5);
    brendan.group.position.set(bs.x, groundAt(bs.x, bs.z), bs.z); brendan.group.rotation.y = toward(bs, rear); pal.pos.set(bs.x, 0, bs.z);
    p.pos.set(ps.x, 0, ps.z); p.heading = toward(ps, rear);
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xe9e6de }), card = new THREE.MeshLambertMaterial({ color: 0xc79a6a }), tape = new THREE.MeshLambertMaterial({ color: 0x2f56c8 });
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 1.1), doorMat), at = along(-truck.reach - 0.55, s * 1.25); d.position.set(at.x, 2.1, at.z); d.rotation.y = truck.heading + s * 0.25; g.track(d); load.push(d); } // the doors, swung out
    { const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.05), new THREE.MeshBasicMaterial({ color: 0x0a0a0e })), at = along(-truck.reach - 0.03, 0); hole.position.set(at.x, 2.28, at.z); hole.rotation.y = truck.heading + Math.PI; g.track(hole); load.push(hole); } // the back, open
    for (let k = 0; k < 21; k++) { // cartons to the roof in the mouth of it, and a few that came down when the doors went
      const inTruck = k < 16, at = inTruck ? along(-truck.reach - 0.06, -0.75 + (k % 4) * 0.5) : along(-truck.reach - 0.9 - (k % 2) * 0.55, -1 + (k - 16) * 0.5);
      const bx = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.44, 0.47), card); bx.position.set(at.x, inTruck ? 1.5 + Math.floor(k / 4) * 0.46 : 0.24 + groundAt(at.x, at.z), at.z); bx.rotation.y = truck.heading + (inTruck ? 0 : k * 0.7); g.track(bx); load.push(bx);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.48), tape); band.position.copy(bx.position); band.rotation.y = bx.rotation.y; g.track(band); load.push(band);
    }
    shot(g, along(-truck.reach - 5.2, 2.6), along(-truck.reach, 0), 1.7, 1.5);
  }, 0.5);
  await talk(g, [
    [BRENDAN, 'Look at this. Floor to roof. There must be four hundred in here.', brendan],
    [CHRIS, 'Shut the doors. We are standing in the road with a truck that is not ours.', p],
  ]);
  for (const m of load.splice(0)) g.untrack(m);
  pal.stay = false;
  g.cam.fixed = null;
  p.locked = false;
  await wantCar(g, truck, 'Get in the <b>truck</b>.');
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
  junior = actor(g, 'junior', spot(t, -0.95, 0), EAST, 'sit'); // there before he arrives
  jackie = actor(g, 'jackie', spot(t, 0.95, 0), WEST, 'sit');
  await reach(g, satriale.kerb, "Drive to <b>Satriale's</b>.");

  p.locked = true;
  await cut(g, () => {
    place(g, spot(t, -1.5, 2.1), NORTH, satriale.kerb);
    p.heading = toward(p.pos, t);
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
  const club = await intoBing(g, 'Find Christopher and Brendan at the <b>Bada Bing</b>.', club => {
    chris = actor(g, 'christopher', spot(club.door, -1, -2.2), SOUTH);
    brendan = actor(g, 'brendan', spot(club.door, 1.2, -2.4), SOUTH);
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    frame(g, p.pos, spot(club.door, 0, -2.3), { dist: 5 });
  }, 0.4);
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
  // The ruling was restitution. Tony sees to it himself.
  const { comley } = g.places, lot = spot(satriale.kerb, 14, 0);
  const truck = propCar(g, lot, satriale.kerb.h, 0xd8342c, 'truck');
  await say(g, TONY, 'The truck goes back tonight, with everything still in it. I will drive it myself, so I know it got there.', 3.6);
  await wantCar(g, truck, 'Get in the <b>truck</b>.');
  truck.driverless = false;
  const load = careful(g, 'The load', 'At the second bump a carton of DVD players went out through the back doors. He stacked it again and started over.', () => { if (p.car) g.leaveCar(); truck.pos.set(lot.x, 0, lot.z); truck.heading = satriale.kerb.h; truck.speed = 0; g.enterCar(truck); });
  await load.to(comley.gate, '<b>Drive</b> the truck back to Comley Trucking. Gently.', truck);
  load.stop();
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'He left it at the dock with the keys on the seat, and walked to the corner for a cab.');
  g.removeCar(truck);
  homeAsTony(g, p.human);
  await fade(g, 0, 1.2);
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
  // They are at it before anybody arrives: the teacher's car under the tarp with its wheels off, Eddie watching two of
  // his boys take the rest of it apart, a torch going.
  const shell = new Car(g.scene, chop.x + 5, chop.z - 3, 0.6, 0xd9c7a0, 'sedan');
  g.track(shell.mesh);
  shell.hideWheels();
  shell.mesh.position.y -= 0.24;
  eddie = actor(g, 'eddie', spot(chop, 2.6, -1.8), EAST);
  const thug = (at, h, state) => { const a = makeHuman({ ...randomPedLook(), body: 'male' }); a.group.position.set(at.x, groundAt(at.x, at.z), at.z); a.group.rotation.y = h; a.set(state); g.track(a.group); return a; };
  const thugs = [thug(spot(chop, 6.9, -1.4), WEST, 'kneel'), thug(spot(chop, 3.4, -4.6), SOUTH - 0.6, 'kneel')];
  const torch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));
  torch.position.set(chop.x + 6.2, groundAt(chop.x + 6.2, chop.z - 1.6) + 0.55, chop.z - 1.6); g.track(torch);
  let working = true;
  g.updaters.push(() => { if (!working || !torch.parent) return false; torch.visible = Math.sin(g.time * 37) + Math.sin(g.time * 23) > 0.2; torch.scale.setScalar(0.7 + Math.random() * 0.9); return true; });
  await reach(g, chop, 'Drive to the <b>north end of the beach</b>.', { how: 'car', r: 7 });

  // Too late: the car is already in pieces.
  p.locked = true;
  await cut(g, () => {
    place(g, spot(chop, 1.5, 1.2), NORTH);
    pal.stay = true; pal.car = null; paulie.group.visible = true;
    const ps = spot(chop, 0, 1.9); paulie.group.position.set(ps.x, groundAt(ps.x, ps.z), ps.z); paulie.group.rotation.y = toward(ps, eddie.group.position); paulie.set('idle'); pal.pos.set(ps.x, 0, ps.z);
    eddie.group.rotation.y = toward(eddie.group.position, p.pos);
    p.heading = toward(p.pos, eddie.group.position);
    shot(g, spot(chop, -3.6, 4.6), spot(chop, 3.6, -1.6), 1.8, 1.3);     // the two of them, Eddie, and the whole yard behind him
  });
  await talk(g, [
    ['Eddie', "The teacher's car? Aw, man. It's parts already. I didn't know he was a friend of yours.", eddie],
    [PAULIE, 'So put it back together.', paulie],
    ['Eddie', "Hey, you don't come down here and talk to me like that. Boys!", eddie],
  ]);
  working = false; g.untrack(torch);
  for (const t of thugs) { t.after = null; t.set('idle'); }
  pal.stay = false;
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
  // Into the middle bay teal, and out of it tan.
  await respray(g, target, { x: bodyshop.door.x, z: bodyshop.door.z + 3 }, SOUTH, 0xcdb98a, "Pussy's cousin sprayed it tan. Close to tan.");
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

  // Inside. She is in her front room with a dish towel; the kitchen is behind her, and it is still going (unless the
  // engines got there first, in which case a fireman is standing in it).
  const HOME = g.places.rooms.LIVIA, UP = g.places.rooms.LIVIA_UP, door = g.places.doors.find(d => d.inside === HOME.inside);
  ma = actor(g, 'livia', roomSpot(HOME, 0.6, 1.2), SOUTH, 'talk');
  const blaze = [], pan = roomSpot(HOME, 6.1, 2.2);
  for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), new THREE.MeshBasicMaterial({ color: 0x3a3438, transparent: true, opacity: 0.5, depthWrite: false })); m.userData.k = k / 7; g.track(m); blaze.push(m); }
  const flame = [0, 1, 2].map(k => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.16 - k * 0.03, 0.5 + k * 0.12, 6), new THREE.MeshBasicMaterial({ color: [0xff8a30, 0xffb040, 0xffe066][k], transparent: true, opacity: 0.9 })); m.position.set(pan.x + (k - 1) * 0.07, HOME.Y + 1.25, pan.z); g.track(m); return m; });
  const skillet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.06, 12), new THREE.MeshLambertMaterial({ color: 0x1c1c22 })); skillet.position.set(pan.x, HOME.Y + 1, pan.z); g.track(skillet);
  let burn = late ? 0 : 1;
  g.updaters.push(() => {
    if (!skillet.parent) return false;
    for (const [k, m] of flame.entries()) { m.visible = burn > 0.05; m.scale.set(burn * (1 + Math.sin(g.time * 11 + k * 2) * 0.2), burn * (1 + Math.sin(g.time * 8 + k) * 0.35), burn); m.rotation.y = g.time * 2 + k; }
    for (const m of blaze) { const k = (g.time * 0.3 + m.userData.k) % 1, thick = 0.25 + burn * 0.75; m.position.set(pan.x - k * 2.6 + Math.sin(m.userData.k * 30) * 0.5, HOME.Y + 1.2 + k * 1.9, pan.z + Math.cos(m.userData.k * 17) * 0.9 * k); m.scale.setScalar(0.6 + k * 2.2); m.material.opacity = 0.45 * thick * (1 - k); }
    return true;
  });
  const fireman = late ? extraAt(g, roomSpot(HOME, 4.6, 2.4), WEST, 'idle', { jacket: 0x2a2a30, shirt: 0xf2c230, tee: true, pants: 0x2a2a30, hair: 0x2b1b12, hat: 'cap', hatColor: 0x2a2a30, bulk: 1.2 }) : null;
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  fire.stop();
  await reach(g, door.outside, late ? 'Go <b>in</b>.' : 'Go <b>in</b>! The kitchen is on the right.', { r: 1.8, how: 'foot' });
  await enter(g, HOME);
  if (!late) {
    say(g, LIVIA, 'I was only making mushrooms! I turn my back one minute!', 3).catch(() => {});
    await reach(g, roomSpot(HOME, 5, 2.2), 'Find the <b>stove</b>: the pan is alight.', { r: 1.2, how: 'foot' });
    p.heading = EAST;
    await shovel(g, 1, 1, 'Smother it with the lid', k => { burn = 1 - k; }, null, false);
    burn = 0;
    await say(g, TONY, 'It is out. It is out, Ma. Open a window.', 2.6);
  } else {
    p.locked = true;
    await say(g, 'Fireman', 'Grease fire. We had it out in a minute. She told my lieutenant he was tracking mud. You the son?', 4);
    p.locked = false;
  }
  // She sits. So does he, eventually.
  ma.set('sit'); ma.group.position.set(HOME.sofa.x - 0.6, HOME.Y, HOME.sofa.z); ma.group.rotation.y = SOUTH;
  if (fireman) g.untrack(fireman.group);
  await reach(g, roomSpot(HOME, -2.2, -2.2), 'Find your <b>mother</b>. She has gone to sit down.', { r: 1.3, how: 'foot' });
  p.locked = true;
  await cut(g, () => {
    p.pos.set(HOME.sofa.x + 0.7, 0, HOME.sofa.z); p.heading = SOUTH; p.pose = 'sit';
    help = actor(g, 'perrilyn', roomSpot(HOME, 0.2, 3.4), NORTH);
    g.cam.fixed = inRoom(HOME, [-0.4, 0.4], [-2.9, -3.3], 1.45, 1).cam;
  }, 0.4);
  await talk(g, [
    [LIVIA, late ? 'The firemen came before my own son did.' : 'That stove was your father\'s idea. I never wanted gas.', ma],
    [TONY, "Ma. You can't be on your own here. I asked somebody to come. This is Perrilyn. She's going to help around the house. Cook, clean, drive you.", p],
  ]);
  { const pos = help.group.position, z0 = pos.z, t0 = g.time; help.set('walk', 0.9); g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / 2.2); pos.z = z0 - k * 3.4; pos.x = HOME.X + 0.2 - k * 0.9; if (k >= 1) { help.set('idle'); help.group.rotation.y = toward(pos, ma.group.position); } return k < 1 && g.tracked.has(help.group); }); }
  g.cam.fixed = inRoom(HOME, [1.6, 1.4], [-2.4, -3], 1.5, 1.05).cam;
  await talk(g, [
    [LIVIA, "A stranger in my house. She'll steal. They all steal.", ma],
    ['Perrilyn', 'Mrs. Soprano, I have looked after families for twenty years.', help],
    [LIVIA, 'Then go and look after them.', ma],
  ]);
  await fade(g, 1, 0.8);
  dismiss(g, help);
  for (const m of [...blaze, ...flame, skillet]) g.untrack(m);
  p.pose = null;
  await say(g, '', 'Perrilyn lasted one afternoon.');
  await say(g, '', 'That Friday, Livia drove her friend Fanny home from the hairdresser.');

  // The car lurches forward in the drive. (Seen from the street; Tony is not there.)
  const drive = spot(house.porch, 4.4, 0.6), car = g.spawnCar(drive.x, drive.z, SOUTH, 0xd9c7a0, 'sedan');
  ma.group.visible = false;
  p.hidden = true;
  for (const h of door.hide || []) h.group.visible = true;
  p.inside = null; p.pos.set(house.path.x, 0, house.path.z);
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
  // Back in her front room, and this time he does not sit.
  ma.group.visible = true;
  p.hidden = false;
  for (const h of door.hide || []) h.group.visible = false;
  p.inside = door;
  p.pos.set(HOME.X - 1.4, 0, HOME.Z - 1.2); p.heading = toward(p.pos, ma.group.position);
  g.cam.fixed = inRoom(HOME, [1.2, 0.8], [-2.6, -3], 1.55, 1.1).cam;
  await fade(g, 0, 0.8);
  await talk(g, [
    [TONY, "That's it. You can't cook, you can't drive. You're going to Green Grove. Today.", p],
    [LIVIA, 'Then kill me now. Go on. Take a knife and do it.', ma],
    [TONY, 'I am going upstairs to get your case. You are going to be in the car when I come down.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  { // Up to her room for the suitcase, past a door he does not open, and down again.
    const stair = (g.places.stairs || []).find(st => near(st.a, roomSpot(HOME, -5, 2.8), 1.5)), isUp = () => p.pos.z < HOME.Z - 12;
    const climb = async (text, from, to, done) => {
      g.hud.objective(text);
      const m = g.addMarker(from.x, from.z, 1.3);
      await g.until(() => near(p.pos, from, 1.4) || done());
      g.removeMarker(m); g.hud.objective();
      if (!done()) { p.locked = true; await fade(g, 1, 0.35); p.pos.set(to.x, 0, to.z); p.heading = g.cam.yaw = to.h; await fade(g, 0, 0.35); p.locked = false; }
    };
    await climb('Find the <b>stairs</b>, by the wall on the left, and go up.', stair.a, stair.b, isUp);
    await reach(g, UP.suitcase, 'Find her <b>suitcase</b>: on top of the wardrobe in her room.', { r: 1.2, how: 'foot' });
    p.heading = NORTH;
    await shovel(g, 1, 1, 'Pack her things', null, null, false);
    await say(g, '', 'Nightgowns, the pills, the photograph of his father. She had the case half packed already. She had had it half packed for a year.', 4.6);
    await reach(g, UP.oldRoom, 'Find the room across the landing. <b>Look in</b>.', { r: 1.5, how: 'foot' });
    p.locked = true; p.heading = NORTH;
    g.cam.fixed = inRoom(UP, [1.2, 1.6], [4.4, -3.6], 1.6, 1.1).cam;
    await say(g, '', 'The pennants, the aeroplanes, the glove. Nothing in it had been moved since he was sixteen. He could not have said whether that was love.', 5);
    g.cam.fixed = null; p.locked = false;
    await climb('Find the <b>stairs</b> again, and go down.', stair.b, stair.a, () => !isUp());
  }
  ma.set('idle'); ma.group.position.set(HOME.inside.x - 1.2, HOME.Y, HOME.inside.z + 0.4); ma.group.rotation.y = NORTH;
  await walkOut(g, HOME, 'Go out to the <b>car</b>. She is waiting by the door.');
  ma.group.position.set(p.pos.x + 1.2, groundAt(p.pos.x + 1.2, p.pos.z), p.pos.z + 0.6);
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
  const club = await intoBing(g, 'Get to the <b>Bada Bing</b>.', club => {
    g.setNight(1);
    cast.brendan = actor(g, 'brendan', spot(club.door, -3, -0.8), EAST);
    cast.chris = actor(g, 'christopher', spot(club.door, -3.2, 1), EAST);
    cast.paulie = actor(g, 'paulie', spot(club.door, -1, -2.6), SOUTH);
    cast.silvio = actor(g, 'silvio', spot(club.door, 0.8, -2.8), SOUTH);
    cast.pussy = actor(g, 'pussy', spot(club.door, 2.4, -2.2), SOUTH);
  });
  await cut(g, () => {
    place(g, club.door, WEST, bing.park);
    shot(g, spot(club.door, 0.6, 5.2), spot(club.door, -0.4, -2.4), 1.9, 1.1);
  }, 0.4);
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
  await wantCar(g, truck, 'Get in the <b>truck</b>.');
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
  // Inside, with the boxes: it is the cabinet of photographs that does it.
  const HOME = g.places.rooms.LIVIA, hdoor = g.places.doors.find(d => d.inside === HOME.inside);
  const boxes = [[-1.2, 2.2, 0.5], [-0.5, 2.5, 0.42], [3.6, -1.2, 0.5], [4.3, -0.9, 0.4], [-4.4, -0.4, 0.46]].map(([x, z, sz], k) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sz + 0.12, sz, sz), new THREE.MeshLambertMaterial({ color: 0xc79a6a })); b.position.set(HOME.X + x, HOME.Y + sz / 2, HOME.Z + z); b.rotation.y = k * 0.5; g.track(b); return b; });
  await reach(g, hdoor.outside, 'Go in and <b>pack her things</b>.', { r: 1.8, how: 'foot' });
  await enter(g, HOME);
  await reach(g, roomSpot(HOME, 4.9, -1.9), 'Find the cabinet of <b>photographs</b>, and start there.', { r: 1.3, how: 'foot' });
  p.locked = true;
  p.heading = EAST;
  g.cam.fixed = inRoom(HOME, [2.2, 0.6], [5.6, -2.2], 1.6, 1.3).cam;
  await say(g, TONY, 'Forty years in this house. Look at this one. Me and my sisters on the stoop. Pop with the hat.');
  const calm = panic(g);
  await say(g, TONY, 'She kept every picture. ...I gotta sit down.', 3);
  p.down = 1;
  await g.wait(2.4);
  await fade(g, 1, 1.2);
  calm();
  p.down = 0;
  for (const b of boxes) g.untrack(b);
  for (const h of hdoor.hide || []) h.group.visible = true;
  p.inside = null; p.pos.set(house.path.x, 0, house.path.z);   // the next thing he knows, it is Thursday and he is in a chair
  g.cam.fixed = null;
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

  // In the club, on his own feet: Georgie behind the bar with the house telephone, Silvio two stools down.
  const room = g.places.bingRoom, bdoor = g.places.doors.find(d => d.inside === room.inside);
  const stand = { x: room.tender.x - 0.3, z: room.bar.z - 0.45 }, behind = { x: room.tender.x - 0.3, y: room.y, z: room.tender.z + 0.15 };
  let georgie, sil;
  p.locked = true;
  await fade(g, 1, 0.5);
  if (p.car) { const car = p.car; g.leaveCar(); car.speed = 0; car.pos.set(bing.park.x, 0, bing.park.z); car.heading = bing.park.h; }
  g.sfx?.door();
  for (const a of room.ambient) a.group.visible = false;      // the scene has its own Georgie
  p.inside = bdoor;
  p.pos.set(room.inside.x, 0, room.inside.z); p.heading = g.cam.yaw = room.inside.h; g.cam.pitch = 0.2;
  georgie = actor(g, 'georgie', behind, SOUTH);
  { const st = room.stools[0]; sil = actor(g, 'silvio', st, WEST, 'sit'); sil.floorY = room.y; }
  g.cam.fixed = null;
  await fade(g, 0, 0.5);
  p.locked = false;
  try {
    await reach(g, stand, 'Find the <b>bar</b>. Georgie is behind it.', { r: 1.1, how: 'foot' });
    p.locked = true;
    p.pos.set(stand.x, 0, stand.z); p.heading = NORTH;
    g.cam.fixed = { pos: new THREE.Vector3(stand.x - 2.9, room.y + 1.7, stand.z + 1.9), look: new THREE.Vector3(stand.x + 0.2, room.y + 1.3, stand.z - 1) };
    await talk(g, [
      [TONY, 'Georgie. Get me Green Grove on the phone. I want to know she ate.', p],
    ]);
    georgie.arm('phone'); georgie.layer('phone');          // he has the receiver; he does not have the idea
    await talk(g, [
      [GEORGIE, 'Sure, Tone. ...How do you get an outside line on this thing? It keeps ringing the kitchen.', georgie],
      [TONY, 'Push nine.', p],
      [GEORGIE, "I pushed nine. Now it's beeping. Is it supposed to beep?", georgie],
      [SILVIO, 'Georgie. Give him the phone and walk away.', sil],
    ]);
    // The receiver comes across the bar, and then it goes back the other way. He does not move from where he stands:
    // there is three feet of mahogany between them, and the cord reaches.
    g.hud.objective('Take the <b>receiver</b> off him: press <b>F</b>.');
    g.consume('KeyF'); await g.until(() => g.consume('KeyF'));
    g.hud.objective();
    georgie.layer(null); georgie.arm(false);
    await handover(g, georgie, { hex: 0x16161c, sound: false });
    p.locked = true;
    const mine = p.human; mine.arm('phone'); p.onPhone = true;
    for (let k = 0; k < 3; k++) {
      g.hud.objective(`Show him how a telephone works: press <b>F</b>. &nbsp; <b>${'●'.repeat(k)}${'○'.repeat(3 - k)}</b>`);
      g.consume('KeyF'); await g.until(() => g.consume('KeyF'));
      mine.play(k % 2 ? 'jab' : 'cross', 'idle', 1.25);
      await g.wait(0.26);
      g.sfx?.punch?.(true); g.hud.flash('#ffffff', 0.18); g.cam.sway = 0.6;
      if (k < 2) georgie.play('hitHead', 'idle'); else { georgie.after = null; georgie.set('down'); }
      if (k === 0) say(g, GEORGIE, 'Tone! Tone, I pushed nine!', 1.6).catch(() => {});
      await g.wait(0.55);
      g.cam.sway = 0;
    }
    g.hud.objective();
    mine.arm(false); p.onPhone = false; g.setWeapon(p.weapon, true);
    // The receiver, swinging on its cord off the edge of the bar.
    const cord = new THREE.Group(), blk = new THREE.MeshLambertMaterial({ color: 0x16161c });
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4).translate(0, -0.3, 0), blk), set = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.05).translate(0, -0.68, 0), blk); cord.add(wire, set);
    cord.position.set(stand.x - 0.3, room.y + 1.2, room.bar.z - 0.72); g.track(cord);
    const t0 = g.time; g.updaters.push(() => { if (!cord.parent) return false; cord.rotation.x = Math.sin((g.time - t0) * 4) * 0.5 * Math.exp(-(g.time - t0) * 0.35); return true; });
    g.cam.fixed = { pos: new THREE.Vector3(stand.x + 3.4, room.y + 1.6, stand.z + 1.6), look: new THREE.Vector3(stand.x + 0.3, room.y + 1.2, stand.z - 0.6) };
    await say(g, '', "Tony took the receiver out of Georgie's hand and showed him how it worked. Several times.");
    await talk(g, [[SILVIO, "He's fine. Georgie, you're fine. Put some ice on it.", sil]]);
    await say(g, '', 'Nobody at the Bing asked Tony about his mother that night.');
    g.untrack(cord);
  } finally { for (const a of room.ambient) a.group.visible = true; }
  // He walks out on his own; the car is where he left it.
  dismiss(g, georgie, sil);
  g.cam.fixed = null;
  p.locked = false;
  await walkOut(g, room, 'Go out to the <b>street</b>: the green EXIT.');
  g.setNight(0);
  const cad = propCar(g, spot(bing.park, 9, 6), EAST, 0xf4f4f0, 'coupe');
  // And on his way out, a man who has decided tonight is a good night not to pay.
  await say(g, GEORGIE, 'Tone! The guy in the white coupe! Four hundred on the tab and he walked!', 3.2);
  if (!p.car) { g.hud.objective('Get in the <b>car</b>.'); await g.until(() => p.car); }
  await runDown(g, cad, '<b>Stop the</b> white coupe. Ram it off the road.');
  p.locked = true;
  await say(g, 'Customer', 'Okay! Okay! I thought my friend had paid! Here, here is five!', 3.2);
  await say(g, TONY, 'Four for the bar. One for the bodywork. And you drink somewhere else.', 3.2);
  g.sfx?.cash();
  g.removeCar(cad);
  g.pardon();
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
  await intoWard(g, nurse => [
    [TONY, 'Aprile. Giacomo Aprile.', p],
    ['Nurse', 'Four-twelve. The blue line to the lifts, the fourth floor, the last door. Twenty minutes, Mr. Soprano. He tires.', nurse],
    [TONY, 'Everybody in this building tells me how long I have got.', p],
  ]);

  await roomScene(g, wardRoom, room => ({
    jackie: lying(g, 'jackie', room.bed, EAST),
    rosalie: actor(g, 'rosalie', room.chair, -1.25, 'sit'),
    tony: actor(g, 'tony', { x: room.inside.x - 0.4, y: room.bed.y - 0.95, z: room.inside.z + 0.3 }, NORTH),
  }), async cast => {
    const C = wardCams(g), bed = wardRoom.bed, at = (dx, dz) => ({ x: bed.x + dx, z: bed.z + dz });
    g.cam.fixed = C.door;
    await talk(g, [[ROSALIE, "He's been asking since this morning. Twenty minutes, the nurse says. Then he sleeps.", cast.rosalie]]);
    g.cam.fixed = C.wide;
    await walkTo(g, cast.tony, [at(2.2, 3), at(0.5, 1.7)], 1.2);
    cast.tony.group.rotation.y = toward(cast.tony.group.position, at(-0.6, 0));
    g.cam.fixed = C.jackie;
    await talk(g, [[JACKIE, 'Tony. Look at this. Tubes. I got a tube for everything.']]);
    g.cam.fixed = C.tony;
    await talk(g, [[TONY, 'You look good. Better than Silvio.', cast.tony]]);
    g.cam.fixed = C.jackie;
    await talk(g, [[JACKIE, "Don't. ...They talk about me like I'm a photograph already. Junior's out there measuring the chair."]]);
    g.cam.fixed = C.wide;
    cast.tony.play('interact', 'idle');                   // a hand on the rail of the bed
    await talk(g, [[TONY, "Nobody's measuring anything. You get well.", cast.tony]]);
    g.cam.fixed = C.jackie;
    await talk(g, [[JACKIE, 'Do me a favour. Make me laugh. One time, before this is over.']]);
    g.cam.fixed = C.rosalie;
    await say(g, '', 'Rosalie looked at the window. She had heard him ask for stranger things this week.', 3.6);
  });
  { const LOBBY = downToLobby(g);
    await fade(g, 0, 1);
    await say(g, TONY, "Make him laugh. ...Sil's got a girl at the Bing who could make a bishop laugh.");
    p.locked = false;
    await walkOut(g, LOBBY, 'Go out to the <b>car</b>.'); }
  let sil, girl;
  const club = await intoBing(g, 'Go to the <b>Bada Bing</b>.', club => {
    sil = actor(g, 'silvio', spot(club.door, -1.6, -2.4), SOUTH);
    girl = actor(g, 'dancer', spot(club.door, 1.2, -2.6), SOUTH);
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    frame(g, p.pos, spot(club.door, 0, -2.5), { dist: 4.8 });
  }, 0.4);
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
  await intoWard(g, null, "Take her <b>in</b>. Jackie is in 412.");
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
  { const LOBBY = downToLobby(g);
    await fade(g, 0, 1);
    p.locked = false;
    await walkOut(g, LOBBY, 'Go out to the <b>street</b>.'); }
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
  let m2, h2;
  m2 = actor(g, 'meadow', spot(school.lot, -4.6, 1.6), EAST); h2 = actor(g, 'hunter', spot(school.lot, -5, 3.2), EAST); // there before he arrives
  await reach(g, school.gate, 'Bring it to <b>Verbum Dei</b>. Meadow is waiting in the lot.', { r: 6 });

  p.locked = true;
  await cut(g, () => {
    dismiss(g, rico, ...muscle);
    place(g, spot(school.lot, -2, 2), WEST, school.gate);
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
  await say(g, TONY, 'Bring nobody, he says. And who is that two cars back?', 3);
  await shake(g, '<b>Drive.</b> Lose the grey car before you go near the park.', { color: 0x8d8a8e });
  // In the park before he gets there: his uncle on the bench with a paper bag, throwing bread to the pigeons; Mikey
  // behind him with his eye on the gate; their car at the kerb with a man leaning on it; people using the park.
  const B = park.bench, by = groundAt(B.x, B.z);
  junior = actor(g, 'junior', spot(B, -0.42, 0.12), SOUTH, 'sit');
  mikey = actor(g, 'mikey', spot(B, -1.5, -1.5), EAST);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.12), new THREE.MeshLambertMaterial({ color: 0xb98a5e })); bag.position.set(B.x - 0.8, by + 0.58, B.z + 0.1); g.track(bag);
  const theirs = propCar(g, spot(park.kerb, 0, -9), park.kerb.h ?? 0, 0x16161c, 'sedan'), wheel = extraAt(g, spot(park.kerb, -2.2, -9), WEST, 'idle', { jacket: 0x2a2a30, shirt: 0x8a1c1c, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', glasses: 'shades', bulk: 1.2 });
  const birds = Array.from({ length: 9 }, (_, k) => {
    const grp = new THREE.Group(), grey = new THREE.MeshLambertMaterial({ color: [0x8d8f96, 0x6f7480, 0xb9b3ac][k % 3] });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 5).scale(1, 0.9, 1.5), grey), head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), grey); head.position.set(0, 0.09, 0.1); grp.add(body, head);
    const wings = [-1, 1].map(sd => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.12).translate(sd * 0.13, 0, 0), grey); w.position.set(sd * 0.04, 0.03, 0); w.rotation.z = sd * 1.35; grp.add(w); return w; });
    const a = k * 0.7, r = 1 + (k % 3) * 0.55; grp.position.set(B.x - 0.4 + Math.sin(a - 1.2) * r, by + 0.09, B.z + 1.3 + Math.abs(Math.cos(a - 1.2)) * r * 0.8); grp.rotation.y = a * 2;
    g.track(grp);
    return { grp, wings, head, k, home: grp.position.clone() };
  });
  let up = 0;
  g.updaters.push(dt => { // they peck until somebody big walks in among them; then they are gone
    if (birds.every(bd => !bd.grp.parent)) return false;
    if (!up && near(p.pos, spot(B, 0, 1.6), 3.4) && !p.car) up = g.time;
    for (const { grp, wings, head, k, home } of birds) {
      if (!grp.parent) continue;
      if (!up) { head.position.y = 0.09 - Math.max(0, Math.sin(g.time * 5 + k * 1.3)) * 0.07; grp.position.x = home.x + Math.sin(g.time * 0.5 + k) * 0.12; continue; }
      const t = g.time - up - k * 0.08; if (t < 0) continue;
      grp.position.x += Math.sin(k * 2.4) * 3.2 * dt; grp.position.z += (1.5 + Math.cos(k * 2.4) * 2.6) * dt; grp.position.y += (2.6 - Math.min(1.6, t * 0.5)) * dt; grp.rotation.y = Math.atan2(Math.sin(k * 2.4), 1);
      for (const [n, w] of wings.entries()) w.rotation.z = (n ? 1 : -1) * Math.sin(g.time * 22 + k) * 0.9;
      if (t > 5) g.untrack(grp);
    }
    return true;
  });
  const others = [
    extraAt(g, spot(B, -9, -9.4), EAST, 'run', { shirt: 0xff8a5c, tee: true, pants: 0x23232b, shoes: 0xf2efe8, hair: 0x2b1b12, bulk: 0.95 }),
    extraAt(g, spot(B, 6, -9), WEST, 'walk', { body: 'female', shirt: 0x9fd0f5, sleeves: 'long', pants: 0x3b6ea8, hair: 0xc9a14a, hairMesh: 'long' }),
  ];
  const stops = [mill(g, others[0], [spot(B, -30, -9.4), spot(B, -13, -9.4), spot(B, -13, -30), spot(B, -11, -9.4), spot(B, 8, -9.4), spot(B, 8, -10.6), spot(B, -30, -10.6)], { pace: 3.2, run: true }),
    mill(g, others[1], [spot(B, 6, -9), spot(B, -11, -9), spot(B, -11, 10), spot(B, -13, 10), spot(B, -13, -10.4), spot(B, 6, -10.4)], { pace: 1.2, pause: 1.5 })];
  await reach(g, park.kerb, 'Meet Uncle Junior in the <b>park</b>.');
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  await reach(g, spot(B, 1.4, 1.5), 'Your uncle is on the <b>bench</b>, feeding the birds. Walk over.', { r: 1.5, how: 'foot' });

  p.locked = true;
  await cut(g, () => {
    p.pos.set(B.x + 0.5, 0, B.z + 0.12); p.heading = SOUTH; p.pose = 'sit';      // he sits; nobody asked him to
    shot(g, spot(B, 1.5, 4.4), spot(B, -0.1, 0.2), 1.45, 1.05);
  }, 0.4);
  await talk(g, [
    [JUNIOR, 'Your nephew and his friend. Comley, again. After the sit-down. After Jackie ruled on it.', junior],
    [TONY, "I'll handle Christopher.", p],
    [JUNIOR, 'You handled him last time. Mikey handles things so they stay handled.', junior],
  ]);
  { // Mikey comes round the end of the bench to say his piece to Tony's face.
    const pos = mikey.group.position, x0 = pos.x, z0 = pos.z, t0 = g.time;
    mikey.set('walk', 0.9);
    g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / 2); pos.x = x0 + 0.1 * k - Math.sin(k * Math.PI) * 0.5; pos.z = z0 + 3.4 * k; mikey.group.rotation.y = k < 1 ? SOUTH : toward(pos, p.pos); if (k >= 1) mikey.set('idle'); return k < 1 && g.tracked.has(mikey.group); });
    g.cam.fixed = { pos: new THREE.Vector3(B.x + 3.4, by + 1.5, B.z + 3.2), look: new THREE.Vector3(B.x - 0.6, by + 1.2, B.z + 0.9) };
  }
  await talk(g, [
    [MIKEY, 'Both of them, Junior says.', mikey],
    [TONY, "Not Christopher. You want an example, make it Filone. Christopher I'll make understand myself.", p],
  ]);
  junior.layer?.('say3', { once: true });
  shot(g, spot(B, 1.5, 4.4), spot(B, -0.1, 0.2), 1.45, 1.05);
  await talk(g, [
    [JUNIOR, '...Filone, then. And your nephew gets a lesson he remembers.', junior],
    [TONY, "He'll remember.", p],
  ]);
  { // The old man gets up, shakes out the bag, and goes to his car with Mikey a step behind. Tony stays where he is.
    junior.set('idle'); junior.group.position.z = B.z + 0.7;
    g.untrack(bag);
    const way = [spot(B, 2, 2), spot(park.kerb, -3, 2), spot(park.kerb, -2.4, -7.6)];
    stops.push(mill(g, junior, way, { pace: 1.25 }), mill(g, mikey, [spot(B, 1, 2.6), spot(park.kerb, -4.4, 2.4), spot(park.kerb, -3.6, -7)], { pace: 1.3 }));
    g.cam.fixed = { pos: new THREE.Vector3(B.x - 2.6, by + 1.6, B.z + 3.6), look: new THREE.Vector3(B.x + 6, by + 1.1, B.z + 1.2) };
    await say(g, '', 'Tony stayed on the bench a while after they had gone. He knew exactly what he had agreed to.', 5.2);
  }
  await cut(g, () => { for (const st of stops) st(); dismiss(g, junior, mikey); for (const o of others) g.untrack(o.group); g.untrack(wheel.group); g.removeCar(theirs); for (const bd of birds) g.untrack(bd.grp); p.pose = null; p.pos.set(B.x + 0.5, 0, B.z + 1.1); g.cam.fixed = null; g.cam.yaw = p.heading = EAST; });
  p.locked = false;
  const club = await intoBing(g, 'Find Christopher and Brendan at the <b>Bada Bing</b>.', club => {
    chris = actor(g, 'christopher', spot(club.door, -1, -2.2), SOUTH);
    brendan = actor(g, 'brendan', spot(club.door, 1.4, -2.4), SOUTH, 'talk');
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    frame(g, p.pos, spot(club.door, 0, -2.3), { dist: 5 });
  }, 0.4);
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
  shlomo = actor(g, 'shlomo', spot(t, 0.95, 0), WEST, 'sit'); // there before he arrives
  await reach(g, satriale.kerb, "Meet the man at <b>Satriale's</b>.");

  p.locked = true;
  await cut(g, () => {
    place(g, spot(t, -1.5, 2.1), NORTH, satriale.kerb);
    p.heading = toward(p.pos, t);
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
  // The office. Ariel is behind his desk where he always is; two of his cousins are in the court, pretending to sweep it.
  const OFFICE = g.places.rooms.MOTEL, odoor = g.places.doors.filter(d => d.inside === OFFICE.inside).sort((u, v) => Math.hypot(u.outside.x - motel.office.x, u.outside.z - motel.office.z) - Math.hypot(v.outside.x - motel.office.x, v.outside.z - motel.office.z))[0];
  const thug = (at, h, state) => { const m = makeHuman({ ...randomPedLook(), body: 'male' }); m.group.position.set(at.x, at.y ?? groundAt(at.x, at.z), at.z); m.group.rotation.y = h; m.set(state); g.track(m.group); return m; };
  const helpers = [thug(spot(motel.court, 4, -4), SOUTH, 'idle'), thug(spot(motel.court, 6, 3), WEST, 'talk')];
  for (const amb of OFFICE.ambient) amb.group.visible = false;        // the old man at the desk is at prayers
  ariel = actor(g, 'ariel', roomSpot(OFFICE, 0.2, -3.2), SOUTH);
  try {
    await reach(g, odoor.outside, 'Ariel is in the <b>office</b>. Go in.', { r: 1.8, how: 'foot' });
    await enter(g, OFFICE);
    await reach(g, roomSpot(OFFICE, 0.2, -1.2), 'Find <b>Ariel</b>: he is behind the desk.', { r: 1.3, how: 'foot' });
    p.locked = true;
    p.pos.set(OFFICE.X + 0.2, 0, OFFICE.Z - 1.3); p.heading = NORTH;
    a.stay = b.stay = true;
    for (const [who, dx] of [[paulie, -1.5], [silvio, 1.6]]) { who.group.visible = true; who.group.position.set(OFFICE.X + dx, OFFICE.Y, OFFICE.Z + 0.4); who.group.rotation.y = NORTH; who.set('idle'); }
    a.pos.copy(paulie.group.position); b.pos.copy(silvio.group.position);
    g.cam.fixed = inRoom(OFFICE, [3.4, 0.9], [-0.2, -2.6], 1.6, 1.25).cam;
    await talk(g, [
      [ARIEL, "You're the ones Shlomo sent. I know what you are.", ariel],
      [TONY, 'Then you know how this ends. Sign the paper.', p],
      [ARIEL, "At Masada, nine hundred Jews held off the Roman army for two years and chose death over surrender. You're the Romans.", ariel],
      [TONY, "Then we'll do this the Roman way.", p],
    ]);
    // He comes round the end of the desk; the cousins come in from the court when they hear it start.
    { const pos = ariel.group.position, t0 = g.time, x0 = pos.x, z0 = pos.z; ariel.set('walk', 1.2);
      g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / 1.6); pos.x = x0 + 3.2 * Math.min(1, k * 1.8); pos.z = z0 + Math.max(0, k - 0.5) * 2 * 2.4; ariel.group.rotation.y = k < 0.55 ? EAST : SOUTH - 0.6; return k < 1; });
      await g.wait(1.7); }
    for (const [k, h] of helpers.entries()) { h.group.position.set(OFFICE.inside.x + (k ? 0.9 : -0.9), OFFICE.Y, OFFICE.inside.z + 0.4); h.group.rotation.y = NORTH; h.set('idle'); }
    g.sfx?.door();
    const fight = [g.makeEnemy(ariel, { health: 140, damage: 9, cash: 0 }), ...helpers.map(h => g.makeEnemy(h, { health: 50, damage: 6, cash: 25 }))];
    fight[0].die = () => { fight[0].health = 1; fight[0].human.after = null; fight[0].human.set('down'); fight[0].ai = null; fight[0].stays = true; };
    const mark = quarry(g, fight[0]);
    fistsOnly(g, true);
    g.cam.fixed = null; a.stay = b.stay = false;
    p.locked = false;
    g.hud.objective('<b>Beat it into him.</b> Ariel is under the arrow. He has help. &nbsp; <b>Click</b> or <b>E</b>.');
    await g.until(() => fight[0].ai === null && fight.slice(1).every(n => n.dead));
    mark();
    g.hud.objective();
    fistsOnly(g, false);
    g.removeNpc(ariel);
    p.locked = true;
    a.stay = b.stay = true;
    approach(g, ariel, 1.6);
    frame(g, p.pos, ariel.group.position, { dist: 3.8, height: 1.4, lift: 0.7 });
    await talk(g, [
      [ARIEL, "Do what you want. I don't sign. I don't sign!", ariel],
      [TONY, "Sil. Call Hesh. Ask him what they take off a man who won't give his wife a divorce.", p],
    ]);
    silvio.arm('phone'); silvio.layer('phone');
    await phone(g, HESH, 'In my experience, Anthony? Everything below the belt. The paper starts to look reasonable after that.');
    silvio.layer(null); silvio.arm(false);
    await talk(g, [[TONY, 'Paulie. The bolt cutters are in the trunk.', p]]);
    { // Paulie goes out to the car and comes back in with them. He takes his time. That is the point.
      const pos = paulie.group.position, back = { x: pos.x, z: pos.z }, out = { x: OFFICE.inside.x, z: OFFICE.inside.z + 0.9 };
      const walk = (to, secs) => new Promise((res, rej) => { const x0 = pos.x, z0 = pos.z, t0 = g.time; paulie.set('walk', 1); paulie.group.rotation.y = toward(pos, to); g.updaters.push(() => { const k = Math.min(1, (g.time - t0) / secs); pos.x = x0 + (to.x - x0) * k; pos.z = z0 + (to.z - z0) * k; return k < 1; }); g.wait(secs).then(res, rej); });
      await walk(out, 1.6); g.sfx?.door(); paulie.group.visible = false;
      await say(g, '', 'A car door. A trunk. Nobody in the office said anything.', 3);
      const cutters = new THREE.Group(), red = new THREE.MeshLambertMaterial({ color: 0xd8342c }), steel = new THREE.MeshLambertMaterial({ color: 0x8a8d96 });
      for (const sd of [-1, 1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), red); h.position.set(sd * 0.05, -0.2, 0); h.rotation.z = sd * 0.14; cutters.add(h); } const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.03), steel); jaw.position.y = 0.12; cutters.add(jaw);
      cutters.position.set(0.3, 0.95, 0.15); cutters.rotation.x = 1.2; paulie.group.add(cutters);
      g.sfx?.door(); paulie.group.visible = true;
      await walk({ x: ariel.group.position.x - 0.9, z: ariel.group.position.z + 0.8 }, 2); paulie.set('idle'); paulie.group.rotation.y = toward(pos, ariel.group.position);
      void back;
      await talk(g, [
        [PAULIE, 'These are for chain link. I never tried them on anything softer.', paulie],
        [ARIEL, '...Wait. Wait! Give me the paper. Give me the paper.', ariel],
      ]);
      // The paper goes down to him, he signs it on the carpet, and it comes back up.
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.006, 0.32), new THREE.MeshLambertMaterial({ color: 0xf4f4f0 })); paper.position.set(ariel.group.position.x + 0.3, OFFICE.Y + 0.02, ariel.group.position.z + 0.4); g.track(paper);
      p.human.play('kneel', 'idle');
      await g.wait(2.2);
      await handover(g, null, { from: { x: paper.position.x, z: paper.position.z, y: OFFICE.Y + 0.05 }, hex: 0xf4f4f0, sound: false });
      g.untrack(paper); paulie.group.remove(cutters);
    }
  } finally { for (const amb of OFFICE.ambient) amb.group.visible = true; }
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
  await toMelfi(g);
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
  await intoWard(g);

  await roomScene(g, wardRoom, room => ({
    jackie: lying(g, 'jackie', room.bed, EAST),
    rosalie: actor(g, 'rosalie', room.chair, -1.25, 'sit'),
    tony: actor(g, 'tony', { x: room.inside.x - 0.4, y: room.bed.y - 0.95, z: room.inside.z + 0.3 }, NORTH),
  }), async cast => {
    const C = wardCams(g), bed = wardRoom.bed, at = (dx, dz) => ({ x: bed.x + dx, y: C.floor, z: bed.z + dz }), way = { x: wardRoom.inside.x, y: C.floor, z: wardRoom.inside.z + 1.2 };
    g.cam.fixed = C.wide;
    await walkTo(g, cast.tony, [at(2.2, 3), at(0.5, 1.7)], 1.1);
    cast.tony.group.rotation.y = toward(cast.tony.group.position, at(-0.6, 0));
    g.cam.fixed = C.jackie;
    await talk(g, [[JACKIE, 'Tony. You hear what Junior is doing. With your nephew.']]);
    g.cam.fixed = C.tony;
    await talk(g, [[TONY, 'I hear everything, Jackie. Rest.', cast.tony]]);
    // The nurse, with the next bag: in at the door, round the foot of the bed, a minute at the stand, and out again.
    const nurse = extraAt(g, way, NORTH, 'idle', { body: 'female', shirt: 0xf4f4f0, tee: true, pants: 0xf4f4f0, shoes: 0xf2efe8, hair: 0x2a1a14, hairMesh: 'long' });
    g.cam.fixed = C.door;
    g.sfx?.door();
    const round = walkTo(g, nurse, [at(3.2, 2.6), at(2.2, -0.4), at(1.9, -1)], 1.4).then(async () => { nurse.group.rotation.y = WEST; nurse.play('interact', 'idle'); await g.wait(1.4); nurse.play('interact', 'idle'); await g.wait(1.2); });
    await say(g, 'Nurse', 'Do not mind me. This one is finished, and he will not tell you when it hurts, so I come and look.', 4);
    await round;
    g.cam.fixed = C.jackie;
    await talk(g, [[JACKIE, "When I'm gone. Don't let it be a war. Promise me that."]]);
    const out = walkTo(g, nurse, [at(2.2, -0.4), at(3.2, 2.6), way], 1.4).then(() => { g.untrack(nurse.group); g.sfx?.door(); });
    g.cam.fixed = C.tony;
    await talk(g, [[TONY, "You're not going anywhere.", cast.tony]]);
    g.cam.fixed = C.rosalie;
    await talk(g, [[ROSALIE, 'He needs to sleep now, Tony.', cast.rosalie]]);
    g.cam.fixed = C.jackie;
    await talk(g, [[JACKIE, 'Promise me.']]);
    await out;
    g.cam.fixed = C.wide;
    cast.tony.play('interact', 'idle');
    await say(g, '', 'Tony did not promise. He straightened the blanket,', 2.6);
    walkTo(g, cast.tony, [at(2.2, 3), way], 1.2).catch(() => {});
    await say(g, '', 'and left.', 2.2);
  });
  outOfHospital(g);
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
  await say(g, '', 'Somebody at the front desk had already picked up a telephone.', 2.8);
  await loseHeat(g, 2, 'A man beaten in a hospital car park. <b>Lose the police.</b>');
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
  // He is at home already. The evening comes to him: the garden fills while the light goes.
  const crowd = [];
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'By eight the garden was full of people who had paid two hundred dollars a head to eat ziti off the good plates.', 4.4);
  if (p.car) { p.car.speed = 0; g.leaveCar(); }
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.setNight(1);
  place(g, spot(home.drive, 0, -8), EAST);
  const at = (dx, dz) => spot(home.patio, dx, dz), dress = benefitDress(g);
  cast.carmela = actor(g, 'carmela', at(2.2, 2.8), WEST);
  cast.charmaine = actor(g, 'charmaine', at(4.2, 1.4), WEST);
  cast.phil = actor(g, 'priest', at(-3, 4), EAST, 'talk');
  cast.meadow = actor(g, 'meadow', at(-4.5, 5), WEST);
  cast.aj = actor(g, 'aj', spot(home.pool, -1.4, 3.5), NORTH);
  cast.artie = actor(g, 'artie', spot(home.drive, 3, -3), SOUTH);
  cast.g1 = actor(g, 'hesh', at(-1, 7), EAST); cast.g2 = actor(g, 'rosalie', at(1, 7.4), WEST, 'talk');
  { // The paying public: at the tables, at the bar by the pool, in a line for the food; two girls from Artie's going round with trays.
    const guest = (where, h, state, look) => { const who = extraAt(g, where, h, state, look); crowd.push(who); return who; };
    const DRESSED = [{ jacket: 0x23232b, shirt: 0xf4f4f0, tie: 0x8a1c2a, tucked: true, pants: 0x23232b, hair: 0x8d8a8e, age: 0.5 }, { body: 'female', shirt: 0x8a1c2a, sleeves: 'long', pants: 0x16161c, hair: 0x2a1a14, hairMesh: 'long' }, { jacket: 0x3d4658, shirt: 0x9fd0f5, tucked: true, pants: 0x3d4658, hair: 0x2b1b12, bulk: 1.15 }, { body: 'female', shirt: 0x1f5a3a, sleeves: 'long', pants: 0x16161c, hair: 0xc9a14a, hairMesh: 'long' },
      { jacket: 0x4a4652, shirt: 0xf4f4f0, tie: 0x2c3a5a, tucked: true, pants: 0x4a4652, hair: 0xb9b6b0, hairStyle: 'balding', glasses: 'clear', age: 0.7 }, { body: 'female', shirt: 0x2c3a5a, sleeves: 'long', pants: 0x2c3a5a, hair: 0x8d8a8e, hairMesh: 'long', age: 0.6 }];
    dress.seats.forEach((st, k) => { if (k % 4 < 2 || k === 7) guest({ x: st.x, z: st.z }, st.h, k % 3 ? 'sit' : 'sit', DRESSED[k % 6]); });
    guest(at(27.6, 8.5), WEST, 'idle', { shirt: 0xf4f4f0, sleeves: 'long', tucked: true, pants: 0x23232b, hair: 0x2b1b12, hairMesh: 'parted' });
    guest(at(24.5, 7.5), EAST, 'talk', DRESSED[2]); guest(at(24.5, 9.6), EAST, 'idle', DRESSED[3]);
    guest(at(3, -2.8), NORTH, 'idle', DRESSED[0]); guest(at(4.2, -2.6), NORTH, 'talk', DRESSED[1]); guest(at(5.5, -2.8), NORTH, 'idle', DRESSED[4]);
    guest(at(-6.8, 3), SOUTH + 0.8, 'idle', DRESSED[5]);   // somebody reading the board with the thermometer on it
    const WAIT = { body: 'female', shirt: 0xf4f4f0, sleeves: 'long', pants: 0x16161c, hair: 0x111111, hairMesh: 'long' };
    mill(g, guest(at(3, -1.6), 0, 'walk', WAIT), [at(3, -1.6), at(-2.6, 2.6), at(-5, 9), at(-1, 10), at(2.4, 10.4), at(6.2, 4)], { pace: 1.3, pause: 2.4 });
    mill(g, guest(at(-8, 12), 0, 'walk', { ...WAIT, hair: 0xb5392a }), [at(-8, 12), at(-4, 12.6), at(0, 13), at(-3, 8), at(-7.6, 8.4)], { pace: 1.2, pause: 3 });
    crowd.push(propCar(g, spot(home.guest, 0, 0), home.guest.h, 0x23232b, 'sedan'), propCar(g, spot(home.guest, 7.5, 0), home.guest.h, 0x8a1c2a, 'coupe'), propCar(g, spot(home.guest, -7.5, 0), home.guest.h, 0xf4f4f0, 'sedan'));
  }
  g.cam.fixed = null;
  await fade(g, 0, 1.2);
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
  { const crate = dress.crates[dress.crates.length - 1]; let held = true;
    g.updaters.push(() => { if (!held || !crate.parent) return false; crate.position.set(p.pos.x + Math.sin(p.heading) * 0.42, groundAt(p.pos.x, p.pos.z) + 1.02, p.pos.z + Math.cos(p.heading) * 0.42); crate.rotation.y = p.heading; return true; });
    await reach(g, home.patio, 'Carry the case to the <b>patio</b>.', { r: 2, how: 'foot' });
    p.locked = true;
    p.human.play('pickup', 'idle');
    await g.wait(0.6);
    held = false; crate.position.set(home.patio.x - 0.6, groundAt(home.patio.x, home.patio.z) + 0.16, home.patio.z + 0.6); crate.rotation.y = 0.3;
    await g.wait(0.4); }

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
  await cut(g, () => { dismiss(g, ...Object.values(cast)); for (const who of crowd) { if (who.group) g.untrack(who.group); else g.removeCar(who); } dress.clear(); g.setNight(0); });
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
  // He goes looking: the cafe, the motor lodge, and last of all Brendan's own door.
  g.cam.fixed = null;
  const ride = propCar(g, bing.park, bing.park.h, 0x8a1c2a, 'coupe'), { cafe, motel, flat, diner } = g.places, FLAT = g.places.rooms.BRENDAN, home = flat || diner;
  g.hud.fade(0, 1.2);
  await playing(g, 'Christopher Moltisanti', "Tony's nephew. You play him in this one");
  p.locked = false;
  await wantCar(g, ride, 'Get in the <b>red coupe</b>, and go and look for Brendan.');
  ride.driverless = false;
  await reach(g, cafe.kerb, '<b>Drive</b> to the cafe. He is there most nights.', { how: 'car', r: 7 });
  await say(g, '', "Brendan's car was not outside the cafe. Nobody inside had seen him since Tuesday.");
  await reach(g, motel.kerb, '<b>Drive</b> to the motor lodge. He keeps a room.', { how: 'car', r: 7 });
  await say(g, '', 'At the motor lodge the night man looked at the floor, and said room nine was paid up and empty.');
  // His place. The body is there before Christopher is: in the bath, the water gone dark, the radio still on.
  const tubWater = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.02, 0.66), new THREE.MeshLambertMaterial({ color: 0x5a1c24 })); tubWater.position.set(FLAT.tubMid.x, FLAT.tubMid.y + 0.24, FLAT.tubMid.z); g.track(tubWater);
  const body = lying(g, 'brendan', FLAT.tub, EAST);
  await reach(g, home.kerb, "<b>Drive</b> to Brendan's place.", { how: 'car', r: 7 });
  await say(g, '', 'His car was in its space. The curtains were shut. They had been shut that morning too, which he had not thought about until now.', 4.6);
  await reach(g, home.door, 'The door is not locked. Go <b>in</b>.', { r: 1.8, how: 'foot' });
  const way = await enter(g, FLAT);
  await say(g, CHRIS, 'Brendan? ...You left the radio on, you mook.', 2.8);
  await reach(g, FLAT.bathDoor, 'Find the <b>bathroom</b>: there is a light on in there.', { r: 1.1, how: 'foot' });
  p.locked = true;
  await cut(g, () => {
    p.pos.set(FLAT.X + 2.45, 0, FLAT.Z - 1.9); p.heading = toward(p.pos, FLAT.tubMid);
    g.cam.fixed = { pos: new THREE.Vector3(FLAT.X + 2.5, FLAT.Y + 1.95, FLAT.Z + 0.35), look: new THREE.Vector3(FLAT.tubMid.x - 0.2, FLAT.Y + 0.5, FLAT.tubMid.z) }; // from the doorway: his back, and over his shoulder what is in the bath
  }, 0.5);
  await say(g, '', 'Brendan was in the bath. The water had gone cold and dark, and there was a small hole where his left eye had been.', 4.6);
  p.human.play('kneel', 'idle');
  await talk(g, [[CHRIS, 'Brendan. ...Brendan, you stupid... You stupid...', p]]);
  await say(g, '', 'A message job. The old men send them that way: through the eye, so that everybody who sees it knows what he saw that he should not have.', 5);
  // And the men who sent it have been waiting for him to find it.
  mikey = actor(g, 'mikey', { x: FLAT.inside.x + 0.2, y: FLAT.Y, z: FLAT.inside.z + 0.6 }, NORTH); mikey.arm(true);
  goon = actor(g, 'trucker', { x: FLAT.inside.x - 0.9, y: FLAT.Y, z: FLAT.inside.z + 0.9 }, NORTH);
  g.sfx?.door();
  await cut(g, () => {
    p.pos.set(FLAT.bathDoor.x - 0.4, 0, FLAT.bathDoor.z + 0.5); p.heading = toward(p.pos, mikey.group.position);
    g.cam.fixed = inRoom(FLAT, [-3.9, -2.2], [0.6, 0.8], 1.6, 1.25).cam;
  }, 0.35);
  mikey.set('aim'); mikey.group.rotation.y = toward(mikey.group.position, p.pos);
  walkTo(g, goon, [{ x: FLAT.X + 0.2, z: FLAT.Z + 0.6 }, { x: p.pos.x - 1, z: p.pos.z + 0.6 }], 1.5).then(() => { goon.group.rotation.y = toward(goon.group.position, p.pos); }).catch(() => {});
  await talk(g, [
    [MIKEY, "Christopher Moltisanti. You found him. Good. That saves me describing it.", mikey],
    [CHRIS, 'Mikey. He was a kid. He was a stupid kid.', p],
    [MIKEY, "He was told. So were you. Junior wants a word. Hands where I can see them, and walk to the car.", mikey],
  ]);
  await fade(g, 1, 1.2);
  for (const h of way.hide || []) h.group.visible = true;
  p.inside = null;
  g.untrack(tubWater); dismiss(g, body);
  if (g.cars.includes(ride)) g.removeCar(ride);
  await say(g, '', 'They drove west, out past the last road, where the city stops and the reeds start.');

  // The marsh. Their car on the hard ground with its lamps on; the reeds; the water. He is walked down to it.
  const M0 = marsh, lamps = [];
  const theirs = propCar(g, spot(M0, 10, 1.5), WEST, 0x16161c, 'sedan');
  for (const s2 of [-1, 1]) { // the beams
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.2, 9, 12, 1, true).rotateZ(-Math.PI / 2).translate(-4.5, 0, 0), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(M0.x + 7.8, groundAt(M0.x + 8, M0.z) + 0.75, M0.z + 1.5 + s2 * 0.6); g.track(beam); lamps.push(beam);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); eye.position.set(M0.x + 7.75, groundAt(M0.x + 8, M0.z) + 0.75, M0.z + 1.5 + s2 * 0.6); g.track(eye); lamps.push(eye);
  }
  place(g, spot(M0, 6.2, 0.6), WEST);
  mikey.walking = goon.walking = null;                 // (whatever they were doing in the flat, they are not doing it here)
  mikey.group.position.set(M0.x + 7.6, groundAt(M0.x + 7.6, M0.z - 0.4), M0.z - 0.4); mikey.group.rotation.y = WEST; mikey.arm(true); mikey.set('aim');
  goon.group.position.set(M0.x + 7.2, groundAt(M0.x + 7.2, M0.z + 3), M0.z + 3); goon.group.rotation.y = WEST; goon.set('idle');
  const torch = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.6), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  torch.position.set(0.25, 1.05, 0.2); goon.group.add(torch);
  g.cam.fixed = null; g.cam.yaw = WEST; g.cam.pitch = 0.2;
  await fade(g, 0, 1.2);
  // He walks, with the gun behind him. If he stops, he is told.
  { const m = g.addMarker(M0.x + 0.6, M0.z + 0.2, 1.3); let nag = g.time + 4;
    p.locked = false;
    g.hud.objective('<b>Walk</b> down to the water. Do not turn round.');
    await g.until(() => {
      const mp = mikey.group.position, dx = p.pos.x - mp.x, dz = p.pos.z - mp.z, d = Math.hypot(dx, dz);
      if (d > 1.9) { const step = Math.min(0.03, d - 1.8); mp.x += dx / d * step * 2; mp.z += dz / d * step * 2; mp.y = groundAt(mp.x, mp.z); mikey.group.rotation.y = Math.atan2(dx, dz); }
      const gp = goon.group.position; gp.x += (p.pos.x + 1.6 - gp.x) * 0.02; gp.y = groundAt(gp.x, gp.z); goon.group.rotation.y = toward(gp, p.pos);
      if (g.time > nag && p.motion === 'idle') { nag = g.time + 5; say(g, MIKEY, ['Walk.', 'Keep walking, Moltisanti.', 'I did not say stop.'][Math.floor(g.time) % 3], 1.8).catch(() => {}); }
      return near(p.pos, m, 1.5);
    });
    g.removeMarker(m); g.hud.objective(); }
  p.locked = true;
  p.pos.set(M0.x + 0.6, 0, M0.z + 0.2); p.heading = WEST;
  await say(g, MIKEY, 'That is far enough. On your knees. Look at the water.', 3);
  g.hud.objective('On your knees: press <b>F</b>.');
  g.consume('KeyF'); await g.until(() => g.consume('KeyF'));
  g.hud.objective();
  p.pose = 'crouch';
  { const mp = mikey.group.position; mp.set(M0.x + 1.75, groundAt(M0.x + 1.75, M0.z + 0.5), M0.z + 0.5); mikey.group.rotation.y = toward(mp, p.pos); mikey.set('aim');
    const gp = goon.group.position; gp.set(M0.x + 2.4, groundAt(M0.x + 2.4, M0.z - 2.4), M0.z - 2.4); goon.group.rotation.y = toward(gp, p.pos); }
  shot(g, spot(M0, -3.4, 3), spot(M0, 1.4, 0.2), 1.1, 0.9);            // low, from the reeds: his face, the gun behind it, the lamps behind that
  await talk(g, [
    [MIKEY, "Brendan Filone is in his bathtub with a hole where his eye was. You saw. You're the lucky one, Moltisanti.", mikey],
    [CHRIS, 'Please. Mikey. Please.', p],
  ]);
  g.cam.fixed = { pos: new THREE.Vector3(M0.x + 4.2, groundAt(M0.x + 4, M0.z) + 1.75, M0.z + 1.6), look: new THREE.Vector3(M0.x + 0.4, groundAt(M0.x, M0.z) + 0.9, M0.z + 0.1) }; // over the gun
  await talk(g, [
    [MIKEY, 'Junior says you get to live. Say thank you.', mikey],
    [CHRIS, 'Thank you. Thank you.', p],
  ]);
  shot(g, spot(M0, -2.6, 1.2), spot(M0, 0.9, 0.3), 0.9, 0.95);         // close on him
  await g.wait(1.4);
  mikey.play('shoot', 'aim');
  g.sfx?.click?.();                                                     // the hammer, on nothing
  g.cam.sway = 1.2;
  p.human.play('hitHead', 'idle');
  await g.wait(0.9);
  g.cam.sway = 0;
  await say(g, '', 'He heard it. He was still there to hear it.', 2.8);
  shot(g, spot(M0, -3.4, 3), spot(M0, 1.4, 0.2), 1.1, 0.9);
  await talk(g, [
    [MIKEY, "That one was empty. The next one won't be. Comley is finished. You are finished. Walk home.", mikey],
  ]);
  // They go back up to the car and leave him there; the lamps swing across him and are gone.
  mikey.arm(false);
  goon.group.remove(torch);
  const back = [walkTo(g, mikey, [spot(M0, 8.6, 0.2)], 1.5), walkTo(g, goon, [spot(M0, 8.6, 2.8)], 1.5)];
  g.cam.fixed = { pos: new THREE.Vector3(M0.x - 2.8, groundAt(M0.x - 2.8, M0.z) + 1.5, M0.z - 1.4), look: new THREE.Vector3(M0.x + 6, groundAt(M0.x, M0.z) + 1, M0.z + 1) };
  await Promise.all(back);
  g.sfx?.carDoor(); await g.wait(0.5); g.sfx?.carDoor();
  dismiss(g, mikey, goon);
  { const t0 = g.time, x0 = theirs.pos.x, z0 = theirs.pos.z;
    g.updaters.push(() => { const k = (g.time - t0) / 5; if (k > 1 || !g.cars.includes(theirs)) return false; theirs.heading = WEST + k * 2.6; theirs.pos.set(x0 + Math.sin(k * 2.6) * 6 + k * k * 30, 0, z0 + (1 - Math.cos(k * 2.6)) * 6); theirs.sync?.(); for (const l of lamps) l.visible = k < 0.25; return true; }); }
  await say(g, '', 'The car turned on the hard ground. For a second the lamps were on him, and then they were on the road, and then there were no lamps.', 5);
  await fade(g, 1, 1);
  g.removeCar(theirs); for (const l of lamps) g.untrack(l);
  p.pose = null;
  g.cam.fixed = null; g.cam.yaw = EAST; p.heading = EAST;
  await fade(g, 0, 1);
  await say(g, CHRIS, "...Walk home. From here.");
  p.locked = false;
  let tonyActor;
  const club = await intoBing(g, 'Get back to the <b>Bada Bing</b>. Find a car.', club => {
    tonyActor = actor(g, 'tony', spot(club.door, 0.8, -2.4), SOUTH);
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    frame(g, p.pos, tonyActor.group.position, { dist: 4.4 });
  }, 0.4);
  await talk(g, [
    [TONY, "Brendan's dead. You're alive because I asked an old man for a favour, and I'll be paying for it the rest of my life.", tonyActor],
    [CHRIS, "T. I didn't... they put a gun...", p],
    [TONY, "Don't. ...Sit down. Have a drink. Tomorrow you start being somebody I can use.", tonyActor],
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

// ========== Episode Four: Meadowlands ==========

// A car the player must follow at a distance: it drives the roads toward `goal` and stops there.
// Resolves true when it arrives, false if the player falls too far behind for too long.
export async function tail(g, car, goal, text, { far = 95, close = 12 } = {}) {
  const p = g.player, blip = { x: car.pos.x, z: car.pos.z, color: '#ffffff' };
  g.blips.push(blip);
  g.hud.objective(text);
  let lost = 0, result = null;
  g.updaters.push(dt => {
    blip.x = car.pos.x; blip.z = car.pos.z;
    const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
    g.hud.objective(text + gauge(d, close, far));
    if (near(car.pos, goal, 20)) { result = true; car.nav = null; car.speed = 0; return false; }
    if (d > far) { lost += dt; if (lost > 6) { result = false; return false; } } else lost = 0;
    if (car.nav) car.nav.cruise = d < close ? 13 : 8.5; // she speeds up when something is on her bumper
    return true;
  });
  await g.until(() => result !== null);
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();
  return result;
}
// How a tail is going: a pip on a line between "on his bumper" and "gone", and a word for it.
export function gauge(d, close, far) {
  const k = clamp((d - close) / (far - close), 0, 1), at = Math.round(k * 8), line = Array.from({ length: 9 }, (_, i) => (i === at ? '◆' : '·')).join('');
  const [word, hex] = d < close ? ['TOO CLOSE', '#ff3b4a'] : k > 0.72 ? ['LOSING HIM', '#ffd23f'] : ['GOOD', '#3fd16b'];
  return ` &nbsp; <span style="color:${hex}">${word}</span> <span style="letter-spacing:2px">${line}</span>`;
}
// Send a car out as traffic from the node nearest `from`, heading for `goal`.
export function dispatch(g, car, from, goal, cruise = 8.5) {
  const n = nearestNode(from);
  roam(car, n.i, n.j, Math.floor(Math.random() * 4), cruise);
  car.nav.goal = goal;
}

// ---------- 1. The Dream ----------
// Tony dreams that Dr. Melfi tends bar at the Bing, and wakes up wanting to know who she is.

async function theDream(g) {
  const { office, diner, melfi } = g.places, p = g.player, DINER = g.places.rooms.DINER;

  await g.wait(1);
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'That night Tony dreamed.');
  await bingRoom(g, 'barCam', room => ({
    melfi: actor(g, 'melfi', room.tender, SOUTH),
    sil: actor(g, 'silvio', room.stool, WEST),
    hesh: actor(g, 'hesh', room.seats[1], room.seats[1].h, 'sit'),
    pussy: actor(g, 'pussy', room.seats[4], room.seats[4].h, 'sit'),
    tony: actor(g, 'tony', spot(room.bar, 2.4, 0.9), NORTH),
  }), async cast => {
    await talk(g, [
      [MELFI, 'The usual, Mr. Soprano?', cast.melfi],
      [TONY, "You're not supposed to be here.", cast.tony],
      [MELFI, "Nobody is supposed to be here. That's what makes it a dream.", cast.melfi],
      [SILVIO, "She's got the look, Tone. The look of somebody who writes things down.", cast.sil],
      [HESH, 'Doctors keep notes. Notes get read.', cast.hesh],
      [PUSSY, 'By who, Hesh?', cast.pussy],
      [HESH, 'By whoever asks nicely.', cast.hesh],
      [TONY, 'Who asked?', cast.tony],
    ]);
    g.sfx?.shot(); g.hud.flash('#ffffff', 0.3);
    await g.wait(0.5);
  });
  { // He wakes in his own bed, upstairs.
    const up = g.places.house2;
    p.inside = g.places.doors.find(d => d.name === 'home');
    p.pos.set(up.bedside.x, 0, up.bedside.z); p.heading = g.cam.yaw = EAST; g.cam.pitch = 0.22;
    p.hidden = false; g.cam.fixed = null;
    g.tonyCar.pos.set(g.places.home.car.x, 0, g.places.home.car.z); g.tonyCar.heading = g.places.home.car.h; g.tonyCar.speed = 0;
    g.setNight(0);
    await fade(g, 0, 1.2);
    await say(g, '', 'Tony woke at four and did not go back to sleep. At ten he had somewhere to tell it.');
  }
  await toMelfi(g, "Drive to <b>Dr. Melfi's office</b>.");
  await therapy(g, [
    [MELFI, 'You said you had a dream you wanted to talk about.'],
    [TONY, 'I said I had a dream. I was in a bar. People I know were there. It was a bar.'],
    [MELFI, 'Was I there?'],
    [TONY, '...No. Why would you be there? You got a bar you go to?'],
    [MELFI, 'We are talking about your dream, not my evenings.'],
    [TONY, "Right. Your evenings are your business. Everybody's got business."],
    [MELFI, 'Something is bothering you about these sessions.'],
    [TONY, "What bothers me is a guy I know says doctors keep notes. Who reads the notes, Doctor?"],
    [MELFI, 'Nobody. They are mine, and they are protected by law.'],
    [TONY, "The law. Okay. Same time next week."],
  ]);
  place(g, melfi.door, 0);
  g.tonyCar.pos.set(melfi.kerb.x, 0, melfi.kerb.z); g.tonyCar.heading = melfi.kerb.h; g.tonyCar.speed = 0;
  g.cam.yaw = Math.PI * 0.75;
  await fade(g, 0, 1);
  g.hud.card('The Dream', 'A detective who owes');
  await say(g, '', 'A detective on the Vice City police owed Tony eleven thousand dollars. His name was Vin Makazian, and he ate breakfast at the same diner every day of his life.');
  g.hud.card();
  p.locked = false;
  // He is in his booth already, as he is every morning: eggs, coffee, the paper folded to the racing.
  const booth = DINER.booths[0], B = (dx, dz, yy = 0.8) => [booth.table.x + dx, DINER.Y + yy, booth.table.z + dz];
  const mak = actor(g, 'makazian', { x: booth.north.x - 0.15, y: booth.north.y, z: booth.north.z }, SOUTH, 'sit');
  const setting = [];
  { const mk = (geo, hex, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex })); m.position.set(x, y, z); g.track(m); setting.push(m); return m; };
    mk(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 14), 0xf4f4f0, ...B(-0.15, -0.22)); mk(new THREE.SphereGeometry(0.05, 8, 5).scale(1.2, 0.5, 1), 0xffe066, ...B(-0.2, -0.24, 0.82)); mk(new THREE.SphereGeometry(0.05, 8, 5).scale(1.2, 0.5, 1), 0xffe066, ...B(-0.08, -0.2, 0.82)); mk(new THREE.BoxGeometry(0.12, 0.02, 0.05), 0x8a3a22, ...B(-0.14, -0.3, 0.82));
    mk(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 8), 0xf4f4f0, ...B(0.2, -0.24, 0.84)); mk(new THREE.BoxGeometry(0.26, 0.012, 0.36), 0xe9e2cf, ...B(0.45, -0.12)); mk(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 8), 0xf4f4f0, ...B(0.1, 0.26, 0.84)); }
  await reach(g, diner.kerb, 'Drive to the <b>diner</b>.');
  await reach(g, diner.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  for (const a2 of DINER.ambient) if (Math.hypot(a2.group.position.x - booth.north.x, a2.group.position.z - booth.north.z) < 2.2) a2.group.visible = false;
  await enter(g, DINER);
  await reach(g, booth.aisle, 'Find <b>Makazian</b>: the booth by the window on the left.', { r: 1.3, how: 'foot' });
  p.locked = true;
  const C = { two: inRoom(DINER, [-2.2, 2.2], [-5.6, 2.2], 1.4, 1.0).cam, onMak: { pos: new THREE.Vector3(booth.south.x + 0.75, DINER.Y + 1.32, booth.south.z + 0.5), look: new THREE.Vector3(booth.north.x - 0.1, DINER.Y + 1.08, booth.north.z) }, onTony: { pos: new THREE.Vector3(booth.north.x + 0.75, DINER.Y + 1.32, booth.north.z - 0.4), look: new THREE.Vector3(booth.south.x + 0.1, DINER.Y + 1.1, booth.south.z) } };
  await cut(g, () => {
    p.pos.set(booth.south.x + 0.15, 0, booth.south.z); p.heading = NORTH; p.pose = 'sit';     // he slides in across from him
    g.cam.fixed = C.two;
  }, 0.4);
  mak.layer?.('say3', { once: true });                  // he points at the plate with his fork; he does not get up
  await talk(g, [[MAKAZIAN, "Tony. Have the eggs. The eggs are the only thing in here that aren't a crime.", mak]]);
  // The girl comes with the pot before anybody asks. That is why he eats here.
  const girl = extraAt(g, { x: DINER.waitress.x, y: DINER.Y, z: DINER.waitress.z }, SOUTH, 'idle', { body: 'female', shirt: 0xf7a8c4, tee: true, pants: 0xf4f4f0, shoes: 0xf2efe8, hair: 0xb5392a, hairMesh: 'long' });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x5a3320 })); pot.position.set(0.28, 1.05, 0.18); girl.group.add(pot);
  const pour = walkTo(g, girl, [{ x: booth.aisle.x + 0.3, z: booth.aisle.z - 0.9 }, { x: booth.aisle.x - 0.45, z: booth.aisle.z + 0.2 }], 1.4).then(async () => { girl.group.rotation.y = WEST; girl.play('interact', 'idle'); await g.wait(1.3); });
  g.cam.fixed = C.onTony;
  await talk(g, [[TONY, 'I want a favour. A woman named Melfi. Doctor. Office on Ocean. I want to know who she is, who she sees, and whether she has a mouth.', p]]);
  await pour;
  await say(g, 'Waitress', 'Warm that up for you, Vin? And for your friend. He looks like he could use it.', 3.2);
  const off = walkTo(g, girl, [{ x: booth.aisle.x + 0.3, z: booth.aisle.z - 0.9 }, { x: DINER.waitress.x, z: DINER.waitress.z }], 1.4).then(() => g.untrack(girl.group));
  g.cam.fixed = C.onMak;
  await talk(g, [[MAKAZIAN, 'What kind of doctor?', mak]]);
  g.cam.fixed = C.onTony;
  await talk(g, [[TONY, "The kind you don't tell your friends about.", p]]);
  g.cam.fixed = C.two;
  mak.layer?.('nod', { once: true });                        // the fork goes down
  await talk(g, [
    [MAKAZIAN, '...A head doctor. You, with a head doctor.', mak],
    [TONY, "I'm asking about a doctor. That's all you heard. Say it back.", p],
  ]);
  g.cam.fixed = C.onMak;
  await talk(g, [[MAKAZIAN, "You're asking about a doctor. It takes two grand off what I owe.", mak]]);
  g.cam.fixed = C.two;
  await talk(g, [[TONY, 'It takes one. Eat your eggs.', p]]);
  await off.catch(() => {});
  // He leaves a ten under the saucer and goes. Makazian is still eating when the door shuts.
  p.human.play?.('interact', 'idle');
  { const bill = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.07), new THREE.MeshLambertMaterial({ color: 0x86b87e })); bill.position.set(...B(0.12, 0.34, 0.81)); g.track(bill); setting.push(bill); }
  await g.wait(0.9);
  await cut(g, () => { p.pose = null; p.pos.set(booth.aisle.x, 0, booth.aisle.z); p.heading = EAST; g.cam.fixed = null; g.cam.yaw = EAST; }, 0.4);
  p.locked = false;
  await walkOut(g, DINER, 'Go out to the <b>street</b>.');
  dismiss(g, mak); for (const m of setting) g.untrack(m);
  for (const a2 of DINER.ambient) a2.group.visible = true;
  await passed(g, 'Respect +');
}

// ---------- 2. Message Job ----------
// Played as Christopher. Brendan has not called in two days. He is in the bath.

async function messageJob(g) {
  const { bing, flat } = g.places, p = g.player, tony = p.human, HOUSE = g.places.rooms.HOUSE;
  let adriana;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Christopher had not slept since the marsh. Adriana said to let it go. He could not let it go.');
  if (p.car) g.leaveCar();
  g.setNight(0);
  const chris = makeLook('christopher');
  g.setPlayer(chris);
  const ride = g.spawnCar(bing.park.x, bing.park.z, bing.park.h, 0x1d1d24, 'coupe');
  place(g, bing.door, SOUTH);
  adriana = actor(g, 'adriana', spot(bing.door, 1, 2.6), NORTH);
  frame(g, p.pos, adriana.group.position, { dist: 4.4 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Message Job', 'The Bada Bing, noon');
  await talk(g, [
    [ADRIANA, 'You are not going back there. Chrissy. The police have not even been yet.', adriana],
    [CHRIS, 'His mother is going to ask me for his things. He kept money in that place. I am not leaving it for the cops.', p],
    [ADRIANA, 'Then go, and get it, and then come back and take me somewhere with tablecloths. Somewhere with people.', adriana],
  ]);
  await cut(g, () => { dismiss(g, adriana); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, flat.kerb, "Drive to <b>Brendan's place</b>.");
  await reach(g, flat.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  { // The flat, by day. Somebody has let the water out. The radio is still on.
    const FLAT = g.places.rooms.BRENDAN, bed = { x: FLAT.X - 3.1, z: FLAT.Z + 1.6 };
    const way = await enter(g, FLAT);
    await say(g, '', 'Somebody had let the water out of the bath and shut the bathroom door. Nobody had turned the radio off.', 4.4);
    await reach(g, FLAT.radio, 'Find the <b>radio</b>, and turn it off.', { r: 1.2, how: 'foot' });
    p.locked = true; p.heading = NORTH; p.human.play('interact', 'idle'); g.sfx?.click?.();
    await g.wait(0.9); p.locked = false;
    await reach(g, bed, 'Find what he kept under the <b>mattress</b>.', { r: 1.2, how: 'foot' });
    p.locked = true; p.heading = WEST;
    await handover(g, null, { from: { x: FLAT.X - 3.6, y: FLAT.Y + 0.2, z: FLAT.Z + 1.6 }, hex: 0x8a6a44, sound: false });
    await say(g, '', 'A shoe box. Eleven hundred dollars, a photograph of the two of them at sixteen, and a napkin with Hollywood written on it.', 4.8);
    await talk(g, [[CHRIS, 'Brendan. ...You stupid... You stupid...', p]]);
    p.locked = false;
    await walkOut(g, FLAT, 'Go out to the <b>street</b>.');
    void way;
  }
  // Mikey's people are waiting to make sure the message was received.
  p.locked = true;
  await fade(g, 1, 0.5);
  place(g, flat.door, flat.door.h);
  const goons = [actor(g, 'trucker', spot(flat.yard, -1.6, 0), toward(flat.yard, flat.door)), actor(g, 'kolar', spot(flat.yard, 1.4, 1.4), toward(flat.yard, flat.door))];
  await fade(g, 0, 1);
  frame(g, p.pos, goons[0].group.position, { dist: 5 });
  await talk(g, [
    ['Goon', 'Moltisanti. Mikey says: you got the message, right? Say it.', goons[0]],
    [CHRIS, 'I got it.', p],
    ['Goon', "Say it like you mean it. Mikey says make sure he means it.", goons[1]],
  ]);
  const fight = goons.map(h => g.makeEnemy(h, { health: 70, damage: 8, cash: 40 }));
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective("<b>Mean it.</b>");
  await allDown(g, fight);
  g.hud.objective();
  fistsOnly(g, false);
  g.pardon();
  await say(g, CHRIS, '...Tell Mikey I got it.');
  let tonyActor;
  const club = await intoBing(g, 'Tell Tony. He is at the <b>Bada Bing</b>.', club => {
    dismiss(g, ...goons);
    tonyActor = actor(g, 'tony', spot(club.door, 0.8, -2.4), SOUTH);
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    frame(g, p.pos, tonyActor.group.position, { dist: 4.4 });
  }, 0.4);
  await talk(g, [
    [CHRIS, "Brendan's dead. In his tub. Through the eye, T. Through the eye.", p],
    [TONY, 'I know. I knew before you did.', tonyActor],
    [CHRIS, 'Then we go. Tonight. Mikey, the hat, the whole crew of old men.', p],
    [TONY, "Nothing happens. You hear me? Nothing. Jackie is dying, and the day he dies, whoever's at war loses.", tonyActor],
    [CHRIS, 'He was my friend.', p],
    [TONY, 'He was a junkie who robbed the wrong truck twice. ...Go home to Adriana. Buy her dinner. Tablecloths.', tonyActor],
  ]);
  await fade(g, 1, 1.2);
  dismiss(g, tonyActor);
  homeAsTony(g, tony);
  g.removeCar(ride);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 3. The Tail ----------
// Makazian follows Dr. Melfi to dinner. Tony follows Makazian. It goes further than Tony asked.

async function theTail(g) {
  const { melfi, diner } = g.places, p = g.player;

  await g.wait(1);
  g.hud.card('The Tail', "Dr. Melfi's office, seven o'clock");
  await phone(g, MAKAZIAN, "Your doctor's going out tonight. Table for two. You want to watch, be outside her office at seven. Stay behind me.");
  g.hud.card();
  await reach(g, melfi.kerb, "Drive to <b>Dr. Melfi's office</b>.", { how: 'car' });

  p.locked = true;
  p.car.speed = 0;
  const her = g.spawnCar(melfi.park.x, melfi.park.z, melfi.kerb.h, 0xf4f4f0, 'coupe');
  const mak = g.spawnCar(melfi.kerb.x, melfi.kerb.z - 12, melfi.kerb.h, 0x1d1d24, 'sedan');
  const doc = actor(g, 'melfi', spot(melfi.door, 0, 1), SOUTH);
  shot(g, spot(melfi.door, 6, 8), spot(melfi.door, 0, 2), 1.7, 1.2);
  await say(g, '', 'At five past seven, Dr. Melfi locked her office and walked to a white coupe.');
  await g.wait(1.5);
  await cut(g, () => { dismiss(g, doc); g.cam.fixed = null; dispatch(g, her, melfi.kerb, diner.kerb); dispatch(g, mak, melfi.kerb, diner.kerb, 9); mak.nav.goal = her.pos; }, 0.5);
  await phone(g, MAKAZIAN, "That's her. I'm the black sedan. Stay back, stay behind, and don't do anything. This is police business.");
  p.locked = false;
  for (;;) {
    const ok = await tail(g, her, diner.kerb, "<b>Follow Dr. Melfi.</b> Stay behind Makazian; don't get close, don't lose her.");
    if (ok) break;
    p.locked = true;
    await say(g, MAKAZIAN + ' (radio)', 'You lost her. Back to the office. We go again.');
    await cut(g, () => {
      const mine = p.car || g.tonyCar; place(g, melfi.kerb, melfi.kerb.h); g.enterCar(mine); mine.pos.set(melfi.kerb.x, 0, melfi.kerb.z); mine.heading = melfi.kerb.h; mine.speed = 0;
      dispatch(g, her, melfi.kerb, diner.kerb); dispatch(g, mak, melfi.kerb, diner.kerb, 9); mak.nav.goal = her.pos;
    });
    p.locked = false;
  }
  mak.nav = null; mak.speed = 0;

  // Dinner, from across the street.
  p.locked = true;
  const along = { x: Math.sin(diner.kerb.h), z: Math.cos(diner.kerb.h) };
  let randall, melfiActor;
  await cut(g, () => {
    her.pos.set(diner.kerb.x, 0, diner.kerb.z); her.heading = diner.kerb.h; her.speed = 0;
    mak.pos.set(diner.kerb.x - along.x * 14, 0, diner.kerb.z - along.z * 14); mak.heading = diner.kerb.h; mak.speed = 0;
    const mine = p.car || g.tonyCar;
    place(g, spot(diner.kerb, -along.x * 26, -along.z * 26), diner.kerb.h, { x: diner.kerb.x - along.x * 26, z: diner.kerb.z - along.z * 26, h: diner.kerb.h });
    mine.pos.set(diner.kerb.x - along.x * 26, 0, diner.kerb.z - along.z * 26); mine.heading = diner.kerb.h; mine.speed = 0;
    g.enterCar(mine);
    melfiActor = actor(g, 'melfi', spot(diner.door, -1, 0), diner.door.h + Math.PI);
    randall = actor(g, 'randall', spot(diner.door, 1.2, 0.4), diner.door.h + Math.PI);
    frame(g, melfiActor.group.position, randall.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [RANDALL, "You're sure about this place?", randall],
    [MELFI, "It's awful. The pie is wonderful.", melfiActor],
  ]);
  await cut(g, () => { dismiss(g, melfiActor, randall); shot(g, spot(p.car.pos, -along.z * 2.2 + along.x * 3, along.x * 2.2 + along.z * 3), spot(diner.door, 0, 0), 1.5, 1.2); }, 0.5);
  await say(g, TONY, "A date. She's got a date. ...Good. Good for her. That's a good thing.");
  await fade(g, 1, 1);
  await say(g, '', 'Two hours later, Randall Curtin drove home alone, and a black sedan put its lights on behind him.');
  // The stop, two blocks on.
  const stop = spot(diner.kerb, along.x * 40, along.z * 40), tb = { x: diner.door.x - diner.kerb.x, z: diner.door.z - diner.kerb.z }, tl = Math.hypot(tb.x, tb.z);
  const perp = { x: tb.x / tl, z: tb.z / tl }; // from the road toward the sidewalk
  const rcar = g.spawnCar(stop.x, stop.z, diner.kerb.h, 0x8d8a8e, 'sedan');
  mak.pos.set(stop.x - along.x * 9, 0, stop.z - along.z * 9); mak.heading = diner.kerb.h;
  p.car.pos.set(stop.x - along.x * 30, 0, stop.z - along.z * 30); p.car.heading = diner.kerb.h; p.car.speed = 0; p.pos.copy(p.car.pos);
  const r2 = actor(g, 'randall', spot(stop, perp.x * 2.6, perp.z * 2.6), diner.kerb.h + Math.PI);
  const m2 = actor(g, 'makazian', spot(stop, perp.x * 2.6 - along.x * 1.4, perp.z * 2.6 - along.z * 1.4), diner.kerb.h);
  shot(g, spot(stop, perp.x * 7 - along.x * 2, perp.z * 7 - along.z * 2), spot(stop, perp.x * 2.6 - along.x * 0.7, perp.z * 2.6 - along.z * 0.7), 1.6, 1.1);
  await fade(g, 0, 1);
  await talk(g, [
    [MAKAZIAN, 'Licence. Registration. And your face, on the hood.', m2],
    [RANDALL, 'What did I do? Officer, what did I—', r2],
    [MAKAZIAN, "You've got a tail light out. And a mouth.", m2],
  ]);
  await punch(g, m2, r2);
  await punch(g, m2, r2, true);
  await say(g, '', 'Tony watched from thirty metres back with the engine running.');
  await say(g, TONY, "...I said look. I said look at her. I didn't say that.");
  await fade(g, 1, 1);
  dismiss(g, r2, m2);
  g.removeCar(rcar); g.removeCar(her); g.removeCar(mak);
  g.cam.fixed = null;
  await fade(g, 0, 1);
  await phone(g, MAKAZIAN, "She's clean. Divorced, one kid, no record, no wire. The boyfriend is a nobody. I checked him personally.");
  await say(g, TONY, 'I saw.');
  await phone(g, MAKAZIAN, "Then we're at ten.");
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. Schoolyard ----------
// AJ and Jeremy Piocosta fight over a lawnmower. Jeremy's father finds out whose boy he hit.

async function schoolyard(g) {
  const { school, home, houseRoom } = g.places, p = g.player, SCHOOL = g.places.rooms.SCHOOL;

  await g.wait(1);
  g.hud.card('Schoolyard', 'Verbum Dei');
  await phone(g, PRINCIPAL, 'Mr. Soprano? Verbum Dei. Anthony Junior has been in a fight. Nobody is badly hurt. I would like you to come in.');
  g.hud.card();
  await reach(g, school.gate, 'Drive to <b>Verbum Dei</b>.');
  await reach(g, school.door, 'Go in to the <b>office</b>.', { r: 1.8, how: 'foot' });

  await roomScene(g, inRoom(SCHOOL, [3.4, 2.4], [-0.6, -1.2]), q => ({
    principal: actor(g, 'principal', roomSpot(q, -1.8, -2.2), SOUTH),
    aj: actor(g, 'aj', roomSpot(q, -0.4, -0.6), EAST),
    jeremy: actor(g, 'jeremy', roomSpot(q, 1.4, -0.6), WEST),
    tony: actor(g, 'tony', roomSpot(q, 0.4, 1.6), NORTH),
  }), async cast => {
    await talk(g, [
      [PRINCIPAL, 'Anthony hit Jeremy. Jeremy hit Anthony. There was a lawnmower involved, somehow.', cast.principal],
      [AJ, 'He said we stole it. He said my dad—', cast.aj],
      [TONY, 'He said your dad what?', cast.tony],
      [AJ, '...Nothing.', cast.aj],
      [JEREMY, "I didn't say anything, Mr. Soprano. Sir.", cast.jeremy],
      [PRINCIPAL, 'Both boys are suspended for two days. Mr. Piocosta is on his way.', cast.principal],
      [TONY, "Two days. Fine. AJ, get your bag. We'll talk in the car.", cast.tony],
    ]);
  });
  place(g, school.door, SOUTH);
  const aj = actor(g, 'aj', spot(school.door, 1.2, 1.2), SOUTH), ride = follower(g, aj, { pace: 3.2 });
  await fade(g, 0, 1);
  p.locked = false;
  await reach(g, home.road, 'Drive AJ <b>home</b>.', { how: 'car' });
  ride.on = false;
  dismiss(g, aj);

  const den = { X: houseRoom.inside.x - 2, Y: -0.1, Z: houseRoom.inside.z - 3.2, ambient: houseRoom.ambient };
  await roomScene(g, inRoom(den, [2.7, -0.2], [5.2, -3.8], 1.5, 0.9), q => ({
    aj: actor(g, 'aj', roomSpot(q, 4.5, -4.1), SOUTH, 'sit'),
    meadow: actor(g, 'meadow', roomSpot(q, 5.8, -4.1), SOUTH, 'sit'),
  }), async cast => {
    await say(g, '', 'That evening, in the den.');
    await talk(g, [
      [AJ, 'Meadow. Is Dad in the Mafia?', cast.aj],
      [MEADOW, "...Where did you hear that?", cast.meadow],
      [AJ, "Jeremy. And then Jeremy's dad showed up at school looking like he was going to throw up, and gave me back a lawnmower we never lent them.", cast.aj],
      [MEADOW, 'Come here. Look at this.', cast.meadow],
    ]);
    await say(g, '', "There was a computer in the den, and a website with Dad's name on it and the word 'alleged' in every sentence.");
    await talk(g, [
      [AJ, "...It says 'waste management'.", cast.aj],
      [MEADOW, 'It says a lot of things. Dad does waste management. Also, never ask him. Ever.', cast.meadow],
      [AJ, 'Does Mom know?', cast.aj],
      [MEADOW, 'Mom knows where the money for the pool came from. Go to bed.', cast.meadow],
    ]);
  });
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1);
  await say(g, '', 'Two days later, AJ went back to school.');
  const aj2 = actor(g, 'aj', spot(home.drive, 1, 1.5), EAST), ride2 = follower(g, aj2, { pace: 3.2 });
  p.locked = false;
  await reach(g, school.lot, 'Drive AJ to <b>school</b>.', { how: 'car' });
  ride2.on = false;

  p.locked = true;
  let dad, jer;
  await cut(g, () => {
    place(g, spot(school.lot, -2, 2), WEST, school.gate);
    aj2.group.position.set(p.pos.x + 1.4, groundAt(p.pos.x, p.pos.z), p.pos.z + 0.6); aj2.group.visible = true; aj2.set('idle');
    dad = actor(g, 'piocosta', spot(school.lot, -5, 1.8), EAST, 'talk'); jer = actor(g, 'jeremy', spot(school.lot, -5.4, 3.4), EAST);
    frame(g, p.pos, dad.group.position, { dist: 4.6 });
  });
  await talk(g, [
    [PIOCOSTA, 'Mr. Soprano. Tony. Can I call you Tony? The boys are friends again. Jeremy, tell him.', dad],
    [JEREMY, "We're friends.", jer],
    [PIOCOSTA, "And the mower, that was a misunderstanding, it's a great mower, you keep it. Keep it. Please.", dad],
    [TONY, "I don't want your mower.", p],
    [PIOCOSTA, 'No. No, of course not. Sorry. Sorry. Say hello to your wife.', dad],
    [TONY, '...You too.', p],
  ]);
  await say(g, '', "Tony drove off wondering what it was Jeremy's father thought he knew, and who had told him.");
  await cut(g, () => { dismiss(g, dad, jer, aj2); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Figurehead ----------
// Jackie has days. Mikey gets what he had coming. The captains agree on a boss who will not be the boss.

async function figurehead(g) {
  const { hospital, wardRoom, satriale, shopRoom, hesh } = g.places, p = g.player, FNOTE = g.places.rooms.FNOTE;

  await g.wait(1);
  g.hud.card('Figurehead', 'Vice General Hospital');
  await phone(g, ROSALIE, 'Tony. The doctor says days. He wants you and Silvio. Today, Tony.');
  g.hud.card();
  await reach(g, hospital.kerb, 'Drive to the <b>hospital</b>.');
  await intoWard(g);

  await roomScene(g, wardRoom, room => ({
    jackie: lying(g, 'jackie', room.bed, EAST),
    rosalie: actor(g, 'rosalie', room.chair, -1.25, 'sit'),
    silvio: actor(g, 'silvio', spot(room.bed, 2.4, 1.6), NORTH),
    tony: actor(g, 'tony', spot(room.bed, 0.4, 1.6), NORTH),
  }), async cast => {
    await talk(g, [
      [JACKIE, "Tony. Who's got it. After."],
      [TONY, "Nobody's got anything. You're in a bed, not a box.", cast.tony],
      [JACKIE, 'Junior thinks he does. Mikey walks around out there like it is done.'],
      [SILVIO, 'Mikey walks like a man who had a stroke.', cast.silvio],
      [JACKIE, "...Whatever you do. Don't let the old man have the whole thing. He'll use it on his own family. He always has."],
      [TONY, "He won't have the whole thing.", cast.tony],
      [ROSALIE, "That's enough. Both of you. Out.", cast.rosalie],
    ]);
  });
  // Mikey Palmice, in the car park, with a message.
  outOfHospital(g);
  place(g, spot(hospital.door, 0, -2), SOUTH, hospital.kerb);
  const mikey = actor(g, 'mikey', spot(hospital.door, -2.6, 5), NORTH), goon = actor(g, 'trucker', spot(hospital.door, -5, 6), NORTH);
  await fade(g, 0, 1);
  approach(g, mikey, 2.2);
  frame(g, p.pos, mikey.group.position, { dist: 4.6 });
  await talk(g, [
    [MIKEY, "Tony. How's he look? Like a man with a week? Junior says tell you: the week after, things change.", mikey],
    [TONY, "You put a gun in my nephew's mouth.", p],
    [MIKEY, "Junior's orders. Nothing personal. He said thank you, your nephew. Twice.", mikey],
  ]);
  const fight = [g.makeEnemy(mikey, { health: 110, damage: 10, cash: 0 }), g.makeEnemy(goon, { health: 60, damage: 7, cash: 40 })];
  fight[0].die = () => { fight[0].health = 1; fight[0].human.after = null; fight[0].human.set('down'); fight[0].ai = null; fight[0].stays = true; };
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective('<b>Deal with Mikey.</b> He brought a friend.');
  await g.until(() => fight[0].ai === null && fight[1].dead);
  g.hud.objective();
  fistsOnly(g, false);
  g.pardon();
  g.removeNpc(mikey);
  p.locked = true;
  await say(g, TONY, "Tell my uncle I'm coming to see him. Tell him I said it nice.");
  await cut(g, () => { dismiss(g, mikey, goon); });
  p.locked = false;
  await reach(g, satriale.kerb, "Meet the captains at <b>Satriale's</b>.");
  await reach(g, satriale.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });

  const shop = { X: shopRoom.inside.x, Y: -0.1, Z: shopRoom.inside.z - 3.2, ambient: shopRoom.ambient };
  await roomScene(g, inRoom(shop, [0.4, 5], [0, 1.4], 1.5, 1), q => ({
    silvio: actor(g, 'silvio', roomSpot(q, -5.1, 2.8), EAST, 'sit'),
    paulie: actor(g, 'paulie', roomSpot(q, -3.3, 2.8), WEST, 'sit'),
    pussy: actor(g, 'pussy', roomSpot(q, 3.3, 2.8), EAST, 'sit'),
    tony: actor(g, 'tony', roomSpot(q, 0, 0.8), SOUTH),
  }), async cast => {
    await talk(g, [
      [PAULIE, "Jackie goes, it's Tony. Everybody knows it's Tony.", cast.paulie],
      [PUSSY, "Junior doesn't know it.", cast.pussy],
      [SILVIO, "Junior's got Mikey and six guys who still wear hats. We've got everything else.", cast.silvio],
      [TONY, "Here's what we do. Junior gets it.", cast.tony],
      [PAULIE, 'Gets what?', cast.paulie],
      [TONY, 'The chair. The title. The feds take their pictures of the boss, they take pictures of a seventy-year-old man in a hat. We run our crews. He gets a taste. Everybody breathes.', cast.tony],
      [PUSSY, 'And when he starts giving orders?', cast.pussy],
      [TONY, "Then we don't hear so good.", cast.tony],
    ]);
  });
  place(g, spot(satriale.door, 0, -2.3), SOUTH);
  await fade(g, 0, 1);
  p.locked = false;
  await reach(g, hesh.kerb, 'Ask <b>Hesh</b> what he thinks.');
  await reach(g, hesh.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(FNOTE, [2.4, 1.6], [-0.4, -2.2]), q => ({
    hesh: actor(g, 'hesh', roomSpot(q, -1, -3.4), SOUTH),
    tony: actor(g, 'tony', roomSpot(q, 0.2, -1), NORTH),
  }), async cast => {
    await talk(g, [
      [HESH, "You're giving an old man a crown and keeping the kingdom. The Romans did it. It went fine, for a while.", cast.hesh],
      [TONY, 'How long is a while?', cast.tony],
      [HESH, 'Until the old man notices. Make sure he is busy noticing something else.', cast.hesh],
      [TONY, 'Like what?', cast.tony],
      [HESH, 'Like your mother.', cast.hesh],
    ]);
  });
  place(g, spot(hesh.door, 0, 0.6), NORTH);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. The Boss ----------
// Junior wants proof before he takes anything: a bookie who has stopped paying. Then the offer. Then the phone.

async function theBoss(g) {
  const { park, bar, bing } = g.places, p = g.player, BAR = bar.room;
  let junior, mikey;

  await g.wait(1);
  g.hud.card('The Boss', 'The park');
  await phone(g, JUNIOR, 'You said nice. Come say it. The park.');
  g.hud.card();
  junior = actor(g, 'junior', spot(park.bench, 0, 0.2), SOUTH, 'sit'); // there before he arrives
  mikey = actor(g, 'mikey', spot(park.bench, -2.4, 1.2), EAST);
  await reach(g, park.kerb, 'Meet Uncle Junior in the <b>park</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, spot(park.bench, 2.2, 1.4), WEST, park.kerb);
    shot(g, spot(park.bench, 0.6, 5.2), spot(park.bench, 0, 0.6), 1.6, 1.1);
  });
  await talk(g, [
    [JUNIOR, "You hit my man in a hospital parking lot, and now you want to talk nice. Talk."],
    [TONY, "Jackie's got days. When he goes, you take it. The whole thing. Boss.", p],
    [JUNIOR, '...Which one of us is the one who is sick?'],
    [TONY, "You've waited thirty years. Take it.", p],
    [JUNIOR, "Before I take anything from you I want to see what you're giving. There's a bookie, Lenny, works out of the bar on the corner. He paid Jackie. Now he pays nobody. Make him pay me. Then we talk."],
    [MIKEY, "I'd do it myself, but somebody broke my hand.", mikey],
  ]);
  await cut(g, () => { dismiss(g, junior, mikey); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, bar.kerb, "Find <b>Lenny the bookie</b> at the bar.");
  await reach(g, bar.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });

  // Inside the bar, with the player in the room: this one is fought, not watched.
  p.locked = true;
  const door = g.places.doors.find(d => d.inside === BAR.inside);
  let lenny, heavy1, heavy2;
  await cut(g, () => {
    if (p.car) g.leaveCar();
    p.inside = door; p.pos.set(BAR.inside.x, 0, BAR.inside.z); p.heading = g.cam.yaw = NORTH;
    for (const a of BAR.ambient) a.group.visible = false;
    lenny = actor(g, 'miller', roomSpot(BAR, 0, 1.4), SOUTH);
    heavy1 = actor(g, 'trucker', roomSpot(BAR, 5.4, -1.2), WEST); heavy2 = actor(g, 'kolar', roomSpot(BAR, -4.5, -1.6), EAST);
    frame(g, p.pos, lenny.group.position, { dist: 4.2 });
  });
  await talk(g, [
    ['Lenny', "Jackie's people get Jackie's envelope. And Jackie, God rest him—", lenny],
    [TONY, "He's not dead yet. And the envelope goes to his uncle now. Corrado Soprano. Say the name.", p],
    ['Lenny', "I say it when I see a reason to. Boys?", lenny],
  ]);
  const fight = [g.makeEnemy(lenny, { health: 80, damage: 8, cash: 300 }), g.makeEnemy(heavy1, { health: 80, damage: 9, cash: 40 }), g.makeEnemy(heavy2, { health: 70, damage: 8, cash: 40 })];
  fistsOnly(g, true);
  g.cam.fixed = null;
  p.locked = false;
  g.hud.objective("<b>Give Lenny a reason.</b>");
  await allDown(g, fight);
  g.hud.objective();
  fistsOnly(g, false);
  g.pardon();
  await reach(g, lenny.group.position, "Take the <b>envelope</b>.", { r: 1.5, how: 'foot' });
  p.locked = true;
  p.human.play('pickup', 'idle');
  await g.wait(1);
  await say(g, TONY, 'Corrado Soprano. Every Friday.');
  await cut(g, () => {
    dismiss(g, lenny, heavy1, heavy2);
    for (const a of BAR.ambient) a.group.visible = true;
    p.inside = null; place(g, bar.door, bar.door.h);
  });
  p.locked = false;
  junior = actor(g, 'junior', spot(park.bench, 0, 0.2), SOUTH, 'sit'); // there before he arrives
  mikey = actor(g, 'mikey', spot(park.bench, -2.4, 1.2), EAST);
  await reach(g, park.kerb, 'Bring it to <b>Junior</b>.');

  p.locked = true;
  await cut(g, () => {
    place(g, spot(park.bench, 2.2, 1.4), WEST, park.kerb);
    shot(g, spot(park.bench, 0.6, 5.2), spot(park.bench, 0, 0.6), 1.6, 1.1);
  });
  p.human.play('interact', 'idle');
  await talk(g, [
    [TONY, "Lenny sends his regards. Every Friday.", p],
    [JUNIOR, '...And the feds. They take their pictures of me.'],
    [TONY, "They take pictures of the boss. You want the title, that's in it.", p],
    [JUNIOR, "What do you get?"],
    [TONY, "I keep my crew, and nobody goes to war the week we bury Jackie.", p],
    [JUNIOR, 'I want it. ...And Mikey stays as he is.'],
    [TONY, 'Mikey stays as he is.', p],
    [MIKEY, 'Thank you, Tony.', mikey],
    [TONY, "Don't say thank you to me. Ever.", p],
  ]);
  await cut(g, () => { dismiss(g, junior, mikey); g.cam.fixed = null; });
  await phone(g, CHRIS, "T. I'm at the Bing. I got a thing. Come now.");
  p.locked = false;
  let chris;
  const club = await intoBing(g, 'Christopher is at the <b>Bada Bing</b>.', club => {
    chris = actor(g, 'christopher', spot(club.door, 0.8, -2.4), SOUTH); chris.arm(true); chris.set('aim');
  });
  await cut(g, () => {
    place(g, club.door, NORTH, bing.park);
    frame(g, p.pos, chris.group.position, { dist: 4.4 });
  }, 0.4);
  await talk(g, [
    [CHRIS, "Mikey's at Satriale's. Alone. I go in, I come out. Done.", chris],
    [TONY, 'Give me the gun.', p],
    [CHRIS, 'No.', chris],
  ]);
  await punch(g, p, chris);
  chris.arm(false);
  p.human.play('pickup', 'idle');
  await g.wait(0.8);
  await talk(g, [
    [TONY, "Junior is the boss as of tomorrow. You shoot his guy, you shoot the boss's guy, and I bury two kids this month instead of one.", p],
    [CHRIS, 'The boss. Him.', chris],
    [TONY, 'Him. On paper.', p],
    [CHRIS, '...On paper.', chris],
  ]);
  await cut(g, () => { dismiss(g, chris); g.cam.fixed = null; g.setNight(1); });
  await phone(g, ROSALIE, "Tony. ...He's gone. Ten minutes ago. He asked for you and then he was gone.");
  await say(g, '', 'Jackie Aprile died at twenty to ten. By midnight everyone who mattered knew who the new boss was, and who he was not.');
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 7. Meadowlands ----------
// The funeral. The feds take pictures of the boss. Tony and Christopher work out what the job is.

async function meadowlands(g) {
  const { church, home } = g.places, p = g.player;
  const cast = {};

  await g.wait(1);
  g.setNight(0);
  g.hud.card('Meadowlands', 'The churchyard');
  await phone(g, CARMELA, "The funeral is at eleven. Wear the grey. And Tony: your mother is coming, and so is your uncle. Be nice.");
  g.hud.card();
  await say(g, TONY, 'A van with dark glass, parked across from my house on the day of a funeral. Subtle.', 3.4);
  await shake(g, '<b>Drive.</b> Lose the van before the church. They can take their pictures there.', { kind: 'van', color: 0x23232b });
  await reach(g, church.kerb, 'Drive to the <b>church</b>.');

  p.locked = true;
  const flashes = { on: true };
  await cut(g, () => {
    place(g, church.lawn, NORTH, church.kerb);
    const at = (dx, dz, h = NORTH) => [spot(church.grave, dx, dz), h];
    cast.phil = actor(g, 'priest', ...at(0, -2.2, SOUTH), 'talk');
    cast.rosalie = actor(g, 'rosalie', ...at(-1.6, 1.6)); cast.carmela = actor(g, 'carmela', ...at(-3.2, 2)); cast.meadow = actor(g, 'meadow', ...at(-4.2, 3)); cast.aj = actor(g, 'aj', ...at(-2.6, 3.4));
    cast.junior = actor(g, 'junior', ...at(2.6, 2.2)); cast.mikey = actor(g, 'mikey', ...at(4, 2.6)); cast.livia = actor(g, 'livia', ...at(1.2, 3.4));
    cast.silvio = actor(g, 'silvio', ...at(-6, 1)); cast.paulie = actor(g, 'paulie', ...at(-7.2, 2.2)); cast.pussy = actor(g, 'pussy', ...at(-5.5, 3.6)); cast.hesh = actor(g, 'hesh', ...at(-1.4, 5.6));
    cast.chris = actor(g, 'christopher', church.back, SOUTH);
    cast.a1 = actor(g, 'agent', spot(church.street, -2, -3), NORTH); cast.a2 = actor(g, 'agent', spot(church.street, 2.2, -3), NORTH);
    const van = g.spawnCar(church.street.x, church.street.z, EAST, 0x3a3a44, 'van'); cast.van = { group: van.mesh }; cast.vanCar = van;
    g.cam.fixed = null;
    let next = g.time + 2;
    g.updaters.push(() => { if (!flashes.on) return false; if (g.time > next) { g.hud.flash('#ffffff', 0.12); g.sfx?.click(); next = g.time + 2 + Math.random() * 4; } return true; });
  });
  await say(g, '', 'They buried Jackie Aprile on a Thursday. Across the street, a grey van with no windows had been parked since nine.');
  p.locked = false;
  await reach(g, spot(church.grave, 0, 1.2), 'Pay your respects at the <b>grave</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.heading = NORTH;
  shot(g, spot(church.grave, 1.8, 7.8), spot(church.grave, 0, 0), 2.3, 0.7);
  await talk(g, [
    [PHIL, 'We commend our brother Giacomo to the earth. Earth to earth, ashes to ashes, dust to dust.', cast.phil],
  ]);
  p.human.play('pickup', 'idle');
  await g.wait(1.2);
  await say(g, '', 'Tony threw his handful of earth and did not look at his uncle.');
  g.cam.fixed = null;
  p.locked = false;
  await reach(g, cast.junior.group.position, 'Have a word with <b>Uncle Junior</b>.', { r: 1.8, how: 'foot' });
  p.locked = true;
  approach(g, cast.junior);
  frame(g, p.pos, cast.junior.group.position, { dist: 4.2 });
  await talk(g, [
    [JUNIOR, 'The pictures. You see them? Two of them, with the long lenses, like it is a wedding.', cast.junior],
    [TONY, "They're taking pictures of the boss, Uncle Jun.", p],
    [JUNIOR, '...Yeah. Yeah, they are.', cast.junior],
    [LIVIA, "Corrado, stand up straight. Everyone is looking at you.", cast.livia],
    [JUNIOR, 'Everyone is looking at me, Livia. That is the idea.', cast.junior],
    [MIKEY, 'Congratulations, Tony. On the arrangement.', cast.mikey],
    [TONY, 'Shut up, Mikey.', p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await reach(g, church.back, 'Find <b>Christopher</b>.', { r: 2, how: 'foot' });
  p.locked = true;
  approach(g, cast.chris);
  frame(g, p.pos, cast.chris.group.position, { dist: 4.2, side: -1 });
  await talk(g, [
    [CHRIS, "Brendan should be here. He'd have worn the stupid suit.", cast.chris],
    [TONY, 'I know.', p],
    [CHRIS, "Junior's the boss, Mikey's standing next to him like it's his wedding, and I'm supposed to—", cast.chris],
    [TONY, "You're supposed to stand next to me. That's the job. That's the whole job.", p],
    [CHRIS, '...Okay. Okay, T.', cast.chris],
  ]);
  await say(g, '', "Across the street, a man with a long lens took a picture of a heavy man and a thin one in bad suits, and wrote 'unknown' under both.");
  await fade(g, 1, 1.5);
  flashes.on = false;
  g.removeCar(cast.vanCar); delete cast.vanCar; delete cast.van;
  dismiss(g, ...Object.values(cast));
  g.cam.fixed = null;
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode four complete', 5000);
}


// ========== Episode Five: College ==========
// Tony drives Meadow up the coast to look at colleges, and sees a face from ten years ago at a gas pump.

// The gas station and the house the episode uses: the ones a short drive from Peters Travel.
const nearTo = (list, to, want) => list.slice().sort((a, b) => Math.abs(Math.hypot(a.kerb.x - to.x, a.kerb.z - to.z) - want) - Math.abs(Math.hypot(b.kerb.x - to.x, b.kerb.z - to.z) - want))[0];
const fiveGas = g => nearTo(g.places.gasStations, g.places.travel.kerb, 320);
const fiveHouse = g => nearTo(g.places.flats.filter(f => f.door !== g.places.chris?.door), g.places.travel.kerb, 260);

// ---------- 1. College ----------

async function collegeTrip(g) {
  const { home } = g.places, p = g.player, gas = fiveGas(g);

  await g.wait(1);
  g.setNight(0);
  g.hud.card('College', 'The Soprano house');
  await phone(g, CARMELA, "I have a fever of a hundred and two, so you are taking her. Three colleges, up the coast. Do not embarrass her in front of the admissions people.");
  g.hud.card();
  let meadow;
  meadow = actor(g, 'meadow', spot(home.drive, 2.2, 0.4), WEST); // there before he arrives
  await reach(g, home.road, 'Drive <b>home</b> and collect Meadow.');
  p.locked = true;
  await cut(g, () => {
    place(g, home.drive, EAST, home.car);
    frame(g, p.pos, meadow.group.position, { dist: 4.2 });
  });
  await talk(g, [
    [MEADOW, "I made a list. Interview Thursday at eleven. You have to wait outside and not talk to anyone.", meadow],
    [TONY, 'Who would I talk to?', p],
    [MEADOW, 'Anyone. That is the point.', meadow],
  ]);
  g.cam.fixed = null;
  const ride = follower(g, meadow, { pace: 3.4 });
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Meadow.');
  await g.until(() => p.car);
  await reach(g, gas.kerb, 'Drive north. Stop for <b>gas</b> on the way.', { how: 'car', r: 7 });

  p.locked = true;
  ride.stay = true;
  let febby;
  const truck = g.spawnCar(gas.pumps.x - 5, gas.pumps.z + 0.5, NORTH, 0x1f6b4a, 'pickup');
  truck.driverless = true;
  await cut(g, () => {
    place(g, spot(gas.pumps, 3.4, 5), NORTH, { x: gas.pumps.x + 5, z: gas.pumps.z + 1, h: NORTH });
    meadow.group.position.set(gas.pumps.x + 1.8, groundAt(gas.pumps.x, gas.pumps.z + 5), gas.pumps.z + 5.4); meadow.group.rotation.y = EAST; meadow.group.visible = true; meadow.set('idle');
    frame(g, p.pos, meadow.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [MEADOW, 'Dad. Can I ask you something, and you do not yell.', meadow],
    [TONY, 'That depends on the something.', p],
    [MEADOW, 'Is it true? What they say you do.', meadow],
    [TONY, "I'm in waste management. People assume things, on account of the vowels.", p],
    [MEADOW, 'I have lived in that house seventeen years. I found the money in the air duct when I was nine.', meadow],
    [TONY, '...Some of my money comes from things that are not legal. Gambling. Some other things. Not all of it.', p],
    [MEADOW, 'Thank you for not lying. Mostly.', meadow],
  ]);
  febby = actor(g, 'febby', spot(truck.pos, -2.2, 0.6), SOUTH);
  shot(g, spot(gas.pumps, 4.5, 8.5), spot(truck.pos, -1.8, 0.4), 1.7, 1.3);
  await say(g, '', 'At the other pump a heavy man in a cap was filling a green pickup. He looked at Tony once, the way you look at weather.');
  await say(g, TONY, '...Wait in the car.');
  await say(g, '', 'Fabian Petrulio. Febby. He gave up half his crew ten years ago and went into the programme. He was supposed to be dead.');
  await cut(g, () => { dismiss(g, febby); g.cam.fixed = null; ride.stay = false; });
  g.febbyTruck = truck;
  p.locked = false;
  await passed(g, 'Respect +');
  g.fiveRide = ride; g.fiveMeadow = meadow;
}

// ---------- 2. Fred Peters ----------
// Follow the pickup. He has a business now, and another name.

async function fredPeters(g) {
  const { travel, college } = g.places, p = g.player, gas = fiveGas(g);
  let meadow = g.fiveMeadow, ride = g.fiveRide;
  if (!meadow || !g.tracked.has(meadow.group)) { // picking the story up here from a save
    place(g, spot(gas.pumps, 3.4, 5), NORTH);
    meadow = actor(g, 'meadow', spot(gas.pumps, 1.8, 5.4), EAST); ride = follower(g, meadow, { pace: 3.4 });
  }
  const truck = g.febbyTruck && g.cars.includes(g.febbyTruck) ? g.febbyTruck : g.spawnCar(gas.pumps.x - 5, gas.pumps.z + 0.5, NORTH, 0x1f6b4a, 'pickup');
  truck.driverless = true; truck.mission = true;

  g.hud.card('Fred Peters', 'Route 1');
  await g.wait(2);
  g.hud.card();
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  for (;;) {
    dispatch(g, truck, gas.kerb, travel.kerb, 9);
    const ok = await tail(g, truck, travel.kerb, "<b>Follow the pickup.</b> Stay back. Don't lose it.");
    if (ok) break;
    p.locked = true;
    await say(g, MEADOW, 'Dad, why are we going in circles? The college is the other way.');
    await cut(g, () => { const mine = p.car || g.tonyCar; g.enterCar(mine); mine.pos.set(gas.kerb.x, 0, gas.kerb.z); mine.heading = gas.kerb.h; mine.speed = 0; });
    p.locked = false;
  }
  p.locked = true;
  await cut(g, () => {
    truck.pos.set(travel.kerb.x + 6, 0, travel.kerb.z); truck.heading = EAST; truck.speed = 0;
    const mine = p.car || g.tonyCar; mine.pos.set(travel.kerb.x - 22, 0, travel.kerb.z); mine.heading = EAST; mine.speed = 0; g.enterCar(mine);
    shot(g, spot(travel.kerb, -16, -2), spot(travel.door, -2, -1), 1.5, 2.4);
  });
  await say(g, '', 'The pickup stopped outside a storefront. Peters Travel. Cruises, tours, airline tickets.');
  await phone(g, CHRIS, "Fred Peters? T, I never heard of him.");
  await say(g, TONY, "You heard of Febby Petrulio. Get me his picture from the old days and call me at the motel. And say nothing. To nobody.");
  await say(g, MEADOW, 'Who was that?');
  await say(g, TONY, 'A guy who might owe me money. Let us go look at a college.');
  g.cam.fixed = null;
  p.locked = false;
  await reach(g, college.kerb, 'Drive Meadow to the <b>college</b>.', { how: 'car', r: 7 });
  p.locked = true;
  ride.on = false;
  await cut(g, () => {
    place(g, spot(college.quad, -1.2, 2), NORTH, college.kerb);
    meadow.group.position.set(college.quad.x + 1, groundAt(college.quad.x, college.quad.z), college.quad.z + 1.6); meadow.group.rotation.y = NORTH; meadow.group.visible = true; meadow.set('idle');
    shot(g, spot(college.quad, 3, 10), spot(college.door, 0, 0), 1.7, 5);
  });
  await talk(g, [
    [MEADOW, 'Look at it. It is two hundred years old. Nobody here knows anything about us.', meadow],
    [TONY, 'That what you want? Nobody knowing?', p],
    [MEADOW, 'For four years. Yes.', meadow],
  ]);
  await cut(g, () => { dismiss(g, meadow); g.removeCar(truck); g.cam.fixed = null; });
  g.fiveMeadow = g.fiveRide = g.febbyTruck = null;
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 3. Home Sick ----------
// Played as Carmela. Father Phil comes by with a film and an appetite, and the telephone rings.

async function homeSick(g) {
  const { home, houseRoom } = g.places, p = g.player, tony = p.human;
  const R = { X: houseRoom.inside.x - 2, Y: -0.1, Z: houseRoom.inside.z - 3.2, ambient: houseRoom.ambient };
  const at = (x, z) => ({ x: R.X + x, y: R.Y, z: R.Z + z });

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'At home, Carmela had the flu, the house to herself, and a storm coming in.');
  if (p.car) g.leaveCar();
  g.setNight(1);
  const carmela = makeLook('carmela');
  g.setPlayer(carmela);
  for (const a of houseRoom.ambient) a.group.visible = false;
  p.inside = g.places.doors.find(d => d.name === 'home');
  p.pos.set(R.X - 3, 0, R.Z - 3.2); p.heading = g.cam.yaw = SOUTH;
  g.cam.fixed = null;
  const phil = actor(g, 'priest', at(2, 4.6), NORTH);
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Home Sick', 'The Soprano house, evening');
  p.locked = false;
  await reach(g, at(2, 3.4), 'Somebody is at the <b>door</b>. Answer it.', { r: 1.5, how: 'foot' });
  p.locked = true;
  approach(g, phil, 1.6);
  frame(g, p.pos, phil.group.position, { dist: 3.6 });
  await talk(g, [
    [PHIL, "Carmela. I heard you were ill. I brought a film, and I confess I was hoping there was ziti.", phil],
    [CARMELA, 'There is always ziti, Father. Tony and Meadow are up the coast. Come in out of the rain.', p],
  ]);
  g.cam.fixed = null;
  phil.group.position.set(R.X + 4.5, R.Y, R.Z - 4.1); phil.group.rotation.y = SOUTH; phil.set('sit');
  p.locked = false;
  await reach(g, at(-1.2, -4.2), 'Heat the <b>ziti</b> on the stove.', { r: 1.4, how: 'foot' });
  p.locked = true; p.heading = NORTH; p.human.play('interact', 'idle'); await g.wait(1.4); p.locked = false;
  await reach(g, at(5.2, -1.4), 'Put the <b>film</b> on.', { r: 1.4, how: 'foot' });
  p.locked = true; p.heading = SOUTH; p.human.play('pickup', 'idle'); await g.wait(1.2);
  // On the sofa, with the film running.
  await cut(g, () => {
    p.pos.set(R.X + 5.9, 0, R.Z - 4.1); p.heading = SOUTH; p.pose = 'sit';
    g.cam.fixed = { pos: new THREE.Vector3(R.X + 3.2, R.Y + 1.4, R.Z - 0.9), look: new THREE.Vector3(R.X + 5.2, R.Y + 0.95, R.Z - 4.2) };
  }, 0.5);
  await talk(g, [
    [PHIL, 'It is a remarkable film. The butler has given his whole life to a man who was not worth it, and he cannot say so, even to himself.', phil],
    [CARMELA, 'Why would he stay?', p],
    [PHIL, 'Because leaving would mean the years were wasted. People will forgive almost anything rather than admit that.', phil],
  ]);
  await phone(g, 'A woman', 'Mrs. Soprano? This is Jennifer Melfi. I have to move your husband\'s appointment. Would you let him know?');
  await talk(g, [
    [CARMELA, '...Jennifer. Yes. I will let him know, Jennifer.', p],
    [PHIL, 'Who was that?', phil],
    [CARMELA, "My husband's therapist. Whom he sees every week. Whom he told me was a man.", p],
    [CARMELA, 'Father, I want to make a confession. Here. Now. I have said nothing for twenty years, and I have known everything.', p],
    [PHIL, 'Then say it now. I am listening, Carmela.', phil],
  ]);
  await say(g, '', 'She said it. All of it. He gave her communion at the coffee table, and afterwards they sat a little too close and neither of them moved.');
  await say(g, '', 'Then Father Phil was sick, loudly, in the downstairs bathroom, and slept on the sofa until morning.');
  await fade(g, 1, 1.2);
  p.pose = null;
  dismiss(g, phil);
  for (const a of houseRoom.ambient) a.group.visible = true;
  p.inside = null;
  homeAsTony(g, tony);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. The Stakeout ----------
// The motel, at night. Tony looks for Febby. Febby is already looking at Tony.

async function theStakeout(g) {
  const { motel } = g.places, p = g.player, flat = fiveHouse(g);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Up the coast again. That night Meadow went out with two girls from the college, and Tony sat in a motel room with the telephone.');
  if (p.car) g.leaveCar();
  g.setNight(1);
  place(g, motel.court, SOUTH);
  g.tonyCar.pos.set(motel.kerb.x, 0, motel.kerb.z); g.tonyCar.heading = motel.kerb.h; g.tonyCar.speed = 0;
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'The Stakeout', 'A motel, Route 1');
  await phone(g, CHRIS, "It's him, T. Same ears. I'll drive up tonight and do it, you don't have to be anywhere near.");
  await say(g, TONY, 'You stay where you are. He looked at me. This one is mine.');
  p.locked = false;
  await reach(g, spot(motel.kerb, 0, -4), 'Go out to the <b>car</b>.', { r: 2.5, how: 'foot' });
  // Across the car park, behind a parked van.
  p.locked = true;
  const febby = actor(g, 'febby', spot(motel.kerb, 9, -9), toward(spot(motel.kerb, 9, -9), p.pos)); febby.arm(true); febby.set('aim');
  const couple = [makeHuman({ pattern: 'plaid', shirt: 0x8d93cc, pants: 0xd9c7a0, hair: 0xdddddd, hairStyle: 'balding', age: 1 }), makeHuman({ body: 'female', jacket: 0xffd3a1, shirt: 0xffffff, pants: 0x6f6f7a, hair: 0xc4c1bb, hairMesh: 'parted', age: 1, height: 0.9 })];
  couple.forEach((a, n) => { a.group.position.set(motel.kerb.x + 3 + n * 0.9, groundAt(motel.kerb.x, motel.kerb.z - 6), motel.kerb.z - 6); a.group.rotation.y = WEST; a.set('walk', 0.7); g.track(a.group); });
  shot(g, spot(motel.kerb, 11.5, -11.5), spot(motel.kerb, 0.5, -4), 1.5, 1.3);
  await say(g, '', 'Forty feet away, in the dark between two cars, a heavy man held a pistol on the back of Tony\'s head and counted the people who would hear it.');
  let t0 = g.time;
  g.updaters.push(dt => { if (g.time - t0 > 6) return false; for (const a of couple) a.group.position.x -= 0.9 * dt; return true; });
  await say(g, '', 'An old couple came out of room nine, arguing about ice. They stood there. They kept standing there.');
  febby.arm(false); febby.set('idle');
  await say(g, '', 'When Tony turned round, there was nobody between the cars.');
  await cut(g, () => { dismiss(g, febby); for (const a of couple) g.untrack(a.group); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, flat.kerb, "Christopher found an address. Drive past <b>Febby's house</b>.", { how: 'car', r: 7 });
  p.locked = true;
  shot(g, spot(flat.kerb, 0, 0), flat.door, 1.3, 1.6);
  await say(g, '', "A porch light. A child's bicycle on the lawn. A woman at the window, drying a plate.");
  await say(g, TONY, '...He has a kid.');
  await say(g, '', 'He sat there four minutes. Then he drove back to the motel and waited for his daughter.');
  await fade(g, 1, 1);
  g.cam.fixed = null;
  homeAsTony(g, p.human);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. The Interview ----------
// Meadow has her interview at eleven. Tony has an hour.

async function theInterview(g) {
  const { home, college, travel } = g.places, p = g.player;

  await g.wait(1);
  g.setNight(0);
  g.hud.card('The Interview', 'Thursday, half past ten');
  p.locked = true;
  let meadow;
  await cut(g, () => {
    place(g, home.drive, EAST, home.car);
    meadow = actor(g, 'meadow', spot(home.drive, 2.2, 0.4), WEST);
    frame(g, p.pos, meadow.group.position, { dist: 4.2 });
  });
  g.hud.card();
  await talk(g, [
    [MEADOW, 'Eleven sharp. If I do not get in because you stopped for a sandwich, I will tell Mom about the motel.', meadow],
    [TONY, 'What about the motel?', p],
    [MEADOW, 'You were out half the night. I am not nine any more.', meadow],
  ]);
  g.cam.fixed = null;
  const ride = follower(g, meadow, { pace: 3.4 });
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Meadow.');
  await g.until(() => p.car);
  await reach(g, college.kerb, 'Drive Meadow to her <b>interview</b>.', { how: 'car', r: 7 });
  p.locked = true;
  ride.on = false;
  await cut(g, () => {
    meadow.group.position.set(college.quad.x, groundAt(college.quad.x, college.quad.z), college.quad.z - 6); meadow.group.rotation.y = NORTH; meadow.group.visible = true; meadow.set('walk');
    shot(g, spot(college.quad, 4, 6), college.door, 1.7, 2.2);
    g.updaters.push(dt => { if (!g.tracked.has(meadow.group) || meadow.group.position.z < college.door.z + 0.5) return false; meadow.group.position.z -= 1.5 * dt; return true; });
  });
  await say(g, '', 'She went up the steps without looking back. An hour, they had said. Perhaps a little more.');
  await cut(g, () => { dismiss(g, meadow); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, travel.kerb, 'Drive to <b>Peters Travel</b>.', { how: 'car', r: 7 });
  await reach(g, travel.door, 'Go to the <b>door</b>.', { r: 2, how: 'foot' });

  // He sees Tony through the glass and goes out the back.
  const febby = actor(g, 'febby', travel.back, NORTH);
  const runner = g.addNpc(febby, { health: 500, ai: 'flee', cash: 0, stays: true });
  runner.threat = p.pos.clone();
  g.noHeat = true;
  fistsOnly(g, true);
  await say(g, '', 'Through the window: a desk, a rack of brochures, and a back door swinging shut.', 2.6);
  const found = quarry(g, runner);
  g.hud.objective('<b>Chase down</b> Febby: he went out the back. Follow the <b>yellow arrow</b>.');
  await g.until(() => runner.health < 500);
  found();
  g.removeNpc(febby);
  const foe = g.makeEnemy(febby, { health: 150, damage: 10, cash: 0 });
  foe.die = () => { foe.health = 1; foe.human.after = null; foe.human.set('down'); foe.ai = null; foe.stays = true; };
  g.hud.objective('<b>Deal with</b> him.');
  await g.until(() => foe.ai === null);
  g.hud.objective();
  g.removeNpc(febby);
  fistsOnly(g, false);
  p.locked = true;
  approach(g, febby, 1.2);
  frame(g, p.pos, febby.group.position, { dist: 4.2, height: 1.3, lift: 0.5 });
  await talk(g, [
    [FEBBY, 'Tony. Teddy. Whatever they call you now. I have a kid. I sell bus tours to old ladies.', febby],
    [TONY, 'You had a gun on me last night.', p],
    [FEBBY, "And I didn't use it! That has to count for something. That has to count!", febby],
    [TONY, 'Jimmy says hello, from a cell in Pennsylvania. He counted on you too.', p],
  ]);
  p.human.play('kneel', 'idle');
  await fade(g, 1, 1.5);
  await say(g, '', 'It took a long time, and Tony did it with his hands and a length of cord, and he did not look away.');
  await say(g, '', 'Afterwards he stood up. Overhead a line of ducks went south in a V, and he watched them until they were gone.');
  dismiss(g, febby);
  g.noHeat = false;
  g.pardon();
  g.cam.fixed = null;
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. One Face ----------
// Meadow notices the mud. Carmela has had a telephone call. A sentence cut in stone.

async function oneFace(g) {
  const { college, home, houseRoom } = g.places, p = g.player;

  await g.wait(1);
  g.hud.card('One Face', 'The college');
  await g.wait(2.5);
  g.hud.card();
  await reach(g, college.kerb, 'Drive back to the <b>college</b>.', { how: 'car', r: 7 });
  await reach(g, college.stone, 'Wait for her by the <b>hall</b>.', { r: 2, how: 'foot' });
  p.locked = true;
  p.heading = NORTH;
  shot(g, spot(college.stone, 2.6, 3.4), spot(college.stone, 0, -2), 1.5, 0.9);
  await say(g, '', 'There was a stone by the door, with words cut in it. He read them twice.');
  await say(g, '', '"No man can wear one face to himself and another to the crowd, and long remember which is his own."');
  const meadow = actor(g, 'meadow', spot(college.stone, 2.4, 0.6), WEST);
  frame(g, p.pos, meadow.group.position, { dist: 4 });
  await talk(g, [
    [MEADOW, 'It went well. I think it went well. ...Dad. Your shoes. And your hand is cut.', meadow],
    [TONY, 'I fell. In the parking lot.', p],
    [MEADOW, 'You said you would not lie to me.', meadow],
    [TONY, 'I said mostly. Get in the car.', p],
  ]);
  g.cam.fixed = null;
  const ride = follower(g, meadow, { pace: 3.4 });
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Meadow.');
  await g.until(() => p.car);
  await reach(g, home.road, 'Drive <b>home</b>.', { how: 'car' });
  ride.on = false;
  dismiss(g, meadow);

  const R = { X: houseRoom.inside.x - 2, Y: -0.1, Z: houseRoom.inside.z - 3.2, ambient: houseRoom.ambient };
  await roomScene(g, inRoom(R, [-3.6, 2.6], [-4, -1.5], 1.6, 1.15), q => ({ // across the kitchen island
    carmela: actor(g, 'carmela', roomSpot(q, -6.2, -1.5), EAST),
    tony: actor(g, 'tony', roomSpot(q, -1.7, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [CARMELA, 'Your therapist called. Jennifer.', cast.carmela],
      [TONY, 'It is therapy, Carm. We just talk.', cast.tony],
      [CARMELA, 'Father Phil stayed the night. He was ill. Nothing happened.', cast.carmela],
      [TONY, 'The priest. Slept here.', cast.tony],
      [CARMELA, 'And your doctor is a woman. And nothing happens there either, I assume. So we are even, in nothing.', cast.carmela],
      [TONY, '...How was the ziti?', cast.tony],
      [CARMELA, 'He ate all of it.', cast.carmela],
    ]);
  });
  place(g, home.drive, EAST, home.car);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Episode five complete', 5000);
}
