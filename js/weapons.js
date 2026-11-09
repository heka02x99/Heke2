// Silah tanımları. Tüm isimler ve değerler bu oyuna özgüdür.
// slot: 1 = ana silah, 2 = tabanca, 3 = bıçak, 4 = el bombası, 5 = C4
const WEAPONS = {
  knife: {
    name: 'Bıçak', slot: 3, price: 0, damage: 50, rpm: 120, melee: true, range: 2.2,
    speed: 1.0, sound: 'knife', auto: true, mag: 0, reserve: 0,
  },
  kestrel: {
    name: 'Kestrel P9', cat: 'Tabanca', slot: 2, price: 200, damage: 30, rpm: 380, auto: false,
    mag: 13, reserve: 52, reload: 2.1, headMul: 4, armorPen: 0.5, falloff: 0.85, range: 60,
    spread: 0.006, moveSpread: 0.035, airSpread: 0.12, recoil: 0.022, recoverRate: 6, speed: 1.0, sound: 'pistol', kill: 300,
  },
  magnum: {
    name: 'Magnum M50', cat: 'Tabanca', slot: 2, price: 700, damage: 58, rpm: 220, auto: false,
    mag: 7, reserve: 35, reload: 2.2, headMul: 3.8, armorPen: 0.93, falloff: 0.82, range: 80,
    spread: 0.006, moveSpread: 0.08, airSpread: 0.2, recoil: 0.06, recoverRate: 4, speed: 0.95, sound: 'deagle', kill: 300,
  },
  hornet: {
    name: 'Hornet SMG', cat: 'Hafif Makineli', slot: 1, price: 1250, damage: 26, rpm: 800, auto: true,
    mag: 30, reserve: 120, reload: 2.4, headMul: 4, armorPen: 0.6, falloff: 0.75, range: 40,
    spread: 0.009, moveSpread: 0.018, airSpread: 0.12, recoil: 0.012, recoverRate: 7, speed: 1.0, sound: 'smg', kill: 600,
  },
  bulldog: {
    name: 'Bulldog Pompalı', cat: 'Pompalı', slot: 1, price: 1100, damage: 22, pellets: 9, rpm: 68, auto: false,
    mag: 7, reserve: 28, reload: 2.6, headMul: 2, armorPen: 0.75, falloff: 0.45, range: 22,
    spread: 0.055, moveSpread: 0.02, airSpread: 0.1, recoil: 0.07, recoverRate: 4, speed: 0.92, sound: 'shotgun', kill: 900,
  },
  raptor: {
    name: 'Raptor AR', cat: 'Tüfek', slot: 1, price: 2700, damage: 36, rpm: 600, auto: true,
    mag: 30, reserve: 90, reload: 2.5, headMul: 4, armorPen: 0.78, falloff: 0.98, range: 120,
    spread: 0.004, moveSpread: 0.09, airSpread: 0.25, recoil: 0.019, recoverRate: 5, speed: 0.86, sound: 'rifle', kill: 300,
  },
  sentinel: {
    name: 'Sentinel M4', cat: 'Tüfek', slot: 1, price: 2900, damage: 32, rpm: 666, auto: true,
    mag: 25, reserve: 75, reload: 2.2, headMul: 4, armorPen: 0.7, falloff: 0.97, range: 120,
    spread: 0.003, moveSpread: 0.075, airSpread: 0.25, recoil: 0.015, recoverRate: 5.5, speed: 0.9, sound: 'rifle', kill: 300,
  },
  longbow: {
    name: 'Longbow L5', cat: 'Keskin Nişancı', slot: 1, price: 4750, damage: 115, rpm: 41, auto: false,
    mag: 5, reserve: 30, reload: 3.0, headMul: 4, armorPen: 0.97, falloff: 0.99, range: 300,
    spread: 0.0005, unscopedSpread: 0.09, moveSpread: 0.2, airSpread: 0.4, recoil: 0.09, recoverRate: 3, speed: 0.8,
    sound: 'sniper', scope: true, zoomFov: 22, kill: 100,
  },
  he: {
    name: 'HE Bombası', cat: 'Ekipman', slot: 4, price: 300, grenade: true, mag: 1, reserve: 0, speed: 1.0, sound: 'knife',
  },
  c4: { name: 'C4 Patlayıcı', slot: 5, price: 0, mag: 0, reserve: 0, speed: 1.0, bomb: true },
};

