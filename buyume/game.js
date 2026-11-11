'use strict';
// Hücre Savaşı — istemci.
// İki mod: çevrimiçi (server.js'e WebSocket ile bağlanır, gerçek oyuncularla oynanır)
// ve tek kişilik (sim.js tarayıcıda çalışır, rakipler bot).

const { World, C, radius, clamp, FOOD_COLORS } = Sim;

// ---------- DOM ----------
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const $ = id => document.getElementById(id);

// ---------- Durum ----------
// mode: 'menu-offline' (menü arkası yerel dünya), 'spectate' (menü arkası sunucu),
//       'offline' (tek kişilik oyun), 'online' (çevrimiçi oyun)
let mode = 'menu-offline';
let world = null, me = null;         // tek kişilik
let paused = false;
let clock = 0;                       // görsel efektler için zaman
let cam = { x: C.WORLD / 2, y: C.WORLD / 2, s: 0.6 };
let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let dpr = 1;
let floaters = [];
let deadShown = false;

const net = {
  ws: null, ready: false, joined: false, alive: false, myId: 0,
  cells: new Map(), owners: {}, food: [], ejected: [], viruses: [],
  spectate: null, stats: { k: 0, t: 0 }, lb: { l: [], r: -1, n: 0 },
  ping: 0, players: 0, lastIn: 0,
};

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
}
addEventListener('resize', resize);
resize();

const fmtTime = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const floater = (x, y, text, color) => floaters.push({ x, y, text, color, t: 0 });

// ---------- Tek kişilik ----------
function newLocalWorld() {
  world = new World({ bots: 24, minBots: 24 });
  world.onEat = (eater, x, y, m) => { if (eater === me) floater(x, y, '+' + Math.round(m), '#ffd166'); };
  world.onDeath = p => { if (p === me) showDead(p.maxMass, p.kills, world.now - p.spawnedAt); };
}

function startOffline() {
  newLocalWorld();
  me = world.addHuman(playerName(), '#7cf2a4');
  world.spawn(me);
  const c = world.centerOf(me);
  cam.x = c.x; cam.y = c.y;
  mode = 'offline';
  enterGame();
}

// ---------- Çevrimiçi ----------
function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q.replace(/^http/, 'ws').replace(/\/+$/, '').replace(/\/ws$/, '') + '/ws';
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }
  return null;
}

function connect() {
  const url = serverUrl();
  if (!url) { setStatus('Sunucu yok — tek kişilik oynanabilir.'); return; }
  setStatus('Sunucuya bağlanılıyor…');
  let ws;
  try { ws = new WebSocket(url); } catch (e) { setStatus('Sunucuya bağlanılamadı — tek kişilik oynanabilir.'); return; }
  net.ws = ws;
  ws.onopen = () => {
    net.ready = true;
    updateMenuButtons();
    if (mode === 'menu-offline') mode = 'spectate';
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onNet(m); };
  ws.onclose = () => {
    const wasOnline = mode === 'online' || mode === 'spectate';
    net.ready = false; net.joined = false; net.alive = false; net.cells.clear();
    updateMenuButtons();
    if (wasOnline) {
      mode = 'menu-offline';
      deadShown = false;
      $('hud').classList.add('hidden');
      $('dead').classList.add('hidden');
      $('menu').classList.remove('hidden');
    }
    setStatus('Sunucu bağlantısı yok — tekrar deneniyor… (tek kişilik oynanabilir)');
    setTimeout(connect, 3000);
  };
}

function nsend(obj) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(obj)); }

function onNet(m) {
  switch (m.t) {
    case 'hello': net.players = m.players; updateMenuButtons(); break;
    case 'joined':
      net.joined = true; net.alive = true; net.myId = m.id;
      mode = 'online';
      enterGame();
      break;
    case 'full': setStatus('Sunucu dolu, biraz sonra tekrar dene.'); break;
    case 'dead':
      net.alive = false;
      showDead(m.max, m.kills, m.time);
      break;
    case 'eat': floater(m.x, m.y, '+' + m.m, '#ffd166'); break;
    case 'pong': net.ping = Math.round(performance.now() - m.id); break;
    case 'lb': net.lb = m; net.players = m.n; if (!net.joined) updateMenuButtons(); break;
    case 's': onSnapshot(m); break;
  }
}

