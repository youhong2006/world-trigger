import { keyLabel } from './game-settings.js';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function createFiringPanel(element, menu) {
  let previous = '';
  element.addEventListener(
    'wheel',
    (event) => {
      if (menu.snapshot.open) {
        event.preventDefault();
        menu.scroll(Math.sign(event.deltaY));
      }
    },
    { passive: false },
  );
  return {
    render(visible, bindings) {
      const state = menu.snapshot;
      element.hidden = !visible || !state.type;
      if (element.hidden) return;
      const signature = JSON.stringify([state, bindings.menuEnter, bindings.menuBack]);
      if (signature === previous) return;
      previous = signature;
      element.classList.toggle('expanded', state.open);
      element.innerHTML = `<div class="firing-caption"><b>${state.type === 'viper' ? 'VIPER / 毒蛇' : 'HOUND / 獵犬'}</b><span>${state.open ? '第 ' + state.depth + ' 層' : '發射設定'}</span></div>${state.open ? `<div class="firing-breadcrumb">${esc(['發射參數', ...state.breadcrumb].join(' › '))}</div>` : ''}<div class="firing-items">${(state.open ? state.items : state.rootItems).map((n, i) => `<button class="firing-item ${n.id === state.selectedId ? 'highlighted' : ''} ${n.applied ? 'applied' : ''}" title="${esc(n.label)}" data-firing-item="${esc(n.id)}" ${n.disabled ? 'disabled' : ''}><span class="firing-square">${esc(n.icon)}</span><span class="firing-label">${esc(n.label)}<small>${esc(n.value)}</small></span><b>${n.applied ? '✓' : n.branch ? '›' : n.number ? '±' : ''}</b></button>`).join('')}</div><p class="firing-instruction">${state.open ? (state.editing ? '滾輪即時調值 · 前進切換數值列' : `滾輪即時選用 · ${esc(keyLabel(bindings.menuEnter))}進入下一層`) : `${esc(keyLabel(bindings.menuEnter))}開啟 · ] 鍵也可使用`}<br>${state.open ? esc(keyLabel(bindings.menuBack)) + '退一層 · [ 鍵也可使用' : '同彈種保留上次頁面與參數'}</p>`;
      element.querySelector('.highlighted')?.scrollIntoView({ block: 'nearest' });
      element.querySelectorAll('[data-firing-item]').forEach(
        (b) =>
          (b.onclick = () => {
            if (state.open) menu.choose(b.dataset.firingItem);
            else menu.root(b.dataset.firingItem);
          }),
      );
    },
  };
}
