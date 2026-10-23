import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HQ,
  HQ_FLOORS,
  HQ_WINGS,
  HQ_SECTIONS,
  HQ_ROOMS,
  HQ_RANGE,
  wingAt,
  wingFrame,
  wingPoint,
  envelopeAt,
  roomWorldPosition,
  sectionsForPosition,
  stairFlights,
} from './hq-layout.js';
import * as THREE from 'three';
import { createHQRange } from './hq-range.js';
import { selectInteractable } from './hq-systems.js';
import { createCombatCore } from './combat-core.js';
import { createShootingSystem, createWorldTrace } from './projectiles.js';
import { createCollisionIndex, groundHeight } from './city-layout.js';
import { clipExcavationTriangle } from './hq-terrain.js';
import { fixture, walkTo, dashTo } from './hq-test-helpers.js';

const close = (a, b, epsilon = 1e-6) => Math.abs(a - b) < epsilon;

test('whole-base layout gives every occupied level four usable wings, including the highest rooms', () => {
  assert.equal(new Set(HQ_SECTIONS.map((s) => s.id)).size, HQ_SECTIONS.length);
  assert.equal(new Set(HQ_ROOMS.map((r) => r.id)).size, HQ_ROOMS.length);
  assert.ok(HQ_ROOMS.length > 1000, 'base must extend beyond the previous small occupied wing');
  for (const f of HQ_FLOORS)
    for (const wing of HQ_WINGS) {
      const sections = HQ_SECTIONS.filter((s) => s.floor === f.id && s.wing === wing);
      assert.ok(sections.length > 1, `${f.id} ${wing} has no usable district`);
    }
  const highest = HQ_ROOMS.filter((r) => r.floor === HQ_FLOORS.at(-1).id);
  assert.ok(highest.length > 20);
  for (const wing of HQ_WINGS) assert.ok(highest.some((r) => r.wing === wing));
});

test('room metadata stays inside the tapered wing and preserves a clear central corridor', () => {
  for (const room of HQ_ROOMS) {
    const position = roomWorldPosition(room),
      e = envelopeAt(room.y + (HQ.roomHeight ?? 5.7));
    assert.ok(Math.abs(position.x) < e.outerHalfW, room.id + ' outside outer wall');
    assert.ok(Math.abs(position.z - HQ.centerZ) < e.outerHalfD, room.id + ' outside front/back wall');
    assert.ok(Math.abs(room.z) - room.d / 2 >= 4.5, room.id + ' obstructs the main corridor');
    assert.ok(close(position.x, room.world.x) && close(position.z, room.world.z));
  }
});

test('160 m wings contain six finer room rows served by independent longitudinal corridors', () => {
  const typical = HQ_SECTIONS.find(
    (s) => s.kind === 'rooms' && s.floor === '20F' && s.wing === 'back' && s.rooms.length === 18,
  );
  assert.ok(typical, 'a normal district should use the full occupied wing depth');
  assert.deepEqual(
    [...new Set(typical.rooms.map((r) => r.z))].sort((a, b) => a - b),
    [-58, -36, -14, 14, 36, 58],
  );
  for (const r of typical.rooms) {
    assert.ok(r.w <= 14 && r.w >= 9, `${r.id} is not a finer room`);
    assert.equal(r.d, 18);
    assert.ok([0, -25, 25, -47, 47].includes(r.corridorV));
    for (const corridor of [0, -25, 25, -47, 47])
      assert.ok(Math.abs(r.z - corridor) >= r.d / 2 + 1.8, `${r.id} blocks corridor ${corridor}`);
  }
});

test('nearby section selection reaches distant wings and upper floors instead of only the south entrance', () => {
  for (const y of [0, HQ_FLOORS[18].y, HQ_FLOORS[36].y, HQ_FLOORS.at(-1).y])
    for (const wing of HQ_WINGS) {
      const position = wingPoint(wing, y, 0, 0),
        nearby = sectionsForPosition(position, 80);
      assert.equal(wingAt(position.x, y, position.z), wing);
      assert.ok(
        nearby.some((s) => s.wing === wing && s.y === y),
        `${wing} at${y}m not streamed`,
      );
      assert.ok(nearby.length < 80, 'selection must remain local');
    }
});

