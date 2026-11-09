// Ana oyun: sahne, oyuncu kontrolü, tur yönetimi, C4 ve döngü.

const FREEZE_TIME = 6, ROUND_TIME = 115, BOMB_TIME = 40, ROUND_END_TIME = 5;
const PLANT_TIME = 3.2, DEFUSE_TIME = 5, BUY_TIME = 20, WIN_ROUNDS = 8;
const BASE_SPEED = 5.4;
const BOT_NAMES = { T: ['Kartal', 'Bozkurt', 'Atmaca', 'Şahin', 'Doğan'], CT: ['Aslan', 'Kaplan', 'Pars', 'Vaşak', 'Puma'] };

const input = { keys: {}, mouseDown: false, firedThisPress: false, sens: 1 };
const settings = { team: 'T', diff: 1 };
let started = false, matchOver = false;
let vmScene, vmCam, vmGun, vmRoot, vmFlash, muzzleLight;
const vmState = { kick: 0, bob: 0, draw: 0 };
let clock;

// ------------------------------------------------------------------
// Kurulum
function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  $('game').appendChild(renderer.domElement);
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc4e4);
  scene.fog = new THREE.Fog(0xb8d0e2, 60, 170);
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';
  G.camera = camera;

  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x8a7350, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(40, 80, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  buildMap(scene);
  initFX();

  // C4 modeli
  G.bomb = { state: 'carried', carrier: null, pos: new THREE.Vector3(), mesh: createBombMesh(), timer: 0, site: null, defuser: null, beepT: 0 };
  G.bomb.mesh.visible = false;
  scene.add(G.bomb.mesh);

  muzzleLight = new THREE.PointLight(0xffc060, 0, 8);
  scene.add(muzzleLight);

  // Birinci şahıs silah sahnesi (duvarların içine girmesin diye ayrı çizilir)
  vmScene = new THREE.Scene();
  vmCam = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffffff, 0x665544, 1.4));
  const vl = new THREE.DirectionalLight(0xffffff, 1.4); vl.position.set(1, 2, 1); vmScene.add(vl);
  vmRoot = new THREE.Group(); vmScene.add(vmRoot);
  vmFlash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 }));
  vmFlash.visible = false;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = vmCam.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  });

  setupInput();
  setupMenu();
  clock = new THREE.Clock();
  G.round = { number: 0, state: 'freeze', timer: 0, tSite: 'A' };
  G.score = { T: 0, CT: 0 };
  G.lossStreak = { T: 0, CT: 0 };
  // arka planda sahneyi göster
  camera.position.set(0, 30, 70); camera.lookAt(0, 0, 0);
  requestAnimationFrame(loop);
}

function buildViewmodel() {
  while (vmRoot.children.length) vmRoot.remove(vmRoot.children[0]);
  const p = G.player;
  vmGun = buildGunMesh(p.weaponId, true);
  vmGun.position.set(0.17, -0.17, -0.55);
  vmGun.scale.setScalar(0.85);
  if (p.weaponId === 'knife') { vmGun.position.set(0.22, -0.2, -0.32); vmGun.rotation.set(0.2, 0.3, -0.3); }
  if (p.weaponId === 'he' || p.weaponId === 'c4') vmGun.position.set(0.18, -0.2, -0.32);
  // kol
  const sleeve = new THREE.MeshStandardMaterial({ color: p.team === 'T' ? 0x7a6040 : 0x2c3e5c, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.26), sleeve);
  arm.position.set(0.03, -0.08, 0.17); arm.rotation.x = 0.3;
  vmGun.add(arm);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.08), glove);
  hand.position.set(0, -0.05, 0.05); vmGun.add(hand);
  vmFlash.position.set(0, 0.01, vmGun.userData.muzzle - 0.03);
  vmGun.add(vmFlash);
  vmRoot.add(vmGun);
  vmState.draw = 1;
}
function onPlayerWeaponChange() { buildViewmodel(); }

