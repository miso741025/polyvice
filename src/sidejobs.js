// What there is to do in the rooms between missions: shake down a register, eat, buy armour,
// confess, sleep. Each room with a clerk has a `till`, the spot in front of the counter.

import * as THREE from 'three';
import { near, groundAt, CITY } from './grid.js';
import { WEAPONS } from './combat.js';
import { makeHuman } from './people.js';
import { evening } from './missions.js';

// ----- His end. Places he has a piece of put money by for him every time a job is finished; he goes and gets it.
// A green ring on the pavement outside, a green dot on the map; between jobs only. `from` is how many jobs must be
// behind him before it pays, `rate` what it puts by per job, `cap` the most it will hold for him. -----
const STAKES = [
  { key: 'bing', door: 'the Bada Bing', name: 'The Bada Bing', from: 0, rate: 400, cap: 2400, who: 'Floor manager', look: { jacket: 0x2a2a30, shirt: 0x8a1c2a, tee: true, pants: 0x23232b, hair: 0x111111, hairMesh: 'parted', bulk: 1.1 },
    lines: ['The week, Mr. Soprano. Silvio counted it twice.', 'It was a good week. The conventions are in town.', 'All there. The girls send their love.'] },
  { key: 'pork', door: "Satriale's", name: "Satriale's", from: 0, rate: 220, cap: 1320, who: 'Counterman', look: { shirt: 0xf4f4f4, sleeves: 'long', pants: 0xf4f4f4, hair: 0x2b1b12, hairStyle: 'balding', mustache: 0x2b1b12, bulk: 1.2, age: 0.5 },
    lines: ['Yours, and a pound of the gabagool. Do not tell Paulie about the gabagool.', 'Slow week. People are eating chicken. I do not understand it.', 'Here. And tell your mother I asked for her.'] },
  { key: 'haul', door: 'the Kolar office', name: 'Triborough hauling', from: 5, rate: 320, cap: 1920, who: 'Dispatcher', look: { shirt: 0x5c6157, tee: true, pants: 0x3a3a44, hair: 0x4a3324, hairMesh: 'buzzed', hat: 'cap', hatColor: 0x2f5a3f, bulk: 1.15, stubble: 0.6 },
    lines: ['The towers, the school, the two diners. It is all in there.', 'Nobody has asked where the Kolars went. Nobody is going to.', 'Your end. The trucks are running on time for once.'] },
  { key: 'bean', door: 'Bean Scene', name: 'Bean Scene', from: 9, rate: 160, cap: 960, who: 'Owner', look: { shirt: 0xf4f4f0, sleeves: 'long', tucked: true, pants: 0x23232b, hair: 0x8d8a8e, hairStyle: 'balding', mustache: 0x8d8a8e, age: 0.6 },
    lines: ['Tuesday, like always. And nobody else has been round for it.', 'Here it is, Mr. Soprano. Take a coffee. Take two.', 'It is in the envelope. I counted it in front of my wife.'] },
  { key: 'body', door: 'the body shop', name: 'Bonpensiero Bros.', from: 9, rate: 260, cap: 1560, who: 'Mechanic', look: { shirt: 0x2f56c8, sleeves: 'long', tucked: true, pants: 0x2f56c8, hair: 0x4a3324, hairMesh: 'buzzed', bulk: 1.25, stubble: 0.5 },
    lines: ['I pay you. I know who I pay. Here.', 'It is all there. My jaw still clicks, since you ask.', 'Yours. We did nine cars this week, all of them somebody else\'s.'] },
  { key: 'lodge', door: 'the motel office', name: 'Teittleman Motor Lodge', from: 19, rate: 520, cap: 3120, who: 'Night man', look: { shirt: 0xd9c7a0, tee: true, pants: 0x3b4a66, hair: 0x2b1b12, hairMesh: 'parted', bulk: 0.9, glasses: 'clear' },
    lines: ['Twenty-five per cent, to the dollar. Mr. Teittleman watched me count it. He did not enjoy it.', 'Your quarter. We are full at the weekend, for once.', 'It is here. He says to tell you the roof needs doing, and that a quarter of the roof is yours as well.'] },
];
// ----- Irina. A pink ring outside her building on Ocean Drive, once the story has got as far as the fourth job; one
// evening between each job and the next. -----
function installDates(g) {
  const { places, player: p } = g, FROM = 3;
  if (CITY === 'la') return { update() {}, load() {}, done() {}, out: () => ({}) };
  let n = 0, last = -1, jobs = 0, mark = null, busy = false;
  const at = places.ocean && { x: places.ocean.chris.x + 2.5, z: places.ocean.chris.z - 26 };
  const clear = () => { if (!mark) return; g.scene.remove(mark.mesh); if (mark.her && !busy) g.scene.remove(mark.her.group); const i = g.blips.indexOf(mark.blip); if (i >= 0) g.blips.splice(i, 1); mark = null; };
  return {
    out: () => ({ n, last }),
    load(saved, done) { n = saved?.n || 0; last = saved?.last ?? -1; jobs = done; },
    done(count) { jobs = count; },
    update() {
      const open = at && !g.missionActive && jobs >= FROM && jobs > last;
      if (!open || busy) { if (mark && !busy) clear(); return; }
      if (!mark) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5fa8, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }));
        mesh.position.set(at.x, groundAt(at.x, at.z) + 1.1, at.z); g.scene.add(mesh);
        mark = { mesh, blip: { x: at.x, z: at.z, color: '#ff5fa8', name: 'Irina' }, her: null };
        g.blips.push(mark.blip);
      }
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      mark.mesh.material.opacity = 0.26 + 0.1 * Math.sin(g.time * 3);
      if (d < 50 && !mark.her) { // she is at her door when he comes in sight of it
        mark.her = makeHuman({ body: 'female', shirt: [0xd8342c, 0x16161c, 0x8a5cff][n % 3], tee: true, pants: 0x16161c, shoes: 0x16161c, hair: 0xe0c070, hairMesh: 'long', height: 0.97 });
        mark.her.group.position.set(at.x - 2.2, groundAt(at.x - 2.2, at.z - 1.2), at.z - 1.2); mark.her.group.rotation.y = 0; g.scene.add(mark.her.group);
      } else if (d > 80 && mark.her) { g.scene.remove(mark.her.group); mark.her = null; }
      if (d < 2.4 && !p.car && !p.locked && !p.inside && mark.her && !g.sideBusy) {
        busy = true; g.sideBusy = true;
        const her = mark.her, home = { x: at.x + 4, z: at.z + 3 };
        g.scene.remove(mark.mesh); const i = g.blips.indexOf(mark.blip); if (i >= 0) g.blips.splice(i, 1);
        g.tracked.add(her.group); her.group.userData.human = her;         // hers to be cleared with anything else, if it goes wrong
        evening(g, her, home, n).then(went => { if (went) { n++; last = jobs; } }).catch(() => {}).finally(() => {
          busy = false; g.sideBusy = false; g.untrack(her.group); mark = null;
        });
      }
    },
  };
}
function installStakes(g) {
  const { hud, places, player: p } = g, live = [];
  if (CITY === 'la') return { update() {}, pay() {}, load() {}, out: () => ({}) };
  let due = {}, shown = false, busy = false;
  const spotOf = st => { const d = places.doors.find(x => x.name === st.door); return d && { x: d.outside.x + 2.8, z: d.outside.z + 1.2, face: d.outside }; };
  const clear = () => { for (const m of live.splice(0)) { g.scene.remove(m.mesh); if (m.man) g.scene.remove(m.man.group); const i = g.blips.indexOf(m.blip); if (i >= 0) g.blips.splice(i, 1); } shown = false; };
  const show = () => {
    for (const st of STAKES) {
      const at = spotOf(st), sum = Math.floor(due[st.key] || 0);
      if (!at || sum < 1) continue;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x3fd16b, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.set(at.x, groundAt(at.x, at.z) + 1.1, at.z); g.scene.add(mesh);
      const blip = { x: at.x, z: at.z, color: '#3fd16b', name: `${st.name}: $${sum.toLocaleString()}` };
      g.blips.push(blip);
      live.push({ st, at, mesh, blip, man: null });
    }
    shown = true;
  };
  async function collect(m) {
    busy = true; p.locked = true; g.sideBusy = true;
    const sum = Math.floor(due[m.st.key] || 0), man = m.man, pos = man.group.position;
    try {
      man.set('walk', 1);
      let last = g.time;
      await g.until(() => { const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, d = Math.hypot(dx, dz), dt = Math.min(0.1, g.time - last); last = g.time; if (d < 1.7) return true; const step = Math.min(2.4 * dt, d - 1.6); pos.x += dx / d * step; pos.z += dz / d * step; pos.y = groundAt(pos.x, pos.z); man.group.rotation.y = Math.atan2(dx, dz); return false; });
      man.set('idle'); man.group.rotation.y = Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z); p.heading = Math.atan2(pos.x - p.pos.x, pos.z - p.pos.z);
      hud.subtitle(m.st.who, m.st.lines[Math.floor(Math.random() * m.st.lines.length)]);
      await g.wait(1.2);
      man.play('interact', 'idle');
      const env = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.025), new THREE.MeshLambertMaterial({ color: 0xe9e2cf })), y0 = pos.y + 1.12, t0 = g.time, ax = pos.x, az = pos.z;
      g.scene.add(env);
      await g.wait(0.35);
      p.human.play('interact', 'idle');
      await g.until(() => { const k = Math.min(1, (g.time - t0 - 0.35) / 0.6), e = k * k * (3 - 2 * k); env.position.set(ax + (p.pos.x - ax) * (0.2 + e * 0.7), y0 + Math.sin(k * Math.PI) * 0.14, az + (p.pos.z - az) * (0.2 + e * 0.7)); env.rotation.y = p.heading; env.scale.setScalar(1 - e * 0.5); return k >= 1; });
      g.scene.remove(env);
      g.sfx?.cash();
      g.addMoney(sum);
      due[m.st.key] = 0;
      await g.wait(1.6);
      if (!g.missionActive) hud.subtitle();
      // He goes back to his door; the ring is gone until there is something in it again.
      g.scene.remove(m.mesh); const i = g.blips.indexOf(m.blip); if (i >= 0) g.blips.splice(i, 1);
      live.splice(live.indexOf(m), 1);
      g.wait(6).then(() => g.scene.remove(man.group)).catch(() => g.scene.remove(man.group));
    } catch { /* killed, or a job began: nothing is owed for trying */ }
    p.locked = false; busy = false; g.sideBusy = false;
  }
  return {
    out: () => due,
    load(saved, done) { due = { ...(saved || {}) }; if (!saved) for (const st of STAKES) if (done >= st.from) due[st.key] = st.rate * 2; clear(); },   // an old save: two weeks are waiting for him
    pay(done) { for (const st of STAKES) if (done >= st.from) due[st.key] = Math.min(st.cap, (due[st.key] || 0) + st.rate); clear(); },
    update() {
      if (g.missionActive && !g.offering) { if (shown) clear(); return; }
      if (!shown) show();
      if (busy || p.inside) return;
      for (const m of live) {
        const d = Math.hypot(p.pos.x - m.at.x, p.pos.z - m.at.z);
        m.mesh.material.opacity = 0.26 + 0.1 * Math.sin(g.time * 3);
        if (d < 46 && !m.man) { // whoever minds the money is out on the step when he comes in sight
          m.man = makeHuman(m.st.look); m.man.group.position.set(m.at.face.x - 1.6, groundAt(m.at.face.x, m.at.face.z), m.at.face.z + 0.3); m.man.group.rotation.y = 0; g.scene.add(m.man.group);
        } else if (d > 70 && m.man) { g.scene.remove(m.man.group); m.man = null; }
        if (d < 2.4 && !p.car && !p.locked && m.man) { collect(m); return; }
      }
    },
  };
}

