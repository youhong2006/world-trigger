import * as THREE from 'three';
import './style.css';
import { ACTIONS, loadSettings, isPressed, keyLabel } from './game-settings.js';
import { createCombatCore } from './combat-core.js';
import { createGrasshopper } from './grasshopper.js';
import { createGrasshopperVisuals } from './grasshopper-visuals.js';
import { createGameAudio } from './game-audio.js';
import { createGameUI } from './game-ui.js';
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage unavailable');
    },
  };
}

import { createHeadquarters } from './headquarters.js';
import { createCity } from './city.js';
import { createSky, terrainRGB } from './landscape.js';
import { PERSON, ARCHITECTURE } from './building-metrics.js';
import { createCharacterMotor } from './character-motor.js';
import { createPlayerCamera } from './player-camera.js';
import { createPlayerAvatar } from './player-avatar.js';
import { CITY, BASE, riverZ, groundHeight, inRiver, createCollisionIndex } from './city-layout.js';

const host = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#72b5e4');
scene.fog = new THREE.Fog('#accdd9', 7200, 21000);
const overviewPosition = new THREE.Vector3(2200, 3800, 6500);
const overviewLook = new THREE.Vector3(0, 150, -150);
const camera = new THREE.PerspectiveCamera(51, innerWidth / innerHeight, 5, 30000);
camera.position.copy(overviewPosition);
camera.lookAt(overviewLook);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
  });
} catch (error) {
  host.innerHTML = '<p style="padding:100px">此裝置無法啟動 WebGL。請啟用瀏覽器硬體加速後重新載入。</p>';
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// All geometry and the sun's direction are static: render the shadow map once.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '三維場景，使用鍵盤移動與滑鼠環顧');
const ambient = new THREE.HemisphereLight('#e0efff', '#6c8651', 1.9);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff4dd', 2.5);
sun.position.set(-1600, 2500, 1600);
sun.target.position.set(0, 300, -150);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1050, right: 1050, top: 1050, bottom: -1050, near: 1, far: 6500 });
sun.shadow.normalBias = 0.15;
scene.add(sun, sun.target);
const materials = new Map();
function mat(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  return materials.get(color);
}
const collision = createCollisionIndex();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function box(x, y, z, w, h, d, color, collide = false, parent = scene) {
  const mesh = new THREE.Mesh(unitBox, mat(color));
  mesh.position.set(x, y + h / 2, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (collide) collision.add({ x, z, w, d, y, h });
  return mesh;
}
function cylinder(x, y, z, r, h, color, segments = 8, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mat(color));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const sky = createSky(scene);
const city = createCity({ scene, box, collision });

// Keep the reference model intact, scaled and recentered in the new city plan.
const baseGroup = new THREE.Group();
const baseScale = BASE.scale;
const baseOffset = new THREE.Vector3(-23 * baseScale, 0, -150 + 117 * baseScale);
baseGroup.scale.setScalar(baseScale);
baseGroup.position.copy(baseOffset);
scene.add(baseGroup);
const headquarters = createHeadquarters({
  scene: baseGroup,
  box(x, y, z, w, h, d, color, collide = false) {
    const mesh = box(x, y, z, w, h, d, color, false, baseGroup);
    if (collide)
      collision.add({
        x: x * baseScale + baseOffset.x,
        z: z * baseScale + baseOffset.z,
        w: w * baseScale,
        d: d * baseScale,
        y: y * baseScale,
        h: h * baseScale,
      });
    return mesh;
  },
  cylinder: (x, y, z, r, h, color, n) => cylinder(x, y, z, r, h, color, n, baseGroup),
});
const residentialZ = Math.round((riverZ(-1008) + 200 - 72) / 144) * 144 + 72;
const destinations = [
  {
    name: '住宅街',
    pos: new THREE.Vector3(-1070, groundHeight(-1070, residentialZ) + PERSON.eyeHeight, residentialZ),
    yaw: Math.PI / 2,
    previewPosition: new THREE.Vector3(-950, 42, riverZ(-1008) + 280),
    previewLook: new THREE.Vector3(-1070, 7, riverZ(-1008) + 170),
  },
  {
    name: 'BORDER 本部',
    pos: new THREE.Vector3(0, groundHeight(0, 460) + PERSON.eyeHeight, 460),
    yaw: 0,
    pitch: 0.65,
    previewPosition: new THREE.Vector3(1350, 2800, 1350),
    previewLook: new THREE.Vector3(0, 300, -150),
  },
  {
    name: '河川敷',
    pos: new THREE.Vector3(0, groundHeight(0, riverZ(0) - 105) + PERSON.eyeHeight, riverZ(0) - 105),
    yaw: Math.PI,
    previewPosition: new THREE.Vector3(320, 230, riverZ(0) + 430),
    previewLook: new THREE.Vector3(0, 0, riverZ(0)),
  },
  {
    name: '山丘公園',
    pos: new THREE.Vector3(
      CITY.lookout.x,
      groundHeight(CITY.lookout.x, CITY.lookout.z) + PERSON.eyeHeight,
      CITY.lookout.z,
    ),
    yaw: -1.88,
    previewPosition: new THREE.Vector3(-2520, 380, 650),
    previewLook: new THREE.Vector3(-2000, 30, 120),
  },
];
const motor = createCharacterMotor({ groundHeight, collision });
const playerView = createPlayerCamera({
  camera,
  collision,
  groundHeight: (x, z) => Math.max(groundHeight(x, z), inRiver(x, z) ? 0.4 : -Infinity),
});
const avatar = createPlayerAvatar(scene);
const combat = createCombatCore();
const audio = createGameAudio();
const effects = createGrasshopperVisuals(scene);
let settings = loadSettings(storage);
let exploring = false,
  paused = false,
  yaw = 0,
  pitch = 0,
  keys = {},
  target = null,
  day = true,
  current = 0;
let crouchRequested = false,
  jumpQueued = false,
  sprintLatched = false,
  safeSpawn = null,
  pointerIntent = 'overview',
  dragging = false,
  lastX = 0,
  lastY = 0;
let renderRequested = true,
  lastHud = '',
  toastTimer,
  ui;
const walking = document.querySelector('#walking'),
  toast = document.querySelector('#toast'),
  clock = new THREE.Clock();
const movementLabels = {
  idle: '站立',
  walk: '移動',
  run: '衝刺',
  jump: '上升',
  fall: '下降',
  land: '落地',
  crouch: '蹲下',
  'crouch-walk': '蹲走',
};
function notify(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
const grasshopper = createGrasshopper({
  motor,
  combat,
  collision,
  groundHeight,
  onEvent(type, detail) {
    effects.event(type, detail);
    if (type === 'launch' || type === 'place') audio.tone(type);
    if (type === 'launch') crouchRequested = false;
    if (type === 'blocked') notify('前方沒有足夠空間，換個位置放置蚱蜢');
  },
});
function viewState() {
  return { position: motor.position, eyeHeight: motor.eyeHeight, yaw, pitch, speed: motor.speed };
}
function actionPressed(action) {
  if (isPressed(keys, settings, action)) return true;
  const alias = { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[action];
  if (alias && !Object.values(settings.bindings).includes(alias)) return !!keys[alias];
  return (
    action === 'sprint' &&
    settings.bindings.sprint === 'ShiftLeft' &&
    !Object.values(settings.bindings).includes('ShiftRight') &&
    !!keys.ShiftRight
  );
}
function moveInput() {
  return {
    forward: Number(actionPressed('forward')) - Number(actionPressed('back')),
    strafe: Number(actionPressed('right')) - Number(actionPressed('left')),
    sprint: settings.sprintToggle ? sprintLatched : actionPressed('sprint'),
    jump: actionPressed('jump'),
    jumpPressed: jumpQueued,
    crouch: crouchRequested,
  };
}
function clearInput() {
  keys = {};
  jumpQueued = false;
  sprintLatched = false;
  dragging = false;
  grasshopper.cancel();
  if (!settings.crouchToggle) crouchRequested = false;
}
function syncPlayerHud(force = false) {
  const core = combat.snapshot,
    gh = grasshopper.snapshot;
  const signature = `${playerView.mode}/${motor.crouched}/${motor.animation}/${core.remaining.toFixed(1)}/${core.state}/${motor.speed.toFixed(1)}/${Math.round(motor.position.y)}/${gh.pads.length}/${core.recovery}/${JSON.stringify(settings.bindings)}`;
  if (!force && signature === lastHud) return;
  lastHud = signature;
  document.body.classList.toggle('third-person', playerView.mode === 'third');
  const view = document.querySelector('#camera-view');
  view.textContent = `${keyLabel(settings.bindings.view)} · ${playerView.mode === 'third' ? '第三人稱' : '第一人稱'}`;
  view.setAttribute('aria-pressed', String(playerView.mode === 'third'));
  const crouch = document.querySelector('#crouch-toggle');
  crouch.textContent = `${keyLabel(settings.bindings.crouch)} · ${motor.crouched ? '站起' : '蹲下'}`;
  crouch.setAttribute('aria-pressed', String(motor.crouched));
  document.querySelector('#player-reset').textContent = `${keyLabel(settings.bindings.reset)} · 返回起點`;
  document.querySelector('#movement-state').textContent = gh.charging
    ? '準備蚱蜢'
    : motor.state.boosted
      ? '彈射'
      : movementLabels[motor.animation];
  document.querySelector('#speed-value').textContent = motor.speed.toFixed(1);
  document.querySelector('#height-value').textContent = motor.grounded
    ? '已接地'
    : `離地 ${Math.max(0, motor.position.y - groundHeight(motor.position.x, motor.position.z)).toFixed(0)} m`;
  document.querySelector('#trion-value').textContent = core.remaining.toFixed(1);
  document.querySelector('#trion-bar').value = core.remaining;
  document.querySelector('#system-state').textContent = {
    ready: '系統就緒',
    charging: '技能準備中',
    paused: '已暫停',
    exhausted: '緊急脫離',
  }[core.state];
  document.querySelector('#trion-rate').textContent =
    core.remaining >= core.maximum
      ? '儲量充足'
      : core.state === 'exhausted'
        ? '需要重整'
        : core.recovery > 0
          ? `+${core.recovery.toFixed(1)}/s`
          : '恢復等待中';
  document.querySelector('.trion-card').classList.toggle('low', core.remaining < 20);
  document.querySelector('#pad-count').textContent =
    `跳板 ${String(gh.pads.filter((p) => !p.used).length).padStart(2, '0')}`;
  document.querySelector('#cast-key').textContent = keyLabel(settings.bindings.grasshopper);
  document.querySelector('#cast-status').textContent = gh.charging
    ? '放開即可釋放'
    : core.state === 'exhausted'
      ? '三離子耗盡'
      : `按住準備 · 放開釋放`;
  document.querySelector('.ability-card').classList.toggle('charging', gh.charging);
  document.querySelector('#exhausted-notice').hidden = core.state !== 'exhausted';
  document.querySelector('#walk-hint').textContent =
    `${keyLabel(settings.bindings.forward)}${keyLabel(settings.bindings.left)}${keyLabel(settings.bindings.back)}${keyLabel(settings.bindings.right)} 移動 · ${keyLabel(settings.bindings.sprint)} 衝刺 · ${keyLabel(settings.bindings.jump)} 跳躍 · Esc 選單`;
}
function applySettings(value) {
  const previous = settings;
  settings = value;
  motor.configure({ walkSpeed: value.walkSpeed, sprintSpeed: value.runSpeed, jumpSpeed: value.jumpSpeed });
  playerView.configure(value);
  if (playerView.mode !== value.cameraMode) playerView.setMode(value.cameraMode);
  grasshopper.configure(value.boostSpeed);
  audio.configure(value);
  effects.configure(value);
  const resolution = Math.min(2, (devicePixelRatio || 1) * value.resolution);
  if (renderer.getPixelRatio() !== resolution) renderer.setPixelRatio(resolution);
  if (renderer.shadowMap.enabled !== value.shadows) {
    renderer.shadowMap.enabled = value.shadows;
    renderer.shadowMap.needsUpdate = true;
  }
  document.documentElement.style.setProperty('--hud-scale', value.hudScale);
  document.documentElement.style.setProperty('--hud-opacity', value.hudOpacity);
  for (const [name, flag] of [
    ['hide-map', !value.minimap],
    ['hide-hints', !value.hints],
    ['reduced-motion', value.reducedMotion],
    ['crosshair-dot', value.crosshair === 'dot'],
    ['crosshair-none', value.crosshair === 'none'],
  ])
    document.body.classList.toggle(name, flag);
  document.querySelector('#fps-display').hidden = !value.showFps;
  document.querySelector('#sound').innerHTML = value.muted
    ? '♪ <span>已靜音</span>'
    : '♫ <span>聲音開啟</span>';
  document.querySelector('#sound').setAttribute('aria-pressed', String(value.muted));
  if (
    previous &&
    ['masterVolume', 'ambientVolume', 'effectsVolume', 'muted'].some((k) => previous[k] !== value[k])
  )
    audio.start();
  renderRequested = true;
  syncPlayerHud(true);
}
function lockPointer() {
  if (paused || !exploring) return;
  pointerIntent = 'game';
  if (document.pointerLockElement === renderer.domElement) return;
  try {
    renderer.domElement.requestPointerLock()?.catch(() => {
      pointerIntent = 'cursor';
      notify('按住場景拖曳視角，鍵盤仍可移動');
    });
  } catch {
    pointerIntent = 'cursor';
  }
}
function pause() {
  paused = true;
  pointerIntent = 'menu';
  clearInput();
  combat.pause(true);
  audio.pause(true);
  document.body.classList.add('paused');
  if (document.pointerLockElement) document.exitPointerLock?.();
  syncPlayerHud(true);
}
function resume() {
  paused = false;
  pointerIntent = exploring ? 'cursor' : 'overview';
  clearInput();
  combat.pause(false);
  audio.pause(false);
  document.body.classList.remove('paused');
  clock.getDelta();
  renderRequested = true;
  syncPlayerHud(true);
}
function enter() {
  if (ui.isOpen) ui.close();
  exploring = true;
  paused = false;
  clearInput();
  lastHud = '';
  document.body.classList.add('exploring');
  document.body.classList.remove('overview');
  walking.hidden = false;
  const destination = destinations[current];
  yaw = destination.yaw;
  pitch = destination.pitch ?? 0;
  target = null;
  safeSpawn = {
    point: { x: destination.pos.x, y: destination.pos.y - PERSON.eyeHeight, z: destination.pos.z },
    yaw,
    pitch,
  };
  motor.teleport(safeSpawn.point, yaw);
  combat.reset();
  grasshopper.reset();
  playerView.reset();
  playerView.update(0, viewState());
  avatar.update(0, motor.state);
  avatar.setVisible(playerView.avatarVisible);
  syncPlayerHud(true);
  audio.start();
  audio.pause(false);
  renderer.domElement.focus({ preventScroll: true });
  lockPointer();
}
function leave() {
  exploring = false;
  pointerIntent = 'overview';
  clearInput();
  grasshopper.reset();
  combat.reset();
  effects.hide();
  avatar.setVisible(false);
  document.body.classList.remove('exploring', 'third-person');
  document.body.classList.add('overview');
  walking.hidden = true;
  camera.fov = 51;
  camera.near = 5;
  camera.updateProjectionMatrix();
  if (document.pointerLockElement) document.exitPointerLock?.();
  target = { pos: overviewPosition.clone(), look: overviewLook.clone() };
  renderRequested = true;
}
function respawn() {
  if (!exploring || !safeSpawn) {
    notify('開始演習後可返回起點');
    return;
  }
  clearInput();
  crouchRequested = false;
  yaw = safeSpawn.yaw;
  pitch = safeSpawn.pitch;
  motor.teleport(safeSpawn.point, yaw);
  combat.reset();
  if (paused) combat.pause(true);
  grasshopper.reset();
  playerView.reset();
  playerView.update(0, viewState());
  avatar.update(0, motor.state);
  avatar.setVisible(playerView.avatarVisible);
  syncPlayerHud(true);
  renderRequested = true;
  notify('已返回起點，三離子與戰鬥體已重整');
}
function toggleView() {
  if (!exploring || paused) return;
  const mode = playerView.toggle();
  ui.update({ cameraMode: mode });
  playerView.update(0, viewState());
  avatar.setVisible(playerView.avatarVisible);
  syncPlayerHud(true);
}
function toggleCrouch() {
  if (exploring && !paused) crouchRequested = motor.crouched ? false : !crouchRequested;
}
function beginCast() {
  if (!exploring || paused || combat.snapshot.state === 'exhausted') return;
  if (!grasshopper.begin())
    notify(combat.snapshot.remaining < 4 ? '三離子不足，稍待恢復或返回起點' : '技能尚在準備，稍後再試');
}
function releaseCast() {
  if (!exploring || paused) return;
  grasshopper.release(moveInput(), yaw);
  syncPlayerHud(true);
}
ui = createGameUI({
  settings,
  storage,
  onSettings: applySettings,
  onPause: pause,
  onResume: resume,
  onLeave: leave,
  onReset: respawn,
  onPreviewAudio: () => audio.preview(),
  notify,
});
applySettings(settings);
document.querySelector('#enter').onclick = enter;
document.querySelector('#camera-view').onclick = toggleView;
document.querySelector('#crouch-toggle').onclick = toggleCrouch;
document.querySelector('#player-reset').onclick = respawn;
document.querySelector('#recover-player').onclick = respawn;
document.querySelector('#menu-open').onclick = () => ui.open('pause');
document.querySelector('#settings-open').onclick = () => ui.open('settings');
document.querySelector('#help').onclick = () => ui.open('guide');
const castButton = document.querySelector('#cast-button');
castButton.onpointerdown = (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  castButton.setPointerCapture(e.pointerId);
  beginCast();
};
castButton.onpointerup = (e) => {
  e.preventDefault();
  releaseCast();
};
castButton.onpointercancel = () => grasshopper.cancel();
castButton.onkeydown = (e) => {
  if (['Enter', 'Space'].includes(e.code) && !e.repeat) {
    e.preventDefault();
    e.stopPropagation();
    beginCast();
  }
};
castButton.onkeyup = (e) => {
  if (['Enter', 'Space'].includes(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    releaseCast();
  }
};
combat.subscribe((event) => {
  if (event.type === 'exhausted') {
    pointerIntent = 'cursor';
    clearInput();
    if (document.pointerLockElement) document.exitPointerLock?.();
    notify('三離子耗盡，請返回起點重整');
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement && pointerIntent !== 'game') {
    document.exitPointerLock?.();
    return;
  }
  if (!document.pointerLockElement && exploring && pointerIntent === 'game' && !paused) {
    clearInput();
    ui.open('pause');
  }
});
document.querySelectorAll('.place').forEach(
  (button) =>
    (button.onclick = () => {
      if (exploring) leave();
      current = Number(button.dataset.place);
      document.querySelectorAll('.place').forEach((p) => p.classList.toggle('active', p === button));
      document.body.classList.remove('overview');
      const destination = destinations[current];
      target = { pos: destination.previewPosition.clone(), look: destination.previewLook.clone() };
      notify('已選擇 ' + destination.name + '，點擊開始演習進入場景');
      document.querySelector('#location').textContent = destination.name;
    }),
);
document.querySelector('#reset').onclick = () => {
  if (exploring) {
    respawn();
    return;
  }
  current = 0;
  document.body.classList.add('overview');
  target = { pos: overviewPosition.clone(), look: overviewLook.clone() };
  document.querySelectorAll('.place').forEach((p, i) => p.classList.toggle('active', i === 0));
  document.querySelector('#location').textContent = '三門市全域';
};
document.querySelector('#overview').onclick = () => {
  if (exploring) leave();
  document.body.classList.add('overview');
  target = { pos: overviewPosition.clone(), look: overviewLook.clone() };
  document.querySelector('#location').textContent = '三門市全域';
};
document.querySelector('#day').onclick = () => {
  day = !day;
  sky.setDay(day);
  scene.fog.color.set(day ? '#accdd9' : '#233c50');
  ambient.intensity = day ? 1.9 : 0.7;
  sun.intensity = day ? 2.5 : 0.3;
  city.clouds.material.opacity = day ? 0.86 : 0.2;
  sun.color.set(day ? '#ffeed1' : '#b8d5fc');
  renderer.shadowMap.needsUpdate = true;
  renderRequested = true;
  document.querySelector('#day').innerHTML = day ? '☀ <span>日間</span>' : '☾ <span>夜間</span>';
};
document.querySelector('#sound').onclick = () => {
  ui.update({ muted: !settings.muted });
  audio.start();
};
window.addEventListener('keydown', (event) => {
  if (event.code === 'F2' && !event.repeat) {
    event.preventDefault();
    if (ui.isOpen) ui.close();
    else ui.open('settings');
    return;
  }
  if (ui.isOpen || paused) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    ui.open('pause');
    return;
  }
  if (event.code === 'Tab') {
    if (exploring && (document.pointerLockElement || pointerIntent === 'game')) {
      event.preventDefault();
      pointerIntent = 'cursor';
      clearInput();
      if (document.pointerLockElement) document.exitPointerLock?.();
      notify('游標已釋放；點擊場景繼續環顧');
    }
    return;
  }
  if (['Space', 'Enter'].includes(event.code) && event.target?.closest?.('button,a,input,select,textarea'))
    return;
  let action = Object.keys(ACTIONS).find((id) => settings.bindings[id] === event.code);
  if (
    !action &&
    event.code === 'ShiftRight' &&
    settings.bindings.sprint === 'ShiftLeft' &&
    !Object.values(settings.bindings).includes('ShiftRight')
  )
    action = 'sprint';
  if (exploring && (action || event.code.startsWith('Arrow'))) event.preventDefault();
  keys[event.code] = true;
  if (!exploring || event.repeat) return;
  if (action === 'jump') jumpQueued = true;
  if (action === 'sprint' && settings.sprintToggle) sprintLatched = !sprintLatched;
  if (action === 'crouch') {
    if (settings.crouchToggle) toggleCrouch();
    else crouchRequested = true;
  }
  if (action === 'view') toggleView();
  if (action === 'reset') respawn();
  if (action === 'grasshopper') beginCast();
});
window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
  if (event.code === settings.bindings.crouch && !settings.crouchToggle) crouchRequested = false;
  if (event.code === settings.bindings.grasshopper && !paused && !ui.isOpen) releaseCast();
});
window.addEventListener('blur', () => {
  audio.focus(false);
  clearInput();
  if (exploring && !ui.isOpen) ui.open('pause');
});
window.addEventListener('focus', () => audio.focus(true));
document.addEventListener('visibilitychange', () => {
  audio.focus(!document.hidden);
  if (document.hidden) {
    clearInput();
    if (exploring && !ui.isOpen) ui.open('pause');
  }
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (paused || ui.isOpen) return;
  if (exploring || document.body.classList.contains('overview')) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (document.pointerLockElement !== renderer.domElement) {
      if (exploring && event.pointerType === 'mouse') lockPointer();
      else renderer.domElement.setPointerCapture(event.pointerId);
    }
  }
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('pointermove', (event) => {
  if (paused || ui.isOpen) return;
  if (!exploring) {
    if (dragging && document.body.classList.contains('overview')) {
      target = null;
      const offset = camera.position.clone().sub(overviewLook),
        sphere = new THREE.Spherical().setFromVector3(offset);
      sphere.theta -= (event.clientX - lastX) * 0.003;
      sphere.phi = THREE.MathUtils.clamp(sphere.phi + (event.clientY - lastY) * 0.002, 0.45, 1.4);
      camera.position.copy(overviewLook).add(new THREE.Vector3().setFromSpherical(sphere));
      camera.lookAt(overviewLook);
      lastX = event.clientX;
      lastY = event.clientY;
    }
    return;
  }
  if (document.pointerLockElement === renderer.domElement || dragging) {
    const locked = document.pointerLockElement === renderer.domElement,
      scale = 0.002 * settings.sensitivity;
    yaw -= (locked ? event.movementX : event.clientX - lastX) * scale;
    pitch = THREE.MathUtils.clamp(
      pitch - (locked ? event.movementY : event.clientY - lastY) * scale * (settings.invertY ? -1 : 1),
      -1.35,
      1.35,
    );
    lastX = event.clientX;
    lastY = event.clientY;
  }
});
renderer.domElement.addEventListener(
  'wheel',
  (event) => {
    if (paused || ui.isOpen) return;
    if (exploring) {
      event.preventDefault();
      const distance = playerView.zoom(event.deltaY);
      ui.update({ cameraDistance: distance });
      return;
    }
    if (!document.body.classList.contains('overview')) return;
    event.preventDefault();
    target = null;
    const offset = camera.position.clone().sub(overviewLook);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(event.deltaY * 0.0007), 3000, 14000));
    camera.position.copy(overviewLook).add(offset);
    camera.lookAt(overviewLook);
  },
  { passive: false },
);

