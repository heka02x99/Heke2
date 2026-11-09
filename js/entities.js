// Oyuncu/bot varlıkları, atış, hasar, efektler ve el bombaları.

const G = {
  scene: null, camera: null, renderer: null,
  entities: [], player: null,
  grenades: [], effects: [],
  bomb: null,
  difficulty: 1,
  time: 0,
};

const STAND_H = 1.8, CROUCH_H = 1.25, EYE_STAND = 1.65, EYE_CROUCH = 1.1, RADIUS = 0.35;
const TEAM_COLOR = { T: 0xf2b54a, CT: 0x6fb3ff };

class Entity {
  constructor(name, team, isBot) {
    this.name = name; this.team = team; this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.punchPitch = 0; this.punchYaw = 0;
    this.hp = 100; this.armor = 0; this.helmet = false;
    this.money = 800;
    this.alive = true;
    this.crouch = false; this.crouchAmt = 0; this.onGround = true;
    this.kills = 0; this.deaths = 0; this.roundKills = 0;
    this.inv = { 1: null, 2: 'kestrel', 3: 'knife', 4: 0, 5: false };
    this.ammo = {};
    this.slot = 2; this.lastSlot = 3;
    this.nextFire = 0; this.reloading = 0; this.shotsFired = 0; this.lastShot = -10;
    this.scoped = false;
    this.stepAcc = 0;
    this.lastDamagedBy = null;
    this.giveWeapon('kestrel');
    this.avatar = createAvatar(team);
    G.scene.add(this.avatar);
  }

  get height() { return STAND_H - (STAND_H - CROUCH_H) * this.crouchAmt; }
  get eyeY() { return this.pos.y + EYE_STAND - (EYE_STAND - EYE_CROUCH) * this.crouchAmt; }
  get weaponId() {
    const s = this.slot;
    if (s === 4) return this.inv[4] > 0 ? 'he' : 'knife';
    if (s === 5) return this.inv[5] ? 'c4' : 'knife';
    return this.inv[s] || 'knife';
  }
  get weapon() { return WEAPONS[this.weaponId]; }

  giveWeapon(id) {
    const w = WEAPONS[id];
    if (w.slot === 4) { this.inv[4] = 1; return; }
    this.inv[w.slot] = id;
    this.ammo[id] = { mag: w.mag, res: w.reserve };
  }

  resetForRound() {
    this.hp = 100; this.alive = true; this.vel.set(0, 0, 0);
    this.punchPitch = this.punchYaw = 0; this.reloading = 0; this.scoped = false;
    this.crouch = false; this.crouchAmt = 0; this.roundKills = 0; this.lastDamagedBy = null;
    // hayatta kalan oyuncu silahlarını korur; şarjörleri doldur
    for (const id in this.ammo) { const w = WEAPONS[id]; this.ammo[id] = { mag: w.mag, res: w.reserve }; }
    this.inv[5] = false;
    this.switchTo(this.inv[1] ? 1 : 2);
    this.avatar.visible = true;
    this.avatar.rotation.set(0, this.yaw, 0);
    this.avatar.position.copy(this.pos);
  }

  stripOnDeath() {
    this.inv = { 1: null, 2: 'kestrel', 3: 'knife', 4: 0, 5: false };
    this.ammo = {}; this.armor = 0; this.helmet = false;
    this.giveWeapon('kestrel');
  }

  switchTo(slot) {
    if (slot === this.slot) return;
    if (slot === 1 && !this.inv[1]) return;
    if (slot === 4 && this.inv[4] <= 0) return;
    if (slot === 5 && !this.inv[5]) return;
    this.lastSlot = this.slot;
    this.slot = slot;
    this.reloading = 0; this.scoped = false; this.shotsFired = 0;
    this.nextFire = Math.max(this.nextFire, G.time + 0.35);
    updateAvatarWeapon(this);
    if (this === G.player && typeof onPlayerWeaponChange === 'function') onPlayerWeaponChange();
  }

  startReload() {
    const w = this.weapon, a = this.ammo[this.weaponId];
    if (!a || w.melee || w.grenade || this.reloading || a.mag >= w.mag || a.res <= 0) return;
    this.reloading = G.time + w.reload;
    this.scoped = false;
    if (this === G.player) Sound.reload();
  }

  updateReload() {
    if (this.reloading && G.time >= this.reloading) {
      const w = this.weapon, a = this.ammo[this.weaponId];
      if (a) { const need = w.mag - a.mag, take = Math.min(need, a.res); a.mag += take; a.res -= take; }
      this.reloading = 0;
    }
  }

