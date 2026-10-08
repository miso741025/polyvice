import * as THREE from 'three';
import { near, groundAt } from './grid.js';
import { makeLook, makeHuman } from './entities.js';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, place, frame, reach, follower,
  punch, fistsOnly, inRoom, roomSpot, lying, playing, enter, leave, walkOut, wantCar, outdoors, walkTo, NORTH, SOUTH, EAST, WEST,
} from './missions.js';

// Nexus. The story follows the plot of "Blade Runner 2049"; every line of dialogue is written for the game, and the
// figures are the film's wardrobe on generic bodies. The player is K, a blade runner for the city's police.

const K = 'K', JOI = 'Joi', JOSHI = 'Lt. Joshi', SAPPER = 'Sapper Morton', COCO = 'Coco', LUV = 'Luv', WALLACE = 'Wallace', COTTON = 'Mister Cotton', STELLINE = 'Dr. Stelline';

// Joi: a hologram. The same figure, but light goes through her, and she jumps a frame now and then.
function hologram(g, who, at, heading, state = 'idle') {
  const a = actor(g, who, at, heading, state);
  a.group.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.72; o.material.depthWrite = false; o.material.emissive?.set(0x2a4a7a); if (o.material.emissiveIntensity !== undefined) o.material.emissiveIntensity = 0.6; o.castShadow = false; } });
  a.holo = true;
  g.updaters.push(() => { if (!a.group.parent) return false; const t = g.time; a.group.visible = Math.sin(t * 13) > -0.985; a.group.position.x += Math.sin(t * 37) > 0.995 ? 0.03 : 0; return true; });
  return a;
}
// Put K back at his own door, on foot, in the rain.
function asK(g) {
  const { home } = g.places, p = g.player;
  if (p.car) g.leaveCar();
  outdoors(g);
  p.pos.set(home.wake.x, 0, home.wake.z); p.heading = g.cam.yaw = NORTH;
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0; g.tonyCar.alt = 0;
  g.cam.fixed = null;
}
// The spinner, landed where a mission wants it.
const land = (g, at) => { const c = g.tonyCar; if (g.player.car === c) g.leaveCar(); c.pos.set(at.x, 0, at.z); c.heading = at.h ?? 0; c.speed = 0; c.alt = 0; c.sync?.(); return c; };

