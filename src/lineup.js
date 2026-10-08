import * as THREE from 'three';
import { loadPeople, makeLook, LOOKS } from './people.js';

// Character sheets: each main character from the front, the side and the back, on a plain ground under plain light,
// one PNG per character, posted to the server (serve.py keeps them in shots/). Open lineup.html?who=tony,carmela or
// with no query for the whole list. ?city=nexus etc. is not needed: looks do not depend on the city.

const WHO = {
  'Vice City': ['tony', 'carmela', 'christopher', 'junior', 'livia', 'melfi', 'silvio', 'paulie', 'pussy', 'hesh', 'meadow', 'aj', 'adriana', 'jackie', 'mikey'],
  'Los Angeles': ['neil', 'hanna', 'shiherlis', 'cheritto', 'eady', 'waingro', 'nate', 'trejo', 'vanzant'],
  'Nexus': ['k', 'joi', 'joshi', 'luv', 'wallace', 'sapper', 'coco', 'cotton', 'stelline', 'mariette', 'freysa'],
};
const want = new URLSearchParams(location.search).get('who');
const list = want ? want.split(',') : Object.values(WHO).flat();
const log = document.getElementById('log');

const W = 1500, H = 700;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d6d0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a90, 1.6));
const key = new THREE.DirectionalLight(0xfff4e6, 2.2); key.position.set(3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 }); scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8); fill.position.set(-4, 3, -2); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xcfcdc6 })); ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(22, W / H, 0.1, 100);
camera.position.set(0, 1.05, 7.4); camera.lookAt(0, 0.95, 0);

const label = (text, x) => { // the name and the angle, on a card at the figure's feet
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#202028'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#f4f1e6'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, 42);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); m.position.set(x, 0.12, 0.9); m.rotation.x = -0.35; scene.add(m); return m;
};

async function sheet(name) {
  if (!LOOKS[name]) { log.textContent += `\n${name}: no such look`; return; }
  const made = [], tags = [];
  for (const [k, [turn, text]] of [[0, 'front'], [-Math.PI / 2, 'side'], [Math.PI, 'back']].entries()) {
    const h = makeLook(name);
    h.group.position.set((k - 1) * 1.5, 0, 0); h.group.rotation.y = turn; h.set('idle');
    h.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(h.group); made.push(h); tags.push(label(`${name}  ·  ${text}`, (k - 1) * 1.5));
  }
  for (const h of made) h.mixer.update(0.3);                              // a frame into the standing clip, so the arms hang
  renderer.render(scene, camera);
  const blob = await new Promise(r => renderer.domElement.toBlob(r, 'image/png'));
  await fetch(`/shot/${name}.png`, { method: 'POST', body: blob });
  for (const h of made) scene.remove(h.group); for (const t of tags) scene.remove(t);
  log.textContent += `\n${name}: done`;
}

(async () => {
  await loadPeople();
  log.textContent = 'Rendering…';
  for (const name of list) { try { await sheet(name); } catch (e) { log.textContent += `\n${name}: ${e.message}`; } }
  log.textContent += '\nALL DONE';
  document.title = 'done';
})();
