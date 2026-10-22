// All dimensions use the same metres as walking, doorways and the city terrain.
export const PERSON = { height: 1.75, eyeHeight: 1.63, crouchHeight: 1.05, crouchEyeHeight: .95, walkSpeed: 2.2, sprintSpeed: 6.2, walkingFov: 62 };
export const ARCHITECTURE = {
  previousFootprintScale: 1.35,
  enlargement: 1.25,
  footprintScale: 1.35 * 1.25,
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