// ------------------------------------------------------------------
// Girdi
function setupInput() {
  const canvas = G.renderer.domElement;
  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') { e.preventDefault(); if (started) { HUD.renderScoreboard(); $('scoreboard').classList.remove('hidden'); } return; }
    if (!started || G.paused) return;
    input.keys[e.code] = true;
    const p = G.player;
    if (e.code === 'KeyB') { toggleBuy(); return; }
    if (G.buyOpen) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= BUY_LIST.length) buyItem(n - 1);
      if (e.code === 'Escape') toggleBuy(false);
      return;
    }
    if (!p.alive) return;
    if (e.code === 'Digit1') p.switchTo(1);
    if (e.code === 'Digit2') p.switchTo(2);
    if (e.code === 'Digit3') p.switchTo(3);
    if (e.code === 'Digit4') p.switchTo(4);
    if (e.code === 'Digit5') p.switchTo(5);
    if (e.code === 'KeyQ') p.switchTo(p.lastSlot);
    if (e.code === 'KeyR') p.startReload();
    if (e.code === 'KeyG') { if (p.inv[4] > 0) { p.switchTo(4); setTimeout(() => { if (p.slot === 4 && p.alive) { p.nextFire = 0; fireWeapon(p); } }, 380); } }
  });
  document.addEventListener('keyup', e => {
    input.keys[e.code] = false;
    if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas || !G.player) return;
    const p = G.player;
    if (!p.alive) return;
    let s = 0.0022 * input.sens;
    if (p.scoped) s *= 0.35;
    p.yaw -= e.movementX * s;
    p.pitch -= e.movementY * s;
    p.pitch = Math.max(-1.54, Math.min(1.54, p.pitch));
  });
  canvas.addEventListener('mousedown', e => {
    if (!started) return;
    if (document.pointerLockElement !== canvas) { if (!G.buyOpen) lockPointer(); return; }
    if (e.button === 0) {
      input.mouseDown = true; input.firedThisPress = false;
      if (!G.player.alive) cycleSpectate();
    }
    if (e.button === 2) {
      const p = G.player;
      if (p.alive && p.weapon.scope && !p.reloading) p.scoped = !p.scoped;
    }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) input.mouseDown = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && started && !G.buyOpen && !matchOver) pause();
  });
  window.addEventListener('blur', () => { input.keys = {}; input.mouseDown = false; });
}

function lockPointer() {
  const c = G.renderer.domElement;
  try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* bazı ortamlarda desteklenmez */ }
}

function pause() {
  G.paused = true;
  input.keys = {}; input.mouseDown = false;
  $('menu').classList.remove('hidden');
  $('play-btn').textContent = 'YENİ MAÇ';
  $('resume-btn').classList.remove('hidden');
}

function setupMenu() {
  document.querySelectorAll('#team-choice button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#team-choice button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); settings.team = b.dataset.team;
  });
  document.querySelectorAll('#diff-choice button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#diff-choice button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); settings.diff = +b.dataset.diff;
  });
  $('sens').oninput = () => { input.sens = +$('sens').value; $('sens-val').textContent = (+$('sens').value).toFixed(1); };
  $('play-btn').onclick = () => { Sound.init(); startMatch(); };
  $('resume-btn').onclick = () => {
    Sound.init();
    G.difficulty = settings.diff;
    $('menu').classList.add('hidden');
    G.paused = false;
    lockPointer();
  };
}

// ------------------------------------------------------------------
// Maç ve tur yönetimi
function startMatch() {
  // eski varlıkları temizle
  for (const e of G.entities) G.scene.remove(e.avatar);
  G.entities = [];
  for (const g of G.grenades) G.scene.remove(g.mesh);
  G.grenades = [];
  G.difficulty = settings.diff;
  G.score = { T: 0, CT: 0 };
  G.lossStreak = { T: 0, CT: 0 };
  G.round.number = 0;
  matchOver = false;

  const p = new Entity('Sen', settings.team, false);
  G.player = p;
  G.entities.push(p);
  for (const team of ['T', 'CT']) {
    const n = team === settings.team ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const b = new Entity(BOT_NAMES[team][i], team, true);
      initBot(b);
      G.entities.push(b);
    }
  }
  for (const e of G.entities) { e.money = 800; updateAvatarWeapon(e); }

  started = true; G.paused = false;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('resume-btn').classList.add('hidden');
  lockPointer();
  startRound();
}