  // Yön vektörü (bakış + geri tepme)
  aimDir(extraPitch = 0, extraYaw = 0) {
    const p = this.pitch + this.punchPitch + extraPitch, y = this.yaw + this.punchYaw + extraYaw;
    return new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }

  speed2D() { return Math.hypot(this.vel.x, this.vel.z); }

  // Mevcut isabetsizlik (radyan)
  currentSpread() {
    const w = this.weapon;
    let s = w.scope && !this.scoped ? w.unscopedSpread : w.spread;
    const sp = this.speed2D();
    if (sp > 1.4) s += w.moveSpread * Math.min(1, (sp - 1.4) / 3.5);
    if (!this.onGround) s += w.airSpread;
    if (this.crouchAmt > 0.5 && this.onGround) s *= 0.7;
    if (w.auto) s += Math.min(this.shotsFired, 12) * w.spread * 0.35;
    return s;
  }
}

// ------------------------------------------------------------------
// Avatar (botlar ve ölü/izlenen oyuncu için basit karakter modeli)
function createAvatar(team) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: team === 'T' ? 0x7a6040 : 0x2c3e5c, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: team === 'T' ? 0x4a3b28 : 0x1d2a3d, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89670, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: team === 'T' ? 0x222222 : 0x2e3b2e, roughness: 0.7 });
  const box = (w, h, d, x, y, z, m, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };

  const legs = new THREE.Group(); g.add(legs);
  g.userData.legL = box(0.18, 0.8, 0.2, -0.12, 0.4, 0, cloth, legs);
  g.userData.legR = box(0.18, 0.8, 0.2, 0.12, 0.4, 0, cloth, legs);
  const upper = new THREE.Group(); upper.position.y = 0.8; g.add(upper);
  box(0.5, 0.62, 0.28, 0, 0.31, 0, cloth, upper);
  box(0.52, 0.42, 0.32, 0, 0.36, 0, vest, upper);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), skin);
  head.position.set(0, 0.82, 0); head.castShadow = true; upper.add(head);
  // T: kar maskesi, CT: kask
  if (team === 'T') {
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), headMat);
    mask.position.copy(head.position); upper.add(mask);
  } else {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), headMat);
    helm.position.set(0, 0.85, 0); upper.add(helm);
  }
  // kollar silahı tutar
  const arms = new THREE.Group(); arms.position.set(0, 0.5, -0.1); upper.add(arms);
  box(0.12, 0.12, 0.45, -0.2, 0, -0.18, cloth, arms);
  box(0.12, 0.12, 0.45, 0.2, 0, -0.18, cloth, arms);
  const gunHolder = new THREE.Group(); gunHolder.position.set(0.05, 0.02, -0.35); arms.add(gunHolder);
  g.userData.upper = upper; g.userData.legs = legs; g.userData.arms = arms; g.userData.gunHolder = gunHolder;
  return g;
}

function updateAvatarWeapon(e) {
  const gh = e.avatar.userData.gunHolder;
  while (gh.children.length) gh.remove(gh.children[0]);
  const m = buildGunMesh(e.weaponId, false);
  m.scale.setScalar(1.15);
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  gh.add(m);
}

function updateAvatar(e, dt) {
  const a = e.avatar;
  if (!e.alive) {
    // yere düşme animasyonu
    a.userData.fall = Math.min(1, (a.userData.fall || 0) + dt * 3);
    a.rotation.x = -Math.PI / 2 * a.userData.fall;
    a.position.set(e.pos.x, e.pos.y + 0.15 * a.userData.fall, e.pos.z);
    return;
  }
  a.userData.fall = 0;
  a.position.copy(e.pos);
  a.rotation.set(0, e.yaw, 0);
  const c = e.crouchAmt;
  a.userData.legs.scale.y = 1 - c * 0.55;
  a.userData.upper.position.y = 0.8 - c * 0.44;
  a.userData.arms.rotation.x = e.pitch * 0.9;
  // yürüme animasyonu
  const sp = e.speed2D();
  e.walkPhase = (e.walkPhase || 0) + dt * sp * 2.2;
  const sw = Math.sin(e.walkPhase) * Math.min(1, sp / 4) * 0.6;
  a.userData.legL.rotation.x = sw; a.userData.legR.rotation.x = -sw;
}

// ------------------------------------------------------------------
// Atış ve hasar

