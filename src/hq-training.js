import * as THREE from 'three';
import { createCollisionIndex } from './city-layout.js';

// The virtual arena is independent of the physical headquarters floor plan.
export const HQ_TRAINING_LAYOUT = Object.freeze({
  code: 'SIM-01',
  y: 1000,
  halfSize: 90,
  wallHeight: 36,
  platformHeight: 6,
  stairCenters: [-64, 64],
  stairSteps: 40,
  spawn: { x: 0, y: 1000, z: 30 },
});

function simulationMaterial(color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: 0.09,
  });
  // World-aligned lines join across walls, steps and buildings. They are shaded
  // on the actual surfaces, so there is no second coplanar grid mesh to flicker.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hqGridColor = { value: new THREE.Color('#43ddf5') };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vHQGridWorld;\nvarying vec3 vHQGridNormal;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 hqGridVertex = vec4(transformed, 1.0);
        vec3 hqGridNormal = objectNormal;
        #ifdef USE_INSTANCING
          hqGridVertex = instanceMatrix * hqGridVertex;
          hqGridNormal = mat3(instanceMatrix) * hqGridNormal;
        #endif
        vHQGridWorld = (modelMatrix * hqGridVertex).xyz;
        vHQGridNormal = normalize(mat3(modelMatrix) * hqGridNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vHQGridWorld;\nvarying vec3 vHQGridNormal;\nuniform vec3 hqGridColor;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 hqP = vHQGridWorld - vec3(0.0, ${HQ_TRAINING_LAYOUT.y.toFixed(1)}, 0.0);
        vec3 hqN = abs(normalize(vHQGridNormal));
        vec2 hqUV = hqN.y > 0.5 ? hqP.xz : (hqN.x > 0.5 ? hqP.zy : hqP.xy);
        vec2 hqFineUV = hqUV / 2.0;
        vec2 hqFine = abs(fract(hqFineUV + 0.5) - 0.5) / max(fwidth(hqFineUV), vec2(0.0001));
        vec2 hqMajorUV = hqUV / 10.0;
        vec2 hqMajor = abs(fract(hqMajorUV + 0.5) - 0.5) / max(fwidth(hqMajorUV), vec2(0.0001));
        float hqGrid = max((1.0 - min(min(hqFine.x, hqFine.y), 1.0)) * 0.42,
                           (1.0 - min(min(hqMajor.x, hqMajor.y), 1.0)) * 0.76);
        diffuseColor.rgb = mix(diffuseColor.rgb, hqGridColor, hqGrid * 0.8);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hqGridColor * hqGrid * 0.65;',
      );
  };
  material.customProgramCacheKey = () => 'border-simulation-world-grid-v1';
  return material;
}

