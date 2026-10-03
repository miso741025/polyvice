import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NX, NZ, BLOCK, ROAD, CELL, OX, nodeX, blockCenter, SHORE, bounds, colliders, lowGround, piers, interiors, mulberry32 } from './grid.js';
import { makeHuman } from './people.js';
import { box, makeLook, makeTony, makeDuck, Car } from './entities.js';

const PASTELS = [0xf7a8c4, 0x8fe0d4, 0xffd3a1, 0xc9b6f2, 0xfff1c9, 0x9fd0f5, 0xf5f5f0, 0xff9e8a];
const GLASS_TINTS = [0xffffff, 0xcfe8ff, 0xffd9e8, 0xd6fff4];
const NEONS = ['#ff5fd2', '#49e0d0', '#ffe066', '#ff8a5c', '#8f7bff', '#7dffb0'];
const SHOPS = ['CAFE', 'PAWN', 'LIQUOR', 'DELI', 'VIDEO', 'SURF', 'PIZZA', 'RECORDS', 'BAR', 'TAILOR', 'CIGARS', 'DINER'];
const HOTELS = ['HOTEL', 'OCEAN', 'PALMS', 'DECO', 'VICE', 'CORAL', 'MIAMI'];
const CURB = 0.14;                       // sidewalk height
const FLOOR = 3.4, GROUND = 4.2, BAY = 4; // storey height, shopfront height, width of one window bay
const SPECIAL = { '0,0': 'home', '5,3': 'melfi', '3,5': 'bing', '2,2': 'satriale', '6,1': 'vesuvio', '1,4': 'livia', '0,6': 'grove', '5,5': 'hesh', '0,3': 'kolar',
  '4,0': 'comley', '2,4': 'bodyshop', '6,4': 'school', '4,2': 'cafe', '8,2': 'park', '3,8': 'park', '9,7': 'park', '9,1': 'hospital', '10,5': 'motel' };
const SUN = new THREE.Vector3(1250, 190, 420).normalize();

// ---------- Textures, all drawn in code ----------

function texture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Light and dark specks, so flat fills read as a material.
function grain(g, w, h, n, alpha, rand, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * size, 1 + rand() * size);
  }
}

function surfaces(rand) {
  const flat = (size, color, n, alpha, more) => texture(size, size, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    grain(g, w, h, n, alpha, rand);
    more?.(g, w, h);
  });
  return {
    asphalt: flat(256, '#403e49', 5000, 0.06),
    sand: flat(256, '#f1d9a6', 5000, 0.05),
    gravel: flat(128, '#cfcbd0', 2500, 0.1),
    grass: flat(256, '#55b062', 0, 0, (g, w, h) => {
      for (let i = 0; i < 2600; i++) {
        g.strokeStyle = ['#3f9a52', '#6cc573', '#4aa85a'][i % 3];
        const x = rand() * w, y = rand() * h;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand() * 3 - 1.5, y - 3 - rand() * 3); g.stroke();
      }
    }),
    paver: flat(256, '#dccfd6', 3500, 0.05, (g, w) => {
      g.strokeStyle = 'rgba(90,70,90,.35)'; g.lineWidth = 2;
      for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, w); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
    }),
    brick: flat(256, '#bdb4aa', 0, 0, (g, w) => {
      for (let row = 0; row < 16; row++) for (let col = -1; col < 4; col++) {
        const v = 215 + Math.floor(rand() * 40);
        g.fillStyle = `rgb(${v},${v - 8},${v - 14})`;
        g.fillRect(col * 64 + (row % 2) * 32 + 2, row * 16 + 2, 60, 12);
      }
      grain(g, w, w, 1500, 0.05, rand);
    }),
    siding: flat(64, '#f4f2ee', 300, 0.04, (g, w) => {
      for (let k = 0; k < w; k += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, k, w, 2); g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, k + 2, w, 4); }
    }),
    shingle: flat(128, '#8d8a8e', 0, 0, (g, w) => {
      for (let row = 0; row < 8; row++) for (let col = -1; col < 8; col++) {
        const v = 170 + Math.floor(rand() * 60);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(col * 16 + (row % 2) * 8 + 1, row * 16 + 2, 14, 14);
      }
    }),
    wood: flat(128, '#b98a5e', 600, 0.06, (g, w) => {
      for (let k = 0; k < w; k += 16) { g.fillStyle = 'rgba(40,20,5,.4)'; g.fillRect(k, 0, 2, w); }
    }),
    halo: texture(128, 128, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    }),
  };
}

// One repeat of the road texture is one city cell: a block (hidden under its sidewalk) with half a road on
// every side. The origin is the centre of an intersection, so the pattern tiles across the whole grid.
function roadTexture(rand) {
  return texture(2048, 2048, (g, S) => {
    const m = S / CELL, H = ROAD / 2, wrap = v => (v % CELL + CELL) % CELL;
    g.fillStyle = '#3b3944'; g.fillRect(0, 0, S, S);
    grain(g, S, S, 60000, 0.05, rand, 3);
    // mark(x, z, w, d): a rectangle in metres on the north-south road, repeated on the east-west one.
    const mark = (x, z, w, d, color) => {
      g.fillStyle = color;
      g.fillRect(wrap(x) * m, wrap(z) * m, w * m, d * m);
      g.fillRect(wrap(z) * m, wrap(x) * m, d * m, w * m);
    };
    for (const lane of [-3.6, 3.6]) mark(lane - 1.1, H, 2.2, BLOCK, 'rgba(0,0,0,.1)');           // worn by tyres
    for (let i = 0; i < 90; i++) {                                                               // cracks and patches
      const along = H + rand() * BLOCK, across = -H + rand() * ROAD;
      mark(across, along, 0.06, 1 + rand() * 4, 'rgba(0,0,0,.22)');
      if (i % 9 === 0) mark(across, along, 1.5 + rand() * 2, 2 + rand() * 3, 'rgba(0,0,0,.08)');
    }
    const YELLOW = '#e8c64a', WHITE = '#e9e6ee';
    for (const x of [-0.3, 0.14]) mark(x, H + 5, 0.16, BLOCK - 10, YELLOW);                      // centre line
    for (const x of [-5.7, 5.55]) {
      mark(x, H + 6, 0.14, BLOCK - 12, WHITE);                                                   // parking lane
      for (let z = H + 6; z <= H + BLOCK - 6; z += 6) mark(x < 0 ? -H : 5.55, z, 2.3, 0.12, WHITE);
    }
    mark(0.3, H + 4.2, 5.3, 0.45, WHITE); mark(-5.6, H + BLOCK - 4.65, 5.3, 0.45, WHITE);        // stop lines
    for (const z of [H + 0.7, H + BLOCK - 3.3]) for (let x = -H + 0.5; x < H - 0.4; x += 1.1) mark(x, z, 0.55, 2.6, WHITE); // crosswalks
    for (let i = 0; i < 3; i++) {                                                                // manholes
      const x = (rand() - 0.5) * 8, z = H + 8 + rand() * (BLOCK - 16);
      for (const [cx, cz] of [[wrap(x) * m, wrap(z) * m], [wrap(z) * m, wrap(x) * m]]) {
        g.fillStyle = '#2a2830'; g.beginPath(); g.arc(cx, cz, 0.45 * m, 0, 7); g.fill();
        g.strokeStyle = '#55525e'; g.lineWidth = 2; g.stroke();
      }
    }
  });
}

// Building fronts. Each texture holds 4 x 4 window bays, a share of them lit; a second texture of the
// same layout holds only the lit glass, so those windows glow in the shade.
function facade(style, rand) {
  const S = 512, C = 128, draw = (g, e) => {
    g.fillStyle = style === 'office' ? '#c9d1d8' : '#f4f0ea'; g.fillRect(0, 0, S, S);
    e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
    if (style !== 'office') grain(g, S, S, 5000, 0.035, rand);
    const glass = (x, y, w, h, lit) => {
      const grad = g.createLinearGradient(0, y, 0, y + h);
      if (lit) { grad.addColorStop(0, '#fff0b8'); grad.addColorStop(1, '#f2b064'); }
      else if (style === 'office') { grad.addColorStop(0, '#f0a0b4'); grad.addColorStop(0.45, '#5f9db8'); grad.addColorStop(1, '#27506e'); }
      else { grad.addColorStop(0, '#46587c'); grad.addColorStop(1, '#1a2236'); }
      g.fillStyle = grad; g.fillRect(x, y, w, h);
      if (lit) {
        e.fillStyle = '#d99a4e'; e.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(120,60,30,.35)'; g.fillRect(x, y, w * 0.18, h); g.fillRect(x + w * 0.82, y, w * 0.18, h); // curtains
      } else {
        g.fillStyle = 'rgba(255,255,255,.14)';
        g.beginPath(); g.moveTo(x + w * 0.15, y + h); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.75, y); g.lineTo(x + w * 0.35, y + h); g.fill();
      }
    };
    const frame = (x, y, w, h, color = '#ffffff', t = 3) => { g.strokeStyle = color; g.lineWidth = t; g.strokeRect(x, y, w, h); };
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * C, y = fy * C, lit = rand() < (style === 'office' ? 0.14 : 0.3);
      if (style === 'deco') { // a ribbon window under an "eyebrow" ledge, with a racing stripe between floors
        glass(x + 12, y + 38, 104, 58, lit); frame(x + 12, y + 38, 104, 58);
        g.fillStyle = '#f4f0ea'; g.fillRect(x + 45, y + 38, 3, 58); g.fillRect(x + 80, y + 38, 3, 58);
        g.fillStyle = '#ffffff'; g.fillRect(x + 4, y + 26, 120, 8);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + 4, y + 34, 120, 4);
        g.fillStyle = '#cfc6ba'; g.fillRect(x, y + 110, C, 4); g.fillRect(x, y + 118, C, 4);
      } else if (style === 'balcony') {
        glass(x + 16, y + 28, 40, 84, lit); frame(x + 16, y + 28, 40, 84);
        glass(x + 68, y + 38, 44, 50, rand() < 0.3); frame(x + 68, y + 38, 44, 50);
        g.fillStyle = '#ffffff'; g.fillRect(x + 6, y + 110, 116, 8);
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 6, y + 118, 116, 5);
        g.fillStyle = '#3c3c48'; g.fillRect(x + 6, y + 80, 116, 3);
        for (let k = 8; k < 122; k += 8) g.fillRect(x + k, y + 82, 2, 28);
      } else if (style === 'stucco') {
        for (const wx of [20, 78]) {
          glass(x + wx, y + 38, 30, 58, wx === 20 ? lit : rand() < 0.3); frame(x + wx, y + 38, 30, 58, '#ffffff', 2);
          g.fillStyle = '#5f8a84'; g.fillRect(x + wx - 9, y + 36, 8, 62); g.fillRect(x + wx + 31, y + 36, 8, 62); // shutters
          g.fillStyle = '#ffffff'; g.fillRect(x + wx - 4, y + 97, 38, 5);
          g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + wx - 4, y + 102, 38, 3);
        }
      } else { // office: a glass curtain wall that mirrors the sunset
        for (const px of [0, 64]) {
          glass(x + px + 2, y + 2, 60, 96, lit && px === 0);
          g.fillStyle = '#24384e'; g.fillRect(x + px + 2, y + 100, 60, 26);
        }
      }
    }
    if (style !== 'office') { // rain streaks under the ledges
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(60,40,50,.05)'; g.fillRect(rand() * S, rand() * S, 2 + rand() * 3, 20 + rand() * 50); }
    }
  };
  let glow;
  const map = texture(S, S, g => { glow = texture(S, S, e => draw(g, e)); });
  return { map, glow };
}

// The ground floor of ordinary buildings: four shopfronts, each with a name band, plate glass and a tiled base.
function shopfronts(rand) {
  const W = 512, H = 128, C = 128;
  const draw = (g, e) => {
    g.fillStyle = '#e9e4dc'; g.fillRect(0, 0, W, H);
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    for (let k = 0; k < 4; k++) {
      const x = k * C, lit = rand() < 0.6, accent = ['#d84a6f', '#1f9c8f', '#e0a12c', '#5b53c9'][k];
      g.fillStyle = accent; g.fillRect(x + 6, 4, C - 12, 24);
      e.fillStyle = '#3a2a2a'; e.fillRect(x + 6, 4, C - 12, 24);
      g.fillStyle = '#fff8e8'; g.font = '20px "Bebas Neue", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(SHOPS[Math.floor(rand() * SHOPS.length)], x + C / 2, 17, C - 20);
      const grad = g.createLinearGradient(0, 34, 0, 104);
      if (lit) { grad.addColorStop(0, '#ffe9b0'); grad.addColorStop(1, '#e8a860'); } else { grad.addColorStop(0, '#3f5672'); grad.addColorStop(1, '#172030'); }
      g.fillStyle = grad; g.fillRect(x + 10, 34, C - 20, 70);
      if (lit) {
        e.fillStyle = '#c98a48'; e.fillRect(x + 10, 34, C - 20, 70);
        g.fillStyle = 'rgba(70,40,30,.5)';
        for (let s = 0; s < 4; s++) g.fillRect(x + 16 + s * 25, 62 + rand() * 20, 16, 40);     // goods in the window
      }
      g.strokeStyle = '#2c2c36'; g.lineWidth = 3; g.strokeRect(x + 10, 34, C - 20, 70);
      g.fillStyle = '#2c2c36'; g.fillRect(x + 10, 50, C - 20, 2);
      if (k % 2 === 0) { g.fillStyle = '#20202a'; g.fillRect(x + 50, 52, 28, 76); g.fillStyle = lit ? '#f6cf8a' : '#34465e'; g.fillRect(x + 54, 56, 20, 50); }
      g.fillStyle = '#7d7888'; g.fillRect(x + 6, 106, C - 12, 22);
      for (let t = 6; t < C - 6; t += 12) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + t, 106, 1, 22); }
    }
  };
  let glow;
  const map = texture(W, H, g => { glow = texture(W, H, e => draw(g, e)); });
  return { map, glow };
}

// ---------- The city ----------

