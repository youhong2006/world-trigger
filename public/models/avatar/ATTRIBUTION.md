# Adult anime exploration avatar

## Model — CC0

- Base model: **HairSample_Male**, a VRoid Studio beta male example distributed by **pixiv / VRoid Studio**.
- License: **CC0 1.0 Universal**. The original VRM's embedded metadata explicitly sets `licenseName: CC0`, allows everyone, and permits commercial use. A copy of the original metadata and source hashes is in [SOURCE-METADATA.json](SOURCE-METADATA.json).
- Source mirror: https://github.com/madjin/vrm-samples/blob/e16eb187100149a315ad92c3c9968f1d5baa6c7d/vroid/beta/HairSample_Male.vrm
- VRoid Studio's sample model licensing explanation: https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use-
- The source repository distinguishes these older CC0 samples from the newer AvatarSample_A/B/C assets with separate terms. This project uses HairSample_Male.

## Animation — CC0

- Author: **Quaternius**.
- Pack: **Universal Animation Library, Standard / FREE version**.
- Official page: https://quaternius.itch.io/universal-animation-library
- Source mirror: https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e
- Original CC0 license: https://github.com/J-Ponzo/gltf-universal-animation-library/blob/e24c23cf2a1323488a3faa226ea7ea21f644b73e/LICENSE
- Included motions: Idle_Loop, Walk_Loop, Sprint_Loop, Jump_Start, Jump_Loop, Jump_Land, Crouch_Idle_Loop, Crouch_Fwd_Loop.

## Adaptations

The model and selected motions are retargeted into `adult-explorer.glb`. Root travel is removed so the game controller determines position. Unused VRM extensions, thumbnail and normal/matcap textures are removed; base textures are packaged as WebP at up to 1024 pixels. Normals are retained for toon lighting. The model's humanoid bone mapping is preserved in scene metadata.

The game sets standing height to approximately **1.75 metres**, uses grey-purple hair and a dark uniform, and adds an original skinned split coat and grey trim. Crouching includes a small additive torso adjustment for low clearance. This is an adapted, generic exploration character inspired by the supplied clothing reference, not the pictured original character.

All model textures and animation are served locally from this repository. No avatar account, runtime CDN or API key is needed. CC0 legal text is in [LICENSE.txt](LICENSE.txt).
