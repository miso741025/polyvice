import * as THREE from 'three';
import { NX, NZ, ROAD, nodeX, nodeZ, blockCenter, colliders, pushOut, clamp, wrapAngle, mulberry32 } from './grid.js';
import { buildWorld } from './world.js';
import { makeTony, Car, Ped, spawnTraffic, driveAI, loadPeople, updatePeople } from './entities.js';
import { Hud } from './hud.js';
import { runStory } from './missions.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2a0b4, 140, 800);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1900);

scene.add(new THREE.HemisphereLight(0xffd9ea, 0x5d4c7c, 1.5));
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
  const tonyCar = new Car(scene, places.home.car.x, places.home.car.z, places.home.car.h, 0x7a1626, 'suv');
  const cars = [tonyCar, ...spawnTraffic(scene, 16, rand)];
  const parkedColors = [0xffffff, 0x29c7c0, 0xff5fa8, 0xffd23f, 0xd9342b, 0x8ecbff];
  for (let n = 0; n < 14; n++) {
    const off = (rand() - 0.5) * 36, far = ROAD / 2 - 1.2, color = parkedColors[n % parkedColors.length];
    if (rand() < 0.5) { // on a north-south road, facing south on the west kerb
      const i = Math.floor(rand() * (NX + 1)), j = Math.floor(rand() * NZ);
      cars.push(new Car(scene, nodeX(i) - far, blockCenter(0, j).z + off, 0, color));
    } else { // on an east-west road, facing east on the south kerb
      const i = Math.floor(rand() * NX), j = Math.floor(rand() * (NZ + 1));
      cars.push(new Car(scene, blockCenter(i, 0).x + off, nodeZ(j) + far, Math.PI / 2, color));
    }
  }

  // ----- Pedestrians -----
  const peds = [];
  for (let n = 0; n < 30; n++) {
    let i, j;
    do { i = Math.floor(rand() * NX); j = Math.floor(rand() * NZ); } while (i === 0 && j === 0);
    peds.push(new Ped(scene, blockCenter(i, j), rand));
  }

  const tony = makeTony();
  scene.add(tony.group);

  // ----- Game state shared with the mission scripts -----
  const pressed = new Set(), keys = {};
  const g = {
    scene, camera, hud, places, cars, peds,
    time: 0, cash: 0, started: false,
    waiters: [], updaters: [], markers: [], blips: [],
    player: { pos: new THREE.Vector3(places.home.spawn.x, 0, places.home.spawn.z), heading: 0, human: tony, car: null, locked: true, hidden: false, down: 0, motion: 'idle' },
    cam: { yaw: 0, pitch: 0.25, fixed: null, sway: 0, lastMouse: -10 },

    until(fn) { return new Promise(resolve => g.waiters.push({ fn, resolve })); },
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
  const p = g.player;
  window.game = g; // handy in the console

  // ----- Input -----
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!e.repeat) pressed.add(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let dragging = false;
  canvas.addEventListener('mousedown', () => {
    dragging = true;
    if (g.started) try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* pointer lock unavailable: dragging still works */ }
  });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas && !dragging) return;
    g.cam.yaw -= e.movementX * 0.0026;
    g.cam.pitch = clamp(g.cam.pitch + e.movementY * 0.002, -0.05, 1.1);
    g.cam.lastMouse = g.time;
  });

  // ----- Title screen: orbit the city until Start is pressed -----
  g.cam.fixed = { pos: new THREE.Vector3(), look: new THREE.Vector3(60, 10, 40) };
  g.updaters.push(() => {
    if (g.started) return false;
    g.cam.fixed.pos.set(60 + Math.sin(g.time * 0.05) * 330, 95, 40 + Math.cos(g.time * 0.05) * 330);
    return true;
  });
  hud.fade(0, 1.2);
  const startBtn = document.getElementById('start');
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
  startBtn.addEventListener('click', () => {
    if (g.started) return;
    g.started = true;
    document.getElementById('title').classList.add('off');
    hud.fade(1, 0.6);
    g.wait(0.7).then(() => runStory(g)).catch(err => console.error(err));
  });

  // ----- Per-frame systems -----
  const tmp = new THREE.Vector3(), focus = new THREE.Vector3(), want = new THREE.Vector3();
  const circlesOf = car => {
    const fx = Math.sin(car.heading) * 1.2, fz = Math.cos(car.heading) * 1.2;
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
      p.heading += wrapAngle(Math.atan2(vx, vz) - p.heading) * (1 - Math.exp(-12 * dt));
      p.motion = speed > 5 ? 'sprint' : 'run';
    }
    pushOut(p.pos, 0.45);
    for (const o of cars) {
      if (Math.abs(o.pos.x - p.pos.x) > 5 || Math.abs(o.pos.z - p.pos.z) > 5) continue;
      for (const [cx, cz] of circlesOf(o)) {
        const dx = p.pos.x - cx, dz = p.pos.z - cz, d = Math.hypot(dx, dz);
        if (d < 1.6 && d > 1e-4) { p.pos.x = cx + dx / d * 1.6; p.pos.z = cz + dz / d * 1.6; }
      }
    }

    let nearest = null, best = 4.2;
    if (!p.locked) for (const o of cars) {
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (d < best) { best = d; nearest = o; }
    }
    hud.prompt(nearest ? 'F  ·  Enter vehicle' : '');
    if (nearest && g.consume('KeyF')) { g.enterCar(nearest); hud.prompt(''); }
  }

  function updateCars(dt) {
    const obstacles = cars.map(c => c.pos);
    if (!p.car && !p.hidden) obstacles.push(p.pos);
    for (const car of cars) {
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
        if (!c.thin && y < c.h && x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4) return Math.max(0.12, (i - 1) / 12);
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
    const dist = car ? 9.5 : 5.2, cp = Math.cos(cam.pitch);
    focus.set(p.pos.x, car ? 1.9 : 1.6, p.pos.z);
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
    for (const ped of peds) ped.update(dt, cars);

    g.updaters = g.updaters.filter(fn => fn(dt));
    g.waiters = g.waiters.filter(w => { if (!w.fn()) return true; w.resolve(); return false; });

    tony.group.visible = !p.car && !p.hidden;
    tony.group.position.set(p.pos.x, 0, p.pos.z);
    tony.group.rotation.y = p.heading;
    tony.set(p.down ? 'down' : p.car || p.locked ? 'idle' : p.motion);

    for (const m of g.markers) m.mesh.material.opacity = 0.3 + Math.sin(g.time * 4) * 0.1;

    updateCamera(dt);
    updatePeople(dt, camera.position);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 200);
    places.sky.position.copy(camera.position);

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