// ---------- 1. Protein Farm ----------
// A retirement, out where the city thins into mud and greenhouses. Then something under a tree that should not be there.
async function proteinFarm(g) {
  const { home, farm } = g.places, p = g.player, HOUSE = g.places.rooms.FARMHOUSE;
  p.locked = true;
  p.pos.set(home.spawn.x, 0, home.spawn.z); p.heading = g.cam.yaw = SOUTH;
  g.hud.show(true); g.cam.fixed = null;
  await fade(g, 0, 1.5);
  await titleCard(g, 'Protein Farm', 'Nexus, Sector 9');
  await say(g, '', 'K was a blade runner. The old models, the ones that could say no, were his to find; the new ones, who could not, were everyone else.', 5.4);
  await phone(g, JOSHI, 'A farm on the north edge. One of the old Nexus-8s, registered to nobody. Bring him in or bring in what is left. Either is fine.');
  await say(g, K, 'On my way.', 1.8);
  p.locked = false;
  await wantCar(g, g.tonyCar, 'Take the <b>spinner</b>. Space lifts it; Shift brings it down.');
  await reach(g, farm.gate, '<b>Fly</b> out to the protein farm, on the north edge of the city.', { how: 'car', r: 9 });
  p.locked = true;
  land(g, farm.gate);
  await say(g, '', 'Greenhouses in rows, lit from inside, and in each of them grubs the colour of candle wax. It was somebody\'s whole life.', 4.8);
  const sapper = actor(g, 'sapper', { x: farm.yard.x, z: farm.yard.z }, toward(farm.yard, farm.gate));
  p.locked = false;
  await reach(g, spot(farm.yard, 0, 3), 'Go in. The <b>farmer</b> is at his pump.', { r: 2, how: 'foot' });
  p.locked = true;
  p.heading = toward(p.pos, sapper.group.position); sapper.group.rotation.y = toward(sapper.group.position, p.pos);
  frame(g, p.pos, sapper.group.position, { dist: 4.4 });
  await talk(g, [
    [SAPPER, 'The road ends at my fence. You came past it anyway, in a police car.', sapper],
    [K, 'I need to see your eye. Then you can go back to your grubs.', p],
    [SAPPER, 'You are one of the new ones. You would be, to come out here alone.', sapper],
    [K, "Your eye, Mr. Morton. I would rather not do this the other way.", p],
    [SAPPER, 'The other way is the only way any of you know. Come inside, then. The kettle is on.', sapper],
  ]);
  g.cam.fixed = null; p.locked = false;
  const big = follower(g, sapper, { gap: 2.2, runs: false, pace: 2.6 });
  await reach(g, farm.house.door, 'Follow him into the <b>farmhouse</b>.', { r: 1.8, how: 'foot' });
  big.on = false;
  dismiss(g, sapper);
  await enter(g, HOUSE);
  // Inside: it starts with a kettle and ends on the floor.
  const sap = actor(g, 'sapper', roomSpot(HOUSE, 2, -2), toward(roomSpot(HOUSE, 2, -2), HOUSE.inside));
  p.locked = true;
  p.pos.set(HOUSE.X - 1, 0, HOUSE.Z + 0.5); p.heading = toward(p.pos, sap.group.position);
  g.cam.fixed = inRoom(HOUSE, [-4, 3], [1, -1.5], 1.6, 1.1).cam;
  await talk(g, [
    [SAPPER, 'I have seen a thing you have not. Something no one made. It changed me. It would change you too, if you let it.', sap],
    [K, 'I am not here to be changed.', p],
    [SAPPER, 'No. You are here because they are afraid of what I saw.', sap],
  ]);
  await say(g, '', 'He came at K with the kettle, and then with the rest of himself. It took the length of the kitchen to settle.', 4.2);
  g.cam.fixed = null;
  const foe = g.makeEnemy(sap, { health: 180, stays: true, cash: 0 });
  fistsOnly(g);
  p.locked = false;
  g.hud.objective('<b>Put him down.</b> He is stronger than he looks, and he looks strong.');
  await g.until(() => foe.dead || sap.state === 'down');
  g.hud.objective();
  p.locked = true;
  await cut(g, () => { g.cam.fixed = inRoom(HOUSE, [-3, 2.5], [1.5, -2], 1.5, 0.6).cam; p.heading = toward(p.pos, sap.group.position); }, 0.4);
  await say(g, '', 'K took the eye for the record, and the rest of him was no longer anybody\'s problem. Outside, the rain had not stopped.', 4.4);
  await say(g, K, "Joshi. Morton's retired. There is something here I want the drone to look at before I go.", 3.8);
  g.cam.fixed = null; p.locked = false;
  await walkOut(g, HOUSE, 'Go back <b>out</b> to the yard.');
  await reach(g, farm.root, 'There is a dead <b>tree</b> at the end of the field. Go and look at it.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.pos.set(farm.root.x, 0, farm.root.z); p.heading = toward(p.pos, farm.tree);
  g.cam.fixed = { pos: new THREE.Vector3(farm.tree.x + 4, 2.2, farm.tree.z + 4.5), look: new THREE.Vector3(farm.tree.x, 0.8, farm.tree.z) };
  await say(g, '', 'Flowers at the foot of it, left there on purpose. And the drone, hanging over the field, said the ground under them was not solid.', 4.6);
  await say(g, K, 'Something buried. Send a team: I want it dug tonight, and I want it at the morgue before anyone else hears.', 4.4);
  await fade(g, 1, 1);
  await say(g, '', 'What came out of the ground was a box, and in the box were bones, and on the bones a number cut in small letters where no one would look.');
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Retired');
}

// ---------- 2. Baseline ----------
// Back at the station: the test every blade runner takes after a kill, the lieutenant, and the bones.
async function baseline(g) {
  const { precinct, hospital } = g.places, p = g.player, OFFICE = g.places.rooms.OFFICE, TEST = g.places.rooms.BASELINE, MORGUE = g.places.rooms.HOSPITAL;
  await reach(g, precinct.kerb, '<b>Drive</b> to police headquarters. The test comes first, it always does.', { how: 'car', r: 8 });
  p.locked = true;
  land(g, precinct.kerb);
  p.locked = false;
  await reach(g, precinct.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, TEST);
  // The baseline: a chair, a lens, and words read back as flat as he can make them.
  p.locked = true;
  p.pos.set(TEST.chair.x, 0, TEST.chair.z); p.heading = TEST.chair.h; p.pose = 'sit';
  g.cam.fixed = { pos: new THREE.Vector3(TEST.lens.x, TEST.Y + 1.5, TEST.lens.z + 0.6), look: new THREE.Vector3(TEST.chair.x, TEST.Y + 1.2, TEST.chair.z) };
  await say(g, '', 'The room is white so that nothing in it is yours. A voice gives you words, and you give them back without anything attached.', 4.6);
  const WORDS = ['Within the cells.', 'A tall white fountain.', 'Interlocked.', 'What it is to be held.', 'Interlocked.', 'A system of cells within cells.', 'Against the dark.', 'Interlocked.'];
  let miss = 0;
  for (const w of WORDS) {
    g.hud.subtitle('Baseline', w);
    const t0 = g.time;
    g.hud.objective(`Say it back: press <b>Enter</b> as the word is spoken, and not after.`);
    const ok = await (async () => { for (;;) { if (g.consume('Enter')) return g.time - t0 > 0.25; if (g.time - t0 > 2.4) return false; await g.wait(0.03); } })();
    if (!ok) { miss++; g.hud.flash('#8f7bff', 0.2); }
    g.hud.subtitle();
    await g.wait(0.5);
  }
  g.hud.objective();
  await say(g, 'Baseline', miss <= 2 ? 'Constant K. You can pick up your bonus.' : 'Constant K. Just. We will do this again, tomorrow.', 3.2);
  p.pose = null;
  await cut(g, () => { p.pos.set(TEST.inside.x, 0, TEST.inside.z); g.cam.fixed = null; }, 0.4);
  p.locked = false;
  // Up to the lieutenant.
  await walkOut(g, TEST, 'Go <b>out</b>, and up to the lieutenant.');
  await enter(g, OFFICE);
  const joshi = actor(g, 'joshi', roomSpot(OFFICE, 2, -2.4), SOUTH, 'sit');
  p.locked = true;
  p.pos.set(OFFICE.X + 2, 0, OFFICE.Z + 0.2); p.heading = NORTH;
  g.cam.fixed = inRoom(OFFICE, [-2.5, 1.5], [2, -2], 1.55, 1.1).cam;
  await talk(g, [
    [JOSHI, 'You passed. Good. Morton is done, the file is closed, and then you call me about a tree.', joshi],
    [K, 'The box is at the morgue. I want to be there when they open it.', p],
    [JOSHI, 'It is bones, K. Bones in a box on a farm. The world is made of that.', joshi],
    [K, 'Then it will take ten minutes.', p],
    [JOSHI, 'Ten minutes. Then back on the street. There are eleven more like Morton on my board and one of you.', joshi],
  ]);
  dismiss(g, joshi);
  g.cam.fixed = null; p.locked = false;
  await walkOut(g, OFFICE, 'Back <b>out</b> to the street.');
  await reach(g, hospital.kerb, '<b>Drive</b> to the morgue.', { how: 'car', r: 8 });
  p.locked = true; land(g, hospital.kerb); p.locked = false;
  await reach(g, g.places.doors.find(d => d.name === 'the morgue').outside, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, MORGUE);
  const coco = actor(g, 'coco', roomSpot(MORGUE, -4, -3), EAST);
  const table = spot(roomSpot(MORGUE, -2.2, -3), 0, 0);
  p.locked = true;
  p.pos.set(MORGUE.X - 1.4, 0, MORGUE.Z - 1.2); p.heading = toward(p.pos, coco.group.position);
  g.cam.fixed = inRoom(MORGUE, [1.5, 1], [-3, -3], 1.6, 1.0).cam;
  await talk(g, [
    [COCO, 'Female. Thirty years in the ground, give or take. A fracture at the hip that healed badly.', coco],
    [K, 'Cause of death.', p],
    [COCO, 'This one. See the pelvis? That is not a wound. That is a birth, and it is what killed her.', coco],
    [K, '...Run the serial. The one cut under the collar bone.', p],
    [COCO, 'There is one? There is. Hold on. ...K. That is a Nexus serial. She was one of them.', coco],
  ]);
  await say(g, '', 'A replicant who had carried a child. That was not supposed to be a thing that could happen, and the room went very quiet about it.', 4.8);
  await say(g, K, 'Nobody writes this up. Nobody. I will tell the lieutenant myself.', 3.4);
  dismiss(g, coco);
  await fade(g, 1, 1);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Constant');
}

// ---------- 3. Joi ----------
// Home. The one person who is glad to see him is made of light; the lieutenant has an order; and a thing is wrong with a memory.
async function joi(g) {
  const { home } = g.places, p = g.player, FLAT = g.places.rooms.KFLAT;
  await reach(g, home.door, 'Go <b>home</b>. Block 9, the lobby door.', { r: 1.8, how: 'foot' });
  await enter(g, FLAT);
  const her = hologram(g, 'joi', { x: FLAT.joi.x, y: FLAT.Y, z: FLAT.joi.z }, toward(FLAT.joi, FLAT.inside));
  p.locked = true;
  p.pos.set(FLAT.inside.x, 0, FLAT.inside.z - 1.2); p.heading = toward(p.pos, her.group.position);
  g.cam.fixed = inRoom(FLAT, [3, 2.5], [-1, -0.5], 1.5, 1.1).cam;
  await talk(g, [
    [JOI, 'You are late, and you are wet, and I have made you something you cannot eat. Sit down.', her],
    [K, 'It was a long one. A farm.', p],
    [JOI, 'I know what a farm is. You have the look you get when something followed you home.', her],
    [K, 'Nothing followed me. ...Joi. If you were told something impossible about one of us, what would you want done with it?', p],
    [JOI, 'I would want to know whether it was good news. Was it?', her],
    [K, 'I do not know yet.', p],
  ]);
  await say(g, '', 'She walked through the chair to reach him, which she did when she forgot herself, and he did not mind.', 3.8);
  // The lieutenant, by the wall screen.
  await phone(g, JOSHI, 'The morgue sent me your bones. Find the child. Find it and retire it, and burn everything that says it was ever born. That is the job now, K. The only job.');
  await talk(g, [[K, 'Understood.', p], [JOI, 'You said that the way you say it when you do not.', her]]);
  await say(g, K, 'A number was cut into the tree. A date. ...I have seen it before. On a wooden horse, when I was a boy. Which I never was.', 4.8);
  await talk(g, [[JOI, 'Then somebody put it there. Or it is a real memory, and you are not what they told you.', her], [K, 'Go to sleep, Joi.', p], [JOI, 'I do not sleep. But I will be quiet.', her]]);
  dismiss(g, her);
  g.cam.fixed = null; p.locked = false;
  await walkOut(g, FLAT, 'Go back <b>out</b>. The records are at Wallace, and the records are where it starts.');
  await passed(g, 'Something impossible');
}

// ---------- 4. The Archive ----------
// Wallace keeps what the city lost in the blackout. His lieutenant shows K the file, and then shows him out.
async function theArchive(g) {
  const { wallace } = g.places, p = g.player, HALL = g.places.rooms.ARCHIVE;
  await reach(g, wallace.kerb, '<b>Drive</b> to the Wallace building. The old records are in its basement.', { how: 'car', r: 9 });
  p.locked = true; land(g, wallace.kerb); p.locked = false;
  await reach(g, wallace.door, 'Cross the <b>causeway</b> to the door.', { r: 1.8, how: 'foot' });
  await enter(g, HALL);
  const luv = actor(g, 'luv', HALL.luv, HALL.luv.h);
  p.locked = true;
  p.pos.set(HALL.inside.x, 0, HALL.inside.z - 2); p.heading = toward(p.pos, luv.group.position);
  g.cam.fixed = inRoom(HALL, [6, 3], [0, -2.5], 2.2, 1.2).cam;
  await say(g, '', 'Light the colour of honey moved on the water that lay over the floor. A woman in white waited at a table that was lit from inside, and had been waiting a while.', 4.8);
  await talk(g, [
    [LUV, 'The police do not usually come down here. Nothing down here is theirs any more.', luv],
    [K, 'A serial. Female, Nexus series, retired or lost about thirty years ago. I want her file.', p],
    [LUV, 'Thirty years ago the lights went out and the files went with them. We keep what was on paper, and what was on paper is not much.', luv],
    [K, 'Then show me what is not much.', p],
  ]);
  g.cam.fixed = null; p.locked = false;
  await reach(g, HALL.table, 'Go to the <b>table</b>.', { r: 1.4, how: 'foot' });
  p.locked = true;
  p.pos.set(HALL.table.x - 1, 0, HALL.table.z + 0.4); p.heading = NORTH; luv.group.rotation.y = toward(luv.group.position, p.pos);
  g.cam.fixed = { pos: new THREE.Vector3(HALL.table.x + 2.6, HALL.Y + 2.4, HALL.table.z + 3), look: new THREE.Vector3(HALL.table.x, HALL.Y + 1.2, HALL.table.z - 0.5) };
  await say(g, '', 'A drawer, a sleeve of film, a voice from before the blackout answering questions in a calm that was not calm. The serial matched.', 4.6);
  await talk(g, [
    [LUV, 'There. She existed, and then she did not. What do the police want with somebody that old?', luv],
    [K, 'Somebody buried her properly. That is unusual enough.', p],
    [LUV, 'Mr. Wallace will want to know that the police found a grave worth digging. He is interested in graves.', luv],
    [K, 'Tell him what you like. Thank you for the file.', p],
    [LUV, 'You are welcome, officer. Mind the water on your way up. It has been known to rise.', luv],
  ]);
  dismiss(g, luv);
  await fade(g, 1, 1);
  await say(g, '', 'On the stairs K understood that she had not been helping him. She had been finding out what he knew, and now she knew it too.', 4.4);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'A name');
}

