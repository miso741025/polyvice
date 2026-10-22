// Phone and tablet controls: a stick under the left thumb, the camera under the right, and a few buttons that show
// only when they can be used. Only on touch screens (or with ?touch=1 in the address). Every button presses the key
// the keyboard would, through g.touchKey(code, down), so missions, side jobs and the studio's test bot see one game.
// The game is played sideways. A phone held upright draws the whole page turned a quarter, top of the game to the left,
// so it is sideways at once and the player only has to turn the phone (it works with an iPhone's rotation lock on).
export const TOUCH = /[?&]touch=1\b/.test(location.search) || matchMedia('(hover: none) and (pointer: coarse)').matches;

// Upright or not, and the size the game sees: the turned page is the screen's height wide and its width tall.
// Called on every resize (main.js) before the renderer is sized.
export let ROT = false;
export function applyRotation() {
  ROT = TOUCH && innerHeight > innerWidth;
  const b = document.body, W = ROT ? innerHeight : innerWidth, H = ROT ? innerWidth : innerHeight;
  b.classList.toggle('rot', ROT);
  Object.assign(b.style, ROT ? { width: W + 'px', height: H + 'px', transform: `translateY(${innerHeight}px) rotate(-90deg)` } : { width: '', height: '', transform: '' });
  document.documentElement.style.setProperty('--vw', ROT ? W / 100 + 'px' : '1vw');
  document.documentElement.style.setProperty('--vh', ROT ? H / 100 + 'px' : '1vh');
  return [W, H];
}
// A touch on the screen, in the game's own coordinates (the page may be drawn turned).
const at = t => (ROT ? { x: innerHeight - t.clientY, y: t.clientX } : { x: t.clientX, y: t.clientY });

// What each button is. `key` is held down while the thumb is on it (a tap is a short press).
// The ACTION button has no key of its own: it presses whatever the game is offering right now (see offer() below).
const BUTTONS = [
  { id: 'tAct', label: 'Action', act: true },
  { id: 'tE', label: 'Hit', key: 'KeyE' },
  { id: 'tJump', label: 'Jump', key: 'Space' },
  { id: 'tQ', label: 'Lock', key: 'KeyQ' },
  { id: 'tGun', label: 'Gun', gun: true },
  { id: 'tSkip', label: 'Skip ▸', key: 'Enter' },
  { id: 'tMap', label: 'Map', key: 'KeyM' },
  { id: 'tMenu', label: '☰', key: 'Escape' },
];
const ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'rifle'];
const SPRINT = 0.85; // the stick pushed past this much of its reach runs (Shift on a keyboard)

