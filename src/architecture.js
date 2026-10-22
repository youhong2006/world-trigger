import * as THREE from 'three';
import { ARCHITECTURE } from './building-metrics.js';

function canvasTexture(paint, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function facadeTexture() {
  return canvasTexture(ctx => {
    ctx.fillStyle = '#fafaf5'; ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#c9cdd02a';ctx.lineWidth = 1;
    for (let y = 8; y < 512; y += 24) { ctx.beginPath();ctx.moveTo(0, y);ctx.lineTo(512, y);ctx.stroke(); }
    // One physically sized window bay per storey, including dark trim and sliding panes.
    ctx.fillStyle = '#687681';ctx.fillRect(121, 146, 270, 221);
    ctx.fillStyle = '#d2d7cf';ctx.fillRect(127, 151, 258, 209);
    ctx.fillStyle = '#263c50';ctx.fillRect(135, 158, 242, 194);
    const glass = ctx.createLinearGradient(135, 158, 377, 352);
    glass.addColorStop(0, '#526e83');glass.addColorStop(.45, '#314a60');glass.addColorStop(1, '#1e3349');
    ctx.fillStyle = glass;ctx.fillRect(140, 163, 232, 183);
    ctx.fillStyle = '#bdd0cd';ctx.fillRect(251, 158, 5, 194);ctx.fillRect(135, 338, 242, 5);
    ctx.fillStyle = '#93a8ad70';ctx.fillRect(143, 166, 107, 12);
    for (const x of [102, 394]) {
      ctx.fillStyle = '#a8b2b3';ctx.fillRect(x, 148, 16, 210);
      ctx.strokeStyle = '#74848b';ctx.lineWidth = 1;
      for (let y = 155; y < 353; y += 9) { ctx.beginPath();ctx.moveTo(x + 1, y);ctx.lineTo(x + 15, y);ctx.stroke(); }
    }
    ctx.fillStyle = '#bbc5c5';ctx.fillRect(119, 363, 276, 9);
    ctx.fillStyle = '#687e8b45';ctx.fillRect(119, 372, 276, 7);
    ctx.fillStyle = '#71828b';ctx.fillRect(0, 502, 512, 3);
    ctx.fillStyle = '#ced4cd';ctx.fillRect(0, 505, 512, 7);
  });
}

function roofTexture() {
  const texture = canvasTexture(ctx => {
    ctx.fillStyle = '#fafafa';ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) {
      const y = row * 32;
      ctx.strokeStyle = '#8a96a3';ctx.lineWidth = 2;
      ctx.beginPath();ctx.moveTo(0, y + 29);ctx.lineTo(512, y + 29);ctx.stroke();
      ctx.strokeStyle = '#ced6dd';ctx.lineWidth = 1;
      ctx.beginPath();ctx.moveTo(0, y + 2);ctx.lineTo(512, y + 2);ctx.stroke();
      for (let col = -1; col < 9; col++) {
        const x = col * 64 + (row % 2) * 32;
        ctx.strokeStyle = '#a6b2bd';
        ctx.beginPath();ctx.moveTo(x, y + 1);ctx.quadraticCurveTo(x + 4, y + 15, x, y + 29);ctx.stroke();
      }
    }
  });
  texture.repeat.set(2, 2);
  return texture;
}

