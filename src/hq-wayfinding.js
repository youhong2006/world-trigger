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

export function transitCores() {
  return (
    Layout.HQ_CORES ?? [{ id: 'main', name: '南側主電梯', code: 'T-S', wing: 'front', ...Layout.HQ.lift }]
  );
}
export function nearestCore(position) {
  const wing = wingIdAt(position);
  return transitCores().reduce((best, core) => {
    const score = (c) => Math.hypot(position.x - c.x, position.z - c.z) + (c.wing === wing ? 0 : 180);
    return score(core) < score(best) ? core : best;
  });
}
export function importantFacilities() {
  const special = (Layout.HQ_SPECIAL_FACILITIES ?? []).map((f) => ({
    ...f,
    ...Layout.wingPoint(f.wing, f.y, f.u ?? 0, f.v ?? 0),
    facilityId: f.id,
  }));
  const range = Layout.HQ_RANGE,
    atrium = Layout.HQ_ATRIUM;
  if (atrium)
    special.push({
      id: 'rank-atrium',
      code: 'TR-01',
      name: '個人排名戰大廳',
      floor: atrium.floor,
      y: atrium.y,
      top: atrium.top,
      wing: 'front',
      x: (atrium.minX + atrium.maxX) / 2,
      z: Layout.wingFrame('front', atrium.y).z,
      w: atrium.maxX - atrium.minX,
      d: atrium.maxZ - atrium.minZ,
    });
  if (range)
    special.push({
      id: 'shooting-range',
      code: 'TR-02',
      name: '大型實體射擊訓練場',
      floor: range.floor,
      wing: 'front',
      ...Layout.wingPoint('front', range.y, -144, range.boothV),
      top: range.top,
      w: range.maxU - range.minU,
      d: range.vMax - range.vMin,
      mapPoint: Layout.wingPoint('front', range.y, (range.minU + range.maxU) / 2, 0),
    });
  return special;
}
export function facilityAt(position) {
  return (
    importantFacilities().find((f) => {
      if (position.y < f.y - 0.2 || position.y >= f.top) return false;
      const center = f.mapPoint ?? f,
        angle = Layout.wingFrame(f.wing, f.y).rotation;
      const dx = position.x - center.x,
        dz = position.z - center.z;
      return (
        Math.abs(dx * Math.cos(angle) - dz * Math.sin(angle)) <= f.w / 2 &&
        Math.abs(dx * Math.sin(angle) + dz * Math.cos(angle)) <= f.d / 2
      );
    }) ?? null
  );
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
// crossing between room rows happens in transverse alleys, never through a neighbour's wall.
function computeRouteStep(from, destination) {
  const floor = Layout.floorAt(from.y),
    vertical = Math.abs(destination.y - from.y) > 2;
  const core = transitCores().find((c) => c.id === destination.coreId) ?? nearestCore(from);
  let goal = vertical
    ? {
        x: core.x,
        y: floor.y,
        z: core.z + 7,
        name: core.name ?? '服務電梯',
        wing: core.wing,
        coreId: core.id,
      }
    : destination;
  const current = wingIdAt(from);
  const wantsLift = vertical || destination.transit === 'lift' || !!destination.coreId;
  const finish = (point, label) => ({
    point,
    label: vertical ? `${label} → ${destination.floor ?? Layout.floorAt(destination.y).id}` : label,
    vertical,
  });
  if (wantsLift && current === core.wing) {
    const door = { x: core.x, y: floor.y, z: core.z + 7 };
    if (Math.abs(from.x - core.x) < 2 && Math.abs(from.z - core.z) < 2.5)
      return finish({ ...from }, `使用 ${core.code ?? core.name} 轎廂面板`);
    if (Math.hypot(from.x - door.x, from.z - door.z) < 1.5)
      return finish(door, `進入 ${core.name}，使用選層面板`);
    if (from.x >= core.x - 9 && from.x <= core.x + 27 && from.z >= core.z + 13 && from.z <= core.z + 20)
      return finish(
        { x: core.x, y: floor.y, z: Math.abs(from.x - core.x) > 1 ? core.z + 14 : core.z + 7 },
        `由前側進入 ${core.name}`,
      );
    if (Math.abs(from.x - (core.x + 21)) < 1.25 && Math.abs(from.z - core.z) < 80)
      return finish({ x: core.x + 21, y: floor.y, z: core.z + 14 }, `沿服務通道前往 ${core.name}`);
    goal = { ...goal, x: core.x + 21, z: core.z + 14, wing: core.wing };
  }
  const target = goal.wing ?? wingIdAt(goal);
  if (!WING_ORDER.includes(current) || !WING_ORDER.includes(target)) return finish(goal, goal.name);

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
      ...transitCores().flatMap((core) => {
        const points = [local({ x: core.x - 11, z: core.z - 14 }), local({ x: core.x + 25, z: core.z + 16 })];
        return [Math.min(...points.map((p) => p.u)) - 1, Math.max(...points.map((p) => p.u)) + 1];
      }),
      ...blocking.flatMap((r) => [r.sectionU + r.x - r.w / 2 - 1.6, r.sectionU + r.x + r.w / 2 + 1.6]),
    ];
    const valid = candidates.filter(
      (u) =>
        predicate(u) &&
        Math.abs(u) < frame.halfLength - 3 &&
        !blocking.some((r) => Math.abs(u - r.sectionU - r.x) < r.w / 2 + 0.65),
    );
    // Every shaft and stairwell is approached from its marked service lobby.
    const safe = valid.filter((u) => {
      const a = world(u, v0),
        b = world(u, v1);
      return !transitCores().some(
        (core) =>
          Math.max(a.x, b.x) > core.x - 9 &&
          Math.min(a.x, b.x) < core.x + 23 &&
          Math.max(a.z, b.z) > core.z - 12 &&
          Math.min(a.z, b.z) < core.z + 13,
      );
    });
    return (safe.length ? safe : valid).sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0] ?? near;
  };
  const changeCorridor = (v, near = start.u, predicate) => {
    const u = crossU(start.v, v, near, predicate);
    return Math.abs(start.u - u) > 1
      ? finish(world(u, start.v), '沿走廊前往橫向通道')
      : finish(world(u, v), '由橫向通道換廊');
  };
  for (const special of Layout.HQ_SPECIAL_FACILITIES ?? []) {
    if (current !== special.wing || floor.y <= special.y || floor.y >= special.top) continue;
    const lo = special.u - special.w / 2,
      hi = special.u + special.w / 2;
    const crosses = Math.min(start.u, goalLocal.u) < hi && Math.max(start.u, goalLocal.u) > lo;
    if (!crosses) continue;
    const right = goalLocal.u > (lo + hi) / 2,
      entrance = right ? lo + 2 : hi - 2,
      exit = right ? hi - 2 : lo + 2;
    const edge = (special.v ?? 0) + special.d / 2 - 2;
    let p;
    if (right ? start.u < lo + 0.5 : start.u > hi - 0.5) p = { u: entrance, v: special.v ?? 0 };
    else if (Math.abs(start.u - exit) < 1.2)
      p =
        Math.abs(start.v - (special.v ?? 0)) > 1
          ? { u: exit, v: special.v ?? 0 }
          : { u: right ? hi + 1.5 : lo - 1.5, v: special.v ?? 0 };
    else if (Math.abs(start.v - edge) > 1) p = { u: entrance, v: edge };
    else p = { u: exit, v: edge };
    return finish(world(p.u, p.v), `沿 ${special.code} ${special.name} 上層迴廊前進`);
  }
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

