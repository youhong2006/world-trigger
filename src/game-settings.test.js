import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, ACTIONS, normalizeSettings, rebind, loadSettings, saveSettings } from './game-settings.js';
import { cleanDraft } from './trajectory-plan.js';
test('invalid or imported settings are bounded, typed, and do not create duplicate bindings', () => {
  const value = normalizeSettings({
    walkSpeed: 500,
    runSpeed: 6,
    boostSpeed: Infinity,
    sensitivity: -2,
    quality: 'invalid',
    muted: 'false',
    bindings: { forward: 'KeyQ', back: 'KeyQ', grasshopper: 'Escape' },
  });
  assert.equal(value.walkSpeed, 9);
  assert.equal(value.runSpeed, 9);
  assert.equal(value.boostSpeed, 42);
  assert.equal(value.sensitivity, 0.15);
  assert.equal(value.quality, 'medium');
  assert.equal(value.muted, false);
  assert.equal(new Set(Object.values(value.bindings)).size, Object.keys(ACTIONS).length);
  assert.equal(value.bindings.forward, 'KeyQ');
  assert.ok(!Object.values(value.bindings).includes('Escape'));
});
test('rebinding swaps conflicting actions and preserves an escape route', () => {
  const value = rebind(DEFAULTS, 'grasshopper', 'KeyW');
  assert.equal(value.bindings.grasshopper, 'KeyW');
  assert.equal(value.bindings.forward, 'KeyQ');
  assert.equal(rebind(value, 'jump', 'Escape'), null);
  assert.equal(rebind(value, 'jump', 'F2'), null);
  assert.equal(DEFAULTS.bindings.forward, 'KeyW');
});
test('settings survive storage round-trip and corrupt/unavailable storage is recoverable', () => {
  let data;
  const storage = { setItem: (k, v) => (data = v), getItem: () => data };
  assert.equal(saveSettings(storage, { ...DEFAULTS, sensitivity: 1.7, quality: 'custom' }), true);
  assert.equal(loadSettings(storage).sensitivity, 1.7);
  assert.equal(loadSettings(storage).quality, 'custom');
  assert.deepEqual(loadSettings({ getItem: () => '{broken' }), normalizeSettings());
  assert.equal(
    saveSettings(
      {
        setItem: () => {
          throw Error();
        },
      },
      DEFAULTS,
    ),
    false,
  );
});
test('tactical draft import rejects malformed routes and caps editable points and saved count', () => {
  const route = {
    name: 'test',
    points: [
      [0, 1, 0],
      [-100, 2, -3],
      [6, 2, -15],
      [0, 1, -20],
    ],
  };
  const result = cleanDraft({ paths: Array(20).fill(route), equipment: ['viper', 'evil'] });
  assert.equal(result.paths.length, 8);
  assert.equal(result.paths[0].points[1][0], -25);
  assert.deepEqual(result.equipment, ['grasshopper', 'viper']);
  assert.equal(cleanDraft({ paths: [{ points: [[NaN]] }] }).paths.length, 1);
});
test('older saves gain unique shooting controls and mouse rebinding swaps correctly', () => {
  const old = normalizeSettings({ bindings: { grasshopper: 'KeyE' } });
  assert.equal(old.bindings.grasshopper, 'KeyE');
  assert.notEqual(old.bindings.prepare, 'KeyE');
  assert.equal(old.bindings.fire, 'Mouse0');
  const changed = rebind(old, 'prepare', 'Mouse0');
  assert.equal(changed.bindings.prepare, 'Mouse0');
  assert.equal(changed.bindings.fire, old.bindings.prepare);
  assert.equal(new Set(Object.values(changed.bindings)).size, Object.keys(ACTIONS).length);
});

test('right-click aiming in old saves migrates to split, with middle aim and side-menu buttons kept unique', () => {
  const value = normalizeSettings({ bindings: { fire: 'Mouse0', aim: 'Mouse2', prepare: 'KeyE' } });
  assert.equal(value.bindings.split, 'Mouse2');
  assert.equal(value.bindings.aim, 'Mouse1');
  assert.equal(value.bindings.menuEnter, 'Mouse4');
  assert.equal(value.bindings.menuBack, 'Mouse3');
  assert.equal(new Set(Object.values(value.bindings)).size, Object.keys(ACTIONS).length);
  const rebound = rebind(value, 'menuEnter', 'BracketRight');
  assert.equal(rebound.bindings.menuEnter, 'BracketRight');
});
