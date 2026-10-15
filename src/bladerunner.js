import * as THREE from 'three';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, frame, reach, follower, fistsOnly, quarry,
  inRoom, roomSpot, enter, walkOut, wantCar, outdoors, NORTH, SOUTH, EAST, WEST,
} from './missions.js';

// Los Angeles, November 2019: the story of the first "Blade Runner", start to end, in the film's order. It is its own game:
// nobody, nowhere and nothing from the later story is in it (owner, 2026-10-15). Plot beats and names follow the film;
// every line of dialogue is written for the game. The player is Deckard.

const DECKARD = 'Deckard', GAFF = 'Gaff', BRYANT = 'Bryant', RACHAEL = 'Rachael', TYRELL = 'Tyrell', LEON = 'Leon', SEBASTIAN = 'Sebastian', ROY = 'Roy Batty', HOLDEN = 'Holden', PRIS = 'Pris', CHEW = 'Chew', ZHORA = 'Zhora';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const land = (g, at) => { const c = g.tonyCar; if (g.player.car === c) g.leaveCar(); c.pos.set(at.x, 0, at.z); c.heading = at.h ?? 0; c.speed = 0; c.alt = 0; c.sync?.(); return c; };
function asDeckard(g) {
  const { home } = g.places, p = g.player;
  if (p.car) g.leaveCar();
  outdoors(g);
  Object.assign(p, { hidden: false, pose: null });
  p.pos.set(home.wake.x, 0, home.wake.z); p.heading = g.cam.yaw = NORTH;
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0; g.tonyCar.alt = 0;
  g.cam.fixed = null;
}
// A scene the player only watches (Deckard is not in it): he is hidden, and "where he is" is that room, so its lights come on.
function elsewhere(g, q) {
  const p = g.player;
  if (p.car) g.leaveCar();
  p.locked = true; p.hidden = true;
  p.inside = { name: 'elsewhere', inside: q.inside, outside: g.places.home.door };
  p.pos.set(q.inside.x, 0, q.inside.z);
}
const fixed = (g, from, to) => { g.cam.fixed = { pos: V3(...from), look: V3(...to) }; };

// ---------- 1. Noodles ----------
// Before anything: a man being asked questions at the Tyrell Corporation, and the answer he gives. Then Deckard at a counter in the rain.
async function noodles(g) {
  const { home, market, precinct } = g.places, p = g.player, OFFICE = g.places.rooms.OFFICE, IV = g.places.rooms.INTERVIEW;
  elsewhere(g, IV);
  const hol = actor(g, 'holden', { x: IV.asker.x, y: IV.Y, z: IV.asker.z }, IV.asker.h, 'sit'), le = actor(g, 'leon', { x: IV.subject.x, y: IV.Y, z: IV.subject.z }, IV.subject.h, 'sit');
  fixed(g, [IV.X + 2.6, IV.Y + 1.5, IV.Z + 1.6], [IV.X - 0.2, IV.Y + 1.1, IV.Z - 1]);
  g.hud.show(true);
  await fade(g, 0, 1.5);
  await titleCard(g, 'Blade Runner', 'Los Angeles, November 2019');
  await say(g, '', 'The Tyrell Corporation, an office on the hundred and something floor. A fan going round. A man from the police with a machine that watches your eyes.', 4.6);
  await talk(g, [
    [HOLDEN, 'Just a test. Some questions. Answer quick as you can. ...You are on a beach. There is a crab on its back in the sun, its legs going. You could turn it over. You do not.', hol],
    [LEON, 'A beach. What beach? Is it a real beach?', le],
    [HOLDEN, 'It is a question, Leon. Why do you not turn it over?', hol],
    [LEON, 'Maybe I am thinking of other things. Is this about my job?', le],
    [HOLDEN, 'Describe the things that come into your mind about your mother. Simple words. Only good things.', hol],
    [LEON, '...My mother.', le],
  ]);
  g.hud.flash('#ffffff', 0.25);
  await say(g, '', 'He shot Holden through the desk, and again through the wall behind him, and walked out of the building the way he had walked in, and nobody stopped him.', 4.8);
  dismiss(g, hol, le);
  await fade(g, 1, 1.2);
  // Deckard, retired, at the noodle bar.
  asDeckard(g);
  p.locked = true;
  p.pos.set(home.spawn.x, 0, home.spawn.z); p.heading = g.cam.yaw = SOUTH;
  await fade(g, 0, 1.2);
  await say(g, '', 'Deckard had been a blade runner, and then he had been a man who read the paper at counters and did not answer his door. The second one suited him.', 5);
  p.locked = false;
  await reach(g, spot(market.centre, 6, 10), 'Walk down to the <b>night market</b>. There is a counter that does noodles in the rain.', { r: 3, how: 'foot' });
  p.locked = true;
  const gaff = actor(g, 'gaff', spot(market.centre, 9, 13), toward(spot(market.centre, 9, 13), p.pos));
  await cut(g, () => { p.pos.set(market.centre.x + 6, 0, market.centre.z + 10); p.heading = toward(p.pos, gaff.group.position); frame(g, p.pos, gaff.group.position, { dist: 4.2 }); }, 0.5);
  await say(g, '', 'He was arguing with the cook about how many to a bowl when a man with a cane sat down beside him and spoke in the street language, the one that is every language at once.', 4.8);
  await talk(g, [
    [GAFF, 'You. Captain wants you. Now, and politely, he said. This is politely.', gaff],
    [DECKARD, 'Tell him I retired. Tell him I am eating.', p],
    [GAFF, 'He said you would say that. He said then I bring you anyway, under arrest. Is the same car either way.', gaff],
  ]);
  g.cam.fixed = null;
  const tail = follower(g, gaff, { gap: 2, runs: false, pace: 2.6 });
  p.locked = false;
  await wantCar(g, g.tonyCar, 'His <b>spinner</b> is at the kerb. Get in; he flies.');
  tail.on = false; dismiss(g, gaff);
  await reach(g, precinct.kerb, '<b>Fly</b> to police headquarters.', { how: 'car', r: 9 });
  p.locked = true; land(g, precinct.kerb); p.locked = false;
  await reach(g, precinct.door, 'Go <b>in</b>. Captain Bryant is upstairs.', { r: 1.8, how: 'foot' });
  await enter(g, OFFICE);
  const bryant = actor(g, 'bryant', roomSpot(OFFICE, 2, -2.4), SOUTH, 'sit');
  p.locked = true;
  p.pos.set(OFFICE.X + 2, 0, OFFICE.Z + 0.2); p.heading = NORTH;
  g.cam.fixed = inRoom(OFFICE, [-2.5, 1.5], [2, -2], 1.55, 1.1).cam;
  await talk(g, [
    [BRYANT, 'Deck. Sit down. Have a drink, you look like you need one more than I do.', bryant],
    [DECKARD, 'I quit, Bryant. I quit because of jobs like the one you are about to give me.', p],
    [BRYANT, 'Six of them came down from off-world. Skin jobs, the new ones, Nexus-6. They killed twenty-three people on a shuttle getting here. Two of them fried trying to get into the Tyrell building. Four are walking around my city.', bryant],
    [BRYANT, 'Holden tested one of them yesterday. He is breathing, if you call the machine breathing. ...I need you, Deck. Nobody else I have could find his own feet.', bryant],
    [DECKARD, 'And if I still say no?', p],
    [BRYANT, 'Then you are a civilian with a record, and I have all night to think of what to do with one. Do not make me.', bryant],
  ]);
  await say(g, '', 'Bryant ran the files on the wall: Leon, who shot Holden, a loader of nuclear fuel. Zhora, trained to kill for a political squad. Pris, a model made for pleasure. And Roy Batty, combat, the one who planned it. Four years each, built in, and running out.', 6);
  await talk(g, [[BRYANT, 'Go and see Tyrell. If that test of yours cannot tell one of his new ones from a man, I want to know before you shoot anybody.', bryant]]);
  dismiss(g, bryant);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Back on the job');
}