function startRound() {
  const R = G.round;
  R.number++;
  R.state = 'freeze';
  R.timer = FREEZE_TIME;
  R.tSite = Math.random() < 0.5 ? 'A' : 'B';
  R.liveTime = 0;

  for (const g of G.grenades) G.scene.remove(g.mesh);
  G.grenades = [];

  const spawnIdx = { T: 0, CT: 0 };
  const shuffled = { T: [...MAP.spawns.T].sort(() => Math.random() - 0.5), CT: [...MAP.spawns.CT].sort(() => Math.random() - 0.5) };
  for (const e of G.entities) {
    const sp = shuffled[e.team][spawnIdx[e.team]++ % 5];
    e.pos.set(sp[0], 0, sp[1]);
    e.yaw = e.team === 'T' ? 0 : Math.PI;
    e.pitch = 0;
    e.resetForRound();
    if (e.isBot) { initBot(e); }
  }

  // CT rollerini dağıt
  const roles = ['A', 'A', 'B', 'B', 'M'].sort(() => Math.random() - 0.5);
  let ri = 0;
  for (const e of G.entities) if (e.isBot && e.team === 'CT') e.bot.role = roles[ri++];
  let wi = 0;
  for (const e of G.entities) if (e.isBot && e.team === 'T') { e.bot.waitUntil = 0; e.bot.holdIdx = wi++; }

  // bot alışverişi
  for (const e of G.entities) if (e.isBot) botBuy(e);

  // C4'ü bir T'ye ver
  const ts = G.entities.filter(e => e.team === 'T');
  const carrier = (G.player.team === 'T' && Math.random() < 0.5) ? G.player : ts[Math.floor(Math.random() * ts.length)];
  carrier.inv[5] = true;
  if (carrier.isBot) carrier.bot.plantOff = (Math.random() - 0.5) * 2;
  G.bomb.state = 'carried'; G.bomb.carrier = carrier; G.bomb.mesh.visible = false; G.bomb.defuser = null;

  G.spectating = null;
  G.playerAction = null;
  HUD.hideProgress();
  buildViewmodel();
  const bombNote = carrier === G.player ? 'C4 sende! Bir bölgeye (A/B) git ve E ile kur.' : (G.player.team === 'T' ? `C4 ${carrier.name} adlı oyuncuda.` : 'Bölgeleri savun, kurulan bombayı E ile imha et.');
  HUD.setMsg(`TUR ${R.number}`, `${bombNote}  ·  B: satın al`, FREEZE_TIME);
  Sound.roundStart();
}

function endRound(winner, reason) {
  const R = G.round;
  if (R.state === 'over') return;
  R.state = 'over';
  R.timer = ROUND_END_TIME;
  G.score[winner]++;
  const loser = winner === 'T' ? 'CT' : 'T';
  G.lossStreak[winner] = 0;
  const lossBonus = Math.min(3400, 1400 + 500 * G.lossStreak[loser]);
  G.lossStreak[loser]++;
  const bombPlanted = G.bomb.state === 'planted' || G.bomb.state === 'exploded' || G.bomb.state === 'defused';
  for (const e of G.entities) {
    let m = e.team === winner ? (reason === 'bomb' ? 3500 : 3250) : lossBonus;
    if (e.team === 'T' && loser === 'T' && bombPlanted) m += 800;
    e.money = Math.min(16000, e.money + m);
  }
  const name = winner === 'T' ? 'SALDIRI' : 'SAVUNMA';
  const reasons = { elim: 'Rakip takım yok edildi', time: 'Süre doldu', bomb: 'Bomba patladı', defuse: 'Bomba imha edildi' };
  const mine = winner === G.player.team;
  HUD.setMsg(`${name} KAZANDI`, reasons[reason], ROUND_END_TIME, winner === 'T' ? '#f2b54a' : '#6fb3ff');
  mine ? Sound.win() : Sound.lose();
  if (G.score[winner] >= WIN_ROUNDS) {
    matchOver = true;
    setTimeout(() => {
      HUD.setMsg(mine ? 'MAÇI KAZANDIN!' : 'MAÇI KAYBETTİN', `Skor ${G.score.T} - ${G.score.CT}`, 999, mine ? '#7dff7d' : '#ff6060');
      document.exitPointerLock && document.exitPointerLock();
      setTimeout(() => {
        $('menu').classList.remove('hidden');
        $('play-btn').textContent = 'TEKRAR OYNA';
        $('resume-btn').classList.add('hidden');
        started = false;
      }, 2500);
    }, 1500);
  }
}