export function buildWorld(scene) {
  const rand = mulberry32(1999);
  const pick = list => list[Math.floor(rand() * list.length)];
  const places = {}, updaters = [];
  const W = NX * CELL + ROAD, D = NZ * CELL + ROAD;
  const T = surfaces(rand);

  const lam = opts => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  const lit = f => lam({ map: f.map, emissiveMap: f.glow, emissive: 0xffffff, emissiveIntensity: 0.85 });
  const decal = opts => lam({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...opts });
  const M = {
    plain: lam(), glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    paver: lam({ map: T.paver }), asphalt: lam({ map: T.asphalt }), grass: decal({ map: T.grass }), paint: decal(),
    brick: lam({ map: T.brick }), siding: lam({ map: T.siding }), shingle: lam({ map: T.shingle }), gravel: lam({ map: T.gravel }),
    wood: lam({ map: T.wood }), sand: lam({ map: T.sand }),
    shop: lit(shopfronts(rand)),
    deco: lit(facade('deco', rand)), balcony: lit(facade('balcony', rand)), stucco: lit(facade('stucco', rand)), office: lit(facade('office', rand)),
    pool: new THREE.MeshBasicMaterial({ map: T.halo, vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  M.office.emissiveIntensity = 0.6;

  // Everything static is collected per material and merged into one mesh each at the end.
  let buckets = new Map();
  const tintOf = new THREE.Color();
  const put = (mat, geo, hex = 0xffffff) => {
    const n = geo.attributes.position.count, a = new Float32Array(n * 3);
    tintOf.set(hex);
    for (let i = 0; i < n; i++) tintOf.toArray(a, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
    return geo;
  };
  const boxAt = (w, h, d, x, y0, z) => new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z); // standing on y0
  // Repeat a box's texture every `s` metres. Faces come in groups of 4 vertices: +x, -x, +y, -y, +z, -z.
  const tiled = (geo, w, h, d, s) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < 24; i++) {
      const f = i >> 2, u = f < 2 ? d : w, v = f === 2 || f === 3 ? d : h;
      uv.setXY(i, uv.getX(i) * u / s, uv.getY(i) * v / s);
    }
    return geo;
  };
  const slab = (hex, w, h, d, x, y0, z, mat = M.plain, s = 0) => put(mat, s ? tiled(boxAt(w, h, d, x, y0, z), w, h, d, s) : boxAt(w, h, d, x, y0, z), hex);
  const flat = (mat, hex, w, d, x, y, z, s = 0) => {
    const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z), uv = geo.attributes.uv;
    if (s) for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) * w / s, uv.getY(i) * d / s);
    return put(mat, geo, hex);
  };
  const post = (hex, r, h, x, y0, z, sides = 6) => put(M.plain, new THREE.CylinderGeometry(r, r, h, sides).translate(x, y0 + h / 2, z), hex);
  const ball = (hex, r, x, y, z, mat = M.plain) => put(mat, new THREE.SphereGeometry(r, 10, 7).translate(x, y, z), hex);
  // A real light, for the few places where scenes are played at night.
  const lamp = (x, y, z, hex, power, reach) => { const l = new THREE.PointLight(hex, power, reach); l.position.set(x, y, z); scene.add(l); };
  const collide = (x, z, w, d, h, thin = false) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, thin });
  // A pitched roof with its ridge along z, and a hipped one; both sit on y0.
  const gable = (hex, span, rise, len, x, y0, z, turn = 0, mat = M.shingle) => {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, rise);
    const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
    return put(mat, geo.rotateY(turn).translate(x, y0, z), hex);
  };
  const hip = (hex, w, d, rise, x, y0, z, top = 0.3, mat = M.shingle) => {
    const geo = new THREE.CylinderGeometry(top * Math.SQRT1_2, Math.SQRT1_2, rise, 4, 1).rotateY(Math.PI / 4), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 2.5);
    return put(mat, geo.scale(w, 1, d).translate(x, y0 + rise / 2, z), hex);
  };

  // One mesh per material from a set of buckets.
  const merged = map => {
    const group = new THREE.Group();
    for (const [mat, list] of map) {
      const mixed = list.some(g => !g.index);
      const mesh = new THREE.Mesh(mergeGeometries(mixed ? list.map(g => (g.index ? g.toNonIndexed() : g)) : list), mat);
      const solid = mat !== M.glow && mat !== M.sign && mat !== M.pool;
      mesh.castShadow = solid && mat !== M.grass && mat !== M.paint; mesh.receiveShadow = solid;
      if (mat === M.pool) mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  };
  // Build something apart from the merged city, as a group of its own that can be shown and hidden.
  const apart = build => {
    const city = buckets;
    buckets = new Map();
    build();
    const group = merged(buckets);
    buckets = city;
    scene.add(group);
    return group;
  };

  // Soft additive halos around lamps and neon, drawn as points: `size` is 4 (lamps) or 10 (signs).
  const halos = { 4: [], 10: [] };
  const halo = (x, y, z, hex, size = 4) => halos[size].push(x, y, z, hex);

  // Signs share one texture; each gets a slot in it.
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = 2048;
  const ag = atlas.getContext('2d'), shelves = [0, 0, 0, 0];
  M.sign = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(atlas) });
  M.sign.map.colorSpace = THREE.SRGBColorSpace; M.sign.map.anisotropy = 8;
  // text may be an array of rows. `turn` is the rotation about y of a sign that faces +z by default.
  // Signs with the same content share a slot; `also` lists further [x, y, z, turn] placements.
  const slots = new Map();
  function sign(text, x, y, z, turn, { w = 8, h = 2, color = '#ff5fd2', bg = '#140a1f', font = '"Bebas Neue", sans-serif', size = 0.72, glow = true, art, shift = 0, also = [] } = {}) {
    const rows = Array.isArray(text) ? text : [text], key = JSON.stringify([rows, Math.round(w / h * 20), color, bg, font, size]);
    let slot = slots.get(key);
    if (!slot) {
      const pw = w >= h ? 512 : Math.max(48, Math.round(256 * w / h)), ph = w >= h ? Math.max(48, Math.round(512 * h / w)) : 256;
      const col = shelves.indexOf(Math.min(...shelves)), px = col * 512, py = shelves[col];
      if (py + ph > 2048) return; // out of room: the city simply has one sign fewer
      shelves[col] += ph + 4;
      slots.set(key, slot = { px, py, pw, ph });
      ag.save();
      ag.beginPath(); ag.rect(px, py, pw, ph); ag.clip();
      ag.fillStyle = bg; ag.fillRect(px, py, pw, ph);
      art?.(ag, px, py, pw, ph);
      ag.textAlign = 'center'; ag.textBaseline = 'middle';
      rows.forEach((row, i) => {
        ag.font = `${Math.round(ph / rows.length * size)}px ${font}`;
        const cx = px + pw * (0.5 + shift), cy = py + ph * (i + 0.5) / rows.length;
        if (glow) { ag.shadowColor = color; ag.shadowBlur = 14; }
        const fit = pw * (0.92 - Math.abs(shift) * 2);
        ag.fillStyle = color; ag.fillText(row, cx, cy, fit);
        ag.shadowBlur = 0;
        if (glow) { ag.globalAlpha = 0.5; ag.fillStyle = '#fff'; ag.fillText(row, cx, cy, fit); ag.globalAlpha = 1; }
      });
      ag.restore();
    }
    for (const [sx, sy, sz, st] of [[x, y, z, turn], ...also]) {
      const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
      for (let i = 0; i < 4; i++) uv.setXY(i, (slot.px + uv.getX(i) * slot.pw) / 2048, 1 - (slot.py + (1 - uv.getY(i)) * slot.ph) / 2048);
      put(M.sign, geo.rotateY(st).translate(sx, sy, sz));
    }
  }
  const neonFor = text => NEONS[(text.length * 7 + text.charCodeAt(0)) % NEONS.length];
  const facing = (fx, fz) => (fx ? fx * Math.PI / 2 : fz > 0 ? 0 : Math.PI);

  // ----- Ground: sea, sand island, roads -----
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, sun: { value: SUN }, night: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float time; uniform float night; uniform vec3 sun;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        float w = noise(p * 0.06 + time * 0.12) * 0.6 + noise(p * 0.27 - time * 0.3) * 0.4;
        vec3 c = mix(vec3(0.06, 0.50, 0.64), vec3(0.20, 0.80, 0.84), w);
        vec3 v = normalize(vW - cameraPosition);
        float s = pow(max(dot(reflect(v, vec3(0.0, 1.0, 0.0)), sun), 0.0), 26.0);
        c += vec3(1.0, 0.72, 0.5) * s * (0.35 + 1.4 * step(0.62, noise(p * 0.9 + vec2(time * 0.9, time * 0.4))));
        c = mix(c, c * vec3(0.10, 0.16, 0.30) + vec3(0.5, 0.6, 0.9) * s * 0.25, night);
        c = mix(c, mix(vec3(0.949, 0.627, 0.706), vec3(0.07, 0.06, 0.15), night), smoothstep(140.0, 800.0, distance(vW, cameraPosition)));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sea.position.y = -0.6;
  scene.add(sea);
  updaters.push(t => { sea.material.uniforms.time.value = t; });

  const bw = bounds.maxX - bounds.minX + 8, bd = bounds.maxZ - bounds.minZ + 8;
  flat(M.sand, 0xffffff, bw, bd, (bounds.minX + bounds.maxX) / 2, -0.1, (bounds.minZ + bounds.maxZ) / 2, 12);
  const roadMap = roadTexture(rand);
  roadMap.repeat.set(W / CELL, D / CELL); roadMap.offset.set(-ROAD / 2 / CELL, -ROAD / 2 / CELL);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: roadMap }));
  road.receiveShadow = true;
  scene.add(road);

  // ----- Buildings -----
  // Walls with window bays: `floors` rows of the facade texture, or the single row of shopfronts.
  const walls = (w, h, d, x, y0, z, floors) => {
    const geo = boxAt(w, h, d, x, y0, z), uv = geo.attributes.uv, u0 = Math.floor(rand() * 4) / 4, v0 = Math.floor(rand() * 4) / 4;
    for (let i = 0; i < 24; i++) {
      const f = i >> 2;
      if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, u0 + uv.getX(i) * Math.max(1, Math.round((f < 2 ? d : w) / BAY)) / 4, floors ? v0 + uv.getY(i) * floors / 4 : uv.getY(i));
    }
    return geo;
  };
  const roofKit = (x, z, w, d, top, tint, tall) => {
    const pale = tintOf.set(tint).lerp(new THREE.Color(0xffffff), 0.45).getHex();
    flat(M.gravel, 0xb9b3ba, w - 0.4, d - 0.4, x, top + 0.02, z, 5);
    for (const s of [-1, 1]) { // parapet
      slab(pale, w + 0.3, 0.7, 0.4, x, top - 0.05, z + s * (d / 2 - 0.05));
      slab(pale, 0.4, 0.7, d + 0.3, x + s * (w / 2 - 0.05), top - 0.05, z);
    }
    const spot = () => [x + (rand() - 0.5) * (w - 6), z + (rand() - 0.5) * (d - 6)];
    for (let n = 0; n < 1 + Math.floor(rand() * 3); n++) { // air conditioning
      const [ax, az] = spot();
      slab(0xa9adb5, 2.2, 1.1, 1.6, ax, top, az); slab(0x4b4e57, 1.5, 0.12, 1.1, ax, top + 1.1, az);
    }
    const [sx, sz] = spot();
    slab(pale, 3, 2.6, 3.4, sx, top, sz);                                         // stair head
    if (!tall && rand() < 0.3) {                                                  // water tank
      const [tx, tz] = spot();
      put(M.wood, new THREE.CylinderGeometry(1.3, 1.3, 2.4, 10).translate(tx, top + 2.9, tz), 0xa07a5c);
      put(M.plain, new THREE.ConeGeometry(1.45, 0.8, 10).translate(tx, top + 4.5, tz), 0x5a4a44);
      for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) post(0x3a3a44, 0.07, 1.7, tx + lx, top, tz + lz, 4);
    }
    if (tall) { // mast with an aircraft warning light
      const [mx, mz] = spot();
      post(0x8a8d96, 0.09, 9, mx, top, mz, 5);
      ball(0xff3b3b, 0.22, mx, top + 9.1, mz, M.glow); halo(mx, top + 9.1, mz, 0xff3030, 4);
    }
  };
  // fx, fz: which sides of the building face a street (-1, 0 or 1).
  function building(x, z, w, d, h, { style, tint, fx = 0, fz = 1 } = {}) {
    style ??= h >= 30 ? pick(['office', 'office', 'deco', 'balcony']) : h <= 12 ? pick(['stucco', 'deco']) : pick(['deco', 'balcony', 'stucco', 'balcony']);
    const office = style === 'office', base = office ? 0 : GROUND;
    tint ??= office ? pick(GLASS_TINTS) : pick(PASTELS);
    const floors = Math.max(1, Math.round((h - base) / FLOOR)), top = CURB + base + floors * FLOOR;
    if (base) put(M.shop, walls(w, base, d, x, CURB, z, 0));
    put(M[style], walls(w, floors * FLOOR, d, x, CURB + base, z, floors), tint);
    collide(x, z, w, d, top);
    roofKit(x, z, w, d, top, tint, top > 40);

    const accent = pick(PASTELS.filter(c => c !== tint)), hexOf = css => parseInt(css.slice(1), 16);
    if (style === 'deco') for (let f = 1; f <= floors; f += floors > 7 ? 2 : 1) slab(0xffffff, w + 0.8, 0.16, d + 0.8, x, CURB + base + f * FLOOR - 0.2, z); // ledges
    if (office && top > 44) { // a crown, set back from the edge
      put(M.office, walls(w - 8, FLOOR * 2, d - 8, x, top, z, 2), tint);
      slab(0xdfe5ea, w - 7.4, 0.5, d - 7.4, x, top + FLOOR * 2, z);
    }
    if (base) {
      slab(accent, w + 0.5, 0.3, d + 0.5, x, CURB + base - 0.15, z);                              // cornice over the shops
      for (const [ax, az] of [[fx, 0], [0, fz]]) {
        if (!ax && !az) continue;
        const len = (ax ? d : w) * 0.86, ox = x + ax * (w / 2 + 0.75), oz = z + az * (d / 2 + 0.75);
        if (rand() < 0.6) put(M.plain, new THREE.BoxGeometry(ax ? 1.7 : len, 0.1, ax ? len : 1.7)                 // awning
          .rotateX(az * 0.38).rotateZ(-ax * 0.38).translate(ox, CURB + base - 1.05, oz), pick([0xd84a6f, 0x1f9c8f, 0xf2e6c8, 0x5b53c9, 0xe0a12c]));
        if (rand() < 0.38 && top < 30) {                                                          // neon name over the door
          const sw = Math.min(len * 0.7, 9), name = pick(SHOPS), neon = neonFor(name);
          sign(name, x + ax * (w / 2 + 0.2), CURB + base + 1.3, z + az * (d / 2 + 0.2), facing(ax, az), { w: sw, h: sw / 4, color: neon, font: name.length % 2 ? '"Mr Dafoe", cursive' : undefined });
          halo(x + ax * (w / 2 + 1), CURB + base + 1.3, z + az * (d / 2 + 1), hexOf(neon), 10);
        }
      }
    }
    if (style !== 'office' && top > 16 && top < 36 && fz && rand() < 0.55) { // a deco fin with the hotel's name down it
      const fh = top - CURB - base + 4, fzz = z + fz * (d / 2 + 1.1), fy = CURB + base + 0.3;
      const name = pick(HOTELS), neon = neonFor(name), sy = fy + fh - name.length * 0.75 - 0.8;
      slab(accent, 1.1, fh, 2.2, x, fy, fzz);
      for (const s of [-1, 1]) slab(hexOf(neon), 0.1, fh - 0.6, 0.1, x + s * 0.6, fy + 0.3, fzz + fz * 1.1, M.glow);
      sign(name.split(''), x + 0.58, sy, fzz, Math.PI / 2, { w: 1.5, h: name.length * 1.5, color: neon, bg: '#1a1024', size: 0.82, also: [[x - 0.58, sy, fzz, -Math.PI / 2]] });
      halo(x, fy + fh - 2, fzz + fz * 1.4, hexOf(neon), 10);
    }
    if (top > 30 && rand() < 0.3) { // rooftop billboard
      const ad = pick([['FLASH FM', '80s HITS ALL NIGHT'], ['VICE COLA', 'ICE COLD'], ['OCEAN VIEW', 'CONDOS FROM $49,000'], ['SUNSHINE AUTOS', 'DRIVE IT HOME TODAY'], ['PIZZA BY THE SLICE', 'OPEN LATE']]);
      const bz = z + (fz || 1) * (d / 2 - 1), turn = facing(0, fz || 1);
      sign(ad, x, top + 4.2, bz, turn, { w: 13, h: 5, color: neonFor(ad[0]), bg: ['#1a1024', '#10242a', '#2a1418'][ad[0].length % 3], size: 0.6 });
      slab(0x2a2a30, 13.4, 5.4, 0.3, x, top + 1.5, bz - (fz || 1) * 0.18);
      for (const s of [-1, 1]) post(0x2a2a30, 0.14, 1.6, x + s * 4.5, top, bz - (fz || 1) * 0.18);
    }
  }

  const palms = [];
  const maxDist = Math.hypot(NX * CELL / 2, NZ * CELL / 2);
  const lots = (c, i, skip) => {
    const downtown = 1 - Math.hypot(c.x, c.z) / maxDist, beach = i === NX - 1;
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      if (skip && skip[0] === a && skip[1] === b) continue;
      if (rand() < 0.1) { // a pocket park instead of a building
        flat(M.grass, 0xffffff, 18, 18, c.x + a * 13, CURB + 0.05, c.z + b * 13, 6);
        palms.push({ x: c.x + a * 9, z: c.z + b * 15 }, { x: c.x + a * 16, z: c.z + b * 10 });
        bench(c.x + a * 13, c.z + b * 13, 0);
        continue;
      }
      const w = 16 + Math.floor(rand() * 2) * 4, d = 16 + Math.floor(rand() * 2) * 4;
      const h = beach ? 8 + Math.floor(rand() * 3) * 4 : 8 + Math.floor(rand() * 3 + downtown * rand() * 11) * 4;
      building(c.x + a * 13, c.z + b * 13, w, d, h, { fx: a, fz: b });
    }
  };

  // ----- Street furniture -----
  const STEEL = 0x3a3a44;
  function streetLight(x, z, dx, dz) { // (dx, dz) points at the road
    post(STEEL, 0.09, 7.2, x, CURB, z);
    slab(STEEL, dx ? 2 : 0.1, 0.1, dz ? 2 : 0.1, x + dx * 0.95, CURB + 7.15, z + dz * 0.95);
    slab(0x2a2a30, dx ? 0.9 : 0.36, 0.16, dz ? 0.9 : 0.36, x + dx * 1.8, CURB + 7.05, z + dz * 1.8);
    slab(0xffe2a6, dx ? 0.7 : 0.26, 0.05, dz ? 0.7 : 0.26, x + dx * 1.8, CURB + 7, z + dz * 1.8, M.glow);
    halo(x + dx * 1.8, CURB + 6.9, z + dz * 1.8, 0xffb860, 4);
    flat(M.pool, 0xffc27a, 17, 17, x + dx * 2.6, CURB + 0.06, z + dz * 2.6);
    collide(x, z, 0.3, 0.3, 7, true);
  }
  function trafficLight(x, z, go) { // a post with a head for each street
    post(STEEL, 0.1, 4.4, x, CURB, z);
    slab(0x1c1c22, 0.42, 1.15, 0.42, x, CURB + 4.4, z);
    for (const [dx, dz, on] of [[1, 0, go], [-1, 0, go], [0, 1, !go], [0, -1, !go]]) {
      [0xff3b30, 0xffc233, 0x3cff7a].forEach((hex, n) => {
        const lit = n === (on ? 2 : 0);
        ball(lit ? hex : tintOf.set(hex).multiplyScalar(0.18).getHex(), 0.12, x + dx * 0.22, CURB + 5.33 - n * 0.36, z + dz * 0.22, lit ? M.glow : M.plain);
      });
    }
    halo(x, CURB + 5, z, go ? 0x3cff7a : 0xff3b30, 4);
  }
  function bench(x, z, turn) {
    const g = [boxAt(1.7, 0.08, 0.5, 0, 0.42, 0), boxAt(1.7, 0.5, 0.07, 0, 0.55, -0.24), boxAt(0.08, 0.42, 0.45, -0.75, 0, 0), boxAt(0.08, 0.42, 0.45, 0.75, 0, 0)];
    g.forEach((geo, n) => put(n < 2 ? M.wood : M.plain, geo.rotateY(turn).translate(x, CURB, z), n < 2 ? 0xc79a6a : STEEL));
  }
  function furniture(c, i, j) {
    const e = BLOCK / 2 - 1.2;
    streetLight(c.x + e, c.z + 4, 1, 0); streetLight(c.x - e, c.z - 4, -1, 0);
    streetLight(c.x + 4, c.z + e, 0, 1); streetLight(c.x - 4, c.z - e, 0, -1);
    trafficLight(c.x - e - 0.4, c.z - e - 0.4, (i + j) % 2 === 0); trafficLight(c.x + e + 0.4, c.z + e + 0.4, (i + j) % 2 === 1);
    for (let n = 0; n < 4; n++) { // small things along the kerb
      const side = Math.floor(rand() * 4), t = (rand() - 0.5) * 40, x = c.x + (side < 2 ? t : (side === 2 ? e : -e)), z = c.z + (side < 2 ? (side ? e : -e) : t);
      const kind = n % 4;
      if (kind === 0) { // fire hydrant
        post(0xd8342c, 0.13, 0.6, x, CURB, z, 8); ball(0xd8342c, 0.15, x, CURB + 0.62, z); slab(0xd8342c, 0.42, 0.12, 0.12, x, CURB + 0.36, z);
      } else if (kind === 1) { // litter bin
        post(0x2f6b5c, 0.3, 0.9, x, CURB, z, 9); post(0x1d1d24, 0.32, 0.06, x, CURB + 0.9, z, 9);
      } else if (kind === 2) bench(x + (side === 2 ? -1.4 : side === 3 ? 1.4 : 0), z + (side === 0 ? 1.4 : side === 1 ? -1.4 : 0), [0, Math.PI, -Math.PI / 2, Math.PI / 2][side]);
      else { // newspaper box
        slab(pick([0x2f56c8, 0xd8342c, 0xf2c230]), 0.5, 1, 0.45, x, CURB + 0.08, z); slab(0x1d1d24, 0.4, 0.3, 0.02, x, CURB + 0.66, z + 0.23);
      }
    }
  }

  // ----- Blocks -----
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const c = blockCenter(i, j), kind = SPECIAL[`${i},${j}`];
    if (kind === 'bing') { // a ring of sidewalk around a car park at road level
      for (const s of [-1, 1]) {
        slab(0xffffff, BLOCK, CURB, 5, c.x, 0, c.z + s * (BLOCK / 2 - 2.5), M.paver, 6);
        slab(0xffffff, 5, CURB, BLOCK - 10, c.x + s * (BLOCK / 2 - 2.5), 0, c.z, M.paver, 6);
      }
    } else slab(0xffffff, BLOCK, CURB, BLOCK, c.x, 0, c.z, M.paver, 6);
    for (const sx of [-1, 1]) for (const sz of [-14, 14]) palms.push({ x: c.x + sx * 28.8, z: c.z + sz });
    furniture(c, i, j);

    if (kind === 'home') buildHome(c);
    else if (kind === 'melfi') buildMelfi(c);
    else if (kind === 'bing') buildBing(c);
    else if (kind === 'satriale') { buildSatriale(c); lots(c, i, [-1, 1]); }
    else if (kind === 'vesuvio') { buildVesuvio(c); lots(c, i, [1, 1]); }
    else if (kind === 'hesh') { buildHesh(c); lots(c, i, [-1, -1]); }
    else if (kind === 'livia') buildLivia(c);
    else if (kind === 'grove') buildGrove(c);
    else if (kind === 'kolar') buildKolar(c);
    else if (kind === 'comley') buildComley(c);
    else if (kind === 'park') buildPark(c);
    else if (kind === 'hospital') buildHospital(c);
    else if (kind === 'motel') { buildMotel(c); lots(c, i, [1, 1]); }
    else if (kind === 'school') buildSchool(c);
    else if (kind === 'bodyshop') { buildBodyshop(c); lots(c, i, [1, -1]); }
    else if (kind === 'cafe') { buildCafe(c); lots(c, i, [-1, 1]); }
    else if (rand() < 0.22) {
      const downtown = 1 - Math.hypot(c.x, c.z) / maxDist;
      building(c.x, c.z, 36 + Math.floor(rand() * 3) * 4, 36 + Math.floor(rand() * 3) * 4, i === NX - 1 ? 12 : 16 + Math.floor(rand() * 4 + downtown * 9) * 4, { fx: rand() < 0.5 ? 1 : -1, fz: rand() < 0.5 ? 1 : -1 });
    } else lots(c, i);
  }

  // A window with a frame, set on a wall that faces (fx, fz).
  function windowAt(x, y, z, w, h, fx, fz, lit = false) {
    const t = 0.06, bars = Math.max(1, Math.round(w / 1.8));
    slab(0xffffff, fx ? t : w + 0.3, h + 0.3, fz ? t : w + 0.3, x, y - 0.15, z);
    slab(lit ? 0xf0bf78 : 0x24324c, fx ? t : w, h, fz ? t : w, x + fx * 0.03, y, z + fz * 0.03, lit ? M.glow : M.plain);
    if (lit) slab(0xc98a4c, fx ? t : w, h * 0.3, fz ? t : w, x + fx * 0.04, y, z + fz * 0.04, M.glow); // what stands inside, in silhouette
    for (let n = 1; n <= bars; n++) {
      const o = (n / (bars + 1) - 0.5) * w;
      slab(0xffffff, fx ? t : 0.07, h, fz ? t : 0.07, x + fx * 0.05 + (fz ? o : 0), y, z + fz * 0.05 + (fx ? o : 0));
    }
  }

  // ----- Tony's house: a stucco mansion with a tiled roof, a garage, lawn, pool and ducks -----
  function buildHome(c) {
    const CREAM = 0xfdf1dc, TILE = 0xd0623a, y = CURB;
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z, 6);
    // Main house, east wing and garage keep the footprints the missions were written around.
    for (const [w, h, d, x, z] of [[32, 8, 16, c.x + 2, c.z - 18], [12, 5, 10, c.x + 12, c.z - 6], [11, 4.6, 12, c.x - 20.5, c.z - 20]]) {
      slab(CREAM, w, h, d, x, y, z, M.gravel, 3);
      slab(0xc9b79c, w + 0.1, 0.9, d + 0.1, x, y, z, M.brick, 2);                                // stone base course
      slab(0xffffff, w + 0.7, 0.3, d + 0.7, x, y + h - 0.1, z);                                  // eaves
      hip(TILE, w + 1.6, d + 1.6, h > 6 ? 4.2 : 2.6, x, y + h + 0.2, z, w > 20 ? 0.45 : 0.2);
      collide(x, z, w, d, y + h);
    }
    slab(0xb5523b, 1.6, 4.5, 1.6, c.x + 13, y + 8, c.z - 20, M.brick, 2);                        // chimney
    const front = c.z - 10;
    for (const wx of [-10, 2]) windowAt(c.x + wx, y + 1.3, front, 2, 2.2, 0, 1, wx === 2);
    for (const wx of [-10, 2]) windowAt(c.x + wx, y + 5, front, 2, 2, 0, 1);
    windowAt(c.x - 4, y + 5, front, 2.6, 2, 0, 1, true);
    for (const wz of [-22, -14]) for (const s of [-1, 1]) windowAt(c.x + 2 + s * 16, y + 5, c.z + wz, 2, 2, s, 0);
    windowAt(c.x + 12, y + 1.2, c.z - 1, 3, 2.2, 0, 1, true); windowAt(c.x + 6, y + 1.2, c.z - 6, 2.4, 2.2, -1, 0);
    // Portico and front door.
    slab(0x5a3320, 2.2, 3.3, 0.2, c.x - 4, y, front + 0.05); slab(0xe8c040, 0.1, 0.1, 0.1, c.x - 3.3, y + 1.5, front + 0.2);
    slab(0xffffff, 6.4, 0.4, 3.2, c.x - 4, y + 3.9, front + 1.5);
    gable(TILE, 6.8, 1.5, 3.4, c.x - 4, y + 4.3, front + 1.5);
    for (const s of [-1, 1]) post(0xffffff, 0.22, 3.9, c.x - 4 + s * 2.7, y, front + 2.7, 10);
    slab(0xd8d0c4, 6.4, 0.16, 3.4, c.x - 4, y, front + 1.6);
    // Garage doors and driveway.
    for (const s of [-1, 1]) { slab(0xf3efe6, 4.4, 3, 0.12, c.x - 20.5 + s * 2.6, y, c.z - 13.95); for (let n = 1; n < 4; n++) slab(0xcfc8ba, 4.4, 0.05, 0.14, c.x - 20.5 + s * 2.6, y + n * 0.75, c.z - 13.95); }
    flat(M.paint, 0x9a94a2, 9.5, 43, c.x - 20.5, y + 0.09, c.z + 7.5);
    flat(M.paint, 0xd8d0c4, 2, 12, c.x - 4, y + 0.09, c.z - 2);                                  // path to the door
    // Hedges around the garden, open at the driveway.
    for (const [w, d, x, z] of [[BLOCK - 5, 1.2, c.x, c.z - 27.6], [1.2, BLOCK - 5, c.x + 27.6, c.z], [1.2, BLOCK - 5, c.x - 27.6, c.z], [43, 1.2, c.x + 6.2, c.z + 27.6]]) {
      slab(0x2f7d46, w, 1.3, d, x, y, z, M.grass, 3);
      collide(x, z, w, d, 1.5);
    }

    const pool = { x: c.x + 13, z: c.z + 13, w: 12, d: 18 };
    flat(M.paint, 0xf3ece0, pool.w + 5, pool.d + 5, pool.x, y + 0.09, pool.z);
    for (const s of [-1, 1]) { // coping
      slab(0xffffff, pool.w + 0.8, 0.12, 0.4, pool.x, y + 0.08, pool.z + s * (pool.d / 2 + 0.2));
      slab(0xffffff, 0.4, 0.12, pool.d + 0.8, pool.x + s * (pool.w / 2 + 0.2), y + 0.08, pool.z);
    }
    const caustics = texture(128, 128, (g, w) => {
      g.fillStyle = '#2fc6e4'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(210,250,255,.55)'; g.lineWidth = 2;
      for (let k = 0; k < 16; k++) { g.beginPath(); g.ellipse(rand() * w, rand() * w, 8 + rand() * 14, 5 + rand() * 9, rand() * 3, 0, 7); g.stroke(); }
    });
    caustics.repeat.set(3, 4.5);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pool.w, pool.d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: caustics }));
    water.position.set(pool.x, y + 0.13, pool.z);
    scene.add(water);
    updaters.push(t => { caustics.offset.set(Math.sin(t * 0.4) * 0.04, t * 0.02); });
    collide(pool.x, pool.z, pool.w, pool.d, 0.3);
    slab(0xffffff, 0.6, 0.08, 2.6, pool.x, y + 0.55, pool.z + pool.d / 2 + 0.6); slab(0xb9bcc4, 0.5, 0.5, 0.5, pool.x, y, pool.z + pool.d / 2 + 1.5); // diving board
    for (const lz of [-4, -1.2]) { // sun loungers
      slab(0xffffff, 0.75, 0.3, 2, pool.x + pool.w / 2 + 1.6, y + 0.05, pool.z + lz);
      put(M.plain, new THREE.BoxGeometry(0.75, 0.08, 0.8).rotateX(-0.7).translate(pool.x + pool.w / 2 + 1.6, y + 0.62, pool.z + lz - 1), 0x49e0d0);
    }

    const ducks = [];
    for (let k = 0; k < 5; k++) {
      const d = makeDuck();
      d.group.position.set(pool.x - 2.5 + (k % 3) * 1.6, y + 0.13, pool.z - 2 + Math.floor(k / 3) * 2.2 + (k % 2) * 0.7);
      d.group.rotation.y = -Math.PI / 2 + (rand() - 0.5);
      d.group.scale.setScalar(k === 0 ? 1.25 : 0.9);
      scene.add(d.group);
      ducks.push(d);
    }
    for (const [px, pz] of [[22, -1], [24, 25], [3, 26]]) palms.push({ x: c.x + px, z: c.z + pz });
    // Patio and barbecue between the house and the pool.
    flat(M.paint, 0xe2d6c4, 12, 9, c.x - 1, y + 0.08, c.z + 4.5);
    const gx = c.x + 2.6, gz = c.z + 4.4;
    put(M.plain, new THREE.SphereGeometry(0.42, 12, 8).scale(1, 0.75, 1).translate(gx, y + 0.95, gz), 0x1c1c22);
    slab(0x8a3a22, 0.7, 0.03, 0.7, gx, y + 0.98, gz, M.glow);                                    // coals
    for (const [lx, lz] of [[-0.3, -0.2], [0.3, -0.2], [0, 0.32]]) post(0x8a8d96, 0.025, 0.75, gx + lx, y, gz + lz, 4);
    slab(0xc79a6a, 1.6, 0.06, 0.8, gx - 1.6, y + 0.85, gz, M.wood, 1); for (const s of [-1, 1]) post(0x8a8d96, 0.04, 0.85, gx - 1.6 + s * 0.7, y, gz, 4);

    places.home = {
      grill: { x: gx, z: gz + 1.1 }, patio: { x: c.x - 2, z: c.z + 5 }, drive: { x: c.x - 20.5, z: c.z + 20 },
      road: { x: c.x - 20.5, z: c.z + 34 }, guest: { x: c.x + 8, z: c.z + 34, h: Math.PI / 2 },
      spawn: { x: c.x - 4, z: c.z - 6 },
      pool: { x: pool.x - pool.w / 2 - 1.6, z: pool.z },
      car: { x: c.x - 21, z: c.z + 14, h: 0 },
      wake: { x: c.x - 18.2, z: c.z + 12 },
      ducks,
    };
  }

  // ----- Dr. Melfi's office -----
  function buildMelfi(c) {
    building(c.x, c.z - 4, 36, 28, 24, { style: 'office', tint: 0xd6fff4, fx: 0, fz: 0 });
    const front = c.z + 10;
    slab(0xe9e2d2, 12, 4.4, 0.5, c.x, CURB, front + 0.1, M.gravel, 3);                           // stone entrance surround
    slab(0x1a242c, 3.4, 3.2, 0.2, c.x, CURB, front + 0.4); slab(0xc9cbd2, 0.08, 3.2, 0.24, c.x, CURB, front + 0.42);
    slab(0xf6e7b4, 9, 0.3, 4.4, c.x, CURB + 3.7, front + 2.4);                                   // canopy
    for (const s of [-1, 1]) {
      post(0xc9cbd2, 0.12, 3.7, c.x + s * 4, CURB, front + 4.2, 8);
      slab(0xb9a58a, 1.6, 0.7, 1.6, c.x + s * 6.6, CURB, front + 1.6, M.gravel, 2);              // planters
      ball(0x2f7d46, 0.9, c.x + s * 6.6, CURB + 1.3, front + 1.6);
    }
    sign(['Dr. J. Melfi, M.D.', 'PSYCHIATRY'], c.x, CURB + 5.4, front + 0.4, 0, { w: 11, h: 2.2, color: '#f6e7b4', bg: '#1d3b3a', size: 0.62, glow: false });
    places.melfi = {
      park: { x: c.x, z: c.z + 34 },
      kerb: { x: c.x + 6, z: c.z + 32, h: -Math.PI / 2 },
      door: { x: c.x, z: c.z + 14 },
    };
  }

  // ----- The Bada Bing -----
  // Modelled on the roadside go-go bar the show filmed at: a low club with a shingled mansard and a canopied
  // door, a taller white clapboard block behind it, a car park, and a pylon sign at the edge of the road.
  function buildBing(c) {
    const PINK = 0xff3fe0, BROWN = 0x8a5a44, SHINGLE = 0x5a4038, front = c.z + 7;
    flat(M.asphalt, 0xffffff, BLOCK - 10, BLOCK - 10, c.x, 0.03, c.z, 5);
    lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 - 5 });

    // The club: brick walls, corner piers and a mansard band around the top.
    slab(BROWN, 30, 5, 16, c.x, 0, c.z - 1, M.brick, 2);
    collide(c.x, c.z - 1, 30, 16, 5);
    const band = new THREE.CylinderGeometry(0.93 * Math.SQRT1_2, Math.SQRT1_2, 2.1, 4, 1, true).rotateY(Math.PI / 4);
    for (let i = 0; i < band.attributes.uv.count; i++) band.attributes.uv.setXY(i, band.attributes.uv.getX(i) * 40, band.attributes.uv.getY(i) * 1.4);
    put(M.shingle, band.scale(31.6, 1, 17.6).translate(c.x, 4.35, c.z - 1), SHINGLE);
    slab(0x3a2a26, 29.6, 0.3, 15.6, c.x, 5.25, c.z - 1); flat(M.gravel, 0x8d868c, 29, 15, c.x, 5.58, c.z - 1, 5);
    for (const [ax, az] of [[-9, -3], [6, -5], [10, 2]]) { slab(0xa9adb5, 2.4, 1.2, 1.8, c.x + ax, 5.55, c.z + az); slab(0x4b4e57, 1.6, 0.12, 1.2, c.x + ax, 6.75, c.z + az); }
    for (const s of [-1, 1]) {
      slab(0xc9b79c, 1.5, 3.4, 1.5, c.x + s * 15, 0, front, M.brick, 1.4); slab(0xe9e2d2, 1.8, 0.2, 1.8, c.x + s * 15, 3.4, front);
      slab(PINK, 0.12, 0.12, 16.4, c.x + s * 15.82, 3.3, c.z - 1, M.glow);                       // neon under the mansard
      // Lit poster cases either side of the door.
      slab(0x1c1c22, 3.6, 2.2, 0.2, c.x + s * 9, 1, front + 0.05);
      sign(s < 0 ? ['LIVE', 'ENTERTAINMENT'] : ['OPEN', '7 NIGHTS'], c.x + s * 9, 2.1, front + 0.17, 0, { w: 3.3, h: 1.9, color: '#ffe066', bg: '#2a1028', size: 0.55 });
    }
    slab(PINK, 31.7, 0.12, 0.12, c.x, 3.3, front + 0.82, M.glow);
    for (let k = -3; k <= 3; k++) halo(c.x + k * 5, 3.3, front + 1.1, PINK, 10);

    // Entrance: brick piers, a pitched canopy, double doors, and the sign over them.
    for (const s of [-1, 1]) {
      slab(0xc9b79c, 1, 3.3, 1, c.x + s * 3.3, 0, front + 3.6, M.brick, 1.4);
      slab(0x2a1218, 1.5, 3.1, 0.14, c.x + s * 0.76, 0, front + 0.08);                           // doors
      slab(0xe8c040, 0.06, 0.7, 0.08, c.x + s * 0.12, 1.1, front + 0.18);
      slab(0xffe2a6, 0.5, 0.06, 0.5, c.x + s * 1.6, 3.24, front + 2, M.glow);                    // lamps under the canopy
    }
    slab(0x4a1420, 8, 0.25, 4.6, c.x, 3.3, front + 2.2);
    gable(0x6a1c2c, 8.4, 1.7, 4.8, c.x, 3.55, front + 2.2, 0, M.plain);
    halo(c.x, 3, front + 2.4, 0xffc27a, 4);
    lamp(c.x + 1, 3, front + 5.5, 0xffb0d8, 40, 18);
    slab(0x14080f, 10.4, 2.9, 0.4, c.x, 6.3, front + 0.1);
    for (const s of [-1, 1]) post(0x1c1c22, 0.12, 0.8, c.x + s * 4, 5.55, front + 0.1);
    sign('Bada Bing!', c.x, 7.75, front + 0.32, 0, { w: 10, h: 2.5, color: '#ff5fd2', bg: '#14080f', font: '"Mr Dafoe", cursive', size: 0.78 });
    slab(PINK, 10.5, 0.1, 0.1, c.x, 6.28, front + 0.34, M.glow); slab(PINK, 10.5, 0.1, 0.1, c.x, 9.12, front + 0.34, M.glow);
    halo(c.x, 7.7, front + 1, PINK, 10);

    // The two-storey block behind, in white clapboard under a pitched roof, and a lean-to at its side.
    slab(0xf4f2ee, 22, 9, 16, c.x + 4, 0, c.z - 17, M.siding, 1.2);
    collide(c.x + 4, c.z - 17, 22, 16, 9);
    gable(0x55525a, 17, 3.2, 23, c.x + 4, 9, c.z - 17, Math.PI / 2);
    for (const wx of [-4, 2, 8]) { windowAt(c.x + 4 + wx, 5.6, c.z - 25, 1.4, 1.5, 0, -1, wx === 2); windowAt(c.x + 15, 5.6, c.z - 17 + wx - 2, 1.4, 1.5, 1, 0); }
    slab(0xd9917a, 10, 4, 12, c.x - 12, 0, c.z - 15, M.gravel, 3);
    collide(c.x - 12, c.z - 15, 10, 12, 4);
    put(M.shingle, new THREE.BoxGeometry(10.8, 0.25, 13.4).rotateX(0.2).translate(c.x - 12, 4.9, c.z - 15), 0x3f3c44);
    slab(0x2f5a3f, 2.6, 1.5, 1.6, c.x - 19.5, 0, c.z - 12); slab(0x244a33, 2.7, 0.1, 1.7, c.x - 19.5, 1.5, c.z - 12); // dumpster

    // Car park: bays along the club front and along the road.
    const parking = [];
    for (let k = -8; k <= 8; k++) {
      if (Math.abs(k) > 1) { flat(M.paint, 0xe9e6ee, 0.14, 5.2, c.x + k * 2.8, 0.07, front + 4.4); if (k % 3 === 0) parking.push({ x: c.x + k * 2.8 + 1.4 * Math.sign(k), z: front + 4.6, h: Math.PI }); }
      if (k > 6) continue; // the pylon stands in the last bays by the road
      flat(M.paint, 0xe9e6ee, 0.14, 5.2, c.x + k * 2.8, 0.07, c.z + 22.2);
      if ((k + 8) % 4 === 1 && k < 6) parking.push({ x: c.x + k * 2.8 + 1.4, z: c.z + 22, h: 0 });
    }

    // The pylon sign by the road: the name up top, a letter board under it.
    const px = c.x + 21.5, pz = c.z + 22.5;
    for (const s of [-1, 1]) { post(0x1c1c22, 0.2, 11, px + s * 1.9, 0, pz, 8); collide(px + s * 1.9, pz, 0.5, 0.5, 11, true); }
    slab(0x14080f, 6.2, 3.1, 0.6, px, 7.9, pz); slab(0xf3f1ea, 5.4, 1.9, 0.5, px, 5.6, pz);
    const dancer = (g, x, y, w, h) => { // a seated silhouette beside the name, in the style of a mudflap figure
      g.save(); g.translate(x + w * 0.87, y + h * 0.56); g.scale(h / 140, h / 140);
      g.fillStyle = '#ff5fd2'; g.shadowColor = '#ff5fd2'; g.shadowBlur = 10;
      g.beginPath(); g.arc(4, -52, 9, 0, 7); g.fill();                                           // head
      g.beginPath(); g.moveTo(-2, -42); g.bezierCurveTo(14, -30, 12, -8, 2, 6); g.bezierCurveTo(16, 10, 34, 2, 46, -22);
      g.lineTo(52, -18); g.bezierCurveTo(42, 12, 22, 26, -4, 22); g.bezierCurveTo(-22, 20, -30, 6, -24, -8);
      g.bezierCurveTo(-18, -4, -10, -4, -8, -12); g.bezierCurveTo(-12, -24, -10, -34, -2, -42); g.fill();
      g.beginPath(); g.moveTo(8, -50); g.bezierCurveTo(-14, -58, -26, -40, -30, -20); g.bezierCurveTo(-20, -34, -8, -40, 2, -38); g.fill(); // hair
      g.restore();
    };
    sign('Bada Bing!', px, 9.45, pz + 0.31, 0, { w: 6, h: 2.9, color: '#ffffff', bg: '#14080f', font: '"Mr Dafoe", cursive', size: 0.5, shift: -0.1, art: dancer, also: [[px, 9.45, pz - 0.31, Math.PI]] });
    sign(['GIRLS  GIRLS  GIRLS', 'OPEN TIL 4 AM'], px, 6.55, pz + 0.26, 0, { w: 5.2, h: 1.7, color: '#1c1c22', bg: '#f3f1ea', size: 0.6, glow: false, also: [[px, 6.55, pz - 0.26, Math.PI]] });
    for (const s of [-1, 1]) halo(px, 9.4, pz + s, PINK, 10);
    for (const s of [-1, 1]) slab(PINK, 6.3, 0.1, 0.7, px, 7.86 + (s > 0 ? 3.1 : 0), pz, M.glow);
    for (const [lx, lz] of [[-20, 23], [-20, 9], [8, 23]]) palms.push({ x: c.x + lx, z: c.z + lz });
    places.bing = { door: { x: c.x, z: c.z + 15 }, park: { x: c.x + 13, z: c.z + 17.5, h: Math.PI / 2 }, parking };
  }

  // ----- Satriale's Pork Store (south-west lot of its block) -----
  function buildSatriale(c) {
    const x = c.x - 13, z = c.z + 13, front = z + 10, y = CURB;
    slab(0xb5523b, 22, 8, 20, x, y, z, M.brick, 2);
    collide(x, z, 22, 20, y + 8);
    slab(0xe9e2d2, 22.6, 0.5, 20.6, x, y + 8, z); flat(M.gravel, 0x8d868c, 21.4, 19.4, x, y + 8.02, z, 5);
    slab(0xe9e2d2, 22.2, 0.3, 0.5, x, y + 4.1, front);                                           // band above the shop
    for (const wx of [-6.5, 6.5]) { windowAt(x + wx, y + 0.9, front, 7, 2.6, 0, 1, true); windowAt(x + wx * 1.45, y + 5.3, front, 1.6, 1.8, 0, 1, wx > 0); }
    slab(0x3a2a22, 2.2, 3.1, 0.16, x, y, front + 0.04); slab(0xffd48a, 1.4, 1.5, 0.05, x, y + 1.3, front + 0.13, M.glow);
    put(M.plain, new THREE.BoxGeometry(21, 0.1, 2).rotateX(0.4).translate(x, y + 3.5, front + 1), 0xa3201c); // awning
    slab(0xf6f1e4, 15.4, 2.9, 0.16, x, y + 5.45, front);
    sign("SATRIALE'S", x, y + 7.45, front + 0.1, 0, { w: 9.5, h: 1.7, color: '#a3201c', bg: '#f6f1e4', size: 1, glow: false });
    sign('PORK STORE  ·  MEAT MARKET', x, y + 6.1, front + 0.1, 0, { w: 11, h: 0.9, color: '#a3201c', bg: '#f6f1e4', size: 0.86, glow: false });
    // The pig on the roof.
    const PIG = 0xf2a3b4, py = y + 8.5, pz = front - 1.2;
    put(M.plain, new THREE.CapsuleGeometry(0.75, 1.5, 4, 10).rotateZ(Math.PI / 2).translate(x, py + 1.35, pz), PIG);
    ball(PIG, 0.62, x + 1.55, py + 1.6, pz);
    put(M.plain, new THREE.CylinderGeometry(0.26, 0.3, 0.3, 10).rotateZ(Math.PI / 2).translate(x + 2.15, py + 1.5, pz), 0xe88aa0);
    for (const s of [-1, 1]) {
      put(M.plain, new THREE.ConeGeometry(0.2, 0.4, 6).translate(x + 1.5, py + 2.25, pz + s * 0.32), 0xe88aa0);
      for (const lx of [-0.8, 0.8]) post(PIG, 0.17, 0.75, x + lx, py, pz + s * 0.4, 8);
    }
    slab(0x3a3a44, 3.2, 0.5, 1.6, x, y + 8.02, pz);
    // Tables out front, where the crew sits.
    for (const tx of [-7, 6.5]) {
      post(0xc9cbd2, 0.05, 0.75, x + tx, y, front + 2.6); post(0xffffff, 0.55, 0.05, x + tx, y + 0.75, front + 2.6, 12);
      for (const s of [-1, 1]) { slab(0xd8342c, 0.45, 0.06, 0.45, x + tx + s * 0.95, y + 0.45, front + 2.6); slab(0xd8342c, 0.06, 0.5, 0.45, x + tx + s * 1.16, y + 0.45, front + 2.6); post(0xc9cbd2, 0.03, 0.45, x + tx + s * 0.95, y, front + 2.6, 4); }
    }
    slab(0x55525a, 1.4, 2.6, 0.16, x + 4, y, z - 10.04);                                         // back door, under a lamp
    slab(0xffe2a6, 0.4, 0.12, 0.3, x + 4, y + 3, z - 10.2, M.glow); halo(x + 4, y + 2.9, z - 10.4, 0xffb860, 4);
    lamp(x + 3, y + 2.8, z - 11.6, 0xffc27a, 34, 16);
    slab(0x2f5a3f, 2.6, 1.5, 1.6, x - 5, y, z - 11); slab(0x244a33, 2.7, 0.1, 1.7, x - 5, y + 1.5, z - 11);
    places.satriale = { door: { x, z: z + 13 }, table: { x: x + 6.5, z: front + 2.6 }, back: { x: x + 4, z: z - 12.2 }, kerb: { x: x + 3, z: c.z + 34, h: Math.PI / 2 }, pig: { x, y: y + 10, z: front - 1.2 } };
  }


  // ----- Vesuvio, Artie Bucco's restaurant (south-east lot of its block). It can burn down. -----
  function buildVesuvio(c) {
    const x = c.x + 13, z = c.z + 13, y = CURB, front = z + 9, back = z - 9, CREAM = 0xf6e6c6, CHAR = 0x2a2422;
    collide(x, z, 20, 18, y + 6.4);
    const table = (tx, tz, shade) => {
      post(0xc9cbd2, 0.05, 0.75, tx, y, tz); post(0xffffff, 0.6, 0.05, tx, y + 0.75, tz, 12);
      for (const s of [-1, 1]) { slab(0x3a2418, 0.46, 0.06, 0.46, tx + s * 1, y + 0.46, tz); slab(0x3a2418, 0.06, 0.55, 0.46, tx + s * 1.22, y + 0.46, tz); post(0x3a2418, 0.03, 0.46, tx + s * 1, y, tz, 4); }
      if (shade) { post(0xffffff, 0.04, 2.5, tx, y, tz, 5); put(M.plain, new THREE.ConeGeometry(1.7, 0.6, 8).translate(tx, y + 2.7, tz), shade); }
    };
    const intact = apart(() => {
      slab(CREAM, 20, 6.4, 18, x, y, z, M.gravel, 3);
      slab(0xb5523b, 20.1, 1, 18.1, x, y, z, M.brick, 2);
      slab(0xffffff, 20.8, 0.3, 18.8, x, y + 6.3, z);
      hip(0xc65a36, 21.8, 19.8, 3, x, y + 6.6, z, 0.4);
      for (const wx of [-6.5, 6.5]) windowAt(x + wx, y + 1.5, front, 4.6, 2.6, 0, 1, true);
      for (const wz of [-4, 3.5]) windowAt(x + 10, y + 1.5, z + wz, 3.4, 2.6, 1, 0, true);
      slab(0x3a2418, 2.4, 3.2, 0.2, x, y, front + 0.05); slab(0xf0bf78, 1.6, 1.4, 0.06, x, y + 1.5, front + 0.16, M.glow);
      [0x1f8a4c, 0xf4f1e8, 0xc8312a].forEach((hex, n) => put(M.plain, new THREE.BoxGeometry(6.7, 0.1, 2.3).rotateX(0.4).translate(x + (n - 1) * 6.7, y + 4.2, front + 1.1), hex));
      sign('Vesuvio', x, y + 5.45, front + 0.12, 0, { w: 8, h: 1.7, color: '#ffe066', bg: '#3a1414', font: '"Mr Dafoe", cursive', size: 0.86 });
      sign('RISTORANTE ITALIANO', x + 10.12, y + 5.3, z, Math.PI / 2, { w: 10, h: 1.1, color: '#f6e7b4', bg: '#3a1414', size: 0.7, glow: false });
      slab(0x55525a, 1.4, 2.6, 0.16, x - 5, y, back - 0.04);                                     // kitchen door
      table(x - 6.5, front + 2.8, 0xc8312a); table(x + 6.5, front + 2.8, 0x1f8a4c); table(x + 13.2, z + 2, 0);
      for (const s of [-1, 1]) { slab(0xb9a58a, 1.2, 0.7, 1.2, x + s * 2.4, y, front + 0.9, M.gravel, 2); put(M.plain, new THREE.ConeGeometry(0.5, 2.2, 7).translate(x + s * 2.4, y + 1.8, front + 0.9), 0x2c5a34); }
    });
    const ruin = apart(() => {
      flat(M.paint, 0x1c1816, 20, 18, x, y + 0.08, z);
      const tall = [3.6, 1.1, 2.7, 0.7, 3.1, 1.8, 4.2, 0.9, 2.2, 3.3];
      for (let n = 0; n < 5; n++) { // what is left of the walls
        slab(CHAR, 4, tall[n], 0.5, x - 8 + n * 4, y, front - 0.25, M.gravel, 3); slab(CHAR, 4, tall[n + 5], 0.5, x - 8 + n * 4, y, back + 0.25, M.gravel, 3);
        slab(CHAR, 0.5, tall[(n + 2) % 10], 3.4, x - 9.75, y, z - 6.8 + n * 3.4, M.gravel, 3); slab(CHAR, 0.5, tall[(n + 7) % 10], 3.4, x + 9.75, y, z - 6.8 + n * 3.4, M.gravel, 3);
      }
      for (let n = 0; n < 26; n++) { // rubble and fallen beams
        const rx = x + (rand() - 0.5) * 17, rz = z + (rand() - 0.5) * 15;
        if (n % 3) slab(n % 2 ? 0x3a322e : 0x14110f, 0.6 + rand() * 1.6, 0.3 + rand() * 0.7, 0.6 + rand() * 1.6, rx, y, rz);
        else put(M.plain, new THREE.BoxGeometry(0.3, 0.3, 4 + rand() * 4).rotateX((rand() - 0.5) * 0.7).rotateY(rand() * 3).translate(rx, y + 0.8, rz), 0x14110f);
      }
      slab(0x8a3a22, 3, 0.1, 2, x + 2, y + 0.3, z - 1, M.glow);                                  // embers
    });
    ruin.visible = false;
    places.vesuvio = {
      centre: { x, z }, door: { x, z: front + 3 }, seat: { x: x + 7.5, z: front + 2.8 }, kerb: { x: x - 4, z: c.z + 34, h: Math.PI / 2 },
      back: { x: x - 5, z: back - 2.2 }, burn() { intact.visible = false; ruin.visible = true; }, restore() { intact.visible = true; ruin.visible = false; },
    };
  }

  // A small wooden house facing fz (+1 south, -1 north), with a porch and a strip of drive.
  function house(x, z, fz, wall, roofTint, storeys = 1) {
    const h = storeys * 3.3 + 0.4, y = CURB, front = z + fz * 5.5;
    slab(wall, 13, h, 11, x, y, z, M.siding, 1);
    collide(x, z, 13, 11, y + h);
    slab(0xffffff, 13.5, 0.25, 11.5, x, y + h - 0.1, z);
    gable(roofTint, 12.2, 2.7, 14.2, x, y + h + 0.15, z, Math.PI / 2);
    slab(0xd8d0c4, 6, 0.3, 2.6, x, y, front + fz * 1.3); slab(0xd8d0c4, 2.4, 0.15, 1, x, y, front + fz * 3);
    for (const s of [-1, 1]) post(0xffffff, 0.1, 2.5, x + s * 2.8, y + 0.3, front + fz * 2.4, 6);
    put(M.shingle, new THREE.BoxGeometry(6.6, 0.18, 3).rotateX(fz * 0.22).translate(x, y + 3, front + fz * 1.4), roofTint);
    slab(0x5a3320, 1.2, 2.3, 0.14, x, y + 0.3, front + fz * 0.05);
    for (const wx of [-4.3, 4.3]) for (let n = 0; n < storeys; n++) windowAt(x + wx, y + 1.3 + n * 3.3, front, 1.8, 1.5, 0, fz, rand() < 0.5);
    for (const s of [-1, 1]) windowAt(x + s * 6.5, y + 1.3, z, 1.8, 1.5, s, 0, rand() < 0.4);
    flat(M.paint, 0x9a94a2, 3.4, 9.5, x + 4.4, y + 0.09, front + fz * 4.9);
    post(0x3a3a44, 0.04, 1, x - 3.5, y, front + fz * 8.6, 4); slab(0x2f56c8, 0.24, 0.2, 0.44, x - 3.5, y + 1, front + fz * 8.6); // mailbox
  }

  // ----- Livia's street: four houses on lawns. Hers is the two-storey one on the south-east lot. -----
  function buildLivia(c) {
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, CURB + 0.05, c.z, 6);
    house(c.x - 14, c.z - 13, -1, 0xcfe8ff, 0x6a5a56); house(c.x + 14, c.z - 13, -1, 0xfff1c9, 0x55525a);
    house(c.x - 14, c.z + 13, 1, 0xffd9e8, 0x55525a); house(c.x + 14, c.z + 13, 1, 0xe9e2d2, 0x6a3a30, 2);
    for (const [px, pz] of [[0, -20], [0, 20], [-24, 0], [24, 2]]) palms.push({ x: c.x + px, z: c.z + pz });
    for (const hz of [-1, 1]) slab(0x2f7d46, 1, 1.1, 20, c.x, CURB, c.z + hz * 14, M.grass, 3);     // hedges between neighbours
    places.livia = { porch: { x: c.x + 14, z: c.z + 20.6 }, path: { x: c.x + 14, z: c.z + 24.5 }, kerb: { x: c.x + 14, z: c.z + 34, h: Math.PI / 2 } };
  }

  // ----- Green Grove, the retirement community: a long residence over gardens with a fountain and a gazebo. -----
  function buildGrove(c) {
    const y = CURB, TILE = 0xc65a36, STONE = 0xd8d0c4, top = y + FLOOR * 3;
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z, 6);
    put(M.balcony, walls(46, FLOOR * 3, 14, c.x, y, c.z - 19, 3), 0xfff1c9);
    collide(c.x, c.z - 19, 46, 14, top);
    slab(0xffffff, 46.8, 0.3, 14.8, c.x, top - 0.1, c.z - 19); hip(TILE, 47.6, 15.6, 3.2, c.x, top + 0.2, c.z - 19, 0.5);
    slab(0xffffff, 9, 0.35, 5, c.x, y + 3.6, c.z - 9.6); gable(TILE, 9.4, 1.6, 5.2, c.x, y + 3.95, c.z - 9.6);
    for (const s of [-1, 1]) for (const pz of [-11.4, -7.6]) post(0xffffff, 0.2, 3.6, c.x + s * 4, y, c.z + pz, 10);
    slab(0x3a2418, 2.6, 3, 0.2, c.x, y, c.z - 11.95);
    // Paths: in from the east kerb, up to the door, and across to the gazebo.
    flat(M.paint, STONE, 25, 2.6, c.x + 16.5, y + 0.09, c.z + 6); flat(M.paint, STONE, 2.6, 14, c.x, y + 0.09, c.z - 3); flat(M.paint, STONE, 2.6, 9, c.x - 11, y + 0.09, c.z + 10.5); flat(M.paint, STONE, 13, 2.6, c.x - 5.5, y + 0.09, c.z + 6);
    // Fountain.
    const fx = c.x, fz = c.z + 6;
    flat(M.paint, STONE, 10, 10, fx, y + 0.1, fz);
    put(M.gravel, new THREE.CylinderGeometry(2.6, 2.8, 0.7, 20).translate(fx, y + 0.35, fz), STONE);
    put(M.glow, new THREE.CylinderGeometry(2.3, 2.3, 0.04, 20).translate(fx, y + 0.72, fz), 0x4fc4dc);
    post(STONE, 0.3, 1.9, fx, y + 0.3, fz, 10); put(M.gravel, new THREE.CylinderGeometry(1.1, 0.35, 0.35, 14).translate(fx, y + 2.3, fz), STONE);
    put(M.glow, new THREE.CylinderGeometry(0.95, 0.95, 0.04, 14).translate(fx, y + 2.49, fz), 0x8fe4f2); ball(0xbff2fa, 0.22, fx, y + 2.75, fz, M.glow);
    collide(fx, fz, 5.2, 5.2, 1);
    // Gazebo.
    const gx = c.x - 11, gz = c.z + 17;
    put(M.wood, new THREE.CylinderGeometry(3.4, 3.4, 0.25, 8).translate(gx, y + 0.12, gz), 0xd9b48a);
    for (let n = 0; n < 8; n++) post(0xffffff, 0.09, 2.7, gx + Math.cos(n * Math.PI / 4 + 0.39) * 3.1, y + 0.25, gz + Math.sin(n * Math.PI / 4 + 0.39) * 3.1, 6);
    put(M.shingle, new THREE.ConeGeometry(4, 1.8, 8).rotateY(Math.PI / 8).translate(gx, y + 3.85, gz), TILE);
    // Planting: flower beds, hedges, benches, palms.
    for (const [bx, bz, hex] of [[10, 12, 0xff5fd2], [-8, 0, 0xffe066], [18, -2, 0xff8a5c], [8, -2, 0xc9b6f2], [-20, 8, 0xff5fd2]]) {
      slab(0x5a3d2b, 5, 0.25, 2.4, c.x + bx, y, c.z + bz);
      for (let n = 0; n < 9; n++) ball(n % 3 ? hex : 0x2f7d46, 0.3, c.x + bx - 2 + (n % 5) * 1, y + 0.45, c.z + bz - 0.5 + (n % 2) * 1);
    }
    for (const [w, d, hx, hz] of [[BLOCK - 5, 1.2, 0, 27.6], [1.2, BLOCK - 5, -27.6, 0], [1.2, 20, 27.6, -17], [1.2, 18, 27.6, 18.5]]) { slab(0x2f7d46, w, 1.2, d, c.x + hx, y, c.z + hz, M.grass, 3); collide(c.x + hx, c.z + hz, w, d, 1.4); }
    bench(c.x + 4.4, c.z + 9.5, Math.PI); bench(c.x - 4.4, c.z + 9.5, Math.PI); bench(c.x + 14, c.z + 8.2, Math.PI);
    for (const [px, pz] of [[20, 18], [-22, -6], [22, -8], [-4, 22], [10, 22]]) palms.push({ x: c.x + px, z: c.z + pz });
    slab(STONE, 0.5, 1.5, 7, c.x + 25.5, y, c.z + 11, M.gravel, 2);
    sign(['GREEN GROVE', 'A RETIREMENT COMMUNITY'], c.x + 25.78, y + 0.85, c.z + 11, Math.PI / 2, { w: 6.4, h: 1.2, color: '#1f5a3a', bg: '#f3efe6', size: 0.7, glow: false });
    places.grove = { kerb: { x: c.x + 34, z: c.z + 6, h: 0 }, gate: { x: c.x + 26, z: c.z + 6 }, fountain: { x: c.x + 4.6, z: c.z + 6 }, gazebo: { x: gx + 1.5, z: gz - 5.2 } };
  }

  // ----- F-Note Records, Hesh's label (north-west lot of its block) -----
  function buildHesh(c) {
    const x = c.x - 13, z = c.z - 13, y = CURB, front = z - 9, top = y + FLOOR * 4, WHITE = 0xf5f5f0, TEAL = 0x1f9c8f;
    put(M.deco, walls(20, FLOOR * 4, 18, x, y, z, 4), WHITE);
    collide(x, z, 20, 18, top);
    roofKit(x, z, 20, 18, top, WHITE, false);
    for (let f = 1; f <= 4; f++) slab(0xffffff, 20.8, 0.16, 18.8, x, y + f * FLOOR - 0.2, z);
    slab(0x16161c, 7, 4.2, 0.5, x, y, front - 0.1); slab(0x2c4a5a, 3, 3.1, 0.1, x, y, front - 0.38); slab(0xc9cbd2, 0.08, 3.1, 0.14, x, y, front - 0.4);
    slab(TEAL, 8, 0.3, 3, x, y + 4.2, front - 1.5);
    // A gold record the height of a storey, and the name in neon.
    put(M.plain, new THREE.CylinderGeometry(2.6, 2.6, 0.2, 28).rotateX(Math.PI / 2).translate(x, y + 9.4, front - 0.3), 0x16161c);
    put(M.plain, new THREE.CylinderGeometry(2.2, 2.2, 0.22, 28).rotateX(Math.PI / 2).translate(x, y + 9.4, front - 0.32), 0xd9a520);
    put(M.plain, new THREE.CylinderGeometry(0.9, 0.9, 0.24, 20).rotateX(Math.PI / 2).translate(x, y + 9.4, front - 0.34), 0xc8312a);
    ball(0x16161c, 0.12, x, y + 9.4, front - 0.46);
    sign('F-Note Records', x, y + 5.6, front - 0.3, Math.PI, { w: 9, h: 1.9, color: '#49e0d0', bg: '#16161c', font: '"Mr Dafoe", cursive', size: 0.8 });
    halo(x, y + 5.6, front - 1.2, 0x49e0d0, 10);
    for (const s of [-1, 1]) { slab(TEAL, 0.5, FLOOR * 4 + 2, 0.5, x + s * 5.4, y, front - 0.2); slab(0x49e0d0, 0.1, FLOOR * 4 + 1.4, 0.1, x + s * 5.4, y + 0.3, front - 0.5, M.glow); }
    places.hesh = { door: { x, z: front - 3.2 }, kerb: { x, z: c.z - 34, h: Math.PI / 2 } };
  }

  // ----- Kolar Bros. Sanitation: a fenced yard with a hut, trucks and bins -----
  function buildKolar(c) {
    const y = CURB, GREEN = 0x2f6b4a, e = 26;
    flat(M.asphalt, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y + 0.05, c.z, 5);
    for (let t = -e; t <= e; t += 4) { // chain-link fence, open on the east side for the gate
      for (const s of [-1, 1]) { post(0x8a8d96, 0.06, 2.4, c.x + t, y, c.z + s * e, 5); if (s < 0 || Math.abs(t) > 5) post(0x8a8d96, 0.06, 2.4, c.x + s * e, y, c.z + t, 5); }
    }
    for (const hy of [1, 2.3]) {
      for (const s of [-1, 1]) slab(0x8a8d96, e * 2, 0.06, 0.06, c.x, y + hy, c.z + s * e);
      slab(0x8a8d96, 0.06, 0.06, e * 2, c.x - e, y + hy, c.z); for (const s of [-1, 1]) slab(0x8a8d96, 0.06, 0.06, e - 5, c.x + e, y + hy, c.z + s * (e + 5) / 2);
    }
    for (const s of [-1, 1]) { collide(c.x, c.z + s * e, e * 2, 0.4, 2.4); collide(c.x + e, c.z + s * (e + 5) / 2, 0.4, e - 5, 2.4); }
    collide(c.x - e, c.z, 0.4, e * 2, 2.4);
    slab(0x9fb0a6, 11, 3.4, 7, c.x - 15, y, c.z - 18, M.siding, 1); collide(c.x - 15, c.z - 18, 11, 7, y + 3.4);
    slab(0x55525a, 11.6, 0.25, 7.6, c.x - 15, y + 3.4, c.z - 18); slab(0x3a2418, 1.1, 2.2, 0.12, c.x - 12, y, c.z - 14.45); windowAt(c.x - 17, y + 1.2, c.z - 14.5, 2.4, 1.2, 0, 1, true);
    sign(['KOLAR BROS.', 'SANITATION'], c.x - 15, y + 4.6, c.z - 14.6, 0, { w: 8, h: 2, color: '#f2c230', bg: '#1f3a2c', size: 0.74, glow: false });
    sign(['KOLAR BROS.', 'SANITATION'], c.x + e + 0.12, y + 1.7, c.z - 9, Math.PI / 2, { w: 5.6, h: 1.4, color: '#f2c230', bg: '#1f3a2c', size: 0.74, glow: false });
    for (const tx of [-4, 4]) { // garbage trucks, parked nose to the north fence
      const tz = c.z - 15;
      slab(0xf2f0ea, 2.5, 2.3, 2.2, c.x + tx, y + 0.55, tz - 3.6); slab(0x24324c, 2.3, 0.9, 0.06, c.x + tx, y + 1.75, tz - 4.72); slab(0x24324c, 0.06, 0.8, 1.2, c.x + tx - 1.26, y + 1.8, tz - 3.9); slab(0x24324c, 0.06, 0.8, 1.2, c.x + tx + 1.26, y + 1.8, tz - 3.9);
      slab(GREEN, 2.6, 2.8, 5.2, c.x + tx, y + 0.6, tz + 0.2); for (let n = 0; n < 4; n++) slab(0x245a3c, 2.7, 2.8, 0.12, c.x + tx, y + 0.6, tz - 1.8 + n * 1.35);
      put(M.plain, new THREE.BoxGeometry(2.6, 2.4, 1.6).rotateX(-0.35).translate(c.x + tx, y + 1.7, tz + 3.3), 0x245a3c);
      for (const s of [-1, 1]) for (const wz of [-3.4, 0.6, 2]) put(M.plain, new THREE.CylinderGeometry(0.5, 0.5, 0.36, 12).rotateZ(Math.PI / 2).translate(c.x + tx + s * 1.15, y + 0.5, tz + wz), 0x17171b);
      collide(c.x + tx, tz - 0.4, 2.8, 9, 3.4);
    }
    const bins = [];
    for (let n = 0; n < 4; n++) { // the bins along the south fence
      const bx = c.x - 12 + n * 7, bz = c.z + 22;
      slab(GREEN, 3, 1.6, 1.8, bx, y, bz); slab(0x245a3c, 3.1, 0.12, 1.9, bx, y + 1.6, bz); collide(bx, bz, 3, 1.8, 1.8);
      bins.push({ x: bx, z: bz - 2 });
    }
    places.kolar = { gate: { x: c.x + 34, z: c.z, h: 0 }, bins };
  }

  // ----- A park: lawns, a pond, paths, palms and a bandstand -----
  function buildPark(c) {
    const y = CURB, STONE = 0xd8d0c4;
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z, 6);
    flat(M.paint, STONE, 3, BLOCK - 4, c.x, y + 0.09, c.z); flat(M.paint, STONE, BLOCK - 4, 3, c.x, y + 0.09, c.z);
    const px = c.x + 12, pz = c.z - 10;
    put(M.gravel, new THREE.CylinderGeometry(9.5, 9.5, 0.3, 28).translate(px, y + 0.15, pz), STONE);
    put(M.glow, new THREE.CylinderGeometry(8.8, 8.8, 0.06, 28).translate(px, y + 0.3, pz), 0x3fb8d4);
    collide(px, pz, 17, 17, 0.5);
    for (let n = 0; n < 5; n++) ball(0x2f7d46, 0.7, px + Math.cos(n * 1.3) * 9.6, y + 0.5, pz + Math.sin(n * 1.3) * 9.6); // reeds and shrubs
    const bx = c.x - 12, bz = c.z + 12;
    put(M.wood, new THREE.CylinderGeometry(4.2, 4.2, 0.4, 8).translate(bx, y + 0.2, bz), 0xd9b48a);
    for (let n = 0; n < 8; n++) post(0xffffff, 0.1, 3, bx + Math.cos(n * Math.PI / 4 + 0.39) * 3.8, y + 0.4, bz + Math.sin(n * Math.PI / 4 + 0.39) * 3.8, 6);
    put(M.shingle, new THREE.ConeGeometry(4.8, 2, 8).rotateY(Math.PI / 8).translate(bx, y + 4.4, bz), 0x1f6b4a);
    collide(bx, bz, 2, 2, 1, true);
    for (const [ox, oz, turn] of [[-12, -8, Math.PI], [12, 10, 0], [-4, 3, Math.PI / 2], [6, -3, -Math.PI / 2]]) bench(c.x + ox, c.z + oz, turn);
    for (const [ox, oz] of [[-22, -20], [22, -22], [-20, 22], [20, 24], [0, -24], [-24, 0], [4, 22]]) palms.push({ x: c.x + ox, z: c.z + oz });
    for (const [ox, oz, hex] of [[-8, -16, 0xff5fd2], [8, 16, 0xffe066], [-16, 8, 0xff8a5c]]) { slab(0x5a3d2b, 5, 0.25, 2.4, c.x + ox, y, c.z + oz); for (let n = 0; n < 9; n++) ball(n % 3 ? hex : 0x2f7d46, 0.3, c.x + ox - 2 + (n % 5) * 1, y + 0.45, c.z + oz - 0.5 + (n % 2) * 1); }
    post(STEEL, 0.07, 2.4, c.x, y, c.z + 1.8, 6); slab(0x1f6b4a, 1.2, 0.8, 0.06, c.x, y + 1.6, c.z + 1.8); // the park notice
    places.park ??= { bench: { x: c.x + 12, z: c.z + 10 }, kerb: { x: c.x + 34, z: c.z + 10, h: 0 }, pond: { x: px, z: pz } };
  }

  // ----- Vice General Hospital: a white block over a drive-through entrance -----
  function buildHospital(c) {
    const y = CURB, WHITE = 0xf4f4f0, top = y + FLOOR * 4;
    flat(M.paint, 0xd8d0c4, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z);
    put(M.office, walls(46, FLOOR * 4, 22, c.x, y, c.z - 14, 4), 0xe6fff8);
    collide(c.x, c.z - 14, 46, 22, top);
    roofKit(c.x, c.z - 14, 46, 22, top, WHITE, false);
    for (let f = 1; f <= 4; f++) slab(WHITE, 46.8, 0.5, 22.8, c.x, y + f * FLOOR - 0.3, c.z - 14);
    slab(WHITE, 18, 0.5, 10, c.x, y + 4.2, c.z + 2); for (const s of [-1, 1]) for (const pz of [-1.6, 5.4]) post(0xc9cbd2, 0.22, 4.2, c.x + s * 8, y, c.z + pz, 10); // the canopy
    slab(0x1a242c, 6, 3.4, 0.2, c.x, y, c.z - 2.95); slab(0xc9cbd2, 0.08, 3.4, 0.24, c.x, y, c.z - 2.93);
    sign(['VICE GENERAL', 'HOSPITAL'], c.x, y + 6.4, c.z - 2.8, 0, { w: 12, h: 2.6, color: '#2f56c8', bg: '#f4f4f0', size: 0.72, glow: false });
    slab(0xd8342c, 2.6, 0.6, 0.1, c.x - 18, y + 7.8, c.z - 2.9); slab(0xf4f4f0, 0.6, 2.6, 0.1, c.x - 18, y + 6.8, c.z - 2.9); // the red cross
    slab(0xd8342c, 0.6, 2.6, 0.12, c.x - 18, y + 6.8, c.z - 2.92); slab(0xf4f4f0, 2.6, 0.6, 0.14, c.x - 18, y + 7.8, c.z - 2.94);
    flat(M.asphalt, 0xffffff, 40, 20, c.x, y + 0.07, c.z + 16, 5);
    for (let k = -5; k <= 5; k++) flat(M.paint, 0xe9e6ee, 0.14, 5, c.x + k * 3.2, y + 0.1, c.z + 24);
    sign('EMERGENCY', c.x + 14, y + 3.9, c.z + 7.1, 0, { w: 5, h: 1, color: '#f4f4f0', bg: '#d8342c', size: 0.8, glow: false });
    const amb = new Car(scene, c.x - 14, c.z + 10, Math.PI / 2, 0xf4f4f0, 'suv'); collide(c.x - 14, c.z + 10, 5.2, 2.2, 2); void amb;
    for (const [px, pz] of [[-24, 20], [24, 20], [-24, 4], [24, 4]]) palms.push({ x: c.x + px, z: c.z + pz });
    places.hospital = { door: { x: c.x, z: c.z + 2 }, kerb: { x: c.x, z: c.z + 34, h: 0 } };
  }

  // ----- The Teittleman motel (south-east lot of its block): two floors of rooms round a forecourt -----
  function buildMotel(c) {
    const x = c.x + 13, z = c.z + 13, y = CURB, PINK = 0xffd3a1, TEAL = 0x1f9c8f;
    flat(M.asphalt, 0xffffff, 26, 24, x, y + 0.05, z, 5);
    // The L: a long wing along the back (north) and a short one down the west side.
    slab(PINK, 24, 6.6, 6, x, y, z - 9, M.gravel, 3); collide(x, z - 9, 24, 6, y + 6.6);
    slab(PINK, 6, 6.6, 12, x - 9, y, z, M.gravel, 3); collide(x - 9, z, 6, 12, y + 6.6);
    slab(0x55525a, 24.6, 0.3, 6.6, x, y + 6.6, z - 9); slab(0x55525a, 6.6, 0.3, 12.6, x - 9, y + 6.6, z);
    slab(TEAL, 24, 0.2, 1.6, x, y + 3.3, z - 5.2); for (let n = 0; n < 7; n++) post(0xc9cbd2, 0.05, 3.3, x - 11 + n * 3.6, y, z - 4.5, 6); // the walkway and its posts
    slab(0xc9cbd2, 24, 0.05, 0.05, x, y + 4.3, z - 4.45);
    for (let n = 0; n < 5; n++) for (const f of [0, 1]) { slab(0x3a2418, 1, 2.2, 0.12, x - 8 + n * 4, y + f * 3.3, z - 5.95); windowAt(x - 6.2 + n * 4, y + 1.4 + f * 3.3, z - 6, 1.2, 1.1, 0, 1, n % 2 === f); } // doors and windows
    slab(0x3a2418, 1.2, 2.4, 0.12, x - 5.95, y, z + 3); sign('OFFICE', x - 5.9, y + 2.9, z + 3, Math.PI / 2, { w: 2, h: 0.6, color: '#16161c', bg: '#f4f4f0', size: 0.8, glow: false });
    for (const s of [-1, 1]) post(0x1c1c22, 0.12, 7, x + 10 + s * 1.2, y, z + 10, 8);
    slab(0x14080f, 4.2, 2.2, 0.4, x + 10, y + 7, z + 10);
    sign(['TEITTLEMAN', 'MOTOR LODGE'], x + 10, y + 8.1, z + 10.22, 0, { w: 4, h: 2, color: '#ffe066', bg: '#14080f', size: 0.7, also: [[x + 10, y + 8.1, z + 9.78, Math.PI]] });
    sign('VACANCY', x + 10, y + 6.2, z + 10.2, 0, { w: 3, h: 0.7, color: '#49e0d0', bg: '#14080f', size: 0.8, also: [[x + 10, y + 6.2, z + 9.8, Math.PI]] });
    halo(x + 10, y + 7.5, z + 11, 0xffe066, 10);
    put(M.plain, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 16).translate(x + 4, y + 0.2, z + 4), 0xd8d0c4); put(M.glow, new THREE.CylinderGeometry(2.3, 2.3, 0.06, 16).translate(x + 4, y + 0.42, z + 4), 0x4fc4dc); collide(x + 4, z + 4, 5, 5, 0.6); // a small pool
    for (const [lx, lz] of [[-1, 8], [9, -1]]) { slab(0xffffff, 0.75, 0.3, 2, x + lx, y + 0.05, z + lz); put(M.plain, new THREE.BoxGeometry(0.75, 0.08, 0.8).rotateX(-0.7).translate(x + lx, y + 0.62, z + lz - 1), 0xff8a5c); }
    lamp(x, y + 3, z - 4.5, 0xffe2a6, 30, 16);
    places.motel = { kerb: { x: x + 4, z: c.z + 34, h: Math.PI / 2 }, office: { x: x - 4.6, z: z + 3 }, court: { x: x + 1, z: z - 1 } };
  }

  // ----- Comley Trucking: a warehouse with loading docks over a yard -----
  function buildComley(c) {
    const y = CURB, BLUE = 0x9fb0c4;
    flat(M.asphalt, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y + 0.05, c.z, 5);
    slab(BLUE, 46, 8, 16, c.x, y, c.z - 18, M.siding, 1.6);
    collide(c.x, c.z - 18, 46, 16, y + 8);
    slab(0x55525a, 46.6, 0.4, 16.6, c.x, y + 8, c.z - 18); flat(M.gravel, 0x8d868c, 45, 15, c.x, y + 8.42, c.z - 18, 5);
    slab(0x8d868c, 46, 1.1, 2.4, c.x, y, c.z - 8.8, M.gravel, 3);                                 // the dock
    collide(c.x, c.z - 8.8, 46, 2.4, 1.3);
    for (let n = 0; n < 5; n++) {
      const dx = c.x - 16 + n * 8;
      slab(0x16161c, 5, 3.6, 0.2, dx, y + 1.1, c.z - 9.95); slab(0xf2c230, 5.4, 0.2, 0.3, dx, y + 4.7, c.z - 9.9);
      for (const s of [-1, 1]) slab(0xf2c230, 0.14, 0.02, 7, dx + s * 2.2, y + 0.07, c.z - 4.2, M.paint);
      if (n === 0 || n === 3) { new Car(scene, dx, c.z - 3.7, 0, 0xf2f0ea, 'truck'); collide(dx, c.z - 3.7, 2.6, 7.8, 3.4); } // trucks backed up to the dock
    }
    sign('COMLEY TRUCKING', c.x, y + 6.6, c.z - 9.9, 0, { w: 18, h: 2.2, color: '#2f56c8', bg: '#f2f0ea', size: 0.8, glow: false });
    for (const [px, pz] of [[-20, 12], [-17, 12], [-20, 15], [18, 16], [21, 16]]) { slab(0xc79a6a, 2.4, 1.6, 2.4, c.x + px, y, c.z + pz, M.wood, 1); collide(c.x + px, c.z + pz, 2.4, 2.4, 1.8); } // pallets
    for (const s of [-1, 1]) { post(STEEL, 0.1, 8, c.x + s * 24, y, c.z + 2); slab(0xffe2a6, 0.8, 0.1, 0.5, c.x + s * 23.4, y + 8, c.z + 2, M.glow); halo(c.x + s * 23.4, y + 7.9, c.z + 2, 0xffb860, 4); }
    lamp(c.x, y + 6, c.z + 2, 0xffd9a8, 60, 30);
    places.comley = { gate: { x: c.x, z: c.z + 34 }, dock: { x: c.x, z: c.z + 1 } };
  }

  // ----- Bonpensiero Bros. Auto Body, Big Pussy's shop (north-east lot of its block) -----
  function buildBodyshop(c) {
    const x = c.x + 13, z = c.z - 13, y = CURB, front = z - 8;
    slab(0xa9b4c0, 20, 6, 16, x, y, z, M.gravel, 3);
    collide(x, z, 20, 16, y + 6);
    slab(0x8a1c1c, 20.3, 1.3, 16.3, x, y + 4.5, z); slab(0x55525a, 20.6, 0.3, 16.6, x, y + 6, z); flat(M.gravel, 0x8d868c, 19.4, 15.4, x, y + 6.32, z, 5);
    for (let n = 0; n < 3; n++) { // three bays, the middle one open
      const bx = x - 6 + n * 6;
      slab(0x16161c, 4.6, 3.6, 0.2, bx, y, front - 0.02);
      if (n !== 1) for (let k = 0; k < 5; k++) slab(0xc9cbd2, 4.6, 0.05, 0.24, bx, y + 0.5 + k * 0.7, front - 0.03);
    }
    sign(['BONPENSIERO BROS.', 'AUTO BODY'], x, y + 5.15, front - 0.2, Math.PI, { w: 12, h: 1.2, color: '#f2c230', bg: '#8a1c1c', size: 0.8, glow: false });
    for (const [tx, tz, n] of [[-9, -1.2, 4], [-8.1, -1.4, 2], [9, -1.3, 3]]) for (let k = 0; k < n; k++) put(M.plain, new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12).translate(x + tx, y + 0.12 + k * 0.25, front + tz), 0x17171b);
    for (const [dx, hex] of [[7.6, 0x2f56c8], [8.4, 0xd8342c]]) post(hex, 0.3, 0.9, x + dx, y, front - 2.4, 10);
    lamp(x, y + 3.4, front - 3, 0xffd9a8, 30, 16);
    places.bodyshop = { door: { x, z: front - 3 }, kerb: { x: x + 2, z: c.z - 34, h: Math.PI / 2 } };
  }

  // ----- Verbum Dei School, where AJ goes: a brick building over a car park with a hoop -----
  function buildSchool(c) {
    const y = CURB, BRICK = 0xd08a6c, top = y + FLOOR * 2;
    put(M.stucco, walls(44, FLOOR * 2, 16, c.x, y, c.z - 18, 2), BRICK);
    collide(c.x, c.z - 18, 44, 16, top);
    roofKit(c.x, c.z - 18, 44, 16, top, BRICK, false);
    slab(0xffffff, 44.8, 0.3, 16.8, c.x, top - 0.9, c.z - 18);
    slab(0xf3efe6, 10, 0.4, 4, c.x, y + 3.6, c.z - 8.4); for (const s of [-1, 1]) post(0xffffff, 0.2, 3.6, c.x + s * 4.4, y, c.z - 6.8, 10);
    slab(0x2c3a5a, 3.2, 3, 0.2, c.x, y, c.z - 9.95);
    sign('VERBUM DEI SCHOOL', c.x, y + 4.5, c.z - 6.38, 0, { w: 9.6, h: 1.1, color: '#f6e7b4', bg: '#2c3a5a', size: 0.74, glow: false });
    post(0xc9cbd2, 0.07, 9, c.x - 14, y, c.z - 5);                                              // flag
    [0xd8342c, 0xf4f4f4, 0x2f56c8].forEach((hex, n) => slab(hex, 2.2, 0.42, 0.04, c.x - 12.85, y + 8.5 - n * 0.42, c.z - 5));
    flat(M.asphalt, 0xffffff, BLOCK - 8, 28, c.x, y + 0.05, c.z + 13, 5);
    for (let k = -7; k <= 7; k++) flat(M.paint, 0xe9e6ee, 0.14, 5.2, c.x + k * 3, y + 0.09, c.z + 22);
    post(STEEL, 0.09, 3.2, c.x + 20, y, c.z + 6); slab(0xf4f4f4, 1.8, 1.1, 0.06, c.x + 20, y + 2.7, c.z + 6.5);
    put(M.plain, new THREE.TorusGeometry(0.24, 0.025, 6, 14).rotateX(Math.PI / 2).translate(c.x + 20, y + 2.9, c.z + 6.85), 0xff8a5c);
    for (const [px, pz] of [[-24, -4], [24, -4]]) palms.push({ x: c.x + px, z: c.z + pz });
    places.school = { lot: { x: c.x + 3, z: c.z + 14 }, gate: { x: c.x + 3, z: c.z + 34 } };
  }

  // ----- Bean Scene, the coffee bar Paulie cannot forgive (south-west lot of its block) -----
  function buildCafe(c) {
    const x = c.x - 13, z = c.z + 13, y = CURB, front = z + 7, GREEN = 0x1f6b4a;
    slab(0xf2e6d0, 16, 5, 14, x, y, z, M.gravel, 3);
    collide(x, z, 16, 14, y + 5);
    slab(GREEN, 16.3, 1, 14.3, x, y + 3.9, z); slab(0x55525a, 16.6, 0.3, 14.6, x, y + 5, z); flat(M.gravel, 0x8d868c, 15.4, 13.4, x, y + 5.32, z, 5);
    for (const wx of [-4.6, 4.6]) windowAt(x + wx, y + 0.9, front, 5, 2.4, 0, 1, true);
    slab(0x3a2418, 1.8, 3, 0.2, x, y, front + 0.05); slab(0xf0bf78, 1.1, 1.5, 0.06, x, y + 1.3, front + 0.16, M.glow);
    put(M.plain, new THREE.BoxGeometry(15, 0.1, 1.8).rotateX(0.4).translate(x, y + 3.5, front + 0.9), GREEN);
    sign('Bean Scene', x, y + 4.4, front + 0.17, 0, { w: 7, h: 1.4, color: '#f6e7b4', bg: '#1f6b4a', font: '"Mr Dafoe", cursive', size: 0.9, glow: false });
    for (const tx of [-4.5, 4.5]) {
      post(0xc9cbd2, 0.05, 0.75, x + tx, y, front + 2.8); post(0xffffff, 0.55, 0.05, x + tx, y + 0.75, front + 2.8, 12);
      for (const s of [-1, 1]) { slab(GREEN, 0.45, 0.06, 0.45, x + tx + s * 0.95, y + 0.45, front + 2.8); slab(GREEN, 0.06, 0.5, 0.45, x + tx + s * 1.16, y + 0.45, front + 2.8); post(0xc9cbd2, 0.03, 0.45, x + tx + s * 0.95, y, front + 2.8, 4); }
    }
    places.cafe = { door: { x, z: front + 2.6 }, kerb: { x, z: c.z + 34, h: Math.PI / 2 } };
  }

  // ----- Inside the Bada Bing: an interior set far below the city, like the therapy office -----
  function buildBingRoom() {
    const X = 2680, Y = -0.1, Z = 0, WOOD = 0x3a2418, PINK = 0xff3fe0;
    interiors.push({ minX: X - 9.7, maxX: X + 9.7, minZ: Z - 6.7, maxZ: Z + 6.7 });
    slab(0x3a2440, 20, 0.2, 14, X, Y - 0.2, Z, M.gravel, 4);                                    // carpet
    slab(0x16101c, 20, 0.2, 14, X, Y + 4.2, Z);
    for (const s of [-1, 1]) { slab(0x5a3450, 20, 4.4, 0.3, X, Y, Z + s * 7.15, M.wood, 3); slab(0x5a3450, 0.3, 4.4, 14, X + s * 10.15, Y, Z, M.wood, 3); }
    // The bar along the back wall, with its shelves, stools and the house phone.
    slab(WOOD, 9, 1.1, 0.9, X + 4, Y, Z - 5.2, M.wood, 2); slab(0x14080f, 9.3, 0.08, 1.1, X + 4, Y + 1.1, Z - 5.2);
    slab(0x14080f, 9, 2.4, 0.3, X + 4, Y + 1.2, Z - 6.85); slab(0x8a5a9a, 8.6, 0.9, 0.05, X + 4, Y + 2.4, Z - 6.68, M.glow);
    for (let n = 0; n < 16; n++) post([0xd9a520, 0x2f7d46, 0xc8312a, 0xe9e2cf, 0x8a5a2a][n % 5], 0.05, 0.32 + (n % 3) * 0.05, X + 0.3 + n * 0.5, Y + 1.55 + (n % 2) * 0.75, Z - 6.62, 6);
    for (let n = 0; n < 5; n++) { post(0xc9cbd2, 0.04, 0.75, X + 0.8 + n * 1.6, Y, Z - 4.2); post(0x8a1c3a, 0.22, 0.08, X + 0.8 + n * 1.6, Y + 0.75, Z - 4.2, 10); }
    slab(0x1c1c22, 0.26, 0.1, 0.2, X + 1.3, Y + 1.18, Z - 5.2); slab(0x1c1c22, 0.07, 0.07, 0.24, X + 1.3, Y + 1.3, Z - 5.2);
    sign('Bada Bing!', X + 4, Y + 3.55, Z - 6.66, 0, { w: 5, h: 1.25, color: '#ff5fd2', bg: '#14080f', font: '"Mr Dafoe", cursive', size: 0.78 });
    // The stage, its pole, and a ring of neon.
    put(M.plain, new THREE.CylinderGeometry(2.4, 2.4, 0.5, 24).translate(X - 6.4, Y + 0.25, Z - 3.6), 0x14080f);
    put(M.glow, new THREE.TorusGeometry(2.4, 0.05, 6, 32).rotateX(Math.PI / 2).translate(X - 6.4, Y + 0.52, Z - 3.6), PINK);
    post(0xc9cbd2, 0.05, 3.7, X - 6.4, Y + 0.5, Z - 3.6, 8);
    // The crew's table, with the week's envelopes on it.
    const tx = X - 1.5, tz = Z + 2.6, seats = [];
    post(WOOD, 0.14, 0.72, tx, Y, tz, 8); put(M.plain, new THREE.CylinderGeometry(1.35, 1.35, 0.07, 24).translate(tx, Y + 0.75, tz), 0x1f5a3a);
    for (let n = 0; n < 7; n++) slab(n % 3 ? 0x86b87e : 0xe9e2cf, 0.3, 0.05 + (n % 3) * 0.04, 0.16, tx - 0.6 + (n % 4) * 0.36, Y + 0.79, tz - 0.3 + (n % 3) * 0.3);
    for (let n = 0; n < 6; n++) {
      const a = n * Math.PI / 3 + 0.5, sx = tx + Math.sin(a) * 2.05, sz = tz + Math.cos(a) * 2.05;
      post(0x8a1c3a, 0.26, 0.08, sx, Y + 0.44, sz, 10); post(0x1c1c22, 0.04, 0.44, sx, Y, sz);
      put(M.plain, new THREE.BoxGeometry(0.5, 0.6, 0.07).translate(0, 0.8, -0.28).rotateY(a).translate(sx, Y, sz), 0x8a1c3a);
      seats.push({ x: sx, y: Y, z: sz, h: a + Math.PI });
    }
    // Pool table, and a television on the wall.
    slab(WOOD, 2.6, 0.8, 1.4, X + 6.4, Y, Z + 3.4, M.wood, 2); slab(0x1f6b4a, 2.4, 0.04, 1.2, X + 6.4, Y + 0.8, Z + 3.4);
    slab(0x1c1c22, 0.12, 1, 1.5, X - 9.9, Y + 2.2, Z + 2.6); slab(0x9fd0f5, 0.04, 0.8, 1.3, X - 9.8, Y + 2.3, Z + 2.6, M.glow);
    lamp(tx, Y + 3.1, tz, 0xffd9a8, 70, 16); lamp(X - 5.5, Y + 3.4, Z - 2.6, 0xff5fd2, 60, 20); lamp(X + 4, Y + 2.9, Z - 3.6, 0xffb060, 34, 12);
    // The way in, on the east wall; what you bump into; and who is always here.
    slab(0x2a1218, 0.1, 3, 1.6, X + 10.02, Y, Z + 4);
    for (const [x, z, w, d] of [[4, -5.2, 9, 1], [tx - X, tz - Z, 2.8, 2.8], [-6.4, -3.6, 5, 5], [6.4, 3.4, 2.8, 1.6]]) collide(X + x, Z + z, w, d, 1.5);
    const georgie = makeLook('georgie'), dancer = makeHuman({ body: 'female', shirt: 0xff5fd2, tee: true, pants: 0xffffff, shoes: 0xf2efe8, hair: 0xd9b25a, hairMesh: 'long' });
    georgie.group.position.set(X + 1.9, Y, Z - 6.1); georgie.group.rotation.y = 0; scene.add(georgie.group);
    dancer.group.position.set(X - 6.4, Y + 0.5, Z - 3.6); dancer.group.rotation.y = Math.PI / 2; dancer.set('dance'); scene.add(dancer.group);
    places.bingRoom = {
      ambient: [georgie, dancer], inside: { x: X + 7, z: Z + 4, h: -Math.PI / 2 },
      y: Y, seats, table: { x: tx, y: Y, z: tz },
      bar: { x: X + 1.3, y: Y, z: Z - 4.0 }, tender: { x: X + 1.9, y: Y, z: Z - 6.1 }, stool: { x: X + 3.4, y: Y, z: Z - 3.6 },
      tableCam: { pos: new THREE.Vector3(X + 3.8, Y + 2.1, Z + 6.2), look: new THREE.Vector3(tx, Y + 0.95, tz) },
      barCam: { pos: new THREE.Vector3(X - 1.8, Y + 1.7, Z - 1.6), look: new THREE.Vector3(X + 1.9, Y + 1.25, Z - 5.4) },
    };
  }
  buildBingRoom();

  // ----- Inside Satriale's: the counter and the meat case, and the back table -----
  function buildShopRoom() {
    const X = 2760, Y = -0.1, Z = 0, TILE = 0xf3efe6;
    interiors.push({ minX: X - 6.7, maxX: X + 6.7, minZ: Z - 5.7, maxZ: Z + 5.7 });
    slab(0xd8d2c8, 14, 0.2, 12, X, Y - 0.2, Z, M.paver, 2);
    slab(0xf6f1e6, 14, 0.2, 12, X, Y + 3.6, Z);
    for (const s of [-1, 1]) { slab(TILE, 14, 3.8, 0.3, X, Y, Z + s * 6.15, M.gravel, 3); slab(TILE, 0.3, 3.8, 12, X + s * 7.15, Y, Z, M.gravel, 3); }
    for (const s of [-1, 1]) { slab(0x8a1c1c, 14, 0.12, 0.32, X, Y + 1.2, Z + s * 6.14); slab(0x8a1c1c, 0.32, 0.12, 12, X + s * 7.14, Y + 1.2, Z); } // a red stripe round the room
    // The counter with its glass case, along the north side.
    slab(0xe9e2d2, 10, 0.95, 1.1, X, Y, Z - 3.2, M.paver, 1.2); slab(0xc9cbd2, 10.2, 0.05, 1.2, X, Y + 0.95, Z - 3.2);
    slab(0xd6ecf5, 10, 0.7, 1, X, Y + 1, Z - 3.2, M.glow); slab(0xc9cbd2, 10.2, 0.04, 1.1, X, Y + 1.7, Z - 3.2);
    for (let n = 0; n < 9; n++) slab([0xc8312a, 0xf2a3b4, 0xa3201c, 0xe88aa0][n % 4], 0.7, 0.14, 0.5, X - 4.2 + n * 1.05, Y + 1.02, Z - 3.2 + (n % 2) * 0.2);
    collide(X, Z - 3.2, 10, 1.1, 1.7);
    slab(0xe9e2d2, 14, 2.4, 0.9, X, Y + 1.2, Z - 5.7, M.gravel, 2); // shelves behind
    for (let n = 0; n < 14; n++) { const r = 0.07 + (n % 3) * 0.02; put(M.plain, new THREE.CylinderGeometry(r, r, 0.22 + (n % 2) * 0.1, 8).translate(X - 6 + n * 0.9, Y + 1.5 + Math.floor(n / 7) * 1.1, Z - 5.3), [0x8a1c1c, 0xd9a520, 0x2f7d46][n % 3]); }
    for (let n = 0; n < 8; n++) put(M.plain, new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8).translate(X - 3.5 + n * 1, Y + 3.0, Z - 4.6), n % 2 ? 0x8a3a2a : 0x6a2a24); // hanging salami
    put(M.plain, new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10).translate(X + 3.8, Y + 1.85, Z - 3.2), 0xc9cbd2); // the scale
    sign(["SATRIALE'S", 'PORK STORE'], X, Y + 2.9, Z - 5.24, 0, { w: 4.4, h: 1, color: '#a3201c', bg: '#f6f1e4', size: 0.74, glow: false });
    // Tables by the window, and the door.
    for (const tx of [-4.2, 4.2]) { post(0xc9cbd2, 0.05, 0.75, X + tx, Y, Z + 2.8); post(0xffffff, 0.5, 0.05, X + tx, Y + 0.75, Z + 2.8, 12); for (const s of [-1, 1]) { slab(0xd8342c, 0.42, 0.06, 0.42, X + tx + s * 0.9, Y + 0.45, Z + 2.8); post(0xc9cbd2, 0.03, 0.45, X + tx + s * 0.9, Y, Z + 2.8, 4); } collide(X + tx, Z + 2.8, 1.2, 1.2, 1); }
    slab(0x3a2418, 1.4, 2.8, 0.1, X, Y, Z + 6.02); slab(0xf0bf78, 1, 1.3, 0.04, X, Y + 1.3, Z + 5.98, M.glow);
    for (const wx of [-4, 4]) slab(0xffe8c0, 3.6, 2, 0.04, X + wx, Y + 1.1, Z + 5.98, M.glow); // the street, through the glass
    lamp(X, Y + 3.3, Z - 1, 0xfff0d0, 50, 14); lamp(X, Y + 3.3, Z + 3.5, 0xfff0d0, 30, 12);
    const butcher = makeHuman({ shirt: 0xf4f4f4, sleeves: 'long', pants: 0xf4f4f4, hair: 0x2b1b12, hairStyle: 'balding', bulk: 1.2, mustache: 0x2b1b12, age: 0.5 });
    butcher.group.position.set(X - 1.5, Y, Z - 4.4); butcher.group.rotation.y = 0; scene.add(butcher.group);
    places.shopRoom = { ambient: [butcher], inside: { x: X, z: Z + 3.2, h: Math.PI } };
  }
  buildShopRoom();

  // ----- Inside the Soprano house: the kitchen, the table, and the den -----
  function buildHouseRoom() {
    const X = 2840, Y = -0.1, Z = 0, CREAM = 0xf3e9d8, WOOD = 0x8a5a44;
    interiors.push({ minX: X - 7.7, maxX: X + 7.7, minZ: Z - 5.7, maxZ: Z + 5.7 });
    slab(0xd9b48a, 16, 0.2, 12, X, Y - 0.2, Z, M.wood, 2);
    slab(0xf6f1e6, 16, 0.2, 12, X, Y + 3.4, Z);
    for (const s of [-1, 1]) { slab(CREAM, 16, 3.6, 0.3, X, Y, Z + s * 6.15, M.gravel, 3); slab(CREAM, 0.3, 3.6, 12, X + s * 8.15, Y, Z, M.gravel, 3); }
    // Kitchen along the west wall: counters, the island, the fridge and stove.
    slab(WOOD, 1, 0.9, 9, X - 7.4, Y, Z - 1, M.wood, 1); slab(0x2a2a30, 1.1, 0.05, 9.1, X - 7.4, Y + 0.9, Z - 1); collide(X - 7.4, Z - 1, 1, 9, 1);
    slab(WOOD, 7, 0.9, 1, X - 3.5, Y, Z - 5.4, M.wood, 1); slab(0x2a2a30, 7.1, 0.05, 1.1, X - 3.5, Y + 0.9, Z - 5.4); collide(X - 3.5, Z - 5.4, 7, 1, 1);
    slab(0xe9e2d2, 1.1, 2, 1, X - 7.35, Y, Z + 4.5); slab(0xc9cbd2, 0.04, 0.6, 0.1, X - 6.78, Y + 1.1, Z + 4.5); collide(X - 7.35, Z + 4.5, 1.1, 1, 2); // fridge
    slab(0xc9cbd2, 1, 0.9, 1, X - 1.2, Y, Z - 5.4); for (let n = 0; n < 4; n++) slab(0x1c1c22, 0.26, 0.02, 0.26, X - 1.5 + (n % 2) * 0.5, Y + 0.9, Z - 5.6 + Math.floor(n / 2) * 0.4, M.plain); // stove
    slab(WOOD, 3, 0.9, 1.4, X - 4, Y, Z - 1.5, M.wood, 1); slab(0x2a2a30, 3.1, 0.05, 1.5, X - 4, Y + 0.9, Z - 1.5); collide(X - 4, Z - 1.5, 3, 1.4, 1); // island
    for (const [bx, bz, hex] of [[-5, -1.5, 0xd8342c], [-3.2, -1.5, 0x2f7d46], [-6.9, -4, 0xf2c230]]) ball(hex, 0.16, X + bx, Y + 1.1, Z + bz); // fruit
    // The table, with its chairs.
    slab(WOOD, 2.8, 0.08, 1.4, X + 0.5, Y + 0.72, Z + 1.5, M.wood, 1); for (const [cx, cz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) post(WOOD, 0.04, 0.72, X + 0.5 + cx, Y, Z + 1.5 + cz, 4);
    for (const [cx, cz, h] of [[-0.7, 1.4, Math.PI], [0.7, 1.4, Math.PI], [-0.7, -1.4, 0], [0.7, -1.4, 0]]) {
      slab(0x5a3320, 0.46, 0.06, 0.46, X + 0.5 + cx, Y + 0.46, Z + 1.5 + cz); put(M.plain, new THREE.BoxGeometry(0.46, 0.5, 0.06).translate(0, 0.75, -0.23).rotateY(h).translate(X + 0.5 + cx, Y, Z + 1.5 + cz), 0x5a3320);
    }
    collide(X + 0.5, Z + 1.5, 2.8, 1.4, 1);
    // The den: sofa, coffee table, television, lamp, a rug, and the stairs going up.
    slab(0x8a2f3a, 5, 0.04, 3.4, X + 5, Y, Z - 2.5, M.gravel, 3);
    slab(0x2f4a44, 3.2, 0.55, 1.1, X + 5.2, Y, Z - 4.4); slab(0x2f4a44, 3.2, 0.5, 0.3, X + 5.2, Y + 0.55, Z - 4.8); for (const s of [-1, 1]) slab(0x27403b, 0.3, 0.3, 1.1, X + 5.2 + s * 1.45, Y + 0.55, Z - 4.4); collide(X + 5.2, Z - 4.4, 3.2, 1.1, 1);
    slab(0x3a2418, 1.4, 0.4, 0.7, X + 5.2, Y, Z - 2.6, M.wood, 1);
    slab(0x1c1c22, 1.3, 0.9, 0.5, X + 5.2, Y + 0.4, Z - 0.3); slab(0x9fd0f5, 1.1, 0.7, 0.04, X + 5.2, Y + 0.5, Z - 0.56, M.glow); collide(X + 5.2, Z - 0.3, 1.3, 0.5, 1.3); // television
    post(0x1c1c22, 0.03, 1.5, X + 7.2, Y, Z - 4.8, 6); put(M.glow, new THREE.ConeGeometry(0.32, 0.4, 12, 1, true).translate(X + 7.2, Y + 1.7, Z - 4.8), 0xffe2a6);
    for (let n = 0; n < 7; n++) slab(0xd9b48a, 1.2, 0.2, 0.32, X + 7.3, Y + n * 0.3, Z + 1.6 + n * 0.32, M.wood, 1); collide(X + 7.3, Z + 2.6, 1.2, 2.4, 2);
    slab(0xe9e2cf, 1.6, 1.2, 0.05, X + 4, Y + 1.5, Z - 6, M.glow);                                 // a window on the garden
    slab(0x3a2418, 1.4, 2.8, 0.1, X + 2, Y, Z + 6.02);                                           // the front door
    lamp(X - 3, Y + 3.1, Z - 2, 0xfff0d0, 45, 14); lamp(X + 4.5, Y + 3, Z - 2, 0xffd9a8, 30, 12);
    const carmela = makeLook('carmela');
    carmela.group.position.set(X - 4, Y, Z - 3.6); carmela.group.rotation.y = Math.PI; scene.add(carmela.group);
    places.houseRoom = { ambient: [carmela], inside: { x: X + 2, z: Z + 3.2, h: Math.PI } };
  }
  buildHouseRoom();

  // ----- A hospital room: the bed, the drip, the monitor, a chair by the window -----
  function buildWardRoom() {
    const X = 2920, Y = -0.1, Z = 0, WHITE = 0xf4f4f0;
    interiors.push({ minX: X - 5.7, maxX: X + 5.7, minZ: Z - 4.7, maxZ: Z + 4.7 });
    slab(0xd8e2e6, 12, 0.2, 10, X, Y - 0.2, Z, M.paver, 2);
    slab(WHITE, 12, 0.2, 10, X, Y + 3.2, Z);
    for (const s of [-1, 1]) { slab(0xc9d8dc, 12, 3.4, 0.3, X, Y, Z + s * 5.15); slab(0xc9d8dc, 0.3, 3.4, 10, X + s * 6.15, Y, Z); }
    slab(0xc9cbd2, 2.1, 0.55, 0.9, X - 2.5, Y, Z - 2.6); slab(0xf4f4f0, 2.2, 0.35, 1, X - 2.5, Y + 0.55, Z - 2.6); // the bed
    slab(0x9fd0f5, 2.1, 0.12, 0.98, X - 2.5, Y + 0.9, Z - 2.6); slab(0xffffff, 0.5, 0.14, 0.5, X - 3.2, Y + 0.9, Z - 2.6); // the blanket, the pillow
    slab(0xc9cbd2, 0.08, 0.9, 1, X - 3.58, Y + 0.35, Z - 2.6); collide(X - 2.5, Z - 2.6, 2.2, 1, 1.2);
    post(0xc9cbd2, 0.03, 1.9, X - 1, Y, Z - 3.6, 6); slab(0xd6ecf5, 0.18, 0.3, 0.1, X - 1, Y + 1.7, Z - 3.6, M.glow); // the drip
    slab(0x1c1c22, 0.6, 0.5, 0.4, X - 4.4, Y + 1.1, Z - 3.6); slab(0x4fc4dc, 0.5, 0.35, 0.03, X - 4.4, Y + 1.18, Z - 3.38, M.glow); post(0xc9cbd2, 0.04, 1.1, X - 4.4, Y, Z - 3.6, 6); // the monitor
    slab(0xb9a58a, 0.6, 0.5, 0.6, X + 1.4, Y, Z - 3.4); slab(0xb9a58a, 0.6, 0.6, 0.08, X + 1.4, Y + 0.5, Z - 3.68); // a chair by the bed
    slab(0xffe8c0, 3, 1.6, 0.04, X + 2.5, Y + 1.4, Z - 5, M.glow); slab(0xffe8c0, 0.04, 1.6, 3, X + 6, Y + 1.4, Z - 1, M.glow); // windows
    slab(0x3a2418, 1.4, 2.6, 0.1, X + 2, Y, Z + 5.02);
    lamp(X - 1, Y + 3, Z - 1.5, 0xf0f6ff, 16, 12);
    places.wardRoom = { inside: { x: X + 2, z: Z + 3.2, h: Math.PI }, bed: { x: X - 2.5, y: Y + 0.95, z: Z - 2.6 }, chair: { x: X + 1.4, y: Y, z: Z - 3.3 }, cam: { pos: new THREE.Vector3(X + 1.2, Y + 1.9, Z + 1.6), look: new THREE.Vector3(X - 2, Y + 1.1, Z - 2.6) } };
  }
  buildWardRoom();

  places.chop = { x: SHORE + 18, z: bounds.minZ + 16 }; // the north end of the beach, where stolen cars get stripped

  // ----- Beach: boardwalk, palms along Ocean Drive, umbrellas and lifeguard huts on the sand -----
  const beachLen = bounds.maxZ - bounds.minZ;
  slab(0xd9b48a, 4.6, 0.12, beachLen - 16, SHORE + 2.3, -0.08, (bounds.minZ + bounds.maxZ) / 2, M.wood, 2.5);
  for (let z = bounds.minZ + 14; z < bounds.maxZ - 10; z += 13) palms.push({ x: SHORE + 5.6 + rand() * 1.5, z: z + rand() * 4 });
  const pierZ = blockCenter(NX - 1, 2).z, offPier = z => Math.abs(z - pierZ) > 7;
  for (let k = 0; k < 14; k++) { const z = bounds.minZ + 12 + rand() * (beachLen - 24); if (offPier(z)) palms.push({ x: SHORE + 14 + rand() * 30, z }); }
  for (let k = 0; k < 24; k++) {
    const x = SHORE + 12 + rand() * 36, z = bounds.minZ + 14 + rand() * (beachLen - 28);
    if (!offPier(z)) continue;
    const canopy = new THREE.ConeGeometry(2, 0.9, 10).translate(x, 2.6, z);
    put(M.plain, canopy, PASTELS[k % PASTELS.length]);
    const col = canopy.attributes.color; // alternate white panels
    for (let i = 0; i < col.count; i++) if (Math.floor((Math.atan2(canopy.attributes.position.getZ(i) - z, canopy.attributes.position.getX(i) - x) + Math.PI) / (Math.PI / 5) + 0.01) % 2) col.setXYZ(i, 1, 1, 1);
    post(0xffffff, 0.05, 2.5, x, -0.1, z, 5);
    put(M.paint, new THREE.PlaneGeometry(1, 2.2).rotateX(-Math.PI / 2).rotateY(rand() * 3).translate(x + 1.4, -0.03, z + 0.4), [0xff5fd2, 0x49e0d0, 0xffe066][k % 3]);
  }
  for (let k = 0; k < 3; k++) { // lifeguard huts on stilts
    const x = SHORE + 34, z = bounds.minZ + beachLen * (0.2 + k * 0.3), tint = [0xff8a5c, 0x49e0d0, 0xf7a8c4][k];
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) post(0xffffff, 0.09, 2.2, x + lx, -0.1, z + lz, 5);
    slab(0xffffff, 3.6, 0.15, 3.6, x, 2.05, z); slab(tint, 2.6, 2, 2.6, x, 2.2, z, M.siding, 0.8);
    slab(0x24324c, 0.05, 0.9, 1.5, x + 1.31, 2.9, z); hip(0xffffff, 3.6, 3.6, 0.9, x, 4.2, z, 0.1, M.plain);
    put(M.wood, new THREE.BoxGeometry(1.1, 0.1, 3.6).rotateX(-0.62).translate(x - 0.8, 1.05, z + 3.2), 0xd9b48a);
    post(0xffffff, 0.04, 1.8, x + 1.2, 5, z + 1.2, 4); slab(0xd8342c, 0.04, 0.5, 0.8, x + 1.2, 6.3, z + 1.62);
    collide(x, z, 2.8, 2.8, 4);
  }

  // ----- The pier: a ramp off the sand, then a railed deck out over the water with a wider head -----
  {
    const ramp = SHORE + 34, deck = SHORE + 41, end = bounds.maxX + 48, dy = 0.4, PILE = 0x6b4a34;
    piers.push({ minZ: pierZ - 2.6, maxZ: pierZ + 2.6, ramp, deck, maxX: end, y: dy });
    slab(0xd9b48a, end - deck, 0.2, 5.2, (deck + end) / 2, dy - 0.2, pierZ, M.wood, 2.5);
    put(M.wood, tiled(new THREE.BoxGeometry(deck - ramp + 0.3, 0.2, 5.2), 7, 0.2, 5.2, 2.5).rotateZ(Math.atan2(dy + 0.1, deck - ramp)).translate((ramp + deck) / 2, (dy - 0.1) / 2 - 0.1, pierZ), 0xd9b48a);
    for (let x = deck; x <= end; x += 3) for (const s of [-1, 1]) {
      post(0xffffff, 0.06, 1, x, dy, pierZ + s * 2.5, 5);
      if (Math.round((x - deck) / 3) % 2 === 0) post(PILE, 0.2, 2.6, x, dy - 2.6, pierZ + s * 2.2, 7);
    }
    for (const s of [-1, 1]) for (const h of [0.55, 1]) slab(0xffffff, end - deck, 0.07, 0.07, (deck + end) / 2, dy + h, pierZ + s * 2.5);
    for (let x = deck + 8; x < end; x += 16) { post(STEEL, 0.07, 3.6, x, dy, pierZ - 2.4); ball(0xffe2a6, 0.2, x, dy + 3.7, pierZ - 2.4, M.glow); halo(x, dy + 3.7, pierZ - 2.4, 0xffb860, 4); }
    slab(0xffffff, 0.07, 1, 5, end, dy, pierZ); bench(end - 1.2, pierZ, -Math.PI / 2);
    places.pier = { start: { x: ramp - 3, z: pierZ }, end: { x: end - 5, z: pierZ } };
  }

  // ----- The marsh on the west shore: reeds and dark water -----
  const marsh = { x: OX - ROAD / 2 - 11, z: blockCenter(0, 4).z };
  for (let n = 0; n < 60; n++) {
    const x = OX - ROAD / 2 - 3 - rand() * 15, z = marsh.z + (rand() - 0.5) * 120;
    if (n % 6 === 0) put(M.paint, new THREE.CircleGeometry(2 + rand() * 3, 10).rotateX(-Math.PI / 2).translate(x, -0.04, z), 0x3d5a4e);
    else if (Math.hypot(x - marsh.x, z - marsh.z) > 4) for (let k = 0; k < 4; k++) put(M.plain, new THREE.ConeGeometry(0.07, 1.5 + rand(), 4).translate(x + rand() - 0.5, 0.6, z + rand() - 0.5), k % 2 ? 0x6f8a4a : 0x4f6f3a);
  }
  places.marsh = marsh;

  buildPalms(scene, palms, rand);

  const oz = blockCenter(NX - 1, 5).z;
  places.ocean = {
    marker: { x: nodeX(NX), z: oz },
    chris: { x: SHORE + 1.5, z: oz - 5 },
    debtor: { x: SHORE + 30, z: oz + 14 },
  };

  // ----- Merge everything into one mesh per material -----
  M.sign.map.needsUpdate = true;
  scene.add(merged(buckets));
  for (const [size, list] of Object.entries(halos)) {
    const n = list.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set(list.slice(i * 4, i * 4 + 3), i * 3);
      tintOf.set(list[i * 4 + 3]).toArray(col, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: +size, map: T.halo, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    points.frustumCulled = false; points.renderOrder = 3;
    scene.add(points);
  }

  places.office = buildOffice(scene, T, 2600, 0);
  for (const q of interiors) { // the walls, for the camera's sake
    collide((q.minX + q.maxX) / 2, q.minZ - 0.6, q.maxX - q.minX + 2, 1.2, 4); collide((q.minX + q.maxX) / 2, q.maxZ + 0.6, q.maxX - q.minX + 2, 1.2, 4);
    collide(q.minX - 0.6, (q.minZ + q.maxZ) / 2, 1.2, q.maxZ - q.minZ, 4); collide(q.maxX + 0.6, (q.minZ + q.maxZ) / 2, 1.2, q.maxZ - q.minZ, 4);
  }
  // Doors between the street and the rooms: stand at `outside` and press F.
  places.doors = [
    { name: "Satriale's", outside: { x: places.satriale.door.x, z: places.satriale.door.z - 2.3, h: 0 }, inside: places.shopRoom.inside },
    { name: 'the Bada Bing', outside: { x: places.bing.door.x, z: places.bing.door.z - 6.4, h: 0 }, inside: places.bingRoom.inside },
    { name: 'home', outside: { x: places.home.spawn.x, z: places.home.spawn.z - 2.6, h: 0 }, inside: places.houseRoom.inside },
    { name: "Dr. Melfi's office", outside: { x: places.melfi.door.x, z: places.melfi.door.z - 2.6, h: 0 }, inside: places.office.inside, hide: [places.office.cast.tony] },
    { name: 'the hospital', outside: { x: places.hospital.door.x, z: places.hospital.door.z - 3.6, h: 0 }, inside: places.wardRoom.inside },
  ];
  places.sky = buildSky(scene, updaters);
  places.update = time => { for (const fn of updaters) fn(time); };
  // k: 0 = the usual sunset, 1 = night.
  places.setNight = k => {
    sea.material.uniforms.night.value = k;
    places.sky.userData.setNight(k);
    M.pool.opacity = 0.3 + k * 0.35;
    for (const m of [M.shop, M.deco, M.balcony, M.stucco]) m.emissiveIntensity = 0.85 + k * 0.25;
  };
  return places;
}

