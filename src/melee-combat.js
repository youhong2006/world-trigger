const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const MELEE_MOVES = Object.freeze({
  light1: { windup: 0.14, active: 0.12, recovery: 0.22, damage: 18, reach: 2.7, arc: 1.3, cost: 0.2 },
  light2: { windup: 0.12, active: 0.13, recovery: 0.23, damage: 21, reach: 2.9, arc: 1.45, cost: 0.2 },
  light3: { windup: 0.2, active: 0.15, recovery: 0.36, damage: 29, reach: 3.2, arc: 1.5, cost: 0.3 },
  heavy: { windup: 0.24, active: 0.17, recovery: 0.45, damage: 40, reach: 3.5, arc: 1.05, cost: 0.5 },
  aerial: { windup: 0.12, active: 0.2, recovery: 0.3, damage: 25, reach: 3, arc: 1.4, cost: 0.25 },
});
export function createMeleeCombat({ combat, onEvent = () => {} }) {
  let phase = 'idle',
    move = null,
    elapsed = 0,
    combo = 0,
    comboTime = 0,
    buffer = null,
    charge = 0,
    guardTime = 0,
    guardLock = 0,
    parryCooldown = 0,
    dodgeCooldown = 0,
    serial = 0,
    struck = false,
    blade = false,
    shield = false,
    grounded = true;
  function event(type, detail = {}) {
    onEvent(type, { ...detail, serial });
  }
  function reset() {
    phase = 'idle';
    move = null;
    elapsed = combo = comboTime = charge = guardTime = guardLock = parryCooldown = dodgeCooldown = 0;
    buffer = null;
    struck = false;
    serial++;
  }
  function can(action) {
    if (['paused', 'exhausted'].includes(combat.snapshot.state) || phase === 'stagger') return false;
    if (phase === 'idle') return true;
    if (phase === 'guard') return action !== 'fire' && action !== 'attack';
    if (phase === 'dodge') return elapsed >= 0.2 && ['grasshopper', 'switch'].includes(action);
    if (phase === 'charge') return ['dodge', 'grasshopper', 'switch'].includes(action);
    if (phase === 'attack') {
      const m = MELEE_MOVES[move];
      return (
        elapsed >= m.windup + m.active + 0.06 && ['dodge', 'grasshopper', 'switch', 'fire'].includes(action)
      );
    }
    return false;
  }
  function cancel() {
    phase = 'idle';
    move = null;
    elapsed = 0;
    buffer = null;
    charge = 0;
  }
  function attack(heavy = false) {
    if (!blade) return false;
    if (phase === 'attack') {
      buffer = { heavy, life: 0.26 };
      return true;
    }
    if (!can('attack')) return false;
    move = !grounded ? 'aerial' : heavy ? 'heavy' : `light${comboTime > 0 ? (combo % 3) + 1 : 1}`;
    const spec = MELEE_MOVES[move];
    if (!combat.consume('blade', spec.cost, { parallel: true })) return false;
    phase = 'attack';
    elapsed = 0;
    struck = false;
    combo = heavy ? 0 : Number(move.slice(-1)) || 0;
    serial++;
    event('swing', { move, duration: spec.windup + spec.active + spec.recovery });
    return true;
  }
  function heavyStart() {
    if (!blade || !can('attack')) return false;
    phase = 'charge';
    elapsed = charge = 0;
    serial++;
    return true;
  }
  function heavyRelease() {
    if (phase !== 'charge') return false;
    const power = charge;
    cancel();
    const ok = attack(true);
    charge = power;
    return ok;
  }
  function guard(value) {
    if (!value) {
      if (phase === 'guard') cancel();
      return;
    }
    if ((shield || blade) && guardLock <= 0 && can('guard') && phase !== 'guard') {
      cancel();
      phase = 'guard';
      guardTime = parryCooldown > 0 ? 1 : 0;
      parryCooldown = 0.45;
      serial++;
      event('guard');
    }
  }
  function dodge() {
    if (dodgeCooldown > 0 || !can('dodge') || !combat.consume('dodge', 0.3, { parallel: true })) return false;
    cancel();
    phase = 'dodge';
    elapsed = 0;
    dodgeCooldown = 0.62;
    serial++;
    event('dodge', { duration: 0.28 });
    return true;
  }
  function stagger(duration = 0.28) {
    cancel();
    phase = 'stagger';
    elapsed = -clamp(duration, 0.08, 0.8);
    combo = 0;
    serial++;
    event('stagger');
  }
  function defend({ origin, position, yaw, damage, parryable = true }) {
    const dx = origin.x - position.x,
      dz = origin.z - position.z,
      distance = Math.hypot(dx, dz) || 1;
    const frontal = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / distance > 0.28;
    if (phase !== 'guard' || !frontal) return { damage, blocked: false, parried: false };
    if (guardTime <= 0.18 && parryable && blade) {
      event('parry');
      return { damage: 0, blocked: true, parried: true };
    }
    const cost = shield ? 1.2 + damage * 0.08 : 1.8 + damage * 0.12;
    if (!combat.consume(shield ? 'shield' : 'blade', cost, { parallel: true })) {
      guardLock = 0.7;
      stagger(0.55);
      event('guardBreak');
      return { damage, blocked: false, parried: false };
    }
    if (!shield) {
      guardLock = 0.18;
    }
    event('block');
    return { damage: shield ? 0 : damage * 0.18, blocked: true, parried: false };
  }
  function update(dt, kit = {}) {
    if (!(dt > 0) || ['paused', 'exhausted'].includes(combat.snapshot.state)) return;
    blade = !!kit.blade;
    shield = !!kit.shield;
    grounded = kit.grounded !== false;
    if (((phase === 'attack' || phase === 'charge') && !blade) || (phase === 'guard' && !blade && !shield))
      cancel();
    dodgeCooldown = Math.max(0, dodgeCooldown - dt);
    guardLock = Math.max(0, guardLock - dt);
    parryCooldown = Math.max(0, parryCooldown - dt);
    comboTime = Math.max(0, comboTime - dt);
    if (buffer) {
      buffer.life -= dt;
      if (buffer.life <= 0) buffer = null;
    }
    elapsed += dt;
    if (phase === 'guard') {
      guardTime += dt;
      if (shield && !combat.consume('shield', 0.35 * dt, { parallel: true })) {
        cancel();
        guardLock = 0.7;
      }
    }
    if (phase === 'charge') charge = Math.min(1, charge + dt / 0.7);
    if (phase === 'attack') {
      const spec = MELEE_MOVES[move];
      if (elapsed >= spec.windup && (!struck || elapsed <= spec.windup + spec.active)) {
        struck = true;
        event('strike', { ...spec, move, damage: spec.damage * (move === 'heavy' ? 1 + charge * 0.5 : 1) });
      }
      if (elapsed >= spec.windup + spec.active + spec.recovery) {
        const queued = buffer;
        cancel();
        comboTime = 0.6;
        if (queued && blade) attack(queued.heavy);
      }
    } else if ((phase === 'dodge' && elapsed >= 0.28) || (phase === 'stagger' && elapsed >= 0)) cancel();
  }
  return {
    can,
    attack,
    heavyStart,
    heavyRelease,
    guard,
    dodge,
    stagger,
    defend,
    update,
    reset,
    cancel,
    get snapshot() {
      return {
        phase,
        move,
        elapsed,
        serial,
        charge,
        combo,
        blade,
        shield,
        guarding: phase === 'guard',
        parryWindow: phase === 'guard' && guardTime <= 0.18,
        speedScale:
          phase === 'stagger'
            ? 0.12
            : phase === 'attack' || phase === 'charge'
              ? 0.55
              : phase === 'guard'
                ? 0.65
                : 1,
        invulnerable: false,
        dodgeCooldown,
      };
    },
  };
}
