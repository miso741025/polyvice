import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, NX, NZ, ROAD, LANE, CELL, nodeX, nodeZ, clamp, wrapAngle, pushOut, pushOutAbove, groundAt } from './grid.js';
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
  const part = (geo, color, x, y, z, parent = group) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z); parent.add(m);
    return m;
  };
  part(new THREE.SphereGeometry(0.2, 10, 8).scale(0.85, 0.65, 1.5), 0x8a6a45, 0, 0.12, 0);       // body
  part(new THREE.ConeGeometry(0.1, 0.22, 6).rotateX(-2.2), 0x6e5335, 0, 0.2, -0.3);              // tail
  part(new THREE.CylinderGeometry(0.055, 0.07, 0.16, 8), 0xe9e4da, 0, 0.27, 0.2);                // neck ring
  part(new THREE.SphereGeometry(0.1, 10, 8), 0x1f6b3f, 0, 0.38, 0.24);                           // head
  part(new THREE.ConeGeometry(0.045, 0.14, 6).rotateX(Math.PI / 2).scale(1.5, 0.6, 1), 0xf2b632, 0, 0.36, 0.39);
  const wing = side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.2, 0);
    part(new THREE.SphereGeometry(0.2, 8, 6).scale(1.3, 0.12, 0.85), 0x6e5335, side * 0.25, 0, 0, pivot);
    pivot.visible = false;
    group.add(pivot);
    return pivot;
  };
  return { group, wingL: wing(1), wingR: wing(-1) };
}