// Palms: a leaning ringed trunk with coconuts, and a crown of drooping fronds.
function buildPalms(scene, list, rand) {
  const color = new THREE.Color();
  const shade = (geo, fn) => {
    const P = geo.attributes.position, a = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) color.set(fn(P.getX(i), P.getY(i), P.getZ(i))).toArray(a, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const H = 7, lean = y => 0.7 * (y / H) ** 2;
  const trunk = new THREE.CylinderGeometry(0.15, 0.3, H, 7, 10).translate(0, H / 2, 0);
  const TP = trunk.attributes.position;
  for (let i = 0; i < TP.count; i++) TP.setX(i, TP.getX(i) + lean(TP.getY(i)));
  trunk.computeVertexNormals();
  shade(trunk, (x, y) => (Math.round(y / 0.7) % 2 ? 0x9a7b55 : 0x7d6245));
  const nuts = [0, 2.1, 4.2].map(a => shade(new THREE.SphereGeometry(0.2, 6, 5).translate(lean(H) + Math.cos(a) * 0.28, H - 0.25, Math.sin(a) * 0.28), () => 0x5a4326));
  const trunkGeo = mergeGeometries([trunk, ...nuts].map(g => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));

  // A frond lies along +z: tapered, folded along its spine, drooping toward the tip.
  const leafGeo = new THREE.PlaneGeometry(1.2, 4.6, 2, 6);
  const LP = leafGeo.attributes.position;
  for (let i = 0; i < LP.count; i++) {
    const t = (LP.getY(i) + 2.3) / 4.6, x = LP.getX(i) * Math.sin(Math.min(1, t * 1.15 + 0.08) * Math.PI) ** 0.6;
    LP.setXYZ(i, x, -1.9 * t * t - Math.abs(x) * 0.45, t * 4.3);
  }
  leafGeo.computeVertexNormals();
  shade(leafGeo, (x, y, z) => (Math.abs(x) < 0.02 ? 0x7dbb55 : z > 3 ? 0x3fae5e : 0x2c9552));

  const LEAVES = 11;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), list.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), list.length * LEAVES);
  const o = new THREE.Object3D(), top = new THREE.Vector3();
  o.rotation.order = 'YXZ';
  list.forEach((p, n) => {
    const s = 0.9 + rand() * 0.45, spin = rand() * 6;
    o.position.set(p.x, 0, p.z); o.rotation.set(0, spin, 0); o.scale.setScalar(s); o.updateMatrix();
    trunks.setMatrixAt(n, o.matrix);
    top.set(lean(H), H, 0).applyMatrix4(o.matrix);
    for (let k = 0; k < LEAVES; k++) {
      o.position.copy(top); o.rotation.set(k < 7 ? -0.5 + rand() * 0.25 : 0.1 + rand() * 0.3, spin + k * 2.4 + rand() * 0.3, 0); o.scale.setScalar(s * (k < 7 ? 1 : 0.85)); o.updateMatrix();
      leaves.setMatrixAt(n * LEAVES + k, o.matrix);
    }
    colliders.push({ minX: p.x - 0.35, maxX: p.x + 0.35, minZ: p.z - 0.35, maxZ: p.z + 0.35, h: 7, thin: true });
  });
  for (const m of [trunks, leaves]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
}

