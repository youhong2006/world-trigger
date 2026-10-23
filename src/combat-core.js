// Shared single-player resource and action rules. Skills consume through this API.
export const TRIGGERS = Object.freeze({
  grasshopper: {
    name: '蚱蜢',
    english: 'GRASSHOPPER',
    cost: 4,
    available: true,
    kind: '機動',
    description: '地面放置，踩踏彈射。空中釋放立即啟動，無方向輸入則向上。',
  },
  asteroid: {
    name: '小行星彈',
    english: 'ASTEROID',
    cost: 9,
    available: true,
    kind: '射擊',
    description: '普通直射三離子彈，可調整分割數量、威力、速度與射程。',
  },
  hound: {
    name: '追蹤彈',
    english: 'HOUND',
    available: false,
    kind: '射擊',
    description: '追蹤移動目標。尚未加入實戰。',
  },
  viper: {
    name: '毒蛇',
    english: 'VIPER',
    cost: 9,
    available: true,
    kind: '射擊',
    description: '保留發射選項，目前使用小行星直射規則；特殊路線稍後調整。',
  },
  meteor: {
    name: '美特拉',
    english: 'METEOR',
    cost: 9,
    available: true,
    kind: '射擊',
    description: '保留發射選項，目前使用小行星直射規則；爆炸效果稍後調整。',
  },
  blade: {
    name: '刀劍',
    english: 'BLADE',
    available: false,
    kind: '近戰',
    description: '連擊、格擋與招架規劃中。',
  },
  shield: { name: '盾', english: 'SHIELD', available: false, kind: '防禦', description: '能量防禦規劃中。' },
});
export function createCombatCore({ maximum = 100, recovery = 1.5, recoveryDelay = 1.8 } = {}) {
  maximum = Number.isFinite(maximum) ? Math.max(1, maximum) : 100;
  let remaining = maximum,
    state = 'ready',
    charging = null,
    time = 0,
    lastSpend = -Infinity,
    leakage = 0,
    sequence = 0;
  const listeners = new Set();
  function emit(type, detail = {}) {
    const event = { type, ...detail, sequence: ++sequence, time };
    for (const listener of listeners) listener(event);
  }
  function canUse(id, cost = TRIGGERS[id]?.cost, parallel = false) {
    const skill = TRIGGERS[id];
    return (
      !!skill?.available &&
      state !== 'exhausted' &&
      state !== 'paused' &&
      (!charging || charging === id || parallel) &&
      Number.isFinite(cost) &&
      cost > 0 &&
      remaining >= cost
    );
  }
  function begin(id) {
    if (!canUse(id) || charging) return false;
    charging = id;
    state = 'charging';
    emit('prepare', { skill: id });
    return true;
  }
  function cancel() {
    if (charging) emit('cancel', { skill: charging });
    charging = null;
    if (state === 'charging') state = 'ready';
  }
  function consume(id, cost = TRIGGERS[id]?.cost, { parallel = false } = {}) {
    if (!canUse(id, cost, parallel)) return false;
    remaining = Math.max(0, remaining - cost);
    lastSpend = time;
    if (!parallel || charging === id) charging = null;
    state = remaining <= 0 ? 'exhausted' : charging ? 'charging' : 'ready';
    emit('consume', { skill: id, cost });
    if (state === 'exhausted') emit('exhausted');
    return true;
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || state === 'paused' || state === 'exhausted') return;
    time += dt;
    const previous = remaining;
    remaining = Math.max(
      0,
      Math.min(
        maximum,
        remaining + (time - lastSpend >= recoveryDelay && !charging ? recovery : 0) * dt - leakage * dt,
      ),
    );
    if (previous > 0 && remaining <= 0) {
      cancel();
      state = 'exhausted';
      emit('exhausted');
    }
  }
  function damage(amount) {
    if (state === 'paused' || state === 'exhausted' || !Number.isFinite(amount) || amount <= 0) return;
    remaining = Math.max(0, remaining - amount);
    lastSpend = time;
    emit('damage', { amount });
    if (remaining <= 0) {
      cancel();
      state = 'exhausted';
      emit('exhausted');
    }
  }
  return {
    begin,
    cancel,
    consume,
    canUse,
    update,
    damage,
    pause(value) {
      cancel();
      if (state !== 'exhausted') state = value ? 'paused' : 'ready';
    },
    setLeakage(value) {
      leakage = Number.isFinite(value) ? Math.max(0, value) : 0;
    },
    reset() {
      remaining = maximum;
      state = 'ready';
      charging = null;
      leakage = 0;
      lastSpend = -Infinity;
      emit('reset');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get snapshot() {
      return {
        maximum,
        remaining,
        state,
        charging,
        leakage,
        recovery: time - lastSpend >= recoveryDelay && !charging && state === 'ready' ? recovery : 0,
        sequence,
      };
    },
  };
}