// A ring corridor can intersect a transit core as the shell tapers higher up.
// Route around the actual shaft/stair envelope, leaving the +Z lift lobby and
// east stair approach outside the obstacle. Visibility graph corners keep the
// detour safe for either direction and for adjacent wings.
function avoidTransitCores(from, step) {
  const goal = step.point;
  const contains = (r, p) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;
  const rectangles = transitCores()
    .map((core) => ({
      core,
      minX: core.x - 6.2,
      maxX: core.x + 20.2,
      minZ: core.z - 13.2,
      // The call console sits at z+12; include it rather than routing through it.
      maxZ: core.z + 14.2,
    }))
    .filter((r) => !contains(r, from) && !contains(r, goal));
  const crosses = (a, b, r) => {
    // Clip to the open interior, allowing an unobstructed segment along an edge.
    let lo = 0,
      hi = 1;
    for (const axis of ['x', 'z']) {
      const delta = b[axis] - a[axis],
        min = r[axis === 'x' ? 'minX' : 'minZ'] + 0.01,
        max = r[axis === 'x' ? 'maxX' : 'maxZ'] - 0.01;
      if (Math.abs(delta) < 1e-8) {
        if (a[axis] <= min || a[axis] >= max) return false;
      } else {
        const t0 = (min - a[axis]) / delta,
          t1 = (max - a[axis]) / delta;
        lo = Math.max(lo, Math.min(t0, t1));
        hi = Math.min(hi, Math.max(t0, t1));
        if (lo >= hi) return false;
      }
    }
    return lo < hi;
  };
  const obstruction = rectangles.find((r) => crosses(from, goal, r));
  if (!obstruction) return step;
  const points = [
    from,
    goal,
    ...rectangles.flatMap((r) => [
      { x: r.minX, z: r.minZ },
      { x: r.maxX, z: r.minZ },
      { x: r.maxX, z: r.maxZ },
      { x: r.minX, z: r.maxZ },
    ]),
  ];
  const distance = points.map(() => Infinity),
    previous = points.map(() => -1),
    done = new Set();
  distance[0] = 0;
  while (done.size < points.length) {
    let next = -1;
    for (let i = 0; i < points.length; i++)
      if (!done.has(i) && (next < 0 || distance[i] < distance[next])) next = i;
    if (next < 0 || !Number.isFinite(distance[next]) || next === 1) break;
    done.add(next);
    for (let i = 0; i < points.length; i++) {
      if (done.has(i) || rectangles.some((r) => crosses(points[next], points[i], r))) continue;
      const candidate =
        distance[next] + Math.hypot(points[i].x - points[next].x, points[i].z - points[next].z);
      if (candidate < distance[i]) {
        distance[i] = candidate;
        previous[i] = next;
      }
    }
  }
  let next = 1;
  if (previous[next] < 0) return step;
  const indices = [next];
  while (previous[next] > 0) {
    next = previous[next];
    indices.unshift(next);
  }
  const detour = indices.map((i) => ({ ...points[i], y: goal.y }));
  return {
    ...step,
    point: detour[0],
    detour,
    label: `沿服務通道繞過 ${obstruction.core.code} ${obstruction.core.name}${step.vertical ? ' → ' + step.label : ''}`,
  };
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
      Math.hypot(from.x - pendingRoute.last.x, from.z - pendingRoute.last.z) > 24)
  )
    pendingRoute = null;
  if (
    pendingRoute &&
    Math.hypot(from.x - pendingRoute.step.point.x, from.z - pendingRoute.step.point.z) < 0.85
  ) {
    if (pendingRoute.remaining.length) {
      pendingRoute.step = { ...pendingRoute.step, point: pendingRoute.remaining.shift() };
      pendingRoute.origin = { ...from };
    } else pendingRoute = null;
  }
  if (pendingRoute) {
    pendingRoute.last = { ...from };
    return pendingRoute.step;
  }
  const step = avoidTransitCores(from, computeRouteStep(from, destination));
  if (Math.hypot(from.x - step.point.x, from.z - step.point.z) > 0.85)
    pendingRoute = {
      key,
      floor,
      step,
      remaining: step.detour?.slice(1) ?? [],
      origin: { ...from },
      last: { ...from },
    };
  return step;
}
