import * as Layout from './hq-layout.js';
import { selectInteractable, createDoorSystem, createLiftSystem } from './hq-systems.js';
import {
  WING_LABELS,
  wingName,
  wingIdAt,
  floorFamily,
  floorEnvelope,
  roomsOnFloor,
  roomPoint,
  routeStep,
  resetRoute,
  transitCores,
  nearestCore,
  importantFacilities,
  facilityAt,
} from './hq-wayfinding.js';
import { createHQIssueLog, HQ_ISSUE_STATUSES } from './hq-issues.js';
import './hq-ui.css';

const { HQ, HQ_STOPS, floorAt } = Layout;
const WINGS = ['front', 'right', 'back', 'left'];
const create = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
function groupedOptions(select, stops) {
  select.replaceChildren();
  const groups = new Map();
  for (const floor of stops) {
    const key = floor.zone ?? floorFamily(floor);
    if (!groups.has(key)) {
      const group = create('optgroup');
      group.label = key;
      groups.set(key, group);
      select.append(group);
    }
    const option = create('option', '', `${floor.id}　${floor.name}`);
    option.value = floor.id;
    groups.get(key).append(option);
  }
}
function field(label, element) {
  const wrapper = create('label', '', label);
  wrapper.append(element);
  return wrapper;
}
function rangeDestination() {
  const r = Layout.HQ_RANGE;
  const point = Layout.wingPoint
    ? Layout.wingPoint('front', r.y, -144, r.boothV)
    : { x: -140, y: r.y, z: 216.4 - (32 * r.y) / 350 + 23 };
  return { ...point, floor: r.floor, name: '大型射擊訓練場', wing: 'front' };
}

