// Builds the web release of Port Paloma (Vice Web) alone: one minified script, the character models it needs,
// lighter textures, and a page with no way across to the other worlds. Nothing of Los Angeles or Nexus is in it.
//
//   ESBUILD=<path to an esbuild package> node tools/build-web.mjs [outDir]     (outDir defaults to dist/vice)
//
// esbuild is the only package it needs (any 0.2x; Wrangler carries one). Textures are made smaller with macOS `sips`.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'dist/vice'));
const esbuild = createRequire(import.meta.url)(process.env.ESBUILD || 'esbuild');

// ---------- The script ----------
// The other worlds' stories and sets are replaced by empty stand-ins, and the city is fixed at Port Paloma, so the
// minifier drops every branch and builder that belongs to Los Angeles or Nexus.
const STUBS = {
  'heat.js': 'export const HEAT = []; export const HEAT_BIOS = {};',
  'nexus.js': 'export const NEXUS_STORY = [];',
  'bladerunner.js': 'export const BLADE_STORY = [];',
  'sets2049.js': 'export function buildSets2049() {}',
  'sets2019.js': 'export function buildSets2019() {}',
};
const SKINS = ['T_Superhero_Male_Ligh.png', 'T_Superhero_Male_Dark.png', 'T_Superhero_Female_Light_BaseColor.png'];
const portPalomaOnly = {
  name: 'port-paloma-only',
  setup(b) {
    b.onResolve({ filter: /^\.\/(heat|nexus|bladerunner|sets2049|sets2019)\.js$/ }, a => ({ path: a.path.slice(2), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js' }));
    b.onLoad({ filter: /src[\\/]grid\.js$/ }, a => {
      let s = readFileSync(a.path, 'utf8');
      const city = /^export const CITY = .*$/m, story = /^export const STORY_KEY = .*$/m;
      if (!city.test(s) || !story.test(s)) throw new Error('grid.js no longer reads the city the way this build expects');
      s = s.replace(city, "export const CITY = 'vice';").replace(story, "export const STORY_KEY = '';");
      return { contents: s, loader: 'js' };
    });
    // Every question the code asks about the city is answered in the text, so the minifier can see which way it goes:
    // `CITY === 'la'` becomes false, and so on, and the NEXUS / LA / OLD flags that world.js and main.js keep become false.
    b.onLoad({ filter: /src[\\/](main|world|missions|entities|people|combat|sidejobs|hud|touch|detail)\.js$/ }, a => {
      let s = readFileSync(a.path, 'utf8');
      s = s.replace(/\bCITY === 'vice'/g, 'true').replace(/\bCITY !== 'vice'/g, 'false').replace(/\bCITY === '(la|nexus)'/g, 'false').replace(/\bCITY !== '(la|nexus)'/g, 'true')
        .replace(/\bSTORY_KEY === '(2019|2049)'/g, 'false');
      const flags = { main: "const NEXUS = false, LA = false;", world: "const NEXUS = false, LA = false, OLD = NEXUS && false;" }[a.path.match(/(\w+)\.js$/)[1]];
      if (flags) {
        if (!s.includes(flags)) throw new Error(`${a.path}: the city flags are no longer written the way this build expects`);
        s = s.replace(flags, '').replace(/\b(NEXUS|LA|OLD)\b(?!\s*[:=](?!=))/g, 'false');
      }
      if (a.path.endsWith('world.js')) s = emptyBuilders(s);
      if (a.path.endsWith('detail.js') && process.env.VICE_VERSION) s = s.replace("export const RELEASE = 'dev';", `export const RELEASE = ${JSON.stringify(String(process.env.VICE_VERSION))};`);
      if (a.path.endsWith('people.js')) { // the skins it paints clothes on are the smaller JPEGs made below
        for (const t of SKINS) { if (!s.includes(`'${t}'`)) throw new Error(`people.js no longer loads ${t}`); s = s.replace(`'${t}'`, `'${t.replace(/\.png$/, '.jpg')}'`); }
      }
      return { contents: s, loader: 'js' };
    });
  },
};
// world.js builds every city's places inside buildWorld(); the minifier keeps a nested function even when nothing calls it,
// so the builders that only Los Angeles and Nexus call are emptied here (their callers are behind the flags made false above).
const ELSEWHERE = ['buildNeil', 'buildKBlock', 'buildPolice', 'buildWallace', 'buildMoat', 'buildStelline', 'buildOrphanage', 'buildBradbury', 'buildEyeWorks', 'buildFarm',
  'buildMarket', 'buildBank', 'buildDriveIn', 'buildRoadDiner', 'buildTruckStop', 'buildPrecinct', 'buildDepository', 'buildBookstore', 'buildHotel', 'buildContainers', 'buildAirport',
  'buildRiver', 'buildFreeway', 'megablock', 'megablockTower'];
function emptyBuilders(s) {
  for (const name of ELSEWHERE) {
    const at = s.search(new RegExp(`function ${name}\\(`));
    if (at < 0) throw new Error(`world.js has no ${name} any more: take it out of ELSEWHERE`);
    const open = s.indexOf('{', s.indexOf(')', at)), close = matchBrace(s, open);
    s = s.slice(0, open) + '{}' + s.slice(close + 1);
  }
  return s;
}
// The } that closes the { at `i`, stepping over strings, template literals (and the code in their ${}) and comments.
function matchBrace(s, i) {
  const stack = ['{'];
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k], top = stack[stack.length - 1];
    if (top === '`') {
      if (c === '\\') k++;
      else if (c === '`') stack.pop();
      else if (c === '$' && s[k + 1] === '{') { stack.push('${'); k++; }
      continue;
    }
    if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); continue; }
    if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k) + 1; continue; }
    if (c === "'" || c === '"') { for (k++; s[k] !== c; k++) if (s[k] === '\\') k++; continue; }
    if (c === '`') stack.push('`');
    else if (c === '{') stack.push('{');
    else if (c === '}') { stack.pop(); if (!stack.length) return k; }
  }
  throw new Error('unbalanced braces in world.js');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets/models'), { recursive: true });
