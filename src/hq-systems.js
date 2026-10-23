import { HQ, HQ_STOPS } from './hq-layout.js';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function selectInteractable(objects, { position, eyeHeight = 1.6, yaw = 0, pitch = 0, trace }) {
  const origin = { x: position.x, y: position.y + eyeHeight, z: position.z };
  const forward = {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
  let best = null,
    score = Infinity;
  for (const o of objects) {
    const dx = o.x - origin.x,
      dy = o.y - origin.y,
      dz = o.z - origin.z,
      d = Math.hypot(dx, dy, dz);
    if (d > 2.5 || d < 0.02) continue;
    const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / d;
    if (dot < 0.55) continue;
    // Stop just in front of the object's own solid surface. Other walls still occlude it.
    const near = { x: o.x - (dx / d) * 0.06, y: o.y - (dy / d) * 0.06, z: o.z - (dz / d) * 0.06 };
    if (trace && trace(origin, near, 0.015, o.solids ?? o.door?.solids) < 0.97) continue;
    const value = d + (1 - dot) * 2;
    if (value < score) {
      best = o;
      score = value;
    }
  }
  return best;
}
export function createDoorSystem(doors) {
  function activate(d) {
    if (!d.access) return false;
    d.manual = d.progress > 0.9 ? 0 : 5;
    d.hold = d.manual;
    return true;
  }
  function update(dt, p, liftY, liftMoving) {
    for (const d of doors) {
      const axis = d.leafAxis ?? { x: 1, z: 0 },
        normal = { x: -axis.z, z: axis.x };
      const dx = p.x - d.x,
        dz = p.z - d.z,
        u = dx * axis.x + dz * axis.z,
        v = dx * normal.x + dz * normal.z;
      const near = Math.abs(u) < d.w / 2 + 0.65 && Math.abs(v) < 2.8 && Math.abs(p.y - d.y) < 2.7;
      const threshold =
        Math.abs(u) < d.w / 2 + 0.4 && Math.abs(v) < 0.8 && p.y < d.y + d.h && p.y + 1.75 > d.y;
      if (d.kind === 'lift') d.access = !liftMoving && Math.abs(liftY - d.y) < 0.02;
      if (d.automatic && near && d.access) d.hold = 1.8;
      if (threshold && d.access) d.hold = Math.max(d.hold, 0.3);
      d.manual = Math.max(0, d.manual - dt);
      d.hold = Math.max(0, d.hold - dt);
      const want = d.access && (d.hold > 0 || d.manual > 0);
      d.progress = clamp(d.progress + (want ? 1 : -1) * dt * 3.3, 0, 1);
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1,
          offset = side * (d.w / 4 + d.progress * d.w * 0.53);
        const x = d.x + axis.x * offset,
          z = d.z + axis.z * offset;
        d.meshes[i].position.x = x;
        d.meshes[i].position.z = z;
        if (d.solids) {
          d.solids[i].x = x;
          d.solids[i].z = z;
          d.solids[i].enabled = true;
        }
      }
      if (d.solid) d.solid.enabled = d.progress < 0.98;
    }
  }
  return { update, activate };
}
export function createLiftSystem(lift, doors, collision) {
  let requested = null,
    velocity = 0;
  const inside = (p) =>
    Math.abs(p.x - HQ.lift.x) < 1.55 &&
    Math.abs(p.z - HQ.lift.z) < 1.55 &&
    p.y >= lift.y - 0.12 &&
    p.y < lift.y + 2.6;
  function request(id) {
    const f = HQ_STOPS.find((f) => f.id === id);
    if (!f || lift.moving) return false;
    requested = f;
    lift.target = f.y;
    return true;
  }
  function update(dt, motor) {
    const boarding = inside(motor.position),
      old = lift.y;
    const current = doors.find((d) => Math.abs(d.y - old) < 0.02);
    if (requested && Math.abs(lift.target - old) > 0.01) {
      for (const d of doors) {
        d.hold = 0;
        d.manual = 0;
        d.access = false;
      }
      const threshold =
        Math.abs(motor.position.x - 43) < 1.9 &&
        Math.abs(motor.position.z - 200.1) < 0.8 &&
        Math.abs(motor.position.y - old) < 2.8;
      const closed = doors.every((d) => d.progress < 0.001);
      if (!threshold && closed) lift.moving = true;
    } else if (current) {
      current.hold = 1.8;
      current.access = true;
    }
    if (lift.moving) {
      const dist = lift.target - lift.y,
        dir = Math.sign(dist);
      velocity = Math.min(24, velocity + dt * 12, Math.sqrt(2 * 12 * Math.abs(dist)));
      const travel = Math.min(Math.abs(dist), velocity * dt);
      lift.y += dir * travel;
      if (Math.abs(lift.y - lift.target) < 0.005) {
        lift.y = lift.target;
        lift.moving = false;
        requested = null;
        velocity = 0;
      }
    }
    const dy = lift.y - old;
    if (boarding && dy) motor.position.y += dy;
    lift.cabin.position.set(43, lift.y, 198);
    lift.cabin.children[0].position.y = -0.09;
    collision.setHeight(lift.platform, lift.y - 0.18, 0.18);
    for (const f of lift.fixtures) {
      collision.setHeight(f.solid, lift.y + f.y, f.h);
      if (f.front) {
        f.solid.enabled = lift.moving;
        f.m.visible = lift.moving;
      }
    }
    lift.control.y = lift.y + 1.3;
  }
  return {
    request,
    update,
    inside,
    get snapshot() {
      return { y: lift.y, target: lift.target, moving: lift.moving, requested: requested?.id ?? null };
    },
  };
}
