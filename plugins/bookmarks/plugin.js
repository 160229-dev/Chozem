

const KEY = 'items';
const items = () => Cho.storage.get(KEY, []);
const has = (url) => !!url && items().some((b) => b.url === url);

let button = null;

function syncButton() {
  if (!button) return;
  button.setActive(has(Cho.state().url));
}

function toggle() {
  const state = Cho.state();
  if (!state.url) {
    Cho.toast('先打开一个网页');
    return;
  }
  const list = items();
  const index = list.findIndex((b) => b.url === state.url);
  if (index >= 0) {
    list.splice(index, 1);
    Cho.toast('已取消收藏');
  } else {
    list.unshift({ url: state.url, title: state.title || Cho.util.prettyUrl(state.url), at: Date.now() });
    Cho.toast('已加入书签');
  }
  Cho.storage.set(KEY, list);
  syncButton();
  if (panel.isOpen) panel.refresh();
}

const panel = Cho.panel.create({
  id: 'bookmarks',
  title: '书签',
  icon: 'star',
  width: 380,
  height: 440,
  render(body) {
    body.replaceChildren();
    const list = Cho.ui.el('div', { class: 'mini-scroll' });
    const all = items();

    if (!all.length) {
      list.appendChild(
        Cho.ui.el(
          'div',
          { class: 'empty' },
          Cho.ui.icon('star'),
          Cho.ui.el('div', { text: '还没有书签' }),
          Cho.ui.el('div', { text: '点工具栏的星星收藏当前页面', style: { fontSize: '11px', opacity: '.7' } })
        )
      );
    } else {
      for (const item of all) {
        const row = Cho.ui.el(
          'div',
          { class: 'bm-row' },
          Cho.ui.el(
            'button',
            { class: 'bm-open', type: 'button' },
            Cho.ui.el('span', { class: 'bm-title', text: item.title || item.url }),
            Cho.ui.el('span', { class: 'bm-url', text: item.url })
          ),
          Cho.ui.el('button', { class: 'icon-btn', type: 'button', title: '删除书签' }, Cho.ui.icon('trash'))
        );
        row.querySelector('.bm-open').addEventListener('click', () => {
          Cho.load(item.url);
          panel.close();
        });
        row.querySelector('.icon-btn').addEventListener('click', () => {
          Cho.storage.set(KEY, items().filter((b) => b.url !== item.url));
          panel.refresh();
          syncButton();
        });
        list.appendChild(row);
      }
    }
    body.appendChild(list);
  },
});

button = Cho.toolbar.addButton({
  id: 'bookmark',
  icon: 'star',
  title: '收藏此页',
  order: 5,
  onClick: () => toggle(),
});

Cho.on('navigate', syncButton);
Cho.on('tabs:change', syncButton);

Cho.commands.register({
  id: 'toggle',
  title: '收藏 / 取消收藏当前页',
  icon: 'star',
  run: () => toggle(),
});
Cho.commands.register({
  id: 'open',
  title: '打开书签',
  icon: 'star',
  run: () => panel.open(),
});

Cho.services.register('bookmarks', { open: () => panel.open(), toggle });
syncButton();

Cho.log('书签插件就绪');
