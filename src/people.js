import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './grid.js';

// Characters use the CC0 Quaternius base bodies (rigged, ~13k triangles) and animation library.
// The bodies come unclothed and built like superheroes, so two things happen per character:
//   - the mesh is relaxed (muscle definition smoothed away) and reshaped into a clothed
//     silhouette: a shirt that hangs from the chest, trouser legs, shoes, a gut, a jaw;
//   - clothing and face details are painted into the texture the way PS2-era games did it:
//     every texel knows where it sits on the body (baked once per body), and a look decides
//     what covers that spot.

const DIR = 'assets/models/';
const MAP = 1024;                 // texture size per character
const STAND_FRAME = 0.25;         // point in the walk cycle whose upper body is used for standing still
const SEAT_HEIGHT = 0.6;          // hip height when sitting in a chair
const bodies = {};                // 'male' | 'female' -> prepared base body
const hairMeshes = {};            // 'parted' | 'buzzed' | 'long' | 'beard' -> { geometry, map }
const people = [];                // live characters, advanced by updatePeople
const textures = new Map();       // painted textures, shared between identical looks

const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
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
  down: 'Death01', jab: 'Punch_Jab', cross: 'Punch_Cross', hitHead: 'Hit_Head', hitChest: 'Hit_Chest',
  aim: 'Pistol_Aim_Neutral', ready: 'Pistol_Idle_Loop', shoot: 'Pistol_Shoot', kneel: 'Fixing_Kneeling', interact: 'Interact', pickup: 'PickUp_Table',
  crouch: 'Crouch_Idle_Loop', dance: 'Dance_Loop',
  reload: 'Pistol_Reload', stance: 'Idle_Loop',
  jumpStart: 'Jump_Start', jumpLoop: 'Jump_Loop', jumpLand: 'Jump_Land', stroll: 'Walk_Formal_Loop',
};
// Clips that play once and hold their last frame. (uppercut, kick, and the gestures are built in prepareBody.)
const ONCE = new Set(['down', 'jab', 'cross', 'hitHead', 'hitChest', 'shoot', 'kneel', 'interact', 'pickup', 'reload', 'jumpStart', 'jumpLand', 'uppercut', 'kick']);
// Bones of the lower body: a clip can be split into its legs and everything above them, so the legs
// can run while the arms aim, or stay seated while the hands talk.
const LEGS = /^(root|pelvis|thigh|calf|foot|ball)/;

// ---------- Loading ----------

export async function loadPeople() {
  const loader = new GLTFLoader();
  const gltf = file => loader.loadAsync(DIR + file);
  const image = file => new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i); i.onerror = () => reject(new Error('Could not load ' + file));
    i.src = DIR + file;
  });
  const [male, female, anims, parted, buzzed, long, beard, skinLight, skinDark, skinFemale] = await Promise.all([
    gltf('Superhero_Male_FullBody.gltf'), gltf('Superhero_Female_FullBody.gltf'), gltf('UAL1_Standard.glb'),
    gltf('Hair_SimpleParted.gltf'), gltf('Hair_Buzzed.gltf'), gltf('Hair_Long.gltf'), gltf('Hair_Beard.gltf'),
    image('T_Superhero_Male_Ligh.png'), image('T_Superhero_Male_Dark.png'), image('T_Superhero_Female_Light_BaseColor.png'),
  ]);
  let sourcePelvis = 0.9167;
  anims.scene.traverse(o => { if (o.isBone && o.name === 'pelvis') sourcePelvis = o.position.length(); });
  bodies.male = prepareBody(male.scene, { light: skinLight, dark: skinDark }, anims.animations, sourcePelvis, false);
  bodies.female = prepareBody(female.scene, { light: skinFemale, dark: skinFemale }, anims.animations, sourcePelvis, true);
  const hairOf = scene => { let m; scene.traverse(o => { if (o.isMesh && !m) m = o; }); return { geometry: m.geometry, map: m.material.map }; };
  hairMeshes.parted = hairOf(parted.scene); hairMeshes.buzzed = hairOf(buzzed.scene);
  hairMeshes.long = hairOf(long.scene); hairMeshes.beard = hairOf(beard.scene);
}

function prepareBody(scene, skins, animations, sourcePelvis, female) {
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

  // Per-vertex group weights, the top of the head and the tip of the nose (the face's anchor point).
  const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const boneGroup = bones.map(b => groupOf(b.name));
  const vw = new Float32Array(P.count * GROUPS);
  const nose = new THREE.Vector3(0, 0, -1);
  let topY = 0;
  for (let v = 0; v < P.count; v++) {
    for (let k = 0; k < 4; k++) vw[v * GROUPS + boneGroup[SI.getComponent(v, k)]] += SW.getComponent(v, k);
    topY = Math.max(topY, P.getY(v));
    if (vw[v * GROUPS + HEAD] > 0.9 && P.getZ(v) > nose.z) nose.set(0, P.getY(v), P.getZ(v));
  }

  // The relaxed body every build starts from, and the torso's outline measured on it.
  const weld = weldOf(geo);
  const base = new Float32Array(P.count * 3);
  for (let v = 0; v < P.count; v++) { base[v * 3] = P.getX(v); base[v * 3 + 1] = P.getY(v); base[v * 3 + 2] = P.getZ(v); }
  relax(base, weld, v => clamp01(1 - 1.3 * (vw[v * GROUPS + HEAD] + vw[v * GROUPS + HAND])), 7);
  relax(base, weld, v => vw[v * GROUPS + FOOT], 7); // toes melt into the shape of a shoe

  const B = {
    scene, bodyName: body.name, geometry: geo, vw, J, topY, nose, skins, female, weld, base,
    prof: measure(base, vw, J), shapes: new Map(), ...bake(geo, vw, base),
  };

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
    if (/^(index|middle|pinky|ring|thumb)/.test(bone)) { // the walk cycle makes fists; let the hands hang half open
      const open = apose.tracks.find(a => a.name === t.name);
      if (open) new THREE.Quaternion().fromArray(open.createInterpolant().evaluate(0)).slerp(new THREE.Quaternion().fromArray(values), 0.35).toArray(values);
    }
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
  // ----- Moves the library does not have, keyed by hand -----
  // Each key rotates bones about the world's axes from a base pose: x negative swings a hanging limb forward,
  // y twists, z positive swings toward the character's left. `top` clips hold only the upper body.
  const Yax = new THREE.Vector3(0, 1, 0), Zax = new THREE.Vector3(0, 0, 1);
  const poseFrom = (clip, time) => {
    body.skeleton.pose();
    for (const t of clip.tracks) {
      const b = bone(t.name.split('.')[0]);
      if (!b) continue;
      const v = t.createInterpolant().evaluate(Math.min(time, clip.duration));
      if (t.name.endsWith('.position')) b.position.fromArray(v); else b.quaternion.fromArray(v);
    }
  };
  const author = (name, base, baseTime, keys, top = false, sink = 1) => {
    poseFrom(base, baseTime);
    const baseQ = new Map(bones.map(b => [b.name, b.quaternion.clone()])), hip = hips.position.clone().multiplyScalar(sink).toArray();
    const names = bones.map(b => b.name).filter(n => !top || !LEGS.test(n)), values = new Map(names.map(n => [n, []]));
    for (const k of keys) {
      for (const b of bones) b.quaternion.copy(baseQ.get(b.name));
      for (const b of bones) { // parents come before children
        const r = k.rot?.[b.name];
        if (!r) continue;
        scene.updateMatrixWorld(true);
        const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
        const q = new THREE.Quaternion().setFromAxisAngle(Zax, r[2] || 0).multiply(new THREE.Quaternion().setFromAxisAngle(Yax, r[1] || 0)).multiply(new THREE.Quaternion().setFromAxisAngle(X, r[0] || 0));
        b.quaternion.premultiply(pw.clone().invert().multiply(q).multiply(pw));
      }
      for (const n of names) values.get(n).push(...bone(n).quaternion.toArray());
    }
    const times = keys.map(k => k.t), tracks = names.map(n => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, values.get(n)));
    if (!top) tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', [0], hip));
    B.clips[name] = new THREE.AnimationClip(name, times[times.length - 1], tracks);
  };
  const stand = B.clips.idle, R = 'upperarm_r', L = 'upperarm_l', r = 'lowerarm_r', l = 'lowerarm_l';
  // Fists up, knees soft, left foot forward: the guard a fight is fought from, and the two blows that finish a combination.
  const legs = { thigh_l: [-0.42], calf_l: [0.55], thigh_r: [0.16], calf_r: [0.38], spine_01: [0.12] };
  const fists = { ...legs, [R]: [-0.55, 0, 0.18], [r]: [-1.8], [L]: [-0.7, 0, -0.18], [l]: [-1.7] };
  const low = 0.955; // the hips sink as the knees bend
  author('guard', stand, 0, [{ t: 0, rot: fists }, { t: 0.6, rot: { ...fists, spine_02: [0.05] } }, { t: 1.2, rot: fists }], false, low);
  author('uppercut', stand, 0, [
    { t: 0, rot: fists },
    { t: 0.12, rot: { ...fists, spine_01: [0.36, -0.35], [R]: [0.35, 0, 0.1], [r]: [-1.3] } },                  // dip and load the right hand
    { t: 0.24, rot: { ...fists, spine_01: [-0.1, 0.45], [R]: [-1.15, 0, 0.15], [r]: [-1.75] } },                 // drive it up through the chin
    { t: 0.42, rot: { ...fists, spine_01: [-0.06, 0.3], [R]: [-1.3, 0, 0.15], [r]: [-1.8] } },
    { t: 0.62, rot: fists },
  ], false, low);
  author('kick', stand, 0, [
    { t: 0, rot: fists },
    { t: 0.14, rot: { ...fists, spine_01: [-0.1], thigh_r: [-1.25], calf_r: [1.5] } },                          // knee up
    { t: 0.26, rot: { ...fists, spine_01: [-0.3], thigh_r: [-1.5], calf_r: [0.12] } },                          // and out
    { t: 0.4, rot: { ...fists, spine_01: [-0.2], thigh_r: [-1.2], calf_r: [1.35] } },
    { t: 0.62, rot: fists },
  ], false, low);
  // Talking with the hands, over a standing or seated body.
  author('say1', stand, 0, [ // the right hand keeps time
    { t: 0, rot: {} }, { t: 0.3, rot: { [R]: [-0.5, 0, 0.1], [r]: [-1.35] } }, { t: 0.55, rot: { [R]: [-0.5, 0, 0.1], [r]: [-1.0] } },
    { t: 0.8, rot: { [R]: [-0.55, 0, 0.1], [r]: [-1.35], Head: [0.06] } }, { t: 1.05, rot: { [R]: [-0.5, 0, 0.1], [r]: [-1.0] } }, { t: 1.4, rot: { [R]: [-0.45, 0, 0.1], [r]: [-1.25] } },
    { t: 1.9, rot: {} },
  ], true);
  author('say2', stand, 0, [ // both palms open: what do you want from me
    { t: 0, rot: {} }, { t: 0.35, rot: { [R]: [-0.3, 0, -0.22], [r]: [-0.95], [L]: [-0.3, 0, 0.22], [l]: [-0.95], Head: [0.05, 0, 0.06] } },
    { t: 0.9, rot: { [R]: [-0.25, 0, -0.34], [r]: [-0.8], [L]: [-0.25, 0, 0.34], [l]: [-0.8], Head: [0.02, 0, -0.05] } },
    { t: 1.4, rot: { [R]: [-0.3, 0, -0.22], [r]: [-0.95], [L]: [-0.3, 0, 0.22], [l]: [-0.95] } }, { t: 1.9, rot: {} },
  ], true);
  author('say3', stand, 0, [ // a finger at whoever needs to hear it
    { t: 0, rot: {} }, { t: 0.25, rot: { [R]: [-1.25, 0, 0.12], [r]: [-0.25], spine_02: [0.06] } }, { t: 0.5, rot: { [R]: [-1.15, 0, 0.12], [r]: [-0.5], spine_02: [0.06] } },
    { t: 0.75, rot: { [R]: [-1.25, 0, 0.12], [r]: [-0.2], spine_02: [0.06] } }, { t: 1.3, rot: { [R]: [-1.2, 0, 0.12], [r]: [-0.3] } }, { t: 1.8, rot: {} },
  ], true);
  author('phone', stand, 0, [ // a telephone held to the right ear, the head a little toward it
    { t: 0, rot: { [R]: [-0.62, 0, 0.5], [r]: [-2.3], Head: [0.04, 0, -0.1] } }, { t: 1.4, rot: { [R]: [-0.66, 0, 0.5], [r]: [-2.34], Head: [0.1, 0, -0.12] } },
    { t: 2.8, rot: { [R]: [-0.62, 0, 0.5], [r]: [-2.3], Head: [0.04, 0, -0.1] } },
  ], true);
  author('listen', stand, 0, [ // hearing somebody out: the head goes a little to one side, and back
    { t: 0, rot: {} }, { t: 0.5, rot: { Head: [0.05, 0.1, 0.06], spine_02: [0.03] } }, { t: 1.6, rot: { Head: [0.03, 0.06, 0.08], spine_02: [0.04] } }, { t: 2.4, rot: {} },
  ], true);
  author('nod', stand, 0, [{ t: 0, rot: {} }, { t: 0.18, rot: { Head: [0.22] } }, { t: 0.36, rot: { Head: [0.02] } }, { t: 0.54, rot: { Head: [0.18] } }, { t: 0.8, rot: {} }], true);
  author('no', stand, 0, [{ t: 0, rot: {} }, { t: 0.18, rot: { Head: [0, 0.3] } }, { t: 0.42, rot: { Head: [0, -0.3] } }, { t: 0.66, rot: { Head: [0, 0.22] } }, { t: 0.9, rot: {} }], true);
  B.parts = {};
  body.skeleton.pose();
  scene.updateMatrixWorld(true);
  return B;
}