function checkElimination() {
  const R = G.round;
  if (R.state !== 'live') return;
  const aliveT = G.entities.some(e => e.team === 'T' && e.alive);
  const aliveCT = G.entities.some(e => e.team === 'CT' && e.alive);
  if (!aliveCT) endRound('T', 'elim');
  else if (!aliveT && G.bomb.state !== 'planted') endRound('CT', 'elim');
}

function onKill(victim, killer, weaponId, hs) {
  HUD.killfeed(victim, killer, weaponId, hs);
  if (victim.isBot && victim.bot.action) cancelBotAction(victim);
  if (victim === G.player) {
    G.playerAction = null; HUD.hideProgress();
    G.player.scoped = false;
    if (G.buyOpen) toggleBuy(false);
    setTimeout(() => { if (!G.player.alive) cycleSpectate(); }, 1500);
    HUD.setMsg('ÖLDÜN', killer && killer !== victim ? `${killer.name} seni öldürdü` : '', 2.5, '#ff5555');
  }
  if (G.spectating === victim) setTimeout(cycleSpectate, 1200);
  checkElimination();
}

function cycleSpectate() {
  if (G.player.alive) return;
  const mates = G.entities.filter(e => e.alive && e.team === G.player.team && e !== G.player);
  const list = mates.length ? mates : G.entities.filter(e => e.alive);
  if (!list.length) { G.spectating = null; return; }
  const i = list.indexOf(G.spectating);
  G.spectating = list[(i + 1) % list.length];
}

// ------------------------------------------------------------------
// C4
function canPlant(e) {
  return e.alive && e.inv[5] && e.onGround && G.round.state === 'live' && siteAt(e.pos.x, e.pos.z);
}
function canDefuse(e) {
  const b = G.bomb;
  return e.alive && e.team === 'CT' && b.state === 'planted' && Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) < 1.8 && Math.abs(e.pos.y - b.pos.y) < 1.5;
}
function plantBomb(e) {
  if (!canPlant(e)) return;
  const b = G.bomb;
  e.inv[5] = false;
  b.state = 'planted'; b.carrier = null;
  b.pos.set(e.pos.x, e.pos.y, e.pos.z);
  b.site = siteAt(e.pos.x, e.pos.z);
  b.timer = BOMB_TIME; b.beepT = 0;
  b.mesh.position.copy(b.pos); b.mesh.rotation.y = e.yaw; b.mesh.visible = true;
  e.money = Math.min(16000, e.money + 300);
  if (e.slot === 5) e.switchTo(e.inv[1] ? 1 : 2);
  Sound.plant();
  HUD.setMsg('BOMBA KURULDU', `${b.site} bölgesi · ${BOMB_TIME} saniye`, 3, '#ff5050');
  // CT botları bombayı duyar
  for (const o of G.entities) if (o.isBot && o.team === 'CT') { o.bot.path = []; o.bot.goalKey = null; }
}
function defuseBomb(e) {
  const b = G.bomb;
  if (!canDefuse(e)) return;
  b.state = 'defused'; b.defuser = null;
  e.money = Math.min(16000, e.money + 300);
  endRound('CT', 'defuse');
}

