import * as THREE from 'three';
import { mulberry32 } from './grid.js';

// Characters in the PS2-era style: rounded low-poly bodies built from elliptical tubes,
// jointed elbows and knees, and faces, hairlines and clothing details painted onto small textures.
// Headings: local +z is the front of the body.

const css = hex => '#' + new THREE.Color(hex).getHexString();
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const lambert = color => new THREE.MeshLambertMaterial({ color });
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}
function textured(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshLambertMaterial({ map: t });
}

// A closed tube through elliptical rings [y, rx, rz, zOffset], listed bottom to top.
// u runs around the body with 0.5 at the front; v runs bottom to top.
function tube(rings, segs, mat) {
  const pos = [], uv = [], idx = [], row = segs + 1;
  const y0 = rings[0][0], span = rings[rings.length - 1][0] - y0;
  for (const [y, rx, rz, zo = 0] of rings) for (let j = 0; j <= segs; j++) {
    const a = Math.PI + j / segs * Math.PI * 2;
    pos.push(rx * Math.sin(a), y, rz * Math.cos(a) + zo);
    uv.push(j / segs, (y - y0) / span);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const n = pos.length / 3, last = (rings.length - 1) * row;
  const bottom = rings[0], top = rings[rings.length - 1];
  pos.push(0, bottom[0], bottom[3] || 0, 0, top[0], top[3] || 0);
  uv.push(0.5, 0, 0.5, 1);
  for (let j = 0; j < segs; j++) idx.push(j + 1, j, n, last + j, last + j + 1, n + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // The first and last vertex of each ring coincide; average their normals so no seam shows.
  const nor = geo.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    const a = i * row, b = a + segs;
    v.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
    nor.setXYZ(a, v.x, v.y, v.z); nor.setXYZ(b, v.x, v.y, v.z);
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function blob(rx, ry, rz, mat, segs = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segs, Math.max(4, segs - 2)), mat);
  m.scale.set(rx, ry, rz); m.castShadow = true;
  return m;
}

// ---------- Shirt prints ----------

const prints = {};
function printCanvas(kind) {
  if (prints[kind]) return prints[kind];
  const [c, g] = canvasOf(64), r = mulberry32(7);
  const fill = color => { g.fillStyle = color; g.fillRect(0, 0, 64, 64); };
  if (kind === 'blocks') {
    fill('#171c44');
    const cols = ['#f2c230', '#d8342c', '#2f56c8', '#f2efe6', '#0d1030'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (r() > 0.6) continue;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(x * 8 + 1, y * 8 + 1 + Math.floor(r() * 3), 3 + Math.floor(r() * 4), 2 + Math.floor(r() * 3));
    }
  } else if (kind === 'plaid') {
    fill('#8d93cc');
    g.fillStyle = 'rgba(255,255,255,.28)';
    for (let k = 0; k < 64; k += 16) { g.fillRect(k, 0, 5, 64); g.fillRect(0, k, 64, 5); }
    g.fillStyle = 'rgba(40,40,110,.3)';
    for (let k = 9; k < 64; k += 16) { g.fillRect(k, 0, 2, 64); g.fillRect(0, k, 64, 2); }
  } else if (kind === 'paisley') {
    fill('#232228');
    for (let k = 0; k < 70; k++) {
      g.fillStyle = ['#6f6b66', '#8c8371', '#45434c'][k % 3];
      g.beginPath(); g.ellipse(r() * 64, r() * 64, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); g.fill();
    }
  } else { // fine stripes
    fill('#ece6dc');
    g.fillStyle = '#c9c2d2';
    for (let k = 0; k < 64; k += 6) g.fillRect(k, 0, 2, 64);
  }
  return prints[kind] = c;
}
const tile = (g, canvas, S) => { g.fillStyle = g.createPattern(canvas, 'repeat'); g.fillRect(0, 0, S, S); };

// ---------- Painted textures ----------

// Head: skin, hairline, eyes, brows, nose and mouth. The face is centred on u = 0.5.
function headCanvas(o) {
  const S = 128, [c, g] = canvasOf(S), Y = v => (1 - v) * S, cx = S / 2;
  g.fillStyle = css(o.skin); g.fillRect(0, 0, S, S);

  g.fillStyle = css(o.hair);
  const recede = o.hairStyle === 'receding', bald = o.hairStyle === 'balding';
  for (let x = 0; x < S; x++) {
    const du = Math.abs((x + 0.5) / S - 0.5);
    let top = 1, bottom;
    if (bald) {
      if (du < 0.16) continue;
      top = lerp(0.6, 0.8, (du - 0.16) / 0.12);
      bottom = du < 0.24 ? lerp(0.5, 0.4, (du - 0.16) / 0.08) : 0.28;
    } else if (du < 0.15) bottom = recede ? lerp(0.87, 0.97, (du - 0.06) / 0.09) : 0.8;
    else if (du < 0.22) bottom = lerp(recede ? 0.97 : 0.8, 0.52, (du - 0.15) / 0.07);
    else if (du < 0.3) bottom = lerp(0.52, 0.4, (du - 0.22) / 0.08);
    else bottom = 0.28;
    g.fillRect(x, Y(top), 1, (top - bottom) * S);
  }
  if (o.hairSides !== undefined) { // grey at the temples
    g.fillStyle = css(o.hairSides);
    for (const s of [-1, 1]) g.fillRect(cx + s * 0.25 * S - 10, Y(0.84), 20, 0.34 * S);
  }

  const dark = shade(o.skin, 0.72);
  g.fillStyle = shade(o.skin, 0.86);
  g.fillRect(cx - 17, 51, 34, 8);                       // eye sockets
  g.fillRect(cx - 20, 78, 6, 20); g.fillRect(cx + 14, 78, 6, 20); // cheek hollows
  for (const s of [-1, 1]) {
    const ex = cx + s * 9;
    g.fillStyle = '#ece6dc'; g.fillRect(ex - 3.5, 53.5, 7, 3.5);
    g.fillStyle = '#1b1410'; g.fillRect(ex - 1.2, 53.5, 2.6, 3.5);
    g.fillStyle = dark; g.fillRect(ex - 4, 52.5, 8, 1);
    g.fillStyle = o.age ? css(o.hair) : shade(o.hair, 0.8); g.fillRect(ex - 5, 48 - (o.brow || 2), 10, o.brow || 2);
  }
  g.fillStyle = dark;
  g.fillRect(cx - 4, 71, 8, 1.6);                       // under the nose
  g.fillRect(cx - 9, 84, 1.2, 9); g.fillRect(cx + 8, 84, 1.2, 9); // smile lines
  g.fillStyle = '#7d4038'; g.fillRect(cx - 6.5, 89, 13, 2.2); // mouth
  g.fillStyle = dark; g.fillRect(cx - 4, 96, 8, 1.2);
  if (o.age) {
    g.globalAlpha = 0.35;
    for (const y of [36, 40, 44]) g.fillRect(cx - 12, y, 24, 1);
    g.fillRect(cx - 15, 60, 6, 1); g.fillRect(cx + 9, 60, 6, 1);
    g.globalAlpha = 1;
  }
  if (o.stubble) {
    g.globalAlpha = 0.2; g.fillStyle = '#15151c';
    g.fillRect(cx - 28, 80, 56, 48); g.clearRect(0, 0, 0, 0);
    g.globalAlpha = 1; g.fillStyle = '#7d4038'; g.fillRect(cx - 6.5, 89, 13, 2.2);
  }
  return c;
}

// Torso: the outer garment, plus whatever shows in an open front, collar, chain and belt.
function torsoCanvas(o) {
  const S = 256, [c, g] = canvasOf(S), cx = S / 2;
  const print = o.pattern ? printCanvas(o.pattern) : null;
  const outer = () => { if (o.jacket !== undefined) { g.fillStyle = css(o.jacket); g.fillRect(0, 0, S, S); } else if (print) tile(g, print, S); else { g.fillStyle = css(o.shirt); g.fillRect(0, 0, S, S); } };
  outer();

  const openFront = o.jacket !== undefined || o.open !== undefined;
  if (openFront) {
    g.save();
    g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx + 34, 0); g.lineTo(cx + 15, S); g.lineTo(cx - 15, S); g.closePath(); g.clip();
    if (o.jacket !== undefined && print) tile(g, print, S);
    else { g.fillStyle = css(o.jacket !== undefined ? o.shirt : o.open); g.fillRect(0, 0, S, S); }
    g.fillStyle = css(o.skin);
    g.beginPath(); g.moveTo(cx - 20, 0); g.lineTo(cx + 20, 0); g.lineTo(cx, o.tank ? 56 : 30); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = shade(o.jacket !== undefined ? o.jacket : o.shirt, 0.6); g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx - 15, S); g.moveTo(cx + 34, 0); g.lineTo(cx + 15, S); g.stroke();
  } else if (o.tee) {
    g.fillStyle = css(o.skin);
    g.beginPath(); g.ellipse(cx, 0, 20, 12, 0, 0, 7); g.fill();
  } else {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(cx - 1.5, 0, 3, S);
    g.fillStyle = '#e9e3d2';
    for (let y = 58; y < S - 20; y += 38) g.fillRect(cx - 3, y, 6, 6);
    g.fillStyle = css(o.skin);
    g.beginPath(); g.moveTo(cx - 15, 0); g.lineTo(cx + 15, 0); g.lineTo(cx, 40); g.closePath(); g.fill();
    g.fillStyle = shade(o.shirt, 1.12); g.strokeStyle = shade(o.shirt, 0.6); g.lineWidth = 2;
    for (const s of [-1, 1]) { // collar wings
      g.beginPath(); g.moveTo(cx + s * 13, 0); g.lineTo(cx + s * 34, 0); g.lineTo(cx + s * 27, 26); g.lineTo(cx + s * 3, 36); g.closePath(); g.fill(); g.stroke();
    }
  }
  if (o.chain) {
    g.strokeStyle = '#e8c040'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, 0, 15, 36, 0, 0, Math.PI); g.stroke();
  }
  if (o.tucked) {
    g.fillStyle = '#131317'; g.fillRect(0, S - 16, S, 16);
    g.fillStyle = '#c9c9cf'; g.fillRect(cx - 9, S - 15, 18, 13);
    if (o.badge) { g.fillStyle = '#d9b23c'; g.fillRect(cx + 34, S - 16, 14, 16); }
  }
  // Soft shading under the chest and at the sides so the torso does not read as a flat tube.
  const grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, 'rgba(0,0,0,.22)'); grad.addColorStop(0.3, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.22)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return c;
}

