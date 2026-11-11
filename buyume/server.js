// Hücre Savaşı — çevrimiçi oyun sunucusu.
// Çalıştırma:  npm install && npm start   →   http://localhost:3000
// Sunucu oyunu yetkili olarak simüle eder (hile yapılamaz), istemcilere görüş alanlarındaki
// nesneleri gönderir. Aynı porttan oyunun dosyalarını da sunar.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { World, C, COLORS } = require('./sim.js');

const PORT = Number(process.env.PORT) || 3000;
const TICK_HZ = 40;            // simülasyon hızı
const SEND_EVERY = 2;          // her 2 tikte bir anlık görüntü (20/sn)
const FOOD_EVERY = 4;          // yemekler 10/sn
const LB_EVERY = 20;           // liderlik tablosu 2/sn
const MAX_HUMANS = Number(process.env.MAX_PLAYERS) || 60;
const TOTAL_PLAYERS = Number(process.env.TOTAL_PLAYERS) || 24;  // insan + bot hedefi
const MIN_BOTS = process.env.MIN_BOTS != null ? Number(process.env.MIN_BOTS) : 6;

// ---------- Statik dosyalar ----------
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/sim.js': ['sim.js', 'text/javascript; charset=utf-8'],
};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ players: humanCount(), bots: world.players.length - humanCount() }));
    return;
  }
  const entry = STATIC[url];
  if (!entry || req.method !== 'GET') { res.writeHead(404); res.end('Bulunamadı'); return; }
  fs.readFile(path.join(__dirname, entry[0]), (err, data) => {
    if (err) { res.writeHead(500); res.end('Hata'); return; }
    res.writeHead(200, { 'content-type': entry[1], 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Oyun dünyası ----------
const world = new World({ bots: TOTAL_PLAYERS, minBots: MIN_BOTS });
const clients = new Set();

function humanCount() { let n = 0; for (const p of world.players) if (!p.isBot) n++; return n; }

world.onDeath = p => {
  const cl = p.client;
  if (!cl) return;
  send(cl, { t: 'dead', max: Math.round(p.maxMass), kills: p.kills, time: Math.round(world.now - p.spawnedAt) });
};
world.onEat = (eater, x, y, m) => {
  if (eater.client) send(eater.client, { t: 'eat', x: Math.round(x), y: Math.round(y), m: Math.round(m) });
};

function send(cl, obj) {
  if (cl.ws.readyState === 1) cl.ws.send(JSON.stringify(obj));
}

function cleanName(s) {
  s = String(s || '').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').trim().slice(0, 14);
  return s || 'Oyuncu';
}

const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

// ---------- Bağlantılar ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });

wss.on('connection', ws => {
  const cl = { ws, player: null, view: { w: 1600, h: 1000 }, msgs: 0, lastSplit: 0, lastEject: 0 };
  clients.add(cl);
  send(cl, { t: 'hello', world: C.WORLD, players: humanCount() });

  ws.on('message', raw => {
    if (++cl.msgs > 120) return;   // saniyede en fazla 120 mesaj
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const p = cl.player;
    switch (m.t) {
      case 'join': {
        if (p && p.alive) return;
        if (!p) {
          if (humanCount() >= MAX_HUMANS) { send(cl, { t: 'full' }); return; }
          cl.player = world.addHuman(cleanName(m.name), COLORS[(Math.random() * COLORS.length) | 0]);
          cl.player.client = cl;
        } else {
          p.name = cleanName(m.name);
        }
        world.spawn(cl.player);
        send(cl, { t: 'joined', id: cl.player.id, color: cl.player.color });
        break;
      }
      case 'in':
        cl.view.w = num(m.w, 200, 9000, 1600);
        cl.view.h = num(m.h, 200, 9000, 1000);
        if (p && p.alive) p.target = { x: num(m.x, -2000, C.WORLD + 2000, 0), y: num(m.y, -2000, C.WORLD + 2000, 0) };
        break;
      case 'split':
        if (p && world.now - cl.lastSplit > 0.1) { cl.lastSplit = world.now; world.split(p); }
        break;
      case 'eject':
        if (p && world.now - cl.lastEject > 0.08) { cl.lastEject = world.now; world.eject(p); }
        break;
      case 'ping':
        send(cl, { t: 'pong', id: m.id });
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(cl);
    if (cl.player) world.removePlayer(cl.player);
  });
  ws.on('error', () => {});
});

setInterval(() => { for (const cl of clients) cl.msgs = 0; }, 1000);

// ---------- Anlık görüntü ----------
function snapshot(cl, withFood) {
  const p = cl.player;
  let center = p && p.alive ? world.centerOf(p) : null;
  let cam = null;
  if (!center) {
    // Seyirci: en büyük oyuncuyu izle
    const lb = world.leaderboard();
    center = lb.length ? world.centerOf(lb[0].p) : { x: C.WORLD / 2, y: C.WORLD / 2 };
    cam = [Math.round(center.x), Math.round(center.y)];
  }
  const hw = cl.view.w / 2 + 150, hh = cl.view.h / 2 + 150;
  const x0 = center.x - hw, x1 = center.x + hw, y0 = center.y - hh, y1 = center.y + hh;

  const cells = [];
  const owners = {};
  for (const o of world.players) {
    if (!o.alive) continue;
    for (const c of o.cells) {
      const r = Math.sqrt(c.m) * 5;
      if (c.x + r < x0 || c.x - r > x1 || c.y + r < y0 || c.y - r > y1) continue;
      cells.push(c.id, o.id, Math.round(c.x), Math.round(c.y), Math.round(c.m * 10) / 10);
      owners[o.id] = [o.name, o.color];
    }
  }
  const viruses = [];
  for (const v of world.viruses) {
    if (v.x + v.r < x0 || v.x - v.r > x1 || v.y + v.r < y0 || v.y - v.r > y1) continue;
    viruses.push(v.id, Math.round(v.x), Math.round(v.y));
  }
  const msg = { t: 's', c: cells, o: owners, v: viruses };
  if (cam) msg.cam = cam;
  if (withFood) {
    const food = [], ej = [];
    for (const f of world.food) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      if (f.ci >= 0) food.push(Math.round(f.x), Math.round(f.y), f.ci);
      else ej.push(Math.round(f.x), Math.round(f.y), f.m, f.c);
    }
    msg.f = food;
    msg.e = ej;
  } else {
    // Atılan kütleler hızlı hareket eder, her seferinde gönder
    const ej = [];
    for (const f of world.food) {
      if (f.ci >= 0 || f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      ej.push(Math.round(f.x), Math.round(f.y), f.m, f.c);
    }
    msg.e = ej;
  }
  if (p) msg.me = { a: p.alive ? 1 : 0, k: p.kills, t: Math.round(world.now - p.spawnedAt) };
  send(cl, msg);
}

function leaderboard(cl, lb, humans) {
  const top = lb.slice(0, 10).map(r => [r.p.name, Math.round(r.m), r.p.isBot ? 1 : 0]);
  const rank = cl.player ? lb.findIndex(r => r.p === cl.player) : -1;
  send(cl, { t: 'lb', l: top, r: rank, n: humans });
}

let tick = 0;
const dt = 1 / TICK_HZ;
setInterval(() => {
  world.update(dt);
  tick++;
  if (tick % SEND_EVERY === 0) {
    const withFood = tick % FOOD_EVERY === 0;
    for (const cl of clients) snapshot(cl, withFood);
  }
  if (tick % LB_EVERY === 0) {
    const lb = world.leaderboard();
    const humans = humanCount();
    for (const cl of clients) leaderboard(cl, lb, humans);
  }
}, 1000 / TICK_HZ);

server.listen(PORT, () => {
  console.log('Hücre Savaşı sunucusu çalışıyor: http://localhost:' + PORT);
});