test('red reference band is a long physical front range with upper observation levels', () => {
  assert.equal(HQ_RANGE.floor, '7F');
  assert.ok(HQ_RANGE.maxU - HQ_RANGE.minU > 900);
  assert.ok(HQ_RANGE.top - HQ_RANGE.y >= 12);
  const firing = HQ_SECTIONS.filter((s) => s.kind === 'range');
  assert.ok(firing.length >= 8);
  assert.ok(firing.every((s) => s.wing === 'front' && s.y === HQ_RANGE.y));
  assert.ok(Math.min(...firing.map((s) => s.u - s.w / 2)) <= HQ_RANGE.minU);
  assert.ok(Math.max(...firing.map((s) => s.u + s.w / 2)) >= HQ_RANGE.maxU);
  for (const y of HQ_FLOORS.filter((f) => f.y > HQ_RANGE.y && f.y < HQ_RANGE.top).map((f) => f.y))
    assert.ok(HQ_SECTIONS.some((s) => s.wing === 'front' && s.y === y && s.kind === 'rangeGallery'));
});

test('ground entry is flush while all four basement wings are excavated beneath actual support slabs', () => {
  assert.equal(groundHeight(0, 285), 0);
  assert.equal(groundHeight(0, HQ.gate.z), HQ_FLOORS[0].y);
  for (const wing of HQ_WINGS) {
    const p = wingPoint(wing, HQ_FLOORS[0].y);
    assert.equal(groundHeight(p.x, p.z), HQ_FLOORS[0].y, wing);
  }
  assert.equal(groundHeight(0, HQ.centerZ), 0, 'open courtyard keeps its ground');
});

test('removing streamed colliders clears both height bins and camera/body queries without ghost obstacles', () => {
  const c = createCollisionIndex(),
    x = -1100,
    z = 1080,
    y = groundHeight(x, z),
    before = c.count;
  const b = c.add({ x, y, z, w: 4, h: 3, d: 4 });
  assert.equal(c.canOccupy(x, z, y, 1.75), false);
  c.setHeight(b, y + 20, 3);
  assert.equal(c.canOccupy(x, z, y + 20, 1.75), false);
  c.remove(b);
  c.remove(b);
  assert.equal(c.count, before);
  assert.equal(c.canOccupy(x, z, y + 20, 1.75), true);
  assert.equal(c.segmentFraction({ x: x - 5, y: y + 21, z }, { x: x + 5, y: y + 21, z }, 0.1), 1);
  assert.equal(c.surfaceHeightAt(x, z, y + 24, 0.38), y);
});

test('terrain excavation removes the basement footprint while preserving surrounding area and interpolated heights', () => {
  const vertex = (x, z) => ({ x, z, y: 2 * x + 3 * z, color: [x + 2, z + 2, x - z] });
  const triangle = [vertex(-2, -2), vertex(4, -2), vertex(-2, 4)];
  const pieces = clipExcavationTriangle(triangle, { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 });
  const area = (polygon) =>
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p.x * q.z - q.x * p.z;
      }, 0),
    ) / 2;
  assert.ok(
    close(
      pieces.reduce((sum, p) => sum + area(p), 0),
      17,
    ),
  );
  for (const poly of pieces)
    for (const p of poly) {
      assert.ok(close(p.y, 2 * p.x + 3 * p.z));
      assert.ok(close(p.color[0], p.x + 2));
      assert.ok(!(p.x > -0.5 + 1e-7 && p.x < 0.5 - 1e-7 && p.z > -0.5 + 1e-7 && p.z < 0.5 - 1e-7));
    }
  assert.deepEqual(
    clipExcavationTriangle([vertex(0, 0), vertex(0.1, 0), vertex(0, 0.1)], {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.5,
      maxZ: 0.5,
    }),
    [],
  );
});

// Navigation checks below use the actual streamed meshes/colliders, not duplicated floor geometry.
test('all four perimeter corridor corners connect at ground and on a high occupied floor', () => {
  const f = fixture();
  for (const y of [0, HQ_FLOORS[36].y]) {
    const front = wingFrame('front', y),
      back = wingFrame('back', y),
      right = wingFrame('right', y),
      left = wingFrame('left', y);
    for (const [x, z, sx, sz] of [
      [right.x, front.z, -1, -1],
      [right.x, back.z, -1, 1],
      [left.x, back.z, 1, 1],
      [left.x, front.z, 1, -1],
    ]) {
      f.place({ x: x + sx * 18, y, z });
      walkTo(f, x, z);
      walkTo(f, x, z + sz * 18);
      assert.ok(close(f.motor.position.y, y, 0.02), `corner ${x},${z} floor${y}`);
      assert.equal(f.motor.grounded, true);
    }
  }
});