// ---------- The figure ----------

// Options:
//   skin, hair, shirt, pants   colours
//   bulk       1 = average build; above ~1.2 adds a belly
//   height     overall scale
//   hairStyle  'short' | 'receding' | 'balding' | 'pompadour' | 'curly' | 'slick' | 'long'
//   hairSides  colour of the hair at the temples
//   pattern    'blocks' | 'plaid' | 'paisley' | 'stripes' printed shirt
//   jacket     colour of an open jacket worn over the shirt
//   open       colour of an undershirt showing through an unbuttoned shirt or track top
//   tank       the undershirt is a low-cut tank
//   sleeves    'short' | 'long'
//   tee, tucked, badge, chain, watch, muscle, age, stubble   details
//   stripe     colour of side stripes down arms and legs (tracksuit)
export function makeHuman(opts = {}) {
  const o = { skin: 0xe3b58f, shirt: 0xffffff, pants: 0x23232b, hair: 0x2b1b12, bulk: 1, height: 1, hairStyle: 'short', sleeves: 'short', ...opts };
  const b = o.bulk, belly = Math.max(0, b - 1.1) * 0.22;
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.scale.setScalar(o.height);
  const put = (m, x, y, z, parent = group) => { m.position.set(x, y, z); parent.add(m); return m; };

  const skin = lambert(o.skin), hairMat = lambert(o.hair), pantsMat = lambert(o.pants);
  const upper = o.jacket !== undefined ? o.jacket : o.shirt;
  const sleeveMat = o.jacket === undefined && o.pattern ? textured(printCanvas(o.pattern), true) : lambert(upper);

  // Torso
  const hem = o.tucked ? 0.9 : 0.8;
  put(tube([
    [hem, 0.165 * b, 0.115 * b + belly * 0.8, belly * 0.5],
    [0.98, 0.17 * b, 0.12 * b + belly, belly * 0.6],
    [1.1, 0.168 * b, 0.118 * b + belly * 0.9, belly * 0.5],
    [1.24, 0.185 * b, 0.125 * b + belly * 0.4, belly * 0.2],
    [1.36, 0.2 * b, 0.128 * b, 0],
    [1.44, 0.195 * b, 0.112 * b, 0],
    [1.49, 0.12 * b, 0.085, 0],
    [1.52, 0.06, 0.06, 0],
  ], 14, textured(torsoCanvas(o))), 0, 0, 0);
  put(tube([[1.47, 0.055, 0.058], [1.6, 0.05, 0.053]], 8, skin), 0, 0, 0);

  // Head
  const head = new THREE.Group();
  put(head, 0, 1.7, 0);
  head.scale.setScalar(1.14);
  const jaw = 1 + (b - 1) * 0.35;
  put(tube([
    [-0.125, 0.03, 0.03, 0.035],
    [-0.105, 0.06 * jaw, 0.066, 0.022],
    [-0.06, 0.082 * jaw, 0.092, 0.01],
    [-0.01, 0.092, 0.104, 0.003],
    [0.04, 0.095, 0.108, 0],
    [0.085, 0.088, 0.102, -0.003],
    [0.118, 0.062, 0.075, -0.006],
    [0.135, 0.025, 0.03, -0.008],
  ], 14, textured(headCanvas(o))), 0, 0, 0, head);
  const nose = put(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.055, 4), skin), 0, -0.012, 0.108, head);
  nose.rotation.x = -0.35;
  for (const s of [-1, 1]) put(blob(0.012, 0.028, 0.02, skin, 6), s * 0.096, 0, -0.005, head);

  const cap = (sx, sy, sz, tilt, z = -0.01) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    m.scale.set(sx, sy, sz); m.rotation.x = tilt; m.castShadow = true;
    return put(m, 0, 0.045, z, head);
  };
  if (o.hairStyle === 'receding') cap(0.098, 0.095, 0.1, -0.62, -0.022);
  else if (o.hairStyle === 'curly') cap(0.108, 0.115, 0.12, -0.3);
  else if (o.hairStyle !== 'balding') cap(0.101, 0.1, 0.112, -0.35);
  if (o.hairStyle === 'pompadour') put(blob(0.07, 0.042, 0.06, hairMat), 0, 0.125, 0.055, head);
  if (o.hairStyle === 'long') put(blob(0.098, 0.13, 0.05, hairMat), 0, -0.05, -0.085, head);

  // Limbs: a pivot at the shoulder or hip, a second pivot at the elbow or knee.
  // Tracksuit stripes are painted down the outer side of each limb (u = 0.75 is +x, 0.25 is -x).
  const striped = (base, side) => {
    if (o.stripe === undefined) return lambert(base);
    const [c, g] = canvasOf(64);
    g.fillStyle = css(base); g.fillRect(0, 0, 64, 64);
    g.fillStyle = css(o.stripe);
    for (const dx of [-5, 0, 5]) g.fillRect((side > 0 ? 48 : 16) + dx - 1, 0, 2.4, 64);
    return textured(c);
  };

  const long = o.sleeves === 'long' || o.jacket !== undefined;
  const at = o.muscle ? 1.3 : 0.92 + 0.25 * (b - 1); // arm thickness
  const arm = side => {
    const limbMat = o.stripe !== undefined ? striped(upper, side) : sleeveMat;
    const shoulder = new THREE.Group();
    put(shoulder, side * (0.195 * b + 0.04), 1.43, 0);
    shoulder.rotation.z = side * 0.08;
    put(tube([[-0.3, 0.043 * at, 0.043 * at], [-0.15, 0.05 * at, 0.053 * at], [-0.03, 0.055 * at, 0.056 * at], [0.02, 0.035 * at, 0.035 * at]], 8, long ? limbMat : skin), 0, 0, 0, shoulder);
    if (!long) {
      const cuff = o.tee ? -0.13 : -0.19, k = at * (o.tee ? 1.06 : 1.12);
      put(tube([[cuff, 0.05 * k, 0.053 * k], [-0.03, 0.057 * k, 0.058 * k], [0.03, 0.04 * k, 0.04 * k]], 8, sleeveMat), 0, 0, 0, shoulder);
    }
    const elbow = new THREE.Group();
    put(elbow, 0, -0.3, 0, shoulder);
    put(tube([[-0.27, 0.03 * at, 0.032 * at], [-0.12, 0.04 * at, 0.042 * at], [0.01, 0.043 * at, 0.044 * at]], 8, long ? limbMat : skin), 0, 0, 0, elbow);
    put(blob(0.034, 0.05, 0.026, skin, 6), 0, -0.31, 0.005, elbow);
    if (o.watch && side === 1) put(tube([[-0.265, 0.036 * at, 0.038 * at], [-0.24, 0.036 * at, 0.038 * at]], 8, lambert(0xe8c040)), 0, 0, 0, elbow);
    elbow.rotation.x = -0.12;
    return [shoulder, elbow];
  };
  const [armL, elbowL] = arm(1), [armR, elbowR] = arm(-1);

  const lt = 0.9 + 0.2 * b; // leg thickness
  const shoeMat = lambert(0x16120f);
  const leg = side => {
    const pantsMat = striped(o.pants, side);
    const hip = new THREE.Group();
    put(hip, side * 0.085 * b, 0.92, 0);
    put(tube([[-0.44, 0.062 * lt, 0.068 * lt], [-0.2, 0.076 * lt, 0.082 * lt], [0, 0.086 * lt, 0.092 * lt], [0.03, 0.05 * lt, 0.06 * lt]], 8, pantsMat), 0, 0, 0, hip);
    const knee = new THREE.Group();
    put(knee, 0, -0.44, 0, hip);
    put(tube([[-0.43, 0.052 * lt, 0.06 * lt], [-0.2, 0.056 * lt, 0.062 * lt], [0.01, 0.063 * lt, 0.069 * lt]], 8, pantsMat), 0, 0, 0, knee);
    put(blob(0.05, 0.04, 0.13, shoeMat, 6), 0, -0.445, 0.05, knee);
    return [hip, knee];
  };
  const [legL, kneeL] = leg(1), [legR, kneeR] = leg(-1);
  put(tube([[0.84, 0.15 * b, 0.11 * b], [0.93, 0.165 * b, 0.115 * b + belly * 0.5, belly * 0.3]], 12, pantsMat), 0, 0, 0); // seat of the trousers

  return {
    group,
    animate(phase, amp) {
      const s = Math.sin(phase), c = Math.cos(phase);
      legL.rotation.x = -s * 0.6 * amp; legR.rotation.x = s * 0.6 * amp;
      kneeL.rotation.x = Math.max(0, c) * 0.9 * amp; kneeR.rotation.x = Math.max(0, -c) * 0.9 * amp;
      armL.rotation.x = s * 0.5 * amp; armR.rotation.x = -s * 0.5 * amp;
      elbowL.rotation.x = -0.12 - (0.25 + 0.25 * Math.max(0, -s)) * amp;
      elbowR.rotation.x = -0.12 - (0.25 + 0.25 * Math.max(0, s)) * amp;
    },
    sit() {
      legL.rotation.x = legR.rotation.x = -1.5;
      kneeL.rotation.x = kneeR.rotation.x = 1.45;
      armL.rotation.x = armR.rotation.x = -0.35;
      elbowL.rotation.x = elbowR.rotation.x = -1.0;
    },
  };
}

