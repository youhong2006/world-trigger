import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHITECTURE, PERSON } from './building-metrics.js';
import { planStreetBlock, urbanOccupancy } from './neighborhood.js';
import { CITY, STREETS, basinRadius, seededRandom, streetEdgeWidth, streetWidth } from './city-layout.js';

const EPSILON = 1e-8;
const blocks = [[936, 504], [936, 648], [-936, -792], [1512, 72], [72, 72]];
const seeds = Array.from({ length: 36 }, (_, index) => 20261022 + index * 7919);
const plans = blocks.flatMap(([bx, bz]) => seeds.map(seed => ({
  bx, bz, seed, lots: planStreetBlock(bx, bz, seededRandom(seed)),
})));

const curbOffset = width => width / 2 + streetEdgeWidth(width);
const streetOffset = (streetZ, bz) => Math.abs(streetZ - bz) < EPSILON
  ? STREETS.laneWidth / 2 + STREETS.sharedEdge
  : curbOffset(streetWidth(streetZ));
const bounds = (lot, extra = 0) => ({
  minX: lot.rawX - lot.w / 2 - extra,
  maxX: lot.rawX + lot.w / 2 + extra,
  minZ: lot.rawZ - lot.d / 2 - extra,
  maxZ: lot.rawZ + lot.d / 2 + extra,
});
const overlaps = (a, b) => a.minX < b.maxX - EPSILON && a.maxX > b.minX + EPSILON
  && a.minZ < b.maxZ - EPSILON && a.maxZ > b.minZ + EPSILON;

function balconyBounds(lot) {
  // Include the outer railing thickness, not only the balcony floor slab.
  const width = lot.midrise ? lot.w - .6 : Math.min(7.4, lot.w * .55);
  const localX = lot.midrise ? 0 : lot.w * .13;
  const centerX = lot.rawX + localX * Math.cos(lot.rotation);
  const facadeZ = lot.rawZ + lot.frontSign * lot.d / 2;
  const outerZ = facadeZ + lot.frontSign * (ARCHITECTURE.balconyDepth + .06);
  return {
    minX: centerX - width / 2 - .045,
    maxX: centerX + width / 2 + .045,
    minZ: Math.min(facadeZ, outerZ),
    maxZ: Math.max(facadeZ, outerZ),
  };
}

function assertClearOfStreets(footprint, bx, bz, label) {
  const half = CITY.blockSize / 2;
  const leftCurb = bx - half + curbOffset(streetWidth(bx - half));
  const rightCurb = bx + half - curbOffset(streetWidth(bx + half));
  assert.ok(footprint.minX >= leftCurb - EPSILON, `${label}: crosses west curb`);
  assert.ok(footprint.maxX <= rightCurb + EPSILON, `${label}: crosses east curb`);
  for (const streetZ of [bz - half, bz, bz + half]) {
    const edge = streetOffset(streetZ, bz);
    assert.ok(footprint.maxZ <= streetZ - edge + EPSILON || footprint.minZ >= streetZ + edge - EPSILON,
      `${label}: overlaps street/shoulder at z=${streetZ}`);
  }
}

test('planned buildings gain exactly 25 percent in footprint while doors and people keep their scale', () => {
  let houses = 0, apartments = 0;
  for (const { lots } of plans) for (const lot of lots) {
    assert.ok(Math.abs(lot.w / (lot.previousW * 1.35) - 1.25) < EPSILON);
    assert.ok(Math.abs(lot.d / (lot.previousD * 1.35) - 1.25) < EPSILON);
    assert.ok(Math.abs(lot.h / lot.floors - 3.3) < EPSILON);
    assert.ok(lot.w >= (lot.midrise ? 18 : 11) * 1.35 * 1.25 - EPSILON);
    assert.ok(lot.w <= (lot.midrise ? 24 : 18) * 1.35 * 1.25 + EPSILON);
    if (lot.midrise) apartments++; else houses++;
  }
  assert.ok(houses > 0 && apartments > 0, 'exercise both residential and apartment parcel plans');
  assert.equal(PERSON.eyeHeight, 1.68);
  assert.equal(ARCHITECTURE.doorHeight, 2.1);
  assert.equal(ARCHITECTURE.doorWidth, 1);
});

