import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCollisionIndex } from './city-layout.js';
import { createCharacterMotor } from './character-motor.js';
import { HQ_SPECIAL_FACILITIES } from './hq-layout.js';
import { createHQWorld, headquartersGroundHeight, HQ_WORLD_ENTRY, HQ_CITY_RETURN } from './hq-world.js';
import { installCanvasDocument } from './hq-test-helpers.js';

function fixture() {
  installCanvasDocument();
  const city = new THREE.Scene(),
    cityIndex = createCollisionIndex();
  cityIndex.add({ x: 0, y: 0, z: -150, w: 1248, h: 350, d: 800 });
  const world = createHQWorld();
  const collision = Object.fromEntries(
    ['canOccupy', 'surfaceHeightAt'].map((key) => [
      key,
      (...args) => (world.active ? world.index : cityIndex)[key](...args),
    ]),
  );
  const motor = createCharacterMotor({
    groundHeight: (x, z) => (world.active ? world.groundHeight(x, z) : 0),
    collision,
  });
  motor.teleport({ ...HQ_CITY_RETURN }, 0);
  return { world, motor, city, cityIndex };
}

test('headquarters world has its own scene, collision, facilities and basement datum', () => {
  const { world, city, cityIndex } = fixture();
  assert.notEqual(world.scene, city);
  assert.notEqual(world.index, cityIndex);
  assert.equal(world.scene.children.includes(world.interior.root), true);
  assert.equal(city.children.includes(world.interior.root), false);
  assert.equal(cityIndex.canOccupy(0, 230, 0, 1.75), false);
  assert.equal(world.index.canOccupy(0, 230, 0, 1.75), true);
  assert.equal(headquartersGroundHeight(260, -470), -12);
  assert.equal(headquartersGroundHeight(0, -150), 0);
  assert.equal(headquartersGroundHeight(0, 278), 0);
  assert.deepEqual(
    world.interior.facilities.map((facility) => facility.id),
    HQ_SPECIAL_FACILITIES.map((facility) => facility.id),
  );
  assert.equal(world.interior.facilities.filter((facility) => facility.kind === 'hangar').length, 1);
  assert.equal(world.worldObjects.includes(world.interior.root), true);
  assert.equal(world.worldObjects.includes(world.range.root), true);
});

test('enter and exit transfer only gameplay visuals and return beyond the city portal', () => {
  const { world, motor, city } = fixture();
  const avatar = new THREE.Group(),
    gun = new THREE.Group(),
    cityMesh = new THREE.Group(),
    light = new THREE.PointLight();
  avatar.position.set(5, 3, 4);
  city.add(avatar, gun, cityMesh, light);
  motor.teleport({ x: 0, y: 0, z: 260 }, 0.1);
  const first = world.enter({ motor, view: { yaw: 0.1, pitch: 0.2 }, objects: [avatar, gun, light] });
  assert.equal(world.active, true);
  assert.deepEqual(first.position, HQ_WORLD_ENTRY);
  assert.deepEqual(motor.state.position, HQ_WORLD_ENTRY);
  assert.equal(motor.grounded, true);
  assert.equal(avatar.parent, world.scene);
  assert.equal(gun.parent, world.scene);
  assert.equal(cityMesh.parent, city);
  assert.equal(light.parent, city);
  assert.deepEqual(avatar.getWorldPosition(new THREE.Vector3()).toArray(), [5, 3, 4]);
  assert.equal(world.enter({ motor, view: { yaw: 2 }, objects: [cityMesh] }), false);
  assert.equal(world.anchor.position.z, 260);
  assert.equal(world.anchor.yaw, 0.1);
  assert.equal(cityMesh.parent, city);
  const exit = world.exit({ motor });
  assert.equal(world.active, false);
  assert.deepEqual(exit, { position: HQ_CITY_RETURN, yaw: Math.PI, pitch: 0 });
  assert.deepEqual(motor.state.position, HQ_CITY_RETURN);
  assert.equal(avatar.parent, city);
  assert.equal(gun.parent, city);
  assert.equal(world.snapshot.transferredObjects, 0);
  assert.equal(world.exit({ motor }), false);
  assert.equal(world.enter({ motor, objects: [avatar, gun] }) !== false, true);
  assert.equal(world.exit({ motor }) !== false, true);
  assert.equal(avatar.parent, city);
});

test('explicit return anchors are copied and shooting hall works only when enabled in its world', () => {
  const { world, motor } = fixture();
  const returnPoint = { x: 12, y: 0, z: 286 };
  world.enter({ motor, returnPoint, returnView: { yaw: 1.2, pitch: -0.1 } });
  returnPoint.z = 0;
  const rangePoint = { x: -144, y: 36, z: 234 };
  world.range.update(0.1, rangePoint, true);
  assert.equal(world.range.active, true);
  world.range.recordShot();
  assert.equal(world.range.snapshot.shots, 1);
  const exit = world.exit({ motor });
  assert.equal(world.range.active, false);
  assert.equal(exit.position.z, 286);
  assert.equal(exit.yaw, 1.2);
  assert.equal(exit.pitch, -0.1);
});

test('the independent basement remains grounded and walkable without the city surface sealing it', () => {
  const { world, motor } = fixture();
  world.enter({ motor });
  motor.teleport({ x: 260, y: -12, z: -470 }, 0);
  assert.equal(motor.grounded, true);
  assert.ok(Math.abs(world.index.surfaceHeightAt(260, -470, -12) + 12) < 0.02);
  for (let tick = 0; tick < 120; tick++) motor.update(1 / 120, { forward: 1 }, 0);
  assert.ok(motor.position.z < -471);
  assert.ok(Math.abs(motor.position.y + 12) < 0.02);
  assert.equal(motor.grounded, true);
});
