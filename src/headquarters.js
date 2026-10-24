import * as THREE from 'three';
import { fortressGeometry } from './hq-geometry.js';
import * as Layout from './hq-layout.js';
import { BASE } from './city-layout.js';

/** The city landmark retains its open courtyard; explorable facilities belong to the independent world. */
export function createHeadquarters({ scene, box, cylinder, solid, solidBody = false, landmarkOnly = false }) {
  const { taperedVolume } = Layout;
  const center = { x: 23, z: -117 };
  const scale = BASE.scale,
    width = BASE.width,
    depth = BASE.depth,
    height = BASE.height;
  const roofY = height + BASE.floorHeight;
  const front = center.z + depth / 2,
    back = center.z - depth / 2;
  const left = center.x - width / 2,
    right = center.x + width / 2;
  const thickness = BASE.wallThickness,
    innerWidth = width - thickness * 2,
    innerDepth = depth - thickness * 2;
  const insetX = width * 0.04,
    insetZ = depth * 0.04;
  const outerSkin = 0.9 / scale,
    innerSkin = 0.6 / scale;
  const basementY = -(BASE.basementDepth ?? 12) / scale;
  const worldX = (x) => center.x + x / scale;
  const worldZ = (z) => center.z + (z + 150) / scale;

  const panels = document.createElement('canvas');
  panels.width = panels.height = 1024;
  const paint = panels.getContext('2d');
  paint.fillStyle = '#a3aec4';
  paint.fillRect(0, 0, 1024, 1024);
  paint.strokeStyle = '#8795ac';
  paint.lineWidth = 1.5;
  for (let i = 0; i <= 12; i++) {
    paint.beginPath();
    paint.moveTo((i * 1024) / 12, 0);
    paint.lineTo((i * 1024) / 12, 1024);
    paint.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    paint.beginPath();
    paint.moveTo(0, i * 128);
    paint.lineTo(1024, i * 128);
    paint.stroke();
  }
  const panelTexture = new THREE.CanvasTexture(panels);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.anisotropy = 4;
  const wallMaterial = new THREE.MeshStandardMaterial({ map: panelTexture, roughness: 0.91 });
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
  }
  const interiorTexture = new THREE.CanvasTexture(interiorCanvas);
  interiorTexture.colorSpace = THREE.SRGBColorSpace;
  interiorTexture.anisotropy = 4;
  const interiorMaterial = new THREE.MeshStandardMaterial({ map: interiorTexture, roughness: 0.94 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#69768e', roughness: 1 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#202b39', roughness: 0.73 });

  function slopeBox(
    x,
    y,
    z,
    w,
    h,
    d,
    tx = x,
    tz = z,
    tw = w,
    td = d,
    material = wallMaterial,
    innerFace = 2,
  ) {
    if (w <= 0 || h <= 0 || d <= 0 || tw <= 0 || td <= 0) return;
    const v = taperedVolume({ x, z, w, d, y, h, topX: tx, topZ: tz, topW: tw, topD: td });
    const mesh = new THREE.Mesh(fortressGeometry(v, innerFace), [
      material,
      material === darkMaterial ? material : interiorMaterial,
      material === darkMaterial ? material : roofMaterial,
    ]);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    solid?.(v);
    return mesh;
  }
  const xInsetAt = (y) => (insetX * Math.max(0, y)) / height;
  const zInsetAt = (y) => (insetZ * Math.max(0, y)) / height;

  if (landmarkOnly) {
    // Fill only the four occupied wings. The original open courtyard stays empty.
    const blocks = [
      [
        center.x,
        front - thickness / 2,
        width,
        thickness,
        center.x,
        front - insetZ - thickness / 2,
        width - insetX * 2,
        thickness,
      ],
      [
        center.x,
        back + thickness / 2,
        width,
        thickness,
        center.x,
        back + insetZ + thickness / 2,
        width - insetX * 2,
        thickness,
      ],
      [
        left + thickness / 2,
        center.z,
        thickness,
        innerDepth,
        left + insetX + thickness / 2,
        center.z,
        thickness,
        innerDepth - insetZ * 2,
      ],
      [
        right - thickness / 2,
        center.z,
        thickness,
        innerDepth,
        right - insetX - thickness / 2,
        center.z,
        thickness,
        innerDepth - insetZ * 2,
      ],
    ];
    for (const [x, z, w, d, topX, topZ, topW, topD] of blocks)
      solid?.(taperedVolume({ x, z, w, d, y: 0, h: roofY, topX, topZ, topW, topD }));
  }
  if (solidBody) {
    // One convex volume seals every city-side floor and the former courtyard.
    // Detailed rooms and their collision live exclusively in the separate HQ world.
    solid?.(
      taperedVolume({
        x: center.x,
        z: center.z,
        w: width,
        d: depth,
        y: basementY,
        h: roofY - basementY,
        topX: center.x,
        topZ: center.z,
        topW: width - insetX * 2,
        topD: depth - insetZ * 2,
      }),
    );
  }

  // In the interior world the front skins retain real door openings.
  // x0/x1 denote ground-level x coordinates; outer endpoints follow the tapered facade.
  function frontStrip(x0, x1, y0, y1, inner = false) {
    const atX = (x, y) =>
      x === left || x === left + thickness
        ? x + xInsetAt(y)
        : x === right || x === right - thickness
          ? x - xInsetAt(y)
          : x;
    const xa = atX(x0, y0),
      xb = atX(x1, y0),
      ta = atX(x0, y1),
      tb = atX(x1, y1);
    const skin = inner ? innerSkin : outerSkin;
    const z = inner ? front - thickness - innerSkin / 2 : front - outerSkin / 2;
    slopeBox(
      (xa + xb) / 2,
      y0,
      z - zInsetAt(y0),
      xb - xa,
      y1 - y0,
      skin,
      (ta + tb) / 2,
      z - zInsetAt(y1),
      tb - ta,
      skin,
      inner ? interiorMaterial : wallMaterial,
      inner ? 4 : 2,
    );
  }
  const gateL = worldX(-7),
    gateR = worldX(7),
    sideL = worldX(-13.3),
    sideR = worldX(-10.7);
  if (landmarkOnly) frontStrip(left + thickness, right - thickness, basementY, roofY, true);
  if (solidBody || landmarkOnly) frontStrip(left, right, basementY, roofY);
  else {
    frontStrip(left, right, basementY, 0);
    for (const [a, b] of [
      [left, sideL],
      [sideR, gateL],
      [gateR, right],
    ])
      frontStrip(a, b, 0, 3 / scale);
    frontStrip(left, gateL, 3 / scale, 18 / scale);
    frontStrip(gateR, right, 3 / scale, 18 / scale);
    frontStrip(left, right, 18 / scale, roofY);
    // The entry axis opens directly to the central courtyard as well as the front corridor.
    frontStrip(left + thickness, right - thickness, basementY, 0, true);
    frontStrip(left + thickness, gateL, 0, 18 / scale, true);
    frontStrip(gateR, right - thickness, 0, 18 / scale, true);
    frontStrip(left + thickness, right - thickness, 18 / scale, roofY, true);
  }

  function backInnerStrip(x0, x1, y0, y1) {
    const atX = (x, y) =>
      x === left + thickness ? x + xInsetAt(y) : x === right - thickness ? x - xInsetAt(y) : x;
    const a = atX(x0, y0),
      b = atX(x1, y0),
      ta = atX(x0, y1),
      tb = atX(x1, y1);
    const z = back + thickness + innerSkin / 2;
    slopeBox(
      (a + b) / 2,
      y0,
      z + zInsetAt(y0),
      b - a,
      y1 - y0,
      innerSkin,
      (ta + tb) / 2,
      z + zInsetAt(y1),
      tb - ta,
      innerSkin,
      interiorMaterial,
      2,
    );
  }
  function sideInnerStrip(sign, z0, z1, y0, y1) {
    const inward = sign < 0 ? 1 : -1,
      x = sign < 0 ? left : right;
    const atZ = (z, y) =>
      z === back + thickness ? z + zInsetAt(y) : z === front - thickness ? z - zInsetAt(y) : z;
    const a = atZ(z0, y0),
      b = atZ(z1, y0),
      ta = atZ(z0, y1),
      tb = atZ(z1, y1);
    slopeBox(
      x + inward * (thickness + innerSkin / 2 + xInsetAt(y0)),
      y0,
      (a + b) / 2,
      innerSkin,
      y1 - y0,
      b - a,
      x + inward * (thickness + innerSkin / 2 + xInsetAt(y1)),
      (ta + tb) / 2,
      innerSkin,
      tb - ta,
      interiorMaterial,
      sign < 0 ? 5 : 3,
    );
  }
  // Thin outer and courtyard skins leave every full-depth perimeter wing hollow and occupiable.
  for (const [y0, y1] of [
    [basementY, 0],
    [0, roofY],
  ]) {
    const h = y1 - y0,
      ix0 = xInsetAt(y0),
      ix1 = xInsetAt(y1),
      iz0 = zInsetAt(y0),
      iz1 = zInsetAt(y1);
    slopeBox(
      center.x,
      y0,
      back + outerSkin / 2 + iz0,
      width - ix0 * 2,
      h,
      outerSkin,
      center.x,
      back + outerSkin / 2 + iz1,
      width - ix1 * 2,
      outerSkin,
      wallMaterial,
      4,
    );
    if (!solidBody) {
      if (y0 < 0) backInnerStrip(left + thickness, right - thickness, y0, y1);
      else {
        backInnerStrip(left + thickness, worldX(-2.4), 0, 4 / scale);
        backInnerStrip(worldX(2.4), right - thickness, 0, 4 / scale);
        backInnerStrip(left + thickness, right - thickness, 4 / scale, y1);
      }
    }
    for (const sign of [-1, 1]) {
      const x = sign < 0 ? left : right,
        inward = sign < 0 ? 1 : -1;
      slopeBox(
        x + inward * (outerSkin / 2 + ix0),
        y0,
        center.z,
        outerSkin,
        h,
        depth - iz0 * 2,
        x + inward * (outerSkin / 2 + ix1),
        center.z,
        outerSkin,
        depth - iz1 * 2,
        wallMaterial,
        sign < 0 ? 3 : 5,
      );
      if (!solidBody) {
        if (y0 < 0) sideInnerStrip(sign, back + thickness, front - thickness, y0, y1);
        else {
          sideInnerStrip(sign, back + thickness, center.z - 2.4 / scale, 0, 4 / scale);
          sideInnerStrip(sign, center.z + 2.4 / scale, front - thickness, 0, 4 / scale);
          sideInnerStrip(sign, back + thickness, front - thickness, 4 / scale, y1);
        }
      }
    }
  }

  for (const dx of [-2.62, 2.62])
    box(worldX(dx), 0, back + thickness + 0.035, 0.24 / scale, 4.35 / scale, 0.3 / scale, '#455b73', true);
  box(center.x, 4 / scale, back + thickness + 0.035, 5.5 / scale, 0.35 / scale, 0.3 / scale, '#455b73', true);
  for (const sign of [-1, 1]) {
    const x = (sign < 0 ? left + thickness : right - thickness) - sign * 0.035;
    for (const dz of [-2.62, 2.62])
      box(x, 0, center.z + dz / scale, 0.3 / scale, 4.35 / scale, 0.24 / scale, '#455b73', true);
    box(x, 4 / scale, center.z, 0.3 / scale, 0.35 / scale, 5.5 / scale, '#455b73', true);
  }
  // No raised stone plinth. The courtyard surface sits flush with the city datum.
  if (!solidBody) {
    const courtyard = box(
      center.x,
      -0.2 / scale,
      center.z,
      innerWidth,
      0.2 / scale,
      innerDepth,
      '#b1bdcb',
      true,
    );
    courtyard.name = 'BORDER ground-level courtyard';
  }
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(70 / scale, 65 / scale),
    new THREE.MeshStandardMaterial({
      color: '#a7b5c4',
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(center.x, 0.006 / scale, worldZ(282.5));
  apron.receiveShadow = true;
  scene.add(apron);

  // A monumental, recessed angular gate frame based on the front-door reference.
  // Its moving double leaves belong to the shared interior door system at z247.5.
  function gateFramePiece(a0, a1, b0, b1, y0, y1) {
    const w0 = a1 - a0,
      w1 = b1 - b0;
    slopeBox(
      worldX((a0 + a1) / 2),
      y0 / scale,
      worldZ(250.65) - zInsetAt(y0 / scale),
      w0 / scale,
      (y1 - y0) / scale,
      1.2 / scale,
      worldX((b0 + b1) / 2),
      worldZ(250.65) - zInsetAt(y1 / scale),
      w1 / scale,
      1.2 / scale,
      darkMaterial,
    );
  }
  for (const sign of [-1, 1]) {
    const span = (a, b) => (sign < 0 ? [-b, -a] : [a, b]);
    let [a, b] = span(7, 9.5);
    gateFramePiece(a, b, a, b, 0, 8);
    const [c, d] = span(7, 13);
    gateFramePiece(a, b, c, d, 8, 18);
    const [e, f] = span(4.5, 13);
    gateFramePiece(c, d, e, f, 18, 24);
  }
  slopeBox(
    center.x,
    18 / scale,
    worldZ(250.4) - zInsetAt(18 / scale),
    14 / scale,
    6 / scale,
    1.3 / scale,
    center.x,
    worldZ(250.4) - zInsetAt(24 / scale),
    9 / scale,
    1.3 / scale,
    darkMaterial,
  );
  // Side access intercom and understated edge lights; no oversized neon billboard.
  box(worldX(-10), 0.95 / scale, worldZ(250.22), 0.26 / scale, 0.48 / scale, 0.12 / scale, '#263c4b', true);
  box(worldX(-10), 1.08 / scale, worldZ(250.3), 0.16 / scale, 0.12 / scale, 0.02 / scale, '#78c8d1');
  for (const x of [-9.3, 9.3])
    box(worldX(x), 0.12 / scale, worldZ(250.3), 0.06 / scale, 6.7 / scale, 0.025 / scale, '#728c9e');
  const gateLabel = document.createElement('canvas');
  gateLabel.width = 1024;
  gateLabel.height = 128;
  const gl = gateLabel.getContext('2d');
  gl.fillStyle = '#202b39';
  gl.fillRect(0, 0, 1024, 128);
  gl.fillStyle = '#c8d8e7';
  gl.textAlign = 'center';
  gl.font = '600 44px sans-serif';
  gl.fillText('BORDER  /  HEADQUARTERS', 512, 82);
  const gateTexture = new THREE.CanvasTexture(gateLabel);
  gateTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(13 / scale, 1.6 / scale),
    new THREE.MeshBasicMaterial({ map: gateTexture }),
  );
  label.position.set(center.x, 22 / scale, worldZ(251.12) - zInsetAt(22 / scale));
  scene.add(label);

  // Continuous roof ring, with physical openings for the shared stairs and elevator.
  const halfW = width / 2 - insetX,
    halfD = depth / 2 - insetZ;
  const roofRects = solidBody
    ? [{ x0: center.x - halfW, x1: center.x + halfW, z0: center.z - halfD, z1: center.z + halfD }]
    : [
        {
          x0: center.x - halfW,
          x1: center.x + halfW,
          z0: center.z + halfD - thickness,
          z1: center.z + halfD,
        },
        {
          x0: center.x - halfW,
          x1: center.x + halfW,
          z0: center.z - halfD,
          z1: center.z - halfD + thickness,
        },
        {
          x0: center.x - halfW,
          x1: center.x - halfW + thickness,
          z0: center.z - halfD + thickness,
          z1: center.z + halfD - thickness,
        },
        {
          x0: center.x + halfW - thickness,
          x1: center.x + halfW,
          z0: center.z - halfD + thickness,
          z1: center.z + halfD - thickness,
        },
      ];
  const coreDefinitions = Layout.HQ_CORES ?? [{ x: 43, z: 198 }];
  const holes =
    solidBody || landmarkOnly
      ? []
      : coreDefinitions.flatMap((core) => [
          { x0: worldX(core.x - 2), x1: worldX(core.x + 2), z0: worldZ(core.z - 2), z1: worldZ(core.z + 2) },
          { x0: worldX(core.x + 5), x1: worldX(core.x + 19), z0: worldZ(core.z - 6), z1: worldZ(core.z + 8) },
        ]);
  let pieces = roofRects;
  for (const hole of holes)
    pieces = pieces.flatMap((r) => {
      const a = Math.max(r.x0, hole.x0),
        b = Math.min(r.x1, hole.x1),
        c = Math.max(r.z0, hole.z0),
        d = Math.min(r.z1, hole.z1);
      if (a >= b || c >= d) return [r];
      return [
        { x0: r.x0, x1: a, z0: r.z0, z1: r.z1 },
        { x0: b, x1: r.x1, z0: r.z0, z1: r.z1 },
        { x0: a, x1: b, z0: r.z0, z1: c },
        { x0: a, x1: b, z0: d, z1: r.z1 },
      ].filter((v) => v.x1 - v.x0 > 1e-6 && v.z1 - v.z0 > 1e-6);
    });
  for (const r of pieces)
    box(
      (r.x0 + r.x1) / 2,
      roofY - 0.18 / scale,
      (r.z0 + r.z1) / 2,
      r.x1 - r.x0,
      0.18 / scale,
      r.z1 - r.z0,
      '#74869d',
      true,
    );
  for (const sign of [-1, 1]) {
    box(
      center.x,
      roofY,
      center.z + sign * halfD,
      width - insetX * 2,
      1.2 / scale,
      0.25 / scale,
      '#c0cbdc',
      true,
    );
    box(
      center.x,
      roofY,
      center.z + sign * (halfD - thickness),
      innerWidth - insetX * 2,
      1.2 / scale,
      0.25 / scale,
      '#c0cbdc',
      true,
    );
    box(
      center.x + sign * halfW,
      roofY,
      center.z,
      0.25 / scale,
      1.2 / scale,
      depth - insetZ * 2,
      '#c0cbdc',
      true,
    );
    box(
      center.x + sign * (halfW - thickness),
      roofY,
      center.z,
      0.25 / scale,
      1.2 / scale,
      innerDepth - insetZ * 2,
      '#c0cbdc',
      true,
    );
  }

  function antenna(x, y, z, hMeters = 14) {
    const h = hMeters / scale;
    cylinder(x, y, z, 0.16 / scale, h, '#b5c5d6', 6);
    for (let d = 2; d < hMeters; d += 3)
      box(x, y + d / scale, z, 1.3 / scale, 0.08 / scale, 0.15 / scale, '#b5c5d6');
  }
  function tower(x, z, w = 3.5, h = 5.6) {
    const base = height * 0.85,
      d = 3,
      t = 0.055;
    // Thin shell, not a solid volume through upper-floor rooms.
    for (const dx of [-w / 2, w / 2]) box(x + dx, base, z, t, h, d, '#939fb9', true);
    for (const dz of [-d / 2, d / 2]) box(x, base, z + dz, w, h, t, '#939fb9', true);
    box(x, base - 0.025, z, w, 0.025, d, '#7e8da5', true);
    box(x, base + h, z, w, 0.035, d, '#58667f', true);
    for (const dz of [-d / 2, d / 2]) box(x, base + h, z + dz, w + 0.1, 0.35, 0.09, '#c0c7da', true);
    for (const dx of [-w / 2, w / 2]) box(x + dx, base + h, z, 0.09, 0.35, d, '#c0c7da', true);
    // Faceted curved support lives outside the main facade and has matching convex solids.
    const outward = z > center.z ? 1 : -1;
    const supportZ = z + outward * 0.95;
    const supportDepth = 1.05,
      supportHeight = 3.6;
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12,
        t1 = (i + 1) / 12;
      const a = 0.24 + (w * 0.82 - 0.24) * (1 - t0) ** 2,
        b = 0.24 + (w * 0.82 - 0.24) * (1 - t1) ** 2;
      slopeBox(
        x,
        base - supportHeight * t1,
        supportZ,
        b,
        supportHeight / 12,
        supportDepth,
        x,
        supportZ,
        a,
        supportDepth,
        new THREE.MeshStandardMaterial({ color: '#8796b0', roughness: 0.95 }),
      );
    }
    // Small inset tower windows remain on the outside of the hollow walls.
    for (let i = 0; i < 5; i++) {
      box(
        x - w * 0.32 + i * w * 0.16,
        base + h * 0.52,
        z + outward * (d / 2 + 0.015),
        0.15,
        0.38,
        0.02,
        '#455573',
      );
      box(
        x + (x > center.x ? 1 : -1) * (w / 2 + 0.015),
        base + h * 0.52,
        z - d * 0.3 + i * d * 0.15,
        0.02,
        0.38,
        0.14,
        '#455573',
      );
    }
    antenna(x - w * 0.28, base + h + 0.36, z + 0.7, 12);
    antenna(x + w * 0.25, base + h + 0.36, z - 0.7, 16);
    antenna(x, base + h + 0.36, z, 9);
  }
  tower(left + insetX, front - insetZ);
  tower(right - insetX, front - insetZ, 3.85, 6.1);
  tower(left + insetX, back + insetZ);
  tower(right - insetX, back + insetZ, 3.5, 5.2);

  // Familiar suspended control block. This sits outside the main occupied envelope.
  const controlBase = height * 0.72,
    controlTop = height * 1.06;
  const controlX = worldX(-368),
    controlZ = front + 0.12;
  box(controlX, controlBase, controlZ, 14, controlTop - controlBase, 3.1, '#9aa7c0', true);
  box(controlX, controlTop, controlZ, 14.2, 0.17, 3.25, '#b6c0d0', true);
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 7; col++)
      box(
        controlX - 5.4 + col * 1.8,
        controlBase + 0.6 + (row * (controlTop - controlBase)) / 6,
        controlZ + 1.56,
        0.42,
        0.32,
        0.03,
        '#465875',
      );
  box(controlX, height * 0.87, front - 1.25, 11, 0.32, 2.1, '#8291a8', true);
  antenna(controlX - 4, controlTop + 0.18, controlZ, 14);
  antenna(controlX + 4, controlTop + 0.18, controlZ, 11);

  const emblem = document.createElement('canvas');
  emblem.width = 768;
  emblem.height = 896;
  const ink = emblem.getContext('2d');
  ink.strokeStyle = ink.fillStyle = '#3e506b';
  ink.lineWidth = 5;
  for (const r of [250, 276, 302]) {
    ink.beginPath();
    ink.ellipse(384, 440, r, r * 1.25, 0, 0, Math.PI * 2);
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
  ink.font = 'bold 31px Georgia,serif';
  ink.fillText('DEFENSE', 384, 294);
  ink.fillText('ORGANIZATION', 384, 339);
  ink.fillRect(92, 373, 584, 133);
  ink.fillStyle = '#3e506b';
  ink.font = 'bold 103px Georgia,serif';
  ink.fillText('BORDER', 384, 476);
  ink.fillStyle = '#a5b1c6';
  ink.font = 'bold 31px Georgia,serif';
  ink.fillText('MIKADO', 384, 565);
  ink.fillText('CITY', 384, 607);
  const emblemTexture = new THREE.CanvasTexture(emblem);
  emblemTexture.colorSpace = THREE.SRGBColorSpace;
  emblemTexture.anisotropy = 4;
  const emblemMaterial = new THREE.MeshStandardMaterial({
    map: emblemTexture,
    transparent: true,
    roughness: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const emblemY = height * 0.53;
  const frontEmblem = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), emblemMaterial);
  frontEmblem.position.set(worldX(208), emblemY, front + 0.025 - zInsetAt(emblemY));
  frontEmblem.rotation.x = -Math.atan(insetZ / height);
  scene.add(frontEmblem);
  const sideEmblem = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), emblemMaterial);
  sideEmblem.position.set(right + 0.025 - xInsetAt(emblemY), emblemY, center.z + 0.3);
  sideEmblem.rotation.y = Math.PI / 2;
  sideEmblem.rotation.z = Math.atan(insetX / height);
  scene.add(sideEmblem);

  return {
    name: landmarkOnly
      ? 'BORDER open-courtyard city landmark'
      : solidBody
        ? 'BORDER solid city landmark'
        : 'BORDER full-perimeter hollow fortress',
    landmarkOnly,
    solidBody,
    openRoof: !solidBody,
    courtyard: { width: innerWidth, depth: innerDepth },
    wallCount: 4,
    width,
    depth,
    height,
    towers: 4,
    emblems: 2,
    stoneFoundation: false,
    occupiedWingDepth: solidBody || landmarkOnly ? 0 : thickness * scale,
    basementDepth: -basementY * scale,
    gate: {
      x: 0,
      z: 247.5,
      width: 14,
      height: 18,
      groundY: 0,
      sideDoor: { x: -12, z: 249.4, width: 2.6, height: 3 },
    },
    shellThickness: { outer: 0.9, inner: 0.6 },
    previewPosition: new THREE.Vector3(100, 43, -7),
    previewLook: new THREE.Vector3(23, 12, -116),
  };
}
