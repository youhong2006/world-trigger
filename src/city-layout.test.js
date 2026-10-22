import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY, BASE, basinRadius, terrainHeight, settlementDensity, riverZ, ringDistance, createCollisionIndex, groundHeight, streetPosition, inCampus } from './city-layout.js';

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

test('walking and the viewpoint use the same continuous terrain as the rendered landscape', () => {
  assert.ok(groundHeight(CITY.lookout.x, CITY.lookout.z) >= 44);
  for (const z of [120, 160, 200, 265]) assert.equal(groundHeight(CITY.lookout.x, z), terrainHeight(CITY.lookout.x, z));
  assert.equal(groundHeight(0, riverZ(0)), 0.65);
  assert.equal(groundHeight(0, 460), 0);
});

test('organic streets preserve bridge axes and leave the base approach outside the campus', () => {
  for (const x of CITY.bridges) assert.equal(streetPosition(x, 1008).x, x);
  assert.equal(inCampus(0, -150), true);
  assert.equal(inCampus(0, 460), false);
});


test('the new base is exactly five times the previous linear dimensions and fits the cleared campus', () => {
  assert.equal(BASE.scale / BASE.previousScale, 5);
  assert.equal(BASE.width * BASE.scale, 1248);
  assert.equal(BASE.depth * BASE.scale, 800);
  assert.equal(BASE.height * BASE.scale, 864);
  for (const x of [-BASE.width * BASE.scale / 2, BASE.width * BASE.scale / 2]) {
    for (const z of [BASE.z - BASE.depth * BASE.scale / 2, BASE.z + BASE.depth * BASE.scale / 2]) assert.equal(inCampus(x, z), true);
  }
  assert.equal(groundHeight(BASE.x, BASE.z), 17.6);
});

test('the south perimeter and base walking spawn remain clear of the river', () => {
  assert.equal(ringDistance(0, CITY.ring.maxZ), 0);
  assert.ok(CITY.ring.maxZ + 10 < riverZ(0) - CITY.riverWidth / 2);
  assert.equal(inCampus(-504, 720), false);
  assert.equal(inCampus(CITY.lookout.x, CITY.lookout.z), false);
  assert.equal(groundHeight(0, 460), 0);
});


test('the enlarged basin has an irregular nonrectangular edge and a gradual density falloff', () => {
  assert.ok(CITY.basinX > 3000 && CITY.basinZ >= 3000);
  assert.ok(basinRadius(3300, 0) < 1.1);
  assert.ok(basinRadius(3300, 2900) > 1.2);
  assert.ok(settlementDensity(1100, 0) > settlementDensity(2800, 0));
  assert.equal(settlementDensity(5000, 5000), 0);
  const collision = createCollisionIndex();
  assert.equal(collision.blocked(6000, 0), true);
});

test('the relocated river remains a clear valley even through the enclosing mountains', () => {
  assert.equal(riverZ(0), 1250);
  assert.ok(riverZ(-2500) < riverZ(2500));
  for (let x = -6000; x <= 6000; x += 200) assert.ok(terrainHeight(x, riverZ(x)) < 0.01);
});

test('foothills rise around the basin without square tile seams or abrupt height steps', () => {
  let mountainDirections = 0;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const x = Math.cos(a) * CITY.basinX * 1.4, z = Math.sin(a) * CITY.basinZ * 1.4;
    const h = terrainHeight(x, z);
    if (h > 200) mountainDirections++;
    assert.ok(Math.abs(terrainHeight(x + .1, z) - h) < 2);
    assert.ok(Math.abs(terrainHeight(x, z + .1) - h) < 2);
  }
  assert.ok(mountainDirections >= 20, 'Mountains must enclose the basin on all sides apart from river valleys');
  for (const x of [-1180, 1180, -3100, 3100]) {
    assert.ok(Math.abs(terrainHeight(x + .01, 1700) - terrainHeight(x - .01, 1700)) < .5);
  }
});
