import * as THREE from 'three';
import { near } from './grid.js';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, frame, reach, follower, punch, fistsOnly, quarry,
  inRoom, roomSpot, playing, enter, walkOut, wantCar, outdoors, NORTH, SOUTH, EAST, WEST,
} from './missions.js';

// Nexus, thirty years earlier. The story follows the plot of the first "Blade Runner"; every line of dialogue is written for
// the game. The player is Deckard, retired, until he is not. The same city, the same buildings, under their older names:
// the ziggurat is Tyrell's, the police block is Bryant's.

const DECKARD = 'Deckard', GAFF = 'Gaff', BRYANT = 'Bryant', RACHAEL = 'Rachael', TYRELL = 'Tyrell', LEON = 'Leon', SEBASTIAN = 'Sebastian', ROY = 'Roy Batty';

const land = (g, at) => { const c = g.tonyCar; if (g.player.car === c) g.leaveCar(); c.pos.set(at.x, 0, at.z); c.heading = at.h ?? 0; c.speed = 0; c.alt = 0; c.sync?.(); return c; };
function asDeckard(g) {
  const { home } = g.places, p = g.player;
  if (p.car) g.leaveCar();
  outdoors(g);
  p.pos.set(home.wake.x, 0, home.wake.z); p.heading = g.cam.yaw = NORTH;
  g.tonyCar.pos.set(home.car.x, 0, home.car.z); g.tonyCar.heading = home.car.h; g.tonyCar.speed = 0; g.tonyCar.alt = 0;
  g.cam.fixed = null;
}

// ---------- 1. Noodles ----------
// A bowl at the counter in the rain, a man with a cane who will not take no, and an old job on a desk at headquarters.
async function noodles(g) {
  const { home, market, precinct } = g.places, p = g.player, OFFICE = g.places.rooms.OFFICE;
  p.locked = true;
  p.pos.set(home.spawn.x, 0, home.spawn.z); p.heading = g.cam.yaw = SOUTH;
  g.hud.show(true); g.cam.fixed = null;
  await fade(g, 0, 1.5);
  await titleCard(g, 'Noodles', 'Nexus, 2019');
  await say(g, '', 'Deckard had been a blade runner, and then he had been a man who ate at counters and did not answer his door. The second one suited him.', 5);
  p.locked = false;
  await reach(g, spot(market.centre, 6, 10), 'Walk down to the <b>night market</b>. There is a stall that does the fish two ways.', { r: 3, how: 'foot' });
  p.locked = true;
  const gaff = actor(g, 'gaff', spot(market.centre, 9, 13), toward(spot(market.centre, 9, 13), p.pos));
  await cut(g, () => { p.pos.set(market.centre.x + 6, 0, market.centre.z + 10); p.heading = toward(p.pos, gaff.group.position); frame(g, p.pos, gaff.group.position, { dist: 4.2 }); }, 0.5);
  await say(g, '', 'He had ordered four, and been given two, and was arguing about it when the man with the cane sat down beside him without being asked.', 4.6);
  await talk(g, [
    [GAFF, 'The captain wants you. Tonight. He said to say it nicely, and then to say it again.', gaff],
    [DECKARD, 'I retired. It was in the paper, small.', p],
    [GAFF, 'The captain does not read the small part. The car is outside. Bring your noodles if you like.', gaff],
    [DECKARD, '...Tell him no.', p],
    [GAFF, 'I told him you would say that. He said that if you said that, I was to arrest you, and then you would come anyway, so why not come as a free man.', gaff],
  ]);
  g.cam.fixed = null;
  const tail = follower(g, gaff, { gap: 2, runs: false, pace: 2.6 });
  p.locked = false;
  await wantCar(g, g.tonyCar, 'His <b>spinner</b> is at the kerb. Get in; he drives.');
  tail.on = false; dismiss(g, gaff);
  await reach(g, precinct.kerb, 'Gaff flies; you sit. <b>Fly</b> to headquarters, Sector 9.', { how: 'car', r: 9 });
  p.locked = true; land(g, precinct.kerb); p.locked = false;
  await reach(g, precinct.door, 'Go <b>in</b>. The captain is on the top floor and will not come down.', { r: 1.8, how: 'foot' });
  await enter(g, OFFICE);
  const bryant = actor(g, 'bryant', roomSpot(OFFICE, 2, -2.4), SOUTH, 'sit');
  p.locked = true;
  p.pos.set(OFFICE.X + 2, 0, OFFICE.Z + 0.2); p.heading = NORTH;
  g.cam.fixed = inRoom(OFFICE, [-2.5, 1.5], [2, -2], 1.55, 1.1).cam;
  await talk(g, [
    [BRYANT, 'Deck. You look like hell. Sit down, you are making the room untidy.', bryant],
    [DECKARD, 'Gaff said you would arrest me.', p],
    [BRYANT, "Gaff says a lot of things in that language of his. Four of them, Deck. Nexus-6. They took a shuttle, they killed the crew, and now they are here, in my city, and Holden is in a hospital bed breathing through a machine because he asked one of them the wrong question.", bryant],
    [DECKARD, 'Then you need a blade runner. There are others.', p],
    [BRYANT, 'There were. You were the best, and the rest are dead or worse. I need the old magic, Deck.', bryant],
    [DECKARD, 'And if I say no.', p],
    [BRYANT, 'Then you are little people, and you know what happens to little people. ...Four. Leon, the one that shot Holden. A woman called Zhora. A pleasure model, Pris. And the leader: Roy Batty. Combat model. The best they ever made.', bryant],
  ]);
  await say(g, '', 'He put the file on the desk between them. Deckard looked at the photographs for a long time, and then he picked them up, which was the same as saying yes.', 4.8);
  await talk(g, [[BRYANT, 'Start at Tyrell. Run the test on one of theirs: if it works on a Nexus-6, it works on all four. Gaff will fly you.', bryant]]);
  dismiss(g, bryant);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Back on the job');
}

