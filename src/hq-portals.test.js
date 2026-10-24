import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASE, createCollisionIndex } from './city-layout.js';
import { createHeadquarters } from './headquarters.js';
import { installCanvasDocument } from './hq-test-helpers.js';
import { createHQPortals, HQ_PORTALS, portalNear } from './hq-portals.js';

function ready(portals, position = { x: 0, y: 0, z: 278 }, world = 'city') {
  portals.update(2, position, world, true);
}

test('city fortress has one solid tapered body and a continuous roof instead of occupied wings', () => {
  installCanvasDocument();
  const index = createCollisionIndex(),
    scene = new THREE.Scene(),
    volumes = [],
    boxes = [];
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
  const result = createHeadquarters({
    scene,
    solidBody: true,
    solid(v) {
      volumes.push(v);
      index.add(convert(v));
    },
    box(x, y, z, w, h, d, color, solid = false) {
      boxes.push({ x, y, z, w, h, d });
      if (solid) index.add(convert({ x, y, z, w, h, d }));
      return new THREE.Object3D();
    },
    cylinder: () => new THREE.Object3D(),
  });
  assert.equal(result.solidBody, true);
  assert.equal(result.openRoof, false);
  assert.equal(result.occupiedWingDepth, 0);
  const body = volumes.find((v) => v.w === BASE.width && v.d === BASE.depth && v.h > BASE.height);
  assert.ok(body, 'full convex body exists');
  for (const [x, y, z] of [
    [0, 0, -150],
    [0, 100, -150],
    [43, 342, 198],
    [520, 200, -150],
    [0, 0, 249],
  ])
    assert.equal(index.canOccupy(x, z, y, 1.75, 0.3), false, `${x},${y},${z}`);
  for (const [x, z] of [
    [0, -150],
    [43, 198],
    [0, -440],
    [-520, -150],
  ])
    assert.ok(Math.abs(index.surfaceHeightAt(x, z, 350.1, 0.5) - 350) < 0.03, `roof at ${x},${z}`);
  assert.equal(index.canOccupy(0, 278, 0, 1.75, 0.3), true, 'street portal approach remains clear');
  assert.ok(
    boxes.some((b) => b.w > 60 && b.d > 40 && Math.abs(b.y - BASE.height) < 0.02),
    'single continuous roof patch',
  );
});

test('doorway transfers in both directions, with safe cooldown and independent world tracking', () => {
  let enter = 0,
    exit = 0;
  const portals = createHQPortals({ onEnter: () => enter++, onExit: () => exit++ });
  ready(portals);
  portals.update(0.1, { x: 0, y: 0, z: 259 }, 'city');
  assert.equal(enter, 1);
  portals.update(0.01, { x: 0, y: 0, z: 230 }, 'hq');
  assert.equal(exit, 0, 'arrival cannot bounce back');
  portals.update(2, { x: 0, y: 0, z: 230 }, 'hq');
  portals.update(0.01, { x: 0, y: 0, z: 245 }, 'hq');
  assert.equal(exit, 1);
  portals.update(2, { x: 0, y: 0, z: 278 }, 'city');
  assert.equal(enter, 1);
  assert.equal(portals.snapshot.transfers, 2);
});

test('F interaction respects proximity, disabled gameplay and reset debounce', () => {
  let enters = 0;
  const portals = createHQPortals({ onEnter: () => enters++ });
  ready(portals);
  assert.equal(portals.interact({ x: 0, y: 0, z: 263 }, 'city'), false);
  assert.equal(portals.interact({ x: 0, y: 0, z: 262 }, 'city'), true);
  assert.equal(enters, 1);
  portals.reset();
  assert.equal(portals.interact({ x: 0, y: 0, z: 260 }, 'city'), false);
  portals.update(2, { x: 0, y: 0, z: 260 }, 'city', false);
  assert.equal(
    portals.interact({ x: 0, y: 0, z: 260 }, 'city'),
    false,
    'training or paused state cannot transfer',
  );
  portals.update(0.01, { x: 0, y: 0, z: 262 }, 'city', true);
  assert.equal(portals.snapshot.nearby.action, 'enter');
  assert.equal(portals.interact({ x: 0, y: 0, z: 262 }, 'city'), true);
});

test('swept doorway crossing handles high speed, but rejects side approaches and upper floors', () => {
  for (const [from, to, expected] of [
    [{ x: 0, y: 0, z: 278 }, { x: 0, y: 0, z: 250.5 }, 1],
    [{ x: 20, y: 0, z: 278 }, { x: 20, y: 0, z: 250.5 }, 0],
    [{ x: 0, y: 30, z: 278 }, { x: 0, y: 30, z: 250.5 }, 0],
  ]) {
    let enter = 0;
    const portals = createHQPortals({ onEnter: () => enter++ });
    ready(portals, from);
    portals.update(0.02, to, 'city');
    assert.equal(enter, expected);
  }
  let enter = 0;
  const portals = createHQPortals({ onEnter: () => enter++ });
  portals.update(0.1, { x: 0, y: 0, z: 278 }, 'city');
  portals.update(0.1, { x: 0, y: 0, z: 255 }, 'city');
  assert.equal(enter, 0);
  portals.update(2, { x: 0, y: 0, z: 251 }, 'city');
  assert.equal(enter, 1, 'fast initial crossing waits on the pad until debounce expires');
  assert.equal(portalNear({ x: 0, y: 0, z: HQ_PORTALS.city.z }, 'invalid'), false);
});