// A small interior set for the therapy scenes, hidden far below the city.
function buildOffice(scene, T, X, Z) {
  const base = -0.1;
  const add = (m, x, y, z) => { m.position.set(X + x, base + y, Z + z); scene.add(m); return m; };
  const panel = T.wood.clone(); panel.repeat.set(5, 1); panel.needsUpdate = true;
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 10), new THREE.MeshLambertMaterial({ color: 0x9a6a50, map: panel, side: THREE.BackSide }));
  add(room, 0, 2.3, 0);
  const carpet = T.gravel.clone(); carpet.repeat.set(6, 5); carpet.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshLambertMaterial({ color: 0x6f5a66, map: carpet }));
  floor.rotation.x = -Math.PI / 2; add(floor, 0, 0.01, 0);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshLambertMaterial({ color: 0x8a2f3a }));
  rug.rotation.x = -Math.PI / 2; add(rug, 0, 0.03, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.3, 32), new THREE.MeshLambertMaterial({ color: 0xd9b25a }));
  ring.rotation.x = -Math.PI / 2; add(ring, 0, 0.035, 0);

  for (const side of [-1, 1]) { // armchairs: seat, back and arms
    add(box(1, 0.5, 1, 0x2f4a44), side * 2.2, 0.25, 0);
    add(box(0.22, 1.3, 1, 0x2f4a44), side * 2.75, 0.65, 0);
    for (const arm of [-1, 1]) add(box(0.9, 0.22, 0.16, 0x27403b), side * 2.25, 0.66, arm * 0.56);
  }
  add(box(0.7, 0.45, 0.7, 0x2b1a12), 0, 0.22, 1.4);              // side table
  add(box(0.24, 0.12, 0.14, 0xe9eef2), 0, 0.51, 1.4);            // the tissues
  add(box(3.2, 3, 0.4, 0x3a2418), -2.5, 1.5, -4.75);             // bookshelf
  for (let row = 0; row < 3; row++) for (let k = 0; k < 11; k++) add(box(0.2, 0.5 + (k * 7 % 3) * 0.06, 0.1, PASTELS[(k + row * 3) % PASTELS.length]), -3.75 + k * 0.25, 0.75 + row * 0.9, -4.52);
  add(box(1.5, 1.1, 0.06, 0xe9e2cf), 2.6, 2.4, -4.95);           // diploma
  add(box(1.62, 1.22, 0.04, 0x2b1a12), 2.6, 2.4, -4.97);
  add(box(2.4, 1.8, 0.06, 0xffc9a0, true), 5.95, 2.4, 0).rotation.y = Math.PI / 2; // sunset window
  for (let k = 0; k < 7; k++) add(box(2.4, 0.04, 0.08, 0xe9e2cf), 5.9, 1.6 + k * 0.27, 0).rotation.y = Math.PI / 2; // blinds
  const pot = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x8a5a44 })), 4.6, 0.25, -3.9);
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2f7d46 }));
  plant.scale.y = 1.5; add(plant, pot.position.x, 1.5, -3.9);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x1c1c22 })), -4.6, 0.8, 3.6);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a6, side: THREE.DoubleSide })), -4.6, 1.8, 3.6); // floor lamp

  const tony = makeTony();
  tony.set('sit'); tony.group.rotation.y = Math.PI / 2; add(tony.group, -2.02, 0, 0);
  const melfi = makeLook('melfi');
  melfi.set('sit'); melfi.group.rotation.y = -Math.PI / 2; add(melfi.group, 2.02, 0, 0);

  const lamp = new THREE.PointLight(0xffd9a8, 45, 30);
  add(lamp, 0, 3.9, 1);
  interiors.push({ minX: X - 5.6, maxX: X + 5.6, minZ: Z - 4.6, maxZ: Z + 4.6 });
  for (const [x, z, w, d] of [[-2.2, 0, 1.2, 1.2], [2.2, 0, 1.2, 1.2], [0, 1.4, 0.8, 0.8], [-2.5, -4.6, 3.4, 0.8]]) colliders.push({ minX: X + x - w / 2, maxX: X + x + w / 2, minZ: Z + z - d / 2, maxZ: Z + z + d / 2, h: 1.5 });
  add(box(1.2, 2.4, 0.08, 0x3a2418), -3.6, 1.2, 4.95);           // the door out
  return {
    cam: new THREE.Vector3(X, base + 1.45, Z + 3.9), look: new THREE.Vector3(X, base + 0.95, Z), cast: { tony, melfi },
    inside: { x: X - 3.6, z: Z + 2.3, h: Math.PI },
  };
}

