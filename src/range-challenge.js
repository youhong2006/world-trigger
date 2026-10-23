export const RANGE_SPAWN = Object.freeze({ x: 0, y: 0, z: 365, yaw: -Math.PI / 2 });
export const RANGE_TARGETS = Object.freeze([
  { id: 'T01', position: { x: 35, y: 1.9, z: 365 }, radius: 1.3, maxHealth: 24 },
  { id: 'T02', position: { x: 65, y: 2.8, z: 345 }, radius: 1.3, maxHealth: 24 },
  { id: 'T03', position: { x: 95, y: 4, z: 385 }, radius: 1.4, maxHealth: 32 },
  { id: 'T04', position: { x: 125, y: 1.9, z: 375 }, radius: 1.3, maxHealth: 32 },
  { id: 'T05', position: { x: 155, y: 5, z: 380 }, radius: 1.4, maxHealth: 40 },
  { id: 'T06', position: { x: 185, y: 2.8, z: 365 }, radius: 1.5, maxHealth: 40 },
]);
export function createRangeChallenge({ onFinish = () => {} } = {}) {
  let phase = 'idle',
    time = 0,
    shots = 0,
    hits = 0,
    result = null;
  let targets = RANGE_TARGETS.map((t) => ({ ...t, position: { ...t.position }, health: t.maxHealth }));
  function finish(reason) {
    if (phase !== 'active') return;
    phase = reason === 'cleared' ? 'victory' : 'defeat';
    const accuracy = shots ? Math.min(1, hits / shots) : 0;
    result = {
      reason,
      time,
      shots,
      hits,
      accuracy,
      cleared: targets.filter((t) => t.health <= 0).length,
      score: reason === 'cleared' ? Math.round(600 + (90 - time) * 35 + accuracy * 600) : 0,
    };
    onFinish({ ...result, phase });
  }
  function reset() {
    targets = RANGE_TARGETS.map((t) => ({ ...t, position: { ...t.position }, health: t.maxHealth }));
    phase = 'idle';
    time = shots = hits = 0;
    result = null;
  }
  return {
    start() {
      reset();
      phase = 'active';
    },
    reset,
    recordShot() {
      if (phase === 'active') shots++;
    },
    hit(id, damage) {
      const t = targets.find((t) => t.id === id);
      if (!t || t.health <= 0 || !Number.isFinite(damage) || damage <= 0) return false;
      t.health = Math.max(0, t.health - damage);
      if (phase === 'active') {
        hits++;
        if (targets.every((t) => t.health <= 0)) finish('cleared');
      }
      return true;
    },
    update(dt) {
      if (phase !== 'active' || !Number.isFinite(dt) || dt <= 0) return;
      time = Math.min(90, time + dt);
      if (time >= 90) finish('timeout');
    },
    fail() {
      finish('trion');
    },
    get targets() {
      return targets;
    },
    get snapshot() {
      return {
        phase,
        time,
        remaining: Math.max(0, 90 - time),
        cleared: targets.filter((t) => t.health <= 0).length,
        total: targets.length,
        shots,
        hits,
        result: result ? { ...result } : null,
        targets: targets.map((t) => ({ ...t, position: { ...t.position } })),
      };
    },
  };
}
