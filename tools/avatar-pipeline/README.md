# Optional avatar asset pipeline

The website uses the checked-in GLB; normal `npm ci`, `npm test` and `npm run build` do not run this tool or need these optional dependencies.

The converter accepts a CC0 VRoid 0.x model and Quaternius's CC0 Standard animation library. It preserves humanoid mapping, retargets a T-pose-normalized skeleton, removes root travel, keeps eight locomotion and six combat clips, preserves normals for toon lighting and packages WebP textures up to 1024 pixels. Runtime styling and the original skinned coat are in `src/player-avatar.js`.

```sh
npm ci --prefix tools/avatar-pipeline
mkdir -p /tmp/mikado-avatar-source
curl -fL https://raw.githubusercontent.com/madjin/vrm-samples/e16eb187100149a315ad92c3c9968f1d5baa6c7d/vroid/beta/HairSample_Male.vrm -o /tmp/mikado-avatar-source/HairSample_Male.vrm
curl -fL https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/e24c23cf2a1323488a3faa226ea7ea21f644b73e/glTF/AnimationLibrary_Godot_Standard.gltf -o /tmp/mikado-avatar-source/AnimationLibrary_Godot_Standard.gltf
curl -fL https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/e24c23cf2a1323488a3faa226ea7ea21f644b73e/glTF/AnimationLibrary_Godot_Standard.bin -o /tmp/mikado-avatar-source/AnimationLibrary_Godot_Standard.bin
node tools/avatar-pipeline/prepare.mjs /tmp/mikado-avatar-source/HairSample_Male.vrm /tmp/mikado-avatar-source/AnimationLibrary_Godot_Standard.gltf public/models/avatar/adult-explorer.glb
```

Original source metadata and hashes are recorded in `public/models/avatar/SOURCE-METADATA.json`. Verify licenses and update that record when changing inputs. Both sources currently use CC0; the converter also rejects a model whose embedded metadata does not explicitly say CC0.
