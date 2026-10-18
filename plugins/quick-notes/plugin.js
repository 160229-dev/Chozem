


const KEY = 'draft';

const panel = Cho.panel.create({
  id: 'notes',
  title: '速记',
  icon: 'note',
  width: 340,
  height: 380,
  render(body) {
    const wrap = Cho.ui.el('div', { class: 'qn-wrap' });
    const area = Cho.ui.el('textarea', {
      class: 'qn-area',
      placeholder: '随手写点什么，关闭后也不会丢…',
      spellcheck: 'false',
    });
    area.value = Cho.storage.get(KEY, '');

    const status = Cho.ui.el('span', { class: 'qn-status', text: '' });
    const clear = Cho.ui.el('button', { class: 'qn-btn', type: 'button', text: '清空' });

    let timer = null;
    const setStatus = (saved) => {
      status.textContent = `${area.value.length} 字${saved ? ' · 已保存' : ''}`;
    };

    area.addEventListener('input', () => {
      setStatus(false);
      clearTimeout(timer);
      timer = setTimeout(() => {
        Cho.storage.set(KEY, area.value);
        setStatus(true);
      }, 320);
    });

    clear.addEventListener('click', () => {
      area.value = '';
      Cho.storage.set(KEY, '');
      setStatus(true);
      area.focus();
    });

    wrap.append(area, Cho.ui.el('div', { class: 'qn-foot' }, status, clear));
    body.appendChild(wrap);
    setStatus(true);
    setTimeout(() => area.focus(), 80);
  },
});

const button = Cho.toolbar.addButton({
  id: 'notes',
  icon: 'note',
  title: '速记  (Alt + N)',
  order: 20,
  onClick: () => {
    panel.toggle();
  },
});


const observer = new MutationObserver(() => {
  button.setActive(panel.isOpen);
});
observer.observe(document.getElementById('panel-layer'), { childList: true, subtree: true });

const onKey = (e) => {
  if (e.altKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    panel.toggle();
  }
};
document.addEventListener('keydown', onKey);

Cho.commands.register({
  id: 'open',
  title: '打开速记',
  hint: '在浮动小窗里记点什么',
  icon: 'note',
  run: () => panel.open(),
});


Cho.cleanup(() => {
  observer.disconnect();
  document.removeEventListener('keydown', onKey);
});

Cho.log('速记插件已就绪');
