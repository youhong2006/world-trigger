import * as THREE from 'three';

// These spaces interpret the user's anime references. Their dimensions and floor positions are game design.
const PALETTE = Object.freeze({
  hull: '#172632',
  floor: '#213744',
  steel: '#334d5b',
  panel: '#436874',
  pale: '#819ca5',
  cyan: '#37dce7',
  screen: '#b1f3ee',
  line: '#335864',
});

export function buildHQSpecialFacility(api, spec) {
  const g = api.group ?? api.g;
  const y = spec.y ?? 0;
  const w = spec.w ?? 100,
    d = spec.d ?? 90,
    h = spec.h ?? (spec.top - y || 6);
  const hw = w / 2,
    hd = d / 2,
    p = PALETTE;
  let boxes = 0,
    seats = 0,
    terminals = 0;
  const overlays = new Map();
  const own = (resource) => {
    if (api.own) api.own(resource);
    else g.userData?.hqScope?.owned?.push(resource);
    return resource;
  };
  const B = (x, dy, z, bw, bh, bd, color = p.steel, solid = true) => {
    boxes++;
    return api.box(g, x, y + dy, z, bw, bh, bd, color, solid);
  };
  const S = (text, x, dy, z, sw = 8, sh = 0.55, color = '#baf6fa', turn = 0) =>
    api.sign?.(g, text, x, y + dy, z, sw, sh, color, turn);
  const T = (name, x, z, kind = 'info', text = '', dy = 0) => {
    terminals++;
    return api.terminal?.(g, name, x, y + dy, z, kind, text);
  };
  const C = (x, z, label, yaw = 0, dy = 0) => {
    seats++;
    return api.chair?.(g, x, y + dy, z, label, yaw);
  };
  const R = (x, dy, z, rw, rd) => api.rail?.(g, x, y + dy, z, rw, rd);
  const world = (x, z) => {
    const f = api.frame ?? { x: spec.world?.x ?? 0, z: spec.world?.z ?? 0, rotation: 0 };
    const c = Math.cos(f.rotation ?? 0),
      s = Math.sin(f.rotation ?? 0);
    return { x: f.x + x * c + z * s, z: f.z - x * s + z * c };
  };
  function paintedQuad(points, color) {
    if (!overlays.has(color)) overlays.set(color, []);
    const list = overlays.get(color);
    for (const i of [0, 2, 1, 0, 3, 2]) {
      const q = world(points[i][0], points[i][2]);
      list.push(q.x, y + points[i][1], q.z);
    }
  }
  function floorQuad(points, dy, color) {
    paintedQuad(
      points.map(([x, z]) => [x, dy, z]),
      color,
    );
  }
  function trace(x0, z0, x1, z1, width = 0.18, color = '#d4cf86') {
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (!length) return;
    const ox = (-(z1 - z0) * width) / (length * 2),
      oz = ((x1 - x0) * width) / (length * 2);
    floorQuad(
      [
        [x0 + ox, z0 + oz],
        [x1 + ox, z1 + oz],
        [x1 - ox, z1 - oz],
        [x0 - ox, z0 - oz],
      ],
      0.052,
      color,
    );
  }
  // Clip painted diagonal strips to each vertical panel; no separate raised geometry or collider.
  function hazardPanel(axis, fixed, min, max, height) {
    const clip = (points, edge, greater) => {
      const out = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        const ai = greater ? a[0] >= edge : a[0] <= edge,
          bi = greater ? b[0] >= edge : b[0] <= edge;
        if (ai) out.push(a);
        if (ai !== bi) {
          const t = (edge - a[0]) / (b[0] - a[0]);
          out.push([edge, a[1] + (b[1] - a[1]) * t]);
        }
      }
      return out;
    };
    for (let offset = min - height * 1.3 - 5; offset < max; offset += 4.4) {
      const points = clip(
        clip(
          [
            [offset, 0.06],
            [offset + 2.1, 0.06],
            [offset + 2.1 + height * 1.3, height - 0.06],
            [offset + height * 1.3, height - 0.06],
          ],
          min,
          true,
        ),
        max,
        false,
      );
      for (let i = 1; i < points.length - 1; i++) {
        const triangle = [points[0], points[i], points[i + 1], points[i + 1]].map(([q, dy]) =>
          axis === 'x' ? [q, dy, fixed] : [fixed, dy, q],
        );
        paintedQuad(triangle, '#d3d1af');
      }
    }
  }
  function flushOverlays() {
    for (const [color, positions] of overlays) {
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const mat = own(
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      g.add(new THREE.Mesh(geometry, mat));
    }
  }
  function shell(color = p.hull, accent = p.cyan) {
    // A filtered tile texture replaces subpixel 2 cm box strips. Mipmaps keep the
    // panel seams continuous at distance rather than breaking into dark speckles.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = spec.kind === 'hangar' ? '#b7bead' : '#b2c0c8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, 128, 128);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set((w - 0.4) / 10, (d - 0.4) / 10);
    texture.anisotropy = 4;
    const floorColor = spec.kind === 'hangar' ? '#282d25' : p.floor;
    const floorMaterial = own(
      new THREE.MeshStandardMaterial({
        color: floorColor,
        map: texture,
        roughness: 0.78,
        emissive: floorColor,
        emissiveIntensity: 0.08,
      }),
    );
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(w - 0.4, d - 0.4)), floorMaterial);
    const center = world(0, 0);
    floor.position.set(center.x, y + 0.017, center.z);
    floor.rotation.order = 'YXZ';
    floor.rotation.x = -Math.PI / 2;
    floor.rotation.y = api.frame?.rotation ?? 0;
    floor.name = `${spec.id} filtered floor panels`;
    g.add(floor);
    B(0, 0, -hd, w, h - 0.25, 0.35, color);
    B(0, 0, hd, w, h - 0.25, 0.35, color);
    // The full-height openings at both ends preserve the base's central cross corridor and upper bridges.
    for (const x of [-hw, hw])
      for (const side of [-1, 1]) {
        B(x, 0, (side * (hd + 4.5)) / 2, 0.35, h - 0.25, hd - 4.5, color);
        B(x - Math.sign(x) * 0.25, 0.12, side * 4.7, 0.25, h - 0.7, 0.22, p.steel);
        B(x - Math.sign(x) * 0.41, 0.3, side * 4.7, 0.04, h - 1.05, 0.07, accent, false);
      }
    B(0, h - 0.25, 0, w, 0.18, d, color);
    for (let x = -hw + 9; x < hw - 3; x += 15) {
      for (const z of [-hd + 0.42, hd - 0.42]) {
        B(x, 0, z, 0.8, h - 0.35, 0.65, spec.kind === 'hangar' ? '#414538' : '#2b414d');
        // Staggered box ribs suggest the angular wall profile without mismatched sloping collision.
        for (let j = 0; j < 4; j++)
          B(
            x,
            h - 2.2 + j * 0.4,
            z - Math.sign(z) * (0.45 + j * 0.4),
            0.85,
            0.42,
            0.7,
            spec.kind === 'hangar' ? '#414538' : p.steel,
          );
      }
      B(x, h - 0.4, 0, 0.28, 0.12, d - 4, spec.kind === 'hangar' ? '#4f5545' : '#3b5660');
    }
    for (const z of [-hd + 1, hd - 1]) B(0, 0.14, z, w - 3, 0.05, 0.06, accent, false);
    for (const x of [-hw + 1, hw - 1]) B(x, 0.14, 0, 0.06, 0.05, d - 3, accent, false);
    S(`${spec.name} / ${String(spec.id).toUpperCase()}`, -hw + 1, 3.4, -7, 10, 0.65, '#bef7f6', Math.PI / 2);
    S(`${spec.name} / ${String(spec.id).toUpperCase()}`, hw - 1, 3.4, 7, 10, 0.65, '#bef7f6', -Math.PI / 2);
  }
  function stairs({ x, z, width = 5, base = 0, rise, run, toward = -1 }) {
    const steps = Math.ceil(rise / 0.165),
      tread = run / steps;
    for (let i = 0; i < steps; i++) {
      const center = z + toward * (i + 0.5) * tread;
      B(
        x,
        base,
        center,
        width,
        (rise * (i + 1)) / steps,
        tread + 0.003,
        spec.kind === 'hangar' ? '#62654f' : p.steel,
      );
      B(
        x,
        base + (rise * (i + 1)) / steps + 0.006,
        center - toward * (tread / 2 - 0.035),
        width - 0.12,
        0.012,
        0.045,
        spec.kind === 'hangar' ? '#acae69' : '#68bbc4',
        false,
      );
    }
  }
  function consoleBank(x, z, width, dy = 0, label = '操作員') {
    B(x, dy, z, width, 0.9, 1.55, p.steel);
    B(x, dy + 0.9, z, width + 0.2, 0.12, 1.8, p.panel);
    const count = Math.max(2, Math.floor(width / 4));
    for (let i = 0; i < count; i++) {
      const sx = x + ((i - (count - 1) / 2) * (width - 2)) / count;
      B(sx, dy + 1.02, z - 0.4, 2.3, 0.78, 0.16, '#12232d');
      B(sx, dy + 1.1, z - 0.305, 2.1, 0.59, 0.018, p.cyan, false);
      B(sx, dy + 1.03, z + 0.42, 1.1, 0.035, 0.38, '#6c8a93');
      C(sx, z + 1.6, `${label}座椅`, 0, dy);
    }
  }
  function wallScreen(x, dy, z, sw, sh, kind = 'tactical', turn = 0) {
    B(x, dy - sh / 2 - 0.15, z - 0.13, sw + 0.7, sh + 0.3, 0.25, '#284c59');
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = Math.max(256, Math.round((1536 * sh) / sw));
    const ctx = canvas.getContext('2d'),
      cw = canvas.width,
      ch = canvas.height;
    ctx.fillStyle = kind === 'menu' ? '#d9ddc8' : '#9eeae7';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#327d8533';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 24; i++) {
      ctx.beginPath();
      ctx.moveTo((cw * i) / 24, 0);
      ctx.lineTo((cw * i) / 24, ch);
      ctx.stroke();
    }
    for (let i = 0; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (ch * i) / 12);
      ctx.lineTo(cw, (ch * i) / 12);
      ctx.stroke();
    }
    ctx.strokeStyle = '#397a83';
    ctx.lineWidth = 5;
    if (kind === 'tactical') {
      ctx.beginPath();
      ctx.moveTo(0, ch * 0.77);
      ctx.bezierCurveTo(cw * 0.25, ch * 0.57, cw * 0.49, ch * 0.95, cw, ch * 0.7);
      ctx.stroke();
      ctx.strokeRect(cw * 0.44, ch * 0.31, cw * 0.13, ch * 0.3);
      ctx.strokeRect(cw * 0.466, ch * 0.37, cw * 0.078, ch * 0.17);
      for (const [rx, rz] of [
        [0.18, 0.3],
        [0.75, 0.24],
        [0.79, 0.65],
        [0.23, 0.68],
      ]) {
        ctx.beginPath();
        ctx.arc(cw * rx, ch * rz, ch * 0.055, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#235661';
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.max(20, ch * 0.085)}px sans-serif`;
    ctx.fillText(
      kind === 'menu' ? 'BORDER  /  DINING & RECOVERY' : 'BORDER  /  MIKADO CITY TACTICAL MAP',
      35,
      ch * 0.14,
    );
    ctx.font = `${Math.max(15, ch * 0.05)}px monospace`;
    ctx.fillText('SECTOR 01 — 04     /     LOCAL FACILITY NETWORK', 35, ch * 0.91);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = own(new THREE.PlaneGeometry(sw, sh)),
      mat = own(new THREE.MeshBasicMaterial({ map: texture }));
    const mesh = new THREE.Mesh(geometry, mat),
      q = world(x, z + 0.03);
    mesh.position.set(q.x, y + dy, q.z);
    mesh.rotation.y = (api.frame?.rotation ?? 0) + turn;
    g.add(mesh);
  }
  function brokenRail(axis, fixed, dy, start, end, holes) {
    let cursor = start;
    for (const [a, b] of [...holes].sort((a, b) => a[0] - b[0])) {
      if (a > cursor)
        R(
          axis === 'x' ? (cursor + a) / 2 : fixed,
          dy,
          axis === 'x' ? fixed : (cursor + a) / 2,
          axis === 'x' ? a - cursor : 0.08,
          axis === 'x' ? 0.08 : a - cursor,
        );
      cursor = Math.max(cursor, b);
    }
    if (cursor < end)
      R(
        axis === 'x' ? (cursor + end) / 2 : fixed,
        dy,
        axis === 'x' ? fixed : (cursor + end) / 2,
        axis === 'x' ? end - cursor : 0.08,
        axis === 'x' ? 0.08 : end - cursor,
      );
  }
  function command() {
    shell('#14232c');
    wallScreen(0, Math.min(h * 0.49, 5.8), -hd + 0.65, w * 0.74, Math.min(h - 2.7, 8.7));
    // Three genuine raised operator levels, with five 16 cm steps at each transition.
    const tierDepth = 12,
      first = 6,
      spacing = 14,
      tierWidth = Math.min(w - 16, 104);
    for (let row = 0; row < 3; row++) {
      const dy = (row + 1) * 0.8,
        start = first + row * spacing,
        z = start + tierDepth / 2;
      B(0, 0, z, tierWidth, dy, tierDepth, '#304b54');
      B(0, dy + 0.012, z, tierWidth - 0.15, 0.025, tierDepth - 0.15, '#49656d', false);
      for (const sx of [-tierWidth / 2 + 5, 0, tierWidth / 2 - 5])
        stairs({ x: sx, z: start - 2, width: 6, base: row * 0.8, rise: 0.8, run: 2, toward: 1 });
      for (const x of [-tierWidth * 0.25, tierWidth * 0.25]) {
        consoleBank(x, z - 0.8, Math.min(25, tierWidth * 0.27), dy, `${row + 1} 階操作員`);
        B(x, dy, z + 3.8, Math.min(27, tierWidth * 0.3), 1.2, 0.28, '#29444d');
        B(x, dy + 1.13, z + 3.64, Math.min(26, tierWidth * 0.29), 0.05, 0.06, p.cyan, false);
      }
      const cuts = [-tierWidth / 2 + 5, 0, tierWidth / 2 - 5].map((x) => [x - 3.3, x + 3.3]);
      brokenRail('x', start + tierDepth - 0.15, dy, -tierWidth / 2, tierWidth / 2, row < 2 ? cuts : []);
      for (const side of [-1, 1]) R((side * tierWidth) / 2, dy, z, 0.08, tierDepth);
    }
    // A broad, low command podium faces the same main display, leaving the central cross aisle clear.
    const podX = w * 0.18,
      podZ = -d * 0.23,
      podW = Math.min(29, w * 0.28),
      podD = 15,
      podY = 0.8;
    B(podX, 0, podZ, podW - 3, podY, podD, '#3c5a62');
    B(podX, 0, podZ, podW, podY, podD - 3, '#3c5a62');
    stairs({ x: podX, z: podZ + podD / 2 + 2, width: 7, rise: podY, run: 2, toward: -1 });
    consoleBank(podX, podZ - 1, podW - 7, podY, '中央指揮');
    for (const side of [-1, 1]) B(podX + side * (podW / 2 - 0.4), podY, podZ, 0.7, 1.25, podD - 4, '#34525b');
    // The actual 58F floor owns these four-metre balconies. Guard their inner edges.
    const upper = 6;
    for (const side of [-1, 1]) {
      R(side * (hw - 4), upper, 0, 0.08, d - 8);
      R(0, upper, side * (hd - 4), w - 8, 0.08);
    }
    T('指揮中心上層交通導覽', -hw + 0.7, 12, 'directory', '', upper);
    T('城市防衛戰術台', -w * 0.25, -d * 0.25, 'missions');
    T('基地設施與交通導覽', -hw + 8, -10, 'directory');
    S('CENTRAL COMMAND  /  BORDER', 0, h - 1.1, hd - 0.32, Math.min(52, w - 12), 1.1, '#82b7be', Math.PI);
    api.light?.(g, 0, y + h - 2, -hd + 8, '#80ecec', 18, 85);
    api.light?.(g, 0, y + 5, 16, '#4dabb9', 8, 58);
  }
  function hangar() {
    shell('#23291f', '#b5b66b');
    // Deliberately one huge bay. The offset keeps the base's v=0 cross passage open.
    const pw = 60,
      pd = 34,
      py = 3.2,
      pz = -32;
    B(0, 0, pz, pw - 5, py, pd, '#444b3b');
    B(0, 0, pz, pw, py, pd - 5, '#444b3b');
    B(0, py + 0.006, pz, pw - 5.1, 0.018, pd - 0.2, '#65705a', false);
    B(0, py + 0.008, pz, pw - 0.2, 0.018, pd - 5.1, '#65705a', false);
    stairs({ x: 0, z: pz + pd / 2 + 8, width: 18, rise: py, run: 8, toward: -1 });
    for (const side of [-1, 1]) {
      B(side * (pw / 2 - 1.8), py, pz, 0.6, 1.4, pd - 6, '#818571');
      B(side * (pw / 2 - 1.4), py + 1.24, pz, 0.07, 0.1, pd - 7, '#d0ca79', false);
    }
    // True diagonal painted hazard strips share one batched, disposable geometry.
    const stripeZ = pz + pd / 2 - 2.7;
    for (let x = -pw / 2 + 3; x < pw / 2 - 4; x += 2.8)
      floorQuad(
        [
          [x, stripeZ],
          [x + 1.1, stripeZ],
          [x + 3.2, stripeZ + 2.2],
          [x + 2.1, stripeZ + 2.2],
        ],
        py + 0.035,
        '#c6be6e',
      );
    hazardPanel('x', pz + pd / 2 + 0.018, -pw / 2 + 2.6, -9.3, py);
    hazardPanel('x', pz + pd / 2 + 0.018, 9.3, pw / 2 - 2.6, py);
    for (const side of [-1, 1])
      hazardPanel('z', side * (pw / 2 + 0.018), pz - pd / 2 + 2.6, pz + pd / 2 - 2.6, py);
    const galleryLevels = [6, 9];
    for (const dy of galleryLevels) {
      const depth = 6,
        insideX = hw - depth;
      const landingZ = dy === 6 ? hd - 30 : hd - 18;
      for (const side of [-1, 1]) {
        // The normal B1 floor already owns the outer four metres and the v=0 bridge.
        // Only add its inner two-metre catwalk extension; the 9m gallery is entirely local.
        const extra = dy === 6 ? 2 : depth;
        const sideX = side * (dy === 6 ? hw - 5 : hw - 3);
        const intervals =
          dy === 6
            ? [
                [-hd + 0.4, -4],
                [4, hd - 0.4],
              ]
            : [[-hd + 0.4, hd - 0.4]];
        for (const [a, b] of intervals) B(sideX, dy - 0.22, (a + b) / 2, extra, 0.22, b - a, '#505744');
        brokenRail('z', side * insideX, dy, -hd + 6, hd - 6, [
          [-5, 5],
          [landingZ - 3.3, landingZ + 3.3],
        ]);
      }
      for (const side of [-1, 1]) {
        const extra = dy === 6 ? 2 : depth;
        B(0, dy - 0.22, side * (dy === 6 ? hd - 5 : hd - 3), w - depth * 2, 0.22, extra, '#505744');
      }
      brokenRail(
        'x',
        hd - 6,
        dy,
        -hw + 6,
        hw - 6,
        dy === 6
          ? [
              [-hw + 12.7, -hw + 17.3],
              [hw - 17.3, hw - 12.7],
            ]
          : [],
      );
      R(0, dy, -hd + 6, w - depth * 2, 0.1);
      for (const side of [-1, 1]) {
        const stairX = side * (hw - 15);
        if (dy === 6) {
          stairs({ x: stairX, z: hd - 9, width: 4, rise: 6, run: 18, toward: -1 });
          B(stairX, 5.8, landingZ, 5, 0.2, 6, '#505744');
          B(side * (hw - 9), 5.8, landingZ, 12, 0.2, 4, '#505744');
        } else {
          stairs({ x: stairX, z: hd - 6, width: 4, base: 6, rise: 3, run: 9, toward: -1 });
          B(stairX, 8.8, landingZ, 5, 0.2, 6, '#505744');
          B(side * (hw - 9), 8.8, landingZ, 12, 0.2, 4, '#505744');
        }
      }
    }
    // B1 retains a straight eight-metre bridge; guard its long edges and leave the catwalk connections open.
    for (const side of [-1, 1]) R(0, 6, side * 4, w - 12, 0.08);
    // Warm, orthogonal circuit traces cover the enormous bay like the reference floor.
    // Their flat, batched geometry avoids hundreds of luminous objects and preserves collision-free movement.
    for (let x = -hw + 12, column = 0; x < hw - 22; x += 30, column++)
      for (let z = -hd + 12, row = 0; z < hd - 18; z += 27, row++) {
        if (Math.abs(x + 12) < 42 && z < -5 && z + 21 > pz - pd / 2 - 3) continue;
        const shift = ((column + row) % 3) * 2.3,
          points = [
            [x, z],
            [x + 22, z],
            [x + 22, z + 9 + shift],
            [x + 15, z + 9 + shift],
            [x + 15, z + 20],
            [x + 5, z + 20],
            [x + 5, z + 13],
            [x, z + 13],
            [x, z],
          ];
        for (let i = 0; i < points.length - 1; i++) trace(...points[i], ...points[i + 1]);
        trace(x + 2, z + 2, x + 20, z + 2, 0.12, '#c2be76');
        trace(x + 20, z + 2, x + 20, z + 7 + shift, 0.12, '#c2be76');
      }
    for (const x of [-82, -36, 36, 82]) {
      B(x, 0.018, 0, 0.65, 0.016, d - 2, '#151d18', false);
      trace(x - 0.48, -hd + 1, x - 0.48, hd - 1, 0.1, '#777e57');
      trace(x + 0.48, -hd + 1, x + 0.48, hd - 1, 0.1, '#777e57');
    }
    for (let x = -hw + 20; x < hw; x += 28) {
      B(x, h - 0.48, 0, 14, 0.08, 1.4, '#7a8067');
      B(x, h - 0.5, 0, 12, 0.04, 0.7, '#bfc786', false);
    }
    T('遠征艇整備／機庫導覽', -hw + 10, -10, 'directory');
    T(
      '機庫整備紀錄',
      -45,
      -20,
      'info',
      '地下遠征艇機庫；中央平台與檢修步道可步行探索。登艇及遠征任務尚未開放。',
    );
    S('BORDER EXPEDITION  /  CENTRAL DOCK', 0, 7.8, -hd + 0.3, Math.min(160, w - 15), 2.1, '#c6c992');
    api.light?.(g, 0, y + h - 2, -25, '#bbc57c', 16, 110);
  }
  function lab() {
    shell('#263c46');
    for (const side of [-1, 1])
      for (const z of [-hd * 0.55, hd * 0.55]) {
        const x = side * w * 0.3;
        B(x, 0, z, 15, 0.9, 5, '#43626b');
        B(x, 0.9, z, 15.2, 0.1, 5.2, '#a1b3b4');
        for (const off of [-4.5, 0, 4.5]) {
          B(x + off, 1, z - 1.3, 2.3, 1.6, 1.8, '#24454c');
          B(x + off, 1.3, z - 0.38, 1.9, 0.7, 0.025, '#37dce7', false);
          C(x + off, z + 3.5, '研發工作座椅');
        }
      }
    B(0, 0, -hd * 0.43, 18, 0.4, 14, '#385c66');
    for (const x of [-6, 6]) B(x, 0.4, -hd * 0.43, 2.4, 2.8, 7.5, '#4b717a');
    const projection = api.projection?.(g, { id: `${spec.id}-specimen`, x: 0, y: y + 0.7, z: -hd * 0.43 });
    const t = T('觸發器立體設計展示', -10, -hd * 0.43 + 7, 'projection');
    if (t && projection) t.projection = projection;
    T('觸發器開發／自由配裝', hw - 8, 10, 'loadout');
    S('TRIGGER ENGINEERING  /  MATERIAL ANALYSIS', 0, 3.4, -hd + 0.3, Math.min(64, w - 10), 1, '#a6e9e8');
    api.light?.(g, 0, y + 4.8, -hd * 0.43, '#6adce8', 10, 45);
  }
  function mess() {
    shell('#30444a');
    wallScreen(0, Math.min(h - 2, 3.4), -hd + 0.8, w * 0.64, Math.min(2.5, h - 3), 'menu');
    for (const side of [-1, 1]) {
      B(side * w * 0.25, 0, -hd + 8, w * 0.32, 0.95, 4, '#4b6466');
      B(side * w * 0.25, 0.95, -hd + 8, w * 0.32 + 0.2, 0.1, 4.2, '#9fafab');
      for (const x of [side * w * 0.22, side * w * 0.34]) T('食堂點餐與領餐', x, -hd + 12, 'food');
      for (const z of [12, 27]) {
        const x = side * w * 0.26;
        B(x, 0, z, 18, 0.72, 4, '#34505a');
        B(x, 0.72, z, 18.2, 0.1, 4.2, '#96abaa');
        for (const off of [-6, 0, 6]) {
          C(x + off, z - 3, '食堂座椅', Math.PI);
          C(x + off, z + 3, '食堂座椅');
        }
      }
    }
    T('飲品補給', -hw + 7, 10, 'vending');
    S('DINING HALL  /  RECOVERY COMMONS', 0, h - 1.2, hd - 0.3, w * 0.65, 0.8, '#c7d9cf', Math.PI);
  }
  function briefing() {
    shell('#253947');
    const pl = api.projection?.(g, { id: `${spec.id}-tactical`, x: 0, y: y + 0.9, z: -hd * 0.4 });
    B(0, 0, -hd * 0.4, 22, 0.85, 15, '#3b5c69');
    B(0, 0.85, -hd * 0.4, 22.2, 0.08, 15.2, '#638b94');
    for (const side of [-1, 1]) {
      consoleBank(side * w * 0.3, 14, 17, 0, '作戰簡報');
      for (const z of [23, 29]) for (const x of [-5, 5]) C(side * w * 0.3 + x, z, '簡報席');
    }
    const t = T('立體戰術投影', -14, -hd * 0.4 + 9, 'projection');
    if (t && pl) t.projection = pl;
    T('任務簡報與出勤', hw - 8, -10, 'missions');
    wallScreen(0, Math.min(h - 2, 3.3), -hd + 0.8, w * 0.6, Math.min(3, h - 2.7));
  }
  function lounge() {
    shell('#2f464e');
    for (const side of [-1, 1]) {
      const cx = side * w * 0.28;
      for (const z of [-hd * 0.48, hd * 0.48]) {
        B(cx, 0, z, 15, 0.7, 9, '#304c55');
        B(cx, 0.7, z, 14, 0.12, 8, '#718f94');
        B(cx, 0.82, z, 12, 0.7, 1.3, '#5f7d85');
        for (const off of [-4, 4]) C(cx + off, z - 3.2, '交誼休息座椅', Math.PI);
        B(cx, 0, z - 6.5, 9, 0.45, 2.5, '#47636c');
        for (const x of [cx - 8.3, cx + 8.3]) {
          B(x, 0, z, 1.2, 0.8, 5, '#223a41');
          B(x, 0.8, z, 1, 0.45, 4.7, '#477263');
        }
      }
    }
    T('公共區域導覽', -hw + 7, 10, 'directory');
    T('飲品補給', hw - 7, -10, 'vending');
    S('MEMBER COMMONS  /  QUIET LOUNGE', 0, 3.6, -hd + 0.3, Math.min(62, w - 10), 0.9, '#b8d6d6');
    api.light?.(g, 0, y + 4.6, 0, '#a5d8cf', 5, 50);
  }
  const builders = { command, hangar, lab, mess, cafeteria: mess, briefing, lounge };
  (builders[spec.kind] ?? lounge)();
  flushOverlays();
  return { id: spec.id, kind: spec.kind, boxes, seats, terminals, evidence: 'C', clearCrossCorridor: 8 };
}
