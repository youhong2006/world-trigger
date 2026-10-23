import * as THREE from 'three';
import { RANGE_TARGETS } from './range-challenge.js';
export function createShootingVisuals(scene, collision) {
  const root = new THREE.Group();
  root.name = 'Shooting range and trion weapons';
  scene.add(root);
  const cyan = new THREE.MeshBasicMaterial({ color: '#10d7ed', toneMapped: false });
  const faint = new THREE.MeshBasicMaterial({
    color: '#13d4eb',
    transparent: true,
    opacity: 0.18,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(255, 100, 64, 25),
    new THREE.MeshStandardMaterial({
      color: '#687c80',
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(95, 0.06, 350);
  // Keep the thin overlay out of the kilometre-scale shadow map to avoid self-shadow bands.
  deck.receiveShadow = false;
  root.add(deck);
  for (const { x, z, w, d, h } of [
    { x: 75, z: 390, w: 12, d: 2, h: 2.2 },
    { x: 110, z: 395, w: 10, d: 2, h: 3 },
  ]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: '#536878', roughness: 0.9 }),
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    collision.add({ x, z, w, d, y: 0, h });
  }
  const targetGroups = new Map();
  for (const t of RANGE_TARGETS) {
    const g = new THREE.Group();
    g.position.copy(t.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(t.radius, 0.045, 6, 40), cyan);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 14, 10),
      new THREE.MeshBasicMaterial({ color: '#31e9f5', toneMapped: false }),
    );
    g.add(core);
    const cage = new THREE.Mesh(
      new THREE.SphereGeometry(t.radius, 12, 8),
      new THREE.MeshBasicMaterial({
        color: '#3bcbda',
        wireframe: true,
        transparent: true,
        opacity: 0.16,
        toneMapped: false,
      }),
    );
    g.add(cage);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, t.position.y, 5),
      new THREE.MeshStandardMaterial({ color: '#365667' }),
    );
    pole.position.y = -t.position.y / 2;
    g.add(pole);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    label.position.y = t.radius + 0.65;
    label.scale.set(4, 1.25, 1);
    g.add(label);
    root.add(g);
    targetGroups.set(t.id, { group: g, core, ring, cage, canvas, texture, lastHealth: -1 });
  }
  const bullets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.075, 0.48), cyan, 256);
  bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bullets.frustumCulled = false;
  bullets.count = 0;
  root.add(bullets);
  const glows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.17, 0.7), faint, 256);
  glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glows.frustumCulled = false;
  glows.count = 0;
  root.add(glows);
  const cubeGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.16),
    cubes = {},
    bursts = [];
  const transform = new THREE.Object3D(),
    forward = new THREE.Vector3(0, 0, 1),
    velocity = new THREE.Vector3();
  for (const side of ['main', 'sub']) {
    const g = new THREE.Group();
    const cells = [];
    for (let n = 0; n < 27; n++) {
      const c = new THREE.Mesh(cubeGeometry, cyan);
      const halo = new THREE.Mesh(cubeGeometry, faint);
      halo.scale.setScalar(1.22);
      c.add(halo);
      g.add(c);
      cells.push(c);
    }
    g.visible = false;
    root.add(g);
    cubes[side] = { group: g, cells };
  }
  let glow = 0.7,
    reduced = false;
  function event(type, detail) {
    if (type !== 'impact') return;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({
        color: detail.targetId ? '#b0ffff' : '#ffbc80',
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    mesh.position.copy(detail.position);
    root.add(mesh);
    bursts.push({ mesh, age: 0 });
    if (bursts.length > 40) {
      const old = bursts.shift();
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
      root.remove(old.mesh);
    }
  }
  function update(dt, shots, targets, anchors, visible = true) {
    bullets.visible = glows.visible = visible;
    const list = shots.projectiles;
    bullets.count = glows.count = Math.min(256, list.length);
    glows.material.opacity = glow * 0.3;
    list.slice(0, 256).forEach((p, n) => {
      transform.position.copy(p.position);
      velocity.copy(p.velocity).normalize();
      transform.quaternion.setFromUnitVectors(forward, velocity);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      bullets.setMatrixAt(n, transform.matrix);
      glows.setMatrixAt(n, transform.matrix);
    });
    bullets.instanceMatrix.needsUpdate = glows.instanceMatrix.needsUpdate = true;
    for (const side of ['main', 'sub']) {
      const g = cubes[side],
        queued = shots.queued.find((q) => q.side === side),
        batch = shots.prepared[side] ?? queued;
      g.group.visible = visible && !!batch;
      if (!batch) continue;
      g.group.position.copy(queued?.position ?? anchors[side]);
      g.group.rotation.y = shots.time * 0.4;
      const dim = Math.round(Math.cbrt(batch.params.count));
      g.cells.forEach((cell, n) => {
        cell.visible = queued ? queued.indices.includes(n) : n < batch.params.count;
        if (cell.visible)
          cell.position.set(
            ((n % dim) - (dim - 1) / 2) * 0.2,
            ((Math.floor(n / dim) % dim) - (dim - 1) / 2) * 0.2,
            (Math.floor(n / (dim * dim)) - (dim - 1) / 2) * 0.2,
          );
      });
    }
    for (const entry of targetGroups.values()) entry.group.visible = false;
    for (const t of targets) {
      const entry = targetGroups.get(t.id);
      if (!entry) continue;
      entry.group.visible = true;
      entry.core.visible = t.health > 0;
      entry.ring.material = t.health > 0 ? cyan : faint;
      entry.cage.material.opacity = t.health > 0 ? 0.16 : 0.04;
      if (entry.lastHealth !== t.health) {
        entry.lastHealth = t.health;
        const ctx = entry.canvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 80);
        ctx.fillStyle = '#082738e6';
        ctx.fillRect(0, 0, 256, 80);
        ctx.fillStyle = t.health > 0 ? '#9ff8ff' : '#6f97a9';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${t.id}  ${Math.ceil(t.health)} / ${t.maxHealth}`, 128, 34);
        ctx.fillStyle = '#224957';
        ctx.fillRect(18, 54, 220, 7);
        ctx.fillStyle = '#13d8e9';
        ctx.fillRect(18, 54, (220 * t.health) / t.maxHealth, 7);
        entry.texture.needsUpdate = true;
      }
    }
    for (let n = bursts.length - 1; n >= 0; n--) {
      const b = bursts[n];
      b.age += dt;
      b.mesh.scale.setScalar(1 + b.age * (reduced ? 8 : 18));
      b.mesh.material.opacity = Math.max(0, 1 - b.age / 0.22);
      if (b.age > 0.22) {
        root.remove(b.mesh);
        b.mesh.material.dispose();
        b.mesh.geometry.dispose();
        bursts.splice(n, 1);
      }
    }
  }
  return {
    update,
    event,
    configure(s) {
      glow = s.glow;
      reduced = s.reducedMotion;
    },
    hideWeapons() {
      bullets.visible = glows.visible = false;
      for (const v of Object.values(cubes)) v.group.visible = false;
    },
  };
}