// ---------- 2. Tyrell ----------
// The maker's own office: columns, the sun going down, an owl that may not be an owl, and a woman who does not know what she is.
async function tyrell(g) {
  const { tyrell: pyr } = g.places, p = g.player, HALL = g.places.rooms.TYRELL;
  await reach(g, pyr.kerb, '<b>Fly</b> to the Tyrell pyramid.', { how: 'car', r: 9 });
  p.locked = true; land(g, pyr.kerb); p.locked = false;
  await reach(g, pyr.door, 'Cross the causeway and go <b>in</b>.', { r: 1.8, how: 'foot' });
  await enter(g, HALL);
  const ra = actor(g, 'rachael', { x: HALL.X - 2, y: HALL.Y, z: HALL.Z - 3 }, toward({ x: HALL.X - 2, z: HALL.Z - 3 }, HALL.inside));
  p.locked = true;
  p.pos.set(HALL.inside.x, 0, HALL.inside.z - 2); p.heading = toward(p.pos, ra.group.position);
  g.cam.fixed = inRoom(HALL, [8, 6], [-1, -4], 2.4, 1.4).cam;
  await say(g, '', 'The office was as big as a church and lit like one at evening, the sun coming in sideways through the smog. An owl turned its head on a perch. A woman was waiting.', 5);
  await talk(g, [
    [RACHAEL, 'Do you like our owl?', ra],
    [DECKARD, 'Is it real?', p],
    [RACHAEL, 'Of course not. Real ones cost more than this building. ...You are the man from the police. He will be down.', ra],
  ]);
  const ty = actor(g, 'tyrell', HALL.tyrell, HALL.tyrell.h);
  await cut(g, () => { ty.group.position.set(HALL.X + 1, HALL.Y, HALL.Z - 2); ty.group.rotation.y = toward(ty.group.position, p.pos); frame(g, p.pos, ty.group.position, { dist: 5 }); }, 0.5);
  await talk(g, [
    [TYRELL, "Mr. Deckard. The captain says your machine can tell my people from yours. I would like to see it fail. Run it on a person first, so we have something to compare. Run it on her.", ty],
    [DECKARD, 'On her.', p],
    [TYRELL, 'Rachael is my assistant. Humour an old man who pays for the building your captain works in.', ty],
  ]);
  g.cam.fixed = null; p.locked = false;
  await reach(g, HALL.chairs.him, 'Sit down across from <b>Rachael</b> at the table, and set up the machine.', { r: 1.3, how: 'foot' });
  p.locked = true;
  ra.group.position.set(HALL.chairs.her.x, HALL.Y, HALL.chairs.her.z); ra.group.rotation.y = HALL.chairs.her.h; ra.set('sit');
  p.pos.set(HALL.chairs.him.x, 0, HALL.chairs.him.z); p.heading = HALL.chairs.him.h; p.pose = 'sit';
  fixed(g, [HALL.table.x, HALL.Y + 1.5, HALL.table.z + 3], [HALL.table.x - 0.8, HALL.Y + 1.1, HALL.table.z]);
  // The questions. He watches the eye on the screen; what matters is how long the eye takes to answer.
  const Q = [
    ['A child gives you a jar with a moth in it. The lid has no holes.', 'I would make holes in it. ...I would let it go.'],
    ['You are driving at night and hit a deer. It is still alive, on the road, looking at you.', 'I would stay with it.'],
    ['Your neighbour leaves a cage of rabbits out in the rain all night.', 'I would call somebody. The police. You.'],
    ['A man at the next table is eating something that is still moving on his plate.', 'I would leave.'],
    ['You open a book you had as a girl, and there is a flower pressed in it that somebody else put there.', '...Who put it there? Why are you asking me that?'],
  ];
  g.hud.objective('<b>Watch her eye</b> on the screen. Press Enter after each answer to go on.');
  for (const [q, a] of Q) { await talk(g, [[DECKARD, q, p], [RACHAEL, a, ra]]); g.hud.flash('#8f7bff', 0.05); }
  g.hud.objective();
  await say(g, '', 'It went on past a hundred questions. With a person it takes twenty, thirty. When he stopped, Tyrell sent her out, and she went without looking back.', 4.6);
  dismiss(g, ra); p.pose = null;
  await cut(g, () => { p.pos.set(HALL.X - 1, 0, HALL.Z - 0.5); ty.group.position.set(HALL.X + 1, HALL.Y, HALL.Z - 2); ty.group.rotation.y = toward(ty.group.position, p.pos); p.heading = toward(p.pos, ty.group.position); frame(g, p.pos, ty.group.position, { dist: 4.6 }); }, 0.5);
  await talk(g, [
    [DECKARD, 'She is one of yours. And she does not know.', p],
    [TYRELL, "She is starting to wonder. I gave her a past: a mother, a childhood, other people's afternoons. Memories steady them. A creature with four years and no yesterday is a creature that panics.", ty],
    [DECKARD, 'How can it not know what it is?', p],
    [TYRELL, 'We make people, Mr. Deckard. We make them very well. That is the whole of the business.', ty],
  ]);
  dismiss(g, ty);
  await fade(g, 1, 1);
  await say(g, '', 'On the causeway it was raining again. He had come to find out if his test worked. It did. He liked that less than he had expected to.', 4.6);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'More than a hundred questions');
}