// A handful of street outfits; pedestrians sharing one also share its painted texture.
const PED_LOOKS = [
  { shirt: 0xff5fd2, tee: true, pants: 0xf5f0e6, shoes: 0xf2efe8, hair: 0x2b1b12, hairMesh: 'parted', stubble: 0.3 },
  { shirt: 0x49e0d0, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'buzzed', dark: true, glasses: 'shades' },
  { shirt: 0xffe066, tee: true, pants: 0x3b6ea8, shoes: 0xf2efe8, hair: 0x7a3b1a, hairMesh: 'parted', face: { nose: 0.5, cheeks: 0.5 } },
  { jacket: 0xf5f0e6, shirt: 0x49e0d0, tee: true, pants: 0xf5f0e6, tucked: true, shoes: 0xe9e4da, hair: 0xc9a14a, hairMesh: 'parted', glasses: 'shades', stubble: 0.4 },
  { pattern: 'plaid', shirt: 0x8d93cc, pants: 0xd9c7a0, hair: 0xdddddd, hairStyle: 'balding', age: 0.9, mustache: 0xd0d0d0, face: { jaw: 0.1, chin: 0.6 } },
  { shirt: 0xff8a5c, tee: true, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'buzzed', dark: true, goatee: 0x141110 },
  { pattern: 'palms', shirt: 0xe0563f, pants: 0xf5f0e6, shoes: 0x8a5a3a, hair: 0x2b1b12, hairStyle: 'receding', mustache: 0x2b1b12, age: 0.5, face: { jaw: 0.15, cheeks: 0.8, chin: 0.8 } },
  { jacket: 0xff9ecb, shirt: 0xffffff, tee: true, pants: 0xffffff, tucked: true, shoes: 0xf2efe8, hair: 0x3a2a1c, hairMesh: 'parted', hairScale: [1.03, 1.1, 1.05], glasses: 'shades' },
  { body: 'female', shirt: 0xff5fd2, tee: true, pants: 0xf5f0e6, shoes: 0xf2efe8, hair: 0x2b1b12, hairMesh: 'long' },
  { body: 'female', shirt: 0xffffff, tee: true, pants: 0x3b6ea8, hair: 0xc9a14a, hairMesh: 'long', glasses: 'shades' },
  { body: 'female', jacket: 0x8f7bff, shirt: 0xffffff, pants: 0x8f7bff, tucked: true, hair: 0x7a3b1a, hairMesh: 'long' },
  { body: 'female', shirt: 0x4fb8ff, tee: true, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'long', dark: true },
  { body: 'female', pattern: 'palms', shirt: 0xe0563f, pants: 0xffe066, shoes: 0xf2efe8, hair: 0xd9b25a, hairMesh: 'long', glasses: 'shades' },
  { jacket: 0x8d8a8e, shirt: 0xf4f4f4, tie: 0x2f56c8, tucked: true, pants: 0x8d8a8e, hair: 0x9a9690, hairStyle: 'balding', hat: 'fedora', hatColor: 0x6f6a66, age: 0.8, face: { nose: 0.5, cheeks: -0.3 } },
  { shirt: 0x2f56c8, tee: true, pants: 0xf5f0e6, shoes: 0xf2efe8, hair: 0x2b1b12, hairMesh: 'buzzed', hat: 'cap', hatColor: 0xd8342c, stubble: 0.2 },
  { pattern: 'check', shirt: 0xf1ece2, tucked: true, pants: 0x4a3324, shoes: 0x6a4a34, hair: 0x7a3b1a, hairMesh: 'parted', hat: 'cap', hatColor: 0x1f6b4a, age: 0.3 },
  { jacket: 0x16161c, shirt: 0xf4f4f4, tucked: true, pants: 0x16161c, hair: 0x1c1410, hairMesh: 'parted', hat: 'fedora', hatColor: 0x1c1c22, hatBand: 0x8a1c1c, stubble: 0.3, face: { jaw: 0.1 } },
  { body: 'female', jacket: 0xffd3a1, shirt: 0xffffff, tee: true, pants: 0xffffff, tucked: true, hair: 0xc4c1bb, hairMesh: 'parted', hairShift: [0, -0.045, 0.004], age: 0.9, glasses: 'clear', height: 0.92 },
  { shirt: 0xf4f4f4, sleeves: 'long', tucked: true, pants: 0x23232b, tie: 0x8a1c1c, hair: 0x111111, hairMesh: 'buzzed', dark: true, age: 0.3 },
];
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
// Nexus dresses for the rain: long coats, hoods and caps, collars up, and the hair in colours that glow under the adverts.
const NEXUS_LOOKS = [
  { coat: 0x1c1c22, shirt: 0x3a3a44, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', dark: true, collar: 0x2a2a30 },
  { coat: 0x2a2420, shirt: 0x8a8d96, pants: 0x1c1c22, hair: 0x2b1b12, hairMesh: 'parted', hat: 'cap', hatColor: 0x16161c, stubble: 0.5 },
  { coat: 0x16161c, shirt: 0xf4f4f0, turtle: 0x16161c, pants: 0x16161c, hair: 0x9a9690, hairMesh: 'parted', glasses: 'shades', age: 0.5 },
  { body: 'female', coat: 0xcfd8e6, shirt: 0xffffff, pants: 0x23232b, hair: 0xff3fa8, hairMesh: 'long', hairScale: [1, 0.8, 1] },
  { body: 'female', coat: 0x1c1c22, shirt: 0x49e0ff, turtle: 0x49e0ff, pants: 0x1c1c22, hair: 0x111111, hairMesh: 'long', dark: true },
  { body: 'female', coat: 0x3a2a3a, shirt: 0xe9e2d2, pants: 0x2a2a30, hair: 0x49e0ff, hairMesh: 'long', hairScale: [1, 0.7, 1], glasses: 'clear' },
  { jacket: 0x2f3a2a, shirt: 0xd9c7a0, sleeves: 'long', pants: 0x2a2a30, hair: 0x7a3b1a, hairMesh: 'parted', beard: 0x6a3a2a, beardMesh: true, bulk: 1.15, hat: 'cap', hatColor: 0x2a2a30 },
  { coat: 0x5a4a3a, shirt: 0x3a3a44, pants: 0x3a3a44, hair: 0x111111, hairStyle: 'balding', dark: true, age: 0.8, collar: 0x8a7a66 },
  { shirt: 0xff8a2c, tee: true, pants: 0x16161c, hair: 0x111111, hairMesh: 'buzzed', dark: true, glasses: 'shades', bulk: 1.2 },
  { body: 'female', jacket: 0xf4f4f0, shirt: 0x16161c, pants: 0xf4f4f0, hair: 0x1c1c3a, hairMesh: 'long', hairScale: [1, 0.85, 1] },
  { coat: 0x23232b, shirt: 0x8f7bff, pants: 0x23232b, hair: 0xd9b25a, hairMesh: 'parted', stubble: 0.3, collar: 0x16161c },
  { body: 'female', coat: 0x2a2a30, shirt: 0xffe066, pants: 0x2a2a30, hair: 0x111111, hairMesh: 'long', hat: 'cap', hatColor: 0x16161c },
];
const CROWD = CITY === 'nexus' ? NEXUS_LOOKS : PED_LOOKS;
export const randomPedLook = (rand = Math.random) => ({ ...pick(CROWD, rand), bulk: 0.9 + Math.floor(rand() * 4) * 0.1 });

// A pedestrian who walks laps around the sidewalk of one block, runs from trouble, and can be hurt.
export class Ped {
  constructor(scene, center, rand) {
    this.c = center; this.s = 27.6;
    this.u = rand() * 8 * this.s;
    this.dir = rand() < 0.5 ? 1 : -1;
    this.speed = 1.2 + rand() * 0.6;
    this.loiter = rand() < 0.2 ? 20 + rand() * 60 : 0; // some stand about talking for a while before moving on
    this.human = makeHuman({ ...pick(CROWD, rand), bulk: 0.9 + Math.floor(rand() * 4) * 0.1 });
    this.pos = new THREE.Vector3();
    this.down = 0; this.health = 100; this.dead = false; this.flight = 0; this.threat = new THREE.Vector3(); this.returning = false;
    this.pathPoint(this.pos);
    scene.add(this.human.group);
  }

  // Where on the block's sidewalk the lap parameter `u` puts this pedestrian; also the heading along it.
  pathPoint(out) {
    const s = this.s, side = Math.floor(this.u / (2 * s)), t = this.u - side * 2 * s - s;
    let x, z, h;
    if (side === 0) { x = t; z = -s; h = Math.PI / 2; }
    else if (side === 1) { x = s; z = t; h = 0; }
    else if (side === 2) { x = -t; z = s; h = -Math.PI / 2; }
    else { x = -s; z = -t; h = Math.PI; }
    out.set(this.c.x + x, 0, this.c.z + z);
    return this.dir > 0 ? h : h + Math.PI;
  }

  // Shoved by someone running through: a flinch, and a few steps out of the way.
  shove(from) {
    if (this.dead || this.down > 0) return;
    this.human.play('hitChest', 'idle');
    this.flee(from, 2.5);
  }
  // Start a fresh lap around another block (the crowd follows the player around the city).
  relocate(center, rand) {
    this.c = center; this.u = rand() * 8 * this.s; this.dir = rand() < 0.5 ? 1 : -1;
    this.flight = 0; this.returning = false; this.down = 0; this.loiter = rand() < 0.2 ? 20 + rand() * 60 : 0;
    this.human.group.rotation.y = this.pathPoint(this.pos);
    this.human.group.position.set(this.pos.x, groundAt(this.pos.x, this.pos.z), this.pos.z);
  }
  // Run from `from` for a while.
  flee(from, seconds = 8) {
    if (this.dead) return;
    this.threat.copy(from); this.flight = seconds; this.returning = true;
  }
  hurt(dmg, from, { knock = 0, down = false } = {}) {
    if (this.dead) return;
    this.health -= dmg;
    if (this.health <= 0) { this.die(); return; }
    if (knock && from) { // staggered back by the blow
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      this.pos.x += dx / d * knock; this.pos.z += dz / d * knock; pushOut(this.pos, 0.4);
      this.human.group.position.set(this.pos.x, groundAt(this.pos.x, this.pos.z), this.pos.z);
    }
    if (down) { this.down = 3; this.human.after = null; this.human.set('down'); this.flight = 0; this.returning = true; return; }
    this.down = 0;
    this.human.play(Math.random() < 0.5 ? 'hitHead' : 'hitChest', 'idle');
    this.flee(from, 9);
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.diedAt = 0;
    this.human.after = null;
    this.human.set('down');
  }

  update(dt, cars, threat) {
    const g = this.human.group, h = this.human;
    if (Ped.eye) g.visible = Math.hypot(this.pos.x - Ped.eye.x, this.pos.z - Ped.eye.z) < 135; // beyond that they are a few pixels in the fog
    if (this.fly) { // thrown by a car: an arc through the air, then the ground
      const f = this.fly;
      this.pos.x += f.vx * dt; this.pos.z += f.vz * dt; f.y += f.vy * dt; f.vy -= 14 * dt;
      f.vx *= 0.98; f.vz *= 0.98;
      pushOut(this.pos, 0.4);
      g.rotation.y += f.spin * dt;
      if (f.y <= 0) { f.y = 0; this.fly = null; }
      g.position.set(this.pos.x, groundAt(this.pos.x, this.pos.z) + f.y, this.pos.z);
      if (this.dead) this.diedAt += dt;
      return;
    }
    if (this.dead) { this.diedAt += dt; return; }
    if (this.down > 0) {
      this.down -= dt;
      if (this.down <= 0) h.rise('idle');
      return;
    }
    if (h.busy) return;
    if (this.flight > 0) { // run away from the trouble
      this.flight -= dt;
      const dx = this.pos.x - this.threat.x, dz = this.pos.z - this.threat.z, d = Math.hypot(dx, dz) || 1;
      this.pos.x += dx / d * 6.4 * dt; this.pos.z += dz / d * 6.4 * dt;
      pushOut(this.pos, 0.4);
      h.set('sprint');
      g.rotation.y = Math.atan2(dx, dz);
    } else if (this.returning) { // walk back to the sidewalk
      const target = tmpPed, back = this.pathPoint(target);
      const tx = target.x - this.pos.x, tz = target.z - this.pos.z, d = Math.hypot(tx, tz);
      if (d < 0.6) { this.returning = false; g.rotation.y = back; }
      else {
        this.pos.x += tx / d * 2.4 * dt; this.pos.z += tz / d * 2.4 * dt;
        pushOut(this.pos, 0.4);
        h.set('walk', 1.6);
        g.rotation.y = Math.atan2(tx, tz);
      }
    } else if (this.loiter > 0) { // standing at the kerb, talking to nobody in particular
      this.loiter -= dt;
      this.pathPoint(this.pos);
      g.rotation.y = this.pathPoint(this.pos) + Math.PI / 2 * this.dir;
      h.set(Math.floor(this.loiter / 6) % 2 ? 'talk' : 'idle');
    } else {
      const L = 8 * this.s;
      this.u = ((this.u + this.dir * this.speed * dt) % L + L) % L;
      g.rotation.y = this.pathPoint(this.pos);
      h.set('walk', this.speed / 1.4);
    }
    g.position.set(this.pos.x, groundAt(this.pos.x, this.pos.z), this.pos.z);
    if (threat && Math.hypot(threat.x - this.pos.x, threat.z - this.pos.z) < 22) this.flee(threat, 7);

    for (const car of cars) {
      if ((car.alt || 0) > 1.6) continue; // a spinner overhead is nothing to run from
      if (Math.abs(car.speed) > 3 && Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z) < 1.8 + car.reach * 0.5) {
        // Thrown the way the car is going, harder the faster it was, with a little sideways from where it hit.
        const s = Math.abs(car.speed), fx = Math.sin(car.heading) * Math.sign(car.speed), fz = Math.cos(car.heading) * Math.sign(car.speed);
        const sx = this.pos.x - car.pos.x, sz = this.pos.z - car.pos.z, side = sx * fz - sz * fx;
        this.fly = { vx: fx * s * 0.8 + fz * Math.sign(side) * s * 0.25, vz: fz * s * 0.8 - fx * Math.sign(side) * s * 0.25, vy: 2.8 + s * 0.22, y: 0.05, spin: (Math.random() - 0.5) * 6 };
        if (s > 9) this.die();
        else { this.down = 9; h.after = null; h.set('down'); }
        break;
      }
    }
  }
}
Ped.eye = null; // where the camera is, for culling the far crowd; set by main.js each frame
const tmpPed = new THREE.Vector3();