// ---------- Mesh helpers ----------

// Vertices are duplicated along UV seams. Give every distinct position one id and list its neighbours,
// so smoothing and normals treat the body as one continuous surface.
function weldOf(geo) {
  const P = geo.attributes.position, idx = geo.index, id = new Uint32Array(P.count), seen = new Map();
  for (let v = 0; v < P.count; v++) {
    const key = `${Math.round(P.getX(v) * 2e4)},${Math.round(P.getY(v) * 2e4)},${Math.round(P.getZ(v) * 2e4)}`;
    let n = seen.get(key);
    if (n === undefined) seen.set(key, n = seen.size);
    id[v] = n;
  }
  const near = Array.from({ length: seen.size }, () => new Set());
  for (let t = 0; t < idx.count; t += 3) {
    const a = id[idx.getX(t)], b = id[idx.getX(t + 1)], c = id[idx.getX(t + 2)];
    near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b);
  }
  return { id, count: seen.size, near: near.map(s => Uint32Array.from(s)) };
}

// Laplacian smoothing of the positions in `xyz`, by `amount(v)` (0..1) per vertex.
function relax(xyz, weld, amount, passes) {
  const { id, count, near } = weld;
  let p = new Float32Array(count * 3), q = new Float32Array(count * 3);
  const w = new Float32Array(count);
  for (let v = 0; v < id.length; v++) {
    const n = id[v];
    p[n * 3] = xyz[v * 3]; p[n * 3 + 1] = xyz[v * 3 + 1]; p[n * 3 + 2] = xyz[v * 3 + 2];
    w[n] = Math.max(w[n], amount(v));
  }
  for (let pass = 0; pass < passes; pass++) {
    for (let n = 0; n < count; n++) {
      const list = near[n], k = 0.55 * w[n];
      let x = 0, y = 0, z = 0;
      for (const m of list) { x += p[m * 3]; y += p[m * 3 + 1]; z += p[m * 3 + 2]; }
      const inv = list.length ? 1 / list.length : 0;
      q[n * 3] = p[n * 3] + (x * inv - p[n * 3]) * k;
      q[n * 3 + 1] = p[n * 3 + 1] + (y * inv - p[n * 3 + 1]) * k;
      q[n * 3 + 2] = p[n * 3 + 2] + (z * inv - p[n * 3 + 2]) * k;
    }
    [p, q] = [q, p];
  }
  for (let v = 0; v < id.length; v++) {
    const n = id[v];
    xyz[v * 3] = p[n * 3]; xyz[v * 3 + 1] = p[n * 3 + 1]; xyz[v * 3 + 2] = p[n * 3 + 2];
  }
}

// Smooth normals across UV seams.
function weldedNormals(geo, weld) {
  const P = geo.attributes.position, idx = geo.index, { id, count } = weld;
  const acc = new Float32Array(count * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const i = idx.getX(t), j = idx.getX(t + 1), k = idx.getX(t + 2);
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, j).sub(a); c.fromBufferAttribute(P, k).sub(a);
    b.cross(c);
    for (const n of [id[i], id[j], id[k]]) { acc[n * 3] += b.x; acc[n * 3 + 1] += b.y; acc[n * 3 + 2] += b.z; }
  }
  const N = new Float32Array(P.count * 3);
  for (let v = 0; v < P.count; v++) {
    const n = id[v] * 3, l = Math.hypot(acc[n], acc[n + 1], acc[n + 2]) || 1;
    N[v * 3] = acc[n] / l; N[v * 3 + 1] = acc[n + 1] / l; N[v * 3 + 2] = acc[n + 2] / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
}

// The torso's half-width, front depth and back depth by height, measured on the relaxed body.
function measure(base, vw, J) {
  const Y0 = 1, DY = 0.02, n = 30;
  const w = new Float32Array(n), f = new Float32Array(n), b = new Float32Array(n);
  for (let v = 0; v < base.length / 3; v++) {
    const g = v * GROUPS;
    if (vw[g + TORSO] < 0.6 || vw[g + UPPERARM] + vw[g + LOWERARM] > 0.15) continue;
    const i = Math.floor((base[v * 3 + 1] - Y0) / DY), dz = base[v * 3 + 2] - J.midZ;
    if (i < 0 || i >= n) continue;
    w[i] = Math.max(w[i], Math.abs(base[v * 3])); f[i] = Math.max(f[i], dz); b[i] = Math.max(b[i], -dz);
  }
  for (const arr of [w, f, b]) {
    for (let i = 1; i < n; i++) if (arr[i] < 0.02) arr[i] = arr[i - 1];
    for (let pass = 0; pass < 2; pass++) for (let i = 1, prev = arr[0]; i < n - 1; i++) {
      const v = (prev + 2 * arr[i] + arr[i + 1]) / 4;
      prev = arr[i]; arr[i] = v;
    }
  }
  const at = arr => y => {
    const u = Math.max(0, Math.min(n - 1.001, (y - Y0) / DY - 0.5)), i = Math.floor(u);
    return arr[i] + (arr[i + 1] - arr[i]) * (u - i);
  };
  const peak = (arr, y0, y1) => { let m = 0; for (let i = Math.round((y0 - Y0) / DY); i < (y1 - Y0) / DY; i++) m = Math.max(m, arr[i]); return m; };
  const chestW = peak(w, 1.25, 1.5);
  let chestY = 1.3;
  for (let i = 10; i < n; i++) if (w[i] >= chestW * 0.97) { chestY = Y0 + i * DY - 0.03; break; }
  return { w: at(w), f: at(f), b: at(b), chestW, chestY, chestF: peak(f, 1.2, 1.45), backD: peak(b, 1.25, 1.45) };
}

// Rasterise the body's triangles into texture space, recording for every texel
// its position on the relaxed bind-pose body (`xyz`) and its vertex-group weights.
function bake(geo, vw, xyz) {
  const S = MAP, N = S * S;
  const pos = new Float32Array(N * 3), grp = new Uint8Array(N * GROUPS), mask = new Uint8Array(N);
  const UV = geo.attributes.uv, idx = geo.index;
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
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = w0 * xyz[a * 3 + k] + w1 * xyz[b * 3 + k] + w2 * xyz[c * 3 + k];
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
  } else if (kind === 'palms') { // tropical shirt: leaves and blossoms on a warm ground
    fill('#e0563f');
    for (let k = 0; k < 26; k++) {
      const x = r() * 64, y = r() * 64, a = r() * 6.3;
      g.strokeStyle = ['#f6e7b4', '#1f7d6b', '#ffd23f'][k % 3]; g.lineWidth = 1.6;
      for (let leaf = -2; leaf <= 2; leaf++) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + leaf * 0.45) * 7, y + Math.sin(a + leaf * 0.45) * 7); g.stroke();
      }
    }
  } else if (kind === 'pinstripe') { // a suit: chalk lines on charcoal
    fill('#26242c');
    g.fillStyle = 'rgba(220,214,230,.55)';
    for (let k = 2; k < 64; k += 8) g.fillRect(k, 0, 1, 64);
  } else if (kind === 'check') { // a gingham sport shirt
    fill('#f1ece2');
    g.fillStyle = 'rgba(120,30,40,.45)';
    for (let k = 0; k < 64; k += 8) { g.fillRect(k, 0, 4, 64); g.fillRect(0, k, 64, 4); }
  } else { // fine stripes
    fill('#ece6dc');
    g.fillStyle = '#c9c2d2';
    for (let k = 0; k < 64; k += 6) g.fillRect(k, 0, 2, 64);
  }
  return prints[kind] = g.getImageData(0, 0, 64, 64).data;
}

// ---------- Painting a look onto the body texture ----------

const SHOE = [26, 20, 17], BELT = [19, 19, 23], GOLD = [232, 192, 64], STEEL = [201, 201, 207], BUTTON = [233, 227, 210];

// Distance from point (x, y, z) to the segment a-b.
function segDist(x, y, z, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], wx = x - a[0], wy = y - a[1], wz = z - a[2];
  const t = clamp01((wx * vx + wy * vy + wz * vz) / (vx * vx + vy * vy + vz * vz));
  return Math.hypot(wx - vx * t, wy - vy * t, wz - vz * t);
}

