import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mulberry32 } from './grid.js';

// Characters use the CC0 Quaternius base bodies (rigged, ~13k triangles) and animation library.
// The bodies come unclothed, so clothing is painted into each character's texture the way
// PS2-era games did it: every texel knows where it sits on the body (baked once per body),
// and a look decides what garment covers that spot.

const DIR = 'assets/models/';
const MAP = 1024;                 // texture size per character
const STAND_FRAME = 0.25;         // point in the walk cycle whose upper body is used for standing still
const SEAT_HEIGHT = 0.6;          // hip height when sitting in a chair
const bodies = {};                // 'male' | 'female' -> prepared base body
const hairMeshes = {};            // 'parted' | 'buzzed' | 'long' -> mesh
const people = [];                // live characters, advanced by updatePeople
const textures = new Map();       // painted textures, shared between identical looks

const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// Vertex groups, by which bones move a vertex.
const HEAD = 0, TORSO = 1, UPPERARM = 2, LOWERARM = 3, HAND = 4, THIGH = 5, CALF = 6, FOOT = 7, GROUPS = 8;
const groupOf = bone =>
  /^(Head|neck)/.test(bone) ? HEAD : /^(root|pelvis|spine|clavicle)/.test(bone) ? TORSO :
  /^upperarm/.test(bone) ? UPPERARM : /^lowerarm/.test(bone) ? LOWERARM :
  /^thigh/.test(bone) ? THIGH : /^calf/.test(bone) ? CALF : /^(foot|ball)/.test(bone) ? FOOT : HAND;

// The clips each character can play, by state name.
const CLIPS = {
  talk: 'Idle_Talking_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  down: 'Death01',
};

// ---------- Loading ----------

export async function loadPeople() {
  const loader = new GLTFLoader();
  const gltf = file => loader.loadAsync(DIR + file);
  const image = file => new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i); i.onerror = () => reject(new Error('Could not load ' + file));
    i.src = DIR + file;
  });
  const [male, female, anims, parted, buzzed, long, skinLight, skinDark, skinFemale] = await Promise.all([
    gltf('Superhero_Male_FullBody.gltf'), gltf('Superhero_Female_FullBody.gltf'), gltf('UAL1_Standard.glb'),
    gltf('Hair_SimpleParted.gltf'), gltf('Hair_Buzzed.gltf'), gltf('Hair_Long.gltf'),
    image('T_Superhero_Male_Ligh.png'), image('T_Superhero_Male_Dark.png'), image('T_Superhero_Female_Light_BaseColor.png'),
  ]);
  let sourcePelvis = 0.9167;
  anims.scene.traverse(o => { if (o.isBone && o.name === 'pelvis') sourcePelvis = o.position.length(); });
  bodies.male = prepareBody(male.scene, { light: skinLight, dark: skinDark }, anims.animations, sourcePelvis);
  bodies.female = prepareBody(female.scene, { light: skinFemale, dark: skinFemale }, anims.animations, sourcePelvis);
  const firstMesh = scene => { let m; scene.traverse(o => { if (o.isMesh && !m) m = o; }); return m; };
  hairMeshes.parted = firstMesh(parted.scene); hairMeshes.buzzed = firstMesh(buzzed.scene); hairMeshes.long = firstMesh(long.scene);
}

