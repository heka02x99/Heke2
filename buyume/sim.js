// Hücre Savaşı — oyun simülasyonu.
// Hem tarayıcıda (tek kişilik mod) hem de Node sunucusunda (çevrimiçi mod) aynı kod çalışır.
// Ana fikir: oyuna giren herkesin hücresi (ve bölündükten sonra her parçası)
// ilk saniyeden itibaren kendiliğinden büyür.
(function (root) {
  'use strict';

  const C = {
    WORLD: 5000,
    FOOD_COUNT: 1000,
    VIRUS_COUNT: 20,
    START_MASS: 20,
    AUTO_GROW: 2.5,       // her parça için saniyede eklenen kütle
    DECAY_START: 500,     // bu kütlenin üstünde yavaş erime başlar
    DECAY_RATE: 0.002,    // erime oranı (kütlenin oranı / sn)
    MAX_CELLS: 16,
    MIN_SPLIT: 36,
    MIN_EJECT: 35,
    EJECT_LOSS: 16,
    EJECT_MASS: 13,
    VIRUS_MASS: 100,
    EAT_RATIO: 1.25,
    GRID: 120,
  };

  const radius = m => Math.sqrt(m) * 5;
  const speedOf = m => 700 * Math.pow(m, -0.32);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const COLORS = ['#ff5d73', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#e599f7', '#63e6be', '#ff8787'];
  const BOT_NAMES = ['Kuantum', 'Pofuduk', 'Bulut', 'Mikrop', 'Zeytin', 'Fıstık', 'Yıldız', 'Boncuk', 'Kayısı', 'Atom', 'Duman', 'Nane', 'Kumpir', 'Simit', 'Lokum', 'Tarçın', 'Rüzgar', 'Pamuk', 'Şeker', 'Kaju', 'Mercan', 'Ayva', 'Kestane', 'Zıpzıp', 'Gofret', 'Hamsi', 'Turşu', 'Badem'];
  const FOOD_COLORS = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ffa94d', '#63e6be'];

  class World {
    // opts.bots: hedef toplam oyuncu sayısı (insan + bot). İnsanlar katıldıkça botlar azalır.
    // opts.minBots: her zaman en az bu kadar bot olsun.
    constructor(opts = {}) {
      this.targetPlayers = opts.bots != null ? opts.bots : 24;
      this.minBots = opts.minBots != null ? opts.minBots : 6;
      this.now = 0;
      this.nextId = 1;
      this.players = [];
      this.food = [];
      this.viruses = [];
      this.foodGrid = new Map();
      this.onDeath = null;   // (player) => void  — insan oyuncu öldüğünde
      this.onEat = null;     // (eater, x, y, mass) => void — hücre yendiğinde
      for (let i = 0; i < C.FOOD_COUNT; i++) this.food.push(this.makeFood());
      for (let i = 0; i < C.VIRUS_COUNT; i++) this.viruses.push(this.makeVirus());
      this.balanceBots(true);
    }

    // ---------- Oluşturma ----------
    makeFood() {
      const ci = (Math.random() * FOOD_COLORS.length) | 0;
      return { x: rand(20, C.WORLD - 20), y: rand(20, C.WORLD - 20), m: 1, ci, c: FOOD_COLORS[ci], vx: 0, vy: 0, owner: null, born: 0 };
    }

    makeVirus() {
      return { id: this.nextId++, x: rand(150, C.WORLD - 150), y: rand(150, C.WORLD - 150), m: C.VIRUS_MASS, r: radius(C.VIRUS_MASS) };
    }

    makeCell(owner, x, y, m) {
      return { id: this.nextId++, owner, x, y, m, vx: 0, vy: 0, mergeAt: 0 };
    }

    safeSpot() {
      let best = null, bestD = -1;
      for (let i = 0; i < 12; i++) {
        const x = rand(200, C.WORLD - 200), y = rand(200, C.WORLD - 200);
        let d = Infinity;
        for (const p of this.players) for (const c of p.cells) {
          if (c.m < C.START_MASS * 2) continue;
          d = Math.min(d, Math.hypot(c.x - x, c.y - y) - radius(c.m));
        }
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      return best;
    }

    spawn(p) {
      const s = this.safeSpot();
      p.cells = [this.makeCell(p, s.x, s.y, C.START_MASS)];
      p.alive = true;
      p.spawnedAt = this.now;
      p.maxMass = C.START_MASS;
      p.kills = 0;
      p.target = { x: s.x, y: s.y };
    }

    freeBotName() {
      const used = new Set(this.players.map(o => o.name));
      const free = BOT_NAMES.filter(n => !used.has(n));
      const list = free.length ? free : BOT_NAMES;
      return list[(Math.random() * list.length) | 0];
    }

    addBot(randomSize) {
      const p = {
        id: this.nextId++, isBot: true,
        name: this.freeBotName(),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        cells: [], alive: false, respawnAt: 0, kills: 0, maxMass: 0, spawnedAt: 0,
        target: { x: 0, y: 0 },
        ai: { next: 0, wander: { x: rand(0, C.WORLD), y: rand(0, C.WORLD) }, skill: rand(0.5, 1) },
      };
      this.spawn(p);
      // Dünya ilk açıldığında botlar farklı boyutlarda olsun
      if (randomSize) p.cells[0].m = C.START_MASS + Math.random() * Math.random() * 400;
      this.players.push(p);
      return p;
    }

    // İnsan oyuncu ekle (doğmadan; doğurmak için spawn çağrılır)
    addHuman(name, color) {
      const p = {
        id: this.nextId++, isBot: false, name, color: color || '#7cf2a4',
        cells: [], alive: false, kills: 0, maxMass: 0, spawnedAt: 0, target: { x: 0, y: 0 },
      };
      this.players.push(p);
      this.balanceBots();
      return p;
    }

    removePlayer(p) {
      const i = this.players.indexOf(p);
      if (i >= 0) this.players.splice(i, 1);
      p.cells = [];
      p.alive = false;
      this.balanceBots();
    }

    balanceBots(randomSize) {
      const humans = this.players.filter(p => !p.isBot).length;
      const want = Math.max(this.minBots, this.targetPlayers - humans);
      let bots = this.players.filter(p => p.isBot);
      while (bots.length < want) { bots.push(this.addBot(randomSize)); }
      if (bots.length > want) {
        // Önce ölü, sonra en küçük botları çıkar
        bots.sort((a, b) => (a.alive - b.alive) || (this.totalMass(a) - this.totalMass(b)));
        for (const b of bots.slice(0, bots.length - want)) {
          this.players.splice(this.players.indexOf(b), 1);
        }
      }
    }

    // ---------- Yardımcılar ----------
    totalMass(p) { let s = 0; for (const c of p.cells) s += c.m; return s; }

    centerOf(p) {
      let x = 0, y = 0, m = 0;
      for (const c of p.cells) { x += c.x * c.m; y += c.y * c.m; m += c.m; }
      return m ? { x: x / m, y: y / m } : null;
    }

    buildFoodGrid() {
      const g = this.foodGrid;
      g.clear();
      for (const f of this.food) {
        const k = ((f.x / C.GRID) | 0) * 1000 + ((f.y / C.GRID) | 0);
        let b = g.get(k);
        if (!b) g.set(k, (b = []));
        b.push(f);
      }
    }

    forFoodNear(x, y, r, fn) {
      const x0 = Math.max(0, ((x - r) / C.GRID) | 0), x1 = ((x + r) / C.GRID) | 0;
      const y0 = Math.max(0, ((y - r) / C.GRID) | 0), y1 = ((y + r) / C.GRID) | 0;
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const b = this.foodGrid.get(gx * 1000 + gy);
        if (b) for (const f of b) fn(f);
      }
    }

    leaderboard() {
      return this.players.filter(p => p.alive)
        .map(p => ({ p, m: this.totalMass(p) }))
        .sort((a, b) => b.m - a.m);
    }

    // ---------- Eylemler ----------
    split(p) {
      if (!p.alive) return;
      const list = p.cells.slice().sort((a, b) => b.m - a.m);
      for (const c of list) {
        if (p.cells.length >= C.MAX_CELLS) break;
        if (c.m < C.MIN_SPLIT) continue;
        let dx = p.target.x - c.x, dy = p.target.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        const half = c.m / 2;
        c.m = half;
        const r = radius(half);
        const n = this.makeCell(p, c.x + dx * r, c.y + dy * r, half);
        const boost = 900 + r * 2;
        n.vx = dx * boost; n.vy = dy * boost;
        const t = this.now + 10 + half * 0.015;
        c.mergeAt = Math.max(c.mergeAt, t);
        n.mergeAt = t;
        p.cells.push(n);
      }
    }

    eject(p) {
      if (!p.alive) return;
      for (const c of p.cells) {
        if (c.m < C.MIN_EJECT) continue;
        let dx = p.target.x - c.x, dy = p.target.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        c.m -= C.EJECT_LOSS;
        const r = radius(c.m);
        this.food.push({ x: c.x + dx * (r + 8), y: c.y + dy * (r + 8), m: C.EJECT_MASS, ci: -1, c: p.color, vx: dx * 750, vy: dy * 750, owner: p, born: this.now });
      }
    }

    popOnVirus(c) {
      const p = c.owner;
      const free = C.MAX_CELLS - p.cells.length;
      if (free <= 0) return;
      const pieces = Math.min(free, Math.max(2, Math.floor(c.m / 40)));
      const chunk = (c.m * 0.5) / pieces;
      c.m *= 0.5;
      const t = this.now + 12 + c.m * 0.015;
      c.mergeAt = t;
      for (let i = 0; i < pieces; i++) {
        const a = (i / pieces) * Math.PI * 2 + rand(-0.2, 0.2);
        const n = this.makeCell(p, c.x, c.y, chunk);
        n.vx = Math.cos(a) * 700; n.vy = Math.sin(a) * 700;
        n.mergeAt = t;
        p.cells.push(n);
      }
    }

    // ---------- Bot zekâsı ----------
    thinkBot(p, all) {
      if (this.now < p.ai.next) return;
      p.ai.next = this.now + rand(0.12, 0.3) / p.ai.skill;
      const main = p.cells.reduce((a, b) => (b.m > a.m ? b : a));
      const mr = radius(main.m);
      const view = 500 + mr * 4;

      let fx = 0, fy = 0, threat = false;
      let prey = null, preyScore = 0;
      for (const o of all) {
        if (o.owner === p) continue;
        const dx = o.x - main.x, dy = o.y - main.y;
        if (Math.abs(dx) > view || Math.abs(dy) > view) continue;
        const d = Math.hypot(dx, dy) || 1;
        if (d > view) continue;
        const or = radius(o.m);
        const gap = Math.max(1, d - or - mr);
        const canSplitKill = o.m / 2 > main.m * C.EAT_RATIO && gap < 350 && o.owner.cells.length < C.MAX_CELLS;
        if (o.m > main.m * C.EAT_RATIO || canSplitKill) {
          if (gap < 250 + or) {
            const w = 1 / gap;
            fx -= (dx / d) * w; fy -= (dy / d) * w;
            threat = true;
          }
        } else if (main.m > o.m * C.EAT_RATIO) {
          const score = o.m / (gap + 50);
          if (score > preyScore) { preyScore = score; prey = o; }
        }
      }
      // Büyükken dikenli mayınlardan kaç
      if (main.m > C.VIRUS_MASS * C.EAT_RATIO && p.cells.length < C.MAX_CELLS) {
        for (const v of this.viruses) {
          const dx = v.x - main.x, dy = v.y - main.y;
          const d = Math.hypot(dx, dy) || 1;
          const gap = d - mr - v.r;
          if (gap < 60) { const w = 0.6 / Math.max(1, gap + 30); fx -= (dx / d) * w; fy -= (dy / d) * w; threat = true; }
        }
      }
      if (threat) {
        const wallPad = 150 + mr;
        if (main.x < wallPad) fx += 0.01;
        if (main.x > C.WORLD - wallPad) fx -= 0.01;
        if (main.y < wallPad) fy += 0.01;
        if (main.y > C.WORLD - wallPad) fy -= 0.01;
        const l = Math.hypot(fx, fy) || 1;
        p.target = { x: main.x + (fx / l) * 600, y: main.y + (fy / l) * 600 };
        return;
      }
      if (prey) {
        p.target = { x: prey.x, y: prey.y };
        const d = Math.hypot(prey.x - main.x, prey.y - main.y);
        if (main.m > prey.m * 2.6 && d < mr + 380 && p.cells.length < 4 && Math.random() < 0.25 * p.ai.skill) {
          this.split(p);
        }
        return;
      }
      let best = null, bestD = Infinity;
      this.forFoodNear(main.x, main.y, 350, f => {
        const d = (f.x - main.x) ** 2 + (f.y - main.y) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      });
      if (best) { p.target = { x: best.x, y: best.y }; return; }
      const w = p.ai.wander;
      if (Math.hypot(w.x - main.x, w.y - main.y) < 100) { w.x = rand(200, C.WORLD - 200); w.y = rand(200, C.WORLD - 200); }
      p.target = { x: w.x, y: w.y };
    }

    // ---------- Güncelleme ----------
    update(dt) {
      this.now += dt;
      const now = this.now;
      const players = this.players;

      const all = [];
      for (const p of players) if (p.alive) for (const c of p.cells) all.push(c);

      this.buildFoodGrid();
      for (const p of players) {
        if (!p.alive) {
          if (p.isBot && now >= p.respawnAt) {
            p.name = this.freeBotName();
            p.color = COLORS[(Math.random() * COLORS.length) | 0];
            this.spawn(p);
          }
          continue;
        }
        if (p.isBot) this.thinkBot(p, all);
      }

      // Hareket + otomatik büyüme
      for (const p of players) {
        if (!p.alive) continue;
        for (const c of p.cells) {
          // OTOMATİK BÜYÜME: her parça oyunun ilk anından itibaren büyür
          c.m += C.AUTO_GROW * dt;
          if (c.m > C.DECAY_START) c.m -= c.m * C.DECAY_RATE * dt; // çok büyüyünce yavaş erime

          const r = radius(c.m);
          const dx = p.target.x - c.x, dy = p.target.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d > 1) {
            const sp = speedOf(c.m) * Math.min(1, d / (r + 20));
            c.x += (dx / d) * sp * dt;
            c.y += (dy / d) * sp * dt;
          }
          c.x += c.vx * dt; c.y += c.vy * dt;
          const k = Math.exp(-5 * dt);
          c.vx *= k; c.vy *= k;
          c.x = clamp(c.x, r * 0.5, C.WORLD - r * 0.5);
          c.y = clamp(c.y, r * 0.5, C.WORLD - r * 0.5);
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
      for (const f of this.food) {
        if (f.vx || f.vy) {
          f.x += f.vx * dt; f.y += f.vy * dt;
          const k = Math.exp(-6 * dt);
          f.vx *= k; f.vy *= k;
          if (Math.abs(f.vx) + Math.abs(f.vy) < 5) { f.vx = 0; f.vy = 0; }
          f.x = clamp(f.x, 5, C.WORLD - 5); f.y = clamp(f.y, 5, C.WORLD - 5);
        }
      }
      this.buildFoodGrid();

      // Yemek yeme
      const eaten = new Set();
      for (const p of players) {
        if (!p.alive) continue;
        for (const c of p.cells) {
          const r = radius(c.m);
          this.forFoodNear(c.x, c.y, r, f => {
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
      if (eaten.size) this.food = this.food.filter(f => !eaten.has(f));
      let normal = 0;
      for (const f of this.food) if (f.m === 1) normal++;
      for (let i = normal; i < C.FOOD_COUNT; i++) if (Math.random() < 0.5) this.food.push(this.makeFood());
      if (this.food.length > C.FOOD_COUNT + 400) this.food.splice(0, this.food.length - C.FOOD_COUNT - 400);

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
          if (a.m < b.m * C.EAT_RATIO) continue;
          const rb = radius(b.m);
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > ra || Math.abs(dy) > ra) continue;
          if (dx * dx + dy * dy < (ra - rb * 0.4) ** 2) {
            a.m += b.m;
            if (this.onEat) this.onEat(a.owner, b.x, b.y, b.m);
            b.m = 0;
            if (b.owner.cells.every(c => c.m <= 0)) a.owner.kills++;
          }
        }
      }

      // Dikenli mayınlar
      for (let i = 0; i < this.viruses.length; i++) {
        const v = this.viruses[i];
        for (const c of cells) {
          if (c.m <= 0 || c.m < v.m * C.EAT_RATIO) continue;
          const r = radius(c.m);
          const dx = v.x - c.x, dy = v.y - c.y;
          if (dx * dx + dy * dy < (r - v.r * 0.4) ** 2) {
            c.m += v.m * 0.5;
            this.popOnVirus(c);
            this.viruses[i] = this.makeVirus();
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
          else if (this.onDeath) this.onDeath(p);
        } else {
          p.maxMass = Math.max(p.maxMass, this.totalMass(p));
        }
      }
    }
  }

  const api = { World, C, radius, speedOf, clamp, COLORS, FOOD_COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
