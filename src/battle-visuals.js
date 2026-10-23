import * as THREE from 'three';
import { ENEMY_TYPES, ARENA, BATTLE_COVERS } from './battle-session.js';
export function createBattleVisuals(scene, collision, groundHeight = () => 0) {
  const root = new THREE.Group();
  root.name = 'Combat robots and energy effects';
  scene.add(root);
  const cyan = new THREE.MeshBasicMaterial({ color: '#0bd8ee', toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: '#c5ffff', toneMapped: false });
  const dark = new THREE.MeshToonMaterial({ color: '#263b4d' }),
    armor = new THREE.MeshToonMaterial({ color: '#c4d2d5' });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffc36a', toneMapped: false });
  const faint = new THREE.MeshBasicMaterial({
    color: '#0bd8ee',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.IcosahedronGeometry(1, 1),
    ring: new THREE.TorusGeometry(1, 0.025, 5, 40),
    beam: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  };
  function mesh(g, m, p, scale, parent = root) {
    const o = new THREE.Mesh(g, m);
    o.position.set(...p);
    o.scale.set(...scale);
    parent.add(o);
    return o;
  }
  for (const cover of BATTLE_COVERS) {
    const y = groundHeight(cover.x, cover.z);
    mesh(geo.box, armor, [cover.x, y + cover.h / 2, cover.z], [cover.w, cover.h, cover.d]);
    mesh(geo.box, cyan, [cover.x, y + cover.h + 0.015, cover.z], [cover.w, 0.025, cover.d + 0.03]);
    collision?.add({ ...cover, y });
  }
  const robots = Array.from({ length: 16 }, () => {
    const group = new THREE.Group(),
      body = new THREE.Group();
    root.add(group);
    group.add(body);
    mesh(geo.box, dark, [0, 0.58, 0], [0.95, 0.7, 0.65], body);
    const shell = mesh(geo.sphere, armor, [0, 1.25, 0], [0.62, 0.7, 0.45], body);
    mesh(geo.box, dark, [0, 1.92, 0], [0.44, 0.35, 0.4], body);
    mesh(geo.box, cyan, [0, 1.94, -0.23], [0.32, 0.065, 0.035], body);
    const cannon = mesh(geo.beam, dark, [-0.7, 1.2, -0.4], [0.35, 0.9, 0.35], body);
    cannon.rotation.x = Math.PI / 2;
    const shoulders = [-1, 1].map((side) =>
      mesh(geo.box, armor, [side * 0.75, 1.55, 0], [0.6, 0.5, 0.65], body),
    );
    const fins = [-1, 1].map((side) => mesh(geo.box, cyan, [side * 0.25, 2.1, 0.1], [0.04, 0.5, 0.25], body));
    const arms = [-1, 1].map((side) => mesh(geo.box, armor, [side * 0.76, 1.16, 0], [0.25, 0.9, 0.3], body));
    const legs = [-1, 1].map((side) => mesh(geo.box, dark, [side * 0.28, 0.33, 0], [0.25, 0.65, 0.3], body));
    const core = mesh(geo.sphere, cyan, [0, 1.58, -0.57], [0.24, 0.24, 0.13], body);
    const halo = mesh(geo.sphere, faint, [0, 1.58, -0.57], [0.36, 0.36, 0.2], body);
    const tell = mesh(geo.ring, amber, [0, 0.08, 0], [1, 1, 1], group);
    tell.rotation.x = -Math.PI / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas),
      label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true, toneMapped: false }),
      );
    label.scale.set(3.8, 0.95, 1);
    group.add(label);
    return {
      group,
      body,
      shell,
      arms,
      legs,
      core,
      halo,
      tell,
      label,
      canvas,
      texture,
      cannon,
      shoulders,
      fins,
      signature: '',
    };
  });
  const enemyBullets = new THREE.InstancedMesh(geo.sphere, amber, 192);
  enemyBullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  enemyBullets.frustumCulled = false;
  enemyBullets.count = 0;
  root.add(enemyBullets);
  const blade = new THREE.Group();
  root.add(blade);
  mesh(geo.box, dark, [0, 0.05, 0], [0.1, 0.25, 0.1], blade);
  mesh(geo.box, cyan, [0, 0.2, 0], [0.32, 0.035, 0.12], blade);
  mesh(geo.box, cyan, [0, 0.81, 0], [0.065, 1.2, 0.09], blade);
  mesh(geo.box, white, [0, 0.81, 0], [0.018, 1.18, 0.092], blade);
  mesh(geo.box, faint, [0, 0.81, 0], [0.14, 1.3, 0.16], blade);
  const shield = mesh(geo.sphere, faint, [0, 0, 0], [1.05, 1.2, 0.18]);
  const shieldEdge = mesh(geo.ring, cyan, [0, 0, 0], [1.05, 1.2, 1]);
  const wounds = new THREE.InstancedMesh(geo.sphere, cyan, 48);
  wounds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wounds.frustumCulled = false;
  wounds.count = 0;
  root.add(wounds);
  const waypoint = mesh(geo.ring, cyan, [0, 0, 0], [5, 5, 5]);
  waypoint.rotation.x = -Math.PI / 2;
  const arenaLine = mesh(
    geo.ring,
    faint,
    [ARENA.x, 0.12, ARENA.z],
    [ARENA.radius, ARENA.radius, ARENA.radius],
  );
  arenaLine.rotation.x = -Math.PI / 2;
  const bailout = mesh(geo.beam, faint, [0, 0, 0], [1, 1, 1]);
  const pool = Array.from({ length: 40 }, () => {
    const material = faint.clone(),
      item = mesh(geo.sphere, material, [0, 0, 0], [1, 1, 1]);
    item.visible = false;
    return { item, life: 0, max: 1, radius: 1, type: '' };
  });
  let cursor = 0,
    clock = 0,
    glow = 0.7,
    reduced = false;
  const transform = new THREE.Object3D(),
    up = new THREE.Vector3(0, 1, 0),
    axis = new THREE.Vector3();
  function event(type, detail = {}) {
    if (
      ![
        'explosion',
        'enemyHit',
        'enemyDown',
        'parry',
        'block',
        'guardBreak',
        'dodge',
        'wound',
        'sever',
        'activate',
        'swing',
      ].includes(type)
    )
      return;
    const fx = pool[cursor++ % pool.length];
    fx.type = type;
    fx.max = fx.life = type === 'explosion' ? 0.55 : type === 'enemyDown' ? 0.65 : 0.28;
    fx.radius = detail.radius ?? (type === 'parry' ? 2.2 : type === 'enemyDown' ? 2 : 1);
    fx.item.position.copy(detail.position ?? { x: 0, y: -1000, z: 0 });
    fx.item.material.color.set(type === 'guardBreak' ? '#ffc36a' : '#0bd8ee');
    fx.item.visible = true;
  }
  function update(
    dt,
    session,
    action,
    body,
    p,
    hand,
    bladeVisible = false,
    avatarVisible = true,
    firstPerson = false,
  ) {
    clock += dt;
    robots.forEach((r, i) => {
      const e = session.enemies[i];
      r.group.visible = !!e;
      if (!e) return;
      const def = ENEMY_TYPES[e.type],
        size = def.height / 2.1;
      r.group.position.copy(e.feet);
      r.group.rotation.y = e.yaw;
      r.body.scale.set(size * (e.type === 'armored' ? 1.25 : 1), size, size);
      const dead = e.health <= 0,
        death = dead ? Math.max(0.02, e.death / 0.65) : 1;
      r.body.scale.multiplyScalar(death);
      r.body.position.y = dead ? (1 - death) * 0.7 : Math.sin(clock * 4 + i) * 0.025;
      const walk = e.state === 'chase' || e.state === 'search';
      r.legs.forEach(
        (leg, n) => (leg.rotation.x = walk ? Math.sin(clock * def.speed * 1.7 + n * Math.PI) * 0.5 : 0),
      );
      r.arms.forEach((arm, n) => {
        arm.rotation.x =
          e.state === 'telegraph'
            ? -1.1
            : e.state === 'recover'
              ? 0.9
              : walk
                ? Math.sin(clock * def.speed * 1.7 + n * Math.PI) * 0.3
                : 0;
      });
      r.cannon.visible = e.type === 'ranged';
      r.shoulders.forEach((o) => (o.visible = e.type === 'armored'));
      r.fins.forEach((o) => (o.visible = e.type === 'fast'));
      r.core.position.set(0, (def.height * 0.73) / size, -(def.radius + 0.09) / size);
      r.halo.position.copy(r.core.position);
      r.shell.material = e.flash > 0 ? white : armor;
      r.core.material = e.state === 'telegraph' ? amber : cyan;
      r.halo.visible = glow > 0;
      r.tell.visible = e.state === 'telegraph';
      r.tell.scale.setScalar(e.attack?.ranged ? 1.7 : def.reach);
      r.tell.material = amber;
      r.label.position.y = def.height + 0.65;
      const labelScale = Math.min(
        1,
        Math.max(0.04, Math.hypot(e.feet.x - p.position.x, e.feet.z - p.position.z) / 18),
      );
      r.label.scale.set(3.8 * labelScale, 0.95 * labelScale, 1);
      r.label.visible = !dead;
      const signature = `${e.id}:${Math.ceil(e.health)}:${e.state}`;
      if (signature !== r.signature) {
        r.signature = signature;
        const c = r.canvas.getContext('2d');
        c.clearRect(0, 0, 256, 64);
        c.fillStyle = '#08212be6';
        c.fillRect(0, 0, 256, 64);
        c.font = '22px sans-serif';
        c.fillStyle = e.state === 'telegraph' ? '#ffce82' : '#d3fcff';
        c.fillText(`${e.name}${e.state === 'telegraph' ? ' !' : ''}`, 8, 27);
        c.fillStyle = '#25454f';
        c.fillRect(8, 42, 240, 10);
        c.fillStyle = '#16d4e8';
        c.fillRect(8, 42, (240 * e.health) / e.maxHealth, 10);
        r.texture.needsUpdate = true;
      }
    });
    enemyBullets.count = session.bullets.length;
    session.bullets.forEach((b, i) => {
      transform.position.copy(b.position);
      transform.scale.set(0.09, 0.09, 0.3);
      axis.set(b.velocity.x, b.velocity.y, b.velocity.z).normalize();
      transform.quaternion.setFromUnitVectors(up, axis);
      transform.updateMatrix();
      enemyBullets.setMatrixAt(i, transform.matrix);
    });
    enemyBullets.instanceMatrix.needsUpdate = true;
    blade.visible = bladeVisible && (avatarVisible || firstPerson) && session.phase !== 'bailout';
    if (blade.visible) {
      blade.position.copy(hand.position ?? hand);
      blade.quaternion.copy(hand.quaternion ?? new THREE.Quaternion());
      if (!firstPerson) blade.rotateZ(Math.PI / 2);
    }
    shield.visible = shieldEdge.visible =
      action.guarding && (avatarVisible || firstPerson) && session.phase !== 'bailout';
    if (shield.visible) {
      const x = p.position.x - Math.sin(p.yaw) * 0.75,
        z = p.position.z - Math.cos(p.yaw) * 0.75;
      shield.position.set(x, p.position.y + 1, z);
      shield.rotation.set(0, p.yaw, 0);
      shieldEdge.position.copy(shield.position);
      shieldEdge.rotation.copy(shield.rotation);
    }
    let woundCount = 0;
    for (const [id, part] of Object.entries(body.parts)) {
      if (part.health >= part.maximum) continue;
      const side = id.startsWith('left') ? -1 : 1,
        offset = /Arm/.test(id) ? 0.34 * side : /Leg/.test(id) ? 0.16 * side : 0,
        y = /Leg/.test(id) ? 0.65 : id === 'head' ? 1.55 : 1.12;
      for (let n = 0; n < (part.destroyed ? 7 : 3); n++) {
        const t = (clock * 1.6 + n * 0.18) % 1;
        transform.position.set(
          p.position.x + Math.cos(p.yaw) * offset + Math.sin(n * 2) * t * 0.12,
          p.position.y + y + t * 0.6,
          p.position.z - Math.sin(p.yaw) * offset + Math.cos(n * 2) * t * 0.12,
        );
        transform.quaternion.identity();
        transform.scale.setScalar((1 - t) * 0.035);
        transform.updateMatrix();
        wounds.setMatrixAt(woundCount++, transform.matrix);
      }
    }
    wounds.count = avatarVisible ? woundCount : 0;
    wounds.instanceMatrix.needsUpdate = true;
    waypoint.visible = !!session.waypoint;
    if (session.waypoint) {
      waypoint.position.set(session.waypoint.x, 0.18, session.waypoint.z);
      waypoint.rotation.z = clock * 0.4;
    }
    arenaLine.visible = session.phase === 'active';
    bailout.visible = session.phase === 'bailout';
    if (bailout.visible) {
      bailout.position.set(p.position.x, p.position.y + 14, p.position.z);
      bailout.scale.set(2 * (1 - session.bailoutProgress) + 0.1, 28, 2 * (1 - session.bailoutProgress) + 0.1);
    }
    for (const fx of pool) {
      if (fx.life <= 0) continue;
      fx.life = Math.max(0, fx.life - dt);
      const t = 1 - fx.life / fx.max;
      fx.item.visible = fx.life > 0;
      fx.item.scale.setScalar(Math.max(0.02, fx.radius * (reduced ? 0.65 : 0.2 + t * 0.8)));
      fx.item.material.opacity = (1 - t) * (0.16 + glow * 0.18);
    }
    faint.opacity = 0.09 + glow * 0.16;
  }
  return {
    event,
    update,
    configure(s) {
      glow = s.glow;
      reduced = s.reducedMotion;
    },
    hide() {
      robots.forEach((r) => (r.group.visible = false));
      enemyBullets.count = wounds.count = 0;
      blade.visible =
        shield.visible =
        shieldEdge.visible =
        waypoint.visible =
        arenaLine.visible =
        bailout.visible =
          false;
      pool.forEach((fx) => {
        fx.life = 0;
        fx.item.visible = false;
      });
    },
    get diagnostics() {
      return {
        enemyCapacity: robots.length,
        bulletCapacity: 192,
        effectCapacity: pool.length,
        bladeVisible: blade.visible,
        shieldVisible: shield.visible,
        activeEffects: pool.filter((f) => f.life > 0).length,
        activeEnemies: robots.filter((r) => r.group.visible).length,
      };
    },
  };
}
