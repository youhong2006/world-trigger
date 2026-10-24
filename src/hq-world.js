import * as THREE from 'three';
import { BASE, createCollisionIndex } from './city-layout.js';
import { HQ, envelopeAt } from './hq-layout.js';
import { createHeadquarters } from './headquarters.js';
import { createHQInterior } from './hq-interior.js';
import { createHQRange } from './hq-range.js';

export const HQ_WORLD_ENTRY = Object.freeze({ x: 0, y: 0, z: 230 });
export const HQ_CITY_RETURN = Object.freeze({ x: 0, y: 0, z: 278 });

// This datum belongs to the independent headquarters; city terrain and river
// surfaces must never become supports for its basement or simulation rooms.
export function headquartersGroundHeight(x, z) {
  const e = envelopeAt(0);
  if (x > e.left && x < e.right && z > e.back && z < e.front)
    return x < e.innerLeft || x > e.innerRight || z < e.innerBack || z > e.innerFront
      ? HQ.basementY
      : HQ.floor;
  return HQ.floor;
}

/** A real, separate scene and collision world. City meshes are never added here. */
export function createHQWorld({ storage, notify = () => {} } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'BORDER independent headquarters world';
  scene.background = new THREE.Color('#0b1c2e');
  scene.fog = new THREE.Fog('#193346', 1600, 5000);
  const index = createCollisionIndex({ groundHeight: headquartersGroundHeight });
  const ambient = new THREE.HemisphereLight('#d6eaff', '#3a514c', 1.75);
  const sun = new THREE.DirectionalLight('#f0f7ff', 2.05);
  sun.position.set(-1200, 2000, 1400);
  sun.target.position.set(0, 150, HQ.centerZ);
  // The city owns its own cached sunlight shadows. This world is lit separately.
  sun.castShadow = false;
  scene.add(ambient, sun, sun.target);

  const cube = new THREE.BoxGeometry(1, 1, 1),
    materials = new Map();
  const material = (color) => {
    if (!materials.has(color))
      materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    return materials.get(color);
  };
  const scale = BASE.scale;
  const offset = new THREE.Vector3(-23 * scale, 0, HQ.centerZ + 117 * scale);
  const shell = new THREE.Group();
  shell.name = 'BORDER independent world hollow shell';
  shell.scale.setScalar(scale);
  shell.position.copy(offset);
  scene.add(shell);
  const convert = (volume) => ({
    ...volume,
    x: volume.x * scale + offset.x,
    y: volume.y * scale,
    z: volume.z * scale + offset.z,
    w: volume.w * scale,
    h: volume.h * scale,
    d: volume.d * scale,
    planes: volume.planes?.map(([nx, ny, nz, a]) => [nx, ny, nz, a * scale + nx * offset.x + nz * offset.z]),
  });
  const headquarters = createHeadquarters({
    scene: shell,
    solidBody: false,
    solid: (volume) => index.add(convert(volume)),
    box(x, y, z, w, h, d, color, solid = false) {
      const mesh = new THREE.Mesh(cube, material(color));
      mesh.position.set(x, y + h / 2, z);
      mesh.scale.set(w, h, d);
      mesh.receiveShadow = true;
      shell.add(mesh);
      if (solid) index.add(convert({ x, y, z, w, h, d }));
      return mesh;
    },
    cylinder(x, y, z, radius, height, color, segments = 8) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, segments),
        material(color),
      );
      mesh.position.set(x, y + height / 2, z);
      shell.add(mesh);
      return mesh;
    },
  });
  // A contained apron keeps an accidental exit from the hollow shell safe while
  // the actual return route remains the marked front portal.
  // Four exterior rectangles leave the entire building footprint open. Even an
  // uncollidable plane across the wings would cover the basement from above.
  for (const [x, z, w, d] of [
    [0, HQ.front + 80, 1600, 160],
    [0, HQ.back - 80, 1600, 160],
    [-712, HQ.centerZ, 176, 800],
    [712, HQ.centerZ, 176, 800],
  ]) {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material('#243d4e'));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(x, -0.025, z);
    apron.name = 'BORDER world exterior apron';
    scene.add(apron);
  }
  const interior = createHQInterior({ scene, collision: index });
  const range = createHQRange({ scene, collision: index, storage, notify });
  range.update(0, HQ_WORLD_ENTRY, false);
  const worldObjects = Object.freeze(scene.children.filter((object) => !object.isLight));
  const ownObjects = new Set(scene.children);
  let active = false,
    anchor = null,
    returnPoint = { ...HQ_CITY_RETURN },
    returnView = { yaw: Math.PI, pitch: 0 };
  let moved = [];

  function enter({ motor, view = {}, objects = [], returnPoint: point, returnView: facing } = {}) {
    if (active || !motor) return false;
    anchor = { position: { ...motor.position }, yaw: view.yaw ?? 0, pitch: view.pitch ?? 0 };
    returnPoint = { ...(point ?? HQ_CITY_RETURN) };
    returnView = { yaw: facing?.yaw ?? Math.PI, pitch: facing?.pitch ?? 0 };
    moved = [];
    for (const object of new Set(objects)) {
      if (
        !object?.isObject3D ||
        object.isLight ||
        ownObjects.has(object) ||
        !object.parent ||
        object.parent === scene
      )
        continue;
      moved.push({ object, parent: object.parent });
      scene.attach(object);
    }
    active = true;
    interior.updateVisibility(HQ_WORLD_ENTRY, true);
    motor.teleport({ ...HQ_WORLD_ENTRY }, 0);
    range.update(0, motor.position, true);
    return { position: { ...HQ_WORLD_ENTRY }, yaw: 0, pitch: 0 };
  }

  function exit({ motor } = {}) {
    if (!active || !motor) return false;
    range.update(0, motor.position, false);
    interior.updateVisibility(motor.position, false);
    for (const { object, parent } of moved) {
      // A simulation must restore dynamic objects before leaving this world;
      // attach also safely recovers them if a caller has already reparented one.
      parent.attach(object);
    }
    moved = [];
    active = false;
    motor.teleport({ ...returnPoint }, returnView.yaw);
    return { position: { ...returnPoint }, ...returnView };
  }

  return {
    scene,
    index,
    interior,
    range,
    shell,
    headquarters,
    worldObjects,
    groundHeight: headquartersGroundHeight,
    enter,
    exit,
    get active() {
      return active;
    },
    get anchor() {
      return anchor ? { ...anchor, position: { ...anchor.position } } : null;
    },
    get snapshot() {
      return {
        active,
        world: active ? 'border' : 'city',
        entry: { ...HQ_WORLD_ENTRY },
        returnPoint: { ...returnPoint },
        transferredObjects: moved.length,
        interior: interior.diagnostics,
      };
    },
  };
}
