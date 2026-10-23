// Bounded A* around nearby cover; movement also checks exact collision every step.
export function findArenaPath(
  from,
  goal,
  { groundHeight, collision, cell = 4, radius = 0.65, limit = 700 } = {},
) {
  const origin = { x: Math.round(from.x / cell), z: Math.round(from.z / cell) },
    target = { x: Math.round(goal.x / cell), z: Math.round(goal.z / cell) };
  const key = (x, z) => `${x},${z}`,
    heuristic = (x, z) => Math.hypot(x - target.x, z - target.z);
  const start = { ...origin, g: 0, f: heuristic(origin.x, origin.z), parent: null },
    open = [start],
    nodes = new Map([[key(start.x, start.z), start]]),
    closed = new Set();
  let best = start,
    expanded = 0;
  while (open.length && expanded++ < limit) {
    open.sort((a, b) => b.f - a.f);
    const node = open.pop(),
      id = key(node.x, node.z);
    if (closed.has(id)) continue;
    closed.add(id);
    if (heuristic(node.x, node.z) < heuristic(best.x, best.z)) best = node;
    if (heuristic(node.x, node.z) <= 1) {
      best = node;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const x = node.x + dx,
        z = node.z + dz,
        k = key(x, z),
        wx = x * cell,
        wz = z * cell;
      if (closed.has(k) || Math.hypot(x - origin.x, z - origin.z) > 50) continue;
      const y = groundHeight(wx, wz);
      if (
        !Number.isFinite(y) ||
        Math.abs(y - groundHeight(node.x * cell, node.z * cell)) > 1.5 ||
        !collision.canOccupy(wx, wz, y, 2.3, radius)
      )
        continue;
      // Diagonal nodes cannot squeeze through corners.
      if (
        dx &&
        dz &&
        (!collision.canOccupy(wx, node.z * cell, y, 2.3, radius) ||
          !collision.canOccupy(node.x * cell, wz, y, 2.3, radius))
      )
        continue;
      const g = node.g + Math.hypot(dx, dz),
        old = nodes.get(k);
      if (old && old.g <= g) continue;
      const next = { x, z, g, f: g + heuristic(x, z), parent: node };
      nodes.set(k, next);
      open.push(next);
    }
  }
  const path = [];
  for (let n = best; n.parent; n = n.parent)
    path.unshift({ x: n.x * cell, y: groundHeight(n.x * cell, n.z * cell), z: n.z * cell });
  return path;
}
