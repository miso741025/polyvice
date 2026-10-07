import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, NX, NZ, BLOCK, ROAD, CELL, OX, OZ, nodeX, nodeZ, blockCenter, SHORE, bounds, colliders, lowGround, raise, piers, interiors, floors, mulberry32, groundAt } from './grid.js';
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
  '12,4': 'park', '4,11': 'park', '9,12': 'apron', '10,12': 'apron', '11,12': 'terminal', '12,12': 'apron', '13,12': 'hangar', '14,12': 'apron', '2,7': 'yard', '13,8': 'church', '1,10': 'containers',
  '15,12': 'hotel' };                  // chapter four: the hotel at the end of the runway
const SPECIAL_VICE = { '0,0': 'home', '5,3': 'melfi', '3,5': 'bing', '2,2': 'satriale', '6,1': 'vesuvio', '1,4': 'livia', '0,6': 'grove', '5,5': 'hesh', '0,3': 'kolar',
  '4,0': 'comley', '2,4': 'bodyshop', '6,4': 'school', '4,2': 'cafe', '8,2': 'park', '3,8': 'park', '9,7': 'park', '9,1': 'hospital', '10,5': 'motel',
  '13,0': 'college', '12,2': 'travel', // episode five: up the coast
  '15,12': 'manor' };                  // episode six: the banquet hall at the south end of Ocean Drive
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
    if ((mat === M.grass || mat === M.paint) && y > CURB && y < CURB + 0.2) raise(x, z, w, d, y, mat === M.grass ? 'grass' : 'pave'); // a lawn or a patio: people stand on it, not in it
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
  const AW = 4096; // eight columns of slots. (At four the atlas filled up before the city was finished, and whatever was built last went without its sign: the bridge's, for one.)
  atlas.width = AW; atlas.height = AH;
  const ag = atlas.getContext('2d'), shelves = [0, 0, 0, 0, 0, 0, 0, 0];
  let signsLost = 0;
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
      if (py + ph > AH) { if (!signsLost++) console.warn('sign atlas full: a sign was left out', rows); return; } // out of room: the city has one sign fewer, and says so
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
      for (let i = 0; i < 4; i++) uv.setXY(i, (slot.px + uv.getX(i) * slot.pw) / AW, 1 - (slot.py + (1 - uv.getY(i)) * slot.ph) / AH);
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
  // Tony's pool is a real hole: the sand and the road plane under his garden are cut out where it goes.
  const poolHole = LA ? null : { x: blockCenter(0, 0).x + 13, z: blockCenter(0, 0).z + 13, w: 12, d: 18 };
  const holed = (w, d, cx, cz, y, s) => { // a w x d sheet centred on (cx, cz) with the pool cut out of it; one texture repeat every s metres (0: once over the sheet)
    const shape = new THREE.Shape([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => new THREE.Vector2(x, z)));
    const hx = poolHole.x - cx, hz = -(poolHole.z - cz), a = poolHole.w / 2, b = poolHole.d / 2;
    shape.holes.push(new THREE.Path([[hx - a, hz - b], [hx - a, hz + b], [hx + a, hz + b], [hx + a, hz - b]].map(([x, z]) => new THREE.Vector2(x, z))));
    const geo = new THREE.ShapeGeometry(shape), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) / w + 0.5) * (s ? w / s : 1), (pos.getY(k) / d + 0.5) * (s ? d / s : 1));
    return geo.rotateX(-Math.PI / 2).translate(cx, y, cz);
  };
  if (poolHole) put(M.sand, holed(bw, bd, (bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, -0.1, 12), 0xffffff);
  else flat(M.sand, 0xffffff, bw, bd, (bounds.minX + bounds.maxX) / 2, -0.1, (bounds.minZ + bounds.maxZ) / 2, 12);
  const roadMap = roadTexture(rand);
  roadMap.repeat.set(W / CELL, D / CELL); roadMap.offset.set(-ROAD / 2 / CELL, -ROAD / 2 / CELL);
  const road = new THREE.Mesh(poolHole ? holed(W, D, 0, 0, 0, 0) : new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: roadMap }));
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
    } else if (kind !== 'river' && kind !== 'home') slab(LA ? 0xcfcfd2 : 0xffffff, BLOCK, CURB, BLOCK, c.x, 0, c.z, M.paver, 6); // the house lays its own, around the pool
    (places.kinds ??= {})[i + ',' + j] = kind; // what each block is, for whoever needs to know (the sound of the place, for one)
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
    else if (kind === 'containers') buildContainers(c);
    else if (kind === 'hotel') buildHotel(c);
    else if (kind === 'college') buildCollege(c);
    else if (kind === 'travel') { buildTravel(c); lots(c, i, [-1, 1]); }
    else if (kind === 'manor') buildManor(c);
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
    const pool = { x: c.x + 13, z: c.z + 13, w: 12, d: 18 };
    // The ground is laid in four pieces around the pool, so that the pool is a hole in it and not a picture on it.
    const around = (W, D, lay) => {
      const x0 = c.x - W / 2, x1 = c.x + W / 2, z0 = c.z - D / 2, z1 = c.z + D / 2, px0 = pool.x - pool.w / 2, px1 = pool.x + pool.w / 2, pz0 = pool.z - pool.d / 2, pz1 = pool.z + pool.d / 2;
      for (const [ax, bx, az, bz] of [[x0, x1, z0, pz0], [x0, x1, pz1, z1], [x0, px0, pz0, pz1], [px1, x1, pz0, pz1]]) if (bx > ax && bz > az) lay(bx - ax, bz - az, (ax + bx) / 2, (az + bz) / 2);
    };
    around(BLOCK, BLOCK, (w, d, x, z) => slab(0xffffff, w, CURB, d, x, 0, z, M.paver, 6));
    around(BLOCK - 4, BLOCK - 4, (w, d, x, z) => flat(M.grass, 0xffffff, w, d, x, y + 0.05, z, 6));
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

    { // the deck, in four pieces as well
      const W = pool.w + 5, D = pool.d + 5;
      for (const sgn of [-1, 1]) { flat(M.paint, 0xf3ece0, W, 2.5, pool.x, y + 0.09, pool.z + sgn * (pool.d / 2 + 1.25)); flat(M.paint, 0xf3ece0, 2.5, pool.d, pool.x + sgn * (pool.w / 2 + 1.25), y + 0.09, pool.z); }
      void D;
    }
    for (const s of [-1, 1]) { // coping: a lip of white stone that stands above the deck and hangs over the water
      slab(0xffffff, pool.w + 0.9, 0.2, 0.5, pool.x, y + 0.02, pool.z + s * (pool.d / 2 + 0.15));
      slab(0xffffff, 0.5, 0.2, pool.d + 0.9, pool.x + s * (pool.w / 2 + 0.15), y + 0.02, pool.z);
    }
    // The basin: tiled walls going down, a floor that slopes to the deep end, and the water a hand below the lip.
    const DEPTH = 0.7, WATER = y - 0.08; // the sea lies at -0.6 under everything: the floor stays above it
    const tiles = texture(128, 128, (g, w) => {
      g.fillStyle = '#58c8e0'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
      for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, w); g.moveTo(0, k * 32); g.lineTo(w, k * 32); g.stroke(); }
    });
    tiles.repeat.set(6, 3);
    const basinMat = new THREE.MeshLambertMaterial({ map: tiles, side: THREE.BackSide });
    const basin = new THREE.Mesh(new THREE.BoxGeometry(pool.w, DEPTH, pool.d), basinMat);
    basin.position.set(pool.x, y - DEPTH / 2 + 0.01, pool.z);
    scene.add(basin);
    const caustics = texture(128, 128, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = 'rgba(40,190,225,.55)'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(225,252,255,.7)'; g.lineWidth = 2;
      for (let k = 0; k < 16; k++) { g.beginPath(); g.ellipse(rand() * w, rand() * w, 8 + rand() * 14, 5 + rand() * 9, rand() * 3, 0, 7); g.stroke(); }
    });
    caustics.repeat.set(3, 4.5);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pool.w, pool.d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: caustics, transparent: true, depthWrite: false }));
    water.position.set(pool.x, WATER, pool.z);
    water.renderOrder = 1;
    scene.add(water);
    updaters.push(t => { caustics.offset.set(Math.sin(t * 0.4) * 0.04, t * 0.02); });
    collide(pool.x, pool.z, pool.w + 0.9, pool.d + 0.9, 0.3);
    slab(0xffffff, 0.6, 0.08, 2.6, pool.x, y + 0.55, pool.z + pool.d / 2 + 0.6); slab(0xb9bcc4, 0.5, 0.5, 0.5, pool.x, y, pool.z + pool.d / 2 + 1.5); // diving board
    for (const lz of [-4, -1.2]) { // sun loungers
      slab(0xffffff, 0.75, 0.3, 2, pool.x + pool.w / 2 + 1.6, y + 0.05, pool.z + lz);
      put(M.plain, new THREE.BoxGeometry(0.75, 0.08, 0.8).rotateX(-0.7).translate(pool.x + pool.w / 2 + 1.6, y + 0.62, pool.z + lz - 1), 0x49e0d0);
    }

    const ducks = [];
    for (let k = 0; k < 5; k++) {
      const d = makeDuck();
      d.group.position.set(pool.x - 2.5 + (k % 3) * 1.6, WATER, pool.z - 2 + Math.floor(k / 3) * 2.2 + (k % 2) * 0.7);
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

    // The patio is where the family eats and entertains: a long table under a string of lights, set for company.
    const bx = c.x + 2.6, bz = c.z + 0.9;
    slab(0x8a5a44, 4.2, 0.08, 0.9, bx, y + 0.76, bz, M.wood, 1); slab(0xf4f4f0, 4, 0.02, 0.8, bx, y + 0.84, bz); for (const s of [-1, 1]) for (const t of [-1, 1]) post(0x8a5a44, 0.04, 0.76, bx + s * 1.9, y, bz + t * 0.35, 4);
    collide(bx, bz, 4.2, 0.9, 1);
    for (let n = 0; n < 5; n++) { put(M.plain, new THREE.CylinderGeometry(0.2, 0.17, 0.05, 14).translate(bx - 1.6 + n * 0.8, y + 0.88, bz), 0xe9e2cf); ball([0xc8312a, 0xd9a520, 0x2f7d46, 0xb5523b, 0xf2a3b4][n], 0.13, bx - 1.6 + n * 0.8, y + 0.94, bz); } // platters
    for (let n = 0; n < 4; n++) put(M.plain, new THREE.CylinderGeometry(0.04, 0.05, 0.28, 8).translate(bx + 1.75, y + 1, bz - 0.25 + n * 0.16), [0x2f5a3f, 0x8a1c2a, 0x2f5a3f, 0xd9a520][n]);
    for (let n = 0; n < 6; n++) put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8).translate(bx - 1.9 + (n % 3) * 0.1, y + 0.9, bz + 0.2 + Math.floor(n / 3) * 0.1), 0xf4f4f0);
    slab(0x2f56c8, 0.9, 0.5, 0.5, bx + 2.9, y, bz); slab(0xf4f4f0, 0.94, 0.08, 0.54, bx + 2.9, y + 0.5, bz); // the cooler
    for (const s of [-1, 1]) post(0xf4f4f0, 0.05, 3, c.x - 1 + s * 6, y, c.z + 8.6, 5);
    slab(0x1c1c22, 12, 0.02, 0.02, c.x - 1, y + 2.95, c.z + 8.6); for (let n = 0; n < 13; n++) { ball([0xffe066, 0xff5fd2, 0x49e0d0, 0xff8a5c][n % 4], 0.09, c.x - 7 + n, y + 2.86, c.z + 8.6, M.glow); if (n % 3 === 0) halo(c.x - 7 + n, y + 2.86, c.z + 8.6, 0xffd9a8, 4); }
    for (const [lx, lz, t] of [[-6.2, 3, 0.5], [-6.4, 6, 0.2], [4.6, 7.4, -0.6]]) { // lawn chairs
      put(M.plain, new THREE.BoxGeometry(0.6, 0.06, 0.6).rotateY(t).translate(c.x + lx, y + 0.42, c.z + lz), 0x49e0d0); put(M.plain, new THREE.BoxGeometry(0.6, 0.6, 0.06).translate(0, 0.3, -0.3).rotateY(t).translate(c.x + lx, y + 0.42, c.z + lz), 0x49e0d0);
      for (const [fx, fz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) post(0xc9cbd2, 0.02, 0.42, c.x + lx + fx, y, c.z + lz + fz, 4);
    }
    // ----- The grounds, as somebody who lives there keeps them (owner feedback: it is his home) -----
    {
      const GREEN = 0x2f4a3c, BRASS = 0xd9a520, STONE = 0xc9b79c, BLOOM = [0xd8342c, 0xff8ad8, 0xffe066, 0xf4f4f0, 0xc85cff];
      const bush = (x, z, r = 0.55, n = 0) => { ball(0x2f7d46, r, x, y + r * 0.8, z); ball(0x3f9a5a, r * 0.7, x + r * 0.4, y + r * 1.25, z - r * 0.2); if (n) for (let k = 0; k < n; k++) ball(BLOOM[(k + Math.round(x)) % 5], 0.09, x + Math.sin(k * 2.4) * r * 0.8, y + r * (0.9 + (k % 3) * 0.3), z + Math.cos(k * 2.4) * r * 0.8); };
      const lantern = (x, yy, z, glow = true) => { slab(0x1c1c22, 0.2, 0.36, 0.2, x, yy, z); slab(0xffe2a6, 0.14, 0.24, 0.22, x, yy + 0.05, z, M.glow); slab(0x1c1c22, 0.26, 0.05, 0.26, x, yy + 0.36, z); if (glow) halo(x, yy + 0.2, z, 0xffc070, 4); };
      const cypress = (x, z, h = 5) => { put(M.plain, new THREE.ConeGeometry(0.75, h, 9).translate(x, y + h / 2 + 0.3, z), 0x1f5a3a); post(0x5a3320, 0.12, 0.4, x, y, z, 6); collide(x, z, 0.9, 0.9, h, true); };
      // The front of the house: shutters, boxes of geraniums, lanterns, planting along the wall, the number by the door.
      for (const [wx, wy, hh] of [[-10, 1.3, 2.2], [2, 1.3, 2.2], [-10, 5, 2], [2, 5, 2], [-4, 5, 2]]) {
        const half = wx === -4 ? 1.3 : 1;
        for (const s of [-1, 1]) { slab(GREEN, 0.42, hh, 0.07, c.x + wx + s * (half + 0.24), y + wy, front + 0.04); for (let k = 0; k < 6; k++) slab(0x24392e, 0.36, 0.03, 0.08, c.x + wx + s * (half + 0.24), y + wy + 0.2 + k * (hh - 0.4) / 5, front + 0.045); }
        slab(0xffffff, half * 2 + 0.3, 0.12, 0.16, c.x + wx, y + wy - 0.12, front + 0.08);
        if (wy < 2) { slab(0x8a5a44, half * 2, 0.24, 0.3, c.x + wx, y + wy - 0.36, front + 0.2, M.wood, 1); for (let k = 0; k < 7; k++) ball(BLOOM[k % 2 ? 0 : 1], 0.11, c.x + wx - half + 0.15 + k * (half * 2 - 0.3) / 6, y + wy - 0.06, front + 0.22); }
      }
      for (const s of [-1, 1]) lantern(c.x - 4 + s * 1.5, y + 2.3, front + 0.14);
      sign('633', c.x - 2.3, y + 1.7, front + 0.08, 0, { w: 0.5, h: 0.24, color: '#1c1c22', bg: '#d9a520', size: 0.8, glow: false });
      slab(0x8a2f3a, 1.4, 0.03, 0.8, c.x - 4, y + 0.16, front + 0.7); slab(BRASS, 0.5, 0.06, 0.03, c.x - 4, y + 1.2, front + 0.17);                         // the mat, the knocker
      for (const s of [-1, 1]) { post(0xb5523b, 0.26, 0.5, c.x - 4 + s * 1.75, y + 0.16, front + 0.7, 10); ball(0x1f5a3a, 0.34, c.x - 4 + s * 1.75, y + 1, front + 0.7); ball(0x1f5a3a, 0.24, c.x - 4 + s * 1.75, y + 1.5, front + 0.7); post(0x5a3320, 0.03, 1.4, c.x - 4 + s * 1.75, y + 0.3, front + 0.7, 5); }
      for (const [x0, x1] of [[-13.4, -7.6], [-0.4, 5.2]]) { flat(M.paint, 0x5a4636, x1 - x0, 1.5, c.x + (x0 + x1) / 2, y + 0.085, front + 0.95); for (let x = x0 + 0.5; x < x1; x += 1.15) bush(c.x + x, front + 0.95, 0.5, 4); collide(c.x + (x0 + x1) / 2, front + 0.9, x1 - x0, 1.3, 1.2); }
      for (const dz of [-3.5, -8.5]) { slab(0xb9bcc4, 0.1, 5.6, 0.1, c.x + 17.9, y, c.z + dz - 14); } slab(0xb9bcc4, 0.1, 7.6, 0.1, c.x - 13.9, y, front + 0.06); slab(0xb9bcc4, 0.1, 7.6, 0.1, c.x + 5.9, y, front + 0.06);                // downpipes
      slab(0x8d8a8e, 0.9, 0.8, 0.5, c.x + 5.6, y, c.z - 3.2); for (let k = 0; k < 5; k++) slab(0x6f6a66, 0.92, 0.03, 0.02, c.x + 5.6, y + 0.15 + k * 0.13, c.z - 2.94);                                                   // the air conditioning
      put(M.plain, new THREE.TorusGeometry(0.28, 0.07, 6, 16).rotateY(Math.PI / 2).translate(c.x + 5.9, y + 0.9, c.z - 8.6), 0x2f7d46); slab(0x1c1c22, 0.12, 0.5, 0.12, c.x + 5.92, y + 0.3, c.z - 8.6);                   // the hose on its reel
      // The garage: lanterns, the hoop AJ does not use, bins, a dish on the roof.
      for (const lx of [-26.2, -20.5, -14.8]) lantern(c.x + lx, y + 3.2, c.z - 13.86);
      post(0x3a3a44, 0.07, 3.4, c.x - 15.1, y, c.z - 9, 6); slab(0xf4f4f0, 0.08, 1.05, 1.5, c.x - 15.5, y + 3, c.z - 9); slab(0xd8342c, 0.09, 0.4, 0.55, c.x - 15.55, y + 3.15, c.z - 9); put(M.plain, new THREE.TorusGeometry(0.23, 0.02, 5, 16).rotateX(Math.PI / 2).translate(c.x - 15.82, y + 3.1, c.z - 9), 0xff8a30); slab(0x3a3a44, 0.5, 0.06, 0.06, c.x - 15.3, y + 3.3, c.z - 9);
      ball(0xd9722a, 0.13, c.x - 16.6, y + 0.22, c.z - 10.4);                                                                                                                              // and the ball, where he dropped it
      for (const [bz, hex] of [[-15, 0x2f5a3f], [-16, 0x2f5a3f], [-17, 0x3b6ea8]]) { post(hex, 0.3, 0.9, c.x - 14.4, y, c.z + bz, 10); post(0x23232b, 0.32, 0.06, c.x - 14.4, y + 0.9, c.z + bz, 10); } collide(c.x - 14.4, c.z - 16, 0.8, 2.9, 1);
      post(0x8a8d96, 0.04, 0.8, c.x - 23, y + 6.6, c.z - 22, 5); put(M.plain, new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, 1.1).rotateX(-1).translate(c.x - 23, y + 7.6, c.z - 22), 0xe9e2cf);
      // The drive: a band of pale stone down each edge, the mailbox, this morning's paper where the boy threw it, lights.
      for (const s of [-1, 1]) flat(M.paint, 0xd8d0c4, 0.5, 43, c.x - 20.5 + s * 4.5, y + 0.095, c.z + 7.5);
      post(0x5a3320, 0.06, 1.1, c.x - 14.9, y, c.z + 29.2, 5); slab(0x1c1c22, 0.26, 0.24, 0.5, c.x - 14.9, y + 1.1, c.z + 29.2); slab(0xd8342c, 0.03, 0.2, 0.04, c.x - 14.75, y + 1.3, c.z + 29.1); collide(c.x - 14.9, c.z + 29.2, 0.4, 0.6, 1.4, true);
      slab(0x3b6ea8, 0.42, 0.08, 0.14, c.x - 17.8, y + 0.1, c.z + 25.6); slab(0xf4f4f0, 0.3, 0.085, 0.1, c.x - 17.8, y + 0.1, c.z + 25.6);                                                    // the Star-Ledger of this place
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const lx = c.x - 20.5 + s * 5.1, lz = c.z - 10 + k * 7.4; post(0x1c1c22, 0.03, 0.5, lx, y, lz, 5); ball(0xffe2a6, 0.08, lx, y + 0.55, lz, M.glow); if (k % 2 === 0) halo(lx, y + 0.55, lz, 0xffc070, 4); }
      // Across the lawn: stepping stones from the drive to the patio, a fountain Carmela chose, cypresses, roses under the hedge.
      for (let k = 0; k < 9; k++) put(M.plain, new THREE.CylinderGeometry(0.42, 0.42, 0.05, 9).translate(c.x - 15 + k * 0.95, y + 0.06, c.z + 9.6 - k * 0.5 + (k % 2) * 0.25), 0xd8d0c4);
      { const fx = c.x - 11.5, fz = c.z + 18.5;
        put(M.gravel, new THREE.CylinderGeometry(1.5, 1.6, 0.5, 20).translate(fx, y + 0.25, fz), STONE); put(M.plain, new THREE.CylinderGeometry(1.3, 1.3, 0.04, 20).translate(fx, y + 0.44, fz), 0x58c8e0);
        post(STONE, 0.16, 1.3, fx, y + 0.4, fz, 10); put(M.gravel, new THREE.CylinderGeometry(0.7, 0.25, 0.22, 16).translate(fx, y + 1.5, fz), STONE); put(M.plain, new THREE.CylinderGeometry(0.62, 0.62, 0.03, 16).translate(fx, y + 1.6, fz), 0x8fe0f0); post(STONE, 0.07, 0.5, fx, y + 1.6, fz, 8); ball(STONE, 0.14, fx, y + 2.15, fz);
        const jets = []; for (let n = 0; n < 6; n++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.8 })); scene.add(d); jets.push(d); }
        updaters.push(t => jets.forEach((d, n) => { const k = (t * 0.9 + n / 6) % 1, a = n * 1.047; d.position.set(fx + Math.sin(a) * k * 0.62, y + 1.72 + Math.sin(k * Math.PI) * 0.34 - k * 0.2, fz + Math.cos(a) * k * 0.62); }));
        collide(fx, fz, 3, 3, 1.2); places.fountain = { x: fx, z: fz };
        for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; bush(fx + Math.sin(a) * 2.3, fz + Math.cos(a) * 2.3, 0.3, 3); } }
      for (const cz of [4, 10, 16, 22]) cypress(c.x + 26, c.z + cz, 5.5); for (const cx of [-12, -6.5, -1]) cypress(c.x + cx, c.z + 26.2, 5);
      for (const [x0, x1, z] of [[-14.5, -13, 26.4], [-10.6, -8, 26.4], [-5, -2.5, 26.4], [5, 20, 26.5]]) { flat(M.paint, 0x5a4636, x1 - x0, 1.1, c.x + (x0 + x1) / 2, y + 0.085, c.z + z); for (let x = x0 + 0.3; x < x1; x += 0.75) { ball(0x2f7d46, 0.26, c.x + x, y + 0.34, c.z + z); ball(BLOOM[Math.round(x * 3) % 5 < 2 ? 0 : 1], 0.1, c.x + x + 0.05, y + 0.6, c.z + z - 0.05); ball(BLOOM[0], 0.08, c.x + x - 0.12, y + 0.5, c.z + z + 0.1); } }
      for (let k = 0; k < 6; k++) { const lx = c.x - 8 + k * 2.7, lz = c.z + 10.6; post(0x1c1c22, 0.025, 0.4, lx, y, lz, 5); ball(0xffe2a6, 0.07, lx, y + 0.44, lz, M.glow); }
      // The patio: a pergola over the table, planters at the corners, the grill with its lid up and something on it, smoke.
      for (const [px, pz] of [[0.1, -0.35], [5.1, -0.35], [0.1, 2.4], [5.1, 2.4]]) { post(0xf4f4f0, 0.09, 2.7, c.x + px, y, c.z + pz, 8); collide(c.x + px, c.z + pz, 0.3, 0.3, 2.7, true); }
      for (const pz of [-0.35, 2.4]) slab(0xf4f4f0, 5.6, 0.16, 0.12, c.x + 2.6, y + 2.7, c.z + pz); for (let k = 0; k < 11; k++) slab(0xf4f4f0, 0.07, 0.1, 3.4, c.x + 0.1 + k * 0.5, y + 2.86, c.z + 1.02);
      for (let k = 0; k < 6; k++) { ball(0x2f7d46, 0.2, c.x + 0.3 + k * 0.95, y + 2.8 + (k % 2) * 0.1, c.z - 0.35); ball(0xc85cff, 0.09, c.x + 0.5 + k * 0.95, y + 2.62, c.z - 0.3); }                                    // wisteria along the beam
      for (const [px, pz] of [[-6.6, 0.5], [-6.6, 8.5], [4.6, 8.6]]) { slab(0xb5523b, 0.7, 0.5, 0.7, c.x + px, y, c.z + pz); bush(c.x + px, c.z + pz, 0.38, 5); collide(c.x + px, c.z + pz, 0.8, 0.8, 1, true); }
      put(M.plain, new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-1.2).translate(gx, y + 1.05, gz - 0.38), 0x1c1c22);                                                                   // the lid, tipped back
      for (let k = 0; k < 5; k++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6).rotateZ(Math.PI / 2).translate(gx - 0.1 + (k % 2) * 0.12, y + 1.01, gz - 0.16 + k * 0.08), 0x8a3a22);                      // sausage
      for (let k = 0; k < 2; k++) put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10).translate(gx + 0.2, y + 1.01, gz - 0.1 + k * 0.2), 0x6a3a22);
      put(M.plain, new THREE.CylinderGeometry(0.17, 0.15, 0.03, 12).translate(gx - 1.6, y + 0.9, gz - 0.1), 0xf4f4f0); for (let k = 0; k < 4; k++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6).rotateZ(Math.PI / 2).translate(gx - 1.6, y + 0.94, gz - 0.2 + k * 0.07), 0xc8705a); // the raw ones, waiting
      slab(0x8a8d96, 0.03, 0.02, 0.4, gx - 1.25, y + 0.9, gz + 0.1); slab(0xd8342c, 0.08, 0.2, 0.08, gx - 2.05, y + 0.88, gz + 0.2); slab(0xffe066, 0.08, 0.2, 0.08, gx - 2.05, y + 0.88, gz); slab(0x5a4636, 0.4, 0.55, 0.26, gx + 0.9, y, gz - 0.2);   // tongs, ketchup, mustard, the charcoal
      { const puffs = []; for (let n = 0; n < 5; n++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), new THREE.MeshBasicMaterial({ color: 0xd8d2d8, transparent: true, opacity: 0.3, depthWrite: false })); scene.add(m); puffs.push(m); }
        updaters.push(t => puffs.forEach((m, n) => { const k = (t * 0.28 + n / 5) % 1; m.position.set(gx + Math.sin(t * 0.7 + n * 2) * 0.18 * k + k * 0.5, y + 1.1 + k * 2.4, gz + Math.cos(t * 0.5 + n) * 0.14 * k); m.scale.setScalar(0.5 + k * 1.8); m.material.opacity = 0.34 * (1 - k); })); }
      // The pool: a ladder, lights under the water, a ring nobody took out, towels, a table under an umbrella, the cabana.
      for (const s of [-1, 1]) { put(M.plain, new THREE.TorusGeometry(0.42, 0.025, 5, 14, Math.PI).rotateY(Math.PI / 2).translate(pool.x - pool.w / 2 + 0.1, y + 0.2, pool.z - 7.2 + s * 0.3), 0xd8dce6); }
      for (const lz of [-6, 0, 6]) for (const s of [-1, 1]) slab(0xdffcff, 0.03, 0.14, 0.4, pool.x + s * (pool.w / 2 - 0.03), y - 0.42, pool.z + lz, M.glow);
      { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 18).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff5fa8 })), bb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffe066 }));
        scene.add(ring); scene.add(bb); updaters.push(t => { ring.position.set(pool.x + 3 + Math.sin(t * 0.11) * 1.4, WATER + 0.06 + Math.sin(t * 1.3) * 0.015, pool.z + 5 + Math.cos(t * 0.09) * 2); ring.rotation.y = t * 0.1; bb.position.set(pool.x - 2.6 + Math.cos(t * 0.07) * 1.2, WATER + 0.14 + Math.sin(t * 1.7) * 0.02, pool.z + 6.5 + Math.sin(t * 0.08) * 1.3); bb.rotation.x = t * 0.2; }); }
      for (const lz of [-4, -1.2]) slab([0xff8a5c, 0xffe066][lz < -2 ? 0 : 1], 0.6, 0.03, 1.1, pool.x + pool.w / 2 + 1.6, y + 0.36, pool.z + lz + 0.3);
      slab(0xf4f4f0, 0.5, 0.4, 0.5, pool.x + pool.w / 2 + 1.6, y, pool.z - 2.6); put(M.plain, new THREE.CylinderGeometry(0.04, 0.03, 0.14, 8).translate(pool.x + pool.w / 2 + 1.55, y + 0.47, pool.z - 2.6), 0xff8a5c); slab(0x3b6ea8, 0.2, 0.03, 0.14, pool.x + pool.w / 2 + 1.7, y + 0.4, pool.z - 2.5);
      { const ux = pool.x + 4.2, uz = pool.z + pool.d / 2 + 1.5;
        post(0xf4f4f0, 0.04, 2.5, ux, y, uz, 6); put(M.plain, new THREE.CylinderGeometry(0.55, 0.55, 0.04, 16).translate(ux, y + 0.74, uz), 0xf4f4f0); put(M.plain, new THREE.ConeGeometry(1.5, 0.55, 8).translate(ux, y + 2.6, uz), 0xd8342c); for (let n = 0; n < 4; n++) put(M.plain, new THREE.ConeGeometry(1.52, 0.56, 8, 1, true, n * Math.PI / 2, Math.PI / 4).translate(ux, y + 2.6, uz), 0xf4f4f0);
        for (const s of [-1, 1]) { slab(0xf4f4f0, 0.45, 0.05, 0.45, ux + s * 0.95, y + 0.42, uz); slab(0xf4f4f0, 0.05, 0.5, 0.45, ux + s * 1.16, y + 0.45, uz); for (const [fx, fz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) post(0xc9cbd2, 0.015, 0.42, ux + s * 0.95 + fx, y, uz + fz, 4); }
        put(M.plain, new THREE.CylinderGeometry(0.05, 0.04, 0.16, 8).translate(ux + 0.2, y + 0.84, uz), 0xcfe8ff); collide(ux, uz, 1.1, 1.1, 1, true); }
      { const bx0 = c.x + 24.6, bz0 = c.z + 13.5;
        for (const [px, pz] of [[-1.2, -1.9], [1.2, -1.9], [-1.2, 1.9], [1.2, 1.9]]) post(0x8a5a44, 0.09, 2.6, bx0 + px, y, bz0 + pz, 6);
        put(M.plain, new THREE.ConeGeometry(2.9, 1.3, 4).rotateY(Math.PI / 4).scale(0.75, 1, 1.05).translate(bx0, y + 3.25, bz0), 0xd9b25a); for (let k = 0; k < 8; k++) slab(0xc79a4a, 0.04, 0.5, 3.9, bx0 - 1.3 + k * 0.37, y + 2.35, bz0);
        slab(0x8a5a44, 0.6, 1.05, 3.4, bx0 - 0.9, y, bz0, M.wood, 2); slab(0x3a2418, 0.75, 0.05, 3.5, bx0 - 0.9, y + 1.05, bz0); for (let k = 0; k < 6; k++) put(M.plain, new THREE.CylinderGeometry(0.04, 0.05, 0.26, 8).translate(bx0 - 0.85, y + 1.23, bz0 - 1.3 + k * 0.5), [0xd9a520, 0x2f7d46, 0xc8312a, 0xe9e2cf, 0x8a5a2a, 0x49e0d0][k]);
        slab(0x8a5a44, 0.5, 1.6, 3.4, bx0 + 1, y, bz0, M.wood, 2); for (let k = 0; k < 10; k++) put(M.plain, new THREE.CylinderGeometry(0.04, 0.05, 0.26, 8).translate(bx0 + 0.9, y + 1.73, bz0 - 1.4 + k * 0.31), [0xd9a520, 0x2f7d46, 0xc8312a, 0xe9e2cf][k % 4]);
        for (const sz of [-1, 0, 1]) { post(0xc9cbd2, 0.03, 0.7, bx0 - 1.7, y, bz0 + sz, 5); post(0x49e0d0, 0.18, 0.06, bx0 - 1.7, y + 0.7, bz0 + sz, 10); }
        for (let k = 0; k < 8; k++) ball([0xffe066, 0xff5fd2, 0x49e0d0, 0xff8a5c][k % 4], 0.07, bx0 - 1.25, y + 2.3, bz0 - 1.75 + k * 0.5, M.glow);
        collide(bx0, bz0, 2.7, 4, 2.6); }
      for (const [gx2, gz2] of [[-9.8, 3.2], [22.5, 24.4]]) { post(0xd8342c, 0.1, 0.16, c.x + gx2, y, c.z + gz2, 8); ball(0xf4d8c0, 0.07, c.x + gx2, y + 0.24, c.z + gz2); put(M.plain, new THREE.ConeGeometry(0.08, 0.2, 8).translate(c.x + gx2, y + 0.4, c.z + gz2), 0xd8342c); } // gnomes. Carmela denies them
    }
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
    { // The door: a man who decides, a rope, a mat
      const heavy = makeHuman({ jacket: 0x16161c, shirt: 0x16161c, tee: true, pants: 0x16161c, shoes: 0x16161c, hair: 0x111111, hairMesh: 'buzzed', glasses: 'shades', bulk: 1.4, height: 1.07 });
      heavy.group.position.set(c.x + 1.7, CURB, c.z + 9.3); heavy.group.rotation.y = 0; scene.add(heavy.group);
      for (const s of [-1, 1]) { post(0xd9a520, 0.05, 1, c.x + s * 1.2, CURB, c.z + 10.6, 8); ball(0xd9a520, 0.08, c.x + s * 1.2, CURB + 1.05, c.z + 10.6); collide(c.x + s * 1.2, c.z + 10.6, 0.3, 0.3, 1, true); }
      slab(0x8a1228, 2.2, 0.02, 3, c.x, CURB + 0.005, c.z + 10.2);
      places.bingDoorman = heavy;
    }
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
      for (const s of [-1, 1]) put(M.plain, new THREE.CylinderGeometry(0.04, 0.035, 0.07, 8).translate(x + tx + s * 0.28, y + 0.84, front + 2.6 + s * 0.1), 0xf4f4f0); // espresso cups
      slab(0xe9e2cf, 0.34, 0.015, 0.26, x + tx, y + 0.8, front + 2.84); put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10).translate(x + tx - 0.05, y + 0.81, front + 2.36), 0x8d8a8e); // the paper, an ashtray
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
      for (const s of [-1, 1]) { put(M.plain, new THREE.CylinderGeometry(0.14, 0.12, 0.02, 12).translate(tx + s * 0.3, y + 0.81, tz), 0xf4f4f0); put(M.plain, new THREE.CylinderGeometry(0.03, 0.02, 0.14, 8).translate(tx + s * 0.34, y + 0.87, tz + 0.26), 0x8a1c2a); } // plates, and a glass of red each
      put(M.plain, new THREE.CylinderGeometry(0.04, 0.05, 0.26, 8).translate(tx, y + 0.93, tz - 0.2), 0x2f5a3f);
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
      back: { x: x - 5, z: back - 2.2 }, burnt: false, burn() { intact.visible = false; ruin.visible = true; places.vesuvio.burnt = true; }, restore() { intact.visible = true; ruin.visible = false; places.vesuvio.burnt = false; },
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
      (places.flats ??= []).push({ door: shopDoors[shopDoors.length - 1].outside, kerb: { x: c.x + a * 14 + 4.4, z: c.z + b * 34, h: b > 0 ? Math.PI / 2 : -Math.PI / 2 } });
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
    (places.gasStations ??= []).push({ pumps: { x, z }, kerb: { x: x + 4, z: c.z + 34, h: Math.PI / 2 } });
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
    { // The park, kept: lamps on the paths, trees for shade, ducks and lilies on the pond, a playground, tables for chess,
      // a cart selling something hot, bins, a drinking fountain. (No dice are thrown here: the city's layout is not disturbed.)
      const first = !places.park, GLOBE = 0xfff2c0, IRON = 0x23232b;
      for (const [lx, lz] of [[-2.2, -18], [2.2, -8], [-2.2, 8], [2.2, 18], [-18, 2.2], [-8, -2.2], [8, 2.2], [18, -2.2]]) { post(IRON, 0.07, 3.2, c.x + lx, y, c.z + lz, 6); post(IRON, 0.14, 0.3, c.x + lx, y, c.z + lz, 8); ball(GLOBE, 0.24, c.x + lx, y + 3.35, c.z + lz, M.glow); halo(c.x + lx, y + 3.35, c.z + lz, 0xffd9a0, 4); collide(c.x + lx, c.z + lz, 0.3, 0.3, 3, true); }
      for (const [tx, tz, hgt] of [[-22, -9, 5], [-9, -23, 5.6], [22, 5, 5], [15, 21, 6], [-7, 21, 5.2], [-21, 13, 5.8], [24, 16, 5]]) { post(0x5a3d2b, 0.28, hgt * 0.55, c.x + tx, y, c.z + tz, 7); ball(0x2f7d46, hgt * 0.42, c.x + tx, y + hgt * 0.8, c.z + tz); ball(0x3f9a5a, hgt * 0.3, c.x + tx + hgt * 0.22, y + hgt * 0.95, c.z + tz - hgt * 0.12); ball(0x277040, hgt * 0.3, c.x + tx - hgt * 0.2, y + hgt * 0.72, c.z + tz + hgt * 0.16); collide(c.x + tx, c.z + tz, 0.7, 0.7, 4, true); }
      for (let n = 0; n < 7; n++) { const a = n * 0.9 + 0.3, r = 3 + (n % 3) * 2; put(M.plain, new THREE.CylinderGeometry(0.42, 0.42, 0.02, 9, 1, false, 0.5, 5.6).translate(px + Math.cos(a) * r, y + 0.335, pz + Math.sin(a) * r), 0x2f7d46); if (n % 3 === 0) ball(0xf7c8d4, 0.1, px + Math.cos(a) * r, y + 0.4, pz + Math.sin(a) * r); }
      for (let n = 0; n < 9; n++) { const a = 3.6 + n * 0.16; post(0x4a6a3a, 0.025, 1 + (n % 3) * 0.3, px + Math.cos(a) * 8.9, y + 0.3, pz + Math.sin(a) * 8.9, 4); if (n % 2) put(M.plain, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 5).translate(px + Math.cos(a) * 8.9, y + 1.25 + (n % 3) * 0.3, pz + Math.sin(a) * 8.9), 0x5a3d2b); } // bulrushes
      const ducks = [0, 1, 2, 3].map(k => { const d = makeDuck(); d.group.scale.setScalar(k === 0 ? 1.15 : 0.85); scene.add(d.group); return d; });
      const jet = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.85 })); scene.add(m); return m; });
      post(STONE, 0.3, 0.5, px, y + 0.2, pz, 8);
      updaters.push(t => {
        ducks.forEach((d, k) => { const a = t * (0.1 + k * 0.015) * (k % 2 ? -1 : 1) + k * 1.7, r = 3.4 + k * 1.1 + Math.sin(t * 0.2 + k) * 0.6; d.group.position.set(px + Math.cos(a) * r, y + 0.31 + Math.sin(t * 2 + k) * 0.012, pz + Math.sin(a) * r); d.group.rotation.y = -a + (k % 2 ? Math.PI : 0); });
        jet.forEach((m, n) => { const k = (t * 0.8 + n / 5) % 1; m.position.set(px + Math.sin(n * 1.26) * k * 0.5, y + 0.75 + Math.sin(k * Math.PI) * 1.5, pz + Math.cos(n * 1.26) * k * 0.5); });
      });
      // The playground, in the corner away from the water: swings (one going), a slide, a sandpit.
      const gx = c.x - 15, gz = c.z - 17;
      flat(M.paint, 0xe9d9a8, 9, 7, gx, y + 0.085, gz);
      for (const s of [-1, 1]) { for (const t of [-1, 1]) put(M.plain, new THREE.CylinderGeometry(0.05, 0.05, 2.7, 5).rotateX(t * 0.3).translate(gx - 2 + s * 1.6, y + 1.25, gz - 1.5 + t * 0.38), 0xd8342c); } slab(0xd8342c, 3.4, 0.1, 0.1, gx - 2, y + 2.5, gz - 1.5);
      const swing = new THREE.Group(), chainM = new THREE.MeshLambertMaterial({ color: 0x8a8d96 }); for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 4).translate(s * 0.22, -0.95, 0), chainM); swing.add(ch); } swing.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.2).translate(0, -1.9, 0), new THREE.MeshLambertMaterial({ color: 0x23232b })));
      swing.position.set(gx - 2.7, y + 2.45, gz - 1.5); scene.add(swing); const still = swing.clone(); still.position.x = gx - 1.3; scene.add(still); updaters.push(t => { swing.rotation.x = Math.sin(t * 2.1) * 0.5; });
      slab(0x2f56c8, 0.9, 1.6, 0.9, gx + 2.2, y, gz - 1.6); put(M.plain, new THREE.BoxGeometry(0.7, 0.06, 3).rotateX(0.5).translate(gx + 2.2, y + 0.82, gz + 0.3), 0xffe066); for (let k = 0; k < 5; k++) slab(0x2f56c8, 0.5, 0.05, 0.08, gx + 2.2, y + 0.3 + k * 0.28, gz - 2.1); collide(gx + 2.2, gz - 1.6, 1, 1, 1.6, true);
      put(M.wood, new THREE.BoxGeometry(2.6, 0.2, 2.2).translate(gx - 0.5, y + 0.1, gz + 2), 0x8a6a44); flat(M.paint, 0xf2dfa8, 2.3, 1.9, gx - 0.5, y + 0.22, gz + 2); slab(0xd8342c, 0.24, 0.2, 0.2, gx - 0.9, y + 0.22, gz + 1.8); ball(0xffe066, 0.12, gx - 0.1, y + 0.34, gz + 2.3);
      // Stone tables for chess, by the bandstand.
      for (const [k, [tx, tz]] of [[-18.5, 4.5], [-21.5, 6.5]].entries()) { post(STONE, 0.12, 0.72, c.x + tx, y, c.z + tz, 8); put(M.gravel, new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14).translate(c.x + tx, y + 0.76, c.z + tz), STONE); for (let n = 0; n < 16; n++) if ((n + (n >> 2)) % 2) slab(0x23232b, 0.09, 0.01, 0.09, c.x + tx - 0.14 + (n % 4) * 0.09, y + 0.8, c.z + tz - 0.14 + (n >> 2) * 0.09);
        for (const s of [-1, 1]) { post(STONE, 0.2, 0.45, c.x + tx + s * 0.95, y, c.z + tz, 8); if (first) { const old = makeHuman([{ shirt: 0xd9c7a0, sleeves: 'long', pants: 0x4a4652, hair: 0xe9e2cf, hat: 'cap', hatColor: 0x6f6a66, age: 0.9, bulk: 0.95 }, { shirt: 0x8d93cc, pants: 0x3a3a44, hair: 0xb9b6b0, hairStyle: 'balding', glasses: 'clear', age: 0.9 }, { shirt: 0xf4f4f0, sleeves: 'long', pants: 0x23232b, hair: 0x8d8a8e, age: 0.8, bulk: 1.15 }, { shirt: 0x2f5a3f, sleeves: 'long', pants: 0x4a4652, hair: 0xe9e2cf, age: 0.9 }][k * 2 + (s + 1) / 2]); old.group.position.set(c.x + tx + s * 0.95, y, c.z + tz); old.group.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; old.set('sit'); scene.add(old.group); } }
        collide(c.x + tx, c.z + tz, 1.2, 1.2, 1, true); }
      // The cart, on the path by the east gate; bins; the fountain you drink from.
      const hx = c.x + 21, hz = c.z + 3.4;
      slab(0xc9cbd2, 1.5, 0.9, 0.8, hx, y + 0.3, hz); for (const s of [-1, 1]) put(M.plain, new THREE.TorusGeometry(0.3, 0.04, 5, 14).rotateY(Math.PI / 2).translate(hx - 0.5, y + 0.3, hz + s * 0.44), IRON); post(0x8a8d96, 0.03, 0.3, hx + 0.6, y, hz, 5);
      post(0x8a8d96, 0.025, 1.6, hx, y + 1.2, hz, 5); put(M.plain, new THREE.ConeGeometry(1.2, 0.4, 8).translate(hx, y + 2.9, hz), 0xffe066); for (let n = 0; n < 4; n++) put(M.plain, new THREE.ConeGeometry(1.21, 0.41, 8, 1, true, n * Math.PI / 2, Math.PI / 4).translate(hx, y + 2.9, hz), 0xd8342c);
      sign('HOT DOGS', hx, y + 0.85, hz + 0.41, 0, { w: 1.3, h: 0.34, color: '#d8342c', bg: '#ffe066', size: 0.76, glow: false }); for (const [dx, hex] of [[-0.4, 0xd8342c], [-0.25, 0xffe066]]) post(hex, 0.04, 0.2, hx + dx, y + 1.2, hz + 0.2, 6); slab(0x8a6a44, 0.3, 0.1, 0.24, hx + 0.3, y + 1.2, hz);
      collide(hx, hz, 1.7, 1, 1.4);
      if (first) { const man = makeHuman({ shirt: 0xf4f4f0, tee: true, pants: 0x23232b, hair: 0x2b1b12, hat: 'cap', hatColor: 0xd8342c, mustache: 0x2b1b12, bulk: 1.15 }); man.group.position.set(hx, y, hz - 0.9); man.group.rotation.y = 0; scene.add(man.group); }
      const steam = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xf4f4f0, transparent: true, opacity: 0.3, depthWrite: false })); scene.add(m); return m; });
      updaters.push(t => steam.forEach((m, n) => { const k = (t * 0.4 + n / 3) % 1; m.position.set(hx + 0.3 + Math.sin(t + n) * 0.05, y + 1.3 + k * 0.9, hz); m.scale.setScalar(0.6 + k * 1.4); m.material.opacity = 0.3 * (1 - k); }));
      for (const [bx2, bz2] of [[13.6, 10.3], [-2.4, 4.6], [3.4, -18], [-18, -2.6]]) { post(0x1f6b4a, 0.24, 0.8, c.x + bx2, y, c.z + bz2, 10); post(IRON, 0.26, 0.05, c.x + bx2, y + 0.8, c.z + bz2, 10); }
      post(STONE, 0.18, 0.9, c.x + 2.6, y, c.z + 2.6, 8); put(M.gravel, new THREE.CylinderGeometry(0.3, 0.2, 0.14, 10).translate(c.x + 2.6, y + 0.95, c.z + 2.6), STONE); post(0x8a8d96, 0.02, 0.12, c.x + 2.6, y + 1.02, c.z + 2.6, 5);
      // Somebody's picnic, left for a minute; a ball; a kite that is never coming down.
      slab(0xd8342c, 2, 0.02, 1.6, c.x - 5, y + 0.07, c.z - 13); for (let n = 0; n < 12; n++) slab(0xf4f4f0, 0.24, 0.022, 0.24, c.x - 5.75 + (n % 4) * 0.5, y + 0.07, c.z - 13.6 + Math.floor(n / 4) * 0.5); slab(0x8a6a44, 0.4, 0.26, 0.3, c.x - 4.5, y + 0.08, c.z - 12.8, M.wood, 1); post(0x2f5a3f, 0.04, 0.26, c.x - 5.4, y + 0.08, c.z - 13.3, 6);
      ball(0xff8a30, 0.14, c.x + 7, y + 0.2, c.z + 14);
      put(M.plain, new THREE.ConeGeometry(0.4, 0.7, 4).scale(1, 1, 0.06).rotateZ(0.5).translate(c.x - 20.6, y + 6.9, c.z + 21.4), 0xff5fd2);
    }
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
    slab(0xd9a520, 0.22, 0.3, 0.04, x, y + 1.75, z - 5.87); // the brass 6 on the middle door, where the card game is
    shopDoors.push({ shop: 'CARDROOM', outside: { x, z: z - 4.8, h: 0 } });
    places.motel = { room: { x, z: z - 4.8, h: 0 }, kerb: { x: x + 4, z: c.z + 34, h: Math.PI / 2 }, office: { x: x - 4.6, z: z + 3 }, court: { x: x + 1, z: z - 1 }, officeDoor: { x: x - 4.4, z: z + 3, h: Math.PI / 2 } };
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

  // ----- A college up the coast: a brick hall with a white cupola over a quad, where Meadow has her interview -----
  function buildCollege(c) {
    const y = CURB, BRICK = 0xb5523b, top = y + FLOOR * 3;
    flat(M.grass, 0xffffff, BLOCK - 4, BLOCK - 4, c.x, y + 0.05, c.z, 6);
    put(M.stucco, walls(44, FLOOR * 3, 14, c.x, y, c.z - 19, 3), BRICK); collide(c.x, c.z - 19, 44, 14, top);
    gable(0x55525a, 15, 3.4, 45, c.x, top, c.z - 19, Math.PI / 2);
    slab(0xf4f2ee, 4.4, 5, 4.4, c.x, top + 2.6, c.z - 19, M.siding, 1); put(M.plain, new THREE.CylinderGeometry(1.5, 2.2, 2.2, 8).translate(c.x, top + 8.7, c.z - 19), 0xf4f2ee); put(M.plain, new THREE.ConeGeometry(1.7, 3, 8).translate(c.x, top + 11.3, c.z - 19), 0x2f6b5c);
    put(M.glow, new THREE.CircleGeometry(1, 16).translate(c.x, top + 5.2, c.z - 16.78), 0xfff1c9); slab(0x1c1c22, 0.08, 0.8, 0.04, c.x, top + 5.2, c.z - 16.75); // the clock
    slab(0xf4f2ee, 12, 0.5, 4, c.x, y + 4.4, c.z - 10.4); gable(0xf4f2ee, 12.4, 2, 4.2, c.x, y + 4.9, c.z - 10.4, 0, M.plain);
    for (const sx of [-4.8, -1.6, 1.6, 4.8]) post(0xf4f2ee, 0.28, 4.4, c.x + sx, y, c.z - 9, 12);
    slab(0x3a2418, 2.6, 3.2, 0.2, c.x, y, c.z - 11.95); for (let n = 0; n < 3; n++) slab(0xd8d0c4, 10 - n, 0.18, 1, c.x, y + n * 0.18, c.z - 8 - n * 0.5);
    flat(M.paint, 0xd8d0c4, 3, 26, c.x, y + 0.09, c.z + 6); flat(M.paint, 0xd8d0c4, BLOCK - 8, 2.6, c.x, y + 0.09, c.z + 8);
    for (const [bx, bz, t] of [[-6, 10, Math.PI], [6, 10, Math.PI], [-14, 6.2, 0], [14, 6.2, 0]]) bench(c.x + bx, c.z + bz, t);
    post(0xc9cbd2, 0.07, 10, c.x + 18, y, c.z + 2); [0xd8342c, 0xf4f4f4, 0x2f56c8].forEach((hex, n) => slab(hex, 2.4, 0.45, 0.04, c.x + 19.3, y + 9.5 - n * 0.45, c.z + 2));
    slab(0xd8d0c4, 6, 1.6, 0.6, c.x, y, c.z + 24, M.gravel, 2);
    sign(['BOWDOIN COLLEGE', 'FOUNDED 1794'], c.x, y + 0.9, c.z + 24.32, 0, { w: 5.6, h: 1.3, color: '#f4f2ee', bg: '#2c3a5a', size: 0.66, glow: false });
    slab(0xd8d0c4, 3, 1.2, 0.3, c.x - 12, y, c.z - 11.8, M.gravel, 2); sign(['NO MAN CAN WEAR ONE FACE', 'TO HIMSELF AND ANOTHER TO THE CROWD', 'AND LONG REMEMBER WHICH IS HIS OWN'], c.x - 12, y + 0.65, c.z - 11.62, 0, { w: 2.8, h: 1, color: '#2a2a30', bg: '#d8d0c4', size: 0.62, glow: false });
    for (const [px, pz] of [[-22, 18], [22, 18], [-24, -4], [24, -6], [-10, 22], [10, 22]]) palms.push({ x: c.x + px, z: c.z + pz });
    shopDoors.push({ shop: 'SCHOOL', outside: { x: c.x, z: c.z - 9.6, h: 0 } });
    places.college = { kerb: { x: c.x + 4, z: c.z + 34, h: Math.PI / 2 }, quad: { x: c.x, z: c.z + 8 }, door: { x: c.x, z: c.z - 7.4 }, bench: { x: c.x + 6, z: c.z + 9.4 }, stone: { x: c.x - 12, z: c.z - 9.6 } };
  }

  // ----- Peters Travel: a storefront on the south-west lot, posters of somewhere else in the window -----
  function buildTravel(c) {
    const x = c.x - 13, z = c.z + 13, y = CURB, front = z + 7;
    slab(0xf4f2ee, 14, 4.6, 14, x, y, z, M.siding, 1); collide(x, z, 14, 14, y + 4.6);
    slab(0x2f56c8, 14.3, 0.8, 14.3, x, y + 3.6, z); slab(0x55525a, 14.6, 0.3, 14.6, x, y + 4.6, z);
    windowAt(x - 3.4, y + 0.9, front, 5, 2.2, 0, 1, true); for (let n = 0; n < 3; n++) slab([0x49e0d0, 0xff8a5c, 0xffe066][n], 1.1, 1.5, 0.04, x - 5 + n * 1.6, y + 1.2, front + 0.09, M.glow); // posters
    slab(0x3a2418, 1.6, 2.8, 0.2, x + 3.6, y, front + 0.05);
    sign(['PETERS TRAVEL', 'CRUISES · TOURS · AIRLINE TICKETS'], x, y + 5.3, front - 1, 0, { w: 9, h: 1.6, color: '#f4f2ee', bg: '#2f56c8', size: 0.62, glow: false }); slab(0x2f56c8, 9.4, 2, 0.3, x, y + 4.5, front - 1.2);
    slab(0x55525a, 1.2, 2.4, 0.16, x - 4, y, z - 7.04);
    shopDoors.push({ shop: 'OFFICE', outside: { x: x + 3.6, z: front + 1.6, h: 0 } });
    places.travel = { door: { x: x + 3.6, z: front + 1.6, h: 0 }, kerb: { x, z: c.z + 34, h: Math.PI / 2 }, back: { x: x - 4, z: z - 9 }, woods: { x: x + 2, z: z - 14 } };
  }

  // ----- The Manor: a banquet hall at the south end of Ocean Drive, where the family holds its dinners -----
  function buildManor(c) {
    const y = CURB, x = c.x, z = c.z - 8, front = z + 11, CREAM = 0xf6eedc;
    flat(M.tarmac, 0xffffff, BLOCK - 6, 22, c.x, y + 0.015, c.z + 16, 5);
    slab(CREAM, 42, 8, 22, x, y, z, M.gravel, 3); collide(x, z, 42, 22, y + 8);
    slab(0xc9b79c, 42.1, 0.9, 22.1, x, y, z, M.brick, 2); slab(0xffffff, 43, 0.4, 23, x, y + 8, z);
    hip(0xd0623a, 44, 24, 3.6, x, y + 8.4, z, 0.4);
    for (const s of [-1, 1]) for (const k of [8, 13, 18]) { windowAt(x + s * k, y + 1.3, front, 2.6, 4, 0, 1, true); slab(0xffffff, 3.2, 0.5, 0.3, x + s * k, y + 5.4, front + 0.1); }
    // The porte-cochere: four columns and a canopy over the doors, a red carpet out to the cars.
    slab(0xffffff, 13, 0.5, 8, x, y + 4.6, front + 4); slab(0xd0623a, 13.4, 0.3, 8.4, x, y + 5.1, front + 4);
    for (const s of [-1, 1]) for (const t of [1.4, 7.4]) { post(0xffffff, 0.32, 4.6, x + s * 5.8, y, front + t, 12); collide(x + s * 5.8, front + t, 0.7, 0.7, 4.6, true); }
    slab(0x3a2418, 3.4, 3.4, 0.2, x, y, front + 0.05); slab(0xd9a520, 0.08, 3.4, 0.24, x, y, front + 0.07); for (const s of [-1, 1]) slab(0xf0bf78, 0.9, 1.6, 0.06, x + s * 0.85, y + 1.3, front + 0.17, M.glow);
    slab(0x8a1c2a, 3, 0.03, 9, x, y + 0.02, front + 4.6); for (const s of [-1, 1]) { ball(0x2f7d46, 0.7, x + s * 2.6, y + 1, front + 1); slab(0xb9a58a, 0.9, 0.5, 0.9, x + s * 2.6, y, front + 1); ball(0xffe2a6, 0.16, x + s * 2.2, y + 3, front + 0.3, M.glow); }
    sign(['The Manor', 'BANQUETS  ·  WEDDINGS  ·  TESTIMONIALS'], x, y + 6.9, front + 0.3, 0, { w: 15, h: 2.3, color: '#f6e7b4', bg: '#3a1414', font: '"Mr Dafoe", cursive', size: 0.7 });
    halo(x, y + 4, front + 6, 0xffd9a8, 10); lamp(x, y + 4.3, front + 4, 0xffe2a6, 40, 18);
    for (const s of [-1, 1]) for (const k of [0, 1]) palms.push({ x: x + s * (19 + k * 6), z: c.z + 8 });
    shopDoors.push({ shop: 'BANQUET', outside: { x, z: front + 1.6, h: 0 } });
    places.manor = { door: { x, z: front + 1.6, h: 0 }, kerb: { x: x + 6, z: c.z + 34, h: Math.PI / 2 }, lot: { x: x - 14, z: c.z + 18 } };
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

  // ----- The airport hotel: a slab of rooms over a glass lobby, a canopy for the taxis, the runway at its back door -----
  function buildHotel(c) {
    const y = CURB, x = c.x, z = c.z - 12, front = z + 11;
    building(x, z, 40, 22, 64, { style: 'office', tint: 0xffe2b8, fx: 0, fz: 0 });
    slab(0x1a242c, 16, 4, 0.2, x, y, front + 0.06); for (let n = -3; n <= 3; n++) slab(0xc9cbd2, 0.1, 4, 0.24, x + n * 2.3, y, front + 0.08);        // the lobby's glass
    slab(0xf0bf78, 14, 2.6, 0.06, x, y + 0.6, front + 0.2, M.glow);
    slab(0xf4f4f0, 20, 0.5, 9, x, y + 4.6, front + 4.6); slab(0x1c2740, 20.4, 0.9, 9.4, x, y + 5.1, front + 4.6);
    for (const s of [-1, 1]) for (const t of [1.2, 8]) { post(0xc9cbd2, 0.3, 4.6, x + s * 9, y, front + t, 10); collide(x + s * 9, front + t, 0.7, 0.7, 4.6, true); }
    for (let n = -3; n <= 3; n++) { ball(0xffe2a6, 0.14, x + n * 2.6, y + 4.5, front + 4.6, M.glow); if (n % 3 === 0) halo(x + n * 2.6, y + 4.4, front + 4.6, 0xffd9a8, 4); }
    sign(['AIRPORT REGENT', 'HOTEL  ·  COCKTAILS  ·  CONVENTIONS'], x, y + 7.6, front + 0.4, 0, { w: 16, h: 2.6, color: '#f4f4f0', bg: '#1c2740', size: 0.66 });
    sign('REGENT', x, y + 60, front + 0.3, 0, { w: 14, h: 3, color: '#ff8a5c', bg: '#14080f', size: 0.9 }); halo(x, y + 60, front + 2, 0xff8a5c, 10);
    flat(M.tarmac, 0xffffff, BLOCK - 4, 24, c.x, y + 0.015, c.z + 16, 5);
    for (const s of [-1, 1]) { slab(0xb9a58a, 2, 0.8, 2, x + s * 13, y, front + 3, M.gravel, 2); ball(0x2f7d46, 1.1, x + s * 13, y + 1.6, front + 3); palms.push({ x: x + s * 24, z: c.z + 12 }); }
    lamp(x, y + 4.2, front + 5, 0xffe2a6, 50, 22);
    shopDoors.push({ shop: 'HOTEL', outside: { x, z: front + 1.8, h: 0 } });
    places.hotel = { door: { x, z: front + 1.8, h: 0 }, kerb: { x: x + 6, z: c.z + 34, h: Math.PI / 2 }, forecourt: { x, z: c.z + 14 } };
  }

  // ----- The container yard by the harbour: stacks three high in rows, a gantry crane, and a square of empty ground in the middle -----
  function buildContainers(c) {
    const y = 0.03, COLS = [0xd8342c, 0x2f56c8, 0x1f6b4a, 0xf2c230, 0x8d8a8e, 0xb5523b, 0x49a0d0];
    flat(M.asphalt, 0xffffff, BLOCK - 2, BLOCK - 2, c.x, y, c.z, 5); lowGround.push({ x: c.x, z: c.z, half: BLOCK / 2 - 1 });
    const stack = (x, z, n, alongX) => { // n boxes high
      for (let k = 0; k < n; k++) slab(COLS[Math.floor(rand() * COLS.length)], alongX ? 12 : 2.5, 2.6, alongX ? 2.5 : 12, x, y + k * 2.6, z, M.siding, 0.6);
      collide(x, z, alongX ? 12 : 2.5, alongX ? 2.5 : 12, n * 2.6);
    };
    for (const sx of [-24, -20.5, 20.5, 24]) for (const sz of [-18, -4, 10]) stack(c.x + sx, c.z + sz, 2 + Math.floor(rand() * 2), false); // the long rows either side
    for (const sx of [-10, 4]) stack(c.x + sx, c.z - 25, 3, true);                                   // and across the north end
    stack(c.x - 12, c.z + 24, 2, true);
    // The crane: two legs each side and a beam across, with its cab.
    for (const sx of [-15, 15]) for (const sz of [-12, -8]) slab(0xf2c230, 0.8, 18, 0.8, c.x + sx, y, c.z + sz);
    slab(0xf2c230, 34, 1.4, 5, c.x, 18, c.z - 10); slab(0x1c1c22, 3, 2.2, 3, c.x + 6, 15.8, c.z - 10); post(0x1c1c22, 0.05, 9, c.x + 6, 6.8, c.z - 10, 4);
    for (const sx of [-15, 15]) collide(c.x + sx, c.z - 10, 1.2, 5, 18);
    for (const s of [-1, 1]) { post(STEEL, 0.1, 9, c.x + s * 12, y, c.z + 14); slab(0xffe2a6, 0.9, 0.1, 0.5, c.x + s * 11.4, 9, c.z + 14, M.glow); halo(c.x + s * 11.4, 8.9, c.z + 14, 0xcfe0ff, 4); }
    lamp(c.x, 8, c.z + 4, 0xcfe0ff, 70, 36);
    for (let n = 0; n < 9; n++) slab(0x8a8d96, 0.5, 0.05, 0.05, c.x + 3.6, y + 0.4 + n * 0.8, c.z - 23.7); for (const s of [-1, 1]) post(0x8a8d96, 0.03, 7.8, c.x + 3.6 + s * 0.25, y, c.z - 23.7, 4); // a ladder up the north stack
    sign(['HARBOR FREIGHT TERMINAL', 'BERTH 46 · AUTHORIZED ONLY'], c.x, 4.6, c.z + 25.4, 0, { w: 10, h: 1.6, color: '#f4f4f0', bg: '#1c2740', size: 0.62, glow: false });
    places.containers = { gate: { x: c.x + 8, z: c.z + 34, h: Math.PI / 2 }, centre: { x: c.x, z: c.z + 4 }, ladder: { x: c.x + 3.6, z: c.z - 22.2 },
      high: { x: c.x + 4, y: 9.6, z: c.z - 24 }, spots: [{ x: c.x - 9, z: c.z + 2 }, { x: c.x + 9, z: c.z - 2 }, { x: c.x, z: c.z + 13 }] };
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
    const X = 2680, Y = -0.1, Z = 0, WOOD = 0x3a2418, PINK = 0xff3fe0, CYAN = 0x49e0d0, RED = 0xff2a4a, AMBER = 0xffb060, VIOLET = 0x8a5cff, BLACK = 0x0e0a14, VINYL = 0x8a1228, CHROME = 0xd8dce6;
    const q = { minX: X - 9.7, maxX: X + 9.7, minZ: Z - 6.7, maxZ: Z + 6.7, lights: [] };
    interiors.push(q);
    const rnd = mulberry32(77);                                                                 // its own dice: the city's are not touched
    const tube = (hex, w, h, d, x, y, z) => slab(hex, w, h, d, x, y, z, M.glow);                  // a length of neon
    // The shell: a black gloss floor that takes the lights, a black ceiling, walls the colour of a bruise.
    slab(0x120c18, 20, 0.2, 14, X, Y - 0.2, Z);
    const gloss = texture(256, 256, (c, w) => {
      c.fillStyle = '#140d1c'; c.fillRect(0, 0, w, w);
      c.strokeStyle = 'rgba(160,120,200,.22)'; c.lineWidth = 2; c.strokeRect(0, 0, w, w);
      for (let n = 0; n < 60; n++) { c.fillStyle = `rgba(${200 + rnd() * 55 | 0},${140 + rnd() * 80 | 0},255,${0.15 + rnd() * 0.3})`; c.fillRect(rnd() * w, rnd() * w, 1.5, 1.5); }
    });
    gloss.repeat.set(14, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 13.4).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: gloss, shininess: 110, specular: 0x8a6ab0 }));
    floor.position.set(X, Y + 0.005, Z); scene.add(floor);
    slab(0x0c0812, 20, 0.2, 14, X, Y + 4.2, Z);
    for (const s of [-1, 1]) { slab(0x2a1634, 20, 4.4, 0.3, X, Y, Z + s * 7.15); slab(0x2a1634, 0.3, 4.4, 14, X + s * 10.15, Y, Z); }
    for (const s of [-1, 1]) { slab(VINYL, 19.4, 0.9, 0.06, X, Y, Z + s * 6.97); slab(VINYL, 0.06, 0.9, 13.4, X + s * 9.97, Y, Z); } // a padded dado all the way round
    // Mirrors: what a mirror in a room like this shows is mostly the neon, so that is what is painted on them.
    const mirror = texture(256, 256, (c, w) => {
      const gr = c.createLinearGradient(0, 0, 0, w); gr.addColorStop(0, '#181230'); gr.addColorStop(0.55, '#3a3466'); gr.addColorStop(1, '#120e22');
      c.fillStyle = gr; c.fillRect(0, 0, w, w);
      for (let n = 0; n < 22; n++) {
        const x = rnd() * w, y = rnd() * w, r = 10 + rnd() * 34, hue = ['255,63,224', '73,224,208', '255,176,96', '138,92,255', '255,42,74'][n % 5];
        const g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, `rgba(${hue},.75)`); g2.addColorStop(1, `rgba(${hue},0)`);
        c.fillStyle = g2; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.strokeStyle = 'rgba(230,236,255,.5)'; c.lineWidth = 2; for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64, w); c.stroke(); }
    });
    const glass = (w, h, x, y, z, turn) => { const t = mirror.clone(); t.needsUpdate = true; t.repeat.set(w / 3.2, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.rotation.y = turn; m.position.set(x, y, z); scene.add(m); };
    glass(8.6, 2.9, X - 5.5, Y + 2.5, Z - 6.98, 0);                                               // behind the stage
    glass(8.8, 1.9, X - 9.98, Y + 2.3, Z + 2.4, Math.PI / 2);                                     // over the banquette on the west wall
    glass(5.6, 1.9, X - 6.8, Y + 2.3, Z + 6.98, Math.PI);                                         // and the one on the south wall
    for (const [x0, x1, z0, z1] of [[-9.8, -1.2, -6.96, -6.96], [-9.96, -9.96, -2, 6.8], [-9.6, -4, 6.96, 6.96]]) for (const y of [1.02, 3.98]) tube(y < 2 ? PINK : CYAN, Math.max(0.04, x1 - x0), 0.04, Math.max(0.04, z1 - z0), X + (x0 + x1) / 2, Y + y, Z + (z0 + z1) / 2);
    // Neon round the top of the walls, and tubes on the ceiling running the length of the room.
    for (const s of [-1, 1]) { tube(PINK, 19.4, 0.05, 0.05, X, Y + 4.1, Z + s * 6.9); tube(CYAN, 0.05, 0.05, 13.4, X + s * 9.9, Y + 4.1, Z); }
    for (let k = 0; k < 5; k++) tube([VIOLET, PINK, RED, PINK, VIOLET][k], 0.04, 0.04, 5.2, X + 1 + k * 1.6, Y + 4.16, Z + 0.4);

    // The bar along the back wall: lit from under the lip, shelves lit from behind, towers of beer, the bell.
    slab(WOOD, 9, 1.1, 0.9, X + 4, Y, Z - 5.2, M.wood, 2); slab(0x14080f, 9.3, 0.08, 1.1, X + 4, Y + 1.1, Z - 5.2);
    tube(CYAN, 9, 0.04, 0.04, X + 4, Y + 1.02, Z - 4.72); tube(PINK, 9, 0.04, 0.04, X + 4, Y + 0.06, Z - 4.72);
    for (let k = 0; k < 9; k++) slab(0x241018, 0.9, 0.86, 0.03, X + 0 + k * 1, Y + 0.12, Z - 4.74, M.wood, 1);                           // panels on the front of it
    slab(0x14080f, 9, 2.6, 0.3, X + 4, Y + 1.1, Z - 6.85);
    for (let r = 0; r < 3; r++) {
      slab([0xff5fd2, 0x49e0d0, 0xffb060][r], 8.6, 0.62, 0.04, X + 4, Y + 1.32 + r * 0.72, Z - 6.68, M.glow);
      slab(0x14080f, 8.8, 0.05, 0.3, X + 4, Y + 1.28 + r * 0.72, Z - 6.56);
      for (let n = 0; n < 22; n++) post([0xd9a520, 0x2f7d46, 0xc8312a, 0xe9e2cf, 0x8a5a2a, 0x3b6ea8][(n + r * 2) % 6], 0.045, 0.3 + ((n + r) % 3) * 0.06, X - 0.1 + n * 0.39, Y + 1.33 + r * 0.72, Z - 6.5, 6);
    }
    for (let n = 0; n < 5; n++) { post(CHROME, 0.04, 0.75, X + 0.8 + n * 1.6, Y, Z - 4.2); post(VINYL, 0.22, 0.08, X + 0.8 + n * 1.6, Y + 0.75, Z - 4.2, 10); put(M.plain, new THREE.TorusGeometry(0.17, 0.015, 5, 14).rotateX(Math.PI / 2).translate(X + 0.8 + n * 1.6, Y + 0.3, Z - 4.2), CHROME); }
    slab(0x1c1c22, 0.26, 0.1, 0.2, X + 1.3, Y + 1.18, Z - 5.2); slab(0x1c1c22, 0.07, 0.07, 0.24, X + 1.3, Y + 1.3, Z - 5.2);    // the house phone
    for (let n = 0; n < 5; n++) { put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.11, 8).translate(X + 0.55 + n * 1.6, Y + 1.24, Z - 4.9), 0xcfe8ff); if (n % 2 === 0) put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10).translate(X + 1.05 + n * 1.6, Y + 1.19, Z - 5), 0x8d8a8e); else slab(0x8a5a2a, 0.07, 0.24, 0.07, X + 1.1 + n * 1.6, Y + 1.18, Z - 5.05); }
    for (const bx of [2.6, 6.2]) { post(0x1c1c22, 0.11, 0.05, X + bx, Y + 1.18, Z - 5.35, 10); put(M.glow, new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10).translate(X + bx, Y + 1.58, Z - 5.35), 0xe0a12c); post(CHROME, 0.08, 0.06, X + bx, Y + 1.93, Z - 5.35, 10); } // beer towers
    for (let n = 0; n < 4; n++) { post(0x8a5a44, 0.045, 0.1, X + 0.2 + n * 2.4, Y + 1.18, Z - 4.86, 8); slab(0xf4f4f0, 0.04, 0.09, 0.005, X + 0.2 + n * 2.4, Y + 1.24, Z - 4.86); } // the cups the bills go in
    slab(0x23232b, 0.42, 0.3, 0.36, X + 7.9, Y + 1.18, Z - 5.3); slab(0x7dffb0, 0.3, 0.12, 0.02, X + 7.9, Y + 1.36, Z - 5.11, M.glow);  // the till
    post(0xc9cbd2, 0.16, 0.2, X + 5.2, Y + 1.18, Z - 5.45, 10); for (let n = 0; n < 4; n++) ball(0x8fd14f, 0.035, X + 4.5 + (n % 2) * 0.08, Y + 1.24, Z - 5.45 + (n >> 1) * 0.08); // ice, limes
    slab(0x14080f, 8.6, 0.05, 0.5, X + 4, Y + 2.25, Z - 5.2); for (let n = 0; n < 26; n++) put(M.plain, new THREE.CylinderGeometry(0.035, 0.02, 0.13, 6).translate(X - 0.1 + n * 0.33, Y + 2.17, Z - 5.2 + (n % 2) * 0.16 - 0.08), 0xcfe8ff); // glasses hung over the bar
    for (const hx of [-0.2, 8.2]) post(CHROME, 0.015, 1.9, X + hx, Y + 2.3, Z - 5.2, 4);
    put(M.plain, new THREE.ConeGeometry(0.1, 0.16, 10, 1, true).translate(X - 0.2, Y + 1.9, Z - 4.9), 0xd9a520); post(0xd9a520, 0.008, 0.3, X - 0.2, Y + 1.95, Z - 4.9, 4); // the bell: ring it and the round is yours
    sign('Bada Bing!', X + 4, Y + 3.82, Z - 6.66, 0, { w: 4.4, h: 0.7, color: '#ff5fd2', bg: '#14080f', font: '"Mr Dafoe", cursive', size: 0.8 });

    // The stage: the round where it always was, and a runway out into the room, both lit from inside, five poles.
    const sx = X - 6.4, sz = Z - 3.6, TOP = 0.55;
    put(M.plain, new THREE.CylinderGeometry(2.4, 2.4, TOP, 28).translate(sx, Y + TOP / 2, sz), BLACK);
    slab(BLACK, 1.9, TOP, 5, sx, Y, Z + 0.9); put(M.plain, new THREE.CylinderGeometry(1.35, 1.35, TOP, 22).translate(sx, Y + TOP / 2, Z + 3.4), BLACK);
    put(M.glow, new THREE.TorusGeometry(2.4, 0.04, 6, 36).rotateX(Math.PI / 2).translate(sx, Y + TOP + 0.01, sz), PINK); put(M.glow, new THREE.TorusGeometry(2.42, 0.04, 6, 36).rotateX(Math.PI / 2).translate(sx, Y + 0.05, sz), CYAN);
    put(M.glow, new THREE.TorusGeometry(1.35, 0.04, 6, 28).rotateX(Math.PI / 2).translate(sx, Y + TOP + 0.01, Z + 3.4), PINK); put(M.glow, new THREE.TorusGeometry(1.37, 0.04, 6, 28).rotateX(Math.PI / 2).translate(sx, Y + 0.05, Z + 3.4), CYAN);
    for (const s of [-1, 1]) { tube(PINK, 0.05, 0.05, 3.6, sx + s * 0.95, Y + TOP - 0.02, Z + 0.4); tube(CYAN, 0.05, 0.05, 3.6, sx + s * 0.97, Y + 0.03, Z + 0.4); }
    for (let n = 0; n < 14; n++) { const a = n / 14 * Math.PI * 2; ball(0xfff2c0, 0.035, sx + Math.sin(a) * 2.43, Y + 0.3, sz + Math.cos(a) * 2.43, M.glow); } // bulbs round the skirt
    const poles = [[0, 0], [-1.35, -0.5], [1.35, -0.5], [0, 4.2], [0, 7]].map(([dx, dz]) => ({ x: sx + dx, z: sz + dz }));
    for (const at of poles) { post(CHROME, 0.035, 4.2 - TOP, at.x, Y + TOP, at.z, 10); post(0xd9a520, 0.12, 0.03, at.x, Y + TOP, at.z, 12); post(0xd9a520, 0.1, 0.03, at.x, Y + 4.17, at.z, 12); }
    // The floor of the stage is squares of light that chase one another.
    const PAL = [PINK, CYAN, AMBER, VIOLET], LED = PAL.map(hex => new THREE.MeshBasicMaterial({ color: hex })), tileGeo = new THREE.PlaneGeometry(0.56, 0.56).rotateX(-Math.PI / 2);
    const led = (x, z, k) => { const m = new THREE.Mesh(tileGeo, LED[k & 3]); m.position.set(x, Y + TOP + 0.006, z); scene.add(m); };
    for (let i = 0; i < 3; i++) for (let j = 0; j < 9; j++) led(sx + (i - 1) * 0.6, Z - 1.6 + j * 0.6, i + j);
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const dx = (i - 3) * 0.6, dz = (j - 3) * 0.6; if (Math.hypot(dx, dz) < 2.05 && dz < 1.5) led(sx + dx, sz + dz, i + j * 2); }
    const tmpC = new THREE.Color();
    updaters.push(t => { const k = Math.floor(t * 2.4); LED.forEach((m, n) => m.color.copy(tmpC.setHex(PAL[(n + k) & 3])).multiplyScalar(0.34 + 0.2 * Math.sin(t * 5 + n * 1.7))); });
    // Over it: a truss of cans, beams that sweep, and the mirror ball throwing its coins across the floor.
    for (const tz of [-4.9, -2.3]) slab(0x23232b, 5.4, 0.08, 0.08, sx, Y + 3.9, Z + tz); slab(0x23232b, 0.08, 0.08, 6.6, sx, Y + 3.9, Z + 0.9);
    const beams = [];
    for (const [n, [bx, bz, hex]] of [[-2, -4.9, PINK], [2, -4.9, CYAN], [-2, -2.3, AMBER], [2, -2.3, VIOLET], [0, 0.4, PINK], [0, 3.2, CYAN]].entries()) {
      put(M.plain, new THREE.CylinderGeometry(0.11, 0.15, 0.26, 10).translate(sx + bx, Y + 3.74, Z + bz), 0x16161c); put(M.glow, new THREE.CircleGeometry(0.13, 12).rotateX(Math.PI / 2).translate(sx + bx, Y + 3.6, Z + bz), hex);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.1, 14, 1, true).translate(0, -1.55, 0), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(sx + bx, Y + 3.62, Z + bz); scene.add(beam); beams.push([beam, n]);
    }
    const mball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshPhongMaterial({ color: 0xdfe6f2, specular: 0xffffff, shininess: 220, flatShading: true, emissive: 0x3a3a52 }));
    mball.position.set(X - 2.6, Y + 3.55, Z - 0.4); scene.add(mball); post(0x23232b, 0.015, 0.35, X - 2.6, Y + 3.85, Z - 0.4, 4);
    const coins = new THREE.Group(), coinMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let n = 0; n < 34; n++) { const a = n * 2.4, r = 0.8 + ((n * 0.371) % 1) * 7.5, d = new THREE.Mesh(new THREE.CircleGeometry(0.07 + (n % 3) * 0.035, 8).rotateX(-Math.PI / 2), coinMat); d.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); coins.add(d); }
    coins.position.set(X - 2.6, Y + 0.02, Z - 0.4); scene.add(coins);
    updaters.push(t => { mball.rotation.y = t * 0.7; coins.rotation.y = -t * 0.32; for (const [b, n] of beams) { b.rotation.z = Math.sin(t * 0.9 + n * 1.3) * 0.34; b.rotation.x = Math.cos(t * 0.7 + n * 2.1) * 0.3; } });

    // Banquettes in red vinyl under the mirrors, low tables in front of them: a glass, a bottle, the cup with the bill in it.
    slab(VINYL, 0.75, 0.45, 7.2, X - 9.5, Y, Z + 2.5); slab(0x6a0e20, 0.2, 0.75, 7.2, X - 9.8, Y + 0.45, Z + 2.5); slab(0x16101c, 0.8, 0.08, 7.3, X - 9.5, Y, Z + 2.5);
    slab(VINYL, 5.6, 0.45, 0.75, X - 6.8, Y, Z + 6.45); slab(0x6a0e20, 5.6, 0.75, 0.2, X - 6.8, Y + 0.45, Z + 6.78);
    for (let n = 0; n < 9; n++) ball(0x4a0a18, 0.03, X - 9.69, Y + 0.85, Z - 0.7 + n * 0.8); for (let n = 0; n < 7; n++) ball(0x4a0a18, 0.03, X - 9.2 + n * 0.8, Y + 0.85, Z + 6.67);
    const lowTable = (x, z, k) => {
      post(CHROME, 0.03, 0.55, x, Y, z, 6); post(CHROME, 0.2, 0.02, x, Y, z, 12); put(M.plain, new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16).translate(x, Y + 0.56, z), 0x16101c);
      put(M.glow, new THREE.TorusGeometry(0.32, 0.012, 4, 18).rotateX(Math.PI / 2).translate(x, Y + 0.585, z), k % 2 ? CYAN : PINK);
      put(M.plain, new THREE.CylinderGeometry(0.03, 0.035, 0.2, 8).translate(x - 0.12, Y + 0.68, z + 0.05), [0x8a5a2a, 0x2f7d46][k % 2]); put(M.plain, new THREE.CylinderGeometry(0.035, 0.028, 0.11, 8).translate(x + 0.1, Y + 0.635, z - 0.1), 0xcfe8ff);
      post(0x8a5a44, 0.04, 0.09, x + 0.08, Y + 0.58, z + 0.14, 8); slab(0xf4f4f0, 0.035, 0.08, 0.005, x + 0.08, Y + 0.63, z + 0.14);
    };
    [[-8.55, -0.2], [-8.55, 1.8], [-8.55, 3.8]].forEach(([x, z], k) => lowTable(X + x, Z + z, k)); [[-8.4, 5.5], [-6.6, 5.5], [-4.8, 5.5]].forEach(([x, z], k) => lowTable(X + x, Z + z, k + 1));

    // The crew's table, with the week's envelopes on it.
    const tx = X - 1.5, tz = Z + 2.6, seats = [];
    post(WOOD, 0.14, 0.72, tx, Y, tz, 8); put(M.plain, new THREE.CylinderGeometry(1.35, 1.35, 0.07, 24).translate(tx, Y + 0.75, tz), 0x1f5a3a);
    put(M.glow, new THREE.TorusGeometry(1.35, 0.015, 4, 30).rotateX(Math.PI / 2).translate(tx, Y + 0.72, tz), AMBER);
    for (let n = 0; n < 7; n++) slab(n % 3 ? 0x86b87e : 0xe9e2cf, 0.3, 0.05 + (n % 3) * 0.04, 0.16, tx - 0.6 + (n % 4) * 0.36, Y + 0.79, tz - 0.3 + (n % 3) * 0.3);
    put(M.plain, new THREE.CylinderGeometry(0.09, 0.09, 0.025, 10).translate(tx + 0.75, Y + 0.8, tz + 0.5), 0x8d8a8e); slab(0x8a5a2a, 0.07, 0.26, 0.07, tx - 0.85, Y + 0.79, tz + 0.55); // an ashtray, a bottle
    for (let n = 0; n < 6; n++) {
      const a = n * Math.PI / 3 + 0.5, cx = tx + Math.sin(a) * 2.05, cz = tz + Math.cos(a) * 2.05;
      post(VINYL, 0.26, 0.08, cx, Y + 0.44, cz, 10); post(0x1c1c22, 0.04, 0.44, cx, Y, cz);
      put(M.plain, new THREE.BoxGeometry(0.5, 0.6, 0.07).translate(0, 0.8, -0.28).rotateY(a).translate(cx, Y, cz), VINYL);
      seats.push({ x: cx, y: Y, z: cz, h: a + Math.PI });
    }
    // The pool table under its lamp, the cues on the wall, a television nobody watches.
    slab(WOOD, 2.6, 0.8, 1.4, X + 6.4, Y, Z + 3.4, M.wood, 2); slab(0x1f6b4a, 2.4, 0.04, 1.2, X + 6.4, Y + 0.8, Z + 3.4);
    for (const s of [-1, 1]) { slab(WOOD, 2.6, 0.06, 0.1, X + 6.4, Y + 0.82, Z + 3.4 + s * 0.65, M.wood, 1); slab(WOOD, 0.1, 0.06, 1.4, X + 6.4 + s * 1.25, Y + 0.82, Z + 3.4, M.wood, 1); }
    for (let n = 0; n < 9; n++) ball([0xf2c230, 0x2f56c8, 0xd8342c, 0x8a5cff, 0xff8a5c, 0x2f7d46, 0x8a1c1c, 0x16161c, 0xf4f4f0][n], 0.035, X + 5.7 + (n % 5) * 0.32 + (n > 4 ? 0.1 : 0), Y + 0.875, Z + 3.2 + (n % 3) * 0.2);
    put(M.plain, new THREE.CylinderGeometry(0.012, 0.008, 1.4, 5).rotateZ(Math.PI / 2).rotateY(0.5).translate(X + 6.7, Y + 0.87, Z + 3.7), 0xd9b48a);
    slab(0x1f6b4a, 1.6, 0.16, 0.6, X + 6.4, Y + 2.1, Z + 3.4); slab(0xfff2c0, 1.4, 0.02, 0.45, X + 6.4, Y + 2.09, Z + 3.4, M.glow); for (const s of [-1, 1]) post(0x23232b, 0.01, 1.9, X + 6.4 + s * 0.6, Y + 2.26, Z + 3.4, 4);
    slab(WOOD, 1.2, 0.1, 0.06, X + 6.4, Y + 1.9, Z + 6.94, M.wood, 1); for (let n = 0; n < 4; n++) post(0xd9b48a, 0.012, 1.35, X + 6 + n * 0.27, Y + 0.6, Z + 6.9, 5);
    slab(0x1c1c22, 0.12, 1, 1.5, X - 9.9, Y + 3.1, Z - 1.2); slab(0x9fd0f5, 0.04, 0.8, 1.3, X - 9.8, Y + 3.2, Z - 1.2, M.glow);
    // The booth, between the stage and the bar: two decks, a mixer, stacks either side.
    slab(0x16101c, 2.4, 1.05, 0.7, X - 2.2, Y, Z - 5.7); tube(VIOLET, 2.4, 0.04, 0.04, X - 2.2, Y + 0.98, Z - 5.33); tube(PINK, 2.2, 0.5, 0.03, X - 2.2, Y + 0.3, Z - 5.33);
    for (const s of [-1, 1]) { put(M.plain, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18).translate(X - 2.2 + s * 0.7, Y + 1.07, Z - 5.7), 0x16161c); put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.035, 10).translate(X - 2.2 + s * 0.7, Y + 1.07, Z - 5.7), [RED, CYAN][(s + 1) / 2]); }
    slab(0x23232b, 0.5, 0.06, 0.4, X - 2.2, Y + 1.05, Z - 5.7); for (let n = 0; n < 8; n++) slab([0x7dffb0, 0xffe066, 0xff2a4a][n % 3], 0.03, 0.02, 0.03, X - 2.38 + (n % 4) * 0.12, Y + 1.11, Z - 5.8 + (n >> 2) * 0.16, M.glow);
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { slab(0x16161c, 0.7, 0.9, 0.6, X - 2.2 + s * 1.7, Y + k * 0.92, Z - 6.5); put(M.plain, new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16).rotateX(Math.PI / 2).translate(X - 2.2 + s * 1.7, Y + 0.45 + k * 0.92, Z - 6.19), 0x3a3a44); put(M.plain, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10).rotateX(Math.PI / 2).translate(X - 2.2 + s * 1.7, Y + 0.45 + k * 0.92, Z - 6.18), 0x8d8a8e); }
    for (const [cx, cz] of [[-9.6, -6.6], [9.6, 6.6], [9.6, -6.6]]) { slab(0x16161c, 0.5, 0.7, 0.5, X + cx, Y + 3.3, Z + cz); } // more of them up in the corners
    // What is written on the walls.
    sign('A GO-GO', X + 4.6, Y + 2.9, Z + 6.96, Math.PI, { w: 3.6, h: 1, color: '#ff3fe0', bg: '#1a0c20', font: '"Mr Dafoe", cursive', size: 0.8 });
    sign('HAPPY HOUR  6 - 9', X + 0.6, Y + 3.1, Z + 6.96, Math.PI, { w: 3, h: 0.6, color: '#ffe066', bg: '#1a0c20', size: 0.66 });
    sign('COLD BEER', X + 9.96, Y + 3.2, Z - 3.2, -Math.PI / 2, { w: 3, h: 0.7, color: '#49e0d0', bg: '#1a0c20', size: 0.7 });
    sign('NO PHOTOS', X + 9.96, Y + 2.3, Z - 3.2, -Math.PI / 2, { w: 1.8, h: 0.4, color: '#ff2a4a', bg: '#1a0c20', size: 0.62 });
    sign('LADIES NIGHT  EVERY NIGHT', X - 9.96, Y + 3.62, Z + 2.4, Math.PI / 2, { w: 5.4, h: 0.5, color: '#ff8ad8', bg: '#1a0c20', size: 0.62 });
    sign('PRIVATE', X + 2.4, Y + 2.5, Z + 6.96, Math.PI, { w: 1.3, h: 0.34, color: '#e9e2cf', bg: '#14080f', size: 0.6, glow: false });
    slab(0x241018, 1.1, 2.3, 0.08, X + 2.4, Y, Z + 6.95, M.wood, 1); slab(0xd9a520, 0.06, 0.06, 0.06, X + 2.85, Y + 1.1, Z + 6.88);   // the office: his door
    // The way in, on the east wall: velvet either side, a desk where the cover is paid, and what you bump into.
    slab(0x2a1218, 0.1, 3, 1.6, X + 10.02, Y, Z + 4);
    for (const s of [-1, 1]) for (let n = 0; n < 5; n++) post(n % 2 ? 0x8a1228 : 0x6a0e20, 0.09, 3.1, X + 9.86, Y, Z + 4 + s * (0.95 + n * 0.15), 6);
    slab(0xd9a520, 0.05, 0.05, 3.2, X + 9.86, Y + 3.1, Z + 4);
    // The way out has to be findable in the dark: a lit door, green round the frame, EXIT over it, arrows on the floor.
    slab(0x7a5a3a, 0.06, 2.6, 1.3, X + 9.95, Y, Z + 4, M.wood, 1); slab(0xfff2c0, 0.04, 0.5, 0.5, X + 9.93, Y + 1.6, Z + 4, M.glow); slab(0xd9a520, 0.08, 0.06, 0.3, X + 9.9, Y + 1.05, Z + 4.4);
    for (const s of [-1, 1]) tube(0x3dff7a, 0.05, 2.7, 0.05, X + 9.9, Y, Z + 4 + s * 0.72); tube(0x3dff7a, 0.05, 0.05, 1.5, X + 9.9, Y + 2.7, Z + 4);
    sign('EXIT', X + 9.9, Y + 3.25, Z + 4, -Math.PI / 2, { w: 1.5, h: 0.55, color: '#3dff7a', bg: '#0c1a10', size: 0.8 });
    sign('EXIT  >', X - 0.9, Y + 3.45, Z + 6.96, Math.PI, { w: 1.6, h: 0.4, color: '#3dff7a', bg: '#0c1a10', size: 0.74 });
    for (let n = 0; n < 5; n++) put(M.glow, new THREE.ConeGeometry(0.16, 0.34, 3).rotateX(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.05, 1).translate(X + 3.4 + n * 1.25, Y + 0.012, Z + 5.2 - Math.max(0, n - 2) * 0.55), 0x3dff7a);
    slab(0x241018, 1.1, 1.05, 0.6, X + 8.9, Y, Z + 6.3, M.wood, 1); slab(0x14080f, 1.2, 0.05, 0.7, X + 8.9, Y + 1.05, Z + 6.3); tube(PINK, 1.1, 0.04, 0.04, X + 8.9, Y + 0.98, Z + 5.98);
    slab(0x23232b, 0.3, 0.2, 0.26, X + 9.1, Y + 1.1, Z + 6.3);
    for (const [x, z, w, d, h] of [[4, -5.2, 9, 1, 1.5], [tx - X, tz - Z, 2.8, 2.8, 1.5], [-6.4, -3.6, 5, 5, 1.5], [-6.4, 1.6, 2.1, 6.2, 1.5], [6.4, 3.4, 2.8, 1.6, 1.5], [-9.35, 2.5, 1.2, 7.3, 1.2], [-6.8, 6.3, 5.8, 1.1, 1.2], [-2.2, -6, 4.4, 1.6, 1.8], [8.9, 6.3, 1.3, 0.8, 1.2]]) collide(X + x, Z + z, w, d, h);
    // Who is always here: Georgie behind the bar, five on the stage, the man in the booth, the girl at the door, and the trade.
    const georgie = makeLook('georgie');
    georgie.group.position.set(X + 1.9, Y, Z - 6.1); georgie.group.rotation.y = 0; scene.add(georgie.group);
    const crowd = [], stand = (who, x, y, z, turn, state, skip = 0) => { who.group.position.set(x, y, z); who.group.rotation.y = turn; who.set(state); if (skip) who.mixer?.update(skip); scene.add(who.group); crowd.push(who); return who; };
    const GIRLS = [ // five on the stage, no two alike: the colour of the two-piece, the hair and how it is worn
      { bikini: 0xff3fe0, hair: 0xe0c070, hairMesh: 'long' }, { bikini: 0x49e0d0, hair: 0x111111, hairMesh: 'long', hairScale: [1.06, 1.12, 1.08], dark: true },
      { bikini: 0xff2a4a, hair: 0xb5392a, hairMesh: 'parted', hairScale: [1.08, 1.05, 1.1] }, { bikini: 0xf4f4f0, hair: 0x2a1a14, hairMesh: 'long', hairScale: [1, 0.9, 1] },
      { bikini: 0xffe066, hair: 0xff8ad8, hairMesh: 'parted', hairScale: [1.1, 1.12, 1.12], dark: true },
    ];
    poles.forEach((at, n) => stand(makeHuman({ body: 'female', shoes: [0xf4f4f0, 0x16161c, 0xff2a4a, 0xd9a520, 0x16161c][n], height: 0.94 + (n % 3) * 0.02, ...GIRLS[n] }), at.x + (n % 2 ? 0.42 : -0.42), Y + TOP, at.z + 0.25, [0.6, -0.4, 0.9, 1.6, 0.2][n], 'dance', n * 0.83));
    stand(makeHuman({ shirt: 0x16161c, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', dark: true, glasses: 'shades' }), X - 2.2, Y, Z - 6.4, 0, 'idle');
    stand(makeHuman({ body: 'female', shirt: 0x16161c, sleeves: 'long', pants: 0x16161c, hair: 0x111111, hairMesh: 'long' }), X + 8.9, Y, Z + 6.72, Math.PI, 'idle');
    const HEAVY = { jacket: 0x16161c, shirt: 0x16161c, tee: true, pants: 0x16161c, shoes: 0x16161c, hair: 0x111111, hairMesh: 'buzzed', glasses: 'shades', bulk: 1.38, height: 1.06 };
    stand(makeHuman({ ...HEAVY }), X + 9.2, Y, Z + 2.5, -Math.PI / 2, 'idle');                    // the door, inside: arms folded, sees everything
    stand(makeHuman({ ...HEAVY, dark: true, hairMesh: undefined, goatee: 0x111111 }), X - 3.2, Y, Z - 1.6, Math.PI / 2 + 2.2, 'idle'); // the stage: nobody touches
    const TRADE = [{ shirt: 0xf4f4f0, pants: 0x3b4a66, hair: 0x8d8a8e, bulk: 1.15 }, { shirt: 0x2f7d46, tee: true, pants: 0xd9c7a0, hair: 0x2b1b12 }, { shirt: 0x9fd0f5, pants: 0x23232b, hair: 0xc9a14a, bulk: 1.08 }, { shirt: 0xd8342c, tee: true, pants: 0x3b6ea8, hair: 0x111111, dark: true }, { shirt: 0xffe066, pants: 0x23232b, hair: 0x3a2a1c, bulk: 1.2 }, { shirt: 0x16161c, tee: true, pants: 0x3b4a66, hair: 0x2b1b12, bulk: 0.95 }];
    [[-9.42, -0.9, Math.PI / 2], [-9.42, 1.1, Math.PI / 2], [-9.42, 3.0, Math.PI / 2], [-7.6, 6.42, Math.PI], [-5.6, 6.42, Math.PI]].forEach(([x, z, turn], n) => stand(makeHuman(TRADE[n]), X + x, Y, Z + z, turn, 'sit'));
    stand(makeHuman({ body: 'female', shirt: 0xff8ad8, tee: true, pants: 0x16161c, hair: 0x111111, hairMesh: 'long', height: 0.95 }), X - 9.42, Y, Z + 4.6, Math.PI / 2, 'sit');
    // ----- The private room, through the curtain on the east wall: a couch on three sides, a small round stage with its
    // own pole, mirrors, a bucket with something in it. One girl, one song, a hundred dollars. -----
    const VX = X + 15.2, VZ = Z - 1.2, v = { minX: VX - 3.4, maxX: VX + 3.4, minZ: VZ - 2.9, maxZ: VZ + 2.9, lights: [] };
    interiors.push(v);
    slab(0x120c18, 7.4, 0.2, 6.4, VX, Y - 0.2, VZ); { const m = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 5.8).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: gloss, shininess: 110, specular: 0x8a6ab0 })); m.position.set(VX, Y + 0.005, VZ); scene.add(m); }
    slab(0x0c0812, 7.4, 0.2, 6.4, VX, Y + 3.2, VZ);
    for (const s of [-1, 1]) { slab(0x3a1230, 7.4, 3.4, 0.3, VX, Y, VZ + s * 3.15); slab(0x3a1230, 0.3, 3.4, 6.4, VX + s * 3.65, Y, VZ); }
    glass(6.6, 1.7, VX, Y + 2.2, VZ - 2.98, 0); glass(5.6, 1.7, VX + 3.48, Y + 2.2, VZ, -Math.PI / 2);
    for (const s of [-1, 1]) tube(s > 0 ? PINK : VIOLET, 6.8, 0.04, 0.04, VX, Y + 3.1, VZ + s * 2.94); tube(PINK, 0.04, 0.04, 5.8, VX + 3.44, Y + 1.25, VZ); tube(VIOLET, 6.8, 0.04, 0.04, VX, Y + 1.25, VZ - 2.94);
    // The couch: along the north wall and down the east one.
    slab(VINYL, 5.6, 0.45, 0.8, VX + 0.4, Y, VZ - 2.5); slab(0x6a0e20, 5.6, 0.7, 0.2, VX + 0.4, Y + 0.45, VZ - 2.86); slab(VINYL, 0.8, 0.45, 3.6, VX + 2.9, Y, VZ - 0.3); slab(0x6a0e20, 0.2, 0.7, 3.6, VX + 3.26, Y + 0.45, VZ - 0.3);
    for (let n = 0; n < 7; n++) ball(0x4a0a18, 0.03, VX - 2 + n * 0.8, Y + 0.85, VZ - 2.75);
    collide(VX + 0.4, VZ - 2.5, 5.7, 0.9, 1.1); collide(VX + 2.9, VZ - 0.3, 0.9, 3.7, 1.1);
    // The stage: knee high, lit from inside, a ring of bulbs.
    const px2 = VX - 0.2, pz2 = VZ + 0.5;
    put(M.plain, new THREE.CylinderGeometry(1.15, 1.15, 0.4, 22).translate(px2, Y + 0.2, pz2), BLACK); put(M.glow, new THREE.TorusGeometry(1.15, 0.04, 6, 28).rotateX(Math.PI / 2).translate(px2, Y + 0.41, pz2), PINK); put(M.glow, new THREE.TorusGeometry(1.17, 0.04, 6, 28).rotateX(Math.PI / 2).translate(px2, Y + 0.04, pz2), VIOLET);
    post(CHROME, 0.035, 2.8, px2, Y + 0.4, pz2, 10); for (let n = 0; n < 10; n++) { const a = n / 10 * Math.PI * 2; ball(0xfff2c0, 0.03, px2 + Math.sin(a) * 1.18, Y + 0.22, pz2 + Math.cos(a) * 1.18, M.glow); }
    { const m = new THREE.Mesh(new THREE.CircleGeometry(1.05, 22).rotateX(-Math.PI / 2), LED[1]); m.position.set(px2, Y + 0.406, pz2); scene.add(m); }
    collide(px2, pz2, 2.2, 2.2, 0.6);
    // The table: an ice bucket, two glasses, the cup with the bill in it. A curtain where the door is, and the word.
    lowTable(VX + 1.6, VZ - 1.4, 1); put(M.plain, new THREE.CylinderGeometry(0.12, 0.1, 0.2, 10).translate(VX + 1.6, Y + 0.68, VZ - 1.4), CHROME); post(0x2f5a3f, 0.035, 0.26, VX + 1.6, Y + 0.72, VZ - 1.4, 6);
    for (let n = 0; n < 6; n++) post(n % 2 ? 0x8a1228 : 0x6a0e20, 0.09, 2.7, VX - 3.42, Y, VZ + 1.4 - 0.45 + n * 0.18, 6);
    slab(0xd9a520, 0.05, 0.05, 1.3, VX - 3.42, Y + 2.7, VZ + 1.4);
    // And on the club's side of the wall.
    for (let n = 0; n < 6; n++) post(n % 2 ? 0x5a1a8a : 0x3a1260, 0.09, 2.7, X + 9.86, Y, Z + 0.2 - 0.45 + n * 0.18, 6);
    slab(0xd9a520, 0.05, 0.05, 1.3, X + 9.86, Y + 2.7, Z + 0.2); sign('PRIVATE ROOMS', X + 9.92, Y + 2.95, Z + 0.2, -Math.PI / 2, { w: 1.6, h: 0.3, color: '#c85cff', bg: '#1a0c20', size: 0.72 });
    roomLamp(v, px2, Y + 2.8, pz2, 0xff5fd2, 46, 9); roomLamp(v, VX + 2, Y + 2.4, VZ - 1.6, 0x8a5cff, 26, 7);
    (places.stairs ??= []).push({ a: { x: X + 9.0, z: Z + 0.2, h: -Math.PI / 2 }, b: { x: VX - 2.6, z: VZ + 1.4, h: Math.PI / 2 }, up: 'Go through the curtain', down: 'Back out to the floor' });
    places.bingVip = { inside: { x: VX, z: VZ }, y: Y, stage: { x: px2, y: Y + 0.4, z: pz2 }, seat: { x: VX + 0.4, y: Y, z: VZ - 2.55, h: 0 }, way: { x: VX - 2.6, z: VZ + 1.4 }, cam: { pos: new THREE.Vector3(VX - 2.7, Y + 1.5, VZ - 1.7), look: new THREE.Vector3(VX + 0.5, Y + 1.1, VZ - 1) } };
    q.lights.length = 0;
    roomLamp(q, tx, Y + 3.1, tz, 0xffd9a8, 62, 15); roomLamp(q, sx, Y + 3.5, sz + 0.8, 0xff5fd2, 85, 20); roomLamp(q, X + 4, Y + 2.9, Z - 3.6, 0xffb060, 38, 12);
    roomLamp(q, sx, Y + 3.3, Z + 3, 0x6a8cff, 60, 15); roomLamp(q, X + 7, Y + 3.2, Z + 4.4, 0xff4a6a, 30, 12); roomLamp(q, X - 8.2, Y + 2.6, Z + 5, 0xc85cff, 36, 11);
    places.bingRoom = {
      ambient: [georgie], crowd, dancers: crowd.slice(0, 5), front: { x: X - 3.1, z: Z - 3.3 }, inside: { x: X + 7, z: Z + 4, h: -Math.PI / 2 },
      y: Y, seats, table: { x: tx, y: Y, z: tz },
      bar: { x: X + 1.3, y: Y, z: Z - 4.0 }, tender: { x: X + 1.9, y: Y, z: Z - 6.1 }, stool: { x: X + 3.4, y: Y, z: Z - 3.6 },
      stools: [2, 1, 3, 0, 4].map(n => ({ x: X + 0.8 + n * 1.6, y: Y + 0.27, z: Z - 4.2 })), // the middle ones first
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
    const q = { minX: X - 8.85, maxX: X + 8.85, minZ: Z - 5.7, maxZ: Z + 19.35, lights: [] };   // both storeys: the upper one lies to the south (see the stairs, below)
    interiors.push(q);
    slab(0xd9b48a, 16, 0.2, 12, X, Y - 0.2, Z, M.wood, 2);
    slab(0xf6f1e6, 14.5, 0.2, 12, X - 0.75, Y + 3.4, Z); slab(0xf6f1e6, 1.5, 0.2, 7, X + 7.25, Y + 3.4, Z - 2.5);   // the ceiling, open over the stairs
    slab(0xf6ead2, 16, 3.6, 0.3, X, Y, Z - 6.15); slab(0xf6ead2, 14.8, 3.6, 0.3, X - 0.9, Y, Z + 6.15); slab(0xf6ead2, 1.8, 3.2, 0.3, X + 7.4, Y, Z + 6.3);
    for (const s of [-1, 1]) slab(0xf6ead2, 0.3, 3.6, 12, X + s * 8.15, Y, Z);
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
    slab(0xe9e2cf, 1.6, 1.2, 0.05, X + 4, Y + 1.5, Z - 6, M.glow);                                 // a window on the garden
    slab(0x3a2418, 1.4, 2.8, 0.1, X + 2, Y, Z + 6.02);                                           // the front door
    // ----- The house, lived in (owner feedback: this is his home, it should look like one) -----
    {
      const IVORY = 0xefe4cf, BRASS = 0xd9a520, STEELC = 0xc9cbd2, lay = (tex, w, d, x, z, y, shiny = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shiny ? new THREE.MeshPhongMaterial({ map: tex, shininess: shiny, specular: 0x555555 }) : new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, y, z); scene.add(m); };
      // Floors: terracotta tile in the kitchen, a rug under the table.
      const terra = texture(128, 128, (c, w) => { c.fillStyle = '#c9895e'; c.fillRect(0, 0, w, w); c.fillStyle = '#d39a70'; c.fillRect(4, 4, 56, 56); c.fillRect(68, 68, 56, 56); c.fillStyle = '#bf7d52'; c.fillRect(68, 4, 56, 56); c.fillRect(4, 68, 56, 56); c.strokeStyle = '#e9dcc8'; c.lineWidth = 4; for (const k of [0, 64, 128]) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, w); c.moveTo(0, k); c.lineTo(w, k); c.stroke(); } });
      terra.repeat.set(6, 6); lay(terra, 6.4, 6.4, X - 4.7, Z - 2.7, Y + 0.004, 40);
      const rugT = texture(128, 96, (c, w, h) => { c.fillStyle = '#2c3a5a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e9dcc0'; c.fillRect(6, 6, w - 12, h - 12); c.fillStyle = '#7a2f3a'; c.fillRect(10, 10, w - 20, h - 20); c.strokeStyle = '#e9dcc0'; c.lineWidth = 2; c.strokeRect(18, 18, w - 36, h - 36); c.fillStyle = '#d9b25a'; c.beginPath(); c.ellipse(w / 2, h / 2, 26, 16, 0, 0, 7); c.fill(); c.fillStyle = '#2c3a5a'; c.beginPath(); c.ellipse(w / 2, h / 2, 14, 8, 0, 0, 7); c.fill(); });
      rugT.wrapS = rugT.wrapT = THREE.ClampToEdgeWrapping; lay(rugT, 4.6, 3.2, X + 0.5, Z + 1.5, Y + 0.006);
      // Skirting and a cornice all the way round; a chair rail where the table is.
      for (const s of [-1, 1]) { slab(0xffffff, 15.7, 0.12, 0.04, X, Y, Z + s * 5.98); slab(0xffffff, 0.04, 0.12, 11.7, X + s * 7.98, Y, Z); slab(0xffffff, 15.7, 0.12, 0.1, X, Y + 3.28, Z + s * 5.95); slab(0xffffff, 0.1, 0.12, 11.7, X + s * 7.95, Y + 3.28, Z); }
      // The kitchen: cupboards over the counters, tile behind them, the sink under its window, the hood, and everything a counter collects.
      slab(IVORY, 0.42, 0.85, 8.6, X - 7.78, Y + 1.6, Z - 1.1); for (let n = 0; n < 9; n++) { slab(0xd8c8a8, 0.02, 0.75, 0.02, X - 7.56, Y + 1.65, Z - 5.3 + n * 0.95); slab(BRASS, 0.03, 0.1, 0.03, X - 7.55, Y + 1.72, Z - 5.2 + n * 0.95); }
      slab(0xf1ece0, 0.03, 0.6, 9, X - 7.97, Y + 0.96, Z - 1); slab(0xf1ece0, 7, 0.6, 0.03, X - 3.5, Y + 0.96, Z - 5.97);
      for (let n = 0; n < 15; n++) slab(0xd8d0c0, 0.035, 0.6, 0.012, X - 7.96, Y + 0.96, Z - 5.3 + n * 0.6); for (let n = 0; n < 12; n++) slab(0xd8d0c0, 0.012, 0.6, 0.035, X - 6.8 + n * 0.6, Y + 0.96, Z - 5.96);
      for (const [x0, w] of [[-6.3, 1.6], [-2.6, 1.2]]) { slab(IVORY, w, 0.85, 0.42, X + x0, Y + 1.6, Z - 5.78); slab(BRASS, 0.03, 0.1, 0.03, X + x0, Y + 1.72, Z - 5.55); slab(0xd8c8a8, 0.02, 0.75, 0.02, X + x0, Y + 1.65, Z - 5.56); }
      slab(0xcfe8ff, 1.8, 1, 0.04, X - 4.5, Y + 1.5, Z - 5.98, M.glow); slab(0xffffff, 1.9, 0.06, 0.08, X - 4.5, Y + 1.45, Z - 5.95); slab(0xffffff, 0.05, 1, 0.06, X - 4.5, Y + 1.5, Z - 5.96); slab(0xd8342c, 1.9, 0.22, 0.05, X - 4.5, Y + 2.35, Z - 5.93); for (let n = 0; n < 7; n++) slab(0xf4f4f0, 0.1, 0.22, 0.055, X - 5.3 + n * 0.27, Y + 2.35, Z - 5.93); // gingham
      slab(STEELC, 0.9, 0.02, 0.55, X - 4.5, Y + 0.955, Z - 5.4); slab(0x8a8d96, 0.8, 0.02, 0.45, X - 4.5, Y + 0.95, Z - 5.4); post(STEELC, 0.02, 0.3, X - 4.5, Y + 0.96, Z - 5.72, 6); slab(STEELC, 0.03, 0.03, 0.22, X - 4.5, Y + 1.24, Z - 5.62);
      put(M.plain, new THREE.CylinderGeometry(0.06, 0.06, 0.26, 10).translate(X - 3.85, Y + 1.09, Z - 5.6), 0xf4f4f0); slab(0x49e0d0, 0.1, 0.16, 0.05, X - 5.1, Y + 0.96, Z - 5.65);                    // paper towel, the soap
      slab(STEELC, 1, 0.5, 0.6, X - 1.2, Y + 1.75, Z - 5.68); slab(STEELC, 0.4, 1, 0.4, X - 1.2, Y + 2.25, Z - 5.78); slab(0xfff2c0, 0.8, 0.02, 0.4, X - 1.2, Y + 1.74, Z - 5.65, M.glow);          // the hood
      slab(0x1c1c22, 0.9, 0.5, 0.05, X - 1.2, Y + 0.3, Z - 4.88); slab(STEELC, 0.7, 0.03, 0.05, X - 1.2, Y + 0.72, Z - 4.86); put(M.plain, new THREE.CylinderGeometry(0.17, 0.15, 0.2, 12).translate(X - 1.45, Y + 1.02, Z - 5.6), 0xb5651d); post(0x1c1c22, 0.012, 0.3, X - 1.2, Y + 1.0, Z - 5.52, 4); // the oven door, a pot of gravy
      slab(0x23232b, 0.55, 0.34, 0.4, X - 2.6, Y + 0.95, Z - 5.5); slab(0x7dffb0, 0.1, 0.05, 0.01, X - 2.42, Y + 1.2, Z - 5.29, M.glow); slab(0x3a3a44, 0.32, 0.2, 0.01, X - 2.68, Y + 1.02, Z - 5.29);  // the microwave
      slab(0x1c1c22, 0.24, 0.34, 0.26, X - 7.4, Y + 0.95, Z - 4.4); put(M.plain, new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8).translate(X - 7.35, Y + 1.02, Z - 4.2), 0x5a3320);                 // the coffee machine and its pot
      slab(STEELC, 0.2, 0.18, 0.3, X - 7.4, Y + 0.95, Z - 3.4); slab(0x5a3320, 0.14, 0.24, 0.2, X - 7.5, Y + 0.95, Z - 2.6); for (let n = 0; n < 4; n++) post(0x1c1c22, 0.012, 0.1, X - 7.52 + (n % 2) * 0.05, Y + 1.19, Z - 2.66 + (n >> 1) * 0.08, 4); // toaster, the knives
      for (let n = 0; n < 3; n++) put(M.plain, new THREE.CylinderGeometry(0.08 - n * 0.008, 0.08 - n * 0.008, 0.24 - n * 0.04, 10).translate(X - 7.45, Y + 1.07 - n * 0.02, Z - 1.6 + n * 0.24), 0xe9e2cf); // flour, sugar, coffee
      slab(0xc79a6a, 0.3, 0.2, 0.42, X - 7.42, Y + 0.95, Z + 0.4, M.wood, 1); slab(0x8a1c1c, 0.03, 0.3, 0.22, X - 7.5, Y + 0.95, Z + 1.3); slab(0xf1ece0, 0.02, 0.26, 0.2, X - 7.47, Y + 0.97, Z + 1.3);  // bread box, a cookbook open on its stand
      put(M.plain, new THREE.CylinderGeometry(0.2, 0.13, 0.09, 14).translate(X - 4, Y + 0.99, Z - 1.5), 0x3b6ea8); ball(0xf2c230, 0.07, X - 4.05, Y + 1.08, Z - 1.45); ball(0xd8342c, 0.07, X - 3.92, Y + 1.08, Z - 1.56); ball(0xff8a5c, 0.07, X - 4.08, Y + 1.08, Z - 1.6); // the bowl
      slab(0xe9e2cf, 0.34, 0.012, 0.26, X - 3.2, Y + 0.96, Z - 1.3); slab(0x8a8d96, 0.14, 0.02, 0.2, X - 4.9, Y + 0.96, Z - 1.2);                                                          // the mail; his newspaper
      for (const sx of [-5, -4, -3]) { post(STEELC, 0.025, 0.62, X + sx, Y, Z - 0.42, 5); post(0x8a2f3a, 0.19, 0.06, X + sx, Y + 0.62, Z - 0.42, 12); put(M.plain, new THREE.TorusGeometry(0.15, 0.012, 4, 14).rotateX(Math.PI / 2).translate(X + sx, Y + 0.25, Z - 0.42), STEELC); } // stools at the island
      for (const sx of [-5, -4, -3]) { post(0x1c1c22, 0.008, 0.9, X + sx, Y + 2.5, Z - 1.5, 4); put(M.glow, new THREE.ConeGeometry(0.17, 0.22, 10, 1, true).translate(X + sx, Y + 2.4, Z - 1.5), 0xffe2a6); }
      for (const [dx, dz] of [[-6, -4], [-3, -4], [-6, 0.5], [-3, 3.5], [-6, 3.5]]) put(M.glow, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10).translate(X + dx, Y + 3.39, Z + dz), 0xfff2c0);
      // The fridge: a handle on each door, a year of magnets, the school photographs.
      slab(0x8a8d96, 0.02, 0.01, 1, X - 6.8, Y + 1.3, Z + 4.5); slab(STEELC, 0.04, 0.5, 0.04, X - 6.78, Y + 1.45, Z + 4.1); for (let n = 0; n < 7; n++) slab([0xd8342c, 0xf2c230, 0x49e0d0, 0xf4f4f0, 0xff8ad8, 0xe9e2cf, 0x2f7d46][n], 0.012, 0.09 + (n % 2) * 0.05, 0.08 + (n % 3) * 0.03, X - 6.79, Y + 1.4 + (n % 3) * 0.16, Z + 4.3 + (n % 4) * 0.14);
      slab(IVORY, 0.09, 0.26, 0.12, X - 7.94, Y + 1.35, Z + 3.6); slab(IVORY, 0.07, 0.2, 0.05, X - 7.88, Y + 1.38, Z + 3.6); for (let n = 0; n < 6; n++) ball(IVORY, 0.018, X - 7.9, Y + 1.28 - n * 0.06, Z + 3.6 + Math.sin(n) * 0.02);  // the telephone on the wall, and its cord
      slab(0xf4f4f0, 0.02, 0.5, 0.4, X - 7.97, Y + 1.7, Z + 2.6); for (let n = 0; n < 12; n++) slab(0xd8342c, 0.022, 0.02, 0.03, X - 7.96, Y + 1.78 + (n % 4) * 0.09, Z + 2.48 + (n >> 2) * 0.1);                       // the calendar
      // The table: laid for Sunday, the light over it, six chairs now.
      slab(0xf4f0e6, 2.2, 0.012, 0.5, X + 0.5, Y + 0.8, Z + 1.5); put(M.plain, new THREE.CylinderGeometry(0.16, 0.1, 0.14, 12).translate(X + 0.5, Y + 0.88, Z + 1.5), 0xcfe8ff); for (const [dx, dz, hex] of [[-0.05, 0, 0xd8342c], [0.06, 0.04, 0xffe066], [0, -0.06, 0xff8ad8], [0.02, 0.07, 0xf4f4f0]]) ball(hex, 0.06, X + 0.5 + dx, Y + 1.04, Z + 1.5 + dz);
      for (const [cx, cz] of [[-0.7, 0.42], [0.7, 0.42], [-0.7, -0.42], [0.7, -0.42]]) { put(M.plain, new THREE.CylinderGeometry(0.15, 0.15, 0.012, 14).translate(X + 0.5 + cx, Y + 0.81, Z + 1.5 + cz), 0xf4f4f0); put(M.plain, new THREE.CylinderGeometry(0.03, 0.025, 0.1, 8).translate(X + 0.5 + cx + 0.22, Y + 0.86, Z + 1.5 + cz), 0xcfe8ff); }
      for (const s of [-1, 1]) { slab(0x5a3320, 0.46, 0.06, 0.46, X + 0.5 + s * 1.75, Y + 0.46, Z + 1.5); put(M.plain, new THREE.BoxGeometry(0.46, 0.5, 0.06).translate(0, 0.75, -0.23).rotateY(s * Math.PI / 2 + Math.PI).translate(X + 0.5 + s * 1.75, Y, Z + 1.5), 0x5a3320); for (const [fx, fz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) post(0x3a2418, 0.02, 0.46, X + 0.5 + s * 1.75 + fx, Y, Z + 1.5 + fz, 4); }
      for (const [cx, cz] of [[-0.7, 1.4], [0.7, 1.4], [-0.7, -1.4], [0.7, -1.4]]) for (const [fx, fz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) post(0x3a2418, 0.02, 0.46, X + 0.5 + cx + fx, Y, Z + 1.5 + cz + fz, 4);
      put(M.plain, new THREE.TorusGeometry(0.5, 0.02, 5, 24).rotateX(Math.PI / 2).translate(X + 0.5, Y + 2.5, Z + 1.5), BRASS); post(BRASS, 0.012, 0.9, X + 0.5, Y + 2.5, Z + 1.5, 4); for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; ball(0xfff2c0, 0.05, X + 0.5 + Math.sin(a) * 0.5, Y + 2.58, Z + 1.5 + Math.cos(a) * 0.5, M.glow); }
      // The den: a hearth with the family over it, shelves, curtains at the garden window, the big chair's blanket, the fan turning.
      slab(0xb5523b, 2, 1.3, 0.5, X + 1.7, Y, Z - 5.74, M.brick, 2); slab(0x16161c, 1.1, 0.75, 0.3, X + 1.7, Y + 0.1, Z - 5.62); slab(0xff8a30, 0.8, 0.3, 0.05, X + 1.7, Y + 0.14, Z - 5.52, M.glow); slab(0xffe066, 0.4, 0.2, 0.06, X + 1.7, Y + 0.14, Z - 5.5, M.glow);
      slab(0xf1ece0, 2.3, 0.1, 0.6, X + 1.7, Y + 1.3, Z - 5.7); slab(0xb5523b, 1.3, 2, 0.3, X + 1.7, Y + 1.4, Z - 5.84, M.brick, 2); collide(X + 1.7, Z - 5.74, 2.1, 0.55, 2);
      for (let n = 0; n < 4; n++) { slab(BRASS, 0.26, 0.32, 0.03, X + 0.95 + n * 0.5, Y + 1.4, Z - 5.55); slab([0xd8d2c8, 0xe9e2cf, 0xb9b3ac, 0xe9e2cf][n], 0.2, 0.26, 0.035, X + 0.95 + n * 0.5, Y + 1.43, Z - 5.55); }                                     // communions, graduations
      slab(BRASS, 1.1, 0.8, 0.04, X + 1.7, Y + 2.2, Z - 5.68); slab(0x4a6a52, 1, 0.7, 0.045, X + 1.7, Y + 2.25, Z - 5.68); slab(0xc9d8dc, 1, 0.3, 0.05, X + 1.7, Y + 2.65, Z - 5.68);                                                         // a landscape somebody's aunt painted
      for (const s of [-1, 1]) slab(0x7a2f3a, 0.3, 1.8, 0.1, X + 4 + s * 1.05, Y + 0.9, Z - 5.9); slab(0x7a2f3a, 2.5, 0.25, 0.14, X + 4, Y + 2.65, Z - 5.9);
      slab(0x5a3320, 0.45, 2.3, 2.4, X + 7.72, Y, Z - 2.6, M.wood, 2); for (let r = 0; r < 4; r++) { slab(0x3a2418, 0.46, 0.04, 2.4, X + 7.71, Y + 0.5 + r * 0.5, Z - 2.6); for (let n = 0; n < 9; n++) if ((n + r) % 4) slab([0x8a1c1c, 0x1f3a2c, 0x2c3a5a, 0xd9c7a0, 0x16161c][(n + r) % 5], 0.3, 0.3 + (n % 3) * 0.04, 0.12, X + 7.64, Y + 0.54 + r * 0.5, Z - 3.6 + n * 0.24); }
      post(BRASS, 0.05, 0.22, X + 7.62, Y + 2.3, Z - 2.1, 8); ball(BRASS, 0.08, X + 7.62, Y + 2.6, Z - 2.1); collide(X + 7.72, Z - 2.6, 0.6, 2.5, 2.3);                                                                              // a bowling trophy, of all things
      slab(0xd9c7a0, 1.5, 0.03, 0.9, X + 4.4, Y + 0.56, Z - 4.4); for (const [dx, hex] of [[-0.9, 0xd9a520], [0.6, 0x7a2f3a]]) slab(hex, 0.42, 0.34, 0.14, X + 5.2 + dx, Y + 0.62, Z - 4.62);                                           // a throw, cushions
      slab(0xe9e2cf, 0.3, 0.02, 0.22, X + 5.0, Y + 0.41, Z - 2.6); slab(0x1c1c22, 0.16, 0.03, 0.05, X + 5.5, Y + 0.41, Z - 2.5); put(M.plain, new THREE.CylinderGeometry(0.12, 0.08, 0.06, 12).translate(X + 4.7, Y + 0.44, Z - 2.75), 0xcfe8ff); // the guide, the remote, a dish of something
      slab(0x23232b, 0.5, 0.1, 0.34, X + 5.2, Y + 0.12, Z - 0.3); for (const s of [-1, 1]) slab(0x1c1c22, 0.28, 0.7, 0.3, X + 5.2 + s * 0.95, Y, Z - 0.3);                                                                              // the tape machine; speakers
      const fan = new THREE.Group(); for (let n = 0; n < 4; n++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.2).translate(0.65, 0, 0), new THREE.MeshLambertMaterial({ color: 0x5a3320 })); b.rotation.y = n * Math.PI / 2; fan.add(b); }
      fan.position.set(X + 5.2, Y + 3.05, Z - 2.6); scene.add(fan); post(BRASS, 0.05, 0.3, X + 5.2, Y + 3.08, Z - 2.6, 8); ball(0xfff2c0, 0.11, X + 5.2, Y + 2.98, Z - 2.6, M.glow); updaters.push(t => { fan.rotation.y = t * 2.6; });
      // By the door: the hall table with the keys and the flowers, a mirror, coats, the clock; the banister.
      slab(0x5a3320, 2.2, 0.8, 0.45, X - 1.6, Y, Z + 5.74, M.wood, 1); slab(0x3a2418, 2.3, 0.04, 0.5, X - 1.6, Y + 0.8, Z + 5.74); collide(X - 1.6, Z + 5.74, 2.3, 0.5, 1);
      put(M.plain, new THREE.CylinderGeometry(0.1, 0.07, 0.3, 10).translate(X - 1.6, Y + 0.99, Z + 5.74), 0x3b6ea8); for (const [dx, hex] of [[-0.08, 0xf4f4f0], [0.08, 0xff8ad8], [0, 0xd8342c], [0.03, 0xffe066]]) ball(hex, 0.07, X - 1.6 + dx, Y + 1.3 + Math.abs(dx), Z + 5.74);
      for (let n = 0; n < 3; n++) { slab(BRASS, 0.2, 0.26, 0.03, X - 2.4 + n * 0.22 + (n > 1 ? 1.4 : 0), Y + 0.84, Z + 5.8); } put(M.plain, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10).translate(X - 0.9, Y + 0.85, Z + 5.6), BRASS); slab(STEELC, 0.08, 0.01, 0.04, X - 0.9, Y + 0.87, Z + 5.6);
      slab(BRASS, 1.3, 0.9, 0.04, X - 1.6, Y + 1.5, Z + 5.96); slab(0xb9c8d8, 1.16, 0.76, 0.045, X - 1.6, Y + 1.57, Z + 5.96);
      post(0x3a2418, 0.03, 1.8, X + 3.5, Y, Z + 5.6, 6); for (let n = 0; n < 4; n++) slab(0x3a2418, 0.2, 0.03, 0.03, X + 3.5 + Math.cos(n * 1.57) * 0.1, Y + 1.7, Z + 5.6 + Math.sin(n * 1.57) * 0.1); slab(0x6f5a44, 0.3, 0.9, 0.16, X + 3.62, Y + 0.8, Z + 5.6); slab(0x23232b, 0.26, 0.7, 0.14, X + 3.4, Y + 0.95, Z + 5.68);
      slab(0x3a2418, 0.5, 2.1, 0.34, X + 5, Y, Z + 5.8, M.wood, 1); put(M.plain, new THREE.CylinderGeometry(0.17, 0.17, 0.03, 16).rotateX(Math.PI / 2).translate(X + 5, Y + 1.75, Z + 5.62), 0xf1ece0); slab(BRASS, 0.03, 0.5, 0.02, X + 5, Y + 0.8, Z + 5.62); ball(BRASS, 0.06, X + 5, Y + 0.78, Z + 5.62); collide(X + 5, Z + 5.8, 0.6, 0.4, 2.1);
      slab(0x8a2f3a, 0.9, 0.012, 0.6, X + 2, Y + 0.005, Z + 5.4);                                                                                                                              // the mat
      slab(BRASS, 0.04, 0.5, 0.4, X + 7.96, Y + 1.7, Z - 0.6); slab(0x8a1c1c, 0.045, 0.42, 0.32, X + 7.95, Y + 1.74, Z - 0.6);
    }
    roomLamp(q, X - 3.6, Y + 3.1, Z - 2, 0xfff0d0, 46, 14); roomLamp(q, X + 4.8, Y + 2.8, Z - 2.4, 0xffd9a8, 34, 12); roomLamp(q, X + 0.5, Y + 2.4, Z + 1.6, 0xffe8c0, 26, 9);
    // ===== The stairs, and upstairs (owner: a house you walk up through, a room with a door for each of them, and a
    // bathroom of his own). The upper storey is not over the lower one in plan: it lies to the south of it, a flight
    // up, so that one height under any spot is still all the ground needs to know (`floors` in grid.js). From inside
    // nobody can tell. =====
    {
      const H2 = 3.6, Y2 = Y + H2, WALL = 0xf6ead2, TRIM = 0xffffff, OAK = 0xb98a5e, BRASS = 0xd9a520, UP = 3.1;
      const sz0 = 1.0, sz1 = 6.6, run = (sz1 - sz0) / 12;
      floors.push({ minX: X + 6.55, maxX: X + 8.05, minZ: Z + sz0, maxZ: Z + sz1 + 0.05, y0: Y, y1: Y2, from: Z + sz0, to: Z + sz1 });
      floors.push({ minX: X - 9.2, maxX: X + 9.2, minZ: Z + 6.3, maxZ: Z + 19.7, y: Y2 });
      // The flight: twelve treads against the east wall, a rail on the open side, the wall carried up round the well.
      for (let i = 0; i < 12; i++) { slab(OAK, 1.45, (i + 1) * (H2 / 12), run, X + 7.27, Y, Z + sz0 + (i + 0.5) * run, M.wood, 1); slab(0x8a2f3a, 0.8, 0.012, run - 0.04, X + 7.27, Y + (i + 1) * (H2 / 12), Z + sz0 + (i + 0.5) * run); }
      for (let i = 0; i <= 12; i += 2) post(TRIM, 0.022, 0.95, X + 6.56, Y + i * (H2 / 12), Z + sz0 + i * run, 5);
      put(M.plain, new THREE.BoxGeometry(0.07, 0.07, Math.hypot(sz1 - sz0, H2)).rotateX(-Math.atan2(H2, sz1 - sz0)).translate(X + 6.56, Y + H2 / 2 + 0.95, Z + (sz0 + sz1) / 2), 0x5a3320);
      put(M.plain, new THREE.BoxGeometry(0.05, 0.05, Math.hypot(sz1 - sz0, H2)).rotateX(-Math.atan2(H2, sz1 - sz0)).translate(X + 7.94, Y + H2 / 2 + 0.95, Z + (sz0 + sz1) / 2), 0x5a3320);
      post(0x5a3320, 0.06, 1.1, X + 6.56, Y, Z + sz0 - 0.05, 6); ball(0x5a3320, 0.08, X + 6.56, Y + 1.16, Z + sz0 - 0.05);
      slab(WALL, 0.14, UP + 0.2, 5.3, X + 6.5, Y2, Z + 3.65); slab(WALL, 1.65, UP + 0.2, 0.14, X + 7.25, Y2, Z + sz0); slab(WALL, 0.3, UP + 0.2, 5.6, X + 8.15, Y2, Z + 3.5); slab(0xf6f1e6, 1.8, 0.2, 5.5, X + 7.3, Y2 + UP, Z + 3.6); // the well
      for (let n = 0; n < 5; n++) { slab(0x3a2418, 0.03, 0.42, 0.34, X + 7.98, Y + 1.7 + n * 0.6, Z + 1.6 + n * 0.94); slab([0xd8d2c8, 0xe9e2cf, 0xb9b3ac][n % 3], 0.035, 0.34, 0.26, X + 7.97, Y + 1.74 + n * 0.6, Z + 1.6 + n * 0.94); }         // the children, year by year, up the stairs
      collide(X + 6.5, Z + 3.7, 0.16, 4.5, 8, true);                                                    // the rail: the flight is entered at its foot
      // What holds the ground floor in now that the house is bigger than it: its side walls, and the wall the front door is in.
      collide(X - 8.6, Z + 0.15, 1.2, 12.6, 8); collide(X + 8.65, Z + 0.15, 1.3, 12.6, 8); collide(X - 0.9, Z + 6.15, 14.8, 0.3, 8);

      // ----- Upstairs -----
      const lay = (tex, w, d, x, z, shiny = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shiny ? new THREE.MeshPhongMaterial({ map: tex, shininess: shiny, specular: 0x555555 }) : new THREE.MeshLambertMaterial({ map: tex })); m.position.set(X + x, Y2 + 0.005, Z + z); scene.add(m); };
      slab(0xc9a47a, 18.6, 0.2, 13.5, X, Y2 - 0.2, Z + 13, M.wood, 2); slab(0xf6f1e6, 18.6, 0.2, 13.5, X, Y2 + UP, Z + 13);
      slab(WALL, 0.3, UP + 0.2, 13.5, X - 9.15, Y2, Z + 13); slab(WALL, 0.3, UP + 0.2, 13.5, X + 9.15, Y2, Z + 13); slab(WALL, 18.6, UP + 0.2, 0.3, X, Y2, Z + 19.65);
      slab(WALL, 15.6, UP + 0.2, 0.3, X - 1.3, Y2, Z + 6.15); slab(WALL, 1.1, UP + 0.2, 0.3, X + 8.6, Y2, Z + 6.15);
      // A wall from (x0, z0) to (x1, z1), with gaps for doors: [from, to] along its length. Each gap gets a head and an open door.
      const wall = (x0, z0, x1, z1, gaps = []) => {
        const alongX = z0 === z1, a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
        let at = a0;
        const piece = (p0, p1) => { if (p1 - p0 < 0.05) return; const mid = (p0 + p1) / 2, len = p1 - p0; if (alongX) { slab(WALL, len, UP, 0.16, X + mid, Y2, Z + z0); collide(X + mid, Z + z0, len, 0.3, 8); } else { slab(WALL, 0.16, UP, len, X + x0, Y2, Z + mid); collide(X + x0, Z + mid, 0.3, len, 8); } };
        for (const [g0, g1, swing = 1] of gaps) {
          piece(at, g0); at = g1;
          const mid = (g0 + g1) / 2, len = g1 - g0;
          if (alongX) { slab(WALL, len, UP - 2.15, 0.16, X + mid, Y2 + 2.15, Z + z0); for (const e of [g0, g1]) slab(TRIM, 0.07, 2.15, 0.2, X + e, Y2, Z + z0); slab(TRIM, len, 0.07, 0.2, X + mid, Y2 + 2.12, Z + z0); slab(0xefe4cf, 0.05, 2.05, len - 0.1, X + g0 + 0.06, Y2, Z + z0 + swing * (len / 2)); slab(BRASS, 0.07, 0.05, 0.05, X + g0 + 0.06, Y2 + 1, Z + z0 + swing * (len - 0.18)); }
          else { slab(WALL, 0.16, UP - 2.15, len, X + x0, Y2 + 2.15, Z + mid); for (const e of [g0, g1]) slab(TRIM, 0.2, 2.15, 0.07, X + x0, Y2, Z + e); slab(TRIM, 0.2, 0.07, len, X + x0, Y2 + 2.12, Z + mid); slab(0xefe4cf, len - 0.1, 2.05, 0.05, X + x0 + swing * (len / 2), Y2, Z + g0 + 0.06); }
        }
        piece(at, a1);
      };
      wall(-9, 8.4, 9, 8.4, [[-5.6, -4.5], [0.1, 1.2], [3.55, 4.55], [6.7, 7.8]]);                      // the landing, and the four doors off it
      wall(-1.6, 8.4, -1.6, 19.5); wall(3, 8.4, 3, 14.8); wall(5.2, 8.4, 5.2, 12.6); wall(3, 12.6, 5.2, 12.6); wall(-1.6, 14.8, 9, 14.8);
      wall(-9, 15.6, -1.6, 15.6, [[-7.6, -6.6], [-3.9, -2.9]]); wall(-5.2, 15.6, -5.2, 19.5);
      collide(X + 3.7, Z + 17.25, 10.4, 4.7, 8);                                                         // (nothing behind the children's rooms)
      collide(X - 9.4, Z + 13, 0.8, 13.6, 9); collide(X + 9.4, Z + 13, 0.8, 13.6, 9); collide(X, Z + 19.9, 19.6, 0.8, 9);                  // the outside walls up here, tall enough to stop the camera as well
      for (const s2 of [-1, 1]) { slab(TRIM, 18, 0.1, 0.04, X, Y2, Z + (s2 > 0 ? 8.3 : 6.32)); }
      // The landing: a runner, the family along the wall, a table with flowers, the cupboard for the sheets, lights.
      slab(0x8a2f3a, 15.2, 0.012, 1.1, X - 1.2, Y2 + 0.006, Z + 7.35); for (const s2 of [-1, 1]) slab(0xd9b25a, 15.2, 0.013, 0.05, X - 1.2, Y2 + 0.007, Z + 7.35 + s2 * 0.5);
      for (let n = 0; n < 9; n++) { slab(0x3a2418, 0.5, 0.62, 0.03, X - 7.6 + n * 1.5, Y2 + 1.55, Z + 6.33); slab([0xd8d2c8, 0xe9e2cf, 0xb9b3ac][n % 3], 0.42, 0.54, 0.035, X - 7.6 + n * 1.5, Y2 + 1.59, Z + 6.33); }
      slab(0x5a3320, 1.3, 0.78, 0.36, X - 2.6, Y2, Z + 6.55, M.wood, 1); put(M.plain, new THREE.CylinderGeometry(0.09, 0.06, 0.26, 10).translate(X - 2.6, Y2 + 0.91, Z + 6.55), 0xf4f4f0); for (const [dx, hex] of [[-0.07, 0xff8ad8], [0.07, 0xffe066], [0, 0xd8342c]]) ball(hex, 0.07, X - 2.6 + dx, Y2 + 1.2 + Math.abs(dx), Z + 6.55); collide(X - 2.6, Z + 6.55, 1.4, 0.4, 5);
      slab(0xefe4cf, 0.06, 2.1, 1, X - 8.97, Y2, Z + 7.35); slab(BRASS, 0.07, 0.05, 0.05, X - 8.93, Y2 + 1.05, Z + 7.7);
      slab(0xc79a6a, 0.5, 0.6, 0.4, X + 5.4, Y2, Z + 6.6); slab(0xf4f4f0, 0.44, 0.1, 0.34, X + 5.4, Y2 + 0.6, Z + 6.6);                                    // the hamper
      for (const lx of [-6, -1, 4]) put(M.glow, new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10).translate(X + lx, Y2 + UP - 0.02, Z + 7.35), 0xfff2c0);

      // ----- The master bedroom: x -9 to -1.6, z 8.4 to 15.6 -----
      const bedroomRug = texture(128, 96, (c, w, h) => { c.fillStyle = '#d9c7a0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b9a276'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16); c.strokeStyle = '#8a6a44'; c.lineWidth = 1.5; c.strokeRect(16, 16, w - 32, h - 32); });
      bedroomRug.wrapS = bedroomRug.wrapT = THREE.ClampToEdgeWrapping; lay(bedroomRug, 4.6, 3.6, -6.2, 11.9);
      slab(0x8a5a44, 2.6, 0.45, 2.4, X - 7.6, Y2, Z + 11.9, M.wood, 1); slab(0xf1ede4, 2.5, 0.22, 2.3, X - 7.6, Y2 + 0.45, Z + 11.9); slab(0x7a1626, 1.5, 0.06, 2.32, X - 7, Y2 + 0.67, Z + 11.9); slab(0x8a5a44, 0.14, 1.25, 2.5, X - 8.9, Y2, Z + 11.9, M.wood, 1);
      for (const sz of [-0.58, 0.58]) { slab(0xffffff, 0.5, 0.16, 0.8, X - 8.4, Y2 + 0.67, Z + 11.9 + sz); slab(0xd9a520, 0.3, 0.3, 0.5, X - 8, Y2 + 0.72, Z + 11.9 + sz * 0.9); }
      for (let n = 0; n < 5; n++) ball(0x6a4634, 0.03, X - 8.82, Y2 + 0.95, Z + 10.9 + n * 0.5); slab(BRASS, 0.03, 0.42, 0.06, X - 8.98, Y2 + 2, Z + 11.9); slab(BRASS, 0.03, 0.06, 0.26, X - 8.98, Y2 + 2.24, Z + 11.9);
      collide(X - 7.65, Z + 11.9, 2.7, 2.5, 5);
      for (const [sz, mine] of [[-1.75, true], [1.75, false]]) { slab(0x5a3320, 0.5, 0.55, 0.6, X - 8.6, Y2, Z + 11.9 + sz, M.wood, 1); post(BRASS, 0.015, 0.3, X - 8.7, Y2 + 0.55, Z + 11.9 + sz, 5); put(M.glow, new THREE.ConeGeometry(0.18, 0.26, 10, 1, true).translate(X - 8.7, Y2 + 0.95, Z + 11.9 + sz), 0xffe2a6); collide(X - 8.6, Z + 11.9 + sz, 0.6, 0.7, 5);
        if (mine) { slab(0x1c1c22, 0.1, 0.08, 0.18, X - 8.45, Y2 + 0.55, Z + 11.9 + sz + 0.15); slab(0xff2a4a, 0.01, 0.04, 0.12, X - 8.39, Y2 + 0.57, Z + 11.9 + sz + 0.15, M.glow); put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8).translate(X - 8.5, Y2 + 0.6, Z + 11.9 + sz - 0.18), 0xff8a30); put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.1, 8).translate(X - 8.4, Y2 + 0.6, Z + 11.9 + sz - 0.05), 0xcfe8ff); }
        else { slab(0x3b6ea8, 0.28, 0.04, 0.2, X - 8.5, Y2 + 0.55, Z + 11.9 + sz); slab(0xefe4cf, 0.16, 0.08, 0.22, X - 8.45, Y2 + 0.55, Z + 11.9 + sz + 0.2); } }
      for (const sx of [-0.1, 0.12]) slab(0x5a3320, 0.26, 0.05, 0.11, X - 6.1, Y2, Z + 10.5 + sx);                                                              // slippers, his side
      slab(0x5a3320, 0.6, 0.95, 2.4, X - 1.95, Y2, Z + 11.9, M.wood, 1); for (let k = 0; k < 6; k++) slab(BRASS, 0.03, 0.03, 0.14, X - 2.26, Y2 + 0.25 + Math.floor(k / 2) * 0.28, Z + 11.3 + (k % 2) * 1.2); slab(0x1c1c22, 0.4, 0.75, 1.1, X - 1.95, Y2 + 0.95, Z + 11.9); slab(0x9fd0f5, 0.03, 0.6, 0.94, X - 2.17, Y2 + 1.03, Z + 11.9, M.glow);
      for (let n = 0; n < 3; n++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.035, 0.1 + (n % 2) * 0.05, 8).translate(X - 1.95, Y2 + 0.99, Z + 10.9 + n * 0.14), [0xd9a520, 0xcfe8ff, 0x8a1c2a][n]); for (let n = 0; n < 2; n++) slab(BRASS, 0.03, 0.24, 0.18, X - 1.85, Y2 + 0.95, Z + 12.75 + n * 0.24);
      collide(X - 1.95, Z + 11.9, 0.7, 2.5, 5);
      slab(0xefe4cf, 1.3, 0.74, 0.5, X - 5.25, Y2, Z + 15.25); put(M.plain, new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20).rotateX(Math.PI / 2).scale(1, 1.25, 1).translate(X - 5.25, Y2 + 1.5, Z + 15.5), 0xb9c8d8); put(M.plain, new THREE.TorusGeometry(0.42, 0.03, 5, 22).scale(1, 1.25, 1).translate(X - 5.25, Y2 + 1.5, Z + 15.49), BRASS);
      for (let n = 0; n < 5; n++) put(M.plain, new THREE.CylinderGeometry(0.025, 0.03, 0.08 + (n % 3) * 0.03, 8).translate(X - 5.6 + n * 0.16, Y2 + 0.8, Z + 15.3), [0xff8ad8, 0xd9a520, 0xcfe8ff, 0x8a5cff, 0xf4f4f0][n]); slab(0x8a1c2a, 0.2, 0.1, 0.14, X - 4.8, Y2 + 0.74, Z + 15.3); post(BRASS, 0.02, 0.4, X - 5.25, Y2, Z + 14.6, 5); post(0xff8ad8, 0.2, 0.08, X - 5.25, Y2 + 0.4, Z + 14.6, 12);
      collide(X - 5.25, Z + 15.25, 1.4, 0.6, 5);
      slab(0x2f4a44, 0.8, 0.42, 0.8, X - 2.6, Y2, Z + 9.3); slab(0x2f4a44, 0.8, 0.5, 0.16, X - 2.6, Y2 + 0.42, Z + 8.95); for (const s2 of [-1, 1]) slab(0x27403b, 0.14, 0.24, 0.8, X - 2.6 + s2 * 0.4, Y2 + 0.42, Z + 9.3); post(BRASS, 0.02, 1.5, X - 3.5, Y2, Z + 8.9, 5); put(M.glow, new THREE.ConeGeometry(0.22, 0.3, 10, 1, true).translate(X - 3.5, Y2 + 1.6, Z + 8.9), 0xffe2a6); collide(X - 2.6, Z + 9.3, 0.9, 0.9, 5);
      for (const wz of [9.5, 14.3]) { slab(0xffd9a8, 0.04, 1.5, 1.2, X - 8.98, Y2 + 1.1, Z + wz, M.glow); for (const s2 of [-1, 1]) slab(0x7a2f3a, 0.1, 1.9, 0.3, X - 8.9, Y2 + 0.9, Z + wz + s2 * 0.72); slab(0x7a2f3a, 0.14, 0.22, 1.8, X - 8.88, Y2 + 2.7, Z + wz); }
      put(M.glow, new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(X - 5.4, Y2 + UP, Z + 12), 0xfff2c0);
      slab(0xf4f4f0, 0.5, 0.9, 0.06, X - 6.2, Y2 + 0.9, Z + 15.5);                                                                                            // his robe, on the bathroom door
      // His bathroom: x -9 to -5.2, z 15.6 to 19.5.
      const tile = texture(64, 64, (c, w) => { c.fillStyle = '#eef2f0'; c.fillRect(0, 0, w, w); c.strokeStyle = '#b9c4c0'; c.lineWidth = 2; c.strokeRect(0, 0, w, w); c.strokeRect(0, 0, w / 2, w / 2); c.strokeRect(w / 2, w / 2, w / 2, w / 2); });
      { const t = tile.clone(); t.needsUpdate = true; t.repeat.set(7, 7.5); lay(t, 3.7, 3.8, -7.1, 17.55, 60); }
      for (const [w, d, x, z] of [[3.7, 0.03, -7.1, 19.47], [0.03, 3.8, -8.97, 17.55], [0.03, 3.8, -5.31, 17.55]]) slab(0xdfe8e6, w, 1.3, d, X + x, Y2, Z + z);
      slab(0xf4f4f0, 2, 0.58, 0.9, X - 7.9, Y2, Z + 18.95); slab(0xdff2f6, 1.8, 0.03, 0.7, X - 7.9, Y2 + 0.5, Z + 18.95); post(0xc9cbd2, 0.02, 0.26, X - 8.75, Y2 + 0.58, Z + 18.95, 5); slab(0xc9cbd2, 0.16, 0.03, 0.03, X - 8.68, Y2 + 0.82, Z + 18.95); collide(X - 7.9, Z + 18.95, 2.1, 1, 5);      // the bath
      for (const [w, d, x, z] of [[1.1, 0.03, -5.85, 18.4], [0.03, 1.05, -6.4, 18.95]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.25, shininess: 140, specular: 0xffffff, depthWrite: false })); m.position.set(X + x, Y2 + 1, Z + z); scene.add(m); }
      slab(0xdfe8e6, 1.05, 0.06, 1, X - 5.85, Y2, Z + 18.95); post(0xc9cbd2, 0.015, 2, X - 5.4, Y2, Z + 19.3, 5); put(M.plain, new THREE.CylinderGeometry(0.1, 0.06, 0.05, 10).translate(X - 5.5, Y2 + 2, Z + 19.2), 0xc9cbd2); collide(X - 5.85, Z + 18.4, 1.2, 0.1, 5);                    // the shower
      slab(0x5a3320, 0.55, 0.8, 2.2, X - 8.7, Y2, Z + 16.9, M.wood, 1); slab(0xf1ece0, 0.6, 0.05, 2.3, X - 8.7, Y2 + 0.8, Z + 16.9); for (const sz of [-0.55, 0.55]) { put(M.plain, new THREE.CylinderGeometry(0.2, 0.16, 0.06, 14).translate(X - 8.7, Y2 + 0.83, Z + 16.9 + sz), 0xf4f4f0); post(0xc9cbd2, 0.015, 0.16, X - 8.9, Y2 + 0.85, Z + 16.9 + sz, 5); }
      slab(0xb9c8d8, 0.03, 1, 2.1, X - 8.96, Y2 + 1.2, Z + 16.9); for (let n = 0; n < 5; n++) ball(0xfff2c0, 0.05, X - 8.9, Y2 + 2.3, Z + 16 + n * 0.45, M.glow); collide(X - 8.7, Z + 16.9, 0.7, 2.3, 5);
      for (let n = 0; n < 4; n++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6).translate(X - 8.6, Y2 + 0.91, Z + 16.6 + n * 0.12), [0x2f56c8, 0xff8a30, 0xf4f4f0, 0x2f7d46][n]); slab(0x23232b, 0.14, 0.04, 0.05, X - 8.55, Y2 + 0.86, Z + 17.3);                                // cologne, the pills, a razor
      slab(0xf4f4f0, 0.5, 0.4, 0.42, X - 5.6, Y2, Z + 16.6); slab(0xf4f4f0, 0.16, 0.5, 0.42, X - 5.36, Y2 + 0.4, Z + 16.6); collide(X - 5.55, Z + 16.6, 0.6, 0.5, 5);
      slab(0x7a1626, 0.04, 0.8, 0.5, X - 5.34, Y2 + 0.9, Z + 17.6); slab(0xf4f4f0, 0.04, 0.8, 0.5, X - 5.34, Y2 + 0.9, Z + 18); slab(0x9fd0f5, 0.9, 0.012, 0.6, X - 7.4, Y2 + 0.008, Z + 18.1); slab(0xc9cbd2, 0.34, 0.05, 0.34, X - 6.6, Y2, Z + 16.2);
      put(M.glow, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10).translate(X - 7.1, Y2 + UP - 0.02, Z + 17.5), 0xf2f8ff);
      // His clothes: x -5.2 to -1.6, z 15.6 to 19.5. Shirts down one side, suits down the other, shoes, a safe nobody mentions.
      for (const [sx, cols] of [[-4.95, [0xf4f4f0, 0x9fd0f5, 0xffe066, 0x8a1c2a, 0x2f7d46, 0xff8a5c, 0x3b6ea8, 0xf4f4f0, 0x16161c, 0xd9c7a0]], [-1.85, [0x23232b, 0x3d4658, 0x4a4652, 0x6f5a44, 0x2a2a30, 0x8d8a8e, 0x23232b, 0x3d4658]]]) {
        slab(0xc9cbd2, 0.03, 0.03, 3.4, X + sx, Y2 + 1.8, Z + 17.6); cols.forEach((hex, n) => slab(hex, 0.42, sx < -3 ? 0.75 : 1.1, 0.07, X + sx, Y2 + (sx < -3 ? 1.02 : 0.68), Z + 16.2 + n * (3 / cols.length)));
        slab(0x5a3320, 0.4, 0.04, 3.4, X + sx, Y2 + 2.1, Z + 17.6, M.wood, 1); for (let n = 0; n < 5; n++) slab([0xd9c7a0, 0x8a6a44, 0xe9e2cf][n % 3], 0.34, 0.2, 0.44, X + sx, Y2 + 2.14, Z + 16.3 + n * 0.62);
      }
      for (let n = 0; n < 7; n++) { slab([0x23232b, 0x5a3320, 0xf2efe8][n % 3], 0.26, 0.09, 0.1, X - 4.9, Y2, Z + 16.2 + n * 0.42); slab([0x23232b, 0x5a3320, 0xf2efe8][n % 3], 0.26, 0.09, 0.1, X - 4.9, Y2, Z + 16.32 + n * 0.42); }
      slab(0x3a3a44, 0.6, 0.7, 0.6, X - 3.4, Y2, Z + 19.1); put(M.plain, new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12).rotateX(Math.PI / 2).translate(X - 3.4, Y2 + 0.42, Z + 18.78), 0xc9cbd2); collide(X - 3.4, Z + 19.1, 0.7, 0.7, 5);
      slab(0xb9c8d8, 0.9, 1.8, 0.03, X - 3.4, Y2 + 0.2, Z + 15.72 + 0.0); put(M.glow, new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10).translate(X - 3.4, Y2 + UP - 0.02, Z + 17.5), 0xfff2c0);
      collide(X - 4.95, Z + 17.6, 0.5, 3.5, 5); collide(X - 1.85, Z + 17.6, 0.5, 3.5, 5);

      // ----- AJ's room: x -1.6 to 3, z 8.4 to 14.8. An unmade bed, the console, the drums, what he took off. -----
      slab(0x2f56c8, 4.2, 0.012, 3.2, X + 0.7, Y2 + 0.005, Z + 12);
      slab(0x3b6ea8, 1.1, 0.42, 2.1, X - 0.9, Y2, Z + 13.5); slab(0xf1ede4, 1, 0.14, 0.5, X - 0.9, Y2 + 0.42, Z + 14.3); put(M.plain, new THREE.BoxGeometry(1.05, 0.08, 1.2).rotateY(0.25).translate(X - 0.8, Y2 + 0.46, Z + 13.1), 0x2f56c8); collide(X - 0.9, Z + 13.5, 1.2, 2.2, 5);
      slab(0x1c1c22, 0.5, 0.5, 0.9, X + 2.65, Y2, Z + 10.2); slab(0x1c1c22, 0.4, 0.62, 0.8, X + 2.65, Y2 + 0.5, Z + 10.2); slab(0x7dffb0, 0.03, 0.46, 0.64, X + 2.43, Y2 + 0.58, Z + 10.2, M.glow); slab(0x8d8a8e, 0.2, 0.06, 0.3, X + 1.9, Y2 + 0.02, Z + 10.2); for (const s2 of [-1, 1]) slab(0x23232b, 0.1, 0.03, 0.14, X + 1.5, Y2 + 0.02, Z + 10.2 + s2 * 0.2); collide(X + 2.65, Z + 10.2, 0.6, 1, 5);
      slab(0xd8342c, 0.5, 0.28, 0.5, X + 1.3, Y2, Z + 10.3);                                                                                                  // the beanbag he plays from
      for (const [dx, dz, rr, hh] of [[1.9, 13.8, 0.3, 0.55], [2.5, 13.4, 0.22, 0.6], [1.4, 13.3, 0.2, 0.62], [2.2, 14.3, 0.34, 0.3]]) { put(M.plain, new THREE.CylinderGeometry(rr, rr, 0.26, 12).translate(X + dx, Y2 + hh, Z + dz), 0xd8342c); post(0xc9cbd2, 0.015, hh, X + dx, Y2, Z + dz, 4); } put(M.plain, new THREE.CylinderGeometry(0.24, 0.24, 0.02, 12).translate(X + 2.7, Y2 + 1.1, Z + 14), BRASS); post(0xc9cbd2, 0.012, 1.1, X + 2.7, Y2, Z + 14, 4); collide(X + 2.1, Z + 13.8, 1.5, 1.3, 5);
      slab(0xe9e2d2, 1.3, 0.74, 0.6, X + 0.9, Y2, Z + 14.45, M.wood, 1); slab(0xe9e2cf, 0.44, 0.38, 0.4, X + 0.9, Y2 + 0.74, Z + 14.5); slab(0x9fd0f5, 0.34, 0.26, 0.02, X + 0.9, Y2 + 0.8, Z + 14.29, M.glow); slab(0x5a3320, 0.45, 0.06, 0.45, X + 0.9, Y2 + 0.45, Z + 13.75); collide(X + 0.9, Z + 14.45, 1.4, 0.7, 5);
      for (let n = 0; n < 4; n++) slab([0xd8342c, 0x16161c, 0xf2c230, 0x2f7d46][n], 0.03, 0.9, 0.7, X - 1.5, Y2 + 1.4, Z + 9.3 + n * 1.1); for (let n = 0; n < 2; n++) slab([0x16161c, 0x8a1c1c][n], 0.7, 0.9, 0.03, X + 0.2 + n * 1.2, Y2 + 1.4, Z + 14.7);
      slab(0x8a5a2a, 0.75, 0.04, 0.2, X + 0.4, Y2 + 0.05, Z + 11.4); for (const s2 of [-1, 1]) post(0x1c1c22, 0.03, 0.05, X + 0.4 + s2 * 0.25, Y2, Z + 11.4, 6); ball(0xd9722a, 0.13, X - 1.2, Y2 + 0.13, Z + 9.2);
      for (const [dx, dz, hex] of [[0.2, 12.4, 0xd8342c], [1.2, 12.9, 0xe9e2cf], [-0.6, 11.2, 0x23232b]]) put(M.plain, new THREE.BoxGeometry(0.5, 0.05, 0.4).rotateY(dx).translate(X + dx, Y2 + 0.03, Z + dz), hex);
      put(M.glow, new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10).translate(X + 0.7, Y2 + UP - 0.02, Z + 11.6), 0xfff2c0);
      // ----- The children's bathroom: x 3 to 5.2, z 8.4 to 12.6 -----
      { const t = tile.clone(); t.needsUpdate = true; t.repeat.set(4, 7.5); lay(t, 2.1, 4, 4.1, 10.5, 60); }
      slab(0xf4f4f0, 2, 0.58, 0.85, X + 4.1, Y2, Z + 12.1); slab(0xdff2f6, 1.8, 0.03, 0.65, X + 4.1, Y2 + 0.5, Z + 12.1); slab(0xf7c8d4, 1.9, 1.5, 0.03, X + 4.1, Y2 + 0.6, Z + 11.66); collide(X + 4.1, Z + 12.1, 2.1, 0.9, 5);
      slab(0xf4f4f0, 0.5, 0.14, 0.4, X + 4.85, Y2 + 0.8, Z + 9.6); post(0xf4f4f0, 0.07, 0.8, X + 4.95, Y2, Z + 9.6, 8); slab(0xb9c8d8, 0.03, 0.6, 0.5, X + 5.09, Y2 + 1.3, Z + 9.6); slab(0xf4f4f0, 0.42, 0.4, 0.5, X + 3.35, Y2, Z + 10.4); slab(0xf4f4f0, 0.16, 0.5, 0.5, X + 3.14, Y2 + 0.4, Z + 10.4);
      slab(0xff8ad8, 0.04, 0.7, 0.4, X + 3.12, Y2 + 0.9, Z + 9.1); slab(0x2f56c8, 0.04, 0.7, 0.4, X + 3.12, Y2 + 0.9, Z + 9.55); for (let n = 0; n < 6; n++) put(M.plain, new THREE.CylinderGeometry(0.025, 0.025, 0.1 + (n % 3) * 0.03, 6).translate(X + 4.7 + (n % 3) * 0.07, Y2 + 0.99, Z + 9.45 + Math.floor(n / 3) * 0.3), [0xff8ad8, 0x8a5cff, 0x49e0d0, 0x2f56c8, 0xf4f4f0, 0xffe066][n]);
      put(M.glow, new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10).translate(X + 4.1, Y2 + UP - 0.02, Z + 10.4), 0xf2f8ff);
      // ----- Meadow's room: x 5.2 to 9, z 8.4 to 14.8, and the corner behind the bathroom. A made bed, a desk, books; pink where she allows it. -----
      slab(0xf7a8c4, 3, 0.012, 2.4, X + 7.1, Y2 + 0.005, Z + 11.4);
      slab(0xf7a8c4, 1.1, 0.42, 2.1, X + 8.3, Y2, Z + 13.5); slab(0xffffff, 1, 0.14, 0.5, X + 8.3, Y2 + 0.42, Z + 14.3); slab(0xc9b6f2, 1.05, 0.07, 1.3, X + 8.3, Y2 + 0.42, Z + 13.1); collide(X + 8.3, Z + 13.5, 1.2, 2.2, 5);
      for (const [dx, hex] of [[8, 0xd9b25a], [8.3, 0xf4f4f0], [8.6, 0x8a5a44]]) { ball(hex, 0.13, X + dx, Y2 + 0.7, Z + 14.35); ball(hex, 0.08, X + dx, Y2 + 0.88, Z + 14.35); }
      slab(0xe9e2d2, 0.7, 0.74, 1.6, X + 8.6, Y2, Z + 9.6, M.wood, 1); slab(0xe9e2cf, 0.45, 0.42, 0.5, X + 8.65, Y2 + 0.74, Z + 9.4); slab(0x9fd0f5, 0.02, 0.28, 0.36, X + 8.41, Y2 + 0.81, Z + 9.4, M.glow); slab(0x5a3320, 0.45, 0.06, 0.45, X + 7.8, Y2 + 0.45, Z + 9.6); for (let n = 0; n < 4; n++) slab(PASTELS[n], 0.2, 0.03 + n * 0.012, 0.28, X + 8.6, Y2 + 0.74 + n * 0.03, Z + 10.1); collide(X + 8.6, Z + 9.6, 0.8, 1.7, 5);
      slab(0xe9e2d2, 1.8, 1.9, 0.4, X + 4.2, Y2, Z + 14.5, M.wood, 1); for (let n = 0; n < 24; n++) slab(PASTELS[n % 8], 0.12, 0.3 + (n % 3) * 0.03, 0.22, X + 3.5 + (n % 8) * 0.2, Y2 + 0.2 + Math.floor(n / 8) * 0.6, Z + 14.34); collide(X + 4.2, Z + 14.5, 1.9, 0.5, 5);
      slab(0xefe4cf, 1.1, 0.74, 0.45, X + 4, Y2, Z + 12.95); put(M.plain, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18).rotateX(Math.PI / 2).translate(X + 4, Y2 + 1.4, Z + 12.72), 0xb9c8d8); for (let n = 0; n < 4; n++) put(M.plain, new THREE.CylinderGeometry(0.025, 0.03, 0.09, 6).translate(X + 3.7 + n * 0.16, Y2 + 0.79, Z + 12.95), [0xff8ad8, 0xc85cff, 0xcfe8ff, 0xd9a520][n]); collide(X + 4, Z + 12.95, 1.2, 0.6, 5);
      for (let n = 0; n < 3; n++) slab([0xff5fd2, 0x49e0d0, 0xc9b6f2][n], 0.7, 0.9, 0.03, X + 5.9 + n * 1.1, Y2 + 1.5, Z + 14.7); slab(0xffe0ec, 0.04, 1.4, 1.2, X + 8.98, Y2 + 1.1, Z + 11.8, M.glow); for (const s2 of [-1, 1]) slab(0xf7a8c4, 0.08, 1.8, 0.3, X + 8.9, Y2 + 0.9, Z + 11.8 + s2 * 0.72);
      put(M.glow, new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10).translate(X + 7.1, Y2 + UP - 0.02, Z + 11.6), 0xfff2c0);
      // Who is up here, most evenings.
      const aj = makeLook('aj'), meadow = makeLook('meadow');
      aj.group.position.set(X + 1.3, Y2 + 0.05, Z + 10.3); aj.group.rotation.y = Math.PI / 2; aj.set('sit'); scene.add(aj.group);
      meadow.group.position.set(X + 7.8, Y2, Z + 9.6); meadow.group.rotation.y = Math.PI / 2; meadow.set('sit'); scene.add(meadow.group);
      roomLamp(q, X - 1, Y2 + 2.7, Z + 7.3, 0xfff0d0, 30, 13); roomLamp(q, X - 5.4, Y2 + 2.7, Z + 12, 0xffe8c8, 40, 12); roomLamp(q, X + 4, Y2 + 2.7, Z + 11.4, 0xfff0e0, 36, 12);
      places.house2 = { y: Y2, bedside: { x: X - 5.6, z: Z + 11.9 }, stairTop: { x: X + 7.25, z: Z + 7.2 }, stairFoot: { x: X + 7.25, z: Z + 0.3 }, bath: { x: X - 7.1, z: Z + 17.2 }, upstairs: [aj, meadow] };
      places.beds = [{ x: X - 5.9, z: Z + 11.9, name: 'Sleep' }];
    }
    // The refrigerator door is its own piece, so that it can be opened (F, between jobs: sidejobs.js).
    const fridgeDoor = new THREE.Group(), fd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.28, 0.98).translate(0, 0.66, 0.49), new THREE.MeshLambertMaterial({ color: 0xe9e2d2 })), fh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.04).translate(0.05, 0.9, 0.86), new THREE.MeshLambertMaterial({ color: 0xc9cbd2 }));
    fridgeDoor.add(fd, fh); fridgeDoor.position.set(X - 6.77, Y + 0.04, Z + 4.01); scene.add(fridgeDoor);
    slab(0xfff6d8, 0.02, 1.2, 0.9, X - 6.8, Y + 0.08, Z + 4.5, M.glow); for (let k = 0; k < 3; k++) { slab(0xcfe8ff, 0.3, 0.02, 0.86, X - 6.95, Y + 0.3 + k * 0.4, Z + 4.5); for (let n = 0; n < 4; n++) slab([0xd8342c, 0xf4f4f0, 0x2f7d46, 0xffe066, 0xc8705a, 0x8a5a2a][(n + k) % 6], 0.14, 0.16 + (n % 2) * 0.06, 0.14, X - 6.9, Y + 0.32 + k * 0.4, Z + 4.15 + n * 0.22); }
    const carmela = makeLook('carmela');
    carmela.group.position.set(X - 4, Y, Z - 3.6); carmela.group.rotation.y = Math.PI; scene.add(carmela.group);
    places.houseRoom = { ambient: [carmela], inside: { x: X + 2, z: Z + 3.2, h: Math.PI }, fridge: { door: fridgeDoor, at: { x: X - 6, z: Z + 4.5 }, from: { x: X - 6.8, y: Y + 0.8, z: Z + 4.5 } } };
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
    { // The room, as a room somebody has been in for three weeks: cards, flowers nobody waters, a television, the curtain, the wall of sockets
      const TEAL = 0x7fb8b0, STEELC = 0xc9cbd2, BRASS = 0xd9a520;
      for (const s of [-1, 1]) { slab(TEAL, 11.4, 1, 0.04, X, Y, Z + s * 4.98); slab(TEAL, 0.04, 1, 9.4, X + s * 5.98, Y, Z); }
      slab(0xe9e2d2, 2.3, 0.5, 0.06, X - 2.5, Y + 1.25, Z - 4.96); for (let n = 0; n < 5; n++) { slab(STEELC, 0.12, 0.12, 0.03, X - 3.3 + n * 0.4, Y + 1.44, Z - 4.92); ball([0x2f9a5a, 0xf4f4f0, 0xffe066, 0x2f6fd0, 0xd8342c][n], 0.025, X - 3.3 + n * 0.4, Y + 1.5, Z - 4.9); } // oxygen, suction, power: the panel behind the bed
      slab(0xfdfdf6, 1.6, 0.08, 0.14, X - 2.5, Y + 2, Z - 4.92, M.glow); slab(0xd8342c, 0.06, 0.1, 0.03, X - 3.5, Y + 1.05, Z - 3.12); post(0xf4f4f0, 0.006, 0.5, X - 3.5, Y + 0.6, Z - 3.12, 3);                                    // the light over him; the button on its cord
      slab(STEELC, 0.5, 0.75, 0.45, X - 4.5, Y, Z - 1.9); slab(0xf4f4f0, 0.52, 0.03, 0.47, X - 4.5, Y + 0.75, Z - 1.9); put(M.plain, new THREE.CylinderGeometry(0.06, 0.05, 0.18, 8).translate(X - 4.6, Y + 0.87, Z - 1.95), 0xcfe8ff); put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8).translate(X - 4.4, Y + 0.82, Z - 1.8), 0xcfe8ff);
      put(M.plain, new THREE.CylinderGeometry(0.16, 0.11, 0.1, 10).translate(X - 4.5, Y + 0.83, Z - 2.05), 0x8a6a44); for (const [dx, hex] of [[-0.05, 0xd8342c], [0.05, 0xf2c230], [0, 0xff8a5c]]) ball(hex, 0.05, X - 4.5 + dx, Y + 0.92, Z - 2.05 + dx);     // fruit nobody is going to eat
      slab(0xf4f4f0, 0.3, 0.4, 0.03, X - 1.3, Y + 0.5, Z - 1.98); slab(0x2f6fd0, 0.24, 0.06, 0.035, X - 1.3, Y + 0.78, Z - 1.98);                                                                                    // the chart, hung on the foot of the bed
      for (const sx of [-0.1, 0.12]) slab(0x5a3320, 0.11, 0.05, 0.26, X - 3.3 + sx, Y, Z - 1.5);                                                                                                                  // slippers he has not worn
      // The curtain on its rail, pulled back to the wall.
      slab(STEELC, 0.03, 0.03, 4, X - 0.5, Y + 2.5, Z - 3); slab(STEELC, 5.3, 0.03, 0.03, X - 3.15, Y + 2.5, Z - 1); for (let n = 0; n < 5; n++) post(0x9fd0c8, 0.07, 2.2, X - 0.5, Y + 0.3, Z - 4.8 + n * 0.11, 6);
      // The sill: cards, flowers, a balloon somebody's kid brought.
      slab(0xf4f4f0, 3.2, 0.05, 0.3, X + 2.5, Y + 1.02, Z - 4.82); for (let n = 0; n < 6; n++) put(M.plain, new THREE.BoxGeometry(0.2, 0.26, 0.01).rotateY(n % 2 ? 0.3 : -0.3).translate(X + 1.3 + n * 0.3, Y + 1.19, Z - 4.8), [0xf7c8d4, 0xf4f4f0, 0xffe066, 0x9fd0f5, 0xf4f4f0, 0xf7a8c4][n]);
      for (const [dx, k] of [[3.3, 0], [3.8, 1]]) { put(M.plain, new THREE.CylinderGeometry(0.08, 0.06, 0.2, 8).translate(X + dx, Y + 1.15, Z - 4.82), 0x9fd0f5); for (let n = 0; n < 4; n++) ball([0xd8342c, 0xffe066, 0xf4f4f0, 0xff8ad8][(n + k) % 4], 0.06, X + dx + Math.sin(n * 1.7) * 0.08, Y + 1.36 + (n % 2) * 0.06, Z - 4.82 + Math.cos(n * 1.7) * 0.06); }
      ball(0x2f6fd0, 0.2, X + 4.3, Y + 2.2, Z - 4.5); post(0xf4f4f0, 0.004, 1.1, X + 4.3, Y + 1.05, Z - 4.5, 3);
      for (const s of [-1, 1]) slab(0x9fd0c8, 0.3, 1.9, 0.08, X + 2.5 + s * 1.7, Y + 0.7, Z - 4.9);
      // A second chair, a couch for whoever stays the night, the television up on its arm, the sink, the bin.
      slab(0xb9a58a, 0.6, 0.5, 0.6, X + 2.6, Y, Z - 3.4); slab(0xb9a58a, 0.6, 0.6, 0.08, X + 2.6, Y + 0.5, Z - 3.68);
      slab(0x5f8fb0, 0.9, 0.42, 2.2, X + 5.3, Y, Z + 1.4); slab(0x5f8fb0, 0.2, 0.5, 2.2, X + 5.7, Y + 0.42, Z + 1.4); slab(0xf4f4f0, 0.5, 0.12, 0.4, X + 5.3, Y + 0.42, Z + 0.6); slab(0x9fd0f5, 0.8, 0.05, 1, X + 5.3, Y + 0.43, Z + 1.8); collide(X + 5.3, Z + 1.4, 1, 2.3, 1);
      slab(0x1c1c22, 0.5, 0.06, 0.06, X + 5.6, Y + 2.5, Z - 3.6); slab(0x1c1c22, 0.4, 0.6, 0.8, X + 5.2, Y + 2.1, Z - 3.6); slab(0x9fd0f5, 0.02, 0.48, 0.66, X + 4.99, Y + 2.16, Z - 3.6, M.glow);
      slab(0xf4f4f0, 0.6, 0.16, 0.5, X - 5.5, Y + 0.8, Z + 3.9); post(STEELC, 0.02, 0.24, X - 5.7, Y + 0.96, Z + 3.9, 5); slab(0xb9c8d8, 0.03, 0.6, 0.5, X - 5.96, Y + 1.3, Z + 3.9); slab(0xf4f4f0, 0.14, 0.24, 0.12, X - 5.9, Y + 1.2, Z + 3.3); post(0xffe066, 0.16, 0.5, X - 5.5, Y, Z + 3.1, 8); // the sink, the gel, the yellow bin
      slab(0xf4f4f0, 0.02, 0.5, 0.4, X - 5.97, Y + 1.5, Z + 0.4); for (let n = 0; n < 4; n++) slab(0x23232b, 0.022, 0.03, 0.3, X - 5.96, Y + 1.56 + n * 0.1, Z + 0.4);                                                 // the board: nurse today, doctor today, nil by mouth
      slab(BRASS, 0.05, 0.3, 0.02, X - 4.6, Y + 2.2, Z - 4.97); slab(BRASS, 0.18, 0.05, 0.02, X - 4.6, Y + 2.36, Z - 4.97);
      slab(0x2a2a30, 0.5, 0.9, 0.04, X + 5.96, Y + 1, Z + 3.6); slab(0x7a1626, 0.4, 0.8, 0.06, X + 5.9, Y + 1.05, Z + 3.6);                                                                                         // his own dressing gown, on the hook
      // The line on the monitor, going round; the drip, dripping.
      const blip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xeaffff })), drop = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), new THREE.MeshBasicMaterial({ color: 0xd6ecf5 }));
      scene.add(blip); scene.add(drop);
      updaters.push(t => { const k = (t * 0.6) % 1, beat = Math.abs(k - 0.5) < 0.06 ? Math.sin((k - 0.44) / 0.12 * Math.PI * 2) * 0.1 : 0; blip.position.set(X - 4.62 + k * 0.44, Y + 1.34 + beat, Z - 3.36); const d = (t * 0.8) % 1; drop.position.set(X - 1, Y + 1.66 - d * 0.22, Z - 3.6); });
    }
    q.lights.length = 0; roomLamp(q, X - 1.5, Y + 3, Z - 1.5, 0xf0f6ff, 28, 12); roomLamp(q, X + 3, Y + 2.8, Z + 1, 0xffe8d0, 16, 9);
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
  // A dining chair at a seat { x, z, h }: a thin seat on four legs and a back, facing h.
  const chairAt = (st, y, hex) => {
    slab(hex, 0.46, 0.07, 0.46, st.x, y + 0.4, st.z);
    for (const [fx, fz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) post(0x3a2418, 0.025, 0.4, st.x + fx, y, st.z + fz, 4);
    put(M.plain, new THREE.BoxGeometry(0.46, 0.5, 0.05).translate(0, 0.74, -0.22).rotateY(st.h).translate(st.x, y, st.z), hex);
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
  { // ----- Vice General: the lobby, the lift up, and the corridor of the ward where Jackie's room is (owner feedback: build the hospital) -----
    const WX = places.wardRoom.inside.x - 2, TEAL = 0x7fb8b0, STEELC = 0xc9cbd2, WHITE = 0xf4f4f0, REDX = 0xd8342c, NAVY = 0x2c3a5a;
    const lay = (tex, w, d, x, z, yy, shiny = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shiny ? new THREE.MeshPhongMaterial({ map: tex, shininess: shiny, specular: 0x666666 }) : new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, yy, z); scene.add(m); };
    const vinyl = texture(128, 128, (c, w) => { c.fillStyle = '#e4e9e6'; c.fillRect(0, 0, w, w); for (let n = 0; n < 380; n++) { c.fillStyle = ['#cfd6d2', '#f4f7f5', '#b9c4c0'][n % 3]; c.fillRect((n * 53) % w, (n * 97) % w, 2, 2); } c.strokeStyle = 'rgba(150,165,160,.5)'; c.lineWidth = 1; c.strokeRect(0, 0, w, w); });
    const shell = (q, w, d) => { // what every floor of it has: speckled vinyl, a band of colour, a rail to hold, strip lights
      const t = vinyl.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, d / 1.2); lay(t, w - 0.6, d - 0.6, q.X, q.Z, q.Y + 0.004, 70);
      for (const s of [-1, 1]) { slab(TEAL, w - 0.6, 1.05, 0.04, q.X, q.Y, q.Z + s * (d / 2 - 0.32)); slab(TEAL, 0.04, 1.05, d - 0.6, q.X + s * (w / 2 - 0.32), q.Y, q.Z); slab(0x8a6a4a, w - 0.6, 0.07, 0.09, q.X, q.Y + 0.95, q.Z + s * (d / 2 - 0.36), M.wood, 1); slab(0x8a6a4a, 0.09, 0.07, d - 0.6, q.X + s * (w / 2 - 0.36), q.Y + 0.95, q.Z, M.wood, 1); }
    };
    const strip = (q, x, z, w, d) => { slab(0xfdfdf6, w, 0.03, d, q.X + x, q.Y + q.h - 0.04, q.Z + z, M.glow); slab(STEELC, w + 0.1, 0.05, d + 0.1, q.X + x, q.Y + q.h - 0.02, q.Z + z); };
    const wheelchair = (x, y, z, turn) => { const c2 = Math.cos(turn), s2 = Math.sin(turn); slab(NAVY, 0.5, 0.06, 0.5, x, y + 0.5, z); put(M.plain, new THREE.BoxGeometry(0.5, 0.5, 0.05).translate(0, 0.78, -0.25).rotateY(turn).translate(x, y, z), NAVY); for (const sd of [-1, 1]) { put(M.plain, new THREE.TorusGeometry(0.3, 0.025, 5, 16).rotateY(Math.PI / 2 + turn).translate(x + c2 * sd * 0.3, y + 0.3, z - s2 * sd * 0.3), 0x23232b); post(STEELC, 0.015, 0.5, x + c2 * sd * 0.26, y + 0.5, z - s2 * sd * 0.26 - 0.24, 4); } };
    const gurney = (x, y, z, along) => { const w = along ? 2 : 0.75, d = along ? 0.75 : 2; slab(STEELC, w, 0.06, d, x, y + 0.75, z); slab(WHITE, w - 0.1, 0.12, d - 0.1, x, y + 0.81, z); slab(0x9fd0f5, along ? 1.1 : 0.66, 0.03, along ? 0.66 : 1.1, x + (along ? 0.3 : 0), y + 0.93, z + (along ? 0 : 0.3)); slab(WHITE, along ? 0.4 : 0.5, 0.1, along ? 0.5 : 0.4, x - (along ? 0.7 : 0), y + 0.93, z - (along ? 0 : 0.7)); for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { post(STEELC, 0.02, 0.75, x + fx * (w / 2 - 0.1), y, z + fz * (d / 2 - 0.1), 5); ball(0x23232b, 0.05, x + fx * (w / 2 - 0.1), y + 0.05, z + fz * (d / 2 - 0.1)); } };
    const drip = (x, y, z) => { post(STEELC, 0.015, 1.9, x, y, z, 5); for (let n = 0; n < 4; n++) slab(STEELC, 0.3, 0.02, 0.02, x + Math.cos(n * 1.57) * 0.12, y + 0.03, z + Math.sin(n * 1.57) * 0.12); slab(0xd6ecf5, 0.14, 0.24, 0.07, x + 0.1, y + 1.6, z, M.glow); };
    const plant = (x, y, z) => { post(0xb5523b, 0.24, 0.45, x, y, z, 10); ball(0x2f7d46, 0.45, x, y + 0.95, z); ball(0x3f9a5a, 0.32, x + 0.12, y + 1.4, z - 0.06); };
    const SCRUBS = { shirt: 0x5fb0a8, tee: true, pants: 0x5fb0a8, shoes: 0xf2efe8 }, COAT = { jacket: 0xf4f4f0, shirt: 0x9fd0f5, tie: 0x2c3a5a, tucked: true, pants: 0x3a3a44 }, NURSE = { body: 'female', shirt: 0xf4f4f0, tee: true, pants: 0xf4f4f0, shoes: 0xf2efe8, hairMesh: 'long' };

    // ----- The lobby -----
    const q = rooms.HOSPITAL = room(22, 14, 3.8, { floor: M.paver, floorTint: 0xe6ebe8, wall: M.plain, wallTint: 0xf1f4f2, ceil: 0xf6f6f2, door: 0x9fb8c0, at: [WX, 34] });
    shell(q, 22, 14);
    // Lines on the floor to follow: blue to the lifts, red to Emergency, green to the pharmacy.
    for (const [hex, pts] of [[0x2f6fd0, [[0.3, 6.4, 0.3, 0.8], [0.3, 0.8, 7.9, 0.8], [7.9, 0.8, 7.9, -5.2]]], [REDX, [[0, 6.4, 0, 1.2], [0, 1.2, 9.9, 1.2]]], [0x2f9a5a, [[-0.3, 6.4, -0.3, 1.6], [-0.3, 1.6, 4.2, 1.6], [4.2, 1.6, 4.2, 5.4]]]]) for (const [x0, z0, x1, z1] of pts) slab(hex, Math.abs(x1 - x0) + 0.1, 0.012, Math.abs(z1 - z0) + 0.1, q.X + (x0 + x1) / 2, q.Y + 0.006, q.Z + (z0 + z1) / 2);
    // Information: the desk under the name of the place, glass in front of whoever is behind it.
    counter(q, 0, -2.6, 6.4, 0xe9eeee, 0); slab(TEAL, 6.6, 0.3, 0.06, q.X, q.Y + 0.5, q.Z - 2.17); slab(0xcfe8ff, 6.2, 0.6, 0.02, q.X, q.Y + 1.13, q.Z - 2.3);
    sign('INFORMATION', q.X, q.Y + 2.55, q.Z - 2.2, 0, { w: 2.6, h: 0.42, color: '#f4f4f0', bg: '#2c3a5a', size: 0.7, glow: false }); for (const s of [-1, 1]) post(STEELC, 0.012, 0.9, q.X + s * 1.2, q.Y + 2.8, q.Z - 2.2, 4);
    for (const [dx, k] of [[-2, 0], [1.6, 1]]) { slab(0x23232b, 0.5, 0.36, 0.05, q.X + dx, q.Y + 1.2, q.Z - 2.9); slab(0x9fd0f5, 0.44, 0.3, 0.02, q.X + dx, q.Y + 1.23, q.Z - 2.93, M.glow); slab(0xe9e2cf, 0.3, 0.03, 0.14, q.X + dx, q.Y + 1.13, q.Z - 2.62); slab(0xe9e2cf, 0.22, 0.08, 0.18, q.X + dx + 0.7, q.Y + 1.13, q.Z - 2.8); void k; }
    for (let n = 0; n < 3; n++) slab([0xf4f4f0, 0xffe066, 0xf7c8d4][n], 0.24, 0.02 + n * 0.012, 0.32, q.X - 0.6 + n * 0.3, q.Y + 1.13, q.Z - 2.5); put(M.plain, new THREE.SphereGeometry(0.05, 8, 5, 0, 7, 0, 1.6).translate(q.X + 0.5, q.Y + 1.13, q.Z - 2.4), 0xd9a520);     // forms in three colours; the bell
    slab(0xf4f4f0, 0.3, 0.38, 0.02, q.X + 2.8, q.Y + 1.2, q.Z - 2.36); slab(REDX, 0.2, 0.06, 0.025, q.X + 2.8, q.Y + 1.42, q.Z - 2.35);                                                                 // VISITING HOURS, in a stand
    sign(['VICE GENERAL', 'HOSPITAL'], q.X, q.Y + 2.75, q.Z - 6.66, 0, { w: 6, h: 1.3, color: '#2c3a5a', bg: '#f1f4f2', size: 0.7, glow: false });
    for (const [w, h] of [[0.9, 0.3], [0.3, 0.9]]) slab(REDX, w, h, 0.04, q.X - 3.9, q.Y + 2.95 - h / 2 + (h < 0.5 ? 0 : 0), q.Z - 6.66); slab(REDX, 0.9, 0.3, 0.04, q.X - 3.9, q.Y + 2.35, q.Z - 6.66);
    for (let n = 0; n < 4; n++) { slab(0xb9bcc4, 0.7, 1.3, 0.5, q.X - 2.1 + n * 0.75, q.Y, q.Z - 6.4); for (let k = 0; k < 3; k++) slab(STEELC, 0.3, 0.03, 0.02, q.X - 2.1 + n * 0.75, q.Y + 0.25 + k * 0.4, q.Z - 6.14); } collide(q.X - 1, q.Z - 6.4, 3.2, 0.6, 1.3);
    put(M.plain, new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20).rotateX(Math.PI / 2).translate(q.X + 4.2, q.Y + 2.9, q.Z - 6.66), 0xf4f4f0); put(M.plain, new THREE.TorusGeometry(0.24, 0.02, 4, 20).translate(q.X + 4.2, q.Y + 2.9, q.Z - 6.64), 0x23232b); slab(0x23232b, 0.02, 0.16, 0.01, q.X + 4.2, q.Y + 2.9, q.Z - 6.63); slab(0x23232b, 0.12, 0.02, 0.01, q.X + 4.26, q.Y + 2.9, q.Z - 6.63);
    slab(0x8a6a4a, 1.6, 1.1, 0.04, q.X + 2.6, q.Y + 1.5, q.Z - 6.66, M.wood, 1); for (let n = 0; n < 9; n++) slab([0xf4f4f0, 0xffe066, 0xf7c8d4, 0x9fd0f5][n % 4], 0.3, 0.38, 0.045, q.X + 2.05 + (n % 4) * 0.37, q.Y + 1.6 + Math.floor(n / 4) * 0.46, q.Z - 6.65); // the notice board
    q.clerk = q.person({ ...NURSE, hair: 0x2a1a14 }, -1.4, -3.7, 0); q.person({ ...SCRUBS, hair: 0x111111, hairMesh: 'buzzed', dark: true }, 1.8, -3.9, 0.3);
    // Waiting: three rows of chairs bolted together, a television nobody chose the channel of, the machines, the telephones.
    const seats = [];
    for (let r = 0; r < 3; r++) for (let n = 0; n < 5; n++) { const st = { x: q.X - 9.3 + n * 0.62, z: q.Z - 1 + r * 1.9, h: Math.PI }; chairAt(st, q.Y, [0x5f8fb0, 0x5f8fb0, 0x7fb8b0][r]); seats.push(st); if (n === 0) collide(q.X - 8.06, st.z, 3.2, 0.5, 0.9, true); }
    for (const [k, look] of [[1, { shirt: 0xd9c7a0, pants: 0x3b4a66, hair: 0x8d8a8e, age: 0.7 }], [3, { body: 'female', shirt: 0xf7a8c4, tee: true, pants: 0x23232b, hair: 0x2a1a14, hairMesh: 'long' }], [7, { shirt: 0x2f7d46, tee: true, pants: 0x3b6ea8, hair: 0x111111, dark: true }], [11, { body: 'female', shirt: 0x9fd0f5, pants: 0xd9c7a0, hair: 0x8d8a8e, hairMesh: 'long', age: 0.7 }], [13, { shirt: 0xf4f4f0, pants: 0x23232b, hair: 0x2b1b12, bulk: 1.2 }]]) q.person(look, seats[k].x - q.X, seats[k].z - q.Z, Math.PI, 'sit');
    slab(0x1c1c22, 1.5, 0.9, 0.12, q.X - 8, q.Y + 2.4, q.Z - 6.6); slab(0x9fd0f5, 1.36, 0.76, 0.02, q.X - 8, q.Y + 2.47, q.Z - 6.53, M.glow); slab(0x1c1c22, 0.1, 0.4, 0.1, q.X - 8, q.Y + 3.3, q.Z - 6.6);
    q.block(0x8a6a4a, 1.1, 0.4, 0.6, -8, -3.4, M.wood, 1); for (let n = 0; n < 4; n++) slab([0xd8342c, 0xf4f4f0, 0x2f56c8, 0xffe066][n], 0.24, 0.012, 0.32, q.X - 8.35 + n * 0.24, q.Y + 0.4 + n * 0.012, q.Z - 3.4);
    for (const [dz, hex, lit] of [[4.2, REDX, 0xff8a70], [5.4, 0x2f56c8, 0x9fd0f5]]) { slab(hex, 0.8, 1.9, 1, q.X - 10.3, q.Y, q.Z + dz); slab(lit, 0.03, 1.2, 0.7, q.X - 9.89, q.Y + 0.55, q.Z + dz - 0.1, M.glow); slab(0x16161c, 0.03, 0.3, 0.24, q.X - 9.89, q.Y + 0.9, q.Z + dz + 0.36); slab(0x16161c, 0.04, 0.16, 0.6, q.X - 9.88, q.Y + 0.2, q.Z + dz); } collide(q.X - 10.3, q.Z + 4.8, 0.9, 2.3, 2);
    for (const dz of [-5.6, -4.8]) { slab(STEELC, 0.12, 0.5, 0.4, q.X - 10.6, q.Y + 1.2, q.Z + dz); slab(0x16161c, 0.06, 0.2, 0.08, q.X - 10.5, q.Y + 1.32, q.Z + dz - 0.1); slab(TEAL, 0.3, 0.9, 0.03, q.X - 10.5, q.Y + 1, q.Z + dz + 0.3); }
    slab(STEELC, 0.36, 0.9, 0.36, q.X - 10.4, q.Y, q.Z - 3.6); slab(0x8fd0e8, 0.3, 0.04, 0.3, q.X - 10.4, q.Y + 0.9, q.Z - 3.6); collide(q.X - 10.4, q.Z - 3.6, 0.5, 0.5, 1);
    for (const [bx, bz] of [[-7.4, 5.5], [-6.6, 5.9]]) { slab([0xd8342c, 0xffe066][bx < -7 ? 0 : 1], 0.3, 0.3, 0.3, q.X + bx, q.Y, q.Z + bz); } ball(0x2f56c8, 0.14, q.X - 6.9, q.Y + 0.14, q.Z + 5.3); slab(0x49e0d0, 1.4, 0.012, 1.2, q.X - 7, q.Y + 0.006, q.Z + 5.6);          // the corner with the toys
    // The east side: the shop with flowers and balloons, the pharmacy hatch, Emergency through the doors, chairs with wheels, a trolley.
    q.block(0xf7e6c8, 3.4, 1, 0.7, 6.4, 5.9, M.wood, 1); slab(0xff8ad8, 3.6, 0.5, 0.05, q.X + 6.4, q.Y + 2.7, q.Z + 6.6); sign('GIFTS · FLOWERS', q.X + 6.4, q.Y + 2.95, q.Z + 6.56, Math.PI, { w: 3.2, h: 0.4, color: '#8a1c5a', bg: '#f7c8d4', size: 0.7, glow: false });
    for (let n = 0; n < 5; n++) { put(M.plain, new THREE.CylinderGeometry(0.1, 0.07, 0.22, 8).translate(q.X + 5 + n * 0.7, q.Y + 1.11, q.Z + 5.9), [0x9fd0f5, 0xf4f4f0, 0x2f7d46, 0xffe066, 0x9fd0f5][n]); for (let k = 0; k < 4; k++) ball([REDX, 0xffe066, 0xff8ad8, 0xf4f4f0, 0xc85cff][(n + k) % 5], 0.07, q.X + 5 + n * 0.7 + Math.sin(k * 1.7) * 0.09, q.Y + 1.34 + (k % 2) * 0.07, q.Z + 5.9 + Math.cos(k * 1.7) * 0.09); }
    for (let n = 0; n < 4; n++) { ball([REDX, 0xffe066, 0x49e0d0, 0xff8ad8][n], 0.2, q.X + 8.6 + (n % 2) * 0.32, q.Y + 2.1 + (n >> 1) * 0.34, q.Z + 5.8); post(WHITE, 0.004, 1, q.X + 8.76, q.Y + 1, q.Z + 5.8, 3); }
    for (const [dx, hex] of [[4.9, 0xd9b25a], [5.5, 0xf4f4f0], [6.1, 0x8a5a44], [6.7, 0xf7a8c4]]) { ball(hex, 0.13, q.X + dx, q.Y + 0.14, q.Z + 6.45); ball(hex, 0.08, q.X + dx, q.Y + 0.32, q.Z + 6.45); }
    q.person({ body: 'female', shirt: 0xf7a8c4, sleeves: 'long', pants: 0x23232b, hair: 0x8d8a8e, hairMesh: 'long', age: 0.6 }, 6.4, 6.45, Math.PI);
    slab(0xe9eeee, 2.6, 1.05, 0.5, q.X + 4.2, q.Y, q.Z - 6.4); slab(0xcfe8ff, 2.4, 0.9, 0.03, q.X + 4.2, q.Y + 1.1, q.Z - 6.3); slab(0x23232b, 2.6, 0.12, 0.1, q.X + 4.2, q.Y + 2.05, q.Z - 6.3);
    sign('PHARMACY', q.X + 4.2, q.Y + 2.32, q.Z - 6.62, 0, { w: 2, h: 0.36, color: '#f4f4f0', bg: '#2f9a5a', size: 0.72, glow: false }); for (let n = 0; n < 12; n++) slab([0xf4f4f0, 0xff8a30, 0x9fd0f5, 0xffe066][n % 4], 0.12, 0.18, 0.1, q.X + 3.2 + (n % 6) * 0.38, q.Y + 1.2 + Math.floor(n / 6) * 0.3, q.Z - 6.6); collide(q.X + 4.2, q.Z - 6.4, 2.7, 0.6, 2);
    for (const s of [-1, 1]) { slab(0xb9c4c8, 0.08, 2.5, 1.3, q.X + 10.64, q.Y, q.Z + 1.2 + s * 0.68); put(M.plain, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14).rotateZ(Math.PI / 2).translate(q.X + 10.62, q.Y + 1.7, q.Z + 1.2 + s * 0.68), 0xcfe8ff); slab(STEELC, 0.1, 0.5, 0.2, q.X + 10.6, q.Y + 0.9, q.Z + 1.2 + s * 0.2); }
    sign('EMERGENCY', q.X + 10.66, q.Y + 2.85, q.Z + 1.2, -Math.PI / 2, { w: 2.6, h: 0.5, color: '#f4f4f0', bg: '#d8342c', size: 0.76 });
    wheelchair(q.X + 9.6, q.Y, q.Z + 3.6, -Math.PI / 2); wheelchair(q.X + 9.6, q.Y, q.Z + 4.4, -Math.PI / 2); gurney(q.X + 9.4, q.Y, q.Z - 1.6, false); drip(q.X + 10.2, q.Y, q.Z - 2.9); collide(q.X + 9.5, q.Z + 4, 0.8, 1.6, 1, true); collide(q.X + 9.4, q.Z - 1.6, 0.9, 2.1, 1, true);
    // The lifts, in the north-east corner.
    for (const [dx, lit] of [[7.1, 3], [8.7, 1]]) { slab(0x8a8d96, 1.3, 2.4, 0.08, q.X + dx, q.Y, q.Z - 6.64); slab(STEELC, 0.62, 2.3, 0.1, q.X + dx - 0.32, q.Y, q.Z - 6.62); slab(STEELC, 0.62, 2.3, 0.1, q.X + dx + 0.32, q.Y, q.Z - 6.62); slab(0x23232b, 0.02, 2.3, 0.11, q.X + dx, q.Y, q.Z - 6.62); slab(0x16161c, 0.5, 0.2, 0.04, q.X + dx, q.Y + 2.5, q.Z - 6.63); slab(0xff8a30, 0.12, 0.12, 0.05, q.X + dx - 0.14 + lit * 0.07, q.Y + 2.54, q.Z - 6.62, M.glow); }
    slab(STEELC, 0.14, 0.3, 0.04, q.X + 7.9, q.Y + 1.1, q.Z - 6.64); slab(0xffe066, 0.06, 0.06, 0.05, q.X + 7.9, q.Y + 1.28, q.Z - 6.63, M.glow); slab(0x23232b, 0.06, 0.06, 0.05, q.X + 7.9, q.Y + 1.14, q.Z - 6.63);
    sign(['LIFTS', 'WARDS  2 - 5'], q.X + 7.9, q.Y + 3.05, q.Z - 6.64, 0, { w: 2.2, h: 0.5, color: '#f4f4f0', bg: '#2f6fd0', size: 0.66, glow: false });
    for (const [px, pz] of [[-3.6, 5.9], [3.6, -5.9], [-10, -6]]) { plant(q.X + px, q.Y, q.Z + pz); collide(q.X + px, q.Z + pz, 0.6, 0.6, 1.4, true); }
    for (const [px, pz] of [[2.2, 6.4], [-5.2, -6.3]]) { post(0x8a8d96, 0.2, 0.7, q.X + px, q.Y, q.Z + pz, 10); slab(0x23232b, 0.3, 0.04, 0.1, q.X + px, q.Y + 0.6, q.Z + pz - 0.19); }
    for (const [sx, sz, w, d] of [[-6, -3, 3.2, 0.5], [-6, 1.5, 3.2, 0.5], [0, 2.5, 0.5, 4.4], [6, -3, 3.2, 0.5], [6, 2.6, 3.2, 0.5], [-1.4, -5, 2.6, 0.5]]) strip(q, sx, sz, w, d);
    q.person({ ...COAT, hair: 0x8d8a8e, hairStyle: 'balding', glasses: 'clear', age: 0.5 }, 3.4, -1.3, -2.2, 'talk'); q.person({ ...SCRUBS, body: 'female', hair: 0x2a1a14, hairMesh: 'long' }, 2.4, -1.6, 1.1);
    q.person({ shirt: 0x9fd0f5, pants: 0x9fd0f5, hair: 0xe9e2cf, age: 0.8, bulk: 0.9 }, 9.3, 4.4, -Math.PI / 2, 'sit');                                                                             // somebody waiting for a porter
    q.lights.length = 0; q.light(0, 3.4, -1.5, 0xf2f8ff, 44, 15); q.light(-7, 3.4, 1.5, 0xf2f8ff, 34, 13); q.light(7, 3.4, 0, 0xf2f8ff, 34, 13); q.light(6.4, 2.6, 5.2, 0xffd9e8, 16, 6);
    q.desk = { x: q.X, z: q.Z - 1.4 }; q.lifts = { x: q.X + 7.9, z: q.Z - 5.5 };

    // ----- The ward: one corridor, the station in the middle of it, numbered doors, his at the end -----
    const u = rooms.WARDHALL = room(22, 6, 3.2, { floor: M.paver, floorTint: 0xe6ebe8, wall: M.plain, wallTint: 0xf1f4f2, ceil: 0xf6f6f2, door: 0x9fb8c0, doorX: 9.6, at: [WX, 14] });
    shell(u, 22, 6);
    slab(0x2f6fd0, 20, 0.012, 0.1, u.X, u.Y + 0.006, u.Z + 0.2);
    for (let n = 0; n < 6; n++) { // doors down both sides
      const north = n < 3, dx = -7.4 + (n % 3) * 5.2 + (north ? 0 : 2.6), dz = north ? -2.66 : 2.66;
      if (!north && dx > 8) continue;
      slab(0xb9c8c8, 1.2, 2.3, 0.06, u.X + dx, u.Y, u.Z + dz); slab(0xcfe8ff, 0.24, 0.6, 0.07, u.X + dx + 0.3, u.Y + 1.3, u.Z + dz); slab(STEELC, 0.05, 0.14, 0.09, u.X + dx - 0.45, u.Y + 1, u.Z + dz);
      sign(String(north ? 412 + n * 2 : 411 + (n - 3) * 2), u.X + dx + 0.85, u.Y + 1.7, u.Z + dz + (north ? 0.04 : -0.04), north ? 0 : Math.PI, { w: 0.4, h: 0.2, color: '#2c3a5a', bg: '#f4f4f0', size: 0.8, glow: false });
      slab(0xf4f4f0, 0.24, 0.32, 0.03, u.X + dx - 0.85, u.Y + 1.3, u.Z + dz + (north ? 0.03 : -0.03));                                                                                               // the chart, in its holder
    }
    sign('APRILE, G.', u.X - 7.4, u.Y + 2.05, u.Z - 2.62, 0, { w: 0.9, h: 0.16, color: '#16161c', bg: '#f4f4f0', size: 0.7, glow: false });
    counter(u, -0.3, -1.6, 3.2, 0xe9eeee, 0); slab(TEAL, 3.4, 0.3, 0.06, u.X - 0.3, u.Y + 0.5, u.Z - 1.17); slab(0x23232b, 0.5, 0.34, 0.05, u.X - 1, u.Y + 1.2, u.Z - 1.8); slab(0x7dffb0, 0.44, 0.28, 0.02, u.X - 1, u.Y + 1.23, u.Z - 1.77, M.glow);
    for (let n = 0; n < 8; n++) slab([0x2f56c8, REDX, 0x2f9a5a, 0xffe066][n % 4], 0.05, 0.3, 0.24, u.X + 0.2 + n * 0.07, u.Y + 1.13, u.Z - 1.8); slab(0xe9e2cf, 0.22, 0.08, 0.18, u.X - 0.3, u.Y + 1.13, u.Z - 1.5); put(M.plain, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8).translate(u.X + 1.1, u.Y + 1.19, u.Z - 1.4), 0xf4f4f0);
    sign("NURSES' STATION", u.X - 0.3, u.Y + 2.6, u.Z - 2.66, 0, { w: 2.4, h: 0.34, color: '#f4f4f0', bg: '#2c3a5a', size: 0.7, glow: false }); sign('QUIET PLEASE', u.X + 4, u.Y + 2.3, u.Z + 2.66, Math.PI, { w: 1.6, h: 0.3, color: '#2c3a5a', bg: '#f4f4f0', size: 0.7, glow: false });
    u.clerk = u.person({ ...NURSE, hair: 0xc9a14a }, -0.3, -2.35, 0); u.person({ ...COAT, hair: 0x2b1b12, hairMesh: 'parted' }, 2.3, -0.7, -1.9, 'talk');
    gurney(u.X + 5.2, u.Y, u.Z + 2.1, true); collide(u.X + 5.2, u.Z + 2.1, 2.1, 0.9, 1, true); drip(u.X + 3.7, u.Y, u.Z + 2.3); wheelchair(u.X - 3.6, u.Y, u.Z + 2.2, Math.PI);
    slab(STEELC, 0.8, 0.9, 0.5, u.X + 2.2, u.Y, u.Z + 2.3); for (let n = 0; n < 3; n++) slab(0xf4f4f0, 0.7, 0.14, 0.44, u.X + 2.2, u.Y + 0.92 + n * 0.14, u.Z + 2.3); collide(u.X + 2.2, u.Z + 2.3, 0.9, 0.6, 1.3, true);          // the linen
    slab(STEELC, 0.5, 0.85, 0.4, u.X + 4.4, u.Y, u.Z - 2.3); for (let n = 0; n < 6; n++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6).translate(u.X + 4.25 + (n % 3) * 0.14, u.Y + 0.9, u.Z - 2.36 + Math.floor(n / 3) * 0.14), [0xff8a30, 0xf4f4f0, 0x9fd0f5][n % 3]); // the drugs trolley
    u.block(0x5f8fb0, 1.6, 0.44, 0.5, -4.6, 2.4); slab(0x5f8fb0, 1.6, 0.4, 0.08, u.X - 4.6, u.Y + 0.44, u.Z + 2.62); u.person({ body: 'female', shirt: 0x3a3a44, sleeves: 'long', pants: 0x23232b, hair: 0x2a1a14, hairMesh: 'long' }, -4.9, 2.4, Math.PI, 'sit');   // somebody's wife, waiting
    u.person({ shirt: 0x9fd0f5, pants: 0x9fd0f5, hair: 0x8d8a8e, age: 0.8, bulk: 0.9 }, 6.9, -1.3, -Math.PI / 2); drip(u.X + 7.3, u.Y, u.Z - 1.5);                                                           // a man in a gown, taking his drip for a walk
    slab(REDX, 0.16, 0.5, 0.16, u.X + 8.2, u.Y + 0.9, u.Z + 2.6); slab(0xf4f4f0, 0.2, 0.3, 0.1, u.X - 9.2, u.Y + 1.2, u.Z + 2.64); put(M.plain, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 18).rotateX(Math.PI / 2).translate(u.X + 6.4, u.Y + 2.5, u.Z + 2.66), 0xf4f4f0);
    u.window(-10.72, 0, 2, 1.4, 1.9, Math.PI / 2, 0xffd9a8); plant(u.X - 10, u.Y, u.Z + 1.9);
    for (const [dx, lit] of [[10.64, 4]]) { slab(0x8a8d96, 0.08, 2.4, 2.8, u.X + dx, u.Y, u.Z); for (const s of [-1, 1]) slab(STEELC, 0.1, 2.3, 0.62, u.X + dx - 0.02, u.Y, u.Z - 0.7 + s * 0.32); for (const s of [-1, 1]) slab(STEELC, 0.1, 2.3, 0.62, u.X + dx - 0.02, u.Y, u.Z + 0.7 + s * 0.32); slab(0x16161c, 0.04, 0.2, 0.5, u.X + dx - 0.02, u.Y + 2.5, u.Z); slab(0xff8a30, 0.05, 0.12, 0.12, u.X + dx - 0.03, u.Y + 2.54, u.Z + 0.1, M.glow); void lit; }
    for (const sx of [-7, -2, 3, 8]) strip(u, sx, 0, 2.4, 0.5);
    u.lights.length = 0; u.light(-6, 2.9, 0, 0xf2f8ff, 30, 12); u.light(1, 2.9, 0, 0xf2f8ff, 34, 12); u.light(7.5, 2.9, 0, 0xf2f8ff, 26, 10);
    u.lift = { x: u.X + 9.4, z: u.Z, h: -Math.PI / 2 }; u.his = { x: u.X - 7.4, z: u.Z - 1.7 }; u.station = { x: u.X - 0.3, z: u.Z - 0.4 };
    (places.stairs ??= []).push({ a: { x: q.lifts.x, z: q.lifts.z, h: 0 }, b: u.lift, up: 'Take the lift up to the wards', down: 'Take the lift down to the lobby' });
    (places.stairs ??= []).push({ a: { x: u.his.x, z: u.his.z, h: 0 }, b: { x: places.wardRoom.inside.x, z: places.wardRoom.inside.z + 0.6, h: Math.PI }, up: 'Go into room 412', down: 'Go back out to the corridor' });
  }

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
    q.person(pick(PED_ROOM_LOOKS), 5.1, 1.3, 0, 'sit');
    { // The luncheonette, laid for breakfast (owner: he meets his detective here; they sit down). The two front booths
      // get a bench on the other side of the table; every table gets what a table in a diner has on it.
      const RED = 0xd8342c, CHROMEC = 0xc9cbd2, WHITE = 0xf4f4f0;
      const check = texture(64, 64, (c, w) => { c.fillStyle = '#f1ece0'; c.fillRect(0, 0, w, w); c.fillStyle = '#23232b'; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32); });
      check.repeat.set(16, 12); { const m = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 11.4).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: check, shininess: 50, specular: 0x444444 })); m.position.set(q.X, q.Y + 0.025, q.Z); scene.add(m); }
      for (const s2 of [-1, 1]) { slab(RED, 15.4, 0.14, 0.04, q.X, q.Y + 1.1, q.Z + s2 * 5.68); slab(RED, 0.04, 0.14, 11.4, q.X + s2 * 7.68, q.Y + 1.1, q.Z); slab(CHROMEC, 15.4, 0.04, 0.05, q.X, q.Y + 1.26, q.Z + s2 * 5.68); slab(CHROMEC, 0.05, 0.04, 11.4, q.X + s2 * 7.68, q.Y + 1.26, q.Z); }
      q.booths = [];
      for (const x of [-5.5, 5.5]) {
        q.block(0x2f56c8, 2.4, 0.5, 0.7, x, 3.1); q.block(0x2a4ab0, 2.4, 0.7, 0.2, x, 3.35, M.plain, 0, 0.5);
        q.booths.push({ north: { x: q.X + x, y: q.Y, z: q.Z + 1.32, h: 0 }, south: { x: q.X + x, y: q.Y, z: q.Z + 3.08, h: Math.PI }, table: { x: q.X + x, z: q.Z + 2.2 }, aisle: { x: q.X + x + (x < 0 ? 1.9 : -1.9), z: q.Z + 2.2 } });
      }
      for (const [x, z] of [[-5.5, 2.2], [-5.5, 5], [5.5, 2.2], [5.5, 5]]) { // on every table
        const wallX = x < 0 ? x - 0.85 : x + 0.85;
        slab(CHROMEC, 0.12, 0.16, 0.2, q.X + wallX, q.Y + 0.8, q.Z + z); slab(WHITE, 0.08, 0.1, 0.16, q.X + wallX, q.Y + 0.84, q.Z + z);                                                                // napkins
        post(RED, 0.03, 0.18, q.X + wallX, q.Y + 0.8, q.Z + z - 0.25, 6); post(0xffe066, 0.03, 0.18, q.X + wallX, q.Y + 0.8, q.Z + z + 0.25, 6); post(CHROMEC, 0.025, 0.1, q.X + wallX + (x < 0 ? 0.14 : -0.14), q.Y + 0.8, q.Z + z - 0.1, 6); post(WHITE, 0.025, 0.1, q.X + wallX + (x < 0 ? 0.14 : -0.14), q.Y + 0.8, q.Z + z + 0.1, 6);
        slab(0x8a1c1c, 0.22, 0.012, 0.3, q.X + x + 0.5, q.Y + 0.8, q.Z + z + 0.3); slab(0x8a1c1c, 0.22, 0.012, 0.3, q.X + x - 0.3, q.Y + 0.8, q.Z + z - 0.3);                                               // menus
        slab(x < 0 ? 0x3a2418 : 0x3a2418, 0.3, 0.26, 0.1, q.X + (x < 0 ? x - 1.05 : x + 1.05), q.Y + 1.15, q.Z + z); slab(0xffb060, 0.2, 0.12, 0.02, q.X + (x < 0 ? x - 1.0 : x + 1.0), q.Y + 1.22, q.Z + z, M.glow);     // a little jukebox on the wall of each
        post(0x23232b, 0.008, 1.2, q.X + x, q.Y + 2.4, q.Z + z, 4); put(M.glow, new THREE.ConeGeometry(0.24, 0.26, 10, 1, true).translate(q.X + x, q.Y + 2.3, q.Z + z), 0xffe2a6);                              // a lamp over it
      }
      // The counter: coffee on the warmers, a cake under glass, the register, pies turning, tickets on the wheel; behind, the grill.
      for (const [cx, hex] of [[-3.2, 0x5a3320], [-2.8, 0xff8a30]]) { slab(0x23232b, 0.3, 0.06, 0.3, q.X + cx, q.Y + 1.14, q.Z - 3.5); put(M.plain, new THREE.CylinderGeometry(0.09, 0.1, 0.16, 10).translate(q.X + cx, q.Y + 1.28, q.Z - 3.5), 0xcfe8ff); put(M.plain, new THREE.CylinderGeometry(0.085, 0.095, 0.1, 10).translate(q.X + cx, q.Y + 1.25, q.Z - 3.5), hex); }
      put(M.plain, new THREE.CylinderGeometry(0.24, 0.24, 0.03, 14).translate(q.X + 0.6, q.Y + 1.15, q.Z - 3.4), CHROMEC); put(M.plain, new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14).translate(q.X + 0.6, q.Y + 1.22, q.Z - 3.4), 0xf2c8a0); { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.28, shininess: 160, specular: 0xffffff, depthWrite: false })); dome.position.set(q.X + 0.6, q.Y + 1.16, q.Z - 3.4); scene.add(dome); }
      slab(0x23232b, 0.42, 0.3, 0.36, q.X + 5.6, q.Y + 1.13, q.Z - 3.4); slab(0x7dffb0, 0.3, 0.1, 0.02, q.X + 5.6, q.Y + 1.34, q.Z - 3.21, M.glow);
      for (let n = 0; n < 6; n++) { put(M.plain, new THREE.CylinderGeometry(0.11, 0.11, 0.012, 12).translate(q.X - 3.5 + n * 1.5 + 0.3, q.Y + 1.14, q.Z - 3.05), WHITE); put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8).translate(q.X - 3.5 + n * 1.5 - 0.1, q.Y + 1.17, q.Z - 3.1), WHITE); }     // a place set at each stool
      slab(0x8a8d96, 9, 0.5, 0.06, q.X + 1, q.Y + 2.1, q.Z - 4.86); slab(0xffb060, 8.6, 0.04, 0.2, q.X + 1, q.Y + 2.08, q.Z - 4.75, M.glow); for (let n = 0; n < 7; n++) slab(WHITE, 0.1, 0.16, 0.01, q.X - 1.6 + n * 0.45, q.Y + 1.98, q.Z - 4.7);                                  // the pass: lamps, tickets
      sign(['TODAY', 'MEAT LOAF  4.95', 'PIE  1.50'], q.X - 5.2, q.Y + 2.5, q.Z - 5.66, 0, { w: 1.9, h: 1.1, color: '#f4f4f0', bg: '#1f3a2c', size: 0.5, glow: false });
      put(M.plain, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20).rotateX(Math.PI / 2).translate(q.X + 5.6, q.Y + 2.7, q.Z - 5.66), WHITE); put(M.glow, new THREE.TorusGeometry(0.3, 0.025, 5, 22).translate(q.X + 5.6, q.Y + 2.7, q.Z - 5.63), 0x49e0d0);
      post(RED, 0.16, 0.3, q.X - 7.2, q.Y + 0.9, q.Z + 0.2, 10); put(M.plain, new THREE.SphereGeometry(0.2, 10, 8).translate(q.X - 7.2, q.Y + 1.4, q.Z + 0.2), 0xcfe8ff); post(CHROMEC, 0.03, 0.9, q.X - 7.2, q.Y, q.Z + 0.2, 5);                                                    // gum, a penny
      post(0x3a2418, 0.03, 1.8, q.X + 7.2, q.Y, q.Z + 0.2, 6); for (let n = 0; n < 4; n++) slab(0x3a2418, 0.2, 0.03, 0.03, q.X + 7.2 + Math.cos(n * 1.57) * 0.1, q.Y + 1.7, q.Z + 0.2 + Math.sin(n * 1.57) * 0.1); slab(0x6f5a44, 0.3, 0.9, 0.16, q.X + 7.1, q.Y + 0.8, q.Z + 0.2);
      for (let n = 0; n < 5; n++) { slab(0x23232b, 0.03, 0.4, 0.5, q.X - 7.66, q.Y + 1.7, q.Z - 3.6 + n * 0.8); slab([0xd8d2c8, 0xe9e2cf, 0xb9b3ac][n % 3], 0.035, 0.32, 0.42, q.X - 7.65, q.Y + 1.74, q.Z - 3.6 + n * 0.8); }                                               // everybody famous who ever ate here
      q.person({ shirt: WHITE, tee: true, pants: 0x23232b, hair: 0x2b1b12, hat: 'cap', hatColor: 0xf4f4f0, bulk: 1.2, mustache: 0x2b1b12 }, 3.4, -4.5, Math.PI);                                                                                  // the cook, with his back to the room
      q.person({ body: 'female', shirt: 0x9fd0f5, pants: 0x3b4a66, hair: 0x8d8a8e, hairMesh: 'long', age: 0.6 }, -0.5, -2.3, Math.PI, 'sit').group.position.y = q.Y + 0.27;
      q.person({ shirt: 0x5c6157, sleeves: 'long', pants: 0x3a3a44, hair: 0x2b1b12, hat: 'cap', hatColor: 0x2f5a3f, bulk: 1.15 }, 2.5, -2.3, Math.PI, 'sit').group.position.y = q.Y + 0.27;
      q.waitress = { x: q.X - 2.6, z: q.Z - 1.4 };
    }
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
    { // ----- Her house, as she keeps it (owner feedback: it is his mother's house; build it, both floors) -----
      const BRASS = 0xd9a520, DARK = 0x3a2418, lay = (tex, w, d, x, z, yy, shiny = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shiny ? new THREE.MeshPhongMaterial({ map: tex, shininess: shiny, specular: 0x444444 }) : new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, yy, z); scene.add(m); };
      const paper = texture(128, 128, (c, w) => { c.fillStyle = '#e9dcc6'; c.fillRect(0, 0, w, w); c.fillStyle = '#dccdb2'; for (let k = 0; k < 4; k++) c.fillRect(k * 32 + 12, 0, 8, w); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 32 + 16 + (j % 2) * 16, y = j * 32 + 16; c.fillStyle = '#b5686a'; c.beginPath(); c.arc(x % w, y, 3.2, 0, 7); c.fill(); c.fillStyle = '#6a8a5a'; c.fillRect((x % w) - 5, y + 3, 4, 2); c.fillRect((x % w) + 2, y + 3, 4, 2); } });
      const hang = (qq, w, h, x, z, turn, rep) => { const t = paper.clone(); t.needsUpdate = true; t.repeat.set(rep, h / 1.1); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t })); m.rotation.y = turn; m.position.set(qq.X + x, qq.Y + 1 + h / 2, qq.Z + z); scene.add(m); };
      const dress = (qq, w, d) => { // wallpaper over a dark dado, on all four walls of a room
        hang(qq, w - 0.6, 2.3, 0, -d / 2 + 0.31, 0, w / 1.1); hang(qq, w - 0.6, 2.3, 0, d / 2 - 0.31, Math.PI, w / 1.1); hang(qq, d - 0.6, 2.3, -w / 2 + 0.31, 0, Math.PI / 2, d / 1.1); hang(qq, d - 0.6, 2.3, w / 2 - 0.31, 0, -Math.PI / 2, d / 1.1);
        for (const s of [-1, 1]) { slab(DARK, w - 0.6, 1, 0.04, qq.X, qq.Y, qq.Z + s * (d / 2 - 0.32), M.wood, 2); slab(DARK, 0.04, 1, d - 0.6, qq.X + s * (w / 2 - 0.32), qq.Y, qq.Z, M.wood, 2); }
      };
      dress(q, 14, 12);
      const shag = texture(64, 64, (c, w) => { c.fillStyle = '#7a7a4a'; c.fillRect(0, 0, w, w); for (let n = 0; n < 500; n++) { c.fillStyle = n % 2 ? '#6a6a3e' : '#8a8a58'; c.fillRect((n * 37) % w, (n * 91) % w, 2, 3); } });
      shag.repeat.set(7, 5); lay(shag, 7.4, 6, q.X - 3, q.Z - 2.4, q.Y + 0.004);
      const lino = texture(64, 64, (c, w) => { c.fillStyle = '#e9e2cf'; c.fillRect(0, 0, w, w); c.fillStyle = '#7a9a7a'; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32); });
      lino.repeat.set(7, 7.5); lay(lino, 5.6, 6, q.X + 3.9, q.Z + 2.7, q.Y + 0.004, 50);
      // The kitchen, in the corner by the street window: the stove where it happens, the sink, the icebox, a table with an oilcloth.
      q.block(0xe9e2cf, 0.9, 0.92, 4.6, 6.2, 3.3); slab(0x8a9a8a, 1, 0.04, 4.7, q.X + 6.2, q.Y + 0.92, q.Z + 3.3);
      q.block(0xe9e2cf, 2.6, 0.92, 0.9, 4.5, 5.2); slab(0x8a9a8a, 2.7, 0.04, 1, q.X + 4.5, q.Y + 0.92, q.Z + 5.2);
      slab(0xf4f4f0, 0.86, 0.94, 0.8, q.X + 6.2, q.Y, q.Z + 2.2); for (let n = 0; n < 4; n++) put(M.plain, new THREE.TorusGeometry(0.12, 0.02, 4, 12).rotateX(Math.PI / 2).translate(q.X + 6.05 + (n % 2) * 0.34, q.Y + 0.97, q.Z + 2.02 + (n >> 1) * 0.36), 0x1c1c22); slab(0x1c1c22, 0.03, 0.4, 0.6, q.X + 5.76, q.Y + 0.3, q.Z + 2.2); slab(0xf4f4f0, 0.1, 0.3, 0.8, q.X + 6.6, q.Y + 0.95, q.Z + 2.2); // the stove
      slab(0xc9cbd2, 0.9, 0.02, 0.5, q.X + 3.6, q.Y + 0.965, q.Z + 5.2); post(0xc9cbd2, 0.02, 0.26, q.X + 3.6, q.Y + 0.96, q.Z + 5.5, 6); slab(0xf4f4f0, 2.4, 0.3, 0.05, q.X + 3.5, q.Y + 2.45, q.Z + 5.64); for (let n = 0; n < 8; n++) slab(0xd8342c, 0.12, 0.3, 0.055, q.X + 2.5 + n * 0.3, q.Y + 2.45, q.Z + 5.64); // the sink under the window; a valance
      slab(0xe9e2cf, 0.8, 1.75, 0.8, q.X + 6.2, q.Y, q.Z + 0.35); slab(0xc9cbd2, 0.03, 0.4, 0.04, q.X + 5.78, q.Y + 1.1, q.Z + 0.05); slab(0xb9b3ac, 0.02, 0.01, 0.8, q.X + 5.79, q.Y + 1.3, q.Z + 0.35); collide(q.X + 6.2, q.Z + 0.35, 0.9, 0.9, 1.8);
      slab(0xe9e2cf, 0.4, 0.75, 3.2, q.X + 6.45, q.Y + 1.6, q.Z + 3.9); for (let n = 0; n < 4; n++) slab(BRASS, 0.03, 0.08, 0.03, q.X + 6.23, q.Y + 1.7, q.Z + 2.7 + n * 0.8);
      for (let n = 0; n < 4; n++) put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.2 - n * 0.02, 8).translate(q.X + 6.3, q.Y + 1.06, q.Z + 3.4 + n * 0.22), [0xd8342c, 0xf4f4f0, 0xd8342c, 0xf4f4f0][n]); slab(0x8a5a44, 0.3, 0.2, 0.34, q.X + 6.3, q.Y + 0.96, q.Z + 4.7, M.wood, 1); put(M.plain, new THREE.CylinderGeometry(0.11, 0.09, 0.2, 10).translate(q.X + 5.2, q.Y + 1.06, q.Z + 5.3), 0x9fd0f5); // tins, the bread, a kettle
      slab(0xf4f4f0, 0.02, 0.4, 0.3, q.X + 6.67, q.Y + 1.6, q.Z + 1.3); for (let n = 0; n < 9; n++) slab(0x1c1c22, 0.022, 0.03, 0.03, q.X + 6.66, q.Y + 1.66 + (n % 3) * 0.1, q.Z + 1.2 + Math.floor(n / 3) * 0.1);                                    // the calendar from the funeral home
      q.block(0xf4f4f0, 1.1, 0.74, 0.8, 3.4, 2.6); slab(0xd8342c, 1.2, 0.012, 0.9, q.X + 3.4, q.Y + 0.745, q.Z + 2.6); for (let n = 0; n < 12; n++) slab(0xf4f4f0, 0.1, 0.014, 0.1, q.X + 2.95 + (n % 4) * 0.3, q.Y + 0.746, q.Z + 2.3 + Math.floor(n / 4) * 0.3);          // gingham
      put(M.plain, new THREE.CylinderGeometry(0.07, 0.06, 0.07, 8).translate(q.X + 3.2, q.Y + 0.8, q.Z + 2.5), 0xf4f4f0); put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6).translate(q.X + 3.6, q.Y + 0.81, q.Z + 2.7), 0xf4f4f0); put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6).translate(q.X + 3.7, q.Y + 0.81, q.Z + 2.7), 0x23232b);
      for (const [cx, cz, h] of [[3.4, 3.4, Math.PI], [3.4, 1.8, 0]]) chairAt({ x: q.X + cx, z: q.Z + cz, h }, q.Y, 0x8a9a8a);
      collide(q.X + 6.2, q.Z + 3.3, 1, 4.7, 1); collide(q.X + 4.5, q.Z + 5.2, 2.7, 1, 1);
      // The living room: antimacassars, the Infant of Prague, a rocker, the radiator, drapes, the telephone she uses like a rifle.
      for (const sx of [-4, -3, -2]) slab(0xf4f4f0, 0.4, 0.3, 0.02, q.X + sx, q.Y + 0.8, q.Z - 3.74); slab(0xf4f4f0, 0.3, 0.3, 0.02, q.X - 5.6, q.Y + 0.56, q.Z - 0.5);
      slab(0xf4f4f0, 0.5, 0.012, 0.5, q.X - 3, q.Y + 1.0, q.Z + 0.9); post(0xd9c7a0, 0.08, 0.05, q.X - 3, q.Y + 1.01, q.Z + 0.9, 8); put(M.plain, new THREE.ConeGeometry(0.1, 0.3, 8).translate(q.X - 3, q.Y + 1.21, q.Z + 0.9), 0xd8342c); ball(0xf4d8c0, 0.05, q.X - 3, q.Y + 1.4, q.Z + 0.9); put(M.plain, new THREE.ConeGeometry(0.05, 0.07, 6).translate(q.X - 3, q.Y + 1.47, q.Z + 0.9), BRASS); // on the television
      slab(0x5a3320, 0.6, 0.08, 0.6, q.X - 5.4, q.Y + 0.42, q.Z + 1.6, M.wood, 1); slab(0x5a3320, 0.6, 0.7, 0.07, q.X - 5.68, q.Y + 0.42, q.Z + 1.6, M.wood, 1); for (const s of [-1, 1]) put(M.plain, new THREE.TorusGeometry(0.5, 0.025, 4, 12, 1.2).rotateY(Math.PI / 2).rotateX(-0.6).translate(q.X - 5.4, q.Y + 0.5, q.Z + 1.6 + s * 0.28), 0x5a3320); slab(0xc85cff, 0.5, 0.05, 0.5, q.X - 5.4, q.Y + 0.5, q.Z + 1.6); collide(q.X - 5.4, q.Z + 1.6, 0.8, 0.8, 1, true);
      for (let n = 0; n < 9; n++) slab(0xd8d2c8, 0.1, 0.7, 0.16, q.X - 3.4 + n * 0.12, q.Y + 0.08, q.Z - 5.58); slab(0xd8d2c8, 1.2, 0.04, 0.2, q.X - 2.9, q.Y + 0.78, q.Z - 5.58);                                                                          // the radiator under the window
      for (const s of [-1, 1]) slab(0x6a2f3a, 0.4, 2, 0.1, q.X - 2 + s * 1.4, q.Y + 0.8, q.Z - 5.62); slab(0x6a2f3a, 3.2, 0.3, 0.14, q.X - 2, q.Y + 2.75, q.Z - 5.6); slab(0xf4f4f0, 2.3, 1.4, 0.02, q.X - 2, q.Y + 1.1, q.Z - 5.66);                             // drapes and the nets behind them
      q.block(DARK, 0.5, 0.72, 0.5, -1.5, 5.3, M.wood, 1); slab(0xf4f4f0, 0.4, 0.012, 0.4, q.X - 1.5, q.Y + 0.72, q.Z + 5.3); slab(0x1c1c22, 0.24, 0.1, 0.2, q.X - 1.5, q.Y + 0.73, q.Z + 5.3); slab(0x1c1c22, 0.07, 0.05, 0.26, q.X - 1.5, q.Y + 0.83, q.Z + 5.3); slab(0xe9e2cf, 0.16, 0.012, 0.22, q.X - 1.5, q.Y + 0.735, q.Z + 5.05); // the telephone, and the numbers
      slab(BRASS, 0.06, 0.4, 0.03, q.X + 1.6, q.Y + 2.2, q.Z - 5.66); slab(BRASS, 0.24, 0.06, 0.03, q.X + 1.6, q.Y + 2.42, q.Z - 5.66);                                                                                                               // the crucifix over the table
      slab(BRASS, 0.7, 0.9, 0.03, q.X - 5.6, q.Y + 1.6, q.Z - 5.66); slab(0x8a8d96, 0.6, 0.8, 0.035, q.X - 5.6, q.Y + 1.65, q.Z - 5.66); slab(0x1c1c22, 0.3, 0.3, 0.04, q.X - 5.6, q.Y + 2.05, q.Z - 5.65);                                              // her husband, in a good frame
      put(M.plain, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16).rotateX(Math.PI / 2).translate(q.X + 0.3, q.Y + 2.5, q.Z - 5.66), 0xf1ece0); put(M.plain, new THREE.TorusGeometry(0.2, 0.02, 4, 18).translate(q.X + 0.3, q.Y + 2.5, q.Z - 5.64), DARK);
      put(M.plain, new THREE.CylinderGeometry(0.45, 0.3, 0.26, 12, 1, true).translate(q.X - 3, q.Y + 3.05, q.Z - 2.4), 0xe9d9a8); ball(0xfff2c0, 0.1, q.X - 3, q.Y + 3, q.Z - 2.4, M.glow); for (let n = 0; n < 12; n++) post(0xd9a520, 0.006, 0.1, q.X - 3 + Math.sin(n * 0.52) * 0.44, q.Y + 2.84, q.Z - 2.4 + Math.cos(n * 0.52) * 0.44, 3); // the fringed shade
      slab(0xd9c7a0, 1, 0.012, 0.6, q.X, q.Y + 0.005, q.Z + 5.2); for (let n = 0; n < 2; n++) slab(0xf4f4f0, 1.7, 0.012, 0.5, q.X - 0.4, q.Y + 0.006, q.Z + 3.6 - n * 1.8);                                                                           // plastic runners, so nobody walks on the carpet
      // The stairs, against the west wall.
      for (let n = 0; n < 7; n++) slab(0x5a3320, 1.1, 0.2, 0.32, q.X - 6.1, q.Y + n * 0.3, q.Z + 3 + n * 0.32, M.wood, 1); collide(q.X - 6.1, q.Z + 4.1, 1.1, 2.4, 2);
      for (let n = 0; n < 7; n++) post(0xf4f4f0, 0.02, 0.9, q.X - 5.52, q.Y + n * 0.3 + 0.2, q.Z + 3 + n * 0.32, 4); put(M.plain, new THREE.BoxGeometry(0.06, 0.06, 2.9).rotateX(-Math.atan2(2.1, 2.24)).translate(q.X - 5.52, q.Y + 2.1, q.Z + 4), DARK);
      slab(0x7a2f3a, 0.6, 0.012, 2.3, q.X - 6.1, q.Y + 0.21, q.Z + 3.1);
      q.lights.length = 0; q.light(-2.6, 3, -2.2, 0xffe2b8, 36, 13); q.light(4, 3, 2.8, 0xf4f6e8, 30, 11); q.light(2.5, 2.8, -3.4, 0xffd9a8, 18, 8);
      q.sofa = { x: q.X - 3, y: q.Y, z: q.Z - 3.3, h: 0 }; q.armchair = { x: q.X - 5.6, y: q.Y, z: q.Z - 0.9, h: Math.PI / 2 }; q.stove = { x: q.X + 6.2, z: q.Z + 2.2 }; q.phone = { x: q.X - 1.5, z: q.Z + 4.6 };

      // ----- Upstairs: her bedroom, the landing, and the room of a boy who is forty now -----
      const u = rooms.LIVIA_UP = room(13, 9, 3, { floor: M.wood, floorTint: 0x8a6a4a, floorScale: 1.5, wall: M.plain, wallTint: 0xe9dcc6, door: 0xe9dcc6, at: [q.X, q.Z - 24] });
      dress(u, 13, 9);
      u.block(0xe9dcc6, 0.2, 3, 5.6, 0.6, -1.4);                                                                                                                 // the wall between the two rooms; both open onto the landing
      // Her room: the iron bed, chenille, the dressing table, the wardrobe, a rosary on the post, him on the night table with a candle.
      u.block(0xf4f4f0, 1.6, 0.5, 2.1, -3.6, -2.9); slab(0xf7c8d4, 1.64, 0.1, 1.5, u.X - 3.6, u.Y + 0.5, u.Z - 2.6); slab(0xffffff, 1.2, 0.14, 0.4, u.X - 3.6, u.Y + 0.5, u.Z - 3.7);
      for (const s of [-1, 1]) { post(0x1c1c22, 0.03, 1.3, u.X - 3.6 + s * 0.8, u.Y, u.Z - 3.98, 6); ball(BRASS, 0.05, u.X - 3.6 + s * 0.8, u.Y + 1.33, u.Z - 3.98); post(0x1c1c22, 0.03, 0.8, u.X - 3.6 + s * 0.8, u.Y, u.Z - 1.84, 6); } for (let n = 0; n < 5; n++) post(0x1c1c22, 0.015, 0.7, u.X - 4.2 + n * 0.3, u.Y + 0.5, u.Z - 3.98, 4); slab(0x1c1c22, 1.6, 0.03, 0.03, u.X - 3.6, u.Y + 1.2, u.Z - 3.98);
      for (let n = 0; n < 9; n++) ball(0x3a2418, 0.02, u.X - 2.8 + Math.sin(n * 0.7) * 0.06, u.Y + 1.2 - n * 0.05, u.Z - 3.96); slab(BRASS, 0.03, 0.08, 0.01, u.X - 2.8, u.Y + 0.72, u.Z - 3.96);
      u.block(DARK, 0.5, 0.6, 0.45, -2.3, -3.8, M.wood, 1); slab(0xf4f4f0, 0.42, 0.01, 0.38, u.X - 2.3, u.Y + 0.6, u.Z - 3.8); slab(BRASS, 0.16, 0.22, 0.03, u.X - 2.4, u.Y + 0.61, u.Z - 3.9); post(0xd8342c, 0.035, 0.12, u.X - 2.15, u.Y + 0.61, u.Z - 3.75, 8); ball(0xffd060, 0.02, u.X - 2.15, u.Y + 0.76, u.Z - 3.75, M.glow);
      for (let n = 0; n < 3; n++) put(M.plain, new THREE.CylinderGeometry(0.025, 0.025, 0.07, 8).translate(u.X - 2.45 + n * 0.07, u.Y + 0.64, u.Z - 3.65), 0xff8a30); slab(0x1c1c22, 0.14, 0.1, 0.08, u.X - 2.2, u.Y + 0.61, u.Z - 3.95);                                  // her pills, the clock
      u.block(DARK, 1.2, 0.74, 0.45, -5.6, -0.6, M.wood, 1); put(M.plain, new THREE.CylinderGeometry(0.36, 0.36, 0.03, 18).rotateZ(Math.PI / 2).scale(1, 1.3, 1).translate(u.X - 6.16, u.Y + 1.4, u.Z - 0.6), 0xb9c8d8); for (let n = 0; n < 4; n++) put(M.plain, new THREE.CylinderGeometry(0.025, 0.03, 0.09, 6).translate(u.X - 5.9 + n * 0.14, u.Y + 0.79, u.Z - 0.55), [0xf7c8d4, 0xcfe8ff, 0xd9a520, 0xf4f4f0][n]); slab(0xf7c8d4, 0.3, 0.02, 0.2, u.X - 5.3, u.Y + 0.75, u.Z - 0.6);
      u.block(DARK, 1.8, 2.2, 0.6, -1, -3.9, M.wood, 2); slab(0x2a1810, 0.02, 2, 0.02, u.X - 1, u.Y + 0.1, u.Z - 3.59); for (const s of [-1, 1]) slab(BRASS, 0.03, 0.12, 0.03, u.X - 1 + s * 0.1, u.Y + 1.1, u.Z - 3.58);
      slab(0x8a5a44, 0.8, 0.26, 0.5, u.X - 1, u.Y + 2.2, u.Z - 3.9, M.wood, 1); slab(BRASS, 0.1, 0.04, 0.02, u.X - 1, u.Y + 2.3, u.Z - 3.64);                                                                                                                  // the suitcase, on top of it
      u.window(-6.22, -2.6, 1.6, 1.3, 1.9, Math.PI / 2, 0xffe8c8); for (const s of [-1, 1]) slab(0xf4f4f0, 0.05, 1.5, 0.5, u.X - 6.16, u.Y + 1.2, u.Z - 2.6 + s * 0.7);
      slab(0xb5686a, 2.2, 0.012, 1.3, u.X - 3.6, u.Y + 0.005, u.Z - 1.1); slab(BRASS, 0.5, 0.64, 0.03, u.X - 4.8, u.Y + 1.7, u.Z - 4.16); slab(0x9fb8d8, 0.42, 0.56, 0.035, u.X - 4.8, u.Y + 1.74, u.Z - 4.16);                                              // a rug; Our Lady
      // His room: the narrow bed, pennants, a shelf of models, the glove, a desk with a lamp, a box that says DO NOT THROW OUT.
      u.block(0x2c3a5a, 1, 0.42, 2, 5.6, -3); slab(0xf4f4f0, 0.8, 0.12, 0.4, u.X + 5.6, u.Y + 0.42, u.Z - 3.75); slab(0x8a1c1c, 1.02, 0.06, 1.3, u.X + 5.6, u.Y + 0.42, u.Z - 2.6);
      for (const [k, hex] of [0xd8342c, 0x2f56c8, 0xf2c230].entries()) put(M.plain, new THREE.ConeGeometry(0.16, 0.7, 3).rotateZ(Math.PI / 2).scale(1, 1, 0.05).translate(u.X + 3.4 + k * 1, u.Y + 2 + (k % 2) * 0.3, u.Z - 4.16), hex);
      slab(DARK, 1.6, 0.04, 0.26, u.X + 2.2, u.Y + 1.6, u.Z - 4.05, M.wood, 1); for (let n = 0; n < 3; n++) { slab([0x8a8d96, 0x2f5a3f, 0xd9c7a0][n], 0.34, 0.07, 0.07, u.X + 1.7 + n * 0.5, u.Y + 1.68, u.Z - 4.05); slab([0x8a8d96, 0x2f5a3f, 0xd9c7a0][n], 0.07, 0.02, 0.36, u.X + 1.7 + n * 0.5, u.Y + 1.7, u.Z - 4.05); } // aeroplanes he glued himself
      u.block(DARK, 1.3, 0.72, 0.6, 2.2, -3.9, M.wood, 1); post(0x1c1c22, 0.015, 0.36, u.X + 2.6, u.Y + 0.72, u.Z - 3.95, 5); put(M.glow, new THREE.ConeGeometry(0.12, 0.14, 8, 1, true).translate(u.X + 2.6, u.Y + 1.12, u.Z - 3.95), 0xffe2a6); slab(0x8a5a2a, 0.26, 0.1, 0.24, u.X + 1.9, u.Y + 0.72, u.Z - 3.9); ball(0xf4f4f0, 0.045, u.X + 1.9, u.Y + 0.84, u.Z - 3.9); // the glove, the ball
      slab(0xc79a6a, 0.6, 0.4, 0.5, u.X + 1.4, u.Y, u.Z - 1.2); slab(0xf4f4f0, 0.4, 0.14, 0.01, u.X + 1.4, u.Y + 0.14, u.Z - 0.94); put(M.plain, new THREE.CylinderGeometry(0.02, 0.03, 0.85, 6).rotateZ(0.2).translate(u.X + 1.1, u.Y + 0.43, u.Z - 1.9), 0xd9b48a);                            // the box; a bat in the corner
      u.window(6.22, -2.6, 1.4, 1.2, 1.9, -Math.PI / 2, 0xffe8c8); slab(0x2c3a5a, 1.8, 0.012, 1.2, u.X + 4, u.Y + 0.005, u.Z - 1.4);
      // The landing: a runner, the bathroom door, the stairhead, the telephone extension, more of the dead.
      slab(0x7a2f3a, 11, 0.012, 1.1, u.X, u.Y + 0.006, u.Z + 2.6); slab(0xf4f4f0, 0.9, 2.1, 0.05, u.X + 3.2, u.Y, u.Z + 4.16); slab(BRASS, 0.05, 0.05, 0.05, u.X + 2.9, u.Y + 1.05, u.Z + 4.12);
      for (let n = 0; n < 5; n++) { slab(DARK, 0.4, 0.5, 0.03, u.X - 4 + n * 1.2, u.Y + 1.7, u.Z + 4.16); slab(0xb9b3ac, 0.32, 0.42, 0.035, u.X - 4 + n * 1.2, u.Y + 1.74, u.Z + 4.16); }
      for (const lx of [-3.6, 4]) { put(M.plain, new THREE.CylinderGeometry(0.3, 0.2, 0.2, 10, 1, true).translate(u.X + lx, u.Y + 2.8, u.Z - 1.6), 0xe9d9a8); ball(0xfff2c0, 0.08, u.X + lx, u.Y + 2.76, u.Z - 1.6, M.glow); }
      u.light(-3.6, 2.6, -2, 0xffe2c8, 30, 10); u.light(4, 2.6, -2, 0xfff0d0, 26, 10); u.light(0, 2.6, 2.6, 0xffe8c8, 20, 11);
      u.suitcase = { x: u.X - 1, z: u.Z - 2.9 }; u.bed = { x: u.X - 3.6, y: u.Y + 0.55, z: u.Z - 2.9 }; u.oldRoom = { x: u.X + 3.6, z: u.Z - 1.4 };
      (places.stairs ??= []).push({ a: { x: q.X - 5, z: q.Z + 2.8, h: Math.PI / 2 }, b: { x: u.X - 5.4, z: u.Z + 2.6, h: Math.PI / 2 }, up: 'Go upstairs', down: 'Go downstairs' });
    }
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
    q.clerk = q.person('priest', 0.8, -8.6, Math.PI); q.clerk.group.position.y = q.Y + 0.4; q.till = q.at(0.8, -6.6); // he stands on the altar step, not in it
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
    // The floor: cream and green-black marble laid on the diagonal, polished, inside a border of dark wood and a line of brass.
    const marble = texture(256, 256, (c, w) => {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const dark = (i + j) % 2;
        c.fillStyle = dark ? '#1f2a26' : '#efe6d2'; c.fillRect(i * w / 2, j * w / 2, w / 2, w / 2);
        c.strokeStyle = dark ? 'rgba(170,200,180,.28)' : 'rgba(120,96,70,.3)'; c.lineWidth = 1.2;
        for (let k = 0; k < 7; k++) { c.beginPath(); let x = i * w / 2 + rand() * w / 2, y = j * w / 2; c.moveTo(x, y); for (let t = 0; t < 5; t++) { x += (rand() - 0.5) * 34; y += w / 10; c.lineTo(Math.max(i * w / 2, Math.min((i + 1) * w / 2, x)), y); } c.stroke(); }
      }
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.strokeRect(0, 0, w / 2, w / 2); c.strokeRect(w / 2, w / 2, w / 2, w / 2);
    });
    marble.repeat.set(10, 7.6); marble.rotation = Math.PI / 4; marble.center.set(0.5, 0.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16.6, 12.6).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: marble, shininess: 90, specular: 0x6a6a6a }));
    floor.position.set(q.X, q.Y + 0.006, q.Z); scene.add(floor);
    for (const sgn of [-1, 1]) { slab(0x2b1a12, 17.4, 0.012, 0.42, q.X, q.Y, q.Z + sgn * 6.5, M.wood, 2); slab(0x2b1a12, 0.42, 0.012, 13.4, q.X + sgn * 8.5, q.Y, q.Z, M.wood, 2); slab(0xd9a520, 16.6, 0.016, 0.05, q.X, q.Y, q.Z + sgn * 6.28); slab(0xd9a520, 0.05, 0.016, 12.6, q.X + sgn * 8.28, q.Y, q.Z); }
    // A table laid for dinner: linen to the floor, a second cloth across it, four places, two glasses each, a candle, a flower; four upholstered chairs.
    const fineTable = (x, z) => {
      const tx = q.X + x, tz = q.Z + z, top = q.Y + 0.76;
      put(M.plain, new THREE.CylinderGeometry(0.62, 0.7, 0.76, 20).translate(tx, q.Y + 0.38, tz), 0xf6f1e6);
      put(M.plain, new THREE.BoxGeometry(0.9, 0.012, 0.9).rotateY(Math.PI / 4).translate(tx, top + 0.006, tz), 0x7a1c2a);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, sx = Math.sin(a), sz = Math.cos(a), px = tx + sx * 0.4, pz = tz + sz * 0.4;
        put(M.plain, new THREE.CylinderGeometry(0.13, 0.11, 0.012, 16).translate(px, top + 0.02, pz), 0xffffff); put(M.plain, new THREE.CylinderGeometry(0.09, 0.09, 0.006, 14).translate(px, top + 0.03, pz), 0xd9a520);
        put(M.plain, new THREE.CylinderGeometry(0.035, 0.012, 0.13, 8).translate(px + sz * 0.17, top + 0.08, pz - sx * 0.17), 0xe9f4fa); put(M.plain, new THREE.CylinderGeometry(0.028, 0.012, 0.1, 8).translate(px + sz * 0.24, top + 0.065, pz - sx * 0.24), 0xe9f4fa);
        put(M.plain, new THREE.BoxGeometry(0.014, 0.004, 0.16).rotateY(a).translate(px - sz * 0.17, top + 0.016, pz + sx * 0.17), 0xc9cbd2);
        put(M.plain, new THREE.BoxGeometry(0.11, 0.05, 0.11).translate(px - sz * 0.02, top + 0.06, pz + sx * 0.02), 0xf6f1e6);                                  // a folded napkin on the plate
        chairAt({ x: tx + sx * 0.98, z: tz + sz * 0.98, h: a + Math.PI }, q.Y, 0x6a1c2a);
      }
      post(0xd9a520, 0.012, 0.14, tx - 0.07, top + 0.012, tz, 6); put(M.glow, new THREE.ConeGeometry(0.018, 0.05, 6).translate(tx - 0.07, top + 0.18, tz), 0xffd27a);    // the candle
      post(0xe9f4fa, 0.025, 0.1, tx + 0.08, top + 0.012, tz + 0.04, 8); ball(0xc8312a, 0.045, tx + 0.08, top + 0.15, tz + 0.04);                                     // one rose
      collide(tx, tz, 1.3, 1.3, 1);
    };
    for (const [x, z] of [[-5, -2], [-1, -2], [-5, 2], [-1, 2], [3, 1], [-5, 5], [-1, 5]]) fineTable(x, z);
    // Curtains at the windows, a mirror and glass shelves behind the bar, a chandelier, a trolley of desserts, an espresso machine.
    for (const x of [-5, 0]) for (const sgn of [-1, 1]) slab(0x6a1c2a, 0.5, 2.9, 0.12, q.X + x + sgn * 2.2, q.Y + 0.5, q.Z + 6.6); for (const x of [-5, 0]) slab(0xd9a520, 5, 0.1, 0.14, q.X + x, q.Y + 3.4, q.Z + 6.6);
    q.glowPanel(0xcfe0e8, 6.4, 1.3, 4.5, -6.42, 2.3); for (const y of [1.75, 2.35]) slab(0xe9f4fa, 6.4, 0.02, 0.22, q.X + 4.5, q.Y + y + 0.25, q.Z - 6.32);
    put(M.plain, new THREE.TorusGeometry(0.9, 0.03, 6, 24).rotateX(Math.PI / 2).translate(q.X - 3, q.Y + 3.0, q.Z + 1.5), 0xd9a520); post(0xd9a520, 0.015, 0.7, q.X - 3, q.Y + 3.05, q.Z + 1.5, 4);
    for (let k = 0; k < 8; k++) ball(0xfff0c8, 0.07, q.X - 3 + Math.sin(k * Math.PI / 4) * 0.9, q.Y + 3.08, q.Z + 1.5 + Math.cos(k * Math.PI / 4) * 0.9, M.glow);
    q.block(0x3a2418, 0.9, 0.8, 0.5, 7.4, 1.2, M.wood, 1); slab(0xd9a520, 0.95, 0.03, 0.55, q.X + 7.4, q.Y + 0.8, q.Z + 1.2); for (let k = 0; k < 4; k++) { put(M.plain, new THREE.CylinderGeometry(0.12, 0.12, 0.07, 12).translate(q.X + 7.1 + (k % 2) * 0.5, q.Y + 0.87, q.Z + 1.05 + Math.floor(k / 2) * 0.28), [0xf6e7b4, 0x6a3a22, 0xf7a8c4, 0xfff6e0][k]); }
    q.block(0xc9cbd2, 0.7, 0.5, 0.45, 1.8, -5.2, M.plain, 0, 1.05); for (const dx of [-0.15, 0.15]) post(0x16161c, 0.03, 0.12, q.X + 1.8 + dx, q.Y + 1.2, q.Z - 4.95, 6);
    // The kitchen is through a swing door at the end of the bar.
    slab(0xc9cbd2, 0.95, 2.3, 0.08, q.X + 0.45, q.Y, q.Z - 6.8); put(M.plain, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14).rotateX(Math.PI / 2).translate(q.X + 0.45, q.Y + 1.6, q.Z - 6.75), 0x9fd0f5);
    sign('KITCHEN', q.X + 0.45, q.Y + 2.6, q.Z - 6.84, 0, { w: 1.1, h: 0.28, color: '#f6e7b4', bg: '#3a1414', size: 0.8, glow: false });
    counter(q, 4.5, -5.2, 7, 0x3a2418, 0); q.block(0x3a2418, 7, 2, 0.3, 4.5, -6.6, M.wood, 2, 1); for (let n = 0; n < 12; n++) post(BOTTLES[n % 6], 0.05, 0.35, q.X + 1.4 + n * 0.55, q.Y + 1.5 + (n % 2) * 0.7, q.Z - 6.4, 6);
    for (const x of [-6, -1.5]) q.glowPanel(0x9fd0f5, 3.6, 1.6, x, -6.84, 2.2); // murals of the bay, lit
    for (const x of [-6, -1.5]) slab(0x8a5a44, 3.8, 1.8, 0.06, q.X + x, q.Y + 1.3, q.Z - 6.86);
    q.block(0x55525a, 1.4, 2.6, 0.1, 7.5, -6.7); q.kitchen = q.at(7.5, -5.4);
    for (const [x, z] of [[-7.5, -5], [7.8, 3]]) { post(0xb9a58a, 0.3, 0.8, q.X + x, q.Y, q.Z + z, 10); put(M.plain, new THREE.ConeGeometry(0.6, 2, 7).translate(q.X + x, q.Y + 1.6, q.Z + z), 0x2c5a34); }
    sign('Vesuvio', q.X + 4.5, q.Y + 3.38, q.Z - 6.84, 0, { w: 3.2, h: 0.7, color: '#ffe066', bg: '#3a1414', font: '"Mr Dafoe", cursive', size: 0.86 });
    for (const x of [-5, 0]) q.window(x, 6.72, 4, 2, 1.9, Math.PI);
    q.light(-3, 3.3, 0, 0xffd9a8, 90, 18); q.light(4.5, 3.3, -4, 0xffb060, 50, 14);
    q.clerk = q.person('artie', 4.5, -5.9, 0); q.clerk.set('talk'); q.till = q.at(4.5, -4.2);
    // Dressing: dark panelling to chair height, pictures of the old country, sconces, beams, a lamp over every table, a runner from the door to the bar.
    for (const sx of [-1, 1]) { slab(0x4a2a1c, 0.08, 1.05, 13.4, q.X + sx * 8.66, q.Y, q.Z, M.wood, 2); slab(0xd9a520, 0.1, 0.05, 13.4, q.X + sx * 8.65, q.Y + 1.05, q.Z); }
    slab(0x4a2a1c, 17.4, 1.05, 0.08, q.X, q.Y, q.Z + 6.66, M.wood, 2); slab(0xd9a520, 17.4, 0.05, 0.1, q.X, q.Y + 1.05, q.Z + 6.65);
    for (const [n, z] of [-4.6, -1.6, 1.4, 4.4].entries()) for (const sx of [-1, 1]) {
      if (sx > 0 && n < 2) continue; // the wine is on that stretch of wall
      slab(0x8a5a44, 0.06, 1.15, 1.6, q.X + sx * 8.62, q.Y + 1.55, q.Z + z, M.wood, 1);
      q.glowPanel([0x7fb6c9, 0xd9b27a, 0x9cc08a, 0xe0a07a][(n + (sx > 0 ? 2 : 0)) % 4], 1.4, 0.95, sx * 8.57, z, 2.12, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
      ball(0xffd9a8, 0.11, q.X + sx * 8.5, q.Y + 2.5, q.Z + z + 1.5, M.glow); slab(0xd9a520, 0.1, 0.3, 0.1, q.X + sx * 8.6, q.Y + 2.2, q.Z + z + 1.5);
    }
    for (const z of [-4, 0, 4]) slab(0x3a2418, 17.4, 0.2, 0.28, q.X, q.Y + 3.5, q.Z + z, M.wood, 2);
    for (const [x, z] of [[-5, -2], [-1, -2], [-5, 2], [-1, 2], [3, 1], [-5, 5], [-1, 5]]) { post(0x1c1c22, 0.012, 1, q.X + x, q.Y + 2.5, q.Z + z, 4); put(M.glow, new THREE.ConeGeometry(0.24, 0.26, 10, 1, true).translate(q.X + x, q.Y + 2.42, q.Z + z), 0xffc27a); }
    slab(0x8a1c2a, 2, 0.02, 10.4, q.X + 4, q.Y, q.Z + 1.4); for (const sx of [-1, 1]) slab(0xd9a520, 0.08, 0.025, 10.4, q.X + 4 + sx * 0.92, q.Y, q.Z + 1.4);
    q.block(0x3a2418, 0.7, 1.15, 0.5, 2.3, 5.4, M.wood, 1); slab(0xf4f4f0, 0.5, 0.03, 0.36, q.X + 2.3, q.Y + 1.16, q.Z + 5.4);                 // the host's stand, the book open on it
    q.block(0x3a2418, 0.45, 2.3, 4.6, 8.4, -3.2, M.wood, 2); for (let n = 0; n < 24; n++) put(M.plain, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6).rotateZ(Math.PI / 2).translate(q.X + 8.12, q.Y + 0.45 + (n % 4) * 0.5, q.Z - 5.2 + Math.floor(n / 4) * 0.8), BOTTLES[n % 6]); // the wine wall
    for (const [k, hex] of [0x2f7d46, 0xf4f4f0, 0xc8312a].entries()) slab(hex, 0.5, 0.9, 0.04, q.X - 8 + k * 0.5, q.Y + 2.3, q.Z + 6.62);
    q.person(pick(PED_ROOM_LOOKS), -5.9, -2, Math.PI / 2, 'sit');
    q.person(pick(PED_ROOM_LOOKS), -0.1, 2, -Math.PI / 2, 'sit');
  }
  { // Vesuvio's kitchen, behind the dining room: a range under a hood, a brick oven, a steel table in the middle, the pass, the dish pit, a walk-in
    const d0 = rooms.VESUVIO, q = rooms.VKITCHEN = room(13, 8, 3.4, { floor: M.paver, floorTint: 0xe9e4dc, floorScale: 1, wallTint: 0xf4f4f0, ceil: 0xf6f6f2, door: 0xc9cbd2, doorX: -4, at: [d0.X + 4, d0.Z - 12.5] });
    for (let k = 0; k < 13; k++) for (let j = 0; j < 8; j++) if ((k + j) % 2) slab(0x23232b, 1, 0.012, 1, q.X - 6 + k, q.Y, q.Z - 3.5 + j);                       // a chequered floor
    { // White tile to head height on all four walls, a steel rail along the top of it
      const tile = texture(64, 64, (c, w) => { c.fillStyle = '#f4f5f2'; c.fillRect(0, 0, w, w); c.strokeStyle = '#b9bdbd'; c.lineWidth = 2; c.strokeRect(0, 0, w, w); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(5, 5, w - 26, 5); });
      const face = (w, x, z, turn) => { const t = tile.clone(); t.needsUpdate = true; t.repeat.set(w / 0.3, 7); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.1), new THREE.MeshPhongMaterial({ map: t, shininess: 60, specular: 0x555555 })); m.rotation.y = turn; m.position.set(q.X + x, q.Y + 1.05, q.Z + z); scene.add(m); };
      face(12.4, 0, -3.69, 0); face(12.4, 0, 3.69, Math.PI); face(7.4, -6.19, 0, Math.PI / 2); face(7.4, 6.19, 0, -Math.PI / 2);
      for (const sgn of [-1, 1]) { slab(0xc9cbd2, 12.4, 0.06, 0.04, q.X, q.Y + 2.1, q.Z + sgn * 3.68); slab(0xc9cbd2, 0.04, 0.06, 7.4, q.X + sgn * 6.18, q.Y + 2.1, q.Z); }
    }
    // The range: six burners, pots on three of them, a hood with a light in it.
    q.block(0xb9bcc4, 6, 0.9, 0.85, 1.5, -3.3, M.plain, 0); slab(0x16161c, 5.8, 0.03, 0.7, q.X + 1.5, q.Y + 0.9, q.Z - 3.3);
    for (let k = 0; k < 6; k++) { put(M.plain, new THREE.TorusGeometry(0.16, 0.02, 5, 14).rotateX(Math.PI / 2).translate(q.X - 1 + k, q.Y + 0.95, q.Z - 3.3), 0x3a3a44); if (k % 2 === 0) put(M.glow, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 10).translate(q.X - 1 + k, q.Y + 0.94, q.Z - 3.3), 0x4f8cff); }
    for (const [k, r, h, hex] of [[0, 0.26, 0.34, 0xc9cbd2], [2, 0.2, 0.2, 0x8a5a44], [4, 0.3, 0.42, 0xc9cbd2]]) { put(M.plain, new THREE.CylinderGeometry(r, r, h, 14).translate(q.X - 1 + k, q.Y + 0.96 + h / 2, q.Z - 3.3), hex); put(M.plain, new THREE.CylinderGeometry(r - 0.02, r - 0.02, 0.02, 14).translate(q.X - 1 + k, q.Y + 0.96 + h, q.Z - 3.3), k === 2 ? 0x8a1c1c : 0xe0a12c); }
    put(M.plain, new THREE.BoxGeometry(6.2, 0.7, 1.1).translate(q.X + 1.5, q.Y + 2.5, q.Z - 3.2), 0xb9bcc4); slab(0xffe8c0, 5.6, 0.04, 0.3, q.X + 1.5, q.Y + 2.13, q.Z - 3.2, M.glow);
    for (let k = 0; k < 7; k++) { post(0x8a8d96, 0.012, 0.3, q.X - 1.2 + k * 0.85, q.Y + 1.75, q.Z - 2.75, 4); put(M.plain, new THREE.CylinderGeometry(0.13 + (k % 3) * 0.03, 0.11, 0.07, 10).translate(q.X - 1.2 + k * 0.85, q.Y + 1.7, q.Z - 2.75), k % 2 ? 0x3a3a44 : 0xb5651d); } // pans on a rail
    // The oven: brick, an arch, a fire at the back of it, a peel leaning beside.
    q.block(0xb5523b, 2.4, 2.3, 1.5, -4.9, -3, M.brick, 1.2); put(M.glow, new THREE.CircleGeometry(0.55, 14, 0, Math.PI).translate(q.X - 4.9, q.Y + 1.1, q.Z - 2.24), 0xff8a30); slab(0x2b1a12, 1.2, 0.08, 0.2, q.X - 4.9, q.Y + 1.05, q.Z - 2.2);
    put(M.plain, new THREE.BoxGeometry(0.04, 1.9, 0.04).rotateZ(0.12).translate(q.X - 3.4, q.Y + 0.95, q.Z - 2.9), 0xc79a6a); slab(0xc79a6a, 0.4, 0.03, 0.5, q.X - 3.52, q.Y + 1.86, q.Z - 2.9);
    // The steel table: boards, a knife block, tomatoes, basil, a ball of dough under a cloth, a stack of plates.
    q.block(0xb9bcc4, 4.4, 0.9, 1.1, 0.4, 0.2, M.plain, 0); slab(0xc79a6a, 0.9, 0.04, 0.6, q.X - 0.9, q.Y + 0.9, q.Z + 0.2); slab(0xc79a6a, 0.7, 0.04, 0.5, q.X + 1.2, q.Y + 0.9, q.Z + 0.1);
    for (let k = 0; k < 5; k++) ball(0xc8312a, 0.07, q.X - 1.15 + k * 0.13, q.Y + 1.01, q.Z + 0.12 + (k % 2) * 0.1); for (let k = 0; k < 3; k++) ball(0x2f7d46, 0.06, q.X + 1.05 + k * 0.12, q.Y + 0.99, q.Z + 0.02);
    put(M.plain, new THREE.SphereGeometry(0.2, 10, 6).scale(1, 0.6, 1).translate(q.X + 0.1, q.Y + 1.0, q.Z + 0.3), 0xf6e7b4); q.block(0x3a2418, 0.2, 0.26, 0.14, 2.2, 0.5, M.wood, 1, 0.9);
    for (let k = 0; k < 8; k++) put(M.plain, new THREE.CylinderGeometry(0.14, 0.12, 0.018, 14).translate(q.X + 2.2, q.Y + 0.91 + k * 0.02, q.Z - 0.1), 0xffffff);
    // The pass, on the dining-room side: plates waiting under two heat lamps. The dish pit. The walk-in.
    q.block(0xb9bcc4, 3.4, 1.05, 0.6, 3.2, 3.3, M.plain, 0); for (let k = 0; k < 3; k++) { put(M.plain, new THREE.CylinderGeometry(0.15, 0.13, 0.02, 14).translate(q.X + 2.2 + k, q.Y + 1.07, q.Z + 3.3), 0xffffff); ball([0xc8312a, 0xe0a12c, 0x2f7d46][k], 0.07, q.X + 2.2 + k, q.Y + 1.13, q.Z + 3.3); }
    for (const dx of [2.6, 3.8]) { post(0x3a3a44, 0.015, 0.8, q.X + dx, q.Y + 2.5, q.Z + 3.3, 4); put(M.glow, new THREE.ConeGeometry(0.16, 0.2, 10, 1, true).translate(q.X + dx, q.Y + 2.4, q.Z + 3.3), 0xff9a50); }
    q.block(0xb9bcc4, 2.2, 0.9, 0.8, -2, 3.2, M.plain, 0); slab(0x4f8cb8, 0.9, 0.02, 0.5, q.X - 2.4, q.Y + 0.88, q.Z + 3.2, M.glow); post(0xc9cbd2, 0.02, 0.4, q.X - 2.4, q.Y + 0.9, q.Z + 3.5, 5);
    for (let k = 0; k < 5; k++) put(M.plain, new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12).rotateZ(0.9).translate(q.X - 1.5 + k * 0.1, q.Y + 1.05, q.Z + 3.2), 0xffffff);
    slab(0xb9bcc4, 0.08, 2.3, 1.3, q.X + 6.3, q.Y, q.Z - 1); slab(0x8a8d96, 0.06, 0.4, 0.06, q.X + 6.24, q.Y + 1.1, q.Z - 0.55); sign('WALK-IN', q.X + 6.3, q.Y + 2.6, q.Z - 1, -Math.PI / 2, { w: 1.1, h: 0.26, color: '#1c2740', bg: '#c9cbd2', size: 0.8, glow: false });
    for (let k = 0; k < 4; k++) { slab(0xd9c7a0, 0.5, 0.36, 0.4, q.X + 5.6, q.Y + (k % 2) * 0.37, q.Z + 1.2 + Math.floor(k / 2) * 0.5); } post(0x2f5a3f, 0.05, 0.3, q.X + 5.6, q.Y + 0.74, q.Z + 1.3, 6);
    q.light(1.5, 3, -1.5, 0xf4f8ff, 120, 20); q.light(-4.6, 1.6, -1.6, 0xff8a30, 26, 8);
    q.person({ shirt: 0xf4f4f4, sleeves: 'long', tucked: true, pants: 0x55525a, hair: 0x2b1b12, hairMesh: 'buzzed', hat: 'cap', hatColor: 0xf4f4f4, bulk: 1.1 }, 0.4, -2.3, Math.PI);
    q.person({ shirt: 0xf4f4f4, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', dark: true, bulk: 0.95 }, -1.6, 2.4, 0);
    // Through the swing door, either way.
    (places.stairs ??= []).push({ a: { x: d0.X + 0.45, z: d0.Z - 5.9, h: 0 }, b: { x: q.X - 4, z: q.Z + 2.6, h: Math.PI }, up: 'Go through to the kitchen', down: 'Back to the dining room' });
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
  { // F-Note Records: reception under the gold records, a vocal booth behind glass with the board in front of it, and the door through to Hesh
    const q = rooms.FNOTE = room(14, 10, 3.6, { floor: M.gravel, floorTint: 0x4a3a5a, wall: M.plain, wallTint: 0x3a2e4a, ceil: 0x16161c });
    const WALNUT = 0x4a2c1c, GOLD = 0xd9a520, TEAL = 0x49e0d0, INK = 0x16161c, OX = 0x5a1a1a;
    const lay = (tex, w, d, x, z, y = 0.004, shiny = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shiny ? new THREE.MeshPhongMaterial({ map: tex, shininess: shiny, specular: 0x444444 }) : new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, y, z); scene.add(m); return m; };
    const pane = (w, h, x, y, z, turn) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhongMaterial({ color: 0x9fd0f5, transparent: true, opacity: 0.2, shininess: 160, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false })); m.rotation.y = turn; m.position.set(x, y, z); scene.add(m); };
    // A gold (or platinum) record in a frame, with its plaque and a light over it. `turn` is the way it faces.
    const award = (x, y, z, turn, hex = GOLD) => {
      const g0 = new THREE.BoxGeometry(0.7, 0.9, 0.04), g1 = new THREE.BoxGeometry(0.58, 0.78, 0.045), d0 = new THREE.CylinderGeometry(0.23, 0.23, 0.05, 22).rotateX(Math.PI / 2).translate(0, 0.1, 0), d1 = new THREE.CylinderGeometry(0.07, 0.07, 0.055, 12).rotateX(Math.PI / 2).translate(0, 0.1, 0), pl = new THREE.BoxGeometry(0.3, 0.1, 0.05).translate(0, -0.26, 0), lt = new THREE.BoxGeometry(0.4, 0.03, 0.1).translate(0, 0.52, 0.07);
      for (const [geo, c, m] of [[g0, INK], [g1, 0xf1ece0], [d0, hex], [d1, TEAL], [pl, GOLD], [lt, 0xfff2c0, M.glow]]) put(m || M.plain, geo.rotateY(turn).translate(x, y, z), c);
    };
    const carpet = texture(128, 128, (c, w) => { c.fillStyle = '#3f2e55'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(217,165,32,.28)'; c.lineWidth = 1.5; for (let k = -1; k < 3; k++) { c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64 + 64, 64); c.lineTo(k * 64, 128); c.moveTo(k * 64 + 64, 0); c.lineTo(k * 64, 64); c.lineTo(k * 64 + 64, 128); c.stroke(); } c.fillStyle = 'rgba(73,224,208,.35)'; for (const [x, y] of [[0, 0], [64, 64], [0, 128], [128, 0], [128, 128]]) c.fillRect(x - 2, y - 2, 4, 4); });
    carpet.repeat.set(9, 6.4); lay(carpet, 13.4, 9.4, q.X, q.Z, q.Y + 0.004);
    for (const s of [-1, 1]) { slab(WALNUT, 13.4, 1, 0.05, q.X, q.Y, q.Z + s * 4.68, M.wood, 2); slab(WALNUT, 0.05, 1, 9.4, q.X + s * 6.68, q.Y, q.Z, M.wood, 2); slab(GOLD, 13.4, 0.03, 0.06, q.X, q.Y + 1, q.Z + s * 4.68); slab(GOLD, 0.06, 0.03, 9.4, q.X + s * 6.68, q.Y + 1, q.Z); } // a walnut dado and a line of brass
    // Reception: the walnut wall with the name on it, the desk, and what is on the desk.
    slab(WALNUT, 6.6, 3.5, 0.06, q.X + 0.1, q.Y, q.Z - 4.83, M.wood, 2); for (let k = 0; k < 6; k++) slab(GOLD, 0.02, 3.5, 0.07, q.X - 3.2 + k * 1.32, q.Y, q.Z - 4.83);
    sign('F-Note Records', q.X + 0.1, q.Y + 2.75, q.Z - 4.78, 0, { w: 4.6, h: 1, color: '#49e0d0', bg: '#2a1810', font: '"Mr Dafoe", cursive', size: 0.8 });
    counter(q, 0, -2.6, 5, INK, 0); slab(TEAL, 5.2, 0.06, 0.1, q.X, q.Y + 1.0, q.Z - 2.15, M.glow); slab(GOLD, 5, 0.03, 0.03, q.X, q.Y + 0.2, q.Z - 2.19);
    slab(0x23232b, 0.5, 0.36, 0.05, q.X - 1.2, q.Y + 1.2, q.Z - 2.8); slab(0x9fd0f5, 0.44, 0.3, 0.02, q.X - 1.2, q.Y + 1.23, q.Z - 2.83, M.glow); slab(0x23232b, 0.2, 0.08, 0.14, q.X - 1.2, q.Y + 1.13, q.Z - 2.8);
    slab(0x8a1c1c, 0.24, 0.08, 0.18, q.X + 0.5, q.Y + 1.13, q.Z - 2.7); slab(0x8a1c1c, 0.06, 0.05, 0.22, q.X + 0.5, q.Y + 1.21, q.Z - 2.7);                    // the telephone
    post(0xf4f4f0, 0.06, 0.2, q.X + 1.9, q.Y + 1.13, q.Z - 2.7, 8); for (const [dx, hex] of [[-0.05, 0xd8342c], [0.04, 0xffe066], [0, 0xff8ad8]]) ball(hex, 0.05, q.X + 1.9 + dx, q.Y + 1.42 + Math.abs(dx), q.Z - 2.7); // flowers
    for (let n = 0; n < 6; n++) slab([0xd8342c, 0xffe066, TEAL, 0xf4f4f0, 0x8a5cff, 0xff8a5c][n], 0.11, 0.02, 0.07, q.X - 0.3, q.Y + 1.13 + n * 0.021, q.Z - 2.9);            // demo tapes, unplayed
    slab(GOLD, 0.5, 0.09, 0.02, q.X, q.Y + 1.13, q.Z - 2.3);                                                                                       // RECEPTION, in brass
    for (const px of [-1.6, 0, 1.6]) { post(INK, 0.008, 1, q.X + px, q.Y + 2.5, q.Z - 2.6, 4); put(M.glow, new THREE.ConeGeometry(0.16, 0.2, 10, 1, true).translate(q.X + px, q.Y + 2.4, q.Z - 2.6), 0xffe2a6); }
    // The door through to the office, on the north wall, and the name on it.
    slab(0x2a1810, 1.3, 2.6, 0.06, q.X - 5.4, q.Y, q.Z - 4.84); slab(WALNUT, 1.1, 2.4, 0.08, q.X - 5.4, q.Y, q.Z - 4.83, M.wood, 1); slab(GOLD, 0.06, 0.06, 0.08, q.X - 4.98, q.Y + 1.1, q.Z - 4.8);
    sign(['H. RABKIN', 'PRIVATE'], q.X - 5.4, q.Y + 1.75, q.Z - 4.77, 0, { w: 0.7, h: 0.3, color: '#2a1810', bg: '#d9a520', size: 0.7, glow: false });
    // The booth: glass on two sides, foam on the walls, a microphone, somebody singing; RECORDING over the glass.
    for (const [w, h, d, x, z] of [[3.6, 0.12, 0.12, 4.95, -2.7], [0.12, 0.12, 2.1, 3.2, -3.7]]) { slab(INK, w, h, d, q.X + x, q.Y + 2.5, q.Z + z); slab(INK, w, 0.5, d, q.X + x, q.Y, q.Z + z); }
    for (const [x, z] of [[3.2, -2.7], [6.65, -2.7], [3.2, -4.65]]) post(INK, 0.06, 2.6, q.X + x, q.Y, q.Z + z, 4);
    pane(3.4, 2, q.X + 4.95, q.Y + 1.5, q.Z - 2.7, 0); pane(2, 2, q.X + 3.2, q.Y + 1.5, q.Z - 3.7, Math.PI / 2);
    slab(INK, 3.6, 1, 0.12, q.X + 4.95, q.Y + 2.6, q.Z - 2.7); slab(INK, 0.12, 1, 2.1, q.X + 3.2, q.Y + 2.6, q.Z - 3.7);
    slab(0x23232b, 3.4, 3.4, 0.05, q.X + 4.95, q.Y, q.Z - 4.8); for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) put(M.plain, new THREE.ConeGeometry(0.2, 0.1, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).translate(q.X + 3.5 + i * 0.48, q.Y + 0.7 + j * 0.5, q.Z - 4.72), (i + j) % 2 ? 0x2e2e38 : 0x3a3a46); // foam
    post(0x8a8d96, 0.015, 1.45, q.X + 4.9, q.Y, q.Z - 3.5, 5); post(0x8a8d96, 0.14, 0.02, q.X + 4.9, q.Y, q.Z - 3.5, 10); put(M.plain, new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8).rotateX(Math.PI / 2).translate(q.X + 4.9, q.Y + 1.5, q.Z - 3.55), 0xc9cbd2); put(M.plain, new THREE.CylinderGeometry(0.09, 0.09, 0.01, 14).rotateX(Math.PI / 2).translate(q.X + 4.9, q.Y + 1.5, q.Z - 3.72), 0x23232b);
    post(INK, 0.012, 1.1, q.X + 5.6, q.Y, q.Z - 3.6, 4); put(M.plain, new THREE.BoxGeometry(0.4, 0.3, 0.02).rotateX(-0.3).translate(q.X + 5.6, q.Y + 1.2, q.Z - 3.6), 0xf4f4f0);
    sign('RECORDING', q.X + 4.95, q.Y + 2.85, q.Z - 2.63, 0, { w: 1.5, h: 0.32, color: '#ff2a4a', bg: '#16161c', size: 0.7 });
    q.person({ body: 'female', dark: true, hair: 0x111111, hairMesh: 'long', shirt: 0xffe066, tee: true, pants: 0x23232b }, 4.9, -4.1, 0, 'talk');
    collide(q.X + 4.95, q.Z - 3.7, 3.7, 2.2, 3);
    // The board, facing the glass: faders, meters, two monitors, the tape machine turning beside it, the man who has heard it all.
    slab(0x23232b, 3, 0.74, 0.9, q.X + 4.7, q.Y, q.Z - 1.5); put(M.plain, new THREE.BoxGeometry(3, 0.07, 0.8).rotateX(0.22).translate(q.X + 4.7, q.Y + 0.84, q.Z - 1.5), 0x3a3a44);
    for (let n = 0; n < 20; n++) { slab(0xe9e2cf, 0.035, 0.03, 0.07, q.X + 3.4 + n * 0.135, q.Y + 0.86 + ((n * 7) % 5) * 0.012, q.Z - 1.38 + ((n * 7) % 5) * 0.05); slab([0x7dffb0, 0xffe066, 0xff2a4a][n % 3], 0.03, 0.02, 0.03, q.X + 3.4 + n * 0.135, q.Y + 0.93, q.Z - 1.8, M.glow); }
    slab(INK, 1, 0.3, 0.06, q.X + 4.7, q.Y + 0.98, q.Z - 1.92); slab(0x7dffb0, 0.9, 0.2, 0.02, q.X + 4.7, q.Y + 1.03, q.Z - 1.88, M.glow);
    for (const s of [-1, 1]) { slab(INK, 0.36, 0.5, 0.3, q.X + 4.7 + s * 1.25, q.Y + 0.9, q.Z - 1.85); put(M.plain, new THREE.CylinderGeometry(0.12, 0.12, 0.02, 14).rotateX(Math.PI / 2).translate(q.X + 4.7 + s * 1.25, q.Y + 1.1, q.Z - 1.69), 0x8d8a8e); }
    slab(0x8d8a8e, 0.7, 1, 0.6, q.X + 2.7, q.Y, q.Z - 1.5); const reels = [-0.17, 0.17].map(dx => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 6), new THREE.MeshLambertMaterial({ color: 0xc9cbd2 })); r.position.set(q.X + 2.7 + dx, q.Y + 1.02, q.Z - 1.5); scene.add(r); return r; });
    updaters.push(t => { reels[0].rotation.y = t * 2.2; reels[1].rotation.y = t * 2.2; });
    slab(0x23232b, 0.5, 0.08, 0.5, q.X + 4.7, q.Y + 0.42, q.Z - 0.55); post(0x8a8d96, 0.03, 0.42, q.X + 4.7, q.Y, q.Z - 0.55, 5); slab(0x23232b, 0.5, 0.5, 0.06, q.X + 4.7, q.Y + 0.5, q.Z - 0.3);
    q.person({ shirt: 0x3b4a66, sleeves: 'long', pants: 0x23232b, hair: 0x8d8a8e, hairStyle: 'balding', bulk: 1.1, age: 0.6, glasses: 'clear' }, 4.7, -0.6, Math.PI, 'sit');
    collide(q.X + 4.4, q.Z - 1.5, 4.2, 1.1, 1.2);
    // Records on the walls; the trophies in their case; the jukebox; the water; something green.
    for (let n = 0; n < 5; n++) award(q.X - 6.66, q.Y + 1.95, q.Z - 3 + n * 1.5, Math.PI / 2, n % 3 === 1 ? 0xc9cbd2 : GOLD);
    for (let n = 0; n < 3; n++) award(q.X + 6.66, q.Y + 1.95, q.Z + 1.4 + n * 1.3, -Math.PI / 2, n === 1 ? 0xc9cbd2 : GOLD);
    slab(WALNUT, 0.5, 0.9, 1.3, q.X - 6.4, q.Y, q.Z + 4, M.wood, 1); for (const [w, d, x, z] of [[0.5, 0.02, -6.4, 3.36], [0.5, 0.02, -6.4, 4.64], [0.02, 1.3, -6.16, 4]]) slab(0xcfe8ff, w, 0.9, d, q.X + x, q.Y + 0.9, q.Z + z); slab(WALNUT, 0.52, 0.05, 1.32, q.X - 6.4, q.Y + 1.8, q.Z + 4);
    for (let n = 0; n < 4; n++) { const z = q.Z + 3.55 + n * 0.3; post(GOLD, 0.05, 0.04, q.X - 6.4, q.Y + 0.9, z, 8); post(GOLD, 0.012, 0.14, q.X - 6.4, q.Y + 0.94, z, 5); put(M.plain, new THREE.CylinderGeometry(0.07, 0.03, 0.14 + (n % 2) * 0.06, 10).translate(q.X - 6.4, q.Y + 1.15 + (n % 2) * 0.03, z), n === 2 ? 0xc9cbd2 : GOLD); }
    collide(q.X - 6.4, q.Z + 4, 0.6, 1.4, 1.9);
    slab(0x3a1c10, 0.6, 1.25, 0.9, q.X + 6.3, q.Y, q.Z + 0.35, M.wood, 1); put(M.wood, new THREE.CylinderGeometry(0.45, 0.45, 0.6, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(q.X + 6.3, q.Y + 1.25, q.Z + 0.35), 0x3a1c10);
    slab(0xffb060, 0.03, 0.5, 0.7, q.X + 5.99, q.Y + 0.95, q.Z + 0.35, M.glow); slab(0xff5fd2, 0.03, 0.12, 0.74, q.X + 5.98, q.Y + 0.78, q.Z + 0.35, M.glow); slab(TEAL, 0.03, 0.5, 0.06, q.X + 5.98, q.Y + 0.2, q.Z + 0.05, M.glow); slab(TEAL, 0.03, 0.5, 0.06, q.X + 5.98, q.Y + 0.2, q.Z + 0.65, M.glow);
    collide(q.X + 6.3, q.Z + 0.35, 0.7, 1, 1.8);
    slab(0xf4f4f0, 0.36, 1, 0.36, q.X - 6.4, q.Y, q.Z + 0.9); put(M.plain, new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12).translate(q.X - 6.4, q.Y + 1.22, q.Z + 0.9), 0x8fd0e8); collide(q.X - 6.4, q.Z + 0.9, 0.5, 0.5, 1.4);
    for (const [px, pz] of [[6.2, 4.2], [-1.7, 4.3], [3, 4.3]]) { post(0xb5523b, 0.2, 0.4, q.X + px, q.Y, q.Z + pz, 10); ball(0x2f7d46, 0.38, q.X + px, q.Y + 0.85, q.Z + pz); ball(0x3f9a5a, 0.26, q.X + px + 0.12, q.Y + 1.2, q.Z + pz - 0.05); }
    // Where people wait: two sofas, the low table, this month's trade papers; and who is coming to town, on the wall.
    for (const s of [-1, 1]) { q.block(OX, 2.2, 0.5, 0.9, s * 4.5, 2.5); q.block(OX, 2.2, 0.5, 0.3, s * 4.5, 2.1, M.plain, 0, 0.5); for (const t of [-1, 1]) slab(0x4a1414, 0.2, 0.25, 0.9, q.X + s * 4.5 + t * 1.1, q.Y + 0.5, q.Z + 2.5); }
    q.block(INK, 1, 0.4, 1, 0, 2.8, M.plain, 0); slab(GOLD, 1.04, 0.02, 1.04, q.X, q.Y + 0.4, q.Z + 2.8); for (let n = 0; n < 3; n++) slab(0xe9e2cf, 0.3, 0.02, 0.4, q.X - 0.3 + n * 0.3, q.Y + 0.42, q.Z + 2.8); slab(0x8a1c1c, 0.31, 0.012, 0.31, q.X + 0.2, q.Y + 0.44, q.Z + 3.05);
    sign(['THE VELVETONES', 'ONE NIGHT ONLY'], q.X + 2.3, q.Y + 2, q.Z + 4.68, Math.PI, { w: 1.3, h: 0.9, color: '#ffe066', bg: '#8a1c1c', size: 0.6, glow: false });
    sign(['MISS RUBY DELL', 'SINGS'], q.X + 3.9, q.Y + 2, q.Z + 4.68, Math.PI, { w: 1.3, h: 0.9, color: '#16161c', bg: '#49e0d0', size: 0.6, glow: false });
    sign(['LITTLE EARL', '& THE CHIMES'], q.X + 5.5, q.Y + 2, q.Z + 4.68, Math.PI, { w: 1.3, h: 0.9, color: '#f4f4f0', bg: '#3b2a6a', size: 0.6, glow: false });
    q.window(-3.6, 4.72, 3, 1.6, 1.8, Math.PI); for (let n = 0; n < 9; n++) slab(0xe9e2cf, 3, 0.02, 0.05, q.X - 3.6, q.Y + 1.1 + n * 0.18, q.Z + 4.66);
    for (const tz of [-1, 2.4]) { slab(INK, 9, 0.04, 0.06, q.X, q.Y + 3.5, q.Z + tz); for (let n = 0; n < 6; n++) put(M.glow, new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8).translate(q.X - 3.75 + n * 1.5, q.Y + 3.42, q.Z + tz), 0xfff2c0); }
    q.light(0, 3.2, -1, 0xcfe8ff, 40, 14); q.light(0, 3.2, 2.5, 0xffd9a8, 26, 12); q.light(4.9, 2.6, -3.7, 0xff8a70, 16, 6); q.light(-5, 3, 1, 0xffd9a8, 18, 9);
    clerk(q, 0, -3.6, 0, { body: 'female', dark: true, hair: 0x111111, hairMesh: 'long', shirt: 0x49e0d0, sleeves: 'long' });

    // ----- Hesh's office, through the door: a desk a man could be buried in, forty years of records, horses on the wall -----
    const o = rooms.HESH = room(12, 9, 3.4, { floor: M.wood, floorTint: 0x7a4a30, floorScale: 1.5, wall: M.plain, wallTint: 0x2f4a3c, ceil: 0xe9e2cf, door: WALNUT, doorX: -4, at: [q.X - 1.4, q.Z - 11] });
    const ox = x => o.X + x, oz = z => o.Z + z, Y = o.Y;
    for (const s of [-1, 1]) { slab(WALNUT, 11.4, 1.1, 0.05, o.X, Y, oz(s * 4.18), M.wood, 2); slab(WALNUT, 0.05, 1.1, 8.4, ox(s * 5.68), Y, o.Z, M.wood, 2); slab(GOLD, 11.4, 0.03, 0.06, o.X, Y + 1.1, oz(s * 4.18)); slab(GOLD, 0.06, 0.03, 8.4, ox(s * 5.68), Y + 1.1, o.Z); slab(0xe9e2cf, 11.4, 0.14, 0.08, o.X, Y + 3.26, oz(s * 4.16)); slab(0xe9e2cf, 0.08, 0.14, 8.4, ox(s * 5.66), Y + 3.26, o.Z); }
    for (const bz of [-2.4, 0, 2.4]) slab(WALNUT, 11.4, 0.16, 0.22, o.X, Y + 3.24, oz(bz), M.wood, 2);                                             // beams
    const persian = texture(256, 176, (c, w, h) => {
      c.fillStyle = '#1c2a4a'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9b25a'; c.fillRect(8, 8, w - 16, h - 16); c.fillStyle = '#7a1626'; c.fillRect(14, 14, w - 28, h - 28);
      c.strokeStyle = '#d9b25a'; c.lineWidth = 2; c.strokeRect(26, 26, w - 52, h - 52);
      c.fillStyle = '#1c2a4a'; c.beginPath(); c.moveTo(w / 2, 34); c.lineTo(w - 60, h / 2); c.lineTo(w / 2, h - 34); c.lineTo(60, h / 2); c.fill();
      c.fillStyle = '#d9b25a'; c.beginPath(); c.moveTo(w / 2, 58); c.lineTo(w - 96, h / 2); c.lineTo(w / 2, h - 58); c.lineTo(96, h / 2); c.fill();
      c.fillStyle = '#7a1626'; c.beginPath(); c.arc(w / 2, h / 2, 14, 0, 7); c.fill();
      c.fillStyle = '#e9d9a8'; for (let k = 0; k < 22; k++) { c.fillRect(20 + k * 10, 18, 4, 4); c.fillRect(20 + k * 10, h - 22, 4, 4); } for (let k = 0; k < 13; k++) { c.fillRect(18, 24 + k * 10, 4, 4); c.fillRect(w - 22, 24 + k * 10, 4, 4); }
      for (const [x, y] of [[44, 44], [w - 44, 44], [44, h - 44], [w - 44, h - 44]]) { c.fillStyle = '#1c2a4a'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); c.fillStyle = '#d9b25a'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }
    });
    persian.wrapS = persian.wrapT = THREE.ClampToEdgeWrapping; lay(persian, 6.6, 4.5, ox(0.6), oz(-0.2), Y + 0.006);
    // The desk, his chair behind it, two for whoever has come to ask.
    slab(0x3a1c10, 2.7, 0.08, 1.25, ox(0.5), Y + 0.74, oz(-2.2), M.wood, 1); for (const s of [-1, 1]) slab(0x3a1c10, 0.75, 0.74, 1.1, ox(0.5 + s * 0.92), Y, oz(-2.2), M.wood, 1); slab(0x2a1408, 1.1, 0.5, 0.05, ox(0.5), Y + 0.24, oz(-1.68));
    slab(0x1f5a3a, 1.5, 0.012, 0.8, ox(0.5), Y + 0.82, oz(-2.2)); for (const s of [-1, 1]) for (let k = 0; k < 3; k++) slab(GOLD, 0.12, 0.02, 0.02, ox(0.5 + s * 0.92), Y + 0.2 + k * 0.2, oz(-1.63));
    post(GOLD, 0.02, 0.3, ox(1.45), Y + 0.82, oz(-2.45), 6); post(GOLD, 0.09, 0.02, ox(1.45), Y + 0.82, oz(-2.45), 10); put(M.glow, new THREE.CylinderGeometry(0.09, 0.09, 0.34, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(ox(1.45), Y + 1.13, oz(-2.45)), 0x4fd08a); // the banker's lamp
    slab(INK, 0.26, 0.09, 0.2, ox(-0.45), Y + 0.82, oz(-2.5)); slab(INK, 0.07, 0.05, 0.26, ox(-0.45), Y + 0.91, oz(-2.5)); put(M.plain, new THREE.CylinderGeometry(0.05, 0.05, 0.01, 10).translate(ox(-0.45), Y + 0.915, oz(-2.42)), 0xe9e2cf);
    slab(0x5a3320, 0.34, 0.12, 0.24, ox(-0.5), Y + 0.82, oz(-1.9), M.wood, 1); slab(0x2f4a3c, 0.42, 0.05, 0.3, ox(0.45), Y + 0.83, oz(-2.2)); slab(0xf1ece0, 0.4, 0.012, 0.28, ox(0.45), Y + 0.88, oz(-2.2)); slab(GOLD, 0.2, 0.02, 0.03, ox(0.9), Y + 0.83, oz(-2.05));
    put(M.plain, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8).translate(ox(1.1), Y + 0.87, oz(-1.85)), 0xd9a14a); put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10).translate(ox(0.05), Y + 0.83, oz(-1.82)), 0x8d8a8e); put(M.plain, new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5).rotateZ(1.4).translate(ox(0.05), Y + 0.86, oz(-1.82)), 0x5a3320);
    slab(INK, 0.03, 0.22, 0.18, ox(1.55), Y + 0.82, oz(-1.9)); slab(0xe9e2cf, 0.01, 0.16, 0.12, ox(1.53), Y + 0.85, oz(-1.9));                              // somebody's photograph, turned his way
    collide(ox(0.5), oz(-2.2), 2.8, 1.35, 1);
    slab(OX, 0.7, 0.14, 0.66, ox(0.5), Y + 0.34, oz(-3.3)); slab(OX, 0.7, 1, 0.14, ox(0.5), Y + 0.48, oz(-3.62)); for (const s of [-1, 1]) slab(0x4a1414, 0.1, 0.3, 0.6, ox(0.5 + s * 0.38), Y + 0.48, oz(-3.3)); post(0x23232b, 0.05, 0.34, ox(0.5), Y, oz(-3.3), 6); post(0x23232b, 0.3, 0.03, ox(0.5), Y, oz(-3.3), 5);
    const guests = [-0.45, 1.45].map(dx => { slab(OX, 0.68, 0.3, 0.64, ox(dx), Y + 0.14, oz(-0.85)); slab(OX, 0.68, 0.5, 0.14, ox(dx), Y + 0.44, oz(-0.55)); for (const s of [-1, 1]) slab(0x4a1414, 0.12, 0.24, 0.64, ox(dx + s * 0.36), Y + 0.44, oz(-0.85)); for (const [fx, fz] of [[-0.28, -0.26], [0.28, -0.26], [-0.28, 0.26], [0.28, 0.26]]) post(0x2a1408, 0.03, 0.14, ox(dx + fx), Y, oz(-0.85 + fz), 4); return { x: ox(dx), y: Y, z: oz(-0.9), h: Math.PI }; });
    // Behind him: the credenza and its cups, the horse he paid too much for, two more records for the wall.
    slab(WALNUT, 3.8, 0.82, 0.5, ox(0.5), Y, oz(-3.93), M.wood, 1); slab(0x2a1408, 3.9, 0.04, 0.56, ox(0.5), Y + 0.82, oz(-3.93)); for (let k = 0; k < 4; k++) slab(GOLD, 0.04, 0.04, 0.02, ox(-0.9 + k * 0.94), Y + 0.45, oz(-3.67));
    for (const [dx, hgt] of [[-1.1, 0.3], [-0.7, 0.2], [2.1, 0.34]]) { post(0x2a1408, 0.07, 0.05, ox(dx), Y + 0.86, oz(-3.93), 8); post(GOLD, 0.014, 0.1, ox(dx), Y + 0.91, oz(-3.93), 5); put(M.plain, new THREE.CylinderGeometry(0.08, 0.03, hgt, 10).translate(ox(dx), Y + 1.01 + hgt / 2, oz(-3.93)), GOLD); }
    put(M.plain, new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8).translate(ox(1.5), Y + 0.96, oz(-3.93)), 0xb5651d); post(0xb5651d, 0.025, 0.08, ox(1.5), Y + 1.06, oz(-3.93), 6); for (const dx of [1.72, 1.86]) put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8).translate(ox(dx), Y + 0.9, oz(-3.9)), 0xcfe8ff);
    const horse = texture(256, 160, (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#b9d4e6'); sky.addColorStop(0.6, '#e9e2c8'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
      c.fillStyle = '#6a8a4a'; c.fillRect(0, h * 0.68, w, h); c.fillStyle = '#56763c'; c.fillRect(0, h * 0.8, w, h); c.fillStyle = '#f4f4f0'; c.fillRect(0, h * 0.66, w, 3);
      c.fillStyle = '#5a321c'; c.beginPath(); c.ellipse(128, 86, 52, 22, 0, 0, 7); c.fill();                                                    // the barrel
      c.beginPath(); c.moveTo(166, 78); c.lineTo(200, 40); c.lineTo(214, 48); c.lineTo(182, 96); c.fill();                                    // the neck
      c.beginPath(); c.ellipse(212, 44, 17, 8, 0.5, 0, 7); c.fill(); c.beginPath(); c.moveTo(200, 34); c.lineTo(204, 24); c.lineTo(208, 34); c.fill();
      c.strokeStyle = '#4a2814'; c.lineWidth = 6; c.lineCap = 'round'; for (const [x0, x1] of [[92, 84], [108, 112], [154, 150], [168, 176]]) { c.beginPath(); c.moveTo(x0, 98); c.lineTo(x1, 138); c.stroke(); }
      c.strokeStyle = '#1c1410'; c.lineWidth = 5; c.beginPath(); c.moveTo(78, 80); c.quadraticCurveTo(58, 92, 62, 118); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(176, 66); c.lineTo(196, 42); c.stroke();
      c.fillStyle = '#8a1c2a'; c.fillRect(112, 62, 30, 10);
    });
    horse.wrapS = horse.wrapT = THREE.ClampToEdgeWrapping;
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshLambertMaterial({ map: horse })); m.position.set(ox(0.5), Y + 2.2, oz(-4.14)); scene.add(m); }
    slab(GOLD, 2.3, 1.5, 0.05, ox(0.5), Y + 1.45, oz(-4.19)); slab(0xfff2c0, 1.2, 0.03, 0.1, ox(0.5), Y + 3, oz(-4.1), M.glow);
    award(ox(-1.5), Y + 2.15, oz(-4.16), 0); award(ox(2.5), Y + 2.15, oz(-4.16), 0, 0xc9cbd2); award(ox(3.5), Y + 2.15, oz(-4.16), 0);
    collide(ox(0.5), oz(-3.95), 3.9, 0.6, 1.4);
    slab(0x3a3a44, 0.7, 0.8, 0.7, ox(5.2), Y, oz(-3.7)); put(M.plain, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14).rotateZ(Math.PI / 2).translate(ox(4.84), Y + 0.5, oz(-3.7)), 0xc9cbd2); slab(0xc9cbd2, 0.03, 0.2, 0.04, ox(4.84), Y + 0.3, oz(-3.5)); collide(ox(5.2), oz(-3.7), 0.8, 0.8, 1); // the safe
    // The west wall: every record he ever put out, and the machine he plays them on.
    slab(WALNUT, 0.42, 2.7, 4.6, ox(-5.46), Y, oz(-1.7), M.wood, 2);
    const SLEEVES = [0x8a1c1c, 0x1f3a2c, 0x2c3a5a, 0xd9c7a0, 0x5a3320, 0x16161c, 0xb5523b, 0xd9a520, 0x49e0d0, 0xf4f4f0, 0x8a5cff, 0xff8a5c];
    for (let r = 0; r < 5; r++) { slab(0x2a1408, 0.44, 0.04, 4.6, ox(-5.44), Y + 0.08 + r * 0.52, oz(-1.7)); for (let n = 0; n < 42; n++) if ((n * 7 + r * 3) % 11) slab(SLEEVES[(n * 5 + r * 7) % 12], 0.32, 0.4 + ((n + r) % 3) * 0.02, 0.05 + (n % 2) * 0.03, ox(-5.36), Y + 0.12 + r * 0.52, oz(-3.9 + n * 0.105)); }
    collide(ox(-5.46), oz(-1.7), 0.6, 4.7, 2.7);
    slab(WALNUT, 0.55, 0.72, 1.5, ox(-5.4), Y, oz(2), M.wood, 1); slab(0x23232b, 0.42, 0.07, 0.46, ox(-5.4), Y + 0.72, oz(1.65));
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), new THREE.MeshLambertMaterial({ color: 0x16161c })); platter.position.set(ox(-5.4), Y + 0.8, oz(1.65)); scene.add(platter);
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.05), new THREE.MeshLambertMaterial({ color: 0xd8342c })); label.position.y = 0.002; platter.add(label);
    updaters.push(t => { platter.rotation.y = t * 3.4; });
    slab(0x8d8a8e, 0.4, 0.14, 0.5, ox(-5.4), Y + 0.72, oz(2.4)); for (let n = 0; n < 4; n++) put(M.glow, new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8).translate(ox(-5.4), Y + 0.92, oz(2.22 + n * 0.12)), 0xffb060);
    for (const sz of [0.75, 3.25]) { slab(0x2a1408, 0.42, 1.15, 0.42, ox(-5.44), Y, oz(sz), M.wood, 1); put(M.plain, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 14).rotateZ(Math.PI / 2).translate(ox(-5.22), Y + 0.5, oz(sz)), 0x3a3a44); put(M.plain, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateZ(Math.PI / 2).translate(ox(-5.22), Y + 0.92, oz(sz)), 0x3a3a44); }
    collide(ox(-5.42), oz(2), 0.6, 3, 1.2);
    // The east wall: the couch under the blinds, a lamp, the low table; the cart with the good bottles.
    slab(OX, 0.9, 0.42, 2.7, ox(5.15), Y, oz(0.7)); slab(OX, 0.24, 0.5, 2.7, ox(5.5), Y + 0.42, oz(0.7)); for (const s of [-1, 1]) slab(0x4a1414, 0.9, 0.3, 0.22, ox(5.15), Y + 0.42, oz(0.7 + s * 1.3)); for (let n = 0; n < 5; n++) ball(0x3a0e0e, 0.025, ox(5.37), Y + 0.7, oz(-0.3 + n * 0.5));
    collide(ox(5.2), oz(0.7), 1, 2.8, 1);
    const couch = [0.1, 1.3].map(dz => ({ x: ox(5.05), y: Y, z: oz(dz), h: -Math.PI / 2 }));
    slab(0x3a1c10, 0.6, 0.38, 1.1, ox(3.9), Y, oz(0.7), M.wood, 1); slab(0xe9e2cf, 0.3, 0.015, 0.4, ox(3.9), Y + 0.38, oz(0.5)); put(M.plain, new THREE.CylinderGeometry(0.08, 0.08, 0.025, 10).translate(ox(3.9), Y + 0.39, oz(1)), 0x8d8a8e); collide(ox(3.9), oz(0.7), 0.6, 1.1, 0.5);
    o.window(5.72, 0.7, 2.4, 1.3, 2.1, -Math.PI / 2, 0xffe2b0); for (let n = 0; n < 9; n++) slab(0x8a7a5a, 0.04, 0.025, 2.4, ox(5.68), Y + 1.5 + n * 0.15, oz(0.7)); for (const s of [-1, 1]) slab(0x1f3a2c, 0.08, 1.9, 0.4, ox(5.66), Y + 1.25, oz(0.7 + s * 1.45));
    slab(0x3a1c10, 0.45, 0.55, 0.45, ox(5.3), Y, oz(-1.1), M.wood, 1); post(GOLD, 0.015, 0.4, ox(5.3), Y + 0.55, oz(-1.1), 5); put(M.glow, new THREE.ConeGeometry(0.2, 0.26, 10, 1, true).translate(ox(5.3), Y + 1.05, oz(-1.1)), 0xffe2a6);
    for (const s of [-1, 1]) for (const t of [-1, 1]) post(GOLD, 0.012, 0.85, ox(4.9 + s * 0.3), Y, oz(3.5 + t * 0.2), 4); for (const y of [0.3, 0.8]) slab(0xcfe8ff, 0.66, 0.02, 0.46, ox(4.9), Y + y, oz(3.5));
    for (let n = 0; n < 5; n++) put(M.plain, new THREE.CylinderGeometry(0.04, 0.05, 0.24 + (n % 2) * 0.06, 8).translate(ox(4.68 + n * 0.11), Y + 0.94 + (n % 2) * 0.03, oz(3.5)), [0xb5651d, 0xe9e2cf, 0x8a5a2a, 0x2f5a3f, 0xd9a14a][n]); for (let n = 0; n < 4; n++) put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8).translate(ox(4.72 + n * 0.12), Y + 0.36, oz(3.5)), 0xcfe8ff);
    post(0x3a1c10, 0.02, 0.9, ox(3.4), Y, oz(3.7), 5); ball(0x3b6ea8, 0.24, ox(3.4), Y + 1.1, oz(3.7)); put(M.plain, new THREE.TorusGeometry(0.27, 0.012, 4, 20).rotateX(0.4).translate(ox(3.4), Y + 1.1, oz(3.7)), GOLD); // the globe
    // The south wall: the upright he still plays, faces he made famous, the clock.
    slab(0x1c1410, 1.5, 1.2, 0.55, ox(0.6), Y, oz(3.85)); slab(0x1c1410, 1.5, 0.06, 0.32, ox(0.6), Y + 0.7, oz(3.45)); slab(0xf4f4f0, 1.3, 0.02, 0.14, ox(0.6), Y + 0.76, oz(3.4)); for (let n = 0; n < 18; n++) if (n % 7 !== 2 && n % 7 !== 6) slab(0x16161c, 0.03, 0.025, 0.08, ox(0 + n * 0.07), Y + 0.77, oz(3.43));
    put(M.plain, new THREE.BoxGeometry(0.4, 0.28, 0.01).rotateX(0.2).translate(ox(0.6), Y + 1, oz(3.56)), 0xf1ece0); slab(0x2a1408, 0.8, 0.08, 0.34, ox(0.6), Y + 0.46, oz(2.9), M.wood, 1); for (const s of [-1, 1]) slab(0x2a1408, 0.05, 0.46, 0.3, ox(0.6 + s * 0.35), Y, oz(2.9));
    collide(ox(0.6), oz(3.85), 1.6, 0.7, 1.3); collide(ox(0.6), oz(2.9), 0.8, 0.36, 0.5);
    for (let n = 0; n < 10; n++) { const x = ox(-2.2 + (n % 5) * 0.62 + (n > 4 ? 3.6 : 0) - (n > 4 ? 0 : 0)), y = Y + 1.6 + (n % 2) * 0.62 + ((n * 3) % 4) * 0.04; if (n < 5 || n > 4) { slab(INK, 0.46, 0.56, 0.03, x - (n > 4 ? 1.3 : 0), y, oz(4.15)); slab([0xd8d2c8, 0xb9b3ac, 0xe9e2cf][n % 3], 0.38, 0.48, 0.035, x - (n > 4 ? 1.3 : 0), y + 0.04, oz(4.15)); } }
    put(M.plain, new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20).rotateX(Math.PI / 2).translate(ox(3.3), Y + 2.5, oz(4.15)), 0xf1ece0); put(M.plain, new THREE.TorusGeometry(0.22, 0.02, 5, 22).translate(ox(3.3), Y + 2.5, oz(4.13)), GOLD); slab(INK, 0.015, 0.14, 0.01, ox(3.3), Y + 2.5, oz(4.12)); slab(INK, 0.1, 0.015, 0.01, ox(3.35), Y + 2.5, oz(4.12));
    post(0xb5523b, 0.22, 0.42, ox(-2.4), Y, oz(3.7), 10); ball(0x2f7d46, 0.42, ox(-2.4), Y + 0.9, oz(3.7)); ball(0x3f9a5a, 0.3, ox(-2.3), Y + 1.3, oz(3.65));
    put(M.plain, new THREE.TorusGeometry(0.42, 0.02, 5, 22).rotateX(Math.PI / 2).translate(ox(0.6), Y + 2.7, oz(-0.4)), GOLD); post(GOLD, 0.012, 0.6, ox(0.6), Y + 2.7, oz(-0.4), 4); for (let n = 0; n < 6; n++) ball(0xfff2c0, 0.05, ox(0.6 + Math.sin(n * 1.047) * 0.42), Y + 2.76, oz(-0.4 + Math.cos(n * 1.047) * 0.42), M.glow);
    o.light(0.6, 2.7, -0.6, 0xffd9a8, 52, 13); o.light(4.2, 2.4, 1, 0xffe2b0, 24, 9); o.light(-4.2, 2.6, -0.6, 0xfff0d0, 24, 9); o.light(1.3, 1.4, -2.2, 0x9fe8b0, 9, 3.5);
    Object.assign(o, { chair: { x: ox(0.5), y: Y, z: oz(-3.28), h: 0 }, guests, couch, desk: { x: ox(0.5), z: oz(-2.2) } });
    (places.stairs ??= []).push({ a: { x: q.X - 5.4, z: q.Z - 3.9, h: 0 }, b: { x: o.inside.x, z: o.inside.z + 1.2, h: Math.PI }, up: "Go through to Hesh's office", down: 'Back to reception' });
  }
  { // Brendan Filone's place: one room and a bathroom, a couch that came with it, and forty DVD players he has not moved yet
    const q = rooms.BRENDAN = room(10, 8, 3, { floor: M.wood, floorTint: 0x7a5a44, floorScale: 1.5, wall: M.plain, wallTint: 0xd8cdb4, ceil: 0xe9e2cf, door: 0x5a3320, doorX: -2.5, at: [2680, 26] });
    const TILE = 0xdfe8e6, WHITE = 0xf4f4f0, CARD = 0xc79a6a;
    // The bathroom, in the corner: two walls, a doorway, tile.
    q.block(0xd8cdb4, 0.16, 3, 3.3, 1.9, -2.05); q.block(0xd8cdb4, 1.5, 3, 0.16, 4, -0.48); slab(0xd8cdb4, 1.5, 0.8, 0.16, q.X + 2.6, q.Y + 2.2, q.Z - 0.48);                                    // (the gap between x 1.9 and 3.25 is the door)
    slab(TILE, 2.8, 0.012, 3.2, q.X + 3.3, q.Y + 0.006, q.Z - 2.1); for (let k = 0; k < 5; k++) slab(0xb9c8c8, 2.8, 0.014, 0.02, q.X + 3.3, q.Y + 0.007, q.Z - 3.5 + k * 0.7);
    slab(TILE, 2.8, 1.5, 0.03, q.X + 3.3, q.Y, q.Z - 3.68); slab(TILE, 0.03, 1.5, 3.2, q.X + 4.68, q.Y, q.Z - 2.1);
    q.block(WHITE, 1.9, 0.58, 0.9, 3.5, -3.1); slab(0xe9eeee, 1.7, 0.03, 0.7, q.X + 3.5, q.Y + 0.56, q.Z - 3.1); post(0xc9cbd2, 0.02, 0.24, q.X + 4.36, q.Y + 0.58, q.Z - 3.1, 5); slab(0xc9cbd2, 0.14, 0.03, 0.03, q.X + 4.3, q.Y + 0.8, q.Z - 3.1);        // the bath
    slab(WHITE, 0.5, 0.14, 0.4, q.X + 4.4, q.Y + 0.8, q.Z - 1.3); post(WHITE, 0.07, 0.8, q.X + 4.5, q.Y, q.Z - 1.3, 8); slab(0xb9c8d8, 0.03, 0.6, 0.45, q.X + 4.66, q.Y + 1.3, q.Z - 1.3);                                              // basin, mirror
    slab(WHITE, 0.4, 0.4, 0.5, q.X + 2.4, q.Y, q.Z - 3.3); slab(WHITE, 0.4, 0.5, 0.16, q.X + 2.4, q.Y + 0.4, q.Z - 3.56); slab(0x9fd0f5, 0.5, 0.012, 0.7, q.X + 3.4, q.Y + 0.008, q.Z - 2.2);                                              // the toilet; a mat
    slab(0x2f56c8, 0.5, 0.9, 0.04, q.X + 2.02, q.Y + 0.8, q.Z - 2.4);                                                                                                                                                                  // a towel on the back of the wall
    // The room: the couch, a television on a milk crate, a mattress, weights, a boombox, what a week of take-away leaves.
    q.block(0x4a5a6a, 2.4, 0.5, 0.95, -2.6, -3.2); q.block(0x4a5a6a, 2.4, 0.5, 0.26, -2.6, -3.58, M.plain, 0, 0.5); slab(0x3a4a5a, 0.3, 0.3, 0.95, q.X - 3.7, q.Y + 0.5, q.Z - 3.2);
    slab(0x2f56c8, 0.5, 0.4, 0.4, q.X - 2.6, q.Y, q.Z - 0.9); slab(0x1c1c22, 0.9, 0.7, 0.5, q.X - 2.6, q.Y + 0.4, q.Z - 0.9); q.glowPanel(0x9fd0f5, 0.74, 0.52, -2.6, -1.16, 0.75, Math.PI); slab(0x23232b, 0.34, 0.06, 0.24, q.X - 2.2, q.Y + 0.02, q.Z - 1.6); collide(q.X - 2.6, q.Z - 0.9, 1, 0.6, 1.1);
    slab(0xe9e2cf, 1.5, 0.22, 2, q.X - 4, q.Y, q.Z + 1.6); slab(0x8a1c1c, 1.5, 0.06, 1.2, q.X - 4, q.Y + 0.22, q.Z + 2); slab(WHITE, 0.6, 0.12, 0.4, q.X - 4, q.Y + 0.22, q.Z + 0.85); collide(q.X - 4, q.Z + 1.6, 1.6, 2.1, 0.4);
    put(M.plain, new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6).rotateZ(Math.PI / 2).translate(q.X + 0.2, q.Y + 0.18, q.Z + 2.9), 0x8a8d96); for (const s2 of [-1, 1]) for (let k = 0; k < 2; k++) put(M.plain, new THREE.CylinderGeometry(0.18 - k * 0.04, 0.18 - k * 0.04, 0.05, 12).rotateZ(Math.PI / 2).translate(q.X + 0.2 + s2 * (0.62 - k * 0.07), q.Y + 0.18, q.Z + 2.9), 0x23232b);
    slab(0x23232b, 0.6, 0.26, 0.2, q.X - 0.4, q.Y + 0.92, q.Z - 3.6); for (const s2 of [-1, 1]) put(M.plain, new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10).rotateX(Math.PI / 2).translate(q.X - 0.4 + s2 * 0.2, q.Y + 1.05, q.Z - 3.49), 0x8d8a8e); slab(0x7dffb0, 0.1, 0.04, 0.01, q.X - 0.4, q.Y + 1.12, q.Z - 3.49, M.glow); // the radio, on
    q.block(0x8a6a44, 0.9, 0.9, 0.5, -0.4, -3.6, M.wood, 1);
    for (let k = 0; k < 14; k++) { const col = k % 4, row = Math.floor(k / 4); slab(CARD, 0.5, 0.42, 0.46, q.X - 0.9 + col * 0.54, q.Y + row * 0.43, q.Z + 3.3); slab(0x2f56c8, 0.51, 0.1, 0.47, q.X - 0.9 + col * 0.54, q.Y + row * 0.43 + 0.16, q.Z + 3.3); } collide(q.X - 0.1, q.Z + 3.3, 2.3, 0.6, 1.4); // the DVD players
    for (let k = 0; k < 3; k++) slab(0xe9e2cf, 0.4, 0.04, 0.4, q.X - 1.2 + k * 0.03, q.Y + 0.01 + k * 0.045, q.Z - 2.1); for (let k = 0; k < 6; k++) post([0x8a5a2a, 0x2f7d46][k % 2], 0.03, 0.22, q.X - 1.9 + (k % 3) * 0.14, q.Y, q.Z - 2.3 + Math.floor(k / 3) * 0.3, 6);   // pizza boxes, bottles
    slab(0xd8342c, 0.9, 1.2, 0.03, q.X - 2.6, q.Y + 1.5, q.Z - 3.68); slab(0x16161c, 0.7, 1, 0.035, q.X - 2.6, q.Y + 1.6, q.Z - 3.68); slab(0xf2c230, 0.5, 0.2, 0.04, q.X - 2.6, q.Y + 2.3, q.Z - 3.67);                                         // a poster of a car he will never own
    q.block(WHITE, 0.6, 0.9, 1.6, -4.5, -1.2); slab(0x8a8d96, 0.62, 0.04, 1.62, q.X - 4.5, q.Y + 0.9, q.Z - 1.2); slab(0xc9cbd2, 0.4, 0.02, 0.5, q.X - 4.5, q.Y + 0.92, q.Z - 0.8); for (let k = 0; k < 4; k++) put(M.plain, new THREE.CylinderGeometry(0.12, 0.12, 0.012, 10).translate(q.X - 4.5, q.Y + 0.94 + k * 0.014, q.Z - 1.6), WHITE);
    q.window(-1, 3.72, 2, 1.2, 1.8, Math.PI, 0xffd9a8); for (let k = 0; k < 8; k++) slab(0xb9a58a, 2, 0.02, 0.05, q.X - 1, q.Y + 1.28 + k * 0.15, q.Z + 3.66);
    put(M.glow, new THREE.SphereGeometry(0.1, 8, 6).translate(q.X - 1.5, q.Y + 2.7, q.Z), 0xfff2c0); post(0x23232b, 0.008, 0.3, q.X - 1.5, q.Y + 2.7, q.Z, 3);                                                                              // a bare bulb
    q.light(-1.5, 2.5, 0, 0xffe2b0, 34, 11); q.light(3.3, 2.4, -2.2, 0xdfeeff, 22, 6);
    q.tub = { x: q.X + 4.25, y: q.Y + 0.28, z: q.Z - 3.1 }; q.tubMid = { x: q.X + 3.5, y: q.Y + 0.28, z: q.Z - 3.1 }; /* a body laid down lies back from where it stood: `tub` is the foot of the bath */ q.bathDoor = { x: q.X + 2.6, z: q.Z - 0.1 }; q.bath = { x: q.X + 3.2, z: q.Z - 1.9 }; q.radio = { x: q.X - 0.4, z: q.Z - 2.9 }; q.boxes = { x: q.X - 0.1, z: q.Z + 2.5 };
  }
  { // Christopher Moltisanti's place: rented, and furnished out of the back of trucks. A leather couch in front of a television too big
    // for the room, a kitchen he does not cook in, a desk with a computer and one page, a bedroom behind a partition, a bathroom.
    const q = rooms.CHRIS = room(12, 9, 3, { floor: M.wood, floorTint: 0x8a6a4a, floorScale: 1.5, wall: M.plain, wallTint: 0xd9d2c4, ceil: 0xeeeae0, door: 0x3a2418, doorX: 1.2, at: [2600, 30] });
    const X = q.X, Y = q.Y, Z = q.Z, LEATHER = 0x1a1a1e, CHROME = 0xc9cbd2, WHITE = 0xf4f4f0, OAK = 0x9a7448, TILE = 0xdfe6e8, PART = 0xd9d2c4, INK = 0x16161c;
    // Partitions: the bedroom (south-west), the bathroom (south-east). The front door opens between them.
    q.block(PART, 0.16, 3, 3.3, -1.2, 2.55); q.block(PART, 2.1, 3, 0.16, -4.65, 0.9); slab(PART, 2.4, 0.8, 0.16, X - 2.4, Y + 2.2, Z + 0.9);              // (the opening into the bedroom is x -3.6 to -1.2)
    q.block(PART, 0.16, 3, 2.6, 3.0, 2.9); q.block(PART, 1.7, 3, 0.16, 4.85, 1.6); slab(PART, 1.0, 0.8, 0.16, X + 3.5, Y + 2.2, Z + 1.6);                // (the bathroom door is x 3.0 to 4.0)
    // ----- The living room -----
    slab(0x5a2a2e, 3.6, 0.012, 2.8, X - 3.7, Y + 0.006, Z - 1.8); slab(0x3a1c20, 3.3, 0.014, 2.5, X - 3.7, Y + 0.007, Z - 1.8);                                // a rug
    q.block(INK, 0.5, 0.5, 2.2, -5.35, -1.8); slab(0x2a2a30, 0.46, 0.02, 2.16, X - 5.35, Y + 0.5, Z - 1.8);                                                 // the unit under the television
    slab(INK, 0.12, 0.95, 1.5, X - 5.42, Y + 0.56, Z - 1.8); slab(0x23232b, 0.3, 0.06, 0.6, X - 5.35, Y + 0.52, Z - 1.8);                                    // the television: thirty-six inches, fell off a truck
    slab(0x2a2a30, 0.36, 0.09, 0.44, X - 5.3, Y + 0.3, Z - 1.8); slab(0x7dffb0, 0.01, 0.02, 0.1, X - 5.11, Y + 0.34, Z - 1.7, M.glow);                       // the video recorder, its clock unset
    for (const s2 of [-1, 1]) { q.block(INK, 0.34, 1.1, 0.34, -5.4, -1.8 + s2 * 1.45); for (let k = 0; k < 2; k++) put(M.plain, new THREE.CylinderGeometry(0.1 - k * 0.04, 0.1 - k * 0.04, 0.02, 12).rotateZ(Math.PI / 2).translate(X - 5.22, Y + 0.4 + k * 0.42, Z - 1.8 + s2 * 1.45), 0x55525a); } // speakers
    { // the screen is its own mesh: it flickers
      const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.8).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fb4e0 })); tv.position.set(X - 5.35, Y + 1.05, Z - 1.8); scene.add(tv);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fb4e0, transparent: true, opacity: 0.1, depthWrite: false })); glow.position.set(X - 3.9, Y + 0.02, Z - 1.8); scene.add(glow);
      updaters.push(t => { const k = 0.62 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + (Math.sin(t * 0.9) > 0.86 ? 0.25 : 0); tv.material.color.setRGB(0.45 * k + 0.1, 0.62 * k, 0.9 * k); glow.material.opacity = 0.05 + k * 0.09; });
    }
    // The couch: black leather, facing the screen. Its back is to the kitchen.
    q.block(LEATHER, 0.95, 0.42, 2.3, -2.5, -1.8); slab(LEATHER, 0.26, 0.5, 2.3, X - 2.1, Y + 0.42, Z - 1.8); for (const s2 of [-1, 1]) slab(0x232328, 0.95, 0.24, 0.24, X - 2.5, Y + 0.42, Z - 1.8 + s2 * 1.03);
    for (const s2 of [-1, 1]) slab(0x26262c, 0.62, 0.1, 0.98, X - 2.62, Y + 0.42, Z - 1.8 + s2 * 0.5); slab(0x8a1c2a, 0.12, 0.34, 0.4, X - 2.28, Y + 0.52, Z - 2.55);
    q.block(INK, 0.6, 0.36, 1.2, -3.9, -1.8); slab(0x55606a, 0.56, 0.015, 1.16, X - 3.9, Y + 0.36, Z - 1.8);                                                 // a smoked-glass table
    slab(0xe9e2cf, 0.4, 0.04, 0.4, X - 3.9, Y + 0.375, Z - 2.1); slab(0xd8342c, 0.3, 0.005, 0.3, X - 3.9, Y + 0.416, Z - 2.1); post(0x9a9690, 0.09, 0.03, X - 3.85, Y + 0.375, Z - 1.5, 10); slab(INK, 0.06, 0.03, 0.18, X - 4.0, Y + 0.375, Z - 1.3); // a pizza box, an ashtray, the remote
    for (let k = 0; k < 3; k++) post([0x8a5a2a, 0x2f7d46, 0x8a5a2a][k], 0.03, 0.22, X - 3.75 + k * 0.09, Y + 0.375, Z - 1.72 - (k % 2) * 0.1, 6);
    post(CHROME, 0.02, 1.7, X - 5.3, Y, Z - 3.85, 6); post(INK, 0.16, 0.02, X - 5.3, Y, Z - 3.85, 10); put(M.glow, new THREE.CylinderGeometry(0.12, 0.2, 0.26, 12).translate(X - 5.3, Y + 1.72, Z - 3.85), 0xffe2b0);    // a floor lamp
    // Tapes. He has every gangster picture ever put on one, and has opinions about all of them.
    q.block(OAK, 2.0, 1.7, 0.34, -3.9, -4.0, M.wood, 1); for (let r = 0; r < 4; r++) { slab(0x2a2018, 1.9, 0.03, 0.3, X - 3.9, Y + 0.3 + r * 0.4, Z - 3.98); for (let k = 0; k < 15; k++) slab([INK, 0xd8342c, 0xf2c230, 0x2f56c8, WHITE, 0x23232b][(k * 5 + r * 3) % 6], 0.1, 0.3, 0.2, X - 4.78 + k * 0.125, Y + 0.33 + r * 0.4, Z - 3.94); }
    for (const [px, hex, band] of [[-5.0, 0x16161c, 0xd8342c], [-2.6, 0x1c2a3a, 0xf2c230]]) { slab(INK, 0.8, 1.1, 0.03, X + px, Y + 1.75, Z - 4.18); slab(hex, 0.72, 1.0, 0.035, X + px, Y + 1.8, Z - 4.18); slab(band, 0.5, 0.14, 0.04, X + px, Y + 1.92, Z - 4.175); slab(0xe9e2cf, 0.3, 0.3, 0.04, X + px, Y + 2.25, Z - 4.175); } // two film posters, framed
    // The desk: a computer, a printer, and the page he has been on for a month.
    q.block(OAK, 1.5, 0.74, 0.7, -1.3, -3.82, M.wood, 1); slab(0xd8d2c0, 0.44, 0.38, 0.4, X - 1.5, Y + 0.84, Z - 3.92); slab(0xc9c2b0, 0.3, 0.1, 0.3, X - 1.5, Y + 0.74, Z - 3.92); q.glowPanel(0xbfe0ff, 0.36, 0.28, -1.5, -3.71, 1.03, 0);
    slab(0xd8d2c0, 0.46, 0.03, 0.17, X - 1.5, Y + 0.74, Z - 3.6); slab(0xd8d2c0, 0.4, 0.16, 0.34, X - 0.85, Y + 0.74, Z - 3.9); slab(WHITE, 0.22, 0.02, 0.3, X - 0.85, Y + 0.9, Z - 3.86); for (let k = 0; k < 5; k++) slab(WHITE, 0.22, 0.004, 0.3, X - 1.95 + k * 0.006, Y + 0.74 + k * 0.004, Z - 3.6 + k * 0.01);
    chairAt({ x: X - 1.4, z: Z - 3.0, h: Math.PI }, Y, INK); collide(X - 1.4, Z - 3.0, 0.5, 0.5, 0.9);
    { // a fan over the couch, turning
      const fan = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x5a3a24 }); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.17), wood); b.position.set(Math.cos(k * Math.PI / 2) * 0.62, 0, Math.sin(k * Math.PI / 2) * 0.62); b.rotation.y = -k * Math.PI / 2; fan.add(b); }
      fan.position.set(X - 3.2, Y + 2.72, Z - 1.8); scene.add(fan); post(0xb08d57, 0.03, 0.3, X - 3.2, Y + 2.72, Z - 1.8, 6); post(0xb08d57, 0.11, 0.1, X - 3.2, Y + 2.66, Z - 1.8, 10); updaters.push(t => { fan.rotation.y = t * 2.6; });
    }
    // ----- The kitchen: units down the north wall and round the corner, a breakfast bar dividing it from the couch -----
    q.block(WHITE, 0.72, 1.85, 0.7, 1.4, -3.85); slab(0xdfe3e6, 0.7, 0.02, 0.02, X + 1.4, Y + 1.25, Z - 3.49); slab(CHROME, 0.03, 0.4, 0.03, X + 1.68, Y + 1.4, Z - 3.48); slab(CHROME, 0.03, 0.5, 0.03, X + 1.68, Y + 0.6, Z - 3.48);          // the refrigerator
    slab(0xf2c230, 0.2, 0.14, 0.006, X + 1.3, Y + 1.5, Z - 3.495); slab(0xd8342c, 0.12, 0.12, 0.006, X + 1.52, Y + 1.62, Z - 3.495);                                                                              // a take-away menu under a magnet
    q.block(0x7a5a3c, 3.9, 0.9, 0.62, 3.75, -3.89, M.wood, 1); slab(0x2a2a30, 3.94, 0.04, 0.66, X + 3.75, Y + 0.9, Z - 3.89); q.block(0x7a5a3c, 0.62, 0.9, 2.5, 5.39, -2.3, M.wood, 1); slab(0x2a2a30, 0.66, 0.04, 2.5, X + 5.39, Y + 0.9, Z - 2.3);
    for (let k = 0; k < 6; k++) { slab(0x6a4c30, 0.58, 0.01, 0.01, X + 2.1 + k * 0.65, Y + 0.62, Z - 3.575); slab(CHROME, 0.14, 0.02, 0.02, X + 2.1 + k * 0.65, Y + 0.72, Z - 3.57); slab(0x5a4028, 0.01, 0.86, 0.01, X + 1.8 + k * 0.65, Y + 0.02, Z - 3.575); }   // doors and drawers
    slab(WHITE, 0.62, 0.9, 0.62, X + 2.45, Y, Z - 3.89); slab(INK, 0.6, 0.02, 0.6, X + 2.45, Y + 0.94, Z - 3.89); for (const [bx, bz] of [[-0.15, -0.14], [0.15, -0.14], [-0.15, 0.14], [0.15, 0.14]]) put(M.plain, new THREE.TorusGeometry(0.085, 0.012, 4, 12).rotateX(Math.PI / 2).translate(X + 2.45 + bx, Y + 0.965, Z - 3.89 + bz), 0x55525a); slab(INK, 0.5, 0.36, 0.01, X + 2.45, Y + 0.3, Z - 3.575); // the stove
    slab(0xb8bcc4, 0.7, 0.02, 0.44, X + 4.1, Y + 0.93, Z - 3.89); slab(0x8a8d96, 0.6, 0.01, 0.34, X + 4.1, Y + 0.945, Z - 3.89); post(CHROME, 0.015, 0.26, X + 4.1, Y + 0.94, Z - 4.1, 5); slab(CHROME, 0.02, 0.02, 0.16, X + 4.1, Y + 1.18, Z - 4.02);      // the sink
    for (let k = 0; k < 4; k++) put(M.plain, new THREE.CylinderGeometry(0.11, 0.11, 0.012, 10).translate(X + 3.55, Y + 0.95 + k * 0.014, Z - 3.85), WHITE); slab(INK, 0.24, 0.34, 0.26, X + 5.1, Y + 0.94, Z - 3.9); slab(CHROME, 0.2, 0.05, 0.2, X + 5.1, Y + 1.28, Z - 3.9); post(WHITE, 0.035, 0.08, X + 5.1, Y + 0.94, Z - 3.68, 8); // plates, the espresso machine, a cup
    slab(0x7a5a3c, 3.2, 0.7, 0.36, X + 3.4, Y + 1.75, Z - 4.02, M.wood, 1); for (let k = 0; k < 5; k++) slab(0x5a4028, 0.01, 0.66, 0.01, X + 1.9 + k * 0.64, Y + 1.77, Z - 3.835); slab(0xc9cbd2, 0.62, 0.1, 0.4, X + 2.45, Y + 1.6, Z - 4.0);                    // wall cupboards, the hood
    q.window(4.1, -4.19, 0.9, 0.56, 1.3, 0, 0x5a6a8a); for (let k = 0; k < 5; k++) slab(0xe9e2cf, 0.9, 0.015, 0.03, X + 4.1, Y + 1.06 + k * 0.12, Z - 4.17);                                                             // a window over the sink, the blind down
    slab(0xe9e2cf, 0.4, 0.04, 0.4, X + 5.35, Y + 0.94, Z - 2.9); slab(0xe9e2cf, 0.4, 0.04, 0.4, X + 5.36, Y + 0.98, Z - 2.88); slab(0x8a5a2a, 0.3, 0.3, 0.2, X + 5.4, Y + 0.94, Z - 1.6); for (let k = 0; k < 3; k++) post(0x2f7d46, 0.035, 0.28, X + 5.38, Y + 0.94, Z - 2.25 + k * 0.12, 6); // more boxes, a paper bag, wine
    q.block(0x7a5a3c, 0.5, 1.05, 2.0, 0.55, -3.2, M.wood, 1); slab(0x2a2a30, 0.62, 0.04, 2.1, X + 0.5, Y + 1.05, Z - 3.2);                                                                                          // the breakfast bar
    for (const bz of [-3.7, -2.7]) { post(CHROME, 0.025, 0.72, X - 0.1, Y, Z + bz, 6); post(CHROME, 0.16, 0.02, X - 0.1, Y, Z + bz, 10); post(0x8a1c2a, 0.19, 0.07, X - 0.1, Y + 0.72, Z + bz, 12); } collide(X - 0.1, Z - 3.2, 0.4, 1.4, 0.8);
    slab(0x23232b, 0.16, 0.05, 0.22, X + 0.5, Y + 1.09, Z - 2.5); slab(0x7dffb0, 0.05, 0.012, 0.03, X + 0.5, Y + 1.14, Z - 2.45, M.glow); slab(0xf2c230, 0.3, 0.012, 0.22, X + 0.5, Y + 1.09, Z - 3.6);              // the answering machine; the racing form
    // ----- By the door -----
    slab(0x4a4038, 1.0, 0.012, 0.6, X + 1.2, Y + 0.006, Z + 3.6); slab(OAK, 0.9, 0.04, 0.24, X - 0.1, Y + 1.0, Z + 4.05, M.wood, 1); post(0x8a8d96, 0.1, 0.05, X - 0.1, Y + 1.04, Z + 4.05, 10);                            // a mat; a shelf with a bowl for the keys
    slab(OAK, 1.0, 0.05, 0.04, X + 2.2, Y + 1.75, Z + 4.17, M.wood, 1); for (let k = 0; k < 3; k++) { slab(CHROME, 0.03, 0.03, 0.08, X + 1.85 + k * 0.35, Y + 1.74, Z + 4.12); slab([0x1a1a1e, 0x3a2a1c, 0x2c3a5a][k], 0.3, 0.75, 0.1, X + 1.85 + k * 0.35, Y + 0.95, Z + 4.08); } // three jackets on hooks
    // ----- The bedroom -----
    q.block(0x2a2018, 2.1, 0.34, 1.7, -4.6, 2.7); slab(0x121216, 2.0, 0.14, 1.6, X - 4.6, Y + 0.34, Z + 2.7); slab(0x8a1c2a, 1.2, 0.05, 1.62, X - 4.2, Y + 0.48, Z + 2.7); for (const s2 of [-1, 1]) slab(WHITE, 0.4, 0.12, 0.6, X - 5.35, Y + 0.48, Z + 2.7 + s2 * 0.4); slab(0x2a2018, 0.1, 1.0, 1.8, X - 5.62, Y, Z + 2.7); // the bed: black sheets
    q.block(0x2a2018, 0.45, 0.5, 0.45, -5.4, 1.4); post(CHROME, 0.015, 0.3, X - 5.4, Y + 0.5, Z + 1.4, 5); put(M.glow, new THREE.CylinderGeometry(0.09, 0.14, 0.2, 10).translate(X - 5.4, Y + 0.9, Z + 1.4), 0xffc890); slab(0x7dffb0, 0.16, 0.07, 0.08, X - 5.38, Y + 0.5, Z + 1.56, M.glow); // lamp, clock radio
    post(CHROME, 0.02, 1.75, X - 1.55, Y, Z + 1.7, 5); post(CHROME, 0.02, 1.75, X - 1.55, Y, Z + 3.9, 5); slab(CHROME, 0.03, 0.03, 2.2, X - 1.55, Y + 1.72, Z + 2.8); for (let k = 0; k < 8; k++) slab([0x1a1a1e, 0x8a1c2a, 0x2c3a5a, 0xf4f4f0, 0x3a2a1c, 0x23232b, 0x49e0d0, 0xe9e2cf][k], 0.42, 0.85 + (k % 3) * 0.12, 0.2, X - 1.62, Y + 0.84 - (k % 3) * 0.12, Z + 1.85 + k * 0.27); collide(X - 1.62, Z + 2.8, 0.5, 2.3, 1.8); // a rail of leather and track suits
    for (let k = 0; k < 5; k++) slab([0xd8342c, WHITE, 0xf2c230, INK, 0x2f56c8][k], 0.34, 0.13, 0.22, X - 2.4 + (k % 2) * 0.03, Y + Math.floor(k / 2) * 0.13, Z + 4.02 - (k % 2 ? 0 : 0) ); slab(0xb9c8d8, 0.7, 1.5, 0.03, X - 3.6, Y + 0.4, Z + 4.18); slab(OAK, 0.78, 1.58, 0.02, X - 3.6, Y + 0.36, Z + 4.19); // shoe boxes; a long mirror
    put(M.plain, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6).rotateZ(Math.PI / 2).translate(X - 2.6, Y + 0.18, Z + 1.5), 0x8a8d96); for (const s2 of [-1, 1]) for (let k = 0; k < 2; k++) put(M.plain, new THREE.CylinderGeometry(0.18 - k * 0.04, 0.18 - k * 0.04, 0.05, 12).rotateZ(Math.PI / 2).translate(X - 2.6 + s2 * (0.48 + k * 0.06), Y + 0.18, Z + 1.5), INK); // a barbell
    // ----- The bathroom -----
    slab(TILE, 2.55, 0.012, 2.5, X + 4.4, Y + 0.006, Z + 2.95); for (let k = 0; k < 5; k++) slab(0xb9c8c8, 2.55, 0.014, 0.02, X + 4.4, Y + 0.007, Z + 1.9 + k * 0.5); slab(TILE, 0.03, 1.5, 2.5, X + 5.68, Y, Z + 2.95); slab(TILE, 2.55, 1.5, 0.03, X + 4.4, Y, Z + 4.18);
    slab(WHITE, 0.4, 0.4, 0.5, X + 5.3, Y, Z + 2.1); slab(WHITE, 0.16, 0.5, 0.4, X + 5.56, Y + 0.4, Z + 2.1); slab(WHITE, 0.5, 0.14, 0.4, X + 3.45, Y + 0.8, Z + 3.0); post(WHITE, 0.07, 0.8, X + 3.4, Y, Z + 3.0, 8); slab(0xb9c8d8, 0.03, 0.6, 0.45, X + 3.1, Y + 1.3, Z + 3.0); // toilet, basin, mirror
    q.block(WHITE, 1.0, 0.12, 1.0, 5.15, 3.65); post(CHROME, 0.015, 2.1, X + 4.65, Y, Z + 3.15, 5); slab(CHROME, 0.02, 0.02, 1.0, X + 4.65, Y + 2.08, Z + 3.65); slab(0x9fd0f5, 0.02, 1.8, 0.9, X + 4.65, Y + 0.25, Z + 3.7); post(CHROME, 0.012, 0.3, X + 5.6, Y + 1.9, Z + 3.65, 4); // the shower, its curtain
    slab(0x8a1c2a, 0.04, 0.8, 0.5, X + 3.1, Y + 0.7, Z + 3.8); slab(0x3a2a52, 0.5, 0.012, 0.7, X + 4.4, Y + 0.008, Z + 2.9);                                                                                      // a towel, a mat
    q.light(-3.4, 2.4, -1.4, 0xffd9a8, 30, 11); q.light(3.6, 2.6, -2.4, 0xfff0d0, 30, 10); q.light(-4, 2.3, 2.6, 0xffb890, 20, 7); q.light(4.4, 2.5, 2.9, 0xdfeeff, 18, 5);
    for (const [lx, lz] of [[3.6, -2.4], [1.2, 2.6]]) { put(M.glow, new THREE.SphereGeometry(0.12, 8, 6).translate(X + lx, Y + 2.86, Z + lz), 0xfff2c0); post(CHROME, 0.14, 0.03, X + lx, Y + 2.95, Z + lz, 10); }
    Object.assign(q, { couch: { x: X - 2.62, y: Y, z: Z - 1.3, h: -Math.PI / 2 }, tv: { x: X - 5.35, z: Z - 1.8 }, drawer: { x: X + 3.4, z: Z - 3.05 }, deskAt: { x: X - 1.4, z: Z - 2.6 }, bed: { x: X - 4.6, z: Z + 2.7 } });
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
    { // The office, as forty years of a family running it have left it: panelling, a rate board, the register, a fan, the machine for ice
      const WOOD = 0x6a4a34, BRASS = 0xd9a520;
      const worn = texture(64, 64, (c, w) => { c.fillStyle = '#7a5a4a'; c.fillRect(0, 0, w, w); c.fillStyle = '#8a6a56'; for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) if ((k + j) % 2) c.fillRect(k * 16 + 3, j * 16 + 3, 10, 10); c.fillStyle = '#6a4c3e'; for (let n = 0; n < 80; n++) c.fillRect((n * 37) % w, (n * 59) % w, 2, 1); });
      worn.repeat.set(7, 5.5); { const m = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 7.4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: worn })); m.position.set(q.X, q.Y + 0.004, q.Z); scene.add(m); }
      for (const s2 of [-1, 1]) { slab(WOOD, 9.4, 1.1, 0.04, q.X, q.Y, q.Z + s2 * 3.68, M.wood, 2); slab(WOOD, 0.04, 1.1, 7.4, q.X + s2 * 4.68, q.Y, q.Z, M.wood, 2); }
      sign(['SINGLE  $29', 'DOUBLE  $39', 'WEEKLY RATES · ASK'], q.X + 2.2, q.Y + 2.3, q.Z - 3.84, 0, { w: 2.2, h: 1.1, color: '#f4f4f0', bg: '#1f3a2c', size: 0.5, glow: false });
      slab(0x23232b, 0.5, 0.36, 0.4, q.X - 2.2, q.Y + 1.13, q.Z - 2.4); slab(0x7dffb0, 0.3, 0.1, 0.02, q.X - 2.2, q.Y + 1.4, q.Z - 2.19, M.glow); for (let n = 0; n < 9; n++) slab(0xe9e2cf, 0.07, 0.03, 0.07, q.X - 2.36 + (n % 3) * 0.1, q.Y + 1.2 + Math.floor(n / 3) * 0.06, q.Z - 2.2); // the register
      slab(0x3a2418, 0.5, 0.05, 0.36, q.X + 0.4, q.Y + 1.13, q.Z - 2.3); slab(0xf1ece0, 0.44, 0.02, 0.3, q.X + 0.4, q.Y + 1.18, q.Z - 2.3); slab(0x16161c, 0.012, 0.012, 0.16, q.X + 0.55, q.Y + 1.2, q.Z - 2.25);                                               // the book everybody signs, and the pen on its chain
      for (let n = 0; n < 12; n++) slab([0x49e0d0, 0xff8a5c, 0xffe066, 0xf4f4f0][n % 4], 0.12, 0.2, 0.02, q.X + 2.2 + (n % 6) * 0.15, q.Y + 1.2 + Math.floor(n / 6) * 0.24, q.Z - 2.75); slab(WOOD, 1, 0.5, 0.06, q.X + 2.55, q.Y + 1.13, q.Z - 2.8, M.wood, 1);   // cards of the beach
      slab(0xf4f4f0, 0.9, 1.5, 0.8, q.X - 4.2, q.Y, q.Z - 0.6); slab(0x9fd0f5, 0.03, 0.5, 0.6, q.X - 3.74, q.Y + 0.8, q.Z - 0.6, M.glow); sign('ICE', q.X - 3.74, q.Y + 1.3, q.Z - 0.6, Math.PI / 2, { w: 0.6, h: 0.24, color: '#2f56c8', bg: '#f4f4f0', size: 0.8, glow: false }); collide(q.X - 4.2, q.Z - 0.6, 1, 0.9, 1.5);
      slab(0xd8342c, 0.8, 1.8, 0.7, q.X - 4.25, q.Y, q.Z + 0.5); slab(0xfff2c0, 0.03, 1, 0.5, q.X - 3.84, q.Y + 0.6, q.Z + 0.5, M.glow); collide(q.X - 4.25, q.Z + 0.5, 0.9, 0.8, 1.8);
      q.block(WOOD, 0.9, 0.42, 0.5, -1.6, 2.6, M.wood, 1); for (let n = 0; n < 3; n++) slab([0xd8342c, 0xf4f4f0, 0x2f56c8][n], 0.22, 0.012, 0.3, q.X - 1.85 + n * 0.25, q.Y + 0.42 + n * 0.012, q.Z + 2.6); put(M.plain, new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10).translate(q.X - 1.3, q.Y + 0.44, q.Z + 2.7), 0x8d8a8e);
      put(M.plain, new THREE.CylinderGeometry(0.22, 0.22, 0.04, 18).rotateX(Math.PI / 2).translate(q.X - 0.6, q.Y + 2.75, q.Z - 3.84), 0xf1ece0); put(M.plain, new THREE.TorusGeometry(0.22, 0.02, 4, 18).translate(q.X - 0.6, q.Y + 2.75, q.Z - 3.82), 0x3a2418);
      slab(BRASS, 0.4, 0.5, 0.03, q.X + 4.66, q.Y + 1.7, q.Z - 1); slab(0xf1ece0, 0.32, 0.42, 0.035, q.X + 4.65, q.Y + 1.74, q.Z - 1); slab(0xf4f4f0, 0.03, 0.5, 0.4, q.X + 4.67, q.Y + 1.6, q.Z + 0.6); for (let n = 0; n < 9; n++) slab(0x23232b, 0.035, 0.03, 0.03, q.X + 4.66, q.Y + 1.66 + (n % 3) * 0.1, q.Z + 0.5 + Math.floor(n / 3) * 0.1);
      for (let n = 0; n < 9; n++) { post(BRASS, 0.012, 0.16, q.X + 3.5 + (n - 4) * 0.07, q.Y + 1.42, q.Z - 3.7, 4); } slab(BRASS, 0.7, 0.03, 0.08, q.X + 3.5, q.Y + 1.38, q.Z - 3.7); post(BRASS, 0.03, 0.12, q.X + 3.5, q.Y + 1.26, q.Z - 3.7, 6);                    // on the shelf behind the desk: nine branches
      slab(0x3a2418, 1, 2.2, 0.06, q.X - 3.2, q.Y, q.Z - 3.84, M.wood, 1); sign('PRIVATE', q.X - 3.2, q.Y + 1.8, q.Z - 3.78, 0, { w: 0.7, h: 0.18, color: '#f4f4f0', bg: '#3a2418', size: 0.7, glow: false });
      sign('VACANCY', q.X + 2, q.Y + 2.1, q.Z + 3.66, Math.PI, { w: 1.5, h: 0.36, color: '#ff5fd2', bg: '#16161c', size: 0.78 });
      slab(0xd8342c, 0.14, 0.44, 0.14, q.X + 4.6, q.Y + 0.6, q.Z + 1.9); post(0x8a8d96, 0.14, 0.6, q.X - 0.4, q.Y, q.Z + 3.3, 8); post(0x23232b, 0.16, 0.04, q.X - 0.4, q.Y + 0.6, q.Z + 3.3, 8);
      const fan = new THREE.Group(); for (let n = 0; n < 4; n++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.18).translate(0.6, 0, 0), new THREE.MeshLambertMaterial({ color: 0x5a3d2b })); b.rotation.y = n * Math.PI / 2; fan.add(b); }
      fan.position.set(q.X, q.Y + 2.95, q.Z + 0.4); scene.add(fan); post(BRASS, 0.05, 0.22, q.X, q.Y + 2.98, q.Z + 0.4, 8); updaters.push(t => { fan.rotation.y = t * 1.7; });
      q.lights.length = 0; q.light(0, 2.8, -0.6, 0xffe2b8, 36, 11); q.light(-3, 2.6, 2, 0xffd9a8, 16, 7);
    }
  }
  if (LA) { // The Regent's lobby: a long desk, two lifts, sofas round low tables, a carpet with a pattern nobody chose
    const q = rooms.HOTEL = room(24, 14, 4.8, { floor: M.gravel, floorTint: 0x5a3a52, wallTint: 0xf2e6d2, ceil: 0xf6f1e6, door: 0x1a242c });
    slab(0xd9a520, 20, 0.012, 0.3, q.X, q.Y + 0.005, q.Z + 1); slab(0xd9a520, 20, 0.012, 0.3, q.X, q.Y + 0.005, q.Z - 2);
    counter(q, -6, -5, 9, 0x3a2418, 0); slab(0xd9a520, 9.2, 0.05, 0.9, q.X - 6, q.Y + 1.06, q.Z - 5); ball(0xd9a520, 0.08, q.X - 4, q.Y + 1.16, q.Z - 4.8);
    slab(0x3a2418, 9, 2.4, 0.1, q.X - 6, q.Y + 1.4, q.Z - 6.84, M.wood, 2); for (let n = 0; n < 24; n++) slab(n % 5 ? 0xd9a520 : 0x3a2418, 0.12, 0.16, 0.04, q.X - 9.6 + (n % 12) * 0.62, q.Y + 2.4 + Math.floor(n / 12) * 0.5, q.Z - 6.78); // the keys
    for (const lx of [5, 8]) { slab(0xc9cbd2, 2, 2.9, 0.12, q.X + lx, q.Y, q.Z - 6.82); slab(0x1c1c22, 0.04, 2.9, 0.14, q.X + lx, q.Y, q.Z - 6.8); slab(0xffe066, 0.5, 0.16, 0.05, q.X + lx, q.Y + 3.1, q.Z - 6.8, M.glow); }
    sign('LIFTS', q.X + 6.5, q.Y + 3.7, q.Z - 6.84, 0, { w: 2.4, h: 0.6, color: '#f4f4f0', bg: '#1c2740', size: 0.8, glow: false });
    slab(0xc8312a, 0.12, 0.34, 0.28, q.X - 11.62, q.Y + 1.3, q.Z + 1.5); slab(0xf4f4f0, 0.14, 0.08, 0.18, q.X - 11.6, q.Y + 1.4, q.Z + 1.5);           // the fire alarm
    for (const [x, z] of [[-3, 2.6], [4, 2.6], [9, -1]]) { // a sofa either side of a low table
      q.block(0x8a5a44, 1.2, 0.42, 1.2, x, z, M.wood, 1); ball(0xc8312a, 0.14, q.X + x, q.Y + 0.56, q.Z + z);
      for (const sgn of [-1, 1]) { slab(0x2f4a44, 0.8, 0.45, 2, q.X + x + sgn * 1.5, q.Y, q.Z + z); slab(0x27403b, 0.2, 0.95, 2, q.X + x + sgn * 1.95, q.Y, q.Z + z); collide(q.X + x + sgn * 1.9, q.Z + z, 0.3, 2, 1); }
    }
    q.sofas = [[-3, 2.6], [4, 2.6], [9, -1]].flatMap(([x, z]) => [-1, 1].map(sgn => ({ x: q.X + x + sgn * 1.45, y: q.Y, z: q.Z + z, h: -sgn * Math.PI / 2 })));
    for (const x of [-11, 11]) { post(0xb9a58a, 0.4, 0.8, q.X + x, q.Y, q.Z + 5.6, 10); put(M.plain, new THREE.ConeGeometry(0.7, 2.4, 7).translate(q.X + x, q.Y + 2, q.Z + 5.6), 0x2c5a34); }
    for (const [x, z] of [[-5, 0], [5, 0]]) { post(0xd9a520, 0.02, 0.7, q.X + x, q.Y + 4.1, q.Z + z, 4); put(M.glow, new THREE.SphereGeometry(0.55, 10, 6).scale(1, 0.5, 1).translate(q.X + x, q.Y + 3.9, q.Z + z), 0xffe8c0); }
    for (const x of [-7, 7]) q.window(x, 6.72, 6, 3, 2.4, Math.PI, 0x2a3350);
    q.light(-5, 4.2, 0, 0xffe2b0, 120, 22); q.light(6, 4.2, -1, 0xffe2b0, 110, 22);
    clerk(q, -6, -5.9, 0, { jacket: 0x8a1c2a, shirt: 0xf4f4f4, tie: 0x16161c, tucked: true, pants: 0x16161c });
    q.lift = q.at(5, -5.4); q.alarm = q.at(-10.6, 1.5);
  }
  if (LA) { // The seventeenth floor: a corridor, a door, and a room with the curtains open on the runway lights
    const q = rooms.SUITE = room(16, 10, 3, { floor: M.gravel, floorTint: 0x4a3a52, wallTint: 0xe9e2d2, ceil: 0xf6f1e6, doorX: 6, door: 0xc9cbd2 });
    q.block(0xe9e2d2, 9.6, 3, 0.2, -3.2, 1.2, M.gravel, 3); q.block(0xe9e2d2, 5, 3, 0.2, 5.5, 1.2, M.gravel, 3);                                 // the corridor wall, with the room's door open in it
    slab(0x3a2418, 0.1, 2.2, 1.2, q.X + 1.72, q.Y, q.Z + 0.56); sign('1709', q.X + 2.4, q.Y + 2.5, q.Z + 1.32, 0, { w: 0.9, h: 0.4, color: '#d9a520', bg: '#3a2418', size: 0.9, glow: false });
    for (let n = 0; n < 4; n++) { slab(0x3a2418, 1, 2.2, 0.06, q.X - 6.5 + n * 2.6, q.Y, q.Z + 4.68); ball(0xffd9a8, 0.1, q.X - 5.2 + n * 2.6, q.Y + 2.3, q.Z + 4.6, M.glow); }  // other doors, other lamps
    slab(0x8a1c2a, 15, 0.012, 1.6, q.X, q.Y + 0.005, q.Z + 3);
    q.block(0xf4f4f0, 2.2, 0.55, 2, -5.6, -2.8, M.plain, 0); slab(0x8a2f3a, 2.2, 0.1, 1.3, q.X - 5.6, q.Y + 0.55, q.Z - 2.5); slab(0x3a2418, 2.4, 1.2, 0.12, q.X - 5.6, q.Y, q.Z - 3.9);  // the bed
    q.block(0x3a2418, 1.6, 0.7, 0.5, 4.6, -1.6, M.wood, 1); q.block(0x1c1c22, 0.9, 0.7, 0.5, 4.6, -1.6, M.plain, 0, 0.7); q.glowPanel(0x9fd0f5, 0.7, 0.5, 4.6, -1.34, 1.05); // the television
    q.block(0x8a5a44, 0.9, 0.72, 0.9, -1, -3.6, M.wood, 1); post(0x2f5a3f, 0.045, 0.3, q.X - 1, q.Y + 0.72, q.Z - 3.6, 6); slab(0xf4f4f0, 0.5, 0.03, 0.4, q.X - 0.8, q.Y + 0.73, q.Z - 3.4); // room service
    q.glowPanel(0x1c2a52, 9, 2, -1, -4.84, 1.6); for (let n = 0; n < 9; n++) ball(n % 3 ? 0x4f8cff : 0xfff6e0, 0.05, q.X - 5 + n, q.Y + 0.9 + (n % 2) * 0.12, q.Z - 4.8, M.glow); // the window: the runway
    for (const sx of [-5.8, 3.8]) slab(0x8a1c2a, 0.5, 2.6, 0.1, q.X + sx, q.Y + 0.2, q.Z - 4.78);
    q.light(-2, 2.6, -2, 0xffd9a8, 36, 12); q.light(0, 2.6, 3, 0xffe8c8, 30, 12);
    q.gap = q.at(2.3, 2.4); q.inroom = q.at(2.3, -0.4); q.bed = q.at(-2.6, -2); q.window0 = q.at(-1, -3);
  }
  if (!LA) { // Room six at the motor lodge: the beds stood against the wall, a felt table under one hanging lamp, a cooler, the curtains shut
    const q = rooms.CARDROOM = room(9, 8, 3, { floor: M.gravel, floorTint: 0x7a5a4a, wallTint: 0xffd3a1, ceil: 0xe9e2cf });
    const cx = -0.6, cz = -0.9;
    put(M.plain, new THREE.CylinderGeometry(1.2, 1.2, 0.08, 20).translate(q.X + cx, q.Y + 0.76, q.Z + cz), 0x1f6b4a); put(M.plain, new THREE.CylinderGeometry(1.26, 1.26, 0.05, 20).translate(q.X + cx, q.Y + 0.74, q.Z + cz), 0x3a2418);
    post(0x3a2418, 0.12, 0.74, q.X + cx, q.Y, q.Z + cz, 8); collide(q.X + cx, q.Z + cz, 2, 2, 0.9);
    q.seats = [-2.3, -1.15, 0, 1.15, 2.3].map(a => ({ x: q.X + cx - Math.sin(a) * 1.8, y: q.Y, z: q.Z + cz - Math.cos(a) * 1.8, h: a }));
    for (const st of [...q.seats, { x: q.X + cx, z: q.Z + cz + 1.8, h: Math.PI }]) chairAt(st, q.Y, 0x8a5a44);
    for (let n = 0; n < 5; n++) { const a = [-2.3, -1.15, 0, 1.15, 2.3][n], sx = q.X + cx - Math.sin(a) * 0.75, sz = q.Z + cz - Math.cos(a) * 0.75;
      for (let k = 0; k < 3; k++) post([0xd8342c, 0x2f56c8, 0x16161c][(n + k) % 3], 0.05, 0.04 + ((n * 3 + k) % 4) * 0.03, sx + k * 0.12 - 0.12, q.Y + 0.8, sz, 8);
      slab(0xf4f4f0, 0.14, 0.01, 0.2, sx + 0.3, q.Y + 0.81, sz + 0.1); }
    for (let k = 0; k < 9; k++) slab(k % 2 ? 0x4fd36a : 0xe9e2cf, 0.26, 0.02, 0.13, q.X + cx + (k % 3) * 0.12 - 0.12, q.Y + 0.81 + k * 0.012, q.Z + cz + (k % 2) * 0.1); // the pot
    post(0x1c1c22, 0.012, 0.9, q.X + cx, q.Y + 2.1, q.Z + cz, 4); put(M.glow, new THREE.ConeGeometry(0.34, 0.3, 12, 1, true).translate(q.X + cx, q.Y + 2, q.Z + cz), 0xffc27a);
    q.block(0x8a2f3a, 0.5, 2, 3.2, 4, -1.6); q.block(0xe9e2cf, 0.3, 2, 3, 3.6, -1.6);                 // the mattresses, stood on end
    q.block(0x3a2418, 1.4, 0.7, 0.5, -3.4, -3.5, M.wood, 1); q.block(0x1c1c22, 0.8, 0.6, 0.5, -3.4, -3.5, M.plain, 0, 0.7); q.glowPanel(0x9fd0f5, 0.6, 0.42, -3.4, -3.24, 1); // the television, on with the sound off
    q.block(0x2f56c8, 0.9, 0.5, 0.5, 3.4, 2.4); slab(0xf4f4f0, 0.94, 0.08, 0.54, q.X + 3.4, q.Y + 0.5, q.Z + 2.4); for (let n = 0; n < 4; n++) post(0x8a5a2a, 0.035, 0.22, q.X + 3 + n * 0.2, q.Y + 0.58, q.Z + 2.4, 6); // the cooler
    slab(0x8a2f3a, 3.2, 1.8, 0.08, q.X - 2, q.Y + 1, q.Z + 3.68); slab(0x3a2418, 3.4, 0.08, 0.1, q.X - 2, q.Y + 2.85, q.Z + 3.66); // the curtains, shut
    slab(0xe9e2cf, 0.9, 0.7, 0.04, q.X + 1, q.Y + 1.7, q.Z - 3.84, M.plain); slab(0x49a0d0, 0.8, 0.6, 0.02, q.X + 1, q.Y + 1.75, q.Z - 3.8); // a print of a sailboat
    q.light(cx, 2.5, cz, 0xffd9a8, 44, 10);
    q.table = q.at(cx, cz); q.pot = q.at(cx, cz + 1.9);
  }
  if (!LA) { // The Manor's ballroom: a top table across the end of the room, round tables in white cloths, chandeliers, drapes, a parquet square to dance on
    const q = rooms.BANQUET = room(26, 18, 5.2, { floor: M.gravel, floorTint: 0x7a2f3a, wallTint: 0xf6eedc, ceil: 0xf6f1e6, door: 0x3a2418 });
    slab(0xc79a6a, 7, 0.02, 6, q.X, q.Y + 0.005, q.Z + 3.4, M.wood, 1);                                // the dance floor
    slab(0xf4f4f0, 13, 0.78, 1.1, q.X, q.Y, q.Z - 6.3); slab(0xffffff, 13.2, 0.03, 1.3, q.X, q.Y + 0.78, q.Z - 6.3); collide(q.X, q.Z - 6.3, 13, 1.1, 0.9); // the top table
    q.head = [-5, -3, -1, 1, 3, 5].map(x => ({ x: q.X + x, y: q.Y, z: q.Z - 7.25, h: 0 }));
    for (const st of q.head) chairAt(st, q.Y, 0xd9a520);
    for (let n = 0; n < 6; n++) { const x = q.X - 5 + n * 2; put(M.plain, new THREE.CylinderGeometry(0.16, 0.14, 0.02, 12).translate(x, q.Y + 0.82, q.Z - 6.4), 0xffffff); post(0x8a1c2a, 0.035, 0.26, x + 0.3, q.Y + 0.81, q.Z - 6.1, 6); post(0xe9e2cf, 0.03, 0.12, x - 0.3, q.Y + 0.81, q.Z - 6.15, 6); }
    for (const x of [-2, 2]) { post(0xd9a520, 0.03, 0.4, q.X + x, q.Y + 0.81, q.Z - 6.3, 6); ball(0xc8312a, 0.2, q.X + x, q.Y + 1.32, q.Z - 6.3); ball(0xffffff, 0.14, q.X + x + 0.16, q.Y + 1.26, q.Z - 6.2); } // flowers
    q.rounds = [];
    for (const [x, z] of [[-8, -1.5], [8, -1.5], [-8, 4.2], [8, 4.2], [-3.2, -2.4], [3.2, -2.4]]) {
      put(M.plain, new THREE.CylinderGeometry(1.15, 1.2, 0.76, 18).translate(q.X + x, q.Y + 0.38, q.Z + z), 0xf4f4f0); collide(q.X + x, q.Z + z, 1.9, 1.9, 0.9);
      ball(0xc8312a, 0.16, q.X + x, q.Y + 0.98, q.Z + z); post(0xd9a520, 0.02, 0.2, q.X + x, q.Y + 0.76, q.Z + z, 5);
      const seats = [0, 1, 2, 3].map(k => { const a = k * Math.PI / 2 + Math.PI / 4; return { x: q.X + x - Math.sin(a) * 1.65, y: q.Y, z: q.Z + z - Math.cos(a) * 1.65, h: a }; });
      for (const st of seats) { chairAt(st, q.Y, 0xd9a520); put(M.plain, new THREE.CylinderGeometry(0.15, 0.13, 0.02, 10).translate(st.x + Math.sin(st.h) * 0.85, q.Y + 0.78, st.z + Math.cos(st.h) * 0.85), 0xffffff); }
      q.rounds.push({ x: q.X + x, z: q.Z + z, seats });
    }
    for (const [x, z] of [[-6, -2], [6, -2], [-6, 4], [6, 4], [0, 1]]) { post(0xd9a520, 0.02, 0.9, q.X + x, q.Y + 4.3, q.Z + z, 4); put(M.glow, new THREE.SphereGeometry(0.5, 10, 6).scale(1, 0.55, 1).translate(q.X + x, q.Y + 4.1, q.Z + z), 0xffe8c0); for (let k = 0; k < 6; k++) ball(0xfff6e0, 0.07, q.X + x + Math.sin(k) * 0.62, q.Y + 3.9, q.Z + z + Math.cos(k) * 0.62, M.glow); } // chandeliers
    for (const sx of [-1, 1]) for (const z of [-6, -1.5, 3, 7]) { slab(0x8a1c2a, 0.12, 4.2, 1.5, q.X + sx * 12.62, q.Y + 0.4, q.Z + z); slab(0xd9a520, 0.16, 0.14, 1.7, q.X + sx * 12.6, q.Y + 4.5, q.Z + z); ball(0xffd9a8, 0.12, q.X + sx * 12.5, q.Y + 2.6, q.Z + z + 2.2, M.glow); } // drapes and sconces
    slab(0x8a1c2a, 14, 3.4, 0.1, q.X, q.Y + 1, q.Z - 8.64); sign(['SALUTE', 'CORRADO SOPRANO'], q.X, q.Y + 3.4, q.Z - 8.56, 0, { w: 8, h: 1.5, color: '#f6e7b4', bg: '#8a1c2a', size: 0.62, glow: false }); // the banner behind the top table
    q.block(0x16161c, 2.6, 1, 1.5, -10.4, 7, M.plain, 0); slab(0xf4f4f0, 2.2, 0.04, 0.3, q.X - 10.4, q.Y + 1, q.Z + 6.5); q.block(0x3a2418, 3, 1.1, 0.8, 9.6, 7.6, M.wood, 1); for (let n = 0; n < 8; n++) post(BOTTLES[n % 6], 0.05, 0.32, q.X + 8.4 + n * 0.34, q.Y + 1.1, q.Z + 7.6, 6); // a piano, and the bar
    q.light(0, 4.4, -4, 0xffe2b0, 150, 26); q.light(-6, 4.4, 4, 0xffd9a8, 110, 22); q.light(6, 4.4, 4, 0xffd9a8, 110, 22);
    q.serve = q.head.map(st => ({ x: st.x, z: q.Z - 5.2 }));                                          // where a waiter stands to pour, across the table from each chair
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

  // ----- Los Angeles has its own rooms: the same kinds of place, laid out and dressed differently -----
  if (LA) {
    const BOOKS = [0x8a1c1c, 0x1f3a2c, 0x2c3a5a, 0xd9c7a0, 0x5a3320, 0x16161c, 0xb5523b];
    { // a cocktail lounge: long and narrow, the bar down the west wall, red booths down the east, a little stage at the far end
      const q = rooms.BAR = room(12, 18, 3.6, { floor: M.gravel, floorTint: 0x3a2a34, floorScale: 4, wall: M.wood, wallTint: 0x2a2030, ceil: 0x14101a });
      counter(q, -4.2, -2, 11, 0x1c1418, Math.PI / 2);
      q.block(0x14080f, 0.3, 2.4, 11, -5.6, -2, M.plain, 0, 1); q.glowPanel(0x4a6fd0, 10.4, 0.8, -5.42, -2, 2.4, Math.PI / 2);
      for (let n = 0; n < 20; n++) post([0xd9a520, 0x6fb0ff, 0xc8312a, 0xe9e2cf][n % 4], 0.05, 0.3 + (n % 3) * 0.05, q.X - 5.4, q.Y + 1.5 + (n % 2) * 0.7, q.Z - 7 + n * 0.52, 6);
      for (let n = 0; n < 7; n++) { post(0xc9cbd2, 0.04, 0.75, q.X - 3.1, q.Y, q.Z - 6.6 + n * 1.5); post(0x1c1c22, 0.22, 0.08, q.X - 3.1, q.Y + 0.75, q.Z - 6.6 + n * 1.5, 10); }
      for (let n = 0; n < 4; n++) { const z = -6 + n * 3.4; // a booth: two benches with high backs, a table, a candle
        for (const s of [-1, 1]) { slab(0x8a1c2a, 1.1, 0.46, 0.62, q.X + 5, q.Y, q.Z + z + s * 0.92); slab(0x6a1420, 1.1, 1.2, 0.14, q.X + 5, q.Y, q.Z + z + s * 1.3); collide(q.X + 5, q.Z + z + s * 1.25, 1.1, 0.3, 1.2); }
        slab(0x1c1418, 0.9, 0.06, 0.8, q.X + 5, q.Y + 0.72, q.Z + z); post(0x1c1418, 0.05, 0.72, q.X + 5, q.Y, q.Z + z); collide(q.X + 5, q.Z + z, 0.8, 0.7, 0.8); ball(0xffb060, 0.06, q.X + 5, q.Y + 0.84, q.Z + z, M.glow); }
      for (let n = 0; n < 7; n++) { put(M.plain, new THREE.CylinderGeometry(0.035, 0.03, 0.11, 8).translate(q.X - 3.9, q.Y + 1.19, q.Z - 6.4 + n * 1.5), 0xcfe8ff); if (n % 2) put(M.plain, new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10).translate(q.X - 4, q.Y + 1.14, q.Z - 6 + n * 1.5), 0x8d8a8e); } // glasses and ashtrays along the bar
      q.block(0x14080f, 5, 0.35, 2.6, 1.5, -7.3, M.plain, 0); post(0xc9cbd2, 0.02, 1.4, q.X + 1.5, q.Y + 0.35, q.Z - 7, 5); ball(0x1c1c22, 0.06, q.X + 1.5, q.Y + 1.8, q.Z - 7); // the stage and its microphone
      q.glowPanel(0xff3b4a, 2.4, 0.5, 1.5, -8.82, 2.6); q.glowPanel(0x6fb0ff, 0.5, 0.9, 5.82, 5.5, 2.2, -Math.PI / 2);
      sign(['COCKTAILS', 'LIVE JAZZ FRI · SAT'], q.X + 3.6, q.Y + 2.9, q.Z - 8.84, 0, { w: 3, h: 1, color: '#6fb0ff', bg: '#14101a', size: 0.6 });
      q.block(0x8d8a8e, 0.8, 1.6, 0.6, -5, 7.6); // the cigarette machine
      q.light(-3, 3.2, -2, 0x6f8fff, 40, 14); q.light(4, 3.2, 0, 0xff5a4a, 30, 12); q.light(1.5, 3.2, -6.5, 0xffe2a6, 26, 9); q.light(-4.4, 2.3, -1.4, 0xffd9a8, 16, 6); // and the lamps over the bar, on the faces
      clerk(q, -5, -2, Math.PI / 2, { shirt: 0x16161c, open: undefined, tie: 0x8a1c1c });
      q.person(pick(PED_ROOM_LOOKS), -3.1, -5.1, -Math.PI / 2); q.person(pick(OLD_LOOKS), 5, 1.32, Math.PI, 'sit');
      q.stools = [0, 1, 2, 3, 4, 5, 6].map(n => ({ x: q.X - 3.1, y: q.Y + 0.27, z: q.Z - 6.6 + n * 1.5 })); // for scenes: sit facing west, 0.2 up
    }
    { // a coffee shop out of the fifties: an island counter with stools all round, booths under the windows, orange and teal
      const q = rooms.DINER = room(22, 12, 3.6, { floor: M.paver, floorTint: 0xd9c7a0, wallTint: 0x8fd0c8, ceil: 0xfff1c9 });
      for (const [x, z, w, d] of [[0, -3.4, 9, 0.8], [0, -0.2, 9, 0.8], [-4.1, -1.8, 0.8, 2.4], [4.1, -1.8, 0.8, 2.4]]) { q.block(0xf08a3c, w, 1.05, d, x, z, M.plain, 0); slab(0xf4f4f0, w + 0.2, 0.06, d + 0.2, q.X + x, q.Y + 1.05, q.Z + z); }
      for (let n = 0; n < 6; n++) { post(0xc9cbd2, 0.04, 0.7, q.X - 3.3 + n * 1.32, q.Y, q.Z + 0.75); post(0x1f9c8f, 0.22, 0.1, q.X - 3.3 + n * 1.32, q.Y + 0.7, q.Z + 0.75, 10); }
      q.block(0xc9cbd2, 1.2, 1.5, 0.7, -2, -1.8, M.plain, 0); q.block(0xc9cbd2, 0.7, 1.3, 0.6, 2, -1.8, M.plain, 0); q.glowPanel(0xffe066, 0.5, 0.4, 2, -1.48, 1); // the grill hood and the coffee urns inside the island
      for (let n = 0; n < 6; n++) { const sx = q.X - 3.3 + n * 1.32; put(M.plain, new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12).translate(sx, q.Y + 1.12, q.Z - 0.05), 0xf4f4f0); put(M.plain, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8).translate(sx + 0.26, q.Y + 1.15, q.Z - 0.1), 0xf4f4f0); if (n % 2) slab(0xc9cbd2, 0.1, 0.12, 0.14, sx - 0.4, q.Y + 1.11, q.Z - 0.3); } // a setting at every stool
      for (let n = 0; n < 5; n++) { const x = -8.4 + n * 4.2; // booths along the window wall
        for (const s of [-1, 1]) { slab(0x1f9c8f, 0.62, 0.46, 1.6, q.X + x + s * 0.98, q.Y, q.Z + 4.6); slab(0x178a7e, 0.14, 1.15, 1.6, q.X + x + s * 1.36, q.Y, q.Z + 4.6); collide(q.X + x + s * 1.3, q.Z + 4.6, 0.3, 1.6, 1.2); }
        slab(0xf4f4f0, 1, 0.07, 1.5, q.X + x, q.Y + 0.72, q.Z + 4.6); post(0xc9cbd2, 0.05, 0.72, q.X + x, q.Y, q.Z + 4.6); collide(q.X + x, q.Z + 4.6, 0.9, 1.5, 0.8);
        // what is on the table: plates, cups, the ketchup and the napkins
        for (const s of [-1, 1]) { put(M.plain, new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12).translate(q.X + x + s * 0.24, q.Y + 0.77, q.Z + 4.3), 0xf4f4f0); put(M.plain, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8).translate(q.X + x + s * 0.3, q.Y + 0.8, q.Z + 4.85), 0xf4f4f0); }
        slab(0xc8312a, 0.06, 0.16, 0.06, q.X + x, q.Y + 0.76, q.Z + 5.2); slab(0xc9cbd2, 0.1, 0.12, 0.14, q.X + x + 0.12, q.Y + 0.76, q.Z + 5.2);
        if (n !== 2) q.window(x, 5.72, 3.4, 1.8, 1.9, Math.PI, 0xcfe0ff); }
      q.block(0xc9cbd2, 14, 2.2, 0.6, 0, -5.5, M.plain, 0); q.glowPanel(0xffb060, 8, 0.7, 0, -5.18, 1.6); // the kitchen pass
      sign(['COFFEE SHOP', 'BREAKFAST ALL DAY'], q.X - 7.5, q.Y + 2.8, q.Z - 5.84, 0, { w: 4.4, h: 1.2, color: '#ff8a5c', bg: '#14080f', size: 0.6 });
      q.block(0x8a1c1c, 0.9, 1.7, 0.8, 9.8, -4.8); q.glowPanel(0xfff0d0, 0.6, 0.9, 9.8, -4.38, 1); // the pie case
      q.light(0, 3.2, -1.5, 0xfff0d0, 60, 16); q.light(-7, 3.2, 3, 0xffe2a6, 30, 12); q.light(7, 3.2, 3, 0xffe2a6, 30, 12);
      clerk(q, 0, -1.8, 0, { body: 'female', shirt: 0x8fd0c8, sleeves: undefined, tee: true, hair: 0x7a3b1a, hairMesh: 'long' });
      q.till = q.at(0, 1.5);
      q.person(pick(PED_ROOM_LOOKS), 3.3, 0.95, Math.PI); q.person(pick(OLD_LOOKS), -8.4 - 0.98, 4.6, Math.PI / 2, 'sit');
      // For scenes: the stools along the island's south side (sit facing north, 0.2 up), and the second booth's four seats.
      q.stools = [0, 1, 2, 3, 4, 5].map(n => ({ x: q.X - 3.3 + n * 1.32, y: q.Y + 0.27, z: q.Z + 0.75 }));
      q.boothSeats = { west: [0.36, -0.36].map(dz => ({ x: q.X - 4.2 - 0.98, y: q.Y, z: q.Z + 4.6 + dz })), east: [0.36, -0.36].map(dz => ({ x: q.X - 4.2 + 0.98, y: q.Y, z: q.Z + 4.6 + dz })) };
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
      // Four houses the story goes into, each somebody's. They share the bones of the house above (the sofa, the table,
      // the kitchen stand where scenes expect them) and nothing else: the money, the taste and the mess are their own.
      const homeOf = (key, o, extra) => {
        const q = rooms[key] = room(o.w ?? 16, 11, o.h ?? 3.2, { floor: o.floor ?? M.wood, floorTint: o.floorTint, wallTint: o.wall, ceil: o.ceil ?? 0xf6f6f2, doorX: 5 });
        q.glowPanel(o.view, 7, 2.4, -3.5, -5.32, 1.3); for (let n = -1; n <= 1; n++) slab(o.trim, 0.08, 2.5, 0.08, q.X - 3.5 + n * 2.3, q.Y, q.Z - 5.28);
        q.block(o.sofa, 4.6, 0.5, 1.2, -4.2, 0.4); q.block(o.sofa, 1.2, 0.5, 2.6, -6.4, -1.4); q.block(o.sofa, 4.6, 0.5, 0.3, -4.2, 1.05, M.plain, 0, 0.5);
        q.block(o.table, 1.6, 0.4, 0.9, -3.8, -1.6, M.wood, 1); slab(o.rug, 5, 0.02, 3.6, q.X - 4, q.Y + 0.01, q.Z - 1);
        q.block(0x1c1c22, 1.5, 1, 0.5, -3.8, -4.2, M.plain, 0, 0.3); q.glowPanel(o.tv ?? 0x9fd0f5, 1.3, 0.8, -3.8, -3.94, 0.9, Math.PI);
        q.block(o.counter, 3.4, 0.92, 1.2, 3.4, -1.2, M.plain, 0); slab(o.top, 3.5, 0.05, 1.3, q.X + 3.4, q.Y + 0.92, q.Z - 1.2);
        q.block(o.counter, 6, 0.92, 0.7, 4.6, -4.9, M.plain, 0); q.block(o.fridge ?? 0xc9cbd2, 0.9, 2, 0.8, 7.3, -3.6, M.plain, 0);
        q.window(-2, 5.22, 3, 1.4, 1.8, Math.PI, o.glass);
        q.light(-4, 2.9, -1, o.lamp ?? 0xfff0d0, 40, 14); q.light(4, 2.9, -2, 0xfff6e0, 34, 12);
        extra(q);
        return q;
      };
      // A lieutenant's house, which is his wife's: glass, steel, a television that is never off, nothing of his but a jacket on a chair.
      homeOf('JUSTINE', { floor: M.paver, floorTint: 0x8d8a8e, wall: 0xdfe5ea, view: 0x1c2a52, trim: 0x23232b, sofa: 0x3d4658, table: 0x23232b, rug: 0xc9cbd2, counter: 0x23232b, top: 0xc9cbd2, glass: 0x2a3350, lamp: 0xcfe0ff }, q => {
        for (let n = 0; n < 2; n++) slab(0x16161c, 1.6, 1.9, 0.05, q.X + 1.6 + n * 2.4, q.Y + 0.7, q.Z - 5.34); slab(0xd8342c, 0.5, 0.5, 0.03, q.X + 1.8, q.Y + 1.6, q.Z - 5.3, M.plain); slab(0xffe066, 0.7, 0.3, 0.03, q.X + 4.2, q.Y + 1.2, q.Z - 5.3, M.plain); // two big canvases
        q.block(0x8d8a8e, 0.5, 0.9, 0.5, 6.6, 3.6, M.plain, 0); slab(0x16161c, 0.5, 0.8, 0.12, q.X + 6.6, q.Y + 0.9, q.Z + 3.84); slab(0x16161c, 0.46, 0.05, 0.46, q.X + 6.6, q.Y + 0.48, q.Z + 3.6); // a chair with a jacket over it
        post(0xc9cbd2, 0.02, 1.7, q.X - 7, q.Y, q.Z + 3.6, 6); put(M.glow, new THREE.SphereGeometry(0.22, 10, 6).translate(q.X - 7, q.Y + 1.8, q.Z + 3.6), 0xfff6e0);                 // a floor lamp
        for (let n = 0; n < 3; n++) { slab(0x8d8a8e, 0.4, 0.06, 0.4, q.X + 2.4 + n, q.Y + 0.62, q.Z - 0.1); post(0x8a8d96, 0.03, 0.62, q.X + 2.4 + n, q.Y, q.Z - 0.1, 4); }
        slab(0xf4f4f0, 0.5, 0.02, 0.36, q.X + 3, q.Y + 0.98, q.Z - 1.2); post(0x2f5a3f, 0.04, 0.3, q.X + 4.2, q.Y + 0.97, q.Z - 1.3, 6); // a plate under foil, a bottle
      });
      // A financier's house in the hills: white on white, a bar, a wall of the city, art bought by the yard.
      homeOf('VANZANT', { h: 3.6, floor: M.paver, floorTint: 0xf1ede4, wall: 0xf6f4ee, view: 0x24324c, trim: 0xd9a520, sofa: 0xf4f2ee, table: 0xc9cbd2, rug: 0xe9e2cf, counter: 0xf4f4f0, top: 0x23232b, glass: 0x2a3350 }, q => {
        for (let n = 0; n < 12; n++) ball(n % 3 ? 0xffe2a6 : 0xff8a5c, 0.04, q.X - 6.6 + n * 0.56, q.Y + 0.7 + (n % 4) * 0.22, q.Z - 5.26, M.glow);            // the lights of the basin in the glass
        q.block(0x3a2418, 2.6, 1.1, 0.7, 6.4, 3.4, M.wood, 2); for (let n = 0; n < 9; n++) post(BOTTLES[n % 6], 0.045, 0.32, q.X + 5.4 + n * 0.25, q.Y + 1.1, q.Z + 3.4, 6); slab(0xd6ecf5, 2.6, 1.2, 0.06, q.X + 6.4, q.Y + 1.5, q.Z + 3.9, M.glow); // the bar, lit from behind
        for (const [x, hex] of [[1.6, 0x2f56c8], [3.6, 0xd8342c], [5.6, 0xf2c230]]) { slab(0xf4f4f0, 1.3, 1.3, 0.05, q.X + x, q.Y + 1.5, q.Z - 5.34); slab(hex, 0.9, 0.9, 0.03, q.X + x, q.Y + 1.7, q.Z - 5.3, M.plain); }
        post(0xd9a520, 0.3, 1.1, q.X - 7.2, q.Y, q.Z + 3.6, 10); ball(0x1c1c22, 0.34, q.X - 7.2, q.Y + 1.44, q.Z + 3.6);                                        // a thing on a plinth
        slab(0xd9a520, 0.9, 0.03, 0.5, q.X - 3.8, q.Y + 0.41, q.Z - 1.6); for (let n = 0; n < 2; n++) put(M.plain, new THREE.CylinderGeometry(0.05, 0.03, 0.14, 8).translate(q.X - 3.6 + n * 0.2, q.Y + 0.5, q.Z - 1.5), 0xf4f4f0); // a tray, two glasses
        for (let n = 0; n < 3; n++) { slab(0xf4f2ee, 0.4, 0.06, 0.4, q.X + 2.4 + n, q.Y + 0.62, q.Z - 0.1); post(0xd9a520, 0.03, 0.62, q.X + 2.4 + n, q.Y, q.Z - 0.1, 4); }
      });
      // A driver's house: small, kept, a wife's hand everywhere. A calendar, a crucifix, a table laid for two.
      homeOf('TREJO', { floor: M.gravel, floorTint: 0x8a6a5a, wall: 0xf2d9b0, view: 0x4a6a52, trim: 0x8a5a44, sofa: 0xb5523b, table: 0x8a5a44, rug: 0x2f7d46, counter: 0xe9e2cf, top: 0xc79a6a, fridge: 0xe9e2cf, glass: 0xffd9a8 }, q => {
        slab(0xd9a520, 0.08, 0.5, 0.04, q.X + 0.4, q.Y + 2.2, q.Z - 5.34); slab(0xd9a520, 0.3, 0.08, 0.04, q.X + 0.4, q.Y + 2.3, q.Z - 5.34);
        slab(0xf4f4f0, 0.6, 0.8, 0.03, q.X + 5.6, q.Y + 1.7, q.Z - 5.34, M.plain); slab(0xd8342c, 0.6, 0.2, 0.02, q.X + 5.6, q.Y + 2.2, q.Z - 5.32, M.plain);
        q.block(0x8a5a44, 1.3, 0.76, 1.3, 5.5, 2.4, M.wood, 1); slab(0xf4f4f0, 1.4, 0.02, 1.4, q.X + 5.5, q.Y + 0.77, q.Z + 2.4);
        for (const sx of [-1, 1]) { put(M.plain, new THREE.CylinderGeometry(0.16, 0.14, 0.02, 12).translate(q.X + 5.5 + sx * 0.36, q.Y + 0.8, q.Z + 2.4), 0xe9e2cf); chairAt({ x: q.X + 5.5 + sx * 1.05, z: q.Z + 2.4, h: -sx * Math.PI / 2 }, q.Y, 0x8a5a44); }
        for (let n = 0; n < 5; n++) slab(0xe9e2cf, 0.34, 0.44, 0.03, q.X - 6.6 + n * 0.5, q.Y + 1.9, q.Z + 5.32, M.plain);                                      // photographs, in a row
        for (let n = 0; n < 4; n++) ball([0x2f7d46, 0xd8342c, 0xf2c230, 0x2f7d46][n], 0.1, q.X + 2.6 + n * 0.4, q.Y + 1.03, q.Z - 1.2);                         // peppers on the counter
      });
      // A house on a hill full of other people's conversations: receivers, reels, a dish through the window, one armchair.
      homeOf('KELSO', { floor: M.wood, floorTint: 0x6a4a34, wall: 0xd8c8b4, view: 0x8fb6d9, trim: 0x3a2418, sofa: 0x6f5a44, table: 0x3a2418, rug: 0x8a2f3a, counter: 0x6f5a44, top: 0x3a2418, fridge: 0xb9a58a, glass: 0xcfe0ff, tv: 0x4fd36a }, q => {
        q.block(0x23232b, 4.4, 2.2, 0.6, 3.6, 4.4, M.plain, 0);
        for (let n = 0; n < 12; n++) { slab(0x3a3a44, 1, 0.3, 0.05, q.X + 2 + (n % 4) * 1.1, q.Y + 0.4 + Math.floor(n / 4) * 0.6, q.Z + 4.08); ball([0x4fd36a, 0xff3b4a, 0xffe066][n % 3], 0.035, q.X + 1.7 + (n % 4) * 1.1, q.Y + 0.4 + Math.floor(n / 4) * 0.6, q.Z + 4.04, M.glow); }
        for (const x of [2.4, 4.8]) for (const r of [0, 1]) put(M.plain, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14).rotateX(Math.PI / 2).translate(q.X + x + r * 0.5, q.Y + 2, q.Z + 4.06), 0xb9a58a); // tape reels
        put(M.plain, new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, 1.1).rotateX(-1.1).translate(q.X - 1, q.Y + 1.9, q.Z - 5.2), 0xc9cbd2);              // the dish, outside the glass
        for (let n = 0; n < 6; n++) slab(0xb9a58a, 0.5 + (n % 2) * 0.1, 0.36, 0.4, q.X - 7 + (n % 2) * 0.1, q.Y + Math.floor(n / 2) * 0.37, q.Z + 3 + (n % 2) * 0.5); // boxes of paper
        post(0x1c1c22, 0.02, 1.2, q.X - 3.8, q.Y + 0.4, q.Z - 1.6, 5); slab(0x1c1c22, 0.4, 0.26, 0.3, q.X - 3.4, q.Y + 0.4, q.Z - 1.5);                          // a microphone and a scanner on the table
      });
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
  const SHOP_NAME = { CHRIS: "Christopher's place", HOTEL: 'the hotel', CARDROOM: 'room six', BANQUET: 'the Manor', BAR: 'the bar', CAFE: 'the cafe', PIZZA: 'the pizzeria', DINER: 'the diner', DELI: 'the deli', LIQUOR: 'the liquor store', PAWN: 'the pawn shop', GUNS: 'the gun shop', TACOS: 'the taco stand', DONUTS: 'the donut shop', BURGERS: 'the burger place', 'AUTO PARTS': 'the parts store', LAUNDRY: 'the laundromat', 'CHECKS CASHED': 'the check casher', VIDEO: 'the video store', SURF: 'the surf shop', RECORDS: 'the record store', TAILOR: 'the tailor', CIGARS: 'the cigar store',
    HOUSE: 'the house', NEIL: 'the house', BANK: 'the bank', STORE: 'the store', BOOKS: 'the bookstore', LIVIA: "Livia's house", WAREHOUSE: 'the warehouse', KIOSK: 'the kiosk', SHOWROOM: 'the showroom', CHURCH: 'the church', OFFICE: 'the office', SCHOOL: 'the hall' };
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
  if (!LA) { const d = nearestShop('PAWN', places.home.spawn, 150, 520); places.pawn = { door: d.outside, kerb: d.kerb }; } // the pawnbroker Tony buys from
  if (LA) { const d = nearestShop('PARTS', places.airport.kerb, 150, 420); places.parts = { door: d.outside, kerb: d.kerb }; } // where a stolen car gets other plates
  places.gunShops = shopDoors.filter(d => d.shop === 'GUNS').map(d => d.outside).filter((d, n) => n % 3 === 0); // the map marks a few; the rest are found by their neon

  // Where the world makes a noise of its own: { kind, x, z, r (how far it carries) }.
  places.sounds = [];
  const sound = (kind, at, r, vol = 1) => { if (at) places.sounds.push({ kind, x: at.x, z: at.z, r, vol }); };
  sound('water', places.fountain, 22, 0.5);
  if (!LA) {
    sound('club', { x: places.bing.door.x, z: places.bing.door.z - 9 }, 62);
    sound('water', places.grove.fountain, 28); sound('water', { x: places.home.pool.x + 7.6, z: places.home.pool.z }, 22, 0.6); sound('water', places.park?.pond, 26, 0.7);
  } else {
    sound('jets', places.airport?.runway, 280); sound('harbour', places.containers?.centre, 130); sound('film', places.drivein?.screen, 80);
    for (const k of ['north', 'under', 'south']) sound('freeway', places.freeway?.[k], 120);
  }
  for (const d of shopDoors) { if (d.shop === 'CHURCH') sound('bell', d.outside, 340); else if (d.shop === 'BAR') sound('club', d.outside, 20, 0.6); }

  places.chop = { x: SHORE + 18, z: bounds.minZ + 16 }; // the north end of the beach, where stolen cars get stripped
  if (!LA) { // ...and it looks like it: a tarp on poles, a container, what has come off other people's cars, lamps for working at night
    const cx = places.chop.x, cz = places.chop.z, y = groundAt(cx, cz), RUST = 0x8a4a2a, TARP = 0x2f56c8;
    const on = (x, z) => groundAt(cx + x, cz + z);
    for (const [px, pz] of [[1.6, -6.4], [8.8, -6.4], [1.6, 0.6], [8.8, 0.6]]) { post(0x8a8d96, 0.06, 3.1, cx + px, on(px, pz), cz + pz, 6); collide(cx + px, cz + pz, 0.3, 0.3, 3, true); }
    put(M.plain, new THREE.BoxGeometry(7.8, 0.05, 7.6).rotateZ(0.06).translate(cx + 5.2, y + 3.15, cz - 2.9), TARP); for (let k = 0; k < 4; k++) slab(0x24449a, 7.8, 0.02, 0.06, cx + 5.2, y + 3.2, cz - 6 + k * 2);
    slab(RUST, 6.4, 2.6, 2.5, cx + 4.6, y, cz - 10.6, M.siding, 1.2); slab(0x5a2a16, 0.08, 2.4, 1.2, cx + 1.5, y + 0.1, cz - 9.3); slab(0x16161c, 0.05, 2.3, 2.3, cx + 1.42, y + 0.1, cz - 10.6); collide(cx + 4.6, cz - 10.6, 6.5, 2.6, 2.6);
    for (let k = 0; k < 12; k++) slab([0xf4f4f0, 0xffe066, 0x49e0d0, 0xf4f4f0, 0xd8342c, 0x2f56c8][k % 6], 0.5, 0.24, 0.02, cx + 2.6 + (k % 6) * 0.62, y + 1.5 + Math.floor(k / 6) * 0.34, cz - 9.33);                 // plates off every one of them
    const tyres = (x, z, n) => { for (let k = 0; k < n; k++) put(M.plain, new THREE.TorusGeometry(0.3, 0.13, 6, 14).rotateX(Math.PI / 2).translate(cx + x, on(x, z) + 0.13 + k * 0.26, cz + z), 0x16161c); collide(cx + x, cz + z, 0.8, 0.8, 1, true); };
    tyres(-2.2, -6.2, 4); tyres(-1.3, -6.9, 3); tyres(10.2, -4.6, 5); tyres(10.9, -3.8, 2);
    for (const [k, hex] of [0xd9c7a0, 0x29c7c0, 0xd8342c, 0x23232b].entries()) put(M.plain, new THREE.BoxGeometry(1.05, 0.95, 0.06).rotateX(-0.22).translate(cx + 10.6, on(10.6, 0.6) + 0.5, cz + 0.6 + k * 0.22), hex);                              // doors, leaning
    put(M.plain, new THREE.BoxGeometry(1.5, 0.06, 1.2).rotateZ(0.3).translate(cx + 0.2, on(0.2, -8.2) + 0.3, cz - 8.2), 0xd8342c); put(M.plain, new THREE.BoxGeometry(1.5, 0.06, 1.2).rotateZ(-0.15).translate(cx - 0.6, on(-0.6, -8.6) + 0.12, cz - 8.6), 0x2f56c8); // hoods
    slab(0xc9cbd2, 1.7, 0.16, 0.14, cx + 7.2, on(7.2, 5.4), cz + 5.4); slab(0x23232b, 1.7, 0.16, 0.14, cx + 7.6, on(7.6, 5.9), cz + 5.9);                                                                // bumpers
    for (const [sx, sz, t] of [[8.6, 3.9, 0.5], [9.6, 4.6, 0.9]]) { put(M.plain, new THREE.BoxGeometry(0.55, 0.16, 0.55).rotateY(t).translate(cx + sx, on(sx, sz) + 0.2, cz + sz), 0x6a4a34); put(M.plain, new THREE.BoxGeometry(0.55, 0.7, 0.14).translate(0, 0.55, -0.24).rotateY(t).translate(cx + sx, on(sx, sz), cz + sz), 0x6a4a34); } // seats, in the open air
    // The hoist with an engine on it, the bench, the red chest, the gas, the lamps, the fire in the drum.
    for (const a of [0, 2.09, 4.19]) put(M.plain, new THREE.CylinderGeometry(0.035, 0.035, 3.2, 5).rotateZ(0.32).rotateY(a).translate(cx - 0.4 + Math.cos(a) * 0.5, on(-0.4, -3.8) + 1.5, cz - 3.8 - Math.sin(a) * 0.5), 0x8a8d96);
    post(0x8a8d96, 0.008, 1.5, cx - 0.4, on(-0.4, -3.8) + 1.3, cz - 3.8, 4); slab(0x3a3a44, 0.6, 0.55, 0.8, cx - 0.4, on(-0.4, -3.8) + 0.75, cz - 3.8); slab(0x8d8a8e, 0.5, 0.16, 0.5, cx - 0.4, on(-0.4, -3.8) + 1.3, cz - 3.8); collide(cx - 0.4, cz - 3.8, 1.2, 1.2, 2, true);
    slab(0x8a6a44, 2.6, 0.08, 0.8, cx + 5.2, on(5.2, -8.2) + 0.85, cz - 8.2, M.wood, 1); for (const s of [-1, 1]) slab(0x5a3320, 0.08, 0.85, 0.7, cx + 5.2 + s * 1.2, on(5.2, -8.2), cz - 8.2); collide(cx + 5.2, cz - 8.2, 2.7, 0.9, 1, true);
    slab(0x23232b, 0.4, 0.22, 0.2, cx + 4.4, on(5.2, -8.2) + 0.93, cz - 8.3); slab(0x7dffb0, 0.1, 0.05, 0.01, cx + 4.3, on(5.2, -8.2) + 1.05, cz - 8.19, M.glow); for (let k = 0; k < 5; k++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6).translate(cx + 5 + k * 0.2, on(5.2, -8.2) + 1.03, cz - 8.2), [0x8a5a2a, 0x2f7d46][k % 2]);
    slab(0xd8342c, 0.9, 1.1, 0.5, cx + 9.9, on(9.9, -1.6), cz - 1.6); for (let k = 0; k < 4; k++) slab(0xc9cbd2, 0.7, 0.03, 0.02, cx + 9.9, on(9.9, -1.6) + 0.2 + k * 0.24, cz - 1.34); collide(cx + 9.9, cz - 1.6, 1, 0.6, 1.1, true);
    for (const [gx, hex] of [[11, 0x2f7d46], [11.4, 0xd8342c]]) { post(hex, 0.13, 1.2, cx + gx, on(gx, -2.6), cz - 2.6, 8); post(0xc9cbd2, 0.04, 0.12, cx + gx, on(gx, -2.6) + 1.2, cz - 2.6, 6); }
    for (const [lx, lz, tx, tz] of [[-1.4, -7.6, 1, 1], [11.2, -7.4, -1, 1]]) { for (const a of [0, 2.09, 4.19]) put(M.plain, new THREE.CylinderGeometry(0.025, 0.025, 2.4, 4).rotateZ(0.2).rotateY(a).translate(cx + lx + Math.cos(a) * 0.24, on(lx, lz) + 1.15, cz + lz - Math.sin(a) * 0.24), 0x23232b); slab(0x23232b, 0.5, 0.36, 0.2, cx + lx, on(lx, lz) + 2.3, cz + lz); slab(0xfff6d8, 0.42, 0.28, 0.22, cx + lx + tx * 0.02, on(lx, lz) + 2.34, cz + lz + tz * 0.02, M.glow); halo(cx + lx, on(lx, lz) + 2.5, cz + lz, 0xffe2a6, 10); }
    post(RUST, 0.3, 0.9, cx - 3, on(-3, 2.6), cz + 2.6, 10); collide(cx - 3, cz + 2.6, 0.7, 0.7, 0.9, true); halo(cx - 3, on(-3, 2.6) + 1.2, cz + 2.6, 0xff8a30, 4);
    const flames = [0, 1, 2].map(k => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.16 - k * 0.03, 0.5 + k * 0.1, 6), new THREE.MeshBasicMaterial({ color: [0xff8a30, 0xffb040, 0xffe066][k], transparent: true, opacity: 0.85 })); m.position.set(cx - 3 + (k - 1) * 0.08, on(-3, 2.6) + 1.1, cz + 2.6); scene.add(m); return m; });
    updaters.push(t => flames.forEach((m, k) => { m.scale.set(1 + Math.sin(t * 11 + k * 2) * 0.2, 1 + Math.sin(t * 8 + k) * 0.35, 1 + Math.cos(t * 9 + k) * 0.2); m.rotation.y = t * 2 + k; }));
    put(M.plain, new THREE.CylinderGeometry(0.6, 0.6, 0.1, 14).translate(cx - 5.2, on(-5.2, -1) + 0.7, cz - 1), 0x8a6a44); post(0x8a6a44, 0.2, 0.7, cx - 5.2, on(-5.2, -1), cz - 1, 8); for (let k = 0; k < 4; k++) put(M.plain, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6).translate(cx - 5.4 + (k % 2) * 0.3, on(-5.2, -1) + 0.85, cz - 1.15 + (k >> 1) * 0.3), 0x8a5a2a); // a cable drum for a table
    for (let k = 0; k < 5; k++) { post(0x8a8d96, 0.04, 2.2, cx - 6 + k * 3.4, on(-6 + k * 3.4, -13), cz - 13, 5); if (k < 4) { slab(0x9aa0a8, 3.4, 0.04, 0.04, cx - 4.3 + k * 3.4, on(-4.3 + k * 3.4, -13) + 2.15, cz - 13); slab(0x9aa0a8, 3.4, 0.04, 0.04, cx - 4.3 + k * 3.4, on(-4.3 + k * 3.4, -13) + 1.1, cz - 13); } } // what is left of a fence
  }

  // ----- Beach: boardwalk, palms along Ocean Drive, umbrellas and lifeguard huts on the sand -----
  const beachLen = bounds.maxZ - bounds.minZ;
  slab(0xd9b48a, 4.6, 0.12, beachLen - 16, SHORE + 2.3, -0.08, (bounds.minZ + bounds.maxZ) / 2, M.wood, 2.5);
  for (let z = bounds.minZ + 14; z < bounds.maxZ - 10; z += 13) palms.push({ x: SHORE + 5.6 + rand() * 1.5, z: z + rand() * 4 });
  const pierZ = blockCenter(NX - 1, 2).z, offPier = z => Math.abs(z - pierZ) > 7 && !(z > pierZ + 8 && z < pierZ + 48); // nothing grows through the pier, or through Rideland beside it
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
    for (const h of [0.55, 1]) slab(0xffffff, 0.07, 0.07, 5, end, dy + h, pierZ); for (let k = 0; k < 5; k++) post(0xffffff, 0.05, 1, end, dy, pierZ - 2.5 + k * 1.25, 5); // the end rail: bars, so the sea shows through
    bench(end - 1.2, pierZ, -Math.PI / 2);
    places.pier = { start: { x: ramp - 3, z: pierZ }, end: { x: end - 5, z: pierZ } };
    { // The pier, used: benches, more lamps, tackle left along the rail, a ring to throw, crates at the head, a shack for bait,
      // a boat on a mooring, a buoy with a light on it, gulls going round.
      const RAIL = pierZ - 2.42, FAR = pierZ + 2.42;
      for (let x = deck + 16; x < end - 8; x += 16) { post(STEEL, 0.07, 3.6, x, dy, FAR); ball(0xffe2a6, 0.2, x, dy + 3.7, FAR, M.glow); halo(x, dy + 3.7, FAR, 0xffb860, 4); }
      for (let x = deck + 12; x < end - 10; x += 16) { // a bench against the south rail, facing the water to the north
        slab(0x8a5a44, 1.7, 0.06, 0.42, x, dy + 0.42, FAR - 0.3, M.wood, 1); slab(0x8a5a44, 1.7, 0.4, 0.05, x, dy + 0.5, FAR - 0.08, M.wood, 1); for (const s of [-1, 1]) slab(0x3a3a44, 0.06, 0.42, 0.4, x + s * 0.75, dy, FAR - 0.3);
      }
      for (const [n, x] of [deck + 22, deck + 38, end - 20, end - 9].entries()) { // a rod propped on the rail, its bucket, a box of hooks
        put(M.plain, new THREE.CylinderGeometry(0.008, 0.014, 2.6, 4).rotateX(-0.75).translate(x, dy + 1.5, RAIL - 0.75), 0x3a2a1c); post([0xf4f4f0, 0x2f56c8, 0xd8342c, 0xf4f4f0][n], 0.14, 0.26, x + 0.5, dy, RAIL + 0.3, 10); slab(0x2f5a3f, 0.34, 0.18, 0.2, x - 0.5, dy, RAIL + 0.28);
      }
      for (const x of [deck + 30, end - 14]) { slab(0xf4f4f0, 0.5, 0.6, 0.06, x, dy + 0.55, FAR + 0.02); put(M.plain, new THREE.TorusGeometry(0.2, 0.06, 6, 16).translate(x, dy + 0.86, FAR - 0.06), 0xff5a30); }                 // a life ring on its board
      for (const [cx, cz, n] of [[end - 1.4, pierZ - 1.6, 3], [end - 1.2, pierZ + 1.7, 2], [end - 2.3, pierZ + 1.9, 1]]) for (let k = 0; k < n; k++) slab(0x8a6a44, 0.7, 0.5, 0.7, cx, dy + k * 0.5, cz, M.wood, 1);            // crates, lobster pots
      put(M.plain, new THREE.TorusGeometry(0.3, 0.07, 5, 14).rotateX(Math.PI / 2).translate(end - 2.6, dy + 0.07, pierZ - 1.9), 0xc9b79c); put(M.plain, new THREE.TorusGeometry(0.22, 0.07, 5, 14).rotateX(Math.PI / 2).translate(end - 2.6, dy + 0.18, pierZ - 1.9), 0xc9b79c); // rope
      post(0x3a3a44, 0.05, 1.1, end - 0.5, dy, pierZ, 6); put(M.plain, new THREE.CylinderGeometry(0.09, 0.07, 0.42, 10).rotateZ(Math.PI / 2 - 0.2).translate(end - 0.45, dy + 1.25, pierZ), 0x8a8d96);                           // a telescope: a quarter a look
      // The bait shack on the sand by the ramp.
      const sx = ramp - 7, sz = pierZ + 6.5;
      slab(0x8fd0c8, 3.6, 2.6, 2.8, sx, 0, sz, M.siding, 1.5); hip(0xd8342c, 4.2, 3.4, 0.9, sx, 2.6, sz, 0.3); slab(0x16161c, 2, 1, 0.08, sx, 1.1, sz - 1.42); slab(0xfff2c0, 1.8, 0.8, 0.04, sx, 1.2, sz - 1.44, M.glow); slab(0x8a5a44, 2.4, 0.08, 0.5, sx, 1.02, sz - 1.6, M.wood, 1);
      sign(['BAIT · ICE · BEER'], sx, 2.25, sz - 1.44, Math.PI, { w: 3.2, h: 0.55, color: '#f4f4f0', bg: '#1f5a8a', size: 0.7, glow: false });
      slab(0xf4f4f0, 0.8, 0.9, 0.6, sx + 2.4, 0, sz - 0.9); slab(0x2f56c8, 0.82, 0.3, 0.02, sx + 2.4, 0.5, sz - 1.21); collide(sx, sz, 3.8, 3, 3); collide(sx + 2.4, sz - 0.9, 0.9, 0.7, 1);
      // What moves: a boat on its mooring, a buoy, three gulls.
      const boat = new THREE.Group(), hullM = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), trimM = new THREE.MeshLambertMaterial({ color: 0x1f5a8a });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.9, 1.9), hullM), bow = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.6, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.48, 1), hullM), stripe = new THREE.Mesh(new THREE.BoxGeometry(5.24, 0.14, 1.94), trimM), cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 1.5), hullM), glass = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.4, 1.3), new THREE.MeshLambertMaterial({ color: 0x24324c })), mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), trimM);
      hull.position.y = 0.2; bow.position.set(3.4, 0.2, 0); stripe.position.y = 0.52; cabin.position.set(-0.6, 1.1, 0); glass.position.set(-0.6, 1.2, 0); mast.position.set(-0.6, 2.6, 0); boat.add(hull, bow, stripe, cabin, glass, mast);
      scene.add(boat);
      const buoy = new THREE.Group(), lampM = new THREE.MeshBasicMaterial({ color: 0xff2a3c });
      buoy.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0xd8342c })), new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 6).translate(0, 0.9, 0), new THREE.MeshLambertMaterial({ color: 0xd8342c })));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), lampM); lamp.position.y = 1.65; buoy.add(lamp); scene.add(buoy);
      const birds = [0, 1, 2].map(k => { const grp = new THREE.Group(), wm = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide }); const wings = [-1, 1].map(sd => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.16).translate(sd * 0.27, 0, 0).rotateX(-Math.PI / 2), wm); grp.add(w); return w; }); grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4).scale(1, 1, 2), wm)); scene.add(grp); return { grp, wings, k }; });
      updaters.push(t => {
        boat.position.set(end - 16 + Math.sin(t * 0.21) * 0.5, -0.5 + Math.sin(t * 1.1) * 0.07, pierZ - 9 + Math.cos(t * 0.17) * 0.4); boat.rotation.set(Math.sin(t * 0.9) * 0.035, 0.25 + Math.sin(t * 0.13) * 0.08, Math.sin(t * 1.1 + 1) * 0.03);
        buoy.position.set(end + 22, -0.55 + Math.sin(t * 1.4) * 0.1, pierZ + 14); buoy.rotation.z = Math.sin(t * 1.2) * 0.12; lampM.color.setHex(Math.floor(t * 0.8) % 2 ? 0xff2a3c : 0x3a0a10);
        for (const { grp, wings, k } of birds) { const a = t * (0.32 + k * 0.05) + k * 2.1, r = 9 + k * 4; grp.position.set(end - 4 + Math.sin(a) * r, 7 + k * 1.6 + Math.sin(t * 0.6 + k) * 0.8, pierZ + Math.cos(a) * r); grp.rotation.y = a + Math.PI / 2; const f = Math.sin(t * (5 + k) + k) * 0.5; wings[0].rotation.z = -f; wings[1].rotation.z = f; }
      });
    }
  }

  // ----- Rideland: a wheel, a carousel and a row of stalls on the sand south of the pier. It was there in 1967 and it is there now -----
  if (!LA) {
    const x = SHORE + 22, z = pierZ + 27, y = -0.1, RED = 0xd8342c, CREAM = 0xf6eedc;
    // The arch on the promenade side.
    for (const s of [-1, 1]) { post(CREAM, 0.22, 4.6, x - 13, y, z + s * 3, 10); collide(x - 13, z + s * 3, 0.6, 0.6, 4.6, true); }
    slab(RED, 0.4, 1.5, 7, x - 13, y + 4.2, z); sign('Rideland', x - 13.22, y + 4.95, z, -Math.PI / 2, { w: 6.4, h: 1.3, color: '#ffe066', bg: '#8a1c1c', font: '"Mr Dafoe", cursive', size: 0.86, also: [[x - 12.78, y + 4.95, z, Math.PI / 2]] });
    for (let n = 0; n < 9; n++) ball([0xffe066, 0xff5fd2, 0x49e0d0][n % 3], 0.1, x - 13, y + 4.05, z - 3.2 + n * 0.8, M.glow);
    halo(x - 13, y + 4.6, z, 0xffe066, 10);
    // The wheel, edge-on to the sea.
    const wx = x + 8, wz = z + 9, R = 8.5, hub = 10.6;
    put(M.plain, new THREE.TorusGeometry(R, 0.13, 6, 40).rotateY(Math.PI / 2).translate(wx, y + hub, wz), RED);
    put(M.plain, new THREE.TorusGeometry(R * 0.5, 0.09, 6, 28).rotateY(Math.PI / 2).translate(wx, y + hub, wz), CREAM);
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, gy = y + hub + Math.cos(a) * R, gz = wz + Math.sin(a) * R;
      put(M.plain, new THREE.BoxGeometry(0.08, R, 0.08).translate(0, R / 2, 0).rotateX(a).translate(wx, y + hub, wz), CREAM);
      slab([RED, 0x49e0d0, 0xffe066, 0xf7a8c4][k % 4], 1.1, 0.8, 1.1, wx, gy - 1.3, gz); slab(CREAM, 1.2, 0.08, 1.2, wx, gy - 0.3, gz); post(STEEL, 0.02, 0.5, wx, gy - 0.5, gz, 4);
      ball(0xffe2a6, 0.1, wx - 0.2, y + hub + Math.cos(a + 0.26) * R, wz + Math.sin(a + 0.26) * R, M.glow);
    }
    for (const s of [-1, 1]) { put(M.plain, new THREE.BoxGeometry(0.3, hub + 0.6, 0.3).translate(0, (hub + 0.6) / 2, 0).rotateX(s * 0.3).translate(wx, y, wz - s * 3.2), CREAM); put(M.plain, new THREE.BoxGeometry(0.3, hub + 0.6, 0.3).translate(0, (hub + 0.6) / 2, 0).rotateX(s * 0.3).translate(wx + 0.9, y, wz - s * 3.2), CREAM); }
    put(M.plain, new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10).rotateZ(Math.PI / 2).translate(wx + 0.4, y + hub, wz), RED); halo(wx, y + hub, wz, 0xffe2a6, 10);
    slab(0x8d8a8e, 3, 0.3, 9, wx, y, wz); collide(wx, wz, 3, 9, 2);
    // The carousel.
    const cx = x - 3, cz = z - 3;
    put(M.plain, new THREE.CylinderGeometry(4.2, 4.4, 0.28, 24).translate(cx, y + 0.14, cz), 0xc79a6a);
    put(M.plain, new THREE.CylinderGeometry(0.5, 0.5, 3.4, 12).translate(cx, y + 1.9, cz), CREAM); collide(cx, cz, 1.1, 1.1, 3.4);
    for (let k = 0; k < 12; k++) put(M.plain, new THREE.ConeGeometry(4.8, 1.9, 3, 1, false, k * Math.PI / 6, Math.PI / 6).translate(cx, y + 4.5, cz), k % 2 ? RED : CREAM);
    put(M.plain, new THREE.CylinderGeometry(4.8, 4.8, 0.3, 24).translate(cx, y + 3.5, cz), RED); ball(0xffe066, 0.25, cx, y + 5.6, cz, M.glow);
    const horses = [];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, hx = cx + Math.sin(a) * 3.1, hz = cz + Math.cos(a) * 3.1, up = (k % 2) * 0.3, hue = [0xf4f4f0, 0xd9a520, 0x49a0d0, 0xf7a8c4][k % 4];
      post(0xd9a520, 0.03, 3.3, hx, y + 0.28, hz, 5);
      put(M.plain, new THREE.BoxGeometry(0.3, 0.42, 1).rotateY(a + Math.PI / 2).translate(hx, y + 1.1 + up, hz), hue);
      put(M.plain, new THREE.BoxGeometry(0.2, 0.5, 0.26).translate(0, 0.36, 0.5).rotateY(a + Math.PI / 2).translate(hx, y + 1.1 + up, hz), hue);
      for (const f of [-0.35, 0.35]) put(M.plain, new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(0, -0.42, f).rotateY(a + Math.PI / 2).translate(hx, y + 1.1 + up, hz), hue);
      ball(0xffe2a6, 0.08, cx + Math.sin(a) * 4.7, y + 3.3, cz + Math.cos(a) * 4.7, M.glow);
      horses.push({ x: hx, y: y + 0.95 + up, z: hz, h: a + Math.PI / 2 });
    }
    // The ticket booth and three stalls with striped awnings.
    slab(RED, 2, 2.6, 2, x - 9, y, z + 6, M.siding, 0.8); collide(x - 9, z + 6, 2, 2, 2.8); hip(CREAM, 2.6, 2.6, 0.8, x - 9, y + 2.6, z + 6, 0.1, M.plain);
    sign('TICKETS 25¢', x - 10.02, y + 2.1, z + 6, -Math.PI / 2, { w: 1.8, h: 0.5, color: '#8a1c1c', bg: '#f6eedc', size: 0.8, glow: false }); slab(0x24324c, 0.05, 0.8, 1.2, x - 10.01, y + 1.1, z + 6);
    for (let n = 0; n < 3; n++) { const sz = z - 11 + n * 0.01, sx = x - 8 + n * 5.2, hue = [0x49e0d0, 0xffe066, 0xf7a8c4][n];
      slab(CREAM, 4, 2.3, 2.2, sx, y, sz - 1, M.siding, 0.8); collide(sx, sz - 1, 4, 2.2, 2.5); slab(0x24324c, 3.4, 1.1, 0.06, sx, y + 0.9, sz + 0.12); slab(0xc79a6a, 3.8, 0.1, 0.5, sx, y + 0.85, sz + 0.3);
      for (let k = 0; k < 8; k++) put(M.plain, new THREE.BoxGeometry(0.5, 0.06, 1.3).rotateX(0.5).translate(sx - 1.75 + k * 0.5, y + 2.45, sz + 0.6), k % 2 ? hue : CREAM);
      for (let k = 0; k < 5; k++) ball([RED, 0xffe066, 0x49a0d0, 0xf4f4f0, 0x2f7d46][(k + n) % 5], 0.16, sx - 1.2 + k * 0.6, y + 1.7, sz - 0.2); }
    for (let n = 0; n < 14; n++) { ball([0xffe066, 0xff5fd2, 0x49e0d0, 0xff8a5c][n % 4], 0.09, x - 12 + n * 1.6, y + 3.6 - Math.sin(n / 13 * Math.PI) * 0.5, z + 3, M.glow); if (n % 4 === 0) halo(x - 12 + n * 1.6, y + 3.4, z + 3, 0xffd9a8, 4); }
    for (const s of [0, 1]) post(CREAM, 0.06, 3.7, x - 12 + s * 20.8, y, z + 3, 6);
    places.sounds.push({ kind: 'carousel', x: cx, z: cz, r: 42, vol: 1 });
    places.rideland = { gate: { x: x - 13, z }, carousel: { x: cx, z: cz }, horses, wheel: { x: wx, z: wz }, booth: { x: x - 9, z: z + 6 }, hide: { x: x - 7.4, z: z + 7.6 }, stop: { x: SHORE - 5, z }, kerb: { x: nodeX(NX) + 3.6, z, h: 0 } };
  }

  // ----- The marsh on the west shore: reeds and dark water -----
  const marsh = { x: OX - ROAD / 2 - 11, z: blockCenter(0, 4).z };
  for (let n = 0; n < 60; n++) {
    const x = OX - ROAD / 2 - 3 - rand() * 15, z = marsh.z + (rand() - 0.5) * 120;
    if (n % 6 === 0) put(M.paint, new THREE.CircleGeometry(2 + rand() * 3, 10).rotateX(-Math.PI / 2).translate(x, -0.04, z), 0x3d5a4e);
    else if (Math.hypot(x - marsh.x, z - marsh.z) > 4) for (let k = 0; k < 4; k++) put(M.plain, new THREE.ConeGeometry(0.07, 1.5 + rand(), 4).translate(x + rand() - 0.5, 0.6, z + rand() - 0.5), k % 2 ? 0x6f8a4a : 0x4f6f3a);
  }
  places.marsh = marsh;
  { // What the tide and the city have left out here, and what drifts over it at night.
    const mx = marsh.x, mz = marsh.z, gy = (x, z) => groundAt(mx + x, mz + z), RUSTY = 0x8a4a2a, GREY = 0x8a8478;
    put(M.wood, new THREE.CapsuleGeometry(0.62, 2.4, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.55, 1).rotateY(0.5).translate(mx - 7.5, gy(-7.5, -6.5) + 0.3, mz - 6.5), 0x6a5a4a); slab(0x4a3a2a, 0.08, 0.1, 2.6, mx - 7.5, gy(-7.5, -6.5) + 0.6, mz - 6.5); collide(mx - 7.5, mz - 6.5, 3, 1.6, 0.8, true); // a boat, the wrong way up
    for (const [x, z, len, t] of [[4.4, -7.4, 2.6, 0.4], [5.6, -6.6, 1.8, -0.7], [-2.6, -9, 2.2, 1.2]]) put(M.wood, new THREE.CylinderGeometry(0.12, 0.16, len, 6).rotateZ(Math.PI / 2).rotateY(t).translate(mx + x, gy(x, z) + 0.14, mz + z), 0x8a7a66);          // driftwood
    post(RUSTY, 0.3, 0.9, mx + 6.8, gy(6.8, -3.4), mz - 3.4, 10); put(M.plain, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).rotateZ(1.45).translate(mx + 8.2, gy(8.2, -4.4) + 0.3, mz - 4.4), RUSTY); collide(mx + 6.8, mz - 3.4, 0.7, 0.7, 0.9, true);
    post(GREY, 0.05, 2, mx + 7.6, gy(7.6, 3), mz + 3, 5); sign(['NO DUMPING', 'CITY OF VICE'], mx + 7.6, gy(7.6, 3) + 1.9, mz + 3.04, 0, { w: 1.3, h: 0.7, color: '#16161c', bg: '#e9e2cf', size: 0.56, glow: false, also: [[mx + 7.6, gy(7.6, 3) + 1.9, mz + 2.96, Math.PI]] });
    put(M.plain, new THREE.TorusGeometry(0.3, 0.12, 6, 14).rotateX(Math.PI / 2 - 0.3).translate(mx - 3.2, gy(-3.2, -8.4) + 0.14, mz - 8.4), 0x16161c);
    for (let k = 0; k < 6; k++) post(0x5a4a3a, 0.09, 1.1 + (k % 3) * 0.3, mx - 12 - k * 1.3, -0.5, mz - 2.2 + (k % 2) * 1.6, 6);                                                        // what is left of a jetty, going out
    slab(GREY, 0.7, 0.5, 0.45, mx + 2.6, gy(2.6, -9.6) + 0.1, mz - 9.6); for (const s2 of [-1, 1]) post(0x23232b, 0.06, 0.06, mx + 2.6 + s2 * 0.3, gy(2.6, -9.6), mz - 9.6, 6);               // a shopping trolley on its side, near enough
    const mist = [0, 1, 2, 3, 4, 5].map(k => { const m = new THREE.Mesh(new THREE.PlaneGeometry(9 + k * 2, 1.6), new THREE.MeshBasicMaterial({ color: 0xcfd8e6, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })); m.rotation.y = k * 0.5; scene.add(m); return m; });
    const flies = [0, 1, 2, 3, 4, 5, 6, 7].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), new THREE.MeshBasicMaterial({ color: 0xd8ff8a, transparent: true })); scene.add(m); return m; });
    updaters.push(t => {
      mist.forEach((m, k) => { m.position.set(mx - 4 + Math.sin(t * 0.05 + k * 1.7) * 9, 0.7 + (k % 3) * 0.35, mz + (k - 2.5) * 5 + Math.cos(t * 0.04 + k) * 3); m.material.opacity = 0.05 + 0.04 * Math.sin(t * 0.2 + k); });
      flies.forEach((m, k) => { m.position.set(mx - 3 + Math.sin(t * 0.3 + k * 2.1) * 6 + Math.sin(t * 1.3 + k) * 0.4, 0.8 + Math.sin(t * 0.9 + k * 1.3) * 0.4, mz + Math.cos(t * 0.23 + k * 1.4) * 8); m.material.opacity = Math.max(0, Math.sin(t * 1.7 + k * 2.4)); });
    });
  }

  // ----- The bridge to the other island: a long deck out over the water, two towers, cables, lamps -----
  // Vice City's leaves from the west shore; Los Angeles's arrives on the east. Driving off the far end crosses over.
  {
    const dir = LA ? 1 : -1, z = nodeZ(9), Y = 7, W = 14, GREY = 0x9a968e, STEEL_B = 0x8a2f2a;
    const x0 = LA ? SHORE : OX - ROAD / 2, ramp = x0 + dir * 2, deck = x0 + dir * 56, end = (LA ? bounds.maxX : bounds.minX) + dir * 460;
    piers.push({ minZ: z - W / 2 + 0.5, maxZ: z + W / 2 - 0.5, ramp, deck, maxX: end, y: Y, dir });
    const len = Math.abs(end - deck), mid = (deck + end) / 2, rl = Math.abs(deck - ramp), CONC = 0xb9b3ba, RUST = 0x6a2420, edge = W / 2 - 0.2;
    // ----- The approach: an embankment up from the shore road, tarmac on it, walls and rails each side, lamps -----
    const th = Math.atan2(Y + 0.1, rl), sl = Math.hypot(rl, Y + 0.1), up = (t, lift = 0) => [ramp + (deck - ramp) * t, -0.1 + (Y + 0.1) * t + lift];
    const sloped = (mat, hex, l, hh, d, t, lift, zz, tile) => { const [cx, cy] = up(t, lift + hh / 2); const geo = new THREE.BoxGeometry(l, hh, d); put(mat, (tile ? tiled(geo, l, hh, d, tile) : geo).rotateZ(dir * th).translate(cx, cy, zz), hex); };
    { const wedge = new THREE.Shape(); wedge.moveTo(ramp, -0.6); wedge.lineTo(deck, -0.6); wedge.lineTo(deck, Y - 0.3); wedge.lineTo(ramp, -0.4); wedge.lineTo(ramp, -0.6);
      put(M.plain, new THREE.ExtrudeGeometry(wedge, { depth: W, bevelEnabled: false }).translate(0, 0, z - W / 2), 0x8f8b84); }                                         // the bank itself: nothing shows under the ramp any more
    put(M.gravel, tiled(new THREE.BoxGeometry(rl + 0.4, 0.8, W), rl, 0.8, W, 6).rotateZ(dir * th).translate((ramp + deck) / 2, (Y - 0.1) / 2 - 0.4, z), GREY);
    sloped(M.asphalt, 0xffffff, sl, 0.05, W - 1.6, 0.5, 0, z, 5);
    for (const s of [-1, 1]) {
      sloped(M.paint, 0xe8c64a, sl, 0.012, 0.13, 0.5, 0.05, z + s * 0.16); sloped(M.paint, 0xf4f4f0, sl, 0.012, 0.14, 0.5, 0.05, z + s * (W / 2 - 1.15));      // double yellow, white edge lines
      for (let k = 0; k < 6; k++) sloped(M.paint, 0xf4f4f0, 3, 0.012, 0.13, 0.1 + k * 0.16, 0.05, z + s * 3.25);                                                   // lane dashes
      sloped(M.plain, CONC, sl, 1.1, 0.4, 0.5, 0, z + s * edge); sloped(M.plain, 0x8a8d96, sl, 0.07, 0.07, 0.5, 1.5, z + s * edge); sloped(M.plain, 0x8a8d96, sl, 0.07, 0.07, 0.5, 1.28, z + s * edge);
      for (let k = 0; k <= 13; k++) { const [px, py] = up(k / 13, 1.05); slab(0x8a8d96, 0.08, 0.5, 0.08, px, py, z + s * edge); }
      for (const t of [0.22, 0.6, 0.98]) { const [px, py] = up(t); post(STEEL, 0.09, 6, px, py, z + s * (W / 2 - 0.5)); ball(0xffe2a6, 0.26, px, py + 6.1, z + s * (W / 2 - 0.5), M.glow); halo(px, py + 6.1, z + s * (W / 2 - 0.5), 0xffb860, 4); }
      // where the wall begins: a striped nose, and a reflector on it
      slab(0xf2c230, 0.5, 1.3, 0.6, ramp - dir * 0.4, -0.1, z + s * edge); for (let k = 0; k < 3; k++) slab(0x16161c, 0.52, 0.2, 0.62, ramp - dir * 0.4, 0.1 + k * 0.42, z + s * edge); ball(0xff5a3c, 0.09, ramp - dir * 0.68, 1.0, z + s * edge, M.glow);
    }
    for (let k = 0; k < 4; k++) flat(M.paint, 0xf4f4f0, 0.5, 2.2, x0 - dir * 1.2, 0.03, z - 4.8 + k * 3.2);                                                         // a stop line of bars across the foot of it
    // ----- The deck -----
    slab(GREY, len, 1, W, mid, Y - 1, z, M.gravel, 6);
    flat(M.asphalt, 0xffffff, len, W - 1.6, mid, Y + 0.02, z, 5);
    for (const s of [-1, 1]) {
      flat(M.paint, 0xe8c64a, len, 0.13, mid, Y + 0.04, z + s * 0.16); flat(M.paint, 0xf4f4f0, len, 0.14, mid, Y + 0.04, z + s * (W / 2 - 1.15));
      for (let k = 0; k < len / 9; k++) flat(M.paint, 0xf4f4f0, 3, 0.13, deck + dir * (4 + k * 9), Y + 0.04, z + s * 3.25);
      slab(CONC, len, 1.1, 0.4, mid, Y, z + s * edge);
      slab(0x8a8d96, len, 0.07, 0.07, mid, Y + 1.5, z + s * edge); slab(0x8a8d96, len, 0.07, 0.07, mid, Y + 1.28, z + s * edge);                                    // a steel rail on the wall, on posts
      for (let k = 0; k <= len / 4; k++) slab(0x8a8d96, 0.08, 0.5, 0.08, deck + dir * k * 4, Y + 1.05, z + s * edge);
      slab(STEEL_B, len, 1.5, 0.45, mid, Y - 2.5, z + s * 4.6);                                                                                                          // the girders under it, seen from the beach
      // rails over the beach, so nobody steps off the side of the ramp
      collide((x0 + (LA ? bounds.maxX : bounds.minX)) / 2, z + s * (W / 2 + 0.2), Math.abs((LA ? bounds.maxX : bounds.minX) - x0) + 8, 0.5, Y + 2);
    }
    for (let k = 0; k <= len / 46; k++) { // piles into the sea, lamps above them, a joint in the roadway over each
      const px = deck + dir * k * 46;
      slab(GREY, 2.2, Y + 4, W - 3, px, -4, z, M.gravel, 4); slab(0x7a766e, 3.4, 1.2, W - 1.6, px, -4.6, z);
      slab(STEEL_B, 0.4, 1.3, 9.2, px + dir * 15, Y - 2.4, z); slab(STEEL_B, 0.4, 1.3, 9.2, px + dir * 31, Y - 2.4, z);
      flat(M.paint, 0x23232b, 0.22, W - 1.6, px + dir * 0.6, Y + 0.035, z);
      for (const s of [-1, 1]) { post(STEEL, 0.09, 6, px, Y, z + s * (W / 2 - 0.5)); slab(STEEL, 0.07, 0.07, 1.5, px, Y + 6, z + s * (W / 2 - 1.2)); ball(0xffe2a6, 0.26, px, Y + 5.9, z + s * (W / 2 - 1.9), M.glow); halo(px, Y + 5.9, z + s * (W / 2 - 1.9), 0xffb860, 4); }
      if (k % 2 === 1) for (const s of [-1, 1]) { slab(0xf2c230, 0.3, 0.42, 0.2, px + dir * 23, Y + 1.1, z + s * (edge - 0.28)); ball(0x4a7dff, 0.06, px + dir * 23, Y + 1.6, z + s * (edge - 0.28), M.glow); }   // a call box
    }
    for (const t of [0.3, 0.72]) { // the towers and their cables
      const tx = deck + dir * len * t, H = 44;
      for (const s of [-1, 1]) {
        const lz = z + s * (W / 2 + 1.2);
        slab(STEEL_B, 2.2, H + 8, 2.2, tx, -6, lz); slab(RUST, 2.9, 1.1, 2.9, tx, Y - 0.2, lz); slab(RUST, 2.8, 0.7, 2.8, tx, H + 1.6, lz); slab(0x7a766e, 5, 5, 5, tx, -6, lz);   // a leg, its collar at the deck, its cap, its footing in the water
        for (const ly of [Y + 9, Y + 22, Y + 33]) ball(0xfff2c0, 0.14, tx - dir * 1.16, ly, lz, M.glow);
      }
      for (const hy of [Y + 12, Y + 26, H]) slab(STEEL_B, 1.6, 2.4, W + 2.4, tx, hy, z);
      for (const [y0, y1] of [[Y + 14.4, Y + 26], [Y + 28.4, H]]) for (const s of [-1, 1]) put(M.plain, new THREE.BoxGeometry(0.5, 0.5, Math.hypot(y1 - y0, W + 0.4)).rotateX(s * Math.atan2(y1 - y0, W + 0.4)).translate(tx, (y0 + y1) / 2, z), RUST);   // the cross-bracing in each bay
      ball(0xff3b3b, 0.4, tx, H + 3.2, z, M.glow); halo(tx, H + 3.2, z, 0xff3030, 10);
      for (const s of [-1, 1]) for (let n = 1; n <= 9; n++) for (const side of [-1, 1]) {
        const reach = n * 11, dx = side * reach, top = H - (9 - n) * 1.4, drop = top - Y - 1, l = Math.hypot(reach, drop), lz = z + s * (W / 2 + 1.2);
        put(M.plain, new THREE.BoxGeometry(l, 0.13, 0.13).rotateZ(-side * Math.atan2(drop, reach)).translate(tx + dx / 2, Y + 1 + drop / 2, lz), 0xd8d0c4);
        slab(RUST, 0.6, 0.5, 0.6, tx + dx, Y + 0.7, lz); slab(STEEL_B, 0.5, 0.3, 1.5, tx + dx, Y - 0.6, z + s * (W / 2 + 0.5));                                               // where each cable is made fast, on an outrigger
      }
    }
    // ----- The toll plaza at the head of the deck: a canopy, a booth on an island between the lanes, the arms up -----
    {
      const tx = deck + dir * 14, face = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      slab(CONC, 8, 0.24, 1.7, tx, Y, z); collide(tx, z, 8, 1.7, Y + 3);
      for (const e of [-1, 1]) { slab(0xf2c230, 0.5, 0.9, 1.7, tx + e * 4.2, Y, z); for (let k = 0; k < 2; k++) slab(0x16161c, 0.52, 0.2, 1.72, tx + e * 4.2, Y + 0.15 + k * 0.4, z); ball(0xffa325, 0.1, tx + e * 4.5, Y + 1.0, z, M.glow); }
      slab(0xe9e2cf, 2.4, 2.3, 1.3, tx, Y + 0.24, z); slab(0xffe2a6, 2.44, 0.8, 1.34, tx, Y + 1.2, z, M.glow); slab(0x2f4a3c, 2.7, 0.14, 1.6, tx, Y + 2.54, z); slab(0xe9e2cf, 0.12, 0.8, 1.36, tx, Y + 1.2, z);
      for (const s of [-1, 1]) {
        post(0x55525a, 0.2, 5.4, tx, Y, z + s * (edge - 0.1), 8);
        slab(0xfff2c0, 1.6, 0.05, 0.6, tx, Y + 5.36, z + s * 3.25, M.glow); halo(tx, Y + 5.2, z + s * 3.25, 0xffe2a6, 4);
        for (const e of [-1, 1]) slab(0x3dff7a, 0.06, 0.5, 0.5, tx + e * 2.82, Y + 4.75, z + s * 3.25, M.glow);                                                          // a green light over each lane, both ways
        slab(0x55525a, 0.16, 1.0, 0.16, tx - dir * 3.2, Y + 0.24, z + s * 0.6); put(M.plain, new THREE.BoxGeometry(0.09, 3.2, 0.09).translate(0, 1.6, 0).rotateX(s * 0.3).translate(tx - dir * 3.2, Y + 1.15, z + s * 0.6), 0xf4f4f0);
        put(M.plain, new THREE.BoxGeometry(0.1, 0.6, 0.1).translate(0, 2.9, 0).rotateX(s * 0.3).translate(tx - dir * 3.2, Y + 1.15, z + s * 0.6), 0xd8342c);              // the arm, up, red at its end
        slab(0x8a8d96, 0.5, 0.9, 0.4, tx - dir * 1.9, Y + 0.24, z + s * 1.02); slab(0x16161c, 0.3, 0.2, 0.06, tx - dir * 1.9, Y + 0.95, z + s * 1.24);                     // the basket the exact change goes in
      }
      post(0x55525a, 0.16, 2.9, tx, Y + 2.6, z, 8);
      slab(0x2f4a3c, 5.6, 0.5, W + 0.8, tx, Y + 5.4, z); slab(0xf4f4f0, 5.7, 0.12, W + 0.9, tx, Y + 5.4, z);
      sign(['TOLL  $1.00', 'EXACT CHANGE  ·  NO PENNIES'], tx - dir * 2.86, Y + 6.5, z, face, { w: 9, h: 1.5, color: '#f4f4f0', bg: '#1f6b4a', size: 0.5, glow: false });
      for (const s of [-1, 1]) { post(0x8a8d96, 0.05, 2.6, tx + dir * 12, Y, z + s * (edge - 0.5), 5); sign(s * dir > 0 ? ['NO STOPPING', 'ON BRIDGE'] : ['SPEED', 'LIMIT 45'], tx + dir * 11.94, Y + 2.3, z + s * (edge - 0.5), face, { w: 1.5, h: 1.1, color: '#16161c', bg: '#f4f4f0', size: 0.5, glow: false }); }
    }
    // The sign over the on-ramp.
    const there = LA ? 'VICE CITY' : 'LOS ANGELES', sx = x0 + dir * 10;
    for (const s of [-1, 1]) post(0x55525a, 0.2, 8, sx, 0, z + s * (W / 2 + 0.6), 8);
    slab(0x55525a, 0.4, 3.2, W + 1.2, sx, 6.6, z);
    sign([there, 'BRIDGE  ·  2 MILES'], sx - dir * 0.24, 8.2, z, dir > 0 ? -Math.PI / 2 : Math.PI / 2, { w: 11, h: 2.8, color: '#f4f4f0', bg: '#1f6b4a', size: 0.62, glow: false });
    places.bridge = { dir, there, mid: { x: deck + dir * len * 0.2, z: z - dir * 3.2, rail: z - dir * (W / 2 - 1.2), y: Y }, start: { x: x0 - dir * 6, z }, far: { x: end - dir * 30, z }, arrive: { x: end - dir * 90, z: z + dir * 3, h: dir > 0 ? -Math.PI / 2 : Math.PI / 2 } };
    for (let n = palms.length - 1; n >= 0; n--) if (Math.abs(palms[n].z - z) < W / 2 + 3 && (palms[n].x - x0) * dir > -4) palms.splice(n, 1); // no palms growing through the deck
  }

  buildPalms(scene, palms, rand, LA);

  const oz = blockCenter(NX - 1, 5).z;
  places.ocean = {
    marker: { x: nodeX(NX), z: oz },
    chris: { x: SHORE + 1.5, z: oz - 5 },
    debtor: { x: SHORE + 30, z: oz + 14 },
    hangout: { x: SHORE + 3.2, z: blockCenter(NX - 1, 8).z + 6 }, // where Mahaffey passes his afternoons, three blocks down the promenade
    approach: { x: nodeX(NX) + 3.6, z: blockCenter(NX - 1, 8).z - 22 },
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
  if (!LA && rooms.CHRIS && places.satriale && places.flats) { // one of the houses is Christopher's: a few minutes' drive from the pork store, and not Brendan's
    const s = places.satriale.kerb, off = f => Math.abs(Math.hypot(f.kerb.x - s.x, f.kerb.z - s.z) - 240);
    const f = places.flats.filter(f => f.door !== places.flat.door).sort((a, b) => off(a) - off(b))[0], d = f && shopDoors.find(d => d.outside === f.door);
    if (d) { d.shop = 'CHRIS'; places.chris = { door: f.door, kerb: f.kerb }; }
  }
  const shopList = shopDoors.map(d => ({ name: SHOP_NAME[d.shop], outside: d.outside, inside: rooms[SHOP_ROOM[d.shop] ?? d.shop].inside }));
  places.doors = LA ? [
    { name: 'the hospital', outside: { x: places.hospital.door.x, z: places.hospital.door.z - 3.6, h: 0 }, inside: rooms.HOSPITAL.inside },
    ...shopList,
  ] : [
    { name: "Satriale's", outside: { x: places.satriale.door.x, z: places.satriale.door.z - 2.3, h: 0 }, inside: places.shopRoom.inside },
    { name: 'the Bada Bing', outside: { x: places.bing.door.x, z: places.bing.door.z - 6.4, h: 0 }, inside: places.bingRoom.inside },
    { name: 'home', outside: { x: places.home.spawn.x, z: places.home.spawn.z - 2.6, h: 0 }, inside: places.houseRoom.inside },
    { name: "Dr. Melfi's office", outside: { x: places.melfi.door.x, z: places.melfi.door.z - 2.6, h: 0 }, inside: places.office.inside, hide: [places.office.cast.tony] },
    { name: 'the hospital', outside: { x: places.hospital.door.x, z: places.hospital.door.z - 3.6, h: 0 }, inside: rooms.HOSPITAL.inside },
    { name: 'Vesuvio', outside: { x: places.vesuvio.door.x, z: places.vesuvio.door.z - 1.4, h: 0 }, inside: rooms.VESUVIO.inside, closed: () => places.vesuvio.burnt }, // after the fire there is no dining room to walk into
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
  const rig = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffffff, 0, 1); scene.add(l); return l; });
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

  // ----- The rest of the room: it is seen every week, so it is furnished like a room somebody works in -----
  const lam = hex => new THREE.MeshLambertMaterial({ color: hex }), glowOf = hex => new THREE.MeshBasicMaterial({ color: hex });
  const cyl = (r0, r1, h, hex, sides = 14, glow = false) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, sides), glow ? glowOf(hex) : lam(hex));
  // Panelling to the height of a chair back, a rail above it, a skirting board, a cornice.
  for (const [w, d, x, z] of [[12, 0.06, 0, -4.97], [12, 0.06, 0, 4.97], [0.06, 10, -5.97, 0], [0.06, 10, 5.97, 0]]) {
    add(box(w, 1.1, d, 0x5a3a2a), x, 0.55, z); add(box(w + 0.02, 0.08, d + 0.04, 0x3a2418), x, 1.13, z); add(box(w + 0.02, 0.16, d + 0.04, 0x3a2418), x, 0.08, z); add(box(w + 0.02, 0.14, d + 0.06, 0xe9e2cf), x, 4.5, z);
  }
  // A low table between the chairs: water, two glasses, a small bronze nobody has ever asked about.
  add(cyl(0.62, 0.62, 0.05, 0x3a2418, 24), 0, 0.42, -0.1); add(cyl(0.08, 0.2, 0.4, 0x2b1a12, 10), 0, 0.2, -0.1);
  add(cyl(0.07, 0.09, 0.26, 0xcfe8f5, 10), -0.22, 0.58, -0.2); for (const dx of [0.02, 0.2]) add(cyl(0.035, 0.03, 0.1, 0xe9f4fa, 8), dx, 0.5, 0.12);
  add(cyl(0.02, 0.09, 0.22, 0x6a4a34, 6), 0.26, 0.56, -0.3); add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lam(0x6a4a34)), 0.26, 0.71, -0.3);
  // Her desk, in the corner behind her: a lamp with a green shade, files, a telephone, the chair pushed in.
  add(box(2.3, 0.07, 1.05, 0x3a2418), 2.9, 0.78, -3.5); for (const dx of [-0.85, 0.85]) add(box(0.5, 0.75, 0.95, 0x2b1a12), 2.9 + dx, 0.375, -3.5);
  add(cyl(0.03, 0.09, 0.34, 0xd9a520, 8), 3.7, 0.98, -3.7); add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 0.14, 12), glowOf(0x7fd0a0)), 3.7, 1.2, -3.7);
  for (let k = 0; k < 4; k++) add(box(0.32, 0.03, 0.42, [0xe9e2cf, 0xd9c7a0, 0xf4f4f0, 0xc9b79c][k]), 2.35 + (k % 2) * 0.05, 0.83 + k * 0.03, -3.45);
  add(box(0.24, 0.08, 0.2, 0x16161c), 3.1, 0.86, -3.3); add(box(0.2, 0.05, 0.06, 0x16161c), 3.1, 0.92, -3.3);
  add(box(0.6, 0.1, 0.6, 0x27403b), 2.9, 0.5, -4.3); add(box(0.6, 0.8, 0.1, 0x27403b), 2.9, 0.95, -4.6);
  // A couch along the west wall, for the patients who cannot look at her.
  add(box(0.95, 0.42, 3.2, 0x6a4a52), -5.25, 0.21, -0.4); add(box(0.25, 0.9, 3.2, 0x5a3e46), -5.78, 0.6, -0.4);
  for (const dz of [-1.75, 1.75]) add(box(0.95, 0.62, 0.25, 0x5a3e46), -5.25, 0.42, -0.4 + dz); for (const dz of [-1.1, 0.9]) add(box(0.16, 0.45, 0.5, 0xd9a520), -5.5, 0.62, -0.4 + dz);
  // Things on the walls: three prints over the couch, a clock that is always nearly ten to the hour, two more frames by the diploma.
  for (const [k, hex] of [0x2f56c8, 0xd8342c, 0xd9a520].entries()) { const f = add(box(0.05, 0.9, 0.7, 0x2b1a12), -5.94, 2.5, -1.3 + k * 0.95); f.name = 'frame'; add(box(0.03, 0.74, 0.54, 0xe9e2cf), -5.9, 2.5, -1.3 + k * 0.95); add(box(0.02, 0.4, 0.3, hex), -5.88, 2.45 + (k % 2) * 0.1, -1.3 + k * 0.95); }
  add(cyl(0.3, 0.3, 0.05, 0xf4f1e6, 24), 0.4, 3.2, -4.92).rotation.x = Math.PI / 2; add(cyl(0.33, 0.33, 0.04, 0x2b1a12, 24), 0.4, 3.2, -4.94).rotation.x = Math.PI / 2;
  add(box(0.03, 0.22, 0.02, 0x16161c), 0.4, 3.28, -4.88).rotation.z = 0.5; add(box(0.02, 0.26, 0.02, 0x16161c), 0.33, 3.26, -4.88).rotation.z = 1.2;
  for (const [x, hex] of [[4.3, 0x49a0d0], [0.9, 0x8a6f8f]]) { add(box(0.7, 0.9, 0.05, 0x2b1a12), x, 2.3, -4.95); add(box(0.56, 0.76, 0.03, hex), x, 2.3, -4.92); }
  // A cabinet under the diploma, with a vase and a photograph turned away from the patient.
  add(box(1.9, 0.8, 0.5, 0x3a2418), 1.0, 0.4, -4.68); add(cyl(0.1, 0.07, 0.3, 0x49a0d0, 10), 0.5, 0.95, -4.68); add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lam(0xf7a8c4)), 0.5, 1.2, -4.68); add(box(0.22, 0.28, 0.03, 0xd9a520), 1.5, 0.94, -4.6).rotation.y = 2.6;
  // Curtains at the window, a second lamp, a coat stand by the door with one umbrella in it.
  for (const dz of [-1.5, 1.5]) add(box(0.14, 3.2, 0.5, 0x6a2a34), 5.86, 2.2, dz); add(box(0.1, 0.1, 3.6, 0x3a2418), 5.86, 3.85, 0);
  add(box(0.5, 0.55, 0.5, 0x2b1a12), 4.4, 0.275, 2.6); add(cyl(0.03, 0.08, 0.4, 0xd9a520, 8), 4.4, 0.75, 2.6); add(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.3, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a6, side: THREE.DoubleSide })), 4.4, 1.05, 2.6);
  add(cyl(0.03, 0.03, 1.8, 0x2b1a12, 6), -4.9, 0.9, 4.4); add(cyl(0.25, 0.25, 0.04, 0x2b1a12, 10), -4.9, 0.02, 4.4); for (let k = 0; k < 3; k++) add(box(0.22, 0.03, 0.03, 0x2b1a12), -4.9, 1.7, 4.4).rotation.y = k * 2.1;
  add(cyl(0.025, 0.015, 0.9, 0x16161c, 6), -4.7, 0.5, 4.5).rotation.z = 0.12;
  // A lamp over the middle of the room, a notebook on the arm of her chair, a box of tissues within reach of his.
  add(cyl(0.02, 0.02, 0.5, 0x2b1a12, 6), 0, 4.3, 0); add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8).scale(1, 0.55, 1), glowOf(0xffe8c0)), 0, 4.0, 0);
  add(box(0.2, 0.02, 0.28, 0xf4f4f0), 2.3, 0.78, 0.56); add(box(0.015, 0.015, 0.16, 0x16161c), 2.3, 0.8, 0.5).rotation.y = 0.5;
  add(box(0.24, 0.12, 0.14, 0xe9eef2), -2.25, 0.83, -0.56);
  // The rug's border, and its middle.
  for (const [r0, r1, hex] of [[1.2, 1.32, 0xd9b25a], [0.5, 1.2, 0x7a2430]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32), lam(hex)); m.rotation.x = -Math.PI / 2; add(m, 0, 0.036, 0); }

  const tony = makeTony();
  tony.set('sit'); tony.group.rotation.y = Math.PI / 2; add(tony.group, -2.02, 0, 0);
  const melfi = makeLook('melfi');
  melfi.set('sit'); melfi.group.rotation.y = -Math.PI / 2; add(melfi.group, 2.02, 0, 0);

  interiors.push({ minX: X - 5.6, maxX: X + 5.6, minZ: Z - 4.6, maxZ: Z + 4.6, lights: [{ x: X, y: base + 3.7, z: Z + 0.6, hex: 0xffd9a8, power: 42, reach: 30 }, { x: X + 3.4, y: base + 1.6, z: Z - 3.2, hex: 0x9fe0b8, power: 9, reach: 7 }, { x: X + 4.4, y: base + 1.3, z: Z + 2.6, hex: 0xffd9a8, power: 10, reach: 8 }] });
  for (const [x, z, w, d] of [[2.9, -3.7, 2.5, 1.9], [-5.3, -0.4, 1.2, 3.4], [0, -0.1, 1.3, 1.3], [1, -4.7, 2, 0.6]]) colliders.push({ minX: X + x - w / 2, maxX: X + x + w / 2, minZ: Z + z - d / 2, maxZ: Z + z + d / 2, h: 1 });
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
