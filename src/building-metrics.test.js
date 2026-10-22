import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHITECTURE, PERSON, buildingDimensions, orientedFootprint } from './building-metrics.js';
import { groundHeight, terrainHeight, createCollisionIndex, streetElevation, STREETS } from './city-layout.js';

test('every building footprint grows by another 25 percent and receives complete human-scale floors', () => {
  for (const [w, d, height, apartment] of [[11, 12, 6, false], [18, 18, 11, false], [18, 17, 16, true], [24, 23, 39, true]]) {
    const building = buildingDimensions(w, d, height, apartment);
    assert.ok(Math.abs(building.w / (w * ARCHITECTURE.previousFootprintScale) - 1.25) < 1e-10);
    assert.ok(Math.abs(building.d / (d * ARCHITECTURE.previousFootprintScale) - 1.25) < 1e-10);
    if (apartment) assert.ok(building.h >= height);
    else assert.ok(building.floors === 2 || building.floors === 3);
    assert.equal(building.h, building.floors * 3.3);
    assert.ok(building.floors >= (apartment ? 5 : 2));
  }
  assert.ok(PERSON.eyeHeight < ARCHITECTURE.doorHeight);
  assert.ok(ARCHITECTURE.doorHeight < ARCHITECTURE.floorHeight);
  assert.ok(PERSON.walkSpeed < 3 && PERSON.sprintSpeed < 8);
});

test('rotated buildings reserve room for projecting balconies and roof edges', () => {
  const footprint = orientedFootprint(20, 26, Math.PI / 2, 1.2);
  assert.ok(Math.abs(footprint.w - 28.4) < 1e-8);
  assert.ok(Math.abs(footprint.d - 22.4) < 1e-8);
  const collision = createCollisionIndex();
  collision.add({ x: 48, z: 40, w: footprint.w, d: footprint.d });
  assert.equal(collision.overlapsBox(70, 40, 20, 20), true);
  assert.equal(collision.overlapsBox(85, 40, 20, 20), false);
});

test('human eye height is measured from the paved street instead of the terrain underneath it', () => {
  const streetHeight = groundHeight(-1008, 1080);
  assert.ok(Math.abs(streetHeight - terrainHeight(-1008, 1080) - streetElevation(STREETS.arterialWidth)) < 1e-8);
  const eye = streetHeight + PERSON.eyeHeight;
  assert.ok(Math.abs(eye - (streetElevation(STREETS.arterialWidth) + PERSON.eyeHeight)) < 1e-8);
  assert.ok(Math.abs((eye - streetHeight) - 1.63) < 1e-8);
});
