export const SETTINGS_KEY = 'mikado-settings-v2';
export const ACTIONS = {
  forward: '向前',
  back: '向後',
  left: '向左',
  right: '向右',
  sprint: '衝刺',
  jump: '跳躍',
  crouch: '蹲下／站立',
  grasshopper: '蚱蜢（按住準備、放開釋放）',
  view: '切換視角',
  reset: '返回起點／重試挑戰',
  prepare: '生成立方體／收起',
  fire: '發射立方體彈組',
  split: '分割子彈',
  aim: '瞄準（按住）',
  menuEnter: '發射選單：進入下一層',
  menuBack: '發射選單：返回／關閉',
  swapSide: '切換射擊側',
  cycleTarget: '切換輔助目標',
  slot1: '主槽 1',
  slot2: '主槽 2',
  slot3: '主槽 3',
  slot4: '主槽 4',
  slot5: '副槽 1',
  slot6: '副槽 2',
  slot7: '副槽 3',
  slot8: '副槽 4',
};
export const DEFAULTS = Object.freeze({
  masterVolume: 0.7,
  ambientVolume: 0.25,
  effectsVolume: 0.65,
  muted: false,
  muteOnBlur: true,
  sensitivity: 1,
  aimSensitivity: 0.55,
  invertY: false,
  sprintToggle: false,
  crouchToggle: true,
  walkSpeed: 5,
  runSpeed: 14,
  jumpSpeed: 10.5,
  boostSpeed: 42,
  cameraMode: 'third',
  fov: 72,
  cameraDistance: 4.8,
  shoulder: 'right',
  cameraSmooth: 14,
  speedFov: true,
  reducedMotion: false,
  quality: 'medium',
  resolution: 1,
  shadows: true,
  detailDistance: 700,
  fpsLimit: 60,
  hudScale: 1,
  hudOpacity: 0.9,
  minimap: true,
  hints: true,
  showFps: false,
  crosshair: 'cross',
  glow: 0.7,
  bindings: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    jump: 'Space',
    crouch: 'KeyC',
    grasshopper: 'KeyQ',
    view: 'KeyV',
    reset: 'KeyR',
    prepare: 'KeyE',
    fire: 'Mouse0',
    split: 'Mouse2',
    aim: 'Mouse1',
    menuEnter: 'Mouse4',
    menuBack: 'Mouse3',
    swapSide: 'KeyF',
    cycleTarget: 'KeyT',
    slot1: 'Digit1',
    slot2: 'Digit2',
    slot3: 'Digit3',
    slot4: 'Digit4',
    slot5: 'Digit5',
    slot6: 'Digit6',
    slot7: 'Digit7',
    slot8: 'Digit8',
  },
});
export const RANGES = {
  masterVolume: [0, 1],
  ambientVolume: [0, 1],
  effectsVolume: [0, 1],
  sensitivity: [0.15, 3],
  aimSensitivity: [0.15, 1.5],
  walkSpeed: [2, 9],
  runSpeed: [6, 24],
  jumpSpeed: [6, 18],
  boostSpeed: [20, 65],
  fov: [55, 100],
  cameraDistance: [1.4, 9],
  cameraSmooth: [5, 25],
  resolution: [0.5, 1.5],
  detailDistance: [250, 1200],
  hudScale: [0.8, 1.3],
  hudOpacity: [0.35, 1],
  glow: [0, 1],
};
const enums = {
  cameraMode: ['first', 'third'],
  shoulder: ['left', 'right'],
  quality: ['low', 'medium', 'high', 'custom'],
  crosshair: ['cross', 'dot', 'none'],
  fpsLimit: [30, 60, 0],
};
export const RESERVED = new Set([
  'Escape',
  'Tab',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);
export function validBinding(code) {
  return (
    typeof code === 'string' &&
    /^(Mouse[0-4]|Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Enter|Backspace|Bracket(Left|Right))$/.test(
      code,
    ) &&
    !RESERVED.has(code)
  );
}
export function normalizeSettings(value = {}) {
  const out = structuredClone(DEFAULTS);
  if (!value || typeof value !== 'object') return out;
  for (const [key, range] of Object.entries(RANGES))
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      out[key] = Math.min(range[1], Math.max(range[0], value[key]));
  for (const [key, allowed] of Object.entries(enums)) if (allowed.includes(value[key])) out[key] = value[key];
  for (const key of Object.keys(DEFAULTS))
    if (typeof DEFAULTS[key] === 'boolean' && typeof value[key] === 'boolean') out[key] = value[key];
  out.runSpeed = Math.max(out.walkSpeed, out.runSpeed);
  // Reserve valid imported bindings first, then fill missing actions without collisions.
  const bindings = { ...value.bindings };
  // Older saves used right click to aim; migrate it to middle click only when split is new.
  if (bindings.split === undefined && bindings.aim === 'Mouse2') {
    bindings.aim = 'Mouse1';
    bindings.split = 'Mouse2';
  }
  const used = new Set();
  out.bindings = {};
  for (const action of Object.keys(ACTIONS)) {
    const code = bindings[action];
    if (validBinding(code) && !used.has(code)) {
      out.bindings[action] = code;
      used.add(code);
    }
  }
  const candidates = [
    ...Object.values(DEFAULTS.bindings),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => 'Key' + c),
    ...'0123456789'.split('').map((c) => 'Digit' + c),
  ];
  for (const action of Object.keys(ACTIONS))
    if (!out.bindings[action]) {
      const preferred = DEFAULTS.bindings[action];
      const code = !used.has(preferred) ? preferred : candidates.find((key) => !used.has(key));
      out.bindings[action] = code;
      used.add(code);
    }
  return out;
}
export function rebind(settings, action, code) {
  if (!(action in ACTIONS) || !validBinding(code)) return null;
  const out = normalizeSettings(settings),
    previous = out.bindings[action];
  const conflict = Object.keys(ACTIONS).find((key) => key !== action && out.bindings[key] === code);
  if (conflict) out.bindings[conflict] = previous;
  out.bindings[action] = code;
  return out;
}
export function keyLabel(code) {
  return (
    {
      Mouse0: '滑鼠左鍵',
      Mouse1: '滑鼠中鍵',
      Mouse2: '滑鼠右鍵',
      Mouse3: '返回側鍵',
      Mouse4: '前進側鍵',
      Space: 'Space',
      ShiftLeft: 'L Shift',
      ShiftRight: 'R Shift',
      ControlLeft: 'L Ctrl',
      ControlRight: 'R Ctrl',
      AltLeft: 'L Alt',
      AltRight: 'R Alt',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      BracketLeft: '[',
      BracketRight: ']',
    }[code] ?? code.replace(/^(Key|Digit)/, '')
  );
}
export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}'));
  } catch {
    return normalizeSettings();
  }
}
export function saveSettings(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
export function isPressed(keys, settings, action) {
  return !!keys[settings.bindings[action]];
}
