import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PERSON } from './building-metrics.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MODEL = {
  name: 'VRoid adult exploration avatar', author: 'VRoid Studio / pixiv; animation by Quaternius',
  license: 'CC0 1.0 Universal', source: 'https://github.com/madjin/vrm-samples/tree/master/vroid/beta',
  height: PERSON.height,
};
const CLIPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Sprint_Loop', jump: 'Jump_Start', fall: 'Jump_Loop', land: 'Jump_Land', crouch: 'Crouch_Idle_Loop', 'crouch-walk': 'Crouch_Fwd_Loop' };
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
  piece('spine', new THREE.BoxGeometry(.39, .48, .25), 0, 1.16, 0, '#171d28');
  piece('hips', new THREE.BoxGeometry(.35, .22, .24), 0, .87, 0, '#141923');
  piece('head', new THREE.SphereGeometry(.145, 12, 9), 0, 1.64, 0, '#d9b497');
  piece('head', new THREE.SphereGeometry(.149, 12, 5, 0, Math.PI * 2, 0, Math.PI * .48), 0, 1.665, 0, '#67627b');
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    piece(`upperarm${side}`, new THREE.CylinderGeometry(.075, .07, .27, 8), sign * .27, 1.20, 0, '#171d28');
    piece(`lowerarm${side}`, new THREE.CylinderGeometry(.065, .055, .25, 8), sign * .27, .94, 0, '#171d28');
    piece(`hand${side}`, new THREE.BoxGeometry(.1, .13, .12), sign * .27, .79, 0, '#d9b497');
    piece(`upperleg${side}`, new THREE.CylinderGeometry(.095, .075, .4, 8), sign * .13, .64, 0, '#141923');
    piece(`lowerleg${side}`, new THREE.CylinderGeometry(.075, .06, .36, 8), sign * .13, .25, 0, '#141923');
    piece(`foot${side}`, new THREE.BoxGeometry(.15, .11, .27), sign * .13, .055, -.07, '#303b42');
  }
  const mesh = new THREE.SkinnedMesh(mergeGeometries(pieces), new THREE.MeshToonMaterial({ vertexColors: true }));
  mesh.name = 'Local skinned human fallback';mesh.add(hips);mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = false;mesh.receiveShadow = true;mesh.frustumCulled = false;root.add(mesh);
  root.scale.setScalar(PERSON.height / 1.8);
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

