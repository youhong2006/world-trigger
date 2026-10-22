import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER, createCharacterMotor } from './character-motor.js';
import { createCollisionIndex, groundHeight } from './city-layout.js';

function world(boxes = [], groundHeight = () => 0) {
  const overlaps = (box, x, z, radius) => x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ;
  const collision = {
    canOccupy(x, z, feet, height, radius = CHARACTER.radius) {
      return !boxes.some(box => overlaps(box, x, z, radius) && feet < box.top - 1e-5 && feet + height > box.bottom + 1e-5);
    },
    surfaceHeightAt(x, z, feet, step) {
      return boxes.reduce((floor, box) => overlaps(box, x, z, CHARACTER.radius) && box.top <= feet + step + 1e-5 ? Math.max(floor, box.top) : floor, groundHeight(x, z));
    },
  };
  return createCharacterMotor({ groundHeight, collision });
}
function simulate(motor, seconds, input = {}, yaw = 0, dt = 1 / 60) {
  for (let time = 0; time < seconds - 1e-8; time += dt) motor.update(Math.min(dt, seconds - time), input, yaw);
  return motor.state;
}

test('walking, forward sprint and diagonal motion use metres per second without diagonal speed gain', () => {
  const walk = world(), run = world(), diagonal = world();
  simulate(walk, 3, { forward: 1 });
  simulate(run, 3, { forward: 1, sprint: true });
  simulate(diagonal, 3, { forward: 1, strafe: 1 });
  assert.ok(Math.abs(walk.speed - 2.2) < .001);
  assert.ok(Math.abs(run.speed - 6.2) < .001);
  assert.ok(Math.abs(diagonal.speed - walk.speed) < .001);
  assert.ok(Math.abs(Math.hypot(diagonal.position.x, diagonal.position.z) + walk.position.z) < .001);
  assert.ok(run.position.z < walk.position.z * 2.7);
  simulate(walk, .5);
  assert.ok(walk.speed < .002, 'released movement must settle to an idle');
  assert.equal(walk.animation, 'idle');
});

test('jump has a ballistic apex, falls and lands, and holding jump cannot create repeated jumps', () => {
  const motor = world();
  let apex = 0, launches = 0, wasGrounded = true, sawFall = false, sawLanding = false;
  for (let frame = 0; frame < 180; frame++) {
    motor.update(1 / 120, { jump: true }, 0);
    apex = Math.max(apex, motor.position.y);
    if (wasGrounded && !motor.grounded) launches++;
    if (motor.animation === 'fall') sawFall = true;
    if (motor.animation === 'land') sawLanding = true;
    wasGrounded = motor.grounded;
  }
  assert.equal(launches, 1);
  assert.ok(Math.abs(apex - 1.08) < .015, `unexpected jump apex ${apex}`);
  assert.ok(sawFall && sawLanding);
  assert.equal(motor.grounded, true);
  assert.ok(motor.lastLandingSpeed > 6.5);
  motor.update(1 / 60, { jump: false });
  motor.update(1 / 60, { jump: true });
  assert.equal(motor.grounded, false, 'a fresh press after release should jump again');
});

test('jump buffering and brief edge grace make movement responsive without granting double jumps', () => {
  const buffered = world();
  buffered.teleport({ x: 0, y: .08, z: 0 });
  simulate(buffered, .20, { jump: true });
  assert.ok(buffered.position.y > .4 && buffered.velocity.y > 0, 'press just before landing should launch on landing');
  const edge = world([], x => x < 0 ? 0 : -2);
  edge.teleport({ x: -.05, z: 0 });
  for (let frame = 0; edge.position.x < 0 && frame < 50; frame++) edge.update(1 / 120, { strafe: 1 });
  assert.equal(edge.grounded, false);
  edge.update(1 / 60, { strafe: 1, jump: true });
  assert.ok(edge.velocity.y > 6, 'briefly leaving a ledge still permits the jump');
  simulate(edge, .1, { strafe: 1, jump: false });
  const before = edge.velocity.y;
  edge.update(1 / 60, { strafe: 1, jump: true });
  assert.ok(edge.velocity.y < before, 'an airborne second press cannot reset vertical velocity');
});

test('crouch lowers the body, slows movement and waits for headroom before standing', () => {
  const ceiling = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, bottom: 1.12, top: 1.5 };
  const motor = world([ceiling]);
  motor.update(1 / 60, { crouch: true });
  assert.equal(motor.height, 1.05);
  assert.equal(motor.eyeHeight, .95);
  motor.update(1 / 60, {});
  assert.equal(motor.crouched, true, 'standing must remain blocked under a low ceiling');
  simulate(motor, .3, { crouch: true, jump: true });
  assert.ok(motor.position.y < .071, 'jump must hit the underside rather than pass through the ceiling');
  simulate(motor, 3, { crouch: true, forward: 1 });
  assert.ok(Math.abs(motor.speed - 1.15) < .001);
  motor.update(1 / 60, {});
  assert.equal(motor.crouched, false);
  assert.equal(motor.eyeHeight, 1.68);
  assert.equal(motor.height, 1.8);
});

