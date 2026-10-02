import * as THREE from 'three';
import { NX, NZ, ROAD, LANE, nodeX, nodeZ, clamp, wrapAngle, pushOut } from './grid.js';
import { makeHuman, makeLook, makeTony, LOOKS, loadPeople, updatePeople } from './people.js';

// Headings: an angle h means "facing (sin h, cos h)" in (x, z); local +z of a mesh is its front.

export function box(w, h, d, color, basic = false) {
  const mat = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

// ---------- People ----------
// The character model lives in people.js; re-exported here for the modules that build scenes.
export { makeHuman, makeLook, makeTony, LOOKS, loadPeople, updatePeople };

export function makeDuck() {
  const group = new THREE.Group();
  const add = (m, x, y, z, parent = group) => { m.position.set(x, y, z); parent.add(m); return m; };
  add(box(0.34, 0.24, 0.6, 0x8a6a45), 0, 0.12, 0);
  add(box(0.18, 0.2, 0.2, 0x1f6b3f), 0, 0.36, 0.26);
  add(box(0.1, 0.05, 0.14, 0xf2b632), 0, 0.33, 0.42);
  const wing = side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 0.2, 0);
    add(box(0.5, 0.04, 0.34, 0x6e5335), side * 0.25, 0, 0, pivot);
    pivot.visible = false;
    group.add(pivot);
    return pivot;
  };
  return { group, wingL: wing(1), wingR: wing(-1) };
}

// A handful of street outfits; pedestrians sharing one also share its painted texture.
const PED_LOOKS = [
  { shirt: 0xff5fd2, tee: true, pants: 0xf5f0e6, hair: 0x2b1b12, hairMesh: 'parted' },
  { shirt: 0x49e0d0, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'buzzed', dark: true },
  { shirt: 0xffe066, tee: true, pants: 0x3b6ea8, hair: 0x7a3b1a, hairMesh: 'parted' },
  { jacket: 0xf5f0e6, shirt: 0x49e0d0, tee: true, pants: 0xf5f0e6, tucked: true, hair: 0xc9a14a, hairMesh: 'parted' },
  { pattern: 'plaid', shirt: 0x8d93cc, pants: 0xd9c7a0, hair: 0xdddddd, hairStyle: 'balding' },
  { shirt: 0xff8a5c, tee: true, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'buzzed', dark: true },
  { body: 'female', shirt: 0xff5fd2, tee: true, pants: 0xf5f0e6, hair: 0x2b1b12, hairMesh: 'long' },
  { body: 'female', shirt: 0xffffff, tee: true, pants: 0x3b6ea8, hair: 0xc9a14a, hairMesh: 'long' },
  { body: 'female', jacket: 0x8f7bff, shirt: 0xffffff, pants: 0x8f7bff, tucked: true, hair: 0x7a3b1a, hairMesh: 'long' },
  { body: 'female', shirt: 0x4fb8ff, tee: true, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'long' },
];
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// A pedestrian who walks laps around the sidewalk of one block.
export class Ped {
  constructor(scene, center, rand) {
    this.c = center; this.s = 27.6;
    this.u = rand() * 8 * this.s;
    this.dir = rand() < 0.5 ? 1 : -1;
    this.speed = 1.2 + rand() * 0.6;
    this.human = makeHuman({ ...pick(PED_LOOKS, rand), bulk: 0.9 + Math.floor(rand() * 4) * 0.1 });
    this.pos = new THREE.Vector3();
    this.down = 0;
    scene.add(this.human.group);
  }

  update(dt, cars) {
    const g = this.human.group;
    if (this.down > 0) {
      this.down -= dt;
      return;
    }
    const s = this.s, L = 8 * s;
    this.u = ((this.u + this.dir * this.speed * dt) % L + L) % L;
    const side = Math.floor(this.u / (2 * s)), t = this.u - side * 2 * s - s;
    let x, z, h;
    if (side === 0) { x = t; z = -s; h = Math.PI / 2; }
    else if (side === 1) { x = s; z = t; h = 0; }
    else if (side === 2) { x = -t; z = s; h = -Math.PI / 2; }
    else { x = -s; z = -t; h = Math.PI; }
    this.pos.set(this.c.x + x, 0, this.c.z + z);
    this.human.set('walk', this.speed / 1.4);
    g.position.set(this.pos.x, 0.14, this.pos.z);
    g.rotation.y = this.dir > 0 ? h : h + Math.PI;

    for (const car of cars) {
      if (Math.abs(car.speed) > 3 && Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z) < 1.8) {
        this.down = 9;
        this.human.set('down');
        break;
      }
    }
  }
}

