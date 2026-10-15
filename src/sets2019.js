import * as THREE from 'three';
import { makeHuman } from './people.js';

// The rooms of 2019 (the first film's story), built only for that year. Nothing here is shared with the later story:
// Deckard's apartment, Tyrell's office, the room where Holden ran his test, Chew's eye lab, the Bradbury (a court of light
// with galleries that can be climbed), its roof, and the woman on the side of a tower who sells pills twenty storeys tall.
export function buildSets2019(h) {
  const { scene, M, put, slab, post, ball, collide, sign, halo, updaters, places, rooms, interiors, floors, room, texture, CURB } = h;
  const rnd = (() => { let a = 1982; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const lam = opts => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  const sets = {};

  // ================= Deckard's apartment: patterned concrete blocks, a piano covered in photographs, a lift to the door =================
  {
    const blocks = texture(128, 128, (c, w) => { c.fillStyle = '#7a6a58'; c.fillRect(0, 0, w, w); c.strokeStyle = '#4a3e32'; c.lineWidth = 3; c.strokeRect(1, 1, w - 2, w - 2); // a cast block with a stepped pattern in relief
      c.fillStyle = '#8a7a66'; for (const [x, y, s] of [[16, 16, 96], [32, 32, 64], [48, 48, 32]]) { c.fillRect(x, y, s, s); c.strokeStyle = '#5a4c3e'; c.lineWidth = 2; c.strokeRect(x, y, s, s); }
      c.fillStyle = '#6a5a4a'; c.fillRect(56, 0, 16, 16); c.fillRect(56, 112, 16, 16); c.fillRect(0, 56, 16, 16); c.fillRect(112, 56, 16, 16); });
    M.textile = lam({ map: blocks });
    const q = rooms.DFLAT = room(14, 10, 3.2, { floor: M.wood, floorTint: 0x4a3828, floorScale: 1.2, wall: M.textile, wallTint: 0xd8c8b0, wallScale: 1, ceil: 0x2a2018, door: 0x2a2a30, doorX: -4 });
    const { X, Y, Z } = q;
    // The piano against the north wall, its top crowded with old photographs in frames.
    q.block(0x0c0a0a, 1.6, 1.25, 0.6, 2, -4.4); slab(0xf0ece0, 1.4, 0.04, 0.2, X + 2, Y + 0.75, Z - 4.02); post(0x0c0a0a, 0.2, 0.45, X + 2, Y, Z - 3.4, 6);
    for (let n = 0; n < 9; n++) { const fx = X + 1.35 + (n % 5) * 0.3, fz = Z - 4.45 + Math.floor(n / 5) * 0.18; slab(0x8a6a44, 0.2, 0.26, 0.02, fx, Y + 1.25, fz); slab([0xc8b89a, 0x9a8a72, 0xb0a088][n % 3], 0.16, 0.2, 0.03, fx, Y + 1.28, fz); }
    q.piano = { x: X + 2, z: Z - 3.3, h: Math.PI };
    // A sofa and a low table, a lamp, the kitchen counter with the bottle, a bed in an alcove behind a screen.
    q.block(0x3a2a24, 2.4, 0.45, 0.9, -2, 0.6); slab(0x2a1e18, 2.4, 0.5, 0.2, X - 2, Y + 0.45, Z + 1.0); q.sofa = { x: X - 2, y: Y, z: Z + 0.5, h: Math.PI };
    q.block(0x2a1e18, 1.2, 0.4, 0.7, -2, -0.7); for (let n = 0; n < 3; n++) put(M.plain, new THREE.CylinderGeometry(0.04, 0.05, 0.2, 6).translate(X - 2.3 + n * 0.25, Y + 0.5, Z - 0.7), [0xd9a520, 0xe9e2cf, 0x8a5a2a][n]);
    post(0x2a2a30, 0.04, 1.5, X - 3.6, Y, Z + 1.2, 5); put(M.glow, new THREE.ConeGeometry(0.26, 0.3, 10, 1, true).translate(X - 3.6, Y + 1.6, Z + 1.2), 0xffd9a0);
    q.block(0x3a3a40, 3, 1, 0.7, 4.6, 1.8); slab(0x1c1c22, 3.1, 0.05, 0.8, X + 4.6, Y + 1, Z + 1.8); put(M.plain, new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6).translate(X + 4, Y + 1.15, Z + 1.8), 0xd9a520);
    q.bottle = q.at(4, 1.2);
    q.block(0x3a2a24, 2.2, 0.45, 1.9, -5.6, -3.6); slab(0xc8b8a0, 2.1, 0.12, 1.8, X - 5.6, Y + 0.45, Z - 3.6); slab(0x9a8a72, 0.6, 0.1, 0.4, X - 6.3, Y + 0.58, Z - 3.6);
    q.bed = { x: X - 5.6, y: Y + 0.45, z: Z - 3.6 };
    for (let n = 0; n < 4; n++) slab(0x5a4632, 0.06, 2, 0.5, X - 4.4, Y, Z - 4.6 + n * 0.55, M.wood, 1);                                                 // the screen in front of the alcove
    // The machine that reads photographs: a set on a stand by the window, its screen a soft blue.
    q.block(0x2a2a30, 0.8, 0.8, 0.6, 5.6, -3.6); slab(0x2a2a30, 0.7, 0.6, 0.5, X + 5.6, Y + 0.8, Z - 3.6); slab(0x6a90c0, 0.5, 0.4, 0.02, X + 5.6, Y + 0.9, Z - 3.34, M.glow);
    q.esper = { x: X + 5.4, z: Z - 2.6, h: Math.PI }; q.esperScreen = { x: X + 5.6, y: Y + 1.1, z: Z - 3.33 };
    // The window: the city's lights, and now and then a searchlight sweeping through the blinds.
    q.window(6.82, -0.5, 3.6, 2, 1.6, -Math.PI / 2, 0x2a3a5a); for (let n = 0; n < 12; n++) slab(0x3a3a40, 0.03, 0.04, 3.6, X + 6.78, Y + 0.7 + n * 0.17, Z - 0.5);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(X + 5, Y + 1.4, Z - 0.5); beam.rotation.y = Math.PI / 2; scene.add(beam);
    updaters.push(t => { const u = (t * 0.13) % 1; beam.material.opacity = u < 0.12 ? Math.sin(u / 0.12 * Math.PI) * 0.22 : 0; beam.position.z = Z - 2.4 + u / 0.12 * 3.8; });
    q.light(0, 2.8, 0, 0xffd0a0, 18, 10); q.light(-3.6, 1.7, 1.2, 0xffc890, 10, 5); q.light(5.4, 1.4, -3, 0x8fb0e0, 6, 4); q.light(2, 2, -3.6, 0xffd9a8, 8, 5);
    q.lift = q.at(-4, 3.6); q.rachaelAt = q.at(-3, 2.6);
    sets.flat = q;
  }

  // ================= Tyrell's office: columns, a window the size of a wall with the sun in it, an owl on a perch =================
  {
    const q = rooms.TYRELL = room(30, 22, 9, { floor: M.gravel, floorTint: 0x3a3028, floorScale: 4, wall: M.plain, wallTint: 0x6a5440, ceil: 0x2a2018, door: 0x1c1410 });
    const { X, Y, Z } = q;
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(29, 21).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2a2018, specular: 0xffb060, shininess: 90, transparent: true, opacity: 0.55 }));
    shine.position.set(X, Y + 0.01, Z); scene.add(shine);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const cx = X - 10.5 + k * 7, cz = Z + s * 6; put(M.plain, new THREE.CylinderGeometry(1.1, 1.3, 9, 8).translate(cx, Y + 4.5, cz), 0x5a4634); for (let r = 0; r < 6; r++) slab(0x6a5440, 2.8, 0.18, 2.8, cx, Y + 1 + r * 1.4, cz); collide(cx, cz, 2.6, 2.6, 9); }
    // The north wall is all window: the sun going down in the smog, and the city under it.
    const sky = texture(512, 256, (c, w, h2) => { const gr = c.createLinearGradient(0, 0, 0, h2); gr.addColorStop(0, '#5a2a18'); gr.addColorStop(0.55, '#e8803a'); gr.addColorStop(0.75, '#ffb860'); gr.addColorStop(1, '#3a1c10'); c.fillStyle = gr; c.fillRect(0, 0, w, h2);
      const sg = c.createRadialGradient(w * 0.62, h2 * 0.68, 4, w * 0.62, h2 * 0.68, 70); sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(0.3, 'rgba(255,200,120,0.7)'); sg.addColorStop(1, 'rgba(255,160,80,0)'); c.fillStyle = sg; c.fillRect(0, 0, w, h2);
      for (let n = 0; n < 60; n++) { const bx = rnd() * w, bh = 20 + rnd() * 70, bw = 8 + rnd() * 20; c.fillStyle = '#1c100a'; c.fillRect(bx, h2 - bh, bw, bh); } });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(28, 8), new THREE.MeshBasicMaterial({ map: sky })); win.position.set(X, Y + 4.6, Z - 10.6); scene.add(win);
    for (let k = 0; k < 9; k++) slab(0x1c1410, 0.3, 8.6, 0.3, X - 13 + k * 3.25, Y, Z - 10.5); for (const yy of [2.6, 5.6]) slab(0x1c1410, 28, 0.2, 0.3, X, Y + yy, Z - 10.5);
    // The long desk, a chair behind it, and the owl.
    q.block(0x2a1c12, 5, 0.8, 1.6, 0, -6.4, M.wood, 2); slab(0x1c120c, 5.2, 0.06, 1.8, X, Y + 0.8, Z - 6.4); q.block(0x3a2a20, 0.8, 1.4, 0.8, 0, -7.8);
    post(0x2a1c12, 0.04, 1.6, X + 4.5, Y, Z - 7.6, 5); slab(0x2a1c12, 0.5, 0.06, 0.06, X + 4.5, Y + 1.6, Z - 7.6);
    { const owl = new THREE.Group(), feather = new THREE.MeshLambertMaterial({ color: 0x8a7050 }), face = new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }), eye = new THREE.MeshBasicMaterial({ color: 0xffa020 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.4, 0.9), feather); body.position.y = 0.26; owl.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), feather); head.position.y = 0.58; owl.add(head);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), face); disc.position.set(0, 0.58, 0.13); owl.add(disc);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), eye); e.position.set(s * 0.05, 0.6, 0.155); owl.add(e); }
      owl.position.set(X + 4.5, Y + 1.63, Z - 7.6); owl.rotation.y = 0.4; scene.add(owl);
      updaters.push(t => { head.rotation.y = Math.sin(t * 0.4) > 0.6 ? 0.9 : Math.sin(t * 0.4) < -0.7 ? -0.6 : 0; }); }
    // The table where the test is run: two chairs, the machine between them.
    q.block(0x2a1c12, 2.2, 0.75, 1, -6, 2); for (const s of [-1, 1]) q.block(0x3a2a20, 0.5, 0.46, 0.5, -6 + s * 1.5, 2, M.plain);
    slab(0x3a3a44, 0.6, 0.18, 0.4, X - 6, Y + 0.75, Z + 2); put(M.plain, new THREE.CylinderGeometry(0.12, 0.16, 0.24, 8).translate(X - 5.8, Y + 1.05, Z + 2), 0x5a5a62); slab(0x8fb0ff, 0.2, 0.12, 0.02, X - 6.1, Y + 0.95, Z + 2.21, M.glow);
    q.table = { x: X - 6, z: Z + 2 }; q.tyrell = { x: X + 0.4, y: Y, z: Z - 5.2, h: 0 }; q.chairs = { her: { x: X - 7.5, z: Z + 2, h: Math.PI / 2 }, him: { x: X - 4.5, z: Z + 2, h: -Math.PI / 2 } };
    q.light(0, 7, -6, 0xffb060, 90, 30); q.light(-8, 4, 3, 0xffa050, 36, 16); q.light(8, 4, 3, 0xffa050, 30, 16); q.light(0, 2, 8, 0xffd0a0, 12, 10);
    sets.tyrell = q;
  }

  // ================= The interview room where Holden asked his questions: a desk, the machine, smoke, a fan going round =================
  {
    const q = rooms.INTERVIEW = room(9, 7, 3.4, { floor: M.gravel, floorTint: 0x3a3a40, wall: M.plain, wallTint: 0x5a5a62, ceil: 0x2a2a30, door: 0x2a2a30 });
    const { X, Y, Z } = q;
    q.block(0x3a3a44, 1.8, 0.75, 0.9, 0, -1); for (const s of [-1, 1]) q.block(0x2a2a30, 0.5, 0.46, 0.5, 0, -1 + s * 1.2, M.plain);
    slab(0x2a2a30, 0.5, 0.2, 0.4, X, Y + 0.75, Z - 1.1); slab(0x8fb0ff, 0.22, 0.14, 0.02, X, Y + 0.85, Z - 0.88, M.glow); put(M.plain, new THREE.CylinderGeometry(0.1, 0.14, 0.2, 8).translate(X + 0.3, Y + 0.95, Z - 1.1), 0x5a5a62);
    for (let n = 0; n < 6; n++) slab(0xcfe0ff, 0.3, 2.2, 0.04, X - 2.5 + n * 1, Y + 0.6, Z - 3.45, M.glow);                                                                    // light through slats
    const fan = new THREE.Group(); for (let n = 0; n < 3; n++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.22).translate(0.65, 0, 0), new THREE.MeshLambertMaterial({ color: 0x3a3a40 })); b.rotation.y = n * 2.09; fan.add(b); }
    fan.position.set(X, Y + 3.1, Z - 0.6); scene.add(fan); updaters.push(t => { fan.rotation.y = t * 2.4; });
    const smoke = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: 0xcfd8e0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
    smoke.position.set(X, Y + 2.4, Z - 1); smoke.rotation.x = -Math.PI / 2.4; scene.add(smoke); updaters.push(t => { smoke.material.opacity = 0.05 + Math.sin(t * 0.5) * 0.02; });
    q.light(0, 2.8, -1, 0xd8e0ff, 22, 8); q.light(0, 1.2, -3, 0x9ab0e0, 8, 5);
    q.asker = { x: X, z: Z - 2.2, h: 0 }; q.subject = { x: X, z: Z + 0.2, h: Math.PI };
    sets.interview = q;
  }

  // ================= Chew's lab: a cold room, frost on everything, eyes in jars =================
  {
    const q = rooms.CHEW = room(12, 9, 3.2, { floor: M.plain, floorTint: 0xb8c8d8, wall: M.plain, wallTint: 0xd8e4ee, ceil: 0xe9f0f6, door: 0x8a9aa8 });
    const { X, Y, Z } = q;
    for (const [x, z] of [[-3, -2.6], [2, -2.6], [-3, 1.4]]) { q.block(0xc8d4de, 2.6, 0.9, 1, x, z); for (let n = 0; n < 6; n++) { put(M.plain, new THREE.CylinderGeometry(0.1, 0.1, 0.24, 10).translate(X + x - 1 + n * 0.4, Y + 1.02, Z + z), 0xe8f4ff); ball(0xf4f4f0, 0.05, X + x - 1 + n * 0.4, Y + 1.0, Z + z); ball(0x3a6a8a, 0.022, X + x - 1 + n * 0.4, Y + 1.0, Z + z + 0.045); } }
    for (let n = 0; n < 10; n++) { post(0x9ab0c0, 0.02, 0.6, X - 5 + n * 1.1, Y + 2.6, Z - 4.2, 4); ball(0xf4f4f0, 0.1, X - 5 + n * 1.1, Y + 2.5, Z - 4.2); }          // eyes hung up to dry, like onions
    const frost = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3).map((_, i) => i % 3 === 0 ? X + (rnd() - 0.5) * 11 : i % 3 === 1 ? Y + rnd() * 3 : Z + (rnd() - 0.5) * 8), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false }));
    scene.add(frost); updaters.push(t => { frost.rotation.y = Math.sin(t * 0.1) * 0.01; frost.position.y = Math.sin(t * 0.7) * 0.05; });
    q.light(0, 2.9, -1, 0xcfe8ff, 30, 10); q.light(-3, 1.6, 2, 0x9fd0ff, 12, 6);
    q.chew = { x: X + 2, y: Y, z: Z - 1.6, h: Math.PI }; q.roy = { x: X - 1, y: Y, z: Z + 2.4, h: Math.PI }; q.leon = { x: X + 1.6, y: Y, z: Z + 2.8, h: Math.PI };
    sets.chew = q;
  }

  // ================= The Bradbury, inside: a court of light five storeys high, galleries of iron round it, stairs going up =================
  // The ground knows one height per spot, so the way up is a spiral that never passes over itself: the hall along the south side,
  // a flight up the east side to the north gallery (Sebastian's rooms), a flight up the west side to the top landing, the roof door.
  {
    const W = 40, D = 34, HT = 24, IRON = 0x2a2a2e, BRICK = 0x8a5a40, MARBLE = 0xd8d0c0;
    const q = rooms.BRADBURY = room(W, D, HT, { floor: M.paver, floorTint: MARBLE, floorScale: 2, wall: M.brick, wallTint: BRICK, wallScale: 3, ceil: 0x9ab0c0, door: 0x2a1c12 });
    const { X, Y, Z } = q, L1 = 6, L2 = 12;
    // The court, open to the glass roof: marble below, a lift in an iron cage up the middle.
    collide(X, Z, 20, 16, HT);                                                                                                                              // nobody walks in the court: it is the well everything looks into
    slab(0xc8c0b0, 20, 0.02, 16, X, Y + 0.01, Z); for (let n = 0; n < 9; n++) slab(0x9a8a72, 0.06, 0.03, 16, X - 8 + n * 2, Y + 0.02, Z);
    for (const s of [-1, 1]) for (const t of [-1, 1]) post(IRON, 0.08, HT - 2, X + s * 1.2, Y, Z + t * 1.2, 6);
    for (let k = 0; k < 9; k++) slab(IRON, 2.6, 0.08, 2.6, X, Y + 1 + k * 2.6, Z);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 2), new THREE.MeshLambertMaterial({ color: 0x3a3028 })); scene.add(cage);
    updaters.push(t => { cage.position.set(X, Y + 1.3 + (Math.sin(t * 0.15) * 0.5 + 0.5) * 16, Z); });
    put(M.glow, new THREE.PlaneGeometry(20, 16).rotateX(Math.PI / 2).translate(X, Y + HT - 0.3, Z), 0x7a90a8);                                            // the glass roof, grey with rain
    // The levels: L0 the hall (south), the east flight, L1 the north gallery, the west flight, L2 the landing (south-west).
    floors.push({ minX: X + 10, maxX: X + 20, minZ: Z - 8, maxZ: Z + 8, y0: Y, y1: Y + L1, from: Z + 8, to: Z - 8 });
    floors.push({ minX: X - 20, maxX: X + 20, minZ: Z - 17, maxZ: Z - 8, y: Y + L1 });
    floors.push({ minX: X - 20, maxX: X - 10, minZ: Z - 8, maxZ: Z + 8, y0: Y + L1, y1: Y + L2, from: Z - 8, to: Z + 8 });
    floors.push({ minX: X - 20, maxX: X - 10, minZ: Z + 8, maxZ: Z + 17, y: Y + L2 });
    collide(X - 10, Z + 12.5, 0.4, 9, HT);                                                                                                                  // the hall and the landing over it are not joined
    // What they look like: decks of iron and tile on brackets, rails with iron lace in them, the flights of stairs.
    const deck = (x0, x1, z0, z1, y) => { slab(0x8a7a66, x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, y - 0.3, (z0 + z1) / 2, M.paver, 2); slab(IRON, x1 - x0, 0.5, 0.2, (x0 + x1) / 2, y - 0.8, z1 > 0 && z0 >= 0 ? z0 : z1); };
    deck(X - 20, X + 20, Z - 17, Z - 8, Y + L1); deck(X - 20, X - 10, Z + 8, Z + 17, Y + L2);
    for (let lv = 1; lv <= 3; lv++) for (const [x0, x1, z0, z1] of [[X - 10, X + 10, Z + 8, Z + 8.3], [X - 10, X + 10, Z - 8.3, Z - 8], [X + 10, X + 10.3, Z - 8, Z + 8], [X - 10.3, X - 10, Z - 8, Z + 8]]) {
      const yy = Y + lv * 6 - (lv === 1 ? 0 : 0); slab(IRON, x1 - x0 || 0.1, 0.12, z1 - z0 || 0.1, (x0 + x1) / 2, yy + 1, (z0 + z1) / 2); slab(0xc8a060, x1 - x0 || 0.1, 0.06, z1 - z0 || 0.1, (x0 + x1) / 2, yy + 1.08, (z0 + z1) / 2);
      const n = Math.round(Math.max(x1 - x0, z1 - z0) / 0.5); for (let k = 0; k <= n; k++) { const f = k / n; post(IRON, 0.02, 1, x0 + (x1 - x0) * f, yy, z0 + (z1 - z0) * f, 4); }
      slab(0x3a2a20, x1 - x0 || 0.3, 0.6, z1 - z0 || 0.3, (x0 + x1) / 2, yy - 0.6, (z0 + z1) / 2, M.wood, 1);                                            // the gallery's edge, every floor
    }
    const flight = (x, z0, z1, y0, y1) => { const len = Math.abs(z1 - z0), rise = y1 - y0, a = Math.atan2(rise, len) * Math.sign(z0 - z1); for (let k = 0; k < 24; k++) { const f = k / 24; slab(0x6a5a48, 9.6, 0.12, len / 24 + 0.05, x, y0 + rise * f, z0 + (z1 - z0) * f, M.wood, 1); } put(M.plain, new THREE.BoxGeometry(0.3, 0.8, Math.hypot(len, rise)).rotateX(a).translate(x + 4.9, (y0 + y1) / 2 + 0.6, (z0 + z1) / 2), IRON); };
    flight(X + 15, Z + 8, Z - 8, Y, Y + L1); flight(X - 15, Z - 8, Z + 8, Y + L1, Y + L2);
    // Sebastian's rooms along the north gallery: toys everywhere, some of them walking.
    const toyCols = [0xd8342c, 0x2f56c8, 0xffe066, 0xf4f4f0, 0x2f7d46, 0x8a5a2a];
    for (let n = 0; n < 26; n++) { const tx = X - 18 + rnd() * 26, tz = Z - 16 + rnd() * 6.5; if (Math.abs(tz - (Z - 12.5)) < 1.2) continue; slab(toyCols[n % 6], 0.3 + rnd() * 0.3, 0.4 + rnd() * 0.8, 0.3, tx, Y + L1, tz); ball(0xf0d8c0, 0.12, tx, Y + L1 + 1.0 + rnd() * 0.3, tz); }
    for (const [x, hex] of [[-16, 0x8a1c2a], [-6, 0x3a3a44]]) { q.block(0x3a2a20, 3, 0.8, 1.2, x, -15.6, M.wood, 1, L1); }                               // workbenches
    for (let n = 0; n < 4; n++) { const toy = makeHuman({ shirt: toyCols[n], pants: toyCols[(n + 2) % 6], hair: 0x2b1b12, hairMesh: 'buzzed', height: 0.5 }); toy.group.position.set(X - 14 + n * 3, Y + L1, Z - 15); toy.set('walk', 0.6); scene.add(toy.group); q.ambient.push(toy);
      updaters.push(t => { toy.group.position.x = X - 14 + n * 3 + Math.sin(t * 0.4 + n) * 1.2; toy.group.rotation.y = Math.cos(t * 0.4 + n) > 0 ? Math.PI / 2 : -Math.PI / 2; }); }
    // Doors along the hall, a lamp at each, brick everywhere, rain coming in at one corner of the glass.
    for (let k = 0; k < 6; k++) { slab(0x2a1c12, 1.2, 2.4, 0.1, X - 8 + k * 5, Y, Z + 16.8); ball(0xffd9a0, 0.14, X - 7 + k * 5, Y + 2.6, Z + 16.6, M.glow); }
    const drips = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 6), 3)), new THREE.LineBasicMaterial({ color: 0x9fb0c8, transparent: true, opacity: 0.35 }));
    drips.frustumCulled = false; scene.add(drips);
    updaters.push(t => { const a = drips.geometry.attributes.position; for (let k = 0; k < 60; k++) { const x = X + 6 + (k % 6) * 0.6, z = Z - 5 + Math.floor(k / 6) * 0.5, y = Y + HT - ((t * 9 + k * 1.7) % HT); a.setXYZ(k * 2, x, y, z); a.setXYZ(k * 2 + 1, x, y + 0.6, z); } a.needsUpdate = true; });
    q.light(0, HT - 3, 0, 0xb8c8e0, 70, 40); q.light(15, 4, 12, 0xffd0a0, 30, 16); q.light(0, L1 + 2.6, -12.5, 0xffc890, 34, 18); q.light(-15, L2 + 2.6, 12, 0xffd0a0, 26, 14); q.light(-15, L1 + 4, 0, 0x9ab0e0, 20, 14);
    Object.assign(q, { L1, L2, hall: q.at(10, 12.5), stairUp: q.at(15, 7), gallery: q.at(-2, -12.5), pris: { x: X - 10, y: Y + L1, z: Z - 14.8 }, workshop: q.at(-6, -12.5), westFoot: q.at(-15, -9), landing: q.at(-15, 13), roofDoor: q.at(-18.5, 15.6) });
    sets.bradbury = q;
  }

  // ================= The roof of the Bradbury, in the rain, and the next roof across the gap =================
  {
    const RX = 3600, RZ = -900, CONC = 0x3a3634;
    slab(CONC, 30, 0.6, 24, RX, -0.7, RZ, M.gravel, 4); slab(0x2a2624, 30, 60, 24, RX, -60.7, RZ, M.brick, 4);
    slab(CONC, 26, 0.6, 24, RX + 32, 1.2, RZ, M.gravel, 4); slab(0x2a2624, 26, 62, 24, RX + 32, -61, RZ, M.brick, 4);                                       // the next roof, a little higher, across five metres of nothing
    for (const s of [-1, 1]) { slab(0x2a2624, 30, 0.9, 0.4, RX, -0.1, RZ + s * 11.8); slab(0x2a2624, 0.4, 0.9, 24, RX - 14.8, -0.1, RZ); }
    for (const [x, z, w, d, hh] of [[-8, -6, 3, 2, 2.4], [-2, 6, 2, 2, 1.6], [5, -7, 4, 3, 3], [-11, 4, 2, 4, 2]]) { slab(0x4a4440, w, hh, d, RX + x, -0.1, RZ + z); collide(RX + x, RZ + z, w, d, hh); }
    for (let n = 0; n < 6; n++) post(0x55525a, 0.05, 3 + n, RX - 12 + n * 4, -0.1, RZ - 10 + (n % 2) * 3, 4);
    sign(['YUKON', 'HOTEL'], RX + 20, 10, RZ - 11.9, 0, { w: 8, h: 3, color: '#ff5a4a', bg: '#140a0a', size: 0.7 }); sign(['MOTEL'], RX - 30, 8, RZ + 30, Math.PI / 4, { w: 8, h: 2, color: '#ffb347', bg: '#140a0a' });
    for (let n = 0; n < 34; n++) { const x = RX + (rnd() - 0.5) * 360, z = RZ + (rnd() - 0.5) * 360; if (Math.abs(x - RX - 10) < 40 && Math.abs(z - RZ) < 30) continue; const w = 14 + rnd() * 24, ht = 20 + rnd() * 120; put(M.megas[n % M.megas.length], new THREE.BoxGeometry(w, ht, w).translate(x, -70 + ht / 2, z), 0xffffff); }
    put(M.plain, new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2).translate(RX, -70, RZ), 0x0c0a0a);
    const q = { minX: RX - 14.4, maxX: RX + 14.6, minZ: RZ - 11.4, maxZ: RZ + 11.4, lights: [], X: RX, Y: -0.1, Z: RZ, open: true,
      climate: { hemi: [0x8a7a68, 0x2a1c14, 1.0], sun: [0xc8a080, 0.6], fog: [0x1c140e, 30, 300], dry: false, sky: true } };
    q.lights.push({ x: RX + 8, y: 6, z: RZ - 4, hex: 0xffd0b0, power: 26, reach: 24 }, { x: RX - 6, y: 5, z: RZ + 6, hex: 0x8fb0ff, power: 16, reach: 20 });
    interiors.push(q);
    q.edge = { x: RX + 14.4, z: RZ + 2 }; q.door = { x: RX - 12, z: RZ - 8 }; q.mid = { x: RX + 4, z: RZ + 2 };
    sets.roof = q;
  }

  // ================= The woman on the tower: a screen twenty storeys high, a face painted white, a pill, a smile =================
  {
    const mk = places.market?.centre, kinds = places.kinds || {};
    let best = null, bd = 1e9;
    for (const [key, kind] of Object.entries(kinds)) { if (kind !== 'tower') continue; const [i, j] = key.split(',').map(Number); const c = { x: -608 + i * 76 + 38, z: -494 + j * 76 + 38 }; const d = mk ? Math.hypot(c.x - mk.x, c.z - mk.z) : 0; if (d > 60 && d < bd) { bd = d; best = c; } }
    if (best && mk) {
      const W = 30, H = 50, cv = document.createElement('canvas'); cv.width = 256; cv.height = 420; const c = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const draw = t => { // a stylised face, nobody's: white paint, a red mouth, black hair up with long pins, a kimono collar, and a hand
        const bg = c.createLinearGradient(0, 0, 0, 420); bg.addColorStop(0, '#3a1a50'); bg.addColorStop(1, '#a02850'); c.fillStyle = bg; c.fillRect(0, 0, 256, 420); c.strokeStyle = '#ffd0e0'; c.lineWidth = 6; c.strokeRect(3, 3, 250, 414);
        c.fillStyle = '#7a1028'; c.beginPath(); c.moveTo(20, 420); c.lineTo(128, 300); c.lineTo(236, 420); c.fill(); c.fillStyle = '#f0e6d0'; c.beginPath(); c.moveTo(70, 420); c.lineTo(128, 318); c.lineTo(186, 420); c.fill();
        c.fillStyle = '#c89a40'; c.beginPath(); c.moveTo(100, 420); c.lineTo(128, 340); c.lineTo(156, 420); c.fill();
        c.fillStyle = '#0c0a0e'; c.beginPath(); c.ellipse(128, 120, 92, 86, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(128, 48, 60, 40, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#d8b040'; c.lineWidth = 4; for (const [x0, y0, x1, y1] of [[60, 70, 20, 20], [196, 70, 236, 20], [128, 30, 128, 0]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
        c.fillStyle = '#ff4060'; for (const [x, y] of [[40, 40], [216, 40]]) { c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#f6f0ea'; c.beginPath(); c.ellipse(128, 168, 62, 80, 0, 0, Math.PI * 2); c.fill();
        const blink = (t % 5.5) < 0.18; c.fillStyle = '#1a1014';
        for (const s of [-1, 1]) { if (blink) c.fillRect(128 + s * 26 - 14, 152, 28, 3); else { c.beginPath(); c.ellipse(128 + s * 26, 152, 13, 6, s * -0.15, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#c03040'; c.fillRect(128 + s * 26 - 16, 140, 32, 3); c.fillStyle = '#1a1014'; }
        const k = (Math.sin(t * 0.5) * 0.5 + 0.5), lift = Math.max(0, k * 1.4 - 0.4);
        c.fillStyle = '#c0102a'; c.beginPath(); c.ellipse(128, 206, 14, 6 + (k > 0.85 ? 3 : 0), 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f6f0ea'; const hx = 200 - lift * 40, hy = 380 - lift * 160; c.beginPath(); c.ellipse(hx, hy, 26, 34, -0.5, 0, Math.PI * 2); c.fill(); c.fillRect(hx - 10, hy + 20, 26, 80);
        c.fillStyle = k > 0.8 ? 'rgba(0,0,0,0)' : '#ffe066'; c.beginPath(); c.ellipse(hx - 18, hy - 22, 6, 3.5, 0.4, 0, Math.PI * 2); c.fill();
        tex.needsUpdate = true;
      };
      draw(0);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      const dx = mk.x - best.x, dz = mk.z - best.z, side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2);
      const off = 20.2, px = best.x + (side === 1 ? off : side === 3 ? -off : 0), pz = best.z + (side === 0 ? off : side === 2 ? -off : 0), turn = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
      face.position.set(px, 22 + H / 2, pz); face.rotation.y = turn; scene.add(face);
      const glow = new THREE.PointLight(0xff6a8a, 40, 90, 1.4); glow.position.set(px + Math.sin(turn) * 8, 20, pz + Math.cos(turn) * 8); scene.add(glow);
      let last = -1; updaters.push(t => { if (t - last < 0.1) return; last = t; draw(t); glow.intensity = 34 + Math.sin(t * 3) * 6; });
      places.geisha = { x: px, z: pz };
    }
  }

  return sets;
}
