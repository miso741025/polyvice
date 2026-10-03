// What there is to do in the rooms between missions: shake down a register, eat, buy armour,
// confess, sleep. Each room with a clerk has a `till`, the spot in front of the counter.

import { near } from './grid.js';

const SHAKEDOWN = new Set(['BAR', 'DINER', 'LIQUOR', 'PAWN', 'STORE', 'KIOSK', 'SHOWROOM', 'MOTEL', 'BEAN', 'OFFICE']);
const FOOD = { DINER: ['Eat', 15], KIOSK: ['Buy a hot dog', 8], BEAN: ['Coffee and a cannoli', 6], BAR: ['A drink', 10], VESUVIO: ['Dinner', 40] };
const HANDOVER = ['Take it. Take it, just go.', "It's all there. Please.", 'Okay. Okay! Here.', "I don't want trouble.", "Take it, I've got kids."];
const REFUSAL = ['Get out of my store!', 'You picked the wrong place, pal.', 'I pay already. I pay every month!', 'Not today. Not you.'];

export function installSideJobs(g) {
  const { hud, places, player: p } = g;
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

  const update = () => {
    if (busy || g.missionActive || !p.inside || p.locked) return;
    const q = Object.values(rooms).find(r => p.pos.x > r.minX && p.pos.x < r.maxX && p.pos.z > r.minZ && p.pos.z < r.maxZ);
    if (!q || !q.till || !near(p.pos, q.till, 2.2)) return;
    const clerk = clerkOf(q), key = Object.keys(rooms).find(k => rooms[k] === q);
    if (!clerk) return;
    const lines = [];
    const food = FOOD[key];
    if (food && p.health < 100 && g.cash >= food[1]) lines.push(`F  ·  ${food[0]} ($${food[1]})`);
    if (key === 'PAWN' && !p.armour && g.cash >= 400) lines.push('F  ·  Buy a vest ($400)');
    if (key === 'CHURCH' && g.wanted > 0 && g.cash >= 100) lines.push('F  ·  Confess ($100)');
    if (key === 'MOTEL' && (p.health < 100 || g.wanted > 0) && g.cash >= 40) lines.push('F  ·  Sleep it off ($40)');
    const canShake = SHAKEDOWN.has(key) && !q.clerkNpc && g.time - (cooldown.get(q) ?? -999) > 240;
    if (canShake) lines.push('G  ·  Shake down the register');
    hud.prompt(lines.join('     '));
    if (!lines.length) return;
    if (g.consume('KeyF')) {
      if (food && p.health < 100 && g.cash >= food[1]) { g.addMoney(-food[1]); p.health = Math.min(100, p.health + 50); hud.health(p.health); g.sfx?.cash(); say('', 'That hit the spot.', 2); }
      else if (key === 'PAWN' && !p.armour && g.cash >= 400) { g.addMoney(-400); p.armour = 100; hud.armour?.(p.armour); g.sfx?.cash(); say('Clerk', "Kevlar. Don't tell me what it's for.", 2.5); }
      else if (key === 'CHURCH' && g.wanted > 0 && g.cash >= 100) { g.addMoney(-100); g.pardon(); g.sfx?.passed(); say('Father Phil', 'Go in peace, Anthony. And perhaps drive slower.', 3); }
      else if (key === 'MOTEL' && g.cash >= 40) { g.addMoney(-40); p.health = 100; hud.health(100); g.pardon(); g.clockOffset = (g.clockOffset || 0) + 60 * 8; hud.fade(1, 0.4); g.wait(1).then(() => hud.fade(0, 0.8)).catch(() => {}); say('', 'Eight hours, no questions.', 3); }
    } else if (canShake && g.consume('KeyG')) shakedown(q);
  };
  return { update };
}
