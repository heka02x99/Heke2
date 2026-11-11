'use strict';
// Hücre Savaşı — tarayıcıda hücre büyütme oyunu.
// Ana fikir: oyuna giren herkesin hücresi (ve bölündükten sonra her parçası)
// ilk saniyeden itibaren kendiliğinden büyür.

// ---------- Ayarlar ----------
const WORLD = 5000;
const FOOD_COUNT = 1000;
const BOT_COUNT = 24;
const VIRUS_COUNT = 20;
const START_MASS = 20;
const AUTO_GROW = 2.5;        // her parça için saniyede eklenen kütle
const DECAY_START = 500;      // bu kütlenin üstünde yavaş erime başlar
const DECAY_RATE = 0.002;     // erime oranı (kütlenin oranı / sn)
const MAX_CELLS = 16;
const MIN_SPLIT = 36;
const MIN_EJECT = 35;
const EJECT_LOSS = 16, EJECT_MASS = 13;
const VIRUS_MASS = 100;
const EAT_RATIO = 1.25;
const GRID = 120;             // yemek ızgarası hücre boyutu

const radius = m => Math.sqrt(m) * 5;
const speedOf = m => 700 * Math.pow(m, -0.32);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const COLORS = ['#ff5d73', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#e599f7', '#63e6be', '#ff8787'];
const BOT_NAMES = ['Kuantum', 'Pofuduk', 'Bulut', 'Mikrop', 'Zeytin', 'Fıstık', 'Yıldız', 'Boncuk', 'Kayısı', 'Atom', 'Duman', 'Nane', 'Kumpir', 'Simit', 'Lokum', 'Tarçın', 'Rüzgar', 'Pamuk', 'Şeker', 'Kaju', 'Mercan', 'Ayva', 'Kestane', 'Zıpzıp', 'Gofret', 'Hamsi', 'Turşu', 'Badem'];
const FOOD_COLORS = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ffa94d', '#63e6be'];

// ---------- Durum ----------
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const $ = id => document.getElementById(id);

let players = [], food = [], viruses = [], floaters = [];
let me = null;
let running = false, paused = false;
let now = 0;                  // oyun zamanı (sn)
let cam = { x: WORLD / 2, y: WORLD / 2, s: 1 };
let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let dpr = 1;
let nextId = 1;
let foodGrid = new Map();

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
}
addEventListener('resize', resize);
resize();

// ---------- Oluşturma ----------
function makeFood() {
  return { x: rand(20, WORLD - 20), y: rand(20, WORLD - 20), m: 1, c: FOOD_COLORS[(Math.random() * FOOD_COLORS.length) | 0], vx: 0, vy: 0, owner: null, born: 0 };
}

function makeVirus() {
  return { x: rand(150, WORLD - 150), y: rand(150, WORLD - 150), m: VIRUS_MASS, r: radius(VIRUS_MASS) };
}

