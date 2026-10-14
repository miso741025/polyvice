// The game has no sound (owner, 2026-10-15: "take the sound out of the game").
// Nothing here makes a noise: there is no AudioContext and no <audio>. Every call the game makes is accepted and does nothing.
// The old synthesiser is kept, unused, in audio-synth.js; to bring sound back, import { sfx } from './audio-synth.js' in main.js.
const quiet = () => {};
const radio = { count: 0, title: '', tracks: [], onChange: null, load: async () => 0, next: quiet, toggle: () => false, volume: quiet, heard: quiet };
export const sfx = new Proxy({ state: 'off', radio, cue: () => null, loadRecordings: async () => [], meter: () => ({ state: 'none', peak: 0, rms: 0 }) }, {
  get: (o, k) => (k in o ? o[k] : quiet),
});
