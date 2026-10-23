import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatCore } from './combat-core.js';
import { createBattleBody } from './battle-body.js';
import { createMeleeCombat } from './melee-combat.js';
import { createBattleSession, cleanBattleRecords } from './battle-session.js';
import { createCollisionIndex } from './city-layout.js';
import { createShootingSystem, createWorldTrace } from './projectiles.js';
import { createCharacterMotor } from './character-motor.js';
import { findArenaPath } from './arena-navigation.js';
const groundHeight = () => 0;
function setup() {
  const combat = createCombatCore(),
    collision = createCollisionIndex(),
    events = [],
    hits = [],
    results = [];
  const traceWorld = createWorldTrace(collision, groundHeight);
  const battle = createBattleSession({
    groundHeight,
    collision,
    traceWorld,
    onEvent: (...e) => events.push(e),
    onPlayerHit: (hit) => {
      hits.push(hit);
      return { damage: hit.damage };
    },
    onFinish: (r) => results.push(r),
  });
  return { combat, collision, traceWorld, battle, events, hits, results };
}
const player = (x = -25, y = 0, z = 375) => ({
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  yaw: -Math.PI / 2,
  volumes: [{ id: 'torso', position: { x, y: y + 1.1, z }, radius: 0.36 }],
});
function advance(battle, seconds, p = player()) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) battle.update(1 / 120, p);
}

