import * as THREE from 'three';
import { BASE } from './city-layout.js';

/** BORDER's open-roof perimeter fortress, based on the aerial reference. */
export function createHeadquarters({ scene, box, cylinder }) {
  const center = { x: 23, z: -117 };
  const width = BASE.width;
  const depth = BASE.depth;
  const height = BASE.height;
  const front = center.z + depth / 2;
  const right = center.x + width / 2;
  const left = center.x - width / 2;

  // Draw panel joints into one shared texture instead of adding hundreds of meshes.
  const panels = document.createElement('canvas');
  panels.width = 1024;
  panels.height = 1024;
  const paint = panels.getContext('2d');
  paint.fillStyle = '#a3aec4';
  paint.fillRect(0, 0, 1024, 1024);
  paint.strokeStyle = '#8795ac';
  paint.lineWidth = 1.5;
  for (let i = 0; i <= 10; i++) {
    const x = Math.min(1023, i * 102.4);
    paint.beginPath();
    paint.moveTo(x, 0);
    paint.lineTo(x, 1024);
    paint.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const y = Math.min(1023, i * 256);
    paint.beginPath();
    paint.moveTo(0, y);
    paint.lineTo(1024, y);
    paint.stroke();
  }
  const panelTexture = new THREE.CanvasTexture(panels);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.anisotropy = 4;
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: panelTexture,
    roughness: 0.93,
    color: '#ffffff',
  });

  // Four independent walls leave the courtyard open to the sky; no full roof or solid collision box.
  const thickness = BASE.wallThickness;
  const innerWidth = width - thickness * 2;
  const innerDepth = depth - thickness * 2;
  const interiorCanvas = document.createElement('canvas');
  interiorCanvas.width = 1536;
  interiorCanvas.height = 1024;
  const innerPaint = interiorCanvas.getContext('2d');
  innerPaint.fillStyle = '#8791ad';
  innerPaint.fillRect(0, 0, 1536, 1024);
  for (let row = 0; row < 9; row++) {
    const y = row * 118;
    innerPaint.fillStyle = '#5e6f8f';
    innerPaint.fillRect(0, y + 80, 1536, 9);
    innerPaint.fillStyle = '#b6bfd1';
    innerPaint.fillRect(0, y + 95, 1536, 4);
  }
  for (let col = 0; col <= 14; col++) {
    const x = col * 109.7;
    innerPaint.fillStyle = '#586985';
    innerPaint.fillRect(x - 3, 0, 23, 1024);
    innerPaint.fillStyle = '#b9c3d5';
    innerPaint.fillRect(x, 0, 10, 1024);
    innerPaint.fillStyle = '#7685a0';
    innerPaint.fillRect(x + 10, 0, 6, 1024);
  }
  const interiorTexture = new THREE.CanvasTexture(interiorCanvas);
  interiorTexture.colorSpace = THREE.SRGBColorSpace;
  interiorTexture.anisotropy = 4;
  const interiorMaterial = new THREE.MeshStandardMaterial({ map: interiorTexture, roughness: 0.94 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#69768e', roughness: 1 });
  const outerFaces = [wallMaterial, wallMaterial, roofMaterial, wallMaterial, wallMaterial, wallMaterial];
  const walls = [
    { name: 'front', x: center.x, z: front - thickness / 2, w: width, d: thickness, innerFace: 5 },
    { name: 'back', x: center.x, z: center.z - depth / 2 + thickness / 2, w: width, d: thickness, innerFace: 4 },
    { name: 'left', x: left + thickness / 2, z: center.z, w: thickness, d: innerDepth, innerFace: 0 },
    { name: 'right', x: right - thickness / 2, z: center.z, w: thickness, d: innerDepth, innerFace: 1 },
  ];
  box(center.x, 0, center.z, width + 3, BASE.floorHeight, depth + 3, '#b0b8c7');
  for (const wall of walls) {
    const mesh = box(wall.x, BASE.floorHeight, wall.z, wall.w, height, wall.d, '#a3aec4', true);
    mesh.name = `BORDER ${wall.name} perimeter wall`;
    const faces = [...outerFaces];
    faces[wall.innerFace] = interiorMaterial;
    mesh.material = faces;
  }
  // Narrow walkways and pale parapets outline both edges of the open roof.
  const roofY = height + BASE.floorHeight;
  for (const z of [front, center.z - depth / 2, front - thickness, center.z - depth / 2 + thickness]) {
    box(center.x, roofY, z, width, 0.38, 0.24, '#c4cbdd');
  }
  for (const x of [left, right, left + thickness, right - thickness]) {
    box(x, roofY, center.z, 0.24, 0.38, depth, '#c4cbdd');
  }
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = floorCanvas.height = 512;
  const floorPaint = floorCanvas.getContext('2d');
  floorPaint.fillStyle = '#b7c0d0';
  floorPaint.fillRect(0, 0, 512, 512);
  floorPaint.strokeStyle = '#8e9db2';
  floorPaint.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    floorPaint.beginPath();floorPaint.moveTo(i * 32, 0);floorPaint.lineTo(i * 32, 512);floorPaint.stroke();
    floorPaint.beginPath();floorPaint.moveTo(0, i * 32);floorPaint.lineTo(512, i * 32);floorPaint.stroke();
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  const floor = box(center.x, BASE.floorHeight, center.z, innerWidth, 0.015, innerDepth, '#b7c0d0');
  floor.material = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1 });
  floor.name = 'BORDER open courtyard floor';

  function antenna(x, y, z, h) {
    cylinder(x, y, z, 0.065, h, '#b5c5d6', 6);
    for (let offset = 1; offset < h; offset += 1.4) {
      box(x, y + offset, z, 0.6, 0.05, 0.08, '#b5c5d6');
    }
  }

  function tower(x, z, w = 10, h = 14) {
    const bottom = 46;
    box(x, bottom, z, w, h, 9, '#939fb9');
    // Recessed tower rooftop with a raised rim, visible from the new aerial angle.
    box(x, bottom + h, z, w, 0.05, 9, '#58667f');
    for (const dz of [-4.5, 4.5]) box(x, bottom + h, z + dz, w + 0.25, 0.6, 0.25, '#c0c7da');
    for (const dx of [-w / 2, w / 2]) box(x + dx, bottom + h, z, 0.25, 0.6, 9, '#c0c7da');

    // Curved, hanging buttress: a distinctive feature beneath the watchtowers.
    const shape = new THREE.Shape();
    shape.moveTo(-w * 0.45, 0);
    shape.lineTo(w * 0.45, 0);
    shape.quadraticCurveTo(w * 0.14, -3, w * 0.14, -11);
    shape.quadraticCurveTo(0, -16, -w * 0.14, -11);
    shape.quadraticCurveTo(-w * 0.14, -3, -w * 0.45, 0);
    const bracket = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 12 }),
      new THREE.MeshStandardMaterial({ color: '#8b98b2', roughness: 0.95 }),
    );
    bracket.position.set(x, bottom, z - 2);
    bracket.castShadow = true;
    bracket.receiveShadow = true;
    scene.add(bracket);

    for (let i = 0; i < 5; i++) {
      box(x - w * 0.32 + i * w * 0.16, bottom + h * 0.48, z + 4.53, 0.43, 1.05, 0.06, '#455573');
      box(x + w / 2 + 0.03, bottom + h * 0.48, z - 2.9 + i * 1.45, 0.06, 1.05, 0.43, '#455573');
    }
    antenna(x - w * 0.32, bottom + h + 0.35, z + 2, 4.8);
    antenna(x + w * 0.25, bottom + h + 0.35, z - 2, 6.8);
    antenna(x, bottom + h + 0.35, z, 3.5);
  }

  tower(left, front);
  tower(right, front, 11, 16);
  tower(left, center.z - depth / 2);
  tower(right, center.z - depth / 2, 10, 12);

  // Wider control block suspended high on the otherwise windowless front wall.
  box(0, 40, front + 1.4, 14, 19, 7, '#9aa7c0');
  box(0, 59, front + 1.4, 14.3, 0.35, 7.3, '#b6c0d0');
  box(0, 38.8, front + 0.4, 12, 1.2, 4, '#8291a8');
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      box(-5.4 + col * 1.8, 41.5 + row * 2.55, front + 4.94, 0.48, 0.85, 0.06, '#465875');
    }
  }
  antenna(-4, 59.35, front + 1.4, 5.5);
  antenna(4, 59.35, front + 1.4, 3.6);

  // Flat emblem painted onto the concrete, with no rectangular sign backing.
  const emblem = document.createElement('canvas');
  emblem.width = 768;
  emblem.height = 896;
  const ink = emblem.getContext('2d');
  ink.strokeStyle = '#3e506b';
  ink.fillStyle = '#3e506b';
  ink.lineWidth = 5;
  for (const radius of [250, 276, 302]) {
    ink.beginPath();
    ink.ellipse(384, 440, radius, radius * 1.25, 0, 0, Math.PI * 2);
    ink.stroke();
  }
  ink.beginPath();
  ink.moveTo(384, 155);
  ink.lineTo(635, 420);
  ink.lineTo(384, 730);
  ink.lineTo(133, 420);
  ink.closePath();
  ink.fill();
  ink.fillStyle = '#a5b1c6';
  ink.textAlign = 'center';
  ink.font = 'bold 31px Georgia, serif';
  ink.fillText('DEFENSE', 384, 294);
  ink.fillText('ORGANIZATION', 384, 339);
  ink.fillRect(92, 373, 584, 133);
  ink.fillStyle = '#3e506b';
  ink.font = 'bold 103px Georgia, serif';
  ink.fillText('BORDER', 384, 476);
  ink.fillStyle = '#a5b1c6';
  ink.font = 'bold 31px Georgia, serif';
  ink.fillText('MIKADO', 384, 565);
  ink.fillText('CITY', 384, 607);
  const emblemTexture = new THREE.CanvasTexture(emblem);
  emblemTexture.colorSpace = THREE.SRGBColorSpace;
  emblemTexture.anisotropy = 4;
  const emblemMaterial = new THREE.MeshStandardMaterial({
    map: emblemTexture, transparent: true, roughness: 1,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const frontEmblem = new THREE.Mesh(new THREE.PlaneGeometry(23, 28), emblemMaterial);
  frontEmblem.position.set(36, 25, front + 0.025);
  scene.add(frontEmblem);
  const sideEmblem = new THREE.Mesh(new THREE.PlaneGeometry(23, 28), emblemMaterial);
  sideEmblem.rotation.y = Math.PI / 2;
  sideEmblem.position.set(right + 0.025, 25, -112);
  scene.add(sideEmblem);

  // Human-scale annex at the foot of the keep, as in the reference image.
  box(42, 0, front + 3.5, 26, 10.2, 5.8, '#c7cdd0', true);
  for (let floor = 0; floor < 3; floor++) {
    box(42, 0.5 + floor * 3.2, front + 6.5, 26, 0.2, 0.2, '#929fab');
    for (let column = 0; column < 8; column++) {
      box(31 + column * 3.15, 1.1 + floor * 3.2, front + 6.44, 1.7, 1.65, 0.08, '#53778b');
    }
  }
  box(42, 10.2, front + 3.5, 26.5, 0.5, 6.3, '#8998aa');
  box(42, 0.1, front + 6.53, 3, 2.7, 0.12, '#425a71');
  box(42, 2.85, front + 7, 5, 0.25, 1.2, '#8998aa');
  cylinder(48, 10.7, front + 3, 0.7, 1.7, '#8c9aa9');
  antenna(33, 10.7, front + 2.5, 3);

  return {
    name: 'BORDER open-courtyard fortress',
    openRoof: true,
    courtyard: { width: innerWidth, depth: innerDepth },
    wallCount: walls.length,
    width, depth, height,
    towers: 4,
    emblems: 2,
    previewPosition: new THREE.Vector3(100, 43, -7),
    previewLook: new THREE.Vector3(23, 27, -116),
  };
}