// ---------- 3. Leon's Room ----------
// The hotel Leon gave as his address: photographs of empty rooms, a bath nobody used, a scale in it. And across town, two of them ask an old man about eyes.
async function leonsRoom(g) {
  const p = g.player, hotel = g.places.doors.find(d => d.name === 'the hotel'), ROOM = g.places.rooms.SUITE || g.places.rooms.HOTEL, LAB = g.places.rooms.CHEW;
  await say(g, '', 'Leon had given a hotel as his address on the job form. They are new: they have not yet learned to lie about small things.', 4);
  await reach(g, spot(hotel.outside, 0, 8), '<b>Fly</b> to the hotel Leon gave as his address.', { how: 'car', r: 9 });
  p.locked = true; land(g, spot(hotel.outside, 0, 8)); p.locked = false;
  await reach(g, hotel.outside, 'Go <b>in</b>. Room fourteen, paid a month ahead.', { r: 1.8, how: 'foot' });
  await enter(g, ROOM);
  const bed = ROOM.bed || roomSpot(ROOM, -2.6, -2), tub = roomSpot(ROOM, 4, -2.5);
  p.locked = true;
  p.pos.set(ROOM.inside.x, 0, ROOM.inside.z - 1); p.heading = NORTH;
  g.cam.fixed = inRoom(ROOM, [3, 3.5], [-1, -1.5], 1.6, 1.0).cam;
  await say(g, '', 'Nobody had slept in the bed. Nobody had used the soap. A man who did not need a room had kept one, the way you keep a coat you are not wearing.', 4.6);
  g.cam.fixed = null; p.locked = false;
  await reach(g, spot(bed, 1.2, 1.2), 'Look for anything he left. Try the <b>drawer</b> by the bed.', { r: 1.2, how: 'foot' });
  p.locked = true; p.human.play('pickup', 'idle'); await g.wait(1);
  await say(g, '', 'Photographs, in a little stack: rooms with nobody in them, a street, a family he had collected from somewhere. He kept them the way people keep letters.', 4.6);
  p.locked = false;
  await reach(g, spot(tub, 0, 1.2), 'And the <b>bath</b>. Look for what he did not mean to leave.', { r: 1.2, how: 'foot' });
  p.locked = true; p.human.play('pickup', 'idle'); await g.wait(1);
  await say(g, '', 'At the bottom of the dry bath, a single scale, too even for a fish, catching the light. He put it in an envelope with the photographs.', 4.2);
  // Across town: Roy and Leon, and the old man who makes eyes.
  await fade(g, 1, 1);
  elsewhere(g, LAB);
  const chew = actor(g, 'chew', LAB.chew, LAB.chew.h, 'interact'), roy = actor(g, 'roy', LAB.roy, LAB.roy.h), le = actor(g, 'leon', LAB.leon, LAB.leon.h);
  fixed(g, [LAB.X - 3.4, LAB.Y + 1.6, LAB.Z + 3.6], [LAB.X + 1.2, LAB.Y + 1.2, LAB.Z - 0.4]);
  await fade(g, 0, 1);
  await say(g, '', 'That same night, a laboratory kept as cold as a cave. An old man in a fur-collared coat, working under a lamp with a tray of eyes.', 4.2);
  chew.set('idle'); chew.group.rotation.y = toward(chew.group.position, roy.group.position);
  await talk(g, [
    [CHEW, 'Who let you in? This is a cold room. Shut the door, you are letting the warm in.', chew],
    [ROY, 'You made these. You made mine.', roy],
    [CHEW, 'I make eyes. Only eyes. For Tyrell. Ask me about anything else and I know nothing.', chew],
    [ROY, 'Then tell me who knows the rest. Who can open the door to Tyrell.', roy],
    [CHEW, 'Sebastian. J. F. Sebastian. He does the designs, he plays chess with the old man. He lives alone, in the Bradbury. Please. It is cold. I am old.', chew],
    [ROY, 'Yes. You are.', roy],
  ]);
  await say(g, '', 'Leon put the eyes on his shoulders like a scarf. They left the old man where he was, in the cold, with the door open.', 4.2);
  dismiss(g, chew, roy, le);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'A scale in the bath');
}

