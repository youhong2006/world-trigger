import * as Layout from './hq-layout.js';

export const WING_LABELS = Object.freeze({
  front: '正面・南翼',
  right: '右側・東翼',
  back: '後方・北翼',
  left: '左側・西翼',
});
const WING_ORDER = ['front', 'right', 'back', 'left'];
export function wingName(wing) {
  return WING_LABELS[typeof wing === 'string' ? wing : (wing?.wing ?? wing?.id)] ?? '中央連絡區';
}
export function floorFamily(floor) {
  if (floor.zoneName || floor.zone) return floor.zoneName ?? floor.zone;
  if (floor.id === 'RF') return '屋頂';
  if (floor.id.startsWith('B')) return '地下後勤';
  const n = parseInt(floor.id, 10);
  return n <= 6
    ? '公共與基礎設施'
    : n <= 12
      ? '射擊訓練與觀察'
      : n <= 28
        ? '隊員與生活'
        : n <= 44
          ? '戰鬥訓練'
          : n <= 60
            ? '技術與研發'
            : n <= 75
              ? '行政與支援'
              : '指揮與控制';
}
export function wingIdAt(position) {
  const wing = Layout.wingAt?.(position.x, position.y, position.z);
  if (typeof wing === 'string') return wing;
  if (wing) return wing.wing ?? wing.id ?? null;
  const x = Math.abs(position.x / 624),
    z = Math.abs((position.z + 150) / 400);
  return z >= x ? (position.z >= -150 ? 'front' : 'back') : position.x > 0 ? 'right' : 'left';
}
export function floorEnvelope(y) {
  const e = Layout.envelopeAt?.(y) ?? {};
  const t = Math.max(0, Math.min(1, y / 350));
  return {
    halfW: e.outerHalfW ?? e.halfW ?? 624 - 49.92 * t,
    halfD: e.outerHalfD ?? e.halfD ?? 400 - 32 * t,
    wingDepth: e.wingDepth ?? Layout.HQ.wingDepth ?? 160,
  };
}
export function roomPoint(room, section) {
  if (Layout.roomWorldPosition) return Layout.roomWorldPosition(room);
  if (room.world) return room.world;
  if (room.worldX !== undefined) return { x: room.worldX, y: room.y, z: room.worldZ };
  const s = section ?? (Layout.HQ_SECTIONS ?? []).find((s) => s.id === (room.sectionId ?? room.sectorId));
  if (s && Layout.wingFrame) {
    const f = Layout.wingFrame(s.wing, s.y),
      angle = f.rotation ?? 0,
      u = s.u + (room.x ?? 0),
      v = room.z ?? 0;
    return {
      x: f.x + u * Math.cos(angle) + v * Math.sin(angle),
      y: room.y ?? s.y,
      z: f.z - u * Math.sin(angle) + v * Math.cos(angle),
    };
  }
  return { x: room.x ?? 0, y: room.y ?? 0, z: room.z ?? 0 };
}
export function roomsOnFloor(id) {
  const sections = (Layout.HQ_SECTIONS ?? []).filter((s) => s.floor === id || s.floor?.id === id);
  if (sections.length)
    return sections.flatMap((s) =>
      (s.rooms ?? []).map((room) => ({
        ...room,
        wing: room.wing ?? s.wing,
        sectionId: room.sectionId ?? s.id,
        point: roomPoint(room, s),
      })),
    );
  return (Layout.HQ_ROOMS ?? [])
    .filter((room) => room.floor === id || room.floor?.id === id)
    .map((room) => ({ ...room, point: roomPoint(room) }));
}

// Room records remain data; the route cache holds only a handful of currently used floor/wing lists.
const routeRoomCache = new Map();
function wingRooms(floor, wing) {
  const key = `${floor}:${wing}`;
  if (!routeRoomCache.has(key)) {
    routeRoomCache.set(
      key,
      (Layout.HQ_ROOMS ?? []).filter((r) => r.floor === floor && r.wing === wing),
    );
    if (routeRoomCache.size > 12) routeRoomCache.delete(routeRoomCache.keys().next().value);
  }
  return routeRoomCache.get(key);
}
const corridorRows = [0, -25, 25, -47, 47, -71, 71];
const nearest = (values, value) =>
  values.reduce((a, b) => (Math.abs(a - value) <= Math.abs(b - value) ? a : b));

