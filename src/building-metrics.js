// All dimensions use the same metres as walking, doorways and the city terrain.
export const PERSON = { eyeHeight: 1.68, walkSpeed: 2.2, sprintSpeed: 6.2, walkingFov: 62 };
export const ARCHITECTURE = {
  footprintScale: 1.35,
  floorHeight: 3.3,
  doorHeight: 2.1,
  doorWidth: 1.0,
  windowSill: 1.0,
  windowHeight: 1.3,
  eaves: 0.65,
  balconyDepth: 1.1,
  walls: ['#c4cbbb', '#9eafa9', '#b6baa4', '#bda7a4', '#95acb9', '#d1ccbb', '#a7b6a4'],
  roofs: ['#40586c', '#4c5366', '#75535a', '#41685e', '#6a5351', '#4d6970', '#805e68'],
};

export function buildingDimensions(width, depth, previousHeight, midrise = false) {
  const floors = midrise ? Math.max(5, Math.ceil(previousHeight / ARCHITECTURE.floorHeight)) : previousHeight > 9 ? 3 : 2;
  return {
    w: width * ARCHITECTURE.footprintScale,
    d: depth * ARCHITECTURE.footprintScale,
    h: floors * ARCHITECTURE.floorHeight,
    floors,
    midrise,
  };
}

export function orientedFootprint(w, d, rotation, projection = 0) {
  const sin = Math.abs(Math.sin(rotation)), cos = Math.abs(Math.cos(rotation));
  return { w: w * cos + d * sin + projection * 2, d: w * sin + d * cos + projection * 2 };
}

export function facesNearestStreet(xOffset, zOffset) {
  // Outer plots face the public road; only interior plots face the shared access lane.
  const outerX = Math.abs(xOffset) > 30, outerZ = Math.abs(zOffset) > 30;
  if (outerX && !outerZ) return Math.sign(xOffset) * Math.PI / 2;
  if (outerZ) return zOffset > 0 ? 0 : Math.PI;
  if (Math.abs(xOffset) < Math.abs(zOffset)) return -Math.sign(xOffset) * Math.PI / 2;
  return zOffset < 0 ? 0 : Math.PI;
}


export function fitsStreetLot(rawX, rawZ, blockX, blockZ, footprint) {
  const clearance = (value, center) => {
    const offset = value - center;
    const nearest = center + Math.sign(offset) * 72;
    const outer = Math.abs(offset) > 30;
    const roadWidth = outer ? (Math.abs(nearest % 1008) < .01 ? 18 : 6) : 3.4;
    const distance = outer ? 72 - Math.abs(offset) : Math.abs(offset);
    return distance - roadWidth / 2 - 1.1;
  };
  return footprint.w / 2 < clearance(rawX, blockX) && footprint.d / 2 < clearance(rawZ, blockZ);
}
