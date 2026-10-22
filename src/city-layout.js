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
  halfSize: 3700,
  basinX: 3400,
  basinZ: 3000,
  terrainRadius: 18000,
  walkRadius: 1.48,
  blockSize: 144,
  riverWidth: 86,
  bridgeLength: 164,
  bridges: [-1008, 0, 1008],
  campus: { minX: -770, maxX: 770, minZ: -680, maxZ: 415 },
  ring: { minX: -820, maxX: 820, minZ: -730, maxZ: 455, radius: 100 },
  lookout: { x: -2200, z: 120, rx: 220, rz: 200 },
  forests: [
    { x: -1750, z: 530, rx: 390, rz: 260 },
    { x: 1800, z: 430, rx: 380, rz: 310 },
    { x: -1850, z: -1500, rx: 330, rz: 360 },
    { x: 1700, z: -1500, rx: 400, rz: 260 },
    { x: -720, z: 2350, rx: 350, rz: 210 },
    { x: 1920, z: 2260, rx: 430, rz: 280 },
  ],
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A continuous asymmetric basin, rather than a rectangular cutoff.
export function basinRadius(x, z) {
  const angle = Math.atan2(z / CITY.basinZ, x / CITY.basinX);
  const edge = 1 + 0.075 * Math.sin(angle * 3 + 0.6) + 0.045 * Math.sin(angle * 5 - 0.9) + 0.025 * Math.cos(angle * 8);
  return Math.hypot(x / CITY.basinX, z / CITY.basinZ) / edge;
}

export function riverZ(x) {
  return 1250 + 210 * Math.tanh(x / 1300) + 125 * Math.sin(x / 700) + 0.07 * x;
}

export function settlementDensity(x, z) {
  const r = basinRadius(x, z);
  const edgeFade = 1 - smooth(0.53, 1.06, r);
  const neighborhood = 0.82 + 0.14 * Math.sin(x / 320 + Math.cos(z / 470)) * Math.cos(z / 380);
  return edgeFade * neighborhood;
}

export function foothillHeight(x, z) {
  const r = basinRadius(x, z);
  const angle = Math.atan2(z, x);
  const foothills = 62 * smooth(0.57, 1.05, r);
  const foothillVariation = 0.5 + 0.25 * Math.sin(x / 240 + 0.6) * Math.cos(z / 310) + 0.17 * Math.sin((x + z) / 410);
  const mountainRise = smooth(0.93, 1.36, r);
  const distantFall = 1 - smooth(2.0, 3.9, r) * 0.3;
  const ridge = 420 + 240 * Math.sin(angle * 5 + 0.8) ** 2 + 180 * Math.cos(angle * 9 - 0.4) ** 2;
  const detail = 0.84 + 0.1 * Math.sin(x / 190) * Math.cos(z / 260) + 0.06 * Math.sin((x + z) / 115);
  // The river continues through a valley in the mountain ring, without a blue stripe over hilltops.
  const valley = smooth(CITY.riverWidth / 2 + 30, 310, Math.abs(z - riverZ(x)));
  return (foothills * foothillVariation + mountainRise * ridge * detail * distantFall) * valley;
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
  return CITY.forests.find(f => {
    const radius = ((x - f.x) / (f.rx + margin)) ** 2 + ((z - f.z) / (f.rz + margin)) ** 2;
    return radius < 1 + 0.12 * Math.sin(x / 70) * Math.cos(z / 85);
  });
}

export function inRiver(x, z, margin = 0) {
  return Math.abs(z - riverZ(x)) < CITY.riverWidth / 2 + margin;
}

export function onBridge(x) {
  return CITY.bridges.some(b => Math.abs(x - b) < 9);
}

export function streetPosition(x, z) {
  const outer = smooth(850, 2700, Math.hypot(x, z));
  return {
    x: x + outer * 58 * Math.sin(z / 340) * Math.sin(Math.PI * x / 1008) ** 2,
    z: z + outer * 48 * Math.sin(x / 320) * Math.sin(Math.PI * z / 1008) ** 2,
  };
}

export function lookoutTerrainHeight(x, z) {
  const dx = x - CITY.lookout.x, dz = z - CITY.lookout.z;
  const crest = Math.max(0, 1 - (dx / CITY.lookout.rx) ** 2 - (dz / CITY.lookout.rz) ** 2);
  return 44 * crest * crest;
}

export function terrainHeight(x, z) {
  if (inCampus(x, z, 20)) return 0;
  return foothillHeight(x, z) + lookoutTerrainHeight(x, z);
}

export function groundHeight(x, z) {
  if (onBridge(x) && Math.abs(z - riverZ(x)) < CITY.bridgeLength / 2) return 0.65;
  if (Math.abs(x - BASE.x) < BASE.width * BASE.scale / 2 + 1.5 * BASE.scale
      && Math.abs(z - BASE.z) < BASE.depth * BASE.scale / 2 + 1.5 * BASE.scale) return BASE.floorHeight * BASE.scale;
  // The viewpoint sits directly on the continuous landscape, with no separate hill tile.
  return terrainHeight(x, z);
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
  function hasObstacle(x, z) {
    const nearby = bins.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? [];
    return nearby.some(b => Math.abs(x - b.x) < b.w && Math.abs(z - b.z) < b.d);
  }
  function blocked(x, z) {
    if (basinRadius(x, z) > CITY.walkRadius) return true;
    if (inRiver(x, z, 0.7) && !onBridge(x)) return true;
    return hasObstacle(x, z);
  }
  return { add, blocked, hasObstacle, get count() { return count; } };
}

export function seededRandom(initial = 20261022) {
  let seed = initial;
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
