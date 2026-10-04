import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, NX, NZ, BLOCK, ROAD, CELL, OX, OZ, nodeX, nodeZ, blockCenter, SHORE, bounds, colliders, lowGround, piers, interiors, mulberry32 } from './grid.js';
import { makeHuman } from './people.js';
import { box, makeLook, makeTony, makeDuck, Car } from './entities.js';

const LA = CITY === 'la';
// Vice City is pastel deco under a pink sky. Los Angeles is concrete, stucco and glass: beige, bone, grey, terracotta.
const PASTELS = LA ? [0xe9e2d2, 0xd9c7a0, 0xf4f2ee, 0xc9b79c, 0xb9b3ba, 0xd08a6c, 0xdfe5ea, 0xa9b4c0] : [0xf7a8c4, 0x8fe0d4, 0xffd3a1, 0xc9b6f2, 0xfff1c9, 0x9fd0f5, 0xf5f5f0, 0xff9e8a];
const GLASS_TINTS = LA ? [0x9fb8d0, 0xb8c8d8, 0x8fa6c4, 0xcfe0ee] : [0xffffff, 0xcfe8ff, 0xffd9e8, 0xd6fff4];
const NEONS = LA ? ['#ff5a4a', '#ffe066', '#6fb0ff', '#ffffff', '#ff8a5c', '#7dffb0'] : ['#ff5fd2', '#49e0d0', '#ffe066', '#ff8a5c', '#8f7bff', '#7dffb0'];
const SHOPS = LA ? ['TACOS', 'DONUTS', 'LIQUOR', 'PAWN', 'DINER', 'BAR', 'GUNS', 'AUTO PARTS', 'LAUNDRY', 'CHECKS CASHED', 'BURGERS', 'VIDEO', 'RECORDS']
  : ['CAFE', 'PAWN', 'LIQUOR', 'DELI', 'VIDEO', 'SURF', 'PIZZA', 'RECORDS', 'BAR', 'TAILOR', 'CIGARS', 'DINER', 'GUNS'];
const HOTELS = LA ? ['HOTEL', 'PALMS', 'SUNSET', 'PACIFIC', 'WILSHIRE', 'ROOSEVELT'] : ['HOTEL', 'OCEAN', 'PALMS', 'DECO', 'VICE', 'CORAL', 'MIAMI'];
const CURB = 0.14;                       // sidewalk height
const FLOOR = 3.4, GROUND = 4.2, BAY = 4; // storey height, shopfront height, width of one window bay
const SPECIAL_LA = { '15,1': 'neil', '8,6': 'bank', '2,9': 'drivein', '6,9': 'kates', '3,5': 'truckstop', '10,3': 'hospital', '8,3': 'precinct', '6,2': 'depository', '10,8': 'bookstore',
  '12,4': 'park', '4,11': 'park', '9,12': 'apron', '10,12': 'apron', '11,12': 'terminal', '12,12': 'apron', '13,12': 'hangar', '14,12': 'apron', '2,7': 'yard', '13,8': 'church' };
const SPECIAL_VICE = { '0,0': 'home', '5,3': 'melfi', '3,5': 'bing', '2,2': 'satriale', '6,1': 'vesuvio', '1,4': 'livia', '0,6': 'grove', '5,5': 'hesh', '0,3': 'kolar',
  '4,0': 'comley', '2,4': 'bodyshop', '6,4': 'school', '4,2': 'cafe', '8,2': 'park', '3,8': 'park', '9,7': 'park', '9,1': 'hospital', '10,5': 'motel' };
