import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrasshopper, launchDirection } from './grasshopper.js';
import { createCharacterMotor } from './character-motor.js';
import { createCombatCore } from './combat-core.js';
function setup(collision = {}) {
  const groundHeight = () => 0,
    motor = createCharacterMotor({ groundHeight, collision }),
    combat = createCombatCore(),
    skill = createGrasshopper({ motor, combat, collision, groundHeight });
  return { motor, combat, skill };
}
function step(world, seconds, input = {}, yaw = 0, hz = 120) {
  for (let t = 0; t < seconds - 1e-8; t += 1 / hz) {
    const dt = Math.min(1 / hz, seconds - t),
      from = { ...world.motor.position };
    world.combat.update(dt);
    world.skill.update(dt);
    world.motor.update(dt, input, yaw);
    world.skill.checkStep(from, world.motor.position, input, yaw);
  }
}
test('direction follows current camera-relative keys, normalizes diagonals and uses up for no input', () => {
  const f = launchDirection({ forward: 1 }, 0),
    diagonal = launchDirection({ forward: 1, strafe: 1 }, 0);
  assert.equal(f.z, -42);
  assert.equal(f.y, 14);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 42) < 1e-8);
  assert.deepEqual(launchDirection({}, 2), { x: 0, y: 28, z: 0 });
  const left = launchDirection({ strafe: -1 }, Math.PI / 2);
  assert.ok(Math.abs(left.x) < 1e-8 && Math.abs(left.z - 42) < 1e-8);
});
test('ground casting places ahead without self-triggering and stepping consumes the pad only once', () => {
  const w = setup();
  assert.ok(w.skill.begin());
  assert.equal(w.combat.snapshot.remaining, 100);
  const result = w.skill.release({}, 0);
  assert.equal(result.ok, true);
  assert.equal(w.combat.snapshot.remaining, 99.7);
  assert.equal(w.skill.snapshot.launches, 0);
  assert.equal(result.pad.z, -1.7);
  step(w, 0.1);
  assert.equal(w.skill.snapshot.launches, 0);
  step(w, 0.7, { forward: 1 });
  assert.equal(w.skill.snapshot.launches, 1);
  assert.ok(w.motor.position.y > 0);
  assert.ok(w.motor.velocity.z < -20);
  step(w, 1, { forward: 1 });
  assert.equal(w.skill.snapshot.launches, 1);
});
test('air release immediately launches and can chain without a landing; no keys overrides old momentum', () => {
  const w = setup();
  w.motor.teleport({ x: 0, y: 5, z: 0 });
  w.skill.begin();
  w.skill.release({ forward: 1 }, 0);
  assert.equal(w.skill.snapshot.launches, 1);
  assert.equal(w.motor.velocity.z, -42);
  step(w, 0.2);
  w.skill.begin();
  const result = w.skill.release({}, 0);
  assert.equal(result.ok, true);
  assert.equal(w.skill.snapshot.launches, 2);
  assert.equal(w.motor.velocity.z, 0);
  assert.equal(w.motor.velocity.y, 28);
  assert.equal(w.combat.snapshot.remaining, 99.4);
  assert.equal(w.motor.grounded, false);
});
test('landing on a previously placed pad with released directions launches vertically', () => {
  const w = setup();
  w.skill.begin();
  w.skill.release({}, 0);
  w.motor.teleport({ x: 0, y: 3, z: -1.7 });
  step(w, 0.6);
  assert.equal(w.skill.snapshot.launches, 1);
  assert.equal(w.motor.velocity.x, 0);
  assert.equal(w.motor.velocity.z, 0);
  assert.ok(w.motor.velocity.y > 20);
});
test('blocked placements, cancellation, expiry, rate limits and resource shortage are safe', () => {
  const blocked = setup({ canOccupy: () => false });
  blocked.skill.begin();
  assert.equal(blocked.skill.release({}, 0).ok, false);
  assert.equal(blocked.combat.snapshot.remaining, 100);
  const w = setup();
  w.skill.begin();
  w.skill.cancel();
  assert.equal(w.skill.release({}, 0).ok, false);
  assert.equal(w.combat.snapshot.remaining, 100);
  w.skill.begin();
  w.skill.release({}, 0);
  assert.equal(w.skill.begin(), false);
  w.skill.update(12.1);
  assert.equal(w.skill.snapshot.pads.length, 0);
  w.combat.damage(99.5);
  assert.equal(w.skill.begin(), false);
  w.skill.reset();
  assert.equal(w.skill.snapshot.launches, 0);
});
test('ground activation and flight remain stable across 30 and 120 Hz', () => {
  const a = setup(),
    b = setup();
  for (const w of [a, b]) {
    w.skill.begin();
    w.skill.release({}, 0);
  }
  step(a, 0.9, { forward: 1 }, 0, 30);
  step(b, 0.9, { forward: 1 }, 0, 120);
  assert.equal(a.skill.snapshot.launches, 1);
  assert.equal(b.skill.snapshot.launches, 1);
  assert.ok(Math.abs(a.motor.position.z - b.motor.position.z) < 0.1);
  assert.ok(Math.abs(a.motor.position.y - b.motor.position.y) < 0.1);
});