function safeSpot() {
  let best = null, bestD = -1;
  for (let i = 0; i < 12; i++) {
    const x = rand(200, WORLD - 200), y = rand(200, WORLD - 200);
    let d = Infinity;
    for (const p of players) for (const c of p.cells) {
      if (c.m < START_MASS * 2) continue;
      d = Math.min(d, Math.hypot(c.x - x, c.y - y) - radius(c.m));
    }
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function makeCell(owner, x, y, m) {
  return { id: nextId++, owner, x, y, m, vx: 0, vy: 0, mergeAt: 0 };
}

function spawnPlayer(p) {
  const s = safeSpot();
  p.cells = [makeCell(p, s.x, s.y, START_MASS)];
  p.alive = true;
  p.spawnedAt = now;
  p.maxMass = START_MASS;
  p.kills = 0;
  p.target = { x: s.x, y: s.y };
}

function makeBot(i) {
  const p = {
    id: nextId++, isBot: true,
    name: BOT_NAMES[i % BOT_NAMES.length],
    color: COLORS[(Math.random() * COLORS.length) | 0],
    cells: [], alive: false, respawnAt: 0,
    ai: { next: 0, wander: { x: rand(0, WORLD), y: rand(0, WORLD) }, skill: rand(0.5, 1) },
  };
  spawnPlayer(p);
  // Botlar oyuna farklı boyutlarla başlasın ki dünya canlı görünsün
  p.cells[0].m = START_MASS + Math.random() * Math.random() * 400;
  return p;
}

function resetWorld() {
  now = 0;
  players = [];
  food = [];
  viruses = [];
  floaters = [];
  for (let i = 0; i < FOOD_COUNT; i++) food.push(makeFood());
  for (let i = 0; i < VIRUS_COUNT; i++) viruses.push(makeVirus());
  for (let i = 0; i < BOT_COUNT; i++) players.push(makeBot(i));
}

function startGame() {
  const name = ($('name').value.trim() || 'Sen').slice(0, 14);
  try { localStorage.setItem('hucre-name', name); } catch (e) { /* yok say */ }
  if (!players.length) resetWorld();
  // önceki oyuncuyu çıkar
  players = players.filter(p => p.isBot);
  me = { id: nextId++, isBot: false, name, color: '#7cf2a4', cells: [], alive: false };
  spawnPlayer(me);
  players.push(me);
  cam.x = me.cells[0].x; cam.y = me.cells[0].y;
  $('menu').classList.add('hidden');
  $('dead').classList.add('hidden');
  $('hud').classList.remove('hidden');
  running = true;
  paused = false;
}

// ---------- Yardımcılar ----------
const totalMass = p => p.cells.reduce((s, c) => s + c.m, 0);

function centerOf(p) {
  let x = 0, y = 0, m = 0;
  for (const c of p.cells) { x += c.x * c.m; y += c.y * c.m; m += c.m; }
  return m ? { x: x / m, y: y / m } : { x: cam.x, y: cam.y };
}

function buildFoodGrid() {
  foodGrid.clear();
  for (let i = 0; i < food.length; i++) {
    const f = food[i];
    const k = ((f.x / GRID) | 0) * 1000 + ((f.y / GRID) | 0);
    let b = foodGrid.get(k);
    if (!b) foodGrid.set(k, (b = []));
    b.push(f);
  }
}

function forFoodNear(x, y, r, fn) {
  const x0 = Math.max(0, ((x - r) / GRID) | 0), x1 = ((x + r) / GRID) | 0;
  const y0 = Math.max(0, ((y - r) / GRID) | 0), y1 = ((y + r) / GRID) | 0;
  for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
    const b = foodGrid.get(gx * 1000 + gy);
    if (b) for (const f of b) fn(f);
  }
}

function floater(x, y, text, color) {
  floaters.push({ x, y, text, color, t: 0 });
}

// ---------- Eylemler ----------
function split(p) {
  const list = p.cells.slice().sort((a, b) => b.m - a.m);
  for (const c of list) {
    if (p.cells.length >= MAX_CELLS) break;
    if (c.m < MIN_SPLIT) continue;
    let dx = p.target.x - c.x, dy = p.target.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const half = c.m / 2;
    c.m = half;
    const r = radius(half);
    const n = makeCell(p, c.x + dx * r, c.y + dy * r, half);
    const boost = 900 + r * 2;
    n.vx = dx * boost; n.vy = dy * boost;
    const t = now + 10 + half * 0.015;
    c.mergeAt = Math.max(c.mergeAt, t);
    n.mergeAt = t;
    p.cells.push(n);
  }
}

function eject(p) {
  for (const c of p.cells) {
    if (c.m < MIN_EJECT) continue;
    let dx = p.target.x - c.x, dy = p.target.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    c.m -= EJECT_LOSS;
    const r = radius(c.m);
    food.push({ x: c.x + dx * (r + 8), y: c.y + dy * (r + 8), m: EJECT_MASS, c: p.color, vx: dx * 750, vy: dy * 750, owner: p, born: now });
  }
}

function popOnVirus(c) {
  const p = c.owner;
  const free = MAX_CELLS - p.cells.length;
  if (free <= 0) return;
  const pieces = Math.min(free, Math.max(2, Math.floor(c.m / 40)));
  const chunk = (c.m * 0.5) / pieces;
  c.m *= 0.5;
  const t = now + 12 + c.m * 0.015;
  c.mergeAt = t;
  for (let i = 0; i < pieces; i++) {
    const a = (i / pieces) * Math.PI * 2 + rand(-0.2, 0.2);
    const n = makeCell(p, c.x, c.y, chunk);
    n.vx = Math.cos(a) * 700; n.vy = Math.sin(a) * 700;
    n.mergeAt = t;
    p.cells.push(n);
  }
}

// ---------- Bot zekâsı ----------
function thinkBot(p, all) {
  if (now < p.ai.next) return;
  p.ai.next = now + rand(0.12, 0.3) / p.ai.skill;
  const main = p.cells.reduce((a, b) => (b.m > a.m ? b : a));
  const mr = radius(main.m);
  const view = 500 + mr * 4;

  let fx = 0, fy = 0, threat = false;
  let prey = null, preyScore = 0;
  for (const o of all) {
    if (o.owner === p) continue;
    const dx = o.x - main.x, dy = o.y - main.y;
    const d = Math.hypot(dx, dy);
    if (d > view) continue;
    const or = radius(o.m);
    const gap = Math.max(1, d - or - mr);
    const canSplitKill = o.m / 2 > main.m * EAT_RATIO && gap < 350 && o.owner.cells.length < MAX_CELLS;
    if (o.m > main.m * EAT_RATIO || canSplitKill) {
      if (gap < 250 + or) {
        const w = 1 / gap;
        fx -= (dx / d) * w; fy -= (dy / d) * w;
        threat = true;
      }
    } else if (main.m > o.m * EAT_RATIO) {
      const score = o.m / (gap + 50);
      if (score > preyScore) { preyScore = score; prey = o; }
    }
  }
  // Büyükken dikenli mayınlardan kaç
  if (main.m > VIRUS_MASS * EAT_RATIO && p.cells.length < MAX_CELLS) {
    for (const v of viruses) {
      const dx = v.x - main.x, dy = v.y - main.y;
      const d = Math.hypot(dx, dy);
      const gap = d - mr - v.r;
      if (gap < 60) { const w = 0.6 / Math.max(1, gap + 30); fx -= (dx / d) * w; fy -= (dy / d) * w; threat = true; }
    }
  }
  // Duvarlardan uzak dur
  const wallPad = 150 + mr;
  if (threat) {
    if (main.x < wallPad) fx += 0.01; if (main.x > WORLD - wallPad) fx -= 0.01;
    if (main.y < wallPad) fy += 0.01; if (main.y > WORLD - wallPad) fy -= 0.01;
    const l = Math.hypot(fx, fy) || 1;
    p.target = { x: main.x + (fx / l) * 600, y: main.y + (fy / l) * 600 };
    return;
  }
  if (prey) {
    p.target = { x: prey.x, y: prey.y };
    const d = Math.hypot(prey.x - main.x, prey.y - main.y);
    if (main.m > prey.m * 2.6 && d < mr + 380 && p.cells.length < 4 && Math.random() < 0.25 * p.ai.skill) {
      split(p);
    }
    return;
  }
  // Yemek ara
  let best = null, bestD = Infinity;
  forFoodNear(main.x, main.y, 350, f => {
    const d = (f.x - main.x) ** 2 + (f.y - main.y) ** 2;
    if (d < bestD) { bestD = d; best = f; }
  });
  if (best) { p.target = { x: best.x, y: best.y }; return; }
  const w = p.ai.wander;
  if (Math.hypot(w.x - main.x, w.y - main.y) < 100) { w.x = rand(200, WORLD - 200); w.y = rand(200, WORLD - 200); }
  p.target = { x: w.x, y: w.y };
}

// ---------- Güncelleme ----------
function update(dt) {
  now += dt;

  // Oyuncu hedefi: fare konumu
  if (me && me.alive) {
    const s = cam.s * dpr;
    me.target = { x: cam.x + (mouse.x * dpr - canvas.width / 2) / s, y: cam.y + (mouse.y * dpr - canvas.height / 2) / s };
  }

  const all = [];
  for (const p of players) if (p.alive) for (const c of p.cells) all.push(c);

  buildFoodGrid();
  for (const p of players) {
    if (!p.alive) {
      if (p.isBot && now >= p.respawnAt) {
        const used = new Set(players.map(o => o.name));
        const free = BOT_NAMES.filter(n => !used.has(n));
        p.name = free.length ? free[(Math.random() * free.length) | 0] : p.name;
        p.color = COLORS[(Math.random() * COLORS.length) | 0];
        spawnPlayer(p);
      }
      continue;
    }
    if (p.isBot) thinkBot(p, all);
  }

  // Hareket + otomatik büyüme
  for (const p of players) {
    if (!p.alive) continue;
    for (const c of p.cells) {
      // OTOMATİK BÜYÜME: her parça oyunun ilk anından itibaren büyür
      c.m += AUTO_GROW * dt;
      if (c.m > DECAY_START) c.m -= c.m * DECAY_RATE * dt; // çok büyüyünce yavaş erime

      const r = radius(c.m);
      let dx = p.target.x - c.x, dy = p.target.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const sp = speedOf(c.m) * Math.min(1, d / (r + 20));
        c.x += (dx / d) * sp * dt;
        c.y += (dy / d) * sp * dt;
      }
      c.x += c.vx * dt; c.y += c.vy * dt;
      const k = Math.exp(-5 * dt);
      c.vx *= k; c.vy *= k;
      c.x = clamp(c.x, r * 0.5, WORLD - r * 0.5);
      c.y = clamp(c.y, r * 0.5, WORLD - r * 0.5);
    }

    // Aynı oyuncunun parçaları: birleşme veya itişme
    const cs = p.cells;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        if (a.m <= 0 || b.m <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const ra = radius(a.m), rb = radius(b.m);
        if (now >= a.mergeAt && now >= b.mergeAt) {
          if (d < Math.max(ra, rb) * 0.9) {
            const big = a.m >= b.m ? a : b, small = big === a ? b : a;
            big.x = (big.x * big.m + small.x * small.m) / (big.m + small.m);
            big.y = (big.y * big.m + small.y * small.m) / (big.m + small.m);
            big.m += small.m;
            small.m = 0;
          }
        } else if (d < ra + rb) {
          // Yeni bölünmüş parçalar hızla uçarken itme yapma
          if (Math.hypot(a.vx, a.vy) > 300 || Math.hypot(b.vx, b.vy) > 300) continue;
          const push = (ra + rb - d) * 0.5;
          const ux = dx / d, uy = dy / d;
          const tot = a.m + b.m;
          a.x -= ux * push * (b.m / tot) * 2; a.y -= uy * push * (b.m / tot) * 2;
          b.x += ux * push * (a.m / tot) * 2; b.y += uy * push * (a.m / tot) * 2;
        }
      }
    }
    p.cells = cs.filter(c => c.m > 0);
  }

  // Atılan kütleler hareket eder
  for (const f of food) {
    if (f.vx || f.vy) {
      f.x += f.vx * dt; f.y += f.vy * dt;
      const k = Math.exp(-6 * dt);
      f.vx *= k; f.vy *= k;
      if (Math.abs(f.vx) + Math.abs(f.vy) < 5) { f.vx = 0; f.vy = 0; }
      f.x = clamp(f.x, 5, WORLD - 5); f.y = clamp(f.y, 5, WORLD - 5);
    }
  }
  buildFoodGrid();

  // Yemek yeme
  const eaten = new Set();
  for (const p of players) {
    if (!p.alive) continue;
    for (const c of p.cells) {
      const r = radius(c.m);
      forFoodNear(c.x, c.y, r, f => {
        if (eaten.has(f)) return;
        if (f.owner === p && now - f.born < 0.6) return;
        if (f.m > 1 && c.m < f.m * 1.15) return;
        if ((f.x - c.x) ** 2 + (f.y - c.y) ** 2 < r * r) {
          c.m += f.m;
          eaten.add(f);
        }
      });
    }
  }
  if (eaten.size) {
    food = food.filter(f => !eaten.has(f));
  }
  let normal = 0;
  for (const f of food) if (f.m === 1) normal++;
  for (let i = normal; i < FOOD_COUNT; i++) if (Math.random() < 0.5) food.push(makeFood());
  if (food.length > FOOD_COUNT + 400) food.splice(0, food.length - FOOD_COUNT - 400);

  // Hücre hücreyi yer
  const cells = [];
  for (const p of players) if (p.alive) for (const c of p.cells) cells.push(c);
  cells.sort((a, b) => b.m - a.m);
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    if (a.m <= 0) continue;
    const ra = radius(a.m);
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j];
      if (b.m <= 0 || b.owner === a.owner) continue;
      if (a.m < b.m * EAT_RATIO) continue;
      const rb = radius(b.m);
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > ra || Math.abs(dy) > ra) continue;
      if (dx * dx + dy * dy < (ra - rb * 0.4) ** 2) {
        a.m += b.m;
        if (a.owner === me) floater(b.x, b.y, '+' + Math.round(b.m), '#ffd166');
        b.m = 0;
        const bo = b.owner;
        if (bo.cells.every(c => c.m <= 0)) a.owner.kills = (a.owner.kills || 0) + 1;
      }
    }
  }

  // Dikenli mayınlar
  for (let i = 0; i < viruses.length; i++) {
    const v = viruses[i];
    for (const c of cells) {
      if (c.m <= 0 || c.m < v.m * EAT_RATIO) continue;
      const r = radius(c.m);
      const dx = v.x - c.x, dy = v.y - c.y;
      if (dx * dx + dy * dy < (r - v.r * 0.4) ** 2) {
        c.m += v.m * 0.5;
        popOnVirus(c);
        viruses[i] = makeVirus();
        break;
      }
    }
  }

  // Ölümler
  for (const p of players) {
    if (!p.alive) continue;
    p.cells = p.cells.filter(c => c.m > 0);
    if (!p.cells.length) {
      p.alive = false;
      if (p.isBot) p.respawnAt = now + rand(1.5, 4);
      else onPlayerDeath();
    } else {
      p.maxMass = Math.max(p.maxMass, totalMass(p));
    }
  }

  // Büyüme göstergesi: her saniye ana parçadan "+X" yazısı çıksın
  if (me && me.alive) {
    me._growTick = (me._growTick || 0) + dt;
    if (me._growTick >= 1) {
      me._growTick -= 1;
      const main = me.cells.reduce((a, b) => (b.m > a.m ? b : a));
      floater(main.x, main.y - radius(main.m) * 0.4, '+' + (AUTO_GROW * me.cells.length).toFixed(1), '#7cf2a4');
    }
  }
  for (const f of floaters) { f.t += dt; f.y -= 40 * dt; }
  floaters = floaters.filter(f => f.t < 1.2);

  // Kamera
  if (me) {
    const target = me.alive ? centerOf(me) : { x: cam.x, y: cam.y };
    let size = 0;
    if (me.alive) size = Math.sqrt(totalMass(me)) * 5;
    const screen = Math.min(canvas.width, canvas.height) / dpr / 900;
    const want = me.alive ? clamp(Math.pow(Math.min(1, 40 / Math.max(size, 1)), 0.45) * Math.max(screen, 0.55) * 1.2, 0.12, 1.6) : cam.s;
    const k = 1 - Math.exp(-6 * dt);
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
    cam.s += (want - cam.s) * (1 - Math.exp(-2 * dt));
  }
}