const built = await esbuild.build({
  entryPoints: [join(ROOT, 'src/main.js')], bundle: true, format: 'esm', target: 'es2022', minify: true, treeShaking: true,
  external: ['three', 'three/addons/*'], plugins: [portPalomaOnly], write: false, legalComments: 'none', charset: 'utf8',
});
const js = built.outputFiles[0].text;
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);
const jsName = `game.${hash(js)}.js`;
writeFileSync(join(OUT, jsName), js);

// Words from the other worlds and from the works this game began as a tribute to. None may be in what ships.
const BANNED = ['Soprano', 'Melfi', 'Vice City', 'Bada Bing', 'Satriale', 'Vesuvio', 'Moltisanti', 'Livia', 'Paulie', 'Silvio', 'Carmela', 'Junior', 'Meadow',
  'Christopher', 'Hesh', 'Kolar', 'Jackie', 'Verbum', 'Green Grove', 'Bowdoin', 'Comley', 'Pussy', 'Wasted',
  'Heat', 'McCauley', 'Hanna', 'Waingro', 'Cheritto', 'Shiherlis', 'Far East Pacific', 'Blade Runner', 'Deckard', 'Tyrell', 'Wallace', 'Rachael', 'Replicant', 'Nexus', 'Joi', 'Gaff', 'Stelline', 'Los Angeles'];
const visible = [];
for (const m of js.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g)) for (const w of BANNED) if (new RegExp(`\\b${w}\\b`).test(m[0])) visible.push(`${w}: ${m[0].slice(0, 90)}`);

