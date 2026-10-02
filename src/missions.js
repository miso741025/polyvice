import * as THREE from 'three';
import { near, clamp, bounds, SHORE } from './grid.js';
import { makeHuman, makeLook } from './entities.js';

// The story is written as plain async functions: each `await` waits on the game loop
// (a line of dialogue, the player reaching a marker, a fade), so a mission reads top to bottom.

const TONY = 'Tony', MELFI = 'Dr. Melfi', CHRIS = 'Christopher', DEBTOR = 'Mahaffey';

async function say(g, who, text, dur = Math.max(2.4, text.length * 0.065)) {
  g.hud.subtitle(who, text);
  const t0 = g.time;
  await g.until(() => g.time - t0 >= dur || (g.time - t0 > 0.3 && g.consume('Enter')));
  g.hud.subtitle();
}

async function fade(g, to, seconds) {
  g.hud.fade(to, seconds);
  await g.wait(seconds + 0.05);
}

async function titleCard(g, title, sub) {
  g.hud.card(title, sub);
  await g.wait(3.2);
  g.hud.card();
}

async function passed(g, reward, money = 0) {
  g.hud.passed(reward);
  if (money) g.addMoney(money);
  await g.wait(4);
  g.hud.passed();
}

export async function runStory(g) {
  await theDucks(g);
  await collections(g);
  await g.wait(1.5);
  g.hud.card('To be continued', 'Free roam for now. The family has more work for you.');
  await g.wait(6);
  g.hud.card();
}

// ---------- Mission 1: The Ducks ----------
// Tony's ducks leave the pool, he collapses, and ends up in a psychiatrist's office.