function updateBomb(dt) {
  const b = G.bomb, R = G.round;
  if (b.state === 'dropped') {
    b.mesh.rotation.y += dt;
    if (R.state === 'live' || R.state === 'freeze') {
      for (const e of G.entities) {
        if (e.alive && e.team === 'T' && Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) < 1.1) {
          e.inv[5] = true; b.state = 'carried'; b.carrier = e; b.mesh.visible = false;
          if (e.isBot) e.bot.plantOff = 0;
          if (e === G.player) HUD.setMsg('C4 alındı', 'Bir bölgeye git ve E ile kur', 2);
          break;
        }
      }
    }
  }
  if (b.state === 'planted') {
    b.timer -= dt;
    b.beepT -= dt;
    const interval = b.timer > 20 ? 1 : b.timer > 10 ? 0.5 : b.timer > 5 ? 0.25 : 0.12;
    b.mesh.userData.led.material.color.setHex(b.beepT > interval * 0.5 ? 0xff2222 : 0x330000);
    if (b.beepT <= 0) {
      b.beepT = interval;
      const d = G.listener ? Math.hypot(G.listener.pos.x - b.pos.x, G.listener.pos.z - b.pos.z) : 0;
      if (d < 50) Sound.beep(b.timer < 10);
    }
    if (b.timer <= 0) {
      b.state = 'exploded';
      b.mesh.visible = false;
      explode(new THREE.Vector3(b.pos.x, b.pos.y + 0.5, b.pos.z), null, 24, 500, 'c4', true);
      G.shake = 0.6;
      if (R.state !== 'over') endRound('T', 'bomb');
    }
  }
}

// ------------------------------------------------------------------
// Satın alma
function canBuyNow() {
  const p = G.player, R = G.round;
  if (!p.alive) return false;
  const inTime = R.state === 'freeze' || (R.state === 'live' && R.liveTime < BUY_TIME);
  return inTime && inRect(p.pos.x, p.pos.z, MAP.buyZones[p.team]);
}

function toggleBuy(force) {
  const open = force !== undefined ? force : !G.buyOpen;
  if (open && !canBuyNow()) { HUD.setMsg('', 'Şu an satın alamazsın (süre doldu veya satın alma alanında değilsin)', 2); return; }
  G.buyOpen = open;
  $('buy-menu').classList.toggle('hidden', !open);
  if (open) { HUD.renderBuyMenu(); document.exitPointerLock && document.exitPointerLock(); }
  else lockPointer();
}

function buyItem(i) {
  const p = G.player, it = BUY_LIST[i];
  if (!it || !canBuyNow()) return;
  const w = WEAPONS[it.id];
  const price = it.price || w.price;
  if (p.money < price) return;
  if (it.id === 'kevlar') { if (p.armor >= 100) return; p.armor = 100; }
  else if (it.id === 'helmet') { if (p.armor >= 100 && p.helmet) return; p.armor = 100; p.helmet = true; }
  else if (w.slot === 4) { if (p.inv[4] > 0) return; p.inv[4] = 1; }
  else {
    if (p.inv[w.slot] === it.id) return;
    p.giveWeapon(it.id);
    if (p.slot === w.slot) { p.reloading = 0; p.scoped = false; buildViewmodel(); } else p.switchTo(w.slot);
  }
  p.money -= price;
  Sound.buy();
  updateAvatarWeapon(p);
  HUD.renderBuyMenu();
}