// ---------- 2. Tyrell ----------
// The test, run on the maker's own: a hundred questions in a hall of amber light, and a woman who does not know what she is.
async function tyrell(g) {
  const { wallace: pyr } = g.places, p = g.player, HALL = g.places.rooms.ARCHIVE;
  await reach(g, pyr.kerb, '<b>Fly</b> to the Tyrell pyramid. Gaff says the old man will see you himself.', { how: 'car', r: 9 });
  p.locked = true; land(g, pyr.kerb); p.locked = false;
  await reach(g, pyr.door, 'Cross the <b>causeway</b>. The door is a slit of light.', { r: 1.8, how: 'foot' });
  await enter(g, HALL);
  const ty = actor(g, 'tyrell', HALL.luv, HALL.luv.h), ra = actor(g, 'rachael', { x: HALL.table.x - 1.4, y: HALL.Y, z: HALL.table.z + 0.6 }, EAST, 'sit');
  p.locked = true;
  p.pos.set(HALL.inside.x, 0, HALL.inside.z - 2); p.heading = toward(p.pos, ty.group.position);
  g.cam.fixed = inRoom(HALL, [6, 3], [0, -2.5], 2.2, 1.2).cam;
  await say(g, '', 'The hall was lit the colour of honey and floored with water. A man in thick glasses waited at the far end with a woman beside him, and the woman was looking at Deckard the way a person looks at a dog that may bite.', 5.4);
  await talk(g, [
    [TYRELL, 'Mr. Deckard. Bryant said you would want to run your test on one of mine. I would rather you ran it on a human first. Then we know what it measures.', ty],
    [DECKARD, 'I know what it measures.', p],
    [TYRELL, 'Humour me. Rachael is my assistant. Begin with her.', ty],
  ]);
  g.cam.fixed = null; p.locked = false;
  await reach(g, spot(HALL.table, 0.6, 1.2), 'Sit down across from <b>Rachael</b> and set up the machine.', { r: 1.3, how: 'foot' });
  p.locked = true;
  p.pos.set(HALL.table.x + 0.6, 0, HALL.table.z + 0.6); p.heading = WEST; p.pose = 'sit';
  g.cam.fixed = { pos: new THREE.Vector3(HALL.table.x - 0.4, HALL.Y + 1.5, HALL.table.z + 3.2), look: new THREE.Vector3(HALL.table.x - 0.6, HALL.Y + 1.15, HALL.table.z + 0.4) };
  // The questions. The player answers nothing; what matters is how long each one takes her.
  const Q = [['You are given a calfskin wallet for your birthday.', 'I would not accept it. I would report the person.'], ['A wasp is crawling on your arm.', 'I would kill it.'], ['A boy shows you his butterfly collection, and the jar he kills them in.', 'I would take him to a doctor.'], ['Your husband is in the next room with another woman. You can hear them.', '...I would go in. Is this part of the test?'], ['Describe, in single words, the good things about your mother.', 'My mother. Let me tell you about my mother. ...Why are you writing that down?']];
  g.hud.objective('<b>Watch the needle.</b> Press Enter after each answer to go on.');
  for (const [q, a] of Q) { await talk(g, [[DECKARD, q, p], [RACHAEL, a, ra]]); g.hud.flash('#8f7bff', 0.05); }
  g.hud.objective();
  await say(g, '', 'It took more than a hundred questions. On a human it takes twenty or thirty. When it was over she was sent out of the room, and she went.', 4.6);
  dismiss(g, ra);
  await talk(g, [
    [DECKARD, "She doesn't know, does she.", p],
    [TYRELL, 'She is beginning to suspect. I gave her memories: a childhood, a mother, a cushion for the emotions. It makes them easier to control. Rachael is an experiment, nothing more.', ty],
    [DECKARD, 'An experiment that thinks it is a woman.', p],
    [TYRELL, 'More human than human, Mr. Deckard. That is the firm\'s motto. ...The four you are looking for are the same series without the memories. Four years of life. They know it is running out.', ty],
  ]);
  dismiss(g, ty); p.pose = null;
  await fade(g, 1, 1);
  await say(g, '', 'On the causeway the rain had started again. Deckard had the answer to the question he had been sent with, and a second question he had not been sent with, and he did not like either.', 4.8);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'More than a hundred questions');
}