const mc = document.querySelector('#minimap'),
  ctx = mc.getContext('2d');
const mapBackground = document.createElement('canvas');
mapBackground.width = 360;
mapBackground.height = 260;
const mapCtx = mapBackground.getContext('2d');
const mapHalfX = 4400,
  mapHalfZ = 4100;
const mapPoint = (x, z) => [180 + (x / mapHalfX) * 180, 130 + (z / mapHalfZ) * 130];
const raster = mapCtx.createImageData(360, 260);
for (let py = 0; py < 260; py++)
  for (let px = 0; px < 360; px++) {
    const rgb = terrainRGB(((px - 180) / 180) * mapHalfX, ((py - 130) / 130) * mapHalfZ),
      i = (py * 360 + px) * 4;
    raster.data[i] = rgb[0];
    raster.data[i + 1] = rgb[1];
    raster.data[i + 2] = rgb[2];
    raster.data[i + 3] = 255;
  }
mapCtx.putImageData(raster, 0, 0);
mapCtx.fillStyle = '#e4e4db';
for (const lot of city.lots) {
  const [x, z] = mapPoint(lot.x, lot.z);
  mapCtx.fillRect(x, z, Math.max(0.7, (lot.w / mapHalfX) * 180), Math.max(0.7, (lot.d / mapHalfZ) * 130));
}
mapCtx.strokeStyle = '#4385a0';
mapCtx.lineWidth = (CITY.riverWidth / mapHalfZ) * 130;
mapCtx.beginPath();
for (let x = -mapHalfX; x <= mapHalfX; x += 20) {
  const [px, pz] = mapPoint(x, riverZ(x));
  if (x === -mapHalfX) mapCtx.moveTo(px, pz);
  else mapCtx.lineTo(px, pz);
}
mapCtx.stroke();
for (const x of CITY.bridges) {
  const [px, pz] = mapPoint(x, riverZ(x));
  mapCtx.fillStyle = '#d7d6c3';
  mapCtx.fillRect(px - 0.7, pz - 3, 0.9, 6);
}
const [baseX, baseZ] = mapPoint(BASE.x, BASE.z);
const [campusLeft, campusTop] = mapPoint(CITY.campus.minX, CITY.campus.minZ);
mapCtx.fillStyle = '#c3b48b';
mapCtx.fillRect(
  campusLeft,
  campusTop,
  ((CITY.campus.maxX - CITY.campus.minX) / mapHalfX) * 180,
  ((CITY.campus.maxZ - CITY.campus.minZ) / mapHalfZ) * 130,
);
const mapBaseWidth = ((BASE.width * baseScale) / mapHalfX) * 180,
  mapBaseDepth = ((BASE.depth * baseScale) / mapHalfZ) * 130;
