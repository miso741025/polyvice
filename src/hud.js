import { NX, NZ, ROAD, OX, OZ, CELL, nodeX, nodeZ, bounds, SHORE } from './grid.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.ctx = $('radar').getContext('2d');
  }

  show(on) { $('hud').classList.toggle('on', on); }
  health(h) { $('healthFill').style.width = Math.max(0, h) + '%'; $('healthFill').classList.toggle('low', h < 30); }
  wanted(n) { $('wanted').innerHTML = '★'.repeat(n) + `<span class="dim">${'★'.repeat(3 - n)}</span>`; $('wanted').classList.toggle('on', n > 0); }
  weapon(w) { $('weapon').textContent = w === 'pistol' ? 'Pistol' : 'Fists'; }
  aim(on) { $('aim').classList.toggle('on', on); }
  wasted(on) { $('wasted').classList.toggle('on', on); }
  money(n) { $('money').textContent = '$' + String(n).padStart(8, '0'); }
  clock(seconds) {
    const m = (18 * 60 + 30 + Math.floor(seconds)) % 1440;
    $('clock').textContent = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  subtitle(who, text) {
    $('subtitle').innerHTML = !text ? '' : who ? `<span class="who">${who}:</span> ${text}` : `<i>${text}</i>`;
  }
  objective(html) { $('objective').innerHTML = html || ''; }
  prompt(text) { if ($('prompt').textContent !== (text || '')) $('prompt').textContent = text || ''; }

  card(title, sub) {
    if (!title) { $('card').classList.remove('on'); return; }
    $('cardTitle').textContent = title; $('cardSub').textContent = sub || '';
    $('card').classList.add('on');
  }
  passed(reward) {
    if (reward === undefined) { $('passed').classList.remove('on'); return; }
    $('reward').textContent = reward;
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
  // 0..1: the blurred, tunnel-vision look of a panic attack.
  panic(k) {
    $('fx').style.opacity = k;
    $('game').style.filter = k > 0.01 ? `blur(${(k * 5).toFixed(1)}px) saturate(${(1 - k * 0.6).toFixed(2)})` : '';
  }

  // North-up radar centred on the player.
  radar(focus, heading, blips) {
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