test('severing disables one hand, accumulates leaks, and regeneration never repairs a body', () => {
  const combat = createCombatCore(),
    body = createBattleBody({ combat });
  body.hit('rightArm', 28);
  assert.equal(body.usable('main'), false);
  assert.equal(body.usable('sub'), true);
  assert.ok(body.snapshot.leakage > 1);
  body.hit('leftLeg', 34);
  assert.equal(body.snapshot.speedScale, 0.62);
  for (let i = 0; i < 600; i++) combat.update(1 / 120);
  assert.equal(body.snapshot.parts.rightArm.destroyed, true);
  body.reset();
  assert.equal(body.usable('main'), true);
  assert.equal(combat.snapshot.leakage, 0);
});
test('critical destruction emits bailout condition; paused damage cannot alter body', () => {
  const combat = createCombatCore(),
    events = [],
    body = createBattleBody({ combat, onEvent: (t) => events.push(t) });
  combat.pause(true);
  assert.equal(body.hit('head', 60), false);
  combat.pause(false);
  body.hit('head', 60);
  assert.equal(body.snapshot.failed, true);
  assert.ok(events.includes('critical'));
});
test('light combo, charged heavy, aerial timing, recovery cancellation and no permanent stun', () => {
  const combat = createCombatCore(),
    events = [],
    m = createMeleeCombat({ combat, onEvent: (t, d) => events.push([t, d]) }),
    kit = { blade: true, grounded: true };
  m.update(0.01, kit);
  assert.ok(m.attack());
  assert.equal(m.can('grasshopper'), false);
  m.update(0.15, kit);
  assert.equal(events.filter((e) => e[0] === 'strike').length, 1);
  assert.equal(m.can('switch'), false);
  m.update(0.18, kit);
  assert.ok(m.can('grasshopper'));
  m.update(0.16, kit);
  m.attack();
  assert.equal(m.snapshot.move, 'light2');
  m.update(0.5, kit);
  assert.ok(m.heavyStart());
  m.update(0.7, kit);
  assert.ok(m.heavyRelease());
  m.update(0.25, kit);
  assert.ok(events.find((e) => e[0] === 'strike' && e[1].damage === 60));
  m.update(0.7, kit);
  m.update(0.01, { blade: true, grounded: false });
  m.attack();
  assert.equal(m.snapshot.move, 'aerial');
  m.stagger(0.2);
  assert.equal(m.can('fire'), false);
  m.update(0.3, kit);
  assert.equal(m.snapshot.phase, 'idle');
});
test('frontal parry stuns opponent, late guard costs resource, rear attack bypasses guard', () => {
  const combat = createCombatCore(),
    m = createMeleeCombat({ combat });
  const kit = { blade: true, shield: true };
  m.update(0.01, kit);
  m.guard(true);
  const h = { position: { x: 0, z: 0 }, origin: { x: 0, z: -1 }, yaw: 0, damage: 15 };
  assert.equal(m.defend(h).parried, true);
  m.update(0.2, kit);
  const before = combat.snapshot.remaining;
  assert.equal(m.defend(h).blocked, true);
  assert.ok(combat.snapshot.remaining < before);
  assert.equal(m.defend({ ...h, origin: { x: 0, z: 1 } }).damage, 15);
  assert.ok(m.dodge());
  assert.equal(m.snapshot.invulnerable, false);
  assert.equal(m.defend(h).damage, 15);
});
test('a dodge uses normal wall sweeps and does not tunnel through cover', () => {
  const { collision } = setup();
  collision.add({ x: 2, z: 0, w: 0.2, d: 10, y: 0, h: 5 });
  const motor = createCharacterMotor({ groundHeight, collision: { ...collision, surfaceHeightAt: () => 0 } });
  motor.teleport({ x: 0, z: 0 });
  for (let i = 0; i < 40; i++) motor.update(1 / 120, { dash: { x: 18, z: 0 } }, 0);
  assert.ok(motor.position.x < 1.7);
  assert.equal(motor.grounded, true);
});
test('AI senses, chases, telegraphs, shoots, and can hit elevated targets', () => {
  const s = setup();
  s.battle.start({ mode: 'waves' });
  advance(s.battle, 12);
  assert.ok(s.events.some((e) => e[0] === 'telegraph'));
  assert.ok(s.hits.length > 0);
  const air = player(0, 25, 375);
  air.volumes[0].radius = 1;
  advance(s.battle, 18, air);
  assert.ok(
    s.hits.some((h) => h.origin.y > 3),
    'an airborne target still faces ranged threats',
  );
  assert.ok(
    s.battle.snapshot.enemies.every((e) => s.collision.canOccupy(e.feet.x, e.feet.z, e.feet.y, 2, e.radius)),
  );
});
test('all mission modes finish, records are sanitized and retry clears enemies and bullets', () => {
  for (const mode of ['waves', 'patrol', 'hunt']) {
    const s = setup();
    s.battle.start({ mode, difficulty: 'easy' });
    for (let step = 0; step < 12 && s.battle.phase === 'active'; step++) {
      const b = s.battle.snapshot,
        p = b.waypoint ? player(b.waypoint.x, 0, b.waypoint.z) : player();
      advance(s.battle, 0.05, p);
      for (const e of s.battle.targets) s.battle.hit(e.id, 10000, e.position, { hitZone: 'core' });
      advance(s.battle, 1.1, p);
    }
    assert.equal(s.battle.phase, 'victory', mode);
    assert.equal(s.results.length, 1);
    assert.ok(s.battle.snapshot.best[`${mode}:easy`]);
    s.battle.start();
    assert.equal(s.battle.snapshot.bullets.length, 0);
    assert.equal(s.battle.snapshot.cleared, 0);
    assert.equal(s.battle.targets.length, 3);
  }
  assert.deepEqual(
    cleanBattleRecords({ 'waves:normal': { score: 1, time: NaN, cleared: 1, accuracy: 1 } }),
    {},
  );
});
test('manual bailout completes once and leaving arena grants 12-second grace', () => {
  const s = setup();
  s.battle.start();
  advance(s.battle, 11, player(400));
  assert.equal(s.battle.phase, 'active');
  advance(s.battle, 2, player(400));
  assert.equal(s.battle.phase, 'bailout');
  advance(s.battle, 2);
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].reason, 'boundary');
  s.battle.start();
  s.battle.bailout();
  advance(s.battle, 2);
  assert.equal(s.results.length, 2);
  assert.equal(s.results[1].reason, 'manual');
});
test('weak core bypasses armor, heavy attack breaks armor, and a parry opens recovery', () => {
  const s = setup();
  s.battle.start({ mode: 'hunt' });
  const boss = s.battle.targets.find((e) => e.boss);
  let h = boss.health;
  s.battle.hit(boss.id, 10, boss.position, {});
  let b = s.battle.targets.find((e) => e.boss);
  assert.ok(Math.abs(h - b.health - 3.2) < 1e-5);
  h = b.health;
  s.battle.hit(boss.id, 10, boss.position, { hitZone: 'core' });
  b = s.battle.targets.find((e) => e.boss);
  assert.equal(h - b.health, 22.5);
  s.battle.stun(boss.id);
  assert.equal(s.battle.targets.find((e) => e.boss).state, 'stagger');
});
test('Meteor deals falling radial damage but a wall blocks secondary targets', () => {
  const { combat, collision, traceWorld } = setup(),
    hits = [],
    events = [];
  const targets = [
    { id: 'near', health: 100, position: { x: 10, y: 1, z: 0 }, radius: 0.7 },
    { id: 'far', health: 100, position: { x: 13, y: 1, z: 2 }, radius: 0.7 },
    { id: 'covered', health: 100, position: { x: 10, y: 1, z: 4 }, radius: 0.7 },
  ];
  collision.add({ x: 10, z: 2.4, w: 2, d: 0.2, y: 0, h: 4 });
  const shooting = createShootingSystem({
    combat,
    traceWorld,
    getTargets: () => targets,
    onHit: (id, d) => hits.push([id, d]),
    onEvent: (t) => events.push(t),
  });
  shooting.prepare('main', 'meteor', { count: 1, damage: 10, spread: 0 });
  shooting.fire('main', 'meteor', {}, { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 });
  for (let i = 0; i < 200; i++) shooting.update(1 / 120);
  assert.ok(events.includes('explosion'));
  assert.equal(hits.length, 2);
  assert.equal(
    hits.some(([id]) => id === 'covered'),
    false,
  );
  assert.ok(hits.find(([id]) => id === 'near')[1] > hits.find(([id]) => id === 'far')[1]);
  assert.equal(combat.snapshot.remaining, 99);
});
test('navigation routes around a building instead of walking into it', () => {
  const { collision } = setup();
  collision.add({ x: 12, z: 0, w: 8, d: 16, y: 0, h: 5 });
  const path = findArenaPath({ x: 0, z: 0 }, { x: 28, z: 0 }, { groundHeight, collision });
  assert.ok(path.length > 3);
  assert.ok(path.some((p) => Math.abs(p.z) > 8));
  assert.ok(path.every((p) => collision.canOccupy(p.x, p.z, 0, 2.3, 0.65)));
});