// ------------------------------------------------------------------
// Fizik (oyuncu ve botlar için ortak)
function physicsStep(e, wishX, wishZ, maxSpeed, jump, dt) {
  e.crouchAmt += ((e.crouch ? 1 : 0) - e.crouchAmt) * Math.min(1, dt * 10);
  const onG = e.onGround;
  const accel = onG ? 11 : 1.6;
  const tx = wishX * maxSpeed, tz = wishZ * maxSpeed;
  const k = Math.min(1, accel * dt);
  e.vel.x += (tx - e.vel.x) * k;
  e.vel.z += (tz - e.vel.z) * k;
  if (onG && jump) { e.vel.y = 6.3; e.onGround = false; }
  e.vel.y -= 20 * dt;

  const h = e.height;
  collideAxis(e.pos, RADIUS, h, 'x', e.vel.x * dt);
  collideAxis(e.pos, RADIUS, h, 'z', e.vel.z * dt);
  const dy = e.vel.y * dt;
  const hitY = collideAxis(e.pos, RADIUS, h, 'y', dy);
  e.onGround = false;
  if (hitY) { if (dy < 0) e.onGround = true; e.vel.y = 0; }
  if (e.pos.y <= 0) { e.pos.y = 0; e.vel.y = 0; e.onGround = true; }
  // harita sınırı
  e.pos.x = Math.max(-59.5, Math.min(59.5, e.pos.x));
  e.pos.z = Math.max(-59.5, Math.min(59.5, e.pos.z));
}

// ------------------------------------------------------------------
// Oyuncu güncellemesi
function updatePlayer(dt) {
  const p = G.player, R = G.round;
  if (!p.alive) return;
  const k = input.keys;
  let fx = 0, fz = 0;
  const frozen = R.state === 'freeze';
  if (!G.buyOpen) {
    if (k.KeyW) fz += 1; if (k.KeyS) fz -= 1;
    if (k.KeyD) fx += 1; if (k.KeyA) fx -= 1;
  }
  const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw), rX = Math.cos(p.yaw), rZ = -Math.sin(p.yaw);
  let wx = fwdX * fz + rX * fx, wz = fwdZ * fz + rZ * fx;
  const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }

  p.crouch = !!(k.ControlLeft || k.ControlRight || k.KeyC);
  const walking = !!(k.ShiftLeft || k.ShiftRight);
  let speed = BASE_SPEED * p.weapon.speed;
  if (walking) speed *= 0.52;
  if (p.crouch) speed *= 0.34;
  if (p.scoped) speed *= 0.6;

  // C4 kurma / imha etme (E)
  const holdingE = !!k.KeyE && !G.buyOpen;
  if (holdingE && !G.playerAction) {
    if (canDefuse(p)) { G.playerAction = { kind: 'defuse', end: G.time + DEFUSE_TIME }; G.bomb.defuser = p; }
    else if (canPlant(p)) { G.playerAction = { kind: 'plant', end: G.time + PLANT_TIME }; p.switchTo(5); }
    else if (p.inv[5] && R.state === 'live' && !p.actionHintT) { HUD.setMsg('', 'Bombayı sadece A veya B bölgesinde kurabilirsin', 1.5); p.actionHintT = 1; setTimeout(() => p.actionHintT = 0, 1500); }
  }
  if (G.playerAction) {
    const A = G.playerAction;
    const total = A.kind === 'plant' ? PLANT_TIME : DEFUSE_TIME;
    const ok = holdingE && (A.kind === 'plant' ? canPlant(p) : canDefuse(p));
    if (!ok) { G.playerAction = null; HUD.hideProgress(); if (G.bomb.defuser === p) G.bomb.defuser = null; }
    else {
      wx = wz = 0; p.crouch = true;
      HUD.showProgress(A.kind === 'plant' ? 'C4 kuruluyor…' : 'Bomba imha ediliyor…', 1 - (A.end - G.time) / total);
      if (G.time >= A.end) {
        if (A.kind === 'plant') plantBomb(p); else defuseBomb(p);
        G.playerAction = null; HUD.hideProgress();
      }
    }
  }

  if (frozen) { wx = wz = 0; }
  physicsStep(p, wx, wz, speed, !!k.Space && !frozen && !G.playerAction, dt);

  // ayak sesleri (koşarken düşmanlar duyar)
  if (p.onGround && p.speed2D() > 3.2) {
    p.stepAcc += p.speed2D() * dt;
    if (p.stepAcc > 2.4) {
      p.stepAcc = 0;
      Sound.step(p.pos, null);
      for (const b of G.entities) if (b.isBot && b.alive && b.team !== p.team && b.pos.distanceTo(p.pos) < 22) botHeard(b, p, false);
    }
  }

  // atış
  const w = p.weapon;
  if (input.mouseDown && !G.buyOpen && !frozen && !G.playerAction && document.pointerLockElement === G.renderer.domElement) {
    if (w.auto || !input.firedThisPress) {
      if (w.bomb) {
        if (!input.firedThisPress) { HUD.setMsg('', 'Bombayı kurmak için bölgede E tuşunu basılı tut', 1.5); }
      } else if (fireWeapon(p)) {
        input.firedThisPress = true;
      } else if (!w.auto) input.firedThisPress = true;
    }
  }
  if (!input.mouseDown) input.firedThisPress = false;
}