function hitTestEntities(shooter, ox, oy, oz, d, maxDist) {
  let best = maxDist, hit = null, part = null;
  for (const e of G.entities) {
    if (!e.alive || e === shooter) continue;
    const h = e.height;
    const headY = e.pos.y + h - 0.2;
    const th = raySphere(ox, oy, oz, d.x, d.y, d.z, e.pos.x, headY, e.pos.z, 0.21);
    if (th < best) { best = th; hit = e; part = 'head'; }
    const tb = rayBox(ox, oy, oz, d.x, d.y, d.z, {
      minX: e.pos.x - 0.28, maxX: e.pos.x + 0.28, minZ: e.pos.z - 0.28, maxZ: e.pos.z + 0.28,
      minY: e.pos.y, maxY: e.pos.y + h - 0.4,
    });
    if (tb < best) {
      best = tb; hit = e;
      const hy = oy + d.y * tb - e.pos.y;
      part = hy < (h - 0.4) * 0.48 ? 'legs' : 'body';
    }
  }
  return hit ? { ent: hit, dist: best, part } : null;
}

function applyDamage(target, dmg, attacker, weaponId, part) {
  if (!target.alive) return 0;
  if (attacker && attacker !== target && attacker.team === target.team) return 0; // dost ateşi kapalı
  const w = WEAPONS[weaponId];
  if (part === 'head') dmg *= (w && w.headMul) || 1;
  else if (part === 'legs') dmg *= 0.75;
  const armored = target.armor > 0 && (part !== 'head' || target.helmet) && part !== 'legs';
  if (armored && w && w.armorPen) {
    const reduced = dmg * w.armorPen;
    target.armor = Math.max(0, Math.round(target.armor - (dmg - reduced) * 0.5));
    dmg = reduced;
  }
  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;
  target.lastDamagedBy = attacker;
  if (target === G.player) onPlayerHurt(attacker);
  if (target.isBot && attacker) botHeard(target, attacker, true);
  if (target.hp <= 0) {
    target.hp = 0;
    killEntity(target, attacker, weaponId, part === 'head');
  }
  return dmg;
}

function killEntity(victim, killer, weaponId, headshot) {
  victim.alive = false;
  victim.deaths++;
  victim.scoped = false;
  victim.avatar.visible = true;
  if (killer && killer !== victim) {
    killer.kills++; killer.roundKills++;
    const reward = (WEAPONS[weaponId] && WEAPONS[weaponId].kill) || 300;
    killer.money = Math.min(16000, killer.money + reward);
  }
  if (victim.inv[5]) dropBomb(victim);
  victim.stripOnDeath();
  onKill(victim, killer, weaponId, headshot);
}

// Bir atış yap (oyuncu veya bot). spreadExtra: bot isabetsizliği.
function fireWeapon(e, spreadExtra = 0) {
  const w = e.weapon, id = e.weaponId;
  if (!e.alive || G.time < e.nextFire || e.reloading) return false;
  if (w.bomb) return false;
  if (w.grenade) { throwGrenade(e); return true; }

  const a = e.ammo[id];
  if (!w.melee) {
    if (!a || a.mag <= 0) {
      if (e === G.player) Sound.empty();
      e.nextFire = G.time + 0.25;
      if (a && a.res > 0) e.startReload();
      return false;
    }
    a.mag--;
  }
  e.nextFire = G.time + 60 / w.rpm;

  // geri tepme sıfırlama
  if (G.time - e.lastShot > 60 / w.rpm * 2.2 + 0.15) e.shotsFired = 0;
  e.lastShot = G.time;

  const ox = e.pos.x, oy = e.eyeY, oz = e.pos.z;
  const spread = (w.melee ? 0 : e.currentSpread()) + spreadExtra;
  const pellets = w.pellets || 1;
  const listener = G.listener;
  Sound.shot(w.sound, e.pos, listener);
  if (e.isBot) for (const b of G.entities) if (b.isBot && b.alive && b.team !== e.team) botHeard(b, e, false);

  let anyHit = null;
  for (let p = 0; p < pellets; p++) {
    const r = Math.sqrt(Math.random()) * spread, ang = Math.random() * Math.PI * 2;
    const d = e.aimDir(Math.sin(ang) * r, Math.cos(ang) * r);
    const maxD = w.melee ? w.range : 400;
    const wh = raycastWorld(ox, oy, oz, d.x, d.y, d.z, maxD);
    const wallDist = wh ? wh.dist : maxD;
    const eh = hitTestEntities(e, ox, oy, oz, d, wallDist);
    let endDist = wallDist;
    if (eh) {
      endDist = eh.dist;
      const dmg = (w.damage) * Math.pow(w.falloff || 1, eh.dist / 25);
      applyDamage(eh.ent, dmg, e, id, eh.part);
      spawnBlood(ox + d.x * eh.dist, oy + d.y * eh.dist, oz + d.z * eh.dist);
      if (!anyHit || eh.part === 'head') anyHit = eh;
    } else if (wh && !w.melee) {
      spawnImpact(wh);
    }
    if (!w.melee && (p === 0 || pellets > 1 && p % 3 === 0)) {
      spawnTracer(e, d, endDist);
    }
  }
  if (anyHit && e === G.player) { Sound.hit(anyHit.part === 'head'); showHitmarker(anyHit.part === 'head'); }

  // geri tepme
  if (!w.melee) {
    const [up, side] = sprayOffset(e.shotsFired);
    e.punchPitch += w.recoil * up;
    e.punchYaw += w.recoil * side * 0.6;
    e.shotsFired++;
    if (w.scope) e.scoped = false;
    if (a.mag === 0 && a.res > 0 && e.isBot) e.startReload();
    e.muzzleFlash = 0.05;
  }
  if (e === G.player) onPlayerFired(w);
  return true;
}