// ---------- 3. Leon's Room ----------
// A hotel room rented by a man who does not sleep. Photographs of nothing, a bath nobody has used, and a scale in it.
async function leonsRoom(g) {
  const p = g.player, hotel = g.places.doors.find(d => d.name === 'the hotel'), ROOM = g.places.rooms.SUITE || g.places.rooms.HOTEL;
  await say(g, '', 'Holden had been shot in a hotel. Leon had given the hotel as his address, which is the kind of thing they do: they are new, and they have not learned to lie about small things.', 4.8);
  await reach(g, spot(hotel.outside, 0, 8), '<b>Drive</b> to the hotel Leon gave as his address.', { how: 'car', r: 9 });
  p.locked = true; land(g, spot(hotel.outside, 0, 8)); p.locked = false;
  await reach(g, hotel.outside, 'Go <b>in</b>. His room is paid up a month ahead.', { r: 1.8, how: 'foot' });
  await enter(g, ROOM);
  const bed = ROOM.bed || roomSpot(ROOM, -2.6, -2), tub = roomSpot(ROOM, 4, -2.5);
  p.locked = true;
  p.pos.set(ROOM.inside.x, 0, ROOM.inside.z - 1); p.heading = NORTH;
  g.cam.fixed = inRoom(ROOM, [3, 3.5], [-1, -1.5], 1.6, 1.0).cam;
  await say(g, '', 'Nobody had slept in the bed. On the dresser, a stack of photographs of an empty room, taken from the same chair, forty times. He kept them the way a man keeps letters.', 4.8);
  g.cam.fixed = null; p.locked = false;
  await reach(g, spot(bed, 1.2, 1.2), 'Find the <b>photographs</b> by the bed.', { r: 1.2, how: 'foot' });
  p.locked = true; p.human.play('pickup', 'idle'); await g.wait(1);
  await say(g, DECKARD, 'A room. A table. A mirror. ...Something in the mirror.', 3.2);
  p.locked = false;
  await reach(g, tub, 'Find the <b>bathroom</b>. He has been using the bath for something.', { r: 1.2, how: 'foot' });
  p.locked = true; p.human.play('kneel', 'idle'); await g.wait(1.4);
  await say(g, '', 'In the dry bath, one scale, the size of a thumbnail, with a number etched on it so small it needed the machine. Not a fish. Not anything that had ever been in the sea.', 4.6);
  await say(g, DECKARD, 'A snake. Somebody made a snake, and somebody bought it. The street that sells those is in the market.', 3.6);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'One scale');
}

