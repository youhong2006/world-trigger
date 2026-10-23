import { HQ, HQ_STOPS, floorAt } from './hq-layout.js';
import { selectInteractable, createDoorSystem, createLiftSystem } from './hq-systems.js';

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
}) {
  const prompt = document.createElement('div');
  prompt.id = 'hq-prompt';
  prompt.hidden = true;
  prompt.setAttribute('role', 'status');
  document.body.append(prompt);
  const panel = document.createElement('dialog');
  panel.id = 'hq-panel';
  panel.innerHTML =
    '<form method="dialog"><span class="eyebrow">BORDER / FACILITY TERMINAL</span><button class="hq-close" aria-label="關閉">×</button><h2></h2><div class="hq-content"></div></form>';
  document.body.append(panel);
  const breadcrumb = document.createElement('div');
  breadcrumb.id = 'hq-location';
  breadcrumb.hidden = true;
  document.body.append(breadcrumb);
  const doorSystem = createDoorSystem(interior.doors),
    lift = createLiftSystem(interior.lift, interior.liftDoors, collision);
  let target = null,
    seated = null,
    exitPoint = null,
    active = false,
    pose = null,
    food = 0,
    drinks = 0;
  const holograms = [];
  function close(restore = true) {
    if (!panel.open) return;
    panel.close();
    if (restore) onClose();
  }
  panel.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  panel.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    close();
  });
  function show(title, body, actions = []) {
    onOpen();
    panel.querySelector('h2').textContent = title;
    const content = panel.querySelector('.hq-content');
    content.replaceChildren();
    const text = document.createElement('p');
    text.textContent = body;
    content.append(text);
    const buttons = document.createElement('div');
    buttons.className = 'hq-actions';
    for (const [label, callback] of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = callback;
      buttons.append(b);
    }
    content.append(buttons);
    panel.showModal();
    panel.querySelector('.hq-close').focus();
  }
  function safeExit() {
    if (!seated) return true;
    const candidates = [...(seated.exits ?? []), exitPoint].filter(Boolean);
    for (const p of candidates)
      if (collision.canOccupy(p.x, p.z, p.y, 1.75, 0.3)) {
        motor.teleport(p, getView().yaw);
        seated = null;
        pose = null;
        notify('已站起');
        return true;
      }
    notify('出口受阻，請先移開附近物品再站起');
    return false;
  }
  function sit(o) {
    if (!motor.grounded || Math.abs(motor.position.y - o.seat.y) > 0.25) {
      notify('請先站到座位旁的地面');
      return;
    }
    exitPoint = { ...motor.position };
    seated = o;
    pose = o.type === 'bed' ? 'rest' : 'sit';
    motor.teleport({ ...o.seat }, o.yaw ?? 0);
    motor.velocity.x = motor.velocity.y = motor.velocity.z = 0;
    notify(`${o.type === 'bed' ? '休息中' : '已坐下'} · ${getKey()} 站起`);
  }
  function directory() {
    show(
      '基地導覽',
      '主設施翼位於基地南側。每層由中央走廊連接房間，東側樓梯與電梯通往所有開放樓層及頂樓。樓層與尺寸為遊戲原創配置（C）。\n' +
        HQ_STOPS.map((f) => `${f.id}　${f.name}`).join('\n'),
    );
  }
  function use(o) {
    if (o.type === 'door') {
      if (!doorSystem.activate(o.door))
        notify(o.door.kind === 'lift' ? '電梯尚未到站，請使用呼叫面板' : '門禁管制');
      return;
    }
    if (o.type === 'seat' || o.type === 'bed') {
      sit(o);
      return;
    }
    if (o.kind === 'liftCall') {
      notify(lift.request(o.text) ? '電梯呼叫已送出 · 到站後雙扇門會開啟' : '電梯運行中，請到站後再呼叫');
      return;
    }
    if (o.kind === 'lift') {
      show(
        '電梯樓層選擇',
        `目前高度 ${lift.snapshot.y.toFixed(1)} m · 最高 RF ${HQ.roof.toFixed(0)} m`,
        HQ_STOPS.map((f) => [
          `${f.id}　${f.name}`,
          () => {
            if (!lift.request(f.id)) {
              notify('電梯運行中，請等候到站');
              return;
            }
            close();
            notify(`前往 ${f.id} · 請站在轎廂內`);
          },
        ]),
      );
      return;
    }
    if (o.kind === 'loadout' || o.kind === 'missions') {
      onConsole(o.kind === 'loadout' ? 'loadout' : 'missions');
      return;
    }
    if (o.kind === 'training') {
      show(
        '虛擬訓練啟動',
        `在模擬環境練習射擊、近戰與蚱蜢移動。擊破六個練習靶，按 F 返回基地終端。\n本機最佳：${getTrainingRecord()} 分`,
        [
          [
            '開始靜態靶訓練',
            () => {
              close();
              onTraining();
            },
          ],
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
    if (o.kind === 'directory') {
      directory();
      return;
    }
    if (o.kind === 'medical') {
      show(o.name, getMedical() + '\n少量恢復三離子不會修復斷肢。需緊急脫離或重試，才能重整戰鬥體。');
      return;
    }
    if (o.kind === 'inventory') {
      show(o.name, getInventory() + '\n物流箱與遠征艇目前是可探索場景，搬運與遠征任務尚未開放。');
      return;
    }
    if (o.kind === 'food' || o.kind === 'vending') {
      show(
        o.name,
        `${o.kind === 'food' ? '今日菜單：咖哩飯、拉麵、沙拉' : '飲品：礦泉水、茶、咖啡'}。補給為休閒互動，不額外修復戰鬥體。\n本次領取：餐點 ${food}、飲品 ${drinks}`,
        (o.kind === 'food' ? ['咖哩飯', '拉麵', '沙拉'] : ['礦泉水', '茶', '咖啡']).map((item) => [
          item,
          () => {
            if (o.kind === 'food') food++;
            else drinks++;
            notify(`已領取${item}`);
            close();
          },
        ]),
      );
      return;
    }
    if (o.kind === 'exercise') {
      show(o.name, '移動訓練：衝刺、方向閃避、蹲下通行、跳躍與蚱蜢串聯。請在訓練空間練習高速動作。', [
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
    if (o.kind === 'radar') {
      show(
        o.name,
        `目前位置 X ${motor.position.x.toFixed(0)} / Z ${motor.position.z.toFixed(0)}，高度 ${motor.position.y.toFixed(1)} m。\nBORDER 基地位於城市中心。河流位於南側；城市外緣由山丘包圍。此為場景監控終端，並非即時敵情報告。`,
      );
      return;
    }
    if (o.kind === 'hologram') {
      const projection = interior.projections.find(
        (p) => Math.abs(p.y - (o.y - 1)) < 0.1 && Math.abs(p.x - (o.x + 8)) < 0.1,
      );
      if (projection) projection.group.visible = !projection.group.visible;
      const visible = !holograms.includes(o.id);
      if (visible) holograms.push(o.id);
      else holograms.splice(holograms.indexOf(o.id), 1);
      notify(visible ? '戰術投影已開啟' : '戰術投影已收起');
      return;
    }
    if (o.kind === 'evacuation') {
      show(
        o.name,
        '沿走廊向東抵達維修樓梯，逐層下行至 1F，再向南通過接待大廳與主入口離開。火警為遊戲演練；安全出口保持通行。',
        [
          [
            '啟動／結束演練提示',
            () => {
              notify('避難演練：東側樓梯 → 1F → 南側主入口');
              close();
            },
          ],
        ],
      );
      return;
    }
    if (o.kind === 'guide') {
      show(
        o.name,
        'WASD 移動 · Shift 衝刺 · Space 跳躍 · C 蹲下 · V 視角 · F 互動 · Z 切換射擊側 · Q 蚱蜢 · E 生成觸發器 · 右鍵分割 · 左鍵發射。\n設施類型參考動畫，完整樓層與連接動線為遊戲設計。',
      );
      return;
    }
    show(o.name, o.text || 'BORDER 設施資訊。');
  }
  return {
    interact() {
      if (panel.open) return;
      if (seated) {
        safeExit();
        return;
      }
      if (target) use(target);
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
      document.body.classList.remove('hq-inside');
      prompt.hidden = true;
      breadcrumb.hidden = true;
    },
    update(dt, exploring, simulation = false) {
      active = exploring && !simulation;
      if (active) {
        lift.update(dt, motor);
        doorSystem.update(dt, motor.position, lift.snapshot.y, lift.snapshot.moving);
      }
      interior.updateVisibility(motor.position, active);
      if (seated) {
        motor.velocity.x = motor.velocity.y = motor.velocity.z = 0;
      }
      target =
        active && !panel.open && !seated
          ? selectInteractable(interior.objects, { ...getView(), trace: collision.segmentFraction })
          : null;
      prompt.hidden = !active || (!target && !seated) || panel.open;
      if (!prompt.hidden)
        prompt.textContent = seated
          ? `${getKey()}　站起`
          : `${getKey()}　${target.type === 'seat' ? '坐下 · ' : target.type === 'bed' ? '休息 · ' : ''}${target.name}`;
      const inside =
        active && Math.abs(motor.position.x) < 64 && motor.position.z > 182 && motor.position.z < 252;
      document.body.classList.toggle('hq-inside', inside);
      breadcrumb.hidden = !inside;
      if (inside) {
        const f = floorAt(motor.position.y);
        breadcrumb.textContent = `BORDER / ${f.id}　${f.name}${lift.snapshot.moving ? '　｜ 電梯運行中' : ''}`;
      }
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
    get snapshot() {
      return {
        active,
        target: target?.name ?? null,
        seated: seated?.name ?? null,
        pose,
        panel: panel.open,
        lift: lift.snapshot,
        ...interior.diagnostics,
      };
    },
  };
}