function updateRecoil(e, dt) {
  const w = e.weapon;
  const since = G.time - e.lastShot;
  if (since > (w.rpm ? 60 / w.rpm : 0.1) * 1.1) {
    const k = Math.exp(-(w.recoverRate || 5) * dt);
    e.punchPitch *= k; e.punchYaw *= k;
  }
}

// ------------------------------------------------------------------
// Efektler

const _fx = {};
function initFX() {
  _fx.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8 });
  _fx.impactGeo = new THREE.PlaneGeometry(0.12, 0.12);
  _fx.impactMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  _fx.sparkMat = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.08, transparent: true });
  _fx.bloodMat = new THREE.PointsMaterial({ color: 0xaa1010, size: 0.1, transparent: true });
  _fx.impacts = [];
}

function spawnTracer(e, d, dist) {
  if (dist < 1) return;
  const start = new THREE.Vector3(e.pos.x, e.eyeY - 0.12, e.pos.z).addScaledVector(d, 0.8);
  if (e === G.player) {
    const right = new THREE.Vector3(Math.cos(e.yaw), 0, -Math.sin(e.yaw));
    start.addScaledVector(right, 0.15);
  }
  const end = new THREE.Vector3(e.pos.x, e.eyeY, e.pos.z).addScaledVector(d, dist);
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geo, _fx.tracerMat.clone());
  G.scene.add(line);
  G.effects.push({ obj: line, life: 0.05, max: 0.05, fade: true });
}

function spawnImpact(hit) {
  const m = new THREE.Mesh(_fx.impactGeo, _fx.impactMat);
  const n = new THREE.Vector3(...hit.normal);
  m.position.set(hit.x, hit.y, hit.z).addScaledVector(n, 0.01);
  m.lookAt(m.position.clone().add(n));
  G.scene.add(m);
  _fx.impacts.push(m);
  if (_fx.impacts.length > 120) G.scene.remove(_fx.impacts.shift());
  spawnParticles(hit.x + n.x * 0.05, hit.y + n.y * 0.05, hit.z + n.z * 0.05, _fx.sparkMat, 6, n);
}

function spawnBlood(x, y, z) { spawnParticles(x, y, z, _fx.bloodMat, 10, null); }

function spawnParticles(x, y, z, mat, n, normal) {
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(3);
    if (normal) v.addScaledVector(new THREE.Vector3(...[normal.x, normal.y, normal.z]), 2);
    vel.push(v);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, mat.clone());
  G.scene.add(pts);
  G.effects.push({ obj: pts, life: 0.35, max: 0.35, fade: true, vel });
}

function updateEffects(dt) {
  for (let i = G.effects.length - 1; i >= 0; i--) {
    const f = G.effects[i];
    f.life -= dt;
    if (f.vel) {
      const p = f.obj.geometry.attributes.position;
      for (let k = 0; k < f.vel.length; k++) {
        f.vel[k].y -= 9.8 * dt;
        p.setXYZ(k, p.getX(k) + f.vel[k].x * dt, p.getY(k) + f.vel[k].y * dt, p.getZ(k) + f.vel[k].z * dt);
      }
      p.needsUpdate = true;
    }
    if (f.update) f.update(f, dt);
    if (f.fade && f.obj.material) f.obj.material.opacity = Math.max(0, f.life / f.max);
    if (f.life <= 0) {
      G.scene.remove(f.obj);
      if (f.obj.geometry && !f.keepGeo) f.obj.geometry.dispose();
      if (f.obj.material && f.obj.material.dispose) f.obj.material.dispose();
      G.effects.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------
// El bombaları

function throwGrenade(e) {
  if (e.inv[4] <= 0) return;
  e.inv[4]--;
  e.nextFire = G.time + 0.8;
  const d = e.aimDir(0.08, 0);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3d5a2a }));
  mesh.castShadow = true;
  const pos = new THREE.Vector3(e.pos.x, e.eyeY - 0.1, e.pos.z).addScaledVector(d, 0.5);
  const vel = d.clone().multiplyScalar(17).add(new THREE.Vector3(e.vel.x * 0.5, 0, e.vel.z * 0.5));
  mesh.position.copy(pos);
  G.scene.add(mesh);
  G.grenades.push({ mesh, pos, vel, t: 1.7, owner: e });
  Sound.shot('knife', e.pos, G.listener);
  if (e.inv[4] <= 0) e.switchTo(e.inv[1] ? 1 : 2);
}