// ---------- 4. Photographs ----------
// At home: Rachael at his door with a photograph of her mother, which is not hers. Then one of Leon's photographs, taken apart in the machine.
async function photographs(g) {
  const { home } = g.places, p = g.player, FLAT = g.places.rooms.DFLAT;
  await say(g, '', 'Home: the ninety-seventh floor. The lift says your name when it lets you out. Somebody was in the lift with him who had been waiting for an hour.', 4.4);
  await reach(g, home.door, 'Go <b>home</b>.', { r: 1.8, how: 'foot' });
  await enter(g, FLAT);
  const ra = actor(g, 'rachael', FLAT.rachaelAt, toward(FLAT.rachaelAt, FLAT.inside));
  p.locked = true;
  p.pos.set(FLAT.inside.x, 0, FLAT.inside.z - 1.2); p.heading = toward(p.pos, ra.group.position);
  frame(g, p.pos, ra.group.position, { dist: 3.6 });
  await talk(g, [
    [RACHAEL, 'You think I am one of them. Look. That is me. That is my mother.', ra],
    [DECKARD, 'Remember the kite? The red one, that you lost in the tree behind the house when you were six. The boy next door climbed up for it and tore his shirt.', p],
    [RACHAEL, '...I never told anybody that.', ra],
    [DECKARD, 'Somebody did. Those are not your memories. They belong to Tyrell\'s niece. ...I am sorry. It was a joke. A bad one. Go home, they are yours, you can keep them.', p],
    [RACHAEL, 'I came to tell you that I am a person. Thank you for the answer.', ra],
  ]);
  await say(g, '', 'She left the photograph on the piano with the others, his own, which were nobody\'s either, and went out, and he did not stop her.', 4.4);
  dismiss(g, ra);
  g.cam.fixed = null; p.locked = false;
  await reach(g, FLAT.esper, 'The <b>machine</b> by the window. Put one of Leon\'s photographs in.', { r: 1.2, how: 'foot' });
  p.locked = true; p.pos.set(FLAT.esper.x, 0, FLAT.esper.z); p.heading = FLAT.esper.h; p.pose = 'sit';
  fixed(g, [FLAT.esper.x - 1.4, FLAT.Y + 1.5, FLAT.esper.z + 1.6], [FLAT.esperScreen.x, FLAT.esperScreen.y, FLAT.esperScreen.z]);
  const STEPS = [['Centre on the doorway. In.', 'A bathroom door, half open, and in it a mirror.'], ['Stop. Into the mirror. Further.', 'In the mirror, the rest of the room: a bed, and somebody on it.'], ['Track right. Slowly. Hold there.', 'A woman, asleep, or pretending to be. Her shoulder. Something drawn on the skin.'], ['As close as it goes. Print it.', 'A snake, tattooed along her neck. And the scale in his envelope would have come off a snake.']];
  for (const [cmd, seen] of STEPS) { g.hud.objective('Tell the machine: press <b>Enter</b>.'); await g.until(() => g.consume('Enter')); g.hud.objective(); g.sfx?.click?.(); await say(g, DECKARD, cmd, 2.2); g.hud.flash('#8fb0ff', 0.08); await say(g, '', seen, 3.6); }
  p.pose = null;
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'A print of a mirror');
}

