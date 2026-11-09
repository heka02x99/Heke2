// Bot yapay zekâsı: görme, duyma, nişan alma, navigasyon ve hedefler.

const BOT_DIFF = [
  { reaction: 0.65, turn: 3.2, wobble: 0.55, spread: 0.035, head: 0.15, burst: 3, comp: 0.3 },
  { reaction: 0.38, turn: 6.0, wobble: 0.3, spread: 0.016, head: 0.35, burst: 5, comp: 0.6 },
  { reaction: 0.22, turn: 10.0, wobble: 0.14, spread: 0.007, head: 0.6, burst: 8, comp: 0.85 },
];

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function initBot(e) {
  e.bot = {
    path: [], pathIdx: 0, goalKey: null,
    target: null, reactAt: 0, lastSeenT: -10, lastSeenPos: null,
    aimPart: 'body', wobble: new THREE.Vector3(), wobbleT: 0,
    burstLeft: 0, burstPauseUntil: 0,
    heardPos: null, heardT: -10,
    stuckT: 0, lastPos: new THREE.Vector3(), jump: false,
    holdIdx: Math.floor(Math.random() * 3), holdLookT: 0, lookYaw: 0,
    action: null, actionT: 0, strafe: 1, strafeT: 0,
    role: null, waitUntil: 0,
  };
}

function botHeard(b, src, wasHit) {
  if (!b.alive || !b.bot) return;
  const d = b.pos.distanceTo(src.pos);
  if (!wasHit && d > 45) return;
  b.bot.heardPos = src.pos.clone();
  b.bot.heardT = G.time;
}

function canSee(e, t) {
  const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 90) return false;
  // görüş açısı (yakında veya duyulduysa geniş)
  const toYaw = Math.atan2(-dx, -dz);
  const fov = (G.time - e.bot.heardT < 1.5 || dist < 5) ? Math.PI : 1.15;
  if (Math.abs(angleDiff(e.yaw, toYaw)) > fov) return false;
  const ey = e.eyeY;
  if (hasLOS(e.pos.x, ey, e.pos.z, t.pos.x, t.eyeY - 0.05, t.pos.z)) return true;
  if (hasLOS(e.pos.x, ey, e.pos.z, t.pos.x, t.pos.y + 1.0, t.pos.z)) return true;
  return false;
}

function botSetGoal(e, key, x, z) {
  const b = e.bot;
  if (b.goalKey === key && b.path.length) return;
  b.goalKey = key;
  b.path = findPath(e.pos.x, e.pos.z, x, z);
  b.pathIdx = 0;
}

function botObjective(e) {
  const b = e.bot, bomb = G.bomb, R = G.round;
  if (R.state === 'freeze') return { stay: true };

  if (e.team === 'T') {
    if (bomb.state === 'planted') {
      const ang = (e.name.length * 1.7) % (Math.PI * 2);
      return { key: 'guard', x: bomb.pos.x + Math.cos(ang) * 6, z: bomb.pos.z + Math.sin(ang) * 6, look: { x: bomb.pos.x, z: bomb.pos.z + 20 }, hold: true };
    }
    if (e.inv[5]) {
      const s = MAP.sites[R.tSite];
      return { key: 'plant' + R.tSite, x: s.plant.x + (e.bot.plantOff || 0), z: s.plant.z, plant: true };
    }
    if (bomb.state === 'dropped') {
      // en yakın T bomba alır
      let nearest = null, nd = Infinity;
      for (const o of G.entities) if (o.alive && o.team === 'T' && o.isBot) { const d = o.pos.distanceTo(bomb.pos); if (d < nd) { nd = d; nearest = o; } }
      if (nearest === e) return { key: 'pickup', x: bomb.pos.x, z: bomb.pos.z };
    }
    // takımın seçtiği bölgeye git; bomba taşıyıcısı varsa onu bekleme
    const s = MAP.sites[R.tSite];
    const holds = MAP.holds[R.tSite];
    const h = holds[b.holdIdx % holds.length];
    if (G.time < b.waitUntil) return { stay: true };
    return { key: 'site' + R.tSite + b.holdIdx, x: h[0], z: h[1], hold: true, look: { x: s.plant.x, z: s.plant.z - 20 } };
  }

  // CT
  if (bomb.state === 'planted') {
    return { key: 'defuse', x: bomb.pos.x, z: bomb.pos.z, defuse: true };
  }
  const area = b.role || 'A';
  const holds = MAP.holds[area];
  const h = holds[b.holdIdx % holds.length];
  return { key: 'hold' + area + b.holdIdx, x: h[0], z: h[1], hold: true, look: { x: h[0], z: h[1] + 25 } };
}

