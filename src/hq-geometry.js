import * as THREE from 'three';

// Faces: bottom, top, back, right, front, left. Separate vertices keep metal panels flat.
export function fortressGeometry(volume, innerFace = 2) {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(volume.vertices.flat(), 3));
  const triangles = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4,
    7,
  ];
  for (let i = 0; i < triangles.length; i += 3)
    [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
  source.setIndex(triangles);
  const geometry = source.toNonIndexed();
  source.dispose();
  const pos = geometry.attributes.position,
    uv = [];
  for (let i = 0; i < pos.count; i++) {
    const face = Math.floor(i / 6),
      x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const u = face === 3 || face === 5 ? (z - volume.z) / volume.d + 0.5 : (x - volume.x) / volume.w + 0.5;
    uv.push(u, face < 2 ? (z - volume.z) / volume.d + 0.5 : (y - volume.y) / volume.h);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (let face = 0; face < 6; face++)
    geometry.addGroup(face * 6, 6, face < 2 ? 2 : face === innerFace ? 1 : 0);
  geometry.computeVertexNormals();
  return geometry;
}
