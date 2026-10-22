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

export const STREETS = {
  arterialWidth: 12, localWidth: 6, laneWidth: 5,
  sidewalk: 1.25, sharedEdge: .45,
  frontDepth: 3.8, sideGap: 2.4, rearGap: 2.4,
};
export const streetWidth = line => Math.abs(line % 1008) < .01 ? STREETS.arterialWidth : STREETS.localWidth;
export const streetEdgeWidth = width => width >= 10 ? STREETS.sidewalk : STREETS.sharedEdge;
export const streetElevation = width => width >= 14 ? .23 : width >= 10 ? .21 : width >= 6 ? .19 : .17;

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

export function unwarpStreet(x, z) {
  let rawX = x, rawZ = z;
  for (let i = 0; i < 6; i++) {
    const warped = streetPosition(rawX, rawZ);
    rawX += x - warped.x;rawZ += z - warped.z;
  }
  return { x: rawX, z: rawZ };
}

export function streetAllowed(x, z) {
  return basinRadius(x, z) < 1.04 && terrainHeight(x, z) < 39
    && !inCampus(x, z, 8) && !inRiver(x, z, 16) && !forestAt(x, z, -40);
}

export function streetClearance(x, z) {
  const raw = unwarpStreet(x, z);
  let clearance = Infinity;
  for (const value of [raw.x, raw.z]) {
    const grid = Math.round(value / CITY.blockSize) * CITY.blockSize;
    const width = streetWidth(grid);
    clearance = Math.min(clearance, Math.abs(value - grid) - width / 2 - streetEdgeWidth(width));
  }
  // One through lane per block: residential rows face it on both sides.
  const lane = CITY.blockSize / 2 + Math.round((raw.z - CITY.blockSize / 2) / CITY.blockSize) * CITY.blockSize;
  return Math.min(clearance, Math.abs(raw.z - lane) - STREETS.laneWidth / 2 - STREETS.sharedEdge);
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

export function pavedSurfaceOffset(x, z) {
  if (ringDistance(x, z) < 8) return streetElevation(16);
  if (!streetAllowed(x, z)) return 0;
  const { x: rawX, z: rawZ } = unwarpStreet(x, z);
  let offset = 0;
  for (const value of [rawX, rawZ]) {
    const gridLine = Math.round(value / CITY.blockSize) * CITY.blockSize;
    const width = streetWidth(gridLine), halfWidth = width / 2;
    const distance = Math.abs(value - gridLine);
    if (distance < halfWidth) offset = Math.max(offset, streetElevation(width));
    else if (distance < halfWidth + streetEdgeWidth(width)) offset = Math.max(offset, .10);
  }
  const blockX = 72 + Math.round((rawX - 72) / 144) * 144;
  const blockZ = 72 + Math.round((rawZ - 72) / 144) * 144;
  if (settlementDensity(blockX, blockZ) > .12 && ringDistance(x, z) > 15) {
    if (Math.abs(rawZ - blockZ) < STREETS.laneWidth / 2) return Math.max(offset, streetElevation(STREETS.laneWidth));
    if (Math.abs(rawZ - blockZ) < STREETS.laneWidth / 2 + STREETS.sharedEdge) offset = Math.max(offset, .10);
  }
  return offset;
}

export function groundHeight(x, z) {
  const bridge = bridgeSurfaceHeight(x, z);
  if (bridge !== null) return bridge;
  if (Math.abs(x - BASE.x) < BASE.width * BASE.scale / 2 + 1.5 * BASE.scale
      && Math.abs(z - BASE.z) < BASE.depth * BASE.scale / 2 + 1.5 * BASE.scale) return BASE.floorHeight * BASE.scale;
  // Count paved surfaces and the lookout platform when setting the person's eye height.
  const lookout = CITY.lookout;
  if (Math.abs(x - lookout.x) < 12.5 && Math.abs(z - lookout.z) < 7) return terrainHeight(lookout.x, lookout.z) + .25;
  return terrainHeight(x, z) + pavedSurfaceOffset(x, z);
}

export function bridgeSurfaceHeight(x, z) {
  const bridge = CITY.bridges.find(center => Math.abs(x - center) <= 10.05);
  if (bridge === undefined) return null;
  const distance = Math.abs(z - riverZ(bridge)), half = CITY.bridgeLength / 2, rampLength = 14;
  if (distance > half + rampLength) return null;
  const offset = Math.abs(x - bridge);
  const deck = offset >= 7 && offset <= 9.05 ? .79 : .65;
  const t = Math.max(0, Math.min(1, (half + rampLength - distance) / rampLength));
  const approach = terrainHeight(x, z) + streetElevation(STREETS.arterialWidth);
  return approach + (deck - approach) * t;
}

// Spatial bins keep walking checks independent of the total building count.
export function createCollisionIndex() {
  const bins = new Map();
  const cellSize = 48;
  let count = 0;
  function add({ x, z, w, d, y = -Infinity, h = Infinity, roof = null }) {
    const bounds = { x, z, halfW: w / 2, halfD: d / 2, w: w / 2 + .6, d: d / 2 + .6, bottom: y, top: Number.isFinite(h) ? y + h : Infinity, roof };
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
  function overlapsBox(x, z, w, d) {
    const halfW = w / 2, halfD = d / 2;
    for (let gx = Math.floor((x - halfW) / cellSize); gx <= Math.floor((x + halfW) / cellSize); gx++) {
      for (let gz = Math.floor((z - halfD) / cellSize); gz <= Math.floor((z + halfD) / cellSize); gz++) {
        for (const b of bins.get(`${gx},${gz}`) ?? []) {
          if (Math.abs(x - b.x) < halfW + b.w && Math.abs(z - b.z) < halfD + b.d) return true;
        }
      }
    }
    return false;
  }
  function blocked(x, z) {
    if (outsideWalkableWorld(x, z)) return true;
    return hasObstacle(x, z);
  }
  function outsideWalkableWorld(x, z) {
    return basinRadius(x, z) > CITY.walkRadius || (inRiver(x, z, .7) && !onBridge(x));
  }
  function nearby(minX, minZ, maxX, maxZ) {
    const found = new Set();
    for (let gx = Math.floor(minX / cellSize); gx <= Math.floor(maxX / cellSize); gx++) {
      for (let gz = Math.floor(minZ / cellSize); gz <= Math.floor(maxZ / cellSize); gz++) {
        for (const bounds of bins.get(`${gx},${gz}`) ?? []) found.add(bounds);
      }
    }
    return found;
  }
  function topAt(b,x,z,radius=0) {
    if(!b.roof) return b.top;
    const roof=b.roof, cos=Math.cos(roof.rotation), sin=Math.sin(roof.rotation);
    const lx=Math.max(0,Math.abs((x-b.x)*cos-(z-b.z)*sin)-radius);
    const lz=Math.max(0,Math.abs((x-b.x)*sin+(z-b.z)*cos)-radius);
    let ratio=Math.max(0,1-lx/(roof.w/2));
    if(roof.kind==='hip') ratio=Math.min(ratio,Math.max(0,(roof.d/2-lz)/(roof.d*.28)));
    return roof.bottom+roof.height*ratio;
  }
  function blockedAt(x, z, feetY, height, radius = .28) {
    if (basinRadius(x,z)>CITY.walkRadius || (inRiver(x,z,.7) && !onBridge(x) && feetY<2)) return true;
    for (const b of nearby(x - radius, z - radius, x + radius, z + radius)) {
      if (feetY < topAt(b,x,z,radius) - .015 && feetY + height > b.bottom + .015
          && Math.abs(x - b.x) < b.halfW + radius && Math.abs(z - b.z) < b.halfD + radius) return true;
    }
    return false;
  }
  function canOccupy(x, z, feetY, height, radius = .28) {
    return !blockedAt(x, z, feetY, height, radius);
  }
  function surfaceHeightAt(x, z, feetY, maxStep = .38) {
    let surface = groundHeight(x, z);
    const supportRadius = .28;
    for (const b of nearby(x - supportRadius, z - supportRadius, x + supportRadius, z + supportRadius)) {
      const top=topAt(b,x,z,supportRadius);
      if (Number.isFinite(top) && top <= feetY + maxStep + .015 && top > surface
          && Math.abs(x - b.x) <= b.halfW + supportRadius && Math.abs(z - b.z) <= b.halfD + supportRadius) surface = top;
    }
    return surface;
  }
  // Camera sphere sweep against height-aware solids. Water and city bounds
  // constrain the player, while the camera can look across them freely.
  function segmentFraction(from, to, radius = .24) {
    let nearest = 1;
    for (const b of nearby(Math.min(from.x, to.x) - radius, Math.min(from.z, to.z) - radius,
      Math.max(from.x, to.x) + radius, Math.max(from.z, to.z) + radius)) {
      let enter = 0, leave = nearest;
      const ranges = [
        ['x', b.x - b.halfW - radius, b.x + b.halfW + radius],
        ['y', b.bottom - radius, b.top + radius],
        ['z', b.z - b.halfD - radius, b.z + b.halfD + radius],
      ];
      for (const [axis, min, max] of ranges) {
        const direction = to[axis] - from[axis];
        if (Math.abs(direction) < 1e-9) {
          if (from[axis] < min || from[axis] > max) { enter = 2;break; }
        } else {
          let a = (min - from[axis]) / direction, c = (max - from[axis]) / direction;
          if (a > c) [a, c] = [c, a];
          enter = Math.max(enter, a);leave = Math.min(leave, c);
          if (enter > leave) break;
        }
      }
      // A pitched roof is a convex volume under its actual planes. Clipping
      // the sweep to these planes avoids a phantom wall above the sloped eaves.
      if (b.roof && enter <= leave) {
        const roof=b.roof, cos=Math.cos(roof.rotation), sin=Math.sin(roof.rotation);
        const lx=(from.x-b.x)*cos-(from.z-b.z)*sin, lz=(from.x-b.x)*sin+(from.z-b.z)*cos;
        const vx=(to.x-from.x)*cos-(to.z-from.z)*sin, vz=(to.x-from.x)*sin+(to.z-from.z)*cos;
        const vy=to.y-from.y, sx=roof.height/(roof.w/2);
        const planes=[[sx,0,roof.bottom+roof.height],[-sx,0,roof.bottom+roof.height]];
        if(roof.kind==='hip') {
          const sz=roof.height/(roof.d*.28), ceiling=roof.bottom+roof.height*.5/.28;
          planes.push([0,sz,ceiling],[0,-sz,ceiling]);
        }
        for(const [nx,nz,ceiling] of planes) {
          const distance=from.y+nx*lx+nz*lz-ceiling-radius*Math.hypot(1,nx,nz);
          const direction=vy+nx*vx+nz*vz;
          if(Math.abs(direction)<1e-9) {if(distance>0){enter=2;break;}}
          else {
            const t=-distance/direction;
            if(direction<0) enter=Math.max(enter,t);else leave=Math.min(leave,t);
            if(enter>leave) break;
          }
        }
      }
      if (enter <= leave && leave >= 0 && enter >= 0) nearest = Math.min(nearest, enter);
    }
    return nearest;
  }
  return { add, blocked, blockedAt, canOccupy, outsideWorld:(x,z)=>basinRadius(x,z)>CITY.walkRadius, surfaceHeightAt, segmentFraction, hasObstacle, overlapsBox, get count() { return count; } };
}

export function seededRandom(initial = 20261022) {
  let seed = initial;
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
