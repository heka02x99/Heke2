// Harita: geometri, çarpışma kutuları, bölgeler ve bot navigasyon ağı.
// Koordinatlar: x = doğu, z = güney (kuzey = -z). Zemin y = 0.

const MAP = {
  boxes: [],          // {minX,minY,minZ,maxX,maxY,maxZ}
  size: 60,
  sites: {
    A: { name: 'A', minX: 27, maxX: 55, minZ: -55, maxZ: -27, plant: { x: 40, z: -40 } },
    B: { name: 'B', minX: -55, maxX: -27, minZ: -55, maxZ: -27, plant: { x: -40, z: -40 } },
  },
  spawns: {
    T: [[-6, 55], [-3, 53], [0, 55], [3, 53], [6, 55]],
    CT: [[-6, -55], [-3, -57], [0, -55], [3, -57], [6, -55]],
  },
  buyZones: {
    T: { minX: -22, maxX: 22, minZ: 40, maxZ: 60 },
    CT: { minX: -22, maxX: 22, minZ: -60, maxZ: -42 },
  },
  nodes: {
    TS: [0, 48], TW: [-49, 45], TE: [49, 45],
    W1: [-49, 20], W2: [-49, 0], W3: [-49, -15],
    B: [-40, -38], Bc: [-30, -30],
    M1: [0, 30], M2: [0, 10], M3: [0, -8], M4: [0, -25],
    E1: [49, 20], E2: [49, 0], E3: [49, -15],
    A: [40, -38], Ac: [30, -30],
    CT: [0, -48], CTW: [-15, -40], CTE: [15, -40],
  },
  edges: [
    ['TS', 'TW'], ['TS', 'TE'], ['TS', 'M1'],
    ['TW', 'W1'], ['W1', 'W2'], ['W2', 'W3'], ['W3', 'B'], ['W3', 'Bc'], ['B', 'Bc'], ['Bc', 'CTW'],
    ['TE', 'E1'], ['E1', 'E2'], ['E2', 'E3'], ['E3', 'A'], ['E3', 'Ac'], ['A', 'Ac'], ['Ac', 'CTE'],
    ['M1', 'M2'], ['M2', 'M3'], ['M3', 'M4'], ['M4', 'CTW'], ['M4', 'CTE'],
    ['CT', 'CTW'], ['CT', 'CTE'], ['CTW', 'B'], ['CTE', 'A'],
  ],
  // CT botlarının bekleme noktaları
  holds: {
    A: [[44, -44], [33, -36], [48, -30]],
    B: [[-44, -44], [-33, -36], [-48, -30]],
    M: [[0, -22], [-6, -28]],
  },
};

// ------------------------------------------------------------------
// Prosedürel dokular
function makeTexture(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g, s, base, vary, n) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * vary;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

const TEX = {};
function buildTextures() {
  TEX.floor = makeTexture((g, s) => {
    speckle(g, s, '#b9a27a', 0.18, 5000);
    g.strokeStyle = 'rgba(60,40,20,.25)'; g.lineWidth = 2;
    for (let i = 0; i <= s; i += s / 2) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
  });
  TEX.wall = makeTexture((g, s) => {
    speckle(g, s, '#d8c7a3', 0.12, 4000);
    g.fillStyle = 'rgba(90,70,40,.12)';
    for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 2);
    g.fillStyle = 'rgba(80,60,40,.25)'; g.fillRect(0, s - 30, s, 30);
  });
  TEX.wall2 = makeTexture((g, s) => {
    speckle(g, s, '#9ea4a8', 0.15, 4000);
    g.strokeStyle = 'rgba(40,40,40,.35)'; g.lineWidth = 2;
    for (let y = 0; y < s; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      const off = (y / 32) % 2 ? 32 : 0;
      for (let x = off; x < s; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
    }
  });
  TEX.crate = makeTexture((g, s) => {
    speckle(g, s, '#9a6b3c', 0.2, 3000);
    g.strokeStyle = 'rgba(40,25,10,.6)'; g.lineWidth = 4;
    for (let y = 0; y < s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    g.lineWidth = 18; g.strokeStyle = '#6e4723';
    g.strokeRect(9, 9, s - 18, s - 18);
    g.beginPath(); g.moveTo(9, 9); g.lineTo(s - 9, s - 9); g.stroke();
  });
  TEX.metal = makeTexture((g, s) => {
    speckle(g, s, '#4f6b5a', 0.15, 3000);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let x = 0; x < s; x += 24) g.fillRect(x, 0, 6, s);
  });
}

// BoxGeometry'nin UV'lerini gerçek boyuta göre ölçekle (dokular esnemesin)
function scaledBoxGeometry(w, h, d, scale) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0] / scale, uv.getY(idx) * dims[f][1] / scale);
    }
  }
  return geo;
}

