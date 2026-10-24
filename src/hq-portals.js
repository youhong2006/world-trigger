import * as THREE from 'three';

// These entrances connect separate scenes. No traversable tunnel is cut into the solid city landmark.
export const HQ_PORTALS = Object.freeze({
  city: Object.freeze({
    world: 'city',
    x: 0,
    y: 0,
    z: 260,
    halfWidth: 6,
    height: 18,
    approach: 1,
    name: '進入 BORDER 基地世界',
  }),
  hq: Object.freeze({
    world: 'hq',
    x: 0,
    y: 0,
    z: 244,
    halfWidth: 6,
    height: 18,
    approach: -1,
    name: '返回三門市',
  }),
});
export const HQ_PORTAL_COOLDOWN = 1.2;

export function portalNear(position, world, radius = 2.5) {
  const portal = HQ_PORTALS[world];
  if (!portal || !position || ![position.x, position.y, position.z].every(Number.isFinite)) return false;
  return (
    Math.abs(position.x - portal.x) <= portal.halfWidth &&
    Math.abs(position.z - portal.z) <= radius &&
    position.y >= portal.y - 0.25 &&
    position.y < portal.y + 2.5
  );
}

function addVisual(scene, world) {
  if (!scene) return null;
  const spec = HQ_PORTALS[world],
    root = new THREE.Group();
  root.name = world === 'city' ? 'BORDER city entrance portal' : 'BORDER return portal';
  scene.add(root);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const frame = new THREE.MeshStandardMaterial({ color: '#142b3b', roughness: 0.55, metalness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: '#55e9ed', toneMapped: false });
  const pane = new THREE.MeshBasicMaterial({
    color: '#0c4d65',
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const box = (x, y, z, w, h, d, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y + h / 2, z);
    mesh.scale.set(w, h, d);
    root.add(mesh);
    return mesh;
  };
  const doorZ = world === 'city' ? 250.75 : 244,
    facing = world === 'city' ? 1 : -1;
  for (const side of [-1, 1]) {
    box(side * 6.4, 0, doorZ, 0.7, 18, 0.65, frame);
    box(side * 5.9, 0.3, doorZ + facing * 0.38, 0.12, 17.2, 0.08, glow);
  }
  box(0, 17.5, doorZ, 13.4, 0.65, 0.7, frame);
  box(0, 17.25, doorZ + facing * 0.4, 12, 0.12, 0.09, glow);
  box(0, 0.03, world === 'city' ? 256 : 242, 12, 0.025, world === 'city' ? 14 : 5, frame);
  for (const side of [-1, 1])
    box(side * 5.6, 0.06, world === 'city' ? 256 : 242, 0.12, 0.03, world === 'city' ? 14 : 5, glow);
  box(0, 0.07, spec.z, 11.2, 0.03, 0.12, glow);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(11.7, 17), pane);
  mesh.position.set(0, 8.6, doorZ + facing * 0.4);
  root.add(mesh);
  for (const x of [-3, 0, 3]) box(x, 0.5, doorZ + facing * 0.44, 0.035, 16, 0.025, glow);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d2639';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#bcfcff';
    ctx.font = '600 43px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      world === 'city' ? 'BORDER 基地世界  /  正面傳送入口' : '三門市  /  返回傳送門',
      512,
      64,
      990,
    );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 1.5),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    label.position.set(0, 15.8, doorZ + facing * 0.48);
    label.rotation.y = world === 'city' ? 0 : Math.PI;
    root.add(label);
  }
  return root;
}

export function createHQPortals({ cityScene, interiorScene, onEnter = () => {}, onExit = () => {} } = {}) {
  const roots = { city: addVisual(cityScene, 'city'), hq: addVisual(interiorScene, 'hq') };
  let cooldown = HQ_PORTAL_COOLDOWN,
    previous = null,
    available = null,
    transfers = 0,
    pendingCross = null,
    enabledActive = false;
  function transfer(world) {
    if (cooldown > 0 || !HQ_PORTALS[world]) return false;
    cooldown = HQ_PORTAL_COOLDOWN;
    previous = null;
    available = null;
    pendingCross = null;
    transfers++;
    (world === 'city' ? onEnter : onExit)();
    return true;
  }
  return {
    roots,
    update(dt, position, world = 'city', enabled = true) {
      cooldown = Math.max(0, cooldown - Math.max(0, Number.isFinite(dt) ? dt : 0));
      const portal = HQ_PORTALS[world];
      available = null;
      enabledActive = enabled;
      if (!enabled || !portal || !position || ![position.x, position.y, position.z].every(Number.isFinite)) {
        previous = null;
        pendingCross = null;
        return null;
      }
      if (cooldown === 0 && portalNear(position, world))
        available = { ...portal, action: world === 'city' ? 'enter' : 'exit' };
      if (
        pendingCross?.world !== world ||
        (position.z - portal.z) * portal.approach > 0 ||
        Math.abs(position.x - portal.x) >= portal.halfWidth ||
        Math.abs(position.z - portal.z) > 12
      )
        pendingCross = null;
      if (
        cooldown === 0 &&
        pendingCross?.world === world &&
        position.y >= portal.y - 0.25 &&
        position.y < portal.y + portal.height - 0.25
      ) {
        transfer(world);
        return null;
      }
      if (previous?.world === world) {
        const a = (previous.position.z - portal.z) * portal.approach,
          b = (position.z - portal.z) * portal.approach;
        if (a > 0 && b <= 0) {
          const t = a / (a - b),
            x = previous.position.x + (position.x - previous.position.x) * t,
            y = previous.position.y + (position.y - previous.position.y) * t;
          if (
            Math.abs(x - portal.x) < portal.halfWidth - 0.25 &&
            y >= portal.y - 0.25 &&
            y < portal.y + portal.height - 0.25
          ) {
            if (cooldown === 0) {
              transfer(world);
              return null;
            }
            pendingCross = { world };
          }
        }
      }
      previous = { world, position: { ...position } };
      return available;
    },
    interact(position, world = 'city') {
      return enabledActive && portalNear(position, world) && transfer(world);
    },
    reset() {
      cooldown = HQ_PORTAL_COOLDOWN;
      previous = null;
      available = null;
      pendingCross = null;
      enabledActive = false;
    },
    get snapshot() {
      return { cooldown, nearby: available ? { ...available } : null, transfers };
    },
  };
}
