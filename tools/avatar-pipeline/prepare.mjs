import {NodeIO,Accessor} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,join,textureCompress} from '@gltf-transform/functions';
import * as THREE from 'three';
import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
const [modelPath, motionPath, outputPath] = process.argv.slice(2);
if (!modelPath || !motionPath || !outputPath) throw new Error('Usage: node prepare.mjs model.vrm AnimationLibrary_Godot_Standard.gltf output.glb');
const sourceBytes=readFileSync(modelPath);
const raw=JSON.parse(sourceBytes.subarray(20,20+sourceBytes.readUInt32LE(12)).toString());
if(raw.extensions.VRM.meta.licenseName!=='CC0')throw Error('Source model must explicitly permit CC0 reuse');
const humanoid=Object.fromEntries(raw.extensions.VRM.humanoid.humanBones.map(b=>[b.bone,raw.nodes[b.node].name]));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target=await io.readBinary(sourceBytes), source=await io.read(motionPath);
const targetNodes=new Map(target.getRoot().listNodes().map(n=>[n.getName(),n]));
const rest=new Map(source.getRoot().listNodes().map(n=>[n,{q:[...n.getRotation()],p:[...n.getTranslation()]}]));
const tpose=source.getRoot().listAnimations().find(a=>a.getName()==='A_TPose');
for(const c of tpose.listChannels()){
 const a=c.getSampler().getOutput().getArray();
 if(c.getTargetPath()==='rotation')c.getTargetNode().setRotation(Array.from(a.slice(0,4)));
 if(c.getTargetPath()==='translation')c.getTargetNode().setTranslation(Array.from(a.slice(0,3)));
}
const world=new Map(source.getRoot().listNodes().map(n=>[n,{q:new THREE.Quaternion().fromArray(n.getWorldRotation()),p:new THREE.Vector3().fromArray(n.getWorldTranslation())}]));
const map={ 'DEF-hips':'hips','DEF-spine.001':'spine','DEF-spine.002':'chest','DEF-spine.003':'upperChest','DEF-neck':'neck','DEF-head':'head' };
for(const [suffix,side] of [['L','left'],['R','right']]){
 for(const [from,to] of [['shoulder','Shoulder'],['upper_arm','UpperArm'],['forearm','LowerArm'],['hand','Hand'],['thigh','UpperLeg'],['shin','LowerLeg'],['foot','Foot'],['toe','Toes']])map[`DEF-${from}.${suffix}`]=side+to;
 for(const finger of ['index','middle','ring','pinky','thumb'])for(let i=1;i<=3;i++)map[`DEF-${finger==='thumb'?'thumb':'f_'+finger}.0${i}.${suffix}`]=side+(finger==='pinky'?'Little':finger[0].toUpperCase()+finger.slice(1))+['Proximal','Intermediate','Distal'][i-1];
}
const targetHips=targetNodes.get(humanoid.hips),sourceHips=source.getRoot().listNodes().find(n=>n.getName()==='DEF-hips');
const hipsScale=targetHips.getWorldTranslation()[1]/world.get(sourceHips).p.y;
const selected=['Idle_Loop','Walk_Loop','Sprint_Loop','Jump_Start','Jump_Loop','Jump_Land','Crouch_Idle_Loop','Crouch_Fwd_Loop','Sword_Attack','Sword_Idle','Roll','Hit_Chest','Hit_Head','Death01'];
const buffer=target.getRoot().listBuffers()[0];
for(const anim of source.getRoot().listAnimations().filter(a=>selected.includes(a.getName()))){
 const result=target.createAnimation(anim.getName());
 for(const c of anim.listChannels()){
  const bone=c.getTargetNode(),human=map[bone.getName()],dest=targetNodes.get(humanoid[human]);
  if(!dest)continue;
  const path=c.getTargetPath();if(path!=='rotation'&&!(path==='translation'&&human==='hips'))continue;
  const sampler=c.getSampler(),input=sampler.getInput(),output=sampler.getOutput(),values=new Float32Array(output.getArray().length);
  if(sampler.getInterpolation()==='CUBICSPLINE')throw Error('Cubic tangents need explicit rotation conversion');
  if(path==='rotation'){
   const parent=bone.getParentNode();const parentRest=world.get(parent)?.q??new THREE.Quaternion();
   const inverse=world.get(bone).q.clone().invert();
   for(let i=0;i<values.length;i+=4){
    const q=new THREE.Quaternion().fromArray(output.getArray(),i).premultiply(parentRest).multiply(inverse).normalize();
    // VRoid 0.x faces -Z; Quaternius faces +Z. Conjugate the motion by Y=PI.
    q.x=-q.x;q.z=-q.z;q.toArray(values,i);
   }
  } else {
   const parent=bone.getParentNode();const parentQ=world.get(parent)?.q??new THREE.Quaternion();
   const parentP=world.get(parent)?.p??new THREE.Vector3();const base=dest.getTranslation();
   for(let i=0;i<values.length;i+=3){
    const key=new THREE.Vector3().fromArray(output.getArray(),i).applyQuaternion(parentQ).add(parentP);
    values[i]=base[0];values[i+1]=base[1]+(key.y-world.get(bone).p.y)*hipsScale;values[i+2]=base[2];
   }
  }
  const times=target.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Float32Array(input.getArray())).setBuffer(buffer);
  const keys=target.createAccessor().setType(output.getType()).setArray(values).setBuffer(buffer);
  const s=target.createAnimationSampler().setInput(times).setOutput(keys).setInterpolation(sampler.getInterpolation());
  result.addSampler(s).addChannel(target.createAnimationChannel().setTargetNode(dest).setTargetPath(path).setSampler(s));
 }
}
for(const mat of target.getRoot().listMaterials())mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null).setExtension('KHR_materials_unlit',null);
target.getRoot().listScenes()[0].setExtras({humanoid,avatarSource:'VRoid Studio HairSample_Male',license:'CC0-1.0',animationSource:'Quaternius Universal Animation Library Standard'});
await target.transform(dedup(),prune(),join({keepNamed:false}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:92}));
await io.write(outputPath,target);
console.log(JSON.stringify({sourceBytes:sourceBytes.length,outputBytes:readFileSync(outputPath).length,meshes:target.getRoot().listMeshes().length,textures:target.getRoot().listTextures().length,clips:target.getRoot().listAnimations().map(a=>a.getName()),humanoid}));
