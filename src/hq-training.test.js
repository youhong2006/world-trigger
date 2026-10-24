import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHQTraining, HQ_TRAINING_LAYOUT } from './hq-training.js';
import { createCharacterMotor } from './character-motor.js';

function fixture(storage) {
  const labels = [];
  const context = new Proxy({}, { get: () => () => {} });
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
    body: { append: (label) => labels.push(label) },
  };
  const source = new THREE.Scene(),
    body = new THREE.Group();
  source.add(body);
  let simulation;
  const motor = createCharacterMotor({
    groundHeight: () => simulation?.y ?? HQ_TRAINING_LAYOUT.y,
    collision: {
      canOccupy: (...args) => simulation.index.canOccupy(...args),
      surfaceHeightAt: (...args) => simulation.index.surfaceHeightAt(...args),
    },
  });
  motor.configure({ walkSpeed: 5 });
  simulation = createHQTraining({
    scene: source,
    worldObjects: [],
    motor,
    onTransition() {},
    notify() {},
    storage,
  });
  return { simulation, motor, body, labels, source };
}
function walk(f, x, z) {
  for (let step = 0; step < 3000; step++) {
    const dx = x - f.motor.position.x,
      dz = z - f.motor.position.z;
    if (Math.hypot(dx, dz) < 0.08) return;
    f.motor.update(1 / 120, { forward: 1 }, Math.atan2(-dx, -dz));
  }
  assert.fail(`training passage blocked at ${JSON.stringify(f.motor.position)} before ${x},${z}`);
}

test('both opposing broad approaches reach their actual observation balconies with human-scale stairs', () => {
  const f = fixture(),
    floor = f.simulation.y;
  for (const side of [-1, 1])
    for (const x of HQ_TRAINING_LAYOUT.stairCenters) {
      f.motor.teleport({ x, y: floor, z: side * 26 });
      walk(f, x, side * 70);
      assert.ok(Math.abs(f.motor.position.y - floor - HQ_TRAINING_LAYOUT.platformHeight) < 0.02);
      assert.equal(f.motor.grounded, true);
      walk(f, x + (x > 0 ? -12 : 12), side * 75);
      assert.ok(Math.abs(f.motor.position.y - floor - HQ_TRAINING_LAYOUT.platformHeight) < 0.02);
    }
});

test('all six existing targets retain a clear practical shooting line from the simulation entrance', () => {
  const { simulation } = fixture();
  const from = { ...HQ_TRAINING_LAYOUT.spawn, y: simulation.y + 1.5 };
  assert.equal(simulation.targets.length, 6);
  assert.equal(simulation.index.canOccupy(from.x, from.z, simulation.y, 1.75), true);
  for (const target of simulation.targets) {
    assert.equal(simulation.index.segmentFraction(from, target.position, 0.06), 1, target.id);
    assert.equal(
      simulation.index.canOccupy(target.position.x, target.position.z, target.position.y, 0.1),
      true,
      target.id,
    );
  }
});

test('SIM-01 retry restores targets and exit preserves the physical return point and avatar scene', () => {
  const f = fixture();
  const home = { x: 24, y: 0, z: 218 };
  f.motor.teleport(home, 0.8);
  f.simulation.start({ yaw: 0.8, pitch: 0.1 });
  assert.equal(f.body.parent, f.simulation.scene);
  f.simulation.hit('HQ-1', 100);
  f.simulation.update(1);
  assert.equal(f.simulation.snapshot.cleared, 1);
  f.simulation.retry();
  f.simulation.update(0);
  assert.equal(f.simulation.snapshot.cleared, 0);
  assert.equal(f.simulation.snapshot.time, 0);
  assert.match(f.labels[0].textContent, /SIM-01 模擬訓練空間/);
  assert.deepEqual(f.motor.state.position, HQ_TRAINING_LAYOUT.spawn);
  assert.equal(f.simulation.stop(), true);
  assert.deepEqual(f.motor.state.position, home);
  assert.equal(f.body.parent, f.source);
});

test('a completed six-target run persists its best score across return and a fresh training session', () => {
  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const f = fixture(storage);
  f.simulation.start({ yaw: 0, pitch: 0 });
  f.simulation.update(12);
  for (const target of f.simulation.targets) {
    f.simulation.recordShot();
    assert.equal(f.simulation.hit(target.id, target.maxHealth), true);
  }
  const result = f.simulation.snapshot;
  assert.equal(result.finished, true);
  assert.equal(result.cleared, 6);
  assert.equal(result.best, 1240);
  assert.equal(saved.get('mikado-hq-training-best'), '1240');
  f.simulation.update(30);
  assert.equal(f.simulation.snapshot.time, result.time);
  assert.equal(f.simulation.hit('HQ-1', 1), false);
  f.simulation.stop();

  const next = fixture(storage);
  next.simulation.start({ yaw: 0, pitch: 0 });
  assert.equal(next.simulation.snapshot.best, 1240);
  assert.equal(next.simulation.snapshot.cleared, 0);
  assert.equal(next.simulation.snapshot.finished, false);
});
