import { normalizeFire, shotCost } from './armory.js';
const add = (p, v, t) => ({ x: p.x + v.x * t, y: p.y + v.y * t, z: p.z + v.z * t });
export function segmentSphere(from, to, center, radius) {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z },
    o = { x: from.x - center.x, y: from.y - center.y, z: from.z - center.z };
  const a = d.x * d.x + d.y * d.y + d.z * d.z,
    c = o.x * o.x + o.y * o.y + o.z * o.z - radius * radius;
  if (c <= 0) return 0;
  if (a < 1e-12) return 1;
  const b = o.x * d.x + o.y * d.y + o.z * d.z,
    disc = b * b - a * c;
  if (disc < 0) return 1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : 1;
}
export function createShootingSystem({
  combat,
  traceWorld = () => 1,
  getTargets = () => [],
  onEvent = () => {},
  onHit = () => {},
}) {
  const prepared = { main: null, sub: null },
    pending = [],
    projectiles = [];
  let time = 0,
    id = 0,
    emitted = 0,
    hits = 0;
  const nextFire = { main: 0, sub: 0 };
  function prepare(side, type, config) {
    if (
      !['main', 'sub'].includes(side) ||
      !['asteroid', 'viper', 'meteor'].includes(type) ||
      prepared[side] ||
      time < nextFire[side] ||
      pending.some((p) => p.side === side)
    )
      return false;
    const params = normalizeFire(config),
      cost = shotCost(params);
    if (!combat.consume(type, cost, { parallel: true }) || combat.snapshot.state === 'exhausted')
      return false;
    prepared[side] = { id: ++id, side, type, params, created: time };
    onEvent('generate', { side, type, cost });
    return true;
  }
  function fire(side, type, config, origin, point) {
    if (combat.snapshot.state === 'paused' || combat.snapshot.state === 'exhausted' || time < nextFire[side])
      return false;
    if (!prepared[side] && !prepare(side, type, config)) return false;
    const batch = prepared[side];
    if (!batch) return false;
    if (
      pending.length + batch.params.count > 128 ||
      projectiles.length + pending.length + batch.params.count > 256
    )
      return false;
    prepared[side] = null;
    const dir = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z },
      length = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= length;
    dir.y /= length;
    dir.z /= length;
    // Straight shots retain their launch direction. Reserved Viper/Meteor use the same baseline for now.
    for (let n = 0; n < batch.params.count; n++)
      pending.push({
        side,
        batch,
        n,
        due:
          time + 0.1 + batch.params.delay + (batch.params.mode === 'burst' ? n * batch.params.interval : 0),
        origin: { ...origin },
        direction: { ...dir },
      });
    nextFire[side] =
      time +
      Math.max(
        0.4,
        0.1 +
          batch.params.delay +
          (batch.params.mode === 'burst' ? batch.params.count * batch.params.interval : 0),
      );
    onEvent('release', { side, type: batch.type, count: batch.params.count });
    return true;
  }
  function emit(item) {
    const { params } = item.batch,
      angle = item.n * 2.3999632297,
      radius = Math.sqrt((item.n + 0.5) / params.count) * Math.tan((params.spread * Math.PI) / 180);
    const d = item.direction,
      h = Math.hypot(d.x, d.z),
      right = h > 1e-6 ? { x: d.z / h, y: 0, z: -d.x / h } : { x: 1, y: 0, z: 0 },
      up = { x: d.y * right.z, y: d.z * right.x - d.x * right.z, z: -d.y * right.x };
    const v = {
        x: d.x + radius * (Math.cos(angle) * right.x + Math.sin(angle) * up.x),
        y: d.y + radius * Math.sin(angle) * up.y,
        z: d.z + radius * (Math.cos(angle) * right.z + Math.sin(angle) * up.z),
      },
      len = Math.hypot(v.x, v.y, v.z);
    const bullet = {
      id: ++id,
      side: item.side,
      type: item.batch.type,
      position: { ...item.origin },
      velocity: {
        x: (v.x / len) * params.speed,
        y: (v.y / len) * params.speed,
        z: (v.z / len) * params.speed,
      },
      damage: params.damage,
      range: params.range,
      travelled: 0,
    };
    // Check muzzle access from the body as well as each subsequent flight segment in the integration layer.
    projectiles.push(bullet);
    emitted++;
    onEvent('shot', { side: item.side, type: bullet.type, id: bullet.id, position: { ...bullet.position } });
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || combat.snapshot.state === 'paused') return;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 120);
      time += step;
      for (let n = pending.length - 1; n >= 0; n--)
        if (pending[n].due <= time) {
          const [item] = pending.splice(n, 1);
          if (combat.snapshot.state !== 'exhausted') emit(item);
        }
      for (let n = projectiles.length - 1; n >= 0; n--) {
        const b = projectiles[n],
          from = b.position,
          speed = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z),
          duration = Math.min(step, (b.range - b.travelled) / speed),
          to = add(from, b.velocity, duration);
        let fraction = traceWorld(from, to, 0.04),
          target = null;
        for (const candidate of getTargets()) {
          if (candidate.health <= 0) continue;
          const t = segmentSphere(from, to, candidate.position, candidate.radius + 0.045);
          if (t < fraction) {
            fraction = t;
            target = candidate;
          }
        }
        const distance = speed * duration;
        b.travelled += distance * Math.min(1, fraction);
        if (fraction < 1) {
          const hit = {
            x: from.x + (to.x - from.x) * fraction,
            y: from.y + (to.y - from.y) * fraction,
            z: from.z + (to.z - from.z) * fraction,
          };
          if (target) {
            hits++;
            onHit(target.id, b.damage, hit, b);
          }
          onEvent('impact', { position: hit, targetId: target?.id ?? null, type: b.type });
          projectiles.splice(n, 1);
        } else {
          b.position = to;
          if (b.travelled >= b.range - 1e-6) projectiles.splice(n, 1);
        }
      }
      remaining -= step;
    }
  }
  function clear(side) {
    for (const key of ['main', 'sub']) if (!side || side === key) prepared[key] = null;
    for (let n = pending.length - 1; n >= 0; n--) if (!side || pending[n].side === side) pending.splice(n, 1);
  }
  return {
    prepare,
    fire,
    update,
    clear,
    reset() {
      clear();
      projectiles.length = 0;
      nextFire.main = nextFire.sub = 0;
      emitted = hits = 0;
    },
    get snapshot() {
      return {
        time,
        prepared: structuredClone(prepared),
        pending: pending.length,
        queued: ['main', 'sub']
          .map((side) => {
            const list = pending.filter((p) => p.side === side);
            return list.length
              ? {
                  side,
                  params: { ...list[0].batch.params },
                  position: { ...list[0].origin },
                  indices: list.map((p) => p.n),
                }
              : null;
          })
          .filter(Boolean),
        projectiles: projectiles.map((p) => ({
          ...p,
          position: { ...p.position },
          velocity: { ...p.velocity },
        })),
        emitted,
        hits,
        accuracy: emitted ? hits / emitted : 0,
      };
    },
  };
}
export function createWorldTrace(collision, groundHeight) {
  return (from, to, radius = 0.04) => {
    let fraction = collision.segmentFraction(from, to, radius),
      length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
      previous = 0;
    const samples = Math.max(1, Math.ceil(length / 0.7));
    for (let n = 0; n <= samples; n++) {
      const t = Math.min(fraction, n / samples),
        p = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          z: from.z + (to.z - from.z) * t,
        };
      if (p.y <= groundHeight(p.x, p.z) + radius) {
        let low = previous,
          high = t;
        for (let k = 0; k < 8; k++) {
          const m = (low + high) / 2,
            x = from.x + (to.x - from.x) * m,
            z = from.z + (to.z - from.z) * m,
            y = from.y + (to.y - from.y) * m;
          if (y <= groundHeight(x, z) + radius) high = m;
          else low = m;
        }
        fraction = Math.min(fraction, high);
        break;
      }
      previous = t;
      if (t >= fraction) break;
    }
    return fraction;
  };
}
export function chooseAimPoint({
  origin,
  forward,
  range,
  targets,
  traceWorld,
  assist = false,
  selectedId = null,
}) {
  const end = add(origin, forward, range);
  let fraction = traceWorld(origin, end, 0.02),
    targetId = null;
  for (const t of targets) {
    if (t.health <= 0) continue;
    const hit = segmentSphere(origin, end, t.position, t.radius);
    if (hit < fraction) {
      fraction = hit;
      targetId = t.id;
    }
  }
  let point = {
    x: origin.x + (end.x - origin.x) * fraction,
    y: origin.y + (end.y - origin.y) * fraction,
    z: origin.z + (end.z - origin.z) * fraction,
  };
  if (assist) {
    const candidates = targets
      .filter((t) => t.health > 0)
      .map((t) => {
        const dx = t.position.x - origin.x,
          dy = t.position.y - origin.y,
          dz = t.position.z - origin.z,
          d = Math.hypot(dx, dy, dz);
        return { target: t, d, dot: (dx * forward.x + dy * forward.y + dz * forward.z) / (d || 1) };
      })
      .filter(
        (c) =>
          c.d <= range &&
          c.dot > Math.cos(((c.target.id === selectedId ? 35 : 8) * Math.PI) / 180) &&
          traceWorld(origin, c.target.position, 0.03) > 0.999,
      )
      .sort((a, b) => (b.target.id === selectedId ? 2 : b.dot) - (a.target.id === selectedId ? 2 : a.dot));
    if (candidates[0]) {
      targetId = candidates[0].target.id;
      point = { ...candidates[0].target.position };
    }
  }
  return { point, targetId };
}
