# Handoff

Written 2026-10-02 for the next agent picking this project up, and updated the same day after the visual upgrade (branch `visual-upgrade`, uncommitted at the time of writing). Read this before changing anything.

## What this is

A GTA: Vice City-style open-world game in the browser (Three.js r160, no build step), following Tony Soprano's storyline in an 80s Miami-style city. It is a **fan project for the owner's personal use**: real character names and plot beats are used on purpose, the repo is private, and it must not be published or sold. Dialogue is written fresh for the game; do not copy lines from the show.

## The owner's standing preferences

- Talk to the owner in **Traditional Chinese**. In-game text stays in **English**.
- Target look: **Vice City / PS2-era quality**, matching the owner's reference image (seven crew members in front of a pink neon club). The owner rejected blocky and code-generated characters twice; do not go back to them.
- **Ask before downloading anything** (state file name, source, size) and **before spending Artlist credits** (quote the cost first). The owner approved using Artlist image generation for textures on those terms; nothing has been generated yet. Artlist has no 3D model generation on this account.
- Do not identify the people in reference images by their faces. The cast below was confirmed by the owner.

## Cast (reference image, left to right)

| # | Character | Look key in `src/people.js` |
|---|---|---|
| 1 | Big Pussy | `pussy` |
| 2 | Tony | `tony` |
| 3 | Christopher | `christopher` |
| 4 | Paulie | `paulie` |
| 5 | Hesh | `hesh` |
| 6 | Silvio | `silvio` |
| 7 | Furio | `furio` |

The owner confirmed Tony, Hesh and Furio explicitly; the other four were proposed from wardrobe and not objected to. Story notes from the owner: Hesh has his own record label in this world (planned as a landmark and mission hub); Furio only appears late in the storyline.

## Running it

```bash
python3 -m http.server 8137
```

Open http://localhost:8137. Port 5173 was taken on the owner's machine, hence 8137 (`.claude/launch.json`). Three.js and its addons load from the jsDelivr CDN through the import map in `index.html`, so it needs internet.

## Code map

- `src/grid.js`: city layout constants, the collider list, `pushOut` collision, `groundAt(x, z)` (sidewalks are 0.14 high, the beach is lower, car parks listed in `lowGround` stay at road level).
- `src/world.js`: the city. See below. Returns `places`, which missions use for positions; `places.update(time)` animates the sea, sky and pool.
- `src/people.js`: characters. See below.
- `src/entities.js`: cars (built per kind from a side profile, see `CAR_KINDS`), car physics, traffic AI, pedestrians, ducks.
- `src/missions.js`: the story as plain async functions; each `await` waits on the game loop.
- `src/hud.js`: money, clock, radar, subtitles, cards, fades.
- `src/main.js`: boot, input, player, camera, the frame loop.

### Characters (`src/people.js`)

Bodies are the CC0 Quaternius "Universal Base Characters" (male and female, rigged, about 13k triangles) with the "Universal Animation Library". The Standard (free) packs are in `assets/models/`; the raw zips are git-ignored in `assets/downloads/`.