export function installTouch(g, canvas) {
  if (!TOUCH) return () => {};
  document.body.classList.add('touch');
  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.innerHTML = '<div id="tStick"><div id="tKnob"></div></div>' +
    BUTTONS.map(b => `<button id="${b.id}" class="tb" type="button"><span>${b.label}</span></button>`).join('');
  document.body.appendChild(pad);
  const turn = document.createElement('div');
  turn.id = 'turn';
  turn.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="20" width="44" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M14 12a22 22 0 0 1 30-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M40 4l5 6-7 3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>Turn your phone sideways · 把手機轉橫來玩</span>`;
  document.body.appendChild(turn);

  // Nothing on the page scrolls, zooms or selects under a thumb.
  for (const el of [document.documentElement, document.body, canvas, pad]) el.style.touchAction = 'none';
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (!e.target.closest?.('#menu')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

  // The first tap asks for the whole screen, turned sideways, where the browser allows it (Android Chrome does;
  // an iPhone does neither, and the "turn me" card covers it there).
  const landscape = () => {
    const el = document.documentElement, full = el.requestFullscreen || el.webkitRequestFullscreen;
    const lock = () => screen.orientation?.lock?.('landscape').catch(() => {});
    if (full && !document.fullscreenElement) Promise.resolve(full.call(el, { navigationUI: 'hide' })).then(lock).catch(() => {});
    else lock();
  };
  document.addEventListener('touchend', landscape, { once: true, capture: true });

  // The stick: it appears where the left thumb lands and reads up to 56 px of push. g.stick is -1..1 each way, y down.
  // Pushed to the rim it runs: g.stick.run, and the ring lights up.
  const stick = pad.querySelector('#tStick'), knob = pad.querySelector('#tKnob'), R = 56;
  g.stick = { x: 0, y: 0, on: false, run: false };
  let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
  const moveStick = (x, y) => {
    let dx = x - sx, dy = y - sy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy) / R, k = m < 0.15 ? 0 : 1; // a small dead zone in the middle
    g.stick.x = k * dx / R; g.stick.y = k * dy / R; g.stick.run = m > SPRINT;
    stick.classList.toggle('run', g.stick.run && !g.player.car);
  };
  // Thumbs that land on the open game (not a button, not a menu): left of 42% steer, the rest turn the camera.
  // Pointer events, captured by the canvas: on a page drawn turned, Chrome did not always pass touch listeners the thumb's moves.
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const W = ROT ? innerHeight : innerWidth, { x, y } = at(e);
    if (x < W * 0.42 && stickId === null) {
      stickId = e.pointerId; sx = x; sy = y; g.stick.on = true;
      stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.classList.add('on'); moveStick(sx, sy);
    } else if (lookId === null) { lookId = e.pointerId; lx = x; ly = y; } else return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the moves still arrive */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId && e.pointerId !== lookId) return;
    const { x, y } = at(e);
    if (e.pointerId === stickId) moveStick(x, y);
    else if (!g.paused) {
      g.cam.yaw -= (x - lx) * 0.0055;
      g.cam.pitch = Math.max(-0.05, Math.min(1.1, g.cam.pitch + (y - ly) * 0.005));
      g.cam.lastMouse = g.time; lx = x; ly = y;
    }
  });
  const end = e => {
    if (e.pointerId === stickId) { stickId = null; Object.assign(g.stick, { x: 0, y: 0, on: false, run: false }); stick.classList.remove('on', 'run'); knob.style.transform = ''; }
    if (e.pointerId === lookId) lookId = null;
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(t, end);
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); // (no page scroll, no pretend mouse clicks)

  // What the ACTION button would press now, and what it says: whatever the game has put on screen for a key.
  const $ = id => document.getElementById(id);
  const prompt = $('prompt'), objective = $('objective'), subtitle = $('subtitle');
  const WORDS = { KeyF: 'Use', KeyR: 'Fix', KeyG: 'Do it', Enter: 'Begin' };
  let action = null;
  const offer = () => {
    const pr = prompt.textContent.trim(), obj = objective.innerHTML, p = g.player;
    const m = pr.match(/^([FRG])\s+·\s+([^($:]+)/);                                        // "F  ·  Enter vehicle", "R  ·  Respray: …", "G  ·  Collect your end ($…)"
    if (m) return { key: 'Key' + m[1], label: m[2].trim().split(/\s+/).slice(0, 2).join(' ') };
    if (/[Pp]ress <b>Enter<\/b> to begin/.test(obj)) return { key: 'Enter', label: 'Begin' };
    if (/press <b>F<\/b>/.test(obj)) return { key: 'KeyF', label: (obj.replace(/<[^>]+>/g, '').match(/^([^:.]{1,18})[:.]/)?.[1] || 'Use').trim() };
    if (p.car && !p.locked && Math.abs(p.car.speed) < 4) return { key: 'KeyF', label: 'Get out' };
    return null;
  };
  // Hit (or Shoot) when there is somebody to fight, a gun in his hand, or the objective asks for it.
  const fighting = () => {
    const p = g.player, obj = objective.innerHTML;
    return !p.car && !p.locked && ((g.hostiles?.length || 0) > 0 || !!g.lockTarget || (p.weapon && p.weapon !== 'fist') || /<b>E<\/b>|press E|<b>Click<\/b>/.test(obj));
  };

  // The buttons. Each holds its key down while the thumb is on it.
  const els = {};
  for (const b of BUTTONS) {
    const el = els[b.id] = pad.querySelector('#' + b.id);
    let held = null;
    const down = e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('down');
      if (b.gun) { // the next weapon he has, round to fists
        const p = g.player, have = ORDER.filter(w => w === 'fist' || p.weapons?.[w]), next = have[(have.indexOf(p.weapon) + 1) % have.length] || 'fist';
        g.touchKey('Digit' + (ORDER.indexOf(next) + 1), true); g.touchKey('Digit' + (ORDER.indexOf(next) + 1), false);
        return;
      }
      if (g.hud.onMenu && b.key === 'Escape') { g.hud.onMenu('Escape'); return; } // the menu button also closes the menu
      held = b.act ? action?.key : b.key;
      if (held) g.touchKey(held, true);
    };
    const up = e => { e.preventDefault(); el.classList.remove('down'); if (held) setTimeout(k => g.touchKey(k, false), 40, held); held = null; };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
  }

  // Every frame: which buttons are worth showing and what they say; and, while the page is drawn turned, a hint for a few seconds.
  let wasRot = false, hintUntil = 0;
  const set = (id, on, label) => { const el = els[id]; el.hidden = !on; if (label && el.firstChild.textContent !== label) el.firstChild.textContent = label; };
  return () => {
    const p = g.player, car = !!p.car, now = performance.now();
    if (ROT && !wasRot) hintUntil = now + 3200;
    wasRot = ROT;
    turn.classList.toggle('on', ROT && now < hintUntil);
    pad.classList.toggle('play', g.started && !g.hud.onMenu);
    pad.classList.toggle('car', car);
    pad.classList.toggle('talking', !!subtitle.textContent.trim());
    action = offer();
    set('tAct', !!action, action?.label);
    const fight = fighting();
    set('tE', fight, p.weapon && p.weapon !== 'fist' ? 'Shoot' : /Photograph/.test(objective.textContent) ? 'Snap' : 'Hit');
    set('tQ', fight && (g.hostiles?.length || 0) > 0);
    set('tGun', !car && ORDER.filter(w => w !== 'fist' && p.weapons?.[w]).length > 0);
    set('tJump', !p.locked, car ? 'Brake' : 'Jump');
    if (stick.classList.contains('run') && car) stick.classList.remove('run');
  };
}