// ---------- Cars ----------

// Cars are built once per kind from a side profile: an extruded lower body with wheel arches, a narrower
// greenhouse on top, and flat panels and small boxes for glass, lights, bumpers and trim.
// Profile points are [z, y] with the nose at +z. `pillars` are the z positions of the posts between side windows.
const CAR_KINDS = {
  sedan: { L: 4.6, W: 1.84, clear: 0.25, R: 0.33, axle: 1.4, nose: 0.74, cowl: [0.74, 0.9], roofF: 0.14, roofR: -0.95, roof: 1.36, deck: [-1.52, 0.9], tail: 0.86, pillars: [-0.4] },
  coupe: { L: 4.5, W: 1.94, clear: 0.2, R: 0.33, axle: 1.34, nose: 0.55, cowl: [0.52, 0.8], roofF: -0.22, roofR: -0.9, roof: 1.15, deck: [-1.62, 0.85], tail: 0.84, pillars: [], wing: true, strakes: true },
  suv: { L: 5.1, W: 2.02, clear: 0.36, R: 0.4, axle: 1.62, nose: 1.0, cowl: [1.08, 1.12], roofF: 0.72, roofR: -2.32, roof: 1.84, deck: [-2.46, 1.12], tail: 1.1, pillars: [-0.2, -1.32], rack: true },
  taxi: { base: 'sedan', sign: true },
  police: { base: 'sedan', lightbar: true },
  // A spinner: a long low wedge of a car that lifts off. Its wheels fold away when it does.
  spinner: { base: 'coupe', L: 4.9, W: 2.1, clear: 0.3, nose: 0.62, cowl: [0.7, 0.86], roofF: -0.1, roofR: -1.1, roof: 1.2, deck: [-1.9, 0.9], tail: 0.88, fins: true },
  // A panel van: a short nose and a tall box of a body, windowless behind the cab.
  van: { L: 5.0, W: 2.0, clear: 0.34, R: 0.36, axle: 1.55, nose: 0.95, cowl: [1.3, 1.05], roofF: 0.9, roofR: -2.25, roof: 2.05, deck: [-2.4, 1.05], tail: 1.05, pillars: [0.1], blind: true },
  ambulance: { base: 'van', lightbar: true, medic: true },
  // An armoured car: a van's shape, taller and wider, with slits for windows.
  armored: { base: 'van', L: 5.6, W: 2.3, roof: 2.35, armor: true },
  // A pickup: a sedan's cab and a flat bed behind it.
  pickup: { L: 5.3, W: 1.96, clear: 0.4, R: 0.38, axle: 1.6, nose: 0.98, cowl: [0.95, 1.1], roofF: 0.35, roofR: -0.55, roof: 1.78, deck: [-0.72, 1.1], tail: 1.1, pillars: [], bed: -0.8 },
  // A box truck: the profile is the cab and chassis, `cargo` the box behind it (from z0 to z1, up to height h).
  truck: { L: 7.6, W: 2.4, clear: 0.5, R: 0.46, axle: 2.5, nose: 1.35, cowl: [2.75, 1.55], roofF: 2.3, roofR: 1.3, roof: 2.55, deck: [1.2, 1.55], tail: 1.2, pillars: [], cargo: { z0: -3.75, z1: 1.05, h: 3.35 } },
};
const carParts = {};

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3);
  g.deleteAttribute('uv');
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const slab = (w, h, d, x, y, z, hex) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
// A flat panel through the given points (a fan).
function panel(pts, hex) {
  const pos = [];
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return colored(g, hex);
}
// Extrude a side profile across the car: shape x becomes car z.
function across(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function buildCar(kind) {
  if (carParts[kind]) return carParts[kind];
  const K = CAR_KINDS[kind], k = K.base ? { ...CAR_KINDS[K.base], ...K } : K;
  const { L, W, R } = k, hl = L / 2, yb = k.clear, [cz, cy] = k.cowl, [dz, dy] = k.deck, ry = k.roof;
  const GLASS = 0x141c2b, CHROME = 0xc9cbd2, BLACK = 0x121216, RUBBER = 0x1c1c22, LAMP = 0xfff2c0, RED = 0xff2233, AMBER = 0xffa325;
  const paint = [], trim = [], lights = [];

  // Lower body, with arches cut for the wheels.
  const body = new THREE.Shape();
  body.moveTo(-hl + 0.06, yb);
  body.lineTo(-k.axle - R - 0.09, yb); body.absarc(-k.axle, R, R + 0.09, Math.PI, 0, true);
  body.lineTo(k.axle - R - 0.09, yb); body.absarc(k.axle, R, R + 0.09, Math.PI, 0, true);
  body.lineTo(hl - 0.1, yb); body.lineTo(hl, yb + 0.14); body.lineTo(hl, k.nose - 0.07); body.lineTo(hl - 0.07, k.nose);
  body.lineTo(cz, cy); body.lineTo(dz, dy);
  body.lineTo(-hl + 0.07, k.tail); body.lineTo(-hl, k.tail - 0.07); body.lineTo(-hl, yb + 0.14);
  paint.push(across(body, W, 0.07));

  // Greenhouse: pillars and roof in body colour, glass panes laid over it.
  const gw = W - 0.26, bev = 0.045, top = new THREE.Shape();
  top.moveTo(cz - 0.02, cy - 0.05); top.lineTo(k.roofF, ry); top.lineTo(k.roofR, ry); top.lineTo(dz + 0.02, dy - 0.05);
  paint.push(across(top, gw, bev));
  const pane = (a, b, t0, t1, inset) => { // a pane on the slope from a to b (both [z, y]), spanning the car's width
    let nz = b[1] - a[1], ny = -(b[0] - a[0]);
    const l = Math.hypot(nz, ny), mid = (k.roofF + k.roofR) / 2;
    nz /= l; ny /= l;
    if (nz * ((a[0] + b[0]) / 2 - mid) + ny < 0) { nz = -nz; ny = -ny; }
    const at = (t, x) => [x, a[1] + (b[1] - a[1]) * t + ny * (bev * 0.7 + 0.008), a[0] + (b[0] - a[0]) * t + nz * (bev * 0.7 + 0.008)];
    const x = gw / 2 - inset;
    return panel([at(t0, -x), at(t0, x), at(t1, x + 0.03), at(t1, -x - 0.03)].reverse(), GLASS);
  };
  trim.push(pane([cz, cy], [k.roofF, ry], 0.1, 0.9, 0.12), pane([dz, dy], [k.roofR, ry], 0.14, 0.88, 0.12));
  // Side windows between the pillars; their front and rear edges follow the screens.
  const yw0 = Math.max(cy, dy) + 0.04, yw1 = ry - 0.06;
  const frontAt = y => cz + (k.roofF - cz) * (y - cy) / (ry - cy) - 0.13, rearAt = y => dz + (k.roofR - dz) * (y - dy) / (ry - dy) + 0.13;
  const posts = [null, ...k.pillars.slice().sort((a, b) => b - a), null];
  for (const s of [-1, 1]) for (let i = 0; i < posts.length - 1; i++) {
    if (k.blind && i > 0) continue; // a van's body is solid behind the cab
    const x = s * (gw / 2 + 0.006);
    const f0 = posts[i] === null ? frontAt(yw0) : posts[i] - 0.045, f1 = posts[i] === null ? frontAt(yw1) : posts[i] - 0.045;
    const r0 = posts[i + 1] === null ? rearAt(yw0) : posts[i + 1] + 0.045, r1 = posts[i + 1] === null ? rearAt(yw1) : posts[i + 1] + 0.045;
    trim.push(panel([[x, yw0, f0], [x, yw1, f1], [x, yw1, r1], [x, yw0, r0]], GLASS));
  }

  // Underbody, bumpers, grille, plates.
  trim.push(slab(W - 0.3, 0.3, L - 0.5, 0, yb + 0.1, 0, BLACK));
  const bumper = k.strakes ? RUBBER : CHROME, by = yb + 0.2;
  trim.push(slab(W + 0.05, 0.15, 0.2, 0, by, hl - 0.03, bumper), slab(W + 0.05, 0.15, 0.2, 0, by, -hl + 0.03, bumper));
  const face = hl + 0.052, ly = k.nose - 0.17, rear = -hl - 0.052, ty = k.tail - 0.2;
  trim.push(slab(W * 0.5, 0.17, 0.02, 0, ly, face, BLACK));                                 // grille
  for (let n = -2; n <= 2; n++) trim.push(slab(W * 0.48, 0.012, 0.03, 0, ly + n * 0.032, face, CHROME));
  trim.push(slab(0.36, 0.13, 0.02, 0, by, hl + 0.075, 0xe8e6da), slab(0.36, 0.13, 0.02, 0, ty - 0.02, rear - 0.005, 0xe8e6da));
  for (const s of [-1, 1]) {
    const lx = s * W * 0.37;
    lights.push(slab(W * 0.2, 0.15, 0.03, lx, ly, face, LAMP), slab(0.1, 0.1, 0.03, s * (W / 2 - 0.03), ly - 0.02, face - 0.04, AMBER));
    trim.push(slab(W * 0.22, 0.19, 0.02, lx, ly, face - 0.006, CHROME));                    // lamp surround
    if (k.strakes) lights.push(slab(W * 0.47, 0.13, 0.03, s * W * 0.24, ty, rear, RED));    // full-width tail lamp
    else lights.push(slab(W * 0.24, 0.15, 0.03, lx, ty, rear, RED), slab(W * 0.08, 0.15, 0.03, s * W * 0.2, ty, rear, 0xf4f0e6));
    // Doors, handles, mirrors and the rubbing strip down the side.
    const sx = s * (W / 2 + 0.004), belt = Math.min(cy, dy) - 0.05;
    for (const z of [cz + 0.02, ...k.pillars.slice(0, kind === 'suv' ? 2 : 1), ...(k.pillars.length ? [] : [k.roofR + 0.05])])
      trim.push(slab(0.008, belt - yb - 0.12, 0.022, sx, (belt + yb + 0.1) / 2, z, BLACK));
    for (const z of k.pillars.length ? [k.pillars[0] + 0.14, ...(k.pillars[1] ? [k.pillars[1] + 0.14] : [dz + 0.55])] : [k.roofR + 0.2])
      trim.push(slab(0.03, 0.035, 0.15, sx, belt - 0.06, z, CHROME));
    paint.push(new THREE.BoxGeometry(0.1, 0.1, 0.16).translate(s * (W / 2 + 0.04), cy + 0.06, cz - 0.16));
    if (k.strakes) for (let n = 0; n < 4; n++) trim.push(slab(0.012, 0.022, 1.25, sx, yb + 0.3 + n * 0.062, -0.35, BLACK));
    else trim.push(slab(0.02, 0.05, k.axle * 2 - R * 2 - 0.3, sx, yb + 0.26, 0, RUBBER));
    if (k.rack) trim.push(slab(0.05, 0.05, k.roofF - k.roofR - 0.5, s * (gw / 2 - 0.12), ry + 0.09, (k.roofF + k.roofR) / 2, BLACK),
      slab(0.2, 0.05, k.axle * 2 - R * 2 - 0.36, s * (W / 2 + 0.06), yb + 0.02, 0, BLACK));  // roof rail, running board
  }
  if (k.rack) for (const z of [k.roofF - 0.5, (k.roofF + k.roofR) / 2, k.roofR + 0.5]) trim.push(slab(gw - 0.2, 0.04, 0.05, 0, ry + 0.1, z, BLACK));
  if (k.fins) for (const s of [-1, 1]) { paint.push(new THREE.BoxGeometry(0.5, 0.28, 1.6).translate(s * (W / 2 - 0.2), k.tail + 0.1, -hl + 0.9)); lights.push(slab(0.3, 0.06, 0.5, s * (W / 2 - 0.2), k.clear + 0.05, -0.3, 0x49e0ff)); lights.push(slab(0.5, 0.05, 0.5, s * (W / 2 - 0.2), k.clear + 0.02, 0.9, 0x49e0ff)); }
  if (k.wing) {
    paint.push(new THREE.BoxGeometry(W - 0.1, 0.045, 0.34).translate(0, k.tail + 0.24, -hl + 0.24));
    for (const s of [-1, 1]) paint.push(new THREE.BoxGeometry(0.06, 0.24, 0.2).translate(s * (W / 2 - 0.2), k.tail + 0.1, -hl + 0.24));
  }
  if (k.bed !== undefined) { // the open bed of a pickup: a dark liner between low rails
    const z0 = -hl + 0.12, z1 = k.bed, mid = (z0 + z1) / 2, len = z1 - z0;
    trim.push(slab(W - 0.36, 0.03, len, 0, k.tail - 0.08, mid, BLACK));
    trim.push(slab(W - 0.3, 0.02, 0.04, 0, k.tail + 0.02, z1 + 0.02, BLACK));
    for (const s of [-1, 1]) trim.push(slab(0.04, 0.03, len, s * (W / 2 - 0.1), k.tail + 0.02, mid, CHROME));
  }
  if (k.cargo) {
    const { z0, z1, h } = k.cargo, mid = (z0 + z1) / 2, len = z1 - z0;
    trim.push(slab(W + 0.1, h - k.tail, len, 0, (h + k.tail) / 2, mid, 0xf2f0ea));
    trim.push(slab(W + 0.14, 0.45, len - 0.3, 0, k.tail + 1.25, mid, 0x2f56c8), slab(W + 0.14, 0.12, len - 0.3, 0, k.tail + 0.85, mid, 0xd8342c)); // the line's colours
    trim.push(slab(0.05, h - k.tail - 0.3, 0.03, 0, (h + k.tail) / 2, z0 - 0.01, BLACK), slab(W - 0.2, 0.1, 0.5, 0, k.tail - 0.1, z0 - 0.2, RUBBER));
  }
  if (k.lightbar) { // a light bar on the roof and black doors
    lights.push(slab(0.5, 0.14, 0.3, -0.4, ry + 0.11, (k.roofF + k.roofR) / 2, 0xff2a3c), slab(0.5, 0.14, 0.3, 0.4, ry + 0.11, (k.roofF + k.roofR) / 2, 0x2f7bff));
    trim.push(slab(0.2, 0.08, 1.2, 0, ry + 0.06, (k.roofF + k.roofR) / 2, BLACK));
    for (const s of [-1, 1]) trim.push(slab(0.01, k.cowl[1] - 0.6, 2.5, s * (W / 2 + 0.006), yb + 0.3 + (k.cowl[1] - 0.6) / 2, k.pillars[0] + 0.3, BLACK));
  }
  if (k.medic) for (const s of [-1, 1]) { trim.push(slab(0.012, 0.3, L - 1.2, s * (W / 2 + 0.006), 1.15, -0.3, 0xd8342c)); trim.push(slab(0.014, 0.5, 0.14, s * (W / 2 + 0.008), 1.6, -1, 0xd8342c), slab(0.014, 0.14, 0.5, s * (W / 2 + 0.008), 1.6, -1, 0xd8342c)); }
  if (k.armor) for (const s of [-1, 1]) { trim.push(slab(0.014, 0.2, L - 1.6, s * (W / 2 + 0.008), 1.5, -0.4, 0x1c1c22)); for (let n = 0; n < 3; n++) trim.push(slab(0.016, 0.12, 0.3, s * (W / 2 + 0.01), 1.55, -1.6 + n * 0.9, 0x55525a)); }
  if (k.sign) {
    lights.push(slab(0.7, 0.2, 0.26, 0, ry + 0.15, (k.roofF + k.roofR) / 2, 0xfff6c8));
    for (const s of [-1, 1]) for (let n = -7; n <= 7; n++)
      trim.push(slab(0.006, 0.07, 0.12, s * (W / 2 + 0.005), 0.7 + (n & 1) * 0.07, n * 0.24, BLACK));  // checker band
  }

  // A wheel: tyre, alloy face on both sides, and dark slots so its spin can be seen.
  const wheel = [colored(new THREE.CylinderGeometry(R, R, 0.27, 16).rotateZ(Math.PI / 2), 0x17171b)];
  for (const s of [-1, 1]) {
    wheel.push(colored(new THREE.CylinderGeometry(R * 0.68, R * 0.68, 0.02, 14).rotateZ(Math.PI / 2).translate(s * 0.136, 0, 0), 0xb9bcc4));
    wheel.push(colored(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.03, 8).rotateZ(Math.PI / 2).translate(s * 0.14, 0, 0), 0x6a6d75));
    for (let n = 0; n < 5; n++) wheel.push(colored(new THREE.BoxGeometry(0.012, R * 0.3, R * 0.14).translate(s * 0.148, R * 0.43, 0).rotateX(n * Math.PI * 0.4), 0x26262c));
  }
  const bare = g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  return carParts[kind] = {
    k, paint: mergeGeometries(paint.map(bare)), trim: mergeGeometries(trim), lights: mergeGeometries(lights), wheel: mergeGeometries(wheel),
  };
}

const trimMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x262626, side: THREE.DoubleSide });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
let beamTex = null;
const beamMap = () => beamTex ??= (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 128); const side = x.createLinearGradient(0, 0, 64, 0); side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.3, 'rgba(0,0,0,0)'); side.addColorStop(0.7, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = side; x.fillRect(0, 0, 64, 128); const t = new THREE.CanvasTexture(c); return t; })();
const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const paints = new Map();
const paintMat = color => paints.get(color) ?? paints.set(color, new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x777777 })).get(color);

function makeCarMesh(color, kind) {
  const parts = buildCar(kind), { k } = parts, g = new THREE.Group();
  for (const [geo, mat] of [[parts.paint, paintMat(color)], [parts.trim, trimMat], [parts.lights, lightMat]]) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = mat !== lightMat; m.receiveShadow = mat !== lightMat;
    g.add(m);
  }
  g.userData.radius = k.R;
  g.userData.reach = k.L / 2 - 1; // how far the collision circles sit from the centre
  { // Headlamp beams: a pale wedge laid on the road ahead, shown after dark (owner: cars had no lights at night).
    const L = k.L, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-k.W * 0.42, 0.05, L / 2, k.W * 0.42, 0.05, L / 2, k.W * 1.1, 0.05, L / 2 + 16, -k.W * 1.1, 0.05, L / 2 + 16]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamMap(), color: 0xfff2c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.renderOrder = 2; g.add(beam); g.userData.beam = beam;
  }
  return g;
}

