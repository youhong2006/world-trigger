import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE, groundHeight, createCollisionIndex } from './city-layout.js';
import { createHeadquarters } from './headquarters.js';
import { createHQInterior } from './hq-interior.js';
import { createDoorSystem, createLiftSystem } from './hq-systems.js';
import { createCharacterMotor } from './character-motor.js';

// Canvas text is irrelevant to navigation; build the actual meshes and colliders without a GPU.
export function installCanvasDocument() {
  const context = () =>
    new Proxy(
      {
        measureText: (value) => ({ width: String(value).length * 8 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      },
      { get: (target, key) => (key in target ? target[key] : () => {}) },
    );
  globalThis.document = {
    createElement: () => ({ width: 1, height: 1, getContext: context, style: {} }),
    body: { append() {} },
  };
}
export function fixture() {
  installCanvasDocument();
  const collision = createCollisionIndex(),
    scene = new THREE.Scene();
  // The exterior owns the roof, courtyard and tapered skins. Include its real
  // colliders so exit/entry tests exercise the same complete building as the game.
  const scale = BASE.scale,
    offset = { x: -23 * scale, z: BASE.z + 117 * scale };
  const convert = (v) => ({
    ...v,
    x: v.x * scale + offset.x,
    y: v.y * scale,
    z: v.z * scale + offset.z,
    w: v.w * scale,
    h: v.h * scale,
    d: v.d * scale,
    planes: v.planes?.map(([nx, ny, nz, a]) => [nx, ny, nz, a * scale + nx * offset.x + nz * offset.z]),
  });
  const shellMesh = () => new THREE.Object3D();
  createHeadquarters({
    scene,
    solid: (v) => collision.add(convert(v)),
    box(x, y, z, w, h, d, color, solid = false) {
      if (solid) collision.add(convert({ x, y, z, w, h, d }));
      return shellMesh();
    },
    cylinder: shellMesh,
  });
  const interior = createHQInterior({ scene, collision });
  const motor = createCharacterMotor({ groundHeight, collision });
  motor.configure({ walkSpeed: 5, sprintSpeed: 14 });
  const doors = createDoorSystem(interior.doors),
    lift = createLiftSystem(interior.lift, interior.liftDoors, collision);
  function step(input = {}, yaw = 0, dt = 1 / 120) {
    interior.updateVisibility(motor.position, true);
    lift.update(dt, motor);
    doors.update(dt, motor.position, lift.snapshot.y, lift.snapshot.moving);
    motor.update(dt, input, yaw);
  }
  function place(point, yaw = 0) {
    interior.updateVisibility(point, true);
    motor.teleport(point, yaw);
  }
  place({ x: 0, y: 0, z: 256 });
  return { scene, collision, interior, motor, doors, lift, step, place };
}
export function walkTo(f, x, z, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    const dx = x - f.motor.position.x,
      dz = z - f.motor.position.z;
    if (Math.hypot(dx, dz) < 0.07) return;
    f.step({ forward: 1 }, Math.atan2(-dx, -dz));
  }
  assert.fail(`Blocked en route to ${x},${z}: ${JSON.stringify(f.motor.position)}`);
}
export function dashTo(f, x, z, speed = 42, limit = 10000) {
  for (let i = 0; i < limit; i++) {
    const dx = x - f.motor.position.x,
      dz = z - f.motor.position.z,
      distance = Math.hypot(dx, dz);
    if (distance < 0.07) return;
    const dt = Math.min(1 / 120, distance / speed);
    f.step({ dash: { x: (dx / distance) * speed, z: (dz / distance) * speed } }, Math.atan2(-dx, -dz), dt);
  }
  assert.fail(`Blocked at boost speed en route to ${x},${z}: ${JSON.stringify(f.motor.position)}`);
}
