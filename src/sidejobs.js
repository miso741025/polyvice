// What there is to do in the rooms between missions: shake down a register, eat, buy armour,
// confess, sleep. Each room with a clerk has a `till`, the spot in front of the counter.

import * as THREE from 'three';
import { near, groundAt, CITY } from './grid.js';
import { WEAPONS } from './combat.js';
import { makeHuman } from './people.js';
import { evening } from './missions.js';

// ----- His end. Places he has a piece of put money by for him every time a job is finished; he goes and gets it.
// A green ring on the pavement outside, a green dot on the map; between jobs only. `from` is how many jobs must be
// behind him before it pays, `rate` x 3 what it puts by each WEEK of the calendar, `cap` the most it will hold. The
// ring is only there when a week has gone by since he last collected (owner: it comes round weekly, not all the time).
// The calendar: a second of play is a minute; every finished job moves it on two days; a night's sleep, eight hours. -----
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
// ----- Irina. A violet ring outside her building on Ocean Drive (not the story's pink, not its yellow), once the story has got as far as the fourth job; one
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
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9b6bff, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }));
        mesh.position.set(at.x, groundAt(at.x, at.z) + 1.1, at.z); g.scene.add(mesh);
        mark = { mesh, blip: { x: at.x, z: at.z, color: '#9b6bff', name: 'Irina (side job)' }, her: null };
        g.blips.push(mark.blip);
      }
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      mark.mesh.material.opacity = 0.26 + 0.1 * Math.sin(g.time * 3);
      if (d < 50 && !mark.her) { // she is at her door when he comes in sight of it
        mark.her = makeHuman({ body: 'female', shirt: [0xd8342c, 0x16161c, 0x8a5cff][n % 3], tee: true, pants: 0x16161c, shoes: 0x16161c, hair: 0xe0c070, hairMesh: 'long', height: 0.97 });
        mark.her.group.position.set(at.x - 2.2, groundAt(at.x - 2.2, at.z - 1.2), at.z - 1.2); mark.her.group.rotation.y = 0; g.scene.add(mark.her.group);
      } else if (d > 80 && mark.her) { g.scene.remove(mark.her.group); mark.her = null; }
      const near2 = d < 2.6 && !p.car && !p.locked && !p.inside && mark.her && !g.sideBusy;
      if (near2) g.hud.prompt(`G  ·  Take Irina out ($150)${g.cash < 150 ? ': not enough' : ''}`);
      if (near2 && g.consume('KeyG')) {
        busy = true; g.sideBusy = true; g.hud.prompt('');
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
  let last = {}, done = 0, shown = false, busy = false, tick = 0, sig = '';
  const WEEK = 7, now = () => g.dayBase + (18 * 60 + 30 + g.time + (g.clockOffset || 0)) / 1440;
  // What is waiting at a place: nothing until a week after the last envelope, then a week's worth for every week gone by.
  const owed = s2 => done < s2.from || last[s2.key] === undefined ? 0 : Math.min(s2.cap, Math.floor((now() - last[s2.key]) / WEEK) * s2.rate * 3);
  const due = new Proxy({}, { get: (_, k) => { const s2 = STAKES.find(x => x.key === k); return s2 ? owed(s2) : 0; }, set: () => true });
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
      let then = g.time;                                // (not `last`: that is the record of when each place was collected)
      await g.until(() => { const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, d = Math.hypot(dx, dz), dt = Math.min(0.1, g.time - then); then = g.time; if (d < 1.7) return true; const step = Math.min(2.4 * dt, d - 1.6); pos.x += dx / d * step; pos.z += dz / d * step; pos.y = groundAt(pos.x, pos.z); man.group.rotation.y = Math.atan2(dx, dz); return false; });
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
      last[m.st.key] = now();                          // the week starts again from today
      g.scene.remove(m.mesh); { const i = g.blips.indexOf(m.blip); if (i >= 0) g.blips.splice(i, 1); } if (live.includes(m)) live.splice(live.indexOf(m), 1);   // and the ring is gone at once
      g.addMoney(sum);
      g.wait(2.2).then(() => { if (!g.missionActive) hud.subtitle('', 'The next envelope will be ready in a week.'); return g.wait(3); }).then(() => { if (!g.missionActive) hud.subtitle(); }).catch(() => {});
      await g.wait(1.6);
      if (!g.missionActive) hud.subtitle();
      // He goes back to his door; the ring is gone until there is something in it again.
      g.wait(6).then(() => g.scene.remove(man.group)).catch(() => g.scene.remove(man.group));
    } catch { /* killed, or a job began: nothing is owed for trying */ }
    p.locked = false; busy = false; g.sideBusy = false;
  }
  return {
    out: () => ({ last, day: now() }),
    load(saved, n) {
      done = n; last = saved && typeof saved.last === 'object' ? { ...saved.last } : {};
      g.dayBase = Math.max(0, (saved?.day || 0) - (18 * 60 + 30) / 1440);
      for (const s2 of STAKES) if (done >= s2.from && last[s2.key] === undefined) last[s2.key] = now() - WEEK;   // the first envelope is waiting
      clear();
    },
    pay(n) { // a job is finished: two days have gone by, and anything newly his starts paying
      done = n; g.dayBase += 2;
      for (const s2 of STAKES) if (done >= s2.from && last[s2.key] === undefined) last[s2.key] = now() - WEEK;
      clear();
    },
    update() {
      if (g.missionActive && !g.offering) { if (shown) clear(); return; }
      if (g.time > tick) { tick = g.time + 2; const was = sig; sig = STAKES.map(s2 => owed(s2)).join(); if (shown && was !== sig) clear(); } // a week has turned over somewhere
      if (!shown) show();
      if (busy || p.inside) return;
      for (const m of live) {
        const d = Math.hypot(p.pos.x - m.at.x, p.pos.z - m.at.z);
        m.mesh.material.opacity = 0.26 + 0.1 * Math.sin(g.time * 3);
        if (d < 46 && !m.man) { // whoever minds the money is out on the step when he comes in sight
          m.man = makeHuman(m.st.look); m.man.group.position.set(m.at.face.x - 1.6, groundAt(m.at.face.x, m.at.face.z), m.at.face.z + 0.3); m.man.group.rotation.y = 0; g.scene.add(m.man.group);
        } else if (d > 70 && m.man) { g.scene.remove(m.man.group); m.man = null; }
        if (d < 2.6 && !p.car && !p.locked && m.man) { hud.prompt(`G  ·  Collect your end ($${Math.floor(due[m.st.key] || 0).toLocaleString()})`); if (g.consume('KeyG')) { hud.prompt(''); collect(m); } return; }
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
  stakes.load(null, 0);                                // a new game: the two places he starts with are ready
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

  // A dance in the private room: asked for on the floor in front of the stage, between jobs. One song. She dances, he
  // sits; F when he has had enough. Nothing more to it than that.
  const DANCE = 100, GIRLS = ['Crystal', 'Jasmine', 'Roxy', 'Tiffany', 'Amber'];
  async function privateDance() {
    const club = places.bingRoom, vip = places.bingVip, girl = club.dancers[0], name = GIRLS[Math.floor(g.time) % GIRLS.length];
    const was = { pos: girl.group.position.clone(), turn: girl.group.rotation.y, at: p.pos.clone(), head: p.heading };
    busy = true; g.sideBusy = true; p.locked = true;
    try {
      hud.subtitle(name, 'The private room is a hundred, honey, and the hands stay on the couch. Come on.');
      await g.wait(2.6);
      hud.subtitle();
      hud.fade(1, 0.5); await g.wait(0.7);
      g.addMoney(-DANCE); g.sfx?.cash();
      p.pos.set(vip.seat.x, 0, vip.seat.z); p.heading = vip.seat.h; p.pose = 'sit';
      girl.group.position.set(vip.stage.x + 0.35, vip.stage.y, vip.stage.z + 0.2); girl.group.rotation.y = Math.PI; girl.set('dance');
      g.cam.fixed = vip.cam;
      hud.fade(0, 0.6); await g.wait(0.8);
      const t0 = g.time, LINES = [[3, name, 'You are the quiet one. Paulie talks the whole song.'], [9, 'Tony', 'Paulie talks through funerals.'], [15, name, 'You want to tell me about your week? Everybody does, in here.'], [21, 'Tony', 'I pay somebody for that already. Just dance.']];
      let said = 0;
      g.consume('KeyF');
      await g.until(() => {
        const t = g.time - t0;
        girl.group.rotation.y = Math.PI + Math.sin(t * 0.5) * 0.9;
        if (said < LINES.length && t > LINES[said][0]) { hud.subtitle(LINES[said][1], LINES[said][2]); said++; }
        hud.prompt('F  ·  That will do');
        return t > 30 || g.consume('KeyF');
      });
      hud.prompt(''); hud.subtitle();
      hud.fade(1, 0.5); await g.wait(0.7);
    } catch { /* a job began, or worse */ }
    girl.group.position.copy(was.pos); girl.group.rotation.y = was.turn; girl.set('dance');
    p.pose = null; p.pos.copy(was.at); p.heading = was.head; g.cam.fixed = null;
    p.health = Math.min(100, p.health + 25); hud.health(p.health);
    hud.fade(0, 0.6);
    p.locked = false; busy = false; g.sideBusy = false;
    hud.subtitle('', 'He left a twenty on the table on the way out. It had been that kind of week.');
    g.wait(3.4).then(() => { if (!g.missionActive) hud.subtitle(); }).catch(() => {});
  }

  // The refrigerator, at home: the door swings open, he finds the gabagool, he eats a slice of it standing there.
  let ate = -99;
  async function gabagool() {
    const f = places.houseRoom.fridge, door = f.door;
    busy = true; p.locked = true;
    try {
      p.heading = Math.atan2(f.from.x - p.pos.x, f.from.z - p.pos.z);
      p.human.play('interact', 'idle');
      const swing = (to, secs) => { const from = door.rotation.y, t0 = g.time; return g.until(() => { const k = Math.min(1, (g.time - t0) / secs); door.rotation.y = from + (to - from) * k * k * (3 - 2 * k); return k >= 1; }); };
      g.sfx?.click?.();
      await swing(-1.9, 0.6);
      await g.wait(0.5);
      p.human.play('pickup', 'idle');
      const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 12), new THREE.MeshLambertMaterial({ color: 0xc8503a })), marb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.009, 8), new THREE.MeshLambertMaterial({ color: 0xf2c8b8 }));
      slice.add(marb); slice.rotation.z = 1.3; g.scene.add(slice);
      const y0 = groundAt(p.pos.x, p.pos.z), fx = Math.sin(p.heading), fz = Math.cos(p.heading), t0 = g.time;
      hud.subtitle('', 'Gabagool. Out of the paper, standing up, with the door open.');
      await g.until(() => { // from the shelf to his hand, and from his hand to his mouth
        const t = g.time - t0, k = Math.min(1, t / 0.8), e = k * k * (3 - 2 * k), k2 = Math.max(0, Math.min(1, (t - 1.2) / 0.5));
        const hx = p.pos.x + fx * 0.32, hz = p.pos.z + fz * 0.32;
        slice.position.set(f.from.x + (hx - f.from.x) * e + (p.pos.x + fx * 0.14 - hx) * k2, f.from.y + (y0 + 1.15 - f.from.y) * e + k2 * 0.42, f.from.z + (hz - f.from.z) * e + (p.pos.z + fz * 0.14 - hz) * k2);
        if (t > 1.15 && !p.topPose) p.topPose = 'phone';       // the hand goes up to his face
        return t > 2.3;
      });
      g.scene.remove(slice);
      await g.wait(0.7);
      p.topPose = null;
      p.health = Math.min(100, p.health + 12); hud.health(p.health);
      hud.subtitle('', 'The only way.');
      await swing(0, 0.5);
      g.sfx?.door?.();
      await g.wait(1.2);
      if (!g.missionActive) hud.subtitle();
    } catch { /* interrupted */ }
    door.rotation.y = 0; p.topPose = null;
    p.locked = false; busy = false; ate = g.time;
  }

  const update = () => {
    if (!g.sideBusy) stakes.update();
    dates.update();
    if (!busy && !p.locked && p.inside && places.houseRoom?.fridge && near(p.pos, places.houseRoom.fridge.at, 1.3) && g.time - ate > 8) {
      hud.prompt('F  ·  Open the refrigerator');
      if (g.consume('KeyF')) { hud.prompt(''); gabagool(); }
      return;
    }
    if (!busy && !g.missionActive && !g.sideBusy && !p.locked && p.inside && places.bingRoom?.front && near(p.pos, places.bingRoom.front, 1.8)) { // on the floor, in front of the girl at the middle pole
      hud.prompt(`G  ·  Ask her for a private dance ($${g.cash >= DANCE ? DANCE : 'not enough'})`);
      if (g.cash >= DANCE && g.consume('KeyG')) { hud.prompt(''); privateDance(); }
      return;
    }
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