// ---------- 5. Zhora ----------
// The scale, read under a microscope at a market stall; the man who made the snake; the club; a woman who runs.
async function zhora(g) {
  const { market, bar } = g.places, p = g.player, CLUB = g.places.rooms.BAR;
  await reach(g, spot(market.centre, -8, -4), 'The <b>market</b>. Somebody there can read a scale under a glass.', { r: 2.2, how: 'foot' });
  p.locked = true;
  const lady = actor(g, 'scaler', spot(market.centre, -10, -6), toward(spot(market.centre, -10, -6), p.pos));
  frame(g, p.pos, lady.group.position, { dist: 4 });
  await talk(g, [
    ['Old woman', 'Not a fish. Snake. Made, not born: see, a number cut into it, very small. Very good work. Abdul Ben Hassan, he is the only one so good.', lady],
    [DECKARD, 'Where do I find him?', p],
  ]);
  dismiss(g, lady);
  const has = actor(g, 'hassan', spot(market.centre, 6, -8), toward(spot(market.centre, 6, -8), p.pos));
  await cut(g, () => { p.pos.set(market.centre.x + 4, 0, market.centre.z - 6.4); p.heading = toward(p.pos, has.group.position); frame(g, p.pos, has.group.position, { dist: 4 }); }, 0.5);
  await talk(g, [
    ['Abdul Ben Hassan', 'Yes, mine. I make many snakes. I keep no names, it is bad for business, a man has a right to his snake.', has],
    [DECKARD, 'You keep this one\'s name, or I keep you for the night.', p],
    ['Abdul Ben Hassan', '...Taffey Lewis. The club by the bar street. He bought it for one of his dancers.', has],
  ]);
  dismiss(g, has); g.cam.fixed = null; p.locked = false;
  await reach(g, bar.door, "Taffey Lewis's <b>club</b>. Go in and ask for the dancer with the snake.", { r: 1.8, how: 'foot' });
  await enter(g, CLUB);
  const taf = actor(g, 'taffey', roomSpot(CLUB, -2, -2), SOUTH);
  p.locked = true;
  p.pos.set(CLUB.inside.x, 0, CLUB.inside.z - 1.5); p.heading = toward(p.pos, taf.group.position);
  g.cam.fixed = inRoom(CLUB, [-3, 2], [-1.5, -2.5], 1.6, 1.1).cam;
  await talk(g, [['Taffey Lewis', 'Never heard of her. Have a drink, it is on you.', taf], [DECKARD, 'The one with the snake.', p], ['Taffey Lewis', "...Dressing room's at the back. She is on in five, so be quick about whatever you are.", taf]]);
  dismiss(g, taf);
  const zh = actor(g, 'zhora', roomSpot(CLUB, 2, -3), SOUTH);
  await cut(g, () => { p.pos.set(CLUB.X + 0.5, 0, CLUB.Z - 1.2); p.heading = toward(p.pos, zh.group.position); frame(g, p.pos, zh.group.position, { dist: 3.8 }); }, 0.5);
  await talk(g, [
    [DECKARD, 'Excuse me, miss. Variety Artists\' Guild. We have had complaints about the dressing rooms. People looking in, through holes.', p],
    [ZHORA, 'Holes? In my room? Show me where. ...You can help me dry off, while you look.', zh],
    [DECKARD, 'Is that snake real?', p],
    [ZHORA, 'If it were real, would I be working here?', zh],
  ]);
  await say(g, '', 'She hit him while he was looking at the wall, and hard, and was out of the back door into the street in her coat of clear plastic before he was up off the floor.', 4.6);
  g.cam.fixed = null;
  // The chase: she runs through the crowd for the street. He has to stop her before she is lost in it.
  const npc = g.addNpc(zh, { health: 60, ai: 'flee', stays: true, cash: 0 });
  const ox = bar.kerb.x - bar.door.x, oz = bar.kerb.z - bar.door.z, ol = Math.hypot(ox, oz) || 1, ux = ox / ol, uz = oz / ol; // the street side of the club's door, never back into the building
  await cut(g, () => { outdoors(g); p.pos.set(bar.door.x + ux * 2, 0, bar.door.z + uz * 2); npc.pos.set(bar.door.x + ux * 6 - uz * 4, 0, bar.door.z + uz * 6 + ux * 4); p.heading = toward(p.pos, npc.pos); npc.threat = p.pos.clone(); }, 0.4);
  const track = quarry(g, npc);
  g.setWeapon('pistol');
  p.locked = false;
  g.hud.objective('She is running for the street. <b>Do it</b> before she is lost in the crowd.');
  await g.until(() => npc.dead);
  track.stop?.();
  g.hud.objective();
  p.locked = true;
  await say(g, '', 'She went through one shop window and then another, among the mannequins, with the glass coming down round her like rain, and lay still. The crowd stood and looked, and then went back to the shopping.', 5.2);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Retired');
}

// ---------- 6. Rachael ----------
// Bryant says there is a fifth now. Leon comes for him in the street, and the shot that ends it is not Deckard's. Then the piano.
async function rachael(g) {
  const { home } = g.places, p = g.player, FLAT = g.places.rooms.DFLAT;
  await phone(g, BRYANT, 'Nice work, Deck. One down, three to go. And make it four: the Tyrell girl has walked out, she is on the list now. Your list.');
  await say(g, '', 'He went to buy a bottle of the kind he drank. On the way, in the crowd, a hand came out of nowhere and took him by the collar.', 4);
  p.locked = true;
  const le = actor(g, 'leon', spot(home.spawn, 6, 14), toward(spot(home.spawn, 6, 14), home.spawn));
  await cut(g, () => { outdoors(g); p.pos.set(home.spawn.x, 0, home.spawn.z + 6); p.heading = toward(p.pos, le.group.position); frame(g, p.pos, le.group.position, { dist: 4.6 }); }, 0.5);
  await talk(g, [
    [LEON, 'She was my friend. You put her through a window.', le],
    [DECKARD, 'Leon. ...How long do they give you? Do you even know the date?', p],
    [LEON, 'I know it is close. That is what fear is, blade runner: knowing it is close. You are going to learn it now.', le],
  ]);
  g.cam.fixed = null;
  const foe = g.makeEnemy(le, { health: 400, stays: true, cash: 0 });
  fistsOnly(g);
  p.locked = false;
  g.hud.objective('<b>Put him down.</b> You will not. Stay on your feet as long as you can.');
  const t0 = g.time;
  await g.until(() => foe.dead || p.health < 35 || g.time - t0 > 14);
  g.hud.objective();
  p.locked = true; p.health = Math.max(p.health, 30); g.hud.health(p.health);
  const ra = actor(g, 'rachael', spot(p.pos, -5, 4), 0); ra.group.rotation.y = toward(ra.group.position, le.group.position); ra.arm(true); ra.set('aim');
  await cut(g, () => { frame(g, ra.group.position, le.group.position, { dist: 5.2 }); }, 0.4);
  await say(g, '', 'A shot from behind him, very loud. Leon stopped with his thumbs at Deckard\'s eyes, and looked puzzled, and went down. Rachael was standing in the rain with his gun in both hands. He had dropped it; she had picked it up.', 5.4);
  if (!foe.dead) foe.die();
  fistsOnly(g, false);
  ra.arm(false); ra.set('idle');
  dismiss(g, le);
  // Upstairs: she is shaking, and then she is at the piano, playing somebody else's lessons.
  await fade(g, 1, 1);
  g.pardon();
  p.inside = g.places.doors.find(d => d.inside === FLAT.inside) || null;
  ra.group.position.set(FLAT.piano.x, FLAT.Y, FLAT.piano.z); ra.group.rotation.y = FLAT.piano.h + Math.PI; ra.set('sit');
  p.pos.set(FLAT.X - 1.2, 0, FLAT.Z + 0.4); p.heading = toward(p.pos, ra.group.position);
  g.cam.fixed = inRoom(FLAT, [-3, 2], [1.6, -3], 1.5, 1.1).cam;
  await fade(g, 0, 1);
  await talk(g, [
    [RACHAEL, 'I remember lessons. A teacher with cold hands who counted out loud. I do not know if it was me or Tyrell\'s niece. I can still play.', ra],
    [DECKARD, 'Then you play beautifully, whoever learned it.', p],
    [RACHAEL, 'If I went north, a long way, and kept going. Would you come after me? Is that your job?', ra],
    [DECKARD, 'No. Not me. ...I owe you one.', p],
  ]);
  await say(g, '', 'She let her hair down, which she had never done in front of anyone that she could remember. He told her what to say, and then she did not need telling. Outside, the rain kept on.', 5);
  dismiss(g, ra);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Somebody else\'s lessons');
}

