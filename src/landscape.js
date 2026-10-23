import * as THREE from 'three';
import { clipExcavationTriangle } from './hq-terrain.js';
import { CITY, basinRadius, terrainHeight } from './city-layout.js';

const clamp = (value) => Math.max(0, Math.min(1, value));

// Shared by terrain vertices and the overview map: all vegetation shades blend continuously.
export function terrainRGB(x, z, height = terrainHeight(x, z)) {
  const radial = basinRadius(x, z);
  const variation = Math.sin(x / 180) * Math.cos(z / 230) * 8 + Math.sin((x + z) / 93) * 3;
  let forest = clamp((radial - 0.62) / 0.45) * (0.64 + Math.sin(x / 230 + Math.cos(z / 340)) * 0.25);
  for (const grove of CITY.forests) {
    const q = ((x - grove.x) / grove.rx) ** 2 + ((z - grove.z) / grove.rz) ** 2;
    forest = Math.max(forest, clamp((1.25 - q + Math.sin(x / 90) * 0.09) / 0.55) * 0.85);
  }
  const high = clamp((height - 420) / 600);
  const plain = [119 + variation, 157 + variation, 86 + variation * 0.6];
  const woodland = [48, 100, 58];
  const ridge = [107, 132, 117];
  return plain.map(
    (value, i) => (value * (1 - forest) + woodland[i] * forest) * (1 - high) + ridge[i] * high,
  );
}

export function createLandscape(scene) {
  const rings = 256,
    segments = 320,
    positions = [],
    colors = [],
    indices = [];
  const color = new THREE.Color();
  function vertex(x, z) {
    const h = terrainHeight(x, z);
    positions.push(x, h, z);
    const rgb = terrainRGB(x, z, h);
    color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    colors.push(color.r, color.g, color.b);
  }
  vertex(0, 0);
  for (let ring = 1; ring <= rings; ring++) {
    const radius = CITY.terrainRadius * (ring / rings) ** 1.65;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      vertex(Math.cos(angle) * radius, Math.sin(angle) * radius);
      const current = 1 + (ring - 1) * segments + i;
      const next = 1 + (ring - 1) * segments + ((i + 1) % segments);
      if (ring === 1) indices.push(0, next, current);
      else {
        const inner = current - segments;
        const innerNext = next - segments;
        indices.push(inner, next, current, inner, innerNext, next);
      }
    }
  }
  // The campus apron and HQ supply their own surfaces; trim underlying grass to avoid z-fighting.
  const clippedIndices = [],
    bounds = CITY.campus;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices
      .slice(i, i + 3)
      .map((index) => ({
        x: positions[index * 3],
        y: positions[index * 3 + 1],
        z: positions[index * 3 + 2],
        color: colors.slice(index * 3, index * 3 + 3),
      }));
    const pieces = clipExcavationTriangle(triangle, bounds);
    if (pieces.length === 1 && pieces[0] === triangle) {
      clippedIndices.push(...indices.slice(i, i + 3));
      continue;
    }
    for (const polygon of pieces) {
      const start = positions.length / 3;
      for (const p of polygon) {
        positions.push(p.x, p.y, p.z);
        colors.push(...p.color);
      }
      for (let j = 1; j < polygon.length - 1; j++) clippedIndices.push(start, start + j, start + j + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(clippedIndices);
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  terrain.name = 'Continuous irregular basin and enclosing mountain range';
  terrain.receiveShadow = true;
  scene.add(terrain);
  return terrain;
}

export function createSky(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
  function setDay(day) {
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, day ? '#428fd1' : '#071426');
    gradient.addColorStop(0.38, day ? '#72b5e4' : '#14273e');
    gradient.addColorStop(0.5, day ? '#accdd9' : '#233c50');
    gradient.addColorStop(1, day ? '#accdd9' : '#233c50');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 512);
    texture.needsUpdate = true;
  }
  setDay(true);
  return { setDay };
}
