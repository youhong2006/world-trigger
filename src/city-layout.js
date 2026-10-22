// Shared world coordinates for geometry, navigation, collisions and the map.
export const CITY = {
  halfSize: 1120,
  blockSize: 72,
  riverWidth: 58,
  bridges: [-504, 0, 504],
  campus: { minX: -149, maxX: 149, minZ: -264, maxZ: -34 },
  forests: [
    { x: -640, z: 265, rx: 230, rz: 135 },
    { x: 620, z: 195, rx: 245, rz: 145 },
    { x: -820, z: -430, rx: 170, rz: 205 },
    { x: 805, z: -440, rx: 160, rz: 180 },
    { x: -260, z: 830, rx: 175, rz: 100 },
    { x: 750, z: 875, rx: 230, rz: 115 },
  ],
};

export function riverZ(x) {
  return 554 + 32 * Math.sin(x / 290) + 0.026 * x;
}

export function inCampus(x, z, margin = 0) {
  const c = CITY.campus;
  return x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin;
}

export function forestAt(x, z, margin = 0) {
  return CITY.forests.find(f => ((x - f.x) / (f.rx + margin)) ** 2 + ((z - f.z) / (f.rz + margin)) ** 2 < 1);
}

export function inRiver(x, z, margin = 0) {
  return Math.abs(z - riverZ(x)) < CITY.riverWidth / 2 + margin;
}

export function onBridge(x) {
  return CITY.bridges.some(b => Math.abs(x - b) < 9);
}

export function streetPosition(x, z) {
  const outer = Math.min(1, Math.max(0, (Math.hypot(x, z) - 250) / 650));
  return {
    x: x + outer * 24 * Math.sin(z / 145) * Math.sin(Math.PI * x / 504) ** 2,
    z: z + outer * 20 * Math.sin(x / 140) * Math.sin(Math.PI * z / 504) ** 2,
  };
}

export function lookoutTerrainHeight(x, z) {
  const dx = x + 647, dz = z - 120;
  const crest = Math.max(0, 1 - (dx / 225) ** 2 - (dz / 135) ** 2);
  return Math.max(0, crest * crest * 29 * (1 + 0.12 * Math.sin(dx * 0.031 + 120) * Math.cos(dz * 0.025)) - 1);
}

export function groundHeight(x, z) {
  if (onBridge(x) && Math.abs(z - riverZ(x)) < 53) return 0.65;
  // A walkable path winds up the western lookout hill.
  if (Math.abs(x + 647) < 8 && z > 120 && z < 265) return Math.min(29, (265 - z) * 0.2);
  if (Math.hypot((x + 647) / 32, (z - 120) / 30) < 1) return 29;
  return lookoutTerrainHeight(x, z);
}

// Spatial bins keep walking checks independent of the total building count.
export function createCollisionIndex() {
  const bins = new Map();
  const cellSize = 48;
  let count = 0;
  function add({ x, z, w, d }) {
    const bounds = { x, z, w: w / 2 + 0.6, d: d / 2 + 0.6 };
    for (let gx = Math.floor((x - bounds.w) / cellSize); gx <= Math.floor((x + bounds.w) / cellSize); gx++) {
      for (let gz = Math.floor((z - bounds.d) / cellSize); gz <= Math.floor((z + bounds.d) / cellSize); gz++) {
        const key = `${gx},${gz}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(bounds);
      }
    }
    count++;
  }
  function blocked(x, z) {
    if (inRiver(x, z, 0.7) && !onBridge(x)) return true;
    const nearby = bins.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? [];
    return nearby.some(b => Math.abs(x - b.x) < b.w && Math.abs(z - b.z) < b.d);
  }
  return { add, blocked, get count() { return count; } };
}

export function seededRandom(initial = 20261022) {
  let seed = initial;
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
