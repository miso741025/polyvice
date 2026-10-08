import * as THREE from 'three';
import { near, groundAt } from './grid.js';
import { makeLook, makeHuman } from './entities.js';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, place, frame, reach, follower,
  punch, fistsOnly, quarry, inRoom, roomSpot, lying, playing, enter, leave, walkOut, wantCar, outdoors, walkTo, NORTH, SOUTH, EAST, WEST,
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
  await wantCar(g, g.tonyCar, 'Take the <b>spinner</b>. Hold Shift to lift off and climb; Ctrl brings it down.');
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
  const sap = actor(g, 'sapper', { x: HOUSE.stove.x - 0.6, y: HOUSE.Y, z: HOUSE.stove.z + 0.6 }, toward(HOUSE.stove, HOUSE.inside)); // at his stove, with his back half turned
  p.locked = true;
  p.pos.set(HOUSE.X + 0.2, 0, HOUSE.Z + 1.2); p.heading = toward(p.pos, sap.group.position);
  g.cam.fixed = inRoom(HOUSE, [-3.2, 2.6], [2.2, -1.6], 1.5, 1.05).cam;
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
  await cut(g, () => { g.cam.fixed = inRoom(HOUSE, [-3.6, 1.2], [1.5, -1.5], 1.4, 0.5).cam; p.heading = toward(p.pos, sap.group.position); }, 0.4);
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
  g.cam.fixed = { pos: new THREE.Vector3(TEST.lens.x + 0.12, TEST.Y + 1.4, TEST.lens.z + 0.3), look: new THREE.Vector3(TEST.chair.x, TEST.Y + 1.1, TEST.chair.z) }; // from the lens: his face, and nothing else in the room
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

// ========== Chapter Two: the wasteland, and the wall ==========
const MARIETTE = 'Mariette', DECKARD = 'Deckard', FREYSA = 'Freysa';
// The city dressed as the wasteland: orange dust, nothing to see past a hundred metres. setNight(1) puts the rain back.
const dust = g => { g.scene.fog.color.set(0xc87a30); g.scene.fog.near = 18; g.scene.fog.far = 170; };