// ---------- Cars ----------

function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const suv = kind === 'suv';
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const bodyH = suv ? 0.8 : 0.55, cabL = suv ? 3.0 : 2.2, cabZ = suv ? -0.45 : -0.25, top = 0.36 + bodyH;
  add(box(1.9, bodyH, 4.4, color), 0, 0.36 + bodyH / 2, 0);
  add(box(1.72, 0.5, cabL, 0x18202e), 0, top + 0.25, cabZ);
  add(box(1.76, 0.08, cabL - 0.15, color), 0, top + 0.54, cabZ);
  add(box(1.95, 0.14, 0.2, 0xc9c9cf), 0, 0.42, 2.2);
  add(box(1.95, 0.14, 0.2, 0xc9c9cf), 0, 0.42, -2.2);
  for (const x of [-0.62, 0.62]) {
    add(box(0.38, 0.16, 0.06, 0xfff3bf, true), x, 0.36 + bodyH * 0.7, 2.21);
    add(box(0.38, 0.14, 0.06, 0xff2a3c, true), x, 0.36 + bodyH * 0.7, -2.21);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141418 });
  g.userData.wheels = [];
  for (const x of [-0.93, 0.93]) for (const z of [-1.4, 1.4]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.37, z); w.castShadow = true;
    g.add(w); g.userData.wheels.push(w);
  }
  return g;
}

const probe = new THREE.Vector3();

export class Car {
  constructor(scene, x, z, heading, color, kind = 'sedan') {
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading; this.speed = 0; this.kind = kind;
    this.nav = null; // set for traffic cars driven by the AI
    this.mesh = makeCarMesh(color, kind);
    scene.add(this.mesh);
    this.sync();
  }

  drive(dt, throttle, steer, handbrake) {
    const top = this.kind === 'suv' ? 29 : 32;
    if (throttle > 0) this.speed += (this.speed < 0 ? 30 : 15 * (1 - this.speed / top)) * dt;
    else if (throttle < 0) this.speed -= (this.speed > 0.5 ? 30 : 9 * (1 + this.speed / 11)) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.5 * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 32 * dt);
    this.heading += steer * clamp(this.speed / 5, -1, 1) * (2.3 / (1 + Math.abs(this.speed) / 28)) * dt;
    this.move(dt);
  }

  move(dt) {
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
  }

  // Keep the car out of buildings; bounce on a head-on hit, scrape along otherwise.
  collide() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let px = 0, pz = 0;
    for (const o of [1.3, -1.3]) {
      probe.set(this.pos.x + fx * o, 0, this.pos.z + fz * o);
      const bx = probe.x, bz = probe.z;
      if (pushOut(probe, 1.05)) { px += probe.x - bx; pz += probe.z - bz; }
    }
    const len = Math.hypot(px, pz);
    if (len < 1e-6) return;
    this.pos.x += px; this.pos.z += pz;
    const into = (px * fx + pz * fz) / len * Math.sign(this.speed || 1);
    this.speed *= into < -0.5 ? -0.2 : 0.97;
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  spinWheels(dt) {
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt / 0.37;
  }
}

// ---------- Traffic AI ----------
// Traffic follows the road grid: drive to the entry of the next intersection, pick a turn,
// drive to that turn's exit point, repeat. Steering toward those points gives smooth turns.