test('small curbs are stepped onto while higher barriers need a jump and can support a landing', () => {
  const curb = { minX: 0, maxX: .6, minZ: -2, maxZ: 2, bottom: 0, top: .3 };
  const motor = world([curb]);
  motor.teleport({ x: -.9, z: 0 });
  let highest = 0;
  for (let frame = 0; frame < 100; frame++) {
    motor.update(1 / 120, { strafe: 1 });
    highest = Math.max(highest, motor.position.y);
  }
  assert.ok(highest >= .3 && highest < .31);
  assert.ok(motor.position.x > .6, 'a curb must not block an ordinary walking route');
  const wall = { ...curb, top: .6 };
  const walker = world([wall]);
  walker.teleport({ x: -.65, z: 0 });
  simulate(walker, 1, { strafe: 1 });
  assert.ok(walker.position.x <= -.28 + 1e-5, 'the high wall cannot be auto-stepped');
  walker.update(1 / 120, { jump: true, strafe: 1 });
  simulate(walker, .65, { strafe: 1 });
  assert.ok(walker.position.x > .3, 'a real jump must allow clearance over the low wall');
  assert.ok(walker.position.y >= .6 - .01, 'the wall top should support a landing');
});

test('wall collision slides tangentially and large frame times do not tunnel through thin barriers', () => {
  const barrier = { minX: 0, maxX: .08, minZ: -100, maxZ: 100, bottom: 0, top: 3 };
  const motor = world([barrier]);
  motor.teleport({ x: -.6, z: 0 });
  simulate(motor, 1, { forward: 1, strafe: 1, sprint: true }, 0, .25);
  assert.ok(motor.position.x <= -.28 + 1e-5);
  assert.ok(motor.position.z < -3, 'movement parallel to the wall must continue');
  assert.ok(Math.abs(motor.velocity.x) < 1e-5);
});

test('gentle slopes are walkable, steep ascents are blocked, and airborne characters cannot enter terrain', () => {
  const gentle = world([], x => Math.max(0, x) * Math.tan(Math.PI / 6));
  const steep = world([], x => Math.max(0, x) * Math.tan(Math.PI / 3));
  gentle.teleport({ x: -.7, z: 0 });steep.teleport({ x: -.7, z: 0 });
  simulate(gentle, 1, { strafe: 1 });simulate(steep, 1, { strafe: 1 });
  assert.ok(gentle.position.x > 1 && gentle.grounded);
  assert.ok(steep.position.x < .12);
  const diagonalSlope = world([], (x, z) => Math.max(0, x + z) * .8);
  diagonalSlope.teleport({ x: -.5, z: -.5 });
  simulate(diagonalSlope, 1, { strafe: 1, forward: -1 });
  assert.ok(diagonalSlope.position.x + diagonalSlope.position.z < .3, 'diagonal motion must not bypass the slope limit');
  const cliff = world([], x => x >= 0 ? 4 : 0);
  cliff.teleport({ x: -.6, y: .8, z: 0 });
  simulate(cliff, .3, { strafe: 1 });
  assert.ok(cliff.position.x < 0, 'jumping cannot enter the side of a high terrain ledge');
});

test('controller motion is consistent across render frame rates and teleport clears previous input state', () => {
  const a = world(), b = world();
  simulate(a, 2, { forward: 1, strafe: .3, sprint: true }, .7, 1 / 30);
  simulate(b, 2, { forward: 1, strafe: .3, sprint: true }, .7, 1 / 120);
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < .002);
  a.teleport({ x: 12, z: -4 }, Math.PI / 2);
  assert.deepEqual(a.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(a.animation, 'idle');
  assert.equal(a.heading, Math.PI / 2);
  assert.equal(a.position.y, 0);
});

test('a queued jump tap is accepted even when the key was released between rendered frames', () => {
  const motor = world();
  motor.update(.1, { jump: false, jumpPressed: true }, 0);
  assert.equal(motor.grounded, false);
  assert.ok(motor.position.y > .5);
  simulate(motor, 1, { jump: false });
  assert.equal(motor.grounded, true);
});

test('the real spatial collision index supports curbs and height-dependent crouch clearance', () => {
  const collision = createCollisionIndex();
  const floor = groundHeight(-1070, 1080);
  collision.add({ x: -1069, z: 1080, w: .5, d: 2, y: floor, h: .3 });
  const motor = createCharacterMotor({ groundHeight, collision });
  motor.teleport({ x: -1070, z: 1080 });
  let stoodOnCurb = false;
  for (let frame = 0; frame < 100; frame++) {
    motor.update(1 / 120, { strafe: 1 }, 0);
    if (motor.position.y >= floor + .29) stoodOnCurb = true;
  }
  assert.ok(stoodOnCurb && motor.position.x > -1068.8, 'real height-aware bins must permit auto-stepping');
  collision.add({ x: -1070, z: 1080, w: 2, d: 2, y: floor + 1.12, h: .4 });
  motor.teleport({ x: -1070, z: 1080 });
  motor.update(1 / 60, { crouch: true }, 0);
  motor.update(1 / 60, {}, 0);
  assert.equal(motor.crouched, true, 'actual city collision prevents standing into a ceiling');
});
