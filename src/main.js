import * as THREE from 'three';
import './style.css';
import { ACTIONS, loadSettings, isPressed, keyLabel } from './game-settings.js';
import { createArmory, SHOOTING_TYPES, shotCost, normalizeFire } from './armory.js';
import { createShootingSystem, createWorldTrace, chooseAimPoint } from './projectiles.js';
import { createRangeChallenge, RANGE_SPAWN } from './range-challenge.js';
import { createShootingVisuals } from './shooting-visuals.js';
import { loadDraft } from './trajectory-plan.js';
import { createFiringMenu } from './firing-menu.js';
import { createFiringPanel } from './firing-panel.js';
import { createBattleBody, BODY_PARTS } from './battle-body.js';
import { createMeleeCombat } from './melee-combat.js';
import { createBattleSession, BATTLE_SPAWN, MISSION_MODES, DIFFICULTIES, ARENA } from './battle-session.js';
import { createBattleVisuals } from './battle-visuals.js';
import { TRIGGERS, createCombatCore } from './combat-core.js';
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
const motor = createCharacterMotor({
  groundHeight,
  collision: {
    ...collision,
    canOccupy(x, z, y, h, r) {
      return collision.canOccupy(x, z, y, h, r) && !battle.overlaps(x, z, y, h, r);
    },
  },
});
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
const armory = createArmory(storage);
const traceWorld = createWorldTrace(collision, groundHeight);
const battleEffects = createBattleVisuals(scene, collision, groundHeight);
const rangeStrikeHits = new Set();
let feedback = 0,
  dodgeVector = { x: 0, z: 0 },
  lastBattleHud = '';