// ---------- 7. Off Baseline ----------
// The test, failed. Forty-eight hours to be what he was. Joi buys him a woman to borrow a body from.
async function offBaseline(g) {
  const { precinct, home } = g.places, p = g.player, OFFICE = g.places.rooms.OFFICE, TEST = g.places.rooms.BASELINE, FLAT = g.places.rooms.KFLAT;
  await reach(g, precinct.kerb, '<b>Drive</b> to headquarters. There is a test waiting, and you know how it will go.', { how: 'car', r: 8 });
  p.locked = true; land(g, precinct.kerb); p.locked = false;
  await reach(g, precinct.door, 'Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, TEST);
  p.locked = true;
  p.pos.set(TEST.chair.x, 0, TEST.chair.z); p.heading = TEST.chair.h; p.pose = 'sit';
  g.cam.fixed = { pos: new THREE.Vector3(TEST.lens.x + 0.12, TEST.Y + 1.4, TEST.lens.z + 0.3), look: new THREE.Vector3(TEST.chair.x, TEST.Y + 1.1, TEST.chair.z) };
  for (const w of ['Within the cells.', 'Interlocked.', 'A tall white fountain.', 'Interlocked.']) { g.hud.subtitle('Baseline', w); await g.wait(1.3); g.hud.subtitle(); await g.wait(0.4); }
  await say(g, 'Baseline', "You are not at your baseline. You are nowhere near it. Remain in the chair.", 3.6);
  p.pose = null;
  await cut(g, () => { p.pos.set(OFFICE.X + 2, 0, OFFICE.Z + 0.2); p.heading = NORTH; p.inside = g.places.doors.find(d => d.inside === OFFICE.inside) || p.inside; g.cam.fixed = inRoom(OFFICE, [-2.5, 1.5], [2, -2], 1.55, 1.1).cam; }, 0.6);
  const joshi = actor(g, 'joshi', roomSpot(OFFICE, 2, -2.4), SOUTH, 'sit');
  await talk(g, [
    [JOSHI, 'Off baseline. That is a word for it. The other word is retired, and they would not let you walk out of the building.', joshi],
    [K, 'I found the child. It is done. There is nothing left to find.', p],
    [JOSHI, "You are lying to me, and you have never done that. ...Forty-eight hours. I will say you were fit to work. Then you come back here and you are at your baseline, or you are nothing.", joshi],
    [K, 'Forty-eight hours.', p],
  ]);
  dismiss(g, joshi);
  await fade(g, 1, 1);
  await say(g, '', "He went home because there was nowhere else, and on the stairs there was a woman with pink hair waiting who said Joi had sent for her.", 4.4);
  p.inside = g.places.doors.find(d => d.inside === FLAT.inside) || null; outdoors(g); p.inside = g.places.doors.find(d => d.inside === FLAT.inside) || null;
  const her = hologram(g, 'joi', { x: FLAT.joi.x, y: FLAT.Y, z: FLAT.joi.z }, SOUTH), mar = actor(g, 'mariette', { x: FLAT.joi.x + 1.6, y: FLAT.Y, z: FLAT.joi.z + 0.4 }, SOUTH);
  p.pos.set(FLAT.inside.x, 0, FLAT.inside.z - 1.2); p.heading = toward(p.pos, her.group.position);
  g.cam.fixed = inRoom(FLAT, [3, 2.5], [-1, -0.5], 1.5, 1.1).cam;
  await fade(g, 0, 1);
  await talk(g, [
    [JOI, 'I wanted to be real for you, once. She said yes. Let me borrow her, just tonight.', her],
    [MARIETTE, "I don't mind. She talks a lot, your girl. Most of them don't talk.", mar],
    [K, '...Joi.', p],
    [JOI, 'Quiet. Let me do this.', her],
  ]);
  await say(g, '', 'She stepped into the other woman, and for a while the two of them were one woman who kept slipping out of alignment with herself, and he let it be enough. He had forty-eight hours.', 5);
  dismiss(g, her, mar);
  await fade(g, 1, 1);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Forty-eight hours');
}

// ---------- 8. The Wasteland ----------
// Out past the edge of the city, where the dust is, a man who was a blade runner lives alone in an empty hotel with a dog.
async function theWasteland(g) {
  const { airport, home } = g.places, p = g.player, HOTEL = g.places.rooms.HOTEL;
  await say(g, '', 'The wooden horse was carved from a wood that had not grown anywhere for thirty years, except one place: the dead ground past the spaceport, where a city had been and was not any more.', 5);
  await reach(g, airport.kerb, '<b>Fly</b> out past the spaceport, south, into the dust.', { how: 'car', r: 10 });
  p.locked = true; land(g, airport.kerb); dust(g);
  await say(g, '', 'The rain stopped where the city stopped. After that it was orange: the air, the ground, the light. Statues the size of buildings, of nobody anyone remembered.', 4.6);
  const hotel = g.places.doors.find(d => d.name === 'the hotel');
  p.locked = false;
  await reach(g, hotel.outside, 'There is one building with a light in it. Go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, HOTEL);
  for (const a of HOTEL.ambient) a.group.visible = false;
  const deck = actor(g, 'deckard', roomSpot(HOTEL, 4, -3), WEST); deck.arm(true); deck.set('aim');
  p.locked = true;
  p.pos.set(HOTEL.inside.x, 0, HOTEL.inside.z - 1.5); p.heading = toward(p.pos, deck.group.position);
  g.cam.fixed = inRoom(HOTEL, [-5, 3], [2, -2.5], 1.6, 1.1).cam;
  await say(g, '', 'A bar nobody drank at, a piano, a dog. And an old man with a gun, who had known somebody was coming before K knew he was going.', 4.2);
  await talk(g, [
    [DECKARD, 'You are a long way from anywhere, son. Turn round and go back to it.', deck],
    [K, 'You knew her. Thirty years ago. There was a child.', p],
    [DECKARD, 'I knew a woman. I do not talk about her to people with the police on their coat.', deck],
    [K, 'I need to know where the child went.', p],
    [DECKARD, 'So does everybody who has ever come through that door. Nobody leaves knowing.', deck],
  ]);
  deck.arm(false); deck.set('idle');
  g.cam.fixed = null;
  const foe = g.makeEnemy(deck, { health: 150, stays: true, cash: 0 });
  fistsOnly(g);
  p.locked = false;
  g.hud.objective('He will not talk until he has tried you. <b>Put him down.</b> Do not kill him.');
  await g.until(() => foe.dead || deck.state === 'down' || foe.health < 40);
  g.hud.objective(); fistsOnly(g, false);
  p.locked = true;
  foe.ai = null; foe.stays = true; deck.after = null; deck.set('idle');
  await cut(g, () => { g.cam.fixed = inRoom(HOTEL, [3, 2.5], [0, -2], 1.5, 1.0).cam; p.heading = toward(p.pos, deck.group.position); deck.group.rotation.y = toward(deck.group.position, p.pos); }, 0.5);
  await talk(g, [
    [DECKARD, '...Whisky. The good one is behind the bar, on the left. Pour two.', deck],
    [DECKARD, 'I left so that nobody could follow me to her, or to it. I never knew which it was, a boy or a girl. That was the point. You cannot give up what you do not know.', deck],
    [K, 'I think it was me.', p],
    [DECKARD, 'Then you would be the first one who came here hoping to be.', deck],
  ]);
  await say(g, '', 'They did not get as far as the second whisky. The roof came down in a noise of engines, and the woman in white walked in through the dust with people behind her.', 4.6);
  const luv = actor(g, 'luv', roomSpot(HOTEL, -6, -1), EAST); luv.arm(true); luv.set('aim');
  await cut(g, () => { g.cam.fixed = inRoom(HOTEL, [4, 3.5], [-3, -1], 1.6, 1.1).cam; }, 0.4);
  await talk(g, [
    [LUV, "Mr. Wallace is grateful, officer. You found what thirty years of looking could not. He would like the old man, and he would like you to stay here.", luv],
    [K, 'Leave him.', p],
    [LUV, 'You were made to obey. It is strange how little of it is left in you.', luv],
  ]);
  await say(g, '', "She broke him against the bar, and when the thing in his pocket that was Joi tried to stop her, she crushed it under her heel and watched his face while she did it. Then they took Deckard, and left K in the dust to die, which he did not.", 5.6);
  dismiss(g, luv, deck);
  await fade(g, 1, 1.2);
  g.setNight(1);
  asK(g);
  await say(g, '', 'Somebody found him. Somebody with pink hair, who had followed him out of the city for reasons of her own.', 3.8);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Everything you want to hear');
}

// ---------- 9. Freysa ----------
// Under the scrap, the ones who have stopped obeying. They tell him what the child was, and it is not what he hoped.
async function freysa(g) {
  const { orphanage: yard } = g.places, p = g.player, DEN = g.places.rooms.WAREHOUSE || g.places.rooms.ORPHANAGE;
  await reach(g, yard.gate, 'Mariette said to come to Sector 6, and to come alone. <b>Fly</b> there.', { how: 'car', r: 9 });
  p.locked = true; land(g, yard.gate);
  const mar = actor(g, 'mariette', spot(yard.yard, 2, 2), toward(spot(yard.yard, 2, 2), yard.gate));
  p.locked = false;
  await reach(g, spot(yard.yard, 0, 4), 'Find <b>Mariette</b> in the yard.', { r: 2, how: 'foot' });
  p.locked = true;
  frame(g, p.pos, mar.group.position, { dist: 4.2 });
  await talk(g, [[MARIETTE, 'There are people who want to meet you. Under here. They have wanted to for a long time.', mar], [K, 'What people.', p], [MARIETTE, 'Ours.', mar]]);
  dismiss(g, mar); g.cam.fixed = null;
  await cut(g, () => { p.inside = { name: 'under the yard', inside: DEN.inside, outside: yard.door }; p.pos.set(DEN.inside.x, 0, DEN.inside.z); p.heading = NORTH; }, 0.6);
  const fr = actor(g, 'freysa', roomSpot(DEN, 0, -4), SOUTH), crowd = [[-4, -2], [4, -3], [-3, 2], [5, 1], [0, -6]].map(([x, z], k) => actor(g, k % 2 ? 'replicant' : 'mariette', roomSpot(DEN, x, z), toward(roomSpot(DEN, x, z), roomSpot(DEN, 0, -4))));
  p.locked = true;
  g.cam.fixed = inRoom(DEN, [6, 4], [0, -3], 1.8, 1.1).cam;
  await say(g, '', 'A room with no windows under the scrap, and in it more of his own kind than he had ever seen in one place, and none of them afraid of him.', 4.4);
  await talk(g, [
    [FREYSA, 'I was there, officer. I held the child. I cut its serial out of it myself so that nobody could do what you have been doing.', fr],
    [K, 'Then you know who it is.', p],
    [FREYSA, "I know what it is. It is a girl. She was hidden, and the memory of her hiding was given to somebody else, so that whoever came looking would look at the wrong one.", fr],
    [K, '...A girl.', p],
    [FREYSA, 'You hoped it was you. All of us hope that, once. Being the one would have meant something. Dying for her means more.', fr],
    [FREYSA, 'Wallace has Deckard. Deckard has seen the woman who made the memories. They will take him to Wallace, and then nothing will stop them finding her. Kill him before he gets there.', fr],
  ]);
  await say(g, '', 'He had been nobody, and then for a week he had been somebody, and now he was nobody again, with a job to do that nobody had given him.', 4.4);
  dismiss(g, fr, ...crowd);
  await fade(g, 1, 1);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'A girl');
}

// ---------- 10. The Wall ----------
// Luv's spinner, with Deckard in it, runs for the sea wall and the ship beyond it. K brings it down in the spray.
async function theWall(g) {
  const { wall, home } = g.places, p = g.player;
  await say(g, '', 'The transport would cross the wall at the north end, low, with an escort. He had one spinner and no more time.', 3.8);
  const chase = g.spawnCar(home.car.x + 30, home.car.z - 60, NORTH, 0xf4f4f6, 'spinner'); chase.driverless = true; chase.mission = true; chase.alt = 30;
  const aim = { x: wall.foot.x - 24, z: wall.top.z - 160 };
  g.updaters.push(() => { if (chase.wreck) return false; const dx = aim.x - chase.pos.x, dz = aim.z - chase.pos.z, d = Math.hypot(dx, dz); if (d > 2) { chase.pos.x += dx / d * 0.9; chase.pos.z += dz / d * 0.9; chase.heading = Math.atan2(dx, dz); chase.alt = Math.max(0.5, Math.min(30, d * 0.3)); } else chase.alt = 0; chase.sync(); return !chase.wreck && d > 2; });
  const track = quarry(g, { pos: chase.pos, human: { group: chase.mesh } });
  p.locked = false;
  await wantCar(g, g.tonyCar, 'Get in the <b>spinner</b>: the white one is already in the air.');
  await reach(g, aim, '<b>Fly</b> after it. It is making for the sea wall, north.', { how: 'car', r: 14 });
  track.stop?.();
  p.locked = true; land(g, { x: aim.x + 8, z: aim.z + 6, h: WEST });
  await say(g, '', 'He put his own spinner into hers at the foot of the wall, and the two of them came down together in the surf that came over the top of it.', 4.4);
  const luv = actor(g, 'luv', { x: aim.x - 4, z: aim.z - 2 }, toward({ x: aim.x - 4, z: aim.z - 2 }, p.pos)), deck = actor(g, 'deckard', { x: aim.x - 1, z: aim.z + 4 }, EAST, 'kneel');
  await cut(g, () => { p.pos.set(aim.x + 2, 0, aim.z + 1); p.heading = toward(p.pos, luv.group.position); frame(g, p.pos, luv.group.position, { dist: 5 }); }, 0.5);
  await talk(g, [[LUV, 'You should have stayed in the dust. I would have told him you died well.', luv], [K, 'Get away from him.', p], [LUV, 'I am the best one he ever made. You are the one that stopped working.', luv]]);
  g.cam.fixed = null;
  const foe = g.makeEnemy(luv, { health: 260, stays: true, cash: 0 });
  fistsOnly(g);
  p.locked = false;
  g.hud.objective('<b>Deal with her.</b> The sea is coming over the wall; keep your feet.');
  await g.until(() => foe.dead);
  g.hud.objective(); fistsOnly(g, false);
  p.locked = true;
  await cut(g, () => { frame(g, p.pos, deck.group.position, { dist: 4.4 }); deck.set('idle'); }, 0.5);
  await say(g, '', 'He held her under until the water did it for him, and he did not feel like the best of anything. Then he pulled the old man out of the wreck and up onto the stones.', 4.6);
  await talk(g, [[DECKARD, 'You should have let them take me. Then she stays hidden.', deck], [K, 'They think you drowned. So does everybody. ...There is somebody you should meet.', p]]);
  dismiss(g, luv, deck);
  await fade(g, 1, 1);
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'The best one he ever made');
}

