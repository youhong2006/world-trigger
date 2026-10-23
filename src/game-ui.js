import {
  ACTIONS,
  DEFAULTS,
  RANGES,
  normalizeSettings,
  rebind,
  keyLabel,
  validBinding,
  saveSettings,
  SETTINGS_KEY,
} from './game-settings.js';
import { MISSION_MODES, DIFFICULTIES } from './battle-session.js';
import { EQUIPPABLE, SHOOTING_TYPES, FIRE_RANGES, shotCost } from './armory.js';
import { samplePolyline } from './trajectory-plan.js';
import { TRIGGERS } from './combat-core.js';
import { PATH_TEMPLATES, cleanDraft, loadDraft, saveDraft } from './trajectory-plan.js';
const $ = (selector, root = document) => root.querySelector(selector);
const labels = {
  masterVolume: '主音量',
  ambientVolume: '環境音量',
  effectsVolume: '技能音效',
  sensitivity: '滑鼠靈敏度',
  aimSensitivity: '瞄準靈敏度倍率',
  walkSpeed: '一般移動速度',
  runSpeed: '衝刺速度',
  jumpSpeed: '起跳速度',
  boostSpeed: '蚱蜢水平彈射速度',
  fov: '視野角度',
  cameraDistance: '第三人稱距離',
  cameraSmooth: '鏡頭跟隨反應',
  resolution: '解析度倍率',
  detailDistance: '建築細節距離',
  hudScale: 'HUD 大小',
  hudOpacity: 'HUD 不透明度',
  glow: '三離子光暈強度',
  cameraShake: '戰鬥鏡頭震動',
  hitFlash: '受擊畫面光暈',
};
const checks = {
  muted: '全部靜音',
  muteOnBlur: '切換視窗時靜音',
  invertY: '反轉垂直視角',
  sprintToggle: '按一下切換衝刺',
  crouchToggle: '按一下切換蹲下',
  speedFov: '高速移動時增加視野',
  reducedMotion: '減少動態效果',
  shadows: '場景陰影',
  minimap: '顯示區域雷達',
  hints: '顯示操作提示',
  showFps: '顯示 FPS',
};
const options = {
  cameraMode: [
    ['third', '第三人稱'],
    ['first', '第一人稱'],
  ],
  shoulder: [
    ['right', '右肩'],
    ['left', '左肩'],
  ],
  quality: [
    ['low', '效能優先'],
    ['medium', '平衡'],
    ['high', '高畫質'],
    ['custom', '自訂'],
  ],
  fpsLimit: [
    [30, '30 FPS'],
    [60, '60 FPS'],
    [0, '不限制'],
  ],
  crosshair: [
    ['cross', '十字'],
    ['dot', '圓點'],
    ['none', '隱藏'],
  ],
};
const selectLabels = {
  cameraMode: '預設視角',
  shoulder: '肩部視角',
  quality: '畫質預設',
  fpsLimit: '畫面更新上限',
  crosshair: '準星樣式',
};
const categories = {
  操作: ['sensitivity', 'aimSensitivity', 'invertY', 'sprintToggle', 'crouchToggle'],
  移動: ['walkSpeed', 'runSpeed', 'jumpSpeed', 'boostSpeed'],
  鏡頭: [
    'cameraMode',
    'fov',
    'cameraDistance',
    'shoulder',
    'cameraSmooth',
    'speedFov',
    'reducedMotion',
    'cameraShake',
    'hitFlash',
  ],
  畫質: ['quality', 'resolution', 'shadows', 'detailDistance', 'fpsLimit'],
  聲音: ['masterVolume', 'ambientVolume', 'effectsVolume', 'muted', 'muteOnBlur'],
  介面: ['hudScale', 'hudOpacity', 'crosshair', 'glow', 'minimap', 'hints', 'showFps'],
  按鍵: [],
  其他: [],
};
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function valueLabel(key, value) {
  if (/Volume|Opacity/.test(key)) return Math.round(value * 100) + '%';
  if (['walkSpeed', 'runSpeed', 'jumpSpeed', 'boostSpeed'].includes(key))
    return Number(value).toFixed(1) + ' m/s';
  if (key === 'cameraDistance') return value.toFixed(1) + ' m';
  if (key === 'fov') return value + '°';
  if (key === 'detailDistance') return value + ' m';
  return Number(value).toFixed(2) + '×';
}
export function createGameUI({
  settings: initial,
  storage,
  armory,
  onStartChallenge,
  onStartBattle,
  getBattleRecords,
  onBattleRecords,
  onSettings,
  onPause,
  onResume,
  onLeave,
  onReset,
  onPreviewAudio,
  notify,
}) {
  let settings = initial,
    tab = 'pause',
    category = '操作',
    binding = null,
    previousFocus = null,
    activePath = 0,
    selectedPoint = 1,
    rotation = 0.45,
    weaponType = 'asteroid',
    pathFrame = null;
  let drafts = loadDraft(storage);
  const dialog = $('#console'),
    content = $('#console-content');
  function persist() {
    const ok = saveSettings(storage, settings);
    onSettings(settings);
    const status = $('#save-status');
    if (status) status.textContent = ok ? '已自動儲存至此瀏覽器' : '儲存空間不可用，本次設定仍生效';
  }
  function update(value) {
    settings = normalizeSettings({ ...settings, ...value });
    persist();
  }
  function saveTactics() {
    if (!saveDraft(storage, drafts)) notify('瀏覽器儲存不可用，草稿只保留在本次開啟期間');
  }
  function stopPreview() {
    if (pathFrame) cancelAnimationFrame(pathFrame);
    pathFrame = null;
  }
  function close() {
    stopPreview();
    binding = null;
    if (dialog.open) dialog.close();
    onResume();
    previousFocus?.focus();
  }
  function open(next = 'pause') {
    if (!dialog.open) {
      previousFocus = document.activeElement;
      onPause();
      dialog.showModal();
    }
    tab = next;
    render();
  }
  function setTab(next) {
    stopPreview();
    binding = null;
    tab = next;
    render();
  }
  function field(key) {
    if (RANGES[key]) {
      const [min, max] = RANGES[key],
        step = ['detailDistance'].includes(key) ? 50 : ['fov'].includes(key) ? 1 : 0.05;
      return `<label class="setting-row"><span>${labels[key]}</span><div><input type="range" name="${key}" aria-label="${labels[key]}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output>${valueLabel(key, settings[key])}</output></div></label>`;
    }
    if (checks[key])
      return `<label class="setting-row"><span>${checks[key]}</span><input type="checkbox" name="${key}" ${settings[key] ? 'checked' : ''}></label>`;
    return `<label class="setting-row"><span>${selectLabels[key]}</span><select name="${key}">${options[key].map(([value, label]) => `<option value="${value}" ${settings[key] === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  }
  function renderSettings() {
    let body = categories[category].map(field).join('');
    if (category === '按鍵')
      body = `<p class="panel-note">點選按鍵後按新鍵。重複按鍵會互換；Esc 取消。方向鍵為額外移動鍵，Esc、Tab 與 F2 保留。</p><div class="bindings">${Object.entries(
        ACTIONS,
      )
        .map(
          ([id, name]) =>
            `<div class="setting-row"><span>${name}</span><button class="key-bind" data-bind="${id}">${keyLabel(settings.bindings[id])}</button></div>`,
        )
        .join('')}</div>`;
    if (category === '其他')
      body = `<div class="utility-grid"><button id="fullscreen-toggle">⛶ 切換全螢幕</button><button id="export-settings">↓ 匯出完整存檔</button><label class="file-button">↑ 匯入完整存檔<input type="file" id="import-settings" accept="application/json,.json"></label><button id="defaults-settings">↺ 恢復預設設定</button></div><p class="panel-note">存檔包含設定、所有配裝、彈種參數、彈道路線與最佳成績；不包含角色位置及進行中的挑戰。恢復預設只重設系統設定。存檔保存在此瀏覽器，可匯出備份或轉移裝置。</p>`;
    content.innerHTML = `<div class="panel-heading"><span class="eyebrow">SYSTEM CONFIGURATION</span><h3>系統設定</h3><p>調整你的操作節奏。變更立即生效。</p></div><div class="settings-tabs" role="tablist" aria-label="設定分類">${Object.keys(
      categories,
    )
      .map(
        (name) =>
          `<button role="tab" aria-selected="${name === category}" data-category="${name}">${name}</button>`,
      )
      .join(
        '',
      )}</div><div class="settings-fields">${body}${category === '聲音' ? '<button class="audio-preview" id="audio-preview">▷ 試聽技能音效</button>' : ''}</div><div class="settings-status"><i class="live-dot"></i><span id="save-status">設定保存在此瀏覽器</span><button id="reset-category">重設此頁</button></div>`;
    content.querySelectorAll('[data-category]').forEach(
      (b) =>
        (b.onclick = () => {
          category = b.dataset.category;
          renderSettings();
        }),
    );
    content.querySelectorAll('[name]').forEach((input) =>
      input.addEventListener('input', () => {
        const key = input.name;
        const value =
          input.type === 'checkbox'
            ? input.checked
            : input.type === 'range' || key === 'fpsLimit'
              ? Number(input.value)
              : input.value;
        const patch = { [key]: value };
        if (key === 'quality' && value !== 'custom')
          Object.assign(
            patch,
            {
              low: { resolution: 0.75, shadows: false, detailDistance: 350 },
              medium: { resolution: 1, shadows: true, detailDistance: 700 },
              high: { resolution: 1.5, shadows: true, detailDistance: 1100 },
            }[value],
          );
        if (['resolution', 'shadows', 'detailDistance'].includes(key)) patch.quality = 'custom';
        update(patch);
        if (input.type === 'range') input.nextElementSibling.textContent = valueLabel(key, settings[key]);
        if (key === 'quality' || ['resolution', 'shadows', 'detailDistance'].includes(key)) {
          if (key === 'quality') renderSettings();
          else {
            const q = $('[name=quality]', content);
            if (q) q.value = settings.quality;
          }
        }
      }),
    );
    content.querySelectorAll('[data-bind]').forEach(
      (b) =>
        (b.onclick = () => {
          binding = b.dataset.bind;
          b.textContent = '請按新鍵…';
          b.classList.add('capturing');
        }),
    );
    if (category === '聲音') $('#audio-preview').onclick = () => onPreviewAudio?.();
    $('#reset-category').onclick = () => {
      const patch = {};
      for (const key of categories[category]) patch[key] = DEFAULTS[key];
      if (category === '按鍵') patch.bindings = structuredClone(DEFAULTS.bindings);
      update(patch);
      renderSettings();
      notify('已重設此頁設定');
    };
    if (category === '其他') {
      $('#defaults-settings').onclick = () => {
        settings = normalizeSettings();
        persist();
        renderSettings();
        notify('已恢復預設設定');
      };
      $('#fullscreen-toggle').onclick = async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch {
          notify('此瀏覽器未開放全螢幕');
        }
      };
      $('#export-settings').onclick = () => {
        const data = JSON.stringify(
            { version: 3, settings, drafts, armory: armory.snapshot, battleRecords: getBattleRecords?.() },
            null,
            2,
          ),
          url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mikado-settings.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      $('#import-settings').onchange = async (event) => {
        try {
          const file = event.target.files[0];
          if (!file) return;
          if (file.size > 100000) throw Error();
          const data = JSON.parse(await file.text());
          if (!data.settings || typeof data.settings !== 'object') throw Error();
          settings = normalizeSettings(data.settings);
          if (data.drafts) drafts = cleanDraft(data.drafts);
          if (data.armory) armory.import(data.armory);
          if (data.battleRecords) onBattleRecords?.(data.battleRecords);
          saveTactics();
          persist();
          renderSettings();
          notify('已匯入存檔');
        } catch {
          notify('無法匯入，請選擇有效的設定 JSON');
        }
      };
    }
  }
  function renderLoadout() {
    const state = armory.snapshot,
      p = armory.profile,
      cfg = p.weapons[weaponType];
    const slotSide = (side, title) =>
      `<section class="slot-side"><h4>${title}<small>同時啟動一項</small></h4>${p[side].map((id, i) => `<div class="slot-row ${p[side === 'main' ? 'activeMain' : 'activeSub'] === i ? 'selected' : ''}"><button data-active-side="${side}" data-active-index="${i}" title="啟動此槽位"><kbd>${keyLabel(settings.bindings['slot' + (i + (side === 'main' ? 1 : 5))])}</kbd></button><select data-slot-side="${side}" data-slot-index="${i}" aria-label="${title}槽位 ${i + 1}"><option value="">空槽</option>${EQUIPPABLE.map((t) => `<option value="${t}" ${t === id ? 'selected' : ''}>${TRIGGERS[t].name}</option>`).join('')}</select></div>`).join('')}<button data-fire-side="${side}" class="side-focus ${p.fireSide === side ? 'selected' : ''}">${p.fireSide === side ? '● 目前射擊側' : '設為射擊側'}</button></section>`;
    const numeric = (key, label, unit = '') =>
      `<label class="weapon-field"><span>${label}</span><input type="range" data-fire-param="${key}" min="${FIRE_RANGES[key][0]}" max="${FIRE_RANGES[key][1]}" step="${['damage', 'speed', 'range'].includes(key) ? 1 : 0.01}" value="${cfg[key]}"><output>${Number(cfg[key]).toFixed(['damage', 'speed', 'range'].includes(key) ? 0 : 2)}${unit}</output></label>`;
    content.innerHTML = `<div class="panel-heading"><span class="eyebrow">TRIGGER LOADOUT / LIVE</span><h3>自由配裝</h3><p>主、副各四槽，兩側各啟動一項。按數字鍵切換槽位，F 切換射擊側。</p></div><div class="profile-toolbar"><label>配置<select id="kit-choice">${state.profiles.map((kit) => `<option value="${esc(kit.id)}" ${kit.id === p.id ? 'selected' : ''}>${esc(kit.name)}</option>`).join('')}</select></label><label>名稱<input id="kit-name" maxlength="30" value="${esc(p.name)}"></label><button id="kit-add">＋ 複製配置</button><button id="kit-remove" ${state.profiles.length <= 1 ? 'disabled' : ''}>刪除配置</button></div><div class="slots-layout">${slotSide('main', '主側')}${slotSide('sub', '副側')}</div><div class="weapon-heading"><h4>彈種參數</h4><select id="weapon-type">${SHOOTING_TYPES.map((type) => `<option value="${type}" ${type === weaponType ? 'selected' : ''}>${TRIGGERS[type].name}</option>`).join('')}</select><span id="weapon-cost">每批發射 ${shotCost(cfg).toFixed(0)} 三離子</span></div>${weaponType === 'meteor' ? '<p class="special-notice">美特拉撞擊後產生 6 m 爆炸，傷害隨距離衰減，掩體可阻擋爆風。分割增加覆蓋，但發射仍只扣每批 1 點。</p>' : ['viper', 'hound'].includes(weaponType) ? '<p class="panel-note">場景右側提供專屬發射選單。前進側鍵進入、返回側鍵退出；滾輪選到的選項立即用於發射，不需確認。</p>' : ''}<div class="weapon-fields"><label class="weapon-field"><span>立方體分割</span><select id="weapon-count">${[1, 8, 27].map((n) => `<option value="${n}" ${cfg.count === n ? 'selected' : ''}>${n} 發</option>`).join('')}</select></label><label class="weapon-field"><span>發射方式</span><select id="weapon-mode"><option value="volley" ${cfg.mode === 'volley' ? 'selected' : ''}>齊射</option><option value="burst" ${cfg.mode === 'burst' ? 'selected' : ''}>依序分批</option></select></label>${numeric('damage', '每發傷害')}${numeric('speed', '彈速', ' m/s')}${numeric('range', '射程', ' m')}${numeric('spread', '散射角度', '°')}${numeric('delay', '釋放延遲', ' s')}${numeric('interval', '分批間隔', ' s')}<label class="weapon-field"><span>瞄準方式</span><select id="weapon-aim"><option value="manual" ${cfg.aim === 'manual' ? 'selected' : ''}>手動準星</option><option value="assist" ${cfg.aim === 'assist' ? 'selected' : ''}>輔助瞄準（需按住瞄準）</option></select></label><label class="weapon-field"><span>自訂彈道路線</span><select id="weapon-path"><option value="">未指定</option>${cfg.pathId && !drafts.paths.some((path) => path.id === cfg.pathId) ? `<option value="${esc(cfg.pathId)}" selected>原路線已刪除，請重選</option>` : ''}${drafts.paths.map((path) => `<option value="${esc(path.id)}" ${cfg.pathId === path.id ? 'selected' : ''}>${esc(path.name)}</option>`).join('')}</select></label></div><p class="panel-note">配置即時生效並自動保存，最多 6 套。每批發射扣 1 點；生成、分割與調參免費。切換該側裝備會收起未射出的立方體。毒蛇可使用自訂路線，小行星保持直射。</p><div class="storage-status">${state.saved ? '● 配置已保存至此瀏覽器' : '⚠ 無法永久保存，本次配置仍生效'}</div>`;
    $('#kit-choice').onchange = (e) => {
      armory.choose(e.target.value);
      renderLoadout();
    };
    $('#kit-name').onchange = (e) => {
      armory.rename(e.target.value);
      e.target.value = armory.profile.name;
      $('#kit-choice').selectedOptions[0].textContent = armory.profile.name;
    };
    $('#kit-add').onclick = () => {
      if (!armory.add()) notify('最多保存 6 套配置');
      renderLoadout();
    };
    $('#kit-remove').onclick = () => {
      armory.remove();
      renderLoadout();
    };
    content.querySelectorAll('[data-slot-side]').forEach(
      (el) =>
        (el.onchange = () => {
          armory.equip(el.dataset.slotSide, Number(el.dataset.slotIndex), el.value || null);
          renderLoadout();
        }),
    );
    content.querySelectorAll('[data-active-side]').forEach(
      (el) =>
        (el.onclick = () => {
          armory.selectSlot(el.dataset.activeSide, Number(el.dataset.activeIndex));
          renderLoadout();
        }),
    );
    content.querySelectorAll('[data-fire-side]').forEach(
      (el) =>
        (el.onclick = () => {
          armory.setSide(el.dataset.fireSide);
          renderLoadout();
        }),
    );
    $('#weapon-type').onchange = (e) => {
      weaponType = e.target.value;
      renderLoadout();
    };
    for (const [id, key, convert] of [
      ['weapon-count', 'count', Number],
      ['weapon-mode', 'mode', String],
      ['weapon-aim', 'aim', String],
      ['weapon-path', 'pathId', String],
    ])
      $('#' + id).onchange = (e) => {
        armory.configure(weaponType, {
          [key]: convert(e.target.value),
          ...(key === 'pathId' && weaponType === 'viper' ? { routeSource: 'custom' } : {}),
        });
        renderLoadout();
      };
    content.querySelectorAll('[data-fire-param]').forEach(
      (el) =>
        (el.oninput = () => {
          const key = el.dataset.fireParam;
          armory.configure(weaponType, {
            [key]: Number(el.value),
            ...(key === 'speed' ? { customSpeed: Number(el.value), speedPreset: 'custom' } : {}),
          });
          el.nextElementSibling.textContent = Number(el.value).toFixed(
            ['damage', 'speed', 'range'].includes(key) ? 0 : 2,
          );
          $('#weapon-cost').textContent =
            `每批發射 ${shotCost(armory.profile.weapons[weaponType]).toFixed(0)} 三離子`;
        }),
    );
  }
  function drawPath(progress = null) {
    const canvas = $('#path-preview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d'),
      points = drafts.paths[activePath].points;
    const project = ([x, y, z]) => {
      const a = rotation,
        c = Math.cos(a),
        s = Math.sin(a),
        xx = x * c - z * s,
        zz = x * s + z * c;
      return [320 + xx * 10, 240 + zz * 5 - y * 9];
    };
    ctx.fillStyle = '#0a202d';
    ctx.fillRect(0, 0, 640, 380);
    ctx.strokeStyle = '#24404f';
    ctx.lineWidth = 1;
    for (let n = -30; n <= 30; n += 5) {
      for (const pair of [
        [
          [n, 0, -30],
          [n, 0, 10],
        ],
        [
          [-30, 0, n],
          [30, 0, n],
        ],
      ]) {
        ctx.beginPath();
        const a = project(pair[0]),
          b = project(pair[1]);
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#14ddef';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#08b8d3';
    ctx.shadowBlur = settings.glow * 12;
    ctx.beginPath();
    points.forEach((p, i) => {
      const q = project(p);
      i ? ctx.lineTo(...q) : ctx.moveTo(...q);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    points.forEach((p, i) => {
      const [x, y] = project(p);
      ctx.fillStyle = i === selectedPoint ? '#ffbc7c' : '#8dffff';
      ctx.beginPath();
      ctx.arc(x, y, i === selectedPoint ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '13px sans-serif';
      ctx.fillText(i === 0 ? '起點' : i === 3 ? '目標' : `轉折 ${i}`, x + 12, y - 8);
    });
    if (progress !== null) {
      const q = project(samplePolyline(points, progress));
      ctx.fillStyle = '#d0ffff';
      ctx.beginPath();
      ctx.arc(...q, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const svg = $('#path-top');
    if (svg) {
      svg.innerHTML =
        `<path d="${points.map(([x, y, z], i) => `${i ? 'L' : 'M'} ${180 + x * 6} ${230 + z * 6}`).join(' ')}" fill="none" stroke="#17daed" stroke-width="2"/>` +
        points
          .map(
            ([x, y, z], i) =>
              `<circle data-point="${i}" cx="${180 + x * 6}" cy="${230 + z * 6}" r="${i === selectedPoint ? 8 : 6}" fill="${i === selectedPoint ? '#ffbc7c' : '#86f8ff'}" tabindex="0" role="button" aria-label="選擇路線節點 ${i + 1}"/>`,
          )
          .join('');
    }
  }
  function renderPath() {
    stopPreview();
    activePath = Math.min(activePath, drafts.paths.length - 1);
    const path = drafts.paths[activePath];
    content.innerHTML = `<div class="panel-heading"><span class="eyebrow">TRAJECTORY LAB / DRAFT</span><h3>彈道規劃</h3><p>選擇範本、拖曳俯視節點並調整高度。保存路線並連結到配裝。毒蛇可在右側發射選單選用這些自訂路線；小行星維持直射。</p></div><div class="path-toolbar"><label>路線<select id="path-choice">${drafts.paths.map((p, i) => `<option value="${i}" ${i === activePath ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>範本<select id="path-template"><option value="">套用範本…</option>${Object.entries(
      PATH_TEMPLATES,
    )
      .map(([id, t]) => `<option value="${id}">${t.name}</option>`)
      .join(
        '',
      )}</select></label><button id="path-new">＋ 新路線</button><button id="path-simulate">▷ 模擬路線</button><button id="path-delete" ${drafts.paths.length <= 1 ? 'disabled' : ''}>刪除</button></div><div class="path-layout"><div class="path-visual"><canvas id="path-preview" width="640" height="380" aria-label="彈道立體預覽"></canvas><label class="rotation-control">預覽角度<input id="path-rotation" type="range" min="-3.14" max="3.14" step=".01" value="${rotation}"></label></div><div class="path-editor"><span class="eyebrow">俯視編輯 · 拖曳節點</span><svg id="path-top" viewBox="0 0 360 280" aria-label="拖曳彈道節點調整水平位置"></svg></div></div><div class="path-properties"><label>路線名稱<input id="path-name" maxlength="30" value="${esc(path.name)}"></label><label>選擇節點<select id="point-choice">${path.points.map((p, i) => `<option value="${i}" ${i === selectedPoint ? 'selected' : ''}>${i === 0 ? '起點' : i === 3 ? '目標' : '轉折 ' + i}</option>`).join('')}</select></label><label>節點高度<input id="point-height" type="range" min="0" max="20" step=".5" value="${path.points[selectedPoint][1]}"><output id="point-height-value">${path.points[selectedPoint][1]} m</output></label></div><p class="panel-note">最多保存 8 組路線。可在配裝指定自訂路線；毒蛇選擇自訂路線後實際沿折線飛行；每組路線以發射位置與準星位置為起終點。</p>`;
    drawPath();
    $('#path-simulate').onclick = () => {
      stopPreview();
      const start = performance.now();
      const frame = (now) => {
        if (!dialog.open || tab !== 'trajectory') return;
        const t = Math.min(1, (now - start) / 1800);
        drawPath(t);
        if (t < 1) pathFrame = requestAnimationFrame(frame);
      };
      pathFrame = requestAnimationFrame(frame);
    };
    $('#path-choice').onchange = (e) => {
      activePath = Number(e.target.value);
      renderPath();
    };
    $('#path-template').onchange = (e) => {
      if (!PATH_TEMPLATES[e.target.value]) return;
      path.points = structuredClone(PATH_TEMPLATES[e.target.value].points);
      saveTactics();
      renderPath();
    };
    $('#path-new').onclick = () => {
      if (drafts.paths.length >= 8) {
        notify('最多保存 8 組路線');
        return;
      }
      drafts.paths.push({
        id: 'route-' + Date.now().toString(36),
        name: '新路線 ' + (drafts.paths.length + 1),
        points: structuredClone(PATH_TEMPLATES.direct.points),
      });
      activePath = drafts.paths.length - 1;
      saveTactics();
      renderPath();
    };
    $('#path-delete').onclick = () => {
      if (drafts.paths.length <= 1) return;
      drafts.paths.splice(activePath, 1);
      activePath = 0;
      saveTactics();
      renderPath();
    };
    $('#path-name').oninput = (e) => {
      path.name = e.target.value.trim().slice(0, 30) || '未命名路線';
      saveTactics();
      $('#path-choice').options[activePath].textContent = path.name;
    };
    $('#point-choice').onchange = (e) => {
      selectedPoint = Number(e.target.value);
      renderPath();
    };
    $('#point-height').oninput = (e) => {
      path.points[selectedPoint][1] = Number(e.target.value);
      $('#point-height-value').textContent = e.target.value + ' m';
      saveTactics();
      drawPath();
    };
    $('#path-rotation').oninput = (e) => {
      rotation = Number(e.target.value);
      drawPath();
    };
    const svg = $('#path-top');
    let dragging = null;
    svg.onpointerdown = (e) => {
      if (e.target.dataset.point === undefined) return;
      stopPreview();
      dragging = selectedPoint = Number(e.target.dataset.point);
      $('#point-choice').value = selectedPoint;
      $('#point-height').value = path.points[selectedPoint][1];
      $('#point-height-value').textContent = path.points[selectedPoint][1] + ' m';
      svg.setPointerCapture(e.pointerId);
      drawPath();
    };
    svg.onpointermove = (e) => {
      if (dragging === null) return;
      const rect = svg.getBoundingClientRect(),
        x = ((e.clientX - rect.left) / rect.width) * 360,
        z = ((e.clientY - rect.top) / rect.height) * 280;
      path.points[dragging][0] = Math.max(-25, Math.min(25, (x - 180) / 6));
      path.points[dragging][2] = Math.max(-30, Math.min(5, (z - 230) / 6));
      drawPath();
    };
    svg.onpointerup = svg.onpointercancel = () => {
      if (dragging !== null) saveTactics();
      dragging = null;
    };
    svg.onkeydown = (e) => {
      if (e.target.dataset.point !== undefined && ['Enter', 'Space'].includes(e.code)) {
        e.preventDefault();
        selectedPoint = Number(e.target.dataset.point);
        renderPath();
      }
    };
  }
  function renderMissions() {
    let options = { mode: 'waves', difficulty: 'normal' };
    try {
      const saved = JSON.parse(storage.getItem('mikado-mission-options') ?? '{}');
      if (Object.hasOwn(MISSION_MODES, saved.mode)) options.mode = saved.mode;
      if (Object.hasOwn(DIFFICULTIES, saved.difficulty)) options.difficulty = saved.difficulty;
    } catch {}
    content.innerHTML = `<div class="panel-heading"><span class="eyebrow">SOLO / COMBAT OPERATIONS</span><h3>選擇作戰任務</h3><p>以目前配裝出擊，或建立一套刀劍與射擊混合配置。</p></div><div class="mission-options"><label>任務<select id="mission-mode">${Object.entries(
      MISSION_MODES,
    )
      .map(([id, name]) => `<option value="${id}" ${options.mode === id ? 'selected' : ''}>${name}</option>`)
      .join('')}</select></label><label>難度<select id="mission-difficulty">${Object.entries(DIFFICULTIES)
      .map(
        ([id, d]) =>
          `<option value="${id}" ${options.difficulty === id ? 'selected' : ''}>${d.name}</option>`,
      )
      .join(
        '',
      )}</select></label></div><div class="guide-cards"><article><b>防衛波次</b><p>清除三波近戰、遠程、裝甲與高速型三離子兵，受損狀態會保留到任務結束。</p></article><article><b>巡邏清剿</b><p>前往三個青色巡邏光環，各區觸發一組敵人，全部擊破即可完成。</p></article><article><b>核心討伐</b><p>擊破重裝指揮核心與護衛。亮青色弱點承受額外傷害；注意橘色攻擊預兆。</p></article></div><div class="pause-actions"><button class="primary" id="deploy-battle">以目前配裝出擊 ↗</button><button id="combat-preset">建立「近戰混合」配裝</button><button id="mission-loadout">自由配裝</button></div><p class="panel-note">兩側各啟動一項。混合配裝：主側 1 刀劍、2 小行星、3 毒蛇、4 美特拉；副側 5 盾、6 蚱蜢、7 獵犬。X 防禦、G 蓄力重擊、Alt 方向閃避、B 緊急脫離。閃避沒有無敵時間，恢復不修復斷肢。作戰範圍以青色圓環標示，離開 12 秒會脫離。完整操作以鍵盤滑鼠為主。</p><p id="mission-best" class="storage-status"></p>`;
    function changed() {
      options = { mode: $('#mission-mode').value, difficulty: $('#mission-difficulty').value };
      try {
        storage.setItem('mikado-mission-options', JSON.stringify(options));
      } catch {}
      const record = getBattleRecords?.()[`${options.mode}:${options.difficulty}`];
      $('#mission-best').textContent = record
        ? `最佳 ${record.score} 分 · ${record.time.toFixed(1)} s`
        : '尚無此任務的通關紀錄';
    }
    $('#mission-mode').onchange = changed;
    $('#mission-difficulty').onchange = changed;
    changed();
    $('#deploy-battle').onclick = () => {
      close();
      onStartBattle(options);
    };
    $('#mission-loadout').onclick = () => setTab('loadout');
    $('#combat-preset').onclick = () => {
      if (!armory.add()) {
        notify('配置已達 6 套，先刪除一套再建立混合配裝');
        return;
      }
      armory.rename('近戰混合');
      for (const [side, list] of Object.entries({
        main: ['blade', 'asteroid', 'viper', 'meteor'],
        sub: ['shield', 'grasshopper', 'hound', null],
      }))
        list.forEach((id, n) => armory.equip(side, n, id));
      armory.selectSlot('main', 0);
      armory.selectSlot('sub', 0);
      armory.setSide('main');
      notify('已建立近戰混合配裝 · 6 啟動蚱蜢、5 切回盾');
    };
  }
  function render() {
    dialog.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
    });
    if (tab === 'settings') {
      renderSettings();
      return;
    }
    if (tab === 'loadout') {
      renderLoadout();
      return;
    }
    if (tab === 'trajectory') {
      renderPath();
      return;
    }
    if (tab === 'missions') {
      renderMissions();
      return;
    }
    if (tab === 'guide') {
      content.innerHTML = `<div class="panel-heading"><span class="eyebrow">FIELD MANUAL</span><h3>作戰與機動指南</h3><p>E 生成懸浮立方體、右鍵分割、左鍵發射、中鍵瞄準；射擊時也能使用蚱蜢移動。</p></div><div class="guide-cards"><article><b>近戰 / 招架與閃避</b><p>啟動刀劍槽位後左鍵三段輕擊，G 按住蓄力、放開重擊，空中自動使用空斬。右鍵持續格擋，起手 0.18 秒可招架正面攻擊並使敵人失衡；X 可使用已啟動的盾。Alt + 方向鍵閃避，沒有無敵時間。起手與出招期間不能任意切刀或取消，收招後段可接蚱蜢與閃避。</p></article><article><b>戰鬥體 / 部位與脫離</b><p>斷臂停用對應側裝備；斷腿降低移動與跳躍。傷勢持續洩漏三離子，回復不修復身體。頭部／核心破壞或能量耗盡會緊急脫離，也可按 B 主動撤出。R 重試時重整。擊中敵人發光核心可增加傷害，橘色提示代表即將攻擊；裝甲型可用重擊突破。</p></article><article><b>射擊 / 生成與發射</b><p>E 生成立方體懸浮在角色側邊；右鍵循環分割 1／8／27 發，左鍵釋放當前彈組，中鍵按住瞄準。生成與分割免費，發射每批扣 1 點。</p></article><article><b>配裝 / 主副側</b><p>1–4 切主槽、5–8 切副槽，F 切換射擊側。Q 使用目前啟動的蚱蜢；兩側各啟動一項。配裝與按鍵均可自訂。毒蛇／獵犬使用前進側鍵（或 ]）進入右側選單、返回側鍵（或 [）退一層。滾輪選項即時生效，不需確認。</p></article><article><b>01 / 準備與放置</b><p>按住 <kbd>${keyLabel(settings.bindings.grasshopper)}</kbd>，手中出現亮青色光球。地面放開後，跳板生成在前方；走上去才會彈射。</p></article><article><b>02 / 方向與空中接續</b><p>踩中時按住方向鍵，沿該方向微微向上彈射。沒有方向輸入則垂直向上。空中放開觸發鍵，立即在腳下彈射。</p></article><article><b>03 / 三離子與跳板</b><p>每次成功施放消耗 0.3 三離子，12 秒未使用便消失。跳板只能用一次。停止施放後會少量恢復；耗盡時返回起點重整。</p></article><article><b>04 / 暫停與操作</b><p>Esc 開啟暫停選單，F2 開設定；Tab 釋放游標，點場景繼續環顧。切換視窗時自動暫停。可在設定自訂按鍵、速度及畫質。</p></article></div><dl class="guide-bindings">${Object.entries(
        ACTIONS,
      )
        .map(([id, name]) => `<dt><kbd>${keyLabel(settings.bindings[id])}</kbd></dt><dd>${name}</dd>`)
        .join(
          '',
        )}</dl><p class="panel-note">步行涉水會返回起點；可用蚱蜢從空中跨河。手機可瀏覽場景與設定，完整操作以桌面鍵盤滑鼠為主。<br><a href="./models/avatar/ATTRIBUTION.md" target="_blank" rel="noopener">角色模型與動畫授權 ↗</a></p>`;
      return;
    }
    content.innerHTML = `<div class="panel-heading"><span class="eyebrow">FIELD EXERCISE PAUSED</span><h3>準備下一次躍進。</h3><p>調整配置，或回到城市繼續練習。</p></div><div class="pause-banner"><div class="orbit-symbol" aria-hidden="true">◈</div><span>MIKADO / MOBILITY TRAINING</span><strong>小行星射擊演習</strong><p>第三人稱 · 立方體射擊 · 蚱蜢機動</p></div><div class="pause-actions"><button class="primary" id="resume-play">繼續 / 回到場景 ↗</button><button id="open-missions">單人作戰任務</button><button id="start-range-play">開始射擊挑戰</button><button id="reset-play">返回起點／重試</button><button id="leave-play">返回城市總覽</button></div><p class="panel-note">射擊挑戰使用非敵人的固定練習靶。90 秒內擊破六靶，可查看成績與重新挑戰；單人作戰可選防衛波次、巡邏清剿及核心討伐；四類敵人支援地面與對空攻擊。</p>`;
    const best = armory.snapshot.best;
    if (best)
      content.insertAdjacentHTML(
        'beforeend',
        `<p class="storage-status">最佳成績 ${Math.round(best.score)} 分 · ${best.time.toFixed(1)} s · 命中率 ${Math.round(best.accuracy * 100)}%</p>`,
      );
    $('#open-missions').onclick = () => setTab('missions');
    $('#resume-play').onclick = close;
    $('#start-range-play').onclick = () => {
      close();
      onStartChallenge();
    };
    $('#reset-play').onclick = () => {
      onReset();
      close();
    };
    $('#leave-play').onclick = () => {
      onLeave();
      close();
    };
  }
  dialog.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (!dialog.open || !binding || event.pointerType !== 'mouse') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const code = 'Mouse' + event.button;
      if (validBinding(code)) {
        settings = rebind(settings, binding, code);
        binding = null;
        persist();
        renderSettings();
      }
    },
    true,
  );
  dialog.addEventListener('contextmenu', (event) => event.preventDefault());
  $('#close-console').onclick = close;
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (binding) {
      binding = null;
      renderSettings();
    } else close();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!dialog.open) return;
      if (binding) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.code === 'Escape') {
          binding = null;
          renderSettings();
          return;
        }
        if (validBinding(event.code)) {
          settings = rebind(settings, binding, event.code);
          binding = null;
          persist();
          renderSettings();
        } else notify('這個按鍵已保留，請選擇其他按鍵');
      }
    },
    true,
  );
  document.querySelectorAll('[data-console]').forEach((b) => (b.onclick = () => open(b.dataset.console)));
  return {
    open,
    close,
    update,
    get isOpen() {
      return dialog.open;
    },
    get settings() {
      return settings;
    },
    get diagnostics() {
      return { tab, category, open: dialog.open, drafts: structuredClone(drafts) };
    },
  };
}
