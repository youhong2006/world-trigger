import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERSON } from './building-metrics.js';
import { CHARACTER, createCharacterMotor } from './character-motor.js';
import { createPlayerCamera } from './player-camera.js';
import { PerspectiveCamera } from 'three';

const bytes = readFileSync(new URL('../public/models/avatar/adult-explorer.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binOffset = 28 + jsonLength;

test('the adult model is a self-contained licensed GLB with normals for toon lighting', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 6 * 1024 * 1024, 'avoid shipping the unoptimized 18MB source');
  assert.equal(gltf.scenes[0].extras.license, 'CC0-1.0');
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.ok(gltf.images.every(image => Number.isInteger(image.bufferView) && !image.uri));
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.ok(Number.isInteger(primitive.attributes.NORMAL), 'lit character meshes need surface normals');
    assert.equal(gltf.accessors[primitive.attributes.NORMAL].count, gltf.accessors[primitive.attributes.POSITION].count);
    assert.ok(Number.isInteger(primitive.attributes.JOINTS_0));
  }
});

test('the imported face has adult proportions and gameplay uses the requested 1.75 metre height', () => {
  const face = gltf.meshes.find(mesh => /^Face/.test(mesh.name));
  assert.ok(face);
  const positions = gltf.meshes.flatMap(mesh => mesh.primitives.map(primitive => gltf.accessors[primitive.attributes.POSITION]));
  const facePositions = face.primitives.map(primitive => gltf.accessors[primitive.attributes.POSITION]);
  const height = Math.max(...positions.map(a => a.max[1])) - Math.min(...positions.map(a => a.min[1]));
  const faceHeight = Math.max(...facePositions.map(a => a.max[1])) - Math.min(...facePositions.map(a => a.min[1]));
  assert.ok(faceHeight / height < .20, 'avoid returning to a large-headed chibi avatar');
  assert.equal(PERSON.height, 1.75);
  assert.equal(CHARACTER.standingHeight, 1.75);
  const motor = createCharacterMotor({ groundHeight: () => .2 });
  assert.equal(motor.height, PERSON.height);
  const camera = new PerspectiveCamera();
  createPlayerCamera({ camera, groundHeight: () => .2 }).update(0, { position: motor.position });
  assert.ok(Math.abs(camera.position.y - .2 - PERSON.eyeHeight) < 1e-8);
  assert.ok(PERSON.height - PERSON.eyeHeight >= .1);
});

test('locomotion and combat clips have valid retargeted joints and no horizontal root travel', () => {
  const expected = ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop','Sword_Attack','Sword_Idle','Roll','Hit_Chest','Hit_Head','Death01'];
  assert.deepEqual(gltf.animations.map(clip => clip.name).sort(), expected.sort());
  const hips = gltf.nodes.findIndex(node => node.name === gltf.scenes[0].extras.humanoid.hips);
  for (const clip of gltf.animations) {
    assert.ok(clip.channels.length > 15);
    for (const channel of clip.channels) {
      assert.ok(gltf.nodes[channel.target.node]);
      const output = gltf.accessors[clip.samplers[channel.sampler].output];
      const view = gltf.bufferViews[output.bufferView];
      const offset = binOffset + (view.byteOffset ?? 0) + (output.byteOffset ?? 0);
      assert.equal(output.componentType, 5126);
      if (channel.target.path === 'rotation') {
        for (let key = 0; key < output.count; key++) {
          let norm = 0;
          for (let component = 0; component < 4; component++) norm += bytes.readFloatLE(offset + key * 16 + component * 4) ** 2;
          assert.ok(Math.abs(norm - 1) < 1e-4, 'retargeted joint rotations must stay normalized');
        }
      } else if (channel.target.path === 'translation') {
        assert.equal(channel.target.node, hips);
        for (let key = 1; key < output.count; key++) for (const component of [0, 2]) {
          assert.equal(bytes.readFloatLE(offset + key * 12 + component * 4), bytes.readFloatLE(offset + component * 4));
        }
      }
    }
  }
});
