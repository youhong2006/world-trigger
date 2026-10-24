import { BASE } from './city-layout.js';

// Facility types follow the supplied references; all dimensions, floors and zoning below are game design (C).
export const HQ = Object.freeze({
  floor: 0,
  roof: 350,
  halfWidth: 624,
  halfDepth: 400,
  centerZ: -150,
  wingDepth: BASE.wallThickness * BASE.scale,
  storeyHeight: BASE.storeyHeight,
  roomHeight: BASE.storeyHeight - 0.3,
  basementY: -BASE.basementDepth,
  insetX: 49.92,
  insetZ: 32,
  minX: -624,
  maxX: 624,
  back: -550,
  front: 250,
  entry: { x: 0, y: 0, z: 256 },
  gate: { x: 0, y: 0, z: 247.5, w: 14, h: 18 },
  lift: { x: 43, z: 198, w: 4, d: 4 },
  stair: { minX: 48, maxX: 62, minZ: 192, maxZ: 206 },
});
// Four permanent, independently operated vertical circulation nodes.
export const HQ_CORES = [
  { id: 'main', code: 'T01', name: '正面交通核心', wing: 'front', x: 43, z: 198 },
  { id: 'east', code: 'T02', name: '東側交通核心', wing: 'right', x: 520, z: -150 },
  { id: 'north', code: 'T03', name: '北側交通核心', wing: 'back', x: 0, z: -440 },
  { id: 'west', code: 'T04', name: '西側交通核心', wing: 'left', x: -520, z: -150 },
].map((c) =>
  Object.freeze({
    ...c,
    stairX: c.x + 12,
    stairZ: c.z + 1,
    approach: { x: c.x + 21, z: c.z + 14 },
    bounds: { minX: c.x - 8, maxX: c.x + 23, minZ: c.z - 12, maxZ: c.z + 16 },
  }),
);
export const HQ_CORE_HOLES = HQ_CORES.flatMap((c) => [
  { x0: c.x - 2, x1: c.x + 2, z0: c.z - 2, z1: c.z + 2 },
  { x0: c.x + 5, x1: c.x + 19, z0: c.z - 6, z1: c.z + 8 },
]);
export const HQ_RANGE = Object.freeze({
  floor: '7F',
  y: 36,
  top: 60,
  minU: -520,
  maxU: 450,
  vMin: -72,
  vMax: 72,
  laneSpacing: 12,
  targetV: -64,
  boothV: 65,
});
export const HQ_ATRIUM = Object.freeze({
  floor: '2F',
  y: 6,
  top: 18,
  minX: -180,
  maxX: -108,
  minZ: 141,
  maxZ: 197,
});
export const HQ_WINGS = ['front', 'right', 'back', 'left'];
export const HQ_WING_NAMES = {
  front: '南側・正面翼',
  right: '東側翼',
  back: '北側翼',
  left: '西側翼',
  courtyard: '中央中庭',
};
export function envelopeAt(y = 0) {
  const t = Math.max(0, Math.min(1, y / HQ.roof));
  const outerHalfW = HQ.halfWidth - HQ.insetX * t,
    outerHalfD = HQ.halfDepth - HQ.insetZ * t;
  const innerHalfW = outerHalfW - HQ.wingDepth,
    innerHalfD = outerHalfD - HQ.wingDepth;
  return {
    outerHalfW,
    outerHalfD,
    innerHalfW,
    innerHalfD,
    left: -outerHalfW,
    right: outerHalfW,
    front: HQ.centerZ + outerHalfD,
    back: HQ.centerZ - outerHalfD,
    innerFront: HQ.centerZ + innerHalfD,
    innerBack: HQ.centerZ - innerHalfD,
    innerLeft: -innerHalfW,
    innerRight: innerHalfW,
    halfWidth: outerHalfW,
    halfDepth: outerHalfD,
    thickness: HQ.wingDepth,
    wingDepth: HQ.wingDepth,
  };
}
export function wingFrame(wing, y = 0) {
  const e = envelopeAt(y),
    half = HQ.wingDepth / 2;
  if (wing === 'front')
    return { x: 0, z: e.front - half, rotation: 0, halfLength: e.outerHalfW, depth: HQ.wingDepth };
  if (wing === 'back')
    return { x: 0, z: e.back + half, rotation: Math.PI, halfLength: e.outerHalfW, depth: HQ.wingDepth };
  if (wing === 'right')
    return {
      x: e.right - half,
      z: HQ.centerZ,
      rotation: Math.PI / 2,
      halfLength: e.innerHalfD,
      depth: HQ.wingDepth,
    };
  return {
    x: e.left + half,
    z: HQ.centerZ,
    rotation: -Math.PI / 2,
    halfLength: e.innerHalfD,
    depth: HQ.wingDepth,
  };
}
export function wingPoint(wing, y, u = 0, v = 0) {
  const f = wingFrame(wing, y),
    c = Math.cos(f.rotation),
    s = Math.sin(f.rotation);
  return { x: f.x + u * c + v * s, y, z: f.z - u * s + v * c };
}
export function wingAt(x, y, z) {
  const e = envelopeAt(y),
    az = Math.abs(z - HQ.centerZ);
  if (Math.abs(x) > e.outerHalfW + 0.1 || az > e.outerHalfD + 0.1) return null;
  if (z >= e.innerFront) return 'front';
  if (z <= e.innerBack) return 'back';
  if (x >= e.innerRight) return 'right';
  if (x <= e.innerLeft) return 'left';
  return 'courtyard';
}
export function isHQInterior(x, y, z) {
  return y >= HQ.basementY - 0.2 && y <= 352 && !!wingAt(x, y, z);
}
export function floorZone(number) {
  if (number < 0) return number === -2 ? '遠征・後勤' : '技術・維護';
  if (number <= 1) return '接待・公共';
  if (number <= 3) return '排名・訓練';
  if (number <= 6) return '小隊・戰術';
  if (number <= 10) return '大型射擊訓練';
  if (number <= 22) return '生活・住宿';
  if (number <= 34) return '戰鬥・訓練';
  if (number <= 44) return '技術・研發';
  if (number <= 50) return '運作・行政';
  if (number <= 56) return '作戰・情報';
  return '中央指揮';
}
const FACILITIES = {
  '遠征・後勤': [
    ['warehouse', '遠征物資整備室'],
    ['warehouse', '物流倉庫'],
    ['utilities', '設備機房'],
    ['workshop', '後勤維修室'],
  ],
  '技術・維護': [
    ['lab', '觸發器開發室'],
    ['workshop', '裝備維修室'],
    ['study', '技術資料室'],
    ['meeting', '技術會議室'],
  ],
  '接待・公共': [
    ['reception', '接待大廳'],
    ['cafeteria', '食堂'],
    ['lounge', '交誼廳'],
    ['medical', '醫務室'],
  ],
  '排名・訓練': [
    ['training', '個人訓練室'],
    ['observation', '訓練觀察室'],
    ['study', '訓練教室'],
    ['squad', '訓練準備室'],
  ],
  '小隊・戰術': [
    ['squad', '小隊作戰室'],
    ['meeting', '戰術會議室'],
    ['lounge', '隊員休息室'],
    ['gym', '健身房'],
  ],
  大型射擊訓練: [
    ['training', '射擊準備室'],
    ['observation', '射擊觀察室'],
    ['workshop', '靶場維護室'],
    ['study', '射擊資料室'],
  ],
  '生活・住宿': [
    ['dorm', '隊員宿舍'],
    ['cafeteria', '隊員食堂'],
    ['gym', '體能訓練室'],
    ['medical', '健康照護室'],
    ['lounge', '公共交誼廳'],
    ['study', '自習閱覽室'],
  ],
  '戰鬥・訓練': [
    ['training', '模擬訓練室'],
    ['squad', '戰術準備室'],
    ['observation', '訓練監控室'],
    ['gym', '動作訓練室'],
  ],
  '技術・研發': [
    ['lab', '觸發器研究室'],
    ['workshop', '精密維修室'],
    ['study', '技術文獻室'],
    ['meeting', '研發會議室'],
  ],
  '運作・行政': [
    ['meeting', '行政會議室'],
    ['operator', '設施運作室'],
    ['study', '檔案資料室'],
    ['lounge', '工作休息室'],
  ],
  '作戰・情報': [
    ['operator', '區域值勤室'],
    ['operator', '操作員工作室'],
    ['meeting', '作戰會議室'],
    ['squad', '任務簡報室'],
  ],
  中央指揮: [
    ['study', '指揮資料室'],
    ['operator', '情報監控中心'],
    ['meeting', '高層會議室'],
    ['squad', '緊急任務準備室'],
  ],
};
export const HQ_FLOORS = [
  -2,
  -1,
  ...Array.from({ length: Math.floor((HQ.roof - HQ.storeyHeight) / HQ.storeyHeight) + 1 }, (_, i) => i),
].map((number) => {
  const n = number >= 0 ? number + 1 : number,
    zone = floorZone(n);
  return {
    id: number < 0 ? `B${-number}` : `${number + 1}F`,
    number: n,
    y: number * HQ.storeyHeight,
    name: zone,
    zone,
    names: FACILITIES[zone].map((v) => v[1]),
    evidence: 'C',
  };
});
export const HQ_STOPS = [
  ...HQ_FLOORS,
  { id: 'RF', number: HQ_FLOORS.length - 1, y: HQ.roof, name: '頂樓・通訊設備', zone: '頂樓', evidence: 'C' },
];
export function floorAt(y) {
  return HQ_STOPS.reduce((a, b) => (Math.abs(a.y - y) <= Math.abs(b.y - y) ? a : b));
}
// The large facilities are unique volumes, rather than repeated ordinary room types.
export const HQ_SPECIAL_FACILITIES = [
  {
    id: 'command',
    code: 'CMD-01',
    kind: 'command',
    name: '中央指揮中心',
    floor: '57F',
    y: 336,
    top: 348,
    wing: 'back',
    u: 260,
    v: 0,
    w: 120,
    d: 100,
  },
  {
    id: 'hangar',
    code: 'HGR-01',
    kind: 'hangar',
    name: '地下遠征艇機庫',
    floor: 'B2',
    y: -12,
    top: 0,
    wing: 'back',
    u: -260,
    v: 0,
    w: 420,
    d: 140,
  },
  {
    id: 'research',
    code: 'LAB-01',
    kind: 'lab',
    name: '觸發器技術開發中心',
    floor: '35F',
    y: 204,
    top: 210,
    wing: 'right',
    u: 110,
    v: 0,
    w: 100,
    d: 90,
  },
  {
    id: 'briefing',
    code: 'BRF-01',
    kind: 'briefing',
    name: '立體投影戰術會議廳',
    floor: '5F',
    y: 24,
    top: 30,
    wing: 'front',
    u: -320,
    v: 0,
    w: 90,
    d: 80,
  },
  {
    id: 'lounge',
    code: 'LNG-01',
    kind: 'lounge',
    name: '隊員公共交誼廳',
    floor: '1F',
    y: 0,
    top: 6,
    wing: 'left',
    u: -110,
    v: 0,
    w: 100,
    d: 90,
  },
  {
    id: 'mess',
    code: 'MES-01',
    kind: 'mess',
    name: '隊員中央食堂',
    floor: '12F',
    y: 66,
    top: 72,
    wing: 'back',
    u: -260,
    v: 0,
    w: 110,
    d: 84,
  },
].map((f) =>
  Object.freeze({
    ...f,
    h: f.top - f.y,
    world: wingPoint(f.wing, f.y, f.u, f.v),
    rotation: wingFrame(f.wing, f.y).rotation,
    evidence: 'C',
  }),
);
export function specialFacilityBounds(f, inset = 0) {
  const side = f.wing === 'left' || f.wing === 'right',
    p = f.world ?? wingPoint(f.wing, f.y, f.u, f.v);
  const hw = (side ? f.d : f.w) / 2 - inset,
    hd = (side ? f.w : f.d) / 2 - inset;
  return { minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd };
}
export function specialFacilityAt(position) {
  return (
    HQ_SPECIAL_FACILITIES.find((f) => {
      const b = specialFacilityBounds(f);
      return (
        position.y >= f.y - 0.25 &&
        position.y < f.top - 0.15 &&
        position.x > b.minX &&
        position.x < b.maxX &&
        position.z > b.minZ &&
        position.z < b.maxZ
      );
    }) ?? null
  );
}
export const HQ_SECTIONS = HQ_FLOORS.flatMap((f) =>
  HQ_WINGS.flatMap((wing, wi) => {
    const e = envelopeAt(f.y),
      half = wing === 'front' || wing === 'back' ? e.outerHalfW - (f.y >= 298 ? 88 : 28) : e.innerHalfD - 24;
    const count = Math.ceil((half * 2) / 48),
      width = (half * 2) / count;
    return Array.from({ length: count }, (_, i) => {
      const u = -half + (i + 0.5) * width,
        id = `${f.id}-${wing}-${i + 1}`;
      const inRange =
        wing === 'front' &&
        f.y >= HQ_RANGE.y &&
        f.y < HQ_RANGE.top &&
        u + width / 2 > HQ_RANGE.minU &&
        u - width / 2 < HQ_RANGE.maxU;
      const atrium =
        wing === 'front' &&
        (f.id === '2F' || f.id === '3F') &&
        u - width / 2 < HQ_ATRIUM.maxX &&
        u + width / 2 > HQ_ATRIUM.minX;
      const lobby = wing === 'front' && f.y >= 0 && f.y < 18 && Math.abs(u) < width / 2 + 18;
      const special = HQ_SPECIAL_FACILITIES.some(
        (v) => v.wing === wing && f.y >= v.y && f.y < v.top && Math.abs(u - v.u) < v.w / 2 + width / 2,
      );
      const phase = ((Math.abs(f.number) + wi) % 3) - 1;
      const selected = [Math.floor(count * 0.24) + phase, Math.floor(count * 0.75) + phase].includes(i);
      const pool = FACILITIES[f.zone],
        side = (i + wi + Math.abs(f.number)) % 2 ? 1 : -1;
      const [type, name] = pool[(Math.abs(f.number) + wi + i) % pool.length];
      const rows =
        selected && !inRange && !atrium && !special
          ? [
              {
                id: `${id}-r1`,
                sectionId: id,
                sectionU: u,
                wing,
                floor: f.id,
                y: f.y,
                x: 0,
                z: side * ((i + wi) % 2 ? 58 : 36),
                w: 30 + (Math.abs(f.number) % 2) * 4,
                d: 18,
                corridorV: side * ((i + wi) % 2 ? 47 : 25),
                name: `${name} ${f.id}-${wi + 1}${String(i + 1).padStart(2, '0')}`,
                kind: type,
                variant: (i + wi + Math.abs(f.number)) % 9,
                rotation: side > 0 ? Math.PI : 0,
                evidence: 'C',
              },
            ]
          : [];
      const rooms = rows.filter((r) => {
        const p = wingPoint(wing, f.y, u, r.z),
          sideWing = wing === 'left' || wing === 'right',
          hw = (sideWing ? r.d : r.w) / 2,
          hd = (sideWing ? r.w : r.d) / 2;
        if (wing === 'front' && f.y >= 0 && f.y < 18 && Math.abs(p.x) < hw + 19) return false;
        if (
          HQ_CORES.some(
            (c) =>
              p.x + hw > c.bounds.minX - 4 &&
              p.x - hw < c.bounds.maxX + 4 &&
              p.z + hd > c.bounds.minZ - 4 &&
              p.z - hd < c.bounds.maxZ + 4,
          )
        )
          return false;
        if (
          wing === 'front' &&
          p.x + hw > 36 &&
          p.x - hw < 70 &&
          p.z + hd > wingFrame(wing, f.y).z - 6 &&
          p.z - hd < 214
        )
          return false;
        if (
          (wing === 'front' || wing === 'back') &&
          r.z < 0 &&
          Math.abs(Math.abs(p.x) - (e.outerHalfW - HQ.wingDepth / 2)) < hw + 6
        )
          return false;
        return true;
      });
      const kind = inRange
        ? f.y === HQ_RANGE.y
          ? 'range'
          : 'rangeGallery'
        : atrium
          ? f.id === '2F'
            ? 'atrium'
            : 'atriumGallery'
          : lobby
            ? 'lobby'
            : special
              ? 'facility'
              : rooms.length
                ? 'rooms'
                : 'concourse';
      return {
        id,
        floor: f.id,
        y: f.y,
        wing,
        u,
        w: width,
        kind,
        rooms,
        name: `${HQ_WING_NAMES[wing]} ${i + 1}區`,
        zone: f.zone,
      };
    });
  }),
);
export function roomWorldPosition(room) {
  return wingPoint(room.wing, room.y, room.sectionU + room.x, room.z);
}
export const HQ_ROOMS = HQ_SECTIONS.flatMap((s) =>
  s.rooms.map((r) => ({ ...r, world: roomWorldPosition(r) })),
);
export function sectionsForPosition(position, radius = 170) {
  const { x, y, z } = position,
    range = HQ_RANGE;
  return HQ_SECTIONS.filter((s) => {
    if (
      Math.abs(s.y - y) > HQ.storeyHeight + 0.25 &&
      !(s.kind === 'range' && y >= range.y - 1 && y <= range.top + 1)
    )
      return false;
    const f = wingFrame(s.wing, s.y),
      c = Math.cos(f.rotation),
      si = Math.sin(f.rotation),
      dx = x - f.x,
      dz = z - f.z;
    const u = dx * c - dz * si,
      v = dx * si + dz * c;
    return (
      Math.hypot(Math.max(0, Math.abs(u - s.u) - s.w / 2), Math.max(0, Math.abs(v) - HQ.wingDepth / 2)) <=
      radius
    );
  });
}

