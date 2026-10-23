import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatCore } from './combat-core.js';
test('preparing can be cancelled for free, valid casts consume once and future weapons stay unavailable', () => {
  const core = createCombatCore();
  assert.equal(core.begin('blade'), false);
  assert.equal(core.begin('grasshopper'), true);
  assert.equal(core.begin('grasshopper'), false);
  core.cancel();
  assert.equal(core.snapshot.remaining, 100);
  assert.equal(core.consume('grasshopper'), true);
  assert.equal(core.snapshot.remaining, 99.7);
});
test('recovery waits after spending and pauses resource, recovery and preparation', () => {
  const core = createCombatCore();
  core.consume('grasshopper');
  core.update(1);
  assert.equal(core.snapshot.remaining, 99.7);
  core.pause(true);
  core.update(30);
  assert.equal(core.snapshot.remaining, 99.7);
  assert.equal(core.begin('grasshopper'), false);
  core.pause(false);
  core.update(0.9);
  assert.ok(core.snapshot.remaining > 99.7);
  core.update(100);
  assert.equal(core.snapshot.remaining, 100);
});
test('overdraw is rejected, exhaustion emits once, and resetting clears damage and leakage', () => {
  const core = createCombatCore({ maximum: 8 });
  let exhausted = 0;
  core.subscribe((e) => {
    if (e.type === 'exhausted') exhausted++;
  });
  core.damage(7.4);
  core.consume('grasshopper');
  core.consume('grasshopper');
  assert.equal(core.snapshot.remaining, 0);
  assert.equal(core.consume('grasshopper'), false);
  core.update(100);
  assert.equal(exhausted, 1);
  core.pause(true);
  core.pause(false);
  assert.equal(core.snapshot.state, 'exhausted');
  core.reset();
  core.setLeakage(2);
  core.damage(1);
  core.update(0.5);
  assert.equal(core.snapshot.remaining, 6);
  core.reset();
  assert.equal(core.snapshot.leakage, 0);
  assert.equal(core.snapshot.remaining, 8);
});
test('variable shooting budgets reject invalid costs without cancelling another side preparation', () => {
  const core = createCombatCore();
  assert.equal(core.begin('grasshopper'), true);
  for (const cost of [-1, 0, NaN, Infinity, 101])
    assert.equal(core.consume('asteroid', cost, { parallel: true }), false);
  assert.equal(core.snapshot.remaining, 100);
  assert.equal(core.snapshot.charging, 'grasshopper');
  assert.equal(core.consume('asteroid', 12, { parallel: true }), true);
  assert.equal(core.snapshot.remaining, 88);
  assert.equal(core.snapshot.state, 'charging');
  core.pause(true);
  assert.equal(core.consume('asteroid', 9, { parallel: true }), false);
});
