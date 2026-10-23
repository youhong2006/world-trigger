import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatCore } from './combat-core.js';
import { createShootingSystem, createWorldTrace, chooseAimPoint, segmentSphere } from './projectiles.js';
import { createCollisionIndex } from './city-layout.js';
import { shotCost } from './armory.js';
const origin = { x: 0, y: 2, z: 0 },
  point = { x: 0, y: 2, z: -100 };
const advance = (gun, time, hz = 120) => {
  for (let i = 0; i < Math.round(time * hz); i++) gun.update(1 / hz);
};
const setup = (options = {}) => {
  const combat = createCombatCore({ recovery: 0 });
  return { combat, gun: createShootingSystem({ combat, ...options }) };
};
test('cube generation is free, release pays once and can fire alongside a prepared Grasshopper', () => {
  const { combat, gun } = setup();
  combat.begin('grasshopper');
  assert.equal(gun.prepare('main', 'asteroid', {}), true);
  assert.equal(combat.snapshot.remaining, 100);
  assert.equal(combat.snapshot.charging, 'grasshopper');
  assert.equal(gun.prepare('main', 'asteroid', {}), false);
  assert.equal(gun.fire('main', 'asteroid', {}, origin, point), true);
  assert.equal(combat.snapshot.remaining, 99);
  advance(gun, 0.15);
  assert.equal(gun.snapshot.emitted, 8);
  assert.equal(gun.snapshot.projectiles.length, 8);
  advance(gun, 0.4);
  assert.equal(gun.prepare('main', 'viper', {}), true);
  gun.clear('main');
  assert.equal(combat.snapshot.remaining, 99);
  assert.equal(gun.snapshot.prepared.main, null);
  assert.equal(combat.consume('grasshopper'), true);
  assert.equal(combat.snapshot.remaining, 98.7);
});
test('delays and burst order retain a visible queued cube and pause their simulation clock', () => {
  const { combat, gun } = setup();
  const cfg = { count: 8, mode: 'burst', delay: 0.3, interval: 0.1, spread: 0 };
  gun.fire('main', 'asteroid', cfg, origin, point);
  advance(gun, 0.2);
  assert.equal(gun.snapshot.emitted, 0);
  assert.equal(gun.snapshot.queued[0].indices.length, 8);
  const before = gun.snapshot;
  combat.pause(true);
  advance(gun, 1);
  assert.deepEqual(gun.snapshot, before);
  combat.pause(false);
  advance(gun, 0.25);
  assert.equal(gun.snapshot.emitted, 1);
  assert.equal(gun.snapshot.pending, 7);
  gun.clear('main');
  advance(gun, 1);
  assert.equal(gun.snapshot.emitted, 1);
  assert.equal(gun.snapshot.pending, 0);
  assert.equal(combat.snapshot.remaining, 100 - shotCost(cfg));
});
test('fast bullets sweep the nearest living target and deal damage only once per projectile', () => {
  const near = { id: 'near', health: 16, radius: 0.3, position: { x: 0, y: 2, z: -8 } },
    far = { id: 'far', health: 24, radius: 0.5, position: { x: 0, y: 2, z: -18 } },
    hits = [];
  const { gun } = setup({
    getTargets: () => [far, near],
    onHit: (id, damage) => {
      hits.push(id);
      const target = id === 'near' ? near : far;
      target.health -= damage;
    },
  });
  gun.fire('main', 'asteroid', { count: 8, spread: 0, speed: 180 }, origin, point);
  advance(gun, 0.5, 30);
  assert.deepEqual(hits, ['near', 'near', 'far', 'far', 'far']);
  assert.equal(gun.snapshot.hits, 5);
  assert.equal(near.health, 0);
  assert.equal(far.health, 0);
  assert.equal(gun.snapshot.accuracy, 5 / 8);
});
test('world walls and terrain block shots before targets, including thin cover at maximum bullet speed', () => {
  const collision = createCollisionIndex();
  collision.add({ x: 0, z: -8, w: 10, d: 0.08, y: 0, h: 4 });
  const traceWorld = createWorldTrace(collision, () => 0),
    hits = [];
  const target = { id: 'behind', health: 100, radius: 1, position: { x: 0, y: 2, z: -15 } };
  const { gun } = setup({ traceWorld, getTargets: () => [target], onHit: (id) => hits.push(id) });
  gun.fire('main', 'asteroid', { count: 8, speed: 180, spread: 0 }, origin, point);
  advance(gun, 0.6, 30);
  assert.equal(hits.length, 0);
  assert.equal(gun.snapshot.projectiles.length, 0);
  const fraction = createWorldTrace({ segmentFraction: () => 1 }, () => 0)(
    { x: 0, y: 4, z: 0 },
    { x: 0, y: -4, z: 0 },
  );
  assert.ok(Math.abs(fraction - 0.495) < 0.002);
});
test('Asteroid, direct Viper and Meteor straight flight remains frame-consistent and expires at range', () => {
  const run = (hz, type) => {
    const { gun } = setup();
    gun.fire(
      'main',
      type,
      { count: 1, spread: 0, speed: 110, range: 60, pathId: 'turn-left' },
      origin,
      point,
    );
    advance(gun, 0.3, hz);
    return gun;
  };
  const a = run(30, 'viper'),
    b = run(120, 'meteor');
  assert.ok(Math.abs(a.snapshot.projectiles[0].position.z - b.snapshot.projectiles[0].position.z) < 1e-8);
  assert.equal(a.snapshot.projectiles[0].position.x, 0);
  assert.equal(a.snapshot.projectiles[0].position.y, 2);
  advance(a, 1);
  assert.equal(a.snapshot.projectiles.length, 0);
  const vertical = setup().gun;
  vertical.fire('main', 'asteroid', { count: 8 }, origin, { x: 0, y: 100, z: 0 });
  advance(vertical, 0.2);
  assert.ok(vertical.snapshot.projectiles.every((p) => Object.values(p.velocity).every(Number.isFinite)));
});
test('new volleys obey cooldown and resource limits without unbounded projectile queues', () => {
  const { combat, gun } = setup();
  for (let n = 0; n < 1000; n++) gun.fire('main', 'asteroid', { count: 27 }, origin, point);
  assert.equal(gun.snapshot.pending, 27);
  assert.equal(combat.snapshot.remaining, 100 - shotCost({ count: 27 }));
  advance(gun, 0.5);
  combat.damage(100);
  assert.equal(gun.prepare('sub', 'meteor', {}), false);
  assert.equal(gun.fire('main', 'asteroid', {}, origin, point), false);
  gun.reset();
  assert.equal(gun.snapshot.pending, 0);
  assert.equal(gun.snapshot.emitted, 0);
});
test('manual aim hits the actual ray; assisted aim requires a visible target within its cone', () => {
  const target = { id: 'T', health: 10, radius: 1, position: { x: 4, y: 2, z: -50 } };
  const options = {
    origin,
    forward: { x: 0, y: 0, z: -1 },
    range: 100,
    targets: [target],
    traceWorld: () => 1,
  };
  assert.equal(chooseAimPoint(options).targetId, null);
  assert.equal(chooseAimPoint({ ...options, assist: true }).targetId, 'T');
  assert.deepEqual(chooseAimPoint({ ...options, assist: true }).point, target.position);
  assert.equal(chooseAimPoint({ ...options, assist: true, traceWorld: () => 0.5 }).targetId, null);
  target.position.x = 20;
  assert.equal(chooseAimPoint({ ...options, assist: true }).targetId, null);
  assert.equal(chooseAimPoint({ ...options, assist: true, selectedId: 'T' }).targetId, 'T');
  assert.equal(segmentSphere(origin, point, { x: 0, y: 2, z: -50 }, 1), 0.49);
});
test('spending the last trion cannot resurrect a prepared cube after emergency exit', () => {
  const combat = createCombatCore({ maximum: 1, recovery: 0 });
  const gun = createShootingSystem({ combat });
  combat.subscribe((e) => {
    if (e.type === 'exhausted') gun.clear();
  });
  assert.equal(gun.prepare('main', 'asteroid', {}), true);
  assert.equal(combat.snapshot.remaining, 1);
  assert.equal(gun.fire('main', 'asteroid', {}, origin, point), false);
  assert.equal(combat.snapshot.state, 'exhausted');
  assert.equal(gun.snapshot.prepared.main, null);
});
