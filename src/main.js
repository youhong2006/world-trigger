import * as THREE from 'three';
import './style.css';
import { createHeadquarters } from './headquarters.js';
import { createCity } from './city.js';
import { CITY, riverZ, groundHeight, createCollisionIndex } from './city-layout.js';

const host = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#72b5e4');
scene.fog = new THREE.Fog('#accdd9', 1600, 5300);
const overviewPosition = new THREE.Vector3(140, 800, 1710);
const overviewLook = new THREE.Vector3(0, 45, -120);
const camera = new THREE.PerspectiveCamera(51, innerWidth / innerHeight, 1, 9000);
camera.position.copy(overviewPosition);
camera.lookAt(overviewLook);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  host.innerHTML = '<p style="padding:100px">此裝置無法啟動 WebGL。請啟用瀏覽器硬體加速後重新載入。</p>';
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);
const ambient = new THREE.HemisphereLight('#e0efff', '#6c8651', 1.9);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff4dd', 2.5);
sun.position.set(-440, 650, 360);
sun.target.position.set(0, 0, -150);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 1800 });
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
  if (collide) collision.add({ x, z, w, d });
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
const city = createCity({ scene, box, cylinder, collision });

// Keep the reference model intact, scaled and recentered in the new city plan.
const baseGroup = new THREE.Group();
const baseScale = 3.2;
const baseOffset = new THREE.Vector3(-23 * baseScale, 0, -150 + 117 * baseScale);
baseGroup.scale.setScalar(baseScale);
baseGroup.position.copy(baseOffset);
scene.add(baseGroup);
const headquarters = createHeadquarters({
  scene: baseGroup,
  box(x, y, z, w, h, d, color, collide = false) {
    const mesh = box(x, y, z, w, h, d, color, false, baseGroup);
    if (collide) collision.add({ x: x * baseScale + baseOffset.x, z: z * baseScale + baseOffset.z, w: w * baseScale, d: d * baseScale });
    return mesh;
  },
  cylinder: (x, y, z, r, h, color, n) => cylinder(x, y, z, r, h, color, n, baseGroup),
});
const destinations = [
  { name: '住宅街', pos: new THREE.Vector3(-504, 1.75, 360), yaw: 0, previewPosition: new THREE.Vector3(-345, 115, 590), previewLook: new THREE.Vector3(-504, 0, 300) },
  { name: 'BORDER 本部', pos: new THREE.Vector3(0, 1.75, 40), yaw: 0, pitch: 0.32, previewPosition: new THREE.Vector3(260, 128, 130), previewLook: new THREE.Vector3(0, 60, -150) },
  { name: '河川敷', pos: new THREE.Vector3(0, 1.75, riverZ(0) - 65), yaw: Math.PI, previewPosition: new THREE.Vector3(280, 180, 900), previewLook: new THREE.Vector3(0, 0, 550) },
  { name: '山丘公園', pos: new THREE.Vector3(-647, 30.75, 120), yaw: -1.88, previewPosition: new THREE.Vector3(-800, 160, 440), previewLook: new THREE.Vector3(-470, 25, 80) },
];
let exploring=false,yaw=0,pitch=0,keys={},target=null,day=true,current=0;const walking=document.querySelector('#walking');const clock=new THREE.Clock();const toast=document.querySelector('#toast');let toastTimer;
function notify(t){toast.textContent=t;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);}
function enter(){exploring=true;document.body.classList.add('exploring');document.body.classList.remove('overview');walking.hidden=false;camera.position.copy(destinations[current].pos);yaw=destinations[current].yaw;pitch=destinations[current].pitch??0;target=null;camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);try{renderer.domElement.requestPointerLock()?.catch(()=>notify('可按住畫面拖曳視角，使用 WASD 移動'));}catch{notify('按住畫面拖曳視角，使用 WASD 移動');}}
function leave(){exploring=false;keys={};document.body.classList.remove('exploring');document.body.classList.add('overview');walking.hidden=true;document.exitPointerLock?.();target={pos:overviewPosition.clone(),look:overviewLook.clone()};}
document.querySelector('#enter').onclick=enter;document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&exploring)leave();});
document.querySelectorAll('.place').forEach(b=>b.onclick=()=>{current=Number(b.dataset.place);document.querySelectorAll('.place').forEach(p=>p.classList.toggle('active',p===b));document.body.classList.remove('overview');const dest=destinations[current];target={pos:dest.previewPosition?.clone()??dest.pos.clone().add(new THREE.Vector3(28,22,32)),look:dest.previewLook?.clone()??dest.pos.clone().add(new THREE.Vector3(0,3,-14))};notify('已抵達 '+dest.name+' · 點擊開始漫遊進入街道');document.querySelector('#location').textContent=dest.name;});
document.querySelector('#reset').onclick=()=>{if(exploring)leave();current=0;document.body.classList.add('overview');target={pos:overviewPosition.clone(),look:overviewLook.clone()};document.querySelectorAll('.place').forEach((p,i)=>p.classList.toggle('active',i===0));document.querySelector('#location').textContent='住宅街';};
document.querySelector('#day').onclick=()=>{day=!day;scene.background.set(day?'#72b5e4':'#14273e');scene.fog.color.set(day?'#accdd9':'#233c50');ambient.intensity=day?1.9:.7;sun.intensity=day?2.5:.3;city.clouds.material.opacity=day?.86:.2;sun.color.set(day?'#ffeed1':'#b8d5fc');document.querySelector('#day').innerHTML=day?'☀ <span>日間</span>':'☾ <span>夜間</span>';};
const guide=document.querySelector('#guide');document.querySelector('#help').onclick=()=>{if(exploring)leave();guide.showModal();};document.querySelector('#close-guide').onclick=()=>guide.close();guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});
let audioCtx,noiseSource,audioGain,soundOn=false;document.querySelector('#sound').onclick=async()=>{try{if(!audioCtx){audioCtx=new AudioContext();const buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*4,audioCtx.sampleRate);const samples=buffer.getChannelData(0);let v=0;for(let i=0;i<samples.length;i++){v=(v+(Math.random()*2-1)*.03)/1.02;samples[i]=v;}noiseSource=audioCtx.createBufferSource();noiseSource.buffer=buffer;noiseSource.loop=true;const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=550;audioGain=audioCtx.createGain();audioGain.gain.value=0;noiseSource.connect(filter).connect(audioGain).connect(audioCtx.destination);noiseSource.start();}await audioCtx.resume();soundOn=!soundOn;audioGain.gain.setTargetAtTime(soundOn?.45:0,audioCtx.currentTime,.5);document.querySelector('#sound').innerHTML=soundOn?'♫ <span>音效開啟</span>':'♫ <span>音效關閉</span>';}catch{notify('此瀏覽器不支援環境音效');}};
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='Escape'&&exploring)leave();});window.addEventListener('keyup',e=>keys[e.code]=false);window.addEventListener('blur',()=>keys={});let dragging=false,lastX=0,lastY=0;
renderer.domElement.addEventListener('pointerdown',e=>{if(exploring||document.body.classList.contains('overview')){dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);}});window.addEventListener('pointerup',()=>dragging=false);window.addEventListener('pointermove',e=>{if(!exploring){if(dragging&&document.body.classList.contains('overview')){target=null;const offset=camera.position.clone().sub(overviewLook),sphere=new THREE.Spherical().setFromVector3(offset);sphere.theta-=(e.clientX-lastX)*.003;sphere.phi=THREE.MathUtils.clamp(sphere.phi+(e.clientY-lastY)*.002,.45,1.4);camera.position.copy(overviewLook).add(new THREE.Vector3().setFromSpherical(sphere));camera.lookAt(overviewLook);lastX=e.clientX;lastY=e.clientY;}return;}if(document.pointerLockElement===renderer.domElement||dragging){let dx=document.pointerLockElement?e.movementX:e.clientX-lastX,dy=document.pointerLockElement?e.movementY:e.clientY-lastY;yaw-=dx*.002;pitch=THREE.MathUtils.clamp(pitch-dy*.002,-1.35,1.35);lastX=e.clientX;lastY=e.clientY;}});
const mc=document.querySelector('#minimap'),ctx=mc.getContext('2d');
const mapBackground=document.createElement('canvas');mapBackground.width=360;mapBackground.height=260;
const mapCtx=mapBackground.getContext('2d');
const mapPoint=(x,z)=>[180+x/7,130+z/9.6];
mapCtx.fillStyle='#91ae78';mapCtx.fillRect(0,0,360,260);
for(const forest of CITY.forests){const [x,z]=mapPoint(forest.x,forest.z);mapCtx.fillStyle='#3c764b';mapCtx.beginPath();mapCtx.ellipse(x,z,forest.rx/7,forest.rz/9.6,0,0,Math.PI*2);mapCtx.fill();}
mapCtx.fillStyle='#dce0d5';for(const lot of city.lots){const [x,z]=mapPoint(lot.x,lot.z);mapCtx.fillRect(x,z,1.6,1.5);}
mapCtx.strokeStyle='#568da5';mapCtx.lineWidth=CITY.riverWidth/9.6;mapCtx.beginPath();for(let x=-1260;x<=1260;x+=20){const [px,pz]=mapPoint(x,riverZ(x));if(x===-1260)mapCtx.moveTo(px,pz);else mapCtx.lineTo(px,pz);}mapCtx.stroke();
for(const x of CITY.bridges){const [px,pz]=mapPoint(x,riverZ(x));mapCtx.fillStyle='#d7d6c3';mapCtx.fillRect(px-1.5,pz-6,3,12);}
const [baseX,baseZ]=mapPoint(0,-150);mapCtx.fillStyle='#c3b48b';mapCtx.fillRect(baseX-22,baseZ-12,44,24);mapCtx.fillStyle='#8d9cb2';mapCtx.fillRect(baseX-14,baseZ-7,28,14);mapCtx.font='8px sans-serif';mapCtx.fillStyle='#294638';mapCtx.fillText('BORDER',baseX-15,baseZ-16);
function drawMap(){ctx.drawImage(mapBackground,0,0);const [px,pz]=mapPoint(camera.position.x,camera.position.z);if(exploring){ctx.fillStyle='#214f39';ctx.beginPath();ctx.arc(px,pz,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#214f3977';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(px,pz,7,0,Math.PI*2);ctx.moveTo(px,pz);ctx.lineTo(px-Math.sin(yaw)*13,pz-Math.cos(yaw)*13);ctx.stroke();}else{ctx.strokeStyle='#fff7';ctx.beginPath();ctx.moveTo(140,260);ctx.lineTo(baseX-30,baseZ);ctx.lineTo(baseX+30,baseZ);ctx.lineTo(220,260);ctx.stroke();}document.querySelector('#coordinates').textContent=exploring?`X ${Math.round(camera.position.x)} / Z ${Math.round(camera.position.z)}`:'2.2 × 2.2 km';}
function blocked(x,z){return collision.blocked(x,z);}
let frames=0;renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);if(exploring){camera.rotation.set(pitch,yaw,0,'YXZ');let f=Number(!!(keys.KeyW||keys.ArrowUp))-Number(!!(keys.KeyS||keys.ArrowDown)),s=Number(!!(keys.KeyD||keys.ArrowRight))-Number(!!(keys.KeyA||keys.ArrowLeft));const length=Math.hypot(f,s)||1,speed=(keys.ShiftLeft||keys.ShiftRight?44:12)*dt;let dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)/length*speed,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)/length*speed;const nx=THREE.MathUtils.clamp(camera.position.x+dx,-CITY.halfSize,CITY.halfSize),nz=THREE.MathUtils.clamp(camera.position.z+dz,-CITY.halfSize,CITY.halfSize);if(!blocked(nx,camera.position.z))camera.position.x=nx;if(!blocked(camera.position.x,nz))camera.position.z=nz;const ground=groundHeight(camera.position.x,camera.position.z);camera.position.y=THREE.MathUtils.lerp(camera.position.y,ground+1.75,Math.min(1,dt*10));}else if(target){camera.position.lerp(target.pos,1-Math.exp(-dt*2.5));camera.lookAt(target.look);if(camera.position.distanceTo(target.pos)<.03)target=null;}if(++frames%8===0)drawMap();renderer.render(scene,camera);});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});drawMap();
// Read-only diagnostics for smoke tests and development.
window.__mikado={get state(){return {exploring,day,current,position:camera.position.toArray(),objects:scene.children.length,city:{buildings:city.lots.length,trees:city.trees,bridges:city.bridges,bounds:CITY.halfSize,riverDirection:'east-west',headquartersCenter:[0,-150]},headquarters:{name:headquarters.name,width:headquarters.width*baseScale,depth:headquarters.depth*baseScale,height:headquarters.height*baseScale,towers:headquarters.towers,emblems:headquarters.emblems}};}};

const overviewButton=document.querySelector('#overview');
overviewButton.onclick=()=>{if(exploring)leave();document.body.classList.add('overview');target={pos:overviewPosition.clone(),look:overviewLook.clone()};document.querySelector('#location').textContent='三門市全域';};
renderer.domElement.addEventListener('wheel',e=>{if(exploring||!document.body.classList.contains('overview'))return;e.preventDefault();target=null;const offset=camera.position.clone().sub(overviewLook);offset.setLength(THREE.MathUtils.clamp(offset.length()*Math.exp(e.deltaY*.0007),650,3200));camera.position.copy(overviewLook).add(offset);camera.lookAt(overviewLook);},{passive:false});
document.body.classList.add('overview');
document.querySelector('#location').textContent='三門市全域';
