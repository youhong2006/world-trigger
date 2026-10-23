// Subtract a rectangular excavation from one terrain triangle. Linear interpolation
// preserves the surrounding landscape exactly, rather than leaving coarse edge gaps.
export function clipExcavationTriangle(vertices, bounds) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const xs = vertices.map((p) => p.x),
    zs = vertices.map((p) => p.z);
  if (
    Math.max(...xs) <= minX ||
    Math.min(...xs) >= maxX ||
    Math.max(...zs) <= minZ ||
    Math.min(...zs) >= maxZ
  )
    return [vertices];
  const planes = [
      [1, 0, maxX],
      [-1, 0, -minX],
      [0, 1, maxZ],
      [0, -1, -minZ],
    ],
    outside = [];
  let remaining = vertices;
  function clip(poly, nx, nz, c, keepInside) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        da = nx * a.x + nz * a.z - c,
        db = nx * b.x + nz * b.z - c;
      const ia = keepInside ? da <= 1e-8 : da >= -1e-8,
        ib = keepInside ? db <= 1e-8 : db >= -1e-8;
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = da / (da - db);
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          color: a.color.map((v, j) => v + (b.color[j] - v) * t),
        });
      }
    }
    return out;
  }
  for (const [nx, nz, c] of planes) {
    const piece = clip(remaining, nx, nz, c, false);
    if (piece.length >= 3) outside.push(piece);
    remaining = clip(remaining, nx, nz, c, true);
    if (remaining.length < 3) break;
  }
  return outside;
}