function onSnapshot(m) {
  const seen = new Set();
  const c = m.c;
  for (let i = 0; i < c.length; i += 5) {
    const id = c[i];
    seen.add(id);
    let cell = net.cells.get(id);
    if (!cell) {
      cell = { id, owner: c[i + 1], x: c[i + 2], y: c[i + 3], m: c[i + 4] };
      net.cells.set(id, cell);
    }
    cell.owner = c[i + 1]; cell.tx = c[i + 2]; cell.ty = c[i + 3]; cell.tm = c[i + 4];
  }
  for (const id of net.cells.keys()) if (!seen.has(id)) net.cells.delete(id);
  Object.assign(net.owners, m.o);
  net.viruses = [];
  for (let i = 0; i < m.v.length; i += 3) net.viruses.push({ id: m.v[i], x: m.v[i + 1], y: m.v[i + 2], m: C.VIRUS_MASS, r: radius(C.VIRUS_MASS) });
  if (m.f) {
    net.food = [];
    for (let i = 0; i < m.f.length; i += 3) net.food.push({ x: m.f[i], y: m.f[i + 1], m: 1, c: FOOD_COLORS[m.f[i + 2]] });
  }
  net.ejected = [];
  for (let i = 0; i < m.e.length; i += 4) net.ejected.push({ x: m.e[i], y: m.e[i + 1], m: m.e[i + 2], c: m.e[i + 3] });
  net.spectate = m.cam || null;
  if (m.me) { net.stats = m.me; net.alive = !!m.me.a; }
}

function joinOnline() {
  if (!net.ready) return;
  nsend({ t: 'join', name: playerName() });
}

setInterval(() => { if (net.ready) nsend({ t: 'ping', id: performance.now() }); }, 2000);

// ---------- Menü ----------
function playerName() {
  const n = ($('name').value.trim() || 'Sen').slice(0, 14);
  try { localStorage.setItem('hucre-name', n); } catch (e) { /* yok say */ }
  return n;
}

function setStatus(t) { $('status').textContent = t; }

function updateMenuButtons() {
  $('play-online').disabled = !net.ready;
  if (net.ready) setStatus('Çevrimiçi · sunucuda ' + net.players + ' gerçek oyuncu');
}

function enterGame() {
  paused = false;
  deadShown = false;
  floaters = [];
  $('menu').classList.add('hidden');
  $('dead').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('hud').classList.remove('hidden');
}

function showDead(max, kills, time) {
  if (deadShown) return;
  deadShown = true;
  $('r-max').textContent = Math.round(max);
  $('r-kills').textContent = kills;
  $('r-time').textContent = fmtTime(time);
  $('again').textContent = mode === 'online' ? 'TEKRAR OYNA (ÇEVRİMİÇİ)' : 'TEKRAR OYNA';
  $('dead').classList.remove('hidden');
}

function playAgain() {
  if (mode === 'online' && net.ready) joinOnline();
  else startOffline();
}

function backToMenu() {
  if (net.ready) {
    // Bağlantı açık kalır, menü arkasında sunucudaki oyun izlenir
    mode = 'spectate';
  } else {
    mode = 'menu-offline';
    newLocalWorld();
  }
  me = null;
  deadShown = false;
  $('dead').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  updateMenuButtons();
}

// ---------- Sahne (çizilecek nesneler) ----------
// Her moddan aynı biçimde nesne listesi üretir.
function buildScene(dt) {
  const s = { cells: [], food: null, ejected: [], viruses: null, mine: [], alive: false, spectate: null };
  if (mode === 'online' || mode === 'spectate') {
    const k = 1 - Math.exp(-18 * dt);
    for (const c of net.cells.values()) {
      c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.m += (c.tm - c.m) * k;
      const o = net.owners[c.owner] || ['?', '#999999'];
      const cell = { id: c.id, x: c.x, y: c.y, m: c.m, name: o[0], color: o[1], mine: mode === 'online' && c.owner === net.myId };
      s.cells.push(cell);
      if (cell.mine) s.mine.push(cell);
    }
    s.food = net.food;
    s.ejected = net.ejected;
    s.viruses = net.viruses;
    s.alive = mode === 'online' && net.alive && s.mine.length > 0;
    if (!s.alive && net.spectate) s.spectate = { x: net.spectate[0], y: net.spectate[1] };
  } else if (world) {
    for (const p of world.players) {
      if (!p.alive) continue;
      for (const c of p.cells) {
        const cell = { id: c.id, x: c.x, y: c.y, m: c.m, name: p.name, color: p.color, mine: p === me };
        s.cells.push(cell);
        if (cell.mine) s.mine.push(cell);
      }
    }
    s.food = world.food;
    s.viruses = world.viruses;
    s.alive = mode === 'offline' && me && me.alive;
    if (!s.alive) {
      const lb = world.leaderboard();
      if (lb.length) s.spectate = world.centerOf(lb[0].p);
    }
  }
  return s;
}