// ---------- 5. Orphanage ----------
// The child was taken to a place children go when nobody wants them: a yard in Sector 6 where they strip scrap for a man with a ledger.
async function orphanage(g) {
  const { orphanage: yard } = g.places, p = g.player, SHED = g.places.rooms.ORPHANAGE;
  await say(g, '', 'The file gave a date and a district. Children without papers in that district went to one place, and it was not a school.', 4.4);
  await reach(g, yard.gate, '<b>Fly</b> out to the salvage yard in Sector 6.', { how: 'car', r: 9 });
  p.locked = true; land(g, yard.gate);
  await say(g, '', 'Scrap in hills, fires in barrels, and a long shed with every window lit the colour of a furnace.', 3.8);
  p.locked = false;
  await reach(g, yard.door, 'Go <b>in</b> to the shed.', { r: 1.8, how: 'foot' });
  await enter(g, SHED);
  const cotton = actor(g, 'cotton', { x: SHED.desk.x, y: SHED.Y, z: SHED.desk.z }, SHED.desk.h, 'sit');
  p.locked = true;
  p.pos.set(SHED.floorMid.x, 0, SHED.floorMid.z); p.heading = toward(p.pos, cotton.group.position);
  g.cam.fixed = inRoom(SHED, [-6, 4.5], [3, 0], 1.7, 1.1).cam;
  await say(g, '', 'Rows of children at tables, taking old boards apart with their hands, and not one of them looked up when the door opened. They had learned not to.', 4.6);
  g.cam.fixed = null; p.locked = false;
  await reach(g, spot(SHED.desk, -1.8, 0), 'The man with the <b>ledger</b>, at the far end.', { r: 1.4, how: 'foot' });
  p.locked = true;
  p.pos.set(SHED.desk.x - 1.6, 0, SHED.desk.z); p.heading = toward(p.pos, cotton.group.position);
  g.cam.fixed = inRoom(SHED, [5, 1], [8.5, 3.4], 1.5, 1.0).cam;
  await talk(g, [
    [COTTON, 'Police. We are licensed, officer. Every child here is a ward of the city and fed twice a day.', cotton],
    [K, 'A child came to you about thirty years ago. No papers. I want the ledger for that year.', p],
    [COTTON, 'Thirty years! I was a boy myself. The books from then are in the furnace room and the furnace room is where things go to be forgotten.', cotton],
    [K, 'Then we will go and remember them together.', p],
    [COTTON, '...The pages for that year are torn out. I did not tear them. I was paid to look away while it was done, and that is all I know.', cotton],
  ]);
  dismiss(g, cotton);
  g.cam.fixed = null; p.locked = false;
  await reach(g, SHED.furnace, 'The <b>furnace</b>. Something about this room is wrong, and it is not the heat.', { r: 1.6, how: 'foot' });
  p.locked = true;
  p.pos.set(SHED.furnace.x - 0.4, 0, SHED.furnace.z); p.heading = EAST;
  g.cam.fixed = { pos: new THREE.Vector3(SHED.furnace.x - 2.6, SHED.Y + 1.4, SHED.furnace.z + 2.2), look: new THREE.Vector3(SHED.furnace.x + 1, SHED.Y + 0.9, SHED.furnace.z) };
  p.human.play('kneel', 'idle');
  await say(g, '', 'A loose panel at the base of it. He had known where to put his hand before he looked, which was the part that frightened him.', 4.2);
  await g.wait(1.2);
  await say(g, '', 'Behind it, in ash thirty years cold, a small wooden horse, and under its belly the date from the tree.', 4.2);
  await say(g, K, "It is real. The memory is real. ...Then what am I?", 3.6);
  await fade(g, 1, 1.2);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'The horse');
}