// The crew's looks, taken from the reference image (left to right).
// Hesh runs his record label in this world; Furio only arrives late in the storyline.
export const LOOKS = {
  pussy:      { jacket: 0xa9bcd8, pants: 0xa9bcd8, pattern: 'stripes', tucked: true, hair: 0x14110f, hairStyle: 'curly', bulk: 1.38, skin: 0xd9a57c, brow: 3 },
  tony:       { pattern: 'blocks', shirt: 0x171c44, pants: 0x15151b, hair: 0x2a1c14, hairStyle: 'receding', bulk: 1.42, height: 1.04, skin: 0xe0ae88 },
  christopher: { pattern: 'stripes', shirt: 0xece6dc, pants: 0x4a3324, tucked: true, hair: 0x1c1410, bulk: 0.95, brow: 3 },
  paulie:     { shirt: 0x15141a, open: 0xf4f4f4, tank: true, chain: true, sleeves: 'long', pants: 0x15141a, stripe: 0xc9202a, hair: 0x17120f, hairStyle: 'slick', hairSides: 0xcfcfd4, bulk: 1.05, skin: 0xd9a57c },
  hesh:       { pattern: 'plaid', shirt: 0x8d93cc, pants: 0x6f6f7a, hair: 0x9a9690, hairStyle: 'balding', age: true, bulk: 1.15, skin: 0xe0b090 },
  silvio:     { pattern: 'paisley', shirt: 0x232228, open: 0xf4f4f4, sleeves: 'long', pants: 0x1d1d26, hair: 0x120e0c, hairStyle: 'pompadour', bulk: 1.0 },
  furio:      { shirt: 0x5c6157, tee: true, tucked: true, badge: true, watch: true, muscle: true, pants: 0x15151b, hair: 0x17120f, bulk: 1.2, skin: 0xd09a70 },
};
export const makeLook = name => makeHuman(LOOKS[name]);
export const makeTony = () => makeLook('tony');