function centerOfCells(list) {
  let x = 0, y = 0, m = 0;
  for (const c of list) { x += c.x * c.m; y += c.y * c.m; m += c.m; }
  return m ? { x: x / m, y: y / m } : null;
}

// ---------- Güncelleme ----------
let growTick = 0;
function update(dt, scene) {
  clock += dt;
  if ((mode === 'offline' || mode === 'menu-offline') && !paused && world) world.update(dt);

  // Hedef: fare konumu (dünya koordinatı)
  const sc = cam.s * dpr;
  const tx = cam.x + (mouse.x * dpr - canvas.width / 2) / sc;
  const ty = cam.y + (mouse.y * dpr - canvas.height / 2) / sc;
  if (mode === 'offline' && me && me.alive) me.target = { x: tx, y: ty };
  if ((mode === 'online' || mode === 'spectate') && clock - net.lastIn > 0.05) {
    net.lastIn = clock;
    nsend({ t: 'in', x: Math.round(tx), y: Math.round(ty), w: Math.round(canvas.width / sc), h: Math.round(canvas.height / sc) });
  }

  // Büyüme göstergesi: her saniye ana parçadan "+X" yazısı çıksın
  if (scene.alive && !paused) {
    growTick += dt;
    if (growTick >= 1) {
      growTick -= 1;
      const main = scene.mine.reduce((a, b) => (b.m > a.m ? b : a));
      floater(main.x, main.y - radius(main.m) * 0.4, '+' + (C.AUTO_GROW * scene.mine.length).toFixed(1), '#7cf2a4');
    }
  }
  if (!paused) {
    for (const f of floaters) { f.t += dt; f.y -= 40 * dt; }
    floaters = floaters.filter(f => f.t < 1.2);
  }

  // Kamera
  let target = null, want = cam.s;
  if (scene.alive) {
    target = centerOfCells(scene.mine);
    const mass = scene.mine.reduce((a, c) => a + c.m, 0);
    const size = Math.sqrt(mass) * 5;
    const screen = Math.min(canvas.width, canvas.height) / dpr / 900;
    want = clamp(Math.pow(Math.min(1, 40 / Math.max(size, 1)), 0.45) * Math.max(screen, 0.55) * 1.2, 0.12, 1.6);
  } else if (scene.spectate) {
    target = scene.spectate;
    want = 0.55;
  }
  if (target) {
    const k = 1 - Math.exp(-6 * dt);
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
  }
  cam.s += (want - cam.s) * (1 - Math.exp(-2 * dt));
}

