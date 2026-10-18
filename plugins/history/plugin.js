

const KEY = 'visits';
const MAX = 300;

const visits = () => Cho.storage.get(KEY, []);

function record(url) {
  if (!url || !/^https?:/i.test(url)) return;
  const list = visits();
  const top = list[0];
  if (top && top.url === url && Date.now() - top.at < 30000) {
    top.at = Date.now();
  } else {
    list.unshift({ url, title: '', at: Date.now() });
  }
  Cho.storage.set(KEY, list.slice(0, MAX));
}

Cho.on('navigate', record);
Cho.on('title', (title) => {
  const list = visits();
  if (list[0] && !list[0].title && title) {
    list[0].title = title;
    Cho.storage.set(KEY, list);
  }
});

let filter = '';

const panel = Cho.panel.create({
  id: 'history',
  title: '历史记录',
  icon: 'reload',
  width: 400,
  height: 470,
  render(body) {
    body.replaceChildren();

    const search = Cho.ui.el('input', {
      class: 'input',
      placeholder: '搜索历史记录',
      value: filter,
      style: { flex: '1' },
    });
    search.addEventListener('input', () => {
      filter = search.value.trim().toLowerCase();
      draw();
    });

    const clear = Cho.ui.el('button', { class: 'btn btn-ghost', type: 'button', text: '清空' });
    clear.addEventListener('click', () => {
      Cho.storage.set(KEY, []);
      filter = '';
      draw();
      Cho.toast('历史记录已清空');
    });

    const bar = Cho.ui.el('div', { class: 'mini-toolbar' }, search, clear);
    const list = Cho.ui.el('div', { class: 'mini-scroll' });
    body.append(bar, list);

    function draw() {
      list.replaceChildren();
      const all = visits().filter((v) => !filter || v.url.toLowerCase().includes(filter) || (v.title || '').toLowerCase().includes(filter));
      if (!all.length) {
        list.appendChild(
          Cho.ui.el('div', { class: 'empty' }, Cho.ui.icon('reload'), Cho.ui.el('div', { text: filter ? '没有匹配的记录' : '还没有历史记录' }))
        );
        return;
      }

      let day = '';
      for (const visit of all.slice(0, 200)) {
        const label = new Date(visit.at).toLocaleDateString('zh-CN');
        if (label !== day) {
          day = label;
          list.appendChild(Cho.ui.el('div', { class: 'ck-domain', text: label }));
        }
        const item = Cho.ui.el(
          'button',
          { class: 'hist-item', type: 'button' },
          Cho.ui.el('span', { class: 'hist-title', text: visit.title || Cho.util.prettyUrl(visit.url) }),
          Cho.ui.el('span', { class: 'hist-url', text: visit.url }),
          Cho.ui.el('span', { class: 'hist-time', text: Cho.util.fmtTime(visit.at).slice(6) })
        );
        item.addEventListener('click', () => {
          Cho.navigate(visit.url);
          panel.close();
        });
        list.appendChild(item);
      }
    }

    draw();
  },
});

Cho.commands.register({
  id: 'open',
  title: '打开历史记录',
  hint: '查看最近访问的页面',
  icon: 'reload',
  run: () => panel.open(),
});

Cho.services.register('history', { open: () => panel.open() });

Cho.log('历史记录插件就绪');