// Satın alma menüsü sırası (1..9 kısayolları)
const BUY_LIST = [
  { id: 'magnum' },
  { id: 'hornet' },
  { id: 'bulldog' },
  { id: 'raptor' },
  { id: 'sentinel' },
  { id: 'longbow' },
  { id: 'kevlar', name: 'Kevlar Yelek', cat: 'Ekipman', price: 650 },
  { id: 'helmet', name: 'Yelek + Kask', cat: 'Ekipman', price: 1000 },
  { id: 'he' },
];

// Mermi sekme (sprey) deseni: her atış için [dikey, yatay] çarpanları
function sprayOffset(i) {
  const up = i < 9 ? 1 : (i < 15 ? 0.35 : 0.15);
  const side = i < 6 ? (Math.random() - 0.5) * 0.25 : Math.sin(i * 0.55) * 0.9 + (Math.random() - 0.5) * 0.3;
  return [up, side];
}

// Basit görünür silah modelleri (birinci şahıs ve botlar için)
function buildGunMesh(id, forViewmodel) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x34373d, roughness: 0.5, metalness: 0.3 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x50555c, roughness: 0.6, metalness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 });
  const blade = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.25, metalness: 0.9 });
  const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  let muzzle = -0.5;
  switch (id) {
    case 'knife':
      add(0.03, 0.04, 0.12, 0, 0, 0.02, dark);
      add(0.008, 0.035, 0.2, 0, 0.005, -0.14, blade);
      muzzle = -0.25; break;
    case 'kestrel': case 'magnum': {
      const big = id === 'magnum' ? 1.25 : 1;
      add(0.04 * big, 0.05 * big, 0.2 * big, 0, 0.02, -0.06, id === 'magnum' ? blade : dark);
      add(0.035, 0.1, 0.05, 0, -0.04, 0.02, dark);
      muzzle = -0.17 * big; break;
    }
    case 'hornet':
      add(0.05, 0.08, 0.36, 0, 0, -0.1, dark);
      add(0.03, 0.15, 0.04, 0, -0.1, -0.12, mid);
      add(0.035, 0.09, 0.05, 0, -0.07, 0.03, dark);
      add(0.02, 0.02, 0.12, 0, 0.0, -0.32, mid);
      muzzle = -0.38; break;
    case 'bulldog':
      add(0.05, 0.06, 0.55, 0, 0.02, -0.18, dark);
      add(0.06, 0.05, 0.25, 0, -0.03, -0.2, wood);
      add(0.05, 0.08, 0.2, 0, -0.03, 0.15, wood);
      muzzle = -0.46; break;
    case 'raptor':
      add(0.05, 0.08, 0.5, 0, 0, -0.15, dark);
      add(0.035, 0.16, 0.06, 0, -0.11, -0.15, mid).rotation.x = 0.25;
      add(0.05, 0.08, 0.22, 0, -0.02, 0.18, wood);
      add(0.06, 0.06, 0.2, 0, 0, -0.38, wood);
      add(0.02, 0.02, 0.18, 0, 0.01, -0.56, dark);
      muzzle = -0.65; break;
    case 'sentinel':
      add(0.05, 0.08, 0.48, 0, 0, -0.15, mid);
      add(0.035, 0.14, 0.06, 0, -0.1, -0.12, dark);
      add(0.04, 0.09, 0.2, 0, -0.01, 0.17, dark);
      add(0.02, 0.03, 0.12, 0, 0.065, -0.1, dark);
      add(0.025, 0.025, 0.24, 0, 0.01, -0.5, dark);
      muzzle = -0.62; break;
    case 'longbow':
      add(0.05, 0.08, 0.75, 0, 0, -0.2, tan);
      add(0.05, 0.1, 0.25, 0, -0.03, 0.25, tan);
      add(0.025, 0.025, 0.35, 0, 0.01, -0.75, dark);
      { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 10), dark); s.rotation.x = Math.PI / 2; s.position.set(0, 0.08, -0.12); g.add(s); }
      muzzle = -0.92; break;
    case 'he': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.7 }));
      g.add(s); add(0.02, 0.04, 0.02, 0, 0.05, 0, mid);
      muzzle = -0.05; break;
    }
    case 'c4':
      add(0.16, 0.06, 0.1, 0, 0, -0.05, new THREE.MeshStandardMaterial({ color: 0x7a6b45, roughness: 0.8 }));
      add(0.06, 0.02, 0.04, 0, 0.04, -0.05, new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x22ff22, emissiveIntensity: 0.4 }));
      muzzle = -0.1; break;
  }
  g.userData.muzzle = muzzle;
  if (forViewmodel) g.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}
