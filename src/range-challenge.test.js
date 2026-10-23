import test from 'node:test';
import assert from 'node:assert/strict';
import { createRangeChallenge } from './range-challenge.js';
test('six practice targets provide a complete solo victory, score and clean retry without enemies', () => {
  const results = [],
    range = createRangeChallenge({ onFinish: (r) => results.push(r) });
  range.start();
  range.update(15);
  for (const target of range.targets) {
    for (let n = 0; n < 4; n++) range.recordShot();
    range.hit(target.id, target.health);
  }
  assert.equal(range.snapshot.phase, 'victory');
  assert.equal(results.length, 1);
  assert.equal(results[0].cleared, 6);
  assert.equal(results[0].accuracy, 0.25);
  assert.ok(results[0].score > 0);
  range.hit('T01', 100);
  range.fail();
  assert.equal(results.length, 1);
  range.start();
  assert.equal(range.snapshot.phase, 'active');
  assert.equal(range.snapshot.remaining, 90);
  assert.equal(range.snapshot.shots, 0);
  assert.ok(range.targets.every((t) => t.health === t.maxHealth));
});
test('timeout and exhaustion end once, while free practice has no countdown or victory overlay', () => {
  const results = [],
    range = createRangeChallenge({ onFinish: (r) => results.push(r) });
  range.hit('T01', 100);
  range.update(100);
  assert.equal(range.snapshot.phase, 'idle');
  assert.equal(range.snapshot.time, 0);
  range.start();
  range.update(90);
  assert.equal(range.snapshot.phase, 'defeat');
  assert.equal(range.snapshot.result.reason, 'timeout');
  range.update(10);
  assert.equal(results.length, 1);
  range.start();
  range.fail();
  assert.equal(range.snapshot.result.reason, 'trion');
  assert.equal(results.length, 2);
  range.reset();
  assert.equal(range.snapshot.result, null);
});