- The bodies come unclothed and built like superheroes. `prepareBody` relaxes the mesh once (Laplacian smoothing across UV seams, see `weldOf` and `relax`) so the muscle definition is gone, and measures the torso's outline (`measure`).
- `shaped()` then builds the clothed silhouette per look: a shirt that hangs from the chest (the waist is filled in), a gut for `bulk` above 1, trouser legs as tubes, shoes with a toe box, and the head reshaped by `face: { jaw, cheeks, chin, neck, nose }` (`morphHead`). Normals are recomputed across seams.
- **Clothing and faces are painted into the texture.** `bake()` records, for every texel, its position on the relaxed body and which bones move it. `paint()` then decides per texel what covers it (shirt, jacket with lapels, collar, belt, trousers with crease and pockets, shoes, hairline, stubble, beard, age lines). Paint measures across the widened torso, so stripes and edges stay straight. A look is a plain options object; see the comment above `makeHuman` and the `LOOKS` table.
- Hair meshes use their grey shading texture tinted by the hair colour; `hairSides` gives a second colour at the temples (Paulie's wings). There is a beard mesh (`beardMesh`) and glasses (`glasses: 'clear' | 'shades'`), all riding on the head bone. `head` scales the head.
- Animation clips keep only bone rotations plus scaled hip translation, because the library's translations carry a different skeleton's proportions.
- The library's idle is a combat stance and it only sits on the ground, so `idle` (standing) and `sit` (in a chair) are **posed in code** in `prepareBody`.
- A character is `{ group, set(state, speed) }` with states `idle | talk | walk | run | sprint | sit | down`. `updatePeople(dt, cameraPosition)` advances all mixers.
- The model `.gltf` files were edited to drop normal and roughness texture slots (those textures are not shipped).

### Story tools (`src/missions.js`)

- `actor()` puts a character in the world for a scene, `talk()` runs lines with gestures, `cut()` fades out, rearranges and fades in, `frame()` and `shot()` hold the camera, `reach()` waits for the player at a marker (optionally by car or on foot), `follower()` makes someone walk with the player and ride along, `therapy()` runs a session in the office set, `explode()` is the Vesuvio blast.
- `main.js` provides `g.setNight(k)` (0 sunset, 1 night: lights, fog, sky and sea follow), `g.setPlayer(human)` (mission 5 is played as Christopher), `g.spawnCar()` and `g.removeCar()`.
- `EPISODES` lists the missions per episode; the save counts missions across all of them. `careful()` is the three-crashes-and-start-again drive, `bingRoom()` plays a scene inside the Bing, `smoke()` is a column of smoke, `homeAsTony()` ends a mission played as someone else.
- `entities.js` has a box truck (`kind: 'truck'`), `roam()` to send any car out as traffic, and `car.repaint()`.
- The rest of the cast is in `LOOKS` in `people.js`: Carmela, Meadow, AJ, Livia, Junior, Artie, Emil Kolar, Mahaffey; and for episode two Brendan, Jackie, Georgie, Mr. Miller, a trucker, Eddie, Perrilyn and Fanny.

### The city (`src/world.js`)

- All textures are drawn in code on canvases: road markings (one repeat per city cell), sidewalk pavers, brick, siding, shingles, four building fronts (`deco`, `balcony`, `stucco`, `office`) and a strip of shopfronts. Lit windows are repeated in an emissive map so they glow in the shade.
- Static geometry is collected per material with `put()` and merged into one mesh each at the end, so the whole city is a handful of draw calls. Per-piece colour is a vertex colour. Helpers: `slab`, `flat`, `post`, `ball`, `gable`, `hip`, `windowAt`.
- Signs share one 2048 px atlas (`sign()`); identical signs share a slot. Neon and lamps get additive halos drawn as points (`halo()`), and street lamps a pool of light on the ground.
- The Bada Bing is modelled on the bar the show filmed at (Satin Dolls, Route 17, Lodi): a low brick club with a shingled mansard and a canopied door, a white clapboard block behind, a car park at road level and a pylon sign by the road. The owner asked for this in place of the earlier pink club front. `places.bing.parking` lists bays where `main.js` parks cars.
- Story landmarks: Vesuvio (built `apart()` from the merged city so it can swap to its ruin: `places.vesuvio.burn()`), Livia's street, Green Grove, F-Note Records (Hesh's label), the Kolar Bros. yard, Comley Trucking, Bonpensiero Bros. Auto Body, Verbum Dei School, the Bean Scene coffee bar, the inside of the Bing (`buildBingRoom`, a set at y = -200 like the office), the marsh on the west shore, and a pier (`piers` in `grid.js` lets the player walk out past the island's edge).

## State of the game

Working and verified by script (see "Testing"):

- Title screen, city, on-foot movement, entering and driving any car, traffic, pedestrians, radar and HUD.
- **All of episode one** (the pilot's plot, with dialogue written for the game), as eight missions in `src/missions.js`:
  1. "The Ducks": AJ's birthday, the ducks fly off, panic attack, first session with Dr. Melfi.
  2. "Collections": chase Mahaffey on the beach; Christopher brings up the Kolars and Triborough Towers.
  3. "Family Business": Uncle Junior, on the terrace at Vesuvio, plans to kill Little Pussy Malanga there.
  4. "Green Grove": drive Livia to the retirement community, walk her round the gardens, second panic attack, therapy.
  5. "Garbage": at night, played as Christopher. Emil Kolar at Satriale's back door (the camera looks away), then drive the body with Big Pussy without crashing (three hard hits spring the trunk) to the Kolar yard and on to the marsh.
  6. "Insurance": Artie turns down the cruise tickets; at night, drive Silvio to Vesuvio, set the charge at the kitchen door and get 38 m clear in 15 seconds. The restaurant stays a ruin afterwards.
  7. "Second Opinion": Hesh's scheme at F-Note Records; pick up Mahaffey and walk him to the end of the pier. $5,000.
  8. "The Party": AJ's party again: the grill, telling Carmela about therapy, Christopher's sulk and his Hollywood idea, Junior and Livia at the kerb, the final session.
- **All of episode two, "46 Long"**, as seven more missions:
  1. "The Back Room": the crew counts the week's money inside the Bing; Jackie Aprile is in the hospital.
  2. "Hijack": at night, played as Christopher with Brendan. Stop the Comley truck (ram it three times, block it, or climb into the cab), then drive it to the Bing.
  3. "The Sit-Down": Junior and Jackie at Satriale's; restitution of fifteen thousand; Tony lays down the law to Christopher and Brendan. $4,000.
  4. "Mr. Miller's Car": played as Big Pussy with Paulie. The coffee bar, the chop spot on the beach, take a lookalike sedan, respray it, deliver it to the school without denting it.
  5. "Kitchen Fire": race to Livia's (80 seconds; being late only changes her first line), the housekeeper, Fanny and the car, then drive Livia to Green Grove.
  6. "46 Long": Brendan's second truck and the dead driver; the crew helps itself to suits; drive the truck back to Comley; Tony packs up his mother's house and collapses.
  7. "Closing Time": the session where Dr. Melfi says "hatred", and Georgie and the telephone at the Bing.
- Progress saves after every mission (`localStorage`, key `sopranos-vice.save`: the next mission's index and the cash). The title screen then offers Continue and New game.

Not verified:

- **Real-time feel and frame rate.** The browser pane was in the background during development, so the game was only ever stepped by script. Frame rate with about 40 skinned characters is unmeasured on the owner's machine (2019 15-inch MacBook Pro, Radeon Pro 560X). If it is slow, reduce the pedestrian count in `main.js` first.
- Mouse pointer-lock camera, and the panic-attack blur and sway.
- Catching Mahaffey on foot (only the car path was run).

Known rough edges:

- Collars, lapels and hems are still paint, not geometry.
- Everyone shares the base model's facial features; likeness comes from head shape, hair, whiskers, age lines, build and wardrobe. Nobody's face is copied from a photo.
- Only three hair meshes exist (parted, buzzed, long), stretched per character. Hesh's balding head is painted on the scalp.
- The standing pose is still a frame of the walk cycle, so arms hang a little wide.
- Cars have no interiors or drivers; the glass is opaque.
- No health, combat, wanted level or sound yet. The save holds only the mission number and money.
- Passengers and followers simply vanish into the car and reappear beside it; nobody is seen through the glass.
- Story scenes are staged outdoors, apart from two interior sets: the therapy office and the inside of the Bing.
- Traffic lights are decoration; traffic does not obey them.

## Suggested next steps

1. Have the owner play it and report frame rate and feel; tune car handling and camera from that.
2. Further quality: CC0 car and building model packs would beat what code can build (ask before downloading); a night setting with the neon doing the lighting.
3. Wanted level, health and basic combat (the animation library has punch and pistol clips).
4. Episode three ("Denial, Anger, Acceptance") and onward; interiors for Satriale's and the Soprano kitchen would let more scenes move indoors.

## Testing

`window.game` is exposed (`game.renderer` too). `game.step(dt)` advances the simulation one tick and `game.skipRender = true` skips drawing, which allows fast-forwarding from the console. Because mission scripts are promise-based, yield between steps (`await Promise.resolve()`), and dispatch `Enter` keydown events to skip dialogue. `game.keys.KeyW = true` holds a key. This is how the whole episode was run end to end: move the player or their car to `game.markers[0]` whenever one exists, enter a car when the objective says so. To start at a given mission, set the save (`localStorage['sopranos-vice.save'] = '{"mission":4,"cash":0}'`) and reload. For looking at things, set `game.cam.fixed = { pos, look }` and step once.
