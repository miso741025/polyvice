import * as THREE from 'three';
import { CITY, NX, NZ, ROAD, CELL, OX, OZ, SHORE, nodeX, nodeZ, blockCenter, colliders, pushOut, pushOutAbove, groundAt, surfaceAt, roomAt, clamp, wrapAngle, near, mulberry32 } from './grid.js';
import { buildWorld } from './world.js';
import { makeLook, Car, Ped, spawnTraffic, driveAI, roam, loadPeople, updatePeople } from './entities.js';
import { Hud } from './hud.js';
import { runStory, savedMission, clearSave, storyList, jumpTo, explode, people, respray } from './missions.js';
import { installCombat } from './combat.js';
import { sfx } from './audio.js';
import { installSideJobs } from './sidejobs.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2a0b4, 140, 800);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1900);

const hemi = new THREE.HemisphereLight(0xffd9ea, 0x5d4c7c, 1.5);
scene.add(hemi);
const SUN_DIR = new THREE.Vector3(0.75, 0.6, 0.3).normalize();
const sun = new THREE.DirectionalLight(0xffcf9e, 2.3);
// The player's own headlamps: a spot that rides on whatever he is driving, lit after dark.
const headLight = new THREE.SpotLight(0xfff2c0, 0, 70, 0.55, 0.5, 1.2); headLight.position.set(0, 1.0, 1.6); headLight.target.position.set(0, -0.6, 30); headLight.add(headLight.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 420 });
scene.add(sun, sun.target);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

