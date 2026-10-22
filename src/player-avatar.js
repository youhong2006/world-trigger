import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MODEL = {
  name: 'KayKit Rogue · exploration avatar',
  author: 'Kay Lousberg / KayKit',
  license: 'CC0 1.0 Universal',
  source: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
  height: 1.8,
};
const WEAPONS = new Set(['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable', 'Rogue_Cape']);
const CLIPS = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', jump: 'Jump_Start', fall: 'Jump_Idle', land: 'Jump_Land', crouch: 'Idle', 'crouch-walk': 'Idle' };
const clamp = THREE.MathUtils.clamp;

// A complete local skeleton is available while the file loads, and remains a
// visible, animated human if a browser cannot load the model. It uses actual
// skin indices and bones rather than scaling a rigid body to imitate crouching.
function createFallback() {
  const root = new THREE.Group();
  const bones = [], byName = new Map(), pieces = [];
  function bone(name, parent, x, y, z = 0) {
    const item = new THREE.Bone();item.name = name;item.position.set(x, y, z);
    if (parent) parent.add(item);
    bones.push(item);byName.set(name, item);return item;
  }
  const hips = bone('hips', null, 0, .87);
  const spine = bone('spine', hips, 0, .22);
  const chest = bone('chest', spine, 0, .22);
  bone('head', chest, 0, .32);
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const arm = bone(`upperarm${side}`, chest, sign * .27, .04);
    const elbow = bone(`lowerarm${side}`, arm, 0, -.28);
    bone(`hand${side}`, elbow, 0, -.26);
    const leg = bone(`upperleg${side}`, hips, sign * .13, -.03);
    const knee = bone(`lowerleg${side}`, leg, 0, -.41);
    bone(`foot${side}`, knee, 0, -.37);
  }
  root.add(hips);root.updateMatrixWorld(true);
  function piece(name, geometry, x, y, z, color) {
    geometry.translate(x, y, z);
    const count = geometry.attributes.position.count, index = bones.indexOf(byName.get(name));
    const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4), colors = new Float32Array(count * 3);
    const tint = new THREE.Color(color);
    for (let i = 0; i < count; i++) { indices[i * 4] = index;weights[i * 4] = 1;tint.toArray(colors, i * 3); }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    pieces.push(geometry);
  }
  piece('spine', new THREE.BoxGeometry(.39, .48, .25), 0, 1.16, 0, '#41616b');
  piece('hips', new THREE.BoxGeometry(.35, .22, .24), 0, .87, 0, '#324857');
  piece('head', new THREE.SphereGeometry(.145, 12, 9), 0, 1.64, 0, '#d9b497');
  piece('head', new THREE.SphereGeometry(.149, 12, 5, 0, Math.PI * 2, 0, Math.PI * .48), 0, 1.665, 0, '#3c3c3c');
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    piece(`upperarm${side}`, new THREE.CylinderGeometry(.075, .07, .27, 8), sign * .27, 1.20, 0, '#41616b');
    piece(`lowerarm${side}`, new THREE.CylinderGeometry(.065, .055, .25, 8), sign * .27, .94, 0, '#41616b');
    piece(`hand${side}`, new THREE.BoxGeometry(.1, .13, .12), sign * .27, .79, 0, '#d9b497');
    piece(`upperleg${side}`, new THREE.CylinderGeometry(.095, .075, .4, 8), sign * .13, .64, 0, '#324857');
    piece(`lowerleg${side}`, new THREE.CylinderGeometry(.075, .06, .36, 8), sign * .13, .25, 0, '#324857');
    piece(`foot${side}`, new THREE.BoxGeometry(.15, .11, .27), sign * .13, .055, -.07, '#303b42');
  }
  const mesh = new THREE.SkinnedMesh(mergeGeometries(pieces), new THREE.MeshToonMaterial({ vertexColors: true }));
  mesh.name = 'Local skinned human fallback';mesh.add(hips);mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = false;mesh.receiveShadow = true;mesh.frustumCulled = false;root.add(mesh);
  const rest = new Map(bones.map(item => [item, item.position.clone()]));
  function update(time, state, crouch) {
    for (const item of bones) { item.position.copy(rest.get(item));item.rotation.set(0, 0, 0); }
    const moving = state.speed > .08, gait = moving ? Math.sin(time * (state.animation === 'run' ? 13 : 8)) : 0;
    hips.position.y -= crouch * .43;
    spine.rotation.x = -.9 * crouch;
    chest.rotation.x = -.5 * crouch;
    byName.get('head').rotation.x = .9 * crouch;
    for (const [side, sign] of [['l', 1], ['r', -1]]) {
      byName.get(`upperleg${side}`).rotation.x = 1.25 * crouch + sign * gait * (crouch > .5 ? .025 : .53);
      byName.get(`lowerleg${side}`).rotation.x = -2.2 * crouch - Math.max(0, -sign * gait) * (crouch > .5 ? .025 : .55);
      byName.get(`foot${side}`).rotation.x = .95 * crouch;
      byName.get(`upperarm${side}`).rotation.x = -sign * gait * (crouch > .5 ? .04 : .5) - .3 * crouch;
      byName.get(`lowerarm${side}`).rotation.x = -.15 - (state.animation === 'run' ? .7 : 0);
      if (!state.grounded) {
        byName.get(`upperleg${side}`).rotation.x += .5;
        byName.get(`lowerleg${side}`).rotation.x -= .7;
        byName.get(`upperarm${side}`).rotation.x -= .6;
      }
    }
  }
  return { root, bones, update };
}