test('a melee active window only damages each enemy once per swing serial', () => {
  const s = setup();
  s.battle.start();
  const enemy = s.battle.targets[0],
    p = player(enemy.feet.x - 2, 0, enemy.feet.z),
    move = { serial: 1, damage: 10, reach: 3, arc: 1.4, move: 'light1' };
  s.battle.strike(move, p);
  const after = s.battle.targets.find((e) => e.id === enemy.id).health;
  for (let i = 0; i < 20; i++) s.battle.strike(move, p);
  assert.equal(s.battle.targets.find((e) => e.id === enemy.id).health, after);
  s.battle.strike({ ...move, serial: 2 }, p);
  assert.ok(s.battle.targets.find((e) => e.id === enemy.id).health < after);
  assert.equal(s.battle.overlaps(enemy.feet.x, enemy.feet.z, 0, 1.75, 0.28), true);
});
test('a real Viper projectile hits the visible enemy core before armor', () => {
  const s = setup(),
    hits = [];
  s.battle.start({ mode: 'hunt' });
  const boss = s.battle.targets.find((e) => e.boss);
  s.battle.stun(boss.id, 20);
  const core = boss.hitVolumes.find((v) => v.id === 'core').position,
    origin = { x: core.x - 8, y: core.y, z: core.z };
  const shooting = createShootingSystem({
    combat: s.combat,
    traceWorld: s.traceWorld,
    getTargets: () => s.battle.targets,
    onHit: (id, d, point, b) => {
      hits.push(b.hitZone);
      s.battle.hit(id, d, point, b);
    },
  });
  shooting.prepare('main', 'viper', { count: 1, damage: 10, spread: 0 });
  shooting.fire('main', 'viper', {}, origin, core, boss.id);
  for (let i = 0; i < 240; i++) shooting.update(1 / 120);
  assert.ok(hits.includes('core'));
  assert.equal(s.battle.targets.find((e) => e.boss).health, boss.health - 22.5);
});
test('Hound guidance and moving enemy AI share actual collision and hit rules', () => {
  const s = setup(),
    hits = [];
  s.battle.start();
  const fast = s.battle.targets.find((e) => e.type === 'fast'),
    origin = { x: -25, y: 1.2, z: 375 };
  const shooting = createShootingSystem({
    combat: s.combat,
    traceWorld: s.traceWorld,
    getTargets: () => s.battle.targets,
    onHit: (id, d, point, b) => {
      hits.push(id);
      s.battle.hit(id, d, point, b);
    },
  });
  shooting.prepare('main', 'hound', {
    count: 8,
    spread: 0,
    tracking: 'high',
    houndRoute: 'right',
    range: 400,
    speed: 155,
  });
  shooting.fire('main', 'hound', {}, origin, fast.position, fast.id);
  for (let i = 0; i < 720; i++) {
    s.battle.update(1 / 120, player());
    shooting.update(1 / 120);
  }
  assert.ok(hits.includes(fast.id));
});
test('AI searches after losing sight and returns to combat on reacquisition', () => {
  let visible = true;
  const collision = createCollisionIndex(),
    battle = createBattleSession({ groundHeight, collision, traceWorld: () => (visible ? 1 : 0) });
  battle.start();
  advance(battle, 1);
  assert.ok(battle.targets.every((e) => e.alert));
  visible = false;
  advance(battle, 9);
  assert.ok(battle.targets.every((e) => !e.alert && e.state === 'search'));
  visible = true;
  advance(battle, 1);
  assert.ok(battle.targets.some((e) => e.alert));
});

