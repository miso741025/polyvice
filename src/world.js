import * as THREE from 'three';
import { NX, NZ, BLOCK, ROAD, CELL, nodeX, nodeZ, blockCenter, SHORE, bounds, colliders, mulberry32 } from './grid.js';
import { box, makeLook, makeTony, makeDuck } from './entities.js';

const PASTELS = [0xf7a8c4, 0x8fe0d4, 0xffd3a1, 0xc9b6f2, 0xfff1c9, 0x9fd0f5, 0xf5f5f0, 0xff9e8a];
const CURB = 0.14; // sidewalk height
const SPECIAL = { '0,0': 'home', '5,3': 'melfi', '3,5': 'bing', '2,2': 'satriale' };

// One repeat of this texture is a 4x4 grid of windows; some are lit.
function windowTexture(rand) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = rand() < 0.3 ? '#ffe7a3' : '#2a3653';
    g.fillRect(x * 32 + 7, y * 32 + 8, 18, 17);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeSign(text, { w = 14, h = 3.5, color = '#ff5fd2', bg = '#140a1f', font = '"Mr Dafoe", cursive', size = 0.62 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.font = `${Math.round(c.height * size)}px ${font}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 16; x.fillStyle = color;
  x.fillText(text, c.width / 2, c.height / 2, c.width * 0.92);
  x.shadowBlur = 0; x.globalAlpha = 0.5; x.fillStyle = '#fff';
  x.fillText(text, c.width / 2, c.height / 2, c.width * 0.92);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

export function buildWorld(scene) {
  const rand = mulberry32(1999);
  const places = {};
  const W = NX * CELL + ROAD, D = NZ * CELL + ROAD;

  const plane = (w, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // A plain box standing on the sidewalk, optionally solid.
  const solid = (w, h, d, color, x, z, { y0 = CURB, collide = true, basic = false } = {}) => {
    const m = box(w, h, d, color, basic);
    m.position.set(x, y0 + h / 2, z); m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: y0 + h });
    return m;
  };

  // ----- Ground: sea, sand island, asphalt, lane lines -----
  plane(5000, 5000, 0x19a7c2, 0, -0.6, 0);
  plane(bounds.maxX - bounds.minX + 8, bounds.maxZ - bounds.minZ + 8, 0xf3dcab, (bounds.minX + bounds.maxX) / 2, -0.1, (bounds.minZ + bounds.maxZ) / 2);
  plane(W, D, 0x3d3a46, 0, 0, 0);
  for (let k = 0; k <= NX; k++) plane(0.3, D, 0xf5d24a, nodeX(k), 0.04, 0);
  for (let k = 0; k <= NZ; k++) plane(W, 0.3, 0xf5d24a, 0, 0.04, nodeZ(k));

  // ----- Buildings -----
  const winTex = windowTexture(rand);
  const mats = PASTELS.map(color => new THREE.MeshLambertMaterial({ color, map: winTex }));
  const building = (x, z, w, d, h, mat = mats[Math.floor(rand() * mats.length)]) => {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    // Box faces come in groups of 4 vertices: +x, -x, +y, -y, +z, -z. Tile windows on the walls, blank the roof.
    for (let i = 0; i < 24; i++) {
      const face = i >> 2;
      if (face === 2 || face === 3) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, uv.getX(i) * Math.round((face < 2 ? d : w) / 4) / 4, uv.getY(i) * Math.round(h / 4) / 4);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, CURB + h / 2, z); m.castShadow = m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: CURB + h });
    return m;
  };

  const sidewalkGeo = new THREE.BoxGeometry(BLOCK, CURB, BLOCK), sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xdcd2d8 });
  const palms = [];
  const maxDist = Math.hypot(NX * CELL / 2, NZ * CELL / 2);

  const lots = (c, i, skip) => {
    const downtown = 1 - Math.hypot(c.x, c.z) / maxDist, beach = i === NX - 1;
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      if (skip && skip[0] === a && skip[1] === b) continue;
      if (rand() < 0.1) continue; // empty lot
      const w = 16 + Math.floor(rand() * 2) * 4, d = 16 + Math.floor(rand() * 2) * 4;
      const h = beach ? 8 + Math.floor(rand() * 3) * 4 : 8 + Math.floor(rand() * 3 + downtown * rand() * 11) * 4;
      building(c.x + a * 13, c.z + b * 13, w, d, h);
    }
  };

  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const c = blockCenter(i, j), kind = SPECIAL[`${i},${j}`];
    const sw = new THREE.Mesh(sidewalkGeo, sidewalkMat);
    sw.position.set(c.x, CURB / 2, c.z); sw.receiveShadow = true;
    scene.add(sw);
    for (const sx of [-1, 1]) for (const sz of [-14, 14]) palms.push({ x: c.x + sx * 28.8, z: c.z + sz });

    if (kind === 'home') buildHome(c);
    else if (kind === 'melfi') buildMelfi(c);
    else if (kind === 'bing') buildBing(c);
    else if (kind === 'satriale') { buildSatriale(c); lots(c, i, [-1, 1]); }
    else if (rand() < 0.22) {
      const downtown = 1 - Math.hypot(c.x, c.z) / maxDist;
      building(c.x, c.z, 36 + Math.floor(rand() * 3) * 4, 36 + Math.floor(rand() * 3) * 4, i === NX - 1 ? 12 : 16 + Math.floor(rand() * 4 + downtown * 9) * 4);
    } else lots(c, i);
  }

  // ----- Tony's house: lawn, pool, ducks -----
  function buildHome(c) {
    plane(BLOCK - 4, BLOCK - 4, 0x58b765, c.x, CURB + 0.01, c.z);
    solid(32, 8, 16, 0xfdf3e3, c.x + 2, c.z - 18);
    solid(34, 1, 18, 0xc8643c, c.x + 2, c.z - 18, { y0: CURB + 8, collide: false });
    solid(12, 5, 10, 0xfdf3e3, c.x + 12, c.z - 6);
    solid(13.5, 0.8, 11.5, 0xc8643c, c.x + 12, c.z - 6, { y0: CURB + 5, collide: false });
    solid(2, 3.2, 0.3, 0x5a3320, c.x - 4, c.z - 9.9, { collide: false }); // front door
    plane(8, 34, 0x8d8894, c.x - 21, CURB + 0.03, c.z + 11); // driveway

    const pool = { x: c.x + 13, z: c.z + 13, w: 12, d: 18 };
    plane(pool.w + 3, pool.d + 3, 0xf7f2ea, pool.x, CURB + 0.03, pool.z);
    const water = plane(pool.w, pool.d, 0x35d0ea, pool.x, CURB + 0.06, pool.z);
    water.material = new THREE.MeshBasicMaterial({ color: 0x35d0ea });
    colliders.push({ minX: pool.x - pool.w / 2, maxX: pool.x + pool.w / 2, minZ: pool.z - pool.d / 2, maxZ: pool.z + pool.d / 2, h: 0.3 });

    const ducks = [];
    for (let k = 0; k < 5; k++) {
      const d = makeDuck();
      d.group.position.set(pool.x - 2.5 + (k % 3) * 1.6, CURB + 0.06, pool.z - 2 + Math.floor(k / 3) * 2.2 + (k % 2) * 0.7);
      d.group.rotation.y = -Math.PI / 2 + (rand() - 0.5);
      d.group.scale.setScalar(k === 0 ? 1.25 : 0.9);
      scene.add(d.group);
      ducks.push(d);
    }
    for (const [px, pz] of [[22, -1], [24, 25], [3, 26]]) palms.push({ x: c.x + px, z: c.z + pz });

    places.home = {
      spawn: { x: c.x - 4, z: c.z - 6 },
      pool: { x: pool.x - pool.w / 2 - 1.6, z: pool.z },
      car: { x: c.x - 21, z: c.z + 14, h: 0 },
      wake: { x: c.x - 18.2, z: c.z + 12 },
      ducks,
    };
  }

  // ----- Dr. Melfi's office -----
  function buildMelfi(c) {
    building(c.x, c.z - 4, 36, 28, 24, mats[1]);
    const sign = makeSign('Dr. J. Melfi, M.D.  ·  Psychiatry', { w: 20, h: 2.6, color: '#f6e7b4', bg: '#1d3b3a', font: '"Bebas Neue", sans-serif', size: 0.6 });
    sign.position.set(c.x, 5.4, c.z + 10.06);
    scene.add(sign);
    solid(3, 3.4, 0.3, 0x24323a, c.x, c.z + 10.1, { collide: false }); // door
    solid(8, 0.5, 4, 0xf6e7b4, c.x, c.z + 12, { y0: 3.6, collide: false }); // awning
    places.melfi = {
      park: { x: c.x, z: c.z + 34 },
      kerb: { x: c.x + 6, z: c.z + 32, h: -Math.PI / 2 },
      door: { x: c.x, z: c.z + 14 },
    };
  }

  // ----- The Bada Bing: a pink neon club front in the style of the reference image -----
  function buildBing(c) {
    const NEON = 0xff3fe0, front = c.z + 5;
    const neon = (w, h, d, x, y, z) => solid(w, h, d, NEON, x, z, { y0: y, collide: false, basic: true });
    solid(42, 12, 22, 0xcf5fb8, c.x, c.z - 6);                                    // main hall
    solid(32, 4.2, 7, 0xdd7fcb, c.x, front + 2.5, { y0: CURB + 6.6, collide: false }); // canopy
    neon(32.2, 0.16, 0.16, c.x, CURB + 6.6, front + 6.05);
    neon(32.2, 0.16, 0.16, c.x, CURB + 10.8, front + 6.05);
    neon(42.2, 0.16, 0.16, c.x, CURB + 12, front + 0.05);
    for (const s of [-1, 1]) {
      neon(0.16, 0.16, 7, c.x + s * 16.05, CURB + 6.6, front + 2.5);
      solid(1.8, 6.6, 1.8, 0xe27fd0, c.x + s * 12, front + 4.5);                  // pillars
      neon(0.14, 6.6, 0.14, c.x + s * 12, CURB, front + 5.45);
      for (const k of [0, 1]) {                                                    // cypress trees
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6.5, 7), new THREE.MeshLambertMaterial({ color: 0x2c5a34 }));
        tree.position.set(c.x + s * (17 + k * 2.6), CURB + 3.25, front + 1.6); tree.castShadow = true;
        scene.add(tree);
        colliders.push({ minX: tree.position.x - 0.6, maxX: tree.position.x + 0.6, minZ: front + 1, maxZ: front + 2.2, h: 6, thin: true });
      }
    }
    solid(23, 6.4, 0.3, 0x1c0b26, c.x, front + 0.1, { collide: false });          // dark entrance
    for (let k = -3; k <= 3; k++) solid(2.7, 3.2, 0.1, 0x5b3a78, c.x + k * 3.1, front + 0.3, { collide: false }); // glass doors
    const sign = makeSign('Bada Bing!', { w: 13, h: 3.2, color: '#ff5fd2', bg: '#1c0b26' });
    sign.position.set(c.x, CURB + 4.9, front + 0.32);
    scene.add(sign);
    // Rows of bulbs set into the forecourt, like the lit steps of the club.
    const bulbGeo = new THREE.CircleGeometry(0.1, 8), bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, 4 * 21), o = new THREE.Object3D();
    o.rotation.x = -Math.PI / 2;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 21; k++) {
      o.position.set(c.x + (k - 10) * 1.1, CURB + 0.02, front + 7.5 + r * 1.5); o.updateMatrix();
      bulbs.setMatrixAt(r * 21 + k, o.matrix);
      if (k === 0) plane(23.5, 0.5, 0x8a6f86, c.x, CURB + 0.012, front + 7.5 + r * 1.5);
    }
    scene.add(bulbs);
    places.bing = { door: { x: c.x, z: c.z + 15 } };
  }

  // ----- Satriale's Pork Store (south-west lot of its block) -----
  function buildSatriale(c) {
    const x = c.x - 13, z = c.z + 13;
    solid(22, 8, 20, 0xb5523b, x, z);
    const sign = makeSign("SATRIALE'S", { w: 16, h: 3, color: '#ffffff', bg: '#a3201c', font: '"Bebas Neue", sans-serif', size: 0.8 });
    sign.position.set(x, 6.2, z + 10.06);
    scene.add(sign);
    // The pig on the roof.
    const pig = new THREE.Group();
    const part = (w, h, d, px, py, pz, color = 0xf7a3b5) => { const m = box(w, h, d, color); m.position.set(px, py, pz); m.castShadow = true; pig.add(m); };
    part(2.6, 1.4, 1.4, 0, 1.3, 0); part(1, 1, 1, 1.7, 1.5, 0); part(0.3, 0.5, 0.5, 2.3, 1.4, 0, 0xe88aa0);
    for (const lx of [-0.9, 0.9]) for (const lz of [-0.45, 0.45]) part(0.35, 0.7, 0.35, lx, 0.35, lz);
    pig.position.set(x, CURB + 8, z + 5);
    scene.add(pig);
    places.satriale = { door: { x, z: z + 13 } };
  }

  // ----- Beach: palms along Ocean Drive, umbrellas on the sand -----
  for (let z = bounds.minZ + 14; z < bounds.maxZ - 10; z += 13) palms.push({ x: SHORE + 3.5 + rand() * 2, z: z + rand() * 4 });
  for (let k = 0; k < 14; k++) palms.push({ x: SHORE + 14 + rand() * 30, z: bounds.minZ + 12 + rand() * (bounds.maxZ - bounds.minZ - 24) });
  const umbrellaGeo = new THREE.ConeGeometry(2, 0.9, 8), poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let k = 0; k < 22; k++) {
    const x = SHORE + 12 + rand() * 36, z = bounds.minZ + 14 + rand() * (bounds.maxZ - bounds.minZ - 28);
    const top = new THREE.Mesh(umbrellaGeo, new THREE.MeshLambertMaterial({ color: PASTELS[k % PASTELS.length] }));
    top.position.set(x, 2.6, z); top.castShadow = true;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 1.2, z);
    scene.add(top, pole);
    const towel = plane(1, 2.2, [0xff5fd2, 0x49e0d0, 0xffe066][k % 3], x + 1.2, 0, z + 0.4);
    towel.rotation.z = rand() * 3;
  }
  buildPalms(scene, palms, rand);

  const oz = blockCenter(NX - 1, 5).z;
  places.ocean = {
    marker: { x: nodeX(NX), z: oz },
    chris: { x: SHORE + 1.5, z: oz - 5 },
    debtor: { x: SHORE + 30, z: oz + 14 },
  };

  places.office = buildOffice(scene);
  places.sky = buildSky(scene);
  return places;
}

function buildPalms(scene, list, rand) {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 7, 5);
  trunkGeo.translate(0, 3.5, 0);
  const leafGeo = new THREE.ConeGeometry(0.75, 4.2, 4);
  leafGeo.rotateX(Math.PI / 2); leafGeo.translate(0, 0, 2.1); leafGeo.scale(1, 0.18, 1);
  const LEAVES = 7;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x9a7b55 }), list.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x2fa25a }), list.length * LEAVES);
  const o = new THREE.Object3D();
  o.rotation.order = 'YXZ';
  list.forEach((p, n) => {
    const s = 0.9 + rand() * 0.45, spin = rand() * 6;
    o.position.set(p.x, 0, p.z); o.rotation.set(0, spin, 0); o.scale.setScalar(s); o.updateMatrix();
    trunks.setMatrixAt(n, o.matrix);
    for (let k = 0; k < LEAVES; k++) {
      o.position.set(p.x, 7 * s, p.z); o.rotation.set(0.35 + rand() * 0.3, spin + k / LEAVES * Math.PI * 2, 0); o.updateMatrix();
      leaves.setMatrixAt(n * LEAVES + k, o.matrix);
    }
    colliders.push({ minX: p.x - 0.35, maxX: p.x + 0.35, minZ: p.z - 0.35, maxZ: p.z + 0.35, h: 7, thin: true });
  });
  for (const m of [trunks, leaves]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
}

// A small interior set for the therapy scenes, hidden far below the city.
function buildOffice(scene) {
  const base = -200;
  const add = (m, x, y, z) => { m.position.set(x, base + y, z); scene.add(m); return m; };
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 10), new THREE.MeshLambertMaterial({ color: 0x7a5540, side: THREE.BackSide }));
  add(room, 0, 2.3, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshLambertMaterial({ color: 0x4a3426 }));
  floor.rotation.x = -Math.PI / 2; add(floor, 0, 0.01, 0);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshLambertMaterial({ color: 0x8a2f3a }));
  rug.rotation.x = -Math.PI / 2; add(rug, 0, 0.03, 0);

  for (const side of [-1, 1]) {
    add(box(1, 0.5, 1, 0x2f4a44), side * 2.2, 0.25, 0);
    add(box(0.2, 1.3, 1, 0x2f4a44), side * 2.75, 0.65, 0);
  }
  add(box(0.7, 0.45, 0.7, 0x2b1a12), 0, 0.22, 1.4);              // side table
  add(box(0.24, 0.12, 0.14, 0xe9eef2), 0, 0.51, 1.4);            // the tissues
  add(box(3.2, 3, 0.4, 0x3a2418), -2.5, 1.5, -4.75);             // bookshelf
  for (let k = 0; k < 9; k++) add(box(0.24, 0.5, 0.1, PASTELS[k % PASTELS.length]), -3.7 + k * 0.3, 1.2 + (k % 2) * 0.9, -4.52);
  add(box(1.5, 1.1, 0.06, 0xe9e2cf), 2.6, 2.4, -4.95);           // diploma
  add(box(2.4, 1.8, 0.06, 0xffc9a0, true), 5.95, 2.4, 0).rotation.y = Math.PI / 2; // sunset window

  const tony = makeTony();
  tony.set('sit'); tony.group.rotation.y = Math.PI / 2; add(tony.group, -2.02, 0, 0);
  const melfi = makeLook('melfi');
  melfi.set('sit'); melfi.group.rotation.y = -Math.PI / 2; add(melfi.group, 2.02, 0, 0);

  const lamp = new THREE.PointLight(0xffd9a8, 45, 30);
  add(lamp, 0, 3.9, 1);
  return { cam: new THREE.Vector3(0, base + 1.45, 3.9), look: new THREE.Vector3(0, base + 0.95, 0) };
}

// Sunset sky dome with the sun over the ocean; the caller keeps it centred on the camera.
function buildSky(scene) {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 c = mix(vec3(1.0, 0.74, 0.47), vec3(0.96, 0.42, 0.62), smoothstep(0.0, 0.22, h));
        c = mix(c, vec3(0.30, 0.20, 0.58), smoothstep(0.15, 0.7, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  dome.renderOrder = -1; dome.frustumCulled = false;
  const sun = new THREE.Mesh(new THREE.CircleGeometry(85, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  sun.position.set(1250, 190, 420);
  sun.lookAt(0, 0, 0);
  group.add(dome, sun);
  scene.add(group);
  return group;
}
