import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY, riverZ, createCollisionIndex, groundHeight, streetPosition, inCampus } from './city-layout.js';

test('all three bridges permit crossing while the water between them blocks walking', () => {
  const collision = createCollisionIndex();
  for (const x of CITY.bridges) {
    for (let z = riverZ(x) - 50; z <= riverZ(x) + 50; z += 5) {
      assert.equal(collision.blocked(x, z), false);
    }
  }
  assert.equal(collision.blocked(200, riverZ(200)), true);
  assert.equal(collision.blocked(-240, riverZ(-240)), true);
  assert.equal(collision.blocked(200, riverZ(200) + 55), false);
});

test('building collision spans spatial bins and handles negative coordinates', () => {
  const collision = createCollisionIndex();
  collision.add({ x: -49, z: -97, w: 30, d: 80 });
  assert.equal(collision.blocked(-62, -132), true);
  assert.equal(collision.blocked(-36, -62), true);
  assert.equal(collision.blocked(-30, -97), false);
  assert.equal(collision.blocked(-49, -140), false);
});

test('lookout ramp connects the street to a walkable raised platform', () => {
  assert.equal(groundHeight(-647, 265), 0);
  assert.equal(groundHeight(-647, 200), 13);
  assert.equal(groundHeight(-647, 120), 29);
  assert.equal(groundHeight(0, riverZ(0)), 0.65);
  assert.equal(groundHeight(0, 40), 0);
});

test('organic streets preserve bridge axes and leave the base approach outside the campus', () => {
  for (const x of CITY.bridges) assert.equal(streetPosition(x, 504).x, x);
  assert.equal(inCampus(0, -150), true);
  assert.equal(inCampus(0, 40), false);
});