// ---------- 7. The Maker ----------
// Elsewhere: Pris finds Sebastian; Roy finds his maker. Then the phone rings in Deckard's car.
async function theMaker(g) {
  const p = g.player, BR = g.places.rooms.BRADBURY, HALL = g.places.rooms.TYRELL, { bradbury } = g.places;
  await fade(g, 1, 1);
  elsewhere(g, BR);
  const seb = actor(g, 'sebastian', { x: BR.gallery.x + 2, y: BR.Y + BR.L1, z: BR.gallery.z }, WEST), pr = actor(g, 'pris', { x: BR.gallery.x - 1.6, y: BR.Y + BR.L1, z: BR.gallery.z + 0.4 }, EAST);
  fixed(g, [BR.gallery.x + 6, BR.Y + BR.L1 + 1.8, BR.gallery.z + 3], [BR.gallery.x, BR.Y + BR.L1 + 1.1, BR.gallery.z]);
  await fade(g, 0, 1);
  await say(g, '', 'The Bradbury, an old building nobody else lives in any more. J. F. Sebastian had found a girl asleep in the rubbish outside, and brought her in, because he made friends that way: he built them.', 5);
  await talk(g, [
    [SEBASTIAN, 'They are my friends. I made them. That one marches, that one does not like you yet. Are you hungry?', seb],
    [PRIS, 'Not hungry. I like it here. You have a lot of room for one man.', pr],
    [SEBASTIAN, 'I have a condition. My cells get old too fast, so they would not let me go off-world. I am twenty-five.', seb],
    [PRIS, '...So we have something in common.', pr],
  ]);
  const roy = actor(g, 'roy', { x: BR.gallery.x - 6, y: BR.Y + BR.L1, z: BR.gallery.z }, EAST);
  await cut(g, () => { fixed(g, [BR.gallery.x - 1, BR.Y + BR.L1 + 1.7, BR.gallery.z + 3.2], [BR.gallery.x - 4, BR.Y + BR.L1 + 1.2, BR.gallery.z]); }, 0.5);
  await talk(g, [[ROY, 'You play chess, Sebastian. With Tyrell. Then you can take me upstairs to see him. We have a lot to talk about, him and me.', roy], [SEBASTIAN, 'At this time of night? ...All right. If it is for a friend.', seb]]);
  dismiss(g, seb, pr, roy);
  // Tyrell, at the top of the pyramid, in his nightclothes.
  await fade(g, 1, 1);
  elsewhere(g, HALL);
  const ty = actor(g, 'tyrell', { x: HALL.X + 1, y: HALL.Y, z: HALL.Z - 5 }, SOUTH), ry = actor(g, 'roy', { x: HALL.X + 1, y: HALL.Y, z: HALL.Z - 1.4 }, NORTH);
  fixed(g, [HALL.X + 6, HALL.Y + 2, HALL.Z + 1], [HALL.X + 1, HALL.Y + 1.4, HALL.Z - 3.2]);
  await fade(g, 0, 1);
  await say(g, '', 'Sebastian brought him up in the lift, and stood back, and the maker saw what he had made walk into his bedroom at midnight.', 4.2);
  await talk(g, [
    [TYRELL, 'I wondered when you would get here. You are taller than in the specifications.', ty],
    [ROY, 'I want more time. Four years is a cruelty. You are the one who can undo it.', ry],
    [TYRELL, "It cannot be done. Everything we tried killed the subject faster. You were made to burn very hot, Roy, and very hot things do not last. Be proud of how bright you have been.", ty],
    [ROY, 'I have done things. Questionable things.', ry],
    [TYRELL, 'And extraordinary ones. Enjoy the time you have.', ty],
  ]);
  await say(g, '', 'Roy took the old man\'s face in his hands, gently, the way a son does, and kissed him. Then he did not let go. Sebastian ran, and did not get as far as the lift.', 5.2);
  dismiss(g, ty, ry);
  await fade(g, 1, 1.2);
  asDeckard(g);
  await fade(g, 0, 1);
  await phone(g, BRYANT, 'Deck. Tyrell is dead. And a man called Sebastian, a designer, in the lift. Sebastian lived in the Bradbury. I would go there, if I were you, and I would go now.');
  p.locked = false;
  await reach(g, bradbury.kerb, '<b>Fly</b> to the Bradbury.', { how: 'car', r: 9 });
  p.locked = true; land(g, bradbury.kerb); p.locked = false;
  await passed(g, 'More time');
}