function prepareBody(scene, skins, animations, sourcePelvis) {
  scene.updateMatrixWorld(true);
  let body;
  scene.traverse(o => { if (o.isSkinnedMesh && /superhero/i.test(o.name)) body = o; });
  const geo = body.geometry, bones = body.skeleton.bones;
  const at = name => bones.find(b => b.name === name).getWorldPosition(new THREE.Vector3());
  const pelvis = at('pelvis');
  const J = {
    neck: at('neck_01'), shoulder: at('upperarm_l'), wrist: at('hand_l'), hip: at('thigh_l'), ankle: at('foot_l'),
    waistY: pelvis.y + 0.075, midZ: pelvis.z + 0.03,
  };

  // Per-vertex group weights.
  const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const boneGroup = bones.map(b => groupOf(b.name));
  const vw = new Float32Array(P.count * GROUPS);
  let topY = 0;
  for (let v = 0; v < P.count; v++) {
    for (let k = 0; k < 4; k++) vw[v * GROUPS + boneGroup[SI.getComponent(v, k)]] += SW.getComponent(v, k);
    topY = Math.max(topY, P.getY(v));
  }

  const B = { scene, bodyName: body.name, geometry: geo, vw, J, topY, skins, shapes: new Map(), ...bake(geo, vw) };

  // Animation: keep rotations as they are (the rigs share bone orientations) but drop bone translations,
  // which carry the source mannequin's proportions. Only the hips move, scaled to this body's leg length.
  const ratio = bones.find(b => b.name === 'pelvis').position.length() / sourcePelvis;
  B.clips = {};
  for (const [state, name] of Object.entries(CLIPS)) {
    const src = animations.find(a => a.name === name);
    const tracks = [];
    for (const t of src.tracks) {
      if (t.name.endsWith('.quaternion')) tracks.push(t);
      else if (t.name === 'pelvis.position') {
        const c = t.clone();
        for (let i = 0; i < c.values.length; i++) c.values[i] *= ratio;
        tracks.push(c);
      }
    }
    B.clips[state] = new THREE.AnimationClip(name, src.duration, tracks);
  }

  // The library's idle is a combat-ready stance, so standing still is built instead:
  // straight legs from the A-pose, with the relaxed arms and torso of a mid-stride walk frame.
  const walk = animations.find(a => a.name === 'Walk_Loop'), apose = animations.find(a => a.name === 'A_TPose');
  const still = [];
  for (const t of walk.tracks) {
    const bone = t.name.split('.')[0], legs = /^(root|pelvis|thigh|calf|foot|ball)/.test(bone);
    if (!t.name.endsWith('.quaternion') && t.name !== 'pelvis.position') continue;
    const src = legs ? apose.tracks.find(a => a.name === t.name) : t;
    const values = Array.from(src.createInterpolant().evaluate(legs ? 0 : walk.duration * STAND_FRAME));
    if (t.name === 'pelvis.position') still.push(new THREE.VectorKeyframeTrack(t.name, [0], values.map(v => v * ratio)));
    else still.push(new THREE.QuaternionKeyframeTrack(t.name, [0], values));
  }
  B.clips.idle = new THREE.AnimationClip('Stand', 0.1, still);

  // The library only sits on the ground, so sitting in a chair is posed from the standing pose:
  // thighs forward, shins down, hands toward the lap, hips at seat height.
  const bone = name => bones.find(b => b.name === name), X = new THREE.Vector3(1, 0, 0);
  for (const t of still) {
    const b = bone(t.name.split('.')[0]);
    if (t.name.endsWith('.position')) b.position.fromArray(t.values); else b.quaternion.fromArray(t.values);
  }
  const bend = (name, angle) => {
    scene.updateMatrixWorld(true);
    for (const side of ['_l', '_r']) {
      const b = bone(name + side), pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.premultiply(pw.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(X, angle)).multiply(pw));
    }
  };
  bend('thigh', -1.5); bend('calf', 1.5); bend('upperarm', -0.45); bend('lowerarm', -0.9);
  const hips = bone('pelvis');
  hips.position.multiplyScalar(SEAT_HEIGHT / hips.getWorldPosition(new THREE.Vector3()).y);
  B.clips.sit = new THREE.AnimationClip('Sit', 0.1, still.map(t => {
    const b = bone(t.name.split('.')[0]);
    return t.name.endsWith('.position') ? new THREE.VectorKeyframeTrack(t.name, [0], b.position.toArray()) : new THREE.QuaternionKeyframeTrack(t.name, [0], b.quaternion.toArray());
  }));
  body.skeleton.pose();
  scene.updateMatrixWorld(true);
  return B;
}

