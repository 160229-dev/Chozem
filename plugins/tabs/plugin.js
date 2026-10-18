


const strip = document.getElementById('tab-strip');
let dragId = null;

function displayTitle(tab) {
  if (tab.title) return tab.title;
  if (tab.url) return Cho.util ? CHO.util.prettyUrl(tab.url) : tab.url;
  return '新标签页';
}

function closeTab(id) {
  
  if (Cho.web.list().length <= 1) {
    Cho.system.window.close();
    return;
  }
  Cho.web.close(id);
}

function makeFavicon(tab) {
  const box = Cho.ui.el('span', { class: 'tab-fav' });
  if (tab.favicon) {
    const img = Cho.ui.el('img', { src: tab.favicon, alt: '' });
    img.addEventListener('error', () => {
      box.replaceChildren(Cho.ui.icon(tab.url ? 'globe' : 'search'));
    });
    box.appendChild(img);
  } else {
    box.appendChild(Cho.ui.icon(tab.url ? 'globe' : 'search'));
  }
  return box;
}

function render(list) {
  if (!strip) return;
  const activeList = list || Cho.web.list();
  strip.replaceChildren();

  for (const tab of activeList) {
    const node = Cho.ui.el('div', {
      class: 'tab' + (tab.active ? ' active' : '') + (tab.loading ? ' loading' : ''),
      title: displayTitle(tab),
      draggable: 'true',
      dataset: { id: tab.id },
    });

    node.append(makeFavicon(tab));
    node.appendChild(Cho.ui.el('span', { class: 'tab-title', text: displayTitle(tab) }));
    if (tab.badge) node.appendChild(Cho.ui.el('span', { class: 'tab-badge', text: String(tab.badge).slice(0, 3) }));

    const close = Cho.ui.el('button', { class: 'tab-close', type: 'button', title: '关闭标签页' }, Cho.ui.icon('close'));
    
    close.addEventListener('mousedown', (e) => e.stopPropagation());
    close.addEventListener('pointerdown', (e) => e.stopPropagation());
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    node.appendChild(close);

    node.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      } else if (e.button === 0) {
        Cho.web.activate(tab.id);
      }
    });

    node.addEventListener('dragstart', (e) => {
      dragId = tab.id;
      node.classList.add('dragging');
      try {
        e.dataTransfer.setData('text/plain', tab.id);
      } catch (_) {}
    });
    node.addEventListener('dragend', () => {
      dragId = null;
      node.classList.remove('dragging');
      Cho.ui.$$('.tab', strip).forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    });
    node.addEventListener('dragover', (e) => {
      if (!dragId || dragId === tab.id) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      node.classList.toggle('drop-before', !after);
      node.classList.toggle('drop-after', after);
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-before', 'drop-after'));
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId || dragId === tab.id) return;
      const rect = node.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      Cho.web.move(dragId, tab.id, after);
    });

    strip.appendChild(node);
  }

  const plus = Cho.ui.el('button', { class: 'tab-new', type: 'button', title: '新建标签页  (Ctrl + T)' }, Cho.ui.icon('plus'));
  plus.addEventListener('click', () => newTab());
  strip.appendChild(plus);
}

function newTab() {
  Cho.web.create({ activate: true });
}

const tabs = {
  open() {
    newTab();
  },
  closeActive() {
    if (Cho.web.list().length <= 1) {
      Cho.system.window.close();
      return;
    }
    Cho.web.closeActive();
  },
  next() {
    const list = Cho.web.list();
    if (list.length < 2) return;
    const i = list.findIndex((t) => t.active);
    Cho.web.activate(list[(i + 1) % list.length].id);
  },
};

Cho.on('tabs:change', (list) => render(list));

Cho.on('shortcut', ({ key, ctrl, shift }) => {
  if (!ctrl) return;
  const k = String(key).toLowerCase();
  if (k === 't') newTab();
  else if (k === 'w') Cho.web.closeActive();
  else if (key === 'Tab') tabs.next();
});

Cho.services.register('tabs', tabs);

Cho.cleanup(() => {
  if (strip) strip.replaceChildren();
});


render(Cho.web.list());
Cho.log('标签页插件就绪');