// ---------- 6. Memory ----------
// Only one person can say whether a memory was made or lived: the woman who makes them, behind glass, in a white room with a forest in it.
async function memory(g) {
  const { stelline } = g.places, p = g.player, LAB = g.places.rooms.STELLINE;
  await reach(g, stelline.kerb, '<b>Drive</b> to Stelline Laboratories. Ask her whether it was yours.', { how: 'car', r: 9 });
  p.locked = true; land(g, stelline.kerb); p.locked = false;
  await reach(g, stelline.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, LAB);
  const her = actor(g, 'stelline', LAB.her, LAB.her.h, 'sit');
  p.locked = true;
  p.pos.set(LAB.glass.x, 0, LAB.glass.z + 1.2); p.heading = NORTH;
  g.cam.fixed = inRoom(LAB, [-4, 3.5], [0, -1.5], 1.6, 1.2).cam;
  await say(g, '', 'A white room, and a wall of glass, and on the far side of the glass a woman at a table with snow falling on her that was not falling anywhere else.', 4.8);
  await talk(g, [
    [STELLINE, 'The door was unlocked, so you must be the police. Nobody else comes. I am not allowed out, and they are not allowed in.', her],
    [K, 'You make memories. For the new ones.', p],
    [STELLINE, 'I make the parts that feel like a life. A birthday. A dog that died. Nobody wants a whole one; a whole one is too heavy.', her],
    [K, 'I have one I need you to look at. I need to know whether you made it, or whether it happened.', p],
    [STELLINE, 'Sit down, then. Put your hand on the glass and think about it, and do not try to make it better than it was.', her],
  ]);
  await cut(g, () => { g.cam.fixed = { pos: new THREE.Vector3(LAB.glass.x + 2.4, LAB.Y + 1.5, LAB.glass.z + 1.5), look: new THREE.Vector3(LAB.her.x, LAB.Y + 1.1, LAB.her.z) }; }, 0.5);
  await say(g, '', 'A furnace. A horse. Boys who wanted it, and a place to hide it where it would be safe. She watched it with her eyes shut, and when it was over she did not open them for a while.', 5.2);
  await talk(g, [
    [STELLINE, 'Somebody lived this. It was not made. I am sorry; I can tell when they are mine, and this is not.', her],
    [K, '...Then it was me.', p],
    [STELLINE, 'I did not say that. I said it was lived. Go carefully, officer. People who find out what they are do not always like it.', her],
  ]);
  dismiss(g, her);
  await fade(g, 1, 1.4);
  await say(g, '', 'He drove back through the rain with the horse in his pocket and the whole city lit up around him, and for the first time none of it was his.', 4.6);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Lived');
}

export const NEXUS_STORY = [
  { name: 'Chapter One', title: 'Blade Runner', missions: [proteinFarm, baseline, joi, theArchive, orphanage, memory],
    titles: ['Protein Farm', 'Baseline', 'Joi', 'The Archive', 'Orphanage', 'Memory'] },
];