const DIRS = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }];
const rightOf = d => ({ x: -d.z, z: d.x });
const validNode = (i, j) => i >= 0 && i <= NX && j >= 0 && j <= NZ;
const edge = ROAD / 2 + 3;
const entryPoint = (i, j, d) => { const r = rightOf(d); return { x: nodeX(i) + r.x * LANE - d.x * edge, z: nodeZ(j) + r.z * LANE - d.z * edge }; };
const exitPoint = (i, j, d) => { const r = rightOf(d); return { x: nodeX(i) + r.x * LANE + d.x * edge, z: nodeZ(j) + r.z * LANE + d.z * edge }; };

const TRAFFIC_COLORS = [0xffffff, 0x29c7c0, 0xff5fa8, 0xffd23f, 0x1d1d24, 0xd9342b, 0x8ecbff, 0xf08a3c, 0x7d5cff];

export function spawnTraffic(scene, count, rand) {
  const cars = [], used = new Set();
  let guard = 0;
  while (cars.length < count && guard++ < 500) {
    const i = Math.floor(rand() * (NX + 1)), j = Math.floor(rand() * (NZ + 1)), di = Math.floor(rand() * 4), d = DIRS[di];
    const key = `${i},${j},${di}`;
    if (!validNode(i + d.x, j + d.z) || used.has(key)) continue;
    used.add(key);
    const r = rightOf(d);
    const x = (nodeX(i) + nodeX(i + d.x)) / 2 + r.x * LANE, z = (nodeZ(j) + nodeZ(j + d.z)) / 2 + r.z * LANE;
    const car = new Car(scene, x, z, Math.atan2(d.x, d.z), pick(TRAFFIC_COLORS, rand), rand() < 0.2 ? 'suv' : 'sedan');
    car.nav = { ni: i + d.x, nj: j + d.z, dir: di, phase: 'entry', target: entryPoint(i + d.x, j + d.z, d), cruise: 8 + rand() * 4, stuck: 0, ignore: 0 };
    cars.push(car);
  }
  return cars;
}

function advance(nav) {
  if (nav.phase === 'entry') {
    const back = (nav.dir + 2) % 4;
    let options = [0, 1, 2, 3].filter(k => k !== back && validNode(nav.ni + DIRS[k].x, nav.nj + DIRS[k].z));
    if (!options.length) options = [back];
    // Prefer going straight so traffic flows instead of circling a block.
    nav.next = options.includes(nav.dir) && Math.random() < 0.55 ? nav.dir : options[Math.floor(Math.random() * options.length)];
    nav.target = exitPoint(nav.ni, nav.nj, DIRS[nav.next]);
    nav.phase = 'exit';
  } else {
    nav.dir = nav.next;
    nav.ni += DIRS[nav.dir].x; nav.nj += DIRS[nav.dir].z;
    nav.target = entryPoint(nav.ni, nav.nj, DIRS[nav.dir]);
    nav.phase = 'entry';
  }
}

// obstacles: positions ({x, z}) of everything this car should brake for.
export function driveAI(car, dt, obstacles) {
  const nav = car.nav;
  let dx = nav.target.x - car.pos.x, dz = nav.target.z - car.pos.z;
  if (Math.hypot(dx, dz) < 3.5) {
    advance(nav);
    dx = nav.target.x - car.pos.x; dz = nav.target.z - car.pos.z;
  }
  const diff = wrapAngle(Math.atan2(dx, dz) - car.heading);
  car.heading += clamp(diff, -2.2 * dt, 2.2 * dt);

  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let blocked = false;
  if (nav.ignore > 0) nav.ignore -= dt;
  else {
    for (const o of obstacles) {
      if (o === car.pos) continue;
      const vx = o.x - car.pos.x, vz = o.z - car.pos.z;
      const ahead = vx * fx + vz * fz;
      if (ahead > 0.5 && ahead < 9 && Math.abs(vx * fz - vz * fx) < 2) { blocked = true; break; }
    }
    // Gridlock breaker: after waiting a while, nudge through.
    if (blocked) { nav.stuck += dt; if (nav.stuck > 6) { nav.ignore = 2; nav.stuck = 0; } } else nav.stuck = 0;
  }
  const want = blocked ? 0 : Math.abs(diff) > 0.4 ? 5 : nav.cruise;
  car.speed += clamp(want - car.speed, -20 * dt, 6 * dt);
  car.move(dt);
}