const SUN = new THREE.Vector3(1250, 190, 420).normalize();
const HOUSE_WALLS = LA ? [0xe9e2d2, 0xf4f2ee, 0xd9c7a0, 0xc9b79c, 0xe6d2b4, 0xdfe5ea] : [0xcfe8ff, 0xfff1c9, 0xffd9e8, 0xe9e2d2, 0xd6fff4, 0xf7a8c4, 0xf4f2ee, 0xc9b6f2];
const FIRMS = [['VICE FREIGHT', 'INTERSTATE HAULAGE'], ['ATLANTIC SALVAGE', 'SCRAP · PARTS · TOWING'], ['GULF SEAFOOD', 'WHOLESALE'], ['SUNSHINE CEMENT', 'READY MIX'], ['BAYSIDE PLUMBING', 'SUPPLY CO.'], ['MARINA ICE', 'BLOCK & CRUSHED']];

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
  const rand = mulberry32(LA ? 4127 : 1999); // each city is dealt its own hand
  const pick = list => list[Math.floor(rand() * list.length)];
  const places = {}, updaters = [];
  const W = NX * CELL + ROAD, D = NZ * CELL + ROAD;
  // People who are always inside somewhere.
  const PED_ROOM_LOOKS = [
    { shirt: 0xff5fd2, tee: true, pants: 0xf5f0e6, hair: 0x2b1b12, hairMesh: 'parted', stubble: 0.3 },
    { pattern: 'palms', shirt: 0xe0563f, pants: 0xf5f0e6, hair: 0x7a3b1a, hairStyle: 'receding', mustache: 0x7a3b1a, age: 0.5, bulk: 1.2 },
    { body: 'female', shirt: 0xffffff, tee: true, pants: 0x3b6ea8, hair: 0xc9a14a, hairMesh: 'long' },
    { jacket: 0x16161c, shirt: 0xf4f4f4, tucked: true, pants: 0x16161c, hair: 0x1c1410, hairMesh: 'parted', hat: 'fedora', hatColor: 0x1c1c22, age: 0.4 },
    { shirt: 0x49e0d0, pants: 0x2b2b3a, hair: 0x111111, hairMesh: 'buzzed', dark: true },
    { body: 'female', jacket: 0x8f7bff, shirt: 0xffffff, pants: 0x8f7bff, tucked: true, hair: 0x2a1a14, hairMesh: 'long', age: 0.3 },
  ];
  const OLD_LOOKS = [
    { pattern: 'plaid', shirt: 0x8d93cc, pants: 0xd9c7a0, hair: 0xdddddd, hairStyle: 'balding', age: 1, mustache: 0xd0d0d0, bulk: 1.1 },
    { body: 'female', jacket: 0xffd3a1, shirt: 0xffffff, pants: 0x6f6f7a, tucked: true, hair: 0xc4c1bb, hairMesh: 'parted', hairShift: [0, -0.045, 0.004], age: 1, glasses: 'clear', height: 0.9 },
    { jacket: 0x8d8a8e, shirt: 0xf4f4f4, tie: 0x6a1c2c, tucked: true, pants: 0x8d8a8e, hair: 0x9a9690, hairStyle: 'balding', hat: 'fedora', hatColor: 0x6f6a66, age: 1, bulk: 0.95 },
  ];
  const KID_LOOKS = [
    { pattern: 'stripes', shirt: 0xece6dc, tee: true, pants: 0x3b6ea8, hair: 0x3a2a1c, hairMesh: 'parted', height: 0.82, head: 1.2, bulk: 1.1 },
    { body: 'female', shirt: 0x9fd0f5, tee: true, pants: 0x3b6ea8, hair: 0x2a1a14, hairMesh: 'long', height: 0.86, head: 1.12 },
    { shirt: 0xd8342c, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', dark: true, hat: 'cap', height: 0.84, head: 1.18, bulk: 0.95 },
  ];
  const T = surfaces(rand);

  const lam = opts => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  const lit = f => lam({ map: f.map, emissiveMap: f.glow, emissive: 0xffffff, emissiveIntensity: 0.85 });
  const decal = opts => lam({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...opts });
  const under = opts => lam({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...opts });
  const M = {
    plain: lam(), glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    paver: lam({ map: T.paver }), asphalt: lam({ map: T.asphalt }), tarmac: under({ map: T.asphalt }), grass: decal({ map: T.grass }), paint: decal(),
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
  // Lights inside a room are not real until the camera is in that room: a few shared lights move between rooms.
  const roomLamp = (q, x, y, z, hex, power, reach) => q.lights.push({ x, y, z, hex, power, reach });
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

  // One mesh per material and 200 m square from a set of buckets, so what is behind the camera is culled.
  const CHUNK = 200;
  const merged = map => {
    const group = new THREE.Group();
    for (const [mat, list] of map) {
      const chunks = new Map();
      for (const g of list) {
        g.computeBoundingBox();
        const c = g.boundingBox.min.clone().add(g.boundingBox.max).multiplyScalar(0.5);
        const key = `${Math.floor(c.x / CHUNK)},${Math.floor(c.z / CHUNK)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(g);
      }
      for (const part of chunks.values()) {
        const mixed = part.some(g => !g.index);
        const mesh = new THREE.Mesh(mergeGeometries(mixed ? part.map(g => (g.index ? g.toNonIndexed() : g)) : part), mat);
        const solid = mat !== M.glow && mat !== M.sign && mat !== M.pool;
        mesh.castShadow = solid && mat !== M.grass && mat !== M.paint && mat !== M.tarmac; mesh.receiveShadow = solid;
        if (mat === M.pool) mesh.renderOrder = 2;
        group.add(mesh);
      }
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
  const AH = 4096; // tall enough for every sign in either city
  atlas.width = 2048; atlas.height = AH;
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
      if (py + ph > AH) return; // out of room: the city simply has one sign fewer
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
      for (let i = 0; i < 4; i++) uv.setXY(i, (slot.px + uv.getX(i) * slot.pw) / 2048, 1 - (slot.py + (1 - uv.getY(i)) * slot.ph) / AH);
      put(M.sign, geo.rotateY(st).translate(sx, sy, sz));
    }
  }
  const neonFor = text => NEONS[(text.length * 7 + text.charCodeAt(0)) % NEONS.length];
  const facing = (fx, fz) => (fx ? fx * Math.PI / 2 : fz > 0 ? 0 : Math.PI);

  // ----- Ground: sea, sand island, roads -----
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, sun: { value: SUN }, night: { value: 0 }, haze: { value: LA ? new THREE.Vector3(0.58, 0.64, 0.80) : new THREE.Vector3(0.949, 0.627, 0.706) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float time; uniform float night; uniform vec3 sun; uniform vec3 haze;
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
        c = mix(c, mix(haze, vec3(0.07, 0.06, 0.15), night), smoothstep(140.0, 800.0, distance(vW, cameraPosition)));
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
    style ??= LA ? (h >= 24 ? 'office' : h <= 12 ? 'stucco' : pick(['stucco', 'office', 'balcony', 'stucco']))
      : h >= 30 ? pick(['office', 'office', 'deco', 'balcony']) : h <= 12 ? pick(['stucco', 'deco']) : pick(['deco', 'balcony', 'stucco', 'balcony']);
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
        if (rand() < 0.5 && top < 30) {                                                           // neon name over the door, which opens
          const sw = Math.min(len * 0.7, 9), name = pick(SHOPS), neon = neonFor(name);
          sign(name, x + ax * (w / 2 + 0.2), CURB + base + 1.3, z + az * (d / 2 + 0.2), facing(ax, az), { w: sw, h: sw / 4, color: neon, font: name.length % 2 ? '"Mr Dafoe", cursive' : undefined });
          halo(x + ax * (w / 2 + 1), CURB + base + 1.3, z + az * (d / 2 + 1), hexOf(neon), 10);
          const dx = x + ax * (w / 2 + 0.08), dz = z + az * (d / 2 + 0.08);
          slab(0x20202a, ax ? 0.16 : 1.5, 2.7, az ? 0.16 : 1.5, dx, CURB, dz); slab(0xf6cf8a, ax ? 0.18 : 0.9, 1.6, az ? 0.18 : 0.9, dx, CURB + 0.7, dz, M.glow);
          shopDoors.push({ shop: name, outside: { x: x + ax * (w / 2 + 1.6), z: z + az * (d / 2 + 1.6), h: Math.atan2(ax, az) }, kerb: { x: x + ax * (w / 2 + 9), z: z + az * (d / 2 + 9), h: ax ? 0 : Math.PI / 2 } });
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
    if (!office && floors >= 3 && rand() < 0.4) { // a fire escape zig-zagging down a side wall
      const side = fx ? -fx : (rand() < 0.5 ? -1 : 1), onX = !!fx || rand() < 0.5;
      const ex = onX ? x + side * (w / 2 + 0.6) : x + (rand() - 0.5) * (w - 8), ez = onX ? z + (rand() - 0.5) * (d - 8) : z + (fz ? -fz : side) * (d / 2 + 0.6);
      const dir = onX ? side : (fz ? -fz : side);
      for (let f = 1; f <= floors; f++) {
        const py = CURB + base + f * FLOOR - 0.6;
        slab(0x2a2a30, onX ? 1.1 : 4.4, 0.08, onX ? 4.4 : 1.1, ex, py, ez);                                   // platform
        slab(0x2a2a30, onX ? 0.05 : 4.4, 0.9, onX ? 4.4 : 0.05, ex + (onX ? dir * 0.5 : 0), py + 0.08, ez + (onX ? 0 : dir * 0.5)); // rail
        for (let k = 0; k < 7; k++) post(0x2a2a30, 0.02, 0.9, ex + (onX ? dir * 0.5 : -2 + k * 0.7), py + 0.08, ez + (onX ? -2 + k * 0.7 : dir * 0.5), 4);
        if (f < floors) put(M.plain, new THREE.BoxGeometry(onX ? 0.7 : 3.6, 0.06, onX ? 3.6 : 0.7).rotateX(onX ? (f % 2 ? 0.75 : -0.75) : 0).rotateZ(onX ? 0 : (f % 2 ? 0.75 : -0.75)).translate(ex, py + FLOOR / 2, ez), 0x2a2a30); // stair
      }
      for (const s of [-1, 1]) post(0x2a2a30, 0.03, floors * FLOOR - 0.6, ex + (onX ? dir * 0.5 : s * 2.1), CURB + base + FLOOR - 0.6, ez + (onX ? s * 2.1 : dir * 0.5), 4);
    }
    if (top > 30 && rand() < 0.3) { // rooftop billboard
      const ad = pick([['FLASH FM', '80s HITS ALL NIGHT'], ['VICE COLA', 'ICE COLD'], ['OCEAN VIEW', 'CONDOS FROM $49,000'], ['SUNSHINE AUTOS', 'DRIVE IT HOME TODAY'], ['PIZZA BY THE SLICE', 'OPEN LATE']]);
      const bz = z + (fz || 1) * (d / 2 - 1), turn = facing(0, fz || 1);
      sign(ad, x, top + 4.2, bz, turn, { w: 13, h: 5, color: neonFor(ad[0]), bg: ['#1a1024', '#10242a', '#2a1418'][ad[0].length % 3], size: 0.6 });
      slab(0x2a2a30, 13.4, 5.4, 0.3, x, top + 1.5, bz - (fz || 1) * 0.18);
      for (const s of [-1, 1]) post(0x2a2a30, 0.14, 1.6, x + s * 4.5, top, bz - (fz || 1) * 0.18);
    }
  }

  const palms = [], shopDoors = [], parkedSpots = [];
  const maxDist = Math.hypot(NX * CELL / 2, NZ * CELL / 2);
  const lots = (c, i, skip, low = false) => {
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
      const h = low ? 8 : beach ? 8 + Math.floor(rand() * 3) * 4 : 8 + Math.floor(rand() * 3 + downtown * rand() * 11) * 4;
      building(c.x + a * 13, c.z + b * 13, w, d, h, { fx: a, fz: b, style: low ? pick(['stucco', 'stucco', 'deco']) : undefined });
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
    for (let n = 0; n < 5; n++) { // small things along the kerb
      const side = Math.floor(rand() * 4), t = (rand() - 0.5) * 40, x = c.x + (side < 2 ? t : (side === 2 ? e : -e)), z = c.z + (side < 2 ? (side ? e : -e) : t);
      const kind = n < 4 ? n : 4 + Math.floor(rand() * 2), turn = [Math.PI, 0, Math.PI / 2, -Math.PI / 2][side]; // heading from the kerb toward the road
      if (kind === 4) { // a phone booth, glass in an aluminium frame
        slab(0xc9cbd2, 1, 0.1, 1, x, CURB, z); slab(0xc9cbd2, 1, 0.14, 1, x, CURB + 2.2, z); slab(0x2f56c8, 1.02, 0.3, 1.02, x, CURB + 2.34, z);
        put(M.glow, new THREE.BoxGeometry(0.92, 2.1, 0.92).translate(x, CURB + 1.15, z), 0xcfe8ff);
        for (const [ox, oz] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) post(0xc9cbd2, 0.04, 2.2, x + ox, CURB, z + oz, 4);
        slab(0x1c1c22, 0.3, 0.4, 0.14, x, CURB + 1.2, z - 0.3); collide(x, z, 1, 1, 2.5);
      } else if (kind === 5) { // a bus shelter: two posts, a glass back, a roof and a bench
        const dx = Math.sin(turn), dz = Math.cos(turn), w = 3.2; // (dx, dz) points at the road
        for (const sgn of [-1, 1]) post(0x3a3a44, 0.06, 2.4, x - dz * sgn * w / 2 - dx * 0.5, CURB, z + dx * sgn * w / 2 - dz * 0.5, 4);
        put(M.plain, new THREE.BoxGeometry(dz ? w : 1.6, 0.08, dx ? w : 1.6).translate(x, CURB + 2.4, z), 0x3a3a44);
        put(M.glow, new THREE.BoxGeometry(dz ? w : 0.06, 2, dx ? w : 0.06).translate(x - dx * 0.75, CURB + 1.3, z - dz * 0.75), 0xd6ecf5);
        bench(x - dx * 0.4, z - dz * 0.4, turn);
        post(0x3a3a44, 0.04, 2.6, x + dz * w / 2 + dx * 0.2, CURB, z - dx * w / 2 + dz * 0.2, 4);
        sign('BUS', x + dz * w / 2 + dx * 0.2, CURB + 2.5, z - dx * w / 2 + dz * 0.2, turn, { w: 0.5, h: 0.5, color: '#ffffff', bg: '#2f56c8', size: 0.8, glow: false, also: [[x + dz * w / 2 + dx * 0.2, CURB + 2.5, z - dx * w / 2 + dz * 0.2, turn + Math.PI]] });
        collide(x - dx * 0.75, z - dz * 0.75, dz ? w : 0.3, dx ? w : 0.3, 2.4);
      } else if (kind === 0) { // fire hydrant
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
  // Districts: industry in the north-west corner, houses along the west and south, hotels on the beach,
  // and the towers in the middle. The named places keep the blocks the story was written around.
  const district = (i, j) => {
    if (i === NX - 1) return 'beach';
    if (LA) { // houses in the hills to the north and on the east side, yards in the south-west and by the airport, towers between
      if (j <= 1 || (i >= 11 && j <= 4)) return 'suburb';
      if ((i <= 4 && j >= 7) || j >= 11) return 'industry';
      return 'city';
    }
    if (i <= 1 && j <= 1) return 'suburb'; // the Sopranos' neighbours
    if ((j <= 1 && i <= 6) || (i <= 1 && j <= 3)) return 'industry';
    if ((i <= 2 && j >= 4) || (j >= NZ - 2 && i <= 7)) return 'suburb';
    return 'city';
  };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const c = blockCenter(i, j), core = LA && Math.abs(i - 8) <= 2 && Math.abs(j - 6) <= 1; // the downtown core: nothing but towers
    const kind = (LA ? SPECIAL_LA : SPECIAL_VICE)[`${i},${j}`] ?? (LA && i === 11 ? 'river' : core ? 'tower' : pickBlock(district(i, j), i, j));
    if (kind === 'bing') { // a ring of sidewalk around a car park at road level
      for (const s of [-1, 1]) {
        slab(0xffffff, BLOCK, CURB, 5, c.x, 0, c.z + s * (BLOCK / 2 - 2.5), M.paver, 6);
        slab(0xffffff, 5, CURB, BLOCK - 10, c.x + s * (BLOCK / 2 - 2.5), 0, c.z, M.paver, 6);
      }
    } else if (kind !== 'river') slab(LA ? 0xcfcfd2 : 0xffffff, BLOCK, CURB, BLOCK, c.x, 0, c.z, M.paver, 6);
    if (kind !== 'river') {
      for (const sx of [-1, 1]) for (const sz of LA ? [0] : [-14, 14]) palms.push({ x: c.x + sx * 28.8, z: c.z + sz }); // one tall palm a side in Los Angeles, two in Vice City
      furniture(c, i, j);
    }
    if (kind === 'river') { buildRiver(c, j); continue; }

    if (kind === 'neil') buildNeil(c);
    else if (kind === 'bank') buildBank(c);
    else if (kind === 'drivein') buildDriveIn(c);
    else if (kind === 'kates') { buildRoadDiner(c, "KATE'S", 'kates'); lots(c, i, [-1, 1]); }
    else if (kind === 'truckstop') buildTruckStop(c);
    else if (kind === 'precinct') { buildPrecinct(c); lots(c, i, [-1, -1]); }
    else if (kind === 'depository') buildDepository(c);
    else if (kind === 'bookstore') { buildBookstore(c); lots(c, i, [1, 1]); }
    else if (kind === 'apron' || kind === 'terminal' || kind === 'hangar') buildAirport(c, kind);
    else if (kind === 'home') buildHome(c);
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
    else if (kind === 'tower') {
      const downtown = 1 - Math.hypot(c.x, c.z) / maxDist;
      building(c.x, c.z, 36 + Math.floor(rand() * 3) * 4, 36 + Math.floor(rand() * 3) * 4, core ? 64 + Math.floor(rand() * 8) * 8 : i === NX - 1 ? 12 : 16 + Math.floor(rand() * 4 + downtown * (LA ? 12 : 9)) * 4, { fx: rand() < 0.5 ? 1 : -1, fz: rand() < 0.5 ? 1 : -1 });
    }
    else if (kind === 'houses') buildHouses(c);
    else if (kind === 'yard') buildYard(c);
    else if (kind === 'gas') { buildGas(c); lots(c, i, [1, -1]); }
    else if (kind === 'carlot') buildCarLot(c);
    else if (kind === 'church') buildChurch(c);
    else if (kind === 'lowrise') lots(c, i, null, true);
    else lots(c, i);
  }
  function pickBlock(where, i, j) {
    const r = rand();
    if (where === 'industry') return r < 0.5 ? 'yard' : r < 0.6 ? 'gas' : 'lowrise';
    if (where === 'suburb') return r < 0.62 ? 'houses' : r < 0.7 ? 'church' : r < 0.78 ? 'park' : r < 0.86 ? 'gas' : 'lots';
    if (where === 'beach') return r < 0.08 ? 'park' : 'lots';
    return r < 0.22 ? 'tower' : r < 0.27 ? 'gas' : r < 0.32 ? 'carlot' : r < 0.35 ? 'church' : 'lots';
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
  function house(x, z, fz, wall, roofTint, storeys = 1, room = 'HOUSE') {
    const h = storeys * 3.3 + 0.4, y = CURB, front = z + fz * 5.5;
    shopDoors.push({ shop: room, outside: { x, z: front + fz * 2.2, h: fz > 0 ? 0 : Math.PI } });
    slab(wall, 13, h, 11, x, y, z, LA ? M.gravel : M.siding, LA ? 3 : 1); // stucco in Los Angeles, clapboard in Vice City
    collide(x, z, 13, 11, y + h);
    slab(0xffffff, 13.5, 0.25, 11.5, x, y + h - 0.1, z);
    if (LA) hip(0xc65a36, 14.2, 12.2, 1.9, x, y + h + 0.15, z, 0.35); else gable(roofTint, 12.2, 2.7, 14.2, x, y + h + 0.15, z, Math.PI / 2);
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
    house(c.x - 14, c.z + 13, 1, 0xffd9e8, 0x55525a); house(c.x + 14, c.z + 13, 1, 0xe9e2d2, 0x6a3a30, 2, 'LIVIA');
    for (const [px, pz] of [[0, -20], [0, 20], [-24, 0], [24, 2]]) palms.push({ x: c.x + px, z: c.z + pz });
    for (const hz of [-1, 1]) slab(0x2f7d46, 1, 1.1, 20, c.x, CURB, c.z + hz * 14, M.grass, 3);     // hedges between neighbours
    places.livia = { porch: { x: c.x + 14, z: c.z + 20.6 }, path: { x: c.x + 14, z: c.z + 24.5 }, kerb: { x: c.x + 14, z: c.z + 34, h: Math.PI / 2 } };
  }

  // ----- A street of houses: four on lawns, as on Livia's block, in whatever colours the owners chose -----
  function buildHouses(c) {
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, CURB + 0.05, c.z, 6);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      if (rand() < 0.12) { // an empty lot with a tree and a swing
        palms.push({ x: c.x + a * 14, z: c.z + b * 12 });
        for (const s of [-1, 1]) post(0x8a8d96, 0.05, 2.2, c.x + a * 14 + s * 1.2, CURB, c.z + b * 18, 5);
        slab(0x8a8d96, 2.6, 0.06, 0.06, c.x + a * 14, CURB + 2.2, c.z + b * 18); slab(0xd8342c, 0.5, 0.05, 0.2, c.x + a * 14, CURB + 0.6, c.z + b * 18);
        continue;
      }
      house(c.x + a * 14, c.z + b * 13, b, pick(HOUSE_WALLS), pick([0x6a5a56, 0x55525a, 0x6a3a30, 0x3f3c44]), rand() < 0.35 ? 2 : 1);
      places.flat ??= { door: shopDoors[shopDoors.length - 1].outside, kerb: { x: c.x + a * 14 + 4.4, z: c.z + b * 34, h: b > 0 ? Math.PI / 2 : -Math.PI / 2 }, yard: { x: c.x + a * 14 - 5, z: c.z + b * 21 } }; // Brendan's place
      if (rand() < 0.3) parkedSpots.push({ x: c.x + a * 14 + 4.4, z: c.z + b * 24, h: b > 0 ? 0 : Math.PI, kind: pick(['sedan', 'pickup', 'suv', 'coupe']) });
    }
    for (const [px, pz] of [[0, -20], [0, 20], [-24, 0], [24, 2]]) if (rand() < 0.7) palms.push({ x: c.x + px, z: c.z + pz });
    for (const hz of [-1, 1]) slab(0x2f7d46, 1, 1.1, 20, c.x, CURB, c.z + hz * 14, M.grass, 3);
  }

  // ----- An industrial yard: a steel shed with roller doors, a fenced lot of containers and pallets, and a water tower -----
  function buildYard(c) {
    const y = CURB, firm = pick(FIRMS), WALL = pick([0x9fb0c4, 0xb9b3ba, 0xcfc8ba, 0x8fa39a]), e = 26;
    flat(M.tarmac, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y + 0.015, c.z, 5);
    const sx = c.x - 4, sz = c.z - 16, sw = 40, sd = 20, sh = 7 + Math.floor(rand() * 2) * 2;
    slab(WALL, sw, sh, sd, sx, y, sz, M.siding, 1.6); collide(sx, sz, sw, sd, y + sh);
    gable(0x55525a, sd + 1, 1.8, sw + 1, sx, y + sh, sz, Math.PI / 2, M.plain);
    for (let n = 0; n < 3; n++) { // roller doors on the yard side
      const dx = sx - 13 + n * 13;
      slab(0x3a3a44, 5, 4.4, 0.2, dx, y, sz + sd / 2 + 0.05); for (let k = 0; k < 6; k++) slab(0x5a5a66, 5, 0.05, 0.24, dx, y + 0.6 + k * 0.65, sz + sd / 2 + 0.06);
    }
    for (let n = 0; n < 6; n++) windowAt(sx - 17 + n * 7, y + 5.4, sz + sd / 2, 1.6, 1, 0, 1, n % 3 === 1);
    sign(firm, sx, y + sh - 1.2, sz + sd / 2 + 0.12, 0, { w: 16, h: 2.2, color: '#f2f0ea', bg: pick(['#2f56c8', '#8a1c1c', '#1f3a2c', '#2a2a30']), size: 0.62, glow: false });
    shopDoors.push({ shop: 'WAREHOUSE', outside: { x: sx + 17, z: sz + sd / 2 + 1.6, h: 0 } });
    slab(0x3a2418, 1.2, 2.4, 0.16, sx + 17, y, sz + sd / 2 + 0.04);
    for (let t = -e; t <= e; t += 4) for (const s of [-1, 1]) { post(0x8a8d96, 0.06, 2.4, c.x + t, y, c.z + s * e, 5); if (s < 0 || Math.abs(t) > 6) post(0x8a8d96, 0.06, 2.4, c.x + s * e, y, c.z + t, 5); }
    for (const hy of [1, 2.3]) for (const s of [-1, 1]) { slab(0x8a8d96, e * 2, 0.06, 0.06, c.x, y + hy, c.z + s * e); slab(0x8a8d96, 0.06, 0.06, e * 2, c.x + s * e, y + hy, c.z); }
    for (const s of [-1, 1]) { collide(c.x, c.z + s * e, e * 2, 0.4, 2.4); collide(c.x + s * e, c.z + s * (e + 6) / 2, 0.4, e - 6, 2.4); }
    collide(c.x - e, c.z - (e + 6) / 2, 0.4, e - 6, 2.4);
    for (let n = 0; n < 4 + Math.floor(rand() * 3); n++) { // shipping containers, some stacked
      const cx = c.x - 18 + n * 9, cz = c.z + 14 + (n % 2) * 6, hex = pick([0xd8342c, 0x2f56c8, 0x1f6b4a, 0xf2c230, 0x8d8a8e]);
      slab(hex, 6, 2.6, 2.5, cx, y, cz, M.siding, 0.6); collide(cx, cz, 6, 2.5, 2.8);
      if (rand() < 0.4) slab(pick([0xd8342c, 0x2f56c8, 0x1f6b4a]), 6, 2.6, 2.5, cx, y + 2.6, cz, M.siding, 0.6);
    }
    for (const [px, pz] of [[20, 2], [23, 2], [20, 5]]) { slab(0xc79a6a, 2.4, 1.6, 2.4, c.x + px, y, c.z + pz, M.wood, 1); collide(c.x + px, c.z + pz, 2.4, 2.4, 1.8); }
    if (LA) { // the basin's oil: a storage tank and a pumpjack nodding at nothing
      const tx = c.x + 18, tz = c.z - 19;
      put(M.siding, new THREE.CylinderGeometry(5, 5, 7, 20).translate(tx, y + 3.5, tz), 0xe9e2d2); put(M.plain, new THREE.ConeGeometry(5.2, 1, 20).translate(tx, y + 7.5, tz), 0xb9b3ba); collide(tx, tz, 9, 9, 8);
      const jx = c.x + 20, jz = c.z - 4;
      for (const s of [-1, 1]) put(M.plain, new THREE.BoxGeometry(0.25, 4.2, 0.25).rotateZ(s * 0.22).translate(jx + s * 0.5, y + 2, jz), 0x23232b);
      put(M.plain, new THREE.BoxGeometry(6.4, 0.4, 0.4).rotateZ(0.2).translate(jx, y + 4.1, jz), 0x8a1c1c); put(M.plain, new THREE.BoxGeometry(0.9, 1.8, 0.6).translate(jx + 3.1, y + 4.1, jz), 0x8a1c1c);
      slab(0x23232b, 1.6, 1.2, 1.2, jx - 3, y, jz); post(0x8a8d96, 0.05, 3.6, jx + 3.2, y, jz, 5); collide(jx, jz, 7, 1.6, 4);
    } else if (rand() < 0.5) { // a water tower on steel legs
      const tx = c.x + 20, tz = c.z - 20;
      for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) post(0x8a8d96, 0.08, 10, tx + lx, y, tz + lz, 5);
      put(M.siding, new THREE.CylinderGeometry(2.4, 2.4, 3.6, 14).translate(tx, y + 11.8, tz), 0xe9e2d2);
      put(M.plain, new THREE.ConeGeometry(2.6, 1.2, 14).translate(tx, y + 14.2, tz), 0x8a1c1c);
      collide(tx, tz, 4, 4, 15);
    }
    for (const s of [-1, 1]) { post(STEEL, 0.1, 8, c.x + s * 23, y, c.z + 10); slab(0xffe2a6, 0.8, 0.1, 0.5, c.x + s * 22.4, y + 8, c.z + 10, M.glow); halo(c.x + s * 22.4, y + 7.9, c.z + 10, 0xffb860, 4); }
    parkedSpots.push({ x: c.x + 12, z: c.z + 20, h: Math.PI / 2, kind: 'truck' }, { x: c.x - 8, z: c.z + 22, h: 0, kind: 'pickup' });
    places.yard ??= { gate: { x: c.x + 34, z: c.z, h: 0 }, shed: { x: sx + 17, z: sz + sd / 2 + 1.6 } };
  }

  // ----- A gas station on the north-east lot: a canopy over two islands of pumps, a kiosk, a tall price sign -----
  function buildGas(c) {
    const x = c.x + 13, z = c.z - 13, y = CURB, RED = 0xd8342c, WHITE = 0xf4f4f0;
    flat(M.asphalt, 0xffffff, 28, 28, x, 0.03, z, 5);
    lowGround.push({ x, z, half: 14 });
    for (const [px, pz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) post(WHITE, 0.25, 5, x + px, 0, z + pz, 8);
    slab(WHITE, 20, 0.7, 14, x, 5, z); slab(RED, 20.2, 0.3, 14.2, x, 5.2, z);
    for (const [px, pz] of [[-4, 0], [4, 0]]) slab(0xffe2a6, 1.6, 0.05, 1.6, x + px, 4.98, z + pz, M.glow);
    for (const px of [-5, 5]) { // islands of pumps
      slab(0xc9cbd2, 1.4, 0.18, 8, x + px, 0, z);
      for (const pz of [-2.2, 2.2]) {
        slab(WHITE, 0.9, 1.7, 0.6, x + px, 0.18, z + pz); slab(RED, 0.92, 0.5, 0.62, x + px, 1.3, z + pz); slab(0x1c1c22, 0.5, 0.4, 0.05, x + px, 0.6, z + pz + 0.32, M.plain);
        collide(x + px, z + pz, 1, 0.7, 2);
      }
    }
    // The kiosk at the back, with a door that opens.
    slab(WHITE, 10, 3.6, 6, x + 7, 0.03, z - 10, M.gravel, 3); collide(x + 7, z - 10, 10, 6, 3.6);
    slab(RED, 10.4, 0.3, 6.4, x + 7, 3.6, z - 10); slab(0x1c1c22, 8, 2, 0.1, x + 7, 0.6, z - 6.95); slab(0xffe8c0, 7.6, 1.6, 0.04, x + 7, 0.8, z - 6.9, M.glow);
    slab(0x20202a, 1.4, 2.6, 0.12, x + 3.4, 0.03, z - 6.9);
    shopDoors.push({ shop: 'KIOSK', outside: { x: x + 3.4, z: z - 5.4, h: 0 } });
    const name = pick(['SUNSHINE GAS', 'VICE PETROL', 'GULF STAR', 'RED ROOSTER']);
    sign(name, x + 7, 2.9, z - 6.92, 0, { w: 7, h: 1, color: '#f4f4f0', bg: '#d8342c', size: 0.8, glow: false });
    // The pylon at the kerb.
    const px = x + 12, pz = z + 12;
    post(0x1c1c22, 0.2, 9, px, 0, pz, 8); collide(px, pz, 0.5, 0.5, 9, true);
    sign(name, px, 9.6, pz + 0.3, 0, { w: 4.6, h: 1.6, color: '#ffe066', bg: '#d8342c', size: 0.7, also: [[px, 9.6, pz - 0.3, Math.PI]] });
    sign(['REGULAR  1.19', 'PREMIUM  1.39'], px, 7.7, pz + 0.3, 0, { w: 4.2, h: 1.6, color: '#1c1c22', bg: '#f4f4f0', size: 0.6, glow: false, also: [[px, 7.7, pz - 0.3, Math.PI]] });
    slab(0x1c1c22, 4.8, 3.8, 0.4, px, 6.8, pz); halo(px, 9.5, pz + 0.8, 0xffe066, 10);
    slab(0x2f5a3f, 2.6, 1.5, 1.6, x - 11, 0.03, z - 11); slab(0x244a33, 2.7, 0.1, 1.7, x - 11, 1.53, z - 11); collide(x - 11, z - 11, 2.6, 1.6, 1.6);
    parkedSpots.push({ x: x - 5, z: z + 9, h: Math.PI / 2, kind: pick(['sedan', 'pickup', 'van']) });
    places.gas ??= { pumps: { x, z }, kerb: { x: x + 4, z: c.z + 34, h: Math.PI / 2 } };
  }

  // ----- Sunshine Autos: a dealership forecourt under strings of bunting, with a glass showroom -----
  function buildCarLot(c) {
    const y = CURB, BLUE = 0x2f56c8, YELLOW = 0xf2c230;
    flat(M.asphalt, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, 0.03, c.z, 5);
    lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 - 3 });
    const sx = c.x, sz = c.z - 18;
    slab(0xf4f4f0, 30, 5, 16, sx, 0.03, sz, M.gravel, 3); collide(sx, sz, 30, 16, 5);
    slab(0x1c1c22, 28, 3.4, 0.1, sx, 0.4, sz + 8.02); slab(0xffe8c0, 27, 3, 0.05, sx, 0.6, sz + 8.05, M.glow); // the showroom glass
    slab(BLUE, 30.4, 0.6, 16.4, sx, 5, sz); slab(YELLOW, 30.6, 0.2, 16.6, sx, 5.6, sz);
    sign('SUNSHINE AUTOS', sx, 7, sz + 8.1, 0, { w: 16, h: 2.4, color: '#ffe066', bg: '#2f56c8', size: 0.78 });
    halo(sx, 7, sz + 9, 0xffe066, 10);
    slab(0x20202a, 1.6, 2.8, 0.14, sx - 11, 0.03, sz + 8.05);
    shopDoors.push({ shop: 'SHOWROOM', outside: { x: sx - 11, z: sz + 9.6, h: 0 } });
    for (let k = -4; k <= 4; k++) { // bays, bunting over them
      flat(M.paint, 0xe9e6ee, 0.14, 5.6, c.x + k * 5.5, 0.07, c.z + 6);
      if (k < 4) parkedSpots.push({ x: c.x + k * 5.5 + 2.75, z: c.z + 6, h: 0, kind: pick(['sedan', 'coupe', 'coupe', 'suv', 'pickup']), lot: true });
    }
    for (const s of [-1, 1]) { post(STEEL, 0.08, 6, c.x + s * 26, 0, c.z + 12, 5); post(STEEL, 0.08, 6, c.x + s * 26, 0, c.z - 4, 5); }
    for (const pz of [-4, 12]) for (let n = -12; n <= 12; n++) {
      put(M.plain, new THREE.ConeGeometry(0.25, 0.7, 3).rotateX(Math.PI).translate(c.x + n * 2.1, 5.6 - Math.abs(n) * 0.02 * 2, c.z + pz), [0xd8342c, 0xf2c230, 0x2f56c8, 0xf4f4f0][(n + 12) % 4]);
    }
    for (const pz of [-4, 12]) slab(0xf4f4f0, 52, 0.03, 0.03, c.x, 6, c.z + pz);
    for (const [px, pz] of [[-24, 24], [24, 24]]) palms.push({ x: c.x + px, z: c.z + pz });
    places.carlot ??= { lot: { x: c.x, z: c.z + 12 }, kerb: { x: c.x, z: c.z + 34, h: 0 } };
    slab(0xf4f4f0, 0.4, 6, 0.4, c.x - 24, 0, c.z + 18); sign(['LOW', 'DOWN', 'PAYMENTS'], c.x - 24, 7.2, c.z + 18.21, 0, { w: 2.4, h: 2.4, color: '#1c1c22', bg: '#ffe066', size: 0.6, glow: false, also: [[c.x - 24, 7.2, c.z + 17.79, Math.PI]] });
  }

  // ----- A church on a lawn: white clapboard, a steeple with a cross, steps up to red doors -----
  function buildChurch(c) {
    const y = CURB, WHITE = 0xf4f2ee, x = c.x, z = c.z - 6;
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z, 6);
    slab(WHITE, 16, 7, 28, x, y, z, M.siding, 1); collide(x, z, 16, 28, y + 7);
    gable(0x55525a, 17, 4.5, 29, x, y + 7, z, Math.PI / 2);
    for (const s of [-1, 1]) for (let n = 0; n < 4; n++) {
      windowAt(x + s * 8, y + 2.2, z - 9 + n * 6, 1.4, 3.4, s, 0, true);
      put(M.glow, new THREE.CircleGeometry(0.7, 12).rotateY(s * Math.PI / 2).translate(x + s * 8.05, y + 5.3, z - 9 + n * 6), 0xff8a5c); // rose panes
    }
    const front = z + 14;
    slab(WHITE, 5, 15, 5, x, y, z - 10, M.siding, 1); put(M.plain, new THREE.ConeGeometry(3.6, 5, 4).rotateY(Math.PI / 4).translate(x, y + 17.5, z - 10), 0x55525a);
    slab(0xd9a520, 0.16, 1.6, 0.16, x, y + 20, z - 10); slab(0xd9a520, 0.8, 0.16, 0.16, x, y + 21.1, z - 10);
    collide(x, z - 10, 5, 5, 22);
    for (let n = 0; n < 4; n++) slab(0xd8d0c4, 8 - n * 0.6, 0.2, 1, x, y + n * 0.2, front + 2.5 - n * 0.9);
    for (const s of [-1, 1]) { slab(0x8a1c1c, 1.3, 3.2, 0.14, x + s * 0.7, y + 0.8, front + 0.05); slab(0xd9a520, 0.08, 0.08, 0.1, x + s * 0.2, y + 2.3, front + 0.14); }
    put(M.glow, new THREE.CircleGeometry(1.4, 16).translate(x, y + 5.6, front + 0.06), 0xffb86a); // the rose window
    for (const s of [-1, 1]) post(WHITE, 0.2, 5, x + s * 3.8, y + 0.8, front + 2.2, 10);
    slab(WHITE, 9, 0.4, 3.2, x, y + 5.8, front + 1.4); gable(0x55525a, 9.4, 2, 3.4, x, y + 6.2, front + 1.4, 0, M.plain);
    shopDoors.push({ shop: 'CHURCH', outside: { x, z: front + 1.4, h: 0 } });
    const name = pick(['ST. ANTHONY', 'OUR LADY OF THE SEA', 'ST. ROSALIE', 'SACRED HEART']);
    slab(0xd8d0c4, 0.4, 1.4, 3.6, x + 11, y, c.z + 20, M.gravel, 2);
    sign([name, 'MASS SUN 8 · 10 · 12'], x + 11.22, y + 0.8, c.z + 20, Math.PI / 2, { w: 3.4, h: 1.2, color: '#1f3a2c', bg: '#f3efe6', size: 0.6, glow: false });
    flat(M.paint, 0xd8d0c4, 3, 14, x, y + 0.09, c.z + 27);
    for (const [px, pz] of [[-20, 20], [20, 22], [-22, -10], [22, -8]]) palms.push({ x: c.x + px, z: c.z + pz });
    for (const [bx, bz] of [[-14, 8], [14, 8]]) bench(c.x + bx, c.z + bz, Math.PI);
    // The churchyard: rows of headstones behind, a path between them, one grave freshly dug.
    const gy = c.z - 26;
    for (let r = 0; r < 2; r++) for (let n = 0; n < 9; n++) {
      const sx = c.x - 24 + n * 3 + (n > 3 ? 6 : 0), sz = gy + 1 + r * 3.2;
      if (n === 4) continue;
      const kind = (n + r) % 3;
      if (kind === 0) { slab(0xd8d0c4, 0.9, 1.1, 0.16, sx, y, sz, M.gravel, 1); ball(0xd8d0c4, 0.46, sx, y + 1.1, sz); }
      else if (kind === 1) { slab(0xc9c2b8, 1.1, 0.3, 0.5, sx, y, sz, M.gravel, 1); slab(0xd8d0c4, 0.14, 1.4, 0.14, sx, y + 0.3, sz); slab(0xd8d0c4, 0.6, 0.14, 0.14, sx, y + 1.3, sz); }
      else slab(0xb9b3ba, 0.7, 0.8, 0.14, sx, y, sz, M.gravel, 1);
      collide(sx, sz, 1, 0.5, 1.2);
    }
    flat(M.paint, 0xd8d0c4, 2, 10, c.x - 10.5, y + 0.09, gy + 2.5);
    const grave = { x: c.x + 14, z: gy + 1.6 };
    flat(M.paint, 0x5a3d2b, 1.2, 2.4, grave.x, y + 0.1, grave.z); slab(0x5a3d2b, 2.2, 0.5, 1, grave.x + 1.9, y, grave.z, M.gravel, 1); // the hole and the heap beside it
    for (let n = 0; n < 6; n++) ball([0x2f7d46, 0xd8342c, 0x2f7d46][n % 3], 0.2, grave.x - 1.2 + (n % 3) * 0.5, y + 0.22, grave.z - 1.6 + Math.floor(n / 3) * 0.5); // wreaths
    slab(0x2f7d46, BLOCK - 5, 1, 0.8, c.x, y, c.z - 27.4, M.grass, 3); collide(c.x, c.z - 27.4, BLOCK - 5, 0.8, 1.2);
    places.church ??= { door: { x, z: front + 1.4 }, kerb: { x: x + 4, z: c.z + 34, h: Math.PI / 2 }, grave, path: { x: c.x - 10.5, z: gy + 7 }, back: { x: c.x + 12, z: c.z - 22 }, lawn: { x: c.x - 12, z: c.z + 16 }, street: { x: c.x + 20, z: c.z + 34 } };
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
    places.grove = { kerb: { x: c.x + 34, z: c.z + 6, h: 0 }, gate: { x: c.x + 26, z: c.z + 6 }, fountain: { x: c.x + 4.6, z: c.z + 6 }, gazebo: { x: gx + 1.5, z: gz - 5.2 }, door: { x: c.x, z: c.z - 9.4, h: 0 } };
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
    flat(M.tarmac, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y + 0.015, c.z, 5);
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
    places.kolar = { gate: { x: c.x + 34, z: c.z, h: 0 }, bins, door: { x: c.x - 12, z: c.z - 12.9, h: 0 } };
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
    sign(LA ? ['ST. MARY', 'MEDICAL CENTER'] : ['VICE GENERAL', 'HOSPITAL'], c.x, y + 6.4, c.z - 2.8, 0, { w: 12, h: 2.6, color: '#2f56c8', bg: '#f4f4f0', size: 0.72, glow: false });
    slab(0xd8342c, 2.6, 0.6, 0.1, c.x - 18, y + 7.8, c.z - 2.9); slab(0xf4f4f0, 0.6, 2.6, 0.1, c.x - 18, y + 6.8, c.z - 2.9); // the red cross
    slab(0xd8342c, 0.6, 2.6, 0.12, c.x - 18, y + 6.8, c.z - 2.92); slab(0xf4f4f0, 2.6, 0.6, 0.14, c.x - 18, y + 7.8, c.z - 2.94);
    flat(M.tarmac, 0xffffff, 40, 20, c.x, y + 0.015, c.z + 16, 5);
    for (let k = -5; k <= 5; k++) flat(M.paint, 0xe9e6ee, 0.14, 5, c.x + k * 3.2, y + 0.1, c.z + 24);
    sign('EMERGENCY', c.x + 14, y + 3.9, c.z + 7.1, 0, { w: 5, h: 1, color: '#f4f4f0', bg: '#d8342c', size: 0.8, glow: false });
    if (LA) parkedSpots.push({ x: c.x - 14, z: c.z + 10, h: Math.PI / 2, kind: 'ambulance' }); // in Los Angeles the ambulance can be driven away
    else { new Car(scene, c.x - 14, c.z + 10, Math.PI / 2, 0xf4f4f0, 'suv'); collide(c.x - 14, c.z + 10, 5.2, 2.2, 2); }
    for (const [px, pz] of [[-24, 20], [24, 20], [-24, 4], [24, 4]]) palms.push({ x: c.x + px, z: c.z + pz });
    places.hospital = { door: { x: c.x, z: c.z + 2 }, kerb: { x: c.x, z: c.z + 34, h: 0 }, bay: { x: c.x - 14, z: c.z + 10 } };
  }

  // ----- The Teittleman motel (south-east lot of its block): two floors of rooms round a forecourt -----
  function buildMotel(c) {
    const x = c.x + 13, z = c.z + 13, y = CURB, PINK = 0xffd3a1, TEAL = 0x1f9c8f;
    flat(M.tarmac, 0xffffff, 26, 24, x, y + 0.015, z, 5);
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
    places.motel = { kerb: { x: x + 4, z: c.z + 34, h: Math.PI / 2 }, office: { x: x - 4.6, z: z + 3 }, court: { x: x + 1, z: z - 1 }, officeDoor: { x: x - 4.4, z: z + 3, h: Math.PI / 2 } };
  }

  // ----- Comley Trucking: a warehouse with loading docks over a yard -----
  function buildComley(c) {
    const y = CURB, BLUE = 0x9fb0c4;
    flat(M.tarmac, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y + 0.015, c.z, 5);
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
    slab(0x3a2418, 0.16, 2.4, 1.2, c.x + 23.02, y, c.z - 14); slab(0xffe2a6, 0.3, 0.12, 0.4, c.x + 23.2, y + 2.8, c.z - 14, M.glow); // the side door
    places.comley = { gate: { x: c.x, z: c.z + 34 }, dock: { x: c.x, z: c.z + 1 }, door: { x: c.x + 24.6, z: c.z - 14, h: Math.PI / 2 } };
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
    flat(M.tarmac, 0xffffff, BLOCK - 8, 28, c.x, y + 0.015, c.z + 13, 5);
    for (let k = -7; k <= 7; k++) flat(M.paint, 0xe9e6ee, 0.14, 5.2, c.x + k * 3, y + 0.09, c.z + 22);
    post(STEEL, 0.09, 3.2, c.x + 20, y, c.z + 6); slab(0xf4f4f4, 1.8, 1.1, 0.06, c.x + 20, y + 2.7, c.z + 6.5);
    put(M.plain, new THREE.TorusGeometry(0.24, 0.025, 6, 14).rotateX(Math.PI / 2).translate(c.x + 20, y + 2.9, c.z + 6.85), 0xff8a5c);
    for (const [px, pz] of [[-24, -4], [24, -4]]) palms.push({ x: c.x + px, z: c.z + pz });
    places.school = { lot: { x: c.x + 3, z: c.z + 14 }, gate: { x: c.x + 3, z: c.z + 34 }, door: { x: c.x, z: c.z - 8.4, h: 0 } };
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

  // ================= Los Angeles (Heat) =================

  // ----- Neil McCauley's house on the beach: a white box with a wall of glass to the sea, and nothing in it -----
  function buildNeil(c) {
    const y = CURB, WHITE = 0xf1f1ee, hx = c.x + 8, hz = c.z - 4;
    flat(M.paint, 0xd8d0c4, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z);
    slab(WHITE, 22, 5.2, 16, hx, y, hz, M.gravel, 4); collide(hx, hz, 22, 16, y + 5.2);
    slab(0xdfe5ea, 23, 0.4, 17, hx, y + 5.2, hz); flat(M.gravel, 0x8d868c, 21, 15, hx, y + 5.62, hz, 5);
    windowAt(hx + 11, y + 0.7, hz, 13, 3.6, 1, 0, true);                                         // the glass, toward the water
    windowAt(hx + 3, y + 0.7, hz + 8, 12, 3.6, 0, 1, false); windowAt(hx - 5, y + 2.6, hz - 8, 6, 1.4, 0, -1, false);
    slab(0x16161c, 0.16, 2.9, 1.5, hx - 11.04, y, hz + 3); slab(0xc9cbd2, 0.2, 0.08, 0.5, hx - 11.1, y + 1.2, hz + 3.5);   // the door, on the street side
    slab(0xd9b48a, 6, 0.3, 16, hx + 14, y, hz, M.wood, 2);                                        // the deck
    for (const s of [-1, 1]) slab(0xc9cbd2, 6, 0.05, 0.05, hx + 14, y + 1.2, hz + s * 8); slab(0xc9cbd2, 0.05, 0.05, 16, hx + 17, y + 1.2, hz);
    slab(WHITE, 9, 3.6, 8, c.x - 18, y, c.z - 20, M.gravel, 4); collide(c.x - 18, c.z - 20, 9, 8, y + 3.6); slab(0xdfe5ea, 9.6, 0.3, 8.6, c.x - 18, y + 3.6, c.z - 20);
    for (let n = 1; n < 4; n++) slab(0xcfc8ba, 7, 0.05, 0.14, c.x - 18, y + n * 0.8, c.z - 15.95); slab(0xe9e2d2, 7, 3.1, 0.12, c.x - 18, y, c.z - 15.96);
    flat(M.paint, 0x9a94a2, 8, 44, c.x - 18, y + 0.09, c.z + 8);
    for (const [px, pz] of [[-26, 24], [24, 22], [-8, -24], [26, -24], [0, 20]]) palms.push({ x: c.x + px, z: c.z + pz });
    shopDoors.push({ shop: 'NEIL', outside: { x: hx - 12.6, z: hz + 3, h: -Math.PI / 2 } });
    places.home = {
      spawn: { x: hx - 14, z: hz + 3 }, door: { x: hx - 12.6, z: hz + 3 }, wake: { x: c.x - 15.2, z: c.z + 12 }, car: { x: c.x - 18, z: c.z + 14, h: 0 },
      drive: { x: c.x - 18, z: c.z + 20 }, road: { x: c.x - 18, z: c.z + 34 }, deck: { x: hx + 14, z: hz }, ducks: [],
    };
  }

  // ----- Far East Pacific Bank: a tower over a colonnade, downtown -----
  function buildBank(c) {
    const y = CURB, front = c.z + 11;
    building(c.x, c.z - 6, 40, 34, 72, { style: 'office', tint: 0xcfe8ff, fx: 0, fz: 0 });
    slab(0xe9e2d2, 22, 5.4, 1, c.x, y, front + 0.4, M.gravel, 3);
    slab(0x1a242c, 6, 3.6, 0.2, c.x, y, front + 0.95); slab(0xc9cbd2, 0.08, 3.6, 0.24, c.x, y, front + 0.97);
    for (const s of [-1, 1]) for (const k of [3.8, 8.6]) { post(0xe9e2d2, 0.5, 6, c.x + s * k, y, front + 3.2, 12); collide(c.x + s * k, front + 3.2, 1, 1, 6, true); }
    slab(0xe9e2d2, 22, 0.7, 5.6, c.x, y + 6, front + 2.2);
    sign(['FAR EAST PACIFIC', 'BANK'], c.x, y + 8, front + 5.02, 0, { w: 14, h: 2.4, color: '#d9a520', bg: '#16161c', size: 0.66, glow: false });
    for (const s of [-1, 1]) { slab(0xb9a58a, 2, 0.8, 2, c.x + s * 13, y, front + 4, M.gravel, 2); ball(0x2f7d46, 1.1, c.x + s * 13, y + 1.6, front + 4); palms.push({ x: c.x + s * 22, z: c.z + 22 }); }
    shopDoors.push({ shop: 'BANK', outside: { x: c.x, z: front + 2.6, h: 0 } });
    places.bank = { door: { x: c.x, z: front + 2.6 }, kerb: { x: c.x + 6, z: c.z + 34, h: Math.PI / 2 }, plaza: { x: c.x, z: front + 9 } };
  }

  // ----- The Sundown Drive-In: a screen, rows of speaker posts, a snack bar, a marquee -----
  function buildDriveIn(c) {
    const y = 0.03, e = 27;
    flat(M.asphalt, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y, c.z, 5); lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 - 3 });
    slab(0xf4f4f0, 34, 14, 0.8, c.x, 4, c.z - 25); for (const s of [-1, 0, 1]) slab(0x55525a, 1, 4, 1, c.x + s * 14, 0, c.z - 25);
    put(M.glow, new THREE.PlaneGeometry(32, 12).translate(c.x, 11, c.z - 24.58), 0x8fa6c4);        // the picture, washed out by the dusk
    collide(c.x, c.z - 25, 34, 1.4, 18);
    for (const rz of [-13, -5, 3]) for (let k = -5; k <= 5; k++) {
      post(0x8a8d96, 0.05, 1.1, c.x + k * 4.6, y, c.z + rz, 5); slab(0x1c1c22, 0.22, 0.26, 0.12, c.x + k * 4.6, y + 1.1, c.z + rz);
      collide(c.x + k * 4.6, c.z + rz, 0.3, 0.3, 1.2, true);
    }
    slab(0xd9917a, 10, 3.4, 6, c.x + 6, y, c.z + 16, M.gravel, 3); collide(c.x + 6, c.z + 16, 10, 6, 3.6); slab(0x55525a, 10.6, 0.3, 6.6, c.x + 6, y + 3.4, c.z + 16);
    sign('SNACK BAR', c.x + 6, y + 2.6, c.z + 12.9, Math.PI, { w: 5, h: 0.9, color: '#ffe066', bg: '#8a1c1c', size: 0.8 });
    slab(0x1c1c22, 1.2, 1, 0.1, c.x + 6, y + 2.2, c.z + 12.98, M.glow);                           // the projector's port
    for (const s of [-1, 1]) post(0x1c1c22, 0.16, 9, c.x - 20 + s * 2.6, y, c.z + 26, 8);
    slab(0x14080f, 7, 3, 0.5, c.x - 20, 6.4, c.z + 26);
    sign(['SUNDOWN DRIVE-IN', 'TONITE · DOUBLE FEATURE'], c.x - 20, 7.9, c.z + 26.27, 0, { w: 6.6, h: 2.6, color: '#49e0d0', bg: '#14080f', size: 0.62, also: [[c.x - 20, 7.9, c.z + 25.73, Math.PI]] });
    halo(c.x - 20, 8, c.z + 27, 0x49e0d0, 10);
    for (let t = -e; t <= e; t += 4.5) for (const s of [-1, 1]) post(0x8a8d96, 0.06, 2.2, c.x + s * e, y, c.z + t, 5);
    for (const s of [-1, 1]) { slab(0x8a8d96, 0.06, 0.06, e * 2, c.x + s * e, y + 2.1, c.z); collide(c.x + s * e, c.z, 0.4, e * 2, 2.4); }
    lamp(c.x, 6, c.z + 2, 0xbfd8ff, 60, 40);
    places.drivein = { gate: { x: c.x - 8, z: c.z + 34, h: Math.PI / 2 }, lot: { x: c.x - 6, z: c.z + 6 }, screen: { x: c.x, z: c.z - 19 }, booth: { x: c.x + 6, z: c.z + 11.5 }, west: { x: c.x - 20, z: c.z - 8 }, east: { x: c.x + 20, z: c.z - 10 }, mid: { x: c.x + 2, z: c.z - 6 } };
  }

  // ----- A roadside diner on the south-west lot, chrome and neon -----
  function buildRoadDiner(c, name, key) {
    const x = c.x - 13, z = c.z + 13, y = CURB, front = z + 7;
    slab(0xdfe5ea, 18, 4.6, 14, x, y, z, M.siding, 0.8); collide(x, z, 18, 14, y + 4.6);
    slab(0xd8342c, 18.4, 0.5, 14.4, x, y + 3.6, z); slab(0xc9cbd2, 18.6, 0.3, 14.6, x, y + 4.6, z); flat(M.gravel, 0x8d868c, 17.4, 13.4, x, y + 4.92, z, 5);
    for (const wx of [-5.6, 5.6]) windowAt(x + wx, y + 1, front, 5.6, 2, 0, 1, true);
    slab(0x20202a, 1.8, 2.8, 0.2, x, y, front + 0.05); slab(0xf0bf78, 1.1, 1.5, 0.06, x, y + 1.2, front + 0.16, M.glow);
    slab(0x14080f, 9, 2.4, 0.5, x, y + 5.2, front - 2);
    sign(name, x, y + 6.4, front - 1.73, 0, { w: 8.6, h: 2.2, color: '#ff5fd2', bg: '#14080f', font: '"Mr Dafoe", cursive', size: 0.8 });
    halo(x, y + 6.4, front - 1, 0xff5fd2, 10);
    shopDoors.push({ shop: 'DINER', outside: { x, z: front + 1.6, h: 0 } });
    places[key] = { door: { x, z: front + 1.6, h: 0 }, kerb: { x, z: c.z + 34, h: Math.PI / 2 }, lot: { x: x + 12, z: front + 3 } };
  }

  // ----- The truck stop where a crew can sit an hour without being looked at -----
  function buildTruckStop(c) {
    const y = 0.03;
    flat(M.asphalt, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y, c.z, 5); lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 - 3 });
    const x = c.x - 8, z = c.z - 18, front = z + 6;
    slab(0xf2e6d0, 28, 4.8, 12, x, y, z, M.gravel, 3); collide(x, z, 28, 12, 5);
    slab(0x1f6b4a, 28.4, 0.9, 12.4, x, y + 3.8, z); slab(0x55525a, 28.6, 0.3, 12.6, x, y + 4.8, z);
    for (const wx of [-9, -3, 3, 9]) if (wx !== 3) windowAt(x + wx, 1, front, 4.6, 2, 0, 1, true);
    slab(0x20202a, 1.8, 2.8, 0.2, x + 3, y, front + 0.05); slab(0xf0bf78, 1.1, 1.5, 0.06, x + 3, 1.2, front + 0.16, M.glow);
    sign(['ROUTE 10 DINER', 'TRUCKERS WELCOME · OPEN 24 HRS'], x, 6.4, front + 0.2, 0, { w: 14, h: 2.4, color: '#ffe066', bg: '#1f3a2c', size: 0.62 });
    halo(x, 6.4, front + 1, 0xffe066, 10);
    for (const [px, pz] of [[14, -8], [22, -8], [14, 2], [22, 2]]) post(0xf4f4f0, 0.25, 5.4, c.x + px, 0, c.z + pz, 8);   // the diesel canopy
    slab(0xf4f4f0, 12, 0.6, 14, c.x + 18, 5.4, c.z - 3); slab(0x1f6b4a, 12.2, 0.25, 14.2, c.x + 18, 5.6, c.z - 3);
    for (const pz of [-6, 0]) { slab(0xf4f4f0, 0.9, 1.7, 0.6, c.x + 18, 0.18, c.z + pz); slab(0x1f6b4a, 0.92, 0.5, 0.62, c.x + 18, 1.3, c.z + pz); collide(c.x + 18, c.z + pz, 1, 0.7, 2); }
    for (let k = -4; k <= 1; k++) flat(M.paint, 0xe9e6ee, 0.14, 9, c.x + k * 5 - 2, 0.07, c.z + 16);
    parkedSpots.push({ x: c.x - 19.5, z: c.z + 16, h: 0, kind: 'truck' }, { x: c.x - 9.5, z: c.z + 16, h: 0, kind: 'truck' }, { x: c.x + 5.5, z: c.z + 16, h: 0, kind: 'pickup' });
    lamp(x + 3, 4, front + 5, 0xffe2a6, 40, 22);
    shopDoors.push({ shop: 'DINER', outside: { x: x + 3, z: front + 1.6, h: 0 } });
    places.truckstop = { door: { x: x + 3, z: front + 1.6, h: 0 }, kerb: { x: c.x + 34, z: c.z + 8, h: 0 }, lot: { x: c.x - 4, z: c.z + 4 }, back: { x: c.x + 2, z: c.z + 22 } };
  }

  // ----- Major Crimes: a brick station house on the north-west lot -----
  function buildPrecinct(c) {
    const x = c.x - 13, z = c.z - 13, y = CURB, front = z - 9, top = y + FLOOR * 3;
    slab(0xb5523b, 20, FLOOR * 3, 18, x, y, z, M.brick, 2); collide(x, z, 20, 18, top); roofKit(x, z, 20, 18, top, 0xb5523b, false);
    for (let f = 0; f < 3; f++) for (const wx of [-7, -3.5, 3.5, 7]) windowAt(x + wx, y + 1.2 + f * FLOOR, front, 1.8, 1.8, 0, -1, (f + wx) % 2 === 0);
    slab(0xe9e2d2, 6, 4, 1, x, y, front - 0.3, M.gravel, 3); slab(0x1a242c, 2.6, 3, 0.2, x, y, front - 0.85);
    sign(['LOS ANGELES POLICE', 'MAJOR CRIMES'], x, y + 5, front - 0.82, Math.PI, { w: 9, h: 1.6, color: '#f4f4f0', bg: '#1c2740', size: 0.66, glow: false });
    for (const s of [-1, 1]) { post(0x2f56c8, 0.2, 0.3, x + s * 4, y + 3, front - 0.9, 8); ball(0x9fd0f5, 0.28, x + s * 4, y + 3.5, front - 0.9, M.glow); }
    post(0xc9cbd2, 0.07, 9, x + 8.5, y, front - 2); [0xd8342c, 0xf4f4f4, 0x2f56c8].forEach((hex, n) => slab(hex, 2.2, 0.42, 0.04, x + 9.65, y + 8.5 - n * 0.42, front - 2));
    parkedSpots.push({ x: x - 4, z: c.z - 31.6, h: Math.PI / 2, kind: 'police' }, { x: x + 4, z: c.z - 31.6, h: Math.PI / 2, kind: 'police' });
    shopDoors.push({ shop: 'OFFICE', outside: { x, z: front - 2.4, h: Math.PI } });
    places.precinct = { door: { x, z: front - 2.4, h: Math.PI }, kerb: { x: x + 10, z: c.z - 34, h: Math.PI / 2 } };
  }

  // ----- The precious metals depository: a concrete box with no windows, a fence, a ladder to the roof -----
  function buildDepository(c) {
    const y = CURB, e = 27;
    flat(M.tarmac, 0xffffff, BLOCK - 6, BLOCK - 6, c.x, y + 0.015, c.z, 5);
    slab(0xb9b3ba, 38, 9, 26, c.x, y, c.z - 6, M.gravel, 4); collide(c.x, c.z - 6, 38, 26, y + 9); slab(0x8d868c, 38.6, 0.5, 26.6, c.x, y + 9, c.z - 6);
    slab(0x3a3a44, 6, 4.4, 0.2, c.x - 8, y, c.z + 7.05); for (let k = 0; k < 6; k++) slab(0x5a5a66, 6, 0.05, 0.24, c.x - 8, y + 0.6 + k * 0.65, c.z + 7.06);
    slab(0x3a2418, 1.2, 2.4, 0.16, c.x + 8, y, c.z + 7.04);
    for (let n = 0; n < 12; n++) slab(0x8a8d96, 0.6, 0.05, 0.05, c.x + 19.3, y + 0.5 + n * 0.7, c.z + 2); for (const s of [-1, 1]) post(0x8a8d96, 0.03, 9, c.x + 19.3 + s * 0.3, y, c.z + 2, 4);
    sign(['PRECIOUS METALS', 'DEPOSITORY · NO PUBLIC ACCESS'], c.x + 4, y + 7, c.z + 7.1, 0, { w: 14, h: 2, color: '#f4f4f0', bg: '#2a2a30', size: 0.6, glow: false });
    for (let t = -e; t <= e; t += 4) for (const s of [-1, 1]) { post(0x8a8d96, 0.06, 2.6, c.x + t, y, c.z + s * e, 5); if (Math.abs(t) > 5 || s < 0) post(0x8a8d96, 0.06, 2.6, c.x + s * e, y, c.z + t, 5); }
    for (const s of [-1, 1]) { slab(0x8a8d96, 0.06, 0.06, e * 2, c.x + s * e, y + 2.5, c.z); collide(c.x + s * e, c.z, 0.4, e * 2, 2.6); }
    slab(0x8a8d96, e * 2, 0.06, 0.06, c.x, y + 2.5, c.z - e); collide(c.x, c.z - e, e * 2, 0.4, 2.6);
    for (const s of [-1, 1]) { slab(0x8a8d96, e - 6, 0.06, 0.06, c.x + s * (e + 6) / 2, y + 2.5, c.z + e); collide(c.x + s * (e + 6) / 2, c.z + e, e - 6, 0.4, 2.6); }
    lamp(c.x, y + 7, c.z + 12, 0xcfe0ff, 50, 30);
    places.depository = { gate: { x: c.x, z: c.z + 34, h: Math.PI / 2 }, door: { x: c.x + 8, z: c.z + 8.6 }, ladder: { x: c.x + 20.6, z: c.z + 2 } };
  }

  // ----- The bookstore where Eady works (south-east lot) -----
  function buildBookstore(c) {
    const x = c.x + 13, z = c.z + 13, y = CURB, front = z + 7;
    slab(0xe9e2d2, 16, 5, 14, x, y, z, M.brick, 2); collide(x, z, 16, 14, y + 5);
    slab(0x2c3a5a, 16.3, 1, 14.3, x, y + 3.9, z); slab(0x55525a, 16.6, 0.3, 14.6, x, y + 5, z); flat(M.gravel, 0x8d868c, 15.4, 13.4, x, y + 5.32, z, 5);
    for (const wx of [-4.6, 4.6]) windowAt(x + wx, y + 0.9, front, 5, 2.4, 0, 1, true);
    slab(0x3a2418, 1.8, 3, 0.2, x, y, front + 0.05); slab(0xf0bf78, 1.1, 1.5, 0.06, x, y + 1.3, front + 0.16, M.glow);
    sign(['HENNESSY BOOKS', 'ART · ARCHITECTURE · DESIGN'], x, y + 4.4, front + 0.17, 0, { w: 9, h: 1.5, color: '#f6e7b4', bg: '#2c3a5a', size: 0.62, glow: false });
    shopDoors.push({ shop: 'BOOKS', outside: { x, z: front + 1.6, h: 0 } });
    places.bookstore = { door: { x, z: front + 1.6, h: 0 }, kerb: { x, z: c.z + 34, h: Math.PI / 2 } };
  }

  // ----- The airport along the south edge: aprons with runway markings, a terminal with its tower, a hangar and a jet -----
  function buildAirport(c, kind) {
    const y = 0.03;
    flat(M.asphalt, 0xffffff, BLOCK - 2, BLOCK - 2, c.x, y, c.z, 5); lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 - 1 });
    for (let k = -2; k <= 2; k++) flat(M.paint, 0xe9e6ee, 7, 0.9, c.x + k * 12, 0.07, c.z + 16);  // the runway's centre line
    for (const s of [-1, 1]) { flat(M.paint, 0xe9e6ee, BLOCK - 4, 0.5, c.x, 0.07, c.z + 16 + s * 11); for (let k = -3; k <= 3; k++) { ball(0x4f8cff, 0.14, c.x + k * 9, 0.2, c.z + 16 + s * 12, M.glow); } }
    for (let k = -3; k <= 3; k += 3) halo(c.x + k * 9, 0.4, c.z + 4, 0x4f8cff, 4);
    if (kind === 'terminal') {
      put(M.office, walls(48, FLOOR * 3, 16, c.x, y, c.z - 18, 3), 0xd6fff4); collide(c.x, c.z - 18, 48, 16, 11); slab(0xdfe5ea, 49, 0.5, 17, c.x, y + FLOOR * 3, c.z - 18);
      sign('LOS ANGELES INTERNATIONAL', c.x, y + 12, c.z - 9.9, 0, { w: 26, h: 2.4, color: '#f4f4f0', bg: '#1c2740', size: 0.8, glow: false, also: [[c.x, y + 12, c.z - 26.1, Math.PI]] });
      slab(0x1a242c, 6, 3.2, 0.2, c.x, y, c.z - 26.05);
      post(0xdfe5ea, 1.6, 22, c.x + 20, y, c.z - 4, 10); put(M.office, new THREE.CylinderGeometry(3.6, 2.6, 3.4, 10).translate(c.x + 20, 23.7, c.z - 4), 0x9fd0f5); put(M.plain, new THREE.ConeGeometry(3.8, 1, 10).translate(c.x + 20, 25.9, c.z - 4), 0x55525a);
      ball(0xff3b3b, 0.3, c.x + 20, 26.8, c.z - 4, M.glow); halo(c.x + 20, 26.8, c.z - 4, 0xff3030, 4); collide(c.x + 20, c.z - 4, 3.4, 3.4, 26);
      places.airport = { door: { x: c.x, z: c.z - 28 }, kerb: { x: c.x, z: c.z - 34, h: Math.PI / 2 }, runway: { x: c.x, z: c.z + 16 }, tower: { x: c.x + 20, z: c.z - 4 } };
    } else if (kind === 'hangar') {
      slab(0x9fb0c4, 36, 10, 18, c.x, y, c.z - 17, M.siding, 1.6); collide(c.x, c.z - 17, 36, 18, 10); gable(0x55525a, 19, 3, 37, c.x, y + 10, c.z - 17, Math.PI / 2, M.plain);
      slab(0x24324c, 22, 7, 0.2, c.x, y, c.z - 7.95);
      // a jet on the apron: fuselage, wings, tail
      const jx = c.x - 4, jz = c.z + 2, WH = 0xf4f4f0;
      put(M.plain, new THREE.CapsuleGeometry(1.5, 16, 6, 12).rotateZ(Math.PI / 2).translate(jx, 2.6, jz), WH);
      put(M.plain, new THREE.BoxGeometry(4, 0.3, 20).translate(jx + 1, 2.2, jz), WH); put(M.plain, new THREE.BoxGeometry(2.4, 0.2, 7).translate(jx - 8.4, 3, jz), WH);
      put(M.plain, new THREE.BoxGeometry(2.6, 3.4, 0.25).rotateZ(-0.35).translate(jx - 8.4, 4.8, jz), 0xd8342c);
      for (const s of [-1, 1]) { put(M.plain, new THREE.CylinderGeometry(0.6, 0.6, 2.2, 10).rotateZ(Math.PI / 2).translate(jx + 1.6, 1.6, jz + s * 4.4), 0x8d8a8e); post(0x3a3a44, 0.1, 1.2, jx + 1, 0, jz + s * 1.6, 5); }
      post(0x3a3a44, 0.1, 1.2, jx + 7, 0, jz, 5); slab(0x24324c, 0.05, 0.5, 2.2, jx + 9.2, 3, jz, M.plain);
      collide(jx, jz, 19, 3.4, 4.5); collide(jx + 1, jz, 4, 20, 2.6, true);
    }
  }

  // ----- The river: a concrete channel down one column of blocks, a trickle of water in the middle of it -----
  function buildRiver(c, j) {
    lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 });
    flat(M.gravel, 0xe2ddd4, BLOCK, BLOCK, c.x, 0.03, c.z, 9); // pale poured concrete
    for (const s of [-1, 1]) { flat(M.paint, 0xb9b3ac, 9, BLOCK, c.x + s * 20.5, 0.05, c.z); flat(M.paint, 0x8d8a86, 0.4, BLOCK, c.x + s * 16, 0.06, c.z); } // the sloped banks, and where they meet the bed
    put(M.glow, new THREE.PlaneGeometry(5, BLOCK).rotateX(-Math.PI / 2).translate(c.x + Math.sin(j * 1.7) * 3, 0.07, c.z), 0x2f6f7a);
    for (let n = -2; n <= 2; n++) flat(M.paint, 0x9a968e, BLOCK, 0.25, c.x, 0.055, c.z + n * 12);            // expansion joints
    for (const s of [-1, 1]) { // a fence along each bank, and a splash of paint on the concrete
      for (let t = -28; t <= 28; t += 4) post(0x8a8d96, 0.05, 2.2, c.x + s * 29.6, 0.03, c.z + t, 5);
      slab(0x8a8d96, 0.05, 0.05, BLOCK, c.x + s * 29.6, 2.2, c.z); collide(c.x + s * 29.6, c.z, 0.4, BLOCK, 2.4);
      if ((j + (s > 0 ? 1 : 0)) % 2) flat(M.paint, [0xd8342c, 0x2f56c8, 0xf2c230, 0x7dffb0][(j + s + 4) % 4], 1.4, 7 + (j % 3) * 3, c.x + s * 22, 0.065, c.z + (j % 2 ? 9 : -11));
    }
    if (j === 6) places.river = { bed: { x: c.x, z: c.z }, north: { x: c.x, z: c.z - 30 } };
  }

  // ----- The hills to the north, across the water: dark ridges with a scatter of lights and the city's name in white letters -----
  if (LA) {
    const hz = OZ - 330;
    for (let n = 0; n < 9; n++) {
      const hx = OX + (n + 0.5) * (NX * CELL / 9) + (n % 2 ? 30 : -20), r = 150 + (n * 37 % 90);
      put(M.plain, new THREE.SphereGeometry(r, 14, 8).scale(1.5, 0.55 + (n % 3) * 0.12, 0.9).translate(hx, -12, hz - (n % 2) * 60), [0x4a5a3c, 0x5a5a3a, 0x3f5238][n % 3]);
      for (let k = 0; k < 14; k++) { const a = rand() * Math.PI, e = 0.25 + rand() * 0.5; halo(hx + Math.cos(a) * r * 1.3 * Math.cos(e), -12 + Math.sin(e) * r * 0.6, hz - (n % 2) * 60 + r * 0.82 * Math.cos(e) * Math.sin(a) * 0.5 + r * 0.2, [0xffd9a8, 0xffe2a6, 0xfff0d0][k % 3], 4); }
    }
    sign('LOS ANGELES', 0, 74, hz + 118, 0, { w: 190, h: 26, color: '#f4f4f0', bg: '#4a5a3c', size: 0.86, glow: false });
  }

  // ----- The freeway: an elevated deck along one avenue, on columns, with its green signs -----
  function buildFreeway() {
    const x = nodeX(5), z0 = OZ - ROAD / 2, len = NZ * CELL + ROAD, DECK = 7.4, GREY = 0x9a968e;
    slab(GREY, 15, 1, len, x, DECK, z0 + len / 2, M.gravel, 6);
    for (const s of [-1, 1]) slab(0xb9b3ba, 0.5, 1, len, x + s * 7.4, DECK + 1, z0 + len / 2);
    for (let j = 0; j < NZ; j++) {
      const cz = nodeZ(j) + CELL / 2;
      for (const s of [-1, 1]) { slab(GREY, 1.3, DECK, 1.3, x + s * 9.1, CURB, cz, M.gravel, 3); collide(x + s * 9.1, cz, 1.4, 1.4, DECK + 1); }
      slab(GREY, 20, 1.2, 1.6, x, DECK - 1.2, cz, M.gravel, 3);
      if (j % 3 === 1) sign([['DOWNTOWN', 'HARBOR', 'AIRPORT'][Math.floor(j / 3) % 3], '10 · 110 · 405'], x, DECK + 3.4, cz + 0.9, 0, { w: 9, h: 2.4, color: '#f4f4f0', bg: '#1f6b4a', size: 0.62, glow: false, also: [[x, DECK + 3.4, cz - 0.9, Math.PI]] });
      if (j % 3 === 1) { slab(0x55525a, 9.4, 2.8, 0.3, x, DECK + 2, cz); for (const s of [-1, 1]) post(0x55525a, 0.12, 2, x + s * 4, DECK + 1, cz, 5); }
    }
    places.freeway = { under: { x, z: nodeZ(6) + CELL / 2 }, north: { x, z: nodeZ(5) + CELL / 2 }, south: { x, z: nodeZ(7) + CELL / 2 }, x };
  }
  if (LA) buildFreeway();

  // ----- Inside the Bada Bing: an interior set far below the city, like the therapy office -----
  function buildBingRoom() {
    const X = 2680, Y = -0.1, Z = 0, WOOD = 0x3a2418, PINK = 0xff3fe0;
    const q = { minX: X - 9.7, maxX: X + 9.7, minZ: Z - 6.7, maxZ: Z + 6.7, lights: [] };
    interiors.push(q);
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
    roomLamp(q, tx, Y + 3.1, tz, 0xffd9a8, 70, 16); roomLamp(q, X - 5.5, Y + 3.4, Z - 2.6, 0xff5fd2, 60, 20); roomLamp(q, X + 4, Y + 2.9, Z - 3.6, 0xffb060, 34, 12);
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
    const q = { minX: X - 6.7, maxX: X + 6.7, minZ: Z - 5.7, maxZ: Z + 5.7, lights: [] };
    interiors.push(q);
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
    roomLamp(q, X, Y + 3.3, Z - 1, 0xfff0d0, 50, 14); roomLamp(q, X, Y + 3.3, Z + 3.5, 0xfff0d0, 30, 12);
    const butcher = makeHuman({ shirt: 0xf4f4f4, sleeves: 'long', pants: 0xf4f4f4, hair: 0x2b1b12, hairStyle: 'balding', bulk: 1.2, mustache: 0x2b1b12, age: 0.5 });
    butcher.group.position.set(X - 1.5, Y, Z - 4.4); butcher.group.rotation.y = 0; scene.add(butcher.group);
    places.shopRoom = { ambient: [butcher], inside: { x: X, z: Z + 3.2, h: Math.PI } };
  }
  buildShopRoom();

  // ----- Inside the Soprano house: the kitchen, the table, and the den -----
  function buildHouseRoom() {
    const X = 2840, Y = -0.1, Z = 0, CREAM = 0xf3e9d8, WOOD = 0x8a5a44;
    const q = { minX: X - 7.7, maxX: X + 7.7, minZ: Z - 5.7, maxZ: Z + 5.7, lights: [] };
    interiors.push(q);
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
    roomLamp(q, X - 3, Y + 3.1, Z - 2, 0xfff0d0, 45, 14); roomLamp(q, X + 4.5, Y + 3, Z - 2, 0xffd9a8, 30, 12);
    const carmela = makeLook('carmela');
    carmela.group.position.set(X - 4, Y, Z - 3.6); carmela.group.rotation.y = Math.PI; scene.add(carmela.group);
    places.houseRoom = { ambient: [carmela], inside: { x: X + 2, z: Z + 3.2, h: Math.PI } };
  }
  buildHouseRoom();

  // ----- A hospital room: the bed, the drip, the monitor, a chair by the window -----
  function buildWardRoom() {
    const X = 2920, Y = -0.1, Z = 0, WHITE = 0xf4f4f0;
    const q = { minX: X - 5.7, maxX: X + 5.7, minZ: Z - 4.7, maxZ: Z + 4.7, lights: [] };
    interiors.push(q);
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
    roomLamp(q, X - 1, Y + 3, Z - 1.5, 0xf0f6ff, 16, 12);
    places.wardRoom = { inside: { x: X + 2, z: Z + 3.2, h: Math.PI }, bed: { x: X - 2.5, y: Y + 0.95, z: Z - 2.6 }, chair: { x: X + 1.4, y: Y, z: Z - 3.3 }, cam: { pos: new THREE.Vector3(X + 1.2, Y + 1.9, Z + 1.6), look: new THREE.Vector3(X - 2, Y + 1.1, Z - 2.6) } };
  }
  buildWardRoom();

  // ----- The other rooms: one behind every landmark's door, and one of each kind of shop, shared by all its doors -----
  // A box of a room with its door on the south wall; furniture goes in afterwards. Rooms stand 80 m apart out over the water.
  let roomX = 3000;
  function room(w, d, h, { floor = M.paver, floorTint = 0xd8d2c8, floorScale = 2, wall = M.gravel, wallTint = 0xf3efe6, wallScale = 3, ceil = 0xf6f1e6, door = 0x3a2418, doorX = 0, at = null } = {}) {
    const X = at ? at[0] : roomX, Y = -0.1, Z = at ? at[1] : 0;
    if (!at) roomX += 80;
    const q = { minX: X - w / 2 + 0.3, maxX: X + w / 2 - 0.3, minZ: Z - d / 2 + 0.3, maxZ: Z + d / 2 - 0.3, lights: [], X, Y, Z, w, d, h, ambient: [] };
    interiors.push(q);
    slab(floorTint, w, 0.2, d, X, Y - 0.2, Z, floor, floorScale);
    slab(tintOf.set(ceil).multiplyScalar(0.62).getHex(), w, 0.2, d, X, Y + h, Z, M.glow); // unlit, so the sky's colour does not stain it
    for (const s of [-1, 1]) { slab(wallTint, w, h + 0.2, 0.3, X, Y, Z + s * (d / 2 - 0.15), wall, wallScale); slab(wallTint, 0.3, h + 0.2, d, X + s * (w / 2 - 0.15), Y, Z, wall, wallScale); }
    slab(door, 1.4, 2.8, 0.1, X + doorX, Y, Z + d / 2 - 0.28);
    q.inside = { x: X + doorX, z: Z + d / 2 - 2.6, h: Math.PI };
    // Furniture helpers in room coordinates.
    q.at = (x, z) => ({ x: X + x, z: Z + z });
    q.block = (hex, w, h, d, x, z, mat, s, y0 = 0) => { slab(hex, w, h, d, X + x, Y + y0, Z + z, mat, s); collide(X + x, Z + z, w, d, Y + y0 + h); };
    q.glowPanel = (hex, w, h, x, z, y, turn = 0) => put(M.glow, new THREE.PlaneGeometry(w, h).rotateY(turn).translate(X + x, Y + y, Z + z), hex);
    q.person = (opts, x, z, turn, state) => { const who = typeof opts === 'string' ? makeLook(opts) : makeHuman(opts); who.group.position.set(X + x, Y, Z + z); who.group.rotation.y = turn; if (state) who.set(state); scene.add(who.group); q.ambient.push(who); return who; };
    q.light = (x, y, z, hex, power, reach) => roomLamp(q, X + x, Y + y, Z + z, hex, power, reach);
    q.window = (x, z, w, h, y, turn, hex = 0xffe8c0) => q.glowPanel(hex, w, h, x, z, y, turn);
    return q;
  }
  const table = (q, x, z, hex = 0xffffff, cloth = true) => { // a round table with two chairs, as in the Bing
    post(0xc9cbd2, 0.05, 0.75, q.X + x, q.Y, q.Z + z); post(hex, 0.55, 0.05, q.X + x, q.Y + 0.75, q.Z + z, 12);
    for (const s of [-1, 1]) { slab(0x5a3320, 0.42, 0.06, 0.42, q.X + x + s * 0.9, q.Y + 0.45, q.Z + z); post(0x1c1c22, 0.03, 0.45, q.X + x + s * 0.9, q.Y, q.Z + z, 4); put(M.plain, new THREE.BoxGeometry(0.42, 0.5, 0.06).translate(0, 0.75, -0.2).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(q.X + x + s * 0.9, q.Y, q.Z + z), 0x5a3320); }
    if (cloth) ball(0xd8342c, 0.08, q.X + x, q.Y + 0.84, q.Z + z);
    collide(q.X + x, q.Z + z, 1.2, 1.2, 1);
  };
  const racks = (q, x, z, w, rows, items, turn = 0) => { // a wall of shelving with coloured goods on it
    const dx = Math.cos(turn), dz = -Math.sin(turn), along = v => [Math.abs(dx) * v, Math.abs(dz) * v];
    const [uw, ud] = along(w), [bw, bd] = along(0.5);
    slab(0x3a3a44, uw + bw, 2.4, ud + bd, q.X + x, q.Y, q.Z + z);                                  // the back and the frame
    collide(q.X + x, q.Z + z, uw + bw + 0.3, ud + bd + 0.3, 2.4);
    for (let r = 0; r < rows; r++) {
      slab(0xe9e2d2, uw + bw + Math.abs(dz) * 0.3, 0.05, ud + bd + Math.abs(dx) * 0.3, q.X + x - dz * 0.15, q.Y + 0.45 + r * 0.6, q.Z + z + dx * 0.15); // a shelf
      for (let n = 0; n < w * 1.6; n++) {
        const t = (n / (w * 1.6) - 0.5) * (w - 0.4), hex = items[(n + r) % items.length];
        put(M.plain, new THREE.BoxGeometry(0.3, 0.3 + (n % 3) * 0.08, 0.2).translate(q.X + x + dx * t - dz * 0.3, q.Y + 0.65 + (n % 3) * 0.04 + r * 0.6, q.Z + z + dz * t + dx * 0.3), hex);
      }
    }
  };
  const counter = (q, x, z, w, hex = 0x3a2418, turn = 0) => { // a bar or shop counter, facing the room
    const dx = Math.cos(turn), dz = -Math.sin(turn);
    slab(hex, Math.abs(dx) * w + Math.abs(dz) * 0.8, 1.05, Math.abs(dz) * w + Math.abs(dx) * 0.8, q.X + x, q.Y, q.Z + z, M.wood, 2);
    slab(0x14080f, Math.abs(dx) * (w + 0.2) + Math.abs(dz) * 1, 0.08, Math.abs(dz) * (w + 0.2) + Math.abs(dx) * 1, q.X + x, q.Y + 1.05, q.Z + z);
    collide(q.X + x, q.Z + z, Math.abs(dx) * w + Math.abs(dz) * 0.9, Math.abs(dz) * w + Math.abs(dx) * 0.9, 1.1);
  };
  const BOTTLES = [0xd9a520, 0x2f7d46, 0xc8312a, 0xe9e2cf, 0x8a5a2a, 0x49e0d0], GOODS = [0xd8342c, 0xf2c230, 0x2f56c8, 0xf4f4f0, 0x1f6b4a, 0xff5fd2];
  // Whoever minds the counter; `till` is where a customer stands to talk to them.
  const clerk = (q, x, z, turn, extra = {}) => {
    const who = q.person({ shirt: pick([0xf4f4f4, 0x49e0d0, 0xffe066, 0x8d93cc]), sleeves: 'long', tucked: true, pants: 0x23232b, hair: pick([0x2b1b12, 0x111111, 0x7a3b1a, 0x9a9690]), hairMesh: pick(['parted', 'buzzed']), dark: rand() < 0.3, ...extra }, x, z, turn);
    q.clerk = who; q.till = { x: q.X + x + Math.sin(turn) * 1.7, z: q.Z + z + Math.cos(turn) * 1.7 };
    return who;
  };
  const rooms = {};

  if (!LA) { // a neighbourhood bar: a long counter, the back bar lit, a jukebox, booths and a pool table
    const q = rooms.BAR = room(16, 12, 3.8, { floor: M.wood, floorTint: 0x6a4a34, wall: M.wood, wallTint: 0x5a3a2a, ceil: 0x2a2024 });
    counter(q, 0, -3.6, 11);
    q.block(0x14080f, 12, 2.6, 0.3, 0, -5.6); q.glowPanel(0x8a5a9a, 11, 0.9, 0, -5.42, 2.5);
    for (let n = 0; n < 22; n++) post(BOTTLES[n % 6], 0.05, 0.32 + (n % 3) * 0.05, q.X - 5.2 + n * 0.5, q.Y + 1.55 + (n % 2) * 0.75, q.Z - 5.4, 6);
    for (let n = 0; n < 7; n++) { post(0xc9cbd2, 0.04, 0.75, q.X - 4.5 + n * 1.5, q.Y, q.Z - 2.6); post(0x8a1c3a, 0.22, 0.08, q.X - 4.5 + n * 1.5, q.Y + 0.75, q.Z - 2.6, 10); }
    for (const s of [-1, 1]) { q.block(0x8a2f3a, 2.4, 1.1, 0.9, s * 6.2, 1.5); q.block(0x3a2418, 1.6, 0.75, 1, s * 6.2, 3.2, M.wood, 1); q.block(0x8a2f3a, 2.4, 1.1, 0.9, s * 6.2, 4.9); }
    q.block(0x3a2418, 2.6, 0.8, 1.4, 0, 2.6, M.wood, 2); slab(0x1f6b4a, 2.4, 0.04, 1.2, q.X, q.Y + 0.8, q.Z + 2.6);
    q.block(0xd9a520, 1, 1.5, 0.6, 6.9, -1.4); q.glowPanel(0xff5fd2, 0.8, 0.5, 6.58, -1.4, 1.1, -Math.PI / 2); // jukebox
    sign(['COLD BEER', 'HAPPY HOUR 4-7'], q.X - 6.5, q.Y + 2.6, q.Z - 5.4, 0, { w: 3, h: 1.2, color: '#49e0d0', bg: '#1c1c22', size: 0.55 });
    q.window(4, 5.72, 4, 1.8, 1.9, Math.PI, 0xffd9a8);
    q.light(0, 3.2, -3, 0xffb060, 40, 14); q.light(0, 3.2, 3, 0xff5fd2, 26, 12);
    clerk(q, -1, -4.6, 0, { shirt: 0xf4f4f4, open: 0x1c1c22 });
    q.person(pick(PED_ROOM_LOOKS), -3, -2.6, Math.PI, 'talk'); q.person(pick(PED_ROOM_LOOKS), 1.5, -2.6, Math.PI);
  }
  if (!LA) { // a diner: the counter with stools, booths along the window, pie under glass
    const q = rooms.DINER = room(16, 12, 3.6, { floor: M.paver, floorTint: 0xe9e4dc, wallTint: 0xd6fff4, ceil: 0xf6f1e6 });
    for (let k = 0; k < 8; k++) { slab(0xffffff, 16, 0.02, 0.2, q.X, q.Y + 0.01, q.Z - 6 + k * 1.5); } // checkered floor stripes
    counter(q, 1, -3.4, 11, 0xd8342c); slab(0xf4f4f0, 11.2, 0.08, 1, q.X + 1, q.Y + 1.05, q.Z - 3.4);
    for (let n = 0; n < 7; n++) { post(0xc9cbd2, 0.04, 0.7, q.X - 3.5 + n * 1.5, q.Y, q.Z - 2.3); post(0xd8342c, 0.22, 0.1, q.X - 3.5 + n * 1.5, q.Y + 0.7, q.Z - 2.3, 10); }
    q.block(0xc9cbd2, 11, 1.6, 0.8, 1, -5.3, M.plain, 0, 1); for (let n = 0; n < 5; n++) slab(0xf4f4f0, 0.6, 0.5, 0.4, q.X - 3 + n * 2, q.Y + 1.2, q.Z - 5.2); // the pass and the pie cases
    for (const [x, z] of [[-5.5, 2.2], [-5.5, 5], [5.5, 2.2], [5.5, 5]]) { // booths: a bench with a high back, a table on a pedestal
      q.block(0x2f56c8, 2.4, 0.5, 0.7, x, z - 0.9); q.block(0x2a4ab0, 2.4, 0.7, 0.2, x, z - 1.15, M.plain, 0, 0.5);
      slab(0xf4f4f0, 2.2, 0.08, 1, q.X + x, q.Y + 0.72, q.Z + z); post(0xc9cbd2, 0.06, 0.72, q.X + x, q.Y, q.Z + z); collide(q.X + x, q.Z + z, 2.2, 1, 0.8);
    }
    q.block(0xc9cbd2, 0.8, 1.2, 0.8, -6.8, -4.6); q.glowPanel(0x49e0d0, 0.6, 0.5, -6.8, -4.18, 0.9); // the coffee machine
    sign('EAT', q.X, q.Y + 2.8, q.Z - 5.4, 0, { w: 2.4, h: 1, color: '#ff5fd2', bg: '#1c1c22', size: 0.9 });
    for (const x of [-4, 4]) q.window(x, 5.72, 4.4, 1.8, 1.9, Math.PI);
    q.light(0, 3.1, -2, 0xfff0d0, 50, 15); q.light(0, 3.1, 3.5, 0xfff0d0, 30, 12);
    clerk(q, -1, -4.4, 0, { shirt: 0xf4f4f4, body: 'female', hair: 0xd9b25a, hairMesh: 'long', hat: undefined });
    q.person(pick(PED_ROOM_LOOKS), -4.4, 2.2, Math.PI, 'sit');
  }
  if (!LA) { // a liquor store: aisles of bottles, beer in the cold case, the register behind glass
    const q = rooms.LIQUOR = room(14, 12, 3.4, { floorTint: 0xc9c2b8, wallTint: 0xe9e2d2 });
    racks(q, -5.8, -1, 8, 3, BOTTLES, Math.PI / 2); racks(q, 5.8, -1, 8, 3, BOTTLES, Math.PI / 2); racks(q, 0, -1, 6, 3, BOTTLES, Math.PI / 2);
    q.block(0x1c1c22, 10, 2.4, 0.9, 0, -5.4); q.glowPanel(0xcfe8ff, 9.6, 1.6, 0, -4.94, 1.5); for (let n = 0; n < 12; n++) slab(GOODS[n % 6], 0.4, 0.5, 0.4, q.X - 4.5 + n * 0.8, q.Y + 0.7 + (n % 2) * 0.8, q.Z - 5.2); // the cold case
    counter(q, 4, 3.8, 4.5, 0x3a2418, 0); slab(0xc9cbd2, 1.4, 1.2, 0.04, q.X + 4, q.Y + 1.1, q.Z + 3.8); slab(0x1c1c22, 0.5, 0.3, 0.4, q.X + 5.2, q.Y + 1.13, q.Z + 3.8);
    sign('LIQUOR · LOTTO · ICE', q.X, q.Y + 2.8, q.Z - 5.4, 0, { w: 6, h: 0.9, color: '#ffe066', bg: '#1c1c22', size: 0.8 });
    q.window(-3, 5.72, 4, 1.8, 1.9, Math.PI);
    q.light(0, 3, 0, 0xfff6e0, 55, 14);
    clerk(q, 4, 4.9, Math.PI, { hat: 'cap', hatColor: 0x1f6b4a });
  }
  if (!LA) { // a pawn shop: cages over the counter, guitars and televisions on the wall, a case of watches
    const q = rooms.PAWN = room(14, 10, 3.4, { floor: M.wood, floorTint: 0x8a6a4a, wall: M.brick, wallTint: 0xbdb4aa, wallScale: 2, ceil: 0x3a3a44 });
    counter(q, 0, -2.6, 9, 0x3a2418, 0); slab(0xd6ecf5, 9, 0.6, 0.8, q.X, q.Y + 1.1, q.Z - 2.6, M.glow); // the glass case
    for (let n = 0; n < 14; n++) slab(n % 2 ? 0xd9a520 : 0xc9cbd2, 0.12, 0.05, 0.12, q.X - 3.9 + n * 0.6, q.Y + 1.12, q.Z - 2.6 + (n % 3) * 0.2 - 0.2);
    for (let n = 0; n < 12; n++) post(0x8a8d96, 0.02, 2.2, q.X - 4.5 + n * 0.82, q.Y + 1.1, q.Z - 2.2, 4); slab(0x8a8d96, 9.2, 0.04, 0.04, q.X, q.Y + 3.3, q.Z - 2.2); // the cage
    for (let n = 0; n < 5; n++) { slab(0x1c1c22, 0.9, 0.7, 0.2, q.X - 4 + n * 2, q.Y + 2.2, q.Z - 4.7); slab(n % 2 ? 0x9fd0f5 : 0x2a2a30, 0.8, 0.6, 0.04, q.X - 4 + n * 2, q.Y + 2.25, q.Z - 4.58, M.glow); } // televisions
    for (let n = 0; n < 4; n++) { put(M.plain, new THREE.BoxGeometry(0.3, 0.9, 0.08).translate(q.X - 5.4 + n * 0.5, q.Y + 1.5, q.Z - 4.75), [0xd8342c, 0xf2c230, 0x1c1c22, 0xf4f4f0][n]); post(0x3a2418, 0.03, 0.7, q.X - 5.4 + n * 0.5, q.Y + 1.9, q.Z - 4.75, 4); } // guitars
    racks(q, -6.3, 1, 6, 3, [0xc9cbd2, 0xd9a520, 0x1c1c22, 0x2f56c8], Math.PI / 2);
    sign(['WE BUY GOLD', 'LOANS · CASH NOW'], q.X + 3, q.Y + 2.6, q.Z - 4.6, 0, { w: 3.4, h: 1.2, color: '#ffe066', bg: '#8a1c1c', size: 0.55, glow: false });
    q.window(3.5, 4.72, 3.6, 1.6, 1.8, Math.PI);
    q.light(0, 3, -1, 0xfff0d0, 40, 14);
    clerk(q, 1, -3.8, 0, { glasses: 'clear', age: 0.6, hairStyle: 'balding', hairMesh: undefined });
  }
  if (!LA) { // a gun shop: long guns on the wall, pistols under glass, boxes of shells, a paper target with a tight group in it
    const q = rooms.GUNS = room(14, 10, 3.4, { floor: M.wood, floorTint: 0x8a6a4a, wall: M.wood, wallTint: 0x6a5a44, ceil: 0x3a3a44 });
    counter(q, 0, -2.4, 10, 0x3a2418, 0); slab(0x55707c, 10, 0.06, 0.8, q.X, q.Y + 1.1, q.Z - 2.4, M.glow);
    for (let n = 0; n < 9; n++) { slab(0x1c1c22, 0.34, 0.06, 0.2, q.X - 4.2 + n * 1.05, q.Y + 1.17, q.Z - 2.4); slab(0x1c1c22, 0.1, 0.06, 0.16, q.X - 4.3 + n * 1.05, q.Y + 1.17, q.Z - 2.3); } // pistols on the glass
    slab(0x3a2418, 12, 2.2, 0.12, q.X, q.Y + 1, q.Z - 4.8, M.wood, 1);                             // the rack on the back wall
    for (let n = 0; n < 9; n++) { slab(n % 3 ? 0x1c1c22 : 0x6a4a34, 1.15, 0.09, 0.07, q.X - 5.2 + n * 1.3, q.Y + 2.6 - (n % 2) * 0.7, q.Z - 4.7); slab(0x6a4a34, 0.3, 0.16, 0.07, q.X - 5.75 + n * 1.3, q.Y + 2.56 - (n % 2) * 0.7, q.Z - 4.7); }
    for (let n = 0; n < 12; n++) slab([0xd8342c, 0xf2c230, 0x2f6b4a][n % 3], 0.3, 0.18, 0.2, q.X - 5 + n * 0.9, q.Y + 1.2, q.Z - 4.6);          // boxes of shells
    racks(q, -6.3, 1.2, 5, 3, [0x5c6157, 0x1c1c22, 0x8a5a2a, 0xd8342c], Math.PI / 2);
    slab(0xf4f4f0, 0.9, 1.3, 0.03, q.X + 6.8, q.Y + 1.4, q.Z - 1, M.plain); put(M.plain, new THREE.CircleGeometry(0.28, 14).rotateY(-Math.PI / 2).translate(q.X + 6.78, q.Y + 2.1, q.Z - 1), 0x1c1c22); // a target
    sign(['GUNS · AMMO', 'NO WAITING PERIOD'], q.X + 4, q.Y + 2.9, q.Z - 4.72, 0, { w: 4, h: 1.1, color: '#ffe066', bg: '#1c1c22', size: 0.6 });
    q.window(3.5, 4.72, 3.6, 1.6, 1.8, Math.PI);
    q.light(0, 3, -1.5, 0xfff0d0, 50, 14); q.light(0, 3, 2.5, 0xfff0d0, 26, 10);
    clerk(q, 0, -3.5, 0, { pattern: 'plaid', shirt: 0x8d93cc, sleeves: undefined, hat: 'cap', hatColor: 0x5c6157, bulk: 1.25, stubble: 0.6, age: 0.5 });
  }
  if (!LA) { // a store: records, videos, surf gear, cigars or suits all sell from the same shelves
    const q = rooms.STORE = room(14, 12, 3.4, { floorTint: 0xd8d2c8, wallTint: 0xfff1c9 });
    racks(q, -6.4, 0, 9, 3, GOODS, Math.PI / 2); racks(q, 6.4, 0, 9, 3, GOODS, Math.PI / 2);
    for (const z of [-3, 0, 3]) { q.block(0xe9e2d2, 5, 1, 1, 0, z, M.gravel, 2); for (let n = 0; n < 10; n++) slab(GOODS[(n + z) % 6], 0.4, 0.35, 0.25, q.X - 2.2 + (n % 5) * 1.1, q.Y + 1, q.Z + z - 0.3 + Math.floor(n / 5) * 0.6); }
    counter(q, 3, -4.4, 5, 0x3a2418, 0); slab(0x1c1c22, 0.5, 0.3, 0.4, q.X + 4, q.Y + 1.13, q.Z - 4.4);
    sign(['SALE', 'EVERYTHING MUST GO'], q.X - 3, q.Y + 2.6, q.Z - 5.4, 0, { w: 3.6, h: 1.4, color: '#ffffff', bg: '#d8342c', size: 0.6, glow: false });
    for (const x of [-3.5, 3.5]) q.window(x, 5.72, 4, 1.8, 1.9, Math.PI);
    q.light(0, 3, -2, 0xfff6e0, 50, 15); q.light(0, 3, 3, 0xfff6e0, 30, 12);
    clerk(q, 3, -5.3, 0, { body: 'female', hair: 0x7a3b1a, hairMesh: 'long' });
  }
  if (!LA) { // somebody's house: a front room with a sofa, the television on, a kitchen through the arch
    const q = rooms.HOUSE = room(14, 12, 3.4, { floor: M.gravel, floorTint: 0x8a6a5a, wallTint: 0xfff1c9 });
    q.block(0x2f4a44, 3.2, 0.55, 1.1, -3, -3.4); q.block(0x2f4a44, 3.2, 0.5, 0.3, -3, -3.9, M.plain, 0, 0.55); q.block(0x27403b, 1.1, 0.55, 1, -5.2, -1.2);
    q.block(0x3a2418, 1.4, 0.4, 0.7, -3, -1.4, M.wood, 1); slab(0xd8d0c4, 4, 0.03, 3, q.X - 3, q.Y + 0.01, q.Z - 2);
    q.block(0x1c1c22, 1.3, 0.9, 0.5, -3, 0.9, M.plain, 0, 0.4); q.glowPanel(0x9fd0f5, 1.1, 0.7, -3, 0.64, 0.9);
    post(0x1c1c22, 0.03, 1.5, q.X - 6.2, q.Y, q.Z - 4.8, 6); put(M.glow, new THREE.ConeGeometry(0.32, 0.4, 12, 1, true).translate(q.X - 6.2, q.Y + 1.7, q.Z - 4.8), 0xffe2a6);
    q.block(0xd9b48a, 1, 0.9, 7, 6.3, -1, M.wood, 1); slab(0x2a2a30, 1.1, 0.05, 7.1, q.X + 6.3, q.Y + 0.9, q.Z - 1); q.block(0xe9e2d2, 1, 2, 1, 6.3, 4, M.plain, 0);
    q.block(0x8a5a44, 2.4, 0.08, 1.2, 2.5, -3.5, M.wood, 1, 0.72); for (const [cx, cz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) post(0x8a5a44, 0.04, 0.72, q.X + 2.5 + cx, q.Y, q.Z - 3.5 + cz, 4);
    for (const [cx, cz, h] of [[-0.6, 1.2, Math.PI], [0.6, 1.2, Math.PI], [-0.6, -1.2, 0], [0.6, -1.2, 0]]) { slab(0x5a3320, 0.42, 0.06, 0.42, q.X + 2.5 + cx, q.Y + 0.46, q.Z - 3.5 + cz); put(M.plain, new THREE.BoxGeometry(0.42, 0.5, 0.06).translate(0, 0.75, -0.21).rotateY(h).translate(q.X + 2.5 + cx, q.Y, q.Z - 3.5 + cz), 0x5a3320); }
    for (let n = 0; n < 4; n++) slab(0xe9e2cf, 0.8, 0.6, 0.04, q.X - 1 + n * 1.6, q.Y + 2.1, q.Z - 5.84, M.plain); // pictures
    q.window(-2, -5.72, 2.4, 1.4, 1.8, 0, 0xffd9a8); q.window(3.5, 5.72, 2.4, 1.4, 1.8, Math.PI);
    q.light(-2, 3, -2, 0xfff0d0, 40, 14); q.light(4, 3, 1, 0xffd9a8, 24, 12);
    q.person(pick(PED_ROOM_LOOKS), -3.6, -3.3, 0, 'sit');
  }
  { // Livia's house: the plastic on the sofa, the figurines, the console television, a lifetime of photographs
    const q = rooms.LIVIA = room(14, 12, 3.4, { floor: M.gravel, floorTint: 0x8a7a6a, wallTint: 0xe9e2d2 });
    q.block(0xd9c7a0, 3.4, 0.55, 1.1, -3, -3.4, M.plain, 0); q.block(0xd9c7a0, 3.4, 0.55, 0.3, -3, -3.9, M.plain, 0, 0.55); q.block(0xd9c7a0, 1.2, 0.55, 1.1, -5.6, -1); // the sofa and chair under plastic
    slab(0xeaf4ff, 3.5, 0.02, 1.2, q.X - 3, q.Y + 0.56, q.Z - 3.4, M.glow);
    q.block(0x3a2418, 1.6, 0.45, 0.8, -3, -1.6, M.wood, 1); for (let n = 0; n < 3; n++) ball([0xf4f4f0, 0xd9a520, 0x9fd0f5][n], 0.07, q.X - 3.5 + n * 0.5, q.Y + 0.52, q.Z - 1.6); // figurines
    q.block(0x3a2418, 1.6, 1, 0.6, -3, 0.9, M.wood, 1); q.glowPanel(0x8a8d96, 1, 0.7, -3, 0.59, 0.6);
    q.block(0x3a2418, 1, 2.2, 3, 6.3, -2, M.wood, 1); for (let n = 0; n < 8; n++) slab(0xe9e2cf, 0.04, 0.4, 0.3, q.X + 5.76, q.Y + 0.5 + Math.floor(n / 4) * 0.9, q.Z - 3.2 + (n % 4) * 0.8, M.plain); // the cabinet of photographs
    q.block(0x8a5a44, 2.2, 0.08, 1.2, 2.5, -3.5, M.wood, 1, 0.72); for (const [cx, cz] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) post(0x8a5a44, 0.04, 0.72, q.X + 2.5 + cx, q.Y, q.Z - 3.5 + cz, 4);
    slab(0xf4f4f0, 2.1, 0.02, 1.1, q.X + 2.5, q.Y + 0.76, q.Z - 3.5); // the lace cloth
    for (const [cx, cz, h] of [[-0.6, 1.1, Math.PI], [0.6, 1.1, Math.PI], [0, -1.1, 0]]) { slab(0x5a3320, 0.42, 0.06, 0.42, q.X + 2.5 + cx, q.Y + 0.46, q.Z - 3.5 + cz); put(M.plain, new THREE.BoxGeometry(0.42, 0.5, 0.06).translate(0, 0.75, -0.21).rotateY(h).translate(q.X + 2.5 + cx, q.Y, q.Z - 3.5 + cz), 0x5a3320); }
    for (let n = 0; n < 6; n++) slab(0xe9e2cf, 0.5, 0.6, 0.04, q.X - 4 + n * 1.3, q.Y + 2.1, q.Z - 5.84, M.plain);
    post(0x1c1c22, 0.03, 1.5, q.X - 6.2, q.Y, q.Z - 4.8, 6); put(M.glow, new THREE.ConeGeometry(0.32, 0.4, 12, 1, true).translate(q.X - 6.2, q.Y + 1.7, q.Z - 4.8), 0xffe2a6);
    q.window(-2, -5.72, 2.4, 1.4, 1.8, 0, 0xffd9a8); q.window(3.5, 5.72, 2.4, 1.4, 1.8, Math.PI);
    q.light(-2, 3, -2, 0xffe8c8, 34, 14); q.light(4, 3, 1, 0xffd9a8, 20, 12);
  }
  { // a warehouse: racks of boxes to the roof, a forklift, a foreman's cage
    const q = rooms.WAREHOUSE = room(24, 16, 6, { floor: M.asphalt, floorTint: 0x8a8890, floorScale: 5, wall: M.siding, wallTint: 0x9fb0c4, wallScale: 1.6, ceil: 0x55525a, doorX: -8 });
    for (const z of [-5, 0, 5]) for (const x of [-7, 5]) {
      for (let r = 0; r < 3; r++) { slab(0xd8342c, 10, 0.1, 1.4, q.X + x, q.Y + 0.3 + r * 1.8, q.Z + z); for (let n = 0; n < 5; n++) if ((n + r + z) % 3) slab(0xc79a6a, 1.6, 1.4, 1.2, q.X + x - 4 + n * 2, q.Y + 0.4 + r * 1.8, q.Z + z, M.wood, 1); }
      for (const s of [-1, 1]) for (const t of [-1, 1]) post(0x2f56c8, 0.06, 5.6, q.X + x + s * 5, q.Y, q.Z + z + t * 0.7, 4);
      collide(q.X + x, q.Z + z, 10, 1.4, 5.6);
    }
    q.block(0xf2c230, 1.2, 1.2, 2, 9, 5); q.block(0x1c1c22, 1.3, 0.8, 0.6, 9, 5.6, M.plain, 0, 1.2); for (const s of [-1, 1]) post(0x1c1c22, 0.3, 0.3, q.X + 9 + s * 0.6, q.Y, q.Z + 4.6, 8); for (const s of [-1, 1]) slab(0x8a8d96, 0.08, 0.08, 1.2, q.X + 9 + s * 0.4, q.Y + 0.15, q.Z + 7); // the forklift
    q.block(0x8a8d96, 4, 2.6, 3, 9.8, -5.5, M.plain, 0); q.glowPanel(0xffe8c0, 3.4, 1, 9.8, -3.98, 1.8); // the cage
    for (let n = 0; n < 4; n++) slab(0xffe2a6, 1.2, 0.08, 0.3, q.X - 8 + n * 5.4, q.Y + 5.85, q.Z, M.glow);
    sign('NO SMOKING · HARD HAT AREA', q.X, q.Y + 4.6, q.Z - 7.84, 0, { w: 8, h: 1, color: '#f4f4f0', bg: '#d8342c', size: 0.8, glow: false });
    q.light(-4, 5.4, 0, 0xffe2a6, 240, 30); q.light(7, 5.4, 0, 0xffe2a6, 180, 26);
    clerk(q, 9.6, -3.4, 0, { hat: 'cap', hatColor: 0xf2c230, shirt: 0xf2c230, tee: true });
  }
  { // a gas station kiosk: snacks, the slush machine, cigarettes behind the counter
    const q = rooms.KIOSK = room(10, 8, 3.2, { floorTint: 0xd8d2c8, wallTint: 0xf4f4f0 });
    counter(q, 0, -2.4, 7, 0xd8342c, 0); for (let n = 0; n < 10; n++) slab(GOODS[n % 6], 0.3, 0.3, 0.2, q.X - 4 + n * 0.8, q.Y + 1.8 + (n % 2) * 0.5, q.Z - 3.7); slab(0xe9e2d2, 8, 1.6, 0.3, q.X, q.Y + 1.4, q.Z - 3.7);
    racks(q, -4.4, 1, 4, 2, GOODS, Math.PI / 2); racks(q, 0, 0.6, 4, 2, GOODS, 0);
    q.block(0x1c1c22, 1, 1.8, 0.8, 4.2, -1.4); q.glowPanel(0x49e0d0, 0.8, 0.8, 3.78, -1.4, 1.2, -Math.PI / 2); q.block(0x1c1c22, 3, 2.2, 0.8, 3, 3.3); q.glowPanel(0xcfe8ff, 2.6, 1.6, 3, 2.88, 1.4, 0); // slush machine and cold drinks
    sign('ICE · SNACKS · LOTTO', q.X, q.Y + 2.4, q.Z - 3.84, 0, { w: 5, h: 0.7, color: '#d8342c', bg: '#f4f4f0', size: 0.9, glow: false });
    q.window(-2.4, 3.72, 2.8, 1.6, 1.7, Math.PI);
    q.light(0, 2.9, 0, 0xfff6e0, 40, 12);
    clerk(q, 0, -3.1, 0, {});
  }
  { // a showroom: the car of the year on a turntable, a desk for the deal, balloons
    const q = rooms.SHOWROOM = room(20, 14, 4.2, { floorTint: 0xf4f4f0, floorScale: 3, wallTint: 0xf4f4f0, ceil: 0xdfe5ea, doorX: -8 });
    put(M.plain, new THREE.CylinderGeometry(3.6, 3.8, 0.3, 24).translate(q.X + 2, q.Y + 0.15, q.Z - 1), 0x2f56c8); collide(q.X + 2, q.Z - 1, 7, 7, 0.4);
    q.showcar = { x: q.X + 2, z: q.Z - 1, h: Math.PI / 4 };
    q.block(0xf4f4f0, 2.4, 0.76, 1.2, -6, -3, M.plain, 0); q.block(0x1c1c22, 0.5, 0.4, 0.4, -6, -3, M.plain, 0, 0.76);
    for (const [x, z] of [[-6, -1.4], [-6.8, -4.6], [-5.2, -4.6]]) { slab(0x8a1c1c, 0.5, 0.06, 0.5, q.X + x, q.Y + 0.46, q.Z + z); post(0x1c1c22, 0.03, 0.46, q.X + x, q.Y, q.Z + z, 4); }
    for (let n = 0; n < 8; n++) { const x = -8 + n * 2.3, hex = [0xd8342c, 0xf2c230, 0x2f56c8, 0xff5fd2][n % 4]; ball(hex, 0.3, q.X + x, q.Y + 3.4, q.Z - 6.4); post(0xf4f4f0, 0.004, 1.6, q.X + x, q.Y + 1.8, q.Z - 6.4, 3); }
    sign(['SUNSHINE AUTOS', '0% APR · NO MONEY DOWN'], q.X, q.Y + 3.2, q.Z - 6.84, 0, { w: 9, h: 1.6, color: '#ffe066', bg: '#2f56c8', size: 0.6 });
    for (const x of [-4, 0, 4]) q.window(x, 6.72, 4.4, 2.4, 1.8, Math.PI);
    q.light(2, 3.9, -1, 0xffffff, 140, 22); q.light(-6, 3.6, -3, 0xfff0d0, 60, 14);
    clerk(q, -6, -4, 0, { jacket: 0xf2c230, shirt: 0xf4f4f4, tie: 0x2f56c8, tucked: true, pants: 0xf2c230, glasses: 'shades' });
  }
  { // a church: pews down a long nave, the altar under a window, candles
    const q = rooms.CHURCH = room(14, 26, 7, { floor: M.paver, floorTint: 0xb9a58a, wall: M.gravel, wallTint: 0xf4f2ee, ceil: 0xd8d0c4 });
    for (let n = 0; n < 7; n++) for (const s of [-1, 1]) { q.block(0x8a5a44, 4.6, 0.5, 0.5, s * 3.6, -8 + n * 2.4, M.wood, 1); q.block(0x8a5a44, 4.6, 1, 0.1, s * 3.6, -8.25 + n * 2.4, M.wood, 1); }
    slab(0x8a1c1c, 2.4, 0.02, 24, q.X, q.Y + 0.01, q.Z); // the runner
    q.block(0xd8d0c4, 12, 0.4, 5, 0, -10, M.gravel, 2); q.block(0xf4f4f0, 3, 1.1, 1.2, 0, -11, M.plain, 0, 0.4); slab(0xd9a520, 0.1, 1.4, 0.1, q.X, q.Y + 1.6, q.Z - 11); slab(0xd9a520, 0.6, 0.1, 0.1, q.X, q.Y + 2.6, q.Z - 11);
    for (const s of [-1, 1]) for (let n = 0; n < 5; n++) { post(0xf4f4f0, 0.02, 0.3, q.X + s * (2.4 + n * 0.3), q.Y + 0.42, q.Z - 11.5, 5); ball(0xffe066, 0.04, q.X + s * (2.4 + n * 0.3), q.Y + 0.75, q.Z - 11.5, M.glow); }
    q.glowPanel(0xff8a5c, 3, 4, 0, -12.84, 4.2); for (const s of [-1, 1]) for (let n = 0; n < 4; n++) q.window(s * 6.72, -8 + n * 5, 1.4, 3, 3.4, s * Math.PI / 2, 0xffb86a);
    for (const s of [-1, 1]) q.block(0x3a2418, 0.5, 2.6, 0.5, s * 2.2, 11.4, M.wood, 1); // the holy water fonts become pillars by the door
    q.light(0, 5.5, -8, 0xffd9a8, 140, 24); q.light(0, 5.5, 3, 0xffe8c8, 120, 24);
    q.clerk = q.person('priest', 0.8, -9.3, Math.PI); q.till = q.at(0.8, -7.6);
    q.person(pick(PED_ROOM_LOOKS), -3.6, 1.6, Math.PI, 'sit');
  }
  if (!LA) { // an office: desks, a filing cabinet, a water cooler, a calendar of the wrong year
    const q = rooms.OFFICE = room(12, 10, 3.2, { floor: M.gravel, floorTint: 0x6f6a66, wallTint: 0xdfe5ea });
    q.block(0x3a2418, 2.2, 0.76, 1.1, -2.5, -2.5, M.wood, 1); q.block(0x1c1c22, 0.5, 0.4, 0.4, -2.2, -2.5, M.plain, 0, 0.76); slab(0xe9e2cf, 0.4, 0.03, 0.3, q.X - 3.2, q.Y + 0.77, q.Z - 2.5);
    q.block(0x3a2418, 2.2, 0.76, 1.1, 3, -2.5, M.wood, 1); q.block(0x8a8d96, 0.8, 1.4, 0.6, 5.3, -4.3); q.block(0xcfe8ff, 0.4, 0.8, 0.4, 5.3, 2, M.plain, 0, 1); post(0x8a8d96, 0.2, 1, q.X + 5.3, q.Y, q.Z + 2, 8);
    for (const [x, z] of [[-2.5, -1.4], [3, -1.4], [-2.5, -3.6]]) { slab(0x2f4a44, 0.5, 0.06, 0.5, q.X + x, q.Y + 0.46, q.Z + z); post(0x1c1c22, 0.03, 0.46, q.X + x, q.Y, q.Z + z, 4); }
    slab(0xe9e2cf, 0.6, 0.8, 0.04, q.X, q.Y + 1.8, q.Z - 4.84, M.plain); slab(0xf4f4f0, 1.2, 0.8, 0.04, q.X - 4, q.Y + 2, q.Z - 4.84, M.plain); // calendar, whiteboard
    q.window(2, 4.72, 3, 1.4, 1.8, Math.PI);
    q.light(0, 2.9, -1, 0xfff6e0, 40, 12);
    clerk(q, 3, -3.4, 0, { body: 'female', hair: 0x9a9690, hairMesh: 'long', glasses: 'clear', age: 0.7 });
  }
  { // Vesuvio: the dining room, white cloths, a bar, murals of the bay, the kitchen door
    const q = rooms.VESUVIO = room(18, 14, 3.8, { floor: M.paver, floorTint: 0xb9a58a, wall: M.gravel, wallTint: 0xf6e6c6, ceil: 0xf6f1e6, doorX: 4 });
    for (const [x, z] of [[-5, -2], [-1, -2], [-5, 2], [-1, 2], [3, 1], [-5, 5], [-1, 5]]) table(q, x, z, 0xffffff, true);
    counter(q, 4.5, -5.2, 7, 0x3a2418, 0); q.block(0x3a2418, 7, 2, 0.3, 4.5, -6.6, M.wood, 2, 1); for (let n = 0; n < 12; n++) post(BOTTLES[n % 6], 0.05, 0.35, q.X + 1.4 + n * 0.55, q.Y + 1.5 + (n % 2) * 0.7, q.Z - 6.4, 6);
    for (const x of [-6, -1.5]) q.glowPanel(0x9fd0f5, 3.6, 1.6, x, -6.84, 2.2); // murals of the bay, lit
    for (const x of [-6, -1.5]) slab(0x8a5a44, 3.8, 1.8, 0.06, q.X + x, q.Y + 1.3, q.Z - 6.86);
    q.block(0x55525a, 1.4, 2.6, 0.1, 7.5, -6.7); q.kitchen = q.at(7.5, -5.4);
    for (const [x, z] of [[-7.5, -5], [7.8, 3]]) { post(0xb9a58a, 0.3, 0.8, q.X + x, q.Y, q.Z + z, 10); put(M.plain, new THREE.ConeGeometry(0.6, 2, 7).translate(q.X + x, q.Y + 1.6, q.Z + z), 0x2c5a34); }
    sign('Vesuvio', q.X + 4.5, q.Y + 3.38, q.Z - 6.84, 0, { w: 3.2, h: 0.7, color: '#ffe066', bg: '#3a1414', font: '"Mr Dafoe", cursive', size: 0.86 });
    for (const x of [-5, 0]) q.window(x, 6.72, 4, 2, 1.9, Math.PI);
    q.light(-3, 3.3, 0, 0xffd9a8, 90, 18); q.light(4.5, 3.3, -4, 0xffb060, 50, 14);
    q.clerk = q.person('artie', 4.5, -5.9, 0); q.clerk.set('talk'); q.till = q.at(4.5, -4.2);
    q.person(pick(PED_ROOM_LOOKS), -5.9, -2, Math.PI / 2, 'sit');
    q.person(pick(PED_ROOM_LOOKS), -0.1, 2, -Math.PI / 2, 'sit');
  }
  { // Bean Scene: an espresso bar with chalkboards, mismatched sofas and a magazine rack
    const q = rooms.BEAN = room(12, 10, 3.4, { floor: M.wood, floorTint: 0xb98a5e, wall: M.brick, wallTint: 0xd8c8b4, wallScale: 2, ceil: 0x3a3a44 });
    counter(q, 1, -3, 7, 0x1f6b4a, 0); q.block(0xc9cbd2, 1.2, 0.7, 0.8, 3, -3, M.plain, 0, 1.05); q.glowPanel(0xff5fd2, 0.9, 0.3, 3, -2.58, 1.5); // the espresso machine
    for (let n = 0; n < 8; n++) slab([0xf4f4f0, 0x1f6b4a, 0xffe066][n % 3], 0.18, 0.2, 0.18, q.X - 2.5 + n * 0.5, q.Y + 1.1, q.Z - 3.3);
    slab(0x1c1c22, 5, 1.6, 0.06, q.X + 1, q.Y + 1.6, q.Z - 4.84, M.plain); sign(['ESPRESSO 1.50  LATTE 2.75', 'BISCOTTI  ·  CANNOLI'], q.X + 1, q.Y + 2.4, q.Z - 4.8, 0, { w: 4.6, h: 1.4, color: '#f4f4f0', bg: '#1c1c22', font: '"Mr Dafoe", cursive', size: 0.5, glow: false });
    q.block(0x8a2f3a, 2.4, 0.55, 1, -3.5, 1.5); q.block(0x8a2f3a, 2.4, 0.5, 0.3, -3.5, 1, M.plain, 0, 0.55); q.block(0x3a2418, 1, 0.4, 0.6, -3.5, 2.8, M.wood, 1);
    table(q, 3, 2, 0x1f6b4a, false); table(q, 0, 2.6, 0x1f6b4a, false);
    q.block(0x3a2418, 0.3, 1.4, 2, -5.6, -1.5, M.wood, 1); for (let n = 0; n < 6; n++) slab(GOODS[n % 6], 0.03, 0.4, 0.3, q.X - 5.4, q.Y + 0.4 + (n % 2) * 0.6, q.Z - 2.3 + Math.floor(n / 2) * 0.6); // the magazines
    q.window(-2.5, 4.72, 3.6, 1.8, 1.8, Math.PI);
    q.light(0, 3, 0, 0xffe8c8, 40, 12);
    clerk(q, 0, -3.9, 0, { body: 'female', hair: 0x2b1b12, hairMesh: 'long', shirt: 0x1f6b4a, tee: true });
    q.person(pick(PED_ROOM_LOOKS), -3.2, 1.5, 0, 'sit');
  }
  { // F-Note Records: a lobby of gold records, a receptionist, a mixing desk through the glass
    const q = rooms.FNOTE = room(14, 10, 3.6, { floor: M.gravel, floorTint: 0x5a4a66, wallTint: 0xf5f5f0, ceil: 0x16161c });
    counter(q, 0, -2.6, 5, 0x16161c, 0); slab(0x49e0d0, 5.2, 0.06, 0.1, q.X, q.Y + 1.0, q.Z - 2.15, M.glow);
    for (let n = 0; n < 8; n++) { slab(0x16161c, 0.8, 0.8, 0.05, q.X - 5.6 + n * 1.6, q.Y + 2, q.Z - 4.84, M.plain); put(M.plain, new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20).rotateX(Math.PI / 2).translate(q.X - 5.6 + n * 1.6, q.Y + 2.4, q.Z - 4.8), n % 3 ? 0xd9a520 : 0xc9cbd2); }
    q.block(0x16161c, 5, 2.6, 0.3, 4, -4.7); q.glowPanel(0x9fd0f5, 4.4, 1.4, 4, -4.52, 2); slab(0x3a3a44, 4, 0.4, 1, q.X + 4, q.Y + 0.8, q.Z - 4.2); for (let n = 0; n < 16; n++) slab([0xd8342c, 0x49e0d0, 0xffe066][n % 3], 0.1, 0.05, 0.1, q.X + 2.2 + n * 0.24, q.Y + 1.2, q.Z - 4.2, M.glow); // the studio, through glass
    for (const s of [-1, 1]) { q.block(0x2f4a44, 2.2, 0.5, 0.9, s * 4.5, 2.5); q.block(0x2f4a44, 2.2, 0.5, 0.3, s * 4.5, 2.1, M.plain, 0, 0.5); }
    q.block(0x16161c, 1, 0.4, 1, 0, 2.8, M.plain, 0); for (let n = 0; n < 3; n++) slab(0xe9e2cf, 0.3, 0.02, 0.4, q.X - 0.3 + n * 0.3, q.Y + 0.41, q.Z + 2.8);
    sign('F-Note Records', q.X - 2, q.Y + 3, q.Z - 4.84, 0, { w: 5, h: 1.1, color: '#49e0d0', bg: '#16161c', font: '"Mr Dafoe", cursive', size: 0.8 });
    q.window(-3, 4.72, 3, 1.6, 1.8, Math.PI);
    q.light(0, 3.2, -1, 0xcfe8ff, 40, 14); q.light(0, 3.2, 2.5, 0xffd9a8, 24, 12);
    clerk(q, 0, -3.6, 0, { body: 'female', dark: true, hair: 0x111111, hairMesh: 'long', shirt: 0x49e0d0, sleeves: 'long' });
  }
  { // Bonpensiero Bros.: a car up on the lift, tool chests, tyres, a girlie calendar
    const q = rooms.BODYSHOP = room(18, 14, 5, { floor: M.asphalt, floorTint: 0x6a6870, floorScale: 5, wall: M.brick, wallTint: 0x9a8a84, wallScale: 2, ceil: 0x3a3a44, doorX: 6 });
    for (const s of [-1, 1]) { for (const t of [-1, 1]) q.block(0xd8342c, 0.35, 1.7, 0.35, -3 + s * 1.5, -1.5 + t * 1.6); slab(0xd8342c, 0.3, 0.15, 3.6, q.X - 3 + s * 1.5, q.Y + 1.55, q.Z - 1.5); slab(0xd8342c, 3.4, 0.12, 0.3, q.X - 3, q.Y + 1.58, q.Z - 1.5 + s * 1.2); } // the two-post lift
    q.lift = { x: q.X - 3, z: q.Z - 1.5, h: 0, y: q.Y + 1.7 }; collide(q.X - 3, q.Z - 1.5, 3.4, 3.6, 1.7);
    q.block(0xd8342c, 1.6, 1.2, 0.8, 5, -5.6); q.block(0xd8342c, 1.6, 1.2, 0.8, 7, -5.6); for (let n = 0; n < 8; n++) slab(0xc9cbd2, 0.1, 0.04, 0.3, q.X + 4.4 + n * 0.3, q.Y + 1.21, q.Z - 5.6); // tool chests
    for (const [x, z, n] of [[-7.5, -5.5, 4], [-6.6, -5.3, 2], [7.5, 4, 3]]) for (let k = 0; k < n; k++) put(M.plain, new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12).translate(q.X + x, q.Y + 0.12 + k * 0.25, q.Z + z), 0x17171b);
    q.block(0x8a8d96, 1.2, 2, 0.8, -7.6, 1); q.block(0x2f56c8, 0.6, 1.2, 0.6, 7.6, 1); slab(0x1c1c22, 0.08, 0.5, 0.08, q.X + 7.6, q.Y + 1.2, q.Z + 1); // the compressor and the welding bottle
    slab(0xffd3a1, 0.7, 1, 0.04, q.X + 2, q.Y + 2.4, q.Z - 6.84, M.plain); slab(0xff5fd2, 0.5, 0.6, 0.02, q.X + 2, q.Y + 2.5, q.Z - 6.8, M.glow); // the calendar
    sign(['BONPENSIERO BROS.', 'NO JOB TOO SMALL'], q.X - 3, q.Y + 3.8, q.Z - 6.84, 0, { w: 6, h: 1.4, color: '#f2c230', bg: '#8a1c1c', size: 0.6, glow: false });
    for (let n = 0; n < 3; n++) slab(0xffe2a6, 1.4, 0.08, 0.3, q.X - 5 + n * 5, q.Y + 4.85, q.Z - 1, M.glow);
    q.light(-3, 4.4, -1.5, 0xffe2a6, 150, 24); q.light(5, 4.4, 3, 0xffe2a6, 90, 20);
    clerk(q, 6, -4.6, 0, { shirt: 0x2f56c8, sleeves: 'long', tucked: true, pants: 0x2f56c8, hat: 'cap', hatColor: 0x8a1c1c, stubble: 0.5 });
  }
  { // the motel office: a desk with a bell, keys on hooks, a television in the corner, a sign about checkout
    const q = rooms.MOTEL = room(10, 8, 3.2, { floor: M.gravel, floorTint: 0xb9a58a, wallTint: 0xffd3a1 });
    counter(q, 0, -2.4, 6, 0x3a2418, 0); ball(0xd9a520, 0.08, q.X + 1.5, q.Y + 1.2, q.Z - 2.4); slab(0xe9e2cf, 0.6, 0.02, 0.4, q.X - 1, q.Y + 1.14, q.Z - 2.4);
    slab(0x3a2418, 4, 1.6, 0.1, q.X, q.Y + 1.4, q.Z - 3.84, M.wood, 1); for (let n = 0; n < 20; n++) ball(n % 3 ? 0xd9a520 : 0x3a2418, 0.04, q.X - 1.8 + (n % 10) * 0.4, q.Y + 2.6 - Math.floor(n / 10) * 0.6, q.Z - 3.76); // the keys
    q.block(0x1c1c22, 0.9, 0.7, 0.5, 4.2, -3.4, M.plain, 0, 1.2); q.glowPanel(0x9fd0f5, 0.7, 0.5, 4.2, -3.14, 1.55); q.block(0x3a2418, 1, 1.2, 0.6, 4.2, -3.4, M.wood, 1);
    q.block(0x8a2f3a, 2, 0.5, 0.8, -3.5, 2.2); q.block(0x8a2f3a, 2, 0.5, 0.3, -3.5, 1.8, M.plain, 0, 0.5); post(0x2f7d46, 0.4, 0.9, q.X + 4.2, q.Y + 0.4, q.Z + 2.8, 8);
    sign(['CHECKOUT 11 AM', 'NO REFUNDS · NO VISITORS'], q.X - 3, q.Y + 2.4, q.Z - 3.84, 0, { w: 3, h: 1.1, color: '#1c1c22', bg: '#f4f4f0', size: 0.55, glow: false });
    q.window(2, 3.72, 3, 1.4, 1.7, Math.PI, 0xffd9a8);
    q.light(0, 2.9, 0, 0xffe8c8, 34, 12);
    clerk(q, 0, -3.2, 0, { hairStyle: 'balding', hairMesh: undefined, age: 0.7, pattern: 'plaid', shirt: 0x8d93cc, sleeves: undefined });
  }
  { // Green Grove: a lobby with a reception desk, armchairs, a piano nobody plays, residents
    const q = rooms.GROVE = room(16, 12, 3.8, { floor: M.gravel, floorTint: 0x9a8a7a, wallTint: 0xfff1c9, ceil: 0xf6f1e6 });
    counter(q, 4, -4, 6, 0xd8d0c4, 0); slab(0x2f7d46, 0.5, 0.5, 0.5, q.X + 6, q.Y + 1.13, q.Z - 4);
    for (const [x, z, h] of [[-5, -2, Math.PI / 2], [-2, -2, -Math.PI / 2], [-5, 2, Math.PI / 2], [-2, 2, -Math.PI / 2]]) { q.block(0x8a6f8f, 1, 0.5, 1, x, z, M.plain, 0); put(M.plain, new THREE.BoxGeometry(1, 0.9, 0.2).translate(0, 0.95, -0.45).rotateY(h).translate(q.X + x, q.Y, q.Z + z), 0x8a6f8f); }
    q.block(0x3a2418, 1.2, 0.5, 1.2, -3.5, 0, M.wood, 1); ball(0xff5fd2, 0.2, q.X - 3.5, q.Y + 0.7, q.Z);
    q.block(0x16161c, 1.6, 1.1, 2.4, 6.2, 2.5, M.plain, 0); q.block(0x16161c, 0.4, 0.5, 0.4, 5.2, 2.5, M.plain, 0); // the piano
    for (let n = 0; n < 4; n++) slab(0xe9e2cf, 1, 0.7, 0.04, q.X - 5 + n * 2.4, q.Y + 2.2, q.Z - 5.84, M.plain);
    slab(0x8a8d96, 0.05, 0.05, 6, q.X + 7.6, q.Y + 0.9, q.Z - 1); // the handrail along the corridor wall
    sign(['GREEN GROVE', 'TODAY: BINGO 3 PM · MASS 5 PM'], q.X + 4, q.Y + 2.8, q.Z - 5.84, 0, { w: 5, h: 1.2, color: '#1f5a3a', bg: '#f3efe6', size: 0.55, glow: false });
    q.window(-3, 5.72, 4, 1.8, 1.9, Math.PI);
    q.light(0, 3.4, -1, 0xfff0d0, 80, 18); q.light(0, 3.4, 3, 0xfff0d0, 50, 14);
    clerk(q, 4, -4.8, 0, { body: 'female', shirt: 0x9fd0f5, sleeves: 'long' });
    q.person('fanny', -4.9, -2, Math.PI / 2, 'sit');
    q.person(pick(OLD_LOOKS), -2.1, 2, -Math.PI / 2, 'sit');
  }
  { // Verbum Dei: a corridor of lockers, a trophy case, the notice board
    const q = rooms.SCHOOL = room(18, 8, 3.4, { floor: M.paver, floorTint: 0xd8e2e6, wallTint: 0xf4f4f0, ceil: 0xf6f1e6 });
    for (let n = 0; n < 14; n++) { slab(n % 2 ? 0x2f56c8 : 0x2a4ab0, 0.9, 1.9, 0.5, q.X - 7 + n * 1.1, q.Y, q.Z - 3.6); slab(0xc9cbd2, 0.05, 0.3, 0.02, q.X - 7 + n * 1.1 + 0.3, q.Y + 1.2, q.Z - 3.34); } collide(q.X - 0.5, q.Z - 3.6, 15.4, 0.5, 2);
    q.block(0x3a2418, 3, 2.2, 0.6, 6.6, 2.5, M.wood, 1); q.glowPanel(0xd6ecf5, 2.6, 1.6, 6.6, 2.18, 1.3); for (let n = 0; n < 5; n++) { post(0xd9a520, 0.06, 0.3, q.X + 5.6 + n * 0.5, q.Y + 0.8 + (n % 2) * 0.5, q.Z + 2.4, 8); ball(0xd9a520, 0.08, q.X + 5.6 + n * 0.5, q.Y + 1.15 + (n % 2) * 0.5, q.Z + 2.4); } // the trophies
    slab(0x8a5a44, 2.4, 1.4, 0.06, q.X - 5, q.Y + 1.2, q.Z + 3.72, M.plain); for (let n = 0; n < 6; n++) slab([0xf4f4f0, 0xffe066, 0xff5fd2][n % 3], 0.4, 0.5, 0.02, q.X - 6 + (n % 3) * 0.8, q.Y + 1.4 + Math.floor(n / 3) * 0.5, q.Z + 3.68, M.plain); // notices
    slab(0xd8342c, 0.6, 0.8, 0.5, q.X - 8, q.Y, q.Z + 3); for (let n = 0; n < 3; n++) slab(0x1c1c22, 0.9, 1.9, 0.5, q.X + 7 + n * 0.0, q.Y, q.Z - 3.6);
    sign('VERBUM DEI  ·  CLASS OF 1999', q.X, q.Y + 3, q.Z - 3.84, 0, { w: 7, h: 0.8, color: '#f6e7b4', bg: '#2c3a5a', size: 0.8, glow: false });
    q.light(-4, 3, 0, 0xf0f6ff, 40, 14); q.light(4, 3, 0, 0xf0f6ff, 40, 14);
    q.person(pick(KID_LOOKS), -2, 0, Math.PI / 2, 'talk'); q.person(pick(KID_LOOKS), -0.6, 0, -Math.PI / 2);
  }

  if (!LA) { // Upstairs at the Sopranos': the master bedroom, AJ's room and Meadow's, off a landing. Reached by the stairs in the den.
    const q = rooms.UPSTAIRS = room(18, 11, 3.1, { floor: M.gravel, floorTint: 0xb9a58a, wallTint: 0xf3e9d8, door: 0xf3e9d8, at: [2840, -24] });
    for (const x of [-1.5, 3.8]) { q.block(0xf3e9d8, 0.2, 3.1, 7, x, -1.8, M.gravel, 3); } // the walls between the rooms; each is open to the landing
    // The master bedroom: the big bed, two night tables, a dresser with a television on it.
    q.block(0x8a5a44, 2.4, 0.45, 2.6, -5.8, -3.4, M.wood, 1); slab(0xf1ede4, 2.3, 0.2, 2.5, q.X - 5.8, q.Y + 0.45, q.Z - 3.4); slab(0x7a1626, 2.3, 0.06, 1.5, q.X - 5.8, q.Y + 0.65, q.Z - 2.9);
    slab(0x8a5a44, 2.5, 1.1, 0.14, q.X - 5.8, q.Y, q.Z - 4.78); for (const sx of [-0.55, 0.55]) slab(0xffffff, 0.8, 0.16, 0.5, q.X - 5.8 + sx, q.Y + 0.65, q.Z - 4.3);
    for (const sx of [-1.7, 1.7]) { q.block(0x5a3320, 0.6, 0.55, 0.5, -5.8 + sx, -4.5, M.wood, 1); put(M.glow, new THREE.ConeGeometry(0.2, 0.3, 10, 1, true).translate(q.X - 5.8 + sx, q.Y + 0.95, q.Z - 4.5), 0xffe2a6); }
    q.block(0x5a3320, 2.2, 0.9, 0.6, -5.8, 1.4, M.wood, 1); slab(0x1c1c22, 1, 0.7, 0.4, q.X - 5.8, q.Y + 0.9, q.Z + 1.4); q.glowPanel(0x9fd0f5, 0.8, 0.5, -5.8, 1.19, 1.25, Math.PI);
    q.window(-8.72, -2, 2.4, 1.4, 1.7, Math.PI / 2, 0xffd9a8);
    // AJ's room: an unmade bed, a television with a console, a drum kit he never practises on.
    q.block(0x3b6ea8, 1.1, 0.4, 2.1, 0.2, -3.7); slab(0xf1ede4, 1, 0.14, 0.5, q.X + 0.2, q.Y + 0.4, q.Z - 4.5); slab(0x2f56c8, 1.05, 0.07, 1.3, q.X + 0.2, q.Y + 0.4, q.Z - 3.2);
    q.block(0x1c1c22, 0.9, 0.5, 0.5, 2.9, -4.5); slab(0x1c1c22, 0.8, 0.6, 0.4, q.X + 2.9, q.Y + 0.5, q.Z - 4.5); q.glowPanel(0x7dffb0, 0.65, 0.45, 2.9, -4.28, 0.8); slab(0x8d8a8e, 0.3, 0.06, 0.2, q.X + 2.9, q.Y + 0.02, q.Z - 3.7);
    for (const [dx, dz, rr] of [[2.6, -1.2, 0.3], [3.1, -0.6, 0.22], [2.2, -0.5, 0.2]]) put(M.plain, new THREE.CylinderGeometry(rr, rr, 0.3, 12).translate(q.X + dx, q.Y + 0.55, q.Z + dz), 0xd8342c);
    for (let n = 0; n < 3; n++) slab([0xd8342c, 0x1c1c22, 0xf2c230][n], 0.7, 0.9, 0.03, q.X - 0.8 + n * 1.1, q.Y + 1.6, q.Z - 5.32, M.plain); // posters
    // Meadow's room: a made bed, a desk with a computer, a shelf of books, pink where she allows it.
    q.block(0xf7a8c4, 1.1, 0.4, 2.1, 5.2, -3.7); slab(0xffffff, 1, 0.14, 0.5, q.X + 5.2, q.Y + 0.4, q.Z - 4.5); slab(0xc9b6f2, 1.05, 0.07, 1.3, q.X + 5.2, q.Y + 0.4, q.Z - 3.2);
    q.block(0xe9e2d2, 1.6, 0.74, 0.7, 7.6, -1.5, M.wood, 1); slab(0xe9e2cf, 0.5, 0.42, 0.45, q.X + 7.6, q.Y + 0.74, q.Z - 1.5); q.glowPanel(0x9fd0f5, 0.36, 0.28, 7.36, -1.5, 0.96, -Math.PI / 2); slab(0x5a3320, 0.45, 0.06, 0.45, q.X + 6.7, q.Y + 0.45, q.Z - 1.5);
    q.block(0xe9e2d2, 0.4, 1.8, 1.6, 8.3, -4, M.wood, 1); for (let n = 0; n < 10; n++) slab(PASTELS[n % 8], 0.22, 0.3, 0.12, q.X + 8.08, q.Y + 0.5 + Math.floor(n / 5) * 0.6, q.Z - 4.6 + (n % 5) * 0.28);
    for (let n = 0; n < 2; n++) slab([0xff5fd2, 0x49e0d0][n], 0.7, 0.9, 0.03, q.X + 5 + n * 1.2, q.Y + 1.6, q.Z - 5.32, M.plain);
    // The landing: a runner, the stairhead, family photographs.
    slab(0x8a2f3a, 15, 0.02, 1.4, q.X, q.Y + 0.01, q.Z + 3.8); for (let n = 0; n < 6; n++) slab(0xe9e2cf, 0.5, 0.6, 0.03, q.X - 6 + n * 2.2, q.Y + 1.7, q.Z + 5.32, M.plain);
    q.light(-5.8, 2.8, -2, 0xffe8c8, 34, 13); q.light(1.2, 2.8, -2.4, 0xfff0d0, 24, 10); q.light(6, 2.8, -2.4, 0xffe0ec, 24, 10); q.light(0, 2.8, 3.6, 0xfff0d0, 22, 12);
    q.person('aj', 2.4, -3.2, 0).set('idle');
    q.person('meadow', 6.7, -1.5, Math.PI / 2, 'sit');
    const H = places.houseRoom.inside; // (X + 2, Z + 3.2) of the downstairs room
    places.stairs = [{ a: { x: H.x + 4.1, z: H.z - 0.7, h: -Math.PI / 2 }, b: { x: q.X + 7.6, z: q.Z + 3.8, h: -Math.PI / 2 }, up: 'Go upstairs', down: 'Go downstairs' }];
    places.beds = [{ x: q.X - 4.2, z: q.Z - 3.2, name: 'Sleep' }];
  }

  // ----- Los Angeles has its own rooms: the same kinds of place, laid out and dressed differently -----
  if (LA) {
    const BOOKS = [0x8a1c1c, 0x1f3a2c, 0x2c3a5a, 0xd9c7a0, 0x5a3320, 0x16161c, 0xb5523b];
    { // a cocktail lounge: long and narrow, the bar down the west wall, red booths down the east, a little stage at the far end
      const q = rooms.BAR = room(12, 18, 3.6, { floor: M.gravel, floorTint: 0x3a2a34, floorScale: 4, wall: M.wood, wallTint: 0x2a2030, ceil: 0x14101a });
      counter(q, -4.2, -2, 11, 0x1c1418, Math.PI / 2);
      q.block(0x14080f, 0.3, 2.4, 11, -5.6, -2, M.plain, 0, 1); q.glowPanel(0x4a6fd0, 10.4, 0.8, -5.42, -2, 2.4, Math.PI / 2);
      for (let n = 0; n < 20; n++) post([0xd9a520, 0x6fb0ff, 0xc8312a, 0xe9e2cf][n % 4], 0.05, 0.3 + (n % 3) * 0.05, q.X - 5.4, q.Y + 1.5 + (n % 2) * 0.7, q.Z - 7 + n * 0.52, 6);
      for (let n = 0; n < 7; n++) { post(0xc9cbd2, 0.04, 0.75, q.X - 3.1, q.Y, q.Z - 6.6 + n * 1.5); post(0x1c1c22, 0.22, 0.08, q.X - 3.1, q.Y + 0.75, q.Z - 6.6 + n * 1.5, 10); }
      for (let n = 0; n < 4; n++) { const z = -6 + n * 3.4; q.block(0x8a1c2a, 1, 1.2, 1.1, 5, z - 1); q.block(0x8a1c2a, 1, 1.2, 1.1, 5, z + 1); q.block(0x1c1418, 0.9, 0.75, 0.8, 5, z, M.plain, 0); ball(0xffb060, 0.07, q.X + 5, q.Y + 0.85, q.Z + z, M.glow); }
      q.block(0x14080f, 5, 0.35, 2.6, 1.5, -7.3, M.plain, 0); post(0xc9cbd2, 0.02, 1.4, q.X + 1.5, q.Y + 0.35, q.Z - 7, 5); ball(0x1c1c22, 0.06, q.X + 1.5, q.Y + 1.8, q.Z - 7); // the stage and its microphone
      q.glowPanel(0xff3b4a, 2.4, 0.5, 1.5, -8.82, 2.6); q.glowPanel(0x6fb0ff, 0.5, 0.9, 5.82, 5.5, 2.2, -Math.PI / 2);
      sign(['COCKTAILS', 'LIVE JAZZ FRI · SAT'], q.X + 3.6, q.Y + 2.9, q.Z - 8.84, 0, { w: 3, h: 1, color: '#6fb0ff', bg: '#14101a', size: 0.6 });
      q.block(0x8d8a8e, 0.8, 1.6, 0.6, -5, 7.6); // the cigarette machine
      q.light(-3, 3.2, -2, 0x6f8fff, 40, 14); q.light(4, 3.2, 0, 0xff5a4a, 30, 12); q.light(1.5, 3.2, -6.5, 0xffe2a6, 26, 9);
      clerk(q, -5, -2, Math.PI / 2, { shirt: 0x16161c, open: undefined, tie: 0x8a1c1c });
      q.person(pick(PED_ROOM_LOOKS), -3.1, -5.1, -Math.PI / 2); q.person(pick(OLD_LOOKS), 5, 1.4, Math.PI, 'sit');
    }
    { // a coffee shop out of the fifties: an island counter with stools all round, booths under the windows, orange and teal
      const q = rooms.DINER = room(22, 12, 3.6, { floor: M.paver, floorTint: 0xd9c7a0, wallTint: 0x8fd0c8, ceil: 0xfff1c9 });
      for (const [x, z, w, d] of [[0, -3.4, 9, 0.8], [0, -0.2, 9, 0.8], [-4.1, -1.8, 0.8, 2.4], [4.1, -1.8, 0.8, 2.4]]) { q.block(0xf08a3c, w, 1.05, d, x, z, M.plain, 0); slab(0xf4f4f0, w + 0.2, 0.06, d + 0.2, q.X + x, q.Y + 1.05, q.Z + z); }
      for (let n = 0; n < 6; n++) { post(0xc9cbd2, 0.04, 0.7, q.X - 3.3 + n * 1.32, q.Y, q.Z + 0.75); post(0x1f9c8f, 0.22, 0.1, q.X - 3.3 + n * 1.32, q.Y + 0.7, q.Z + 0.75, 10); }
      q.block(0xc9cbd2, 1.2, 1.5, 0.7, -2, -1.8, M.plain, 0); q.block(0xc9cbd2, 0.7, 1.3, 0.6, 2, -1.8, M.plain, 0); q.glowPanel(0xffe066, 0.5, 0.4, 2, -1.48, 1); // the grill hood and the coffee urns inside the island
      for (let n = 0; n < 4; n++) slab(0xf4f4f0, 0.5, 0.4, 0.5, q.X - 3 + n * 0.8, q.Y + 1.11, q.Z - 0.2, M.plain);
      for (let n = 0; n < 5; n++) { const x = -8.4 + n * 4.2; // booths along the window wall
        q.block(0x1f9c8f, 0.7, 1.1, 1.6, x - 0.95, 4.6); q.block(0x1f9c8f, 0.7, 1.1, 1.6, x + 0.95, 4.6); slab(0xf4f4f0, 1, 0.07, 1.5, q.X + x, q.Y + 0.72, q.Z + 4.6); post(0xc9cbd2, 0.05, 0.72, q.X + x, q.Y, q.Z + 4.6); collide(q.X + x, q.Z + 4.6, 1, 1.5, 0.8);
        if (n !== 2) q.window(x, 5.72, 3.4, 1.8, 1.9, Math.PI, 0xcfe0ff); }
      q.block(0xc9cbd2, 14, 2.2, 0.6, 0, -5.5, M.plain, 0); q.glowPanel(0xffb060, 8, 0.7, 0, -5.18, 1.6); // the kitchen pass
      sign(['COFFEE SHOP', 'BREAKFAST ALL DAY'], q.X - 7.5, q.Y + 2.8, q.Z - 5.84, 0, { w: 4.4, h: 1.2, color: '#ff8a5c', bg: '#14080f', size: 0.6 });
      q.block(0x8a1c1c, 0.9, 1.7, 0.8, 9.8, -4.8); q.glowPanel(0xfff0d0, 0.6, 0.9, 9.8, -4.38, 1); // the pie case
      q.light(0, 3.2, -1.5, 0xfff0d0, 60, 16); q.light(-7, 3.2, 3, 0xffe2a6, 30, 12); q.light(7, 3.2, 3, 0xffe2a6, 30, 12);
      clerk(q, 0, -1.8, 0, { body: 'female', shirt: 0x8fd0c8, sleeves: undefined, tee: true, hair: 0x7a3b1a, hairMesh: 'long' });
      q.till = q.at(0, 1.5);
      q.person(pick(PED_ROOM_LOOKS), 3.3, 0.9, Math.PI); q.person(pick(OLD_LOOKS), -9.35, 4.6, Math.PI / 2, 'sit');
      q.counter = { x: 0, z: 1.1 }; q.booth = { x: -4.2, z: 4.6 }; // where a scene can stand at the counter, and the second booth
    }
    { // a walk-up place: a counter with the menu over it, a soda machine, plastic tables bolted to the floor
      const q = rooms.FASTFOOD = room(12, 10, 3.2, { floor: M.paver, floorTint: 0xe6d2b4, wallTint: 0xffe066, ceil: 0xf6f1e6 });
      counter(q, 0, -2.2, 9, 0xd8342c, 0); slab(0xc9cbd2, 9.2, 0.06, 1, q.X, q.Y + 1.05, q.Z - 2.2);
      sign(['TACOS 3 FOR $2 · BURGER $1.49 · DONUTS DOZEN $3', 'COMBO NO. 1 · NO. 2 · NO. 3 · HORCHATA'], q.X, q.Y + 2.5, q.Z - 4.82, 0, { w: 9, h: 1.1, color: '#1c1c22', bg: '#fff1c9', size: 0.5, glow: false });
      q.block(0xc9cbd2, 9, 1.4, 0.7, 0, -4.4, M.plain, 0); for (let n = 0; n < 3; n++) q.glowPanel(0xffb060, 1.6, 0.5, -3 + n * 3, -4.02, 1.0);
      q.block(0x2f56c8, 1, 1.8, 0.8, 5.2, -1.8); q.glowPanel(0xd8342c, 0.7, 0.6, 4.78, -1.8, 1.3, -Math.PI / 2); slab(0x1c1c22, 0.5, 0.5, 0.5, q.X - 5.2, q.Y, q.Z - 1.4); // soda, and the bin
      for (const [x, z] of [[-3.4, 1.6], [0, 2.4], [3.4, 1.6]]) { slab(0xf4f4f0, 1.2, 0.06, 0.8, q.X + x, q.Y + 0.72, q.Z + z); post(0xc9cbd2, 0.06, 0.72, q.X + x, q.Y, q.Z + z); for (const s of [-1, 1]) slab(0xf08a3c, 0.4, 0.45, 0.4, q.X + x + s * 0.9, q.Y, q.Z + z); collide(q.X + x, q.Z + z, 1.2, 0.8, 0.8); }
      q.window(-3, 4.72, 3.4, 1.6, 1.8, Math.PI); q.window(3, 4.72, 3.4, 1.6, 1.8, Math.PI);
      q.light(0, 2.9, -1, 0xfff6e0, 50, 13); q.light(0, 2.9, 2.5, 0xfff6e0, 24, 10);
      clerk(q, 0, -3.2, 0, { shirt: 0xd8342c, sleeves: undefined, tee: true, hat: 'cap', hatColor: 0xd8342c });
      q.person(pick(PED_ROOM_LOOKS), 2.5, 1.6, -Math.PI / 2, 'sit');
    }
    { // a corner liquor store: the clerk in a booth of thick glass by the door, coolers humming along the back
      const q = rooms.LIQUOR = room(12, 12, 3.2, { floorTint: 0xb9b3ac, wallTint: 0xf4f2ee });
      q.block(0x3a3a44, 3.4, 1.1, 2.4, 4.1, 4.4, M.plain, 0); q.glowPanel(0x9fd0f5, 3.4, 1.6, 4.1, 3.18, 1.9); q.glowPanel(0x9fd0f5, 2.4, 1.6, 2.38, 4.4, 1.9, -Math.PI / 2); // the cage
      slab(0xc9cbd2, 0.5, 0.06, 0.3, q.X + 3, q.Y + 1.12, q.Z + 3.2); // the tray the money goes through
      q.block(0x1c1c22, 11, 2.3, 0.9, 0, -5.4); for (let n = 0; n < 5; n++) { q.glowPanel(0xcfe8ff, 1.9, 1.7, -4.4 + n * 2.2, -4.94, 1.3); for (let k = 0; k < 4; k++) slab(BOTTLES[(n + k) % 6], 0.35, 0.4, 0.3, q.X - 5 + n * 2.2 + k * 0.42, q.Y + 0.6 + (k % 2) * 0.7, q.Z - 5.1); }
      racks(q, -2.5, -0.6, 5, 3, BOTTLES, Math.PI / 2); racks(q, 0.8, -0.6, 5, 3, BOTTLES, Math.PI / 2); racks(q, -5.3, 0, 7, 3, GOODS, Math.PI / 2);
      sign(['LOTTO · BEER · WINE', 'NO LOITERING · NO CHECKS'], q.X - 2, q.Y + 2.7, q.Z - 5.84, 0, { w: 5, h: 1, color: '#ff5a4a', bg: '#f4f2ee', size: 0.6, glow: false });
      q.window(-2.5, 5.72, 4, 1.6, 1.8, Math.PI);
      q.light(-1, 2.9, -1, 0xf0f6ff, 55, 14);
      clerk(q, 4.3, 4.6, Math.PI, { hat: undefined, age: 0.6, glasses: 'clear' });
      q.till = q.at(2.6, 2.4);
    }
    { // a gun store with a range behind glass: counters in an L, rifles on pegboard, lanes and paper men at the back
      const q = rooms.GUNS = room(18, 12, 3.6, { floor: M.gravel, floorTint: 0x55585f, floorScale: 4, wallTint: 0xdfe2e6, ceil: 0x8d8f96 });
      counter(q, -2, -1, 9, 0x23232b, 0); counter(q, 2.9, 1.6, 4.4, 0x23232b, Math.PI / 2);
      slab(0x55707c, 9, 0.05, 0.8, q.X - 2, q.Y + 1.1, q.Z - 1, M.glow); for (let n = 0; n < 8; n++) slab(0x1c1c22, 0.34, 0.06, 0.2, q.X - 5.6 + n * 1.02, q.Y + 1.16, q.Z - 1);
      slab(0xb9a58a, 12, 2, 0.1, q.X - 2.6, q.Y + 1.1, q.Z - 5.8, M.wood, 1); // pegboard
      for (let n = 0; n < 10; n++) { slab(n % 3 ? 0x1c1c22 : 0x6a4a34, 1.05, 0.09, 0.07, q.X - 7.8 + n * 1.15, q.Y + 2.7 - (n % 2) * 0.75, q.Z - 5.7); slab(0x6a4a34, 0.28, 0.16, 0.07, q.X - 8.3 + n * 1.15, q.Y + 2.66 - (n % 2) * 0.75, q.Z - 5.7); }
      slab(0x1c1c22, 0.2, 2.4, 9, q.X + 5.6, q.Y + 0.9, q.Z - 0.5); q.glowPanel(0x6f8aa0, 8.6, 1.9, 5.48, -0.5, 2, -Math.PI / 2); // the range, through glass
      for (let n = 0; n < 4; n++) { slab(0xf4f4f0, 0.03, 0.9, 0.5, q.X + 8.4, q.Y + 1.5, q.Z - 3.6 + n * 2.1, M.plain); put(M.plain, new THREE.CircleGeometry(0.16, 10).rotateY(-Math.PI / 2).translate(q.X + 8.38, q.Y + 1.7, q.Z - 3.6 + n * 2.1), 0x1c1c22); slab(0x3a3a44, 2.4, 0.05, 0.05, q.X + 7, q.Y + 1, q.Z - 4.6 + n * 2.1); }
      for (let n = 0; n < 3; n++) { q.block(0x5c6157, 1.2, 0.9, 1.2, -7.6, 1 + n * 1.6, M.plain, 0); slab(0xd8342c, 1.1, 0.25, 1.1, q.X - 7.6, q.Y + 0.9, q.Z + 1 + n * 1.6); } // pallets of ammunition
      sign(['GUNS · AMMO · RANGE', 'CALIFORNIA: 15 DAY WAIT · (NOT TODAY)'], q.X - 2.6, q.Y + 3.2, q.Z - 5.84, 0, { w: 7, h: 0.8, color: '#f4f4f0', bg: '#23232b', size: 0.66, glow: false });
      q.window(-5, 5.72, 4, 1.6, 1.8, Math.PI);
      q.light(-2, 3.2, 1, 0xf0f6ff, 60, 16); q.light(6.5, 3.2, -0.5, 0xfff0d0, 30, 10);
      clerk(q, -2, -2.1, 0, { shirt: 0x5c6157, sleeves: undefined, tee: true, bulk: 1.3, stubble: 0.5, glasses: 'shades' });
    }
    { // a pawn shop: the counter and its cage down the east wall, televisions stacked to the ceiling, an island of jewellery
      const q = rooms.PAWN = room(14, 10, 3.4, { floor: M.gravel, floorTint: 0x6f6a66, floorScale: 3, wallTint: 0xd9c7a0, ceil: 0x55525a });
      counter(q, 4.6, -0.5, 7, 0x3a2418, Math.PI / 2); for (let n = 0; n < 9; n++) post(0x8a8d96, 0.02, 2.2, q.X + 4.1, q.Y + 1.1, q.Z - 3.7 + n * 0.8, 4);
      for (let r = 0; r < 3; r++) for (let n = 0; n < 4; n++) { slab(0x1c1c22, 0.9, 0.7, 0.7, q.X - 6.2, q.Y + r * 0.72, q.Z - 3.8 + n * 1.05); q.glowPanel([0x9fd0f5, 0x2a2a30, 0x7dffb0][(r + n) % 3], 0.6, 0.5, -5.83, -3.8 + n * 1.05, 0.36 + r * 0.72, Math.PI / 2); }
      collide(q.X - 6.2, q.Z - 2.2, 1, 4.4, 2.4);
      q.block(0x3a2418, 3, 0.9, 1.4, -1, 0.2, M.wood, 1); slab(0x55707c, 2.8, 0.06, 1.2, q.X - 1, q.Y + 0.92, q.Z + 0.2, M.glow); for (let n = 0; n < 10; n++) slab(n % 2 ? 0xd9a520 : 0xc9cbd2, 0.1, 0.05, 0.1, q.X - 2.2 + (n % 5) * 0.55, q.Y + 0.97, q.Z - 0.1 + Math.floor(n / 5) * 0.5);
      for (let n = 0; n < 5; n++) { put(M.plain, new THREE.BoxGeometry(0.3, 0.9, 0.08).translate(q.X - 3 + n * 0.7, q.Y + 2, q.Z - 4.75), [0xd8342c, 0xf2c230, 0x1c1c22, 0xf4f4f0, 0x2f56c8][n]); post(0x3a2418, 0.03, 0.7, q.X - 3 + n * 0.7, q.Y + 2.4, q.Z - 4.75, 4); }
      sign(['EZ PAWN', 'CASH FOR GOLD · TOOLS · STEREOS'], q.X + 1.6, q.Y + 2.7, q.Z - 4.84, 0, { w: 4.4, h: 1.1, color: '#ffe066', bg: '#23232b', size: 0.6 });
      q.window(-2, 4.72, 4, 1.6, 1.8, Math.PI);
      q.light(-1, 3, 0, 0xfff0d0, 45, 14);
      clerk(q, 5.6, -0.5, -Math.PI / 2, { glasses: 'clear', age: 0.5, hat: undefined });
    }
    { // a record and video store: bins down the middle, posters, a wall of tapes, a listening post
      const q = rooms.STORE = room(14, 12, 3.4, { floorTint: 0x8d8f96, wallTint: 0x16161c, ceil: 0x23232b });
      for (const x of [-3, 0, 3]) { q.block(0x5a3320, 1.4, 0.9, 7, x, -0.5, M.wood, 1); for (let n = 0; n < 12; n++) slab(GOODS[(n + x + 6) % 6], 1.2, 0.34, 0.05, q.X + x, q.Y + 0.9, q.Z - 3.6 + n * 0.56); }
      racks(q, -6.4, -1, 8, 3, [0x1c1c22, 0xd8342c, 0x2f56c8, 0xf2c230], Math.PI / 2);
      for (let n = 0; n < 5; n++) slab([0xff5a4a, 0x6fb0ff, 0xffe066, 0x7dffb0, 0xff5fd2][n], 1.3, 1.8, 0.03, q.X - 4.4 + n * 2.2, q.Y + 1.2, q.Z - 5.82, M.glow); // posters, lit
      counter(q, 5.2, 3.6, 3, 0x23232b, Math.PI / 2); slab(0x1c1c22, 0.5, 0.3, 0.4, q.X + 5.2, q.Y + 1.13, q.Z + 4.4);
      q.block(0x23232b, 0.6, 1.3, 0.6, 6.2, -4, M.plain, 0); slab(0x1c1c22, 0.08, 0.3, 0.3, q.X + 5.88, q.Y + 1.2, q.Z - 4); // the listening post
      sign(['NEW · USED · IMPORTS', 'VHS RENTAL 99¢'], q.X + 4, q.Y + 2.9, q.Z - 5.84, 0, { w: 3.6, h: 1, color: '#ff5a4a', bg: '#16161c', size: 0.6 });
      q.window(-3, 5.72, 4, 1.8, 1.9, Math.PI);
      q.light(0, 3, -1, 0xfff0d0, 50, 15); q.light(4, 3, 3.5, 0xffb060, 22, 9);
      clerk(q, 6.1, 3.6, -Math.PI / 2, { shirt: 0x16161c, sleeves: undefined, tee: true, hair: 0x7a3b1a, hairMesh: 'long' });
    }
    { // the bookstore: tall shelves in rows, a table of new arrivals, the desk by the door
      const q = rooms.BOOKS = room(14, 12, 3.6, { floor: M.wood, floorTint: 0xb98a5e, wallTint: 0xf4f2ee, ceil: 0xf6f1e6 });
      for (const x of [-5, -2, 1]) racks(q, x, -2.2, 6, 4, BOOKS, Math.PI / 2);
      racks(q, -1, -5.5, 12, 4, BOOKS, 0);
      q.block(0x5a3320, 2.6, 0.8, 1.4, -2.5, 3, M.wood, 1); for (let n = 0; n < 8; n++) slab(BOOKS[n % 7], 0.5, 0.08, 0.36, q.X - 3.4 + (n % 4) * 0.6, q.Y + 0.8 + Math.floor(n / 4) * 0.08, q.Z + 2.8 + (n % 2) * 0.4);
      counter(q, 4.6, 2.4, 3.6, 0x5a3320, Math.PI / 2); slab(0x1c1c22, 0.5, 0.3, 0.4, q.X + 4.6, q.Y + 1.13, q.Z + 3.4);
      post(0x1c1c22, 0.03, 1.5, q.X + 6.2, q.Y, q.Z - 4.6, 6); put(M.glow, new THREE.ConeGeometry(0.3, 0.4, 12, 1, true).translate(q.X + 6.2, q.Y + 1.7, q.Z - 4.6), 0xffe2a6); q.block(0x2f4a44, 0.9, 0.5, 0.9, 5.6, -3.4, M.plain, 0);
      sign(['ART · ARCHITECTURE', 'DESIGN · ENGINEERING'], q.X + 4.4, q.Y + 2.9, q.Z - 5.84, 0, { w: 3.6, h: 1, color: '#f6e7b4', bg: '#2c3a5a', size: 0.6, glow: false });
      q.window(-3, 5.72, 4, 1.8, 1.9, Math.PI);
      q.light(-2, 3.2, 0, 0xfff0d0, 50, 15); q.light(4.5, 3.2, 2, 0xffe2a6, 26, 10);
      q.desk = q.at(4.6, 2.4); q.till = q.at(3, 2.4);
      q.person(pick(OLD_LOOKS), -3.4, -0.4, Math.PI / 2);
    }
    { // a laundromat: washers down one wall, dryers down the other, a folding table, plastic chairs, a television nobody chose
      const q = rooms.LAUNDRY = room(12, 12, 3.2, { floor: M.paver, floorTint: 0xcfd8dc, wallTint: 0xcfe8ff, ceil: 0xf6f6f2 });
      for (let n = 0; n < 7; n++) { q.block(0xf4f4f0, 0.8, 1, 0.8, -5.3, -4.6 + n * 1.2, M.plain, 0); put(M.plain, new THREE.CylinderGeometry(0.24, 0.24, 0.04, 14).rotateZ(Math.PI / 2).translate(q.X - 4.88, q.Y + 0.55, q.Z - 4.6 + n * 1.2), 0x24324c); }
      for (let n = 0; n < 5; n++) for (const r of [0, 1]) { slab(0xc9cbd2, 0.9, 1, 0.9, q.X + 5.3, q.Y + r * 1.02, q.Z - 4.4 + n * 1.3); put(M.plain, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 14).rotateZ(Math.PI / 2).translate(q.X + 4.83, q.Y + 0.5 + r * 1.02, q.Z - 4.4 + n * 1.3), n === 2 && r ? 0xffb060 : 0x24324c); }
      collide(q.X + 5.3, q.Z - 1.8, 0.9, 6.4, 2.2);
      q.block(0xf4f4f0, 3, 0.9, 1.4, 0, -1.5, M.plain, 0); for (let n = 0; n < 4; n++) slab(GOODS[n], 0.5, 0.12 + n * 0.04, 0.4, q.X - 1 + n * 0.7, q.Y + 0.9, q.Z - 1.5);
      for (let n = 0; n < 4; n++) slab([0xf08a3c, 0x1f9c8f][n % 2], 0.5, 0.45, 0.5, q.X - 1.5 + n * 1, q.Y, q.Z + 2.2);
      slab(0x1c1c22, 0.9, 0.7, 0.6, q.X, q.Y + 2.3, q.Z - 5.5); q.glowPanel(0x9fd0f5, 0.7, 0.5, 0, -5.18, 2.65);
      q.block(0x8d8a8e, 0.8, 1.7, 0.6, 2.4, -5.4); sign(['WASH 75¢ · DRY 25¢', 'NO DYEING'], q.X - 3, q.Y + 2.5, q.Z - 5.84, 0, { w: 3.4, h: 0.9, color: '#2f56c8', bg: '#f4f4f0', size: 0.62, glow: false });
      q.window(0, 5.72, 6, 1.8, 1.8, Math.PI);
      q.light(0, 2.9, -1, 0xf0f6ff, 55, 14);
      q.person(pick(OLD_LOOKS), -1.5, 2.2, Math.PI, 'sit'); q.person(pick(PED_ROOM_LOOKS), 1.2, -0.3, Math.PI);
    }
    { // an auto parts counter: a wall of boxes behind it, tyres, a rack of belts, a catalogue the size of a suitcase
      const q = rooms.PARTS = room(14, 10, 3.4, { floor: M.gravel, floorTint: 0x6f6a66, floorScale: 3, wallTint: 0xf2c230, ceil: 0x8d8f96 });
      counter(q, 0, -1.6, 11, 0x23232b, 0); slab(0xe9e2cf, 0.9, 0.2, 0.6, q.X - 2, q.Y + 1.13, q.Z - 1.6); slab(0x1c1c22, 0.5, 0.3, 0.4, q.X + 3, q.Y + 1.13, q.Z - 1.6);
      racks(q, 0, -4.5, 12, 4, [0xd8342c, 0x2f56c8, 0xf4f4f0, 0x1c1c22, 0xf08a3c], 0);
      for (const [x, z, n] of [[-6, 2.5, 4], [-5.1, 2.9, 3], [-6, 3.8, 2]]) for (let k = 0; k < n; k++) put(M.plain, new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12).translate(q.X + x, q.Y + 0.12 + k * 0.25, q.Z + z), 0x17171b);
      for (let n = 0; n < 8; n++) put(M.plain, new THREE.TorusGeometry(0.22 + (n % 3) * 0.05, 0.015, 5, 14).rotateY(Math.PI / 2).translate(q.X + 6.7, q.Y + 2, q.Z - 0.5 + n * 0.5), 0x1c1c22); // belts
      q.block(0xd8342c, 1.4, 0.9, 0.7, 4, 3, M.plain, 0); for (let n = 0; n < 6; n++) post([0xd9a520, 0x1c1c22][n % 2], 0.07, 0.24, q.X + 3.5 + (n % 3) * 0.45, q.Y + 0.9, q.Z + 2.85 + Math.floor(n / 3) * 0.3, 8); // oil
      sign(['PARTS COUNTER', 'NO RETURNS ON ELECTRICAL'], q.X, q.Y + 3, q.Z - 4.84, 0, { w: 5, h: 0.8, color: '#1c1c22', bg: '#f2c230', size: 0.66, glow: false });
      q.window(-1, 4.72, 4, 1.6, 1.8, Math.PI);
      q.light(0, 3, 0, 0xfff6e0, 50, 14);
      clerk(q, 0, -2.7, 0, { shirt: 0x2f56c8, sleeves: undefined, hat: 'cap', hatColor: 0x2f56c8, mustache: 0x2b1b12, bulk: 1.2 });
    }
    { // a check-cashing office: three windows of thick glass, a rope line, rates on a board, a guard on a stool
      const q = rooms.OFFICE = room(12, 9, 3.2, { floorTint: 0xb9b3ac, wallTint: 0xdfe5ea });
      q.block(0x3a3a44, 11, 1.1, 0.8, 0, -1.6, M.plain, 0); for (let n = 0; n < 3; n++) { q.glowPanel(0x9fd0f5, 2.6, 1.5, -3.6 + n * 3.6, -1.18, 1.9); slab(0xc9cbd2, 0.5, 0.05, 0.3, q.X - 3.6 + n * 3.6, q.Y + 1.12, q.Z - 1.2); }
      for (let n = 0; n < 4; n++) slab(0x3a3a44, 0.2, 2.1, 0.8, q.X - 5.4 + n * 3.6, q.Y + 1.1, q.Z - 1.6);
      sign(['CHECKS CASHED · MONEY ORDERS', 'PAYROLL 1.5% · PERSONAL 6% · WE WIRE'], q.X, q.Y + 2.8, q.Z - 4.32, 0, { w: 8, h: 0.9, color: '#f4f4f0', bg: '#1f6b4a', size: 0.62, glow: false });
      for (let n = 0; n < 4; n++) { post(0xd9a520, 0.04, 1, q.X - 3.6 + n * 2.4, q.Y, q.Z + 1.2, 6); if (n) slab(0x8a1c1c, 2.4, 0.05, 0.05, q.X - 4.8 + n * 2.4, q.Y + 0.9, q.Z + 1.2); }
      post(0x1c1c22, 0.2, 0.7, q.X + 5, q.Y, q.Z + 2.6, 8);
      q.window(-2, 4.22, 4, 1.4, 1.7, Math.PI);
      q.light(0, 2.9, 0.5, 0xf0f6ff, 45, 12);
      clerk(q, 0, -2.6, 0, { body: 'female', hair: 0x111111, hairMesh: 'long', dark: true });
      q.person({ shirt: 0x9fb0c4, sleeves: 'long', tucked: true, badge: true, pants: 0x23232b, hair: 0x2b1b12, hairMesh: 'buzzed', bulk: 1.2 }, 5, 2.6, -Math.PI / 2);
    }
    { // a ranch house: one long room, the kitchen at an island, a sectional sofa, glass doors on a yard with a lemon tree
      const q = rooms.HOUSE = room(16, 11, 3.2, { floor: M.wood, floorTint: 0xc9a47a, wallTint: 0xf4f2ee, ceil: 0xf6f6f2, doorX: 5 });
      q.glowPanel(0x4a6a52, 7, 2.4, -3.5, -5.32, 1.3); for (let n = -1; n <= 1; n++) slab(0xf4f4f0, 0.08, 2.5, 0.08, q.X - 3.5 + n * 2.3, q.Y, q.Z - 5.28); ball(0xffe066, 0.12, q.X - 2, q.Y + 1.9, q.Z - 5.3, M.glow); // the yard
      q.block(0xb9a58a, 4.6, 0.5, 1.2, -4.2, 0.4); q.block(0xb9a58a, 1.2, 0.5, 2.6, -6.4, -1.4); q.block(0xb9a58a, 4.6, 0.5, 0.3, -4.2, 1.05, M.plain, 0, 0.5); // the sectional
      q.block(0x5a3320, 1.6, 0.4, 0.9, -3.8, -1.6, M.wood, 1); slab(0xd8d0c4, 5, 0.02, 3.6, q.X - 4, q.Y + 0.01, q.Z - 1);
      q.block(0x1c1c22, 1.5, 1, 0.5, -3.8, -4.2, M.plain, 0, 0.3); q.glowPanel(0x9fd0f5, 1.3, 0.8, -3.8, -3.94, 0.9, Math.PI);
      q.block(0xf4f4f0, 3.4, 0.92, 1.2, 3.4, -1.2, M.plain, 0); slab(0x8d8a8e, 3.5, 0.05, 1.3, q.X + 3.4, q.Y + 0.92, q.Z - 1.2); for (let n = 0; n < 3; n++) { slab(0x5a3320, 0.4, 0.06, 0.4, q.X + 2.4 + n, q.Y + 0.62, q.Z - 0.1); post(0x8a8d96, 0.03, 0.62, q.X + 2.4 + n, q.Y, q.Z - 0.1, 4); }
      q.block(0xf4f4f0, 6, 0.92, 0.7, 4.6, -4.9, M.plain, 0); q.block(0xc9cbd2, 0.9, 2, 0.8, 7.3, -3.6, M.plain, 0); for (const [x, hex] of [[2.6, 0xd8342c], [3.2, 0xf2c230], [3.8, 0xf2c230]]) ball(hex, 0.12, q.X + x, q.Y + 1.05, q.Z - 1.2);
      for (let n = 0; n < 3; n++) slab(0xe9e2cf, 0.9, 0.7, 0.04, q.X + 2 + n * 1.8, q.Y + 2, q.Z - 5.34, M.plain);
      q.window(-2, 5.22, 3, 1.4, 1.8, Math.PI);
      q.light(-4, 2.9, -1, 0xfff0d0, 40, 14); q.light(4, 2.9, -2, 0xfff6e0, 34, 12);
      q.person(pick(PED_ROOM_LOOKS), -4.4, 0.3, Math.PI, 'sit');
    }
  }

  { // Neil's house inside: a wall of glass, a table, a bed, and nothing he could not walk away from in thirty seconds.
    const q = rooms.NEIL = room(18, 12, 3.6, { floor: M.gravel, floorTint: 0xb9b3ba, floorScale: 4, wallTint: 0xf1f1ee, ceil: 0xf6f6f2, door: 0x16161c, doorX: -6 });
    q.glowPanel(0x2b4a6e, 16, 2.9, 0, -5.82, 1.75); for (let n = -3; n <= 3; n++) slab(0xc9cbd2, 0.06, 3.2, 0.06, q.X + n * 2.3, q.Y + 0.2, q.Z - 5.78); // the sea at dusk, through the glass
    q.glowPanel(0xf2a070, 16, 0.5, 0, -5.8, 0.55);
    q.block(0x2a2a30, 2, 0.74, 0.9, 4, -2.5, M.plain, 0); for (const sx of [-0.7, 0.7]) { slab(0x1c1c22, 0.42, 0.06, 0.42, q.X + 4 + sx, q.Y + 0.46, q.Z - 1.6); post(0x1c1c22, 0.03, 0.46, q.X + 4 + sx, q.Y, q.Z - 1.6, 4); }
    slab(0xc9cbd2, 0.3, 0.3, 0.25, q.X + 4.6, q.Y + 0.74, q.Z - 2.5);                             // the coffee machine, the one appliance
    q.block(0x3a3a44, 2.2, 0.35, 2.4, -6.4, -3.2, M.plain, 0); slab(0xf1f1ee, 2.1, 0.16, 2.3, q.X - 6.4, q.Y + 0.35, q.Z - 3.2); slab(0xf6f6f2, 0.9, 0.14, 0.5, q.X - 6.4, q.Y + 0.5, q.Z - 4.1);
    q.block(0x16161c, 1.4, 0.4, 0.5, -0.5, 4.9, M.plain, 0); slab(0x1c1c22, 0.5, 0.3, 0.3, q.X - 0.5, q.Y + 0.4, q.Z + 4.9); // the telephone
    q.light(0, 3.2, -3, 0x9fc0ff, 40, 16); q.light(4, 3, 0, 0xfff0d0, 22, 10);
    q.table = q.at(4, -1.4); q.glass = q.at(0, -4.4);
    if (LA) (places.beds ??= []).push({ x: q.X - 4.6, z: q.Z - 3, name: 'Sleep' });
  }
  { // The bank's lobby: marble, a counter under glass, desks, and the vault at the back.
    const q = rooms.BANK = room(24, 16, 5, { floor: M.paver, floorTint: 0xe9e2d2, floorScale: 3, wallTint: 0xdfe5ea, ceil: 0xf6f6f2, door: 0x1a242c });
    counter(q, -3, -4.2, 14, 0x5a3320, 0); slab(0xd6ecf5, 14, 1.1, 0.06, q.X - 3, q.Y + 1.1, q.Z - 3.8, M.glow);
    for (let n = 0; n < 5; n++) slab(0xd9a520, 0.5, 0.2, 0.04, q.X - 8.6 + n * 2.8, q.Y + 2.4, q.Z - 3.8, M.plain);
    put(M.plain, new THREE.CylinderGeometry(1.5, 1.5, 0.4, 24).rotateX(Math.PI / 2).translate(q.X + 9, q.Y + 1.7, q.Z - 7.6), 0xc9cbd2); // the vault door
    put(M.plain, new THREE.TorusGeometry(0.6, 0.06, 6, 16).translate(q.X + 9, q.Y + 1.7, q.Z - 7.35), 0x8a8d96); for (let n = 0; n < 4; n++) put(M.plain, new THREE.BoxGeometry(1.3, 0.06, 0.06).rotateZ(n * Math.PI / 4).translate(q.X + 9, q.Y + 1.7, q.Z - 7.34), 0x8a8d96);
    for (const [x, z] of [[6, 1], [6, 4.5], [9.5, 1]]) { q.block(0x5a3320, 2, 0.76, 1, x, z, M.wood, 1); slab(0x1c1c22, 0.5, 0.4, 0.4, q.X + x, q.Y + 0.76, q.Z + z); slab(0x2f4a44, 0.5, 0.06, 0.5, q.X + x, q.Y + 0.46, q.Z + z + 1); }
    for (let n = 0; n < 4; n++) { post(0xd9a520, 0.04, 1, q.X - 7 + n * 2.6, q.Y, q.Z + 0.5, 6); if (n) slab(0x8a1c1c, 2.6, 0.05, 0.05, q.X - 8.3 + n * 2.6, q.Y + 0.9, q.Z + 0.5); }
    for (const x of [-11, 11]) { post(0xb9a58a, 0.4, 0.8, q.X + x, q.Y, q.Z + 6.5, 10); put(M.plain, new THREE.ConeGeometry(0.7, 2.2, 7).translate(q.X + x, q.Y + 1.8, q.Z + 6.5), 0x2c5a34); }
    sign(['FAR EAST PACIFIC BANK', 'MEMBER F.D.I.C.'], q.X - 3, q.Y + 3.9, q.Z - 7.84, 0, { w: 9, h: 1.5, color: '#d9a520', bg: '#16161c', size: 0.62, glow: false });
    for (const x of [-7, 7]) q.window(x, 7.72, 6, 3, 2.6, Math.PI);
    q.light(-3, 4.6, -2, 0xfff6e0, 110, 22); q.light(6, 4.6, 3, 0xfff6e0, 80, 18);
    clerk(q, -6, -5.2, 0, { body: 'female', hair: 0x2a1a14, hairMesh: 'long', jacket: 0x3d4658, shirt: 0xf1ede4 });
    q.person({ shirt: 0x9fb0c4, sleeves: 'long', tucked: true, badge: true, pants: 0x23232b, hair: 0x9a9690, hairStyle: 'balding', bulk: 1.15, age: 0.7 }, -10.5, 3, Math.PI / 2);
    q.vault = q.at(9, -6); q.floor = q.at(0, 2);
  }

  const SHOP_ROOM = { BAR: 'BAR', CAFE: 'DINER', PIZZA: 'DINER', DINER: 'DINER', DELI: 'DINER', LIQUOR: 'LIQUOR', PAWN: 'PAWN', GUNS: 'GUNS', TACOS: 'FASTFOOD', DONUTS: 'FASTFOOD', BURGERS: 'FASTFOOD', 'AUTO PARTS': 'PARTS', LAUNDRY: 'LAUNDRY', 'CHECKS CASHED': 'OFFICE', VIDEO: 'STORE', SURF: 'STORE', RECORDS: 'STORE', TAILOR: 'STORE', CIGARS: 'STORE' };
  const SHOP_NAME = { BAR: 'the bar', CAFE: 'the cafe', PIZZA: 'the pizzeria', DINER: 'the diner', DELI: 'the deli', LIQUOR: 'the liquor store', PAWN: 'the pawn shop', GUNS: 'the gun shop', TACOS: 'the taco stand', DONUTS: 'the donut shop', BURGERS: 'the burger place', 'AUTO PARTS': 'the parts store', LAUNDRY: 'the laundromat', 'CHECKS CASHED': 'the check casher', VIDEO: 'the video store', SURF: 'the surf shop', RECORDS: 'the record store', TAILOR: 'the tailor', CIGARS: 'the cigar store',
    HOUSE: 'the house', NEIL: 'the house', BANK: 'the bank', STORE: 'the store', BOOKS: 'the bookstore', LIVIA: "Livia's house", WAREHOUSE: 'the warehouse', KIOSK: 'the kiosk', SHOWROOM: 'the showroom', CHURCH: 'the church', OFFICE: 'the office' };
  places.rooms = rooms;
  places.parkedSpots = parkedSpots;
  // The story's diner is the one a short drive from Dr. Melfi's office; its bar is the one nearest the park.
  const nearestShop = (kind, to, lo = 120, hi = 260) => shopDoors.filter(d => (SHOP_ROOM[d.shop] ?? d.shop) === kind && d.kerb)
    .map(d => [Math.hypot(d.kerb.x - to.x, d.kerb.z - to.z), d]).sort((a, b) => Math.abs(a[0] - (lo + hi) / 2) - Math.abs(b[0] - (lo + hi) / 2))[0][1];
  const dinerDoor = LA ? null : nearestShop('DINER', places.melfi.kerb), barDoor = nearestShop('BAR', places.park.kerb, 80, 200);
  if (dinerDoor) places.diner = { door: dinerDoor.outside, kerb: dinerDoor.kerb };
  places.bar = { door: barDoor.outside, kerb: barDoor.kerb, room: rooms.BAR };
  const gunDoor = nearestShop('GUNS', places.home.spawn, 60, 400);
  places.guns = { door: gunDoor.outside, kerb: gunDoor.kerb };
  places.gunShops = shopDoors.filter(d => d.shop === 'GUNS').map(d => d.outside).filter((d, n) => n % 3 === 0); // the map marks a few; the rest are found by their neon

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

  // ----- The bridge to the other island: a long deck out over the water, two towers, cables, lamps -----
  // Vice City's leaves from the west shore; Los Angeles's arrives on the east. Driving off the far end crosses over.
  {
    const dir = LA ? 1 : -1, z = nodeZ(9), Y = 7, W = 14, GREY = 0x9a968e, STEEL_B = 0x8a2f2a;
    const x0 = LA ? SHORE : OX - ROAD / 2, ramp = x0 + dir * 2, deck = x0 + dir * 56, end = (LA ? bounds.maxX : bounds.minX) + dir * 460;
    piers.push({ minZ: z - W / 2 + 0.5, maxZ: z + W / 2 - 0.5, ramp, deck, maxX: end, y: Y, dir });
    const len = Math.abs(end - deck), mid = (deck + end) / 2, rl = Math.abs(deck - ramp);
    put(M.gravel, tiled(new THREE.BoxGeometry(rl + 0.4, 0.8, W), rl, 0.8, W, 6).rotateZ(dir * Math.atan2(Y + 0.1, rl)).translate((ramp + deck) / 2, (Y - 0.1) / 2 - 0.4, z), GREY);
    slab(GREY, len, 1, W, mid, Y - 1, z, M.gravel, 6);
    flat(M.asphalt, 0xffffff, len, W - 1.2, mid, Y + 0.02, z, 5);
    for (let k = 0; k < len / 12; k++) flat(M.paint, 0xe8c64a, 5, 0.18, deck + dir * (6 + k * 12), Y + 0.04, z);
    for (const s of [-1, 1]) {
      slab(0xb9b3ba, len, 1.1, 0.4, mid, Y, z + s * (W / 2 - 0.2));
      // rails over the beach, so nobody steps off the side of the ramp
      collide((x0 + (LA ? bounds.maxX : bounds.minX)) / 2, z + s * (W / 2 + 0.2), Math.abs((LA ? bounds.maxX : bounds.minX) - x0) + 8, 0.5, Y + 2);
    }
    for (let k = 0; k <= len / 46; k++) { // piles into the sea, lamps above them
      const px = deck + dir * k * 46;
      slab(GREY, 2.2, Y + 4, W - 3, px, -4, z, M.gravel, 4);
      for (const s of [-1, 1]) { post(STEEL, 0.09, 6, px, Y, z + s * (W / 2 - 0.5)); ball(0xffe2a6, 0.26, px, Y + 6.1, z + s * (W / 2 - 0.5), M.glow); halo(px, Y + 6.1, z + s * (W / 2 - 0.5), 0xffb860, 4); }
    }
    for (const t of [0.3, 0.72]) { // the towers and their cables
      const tx = deck + dir * len * t, H = 44;
      for (const s of [-1, 1]) slab(STEEL_B, 2.2, H + 8, 2.2, tx, -6, z + s * (W / 2 + 1.2));
      for (const hy of [Y + 12, Y + 26, H]) slab(STEEL_B, 1.6, 2.4, W + 2.4, tx, hy, z);
      ball(0xff3b3b, 0.4, tx, H + 3.2, z, M.glow); halo(tx, H + 3.2, z, 0xff3030, 10);
      for (const s of [-1, 1]) for (let n = 1; n <= 7; n++) for (const side of [-1, 1]) {
        const reach = n * 14, dx = side * reach, drop = H - Y - 1, l = Math.hypot(reach, drop);
        put(M.plain, new THREE.BoxGeometry(l, 0.18, 0.18).rotateZ(-side * Math.atan2(drop, reach)).translate(tx + dx / 2, Y + 1 + drop / 2, z + s * (W / 2 + 1.2)), 0xd8d0c4);
      }
    }
    // The sign over the on-ramp.
    const there = LA ? 'VICE CITY' : 'LOS ANGELES', sx = x0 + dir * 10;
    for (const s of [-1, 1]) post(0x55525a, 0.2, 8, sx, 0, z + s * (W / 2 + 0.6), 8);
    slab(0x55525a, 0.4, 3.2, W + 1.2, sx, 6.6, z);
    sign([there, 'BRIDGE  ·  2 MILES'], sx - dir * 0.24, 8.2, z, dir > 0 ? -Math.PI / 2 : Math.PI / 2, { w: 11, h: 2.8, color: '#f4f4f0', bg: '#1f6b4a', size: 0.62, glow: false });
    places.bridge = { dir, there, start: { x: x0 - dir * 6, z }, far: { x: end - dir * 30, z }, arrive: { x: end - dir * 90, z: z + dir * 3, h: dir > 0 ? -Math.PI / 2 : Math.PI / 2 } };
    for (let n = palms.length - 1; n >= 0; n--) if (Math.abs(palms[n].z - z) < W / 2 + 3 && (palms[n].x - x0) * dir > -4) palms.splice(n, 1); // no palms growing through the deck
  }

  buildPalms(scene, palms, rand, LA);

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
  const shopList = shopDoors.map(d => ({ name: SHOP_NAME[d.shop], outside: d.outside, inside: rooms[SHOP_ROOM[d.shop] ?? d.shop].inside }));
  places.doors = LA ? [
    { name: 'the hospital', outside: { x: places.hospital.door.x, z: places.hospital.door.z - 3.6, h: 0 }, inside: places.wardRoom.inside },
    ...shopList,
  ] : [
    { name: "Satriale's", outside: { x: places.satriale.door.x, z: places.satriale.door.z - 2.3, h: 0 }, inside: places.shopRoom.inside },
    { name: 'the Bada Bing', outside: { x: places.bing.door.x, z: places.bing.door.z - 6.4, h: 0 }, inside: places.bingRoom.inside },
    { name: 'home', outside: { x: places.home.spawn.x, z: places.home.spawn.z - 2.6, h: 0 }, inside: places.houseRoom.inside },
    { name: "Dr. Melfi's office", outside: { x: places.melfi.door.x, z: places.melfi.door.z - 2.6, h: 0 }, inside: places.office.inside, hide: [places.office.cast.tony] },
    { name: 'the hospital', outside: { x: places.hospital.door.x, z: places.hospital.door.z - 3.6, h: 0 }, inside: places.wardRoom.inside },
    { name: 'Vesuvio', outside: { x: places.vesuvio.door.x, z: places.vesuvio.door.z - 1.4, h: 0 }, inside: rooms.VESUVIO.inside },
    { name: 'Bean Scene', outside: { x: places.cafe.door.x, z: places.cafe.door.z - 1, h: 0 }, inside: rooms.BEAN.inside },
    { name: 'F-Note Records', outside: { x: places.hesh.door.x, z: places.hesh.door.z + 0.6, h: Math.PI }, inside: rooms.FNOTE.inside },
    { name: 'the body shop', outside: { x: places.bodyshop.door.x, z: places.bodyshop.door.z + 0.6, h: Math.PI }, inside: rooms.BODYSHOP.inside },
    { name: 'the motel office', outside: places.motel.officeDoor, inside: rooms.MOTEL.inside },
    { name: 'Green Grove', outside: places.grove.door, inside: rooms.GROVE.inside },
    { name: 'the school', outside: places.school.door, inside: rooms.SCHOOL.inside },
    { name: 'Comley Trucking', outside: places.comley.door, inside: rooms.WAREHOUSE.inside },
    { name: 'the Kolar office', outside: places.kolar.door, inside: rooms.OFFICE.inside },
    ...shopList,
  ];
  // The lights inside rooms are a handful of shared lights that follow the camera from room to room.
  const rig = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffffff, 0, 1); scene.add(l); return l; });
  let litRoom = null;
  places.lightRoom = q => {
    if (q === litRoom) return;
    litRoom = q;
    rig.forEach((l, n) => {
      const s = q?.lights[n];
      l.intensity = s ? s.power : 0;
      if (s) { l.position.set(s.x, s.y, s.z); l.color.set(s.hex); l.distance = s.reach; }
    });
  };
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
function buildPalms(scene, list, rand, tall = false) {
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
    const s = (tall ? 1.7 : 0.9) + rand() * (tall ? 0.7 : 0.45), spin = rand() * 6; // Los Angeles grows them tall and thin
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

  interiors.push({ minX: X - 5.6, maxX: X + 5.6, minZ: Z - 4.6, maxZ: Z + 4.6, lights: [{ x: X, y: base + 3.9, z: Z + 1, hex: 0xffd9a8, power: 45, reach: 30 }] });
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
    uniforms: { time: { value: 0 }, sun: { value: SUN }, night: { value: 0 }, tint: { value: LA ? new THREE.Vector3(0.62, 0.8, 1.22) : new THREE.Vector3(1, 1, 1) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform float time; uniform float night; uniform vec3 sun; uniform vec3 tint;
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
        c = mix(c * tint, dark, night); // Los Angeles: the same dusk, gone to blue
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
