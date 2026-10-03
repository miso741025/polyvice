import * as THREE from 'three';
import { NX, NZ, ROAD, CELL, nodeX, nodeZ, blockCenter, colliders, pushOut, groundAt, roomAt, clamp, wrapAngle, near, mulberry32 } from './grid.js';
import { buildWorld } from './world.js';
import { makeTony, Car, Ped, spawnTraffic, driveAI, roam, loadPeople, updatePeople } from './entities.js';
import { Hud } from './hud.js';
import { runStory, savedMission, clearSave } from './missions.js';
import { installCombat } from './combat.js';

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
  const places = buildWorld(scene);

  // ----- Cars: Tony's SUV, parked cars at the kerb, traffic -----
  const g_scenery = [];
  const tonyCar = new Car(scene, places.home.car.x, places.home.car.z, places.home.car.h, 0x7a1626, 'suv');
  const cars = [tonyCar, ...spawnTraffic(scene, 38, rand)];
  const parkedColors = [0xffffff, 0x29c7c0, 0xff5fa8, 0xffd23f, 0xd9342b, 0x8ecbff, 0xf08a3c, 0x7d5cff, 0x1d1d24];
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

  places.bing.parking.forEach((spot, n) => cars.push(new Car(scene, spot.x, spot.z, spot.h, parkedColors[(n + 2) % parkedColors.length], parkedKinds[(n + 1) % parkedKinds.length])));
  places.parkedSpots.forEach((spot, n) => cars.push(new Car(scene, spot.x, spot.z, spot.h, spot.kind === 'truck' ? 0xf2f0ea : parkedColors[(n * 5 + 1) % parkedColors.length], spot.kind)));
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
  const peds = [];
  for (let n = 0; n < 68; n++) peds.push(new Ped(scene, blockNear(places.home.spawn, 260), rand));

  const tony = makeTony();
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

    enterCar(car) { p.car = car; car.nav = null; },
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
    },
    // 0 = the usual sunset, 1 = night. Lights, fog, sky and sea follow.
    setNight(k) {
      g.night = k;
      hemi.intensity = 1.5 - k * 0.95; hemi.color.set(0xffd9ea).lerp(tmpColor.set(0x6f7fd0), k); hemi.groundColor.set(0x5d4c7c).lerp(tmpColor.set(0x1a1830), k);
      sun.intensity = 2.3 - k * 1.75; sun.color.set(0xffcf9e).lerp(tmpColor.set(0x9db4ff), k);
      scene.fog.color.set(0xf2a0b4).lerp(tmpColor.set(0x120f26), k);
      places.setNight(k);
    },
    // The player is dead: every mission wait fails, and the mission (or free roam) respawns them.
    wasted() {
      if (p.dying) return;
      p.dying = true; p.down = 1; p.car = null;
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
      hud.panic(0); hud.objective(); hud.subtitle(); hud.prompt(''); hud.card(); hud.passed();
      g.setNight(0);
      combat.reset();
      g.addMoney(-Math.min(g.cash, 500));
      p.pos.set(places.home.wake.x, 0, places.home.wake.z);
      tonyCar.pos.set(places.home.car.x, 0, places.home.car.z); tonyCar.heading = places.home.car.h; tonyCar.speed = 0;
      await fade(0, 1.2);
    },
    // Through a door, in or out. The rooms are built far out over the water.
    async useDoor(door) {
      if (p.locked || p.car) return;
      p.locked = true;
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
  const fade = (to, seconds) => { hud.fade(to, seconds); return g.wait(seconds + 0.05); };
  const combat = installCombat(g, { scene, hud, peds, cars, keys });
  window.game = g; // handy in the console
  g.renderer = renderer;

  // ----- Input -----
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!e.repeat) pressed.add(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let dragging = false;
  canvas.addEventListener('mousedown', e => {
    dragging = true;
    if (e.button === 0 && g.started) pressed.add('Mouse0');
    if (e.button === 2 && g.started) { pressed.add('Mouse2'); keys.Mouse2 = true; }
    if (g.started) try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* pointer lock unavailable: dragging still works */ }
  });
  addEventListener('mouseup', e => { dragging = false; if (e.button === 2) keys.Mouse2 = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas && !dragging) return;
    g.cam.yaw -= e.movementX * 0.0026;
    g.cam.pitch = clamp(g.cam.pitch + e.movementY * 0.002, -0.05, 1.1);
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
  const startBtn = document.getElementById('start');
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
  const begin = () => {
    if (g.started) return;
    g.started = true;
    document.getElementById('title').classList.add('off');
    hud.fade(1, 0.6);
    g.wait(0.7).then(() => runStory(g)).catch(err => console.error(err));
  };
  startBtn.addEventListener('click', begin);
  // A saved game continues from its last mission; "New game" forgets it.
  const freshBtn = document.getElementById('fresh');
  if (savedMission() > 0) {
    startBtn.textContent = 'Continue';
    freshBtn.hidden = false;
    freshBtn.addEventListener('click', () => { clearSave(); begin(); });
  }

  // ----- Per-frame systems -----
  const tmp = new THREE.Vector3(), focus = new THREE.Vector3(), want = new THREE.Vector3();
  const circlesOf = car => {
    const fx = Math.sin(car.heading) * (car.reach - 0.1), fz = Math.cos(car.heading) * (car.reach - 0.1);
    return [[car.pos.x + fx, car.pos.z + fz], [car.pos.x - fx, car.pos.z - fz]];
  };

  function updatePlayer(dt) {
    const car = p.car;
    if (car) {
      if (p.locked) car.drive(dt, 0, 0, true);
      else car.drive(dt, (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0), keys.Space);
      car.collide();
      // Shove other cars out of the way.
      for (const o of cars) {
        if (o === car || Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z) > 6) continue;
        let hit = false;
        for (const [ax, az] of circlesOf(car)) for (const [bx, bz] of circlesOf(o)) {
          const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz);
          if (d >= 2.1 || d < 1e-4) continue;
          const push = (2.1 - d) / d;
          car.pos.x += dx * push * 0.6; car.pos.z += dz * push * 0.6;
          o.pos.x -= dx * push * 0.4; o.pos.z -= dz * push * 0.4;
          hit = true;
        }
        if (hit) { car.speed *= 0.93; if (!o.nav) o.collide(); }
      }
      p.pos.copy(car.pos);
      if (!p.locked && g.consume('KeyF') && Math.abs(car.speed) < 4) g.leaveCar();
      return;
    }

    const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    p.motion = 'idle';
    if (!p.locked && (mx || mz)) {
      const s = Math.sin(g.cam.yaw), c = Math.cos(g.cam.yaw);
      let vx = s * mz - c * mx, vz = c * mz + s * mx;
      const n = Math.hypot(vx, vz), speed = keys.ShiftLeft || keys.ShiftRight ? 7.6 : 3.7;
      vx /= n; vz /= n;
      p.pos.x += vx * speed * dt; p.pos.z += vz * speed * dt;
      if (p.weapon !== 'pistol' && !g.lockTarget) p.heading += wrapAngle(Math.atan2(vx, vz) - p.heading) * (1 - Math.exp(-12 * dt));
      p.motion = speed > 5 ? 'sprint' : 'run';
    }
    if (p.weapon === 'pistol' && !p.locked && !g.lockTarget) p.heading = g.cam.yaw; // armed and free-aiming, Tony faces where the camera looks
    pushOut(p.pos, 0.45);
    for (const o of cars) {
      if (Math.abs(o.pos.x - p.pos.x) > 5 || Math.abs(o.pos.z - p.pos.z) > 5) continue;
      for (const [cx, cz] of circlesOf(o)) {
        const dx = p.pos.x - cx, dz = p.pos.z - cz, d = Math.hypot(dx, dz);
        if (d < 1.6 && d > 1e-4) { p.pos.x = cx + dx / d * 1.6; p.pos.z = cz + dz / d * 1.6; }
      }
    }

    const door = !p.locked && places.doors.find(d => (p.inside ? d === p.inside && near(p.pos, d.inside, 1.8) : near(p.pos, d.outside, 1.8)));
    if (door) {
      hud.prompt(p.inside ? 'F  ·  Leave' : `F  ·  Enter ${door.name}`);
      if (g.consume('KeyF')) g.useDoor(door);
      return;
    }
    let nearest = null, best = 4.2;
    if (!p.locked && !p.inside) for (const o of cars) {
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (d < best) { best = d; nearest = o; }
    }
    hud.prompt(nearest ? (nearest.nav || nearest.ai ? 'F  ·  Take vehicle' : 'F  ·  Enter vehicle') : '');
    if (nearest && g.consume('KeyF')) { hud.prompt(''); if (nearest.nav || nearest.ai) g.carjack(nearest); else g.enterCar(nearest); }
  }

  function updateCars(dt) {
    const obstacles = cars.map(c => c.pos);
    if (!p.car && !p.hidden) obstacles.push(p.pos);
    for (const car of cars) {
      if (car.ai) { car.spinWheels(dt); continue; } // driven by combat.js
      if (car.nav) driveAI(car, dt, obstacles);
      else if (car !== p.car && Math.abs(car.speed) > 0.01) { car.drive(dt, 0, 0, true); car.collide(); }
      car.spinWheels(dt);
      car.sync();
    }
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
    const dist = car ? 6.2 + car.reach * 2.5 : 5.2, cp = Math.cos(cam.pitch);
    focus.set(p.pos.x, (car ? 1.9 : 1.6) + groundAt(p.pos.x, p.pos.z), p.pos.z);
    tmp.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    want.copy(focus).addScaledVector(tmp, dist);
    const clear = clearRatio(focus, want);
    want.copy(focus).addScaledVector(tmp, dist * clear);
    if (want.y < 0.5) want.y = 0.5;
    camera.position.lerp(want, 1 - Math.exp(-14 * dt));
    if (cam.sway) {
      camera.position.x += Math.sin(g.time * 2.3) * 0.25 * cam.sway;
      camera.position.y += Math.sin(g.time * 3.1) * 0.15 * cam.sway;
    }
    camera.lookAt(focus);
    if (cam.sway) camera.rotation.z += Math.sin(g.time * 1.7) * 0.08 * cam.sway;
  }

  // Advance the simulation by dt seconds and draw. Exposed as game.step for debugging.
  function step(dt) {
    g.time += dt;

    updatePlayer(dt);
    updateCars(dt);
    combat.update(dt);
    const scare = g.time - g.scare < 1 && !p.hidden ? p.pos : null;
    peds.forEach((ped, i) => {
      ped.update(dt, cars, scare);
      if (ped.dead && ped.diedAt > 20) { // the dead are replaced by someone new on another block
        scene.remove(ped.human.group);
        peds[i] = new Ped(scene, blockNear(p.pos, 240), rand);
      }
    });
    // The crowd and the traffic keep to the part of the city the player is in: whoever is left far
    // behind turns up again on a block or a road ahead, out of sight.
    const far = p.car ? 420 : 300;
    if (!p.inside) for (let k = 0; k < 2; k++) {
      const ped = peds[(streamIndex++) % peds.length];
      if (!ped.dead && !ped.npc && ped.flight <= 0 && Math.hypot(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z) > far) ped.relocate(blockNear(p.pos, 240), rand);
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
    me.group.position.set(p.pos.x, groundAt(p.pos.x, p.pos.z), p.pos.z);
    me.group.rotation.y = p.heading;
    if (p.down) me.set('down');
    else if (!me.busy) me.set(p.pose || (p.car || p.locked ? 'idle' : p.motion === 'idle' && p.weapon === 'pistol' ? 'aim' : p.motion));

    for (const m of g.markers) m.mesh.material.opacity = 0.3 + Math.sin(g.time * 4) * 0.1;

    updateCamera(dt);
    places.lightRoom(roomAt(camera.position.x, camera.position.z, 3));
    updatePeople(dt, camera.position);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 200);
    places.sky.position.copy(camera.position);
    places.update(g.time);

    hud.clock(g.time);
    hud.radar(p.pos, p.car ? p.car.heading : p.heading, [...g.markers, ...g.blips]);

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