test('seeded core blocks keep continuous dense frontage rather than rejecting enlarged houses', () => {
  for (const { bx, bz, seed, lots } of plans) {
    const context = `block ${bx},${bz}, seed ${seed}`;
    const mixedUse = Math.abs(bx) < 1200 && bz > 620;
    assert.ok(lots.length >= (mixedUse ? 12 : 18), `${context}: too few buildings`);
    const coverage = lots.reduce((area, lot) => area + lot.w * lot.d, 0) / CITY.blockSize ** 2;
    assert.ok(coverage > .45, `${context}: building coverage ${coverage.toFixed(3)} is too sparse`);
    assert.ok(coverage < .72, `${context}: insufficient room for lanes and entrances`);
    const rows = Map.groupBy(lots, lot => `${lot.streetZ}/${lot.frontSign}`);
    const half = CITY.blockSize / 2;
    const span = CITY.blockSize - curbOffset(streetWidth(bx - half)) - curbOffset(streetWidth(bx + half));
    for (const row of rows.values()) {
      row.sort((a, b) => a.rawX - b.rawX);
      const frontage = row.reduce((sum, lot) => sum + lot.w, 0) / span;
      assert.ok(frontage > .85, `${context}: frontage coverage ${frontage.toFixed(3)} is too sparse`);
      for (let i = 1; i < row.length; i++) {
        const gap = row[i].rawX - row[i].w / 2 - (row[i - 1].rawX + row[i - 1].w / 2);
        assert.ok(gap >= 1.5 - EPSILON && gap <= 3 + EPSILON,
          `${context}: neighboring houses leave a ${gap.toFixed(2)}m side gap`);
      }
    }
  }
});

test('roofs and projecting balconies stay clear of streets and neighboring buildings', () => {
  for (const { bx, bz, seed, lots } of plans) {
    const context = `block ${bx},${bz}, seed ${seed}`;
    for (let i = 0; i < lots.length; i++) {
      const roof = bounds(lots[i], ARCHITECTURE.eaves);
      const balcony = balconyBounds(lots[i]);
      assertClearOfStreets(roof, bx, bz, `${context}, roof ${i}`);
      assertClearOfStreets(balcony, bx, bz, `${context}, balcony ${i}`);
      for (let j = 0; j < lots.length; j++) {
        if (i === j) continue;
        assert.equal(overlaps(roof, bounds(lots[j], ARCHITECTURE.eaves)), false,
          `${context}: neighboring roofs ${i},${j} overlap`);
        assert.equal(overlaps(balcony, bounds(lots[j])), false,
          `${context}: balcony ${i} enters building ${j}`);
      }
    }
  }
});

test('each entrance faces its serviced street across a compact usable front setback', () => {
  for (const { bz, lots } of plans) for (const lot of lots) {
    const facadeZ = lot.rawZ + lot.frontSign * lot.d / 2;
    const setback = lot.frontSign * (lot.streetZ - facadeZ) - streetOffset(lot.streetZ, bz);
    assert.ok(setback >= 3 - EPSILON && setback <= 4.5 + EPSILON,
      `front setback ${setback.toFixed(2)}m leaves either no entrance space or an oversized lawn`);
    assert.ok(Math.abs(setback - lot.parcel.frontDepth) < EPSILON);
    const forwardX = Math.sin(lot.rotation), forwardZ = Math.cos(lot.rotation);
    assert.ok(Math.abs(forwardX) < EPSILON && forwardZ * lot.frontSign > 1 - EPSILON,
      'front door points away from its street');
    assert.ok(lot.frontSign * (lot.streetZ - lot.rawZ) > lot.d / 2,
      'street must be beyond the front facade');
  }
});

function averageOccupancyAtRadius(radius) {
  let sum = 0;
  for (let sample = 0; sample < 32; sample++) {
    const angle = sample / 32 * Math.PI * 2;
    const x = Math.cos(angle) * CITY.basinX, z = Math.sin(angle) * CITY.basinZ;
    const scale = radius / basinRadius(x, z);
    sum += urbanOccupancy(x * scale, z * scale);
  }
  return sum / 32;
}

test('occupancy fills the urban core and gradually thins around the irregular foothill boundary', () => {
  assert.ok(averageOccupancyAtRadius(.35) > .99);
  const suburbs = averageOccupancyAtRadius(.8);
  const fringe = averageOccupancyAtRadius(.9);
  assert.ok(suburbs > .4 && suburbs < .85, 'outer neighborhoods should retain a partial settlement');
  assert.ok(fringe > .02 && fringe < .25, 'foothill fringe should have occasional houses');
  assert.equal(averageOccupancyAtRadius(1.08), 0);
  let previous = averageOccupancyAtRadius(.55);
  for (let radius = .57; radius < 1.06; radius += .02) {
    const current = averageOccupancyAtRadius(radius);
    assert.ok(current <= previous + .015, 'settlement should generally become less dense toward the hills');
    assert.ok(previous - current < .15, 'settlement must not end at an abrupt rectangular cutoff');
    previous = current;
  }
});