const body = createBattleBody({
  combat,
  onEvent(type, detail) {
    battleEffects.event(type, { ...detail, position: { ...motor.position, y: motor.position.y + 1 } });
    if (type === 'sever') {
      if (detail.part === 'rightArm') shooting.clear('main');
      if (detail.part === 'leftArm') shooting.clear('sub');
      if (!activeTrigger('grasshopper')) grasshopper.cancel();
    }
    if (type === 'sever') notify(`${BODY_PARTS[detail.part].name}已破壞 · 無法自然修復`);
    if (type === 'critical') battle.bailout('critical');
  },
});
const melee = createMeleeCombat({
  combat,
  onEvent(type, detail) {
    const position = { ...motor.position, y: motor.position.y + 1 };
    battleEffects.event(type, { ...detail, position });
    if (type === 'swing') rangeStrikeHits.clear();
    if (type === 'strike') {
      battle.strike(detail, playerBattleState());
      if (range.snapshot.phase === 'active')
        for (const t of range.targets) {
          const dx = t.position.x - position.x,
            dz = t.position.z - position.z,
            d = Math.hypot(dx, dz);
          if (
            !rangeStrikeHits.has(t.id) &&
            d < detail.reach + t.radius &&
            Math.abs(t.position.y - position.y) < 2 &&
            (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / (d || 1) > Math.cos(detail.arc) &&
            traceWorld(position, t.position, 0.05) > 0.999
          ) {
            rangeStrikeHits.add(t.id);
            range.hit(t.id, detail.damage);
          }
        }
    }
    if (['swing', 'parry', 'block', 'dodge', 'guardBreak'].includes(type)) audio.tone(type);
    if (type === 'parry') {
      feedback = 0.35;
      notify('招架成功 · 敵人短暫失衡');
    }
    weaponRevision++;
  },
});
const battle = createBattleSession({
  groundHeight,
  collision,
  traceWorld,
  storage,
  onEvent(type, detail) {
    battleEffects.event(type, detail);
    if (type === 'enemyHit') {
      hitUntil = performance.now() + 160;
      audio.tone('hit');
    }
    if (type === 'wave')
      notify(
        `第 ${detail.wave} ${detail.mode === 'patrol' ? '巡邏區' : '波'} · 注意敵人的青色核心與橘色攻擊預兆`,
      );
    if (type === 'waypoint') notify('前往青色光環，啟動下一個巡邏區');
    if (type === 'bailout') {
      clearInput();
      melee.reset();
      shooting.clear();
      grasshopper.cancel();
      audio.tone('bailout');
    }
    if (type === 'enemyDown') audio.tone('hit');
  },
  onPlayerHit: damagePlayer,
  onFinish: finishBattle,
});
function getTargets() {
  return battle.phase === 'idle' ? range.targets : battle.targets;
}
function playerBattleState() {
  return {
    position: { ...motor.position },
    velocity: { ...motor.velocity },
    yaw,
    crouched: motor.crouched,
    volumes: body.volumes(motor.position, yaw, motor.crouched),
  };
}
function activeTrigger(type) {
  return ['main', 'sub'].some((side) => armory.active(side) === type && body.usable(side));
}
function bladeSide() {
  return ['main', 'sub'].find((side) => armory.active(side) === 'blade' && body.usable(side));
}
function damagePlayer(hit) {
  const defense = melee.defend({ ...hit, position: motor.position, yaw });
  if (defense.damage > 0) {
    body.hit(hit.part, defense.damage);
    melee.stagger(hit.damage > 16 ? 0.4 : 0.22);
    grasshopper.cancel();
    feedback = 0.45;
    audio.tone('hurt');
  }
  return defense;
}
function finishBattle(result) {
  clearInput();
  shooting.clear();
  pointerIntent = 'cursor';
  if (document.pointerLockElement) document.exitPointerLock?.();
  document.querySelector('#challenge-result').hidden = false;
  document.querySelector('#result-title').textContent =
    result.phase === 'victory' ? '任務完成' : '緊急脫離完成';
  document.querySelector('#result-reason').textContent =
    {
      cleared: '作戰目標已達成',
      critical: '關鍵部位破壞',
      trion: '三離子耗盡',
      manual: '已主動脫離戰鬥',
      timeout: '任務時間已到',
      boundary: '離開作戰範圍過久',
      spawn: '找不到安全的敵人生成位置',
    }[result.reason] ?? '戰鬥結束';
  document.querySelector('#result-stats').textContent =
    `${MISSION_MODES[result.mode]} · ${DIFFICULTIES[result.difficulty].name} · 擊破 ${result.cleared}/${result.total} · ${result.time.toFixed(1)} s · ${result.score} 分`;
  syncPlayerHud(true);
}
function startBattle(options = {}) {
  if (
    ![...armory.profile.main, ...armory.profile.sub].some(
      (id) => id === 'blade' || SHOOTING_TYPES.includes(id),
    )
  ) {
    notify('至少配備一項刀劍或射擊觸發器才能出擊');
    ui.open('loadout');
    return;
  }
  if (ui.isOpen) ui.close();
  enter();
  safeSpawn = {
    point: { x: BATTLE_SPAWN.x, y: groundHeight(BATTLE_SPAWN.x, BATTLE_SPAWN.z), z: BATTLE_SPAWN.z },
    yaw: BATTLE_SPAWN.yaw,
    pitch: 0,
  };
  yaw = safeSpawn.yaw;
  pitch = 0;
  motor.teleport(safeSpawn.point, yaw);
  playerView.reset();
  playerView.update(0, viewState());
  battle.start(options);
  document.querySelector('#location').textContent = 'BORDER · 單人作戰區';
  lastBattleHud = '';
  syncPlayerHud(true);
}
function dodge() {
  if (!exploring || paused || endedChallenge() || battle.phase === 'bailout') return;
  if (!melee.dodge()) return;
  grasshopper.cancel();
  const input = moveInput(),
    f = input.forward || (!input.strafe ? -1 : 0),
    r = input.strafe,
    l = Math.hypot(f, r) || 1;
  dodgeVector = {
    x: ((-Math.sin(yaw) * f + Math.cos(yaw) * r) / l) * 18 * body.snapshot.speedScale,
    z: ((-Math.cos(yaw) * f - Math.sin(yaw) * r) / l) * 18 * body.snapshot.speedScale,
  };
}
function syncBattleHud() {
  const b = battle.snapshot,
    a = melee.snapshot,
    w = body.snapshot;
  document.querySelector('#battle-hud').hidden = b.phase === 'idle';
  document.querySelector('#battle-title').textContent =
    `${MISSION_MODES[b.mode]} / ${DIFFICULTIES[b.difficulty].name}`;
  document.querySelector('#battle-progress').textContent =
    b.phase === 'bailout'
      ? '緊急脫離中…'
      : `${b.waypoint ? '前往光環 · ' : ''}${b.wave}/${b.waves} 區 · 擊破 ${b.cleared}/${b.total} · ${Math.ceil(b.remaining)} s`;
  document.querySelector('#battle-warning').textContent =
    b.outside > 0
      ? `返回作戰區域 · ${Math.ceil(12 - b.outside)} s`
      : w.leakage > 0
        ? `持續洩漏 −${w.leakage.toFixed(2)}/s · 受損部位無法自然修復`
        : '';
  const sig = `${w.revision}/${a.phase}/${a.parryWindow}/${b.phase}`;
  if (sig !== lastBattleHud) {
    lastBattleHud = sig;
    document.querySelector('#body-status').innerHTML = Object.entries(w.parts)
      .map(
        ([id, p]) =>
          `<span class="${p.destroyed ? 'severed' : p.health < p.maximum ? 'wounded' : ''}" title="${BODY_PARTS[id].name} ${Math.ceil(p.health)}/${p.maximum}">${BODY_PARTS[id].name}<i style="--integrity:${p.health / p.maximum}"></i></span>`,
      )
      .join('');
    document.querySelector('#action-state').textContent =
      {
        idle: '就緒',
        attack: '斬擊',
        charge: '蓄力',
        guard: a.parryWindow ? '招架窗口' : '防禦',
        dodge: '閃避 · 無無敵時間',
        stagger: '受擊硬直',
      }[a.phase] ?? '';
  }
}

let selectedTargetId = null,
  fireQueued = false,
  weaponRevision = 0,
  lastShotNotice = -Infinity,
  hitUntil = 0;
const muzzleMain = new THREE.Vector3(),
  muzzleSub = new THREE.Vector3(),
  aimForward = new THREE.Vector3(),
  aimOrigin = new THREE.Vector3();
const range = createRangeChallenge({ onFinish: finishChallenge });
const gunEffects = createShootingVisuals(scene, collision);
const shooting = createShootingSystem({
  combat,
  traceWorld,
  getTargets,
  getPaths: () => loadDraft(storage).paths,
  onEvent(type, detail) {
    gunEffects.event(type, detail);
    battleEffects.event(type, detail);
    weaponRevision++;
    if (type === 'shot') {
      range.recordShot();
      battle.recordShot();
    }
    if (type === 'generate' || type === 'release') audio.tone(type === 'generate' ? 'place' : 'fire');
    if (type === 'impact' && detail.targetId) {
      hitUntil = performance.now() + 150;
      audio.tone('hit');
    }
  },
  onHit(id, damage, point, bullet) {
    if (battle.phase !== 'idle') battle.hit(id, damage, point, bullet);
    else range.hit(id, damage);
  },
});
const firingMenu = createFiringMenu({
  getConfig: (type) => armory.profile.weapons[type],
  getPaths: () => loadDraft(storage).paths,
  onRemember: (type, state) => armory.rememberMenu(type, state),
  onConfig: tuneWeapon,
});
const firingPanel = createFiringPanel(document.querySelector('#firing-menu'), firingMenu);
function tuneWeapon(type, patch) {
  const cfg = normalizeFire({ ...armory.profile.weapons[type], ...patch });
  if (!shooting.retune(type, cfg)) {
    notify('目前無法調整彈組');
    return false;
  }
  armory.configure(type, patch, { live: true });
  return true;
}
function splitCube() {
  if (!exploring || paused || endedChallenge()) return;
  const gun = selectedGun();
  if (!shooting.snapshot.prepared[gun.side]) {
    notify('先按觸發鍵生成立方體，再用右鍵分割');
    return;
  }
  const counts = [1, 8, 27],
    count = counts[(counts.indexOf(gun.config.count) + 1) % counts.length];
  if (tuneWeapon(gun.type, { count })) notify(`已分割為 ${count} 發 · 同彈種自動沿用`);
}
let previousSlots = { main: armory.active('main'), sub: armory.active('sub') };
armory.subscribe((reason) => {
  if (reason === 'configure' || reason === 'profile') shooting.clear();
  if (reason === 'profile') firingMenu.activate(null);
  for (const side of ['main', 'sub'])
    if (previousSlots[side] !== armory.active(side)) {
      shooting.clear(side);
      previousSlots[side] = armory.active(side);
    }
  if (!['main', 'sub'].some((side) => armory.active(side) === 'grasshopper')) grasshopper.cancel();
  weaponRevision++;
  lastHud = '';
});
function endedChallenge() {
  return ['victory', 'defeat'].includes(range.snapshot.phase) || ['victory', 'defeat'].includes(battle.phase);
}
function selectedGun() {
  const p = armory.profile,
    side = p.fireSide,
    type = armory.active(side);
  return { side, type, config: p.weapons[type] };
}
function isAiming() {
  return (
    exploring &&
    !paused &&
    !endedChallenge() &&
    actionPressed('aim') &&
    SHOOTING_TYPES.includes(selectedGun().type)
  );
}
function muzzle(side) {
  const pivot = new THREE.Vector3(
      motor.position.x,
      motor.position.y + motor.eyeHeight * 0.82,
      motor.position.z,
    ),
    right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
    f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const ideal = pivot
    .clone()
    .addScaledVector(right, (side === 'main' ? 1 : -1) * (playerView.mode === 'first' ? 1.15 : 1.05))
    .addScaledVector(f, playerView.mode === 'first' ? 2.5 : 0.5);
  ideal.y += 0.18;
  const hit = traceWorld(pivot, ideal, 0.06);
  return ideal.lerpVectors(pivot, ideal, Math.max(0, hit - 0.025));
}
function currentAim() {
  const gun = selectedGun();
  camera.getWorldDirection(aimForward);
  aimOrigin.copy(camera.position);
  return chooseAimPoint({
    origin: aimOrigin,
    forward: aimForward,
    range: gun.config?.range ?? 220,
    targets: getTargets(),
    traceWorld,
    assist: (isAiming() && gun.config?.aim === 'assist') || gun.type === 'hound',
    selectedId: selectedTargetId,
  });
}
function prepareCube() {
  if (!exploring || paused || endedChallenge()) return;
  const gun = selectedGun();
  firingMenu.activate(gun.type);
  if (!body.usable(gun.side) || !melee.can('fire') || battle.phase === 'bailout') return;
  if (gun.type === 'blade') {
    notify('刀劍已啟動 · 左鍵輕擊、G 蓄力、右鍵格擋');
    return;
  }
  if (!SHOOTING_TYPES.includes(gun.type)) {
    notify('此側尚未啟動射擊觸發器，請切換槽位或射擊側');
    return;
  }
  if (shooting.snapshot.prepared[gun.side]) {
    shooting.clear(gun.side);
    notify('已收起立方體；未消耗三離子');
    return;
  }
  if (!shooting.prepare(gun.side, gun.type, gun.config)) notify('此側仍在發射中，或戰鬥體需要重整');
}
function fireCurrent() {
  if (!exploring || paused || endedChallenge()) return;
  const gun = selectedGun();
  if (!body.usable(gun.side) || battle.phase === 'bailout') return;
  if (gun.type === 'blade') {
    grasshopper.cancel();
    melee.attack();
    return;
  }
  if (!melee.can('fire')) return;
  if (melee.snapshot.phase !== 'idle') melee.cancel();
  if (!SHOOTING_TYPES.includes(gun.type)) {
    if (performance.now() - lastShotNotice > 1800) {
      notify('按 F 切換射擊側，或用數字鍵啟動射擊槽位');
      lastShotNotice = performance.now();
    }
    return;
  }
  if (!shooting.snapshot.prepared[gun.side]) {
    if (performance.now() - lastShotNotice > 1800) {
      notify('先按觸發鍵生成立方體，再用左鍵發射（每批 1 點）');
      lastShotNotice = performance.now();
    }
    return;
  }
  const aim = currentAim();
  const fired = shooting.fire(gun.side, gun.type, gun.config, muzzle(gun.side), aim.point, aim.targetId);
  if (
    !fired &&
    combat.snapshot.remaining < shotCost(gun.config) &&
    performance.now() - lastShotNotice > 2500
  ) {
    notify('三離子不足 1 點，稍待恢復即可發射');
    lastShotNotice = performance.now();
  }
}
function cycleAimTarget() {
  camera.getWorldDirection(aimForward);
  const visible = getTargets().filter(
    (t) =>
      t.health > 0 &&
      traceWorld(camera.position, t.position, 0.02) > 0.999 &&
      new THREE.Vector3().subVectors(t.position, camera.position).normalize().dot(aimForward) > 0.65,
  );
  const index = visible.findIndex((t) => t.id === selectedTargetId);
  selectedTargetId = visible[(index + 1) % visible.length]?.id ?? null;
  weaponRevision++;
}
function finishChallenge(result) {
  clearInput();
  shooting.clear();
  pointerIntent = 'cursor';
  if (document.pointerLockElement) document.exitPointerLock?.();
  if (result.phase === 'victory') armory.record(result);
  const box = document.querySelector('#challenge-result');
  box.hidden = false;
  document.querySelector('#result-title').textContent = result.phase === 'victory' ? '挑戰完成' : '挑戰結束';
  document.querySelector('#result-reason').textContent = {
    cleared: '六個練習靶已全部擊破',
    timeout: '時間已到',
    trion: '三離子耗盡',
  }[result.reason];
  document.querySelector('#result-stats').textContent =
    `擊破 ${result.cleared} / 6 · 用時 ${result.time.toFixed(1)} s · 命中率 ${Math.round(result.accuracy * 100)}% · 分數 ${result.score}`;
  const best = armory.snapshot.best;
  if (best) document.querySelector('#result-stats').textContent += ` · 最佳 ${Math.round(best.score)} 分`;
  weaponRevision++;
  syncPlayerHud(true);
}
function startChallenge() {
  const p = armory.profile;
  let side = ['main', 'sub'].find((side) => SHOOTING_TYPES.includes(armory.active(side)));
  if (!side) {
    for (const candidate of ['main', 'sub']) {
      const slot = p[candidate].findIndex((t) => SHOOTING_TYPES.includes(t));
      if (slot >= 0) {
        armory.selectSlot(candidate, slot);
        side = candidate;
        break;
      }
    }
  }
  if (!side) {
    notify('先在配裝加入小行星彈，再開始射擊挑戰');
    ui.open('loadout');
    return;
  }
  if (ui.isOpen) ui.close();
  enter();
  armory.setSide(side);
  range.start();
  shooting.reset();
  selectedTargetId = null;
  safeSpawn = {
    point: { x: RANGE_SPAWN.x, y: groundHeight(RANGE_SPAWN.x, RANGE_SPAWN.z), z: RANGE_SPAWN.z },
    yaw: RANGE_SPAWN.yaw,
    pitch: 0,
  };
  yaw = safeSpawn.yaw;
  pitch = 0;
  motor.teleport(safeSpawn.point, yaw);
  playerView.reset();
  playerView.update(0, viewState());
  document.querySelector('#location').textContent = 'BORDER 射擊演習區';
  document.querySelector('#challenge-result').hidden = true;
  weaponRevision++;
  syncPlayerHud(true);
  notify('90 秒內擊破六靶。E 生成、右鍵分割、左鍵發射，中鍵瞄準。');
}
let lastSlotMarkup = '';
function updateWeaponHud() {
  const p = armory.profile,
    gun = selectedGun(),
    shots = shooting.snapshot,
    challenge = range.snapshot;
  document.querySelector('#weapon-name').textContent = TRIGGERS[gun.type]?.name ?? '空槽';
  document.querySelector('#weapon-side').textContent = p.fireSide === 'main' ? '主側' : '副側';
  document.querySelector('#weapon-details').textContent = gun.config
    ? `${gun.config.count} 發 · ${gun.config.mode === 'burst' ? '分批' : '齊射'} · ${gun.config.range} m · 消耗 ${shotCost(gun.config).toFixed(1)}`
    : '切換至射擊槽位以發射';
  document.querySelector('#weapon-ready').textContent = shots.prepared[gun.side]
    ? '立方體就緒'
    : shots.pending
      ? '正在發射'
      : `${keyLabel(settings.bindings.prepare)} 生成 · ${keyLabel(settings.bindings.fire)} 發射`;
  document.querySelector('#weapon-special').hidden = gun.type !== 'meteor';
  if (gun.type === 'blade') {
    document.querySelector('#weapon-details').textContent = '三段輕擊 · 蓄力重擊 · 空中斬擊';
    document.querySelector('#weapon-ready').textContent =
      `${keyLabel(settings.bindings.fire)} 輕擊 · ${keyLabel(settings.bindings.heavy)} 蓄力 · ${keyLabel(settings.bindings.split)} 格擋`;
  }
  if (gun.type === 'shield')
    document.querySelector('#weapon-details').textContent =
      `按住 ${keyLabel(settings.bindings.guard)} 防禦 · 每秒 0.35 + 受擊消耗`;
  if (!body.usable(gun.side))
    document.querySelector('#weapon-ready').textContent = '此側手臂已破壞 · 請切換另一側';
  document.querySelector('#weapon-profile').textContent = p.name;
  const slotMarkup = ['main', 'sub']
    .map(
      (side) =>
        `<div><span>${side === 'main' ? '主' : '副'}</span>${p[side].map((id, i) => `<button data-slot="${side}:${i}" class="${p[side === 'main' ? 'activeMain' : 'activeSub'] === i ? 'selected' : ''}" title="${TRIGGERS[id]?.name ?? '空槽'}"><kbd>${keyLabel(settings.bindings['slot' + (i + (side === 'main' ? 1 : 5))])}</kbd><small>${TRIGGERS[id]?.name ?? '—'}</small></button>`).join('')}</div>`,
    )
    .join('');
  if (slotMarkup !== lastSlotMarkup) {
    lastSlotMarkup = slotMarkup;
    document.querySelector('#weapon-slots').innerHTML = slotMarkup;
    document.querySelectorAll('[data-slot]').forEach(
      (b) =>
        (b.onclick = () => {
          const [side, n] = b.dataset.slot.split(':');
          if (melee.can('switch')) {
            melee.cancel();
            armory.selectSlot(side, Number(n));
          }
        }),
    );
  }
  document.querySelector('#range-hud').hidden = challenge.phase === 'idle';
  document.querySelector('#range-time').textContent = challenge.remaining.toFixed(1);
  document.querySelector('#range-count').textContent = `${challenge.cleared} / ${challenge.total}`;
  document.querySelector('#exhausted-notice').hidden =
    combat.snapshot.state !== 'exhausted' || challenge.phase !== 'idle';
}

function viewState() {
  return {
    position: motor.position,
    eyeHeight: motor.eyeHeight,
    yaw,
    pitch,
    speed: motor.speed,
    aiming: isAiming(),
  };
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
  firingMenu.close();
  keys = {};
  jumpQueued = false;
  sprintLatched = false;
  dragging = false;
  fireQueued = false;
  grasshopper.cancel();
  melee.guard(false);
  if (melee.snapshot.phase === 'charge') melee.cancel();
  if (!settings.crouchToggle) crouchRequested = false;
}
function syncPlayerHud(force = false) {
  const core = combat.snapshot,
    gh = grasshopper.snapshot;
  const signature = `${playerView.mode}/${motor.crouched}/${motor.animation}/${core.remaining.toFixed(1)}/${core.state}/${motor.speed.toFixed(1)}/${Math.round(motor.position.y)}/${gh.pads.length}/${core.recovery}/${JSON.stringify(settings.bindings)}/${weaponRevision}/${Math.round(range.snapshot.remaining * 10)}`;
  syncBattleHud();
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
          ? `${core.leakage > 0 ? '洩漏 −' + core.leakage.toFixed(1) + ' / ' : ''}+${core.recovery.toFixed(1)}/s`
          : '恢復等待中';
  document.querySelector('.trion-card').classList.toggle('low', core.remaining < 20);
  document.querySelector('#pad-count').textContent =
    `跳板 ${String(gh.pads.filter((p) => !p.used).length).padStart(2, '0')}`;
  document.querySelector('#cast-key').textContent = keyLabel(settings.bindings.grasshopper);
  document.querySelector('#cast-status').textContent = gh.charging
    ? '放開即可釋放'
    : core.state === 'exhausted'
      ? '三離子耗盡'
      : !activeTrigger('grasshopper')
        ? '未啟動蚱蜢槽位'
        : `按住準備 · 放開釋放`;
  document.querySelector('.ability-card').classList.toggle('charging', gh.charging);
  updateWeaponHud();
  syncBattleHud();
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
  gunEffects.configure(value);
  battleEffects.configure(value);
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
  range.reset();
  battle.reset();
  body.reset();
  melee.reset();
  battleEffects.hide();
  shooting.reset();
  document.querySelector('#challenge-result').hidden = true;
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
  feedback = 0;
  document.querySelector('#damage-feedback').style.opacity = '0';
  exploring = false;
  pointerIntent = 'overview';
  clearInput();
  grasshopper.reset();
  combat.reset();
  effects.hide();
  shooting.reset();
  range.reset();
  gunEffects.hideWeapons();
  battle.reset();
  body.reset();
  melee.reset();
  battleEffects.hide();
  document.querySelector('#challenge-result').hidden = true;
  avatar.setVisible(false);
  document.body.classList.remove('exploring', 'third-person');
  document.body.classList.add('overview');
  walking.hidden = true;
  document.body.classList.remove('editing-fire');
  camera.fov = 51;
  camera.near = 5;
  camera.updateProjectionMatrix();
  if (document.pointerLockElement) document.exitPointerLock?.();
  target = { pos: overviewPosition.clone(), look: overviewLook.clone() };
  renderRequested = true;
}
function respawn() {
  if (battle.phase !== 'idle') {
    const { mode, difficulty } = battle.snapshot;
    startBattle({ mode, difficulty });
    return;
  }
  body.reset();
  melee.reset();
  if (range.snapshot.phase !== 'idle') {
    startChallenge();
    return;
  }
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
  shooting.reset();
  range.reset();
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
  if (!exploring || paused || endedChallenge() || combat.snapshot.state === 'exhausted') return;
  if (!activeTrigger('grasshopper') || !melee.can('grasshopper') || battle.phase === 'bailout') {
    notify('目前啟動的槽位沒有蚱蜢，請用數字鍵切換');
    return;
  }
  if (melee.snapshot.phase !== 'idle') melee.cancel();
  if (!grasshopper.begin())
    notify(combat.snapshot.remaining < 0.3 ? '三離子不足，稍待恢復或返回起點' : '技能尚在準備，稍後再試');
}
function releaseCast() {
  if (!exploring || paused) return;
  if (!melee.can('grasshopper')) {
    grasshopper.cancel();
    return;
  }
  grasshopper.release(moveInput(), yaw);
  syncPlayerHud(true);
}
ui = createGameUI({
  settings,
  storage,
  armory,
  onStartChallenge: startChallenge,
  onStartBattle: startBattle,
  getBattleRecords: () => battle.snapshot.best,
  onBattleRecords: (value) => battle.importRecords(value),
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
document.querySelector('#start-challenge').onclick = startChallenge;
document.querySelector('#retry-challenge').onclick = respawn;
document.querySelector('#finish-challenge').onclick = () => {
  range.reset();
  battle.reset();
  body.reset();
  melee.reset();
  battleEffects.hide();
  respawn();
  document.querySelector('#challenge-result').hidden = true;
};
document.querySelector('#prepare-cube').onclick = prepareCube;
document.querySelector('#fire-cube').onclick = () => {
  fireCurrent();
};
document.querySelector('#start-battle').onclick = () => ui.open('missions');
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
    if (battle.phase === 'active') battle.bailout('trion');
    else range.fail();
    notify('三離子耗盡，戰鬥體進入緊急脫離');
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
function releaseBattleAction(code) {
  if (paused || ui.isOpen) return;
  if (code === settings.bindings.heavy) melee.heavyRelease();
  if (
    code === settings.bindings.guard ||
    (code === settings.bindings.split && selectedGun().type === 'blade')
  )
    melee.guard(false);
}
function dispatchAction(action) {
  if ((endedChallenge() || battle.phase === 'bailout') && !['reset', 'view'].includes(action)) return;
  if (action === 'jump') jumpQueued = true;
  if (action === 'sprint' && settings.sprintToggle) sprintLatched = !sprintLatched;
  if (action === 'crouch') {
    if (settings.crouchToggle) toggleCrouch();
    else crouchRequested = true;
  }
  if (action === 'view') toggleView();
  if (action === 'reset') respawn();
  if (action === 'grasshopper') beginCast();
  if (action === 'dodge') dodge();
  if (action === 'guard') melee.guard(true);
  if (action === 'heavy' && bladeSide()) {
    grasshopper.cancel();
    melee.heavyStart();
  }
  if (action === 'bailout') {
    if (battle.phase === 'active') battle.bailout('manual');
    else if (battle.phase === 'idle' && exploring) {
      notify('戰鬥體重整完成');
      respawn();
    }
  }
  if (action === 'prepare') prepareCube();
  if (action === 'fire') fireQueued = true;
  if (action === 'split') {
    if (selectedGun().type === 'blade') melee.guard(true);
    else splitCube();
  }
  if (action === 'menuEnter') {
    firingMenu.activate(selectedGun().type);
    firingMenu.enter();
  }
  if (action === 'menuBack') firingMenu.back();
  if (action === 'swapSide' && melee.can('switch'))
    armory.setSide(armory.profile.fireSide === 'main' ? 'sub' : 'main');
  if (action === 'cycleTarget') cycleAimTarget();
  if (/^slot[1-8]$/.test(action ?? '') && melee.can('switch')) {
    const n = Number(action.slice(4)) - 1;
    melee.cancel();
    armory.selectSlot(n < 4 ? 'main' : 'sub', n % 4);
  }
}
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
  if (!action && !Object.values(settings.bindings).includes(event.code)) {
    if (event.code === 'BracketRight') action = 'menuEnter';
    if (event.code === 'BracketLeft') action = 'menuBack';
  }
  if (exploring && (action || event.code.startsWith('Arrow'))) event.preventDefault();
  keys[event.code] = true;
  if (!exploring || event.repeat) return;
  dispatchAction(action);
});
window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
  releaseBattleAction(event.code);
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
  if (paused || ui.isOpen || endedChallenge()) return;
  if (exploring && event.button >= 3) event.preventDefault();
  const wasLocked = document.pointerLockElement === renderer.domElement;
  if (exploring && wasLocked) {
    const code = 'Mouse' + event.button;
    keys[code] = true;
    dispatchAction(Object.keys(ACTIONS).find((id) => settings.bindings[id] === code));
  }
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
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
for (const type of ['mousedown', 'mouseup', 'auxclick'])
  renderer.domElement.addEventListener(type, (event) => {
    if (exploring && event.button >= 3) event.preventDefault();
  });
window.addEventListener('pointerup', (event) => {
  keys['Mouse' + event.button] = false;
  releaseBattleAction('Mouse' + event.button);
  if (settings.bindings.crouch === 'Mouse' + event.button && !settings.crouchToggle) crouchRequested = false;
  if (settings.bindings.grasshopper === 'Mouse' + event.button && !paused && !ui.isOpen) releaseCast();
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
      scale = 0.002 * settings.sensitivity * (isAiming() ? settings.aimSensitivity : 1);
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
      firingMenu.activate(selectedGun().type);
      if (firingMenu.snapshot.open) {
        firingMenu.scroll(Math.sign(event.deltaY));
        return;
      }
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
  const local = battle.phase !== 'idle';
  const projection = local
    ? (x, z) => [180 + ((x - ARENA.x) * 180) / ARENA.radius, 130 + ((z - ARENA.z) * 130) / ARENA.radius]
    : mapPoint;
  if (local) {
    ctx.fillStyle = '#0b2532';
    ctx.fillRect(0, 0, 360, 260);
    ctx.strokeStyle = '#2a5660';
    ctx.lineWidth = 1;
    for (let i = 0; i < 360; i += 36) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 260);
      ctx.stroke();
    }
    for (let i = 0; i < 260; i += 26) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(360, i);
      ctx.stroke();
    }
    for (const enemy of battle.targets) {
      const [x, z] = projection(enemy.position.x, enemy.position.z);
      ctx.fillStyle = enemy.state === 'telegraph' ? '#ffbb66' : '#15d7e8';
      ctx.beginPath();
      ctx.arc(x, z, enemy.boss ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const waypoint = battle.snapshot.waypoint;
    if (waypoint) {
      const [x, z] = projection(waypoint.x, waypoint.z);
      ctx.strokeStyle = '#4bf5e6';
      ctx.strokeRect(x - 5, z - 5, 10, 10);
    }
  } else ctx.drawImage(mapBackground, 0, 0);
  const mapPosition = exploring ? motor.position : camera.position;
  const [px, pz] = projection(mapPosition.x, mapPosition.z);
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
      if (endedChallenge()) break;
      combat.update(dt);
      range.update(dt);
      melee.update(dt, { blade: !!bladeSide(), shield: activeTrigger('shield'), grounded: motor.grounded });
      if (actionPressed('guard') || (selectedGun().type === 'blade' && actionPressed('split')))
        melee.guard(true);
      shooting.update(dt);
      battle.update(dt, playerBattleState());
      grasshopper.update(dt);
      const a = melee.snapshot,
        w = body.snapshot;
      const disabled = exhausted || battle.phase === 'bailout';
      const movement = disabled
        ? {}
        : {
            ...input,
            speedScale: w.speedScale * a.speedScale,
            jumpScale: w.jumpScale,
            crouch: input.crouch || w.lostLegs === 2,
            dash: a.phase === 'dodge' ? dodgeVector : null,
          };
      if (w.jumpScale === 0) {
        movement.jump = false;
        movement.jumpPressed = false;
      }
      motor.update(dt, movement, yaw);
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
    state.aiming = isAiming();
    state.aimPitch = pitch;
    state.battleAction = melee.snapshot;
    state.bladeSide = bladeSide();
    state.body = body.snapshot;
    state.bailout = battle.phase === 'bailout';
    if (state.battleAction.phase !== 'idle') state.heading = yaw;
    if (state.aiming) state.heading = yaw;
    avatar.update(elapsed, state);
    avatar.setVisible(
      playerView.avatarVisible && !(battle.phase === 'bailout' && battle.snapshot.bailoutProgress > 0.55),
    );
    feedback = Math.max(0, feedback - elapsed);
    document.querySelector('#damage-feedback').style.opacity = String(feedback * settings.hitFlash);
    if (feedback > 0 && !settings.reducedMotion && settings.cameraShake > 0) {
      camera.position.x += Math.sin(now * 0.045) * feedback * settings.cameraShake * 0.12;
      camera.position.y += Math.cos(now * 0.053) * feedback * settings.cameraShake * 0.08;
    }
    if (playerView.mode === 'first') {
      camera.getWorldDirection(direction);
      rightVector.set(Math.cos(yaw), 0, -Math.sin(yaw));
      hand.copy(camera.position).addScaledVector(direction, 0.65).addScaledVector(rightVector, 0.3);
      hand.y -= 0.28;
    } else hand.copy(avatar.handPosition());
    if (!endedChallenge() && fireQueued) fireCurrent();
    fireQueued = false;
    const aim = currentAim(),
      t = getTargets().find((t) => t.id === aim.targetId);
    document.querySelector('#target-readout').textContent = t
      ? `${t.id} · ${Math.ceil(t.health)} / ${t.maxHealth}`
      : '';
    document.querySelector('.reticle').classList.toggle('hit', performance.now() < hitUntil);
    document.body.classList.toggle('aiming', isAiming());
    muzzleMain.copy(muzzle('main'));
    muzzleSub.copy(muzzle('sub'));
    gunEffects.update(
      elapsed,
      shooting.snapshot,
      battle.phase === 'idle' ? range.targets : [],
      { main: muzzleMain, sub: muzzleSub },
      true,
    );
    const bladeHand =
      playerView.mode === 'first'
        ? {
            position: camera.position
              .clone()
              .add(
                new THREE.Vector3(bladeSide() === 'sub' ? -0.42 : 0.42, -0.4, -0.7).applyQuaternion(
                  camera.quaternion,
                ),
              ),
            quaternion: camera.quaternion
              .clone()
              .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, -0.2))),
          }
        : avatar.handPose(bladeSide() ?? 'main');
    battleEffects.update(
      elapsed,
      battle.snapshot,
      melee.snapshot,
      body.snapshot,
      playerBattleState(),
      bladeHand,
      !!bladeSide(),
      playerView.avatarVisible,
      playerView.mode === 'first',
    );
    firingMenu.activate(selectedGun().type);
    firingPanel.render(!endedChallenge(), settings.bindings);
    document.body.classList.toggle('editing-fire', !!firingMenu.snapshot.type && firingMenu.snapshot.open);
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
      battle: battle.snapshot,
      body: body.snapshot,
      melee: melee.snapshot,
      battleEffects: battleEffects.diagnostics,
      shooting: shooting.snapshot,
      firingMenu: firingMenu.snapshot,
      range: range.snapshot,
      armory: armory.snapshot,
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
