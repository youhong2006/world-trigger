import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLandscape } from './landscape.js';
import { createArchitecture } from './architecture.js';
import { ARCHITECTURE, orientedFootprint } from './building-metrics.js';
import { planStreetBlock, urbanOccupancy } from './neighborhood.js';
import { CITY, STREETS, basinRadius, terrainHeight, settlementDensity, riverZ, ringDistance, inRiver, inCampus, forestAt, seededRandom, streetPosition, streetWidth, streetEdgeWidth, streetElevation, streetAllowed, streetClearance, bridgeSurfaceHeight } from './city-layout.js';

const greens = ['#2a633f', '#3d7746', '#477f48', '#376e42', '#56884b'];

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
    const lx = x - dz / length * width / 2, lz = z + dx / length * width / 2;
    const rx = x + dz / length * width / 2, rz = z - dx / length * width / 2;
    vertices.push(lx, typeof y === 'function' ? y(lx, lz) : y, lz);
    vertices.push(rx, typeof y === 'function' ? y(rx, rz) : y, rz);
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

export function createCity({ scene, box, collision }) {
  const random = seededRandom();
  const pick = values => values[Math.floor(random() * values.length)];
  const terrain = createLandscape(scene);
  const lots = [], trunks = [], foliage = [], markings = [];
  const architecture = createArchitecture(scene);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const plaster = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  const roadMaterial = new THREE.MeshStandardMaterial({ color: '#626d75', roughness: 1, side: THREE.DoubleSide });
  const roadMeshes = [], sidewalkMeshes = [], edgeMeshes = [];
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: '#bbc2b7', roughness: 1, side: THREE.DoubleSide });
  const paintMaterial = new THREE.MeshBasicMaterial({ color: '#deded2', side: THREE.DoubleSide });

  function nearRing(x, z, padding = 13) { return ringDistance(x, z) < padding; }
  function addStreet(points, width = 6) {
    if (points.length < 2) return;
    const height = streetElevation(width);
    roadMeshes.push(ribbon(scene, points, width, '#626d75', (x, z) => terrainHeight(x, z) + height, roadMaterial));
    sidewalkMeshes.push(ribbon(scene, points, width + streetEdgeWidth(width) * 2, '#bbc2b7', (x, z) => terrainHeight(x, z) + 0.10, sidewalkMaterial));
    if (width <= STREETS.localWidth) for (const side of [-1, 1]) {
      const edge = points.map(([x, z], i) => {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
        return [x - side * dz / length * (width / 2 - .35), z + side * dx / length * (width / 2 - .35)];
      });
      edgeMeshes.push(ribbon(scene, edge, .10, '#deded2', (x, z) => terrainHeight(x, z) + height + .012, paintMaterial));
    }
  }

  // Streets follow the same terrain as walking and taper into rural lanes near the foothills.
  for (let line = -3744; line <= 3744; line += CITY.blockSize) {
    const major = line % 1008 === 0;
    for (const orientation of [0, 1]) {
      let points = [];
      for (let cross = -3888; cross <= 3888; cross += 12) {
        const { x, z } = streetPosition(orientation ? cross : line, orientation ? line : cross);
        if (!streetAllowed(x, z)) { addStreet(points, streetWidth(line)); points = []; continue; }
        points.push([x, z]);
        if (major && cross % 36 === 0) markings.push({ x, z, y: terrainHeight(x, z) + streetElevation(streetWidth(line)) + .015, w: orientation ? 6 : 0.15, h: 0.015, d: orientation ? 0.15 : 6, color: '#ebe8cd' });
      }
      addStreet(points, streetWidth(line));
    }
  }

  // The base's rectangular security perimeter remains distinct from the organic city edge.
  const ring = [], perimeter = CITY.ring, radius = perimeter.radius;
  for (const [cx, cz, start] of [
    [perimeter.maxX - radius, perimeter.maxZ - radius, 0],
    [perimeter.minX + radius, perimeter.maxZ - radius, Math.PI / 2],
    [perimeter.minX + radius, perimeter.minZ + radius, Math.PI],
    [perimeter.maxX - radius, perimeter.minZ + radius, Math.PI * 1.5],
  ]) for (let i = 0; i <= 24; i++) {
    const a = start + i / 24 * Math.PI / 2;
    ring.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
  }
  ring.push(ring[0]);
  addStreet(ring, 16);

  // Continuous frontage rows replace the sparse fixed candidate grid. Each
  // 144m block has one 5m through lane, with back-to-back homes on each side.
  for (let bx = -3672; bx <= 3672; bx += CITY.blockSize) {
    for (let bz = -3672; bz <= 3672; bz += CITY.blockSize) {
      if (settlementDensity(bx, bz) > .12) {
        let lane = [];
        for (let t = -72; t <= 72; t += 8) {
          const { x, z } = streetPosition(bx + t, bz);
          if (!streetAllowed(x, z) || nearRing(x, z, 15)) { addStreet(lane, STREETS.laneWidth);lane = [];continue; }
          lane.push([x, z]);
        }
        addStreet(lane, STREETS.laneWidth);
      }
      for (const planned of planStreetBlock(bx, bz, random)) {
        const { rawX, rawZ, w, d, h, floors, rotation, midrise } = planned;
        const { x, z } = streetPosition(rawX, rawZ);
        if (random() > urbanOccupancy(x, z)) continue;
        const elevation = terrainHeight(x, z);
        if (elevation > 46 || inCampus(x, z, 30) || inRiver(x, z, 48) || forestAt(x, z, 18) || nearRing(x, z, 32)) continue;
        const footprint = orientedFootprint(w, d, rotation, ARCHITECTURE.eaves);
        const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => [x + sx * footprint.w / 2, z + sz * footprint.d / 2]));
        if (corners.some(([cx, cz]) => streetClearance(cx, cz) < .15) || collision.overlapsBox(x, z, footprint.w, footprint.d)) continue;
        const cornerHeights = [-1, 1].flatMap(sx => [-1, 1].map(sz => terrainHeight(x + sx * footprint.w / 2, z + sz * footprint.d / 2)));
        if (Math.max(...cornerHeights) - Math.min(...cornerHeights) > 1.8) continue;
        const foundation = Math.max(elevation, ...cornerHeights);
        const color = pick(ARCHITECTURE.walls), roofColor = pick(ARCHITECTURE.roofs);
        const choice = random();
        const roofKind = midrise || (floors >= 4 && choice < .65) ? 'flat' : choice < .48 ? 'gable' : choice < .86 ? 'hip' : 'flat';
        const roofHeight = roofKind === 'flat' ? .7 : 2.8 + random() * 1.6;
        const lot = { ...planned, x, z, foundation, color, roofColor, roofKind, roofHeight };
        architecture.add(lot);
        collision.add({ x, z, w: footprint.w, d: footprint.d, y: foundation, h: h + (roofKind==='flat'?.22:roofHeight), roof:roofKind === 'flat' ? null : { kind:roofKind,bottom:foundation+h,height:roofHeight,w:w+ARCHITECTURE.eaves*2,d:d+ARCHITECTURE.eaves*2,rotation } });
        lots.push(lot);
      }
    }
  }
  architecture.finish();
  for (const obstacle of architecture.obstacles) collision.add(obstacle);
  instances(scene, unitBox, plaster, markings, false);
  // Merge terrain-following streets so extending the city does not add hundreds of draw calls.
  scene.remove(...roadMeshes);
  const streets = new THREE.Mesh(mergeGeometries(roadMeshes.map(mesh => mesh.geometry)), roadMaterial);
  streets.name = 'Terrain-following urban streets';
  streets.receiveShadow = true;
  scene.add(streets);
  scene.remove(...sidewalkMeshes);
  const sidewalks = new THREE.Mesh(mergeGeometries(sidewalkMeshes.map(mesh => mesh.geometry)), sidewalkMaterial);
  sidewalks.receiveShadow = true;scene.add(sidewalks);
  scene.remove(...edgeMeshes);
  const edges = new THREE.Mesh(mergeGeometries(edgeMeshes.map(mesh => mesh.geometry)), paintMaterial);
  edges.name = 'Residential street edge lines';scene.add(edges);

  function addTree(x, z, scale = 1) {
    const y = terrainHeight(x, z), height = (7 + random() * 4) * scale;
    trunks.push({ x, z, y: y + height * 0.28, w: 0.7 * scale, h: height * 0.56, d: 0.7 * scale, color: '#726e55' });
    foliage.push({ x, z, y: y + height * 0.77, w: 3.5 * scale, h: height * 0.53, d: 3.7 * scale, color: pick(greens) });
  }
  for (let i = 0; i < 28000; i++) {
    const x = (random() - 0.5) * 9800, z = (random() - 0.5) * 9000;
    const r = basinRadius(x, z), h = terrainHeight(x, z);
    if (r < 0.3 || r > 1.58 || h > 720 || inCampus(x, z, 12) || inRiver(x, z, 64) || nearRing(x, z, 15)) continue;
    const chance = forestAt(x, z, 10) ? 0.96 : r > 0.75 ? 0.76 : 0.11;
    if (random() > chance || collision.hasObstacle(x, z)) continue;
    if (streetClearance(x, z) < 2 && h < 39) continue;
    addTree(x, z, 0.85 + random() * 0.8);
  }
  // More closely spaced vegetation gives the interior green belts a natural canopy edge.
  for (const forest of CITY.forests) for (let i = 0; i < 620; i++) {
    const x = forest.x + (random() - 0.5) * forest.rx * 2.3;
    const z = forest.z + (random() - 0.5) * forest.rz * 2.3;
    if (!forestAt(x, z) || inCampus(x, z, 10) || inRiver(x, z, 65) || nearRing(x, z, 20) || collision.hasObstacle(x, z)) continue;
    addTree(x, z, 1.05 + random() * 0.6);
  }
  instances(scene, new THREE.CylinderGeometry(0.5, 0.65, 1, 5), plaster, trunks, false);
  instances(scene, new THREE.IcosahedronGeometry(1, 0), plaster, foliage, false);

  // The new river sits well outside the base and continues through valleys at both ends.
  const riverPoints = [];
  for (let x = -11500; x <= 11500; x += 28) riverPoints.push([x, riverZ(x)]);
  ribbon(scene, riverPoints, CITY.riverWidth + 24, '#b2bc9e', 0.04);
  ribbon(scene, riverPoints, CITY.riverWidth + 14, '#73965f', 0.16);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#337da1', roughness: 0.38, metalness: 0.15, side: THREE.DoubleSide });
  ribbon(scene, riverPoints, CITY.riverWidth, '#337da1', 0.4, waterMaterial);
  for (const side of [-1, 1]) {
    ribbon(scene, riverPoints.filter(([x]) => Math.abs(x) < 3900).map(([x, z]) => [x, z + side * (CITY.riverWidth / 2 + 15)]), 4, '#c7c5ad', 0.45);
  }
  for (const x of CITY.bridges) {
    const z = riverZ(x), length = CITY.bridgeLength;
    box(x, 0.35, z, 20, 0.3, length, '#7c898d');
    // Match the collision floor: the bridge deck is reached by a gentle ramp,
    // rather than an abrupt .44m edge that a walking person cannot step over.
    for (const direction of [-1, 1]) {
      const points = Array.from({ length: 8 }, (_, i) => [x, z + direction * (length / 2 + i * 2)]);
      ribbon(scene, points, 20, '#7c898d', (vx, vz) => bridgeSurfaceHeight(vx, vz) ?? .21);
      for (const side of [-1, 1]) ribbon(scene, points.map(([vx, vz]) => [vx + side * 8, vz]), 2, '#bfc7c6', (vx, vz) => bridgeSurfaceHeight(vx, vz) ?? .21);
    }
    for (const side of [-1, 1]) {
      box(x + side * 8, 0.65, z, 2, 0.14, length, '#bfc7c6');
      box(x + side * 9.3, 1.65, z, 0.14, 0.16, length, '#738e9b');
      for (let s = -length / 2 + 3; s <= length / 2 - 3; s += 7) box(x + side * 9.3, 0.8, z + s, 0.13, 0.84, 0.13, '#738e9b');
    }
    for (let s = -length / 2 + 5; s <= length / 2; s += 14) box(x, 0.66, z + s, 0.2, 0.015, 6, '#e7e3ca');
    for (const side of [-1, 1]) box(x, 0.08, z + side * (length / 2 + 25), 18, 0.1, 54, '#8a9495');
  }

  const campus = CITY.campus, campusWidth = campus.maxX - campus.minX, campusDepth = campus.maxZ - campus.minZ;
  const campusZ = (campus.minZ + campus.maxZ) / 2;
  box(0, -0.12, campusZ, campusWidth, 0.13, campusDepth, '#bfad83');
  for (const x of [campus.minX + 15, campus.maxX - 15]) box(x, 0.02, campusZ, 8, 0.08, campusDepth - 30, '#a7a899');
  box(0, 0.02, campus.maxZ - 15, campusWidth - 30, 0.08, 8, '#a7a899');
  box(0, 0.06, (campus.maxZ + riverZ(0) - CITY.bridgeLength / 2) / 2, 18, 0.08, riverZ(0) - CITY.bridgeLength / 2 - campus.maxZ, '#8a9495');

  // Rural parcels lie on the same terrain rather than on square ground tiles.
  const fieldGeometries = [], fieldColors = ['#8ea65d', '#91ad68', '#70934e', '#a4b577'];
  for (let i = 0; i < 1500; i++) {
    const x = (random() - 0.5) * 7300, z = (random() - 0.5) * 6600;
    const r = basinRadius(x, z);
    if (r < 0.58 || r > 1.08 || inCampus(x, z, 70) || inRiver(x, z, 115) || forestAt(x, z, 65) || terrainHeight(x, z) > 75) continue;
    if (collision.hasObstacle(x, z) || collision.hasObstacle(x - 35, z) || collision.hasObstacle(x + 35, z)) continue;
    const geometry = new THREE.PlaneGeometry(38 + random() * 54, 26 + random() * 44, 3, 3);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position, color = new THREE.Color(pick(fieldColors)), colors = [];
    for (let v = 0; v < position.count; v++) {
      const vx = x + position.getX(v), vz = z + position.getZ(v);
      position.setXYZ(v, vx, terrainHeight(vx, vz) + 0.1, vz);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();fieldGeometries.push(geometry);
  }
  if (fieldGeometries.length) {
    const fields = new THREE.Mesh(mergeGeometries(fieldGeometries), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    fields.receiveShadow = true;scene.add(fields);
  }

  const lookout = CITY.lookout, lookoutY = terrainHeight(lookout.x, lookout.z);
  box(lookout.x, lookoutY, lookout.z, 25, 0.25, 14, '#b4b49a');
  for (const x of [lookout.x - 11, lookout.x + 11]) box(x, lookoutY + 0.25, lookout.z, 0.16, 1, 13, '#817d64');
  const lookoutTrail = [];
  for (let i = 0; i <= 40; i++) lookoutTrail.push([lookout.x + Math.sin(i / 40 * Math.PI) * 28, lookout.z + i * 6]);
  ribbon(scene, lookoutTrail, 4, '#bfb99c', (x, z) => terrainHeight(x, z) + 0.2);

  const cloudEntries = [];
  for (let i = 0; i < 90; i++) {
    const cx = (random() - 0.5) * 24000, cz = -9500 - random() * 3500;
    for (let lobe = 0; lobe < 5; lobe++) cloudEntries.push({ x: cx + lobe * 95, z: cz + random() * 60, y: 2100 + random() * 420, w: 90 + random() * 80, h: 35 + random() * 38, d: 70 + random() * 45, color: '#ffffff' });
  }
  const clouds = instances(scene, new THREE.SphereGeometry(1, 9, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.86, depthWrite: false }), cloudEntries, false);
  return { lots, architecture, trees: foliage.length, clouds, terrain, roads: roadMeshes.length, fields: fieldGeometries.length, bridges: CITY.bridges.length, bounds: CITY.halfSize };
}