function addBox(scene, cx, cz, w, d, h, matKey, y0 = 0, scale = 4) {
  const b = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: y0, maxY: y0 + h };
  MAP.boxes.push(b);
  if (scene) {
    const mesh = new THREE.Mesh(scaledBoxGeometry(w, h, d, scale), MAP.materials[matKey]);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return b;
}

function buildMap(scene) {
  buildTextures();
  MAP.materials = {
    wall: new THREE.MeshStandardMaterial({ map: TEX.wall, roughness: 0.95 }),
    wall2: new THREE.MeshStandardMaterial({ map: TEX.wall2, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ map: TEX.crate, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ map: TEX.metal, roughness: 0.6, metalness: 0.3 }),
  };

  // Zemin
  const floorTex = TEX.floor.clone(); floorTex.needsUpdate = true;
  floorTex.repeat.set(30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(124, 124), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Bölge zemin işaretleri
  for (const k of ['A', 'B']) {
    const s = MAP.sites[k];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(200,40,30,.8)'; g.lineWidth = 14;
    g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(200,40,30,.85)'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(k, 128, 136);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(s.plant.x, 0.02, s.plant.z);
    scene.add(m);
  }

  // Dış duvarlar
  addBox(scene, 0, -61, 124, 2, 10, 'wall2');
  addBox(scene, 0, 61, 124, 2, 10, 'wall2');
  addBox(scene, -61, 0, 2, 120, 10, 'wall2');
  addBox(scene, 61, 0, 2, 120, 10, 'wall2');

  // Büyük binalar (koridorları ayırır)
  addBox(scene, -24, 10, 28, 50, 8, 'wall');
  addBox(scene, 24, 10, 28, 50, 8, 'wall');

  // Batı koridoru kapısı (B tüneli)
  addBox(scene, -56, 0, 8, 2, 8, 'wall2');
  addBox(scene, -42, 0, 8, 2, 8, 'wall2');
  addBox(scene, -49, 0, 6, 2, 2.5, 'wall2', 5.5); // lento
  // Doğu koridoru kapısı (A uzun)
  addBox(scene, 42, 0, 8, 2, 8, 'wall2');
  addBox(scene, 56, 0, 8, 2, 8, 'wall2');
  addBox(scene, 49, 0, 6, 2, 2.5, 'wall2', 5.5);
  // Orta kapılar
  addBox(scene, -6, 10, 8, 1, 6, 'metal');
  addBox(scene, 6, 10, 8, 1, 6, 'metal');

  // Bölgeleri ortadan ayıran alçak duvarlar
  addBox(scene, -20, -22.5, 1, 15, 3, 'wall2');
  addBox(scene, 20, -22.5, 1, 15, 3, 'wall2');

  // A bölgesi
  addBox(scene, 35, -45, 3, 3, 2, 'crate', 0, 3);
  addBox(scene, 35, -45, 1.5, 1.5, 1, 'crate', 2, 1.5);
  addBox(scene, 46, -30, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 52, -48, 4, 2, 2.5, 'metal');
  addBox(scene, 30, -52, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 45, -55, 6, 1, 3, 'wall');
  // B bölgesi
  addBox(scene, -35, -45, 3, 3, 2, 'crate', 0, 3);
  addBox(scene, -46, -30, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, -52, -48, 4, 2, 2.5, 'metal');
  addBox(scene, -30, -52, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, -45, -55, 6, 1, 3, 'wall');
  addBox(scene, -53, -38, 2, 4, 2, 'crate', 0, 2);

  // Koridor siperleri
  addBox(scene, -44, 25, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, -56, -8, 2, 2, 2, 'crate', 0, 2);
  addBox(scene, -42, -10, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 44, 25, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 56, -8, 2, 2, 2, 'crate', 0, 2);
  addBox(scene, 42, -10, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 5, 22, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, -5, -3, 2, 2, 1.6, 'crate', 0, 2);
  addBox(scene, 6, -18, 3, 2, 2, 'metal');
  addBox(scene, 0, -33, 8, 1, 3, 'wall2'); // doğuşlar arası görüş hattını keser

  // Doğuş alanları
  addBox(scene, -25, 52, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 25, 52, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, -8, -52, 2, 2, 1, 'crate', 0, 2);
  addBox(scene, 8, -52, 2, 2, 1, 'crate', 0, 2);

  buildNav();
}

// ------------------------------------------------------------------
// Geometri yardımcıları

// Işın–AABB kesişimi (slab yöntemi). Kesişme mesafesi ya da Infinity döner.
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Işın–küre kesişimi
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const thc = Math.sqrt(r * r - d2);
  const t = tca - thc;
  return t >= 0 ? t : (tca + thc >= 0 ? 0 : Infinity);
}

