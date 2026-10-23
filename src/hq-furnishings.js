/** Human-scale, reusable furnishings for streamed headquarters rooms.
 * x/z are local to the room; y stays the room's floor height. The caller owns
 * geometry batching, room transforms, collisions and interaction registration.
 */
export const HQ_ROOM_PALETTE = Object.freeze({
  steel: '#354b61',
  dark: '#23364b',
  panel: '#70889f',
  pale: '#bfced8',
  white: '#dce7eb',
  cyan: '#37dce7',
  cyanDark: '#2e788d',
  warm: '#b3a68f',
  fabric: '#526a80',
  floor: '#596d81',
  yellow: '#d6bd72',
  red: '#c97780',
});

export function hqRoomKind(room) {
  const aliases = {
    lobby: 'reception',
    research: 'lab',
    medbay: 'medical',
    quarters: 'dorm',
    mess: 'cafeteria',
    storage: 'warehouse',
    simulator: 'training',
    rank: 'training',
    briefing: 'meeting',
    service: 'utilities',
    range: 'training',
  };
  const supplied = aliases[room.kind] ?? room.kind;
  if (
    [
      'reception',
      'lounge',
      'cafeteria',
      'squad',
      'meeting',
      'command',
      'operator',
      'lab',
      'workshop',
      'warehouse',
      'dorm',
      'gym',
      'medical',
      'study',
      'training',
      'observation',
      'hangar',
      'utilities',
    ].includes(supplied)
  )
    return supplied;
  const name = room.name ?? '';
  return /指揮/.test(name)
    ? 'command'
    : /操作員|通信/.test(name)
      ? 'operator'
      : /觀戰|觀察/.test(name)
        ? 'observation'
        : /作戰|小隊/.test(name)
          ? 'squad'
          : /會議|簡報|投影/.test(name)
            ? 'meeting'
            : /開發|研究/.test(name)
              ? 'lab'
              : /維修|整備室/.test(name)
                ? 'workshop'
                : /遠征艇|機庫/.test(name)
                  ? 'hangar'
                  : /倉庫|庫存|物資/.test(name)
                    ? 'warehouse'
                    : /宿舍|住宿/.test(name)
                      ? 'dorm'
                      : /健身|體能/.test(name)
                        ? 'gym'
                        : /醫務|診療/.test(name)
                          ? 'medical'
                          : /自習|資料|圖書/.test(name)
                            ? 'study'
                            : /訓練|射擊|狙擊|排名/.test(name)
                              ? 'training'
                              : /食堂|餐廳/.test(name)
                                ? 'cafeteria'
                                : /交誼|休息/.test(name)
                                  ? 'lounge'
                                  : /機房|設備|電力|後勤/.test(name)
                                    ? 'utilities'
                                    : 'reception';
}

