import * as THREE from 'three';
import { makeHuman } from './people.js';

// Sets for the second half of "2049" that do not fit inside the city: the dead city in the dust, the top of the
// sea wall, and the inside of Wallace's building. Each open-air set is an interior (the player is kept inside it)
// with its own ground and its own air: `climate` is read by main.js while the camera is in it.
// `h` is the toolkit from buildWorld: the same put/slab/post/sign/collide the rest of the city is made with.
export function buildSets2049(h) {
  const { scene, M, put, slab, post, ball, collide, sign, halo, updaters, places, rooms, interiors, terrains, floors, room, texture } = h;
  const lam = opts => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rnd = (() => { let a = 7149; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  // A box turned about y and leant over about its own z, standing on y0 (most of the dead city is not upright).
  const leant = (mat, hex, w, ht, d, x, y0, z, turn = 0, lean = 0, s = 0) => {
    const geo = new THREE.BoxGeometry(w, ht, d);
    if (s) { const uv = geo.attributes.uv; for (let i = 0; i < 24; i++) { const f = i >> 2, u = f < 2 ? d : w, v = f === 2 || f === 3 ? d : ht; uv.setXY(i, uv.getX(i) * u / s[0], uv.getY(i) * v / s[1]); } }
    return put(mat, geo.translate(0, ht / 2, 0).rotateZ(lean).rotateY(turn).translate(x, y0, z), hex);
  };
  // A figure in stone: one of the people, made huge, posed once and left like that.
  const statue = (x, y, z, turn, scale, state, opts, lean = 0) => {
    const f = makeHuman({ body: 'female', shirt: 0x8a7060, pants: 0x8a7060, hair: 0x8a7060, hairMesh: 'long', ...opts });
    const stone = new THREE.MeshLambertMaterial({ color: 0xa88468 });
    f.group.traverse(o => { if (o.isMesh) { o.material = stone; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    f.set(state); f.mixer.update(state === 'kneel' ? 3 : 0.6); f.mixer.timeScale = 0;
    f.group.scale.setScalar(scale); f.group.position.set(x, y, z); f.group.rotation.set(0, turn, lean);
    scene.add(f.group);
    return f;
  };
  const sets = {};

  // ================= The dead city: dunes, statues, casinos half under the sand =================
  {
    const VX = 3600, VZ = -900, W = 300, D = 260;
    // The ground: dunes everywhere except along the way in, which the wind keeps lower.
    const pathDist = (u, v) => v > 110 ? Math.hypot(u, v - 110) : v < -66 ? Math.hypot(u, v + 66) : Math.abs(u);
    const height = (x, z) => {
      const u = x - VX, v = z - VZ, d = pathDist(u, v), r = Math.hypot(u, v);
      const dune = Math.max(0, 3 + 2.6 * Math.sin(u * 0.045 + v * 0.012) + 2.2 * Math.sin(v * 0.052 - u * 0.02 + 1.3) + 1.6 * Math.sin((u + v) * 0.09));
      const plaza = Math.min(smooth(10, 38, d), smooth(16, 40, Math.hypot(u, v + 72)));
      return -0.1 + 0.07 * Math.sin(u * 1.3 + v * 0.4) + dune * plaza * (1 + Math.max(0, r - 80) / 35);
    };
    const T = texture(256, 256, (c, w) => { c.fillStyle = '#e8c8a0'; c.fillRect(0, 0, w, w); for (let n = 0; n < 4000; n++) { c.fillStyle = `rgba(${n % 2 ? 255 : 120},${n % 2 ? 230 : 80},${n % 2 ? 200 : 50},0.08)`; c.fillRect(rnd() * w, rnd() * w, 1 + rnd() * 2, 1); } for (let y = 0; y < w; y += 7) { c.strokeStyle = 'rgba(140,80,40,0.10)'; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.1 + y) * 2); c.stroke(); } });
    T.repeat.set(30, 26);
    const geo = new THREE.PlaneGeometry(W, D, 150, 130).rotateX(-Math.PI / 2).translate(VX, 0, VZ), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(0xb08058), c1 = new THREE.Color(0xe8c49a), cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = height(x, z); pos.setY(i, y); const slope = Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y); cc.copy(c0).lerp(c1, Math.min(1, y / 14 + 0.3 - slope * 0.6)).toArray(col, i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, lam({ map: T })); ground.receiveShadow = true; scene.add(ground);
    terrains.push({ minX: VX - W / 2, maxX: VX + W / 2, minZ: VZ - D / 2, maxZ: VZ + D / 2, at: height });
    // The air: the sky is the dust, and the dust is the sky.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(270, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, depthWrite: true,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.78, 0.47, 0.19), vec3(0.93, 0.66, 0.34), smoothstep(-0.05, 0.6, h)); c += vec3(0.12, 0.08, 0.02) * pow(max(0.0, 1.0 - abs(h - 0.25) * 3.0), 2.0); gl_FragColor = vec4(c, 1.0); }' }));
    dome.position.set(VX, 0, VZ); scene.add(dome);
    updaters.push(() => { const e = places.sky?.position; dome.visible = !!e && Math.hypot(e.x - VX, e.z - VZ) < 300; }); // it is the sky only from inside it
    const q = { minX: VX - W / 2 + 4, maxX: VX + W / 2 - 4, minZ: VZ - D / 2 + 4, maxZ: VZ + D / 2 - 4, lights: [], X: VX, Y: -0.1, Z: VZ, open: true,
      climate: { hemi: [0xffb878, 0x8a4a20, 1.7], sun: [0xffc890, 1.5], fog: [0xc87a30, 28, 210], dry: true, sky: false } };
    interiors.push(q);

    // Hotels and casinos, sunk to the third floor, leaning, dead windows. One of them still has a light on.
    const dead = texture(256, 512, (c, w, ht) => {
      c.fillStyle = '#7a5a44'; c.fillRect(0, 0, w, ht);
      for (let r = 0; r < 16; r++) for (let k = 0; k < 8; k++) { const x = k * 32 + 5, y = r * 32 + 6, broke = rnd(); c.fillStyle = broke < 0.15 ? '#a07858' : broke < 0.6 ? '#1c120c' : '#2e2018'; c.fillRect(x, y, 22, 20); if (broke > 0.9) { c.fillStyle = '#c08a58'; c.fillRect(x, y + 12, 22, 8); } }
      for (let n = 0; n < 60; n++) { c.fillStyle = 'rgba(200,140,90,0.18)'; c.fillRect(rnd() * w, 0, 2 + rnd() * 6, ht); }
    });
    M.deadFacade = lam({ map: dead });
    const towers = [
      { x: 0, z: -92, w: 30, d: 24, ht: 62, lean: 0, name: ['THE GRAND', 'HOTEL  ·  CASINO'], hotel: true },
      { x: -62, z: -96, w: 24, d: 22, ht: 78, lean: 0.06, name: ['PARADI  O'] },
      { x: 72, z: -78, w: 26, d: 26, ht: 54, lean: -0.08, name: ['S ARLIGHT'] },
      { x: -100, z: -20, w: 22, d: 30, ht: 46, lean: 0.12, name: ['LUCKY  7'] },
      { x: 104, z: 14, w: 20, d: 20, ht: 70, lean: -0.05, name: ['THE ORA LE'] },
      { x: 36, z: -116, w: 18, d: 18, ht: 90, lean: 0.03 },
      { x: -40, z: 96, w: 16, d: 20, ht: 30, lean: 0.22 },
    ];
    for (const t of towers) {
      const x = VX + t.x, z = VZ + t.z, base = height(x, z) - 8, turn = Math.atan2(-t.x, -t.z - 40) * 0.2;
      leant(M.deadFacade, 0xc8a084, t.w, t.ht, t.d, x, base, z, turn, t.lean, [26, 56]);
      leant(M.plain, 0x5a4232, t.w + 1, 1.2, t.d + 1, x, base + t.ht * Math.cos(t.lean), z, turn, t.lean);      // the roof's edge
      collide(x, z, t.w + Math.abs(t.lean) * t.ht * 0.5, t.d, t.ht);
      if (t.name) sign(t.name, x - Math.sin(t.lean) * 30, base + 30, z + t.d / 2 + 0.4, 0, { w: t.w * 0.8, h: t.w * 0.22, color: '#8a6040', bg: '#3a2618', glow: false, size: 0.7 });
    }
    { // The one Deckard lives in: an awning over a door, a revolving drum, sandbags, one window lit high up
      const x = VX, z = VZ - 79.5, y = height(x, z + 4);
      slab(0x3a2618, 16, 0.5, 5, x, y + 4.2, z + 2.4); for (const s of [-1, 1]) { post(0x8a6a44, 0.18, 4.2, x + s * 7.4, y, z + 4.6, 8); collide(x + s * 7.4, z + 4.6, 0.6, 0.6, 4); }
      for (let n = 0; n < 22; n++) ball(0xffd9a0, 0.12, x - 7.6 + n * 0.72, y + 4.0, z + 4.9, M.glow);                                                 // a row of bulbs, most of them dead
      slab(0x1c120c, 3.2, 3.2, 0.3, x, y, z + 0.1); put(M.plain, new THREE.CylinderGeometry(1.5, 1.5, 3, 12, 1, true).translate(x, y + 1.5, z + 0.6), 0x8a7a5a);
      slab(0xffb860, 0.9, 1.4, 0.08, x + 6, y + 21, z + 0.4, M.glow); halo(x + 6, y + 21.7, z + 1.2, 0xffb860, 10);
      for (let n = 0; n < 9; n++) slab(0x9a7a50, 1.1, 0.45, 0.6, x - 5 + (n % 5) * 1.15, y + Math.floor(n / 5) * 0.45, z + 6 + (n % 2) * 0.3);
      sets.casinoDoor = { x, z: z + 3.2, h: 0 };
    }
    // The statues: two kneeling women facing each other across the way in, and one standing who has lost her head to the dust.
    const sy = height(VX, VZ + 20);
    statue(VX - 17, sy - 2, VZ + 22, Math.PI / 2, 22, 'kneel', {}); collide(VX - 19, VZ + 22, 18, 14, 34);
    statue(VX + 17, sy - 2, VZ + 18, -Math.PI / 2, 22, 'kneel', {}); collide(VX + 19, VZ + 18, 18, 14, 34);
    statue(VX + 56, height(VX + 56, VZ - 28) - 4, VZ - 28, -0.6, 26, 'idle', { hairMesh: 'parted' }, 0.06); collide(VX + 56, VZ - 28, 13, 10, 44);
    statue(VX - 62, height(VX - 62, VZ + 52) - 3.4, VZ + 52, 0.4, 18, 'idle', {}, 1.45);                       // one on her side, half under a dune
    // The sign at the edge of town, still saying what it said.
    { const x = VX - 15, z = VZ + 84, y = height(x, z) - 1.2;
      for (const s of [-1, 1]) post(0x8a8d96, 0.14, 5.2, x + s * 2.4, y, z, 6);
      put(M.plain, new THREE.CylinderGeometry(4.6, 4.6, 0.3, 4, 1).rotateX(Math.PI / 2).scale(1.15, 0.72, 1).translate(x, y + 6.6, z), 0xd8d0c0);
      sign(['WELCOME', 'TO', 'LAS VEGAS'], x, y + 6.6, z + 0.2, 0, { w: 5.6, h: 3, color: '#a83020', bg: '#e0d6c4', glow: false, size: 0.62 });
      collide(x, z, 6, 1, 8); }
    // The rest of a city: cars to the roof in sand, rows of slot machines, a fallen arrow that used to point to the tables.
    for (let n = 0; n < 9; n++) { const x = VX + (rnd() - 0.5) * 120, z = VZ + 20 + (rnd() - 0.5) * 120; if (Math.abs(x - VX) < 9) continue; const y = height(x, z); leant(M.plain, [0x6a4a32, 0x5a5048, 0x7a3a28][n % 3], 4.2, 1.3, 1.9, x, y - 0.7, z, rnd() * 6, (rnd() - 0.5) * 0.4); leant(M.plain, 0x2a1c14, 2.2, 0.7, 1.7, x, y + 0.4, z, rnd() * 6, 0); collide(x, z, 4, 4, 1.4, true); }
    for (let n = 0; n < 12; n++) { const x = VX + 9 + (n % 6) * 1.1, z = VZ - 52 + Math.floor(n / 6) * 2.4, y = height(x, z); leant(M.plain, 0x5a3a2a, 0.8, 1.7, 0.7, x, y - 0.4 - (n % 3) * 0.3, z, 0, (rnd() - 0.5) * 0.3); slab(0x3a5a5a, 0.5, 0.4, 0.05, x, y + 0.5 - (n % 3) * 0.3, z + 0.38, M.plain); }
    collide(VX + 11.8, VZ - 50.8, 7.2, 4, 1.6, true);
    { const x = VX - 30, z = VZ - 40, y = height(x, z); leant(M.plain, 0x8a2a20, 22, 3, 1.2, x, y - 1, z, 0.5, 1.48); for (let n = 0; n < 14; n++) ball(0xd0b080, 0.25, x + Math.cos(0.5) * (n * 1.5 - 10), y + 1.2, z - Math.sin(0.5) * (n * 1.5 - 10)); leant(M.plain, 0x8a2a20, 4, 4, 1.2, x + Math.cos(0.5) * 12, y - 1, z - Math.sin(0.5) * 12, 0.5 + Math.PI / 4, 1.48); }
    // The bees. Somebody has been keeping them out here: hives on pallets, smoke pots, and the bees themselves.
    const HX = VX + 24, HZ = VZ - 38, hy = height(HX, HZ);
    for (let n = 0; n < 8; n++) { const x = HX + (n % 4) * 1.4, z = HZ + Math.floor(n / 4) * 2.2; slab(0x6a4a2a, 1.1, 0.15, 0.9, x, hy, z, M.wood, 1); slab(0xd8ccb0, 0.8, 0.6, 0.6, x, hy + 0.15, z); slab(0xd8ccb0, 0.8, 0.5, 0.6, x, hy + 0.78, z); slab(0x2a1c14, 0.4, 0.06, 0.02, x, hy + 0.25, z + 0.31); slab(0x8a7a5a, 0.86, 0.06, 0.66, x, hy + 1.3, z); }
    collide(HX + 2.1, HZ + 1.1, 6.2, 3.6, 1.4, true);
    for (const [dx, dz] of [[-1.6, 0], [6.2, 2.4]]) { post(0x5a5048, 0.18, 0.5, HX + dx, hy, HZ + dz, 8); halo(HX + dx, hy + 0.8, HZ + dz, 0xffa040, 4); }
    const bees = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(90 * 3), 3)), new THREE.PointsMaterial({ color: 0x2a1a08, size: 0.07 }));
    bees.frustumCulled = false; scene.add(bees);
    updaters.push(t => { const a = bees.geometry.attributes.position; for (let k = 0; k < 90; k++) { const r = 0.6 + (k % 7) * 0.35, w = t * (1.5 + (k % 5) * 0.4) + k; a.setXYZ(k, HX + 2.1 + Math.cos(w) * r * 1.6, hy + 1.2 + Math.sin(w * 1.7 + k) * 0.6, HZ + 1.1 + Math.sin(w) * r); } a.needsUpdate = true; });
    // Dust in the air, close to the eye.
    const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(500 * 3), 3)), new THREE.PointsMaterial({ color: 0xffd0a0, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false }));
    motes.frustumCulled = false; scene.add(motes);
    const seed = Array.from({ length: 500 }, () => [(rnd() - 0.5) * 70, rnd() * 14, (rnd() - 0.5) * 70]);
    updaters.push(t => { const e = places.sky?.position; if (!e || Math.abs(e.x - VX) > W / 2 || Math.abs(e.z - VZ) > D / 2) { motes.visible = false; return; } motes.visible = true; const a = motes.geometry.attributes.position; for (let k = 0; k < 500; k++) { const [x, y, z] = seed[k]; a.setXYZ(k, e.x + ((x + t * 3.2) % 70 + 70) % 70 - 35, height(e.x, e.z) + (y + Math.sin(t + k) * 0.5), e.z + z); } a.needsUpdate = true; });
    sets.vegas = { q, landing: { x: VX + 1, z: VZ + 104, h: Math.PI }, statues: { x: VX, z: VZ + 20 }, hives: { x: HX + 2, z: HZ + 4.2 }, door: sets.casinoDoor, height, centre: { x: VX, z: VZ } };
  }

  // ================= The casino where Deckard lives: the floor, the bar, the piano, the dog, the stage =================
  {
    const q = rooms.CASINO = room(34, 24, 6.2, { floor: M.gravel, floorTint: 0x4a2a2a, wallTint: 0x8a5a44, ceil: 0x3a2018, door: 0x1c120c });
    const { X, Y, Z } = q;
    slab(0x6a1a20, 30, 0.012, 18, X, Y + 0.005, Z - 1);                                                                                           // the carpet, red once
    for (let r = 0; r < 3; r++) for (let n = 0; n < 7; n++) { const x = -12 + n * 1.3, z = -4 + r * 3.4; q.block(0x3a2a24, 0.9, 1.5, 0.7, x, z, M.plain); slab([0x3a5a6a, 0x5a3a2a, 0x2a3a2a][(n + r) % 3], 0.6, 0.42, 0.05, X + x, Y + 0.95, Z + z + 0.36); slab(0xd9a520, 0.7, 0.06, 0.06, X + x, Y + 1.5, Z + z + 0.36); }
    // The bar, along the east wall, and what is left behind it.
    q.block(0x3a1c10, 0.9, 1.1, 9, 13, -2, M.wood, 2); slab(0x14080f, 1.1, 0.06, 9.2, X + 13, Y + 1.1, Z - 2);
    slab(0x2a1810, 0.4, 2.6, 9, X + 16.4, Y + 1.2, Z - 2, M.wood, 2); for (let n = 0; n < 26; n++) put(M.plain, new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6).translate(X + 16.3, Y + 1.5 + Math.floor(n / 13) * 0.7, Z - 6 + (n % 13) * 0.62), [0xd9a520, 0x2f7d46, 0x8a5a2a, 0xe9e2cf][n % 4]);
    for (let n = 0; n < 4; n++) post(0x1c1c22, 0.22, 0.75, X + 11.6, Y, Z - 5 + n * 2, 10);
    q.bottle = q.at(12.9, -1);
    // The piano, lid up, and the dog asleep beside it.
    { const px = X + 6, pz = Z + 7; slab(0x0c0a0a, 2.2, 0.35, 1.5, px, Y + 0.7, pz); put(M.plain, new THREE.BoxGeometry(2.1, 0.05, 1.4).rotateX(-0.6).translate(px, Y + 1.5, pz - 0.4), 0x0c0a0a); slab(0xf0ece0, 1.6, 0.04, 0.22, px, Y + 1.05, pz + 0.7); for (const [dx, dz] of [[-0.9, -0.6], [0.9, -0.6], [0, 0.6]]) post(0x0c0a0a, 0.06, 0.7, px + dx, Y, pz + dz, 6); collide(px, pz, 2.4, 1.8, 1.2);
      slab(0x2a1810, 1, 0.08, 0.36, px, Y + 0.5, pz + 1.2, M.wood, 1); }
    { const dx = X + 3.4, dz = Z + 7.6; // a big dog, lying down, head on paws
      slab(0x8a6a4a, 1.0, 0.36, 0.42, dx, Y, dz); slab(0x8a6a4a, 0.32, 0.26, 0.3, dx + 0.62, Y + 0.02, dz + 0.04); slab(0x6a4a34, 0.22, 0.12, 0.2, dx + 0.84, Y + 0.02, dz + 0.04);
      for (const s of [-1, 1]) slab(0x6a4a34, 0.06, 0.12, 0.08, dx + 0.6, Y + 0.26, dz + s * 0.11); for (const s of [-0.12, 0.12]) slab(0x8a6a4a, 0.4, 0.1, 0.1, dx + 0.62, Y, dz + s + 0.2);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07).translate(-0.21, 0, 0), new THREE.MeshLambertMaterial({ color: 0x8a6a4a })); tail.position.set(dx - 0.5, Y + 0.2, dz); scene.add(tail);
      updaters.push(t => { tail.rotation.y = Math.sin(t * 2.2) * 0.25; }); q.dog = { x: dx, z: dz }; }
    // The stage at the back: a curtain, a ring of footlights, and somebody singing who is not there.
    slab(0x2a1810, 14, 0.8, 5, X - 6, Y, Z - 9.4, M.wood, 2); collide(X - 6, Z - 9.4, 14, 5, 0.8);
    slab(0x7a1018, 14, 5.2, 0.2, X - 6, Y + 0.8, Z - 11.7); for (let n = 0; n < 16; n++) slab(0x5a0a10, 0.14, 5.2, 0.24, X - 13 + n * 0.93, Y + 0.8, Z - 11.6);
    for (let n = 0; n < 12; n++) ball(0xffd9a0, 0.08, X - 12 + n * 1.1, Y + 0.85, Z - 7, M.glow);
    { const singer = makeHuman({ jacket: 0xf4f0e6, shirt: 0x16161c, tucked: true, pants: 0xf4f0e6, hair: 0x111111, hairMesh: 'parted', height: 1.02 });
      singer.group.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; o.material.emissive?.set(0x6a7ac0); if (o.material.emissiveIntensity !== undefined) o.material.emissiveIntensity = 0.8; o.castShadow = false; } });
      singer.group.position.set(X - 6, Y + 0.8, Z - 9.6); singer.set('dance'); scene.add(singer.group); q.singer = singer;
      updaters.push(t => { singer.group.visible = Math.sin(t * 9) > -0.9 && Math.sin(t * 0.7) > -0.6; }); }
    // Card tables with the cards still on them, a chandelier, the orange light coming in through the boards on the windows.
    for (const [x, z] of [[-2, 3], [2, -2], [-7, 4]]) { post(0x1c120c, 0.08, 0.75, X + x, Y, Z + z, 8); put(M.plain, new THREE.CylinderGeometry(0.9, 0.9, 0.06, 16).translate(X + x, Y + 0.78, Z + z), 0x1f5a3a); for (let n = 0; n < 5; n++) slab(0xf4f0e6, 0.12, 0.01, 0.17, X + x - 0.3 + n * 0.15, Y + 0.82, Z + z + 0.2); collide(X + x, Z + z, 1.8, 1.8, 0.9, true); }
    for (let n = 0; n < 18; n++) { const a = n / 18 * Math.PI * 2; put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4).translate(X + Math.cos(a) * 1.4, Y + 5.2, Z + Math.sin(a) * 1.4), 0xd9a520); ball(0xffe2b0, 0.07, X + Math.cos(a) * 1.4, Y + 4.98, Z + Math.sin(a) * 1.4, M.glow); }
    for (const z of [-6, 0, 6]) { for (let n = 0; n < 5; n++) slab(0xff9a40, 0.05, 0.22, 2.2, X - 16.82, Y + 1.4 + n * 0.42, Z + z, M.glow); slab(0x3a2416, 0.08, 2.4, 2.4, X - 16.86, Y + 1.2, Z + z, M.wood, 1); }
    q.light(0, 5, 0, 0xffd9a8, 34, 16); q.light(13, 2.6, -2, 0xffc890, 12, 8); q.light(-6, 3.2, -8, 0x9ab0ff, 14, 8); q.light(-15, 2, 0, 0xff9a40, 18, 12); q.light(6, 2.5, 7, 0xffd0a0, 10, 7);
    q.deckard = q.at(6, -1); q.luv = q.at(-10, 6); q.k = q.at(0, 8);
    sets.casino = q;
  }

  // ================= The top of the sea wall, thirty metres up, the ocean on one side and the city on the other =================
  {
    const AX = 3600, AZ = 900, L = 240, Hd = 30;
    slab(0x55555e, 14, 0.8, L, AX, -0.9, AZ, M.gravel, 6);                                                                                         // the walkway
    slab(0x4a4a52, 12, Hd, L, AX, -Hd - 0.9, AZ, M.gravel, 8);                                                                                     // the wall under it
    for (const s of [-1, 1]) { slab(0x3a3a42, 0.7, 1.3, L, AX + s * 6.6, -0.1, AZ, M.gravel, 3); }                                                 // parapets
    for (let z = AZ - L / 2 + 6; z < AZ + L / 2; z += 24) { post(0x8a8d96, 0.07, 2.6, AX - 6.6, 1.2, z, 5); ball(0xff3b3b, 0.3, AX - 6.6, 4, z, M.glow); halo(AX - 6.6, 4, z, 0xff3030, 4); slab(0x44444c, 5, Hd - 2, 7, AX - 9, -Hd - 0.9, z, M.gravel, 6); }
    for (let z = AZ - L / 2 + 10; z < AZ + L / 2; z += 9) slab(0x2a2a30, 0.9, 0.06, 0.5, AX + 4.6, -0.07, z);                                    // drain grates along the sea side
    slab(0x2a2a30, 1.4, 0.4, L, AX + 5.2, -0.5, AZ);
    // The flooded channel where the sea comes over and lies.
    const channel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, L).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x1a3038, shininess: 90, specular: 0x7a9aa8, transparent: true, opacity: 0.85 }));
    channel.position.set(AX + 5.3, -0.12, AZ); scene.add(channel);
    // The sea, below, heaving; and the city on the other side, nothing but lit windows in the rain.
    const seaGeo = new THREE.PlaneGeometry(600, 600, 90, 90).rotateX(-Math.PI / 2).translate(AX + 306, -24, AZ), sp = seaGeo.attributes.position, sc = new Float32Array(sp.count * 3);
    seaGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sea = new THREE.Mesh(seaGeo, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x9ab8c8, flatShading: true })); scene.add(sea);
    let seaT = -1;
    updaters.push(t => { const e = places.sky?.position; if (!e || Math.abs(e.x - AX) > 400 || Math.abs(e.z - AZ) > 400 || t - seaT < 0.05) return; seaT = t; // only while somebody is up there to see it
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i), near = Math.max(0, 1 - (x - AX) / 160);
        const y = Math.sin(x * 0.11 + t * 1.6 + Math.sin(z * 0.03)) * (0.9 + near * 1.4) + Math.sin(z * 0.17 - t * 1.1) * 0.45 + Math.sin((x - z) * 0.23 + t * 2.3) * 0.3;
        sp.setY(i, -24 + y); const foam = Math.max(0, Math.min(1, (y - 0.8) / 1.2)) + (x - AX < 14 ? 0.5 : 0);
        sc[i * 3] = 0.05 + foam * 0.55; sc[i * 3 + 1] = 0.1 + foam * 0.58; sc[i * 3 + 2] = 0.12 + foam * 0.58; }
      sp.needsUpdate = true; seaGeo.attributes.color.needsUpdate = true; seaGeo.computeVertexNormals(); });
    put(M.plain, new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2).translate(AX - 355, -31, AZ), 0x101014);                                // the city's ground, far down
    for (let n = 0; n < 46; n++) { const x = AX - 110 - rnd() * 300, z = AZ + (rnd() - 0.5) * 560, w = 18 + rnd() * 30, ht = 40 + rnd() * 150; leant(M.megas[n % M.megas.length], 0xffffff, w, ht, w * (0.7 + rnd() * 0.6), x, -31, z, 0, 0, [30, 40]); }
    const q = { minX: AX - 6.1, maxX: AX + 6.1, minZ: AZ - L / 2 + 2, maxZ: AZ + L / 2 - 2, lights: [], X: AX, Y: -0.1, Z: AZ, open: true,
      climate: { hemi: [0x8a9ab8, 0x2a2c34, 1.15], sun: [0xb8c8e8, 0.8], fog: [0x1c222c, 24, 300], dry: false, sky: true } };
    q.lights.push({ x: AX - 4, y: 6, z: AZ, hex: 0xffd0c0, power: 30, reach: 26 }, { x: AX + 3, y: 5, z: AZ + 14, hex: 0x9ab8ff, power: 20, reach: 24 });
    interiors.push(q);
    const puff = texture(128, 128, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(230,240,245,0.4)'); gr.addColorStop(1, 'rgba(230,240,245,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); for (let n = 0; n < 300; n++) { c.fillStyle = 'rgba(255,255,255,0.25)'; const a = rnd() * 6.28, r = rnd() * w * 0.45; c.fillRect(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 2, 2); } });
    puff.colorSpace = THREE.NoColorSpace;
    // The sea coming over: a sheet of white water across the walkway every few seconds. `surge()` is true while it is on the stones.
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), new THREE.MeshBasicMaterial({ map: puff, color: 0xd8e6ee, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    sheet.rotation.x = -Math.PI / 2; scene.add(sheet);
    const plumes = Array.from({ length: 10 }, (_, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: puff, color: 0xc8d8e2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; m.position.set(AX + 7.4, 2, AZ - L / 2 + 12 + k * (L / 10)); scene.add(m); return m; });
    const wall = sets.wall = { q, AX, AZ, landing: { x: AX - 1, z: AZ + 30, h: Math.PI }, crash: { x: AX + 1, z: AZ - 6 }, period: 7.5, at: null, surge: () => false };
    updaters.push(t => {
      plumes.forEach((m, k) => { const u = (t * 0.21 + k * 0.31) % 1; m.material.opacity = Math.sin(u * Math.PI) * 0.7; m.position.y = -4 + u * 12; m.scale.setScalar(0.6 + u * 1.5); });
      const u = (t % wall.period) / wall.period, on = u < 0.16, k = u / 0.16, near = wall.at ?? { z: AZ };
      sheet.position.set(AX + 6 - k * 13, 0.15 + Math.sin(k * Math.PI) * 0.4, near.z); sheet.material.opacity = on ? Math.sin(k * Math.PI) * 0.6 : 0;
      wall.surge = () => on && k > 0.2 && k < 0.85; wall.sheetX = AX + 6 - k * 13;
    });
  }

  // ================= Wallace's hall: wood, water, and the light coming off the water onto the walls =================
  {
    const q = rooms.WALLACE = room(40, 30, 14, { floor: M.gravel, floorTint: 0x1a140e, wallTint: 0x8a5a2a, wall: M.wood, wallScale: 2, ceil: 0x1a1008, door: 0x2a1a0c });
    const { X, Y, Z } = q;
    // The moat round the platform, and the light it throws.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(26, 20).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2a1a08, emissive: 0x3a2408, shininess: 120, specular: 0xffd080, transparent: true, opacity: 0.92 }));
    water.position.set(X, Y + 0.02, Z - 2); scene.add(water);
    slab(0x2a1c10, 12, 0.5, 10, X, Y, Z - 2, M.wood, 2); floors.push({ minX: X - 6, maxX: X + 6, minZ: Z - 7, maxZ: Z + 3, y: Y + 0.5 });           // the platform in the middle
    slab(0x2a1c10, 3, 0.3, 9, X, Y, Z + 7.5, M.wood, 1); floors.push({ minX: X - 1.5, maxX: X + 1.5, minZ: Z + 3, maxZ: Z + 12, y0: Y + 0.3, y1: Y + 0.5, from: Z + 12, to: Z + 3 });
    for (const s of [-1, 1]) { collide(X + s * 9.5, Z - 2, 7, 20, 0.6); collide(X + s * 3.75, Z + 5.5, 4.5, 5, 0.6); }                                // the water: walk on the wood, not in it
    collide(X, Z - 10, 26, 4, 0.6);
    const cau = texture(256, 256, (c, w) => { // the net of light that water throws: bright seams between dark cells
      c.fillStyle = '#000'; c.fillRect(0, 0, w, w); c.lineJoin = 'round';
      const pts = Array.from({ length: 26 }, () => [rnd() * w, rnd() * w]);
      for (let y = 0; y < w; y += 2) for (let x = 0; x < w; x += 2) { let a = 1e9, b = 1e9; for (const [px, py] of pts) for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) { const d = Math.hypot(x - px - ox, y - py - oy); if (d < a) { b = a; a = d; } else if (d < b) b = d; } const e = Math.max(0, 1 - (b - a) / 7); if (e > 0) { c.fillStyle = `rgba(255,205,120,${e * e * 0.9})`; c.fillRect(x, y, 2, 2); } }
    });
    const layers = [0, 1].map(k => { const t = cau.clone(); t.needsUpdate = true; t.repeat.set(3 + k, 1.4 + k * 0.5); return new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32 }); });
    for (const mat of layers) for (const [w, x, z, ry] of [[39, 0, -14.6, 0], [39, 0, 14.6, Math.PI], [29, -19.45, 0, Math.PI / 2], [29, 19.45, 0, -Math.PI / 2]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 12), mat); m.position.set(X + x, Y + 6, Z + z); m.rotation.y = ry; scene.add(m); }
    updaters.push(t => { layers[0].map.offset.set(t * 0.018, Math.sin(t * 0.3) * 0.05); layers[1].map.offset.set(-t * 0.012, t * 0.02); });
    for (let n = 0; n < 14; n++) slab(0x6a4220, 0.12, 13, 0.4, X - 19.6, Y, Z - 13 + n * 2, M.wood, 1);                                              // the slats down the long walls
    for (let n = 0; n < 14; n++) slab(0x6a4220, 0.12, 13, 0.4, X + 19.6, Y, Z - 13 + n * 2, M.wood, 1);
    for (const x of [-12, 0, 12]) slab(0xffd890, 2.4, 0.1, 26, X + x, Y + 13.8, Z, M.glow);                                                         // slots of daylight in the ceiling
    slab(0x2a1a0c, 1.2, 1.2, 1.2, X, Y + 0.5, Z - 4); q.chair = { x: X, y: Y + 0.5, z: Z - 1.5, h: Math.PI };                                       // a block of wood to sit on, nothing else
    q.light(0, 10, -2, 0xffc870, 120, 34); q.light(-12, 6, 6, 0xffb860, 40, 20); q.light(12, 6, -8, 0xffb860, 40, 20); q.light(0, 2, 6, 0xffd090, 14, 10);
    q.walk = [q.at(-4, -5), q.at(4, -5), q.at(4, 1), q.at(-4, 1)];
    q.y = Y + 0.5;
    sets.wallace = q;
  }

  return sets;
}
