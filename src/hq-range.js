import * as THREE from 'three';
import { HQ_RANGE, wingFrame, wingPoint } from './hq-layout.js';

// The red reference band is a real physical shooting hall in the headquarters.
// Virtual-city practice remains a separate facility and scene.
export function createHQRange({ scene, collision, storage, notify = () => {} }) {
  const root = new THREE.Group();
  root.name = 'BORDER physical lower shooting hall targets';
  scene.add(root);
  const targets = [],
    visuals = [],
    colliders = [];
  const paper = new THREE.MeshStandardMaterial({
    color: '#dce5df',
    emissive: '#607c87',
    emissiveIntensity: 0.18,
    roughness: 0.8,
  });
  const energy = new THREE.MeshBasicMaterial({ color: '#40deed' }),
    dark = new THREE.MeshStandardMaterial({ color: '#334b5c', roughness: 0.8 });
  let active = false,
    time = 0,
    hits = 0,
    shots = 0,
    started = false,
    finished = false,
    best = 0;
  try {
    best = Number(storage?.getItem('mikado-hq-live-range-best')) || 0;
  } catch {}
  for (
    let u = Math.ceil(HQ_RANGE.minU / HQ_RANGE.laneSpacing) * HQ_RANGE.laneSpacing, lane = 1;
    u <= HQ_RANGE.maxU - 4;
    u += HQ_RANGE.laneSpacing, lane++
  ) {
    if (u > 31 && u < 77) continue;
    const p = wingPoint('front', HQ_RANGE.y, u, HQ_RANGE.targetV),
      position = { x: p.x, y: p.y + 2.5, z: p.z };
    const id = `LIVE-${String(lane).padStart(2, '0')}`,
      t = { id, position, radius: 0.72, maxHealth: 32, health: 32, lane };
    targets.push(t);
    const g = new THREE.Group();
    g.position.copy(position);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.6, 0.12), paper);
    g.add(board);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), energy);
    ring.position.z = 0.068;
    g.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), energy);
    core.position.z = 0.07;
    g.add(core);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.14), dark);
    pole.position.y = -1.65;
    g.add(pole);
    root.add(g);
    visuals.push(g);
    colliders.push(collision.add({ x: p.x, y: p.y + 1.7, z: p.z, w: 1.25, h: 1.6, d: 0.16 }));
  }
  function contains(p) {
    const f = wingFrame('front', HQ_RANGE.y),
      v = p.z - f.z;
    return (
      p.y >= HQ_RANGE.y - 0.25 &&
      p.y <= HQ_RANGE.top + 0.2 &&
      p.x > HQ_RANGE.minU - 3 &&
      p.x < HQ_RANGE.maxU + 3 &&
      v >= HQ_RANGE.vMin - 5 &&
      v <= HQ_RANGE.vMax + 4
    );
  }
  function reset() {
    time = hits = shots = 0;
    started = finished = false;
    targets.forEach((t, i) => {
      t.health = t.maxHealth;
      colliders[i].enabled = true;
    });
  }
  return {
    root,
    targets,
    contains,
    reset,
    recordShot() {
      if (active && !finished) {
        started = true;
        shots++;
      }
    },
    hit(id, damage) {
      if (!Number.isFinite(damage) || damage <= 0) return false;
      const i = targets.findIndex((t) => t.id === id),
        t = targets[i];
      if (!t || t.health <= 0) return false;
      started = true;
      t.health = Math.max(0, t.health - damage);
      hits++;
      if (t.health === 0) colliders[i].enabled = false;
      if (targets.every((t) => t.health <= 0)) {
        finished = true;
        const score = Math.max(0, Math.round(targets.length * 100 - time * 2));
        best = Math.max(best, score);
        try {
          storage?.setItem('mikado-hq-live-range-best', String(best));
        } catch {}
        notify(`實體靶場全部擊破 · ${time.toFixed(1)}秒 · ${score}分，可在靶位終端重置`);
      }
      return true;
    },
    update(dt, position, enabled = true) {
      active = enabled && contains(position);
      if (active && started && !finished) time += Math.max(0, dt);
      const f = wingFrame('front', HQ_RANGE.y);
      root.visible =
        enabled &&
        position.y >= HQ_RANGE.y - 8 &&
        position.y <= HQ_RANGE.top + 6 &&
        Math.abs(position.z - f.z) < HQ_RANGE.vMax + 40;
      for (let i = 0; i < visuals.length; i++)
        visuals[i].visible =
          targets[i].health > 0 &&
          Math.hypot(position.x - targets[i].position.x, position.z - targets[i].position.z) < 210;
    },
    get active() {
      return active;
    },
    get snapshot() {
      return {
        floor: HQ_RANGE.floor,
        active,
        time,
        hits,
        shots,
        finished,
        total: targets.length,
        cleared: targets.filter((t) => t.health <= 0).length,
        best,
      };
    },
  };
}
