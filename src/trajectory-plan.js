export const PATH_TEMPLATES = {
  direct: {
    name: '直線',
    points: [
      [0, 1, 0],
      [0, 1, -6],
      [0, 1, -12],
      [0, 1, -20],
    ],
  },
  left: {
    name: '繞左',
    points: [
      [0, 1, 0],
      [-6, 1, -5],
      [-6, 1, -14],
      [0, 1, -20],
    ],
  },
  right: {
    name: '繞右',
    points: [
      [0, 1, 0],
      [6, 1, -5],
      [6, 1, -14],
      [0, 1, -20],
    ],
  },
  above: {
    name: '上方落下',
    points: [
      [0, 1, 0],
      [0, 10, -5],
      [0, 10, -16],
      [0, 1, -20],
    ],
  },
  flank: {
    name: '外側包圍',
    points: [
      [0, 1, 0],
      [-9, 3, -6],
      [-9, 3, -24],
      [0, 1, -20],
    ],
  },
};
export const DRAFTS_KEY = 'mikado-tactical-drafts-v1';
export function cleanDraft(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const paths = Array.isArray(value.paths)
    ? value.paths
        .slice(0, 8)
        .filter(
          (p) =>
            p &&
            Array.isArray(p.points) &&
            p.points.length === 4 &&
            p.points.every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)),
        )
        .map((p, i) => ({
          id: typeof p.id === 'string' ? p.id.slice(0, 50) : 'route-' + (i + 1),
          name: String(p.name ?? `路線 ${i + 1}`).slice(0, 30),
          points: p.points.map((v) => [
            Math.max(-25, Math.min(25, v[0])),
            Math.max(0, Math.min(20, v[1])),
            Math.max(-30, Math.min(5, v[2])),
          ]),
        }))
    : [];
  const ids = new Set();
  for (const path of paths) {
    const base = path.id.slice(0, 44) || 'route';
    let suffix = 1;
    while (!path.id || ids.has(path.id)) path.id = base + '-' + suffix++;
    ids.add(path.id);
  }
  const known = ['grasshopper', 'asteroid', 'hound', 'viper', 'meteor', 'blade', 'shield'];
  return {
    equipment: known.filter(
      (id) => id === 'grasshopper' || (Array.isArray(value.equipment) && value.equipment.includes(id)),
    ),
    paths: paths.length
      ? paths
      : [{ id: 'route-1', name: '繞側路線', points: structuredClone(PATH_TEMPLATES.left.points) }],
  };
}
export function loadDraft(storage) {
  try {
    return cleanDraft(JSON.parse(storage.getItem(DRAFTS_KEY) ?? '{}'));
  } catch {
    return cleanDraft();
  }
}
export function saveDraft(storage, value) {
  try {
    storage.setItem(DRAFTS_KEY, JSON.stringify(cleanDraft(value)));
    return true;
  } catch {
    return false;
  }
}

export function samplePolyline(points, t) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - points[i][k]))),
    total = lengths.reduce((a, b) => a + b, 0);
  let distance = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const r = lengths[i] ? distance / lengths[i] : 0;
      return points[i].map((v, k) => v + (points[i + 1][k] - v) * r);
    }
    distance -= lengths[i];
  }
  return [...points[0]];
}