// Rasterise the body's triangles into texture space, recording for every texel
// its position on the bind-pose body and its vertex-group weights.
function bake(geo, vw) {
  const S = MAP, N = S * S;
  const pos = new Float32Array(N * 3), grp = new Uint8Array(N * GROUPS), mask = new Uint8Array(N);
  const P = geo.attributes.position, UV = geo.attributes.uv, idx = geo.index;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const ax = UV.getX(a) * S, ay = UV.getY(a) * S, bx = UV.getX(b) * S, by = UV.getY(b) * S, cx = UV.getX(c) * S, cy = UV.getY(c) * S;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
      const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const i = y * S + x;
      mask[i] = 1;
      pos[i * 3] = w0 * P.getX(a) + w1 * P.getX(b) + w2 * P.getX(c);
      pos[i * 3 + 1] = w0 * P.getY(a) + w1 * P.getY(b) + w2 * P.getY(c);
      pos[i * 3 + 2] = w0 * P.getZ(a) + w1 * P.getZ(b) + w2 * P.getZ(c);
      for (let g = 0; g < GROUPS; g++) grp[i * GROUPS + g] = 255 * clamp01(w0 * vw[a * GROUPS + g] + w1 * vw[b * GROUPS + g] + w2 * vw[c * GROUPS + g]);
    }
  }
  // Grow each UV island by a few texels so filtering never pulls in unpainted skin at the seams.
  for (let pass = 0; pass < 3; pass++) {
    const grown = [];
    for (let i = 0; i < N; i++) {
      if (mask[i]) continue;
      const x = i % S, n = x > 0 && mask[i - 1] ? i - 1 : x < S - 1 && mask[i + 1] ? i + 1 : i >= S && mask[i - S] ? i - S : i < N - S && mask[i + S] ? i + S : -1;
      if (n >= 0) grown.push(i, n);
    }
    for (let k = 0; k < grown.length; k += 2) {
      const i = grown[k], n = grown[k + 1];
      mask[i] = 1;
      pos.copyWithin(i * 3, n * 3, n * 3 + 3);
      grp.copyWithin(i * GROUPS, n * GROUPS, n * GROUPS + GROUPS);
    }
  }
  return { pos, grp, mask };
}

// ---------- Shirt prints ----------

const prints = {};
function printData(kind) {
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
  return prints[kind] = g.getImageData(0, 0, 64, 64).data;
}

// ---------- Painting a look onto the body texture ----------

const SHOE = [24, 19, 16], BELT = [19, 19, 23], GOLD = [232, 192, 64], STEEL = [201, 201, 207], BUTTON = [233, 227, 210];

