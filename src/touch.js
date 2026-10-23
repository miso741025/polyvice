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

// The buttons: an icon and a short word, in the language the site is set to (the 中 / EN switch on the home page).
const ZH = (() => { try { return localStorage.getItem('mm-lang') === 'zh'; } catch { return false; } })();
const say = (en, zh) => (ZH ? zh : en);
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  fist: svg('<path d="M7 11V8a1.5 1.5 0 0 1 3 0v2M10 10V6.5a1.5 1.5 0 0 1 3 0V10M13 10V7.5a1.5 1.5 0 0 1 3 0V11M16 11V9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-1.5A2.5 2.5 0 0 1 6.5 11H10"/>'),
  gun: svg('<path d="M3 8h17v4h-7l-1.5 2.5H9L8 19H4.5l1.2-7H3z"/><path d="M11 12v2.5"/>'),
  camera: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>'),
  jump: svg('<path d="M12 20V5M6 11l6-6 6 6"/>'),
  brake: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 8.5v7M14.5 8.5v7"/>'),
  act: svg('<path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5"/><circle cx="12" cy="12" r="2.5"/>'),
  door: svg('<path d="M5 21V4h11v17M3 21h18M12.5 12.5h.01"/><path d="M16 8h3v13"/>'),
  car: svg('<path d="M4 16v-4l2-5h12l2 5v4z M4 16v2.5M20 16v2.5"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/>'),
  map: svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  skip: svg('<path d="M5 5l8 7-8 7zM16 5v14"/>'),
};
// What each button is. `key` is held down while the thumb is on it (a tap is a short press).
// The ACTION button has no key of its own: it presses whatever the game is offering right now (see offer() below).
const BUTTONS = [
  { id: 'tAct', icon: 'act', label: say('Action', '動作'), act: true },
  { id: 'tE', icon: 'fist', label: say('Punch', '揮拳'), key: 'KeyE' },
  { id: 'tJump', icon: 'jump', label: say('Jump', '跳'), key: 'Space' },
  { id: 'tGun', icon: 'gun', label: say('Draw gun', '拿槍'), gun: true },
  { id: 'tSkip', icon: 'skip', label: say('Skip', '跳過'), key: 'Enter' },
  { id: 'tMap', icon: 'map', label: say('Map', '地圖'), key: 'KeyM' },
  { id: 'tMenu', icon: 'menu', label: say('Menu', '選單'), key: 'Escape' },
];
// What the ACTION button offers, in Chinese when the site is (the game's own prompt words otherwise).
const ACT_ZH = [[/^Enter vehicle|^Take vehicle/, '上車'], [/^Get out/, '下車'], [/^Leave/, '離開'], [/^Begin/, '開始'], [/^Enter\b/, '進去'], [/^Respray/, '噴漆'], [/^Repair/, '修車'],
  [/^Collect/, '收錢'], [/^Take /, '帶她去'], [/^Ask /, '點舞'], [/^Open/, '打開'], [/^Use/, '使用']];
const actWord = (label, key) => (!ZH ? label : (ACT_ZH.find(([re]) => re.test(label))?.[1] || label));
const ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'rifle'];
const SPRINT = 0.85; // the stick pushed past this much of its reach runs (Shift on a keyboard)

export function installTouch(g, canvas) {
  if (!TOUCH) return () => {};
  document.body.classList.add('touch');
  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.innerHTML = '<div id="tStick"><div id="tKnob"></div></div>' +
    BUTTONS.map(b => `<button id="${b.id}" class="tb" type="button"><i>${ICON[b.icon]}</i><span>${b.label}</span></button>`).join('');
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
  const prompt = $('prompt'), objective = $('objective'), subtitle = $('subtitle'), card = $('card');
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
  // The buttons. Each holds its key down while the thumb is on it.
  const els = {};
  let lastGun = null;
  for (const b of BUTTONS) {
    const el = els[b.id] = pad.querySelector('#' + b.id);
    let held = null;
    const down = e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('down');
      if (b.gun) { // fists ↔ a gun: the one he last had out, or the first he owns
        const p = g.player, guns = ORDER.filter(w => w !== 'fist' && p.weapons?.[w]);
        const next = p.weapon && p.weapon !== 'fist' ? 'fist' : guns.includes(lastGun) ? lastGun : guns[0] || 'fist';
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
  const set = (id, on, label, icon) => {
    const el = els[id]; el.hidden = !on;
    if (!on) return;
    if (label && el.lastChild.textContent !== label) el.lastChild.textContent = label;
    if (icon && el.dataset.icon !== icon) { el.dataset.icon = icon; el.firstChild.innerHTML = ICON[icon]; }
  };
  return () => {
    const p = g.player, car = !!p.car, now = performance.now();
    if (ROT && !wasRot) hintUntil = now + 3200;
    wasRot = ROT;
    turn.classList.toggle('on', ROT && now < hintUntil);
    pad.classList.toggle('play', g.started && !g.hud.onMenu);
    pad.classList.toggle('car', car);
    pad.classList.toggle('talking', !!subtitle.textContent.trim() || card.classList.contains('on')); // (a title card can be skipped too)
    action = offer();
    const armed = p.weapon && p.weapon !== 'fist';
    if (armed) lastGun = p.weapon;
    set('tAct', !!action, action && actWord(action.label), !action ? null : action.label === 'Get out' ? 'car' : /^(Enter|Leave)\b/.test(action.label) && action.key === 'KeyF' && !/vehicle/.test(action.label) ? 'door' : /vehicle/.test(action.label) ? 'car' : 'act');
    const snap = /Photograph/.test(objective.textContent);
    set('tE', !car && !p.locked, snap ? say('Snap', '拍照') : armed ? say('Shoot', '射擊') : say('Punch', '揮拳'), snap ? 'camera' : armed ? 'gun' : 'fist');
    set('tGun', !car && !p.locked && !p.fistsOnly && ORDER.some(w => w !== 'fist' && p.weapons?.[w]), armed ? say('Fists', '收槍') : say('Draw gun', '拿槍'), armed ? 'fist' : 'gun');
    set('tJump', !p.locked, car ? say('Brake', '煞車') : say('Jump', '跳'), car ? 'brake' : 'jump');
    if (stick.classList.contains('run') && car) stick.classList.remove('run');
  };
}