function onPlayerDeath() {
  running = true; // dünya arka planda devam etsin
  $('r-max').textContent = Math.round(me.maxMass);
  $('r-kills').textContent = me.kills;
  $('r-time').textContent = fmtTime(now - me.spawnedAt);
  $('dead').classList.remove('hidden');
}

function fmtTime(s) {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ---------- Çizim ----------
function drawSpiky(x, y, r, spikes) {
  ctx.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + now * 0.3;
    const rr = i % 2 ? r * 0.88 : r * 1.06;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function render() {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1321';
  ctx.fillRect(0, 0, W, H);

  const s = cam.s * dpr;
  ctx.setTransform(s, 0, 0, s, W / 2 - cam.x * s, H / 2 - cam.y * s);
  const vx0 = cam.x - W / 2 / s, vx1 = cam.x + W / 2 / s;
  const vy0 = cam.y - H / 2 / s, vy1 = cam.y + H / 2 / s;
  const visible = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

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

  // Yemekler
  for (const f of food) {
    const r = f.m > 1 ? radius(f.m) : 6;
    if (!visible(f.x, f.y, r)) continue;
    ctx.fillStyle = f.c;
    ctx.beginPath();
    if (f.m > 1) ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    else { // küçük altıgen tanecikler
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r) : ctx.moveTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); }
      ctx.closePath();
    }
    ctx.fill();
  }

  // Hücreler (küçükten büyüğe)
  const cells = [];
  for (const p of players) if (p.alive) for (const c of p.cells) cells.push(c);
  cells.sort((a, b) => a.m - b.m);

  // Mayınlar hücrelerle birlikte boyuta göre çizilsin: önce küçükler
  let vi = 0;
  const vs = viruses.slice().sort((a, b) => a.m - b.m);
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
    if (!visible(c.x, c.y, r + 20)) continue;
    const p = c.owner;

    // Oyuncunun parçalarında büyüme halkası
    if (p === me) {
      const ph = (now * 1.2 + c.id * 0.37) % 1;
      ctx.strokeStyle = 'rgba(124,242,164,' + (0.5 * (1 - ph)).toFixed(3) + ')';
      ctx.lineWidth = 3 / cam.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4 + ph * 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hafif dalgalı kenar
    ctx.beginPath();
    const pts = Math.min(60, 16 + Math.floor(r / 3));
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const w = 1 + 0.025 * Math.sin(a * 5 + now * 3 + c.id);
      const px = c.x + Math.cos(a) * r * w, py = c.y + Math.sin(a) * r * w;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.strokeStyle = shade(p.color, -50);
    ctx.stroke();

    if (r > 16) {
      const fs = Math.max(10, r * 0.38);
      ctx.font = '700 ' + fs + 'px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(p.name, c.x, c.y);
      ctx.fillText(p.name, c.x, c.y);
      if (r > 30) {
        ctx.font = '600 ' + fs * 0.55 + 'px "Segoe UI", system-ui, sans-serif';
        ctx.strokeText(Math.round(c.m), c.x, c.y + fs * 0.85);
        ctx.fillText(Math.round(c.m), c.x, c.y + fs * 0.85);
      }
    }
  }
  while (vi < vs.length) drawVirus(vs[vi++]);

  // Yüzen yazılar
  for (const f of floaters) {
    ctx.globalAlpha = 1 - f.t / 1.2;
    ctx.font = '700 ' + 18 / cam.s * 0.9 + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  drawMinimap();
}

