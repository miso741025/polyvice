# polyvice

A GTA-style open-world game that runs in the browser (Three.js, no build step). One engine, three worlds, each with its own story written as mission scripts:

- **Vice City** – an 80s Miami-style city; the story follows *The Sopranos*, played as Tony.
- **Los Angeles** (`?city=la`) – the story of *Heat*, played as Neil McCauley.
- **Nexus** (`?city=nexus`) – a rain-soaked planet seen hanging in Vice City's sky; *Blade Runner 2049* played as K, and (`&story=2019`) the first *Blade Runner* played as Deckard, in the same city thirty years earlier.

This is an **unofficial, non-commercial fan project**. It is not affiliated with, endorsed by or connected to HBO, Warner Bros., Alcon Entertainment, Rockstar Games or anyone else who owns the works it is a tribute to. The stories follow the plots of those works, but every line of dialogue is written for the game; no footage, music, artwork or other media from them is included. Characters are generic figures in the right clothes, not likenesses of any actor. If you are a rights holder and want something changed or removed, open an issue.

## Run

```bash
python3 serve.py
```

Then open http://localhost:8137. The title screen switches between the worlds. The bundled server tells the browser not to cache, which matters because the game is plain ES modules: a plain `python3 -m http.server` works too, but after an update the browser can mix old and new files and hang on "Loading…" (a hard reload, Cmd+Shift+R, fixes that).

The car radio plays your own files from `music/` and the city can use your own field recordings from `sounds/` (see the READMEs there). Neither folder is committed.

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
- `HANDOFF.md` – working notes for whoever picks the project up next
- `assets/models/` – character models and animations

## Credits

- Character models and animations: [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) and [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) by Quaternius, CC0.
- [three.js](https://threejs.org/) (MIT), loaded from a CDN.
- Fonts from Google Fonts (Bebas Neue, Mr Dafoe, Rubik), under the Open Font License.

Code and text: MIT (see `LICENSE`).