function roofGeometry(hip = false, gablesOnly = false) {
  const positions = [], uvs = [];
  const a = [-.5, 0, -.5], b = [.5, 0, -.5], c = [.5, 0, .5], d = [-.5, 0, .5];
  const near = [0, 1, hip ? -.22 : -.5], far = [0, 1, hip ? .22 : .5];
  function triangle(p, q, r, outward = [0, 1, 0]) {
    const v1 = new THREE.Vector3(...q).sub(new THREE.Vector3(...p));
    const v2 = new THREE.Vector3(...r).sub(new THREE.Vector3(...p));
    if (v1.cross(v2).dot(new THREE.Vector3(...outward)) < 0) [q, r] = [r, q];
    for (const v of [p, q, r]) {
      positions.push(...v);
      uvs.push(Math.abs(outward[2]) > .5 ? v[0] + .5 : v[2] + .5, v[1]);
    }
  }
  if (!gablesOnly) {
    triangle(a, near, far);triangle(a, far, d);
    triangle(b, c, far);triangle(b, far, near);
  }
  if (hip || gablesOnly) { triangle(a, b, near, [0, 0, -1]);triangle(c, d, far, [0, 0, 1]); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function createArchitecture(scene) {
  const tones = new THREE.DataTexture(new Uint8Array([78, 133, 193, 255]), 4, 1, THREE.RedFormat);
  tones.minFilter = tones.magFilter = THREE.NearestFilter;tones.needsUpdate = true;
  const plain = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: tones });
  const facade = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: tones, map: facadeTexture() });
  facade.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #if defined(USE_MAP) && defined(USE_INSTANCING)
        float bayWidth = abs(normal.z) > 0.5 ? length(instanceMatrix[0].xyz) : length(instanceMatrix[2].xyz);
        float storeys = max(1.0, floor(length(instanceMatrix[1].xyz) / ${ARCHITECTURE.floorHeight.toFixed(1)} + 0.1));
        vMapUv *= vec2(max(1.0, floor(bayWidth / 3.8)), storeys);
      #endif
    `);
  };
  facade.customProgramCacheKey = () => 'mikado-physical-window-bays-v1';
  const roofMaterial = new THREE.MeshToonMaterial({ color: '#ffffff', map: roofTexture(), gradientMap: tones });
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#243c51', side: THREE.BackSide });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const geometry = { body: box, trim: box, gable: roofGeometry(), hip: roofGeometry(true), gableEnd: roofGeometry(false, true), attic: box, outline: box };
  const material = { body: [facade, facade, plain, plain, facade, facade], trim: plain, gable: roofMaterial, hip: roofMaterial, gableEnd: plain, attic: plain, outline: outlineMaterial };
  const buckets = new Map(), detailGroups = [], metrics = { houses: 0, apartments: 0, balconies: 0, doors: 0 };
  const detailCellSize = 512;
  function entry(type, item, detail = false) {
    const cellSize = detail ? detailCellSize : 1536;
    const cx = Math.floor(item.x / cellSize), cz = Math.floor(item.z / cellSize);
    const key = `${cx},${cz},${detail ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { x: (cx + .5) * cellSize, z: (cz + .5) * cellSize, detail, types: new Map() });
    const types = buckets.get(key).types;
    if (!types.has(type)) types.set(type, []);
    types.get(type).push(item);
  }
  function part(lot, x, y, z, w, h, d, color, roll = 0) {
    const cos = Math.cos(lot.rotation), sin = Math.sin(lot.rotation);
    entry('trim', { x: lot.x + x * cos + z * sin, y: lot.foundation + y + h / 2, z: lot.z - x * sin + z * cos, w, h, d, rotation: lot.rotation, roll, color }, true);
  }
  function add(lot) {
    const { x, z, w, d, h, foundation, rotation, color, roofColor, roofHeight, roofKind, floors, midrise } = lot;
    entry('body', { x, z, y: foundation + h / 2, w, h, d, rotation, color });
    entry('outline', { x, z, y: foundation + h / 2, w: w + .065, h: h + .065, d: d + .065, rotation }, true);
    metrics[midrise ? 'apartments' : 'houses']++;
    const rw = w + ARCHITECTURE.eaves * 2, rd = d + ARCHITECTURE.eaves * 2;
    if (roofKind !== 'flat') {
      entry(roofKind, { x, z, y: foundation + h, w: rw, h: roofHeight, d: rd, rotation, color: roofColor });
      const eaveLift = roofHeight * (1 - w / rw);
      entry('attic', { x, z, y: foundation + h + eaveLift / 2, w, h: eaveLift, d, rotation, color });
      if (roofKind === 'gable') entry('gableEnd', { x, z, y: foundation + h + eaveLift, w, h: roofHeight - eaveLift, d: d + .03, rotation, color });
      part(lot, 0, h - .12, 0, rw, .12, rd, '#c5cfc8');
      part(lot, 0, h + roofHeight - .05, 0, .18, .18, roofKind === 'gable' ? rd : rd * .44, roofColor);
      for (const side of [-1, 1]) {
        part(lot, side * rw / 2, h - .1, 0, .13, .18, rd, '#d5d9cf');
        if (roofKind === 'gable') for (const end of [-1, 1]) {
          const halfWidth = rw / 2, beamLength = Math.hypot(halfWidth, roofHeight);
          part(lot, side * rw / 4, h + roofHeight / 2 - .03, end * rd / 2, beamLength, .12, .14, '#d6ddd5', -side * Math.atan2(roofHeight, halfWidth));
        }
      }
    } else {
      part(lot, 0, h, 0, rw, .22, rd, '#d4dbd4');
      for (const side of [-1, 1]) {
        part(lot, side * w / 2, h + .2, 0, .18, .45, d, color);
        part(lot, 0, h + .2, side * d / 2, w, .45, .18, color);
      }
      part(lot, -w * .22, h + .22, -d * .18, 1.9, 1.2, 1.1, '#96a5a9');
    }
    // The entrance is 2.1 m high in world units, independent of building size.
    const bays = Math.max(1, Math.floor(w / 3.8)), bayWidth = w / bays;
    const doorBay = midrise ? Math.floor(bays / 2) : Math.floor(bays / 4);
    const doorX = (doorBay + .5) * bayWidth - w / 2;
    part(lot, doorX, 0, d / 2 + .04, bayWidth * .86, 2.75, .08, color);
    part(lot, doorX, .02, d / 2 + 2.6, 1.65, .04, 5.2, '#aab4b0');
    part(lot, doorX, .1, d / 2 + .1, 1.14, ARCHITECTURE.doorHeight + .13, .1, '#53626a');
    part(lot, doorX, .13, d / 2 + .17, ARCHITECTURE.doorWidth, ARCHITECTURE.doorHeight, .08, '#58646a');
    part(lot, doorX + .22, .95, d / 2 + .23, .045, .42, .035, '#c8cfc5');
    part(lot, doorX, .02, d / 2 + .48, 2.1, .12, 1.0, '#b5b8aa');
    part(lot, doorX, 2.6, d / 2 + .46, 3.0, .14, 1.2, roofColor);
    metrics.doors++;
    // Gutters, downpipes and an outdoor AC unit give human-scale cues along the street.
    part(lot, w / 2 + .11, .2, d / 2 - .45, .09, h - .2, .09, '#7f8f92');
    part(lot, w * .25, .25, d / 2 + .4, .95, .62, .45, '#b6c3c1');
    part(lot, w * .25, .35, d / 2 + .65, .65, .42, .025, '#6b8189');
    part(lot, 0, .08, 0, w + .12, .16, d + .12, '#9daaa5');

    const balconyFloors = midrise ? floors - 1 : 1;
    for (let level = 1; level <= balconyFloors; level++) {
      const floorY = level * ARCHITECTURE.floorHeight;
      const balconyW = midrise ? w - .6 : Math.min(7.4, w * .55);
      const balconyX = midrise ? 0 : w * .13;
      const balconyZ = d / 2 + ARCHITECTURE.balconyDepth / 2;
      part(lot, balconyX, floorY - .12, balconyZ, balconyW, .18, ARCHITECTURE.balconyDepth, '#a9b8b7');
      part(lot, balconyX, floorY + .05, d / 2 + ARCHITECTURE.balconyDepth, balconyW, .72, .12, color);
      part(lot, balconyX, floorY + .8, d / 2 + ARCHITECTURE.balconyDepth, balconyW, .07, .09, '#405566');
      for (const side of [-1, 1]) part(lot, balconyX + side * balconyW / 2, floorY + .05, balconyZ, .09, .8, ARCHITECTURE.balconyDepth, '#60737c');
      metrics.balconies++;
    }
    if (midrise) {
      for (let level = 1; level < floors; level++) part(lot, 0, level * ARCHITECTURE.floorHeight - .1, 0, w + .2, .14, d + .2, '#a3b3b5');
      // Stair/service core breaks up the long rows of apartment balconies.
      part(lot, -w / 2 + 1.0, 0, d / 2 + .5, 2, h, 1.1, '#80959c');
    }
  }
  function finish() {
    const object = new THREE.Object3D();
    for (const bucket of buckets.values()) {
      const group = new THREE.Group();
      group.name = bucket.detail ? 'Nearby architectural details' : 'Anime neighborhood buildings';
      for (const [type, entries] of bucket.types) {
        const mesh = new THREE.InstancedMesh(geometry[type], material[type], entries.length);
        entries.forEach((item, i) => {
          object.position.set(item.x, item.y, item.z);
          object.scale.set(item.w, item.h, item.d);
          object.rotation.set(0, item.rotation ?? 0, item.roll ?? 0, 'YXZ');
          object.updateMatrix();mesh.setMatrixAt(i, object.matrix);
          if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
        });
        mesh.castShadow = type !== 'outline' && !bucket.detail;
        mesh.receiveShadow = type !== 'outline';
        mesh.computeBoundingSphere();group.add(mesh);
      }
      if (bucket.detail) { group.visible = false; detailGroups.push({ group, x: bucket.x, z: bucket.z }); }
      scene.add(group);
    }
    buckets.clear();
  }
  function update(camera) {
    for (const item of detailGroups) item.group.visible = Math.hypot(camera.position.x - item.x, camera.position.z - item.z, camera.position.y) < 920;
  }
  return { add, finish, update, metrics };
}
