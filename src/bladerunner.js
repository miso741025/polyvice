import * as THREE from 'three';
import { near } from './grid.js';
import {
  say, talk, phone, fade, cut, titleCard, passed, actor, dismiss, spot, toward, frame, reach, follower, punch, fistsOnly,
  inRoom, roomSpot, playing, enter, walkOut, wantCar, outdoors, NORTH, SOUTH, EAST, WEST,
} from './missions.js';

// Nexus, thirty years earlier. The story follows the plot of the first "Blade Runner"; every line of dialogue is written for
// the game. The player is Deckard, retired, until he is not. The same city, the same buildings, under their older names:
// the ziggurat is Tyrell's, the police block is Bryant's.

const DECKARD = 'Deckard', GAFF = 'Gaff', BRYANT = 'Bryant', RACHAEL = 'Rachael', TYRELL = 'Tyrell', LEON = 'Leon', HOLDEN = 'Holden';

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

export const BLADE_STORY = [
  { name: 'Chapter One', title: 'Blade Runner', missions: [noodles], titles: ['Noodles'] },
];