// Return the next walkable corridor segment. Rooms first lead to their own doorway;
// crossing between the six rows happens in transverse alleys, never through a neighbour's wall.
function computeRouteStep(from, destination) {
  const floor = Layout.floorAt(from.y),
    vertical = Math.abs(destination.y - from.y) > 2;
  let goal = vertical
    ? { x: Layout.HQ.lift.x, y: floor.y, z: Layout.HQ.lift.z + 7, name: '主電梯', wing: 'front' }
    : destination;
  const current = wingIdAt(from);
  const wantsLift = vertical || /主電梯/.test(destination.name ?? '');
  if (wantsLift && current === 'front') {
    if (Math.abs(from.x - Layout.HQ.lift.x) < 2 && Math.abs(from.z - Layout.HQ.lift.z) < 2.5)
      return {
        point: { ...from },
        label: `使用轎廂面板前往 ${destination.floor ?? Layout.floorAt(destination.y).id}`,
        vertical,
      };
    if (Math.hypot(from.x - Layout.HQ.lift.x, from.z - (Layout.HQ.lift.z + 7)) > 1.5) {
      // Approach the shaft from its front; the east-side service aisle avoids the stairs.
      goal = { ...goal, x: 64, z: 212 };
    }
  }
  const target = goal.wing ?? wingIdAt(goal);
  const finish = (point, label) => ({
    point,
    label: vertical ? `${label} → ${destination.floor ?? Layout.floorAt(destination.y).id}` : label,
    vertical,
  });
  if (!WING_ORDER.includes(current) || !WING_ORDER.includes(target)) return finish(goal, goal.name);
  if (wantsLift && current === 'front') {
    const atDoor = Math.hypot(from.x - Layout.HQ.lift.x, from.z - (Layout.HQ.lift.z + 7)) < 1.5;
    if (atDoor) return finish({ x: Layout.HQ.lift.x, y: floor.y, z: Layout.HQ.lift.z + 7 }, '使用電梯面板');
    if (from.x >= 34 && from.x <= 70 && from.z >= 211) {
      const z = Math.abs(from.x - Layout.HQ.lift.x) > 1 ? 212 : Layout.HQ.lift.z + 7;
      return finish({ x: Layout.HQ.lift.x, y: floor.y, z }, '由前側進入主電梯大廳');
    }
    if (Math.abs(from.x - 64) < 1.25 && from.z >= Layout.wingFrame('front', floor.y).z - 1)
      return finish({ x: 64, y: floor.y, z: 212 }, '沿服務通道前往電梯大廳');
  }

  const frame = Layout.wingFrame(current, floor.y),
    c = Math.cos(frame.rotation),
    sin = Math.sin(frame.rotation);
  const local = (p) => ({
    u: (p.x - frame.x) * c - (p.z - frame.z) * sin,
    v: (p.x - frame.x) * sin + (p.z - frame.z) * c,
  });
  const world = (u, v) => ({ x: frame.x + u * c + v * sin, y: floor.y, z: frame.z - u * sin + v * c });
  const start = local(from),
    rooms = wingRooms(floor.id, current);
  const roomAt = (p) =>
    rooms.find(
      (r) => Math.abs(p.u - r.sectionU - r.x) < r.w / 2 + 0.1 && Math.abs(p.v - r.z) < r.d / 2 + 0.1,
    );
  const startRoom = roomAt(start);
  if (
    startRoom &&
    (startRoom.id === destination.roomId || (current === target && roomAt(local(goal))?.id === startRoom.id))
  )
    return finish(goal, goal.name);
  if (startRoom) {
    const u = startRoom.sectionU + startRoom.x;
    if (Math.abs(start.u - u) > 0.75) return finish(world(u, start.v), '先對準房門');
    return finish(world(u, startRoom.corridorV ?? 0), '由房門返回走廊');
  }
  const e = floorEnvelope(floor.y),
    hw = e.halfW - e.wingDepth / 2,
    hd = e.halfD - e.wingDepth / 2;
  let goalLocal = local(goal),
    label = goal.name,
    cornerTurn = false;
  if (current !== target) {
    const parameter = (p, wing) =>
      wing === 'front'
        ? p.x + hw
        : wing === 'right'
          ? 2 * hw + hd - (p.z + 150)
          : wing === 'back'
            ? 2 * hw + 2 * hd + hw - p.x
            : 4 * hw + 2 * hd + p.z + 150 + hd;
    const perimeter = 4 * (hw + hd),
      clockwise = (parameter(goal, target) - parameter(from, current) + perimeter) % perimeter;
    const forward = clockwise <= perimeter / 2,
      a = WING_ORDER.indexOf(current);
    const corners = [
      { x: -hw, z: -150 + hd },
      { x: hw, z: -150 + hd },
      { x: hw, z: -150 - hd },
      { x: -hw, z: -150 - hd },
    ];
    const corner = { ...corners[forward ? (a + 1) % 4 : a] },
      direction = forward ? (a + 1) % 4 : (a + 3) % 4,
      offset = e.wingDepth / 2 + 4;
    if (direction === 0) corner.x += forward ? offset : -offset;
    if (direction === 1) corner.z += forward ? -offset : offset;
    if (direction === 2) corner.x += forward ? -offset : offset;
    if (direction === 3) corner.z += forward ? offset : -offset;
    goalLocal = local(corner);
    // Reach the intersection on the current main corridor before turning into the next wing.
    const turnU = current === 'front' || current === 'back' ? (forward ? hw : -hw) : forward ? hd : -hd;
    if (Math.abs(start.u - turnU) > 2) goalLocal = { u: turnU, v: 0 };
    else cornerTurn = true;
    label = `沿環形走廊前往${wingName(target)}`;
  }
  if (cornerTurn) return finish(world(goalLocal.u, goalLocal.v), label);
  const destinationRoom = current === target ? roomAt(goalLocal) : null;
  const goalCorridor = destinationRoom?.corridorV ?? 0;
  const crossU = (v0, v1, near, predicate = () => true) => {
    const minV = Math.min(v0, v1),
      maxV = Math.max(v0, v1);
    const blocking = rooms.filter((r) => r.z + r.d / 2 > minV + 0.5 && r.z - r.d / 2 < maxV - 0.5);
    const candidates = [
      near,
      ...blocking.flatMap((r) => [r.sectionU + r.x - r.w / 2 - 1.6, r.sectionU + r.x + r.w / 2 + 1.6]),
    ];
    const valid = candidates.filter(
      (u) =>
        predicate(u) &&
        Math.abs(u) < frame.halfLength - 3 &&
        !blocking.some((r) => Math.abs(u - r.sectionU - r.x) < r.w / 2 + 0.65),
    );
    // The lift/stair lobby is a service corridor, but its shaft is not a cross passage.
    const safe = valid.filter(
      (u) =>
        current !== 'front' ||
        u < 34 ||
        u > 68 ||
        Math.max(v0, v1) < 186 - frame.z ||
        Math.min(v0, v1) > 212 - frame.z,
    );
    return (safe.length ? safe : valid).sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0] ?? near;
  };
  const changeCorridor = (v, near = start.u, predicate) => {
    const u = crossU(start.v, v, near, predicate);
    return Math.abs(start.u - u) > 1
      ? finish(world(u, start.v), '沿走廊前往橫向通道')
      : finish(world(u, v), '由橫向通道換廊');
  };
  const atrium = Layout.HQ_ATRIUM;
  if (current === 'front' && atrium && Math.abs(floor.y - atrium.y - (Layout.HQ.storeyHeight ?? 6)) < 0.1) {
    const lo = atrium.minX,
      hi = atrium.maxX,
      z = Layout.wingFrame('front', atrium.y).z,
      outer = atrium.maxZ - 1.4;
    const across = (from.x < hi && goalLocal.u > lo) || (from.x > lo && goalLocal.u < hi);
    if (across) {
      const right = goalLocal.u > (lo + hi) / 2;
      const entrance = right ? lo + 1.4 : hi - 1.4,
        exit = right ? hi - 1.4 : lo + 1.4;
      let p;
      if (right ? from.x < lo + 0.5 : from.x > hi - 0.5) p = { x: entrance, z };
      else if (Math.abs(from.x - exit) < 1.2)
        p = Math.abs(from.z - z) > 1 ? { x: exit, z } : { x: right ? hi + 1.5 : lo - 1.5, z };
      else if (Math.abs(from.z - outer) > 1) p = { x: entrance, z: outer };
      else p = { x: exit, z: outer };
      return finish({ ...p, y: floor.y }, '沿排名大廳上層觀戰迴廊前進');
    }
  }
  const range = Layout.HQ_RANGE;
  const rangeHere = current === 'front' && range && floor.y >= range.y && floor.y < range.top;
  if (rangeHere) {
    const inside = (u) => u > range.minU - 1 && u < range.maxU + 1;
    const crosses =
      Math.min(start.u, goalLocal.u) < range.maxU && Math.max(start.u, goalLocal.u) > range.minU;
    if (inside(start.u) || inside(goalLocal.u) || crosses) {
      const gallery = floor.y === range.y ? range.vMax + 3 : range.vMin - 3;
      if (Math.abs(start.v - gallery) > 1) {
        const near = inside(start.u) ? start.u : start.u < range.minU ? range.minU - 5 : range.maxU + 5;
        return changeCorridor(
          gallery,
          near,
          inside(start.u)
            ? undefined
            : (u) => (start.u < range.minU ? u < range.minU - 1 : u > range.maxU + 1),
        );
      }
      if (inside(goalLocal.u)) {
        if (Math.abs(start.u - goalLocal.u) > 1)
          return finish(world(goalLocal.u, gallery), '沿靶場觀察通道前進');
        return finish(world(goalLocal.u, goalLocal.v), label);
      }
      const edge = goalLocal.u < range.minU ? range.minU - 5 : range.maxU + 5;
      const cross = crossU(gallery, goalCorridor, edge, (u) =>
        goalLocal.u < range.minU ? u < range.minU - 1 : u > range.maxU + 1,
      );
      if (Math.abs(start.u - cross) > 1) return finish(world(cross, gallery), '沿觀察通道繞過靶區');
      return finish(world(cross, goalCorridor), '由靶場返回環形走廊');
    }
  }
  const corridor = nearest(corridorRows, start.v);
  if (Math.abs(start.v - corridor) > 1.5) return changeCorridor(corridor);
  if (Math.abs(corridor - goalCorridor) > 1) {
    // Return to the primary corridor before selecting a different row near the destination.
    if (corridor !== 0) return changeCorridor(0);
    return changeCorridor(goalCorridor, goalLocal.u);
  }
  if (Math.abs(start.u - goalLocal.u) > 1) return finish(world(goalLocal.u, goalCorridor), label);
  return finish(world(goalLocal.u, goalLocal.v), label);
}

