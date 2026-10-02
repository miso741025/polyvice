# Handoff

Written 2026-10-02 for the next agent picking this project up. Read this before changing anything.

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

- `src/grid.js`: city layout constants, the collider list, `pushOut` collision.
- `src/world.js`: ground, buildings, palms, landmarks (Tony's house and pool, Dr. Melfi's office, the Bada Bing, Satriale's), the therapy-room interior set (hidden at y = -200), sky. Returns `places`, which missions use for positions.
- `src/people.js`: characters. See below.
- `src/entities.js`: cars, car physics, traffic AI, pedestrians, ducks.
- `src/missions.js`: the story as plain async functions; each `await` waits on the game loop.
- `src/hud.js`: money, clock, radar, subtitles, cards, fades.
- `src/main.js`: boot, input, player, camera, the frame loop.

### Characters (`src/people.js`)

Bodies are the CC0 Quaternius "Universal Base Characters" (male and female, rigged, about 13k triangles) with the "Universal Animation Library". The Standard (free) packs are in `assets/models/`; the raw zips are git-ignored in `assets/downloads/`.

- The bodies come unclothed, so **clothing is painted into the texture**. `bake()` records, for every texel, its position on the bind-pose body and which bones move it. `paint()` then decides per texel what covers it (shirt, open jacket, collar, belt, trousers, shoes, hairline, tracksuit stripes, prints). A look is a plain options object; see the comment above `makeHuman` and the `LOOKS` table.
- `shaped()` reshapes the bind-pose mesh per build (`bulk`): belly, thicker limbs, looser trousers, shoe bulk.
- Animation clips keep only bone rotations plus scaled hip translation, because the library's translations carry a different skeleton's proportions.
- The library's idle is a combat stance and it only sits on the ground, so `idle` (standing) and `sit` (in a chair) are **posed in code** in `prepareBody`.
- A character is `{ group, set(state, speed) }` with states `idle | talk | walk | run | sprint | sit | down`. `updatePeople(dt, cameraPosition)` advances all mixers.
- The model `.gltf` files were edited to drop normal and roughness texture slots (those textures are not shipped).

## State of the game

Working and verified by script (see "Testing"):

- Title screen, city, on-foot movement, entering and driving any car, traffic, pedestrians, radar and HUD.
- Mission 1 "The Ducks": pool, ducks fly off, panic attack, drive to Dr. Melfi, therapy scene.
- Mission 2 "Collections": Christopher's call, chase Mahaffey on the beach, $1,000 reward.

Not verified:

- **Real-time feel and frame rate.** The browser pane was in the background during development, so the game was only ever stepped by script. Frame rate with about 40 skinned characters is unmeasured on the owner's machine (2019 15-inch MacBook Pro, Radeon Pro 560X). If it is slow, reduce the pedestrian count in `main.js` first.
- Mouse pointer-lock camera, and the panic-attack blur and sway.
- Catching Mahaffey on foot (only the car path was run).

Known rough edges:

- Clothes are painted on, so they follow the body's muscles; jackets have no real lapels or volume.
- Faces are the base model's generic face for everyone. Characters differ by hair, build and wardrobe only.
- Only three hair meshes exist (parted, buzzed, long). Tony's receding hair and Hesh's balding head are painted on the scalp.
- The player's feet sink about 0.14 into sidewalks (the player walks at y = 0, sidewalks are 0.14 high).
- No health, combat, wanted level, sound or save system yet.
- World buildings are still flat-coloured boxes with a window texture; the Bada Bing front was restyled after the reference image.

## Suggested next steps

1. Have the owner play it and report frame rate and feel; tune car handling and camera from that.
2. World quality pass toward Vice City: textured roads, sidewalks and facades (Artlist image generation is approved, quote first), streetlights, a night or dusk lighting setup with neon.
3. Wanted level, health and basic combat (the animation library has punch and pistol clips).
4. Hesh's record label as a landmark; more of the crew as characters in missions; continue the storyline from season 1.

## Testing

`window.game` is exposed. `game.step(dt)` advances the simulation one tick and `game.skipRender = true` skips drawing, which allows fast-forwarding from the console. Because mission scripts are promise-based, yield between steps (`await Promise.resolve()`), and dispatch `Enter` keydown events to skip dialogue. `game.keys.KeyW = true` holds a key. This is how both missions were run end to end.