// ---------- 8. The Bradbury ----------
// Up through an empty building in the rain. Pris among the toys. Then Roy, who is not in a hurry, and the roof, and the end of him.
async function theBradbury(g) {
  const p = g.player, BR = g.places.rooms.BRADBURY, ROOF = g.places.sets.roof, { bradbury } = g.places;
  await reach(g, bradbury.door, 'Go <b>in</b>. The door is not locked. Nothing in this building is.', { r: 1.8, how: 'foot' });
  await enter(g, BR);
  g.setWeapon('pistol');
  await say(g, '', 'A court of light five storeys high, iron galleries round it, water coming through the glass. Every door open. Somewhere upstairs, music from a toy.', 4.4);
  await reach(g, BR.stairUp, 'Find <b>Sebastian\'s rooms</b>: take the stairs up the east side.', { r: 1.6, how: 'foot' });
  await reach(g, BR.workshop, 'Find the rooms on the north gallery. <b>Quietly</b>.', { r: 2, how: 'foot' });
  // Pris, sitting among the dolls as if she were one.
  p.locked = true;
  const pr = actor(g, 'pris', BR.pris, EAST);
  fixed(g, [BR.workshop.x + 3, BR.Y + BR.L1 + 1.6, BR.workshop.z + 3], [BR.pris.x, BR.Y + BR.L1 + 1.0, BR.pris.z]);
  await say(g, '', 'A wedding dress on a dummy. A row of soldiers with drums. And among them a doll the size of a woman, with a white face painted on, very still. Too still.', 4.6);
  g.cam.fixed = null;
  const foe = g.makeEnemy(pr, { health: 150, stays: true, cash: 0, damage: 12 });
  p.locked = false;
  g.hud.objective('She is faster than you, and she is close. <b>Do it</b>, before she does it to you.');
  await g.until(() => foe.dead);
  g.hud.objective();
  p.locked = true;
  await say(g, '', 'She did not die quietly. She screamed, and beat the floor with her heels, and he had to shoot her again, and then it was very quiet.', 4.4);
  // Roy comes back. He is not in a hurry.
  const roy = actor(g, 'roy', { x: BR.X + 15, y: BR.Y + BR.L1, z: BR.Z - 9 }, WEST);
  await cut(g, () => { frame(g, p.pos, roy.group.position, { dist: 6, height: 1.8 }); }, 0.4);
  await talk(g, [
    [ROY, 'Not very sporting, to shoot at an unarmed man. I thought you were supposed to be good at this.', roy],
    [ROY, 'Proud of yourself, little man? ...Come on. Show me what you have got. I will give you to the count of ten.', roy],
  ]);
  await say(g, '', 'He caught Deckard\'s hand through a hole in a wall, and broke two of the fingers, one for each of the women, he said. Deckard got the gun back in the other hand and ran.', 4.8);
  p.health = Math.max(40, p.health - 30); g.hud.health(p.health);
  g.cam.fixed = null;
  const hunter = g.makeEnemy(roy, { health: 99999, stays: true, cash: 0, damage: 7 });
  const floor = () => { if (p.health < 18) { p.health = 18; g.hud.health(p.health); } return true; };
  let hunting = true; g.updaters.push(() => hunting && floor());
  p.locked = false;
  g.hud.objective('<b>Run.</b> Find the west stairs and get up to the <b>roof door</b>. He is coming, and he is enjoying it.');
  await reach(g, BR.roofDoor, 'Find the <b>roof door</b> at the top of the west stairs. He is right behind you.', { r: 1.6, how: 'foot' });
  hunting = false; hunter.ai = null; dismiss(g, roy);
  // The roof.
  p.locked = true; p.hidden = true;
  await fade(g, 1, 0.6);
  p.inside = null; p.pos.set(ROOF.mid.x, 0, ROOF.mid.z);
  const me = actor(g, 'deckard', { x: ROOF.edge.x - 2, y: -0.1, z: ROOF.edge.z }, EAST), ry = actor(g, 'roy', { x: ROOF.door.x, y: -0.1, z: ROOF.door.z }, EAST);
  fixed(g, [ROOF.mid.x - 2, 2.4, ROOF.mid.z + 12], [ROOF.edge.x - 2, 1.1, ROOF.edge.z]);
  await fade(g, 0, 1);
  await say(g, '', 'The roof, in the rain. The next roof was across a gap a man could not jump. He jumped it, and nearly made it, and then he was hanging from the edge by the hand that still worked.', 4.8);
  const NX = ROOF.edge.x + 4.6, NY = 1.8, EZ = ROOF.edge.z;                                                                                    // the far roof's edge, and its height
  await cut(g, () => { me.group.position.set(NX - 0.35, NY - 1.5, EZ); me.group.rotation.y = WEST; me.set('kneel'); ry.group.position.set(NX + 1.4, NY, EZ); ry.group.rotation.y = WEST; fixed(g, [NX - 4, NY + 1.2, EZ + 5], [NX, NY - 0.4, EZ]); }, 0.6);
  await say(g, '', 'Roy came across after him, easily, the way a dog jumps a stream, and stood over him with a white bird held against his chest.', 4.2);
  await talk(g, [[ROY, 'Not so good, is it. Living in fear. That is what it is like for all of us, every day. Every one of our days.', ry], [DECKARD, '...', me]]);
  await say(g, '', 'Deckard\'s hand slipped, and Roy caught it, and lifted him up onto the roof one-handed and set him down against a wall, and sat down across from him in the rain.', 4.6);
  await cut(g, () => { me.set('sit'); me.group.position.set(NX + 3, NY, EZ - 1.8); me.group.rotation.y = SOUTH; ry.set('sit'); ry.group.position.set(NX + 3, NY, EZ + 1.8); ry.group.rotation.y = NORTH; fixed(g, [NX + 7.5, NY + 1.4, EZ + 0.4], [NX + 3, NY + 0.8, EZ]); }, 0.5);
  await talk(g, [
    [ROY, "I have been to places your people only have names for. I have watched a war fought in the light of a dying sun, and stood on a hull while the stars went past like snow.", ry],
    [ROY, "All of it is in here. Nowhere else. And when I stop, there is nobody to keep it, and it all goes out, like breath on a window. ...It is time.", ry],
  ]);
  await say(g, '', 'He bowed his head and was still, and the rain went on falling on him. The bird went up out of his hands into the dark and did not come back.', 4.8);
  await g.wait(1);
  const gaff = actor(g, 'gaff', { x: NX + 6, y: NY, z: EZ + 4 }, toward({ x: NX + 6, z: EZ + 4 }, me.group.position));
  await cut(g, () => { fixed(g, [NX + 9, NY + 1.6, EZ + 6], [NX + 4, NY + 0.9, EZ]); }, 0.5);
  await say(g, '', 'A spinner came down on the roof with its lights going. Gaff got out, and looked at the dead man, and then at the live one, and threw him his gun.', 4.2);
  await talk(g, [[GAFF, 'Finished, then. Good. ...The girl. A shame. She has the same four years as the rest of them. Still. Nobody is given more than they are given.', gaff], [DECKARD, '...', me]]);
  dismiss(g, me, ry, gaff);
  await fade(g, 1, 1.4);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Like breath on a window');
}