function drawMinimap() {
  const w = mini.width, h = mini.height, k = w / WORLD;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = 'rgba(180,90,255,0.5)';
  for (const v of viruses) mctx.fillRect(v.x * k - 1, v.y * k - 1, 2, 2);
  for (const p of players) {
    if (!p.alive) continue;
    mctx.fillStyle = p === me ? '#7cf2a4' : p.color;
    for (const c of p.cells) {
      mctx.beginPath();
      mctx.arc(c.x * k, c.y * k, Math.max(p === me ? 3 : 1.5, radius(c.m) * k), 0, Math.PI * 2);
      mctx.fill();
    }
  }
  if (me && me.alive) {
    const W = canvas.width / (cam.s * dpr), H = canvas.height / (cam.s * dpr);
    mctx.strokeStyle = 'rgba(255,255,255,0.5)';
    mctx.strokeRect((cam.x - W / 2) * k, (cam.y - H / 2) * k, W * k, H * k);
  }
}

let hudTimer = 0;
function updateHud(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.2;
  if (me && me.alive) {
    $('mass').textContent = Math.round(totalMass(me));
    $('grow-rate').textContent = '+' + (AUTO_GROW * me.cells.length).toFixed(1);
    $('pieces').textContent = me.cells.length;
    $('kills').textContent = me.kills;
    $('time').textContent = fmtTime(now - me.spawnedAt);
  }
  const ranked = players.filter(p => p.alive).map(p => ({ p, m: totalMass(p) })).sort((a, b) => b.m - a.m);
  const list = $('lb-list');
  list.innerHTML = '';
  const top = ranked.slice(0, 10);
  const myRank = ranked.findIndex(r => r.p === me);
  for (const r of top) {
    const li = document.createElement('li');
    li.textContent = r.p.name + ' — ' + Math.round(r.m);
    if (r.p === me) li.className = 'me';
    list.appendChild(li);
  }
  if (myRank >= 10) {
    const li = document.createElement('li');
    li.value = myRank + 1;
    li.className = 'me';
    li.textContent = me.name + ' — ' + Math.round(ranked[myRank].m);
    list.appendChild(li);
  }
}

