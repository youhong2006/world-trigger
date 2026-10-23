// Combat-body damage is persistent until reconstruction, independent of Trion regeneration.
export const BODY_PARTS = Object.freeze({
  head: { name: '頭部', health: 45, critical: true },
  torso: { name: '核心', health: 85, critical: true },
  leftArm: { name: '左臂', health: 26 },
  rightArm: { name: '右臂', health: 26 },
  leftLeg: { name: '左腿', health: 34 },
  rightLeg: { name: '右腿', health: 34 },
});
export function bodyVolumes(position, yaw = 0, crouched = false, parts = {}) {
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
    scale = crouched ? 0.66 : 1;
  return [
    ['head', 0, 1.58, 0.21],
    ['torso', 0, 1.08, 0.31],
    ['leftArm', -0.36, 1.12, 0.2],
    ['rightArm', 0.36, 1.12, 0.2],
    ['leftLeg', -0.16, 0.43, 0.22],
    ['rightLeg', 0.16, 0.43, 0.22],
  ]
    .filter(([id]) => !parts[id]?.destroyed)
    .map(([id, offset, y, radius]) => ({
      id,
      radius,
      position: {
        x: position.x + right.x * offset,
        y: position.y + y * scale,
        z: position.z + right.z * offset,
      },
    }));
}
export function createBattleBody({ combat, onEvent = () => {} }) {
  let parts,
    revision = 0,
    failed = false;
  function reset() {
    failed = false;
    parts = Object.fromEntries(
      Object.entries(BODY_PARTS).map(([id, def]) => [
        id,
        { health: def.health, maximum: def.health, destroyed: false },
      ]),
    );
    combat.setLeakage(0);
    revision++;
  }
  function hit(id, amount) {
    if (
      failed ||
      ['paused', 'exhausted'].includes(combat.snapshot.state) ||
      !parts[id] ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      parts[id].destroyed
    )
      return false;
    const part = parts[id];
    part.health = Math.max(0, part.health - amount);
    part.destroyed = part.health === 0;
    revision++;
    // Even a glancing body wound drains the shared life/energy reserve.
    combat.damage(amount * 0.65);
    const leakage = Object.entries(parts).reduce(
      (total, [key, p]) =>
        total + (p.destroyed ? 1.05 : p.health < p.maximum ? (1 - p.health / p.maximum) * 0.32 : 0),
      0,
    );
    combat.setLeakage(leakage);
    onEvent(part.destroyed ? 'sever' : 'wound', { part: id, amount, critical: !!BODY_PARTS[id].critical });
    if (part.destroyed && BODY_PARTS[id].critical) {
      failed = true;
      onEvent('critical', { part: id });
    }
    return true;
  }
  reset();
  return {
    hit,
    reset,
    usable(side) {
      return !failed && !parts[side === 'main' ? 'rightArm' : 'leftArm'].destroyed;
    },
    volumes(position, yaw, crouched) {
      return bodyVolumes(position, yaw, crouched, parts);
    },
    get snapshot() {
      const lostLegs = Number(parts.leftLeg.destroyed) + Number(parts.rightLeg.destroyed);
      return {
        parts: structuredClone(parts),
        revision,
        failed,
        lostLegs,
        speedScale: [1, 0.62, 0.28][lostLegs],
        jumpScale: [1, 0.7, 0][lostLegs],
        leakage: combat.snapshot.leakage,
      };
    },
  };
}
