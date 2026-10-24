import * as THREE from 'three';
import * as Layout from './hq-layout.js';

/** Four independently operated lift/stair cores. All coordinates are real world metres. */
export function buildHQTransit({ scope, apiFor, box, finish, collision, cube, material, root, register }) {
  const { HQ, HQ_STOPS, stairFlights } = Layout;
  const definitions = Layout.HQ_CORES ?? [{ id: 'main', x: HQ.lift.x, z: HQ.lift.z }];
  const coreScopes = [],
    stairScopes = [],
    foundations = [],
    roofScopes = [],
    lifts = [],
    liftDoors = [];
  const flights = stairFlights();
  for (const [index, core] of definitions.entries()) {
    const id = core.id,
      x = core.x,
      z = core.z;
    const label =
      core.name ?? core.label ?? ['正面交通核心', '東側交通核心', '北側交通核心', '西側交通核心'][index];
    const code = core.code ?? `T${String(index + 1).padStart(2, '0')}`;
    const ownDoors = [];
    for (const floor of HQ_STOPS) {
      const s = scope(`${floor.id} ${label}`, floor.y, 'core'),
        a = apiFor(s);
      s.coreId = id;
      const height = floor.id === 'RF' ? 3.3 : HQ.roomHeight;
      coreScopes.push(s);
      a.box(s.g, x - 5, floor.y, z, 0.18, height, 24, '#334d63');
      a.box(s.g, x + 3, floor.y, z, 0.18, height, 24, '#334d63');
      if (floor.id !== 'RF') {
        a.box(s.g, x, floor.y, z - 2.2, 4, height, 0.18, '#273f55');
        for (const side of [-2.2, 2.2]) a.box(s.g, x + side, floor.y, z, 0.18, height, 4.2, '#526d80');
      }
      a.box(s.g, x, floor.y + 2.8, z + 2.1, 4, height - 2.8, 0.18, '#415d74');
      a.box(s.g, x + 2.93, floor.y + 0.18, z + 7, 0.035, height - 0.35, 0.08, '#37dce7', false);
      const door = a.door(s.g, {
        x,
        y: floor.y,
        z: z + 2.1,
        w: 3,
        h: 2.8,
        name: id === 'main' ? `電梯 ${floor.id}` : `${code} 電梯 ${floor.id}`,
        automatic: false,
        kind: 'lift',
      });
      door.coreId = id;
      ownDoors.push(door);
      liftDoors.push(door);
      const call = a.terminal(
        s.g,
        id === 'main' ? `呼叫電梯 ${floor.id}` : `呼叫 ${code} 電梯 ${floor.id}`,
        x + 3.8,
        floor.y,
        z + 12,
        'liftCall',
        floor.id,
      );
      call.coreId = id;
      a.sign(s.g, `${code} ${label} / ${floor.id}　電梯 ←　樓梯 →`, x + 9, floor.y + 3.2, z + 13, 18, 0.8);
      a.box(s.g, x + 19, floor.y, z + 1, 0.15, height, 18, '#415d74');
      finish(s);
    }

    // Preserve the original switchback geometry, translated to each separate shaft.
    const dx = x - HQ.lift.x,
      dz = z - HQ.lift.z;
    const grouped = new Map();
    for (const f of flights) {
      const key = Math.floor(f.index / 4);
      if (!grouped.has(key)) {
        const s = scope(`${code} 維修樓梯 ${key}`, f.y, 'stairs');
        s.coreId = id;
        grouped.set(key, s);
        stairScopes.push(s);
      }
      const s = grouped.get(key);
      for (let i = 0; i < f.steps; i++) {
        const stepZ = (f.back ? 203 - ((i + 0.5) * 8) / f.steps : 195 + ((i + 0.5) * 8) / f.steps) + dz;
        box(s.g, f.x + dx, f.y, stepZ, f.w, ((i + 1) * f.rise) / f.steps, 8 / f.steps + 0.001, '#6d879c');
      }
      box(s.g, 55 + dx, f.y + f.rise - 0.18, (f.back ? 193.5 : 204.5) + dz, 14, 0.18, 3, '#8da8b9');
      for (const edge of [f.x - f.w / 2 - 0.06, f.x + f.w / 2 + 0.06])
        for (let i = 0; i < 4; i++)
          box(
            s.g,
            edge + dx,
            f.y + (i * f.rise) / 4,
            199 + (f.back ? 1 : -1) * (3 - i * 2) + dz,
            0.08,
            1.1 + f.rise / 4,
            2,
            '#446c81',
          );
      box(s.g, 55 + dx, f.y + f.rise, (f.back ? 192.1 : 205.9) + dz, 14, 1.1, 0.1, '#446c81');
    }
    for (const s of grouped.values()) finish(s);
    const foundation = scope(`${code} 地下核心底板`, HQ.basementY, 'stairs');
    foundation.coreId = id;
    box(foundation.g, 55 + dx, HQ.basementY - 0.2, 204.5 + dz, 14, 0.2, 3, '#6d879c');
    finish(foundation);
    foundations.push(foundation);

    const roof = scope(`${code} 屋頂電梯出口`, HQ.roof, 'roof'),
      ra = apiFor(roof);
    for (const side of [-2.2, 2.2]) ra.box(roof.g, x + side, HQ.roof, z, 0.2, 3.3, 4.2, '#3a586f');
    ra.box(roof.g, x, HQ.roof, z - 2.2, 4.6, 3.3, 0.18, '#30495e');
    ra.box(roof.g, x, HQ.roof + 3.3, z, 4.6, 0.18, 4.6, '#6d879c');
    ra.sign(roof.g, `${code} / ${label}`, x, HQ.roof + 3.05, z + 2.31, 4, 0.4);
    finish(roof);
    roofScopes.push(roof);

    const cabin = new THREE.Group();
    cabin.name = `${code} ${label} 電梯轎廂`;
    cabin.position.set(x, 0, z);
    root.add(cabin);
    const floorMesh = new THREE.Mesh(cube, material('#415d74'));
    floorMesh.position.y = -0.09;
    floorMesh.scale.set(3.8, 0.18, 3.8);
    cabin.add(floorMesh);
    const platform = collision.add({ x, y: -0.18, z, w: 3.8, h: 0.18, d: 3.8 }),
      fixtures = [];
    function cabinBox(bx, by, bz, w, h, d, color, front = false) {
      const m = new THREE.Mesh(cube, material(color));
      m.position.set(bx, by + h / 2, bz);
      m.scale.set(w, h, d);
      cabin.add(m);
      fixtures.push({
        m,
        x: bx,
        y: by,
        z: bz,
        w,
        h,
        d,
        front,
        solid: collision.add({ x: x + bx, y: by, z: z + bz, w, h, d }),
      });
    }
    cabinBox(-1.85, 0, 0, 0.12, 2.9, 3.8, '#314c62');
    cabinBox(1.85, 0, 0, 0.12, 2.9, 3.8, '#314c62');
    cabinBox(0, 0, -1.85, 3.8, 2.9, 0.12, '#263d53');
    cabinBox(0, 2.9, 0, 3.8, 0.12, 3.8, '#afe7ed');
    cabinBox(0, 0, 1.85, 3.8, 2.9, 0.12, '#415d74', true);
    const panel = new THREE.Mesh(cube, material('#37dce7'));
    panel.position.set(0.9, 1.4, -1.76);
    panel.scale.set(0.65, 0.8, 0.02);
    cabin.add(panel);
    const controlScope = scope(`${code} 電梯控制紀錄`, 0, 'liftControl');
    const control = register(
      controlScope.g,
      'terminal',
      id === 'main' ? '電梯樓層控制' : `${code} 電梯樓層控制`,
      x + 0.9,
      1.3,
      z - 1.65,
      { id: id === 'main' ? 'lift-control' : `lift-control-${id}`, kind: 'lift', coreId: id },
    );
    const lift = {
      id,
      coreId: id,
      x,
      z,
      name: label,
      code,
      cabin,
      platform,
      fixtures,
      control,
      doors: ownDoors,
      y: 0,
      target: 0,
      moving: false,
    };
    for (const door of ownDoors) door.lift = lift;
    lifts.push(lift);
  }
  return {
    lifts,
    lift: lifts[0],
    liftDoors,
    coreScopes,
    stairScopes,
    foundations,
    roofScopes,
    flights,
    flightsPerCore: flights.length,
    totalStairFlights: flights.length * definitions.length,
  };
}