function onPlayerFired(w) {
  vmState.kick = w.melee ? 0.6 : Math.min(1, 0.35 + w.recoil * 6);
  if (!w.melee && !w.grenade) {
    vmFlash.visible = true; vmFlash.scale.setScalar(0.7 + Math.random() * 0.6);
    muzzleLight.intensity = 6;
    setTimeout(() => { vmFlash.visible = false; }, 40);
  }
}

function onPlayerHurt(attacker) {
  const f = $('damage-flash');
  f.style.transition = 'none'; f.style.opacity = 1;
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
  Sound.hurt();
  G.player.punchPitch += 0.015;
  if (G.playerAction && G.playerAction.kind === 'plant') { /* kurma devam eder */ }
}

// Oyuncunun radar için düşmanları görmesi (ekip arkadaşı botların gördükleri de)
function updateSpotting() {
  const p = G.player;
  for (const e of G.entities) {
    if (e.team === p.team || !e.alive) continue;
    let seen = false;
    if (p.alive) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const a = Math.atan2(-dx, -dz);
      if (Math.abs(angleDiff(p.yaw, a)) < 1.0 && hasLOS(p.pos.x, p.eyeY, p.pos.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) seen = true;
    }
    if (!seen) for (const m of G.entities) if (m.isBot && m.alive && m.team === p.team && m.bot.target === e && G.time - m.bot.lastSeenT < 0.3) { seen = true; break; }
    if (seen) e.seenByPlayerT = G.time;
  }
}

// ------------------------------------------------------------------
// Kamera ve silah modeli
function updateCamera(dt) {
  const p = G.player, cam = G.camera;
  let viewer = p;
  if (!p.alive && G.spectating && G.spectating.alive) viewer = G.spectating;

  if (viewer.alive) {
    cam.position.set(viewer.pos.x, viewer.eyeY, viewer.pos.z);
    cam.rotation.set(viewer.pitch + viewer.punchPitch * 0.55, viewer.yaw + viewer.punchYaw * 0.55, 0);
  } else {
    // ölüm kamerası
    cam.position.set(p.pos.x + 2, 3.2, p.pos.z + 2);
    cam.lookAt(p.pos.x, 0.3, p.pos.z);
  }
  if (G.shake > 0) {
    cam.position.x += (Math.random() - 0.5) * G.shake; cam.position.y += (Math.random() - 0.5) * G.shake;
    G.shake = Math.max(0, G.shake - dt * 1.2);
  }

  // avatar görünürlüğü
  for (const e of G.entities) e.avatar.visible = !(e === viewer && e.alive);

  // dürbün
  const scoped = viewer.alive && viewer.scoped;
  const targetFov = scoped ? viewer.weapon.zoomFov : 74;
  if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 20); cam.updateProjectionMatrix(); }
  $('scope').classList.toggle('hidden', !scoped);
  $('crosshair').classList.toggle('hidden', scoped || !viewer.alive || viewer.weapon.scope);

  // dinamik nişangâh
  if (viewer.alive) updateCrosshair(viewer.weapon.melee ? 2 : viewer.currentSpread() * 260 + Math.abs(viewer.punchPitch) * 60);

  // silah modeli
  vmRoot.visible = p.alive && viewer === p && !scoped;
  if (vmGun && vmRoot.visible) {
    vmState.kick = Math.max(0, vmState.kick - dt * 8);
    vmState.draw = Math.max(0, vmState.draw - dt * 4);
    const sp = p.speed2D();
    vmState.bob += dt * sp * 1.6;
    const bobAmt = p.onGround ? Math.min(1, sp / 5) : 0.3;
    const reloadTilt = p.reloading ? Math.sin(Math.min(1, (p.reloading - G.time) / p.weapon.reload) * Math.PI) : 0;
    vmRoot.position.set(Math.cos(vmState.bob) * 0.012 * bobAmt, Math.abs(Math.sin(vmState.bob)) * 0.014 * bobAmt - vmState.draw * 0.25 - reloadTilt * 0.12 - p.crouchAmt * 0.01, vmState.kick * 0.06);
    vmRoot.rotation.set(vmState.kick * 0.12 - reloadTilt * 0.6, 0, reloadTilt * 0.3);
    if (p.weaponId === 'knife') vmRoot.rotation.y = -vmState.kick * 0.8;
  }
  muzzleLight.position.set(p.pos.x, p.eyeY, p.pos.z);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);

  G.listener = { pos: cam.position, yaw: viewer.alive ? viewer.yaw : 0 };
}