function updateBot(e, dt) {
  const b = e.bot, D = BOT_DIFF[G.difficulty];
  if (!e.alive) return;
  const R = G.round;

  // ----- algılama
  let best = null, bestD = Infinity;
  if (R.state !== 'freeze') {
    for (const t of G.entities) {
      if (!t.alive || t.team === e.team) continue;
      const d = e.pos.distanceTo(t.pos);
      if (d < bestD && canSee(e, t)) { best = t; bestD = d; }
    }
  }
  if (best) {
    if (b.target !== best || G.time - b.lastSeenT > 1.0) {
      b.reactAt = G.time + D.reaction * (0.8 + Math.random() * 0.5);
      b.aimPart = Math.random() < D.head ? 'head' : 'body';
      b.burstLeft = D.burst;
    }
    b.target = best; b.lastSeenT = G.time; b.lastSeenPos = best.pos.clone();
  } else if (b.target && G.time - b.lastSeenT > 2.5) {
    b.target = null;
  }

  // eylem (kurma/imha) sırasında
  if (b.action) {
    e.crouch = true;
    if (best && bestD < 25 && b.action === 'defuse' && G.difficulty > 0 && G.bomb.timer > 6) { cancelBotAction(e); }
    else { physicsStep(e, 0, 0, 0, false, dt); return; }
  }

  let wishX = 0, wishZ = 0, speed = 5.2 * e.weapon.speed;
  let wantYaw = e.yaw, wantPitch = 0;
  let engaged = false;

  // ----- çatışma
  if (b.target && b.target.alive && G.time - b.lastSeenT < 0.3) {
    engaged = true;
    const t = b.target;
    // nişan noktası + titreme
    if (G.time > b.wobbleT) {
      b.wobbleT = G.time + 0.25;
      const dist = e.pos.distanceTo(t.pos);
      const k = D.wobble * (0.4 + Math.min(1, dist / 30));
      b.wobble.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k * 0.7, (Math.random() - 0.5) * k);
    }
    const ay = b.aimPart === 'head' ? t.eyeY - 0.05 : t.pos.y + t.height * 0.6;
    const tx = t.pos.x + t.vel.x * 0.05 + b.wobble.x, tyy = ay + b.wobble.y, tz = t.pos.z + t.vel.z * 0.05 + b.wobble.z;
    const dx = tx - e.pos.x, dy = tyy - e.eyeY, dz = tz - e.pos.z;
    const hd = Math.hypot(dx, dz);
    wantYaw = Math.atan2(-dx, -dz);
    wantPitch = Math.atan2(dy, hd);
    // geri tepme telafisi
    wantYaw -= e.punchYaw * D.comp; wantPitch -= e.punchPitch * D.comp;

    // bıçak/bombalı ise silah değiştir
    if (e.slot !== 1 && e.slot !== 2) e.switchTo(e.inv[1] ? 1 : 2);
    const a = e.ammo[e.weaponId];
    if (a && a.mag === 0 && a.res <= 0 && e.slot === 1) e.switchTo(2);

    // hareket: yakın mesafede yana adım, atış anında dur
    const firing = G.time >= b.reactAt;
    if (G.time > b.strafeT) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = G.time + 0.4 + Math.random() * 0.8; }
    if (!firing || e.reloading || G.time < b.burstPauseUntil) {
      const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
      wishX = rx * b.strafe; wishZ = rz * b.strafe;
      speed *= G.difficulty === 0 ? 0.5 : 0.8;
    }
    if (hd < 2.5 && e.weaponId === 'knife') { wishX = dx / hd; wishZ = dz / hd; }

    // dönüş
    turnToward(e, wantYaw, wantPitch, D.turn * 1.3, dt);
    const err = Math.abs(angleDiff(e.yaw, wantYaw)) + Math.abs(wantPitch - e.pitch);
    const tol = 0.05 + 0.6 / Math.max(3, hd);
    if (firing && err < tol && G.time >= b.burstPauseUntil && e.speed2D() < 2.2) {
      if (fireWeapon(e, D.spread)) {
        if (e.weapon.auto) {
          b.burstLeft--;
          if (b.burstLeft <= 0) { b.burstLeft = D.burst + Math.floor(Math.random() * 3); b.burstPauseUntil = G.time + 0.18 + hd * 0.012; }
        } else {
          b.burstPauseUntil = G.time + (e.weapon.scope ? 0.2 : 0.12) + Math.random() * 0.15;
        }
      }
    }
    e.crouch = G.difficulty > 0 && firing && hd > 18 && e.weapon.auto && (e.name.charCodeAt(0) % 2 === 0);
  }

  if (!engaged) {
    e.crouch = false;
    // boşta şarjör doldur
    const a = e.ammo[e.weaponId];
    if (a && e.weapon.mag && a.mag < e.weapon.mag * 0.5 && a.res > 0 && !e.reloading && G.time - b.lastSeenT > 1.5) e.startReload();
    if (e.slot !== 1 && e.inv[1] && e.slot !== 5) e.switchTo(1);

    const obj = botObjective(e);
    let moving = false;
    // son görülen düşman pozisyonuna/duyulan sese bak
    const recentSeen = b.lastSeenPos && G.time - b.lastSeenT < 3;
    const recentHeard = b.heardPos && G.time - b.heardT < 2.5;

    if (!obj.stay) {
      const dGoal = Math.hypot(obj.x - e.pos.x, obj.z - e.pos.z);
      const arriveR = obj.plant || obj.defuse || obj.key === 'pickup' ? 0.9 : 1.5;
      if (dGoal > arriveR) {
        botSetGoal(e, obj.key, obj.x, obj.z);
        const wp = b.path[b.pathIdx];
        if (wp) {
          let dx = wp.x - e.pos.x, dz = wp.z - e.pos.z, d = Math.hypot(dx, dz);
          // yol kısaltma: bir sonraki nokta görünüyorsa atla (kalabalıkta takılmayı önler)
          if (b.pathIdx < b.path.length - 1 && G.time > (b.smoothT || 0)) {
            b.smoothT = G.time + 0.25;
            const nx = b.path[b.pathIdx + 1];
            if (d < 6 && hasLOS(e.pos.x, 0.5, e.pos.z, nx.x, 0.5, nx.z) && hasLOS(e.pos.x + 0.35, 0.5, e.pos.z + 0.35, nx.x, 0.5, nx.z) && hasLOS(e.pos.x - 0.35, 0.5, e.pos.z - 0.35, nx.x, 0.5, nx.z)) b.pathIdx++;
          }
          if (d < 2.2 && b.pathIdx < b.path.length - 1) { b.pathIdx++; }
          else if (d > 0.05) { wishX = dx / d; wishZ = dz / d; moving = true; }
        }
      } else {
        b.path = []; b.goalKey = null;
        if (obj.plant) startBotAction(e, 'plant');
        else if (obj.defuse) startBotAction(e, 'defuse');
      }
      if (moving && !recentSeen && !recentHeard) wantYaw = Math.atan2(-wishX, -wishZ);
      else if (!moving && obj.look && !recentSeen && !recentHeard) {
        if (G.time > b.holdLookT) { b.holdLookT = G.time + 1.5 + Math.random() * 2; b.lookYaw = (Math.random() - 0.5) * 1.4; }
        wantYaw = Math.atan2(-(obj.look.x - e.pos.x), -(obj.look.z - e.pos.z)) + b.lookYaw;
      }
    }
    if (recentSeen) {
      wantYaw = Math.atan2(-(b.lastSeenPos.x - e.pos.x), -(b.lastSeenPos.z - e.pos.z));
    } else if (recentHeard) {
      wantYaw = Math.atan2(-(b.heardPos.x - e.pos.x), -(b.heardPos.z - e.pos.z));
      if (moving && G.time - b.heardT < 1.2) { wishX *= 0.3; wishZ *= 0.3; }
    }
    turnToward(e, wantYaw, 0, D.turn, dt);

    // takılma tespiti
    if (moving) {
      b.stuckT += dt;
      if (b.stuckT > 0.8) {
        if (e.pos.distanceTo(b.lastPos) < 0.4) {
          b.jump = true;
          b.path = []; b.goalKey = null; // yeniden yol bul
          wishX += (Math.random() - 0.5) * 2; wishZ += (Math.random() - 0.5) * 2;
        }
        b.stuckT = 0; b.lastPos.copy(e.pos);
      }
    }
  }

  // bot ekip arkadaşlarından ayrışma
  for (const o of G.entities) {
    if (o === e || !o.alive) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.2 && d > 0.001) { wishX += dx / d * 0.6; wishZ += dz / d * 0.6; }
  }

  const wl = Math.hypot(wishX, wishZ);
  if (wl > 1) { wishX /= wl; wishZ /= wl; }
  physicsStep(e, wishX, wishZ, speed, b.jump, dt);
  b.jump = false;

  // ayak sesleri
  if (e.onGround && e.speed2D() > 3) {
    e.stepAcc += e.speed2D() * dt;
    if (e.stepAcc > 2.4) { e.stepAcc = 0; Sound.step(e.pos, G.listener); }
  }
}