// Sunset sky dome: gradient, the sun's glow over the ocean, and bands of lit cloud.
// The caller keeps it centred on the camera.
function buildSky(scene, updaters) {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, sun: { value: SUN }, night: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform float time; uniform float night; uniform vec3 sun;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vP);
        float h = d.y;
        vec3 c = mix(vec3(1.0, 0.74, 0.47), vec3(0.96, 0.42, 0.62), smoothstep(0.0, 0.22, h));
        c = mix(c, vec3(0.30, 0.20, 0.58), smoothstep(0.15, 0.7, h));
        float s = max(dot(d, sun), 0.0);
        c += vec3(1.0, 0.55, 0.25) * pow(s, 6.0) * 0.3;
        vec2 uv = d.xz / (h + 0.2) * 1.3 + vec2(time * 0.004, 0.0);
        float cloud = smoothstep(0.5, 0.78, fbm(uv * vec2(0.9, 2.8))) * smoothstep(0.02, 0.16, h);
        vec3 lit = mix(vec3(1.0, 0.66, 0.5), vec3(0.58, 0.34, 0.62), smoothstep(0.08, 0.45, h));
        c = mix(c, lit + vec3(0.3, 0.2, 0.1) * pow(s, 3.0), cloud * 0.7);
        vec3 dark = mix(vec3(0.11, 0.08, 0.24), vec3(0.02, 0.02, 0.07), smoothstep(0.0, 0.55, h));
        dark += step(0.9972, hash(floor(d.xz / (abs(h) + 0.35) * 190.0))) * smoothstep(0.04, 0.3, h) * (1.0 - cloud);
        dark += cloud * vec3(0.05, 0.05, 0.1) + vec3(0.25, 0.3, 0.5) * pow(s, 40.0);
        c = mix(c, dark, night);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  dome.renderOrder = -1; dome.frustumCulled = false;
  updaters.push(t => { dome.material.uniforms.time.value = t; });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(85, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  sun.position.copy(SUN).multiplyScalar(1338);
  sun.lookAt(0, 0, 0);
  group.add(dome, sun);
  scene.add(group);
  const dusk = new THREE.Color(0xfff3c4), moon = new THREE.Color(0xe6ecff);
  group.userData.setNight = k => {
    dome.material.uniforms.night.value = k;
    sun.material.color.copy(dusk).lerp(moon, k);
    sun.scale.setScalar(1 - k * 0.62);
  };
  return group;
}