// All the wheels of one kind of car are a single instanced mesh: four slots per car, written each sync.
const wheelPools = {};
function wheelPool(scene, kind) {
  let pool = wheelPools[kind];
  if (!pool) {
    const mesh = new THREE.InstancedMesh(buildCar(kind).wheel, wheelMat, 1024);
    mesh.count = 0; mesh.castShadow = true; mesh.frustumCulled = false;
    pool = wheelPools[kind] = { mesh, free: [] };
    scene.add(mesh);
  }
  return pool;
}
const wheelM = new THREE.Matrix4(), wheelL = new THREE.Matrix4(), wheelSpin = new THREE.Matrix4();
const probe = new THREE.Vector3();

export class Car {
  constructor(scene, x, z, heading, color, kind = 'sedan') {
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading; this.speed = 0; this.kind = kind; this.color = color;
    this.nav = null; // set for traffic cars driven by the AI
    this.mesh = makeCarMesh(color, kind);
    this.reach = this.mesh.userData.reach;
    this.k = CAR_KINDS[kind].base ? { ...CAR_KINDS[CAR_KINDS[kind].base], ...CAR_KINDS[kind] } : CAR_KINDS[kind];
    this.pool = wheelPool(scene, kind);
    this.wheel = this.pool.free.length ? this.pool.free.pop() : (this.pool.mesh.count += 4) - 4;
    this.spin = 0; this.wheelsShown = true;
    this.alt = 0; this.lift = 0; // a spinner: height above the ground, and the rate it is climbing
    scene.add(this.mesh);
    this.sync();
  }

