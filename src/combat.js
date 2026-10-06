import * as THREE from 'three';
import { pushOut, groundAt, clamp, wrapAngle, near, NX, NZ, colliders, roomAt } from './grid.js';
import { makeLook, makeHuman, randomPedLook, roam, driveAI, nearestNode } from './entities.js';

// Fists, a pistol, health, the people who get hurt and the police who turn up.
// Everything that can be hit has { human, pos, dead, hurt(dmg, from) }: pedestrians from entities.js,
// and the mission characters and officers registered here as npcs.

const FIST = { reach: 1.9, rate: 0.42 };
// The five blows of the combo, in order; the last one puts a man down. A running punch is its own thing.
const COMBO = [['jab', 30], ['cross', 34], ['jab', 30], ['uppercut', 40], ['kick', 55]];
export const WEAPONS = {
  fist: { name: 'Fists' },
  pistol: { name: 'Pistol', dmg: 55, range: 70, rate: 0.38, mag: 12, spread: 0.015, price: 350, ammoPrice: 60, pack: 24 },
  smg: { name: 'SMG', dmg: 22, range: 55, rate: 0.085, mag: 30, spread: 0.05, auto: true, price: 1200, ammoPrice: 140, pack: 60 },
  shotgun: { name: 'Shotgun', dmg: 34, range: 26, rate: 0.95, mag: 6, spread: 0.11, pellets: 6, price: 850, ammoPrice: 90, pack: 12 },
  rifle: { name: 'Carbine', dmg: 36, range: 95, rate: 0.11, mag: 30, spread: 0.028, auto: true, price: 2600, ammoPrice: 180, pack: 60 },
};
const GUNS = ['pistol', 'smg', 'shotgun', 'rifle'];
// Who carries what, the first time the story puts the player in their shoes: [rounds in the gun, rounds spare].
// Anyone not listed carries nothing: a wife, a schoolboy, a boy of eleven, a waiter with a camera in his buttonhole.
const LOADOUTS = {
  tony: { pistol: [12, 48] }, neil: { pistol: [12, 48] }, hanna: { pistol: [12, 36], shotgun: [6, 18] },
  christopher: { pistol: [12, 36] }, pussy: { pistol: [12, 24] }, mikey: { pistol: [12, 24] },
  shiherlis: { pistol: [12, 36] }, cheritto: { pistol: [12, 24] }, trejo: { pistol: [12, 12] },
};
// And what is in their pockets.
const POCKET = { tony: 0, neil: 0, hanna: 340, christopher: 800, pussy: 450, mikey: 600, carmela: 220, aj: 6, tonyboy: 0, shiherlis: 300, cheritto: 900, trejo: 120, waiter: 40 };
const fresh = who => {
  const L = LOADOUTS[who] || {}, s = { weapon: 'fist', weapons: { fist: true }, mag: {}, ammo: {}, health: 100, armour: 0, cash: POCKET[who] ?? 50, wanted: 0 };
  for (const w of GUNS) { s.weapons[w] = !!L[w]; s.mag[w] = L[w]?.[0] || 0; s.ammo[w] = L[w]?.[1] || 0; }
  return s;
};
const cashMat = new THREE.MeshLambertMaterial({ color: 0x4fd36a });
const bandMat = new THREE.MeshLambertMaterial({ color: 0xe9e2cf });
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8 });
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

