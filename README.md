# The Sopranos: Vice City

A GTA-style open-world fan game that runs in the browser (Three.js): Tony Soprano's story, set in an 80s Miami-style city.

Unofficial fan project for personal use. Not affiliated with HBO or Rockstar Games.

## Run

Any static file server works:

```bash
python3 -m http.server 8137
```

Then open http://localhost:8137.

## Controls

WASD move / drive · Mouse look · Shift run · F enter / exit car · Space handbrake · Enter skip dialogue

## Layout

- `src/main.js`: game loop, input, camera
- `src/world.js`: the city and its landmarks
- `src/people.js`: characters and the crew's outfits
- `src/entities.js`: cars, traffic, pedestrians
- `src/missions.js`: the story, written as async scripts
- `assets/models/`: character model and animations

## Credits

Character model and animations: [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) and [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) by Quaternius (CC0).