  // In the air a spinner steers at any speed, climbs and sinks on `lift` (-1..1), and does not roll.
  fly(dt, throttle, steer, lift) {
    const top = 42;
    if (throttle > 0) this.speed += 12 * (1 - this.speed / top) * dt; else if (throttle < 0) this.speed -= 12 * dt; else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    this.speed = clamp(this.speed, -8, top);
    this.heading += steer * 1.5 * dt;
    this.alt = clamp(this.alt + lift * 9 * dt, 0, 170);
    this.bank = ((this.bank ?? 0) + (steer * 0.35 - (this.bank ?? 0)) * Math.min(1, dt * 3));
    this.move(dt);
  }

  drive(dt, throttle, steer, handbrake) {
    const hp = this.hp ?? 100, top = ({ truck: 21, van: 25, ambulance: 27, armored: 19, suv: 29, pickup: 28 }[this.kind] ?? 32) * (hp < 35 ? 0.55 : hp < 60 ? 0.82 : 1); // a car that has been knocked about is slower
    if (this.wreck) throttle = 0;
    if (throttle > 0) this.speed += (this.speed < 0 ? 30 : 15 * (1 - this.speed / top)) * dt;
    else if (throttle < 0) this.speed -= (this.speed > 0.5 ? 30 : 9 * (1 + this.speed / 11)) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.5 * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 32 * dt);
    this.heading += steer * clamp(this.speed / 5, -1, 1) * ((this.kind === 'truck' ? 1.5 : 2.3) / (1 + Math.abs(this.speed) / 28)) * dt;
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
    for (const o of [this.reach, -this.reach]) {
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
    this.mesh.position.set(this.pos.x, groundAt(this.pos.x, this.pos.z) + (this.alt || 0), this.pos.z);
    this.mesh.rotation.y = this.heading;
    if (this.kind === 'spinner') { this.mesh.rotation.z = -(this.bank ?? 0); this.mesh.rotation.x = this.alt > 0.5 ? -(this.lift || 0) * 0.12 : 0; const show = this.alt < 0.5; if (show !== this.wheelsShown) { this.wheelsShown = show; } }
    this.placeWheels();
  }

