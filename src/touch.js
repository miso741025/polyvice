// Phone and tablet controls: a stick under the left thumb, the camera under the right, and buttons for the keys.
// Only on touch screens (or with ?touch=1 in the address). Every button presses the same key the keyboard would,
// through g.touchKey(code, down), so missions, side jobs and the studio's test bot see one game.
export const TOUCH = /[?&]touch=1\b/.test(location.search) || matchMedia('(hover: none) and (pointer: coarse)').matches;

// What each button is, where it sits (a class in style.css) and the key it holds down while touched.
const BUTTONS = [
  { id: 'tF', label: 'F', sub: 'car · door', key: 'KeyF' },
  { id: 'tE', label: 'Hit', key: 'KeyE', hold: true },
  { id: 'tJump', label: 'Jump', sub: 'brake', key: 'Space', hold: true },
  { id: 'tRun', label: 'Run', key: 'ShiftLeft', hold: true },
  { id: 'tQ', label: 'Lock', key: 'KeyQ' },
  { id: 'tGun', label: 'Gun', gun: true },
  { id: 'tR', label: 'R', key: 'KeyR' },
  { id: 'tG', label: 'Jobs', key: 'KeyG' },
  { id: 'tSkip', label: 'Skip ▸', key: 'Enter' },
  { id: 'tMap', label: 'Map', key: 'KeyM' },
  { id: 'tMenu', label: '☰', key: 'Escape' },
];
const ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'rifle'];

export function installTouch(g, canvas) {
  if (!TOUCH) return () => {};
  document.body.classList.add('touch');
  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.innerHTML = '<div id="tStick"><div id="tKnob"></div></div>' +
    BUTTONS.map(b => `<button id="${b.id}" class="tb" type="button">${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</button>`).join('');
  document.body.appendChild(pad);

  // Nothing on the page scrolls, zooms or selects under a thumb.
  for (const el of [document.documentElement, document.body, canvas, pad]) el.style.touchAction = 'none';
  const stop = e => { if (e.touches?.length > 1 || e.type === 'gesturestart') e.preventDefault(); };
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('touchmove', e => { if (!e.target.closest?.('#menu')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

  // The stick: it appears where the left thumb lands and reads up to 56 px of push. g.stick is -1..1 each way, y down.
  const stick = pad.querySelector('#tStick'), knob = pad.querySelector('#tKnob'), R = 56;
  g.stick = { x: 0, y: 0, on: false };
  let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
  const moveStick = (x, y) => {
    let dx = x - sx, dy = y - sy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.hypot(dx, dy) / R < 0.15 ? 0 : 1; // a small dead zone in the middle
    g.stick.x = k * dx / R; g.stick.y = k * dy / R;
  };
  // Touches that land on the open game (not a button, not a menu): left of 42% steer, the rest turn the camera.
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.42 && stickId === null) {
        stickId = t.identifier; sx = t.clientX; sy = t.clientY; g.stick.on = true;
        stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.classList.add('on'); moveStick(sx, sy);
      } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) moveStick(t.clientX, t.clientY);
      else if (t.identifier === lookId && !g.paused) {
        g.cam.yaw -= (t.clientX - lx) * 0.0065; // a phone is narrow: a thumb's sweep across it turns the camera about half round
        g.cam.pitch = Math.max(-0.05, Math.min(1.1, g.cam.pitch + (t.clientY - ly) * 0.005));
        g.cam.lastMouse = g.time; lx = t.clientX; ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; g.stick.x = g.stick.y = 0; g.stick.on = false; stick.classList.remove('on'); knob.style.transform = ''; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);

  // The buttons. A tap is a key press; the ones marked `hold` stay down while the thumb does.
  for (const b of BUTTONS) {
    const el = pad.querySelector('#' + b.id);
    const down = e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('down');
      if (b.gun) { // the next weapon he has, round to fists
        const p = g.player, have = ORDER.filter(w => w === 'fist' || p.weapons?.[w]), next = have[(have.indexOf(p.weapon) + 1) % have.length] || 'fist';
        g.touchKey('Digit' + (ORDER.indexOf(next) + 1), true); g.touchKey('Digit' + (ORDER.indexOf(next) + 1), false);
        return;
      }
      if (g.hud.onMenu && b.key === 'Escape') { g.hud.onMenu('Escape'); return; } // the menu button also closes the menu
      g.touchKey(b.key, true);
      if (!b.hold) setTimeout(() => g.touchKey(b.key, false), 60);
    };
    const up = e => { el.classList.remove('down'); if (b.hold) g.touchKey(b.key, false); e.preventDefault(); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
  }

  // What the buttons say follows what he is doing: in a car, Jump is the handbrake and Hit is not offered. Called every frame.
  const subtitle = document.getElementById('subtitle');
  return () => {
    pad.classList.toggle('car', !!g.player.car);
    pad.classList.toggle('play', g.started && !g.hud.onMenu);
    pad.classList.toggle('talking', !!subtitle?.textContent.trim());
  };
}
