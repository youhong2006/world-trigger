export const ARMORY_KEY = 'mikado-armory-v1';
export const SHOOTING_TYPES = ['asteroid', 'viper', 'meteor'];
export const EQUIPPABLE = ['grasshopper', ...SHOOTING_TYPES];
export const FIRE_DEFAULTS = Object.freeze({
  count: 8,
  damage: 8,
  speed: 110,
  range: 220,
  spread: 0.35,
  mode: 'volley',
  delay: 0,
  interval: 0.09,
  aim: 'manual',
  pathId: '',
});
export const FIRE_RANGES = {
  damage: [2, 18],
  speed: [55, 180],
  range: [60, 400],
  spread: [0, 5],
  delay: [0, 2],
  interval: [0.04, 0.3],
};
export function normalizeFire(value = {}) {
  const out = { ...FIRE_DEFAULTS };
  if (!value || typeof value !== 'object') return out;
  for (const [key, [min, max]] of Object.entries(FIRE_RANGES))
    if (Number.isFinite(value[key])) out[key] = Math.min(max, Math.max(min, value[key]));
  if ([1, 8, 27].includes(value.count)) out.count = value.count;
  if (['volley', 'burst'].includes(value.mode)) out.mode = value.mode;
  if (['manual', 'assist'].includes(value.aim)) out.aim = value.aim;
  if (typeof value.pathId === 'string') out.pathId = value.pathId.slice(0, 50);
  return out;
}
export function shotCost(value) {
  const c = normalizeFire(value);
  return Math.ceil((2 + c.count * (0.45 + c.damage * 0.04) + c.speed / 200 + c.range / 800) * 10) / 10;
}
export function defaultProfile(id = 'kit-1', name = '標準射手') {
  return {
    id,
    name,
    main: ['asteroid', 'viper', 'meteor', null],
    sub: ['grasshopper', null, null, null],
    activeMain: 0,
    activeSub: 0,
    fireSide: 'main',
    weapons: Object.fromEntries(SHOOTING_TYPES.map((id) => [id, normalizeFire()])),
  };
}
export function normalizeArmory(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const seen = new Set();
  const profiles = (Array.isArray(value.profiles) ? value.profiles : [])
    .slice(0, 6)
    .filter((p) => p && typeof p === 'object')
    .map((p, i) => {
      let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : 'kit-' + (i + 1);
      while (seen.has(id)) id += 'x';
      seen.add(id);
      const out = defaultProfile(
        id,
        String(p.name ?? '配置 ' + (i + 1))
          .trim()
          .slice(0, 30) || '未命名配置',
      );
      for (const side of ['main', 'sub'])
        if (Array.isArray(p[side]))
          out[side] = Array.from({ length: 4 }, (_, n) =>
            EQUIPPABLE.includes(p[side][n]) ? p[side][n] : null,
          );
      for (const side of ['Main', 'Sub'])
        out['active' + side] = Number.isInteger(p['active' + side])
          ? Math.min(3, Math.max(0, p['active' + side]))
          : 0;
      out.fireSide = p.fireSide === 'sub' ? 'sub' : 'main';
      for (const type of SHOOTING_TYPES) out.weapons[type] = normalizeFire(p.weapons?.[type]);
      return out;
    });
  if (!profiles.length) profiles.push(defaultProfile());
  const activeId = profiles.some((p) => p.id === value.activeId) ? value.activeId : profiles[0].id;
  const best =
    value.best && typeof value.best === 'object'
      ? {
          score: Math.max(0, Math.min(100000, Number(value.best.score) || 0)),
          time: Math.max(0, Math.min(120, Number(value.best.time) || 0)),
          accuracy: Math.max(0, Math.min(1, Number(value.best.accuracy) || 0)),
        }
      : null;
  return { version: 1, activeId, profiles, best };
}
export function createArmory(storage) {
  let state;
  try {
    state = normalizeArmory(JSON.parse(storage.getItem(ARMORY_KEY) ?? '{}'));
  } catch {
    state = normalizeArmory();
  }
  const listeners = new Set();
  let saved = true;
  function persist(reason = 'configure') {
    try {
      storage.setItem(ARMORY_KEY, JSON.stringify(state));
      saved = true;
    } catch {
      saved = false;
    }
    for (const fn of listeners) fn(reason);
  }
  const current = () => state.profiles.find((p) => p.id === state.activeId);
  return {
    get snapshot() {
      return structuredClone({ ...state, saved });
    },
    get profile() {
      return structuredClone(current());
    },
    active(side) {
      const p = current();
      return p[side]?.[p[side === 'main' ? 'activeMain' : 'activeSub']] ?? null;
    },
    setSide(side) {
      if (!['main', 'sub'].includes(side)) return false;
      current().fireSide = side;
      persist('focus');
      return true;
    },
    selectSlot(side, index) {
      if (!['main', 'sub'].includes(side) || !Number.isInteger(index) || index < 0 || index > 3) return false;
      current()[side === 'main' ? 'activeMain' : 'activeSub'] = index;
      persist('slot');
      return true;
    },
    equip(side, index, id) {
      if (
        !['main', 'sub'].includes(side) ||
        index < 0 ||
        index > 3 ||
        !Number.isInteger(index) ||
        !(id === null || EQUIPPABLE.includes(id))
      )
        return false;
      current()[side][index] = id;
      persist('configure');
      return true;
    },
    configure(type, patch) {
      if (!SHOOTING_TYPES.includes(type)) return false;
      current().weapons[type] = normalizeFire({ ...current().weapons[type], ...patch });
      persist();
      return true;
    },
    rename(name) {
      current().name = String(name).trim().slice(0, 30) || '未命名配置';
      persist();
    },
    choose(id) {
      if (!state.profiles.some((p) => p.id === id)) return false;
      state.activeId = id;
      persist('profile');
      return true;
    },
    add() {
      if (state.profiles.length >= 6) return false;
      const copy = structuredClone(current());
      copy.id = 'kit-' + Date.now().toString(36);
      while (state.profiles.some((p) => p.id === copy.id)) copy.id += 'x';
      copy.name = '配置 ' + (state.profiles.length + 1);
      state.profiles.push(copy);
      state.activeId = copy.id;
      persist('profile');
      return true;
    },
    remove() {
      if (state.profiles.length <= 1) return false;
      state.profiles = state.profiles.filter((p) => p.id !== state.activeId);
      state.activeId = state.profiles[0].id;
      persist('profile');
      return true;
    },
    import(value) {
      state = normalizeArmory(value);
      persist('profile');
    },
    record(result) {
      if (!state.best || result.score > state.best.score) {
        state.best = { score: result.score, time: result.time, accuracy: result.accuracy };
        persist('record');
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