  // Write the four wheels into the pool, under the body wherever it is.
  placeWheels() {
    const { k, pool } = this, body = this.mesh;
    body.updateMatrix();
    wheelSpin.makeRotationX(this.spin);
    let n = 0;
    for (const x of [-1, 1]) for (const z of [-k.axle, k.axle]) {
      if (this.wheelsShown) wheelM.copy(body.matrix).multiply(wheelL.makeTranslation(x * (k.W / 2 - 0.1), k.R, z)).multiply(wheelSpin);
      else wheelM.makeScale(0, 0, 0);
      pool.mesh.setMatrixAt(this.wheel + n++, wheelM);
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
  hideWheels() { this.wheelsShown = false; this.placeWheels(); }

  // Take the car out of the world.
  remove(scene) {
    scene.remove(this.mesh);
    this.wheelsShown = false; this.placeWheels();
    this.pool.free.push(this.wheel);
  }

  repaint(color) { this.mesh.children[0].material = paintMat(color); }

  spinWheels(dt) { this.spin += this.speed * dt / this.k.R; }
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
const TRAFFIC_KINDS = ['sedan', 'sedan', 'sedan', 'coupe', 'coupe', 'suv', 'taxi', 'taxi', 'van', 'pickup', 'police'];

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
    const kind = pick(TRAFFIC_KINDS, rand);
    const car = new Car(scene, x, z, Math.atan2(d.x, d.z), kind === 'taxi' ? 0xf5c518 : kind === 'police' ? 0xf4f4f4 : pick(TRAFFIC_COLORS, rand), kind);
    car.nav = { ni: i + d.x, nj: j + d.z, dir: di, phase: 'entry', target: entryPoint(i + d.x, j + d.z, d), cruise: 8 + rand() * 4, stuck: 0, ignore: 0 };
    cars.push(car);
  }
  return cars;
}

// Send a car out as traffic: it starts halfway along the road leaving intersection (i, j) in direction `dir` (an index into DIRS).
export const nearestNode = pos => ({ i: Math.max(0, Math.min(NX, Math.round((pos.x - nodeX(0)) / CELL))), j: Math.max(0, Math.min(NZ, Math.round((pos.z - nodeZ(0)) / CELL))) });
export function roam(car, i, j, dir, cruise = 10) {
  if (!validNode(i + DIRS[dir].x, j + DIRS[dir].z)) dir = [0, 1, 2, 3].find(k => validNode(i + DIRS[k].x, j + DIRS[k].z));
  const d = DIRS[dir], r = rightOf(d);
  car.pos.set((nodeX(i) + nodeX(i + d.x)) / 2 + r.x * LANE, 0, (nodeZ(j) + nodeZ(j + d.z)) / 2 + r.z * LANE);
  car.heading = Math.atan2(d.x, d.z); car.speed = cruise;
  car.nav = { ni: i + d.x, nj: j + d.z, dir, phase: 'entry', target: entryPoint(i + d.x, j + d.z, d), cruise, stuck: 0, ignore: 0 };
}

function advance(nav) {
  if (nav.phase === 'entry') {
    const back = (nav.dir + 2) % 4;
    let options = [0, 1, 2, 3].filter(k => k !== back && validNode(nav.ni + DIRS[k].x, nav.nj + DIRS[k].z));
    if (!options.length) options = [back];
    if (nav.goal) { // head for the goal: the way that brings the next intersection closest to it
      const dist = k => Math.hypot(nodeX(nav.ni + DIRS[k].x) - nav.goal.x, nodeZ(nav.nj + DIRS[k].z) - nav.goal.z);
      options.sort((a, b) => dist(a) - dist(b));
      nav.next = Math.random() < 0.85 ? options[0] : options[Math.floor(Math.random() * options.length)];
    }
    // Prefer going straight so traffic flows instead of circling a block.
    else nav.next = options.includes(nav.dir) && Math.random() < 0.55 ? nav.dir : options[Math.floor(Math.random() * options.length)];
    nav.target = exitPoint(nav.ni, nav.nj, DIRS[nav.next]);
    nav.phase = 'exit';
  } else {
    nav.dir = nav.next;
    nav.ni += DIRS[nav.dir].x; nav.nj += DIRS[nav.dir].z;
    nav.target = entryPoint(nav.ni, nav.nj, DIRS[nav.dir]);
    nav.phase = 'entry';
  }
}

// obstacles: positions ({x, z}) of everything this car should brake for. onHonk is called when the driver loses patience.
export function driveAI(car, dt, obstacles, onHonk) {
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
    // Whoever is inside the intersection has it: a car about to enter one waits while someone else is crossing.
    const nx = nodeX(nav.ni), nz = nodeZ(nav.nj), inBox = (x, z) => Math.abs(x - nx) < 7 && Math.abs(z - nz) < 7;
    const entering = nav.phase === 'entry' && Math.hypot(dx, dz) < 10 && !inBox(car.pos.x, car.pos.z);
    for (const o of obstacles) {
      if (o === car.pos) continue;
      const vx = o.x - car.pos.x, vz = o.z - car.pos.z;
      const ahead = vx * fx + vz * fz;
      if (ahead > 0.5 && ahead < 9 && Math.abs(vx * fz - vz * fx) < 2) { blocked = true; break; }
      if (entering && ahead > 0 && inBox(o.x, o.z)) { blocked = true; break; }
    }
    // Gridlock breaker: after waiting a while, nudge through.
    if (blocked) { nav.stuck += dt; if (nav.stuck > 2 && !nav.honked) { nav.honked = true; onHonk?.(car); } if (nav.stuck > 6) { nav.ignore = 2; nav.stuck = 0; } } else { nav.stuck = 0; nav.honked = false; }
  }
  const want = blocked ? 0 : Math.abs(diff) > 0.4 ? 5 : nav.cruise;
  car.speed += clamp(want - car.speed, -20 * dt, 6 * dt);
  car.move(dt);
}