const SHAKEDOWN = new Set(['BAR', 'DINER', 'LIQUOR', 'PAWN', 'STORE', 'KIOSK', 'SHOWROOM', 'MOTEL', 'BEAN', 'OFFICE', 'FASTFOOD', 'PARTS', 'BOOKS']); // nobody shakes down a gun shop
const FOOD = { FASTFOOD: ['Eat', 6], DINER: ['Eat', 15], KIOSK: ['Buy a hot dog', 8], BEAN: ['Coffee and a cannoli', 6], BAR: ['A drink', 10], VESUVIO: ['Dinner', 40] };
const HANDOVER = ['Take it. Take it, just go.', "It's all there. Please.", 'Okay. Okay! Here.', "I don't want trouble.", "Take it, I've got kids."];
const REFUSAL = ['Get out of my store!', 'You picked the wrong place, pal.', 'I pay already. I pay every month!', 'Not today. Not you.'];

export function installSideJobs(g) {
  const { hud, places, player: p } = g;
  const stakes = g.stakes = installStakes(g), dates = g.dates = installDates(g);
  const rooms = places.rooms;
  const cooldown = new Map(); // room -> time the register was last emptied
  let busy = false;

  const clerkOf = q => q.clerk && !q.clerkNpc?.dead ? q.clerk : null;
  const say = (who, text, seconds) => { hud.subtitle(who, text); g.wait(seconds).then(() => { if (!g.missionActive) hud.subtitle(); }).catch(() => {}); };

  async function shakedown(q) {
    busy = true; p.locked = true;
    const clerk = q.clerk;
    try {
      clerk.group.lookAt(p.pos.x, clerk.group.position.y, p.pos.z);
      if (Math.random() < 0.25 && !q.clerkNpc) { // this one fights back
        say('Clerk', REFUSAL[Math.floor(Math.random() * REFUSAL.length)], 2.5);
        await g.wait(0.8);
        p.locked = false; busy = false;
        q.clerkNpc = g.makeEnemy(clerk, { health: 70, damage: 7, cash: 120 + Math.floor(Math.random() * 200), stays: true });
        return;
      }
      clerk.play('interact', 'idle');
      say('Clerk', HANDOVER[Math.floor(Math.random() * HANDOVER.length)], 2.5);
      await g.wait(1.4);
      g.dropCash(q.till.x, q.till.z, 120 + Math.floor(Math.random() * 300));
      cooldown.set(q, g.time);
      g.heat(0.45);
      await g.wait(0.4);
    } catch { /* the player died mid-shakedown */ }
    p.locked = false; busy = false;
  }

  // The pawn shop's other business: guns, bullets and a vest, from a menu.
  function gunCounter(title, stock = ['pistol', 'smg', 'shotgun']) {
    const show = () => {
      const items = [];
      let n = 1;
      for (const w of stock) {
        const W = WEAPONS[w];
        if (!p.weapons[w]) items.push({ key: 'Digit' + n++, label: `${W.name}, with ${W.mag * 2} rounds`, hint: `$${W.price}`, buy: () => { if (g.cash < W.price) return false; g.addMoney(-W.price); g.giveWeapon(w); return true; } });
        else items.push({ key: 'Digit' + n++, label: `${W.name} ammunition, ${W.pack} rounds`, hint: `$${W.ammoPrice}`, buy: () => { if (g.cash < W.ammoPrice) return false; g.addMoney(-W.ammoPrice); g.giveAmmo(w, W.pack); return true; } });
      }
      items.push({ key: 'Digit' + n++, label: 'Kevlar vest', hint: p.armour >= 100 ? 'wearing one' : '$400', buy: () => { if (g.cash < 400 || p.armour >= 100) return false; g.addMoney(-400); p.armour = 100; hud.armour(100); return true; } });
      items.push({ key: 'Escape', label: 'Leave', hint: `$${g.cash}` });
      hud.menu(title, items, code => {
        const it = items.find(i => i.key === code);
        if (!it) return;
        if (code === 'Escape') { hud.menu(); g.paused = false; return; }
        if (it.buy()) { g.sfx?.cash(); show(); } else g.sfx?.click();
      });
    };
    g.paused = true;
    show();
  }

  const update = () => {
    if (!g.sideBusy) stakes.update();
    dates.update();
    if (busy || !p.inside || p.locked) return;
    const bed = (places.beds || []).find(b => near(p.pos, b, 2));
    if (bed) { // a night in your own bed: eight hours, and whole again
      hud.prompt(`F  ·  ${bed.name}`);
      if (g.consume('KeyF')) {
        busy = true; p.locked = true;
        hud.fade(1, 0.8);
        g.wait(1.6).then(() => { p.health = 100; hud.health(100); g.clockOffset = (g.clockOffset || 0) + 60 * 8; hud.fade(0, 1); return g.wait(1); })
          .then(() => { hud.subtitle('', 'Eight hours. It helps.'); return g.wait(2); }).then(() => { if (!g.missionActive) hud.subtitle(); }).catch(() => {}).finally(() => { p.locked = false; busy = false; });
      }
      return;
    }
    if (g.missionActive) return;
    const q = Object.values(rooms).find(r => p.pos.x > r.minX && p.pos.x < r.maxX && p.pos.z > r.minZ && p.pos.z < r.maxZ);
    if (!q || !q.till || !near(p.pos, q.till, 2.2)) return;
    const clerk = clerkOf(q), key = Object.keys(rooms).find(k => rooms[k] === q);
    if (!clerk) return;
    const lines = [];
    const food = FOOD[key];
    if (food && p.health < 100 && g.cash >= food[1]) lines.push(`F  ·  ${food[0]} ($${food[1]})`);
    if (key === 'GUNS') lines.push('F  ·  Buy guns and ammunition');
    if (key === 'PAWN') lines.push('F  ·  See what is under the counter');
    if (key === 'CHURCH' && g.wanted > 0 && g.cash >= 100) lines.push('F  ·  Confess ($100)');
    if (key === 'MOTEL' && (p.health < 100 || g.wanted > 0) && g.cash >= 40) lines.push('F  ·  Sleep it off ($40)');
    const canShake = SHAKEDOWN.has(key) && !q.clerkNpc && g.time - (cooldown.get(q) ?? -999) > 240;
    if (canShake) lines.push('G  ·  Shake down the register');
    hud.prompt(lines.join('     '));
    if (!lines.length) return;
    if (g.consume('KeyF')) {
      if (food && p.health < 100 && g.cash >= food[1]) { g.addMoney(-food[1]); p.health = Math.min(100, p.health + 50); hud.health(p.health); g.sfx?.cash(); say('', 'That hit the spot.', 2); }
      else if (key === 'GUNS') gunCounter('Guns and ammunition', ['pistol', 'smg', 'shotgun', 'rifle']);
      else if (key === 'PAWN') gunCounter('Under the counter', ['pistol']);
      else if (key === 'CHURCH' && g.wanted > 0 && g.cash >= 100) { g.addMoney(-100); g.pardon(); g.sfx?.passed(); say('Father Phil', 'Go in peace, Anthony. And perhaps drive slower.', 3); }
      else if (key === 'MOTEL' && g.cash >= 40) { g.addMoney(-40); p.health = 100; hud.health(100); g.pardon(); g.clockOffset = (g.clockOffset || 0) + 60 * 8; hud.fade(1, 0.4); g.wait(1).then(() => hud.fade(0, 0.8)).catch(() => {}); say('', 'Eight hours, no questions.', 3); }
    } else if (canShake && g.consume('KeyG')) shakedown(q);
  };
  return { update };
}