function animeMaterials(model) {
  const cache = new Map();
  const tones = new THREE.DataTexture(new Uint8Array([100, 162, 212, 255]), 4, 1, THREE.RedFormat);
  tones.minFilter = tones.magFilter = THREE.NearestFilter;tones.needsUpdate = true;
  function convert(original) {
    if (cache.has(original)) return cache.get(original);
    const hair = /HAIR/i.test(original.name), uniform = /Tops.*CLOTH/i.test(original.name);
    const material = new THREE.MeshToonMaterial({
      name: original.name, map: original.map, gradientMap: tones,
      color: original.color?.clone() ?? new THREE.Color('white'),
      side: original.side, transparent: original.transparent,
      alphaTest: original.alphaTest, depthWrite: original.depthWrite,
    });
    if (hair) { material.transparent = false;material.alphaTest = .38;material.depthWrite = true; }
    if (hair || uniform) {
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float fabricLight = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          ${hair ? 'diffuseColor.rgb = vec3(0.24, 0.215, 0.31) * (0.44 + 0.85 * sqrt(max(fabricLight, 0.0)));' : `
          diffuseColor.rgb = vec3(0.012, 0.016, 0.023) * (0.45 + fabricLight * 0.55);
          `}
        `);
      };
      material.customProgramCacheKey = () => hair ? 'adult-slate-hair-v1' : 'adult-charcoal-uniform-v2';
    }
    cache.set(original, material);return material;
  }
  model.traverse(object => {
    if (object.isMesh) {
      if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    }
  });
}

// Original costume additions share the imported skeleton. Tail vertices blend
// hips/thigh weights so the split coat follows the legs rather than staying rigid.
function addUniformCoat(model, humanoid) {
  const hips = model.getObjectByName(humanoid.hips);
  let body;
  model.traverse(object => { if (object.isSkinnedMesh && /Tops/.test(object.material?.name)) body = object; });
  if (!body || !hips) return;
  const skeleton = body.skeleton, positions = [], joints = [], weights = [], groups = [];
  const origin = hips.getWorldPosition(new THREE.Vector3());
  const boneIndex = name => skeleton.bones.indexOf(model.getObjectByName(humanoid[name]));
  const hipIndex = boneIndex('hips');
  function quad(vertices, bone, color = 0, blend = true, base = hipIndex) {
    const start = positions.length / 3;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const v = vertices[i];positions.push(...v);
      const lower = i === 2 || i === 3;
      joints.push(base, bone, 0, 0);
      const legWeight = blend && lower ? .65 : 0;
      weights.push(1 - legWeight, legWeight, 0, 0);
    }
    groups.push([start, 6, color]);
  }
  for (const sign of [-1, 1]) {
    const leg = boneIndex(sign < 0 ? 'leftUpperLeg' : 'rightUpperLeg');
    if (leg < 0) continue;
    const cx = origin.x, cy = origin.y, cz = origin.z;
    const outer = sign * .205, inner = sign * .055, bottom = cy - .44;
    // Two front panels, back panels and side seams leave the centre free.
    quad([[cx+inner,cy-.06,cz-.15],[cx+outer,cy-.06,cz-.15],[cx+outer*1.1,bottom,cz-.14],[cx+inner,bottom,cz-.14]],leg);
    quad([[cx,cy-.06,cz+.15],[cx+outer,cy-.06,cz+.15],[cx+outer*1.1,bottom,cz+.15],[cx+sign*.025,bottom,cz+.15]],leg);
    quad([[cx+outer,cy-.06,cz-.15],[cx+outer,cy-.06,cz+.15],[cx+outer*1.1,bottom,cz+.15],[cx+outer*1.1,bottom,cz-.14]],leg);
    quad([[cx+inner,cy-.06,cz-.153],[cx+inner+sign*.005,cy-.06,cz-.153],[cx+inner+sign*.005,bottom,cz-.143],[cx+inner,bottom,cz-.143]],leg,1);
  }
  const chest = boneIndex('upperChest');
  if (chest >= 0) {
    const shoulders = ['leftUpperArm', 'rightUpperArm'].map(name => model.getObjectByName(humanoid[name]).getWorldPosition(new THREE.Vector3()));
    const center = model.getObjectByName(humanoid.upperChest).getWorldPosition(new THREE.Vector3());
    center.y -= .075;center.z = origin.z + .145;
    for (const shoulder of shoulders) {
      shoulder.y -= .055;shoulder.z = center.z;
      const dx = center.x - shoulder.x, dy = center.y - shoulder.y, length = Math.hypot(dx, dy);
      const ox = -dy / length * .003, oy = dx / length * .003;
      quad([[shoulder.x-ox,shoulder.y-oy,center.z],[shoulder.x+ox,shoulder.y+oy,center.z],
        [center.x+ox,center.y+oy,center.z],[center.x-ox,center.y-oy,center.z]],chest,1,false,chest);
    }
  }
  for (const side of ['left', 'right']) {
    const wrist = model.getObjectByName(humanoid[side + 'Hand']).getWorldPosition(new THREE.Vector3());
    const forearm = boneIndex(side + 'LowerArm');
    if (forearm < 0) continue;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, b = (i + 1) / 12 * Math.PI * 2;
      const point = (angle, offset) => [wrist.x + offset, wrist.y + Math.cos(angle) * .051, wrist.z + Math.sin(angle) * .051];
      quad([point(a,-.005),point(a,.005),point(b,.005),point(b,-.005)],forearm,1,false,forearm);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.computeVertexNormals();for (const group of groups) geometry.addGroup(...group);
  const coat = new THREE.SkinnedMesh(geometry, [
    new THREE.MeshToonMaterial({ color: '#121822', side: THREE.DoubleSide }),
    new THREE.MeshToonMaterial({ color: '#89909b', side: THREE.DoubleSide }),
  ]);
  coat.name = 'Original split uniform coat';model.add(coat);coat.bind(skeleton, body.bindMatrix.clone());
  coat.castShadow = false;coat.receiveShadow = true;coat.frustumCulled = false;
}

// Source VRoid 0.x already faces -Z. Heading 0 faces -Z, PI/2 faces -X.
export function createPlayerAvatar(scene) {
  const anchor = new THREE.Group();anchor.name = 'Playable humanoid';anchor.visible = false;scene.add(anchor);
  const visual = new THREE.Group();anchor.add(visual);
  const fallback = createFallback();visual.add(fallback.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.29, 24), new THREE.MeshBasicMaterial({ color: '#203529', transparent: true, opacity: .19, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;shadow.visible = false;scene.add(shadow);
  let model = null, mixer = null, action = null, active = '', clock = 0, crouch = 0, visibility = false, lastState = null;
  const feet = [], actions = new Map(), poseBones = [], animatedPose = new Map();
  const status = { model: MODEL.name, author: MODEL.author, source: MODEL.source, license: MODEL.license,
    loaded: false, loading: true, fallback: true, skinned: true, bones: fallback.bones.length,
    animations: [], active: 'idle', clip: 'procedural', height: PERSON.height, proportions: 'adult-anime', error: null };
  function setAction(state) {
    const name = CLIPS[state.animation] ?? CLIPS.idle;
    if (name !== active) {
      const next = actions.get(name) ?? actions.get(CLIPS.idle);
      if (!next) return;
      const single = name === 'Jump_Start' || name === 'Jump_Land';
      next.reset().setLoop(single ? THREE.LoopOnce : THREE.LoopRepeat, single ? 1 : Infinity);
      next.clampWhenFinished = single;next.enabled = true;next.setEffectiveWeight(1).play();
      if (action && action !== next) next.crossFadeFrom(action, .14, false);
      active = name;action = next;
    }
    const speed = Math.max(0, state.speed ?? 0);
    const rate = state.animation === 'walk' ? clamp(speed / PERSON.walkSpeed, .65, 1.6)
      : state.animation === 'run' ? clamp(speed / PERSON.sprintSpeed, .75, 1.7)
      : state.animation === 'crouch-walk' ? clamp(speed / 1.15, .6, 1.5) : 1;
    action?.setEffectiveTimeScale(rate);status.clip = active;
  }
  function alignFeet() {
    if (!model) return;
    visual.position.y = 0;anchor.updateMatrixWorld(true);
    let minY = Infinity;
    for (const foot of feet) {
      foot.skeleton.update();foot.computeBoundingBox();
      minY = Math.min(minY, foot.boundingBox.clone().applyMatrix4(foot.matrixWorld).min.y);
    }
    if (Number.isFinite(minY)) visual.position.y = anchor.position.y - minY;
  }
  function update(dt, state) {
    lastState = state;clock += Math.min(Math.max(dt, 0), .25);
    anchor.position.copy(state.position);anchor.rotation.y = state.heading ?? 0;
    crouch = THREE.MathUtils.damp(crouch, state.crouched ? 1 : 0, 12, dt);
    status.active = state.animation ?? 'idle';
    if (mixer) {
      for (const bone of poseBones) if (animatedPose.has(bone)) bone.quaternion.copy(animatedPose.get(bone));
      setAction(state);mixer.update(Math.min(Math.max(dt, 0), .25));
      for (const bone of poseBones) animatedPose.set(bone, bone.quaternion.clone());
      // A deeper forward fold fits the imported adult crouch into the same
      // low-clearance body volume, while counter-rotating the head for vision.
      if (poseBones.length === 3) {
        poseBones[0].rotateX(-.33 * crouch);poseBones[1].rotateX(-.22 * crouch);poseBones[2].rotateX(.55 * crouch);
      }
      alignFeet();
    }
    else {
      fallback.update(clock, state, crouch);fallback.root.position.y = 0;anchor.updateMatrixWorld(true);
      const point = new THREE.Vector3();
      const min = Math.min(...fallback.bones.filter(b => /^foot/.test(b.name)).map(b => b.getWorldPosition(point).y));
      fallback.root.position.y = anchor.position.y + .06 * PERSON.height / 1.8 - min;
    }
    anchor.visible = visibility;
    shadow.position.set(state.position.x, (state.groundY ?? state.position.y) + .026, state.position.z);
    shadow.visible = visibility && !!state.grounded;
  }
  const ready = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/avatar/adult-explorer.glb`).then(gltf => {
    model = gltf.scene;model.name = MODEL.name;const humanoid = model.userData.humanoid;
    if (!humanoid?.hips) throw new Error('Adult humanoid mapping missing');
    for (const name of ['spine', 'chest', 'head']) {
      const bone = model.getObjectByName(humanoid[name]);if (bone) poseBones.push(bone);
    }
    model.updateMatrixWorld(true);animeMaterials(model);addUniformCoat(model, humanoid);
    let boneCount = 0;
    model.traverse(object => {
      if (object.isBone) boneCount++;
      if (object.isMesh) { object.castShadow = false;object.receiveShadow = true;object.frustumCulled = false; }
      if (object.isSkinnedMesh && /Shoes/i.test(object.material?.name)) feet.push(object);
    });
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    const idle = actions.get(CLIPS.idle);if (!idle || !feet.length) throw new Error('Missing locomotion animation or foot skin');
    idle.play();action = idle;active = CLIPS.idle;
    // Calibrate the full idle breathing cycle once, including hair and soles.
    // The imported asset's unit convention never determines gameplay height.
    let height = 0;
    for (let sample = 0; sample < 12; sample++) {
      mixer.setTime(idle.getClip().duration * sample / 12);model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model, true);
      height = Math.max(height, bounds.max.y - bounds.min.y);
    }
    mixer.setTime(0);
    if (!Number.isFinite(height) || height < .5) throw new Error('Invalid adult model bounds');
    model.scale.setScalar(PERSON.height / height);
    visual.remove(fallback.root);visual.add(model);
    Object.assign(status, { loaded: true, loading: false, fallback: false, bones: boneCount,
      animations: gltf.animations.map(clip => clip.name), height: PERSON.height, clip: CLIPS.idle });
    if (lastState) update(0, lastState);
    return status;
  }).catch(error => {
    mixer = null;model = null;visual.clear();visual.add(fallback.root);visual.position.y = 0;
    Object.assign(status, { loaded: false, loading: false, fallback: true, model: 'Local adult skinned exploration human',
      author: 'Original project fallback', source: 'Original project geometry', license: 'Original project geometry', error: String(error.message ?? error), clip: 'procedural' });
    return status;
  });
  function setVisible(value) { visibility = !!value;anchor.visible = visibility;shadow.visible = visibility && !!lastState?.grounded; }
  return { ready, update, setVisible, get diagnostics() { return { ...status, visible: visibility, crouchBlend: crouch }; } };
}
