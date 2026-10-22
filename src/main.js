import * as THREE from 'three';
import './style.css';
import { createHeadquarters } from './headquarters.js';
import { createCity } from './city.js';
import { createSky, terrainRGB } from './landscape.js';
import { PERSON, ARCHITECTURE } from './building-metrics.js';
import { createCharacterMotor } from './character-motor.js';
import { createPlayerCamera } from './player-camera.js';
import { createPlayerAvatar } from './player-avatar.js';
import { CITY, BASE, riverZ, groundHeight, inRiver, createCollisionIndex } from './city-layout.js';

const host = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#72b5e4');
scene.fog = new THREE.Fog('#accdd9', 7200, 21000);
const overviewPosition = new THREE.Vector3(2200, 3800, 6500);
const overviewLook = new THREE.Vector3(0, 150, -150);
const camera = new THREE.PerspectiveCamera(51, innerWidth / innerHeight, 5, 30000);
camera.position.copy(overviewPosition);
camera.lookAt(overviewLook);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (error) {
  host.innerHTML = '<p style="padding:100px">此裝置無法啟動 WebGL。請啟用瀏覽器硬體加速後重新載入。</p>';
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// All geometry and the sun's direction are static: render the shadow map once.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);
const ambient = new THREE.HemisphereLight('#e0efff', '#6c8651', 1.9);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff4dd', 2.5);
sun.position.set(-1600, 2500, 1600);
sun.target.position.set(0, 300, -150);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1050, right: 1050, top: 1050, bottom: -1050, near: 1, far: 6500 });
sun.shadow.normalBias = 0.15;
scene.add(sun, sun.target);
const materials = new Map();
function mat(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  return materials.get(color);
}
const collision = createCollisionIndex();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function box(x, y, z, w, h, d, color, collide = false, parent = scene) {
  const mesh = new THREE.Mesh(unitBox, mat(color));
  mesh.position.set(x, y + h / 2, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (collide) collision.add({ x, z, w, d, y, h });
  return mesh;
}
function cylinder(x, y, z, r, h, color, segments = 8, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mat(color));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const sky = createSky(scene);
const city = createCity({ scene, box, collision });

// Keep the reference model intact, scaled and recentered in the new city plan.
const baseGroup = new THREE.Group();
const baseScale = BASE.scale;
const baseOffset = new THREE.Vector3(-23 * baseScale, 0, -150 + 117 * baseScale);
baseGroup.scale.setScalar(baseScale);
baseGroup.position.copy(baseOffset);
scene.add(baseGroup);
const headquarters = createHeadquarters({
  scene: baseGroup,
  box(x, y, z, w, h, d, color, collide = false) {
    const mesh = box(x, y, z, w, h, d, color, false, baseGroup);
    if (collide) collision.add({ x: x * baseScale + baseOffset.x, z: z * baseScale + baseOffset.z, w: w * baseScale, d: d * baseScale, y: y * baseScale, h: h * baseScale });
    return mesh;
  },
  cylinder: (x, y, z, r, h, color, n) => cylinder(x, y, z, r, h, color, n, baseGroup),
});
const residentialZ = Math.round((riverZ(-1008) + 200 - 72) / 144) * 144 + 72;
const destinations = [
  { name: '住宅街', pos: new THREE.Vector3(-1070, groundHeight(-1070,residentialZ)+PERSON.eyeHeight, residentialZ), yaw: Math.PI / 2, previewPosition: new THREE.Vector3(-950, 42, riverZ(-1008)+280), previewLook: new THREE.Vector3(-1070, 7, riverZ(-1008)+170) },
  { name: 'BORDER 本部', pos: new THREE.Vector3(0, groundHeight(0,460)+PERSON.eyeHeight, 460), yaw: 0, pitch: 0.65, previewPosition: new THREE.Vector3(1350, 2800, 1350), previewLook: new THREE.Vector3(0, 300, -150) },
  { name: '河川敷', pos: new THREE.Vector3(0, groundHeight(0,riverZ(0)-105)+PERSON.eyeHeight, riverZ(0) - 105), yaw: Math.PI, previewPosition: new THREE.Vector3(320, 230, riverZ(0)+430), previewLook: new THREE.Vector3(0, 0, riverZ(0)) },
  { name: '山丘公園', pos: new THREE.Vector3(CITY.lookout.x, groundHeight(CITY.lookout.x,CITY.lookout.z)+PERSON.eyeHeight, CITY.lookout.z), yaw: -1.88, previewPosition: new THREE.Vector3(-2520, 380, 650), previewLook: new THREE.Vector3(-2000, 30, 120) },
];
const motor = createCharacterMotor({ groundHeight, collision });
const playerView = createPlayerCamera({ camera, collision, groundHeight: (x, z) => Math.max(groundHeight(x, z), inRiver(x, z) ? .4 : -Infinity) });
const avatar = createPlayerAvatar(scene);
let exploring = false, yaw = 0, pitch = 0, keys = {}, target = null, day = true, current = 0;
let crouchRequested = false, jumpQueued = false, keepExploringOnUnlock = false, safeSpawn = null;
const walking = document.querySelector('#walking');
const clock = new THREE.Clock();
const toast = document.querySelector('#toast');
let toastTimer, lastHud = '';
const movementLabels = { idle: '站立', walk: '行走', run: '跑步', jump: '起跳', fall: '空中', land: '落地', crouch: '蹲下', 'crouch-walk': '蹲走' };
function notify(text) {
  toast.textContent = text;toast.classList.add('show');clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function viewState() { return { position: motor.position, eyeHeight: motor.eyeHeight, yaw, pitch }; }
function syncPlayerHud() {
  const signature = `${playerView.mode}/${motor.crouched}/${motor.animation}`;
  if (signature === lastHud) return;
  lastHud = signature;
  const third = playerView.mode === 'third';
  document.body.classList.toggle('third-person', third);
  document.querySelector('#camera-view').textContent = `V · ${third ? '第三人稱' : '第一人稱'}`;
  document.querySelector('#camera-view').setAttribute('aria-pressed', String(third));
  document.querySelector('#crouch-toggle').textContent = `C · ${motor.crouched ? '站起' : '蹲下'}`;
  document.querySelector('#crouch-toggle').setAttribute('aria-pressed', String(motor.crouched));
  document.querySelector('#movement-state').textContent = movementLabels[motor.animation] ?? '站立';
}
function lockPointer() {
  keepExploringOnUnlock = false;
  if (document.pointerLockElement === renderer.domElement) return;
  try { renderer.domElement.requestPointerLock()?.catch(() => notify('按住畫面拖曳視角，使用 WASD 移動')); }
  catch { notify('按住畫面拖曳視角，使用 WASD 移動'); }
}
function enter() {
  exploring = true;keys = {};crouchRequested = jumpQueued = false;lastHud = '';
  document.body.classList.add('exploring');document.body.classList.remove('overview');walking.hidden = false;
  const destination = destinations[current];
  yaw = destination.yaw;pitch = destination.pitch ?? 0;target = null;
  safeSpawn = { point: { x: destination.pos.x, y: destination.pos.y - PERSON.eyeHeight, z: destination.pos.z }, yaw, pitch };
  motor.teleport(safeSpawn.point, yaw);playerView.reset();playerView.update(0, viewState());
  avatar.update(0, motor.state);avatar.setVisible(playerView.avatarVisible);syncPlayerHud();lockPointer();
}
function leave() {
  exploring = false;keys = {};jumpQueued = false;keepExploringOnUnlock = false;
  avatar.setVisible(false);document.body.classList.remove('exploring', 'third-person');document.body.classList.add('overview');walking.hidden = true;
  camera.fov = 51;camera.near = 5;camera.updateProjectionMatrix();
  if (document.pointerLockElement) document.exitPointerLock?.();
  target = { pos: overviewPosition.clone(), look: overviewLook.clone() };
}
function respawn() {
  if (!exploring || !safeSpawn) return;
  keys = {};crouchRequested = jumpQueued = false;yaw = safeSpawn.yaw;pitch = safeSpawn.pitch;
  motor.teleport(safeSpawn.point, yaw);playerView.reset();playerView.update(0, viewState());
  avatar.update(0, motor.state);avatar.setVisible(playerView.avatarVisible);syncPlayerHud();notify('已返回本次漫遊起點');
}
function toggleView() {
  if (!exploring) return;
  playerView.toggle();playerView.update(0, viewState());avatar.setVisible(playerView.avatarVisible);syncPlayerHud();
}
function toggleCrouch() { if (exploring) crouchRequested = motor.crouched ? false : !crouchRequested; }
document.querySelector('#enter').onclick = enter;
document.querySelector('#camera-view').onclick = toggleView;
document.querySelector('#crouch-toggle').onclick = toggleCrouch;
document.querySelector('#player-reset').onclick = respawn;
document.addEventListener('pointerlockchange', () => {
  // Remember the intended cursor mode even if an earlier asynchronous lock
  // request resolves after Tab. Releasing it for HUD controls keeps playing.
  if (document.pointerLockElement && exploring && keepExploringOnUnlock) {
    document.exitPointerLock();return;
  }
  if (!document.pointerLockElement && exploring) {
    keys = {};
    if (keepExploringOnUnlock) return;
    leave();
  }
});
document.querySelectorAll('.place').forEach(button => button.onclick = () => {
  if (exploring) leave();
  current = Number(button.dataset.place);
  document.querySelectorAll('.place').forEach(place => place.classList.toggle('active', place === button));
  document.body.classList.remove('overview');
  const destination = destinations[current];
  target = { pos: destination.previewPosition.clone(), look: destination.previewLook.clone() };
  notify('已抵達 ' + destination.name + ' · 點擊開始漫遊進入街道');
  document.querySelector('#location').textContent = destination.name;
});
document.querySelector('#reset').onclick = () => {
  if (exploring) { respawn();return; }
  current = 0;document.body.classList.add('overview');target = { pos: overviewPosition.clone(), look: overviewLook.clone() };
  document.querySelectorAll('.place').forEach((place, i) => place.classList.toggle('active', i === 0));
  document.querySelector('#location').textContent = '住宅街';
};
document.querySelector('#day').onclick=()=>{day=!day;sky.setDay(day);scene.fog.color.set(day?'#accdd9':'#233c50');ambient.intensity=day?1.9:.7;sun.intensity=day?2.5:.3;city.clouds.material.opacity=day?.86:.2;sun.color.set(day?'#ffeed1':'#b8d5fc');document.querySelector('#day').innerHTML=day?'☀ <span>日間</span>':'☾ <span>夜間</span>';};
const guide=document.querySelector('#guide');document.querySelector('#help').onclick=()=>{if(exploring)leave();guide.showModal();};document.querySelector('#close-guide').onclick=()=>guide.close();guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});
let audioCtx,noiseSource,audioGain,soundOn=false;document.querySelector('#sound').onclick=async()=>{try{if(!audioCtx){audioCtx=new AudioContext();const buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*4,audioCtx.sampleRate);const samples=buffer.getChannelData(0);let v=0;for(let i=0;i<samples.length;i++){v=(v+(Math.random()*2-1)*.03)/1.02;samples[i]=v;}noiseSource=audioCtx.createBufferSource();noiseSource.buffer=buffer;noiseSource.loop=true;const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=550;audioGain=audioCtx.createGain();audioGain.gain.value=0;noiseSource.connect(filter).connect(audioGain).connect(audioCtx.destination);noiseSource.start();}await audioCtx.resume();soundOn=!soundOn;audioGain.gain.setTargetAtTime(soundOn?.45:0,audioCtx.currentTime,.5);document.querySelector('#sound').innerHTML=soundOn?'♫ <span>音效開啟</span>':'♫ <span>音效關閉</span>';}catch{notify('此瀏覽器不支援環境音效');}};
window.addEventListener('keydown', event => {
  if (guide.open) return;
  if (exploring && (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)
      || (event.code === 'Tab' && document.pointerLockElement))) event.preventDefault();
  keys[event.code] = true;
  if (!exploring) return;
  if (event.code === 'Escape') { leave();return; }
  if (event.repeat) return;
  if (event.code === 'Space') jumpQueued = true;
  if (event.code === 'KeyV') toggleView();
  if (event.code === 'KeyC') toggleCrouch();
  if (event.code === 'KeyR') respawn();
  if (event.code === 'Tab') {
    keepExploringOnUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
    notify('游標已釋放，可使用下方按鈕；點擊場景繼續環顧');
  }
});
window.addEventListener('keyup', event => { keys[event.code] = false; });
window.addEventListener('blur', () => { keys = {};jumpQueued = false; });
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', event => {
  if (exploring || document.body.classList.contains('overview')) {
    dragging = true;lastX = event.clientX;lastY = event.clientY;
    if (document.pointerLockElement !== renderer.domElement) {
      if (exploring && event.pointerType === 'mouse') lockPointer();
      else renderer.domElement.setPointerCapture(event.pointerId);
    }
  }
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', event => {
  if (!exploring) {
    if (dragging && document.body.classList.contains('overview')) {
      target = null;
      const offset = camera.position.clone().sub(overviewLook), sphere = new THREE.Spherical().setFromVector3(offset);
      sphere.theta -= (event.clientX - lastX) * .003;
      sphere.phi = THREE.MathUtils.clamp(sphere.phi + (event.clientY - lastY) * .002, .45, 1.4);
      camera.position.copy(overviewLook).add(new THREE.Vector3().setFromSpherical(sphere));camera.lookAt(overviewLook);
      lastX = event.clientX;lastY = event.clientY;
    }
    return;
  }
  if (document.pointerLockElement === renderer.domElement || dragging) {
    const locked = document.pointerLockElement === renderer.domElement;
    yaw -= (locked ? event.movementX : event.clientX - lastX) * .002;
    pitch = THREE.MathUtils.clamp(pitch - (locked ? event.movementY : event.clientY - lastY) * .002, -1.35, 1.35);
    lastX = event.clientX;lastY = event.clientY;
  }
});
const mc=document.querySelector('#minimap'),ctx=mc.getContext('2d');
const mapBackground=document.createElement('canvas');mapBackground.width=360;mapBackground.height=260;
const mapCtx=mapBackground.getContext('2d');
const mapHalfX=4400,mapHalfZ=4100;
const mapPoint=(x,z)=>[180+x/mapHalfX*180,130+z/mapHalfZ*130];
const raster=mapCtx.createImageData(360,260);
for(let py=0;py<260;py++)for(let px=0;px<360;px++){
  const rgb=terrainRGB((px-180)/180*mapHalfX,(py-130)/130*mapHalfZ),i=(py*360+px)*4;
  raster.data[i]=rgb[0];raster.data[i+1]=rgb[1];raster.data[i+2]=rgb[2];raster.data[i+3]=255;
}
mapCtx.putImageData(raster,0,0);
mapCtx.fillStyle='#e4e4db';for(const lot of city.lots){const [x,z]=mapPoint(lot.x,lot.z);mapCtx.fillRect(x,z,Math.max(.7,lot.w/mapHalfX*180),Math.max(.7,lot.d/mapHalfZ*130));}
mapCtx.strokeStyle='#4385a0';mapCtx.lineWidth=CITY.riverWidth/mapHalfZ*130;mapCtx.beginPath();for(let x=-mapHalfX;x<=mapHalfX;x+=20){const [px,pz]=mapPoint(x,riverZ(x));if(x===-mapHalfX)mapCtx.moveTo(px,pz);else mapCtx.lineTo(px,pz);}mapCtx.stroke();
for(const x of CITY.bridges){const [px,pz]=mapPoint(x,riverZ(x));mapCtx.fillStyle='#d7d6c3';mapCtx.fillRect(px-.7,pz-3,.9,6);}
const [baseX,baseZ]=mapPoint(BASE.x,BASE.z);
const [campusLeft,campusTop]=mapPoint(CITY.campus.minX,CITY.campus.minZ);
mapCtx.fillStyle='#c3b48b';mapCtx.fillRect(campusLeft,campusTop,(CITY.campus.maxX-CITY.campus.minX)/mapHalfX*180,(CITY.campus.maxZ-CITY.campus.minZ)/mapHalfZ*130);
const mapBaseWidth=BASE.width*baseScale/mapHalfX*180,mapBaseDepth=BASE.depth*baseScale/mapHalfZ*130;
mapCtx.fillStyle='#8d9cb2';mapCtx.fillRect(baseX-mapBaseWidth/2,baseZ-mapBaseDepth/2,mapBaseWidth,mapBaseDepth);
mapCtx.fillStyle='#b9c4d6';mapCtx.fillRect(baseX-mapBaseWidth/2+BASE.wallThickness*baseScale/mapHalfX*180,baseZ-mapBaseDepth/2+BASE.wallThickness*baseScale/mapHalfZ*130,(BASE.width-BASE.wallThickness*2)*baseScale/mapHalfX*180,(BASE.depth-BASE.wallThickness*2)*baseScale/mapHalfZ*130);
mapCtx.font='8px sans-serif';mapCtx.fillStyle='#294638';mapCtx.fillText('BORDER',baseX-15,baseZ-3);
function drawMap(){ctx.drawImage(mapBackground,0,0);const mapPosition=exploring?motor.position:camera.position;const [px,pz]=mapPoint(mapPosition.x,mapPosition.z);if(exploring){ctx.fillStyle='#214f39';ctx.beginPath();ctx.arc(px,pz,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#214f3977';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(px,pz,7,0,Math.PI*2);ctx.moveTo(px,pz);ctx.lineTo(px-Math.sin(yaw)*13,pz-Math.cos(yaw)*13);ctx.stroke();}else{ctx.strokeStyle='#fff7';ctx.beginPath();ctx.moveTo(140,260);ctx.lineTo(baseX-30,baseZ);ctx.lineTo(baseX+30,baseZ);ctx.lineTo(220,260);ctx.stroke();}document.querySelector('#coordinates').textContent=exploring?`X ${Math.round(mapPosition.x)} / Z ${Math.round(mapPosition.z)}`:'約 7 × 6 km';}
let frames = 0;
renderer.setAnimationLoop(() => {
  const elapsed = Math.min(clock.getDelta(), .5);
  if (exploring) {
    motor.update(Math.min(elapsed, .25), {
      forward: Number(!!(keys.KeyW || keys.ArrowUp)) - Number(!!(keys.KeyS || keys.ArrowDown)),
      strafe: Number(!!(keys.KeyD || keys.ArrowRight)) - Number(!!(keys.KeyA || keys.ArrowLeft)),
      sprint: !!(keys.ShiftLeft || keys.ShiftRight), crouch: crouchRequested,
      jump: !!keys.Space, jumpPressed: jumpQueued,
    }, yaw);
    jumpQueued = false;
    const point = motor.position;
    if (![point.x, point.y, point.z].every(Number.isFinite) || point.y < groundHeight(point.x, point.z) - 8) respawn();
    playerView.update(elapsed, viewState());
    avatar.update(Math.min(elapsed, .25), motor.state);avatar.setVisible(playerView.avatarVisible);syncPlayerHud();
  } else if (target) {
    camera.position.lerp(target.pos, 1 - Math.exp(-elapsed * 2.5));camera.lookAt(target.look);
    if (camera.position.distanceTo(target.pos) < .03) target = null;
  }
  if (++frames % 8 === 0) drawMap();
  city.architecture.update(camera);renderer.render(scene, camera);
});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});drawMap();
// Read-only diagnostics for smoke tests and development.
window.__mikado={get state(){return {exploring,day,current,position:camera.position.toArray(),surfaceHeight:groundHeight(camera.position.x,camera.position.z),objects:scene.children.length,player:{...motor.state,view:playerView.diagnostics,avatar:avatar.diagnostics},city:{architecture:{style:'anime-japanese',footprintScale:ARCHITECTURE.footprintScale,enlargement:ARCHITECTURE.enlargement,layout:'continuous-frontage',floorHeight:ARCHITECTURE.floorHeight,doorHeight:ARCHITECTURE.doorHeight,eyeHeight:PERSON.eyeHeight,...city.architecture.metrics},terrainMode:'continuous-basin',cityShape:'irregular',riverCenter:riverZ(0),basinWidth:CITY.basinX*2,basinDepth:CITY.basinZ*2,buildings:city.lots.length,trees:city.trees,bridges:city.bridges,bounds:CITY.halfSize,riverDirection:'east-west',headquartersCenter:[0,-150]},headquarters:{name:headquarters.name,enlargement:BASE.enlargement,openRoof:headquarters.openRoof,wallCount:headquarters.wallCount,courtyard:{width:headquarters.courtyard.width*baseScale,depth:headquarters.courtyard.depth*baseScale},width:headquarters.width*baseScale,depth:headquarters.depth*baseScale,height:headquarters.height*baseScale,towers:headquarters.towers,emblems:headquarters.emblems}};}};

const overviewButton=document.querySelector('#overview');
overviewButton.onclick=()=>{if(exploring)leave();document.body.classList.add('overview');target={pos:overviewPosition.clone(),look:overviewLook.clone()};document.querySelector('#location').textContent='三門市全域';};
renderer.domElement.addEventListener('wheel', event => {
  if (exploring) { event.preventDefault();playerView.zoom(event.deltaY);return; }
  if (!document.body.classList.contains('overview')) return;
  event.preventDefault();target = null;
  const offset = camera.position.clone().sub(overviewLook);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(event.deltaY * .0007), 3000, 14000));
  camera.position.copy(overviewLook).add(offset);camera.lookAt(overviewLook);
}, { passive: false });
document.body.classList.add('overview');
document.querySelector('#location').textContent='三門市全域';