// ------------------------------------------------------------------
// Ana döngü
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (started && !G.paused) step(dt);
  else if (!started) {
    // menü arka planı: yavaşça dönen kamera
    const t = performance.now() * 0.00005;
    G.camera.position.set(Math.sin(t) * 75, 32, Math.cos(t) * 75);
    G.camera.lookAt(0, 0, 0);
  }
  G.renderer.clear();
  G.renderer.render(G.scene, G.camera);
  if (started && vmRoot.visible) {
    G.renderer.clearDepth();
    G.renderer.render(vmScene, vmCam);
  }
}

function step(dt) {
  G.time += dt;
  const R = G.round;

  if (R.state === 'freeze') {
    R.timer -= dt;
    if (R.timer <= 0) {
      R.state = 'live'; R.timer = ROUND_TIME; R.liveTime = 0;
      HUD.setMsg('BAŞLA!', '', 1.2, '#7dff7d');
    }
  } else if (R.state === 'live') {
    R.liveTime += dt;
    if (G.bomb.state !== 'planted') {
      R.timer -= dt;
      if (R.timer <= 0) { R.timer = 0; endRound('CT', 'time'); }
    }
    if (G.buyOpen && !canBuyNow()) toggleBuy(false);
  } else if (R.state === 'over') {
    R.timer -= dt;
    if (R.timer <= 0 && !matchOver) startRound();
  }

  updatePlayer(dt);
  for (const e of G.entities) {
    if (e.isBot) { updateBot(e, dt); updateBotAction(e); }
    e.updateReload();
    updateRecoil(e, dt);
    updateAvatar(e, dt);
    if (e.muzzleFlash > 0) e.muzzleFlash -= dt;
  }
  updateGrenades(dt);
  updateBomb(dt);
  updateEffects(dt);
  checkElimination();
  updateSpotting();
  updateCamera(dt);
  HUD.update(dt);

  // bot eylem ilerlemesi (izlerken göster)
  const v = G.spectating;
  if (!G.player.alive && v && v.bot && v.bot.action) {
    const total = v.bot.action === 'plant' ? PLANT_TIME : DEFUSE_TIME;
    HUD.showProgress(v.bot.action === 'plant' ? `${v.name} C4 kuruyor…` : `${v.name} imha ediyor…`, 1 - (v.bot.actionT - G.time) / total);
  } else if (!G.playerAction) HUD.hideProgress();
}

// test/hata ayıklama için
window.__game = { G, input, startMatch, settings, endRound, step: (dt) => step(dt) };

init();