function insideAnyBox(p, r) {
  if (p.y - r < 0) return 'floor';
  for (const b of MAP.boxes) {
    if (p.x + r > b.minX && p.x - r < b.maxX && p.y + r > b.minY && p.y - r < b.maxY && p.z + r > b.minZ && p.z - r < b.maxZ) return b;
  }
  return null;
}

function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.t -= dt;
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      g.vel.y -= 16 * h;
      for (const ax of ['x', 'y', 'z']) {
        const old = g.pos[ax];
        g.pos[ax] += g.vel[ax] * h;
        if (insideAnyBox(g.pos, 0.08)) {
          g.pos[ax] = old;
          const sp = g.vel.length();
          g.vel[ax] *= -0.45;
          if (ax === 'y') { g.vel.x *= 0.75; g.vel.z *= 0.75; }
          if (sp > 3) Sound.bounce(g.pos, G.listener);
        }
      }
    }
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.x += dt * 8;
    if (g.t <= 0) {
      explode(g.pos, g.owner, 9, 100, 'he');
      G.scene.remove(g.mesh);
      G.grenades.splice(i, 1);
    }
  }
}

function explode(pos, owner, radius, maxDmg, weaponId, ignoreLOS) {
  Sound.explosion(pos, G.listener);
  // görsel
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 }));
  ball.position.copy(pos);
  G.scene.add(ball);
  const light = new THREE.PointLight(0xffaa44, 40, radius * 3);
  light.position.copy(pos).y += 1;
  G.scene.add(light);
  G.effects.push({ obj: ball, life: 0.45, max: 0.45, fade: true, update: (f) => ball.scale.setScalar(radius * 0.6 * (1 - f.life / f.max) + 0.5) });
  G.effects.push({ obj: light, life: 0.4, max: 0.4, update: (f) => { light.intensity = 40 * f.life / f.max; } });
  spawnParticles(pos.x, pos.y + 0.3, pos.z, _fx.sparkMat, 30, null);

  for (const e of G.entities) {
    if (!e.alive) continue;
    const cx = e.pos.x, cy = e.pos.y + 1.0, cz = e.pos.z;
    const d = Math.hypot(cx - pos.x, cy - pos.y, cz - pos.z);
    if (d > radius) continue;
    if (!ignoreLOS && !hasLOS(pos.x, pos.y + 0.3, pos.z, cx, cy, cz)) continue;
    if (owner && owner.team === e.team && owner !== e) continue;
    let dmg = maxDmg * Math.pow(1 - d / radius, 1.3);
    if (e.armor > 0) { dmg *= 0.6; e.armor = Math.max(0, e.armor - Math.round(dmg * 0.3)); }
    applyDamage(e, dmg, owner, weaponId, 'body');
  }
  if (G.player && G.player.alive) {
    const d = G.player.pos.distanceTo(pos);
    if (d < radius * 2.5) G.shake = Math.max(G.shake || 0, 0.25 * (1 - d / (radius * 2.5)));
  }
}

// ------------------------------------------------------------------
// C4

function createBombMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.26), new THREE.MeshStandardMaterial({ color: 0x7a6b45, roughness: 0.8 }));
  body.position.y = 0.075; body.castShadow = true; g.add(body);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  led.position.set(0.1, 0.16, 0); g.add(led);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0x113311 }));
  screen.position.set(-0.06, 0.155, 0); g.add(screen);
  g.userData.led = led;
  return g;
}

function dropBomb(e) {
  e.inv[5] = false;
  const b = G.bomb;
  b.state = 'dropped'; b.carrier = null;
  b.pos.set(e.pos.x, 0, e.pos.z);
  b.mesh.position.copy(b.pos);
  b.mesh.visible = true;
  if (e.slot === 5) e.switchTo(e.inv[1] ? 1 : 2);
}
