// How much the device is asked to carry. Phones and tablets get the light version: fewer pixels, cheaper shadows, a
// nearer haze, a thinner crowd, and smaller painted textures (an iPhone's Safari gives a page about 384 MB of canvas
// memory, and the full set of character and sign textures came to more than that). ?quality=low / ?quality=high in
// the address, or the Detail line in the settings, overrides the guess.
// If the last visit ended while the player was indoors and never got back out (iOS killing the tab is the usual
// reason), this visit starts in the extra-light version, so a phone that cannot cope does not crash the same way again.
import { TOUCH } from './touch.js';

export const DETAIL_KEY = 'cannoli-coast.detail', CRASH_KEY = 'cannoli-coast.indoors';
// The release number, for the anonymous play statistics: tools/build-web.mjs writes it in (VICE_VERSION); 'dev' when run from source.
export const RELEASE = 'dev';
const stored = k => { try { return localStorage.getItem(k); } catch { return null; } };
const asked = new URLSearchParams(location.search).get('quality') || stored(DETAIL_KEY);
export const LIGHT = asked === 'low' || (asked !== 'high' && TOUCH);
export const EXTRA_LIGHT = LIGHT && stored(CRASH_KEY) === '1';
// Painted character textures, per look, and the largest a world texture may be.
export const PEOPLE_MAP = EXTRA_LIGHT ? 256 : LIGHT ? 512 : 1024;
export const WORLD_MAP = EXTRA_LIGHT ? 512 : LIGHT ? 1024 : 4096;

// Indoors marks the visit; coming back out (or leaving the page normally) clears the mark.
export function markIndoors(on) { try { if (on) localStorage.setItem(CRASH_KEY, '1'); else localStorage.removeItem(CRASH_KEY); } catch { /* no storage: no guard */ } }
addEventListener('pagehide', () => markIndoors(false));