// ---------- 11. Snow ----------
// A father brought to a daughter he cannot touch, and a blade runner on the steps outside, where the snow is real.
async function snow(g) {
  const { stelline } = g.places, p = g.player, LAB = g.places.rooms.STELLINE;
  const deck = actor(g, 'deckard', spot(g.places.home.spawn, 2, 2), SOUTH);
  const tail = follower(g, deck, { gap: 2, runs: false, pace: 2.6 });
  await reach(g, stelline.kerb, '<b>Drive</b> Deckard to Stelline Laboratories.', { how: 'car', r: 9 });
  p.locked = true; land(g, stelline.kerb); p.locked = false;
  await reach(g, stelline.door, 'Walk him to the <b>door</b>.', { r: 1.8, how: 'foot' });
  tail.on = false;
  p.locked = true;
  await cut(g, () => { deck.group.position.set(stelline.door.x - 1.2, 0, stelline.door.z + 1); deck.group.rotation.y = toward(deck.group.position, p.pos); p.pos.set(stelline.door.x + 1, 0, stelline.door.z + 1.4); p.heading = toward(p.pos, deck.group.position); frame(g, p.pos, deck.group.position, { dist: 4 }); }, 0.5);
  await talk(g, [
    [DECKARD, 'Why. You do not owe me this. You do not owe her anything.', deck],
    [K, 'Somebody gave me her memory. It was the best thing I had. I would like her to have it back.', p],
    [DECKARD, '...What do I say to her.', deck],
    [K, 'Nothing, to begin with. She will know you.', p],
  ]);
  await say(g, '', 'He watched the old man go in through the white door, and through the glass he watched him put his hand up to the glass, and the woman on the other side put up hers.', 4.8);
  await cut(g, () => { dismiss(g, deck); p.pos.set(stelline.door.x + 3, 0, stelline.door.z + 3); p.heading = NORTH; p.pose = 'sit'; g.cam.fixed = { pos: new THREE.Vector3(stelline.door.x + 8, 2.6, stelline.door.z + 9), look: new THREE.Vector3(stelline.door.x + 3, 0.8, stelline.door.z + 3) }; }, 0.8);
  { const snowflakes = Array.from({ length: 120 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(stelline.door.x + (Math.random() - 0.5) * 24, 1 + Math.random() * 10, stelline.door.z + (Math.random() - 0.5) * 24); g.track(m); return m; });
    g.updaters.push(dt => { for (const m of snowflakes) { m.position.y -= dt * 0.9; m.position.x += Math.sin(g.time + m.position.z) * dt * 0.3; if (m.position.y < 0.05) m.position.y = 11; } return p.pose === 'sit'; }); }
  await say(g, '', 'He sat down on the steps. The rain had turned, for once, into something that stayed on his hand for a moment before it went. He looked at it for as long as he could.', 5.2);
  await g.wait(2.5);
  await fade(g, 1, 2.4);
  p.pose = null;
  asK(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Blade Runner 2049', 5000);
}

export const NEXUS_STORY = [
  { name: 'Chapter One', title: 'Blade Runner', missions: [proteinFarm, baseline, joi, theArchive, orphanage, memory],
    titles: ['Protein Farm', 'Baseline', 'Joi', 'The Archive', 'Orphanage', 'Memory'] },
  { name: 'Chapter Two', title: 'Off Baseline', missions: [offBaseline, theWasteland, freysa, theWall, snow],
    titles: ['Off Baseline', 'The Wasteland', 'Freysa', 'The Wall', 'Snow'] },
];