// ---------- 4. Zhora ----------
// The scale leads to a maker, the maker to a club, and the club to a woman with a snake who runs when she is told what he is.
async function zhora(g) {
  const { market, bar } = g.places, p = g.player, CLUB = g.places.rooms.BAR;
  await reach(g, market.kerb, '<b>Fly</b> to the night market. The scale-maker has a stall there.', { how: 'car', r: 9 });
  p.locked = true; land(g, market.kerb); p.locked = false;
  await reach(g, spot(market.centre, -8, -4), 'Find the <b>stall</b> that sells what nobody should be able to make.', { r: 2.2, how: 'foot' });
  p.locked = true;
  const maker = actor(g, 'cotton', spot(market.centre, -10, -6), toward(spot(market.centre, -10, -6), p.pos));
  frame(g, p.pos, maker.group.position, { dist: 4 });
  await talk(g, [
    ['Scale-maker', 'That is mine. I do not make the whole snake, officer, only the skin. The man who buys skins from me is at the club by the bar, the one with the dancer.', maker],
    [DECKARD, 'Which dancer.', p],
    ['Scale-maker', 'The one with the snake. You would not have asked otherwise.', maker],
  ]);
  dismiss(g, maker); g.cam.fixed = null; p.locked = false;
  await reach(g, bar.door, 'The <b>club</b>. Go in and ask for the dancer with the snake.', { r: 1.8, how: 'foot' });
  await enter(g, CLUB);
  const zh = actor(g, 'zhora', roomSpot(CLUB, 2, -3), SOUTH);
  p.locked = true;
  p.pos.set(CLUB.inside.x, 0, CLUB.inside.z - 1.5); p.heading = toward(p.pos, zh.group.position);
  g.cam.fixed = inRoom(CLUB, [-3, 2], [1.5, -2.5], 1.6, 1.1).cam;
  await talk(g, [
    [DECKARD, 'Miss. I am from the committee for the protection of performers. There have been complaints about the dressing rooms. Holes, in the walls.', p],
    ['Zhora', 'You are a terrible liar, and you are not from any committee. What do you want?', zh],
    [DECKARD, 'To see your dressing room. And your snake.', p],
    ['Zhora', '...Wait here.', zh],
  ]);
  await say(g, '', 'She did not wait. She went out through the back, and he went after her into the market, where everything was wet and everyone was in the way.', 4.2);
  g.cam.fixed = null;
  // The chase: she runs through the stalls for the street; he has to put her down before she is out of sight.
  const npc = g.addNpc(zh, { health: 60, ai: 'flee', stays: true, cash: 0 }); npc.threat = p.pos.clone();
  await cut(g, () => { outdoors(g); p.pos.set(bar.door.x, 0, bar.door.z + 2); p.heading = toward(p.pos, market.centre); npc.pos.set(bar.door.x + 4, 0, bar.door.z + 6); }, 0.4);
  const track = quarry(g, npc);
  g.setWeapon('pistol');
  p.locked = false;
  g.hud.objective('She is running for the street. <b>Do it</b> before she reaches a car.');
  await g.until(() => npc.dead);
  track.stop?.();
  g.hud.objective();
  p.locked = true;
  await say(g, '', 'She went through a window of glass and lay among the mannequins with the rain coming in on her, and the crowd stood round and looked, and then went back to shopping.', 5);
  await say(g, '', 'A blade runner is paid per retirement. He did not feel paid.', 3.2);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Retired');
}