// ---------- Çizim ----------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawSpiky(x, y, r, spikes) {
  ctx.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + clock * 0.3;
    const rr = i % 2 ? r * 0.88 : r * 1.06;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function render(scene) {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1321';
  ctx.fillRect(0, 0, W, H);

  const s = cam.s * dpr;
  ctx.setTransform(s, 0, 0, s, W / 2 - cam.x * s, H / 2 - cam.y * s);
  const vx0 = cam.x - W / 2 / s, vx1 = cam.x + W / 2 / s;
  const vy0 = cam.y - H / 2 / s, vy1 = cam.y + H / 2 / s;
  const visible = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
  const WORLD = C.WORLD;

  // Izgara
  ctx.fillStyle = '#111a2e';
  ctx.fillRect(0, 0, WORLD, WORLD);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1 / cam.s;
  ctx.beginPath();
  const step = 50;
  for (let x = Math.max(0, Math.floor(vx0 / step) * step); x <= Math.min(WORLD, vx1); x += step) { ctx.moveTo(x, Math.max(0, vy0)); ctx.lineTo(x, Math.min(WORLD, vy1)); }
  for (let y = Math.max(0, Math.floor(vy0 / step) * step); y <= Math.min(WORLD, vy1); y += step) { ctx.moveTo(Math.max(0, vx0), y); ctx.lineTo(Math.min(WORLD, vx1), y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,90,110,0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, WORLD, WORLD);

  // Yemekler ve atılan kütleler
  const drawFood = f => {
    const r = f.m > 1 ? radius(f.m) : 6;
    if (!visible(f.x, f.y, r)) return;
    ctx.fillStyle = f.c;
    ctx.beginPath();
    if (f.m > 1) ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    else {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        i ? ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r) : ctx.moveTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
      }
      ctx.closePath();
    }
    ctx.fill();
  };
  if (scene.food) for (const f of scene.food) drawFood(f);
  for (const f of scene.ejected) drawFood(f);

  const cells = scene.cells.slice().sort((a, b) => a.m - b.m);
  const vs = (scene.viruses || []).slice().sort((a, b) => a.m - b.m);
  let vi = 0;
  const drawVirus = v => {
    if (!visible(v.x, v.y, v.r * 1.1)) return;
    drawSpiky(v.x, v.y, v.r, 18);
    ctx.fillStyle = 'rgba(180,90,255,0.75)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d0a3ff';
    ctx.stroke();
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of cells) {
    while (vi < vs.length && vs[vi].m <= c.m) drawVirus(vs[vi++]);
    const r = radius(c.m);
    if (!visible(c.x, c.y, r + 25)) continue;

    // Kendi parçalarında büyüme halkası
    if (c.mine) {
      const ph = (clock * 1.2 + c.id * 0.37) % 1;
      ctx.strokeStyle = 'rgba(124,242,164,' + (0.5 * (1 - ph)).toFixed(3) + ')';
      ctx.lineWidth = 3 / cam.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4 + ph * 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    const pts = Math.min(60, 16 + Math.floor(r / 3));
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const w = 1 + 0.025 * Math.sin(a * 5 + clock * 3 + c.id);
      const px = c.x + Math.cos(a) * r * w, py = c.y + Math.sin(a) * r * w;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.strokeStyle = c.mine ? '#e9fff1' : shade(c.color, -50);
    ctx.stroke();

    if (r > 16) {
      const fs = Math.max(10, r * 0.38);
      ctx.font = '700 ' + fs + 'px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(c.name, c.x, c.y);
      ctx.fillText(c.name, c.x, c.y);
      if (r > 30) {
        ctx.font = '600 ' + fs * 0.55 + 'px "Segoe UI", system-ui, sans-serif';
        ctx.strokeText(Math.round(c.m), c.x, c.y + fs * 0.85);
        ctx.fillText(Math.round(c.m), c.x, c.y + fs * 0.85);
      }
    }
  }
  while (vi < vs.length) drawVirus(vs[vi++]);

  for (const f of floaters) {
    ctx.globalAlpha = 1 - f.t / 1.2;
    ctx.font = '700 ' + 16 / cam.s + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  drawMinimap(scene);
}

function drawMinimap(scene) {
  const w = mini.width, h = mini.height, k = w / C.WORLD;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = 'rgba(180,90,255,0.5)';
  for (const v of scene.viruses || []) mctx.fillRect(v.x * k - 1, v.y * k - 1, 2, 2);
  for (const c of scene.cells) {
    mctx.fillStyle = c.mine ? '#ffffff' : c.color;
    mctx.beginPath();
    mctx.arc(c.x * k, c.y * k, Math.max(c.mine ? 3 : 1.5, radius(c.m) * k), 0, Math.PI * 2);
    mctx.fill();
  }
  const W = canvas.width / (cam.s * dpr), H = canvas.height / (cam.s * dpr);
  mctx.strokeStyle = 'rgba(255,255,255,0.5)';
  mctx.strokeRect((cam.x - W / 2) * k, (cam.y - H / 2) * k, W * k, H * k);
}

// ---------- HUD ----------
let hudTimer = 0;
function updateHud(dt, scene) {
  hudTimer -= dt;
  if (hudTimer > 0 || (mode !== 'offline' && mode !== 'online')) return;
  hudTimer = 0.2;
  if (scene.alive) {
    $('mass').textContent = Math.round(scene.mine.reduce((a, c) => a + c.m, 0));
    $('grow-rate').textContent = '+' + (C.AUTO_GROW * scene.mine.length).toFixed(1);
    $('pieces').textContent = scene.mine.length;
  }
  let rows, myRank, myMass = 0;
  if (mode === 'online') {
    $('kills').textContent = net.stats.k;
    $('time').textContent = fmtTime(net.stats.t);
    $('mode').textContent = 'Çevrimiçi · ' + net.lb.n + ' oyuncu · ' + net.ping + ' ms';
    rows = net.lb.l.map(r => ({ name: r[0], m: r[1], bot: r[2], me: false }));
    myRank = net.lb.r;
    if (myRank >= 0 && myRank < rows.length) rows[myRank].me = true;
    myMass = Math.round(scene.mine.reduce((a, c) => a + c.m, 0));
  } else {
    $('kills').textContent = me.kills;
    $('time').textContent = fmtTime(world.now - me.spawnedAt);
    $('mode').textContent = 'Tek kişilik · botlara karşı';
    const lb = world.leaderboard();
    rows = lb.slice(0, 10).map(r => ({ name: r.p.name, m: Math.round(r.m), bot: r.p.isBot, me: r.p === me }));
    myRank = lb.findIndex(r => r.p === me);
    if (myRank >= 0) myMass = Math.round(lb[myRank].m);
  }
  const list = $('lb-list');
  list.innerHTML = '';
  for (const r of rows) {
    const li = document.createElement('li');
    li.textContent = r.name + ' — ' + r.m;
    li.className = r.me ? 'me' : (r.bot && mode === 'online' ? 'bot' : '');
    list.appendChild(li);
  }
  if (myRank >= 10) {
    const li = document.createElement('li');
    li.value = myRank + 1;
    li.className = 'me';
    li.textContent = playerName() + ' — ' + myMass;
    list.appendChild(li);
  }
}

// ---------- Döngü ----------
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const scene = buildScene(dt);
  update(dt, scene);
  updateHud(dt, scene);
  render(scene);
  requestAnimationFrame(frame);
}