// ---------- Döngü ----------
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (running && !paused) {
    update(dt);
    updateHud(dt);
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- Girdi ----------
addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; e.preventDefault(); }, { passive: false });

addEventListener('keydown', e => {
  if (document.activeElement === $('name')) {
    if (e.key === 'Enter') startGame();
    return;
  }
  if (!me || !me.alive) {
    if (e.key === 'Enter' && !$('dead').classList.contains('hidden')) startGame();
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); if (!paused) split(me); }
  else if (e.code === 'KeyW') { if (!paused) eject(me); }
  else if (e.code === 'KeyP' || e.code === 'Escape') {
    paused = !paused;
    $('paused').classList.toggle('hidden', !paused);
  }
});
// W basılı tutulursa sürekli kütle atsın
let ejectHeld = null;
addEventListener('keydown', e => { if (e.code === 'KeyW' && !e.repeat && me && me.alive && document.activeElement !== $('name')) ejectHeld = setInterval(() => { if (me.alive && !paused) eject(me); }, 110); });
addEventListener('keyup', e => { if (e.code === 'KeyW') { clearInterval(ejectHeld); ejectHeld = null; } });

$('btn-split').addEventListener('touchstart', e => { e.preventDefault(); if (me && me.alive) split(me); }, { passive: false });
$('btn-eject').addEventListener('touchstart', e => { e.preventDefault(); if (me && me.alive) eject(me); }, { passive: false });
$('btn-split').addEventListener('click', () => { if (me && me.alive) split(me); });
$('btn-eject').addEventListener('click', () => { if (me && me.alive) eject(me); });

$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
try { $('name').value = localStorage.getItem('hucre-name') || ''; } catch (e) { /* yok say */ }

// Menü arkasında dünya canlı dursun
resetWorld();
running = true;
requestAnimationFrame(frame);
