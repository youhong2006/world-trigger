import { BASE } from './city-layout.js';

// All interior dimensions are metres. Floor assignments and dimensions are original game design (C).
export const HQ = Object.freeze({
  floor: BASE.floorHeight * BASE.scale,
  roof: (BASE.height + BASE.floorHeight) * BASE.scale,
  minX: -64,
  maxX: 64,
  back: 182,
  front: 251,
  entry: { x: 0, z: 254, y: BASE.floorHeight * BASE.scale },
  lift: { x: 43, z: 198, w: 4, d: 4 },
  stair: { minX: 48, maxX: 62, minZ: 190, maxZ: 208 },
});
export const HQ_FLOORS = [
  ['B2', -8, '遠征艇・物流', ['遠征艇整備庫', '物流倉庫', '設備機房', '物流值班室']],
  ['B1', -4, '技術・維護', ['觸發器開發室', '裝備維修室', '技術資料室', '技術會議室']],
  ['1F', 0, '入口・公共設施', ['接待大廳', '食堂', '交誼廳', '醫務室']],
  ['2F', 4, '訓練大廳・射擊', ['狙擊訓練室', '射擊練習室', '個人排名戰大廳', '訓練準備室']],
  ['3F', 8, '訓練上層・觀戰', ['訓練室 301', '訓練室 302', '觀戰迴廊', '訓練室 303']],
  ['4F', 12, '小隊・隊員生活', ['小隊作戰室 A', '小隊作戰室 B', '隊員宿舍', '健身房']],
  ['5F', 16, '戰術・研習', ['小隊作戰室 C', '立體投影會議室', '自習室', '隊員休息室']],
  ['6F', 20, '指揮・管理', ['指揮中心', '操作員室', '高層會議室', '任務簡報室']],
].map(([id, offset, name, names]) => ({ id, y: HQ.floor + offset, name, names, evidence: 'C' }));
export const HQ_STOPS = [...HQ_FLOORS, { id: 'RF', y: HQ.roof, name: '頂樓・通訊設備', evidence: 'C' }];
export function floorAt(y) {
  return HQ_STOPS.reduce((a, b) => (Math.abs(a.y - y) < Math.abs(b.y - y) ? a : b));
}
export const HQ_ROOMS = HQ_FLOORS.flatMap((f) =>
  f.names.map((name, i) => ({
    id: `${f.id}-${i + 1}`,
    floor: f.id,
    y: f.y,
    name,
    x: i % 2 === 0 ? -25 : 25,
    z: i < 2 ? 231 : 201,
    w: 44,
    d: i < 2 ? 18 : 22,
    doorX: i % 2 === 0 ? -18 : 18,
    doorZ: i < 2 ? 221.8 : 212.2,
    evidence: /訓練|射擊|指揮|作戰|會議/.test(name) ? 'A / C 配置' : 'C',
  })),
);

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
