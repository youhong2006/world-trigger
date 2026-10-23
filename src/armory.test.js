import test from 'node:test';
import assert from 'node:assert/strict';
import { createArmory, normalizeArmory, normalizeFire, shotCost, ARMORY_KEY } from './armory.js';
const memory = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
};
test('armory sanitizes imported slots, active selections, finite weapon budgets and profile identities', () => {
  const result = normalizeArmory({
    activeId: 'missing',
    profiles: [
      {
        id: 'same',
        main: ['asteroid', 'evil', 'viper', 'meteor', 'asteroid'],
        activeMain: 9,
        weapons: {
          asteroid: { count: 100, damage: 100, speed: NaN, range: -5, delay: Infinity, mode: 'evil' },
        },
      },
      { id: 'same' },
    ],
  });
  assert.notEqual(result.profiles[0].id, result.profiles[1].id);
  assert.equal(result.activeId, 'same');
  assert.deepEqual(result.profiles[0].main, ['asteroid', null, 'viper', 'meteor']);
  assert.equal(result.profiles[0].activeMain, 3);
  const weapon = result.profiles[0].weapons.asteroid;
  assert.equal(weapon.count, 8);
  assert.equal(weapon.damage, 18);
  assert.equal(weapon.range, 60);
  assert.equal(weapon.speed, 110);
  assert.equal(weapon.delay, 0);
  assert.equal(weapon.mode, 'volley');
  assert.equal(normalizeArmory(null).profiles.length, 1);
  assert.ok(shotCost({ count: 27, damage: 18 }) > shotCost({ count: 1, damage: 2 }));
  assert.equal(shotCost({}), 9);
});
test('loadouts save independent copies, equipped slots, firing side, routes and records across reload', () => {
  const storage = memory(),
    armory = createArmory(storage);
  const initial = armory.profile.id;
  armory.configure('asteroid', { count: 27, mode: 'burst', pathId: 'route-test' });
  assert.equal(armory.add(), true);
  const copy = armory.profile.id;
  armory.configure('asteroid', { damage: 12 });
  armory.equip('sub', 1, 'asteroid');
  armory.selectSlot('sub', 1);
  armory.setSide('sub');
  armory.record({ score: 500, time: 25, accuracy: 0.8 });
  armory.record({ score: 300, time: 30, accuracy: 0.9 });
  const reload = createArmory(storage);
  assert.equal(reload.active('sub'), 'asteroid');
  assert.equal(reload.profile.fireSide, 'sub');
  assert.equal(reload.profile.weapons.asteroid.pathId, 'route-test');
  assert.equal(reload.snapshot.best.score, 500);
  reload.choose(initial);
  assert.equal(reload.profile.weapons.asteroid.damage, 8);
  assert.equal(reload.profile.weapons.asteroid.count, 27);
  reload.choose(copy);
  assert.equal(reload.profile.weapons.asteroid.damage, 12);
  const imported = createArmory(memory());
  imported.import(JSON.parse(storage.getItem(ARMORY_KEY)));
  assert.deepEqual(imported.snapshot, reload.snapshot);
  const snapshot = reload.snapshot;
  snapshot.profiles[0].main[0] = null;
  assert.equal(reload.snapshot.profiles[0].main[0], 'asteroid');
});
test('loadout bounds and unavailable storage do not break live equipment', () => {
  const armory = createArmory({
    getItem: () => '{broken',
    setItem: () => {
      throw Error('quota');
    },
  });
  for (let n = 0; n < 5; n++) assert.equal(armory.add(), true);
  assert.equal(armory.add(), false);
  assert.equal(armory.snapshot.profiles.length, 6);
  assert.equal(armory.snapshot.saved, false);
  assert.equal(armory.equip('main', 1, 'hound'), false);
  assert.equal(armory.selectSlot('sub', 4), false);
  assert.equal(armory.configure('meteor', { range: 300 }), true);
  assert.equal(armory.profile.weapons.meteor.range, 300);
  while (armory.snapshot.profiles.length > 1) armory.remove();
  assert.equal(armory.remove(), false);
  assert.deepEqual(normalizeFire(null), normalizeFire());
});
