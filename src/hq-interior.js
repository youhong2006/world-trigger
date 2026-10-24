import * as THREE from 'three';
import {
  HQ,
  HQ_FLOORS,
  HQ_STOPS,
  HQ_ROOMS,
  HQ_SECTIONS,
  HQ_RANGE,
  HQ_ATRIUM,
  HQ_CORES,
  HQ_SPECIAL_FACILITIES,
  envelopeAt,
  wingFrame,
  sectionsForPosition,
} from './hq-layout.js';
import { furnishHQRoom } from './hq-furnishings.js';
import { buildHQTransit } from './hq-transit.js';
import { buildHQSpecialFacility } from './hq-special-facilities.js';

// Floors and stairs remain solid permanently; detailed rooms stream by sector.
// Every rendered sector owns its colliders, doors and interactables as one unit.
export function createHQInterior({ scene, collision }) {
  const root = new THREE.Group();
  root.name = 'BORDER whole-base interior';
  scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1),
    matrix = new THREE.Matrix4();
  const objects = [],
    doors = [],
    projections = [],
    scopes = [],
    cache = new Map(),
    materials = new Map();
  const MAX_SECTIONS = 16,
    LOAD_RADIUS = 90;
  const ROOM_HEIGHT = HQ.roomHeight ?? 5.7,
    STOREY = HQ.storeyHeight ?? 6;
  let sequence = 0,
    lastStreamKey = '';
  const frameIdentity = { x: 0, z: 0, rotation: 0 };
  function material(color) {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.78,
          emissive: color,
          emissiveIntensity:
            color === '#37dce7' || color === '#39deef' ? 0.9 : color === '#dce7eb' ? 0.36 : 0.08,
        }),
      );
    return materials.get(color);
  }
  function scope(name, y, kind = 'level') {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    const s = {
      g,
      name,
      y,
      kind,
      batches: new Map(),
      colliders: [],
      objects: [],
      doors: [],
      projections: [],
      owned: [],
      instances: 0,
    };
    g.userData.hqScope = s;
    scopes.push(s);
    return s;
  }
  function box(g, x, y, z, w, h, d, color = '#91a4b7', collide = true, rotation = 0) {
    if (!(w > 0 && h > 0 && d > 0)) return null;
    const s = g.userData.hqScope,
      key = color;
    if (!s.batches.has(key)) s.batches.set(key, []);
    s.batches.get(key).push({ x, y: y + h / 2, z, w, h, d, rotation });
    if (!collide) return null;
    const c = Math.abs(Math.cos(rotation)),
      si = Math.abs(Math.sin(rotation));
    const bound = collision.add({ x, y, z, w: w * c + d * si, h, d: w * si + d * c });
    s.colliders.push(bound);
    return bound;
  }
  function register(g, type, name, x, y, z, extra = {}) {
    const s = g.userData.hqScope,
      o = { id: `hq-${++sequence}`, type, name, x, y, z, sectionId: s.sectionId, ...extra };
    objects.push(o);
    s.objects.push(o);
    return o;
  }
  function sign(g, text, x, y, z, w = 3, h = 0.6, color = '#baf6fa', turn = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = w < 2 ? 384 : 768;
    canvas.height = Math.max(32, Math.round((canvas.width * h) / w));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#152d42';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.min(canvas.height * 0.57, 78)}px sans-serif`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 30);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(w, h),
      mat = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = turn;
    g.add(mesh);
    g.userData.hqScope.owned.push(texture, geometry, mat);
    return mesh;
  }
  function finish(s) {
    const q = new THREE.Quaternion();
    for (const [color, list] of s.batches) {
      const mesh = new THREE.InstancedMesh(cube, material(color), list.length);
      mesh.receiveShadow = true;
      list.forEach((p, i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rotation);
        matrix.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.w, p.h, p.d));
        mesh.setMatrixAt(i, matrix);
      });
      mesh.computeBoundingSphere();
      s.g.add(mesh);
      s.instances += list.length;
    }
    s.batches.clear();
    return s;
  }
  function transform(frame, x, z) {
    const c = Math.cos(frame.rotation),
      si = Math.sin(frame.rotation);
    return { x: frame.x + x * c + z * si, z: frame.z - x * si + z * c };
  }
  function apiFor(s, frame = frameIdentity) {
    const g = s.g,
      angle = frame.rotation;
    const point = (x, z) => transform(frame, x, z);
    const B = (ignored, x, y, z, w, h, d, color, collide = true) => {
      const p = point(x, z);
      return box(g, p.x, y, p.z, w, h, d, color, collide, angle);
    };
    const S = (ignored, text, x, y, z, w, h, color, turn = 0) => {
      const p = point(x, z);
      return sign(g, text, p.x, y, p.z, w, h, color, angle + turn);
    };
    const O = (ignored, type, name, x, y, z, extra = {}) => {
      const p = point(x, z),
        v = { ...extra };
      if (v.seat) {
        const a = point(v.seat.x, v.seat.z);
        v.seat = { ...v.seat, ...a };
      }
      if (v.exits) v.exits = v.exits.map((a) => ({ ...a, ...point(a.x, a.z) }));
      if (v.yaw !== undefined) v.yaw += angle;
      return register(g, type, name, p.x, y, p.z, v);
    };
    function T(ignored, name, x, y, z, kind = 'info', text = '') {
      const solids = [
        B(g, x, y, z, 0.95, 0.76, 0.68, '#304759'),
        B(g, x, y + 0.76, z, 1, 0.65, 0.14, '#172d45'),
      ];
      B(g, x, y + 0.82, z + 0.079, 0.86, 0.48, 0.018, '#37dce7', false);
      B(g, x, y + 0.72, z + 0.23, 0.86, 0.045, 0.28, '#526d82', false);
      S(g, name, x, y + 1.18, z + 0.093, 0.82, 0.14);
      return O(g, 'terminal', name, x, y + 1.05, z + 0.19, { kind, text, solids });
    }
    function C(ignored, x, y, z, name = '座椅', yaw = 0) {
      const center = point(x, z),
        chair = apiFor(s, { ...center, rotation: angle + yaw });
      const solids = [
        chair.box(g, 0, y, 0, 0.62, 0.37, 0.62, '#344b60'),
        chair.box(g, 0, y + 0.37, 0, 0.72, 0.13, 0.72, '#6f879c'),
        chair.box(g, 0, y + 0.5, 0.32, 0.72, 0.62, 0.09, '#516c83'),
        chair.box(g, -0.39, y + 0.43, 0, 0.055, 0.17, 0.6, '#87a2b4'),
        chair.box(g, 0.39, y + 0.43, 0, 0.055, 0.17, 0.6, '#87a2b4'),
      ];
      const c = Math.cos(yaw),
        si = Math.sin(yaw);
      return O(g, 'seat', name, x, y + 0.65, z, {
        solids,
        seat: { x, y, z },
        yaw,
        exits: [
          { x: x - si * 1.05, y, z: z - c * 1.05 },
          { x: x + c * 1.05, y, z: z - si * 1.05 },
          { x: x - c * 1.05, y, z: z + si * 1.05 },
        ],
      });
    }
    function table(ignored, x, y, z, w = 3, d = 1.2) {
      B(g, x, y, z, w * 0.8, 0.72, d * 0.65, '#344b60');
      B(g, x, y + 0.72, z, w, 0.12, d, '#b5c5cd');
    }
    function rail(ignored, x, y, z, w, d) {
      const p = point(x, z),
        c = Math.abs(Math.cos(angle)),
        si = Math.abs(Math.sin(angle));
      const bound = collision.add({ x: p.x, y, z: p.z, w: w * c + d * si, d: w * si + d * c, h: 1.1 });
      s.colliders.push(bound);
      for (const h of [0.52, 1.04]) B(g, x, y + h, z, w, 0.06, d, '#7190a9', false);
      const along = w > d,
        len = along ? w : d,
        n = Math.ceil(len / 1.5);
      for (let i = 0; i <= n; i++)
        B(
          g,
          x + (along ? (i / n - 0.5) * len : 0),
          y,
          z + (along ? 0 : (i / n - 0.5) * len),
          0.065,
          1.1,
          0.065,
          '#a9bdca',
          false,
        );
    }
    function door(
      ignored,
      { x, y, z, w = 2.8, h = 2.7, name, automatic = true, access = true, kind = 'room' },
    ) {
      B(g, x - w / 2 - 0.11, y, z, 0.18, h + 0.2, 0.3, '#324960');
      B(g, x + w / 2 + 0.11, y, z, 0.18, h + 0.2, 0.3, '#324960');
      B(g, x, y + h, z, w + 0.4, 0.2, 0.3, '#324960');
      B(g, x, y + h - 0.12, z + 0.17, w - 0.12, 0.055, 0.025, '#37dce7', false);
      const p = point(x, z),
        axis = { x: Math.cos(angle), z: -Math.sin(angle) },
        meshes = [],
        solids = [];
      for (const side of [-1, 1]) {
        const mesh = new THREE.Mesh(cube, material(kind === 'gate' ? '#354453' : '#7690a4'));
        mesh.position.set(p.x + ((side * w) / 4) * axis.x, y + h / 2, p.z + ((side * w) / 4) * axis.z);
        mesh.rotation.y = angle;
        mesh.scale.set(w / 2 - 0.02, h, 0.16);
        g.add(mesh);
        meshes.push(mesh);
        const broadW = Math.abs(axis.x) * w * 2.6 + Math.abs(axis.z) * 0.18,
          broadD = Math.abs(axis.z) * w * 2.6 + Math.abs(axis.x) * 0.18;
        const b = collision.add({ x: p.x, y, z: p.z, w: broadW, d: broadD, h });
        s.colliders.push(b);
        b.x = mesh.position.x;
        b.z = mesh.position.z;
        b.halfW = Math.abs(axis.x) * (w / 4 - 0.01) + Math.abs(axis.z) * 0.09;
        b.halfD = Math.abs(axis.z) * (w / 4 - 0.01) + Math.abs(axis.x) * 0.09;
        solids.push(b);
      }
      const d = {
        id: `door-${++sequence}`,
        name,
        x: p.x,
        y,
        z: p.z,
        w,
        h,
        rotation: angle,
        leafAxis: axis,
        automatic,
        access,
        kind,
        progress: 0,
        hold: 0,
        manual: 0,
        meshes,
        solids,
      };
      doors.push(d);
      s.doors.push(d);
      O(g, 'door', name, x, y + Math.min(1.15, h / 2), z, { door: d });
      return d;
    }
    function projection(ignored, spec) {
      const group = new THREE.Group();
      group.visible = false;
      g.add(group);
      const mat = new THREE.MeshBasicMaterial({
        color: '#39deef',
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      });
      s.owned.push(mat);
      for (let i = 0; i < 9; i++) {
        const geo = new THREE.BoxGeometry(0.5, 0.4 + (i % 3) * 0.22, 0.5),
          mesh = new THREE.Mesh(geo, mat),
          p = point(spec.x - 1.2 + (i % 3) * 1.15, spec.z - 0.8 + Math.floor(i / 3) * 0.8);
        mesh.position.set(p.x, spec.y + 0.5 + (i % 3) * 0.1, p.z);
        mesh.rotation.y = angle;
        group.add(mesh);
        s.owned.push(geo);
      }
      const p = point(spec.x, spec.z),
        record = { id: spec.id, x: p.x, y: spec.y, z: p.z, group };
      projections.push(record);
      s.projections.push(record);
      return record;
    }
    function light(ignored, x, y, z, color = '#39deef', intensity = 8, distance = 24) {
      const p = point(x, z),
        lamp = new THREE.PointLight(color, intensity, distance, 2);
      lamp.position.set(p.x, y, p.z);
      g.add(lamp);
      return lamp;
    }
    return {
      group: g,
      g,
      frame,
      own: (resource) => {
        s.owned.push(resource);
        return resource;
      },
      box: B,
      sign: S,
      object: O,
      terminal: T,
      chair: C,
      table,
      rail,
      door,
      projection,
      light,
    };
  }
  function subtract(rects, hole) {
    return rects.flatMap((r) => {
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
      ].filter((v) => v.x1 - v.x0 > 0.025 && v.z1 - v.z0 > 0.025);
    });
  }
  const coreHoles = HQ_CORES.flatMap((core) => [
    { x0: core.x - 2, x1: core.x + 2, z0: core.z - 2, z1: core.z + 2 },
    { x0: core.x + 5, x1: core.x + 19, z0: core.z - 6, z1: core.z + 8 },
  ]);
  function facilityFrame(spec) {
    const wing = wingFrame(spec.wing, spec.y),
      center = transform(wing, spec.u, spec.v ?? 0);
    return { ...center, rotation: wing.rotation };
  }
  function facilityBounds(spec, inset = 0) {
    const frame = facilityFrame(spec),
      c = Math.abs(Math.cos(frame.rotation)),
      si = Math.abs(Math.sin(frame.rotation));
    const w = Math.max(0, spec.w - inset * 2),
      d = Math.max(0, spec.d - inset * 2);
    const hw = (w * c + d * si) / 2,
      hd = (w * si + d * c) / 2;
    return { x0: frame.x - hw, x1: frame.x + hw, z0: frame.z - hd, z1: frame.z + hd };
  }
  function protectedPoint(section, u, v, margin = 1) {
    const f = wingFrame(section.wing, section.y),
      p = transform(f, section.u + u, v);
    if (
      HQ_CORES.some(
        (core) =>
          p.x > core.x - 8 - margin &&
          p.x < core.x + 23 + margin &&
          p.z > core.z - 12 - margin &&
          p.z < core.z + 16 + margin,
      )
    )
      return true;
    if (section.wing === 'front' && section.y >= 0 && section.y < 18 && Math.abs(p.x) < 19 + margin)
      return true;
    if (
      section.wing === 'front' &&
      section.y >= HQ_ATRIUM.y &&
      section.y < HQ_ATRIUM.top &&
      p.x > HQ_ATRIUM.minX - margin &&
      p.x < HQ_ATRIUM.maxX + margin &&
      p.z > HQ_ATRIUM.minZ - margin &&
      p.z < HQ_ATRIUM.maxZ + margin
    )
      return true;
    return HQ_SPECIAL_FACILITIES.some(
      (spec) =>
        spec.wing === section.wing &&
        section.y >= spec.y &&
        section.y < spec.top &&
        Math.abs(section.u + u - spec.u) < spec.w / 2 + margin &&
        Math.abs(v - (spec.v ?? 0)) < spec.d / 2 + margin,
    );
  }

  const floorScopes = [];
  function floorRects(y) {
    const e = envelopeAt(y),
      d = HQ.wingDepth;
    return [
      { x0: e.left, x1: e.right, z0: e.front - d, z1: e.front },
      { x0: e.left, x1: e.right, z0: e.back, z1: e.back + d },
      { x0: e.left, x1: e.left + d, z0: e.back + d, z1: e.front - d },
      { x0: e.right - d, x1: e.right, z0: e.back + d, z1: e.front - d },
    ];
  }
  for (const f of HQ_FLOORS) {
    const s = scope(`${f.id} 全周樓板`, f.y, 'floor');
    floorScopes.push(s);
    let rects = floorRects(f.y);
    const holes = [...coreHoles];
    if (f.y > 0 && f.y < 18) {
      const center = wingFrame('front', f.y).z,
        inner = envelopeAt(f.y).innerFront;
      holes.push(
        { x0: -18, x1: 18, z0: inner + 12, z1: center - 4 },
        { x0: -18, x1: 18, z0: center + 4, z1: 251 },
      );
    }
    if (f.y === HQ_ATRIUM.y + STOREY)
      holes.push({
        x0: HQ_ATRIUM.minX + 3,
        x1: HQ_ATRIUM.maxX - 3,
        z0: HQ_ATRIUM.minZ + 3,
        z1: HQ_ATRIUM.maxZ - 3,
      });
    if (f.y > HQ_RANGE.y && f.y < HQ_RANGE.top) {
      const frame = wingFrame('front', f.y);
      holes.push(
        { x0: HQ_RANGE.minU, x1: 36, z0: frame.z + HQ_RANGE.vMin, z1: frame.z + HQ_RANGE.vMax },
        { x0: 66, x1: HQ_RANGE.maxU, z0: frame.z + HQ_RANGE.vMin, z1: frame.z + HQ_RANGE.vMax },
      );
    }
    for (const spec of HQ_SPECIAL_FACILITIES) {
      if (f.y > spec.y && f.y < spec.top) {
        const bounds = facilityBounds(spec, 4);
        if (spec.kind === 'hangar') {
          const centerZ = facilityFrame(spec).z;
          holes.push({ ...bounds, z1: centerZ - 4 }, { ...bounds, z0: centerZ + 4 });
        } else holes.push(bounds);
      }
    }
    for (const h of holes) rects = subtract(rects, h);
    for (const r of rects)
      box(s.g, (r.x0 + r.x1) / 2, f.y - 0.22, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.22, r.z1 - r.z0, '#344b5f');
    finish(s);
  }
  // A multi-storey hall must retain its distant ceiling and balconies when ordinary
  // per-floor graphics are hidden. These previews reuse the permanent floor colliders.
  const rangeGraphics = [],
    rangeFloorPreviews = [];
  for (const level of HQ_FLOORS.filter((f) => f.y > HQ_RANGE.y && f.y < HQ_RANGE.top)) {
    const frame = wingFrame('front', level.y);
    const preview = scope(`${level.id} 射擊場迴廊遠景樓板`, level.y, 'rangePreview');
    let rects = [
      { x0: HQ_RANGE.minU, x1: HQ_RANGE.maxU, z0: frame.z - HQ.wingDepth / 2, z1: frame.z + HQ_RANGE.vMin },
      { x0: HQ_RANGE.minU, x1: HQ_RANGE.maxU, z0: frame.z + HQ_RANGE.vMax, z1: frame.z + HQ.wingDepth / 2 },
      { x0: 36, x1: 66, z0: frame.z + HQ_RANGE.vMin, z1: frame.z + HQ_RANGE.vMax },
    ];
    for (const hole of coreHoles) rects = subtract(rects, hole);
    for (const r of rects)
      box(
        preview.g,
        (r.x0 + r.x1) / 2,
        level.y - 0.22,
        (r.z0 + r.z1) / 2,
        r.x1 - r.x0,
        0.22,
        r.z1 - r.z0,
        '#a5b5c2',
        false,
      );
    finish(preview);
    rangeFloorPreviews.push(preview);
    const detail = scope(`${level.id} 射擊場固定觀察迴廊`, level.y, 'rangeDetail'),
      a = apiFor(detail, frame);
    for (const [lo, hi] of [
      [HQ_RANGE.minU, 36],
      [66, HQ_RANGE.maxU],
    ]) {
      for (const v of [HQ_RANGE.vMin, HQ_RANGE.vMax])
        a.rail(detail.g, (lo + hi) / 2, level.y, v, hi - lo, 0.075);
    }
    for (let u = HQ_RANGE.minU + 20; u < HQ_RANGE.maxU; u += 80) {
      for (const v of [HQ_RANGE.vMin - 4, HQ_RANGE.vMax + 4])
        a.box(detail.g, u, level.y + ROOM_HEIGHT - 0.12, v, 10, 0.05, 0.7, '#dce7eb', false);
      a.sign(
        detail.g,
        `${level.id} 射擊場觀察迴廊`,
        u,
        level.y + 2.7,
        HQ_RANGE.vMin - 0.12,
        13,
        0.7,
        '#baf6fa',
      );
    }
    finish(detail);
    rangeGraphics.push(detail);
  }
  const rangeCeiling = scope('射擊場 24m 挑高天花', HQ_RANGE.top, 'rangeCeiling');
  const topFrame = wingFrame('front', HQ_RANGE.top);
  let ceilingRects = [
    {
      x0: HQ_RANGE.minU,
      x1: HQ_RANGE.maxU,
      z0: topFrame.z - HQ.wingDepth / 2 + 2,
      z1: topFrame.z + HQ.wingDepth / 2 - 2,
    },
  ];
  // Preserve the actual elevator and stair openings rather than sealing the service core.
  for (const hole of coreHoles) ceilingRects = subtract(ceilingRects, hole);
  for (const r of ceilingRects)
    box(
      rangeCeiling.g,
      (r.x0 + r.x1) / 2,
      HQ_RANGE.top - 0.24,
      (r.z0 + r.z1) / 2,
      r.x1 - r.x0,
      0.02,
      r.z1 - r.z0,
      '#a9bac9',
      false,
    );
  finish(rangeCeiling);
  rangeGraphics.push(rangeCeiling);
  const transit = buildHQTransit({ scope, apiFor, box, finish, collision, cube, material, root, register });
  const { lifts, lift, liftDoors, coreScopes, stairScopes, foundations, roofScopes } = transit;
  const basementY = HQ.basementY ?? -12;
  const gateScope = scope('正面大型入口', 0, 'gate'),
    gateAPI = apiFor(gateScope);
  gateAPI.door(gateScope.g, { x: 0, y: 0, z: 247.5, w: 14, h: 18, name: 'BORDER 正面大門', kind: 'gate' });
  gateAPI.door(gateScope.g, { x: -12, y: 0, z: 249.4, w: 2.6, h: 3, name: 'BORDER 人員入口' });
  gateAPI.sign(gateScope.g, 'H01 / BORDER 本部正面入口', 0, 19.5, 249, 22, 1);
  finish(gateScope);
  // Main entrance hall has an uninterrupted ground-level route, not a raised plinth/ramp.
  const lobby = scope('正面入口大廳', 0, 'lobby'),
    la = apiFor(lobby);
  const lobbyInner = envelopeAt(0).innerFront,
    lobbyDepth = HQ.front - lobbyInner,
    lobbyCenter = (HQ.front + lobbyInner) / 2;
  for (const x of [-18, 18])
    for (let z = lobbyInner + 12; z < HQ.front - 2; z += 24)
      la.box(lobby.g, x, 0, z, 1.1, 18, 1.1, '#617b92');
  for (const x of [-17.3, 17.3]) la.box(lobby.g, x, 17.5, lobbyCenter, 1.4, 0.5, lobbyDepth, '#7e95a8');
  la.box(lobby.g, 0, 18.05, lobbyCenter, 36, 0.3, lobbyDepth, '#6f8599');
  for (let z = lobbyInner + 16; z < HQ.front - 3; z += 20)
    la.box(lobby.g, 0, 17.9, z, 22, 0.06, 1, '#dce7eb', false);
  la.box(lobby.g, 0, 0.015, lobbyCenter, 0.18, 0.018, lobbyDepth - 8, '#37dce7', false);
  la.table(lobby.g, -12, 0, 233, 8, 2);
  la.terminal(lobby.g, '基地導覽與樓層圖', -10, 0, 234.5, 'directory');
  la.terminal(lobby.g, '接待／任務登記', 12, 0, 234, 'missions');
  for (const x of [-12, 12])
    for (const z of [223, 219, 215]) la.chair(lobby.g, x, 0, z, '大廳等候座椅', x > 0 ? Math.PI : 0);
  la.sign(lobby.g, 'H01 / 本部接待大廳', 0, 9, lobbyInner + 1.1, 25, 2.2, '#d9f7ff');
  la.sign(lobby.g, '← 西側設施　　中央中庭 ↑　　服務電梯・東側設施 →', 0, 3, 221, 20, 0.55);
  finish(lobby);
  const roof = scope('RF 通訊與觀測', HQ.roof, 'roof'),
    ra = apiFor(roof);
  for (const x of [-36, -18, 0]) ra.box(roof.g, x, HQ.roof, 176, 6, 2.2, 4, '#5c7285');
  ra.terminal(roof.g, '觀測／全基地導覽', 0, HQ.roof, 204, 'radar');
  ra.chair(roof.g, -10, HQ.roof, 207, '屋頂長椅');
  finish(roof);
  // Landmark facilities are hand-composed halls, not copies of ordinary room modules.
  const facilityScopes = [];
  for (const spec of HQ_SPECIAL_FACILITIES) {
    const s = scope(`${spec.floor} ${spec.name}`, spec.y, 'specialFacility');
    s.facility = spec;
    const a = apiFor(s, facilityFrame(spec));
    buildHQSpecialFacility(a, { ...spec, h: spec.h ?? spec.top - spec.y });
    for (const side of [-1, 1]) {
      a.sign(
        s.g,
        `${spec.code ?? spec.id.toUpperCase()} / ${spec.name}`,
        side * (spec.w / 2 + 0.35),
        spec.y + 3.3,
        0,
        Math.min(15, spec.d / 3),
        1.05,
        '#baf6fa',
        (side * Math.PI) / 2,
      );
      a.sign(
        s.g,
        `${spec.floor}　重要設施　${spec.name}`,
        side * (spec.w / 2 + 0.38),
        spec.y + 2.15,
        0,
        Math.min(13, spec.d / 3),
        0.5,
        '#87c6d9',
        (side * Math.PI) / 2,
      );
    }
    finish(s);
    facilityScopes.push(s);
  }
  const facilityGalleryScopes = [];
  for (const spec of HQ_SPECIAL_FACILITIES)
    for (const f of HQ_FLOORS.filter((f) => f.y > spec.y && f.y < spec.top)) {
      const s = scope(`${f.id} ${spec.name}環廊`, f.y, 'specialGallery'),
        a = apiFor(s, facilityFrame(spec));
      // Custom multi-storey halls own their gallery guards and stair openings.
      // Adding another generic rail would block the hangar's stair landings and
      // overlap the command centre's existing balcony geometry.
      if (spec.kind !== 'command' && spec.kind !== 'hangar') {
        const hx = spec.w / 2 - 4,
          hz = spec.d / 2 - 4;
        for (const x of [-hx, hx]) a.rail(s.g, x, f.y, 0, 0.08, hz * 2);
        for (const z of [-hz, hz]) a.rail(s.g, 0, f.y, z, hx * 2, 0.08);
      }
      for (const x of [-spec.w / 2 + 2, spec.w / 2 - 2])
        a.sign(
          s.g,
          `${f.id} / ${spec.name} 觀察環廊`,
          x,
          f.y + 2.6,
          0,
          14,
          0.7,
          '#baf6fa',
          x > 0 ? Math.PI / 2 : -Math.PI / 2,
        );
      finish(s);
      facilityGalleryScopes.push(s);
    }

  function roomStructure(s, room, section) {
    const wf = wingFrame(section.wing, section.y),
      p = transform(wf, section.u + room.x, room.z);
    const frame = { ...p, rotation: wf.rotation + (room.rotation ?? 0) },
      a = apiFor(s, frame),
      g = s.g,
      y = room.y,
      w = room.w,
      d = room.d,
      h = ROOM_HEIGHT;
    a.box(g, 0, y, -d / 2, w, h, 0.24, '#91a5b8');
    a.box(g, -w / 2, y, 0, 0.24, h, d, '#91a5b8');
    a.box(g, w / 2, y, 0, 0.24, h, d, '#91a5b8');
    const side = (w - 3.2) / 2,
      doorH = 3.2;
    a.box(g, -(w + 3.2) / 4, y, d / 2, side, h, 0.24, '#829aae');
    a.box(g, (w + 3.2) / 4, y, d / 2, side, h, 0.24, '#829aae');
    a.box(g, 0, y + doorH + 0.05, d / 2, 3.2, h - doorH - 0.05, 0.24, '#829aae');
    a.box(g, 0, y + h, 0, w, 0.13, d, '#b9c8d2');
    a.door(g, { x: 0, y, z: d / 2, w: 3, h: doorH, name: room.name });
    a.sign(g, `${room.floor} / ${room.name}`, 0, y + 3.7, d / 2 + 0.17, Math.min(7, w - 0.5), 0.5, '#d5f9ff');
    furnishHQRoom(a, { ...room, x: 0, z: 0 });
  }
  function corridor(s, section) {
    const f = wingFrame(section.wing, section.y),
      center = transform(f, section.u, 0);
    const a = apiFor(s, { ...center, rotation: f.rotation }),
      g = s.g,
      y = section.y;
    const rows = [-71, -47, -25, 0, 25, 47, 71];
    // Floor guidance remains flush; structural ribs frame the main circulation instead of repeated doors.
    for (const v of rows) {
      for (let u = -section.w / 2 + 4; u < section.w / 2; u += 8) {
        if (protectedPoint(section, u, v, 5)) continue;
        const width = v === 0 ? 8 : 4;
        a.box(g, u, y + 0.002, v, 7.8, 0.004, width, v === 0 ? '#253c50' : '#2d465b', false);
        a.box(g, u, y + 0.008, v - width / 2 + 0.16, 7.5, 0.008, 0.055, '#37dce7', false);
        a.box(g, u, y + 0.008, v + width / 2 - 0.16, 7.5, 0.008, 0.055, '#4d7890', false);
        a.box(g, u, y + ROOM_HEIGHT - 0.12, v, 5, 0.05, 0.48, '#b2dce5', false);
      }
    }
    for (const u of [-section.w / 2, -section.w / 6, section.w / 6, section.w / 2]) {
      for (const v of [-58, -36, -14, 14, 36, 58]) {
        if (!protectedPoint(section, u, v, 3)) a.box(g, u, y + 0.012, v, 0.07, 0.008, 18, '#537a91', false);
      }
    }
    for (const u of [-section.w / 2 + 1, section.w / 2 - 1]) {
      if (protectedPoint(section, u, 0, 9)) continue;
      for (const v of [-5.25, 5.25]) {
        a.box(g, u, y, v, 0.38, ROOM_HEIGHT, 0.6, '#263e53');
        a.box(g, u, y + 0.35, v - Math.sign(v) * 0.32, 0.11, ROOM_HEIGHT - 0.7, 0.035, '#37dce7', false);
      }
      a.box(g, u, y + ROOM_HEIGHT - 0.45, 0, 0.5, 0.45, 11.1, '#253d53');
    }
    for (const v of [-78, 78])
      if (!protectedPoint(section, 0, v, 3)) {
        a.box(g, 0, y + 0.15, v, section.w - 0.5, ROOM_HEIGHT - 0.4, 0.32, '#2b4258');
        a.box(g, 0, y + 0.55, v - Math.sign(v) * 0.18, section.w - 2, 0.08, 0.025, '#37dce7', false);
        a.box(
          g,
          0,
          y + ROOM_HEIGHT - 0.65,
          v - Math.sign(v) * 0.18,
          section.w - 2,
          0.14,
          0.025,
          '#4e718a',
          false,
        );
      }
    if (!protectedPoint(section, 0, 0, 12)) {
      const label = section.rooms.length ? '支援室區' : '連絡走廊 / 開放轉乘區';
      for (const side of [-1, 1])
        a.sign(
          g,
          `${section.floor}　${section.name}　${label}`,
          0,
          y + 3.5,
          side * 4.75,
          Math.min(19, section.w - 4),
          0.72,
          '#baf6fa',
          side < 0 ? 0 : Math.PI,
        );
    }
  }
  function rangeSection(s, section) {
    const f = wingFrame('front', HQ_RANGE.y),
      a = apiFor(s, f),
      g = s.g,
      y = HQ_RANGE.y;
    const lo = Math.max(HQ_RANGE.minU, section.u - section.w / 2),
      hi = Math.min(HQ_RANGE.maxU, section.u + section.w / 2);
    if (section.kind === 'rangeGallery') return;
    for (
      let u = Math.ceil(lo / HQ_RANGE.laneSpacing) * HQ_RANGE.laneSpacing;
      u < hi;
      u += HQ_RANGE.laneSpacing
    ) {
      if (u > 30 && u < 78) continue;
      const booth = HQ_RANGE.boothV;
      a.box(g, u - 4, y, booth - 12, 0.18, 2.1, 26, '#46546d');
      a.box(
        g,
        u,
        y + 0.01,
        (HQ_RANGE.targetV + booth) / 2,
        0.08,
        0.015,
        booth - HQ_RANGE.targetV - 4,
        '#d6bd72',
        false,
      );
      // The console sits beside the firing line so both hand muzzles remain clear.
      a.box(g, u - 2.4, y, booth - 1.5, 2.4, 0.75, 1.1, '#34485e');
      a.box(g, u - 2.4, y + 0.75, booth - 1.5, 2.4, 0.08, 1.3, '#8fa4b6');
      a.terminal(
        g,
        `實體射擊靶位 ${Math.round((u - HQ_RANGE.minU) / HQ_RANGE.laneSpacing) + 1}`,
        u - 2.4,
        y,
        booth + 1,
        'rangeControl',
      );
      a.box(g, u, y + 0.02, HQ_RANGE.targetV - 2, 8, 0.02, 2, '#647c8f', false);
      // Low faceted-cover silhouettes follow the white training terrain in the supplied still.
      // They stay between adjacent lane axes so a direct shot to every target remains clear.
      if (Math.round(u / HQ_RANGE.laneSpacing) % 3 === 0) {
        a.box(g, u + 5, y, -18, 2.2, 1.8, 5, '#c3ced7');
        a.box(g, u + 5, y + 1.8, -18, 1.4, 0.6, 3.2, '#e0e8ed');
      }
      a.box(g, u, y + HQ_RANGE.top - y - 0.5, 0, 0.18, 0.18, HQ.wingDepth - 4, '#638299');
      a.box(g, u, y + HQ_RANGE.top - y - 0.25, booth - 20, 7, 0.08, 1, '#dce7eb', false);
    }
    a.sign(
      g,
      'TR-02 / 大型實體射擊訓練場',
      (lo + hi) / 2,
      y + 12,
      HQ_RANGE.vMin + 0.25,
      Math.min(45, hi - lo),
      2.8,
      '#d9f7ff',
    );
    a.sign(
      g,
      '射擊區域　保持靶線淨空',
      (lo + hi) / 2,
      y + 3.4,
      HQ_RANGE.vMax - 1,
      Math.min(14, hi - lo),
      0.7,
      '#e6c97d',
      Math.PI,
    );
  }
  function lobbySection(s, section) {
    const f = wingFrame(section.wing, section.y),
      a = apiFor(s, f),
      y = section.y,
      g = s.g;
    // Preserve horizontal circulation on the inner balcony around the entrance void.
    if (y > 0 && y < 18) {
      const edge = envelopeAt(y).innerFront + 12;
      a.rail(g, 0, y, edge - f.z, 36, 0.08);
      for (const v of [-4, 4]) a.rail(g, 0, y, v, 36, 0.08);
      a.sign(g, `${section.floor} / 正面大廳觀景通道`, 0, y + 3.6, edge - f.z - 4, 16, 0.6);
      a.terminal(g, '樓層與設施導覽', -24, y, envelopeAt(y).innerFront + 6 - f.z, 'directory');
    } else if (y === 0) {
      for (const u of [-40, 40]) {
        a.terminal(g, '全基地交通導覽', u, y, 8, 'directory');
        a.chair(g, u + 4, y, -8, '入口交誼座椅');
      }
    }
  }
  const atriumScopes = [];
  function buildAtrium() {
    const lo = HQ_ATRIUM.minX,
      hi = HQ_ATRIUM.maxX,
      cx = (lo + hi) / 2,
      z0 = HQ_ATRIUM.minZ,
      z1 = HQ_ATRIUM.maxZ,
      y = HQ_ATRIUM.y;
    const s = scope('2F–3F 個人排名訓練大廳', y + STOREY / 2, 'atrium'),
      a = apiFor(s),
      g = s.g;
    atriumScopes.push(s);
    a.box(g, cx, y, z0, hi - lo, STOREY * 2 - 0.2, 0.24, '#8c9fb5');
    a.box(g, cx, y, z1, hi - lo, STOREY * 2 - 0.2, 0.24, '#8c9fb5');
    a.box(g, cx, HQ_ATRIUM.top - 0.2, (z0 + z1) / 2, hi - lo, 0.2, z1 - z0, '#a9bac9');
    // Both ends connect to the whole-wing corridor, through wide symmetric doorways.
    const corridorZ = wingFrame('front', y).z;
    for (const x of [lo, hi]) {
      a.box(g, x, y, (z0 + corridorZ - 3.7) / 2, 0.18, STOREY * 2 - 0.2, corridorZ - 3.7 - z0, '#8c9fb5');
      a.box(g, x, y, (z1 + corridorZ + 3.7) / 2, 0.18, STOREY * 2 - 0.2, z1 - corridorZ - 3.7, '#8c9fb5');
      const d = apiFor(s, { x, z: corridorZ, rotation: Math.PI / 2 });
      for (const dy of [0, STOREY])
        d.door(g, {
          x: 0,
          y: y + dy,
          z: 0,
          w: 7,
          h: 3.3,
          name: dy ? '上層觀戰迴廊入口' : '個人排名戰大廳入口',
        });
    }
    for (const side of [-1, 1])
      for (const dy of [0, STOREY]) {
        a.sign(
          g,
          `${dy ? '3F' : '2F'} / TR-01 個人排名戰大廳`,
          side < 0 ? lo - 0.35 : hi + 0.35,
          y + dy + 4.2,
          corridorZ,
          16,
          0.95,
          '#baf6fa',
          (side * Math.PI) / 2,
        );
      }
    const board = document.createElement('canvas');
    board.width = 1536;
    board.height = 768;
    const ctx = board.getContext('2d');
    ctx.fillStyle = '#213449';
    ctx.fillRect(0, 0, 1536, 768);
    ctx.fillStyle = '#c0ced7';
    ctx.fillRect(18, 18, 1500, 210);
    ctx.fillStyle = '#193448';
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('TR-01 / 個人排名戰訓練大廳', 768, 110);
    ctx.font = '32px sans-serif';
    ctx.fillText('2F－3F　個人訓練・模擬戰鬥入口', 768, 185);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 12; col++) {
        const x = 24 + col * 124,
          z = 250 + row * 96;
        ctx.fillStyle = '#111e2e';
        ctx.fillRect(x, z, 116, 86);
        ctx.fillStyle = '#e1757d';
        ctx.font = 'bold 35px monospace';
        ctx.fillText(String(201 + row * 12 + col), x + 58, z + 56);
      }
    const texture = new THREE.CanvasTexture(board);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(42, 5.7),
      mat = new THREE.MeshBasicMaterial({ map: texture });
    const screen = new THREE.Mesh(geo, mat);
    screen.position.set(cx, y + 6.4, z0 + 0.12);
    g.add(screen);
    s.owned.push(texture, geo, mat);
    for (let i = 0; i < 6; i++) {
      const x = lo + 8 + (i * (hi - lo - 16)) / 5;
      a.terminal(g, `訓練室 ${201 + i}`, x, y, z0 + 8, 'training');
      a.chair(g, x, y, z1 - 10, '等候長椅');
    }
    a.terminal(g, '訓練／個人紀錄', cx, y, z1 - 5, 'training');
    for (const x of [lo + 3.05, hi - 3.05]) {
      const start = z0 + 2.5,
        gapStart = z1 - 28,
        gapEnd = z1 - 24,
        end = z1 - 2.5;
      a.rail(g, x, y + STOREY, (start + gapStart) / 2, 0.08, gapStart - start);
      a.rail(g, x, y + STOREY, (gapEnd + end) / 2, 0.08, end - gapEnd);
    }
    for (const z of [z0 + 3.05, z1 - 3.05]) a.rail(g, cx, y + STOREY, z, hi - lo - 5, 0.08);
    for (const x of [lo + 4.3, hi - 4.3]) {
      for (let i = 0; i < 36; i++)
        a.box(g, x, y, z1 - 7 - (i + 0.5) * 0.5, 2.5, ((i + 1) * STOREY) / 36, 0.501, '#bacbd8');
      a.box(g, x + (x < cx ? -1.4 : 1.4), y + STOREY - 0.16, z1 - 26, 6, 0.16, 3, '#b8c9d8');
      for (const edge of [x - 1.3, x + 1.3])
        for (let i = 0; i < 12; i++)
          a.rail(g, edge, y + (i * STOREY) / 12, z1 - 7 - (i + 0.5) * 1.5, 0.07, 1.5);
    }
    for (const z of [z0 + 8, z0 + 24, z1 - 8])
      a.box(g, cx, y + STOREY * 2 - 0.3, z, hi - lo - 6, 0.06, 1, '#dce7eb', false);
    finish(s);
  }
  buildAtrium();
  function buildSection(section) {
    const s = scope(`${section.floor} ${section.name}`, section.y, 'section');
    s.sectionId = section.id;
    s.section = section;
    if (section.kind === 'range' || section.kind === 'rangeGallery') rangeSection(s, section);
    else {
      if (section.kind === 'lobby') lobbySection(s, section);
      corridor(s, section);
      for (const room of section.rooms) {
        const f = wingFrame(section.wing, section.y),
          p = transform(f, section.u + room.x, room.z);
        // Keep the service core and the grand entrance unobstructed independently of room metadata.
        if (
          section.wing === 'front' &&
          p.x + room.w / 2 > 36 &&
          p.x - room.w / 2 < 66 &&
          p.z + room.d / 2 > 186 &&
          p.z - room.d / 2 < 212
        )
          continue;
        if (section.wing === 'front' && section.y >= 0 && section.y < 18 && Math.abs(p.x) < room.w / 2 + 18)
          continue;
        if (
          section.wing === 'front' &&
          section.y >= HQ_ATRIUM.y &&
          section.y < HQ_ATRIUM.top &&
          p.x + room.w / 2 > HQ_ATRIUM.minX &&
          p.x - room.w / 2 < HQ_ATRIUM.maxX &&
          p.z + room.d / 2 > HQ_ATRIUM.minZ &&
          p.z - room.d / 2 < HQ_ATRIUM.maxZ
        )
          continue;
        roomStructure(s, room, section);
      }
    }
    finish(s);
    cache.set(section.id, s);
    return s;
  }
  function removeArray(list, owned) {
    for (const o of owned) {
      const i = list.indexOf(o);
      if (i >= 0) list.splice(i, 1);
    }
  }
  function dispose(s) {
    for (const b of s.colliders) {
      if (collision.remove) collision.remove(b);
      else b.enabled = false;
    }
    removeArray(objects, s.objects);
    removeArray(doors, s.doors);
    removeArray(projections, s.projections);
    for (const owned of s.owned) owned.dispose?.();
    for (const child of s.g.children) if (child.isInstancedMesh) child.dispose();
    root.remove(s.g);
    const i = scopes.indexOf(s);
    if (i >= 0) scopes.splice(i, 1);
    cache.delete(s.sectionId);
  }
  function updateVisibility(position, exploring) {
    const nearby =
      Math.abs(position.x) < HQ.halfWidth + 180 && Math.abs(position.z - HQ.centerZ) < HQ.halfDepth + 180;
    const key = `${exploring && nearby}/${Math.round(position.y / 2)}/${Math.floor(position.x / 24)}/${Math.floor(position.z / 24)}`;
    if (key !== lastStreamKey) {
      lastStreamKey = key;
      const wanted =
        exploring && nearby
          ? sectionsForPosition(position, LOAD_RADIUS)
              .sort((a, b) => {
                const pa = transform(wingFrame(a.wing, a.y), a.u, 0),
                  pb = transform(wingFrame(b.wing, b.y), b.u, 0);
                return (
                  Math.hypot(pa.x - position.x, pa.z - position.z) +
                  Math.abs(a.y - position.y) * 24 -
                  (Math.hypot(pb.x - position.x, pb.z - position.z) + Math.abs(b.y - position.y) * 24)
                );
              })
              .slice(0, MAX_SECTIONS)
          : [];
      const ids = new Set(wanted.map((s) => s.id));
      for (const s of [...cache.values()]) if (!ids.has(s.sectionId)) dispose(s);
      for (const section of wanted) if (!cache.has(section.id)) buildSection(section);
    }
    for (const s of floorScopes)
      s.g.visible = exploring && nearby && Math.abs(s.y - position.y) < STOREY * 1.5;
    const inRangeBand =
      exploring && nearby && position.y >= HQ_RANGE.y - STOREY && position.y <= HQ_RANGE.top + STOREY;
    for (const s of rangeGraphics) s.g.visible = inRangeBand;
    for (const s of rangeFloorPreviews)
      s.g.visible = inRangeBand && Math.abs(s.y - position.y) >= STOREY * 1.5;
    for (const s of coreScopes)
      s.g.visible = exploring && nearby && Math.abs(s.y - position.y) < STOREY * 1.5;
    for (const s of stairScopes) s.g.visible = exploring && nearby && Math.abs(s.y - position.y) < 10;
    for (const s of foundations) s.g.visible = exploring && Math.abs(position.y - basementY) < 8;
    for (const s of roofScopes) s.g.visible = !exploring || position.y > HQ.roof - 12;
    lobby.g.visible = exploring && nearby && position.y < 20 && position.y > -5;
    for (const s of atriumScopes)
      s.g.visible =
        exploring && nearby && position.y >= HQ_ATRIUM.y - STOREY && position.y <= HQ_ATRIUM.top + STOREY;
    gateScope.g.visible = true;
    roof.g.visible = !exploring || position.y > HQ.roof - 12;
    for (const item of lifts) item.cabin.visible = exploring && nearby && Math.abs(item.y - position.y) < 10;
    for (const s of facilityScopes) {
      const spec = s.facility;
      s.g.visible = exploring && nearby && position.y >= spec.y - STOREY && position.y <= spec.top + STOREY;
    }
    for (const s of facilityGalleryScopes)
      s.g.visible = exploring && nearby && Math.abs(position.y - s.y) < STOREY * 1.5;
  }
  updateVisibility({ x: 0, y: 0, z: HQ.front + 52 }, false);
  return {
    root,
    objects,
    doors,
    liftDoors,
    lift,
    lifts,
    facilities: HQ_SPECIAL_FACILITIES,
    projections,
    updateVisibility,
    get diagnostics() {
      return {
        rooms: HQ_ROOMS.length,
        floors: HQ_STOPS.length,
        occupiedFloors: HQ_FLOORS.length,
        wings: 4,
        totalSections: HQ_SECTIONS.length,
        loadedSections: cache.size,
        loadedRooms: [...cache.values()].reduce((n, s) => n + s.section.rooms.length, 0),
        objects: objects.length,
        doors: doors.length,
        stairFlights: transit.totalStairFlights,
        stairFlightsPerCore: transit.flightsPerCore,
        stairCores: HQ_CORES.length,
        liftCores: lifts.length,
        specialFacilities: HQ_SPECIAL_FACILITIES.length,
        instances: scopes.reduce((n, s) => n + s.instances, 0),
        range: {
          floor: HQ_RANGE.floor,
          y: HQ_RANGE.y,
          top: HQ_RANGE.top,
          width: HQ_RANGE.maxU - HQ_RANGE.minU,
          depth: HQ_RANGE.vMax - HQ_RANGE.vMin,
        },
        streaming: true,
        maxLoadedSections: MAX_SECTIONS,
        cacheLimit: MAX_SECTIONS,
      };
    },
  };
}
