import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuidance, trackingStrength, turnToward } from './bullet-guidance.js';
import { createShootingSystem } from './projectiles.js';
import { createCombatCore } from './combat-core.js';
import { normalizeFire, shotCost } from './armory.js';
const origin = { x: 0, y: 2, z: 0 },
  point = { x: 0, y: 2, z: -60 };
const advance = (gun, time, hz = 120) => {
  for (let i = 0; i < time * hz; i++) gun.update(1 / hz);
};
function setup(extra = {}) {
  const combat = createCombatCore({ recovery: 0 });
  return { combat, gun: createShootingSystem({ combat, ...extra }) };
}
test('Viper preset and authored routes anchor to the release point and aim point in world space', () => {
  const g = createGuidance('viper', normalizeFire({ routePreset: 'left' }), origin, point, null);
  assert.ok(g.waypoints[0].x < 0);
  assert.deepEqual(g.waypoints.at(-1), point);
  const cfg = normalizeFire({ routeSource: 'custom', pathId: 'mine' }),
    paths = [
      {
        id: 'mine',
        points: [
          [0, 1, 0],
          [10, 5, -5],
          [10, 5, -15],
          [0, 1, -20],
        ],
      },
    ];
  const custom = createGuidance('viper', cfg, origin, point, null, paths);
  assert.equal(custom.waypoints[0].x, 10);
  assert.equal(custom.waypoints[0].y, 6);
  assert.deepEqual(custom.waypoints.at(-1), point);
});
test('curved Viper segments hit their target and cannot cut through cover on a turn', () => {
  const target = { id: 'T', position: { ...point }, health: 100, radius: 1 },
    hits = [];
  const { gun } = setup({ getTargets: () => [target], onHit: (id) => hits.push(id) });
  gun.fire('main', 'viper', { count: 1, spread: 0, routePreset: 'left' }, origin, point, 'T');
  advance(gun, 1);
  assert.deepEqual(hits, ['T']);
  const blocked = setup({
    getTargets: () => [target],
    traceWorld: (from, to) => (from.x > -3 && to.x <= -3 ? 0.1 : 1),
    onHit: () => assert.fail('cover should block'),
  });
  blocked.gun.fire('main', 'viper', { count: 1, spread: 0, routePreset: 'left' }, origin, point, 'T');
  advance(blocked.gun, 1);
  assert.equal(blocked.gun.snapshot.projectiles.length, 0);
});
test('Hound approach routes differ and surrounding volleys fan out per projectile', () => {
  const cfg = normalizeFire();
  const above = createGuidance('hound', cfg, origin, point, 'T');
  assert.ok(above.waypoints[0].y > point.y);
  const left = createGuidance('hound', { ...cfg, houndRoute: 'left' }, origin, point, 'T'),
    right = createGuidance('hound', { ...cfg, houndRoute: 'right' }, origin, point, 'T');
  assert.ok(left.waypoints[0].x < 0);
  assert.ok(right.waypoints[0].x > 0);
  const a = createGuidance('hound', { ...cfg, houndRoute: 'surround' }, origin, point, 'T', [], 0),
    b = createGuidance('hound', { ...cfg, houndRoute: 'surround' }, origin, point, 'T', [], 1);
  assert.notDeepEqual(a.waypoints, b.waypoints);
});
test('tracking strength changes over three flight stages and turning is bounded rather than instant', () => {
  const params = normalizeFire({ tracking: 'low-high-low' });
  assert.equal(trackingStrength(params, 0.1), 0.08);
  assert.equal(trackingStrength(params, 0.5), 1);
  assert.equal(trackingStrength(params, 0.9), 0.08);
  const turned = turnToward({ x: 0, y: 0, z: -100 }, { x: 1, y: 0, z: 0 }, Math.PI / 6);
  assert.ok(Math.abs(Math.hypot(turned.x, turned.y, turned.z) - 100) < 1e-8);
  assert.ok(Math.abs(turned.x - 50) < 1e-8);
});
test('high-tracking Hound follows a moved target while a lost target continues safely without relocking', () => {
  const target = { id: 'T', position: { ...point }, health: 100, radius: 1 },
    hits = [];
  const { gun } = setup({ getTargets: () => [target], onHit: (id) => hits.push(id) });
  gun.fire('main', 'hound', { count: 1, spread: 0, tracking: 'high' }, origin, point, 'T');
  advance(gun, 0.4);
  target.position.x = 4;
  advance(gun, 1);
  assert.deepEqual(hits, ['T']);
  const lost = setup({ getTargets: () => [] });
  lost.gun.fire('main', 'hound', { count: 1, spread: 0 }, origin, point, 'gone');
  advance(lost.gun, 4);
  assert.equal(lost.gun.snapshot.projectiles.length, 0);
});
test('generation, splitting and live tuning are free; each released batch costs exactly one point', () => {
  const { gun, combat } = setup();
  gun.prepare('main', 'viper', { count: 1 });
  gun.prepare('sub', 'viper', { count: 1 });
  assert.equal(combat.snapshot.remaining, 100);
  for (const count of [8, 27, 1, 27])
    assert.equal(gun.retune('viper', { count, damage: 18, speed: 180 }), true);
  assert.equal(combat.snapshot.remaining, 100);
  gun.fire('main', 'viper', {}, origin, point);
  assert.equal(combat.snapshot.remaining, 99);
  gun.fire('sub', 'viper', {}, origin, point);
  assert.equal(combat.snapshot.remaining, 98);
  gun.clear();
  assert.equal(combat.snapshot.remaining, 98);
});
test('guided flight remains consistent at render frame rates and a pause freezes waypoints too', () => {
  const run = (hz) => {
    const { gun } = setup();
    gun.fire('main', 'hound', { count: 1, spread: 0 }, origin, point, 'T');
    advance(gun, 0.5, hz);
    return gun.snapshot.projectiles[0].position;
  };
  const a = run(30),
    b = run(120);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-7);
  const { gun, combat } = setup();
  gun.fire('main', 'viper', { count: 1, routePreset: 'above' }, origin, point);
  advance(gun, 0.2);
  combat.pause(true);
  const before = gun.snapshot;
  advance(gun, 1);
  assert.deepEqual(gun.snapshot, before);
});

test('a released delayed batch keeps its route and speed while subsequent live settings change', () => {
  const paths = [
      {
        id: 'custom',
        points: [
          [0, 1, 0],
          [-8, 1, -5],
          [-8, 1, -15],
          [0, 1, -20],
        ],
      },
    ],
    { gun } = setup({ getPaths: () => paths });
  gun.prepare('main', 'viper', {
    count: 1,
    spread: 0,
    delay: 0.2,
    routeSource: 'custom',
    pathId: 'custom',
    speed: 65,
  });
  gun.fire('main', 'viper', {}, origin, point);
  paths[0].points[1][0] = 20;
  gun.retune('viper', { speed: 180, routePreset: 'right' });
  advance(gun, 0.35);
  const bullet = gun.snapshot.projectiles[0];
  assert.equal(bullet.guidance.params.speed, 65);
  assert.equal(bullet.guidance.waypoints[0].x, -8);
  assert.ok(Math.abs(Math.hypot(...Object.values(bullet.velocity)) - 65) < 1e-8);
});
