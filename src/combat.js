import * as THREE from 'three';
import { pushOut, groundAt, clamp, wrapAngle, near, NX, NZ } from './grid.js';
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
};
const GUNS = ['pistol', 'smg', 'shotgun'];
const cashMat = new THREE.MeshLambertMaterial({ color: 0x4fd36a });
const bandMat = new THREE.MeshLambertMaterial({ color: 0xe9e2cf });
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8 });
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

export function installCombat(g, { scene, hud, peds, cars, keys }) {
  const p = g.player;
  Object.assign(p, { health: 100, armour: 0, weapon: 'fist', weapons: { fist: true, pistol: true, smg: false, shotgun: false }, mag: { pistol: 12, smg: 0, shotgun: 0 }, ammo: { pistol: 48, smg: 0, shotgun: 0 }, hitAt: -9, dying: false, reloading: 0 });
  g.npcs = []; g.wanted = 0;
  const pickups = [], effects = [], cops = { cars: [], officers: [] };
  let swing = 0, lastShot = -9, lastHit = -9, calm = 0, lastAttack = -9, sprintUntil = -9;
  const tmp = new THREE.Vector3();
  const isGun = w => GUNS.includes(w);
  const showAmmo = () => hud.ammo(isGun(p.weapon) ? `${p.mag[p.weapon]} / ${p.ammo[p.weapon]}` : '');

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

  // ----- Lock-on -----
  // Hold the right mouse button (or tap Q / Tab) to lock onto the best target in front of the camera:
  // Tony faces them, the camera swings round, and shots and punches go their way. Q / Tab cycles.
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = '#ff3b4a'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 22, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#ff3b4a'; x.beginPath(); x.moveTo(32, 2); x.lineTo(40, 14); x.lineTo(24, 14); x.fill();
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
      if (ahead < -0.2) continue;
      list.push({ t, score: d + (1 - ahead) * 12 });
    }
    return list.sort((a, b) => a.score - b.score).map(c => c.t);
  };
  g.lockOn = (cycle = false) => {
    if (p.locked || p.hidden || (p.car && !isGun(p.weapon))) return;
    const list = candidates();
    if (!list.length) { lock = null; return; }
    const i = cycle && lock ? (list.indexOf(lock) + 1) % list.length : 0;
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
    if (p.locked || p.hidden || p.dying || p.car || g.time - p.hitAt < 0.35) return; // blows do not stack within a beat
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
  const fire = (from, heading, by, range = 70) => {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let hit = null, best = range;
    for (const t of targets()) {
      if (t.dead || t.human === by) continue;
      const dx = t.pos.x - from.x, dz = t.pos.z - from.z, ahead = dx * fx + dz * fz;
      if (ahead < 0.5 || ahead > best || Math.abs(dx * fz - dz * fx) > 0.75) continue;
      best = ahead; hit = t;
    }
    tmp.set(from.x + fx * best, from.y, from.z + fz * best);
    tracer(from, tmp);
    return hit;
  };
  // Put a round (or a spread of them) down range from the player's gun.
  const shoot = () => {
    const w = WEAPONS[p.weapon];
    if (p.mag[p.weapon] <= 0) { if (p.ammo[p.weapon] > 0) g.reload(); else g.sfx?.click(); return; }
    if (p.reloading > g.time) return;
    lastShot = g.time;
    p.mag[p.weapon]--; showAmmo();
    if (!p.car) p.human.layer('shoot', { once: true, speed: 1.5 }); // the arms fire; the legs keep doing what they were doing
    g.sfx?.shot(); if (Math.random() < 0.3) g.sfx?.scream();
    g.scare = g.time;
    const from = p.car ? tmp.set(p.car.pos.x, groundAt(p.car.pos.x, p.car.pos.z) + 1.1, p.car.pos.z).clone() : muzzleOf(p.human, tmp).clone();
    const heading = lock ? Math.atan2(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z) : (p.car ? g.cam.yaw : p.heading);
    for (let n = 0; n < (w.pellets || 1); n++) {
      const aim = heading + (Math.random() - 0.5) * 2 * w.spread * (lock ? 0.5 : 1);
      const hit = lock && n === 0 && Math.random() > w.spread * 3 ? (tracer(from, tmp.set(lock.pos.x, from.y, lock.pos.z)), lock) : fire(from, aim, p.human, w.range);
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
    if (!lock) g.lockOn();
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
  g.setWeapon = w => { if (!p.weapons[w]) return; p.weapon = w; p.human.arm(isGun(w) ? w : false); hud.weapon(WEAPONS[w].name); showAmmo(); };

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
      if (d > 14) { move(1, 5); h.set('run'); face(); }
      else {
        face(); h.set('aim');
        if (g.time > npc.nextHit) {
          npc.nextHit = g.time + 1.6 + Math.random() * 0.6;
          h.play('shoot', 'aim');
          const from = muzzleOf(h, tmp).clone();
          const miss = (Math.random() - 0.5) * 0.3;
          const hit = fire(from, Math.atan2(dx, dz) + miss, h);
          const toPlayer = Math.abs(miss) < 0.07 && !p.car && (!hit || hit.pos === p.pos);
          if (toPlayer) g.damagePlayer(npc.damage, npc.pos);
        }
      }
    }
  };
  g.makeEnemy = (human, opts) => g.addNpc(human, { ai: 'brawler', cash: 60, ...opts });

  // ----- Per frame -----
  const update = dt => {
    // Weapons and the aim stance.
    if (g.consume('Digit1')) g.setWeapon('fist');
    if (g.consume('Digit2')) g.setWeapon('pistol');
    if (g.consume('Digit3')) g.setWeapon('smg');
    if (g.consume('Digit4')) g.setWeapon('shotgun');
    if (g.consume('KeyR')) g.reload();
    if (g.consume('Mouse2') || g.consume('KeyQ') || g.consume('Tab')) g.lockOn(!!lock);
    if (g.consume('Mouse0') || g.consume('KeyE') || (keys.Mouse0 && WEAPONS[p.weapon].auto)) g.attack();
    if (p.motion === 'sprint') sprintUntil = g.time;
    p.fighting = g.time - lastHit < 3;
    if (lock) {
      const far = !near(lock.pos, p.pos, lockRange() * 1.3);
      const idle = !keys.Mouse2 && g.time - lastAttack > 3 && g.time - lockAt > 3;
      if (lock.dead || (lock.human.state === 'down' && !lock.stunned) || far || idle || (p.car && !isGun(p.weapon)) || p.locked || p.hidden) { lock = null; if (keys.Mouse2) g.lockOn(); }
    }
    if (lock) {
      if (!p.car) { faceLock(); g.cam.yaw += wrapAngle(p.heading - g.cam.yaw) * (1 - Math.exp(-5 * dt)); }
      ring.visible = bar.visible = true;
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
    g.npcs.length = 0;
    for (const k of pickups) scene.remove(k.mesh);
    pickups.length = 0;
    p.health = 100; hud.health(100); p.armour = 0; hud.armour(0); p.dying = false; p.reloading = 0;
    g.setWeapon('fist');
  };
  hud.health(100); hud.wanted(0); hud.weapon('Fists');
  return { update, reset, cops };
}
