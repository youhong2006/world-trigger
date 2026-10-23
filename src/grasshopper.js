export const GRASSHOPPER = Object.freeze({
  cost: 0.3,
  lifetime: 12,
  radius: 0.82,
  placeDistance: 1.7,
  minInterval: 0.16,
  maxPads: 16,
});
export function launchDirection(input, yaw, speed = 42) {
  let f = Math.max(-1, Math.min(1, Number(input.forward) || 0)),
    s = Math.max(-1, Math.min(1, Number(input.strafe) || 0));
  const length = Math.hypot(f, s);
  if (length < 0.01) return { x: 0, y: 28 * (speed / 42), z: 0 };
  f /= length;
  s /= length;
  return {
    x: (-Math.sin(yaw) * f + Math.cos(yaw) * s) * speed,
    y: 14 * (speed / 42),
    z: (-Math.cos(yaw) * f - Math.sin(yaw) * s) * speed,
  };
}
export function createGrasshopper({ motor, combat, collision = {}, groundHeight, onEvent = () => {} }) {
  let time = 0,
    lastCast = -Infinity,
    id = 0,
    launches = 0,
    speed = 42,
    charging = false;
  const pads = [];
  function begin() {
    if (charging || time - lastCast < GRASSHOPPER.minInterval || !combat.begin('grasshopper')) return false;
    charging = true;
    onEvent('prepare');
    return true;
  }
  function cancel() {
    charging = false;
    combat.cancel();
  }
  function activate(pad, input, yaw) {
    if (pad.used) return;
    pad.used = true;
    pad.usedAt = time;
    launches++;
    const velocity = launchDirection(input, yaw, speed);
    motor.launch(velocity);
    onEvent('launch', { pad: { ...pad }, velocity });
  }
  function preview(yaw) {
    const airborne = !motor.grounded,
      p = motor.position;
    const x = airborne ? p.x : p.x - Math.sin(yaw) * GRASSHOPPER.placeDistance;
    const z = airborne ? p.z : p.z - Math.cos(yaw) * GRASSHOPPER.placeDistance;
    const support = collision.surfaceHeightAt?.(x, z, p.y, 1.6) ?? groundHeight(x, z);
    const y = airborne ? p.y : support;
    const clear = collision.canOccupy?.(x, z, y + 0.04, 0.15, 0.65) ?? true;
    return {
      x,
      y,
      z,
      yaw,
      airborne,
      valid: clear && (airborne || Math.abs(y - p.y) <= 1.65) && !collision.outsideWorld?.(x, z),
    };
  }
  function release(input, yaw) {
    if (!charging) return { ok: false, reason: 'not-preparing' };
    const { x, y, z, airborne, valid } = preview(yaw);
    if (!valid) {
      cancel();
      onEvent('blocked');
      return { ok: false, reason: 'blocked' };
    }
    if (!combat.consume('grasshopper')) {
      cancel();
      return { ok: false, reason: 'resource' };
    }
    charging = false;
    lastCast = time;
    const pad = {
      id: ++id,
      x,
      y: y + 0.025,
      z,
      yaw,
      created: time,
      expires: time + GRASSHOPPER.lifetime,
      used: false,
      airborne,
    };
    if (pads.length >= GRASSHOPPER.maxPads) pads.shift();
    pads.push(pad);
    onEvent('place', { pad: { ...pad } });
    if (airborne) activate(pad, input, yaw);
    return { ok: true, pad: { ...pad } };
  }
  function update(dt) {
    time += dt;
    for (let i = pads.length - 1; i >= 0; i--)
      if (pads[i].expires <= time || (pads[i].used && time - pads[i].usedAt > 0.35)) pads.splice(i, 1);
  }
  function checkStep(from, to, input, yaw) {
    if (motor.velocity.y > 0.5) return;
    for (const pad of pads) {
      if (pad.used || time >= pad.expires) continue;
      // Sweep the feet segment, including a descending crossing of the pad plane.
      const dx = to.x - from.x,
        dz = to.z - from.z;
      let t =
        dx * dx + dz * dz > 1e-10
          ? Math.max(0, Math.min(1, ((pad.x - from.x) * dx + (pad.z - from.z) * dz) / (dx * dx + dz * dz)))
          : 1;
      if (from.y > pad.y + 0.18 && to.y <= pad.y + 0.18 && from.y !== to.y)
        t = Math.max(0, Math.min(1, (from.y - (pad.y + 0.025)) / (from.y - to.y)));
      const x = from.x + dx * t,
        z = from.z + dz * t,
        y = from.y + (to.y - from.y) * t;
      if (Math.hypot(x - pad.x, z - pad.z) <= GRASSHOPPER.radius && y >= pad.y - 0.18 && y <= pad.y + 0.2) {
        activate(pad, input, yaw);
        break;
      }
    }
  }
  return {
    begin,
    release,
    cancel,
    update,
    checkStep,
    preview,
    configure(value) {
      if (Number.isFinite(value)) speed = Math.max(20, Math.min(65, value));
    },
    reset() {
      cancel();
      pads.length = 0;
      lastCast = -Infinity;
      launches = 0;
    },
    get snapshot() {
      return {
        charging,
        launches,
        time,
        pads: pads.map((p) => ({ ...p })),
        speed,
        cooldown: Math.max(0, GRASSHOPPER.minInterval - (time - lastCast)),
      };
    },
  };
}