// ---------- Girdi ----------
function doSplit() {
  if (mode === 'offline' && me && me.alive && !paused) world.split(me);
  else if (mode === 'online' && net.alive) nsend({ t: 'split' });
}
function doEject() {
  if (mode === 'offline' && me && me.alive && !paused) world.eject(me);
  else if (mode === 'online' && net.alive) nsend({ t: 'eject' });
}

addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; e.preventDefault(); }, { passive: false });

let ejectHeld = null;
addEventListener('keydown', e => {
  if (document.activeElement === $('name')) {
    if (e.key === 'Enter') { if (net.ready) joinOnline(); else startOffline(); }
    return;
  }
  const playing = mode === 'offline' || mode === 'online';
  if (!playing) return;
  if (deadShown) { if (e.key === 'Enter') playAgain(); return; }
  if (e.code === 'Space') { e.preventDefault(); doSplit(); }
  else if (e.code === 'KeyW') {
    doEject();
    if (!e.repeat && !ejectHeld) ejectHeld = setInterval(doEject, 110);
  } else if ((e.code === 'KeyP' || e.code === 'Escape') && mode === 'offline') {
    paused = !paused;
    $('paused').classList.toggle('hidden', !paused);
  }
});
addEventListener('keyup', e => { if (e.code === 'KeyW') { clearInterval(ejectHeld); ejectHeld = null; } });
addEventListener('blur', () => { clearInterval(ejectHeld); ejectHeld = null; });

const tap = (el, fn) => {
  el.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
  el.addEventListener('click', fn);
};
tap($('btn-split'), doSplit);
tap($('btn-eject'), doEject);

$('play-online').addEventListener('click', joinOnline);
$('play-offline').addEventListener('click', startOffline);
$('again').addEventListener('click', playAgain);
$('to-menu').addEventListener('click', backToMenu);
try { $('name').value = localStorage.getItem('hucre-name') || ''; } catch (e) { /* yok say */ }

// Menü arkasında dünya canlı dursun
newLocalWorld();
updateMenuButtons();
connect();
requestAnimationFrame(frame);
