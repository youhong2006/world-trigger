import { segmentSphere } from './projectiles.js';
import { findArenaPath } from './arena-navigation.js';
export const BATTLE_SPAWN = Object.freeze({ x: -25, z: 375, yaw: -Math.PI / 2 });
export const ARENA = Object.freeze({ x: 0, z: 420, radius: 270 });
export const BATTLE_COVERS = Object.freeze([
  { x: -80, z: 380, w: 6, d: 1.2, h: 2.1 },
  { x: -40, z: 435, w: 7, d: 1.1, h: 1.05 },
  { x: 30, z: 415, w: 5, d: 1.2, h: 2.1 },
]);
export const ENEMY_TYPES = Object.freeze({
  melee: {
    name: '近戰型',
    health: 76,
    speed: 6.2,
    height: 2.1,
    radius: 0.62,
    damage: 14,
    windup: 0.65,
    reach: 3.1,
    cooldown: 1.4,
    armor: 0.9,
  },
  armored: {
    name: '裝甲型',
    health: 165,
    speed: 3.7,
    height: 2.9,
    radius: 0.95,
    damage: 23,
    windup: 1,
    reach: 4.1,
    cooldown: 2,
    armor: 0.32,
  },
  ranged: {
    name: '遠程型',
    health: 65,
    speed: 4.5,
    height: 2,
    radius: 0.6,
    damage: 11,
    windup: 0.85,
    reach: 130,
    cooldown: 1.5,
    armor: 0.8,
  },
  fast: {
    name: '高速型',
    health: 52,
    speed: 10.5,
    height: 1.75,
    radius: 0.5,
    damage: 9,
    windup: 0.45,
    reach: 2.7,
    cooldown: 1.05,
    armor: 1,
  },
});
export const DIFFICULTIES = Object.freeze({
  easy: { name: '練習', health: 0.7, damage: 0.65, speed: 0.85, time: 360 },
  normal: { name: '標準', health: 1, damage: 1, speed: 1, time: 300 },
  hard: { name: '挑戰', health: 1.3, damage: 1.3, speed: 1.15, time: 270 },
});
export const MISSION_MODES = Object.freeze({ waves: '防衛波次', patrol: '巡邏清剿', hunt: '核心討伐' });
export function cleanBattleRecords(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const mode of Object.keys(MISSION_MODES))
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const id = `${mode}:${difficulty}`,
        r = value[id];
      if (r && ['score', 'time', 'cleared', 'accuracy'].every((k) => Number.isFinite(r[k]) && r[k] >= 0))
        out[id] = {
          score: Math.min(1e7, r.score),
          time: Math.min(3600, r.time),
          cleared: Math.min(100, r.cleared),
          accuracy: Math.min(1, r.accuracy),
        };
    }
  return out;
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lerpPoint = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const patrolPoints = [
  { x: 30, z: 375 },
  { x: -95, z: 400 },
  { x: 30, z: 440 },
];
export function createBattleSession({
  groundHeight,
  collision,
  traceWorld,
  onEvent = () => {},
  onPlayerHit = () => {},
  onFinish = () => {},
  storage,
}) {
  let phase = 'idle',
    mode = 'waves',
    difficulty = 'normal',
    time = 0,
    wave = 0,
    cleared = 0,
    total = 0,
    serial = 0,
    transition = 0,
    outside = 0,
    reason = '',
    shots = 0,
    hits = 0,
    damageTaken = 0,
    best = {},
    enemies = [],
    bullets = [],
    player = null,
    lastStrikeSerial = -1,
    strikeHits = new Set();
  try {
    best = cleanBattleRecords(JSON.parse(storage?.getItem('mikado-battle-records-v1') ?? '{}'));
  } catch {
    best = {};
  }
  function emit(type, detail = {}) {
    onEvent(type, detail);
  }
  function point(x, z) {
    return { x, y: groundHeight(x, z), z };
  }
  function legal(p, radius = 0.7) {
    return horizontal(p, ARENA) < ARENA.radius - 8 && collision.canOccupy(p.x, p.z, p.y, 3, radius);
  }
  function spawn(type, p, boss = false) {
    if (enemies.filter((e) => e.health > 0).length >= 16) return null;
    const def = ENEMY_TYPES[type],
      tuning = DIFFICULTIES[difficulty];
    let found = null;
    for (let n = 0; n < 100; n++) {
      const a = n * 2.39996,
        r = Math.sqrt(n) * 2.4,
        c = point(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
      if (
        legal(c, def.radius) &&
        (!player || horizontal(c, player.position) > 9) &&
        enemies.every((e) => e.health <= 0 || horizontal(c, e.feet) > def.radius + e.radius + 1)
      ) {
        found = c;
        break;
      }
    }
    if (!found) return null;
    const health = def.health * tuning.health * (boss ? 2.5 : 1),
      enemy = {
        id: `E${++serial}`,
        type,
        name: boss ? '重裝指揮核心' : def.name,
        boss,
        health,
        maxHealth: health,
        radius: def.radius,
        feet: found,
        position: { ...found, y: found.y + def.height * 0.57 },
        yaw: Math.PI / 2,
        state: 'search',
        timer: 0.5 + enemies.length * 0.22,
        cooldown: 1.2,
        alert: false,
        memory: 0,
        lastSeen: { ...found },
        home: { ...found },
        path: [],
        pathTime: 0,
        stuck: 0,
        attack: null,
        flash: 0,
        death: 0,
      };
    enemies.push(enemy);
    total++;
    emit('spawn', { id: enemy.id });
    return enemy;
  }
  function spawnWave() {
    const list =
      mode === 'hunt'
        ? ['armored', 'ranged', 'fast', 'melee', 'ranged']
        : mode === 'patrol'
          ? wave === 1
            ? ['melee', 'fast']
            : wave === 2
              ? ['armored', 'ranged']
              : ['fast', 'ranged', 'melee']
          : wave === 1
            ? ['melee', 'ranged', 'fast']
            : wave === 2
              ? ['armored', 'ranged', 'fast', 'melee']
              : ['armored', 'ranged', 'fast', 'fast', 'melee'];
    const center = mode === 'patrol' ? patrolPoints[wave - 1] : { x: 45, z: 380 };
    list.forEach((type, i) =>
      spawn(
        type,
        { x: center.x + Math.cos(i * 2.4) * 13, z: center.z + Math.sin(i * 2.4) * 13 },
        mode === 'hunt' && i === 0,
      ),
    );
    transition = 0;
    emit('wave', { wave, mode });
    if (!enemies.some((e) => e.health > 0)) finish('defeat', 'spawn');
  }
  function start(options = {}) {
    reset();
    mode = Object.hasOwn(MISSION_MODES, options.mode) ? options.mode : 'waves';
    difficulty = Object.hasOwn(DIFFICULTIES, options.difficulty) ? options.difficulty : 'normal';
    phase = 'active';
    wave = 1;
    if (mode === 'patrol') {
      transition = -1;
      emit('waypoint', { wave });
    } else spawnWave();
    emit('activate');
  }
  function finish(result, why) {
    if (['idle', 'victory', 'defeat'].includes(phase)) return;
    phase = result;
    reason = why;
    bullets.length = 0;
    const key = `${mode}:${difficulty}`,
      score = Math.max(
        0,
        Math.round(
          cleared * 200 +
            (result === 'victory' ? 1000 : 0) +
            Math.max(0, DIFFICULTIES[difficulty].time - time) * 3 -
            damageTaken * 3,
        ),
      );
    if (result === 'victory' && score > (best[key]?.score ?? 0)) {
      best[key] = { score, time, cleared, accuracy: shots ? Math.min(1, hits / shots) : 0 };
      try {
        storage?.setItem('mikado-battle-records-v1', JSON.stringify(best));
      } catch {}
    }
    onFinish({ ...snapshot(), score });
  }
  function bailout(why = 'manual') {
    if (phase !== 'active') return false;
    phase = 'bailout';
    reason = why;
    transition = 1.7;
    bullets.length = 0;
    emit('bailout', {
      reason: why,
      position: player ? { ...player.position } : point(BATTLE_SPAWN.x, BATTLE_SPAWN.z),
    });
    return true;
  }
  function reset() {
    phase = 'idle';
    time = wave = cleared = total = transition = outside = shots = hits = damageTaken = 0;
    reason = '';
    enemies = [];
    bullets = [];
    ((player = null), (lastStrikeSerial = -1), (strikeHits = new Set()));
  }
  function targetVolumes(e) {
    const def = ENEMY_TYPES[e.type],
      front = { x: -Math.sin(e.yaw), z: -Math.cos(e.yaw) };
    return [
      { id: 'armor', position: { ...e.position }, radius: e.radius },
      {
        id: 'core',
        position: {
          x: e.feet.x + front.x * (e.radius + 0.09),
          y: e.feet.y + def.height * 0.73,
          z: e.feet.z + front.z * (e.radius + 0.09),
        },
        radius: e.radius * 0.4,
      },
    ];
  }
  function hit(id, amount, impact, bullet = {}) {
    const e = enemies.find((e) => e.id === id);
    if (phase !== 'active' || !e || e.health <= 0 || !(amount > 0)) return false;
    const weak = bullet.hitZone === 'core',
      heavy = bullet.move === 'heavy',
      armor = e.state === 'telegraph' ? Math.max(0.65, ENEMY_TYPES[e.type].armor) : ENEMY_TYPES[e.type].armor;
    const damage = amount * (weak ? 2.25 : heavy ? Math.max(0.8, armor) : armor);
    e.health = Math.max(0, e.health - damage);
    e.flash = 0.12;
    e.alert = true;
    e.memory = 7;
    if (player) e.lastSeen = { ...player.position };
    hits++;
    emit('enemyHit', { id, position: impact ?? e.position, weak, damage });
    if (e.health <= 0) {
      cleared++;
      e.state = 'dead';
      e.death = 0.65;
      emit('enemyDown', { id, position: { ...e.position }, boss: e.boss });
    } else if (heavy || weak || e.type !== 'armored') {
      e.state = 'stagger';
      e.timer = heavy ? 0.65 : weak ? 0.45 : 0.2;
      e.attack = null;
    }
    return true;
  }
  function strike(spec, p) {
    if (phase !== 'active') return;
    if (spec.serial !== lastStrikeSerial) {
      lastStrikeSerial = spec.serial;
      strikeHits.clear();
    }
    const origin = { ...p.position, y: p.position.y + 1.05 };
    for (const e of enemies) {
      if (e.health <= 0 || strikeHits.has(e.id)) continue;
      const dx = e.position.x - origin.x,
        dz = e.position.z - origin.z,
        d = Math.hypot(dx, dz);
      const facing = (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / (d || 1);
      if (
        d <= spec.reach + e.radius &&
        Math.abs(e.position.y - origin.y) < (spec.move === 'aerial' ? 2.6 : 1.9) &&
        facing > Math.cos(spec.arc) &&
        traceWorld(origin, e.position, 0.06) > 0.999
      ) {
        strikeHits.add(e.id);
        hit(e.id, spec.damage, e.position, { move: spec.move });
      }
    }
  }
  function stun(id, duration = 0.9) {
    const e = enemies.find((e) => e.id === id);
    if (e?.health > 0) {
      e.state = 'stagger';
      e.timer = duration;
      e.attack = null;
      emit('enemyParried', { id });
    }
  }
  function takeHit(amount, origin, part, enemyId, parryable = true) {
    if (phase !== 'active') return;
    const response =
      onPlayerHit({ damage: amount * DIFFICULTIES[difficulty].damage, origin, part, enemyId, parryable }) ??
      {};
    if (response.parried) stun(enemyId);
    damageTaken += Math.max(0, response.damage ?? amount);
  }
  function fireEnemy(e, antiAir) {
    if (bullets.length >= 192) return;
    const from = { ...e.position, y: e.position.y + 0.3 },
      aim = e.attack.point;
    const count = e.type === 'armored' ? 3 : e.type === 'ranged' ? 2 : 1;
    for (let i = 0; i < count && bullets.length < 192; i++) {
      const end = { ...aim, x: aim.x + (i - (count - 1) / 2) * 0.45 },
        d = distance(from, end) || 1,
        speed = antiAir ? 38 : 46;
      bullets.push({
        id: ++serial,
        enemyId: e.id,
        position: { ...from },
        velocity: {
          x: ((end.x - from.x) / d) * speed,
          y: ((end.y - from.y) / d) * speed,
          z: ((end.z - from.z) / d) * speed,
        },
        damage: ENEMY_TYPES[e.type].damage * 0.8,
        life: 16,
        age: 0,
        homing: antiAir ? 0.8 : 0,
      });
    }
    emit('enemyFire', { position: from });
  }
  function moveEnemy(e, goal, dt, desired = 0) {
    const def = ENEMY_TYPES[e.type],
      dx = goal.x - e.feet.x,
      dz = goal.z - e.feet.z,
      d = Math.hypot(dx, dz);
    if (d < desired) return;
    e.pathTime -= dt;
    let aim = goal;
    const blocked =
      traceWorld(
        { ...e.position, y: e.feet.y + 0.7 },
        { x: goal.x, y: e.feet.y + 0.7, z: goal.z },
        def.radius * 0.7,
      ) < 0.999;
    if (blocked) {
      if (e.pathTime <= 0) {
        e.path = findArenaPath(e.feet, goal, { groundHeight, collision, radius: def.radius, limit: 420 });
        e.pathTime = 1.1;
      }
      while (e.path.length && horizontal(e.feet, e.path[0]) < 1.5) e.path.shift();
      aim = e.path[0] ?? e.feet;
    }
    const ax = aim.x - e.feet.x,
      az = aim.z - e.feet.z,
      ad = Math.hypot(ax, az) || 1;
    const speed = def.speed * DIFFICULTIES[difficulty].speed * (e.state === 'search' ? 0.45 : 1),
      step = Math.min(ad, speed * dt);
    const before = { ...e.feet };
    for (const axis of ['x', 'z']) {
      const p = { ...e.feet, [axis]: e.feet[axis] + ((axis === 'x' ? ax : az) / ad) * step };
      p.y = groundHeight(p.x, p.z);
      const nearby = enemies.some(
        (other) =>
          other !== e && other.health > 0 && horizontal(other.feet, p) < (other.radius + e.radius) * 0.85,
      );
      if (Math.abs(p.y - e.feet.y) < 0.5 && legal(p, e.radius) && !nearby) e.feet = p;
    }
    e.stuck = horizontal(before, e.feet) < 0.001 ? e.stuck + dt : 0;
    if (e.stuck > 0.4) e.pathTime = 0;
    if (ad > 0.1) e.yaw = Math.atan2(-ax, -az);
    e.position = { ...e.feet, y: e.feet.y + def.height * 0.57 };
  }
  function update(dt, p) {
    if (!(dt > 0) || !p) return;
    player = p;
    if (phase === 'bailout') {
      transition -= dt;
      if (transition <= 0) finish('defeat', reason);
      return;
    }
    if (phase !== 'active') return;
    time += dt;
    if (time >= DIFFICULTIES[difficulty].time) {
      bailout('timeout');
      return;
    }
    outside =
      horizontal(p.position, ARENA) > ARENA.radius ||
      p.position.y - groundHeight(p.position.x, p.position.z) > 300
        ? outside + dt
        : Math.max(0, outside - dt * 3);
    if (outside > 12) {
      bailout('boundary');
      return;
    }
    if (transition < 0) {
      if (horizontal(p.position, patrolPoints[wave - 1]) < 9) spawnWave();
      return;
    }
    const living = enemies.filter((e) => e.health > 0);
    if (!living.length) {
      transition += dt;
      if (transition > 0.9) {
        enemies = enemies.filter((e) => e.death > 0);
        if (mode === 'hunt' || wave >= 3) {
          finish('victory', 'cleared');
          return;
        }
        wave++;
        if (mode === 'patrol') {
          transition = -1;
          emit('waypoint', { wave });
        } else spawnWave();
      }
    }
    const center = { ...p.position, y: p.position.y + (p.crouched ? 0.75 : 1.15) };
    for (const e of enemies) {
      e.flash = Math.max(0, e.flash - dt);
      e.cooldown = Math.max(0, e.cooldown - dt);
      if (e.health <= 0) {
        e.death = Math.max(0, e.death - dt);
        continue;
      }
      const def = ENEMY_TYPES[e.type],
        dist = distance(e.position, center),
        planar = horizontal(e.position, center);
      const los = dist < 500 && traceWorld(e.position, center, 0.07) > 0.999;
      if (los && (dist < 110 || e.alert || center.y - e.feet.y > 8)) {
        e.memory = 7;
        e.alert = true;
        e.lastSeen = { ...p.position };
      } else e.memory = Math.max(0, e.memory - dt);
      if (e.state === 'stagger') {
        e.timer -= dt;
        if (e.timer <= 0) e.state = 'chase';
        continue;
      }
      if (e.state === 'telegraph') {
        e.timer -= dt;
        // Aim locks during the latter half: readable attacks can be dodged without immunity.
        if (e.timer > e.attack.windup * 0.4)
          e.attack.point = {
            ...center,
            x: center.x + (p.velocity?.x ?? 0) * 0.16,
            z: center.z + (p.velocity?.z ?? 0) * 0.16,
          };
        if (e.timer <= 0) {
          if (e.attack.ranged) fireEnemy(e, e.attack.antiAir);
          else if (
            distance(e.position, center) < def.reach + 0.45 &&
            traceWorld(e.position, center, 0.1) > 0.999
          ) {
            const parts = p.volumes?.length
                ? p.volumes.map((v) => v.id)
                : ['torso', 'rightArm', 'leftLeg', 'leftArm', 'rightLeg', 'head'],
              part = parts[(serial + wave) % parts.length];
            takeHit(def.damage, e.position, part, e.id);
          }
          e.state = 'recover';
          e.timer = 0.42;
          e.cooldown = def.cooldown;
          emit('enemyStrike', { id: e.id });
        }
        continue;
      }
      if (e.state === 'recover') {
        e.timer -= dt;
        if (e.timer <= 0) e.state = 'chase';
        continue;
      }
      if (!e.alert || e.memory <= 0) {
        e.alert = false;
        e.state = 'search';
        const angle = time * 0.18 + Number(e.id.slice(1));
        moveEnemy(e, point(e.home.x + Math.cos(angle) * 6, e.home.z + Math.sin(angle) * 6), dt, 1);
        continue;
      }
      e.state = 'chase';
      const antiAir = center.y - e.feet.y > def.height + 1.2,
        ranged = e.type === 'ranged' || antiAir || e.stuck > 2;
      if (los && e.cooldown <= 0 && dist < (ranged ? 500 : def.reach)) {
        const windup = def.windup + (ranged && e.type !== 'ranged' ? 0.4 : 0);
        e.state = 'telegraph';
        e.timer = windup;
        e.yaw = Math.atan2(e.position.x - center.x, e.position.z - center.z);
        e.attack = { point: { ...center }, ranged, antiAir, windup };
        emit('telegraph', { id: e.id, ranged });
        continue;
      }
      if (e.type === 'ranged' && los && planar < 19) {
        const away = point(
          e.feet.x + (e.feet.x - p.position.x) * 0.5,
          e.feet.z + (e.feet.z - p.position.z) * 0.5,
        );
        moveEnemy(e, away, dt, 1);
      } else if (!ranged || !los || dist > 65) moveEnemy(e, e.lastSeen, dt, def.reach * 0.7);
    }
    const volumes = p.volumes ?? [];
    for (let n = bullets.length - 1; n >= 0; n--) {
      const b = bullets[n];
      b.age += dt;
      b.life -= dt;
      if (b.homing && b.age < 12) {
        const d = distance(b.position, center) || 1,
          speed = 38,
          blend = 1 - Math.exp(-b.homing * dt);
        for (const axis of ['x', 'y', 'z'])
          b.velocity[axis] += (((center[axis] - b.position[axis]) / d) * speed - b.velocity[axis]) * blend;
      }
      const next = {
        x: b.position.x + b.velocity.x * dt,
        y: b.position.y + b.velocity.y * dt,
        z: b.position.z + b.velocity.z * dt,
      };
      let fraction = traceWorld(b.position, next, 0.065),
        part = null;
      for (const v of volumes) {
        const t = segmentSphere(b.position, next, v.position, v.radius + 0.075);
        if (t < fraction) {
          fraction = t;
          part = v.id;
        }
      }
      if (fraction < 1) {
        const impact = lerpPoint(b.position, next, fraction);
        if (part) takeHit(b.damage, b.position, part, b.enemyId, true);
        emit('enemyImpact', { position: impact });
        bullets.splice(n, 1);
      } else if (b.life <= 0) bullets.splice(n, 1);
      else b.position = next;
    }
    enemies = enemies.filter((e) => e.health > 0 || e.death > 0);
  }
  function snapshot() {
    return {
      phase,
      mode,
      difficulty,
      time,
      remaining: Math.max(0, DIFFICULTIES[difficulty].time - time),
      wave,
      waves: mode === 'hunt' ? 1 : 3,
      cleared,
      total,
      reason,
      shots,
      hits,
      damageTaken,
      outside,
      waypoint: mode === 'patrol' && transition < 0 ? { ...patrolPoints[wave - 1] } : null,
      enemies: enemies.map((e) => ({
        ...e,
        feet: { ...e.feet },
        position: { ...e.position },
        path: undefined,
        hitVolumes: targetVolumes(e),
      })),
      bullets: bullets.map((b) => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })),
      best: structuredClone(best),
      bailoutProgress: phase === 'bailout' ? 1 - transition / 1.7 : phase === 'defeat' ? 1 : 0,
    };
  }
  return {
    start,
    reset,
    update,
    hit,
    strike,
    stun,
    bailout,
    recordShot() {
      if (phase === 'active') shots++;
    },
    importRecords(value) {
      best = cleanBattleRecords(value);
      try {
        storage?.setItem('mikado-battle-records-v1', JSON.stringify(best));
      } catch {}
    },
    overlaps(x, z, y, height, radius = 0.28) {
      return (
        phase === 'active' &&
        enemies.some(
          (e) =>
            e.health > 0 &&
            y < e.feet.y + ENEMY_TYPES[e.type].height &&
            y + height > e.feet.y &&
            Math.hypot(x - e.feet.x, z - e.feet.z) < e.radius * 0.85 + radius,
        )
      );
    },
    get phase() {
      return phase;
    },
    get targets() {
      return enemies.filter((e) => e.health > 0).map((e) => ({ ...e, hitVolumes: targetVolumes(e) }));
    },
    get snapshot() {
      return snapshot();
    },
  };
}
