import { ARCHITECTURE, buildingDimensions } from './building-metrics.js';
import { CITY, STREETS, streetWidth, streetEdgeWidth, settlementDensity } from './city-layout.js';

// Choose the house dimensions before dividing the frontage. The previous fixed
// point grid rejected larger houses, leaving accidental empty lawns everywhere.
function frontageWidths(span, min, max, random) {
  const gap = STREETS.sideGap;
  const count = Math.max(1, Math.min(
    Math.floor((span - 1.6 + gap) / (min + gap)),
    Math.round((span + gap) / ((min + max) / 2 + gap)),
  ));
  const widths = [];
  let remaining = Math.min(span - (count - 1) * gap - 1.6, count * max);
  for (let i = 0; i < count; i++) {
    const left = count - i - 1;
    const low = Math.max(min, remaining - left * max);
    const high = Math.min(max, remaining - left * min);
    const width = low + random() * Math.max(0, high - low);
    widths.push(width);remaining -= width;
  }
  return widths;
}

export function urbanOccupancy(x, z) {
  const density = settlementDensity(x, z);
  const t = Math.min(1, Math.max(0, (density - .06) / .59));
  return t * t * (3 - 2 * t);
}

export function planStreetBlock(bx, bz, random) {
  const half = CITY.blockSize / 2;
  const edge = line => streetWidth(line) / 2 + streetEdgeWidth(streetWidth(line));
  const left = bx - half + edge(bx - half) + .8;
  const right = bx + half - edge(bx + half) - .8;
  const span = right - left;
  const parcels = [];
  const mixedUse = Math.abs(bx) < 1200 && bz > 620;
  for (let band = 0; band < 2; band++) {
    const lowStreet = bz + (band - 1) * half;
    const highStreet = lowStreet + half;
    const lowEdge = lowStreet + (band === 0 ? edge(lowStreet) : STREETS.laneWidth / 2 + STREETS.sharedEdge);
    const highEdge = highStreet - (band === 1 ? edge(highStreet) : STREETS.laneWidth / 2 + STREETS.sharedEdge);
    const middle = (lowEdge + highEdge) / 2;
    const midrise = mixedUse && random() < .13;
    // Apartment buildings take a complete depth parcel instead of colliding
    // with a second residential row and being silently discarded.
    const rows = midrise ? [random() < .5 ? -1 : 1] : [-1, 1];
    for (const frontSign of rows) {
      const widths = frontageWidths(span, (midrise ? 18 : 11) * ARCHITECTURE.footprintScale, (midrise ? 24 : 18) * ARCHITECTURE.footprintScale, random);
      const used = widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * STREETS.sideGap;
      let cursor = left + (span - used) / 2;
      for (const w of widths) {
        const maximumDepth = midrise
          ? highEdge - lowEdge - STREETS.frontDepth - STREETS.rearGap
          : (frontSign < 0 ? middle - lowEdge : highEdge - middle) - STREETS.frontDepth - STREETS.rearGap / 2;
        const previousW = w / ARCHITECTURE.footprintScale;
        const minimumDepth = midrise ? 17 : 12;
        const maximumPreviousDepth = Math.min(midrise ? 23 : 18, maximumDepth / ARCHITECTURE.footprintScale);
        const previousD = minimumDepth + random() * Math.max(0, maximumPreviousDepth - minimumDepth);
        const previousH = midrise ? 16 + random() * 16 : 6 + random() * 5;
        const dimensions = buildingDimensions(previousW, previousD, previousH, midrise);
        const rawZ = frontSign < 0
          ? lowEdge + STREETS.frontDepth + dimensions.d / 2
          : highEdge - STREETS.frontDepth - dimensions.d / 2;
        parcels.push({
          ...dimensions, rawX: cursor + w / 2, rawZ,
          rotation: frontSign < 0 ? Math.PI : 0,
          streetZ: frontSign < 0 ? lowStreet : highStreet,
          frontSign, previousW, previousD,
          parcel: { frontDepth: STREETS.frontDepth, sideGap: STREETS.sideGap, rearGap: STREETS.rearGap },
        });
        cursor += w + STREETS.sideGap;
      }
    }
  }
  return parcels;
}
