import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createPlayerCamera } from './player-camera.js';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const state = (changes = {}) => ({ position: { x: 0, y: 0, z: 0 }, eyeHeight: 1.68, yaw: 0, pitch: 0, ...changes });
function setup(options = {}) {
  const camera = new PerspectiveCamera(51, 1.5, 5, 30000);
  return { camera, view: createPlayerCamera({ camera, groundHeight: () => 0, ...options }) };
}

test('switching first/third preserves player position and facing, including crouched first-person height', () => {
  const { camera, view } = setup();
  const player = Object.freeze({ position: Object.freeze({ x: 30, y: 2, z: -40 }), eyeHeight: 1.68, yaw: Math.PI / 2, pitch: .15 });
  const before = structuredClone(player);
  view.update(1 / 60, player);
  near(camera.position.y, 3.68);
  near(camera.rotation.y, Math.PI / 2);
  assert.equal(camera.fov, 62);assert.equal(camera.near, .10);
  assert.equal(view.avatarVisible, false);
  assert.equal(view.toggle(), 'third');view.update(1 / 60, player);
  assert.equal(camera.fov, 60);assert.equal(view.avatarVisible, true);
  near(view.diagnostics.actualDistance, 4.2);
  view.toggle();view.update(1 / 60, { ...player, eyeHeight: .95 });
  near(camera.position.y, 2.95);
  near(camera.rotation.y, Math.PI / 2);
  assert.equal(view.avatarVisible, false);
  assert.deepEqual(player, before);
});

test('third-person camera pulls in before a wall, including its smoothed previous position', () => {
  let closed = false;
  const wallZ = 2;
  const collision = {
    segmentFraction(from, to, radius) {
      if (!closed || to.z <= wallZ - radius) return 1;
      return Math.max(0, (wallZ - radius - from.z) / (to.z - from.z));
    },
  };
  const { camera, view } = setup({ collision });
  view.setMode('third');view.update(1 / 60, state());
  assert.ok(camera.position.z > 4);
  closed = true;view.update(1 / 120, state());
  assert.ok(camera.position.z < wallZ - .24, 'the old smoothed camera must not remain behind the wall');
  assert.ok(view.diagnostics.actualDistance < 1.8);
  assert.equal(view.diagnostics.obstructed, true);
  assert.equal(view.avatarVisible, true);
});

test('terrain between player and camera blocks the boom even when its endpoint is clear', () => {
  const groundHeight = (_x, z) => z > 1.2 && z < 2.2 ? 2 : 0;
  const { camera, view } = setup({ groundHeight });
  view.setMode('third');view.update(1 / 60, state());
  assert.ok(camera.position.z < 1.2, 'camera must stay in front of the intervening ridge');
  assert.ok(camera.position.y > groundHeight(camera.position.x, camera.position.z) + .24);
  assert.equal(view.diagnostics.obstructed, true);
  view.update(1 / 60, state({ pitch: 1.2, eyeHeight: .95 }));
  assert.ok(camera.position.y >= groundHeight(camera.position.x, camera.position.z) + .24);
});

test('close obstruction hides the avatar before it fills or intersects the camera', () => {
  const { view } = setup({ collision: { segmentFraction: () => .1 } });
  view.setMode('third');view.update(1 / 60, state());
  assert.ok(view.diagnostics.actualDistance < .65);
  assert.equal(view.avatarVisible, false);
});

test('zoom is bounded and respawn resets chase interpolation without changing the chosen perspective', () => {
  const { camera, view } = setup();
  view.zoom(-1000);view.setMode('third');view.update(1 / 60, state());
  near(view.diagnostics.desiredDistance, 4.2, 1e-8);
  view.zoom(-1e9);view.update(1 / 60, state());near(view.diagnostics.desiredDistance, 1.4);
  view.zoom(1e9);view.zoom(1e9);view.update(1 / 60, state());near(view.diagnostics.desiredDistance, 9);
  view.reset();view.update(1 / 60, state({ position: { x: 2500, y: 4, z: -1200 } }));
  assert.equal(view.mode, 'third');near(view.diagnostics.actualDistance, 9);
  assert.ok(camera.position.distanceTo(new Vector3(2500, 4 + 1.68 * .9, -1200)) < 9.001);
});

test('chase smoothing has the same response at 60Hz and 120Hz', () => {
  function result(hz) {
    const { camera, view } = setup();
    view.setMode('third');view.update(1 / hz, state());
    for (let i = 0; i < hz; i++) view.update(1 / hz, state({ position: { x: 1, y: 0, z: 0 }, yaw: .5 }));
    return camera.position;
  }
  assert.ok(result(60).distanceTo(result(120)) < 1e-7);
});

test('camera settings affect FOV, shoulder, distance and optional speed feedback without moving the player',()=>{
  const {camera,view}=setup();view.setMode('third');view.configure({fov:80,cameraDistance:6,shoulder:'left',cameraSmooth:20,speedFov:true,reducedMotion:false});
  const player=state({speed:42});view.update(1/60,player);assert.equal(camera.fov,87);assert.equal(view.diagnostics.shoulder,-.32);near(view.diagnostics.desiredDistance,6);
  view.configure({fov:80,shoulder:'right',speedFov:true,reducedMotion:true});view.update(1/60,player);assert.equal(camera.fov,80);assert.equal(view.diagnostics.shoulder,.32);assert.deepEqual(player.position,{x:0,y:0,z:0});
});
test('aiming narrows the view and suppresses speed FOV in both perspectives', () => {
  const { camera, view } = setup();
  view.configure({ fov: 75, speedFov: true });
  view.setMode('third');
  view.update(1 / 60, state({ speed: 50, aiming: true }));
  assert.equal(camera.fov, 59);
  view.setMode('first');
  view.update(1 / 60, state({ speed: 50, aiming: true }));
  assert.equal(camera.fov, 59);
  view.update(1 / 60, state({ speed: 50 }));
  assert.equal(camera.fov, 82);
});
