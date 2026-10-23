import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE, groundHeight, createCollisionIndex } from './city-layout.js';
import { HQ, HQ_FLOORS, HQ_STOPS, taperedVolume, stairFlights } from './hq-layout.js';
import { createHQInterior } from './hq-interior.js';
import { createDoorSystem, createLiftSystem, selectInteractable } from './hq-systems.js';
import { createCharacterMotor } from './character-motor.js';
import { DEFAULTS, normalizeSettings } from './game-settings.js';

// Canvas labels have no role in navigation; build the real meshes/colliders without a GPU.
function fixture() {
  globalThis.document = {
    createElement: () => ({ width: 1, height: 1, getContext: () => ({ fillRect() {}, fillText() {} }) }),
  };
  const collision = createCollisionIndex();
  const interior = createHQInterior({ scene: new THREE.Scene(), collision });
  const motor = createCharacterMotor({ groundHeight, collision });
  motor.configure({ walkSpeed: 5, sprintSpeed: 14 });
  const doors = createDoorSystem(interior.doors),
    lift = createLiftSystem(interior.lift, interior.liftDoors, collision);
  const step = (input = {}, yaw = 0) => {
    lift.update(1 / 120, motor);
    doors.update(1 / 120, motor.position, lift.snapshot.y, lift.snapshot.moving);
    motor.update(1 / 120, input, yaw);
  };
  return { collision, interior, motor, doors, lift, step };
}
function walkTo(f, x, z, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    const dx = x - f.motor.position.x,
      dz = z - f.motor.position.z;
    if (Math.hypot(dx, dz) < 0.07) return;
    f.step({ forward: 1 }, Math.atan2(-dx, -dz));
  }
  assert.fail(`Blocked en route to ${x},${z}: ${JSON.stringify(f.motor.position)}`);
}

test('350 m roof retains original wide footprint and human-scale occupied floors', () => {
  assert.equal(HQ.roof, 350);
  assert.equal(BASE.width * BASE.scale, 1248);
  assert.equal(HQ_FLOORS.length, 8);
  assert.equal(HQ_STOPS.at(-1).id, 'RF');
  for (let i = 1; i < HQ_FLOORS.length; i++) assert.equal(HQ_FLOORS[i].y - HQ_FLOORS[i - 1].y, 4);
  assert.equal(stairFlights().at(-1).y + stairFlights().at(-1).rise, HQ.roof);
});
test('capsule and camera collide with the real slanted hull instead of its bounding box', () => {
  const c = createCollisionIndex();
  const v = taperedVolume({ x: 0, z: 100, w: 20, d: 4, y: 0, h: 20, topX: 0, topZ: 98, topW: 18, topD: 4 });
  c.add(v);
  assert.equal(c.canOccupy(0, 101.5, 18, 1.75), true);
  assert.equal(c.canOccupy(0, 99, 18, 1.75), false);
  assert.equal(c.segmentFraction({ x: 0, y: 18, z: 104 }, { x: 0, y: 18, z: 101 }, 0.1), 1);
  assert.ok(c.segmentFraction({ x: 0, y: 18, z: 104 }, { x: 0, y: 18, z: 98 }, 0.1) < 1);
});
test('player walks from street ramp through automatic entry to the public corridor', () => {
  const f = fixture();
  f.motor.teleport({ x: 0, z: 302 });
  assert.equal(f.motor.grounded, true);
  walkTo(f, 0, 217);
  assert.ok(Math.abs(f.motor.position.y - HQ.floor) < 0.02);
  walkTo(f, -18, 217);
  walkTo(f, -18, 230);
  assert.ok(Math.abs(f.motor.position.y - HQ.floor) < 0.02);
});
test('the complete physical switchback stairs connect B2 to the 350 m rooftop', () => {
  const f = fixture();
  f.motor.teleport({ x: 51, y: HQ_FLOORS[0].y, z: 204.5 });
  for (const flight of stairFlights()) {
    walkTo(f, flight.x, flight.back ? 204.5 : 193.5);
    walkTo(f, flight.x, flight.back ? 193.5 : 204.5);
    assert.ok(Math.abs(f.motor.position.y - (flight.y + flight.rise)) < 0.02, `stair ${flight.index}`);
  }
  assert.equal(f.motor.grounded, true);
  assert.ok(Math.abs(f.motor.position.y - HQ.roof) < 0.02);
});
test('elevator carries a physical passenger to the roof and safely opens only that landing', () => {
  const f = fixture();
  f.motor.teleport({ x: 43, y: HQ.floor, z: 198 });
  f.lift.request('RF');
  for (let i = 0; i < 5000; i++) f.step();
  assert.equal(f.lift.snapshot.y, HQ.roof);
  assert.equal(f.lift.snapshot.moving, false);
  assert.ok(Math.abs(f.motor.position.y - HQ.roof) < 0.02);
  assert.ok(f.interior.liftDoors.find((d) => d.name === '電梯 RF').progress > 0.98);
  assert.ok(f.interior.liftDoors.filter((d) => d.name !== '電梯 RF').every((d) => d.progress < 0.01));
  walkTo(f, 43, 205);
  assert.ok(Math.abs(f.motor.position.y - HQ.roof) < 0.02);
});
test('door anti-crush keeps the entrance clear while the player occupies the threshold', () => {
  const f = fixture(),
    d = f.interior.doors.find((d) => d.name === 'BORDER 主入口');
  f.motor.teleport({ x: 0, y: HQ.floor, z: d.z });
  for (let i = 0; i < 800; i++) f.doors.update(1 / 120, f.motor.position, HQ.floor, false);
  assert.equal(d.progress, 1);
  assert.equal(f.collision.canOccupy(0, d.z, HQ.floor, 1.75), true);
  for (let i = 0; i < 500; i++) f.doors.update(1 / 120, { x: 100, y: HQ.floor, z: 300 }, HQ.floor, false);
  assert.equal(d.progress, 0);
  assert.equal(f.collision.canOccupy(0, d.z, HQ.floor, 1.75), false);
});
test('F targeting respects view, 2.5 m range, walls and closed doors', () => {
  const c = createCollisionIndex(),
    p = { position: { x: 0, y: 10, z: 220 }, yaw: 0, trace: c.segmentFraction };
  const o = { id: 't', x: 0, y: 11, z: 218 };
  assert.equal(selectInteractable([o], p), o);
  c.add({ x: 0, y: 10, z: 219, w: 3, h: 3, d: 0.2 });
  assert.equal(selectInteractable([o], p), null);
  assert.equal(selectInteractable([{ ...o, z: 210 }], p), null);
});
test('old default F side-swap migrates to Z without losing E or other custom bindings', () => {
  const old = normalizeSettings({
    ...DEFAULTS,
    bindings: { ...DEFAULTS.bindings, interact: undefined, swapSide: 'KeyF', crouch: 'ControlLeft' },
  });
  assert.equal(old.bindings.interact, 'KeyF');
  assert.equal(old.bindings.swapSide, 'KeyZ');
  assert.equal(old.bindings.prepare, 'KeyE');
  assert.equal(old.bindings.crouch, 'ControlLeft');
  assert.equal(new Set(Object.values(old.bindings)).size, Object.keys(DEFAULTS.bindings).length);
});