// ---------- Models and textures ----------
const SRC = join(ROOT, 'assets/models'), DST = join(OUT, 'assets/models');
const sips = (() => { try { execFileSync('sips', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; } })();
// A 2048 px texture is drawn at most a few hundred pixels tall: 1024 px JPEG is plenty, and a tenth of the size.
const jpeg = (name, size = 1024) => {
  const out = name.replace(/\.png$/, '.jpg');
  if (!sips) throw new Error('the textures are made smaller with macOS sips, which is not here');
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', String(size), join(SRC, name), '--out', join(DST, out)], { stdio: 'ignore' });
  return out;
};
const renamed = {};
for (const t of [...SKINS, 'T_Hair_1_BaseColor.png', 'T_Hair_2_BaseColor.png']) renamed[t] = jpeg(t);
copyFileSync(join(SRC, 'T_Eye_Brown.png'), join(DST, 'T_Eye_Brown.png'));
// The .gltf files point at textures this kit never shipped (normal and roughness maps); a browser would ask for each and get
// nothing. They are left out, and the colour maps point at the JPEGs.
for (const f of readdirSync(SRC).filter(f => f.endsWith('.gltf'))) {
  const j = JSON.parse(readFileSync(join(SRC, f), 'utf8'));
  const missing = new Set((j.images || []).map((im, i) => (im.uri && !existsSync(join(SRC, im.uri)) ? i : -1)).filter(i => i >= 0));
  (j.images || []).forEach(im => { if (renamed[im.uri]) { if (renamed[im.uri].endsWith('.jpg')) im.mimeType = 'image/jpeg'; im.uri = renamed[im.uri]; } });
  const dead = new Set((j.textures || []).map((t, i) => (missing.has(t.source) ? i : -1)).filter(i => i >= 0));
  for (const m of j.materials || []) {
    for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[k] && dead.has(m[k].index)) delete m[k];
    const pbr = m.pbrMetallicRoughness || {};
    for (const k of ['baseColorTexture', 'metallicRoughnessTexture']) if (pbr[k] && dead.has(pbr[k].index)) delete pbr[k];
  }
  writeFileSync(join(DST, f), JSON.stringify(j));
  for (const b of j.buffers || []) copyFileSync(join(SRC, b.uri), join(DST, b.uri));
}