function turnToward(e, yaw, pitch, rate, dt) {
  const dy = angleDiff(e.yaw, yaw);
  const maxStep = rate * dt;
  // yakınken yumuşak, uzakken sabit hız
  e.yaw += Math.abs(dy) < maxStep ? dy : Math.sign(dy) * maxStep;
  const dp = pitch - e.pitch;
  e.pitch += Math.abs(dp) < maxStep ? dp : Math.sign(dp) * maxStep;
}

function startBotAction(e, kind) {
  const b = e.bot;
  if (b.action) return;
  if (kind === 'plant' && !canPlant(e)) return;
  if (kind === 'defuse' && !canDefuse(e)) return;
  b.action = kind;
  b.actionT = G.time + (kind === 'plant' ? PLANT_TIME : DEFUSE_TIME);
  if (kind === 'defuse') G.bomb.defuser = e;
}

function cancelBotAction(e) {
  if (e.bot.action === 'defuse' && G.bomb.defuser === e) G.bomb.defuser = null;
  e.bot.action = null;
  e.crouch = false;
}

function updateBotAction(e) {
  const b = e.bot;
  if (!b || !b.action || !e.alive) return;
  if (b.action === 'plant' && (!e.inv[5] || G.round.state !== 'live')) { cancelBotAction(e); return; }
  if (b.action === 'defuse' && (G.bomb.state !== 'planted')) { cancelBotAction(e); return; }
  if (G.time >= b.actionT) {
    if (b.action === 'plant') plantBomb(e);
    else defuseBomb(e);
    b.action = null; e.crouch = false;
  }
}

