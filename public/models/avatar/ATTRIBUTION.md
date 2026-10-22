# Playable human avatar

- Model: **Rogue**, from **KayKit – Character Pack: Adventurers 1.0**.
- Author: **Kay Lousberg / KayKit** — https://kaylousberg.com/
- License: **Creative Commons Zero 1.0 Universal (CC0)**. Free for personal, educational and commercial use; attribution is optional. The creator's original license text is included in [LICENSE.txt](LICENSE.txt).
- Official pack and license statement: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- Pack page: https://kaylousberg.itch.io/kaykit-adventurers
- Source revision: `672074b73ba276876a19e8816ecdc5241817ab47`
- Original file: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue.glb
- Original license: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/LICENSE.txt

## Adaptations in this project

`rogue.glb` preserves the original mesh, skin, bones and embedded texture. It retains eight useful clips (Idle, Unarmed_Idle, Walking_A, Running_A, Jump_Start, Jump_Idle, Jump_Land and Sit_Chair_Pose); unused animation data was removed, reducing the file from 3,616,284 to 633,856 bytes. The browser hides accessory weapons, sets standing height to 1.8 metres, removes root motion, blends clips, and adds a bone-based crouching pose. Crouch walking combines bent knees/hips with an animated gait.

The included avatar is a provisional exploration character, not a World Trigger character. All assets are served from this repository; no account, external CDN, API key or runtime asset service is required.

If the file cannot be loaded, the app displays an original, locally generated skinned humanoid with the same movement states, so third-person controls remain usable.