export function furnishHQRoom(api, room) {
  const g = api.group ?? api.g,
    y = room.y ?? 0;
  const w = Math.max(10, room.w ?? 22),
    d = Math.max(12, room.d ?? 20);
  const hw = w / 2,
    hd = d / 2,
    left = -hw + 1.3,
    right = hw - 1.3,
    back = -hd + 1.1,
    front = hd - 1.4;
  const large = w >= 28 && d >= 22;
  const ceiling = room.clearHeight ?? 5.7;
  const p = HQ_ROOM_PALETTE,
    kind = hqRoomKind(room),
    variant = Math.floor(Math.abs(Number(room.variant) || 0));
  let detailBoxes = 0,
    interactions = 0;
  const B = (x, dy, z, bw, bh, bd, color = p.panel, solid = true) => {
    detailBoxes++;
    return api.box(g, x, y + dy, z, bw, bh, bd, color, solid);
  };
  const S = (text, x, dy, z, sw = 3, sh = 0.3, color = '#baf6fa', turn = 0) =>
    api.sign?.(g, text, x, y + dy, z, sw, sh, color, turn);
  const T = (name, x, z, action = 'info', text = '') => {
    interactions++;
    return api.terminal?.(g, name, x, y, z, action, text);
  };
  const C = (x, z, name = '座椅', yaw = 0, dy = 0) => {
    interactions++;
    return api.chair?.(g, x, y + dy, z, name, yaw);
  };
  const D = (x, z, bw = 2.4, bd = 1.2) => api.table?.(g, x, y, z, bw, bd);
  const points = (count, span) =>
    Array.from({ length: count }, (_, i) => (count === 1 ? 0 : (i / (count - 1) - 0.5) * span));
  function cabinet(x, z, width = 1.65, height = 2.15) {
    const owned = [B(x, 0, z, width, height, 0.62, p.steel)];
    B(x, 0.08, z + 0.325, width - 0.12, height - 0.16, 0.035, p.panel, false);
    B(x, 0.12, z + 0.35, 0.035, height - 0.24, 0.02, p.dark, false);
    for (const side of [-1, 1]) B(x + side * 0.1, 0.94, z + 0.36, 0.035, 0.22, 0.035, p.pale, false);
    B(x + width * 0.32, 1.72, z + 0.35, 0.12, 0.055, 0.02, p.cyan, false);
    return owned;
  }
  function monitor(x, z, width = 1.6, dy = 0.84) {
    B(x, dy, z, 0.4, 0.035, 0.3, p.dark);
    B(x, dy + 0.035, z, 0.08, 0.25, 0.08, p.steel);
    B(x, dy + 0.26, z, width, 0.75, 0.1, p.dark);
    B(x, dy + 0.31, z + 0.06, width - 0.12, 0.61, 0.015, p.cyan, false);
    B(x, dy + 0.02, z + 0.38, 0.62, 0.025, 0.2, p.dark, false);
    B(x + 0.54, dy + 0.02, z + 0.36, 0.1, 0.025, 0.14, p.panel, false);
  }
  function desk(x, z, label = '工作座椅') {
    D(x, z, 2.6, 1.2);
    monitor(x, z - 0.22, 1.65);
    C(x, z + 1.03, label);
    B(x - 1, 0.84, z - 0.15, 0.04, 0.6, 0.04, p.steel);
    B(x - 0.78, 1.39, z - 0.15, 0.52, 0.05, 0.3, p.pale);
  }
  function rack(x, z, width = 2.1, books = false) {
    B(x, 0, z, width, 2.55, 0.58, p.steel);
    for (let row = 0; row < 4; row++) {
      B(x, 0.38 + row * 0.52, z + 0.32, width - 0.12, 0.055, 0.035, p.pale, false);
      for (let col = 0; col < 3; col++)
        B(
          x + ((col - 1) * (width - 0.3)) / 3,
          0.44 + row * 0.52,
          z + 0.33,
          (width - 0.3) / 3 - 0.07,
          0.36,
          0.04,
          books ? [p.warm, p.panel, p.red][(row + col + variant) % 3] : p.dark,
          false,
        );
    }
  }
  function sofa(x, z, width = 2.2) {
    const solids = [
      B(x, 0.08, z, width, 0.28, 0.82, p.dark),
      B(x, 0.36, z, width, 0.13, 0.87, p.fabric),
      B(x, 0.49, z + 0.4, width, 0.58, 0.13, p.panel),
    ];
    for (const side of [-1, 1])
      solids.push(B(x + side * (width / 2 - 0.07), 0.38, z, 0.14, 0.39, 0.88, p.steel));
    for (const offset of [-width * 0.23, width * 0.23]) {
      interactions++;
      api.object?.(g, 'seat', '休息沙發', x + offset, y + 0.65, z, {
        solids: solids.filter(Boolean),
        seat: { x: x + offset, y, z },
        yaw: 0,
        exits: [
          { x: x + offset, y, z: z - 1.05 },
          { x: x + width / 2 + 1, y, z },
          { x: x - width / 2 - 1, y, z },
        ],
      });
    }
  }
  function bed(x, z, name = '休息床位') {
    const solids = [
      B(x, 0.1, z, 1.5, 0.23, 2.6, p.steel),
      B(x, 0.33, z, 1.44, 0.16, 2.5, p.white),
      B(x, 0.49, z - 0.95, 1.1, 0.1, 0.45, p.pale),
    ];
    B(x, 0.12, z - 1.34, 1.6, 0.8, 0.1, p.panel);
    for (const side of [-1, 1]) B(x + side * 0.53, 0, z + 0.85, 0.12, 0.12, 0.12, p.dark);
    B(x, 0.5, z + 0.25, 1.4, 0.035, 1.2, p.fabric, false);
    interactions++;
    api.object?.(g, 'bed', name, x, y + 0.7, z + 0.65, {
      solids: solids.filter(Boolean),
      seat: { x, y, z: z + 0.3 },
      yaw: 0,
      exits: [
        { x: x + 1.3, y, z: z + 0.2 },
        { x: x - 1.3, y, z: z + 0.2 },
        { x, y, z: z + 1.95 },
      ],
    });
  }
  function wallDisplay(text, width = Math.min(w - 4, 10), height = 1.5) {
    const z = -hd + 0.17;
    B(0, 1.25, z, width, height, 0.12, p.dark);
    B(0, 1.31, z + 0.075, width - 0.15, height - 0.13, 0.015, p.cyanDark, false);
    S(text, 0, 1.25 + height * 0.54, z + 0.091, width - 0.3, Math.min(0.5, height * 0.35));
    for (let i = 0; i < 4; i++)
      B(-width * 0.38 + i * width * 0.25, 1.45, z + 0.09, width * 0.13, 0.055, 0.015, p.cyan, false);
  }
  function server(x, z) {
    B(x, 0, z, 1.2, 2.65, 0.9, p.dark);
    for (let row = 0; row < 5; row++) {
      B(x, 0.2 + row * 0.47, z + 0.46, 1.06, 0.31, 0.025, p.steel, false);
      B(x + 0.38, 0.31 + row * 0.47, z + 0.48, 0.06, 0.06, 0.015, row % 2 ? p.cyan : p.yellow, false);
    }
  }
  function crate(x, z, dy = 0) {
    B(x, dy, z, 1.35, 0.95, 1.2, p.panel);
    B(x, dy + 0.09, z + 0.61, 1.16, 0.72, 0.025, p.steel, false);
    B(x, dy + 0.4, z + 0.63, 0.5, 0.2, 0.015, p.pale, false);
  }

  // Continuous baseboards and panel joints are flush with the structural walls.
  B(0, 0.035, -hd + 0.075, w - 0.3, 0.12, 0.035, p.steel, false);
  for (const side of [-1, 1]) {
    B(side * (hw - 0.075), 0.035, 0, 0.035, 0.12, d - 0.3, p.steel, false);
    B(side * (hw / 2 + 1.1), 0.035, hd - 0.075, hw - 2.4, 0.12, 0.035, p.steel, false);
    B(side * (hw - 0.16), 0.18, -hd + 0.16, 0.16, ceiling - 0.35, 0.16, p.panel);
  }
  const panelCount = Math.max(3, Math.min(7, Math.floor(w / 4)));
  for (const x of points(panelCount, w - 3))
    B(x, 0.45, -hd + 0.095, 0.025, ceiling - 0.8, 0.025, p.floor, false);
  for (const x of points(w > 28 ? 3 : 2, w * 0.58)) {
    B(x, ceiling - 0.17, -1, 2.5, 0.07, 0.8, p.steel);
    B(x, ceiling - 0.2, -1, 2.3, 0.03, 0.6, p.white, false);
  }
  B(right - 1.1, ceiling - 0.22, back + 1, 1.6, 0.16, 1, p.panel);
  for (let i = 0; i < 4; i++)
    B(right - 1.1, ceiling - 0.25, back + 0.65 + i * 0.2, 1.35, 0.02, 0.06, p.dark, false);
  // A floor line draws the eye into the room without blocking the door approach.
  B(0, 0.006, front - 1.3, 0.07, 0.008, 2, p.cyan, false);

  if (kind === 'reception') {
    const span = Math.min(w * 0.56, 9);
    B(0, 0, -2, span, 0.85, 1.5, p.steel);
    B(0, 0.85, -2, span + 0.16, 0.1, 1.65, p.pale);
    B(0, 0.18, -1.23, span - 0.15, 0.44, 0.04, p.cyanDark, false);
    for (const x of points(2, Math.min(span * 0.6, 4.5))) monitor(x, -2.3, 1.4, 0.96);
    wallDisplay('BORDER  /  RECEPTION', Math.min(w - 4, 12), 1.4);
    for (const x of [left + 1.2, right - 1.2]) sofa(x, 3.5, 2.4);
    T('基地樓層與區域導覽', left + 1.1, front - 1, 'directory');
    T('隊員任務簡報', right - 1.1, front - 1, 'missions');
  } else if (kind === 'cafeteria') {
    B(0, 0, back + 1, Math.min(w - 4, 13), 0.92, 1.8, p.steel);
    B(0, 0.92, back + 1, Math.min(w - 3.8, 13.2), 0.08, 1.95, p.pale);
    for (const x of points(4, Math.min(w * 0.48, 8))) B(x, 1.01, back + 1, 0.75, 0.06, 0.55, p.white, false);
    const count = w > 25 ? 3 : 2;
    for (const z of large ? [-3.5, 2.5] : [0])
      for (const x of points(count, w * 0.6)) {
        D(x, z, 3.8, 1.7);
        C(x, z - 1.5, '食堂座椅', Math.PI);
        C(x, z + 1.5, '食堂座椅');
      }
    cabinet(right - 1.2, back + 2, 1.6, 2.2);
    S('BORDER  /  DINING', 0, 2.75, -hd + 0.13, Math.min(w - 3, 13), 0.55);
    T('食堂點餐／領餐', left + 1, front - 1, 'food');
    T('飲品與飲水', right - 1, front - 1, 'vending');
  } else if (kind === 'lounge') {
    wallDisplay('LOUNGE / CITY INFORMATION', Math.min(w - 4, 11), 1.5);
    for (const z of large ? [-0.8, 4.7] : [0.6])
      for (const x of [-w * 0.25, w * 0.25]) {
        sofa(x, z, 2.5);
        D(x, z - 2.1, 2.5, 0.9);
      }
    rack(left + 0.8, back + 0.3, 2, true);
    cabinet(right - 0.7, back + 0.3);
    T('飲料販賣機', left + 1, front - 1, 'vending');
    T('公共設施導覽', right - 1, front - 1, 'directory');
  } else if (kind === 'meeting' || kind === 'squad') {
    const tw = Math.min(11, w * 0.55);
    D(0, -1, tw, 2.3);
    for (const x of points(3, tw * 0.74)) {
      C(x, -3.05, '戰術座椅', Math.PI);
      C(x, 1.05, '戰術座椅');
    }
    wallDisplay(
      kind === 'squad' ? 'SQUAD / TACTICAL SUPPORT' : 'BORDER / TACTICAL BRIEFING',
      Math.min(w - 4, 12),
      1.6,
    );
    cabinet(left + 0.8, back + 0.5);
    cabinet(right - 0.8, back + 0.5);
    if (kind === 'squad') {
      sofa(left + 1.1, 4, 2.1);
      T('小隊裝備櫃', right - 1.2, front - 1, 'loadout');
    }
    if (/投影/.test(room.name ?? '') && api.projection) {
      const projected = api.projection(g, { id: room.id, x: 0, y: y + 0.91, z: -1, w: 3, d: 1.6 });
      const terminal = T('戰術投影：開啟／收起', left + 1.2, front - 1, 'hologram');
      if (terminal) terminal.projection = projected;
    } else T('戰術與任務終端', left + 1.2, front - 1, 'missions');
  } else if (kind === 'command' || kind === 'operator') {
    wallDisplay(
      kind === 'command' ? 'MIKADO / DEFENSE COMMAND' : 'OPERATOR / COMMUNICATIONS',
      Math.min(w - 3, 17),
      1.9,
    );
    const row = kind === 'command' || large ? [-3, 1] : [-1];
    for (const z of row) for (const x of points(w > 26 ? 3 : 2, w * 0.6)) desk(x, z, '操作員座椅');
    server(left + 0.55, back + 0.5);
    server(right - 0.55, back + 0.5);
    T('城市監控與狀態', left + 1.1, front - 1, 'radar');
    T('任務分配與簡報', right - 1.1, front - 1, 'missions');
  } else if (kind === 'lab' || kind === 'workshop') {
    for (const z of large ? [-4, 3] : [-2])
      for (const x of [-w * 0.24, w * 0.24]) {
        D(x, z, 4.2, 1.8);
        monitor(x - 1.1, z - 0.45, 1.2);
        B(x + 0.9, 0.85, z, 0.9, 0.08, 0.85, p.dark);
        B(x + 0.9, 0.95, z, 0.38, 0.58, 0.38, kind === 'lab' ? p.cyan : p.panel);
        B(x + 0.9, 1.53, z, 0.65, 0.08, 0.65, p.pale);
      }
    cabinet(left + 0.3, back + 0.6);
    cabinet(right - 0.3, back + 0.6);
    B(0, 1, -hd + 0.21, Math.min(w - 5, 8), 1.5, 0.09, p.dark);
    for (let i = 0; i < 6; i++)
      B((i - 2.5) * 0.75, 1.17, -hd + 0.29, 0.14, 0.85 - (i % 3) * 0.14, 0.04, p.pale, false);
    S(
      kind === 'lab' ? 'TRIGGER RESEARCH / DEVELOPMENT' : 'TRIGGER / MAINTENANCE',
      0,
      2.9,
      -hd + 0.15,
      Math.min(w - 3, 13),
      0.5,
    );
    T('觸發器配裝／保存', left + 1.1, front - 1, 'loadout');
    T(kind === 'lab' ? '開發與操作資料' : '維護與裝備說明', right - 1.1, front - 1, 'guide');
  } else if (kind === 'warehouse') {
    for (const z of large ? [-4, 0, 4] : [-4, 0])
      for (const x of points(w > 26 ? 3 : 2, w * 0.55)) {
        crate(x, z);
        crate(x, z, 0.96);
      }
    for (const x of [-w * 0.36, w * 0.36]) B(x, 0.007, -1, 0.055, 0.012, 9, p.yellow, false);
    B(0, 3.5, -2, w - 3, 0.12, 0.25, p.steel);
    for (const x of [-w * 0.3, w * 0.3]) B(x, 3.15, -2, 0.15, 0.35, 0.2, p.yellow);
    cabinet(right - 0.4, back + 0.6);
    S('LOGISTICS / STORAGE', 0, 2.8, -hd + 0.14, Math.min(w - 3, 12), 0.5);
    T('物資／庫存查詢', left + 1, front - 1, 'inventory');
  } else if (kind === 'dorm') {
    for (const x of [-w * 0.25, w * 0.25]) {
      for (const z of large ? [-4, 2.5] : [-2]) bed(x, z);
      cabinet(x, back + 0.4, 1.8, 2.2);
    }
    desk(left + 1.2, front - 2.7, '宿舍書桌椅');
    B(right - 1.1, 0.05, front - 3, 1.5, 1.1, 0.55, p.panel);
    B(right - 1.1, 1.15, front - 3, 1.2, 0.08, 0.5, p.pale);
    T('隊員置物櫃／配裝', right - 1.1, front - 1, 'loadout');
    S('PERSONNEL / REST QUARTERS', 0, 2.85, -hd + 0.14, Math.min(w - 3, 13), 0.5);
  } else if (kind === 'gym') {
    for (const z of large ? [-3, 1, 5] : [-3, 1]) {
      const x = -w * 0.25;
      B(x, 0.08, z, 1.3, 0.2, 2.6, p.dark);
      B(x, 0.28, z, 1.1, 0.045, 2.3, p.floor, false);
      for (const side of [-1, 1]) B(x + side * 0.58, 0.28, z - 0.95, 0.06, 1.05, 0.1, p.panel);
      B(x, 1.25, z - 0.96, 1.2, 0.08, 0.26, p.pale);
      B(x, 1.33, z - 0.96, 0.45, 0.22, 0.06, p.cyanDark);
    }
    const bx = w * 0.25;
    B(bx, 0.2, 0, 0.65, 0.28, 2.1, p.fabric);
    for (const side of [-1, 1]) {
      B(bx + side * 0.72, 0, -0.65, 0.12, 1.8, 0.2, p.steel);
      B(bx + side * 0.72, 1.2, -0.65, 0.44, 0.08, 0.2, p.panel);
    }
    B(bx, 1.28, -0.65, 2.4, 0.09, 0.09, p.pale);
    for (const side of [-1, 1])
      for (let i = 0; i < 2; i++) B(bx + side * (0.82 + i * 0.15), 1.06, -0.65, 0.12, 0.52, 0.52, p.dark);
    wallDisplay('PHYSICAL CONDITIONING', Math.min(w - 4, 12), 1.4);
    T('運動指導／機動訓練', left + 1, front - 1, 'exercise');
  } else if (kind === 'medical') {
    for (const x of [-w * 0.25, w * 0.25]) {
      for (const z of large ? [-4, 2.5] : [-1]) {
        bed(x, z, '診療床');
        B(x - 1.2, 0, z - 0.2, 0.6, 0.75, 0.55, p.panel);
        B(x - 1.2, 0.75, z - 0.2, 0.6, 0.06, 0.55, p.white);
        B(x + 1.15, 0, z - 1, 0.08, 1.65, 0.08, p.steel);
        B(x + 1.15, 1.3, z - 1, 0.9, 0.58, 0.1, p.dark);
        B(x + 1.15, 1.35, z - 0.94, 0.79, 0.45, 0.015, p.cyan, false);
      }
    }
    cabinet(left + 0.6, back + 0.4);
    cabinet(right - 0.6, back + 0.4);
    S('MEDICAL / COMBAT BODY STATUS', 0, 2.85, -hd + 0.14, Math.min(w - 3, 14), 0.5);
    T('戰鬥體損傷檢查', left + 1, front - 1, 'medical');
    C(right - 1, front - 2, '診療等候椅');
  } else if (kind === 'study') {
    for (const x of points(3, w * 0.63)) rack(x, back + 0.3, Math.min(2.6, w * 0.19), true);
    for (const z of large ? [-1.8, 3.4] : [1]) for (const x of [-w * 0.25, w * 0.25]) desk(x, z, '閱讀座椅');
    S('ARCHIVE / STUDY ROOM', 0, 2.9, -hd + 0.14, Math.min(w - 3, 12), 0.5);
    T('操作教學與設施資料', left + 1, front - 1, 'guide');
  } else if (kind === 'training') {
    B(0, 0.006, -1, Math.min(w * 0.5, 8), 0.01, Math.min(d * 0.45, 7), p.floor, false);
    for (const side of [-1, 1]) {
      B(side * Math.min(w * 0.25, 4), 0.018, -1, 0.055, 0.012, Math.min(d * 0.45, 7), p.cyan, false);
      B(0, 0.018, -1 + side * Math.min(d * 0.225, 3.5), Math.min(w * 0.5, 8), 0.012, 0.055, p.cyan, false);
    }
    wallDisplay(
      /排名/.test(room.name ?? '') ? 'PERSONAL RANK / LOCAL TRAINING' : 'VIRTUAL TRAINING / READY',
      Math.min(w - 4, 13),
      1.8,
    );
    cabinet(left + 0.4, back + 0.7);
    cabinet(right - 0.4, back + 0.7);
    T('虛擬訓練啟動', left + 1, front - 1, 'training');
    T('訓練裝備配裝', right - 1, front - 1, 'loadout');
  } else if (kind === 'observation') {
    wallDisplay('TRAINING / OBSERVATION', Math.min(w - 4, 14), 1.8);
    for (const x of points(w > 28 ? 4 : 3, w * 0.64)) C(x, 1, '觀察席座椅');
    for (const x of [-w * 0.25, w * 0.25]) {
      D(x, -2, 3.3, 1.2);
      monitor(x, -2.2, 2.2);
    }
    T('觀察與訓練資料', left + 1, front - 1, 'training');
    T('城市資訊', right - 1, front - 1, 'radar');
  } else if (kind === 'hangar') {
    const sw = Math.min(w * 0.48, 12),
      sd = Math.min(d * 0.45, 8);
    B(0, 0.04, -1, sw + 2, 0.16, sd + 2, p.dark);
    B(0, 0.2, -1, sw, 0.85, sd, p.panel);
    B(0, 1.05, -1, sw * 0.67, 0.65, sd * 0.64, p.steel);
    B(0, 1.7, -1, sw * 0.4, 0.25, sd * 0.42, p.pale);
    for (const side of [-1, 1]) {
      B(side * (sw / 2 + 1), 0.007, -1, 0.09, 0.01, sd + 4, p.yellow, false);
      crate(side * (hw - 2), -1);
    }
    B(0, 3.4, -1, w - 3, 0.15, 0.35, p.steel);
    for (const side of [-1, 1]) B(side * (hw - 1.5), 0, -1, 0.16, 3.4, 0.2, p.panel);
    S('EXPEDITION / MAINTENANCE BAY', 0, 2.9, -hd + 0.14, Math.min(w - 3, 15), 0.5);
    T('遠征艇整備資料', left + 1, front - 1, 'info', '遠征艇整備展示。登艇與遠征任務尚未開放。');
    T('整備物資查詢', right - 1, front - 1, 'inventory');
  } else {
    for (const x of points(3, w * 0.62)) server(x, back + 0.9);
    B(0, 3.4, -1, w * 0.7, 0.25, 0.45, p.steel);
    for (const x of [-w * 0.3, w * 0.3]) B(x, 0.012, -1, 0.065, 0.012, d * 0.55, p.yellow, false);
    cabinet(left + 0.4, 2);
    cabinet(right - 0.4, 2);
    S('FACILITIES / TECHNICAL SERVICES', 0, 2.95, -hd + 0.14, Math.min(w - 3, 15), 0.45);
    T(
      '設備與安全操作資料',
      left + 1,
      front - 1,
      'info',
      '檢查設備、保持維修通道淨空。機房門、走廊、樓梯與電梯連接基地各區域。',
    );
    T('庫存與維護物資', right - 1, front - 1, 'inventory');
  }
  return { kind, detailBoxes, interactions };
}
