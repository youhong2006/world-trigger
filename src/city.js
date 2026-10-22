import * as THREE from 'three';
import { CITY, riverZ, ringDistance, inRiver, inCampus, forestAt, seededRandom, streetPosition, lookoutTerrainHeight } from './city-layout.js';

const walls = ['#d6d8d8', '#eee9dc', '#c9cecd', '#e1dace', '#e9e9e2', '#b7c5cb'];
const roofs = ['#53697c', '#5e6a77', '#7a6660', '#69756c', '#78858b', '#796b67'];
const greens = ['#2a633f', '#3d7746', '#477f48', '#376e42', '#56884b'];

function gableGeometry() {
  // Unit gable roof: ridge follows Z, with two sloped planes and closed gable ends.
  const points = [
    -.5, 0, -.5, 0, 1, -.5, -.5, 0, .5,
    -.5, 0, .5, 0, 1, -.5, 0, 1, .5,
    .5, 0, .5, 0, 1, .5, .5, 0, -.5,
    .5, 0, -.5, 0, 1, .5, 0, 1, -.5,
    -.5, 0, -.5, .5, 0, -.5, 0, 1, -.5,
    .5, 0, .5, -.5, 0, .5, 0, 1, .5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  // Faces must point outward so the pitched roofs remain visible from above.
  geometry.setIndex(Array.from({ length: points.length / 9 }, (_, i) => [i * 3, i * 3 + 2, i * 3 + 1]).flat());
  geometry.computeVertexNormals();
  return geometry;
}

function facadeMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (const y of [42, 149]) for (const x of [36, 157]) {
    ctx.fillStyle = '#d0d4d4';
    ctx.fillRect(x - 4, y - 4, 54, 62);
    ctx.fillStyle = '#4b7185';
    ctx.fillRect(x, y, 46, 54);
    ctx.fillStyle = '#7796a1';
    ctx.fillRect(x + 4, y + 3, 17, 47);
    ctx.fillStyle = '#d5d8d5';
    ctx.fillRect(x + 21, y, 3, 54);
  }
  ctx.fillStyle = '#b4bcb9';
  ctx.fillRect(0, 247, 256, 9);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
}

