import { CITY, NX, NZ, ROAD, OX, OZ, CELL, nodeX, nodeZ, bounds, SHORE } from './grid.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.ctx = $('radar').getContext('2d');
  }

  show(on) { $('hud').classList.toggle('on', on); }
  health(h) { $('healthFill').style.width = Math.max(0, h) + '%'; $('healthFill').classList.toggle('low', h < 30); }
  armour(a) { $('armourFill').style.width = Math.max(0, a) + '%'; $('armour').classList.toggle('on', a > 0); }
  wanted(n) { $('wanted').innerHTML = '★'.repeat(n) + `<span class="dim">${'★'.repeat(3 - n)}</span>`; $('wanted').classList.toggle('on', n > 0); }
  weapon(name) { $('weapon').textContent = name; }
  ammo(text) { $('ammo').textContent = text || ''; }
  aim(on) { $('aim').classList.toggle('on', on); }
  wasted(on) { $('wasted').classList.toggle('on', on); }
  // The counter, and beside it what just came in or went out: "+$1,000" in green, "-$500" in red, for a few seconds.
  money(n) {
    const el = $('money'), was = this.cash;
    this.cash = n;
    el.textContent = '$' + String(n).padStart(8, '0');
    const gain = $('gain'), diff = n - (was ?? 0);
    if (!gain || !diff) return;
    gain.textContent = (diff > 0 ? '+$' : '-$') + Math.abs(diff).toLocaleString('en-US');
    gain.className = diff > 0 ? 'on' : 'on loss';
    clearTimeout(this.gainTimer);
    this.gainTimer = setTimeout(() => { gain.className = ''; }, 3200);
  }
  clock(seconds, day) {
    const m = (18 * 60 + 30 + Math.floor(seconds)) % 1440;
    $('clock').textContent = (day === undefined ? '' : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][((day % 7) + 7) % 7] + ' ') + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  subtitle(who, text) {
    $('subtitle').innerHTML = !text ? '' : who ? `<span class="who">${who}:</span> ${text}` : `<i>${text}</i>`;
  }
  objective(html) { $('objective').innerHTML = html || ''; if (!html) $('dist').textContent = ''; }
  // How far to the marker and which way, shown beside the objective.
  distance(text) { const el = $('dist'); if (el.textContent !== text) el.textContent = text; }
  // The car he is driving: five pips, fewer as it takes damage. null hides it.
  car(hp) {
    const el = $('carhp'), on = hp !== null && hp < 97;
    if (!on) { if (el.textContent) el.textContent = ''; return; }
    const pips = Math.max(0, Math.ceil(hp / 20)), text = 'CAR ' + '▮'.repeat(pips) + '▯'.repeat(5 - pips);
    if (el.textContent !== text) { el.textContent = text; el.className = hp < 35 ? 'bad' : hp < 60 ? 'worn' : ''; }
  }
  // What he is carrying, for a moment: [{ key, name, has, on, rounds }].
  weapons(list) {
    const el = $('weapons');
    el.innerHTML = list.map(w => `<span class="${w.on ? 'on' : w.has ? '' : 'none'}"><b>${w.key}</b> ${w.name}${w.has && w.rounds !== null ? ` <i>${w.rounds}</i>` : ''}</span>`).join('');
    el.classList.add('on');
    clearTimeout(this.weaponsTimer);
    this.weaponsTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }
  // Somebody new: a name and who he is, low on the screen, the first time he speaks.
  intro(name, role) {
    const el = $('intro');
    el.innerHTML = `<b>${name}</b><span>${role}</span>`;
    el.classList.add('on');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => el.classList.remove('on'), 4200);
  }
  checkpoint() {
    const el = $('intro');
    el.innerHTML = '<b>Checkpoint</b><span>Back to where the trouble started</span>';
    el.classList.add('on');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => el.classList.remove('on'), 3000);
  }
  prompt(text) { if ($('prompt').textContent !== (text || '')) $('prompt').textContent = text || ''; }

  card(title, sub) {
    if (!title) { $('card').classList.remove('on'); return; }
    $('cardTitle').textContent = title; $('cardSub').textContent = sub || '';
    $('card').classList.add('on');
  }
  passed(reward, title, total) {
    if (reward === undefined) { $('passed').classList.remove('on'); return; }
    $('reward').textContent = reward;
    $('earned').textContent = title ? `${title}${total ? `   ·   earned so far $${total.toLocaleString('en-US')}` : ''}` : '';
    $('passed').classList.add('on');
  }

  fade(to, seconds) {
    const el = $('fade');
    el.style.transition = `opacity ${seconds}s linear`;
    el.style.opacity = to;
  }
  // A burst of light that fades out: a gunshot, an explosion.
  flash(color = '#fff', seconds = 0.5) {
    const el = $('flash');
    el.style.transition = 'none'; el.style.background = color; el.style.opacity = 0.95;
    void el.offsetWidth; // restart the transition
    el.style.transition = `opacity ${seconds}s ease-out`; el.style.opacity = 0;
  }
  // A menu of choices: items are { label, hint, key }, keys are what to press. `pick(key)` is called on a choice.
  menu(title, items, pick) {
    const el = $('menu');
    if (!title) { el.classList.remove('on'); this.onMenu = null; return; }
    el.innerHTML = `<h2>${title}</h2>` + items.map(i => !i.key ? `<div class="info">${i.label}<span class="hint">${i.hint || ''}</span></div>` : `<div class="item" data-key="${i.key}"><b>${i.key.replace('Digit', '').replace('Key', '').replace('Escape', 'Esc')}</b> ${i.label}${i.hint ? `<span class="hint">${i.hint}</span>` : ''}</div>`).join('');
    el.classList.add('on');
    this.onMenu = pick;
    for (const d of el.querySelectorAll('.item')) d.onclick = () => pick(d.dataset.key);
  }
  // The city map: the whole island, where things are, and where the player is.
  map(on, { focus, heading, blips = [], landmarks = [] } = {}) {
    const el = $('map');
    el.classList.toggle('on', !!on);
    if (!on) return;
    const c = el.getContext('2d'), W = el.width, H = el.height;
    const sx = (W - 40) / (bounds.maxX - bounds.minX), sz = (H - 40) / (bounds.maxZ - bounds.minZ), k = Math.min(sx, sz);
    const ox = (W - (bounds.maxX - bounds.minX) * k) / 2, oz = (H - (bounds.maxZ - bounds.minZ) * k) / 2;
    const X = x => ox + (x - bounds.minX) * k, Z = z => oz + (z - bounds.minZ) * k;
    c.fillStyle = 'rgba(8, 20, 40, .92)'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1c7f9c'; c.fillRect(X(bounds.minX) - 30, Z(bounds.minZ) - 30, (bounds.maxX - bounds.minX) * k + 60, (bounds.maxZ - bounds.minZ) * k + 60);
    c.fillStyle = '#d9c48f'; c.fillRect(X(bounds.minX), Z(bounds.minZ), (bounds.maxX - bounds.minX) * k, (bounds.maxZ - bounds.minZ) * k);
    c.fillStyle = '#8f8aa6'; c.fillRect(X(OX - ROAD / 2), Z(OZ - ROAD / 2), (SHORE - OX + ROAD / 2) * k, (NZ * CELL + ROAD) * k);
    c.fillStyle = '#3f3a57';
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) c.fillRect(X(nodeX(i) + ROAD / 2), Z(nodeZ(j) + ROAD / 2), (CELL - ROAD) * k, (CELL - ROAD) * k);
    c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const l of landmarks) { // a dot and the place's name beside it
      c.fillStyle = l.color; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(X(l.x), Z(l.z), 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.font = 'bold 13px sans-serif'; c.textAlign = 'left'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,.85)';
      c.strokeText(l.name || l.label, X(l.x) + 10, Z(l.z) + 0.5); c.fillStyle = '#fff'; c.fillText(l.name || l.label, X(l.x) + 10, Z(l.z) + 0.5);
    }
    c.textAlign = 'center';
    for (const b of blips) { c.fillStyle = b.color; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.rect(X(b.x) - 6, Z(b.z) - 6, 12, 12); c.fill(); c.stroke(); }
    c.font = 'bold 14px sans-serif'; c.textAlign = 'left';
    for (const b of blips) if (b.name) { c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(b.name, X(b.x) + 11, Z(b.z) + 1); c.fillStyle = b.color; c.fillText(b.name, X(b.x) + 11, Z(b.z) + 1); }
    c.save(); c.translate(X(focus.x), Z(focus.z)); c.rotate(Math.PI - heading);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#f4f1e6'; c.font = '20px "Bebas Neue", sans-serif'; c.textAlign = 'left';
    c.fillText(CITY === 'la' ? 'LOS ANGELES' : CITY === 'nexus' ? 'NEXUS' : 'VICE CITY', 24, 30); c.font = '13px sans-serif'; c.fillText('M to close', 24, 52);
  }
  // 0..1: the blurred, tunnel-vision look of a panic attack.
  panic(k) {
    $('fx').style.opacity = k;
    this.blur = k > 0.01 ? `blur(${(k * 5).toFixed(1)}px) saturate(${(1 - k * 0.6).toFixed(2)})` : '';
    $('game').style.filter = [this.blur, this.old].filter(Boolean).join(' ');
  }
  // What the radio is playing, for a few seconds.
  radio(title) {
    const el = $('radio');
    if (!el || !title) return;
    el.textContent = '♪  ' + title;
    el.classList.add('on');
    clearTimeout(this.radioTimer);
    this.radioTimer = setTimeout(() => el.classList.remove('on'), 5000);
  }
  // Another year: the picture goes the colour of an old photograph.
  era(on) {
    this.old = on ? 'sepia(0.72) contrast(1.08) brightness(1.03)' : '';
    $('game').style.filter = [this.blur, this.old].filter(Boolean).join(' ');
  }

  // North-up radar centred on the player.
  radar(focus, heading, blips, landmarks = []) {
    const c = this.ctx, S = 200, R = S / 2, k = 0.4;
    const X = x => (x - focus.x) * k + R, Z = z => (z - focus.z) * k + R;
    const rect = (x0, z0, x1, z1, color) => { c.fillStyle = color; c.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#1c7f9c'; c.fillRect(0, 0, S, S);
    rect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, '#d9c48f');
    rect(OX - ROAD / 2, OZ - ROAD / 2, SHORE, OZ + NZ * CELL + ROAD / 2, '#8f8aa6');
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const x = nodeX(i) + ROAD / 2, z = nodeZ(j) + ROAD / 2;
      rect(x, z, x + CELL - ROAD, z + CELL - ROAD, '#3f3a57');
    }
    c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const l of landmarks) { // places worth knowing, shown when they are within the radar's reach
      const lx = X(l.x), lz = Z(l.z);
      if (Math.hypot(lx - R, lz - R) > R - 8) continue;
      c.fillStyle = l.color; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(lx, lz, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.fillText(l.label, lx, lz + 0.5);
    }
    for (const b of blips) {
      let bx = X(b.x) - R, bz = Z(b.z) - R;
      const d = Math.hypot(bx, bz);
      if (d > R - 10) { bx *= (R - 10) / d; bz *= (R - 10) / d; }
      c.fillStyle = b.color; c.strokeStyle = '#000'; c.lineWidth = 2;
      c.beginPath(); c.rect(bx + R - 5, bz + R - 5, 10, 10); c.fill(); c.stroke();
    }
    c.translate(R, R); c.rotate(Math.PI - heading);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}