async function theDucks(g) {
  const { home, melfi, office } = g.places, p = g.player;

  p.locked = true;
  p.pos.set(home.spawn.x, 0, home.spawn.z);
  g.cam.yaw = p.heading = Math.atan2(home.pool.x - home.spawn.x, home.pool.z - home.spawn.z);
  g.cam.pitch = 0.22;
  g.cam.fixed = null;
  await g.wait(0.5);
  g.hud.show(true);
  g.hud.fade(0, 1.5);
  await titleCard(g, 'The Ducks', 'North Shore, Vice City');
  await say(g, TONY, 'There they are. The whole family, right in my pool.');

  p.locked = false;
  g.hud.objective('Walk over to the <b>pool</b> and feed the ducks.');
  let m = g.addMarker(home.pool.x, home.pool.z, 1.6);
  await g.until(() => !p.car && near(p.pos, m, 1.9));
  g.removeMarker(m);
  g.hud.objective();

  p.locked = true;
  p.heading = Math.PI / 2;
  await say(g, TONY, 'Look at you. You hungry? Come here, I got bread.');

  // The ducks take off toward the ocean.
  const t0 = g.time;
  g.updaters.push(dt => {
    const t = g.time - t0;
    home.ducks.forEach((d, i) => {
      if (t < i * 0.25) return;
      d.wingL.visible = d.wingR.visible = true;
      const flap = Math.sin(g.time * 26 + i) * 0.9;
      d.wingL.rotation.z = flap; d.wingR.rotation.z = -flap;
      d.group.rotation.y = Math.PI / 2 - 0.4 + i * 0.12;
      d.group.rotation.x = -0.35;
      d.group.position.x += (5 + i) * dt; d.group.position.y += (2.2 + i * 0.3) * dt; d.group.position.z -= (1 + i * 0.6) * dt;
    });
    if (t < 9) return true;
    home.ducks.forEach(d => { d.group.visible = false; });
    return false;
  });
  await g.wait(1.6);
  await say(g, TONY, 'Hey... where you going? No, no, no. Come back.');

  // The panic attack.
  const t1 = g.time;
  let panicking = true;
  g.updaters.push(() => {
    const t = g.time - t1;
    if (panicking) { g.hud.panic(Math.min(1, t / 3)); g.cam.sway = Math.min(1, t / 2); }
    return panicking;
  });
  await say(g, TONY, "I can't... I can't breathe.", 3);
  const t2 = g.time;
  g.updaters.push(() => { p.down = Math.min(1, (g.time - t2) / 0.5); return p.down < 1; });
  await g.wait(1.4);
  await fade(g, 1, 1.2);
  panicking = false;
  g.hud.panic(0);
  g.cam.sway = 0;

  await say(g, '', 'Tony blacked out by the pool.');
  await say(g, '', 'His neighbour, Dr. Cusamano, ran every test there is. His heart was fine.');
  await say(g, '', 'The diagnosis: a panic attack. He left with the name of a psychiatrist.');

  p.down = 0;
  p.pos.set(home.wake.x, 0, home.wake.z);
  g.cam.yaw = p.heading = 0;
  await fade(g, 0, 1.2);
  await say(g, TONY, 'A shrink. If the crew ever hears about this, I\'m finished.');

  p.locked = false;
  g.hud.objective('Get in your <b>car</b>.');
  await g.until(() => p.car);
  g.hud.objective("Drive to <b>Dr. Melfi's office</b>.");
  m = g.addMarker(melfi.park.x, melfi.park.z, 6);
  await g.until(() => p.car && near(p.car.pos, m, 6.5));
  g.removeMarker(m);
  g.hud.objective();

  // Therapy, in the interior set.
  p.locked = true;
  await fade(g, 1, 1);
  const car = p.car;
  g.leaveCar(melfi.door);
  car.pos.set(melfi.kerb.x, 0, melfi.kerb.z); car.heading = melfi.kerb.h; car.speed = 0;
  p.hidden = true;
  g.cam.fixed = { pos: office.cam, look: office.look };
  await fade(g, 0, 1);
  await say(g, MELFI, 'Mr. Soprano. Your doctor tells me you collapsed. What do you think happened?');
  await say(g, TONY, "I don't know. One minute I'm feeding the ducks, the next I'm on the ground. Stress, maybe.");
  await say(g, MELFI, 'What line of work are you in?');
  await say(g, TONY, 'Waste management consultant.');
  await say(g, MELFI, 'Tell me about the ducks.');
  await say(g, TONY, 'They landed in my pool a couple months back. Had their babies there. It was nice, having them around.');
  await say(g, TONY, 'Then today they flew off.');
  await say(g, MELFI, 'And when they left, you felt you were losing something.');
  await say(g, TONY, 'Lately I got this feeling... like I showed up after the best part was already over.');
  await say(g, MELFI, "That's a good place to start. Same time next week, Mr. Soprano.");
  await fade(g, 1, 1);

  g.cam.fixed = null;
  p.hidden = false;
  p.heading = 0;
  g.cam.yaw = Math.PI * 0.75; // look back at Tony with the office behind him
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- Mission 2: Collections ----------
// A gambler who owes the family is spotted on the beach; run him down.

async function collections(g) {
  const { ocean } = g.places, p = g.player;

  await g.wait(1.5);
  g.hud.card('Collections', 'Ocean Drive');
  await say(g, CHRIS + ' (phone)', "T, it's me. That degenerate Mahaffey is down on the beach, working on his tan.");
  await say(g, CHRIS + ' (phone)', 'He owes us ten grand and he walks around like he won the lottery.');
  await say(g, TONY, "Stay on him. I'm on my way.");
  g.hud.card();

  const chris = makeLook('christopher');
  chris.group.position.set(ocean.chris.x, 0, ocean.chris.z);
  chris.group.rotation.y = -Math.PI / 2;
  const debtor = makeHuman({ shirt: 0xffe066, pants: 0xf5f0e6, hair: 0x7a3b1a, skin: 0xf0c8a0 });
  const d = { pos: new THREE.Vector3(ocean.debtor.x, 0, ocean.debtor.z), side: -1, phase: 0, running: false, caught: false };
  debtor.group.position.copy(d.pos);
  debtor.group.rotation.y = Math.PI / 2;
  g.scene.add(chris.group, debtor.group);

  g.hud.objective('Meet Christopher on <b>Ocean Drive</b>.');
  const m = g.addMarker(ocean.marker.x, ocean.marker.z, 7);
  const here = () => (p.car ? p.car.pos : p.pos);
  await g.until(() => near(here(), m, 9) || near(here(), d.pos, 22));
  g.removeMarker(m);

  const blip = { x: d.pos.x, z: d.pos.z, color: '#ff3b4a' };
  g.blips.push(blip);
  d.running = true;
  g.updaters.push(dt => {
    if (d.caught) return false;
    const c = here();
    let ax = d.pos.x - c.x, az = d.pos.z - c.z;
    const dist = Math.hypot(ax, az) || 1;
    if (p.car ? dist < 2.6 && Math.abs(p.car.speed) > 3 : dist < 1.3) { d.caught = true; return false; }
    if (dist < 70) {
      ax /= dist; az /= dist;
      // Keep him running along the beach rather than pinned against the water.
      const minZ = bounds.minZ + 4, maxZ = bounds.maxZ - 4;
      if (d.pos.z <= minZ + 1) d.side = 1; else if (d.pos.z >= maxZ - 1) d.side = -1;
      if (Math.abs(az) < 0.55) { az = 0.85 * d.side; const n = Math.hypot(ax, az); ax /= n; az /= n; } else d.side = Math.sign(az);
      d.pos.x = clamp(d.pos.x + ax * 6.3 * dt, SHORE + 3, bounds.maxX - 3);
      d.pos.z = clamp(d.pos.z + az * 6.3 * dt, minZ, maxZ);
      d.phase += dt * 14;
      debtor.animate(d.phase, 1);
      debtor.group.rotation.y = Math.atan2(ax, az);
      debtor.group.position.copy(d.pos);
    } else debtor.animate(0, 0);
    blip.x = d.pos.x; blip.z = d.pos.z;
    return true;
  });
  g.hud.objective('Chase down <b>Mahaffey</b>. Run him over or tackle him.');
  say(g, CHRIS, "That's him by the water. He's seen us, he's running!", 3);
  await g.until(() => d.caught);

  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();
  p.locked = true;
  debtor.animate(0, 0);
  debtor.group.rotation.x = -Math.PI / 2;
  debtor.group.position.y = 0.2;
  await g.wait(0.8);
  await say(g, DEBTOR, "My leg! Tony, please, I'll have it Friday, I swear on my mother!");
  await say(g, TONY, 'You had Friday. Three Fridays ago.');
  await say(g, DEBTOR, "Here, here, take what I got on me. It's a grand. I'll get the rest!");
  await say(g, TONY, 'Tomorrow. Or next time I back up over you.');
  p.locked = false;
  await passed(g, '$1,000', 1000);

  await g.wait(4);
  g.scene.remove(chris.group, debtor.group);
}