// ---------- 5. Rachael ----------
// Leon has been watching. On the street he takes Deckard apart with his hands, and the shot that ends it is not Deckard's.
async function rachael(g) {
  const { home } = g.places, p = g.player, FLAT = g.places.rooms.KFLAT;
  await say(g, '', 'Bryant wanted a report. Deckard wanted a drink. On the way to either, Leon found him first.', 3.8);
  p.locked = true;
  const le = actor(g, 'leon', spot(home.spawn, 6, 14), toward(spot(home.spawn, 6, 14), home.spawn));
  await cut(g, () => { outdoors(g); p.pos.set(home.spawn.x, 0, home.spawn.z + 6); p.heading = toward(p.pos, le.group.position); frame(g, p.pos, le.group.position, { dist: 4.6 }); }, 0.5);
  await talk(g, [
    [LEON, 'You shot her. Zhora. You shot her in the back in the street.', le],
    [DECKARD, 'Leon. How old are you?', p],
    [LEON, 'Four years. Four years is what we get. How long have you got, blade runner? ...Nobody is going to come.', le],
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
  await say(g, '', 'A shot, from behind him. Leon stopped with his hands still out, and looked surprised, and then he was on the ground, and Rachael was standing in the rain with the gun held out in both hands.', 5);
  if (!foe.dead) foe.die();
  fistsOnly(g, false);
  await talk(g, [[RACHAEL, 'I came to find you. I wanted to know what the test said. ...I think I know now.', ra], [DECKARD, 'Come inside. You are soaked.', p]]);
  ra.arm(false); ra.set('idle');
  dismiss(g, le, ra);
  // Upstairs: the piano, and a woman learning she remembers somebody else's lessons.
  await fade(g, 1, 1);
  g.pardon();
  p.inside = g.places.doors.find(d => d.inside === FLAT.inside) || null;
  const her = actor(g, 'rachael', { x: FLAT.chair.x, y: FLAT.Y, z: FLAT.chair.z }, FLAT.chair.h, 'sit');
  p.pos.set(FLAT.X - 1.2, 0, FLAT.Z + 0.4); p.heading = toward(p.pos, her.group.position);
  g.cam.fixed = inRoom(FLAT, [3, 2.5], [-1, -0.5], 1.5, 1.1).cam;
  await fade(g, 0, 1);
  await talk(g, [
    [RACHAEL, 'I remember piano lessons. A teacher with cold hands. I can play, Deckard. Whose lessons are they?', her],
    [DECKARD, "Tyrell's niece's, I think. ...They are good lessons. Play something.", p],
    [RACHAEL, 'And if I am one of them, will you come for me? Is that the job?', her],
    [DECKARD, 'No. Somebody would, though. ...Not me.', p],
  ]);
  await say(g, '', 'She played badly, and he let her, and the rain went on. Two of the four were left, and he no longer knew what he would say to them.', 4.4);
  dismiss(g, her);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Somebody else\'s lessons');
}

// ---------- 6. Sebastian ----------
// The last two are hiding with a lonely man who makes toys, in a building in the scrap district where nobody else lives.
async function sebastian(g) {
  const { orphanage: yard } = g.places, p = g.player, SHED = g.places.rooms.ORPHANAGE;
  await say(g, '', 'The toymaker had bought a snake skin too, for a friend. His address was a block in Sector 6 that the city had given up on, and he had the whole of it to himself.', 4.6);
  await reach(g, yard.gate, '<b>Fly</b> out to Sector 6. The building with the lights on is his.', { how: 'car', r: 9 });
  p.locked = true; land(g, yard.gate); p.locked = false;
  await reach(g, yard.door, 'Go <b>in</b>. Quietly: they will be with him.', { r: 1.8, how: 'foot' });
  await enter(g, SHED);
  for (const a of SHED.ambient) a.group.visible = false;
  const seb = actor(g, 'sebastian', { x: SHED.desk.x - 1.6, y: SHED.Y, z: SHED.desk.z }, EAST), pr = actor(g, 'pris', { x: SHED.floorMid.x + 2, y: SHED.Y, z: SHED.floorMid.z - 2 }, SOUTH);
  p.locked = true;
  p.pos.set(SHED.inside.x, 0, SHED.inside.z - 1.2); p.heading = NORTH;
  g.cam.fixed = inRoom(SHED, [-6, 4.5], [3, 0], 1.7, 1.1).cam;
  await say(g, '', 'Toys everywhere: soldiers that saluted, a bear in a general\'s coat, things with faces that turned to look at you. And among them, very still, a girl with white hair, painted like a doll.', 5);
  await talk(g, [[SEBASTIAN, 'You are the police. They said you would come. They said you were a kind of policeman that only comes for them.', seb], [DECKARD, 'Where is Batty?', p], [SEBASTIAN, 'He went to see his father.', seb]]);
  dismiss(g, seb);
  await say(g, '', 'Pris did not wait to be asked anything.', 2.6);
  g.cam.fixed = null;
  const foe = g.makeEnemy(pr, { health: 160, stays: true, cash: 0 });
  fistsOnly(g, false); g.setWeapon('pistol');
  p.locked = false;
  g.hud.objective('She is faster than you. <b>Do it</b>, or she will do it to you.');
  await g.until(() => foe.dead);
  g.hud.objective();
  p.locked = true;
  await cut(g, () => { g.cam.fixed = inRoom(SHED, [-3, 2], [2, -1.5], 1.4, 0.5).cam; }, 0.5);
  await say(g, '', 'It took three shots, and she did not die the way people die; she kicked against the floor as if something in her was still trying to run. He waited until it stopped.', 4.8);
  await say(g, '', 'Then the door at the far end opened, and Roy Batty came in out of the rain and looked at her for a long time, and then at him.', 4.2);
  await fade(g, 1, 1);
  asDeckard(g);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Three shots');
}

// ---------- 7. The Roof ----------
// He cannot win this one. He runs up through the building and out onto the roof, and the man who could kill him does not.
async function theRoof(g) {
  const { precinct } = g.places, p = g.player, deck = precinct.deck;
  p.locked = true; p.hidden = true;
  await fade(g, 1, 0.6);
  await say(g, '', 'Batty hunted him through the building the way a cat hunts, talking the whole time, breaking what he caught. Deckard went up because there was no down left.', 4.8);
  const me = actor(g, 'deckard', { x: deck.x + 6, y: deck.y, z: deck.z + 5 }, WEST), roy = actor(g, 'roy', { x: deck.x - 3, y: deck.y, z: deck.z - 2 }, EAST);
  const edge = { x: deck.x + 11, y: deck.y, z: deck.z + 5 };
  g.cam.fixed = { pos: new THREE.Vector3(deck.x + 2, deck.y + 2.2, deck.z + 14), look: new THREE.Vector3(deck.x + 2, deck.y + 1.1, deck.z + 1) };
  await fade(g, 0, 1);
  await say(g, '', 'The roof of the police block, in the rain, eighty metres up. The next roof was a jump a man could not make, and he made it as far as the edge of it, and hung there.', 4.6);
  await cut(g, () => { me.group.position.set(edge.x, deck.y + 0.1, edge.z); me.set('kneel'); roy.group.position.set(edge.x - 2.4, deck.y, edge.z); roy.group.rotation.y = toward(roy.group.position, me.group.position); g.cam.fixed = { pos: new THREE.Vector3(edge.x - 1, deck.y + 1.6, edge.z + 5.5), look: new THREE.Vector3(edge.x - 0.8, deck.y + 0.9, edge.z) }; }, 0.6);
  await talk(g, [
    [ROY, "That is what it feels like. Not knowing if the next minute is yours. Every one of us has had that every minute for four years.", roy],
    [DECKARD, '...', me],
    [ROY, 'Give me your hand.', roy],
  ]);
  await say(g, '', 'He pulled him up by the wrist, one-handed, and set him down on the wet gravel, and sat down beside him as if they had both climbed something together.', 4.4);
  await cut(g, () => { me.set('sit'); me.group.position.set(edge.x - 1.5, deck.y, edge.z); roy.set('sit'); roy.group.position.set(edge.x - 3, deck.y, edge.z + 0.3); roy.group.rotation.y = EAST; g.cam.fixed = { pos: new THREE.Vector3(edge.x - 2, deck.y + 1.3, edge.z + 4.2), look: new THREE.Vector3(edge.x - 2.3, deck.y + 0.9, edge.z) }; }, 0.5);
  await talk(g, [
    [ROY, 'I have been places you will never go, and seen things your city will never make. Ships burning in the dark. Light on water nobody has swum in. When I stop, all of it stops.', roy],
    [ROY, "Four years. It wasn't enough. It was never going to be enough. ...It is time.", roy],
  ]);
  await say(g, '', 'He bowed his head, and the rain went on falling on him, and after a while it was only falling on something that had been him. A white bird went up off the roof and did not come back.', 5.2);
  await g.wait(1);
  await say(g, '', "Gaff found him there. He said nothing about Batty. He said Rachael's file was still open, and that it was a shame she would not live, and then he said: but then, who does.", 4.8);
  await fade(g, 1, 1.4);
  dismiss(g, me, roy);
  p.hidden = false;
  asDeckard(g);
  await say(g, '', 'She was asleep in his flat when he got there. He woke her, and they went down the stairs together, and he did not look at what Gaff had left outside the door.', 4.6);
  await fade(g, 0, 1);
  p.locked = false;
  await passed(g, 'Blade Runner', 5000);
}

export const BLADE_STORY = [
  { name: 'Chapter One', title: 'Blade Runner', missions: [noodles, tyrell, leonsRoom, zhora], titles: ['Noodles', 'Tyrell', "Leon's Room", 'Zhora'] },
  { name: 'Chapter Two', title: 'Time to Die', missions: [rachael, sebastian, theRoof], titles: ['Rachael', 'Sebastian', 'The Roof'] },
];