// En yakın duvar mesafesi (normal ile birlikte)
function raycastWorld(ox, oy, oz, dx, dy, dz, maxDist = 500) {
  let best = maxDist, hitBox = null;
  for (const b of MAP.boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t < best) { best = t; hitBox = b; }
  }
  // zemin
  if (dy < -1e-6) {
    const tf = -oy / dy;
    if (tf >= 0 && tf < best) { best = tf; hitBox = 'floor'; }
  }
  if (!hitBox) return null;
  const px = ox + dx * best, py = oy + dy * best, pz = oz + dz * best;
  let n = [0, 1, 0];
  if (hitBox !== 'floor') {
    const e = 0.01, b = hitBox;
    if (Math.abs(px - b.minX) < e) n = [-1, 0, 0];
    else if (Math.abs(px - b.maxX) < e) n = [1, 0, 0];
    else if (Math.abs(pz - b.minZ) < e) n = [0, 0, -1];
    else if (Math.abs(pz - b.maxZ) < e) n = [0, 0, 1];
    else if (Math.abs(py - b.minY) < e) n = [0, -1, 0];
  }
  return { dist: best, x: px, y: py, z: pz, normal: n };
}

// İki nokta arasında görüş hattı var mı?
function hasLOS(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const ix = dx / len, iy = dy / len, iz = dz / len;
  for (const b of MAP.boxes) {
    if (rayBox(ax, ay, az, ix, iy, iz, b) < len) return false;
  }
  return true;
}

// Silindir benzeri bir varlığı (kutu olarak) kutulardan dışarı it.
// Eksen eksen hareket ettirerek çağrılır.
function collideAxis(pos, r, h, axis, delta) {
  const p = pos;
  p[axis] += delta;
  let hit = false;
  for (const b of MAP.boxes) {
    if (p.x + r <= b.minX || p.x - r >= b.maxX || p.z + r <= b.minZ || p.z - r >= b.maxZ || p.y + h <= b.minY || p.y >= b.maxY) continue;
    hit = true;
    if (axis === 'x') p.x = delta > 0 ? b.minX - r - 1e-4 : b.maxX + r + 1e-4;
    else if (axis === 'z') p.z = delta > 0 ? b.minZ - r - 1e-4 : b.maxZ + r + 1e-4;
    else p.y = delta > 0 ? b.minY - h - 1e-4 : b.maxY + 1e-4;
  }
  return hit;
}

function inRect(x, z, r) { return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ; }
function siteAt(x, z) {
  for (const k in MAP.sites) if (inRect(x, z, MAP.sites[k])) return k;
  return null;
}

// ------------------------------------------------------------------
// Navigasyon (Dijkstra, küçük graf)
const NAV = { adj: {} };
function buildNav() {
  for (const k in MAP.nodes) NAV.adj[k] = [];
  for (const [a, b] of MAP.edges) {
    const pa = MAP.nodes[a], pb = MAP.nodes[b];
    const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    NAV.adj[a].push([b, d]); NAV.adj[b].push([a, d]);
  }
}

function nearestNode(x, z) {
  let best = null, bd = Infinity, fallback = null, fd = Infinity;
  for (const k in MAP.nodes) {
    const [nx, nz] = MAP.nodes[k];
    const d = Math.hypot(nx - x, nz - z);
    if (d < fd) { fd = d; fallback = k; }
    if (d < bd && hasLOS(x, 0.9, z, nx, 0.9, nz)) { bd = d; best = k; }
  }
  return best || fallback;
}

function findPath(fromX, fromZ, toX, toZ) {
  const start = nearestNode(fromX, fromZ), goal = nearestNode(toX, toZ);
  const dist = {}, prev = {}, done = {};
  for (const k in MAP.nodes) dist[k] = Infinity;
  dist[start] = 0;
  while (true) {
    let u = null, ud = Infinity;
    for (const k in dist) if (!done[k] && dist[k] < ud) { ud = dist[k]; u = k; }
    if (!u || u === goal) break;
    done[u] = true;
    for (const [v, w] of NAV.adj[u]) {
      // biraz rastgelelik: botlar her zaman aynı yolu kullanmasın
      const nd = ud + w * (0.85 + Math.random() * 0.3);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  const path = [];
  let c = goal;
  while (c) { path.unshift({ x: MAP.nodes[c][0], z: MAP.nodes[c][1] }); if (c === start) break; c = prev[c]; }
  path.push({ x: toX, z: toZ });
  return path;
}