// Tur başında botların alışverişi
function botBuy(e) {
  const m = () => e.money;
  const buy = (id, price) => { if (m() >= price) { e.money -= price; if (WEAPONS[id]) e.giveWeapon(id); return true; } return false; };
  const fullBuy = m() >= 3700;
  if (!e.inv[1]) {
    if (fullBuy) {
      if (m() >= 6200 && Math.random() < 0.18) buy('longbow', 4750);
      else buy(e.team === 'T' ? 'raptor' : 'sentinel', e.team === 'T' ? 2700 : 2900);
    } else if (m() >= 2200 && Math.random() < 0.6) {
      buy(Math.random() < 0.7 ? 'hornet' : 'bulldog', 1250);
    } else if (m() >= 1500 && Math.random() < 0.5) {
      buy('magnum', 700);
    }
  }
  if (e.armor < 100) {
    if (m() >= 1000 && (e.inv[1] || m() > 2500)) { e.money -= 1000; e.armor = 100; e.helmet = true; }
    else if (m() >= 650 && e.inv[1]) { e.money -= 650; e.armor = 100; }
  }
  if (m() >= 300 && e.inv[4] === 0 && Math.random() < 0.6) { e.money -= 300; e.inv[4] = 1; }
  e.switchTo(e.inv[1] ? 1 : 2);
  updateAvatarWeapon(e);
}
