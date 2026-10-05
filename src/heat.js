import * as THREE from 'three';
import { near, groundAt, nodeX, nodeZ, blockCenter } from './grid.js';
import { makeLook, makeHuman, randomPedLook } from './entities.js';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, place, approach, shot, frame, reach, follower,
  punch, fistsOnly, allDown, roomScene, inRoom, roomSpot, explode, dispatch, quarry, tail, careful, smoke, lying, playing, photograph, NORTH, SOUTH, EAST, WEST,
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

  await g.wait(1);
  await say(g, '', 'Tuesday. Seven in the morning, by the light of a city that never quite gets dark or light.');
  await phone(g, CHERITTO, 'Everybody is at the yard. The rig is warm. We are waiting on you.');
  await reach(g, yard.gate, 'Drive to the <b>yard</b>.');
  p.locked = true;
  await fade(g, 1, 1);
  if (p.car) { const mine = p.car; g.leaveCar(); mine.speed = 0; mine.pos.set(yard.gate.x + 3.6, 0, yard.gate.z + 22); mine.heading = yard.gate.h; }
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
  await playing(g, 'Lieutenant Vincent Hanna', 'You play the detective in this one');
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
  const found = quarry(g, runner);
  g.hud.objective('He has seen you. <b>Chase down</b> the informant: follow the <b>yellow arrow</b>.');
  await g.until(() => runner.health < 400 || runner.dead);
  found();
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

// ========== Chapter Two: Surveillance ==========

const JUSTINE = 'Justine', LAUREN = 'Lauren', CHARLENE = 'Charlene';
// The house nearest a given distance from a place: Los Angeles has streets of them.
const houseNear = (g, to, want) => g.places.flats.slice().sort((a, b) => Math.abs(Math.hypot(a.kerb.x - to.x, a.kerb.z - to.z) - want) - Math.abs(Math.hypot(b.kerb.x - to.x, b.kerb.z - to.z) - want))[0];
// Become Hanna for a mission; the unmarked car is his.
function asHanna(g, at, heading) {
  const p = g.player;
  if (p.car) g.leaveCar();
  const hanna = makeLook('hanna');
  g.setPlayer(hanna);
  place(g, at, heading);
  return hanna;
}
// ---------- 1. Eyes On ----------
// Played as Hanna. A van outside Cheritto's house, then a parking lot, a long lens, and a fourth man nobody knows.

