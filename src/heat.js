import * as THREE from 'three';
import { near, groundAt } from './grid.js';
import { makeLook, makeHuman, randomPedLook } from './entities.js';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, place, approach, shot, frame, reach, follower,
  punch, fistsOnly, allDown, roomScene, inRoom, roomSpot, explode, dispatch, NORTH, SOUTH, EAST, WEST,
} from './missions.js';

// Los Angeles. The story follows the plot of Michael Mann's "Heat"; every line of dialogue is written for the game.
// The player is Neil McCauley, except where a mission says otherwise.

const NEIL = 'Neil', CHRIS = 'Chris', CHERITTO = 'Cheritto', TREJO = 'Trejo', WAINGRO = 'Waingro', NATE = 'Nate', HANNA = 'Hanna';
const EADY = 'Eady', VANZANT = 'Van Zant', DRUCKER = 'Drucker', CASALS = 'Casals';

// Put Neil back in his own body at his own door, by the light the city usually has.
function asNeil(g, neil) {
  const { home } = g.places, p = g.player;
  if (p.car) g.leaveCar();
  if (p.human !== neil) { const other = p.human; g.setPlayer(neil); g.scene.remove(other.group); }
  neil.group.visible = true;
  g.setNight(0);
  p.pos.set(home.wake.x, 0, home.wake.z); p.heading = g.cam.yaw = SOUTH;
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0;
  g.cam.fixed = null;
}

// ---------- 1. The Crew ----------
// An ambulance nobody will look at twice, charges from a man who sells them, and a new face at the truck stop.

async function theCrew(g) {
  const { home, hospital, yard, truckstop } = g.places, p = g.player, DINER = g.places.rooms.DINER;

  p.locked = true;
  p.pos.set(home.spawn.x, 0, home.spawn.z); p.heading = WEST; g.cam.yaw = WEST;
  g.hud.show(true);
  g.cam.fixed = null;
  await fade(g, 0, 1.5);
  await titleCard(g, 'The Crew', 'Los Angeles');
  await say(g, '', 'Neil McCauley kept a house on the water with nothing in it. He liked to say a man should own nothing he would turn around for.');
  await phone(g, NATE, "The armoured car runs Venice to downtown on Tuesday, under the freeway. Bearer bonds. You'll want a way out nobody looks at twice.");
  await say(g, NEIL, 'An ambulance.', 2);
  p.locked = false;
  await reach(g, hospital.kerb, 'Drive to the <b>hospital</b>.');
  g.hud.objective('Take the <b>ambulance</b> from the bay. Walk like you belong there.');
  const bay = g.addMarker(hospital.bay.x, hospital.bay.z, 4);
  await g.until(() => p.car && p.car.kind === 'ambulance');
  g.removeMarker(bay);
  const van = p.car;
  g.hud.objective('Drive it to the <b>yard</b>.');
  const m = g.addMarker(yard.gate.x, yard.gate.z, 7);
  await g.until(() => p.car === van && near(van.pos, yard.gate, 8) && Math.abs(van.speed) < 6);
  g.removeMarker(m);
  g.hud.objective();
  g.pardon();

  p.locked = true;
  let chris, cheritto;
  await cut(g, () => {
    van.speed = 0;
    place(g, spot(yard.shed, -3, 2), EAST, { x: yard.shed.x - 8, z: yard.shed.z + 6, h: EAST });
    van.mission = true; g.staged = van; // it waits here for Tuesday
    chris = actor(g, 'shiherlis', spot(yard.shed, 0, 1.6), WEST);
    cheritto = actor(g, 'cheritto', spot(yard.shed, -1.2, 4.2), NORTH);
    frame(g, p.pos, chris.group.position, { dist: 4.6 });
  });
  await talk(g, [
    [CHRIS, 'Shaped charges. Enough to open the truck like a tin. Not enough to cook the paper inside.', chris],
    [NEIL, 'How long on the door?', p],
    [CHRIS, 'Four seconds to set. Three to stand back. You asked for clean.', chris],
    [CHERITTO, "Trejo's got the route timed. And I found us a fifth for the rig. He's at the truck stop on the Ten. Name of Waingro.", cheritto],
    [NEIL, 'Who says he is good?', p],
    [CHERITTO, 'He did time with a guy I trust.', cheritto],
    [NEIL, "That's not the same as you trusting him. I'll look at him.", p],
  ]);
  await cut(g, () => { dismiss(g, chris, cheritto); g.cam.fixed = null; });
  p.locked = false;
  await reach(g, truckstop.kerb, 'Drive to the <b>truck stop</b>.');
  await reach(g, truckstop.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });

  await roomScene(g, inRoom(DINER, [-0.9, -1.3], [-1.32, 1.1], 1.45, 1.25), q => ({ // from behind the counter: three faces in a row
    waingro: actor(g, 'waingro', q.stools[1], NORTH, 'sit'),
    cheritto: actor(g, 'cheritto', q.stools[2], NORTH, 'sit'),
    neil: actor(g, 'neil', roomSpot(q, -1.32, 1.9), NORTH),
  }), async cast => {
    await talk(g, [
      [WAINGRO, "You're the one they all wait for. They told me not to talk. I talk. It's how I know I'm awake.", cast.waingro],
      [NEIL, 'You drive the rig, you put it where I say, you hold the guards. You say nothing to them. You look at nothing.', cast.neil],
      [WAINGRO, 'You guys always work together? Like a team? That must be nice.', cast.waingro],
      [NEIL, 'Stop talking.', cast.neil],
      [CHERITTO, "He's fine, Neil. He's just wound up.", cast.cheritto],
      [NEIL, 'Tuesday. Seven. Eat something.', cast.neil],
    ]);
    await say(g, '', 'Neil had looked at him for ninety seconds and did not like any of them.');
  });
  place(g, truckstop.door, SOUTH);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. Armoured ----------
