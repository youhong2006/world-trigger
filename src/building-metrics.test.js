import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHITECTURE, PERSON, buildingDimensions, orientedFootprint, fitsStreetLot, facesNearestStreet } from './building-metrics.js';
import { groundHeight, terrainHeight, createCollisionIndex } from './city-layout.js';

test('every building footprint grows by 35 percent and receives complete human-scale floors', () => {
  for (const [w, d, height, apartment] of [[11, 12, 6, false], [18, 18, 11, false], [18, 17, 16, true], [24, 23, 39, true]]) {
    const building = buildingDimensions(w, d, height, apartment);
    assert.equal(building.w, w * 1.35);
    assert.equal(building.d, d * 1.35);
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

test('larger apartments cannot encroach on main roads or narrow access lanes', () => {
  const apartment = orientedFootprint(32, 30, 0, 1.2);
  assert.equal(fitsStreetLot(-982, 118, -936, 72, apartment), false);
  assert.equal(fitsStreetLot(87, 87, 72, 72, apartment), false);
  assert.equal(fitsStreetLot(118, 118, 72, 72, orientedFootprint(20, 22, 0, 1.2)), true);
});

test('entrances face the street or shared lane instead of the neighboring house', () => {
  assert.equal(facesNearestStreet(46, 46), 0);
  assert.equal(facesNearestStreet(-46, -46), Math.PI);
  assert.equal(facesNearestStreet(15, 46), 0);
  assert.equal(facesNearestStreet(-15, -46), Math.PI);
  assert.equal(facesNearestStreet(46, 15), Math.PI / 2);
  assert.equal(facesNearestStreet(-46, -15), -Math.PI / 2);
});


test('human eye height is measured from the paved street instead of the terrain underneath it', () => {
  const streetHeight = groundHeight(-1008, 1080);
  assert.ok(Math.abs(streetHeight - terrainHeight(-1008, 1080) - .17) < 1e-8);
  const eye = streetHeight + PERSON.eyeHeight;
  assert.ok(Math.abs(eye - 1.85) < 1e-8);
  assert.ok(Math.abs((eye - streetHeight) - 1.68) < 1e-8);
});