mapCtx.fillStyle = '#8d9cb2';
mapCtx.fillRect(baseX - mapBaseWidth / 2, baseZ - mapBaseDepth / 2, mapBaseWidth, mapBaseDepth);
mapCtx.fillStyle = '#b9c4d6';
mapCtx.fillRect(
  baseX - mapBaseWidth / 2 + ((BASE.wallThickness * baseScale) / mapHalfX) * 180,
  baseZ - mapBaseDepth / 2 + ((BASE.wallThickness * baseScale) / mapHalfZ) * 130,
  (((BASE.width - BASE.wallThickness * 2) * baseScale) / mapHalfX) * 180,
  (((BASE.depth - BASE.wallThickness * 2) * baseScale) / mapHalfZ) * 130,
);
mapCtx.font = '8px sans-serif';
mapCtx.fillStyle = '#294638';
mapCtx.fillText('BORDER', baseX - 15, baseZ - 3);
function drawMap() {
  ctx.drawImage(mapBackground, 0, 0);
  const mapPosition = exploring ? motor.position : camera.position;
  const [px, pz] = mapPoint(mapPosition.x, mapPosition.z);
  if (exploring) {
    ctx.fillStyle = '#214f39';
    ctx.beginPath();
    ctx.arc(px, pz, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#214f3977';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, pz, 7, 0, Math.PI * 2);
    ctx.moveTo(px, pz);
    ctx.lineTo(px - Math.sin(yaw) * 13, pz - Math.cos(yaw) * 13);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#fff7';
    ctx.beginPath();
    ctx.moveTo(140, 260);
    ctx.lineTo(baseX - 30, baseZ);
    ctx.lineTo(baseX + 30, baseZ);
    ctx.lineTo(220, 260);
    ctx.stroke();
  }
  document.querySelector('#coordinates').textContent = exploring
    ? `X ${Math.round(mapPosition.x)} / Z ${Math.round(mapPosition.z)}`
    : '約 7 × 6 km';
}

let frames = 0,
  lastRender = 0,
  fpsFrames = 0,
  fpsTime = performance.now(),
  fps = 0;
const hand = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  rightVector = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  if (settings.fpsLimit && now - lastRender < 1000 / settings.fpsLimit - 0.5) return;
  lastRender = now;
  const elapsed = Math.min(clock.getDelta(), 0.25);
  if (paused) {
    if (renderRequested) {
      renderer.render(scene, camera);
      renderRequested = false;
    }
    return;
  }
  if (exploring) {
    const input = moveInput(),
      exhausted = combat.snapshot.state === 'exhausted';
    let remaining = elapsed;
    while (remaining > 1e-7) {
      const dt = Math.min(remaining, 1 / 120),
        from = { ...motor.position };
      combat.update(dt);
      grasshopper.update(dt);
      motor.update(dt, exhausted ? {} : input, yaw);
      if (combat.snapshot.state !== 'exhausted') grasshopper.checkStep(from, motor.position, input, yaw);
      input.jumpPressed = false;
      remaining -= dt;
    }
    jumpQueued = false;
    const point = motor.position;
    if (
      ![point.x, point.y, point.z].every(Number.isFinite) ||
      point.y < groundHeight(point.x, point.z) - 8 ||
      (inRiver(point.x, point.z) && !CITY.bridges.some((x) => Math.abs(x - point.x) < 10) && point.y < 0.65)
    ) {
      respawn();
      notify('已返回安全起點；可使用蚱蜢從空中跨越河流');
    }
    playerView.update(elapsed, viewState());
    const state = motor.state;
    state.charging = grasshopper.snapshot.charging;
    avatar.update(elapsed, state);
    avatar.setVisible(playerView.avatarVisible);
    if (playerView.mode === 'first') {
      camera.getWorldDirection(direction);
      rightVector.set(Math.cos(yaw), 0, -Math.sin(yaw));
      hand.copy(camera.position).addScaledVector(direction, 0.65).addScaledVector(rightVector, 0.3);
      hand.y -= 0.28;
    } else hand.copy(avatar.handPosition());
    const gh = grasshopper.snapshot;
    effects.update(elapsed, gh, hand, motor.grounded ? grasshopper.preview(yaw) : null, true);
    syncPlayerHud();
    audio.speed(motor.speed);
  } else if (target) {
    camera.position.lerp(target.pos, 1 - Math.exp(-elapsed * 2.5));
    camera.lookAt(target.look);
    if (camera.position.distanceTo(target.pos) < 0.03) target = null;
  }
  if (++frames % 8 === 0) drawMap();
  fpsFrames++;
  if (now - fpsTime >= 1000) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsTime));
    fpsFrames = 0;
    fpsTime = now;
    document.querySelector('#fps-display').textContent = `FPS ${fps}`;
  }
  city.architecture.update(camera, settings.detailDistance);
  renderer.render(scene, camera);
  renderRequested = false;
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderRequested = true;
});
document.body.classList.add('overview');
document.querySelector('#location').textContent = '三門市全域';
drawMap();
window.__mikado = {
  get state() {
    return {
      exploring,
      paused,
      day,
      current,
      yaw,
      pitch,
      fps,
      position: camera.position.toArray(),
      surfaceHeight: groundHeight(camera.position.x, camera.position.z),
      objects: scene.children.length,
      player: { ...motor.state, view: playerView.diagnostics, avatar: avatar.diagnostics },
      combat: combat.snapshot,
      grasshopper: grasshopper.snapshot,
      settings: structuredClone(settings),
      ui: ui.diagnostics,
      render: { pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled },
      city: {
        architecture: {
          style: 'anime-japanese',
          footprintScale: ARCHITECTURE.footprintScale,
          enlargement: ARCHITECTURE.enlargement,
          layout: 'continuous-frontage',
          floorHeight: ARCHITECTURE.floorHeight,
          doorHeight: ARCHITECTURE.doorHeight,
          eyeHeight: PERSON.eyeHeight,
          ...city.architecture.metrics,
        },
        terrainMode: 'continuous-basin',
        cityShape: 'irregular',
        riverCenter: riverZ(0),
        basinWidth: CITY.basinX * 2,
        basinDepth: CITY.basinZ * 2,
        buildings: city.lots.length,
        trees: city.trees,
        bridges: city.bridges,
        bounds: CITY.halfSize,
        headquartersCenter: [0, -150],
      },
      headquarters: {
        name: headquarters.name,
        enlargement: BASE.enlargement,
        openRoof: headquarters.openRoof,
        width: headquarters.width * baseScale,
        depth: headquarters.depth * baseScale,
        height: headquarters.height * baseScale,
        towers: headquarters.towers,
      },
    };
  },
};
