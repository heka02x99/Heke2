// Ekran arayüzü: radar, öldürme akışı, mesajlar, skor tablosu, satın alma menüsü.
const $ = id => document.getElementById(id);

const HUD = {
  msgTimer: 0,
  setMsg(text, sub = '', dur = 3, color = '#fff') {
    $('center-msg').textContent = text; $('center-msg').style.color = color;
    $('sub-msg').textContent = sub;
    this.msgTimer = dur;
  },
  update(dt) {
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) { $('center-msg').textContent = ''; $('sub-msg').textContent = ''; } }
    const p = G.player, R = G.round;
    const viewed = G.spectating && !p.alive ? G.spectating : p;
    $('hp').textContent = viewed.hp;
    $('armor').textContent = viewed.armor;
    $('money').textContent = p.money;
    const w = viewed.weapon, a = viewed.ammo[viewed.weaponId];
    $('weapon-name').textContent = w.name + (viewed.reloading ? ' — dolduruluyor…' : '');
    if (w.melee || w.bomb) { $('ammo-mag').textContent = '—'; $('ammo-res').textContent = '—'; $('ammo').classList.remove('low'); }
    else if (w.grenade) { $('ammo-mag').textContent = viewed.inv[4]; $('ammo-res').textContent = '0'; $('ammo').classList.remove('low'); }
    else if (a) { $('ammo-mag').textContent = a.mag; $('ammo-res').textContent = a.res; $('ammo').classList.toggle('low', a.mag <= w.mag * 0.2); }

    // zamanlayıcı
    let t = R.timer;
    const timerEl = $('round-timer');
    if (G.bomb.state === 'planted') { timerEl.classList.add('bomb'); timerEl.textContent = '💣 ' + Math.ceil(G.bomb.timer); }
    else { timerEl.classList.remove('bomb'); t = Math.max(0, Math.ceil(t)); timerEl.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
    $('score-t').textContent = G.score.T; $('score-ct').textContent = G.score.CT;
    const alive = team => G.entities.filter(e => e.team === team && e.alive).length;
    $('alive-t').textContent = alive('T') + ' hayatta';
    $('alive-ct').textContent = alive('CT') + ' hayatta';

    // slotlar
    const slots = [];
    const names = { 1: viewed.inv[1], 2: viewed.inv[2], 3: 'knife', 4: viewed.inv[4] > 0 ? 'he' : null, 5: viewed.inv[5] ? 'c4' : null };
    for (let s = 1; s <= 5; s++) if (names[s]) slots.push(`<div class="${viewed.slot === s ? 'active' : ''}">${s} · ${WEAPONS[names[s]].name}</div>`);
    const html = slots.join('');
    if (html !== this._slots) { $('slots').innerHTML = html; this._slots = html; }

    // izleme
    const spec = $('spectating');
    if (!p.alive && G.spectating) { spec.classList.remove('hidden'); spec.textContent = `İzleniyor: ${G.spectating.name}  (sol tık: sonraki)`; }
    else spec.classList.add('hidden');

    this.drawRadar();
  },

  killfeed(victim, killer, weaponId, hs) {
    const div = document.createElement('div');
    div.className = 'kf' + ((victim === G.player || killer === G.player) ? ' me' : '');
    const kname = killer && killer !== victim ? `<span class="${killer.team}">${killer.name}</span>` : '';
    div.innerHTML = `${kname}<span class="w">${hs ? '<span class="hs">◉</span>' : ''}[${WEAPONS[weaponId] ? WEAPONS[weaponId].name : weaponId}]</span><span class="${victim.team}">${victim.name}</span>`;
    $('killfeed').appendChild(div);
    setTimeout(() => div.remove(), 6000);
    while ($('killfeed').children.length > 6) $('killfeed').firstChild.remove();
  },

  drawRadar() {
    const c = $('radar'), g = c.getContext('2d');
    const S = c.width, sc = S / 124, off = 62;
    const X = x => (x + off) * sc, Z = z => (z + off) * sc;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(190,170,130,.15)'; g.fillRect(X(-60), Z(-60), 120 * sc, 120 * sc);
    for (const k in MAP.sites) {
      const s = MAP.sites[k];
      g.fillStyle = 'rgba(220,60,40,.18)'; g.fillRect(X(s.minX), Z(s.minZ), (s.maxX - s.minX) * sc, (s.maxZ - s.minZ) * sc);
      g.fillStyle = 'rgba(255,90,70,.9)'; g.font = 'bold 14px Arial'; g.fillText(k, X(s.plant.x) - 5, Z(s.plant.z) + 5);
    }
    g.fillStyle = 'rgba(230,230,230,.55)';
    for (const b of MAP.boxes) { if (b.maxY - b.minY < 1.5 || b.minY > 3) continue; g.fillRect(X(b.minX), Z(b.minZ), Math.max(1, (b.maxX - b.minX) * sc), Math.max(1, (b.maxZ - b.minZ) * sc)); }
    const p = G.player;
    // bomba
    if (G.bomb.state === 'dropped' || G.bomb.state === 'planted') {
      if (p.team === 'T' || G.bomb.state === 'planted') {
        g.fillStyle = G.bomb.state === 'planted' && Math.sin(G.time * 10) > 0 ? '#ff2222' : '#ffcf3a';
        g.fillRect(X(G.bomb.pos.x) - 3, Z(G.bomb.pos.z) - 3, 6, 6);
      }
    }
    for (const e of G.entities) {
      if (e === p) continue;
      const friendly = e.team === p.team;
      const visible = friendly || (e.alive && e.seenByPlayerT && G.time - e.seenByPlayerT < 0.5);
      if (!visible) continue;
      g.fillStyle = !e.alive ? 'rgba(120,120,120,.8)' : friendly ? (e.team === 'T' ? '#f2b54a' : '#6fb3ff') : '#ff3333';
      g.beginPath(); g.arc(X(e.pos.x), Z(e.pos.z), e.alive ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
      if (e.alive && e.inv[5]) { g.strokeStyle = '#ffcf3a'; g.lineWidth = 1.5; g.stroke(); }
    }
    // oyuncu
    const me = !p.alive && G.spectating ? G.spectating : p;
    g.save();
    g.translate(X(me.pos.x), Z(me.pos.z));
    g.rotate(-me.yaw);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.restore();
  },

  showProgress(label, frac) {
    $('progress').classList.remove('hidden');
    $('progress-label').textContent = label;
    $('progress-bar').style.width = (frac * 100).toFixed(1) + '%';
  },
  hideProgress() { $('progress').classList.add('hidden'); },

  renderScoreboard() {
    const rows = team => G.entities.filter(e => e.team === team)
      .sort((a, b) => b.kills - a.kills)
      .map(e => `<tr class="${e.alive ? '' : 'dead'} ${e === G.player ? 'me' : ''}"><td class="${team}">${e.name}${e.inv[5] ? ' 💣' : ''}</td><td>${e.kills}</td><td>${e.deaths}</td><td>$${e.team === G.player.team ? e.money : '—'}</td><td>${e.alive ? e.hp : 'ÖLÜ'}</td></tr>`).join('');
    const head = '<tr><th>Oyuncu</th><th>Ö</th><th>Ö(len)</th><th>Para</th><th>Can</th></tr>';
    $('scoreboard').innerHTML = `
      <h3 class="T">SALDIRI — ${G.score.T}</h3><table>${head}${rows('T')}</table>
      <h3 class="CT">SAVUNMA — ${G.score.CT}</h3><table>${head}${rows('CT')}</table>
      <p style="margin-top:8px;opacity:.6;font-size:12px">Tur ${G.round.number} · ilk ${WIN_ROUNDS} turu alan kazanır</p>`;
  },

  renderBuyMenu() {
    const p = G.player;
    const html = BUY_LIST.map((it, i) => {
      const w = WEAPONS[it.id];
      const name = it.name || w.name, cat = it.cat || w.cat, price = it.price || w.price;
      let owned = false;
      if (w) owned = w.slot === 4 ? p.inv[4] > 0 : p.inv[w.slot] === it.id;
      if (it.id === 'kevlar') owned = p.armor >= 100;
      if (it.id === 'helmet') owned = p.armor >= 100 && p.helmet;
      const can = p.money >= price && !owned;
      return `<div class="buy-item ${can ? '' : 'no'} ${owned ? 'owned' : ''}" data-i="${i}"><div><span class="k">${i + 1}</span>${name}<span class="cat">${cat}</span></div><span class="p">$${price}</span></div>`;
    }).join('');
    $('buy-list').innerHTML = html;
    $('buy-money').textContent = `Paran: $${p.money}`;
    $('buy-list').querySelectorAll('.buy-item').forEach(el => el.onclick = () => { buyItem(+el.dataset.i); });
  },
};

let hitmarkerTimeout = null;
function showHitmarker(head) {
  const h = $('hitmarker');
  h.classList.toggle('head', !!head);
  h.style.transition = 'none'; h.style.opacity = 1;
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => { h.style.transition = 'opacity .2s'; h.style.opacity = 0; }, 80);
}

function updateCrosshair(gap) {
  const g = Math.round(3 + gap);
  const els = document.querySelectorAll('#crosshair .ch');
  els[0].style.top = (-g - 7) + 'px';
  els[1].style.top = g + 'px';
  els[2].style.left = (-g - 7) + 'px';
  els[3].style.left = g + 'px';
}