export function createHQController({
  interior,
  collision,
  motor,
  getView,
  getKey,
  notify,
  onOpen,
  onClose,
  onConsole,
  onTraining,
  getMedical,
  getInventory,
  getTrainingRecord = () => 0,
  getRangeStatus = () => null,
  onResetRange,
}) {
  const prompt = create('div');
  prompt.id = 'hq-prompt';
  prompt.hidden = true;
  prompt.setAttribute('role', 'status');
  const panel = create('dialog');
  panel.id = 'hq-panel';
  panel.innerHTML =
    '<form method="dialog"><span class="eyebrow">BORDER / FACILITY TERMINAL</span><button class="hq-close" aria-label="關閉">×</button><h2></h2><div class="hq-content"></div></form>';
  const breadcrumb = create('div');
  breadcrumb.id = 'hq-location';
  breadcrumb.hidden = true;
  const waypointHud = create('div');
  waypointHud.id = 'hq-waypoint';
  waypointHud.hidden = true;
  const rangeHud = create('div');
  rangeHud.id = 'hq-range-readout';
  rangeHud.hidden = true;
  const tools = create('div', 'hq-field-tools');
  tools.hidden = true;
  const guideButton = create('button', '', '設施導覽');
  guideButton.type = 'button';
  guideButton.onclick = directory;
  const reportButton = create('button', '', '畫面問題紀錄');
  reportButton.type = 'button';
  reportButton.onclick = issuePanel;
  tools.append(guideButton, reportButton, create('small', '', 'Tab 釋放游標後可點選'));
  const issueHud = create('div', 'hq-issue-nearby');
  issueHud.hidden = true;
  document.body.append(prompt, panel, breadcrumb, waypointHud, rangeHud, tools, issueHud);
  let storage = null;
  try {
    storage = globalThis.localStorage;
  } catch {}
  const issueLog = createHQIssueLog(storage);
  const doorSystem = createDoorSystem(interior.doors);
  const liftSystems = (interior.lifts ?? [interior.lift]).map((record) => ({
    record,
    system: createLiftSystem(
      record,
      record.doors ?? interior.liftDoors.filter((d) => !d.coreId || d.coreId === (record.id ?? 'main')),
      collision,
    ),
  }));
  const lift = liftSystems.find((r) => (r.record.id ?? 'main') === 'main')?.system ?? liftSystems[0].system;
  const liftFor = (id = 'main') => liftSystems.find((r) => (r.record.id ?? 'main') === id) ?? liftSystems[0];
  const movingLift = () =>
    liftSystems.find(
      (r) =>
        r.system.inside(motor.position) ||
        (Math.hypot(motor.position.x - r.record.x, motor.position.z - r.record.z) < 5 &&
          r.system.snapshot.moving),
    );
  let target = null,
    seated = null,
    exitPoint = null,
    active = false,
    pose = null,
    food = 0,
    drinks = 0,
    waypoint = null;
  let nextHud = 0;

  function close(restore = true) {
    if (!panel.open) return;
    panel.close();
    if (restore) onClose();
  }
  panel.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  panel.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.submitter?.classList.contains('hq-close')) close();
  });
  function show(title, body, actions = [], navigation = false) {
    onOpen();
    panel.classList.toggle('hq-navigation', navigation);
    panel.querySelector('h2').textContent = title;
    const content = panel.querySelector('.hq-content');
    content.replaceChildren();
    if (body) content.append(create('p', '', body));
    if (actions.length) {
      const buttons = create('div', 'hq-actions');
      for (const [label, callback] of actions) {
        const button = create('button', '', label);
        button.type = 'button';
        button.onclick = callback;
        buttons.append(button);
      }
      content.append(buttons);
    }
    if (!panel.open) panel.showModal();
    panel.querySelector('.hq-close').focus();
    return content;
  }
  function safeExit() {
    if (!seated) return true;
    const candidates = [...(seated.exits ?? []), exitPoint].filter(Boolean);
    for (const point of candidates) {
      if (!collision.canOccupy(point.x, point.z, point.y, 1.75, 0.3)) continue;
      motor.teleport(point, getView().yaw);
      seated = null;
      pose = null;
      notify('已站起');
      return true;
    }
    notify('出口受阻，請先清出座位旁的通道再站起');
    return false;
  }
  function sit(object) {
    if (!object.seat || !motor.grounded || Math.abs(motor.position.y - object.seat.y) > 0.25) {
      notify('請先站到座位旁的地面');
      return;
    }
    exitPoint = { ...motor.position };
    seated = object;
    pose = object.type === 'bed' ? 'rest' : 'sit';
    motor.teleport({ ...object.seat }, object.yaw ?? 0);
    motor.velocity.x = motor.velocity.y = motor.velocity.z = 0;
    notify(`${object.type === 'bed' ? '休息中' : '已坐下'} · ${getKey()} 站起`);
  }
  function mark(destination) {
    resetRoute();
    waypoint = { ...destination };
    close();
    notify(`已標記 ${destination.floor ?? floorAt(destination.y).id} ${destination.name} · 跟隨導覽提示前往`);
  }
  function drawMap(svg, floor, selectedWing, rooms) {
    svg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const add = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      if (text !== undefined) el.textContent = text;
      svg.append(el);
      return el;
    };
    const e = floorEnvelope(floor.y),
      scale = Math.min(570 / (e.halfW * 2), 330 / (e.halfD * 2));
    const project = (x, z) => [310 + x * scale, 195 + (z + 150) * scale];
    const rect = (x, z, w, d, attrs) => {
      const [px, py] = project(x - w / 2, z - d / 2);
      return add('rect', { x: px, y: py, width: w * scale, height: d * scale, ...attrs });
    };
    rect(0, -150, e.halfW * 2, e.halfD * 2, { fill: '#416779', stroke: '#6da8b8', 'stroke-width': 2 });
    rect(0, -150, (e.halfW - e.wingDepth) * 2, (e.halfD - e.wingDepth) * 2, {
      fill: '#102e3c',
      stroke: '#345c6f',
    });
    const strips = {
      front: [0, -150 + e.halfD - e.wingDepth / 2, e.halfW * 2, e.wingDepth],
      back: [0, -150 - e.halfD + e.wingDepth / 2, e.halfW * 2, e.wingDepth],
      right: [e.halfW - e.wingDepth / 2, -150, e.wingDepth, (e.halfD - e.wingDepth) * 2],
      left: [-e.halfW + e.wingDepth / 2, -150, e.wingDepth, (e.halfD - e.wingDepth) * 2],
    };
    for (const wing of WINGS) {
      const r = rect(...strips[wing], {
        fill: selectedWing === wing ? '#49b7c4' : '#386174',
        stroke: '#739bad',
        'stroke-width': 0.8,
        tabindex: 0,
        role: 'button',
        'aria-label': wingName(wing),
      });
      r.style.cursor = 'pointer';
      r.addEventListener('click', () => {
        svg.dispatchEvent(new CustomEvent('wingselect', { detail: wing }));
      });
      r.addEventListener('keydown', (event) => {
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          svg.dispatchEvent(new CustomEvent('wingselect', { detail: wing }));
        }
      });
    }
    const range = Layout.HQ_RANGE;
    if (range && floor.y >= range.y && floor.y < range.top) {
      const a = Layout.wingPoint(
        'front',
        floor.y,
        (range.minU + range.maxU) / 2,
        (range.vMin + range.vMax) / 2,
      );
      rect(a.x, a.z, range.maxU - range.minU, range.vMax - range.vMin, { fill: '#e5a0ac', opacity: 0.85 });
    }
    const mapRooms = WINGS.flatMap((wing) => rooms.filter((room) => room.wing === wing).slice(0, 48));
    for (const room of mapRooms) {
      const point = room.point ?? roomPoint(room);
      const [cx, cy] = project(point.x, point.z);
      add('circle', { cx, cy, r: 1.7, fill: '#c0e8ed', opacity: 0.65 });
    }
    for (const facility of importantFacilities().filter(
      (f) => floor.y >= f.y && floor.y < f.top && f.id !== 'shooting-range',
    )) {
      const p = facility.mapPoint ?? facility,
        turn = Layout.wingFrame(facility.wing, facility.y).rotation;
      const [cx, cy] = project(p.x, p.z),
        w = facility.w * scale,
        d = facility.d * scale;
      const color =
        facility.kind === 'hangar' ? '#b7ac5d' : facility.kind === 'command' ? '#48d4dd' : '#6c9fae';
      add('rect', {
        x: cx - w / 2,
        y: cy - d / 2,
        width: w,
        height: d,
        transform: `rotate(${(-turn * 180) / Math.PI} ${cx} ${cy})`,
        fill: color,
        opacity: 0.8,
        stroke: '#c4e7de',
        'stroke-width': 1,
      });
      const label = add(
        'text',
        {
          x: cx,
          y: cy + 4,
          fill: '#081c28',
          'text-anchor': 'middle',
          'font-size': 11,
          'font-weight': 'bold',
        },
        facility.code,
      );
      label.style.pointerEvents = 'none';
    }
    for (const core of transitCores()) {
      const [lx, ly] = project(core.x, core.z);
      add('rect', { x: lx - 4, y: ly - 4, width: 8, height: 8, fill: '#72eaf0', stroke: '#0b2f3c' });
      add('text', { x: lx + 6, y: ly + 3, fill: '#d6faff', 'font-size': 10 }, core.code ?? core.id);
      add('path', {
        d: `M ${lx + 6} ${ly + 8} h 3 v -2 h 3 v -2 h 3`,
        stroke: '#d9ecc4',
        fill: 'none',
        'stroke-width': 1.5,
      });
    }
    for (const issue of issueLog.records.filter((r) => r.floor === floor.id && r.status !== 'fixed')) {
      const [cx, cy] = project(issue.position.x, issue.position.z);
      const marker = add('path', {
        d: `M ${cx} ${cy - 5} L ${cx + 5} ${cy + 4} L ${cx - 5} ${cy + 4} Z`,
        fill: issue.status === 'confirmed' ? '#f08070' : '#f2ca78',
        stroke: '#1e2b34',
      });
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${HQ_ISSUE_STATUSES[issue.status]}：${issue.note || issue.title}`;
      marker.append(title);
    }
    add('text', { x: 310, y: 192, fill: '#9bc0ce', 'text-anchor': 'middle', 'font-size': 15 }, '中央中庭');
    add(
      'text',
      { x: 310, y: 217, fill: '#769ead', 'text-anchor': 'middle', 'font-size': 11 },
      `${floor.id} / ${floor.name}`,
    );
    add('text', { x: 310, y: 21, fill: '#b5dce5', 'text-anchor': 'middle', 'font-size': 12 }, '北側翼');
    add(
      'text',
      { x: 310, y: 385, fill: '#b5dce5', 'text-anchor': 'middle', 'font-size': 12 },
      '南側・正面入口',
    );
    if (Math.abs(motor.position.y - floor.y) < 2.5) {
      const [cx, cy] = project(motor.position.x, motor.position.z);
      add('circle', { cx, cy, r: 5, fill: '#ffd38c', stroke: '#182f3c', 'stroke-width': 2 });
    }
    if (waypoint && Math.abs(waypoint.y - floor.y) < 2.5) {
      const [cx, cy] = project(waypoint.x, waypoint.z);
      add('path', {
        d: `M ${cx} ${cy - 7} L ${cx + 6} ${cy} L ${cx} ${cy + 7} L ${cx - 6} ${cy} Z`,
        fill: '#f1f9c9',
        stroke: '#a7d161',
      });
    }
  }
  function directory() {
    const current = floorAt(motor.position.y);
    const content = show(
      '基地樓層與區域導覽',
      '四側設施翼由環形走廊相連。選擇樓層、區域或房間後，可在場景中標記步行路線。',
      [],
      true,
    );
    const facilitySection = create('section', 'hq-major-facilities');
    facilitySection.append(create('h3', '', '重要設施 · 選擇後顯示實際步行路線'));
    const majorCards = create('div', 'hq-facility-cards');
    for (const destination of importantFacilities()) {
      const button = create('button');
      button.type = 'button';
      button.dataset.facility = destination.id;
      button.append(
        create('strong', '', `${destination.code}　${destination.name}`),
        create('span', '', `${destination.floor} · ${wingName(destination.wing)}`),
      );
      button.onclick = () => mark(destination);
      majorCards.append(button);
    }
    facilitySection.append(majorCards);
    content.append(facilitySection);
    const controls = create('div', 'hq-form-row');
    const floorSelect = create('select');
    floorSelect.setAttribute('aria-label', '導覽樓層');
    groupedOptions(floorSelect, HQ_STOPS);
    floorSelect.value = current.id;
    const wingSelect = create('select');
    wingSelect.setAttribute('aria-label', '導覽區域');
    for (const [value, label] of [['all', '四側全部'], ...WINGS.map((wing) => [wing, wingName(wing)])]) {
      const option = create('option', '', label);
      option.value = value;
      wingSelect.append(option);
    }
    const search = create('input');
    search.type = 'search';
    search.placeholder = '搜尋本層房間、會議室、宿舍…';
    search.setAttribute('aria-label', '搜尋房間');
    controls.append(field('樓層', floorSelect), field('設施翼', wingSelect), field('房間搜尋', search));
    const grid = create('div', 'hq-directory'),
      mapFrame = create('div', 'hq-map-frame');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('hq-floor-map');
    svg.setAttribute('viewBox', '0 0 620 400');
    svg.setAttribute('aria-label', '基地樓層平面圖');
    svg.setAttribute('role', 'img');
    const legend = create('div', 'hq-map-legend');
    legend.append(
      create('span', '', '四處電梯／樓梯'),
      create('span', 'special', '重要設施'),
      create('span', 'issue', '畫面問題（待核對／已確認）'),
      create('span', 'range', '大型射擊訓練場'),
      create('span', 'player', '目前位置'),
    );
    mapFrame.append(svg, legend);
    const listColumn = create('div'),
      summary = create('p', 'hq-map-note'),
      list = create('div', 'hq-room-list');
    listColumn.append(summary, list);
    grid.append(mapFrame, listColumn);
    const quick = create('div', 'hq-actions');
    const rangeButton = create('button', '', '標記 7F 大型射擊訓練場');
    rangeButton.type = 'button';
    rangeButton.onclick = () => mark(rangeDestination());
    const liftButton = create('button', '', '標記最近電梯／樓梯');
    liftButton.type = 'button';
    liftButton.onclick = () => {
      const core = nearestCore(motor.position);
      mark({
        x: core.x,
        y: current.y,
        z: core.z + 7,
        floor: current.id,
        wing: core.wing,
        name: `${core.code} ${core.name}`,
        coreId: core.id,
        transit: 'lift',
      });
    };
    const issueButton = create('button', '', '畫面問題紀錄');
    issueButton.type = 'button';
    issueButton.onclick = issuePanel;
    const clearButton = create('button', '', '清除場景標記');
    clearButton.type = 'button';
    clearButton.onclick = () => {
      waypoint = null;
      resetRoute();
      redraw();
      notify('已清除導覽標記');
    };
    quick.append(rangeButton, liftButton, issueButton, clearButton);
    content.append(
      controls,
      grid,
      quick,
      create(
        'p',
        'hq-map-note',
        '設施種類參考作品；完整樓層、尺寸及房間位置為本作配置。粉紅色長帶為實體射擊訓練場。',
      ),
    );
    function redraw() {
      const floor = HQ_STOPS.find((f) => f.id === floorSelect.value) ?? current;
      const allRooms = roomsOnFloor(floor.id);
      const facilities = importantFacilities().filter((f) => floor.y >= f.y && floor.y < f.top);
      const query = search.value.trim().toLowerCase();
      const rooms = allRooms.filter(
        (room) =>
          (wingSelect.value === 'all' || room.wing === wingSelect.value) &&
          (!query || `${room.name} ${room.id}`.toLowerCase().includes(query)),
      );
      drawMap(svg, floor, wingSelect.value, allRooms);
      summary.textContent = `${floor.id} ${floor.name} · ${rooms.length} 間房室${rooms.length > 70 ? '（先顯示 70 間）' : ''}`;
      list.replaceChildren();
      for (const facility of facilities.filter(
        (f) =>
          (wingSelect.value === 'all' || f.wing === wingSelect.value) &&
          (!query || `${f.code} ${f.name}`.toLowerCase().includes(query)),
      )) {
        const button = create('button', 'hq-facility-result');
        button.type = 'button';
        button.append(
          create('strong', '', `${facility.code} ${facility.name}`),
          create('small', '', `${facility.floor} · ${wingName(facility.wing)}`),
        );
        button.onclick = () => mark(facility);
        list.append(button);
      }
      if (!rooms.length)
        list.append(
          create(
            'p',
            'hq-map-note',
            floor.id === 'RF'
              ? '頂樓為通訊設備、屋頂步道及服務核心。'
              : '本區為大型開放設施、通道或觀察迴廊。可由粉紅色區域及電梯標示辨識動線。',
          ),
        );
      for (const room of rooms.slice(0, 70)) {
        const button = create('button');
        button.type = 'button';
        button.append(create('span', '', room.name), create('small', '', wingName(room.wing)));
        button.onclick = () =>
          mark({ ...room.point, name: room.name, floor: floor.id, wing: room.wing, roomId: room.id });
        list.append(button);
      }
    }
    floorSelect.onchange = redraw;
    wingSelect.onchange = redraw;
    search.oninput = redraw;
    svg.addEventListener('wingselect', (event) => {
      wingSelect.value = event.detail;
      redraw();
    });
    redraw();
  }
  function issuePanel() {
    const point = { ...motor.position },
      floor = floorAt(point.y),
      wing = wingIdAt(point);
    const content = show(
      '畫面問題紀錄',
      `記錄目前位置：${floor.id} · ${wingName(wing)} · X ${point.x.toFixed(1)} / Y ${point.y.toFixed(1)} / Z ${point.z.toFixed(1)}。回報先列為「待核對」，不代表系統已確認。`,
      [],
      true,
    );
    const note = create('textarea');
    note.rows = 3;
    note.maxLength = 1500;
    note.placeholder = '例如：面向北側時牆面閃爍、樓梯交接有縫隙。';
    note.setAttribute('aria-label', '畫面問題描述');
    const save = create('button', '', '記錄目前位置');
    save.type = 'button';
    const status = create('p', 'hq-map-note');
    save.onclick = () => {
      if (!note.value.trim()) {
        status.textContent = '請先簡述看到的問題。';
        note.focus();
        return;
      }
      issueLog.add({ position: point, floor: floor.id, wing, note: note.value.trim() });
      note.value = '';
      status.textContent = '已儲存在本機；導覽圖會標示此位置。';
      redraw();
    };
    const exportButton = create('button', '', '匯出紀錄 JSON');
    exportButton.type = 'button';
    exportButton.onclick = () => {
      const blob = new Blob([issueLog.export()], { type: 'application/json' }),
        url = URL.createObjectURL(blob),
        a = create('a');
      a.href = url;
      a.download = 'border-hq-visual-issues.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const back = create('button', '', '返回設施導覽');
    back.type = 'button';
    back.onclick = directory;
    const actions = create('div', 'hq-actions');
    actions.append(save, exportButton, back);
    const list = create('div', 'hq-issue-list');
    content.append(field('觀察到的畫面問題', note), actions, status, list);
    function redraw() {
      list.replaceChildren();
      const records = issueLog.records;
      if (!records.length) {
        list.append(create('p', 'hq-map-note', '目前沒有已儲存的畫面問題。'));
        return;
      }
      for (const record of records.slice().reverse()) {
        const row = create('article', 'hq-issue-record');
        row.append(
          create(
            'strong',
            '',
            `${HQ_ISSUE_STATUSES[record.status]} · ${record.floor} · ${wingName(record.wing)}`,
          ),
          create('p', '', record.note || record.title),
          create(
            'small',
            '',
            `${record.id} · X ${record.position.x.toFixed(1)} / Y ${record.position.y.toFixed(1)} / Z ${record.position.z.toFixed(1)}`,
          ),
        );
        const buttons = create('div', 'hq-actions');
        const locate = create('button', '', '標記位置');
        locate.type = 'button';
        locate.onclick = () =>
          mark({
            ...record.position,
            name: `${HQ_ISSUE_STATUSES[record.status]} ${record.note || record.title}`,
            floor: record.floor,
            wing: record.wing,
            issueId: record.id,
          });
        const fixed = create('button', '', record.status === 'fixed' ? '重新開啟' : '標為已修復');
        fixed.type = 'button';
        fixed.onclick = () => {
          issueLog.setStatus(record.id, record.status === 'fixed' ? 'reported' : 'fixed');
          redraw();
        };
        const remove = create('button', '', '刪除');
        remove.type = 'button';
        remove.onclick = () => {
          issueLog.remove(record.id);
          redraw();
        };
        buttons.append(locate, fixed, remove);
        row.append(buttons);
        list.append(row);
      }
    }
    redraw();
  }
  function elevator(coreId = 'main') {
    const selectedLift = liftFor(coreId),
      lift = selectedLift.system;
    const core = transitCores().find((c) => c.id === (selectedLift.record.id ?? 'main')) ?? transitCores()[0];
    const content = show(
      `${core.code ?? ''} ${core.name ?? '電梯'} · 樓層選擇`,
      `目前 ${floorAt(lift.snapshot.y).id} · 高度 ${lift.snapshot.y.toFixed(1)} m。先進入轎廂，再選擇目的樓層。`,
      [],
      true,
    );
    const quick = create('div', 'hq-quick-floors');
    const select = create('select');
    select.setAttribute('aria-label', '目的樓層');
    groupedOptions(select, HQ_STOPS);
    select.value = floorAt(lift.snapshot.y).id;
    const quickStops = HQ_STOPS.filter(
      (floor, index, all) =>
        index === 0 ||
        floor.id === '1F' ||
        floor.id === '2F' ||
        floor.id === '7F' ||
        floor.id === 'RF' ||
        floor.zone !== all[index - 1]?.zone,
    );
    for (const { id } of quickStops) {
      const floor = HQ_STOPS.find((f) => f.id === id);
      if (!floor) continue;
      const button = create('button', '', id);
      button.type = 'button';
      button.title = floor.name;
      button.onclick = () => {
        select.value = id;
        refresh();
      };
      quick.append(button);
    }
    const search = create('input');
    search.type = 'search';
    search.placeholder = '樓層或設施名稱';
    search.setAttribute('aria-label', '篩選電梯樓層');
    const row = create('div', 'hq-form-row');
    row.append(field('搜尋樓層', search), field('目的樓層', select));
    const selected = create('p', 'hq-lift-selected'),
      detail = create('p', 'hq-map-note'),
      actions = create('div', 'hq-actions');
    const travel = create('button', '', '前往選定樓層');
    travel.type = 'button';
    travel.onclick = () => {
      const floor = HQ_STOPS.find((f) => f.id === select.value);
      if (!floor) return;
      if (!lift.request(floor.id)) {
        notify('電梯運行中，請等候到站');
        return;
      }
      close();
      notify(`前往 ${floor.id} ${floor.name} · 請站在轎廂內`);
    };
    actions.append(travel);
    content.append(quick, row, selected, detail, actions);
    function refresh() {
      const floor = HQ_STOPS.find((f) => f.id === select.value);
      selected.textContent = floor ? `${floor.id}　${floor.name}` : '沒有相符樓層';
      detail.textContent = floor
        ? `${floor.zone ?? floorFamily(floor)} · 高度 ${floor.y.toFixed(0)} m`
        : '請改用其他樓層編號或設施名稱搜尋';
      travel.disabled = !floor;
    }
    search.oninput = () => {
      const value = search.value.trim().toLowerCase(),
        previous = select.value;
      const matches = HQ_STOPS.filter(
        (f) => !value || `${f.id} ${f.name} ${f.zone ?? ''}`.toLowerCase().includes(value),
      );
      groupedOptions(select, matches);
      if (matches.some((f) => f.id === previous)) select.value = previous;
      refresh();
    };
    select.onchange = refresh;
    refresh();
  }
  function rangeText() {
    const status = getRangeStatus();
    if (!status)
      return '7F 正面翼為大型實體射擊訓練場。沿長帶排列的射擊隔間朝向靶區；各層觀察通道連接維護區。';
    if (typeof status === 'string') return status;
    return (
      status.summary ??
      `實體靶場 · 擊破 ${status.cleared ?? status.destroyed ?? 0} / ${status.total ?? status.targets?.length ?? '—'} 靶 · 命中 ${status.hits ?? 0} 次`
    );
  }
  function use(object) {
    if (object.type === 'door') {
      if (!doorSystem.activate(object.door))
        notify(object.door.kind === 'lift' ? '電梯尚未到站，請使用呼叫面板' : '門禁管制');
      return;
    }
    if (object.type === 'seat' || object.type === 'bed') {
      sit(object);
      return;
    }
    if (object.kind === 'liftCall') {
      notify(
        liftFor(object.coreId).system.request(object.text)
          ? '電梯呼叫已送出 · 到站後雙扇門會開啟'
          : '電梯運行中，請到站後再呼叫',
      );
      return;
    }
    if (object.kind === 'lift') {
      elevator(object.coreId);
      return;
    }
    if (object.kind === 'loadout' || object.kind === 'missions') {
      onConsole(object.kind === 'loadout' ? 'loadout' : 'missions');
      return;
    }
    if (object.kind === 'training') {
      show(
        '訓練模式',
        `虛擬訓練可練習射擊、近戰與蚱蜢移動。實體長條射擊場位於 7F 正面翼，可由基地走廊與電梯到達。\n本機虛擬訓練最佳：${getTrainingRecord()} 分`,
        [
          [
            '開始靜態靶訓練',
            () => {
              close();
              onTraining();
            },
          ],
          ['標記實體射擊訓練場', () => mark(rangeDestination())],
          [
            '裝備與保存',
            () => {
              close(false);
              onConsole('loadout');
            },
          ],
        ],
      );
      return;
    }
    if (object.kind === 'range' || object.kind === 'rangeControl' || object.kind === 'shootingRange') {
      const actions = [
        [
          '裝備與保存',
          () => {
            close(false);
            onConsole('loadout');
          },
        ],
        ['基地平面導覽', directory],
      ];
      if (onResetRange)
        actions.unshift([
          '重置實體靶標',
          () => {
            onResetRange();
            notify('實體射擊場靶標已重置');
            close();
          },
        ]);
      show('大型射擊訓練場', rangeText(), actions);
      return;
    }
    if (object.kind === 'issues' || object.kind === 'visualReport') {
      issuePanel();
      return;
    }
    if (object.kind === 'directory') {
      directory();
      return;
    }
    if (object.kind === 'medical') {
      show(object.name, getMedical() + '\n少量恢復三離子不會修復斷肢。需緊急脫離或重試，才能重整戰鬥體。');
      return;
    }
    if (object.kind === 'inventory') {
      show(object.name, getInventory() + '\n物流箱與遠征艇目前用於整備與設施探索；遠征任務尚未開放。');
      return;
    }
    if (object.kind === 'food' || object.kind === 'vending') {
      show(
        object.name,
        `${object.kind === 'food' ? '今日菜單：咖哩飯、拉麵、沙拉' : '飲品：礦泉水、茶、咖啡'}。\n本次領取：餐點 ${food}、飲品 ${drinks}`,
        (object.kind === 'food' ? ['咖哩飯', '拉麵', '沙拉'] : ['礦泉水', '茶', '咖啡']).map((item) => [
          item,
          () => {
            if (object.kind === 'food') food++;
            else drinks++;
            notify(`已領取${item}`);
            close();
          },
        ]),
      );
      return;
    }
    if (object.kind === 'exercise') {
      show(object.name, '動作訓練可練習衝刺、方向閃避、蹲下通行、跳躍與蚱蜢串聯。', [
        [
          '前往虛擬訓練',
          () => {
            close();
            onTraining();
          },
        ],
      ]);
      return;
    }
    if (object.kind === 'radar') {
      show(
        object.name,
        `目前位置 X ${motor.position.x.toFixed(0)} / Z ${motor.position.z.toFixed(0)}，高度 ${motor.position.y.toFixed(1)} m。\nBORDER 基地位於三門市中央；南側為河流，城市外緣由山丘包圍。`,
        [['開啟基地樓層導覽', directory]],
      );
      return;
    }
    if (object.kind === 'hologram') {
      const projection =
        object.projection ??
        interior.projections?.find(
          (p) =>
            p.id === object.roomId ||
            (Math.abs(p.y - (object.y - 1)) < 0.1 && Math.abs(p.x - (object.x + 8)) < 0.1),
        );
      const group = projection?.group ?? projection;
      if (!group || typeof group.visible !== 'boolean') {
        notify('投影設備尚未就緒');
        return;
      }
      group.visible = !group.visible;
      notify(group.visible ? '戰術投影已開啟' : '戰術投影已收起');
      return;
    }
    if (object.kind === 'evacuation') {
      show(
        object.name,
        '先依指示找到最近的南／東／北／西服務核心，走樓梯下降至 1F，再沿環形主走廊前往南側正面大廳離開。四處核心均設有樓層標示與電梯。',
        [
          [
            '標記安全出口',
            () => mark({ x: 0, y: 0, z: 247.5, name: '正面安全出口', floor: '1F', wing: 'front' }),
          ],
        ],
      );
      return;
    }
    if (object.kind === 'guide') {
      show(
        object.name,
        `WASD 移動 · Shift 衝刺 · Space 跳躍 · C 蹲下 · V 視角 · ${getKey()} 互動 · Z 切換射擊側 · Q 蚱蜢 · E 生成觸發器 · 右鍵分割 · 左鍵發射。\n四側設施翼由環形走廊相連，7F 正面翼為大型射擊訓練場。`,
        [['開啟基地平面導覽', directory]],
      );
      return;
    }
    show(object.name, object.text || 'BORDER 設施資訊。');
  }
  function updateHud(dt) {
    nextHud -= dt;
    if (nextHud > 0) return;
    nextHud = 0.1;
    const inside =
      active &&
      (Layout.isHQInterior?.(motor.position.x, motor.position.y, motor.position.z) ??
        (Math.abs(motor.position.x) < 624 && motor.position.z > -550 && motor.position.z < 250));
    document.body.classList.toggle('hq-inside', inside);
    breadcrumb.hidden = !inside;
    if (inside) {
      const floor = floorAt(motor.position.y),
        wing = wingIdAt(motor.position);
      const facility = facilityAt(motor.position),
        currentLift = movingLift();
      breadcrumb.textContent = `BORDER / ${floor.id}　${facility ? `${facility.code} ${facility.name}` : wing === 'courtyard' ? '中央中庭' : wingName(wing)}${currentLift?.system.snapshot.moving ? '　｜ ' + (currentLift.record.name ?? '電梯') + ' 運行中' : ''}`;
    }
    tools.hidden = !inside || panel.open;
    const nearbyIssue = issueLog.records
      .filter((r) => r.status !== 'fixed' && Math.abs(r.position.y - motor.position.y) < 3)
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - motor.position.x, a.position.z - motor.position.z) -
          Math.hypot(b.position.x - motor.position.x, b.position.z - motor.position.z),
      )[0];
    issueHud.hidden =
      !inside ||
      panel.open ||
      !nearbyIssue ||
      Math.hypot(nearbyIssue.position.x - motor.position.x, nearbyIssue.position.z - motor.position.z) > 30;
    if (!issueHud.hidden)
      issueHud.textContent = `△ ${HQ_ISSUE_STATUSES[nearbyIssue.status]} · ${nearbyIssue.note || nearbyIssue.title}`;
    waypointHud.hidden = !active || !waypoint || panel.open;
    if (!waypointHud.hidden) {
      const step = routeStep(motor.position, waypoint),
        dx = step.point.x - motor.position.x,
        dz = step.point.z - motor.position.z,
        distance = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, -dz),
        viewHeading = -getView().yaw;
      const delta = Math.atan2(Math.sin(heading - viewHeading), Math.cos(heading - viewHeading));
      const arrow = Math.abs(delta) < 0.35 ? '↑' : delta > 0 ? '→' : '←';
      waypointHud.replaceChildren(
        create('span', '', `${arrow} ${step.label} · ${distance.toFixed(0)} m`),
        create('small', '', `${waypoint.floor ?? floorAt(waypoint.y).id}　${waypoint.name}`),
      );
      if (!step.vertical && Math.hypot(waypoint.x - motor.position.x, waypoint.z - motor.position.z) < 3) {
        notify(`已抵達 ${waypoint.name}`);
        waypoint = null;
      }
    }
    const range = Layout.HQ_RANGE;
    const inRange =
      inside &&
      range &&
      wingIdAt(motor.position) === 'front' &&
      motor.position.y >= range.y - 0.1 &&
      motor.position.y < range.top &&
      motor.position.x > range.minU - 3 &&
      motor.position.x < range.maxU + 3 &&
      Math.abs(motor.position.z - Layout.wingFrame('front', range.y).z) < HQ.wingDepth / 2;
    rangeHud.hidden = !inRange || panel.open;
    if (inRange) rangeHud.textContent = rangeText();
  }
  return {
    interact() {
      if (panel.open) return;
      if (seated) {
        safeExit();
        return;
      }
      if (target && interior.objects.includes(target)) use(target);
    },
    escape() {
      if (panel.open) {
        close();
        return true;
      }
      if (seated) {
        safeExit();
        return true;
      }
      return false;
    },
    reset() {
      close(false);
      if (seated) safeExit();
      seated = null;
      pose = null;
      target = null;
      waypoint = null;
      resetRoute();
      document.body.classList.remove('hq-inside');
      prompt.hidden =
        breadcrumb.hidden =
        waypointHud.hidden =
        rangeHud.hidden =
        tools.hidden =
        issueHud.hidden =
          true;
    },
    update(dt, exploring, simulation = false) {
      active = exploring && !simulation;
      // Install nearby room collision and door records before physics/target work for this tick.
      interior.updateVisibility(motor.position, active);
      if (active) {
        for (const entry of liftSystems) entry.system.update(dt, motor);
        doorSystem.update(dt, motor.position, (coreId) => liftFor(coreId).system.snapshot);
      }
      if (seated) motor.velocity.x = motor.velocity.y = motor.velocity.z = 0;
      target =
        active && !panel.open && !seated
          ? selectInteractable(interior.objects, { ...getView(), trace: collision.segmentFraction })
          : null;
      prompt.hidden = !active || (!target && !seated) || panel.open;
      if (!prompt.hidden)
        prompt.textContent = seated
          ? `${getKey()}　站起`
          : `${getKey()}　${target.type === 'seat' ? '坐下 · ' : target.type === 'bed' ? '休息 · ' : ''}${target.name}`;
      updateHud(dt);
    },
    get seatSolids() {
      return seated?.solids ?? null;
    },
    get seated() {
      return !!seated;
    },
    get pose() {
      return pose;
    },
    get isOpen() {
      return panel.open;
    },
    get waypoint() {
      return waypoint ? { ...waypoint } : null;
    },
    get snapshot() {
      return {
        active,
        target: target?.name ?? null,
        seated: seated?.name ?? null,
        pose,
        panel: panel.open,
        lift: lift.snapshot,
        lifts: liftSystems.map(({ record, system }) => ({
          id: record.id ?? 'main',
          name: record.name,
          ...system.snapshot,
        })),
        visualIssues: issueLog.records,
        facility: facilityAt(motor.position)?.id ?? null,
        waypoint: waypoint ? { ...waypoint } : null,
        ...interior.diagnostics,
      };
    },
  };
}
