import { PATH_TEMPLATES } from './trajectory-plan.js';
export const SPEED_PRESETS = { high: 155, medium: 110, low: 65 };
const strengthNames = {
  high: '高',
  medium: '中',
  low: '低',
  'high-low-low': '高低低',
  'low-high-low': '低高低',
  'low-low-high': '低低高',
};
const routeNames = { above: '子彈從上方攻擊', left: '左側面', right: '右側面', surround: '發散包圍敵人' };
const number = (id, label, key, value, min, max, step, unit = '', index) => ({
  id,
  label,
  value: `${Math.round(value * (unit === '%' ? 100 : 1))}${unit}`,
  number: { key, index, min, max, step },
});
export function firingTree(type, cfg, paths = []) {
  const speed = {
    id: 'speed',
    label: '子彈速度',
    icon: '≫',
    value: `${cfg.speed} m/s`,
    children: [
      ...Object.entries(SPEED_PRESETS).map(([id, speed]) => ({
        id,
        label: strengthNames[id],
        value: `${speed} m/s`,
        patch: { speed, speedPreset: id },
      })),
      {
        id: 'custom',
        label: '自訂',
        patch: { speed: cfg.customSpeed, speedPreset: 'custom' },
        children: [number('value', '自訂速度', 'speed', cfg.speed, 55, 180, 5, ' m/s')],
      },
    ],
  };
  if (type === 'viper')
    return [
      {
        id: 'route',
        label: '發射路線',
        icon: '⌁',
        value:
          cfg.routeSource === 'custom'
            ? (paths.find((p) => p.id === cfg.pathId)?.name ?? '路線已刪除')
            : PATH_TEMPLATES[cfg.routePreset]?.name,
        children: [
          {
            id: 'preset',
            label: '預設路線',
            patch: { routeSource: 'preset' },
            children: Object.entries(PATH_TEMPLATES).map(([id, p]) => ({
              id,
              label: p.name,
              patch: { routeSource: 'preset', routePreset: id },
            })),
          },
          {
            id: 'custom',
            label: '自訂路線',
            patch: {
              routeSource: 'custom',
              pathId: paths.some((p) => p.id === cfg.pathId) ? cfg.pathId : (paths[0]?.id ?? ''),
            },
            children: paths.length
              ? paths.map((p) => ({
                  id: p.id,
                  label: p.name,
                  patch: { routeSource: 'custom', pathId: p.id },
                }))
              : [{ id: 'empty', label: '先到彈道規劃建立路線', disabled: true }],
          },
        ],
      },
      speed,
    ];
  if (type === 'hound')
    return [
      {
        id: 'route',
        label: '發射路線',
        icon: '⌁',
        value: routeNames[cfg.houndRoute],
        children: Object.entries(routeNames).map(([id, label]) => ({ id, label, patch: { houndRoute: id } })),
      },
      {
        id: 'tracking',
        label: '子彈追蹤性能',
        icon: '◎',
        value: strengthNames[cfg.tracking] ?? '自訂',
        children: [
          ...Object.entries(strengthNames).map(([id, label]) => ({ id, label, patch: { tracking: id } })),
          {
            id: 'custom',
            label: '自訂',
            patch: { tracking: 'custom' },
            children: cfg.trackingCustom.map((v, i) =>
              number('stage' + i, ['前段', '中段', '後段'][i], 'trackingCustom', v, 0, 1, 0.05, '%', i),
            ),
          },
        ],
      },
      speed,
    ];
  return [];
}
export function createFiringMenu({
  getConfig,
  getPaths = () => [],
  onConfig = () => true,
  onRemember = () => {},
}) {
  let type = null,
    open = false,
    editing = false,
    trail = [],
    selection = {};
  function items() {
    let list = type ? firingTree(type, getConfig(type), getPaths()) : [];
    const valid = [];
    for (const id of trail) {
      const node = list.find((n) => n.id === id);
      if (!node?.children) break;
      valid.push(id);
      list = node.children;
    }
    trail = valid;
    return list;
  }
  function selected() {
    const list = items(),
      key = trail.join('/');
    return list.find((n) => n.id === selection[key]) ?? list[0];
  }
  function remember() {
    onRemember(type, { trail: [...trail], selection: { ...selection } });
  }
  function activate(next) {
    if (next === type) return;
    type = ['viper', 'hound'].includes(next) ? next : null;
    open = false;
    editing = false;
    const menu = type ? getConfig(type).menu : null;
    trail = [...(menu?.trail ?? [])];
    selection = { ...menu?.selection };
    items();
  }
  function apply(node) {
    return !node?.patch || onConfig(type, node.patch) !== false;
  }
  function enter() {
    if (!type) return false;
    if (!open) {
      open = true;
      editing = !!selected()?.number;
      apply(selected());
      return true;
    }
    const node = selected();
    if (!node || node.disabled) return false;
    if (node.children) {
      if (!apply(node)) return false;
      trail.push(node.id);
      items();
      editing = !!selected()?.number;
      apply(selected());
      remember();
      return true;
    }
    if (node.number) {
      const list = items(),
        index = list.findIndex((n) => n.id === node.id);
      selection[trail.join('/')] = list[(index + 1) % list.length].id;
      editing = true;
      remember();
      return true;
    }
    return true;
  }
  function back() {
    if (!open) return false;
    editing = false;
    if (trail.length) trail.pop();
    else open = false;
    remember();
    return true;
  }
  function scroll(direction) {
    if (!open || !type || !direction) return false;
    const node = selected();
    if (editing && node?.number) {
      const n = node.number,
        cfg = getConfig(type),
        old = n.index === undefined ? cfg[n.key] : cfg[n.key][n.index],
        value =
          Math.round(Math.min(n.max, Math.max(n.min, old + Math.sign(direction) * n.step)) * 1000) / 1000;
      const patch =
        n.index === undefined
          ? { [n.key]: value, customSpeed: value, speedPreset: 'custom' }
          : {
              tracking: 'custom',
              trackingCustom: cfg.trackingCustom.map((v, i) => (i === n.index ? value : v)),
            };
      if (onConfig(type, patch) !== false) remember();
      return true;
    }
    const list = items(),
      index = list.findIndex((n) => n.id === node?.id),
      next = list[(index + Math.sign(direction) + list.length) % list.length];
    if (apply(next)) {
      selection[trail.join('/')] = next?.id;
      remember();
    }
    return true;
  }
  return {
    activate,
    enter,
    back,
    scroll,
    root(id) {
      if (!type) return;
      open = true;
      editing = false;
      trail = [];
      selection[''] = id;
      remember();
    },
    choose(id) {
      if (!open) open = true;
      editing = false;
      const node = items().find((n) => n.id === id);
      if (!node) return;
      if (node.number) {
        selection[trail.join('/')] = id;
        editing = true;
        remember();
        return true;
      }
      if (node.children) {
        selection[trail.join('/')] = id;
        remember();
        return enter();
      }
      if (apply(node)) {
        selection[trail.join('/')] = id;
        remember();
        return true;
      }
      return false;
    },
    close() {
      open = editing = false;
    },
    get snapshot() {
      const list = items(),
        node = selected(),
        cfg = type ? getConfig(type) : null;
      return {
        type,
        open,
        editing,
        depth: trail.length + 1,
        trail: [...trail],
        breadcrumb: trail.map((id, i) => {
          let l = firingTree(type, cfg, getPaths());
          for (const p of trail.slice(0, i)) l = l.find((n) => n.id === p)?.children ?? [];
          return l.find((n) => n.id === id)?.label ?? '';
        }),
        selectedId: node?.id,
        rootItems: type
          ? firingTree(type, cfg, getPaths()).map((n) => ({ id: n.id, label: n.label, icon: n.icon }))
          : [],
        items: list.map((n) => ({
          id: n.id,
          label: n.label,
          icon: n.icon ?? '◇',
          value: n.value ?? '',
          branch: !!n.children,
          number: !!n.number,
          disabled: !!n.disabled,
          applied: !!n.patch && Object.entries(n.patch).every(([k, v]) => cfg[k] === v),
        })),
        remembered: { trail: [...trail], selection: { ...selection } },
      };
    },
  };
}