// Keep the current straight segment while crossing an aisle. Without this, snapping
// to the nearest parallel corridor halfway across would point the player backwards.
let pendingRoute = null;
export function resetRoute() {
  pendingRoute = null;
}
export function routeStep(from, destination) {
  const key = `${destination.roomId ?? ''}:${destination.x}:${destination.y}:${destination.z}:${destination.name ?? ''}`;
  const floor = Layout.floorAt(from.y).id;
  let offSegment = 0;
  if (pendingRoute) {
    const a = pendingRoute.origin,
      b = pendingRoute.step.point,
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((from.x - a.x) * dx + (from.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    offSegment = Math.hypot(from.x - a.x - dx * t, from.z - a.z - dz * t);
  }
  if (
    pendingRoute &&
    (pendingRoute.key !== key ||
      pendingRoute.floor !== floor ||
      offSegment > 4 ||
      Math.hypot(from.x - pendingRoute.last.x, from.z - pendingRoute.last.z) > 24 ||
      Math.hypot(from.x - pendingRoute.step.point.x, from.z - pendingRoute.step.point.z) < 0.85)
  )
    pendingRoute = null;
  if (pendingRoute) {
    pendingRoute.last = { ...from };
    return pendingRoute.step;
  }
  const step = computeRouteStep(from, destination);
  if (Math.hypot(from.x - step.point.x, from.z - step.point.z) > 0.85)
    pendingRoute = { key, floor, step, origin: { ...from }, last: { ...from } };
  return step;
}