async function eyesOn(g) {
  const { precinct, truckstop } = g.places, p = g.player, neil = p.human, house = houseNear(g, truckstop.kerb, 280);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Major Crimes put a van on Michael Cheritto, and for three days he did nothing but eat.');
  asHanna(g, spot(precinct.door, 0, -1.6), NORTH);
  await playing(g, 'Lieutenant Vincent Hanna', 'You play the detective in this one');
  const stake = spot(house.kerb, -26, 0);
  const unit = g.spawnCar(precinct.kerb.x, precinct.kerb.z, precinct.kerb.h, 0x23232b, 'sedan'); unit.mission = true;
  const mark = g.spawnCar(house.kerb.x, house.kerb.z, house.kerb.h, 0x3a3a44, 'suv'); mark.driverless = true; mark.mission = true;
  const drucker = actor(g, 'drucker', spot(precinct.door, -1.3, -3.8), SOUTH), casals = actor(g, 'casals', spot(precinct.door, 1.4, -3.5), SOUTH);
  frame(g, p.pos, drucker.group.position, { dist: 4.6 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Eyes On', 'Major Crimes');
  await talk(g, [
    [DRUCKER, 'Three days on Cheritto. He eats, he sleeps, he eats. This morning he ironed a shirt.', drucker],
    [HANNA, 'Then he is meeting somebody. Where is he now?', p],
    [CASALS, 'Still at the house. Grey truck at the kerb.', casals],
    [HANNA, 'I will sit on him myself. When he moves, nobody gets closer than a block.', p],
  ]);
  g.cam.fixed = null;
  dismiss(g, drucker, casals);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, stake, "<b>Drive</b> to Cheritto's street and park behind the grey truck.", { how: 'car', r: 7 });
  p.locked = true;
  if (p.car) p.car.speed = 0;
  const leaving = actor(g, 'cheritto', spot(house.door, 0, Math.cos(house.door.h ?? 0) * 1.5), house.door.h ?? SOUTH);
  shot(g, spot(stake, 0, house.kerb.h > 0 ? -4 : 4), house.door, 1.5, 1.3);
  await say(g, '', 'He sat for forty minutes. Then the front door opened, and a big man in a clean shirt came down the path and got into the truck.');
  dismiss(g, leaving);
  g.cam.fixed = null;
  p.locked = false;
  for (;;) {
    dispatch(g, mark, house.kerb, truckstop.kerb, 9);
    if (await tail(g, mark, truckstop.kerb, "<b>Follow the</b> grey truck. Stay back. Don't lose him.")) break;
    p.locked = true;
    await say(g, DRUCKER + ' (radio)', 'Lost him, Vincent. He has gone round the block. Pick him up at the house.');
    await cut(g, () => { const mine = p.car || unit; g.enterCar(mine); mine.pos.set(house.kerb.x - 26, 0, house.kerb.z); mine.heading = house.kerb.h; mine.speed = 0; });
    p.locked = false;
  }
  // The lot behind the diner. Four men at two cars.
  p.locked = true;
  const crew = {}, lot = truckstop.lot, hide = spot(lot, 4, 16);
  await cut(g, () => {
    mark.pos.set(lot.x - 4, 0, lot.z - 2); mark.heading = NORTH; mark.speed = 0;
    const mine = p.car || unit; mine.pos.set(truckstop.kerb.x, 0, truckstop.kerb.z + 14); mine.speed = 0; if (p.car) g.leaveCar();
    place(g, hide, NORTH);
    crew.cheritto = actor(g, 'cheritto', spot(lot, -1.6, -1), EAST, 'talk'); crew.chris = actor(g, 'shiherlis', spot(lot, 0.6, -2.4), WEST);
    crew.trejo = actor(g, 'trejo', spot(lot, 1.2, 0.2), WEST); crew.neil = actor(g, 'neil', spot(lot, 3.4, -1.2), WEST);
    shot(g, spot(hide, -1.5, 2.5), lot, 1.8, 1.2);
  });
  await say(g, '', 'They came out of the diner in ones and twos and stood by the cars, the way men stand who have nothing to say out loud.');
  await photograph(g, crew.cheritto, 'Cheritto', hide);
  await say(g, HANNA, 'Michael Cheritto. Him we know.', 2.2);
  await photograph(g, crew.chris, 'the tall one', hide);
  await say(g, CASALS + ' (radio)', 'Shiherlis. Christopher. Boxman. Did five in McNeil.', 3);
  await photograph(g, crew.trejo, 'the driver', hide);
  await say(g, CASALS + ' (radio)', 'Trejo. Wheelman. Folsom.', 2.4);
  await photograph(g, crew.neil, 'the man in grey', hide);
  await say(g, HANNA, "And him? Grey suit. Nobody's talking, and everybody's listening to him.");
  await say(g, CASALS + ' (radio)', 'Not in the book, Vincent.');
  await say(g, HANNA, 'Then he is the one who wrote it. Get me a name.');
  await fade(g, 1, 1);
  dismiss(g, ...Object.values(crew));
  g.removeCar(mark); g.removeCar(unit);
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. The Next One ----------
// Nate has two jobs. Chris has a wife who has had enough.

async function theNextOne(g) {
  const { bar, home } = g.places, p = g.player, BAR = bar.room, NEILS = g.places.rooms.NEIL, theirs = houseNear(g, home.road, 420);

  await g.wait(1);
  g.hud.card('The Next One', "Nate's bar");
  await phone(g, NATE, 'Two things. One is tonight-sized. One is the rest of your life. Come and hear them sitting down.');
  g.hud.card();
  await reach(g, bar.kerb, "Drive to <b>Nate's bar</b>.");
  await reach(g, bar.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(BAR, [-5.05, -0.5], [-3.1, -1.35], 1.5, 1.3), q => ({
    nate: actor(g, 'nate', q.stools[3], WEST, 'sit'),
    neil: actor(g, 'neil', q.stools[4], WEST, 'sit'),
  }), async cast => {
    await talk(g, [
      [NATE, 'Tonight-sized: a precious metals depository. Platinum, palladium. The alarm goes over one phone line and I know which.', cast.nate],
      [NEIL, 'And the other.', cast.neil],
      [NATE, 'A man called Kelso reads the bank wires for a living. Far East Pacific, downtown, takes a delivery of twelve million in cash on a day he can name.', cast.nate],
      [NEIL, 'A bank, in daylight.', cast.neil],
      [NATE, 'Twelve million, Neil. You do that and you never have to sit in a bar with me again.', cast.nate],
      [NEIL, 'I like sitting in a bar with you. Set up Kelso. The metals we do first.', cast.neil],
    ]);
  }, { night: 1 });
  place(g, bar.door, bar.door.h);
  await fade(g, 0, 1);
  p.locked = false;
  await reach(g, home.road, 'Drive <b>home</b>.');
  await reach(g, home.door, 'Somebody is in the <b>house</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(NEILS, [3.6, 3], [-0.6, -3.6], 1.5, 1), q => ({
    chris: actor(g, 'shiherlis', roomSpot(q, -1.6, -4.3), NORTH),
    neil: actor(g, 'neil', roomSpot(q, 0.8, -3.2), WEST),
  }), async cast => {
    await talk(g, [
      [NEIL, 'How did you get in?', cast.neil],
      [CHRIS, 'You have no furniture and a cheap lock. Charlene threw me out. I slept on your floor. When are you going to buy a chair?', cast.chris],
      [NEIL, 'When I intend to stay. What was it this time?', cast.neil],
      [CHRIS, 'Vegas. I lost what we took off the armoured car. Most of it.', cast.chris],
      [NEIL, 'I told you once. Keep nothing in your life you could not leave behind before the kettle boils.', cast.neil],
      [CHRIS, 'She is the only fixed point I have, Neil. Take her away and I do not know which way is up.', cast.chris],
      [NEIL, '...Then go home and tell her that. I will drive you.', cast.neil],
    ]);
  }, { night: 1 });
  place(g, home.spawn, WEST);
  const chris = actor(g, 'shiherlis', spot(home.spawn, -1.4, 1.4), WEST), ride = follower(g, chris);
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b> with Chris.');
  await g.until(() => p.car);
  await reach(g, theirs.kerb, 'Drive Chris <b>home</b>.', { how: 'car', r: 7 });
  p.locked = true;
  ride.on = false;
  let charlene;
  await cut(g, () => {
    chris.group.position.set(theirs.door.x - 0.8, groundAt(theirs.door.x, theirs.door.z), theirs.door.z + Math.cos(theirs.door.h) * 1.6); chris.group.rotation.y = theirs.door.h + Math.PI; chris.group.visible = true; chris.set('idle');
    charlene = actor(g, 'charlene', spot(theirs.door, 0.6, 0), theirs.door.h);
    shot(g, spot(theirs.kerb, 0, 0), theirs.door, 1.5, 1.4);
  });
  await talk(g, [
    [CHARLENE, 'You brought your boss. So I am supposed to behave.', charlene],
    [CHRIS, 'I came back. That is all. I came back.', chris],
    [CHARLENE, 'There is a child asleep in there who thinks his father sells swimming pools. Come in. Quietly.', charlene],
  ]);
  await say(g, '', 'Neil watched the door close from the car, and drove home to a house with no chairs.');
  await cut(g, () => { dismiss(g, chris, charlene); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 3. Precious Metals ----------
// The depository, at night. Somebody across the street shifts his weight.

async function preciousMetals(g) {
  const { depository, bar } = g.places, p = g.player;

  await g.wait(1);
  g.setNight(1);
  await say(g, '', 'Two in the morning. Chris had a drill, Cheritto had the bags, and Neil had the street.');
  await phone(g, CHRIS, 'We are parked a block off the depository. Nothing moving. Come and open the night for us.');
  await reach(g, depository.gate, '<b>Drive</b> to the depository.', { how: 'car', r: 8 });
  p.locked = true;
  await fade(g, 1, 1);
  place(g, spot(depository.gate, -4, -4), NORTH, { x: depository.gate.x - 8, z: depository.gate.z, h: depository.gate.h });
  const chris = actor(g, 'shiherlis', spot(depository.door, -1.2, 1.2), NORTH), cheritto = actor(g, 'cheritto', spot(depository.door, 1.2, 1.6), NORTH);
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Precious Metals', '2:04 a.m.');
  p.locked = false;
  await reach(g, depository.ladder, 'Climb to the roof and cut the <b>alarm line</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.human.play('kneel', 'idle');
  await fade(g, 1, 0.8);
  await say(g, '', 'One wire out of forty, the grey one, and a meter to tell him the line was still listening to itself.');
  await fade(g, 0, 0.8);
  p.locked = false;
  await reach(g, spot(depository.door, 0, 2.4), 'Keep watch at the <b>door</b>.', { r: 1.8, how: 'foot' });
  dismiss(g, chris, cheritto);
  await say(g, CHRIS + ' (radio)', 'I am through the outer plate. Six minutes.', 2.6);
  await g.wait(2);
  // A sound.
  const street = spot(depository.gate, -13, 1);
  for (;;) {
    g.sfx?.click();
    g.hud.objective('A sound, across the street. Metal on metal. <b>Go and look</b>, before it matters.');
    const m = g.addMarker(street.x, street.z, 2.2), t0 = g.time;
    await g.until(() => near(p.pos, m, 2.6) || g.time - t0 > 26);
    g.removeMarker(m);
    g.hud.objective();
    if (near(p.pos, street, 3)) break;
    p.locked = true;
    await say(g, '', 'He stayed where he was. Forty seconds later the street was white with headlamps, and that was the end of all of them.');
    await cut(g, () => place(g, spot(depository.door, 0, 2.4), SOUTH));
    p.locked = false;
  }
  p.locked = true;
  shot(g, spot(street, 2, -1), spot(street, -14, 6), 1.6, 1.4);
  await say(g, '', 'A delivery van, across the street, that had not been there at midnight. Inside it somebody shifted his weight, and the springs said so.');
  await say(g, NEIL, '...', 1.6);
  g.cam.fixed = null;
  p.locked = false;
  await reach(g, spot(depository.door, 0, 2.4), 'Go back. <b>Call it off.</b>', { r: 1.8, how: 'foot' });
  p.locked = true;
  let c2, m2;
  await cut(g, () => {
    c2 = actor(g, 'shiherlis', spot(depository.door, -1.2, 0.6), SOUTH); m2 = actor(g, 'cheritto', spot(depository.door, 1.3, 0.4), SOUTH);
    place(g, spot(depository.door, 0, 2.6), NORTH);
    frame(g, p.pos, c2.group.position, { dist: 4.4 });
  }, 0.4);
  await talk(g, [
    [NEIL, 'We walk. Now. Leave the drill.', p],
    [CHRIS, 'I am four minutes from the money!', c2],
    [NEIL, 'You are four minutes from fifteen years. There is a man in a van listening to you breathe. Walk like you forgot your keys.', p],
    [CHERITTO, "Slick, if he says walk, we walk.", m2],
  ]);
  g.cam.fixed = null;
  const crew = [follower(g, c2), follower(g, m2)];
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  // Drive away as if nothing happened.
  const car = p.car, away = g.addMarker(bar.kerb.x, bar.kerb.z, 7);
  let fast = 0, spooked = false;
  g.hud.objective('<b>Drive</b> away. Slowly. They are deciding whether to take you.');
  g.updaters.push(dt => {
    if (!g.markers.includes(away)) return false;
    fast = p.car && Math.abs(p.car.speed) > 14 ? fast + dt : 0;
    if (fast > 1.2 && !spooked) { spooked = true; g.hud.subtitle('', 'Too fast. Every car on the block lit up.'); g.heat(3); }
    return true;
  });
  await g.until(() => p.car && near(p.pos, away, 8) && Math.abs(p.car.speed) < 6);
  g.removeMarker(away);
  g.hud.objective();
  g.pardon();
  p.locked = true;
  for (const r of crew) r.on = false;
  await fade(g, 1, 1);
  dismiss(g, c2, m2);
  void car;
  await say(g, '', spooked ? 'They got clear, barely, with nothing in the bags.' : 'Nobody moved. Three men drove away from an open vault with nothing in their hands.');
  await say(g, HANNA, 'He heard us. Let them go. All I have is breaking and entering, and I do not want him for that.');
  asNeil(g, p.human);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 4. Counter-Surveillance ----------
// Neil shows the police an empty yard, and takes their picture while they look at it.

async function counterSurveillance(g) {
  const { home, containers } = g.places, p = g.player, neil = p.human;

  await g.wait(1);
  g.setNight(0);
  g.hud.card('Counter-Surveillance', 'The harbour');
  await say(g, NEIL, 'Somebody is on us. I want to see his face. Everybody meets at the freight terminal, and everybody points at things.');
  g.hud.card();
  const tailCar = g.spawnCar(home.road.x - 40, home.road.z, EAST, 0x23232b, 'sedan');
  tailCar.driverless = true;
  dispatch(g, tailCar, { x: home.road.x - 40, z: home.road.z }, p.pos, 12); tailCar.nav.goal = p.pos;
  let warned = -99;
  g.updaters.push(() => {
    if (!g.cars.includes(tailCar) || !tailCar.nav) return false;
    if (Math.hypot(tailCar.pos.x - p.pos.x, tailCar.pos.z - p.pos.z) > 150 && g.time - warned > 14) { warned = g.time; g.hud.subtitle(NEIL, 'Slower. I want them with us.'); g.wait(3).then(() => g.hud.subtitle()).catch(() => {}); }
    return true;
  });
  await reach(g, containers.gate, '<b>Drive</b> to the freight terminal. Keep the black sedan behind you.', { how: 'car', r: 8 });
  p.locked = true;
  tailCar.nav = null; tailCar.speed = 0;
  let chris, cheritto;
  await cut(g, () => {
    place(g, spot(containers.centre, 0, 4), NORTH, containers.gate);
    chris = actor(g, 'shiherlis', spot(containers.centre, -2.4, 1), NORTH); cheritto = actor(g, 'cheritto', spot(containers.centre, 2.6, 0), WEST, 'talk');
    tailCar.pos.set(containers.gate.x - 30, 0, containers.gate.z); tailCar.heading = EAST;
    shot(g, spot(containers.centre, 6, 12), spot(containers.centre, 0, 0), 1.8, 1.3);
  });
  await talk(g, [
    [CHERITTO, 'So what are we looking at?', cheritto],
    [NEIL, 'Nothing. Point at the crane. Now point at the water. Good. Now we leave, one at a time.', p],
    [CHRIS, 'And you?', chris],
    [NEIL, 'I am going up.', p],
  ]);
  g.cam.fixed = null;
  dismiss(g, chris, cheritto);
  p.locked = false;
  await reach(g, containers.ladder, 'Climb the <b>ladder</b> on the north stack.', { r: 1.6, how: 'foot' });

  // Twenty minutes later, the other side of it.
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Twenty minutes later three detectives walked into the same square of asphalt to see what the crew had been looking at.');
  const hanna = asHanna(g, spot(containers.centre, 0, 12), NORTH);
  await playing(g, 'Lieutenant Vincent Hanna', 'The other side of it');
  const drucker = actor(g, 'drucker', spot(containers.centre, -2, 13), NORTH), casals = actor(g, 'casals', spot(containers.centre, 2.2, 13.4), NORTH);
  const men = [follower(g, drucker, { gap: 2.2 }), follower(g, casals, { gap: 3.4 })];
  g.cam.fixed = null;
  await fade(g, 0, 1);
  p.locked = false;
  const lines = ['A crane. A fence. Water.', 'No bank. No armoured depot. No jewellery mart for two miles.', 'So what were they looking at?'];
  for (const [n, at] of containers.spots.entries()) { await reach(g, at, 'Look around. <b>What were they casing?</b>', { r: 2, how: 'foot' }); await say(g, n === 1 ? DRUCKER : HANNA, lines[n], 2.8); }
  p.locked = true;
  for (const m of men) m.stay = true;
  const fov = g.camera.fov;
  g.cam.fixed = { pos: new THREE.Vector3(containers.high.x, containers.high.y, containers.high.z), look: new THREE.Vector3(p.pos.x, 1.2, p.pos.z) };
  g.camera.fov = 22; g.camera.updateProjectionMatrix();
  await say(g, HANNA, '...Us. He was looking at us. He walked us out here like dogs to see who was holding the leash.');
  g.sfx?.click(); g.hud.flash('#ffffff', 0.15); await g.wait(0.7); g.sfx?.click(); g.hud.flash('#ffffff', 0.15);
  await say(g, HANNA, 'He is up there right now with a lens as long as my arm. Smile, gentlemen.');
  await say(g, '', 'On the north stack a man in a grey suit put the camera down and wrote three names beside three faces.');
  await fade(g, 1, 1);
  g.camera.fov = fov; g.camera.updateProjectionMatrix();
  for (const m of men) m.on = false;
  dismiss(g, drucker, casals);
  g.removeCar(tailCar);
  void hanna;
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 5. Justine ----------
// Played as Hanna. A house he sleeps in, a wife who is finished waiting, a girl whose father did not come.

async function justine(g) {
  const { precinct } = g.places, p = g.player, neil = p.human, HOUSE = g.places.rooms.HOUSE, house = houseNear(g, precinct.kerb, 330);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Hanna went home, which he did some nights.');
  g.setNight(1);
  asHanna(g, spot(precinct.door, 0, -1.6), NORTH);
  await playing(g, 'Lieutenant Vincent Hanna', 'You play the detective in this one');
  const unit = g.spawnCar(precinct.kerb.x, precinct.kerb.z, precinct.kerb.h, 0x23232b, 'sedan'); unit.mission = true;
  const drucker = actor(g, 'drucker', spot(precinct.door, 1, -3.8), SOUTH);
  frame(g, p.pos, drucker.group.position, { dist: 4.2 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Justine', 'Major Crimes, 11 p.m.');
  await talk(g, [
    [DRUCKER, 'Go home, Vincent. They are not going to rob anything tonight. We will call you.', drucker],
    [HANNA, 'Home. Right. I know where that is.', p],
  ]);
  g.cam.fixed = null;
  dismiss(g, drucker);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, house.kerb, 'Drive <b>home</b>.', { how: 'car', r: 7 });
  await reach(g, house.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(HOUSE, [-1.2, -3], [-4.4, 0], 1.5, 1), q => ({ // from by the television, looking at the sofa
    justine: actor(g, 'justine', roomSpot(q, -3.6, 0.35), NORTH, 'sit'),
    lauren: actor(g, 'lauren', roomSpot(q, -6.3, -1.3), EAST, 'sit'),
    hanna: actor(g, 'hanna', roomSpot(q, -0.8, -1.5), WEST),
  }), async cast => {
    await talk(g, [
      [JUSTINE, 'Dinner was at eight. It is in the oven. It has been in the oven for three hours.', cast.justine],
      [HANNA, 'There were three men under a freeway with holes in them, Justine. It ran long.', cast.hanna],
      [JUSTINE, 'It always runs long. You do not live with me. You live with them, the dead ones, and you come here to sleep.', cast.justine],
      [LAUREN, 'Did my dad call? He was supposed to take me to lunch today. I waited on the steps.', cast.lauren],
      [HANNA, 'He did not call, sweetheart. I am sorry. He should have.', cast.hanna],
      [JUSTINE, 'You are good with her. You have that. I will give you that.', cast.justine],
    ]);
    g.sfx?.phone();
    await say(g, '', 'The pager on his belt went off. It was face down on the counter before she finished the sentence.');
    await talk(g, [
      [JUSTINE, 'Go. Go on. They need you.', cast.justine],
      [HANNA, 'I will be back before it is light.', cast.hanna],
      [JUSTINE, 'I know you believe that.', cast.justine],
    ]);
  }, { night: 1 });
  await fade(g, 1, 0.2);
  g.removeCar(unit);
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 6. Coffee ----------
// Hanna pulls Neil over, and buys him a cup of coffee.

async function coffee(g) {
  const { freeway, kates, precinct, home } = g.places, p = g.player, neil = p.human, DINER = g.places.rooms.DINER;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'It took Major Crimes a week to put a name to the man in the grey suit.');
  g.setNight(1);
  asHanna(g, spot(precinct.door, 0, -1.6), NORTH);
  await playing(g, 'Lieutenant Vincent Hanna', 'You play the detective in this one');
  const unit = g.spawnCar(precinct.kerb.x, precinct.kerb.z, precinct.kerb.h, 0x23232b, 'sedan'); unit.mission = true;
  const his = g.tonyCar, stake = spot(home.road, -36, 0);
  his.pos.set(home.road.x, 0, home.road.z); his.heading = WEST; his.speed = 0; his.driverless = true; his.sync?.();
  const casals = actor(g, 'casals', spot(precinct.door, 1, -3.8), SOUTH);
  frame(g, p.pos, casals.group.position, { dist: 4.2 });
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Coffee', 'Major Crimes, midnight');
  await talk(g, [
    [CASALS, 'Neil McCauley. Folsom, McNeil before that. No wife, no address worth the name. A house on the water he sleeps in.', casals],
    [HANNA, 'I have read about him for a week. Now I want to look at him.', p],
    [CASALS, 'He goes out most nights around twelve. Black sedan.', casals],
  ]);
  g.cam.fixed = null;
  dismiss(g, casals);
  p.locked = false;
  g.hud.objective('Get in the <b>car</b>.');
  await g.until(() => p.car);
  await reach(g, stake, "<b>Drive</b> to McCauley's house and wait down the road.", { how: 'car', r: 7 });
  p.locked = true;
  if (p.car) p.car.speed = 0;
  const out = actor(g, 'neil', spot(home.road, 1.8, 0.6), WEST);
  shot(g, spot(stake, 0, 3.5), home.road, 1.5, 1.2);
  await say(g, '', 'At ten to twelve a man in a grey suit came down to the road, looked at the street for longer than most people do, and got into a black sedan.');
  dismiss(g, out);
  g.cam.fixed = null;
  p.locked = false;
  dispatch(g, his, home.road, { x: freeway.x, z: freeway.south.z + 300 }, 15);
  const blip = { x: his.pos.x, z: his.pos.z, color: '#ffffff' }; g.blips.push(blip);
  g.hud.objective('<b>Catch up</b> with the black sedan and sit on its bumper.');
  let close = 0;
  g.updaters.push(dt => {
    if (!g.blips.includes(blip)) return false;
    blip.x = his.pos.x; blip.z = his.pos.z;
    close = p.car && Math.hypot(his.pos.x - p.pos.x, his.pos.z - p.pos.z) < 11 ? close + dt : 0;
    return true;
  });
  await g.until(() => close > 1.2);
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.hud.objective();
  his.nav = null; his.speed = 0;
  p.locked = true;
  let n1;
  await cut(g, () => {
    const at = { x: his.pos.x, z: his.pos.z };
    his.heading = SOUTH; his.sync();
    const mine = p.car; mine.pos.set(at.x, 0, at.z - 9); mine.heading = SOUTH; mine.speed = 0; g.leaveCar();
    n1 = actor(g, 'neil', spot(at, 2.2, 0.4), NORTH);
    place(g, spot(at, 2.2, -2), SOUTH);
    frame(g, p.pos, n1.group.position, { dist: 4.2 });
  });
  g.sfx?.horn(1.4, 0.05);
  await talk(g, [
    [HANNA, 'Licence I do not need. I know who you are. You know who I am, since the other morning at the harbour.', p],
    [NEIL, 'I know your face.', n1],
    [HANNA, 'You look like a man who could use a cup of coffee. I am buying.', p],
    [NEIL, '...Lead the way.', n1],
  ]);
  await fade(g, 1, 0.8);
  dismiss(g, n1);
  // The other car now.
  const hanna = p.human;
  g.setPlayer(neil); g.scene.remove(hanna.group);
  neil.group.visible = true;
  g.enterCar(his); his.driverless = false;
  g.cam.fixed = null;
  await fade(g, 0, 0.8);
  p.locked = false;
  for (;;) {
    dispatch(g, unit, unit.pos, kates.kerb, 10);
    if (await tail(g, unit, kates.kerb, "<b>Follow the</b> lieutenant's car.")) break;
    await say(g, NEIL, 'He is waiting at the next light.', 2);
  }
  await reach(g, kates.door, "Go in to <b>Kate's</b>.", { r: 1.8, how: 'foot' });

  const q = DINER, camOn = (x, z, lx, lz) => ({ pos: new THREE.Vector3(q.X + x, q.Y + 1.32, q.Z + z), look: new THREE.Vector3(q.X + lx, q.Y + 1.12, q.Z + lz) });
  const onNeil = camOn(-2.75, 4.05, -5.18, 4.96), onHanna = camOn(-5.75, 4.05, -3.22, 4.96), wide = camOn(-4.2, 1.9, -4.2, 4.9);
  await roomScene(g, { ...q, cam: wide }, room => ({
    neil: actor(g, 'neil', room.boothSeats.west[0], EAST, 'sit'),
    hanna: actor(g, 'hanna', room.boothSeats.east[0], WEST, 'sit'),
  }), async cast => {
    await g.wait(1.5);
    const lines = [ // written for the game: the meeting is the film's, the words are not
      [HANNA, 'Folsom, seven years. McNeil before that. I read it twice. It reads like a man who learned something.', cast.hanna],
      [NEIL, 'I learned I am not going back.', cast.neil],
      [HANNA, 'Then stop. Tonight. Buy a boat.', cast.hanna],
      [NEIL, 'I am good at one thing. So are you. Neither of us would last a week selling boats.', cast.neil],
      [HANNA, 'My third marriage is ending in a kitchen right now, because I am here with you instead. That is what the work costs me.', cast.hanna],
      [NEIL, 'It costs me nothing. I keep it that way. Nothing in my life I could not leave before the kettle boils.', cast.neil],
      [HANNA, 'I hear there is a woman.', cast.hanna],
      [NEIL, 'She thinks I sell metals.', cast.neil],
      [HANNA, 'And if you see me in the mirror one morning, she gets an empty chair and no note.', cast.hanna],
      [NEIL, 'That is the rule.', cast.neil],
      [HANNA, 'It sounds like a very quiet house.', cast.hanna],
      [NEIL, 'Some nights I dream I am under water and I have forgotten how to come up. I wake on the floor. What do you dream?', cast.neil],
      [HANNA, 'A long table. Everyone I got to too late is sitting at it. Nobody says anything. They just look.', cast.hanna],
      [HANNA, 'I do not know how to do anything else.', cast.hanna],
      [NEIL, 'Neither do I. I do not much want to.', cast.neil],
      [HANNA, 'Then understand me. If it comes to you or some stranger with a family, I will not think about this coffee. I will put you on the ground.', cast.hanna],
      [NEIL, 'And if you are what stands between me and the door, I will go through you. I will not enjoy it.', cast.neil],
      [HANNA, 'So we are clear.', cast.hanna],
      [NEIL, 'We are clear. ...It is good coffee.', cast.neil],
    ];
    for (const line of lines) { g.cam.fixed = line[2] === cast.neil ? onNeil : onHanna; await talk(g, [line]); }
    g.cam.fixed = wide;
    await say(g, '', 'They finished the coffee. Hanna paid. Neither of them shook hands, and both of them had liked it.');
  }, { night: 1 });
  g.removeCar(unit);
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Chapter two complete', 2000);
}

// ========== Chapter Three: The Bank ==========
// The preparation is shared out: Trejo finds the car, Chris fetches the rifles, Cheritto cuts the alarm. Each is played as the man who does it.

const KELSO = 'Kelso', BREEDAN = 'Breedan';
// Become one of the crew (or a detective) for a mission.
function asCrew(g, look, at, heading) {
  const p = g.player;
  if (p.car) g.leaveCar();
  const who = makeLook(look);
  g.setPlayer(who);
  place(g, at, heading);
  return who;
}
// A car a mission puts somewhere; it is cleared away with the mission.
function prop(g, at, heading, color, kind) {
  const car = g.spawnCar(at.x, at.z, heading, color, kind);
  car.driverless = true; car.mission = true; car.speed = 0;
  return car;
}
// Somebody with a gun and a grudge, marked on the radar until he is down.
function gunmen(g, look, spots, { health = 100, damage = 8 } = {}) {
  const p = g.player;
  return spots.map(at => {
    const h = typeof look === 'string' ? actor(g, look, at, toward(at, p.pos)) : (() => { const x = makeHuman(look()); x.group.position.set(at.x, groundAt(at.x, at.z), at.z); g.track(x.group); return x; })();
    h.arm(true);
    const npc = g.addNpc(h, { ai: 'shooter', health, damage, cash: 0 }), blip = { x: at.x, z: at.z, color: '#ff3b4a' };
    g.blips.push(blip);
    g.updaters.push(() => { blip.x = npc.pos.x; blip.z = npc.pos.z; if (!npc.dead) return true; const k = g.blips.indexOf(blip); if (k >= 0) g.blips.splice(k, 1); return false; });
    return npc;
  });
}
// A passer-by with a part in it.
function extra(g, at, heading, state = 'idle') {
  const who = makeHuman(randomPedLook());
  who.group.position.set(at.x, at.y ?? groundAt(at.x, at.z), at.z); who.group.rotation.y = heading; who.set(state);
  g.track(who.group);
  return who;
}
// Take fighters out of the scene, dead or not.
function clearOut(g, npcs) { for (const n of npcs) { n.dead = true; dismiss(g, n.human); } npcs.length = 0; }
const allDead = (g, npcs) => g.until(() => npcs.every(n => n.dead));
// One of the crew with a carbine: he walks with the player, and stands and fires at whoever of `foes()` is near.
function rifleman(g, human, foes, opts) {
  const f = follower(g, human, opts), at = human.group.position;
  let next = 0;
  human.arm('rifle');
  g.updaters.push(() => {
    if (!f.on) return false;
    if (f.hurt) return true;
    if (g.player.car) { f.stay = false; return true; }
    let foe = null, best = 36;
    for (const n of foes()) { const d = Math.hypot(n.pos.x - at.x, n.pos.z - at.z); if (!n.dead && d < best) { best = d; foe = n; } }
    f.stay = !!foe && near(at, g.player.pos, 30);
    if (!f.stay) return true;
    human.group.rotation.y = toward(at, foe.pos);
    if (g.time > next) { next = g.time + 1.1 + Math.random() * 0.9; human.play('shoot', 'aim'); g.sfx?.shot(); foe.hurt(17, at); }
    else if (!human.busy) human.set('aim');
    return true;
  });
  return f;
}
// The carbine, loaded, with enough for a long morning.
function carbine(g, rounds = 240) {
  const p = g.player;
  g.giveWeapon('rifle');
  const have = p.mag.rifle + p.ammo.rifle;
  if (have < rounds) g.giveAmmo('rifle', rounds - have);
  g.setWeapon('rifle');
}

// ---------- 1. Kelso ----------
// A man in the hills who reads other people's wires, and three jobs handed out in the yard.

async function kelso(g) {
  const { home, yard } = g.places, p = g.player, HOUSE = g.places.rooms.HOUSE, his = houseNear(g, home.road, 560);

  await g.wait(1);
  g.hud.card('Kelso', 'The hills');
  await phone(g, NATE, 'Kelso will see you. He lives up top and he does not come down, so you go to him. Bring nothing. He sweeps his visitors.');
  g.hud.card();
  await reach(g, his.kerb, "Drive to <b>Kelso's house</b>.");
  await reach(g, his.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await roomScene(g, inRoom(HOUSE, [-1.2, -3], [-4.4, 0], 1.5, 1), q => ({
    kelso: actor(g, 'kelso', roomSpot(q, -3.6, 0.35), NORTH, 'sit'),
    neil: actor(g, 'neil', roomSpot(q, -6.3, -1.3), EAST, 'sit'),
  }), async cast => {
    await talk(g, [
      [KELSO, 'Everything a bank says to another bank goes through the air, and the air is free. I only listen.', cast.kelso],
      [NEIL, 'What did you hear?', cast.neil],
      [KELSO, 'Far East Pacific, the downtown branch. Thursday they hold twelve point one million in cash for one morning. It arrives at nine. It is gone by one.', cast.kelso],
      [NEIL, 'Alarms.', cast.neil],
      [KELSO, 'Three lines out of the building. One to the police, one to the alarm company, one spare. I will give you the boxes. Cut them the night before and the system reports itself healthy for twenty hours.', cast.kelso],
      [NEIL, 'And your end?', cast.neil],
      [KELSO, 'Ten per cent, and you never climb this hill again.', cast.kelso],
      [NEIL, 'Done. To both.', cast.neil],
    ]);
  });
  place(g, his.door, his.door.h ?? SOUTH);
  await fade(g, 0, 1);
  p.locked = false;
  await reach(g, yard.gate, 'Drive to the <b>yard</b>. The crew is waiting.');
  p.locked = true;
  let chris, cheritto, trejo;
  await cut(g, () => {
    place(g, spot(yard.shed, -3, 2.4), EAST, { x: yard.shed.x - 9, z: yard.shed.z + 7, h: EAST });
    chris = actor(g, 'shiherlis', spot(yard.shed, 0.2, 1.4), WEST);
    cheritto = actor(g, 'cheritto', spot(yard.shed, -1, 4.6), NORTH);
    trejo = actor(g, 'trejo', spot(yard.shed, -3.4, 5.2), NORTH);
    frame(g, p.pos, chris.group.position, { dist: 5.2 });
  });
  await talk(g, [
    [NEIL, 'Thursday. A bank, in daylight, in and out in under three minutes. Everybody carries a piece of the week before it.', p],
    [NEIL, 'Trejo. The car. Four doors, grey or beige, big trunk. Nothing a witness can describe. New plates on it before it comes here.', p],
    [TREJO, 'There is long-term parking at the airport. Nobody misses a car there for a week.', trejo],
    [NEIL, 'Chris. Three carbines and magazines. There is a man at the freight terminal who sells out of a container. Pay what he asks and count nothing in front of him.', p],
    [CHRIS, 'And if he asks twice?', chris],
    [NEIL, 'Then he is not selling. Come home with the case either way.', p],
    [NEIL, 'Michael. Wednesday night you cut three lines behind the bank. There is a guard who walks the building. He never sees you.', p],
    [CHERITTO, 'I am a big man, Neil.', cheritto],
    [NEIL, 'Then be a big man standing very still.', p],
  ]);
  await cut(g, () => { dismiss(g, chris, cheritto, trejo); g.cam.fixed = null; });
  p.locked = false;
  await passed(g, 'Respect +');
}

// ---------- 2. Wheels ----------
// Played as Trejo. The right car out of the airport lot, other plates, and a sedan in the mirror that will not go away.

async function wheels(g) {
  const { airport, parts, yard } = g.places, p = g.player, neil = p.human;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Trejo took a bus to the airport with a slim piece of steel up his sleeve, like a man going to meet a flight.');
  asCrew(g, 'trejo', spot(airport.kerb, -18, 5), EAST);
  await playing(g, 'Trejo', 'The driver. You play him in this one');
  const row = spot(airport.kerb, 0, 2.2);
  const loud = prop(g, spot(row, -8, 0), EAST, 0xd8342c, 'coupe'), box = prop(g, spot(row, 2, 0), EAST, 0xf4f4f0, 'van'), grey = prop(g, spot(row, 12, 0), EAST, 0x8d8a8e, 'sedan');
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Wheels', 'Long-term parking, Los Angeles International');
  await say(g, TREJO, 'Four doors. Grey or beige. Nothing anybody can describe.');
  p.locked = false;
  g.hud.objective('<b>Take the right car</b> from the row. Remember what Neil asked for.');
  for (;;) {
    await g.until(() => p.car);
    const car = p.car;
    if (car === grey) break;
    g.leaveCar();
    await say(g, TREJO, car === loud ? 'Red, two doors. Every witness on the street would know it by lunchtime.' : car === box ? 'A white van outside a bank. I might as well paint the word on the side.' : 'Not this one. From the row.', 3);
  }
  grey.driverless = false;
  await say(g, TREJO, 'A grey sedan. I have already forgotten what it looks like.', 2.6);
  const reset = () => { g.enterCar(grey); grey.pos.set(row.x + 12, 0, row.z); grey.heading = EAST; grey.speed = 0; };
  const drive = careful(g, 'Bodywork', 'A grey car with a crushed wing is a car people describe. He put it back and found another just like it.', reset);
  await drive.to(parts.kerb, '<b>Drive</b> it to the parts store for plates. Not a scratch.', grey);
  drive.stop();
  p.locked = true;
  await cut(g, () => {
    grey.speed = 0;
    g.leaveCar();
    const back = { x: grey.pos.x - Math.sin(grey.heading) * 3, z: grey.pos.z - Math.cos(grey.heading) * 3 };
    place(g, back, grey.heading);
    shot(g, spot(back, 3.4, 2.6), back, 1.2, 0.6);
  });
  p.human.play('kneel', 'idle');
  await say(g, '', 'Two plates off a wreck behind the store, eight screws, ninety seconds. The car now belonged to a dentist in Fresno.');
  g.cam.fixed = null;
  g.enterCar(grey);
  // Somebody behind him.
  const unit = prop(g, { x: grey.pos.x - Math.sin(grey.heading) * 34, z: grey.pos.z - Math.cos(grey.heading) * 34 }, grey.heading, 0x23232b, 'sedan');
  dispatch(g, unit, unit.pos, p.pos, 15); unit.nav.goal = p.pos;
  const blip = { x: unit.pos.x, z: unit.pos.z, color: '#ff3b4a' }; g.blips.push(blip);
  let clear = 0;
  g.updaters.push(dt => {
    if (!g.blips.includes(blip)) return false;
    blip.x = unit.pos.x; blip.z = unit.pos.z;
    clear = Math.hypot(unit.pos.x - p.pos.x, unit.pos.z - p.pos.z) > 150 ? clear + dt : 0;
    return true;
  });
  p.locked = false;
  await say(g, TREJO, 'Black sedan. It was at the airport. It is here.', 2.6);
  g.hud.objective('<b>Drive.</b> Lose the black sedan before you go anywhere near the yard.');
  await g.until(() => clear > 2.5);
  g.blips.splice(g.blips.indexOf(blip), 1);
  g.removeCar(unit);
  g.hud.objective();
  await phone(g, NEIL, 'You had a tail and you lost it. Then they have your face. Put the car in the yard and stay away from the rest of us until Thursday.');
  await reach(g, yard.gate, '<b>Drive</b> the car to the yard.', { how: 'car', r: 8 });
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'He backed it under the shed, wiped the wheel, and walked four blocks before he let himself look over his shoulder.');
  g.removeCar(grey); g.removeCar(loud); g.removeCar(box);
  g.pardon();
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'The car');
}

// ---------- 3. Hardware ----------
// Played as Chris. A man who sells out of a container, and asks twice.

async function hardware(g) {
  const { containers, yard, home } = g.places, p = g.player, neil = p.human, theirs = houseNear(g, home.road, 420);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Chris took the envelope Neil gave him, and did not open it, and did not go by way of Vegas.');
  const dh = theirs.door.h ?? SOUTH;
  asCrew(g, 'shiherlis', { x: theirs.door.x - 0.8, z: theirs.door.z + Math.cos(dh) * 1.8 }, dh + Math.PI);
  await playing(g, 'Chris Shiherlis', 'The boxman. You play him in this one');
  const truck = prop(g, theirs.kerb, theirs.kerb.h, 0x3b4a66, 'pickup');
  const charlene = actor(g, 'charlene', spot(theirs.door, 0.6, 0), dh);
  shot(g, theirs.kerb, theirs.door, 1.5, 1.4);
  g.hud.fade(0, 1.2);
  await titleCard(g, 'Hardware', 'Thirty thousand dollars in an envelope');
  await talk(g, [
    [CHARLENE, 'An envelope that thick, and I am supposed to believe it is not going on a card table.', charlene],
    [CHRIS, 'It is not mine. It goes where Neil said, and I come home with what he asked for.', p],
    [CHARLENE, 'Then come home.', charlene],
  ]);
  g.cam.fixed = null;
  dismiss(g, charlene);
  p.locked = false;
  g.hud.objective('Get in the <b>pickup</b>.');
  await g.until(() => p.car);
  truck.driverless = false;
  await reach(g, containers.gate, '<b>Drive</b> to the freight terminal.', { how: 'car', r: 8 });
  p.locked = true;
  let seller;
  const men = [], c = containers.centre;
  await cut(g, () => {
    place(g, spot(c, 0, 5), NORTH, containers.gate);
    seller = extra(g, spot(c, 0, 2.6), SOUTH);
    men.push(extra(g, spot(c, -5, 0), EAST), extra(g, spot(c, 5.5, -1), WEST));
    shot(g, spot(c, 4.6, 7), spot(c, 0, 3.6), 1.6, 1.3);
  });
  await talk(g, [
    ['Seller', 'Three carbines, short barrels, nine magazines. Army never noticed. Thirty, like the man said.', seller],
    [CHRIS, 'It is all there.', p],
    ['Seller', 'I believe you. That is the problem. A man who pays thirty without a word would have paid fifty. So it is fifty.', seller],
    [CHRIS, 'He told me you might ask twice.', p],
    ['Seller', 'And what did he say to do?', seller],
    [CHRIS, 'Come home with the case.', p],
  ]);
  g.cam.fixed = null;
  g.noHeat = true;
  seller.arm(true);
  const foes = [g.addNpc(seller, { ai: 'shooter', health: 90, damage: 8 }), ...men.map(h => { h.arm(true); return g.addNpc(h, { ai: 'shooter', health: 70, damage: 7 }); })];
  g.setWeapon('pistol');
  p.locked = false;
  g.hud.objective('<b>Shoot your way out.</b>');
  await allDead(g, foes);
  await reach(g, spot(c, 0, 0.6), 'Grab the <b>case</b>.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.human.play('pickup', 'idle');
  await g.wait(1);
  carbine(g, 90);
  await say(g, '', 'Three carbines in a moulded case, and the envelope back in his jacket. Neil would want both explained.');
  p.locked = false;
  g.noHeat = false;
  g.hud.objective('Get in the <b>pickup</b> again.');
  await g.until(() => p.car);
  await reach(g, yard.gate, '<b>Drive</b> the case to the yard.', { how: 'car', r: 8 });
  p.locked = true;
  let cheritto;
  await cut(g, () => {
    place(g, spot(yard.shed, -3, 2.4), EAST, { x: yard.shed.x - 9, z: yard.shed.z + 7, h: EAST });
    cheritto = actor(g, 'cheritto', spot(yard.shed, -0.4, 2.2), WEST);
    frame(g, p.pos, cheritto.group.position, { dist: 4.4 });
  });
  await talk(g, [
    [CHERITTO, 'You got them. And you have still got the envelope. Slick, what did you do?', cheritto],
    [CHRIS, 'He asked twice.', p],
    [CHERITTO, 'Three guns and the money back. Neil is going to be angry at you and he will not be able to say why.', cheritto],
  ]);
  await fade(g, 1, 1);
  dismiss(g, cheritto, seller, ...men);
  g.removeCar(truck);
  g.pardon();
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Three carbines', 3000);
}

// ---------- 4. The Line ----------
// Played as Cheritto. Wednesday night, three boxes on the back of a bank, and a guard with a torch.

async function theLine(g) {
  const { bank } = g.places, p = g.player, neil = p.human, c = blockCenter(8, 6);

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'Wednesday, eleven at night. Michael Cheritto, two hundred and forty pounds, in a telephone company jacket.');
  g.setNight(1);
  asCrew(g, 'cheritto', spot(bank.kerb, -3, -2.5), NORTH);
  await playing(g, 'Michael Cheritto', 'The big man. You play him in this one');
  const van = prop(g, bank.kerb, EAST, 0xf4f4f0, 'van');
  // The guard walks the building, round and round.
  const loop = [[-26, 16], [-26, -27], [26, -27], [26, 16]].map(([x, z]) => ({ x: c.x + x, z: c.z + z }));
  const guard = actor(g, 'guard', loop[1], EAST, 'walk');
  let leg = 1, caught = false, on = true;
  const blip = { x: guard.group.position.x, z: guard.group.position.z, color: '#ff3b4a' }; g.blips.push(blip);
  g.updaters.push(dt => {
    if (!on) return false;
    const at = guard.group.position, to = loop[(leg + 1) % 4], dx = to.x - at.x, dz = to.z - at.z, d = Math.hypot(dx, dz);
    if (d < 0.5) leg = (leg + 1) % 4;
    else if (!p.locked || p.cutting) { at.x += dx / d * 1.7 * dt; at.z += dz / d * 1.7 * dt; at.y = groundAt(at.x, at.z); guard.group.rotation.y = Math.atan2(dx, dz); }
    blip.x = at.x; blip.z = at.z;
    if (near(at, p.pos, p.cutting ? 12 : 7) && !p.car && (!p.locked || p.cutting)) caught = true;
    return true;
  });
  const boxes = [[-21.2, -8], [3, -24.2], [21.2, 2]].map(([x, z]) => ({ x: c.x + x, z: c.z + z }));
  g.cam.fixed = null;
  g.hud.fade(0, 1.2);
  await titleCard(g, 'The Line', 'Far East Pacific, 11:10 p.m.');
  await say(g, CHERITTO, 'Three boxes. West wall, back wall, east wall. And one old man with a torch, who is red on the radar.');
  p.locked = false;
  let n = 0;
  while (n < boxes.length) {
    const at = boxes[n], m = g.addMarker(at.x, at.z, 1.6);
    g.hud.objective(`Cut the <b>alarm line</b> at box ${n + 1} of 3. Keep away from the <b>guard</b>.`);
    caught = false;
    await g.until(() => caught || (near(p.pos, at, 2) && !p.car));
    if (!caught) {
      p.locked = true; p.cutting = true;
      p.human.play('kneel', 'idle');
      const t0 = g.time;
      await g.until(() => caught || g.time - t0 > 2.6);
      p.cutting = false;
      if (!caught) { g.sfx?.click(); n++; p.locked = false; g.removeMarker(m); if (n < 3) await say(g, CHERITTO, n === 1 ? 'One. The police will hear nothing.' : 'Two. Nor the alarm company.', 2.2); continue; }
    }
    g.removeMarker(m);
    p.locked = true;
    await say(g, 'Guard', 'Hey. You. Phone company does not work nights.', 2.6);
    await fade(g, 1, 0.8);
    await say(g, '', 'He talked his way back to the van, and the job waited a night it did not have. Again.');
    place(g, spot(bank.kerb, -3, -2.5), NORTH);
    guard.group.position.set(loop[1].x, 0, loop[1].z); leg = 1;
    n = 0;
    await fade(g, 0, 0.8);
    p.locked = false;
  }
  on = false; p.cutting = false;
  g.blips.splice(g.blips.indexOf(blip), 1);
  await say(g, CHERITTO, 'Three. As far as anybody knows, this bank is fine.', 2.6);
  g.hud.objective('Get in the <b>van</b>.');
  await g.until(() => p.car);
  g.hud.objective();
  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', 'He drove home under the limit and ate a second dinner. Thursday was nine hours away.');
  dismiss(g, guard);
  g.removeCar(van);
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'The alarm');
}

// ---------- 5. Far East Pacific ----------
// Thursday. Trejo telephones, a cook takes off his apron, and four men walk into a bank.

async function farEastPacific(g) {
  const { kates, bank } = g.places, p = g.player, DINER = g.places.rooms.DINER, BANK = g.places.rooms.BANK;

  p.locked = true;
  await fade(g, 1, 1);
  await say(g, '', "Thursday, ten in the morning. Three of them sat in Kate's with coffee none of them was drinking. The fourth was late.");
  if (p.car) g.leaveCar();
  g.setNight(0);
  place(g, kates.door, SOUTH);
  await roomScene(g, inRoom(DINER, [-1.5, 2.3], [-4.3, 4.5], 1.7, 1.05), q => ({
    neil: actor(g, 'neil', q.boothSeats.west[0], EAST, 'sit'),
    chris: actor(g, 'shiherlis', q.boothSeats.east[0], WEST, 'sit'),
    cheritto: actor(g, 'cheritto', q.boothSeats.east[1], WEST, 'sit'),
    breedan: actor(g, 'breedan', roomSpot(q, -0.8, -1.1), SOUTH),
  }), async cast => {
    g.hud.card('Far East Pacific', "Kate's, 10:04 a.m.");
    await g.wait(2.5);
    g.hud.card();
    await phone(g, TREJO, 'Neil. They are on me. Two cars since six this morning, they do not even hide it. I cannot shake them and I will not bring them to you. I am out.');
    await talk(g, [
      [CHERITTO, 'So we have no driver.', cast.cheritto],
      [CHRIS, 'So we go home. We do it another Thursday.', cast.chris],
      [NEIL, 'There is no other Thursday. The money is there for three more hours.', cast.neil],
    ]);
    g.cam.fixed = inRoom(DINER, [2.6, 1.9], [-0.8, -0.5], 1.5, 1.2).cam;
    cast.neil.set('idle'); cast.neil.group.position.set(DINER.X - 0.9, DINER.Y, DINER.Z + 1.5); cast.neil.group.rotation.y = NORTH;
    await say(g, '', 'The man at the grill had a face Neil knew from a yard in Folsom. He drove then. He was flipping eggs now, for a manager who took a cut of his wages.');
    await talk(g, [
      [NEIL, 'Donald. You still drive?', cast.neil],
      [BREEDAN, 'I drive a spatula. Eight months out. I have a parole officer and a woman who thinks I am finished with all that.', cast.breedan],
      [NEIL, 'I have a car outside and a job that takes eleven minutes. Your end is more than this place will pay you in thirty years. Yes or no. I need it now.', cast.neil],
      [BREEDAN, '...Eleven minutes.', cast.breedan],
      [NEIL, 'Eleven minutes.', cast.neil],
      [BREEDAN, 'Let me turn off the grill.', cast.breedan],
    ]);
  });
  // The grey car, at the kerb.
  const car = prop(g, kates.kerb, kates.kerb.h, 0x8d8a8e, 'sedan');
  place(g, spot(kates.door, 0, 2), SOUTH);
  const chris = actor(g, 'shiherlis', spot(kates.door, -1.4, 3), SOUTH), cheritto = actor(g, 'cheritto', spot(kates.door, 1.4, 3.2), SOUTH), breedan = actor(g, 'breedan', spot(kates.door, 0.4, 4.4), SOUTH);
  const crew = [follower(g, chris), follower(g, cheritto, { gap: 2.4 }), follower(g, breedan, { gap: 3.2 })];
  carbine(g);
  p.armour = 100; g.hud.armour(100);
  await fade(g, 0, 1);
  p.locked = false;
  g.hud.objective('Get in the <b>grey sedan</b>.');
  await g.until(() => p.car === car);
  car.driverless = false;
  await say(g, NEIL, 'Donald takes the wheel at the bank and keeps it running. Vests on. Nobody says a name.');
  await reach(g, bank.kerb, '<b>Drive</b> to the bank.', { how: 'car', r: 8 });
  await reach(g, bank.door, 'Masks. <b>Go in.</b>', { r: 2, how: 'foot' });

  // Inside.
  p.locked = true;
  await fade(g, 1, 0.5);
  for (const f of crew) f.on = false;
  breedan.group.visible = false;
  g.sfx?.door();
  const q = BANK, at = (x, z) => roomSpot(q, x, z);
  p.inside = g.places.doors.find(d => d.inside === q.inside);
  const teller = q.clerk;
  for (const a of q.ambient) a.group.visible = a === teller;
  p.pos.set(q.inside.x, 0, q.inside.z); p.heading = g.cam.yaw = NORTH;
  const setAt = (h, s, heading, state) => { h.group.position.set(s.x, s.y, s.z); h.group.rotation.y = heading; h.group.visible = true; h.set(state); };
  setAt(chris, at(2.2, 4.6), NORTH, 'aim'); chris.arm('rifle');
  setAt(cheritto, at(-2.2, 4.6), NORTH, 'aim'); cheritto.arm('rifle');
  const people = [[-6, 1.6, NORTH], [-3.4, 1.7, NORTH], [-0.8, 1.6, NORTH], [8, 4.4, WEST], [-9.6, -1, EAST]].map(([x, z, h]) => extra(g, at(x, z), h));
  const manager = actor(g, 'manager', at(6, 2.05), NORTH, 'sit');
  const guards = [actor(g, 'guard', at(-9.5, 3.4), EAST), actor(g, 'guard', at(4, -1.2), SOUTH)];
  g.cam.fixed = null;
  g.noHeat = true;
  await fade(g, 0, 0.5);
  cheritto.play('shoot', 'aim'); g.sfx?.shot(); g.hud.flash('#ffffff', 0.15);
  await say(g, CHERITTO, 'Everybody on the floor! Faces on the marble! This money is insured, so nobody here needs to be brave!', 4);
  for (const who of [...people, teller]) who.set('crouch');
  const guns = { ...p.weapons };
  Object.assign(p.weapons, { pistol: false, smg: false, shotgun: false, rifle: false }); g.setWeapon('fist');
  const foes = guards.map(h => g.makeEnemy(h, { health: 55, damage: 8, cash: 0 }));
  p.locked = false;
  g.hud.objective('Two <b>guards</b> are still standing. Put them on the floor. <b>No shots.</b>');
  await g.until(() => foes.every(n => n.dead));
  Object.assign(p.weapons, guns); g.setWeapon('rifle');
  await reach(g, at(6, 3.5), 'Get the vault <b>keys</b> from the manager.', { r: 1.5, how: 'foot' });
  p.locked = true;
  p.heading = NORTH;
  shot(g, at(8.6, 4.6), at(6, 2.4), 1.5, 1.1); g.cam.fixed.pos.y = q.Y + 1.5; g.cam.fixed.look.y = q.Y + 1.1;
  await talk(g, [
    [NEIL, 'The keys are on your belt. You will hand them to me with your left hand. Nobody is going to hurt you.', p],
    ['Manager', 'There is a time lock. It does not open until...', manager],
    [NEIL, 'It opened at nine, for the delivery. I know your morning better than you do. Left hand.', p],
  ]);
  manager.layer?.('nod', { once: true });
  g.cam.fixed = null;
  p.locked = false;
  setAt(chris, at(7.6, -5.4), NORTH, 'idle');
  await reach(g, q.vault, 'Open the <b>vault</b>.', { r: 1.7, how: 'foot' });
  p.locked = true;
  p.heading = NORTH;
  for (let n = 1; n <= 3; n++) {
    g.hud.objective(`Filling the bags: <b>${n} of 3</b>`);
    p.human.play('pickup', 'idle'); chris.play('pickup', 'idle');
    await g.wait(2.2);
    g.sfx?.cash();
    if (n === 1) await say(g, CHRIS, 'It is all here. Shrink-wrapped. Twelve point one.', 2.4);
    if (n === 2) await say(g, '', 'Across town a telephone rang on a desk in Major Crimes. A man who would not give his name gave a bank, and a time, and hung up.');
  }
  g.hud.objective();
  await say(g, CHERITTO, 'Two minutes ten! Walk!', 2);
  setAt(chris, at(1.6, 4.4), SOUTH, 'idle'); setAt(cheritto, at(-1.6, 4.4), SOUTH, 'idle');
  p.locked = false;
  g.hud.objective('<b>Walk out.</b> Front door. Do not run.');
  const m = g.addMarker(q.inside.x, q.inside.z, 1.6);
  await g.until(() => !p.inside || near(p.pos, q.inside, 2));
  g.removeMarker(m);
  g.hud.objective();
  p.locked = true;
  await fade(g, 1, 0.6);
  for (const a of q.ambient) a.group.visible = true;
  teller.set('idle');
  p.inside = null;
  dismiss(g, chris, cheritto, breedan, manager, ...guards, ...people);
  g.removeCar(car);
  place(g, bank.plaza, SOUTH);
  g.noHeat = false;
  g.cam.fixed = null;
  await say(g, '', 'Three men came out of the bank into the sunshine with a bag on each shoulder, at a walk. It was the last quiet second of the day.');
  await fade(g, 0, 0.8);
  p.locked = false;
  await passed(g, '$12,100,000', 0);
}

// ---------- 6. The Street ----------
// The police are already there. Four blocks of downtown, in daylight, with a bag on each shoulder.

async function theStreet(g) {
  const { bank, bar } = g.places, p = g.player, neil = p.human, BAR = bar.room, c = blockCenter(8, 6);
  const S = nodeZ(7), X8 = nodeX(8), X7 = nodeX(7);

  p.locked = true;
  await fade(g, 1, 0.6);
  if (p.car) g.leaveCar();
  g.setNight(0);
  g.noHeat = true;
  g.pardon();
  place(g, bank.plaza, SOUTH);
  carbine(g, 300);
  p.health = 100; g.hud.health(100); p.armour = 100; g.hud.armour(100);
  const foes = [], all = () => foes;
  const chris = actor(g, 'shiherlis', spot(bank.plaza, -1.8, 0.6), SOUTH), cheritto = actor(g, 'cheritto', spot(bank.plaza, 1.8, 0.8), SOUTH);
  const car = prop(g, { x: c.x - 3, z: S - 3.6 }, WEST, 0x8d8a8e, 'sedan');
  const blocks = [prop(g, { x: c.x + 34, z: S - 3 }, 0.5, 0xf4f4f0, 'police'), prop(g, { x: c.x + 36, z: S + 3.4 }, -0.4, 0xf4f4f0, 'police')];
  const men = [rifleman(g, chris, all), rifleman(g, cheritto, all, { gap: 2.6 })];
  shot(g, spot(bank.plaza, -5, 9), spot(bank.plaza, 14, 12), 1.6, 1.4);
  g.hud.fade(0, 0.8);
  await titleCard(g, 'The Street', 'Downtown, 11:32 a.m.');
  await say(g, '', 'Across the street a man in a black suit was running toward them with a rifle, and he was not alone.');
  await say(g, HANNA, 'Police! Put the bags down!', 2);
  g.cam.fixed = null;
  foes.push(...gunmen(g, 'cop', [{ x: c.x + 30, z: S - 5 }, { x: c.x + 31, z: S + 1 }, { x: c.x + 33, z: S + 5.5 }, { x: c.x + 22, z: S + 6.5 }], { health: 90 }));
  p.locked = false;
  g.hud.objective('Police, from the east. <b>Get to the grey sedan.</b>');
  const mk = g.addMarker(car.pos.x, car.pos.z, 3.5);
  await g.until(() => p.car === car);
  g.removeMarker(mk);
  g.hud.objective();

  // Forty yards. Then the windscreen.
  p.locked = true;
  car.driverless = true;
  const crash = { x: X8 - 22, z: S - 3.4 };
  shot(g, { x: X8 - 30, z: S + 5 }, { x: c.x - 20, z: S - 3 }, 1.4, 1.2);
  let rolling = true;
  g.updaters.push(dt => { if (!rolling) return false; car.pos.x -= 15 * dt; car.sync(); if (car.pos.x <= crash.x + 3) rolling = false; return true; });
  for (let k = 0; k < 5; k++) { g.sfx?.shot(); await g.wait(0.22); }
  await say(g, '', 'Breedan got them forty yards. Then the windscreen went white, and he was dead with his foot still on the pedal.', 4);
  rolling = false;
  await cut(g, () => {
    clearOut(g, foes);
    car.pos.set(crash.x, 0, crash.z); car.heading = WEST + 0.6; car.speed = 0; car.sync();
    g.leaveCar();
    place(g, spot(crash, 2.6, 3), WEST);
    for (const [k, f] of men.entries()) { f.pos.set(crash.x + 4 + k * 1.6, 0, crash.z + 4.4 + k); f.car = null; f.human.group.visible = true; }
    g.sfx?.crash(1);
  }, 0.4);
  const steam = smoke(g, { x: crash.x - 2, z: crash.z }, 1.6);
  const body = lying(g, 'breedan', spot(crash, 0.6, -2.2), EAST);
  g.cam.fixed = null;
  p.locked = false;
  await say(g, NEIL, 'On foot! West! Stay off the middle of the street!', 2.4);

  // Two roadblocks on the way to the freeway.
  const stage = async (spots, cars, text) => {
    for (const [x, z, h] of cars) blocks.push(prop(g, { x, z }, h, 0xf4f4f0, 'police'));
    const wave = gunmen(g, 'cop', spots.map(([x, z]) => ({ x, z })), { health: 90 });
    foes.push(...wave);
    g.hud.objective(text);
    await allDead(g, wave);
    g.hud.objective();
    p.health = Math.min(100, p.health + 40); g.hud.health(p.health);
  };
  await stage([[X8 - 62, S - 4], [X8 - 60, S + 2], [X8 - 66, S + 5.5], [X8 - 40, S - 6.5]], [[X8 - 64, S - 2.5, 0.5], [X8 - 65, S + 3.6, -0.5]], 'A roadblock. <b>Break it.</b> The red marks on the radar are police.');
  await say(g, CHERITTO, 'More of them behind us! Keep going!', 2);
  await stage([[X7 - 30, S - 4.5], [X7 - 28, S + 4.5], [X7 - 34, S], [X7 + 4, S - 28], [X7 - 4, S + 26]], [[X7 - 32, S - 2.8, 0.6]], 'Another line of them at the next corner. <b>Break it.</b>');

  // Chris is hit. Cheritto goes his own way.
  p.locked = true;
  const corner = { x: X7 - 14, z: S + 2 };
  await cut(g, () => {
    for (const f of men) { f.on = false; }
    place(g, spot(corner, 0, 2), NORTH);
    chris.group.position.set(corner.x - 1.2, groundAt(corner.x, corner.z), corner.z - 0.4); chris.group.rotation.y = SOUTH; chris.after = null; chris.set('crouch');
    cheritto.group.position.set(corner.x + 2, groundAt(corner.x, corner.z), corner.z - 0.6); cheritto.group.rotation.y = WEST; cheritto.set('idle');
    frame(g, p.pos, chris.group.position, { dist: 4.4, height: 1.4, lift: 0.9 });
  }, 0.5);
  await talk(g, [
    [CHRIS, 'I am hit. Collarbone. I cannot lift the arm.', chris],
    [NEIL, 'You can walk. That is all you have to do.', p],
    [CHERITTO, 'Three of us together is one target. I go north with my bag and they have to choose.', cheritto],
    [NEIL, 'Michael.', p],
    [CHERITTO, 'Tell Elaine I had a good time. Go.', cheritto],
  ]);
  await fade(g, 1, 0.6);

  // The other side of the street: Hanna, and the man who went north.
  g.setPlayer(makeLook('hanna'));
  const hanna = p.human;
  place(g, { x: X7 + 4, z: S - 10 }, NORTH);
  carbine(g, 300);
  await playing(g, 'Lieutenant Vincent Hanna', 'The other side of the street');
  cheritto.group.position.set(X7 + 2, groundAt(X7 + 2, S - 44), S - 44); cheritto.group.rotation.y = NORTH; cheritto.arm('rifle');
  const runner = g.addNpc(cheritto, { ai: 'flee', health: 170, damage: 10 }), mark = quarry(g, runner);
  g.cam.fixed = null;
  await fade(g, 0, 0.6);
  await say(g, DRUCKER + ' (radio)', 'Vincent! The big one has gone north on his own, with a bag!', 2.6);
  p.locked = false;
  g.hud.objective('<b>Cheritto</b> is running north. <b>Stop him.</b>');
  await g.until(() => runner.dead);
  mark();
  g.hud.objective();
  p.locked = true;
  shot(g, spot(p.pos, 1.5, 2), runner.pos, 1.6, 0.5);
  await say(g, '', 'Hanna stood over him for as long as it took to be sure, which was no time at all, and then he turned back toward the shooting.');
  await fade(g, 1, 0.6);
  g.setPlayer(neil); g.scene.remove(hanna.group);
  neil.group.visible = true;
  dismiss(g, cheritto);

  // Neil, and a man who can only walk.
  place(g, spot(corner, 0, 2), WEST);
  carbine(g, 240);
  const wagon = prop(g, { x: X7 - 44, z: S + 3.6 }, WEST, 0xb9a58a, 'suv');
  chris.arm(false); chris.set('idle');
  const limp = follower(g, chris, { gap: 1.4, pace: 2.6, runs: false });
  limp.pos.set(corner.x - 1.2, 0, corner.z - 0.4);
  g.cam.fixed = null;
  await fade(g, 0, 0.6);
  const last = gunmen(g, 'cop', [[X7 - 70, S - 4], [X7 - 74, S + 4], [X7 + 30, S]].map(([x, z]) => ({ x, z })), { health: 90 });
  foes.push(...last);
  p.locked = false;
  g.hud.objective('Get to the <b>station wagon</b> up the street, and bring Chris.');
  const mw = g.addMarker(wagon.pos.x, wagon.pos.z, 3.5);
  await g.until(() => p.car === wagon && near(limp.pos, wagon.pos, 9));
  g.removeMarker(mw);
  g.hud.objective();
  wagon.driverless = false;
  clearOut(g, foes);
  g.noHeat = false;
  g.heat(3);
  await say(g, CHRIS, 'Where is Michael?', 2);
  await say(g, NEIL, 'Keep your hand on it. Press.', 2.2);
  await reach(g, bar.kerb, "Lose them. <b>Drive</b> Chris to Nate's.", { how: 'car', r: 8 });
  g.pardon();
  p.locked = true;
  limp.on = false;
  await roomScene(g, inRoom(BAR, [-5.05, -0.5], [-3.1, -1.35], 1.5, 1.3), q => ({
    nate: actor(g, 'nate', q.stools[2], WEST, 'sit'),
    chris: actor(g, 'shiherlis', q.stools[3], WEST, 'sit'),
    neil: actor(g, 'neil', q.stools[4], WEST, 'sit'),
  }), async cast => {
    await talk(g, [
      [NATE, 'There is a doctor on his way who owes me. It went through clean. He will keep the arm.', cast.nate],
      [CHRIS, 'Charlene. Somebody has to tell Charlene.', cast.chris],
      [NATE, 'Nobody goes near Charlene. They will be sitting on her by tonight.', cast.nate],
      [NEIL, 'They were across the street before we came out, Nate. Not a patrol car. Him. Somebody gave them the bank and the hour.', cast.neil],
      [NATE, 'Trejo was the one who dropped out.', cast.nate],
      [NEIL, 'Trejo was the one who told me why. I want to hear him say it again, to my face.', cast.neil],
      [NATE, 'You have twelve million dollars and a way out of the country. Take it.', cast.nate],
      [NEIL, 'Michael is on a pavement with a sheet over him. Donald never got his eleven minutes. I will take it after.', cast.neil],
    ]);
    await say(g, '', 'Two dead, one hurt, and somebody had sold them. Neil sat in the dark of the bar and began, for the first time in his life, to turn around.');
  }, { night: 1 });
  steam?.stop?.();
  dismiss(g, chris, body);
  for (const b of [...blocks, car, wagon]) if (g.cars.includes(b)) g.removeCar(b);
  asNeil(g, neil);
  await fade(g, 0, 1.2);
  p.locked = false;
  await passed(g, 'Chapter three complete', 25000);
}

export const HEAT = [
  { name: 'Chapter One', title: 'Heat', missions: [theCrew, armoured, bearerBonds, slick, eady, theDriveIn],
    titles: ['The Crew', 'Armoured', 'Bearer Bonds', 'Slick', 'Eady', 'The Drive-In'] },
  { name: 'Chapter Two', title: 'Surveillance', missions: [eyesOn, theNextOne, preciousMetals, counterSurveillance, justine, coffee],
    titles: ['Eyes On', 'The Next One', 'Precious Metals', 'Counter-Surveillance', 'Justine', 'Coffee'] },
  { name: 'Chapter Three', title: 'The Bank', missions: [kelso, wheels, hardware, theLine, farEastPacific, theStreet],
    titles: ['Kelso', 'Wheels', 'Hardware', 'The Line', 'Far East Pacific', 'The Street'] },
];