test('each remote wing has a real walkable corridor at basement, middle and highest occupied levels', () => {
  const f = fixture();
  for (const y of [HQ_FLOORS[0].y, HQ_FLOORS[20].y, HQ_FLOORS.at(-1).y])
    for (const wing of HQ_WINGS) {
      const start = wingPoint(wing, y, -20),
        end = wingPoint(wing, y, 20);
      f.place(start);
      walkTo(f, end.x, end.z);
      assert.ok(close(f.motor.position.y, y, 0.02), `${wing} y${y} lost its floor`);
      assert.equal(f.motor.grounded, true);
    }
});

test('secondary corridors and transverse aisles connect every room row across all four wings', () => {
  const f = fixture(),
    floor = HQ_FLOORS.find((f) => f.id === '20F');
  for (const wing of HQ_WINGS) {
    for (const v of [-71, -47, -25, 0, 25, 47, 71]) {
      const start = wingPoint(wing, floor.y, 180, v),
        end = wingPoint(wing, floor.y, 205, v);
      f.place(start);
      walkTo(f, end.x, end.z);
      assert.ok(close(f.motor.position.y, floor.y, 0.02), `${wing} corridor ${v}`);
    }
    const section = HQ_SECTIONS.filter(
      (s) => s.floor === floor.id && s.wing === wing && s.kind === 'rooms',
    ).reduce((a, b) => (Math.abs(a.u - 180) < Math.abs(b.u - 180) ? a : b));
    const u = section.u + section.w / 6,
      start = wingPoint(wing, floor.y, u, -71),
      end = wingPoint(wing, floor.y, u, 71);
    f.place(start);
    walkTo(f, end.x, end.z);
    assert.ok(close(f.motor.position.y, floor.y, 0.02), wing + ' transverse aisle');
  }
});

test('doors on all four rotated wings open into real furnished rooms and allow physical passage', () => {
  const f = fixture(),
    floor = HQ_FLOORS.find((f) => f.id === '20F');
  for (const wing of HQ_WINGS) {
    const room = HQ_ROOMS.find(
      (r) => r.floor === floor.id && r.wing === wing && r.z === -14 && Math.abs(r.sectionU) > 70,
    );
    assert.ok(room, wing + ' has no inner-row room');
    const u = room.sectionU + room.x,
      v = room.z + room.d / 2;
    const outside = wingPoint(wing, floor.y, u, v + 2),
      inside = wingPoint(wing, floor.y, u, v - 2);
    f.place(outside);
    const door = f.interior.doors.find((d) => d.name === room.name);
    assert.ok(door, room.name + ' was not streamed');
    const axis = door.leafAxis;
    assert.ok(close(Math.hypot(axis.x, axis.z), 1));
    for (let i = 0; i < 120; i++) f.step();
    assert.ok(door.progress > 0.98, room.name + ' did not open automatically');
    walkTo(f, inside.x, inside.z);
    assert.ok(close(f.motor.position.y, floor.y, 0.02));
    const furniture = f.interior.objects.filter((o) => o.sectionId === room.sectionId && o.type !== 'door');
    assert.ok(furniture.length > 0, 'room district must contain interactive furnishings');
  }
});

test('human-height furniture can be targeted with F from an unobstructed standing position', () => {
  const f = fixture(),
    floor = HQ_FLOORS.find((f) => f.id === '20F');
  const p = wingPoint('back', floor.y, 180, 0);
  f.place(p);
  const candidates = f.interior.objects.filter(
    (o) => o.type === 'terminal' && o.kind !== 'lift' && o.kind !== 'liftCall' && Math.abs(o.y - floor.y) < 2,
  );
  let reached = false;
  for (const o of candidates) {
    for (const [dx, dz] of [
      [0, 1.5],
      [0, -1.5],
      [1.5, 0],
      [-1.5, 0],
    ]) {
      const stand = { x: o.x + dx, y: floor.y, z: o.z + dz };
      if (!f.collision.canOccupy(stand.x, stand.z, stand.y, 1.75, 0.28)) continue;
      const yaw = Math.atan2(dx, dz),
        dy = o.y - (floor.y + 1.6),
        pitch = Math.atan2(dy, 1.5);
      const selected = selectInteractable([o], {
        position: stand,
        yaw,
        pitch,
        trace: f.collision.segmentFraction,
      });
      if (selected === o) {
        reached = true;
        break;
      }
    }
    if (reached) break;
  }
  assert.equal(reached, true, 'no furnished-room terminal can be reached and targeted');
});

