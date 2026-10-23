import * as THREE from 'three';
import { HQ, HQ_FLOORS, HQ_STOPS, HQ_ROOMS, stairFlights } from './hq-layout.js';

// Static furniture is instanced by floor/material. Colliders stay loaded when visual floors are culled.
export function createHQInterior({ scene, collision }) {
  const root = new THREE.Group();
  root.name = 'BORDER occupied wing';
  scene.add(root);
  const groups = [],
    batches = new Map(),
    objects = [],
    doors = [],
    projections = [],
    liftDoors = [];
  const cube = new THREE.BoxGeometry(1, 1, 1),
    matrix = new THREE.Matrix4(),
    quat = new THREE.Quaternion();
  const material = new Map();
  function mat(color) {
    if (!material.has(color))
      material.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.75,
          emissive: color,
          emissiveIntensity: color === '#37dce7' ? 0.65 : 0.22,
        }),
      );
    return material.get(color);
  }
  function group(y, name) {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    g.userData.y = y;
    groups.push(g);
    return g;
  }
  function box(g, x, y, z, w, h, d, color = '#97a7b9', collide = true) {
    const key = g.uuid + color;
    if (!batches.has(key)) batches.set(key, { g, color, items: [] });
    batches.get(key).items.push({ x, y: y + h / 2, z, w, h, d });
    return collide ? collision.add({ x, y, z, w, h, d }) : null;
  }
  function sign(g, text, x, y, z, w = 3, h = 0.6, color = '#baf6fa', turn = 0) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round((1024 * h) / w);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#122b3e';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.min(c.height * 0.58, 90)}px sans-serif`;
    ctx.fillText(text, 512, c.height / 2, 970);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = turn;
    g.add(mesh);
    return mesh;
  }
  function object(g, type, name, x, y, z, extra = {}) {
    const o = { id: `hq-${objects.length}`, type, name, x, y, z, ...extra };
    objects.push(o);
    return o;
  }
  function terminal(g, name, x, y, z, kind = 'info', text = '') {
    const solids = [
      box(g, x, y, z, 0.9, 0.75, 0.65, '#304759'),
      box(g, x, y + 0.75, z, 0.95, 0.62, 0.12, '#172d45'),
    ];
    box(g, x, y + 0.8, z + 0.065, 0.82, 0.46, 0.015, '#37dce7', false);
    sign(g, name, x, y + 1.22, z + 0.081, 0.78, 0.15);
    return object(g, 'terminal', name, x, y + 1, z + 0.15, { kind, text, solids });
  }
  function chair(g, x, y, z, name = '座椅', yaw = 0) {
    const solids = [
      box(g, x, y, z, 0.65, 0.38, 0.65, '#344b60'),
      box(g, x, y + 0.38, z, 0.72, 0.12, 0.72, '#657d91'),
    ];
    const backZ = z + (yaw === 0 ? 0.32 : -0.32);
    solids.push(box(g, x, y + 0.5, backZ, 0.72, 0.6, 0.1, '#516c83'));
    return object(g, 'seat', name, x, y + 0.65, z, {
      solids,
      seat: { x, y, z },
      yaw,
      exits: [
        { x, y, z: z + (yaw === 0 ? -1 : 1) },
        { x: x + 1, y, z },
        { x: x - 1, y, z },
      ],
    });
  }
  function table(g, x, y, z, w = 3, d = 1.2) {
    box(g, x, y, z, w * 0.85, 0.72, d * 0.7, '#344b60');
    box(g, x, y + 0.72, z, w, 0.12, d, '#b5c5cd');
  }
  function door(g, { x, y, z, w = 2.6, h = 2.6, name, automatic = true, access = true, kind = 'room' }) {
    const frame = '#324960';
    box(g, x - w / 2 - 0.12, y, z, 0.2, h + 0.22, 0.35, frame);
    box(g, x + w / 2 + 0.12, y, z, 0.2, h + 0.22, 0.35, frame);
    box(g, x, y + h, z, w + 0.45, 0.22, 0.35, frame);
    box(g, x, y + h - 0.12, z + 0.19, w - 0.1, 0.06, 0.03, access ? '#37dce7' : '#ed9c65', false);
    const meshes = [];
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(cube, mat('#728a9e'));
      mesh.position.set(x + (side * w) / 4, y + h / 2, z);
      mesh.scale.set(w / 2 - 0.02, h, 0.15);
      g.add(mesh);
      meshes.push(mesh);
    }
    const solids = [-1, 1].map((side) => {
      const b = collision.add({ x, y, z, w: w * 2.5, d: 0.18, h });
      b.x = x + (side * w) / 4;
      b.halfW = w / 4 - 0.01;
      return b;
    });
    const d = {
      id: `door-${doors.length}`,
      name,
      x,
      y,
      z,
      w,
      h,
      automatic,
      access,
      kind,
      progress: 0,
      hold: 0,
      manual: 0,
      meshes,
      solids,
    };
    doors.push(d);
    object(g, 'door', name, x, y + 1.1, z, { door: d });
    return d;
  }
  function slab(g, y, holes = [], bounds = { x0: -62, x1: 62, z0: 184, z1: 244 }) {
    let rects = [bounds];
    for (const hole of holes)
      rects = rects.flatMap((r) => {
        const a = Math.max(r.x0, hole.x0),
          b = Math.min(r.x1, hole.x1),
          c = Math.max(r.z0, hole.z0),
          d = Math.min(r.z1, hole.z1);
        if (a >= b || c >= d) return [r];
        return [
          { x0: r.x0, x1: a, z0: r.z0, z1: r.z1 },
          { x0: b, x1: r.x1, z0: r.z0, z1: r.z1 },
          { x0: a, x1: b, z0: r.z0, z1: c },
          { x0: a, x1: b, z0: d, z1: r.z1 },
        ].filter((v) => v.x1 - v.x0 > 0.01 && v.z1 - v.z0 > 0.01);
      });
    for (const r of rects)
      box(g, (r.x0 + r.x1) / 2, y - 0.2, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.2, r.z1 - r.z0, '#a1b2c0');
  }
  const holes = [
    { x0: 41, x1: 45, z0: 196, z1: 200 },
    { x0: 48, x1: 62, z0: 192, z1: 206 },
  ];
  function rail(g, x, y, z, w, d) {
    collision.add({ x, y, z, w, d, h: 1.1 });
    const alongX = w > d,
      length = alongX ? w : d;
    for (const h of [0.52, 1.04]) box(g, x, y + h, z, w, 0.06, d, '#6286a3', false);
    const count = Math.ceil(length / 1.5);
    for (let i = 0; i <= count; i++)
      box(
        g,
        x + (alongX ? (i / count - 0.5) * length : 0),
        y,
        z + (alongX ? 0 : (i / count - 0.5) * length),
        0.07,
        1.1,
        0.07,
        '#8faabc',
        false,
      );
  }
  function roomWall(g, room) {
    const { x, y, z, w, d, doorX, doorZ, name } = room,
      front = doorZ > z;
    const side = front ? 1 : -1,
      edge = z + (side * d) / 2;
    box(g, x, y, z - (side * d) / 2, w, 3.8, 0.18);
    box(g, x, y + 0.08, z - side * (d / 2 - 0.11), w, 0.5, 0.03, '#697f94', false);
    for (let i = 1; i < 9; i++)
      box(g, x - w / 2 + (i * w) / 9, y + 0.65, z - side * (d / 2 - 0.11), 0.018, 3, 0.02, '#788da1', false);
    box(g, x - w / 2, y, z, 0.18, 3.8, d);
    box(g, x + w / 2, y, z, 0.18, 3.8, d);
    const left = x - w / 2,
      right = x + w / 2;
    box(g, (left + doorX - 1.5) / 2, y, edge, doorX - 1.5 - left, 3.8, 0.18);
    box(g, (right + doorX + 1.5) / 2, y, edge, right - doorX - 1.5, 3.8, 0.18);
    box(g, doorX, y + 2.8, edge, 3, 1, 0.18);
    door(g, { x: doorX, y, z: edge, w: 2.8, name });
    sign(
      g,
      `${room.floor} / ${name}`,
      doorX,
      y + 3.15,
      edge + (front ? 0.13 : -0.13),
      5,
      0.42,
      '#d0f9ff',
      front ? 0 : Math.PI,
    );
  }
  function equipRoom(g, r) {
    const { x, y, z, name } = r;
    const tx = x - 8,
      tz = z;
    if (/排名|觀戰/.test(name)) {
      // The upper level is a gallery around a genuine double-height opening.
      if (name === '觀戰迴廊') return;
      const board = document.createElement('canvas');
      board.width = 1536;
      board.height = 768;
      const ctx = board.getContext('2d');
      ctx.fillStyle = '#263447';
      ctx.fillRect(0, 0, 1536, 768);
      ctx.fillStyle = '#bac6d0';
      ctx.fillRect(18, 18, 1500, 230);
      ctx.fillStyle = '#193448';
      ctx.font = 'bold 72px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BORDER / PERSONAL RANK', 768, 118);
      ctx.font = '35px sans-serif';
      ctx.fillText('LOCAL TRAINING  /  6 TARGETS', 768, 194);
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 12; col++) {
          const bx = 24 + col * 124,
            by = 272 + row * 88;
          ctx.fillStyle = '#111e2e';
          ctx.fillRect(bx, by, 116, 80);
          ctx.fillStyle = '#e1757d';
          ctx.font = 'bold 35px monospace';
          ctx.fillText(String(201 + row * 12 + col), bx + 58, by + 52);
        }
      const texture = new THREE.CanvasTexture(board);
      texture.colorSpace = THREE.SRGBColorSpace;
      const display = new THREE.Mesh(
        new THREE.PlaneGeometry(28, 5.6),
        new THREE.MeshBasicMaterial({ map: texture }),
      );
      display.position.set(x, y + 4.55, z - 10.78);
      g.add(display);
      for (let i = 0; i < 4; i++) {
        chair(g, x - 12 + i * 8, y, z + 4, '等候長椅');
        terminal(g, `訓練 ${201 + i}`, x - 14 + i * 9, y, z - 7, 'training');
      }
      terminal(g, '訓練／個人紀錄', x, y, z + 7, 'training');
    } else if (/射擊|狙擊/.test(name)) {
      for (let i = 0; i < 5; i++) {
        const bx = x - 14 + i * 6;
        box(g, bx - 2, y, z, 0.15, 1.3, 11, '#4a4e69');
        table(g, bx, y, z + 2, 3, 0.8);
        terminal(g, `射擊靶位 ${i + 1}`, bx, y, z + 3.4, 'training');
        box(g, bx, y + 1, z - 6, 0.8, 1, 0.18, '#e9ddc7');
        box(g, bx, y + 1.3, z - 5.89, 0.35, 0.4, 0.03, '#df7472', false);
      }
    } else if (/指揮|操作員/.test(name)) {
      sign(g, 'MIKADO  /  AREA SURVEILLANCE', x, y + 2.1, z - 8.8, 27, 2.8);
      for (let i = 0; i < 5; i++) {
        terminal(g, '區域監控', x - 13 + i * 6, y, z - 2, 'radar');
        chair(g, x - 13 + i * 6, y, z, '操作員座椅');
      }
      terminal(g, '任務簡報', x, y, z + 5, 'missions');
    } else if (/遠征艇/.test(name)) {
      box(g, x, y, z, 16, 0.8, 12, '#495873');
      box(g, x, y + 0.8, z, 12, 1.5, 8, '#7d8c9b');
      sign(g, 'EXPEDITION / MAINTENANCE', x, y + 3.1, z - 10.8, 25, 0.7);
      terminal(g, '遠征艇整備資料', x, y, z + 8, 'info', '遠征艇模型與整備區。登艇與遠征任務尚未開放。');
    } else if (/倉庫|機房/.test(name)) {
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 2; j++) box(g, x - 14 + i * 7, y, z - 5 + j * 8, 2.5, 2.1, 2.8, '#78857f');
      terminal(g, '庫存查詢', x, y, z + 7, 'inventory');
    } else if (/開發|維修/.test(name)) {
      for (let i = 0; i < 3; i++) {
        table(g, x - 12 + i * 12, y, z - 4, 7, 2);
        box(g, x - 12 + i * 12, y + 0.9, z - 4, 0.7, 0.7, 0.7, '#37dce7');
      }
      terminal(g, '觸發器配裝與保存', x, y, z + 5, 'loadout');
    } else if (/會議|作戰|簡報/.test(name)) {
      table(g, x, y, z, 12, 3);
      for (let i = 0; i < 4; i++) {
        chair(g, x - 4.5 + i * 3, y, z + 3, '會議座椅', Math.PI);
        chair(g, x - 4.5 + i * 3, y, z - 3, '會議座椅');
      }
      sign(g, 'BORDER  /  TACTICAL BRIEFING', x, y + 2.1, z - 8.8, 24, 2.4);
      terminal(
        g,
        /投影/.test(name) ? '立體投影：顯示／收起' : '戰術與任務終端',
        tx,
        y,
        z + 6,
        /投影/.test(name) ? 'hologram' : 'missions',
      );
      if (/投影/.test(name)) {
        const hologram = new THREE.Group();
        hologram.visible = false;
        const glow = new THREE.MeshBasicMaterial({
          color: '#39deef',
          wireframe: true,
          transparent: true,
          opacity: 0.6,
        });
        for (let i = 0; i < 8; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5 + (i % 3) * 0.3, 0.7), glow);
          m.position.set(x - 2 + (i % 4) * 1.2, y + 1.5 + (i % 3) * 0.15, z - 1 + Math.floor(i / 4) * 1.5);
          hologram.add(m);
        }
        g.add(hologram);
        projections.push({ x, z, y, group: hologram });
      }
      if (/作戰/.test(name)) {
        terminal(g, '小隊裝備櫃', x + 10, y, z + 6, 'loadout');
        chair(g, x + 12, y, z - 5, '小隊沙發');
      }
    } else if (/宿舍|休息/.test(name)) {
      for (let i = 0; i < 4; i++) {
        const bx = x - 13 + i * 8;
        box(g, bx, y, z - 4, 2, 0.5, 3, '#45596c');
        box(g, bx, y + 0.5, z - 4, 1.9, 0.18, 2.8, '#d8e0df');
        object(g, 'bed', '休息床位', bx, y + 0.8, z - 3, {
          seat: { x: bx, y, z: z - 4 },
          yaw: 0,
          exits: [{ x: bx + 1.6, y, z: z - 4 }],
        });
      }
      terminal(g, '置物櫃／個人配裝', x, y, z + 6, 'loadout');
      chair(g, x + 8, y, z + 3, '休息沙發');
    } else if (/健身/.test(name)) {
      for (let i = 0; i < 4; i++) {
        box(g, x - 12 + i * 8, y, z - 3, 2, 0.25, 3, '#354b5b');
        terminal(g, '運動指導', x - 12 + i * 8, y, z + 2, 'exercise');
      }
    } else if (/醫務/.test(name)) {
      for (let i = 0; i < 3; i++) {
        box(g, x - 12 + i * 12, y, z - 3, 2, 0.7, 3, '#c1ced6');
        object(g, 'bed', '診療床', x - 12 + i * 12, y + 1, z - 2, {
          seat: { x: x - 12 + i * 12, y, z: z - 3 },
          exits: [{ x: x - 10 + i * 12, y, z: z - 3 }],
        });
      }
      terminal(g, '戰鬥體損傷檢查', x, y, z + 5, 'medical');
    } else if (/自習|資料/.test(name)) {
      for (let i = 0; i < 5; i++) {
        box(g, x - 15 + i * 7, y, z - 7, 3, 2.7, 0.6, '#465a6a');
        for (let j = 0; j < 5; j++)
          box(
            g,
            x - 15 + i * 7,
            y + 0.4 + j * 0.45,
            z - 6.65,
            2.7,
            0.25,
            0.1,
            ['#929da5', '#b3b9ae'][j % 2],
            false,
          );
      }
      table(g, x, y, z, 10, 2);
      chair(g, x - 3, y, z + 2, '閱讀座椅', Math.PI);
      chair(g, x + 3, y, z + 2, '閱讀座椅', Math.PI);
      terminal(g, '操作教學／設施資料', x, y, z + 6, 'guide');
    } else if (/食堂/.test(name)) {
      for (let i = 0; i < 3; i++) {
        table(g, x - 12 + i * 12, y, z, 6, 2);
        chair(g, x - 12 + i * 12, y, z + 2, '食堂座椅', Math.PI);
        chair(g, x - 12 + i * 12, y, z - 2, '食堂座椅');
      }
      terminal(g, '食堂點餐', x, y, z + 6, 'food');
    } else if (/交誼/.test(name)) {
      for (let i = 0; i < 4; i++) chair(g, x - 12 + i * 8, y, z, '交誼沙發');
      table(g, x, y, z - 3, 7, 1.5);
      terminal(g, '飲料販賣機', x + 12, y, z + 5, 'vending');
    } else if (/訓練室|準備/.test(name)) {
      terminal(g, '虛擬訓練啟動', x, y, z, 'training');
      terminal(g, '訓練裝備', x + 7, y, z + 3, 'loadout');
    } else {
      terminal(g, '基地導覽', x, y, z, 'directory');
      chair(g, x + 8, y, z, '接待等候椅');
    }
    if (!/排名|觀戰/.test(name)) terminal(g, '消防／避難路線', x - 18, y, z + 5, 'evacuation');
  }
  const levelGroups = [];
  for (const f of HQ_FLOORS) {
    const g = group(f.y, f.id + ' ' + f.name);
    levelGroups.push(g);
    const levelHoles = [...holes];
    if (f.id === '3F') levelHoles.push({ x0: -44, x1: -6, z0: 192, z1: 209 });
    slab(g, f.y, levelHoles);
    // White overhead panels and continuous cyan route strips, no per-room dynamic lights.
    for (const x of [-44, -22, 0, 22, 44]) box(g, x, f.y + 3.72, 217, 9, 0.05, 1.2, '#d9f7fa', false);
    box(g, 0, f.y + 0.012, 217, 94, 0.015, 0.09, '#37dce7', false);
    sign(g, `${f.id}  /  ${f.name}       電梯・樓梯 →`, 0, f.y + 2.7, 220.87, 14, 0.6, '#bdedf0', Math.PI);
    box(g, -62, f.y, 214, 0.25, 4, 60);
    box(g, 62, f.y, 214, 0.25, 4, 60);
    box(g, 0, f.y, 184, 124, 4, 0.25);
    // Public wing facade; foyer's opening is carved, other levels are closed.
    if (f.id === '1F') {
      box(g, -32, f.y, 244, 60, 4, 0.2);
      box(g, 32, f.y, 244, 60, 4, 0.2);
      box(g, 0, f.y + 3.1, 244, 4, 0.9, 0.2);
      door(g, { x: 0, y: f.y, z: 249.5, w: 3, name: 'BORDER 主入口' });
      sign(g, 'BORDER  /  MAIN ENTRANCE', 0, f.y + 4, 251, 16, 1.2);
      for (const side of [-1, 1]) {
        box(g, side * 5.8, f.y, 254, 0.4, 2.5, 0.4, '#344b60');
        box(g, side * 5.8, f.y + 1.7, 254.21, 0.2, 0.6, 0.02, '#37dce7', false);
      }
      box(g, -2, f.y, 247, 0.2, 3.2, 6);
      box(g, 2, f.y, 247, 0.2, 3.2, 6);
      box(g, 0, f.y - 0.1, 247.5, 4, 0.1, 7, '#9fafbf');
      box(g, 0, f.y + 3.2, 247, 4, 0.15, 6);
    } else box(g, 0, f.y, 244, 124, 4, 0.2);
    for (const original of HQ_ROOMS.filter((r) => r.floor === f.id)) {
      const r = original.z < 210 && original.x > 0 ? { ...original, x: 19, w: 32 } : original;
      // Leave the atrium wall open between 2F and 3F instead of sealing its two-storey board.
      if (r.name !== '觀戰迴廊') roomWall(g, r);
      equipRoom(g, r);
    }
    // A clear cross-corridor connects the main hall with both service cores.
    box(g, 38, f.y, 198, 0.2, 4, 24);
    box(g, 46, f.y, 198, 0.2, 4, 24);
    box(g, 43, f.y, 195.8, 4, 4, 0.2);
    for (const sx of [40.8, 45.2]) box(g, sx, f.y, 198, 0.2, 4, 4.2);
    box(g, 43, f.y + 2.8, 200.1, 4, 1.2, 0.2);
    const ld = door(g, {
      x: 43,
      y: f.y,
      z: 200.1,
      w: 3,
      h: 2.8,
      name: `電梯 ${f.id}`,
      automatic: false,
      kind: 'lift',
    });
    liftDoors.push(ld);
    terminal(g, `呼叫電梯 ${f.id}`, 46.7, f.y, 210, 'liftCall', f.id);
    sign(g, '← 電梯     維修樓梯 →', 50, f.y + 2.8, 211, 14, 0.5);
    box(g, 48, f.y, 191, 0.15, 4, 2);
    box(g, 62, f.y, 199, 0.2, 4, 18);
    if (f.id === '3F') {
      for (const x of [-44, -6]) {
        rail(g, x, f.y, 192.6, 0.08, 1.2);
        rail(g, x, f.y, 203.5, 0.08, 11);
      }
      for (const z of [192, 209]) rail(g, -25, f.y, z, 38, 0.08);
      sign(g, '觀戰走廊 / 201–204', -25, f.y + 2.5, 211.8, 12, 0.7, '#d0f9ff', Math.PI);
    }
  }
  const ceiling = group(HQ.floor + 24, '6F ceiling');
  slab(ceiling, HQ.floor + 24, holes);
  // Opposing stairs and upper bridges in the training atrium, based on the photographed hall.
  const atrium = group(HQ.floor + 6, 'training atrium stairs');
  for (const x of [-42, -8]) {
    for (let i = 0; i < 24; i++) {
      const z = 208 - (i + 0.5) * 0.5;
      box(atrium, x, HQ.floor + 4, z, 2.4, (i + 1) / 6, 0.5, '#bacbd8');
      for (const edge of [x - 1.25, x + 1.25])
        box(atrium, edge, HQ.floor + 4 + (i + 1) / 6, z, 0.08, 1.05, 0.5, '#7e9cb2');
    }
    box(atrium, x + (x < -25 ? -1.2 : 1.2), HQ.floor + 8 - 0.15, 194.8, 5, 0.15, 2.4, '#b9c9d7');
  }
  // Continuous switchback staircase from B2 to roof. Every rendered tread is solid.
  const flights = stairFlights();
  for (const f of flights) {
    let g = groups.find((g) => g.name === `stair-${Math.floor(f.index / 4)}`);
    if (!g) g = group(f.y, `stair-${Math.floor(f.index / 4)}`);
    for (let i = 0; i < f.steps; i++) {
      const depth = f.d / f.steps,
        t = (i + 0.5) / f.steps;
      const z = f.back ? 203 - t * 8 : 195 + t * 8;
      box(g, f.x, f.y, z, f.w, ((i + 1) * f.rise) / f.steps, depth + 0.001, '#9aaec1');
    }
    const landingZ = f.back ? 193.5 : 204.5;
    box(g, 55, f.y + f.rise - 0.18, landingZ, 14, 0.18, 3, '#a6b7c6');
    for (const edge of [f.x - f.w / 2 - 0.06, f.x + f.w / 2 + 0.06]) {
      // Handrail follows stair incline; continuous barrier also protects the central opening.
      for (let i = 0; i < 4; i++)
        box(
          g,
          edge,
          f.y + (i * f.rise) / 4,
          199 + (f.back ? 1 : -1) * (3 - i * 2),
          0.08,
          1.1 + f.rise / 4,
          2,
          '#65829c',
        );
    }
    const guardZ = f.back ? 192.1 : 205.9;
    box(g, 55, f.y + f.rise, guardZ, 14, 1.1, 0.12, '#65829c');
  }
  const bottom = group(HQ_FLOORS[0].y, 'B2 foundation');
  box(bottom, 55, HQ_FLOORS[0].y - 0.2, 204.5, 14, 0.2, 3);
  // Cabin is a physical moving platform; doors open only when aligned to a stop.
  const cabin = new THREE.Group();
  cabin.name = 'BORDER lift cabin';
  root.add(cabin);
  const liftPlatform = new THREE.Mesh(cube, mat('#60798e'));
  liftPlatform.scale.set(3.8, 0.18, 3.8);
  cabin.add(liftPlatform);
  const liftSolid = collision.add({ x: 43, z: 198, w: 3.8, d: 3.8, y: HQ.floor - 0.18, h: 0.18 });
  const cabinFixtures = [];
  function cabinBox(x, y, z, w, h, d, color) {
    const m = new THREE.Mesh(cube, mat(color));
    m.position.set(x, y + h / 2, z);
    m.scale.set(w, h, d);
    cabin.add(m);
    cabinFixtures.push({
      m,
      x,
      y,
      z,
      w,
      h,
      d,
      solid: collision.add({ x: x + 43, y: y + HQ.floor, z: z + 198, w, h, d }),
    });
  }
  cabinBox(-1.85, 0, 0, 0.12, 2.9, 3.8, '#6c879b');
  cabinBox(1.85, 0, 0, 0.12, 2.9, 3.8, '#6c879b');
  cabinBox(0, 0, -1.85, 3.8, 2.9, 0.12, '#567386');
  cabinBox(0, 2.9, 0, 3.8, 0.12, 3.8, '#c2e6e9');
  cabinBox(0, 0, 1.85, 3.8, 2.9, 0.12, '#58758b');
  cabinFixtures.at(-1).front = true;
  const cabinPanel = new THREE.Mesh(cube, mat('#37dce7'));
  cabinPanel.position.set(0.9, 1.4, -1.76);
  cabinPanel.scale.set(0.65, 0.8, 0.02);
  cabin.add(cabinPanel);
  const liftControl = {
    id: 'lift-control',
    type: 'terminal',
    name: '電梯樓層控制',
    kind: 'lift',
    x: 43.9,
    y: HQ.floor + 1.3,
    z: 196.35,
  };
  objects.push(liftControl);
  const roof = group(HQ.roof, 'RF roof facilities');
  // Central roof deck stops at the inset outer skin, and leaves both service openings clear.
  slab(roof, HQ.roof, holes, { x0: -64, x1: 64, z0: 150.8, z1: 218 });
  const rdoor = door(roof, {
    x: 43,
    y: HQ.roof,
    z: 200.1,
    w: 3,
    h: 2.8,
    name: '電梯 RF',
    automatic: false,
    kind: 'lift',
  });
  liftDoors.push(rdoor);
  for (const x of [40.8, 45.2]) box(roof, x, HQ.roof, 198, 0.2, 3.3, 4.2);
  box(roof, 43, HQ.roof, 195.8, 4.6, 3.3, 0.2);
  box(roof, 43, HQ.roof + 3.3, 198, 4.6, 0.2, 4.6);
  terminal(roof, '呼叫電梯 RF', 46.7, HQ.roof, 210, 'liftCall', 'RF');
  sign(roof, 'RF  /  BORDER COMMUNICATIONS', 0, HQ.roof + 2, 211, 22, 0.9);
  for (const x of [-36, -18, 0]) box(roof, x, HQ.roof, 176, 6, 2.2, 4, '#5c7285');
  terminal(roof, '觀測／城市導覽', 0, HQ.roof, 204, 'radar');
  chair(roof, -10, HQ.roof, 207, '屋頂長椅');
  // The visible entry ramp and its convex collision use exactly the same vertices.
  // A true wedge has a flat bottom and a linear top, unlike a four-sided tapered block.
  const a = HQ.floor / 59,
    c = HQ.floor + a * 251;
  const geometry = new THREE.BufferGeometry();
  const verts = [-5, 0, 310, 5, 0, 310, -5, HQ.floor, 251, 5, HQ.floor, 251, -5, 0, 251, 5, 0, 251];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 0, 2, 4, 1, 5, 3, 4, 3, 5, 4, 2, 3]);
  geometry.computeVertexNormals();
  const rm = new THREE.Mesh(geometry, mat('#8e9fad'));
  root.add(rm);
  collision.add({ x: 0, z: 280.5, w: 10, d: 59, y: 0, h: HQ.floor, traceOnly: true, planes: [[0, 1, a, c]] });
  for (const b of batches.values()) {
    const mesh = new THREE.InstancedMesh(cube, mat(b.color), b.items.length);
    mesh.receiveShadow = true;
    b.items.forEach((p, i) => {
      matrix.compose(new THREE.Vector3(p.x, p.y, p.z), quat, new THREE.Vector3(p.w, p.h, p.d));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.computeBoundingSphere();
    b.g.add(mesh);
  }
  return {
    root,
    objects,
    doors,
    liftDoors,
    projections,
    lift: {
      cabin,
      platform: liftSolid,
      fixtures: cabinFixtures,
      control: liftControl,
      y: HQ.floor,
      target: HQ.floor,
      moving: false,
    },
    updateVisibility(position, exploring) {
      const close = exploring && Math.abs(position.x) < 100 && position.z > 145 && position.z < 270;
      for (const g of groups)
        g.visible = close ? Math.abs(g.userData.y - position.y) < 9 : g.name === 'RF roof facilities';
    },
    get diagnostics() {
      return {
        rooms: HQ_ROOMS.length,
        floors: HQ_STOPS.length,
        objects: objects.length,
        doors: doors.length,
        stairFlights: flights.length,
        instances: [...batches.values()].reduce((n, b) => n + b.items.length, 0),
      };
    },
  };
}