export function createHQTraining({ scene, worldObjects, motor, onTransition, notify, storage }) {
  const { y, halfSize, wallHeight, platformHeight, stairSteps } = HQ_TRAINING_LAYOUT;
  const root = new THREE.Group();
  root.name = 'SIM-01 模擬訓練空間';
  const virtualScene = new THREE.Scene();
  virtualScene.background = new THREE.Color('#284b70');
  virtualScene.fog = new THREE.Fog('#486f96', 110, 300);
  virtualScene.add(root);
  for (const light of scene.children.filter((o) => o.isLight)) {
    const copy = light.clone();
    copy.castShadow = false;
    virtualScene.add(copy);
  }
  // Keep the simulation readable even in the headquarters' darker night mode.
  virtualScene.add(new THREE.HemisphereLight('#bdedff', '#526b87', 1.35));
  const fill = new THREE.DirectionalLight('#dceeff', 1.5);
  fill.position.set(-45, y + 70, 30);
  fill.target.position.set(0, y, 0);
  virtualScene.add(fill, fill.target);

  let visualObjects = [];
  root.visible = false;
  const index = createCollisionIndex(),
    targets = [],
    meshes = [];
  const batches = new Map(),
    geometry = new THREE.BoxGeometry(1, 1, 1);
  let boxCount = 0;
  let active = false,
    anchor = null,
    time = 0,
    hits = 0,
    shots = 0,
    finished = false,
    best = 0;
  try {
    best = Number(storage?.getItem('mikado-hq-training-best')) || 0;
  } catch {}
  function box(x, by, z, w, h, d, color, collide = true) {
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color).push({ x, y: by + h / 2, z, w, h, d });
    boxCount++;
    if (collide) return index.add({ x, y: by, z, w, h, d });
    return null;
  }
  function rail(x, by, z, w, d) {
    index.add({ x, y: by, z, w, h: 1.1, d });
    for (const height of [0.48, 1.04]) box(x, by + height, z, w, 0.045, d, '#8eb7ce', false);
    const alongX = w >= d,
      length = Math.max(w, d),
      count = Math.ceil(length / 2);
    for (let i = 0; i <= count; i++)
      box(
        x + (alongX ? (i / count - 0.5) * length : 0),
        by,
        z + (alongX ? 0 : (i / count - 0.5) * length),
        0.07,
        1.08,
        0.07,
        '#8eb7ce',
        false,
      );
  }
  function sign(text, x, sy, z, w = 16, h = 1.1, turn = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round((1024 * h) / w);
    const context = canvas.getContext('2d');
    context.fillStyle = '#173a59';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `600 ${Math.round(canvas.height * 0.6)}px sans-serif`;
    context.fillStyle = '#b6f6ff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 22);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, sy, z);
    mesh.rotation.y = turn;
    root.add(mesh);
  }

  box(0, y - 0.4, 0, 180, 0.4, 180, '#7695b4');
  // Enclosing facades include aligned ribs, window bays and doorway panels,
  // matching the concrete-and-blue multi-level hall in the supplied stills.
  for (const side of [-1, 1]) {
    box(side * halfSize, y, 0, 1.2, wallHeight, 181.2, '#9bb2c8');
    box(0, y, side * halfSize, 181.2, wallHeight, 1.2, '#b5c4d0');
    for (let level = 0; level < 6; level++) {
      const by = y + level * 6;
      box(0, by + 5.7, side * 89.2, 178, 0.22, 0.35, '#7698b8');
      box(side * 89.2, by + 5.7, 0, 0.35, 0.22, 178, '#7698b8');
      for (let u = -72; u <= 72; u += 18) {
        box(u, by + 1.8, side * 89.2, 5.8, 2.4, 0.2, '#294b70');
        box(side * 89.2, by + 1.8, u, 0.2, 2.4, 5.8, '#294b70');
        box(u + 8.5, by, side * 89.1, 0.32, 5.7, 0.45, '#7698b8');
        box(side * 89.1, by, u + 8.5, 0.45, 5.7, 0.32, '#7698b8');
      }
    }
  }
  // Opposing broad stair approaches and continuous observation balconies.
  for (const side of [-1, 1]) {
    box(0, y, side * 75, 178, platformHeight, 30, '#426e96');
    box(side * 84, y + platformHeight - 0.28, 0, 10, 0.28, 120, '#426e96');
    rail(side * 78.8, y + platformHeight, 0, 0.09, 119);
    // Stair openings stay clear in the long balcony rail.
    for (const [a, b] of [
      [-89, -75.2],
      [-52.8, 52.8],
      [75.2, 89],
    ])
      rail((a + b) / 2, y + platformHeight, side * 60.15, b - a, 0.09);
    for (const x of HQ_TRAINING_LAYOUT.stairCenters) {
      for (let step = 0; step < stairSteps; step++) {
        const h = ((step + 1) * platformHeight) / stairSteps;
        box(x, y, side * (30 + ((step + 0.5) * 30) / stairSteps), 22, h, 30 / stairSteps + 0.002, '#4b7da4');
      }
      for (const edge of [x - 11.1, x + 11.1])
        for (let step = 0; step < 10; step++)
          rail(edge, y + (step * platformHeight) / 10, side * (30 + (step + 0.5) * 3), 0.08, 3);
    }
    for (const x of [-30, 0, 30]) {
      box(x, y, side * 59.75, 4.2, 3.3, 0.35, '#23465e');
      box(x, y + 3.3, side * 59.55, 5, 0.28, 0.5, '#bad4e2');
      for (const dx of [-2.3, 2.3]) box(x + dx, y, side * 59.55, 0.25, 3.6, 0.5, '#bad4e2');
    }
  }
  for (const [x, z, w, h, d] of [
    [-32, 10, 18, 8, 14],
    [34, -6, 14, 12, 18],
  ]) {
    box(x, y, z, w, h, d, '#b6c6d4');
    for (let level = 0; level < h / 3; level++) {
      box(x, y + level * 3 + 2.1, z + d / 2 + 0.09, w - 1.4, 0.3, 0.16, '#3f6d91');
      for (const dx of [-w * 0.3, 0, w * 0.3])
        box(x + dx, y + level * 3 + 0.8, z + d / 2 + 0.1, w * 0.19, 1.1, 0.16, '#2b4a6c');
    }
    box(x, y + h, z, w + 0.5, 0.22, d + 0.5, '#7f9db8');
  }
  for (const [x, z] of [
    [-19, -10],
    [20, 19],
    [0, -8],
  ])
    box(x, y, z, 6, 1.05, 2, '#5b7f9e');
  sign('SIM-01　模擬訓練空間', 0, y + 12.6, -88.5, 30, 1.7);
  sign('觀察平台　← 西側樓梯　｜　東側樓梯 →', 0, y + 4.4, -59.45, 33, 1.1);
  sign('SIM-01 / RETURN TO HEADQUARTERS', 0, y + 4.4, 59.45, 34, 1.1, Math.PI);

  const matrix = new THREE.Matrix4();
  for (const [color, list] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, simulationMaterial(color), list.length);
    mesh.name = 'SIM-01 gridded architecture';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      matrix.makeScale(p.w, p.h, p.d);
      matrix.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
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
    g.add(
      new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: '#36e8f6' })),
    );
    g.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.035, 6, 32),
        new THREE.MeshBasicMaterial({ color: '#66e8f9' }),
      ),
    );
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
    targets.forEach((t, i) => {
      t.health = t.maxHealth;
      meshes[i].visible = true;
    });
  }
  function start(view) {
    if (active) return;
    anchor = { position: { ...motor.position }, yaw: view.yaw, pitch: view.pitch };
    active = true;
    reset();
    visualObjects = scene.children.filter((o) => !o.isLight && !worldObjects.includes(o));
    for (const o of visualObjects) virtualScene.add(o);
    root.visible = true;
    motor.teleport({ ...HQ_TRAINING_LAYOUT.spawn }, 0);
    onTransition(0, 0);
    label.hidden = false;
    notify('SIM-01 模擬訓練空間：擊破六靶 · F 返回基地 · R 重試');
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
          storage?.setItem('mikado-hq-training-best', String(best));
        } catch {}
        notify(`六靶擊破 · ${time.toFixed(1)} 秒 · ${score} 分 · F 返回／R 重試`);
      }
      return true;
    },
    retry() {
      if (!active) return;
      reset();
      motor.teleport({ ...HQ_TRAINING_LAYOUT.spawn }, 0);
      onTransition(0, 0);
    },
    update(dt) {
      if (!active) return;
      if (!finished) time += Math.max(0, dt);
      meshes.forEach((m, i) => {
        m.visible = targets[i].health > 0;
        m.rotation.y += dt * 0.5;
      });
      label.textContent = `SIM-01 模擬訓練空間 ｜ ${targets.filter((t) => t.health <= 0).length}/6 ｜ ${time.toFixed(1)} s ｜ F 返回基地`;
    },
    get active() {
      return active;
    },
    get snapshot() {
      return {
        active,
        code: HQ_TRAINING_LAYOUT.code,
        time,
        hits,
        shots,
        best,
        cleared: targets.filter((t) => t.health <= 0).length,
        finished,
        geometry: {
          boxes: boxCount,
          batches: batches.size,
          stairs: 4,
          steps: stairSteps * 4,
          platforms: 4,
          gridded: true,
        },
      };
    },
  };
}