test('public entrance circulation reaches the service core and a visible F elevator-call control', () => {
  const f = fixture();
  f.place({ x: 0, y: 0, z: 217 });
  walkTo(f, 43, 217);
  walkTo(f, 43, 211.5);
  walkTo(f, 46.8, 211.5);
  const control = f.interior.objects.find((o) => o.name === '呼叫電梯 1F');
  assert.ok(control);
  const position = { ...f.motor.position },
    pitch = Math.atan2(control.y - position.y - 1.6, position.z - control.z);
  assert.equal(
    selectInteractable([control], { position, yaw: 0, pitch, trace: f.collision.segmentFraction }),
    control,
  );
  assert.ok(close(position.y, 0, 0.02));
});

test('alternating six-metre storey landings connect physical stairs to each floor corridor in both directions', () => {
  const f = fixture(),
    flights = stairFlights();
  for (const id of ['B1', '1F', '2F', '20F', '57F', '58F']) {
    const floor = HQ_FLOORS.find((x) => x.id === id),
      last = flights.find((x) => close(x.y + x.rise, floor.y));
    assert.ok(last, id + ' must have a physical stair arrival');
    const z = last.back ? 193.5 : 204.5,
      frame = wingFrame('front', floor.y);
    f.place({ x: last.x, y: floor.y, z });
    walkTo(f, 47, z);
    walkTo(f, 47, frame.z);
    assert.ok(close(f.motor.position.y, floor.y, 0.02), id + ' exit lost its floor');
    walkTo(f, 47, z);
    walkTo(f, last.x, z);
    assert.ok(close(f.motor.position.y, floor.y, 0.02), id + ' reverse entry lost its floor');
    assert.equal(f.motor.grounded, true);
  }
});

test('raised lobby bridges preserve continuous floor-level circulation across the entrance void', () => {
  const f = fixture();
  for (const id of ['2F', '3F']) {
    const floor = HQ_FLOORS.find((x) => x.id === id),
      frame = wingFrame('front', floor.y);
    f.place({ x: -30, y: floor.y, z: frame.z });
    walkTo(f, 30, frame.z);
    assert.ok(close(f.motor.position.y, floor.y, 0.02), id + ' bridge must remain at its own level');
    assert.equal(f.motor.grounded, true);
  }
});

test('the physical range preserves vertical firing clearance through its observation-floor band', () => {
  const f = fixture();
  for (const u of [-450, -250, 150, 350]) {
    const p = wingPoint('front', HQ_RANGE.y, u, 0);
    f.place(p);
    assert.equal(
      f.collision.canOccupy(p.x, p.z, HQ_RANGE.y + 5, 1.75, 0.28),
      true,
      `range ceiling crossed at${u}`,
    );
    assert.equal(
      f.collision.surfaceHeightAt(p.x, p.z, HQ_RANGE.y + 4, 0.38),
      HQ_RANGE.y,
      `observation floor sealed the range at${u}`,
    );
  }
});

test('streamed districts retain nearby collision and retire distant geometry with bounded caches', () => {
  const f = fixture(),
    counts = [];
  for (const [wing, y, u] of [
    ['front', 96, 200],
    ['right', 96, 100],
    ['back', 96, -200],
    ['left', 96, -100],
    ['front', 198, 200],
    ['back', 300, 200],
  ]) {
    const p = wingPoint(wing, y, u, 0);
    f.place(p);
    f.step();
    assert.equal(f.collision.canOccupy(p.x, p.z, y, 1.75, 0.28), true);
    assert.ok(close(f.collision.surfaceHeightAt(p.x, p.z, y, 0.38), y, 0.02));
    counts.push(f.collision.count);
  }
  assert.ok(
    Math.max(...counts) < Math.min(...counts) * 3,
    'streamed collider population grows without retirement',
  );
  const d = f.interior.diagnostics;
  assert.ok((d.loadedSections ?? d.sectionsLoaded ?? 0) < 150);
});

