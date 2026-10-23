import test from 'node:test';
import assert from 'node:assert/strict';
import { createFiringMenu, firingTree } from './firing-menu.js';
import { createArmory } from './armory.js';
const setup = () => {
  const data = new Map(),
    storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) },
    armory = createArmory(storage);
  const options = {
    getConfig: (type) => armory.profile.weapons[type],
    getPaths: () => [{ id: 'mine', name: '我的路線' }],
    onConfig: (type, patch) => armory.configure(type, patch, { live: true }),
    onRemember: (type, menu) => armory.rememberMenu(type, menu),
  };
  return { armory, storage, options, menu: createFiringMenu(options) };
};
test('wheel selection applies immediately without confirmation, and remembers exact depth separately per type', () => {
  const { menu, armory, options } = setup();
  menu.activate('viper');
  menu.enter();
  assert.equal(menu.snapshot.depth, 1);
  menu.enter();
  menu.enter();
  assert.equal(menu.snapshot.depth, 3);
  menu.scroll(1);
  assert.equal(armory.profile.weapons.viper.routePreset, 'left');
  assert.equal(menu.snapshot.selectedId, 'left');
  menu.activate('hound');
  menu.enter();
  menu.scroll(1);
  menu.enter();
  assert.equal(menu.snapshot.depth, 2);
  menu.scroll(1);
  assert.equal(armory.profile.weapons.hound.tracking, 'medium');
  menu.scroll(1);
  assert.equal(armory.profile.weapons.hound.tracking, 'low');
  menu.activate('viper');
  menu.enter();
  assert.equal(menu.snapshot.depth, 3);
  assert.equal(menu.snapshot.selectedId, 'left');
  assert.equal(armory.profile.weapons.viper.routePreset, 'left');
  const reopened = createFiringMenu(options);
  reopened.activate('hound');
  reopened.enter();
  assert.equal(reopened.snapshot.selectedId, 'low');
  assert.equal(reopened.snapshot.depth, 2);
});
test('custom speed and three tracking stages adjust live with no confirmation and back exits a layer', () => {
  const { menu, armory } = setup();
  menu.activate('hound');
  menu.root('speed');
  menu.enter();
  menu.choose('custom');
  assert.equal(menu.snapshot.depth, 3);
  assert.equal(menu.snapshot.editing, true);
  menu.scroll(1);
  assert.equal(armory.profile.weapons.hound.speed, 115);
  assert.equal(armory.profile.weapons.hound.speedPreset, 'custom');
  menu.back();
  assert.equal(menu.snapshot.depth, 2);
  menu.root('tracking');
  menu.enter();
  menu.choose('custom');
  menu.scroll(1);
  assert.equal(armory.profile.weapons.hound.trackingCustom[0], 0.85);
  assert.equal(armory.profile.weapons.hound.tracking, 'custom');
  menu.enter();
  menu.scroll(-1);
  assert.equal(armory.profile.weapons.hound.trackingCustom[1], 0.45);
  menu.back();
  assert.equal(menu.snapshot.depth, 2);
});
test('a blocked adjustment leaves the previous selection and parameters intact', () => {
  const { armory, options } = setup();
  const menu = createFiringMenu({ ...options, onConfig: () => false });
  menu.activate('viper');
  menu.root('speed');
  menu.enter();
  const before = menu.snapshot.selectedId;
  menu.scroll(1);
  assert.equal(menu.snapshot.selectedId, before);
  assert.equal(armory.profile.weapons.viper.speed, 110);
});
test('a deleted custom route repairs the menu cursor and imported movement values are bounded', () => {
  const { menu, armory } = setup();
  armory.rememberMenu('viper', { trail: ['route', 'missing'], selection: {} });
  menu.activate('viper');
  assert.equal(menu.snapshot.depth, 2);
  assert.equal(firingTree('hound', armory.profile.weapons.hound)[1].children.length, 7);
  armory.configure('hound', { trackingCustom: [Infinity, -1, 8], speedPreset: 'bad', houndRoute: 'bad' });
  assert.deepEqual(armory.profile.weapons.hound.trackingCustom, [0.8, 0, 1]);
  assert.equal(armory.profile.weapons.hound.houndRoute, 'above');
});