function instances(scene, geometry, material, entries, shadows = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const object = new THREE.Object3D();
  entries.forEach((item, i) => {
    object.position.set(item.x, item.y, item.z);
    object.scale.set(item.w, item.h, item.d);
    object.rotation.set(0, item.rotation ?? 0, 0);
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
    if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

function ribbon(scene, points, width, color, y = 0.05, material) {
  const vertices = [], indices = [];
  points.forEach(([x, z], i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
    vertices.push(x - dz / length * width / 2, y, z + dx / length * width / 2);
    vertices.push(x + dz / length * width / 2, y, z - dx / length * width / 2);
    if (i) { const n = i * 2; indices.push(n - 2, n, n - 1, n - 1, n, n + 1); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createCity({ scene, box, cylinder, collision }) {
  const random = seededRandom();
  const pick = values => values[Math.floor(random() * values.length)];
  box(0, -2.4, 0, 6200, 1, 5800, '#75a35d');
  box(0, -1.3, 0, 2360, 1, 2360, '#75a35d');
  const lots = [], bodies = [], roofEntries = [], flatRoofs = [], trunks = [], foliage = [], roadEntries = [], markings = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // Continuous city streets, with open corridors through the forest belts.
  for (let line = -1008; line <= 1008; line += 72) {
    const major = line % 504 === 0;
    for (let cross = -1044; cross < 1044; cross += 12) {
      for (const orientation of [0, 1]) {
        const rawX = orientation ? cross : line, rawZ = orientation ? line : cross;
        const { x, z } = streetPosition(rawX, rawZ);
        const next = streetPosition(rawX + (orientation ? 1 : 0), rawZ + (orientation ? 0 : 1));
        const rotation = orientation ? -Math.atan2(next.z - z, next.x - x) : Math.atan2(next.x - x, next.z - z);
        if (inCampus(x, z, 8) || inRiver(x, z, 10) || forestAt(x, z, -18)) continue;
        roadEntries.push({ x, z, y: 0.025, w: orientation ? 12.1 : (major ? 17 : 6), h: 0.09, rotation, d: orientation ? (major ? 17 : 6) : 12.1, color: major ? '#64727a' : '#8b9597' });
        if (major && cross % 36 === 0) markings.push({ x, z, y: 0.085, w: orientation ? 4 : 0.18, h: 0.01, d: orientation ? 0.18 : 4, color: '#e8e8d8' });
      }
    }
  }

  // A broad ring road connects dense neighborhoods around the protected HQ site.
  const ring = [];
  const perimeter = CITY.ring;
  const radius = perimeter.radius;
  const corners = [
    [perimeter.maxX - radius, perimeter.maxZ - radius, 0],
    [perimeter.minX + radius, perimeter.maxZ - radius, Math.PI / 2],
    [perimeter.minX + radius, perimeter.minZ + radius, Math.PI],
    [perimeter.maxX - radius, perimeter.minZ + radius, Math.PI * 1.5],
  ];
  for (const [cx, cz, start] of corners) for (let i = 0; i <= 24; i++) {
    const a = start + i / 24 * Math.PI / 2;
    ring.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
  }
  ring.push(ring[0]);
  ribbon(scene, ring, 14, '#78858a', 0.12);
  ribbon(scene, ring, 0.25, '#ebe6d4', 0.135);
  function nearRing(x, z, padding = 13) {
    return ringDistance(x, z) < padding;
  }

  // Thousands of individual lots, with density dropping toward the green outskirts.
  for (let bx = -972; bx <= 972; bx += 72) {
    for (let bz = -972; bz <= 972; bz += 72) {
      const radial = Math.hypot(bx / 1120, bz / 1200);
      for (const ox of [-23, 0, 23]) for (const oz of [-23, 0, 23]) {
        const { x, z } = streetPosition(bx + ox + (random() - 0.5) * 4, bz + oz + (random() - 0.5) * 4);
        if (inCampus(x, z, 23) || inRiver(x, z, 25) || lookoutTerrainHeight(x, z) > 0.5 || forestAt(x, z, 14) || nearRing(x, z, 25)) continue;
        if (random() > (radial > 0.95 ? 0.12 : radial > 0.8 ? 0.32 : radial > 0.6 ? 0.68 : 0.96)) continue;
        const midrise = Math.abs(x) < 285 && z > 210 && !inRiver(x, z, 120) && random() < 0.47;
        const w = midrise ? 15 + random() * 3 : 10 + random() * 6;
        const d = midrise ? 15 + random() * 3 : 11 + random() * 5;
        const h = midrise ? 13 + random() * 22 : 5.5 + random() * 5;
        const rotation = random() > 0.5 ? Math.PI / 2 : 0;
        const color = pick(walls);
        bodies.push({ x, z, y: h / 2, w, h, d, rotation, color });
        const roof = { x, z, y: h, w: w + 1.1, h: 2.8 + random() * 2, d: d + 1.1, rotation, color: pick(roofs) };
        if (midrise || random() < 0.18) flatRoofs.push({ ...roof, y: h + 0.25, h: 0.5, color: '#c6cccc' });
        else roofEntries.push(roof);
        collision.add({ x, z, w: rotation ? d : w, d: rotation ? w : d });
        lots.push({ x, z, w, d, h, color, midrise });
      }
    }
  }

  const facade = facadeMaterial();
  const plaster = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  instances(scene, unitBox, [facade, facade, plaster, plaster, facade, facade], bodies);
  instances(scene, gableGeometry(), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), roofEntries);
  instances(scene, unitBox, plaster, flatRoofs);
  instances(scene, unitBox, plaster, roadEntries, false);
  instances(scene, unitBox, plaster, markings, false);

  function addTree(x, z, scale = 1, y = 0) {
    const height = (6 + random() * 3) * scale;
    trunks.push({ x, z, y: y + height * 0.28, w: 0.7 * scale, h: height * 0.56, d: 0.7 * scale, color: '#726e55' });
    foliage.push({ x, z, y: y + height * 0.77, w: 3.2 * scale, h: height * 0.52, d: 3.4 * scale, color: pick(greens) });
  }
  for (const forest of CITY.forests) {
    for (let i = 0; i < 550; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.98;
      const x = forest.x + Math.cos(a) * r * forest.rx;
      const z = forest.z + Math.sin(a) * r * forest.rz;
      if (inRiver(x, z, 36) || inCampus(x, z, 12) || nearRing(x, z, 12)) continue;
      const hillHeight = lookoutTerrainHeight(x, z);
      if (Math.abs(x - CITY.lookout.x) < 10 && z < 270 && z > 90) continue;
      addTree(x, z, 1 + random() * 0.6, hillHeight);
    }
  }
  for (let i = 0; i < 1400; i++) {
    const x = (random() - 0.5) * 2100, z = (random() - 0.5) * 2100;
    if (inCampus(x, z, 8) || inRiver(x, z, 32) || nearRing(x, z) || Math.abs(x % 72) < 12 || Math.abs(z % 72) < 12) continue;
    if (lots.some(l => Math.abs(l.x - x) < 12 && Math.abs(l.z - z) < 12)) continue;
    addTree(x, z, 0.7 + random() * 0.5, lookoutTerrainHeight(x, z));
  }

  // Foreground river: smooth lateral sweep, embankments and three usable crossings.
  const riverPoints = [];
  for (let x = -1380; x <= 1380; x += 12) riverPoints.push([x, riverZ(x)]);
  ribbon(scene, riverPoints, CITY.riverWidth + 20, '#c0c2a6', 0.02);
  ribbon(scene, riverPoints, CITY.riverWidth + 12, '#779b65', 0.13);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#367fa4', roughness: 0.34, metalness: 0.18, side: THREE.DoubleSide });
  ribbon(scene, riverPoints, CITY.riverWidth, '#367fa4', 0.36, waterMaterial);
  for (const side of [-1, 1]) {
    const path = riverPoints.map(([x, z]) => [x, z + side * (CITY.riverWidth / 2 + 11)]);
    ribbon(scene, path, 3.6, '#d3ceb8', 0.4);
  }
  const bridgeLength = 108;
  for (const x of CITY.bridges) {
    const z = riverZ(x);
    box(x, 0.35, z, 18, 0.3, bridgeLength, '#7c898d');
    for (const side of [-1, 1]) {
      box(x + side * 7, 0.65, z, 2.1, 0.14, bridgeLength, '#bfc7c6');
      box(x + side * 8.3, 1.65, z, 0.14, 0.16, bridgeLength, '#738e9b');
      for (let s = -50; s <= 50; s += 5) box(x + side * 8.3, 0.8, z + s, 0.13, 0.84, 0.13, '#738e9b');
    }
    for (const offset of [-16, 16]) box(x, -3, z + offset, 15, 3, 2.3, '#8c9b9d');
    for (let s = -48; s <= 48; s += 12) box(x, 0.66, z + s, 0.18, 0.015, 5, '#e7e3ca');
    // Connect both bridge ends to the neighborhood street network.
    for (const sign of [-1, 1]) box(x, 0.025, z + sign * 72, 17, 0.09, 38, '#64727a');
  }

  // Keep the fortress as the dominant center, surrounded by a cleared ochre perimeter.
  const campus = CITY.campus;
  const campusWidth = campus.maxX - campus.minX;
  const campusDepth = campus.maxZ - campus.minZ;
  const campusZ = (campus.minZ + campus.maxZ) / 2;
  box(0, -0.12, campusZ, campusWidth, 0.13, campusDepth, '#bfad83');
  for (const x of [campus.minX + 15, campus.maxX - 15]) box(x, 0.02, campusZ, 8, 0.08, campusDepth - 30, '#a7a899');
  box(0, 0.02, campus.maxZ - 15, campusWidth - 30, 0.08, 8, '#a7a899');
  // Connect the enlarged perimeter to the bridge approach without moving the river.
  const approachEnd = riverZ(0) - 50;
  box(0, 0.06, (campus.maxZ + approachEnd) / 2, 17, 0.08, approachEnd - campus.maxZ, '#64727a');

  // Agricultural patches around the margins prevent the city from becoming a uniform carpet.
  const fieldEntries = [];
  for (let i = 0; i < 85; i++) {
    const x = (random() - 0.5) * 2270, z = (random() - 0.5) * 2270;
    if (Math.hypot(x / 1100, z / 1050) < 0.8 || inRiver(x, z, 55) || forestAt(x, z, 30)) continue;
    if (lots.some(l => Math.abs(l.x - x) < 45 && Math.abs(l.z - z) < 35)) continue;
    fieldEntries.push({ x, z, y: -0.02, w: 30 + random() * 36, h: 0.03, d: 20 + random() * 35, color: pick(['#86ab60', '#92b36a', '#6c974e', '#a2b571']) });
  }
  instances(scene, unitBox, plaster, fieldEntries, false);

  // Low, continuous foothills and several layered ridgelines replace the old cones.
  function terrain(cx, cz, rx, rz, height, color, segments = 28) {
    const geometry = new THREE.PlaneGeometry(rx * 2, rz * 2, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      const r = Math.hypot(x / rx, z / rz);
      const crest = Math.max(0, 1 - r * r);
      const ripple = 1 + 0.12 * Math.sin(x * 0.031 + cz) * Math.cos(z * 0.025);
      position.setY(i, crest * crest * height * ripple - 1);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  terrain(CITY.lookout.x, CITY.lookout.z, CITY.lookout.rx, CITY.lookout.rz, 29, '#457b43');
  for (let layer = 2; layer >= 0; layer--) {
    for (let i = 0; i < 14; i++) {
      const x = -2600 + i * 400 + (random() - 0.5) * 100;
      terrain(x, -1500 - layer * 380, 410 + random() * 220, 390 + random() * 160, 65 + random() * 135, ['#458453', '#529579', '#709fa1'][layer], 24);
    }
  }
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    terrain(side * (1440 + random() * 220), -930 + i * 390, 320, 330, 35 + random() * 65, '#53895a', 20);
  }

  // Lookout plateau and a connected sloping walking path.
  box(CITY.lookout.x, 28.7, 120, 35, 0.3, 28, '#b4b49a');
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    CITY.lookout.x - 7, 0.1, 265, CITY.lookout.x + 7, 0.1, 265, CITY.lookout.x - 7, 29.05, 120,
    CITY.lookout.x + 7, 0.1, 265, CITY.lookout.x + 7, 29.05, 120, CITY.lookout.x - 7, 29.05, 120,
  ], 3));
  pathGeometry.computeVertexNormals();
  const lookoutPath = new THREE.Mesh(pathGeometry, new THREE.MeshStandardMaterial({ color: '#c3bca2', side: THREE.DoubleSide }));
  scene.add(lookoutPath);
  for (const x of [CITY.lookout.x - 15, CITY.lookout.x + 15]) box(x, 29, 120, 0.2, 1.1, 26, '#817d64');
  for (const x of [CITY.lookout.x - 9, CITY.lookout.x + 9]) box(x, 29.05, 112, 7, 0.5, 1.2, '#a28e68');

  instances(scene, new THREE.CylinderGeometry(0.5, 0.65, 1, 5), plaster, trunks, false);
  instances(scene, new THREE.IcosahedronGeometry(1, 1), plaster, foliage, false);

  // Shared cloud geometry keeps the sky light; no texture downloads are required.
  const cloudEntries = [];
  for (let i = 0; i < 65; i++) {
    const cx = (random() - 0.5) * 6500, cz = -2600 - random() * 1800;
    for (let lobe = 0; lobe < 4; lobe++) cloudEntries.push({ x: cx + lobe * 36, z: cz + random() * 25, y: 620 + random() * 160, w: 40 + random() * 28, h: 12 + random() * 15, d: 23 + random() * 15, color: '#ffffff' });
  }
  const clouds = instances(scene, new THREE.SphereGeometry(1, 9, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.86, depthWrite: false }), cloudEntries, false);
  clouds.renderOrder = 1;

  return { lots, trees: foliage.length, clouds, roads: roadEntries.length, fields: fieldEntries.length, bridges: CITY.bridges.length, bounds: CITY.halfSize };
}