export function installCombat(g, { scene, hud, peds, cars, keys }) {
  const p = g.player;
  Object.assign(p, { health: 100, armour: 0, weapon: 'fist', weapons: { fist: true, pistol: true, smg: false, shotgun: false, rifle: false }, mag: { pistol: 12, smg: 0, shotgun: 0, rifle: 0 }, ammo: { pistol: 48, smg: 0, shotgun: 0, rifle: 0 }, hitAt: -9, dying: false, reloading: 0 });
  g.npcs = []; g.wanted = 0;
  const pickups = [], effects = [], cops = { cars: [], officers: [] };
  let swing = 0, lastShot = -9, lastHit = -9, calm = 0, lastAttack = -9, sprintUntil = -9;
  const tmp = new THREE.Vector3();
  const isGun = w => GUNS.includes(w);
  const showAmmo = () => hud.ammo(isGun(p.weapon) ? `${p.mag[p.weapon]} / ${p.ammo[p.weapon]}` : '');
  // The row of what he is carrying, shown for a moment whenever he changes weapon (or tries to).
  const showBar = () => hud.weapons?.(['fist', ...GUNS].map((k, i) => ({ key: i + 1, name: WEAPONS[k].name, has: !!p.weapons[k] && !(p.fistsOnly && k !== 'fist'), on: k === p.weapon, rounds: isGun(k) && p.weapons[k] ? p.mag[k] + p.ammo[k] : null })));

  // ----- One set of pockets each -----
  // Every character the player becomes has his own guns, rounds, money, health and trouble with the police, and gets
  // them back as he left them. `g.become(name)` is called whenever the body changes.
  const profiles = {};
  let current = null;
  const stash = () => { if (current) profiles[current] = { weapon: p.weapon, weapons: { ...p.weapons }, mag: { ...p.mag }, ammo: { ...p.ammo }, health: p.health, armour: p.armour, cash: g.cash, wanted: Math.floor(g.wanted) }; };
  g.become = name => {
    if (name === current) return;
    stash();
    const s = profiles[name] || fresh(name);
    current = g.playing = name;
    Object.assign(p, { weapons: { ...s.weapons }, mag: { ...s.mag }, ammo: { ...s.ammo }, health: Math.max(25, s.health), armour: s.armour, fistsOnly: false });
    g.cash = s.cash; hud.cash = g.cash; hud.money(g.cash);                                 // his money, without a "+$" beside it
    hud.health(p.health); hud.armour(p.armour);
    callOff(); g.wanted = 0; calm = 0; hud.wanted(0);
    if (s.wanted) g.heat(s.wanted);                                                        // they have not forgotten him
    p.weapon = 'fist'; g.setWeapon(p.weapons[s.weapon] ? s.weapon : 'fist', true);
  };
  // For the save file, and back from it.
  g.profilesOut = () => { stash(); return profiles; };
  g.profilesIn = data => { for (const k in data || {}) if (k !== current) profiles[k] = data[k]; };

  // A bar over the locked target's head, red for what is left.
  const barCanvas = document.createElement('canvas'); barCanvas.width = 64; barCanvas.height = 10;
  const barTex = new THREE.CanvasTexture(barCanvas); barTex.colorSpace = THREE.SRGBColorSpace;
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTex, depthTest: false, transparent: true }));
  bar.scale.set(0.9, 0.14, 1); bar.visible = false; bar.renderOrder = 6;
  scene.add(bar);
  let barShown = -1;
  const drawBar = frac => {
    if (Math.abs(frac - barShown) < 0.005) return;
    barShown = frac;
    const x = barCanvas.getContext('2d');
    x.clearRect(0, 0, 64, 10); x.fillStyle = '#000'; x.fillRect(0, 0, 64, 10);
    x.fillStyle = frac > 0.5 ? '#ff3b4a' : frac > 0.25 ? '#ff8a30' : '#ffd23f'; x.fillRect(2, 2, 60 * Math.max(0, frac), 6);
    barTex.needsUpdate = true;
  };

  // ----- Walls stop bullets -----
  // How far a shot from (x, z) along (fx, fz) goes before something solid and tall enough stops it, up to `range`.
  const wallAt = (x, z, fx, fz, range) => {
    let best = range;
    for (const c of colliders) {
      if (c.thin || c.h < 1.3) continue;
      if (Math.min(c.minX, c.maxX) - x > best && fx <= 0) continue;
      let t0 = 0, t1 = best;
      if (Math.abs(fx) < 1e-6) { if (x < c.minX || x > c.maxX) continue; }
      else { let a = (c.minX - x) / fx, b = (c.maxX - x) / fx; if (a > b) { const k = a; a = b; b = k; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
      if (Math.abs(fz) < 1e-6) { if (z < c.minZ || z > c.maxZ) continue; }
      else { let a = (c.minZ - z) / fz, b = (c.maxZ - z) / fz; if (a > b) { const k = a; a = b; b = k; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
      if (t0 > 0.05 && t0 < best) best = t0; // t0 of nought: the shooter is standing in it (a doorway, a porch), which does not count
    }
    return best;
  };
  // Can a see b: the same room (or both out of doors), and no wall between.
  const sees = (a, b) => {
    if (roomAt(a.x, a.z, 0) !== roomAt(b.x, b.z, 0)) return false;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    return d < 0.5 || wallAt(a.x, a.z, dx / d, dz / d, d) >= d - 0.45;
  };
  g.sees = sees;

  // ----- Lock-on -----
  // Hold the right mouse button (or tap Q / Tab) to lock onto the best target in front of the camera:
  // Tony faces them, the camera swings round, and shots and punches go their way. Q / Tab cycles.
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = '#ffffff'; x.lineWidth = 5; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(32, 32, 23, k * Math.PI / 2 + 0.3, (k + 1) * Math.PI / 2 - 0.3); x.stroke(); } // four brackets, tinted red for an enemy
    x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(32, 2); x.lineTo(40, 14); x.lineTo(24, 14); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, depthTest: false, transparent: true }));
  ring.scale.set(0.55, 0.55, 1); ring.visible = false; ring.renderOrder = 5;
  scene.add(ring);
  let lock = null, lockAt = -9;
  const lockRange = () => (isGun(p.weapon) ? Math.min(55, WEAPONS[p.weapon].range) : 7);
  const candidates = () => {
    const fx = Math.sin(g.cam.yaw), fz = Math.cos(g.cam.yaw), range = lockRange(), list = [];
    for (const t of targets()) {
      if (t.dead || t.human === p.human || t.human.state === 'down') continue;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.3) continue;
      const ahead = (dx * fx + dz * fz) / d;
      if (ahead < -0.2 || !sees(p.pos, t.pos)) continue;
      list.push({ t, score: d + (1 - ahead) * 12 + (hostile(t) ? 0 : 40) }); // whoever is trying to kill him comes first
    }
    return list.sort((a, b) => a.score - b.score).map(c => c.t);
  };
  // `auto` is a lock taken for him because he attacked: it only ever picks someone who is in the fight (or, bare-handed,
  // whoever is in front of him), so a gun out on a crowded street does not snap onto a passer-by.
  g.lockOn = (cycle = false, auto = false) => {
    if (p.locked || p.hidden || (p.car && !isGun(p.weapon))) return;
    let list = candidates();
    if (auto && isGun(p.weapon)) list = list.filter(hostile);
    if (!list.length) { lock = null; return; }
    const i = cycle && lock ? (list.indexOf(lock) + 1) % list.length : 0;
    if (list[i] !== lock) g.sfx?.click();
    lock = list[i]; lockAt = g.time;
  };
  const faceLock = () => { if (lock) p.heading = Math.atan2(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z); };
  Object.defineProperty(g, 'lockTarget', { get: () => lock });

  // ----- Things that can be hit -----
  // A mission character who can be hurt. `ai` is 'brawler' (comes at you with fists) or 'shooter', or none.
  g.addNpc = (human, { health = 100, ai = null, cash = 0, damage = 10, onDeath, stays = false } = {}) => {
    const npc = {
      human, pos: human.group.position, health, maxHealth: health, ai, cash, damage, dead: false, nextHit: 0, onDeath, stays, stunned: 0,
      hurt(dmg, from, { knock = 0, down = false } = {}) {
        if (npc.dead) return;
        npc.health -= dmg;
        if (npc.health <= 0) { npc.die(); return; }
        if (knock && from) { // a step back from the blow
          const dx = npc.pos.x - from.x, dz = npc.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
          npc.pos.x += dx / d * knock; npc.pos.z += dz / d * knock; pushOut(npc.pos, 0.4); npc.pos.y = groundAt(npc.pos.x, npc.pos.z);
        }
        if (down) { human.after = null; human.set('down'); npc.stunned = g.time + 3; }
        else human.play(Math.random() < 0.5 ? 'hitHead' : 'hitChest', 'idle');
        if (!npc.ai && !npc.stays) { npc.ai = 'flee'; npc.threat = from.clone(); }
      },
      die() {
        if (npc.dead) return;
        npc.dead = true; npc.diedAt = g.time;
        human.after = null; human.set('down'); human.arm(false);
        if (npc.cash) g.dropCash(npc.pos.x, npc.pos.z, npc.cash);
        npc.onDeath?.();
      },
    };
    g.npcs.push(npc);
    if (ai === 'shooter' || ai === 'brawler') g.setCheckpoint?.(); // trouble starts here: so does the checkpoint
    return npc;
  };
  g.removeNpc = human => { const i = g.npcs.findIndex(n => n.human === human); if (i >= 0) g.npcs.splice(i, 1); };

  // Pull the driver out of a car on the road and take it. Cars flagged `driverless` are simply taken.
  g.carjack = async car => {
    if (p.locked || p.car) return;
    if (car.ai === 'police') { if (car.officer) retireOfficer(car); cops.cars.splice(cops.cars.indexOf(car), 1); car.mission = true; g.heat(1); }
    car.nav = null; car.speed = 0; car.ai = null;
    const h = car.heading, door = { x: car.pos.x + Math.cos(h) * 1.5, z: car.pos.z - Math.sin(h) * 1.5 };
    p.locked = true;
    p.pos.set(door.x + Math.cos(h) * 1.2, 0, door.z - Math.sin(h) * 1.2);
    p.heading = Math.atan2(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
    p.human.play('interact', 'idle', 1.6);
    if (!car.driverless) {
      const driver = makeHuman(randomPedLook());
      driver.group.position.set(door.x + Math.cos(h) * 0.4, groundAt(door.x, door.z), door.z - Math.sin(h) * 0.4);
      driver.group.rotation.y = p.heading + Math.PI;
      scene.add(driver.group);
      driver.set('down');
      const npc = g.addNpc(driver, { ai: null, cash: 0 });
      npc.expires = g.time + 40;
      g.heat(0.6);
      g.wait(2.6).then(() => { if (!npc.dead) { driver.after = null; npc.ai = 'flee'; npc.threat = p.pos.clone(); } }).catch(() => {});
    }
    try { await g.wait(0.9); } catch { return; }
    p.locked = false;
    if (!p.car && !p.dying) g.enterCar(car);
  };
  const targets = () => [...peds, ...g.npcs];
  // In the fight: coming at him, shooting at him, or the man a mission has sent him after.
  const hostile = t => t.ai === 'shooter' || t.ai === 'brawler' || !!t.stays;
  // Bystanders: hurting them is what the police mind. Enemies and scripted victims are the mission's business.
  const innocent = t => !t.ai && !t.stays;

  // ----- Money on the ground -----
  g.dropCash = (x, z, amount) => {
    const m = new THREE.Group();
    const wad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.14), cashMat), band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.104, 0.144), bandMat);
    m.add(wad, band);
    m.position.set(x + (Math.random() - 0.5) * 0.8, groundAt(x, z) + 0.08, z + (Math.random() - 0.5) * 0.8);
    scene.add(m);
    pickups.push({ mesh: m, amount, born: g.time });
  };

  // ----- Damage to the player -----
  g.damagePlayer = (dmg, from) => {
    if (p.locked || p.hidden || p.dying || p.car || g.time - p.hitAt < 0.35 || g.time < (p.safeUntil || 0)) return; // blows do not stack within a beat
    if (p.armour > 0) { const a = Math.min(p.armour, dmg * 0.75); p.armour -= a; dmg -= a; hud.armour(p.armour); } // the vest takes most of it
    p.health = Math.max(0, p.health - dmg);
    p.hitAt = g.time;
    g.sfx?.hurt();
    hud.flash('#ff2a3c', 0.35);
    hud.health(p.health);
    if (from && !p.human.busy) p.human.play('hitChest', 'idle');
    if (p.health <= 0) g.wasted();
  };

  // ----- Weapons -----
  const tracer = (from, to) => {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, tracerMat), flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), flashMat);
    flash.position.copy(from);
    scene.add(line, flash);
    effects.push({ objects: [line, flash], until: g.time + 0.07 });
  };
  const muzzleOf = (human, out) => { human.pistol.getWorldPosition(out); return out; };
  // A shot from `from` along `heading`; hits the first target within the cylinder of fire. Returns it.
  const fire = (from, heading, by, range = 70, dmg = 0) => {
    const fx = Math.sin(heading), fz = Math.cos(heading), room = roomAt(from.x, from.z, 0);
    let hit = null, best = wallAt(from.x, from.z, fx, fz, range);
    for (const t of targets()) {
      if (t.dead || t.human === by || roomAt(t.pos.x, t.pos.z, 0) !== room) continue;
      const dx = t.pos.x - from.x, dz = t.pos.z - from.z, ahead = dx * fx + dz * fz;
      if (ahead < 0.5 || ahead > best || Math.abs(dx * fz - dz * fx) > 0.75) continue;
      best = ahead; hit = t;
    }
    // A car in the way takes the round instead (not the one the shooter is sitting in).
    for (const c of cars) {
      if (c === p.car || c.wreck) continue;
      const dx = c.pos.x - from.x, dz = c.pos.z - from.z, ahead = dx * fx + dz * fz;
      if (ahead < 1.2 || ahead > best || Math.abs(dx * fz - dz * fx) > 1.25) continue;
      best = ahead; hit = null;
      if (dmg) g.hurtCar?.(c, dmg * 0.45);
    }
    tmp.set(from.x + fx * best, from.y, from.z + fz * best);
    tracer(from, tmp);
    return hit;
  };
  // Put a round (or a spread of them) down range from the player's gun.
  const shoot = () => {
    const w = WEAPONS[p.weapon];
    if (p.mag[p.weapon] <= 0) { if (p.ammo[p.weapon] > 0) g.reload(); else g.sfx?.click(); return; }
    if (p.reloading > g.time || p.drawing > g.time) return;
    lastShot = g.time;
    p.mag[p.weapon]--; showAmmo();
    if (!p.car) p.human.layer('shoot', { once: true, speed: 1.5 }); // the arms fire; the legs keep doing what they were doing
    g.sfx?.shot(); if (Math.random() < 0.3) g.sfx?.scream();
    g.scare = g.time;
    const from = p.car ? tmp.set(p.car.pos.x, groundAt(p.car.pos.x, p.car.pos.z) + 1.1, p.car.pos.z).clone() : muzzleOf(p.human, tmp).clone();
    const heading = lock ? Math.atan2(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z) : (p.car ? g.cam.yaw : p.heading);
    for (let n = 0; n < (w.pellets || 1); n++) {
      const aim = heading + (Math.random() - 0.5) * 2 * w.spread * (lock ? 0.5 : 1);
      const hit = lock && n === 0 && Math.random() > w.spread * 3 && sees(p.car ? p.car.pos : p.pos, lock.pos) ? (tracer(from, tmp.set(lock.pos.x, from.y, lock.pos.z)), lock) : fire(from, aim, p.human, w.range, w.dmg);
      if (hit) { hit.hurt(w.dmg, p.pos); if (innocent(hit)) g.heat(hit.dead ? 2 : 1); } else if (n === 0) g.heat(0.4);
    }
    for (const ped of peds) if (!ped.dead && Math.hypot(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z) < 26) ped.flee(p.pos, 7);
    if (p.mag[p.weapon] <= 0 && p.ammo[p.weapon] > 0) g.reload();
  };
  g.reload = () => {
    const w = WEAPONS[p.weapon];
    if (!w.mag || p.reloading > g.time || p.mag[p.weapon] >= w.mag || p.ammo[p.weapon] <= 0) return;
    p.reloading = g.time + 1.4;
    if (!p.car) p.human.layer('reload', { once: true, speed: 1.2 });
    g.sfx?.click();
    g.wait(1.3).then(() => {
      const take = Math.min(w.mag - p.mag[p.weapon], p.ammo[p.weapon]);
      p.mag[p.weapon] += take; p.ammo[p.weapon] -= take; showAmmo();
    }).catch(() => {});
  };
  // Bullets bought or found: into the reserve, and into the gun if it is empty.
  g.giveAmmo = (w, n) => { p.ammo[w] += n; if (p.mag[w] <= 0) { const take = Math.min(WEAPONS[w].mag, p.ammo[w]); p.mag[w] += take; p.ammo[w] -= take; } showAmmo(); };
  g.giveWeapon = w => { p.weapons[w] = true; if (p.mag[w] <= 0 && p.ammo[w] <= 0) g.giveAmmo(w, WEAPONS[w].mag * 2); g.setWeapon(w); };
  // Missions that need the pistol get at least a couple of magazines.
  g.topUp = () => { if (p.mag.pistol + p.ammo.pistol < 24) g.giveAmmo('pistol', 24 - p.mag.pistol - p.ammo.pistol); };

  g.attack = () => {
    if (p.locked || p.dying || (p.human.busy && p.weapon === 'fist' && g.time - lastHit < 0.3)) return;
    if (p.car) { if (isGun(p.weapon) && g.time - lastShot >= WEAPONS[p.weapon].rate) shoot(); return; } // out of the window
    lastAttack = g.time;
    if (!lock) g.lockOn(false, true);
    if (lock && (lock.dead || !near(lock.pos, p.pos, lockRange() * 1.2))) lock = null;
    faceLock();
    if (isGun(p.weapon)) {
      if (g.time - lastShot < WEAPONS[p.weapon].rate) return;
      shoot();
      return;
    }
    if (g.time - lastHit < FIST.rate) return;
    const running = g.time - sprintUntil < 0.25;
    if (g.time - lastHit > 1.2) swing = 0; // the combo starts over after a pause
    const [clip, dmg] = running ? ['cross', 70] : COMBO[swing % COMBO.length];
    const last = !running && swing % COMBO.length === COMBO.length - 1;
    swing = running ? 0 : swing + 1;
    lastHit = g.time;
    p.human.play(clip, 'guard', running ? 1.3 : clip === 'kick' || clip === 'uppercut' ? 1.15 : 1.4);
    if (lock) { // step in to reach them
      const dx = lock.pos.x - p.pos.x, dz = lock.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      const lunge = running ? 2.4 : 1.6;
      if (d > 1.5 && d < 4.2 + (running ? 2 : 0)) { p.pos.x += dx / d * Math.min(d - 1.4, lunge); p.pos.z += dz / d * Math.min(d - 1.4, lunge); pushOut(p.pos, 0.45); }
    }
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let victim = null, best = FIST.reach;
    for (const t of targets()) {
      if (t.dead || (t.human.state === 'down' && t !== lock)) continue;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < best && (dx * fx + dz * fz) / (d || 1) > 0.5) { best = d; victim = t; }
    }
    g.sfx?.punch(!!victim);
    if (victim) {
      g.wait(0.12).then(() => { if (!victim.dead) victim.hurt(dmg, p.pos, { knock: running || last ? 0.9 : 0.35, down: running || last }); }).catch(() => {});
      if (innocent(victim)) g.heat(victim.dead ? 1.5 : 0.35);
    }
  };
  // Change what is in his hand. A long gun he owns but is not holding hangs across his back; drawing takes a moment.
  g.setWeapon = (w, quiet = false) => {
    if (!p.weapons[w] || (p.fistsOnly && w !== 'fist')) { if (!quiet) { showBar(); g.sfx?.click(); } return; }
    const changed = p.weapon !== w;
    p.weapon = w;
    p.human.arm(isGun(w) ? w : false);
    p.human.sling?.(GUNS.filter(k => k !== 'pistol' && k !== w && p.weapons[k] && !p.fistsOnly));
    hud.weapon(WEAPONS[w].name); showAmmo();
    if (changed && !quiet) { p.drawing = g.time + (isGun(w) ? 0.32 : 0.1); g.sfx?.click(); showBar(); }
  };
  // Hands only, for a beating that must not end in a shooting: every gun stays where it is until this is lifted.
  g.fistsOnly = on => { p.fistsOnly = !!on; if (on) g.setWeapon('fist', true); else p.human.sling?.(GUNS.filter(k => k !== 'pistol' && k !== p.weapon && p.weapons[k])); };

  // ----- Wanted level and the police -----
  // n is how much attention an act draws; a star is a whole unit.
  g.heat = n => {
    if (g.noHeat) return; // a mission has the street to itself for a while
    calm = 0;
    const before = Math.floor(g.wanted);
    g.wanted = Math.min(3.99, g.wanted + n);
    hud.wanted(Math.floor(g.wanted));
    if (Math.floor(g.wanted) > before) sendPolice();
  };
  const sendPolice = () => {
    while (cops.cars.length < Math.floor(g.wanted)) {
      const car = g.spawnCar(0, 0, 0, 0xf4f4f4, 'police');
      car.mission = false; // the police outlive a failed mission
      for (let tries = 0; tries < 30; tries++) { // a few blocks away, on the road
        roam(car, Math.floor(Math.random() * NX), Math.floor(Math.random() * NZ), Math.floor(Math.random() * 2), 22);
        const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
        if (d > 90 && d < 240) break;
      }
      car.nav.goal = p.pos; car.ai = 'police'; car.officer = null; car.wait = 0;
      cops.cars.push(car);
    }
  };
  // The slate wiped clean: no stars, no police.
  g.pardon = () => { g.wanted = 0; calm = 0; hud.wanted(0); callOff(); };
  const callOff = () => {
    for (const car of cops.cars) { if (car.officer) retireOfficer(car); g.removeCar(car); }
    cops.cars.length = 0;
  };
  const retireOfficer = car => {
    const o = car.officer;
    car.officer = null;
    if (!o) return;
    g.removeNpc(o.human); scene.remove(o.human.group);
    cops.officers.splice(cops.officers.indexOf(o), 1);
  };
  const policeCar = (car, dt) => {
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z, d = Math.hypot(dx, dz);
    const chasing = p.car && !p.hidden;
    if (!chasing && d < 16 && !car.officer && Math.abs(car.speed) < 3) { // the officer gets out
      const side = { x: car.pos.x + Math.cos(car.heading) * 2.2, z: car.pos.z - Math.sin(car.heading) * 2.2 };
      const human = makeLook('cop');
      human.group.position.set(side.x, groundAt(side.x, side.z), side.z);
      scene.add(human.group);
      human.arm(true);
      const npc = g.addNpc(human, { ai: 'shooter', health: 160, damage: 11, cash: 0 });
      npc.onDeath = () => { g.heat(1.2); };
      car.officer = npc; cops.officers.push(npc);
    }
    if (car.officer && (chasing || d > 45) && !car.officer.dead) retireOfficer(car);
    if (car.officer) { car.speed = 0; car.sync(); return; }
    if (car.direct && d > 60) car.direct = false;
    if (d < 30) car.direct = true;
    if (car.direct && (chasing || d > 8)) { // close enough: straight at them
      car.nav = null;
      const diff = wrapAngle(Math.atan2(dx, dz) - car.heading);
      car.heading += clamp(diff, -2.2 * dt, 2.2 * dt);
      const target = chasing ? 27 : d > 12 ? 18 : 0;
      car.speed += clamp(target - car.speed, -30 * dt, 9 * dt);
      car.move(dt);
      car.collide();
      if (Math.abs(car.speed) < 1 && d > 10) { car.wait += dt; if (car.wait > 3) { car.speed = -8; car.heading += 0.9; car.wait = 0; } } else car.wait = 0;
    } else if (!car.direct) { // follow the roads toward them
      if (!car.nav) { const n = nearestNode(car.pos); roam(car, n.i, n.j, Math.floor(Math.random() * 4) % 4, 22); car.nav.goal = p.pos; }
      driveAI(car, dt, cars.filter(c => c !== car && c !== p.car).map(c => c.pos));
    } else car.speed += clamp(-car.speed, -30 * dt, 9 * dt);
    car.sync();
  };

  // ----- Mission characters with fight in them -----
  const npcAi = (npc, dt) => {
    const h = npc.human;
    if (npc.dead || h.busy) return;
    if (npc.stunned) { if (g.time < npc.stunned) return; npc.stunned = 0; h.rise(npc.ai === 'brawler' ? 'guard' : 'idle'); return; }
    const dx = p.pos.x - npc.pos.x, dz = p.pos.z - npc.pos.z, d = Math.hypot(dx, dz) || 1;
    const face = () => { h.group.rotation.y = Math.atan2(dx, dz); };
    const move = (dir, speed) => {
      npc.pos.x += dx / d * dir * speed * dt; npc.pos.z += dz / d * dir * speed * dt;
      pushOut(npc.pos, 0.4);
      npc.pos.y = groundAt(npc.pos.x, npc.pos.z);
    };
    if (npc.ai === 'flee') {
      if (d > 60) { npc.ai = null; h.set('idle'); return; }
      if (npc.threat && Math.hypot(npc.threat.x - npc.pos.x, npc.threat.z - npc.pos.z) > 70) { npc.ai = null; h.set('idle'); return; }
      move(-1, 6.2); h.set('sprint'); h.group.rotation.y = Math.atan2(-dx, -dz);
    } else if (npc.ai === 'brawler') {
      if (p.hidden || p.car) { h.set('idle'); return; }
      if (d > 1.7) { move(1, 5.5); h.set('run'); face(); }
      else {
        face(); h.set('guard');
        if (g.time > npc.nextHit) {
          npc.nextHit = g.time + 1.7 + Math.random() * 0.5;
          h.play(['jab', 'cross', 'uppercut'][Math.floor(Math.random() * 3)], 'guard', 1.2);
          g.wait(0.22).then(() => { if (!npc.dead && Math.hypot(p.pos.x - npc.pos.x, p.pos.z - npc.pos.z) < 2.2) g.damagePlayer(npc.damage, npc.pos); }).catch(() => {});
        }
      }
    } else if (npc.ai === 'shooter') {
      if (p.hidden) { h.set('aim'); return; }
      h.arm(true);
      if (g.time > (npc.lookAt || 0)) { npc.lookAt = g.time + 0.35; npc.sight = sees(npc.pos, p.pos); } // a look a few times a second is enough
      if (d > 14 || !npc.sight) { if (d > 2.5) { move(1, 5); h.set('run'); } else h.set('aim'); face(); }
      else {
        face(); h.set('aim');
        if (g.time > npc.nextHit) {
          npc.nextHit = g.time + 1.6 + Math.random() * 0.6;
          h.play('shoot', 'aim');
          const from = muzzleOf(h, tmp).clone();
          const miss = (Math.random() - 0.5) * 0.3;
          const hit = fire(from, Math.atan2(dx, dz) + miss, h);
          const onTarget = Math.abs(miss) < 0.07 && (!hit || hit.pos === p.pos);
          if (onTarget && p.car) g.hurtCar?.(p.car, npc.damage * 0.9);                      // the car takes it for him
          else if (onTarget) g.damagePlayer(npc.damage, npc.pos);
        }
      }
    }
  };
  g.makeEnemy = (human, opts) => g.addNpc(human, { ai: 'brawler', cash: 60, ...opts });

  // A small red mark over everyone who is in the fight, so it is plain who to shoot; and their places for the radar.
  const markTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#ff3b4a'; x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.moveTo(4, 6); x.lineTo(28, 6); x.lineTo(16, 28); x.closePath(); x.fill(); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const marks = Array.from({ length: 14 }, () => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthTest: false, transparent: true })); m.visible = false; m.renderOrder = 5; scene.add(m); return m; });
  g.hostiles = [];
  const markHostiles = () => {
    let k = 0; g.hostiles.length = 0;
    for (const n of g.npcs) {
      if (n.dead || (n.ai !== 'shooter' && n.ai !== 'brawler') || n.human.state === 'down' || !n.human.group.visible) continue;
      const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      if (d > 90) continue;
      g.hostiles.push({ x: n.pos.x, z: n.pos.z, color: '#ff3b4a' });
      if (k < marks.length && n !== lock) { const m = marks[k++], s = 0.22 + d * 0.012; m.visible = true; m.position.set(n.pos.x, n.pos.y + 2.15 + d * 0.006, n.pos.z); m.scale.set(s, s, 1); }
    }
    for (; k < marks.length; k++) marks[k].visible = false;
  };

  // ----- Per frame -----
  const update = dt => {
    markHostiles();
    // Weapons and the aim stance.
    if (g.consume('Digit1')) g.setWeapon('fist');
    if (g.consume('Digit2')) g.setWeapon('pistol');
    if (g.consume('Digit3')) g.setWeapon('smg');
    if (g.consume('Digit4')) g.setWeapon('shotgun');
    if (g.consume('Digit5')) g.setWeapon('rifle');
    if (g.consume('KeyR')) g.reload();
    if (g.consume('Mouse2') || g.consume('KeyQ') || g.consume('Tab')) g.lockOn(!!lock);
    if (g.consume('Mouse0') || g.consume('KeyE') || (keys.Mouse0 && WEAPONS[p.weapon].auto)) g.attack();
    if (p.motion === 'sprint') sprintUntil = g.time;
    p.fighting = g.time - lastHit < 3;
    if (lock) {
      const far = !near(lock.pos, p.pos, lockRange() * 1.3);
      const idle = !keys.Mouse2 && g.time - lastAttack > 3 && g.time - lockAt > 3;
      if (lock.dead || (lock.human.state === 'down' && !lock.stunned) || far || idle || (p.car && !isGun(p.weapon)) || p.locked || p.hidden) { const fell = lock.dead; lock = null; if (keys.Mouse2) g.lockOn(); else if (fell && g.time - lastAttack < 2.5) g.lockOn(false, true); } // one down: on to the next who is still shooting
    }
    if (lock) {
      if (!p.car) { faceLock(); g.cam.yaw += wrapAngle(p.heading - g.cam.yaw) * (1 - Math.exp(-5 * dt)); }
      ring.visible = bar.visible = true;
      ring.material.color.set(hostile(lock) ? 0xff3b4a : 0xf4f4f0);
      ring.position.set(lock.pos.x, lock.pos.y + 2, lock.pos.z);
      const d = Math.hypot(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z), s = 0.4 + d * 0.03;
      ring.scale.set(s, s, 1);
      bar.position.set(lock.pos.x, lock.pos.y + 2.32 + d * 0.01, lock.pos.z); bar.scale.set(0.9 + d * 0.04, 0.14 + d * 0.006, 1);
      drawBar(Math.max(0, lock.health) / (lock.maxHealth || 100));
    } else ring.visible = bar.visible = false;
    p.aiming = isGun(p.weapon) && !lock && !p.car && !p.locked && !p.hidden;
    hud.aim(p.aiming || (p.car && isGun(p.weapon) && !lock && !p.locked));
    if (p.health < 100 && g.time - p.hitAt > 8) { p.health = Math.min(100, p.health + dt * 4); hud.health(p.health); }

    // The sirens, as near as the nearest police car.
    let nearestCop = 1e9;
    for (const car of cops.cars) nearestCop = Math.min(nearestCop, Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z));
    g.sirenLevel = cops.cars.length ? clamp(1 - nearestCop / 180, 0.15, 1) : 0;

    // Who is afraid of whom.
    for (const npc of g.npcs) npcAi(npc, dt);
    for (let i = g.npcs.length - 1; i >= 0; i--) { // the dead, and passers-by, are cleared away after a while
      const n = g.npcs[i];
      if ((n.dead && g.time - n.diedAt > 25) || (n.expires && g.time > n.expires && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) > 30)) { scene.remove(n.human.group); g.npcs.splice(i, 1); }
    }
    for (const ped of peds) if (ped.dead && !ped.fly && ped.lootable !== false) { ped.lootable = false; g.dropCash(ped.pos.x, ped.pos.z, 20 + Math.floor(Math.random() * 120)); }

    // Money.
    for (let i = pickups.length - 1; i >= 0; i--) {
      const k = pickups[i];
      k.mesh.rotation.y += dt * 2;
      const d = Math.hypot(k.mesh.position.x - p.pos.x, k.mesh.position.z - p.pos.z);
      if ((d < 1.3 && !p.hidden && !p.car) || g.time - k.born > 60) { // picked up on foot, never from a car
        if (d < 1.3) { g.addMoney(k.amount); hud.flash('#4fd36a', 0.25); g.sfx?.cash(); }
        scene.remove(k.mesh); pickups.splice(i, 1);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) if (g.time > effects[i].until) { scene.remove(...effects[i].objects); effects.splice(i, 1); }

    // The police.
    if (g.wanted > 0) {
      for (const car of cops.cars) policeCar(car, dt);
      const nearCop = cops.cars.some(c => Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 110);
      calm = nearCop ? 0 : calm + dt;
      if (calm > 40 || p.hidden) {
        calm = 0;
        g.wanted = Math.max(0, Math.floor(g.wanted) - 1);
        hud.wanted(g.wanted);
        if (g.wanted === 0) callOff();
        else while (cops.cars.length > g.wanted) { const c = cops.cars.pop(); if (c.officer) retireOfficer(c); g.removeCar(c); }
      }
    }
  };
  // Forget the police and everyone in a fight: for a respawn.
  const reset = () => {
    lock = null; ring.visible = false;
    g.wanted = 0; hud.wanted(0); callOff();
    for (const n of g.npcs) scene.remove(n.human.group);
    g.npcs.length = 0; p.fistsOnly = false; p.safeUntil = 0;
    for (const k of pickups) scene.remove(k.mesh);
    pickups.length = 0;
    p.health = 100; hud.health(100); p.armour = 0; hud.armour(0); p.dying = false; p.reloading = 0;
    g.setWeapon('fist');
  };
  hud.health(100); hud.wanted(0); hud.weapon('Fists');
  return { update, reset, cops };
}
