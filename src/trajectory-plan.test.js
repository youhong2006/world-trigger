import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDraft, samplePolyline, PATH_TEMPLATES } from './trajectory-plan.js';
test('route identities survive legacy imports and duplicated or malformed imports stay editable', () => {
  const route = { id: 'same', name: 'safe', points: PATH_TEMPLATES.left.points };
  const paths = cleanDraft({
    paths: [null, route, route, { name: 'old route', points: PATH_TEMPLATES.above.points }],
  }).paths;
  assert.equal(paths.length, 3);
  assert.equal(new Set(paths.map((p) => p.id)).size, 3);
  assert.equal(paths[0].id, 'same');
  assert.ok(paths[2].id);
  assert.equal(cleanDraft(null).paths.length, 1);
});
test('trajectory simulation advances by arc length through corners and tolerates coincident points', () => {
  const points = [
    [0, 0, 0],
    [0, 0, 0],
    [10, 0, 0],
    [10, 10, 0],
  ];
  assert.deepEqual(samplePolyline(points, 0), [0, 0, 0]);
  assert.deepEqual(samplePolyline(points, 0.25), [5, 0, 0]);
  assert.deepEqual(samplePolyline(points, 0.75), [10, 5, 0]);
  assert.deepEqual(samplePolyline(points, 1), [10, 10, 0]);
  assert.deepEqual(samplePolyline(Array(4).fill([1, 2, 3]), 0.5), [1, 2, 3]);
});