// The public heading contract matches the walking controller: 0 faces -Z and
// PI/2 faces -X. KayKit's source faces +Z, so its visual child turns by PI.
export function createPlayerAvatar(scene) {
  const anchor = new THREE.Group();anchor.name = 'Playable humanoid';anchor.visible = false;scene.add(anchor);
  const visual = new THREE.Group();anchor.add(visual);
  const fallback = createFallback();visual.add(fallback.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.31, 24), new THREE.MeshBasicMaterial({ color: '#203529', transparent: true, opacity: .19, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;shadow.visible = false;shadow.renderOrder = 1;scene.add(shadow);
  let model = null, mixer = null, active = '', action = null, clock = 0, crouch = 0, visibility = false, lastState = null;
  const bones = new Map(), animatedPose = new Map(), actions = new Map(), feet = [];
  const status = { model: MODEL.name, source: MODEL.source, author: MODEL.author, license: MODEL.license, loaded: false, loading: true, fallback: true, skinned: true, bones: fallback.bones.length, animations: [], active: 'idle', clip: 'procedural', height: MODEL.height, error: null };

  function clipFor(state) { return CLIPS[state.animation] ?? CLIPS.idle; }
  function setAction(state) {
    const nextName = clipFor(state);
    if (nextName !== active) {
      const next = actions.get(nextName) ?? actions.get('Idle');
      if (!next) return;
      const single = nextName === 'Jump_Start' || nextName === 'Jump_Land';
      next.reset().setLoop(single ? THREE.LoopOnce : THREE.LoopRepeat, single ? 1 : Infinity);
      next.clampWhenFinished = single;next.enabled = true;next.setEffectiveWeight(1).play();
      if (action && action !== next) next.crossFadeFrom(action, .15, false);
      action = next;active = nextName;
    }
    const speed = Math.max(0, state.speed ?? 0);
    const rate = state.animation === 'walk' ? clamp(speed / 2.2, .65, 1.6) : state.animation === 'run' ? clamp(speed / 6.2, .75, 1.7) : state.animation === 'jump' ? 1.8 : state.animation === 'land' ? 1.65 : 1;
    action?.setEffectiveTimeScale(rate);status.clip = active;
  }
  function restorePose() {
    for (const [bone, pose] of animatedPose) { bone.position.copy(pose.position);bone.quaternion.copy(pose.quaternion);bone.scale.copy(pose.scale); }
  }
  function rememberPose() {
    for (const bone of bones.values()) {
      let pose = animatedPose.get(bone);
      if (!pose) { pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };animatedPose.set(bone, pose); }
      pose.position.copy(bone.position);pose.quaternion.copy(bone.quaternion);pose.scale.copy(bone.scale);
    }
  }
  function poseCrouch(state) {
    if (crouch < .001) return;
    const moving = state.animation === 'crouch-walk', gait = moving ? Math.sin(clock * 7.5) * .16 : 0;
    const hips = bones.get('hips');
    if (hips) { hips.position.y -= .16 * crouch;hips.rotateX(.12 * crouch); }
    // Deep hip/spine flexion keeps this stylised head within the 1.05m
    // crouch capsule. Counter-rotate the neck so the gaze stays forward.
    bones.get('spine')?.rotateX(1.35 * crouch);
    bones.get('chest')?.rotateX(.85 * crouch);
    bones.get('head')?.rotateX(-2.32 * crouch);
    for (const [side, sign] of [['l', 1], ['r', -1]]) {
      bones.get(`upperleg${side}`)?.rotateX((-1.02 + sign * gait) * crouch);
      bones.get(`lowerleg${side}`)?.rotateX((1.77 - sign * gait) * crouch);
      bones.get(`foot${side}`)?.rotateX(-.75 * crouch);
      bones.get(`upperarm${side}`)?.rotateX(-.18 * crouch);
    }
  }
  function alignFeet() {
    if (!model) return;
    visual.position.y = 0;anchor.updateMatrixWorld(true);
    let minY = Infinity;
    for (const foot of feet) {
      foot.skeleton.update();foot.computeBoundingBox();
      const bound = foot.boundingBox.clone().applyMatrix4(foot.matrixWorld);
      minY = Math.min(minY, bound.min.y);
    }
    if (Number.isFinite(minY)) visual.position.y = anchor.position.y - minY;
  }
  function update(dt, state) {
    lastState = state;clock += Math.min(Math.max(dt, 0), .1);
    anchor.position.copy(state.position);anchor.rotation.y = state.heading ?? 0;
    crouch = THREE.MathUtils.damp(crouch, state.crouched || state.animation?.startsWith('crouch') ? 1 : 0, 12, dt);
    status.active = state.animation ?? 'idle';
    if (mixer) {
      restorePose();setAction(state);mixer.update(Math.min(dt, .1));rememberPose();poseCrouch(state);alignFeet();
    } else {
      fallback.update(clock, state, crouch);
      fallback.root.position.y = 0;anchor.updateMatrixWorld(true);
      const left = fallback.bones.find(bone => bone.name === 'footl');
      const right = fallback.bones.find(bone => bone.name === 'footr');
      const point = new THREE.Vector3();
      const minY = Math.min(left.getWorldPosition(point).y, right.getWorldPosition(point).y);
      fallback.root.position.y = anchor.position.y + .06 - minY;
    }
    anchor.visible = visibility;
    shadow.position.set(state.position.x, (state.groundY ?? state.position.y) + .026, state.position.z);
    shadow.visible = visibility && !!state.grounded;
    shadow.scale.setScalar(1 - crouch * .08);
  }
  const ready = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/avatar/rogue.glb`).then(gltf => {
    model = gltf.scene;model.name = MODEL.name;
    model.traverse(object => {
      if (WEAPONS.has(object.name)) object.visible = false;
      if (object.isBone) bones.set(object.name, object);
      if (object.isMesh) { object.castShadow = false;object.receiveShadow = true;object.frustumCulled = false; }
      if (object.isSkinnedMesh && /^Rogue_Leg/.test(object.name)) feet.push(object);
    });
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const inPlace = clip.clone();
      inPlace.tracks = inPlace.tracks.filter(track => !/^(?:root|Rig)\.(?:position|quaternion)$/.test(track.name));
      actions.set(clip.name, mixer.clipAction(inPlace));
    }
    const idle = actions.get('Idle');idle.play();mixer.update(.001);active = 'Idle';action = idle;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    model.traverse(object => {
      if (!object.isSkinnedMesh || !/^Rogue_/.test(object.name)) return;
      object.skeleton.update();object.computeBoundingBox();bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height < .1 || !feet.length) throw new Error('Invalid humanoid skin/bounds');
    model.scale.setScalar(MODEL.height / height);model.rotation.y = Math.PI;
    visual.remove(fallback.root);visual.add(model);rememberPose();
    Object.assign(status, { loaded: true, loading: false, fallback: false, bones: bones.size, animations: gltf.animations.map(clip => clip.name), height: MODEL.height, clip: 'Idle' });
    if (lastState) update(0, lastState);
    return status;
  }).catch(error => {
    mixer = null;model = null;visual.clear();visual.add(fallback.root);visual.position.y = 0;
    Object.assign(status, { loaded: false, loading: false, fallback: true, model: 'Local skinned exploration human', source: 'Original procedural fallback included with this app', author: 'Original project fallback', license: 'Original geometry generated by this project', error: String(error.message ?? error), clip: 'procedural' });
    return status;
  });
  function setVisible(value) { visibility = !!value;anchor.visible = visibility;shadow.visible = visibility && !!lastState?.grounded; }
  return { ready, update, setVisible, get diagnostics() { return { ...status, visible: visibility, crouchBlend: crouch }; } };
}
