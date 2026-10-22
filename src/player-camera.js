import { Vector3, MathUtils } from 'three';
import { PERSON } from './building-metrics.js';

const RADIUS = .24;
const WALL_MARGIN = .035;
const MIN_DISTANCE = 1.4;
const MAX_DISTANCE = 7;

// Camera collision is independent of the player's capsule: a clear walking
// position can still put an over-the-shoulder camera on the far side of a wall.
export function createPlayerCamera({ camera, collision, groundHeight }) {
  let mode = 'first', distance = 4.2, initialized = false;
  let actualDistance = 0, obstructed = false;
  const lastPivot = new Vector3();
  const pivot = new Vector3(), forward = new Vector3(), right = new Vector3();
  const desired = new Vector3(), resolved = new Vector3(), lookTarget = new Vector3();

  function projection() {
    const fov = mode === 'first' ? 62 : 60;
    if (camera.fov !== fov || camera.near !== .10) {
      camera.fov = fov;camera.near = .10;camera.updateProjectionMatrix();
    }
  }

  function terrainClear(point) {
    const height = groundHeight?.(point.x, point.z) ?? -Infinity;
    return point.y >= height + RADIUS;
  }

  function constrain(from, to, target) {
    const length = from.distanceTo(to);
    if (length < 1e-8) { target.copy(from);return false; }
    const hit = collision?.segmentFraction?.(from, to, RADIUS);
    let fraction = Number.isFinite(hit) ? MathUtils.clamp(hit, 0, 1) : 1;
    if (fraction < 1) fraction = Math.max(0, fraction - WALL_MARGIN / length);

    // Test the whole segment, not only the camera's endpoint. A ridge can sit
    // between the player and an otherwise clear camera position.
    const samples = Math.min(256, Math.max(1, Math.ceil(length / .12)));
    const point = new Vector3();
    let previous = 0;
    for (let i = 1; i <= samples; i++) {
      const t = Math.min(fraction, i / samples);
      point.lerpVectors(from, to, t);
      if (!terrainClear(point)) {
        let low = previous, high = t;
        for (let step = 0; step < 10; step++) {
          const middle = (low + high) / 2;
          point.lerpVectors(from, to, middle);
          if (terrainClear(point)) low = middle; else high = middle;
        }
        fraction = Math.max(0, low - WALL_MARGIN / length);break;
      }
      previous = t;
      if (t >= fraction) break;
    }
    target.lerpVectors(from, to, fraction);
    return fraction < .9999;
  }

  function setMode(value) {
    if (value !== 'first' && value !== 'third') throw new RangeError('Unknown player camera mode');
    if (mode !== value) { mode = value;initialized = false; }
    projection();
    return mode;
  }

  function update(dt, { position, eyeHeight = PERSON.eyeHeight, yaw = 0, pitch = 0 }) {
    projection();
    const viewPitch = MathUtils.clamp(pitch, -Math.PI / 2 + .06, Math.PI / 2 - .06);
    camera.rotation.order = 'YXZ';
    if (mode === 'first') {
      camera.position.set(position.x, position.y + eyeHeight, position.z);
      camera.rotation.set(viewPitch, yaw, 0, 'YXZ');
      initialized = false;actualDistance = 0;obstructed = false;
      return diagnostics();
    }

    pivot.set(position.x, position.y + eyeHeight * .9, position.z);
    forward.set(-Math.sin(yaw) * Math.cos(viewPitch), Math.sin(viewPitch), -Math.cos(yaw) * Math.cos(viewPitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    // Keep the actual requested boom length independent of the small shoulder
    // offset, and aim ahead so the avatar sits below the centre of the view.
    desired.copy(pivot).addScaledVector(forward, -Math.sqrt(distance * distance - .25 * .25)).addScaledVector(right, .25);
    const desiredBlocked = constrain(pivot, desired, resolved);
    if (!initialized || lastPivot.distanceTo(pivot) > 12) camera.position.copy(resolved);
    else camera.position.lerp(resolved, 1 - Math.exp(-Math.min(Math.max(dt, 0), .25) * 12));

    // Smoothing is also collision checked; shortening only the destination
    // would leave the previous camera position behind a newly encountered wall.
    const smoothedBlocked = constrain(pivot, camera.position, resolved);
    camera.position.copy(resolved);
    lookTarget.copy(pivot).addScaledVector(forward, 8);
    camera.lookAt(lookTarget);
    actualDistance = camera.position.distanceTo(pivot);
    obstructed = desiredBlocked || smoothedBlocked;
    initialized = true;lastPivot.copy(pivot);
    return diagnostics();
  }

  function diagnostics() {
    return { mode, desiredDistance: mode === 'third' ? distance : 0, actualDistance, obstructed };
  }

  return {
    get mode() { return mode; },
    toggle() { return setMode(mode === 'first' ? 'third' : 'first'); },
    setMode,
    zoom(delta) {
      if (mode === 'third' && Number.isFinite(delta)) distance = MathUtils.clamp(distance * Math.exp(MathUtils.clamp(delta, -2000, 2000) * .001), MIN_DISTANCE, MAX_DISTANCE);
      return distance;
    },
    // Teleport/respawn should not fly the camera across the city. Preserve the
    // player's chosen perspective and zoom while resetting the chase history.
    reset() { initialized = false;actualDistance = 0;obstructed = false; },
    update,
    get avatarVisible() { return mode === 'third' && actualDistance > .65; },
    get diagnostics() { return diagnostics(); },
  };
}