async function boot() {
  // Signs are drawn to canvas textures, so the web fonts have to be ready first.
  await Promise.race([
    Promise.all(['64px "Mr Dafoe"', '64px "Bebas Neue"'].map(f => document.fonts.load(f))).catch(() => {}),
    new Promise(r => setTimeout(r, 2500)),
  ]);

  await loadPeople();

  const rand = mulberry32(77);
  const hud = new Hud();
  // Settings, kept in the browser: volume, mouse, the crowd, shadows.
  const SETTINGS = 'sopranos-vice.settings';
  const settings = { volume: 0.7, ambience: 2, radio: 2, sens: 1, invert: false, crowd: 1, shadows: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS)) || {}); } catch { /* defaults */ }
  const applySettings = () => {
    sfx.setVolume(settings.volume); sfx.setAmbience([0, 0.5, 1, 1.6][settings.ambience] ?? 1); sfx.radio.volume([0, 0.4, 0.7, 1][settings.radio] ?? 0.7);
    renderer.shadowMap.enabled = settings.shadows; sun.castShadow = settings.shadows;
    scene.traverse(o => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } });
    try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* play on */ }
  };
  const places = buildWorld(scene);

  // ----- Cars: Tony's SUV, parked cars at the kerb, traffic -----
  const g_scenery = [];
  const NEXUS = CITY === 'nexus', LA = CITY === 'la';
  const tonyCar = new Car(scene, places.home.car.x, places.home.car.z, places.home.car.h, NEXUS ? 0x1c1c22 : LA ? 0x1d1d24 : 0x7a1626, NEXUS ? 'spinner' : LA ? 'sedan' : 'suv'); // the player's own car: Tony's SUV, Neil's sedan, K's spinner
  const cars = [tonyCar, ...spawnTraffic(scene, 46, rand)];
  const parkedColors = NEXUS ? [0x1c1c22, 0x2a2a30, 0x3a3a44, 0x16161c, 0x4a4446, 0x23232b, 0x2f2a38, 0x1a2028, 0x5a2a2a] : [0xffffff, 0x29c7c0, 0xff5fa8, 0xffd23f, 0xd9342b, 0x8ecbff, 0xf08a3c, 0x7d5cff, 0x1d1d24];
  const parkedKinds = ['sedan', 'coupe', 'sedan', 'suv', 'coupe', 'van', 'pickup'];
  for (let n = 0; n < 44; n++) {
    const off = (rand() - 0.5) * 36, far = ROAD / 2 - 1.2, color = parkedColors[n % parkedColors.length];
    if (rand() < 0.5) { // on a north-south road, facing south on the west kerb
      const i = Math.floor(rand() * (NX + 1)), j = Math.floor(rand() * NZ);
      cars.push(new Car(scene, nodeX(i) - far, blockCenter(0, j).z + off, 0, color, parkedKinds[n % parkedKinds.length]));
    } else { // on an east-west road, facing east on the south kerb
      const i = Math.floor(rand() * NX), j = Math.floor(rand() * (NZ + 1));
      cars.push(new Car(scene, blockCenter(i, 0).x + off, nodeZ(j) + far, Math.PI / 2, color, parkedKinds[n % parkedKinds.length]));
    }
  }

  (places.bing?.parking || []).forEach((spot, n) => cars.push(new Car(scene, spot.x, spot.z, spot.h, parkedColors[(n + 2) % parkedColors.length], parkedKinds[(n + 1) % parkedKinds.length])));
  places.parkedSpots.forEach((spot, n) => cars.push(new Car(scene, spot.x, spot.z, spot.h, spot.kind === 'truck' || spot.kind === 'ambulance' || spot.kind === 'police' ? 0xf4f4f0 : parkedColors[(n * 5 + 1) % parkedColors.length], spot.kind)));
  { // the car on the showroom turntable and the one up on the body shop's lift are scenery
    const { SHOWROOM, BODYSHOP } = places.rooms;
    const show = new Car(scene, SHOWROOM.showcar.x, SHOWROOM.showcar.z, SHOWROOM.showcar.h, 0xd9342b, 'coupe'); show.mesh.position.y = SHOWROOM.Y + 0.3; show.placeWheels(); show.sync = () => {};
    const lift = new Car(scene, BODYSHOP.lift.x, BODYSHOP.lift.z, BODYSHOP.lift.h, 0x8ecbff, 'sedan'); lift.mesh.position.y = BODYSHOP.lift.y; lift.placeWheels(); lift.sync = () => {};
    g_scenery.push(show, lift);
  }

  // ----- Pedestrians -----
  // A random block within `far` of a point, never Tony's own.
  const blockNear = (at, far) => {
    for (let tries = 0; tries < 20; tries++) {
      const i = Math.floor(rand() * NX), j = Math.floor(rand() * NZ), c = blockCenter(i, j), d = Math.hypot(c.x - at.x, c.z - at.z);
      if ((i || j) && d > far * 0.55 && d < far) return c;
    }
    let i, j;
    do { i = Math.floor(rand() * NX); j = Math.floor(rand() * NZ); } while (i === 0 && j === 0);
    return blockCenter(i, j);
  };
  const peds = [], CROWD = [45, 90, 130];
  for (let n = 0; n < 130; n++) peds.push(new Ped(scene, blockNear(places.home.spawn, 220), rand));
  const crowdLimit = () => { peds.forEach((ped, i) => { ped.parked = i >= CROWD[settings.crowd]; if (ped.parked) ped.human.group.visible = false; }); };
  crowdLimit();

  // Whoever drives over the bridge arrives as themselves, with what they were carrying.
  const arrived = new URLSearchParams(location.search).get('from') === 'bridge';
  let carry = null;
  try { carry = arrived ? JSON.parse(sessionStorage.getItem('crossing')) : null; } catch { /* nothing carried */ }
  sessionStorage.removeItem('crossing');
  const heatOver = LA && savedMission() >= storyList().reduce((n, e) => n + e.titles.length, 0); // after the runway, Los Angeles is Hanna's
  const local = NEXUS ? 'k' : LA ? (heatOver ? 'hanna' : 'neil') : 'tony', who = carry?.who || local;
  const tony = makeLook(who); // the player: Tony Soprano in Vice City, Neil McCauley in Los Angeles, or a visitor from across the water
  scene.add(tony.group);

  // ----- Game state shared with the mission scripts -----
  const pressed = new Set(), keys = {};
  const g = {
    scene, camera, hud, places, cars, peds,
    time: 0, cash: 0, started: false, night: 0, tonyCar, scare: -9,
    waiters: [], updaters: [], markers: [], blips: [], tracked: new Set(), missionActive: false,
    WASTED: Symbol('wasted'),
    player: { pos: new THREE.Vector3(places.home.spawn.x, 0, places.home.spawn.z), heading: 0, human: tony, car: null, locked: true, hidden: false, down: 0, motion: 'idle' },
    cam: { yaw: 0, pitch: 0.25, fixed: null, sway: 0, lastMouse: -10 },

    until(fn) { return new Promise((resolve, reject) => g.waiters.push({ fn, resolve, reject })); },
    // Everything a mission puts in the world goes through track(), so a failed mission can be cleared away.
    track(obj) { scene.add(obj); g.tracked.add(obj); return obj; },
    untrack(obj) { scene.remove(obj); g.tracked.delete(obj); },
    wait(seconds) { const t0 = g.time; return g.until(() => g.time - t0 >= seconds); },
    consume(code) { return pressed.delete(code); },
    // The calendar: a minute of the clock is a second of play, and each finished job moves it on (`dayBase`).
    dayBase: 0,
    day() { return Math.floor(g.dayBase + (18 * 60 + 30 + g.time + (g.clockOffset || 0)) / 1440); },
    addMoney(n) { g.cash += n; hud.money(g.cash); },

    addMarker(x, z, r, color = 0xff5fd2) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 2.4, 28, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.position.set(x, 1.2, z);
      scene.add(mesh);
      const m = { x, z, r, mesh, color: '#ff7adf' };
      g.markers.push(m);
      return m;
    },
    removeMarker(m) {
      scene.remove(m.mesh);
      g.markers.splice(g.markers.indexOf(m), 1);
    },

    enterCar(car) { p.car = car; car.nav = null; sfx.carDoor(); },
    spawnCar(x, z, heading, color, kind) {
      const car = new Car(scene, x, z, heading, color, kind);
      car.mission = g.missionActive;
      cars.push(car);
      return car;
    },
    removeCar(car) {
      if (p.car === car) g.leaveCar();
      car.remove(scene);
      cars.splice(cars.indexOf(car), 1);
    },
    // Play as someone else (Christopher has a mission of his own); the previous body is hidden.
    setPlayer(human) {
      p.human.group.visible = false;
      p.human = human;
      scene.add(human.group);
      g.become?.(human.look || 'someone'); // his own guns, his own money, his own trouble
    },
    // Where the player comes back to if he is killed during a mission: here, as he is now. Set whenever an objective
    // is given or met, and whenever somebody starts shooting.
    setCheckpoint() {
      if (!g.missionActive || p.dying) return;
      const at = p.car ? p.car.pos : p.pos;
      g.checkpoint = { x: at.x, z: at.z, h: p.car ? p.car.heading : p.heading, car: p.car, inside: p.inside, mag: { ...p.mag }, ammo: { ...p.ammo }, armour: p.armour };
    },
    // Killed in a mission that has a checkpoint: a moment of black, and he is back there, whole. The mission never knew.
    async revive() {
      const cp = g.checkpoint, wasLocked = p.locked;
      try {
        await g.wait(1.9);
        hud.wasted(true);
        await fade(1, 0.9);
        await g.wait(0.7);
        hud.wasted(false);
        if (p.inside !== cp.inside) { for (const h of p.inside?.hide || []) h.group.visible = true; for (const h of cp.inside?.hide || []) h.group.visible = false; p.inside = cp.inside; }
        if (cp.car && cars.includes(cp.car) && !cp.car.wreck) { cp.car.pos.set(cp.x, 0, cp.z); cp.car.heading = cp.h; cp.car.speed = 0; cp.car.hp = Math.max(cp.car.hp ?? 100, 60); cp.car.sync?.(); p.car = cp.car; p.pos.copy(cp.car.pos); }
        else { p.car = null; p.pos.set(cp.x, 0, cp.z); }
        p.heading = g.cam.yaw = cp.h;
        p.health = 100; p.armour = Math.max(p.armour, cp.armour); hud.health(100); hud.armour(p.armour);
        for (const w in cp.mag) { p.mag[w] = Math.max(p.mag[w], cp.mag[w]); p.ammo[w] = Math.max(p.ammo[w], cp.ammo[w]); } // never back with less than he had
        g.setWeapon(p.weapon, true);
        g.pardon();
        g.addMoney(-Math.min(g.cash, 100));
        Object.assign(p, { down: 0, dying: false, safeUntil: g.time + 3.5 });
        hud.checkpoint?.();
        await fade(0, 0.9);
      } catch { /* the mission ended under him */ }
      if (!wasLocked) p.locked = false;
    },
    // A car takes damage. One the story needs limps on at its worst; any other can be killed.
    hurtCar(car, dmg, bump = false) {
      if (car.wreck || dmg <= 0) return;
      const floor = car.mission || car === tonyCar ? 14 : bump ? 22 : 0; // a bystander's car that is only bumped smokes, and does not blow up in the street
      car.hp = Math.max(floor, (car.hp ?? 100) - dmg);
      if (car.hp <= 0) { car.wreck = true; car.dieAt = g.time + 5.5; car.nav = null; car.speed *= 0.5; if (car === p.car) hud.flash('#ff8a30', 0.4); }
    },
    // 0 = the usual sunset, 1 = night. Lights, fog, sky and sea follow.
    setNight(k) {
      g.night = k;
      k = LA ? 0.42 + k * 0.58 : k; // Los Angeles is lit like its film: blue dusk at its brightest
      hemi.intensity = 1.5 - k * 0.95; hemi.color.set(0xffd9ea).lerp(tmpColor.set(0x6f7fd0), k); hemi.groundColor.set(0x5d4c7c).lerp(tmpColor.set(0x1a1830), k);
      sun.intensity = 2.3 - k * 1.75; sun.color.set(0xffcf9e).lerp(tmpColor.set(0x9db4ff), k);
      scene.fog.color.set(LA ? 0xa8b4d6 : 0xf2a0b4).lerp(tmpColor.set(0x120f26), k);
      if (LA) { hemi.color.lerp(tmpColor.set(0xc8d6ff), 0.5); sun.color.lerp(tmpColor.set(0xffe6c8), 0.4); }
      if (NEXUS) { // no day on Nexus: a city that lights itself, under rain, in a haze the colour of rust
        hemi.intensity = 0.55; hemi.color.set(0x5a6a88); hemi.groundColor.set(0x2a1c14);
        sun.intensity = 0.5; sun.color.set(0x9fb0d0);
        scene.fog.color.set(0x1a1618); scene.fog.near = 60; scene.fog.far = 520;
      }
      places.setNight(k);
    },
    // The player is dead: every mission wait fails, and the mission (or free roam) respawns them.
    wasted() {
      if (p.dying) return;
      sfx.wasted();
      p.dying = true; p.down = 1;
      if (g.missionActive && g.checkpoint) { p.car = null; g.revive(); return; }
      p.car = null;
      const waiting = g.waiters;
      g.waiters = [];
      for (const w of waiting) w.reject(g.WASTED);
      if (!g.missionActive) g.respawn();
    },
    // Back at home, with everything a mission left behind cleared away.
    async respawn() {
      await g.wait(2.4);
      hud.wasted(true);
      await fade(1, 1.2);
      await g.wait(0.8);
      hud.wasted(false);
      for (const obj of g.tracked) scene.remove(obj);
      g.tracked.clear();
      for (const car of [...cars]) if (car.mission) g.removeCar(car);
      g.updaters = []; g.blips = [];
      for (const m of [...g.markers]) g.removeMarker(m);
      if (p.human !== tony) { const other = p.human; g.setPlayer(tony); scene.remove(other.group); }
      if (p.inside) { for (const h of p.inside.hide || []) h.group.visible = true; p.inside = null; }
      Object.assign(p, { car: null, hidden: false, locked: false, down: 0, pose: null, dying: false });
      g.cam.fixed = null; g.cam.sway = 0; g.cam.yaw = p.heading = 0;
      hud.panic(0); hud.era(false); hud.objective(); hud.subtitle(); hud.prompt(''); hud.card(); hud.passed();
      g.setNight(0);
      combat.reset();
      g.addMoney(-Math.min(g.cash, 500));
      p.pos.set(places.home.wake.x, 0, places.home.wake.z);
      tonyCar.pos.set(places.home.car.x, 0, places.home.car.z); tonyCar.heading = places.home.car.h; tonyCar.speed = 0; tonyCar.hp = 100;
      await fade(0, 1.2);
    },
    // Through a door, in or out. The rooms are built far out over the water.
    async useDoor(door) {
      if (p.locked || p.car) return;
      p.locked = true;
      sfx.door();
      try {
        await fade(1, 0.45);
        const going = p.inside ? null : door, to = going ? door.inside : door.outside;
        for (const h of door.hide || []) h.group.visible = !going;
        p.inside = going;
        p.pos.set(to.x, 0, to.z); p.heading = g.cam.yaw = to.h;
        await fade(0, 0.45);
      } catch { return; }
      p.locked = false;
    },
    // Step out on the driver's side (or at an explicit spot for cutscenes).
    leaveCar(at) {
      const car = p.car;
      if (!car) return;
      p.car = null;
      sfx.carDoor();
      if (at) p.pos.set(at.x, 0, at.z);
      else {
        const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
        p.pos.set(car.pos.x + lx * 2.1, 0, car.pos.z + lz * 2.1);
        if (pushOut(p.pos.clone(), 0.45)) p.pos.set(car.pos.x - lx * 2.1, 0, car.pos.z - lz * 2.1);
      }
      p.heading = car.heading;
    },
  };
  const p = g.player, tmpColor = new THREE.Color();
  let streamIndex = 0;
  // The radar's landmarks: home, the family's places, and whatever is useful.
  const landmarks = (NEXUS ? [
    { ...places.home.spawn, label: 'H', name: "K's flat", color: '#2f9c5a' }, { ...places.wallace.door, label: 'W', name: 'Wallace', color: '#ffb347' }, { ...places.precinct.door, label: 'P', name: 'Police HQ', color: '#2f56c8' },
    { ...places.hospital.door, label: '+', name: 'Morgue', color: '#8d8a8e' }, { ...places.stelline.door, label: 'S', name: 'Stelline Labs', color: '#dfeeff' }, { ...places.orphanage.door, label: 'O', name: 'Sector 6 salvage', color: '#8a4a2a' },
    { ...places.farm.gate, label: 'F', name: 'Protein farm', color: '#7a8a4a' }, { ...places.market.centre, label: 'N', name: 'Night market', color: '#ff3fa8' }, { ...places.bar.door, label: 'B', name: 'The bar', color: '#e0a12c' }, { ...places.airport.door, label: 'A', name: 'Spaceport', color: '#f4f2ee' },
  ] : LA ? [
    { ...places.home.spawn, label: 'H', name: who === 'hanna' ? "McCauley's house (empty)" : "Neil's house", color: '#2f9c5a' }, { ...places.bank.door, label: '$', name: 'Far East Pacific Bank', color: '#d9a520' }, { ...places.kates.door, label: 'K', name: "Kate's diner", color: '#ff5fd2' },
    { ...places.truckstop.door, label: 'T', name: 'Truck stop', color: '#1f6b4a' }, { ...places.precinct.door, label: 'P', name: 'Major Crimes', color: '#2f56c8' }, { ...places.hospital.door, label: '+', name: 'Hospital', color: '#d8342c' },
    { ...places.drivein.lot, label: 'D', name: 'Drive-in', color: '#49a0d0' }, { ...places.depository.gate, label: 'M', name: 'Metals depository', color: '#8d8a8e' }, { ...places.bookstore.door, label: 'B', name: 'Bookstore', color: '#8a6f8f' },
    { ...places.airport.door, label: 'A', name: 'Airport', color: '#f4f2ee' }, { ...places.bar.door, label: 'N', name: "Nate's bar", color: '#e0a12c' },
  ] : [
    { ...places.home.spawn, label: 'H', name: 'Home', color: '#2f9c5a' }, { ...places.bing.door, label: 'B', name: 'Bada Bing', color: '#ff5fd2' }, { ...places.satriale.door, label: 'S', name: "Satriale's", color: '#d8342c' },
    { ...places.melfi.door, label: 'M', name: 'Dr. Melfi', color: '#1f9c8f' }, { ...places.vesuvio.door, label: 'V', name: 'Vesuvio', color: '#e0a12c' }, { ...places.hesh.door, label: 'F', name: 'F-Note Records', color: '#49a0d0' },
    { ...places.hospital.door, label: '+', name: 'Hospital', color: '#2f56c8' }, { ...places.bodyshop.door, label: 'A', name: 'Auto body', color: '#8a1c1c' }, { ...places.cafe.door, label: 'C', name: 'Bean Scene', color: '#1f6b4a' },
    { ...places.livia.porch, label: 'L', name: "Livia's house", color: '#8a6f8f' }, { ...places.grove.gate, label: 'G', name: 'Green Grove', color: '#5f8a84' }, { ...places.motel.office, label: 'T', name: 'Motel', color: '#f08a3c' },
    { ...places.church?.door, label: '†', name: 'Church', color: '#f4f2ee' }, { ...places.gas?.pumps, label: 'P', name: 'Gas station', color: '#d8342c' }, { ...places.carlot?.lot, label: '$', name: 'Sunshine Autos', color: '#2f56c8' },
    { ...places.bridge.start, label: '⇄', name: `Bridge to ${LA ? 'Vice City' : 'Los Angeles'}`, color: '#8a2f2a' },
  ]).filter(l => l.x !== undefined);
  for (const d of places.gunShops || []) landmarks.push({ x: d.x, z: d.z, label: 'W', name: 'Guns', color: '#5c6157' });
  const fade = (to, seconds) => { hud.fade(to, seconds); return g.wait(seconds + 0.05); };
  const combat = installCombat(g, { scene, hud, peds, cars, keys });
  const sideJobs = installSideJobs(g);
  g.become(who);
  applySettings();
  g.who = who; g.visitor = who !== local; g.arrived = arrived;
  if (carry) { // the money, the guns and the bruises came too
    g.cash = carry.cash || 0; hud.money(g.cash);
    Object.assign(p.weapons, carry.weapons); Object.assign(p.mag, carry.mag); Object.assign(p.ammo, carry.ammo);
    p.armour = carry.armour || 0; hud.armour(p.armour); p.health = carry.health || 100; hud.health(p.health);
  }
  // Off the far end of the bridge: fade, and load the other island with everything in hand.
  const crossBridge = () => {
    if (g.crossing) return;
    g.crossing = true; p.locked = true;
    if (p.car) p.car.speed = Math.min(p.car.speed, 12);
    try {
      sessionStorage.setItem('crossing', JSON.stringify({ who: g.who, cash: g.cash, weapons: p.weapons, mag: p.mag, ammo: p.ammo, armour: p.armour, health: Math.max(20, p.health), car: p.car ? { kind: p.car.kind, color: p.car.color } : null }));
    } catch { /* cross with empty hands */ }
    if (!places.bridge) return;
    hud.card(places.bridge.there, 'Across the bridge');
    hud.fade(1, 1.4);
    setTimeout(() => { location.search = LA ? '?from=bridge' : '?city=la&from=bridge'; }, 1700);
  };
  g.sfx = sfx;
  window.game = g; // handy in the console
  g.renderer = renderer;

  // ----- Input -----
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (hud.onMenu) { if (!e.repeat) hud.onMenu(e.code); return; } // a menu is open: it gets the keys
    keys[e.code] = true;
    if (!e.repeat) pressed.add(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let dragging = false;
  canvas.addEventListener('mousedown', e => {
    dragging = true;
    if (e.button === 0 && g.started) { pressed.add('Mouse0'); keys.Mouse0 = true; }
    if (e.button === 2 && g.started) { pressed.add('Mouse2'); keys.Mouse2 = true; }
    if (g.started) try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* pointer lock unavailable: dragging still works */ }
  });
  addEventListener('mouseup', e => { dragging = false; if (e.button === 2) keys.Mouse2 = false; if (e.button === 0) keys.Mouse0 = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas && !dragging) return;
    if (g.paused) return;
    g.cam.yaw -= e.movementX * 0.0026 * settings.sens;
    g.cam.pitch = clamp(g.cam.pitch + e.movementY * 0.002 * settings.sens * (settings.invert ? -1 : 1), -0.05, 1.1);
    g.cam.lastMouse = g.time;
  });

  // ----- Title screen: orbit the city until Start is pressed -----
  g.cam.fixed = { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 10, 0) };
  g.updaters.push(() => {
    if (g.started) return false;
    g.cam.fixed.pos.set(Math.sin(g.time * 0.05) * 600, 150, Math.cos(g.time * 0.05) * 600);
    return true;
  });
  hud.fade(0, 1.2);
  // Each city has its own title, and a way across to the other.
  if (LA) { document.body.classList.add('la'); document.querySelector('.logo .sop').textContent = 'Heat'; document.querySelector('.logo .vc').textContent = 'Los Angeles'; document.title = 'Heat: Los Angeles'; g.setNight(0); }
  if (NEXUS) { document.body.classList.add('nexus'); document.querySelector('.logo .sop').textContent = 'Blade Runner'; document.querySelector('.logo .vc').textContent = 'Nexus'; document.title = 'Blade Runner: Nexus'; g.setNight(1); }
  const otherBtn = document.getElementById('other');
  if (otherBtn) { // (an old cached page may not have the button)
    otherBtn.textContent = LA ? 'Vice City · The Sopranos' : 'Los Angeles · Heat';
    otherBtn.addEventListener('click', () => { location.search = LA ? '' : '?city=la'; });
    const thirdBtn = document.getElementById('third');
    if (thirdBtn) { thirdBtn.textContent = NEXUS ? 'Vice City · The Sopranos' : 'Nexus · Blade Runner'; thirdBtn.addEventListener('click', () => { location.search = NEXUS ? '' : '?city=nexus'; }); }
  }
  const startBtn = document.getElementById('start');
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
  const begin = () => {
    if (g.started) return;
    sfx.unlock();
    g.started = true;
    document.getElementById('title').classList.add('off');
    hud.fade(1, 0.6);
    g.wait(0.7).then(() => runStory(g)).then(() => { g.storyDone = true; }).catch(err => console.error(err));
  };
  startBtn.addEventListener('click', begin);
  // Arriving over the bridge there is no title: the far end of the deck, the car you came in, and the island ahead.
  if (arrived) {
    g.started = true;
    document.getElementById('title').classList.add('off');
    hud.show(true);
    g.cam.fixed = null;
    const at = places.bridge.arrive, ride = carry?.car ? g.spawnCar(at.x, at.z, at.h, carry.car.color ?? 0x1d1d24, carry.car.kind) : null;
    p.pos.set(at.x, 0, at.z); p.heading = g.cam.yaw = at.h; p.locked = false;
    if (ride) { ride.mission = false; g.enterCar(ride); ride.speed = 12; }
    hud.fade(1, 0); hud.fade(0, 1.6);
    hud.card(NEXUS ? 'Nexus' : LA ? 'Los Angeles' : 'Vice City', g.visitor ? 'You are a long way from home' : 'Home');
    g.wait(3.5).then(() => { hud.card(); return g.visitor ? null : runStory(g); }).then(() => { g.storyDone = true; }).catch(err => console.error(err));
    addEventListener('pointerdown', () => sfx.unlock(), { once: true }); addEventListener('keydown', () => sfx.unlock(), { once: true });
  }
  // A saved game continues from its last mission; "New game" forgets it.
  const freshBtn = document.getElementById('fresh');
  if (savedMission() > 0) {
    startBtn.textContent = 'Continue';
    freshBtn.hidden = false;
    freshBtn.addEventListener('click', () => { clearSave(); begin(); });
  }
  // A mission picked from the settings menu: the page comes back straight into it.
  if (sessionStorage.getItem('jump') && !arrived) { sessionStorage.removeItem('jump'); begin(); }

  // ----- Per-frame systems -----
  const tmp = new THREE.Vector3(), focus = new THREE.Vector3(), want = new THREE.Vector3();
  const circlesOf = car => {
    const fx = Math.sin(car.heading) * (car.reach - 0.1), fz = Math.cos(car.heading) * (car.reach - 0.1);
    return [[car.pos.x + fx, car.pos.z + fz], [car.pos.x - fx, car.pos.z - fz]];
  };

  function updatePlayer(dt) {
    const car = p.car;
    if (car) {
      const up = keys.ShiftLeft || keys.ShiftRight, down = keys.ControlLeft || keys.ControlRight;
      const flying = car.kind === 'spinner' && (car.alt > 0.5 || (!p.locked && up));
      if (flying) { // a spinner: Shift climbs, Ctrl sinks (as the helicopters in the games this is modelled on); it stays up until it is brought down
        car.lift = p.locked ? -1 : (up ? 1 : 0) - (down ? 1 : 0);
        car.fly(dt, p.locked ? 0 : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), p.locked ? 0 : (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0), car.lift);
        if (car.alt > 0.5) { const before = car.pos.clone(); if (pushOutAbove(car.pos, car.reach, car.alt + groundAt(car.pos.x, car.pos.z) + 0.5)) { const jolt = before.distanceTo(car.pos) * 8; if (jolt > 1) { sfx.crash(Math.min(1, jolt / 10)); g.hurtCar(car, jolt * 2); car.speed *= 0.3; } } }
      }
      if (p.locked || car.wreck) { if (!flying) car.drive(dt, 0, 0, true); }
      else if (!flying) car.drive(dt, (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0), keys.Space);
      const wasGoing = car.speed;
      if (!flying) car.collide();
      const jolt = Math.abs(wasGoing - car.speed);
      if (jolt > 2.5) { sfx.crash(jolt / 12); g.hurtCar(car, (jolt - 2.5) * 2.6); }
      if (!p.locked && g.consume('KeyH')) sfx.horn();
      // Shove other cars out of the way.
      for (const o of cars) {
        if (o === car || Math.abs((o.alt || 0) - (car.alt || 0)) > 1.6 || Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z) > 6) continue; // (a spinner overhead touches nothing on the road)
        let hit = false;
        for (const [ax, az] of circlesOf(car)) for (const [bx, bz] of circlesOf(o)) {
          const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz);
          if (d >= 2.1 || d < 1e-4) continue;
          const push = (2.1 - d) / d;
          car.pos.x += dx * push * 0.6; car.pos.z += dz * push * 0.6;
          o.pos.x -= dx * push * 0.4; o.pos.z -= dz * push * 0.4;
          hit = true;
        }
        if (hit) { if (Math.abs(car.speed) > 6 && g.time - (car.bumpAt || -9) > 0.6) { car.bumpAt = g.time; sfx.crash(Math.abs(car.speed) / 25); g.hurtCar(car, Math.abs(car.speed) * 0.18); g.hurtCar(o, Math.abs(car.speed) * 0.6, true); /* the one doing the ramming comes off better */ } car.speed *= 0.93; if (!o.nav) o.collide(); }
      }
      p.pos.copy(car.pos);
      // The body shop puts it right.
      const shop = LA ? places.parts?.kerb : places.bodyshop?.kerb, fix = shop && (car.hp ?? 100) < 95 && !car.wreck && near(car.pos, shop, 9) && Math.abs(car.speed) < 3 && !g.missionActive;
      // And with the police after him, it does more: in one colour, out another, and nobody is looking for this car.
      const hot = shop && g.wanted >= 1 && !car.wreck && near(car.pos, shop, 13) && Math.abs(car.speed) < 3 && !g.spraying && !p.locked;
      hud.prompt(car.wreck ? 'The engine is dead.   F  ·  Get out' : hot ? `R  ·  Respray: lose the police ($${g.cash >= 250 ? 250 : 'not enough'})` : fix ? `R  ·  Repair the car ($${g.cash >= 150 ? 150 : 'not enough'})` : '');
      if (hot && g.cash >= 250 && g.consume('KeyR')) {
        g.spraying = true;
        g.addMoney(-250); sfx.cash();
        g.pardon();                                           // the doors are down behind him: they have lost him
        const PAINT = [0x2f56c8, 0x1f6b4a, 0x8a1c2a, 0xf4f4f0, 0x23232b, 0xd9a520, 0x49e0d0, 0x8a5cff, 0xcdb98a], hex = PAINT[Math.floor(Math.random() * PAINT.length)];
        const bay = !LA && places.bodyshop ? { x: places.bodyshop.door.x, z: places.bodyshop.door.z + 3 } : null;
        (bay ? respray(g, car, bay, 0, hex, 'New paint, new plates. Nobody is looking for this car.')
          : (async () => { p.locked = true; hud.fade(1, 0.6); await g.wait(1.4); sfx.spray?.(); car.repaint(hex); await g.wait(1.2); hud.fade(0, 0.6); p.locked = false; })())
          .then(() => { car.hp = 100; g.pardon(); }).catch(() => {}).finally(() => { g.spraying = false; p.locked = false; });
      } else if (fix && g.cash >= 150 && g.consume('KeyR')) { g.addMoney(-150); car.hp = 100; sfx.cash(); }
      if (g.wanted >= 1 && !g.toldSpray && shop) { g.toldSpray = true; hud.subtitle('', `The ${LA ? 'parts store' : 'body shop'} will respray the car for $250. The police lose you. It is marked on the map.`); g.wait(5).then(() => { if (!g.missionActive) hud.subtitle(); }).catch(() => {}); }
      if (!p.locked && g.consume('KeyF') && Math.abs(car.speed) < 4) { g.leaveCar(); g.doorBehind?.(car); }
      return;
    }

    const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    p.motion = 'idle';
    // A jump: up, over, and down again, the legs tucked.
    if (!p.locked && !p.jumping && g.consume('Space')) { p.jumping = true; p.jumpV = 4.4; p.jumpY = 0; p.human.play('jumpStart', 'jumpLoop', 1.6); }
    if (p.jumping) {
      p.jumpY += p.jumpV * dt; p.jumpV -= 12.5 * dt;
      if (p.jumpY <= 0) { p.jumpY = 0; p.jumping = false; p.human.play('jumpLand', 'idle', 1.6); }
    }
    if (!p.locked && (mx || mz)) {
      const s = Math.sin(g.cam.yaw), c = Math.cos(g.cam.yaw);
      let vx = s * mz - c * mx, vz = c * mz + s * mx;
      const n = Math.hypot(vx, vz), speed = keys.ShiftLeft || keys.ShiftRight ? 7.6 : 3.7;
      vx /= n; vz /= n;
      p.pos.x += vx * speed * dt; p.pos.z += vz * speed * dt;
      if (p.weapon !== 'pistol' && !g.lockTarget) p.heading += wrapAngle(Math.atan2(vx, vz) - p.heading) * (1 - Math.exp(-12 * dt));
      p.motion = speed > 5 ? 'sprint' : 'run';
    }
    if (p.aiming) p.heading = g.cam.yaw; // armed and free-aiming, Tony faces where the camera looks
    pushOut(p.pos, 0.45);
    for (const ped of peds) { // the crowd is solid; sprinting into someone knocks them aside
      if (ped.dead || Math.abs(ped.pos.x - p.pos.x) > 2 || Math.abs(ped.pos.z - p.pos.z) > 2) continue;
      const dx = p.pos.x - ped.pos.x, dz = p.pos.z - ped.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-4) { p.pos.x = ped.pos.x + dx / d * 0.75; p.pos.z = ped.pos.z + dz / d * 0.75; if (p.motion === 'sprint') ped.shove(p.pos); }
    }
    for (const o of cars) {
      if ((o.alt || 0) > 1.6 || Math.abs(o.pos.x - p.pos.x) > 5 || Math.abs(o.pos.z - p.pos.z) > 5) continue;
      for (const [cx, cz] of circlesOf(o)) {
        const dx = p.pos.x - cx, dz = p.pos.z - cz, d = Math.hypot(dx, dz);
        if (d < 1.6 && d > 1e-4) { p.pos.x = cx + dx / d * 1.6; p.pos.z = cz + dz / d * 1.6; }
      }
    }

    const door = !p.locked && places.doors.find(d => !d.closed?.() && (p.inside ? d === p.inside && near(p.pos, d.inside, 1.8) : near(p.pos, d.outside, 1.8)));
    if (door) {
      hud.prompt(p.inside ? 'F  ·  Leave' : `F  ·  Enter ${door.name}`);
      if (g.consume('KeyF')) g.useDoor(door);
      return;
    }
    const stair = !p.locked && p.inside && (places.stairs || []).find(s => near(p.pos, s.a, 1.4) || near(p.pos, s.b, 1.4));
    if (stair) { // between the floors of a house
      const up = near(p.pos, stair.a, 1.4);
      hud.prompt(`F  ·  ${up ? stair.up : stair.down}`);
      if (g.consume('KeyF')) {
        p.locked = true; sfx.door();
        fade(1, 0.35).then(() => { const to = up ? stair.b : stair.a; p.pos.set(to.x, 0, to.z); p.heading = g.cam.yaw = to.h; return fade(0, 0.35); }).then(() => { p.locked = false; }).catch(() => {});
      }
      return;
    }
    let nearest = null, best = 4.2;
    if (!p.locked && !p.inside) for (const o of cars) {
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (d < best && !o.wreck && (o.alt || 0) < 1.6) { best = d; nearest = o; }
    }
    hud.prompt(nearest ? (nearest.nav || nearest.ai ? 'F  ·  Take vehicle' : 'F  ·  Enter vehicle') : '');
    if (nearest && g.consume('KeyF')) { hud.prompt(''); if (nearest.nav || nearest.ai) g.carjack(nearest); else g.boardCar(nearest); }
  }

  const honk = car => { if (Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 45 && !p.inside) sfx.horn(0.6 + Math.random() * 0.6); };
  function updateCars(dt) {
    const obstacles = cars.filter(c => (c.alt || 0) < 1.6).map(c => c.pos); // traffic does not brake for something flying over it
    if (!p.car && !p.hidden) obstacles.push(p.pos);
    for (const car of cars) {
      if (car.ai) { car.spinWheels(dt); continue; } // driven by combat.js
      if (car.nav) driveAI(car, dt, obstacles, honk);
      else if (car !== p.car && Math.abs(car.speed) > 0.01) { car.drive(dt, 0, 0, true); car.collide(); }
      car.spinWheels(dt);
      car.sync();
    }
  }

  // Smoke from a car that has been knocked about, fire from one that is finished, and then the bang.
  const smokeGeo = new THREE.SphereGeometry(0.5, 7, 5), smokers = new Map();
  function updateDamage(dt) {
    for (const car of cars) {
      const hp = car.hp ?? 100;
      if (hp >= 60 || Math.abs(car.pos.x - p.pos.x) > 110 || Math.abs(car.pos.z - p.pos.z) > 110) { const old = smokers.get(car); if (old) { scene.remove(old); smokers.delete(car); } continue; }
      let puffs = smokers.get(car);
      if (!puffs) {
        puffs = new THREE.Group();
        for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0x8d8a8e, transparent: true, opacity: 0.4, depthWrite: false })); m.userData.t = k / 5; puffs.add(m); }
        scene.add(puffs); smokers.set(car, puffs);
      }
      const nose = car.reach * 0.8, dark = hp < 35 ? 0x2a2630 : 0x9a968e;
      puffs.position.set(car.pos.x + Math.sin(car.heading) * nose, groundAt(car.pos.x, car.pos.z) + 1, car.pos.z + Math.cos(car.heading) * nose);
      for (const m of puffs.children) {
        m.userData.t = (m.userData.t + dt * (car.wreck ? 0.9 : 0.55)) % 1;
        const t = m.userData.t;
        m.position.set(Math.sin(t * 9 + m.id) * 0.25 * t, t * (car.wreck ? 3.4 : 2.2), -t * Math.min(2, Math.abs(car.speed) * 0.12));
        m.scale.setScalar(0.35 + t * (hp < 35 ? 1.5 : 0.9));
        m.material.opacity = (1 - t) * (hp < 35 ? 0.6 : 0.34);
        m.material.color.set(car.wreck && t < 0.25 ? 0xff8a30 : dark);
      }
    }
    for (const car of [...cars]) {
      if (!car.wreck || !car.dieAt || g.time < car.dieAt) continue;
      car.dieAt = 0; car.goneAt = g.time + 45;
      explode(g, car.pos);
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      if (p.car === car) { g.leaveCar(); p.health = Math.max(0, p.health - 80); hud.health(p.health); hud.flash('#ff8a30', 0.6); if (p.health <= 0) g.wasted(); }
      else if (d < 8) g.damagePlayer(70 * (1 - d / 8), car.pos);
      for (const ped of peds) if (!ped.dead && Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 7) ped.hurt(200, car.pos, { knock: 1.5, down: true });
    }
    for (const car of [...cars]) if (car.wreck && car.goneAt && g.time > car.goneAt && car !== p.car && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) > 60) { const old = smokers.get(car); if (old) { scene.remove(old); smokers.delete(car); } g.removeCar(car); }
  }

  // Pull the camera in when a building is between it and the player.
  function clearRatio(from, to) {
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t, z = from.z + (to.z - from.z) * t;
      for (const c of colliders) {
        if (!c.thin && y < c.h && x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4) return Math.max(0.25, (i - 1) / 12);
      }
    }
    return 1;
  }

  function updateCamera(dt) {
    const cam = g.cam;
    if (cam.fixed) {
      camera.position.copy(cam.fixed.pos);
      camera.lookAt(cam.fixed.look);
      focus.copy(cam.fixed.look);
      return;
    }
    if (keys.ArrowLeft) cam.yaw += 1.8 * dt;
    if (keys.ArrowRight) cam.yaw -= 1.8 * dt;
    const car = p.car;
    // Behind a moving car, drift back to the chase view once the mouse is left alone.
    if (car && car.speed > 3 && g.time - cam.lastMouse > 1.2) cam.yaw += wrapAngle(car.heading - cam.yaw) * (1 - Math.exp(-3 * dt));
    const aiming = p.aiming && !car;
    const dist = car ? 6.2 + car.reach * 2.5 : aiming ? 2.6 : 5.2, cp = Math.cos(cam.pitch);
    focus.set(p.pos.x, (car ? 1.9 + (car.alt || 0) : aiming ? 1.5 : 1.6) + groundAt(p.pos.x, p.pos.z), p.pos.z); // (a spinner in the air takes the camera up with it)
    if (aiming) { focus.x -= Math.cos(cam.yaw) * 0.75; focus.z += Math.sin(cam.yaw) * 0.75; } // over the right shoulder
    tmp.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    want.copy(focus).addScaledVector(tmp, dist);
    const clear = car && car.alt > 2 ? 1 : clearRatio(focus, want); // (nothing to hide behind up there)
    want.copy(focus).addScaledVector(tmp, dist * clear);
    if (want.y < 0.5) want.y = 0.5;
    camera.position.lerp(want, 1 - Math.exp(-14 * dt));
    if (cam.sway) {
      camera.position.x += Math.sin(g.time * 2.3) * 0.25 * cam.sway;
      camera.position.y += Math.sin(g.time * 3.1) * 0.15 * cam.sway;
    }
    if (aiming) { tmp.set(Math.sin(cam.yaw) * cp, -Math.sin(cam.pitch) * 0.6, Math.cos(cam.yaw) * cp); camera.lookAt(tmp.multiplyScalar(12).add(focus)); } // the crosshair is where the gun points
    else camera.lookAt(focus);
    if (cam.sway) camera.rotation.z += Math.sin(g.time * 1.7) * 0.08 * cam.sway;
  }

  // Advance the simulation by dt seconds and draw. Exposed as game.step for debugging.
  // The settings, as a menu; the game waits while it is open.
  // Every mission, a chapter to a page. Picking one puts the save there and starts the page again at it.
  const missionMenu = current => {
    const story = storyList(), starts = [];
    let n = 0;
    for (const e of story) { starts.push(n); n += e.titles.length; }
    let page = Math.max(0, starts.findLastIndex(s => s <= current));
    const show = () => {
      const e = story[page], KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
      const items = [
        { label: `${e.name}: ${e.title}`, hint: `page ${page + 1} of ${story.length}` },
        ...e.titles.map((t, k) => ({ key: KEYS[k], label: t, hint: starts[page] + k === current ? 'you are here' : '' })),
        ...(page > 0 ? [{ key: 'KeyQ', label: 'Previous chapter' }] : []), ...(page < story.length - 1 ? [{ key: 'KeyE', label: 'Next chapter' }] : []),
        { key: 'Escape', label: 'Back' },
      ];
      hud.menu('Missions', items, code => {
        const k = KEYS.indexOf(code);
        if (code === 'KeyQ' && page > 0) { page--; show(); }
        else if (code === 'KeyE' && page < story.length - 1) { page++; show(); }
        else if (code === 'Escape') openSettings();
        else if (k >= 0 && k < e.titles.length) { jumpTo(starts[page] + k, g.cash); sessionStorage.setItem('jump', '1'); sessionStorage.setItem('straight', '1'); location.reload(); }
      });
    };
    show();
  };
  // A list too long for one screen, a page at a time: the people met so far, or what each mission paid.
  const pages = (title, rows, empty) => {
    let page = 0;
    const per = 9, n = Math.max(1, Math.ceil(rows.length / per));
    const show = () => hud.menu(`${title}${n > 1 ? `  ·  ${page + 1} of ${n}` : ''}`, [
      ...(rows.length ? rows.slice(page * per, page * per + per) : [{ label: empty }]),
      ...(page > 0 ? [{ key: 'KeyQ', label: 'Previous page' }] : []), ...(page < n - 1 ? [{ key: 'KeyE', label: 'Next page' }] : []), { key: 'Escape', label: 'Back' },
    ], code => { if (code === 'KeyQ' && page > 0) { page--; show(); } else if (code === 'KeyE' && page < n - 1) { page++; show(); } else if (code === 'Escape') openSettings(); });
    show();
  };
  const openSettings = () => {
    g.paused = true;
    const pr = g.progress, story = !pr ? 'Not started' : pr.done ? `All ${pr.total} missions complete` : `${pr.episode}: ${pr.title}  ·  mission ${pr.k} of ${pr.of}, "${pr.mission}"`;
    const show = () => hud.menu('Settings', [
      { label: 'Story', hint: story }, ...(pr && !pr.done ? [{ label: 'Overall', hint: `${pr.n - 1} of ${pr.total} missions done` }] : []),
      { key: 'Digit1', label: 'Volume', hint: `${Math.round(settings.volume * 100)}%  (1 lower, 2 higher)` }, { key: 'Digit2', label: '' },
      { key: 'Digit3', label: 'Mouse sensitivity', hint: `${settings.sens.toFixed(1)}  (3 lower, 4 higher)` }, { key: 'Digit4', label: '' },
      { key: 'Digit5', label: 'Invert mouse Y', hint: settings.invert ? 'on' : 'off' },
      { key: 'Digit6', label: 'Crowd', hint: ['light', 'normal', 'heavy'][settings.crowd] },
      { key: 'Digit7', label: 'Shadows', hint: settings.shadows ? 'on' : 'off' },
      { key: 'Digit9', label: 'Ambient sound', hint: ['off', 'quiet', 'normal', 'loud'][settings.ambience] },
      { key: 'KeyR', label: 'Radio', hint: sfx.radio.count ? `${sfx.radio.count} songs  ·  ${['off', 'quiet', 'normal', 'loud'][settings.radio]}  ·  in the car: N next, B back, V off` : 'no songs yet: put audio files in the music folder' },
      { key: 'KeyT', label: 'Test the sound', hint: settings.volume === 0 ? 'the volume is at 0%' : sfx.state === 'running' ? 'plays a chime: if you hear nothing, it is the browser or the computer' : 'the browser is holding the sound back: click the page once' },
      { key: 'Digit8', label: 'Missions', hint: 'play any mission again, or skip ahead' },
      { key: 'KeyP', label: 'People', hint: `${people(g).length} met so far` },
      { key: 'KeyL', label: 'Earnings', hint: `$${Object.values(g.ledger || {}).reduce((a, r) => a + r.m, 0).toLocaleString('en-US')} from ${Object.keys(g.ledger || {}).length} missions` },
      { key: 'Escape', label: 'Resume' },
      { key: 'Digit0', label: 'Quit to the title screen', hint: 'progress is saved after each mission' },
    ].filter(i => i.label), code => {
      if (code === 'Digit1') settings.volume = Math.max(0, +(settings.volume - 0.1).toFixed(1));
      else if (code === 'Digit2') settings.volume = Math.min(1, +(settings.volume + 0.1).toFixed(1));
      else if (code === 'Digit3') settings.sens = Math.max(0.3, +(settings.sens - 0.1).toFixed(1));
      else if (code === 'Digit4') settings.sens = Math.min(3, +(settings.sens + 0.1).toFixed(1));
      else if (code === 'Digit5') settings.invert = !settings.invert;
      else if (code === 'Digit6') { settings.crowd = (settings.crowd + 1) % 3; crowdLimit(); }
      else if (code === 'Digit7') settings.shadows = !settings.shadows;
      else if (code === 'Digit9') settings.ambience = (settings.ambience + 1) % 4;
      else if (code === 'KeyT') { sfx.unlock(); sfx.passed(); }
      else if (code === 'KeyR') settings.radio = (settings.radio + 1) % 4;
      else if (code === 'Digit8') { applySettings(); missionMenu(pr && !pr.done ? pr.n - 1 : 0); return; }
      else if (code === 'KeyP') { pages('People', people(g).map(x => ({ label: x.name, hint: x.role })), 'Nobody yet.'); return; }
      else if (code === 'KeyL') { pages('Earnings', Object.entries(g.ledger || {}).sort((a, b) => a[0] - b[0]).map(([n, r]) => ({ label: `${n}.  ${r.t}`, hint: '$' + r.m.toLocaleString('en-US') })), 'Nothing yet: every mission pays when it is passed.'); return; }
      else if (code === 'Digit0') { applySettings(); location.reload(); return; }
      else if (code === 'Escape' || code === 'Enter') { applySettings(); hud.menu(); g.paused = false; for (const k in keys) keys[k] = false; return; }
      else return;
      applySettings(); show();
    });
    show();
  };
  g.openSettings = openSettings;

  // ----- Sound: what kind of place the listener is in -----
  const GREEN = new Set(['houses', 'park', 'church', 'home', 'livia', 'grove', 'neil', 'college', 'school', 'manor', 'motel', 'drivein']);
  const DENSE = new Set(['tower', 'lots', 'lowrise', 'bank', 'hotel', 'precinct', 'bookstore', 'depository', 'hesh', 'cafe', 'vesuvio', 'satriale', 'melfi', 'bing', 'travel', 'hospital', 'kates', 'truckstop']);
  const ROOM_SOUND = { BAR: 'bar', DINER: 'diner', FASTFOOD: 'diner', VESUVIO: 'diner', VKITCHEN: 'diner', BEAN: 'diner', BANQUET: 'diner', LIQUOR: 'store', PAWN: 'store', STORE: 'store', KIOSK: 'store', BOOKS: 'store', PARTS: 'store',
    LAUNDRY: 'store', SHOWROOM: 'hall', GUNS: 'guns', CHURCH: 'church', BODYSHOP: 'garage', WAREHOUSE: 'garage', HOUSE: 'house', LIVIA: 'house', LIVIA_UP: 'house', BRENDAN: 'house', CHRIS: 'house', NEIL: 'house', UPSTAIRS: 'house', CARDROOM: 'house', SUITE: 'house', MOTEL: 'house',
    JUSTINE: 'house', VANZANT: 'house', TREJO: 'house', KELSO: 'house', OFFICE: 'office', FNOTE: 'office', HESH: 'office', SCHOOL: 'hall', HOSPITAL: 'hall', WARDHALL: 'hall', GROVE: 'hall', BANK: 'hall', HOTEL: 'hall' };
  const roomKinds = new Map();
  const roomKind = q => {
    if (!roomKinds.has(q)) {
      const key = Object.keys(places.rooms).find(k => places.rooms[k] === q), at = o => o && roomAt(o.inside?.x ?? o.x, o.inside?.z ?? o.z, 1) === q;
      roomKinds.set(q, key ? ROOM_SOUND[key] || 'plain' : at(places.bingRoom) || at(places.bingVip) ? 'bar' : at(places.office) ? 'office' : at(places.houseRoom) ? 'house' : at(places.wardRoom) ? 'ward' : 'plain');
    }
    return roomKinds.get(q);
  };
  sfx.place(places.sounds || []);
  // The player's own songs and recordings, if he has put any in the folders beside the game.
  sfx.radio.onChange = title => hud.radio(title);
  sfx.radio.load(); sfx.loadRecordings();
  const muteEl = document.getElementById('mute');

  function step(dt) {
    if (g.paused) { if (!g.skipRender) renderer.render(scene, camera); pressed.clear(); return; }
    if (g.started && g.consume('Escape')) { openSettings(); pressed.clear(); return; }
    if (g.started && g.consume('KeyM')) g.mapOpen = !g.mapOpen;
    if (g.started && p.car) { // the radio's buttons
      if (g.consume('KeyN')) sfx.radio.next(1);
      if (g.consume('KeyB')) sfx.radio.next(-1);
      if (g.consume('KeyV')) hud.radio(sfx.radio.toggle() ? sfx.radio.title || 'Radio on' : 'Radio off');
    }
    if (places.bridge && g.started && !p.locked && !p.inside && (p.pos.x - places.bridge.far.x) * places.bridge.dir > 0 && Math.abs(p.pos.z - places.bridge.far.z) < 12) crossBridge();
    g.time += dt;

    updatePlayer(dt);
    updateCars(dt);
    updateDamage(dt);
    combat.update(dt);
    sideJobs.update();
    const scare = g.time - g.scare < 1 && !p.hidden ? p.pos : null;
    Ped.eye = camera.position;
    peds.forEach((ped, i) => {
      if (ped.parked) return;
      ped.update(dt, cars, scare);
      if (ped.dead && ped.diedAt > 20) { // the dead are replaced by someone new on another block
        scene.remove(ped.human.group);
        peds[i] = new Ped(scene, blockNear(p.pos, 240), rand);
      }
    });
    // The crowd and the traffic keep to the part of the city the player is in: whoever is left far
    // behind turns up again on a block or a road ahead, out of sight.
    const far = p.car ? 380 : 260;
    if (!p.inside) for (let k = 0; k < 2; k++) {
      const ped = peds[(streamIndex++) % peds.length];
      if (!ped.dead && !ped.npc && ped.flight <= 0 && Math.hypot(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z) > far) ped.relocate(blockNear(p.pos, 210), rand);
      const car = cars[(streamIndex * 7) % cars.length];
      if (car.nav && !car.mission && !car.ai && car !== p.car && !car.nav.goal && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) > far + 60) {
        const c = blockNear(p.pos, 260), i = Math.round((c.x - CELL / 2 - nodeX(0)) / CELL), j = Math.round((c.z - CELL / 2 - nodeZ(0)) / CELL);
        roam(car, clamp(i, 0, NX), clamp(j, 0, NZ), Math.floor(rand() * 4), 8 + rand() * 4);
      }
    }
    if (p.health <= 0 && !p.dying) g.wasted();
    if (p.inside && Math.hypot(p.pos.x - p.inside.inside.x, p.pos.z - p.inside.inside.z) > 40) { // a mission moved Tony outside
      for (const h of p.inside.hide || []) h.group.visible = true;
      p.inside = null;
    }

    g.updaters = g.updaters.filter(fn => fn(dt));
    g.waiters = g.waiters.filter(w => { if (!w.fn()) return true; w.resolve(); return false; });

    const me = p.human;
    me.group.visible = !p.car && !p.hidden;
    me.group.position.set(p.pos.x, groundAt(p.pos.x, p.pos.z) + (p.jumpY || 0), p.pos.z);
    me.group.rotation.y = p.heading;
    if (p.down) me.set('down');
    else if (p.jumping) { if (!me.busy) me.set('jumpLoop'); }
    else if (!me.busy) me.set(p.pose || (p.car || p.locked ? 'idle' : p.motion === 'idle' ? (p.fighting && p.weapon === 'fist' ? 'guard' : 'idle') : p.motion));
    // The arms: aiming while the legs stand or run, or a gesture in a scene.
    const raised = !p.car && !p.locked && !p.hidden && !p.down && !p.jumping && !p.onPhone && (p.aiming || (g.lockTarget && p.weapon !== 'fist'));
    me.layer(raised ? 'aim' : p.topPose || null);

    for (const m of g.markers) m.mesh.material.opacity = 0.3 + Math.sin(g.time * 4) * 0.1;

    updateCamera(dt);
    places.lightRoom(roomAt(camera.position.x, camera.position.z, 3));
    updatePeople(dt, camera.position);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 200);
    places.sky.position.copy(camera.position);
    places.update(g.time);
    { // Lights on the cars after dark: beams on the road from everything near, and the spot on his own.
      const dark = Math.max(0, Math.min(1, (g.night - 0.35) / 0.4));
      for (const car of cars) { const b = car.mesh.userData.beam; if (!b) continue; const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z); b.material.opacity = d < 160 && !car.wreck && (car.nav || car.ai || car === p.car || car.mission) ? dark * 0.32 : 0; }
      if (p.car) { if (headLight.parent !== p.car.mesh) p.car.mesh.add(headLight); headLight.intensity = dark * 90 * (p.car.wreck ? 0 : 1); } else headLight.intensity = 0;
    }

    // Once the story is told, the days turn on their own: dark from a quarter past eight until a quarter to six.
    if (g.storyDone && !g.missionActive) {
      const minute = (18 * 60 + 30 + g.time + (g.clockOffset || 0)) % 1440, dusk = 20 * 60 + 15, dawn = 5 * 60 + 45;
      const want = minute > dusk ? Math.min(1, (minute - dusk) / 30) : minute < dawn ? 1 : Math.max(0, 1 - (minute - dawn) / 30);
      if (Math.abs(want - g.night) > 0.003) g.setNight(g.night + (want - g.night) * (1 - Math.exp(-dt * 0.6)));
    }
    { // What the listener hears: he stands where the player does, or at the camera when a scene has put it somewhere else.
      const room = roomAt(camera.position.x, camera.position.z, 3) || (p.inside ? roomAt(p.pos.x, p.pos.z, 1) : undefined), look = camera.getWorldDirection(tmp), ll = Math.hypot(look.x, look.z) || 1;
      // The rooms are built out over the water, a long way from their doors: what comes through a room's wall is the street its door is on.
      const ear = room ? p.inside?.outside || (roomAt(p.pos.x, p.pos.z, 3) ? places.home.spawn : p.pos) : g.cam.fixed ? camera.position : p.pos;
      // The nearest water: the island has a shore on every side.
      const edges = [[SHORE - ear.x, 1, 0, 1], [ear.x - (OX - ROAD / 2), -1, 0, 0.4], [ear.z - (OZ - ROAD / 2), 0, -1, 0.4], [OZ + NZ * CELL + ROAD / 2 - ear.z, 0, 1, 0.4]].sort((a, b) => a[0] / a[3] - b[0] / b[3])[0]; // the surf is on the east; the other three sides are quiet water
      const surface = surfaceAt(ear.x, ear.z), deck = groundAt(ear.x, ear.z) > 0.3 && (surface === 'wood' || ear.x > SHORE + 30 || ear.x < OX - 40);
      const kind = places.kinds?.[Math.floor((ear.x - OX) / CELL) + ',' + Math.floor((ear.z - OZ) / CELL)];
      const near4 = [];
      for (const c of cars) {
        if (c === p.car || Math.abs(c.speed) < 1.5) continue;
        const dx = c.pos.x - ear.x, dz = c.pos.z - ear.z, d2 = dx * dx + dz * dz;
        if (d2 < 4900) near4.push({ dx, dz, d2, speed: c.speed, heavy: c.kind === 'truck' || c.kind === 'van' || c.kind === 'armored' || c.kind === 'ambulance' });
      }
      near4.sort((a, b) => a.d2 - b.d2); near4.length = Math.min(4, near4.length);
      sfx.ambience({
        inCar: !!p.car, speed: p.car ? p.car.speed : 0, throttle: p.car && !p.locked ? (keys.KeyW ? 1 : keys.KeyS ? 0.5 : 0) : 0,
        sliding: p.car && !p.locked ? (keys.Space && Math.abs(p.car.speed) > 5 ? 1 : (keys.KeyA || keys.KeyD) && Math.abs(p.car.speed) > 17 ? 0.5 : 0) : 0,
        police: g.sirenLevel || 0, night: g.night, la: LA || NEXUS, rain: NEXUS ? 1 : 0,
        ear, right: { x: -look.z / ll, z: look.x / ll }, room: room ? roomKind(room) : null,
        surface, foot: !p.car && !p.hidden && !p.locked && p.motion && p.motion !== 'idle' ? (p.motion === 'sprint' ? 7.6 : 3.7) : 0,
        shore: clamp(1 - edges[0] / 140, 0, 1) * edges[3], seaward: { x: edges[1], z: edges[2] }, exposed: deck ? 1 : 0,
        green: GREEN.has(kind) ? 1 : kind ? 0.15 : 0.4, dense: kind ? (DENSE.has(kind) ? 1 : GREEN.has(kind) ? 0.25 : 0.55) : 0.1,
        hour: Math.floor(((18 * 60 + 30 + g.time + (g.clockOffset || 0)) % 1440) / 60), cars: near4,
      });
    }
    muteEl.classList.toggle('on', g.started && sfx.state !== 'running'); // say so, rather than leave him wondering
    hud.clock(g.time + (g.clockOffset || 0), g.day());
    hud.radar(p.pos, p.car ? p.car.heading : p.heading, [...g.markers, ...g.blips, ...(g.hostiles || [])], landmarks);
    hud.map(g.mapOpen, { focus: p.pos, heading: p.car ? p.car.heading : p.heading, blips: [...g.markers, ...g.blips], landmarks });
    { // How far to where he is going, and which way, beside the objective. And the state of the car he is in.
      const m = g.markers.slice().sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0]; // the nearest, when there are several calls to make
      if (m && !p.hidden && !g.cam.fixed) {
        const dx = m.x - p.pos.x, dz = m.z - p.pos.z, d = Math.hypot(dx, dz), turn = wrapAngle(Math.atan2(dx, dz) - g.cam.yaw);
        hud.distance(d < m.r + 1 ? '' : `${'↑↖←↙↓↘→↗'[(Math.round(turn / (Math.PI / 4)) + 8) % 8]} ${d < 1000 ? Math.round(d / 5) * 5 + ' m' : (d / 1000).toFixed(1) + ' km'}`);
      } else hud.distance('');
      hud.car(p.car ? p.car.hp ?? 100 : null);
    }

    if (!g.skipRender) renderer.render(scene, camera);
    pressed.clear();
  }
  g.step = step;
  g.keys = keys;

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    step(Math.min(clock.getDelta(), 0.05));
  }
  frame();
}

boot();