/** Convex rectangular frustum shared by visible geometry, body and camera sweeps. */
export function taperedVolume({ x, z, w, d, y, h, topX = x, topZ = z, topW = w, topD = d }) {
  const slope = (a, b) => (b - a) / h;
  const x0 = x - w / 2,
    x1 = x + w / 2,
    z0 = z - d / 2,
    z1 = z + d / 2;
  const tx0 = topX - topW / 2,
    tx1 = topX + topW / 2,
    tz0 = topZ - topD / 2,
    tz1 = topZ + topD / 2;
  const sx0 = slope(x0, tx0),
    sx1 = slope(x1, tx1),
    sz0 = slope(z0, tz0),
    sz1 = slope(z1, tz1);
  return {
    x: (Math.min(x0, tx0) + Math.max(x1, tx1)) / 2,
    z: (Math.min(z0, tz0) + Math.max(z1, tz1)) / 2,
    w: Math.max(x1, tx1) - Math.min(x0, tx0),
    d: Math.max(z1, tz1) - Math.min(z0, tz0),
    y,
    h,
    planes: [
      [1, -sx1, 0, x1 - sx1 * y],
      [-1, sx0, 0, -x0 + sx0 * y],
      [0, -sz1, 1, z1 - sz1 * y],
      [0, sz0, -1, -z0 + sz0 * y],
      [0, 1, 0, y + h],
      [0, -1, 0, -y],
    ],
    vertices: [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
      [tx0, y + h, tz0],
      [tx1, y + h, tz0],
      [tx1, y + h, tz1],
      [tx0, y + h, tz1],
    ],
  };
}
export function stairFlights() {
  const flights = [];
  let y = HQ_FLOORS[0].y,
    index = 0;
  while (y < HQ.roof - 0.001) {
    const rise = Math.min(2, HQ.roof - y),
      back = index % 2 === 0;
    flights.push({ index, y, rise, x: back ? 51 : 58, z: 199, d: 8, w: 2.8, back, steps: 12 });
    y += rise;
    index++;
  }
  return flights;
}