// Under the freeway: a tow truck into the side of an armoured car, a charge on its doors, and a man who cannot keep still.

async function armoured(g) {
  const { yard, freeway } = g.places, p = g.player;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Tuesday. Seven in the morning, by the light of a city that never quite gets dark or light.');
  if (p.car) g.leaveCar();
  const rig = g.spawnCar(yard.gate.x - 8, yard.gate.z, WEST, 0xd8342c, 'truck');
  rig.driverless = true;
  place(g, spot(yard.gate, -4, 3), WEST);
  const waingro = actor(g, 'waingro', spot(yard.gate, -6, 4.4), EAST), cheritto = actor(g, 'cheritto', spot(yard.gate, -2.4, 5), WEST);
  frame(g, p.pos, waingro.group.position, { dist: 4.6 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Armoured', 'The yard, 7:02');
  await talk(g, [
    [NEIL, 'I drive the rig. Chris and Trejo are in the ambulance at the south end with the strip. Michael, the door man. You, the guards. Hold them, nothing else.', p],
    [WAINGRO, 'Hold them. Got it. Hold them.', waingro],
    [CHERITTO, 'Three minutes from the first call to the first black-and-white. We are gone in two fifty.', cheritto],
  ]);
  g.cam.fixed = null;
  const riders = [follower(g, waingro), follower(g, cheritto)];
  p.locked = false;
  g.hud.objective('Get in the <b>tow truck</b>.');
  await g.until(() => p.car === rig);
  await reach(g, freeway.north, 'Drive to the <b>freeway</b> and wait under it.', { how: 'car', r: 8 });

  // The armoured car comes down the avenue. Put the rig through its side.
  const car = g.spawnCar(freeway.x + 3.6, freeway.north.z - 150, SOUTH, 0x6f6f7a, 'armored');
  car.driverless = true; car.heading = SOUTH; car.speed = 0;
  car.nav = null;
  g.hud.objective('The <b>armoured car</b> is coming. <b>Ram it.</b>');
  const blip = { x: car.pos.x, z: car.pos.z, color: '#ffffff' };
  g.blips.push(blip);
  let hits = 0, lastHit = -9;
  g.updaters.push(dt => {
    if (hits >= 2) return false;
    car.pos.z += 9 * dt; car.sync(); blip.x = car.pos.x; blip.z = car.pos.z;       // it drives straight down the avenue
    if (car.pos.z > freeway.south.z + 60) car.pos.z = freeway.north.z - 150;         // and comes round again if missed
    if (p.car && Math.hypot(p.car.pos.x - car.pos.x, p.car.pos.z - car.pos.z) < 5 && Math.abs(p.car.speed) > 5 && g.time - lastHit > 1) {
      lastHit = g.time; hits++; g.sfx?.crash(1); g.hud.flash('#ffffff', 0.2);
      car.pos.x += 1.2; car.heading += 0.5;
    }
    return true;
  });
  await g.until(() => hits >= 2);
  g.blips.splice(g.blips.indexOf(blip), 1);
  car.speed = 0; car.heading = SOUTH + 1.2; car.sync();
  g.noHeat = true;

  // Out, the guards down on the kerb, the charge on the doors.
  p.locked = true;
  const guards = [];
  await cut(g, () => {
    for (const r of riders) r.on = false;
    if (p.car) g.leaveCar();
    const back = { x: car.pos.x - Math.sin(car.heading) * 3.4, z: car.pos.z - Math.cos(car.heading) * 3.4 };
    car.back = back;
    place(g, spot(back, -2.5, 1.5), toward(spot(back, -2.5, 1.5), back));
    for (let n = 0; n < 3; n++) guards.push(actor(g, 'guard', spot(car.pos, 4.5, -2 + n * 1.6), WEST, 'crouch'));
    waingro.group.position.set(car.pos.x + 6.6, groundAt(car.pos.x, car.pos.z), car.pos.z - 0.6); waingro.group.rotation.y = WEST; waingro.group.visible = true; waingro.arm(true); waingro.set('aim');
    cheritto.group.position.set(back.x + 1.6, groundAt(back.x, back.z), back.z + 1); cheritto.group.rotation.y = toward(cheritto.group.position, back); cheritto.group.visible = true; cheritto.set('idle');
  }, 0.4);
  p.locked = false;
  await reach(g, car.back, 'Set the <b>charge</b> on the doors.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, car.pos);
  p.human.play('kneel', 'idle');
  await g.wait(2.2);
  p.locked = false;
  g.hud.objective('<b>Stand back.</b>');
  const t0 = g.time;
  await g.until(() => g.time - t0 > 3 || !near(p.pos, car.back, 5));
  await g.wait(Math.max(0, 3 - (g.time - t0)));
  g.sfx?.explosion(); g.hud.flash('#ffffff', 0.5); g.cam.sway = 1;
  await g.wait(0.5);
  g.cam.sway = 0;
  await reach(g, car.back, 'Take the <b>envelopes</b>. Nothing else.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.human.play('pickup', 'idle');
  await g.wait(1);
  shot(g, spot(car.pos, 9.5, 3), spot(car.pos, 5, -0.6), 1.6, 1);
  await talk(g, [
    ['Guard', "We can't hear you. The blast. We can't hear.", guards[1]],
    [WAINGRO, "He's looking at me. Tell him to stop looking at me.", waingro],
    [CHERITTO, 'Easy. Easy! Ninety seconds.', cheritto],
  ]);
  waingro.play('shoot', 'aim'); g.sfx?.shot(); g.hud.flash('#ffffff', 0.15);
  guards[1].after = null; guards[1].set('down');
  await g.wait(0.9);
  await say(g, '', 'After that there was nobody left it was safe to leave. Neil made the decision in the time it takes to breathe in.');
  await fade(g, 1, 0.6);
  g.sfx?.shot(); await g.wait(0.25); g.sfx?.shot();
  for (const gd of guards) { gd.after = null; gd.set('down'); }
  await g.wait(0.8);

  // The ambulance, the strip across the road behind them, and the yard.
  const van = g.staged && g.cars.includes(g.staged) ? g.staged : g.spawnCar(0, 0, 0, 0xf4f4f0, 'ambulance');
  van.pos.set(freeway.south.x - 3.6, 0, freeway.south.z - 20); van.heading = NORTH; van.speed = 0; van.driverless = true;
  const chris = actor(g, 'shiherlis', spot(van.pos, -2.4, 0), EAST);
  waingro.arm(false); waingro.set('idle');
  place(g, spot(van.pos, -2.4, 2.4), NORTH);
  g.cam.fixed = null;
  await fade(g, 0, 0.6);
  await say(g, CHRIS, 'Two forty. What happened back there?');
  await say(g, NEIL, 'Later. Drive.', 2);
  dismiss(g, chris, ...guards);
  g.noHeat = false;
  g.heat(2.2);
  const crew = [follower(g, waingro), follower(g, cheritto)];
  p.locked = false;
  g.hud.objective('Get in the <b>ambulance</b>.');
  await g.until(() => p.car === van);
  await reach(g, yard.gate, 'Lose them. Drive back to the <b>yard</b>.', { how: 'car', r: 8 });
  g.pardon();

  p.locked = true;
  let fire;
  await cut(g, () => {
    for (const r of crew) r.on = false;
    place(g, spot(yard.gate, -10, 4), EAST);
    van.pos.set(yard.gate.x - 2, 0, yard.gate.z + 1); van.speed = 0;
    shot(g, spot(yard.gate, -14, 8), van.pos, 1.8, 1);
  });
  await say(g, '', 'They burned the ambulance in the yard and left in three cars, a minute apart.');
  fire = explode(g, van.pos);
  await g.wait(3);
  await say(g, '', 'One point six million in bearer bonds, and three dead men that nobody had planned on.');
  await fade(g, 1, 1);
  fire?.stop?.();
  g.removeCar(van); g.removeCar(car); g.removeCar(rig);
  dismiss(g, waingro, cheritto);
  g.staged = null;
  asNeil(g, p.human);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Bearer bonds');
}

// ---------- 3. Bearer Bonds ----------
// Nate has a buyer: the man the bonds were stolen from. And Waingro has to be dealt with, in the lot behind the diner.

async function bearerBonds(g) {
  const { bar, truckstop } = g.places, p = g.player, BAR = bar.room, DINER = g.places.rooms.DINER;

  await g.wait(1);
  g.hud.card('Bearer Bonds', "Nate's bar");
  await phone(g, NATE, 'Come see me. I have a home for your paper.');
  g.hud.card();
  await reach(g, bar.kerb, 'Drive to <b>Nate\'s bar</b>.');
  await reach(g, bar.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(BAR, [-5.05, -0.5], [-3.1, -1.35], 1.5, 1.3), q => ({ // from behind the bar
    nate: actor(g, 'nate', q.stools[3], WEST, 'sit'),
    neil: actor(g, 'neil', q.stools[4], WEST, 'sit'),
  }), async cast => {
    await talk(g, [
      [NATE, 'The bonds belong to a man called Roger Van Zant. Offshore money, onshore lawyers.', cast.nate],
      [NEIL, 'So?', cast.neil],
      [NATE, 'So he is insured. He gets every dollar back from the insurance. Then he buys the paper from you at sixty cents and sells it again. He eats twice. You eat once, but soon.', cast.nate],
      [NEIL, 'Set it up.', cast.neil],
      [NATE, 'Three guards, Neil. That is not your work.', cast.nate],
      [NEIL, 'It was the new man. That gets settled today.', cast.neil],
    ]);
  }, { night: 1 });
  place(g, bar.door, bar.door.h);
  await fade(g, 0, 1);
  p.locked = false;
  await reach(g, truckstop.kerb, 'The crew is at the <b>truck stop</b>. So is Waingro.');
  await reach(g, truckstop.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });

  await roomScene(g, inRoom(DINER, [-1.5, 2.3], [-4.3, 4.5], 1.7, 1.05), q => ({ // the crew in a booth; Neil comes to the end of the table
    waingro: actor(g, 'waingro', q.boothSeats.west[0], EAST, 'sit'),
    cheritto: actor(g, 'cheritto', q.boothSeats.west[1], EAST, 'sit'),
    chris: actor(g, 'shiherlis', q.boothSeats.east[0], WEST, 'sit'),
    neil: actor(g, 'neil', roomSpot(q, -4.2, 3.35), SOUTH),
  }), async cast => {
    await talk(g, [
      [WAINGRO, "So where's my end? I held them. I did what you said.", cast.waingro],
      [NEIL, 'You were told to look at nothing.', cast.neil],
      [WAINGRO, 'He was looking at me! You saw him. I had to get it on.', cast.waingro],
    ]);
    await punch(g, cast.neil, cast.waingro);
    await talk(g, [
      [NEIL, 'Outside. We are going to talk about your end outside.', cast.neil],
      [CHRIS, "There's a family in the next booth, Neil.", cast.chris],
      [NEIL, "That's why outside.", cast.neil],
    ]);
  });
  // The lot behind the diner.
  place(g, spot(truckstop.back, -1.5, 0), EAST);
  const waingro = actor(g, 'waingro', spot(truckstop.back, 1.2, 0), WEST);
  await fade(g, 0, 1);
  const foe = g.makeEnemy(waingro, { health: 130, damage: 9, cash: 0 });
  foe.die = () => { foe.health = 1; foe.human.after = null; foe.human.set('down'); foe.ai = null; foe.stays = true; };
  fistsOnly(g, true);
  p.locked = false;
  g.hud.objective('<b>Deal with Waingro.</b>');
  await g.until(() => foe.ai === null);
  g.hud.objective();
  fistsOnly(g, false);
  g.removeNpc(waingro);
  // A patrol car rolls through the lot, slow.
  p.locked = true;
  const cruiser = g.spawnCar(truckstop.kerb.x, truckstop.kerb.z - 30, SOUTH, 0xf4f4f0, 'police');
  cruiser.speed = 5; cruiser.driverless = true;
  g.updaters.push(dt => { if (!g.cars.includes(cruiser)) return false; cruiser.pos.z += 5 * dt; cruiser.sync(); return true; });
  shot(g, spot(truckstop.back, -6, 3), spot(truckstop.kerb, 0, -8), 1.7, 1.2);
  await say(g, '', 'A patrol car turned into the lot, slow, two men looking at nothing in particular. Neil stood very still and looked at them.');
  dismiss(g, waingro);
  await g.wait(1.5);
  shot(g, spot(truckstop.back, -4, 2.5), truckstop.back, 1.7, 0.6);
  await say(g, '', 'When he looked down again, there was a little blood on the asphalt and no Waingro.');
  await say(g, NEIL, '...Where is he.', 2.4);
  await fade(g, 1, 1);
  g.removeCar(cruiser);
  g.cam.fixed = null;
  g.pardon();
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. Slick ----------
// Played as Lieutenant Vincent Hanna, Major Crimes. The scene under the freeway, and a name out of a man who runs.

async function slick(g) {
  const { freeway, bar } = g.places, p = g.player, neil = p.human;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'The man who caught the case was Lieutenant Vincent Hanna, Major Crimes. Three marriages. He had been awake since Sunday.');
  if (p.car) g.leaveCar();
  const hanna = makeLook('hanna');
  g.setPlayer(hanna);
  const unit = g.spawnCar(freeway.north.x - 3.6, freeway.north.z + 6, SOUTH, 0x23232b, 'sedan');
  const wreck = g.spawnCar(freeway.under.x + 5, freeway.under.z - 4, SOUTH + 1.2, 0x6f6f7a, 'armored'), rig = g.spawnCar(freeway.under.x - 2, freeway.under.z - 8, WEST + 0.4, 0xd8342c, 'truck');
  wreck.driverless = rig.driverless = true;
  place(g, spot(freeway.under, -6, 6), NORTH);
  const drucker = actor(g, 'drucker', spot(freeway.under, -4.4, 4), SOUTH), casals = actor(g, 'casals', spot(freeway.under, -7.4, 3.6), SOUTH);
  const witness = makeHuman(randomPedLook()); witness.group.position.set(freeway.under.x + 12, groundAt(freeway.under.x + 12, freeway.under.z), freeway.under.z + 8); g.track(witness.group);
  frame(g, p.pos, spot(freeway.under, -6, 3.8), { dist: 5 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Slick', 'Under the freeway');
  await talk(g, [
    [DRUCKER, 'Three guards. Bonds only: they left the cash and the loose stuff on the floor.', drucker],
    [CASALS, 'Rig was stolen yesterday in Fresno. Ambulance out of St. Mary. Burned, we think.', casals],
    [HANNA, "Then they knew what was in the truck and what it weighed. Walk it with me.", p],
  ]);
  g.cam.fixed = null;
  p.locked = false;
  await reach(g, spot(wreck.pos, -2.6, -2.6), 'Look at the <b>doors</b>.', { r: 1.6, how: 'foot' });
  await say(g, HANNA, 'A shaped charge. Just enough. Somebody did the arithmetic.');
  await reach(g, spot(rig.pos, 3, 2), 'Look at the <b>tow truck</b>.', { r: 1.8, how: 'foot' });
  await say(g, HANNA, "They hit it broadside at speed and walked away. The response time is three minutes. They were gone in under.");
  await reach(g, witness.group.position, 'Talk to the <b>witness</b>.', { r: 1.8, how: 'foot' });
  p.locked = true;
  approach(g, witness);
  frame(g, p.pos, witness.group.position, { dist: 4 });
  await talk(g, [
    ['Witness', "One of them, the big one, he said a thing to another one. He called him 'Slick'. Like a name.", witness],
    [HANNA, 'Slick. That is what you heard?', p],
    ['Witness', "And then the long-haired one started shooting, and I was under my car.", witness],
  ]);
  g.cam.fixed = null;
  await say(g, HANNA, "This crew is good. This crew does not shoot guards. One of them is not one of them. ...There's a man owes me a conversation.");
  p.locked = false;
  await reach(g, bar.kerb, 'Find your <b>informant</b> outside the bar.');

  const snitch = actor(g, 'snitch', spot(bar.door, 1.5, 1.5), bar.door.h);
  const runner = g.addNpc(snitch, { health: 400, ai: 'flee', cash: 0, stays: true });
  runner.threat = p.pos.clone();
  fistsOnly(g, true);
  g.noHeat = true;
  g.hud.objective('He has seen you. <b>Chase down</b> the informant.');
  await g.until(() => runner.health < 400 || runner.dead);
  g.hud.objective();
  g.removeNpc(snitch);
  fistsOnly(g, false);
  g.noHeat = false;
  p.locked = true;
  snitch.after = null; snitch.set('idle');
  approach(g, snitch, 1.6);
  frame(g, p.pos, snitch.group.position, { dist: 4 });
  await talk(g, [
    ['Informant', "Okay! Okay. I was going to call. I was on my way to a phone.", snitch],
    [HANNA, "You run from me again and I will have you directing traffic in Barstow. Slick. Give me a Slick.", p],
    ['Informant', "It's what a guy calls everybody. Big guy. Does scores, does time, eats like it's a sport. Cheritto. Michael Cheritto.", snitch],
    [HANNA, 'See? Now we are friends again.', p],
  ]);
  await fade(g, 1, 1);
  dismiss(g, snitch, drucker, casals); g.untrack(witness.group);
  g.removeCar(unit); g.removeCar(wreck); g.removeCar(rig);
  await say(g, '', 'By midnight there was a van outside Michael Cheritto\'s house, and by the weekend Hanna had a picture of everyone he ate with.');
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Eady ----------
// A book about steel, a counter at a diner, and the end of a pier at night.

async function eady(g) {
  const { bookstore, kates, pier } = g.places, p = g.player, BOOKS = g.places.rooms.BOOKS, DINER = g.places.rooms.DINER;

  await g.wait(1);
  g.hud.card('Eady', 'A bookstore, downtown');
  await say(g, '', 'The next score was metals. Neil read about what he stole before he stole it.');
  g.hud.card();
  await reach(g, bookstore.kerb, 'Drive to the <b>bookstore</b>.');
  await reach(g, bookstore.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(BOOKS, [1.4, 5], [4.3, 2.3]), q => ({
    eady: actor(g, 'eady', roomSpot(q, 5.6, 2.4), WEST),
    neil: actor(g, 'neil', roomSpot(q, 3.1, 2.4), EAST),
  }), async cast => {
    await talk(g, [
      [EADY, 'Stress fractures in alloy steels. Is that for work?', cast.eady],
      [NEIL, 'Why do you ask?', cast.neil],
      [EADY, "Because nobody buys it for pleasure. I'm sorry. I just ring them up.", cast.eady],
      [NEIL, '...It is for work.', cast.neil],
    ]);
  });
  place(g, bookstore.door, SOUTH);
  await fade(g, 0, 1);
  await say(g, '', 'That evening he ate alone at a counter, the way he ate every evening.');
  p.locked = false;
  await reach(g, kates.kerb, "Drive to <b>Kate's</b>.");
  await reach(g, kates.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(DINER, [1.3, -1.3], [1.3, 1.1], 1.45, 1.25), q => ({ // two stools apart, then not
    eady: actor(g, 'eady', q.stools[4], NORTH, 'sit'),
    neil: actor(g, 'neil', q.stools[3], NORTH, 'sit'),
  }), async cast => {
    await talk(g, [
      [EADY, 'The steel book. You were in the store today.', cast.eady],
      [NEIL, 'Lady, why are you so interested in what I read?', cast.neil],
      [EADY, "I'm not. I saw you, and I thought I knew one person in this room. Forget it.", cast.eady],
      [NEIL, '...I did not mean that. I am not used to being spoken to. Sit. What do you do, when you are not ringing them up?', cast.neil],
      [EADY, 'I draw letters. For menus, signs. I came out here to do that and I mostly ring them up.', cast.eady],
      [NEIL, 'I sell metals. There is a place I go to look at the water. Come and look at it.', cast.neil],
    ]);
  }, { night: 1 });
  place(g, kates.door, SOUTH);
  g.setNight(1);
  const her = actor(g, 'eady', spot(kates.door, 1.2, 1.2), SOUTH), walk = follower(g, her, { pace: 3.4 });
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Eady.');
  await g.until(() => p.car);
  await reach(g, pier.start, 'Drive to the <b>pier</b>.', { how: 'car', r: 7 });
  await reach(g, pier.end, 'Walk her to the <b>end of the pier</b>.', { r: 3, how: 'foot' });
  p.locked = true;
  walk.on = false;
  her.group.position.set(pier.end.x, groundAt(pier.end.x, pier.end.z), pier.end.z + 1.2); her.group.rotation.y = EAST; her.group.visible = true; her.set('idle');
  p.pos.set(pier.end.x, 0, pier.end.z - 0.6); p.heading = EAST;
  shot(g, spot(pier.end, -5, 0.3), spot(pier.end, 4, 0.3), 2, 1.3);
  await talk(g, [
    [EADY, 'From here the city looks like somebody spilled it.', her],
    [NEIL, 'In some places the sea glows at night. Small animals in the water. I am going to see that. Soon.', p],
    [EADY, 'You travel a lot? Alone?', her],
    [NEIL, 'I am alone. I am not lonely. Those are different.', p],
    [EADY, 'Are they?', her],
  ]);
  await say(g, '', 'He did not answer, and he did not take her home until it was light.');
  await fade(g, 1, 1.2);
  dismiss(g, her);
  asNeil(g, p.human);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. The Drive-In ----------
// Van Zant says yes to the price and sends men instead of money.

async function theDriveIn(g) {
  const { drivein } = g.places, p = g.player;
  let benny;

  await g.wait(1);
  g.hud.card('The Drive-In', 'The Sundown, after closing');
  await phone(g, NATE, 'Van Zant says yes. Sixty cents. His man brings it to the Sundown drive-in at eight, in a pickup. I do not love how fast he said yes.');
  await say(g, NEIL, 'Neither do I. Chris goes on the roof of the snack bar. Michael sits at the gate.');
  g.hud.card();
  g.setNight(1);
  await reach(g, drivein.gate, 'Drive to the <b>drive-in</b>.', { how: 'car', r: 7 });

  p.locked = true;
  const pickup = g.spawnCar(drivein.west.x, drivein.west.z, EAST, 0x23232b, 'pickup');
  pickup.driverless = true;
  const thugs = [];
  await cut(g, () => {
    const mine = p.car; place(g, spot(drivein.lot, 0, 2), NORTH, { x: drivein.lot.x - 4, z: drivein.lot.z + 6, h: NORTH }); void mine;
    pickup.pos.set(drivein.mid.x - 3, 0, drivein.mid.z); pickup.heading = EAST; pickup.speed = 0; pickup.sync();
    benny = actor(g, 'benny', spot(drivein.mid, -3, 2.6), SOUTH);
    frame(g, p.pos, benny.group.position, { dist: 5.2 });
  });
  await talk(g, [
    ['Driver', 'You McCauley? Package is in the truck. You want to count it, come count it.', benny],
    [NEIL, 'Bring it here. Put it on the ground and walk back.', p],
    ['Driver', "Sure. Sure. It's just, it's heavy.", benny],
  ]);
  await say(g, '', 'A man sat up in the bed of the pickup with something long in his hands.');
  g.cam.fixed = null;
  g.noHeat = true;
  g.giveAmmo('pistol', 36); g.setWeapon('pistol');
  const mk = (look, at, h) => { const a = typeof look === 'string' ? actor(g, look, at, h) : (() => { const x = makeHuman(look); x.group.position.set(at.x, groundAt(at.x, at.z), at.z); x.group.rotation.y = h; g.track(x.group); return x; })(); thugs.push(a); return a; };
  const foes = [
    g.makeEnemy(benny, { ai: 'shooter', health: 110, damage: 9, cash: 200 }),
    g.makeEnemy(mk(randomPedLook(), spot(drivein.mid, -3, -1.6), SOUTH), { ai: 'shooter', health: 80, damage: 9, cash: 60 }),
    g.makeEnemy(mk(randomPedLook(), spot(drivein.screen, -8, 2), SOUTH), { ai: 'shooter', health: 80, damage: 8, cash: 60 }),
    g.makeEnemy(mk(randomPedLook(), spot(drivein.east, -2, 0), WEST), { ai: 'shooter', health: 80, damage: 8, cash: 60 }),
  ];
  // Chris, on the roof with a rifle: every few seconds one of them takes a round.
  let next = g.time + 2.5;
  g.updaters.push(() => {
    const alive = foes.filter(f => !f.dead);
    if (!alive.length) return false;
    if (g.time > next) { next = g.time + 3; const t = alive[alive.length - 1]; g.sfx?.shot(); g.hud.flash('#ffffff', 0.08); t.hurt(45, new THREE.Vector3(drivein.booth.x, 0, drivein.booth.z)); }
    return true;
  });
  p.locked = false;
  g.hud.objective("<b>It's a set-up.</b> Put them down. Chris has the roof.");
  await g.until(() => foes.every(f => f.dead));
  g.hud.objective();
  g.noHeat = false;
  g.pardon();
  p.locked = true;
  await g.wait(1);
  await say(g, CHRIS + ' (radio)', 'Clear. Four down. Nobody else on the street.');
  await phone(g, VANZANT, 'Yes? Is it done?');
  await talk(g, [
    [NEIL, 'It is done. Your men are in the lot. Keep the money.', p],
  ]);
  await phone(g, VANZANT, "What? Who is this? If it's the money, we can—");
  await talk(g, [
    [NEIL, 'I am telling you what happens next, so that you recognise it when it comes.', p],
  ]);
  await fade(g, 1, 1.2);
  dismiss(g, benny, ...thugs.filter(t => t !== benny));
  g.removeCar(pickup);
  asNeil(g, p.human);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Chapter one complete', 3000);
}

export const HEAT = [
  { name: 'Chapter One', title: 'Heat', missions: [theCrew, armoured, bearerBonds, slick, eady, theDriveIn],
    titles: ['The Crew', 'Armoured', 'Bearer Bonds', 'Slick', 'Eady', 'The Drive-In'] },
];
