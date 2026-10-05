# The Sopranos: Vice City

A GTA-style open-world fan game that runs in the browser (Three.js): Tony Soprano's story, set in an 80s Miami-style city.

Unofficial fan project for personal use. Not affiliated with HBO or Rockstar Games.

## Run

Use the bundled server, which stops the browser caching old files (a plain `python3 -m http.server` works too, but after an update the browser may mix old and new files and hang on "Loading…"; a hard reload, Cmd+Shift+R, fixes that):

```bash
python3 serve.py
```

Then open http://localhost:8137 for Vice City (The Sopranos), or http://localhost:8137/?city=la for Los Angeles (Heat). The title screen has a button to switch.

## Controls

WASD move / drive · Mouse look · Shift run · Space jump / handbrake · F enter / take car, use doors · G shake down a register · H horn · Right click or Q lock on · Click or E attack (hold for the SMG) · 1–4 weapon · R reload · M map · Esc settings · Enter skip dialogue

## Layout

- `src/main.js`: game loop, input, camera
- `src/world.js`: the city and its landmarks
- `src/people.js`: characters and the crew's outfits
- `src/entities.js`: cars, traffic, pedestrians
- `src/missions.js`: the story (episodes one to six, forty-one missions), written as async scripts
- `src/heat.js`: the Los Angeles story (Heat, chapters one to three)
- `src/combat.js`: fists, the pistol, lock-on, health, the wanted level and the police
- `src/sidejobs.js`: shakedowns, food, armour, confession and the motel, between missions
- `src/audio.js`: all the sound, synthesised
- `assets/models/`: character model and animations

## Credits

Character model and animations: [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) and [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) by Quaternius (CC0).