test('training atrium remains open through the 3F gallery instead of intersecting a floor slab', () => {
  const f = fixture();
  assert.equal(f.collision.canOccupy(-25, 201, HQ.floor + 7, 1.75, 0.28), true);
  assert.equal(f.collision.surfaceHeightAt(-25, 201, HQ.floor + 8, 0.38), HQ.floor + 4);
  f.motor.teleport({ x: -42, y: HQ.floor + 4, z: 208.8 });
  walkTo(f, -42, 194.8);
  assert.ok(Math.abs(f.motor.position.y - (HQ.floor + 8)) < 0.02);
});

test('virtual training uses a separate scene, saves cleared scores and returns the player and avatar', async () => {
  const { createHQTraining } = await import('./hq-training.js');
  const f = fixture();
  document.body = { append() {} };
  const world = new THREE.Scene(),
    environment = new THREE.Group(),
    avatar = new THREE.Group();
  world.add(environment, avatar);
  const saved = new Map(),
    storage = { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v) };
  f.motor.teleport({ x: 0, y: HQ.floor, z: 217 }, 0.4);
  const anchor = { ...f.motor.position };
  const sim = createHQTraining({
    scene: world,
    worldObjects: [environment],
    motor: f.motor,
    storage,
    onTransition() {},
    notify() {},
  });
  sim.start({ yaw: 0.4, pitch: 0.1 });
  assert.equal(avatar.parent, sim.scene);
  assert.equal(environment.parent, world);
  for (const t of sim.targets) {
    sim.recordShot();
    sim.hit(t.id, t.maxHealth);
  }
  assert.equal(sim.snapshot.cleared, 6);
  assert.ok(sim.snapshot.best > 0);
  assert.ok(saved.has('mikado-hq-training-best'));
  assert.equal(sim.stop(), true);
  assert.equal(avatar.parent, world);
  assert.deepEqual(f.motor.position, anchor);
  assert.equal(sim.active, false);
});

test('boost-speed motion stays outside interior walls and closed landing shafts', () => {
  const f = fixture();
  f.motor.teleport({ x: -25, y: HQ.floor - 4, z: 217 });
  for (let i = 0; i < 120; i++) f.step({ dash: { x: 0, z: -65 } }, 0);
  assert.ok(f.motor.position.z >= 190.3);
  assert.equal(
    f.collision.canOccupy(43, 200.1, HQ.floor + 4, 1.75),
    false,
    'unoccupied landing stays closed',
  );
});

test('fortress exterior has outward flat normals and non-collapsed wall UVs', async () => {
  const { fortressGeometry } = await import('./hq-geometry.js');
  const v = taperedVolume({ x: 0, z: 0, w: 20, d: 4, y: 0, h: 30, topX: 0, topZ: -2, topW: 18, topD: 4 });
  const g = fortressGeometry(v),
    p = g.attributes.position,
    n = g.attributes.normal,
    uv = g.attributes.uv;
  const center = new THREE.Vector3(0, 15, -1);
  for (let i = 0; i < p.count; i++)
    assert.ok(
      new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .sub(center)
        .dot(new THREE.Vector3().fromBufferAttribute(n, i)) > 0,
    );
  for (let face = 2; face < 6; face++)
    assert.ok(
      Math.max(...Array.from({ length: 6 }, (_, i) => uv.getY(face * 6 + i))) -
        Math.min(...Array.from({ length: 6 }, (_, i) => uv.getY(face * 6 + i))) >
        0.9,
    );
});