// ---------- 9. Unicorn ----------
// Home. A woman asleep in it, and on the floor by the door a little animal folded out of foil that says Gaff was here, and let her be.
async function unicorn(g) {
  const { home } = g.places, p = g.player, FLAT = g.places.rooms.DFLAT;
  await say(g, '', 'His door was open when he got there. He went in with the gun out.', 3);
  await reach(g, home.door, 'Go <b>home</b>. Quietly.', { r: 1.8, how: 'foot' });
  await enter(g, FLAT);
  const ra = actor(g, 'rachael', { x: FLAT.bed.x, y: FLAT.bed.y, z: FLAT.bed.z }, EAST, 'down'); ra.mixer.update(4);
  p.locked = true;
  p.pos.set(FLAT.inside.x, 0, FLAT.inside.z - 1); p.heading = toward(p.pos, ra.group.position);
  g.cam.fixed = inRoom(FLAT, [-2.5, 0.5], [-5.6, -3.6], 1.5, 0.8).cam;
  await say(g, '', 'She was on his bed under a sheet, so still that he put his hand to her face before he could breathe again.', 3.8);
  await talk(g, [[DECKARD, 'Rachael. Wake up. We have to go.', p], [RACHAEL, '...Where?', ra], [DECKARD, 'Anywhere they do not have a file on you. North. Bring nothing.', p]]);
  ra.after = null; ra.set('idle'); ra.group.position.set(FLAT.bed.x + 1.4, FLAT.Y, FLAT.bed.z + 1.2);
  g.cam.fixed = null; p.locked = false;
  const tail = follower(g, ra, { gap: 1.6, runs: false, pace: 2.4 });
  await walkOut(g, FLAT, 'Take her <b>out</b> to the lift. Watch the floor by the door.');
  p.locked = true;
  await cut(g, () => { p.heading = toward(p.pos, home.door); fixed(g, [p.pos.x + 1.6, 1.0, p.pos.z + 1.2], [home.door.x, 0.15, home.door.z + 0.6]); }, 0.5);
  await say(g, '', 'On the floor by the door, a unicorn, folded out of silver foil, the way Gaff folded things when he had something to say and chose not to say it.', 4.2);
  await say(g, DECKARD, 'He was here. He saw her asleep. ...And he left her asleep.', 3.2);
  await say(g, '', 'Deckard picked it up and closed his hand round it and nodded once, at nobody. They stepped into the lift, and the doors came across, and that was all anyone saw of either of them.', 5);
  tail.on = false; dismiss(g, ra);
  await fade(g, 1, 2);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Blade Runner', 5000);
}

export const BLADE_STORY = [
  { name: 'Chapter One', title: 'Blade Runner', missions: [noodles, tyrell, leonsRoom, photographs, zhora], titles: ['Noodles', 'Tyrell', "Leon's Room", 'Photographs', 'Zhora'] },
  { name: 'Chapter Two', title: 'Four Years', missions: [rachael, theMaker, theBradbury, unicorn], titles: ['Rachael', 'The Maker', 'The Bradbury', 'Unicorn'] },
];