test('rapidly toggling guard cannot refresh an unlimited parry window', () => {
  const combat = createCombatCore(),
    m = createMeleeCombat({ combat });
  m.update(0.01, { blade: true });
  m.guard(true);
  assert.equal(m.snapshot.parryWindow, true);
  m.guard(false);
  m.update(0.02, { blade: true });
  m.guard(true);
  assert.equal(m.snapshot.parryWindow, false);
  m.guard(false);
  m.update(0.5, { blade: true });
  m.guard(true);
  assert.equal(m.snapshot.parryWindow, true);
});

test('hovering near the top of the legal arena does not grant permanent aerial immunity', () => {
  const s = setup();
  s.battle.start();
  const p = player(0, 280, 375);
  advance(s.battle, 25, p);
  assert.ok(
    s.hits.some((h) => h.origin.y > 250),
    'AI can detect and hit a stationary airborne player near the 300 m ceiling',
  );
  assert.ok(s.battle.snapshot.bullets.length <= 192);
});
test('prototype properties in saved mission options fall back to playable defaults', () => {
  const s = setup();
  s.battle.start({ mode: 'toString', difficulty: 'constructor' });
  assert.equal(s.battle.snapshot.mode, 'waves');
  assert.equal(s.battle.snapshot.difficulty, 'normal');
  assert.equal(s.battle.targets.length, 3);
});