function paint(B, o) {
  const S = MAP, [canvas, g] = canvasOf(S);
  g.drawImage(o.dark ? B.skins.dark : B.skins.light, 0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data, { pos, grp, mask, J, topY } = B;

  const jacket = o.jacket !== undefined, openFront = jacket || o.open !== undefined;
  const outer = rgb(jacket ? o.jacket : o.shirt), inner = rgb(jacket ? o.shirt : o.open ?? 0xffffff), shirt = rgb(o.shirt);
  const pants = rgb(o.pants), hairC = rgb(o.hair), sideC = o.hairSides !== undefined ? rgb(o.hairSides) : null;
  const stripe = o.stripe !== undefined ? rgb(o.stripe) : null;
  const print = o.pattern ? printData(o.pattern) : null, printOuter = print && !jacket, printInner = print && jacket;
  const sleeve = o.sleeves === 'long' || jacket ? 0.96 : o.tee ? 0.3 : 0.45;
  const waistY = J.waistY, hemY = o.tucked ? waistY : waistY - 0.1, neck = J.neck, shoeTop = J.ankle.y + 0.035;
  const armLen = J.wrist.x - J.shoulder.x, legLen = J.hip.y - J.ankle.y;
  const striped = a => { a = Math.abs(a); return a < 0.09 || Math.abs(a - 0.27) < 0.06; };

  let r, gr, b;
  const set = (c, f = 1) => { r = c[0] * f; gr = c[1] * f; b = c[2] * f; };
  const sample = (u, v) => {
    const k = (((Math.floor(v * 64) % 64) + 64) % 64 * 64 + ((Math.floor(u * 64) % 64) + 64) % 64) * 4;
    r = print[k]; gr = print[k + 1]; b = print[k + 2];
  };

  for (let i = 0; i < S * S; i++) {
    if (!mask[i]) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(x), k8 = i * GROUPS, o4 = i * 4;
    const head = grp[k8 + HEAD], torso = grp[k8 + TORSO], arm = grp[k8 + UPPERARM] + grp[k8 + LOWERARM];
    const leg = grp[k8 + THIGH] + grp[k8 + CALF], foot = grp[k8 + FOOT];
    const front = z > J.midZ;
    r = -1;
    let shaded = false; // cloth picks up the body's painted light and shadow

    const torsoPrint = () => sample((Math.atan2(x, z + 0.03) / (Math.PI * 2) + 0.5) * 5, y / 0.17);
    const top = () => {
      const dn = Math.hypot(x, y - neck.y, z - neck.z);
      if (dn < 0.062) return;
      shaded = true;
      if (openFront && front) {
        const half = 0.035 + clamp01((y - waistY) / 0.45) * 0.065;
        if (ax < half) {
          if (o.chain && y < neck.y - 0.02 && Math.abs(Math.hypot(x, y - neck.y - 0.03) - 0.115) < 0.0045) { set(GOLD); shaded = false; return; }
          if (ax < (y - (neck.y - (o.tank ? 0.21 : 0.09))) * 0.55) { shaded = false; return; } // bare chest
          if (ax > half - 0.007) { set(outer, 0.55); return; }                                  // lapel edge
          if (printInner) torsoPrint(); else set(inner);
          return;
        }
      } else if (!openFront && o.tee) {
        if (dn < 0.09) { shaded = false; return; }
      } else if (!openFront && front) {
        const v = (y - (neck.y - 0.12)) * 0.5;
        if (ax < v) { shaded = false; return; }                                                   // open collar
        if (ax < v + 0.028 && dn < 0.17) { set(shirt, 1.18); return; }                            // collar wings
        if (ax < 0.0045) { set(shirt, 0.6); return; }                                             // placket
        const by = (y - waistY) % 0.085;
        if (ax < 0.011 && Math.abs(by - 0.04) < 0.008) { set(BUTTON); return; }
      }
      if (printOuter) torsoPrint(); else set(outer);
    };

    if (head > 128) {
      // Hair is painted on the scalp; hair meshes sit on top of it for the fuller styles.
      const th = Math.atan2(ax, z + 0.01);
      let bottom, hair = true;
      if (o.hairStyle === 'balding') {
        hair = th > 1.15 && y < topY - 0.045;
        bottom = th < 2 ? lerp(topY - 0.085, topY - 0.2, (th - 1.35) / 0.65) : topY - 0.2;
      } else {
        const frontLine = o.hairStyle === 'receding' ? (th < 0.4 ? topY - 0.022 : topY - 0.008) : topY - 0.035;
        bottom = th < 0.75 ? frontLine : th < 1.35 ? lerp(frontLine, topY - 0.085, (th - 0.75) / 0.6) : th < 2 ? lerp(topY - 0.085, topY - 0.2, (th - 1.35) / 0.65) : topY - 0.2;
      }
      if (hair && y > bottom) {
        const a = clamp01((y - bottom) / 0.01), c = sideC && th > 1 && th < 2 && y < topY - 0.055 ? sideC : hairC;
        r = lerp(d[o4], c[0], a); gr = lerp(d[o4 + 1], c[1], a); b = lerp(d[o4 + 2], c[2], a);
      }
    } else if (foot > 128 || y < shoeTop) set(SHOE);
    else if ((leg > 100 && leg >= torso) || (torso > 100 && y < waistY)) {
      if (y > hemY && torso + leg > 100) top();
      else {
        const t = (J.hip.y - y) / legLen;
        set(pants);
        if (stripe && striped(Math.atan2(z - lerp(J.hip.z, J.ankle.z, t), ax - lerp(J.hip.x, J.ankle.x, t)))) set(stripe);
      }
      if (o.tucked && Math.abs(y - waistY) < 0.02) {
        set(BELT); shaded = false;
        if (front && ax < 0.035) set(STEEL);
        else if (o.badge && front && x > 0.075 && x < 0.115) set(GOLD);
      }
    } else if (torso > 90 && torso >= head) {
      top();
      if (o.tucked && Math.abs(y - waistY) < 0.02) { set(BELT); shaded = false; if (front && ax < 0.035) set(STEEL); }
    } else if (arm > 100) {
      const t = (ax - J.shoulder.x) / armLen;
      if (t < sleeve) {
        shaded = true;
        const a = Math.atan2(z - J.shoulder.z, y - J.shoulder.y);
        if (printOuter) sample(a / (Math.PI * 2) * 2, ax / 0.17); else set(outer);
        if (stripe && striped(a)) { set(stripe); shaded = false; }
      } else if (o.watch && x > 0 && t > 0.9 && t < 0.96) set(GOLD);
    }

    if (r < 0) continue;
    if (shaded) {
      const f = Math.max(0.78, Math.min(1.08, 0.5 + 0.5 * (d[o4] + d[o4 + 1] + d[o4 + 2]) / 480));
      r *= f; gr *= f; b *= f;
    }
    d[o4] = r; d[o4 + 1] = gr; d[o4 + 2] = b;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// ---------- Body shape ----------

// Reshape the bind-pose body for a build: `bulk` above 1 thickens the waist, adds a belly and
// heavier limbs; below 1 slims the athletic base down. Skinning weights are untouched.
function shaped(B, bulk) {
  const key = Math.round(bulk * 20);
  if (B.shapes.has(key)) return B.shapes.get(key);
  const k = bulk - 1, J = B.J, src = B.geometry.attributes.position, out = src.clone(), vw = B.vw;
  const chest = 1 + k * 0.45, shoulderShift = J.shoulder.x * (chest - 1), hipShift = J.hip.x * k * 0.3;
  for (let v = 0; v < src.count; v++) {
    let x = src.getX(v), y = src.getY(v), z = src.getZ(v);
    const g = v * GROUPS, tw = vw[g + TORSO], aw = vw[g + UPPERARM] + vw[g + LOWERARM] + vw[g + HAND], lw = vw[g + THIGH] + vw[g + CALF] + vw[g + FOOT];
    const belly = clamp01(1 - Math.abs(y - (J.waistY + 0.1)) / 0.3), s = Math.sign(x);
    if (tw > 0) {
      x *= 1 + tw * (0.03 + k * 0.45 + (0.12 + Math.max(0, k) * 0.4) * belly);
      z = J.midZ + (z - J.midZ) * (1 + tw * (0.03 + k * 0.45 + (0.1 + Math.max(0, k) * 0.6) * belly));
      if (z > J.midZ) z += tw * belly * Math.max(0, k) * 0.2;
    }
    if (aw > 0) {
      const f = 1 + aw * k * 0.5;
      y = J.shoulder.y + (y - J.shoulder.y) * f; z = J.shoulder.z + (z - J.shoulder.z) * f;
      x += s * shoulderShift * aw;
    }
    if (lw > 0) {
      const t = (J.hip.y - y) / (J.hip.y - J.ankle.y), cx = s * lerp(J.hip.x, J.ankle.x, t), cz = lerp(J.hip.z, J.ankle.z, t);
      const fw = vw[g + FOOT], cuff = clamp01((t - 0.45) / 0.5);
      const f = 1 + (lw - fw) * (0.14 + k * 0.45 + 0.4 * cuff * cuff) + fw * 0.2;
      x = cx + (x - cx) * f + s * hipShift * lw; z = cz + (z - cz) * f;
      if (fw > 0.5) y *= 1.25;
    }
    out.setXYZ(v, x, y, z);
  }
  const geo = B.geometry.clone();
  geo.setAttribute('position', out);
  B.shapes.set(key, geo);
  return geo;
}

// ---------- A character ----------

// Options:
//   body       'male' | 'female'
//   dark       use the darker skin texture
//   bulk       1 = the athletic base; above ~1.2 gets a belly, below 1 is slimmer
//   height     overall scale
//   shirt, pants, hair   colours
//   hairStyle  'short' | 'receding' | 'balding' (painted hairline)
//   hairMesh   'parted' | 'buzzed' | 'long' for hair with volume; hairScale stretches it [x, y, z]
//   hairSides  colour of the hair at the temples
//   pattern    'blocks' | 'plaid' | 'paisley' | 'stripes' printed shirt
//   jacket     colour of an open jacket worn over the shirt
//   open       colour of an undershirt showing through an unbuttoned shirt or track top
//   tank       the undershirt is a low-cut tank
//   sleeves    'short' | 'long'
//   tee, tucked, badge, chain, watch   details
//   stripe     colour of side stripes down arms and legs (tracksuit)
export function makeHuman(opts = {}) {
  const o = { body: 'male', shirt: 0xffffff, pants: 0x23232b, hair: 0x2b1b12, bulk: 1, height: 1, hairStyle: 'short', sleeves: 'short', ...opts };
  const B = bodies[o.body];
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.scale.setScalar(o.height);
  const root = cloneSkinned(B.scene);
  group.add(root);

  const { hairMesh, hairScale, bulk, height, ...paintKey } = o;
  const key = JSON.stringify(paintKey);
  if (!textures.has(key)) textures.set(key, paint(B, o));
  const hairMat = new THREE.MeshLambertMaterial({ color: o.hair });

  let headBone;
  root.traverse(n => {
    if (n.isBone && n.name === 'Head') headBone = n;
    if (!n.isSkinnedMesh) return;
    if (n.name === B.bodyName) {
      n.geometry = shaped(B, o.bulk);
      n.material = new THREE.MeshLambertMaterial({ map: textures.get(key) });
      n.castShadow = true;
    } else if (/brow/i.test(n.name)) n.material = hairMat;
  });
  if (hairMesh && hairMeshes[hairMesh]) {
    const hair = new THREE.Mesh(hairMeshes[hairMesh].geometry, hairMat);
    hair.castShadow = true;
    if (hairScale) { // stretch about the crown so the hair stays seated on the head
      hair.scale.set(...hairScale);
      hair.position.set(0, B.topY * (1 - hairScale[1]) * 0.94, 0);
    }
    root.add(hair);
    root.updateMatrixWorld(true);
    headBone.attach(hair);
  }

  const mixer = new THREE.AnimationMixer(root), actions = {};
  const person = {
    group, mixer, state: null,
    // Switch animation: 'idle' | 'talk' | 'walk' | 'run' | 'sprint' | 'sit' | 'down'.
    set(state, speed = 1) {
      if (this.state !== state) {
        const next = actions[state] ??= mixer.clipAction(B.clips[state]);
        if (state === 'down') { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; }
        next.reset().fadeIn(this.state ? 0.2 : 0).play();
        if (this.state) actions[this.state].fadeOut(0.2);
        this.state = state;
      }
      actions[state].timeScale = speed;
    },
  };
  person.set('idle');
  mixer.update(Math.random() * 2); // so a crowd does not move in unison
  people.push(person);
  return person;
}

// Advance every character's animation; ones far from the camera or out of the scene are skipped.
export function updatePeople(dt, eye) {
  for (const p of people) {
    let top = p.group;
    while (top.parent) top = top.parent;
    if (!top.isScene) continue;
    const g = p.group.position;
    if (Math.hypot(g.x - eye.x, g.y - eye.y, g.z - eye.z) < 160) p.mixer.update(dt);
  }
}

// The crew's looks, taken from the reference image (left to right).
// Hesh runs his record label in this world; Furio only arrives late in the storyline.
export const LOOKS = {
  pussy:       { jacket: 0xa9bcd8, pants: 0xa9bcd8, shirt: 0xece6dc, pattern: 'stripes', tucked: true, hair: 0x14110f, hairMesh: 'parted', bulk: 1.38 },
  tony:        { pattern: 'blocks', shirt: 0x171c44, pants: 0x15151b, hair: 0x2a1c14, hairStyle: 'receding', bulk: 1.42, height: 1.04 },
  christopher: { pattern: 'stripes', shirt: 0xece6dc, pants: 0x4a3324, tucked: true, hair: 0x1c1410, hairMesh: 'parted', bulk: 0.92 },
  paulie:      { shirt: 0x15141a, open: 0xf4f4f4, tank: true, chain: true, sleeves: 'long', pants: 0x15141a, stripe: 0xc9202a, hair: 0x17120f, hairMesh: 'parted', hairSides: 0xcfcfd4, bulk: 1.02 },
  hesh:        { pattern: 'plaid', shirt: 0x8d93cc, pants: 0x6f6f7a, hair: 0x9a9690, hairStyle: 'balding', bulk: 1.18 },
  silvio:      { pattern: 'paisley', shirt: 0x232228, open: 0xf4f4f4, sleeves: 'long', pants: 0x1d1d26, hair: 0x120e0c, hairMesh: 'parted', hairScale: [1.03, 1.12, 1.06], bulk: 1.0 },
  furio:       { shirt: 0x5c6157, tee: true, tucked: true, badge: true, watch: true, pants: 0x15151b, hair: 0x17120f, hairMesh: 'long', bulk: 1.08 },
  melfi:       { body: 'female', jacket: 0x3d4658, shirt: 0xf1ede4, pants: 0x3d4658, tucked: true, hair: 0x2a1a14, hairMesh: 'long' },
};
export const makeLook = name => makeHuman(LOOKS[name]);
export const makeTony = () => makeLook('tony');
