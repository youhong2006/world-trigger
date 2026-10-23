import * as THREE from 'three';
import { createCollisionIndex } from './city-layout.js';

// An isolated virtual instance, not a physical city stored inside a headquarters floor.
export function createHQTraining({ scene, worldObjects, motor, onTransition, notify, storage }) {
  const y = 1000,
    root = new THREE.Group();
  root.name = 'BORDER virtual training instance';
  const virtualScene = new THREE.Scene();
  virtualScene.background = new THREE.Color('#0a1c31');
  virtualScene.fog = new THREE.Fog('#0a1c31', 100, 240);
  virtualScene.add(root);
  for (const light of scene.children.filter((o) => o.isLight)) {
    const copy = light.clone();
    copy.castShadow = false;
    virtualScene.add(copy);
  }
  let visualObjects = [];
  root.visible = false;
  const index = createCollisionIndex(),
    targets = [],
    meshes = [];
  let active = false,
    anchor = null,
    time = 0,
    hits = 0,
    shots = 0,
    finished = false,
    best = 0;
  try {
    best = Number(storage.getItem('mikado-hq-training-best')) || 0;
  } catch {}
  function box(x, by, z, w, h, d, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }),
    );
    m.position.set(x, by + h / 2, z);
    root.add(m);
    index.add({ x, y: by, z, w, h, d });
  }
  box(0, y - 0.4, 0, 180, 0.4, 180, '#294359');
  const grid = new THREE.GridHelper(180, 90, '#39d8ec', '#36657e');
  grid.position.y = y + 0.01;
  root.add(grid);
  for (const sign of [-1, 1]) {
    box(sign * 90, y, 0, 1, 12, 180, '#152f45');
    box(0, y, sign * 90, 180, 12, 1, '#152f45');
  }
  for (const [x, z, w, h, d] of [
    [-30, -15, 12, 3, 8],
    [25, -25, 10, 5, 10],
    [-45, 35, 15, 8, 15],
  ])
    box(x, y, z, w, h, d, '#3e5a70');
  for (let i = 0; i < 6; i++) {
    const t = {
      id: `HQ-${i + 1}`,
      position: { x: -45 + i * 18, y: y + 2 + (i % 3), z: -40 - (i % 2) * 12 },
      radius: 1.1,
      maxHealth: 32,
      health: 32,
    };
    targets.push(t);
    const g = new THREE.Group();
    g.position.copy(t.position);
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.6),
      new THREE.MeshBasicMaterial({ color: '#36e8f6' }),
    );
    g.add(m);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.035, 6, 32),
      new THREE.MeshBasicMaterial({ color: '#66e8f9' }),
    );
    g.add(ring);
    root.add(g);
    meshes.push(g);
  }
  const label = document.createElement('button');
  label.id = 'hq-training-exit';
  label.hidden = true;
  label.onclick = () => stop();
  document.body.append(label);
  function reset() {
    time = hits = shots = 0;
    finished = false;
    targets.forEach((t) => (t.health = t.maxHealth));
  }
  function start(view) {
    if (active) return;
    anchor = { position: { ...motor.position }, yaw: view.yaw, pitch: view.pitch };
    active = true;
    reset();
    visualObjects = scene.children.filter((o) => !o.isLight && !worldObjects.includes(o));
    for (const o of visualObjects) virtualScene.add(o);
    root.visible = true;
    motor.teleport({ x: 0, y, z: 30 }, 0);
    onTransition(0, 0);
    label.hidden = false;
    notify('模擬訓練：擊破六靶 · F 返回基地 · R 重試');
  }
  function stop() {
    if (!active) return false;
    active = false;
    root.visible = false;
    label.hidden = true;
    for (const o of visualObjects) scene.add(o);
    visualObjects = [];
    motor.teleport(anchor.position, anchor.yaw);
    onTransition(anchor.yaw, anchor.pitch);
    notify('已返回基地訓練終端');
    return true;
  }
  return {
    scene: virtualScene,
    start,
    stop,
    index,
    y,
    targets,
    recordShot() {
      if (active && !finished) shots++;
    },
    hit(id, damage) {
      const t = targets.find((t) => t.id === id);
      if (!active || !t || t.health <= 0 || !(damage > 0)) return false;
      t.health = Math.max(0, t.health - damage);
      hits++;
      if (targets.every((t) => t.health <= 0)) {
        finished = true;
        const score = Math.max(0, Math.round(1000 - time * 5 + Math.min(1, hits / Math.max(1, shots)) * 300));
        best = Math.max(best, score);
        try {
          storage.setItem('mikado-hq-training-best', String(best));
        } catch {}
        notify(`六靶擊破 · ${time.toFixed(1)} 秒 · ${score} 分 · F 返回／R 重試`);
      }
      return true;
    },
    retry() {
      if (!active) return;
      reset();
      motor.teleport({ x: 0, y, z: 30 }, 0);
      onTransition(0, 0);
    },
    update(dt) {
      if (!active) return;
      if (!finished) time += dt;
      meshes.forEach((m, i) => {
        m.visible = targets[i].health > 0;
        m.rotation.y += dt * 0.5;
      });
      label.textContent = `虛擬訓練 ${targets.filter((t) => t.health <= 0).length}/6 ｜ ${time.toFixed(1)} s ｜ F 返回基地`;
    },
    get active() {
      return active;
    },
    get snapshot() {
      return {
        active,
        time,
        hits,
        shots,
        best,
        cleared: targets.filter((t) => t.health <= 0).length,
        finished,
      };
    },
  };
}
