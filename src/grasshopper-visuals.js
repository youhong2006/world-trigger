import * as THREE from 'three';
export function createGrasshopperVisuals(scene) {
  const root = new THREE.Group();
  root.name = 'Cyan trion effects';
  scene.add(root);
  const groups = new Map(),
    particles = [];
  let glow = 0.7,
    reduced = false;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(130,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(0,213,240,.8)');
  gradient.addColorStop(1, 'rgba(0,185,230,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const frameGeometry = new THREE.BufferGeometry().setFromPoints(
    [
      [-1, 0, -0.8],
      [1, 0, -0.8],
      [1, 0, 0.8],
      [-1, 0, 0.8],
      [-1, 0, -0.8],
    ].map((v) => new THREE.Vector3(...v)),
  );
  const panelGeometry = new THREE.PlaneGeometry(1.3, 1.06);
  panelGeometry.rotateX(-Math.PI / 2);
  const sphereGeometry = new THREE.SphereGeometry(0.07, 12, 8);
  function sprite(scale) {
    const mesh = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: '#20edff',
        toneMapped: false,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.scale.setScalar(scale);
    return mesh;
  }
  const ball = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({ color: '#20dff5', toneMapped: false }),
  );
  const halo = sprite(0.46);
  ball.add(halo);
  root.add(ball);
  ball.visible = false;
  const preview = new THREE.Line(
    frameGeometry,
    new THREE.LineBasicMaterial({ color: '#47e9f4', toneMapped: false, transparent: true, opacity: 0.5 }),
  );
  root.add(preview);
  preview.visible = false;
  function createPad() {
    const group = new THREE.Group();
    const border = new THREE.Line(
      frameGeometry,
      new THREE.LineBasicMaterial({ color: '#17dff2', toneMapped: false, transparent: true, opacity: 1 }),
    );
    const panel = new THREE.Mesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({
        color: '#04bdd7',
        toneMapped: false,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const light = sprite(2.7);
    light.rotation.x = -Math.PI / 2;
    group.add(light, border, panel);
    root.add(group);
    return group;
  }
  function event(type, detail = {}) {
    if (type !== 'launch') return;
    const p = detail.pad;
    for (let i = 0; i < (reduced ? 4 : 12); i++) {
      const mesh = sprite(0.1 + Math.random() * 0.1);
      mesh.position.set(p.x, p.y + 0.1, p.z);
      root.add(mesh);
      particles.push({
        mesh,
        age: 0,
        v: new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4),
      });
    }
  }
  function update(dt, snapshot, hand, placement, visible) {
    root.visible = visible;
    if (!visible) return;
    ball.visible = snapshot.charging;
    if (ball.visible) {
      ball.position.copy(hand);
      ball.scale.setScalar(1 + Math.sin(snapshot.time * 8) * 0.06);
      halo.material.opacity = glow * 0.8;
    }
    preview.visible = snapshot.charging && !!placement;
    if (placement) {
      preview.position.set(placement.x, placement.y + 0.03, placement.z);
      preview.rotation.y = placement.yaw;
      preview.material.color.set(placement.valid ? '#47e9f4' : '#ffb775');
    }
    const live = new Set();
    for (const pad of snapshot.pads) {
      live.add(pad.id);
      let group = groups.get(pad.id);
      if (!group) {
        group = createPad();
        groups.set(pad.id, group);
      }
      group.position.set(pad.x, pad.y + 0.02, pad.z);
      group.rotation.y = pad.yaw;
      const fade = pad.used
        ? Math.max(0, 1 - (snapshot.time - pad.usedAt) / 0.35)
        : Math.min(1, pad.expires - snapshot.time);
      group.scale.setScalar(pad.used ? 1 + (snapshot.time - pad.usedAt) * 0.8 : 1);
      group.children[0].material.opacity = fade * glow * 0.3;
      group.children[1].material.opacity = fade;
      group.children[2].material.opacity = fade * (pad.used ? 1 : 0.65);
    }
    for (const [id, group] of groups)
      if (!live.has(id)) {
        for (const child of group.children) child.material.dispose();
        root.remove(group);
        groups.delete(id);
      }
    for (let i = particles.length - 1; i >= 0; i--) {
      const item = particles[i];
      item.age += dt;
      item.mesh.position.addScaledVector(item.v, dt);
      item.mesh.material.opacity = Math.max(0, 1 - item.age / 0.5) * glow;
      if (item.age >= 0.5) {
        root.remove(item.mesh);
        item.mesh.material.dispose();
        particles.splice(i, 1);
      }
    }
  }
  return {
    update,
    event,
    configure(settings) {
      glow = settings.glow;
      reduced = settings.reducedMotion;
    },
    hide() {
      root.visible = false;
    },
  };
}