// The animation library: only the clips the game plays (people.js CLIPS, the A-pose and the walk it builds the stance from),
// and no mannequin mesh. Everything else in the file is dropped.
const KEEP = new Set(['Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Death01', 'Punch_Jab', 'Punch_Cross', 'Hit_Head', 'Hit_Chest', 'Pistol_Aim_Neutral',
  'Pistol_Idle_Loop', 'Pistol_Shoot', 'Fixing_Kneeling', 'Interact', 'PickUp_Table', 'Crouch_Idle_Loop', 'Dance_Loop', 'Pistol_Reload', 'Idle_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Walk_Formal_Loop', 'A_TPose']);
{
  const people = readFileSync(join(ROOT, 'src/people.js'), 'utf8'), clips = people.slice(people.indexOf('const CLIPS = {'), people.indexOf('};', people.indexOf('const CLIPS = {')));
  for (const [, name] of clips.matchAll(/:\s*'([A-Za-z0-9_]+)'/g)) if (!KEEP.has(name)) throw new Error(`people.js plays ${name}: add it to KEEP in tools/build-web.mjs`);
  const glb = readFileSync(join(SRC, 'UAL1_Standard.glb'));
  const jl = glb.readUInt32LE(12), j = JSON.parse(glb.subarray(20, 20 + jl).toString('utf8')), bin = glb.subarray(20 + jl + 8);
  j.animations = j.animations.filter(a => KEEP.has(a.name));
  const found = new Set(j.animations.map(a => a.name));
  for (const k of KEEP) if (!found.has(k)) throw new Error(`the animation library has no ${k}`);
  for (const n of j.nodes) { delete n.mesh; delete n.skin; }
  for (const k of ['meshes', 'skins', 'materials', 'textures', 'images', 'samplers']) delete j[k];
  // Copy each accessor the clips use into a new, packed buffer.
  const used = [...new Set(j.animations.flatMap(a => a.samplers.flatMap(s => [s.input, s.output])))].sort((a, b) => a - b);
  const remap = new Map(), views = [], accessors = [], parts = [];
  let offset = 0;
  for (const old of used) {
    const acc = j.accessors[old], view = j.bufferViews[acc.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type], bytes = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 }[acc.componentType];
    if (view.byteStride && view.byteStride !== comps * bytes) throw new Error('interleaved animation data is not handled');
    const start = (view.byteOffset || 0) + (acc.byteOffset || 0), len = acc.count * comps * bytes;
    const pad = (4 - (offset % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    parts.push(bin.subarray(start, start + len));
    views.push({ buffer: 0, byteOffset: offset, byteLength: len });
    remap.set(old, accessors.length);
    accessors.push({ ...acc, bufferView: views.length - 1, byteOffset: 0 });
    offset += len;
  }
  for (const a of j.animations) for (const s of a.samplers) { s.input = remap.get(s.input); s.output = remap.get(s.output); }
  j.accessors = accessors; j.bufferViews = views; j.buffers = [{ byteLength: offset }];
  const body = Buffer.concat(parts), binPad = Buffer.alloc((4 - (body.length % 4)) % 4);
  let json = Buffer.from(JSON.stringify(j)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + json.length + 8 + body.length + binPad.length, head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  jh.writeUInt32LE(json.length, 0); jh.write('JSON', 4); bh.writeUInt32LE(body.length + binPad.length, 0); bh.write('BIN\0', 4);
  writeFileSync(join(DST, 'UAL1_Standard.glb'), Buffer.concat([head, jh, json, bh, body, binPad]));
}
for (const f of ['License_Standard.txt']) copyFileSync(join(SRC, f), join(DST, f));
mkdirSync(join(DST, 'anim-license'), { recursive: true });
copyFileSync(join(SRC, 'anim-license/License.txt'), join(DST, 'anim-license/License.txt'));

// The home-screen app: opens full screen and sideways where the phone allows it.
copyFileSync(join(ROOT, 'manifest.webmanifest'), join(OUT, 'manifest.webmanifest'));
mkdirSync(join(OUT, 'icons'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'icons'))) copyFileSync(join(ROOT, 'icons', f), join(OUT, 'icons', f));

// ---------- The page ----------
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const cut = (re, what) => { if (!re.test(html)) throw new Error(`index.html: could not find ${what}`); html = html.replace(re, ''); };
cut(/\s*<button id="other">[^<]*<\/button>/, 'the Los Angeles button');
cut(/\s*<button id="third">[^<]*<\/button>/, 'the Nexus button');
cut(/\s*<button id="year"[^>]*>[^<]*<\/button>/, 'the 2019 button');
html = html.replace('<script type="module" src="src/main.js"></script>', `<script type="module" src="${jsName}"></script>`);
const css = readFileSync(join(ROOT, 'style.css'), 'utf8'), cssName = `style.${hash(css)}.css`;
writeFileSync(join(OUT, cssName), css);
html = html.replace('<link rel="stylesheet" href="style.css">', `<link rel="stylesheet" href="${cssName}">`);
html = html.replace(/<div class="fine">([^<]*)<\/div>/, (_, t) => `<div class="fine">${t} Free and open source. Characters and animations by Quaternius (CC0); three.js (MIT).</div>`);
for (const w of BANNED) if (new RegExp(`\\b${w}\\b`).test(html)) visible.push(`${w}: in index.html`);
writeFileSync(join(OUT, 'index.html'), html);
// ---------- Report ----------
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk(OUT);
let total = 0, wire = 0;
const rows = files.map(p => {
  const b = readFileSync(p), size = b.length, text = /\.(js|css|html|gltf|txt|webmanifest)$/.test(p), gz = text ? brotliCompressSync(b).length : (/\.(bin|glb)$/.test(p) ? gzipSync(b).length : size);
  total += size; wire += gz;
  return { file: p.slice(OUT.length + 1), size, wire: gz };
}).sort((a, b) => b.size - a.size);
const mb = n => (n / 1048576).toFixed(2) + ' MB';
console.log(rows.map(r => `${r.file.padEnd(48)} ${mb(r.size).padStart(10)}  (≈${mb(r.wire)} compressed)`).join('\n'));
console.log(`\n${files.length} files, ${mb(total)} on disk, about ${mb(wire)} over the wire. Largest file ${mb(rows[0].size)} (limit 25 MB).`);
if (rows[0].size > 25 * 1048576) throw new Error('a file is over the 25 MB Workers limit');
if (visible.length) { console.log('\nNames that must not ship:\n' + [...new Set(visible)].join('\n')); process.exitCode = 1; }
else console.log('No names from other worlds or from the source works in the shipped text.');
writeFileSync(join(dirname(OUT), 'build-' + OUT.split(/[\/]/).pop() + '.json'), JSON.stringify({ script: jsName, style: cssName, files: rows, bytes: total, wire }, null, 1));
