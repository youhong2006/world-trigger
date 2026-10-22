import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY, createCollisionIndex, groundHeight, riverZ } from './city-layout.js';
import { createCharacterMotor } from './character-motor.js';

const x = -1100, z = 1080;
test('standing and crouching use the same solid volumes at different body heights', () => {
  const collision = createCollisionIndex();
  collision.add({ x, z, w: 3, d: 3, y: 1.3, h: .3 });
  assert.equal(collision.canOccupy(x, z, 0, 1.8), false);
  assert.equal(collision.canOccupy(x, z, 0, 1.05), true);
  assert.equal(collision.canOccupy(x, z, 1.61, 1.8), true);
});

test('jumping clears a low boundary wall while a building still blocks the body', () => {
  const collision = createCollisionIndex();
  collision.add({ x, z, w: 6, d: .2, y: 0, h: .64 });
  assert.equal(collision.blockedAt(x, z, 0, 1.8), true);
  assert.equal(collision.blockedAt(x, z, .65, 1.8), false);
  collision.add({ x: x + 8, z, w: 4, d: 4, y: 0, h: 8 });
  assert.equal(collision.blockedAt(x + 8, z, 1.1, 1.8), true);
});

test('curb support includes body radius without turning tall walls into automatic steps', () => {
  const collision = createCollisionIndex();
  const floor = groundHeight(x, z);
  collision.add({ x, z, w: 2, d: 2, y: floor, h: .3 });
  assert.equal(collision.surfaceHeightAt(x + 1.2, z, floor, .38), floor + .3);
  assert.equal(collision.canOccupy(x + 1.2, z, floor + .3, 1.8), true);
  collision.add({ x: x + 8, z, w: 2, d: 2, y: floor, h: 1.6 });
  assert.equal(collision.surfaceHeightAt(x + 8, z, floor, .38), groundHeight(x + 8, z));
  assert.equal(collision.surfaceHeightAt(x + 8, z, floor + 1.7, .38), floor + 1.6);
});

test('camera sweep finds the closest wall across spatial bins and can pass above it', () => {
  const collision = createCollisionIndex();
  collision.add({ x: -49, z: 100, w: 2, d: 2, y: 0, h: 3 });
  collision.add({ x: -45, z: 100, w: 2, d: 2, y: 0, h: 3 });
  const from = { x: -54, y: 1.6, z: 100 }, to = { x: -40, y: 1.6, z: 100 };
  assert.ok(Math.abs(collision.segmentFraction(from, to, .25) - 3.75 / 14) < 1e-8);
  assert.equal(collision.segmentFraction({ ...from, y: 4 }, { ...to, y: 4 }, .25), 1);
  assert.equal(collision.segmentFraction({ x: -49, y: 1.6, z: 100 }, to), 0);
});

test('world and water limits constrain the player while leaving the camera free', () => {
  const collision = createCollisionIndex();
  const from = { x: 200, y: 3, z: riverZ(200) - 4 }, to = { ...from, z: riverZ(200) + 4 };
  assert.equal(collision.canOccupy(200, riverZ(200), 1, 1.8), false);
  assert.equal(collision.segmentFraction(from, to), 1);
});

test('all bridge approaches rise continuously from the street to the deck and sidewalk', () => {
  for (const bridge of CITY.bridges) for (const offset of [0, 8]) for (const side of [-1, 1]) {
    const edge = riverZ(bridge) + side * CITY.bridgeLength / 2;
    let previous = groundHeight(bridge + offset, edge + side * 14);
    for (let distance = 13.8; distance >= 0; distance -= .2) {
      const current = groundHeight(bridge + offset, edge + side * distance);
      assert.ok(Math.abs(current - previous) < .02, 'bridge approach must not block a normal walking step');
      previous = current;
    }
    assert.ok(Math.abs(previous - (offset ? .79 : .65)) < .01);
  }
});

test('a walking character can enter all three bridges in either direction without jumping', () => {
  for (const bridge of CITY.bridges) for (const offset of [0, 8]) for (const side of [-1, 1]) {
    const collision = createCollisionIndex();
    const motor = createCharacterMotor({ collision, groundHeight });
    const startZ = riverZ(bridge) + side * (CITY.bridgeLength / 2 + 20);
    const yaw = side > 0 ? 0 : Math.PI;
    motor.teleport({ x: bridge + offset, z: startZ }, yaw);
    for (let step = 0; step < 720; step++) motor.update(1 / 60, { forward: 1 }, yaw);
    assert.ok((startZ - motor.position.z) * side > 24, 'bridge approach must not stop a walking character');
    assert.equal(motor.grounded, true);
    assert.ok(Math.abs(motor.position.y - (offset ? .79 : .65)) < .001);
  }
});

test('airborne characters can cross a river while low walking positions remain blocked',()=>{
  const index=createCollisionIndex(),rz=riverZ(200);assert.equal(index.canOccupy(200,rz,10,1.75),true);assert.equal(index.canOccupy(200,rz,1,1.75),false);
});
test('pitched roof support follows the roof surface rather than a floating flat box',()=>{
  const index=createCollisionIndex();index.add({x,z,w:20,d:16,y:0,h:12,roof:{kind:'gable',bottom:8,height:4,w:20,d:16,rotation:0}});
  assert.ok(Math.abs(index.surfaceHeightAt(x,z,20)-12)<1e-8);const edge=index.surfaceHeightAt(x+8,z,20);assert.ok(edge>8.7&&edge<9.1);assert.equal(index.canOccupy(x+8,z,edge,1.75),true);assert.equal(index.canOccupy(x+8,z,edge-.2,1.75),false);
});

test('camera sweeps follow pitched roof planes without phantom walls above the eaves',()=>{
  for(const kind of ['gable','hip']) {
    const index=createCollisionIndex();index.add({x,z,w:20,d:16,y:0,h:12,roof:{kind,bottom:8,height:4,w:20,d:16,rotation:0}});
    const from={x:x+8,y:10.4,z},away={x:x+14,y:10.4,z},toward={x,y:10.4,z};
    assert.equal(index.segmentFraction(from,away,.24),1,kind+' camera can look away above the sloped surface');
    const hit=index.segmentFraction(from,toward,.24);assert.ok(hit>0&&hit<1,kind+' roof ridge still blocks the camera');
  }
});
