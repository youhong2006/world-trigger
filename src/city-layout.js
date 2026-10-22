// Shared world coordinates for geometry, navigation, collisions and the map.
export const BASE = {
  previousScale: 3.2,
  enlargement: 5,
  scale: 3.2 * 5,
  x: 0,
  z: -150,
  width: 78,
  depth: 50,
  height: 54,
  wallThickness: 4.2,
  floorHeight: 1.1,
};
export const CITY = {
  halfSize: 1120,
  blockSize: 72,
  riverWidth: 58,
  bridges: [-504, 0, 504],
  campus: { minX: -770, maxX: 770, minZ: -680, maxZ: 415 },
  ring: { minX: -820, maxX: 820, minZ: -730, maxZ: 455, radius: 100 },
  lookout: { x: -985, z: 120, rx: 115, rz: 135 },
  forests: [
    { x: -980, z: 265, rx: 120, rz: 135 },
    { x: 980, z: 195, rx: 115, rz: 145 },
    { x: -955, z: -430, rx: 110, rz: 205 },
    { x: 975, z: -440, rx: 110, rz: 180 },
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

export function ringDistance(x, z) {
  const ring = CITY.ring;
  const centerZ = (ring.minZ + ring.maxZ) / 2;
  const qx = Math.abs(x) - (ring.maxX - ring.radius);
  const qz = Math.abs(z - centerZ) - ((ring.maxZ - ring.minZ) / 2 - ring.radius);
  return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - ring.radius);
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
  const dx = x - CITY.lookout.x, dz = z - CITY.lookout.z;
  const crest = Math.max(0, 1 - (dx / CITY.lookout.rx) ** 2 - (dz / CITY.lookout.rz) ** 2);
  return Math.max(0, crest * crest * 29 * (1 + 0.12 * Math.sin(dx * 0.031 + 120) * Math.cos(dz * 0.025)) - 1);
}

export function groundHeight(x, z) {
  if (onBridge(x) && Math.abs(z - riverZ(x)) < 53) return 0.65;
  if (Math.abs(x - BASE.x) < BASE.width * BASE.scale / 2 + 1.5 * BASE.scale
      && Math.abs(z - BASE.z) < BASE.depth * BASE.scale / 2 + 1.5 * BASE.scale) return BASE.floorHeight * BASE.scale;
  // A walkable path winds up the western lookout hill.
  if (Math.abs(x - CITY.lookout.x) < 8 && z > 120 && z < 265) return Math.min(29, (265 - z) * 0.2);
  if (Math.hypot((x - CITY.lookout.x) / 32, (z - 120) / 30) < 1) return 29;
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
