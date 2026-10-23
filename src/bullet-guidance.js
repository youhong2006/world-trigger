import { PATH_TEMPLATES } from './trajectory-plan.js';
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (p) => Math.hypot(p.x, p.y, p.z);
const unit = (p) => {
  const n = length(p) || 1;
  return { x: p.x / n, y: p.y / n, z: p.z / n };
};
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export function trackingStrength(params, progress) {
  const strengths = {
    high: [1, 1, 1],
    medium: [0.5, 0.5, 0.5],
    low: [0.08, 0.08, 0.08],
    'high-low-low': [1, 0.08, 0.08],
    'low-high-low': [0.08, 1, 0.08],
    'low-low-high': [0.08, 0.08, 1],
    custom: params.trackingCustom,
  };
  return (strengths[params.tracking] ?? strengths.medium)[Math.min(2, Math.max(0, Math.floor(progress * 3)))];
}
export function turnToward(velocity, direction, angle) {
  const speed = length(velocity),
    a = unit(velocity),
    b = unit(direction),
    cos = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)),
    total = Math.acos(cos);
  if (length(direction) < 1e-8 || !speed) return { ...velocity };
  if (total <= angle) return { x: b.x * speed, y: b.y * speed, z: b.z * speed };
  let tangent = unit({ x: b.x - a.x * cos, y: b.y - a.y * cos, z: b.z - a.z * cos });
  if (length(tangent) < 1e-6)
    tangent = unit(Math.abs(a.y) < 0.9 ? { x: -a.z, y: 0, z: a.x } : { x: 1, y: 0, z: 0 });
  return {
    x: (a.x * Math.cos(angle) + tangent.x * Math.sin(angle)) * speed,
    y: (a.y * Math.cos(angle) + tangent.y * Math.sin(angle)) * speed,
    z: (a.z * Math.cos(angle) + tangent.z * Math.sin(angle)) * speed,
  };
}
export function createGuidance(type, params, origin, point, targetId, paths = [], index = 0) {
  if (!['viper', 'hound'].includes(type)) return null;
  const d = sub(point, origin),
    distance = length(d),
    forward = unit(d),
    horizontal = Math.hypot(d.x, d.z),
    right = horizontal > 1e-6 ? { x: -d.z / horizontal, y: 0, z: d.x / horizontal } : { x: 1, y: 0, z: 0 };
  let waypoints = [];
  if (type === 'viper') {
    const source =
      params.routeSource === 'custom'
        ? paths.find((p) => p.id === params.pathId)?.points
        : PATH_TEMPLATES[params.routePreset]?.points;
    const points = source ?? PATH_TEMPLATES.direct.points,
      first = points[0],
      last = points.at(-1),
      span = last[2] - first[2];
    waypoints = points.slice(1).map((p, i) => {
      const t = Math.abs(span) > 1e-6 ? (p[2] - first[2]) / span : (i + 1) / (points.length - 1),
        base = mix(origin, point, t),
        side = p[0] - (first[0] + (last[0] - first[0]) * t),
        height = p[1] - (first[1] + (last[1] - first[1]) * t);
      return { x: base.x + right.x * side, y: base.y + height, z: base.z + right.z * side };
    });
  } else {
    const route = params.houndRoute,
      angle = index * 2.3999632297,
      side = route === 'left' ? -1 : 1,
      offset = Math.min(14, Math.max(5, distance * 0.17));
    let shift =
      route === 'above'
        ? { x: 0, y: offset, z: 0 }
        : route === 'surround'
          ? {
              x: right.x * Math.cos(angle) * offset + forward.x * Math.sin(angle) * offset * 0.6,
              y: 4 + Math.abs(Math.sin(angle)) * 5,
              z: right.z * Math.cos(angle) * offset + forward.z * Math.sin(angle) * offset * 0.6,
            }
          : { x: right.x * offset * side, y: 1.5, z: right.z * offset * side };
    const middle = mix(origin, point, 0.35);
    waypoints = [
      { x: middle.x + shift.x, y: middle.y + shift.y, z: middle.z + shift.z },
      { x: point.x + shift.x, y: point.y + shift.y, z: point.z + shift.z },
    ];
  }
  let previous = origin,
    total = 0;
  for (const p of waypoints) {
    total += length(sub(p, previous));
    previous = p;
  }
  if (type === 'hound') total += length(sub(point, previous));
  return {
    type,
    waypoints,
    index: 0,
    targetId,
    params: structuredClone(params),
    length: Math.max(1, total),
    trackedPoint: { ...point },
  };
}
export function flightSegments(b, dt, targets) {
  const speed = length(b.velocity);
  let remaining = Math.min(speed * dt, b.range - b.travelled),
    position = { ...b.position },
    segments = [],
    travel = 0;
  const g = b.guidance;
  if (g?.type === 'hound') {
    const target = targets.find((t) => t.id === g.targetId && t.health > 0);
    if (target) {
      const strength = trackingStrength(g.params, b.travelled / g.length),
        alpha = 1 - Math.exp(-(1 + strength * 10) * dt),
        delta = sub(target.position, g.trackedPoint);
      for (const key of ['x', 'y', 'z']) {
        delta[key] *= alpha;
        g.trackedPoint[key] += delta[key];
        for (let i = g.index; i < g.waypoints.length; i++) g.waypoints[i][key] += delta[key];
      }
    }
  }
  while (remaining > 1e-8) {
    let destination, gap;
    if (g && g.index < g.waypoints.length) {
      destination = g.waypoints[g.index];
      gap = length(sub(destination, position));
      if (gap < 1e-7) {
        g.index++;
        continue;
      }
      const dir = unit(sub(destination, position));
      b.velocity = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
    } else if (g?.type === 'hound') {
      const target = targets.find((t) => t.id === g.targetId && t.health > 0);
      if (target) {
        const strength = trackingStrength(g.params, (b.travelled + travel) / g.length);
        b.velocity = turnToward(
          b.velocity,
          sub(target.position, position),
          (((25 + strength * 395) * Math.PI) / 180) * dt,
        );
      }
    }
    const move = Math.min(remaining, gap ?? remaining),
      to = {
        x: position.x + (b.velocity.x / speed) * move,
        y: position.y + (b.velocity.y / speed) * move,
        z: position.z + (b.velocity.z / speed) * move,
      };
    segments.push({ from: position, to, distance: move });
    position = to;
    remaining -= move;
    travel += move;
    if (destination && move >= gap - 1e-7) {
      g.index++;
      if (g.type === 'hound' && g.index === g.waypoints.length) {
        const dir = unit(sub(g.trackedPoint, position));
        b.velocity = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
      }
    }
    if (segments.length > 12) break;
  }
  return segments;
}