test('physical shooting range uses persistent real targets, saves a cleared score, and resets without a virtual scene', () => {
  const f = fixture(),
    saved = new Map(),
    storage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const range = createHQRange({ scene: f.scene, collision: f.collision, storage });
  const booth = wingPoint('front', HQ_RANGE.y, -300, HQ_RANGE.boothV);
  range.update(1, booth, true);
  assert.equal(range.active, true);
  assert.equal(range.root.parent, f.scene);
  assert.ok(range.targets.length > 50);
  assert.ok(range.targets.every((t) => t.position.y > HQ_RANGE.y && t.position.y < HQ_RANGE.top));
  for (const t of range.targets) {
    range.recordShot();
    range.hit(t.id, t.maxHealth);
  }
  assert.equal(range.snapshot.finished, true);
  assert.equal(range.snapshot.cleared, range.targets.length);
  assert.equal(range.snapshot.shots, range.targets.length);
  assert.ok(Number(saved.get('mikado-hq-live-range-best')) > 0);
  range.reset();
  range.update(0, booth, true);
  assert.equal(range.snapshot.cleared, 0);
  assert.equal(range.snapshot.time, 0);
  assert.equal(range.snapshot.shots, 0);
  assert.equal(range.snapshot.finished, false);
  assert.ok(range.targets.every((t) => t.health === t.maxHealth));
  range.update(0, { ...booth, y: HQ.roof }, true);
  assert.equal(range.active, false);
});

test('Asteroid rounds physically travel from a live firing booth to its target through the actual range colliders', () => {
  const f = fixture(),
    range = createHQRange({ scene: f.scene, collision: f.collision });
  const target = range.targets.reduce((a, b) =>
    Math.abs(a.position.x + 300) < Math.abs(b.position.x + 300) ? a : b,
  );
  const booth = wingPoint('front', HQ_RANGE.y, target.position.x, HQ_RANGE.boothV);
  f.place(booth);
  range.update(0, booth, true);
  const combat = createCombatCore({ recovery: 0 }),
    gun = createShootingSystem({
      combat,
      traceWorld: createWorldTrace(f.collision, groundHeight),
      getTargets: () => range.targets,
      onHit: (id, damage) => range.hit(id, damage),
    });
  assert.equal(
    gun.fire(
      'main',
      'asteroid',
      { count: 8, spread: 0, speed: 180 },
      { ...booth, y: booth.y + 1.65 },
      target.position,
    ),
    true,
  );
  range.recordShot();
  for (let i = 0; i < 240; i++) gun.update(1 / 120);
  assert.equal(
    target.health,
    0,
    'the firing lane must remain unobstructed by booths, observation slabs or terrain',
  );
  assert.ok(range.snapshot.hits > 0);
  assert.equal(combat.snapshot.remaining, 99);
});

test('both first- and third-person hand muzzles clear live-booth controls and the central walking lane', () => {
  const f = fixture(),
    u = -300,
    booth = wingPoint('front', HQ_RANGE.y, u, HQ_RANGE.boothV + 2.3);
  f.place(booth);
  const pivot = { ...booth, y: booth.y + 1.63 * 0.82 },
    target = wingPoint('front', HQ_RANGE.y, u, HQ_RANGE.targetV);
  target.y += 2.5;
  for (const mode of ['first', 'third'])
    for (const side of ['main', 'sub']) {
      const ideal = {
        x: pivot.x + (side === 'main' ? 1 : -1) * (mode === 'first' ? 1.15 : 1.05),
        y: pivot.y + 0.18,
        z: pivot.z - (mode === 'first' ? 2.5 : 0.5),
      };
      assert.equal(
        f.collision.segmentFraction(pivot, ideal, 0.06),
        1,
        `${mode} ${side} hand is clipped against booth equipment`,
      );
      assert.equal(
        f.collision.segmentFraction(ideal, target, 0.06),
        1,
        `${mode} ${side} shot is obstructed before the target`,
      );
    }
  const forward = wingPoint('front', HQ_RANGE.y, u, HQ_RANGE.boothV - 10);
  walkTo(f, forward.x, forward.z);
  assert.ok(close(f.motor.position.y, HQ_RANGE.y, 0.02));
  assert.equal(f.motor.grounded, true);
});
