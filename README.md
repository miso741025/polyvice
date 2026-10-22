# polyvice

A PS2-era open-world game that runs in the browser (Three.js, no build step): the look and feel of the open-world games of the early 2000s, flat-shaded and chunky, with a city you can drive, walk and fly through. Story missions, driving, fist fights and gunfights, police chases, side jobs, and on one world a spinner that flies. One engine; the worlds and stories keep being added. So far:

- **Port Paloma** – *Cannoli Coast*, an original crime comedy in a pastel seaside city: Nico Bellacosta, his family, his crew, his therapist and his flamingos. This is the world published on the web (see `tools/build-web.mjs`).
- **Los Angeles** (`?city=la`) – the story of *Heat*, played as Neil McCauley.
- **Nexus** (`?city=nexus`) – a rain-soaked planet seen hanging in Vice City's sky; *Blade Runner 2049* played as K, and (`&story=2019`) the first *Blade Runner* played as Deckard, in the same city thirty years earlier.

*Cannoli Coast* (Port Paloma) has its own characters and places, and its story is being reworked into its own. The other two worlds are an **unofficial, non-commercial fan project**, kept for local play only and not published. It is not affiliated with, endorsed by or connected to HBO, Warner Bros., Alcon Entertainment, Rockstar Games or anyone else who owns the works it is a tribute to. The stories follow the plots of those works, but every line of dialogue is written for the game; no footage, music, artwork or other media from them is included. Characters are generic figures in the right clothes, not likenesses of any actor. If you are a rights holder and want something changed or removed, open an issue.

## Run

```bash
python3 serve.py
```

Then open http://localhost:8137. The title screen switches between the worlds. The bundled server tells the browser not to cache, which matters because the game is plain ES modules: a plain `python3 -m http.server` works too, but after an update the browser can mix old and new files and hang on "Loading…" (a hard reload, Cmd+Shift+R, fixes that).

The car radio plays your own files from `music/` and the city can use your own field recordings from `sounds/` (see the READMEs there). Neither folder is committed.

## Web build

```bash
ESBUILD=<path to an esbuild package> node tools/build-web.mjs
```

writes `dist/vice/`: Port Paloma alone, minified, with lighter textures and only the animations the game plays. Phones get touch controls and a lighter detail level automatically (`?quality=low` / `?quality=high` override it; `?touch=1` shows the touch controls on a desktop).

## Controls

WASD move / drive · Mouse look · Shift run (in a spinner: climb; Ctrl sinks) · Space jump / handbrake · F enter / take a car, use doors · G side jobs · H horn · Right click or Q lock on · Click or E attack · 1–5 weapon · R reload · M map · N / B / V radio · Esc settings · Enter skip a line

## Layout

- `src/main.js` – game loop, input, camera, lights
- `src/world.js` – the cities: blocks, landmarks, rooms, sky, weather
- `src/people.js` – characters: bodies, painted clothing, hair, coats
- `src/entities.js` – cars (including the spinner that flies), traffic, pedestrians
- `src/missions.js` – helpers for staging scenes, and the Vice City story
- `src/heat.js`, `src/nexus.js`, `src/bladerunner.js` – the other stories
- `src/combat.js` – fists, guns, health, the police
- `src/sidejobs.js` – what there is to do between missions
- `src/audio.js` – all sound, synthesised
- `lineup.html` – renders character sheets (front / side / back) to `shots/`
- `assets/models/` – character models and animations

## Credits

- Character models and animations: [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) and [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) by Quaternius, CC0.
- [three.js](https://threejs.org/) (MIT), loaded from a CDN.
- Fonts from Google Fonts (Bebas Neue, Mr Dafoe, Rubik), under the Open Font License.

Code and text: MIT (see `LICENSE`).