function paint(B, o) {
  const S = MAP, [canvas, g] = canvasOf(S);
  g.drawImage(o.dark ? B.skins.dark : B.skins.light, 0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data, { pos, grp, mask, J, topY, nose } = B;

  const jacket = o.jacket !== undefined, openFront = jacket || o.open !== undefined;
  const outer = rgb(jacket ? o.jacket : o.shirt), inner = rgb(jacket ? o.shirt : o.open ?? 0xffffff), shirt = rgb(o.shirt);
  const pants = rgb(o.pants), hairC = rgb(o.hair), sideC = o.hairSides !== undefined ? rgb(o.hairSides) : null;
  const shoe = o.shoes !== undefined ? rgb(o.shoes) : SHOE, sole = o.shoes !== undefined ? [150, 120, 90] : [12, 10, 9];
  const stripe = o.stripe !== undefined ? rgb(o.stripe) : null;
  const tie = o.tie !== undefined ? rgb(o.tie) : null;
  const beard = o.beard !== undefined ? rgb(o.beard) : null, mustache = o.mustache !== undefined ? rgb(o.mustache) : null;
  const goatee = o.goatee !== undefined ? rgb(o.goatee) : null;
  const bikini = o.bikini !== undefined ? rgb(o.bikini) : null;                                      // two pieces and nothing else: a dancer, somebody by a pool
  const tint = o.skin || [1, 1, 1], age = o.age || 0, stubble = o.stubble || 0;
  const print = o.pattern ? printData(o.pattern) : null, printOuter = print && !jacket, printInner = print && jacket;
  const jprint = jacket && o.jacketPattern ? printData(o.jacketPattern) : null;
  const sleeve = bikini ? 0 : o.sleeves === 'long' || jacket ? 0.96 : o.tee ? 0.3 : 0.45;
  const waistY = J.waistY, hemY = o.tucked && !jacket ? waistY : jacket ? waistY - (o.coat !== undefined ? (o.coatLen ?? 0.5) : 0.17) : waistY - 0.1, neck = J.neck;
  const collar = o.collar !== undefined ? rgb(o.collar) : null, turtle = o.turtle !== undefined ? rgb(o.turtle) : null;
  const cuffY = J.ankle.y - 0.03;
  const armLen = J.wrist.x - J.shoulder.x, legLen = J.hip.y - J.ankle.y;
  const prof = B.prof, fill = B.female ? 0.76 : 0.94;
  const striped = a => { a = Math.abs(a); return a < 0.09 || Math.abs(a - 0.27) < 0.06; };

  // Lines on the face, as segments relative to the tip of the nose (mirrored left and right).
  const NY = nose.y, NZ = nose.z;
  const fold = [[0.019, NY - 0.004, NZ - 0.024], [0.033, NY - 0.034, NZ - 0.036]];   // nose to mouth corner
  const frown = [[0.025, NY - 0.031, NZ - 0.031], [0.031, NY - 0.045, NZ - 0.038]];  // mouth corner, turned down

  let r, gr, b, shade;
  const set = (c, f = 1) => { r = c[0] * f; gr = c[1] * f; b = c[2] * f; };
  const mix = (c, a) => { r = lerp(r, c[0], a); gr = lerp(gr, c[1], a); b = lerp(b, c[2], a); };
  const sample = (u, v, from = print) => {
    const k = (((Math.floor(v * 64) % 64) + 64) % 64 * 64 + ((Math.floor(u * 64) % 64) + 64) % 64) * 4;
    r = from[k]; gr = from[k + 1]; b = from[k + 2];
  };
  const outerAt = (u, v) => { if (printOuter) sample(u, v); else if (jprint) sample(u, v, jprint); else set(outer); };

  for (let i = 0; i < S * S; i++) {
    if (!mask[i]) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(x), k8 = i * GROUPS, o4 = i * 4;
    const head = grp[k8 + HEAD], torso = grp[k8 + TORSO], arm = grp[k8 + UPPERARM] + grp[k8 + LOWERARM];
    const leg = grp[k8 + THIGH] + grp[k8 + CALF] + grp[k8 + FOOT];
    const front = z > J.midZ;
    r = -1;
    shade = 0; // > 0 for cloth: the fabric's own light and shadow, replacing the body's painted muscles

    const belt = () => {
      set(BELT); shade = 0;
      if (front && ax < 0.03) set(STEEL);
      else if (o.badge && front && x > 0.075 && x < 0.115) set(GOLD);
    };
    // The upper garment at this texel. `low` is true below the waist, where trousers show through any opening.
    // Returns false where nothing is drawn (bare skin, or trousers when low).
    const top = low => {
      const dn = Math.hypot(x, y - neck.y, z - neck.z);
      if (turtle && dn < 0.1 && y > neck.y - 0.09) { set(turtle, 0.9 + 0.18 * ((((i * 2654435761) >>> 20) & 3) / 3)); shade = 0; return true; } // a roll-neck, ribbed
      if (dn < 0.062) return false;
      if (collar && dn < 0.125 && y > neck.y - 0.115 && !(front && Math.abs(x) < 0.03 && y < neck.y - 0.06)) { set(collar, 0.82 + 0.36 * ((((i * 2246822519) >>> 22) & 7) / 7)); shade = 0; return true; } // fleece: a collar that stands up, mottled
      // The body is widened into its clothes after painting (see shaped), unevenly by height;
      // measure across the finished cloth so edges and prints come out straight.
      const w0 = Math.max(0.03, prof.w(y)), wide = lerp(Math.max(w0, prof.chestW * fill) / w0, 1, smooth((y - prof.chestY) / 0.1));
      const ax = Math.abs(x) * wide, cx = x * wide;
      // Darker under the arms and where the cloth turns away at the sides.
      shade = 1 - 0.16 * clamp01((ax - 0.13) / 0.07) * clamp01((J.shoulder.y - 0.03 - y) / 0.08);
      if (openFront && front) {
        const half = low ? 0.03 + (waistY - y) * 0.3 : 0.035 + clamp01((y - waistY) / 0.45) * 0.065;
        if (ax < half) {
          if (low) return false;
          if (o.tucked && Math.abs(y - waistY) < 0.02) { belt(); return true; }
          if (o.chain && y < neck.y - 0.02 && Math.abs(Math.hypot(cx, y - neck.y - 0.03) - 0.115) < 0.0045) { set(GOLD); shade = 0; return true; }
          const v = y - (neck.y - (o.tank ? 0.21 : 0.09));
          if (ax < v * 0.55) { shade = 0; return false; }                                         // bare chest
          if (tie && ax < 0.017 - Math.max(0, y - neck.y + 0.16) * 0.12 && y < neck.y - 0.085) { set(tie); return true; }
          if (ax < v * 0.55 + 0.02 && !o.tank && jacket) { set(inner, 1.12); return true; }       // shirt collar
          if (printInner) sample(cx / 0.15, y / 0.15); else set(inner);
          if (jacket && ax < 0.004) set(inner, 0.72);                                             // shirt placket
          return true;
        }
        if (jacket) {
          // Lapels: widest at the chest, tapering to the button point, with a notch below the collar.
          const lapel = 0.05 * smooth((y - waistY - 0.06) / 0.2), e = ax - half;
          if (e < lapel) {
            const notch = Math.abs(y - (neck.y - 0.115) - e * 0.6) < 0.006 && e > lapel * 0.35;
            set(outer, notch || e > lapel - 0.006 || e < 0.005 ? 0.62 : 1.1);
            return true;
          }
          if (!low && Math.abs(y - (waistY + 0.035)) < 0.004 && ax > 0.1 && ax < 0.165) { set(outer, 0.62); return true; } // pocket flaps
          if (cx > 0.085 && cx < 0.145 && Math.abs(y - (neck.y - 0.2)) < 0.0035) { set(outer, 0.62); return true; }          // breast pocket
        } else if (ax < half + 0.006) { set(outer, 0.6); return true; }                            // edge of an open shirt
      } else if (!openFront && o.tee) {
        if (dn < 0.09) { shade = 0; return false; }
        if (dn < 0.098) { set(outer, 0.8); return true; }                                         // neck band
      } else if (!openFront && front) {
        const v = (y - (neck.y - 0.1)) * 0.5;
        if (ax < v) { shade = 0; return false; }                                                  // open collar
        if (ax < v + 0.03 && dn < 0.18) { set(shirt, ax > v + 0.024 ? 0.7 : 1.16); return true; } // collar wings
        if (ax < 0.0045) { set(shirt, 0.6); return true; }                                        // placket
        const by = (y - waistY) % 0.085;
        if (ax < 0.011 && Math.abs(by - 0.04) < 0.008) { set(BUTTON); return true; }
        if (!o.tucked && !print && cx > 0.07 && cx < 0.13 && y < neck.y - 0.17 && y > neck.y - 0.24 &&
            (Math.abs(cx - 0.07) < 0.003 || Math.abs(cx - 0.13) < 0.003 || y < neck.y - 0.236)) { set(shirt, 0.72); return true; } // chest pocket
      }
      if (y < hemY + 0.012) { set(outer, 0.72); return true; }                                    // hem
      outerAt(cx / 0.15, y / 0.15);
      return true;
    };

    if (head > 128) {
      // Hair is painted on the scalp; hair meshes sit on top of it for the fuller styles.
      const th = Math.atan2(ax, z + 0.01), fy = y - NY, fz = z - NZ;
      let bottom, hair = true;
      if (o.hairStyle === 'balding') {
        hair = th > 1.15 && y < topY - 0.045;
        bottom = th < 2 ? lerp(topY - 0.085, topY - 0.2, (th - 1.35) / 0.65) : topY - 0.2;
      } else {
        const frontLine = o.hairStyle === 'receding' ? (th < 0.4 ? topY - 0.022 : topY - 0.008) : topY - 0.035;
        bottom = th < 0.75 ? frontLine : th < 1.35 ? lerp(frontLine, topY - 0.085, (th - 0.75) / 0.6) : th < 2 ? lerp(topY - 0.085, topY - 0.2, (th - 1.35) / 0.65) : topY - 0.2;
      }
      r = d[o4] * tint[0]; gr = d[o4 + 1] * tint[1]; b = d[o4 + 2] * tint[2];
      if (hair && y > bottom) {
        const c = sideC && th > 1 && th < 2.2 && y < topY - 0.05 ? sideC : hairC;
        mix(c, clamp01((y - bottom) / 0.01) * (o.hairStyle === 'receding' && th < 0.9 ? 0.72 : 1));
      } else if (fz > -0.14) {
        // The face: whiskers, then the lines of age.
        const lips = ax < 0.027 && Math.abs(fy + 0.031) < 0.008 && fz > -0.04;
        // Where a beard grows: below a line that runs from under the nose, down around the mouth and up to the ear.
        const line = -0.008 - 0.022 * clamp01((ax - 0.025) / 0.02) + 0.05 * clamp01((-fz - 0.075) / 0.05);
        const jaw = clamp01((line - fy) / 0.008) * clamp01((fz + 0.14) / 0.03) * clamp01((fy + 0.12) / 0.03);
        const lip = ax < 0.031 && fy < -0.008 && fy > -0.026 && fz > -0.045; // between nose and mouth
        if (!lips) {
          if (beard) mix(beard, Math.min(1, jaw * 1.4));
          else if (stubble) mix([58, 54, 60], jaw * stubble * 0.5);
          if (mustache && lip) mix(mustache, 0.92 * clamp01((0.031 - ax) / 0.004) * clamp01((-0.008 - fy) / 0.003));
          if (goatee && fz > -0.06) { // a ring around the mouth, filled in over the chin
            const ring = Math.hypot(ax * 0.95, (fy + 0.036) * 0.8);
            mix(goatee, 0.9 * clamp01((0.036 - ring) / 0.005) * (fy < -0.04 ? 1 : clamp01((ring - 0.02) / 0.005)));
          }
        } else if (!B.female) mix([150, 100, 84], 0.45);                                           // quieter lips
        if (age) {
          let dark = 0;
          const fd = segDist(ax, y, z, fold[0], fold[1]);
          if (fd < 0.0045) dark = Math.max(dark, 0.3 * (1 - fd / 0.0045));
          const bag = Math.abs(Math.hypot(ax - 0.032, fy - 0.047) - 0.017);                        // under the eyes
          if (bag < 0.003 && fy < 0.036 && fz > -0.05) dark = Math.max(dark, 0.22 * (1 - bag / 0.003));
          for (const line of [0.082, 0.094, 0.106]) {                                              // forehead
            const dl = Math.abs(fy - line - ax * ax * 3);
            if (dl < 0.0022 && ax < 0.042 && fz > -0.07) dark = Math.max(dark, 0.16 * (1 - dl / 0.0022));
          }
          if (dark) { const f = 1 - dark * age; r *= f; gr *= f; b *= f; }
        }
        if (o.frown) {
          const fd = segDist(ax, y, z, frown[0], frown[1]);
          if (fd < 0.004) { const f = 1 - 0.32 * (1 - fd / 0.004); r *= f; gr *= f; b *= f; }
        }
      }
    } else if (leg > 100 && y < cuffY) {
      if (y < 0.014) set(sole);
      else set(shoe, 1 + 0.5 * clamp01((z - 0.05) / 0.05) * clamp01((y - 0.03) / 0.03));           // shine on the toe cap
    } else if ((leg > 100 && leg >= torso) || (torso > 100 && y < waistY)) {
      if (bikini) {
        const lo = J.hip.y - 0.1 + ax * 0.9, hi = waistY - 0.05;                                   // cut high on the hip
        if (y > lo && y < hi) { set(bikini); shade = y > hi - 0.01 || y < lo + 0.01 ? 0.78 : 1; }
      } else if (!(y > hemY && torso + leg > 100 && top(true))) {
        const t = (J.hip.y - y) / legLen;
        const a = Math.atan2(z - lerp(J.hip.z, J.ankle.z, t), ax - lerp(J.hip.x, J.ankle.x, t));  // 0 = outside, pi/2 = front
        set(pants);
        shade = 1 - 0.14 * clamp01(-Math.cos(a)) * clamp01((0.95 - y) / 0.2);                      // inner leg
        if (stripe && striped(a)) { set(stripe); shade = 1; }
        else if (t > 0.1 && Math.abs(a - Math.PI / 2) < 0.045) shade *= 1.14;                      // pressed crease
        else if (Math.abs(a) < 0.03) shade *= 0.84;                                                // side seam
        if (y < cuffY + 0.014) shade *= 0.72;                                                      // cuff
        if (front && ax < 0.0035 && y > waistY - 0.15) shade *= 0.7;                               // fly
        const pocket = Math.abs((waistY - 0.025 - y) - (ax - 0.085) * 1.6);                        // slanted hip pockets
        if (front && !stripe && pocket < 0.0035 && ax > 0.085 && ax < 0.145) shade *= 0.7;
        if (o.tucked && Math.abs(y - waistY) < 0.02) belt();
      }
    } else if (torso > 90 && torso >= head) {
      if (bikini) {
        const cy = prof.chestY, band = front ? 0.048 - Math.max(0, ax - 0.1) * 0.25 : 0.011;
        if (Math.abs(y - cy) < band) { set(bikini); shade = Math.abs(y - cy) > band - 0.008 ? 0.78 : 1; }
        else if (front && y > cy && y < neck.y - 0.03 && Math.abs(ax - 0.062 + (y - cy) * 0.18) < 0.006) { set(bikini); shade = 0.9; } // the straps, up to the neck
        else if (front && ax < 0.004 && Math.abs(y - cy) < 0.02) { set(bikini); shade = 0.7; }
      } else if (o.tucked && !jacket && Math.abs(y - waistY) < 0.02) belt();
      else top(false);
    } else if (arm > 100) {
      const t = (ax - J.shoulder.x) / armLen;
      if (t < sleeve) {
        const a = Math.atan2(z - J.shoulder.z, y - J.shoulder.y);
        shade = 1 - 0.14 * clamp01(-Math.cos(a));                                                  // underside of the arm
        outerAt(a / (Math.PI * 2) * 2, ax / 0.17);
        if (stripe && striped(a)) { set(stripe); shade = 1; }
        if (t > sleeve - 0.03) shade *= 0.76;                                                      // sleeve hem or cuff
      } else if (jacket && t < sleeve + 0.035) { set(inner); shade = 1; }                          // shirt cuff
      else if (o.watch && x > 0 && t > 0.9 && t < 0.96) set(GOLD);
      else { r = d[o4] * tint[0]; gr = d[o4 + 1] * tint[1]; b = d[o4 + 2] * tint[2]; }
    } else { r = d[o4] * tint[0]; gr = d[o4 + 1] * tint[1]; b = d[o4 + 2] * tint[2]; }

    if (r < 0) { r = d[o4] * tint[0]; gr = d[o4 + 1] * tint[1]; b = d[o4 + 2] * tint[2]; }
    else if (shade) {
      const f = shade * (0.97 + 0.06 * (((i * 2654435761) >>> 24) / 255));                         // a little weave
      r *= f; gr *= f; b *= f;
    }
    d[o4] = r; d[o4 + 1] = gr; d[o4 + 2] = b;
  }
  g.putImageData(img, 0, 0);
  // Edges are decided per texel; a slight blur turns their stair-steps into clean lines.
  const [soft, sg] = canvasOf(S);
  sg.filter = 'blur(0.6px)';
  sg.drawImage(canvas, 0, 0);
  const tex = new THREE.CanvasTexture(soft);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// ---------- Body shape ----------

// Reshape the head: `f` holds amounts for jaw (width of the lower face), cheeks, chin (a second one),
// neck (thickness), nose, jowls (heavy flesh either side of the chin), brow (a heavier ridge over the eyes),
// width (the whole skull) and crown (height of the skull). Works on any point near the head, so beards can follow the face.
function morphHead(B, f, p) {
  const N = B.nose, s = Math.sign(p.x), dy = p.y - N.y, dz = p.z - N.z;
  const bump = (cx, cy, cz, r) => Math.exp(-(((Math.abs(p.x) - cx) / r) ** 2 + ((p.y - cy) / r) ** 2 + ((p.z - cz) / r) ** 2));
  const skull = smooth((p.y - B.J.neck.y + 0.01) / 0.05);
  if (f.width) p.x *= 1 + f.width * skull;
  if (f.crown) p.y += f.crown * 0.03 * smooth((dy - 0.03) / 0.08);
  if (f.jaw) p.x *= 1 + f.jaw * smooth((0.03 - dy) / 0.05) * smooth((dy + 0.14) / 0.05);
  if (f.jowls) { const g = bump(0.046, N.y - 0.078, N.z - 0.052, 0.03) * f.jowls; p.x += s * g * 0.012; p.y -= g * 0.009; p.z += g * 0.004; }
  if (f.brow) { const g = bump(0.028, N.y + 0.052, N.z - 0.024, 0.028) * f.brow; p.z += g * 0.009; p.y += g * 0.002; }
  if (f.neck && dy < -0.03) {
    const m = f.neck * smooth((-0.03 - dy) / 0.04) * smooth((p.y - B.J.neck.y + 0.03) / 0.06);
    p.x *= 1 + m; p.z = B.J.neck.z + (p.z - B.J.neck.z) * (1 + m * 0.8);
  }
  if (f.cheeks) { const g = bump(0.052, N.y - 0.014, N.z - 0.06, 0.032) * f.cheeks; p.x += s * g * 0.011; p.z += g * 0.004; }
  if (f.chin) { const g = bump(0, N.y - 0.088, N.z - 0.062, 0.042) * f.chin; p.z += g * 0.026; p.y -= g * 0.012; }
  if (f.nose) { const g = bump(0, N.y + 0.003, N.z - 0.006, 0.019) * f.nose; p.z += g * 0.011; p.x *= 1 + g * 0.45; p.y -= g * 0.004; }
  return p;
}

// The clothed body for a look: the relaxed base, given a shirt that hangs from the chest, a gut,
// trouser legs and shoes. `bulk` above 1 is heavier, below 1 slimmer. Skinning weights are untouched.
function shaped(B, o) {
  const jacket = o.jacket !== undefined, long = jacket || o.sleeves === 'long', face = o.face || {};
  const key = JSON.stringify([o.bulk, o.belly, jacket, long, !!o.tucked, face]);
  if (B.shapes.has(key)) return B.shapes.get(key);

  const k = o.bulk - 1, kp = Math.max(0, k), fem = B.female, J = B.J, vw = B.vw, base = B.base, prof = B.prof;
  const cloth = jacket ? 1.07 : 1.02;
  const shoulders = (fem ? 0.98 : 0.95) + k * 0.3;
  const fill = (fem ? 0.76 : o.tucked && !jacket ? 0.88 : 0.94) + Math.min(0, k) * 0.25;   // waist, as a share of the chest
  const gut = kp * 0.2 + (o.belly || 0), thick = 1 + k * 0.3, bellyY = J.waistY + 0.05;
  const armScale = (fem ? 0.94 : 0.86) + k * 0.4 + (long ? 0.09 : 0);
  const thighR = (fem ? 0.083 : 0.09) * (1 + k * 0.45), cuffR = (fem ? 0.058 : 0.07) * (1 + k * 0.2), tube = fem ? 0.5 : 0.78;
  const hipShift = J.hip.x * k * 0.3, shoulderShift = J.shoulder.x * (shoulders - 1);
  const legLen = J.hip.y - J.ankle.y, cuffY = J.ankle.y - 0.03;

  const out = new Float32Array(base.length), p = new THREE.Vector3();
  for (let v = 0; v < base.length / 3; v++) {
    let x = base[v * 3], y = base[v * 3 + 1], z = base[v * 3 + 2];
    const g = v * GROUPS, tw = vw[g + TORSO], hw = vw[g + HEAD], s = Math.sign(x);
    const aw = vw[g + UPPERARM] + vw[g + LOWERARM] + vw[g + HAND], lw = vw[g + THIGH] + vw[g + CALF] + vw[g + FOOT];
    if (tw > 0) {
      const up = smooth((y - prof.chestY) / 0.1); // 0 below the chest, 1 at the shoulders
      const w0 = Math.max(0.03, prof.w(y)), f0 = Math.max(0.03, prof.f(y)), b0 = Math.max(0.03, prof.b(y));
      const bell = Math.exp(-(((y - bellyY) / (y > bellyY ? 0.17 : 0.085)) ** 2));
      const wide = Math.max(w0, prof.chestW * fill) * thick * cloth * (1 + kp * 0.45 * bell);
      const deep = Math.max(f0, prof.chestF * (fem ? 0.7 : 0.9)) * (1 + k * 0.25) * cloth + gut * bell;
      const back = Math.max(b0, prof.backD * (fem ? 0.75 : 0.9)) * (1 + k * 0.2) * cloth;
      const dz = z - J.midZ;
      x *= lerp(1, lerp(wide / w0, shoulders, up), tw);
      z = J.midZ + dz * lerp(1, lerp(dz > 0 ? deep / f0 : back / b0, 1 + k * 0.25, up), tw);
    }
    if (aw > 0) {
      const f = lerp(1, armScale, aw - vw[g + HAND] * 0.8);
      y = J.shoulder.y + (y - J.shoulder.y) * f; z = J.shoulder.z + (z - J.shoulder.z) * f;
      x += s * shoulderShift * aw;
    }
    if (lw > 0) {
      const t = (J.hip.y - y) / legLen, cx = s * lerp(J.hip.x, J.ankle.x, t), cz = lerp(J.hip.z, J.ankle.z, t);
      let dx = x - cx, dz = z - cz;
      if (y > cuffY) { // a trouser leg: mostly a tube from thigh to cuff
        const dist = Math.hypot(dx, dz) || 1e-6, want = lerp(dist * (1 + k * 0.3), lerp(thighR, cuffR, t * 1.1), tube * clamp01(t / 0.25 + 0.35));
        const f = lerp(1, want / dist, lw);
        dx *= f; dz *= f;
      } else { // a shoe: wider than the foot, with a toe box
        const u = (z - J.ankle.z) / 0.2; // 0 at the ankle, 1 near the toes
        dx *= 1.25; dz *= 1.08;
        if (y > 0.012 && u > 0.25) y = Math.max(y, lerp(0.064, 0.042, (u - 0.25) / 0.75));
      }
      x = cx + dx + s * hipShift * lw; z = cz + dz;
      if (lw > 0.5 && s * x < 0.004) x = s * 0.004; // the legs never cross the centre line
    }
    if (hw > 0) {
      morphHead(B, face, p.set(x, y, z));
      x = lerp(x, p.x, hw); y = lerp(y, p.y, hw); z = lerp(z, p.z, hw);
    }
    out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
  }
  const geo = B.geometry.clone();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  weldedNormals(geo, B.weld);
  geo.computeBoundingSphere();
  B.shapes.set(key, geo);
  return geo;
}

// ---------- Hair, beards, glasses ----------

const hairGeos = new Map(), hairMats = new Map();

// A hair mesh's geometry for a look: the base mesh, reshaped to follow the face when it is a beard,
// and with a second colour at the temples when the look asks for one.
function hairGeo(B, name, o) {
  const src = hairMeshes[name].geometry, sides = name !== 'beard' && o.hairSides !== undefined;
  const face = o.face && (name === 'beard' || o.face.width || o.face.crown) ? o.face : null; // hair follows a wider or taller skull
  if (!sides && !face) return src;
  const edge = o.hairSidesWidth ?? 0.052;
  const key = JSON.stringify([B.female, name, sides && [o.hair, o.hairSides, edge], face]);
  if (hairGeos.has(key)) return hairGeos.get(key);
  const geo = src.clone(), P = geo.attributes.position, p = new THREE.Vector3();
  if (face) {
    for (let v = 0; v < P.count; v++) { morphHead(B, face, p.fromBufferAttribute(P, v)); P.setXYZ(v, p.x, p.y, p.z); }
    geo.computeVertexNormals();
  }
  if (sides) {
    const top = new THREE.Color(o.hair), side = new THREE.Color(o.hairSides), c = new THREE.Color(), col = new Float32Array(P.count * 3);
    for (let v = 0; v < P.count; v++) {
      const a = clamp01((Math.abs(P.getX(v)) - edge) / 0.018) * clamp01((B.topY - 0.035 - P.getY(v)) / 0.02) * clamp01((0.045 - P.getZ(v)) / 0.03);
      c.copy(top).lerp(side, a).toArray(col, v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  hairGeos.set(key, geo);
  return geo;
}

function hairMat(name, color, vertexColors) {
  const key = `${name},${color},${vertexColors}`;
  if (!hairMats.has(key)) {
    hairMats.set(key, new THREE.MeshLambertMaterial({
      map: hairMeshes[name]?.map ?? null, color: vertexColors ? 0xffffff : color, vertexColors, side: THREE.DoubleSide,
    }));
    // The hair textures are a pale grey shading map; lift the colour so dark hair is not crushed to black.
    if (hairMats.get(key).map) hairMats.get(key).color.multiplyScalar(1.7);
  }
  return hairMats.get(key);
}

const glassesGeos = {};
function glassesGeo(B) {
  const key = B.female ? 'f' : 'm';
  if (glassesGeos[key]) return glassesGeos[key];
  const N = B.nose, y = N.y + 0.042, z = N.z - 0.022, parts = [];
  for (const s of [-1, 1]) {
    const rim = new THREE.TorusGeometry(0.019, 0.0018, 5, 18);
    rim.scale(1.12, 0.86, 1); rim.translate(s * 0.032, y, z);
    const arm = new THREE.CylinderGeometry(0.0013, 0.0013, 0.1, 5);
    arm.rotateX(Math.PI / 2); arm.rotateY(-s * 0.3); arm.translate(s * 0.068, y + 0.003, z - 0.05);
    parts.push(rim, arm);
  }
  const bridge = new THREE.CylinderGeometry(0.0015, 0.0015, 0.022, 5);
  bridge.rotateZ(Math.PI / 2); bridge.translate(0, y + 0.004, z);
  parts.push(bridge);
  const lens = [-1, 1].map(s => { const c = new THREE.CircleGeometry(0.019, 18); c.scale(1.12, 0.86, 1); c.translate(s * 0.032, y, z); return c; });
  return glassesGeos[key] = { frame: mergeGeometries(parts.map(p => p.toNonIndexed())), lens: mergeGeometries(lens) };
}
// Hats sit on the crown: a fedora (crown, band and a brim that dips at the front) or a baseball cap.
const hatGeos = {};
function hatGeo(B, kind) {
  const key = (B.female ? 'f' : 'm') + kind;
  if (hatGeos[key]) return hatGeos[key];
  const top = B.topY, cz = B.nose.z - 0.082, parts = [], bands = [];
  if (kind === 'fedora') {
    const crown = new THREE.CylinderGeometry(0.088, 0.1, 0.11, 18).scale(1.06, 1, 1.16).translate(0, top + 0.005, cz);
    const dent = crown.attributes.position; // pinch the crown's top at the front
    for (let i = 0; i < dent.count; i++) if (dent.getY(i) > top + 0.05 && dent.getZ(i) > cz) dent.setY(i, dent.getY(i) - 0.014 * clamp01((dent.getZ(i) - cz) / 0.09));
    crown.computeVertexNormals();
    const brim = new THREE.CylinderGeometry(0.165, 0.165, 0.005, 24).scale(1, 1, 1.14).rotateX(0.16).translate(0, top - 0.046, cz + 0.012);
    parts.push(crown, brim);
    bands.push(new THREE.CylinderGeometry(0.102, 0.104, 0.024, 18).scale(1.06, 1, 1.16).translate(0, top - 0.032, cz));
  } else { // cap
    const dome = new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.08).translate(0, top - 0.07, cz);
    const peak = new THREE.CylinderGeometry(0.1, 0.1, 0.006, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.3).rotateX(0.2).translate(0, top - 0.068, cz + 0.095);
    parts.push(dome, peak);
    bands.push(new THREE.SphereGeometry(0.012, 6, 4).translate(0, top + 0.03, cz));
  }
  return hatGeos[key] = { hat: mergeGeometries(parts.map(p => p.toNonIndexed())), band: mergeGeometries(bands.map(p => p.toNonIndexed())) };
}
const hatMats = new Map();
const hatMat = color => hatMats.get(color) ?? hatMats.set(color, new THREE.MeshLambertMaterial({ color })).get(color);

const frameMat = new THREE.MeshLambertMaterial({ color: 0x1a1512 });
const pistolMat = new THREE.MeshPhongMaterial({ color: 0x1c1c22, shininess: 60, specular: 0x666666 });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x6a4a34 });
const shadeMat = new THREE.MeshBasicMaterial({ color: 0x0b0b10 });
const lensMat = new THREE.MeshBasicMaterial({ color: 0xcfe4ee, transparent: true, opacity: 0.22, depthWrite: false });

// ---------- A character ----------

// Options:
//   body       'male' | 'female'
//   dark       use the darker skin texture; skin [r, g, b] tints it (a tan, a pale face)
//   bulk       1 = an ordinary build; above ~1.2 gets a belly, below 1 is slimmer; belly adds more gut (metres)
//   height     overall scale; head scales the head alone
//   face       { jaw, cheeks, chin, neck, nose } amounts that reshape the head (0 = the base face)
//   age        0..1 lines on the face; stubble 0..1; beard, mustache, goatee colours; frown
//   shirt, pants, hair, shoes   colours
//   hairStyle  'short' | 'receding' | 'balding' (painted hairline)
//   hairMesh   'parted' | 'buzzed' | 'long' for hair with volume; hairScale stretches it [x, y, z], hairShift moves it
//   hairSides  colour of the hair at the temples
//   beardMesh  a full beard with volume, in the beard colour
//   glasses    'clear' | 'shades'; glassesScale makes them larger
//   hat        'fedora' | 'cap', in hatColor, with hatBand for the band or button
//   pattern    'blocks' | 'plaid' | 'paisley' | 'palms' | 'stripes' | 'pinstripe' | 'check' printed shirt
//   jacket     colour of an open jacket worn over the shirt; jacketPattern prints the jacket; tie adds a tie in that colour
//   coat       colour of a long coat (a jacket that falls to the knee: coatLen metres below the waist, 0.5 by default)
//   collar     colour of a thick fleece collar on the coat or jacket; turtle colour of a roll-neck under it
//   open       colour of an undershirt showing through an unbuttoned shirt or track top
//   tank       the undershirt is a low-cut tank
//   sleeves    'short' | 'long'
//   tee, tucked, badge, chain, watch   details
//   stripe     colour of side stripes down arms and legs (tracksuit)
export function makeHuman(opts = {}) {
  const o = { body: 'male', shirt: 0xffffff, pants: 0x23232b, hair: 0x2b1b12, bulk: 1, height: 1, head: 1.06, hairStyle: 'short', sleeves: 'short', ...opts };
  if (o.coat !== undefined && o.jacket === undefined) o.jacket = o.coat; // a coat is a jacket that goes on down
  const B = bodies[o.body];
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.scale.setScalar(o.height);
  const root = cloneSkinned(B.scene);
  root.position.y = 0.04; // the clips plant the heels a little under the ground; stand on top of it
  group.add(root);

  const { hairMesh, hairScale, hairShift, beardMesh, glasses, glassesScale, hat, hatColor, hatBand, bulk, belly, height, head, face, ...paintKey } = o;
  const key = JSON.stringify(paintKey);
  if (!textures.has(key)) textures.set(key, paint(B, o));

  let headBone;
  root.traverse(n => {
    if (n.isBone && n.name === 'Head') headBone = n;
    if (!n.isSkinnedMesh) return;
    if (n.name === B.bodyName) {
      n.geometry = shaped(B, o);
      n.material = new THREE.MeshLambertMaterial({ map: textures.get(key) });
      n.castShadow = true;
    } else if (/brow/i.test(n.name)) n.material = hairMat('brow', o.brows ?? o.hair, false);
  });

  // Rigid pieces that ride on the head bone.
  const wear = (geometry, material, scale, shift) => {
    const m = new THREE.Mesh(geometry, material);
    if (scale) { // stretch about the crown so the hair stays seated on the head
      m.scale.set(...scale);
      m.position.set(0, B.topY * (1 - scale[1]) * 0.94, 0);
    }
    if (shift) m.position.add(new THREE.Vector3(...shift));
    root.add(m);
    root.updateMatrixWorld(true);
    headBone.attach(m);
    return m;
  };
  if (hairMesh && hairMeshes[hairMesh]) wear(hairGeo(B, hairMesh, o), hairMat(hairMesh, o.hair, o.hairSides !== undefined), hairScale, hairShift).castShadow = true;
  if (beardMesh) wear(hairGeo(B, 'beard', o), hairMat('beard', o.beard ?? o.hair, false));
  if (glasses) {
    const geo = glassesGeo(B), gs = glassesScale ? [glassesScale, glassesScale, 1] : null, N = B.nose;
    const seat = gs && [0, (N.y + 0.042 - B.topY * 0.94) * (1 - glassesScale), 0]; // scale about the bridge, not the crown
    wear(geo.frame, frameMat, gs, seat);
    wear(geo.lens, glasses === 'shades' ? shadeMat : lensMat, gs, seat);
  }
  if (hat) {
    const geo = hatGeo(B, hat);
    wear(geo.hat, hatMat(hatColor ?? (hat === 'cap' ? 0x2f56c8 : 0x3a3230))).castShadow = true;
    wear(geo.band, hatMat(hatBand ?? (hat === 'cap' ? hatColor ?? 0x2f56c8 : 0x1a1512)));
  }
  headBone.scale.setScalar(o.head);

  // Guns in the right hand, shown only while armed: a pistol, a submachine gun, a shotgun.
  let handBone;
  root.traverse(n => { if (n.isBone && n.name === 'hand_r') handBone = n; });
  const guns = {};
  const gun = (kind, parts) => {
    const grp = new THREE.Group();
    for (const [w, h, d, x, y, z, rx, mat] of parts) { const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || pistolMat); part.position.set(x, y, z); part.rotation.x = rx; grp.add(part); }
    grp.position.set(0.02, -0.04, 0.06); grp.rotation.set(-1.4, 0.2, -1.55);
    grp.visible = false;
    handBone?.add(grp);
    guns[kind] = grp;
  };
  gun('pistol', [[0.024, 0.034, 0.17, 0, 0.02, 0.05, 0], [0.022, 0.09, 0.032, 0, -0.035, -0.02, 0.3]]);
  gun('smg', [[0.03, 0.05, 0.3, 0, 0.02, 0.1, 0], [0.022, 0.09, 0.032, 0, -0.035, -0.02, 0.3], [0.024, 0.13, 0.03, 0, -0.05, 0.1, 0], [0.018, 0.018, 0.1, 0, 0.03, 0.3, 0], [0.03, 0.03, 0.12, 0, 0.02, -0.1, 0, woodMat]]);
  gun('shotgun', [[0.028, 0.028, 0.5, 0, 0.03, 0.22, 0], [0.034, 0.034, 0.22, 0, 0.0, 0.2, 0, woodMat], [0.022, 0.09, 0.032, 0, -0.035, -0.02, 0.3, woodMat], [0.03, 0.07, 0.18, 0, -0.01, -0.12, 0.15, woodMat]]);
  gun('rifle', [[0.03, 0.05, 0.36, 0, 0.02, 0.12, 0], [0.018, 0.018, 0.26, 0, 0.03, 0.42, 0], [0.022, 0.09, 0.032, 0, -0.035, -0.02, 0.3], [0.026, 0.15, 0.04, 0, -0.06, 0.14, 0.25], [0.028, 0.06, 0.24, 0, 0.0, -0.2, 0], [0.012, 0.03, 0.03, 0, 0.06, 0.3, 0]]);
  gun('phone', [[0.055, 0.02, 0.13, 0, 0.012, 0.02, 0, new THREE.MeshLambertMaterial({ color: 0x16161c })], [0.006, 0.006, 0.09, 0.02, 0.012, 0.12, 0]]); // a telephone, of the years when they had aerials
  const pistol = guns.pistol;
  // A long gun he owns but is not holding hangs across his back, on its sling.
  let spineBone = null;
  root.traverse(n => { if (n.isBone && !spineBone && /spine_0?3|spine3|chest|upperchest/i.test(n.name)) spineBone = n; });
  if (!spineBone) root.traverse(n => { if (n.isBone && /spine/i.test(n.name)) spineBone = n; });
  const slung = {};
  for (const kind of ['smg', 'shotgun', 'rifle']) {
    const copy = guns[kind].clone(true);
    copy.visible = false;
    const holder = new THREE.Group();
    holder.add(copy); copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0);
    holder.position.set(0.02, 0.1, -0.16); holder.rotation.set(Math.PI / 2 - 0.5, 0, 0.5); // barrel down, across the shoulder blades
    spineBone?.add(holder);
    slung[kind] = copy;
  }

  const mixer = new THREE.AnimationMixer(root), actions = {};
  // 'run', or one half of it: 'run|legs', 'aim|top'.
  const clipOf = key => {
    const [state, part] = key.split('|');
    if (!part) return B.clips[state];
    return B.parts[key] ??= new THREE.AnimationClip(key, B.clips[state].duration, B.clips[state].tracks.filter(t => LEGS.test(t.name) === (part === 'legs')));
  };
  const person = {
    group, mixer, state: null, after: null, pistol, base: null, upper: null, topKey: null, topOnce: null,
    // Switch animation: 'idle' | 'talk' | 'walk' | 'run' | 'sprint' | 'sit' | 'down' | 'aim' | ... (see CLIPS).
    set(state, speed = 1) {
      const whole = ONCE.has(state) || !this.upper, key = whole ? state : state + '|legs'; // one-shots take the whole body
      if (this.base !== key) {
        const next = actions[key] ??= mixer.clipAction(clipOf(key));
        if (ONCE.has(state)) { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; }
        next.reset().fadeIn(this.base ? 0.15 : 0).play();
        if (this.base) actions[this.base].fadeOut(0.15);
        this.base = key;
      }
      this.state = state;
      actions[key].timeScale = speed;
      if (this.topKey) actions[this.topKey].setEffectiveWeight(whole ? 0 : 1);
    },
    // Play a one-shot clip (a punch, a flinch), then go back to `then`. `busy` is true meanwhile.
    play(state, then = 'idle', speed = 1) {
      const prev = this.base;
      this.after = then;
      this.base = null; // so the same clip can be played again at once
      this.set(state, speed);
      if (prev && prev !== this.base) actions[prev].fadeOut(0.15);
    },
    // The upper body does something of its own while the legs carry on: aim, shoot, reload, a gesture.
    // `once` plays it through and returns to the looping layer that was there (or to none).
    layer(state, { once = false, speed = 1 } = {}) {
      if (!once && this.topOnce) { this.topOnce.back = state; return; }
      const key = state ? state + '|top' : null, back = this.topOnce ? this.topOnce.back : this.upper;
      if (key === this.topKey && !once) return;
      if (this.topKey && this.topKey !== key) actions[this.topKey].fadeOut(0.14);
      if (key) {
        const a = actions[key] ??= mixer.clipAction(clipOf(key));
        a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
        a.reset().setEffectiveWeight(1).fadeIn(0.12).play(); a.timeScale = speed;
        if (once) this.topOnce = { key, back };
      }
      this.upper = state; this.topKey = key;
      if (this.state && !this.busy) { const st = this.state, sp = actions[this.base]?.timeScale ?? 1; this.set(st, sp); } // swap the base for its legs, or back
    },
    // Get up from the ground: the fall, run backwards.
    rise(then = 'idle') {
      const a = actions.down;
      if (!a || this.base !== 'down') { this.set(then); return; }
      this.after = then; this.state = 'rise';
      a.paused = false; a.enabled = true; a.timeScale = -1.7; a.time = a.getClip().duration; a.play();
    },
    get busy() { return this.after !== null; },
    arm(on) { for (const k in guns) guns[k].visible = on === true ? k === 'pistol' : on === k; },
    // Which long guns hang on his back: a list of kinds (the one in his hands is never among them).
    sling(kinds = []) { let n = 0; for (const k in slung) { slung[k].visible = kinds.includes(k) && n === 0; if (slung[k].visible) n++; } },
  };
  mixer.addEventListener('finished', e => {
    if (person.topOnce && e.action === actions[person.topOnce.key]) { const back = person.topOnce.back; person.topOnce = null; person.layer(back); return; }
    if (person.after !== null && e.action === actions[person.base]) { const then = person.after; person.after = null; person.set(then); }
  });
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
  // ----- Nexus (Blade Runner 2049). Generic figures in the film's wardrobe: build, hair and clothes, not anybody's face. -----
  k: { coat: 0x2f3a2e, coatLen: 0.55, collar: 0xb9a58a, shirt: 0x2a2a30, turtle: 0x2a2a30, pants: 0x23232b, shoes: 0x1c1c22, hair: 0x3a2a1c, hairMesh: 'buzzed', hairScale: [1.02, 1.1, 1.04], bulk: 1.02, stubble: 0.25, face: { jaw: 0.08, brow: 0.3, cheeks: -0.3 } },
  joi: { body: 'female', coat: 0xdfe8f0, coatLen: 0.5, shirt: 0xffd9a8, pants: 0xcfd8e6, shoes: 0xdfe8f0, hair: 0x1c1410, hairMesh: 'long', hairScale: [1.06, 0.82, 1.06], skin: [1.02, 0.98, 0.98] },
  joshi: { body: 'female', coat: 0x1c1c22, coatLen: 0.4, shirt: 0x2a2a30, turtle: 0x2a2a30, pants: 0x1c1c22, hair: 0x2b1b12, hairMesh: 'parted', hairScale: [1.04, 0.96, 1.08], age: 0.4, face: { cheeks: -0.3, jaw: -0.1 } },
  luv: { body: 'female', coat: 0xf4f4f6, coatLen: 0.55, shirt: 0xf4f4f6, turtle: 0xf4f4f6, pants: 0xf4f4f6, shoes: 0xf4f4f6, hair: 0x111111, hairMesh: 'long', hairScale: [1.04, 0.78, 1.04], skin: [1, 0.97, 0.96], face: { cheeks: -0.5, jaw: -0.15 } },
  wallace: { coat: 0x1a1a1e, coatLen: 0.7, shirt: 0x1a1a1e, turtle: 0x1a1a1e, pants: 0x1a1a1e, hair: 0x8a8278, hairMesh: 'parted', hairScale: [1.02, 1.0, 1.06], bulk: 0.92, age: 0.5, skin: [1.02, 1, 0.96], face: { cheeks: -0.5, chin: 0.2 } },
  sapper: { jacket: 0x3a3a34, shirt: 0x6a6a5a, sleeves: 'long', pants: 0x3a3a34, shoes: 0x2a2420, hair: 0x2b1b12, hairStyle: 'balding', beard: 0x3a2a1c, beardMesh: true, bulk: 1.38, belly: 0.03, height: 1.08, age: 0.5, face: { jaw: 0.22, brow: 0.5, neck: 0.4 } },
  coco: { jacket: 0xf4f4f0, shirt: 0x5fb0a8, tee: true, pants: 0x3a3a44, hair: 0x111111, hairMesh: 'buzzed', dark: true, glasses: 'clear', bulk: 0.95 },
  cotton: { jacket: 0x5a4a3a, shirt: 0xd9c7a0, sleeves: 'long', tucked: true, pants: 0x3a3028, hair: 0x9a9690, hairStyle: 'receding', glasses: 'clear', glassesScale: 1.2, bulk: 1.1, age: 0.8, stubble: 0.4, face: { cheeks: 0.4, jowls: 0.4 } },
  stelline: { body: 'female', jacket: 0xf4f4f6, shirt: 0xe9e9ee, pants: 0xf4f4f6, shoes: 0xf4f4f6, hair: 0x7a3b1a, hairMesh: 'long', hairScale: [1.04, 1.02, 1.04], skin: [1.04, 1.0, 0.98], bulk: 0.9 },
  mariette: { body: 'female', coat: 0x3a2a3a, coatLen: 0.4, shirt: 0xff3fa8, pants: 0x1c1c22, hair: 0xff3fa8, hairMesh: 'long', hairScale: [1.02, 0.8, 1.02] },
  freysa: { body: 'female', coat: 0x4a4a52, coatLen: 0.55, shirt: 0x3a3a44, turtle: 0x3a3a44, pants: 0x2a2a30, hair: 0xdcdad4, hairMesh: 'parted', age: 0.6, glasses: 'clear' },
  replicant: { coat: 0x2a2a30, coatLen: 0.5, shirt: 0x3a3a44, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', bulk: 1.1 },
  pussy: { // the biggest man in the room: a round face on no neck, slicked hair, a loose two-piece in powder blue
    jacket: 0xa9bcd8, pants: 0xa9bcd8, shirt: 0xece6dc, pattern: 'stripes', tucked: true, shoes: 0xe9e4da, chain: true,
    hair: 0x14110f, hairMesh: 'parted', hairScale: [1.06, 0.92, 1.06], bulk: 1.5, belly: 0.015, height: 1.02, head: 1.12,
    face: { jaw: 0.3, cheeks: 1.4, chin: 1.6, neck: 0.35, nose: 0.3, jowls: 1.2, width: 0.05 }, age: 0.45, stubble: 0.35, skin: [1, 0.94, 0.86],
  },
  tony: { // a bull: thick neck, heavy brow and jowls, the hairline going at the temples, a bowling shirt over slacks
    pattern: 'blocks', shirt: 0x171c44, open: 0xf4f4f4, chain: true, pants: 0x15151b, hair: 0x2a1c14, hairStyle: 'receding', hairMesh: 'buzzed', hairScale: [1.02, 1.0, 0.94], hairShift: [0, 0.004, -0.012],
    bulk: 1.4, belly: 0.01, height: 1.05, head: 1.12, watch: true,
    face: { jaw: 0.26, cheeks: 1.1, chin: 1.3, neck: 0.32, nose: 0.5, jowls: 1, brow: 0.6, width: 0.04 }, age: 0.55, stubble: 0.4, skin: [1, 0.95, 0.88],
  },
  christopher: { // young and narrow: a long nose, hair slicked back, a leather jacket over a striped shirt and a chain
    jacket: 0x24201f, shirt: 0xece6dc, pattern: 'stripes', pants: 0x2b2b3a, tucked: true, chain: true, hair: 0x1c1410, hairMesh: 'parted', hairScale: [1, 1.12, 1.05], hairShift: [0, 0.002, -0.006], bulk: 0.94,
    face: { jaw: -0.04, cheeks: -0.5, nose: 0.9, brow: 0.25, crown: 0.3 }, stubble: 0.45,
  },
  paulie: { // the silver wings over the ears, a pointed face, pale; a tracksuit with white sneakers
    shirt: 0x15141a, open: 0xf4f4f4, tank: true, chain: true, sleeves: 'long', pants: 0x15141a, stripe: 0xc9202a, shoes: 0xf2efe8,
    hair: 0x17120f, hairMesh: 'parted', hairSides: 0xd8d8de, hairSidesWidth: 0.04, hairScale: [1.02, 1.1, 1.06], bulk: 1.0,
    face: { cheeks: -0.6, nose: 0.55, jaw: 0.0, brow: 0.4, jowls: 0.35, chin: 0.2 }, age: 1, skin: [1, 0.9, 0.8], brows: 0x3a3632,
  },
  hesh: {
    pattern: 'plaid', shirt: 0x8d93cc, pants: 0x6f6f7a, hair: 0xb9b6b0, hairStyle: 'balding', bulk: 1.2,
    face: { jaw: 0.08, chin: 0.6, nose: 0.8, cheeks: 0.3, brow: 0.3, jowls: 0.4 }, age: 1, beard: 0xd6d3cc, beardMesh: true, brows: 0x9a9690,
  },
  silvio: { // the pompadour, the set mouth, a pinstripe suit over a paisley shirt
    jacket: 0x26242c, jacketPattern: 'pinstripe', pattern: 'paisley', shirt: 0x232228, pants: 0x26242c, tucked: true, hair: 0x120e0c, hairMesh: 'parted', hairScale: [1.06, 1.32, 1.14], hairShift: [0, 0.012, 0.012], bulk: 1.08,
    face: { jaw: 0.14, cheeks: 0.5, chin: 0.7, nose: 0.35, jowls: 0.7, brow: 0.35 }, age: 0.6, frown: true, stubble: 0.3,
  },
  furio: {
    shirt: 0x5c6157, tee: true, tucked: true, badge: true, watch: true, pants: 0x15151b, hair: 0x17120f, hairMesh: 'long', bulk: 1.08,
    face: { jaw: 0.05, nose: 0.6, cheeks: -0.2, brow: 0.3 }, goatee: 0x1d1714, stubble: 0.6, age: 0.3,
  },
  melfi: { body: 'female', jacket: 0x3d4658, shirt: 0xf1ede4, pants: 0x3d4658, tucked: true, hair: 0x2a1a14, hairMesh: 'long', hairScale: [1.08, 1.04, 1.06], glasses: 'clear', age: 0.2, face: { cheeks: 0.2 } },

  // Family, and the people of episode one.
  carmela: { body: 'female', jacket: 0xf7a8c4, shirt: 0xf5f0e6, pants: 0xf5f0e6, tucked: true, shoes: 0xf2efe8, chain: true, hair: 0xd9b25a, hairMesh: 'long', hairScale: [1.12, 1.16, 1.1], age: 0.3, face: { cheeks: 0.3, chin: 0.2 } },
  meadow: { body: 'female', shirt: 0x9fd0f5, tee: true, pants: 0x3b6ea8, shoes: 0xf2efe8, hair: 0x2a1a14, hairMesh: 'long', height: 0.95 },
  aj: { pattern: 'stripes', shirt: 0xece6dc, tee: true, pants: 0x3b6ea8, shoes: 0xf2efe8, hair: 0x3a2a1c, hairMesh: 'parted', bulk: 1.22, height: 0.8, head: 1.24, face: { cheeks: 1.2, jaw: 0.1 } },
  livia: {
    body: 'female', jacket: 0x8a6f8f, shirt: 0xe9e2d2, pants: 0x4a4652, tucked: true, hair: 0xc4c1bb, hairMesh: 'parted', hairShift: [0, -0.045, 0.004], hairScale: [1.04, 1.02, 1.06],
    bulk: 1.12, height: 0.92, age: 1, brows: 0x9a9690, face: { jaw: 0.1, cheeks: -0.3, chin: 0.4, jowls: 0.6 }, frown: true,
  },
  junior: { // the big glasses, the beak, the sunken cheeks
    jacket: 0xb9a58a, shirt: 0xf4f4f4, tie: 0x6a1c2c, tucked: true, pants: 0x4a4652, hair: 0xb9b6b0, hairStyle: 'balding', glasses: 'clear', glassesScale: 1.3, brows: 0x9a9690,
    bulk: 0.96, height: 0.97, age: 1, face: { nose: 0.95, cheeks: -0.6, jaw: 0.04, jowls: 0.4, brow: 0.3 }, frown: true,
  },
  artie: { shirt: 0xf4f4f4, sleeves: 'long', pants: 0x2b2b3a, hair: 0x1c1410, hairStyle: 'receding', hairMesh: 'buzzed', hairScale: [1.02, 1, 0.94], hairShift: [0, 0.004, -0.012], bulk: 1.18, face: { cheeks: 0.7, nose: 0.5, chin: 0.5 }, stubble: 0.3, age: 0.4 },
  kolar: { jacket: 0x1c1c22, shirt: 0xf4f4f4, tee: true, pants: 0x3b4a66, hair: 0xc9a14a, hairMesh: 'parted', bulk: 1.02, face: { jaw: 0.12 }, stubble: 0.2 },
  // Episode two.
  brendan: { jacket: 0x2a1c14, shirt: 0x8a1c1c, tee: true, pants: 0x2b2b3a, hair: 0x1c1410, hairMesh: 'parted', hairScale: [1, 1.08, 1.03], bulk: 0.9, stubble: 0.6, face: { cheeks: -0.5, nose: 0.4 }, chain: true },
  jackie: { jacket: 0x23232b, shirt: 0xe9e2d2, tucked: true, pants: 0x23232b, hair: 0x17120f, hairMesh: 'parted', hairScale: [1.02, 0.96, 1.03], bulk: 0.9, age: 0.7, skin: [0.96, 0.97, 0.94], face: { cheeks: -0.6, jaw: 0.05 } },
  georgie: { shirt: 0x15141a, sleeves: 'long', tucked: true, pants: 0x15141a, hair: 0x2b1b12, hairStyle: 'balding', mustache: 0x2b1b12, bulk: 1.12, age: 0.4, face: { cheeks: 0.6, chin: 0.5 } },
  miller: { pattern: 'plaid', shirt: 0x8d93cc, tucked: true, pants: 0xb9a58a, shoes: 0x6a4a34, hair: 0x7a5a3a, hairStyle: 'receding', glasses: 'clear', bulk: 0.9, age: 0.4, face: { cheeks: -0.3, nose: 0.5 } },
  trucker: { pattern: 'plaid', shirt: 0x8d93cc, sleeves: 'long', pants: 0x3b4a66, hair: 0x4a3324, hairMesh: 'buzzed', bulk: 1.3, stubble: 0.7, age: 0.4, face: { jaw: 0.15, cheeks: 0.8, chin: 0.8 } },
  eddie: { shirt: 0xf2c230, tee: true, pants: 0x2b2b3a, shoes: 0xf2efe8, hair: 0x111111, hairMesh: 'buzzed', dark: true, bulk: 0.95, goatee: 0x141110 },
  perrilyn: { body: 'female', dark: true, shirt: 0x8fe0d4, pants: 0xf5f0e6, shoes: 0xf2efe8, hair: 0x111111, hairMesh: 'long', age: 0.3 },
  fanny: { body: 'female', jacket: 0xf7a8c4, shirt: 0xf5f0e6, pants: 0x6f6f7a, tucked: true, hair: 0xdcdad4, hairMesh: 'parted', hairShift: [0, -0.045, 0.004], hairScale: [1.04, 1.02, 1.06], bulk: 1.05, height: 0.9, age: 1, glasses: 'clear', brows: 0xb9b6b0 },
  // Episode three.
  shlomo: { jacket: 0x16161c, shirt: 0xf4f4f4, tucked: true, pants: 0x16161c, hair: 0x9a9690, hairStyle: 'balding', beard: 0xd6d3cc, beardMesh: true, glasses: 'clear', brows: 0x9a9690, bulk: 1.1, age: 0.9, face: { nose: 0.7, cheeks: -0.2 } },
  ariel: { jacket: 0x16161c, shirt: 0xf4f4f4, tucked: true, pants: 0x16161c, hair: 0x1c1410, hairMesh: 'parted', beard: 0x2a1c14, beardMesh: true, glasses: 'clear', bulk: 0.9, face: { cheeks: -0.5, nose: 0.6 } },
  mikey: { jacket: 0x2a2a34, shirt: 0xf4f4f4, tie: 0x6a1c2c, tucked: true, pants: 0x2a2a34, hair: 0x120e0c, hairMesh: 'parted', hairScale: [1.02, 0.94, 1.04], bulk: 0.95, face: { cheeks: -0.4, nose: 0.3, jaw: 0.04 }, age: 0.3 },
  rosalie: { body: 'female', jacket: 0x3d2a3a, shirt: 0xf1ede4, pants: 0x3d2a3a, tucked: true, hair: 0x2a1a14, hairMesh: 'long', age: 0.5 },
  charmaine: { body: 'female', shirt: 0xffffff, sleeves: 'long', tucked: true, pants: 0x23232b, hair: 0x1c1410, hairMesh: 'long', hairScale: [1, 0.9, 1], age: 0.3 },
  hunter: { body: 'female', shirt: 0xff8a5c, tee: true, pants: 0x3b6ea8, shoes: 0xf2efe8, hair: 0xd9b25a, hairMesh: 'long', height: 0.94 },
  dealer: { shirt: 0x2b2b3a, tee: true, jacket: 0x8a1c1c, pants: 0x23232b, shoes: 0xf2efe8, hair: 0x111111, hairMesh: 'buzzed', dark: true, glasses: 'shades', bulk: 1.05, goatee: 0x141110 },
  priest: { shirt: 0x16161c, sleeves: 'long', tucked: true, pants: 0x16161c, hair: 0x3a2a1c, hairStyle: 'receding', bulk: 1.05, age: 0.4, face: { cheeks: 0.4 } },
  dancer: { body: 'female', shirt: 0xff5fd2, tee: true, pants: 0xffffff, shoes: 0xf2efe8, hair: 0xd9b25a, hairMesh: 'long' },
  cop: { shirt: 0x24324c, sleeves: 'long', tucked: true, badge: true, pants: 0x1c2740, hair: 0x2b1b12, hairMesh: 'buzzed', glasses: 'shades', bulk: 1.08, stubble: 0.3 },
  mahaffey: { jacket: 0x8d8a8e, shirt: 0xf4f4f4, tie: 0xa3201c, tucked: true, pants: 0x8d8a8e, hair: 0x7a3b1a, hairStyle: 'receding', glasses: 'clear', bulk: 1.12, age: 0.5, face: { cheeks: 0.6, chin: 0.7 } },
  // Episode four.
  makazian: { jacket: 0x6f5a44, shirt: 0xd9c7a0, tucked: true, pants: 0x4a3324, hair: 0x2a1c14, hairMesh: 'parted', hairScale: [1.02, 1.04, 1.04], mustache: 0x2a1c14, stubble: 0.5, bulk: 1.15, age: 0.6, skin: [1, 0.92, 0.84], face: { nose: 0.5, cheeks: 0.3, jowls: 0.4, brow: 0.4 } },
  randall: { jacket: 0x3d4658, shirt: 0xcfe8ff, tie: 0x6a1c2c, tucked: true, pants: 0x3d4658, hair: 0x9a9690, hairStyle: 'receding', glasses: 'clear', bulk: 1.0, age: 0.7, face: { cheeks: -0.2, nose: 0.3 } },
  principal: { body: 'female', jacket: 0x5f8a84, shirt: 0xf1ede4, pants: 0x5f8a84, tucked: true, hair: 0x7a3b1a, hairMesh: 'parted', hairShift: [0, -0.04, 0.004], hairScale: [1.06, 1.04, 1.08], glasses: 'clear', age: 0.6 },
  piocosta: { pattern: 'check', shirt: 0xf1ece2, tucked: true, pants: 0xb9a58a, shoes: 0x6a4a34, hair: 0x7a5a3a, hairStyle: 'balding', bulk: 1.15, age: 0.5, face: { cheeks: 0.5, chin: 0.4 } },
  jeremy: { shirt: 0xd8342c, tee: true, pants: 0x3b6ea8, shoes: 0xf2efe8, hair: 0xc9a14a, hairMesh: 'buzzed', bulk: 1.0, height: 0.82, head: 1.2, face: { cheeks: 0.4 } },
  agent: { jacket: 0x23232b, shirt: 0xf4f4f4, tie: 0x23232b, tucked: true, pants: 0x23232b, hair: 0x2b1b12, hairMesh: 'buzzed', glasses: 'shades', bulk: 1.05, stubble: 0.1 },
  adriana: { body: 'female', jacket: 0x1c1c22, shirt: 0xff5fd2, pants: 0x1c1c22, tucked: true, chain: true, hair: 0x1c1410, hairMesh: 'long', hairScale: [1.14, 1.12, 1.1], age: 0.1 },
};
// Episode five.
Object.assign(LOOKS, {
  // Episode seven: 1967, and the school.
  tonyboy: { pattern: 'stripes', shirt: 0xece6dc, tee: true, pants: 0x3b4a66, hair: 0x2b1b12, hairMesh: 'parted', height: 0.8, head: 1.2, bulk: 1.22 },
  janice: { body: 'female', shirt: 0xf2a3b4, tee: true, pants: 0xf5f0e6, hair: 0x2b1b12, hairMesh: 'long', height: 0.84, head: 1.14 },
  johnnyboy: { jacket: 0x2a2a34, shirt: 0xf4f4f4, tie: 0x16161c, tucked: true, pants: 0x2a2a34, hair: 0x16110e, hairMesh: 'parted', hat: 'fedora', hatColor: 0x2a2a34, bulk: 1.2, face: { jaw: 0.15, brow: 0.3 } },
  junior67: { jacket: 0x6f5a44, shirt: 0xf4f4f4, tie: 0x6a1c2c, tucked: true, pants: 0x4a4652, hair: 0x2b1b12, hairStyle: 'receding', glasses: 'clear', glassesScale: 1.3, bulk: 0.96, height: 0.97, age: 0.3, face: { nose: 0.95, cheeks: -0.4, jaw: 0.04 } },
  livia67: { body: 'female', shirt: 0x9a7fb0, sleeves: 'long', pants: 0x4a4652, hair: 0x16110e, hairMesh: 'parted', hairScale: [1.06, 1.04, 1.08], bulk: 1.05, height: 0.94, age: 0.3, face: { jaw: 0.1, cheeks: -0.3, chin: 0.4 }, frown: true },
  rocco: { pattern: 'plaid', shirt: 0xb5523b, pants: 0x4a3324, hair: 0x4a3324, hairMesh: 'parted', bulk: 1.1, stubble: 0.3 },
  kida: { shirt: 0xd8342c, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', dark: true, hat: 'cap', height: 0.84, head: 1.18, bulk: 0.95 },
  kidb: { pattern: 'stripes', shirt: 0x9fd0f5, tee: true, pants: 0x3b6ea8, hair: 0xd9b25a, hairMesh: 'parted', height: 0.8, head: 1.2, bulk: 1.05 },
  psychologist: { body: 'female', jacket: 0x6f8a6a, shirt: 0xf5f0e6, pants: 0x3d4658, tucked: true, hair: 0x7a3b1a, hairMesh: 'long', glasses: 'clear', age: 0.4 },
  coach: { shirt: 0xd8342c, tee: true, pants: 0x23232b, shoes: 0xf2efe8, hair: 0x4a3324, hairMesh: 'buzzed', hat: 'cap', hatColor: 0xd8342c, bulk: 1.28, stubble: 0.3 },
  hauser: { jacket: 0x2f56c8, shirt: 0xf4f4f0, tee: true, pants: 0x1c2740, shoes: 0xf2efe8, hair: 0xb9955a, hairMesh: 'parted', bulk: 1.02, age: 0.35 }, // a coach, in the school's colours
  // Episode six: the captains, a card player, a dealer, a man from New York, a waiter.
  jimmy: { jacket: 0x6f5a44, shirt: 0xf4f4f4, pants: 0x4a3324, hair: 0x2b1b12, hairStyle: 'receding', mustache: 0x2b1b12, bulk: 1.25, age: 0.6, face: { jaw: 0.15, cheeks: 0.5 } },
  larry: { jacket: 0x3d4658, shirt: 0xcfe8ff, tucked: true, pants: 0x3d4658, hair: 0x9a9690, hairMesh: 'parted', glasses: 'clear', bulk: 1.32, age: 0.8, face: { jowls: 0.6, cheeks: 0.6 } },
  raymond: { shirt: 0xb9a58a, sleeves: 'long', pants: 0x4a4652, hair: 0xb9b6b0, hairStyle: 'balding', bulk: 0.95, age: 0.9, face: { cheeks: -0.3, nose: 0.4 } },
  sammy: { pattern: 'palms', shirt: 0x2f56c8, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', chain: true, bulk: 1.15, stubble: 0.4 },
  rusty: { jacket: 0x2f7d46, shirt: 0xf4f4f4, tee: true, pants: 0x3b4a66, shoes: 0xf2efe8, hair: 0xb5523b, hairMesh: 'long', bulk: 0.92, stubble: 0.5, age: 0.3 },
  johnnysack: { jacket: 0x1c2740, jacketPattern: 'pinstripe', shirt: 0xf4f4f4, tie: 0x8a1c1c, tucked: true, pants: 0x1c2740, hair: 0x6f6a66, hairMesh: 'parted', bulk: 0.95, height: 1.04, age: 0.6, face: { cheeks: -0.3, nose: 0.4 } },
  waiter: { jacket: 0xf4f4f0, shirt: 0xf4f4f4, tie: 0x16161c, tucked: true, pants: 0x16161c, hair: 0x2b1b12, hairMesh: 'parted', bulk: 1 },
  febby: { pattern: 'plaid', shirt: 0x8d93cc, sleeves: 'long', pants: 0x4a3324, shoes: 0x6a4a34, hair: 0x6f6a66, hairStyle: 'balding', mustache: 0x6f6a66, glasses: 'clear', hat: 'cap', hatColor: 0x1f6b4a, bulk: 1.28, age: 0.6, face: { jaw: 0.15, cheeks: 0.7, jowls: 0.6 } },
});
// The people of Heat, in Los Angeles. As with the others, nobody's face is copied: build, hair and clothes carry it.
Object.assign(LOOKS, {
  neil: { jacket: 0x55585f, shirt: 0xf4f4f4, tucked: true, pants: 0x55585f, hair: 0x4a4038, hairSides: 0x8d8a8e, hairSidesWidth: 0.046, hairMesh: 'parted', hairScale: [1.0, 0.94, 1.02], goatee: 0x6f6a66, bulk: 1.02, age: 0.6, face: { nose: 0.5, cheeks: -0.2, brow: 0.3 } },
  hanna: { jacket: 0x16161c, shirt: 0x23232b, tucked: true, pants: 0x16161c, hair: 0x120e0c, hairMesh: 'parted', hairScale: [1.04, 1.12, 1.06], bulk: 0.98, age: 0.6, stubble: 0.3, face: { nose: 0.6, cheeks: -0.3, brow: 0.35 } },
  shiherlis: { jacket: 0x23232b, shirt: 0xf4f4f4, tee: true, pants: 0x23232b, hair: 0xd9b25a, hairMesh: 'long', hairScale: [1, 0.96, 1], bulk: 1.05, height: 1.03, stubble: 0.3, face: { jaw: 0.1 } },
  cheritto: { jacket: 0x3a3a44, shirt: 0x8d93cc, tucked: true, pants: 0x2b2b3a, hair: 0x1c1410, hairMesh: 'parted', mustache: 0x1c1410, bulk: 1.34, age: 0.4, face: { jaw: 0.2, cheeks: 0.9, chin: 0.9, jowls: 0.6 } },
  trejo: { shirt: 0x5c6157, sleeves: 'long', pants: 0x23232b, hair: 0x111111, hairMesh: 'long', hairScale: [1, 0.92, 1], mustache: 0x111111, dark: true, bulk: 1.08, age: 0.6, stubble: 0.4, face: { jaw: 0.12, brow: 0.4 } },
  waingro: { shirt: 0x15141a, tank: true, open: 0x15141a, pants: 0x3b4a66, hair: 0x6a4a34, hairMesh: 'long', goatee: 0x4a3324, bulk: 1.1, stubble: 0.6, age: 0.3, face: { jaw: 0.1, brow: 0.5, cheeks: -0.3 } },
  nate: { pattern: 'palms', shirt: 0xe0563f, pants: 0xb9a58a, shoes: 0x6a4a34, hair: 0xb9b6b0, hairMesh: 'long', hairScale: [1, 0.9, 1], beard: 0xb9b6b0, beardMesh: true, brows: 0x9a9690, bulk: 1.12, age: 0.9 },
  eady: { body: 'female', shirt: 0xf5f0e6, sleeves: 'long', pants: 0x3b4a66, hair: 0x1c1410, hairMesh: 'long', hairScale: [1.12, 1.1, 1.1], age: 0.1 },
  vanzant: { jacket: 0x2c3a5a, jacketPattern: 'pinstripe', shirt: 0xf4f4f4, tie: 0xd9a520, tucked: true, pants: 0x2c3a5a, hair: 0x7a5a3a, hairStyle: 'receding', glasses: 'clear', bulk: 1.05, age: 0.5 },
  benny: { jacket: 0x23232b, shirt: 0x8a1c1c, tee: true, pants: 0x23232b, hair: 0x2b1b12, hairMesh: 'buzzed', bulk: 1.2, stubble: 0.5, face: { jaw: 0.2, brow: 0.4 } },
  charlene: { body: 'female', shirt: 0x9fd0f5, pants: 0xf5f0e6, hair: 0xd9b25a, hairMesh: 'long', chain: true },
  drucker: { jacket: 0x6f5a44, shirt: 0xf4f4f4, tie: 0x2c3a5a, tucked: true, pants: 0x4a3324, hair: 0x2b1b12, hairMesh: 'parted', mustache: 0x2b1b12, bulk: 1.15, age: 0.5 },
  casals: { jacket: 0x3d4658, shirt: 0xcfe8ff, tucked: true, pants: 0x3d4658, hair: 0x111111, hairMesh: 'buzzed', dark: true, bulk: 1.05, age: 0.4 },
  guard: { shirt: 0x9fb0c4, sleeves: 'long', tucked: true, badge: true, pants: 0x23232b, hair: 0x4a3324, hairMesh: 'buzzed', hat: 'cap', hatColor: 0x23232b, bulk: 1.1 },
  justine: { body: 'female', jacket: 0x23232b, shirt: 0xf5f0e6, pants: 0x23232b, tucked: true, hair: 0x2a1a14, hairMesh: 'long', hairScale: [1.04, 1, 1.04], age: 0.3 },
  lauren: { body: 'female', shirt: 0xc9b6f2, tee: true, pants: 0x3b6ea8, shoes: 0xf2efe8, hair: 0x7a3b1a, hairMesh: 'long', height: 0.9, head: 1.1 },
  breedan: { shirt: 0xf4f4f0, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'buzzed', dark: true, bulk: 1.22, age: 0.5, stubble: 0.3, face: { jaw: 0.2, brow: 0.3 } },
  kelso: { shirt: 0x8a6a4a, sleeves: 'long', pattern: 'plaid', pants: 0x4a4038, shoes: 0x6a4a34, hair: 0xb9b6b0, hairMesh: 'long', hairScale: [1, 0.88, 1], beard: 0xb9b6b0, beardMesh: true, glasses: 'clear', bulk: 1.1, age: 0.9 },
  manager: { jacket: 0x3d4658, shirt: 0xf4f4f4, tie: 0x8a1c1c, tucked: true, pants: 0x3d4658, hair: 0x6f6a66, hairStyle: 'balding', glasses: 'clear', bulk: 1.1, age: 0.6 },
  snitch: { shirt: 0xffe066, tee: true, jacket: 0x5b53c9, pants: 0x23232b, shoes: 0xf2efe8, hair: 0x111111, hairMesh: 'buzzed', dark: true, chain: true, bulk: 0.95, goatee: 0x141110 },
});
export const makeLook = name => { const h = makeHuman(LOOKS[name]); h.look = name; return h; }; // `look` says who this is, for whoever keeps his pockets
export const makeTony = () => makeLook('tony');
