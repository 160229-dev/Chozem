'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const palette = {
    ctl: null,
    items: [],
    active: 0,
    input: null,
    listEl: null,

    baseCommands() {
      return [
        { id: 'home', title: '回到首页', hint: '关闭当前页面，返回搜索首页', icon: 'home', run: () => CHO.view.goHome() },
        { id: 'reload', title: '刷新页面', hint: '重新加载当前网页', icon: 'reload', kbd: 'Ctrl R', run: () => CHO.view.reload() },
        { id: 'new-window', title: '新建窗口', hint: '打开一个新的 Chozem 窗口', icon: 'plus', kbd: 'Ctrl N', run: () => window.chozem.win.newWindow() },
        { id: 'downloads', title: '下载内容', hint: '查看下载进度与历史', icon: 'download', kbd: 'Ctrl J', run: () => CHO.downloads.open() },
        { id: 'cookies', title: 'Cookie 管理器', hint: '查看与清理站点 Cookie', icon: 'cookie', run: () => CHO.cookies.open({ siteOnly: false }) },
        { id: 'plugins', title: '插件', hint: '安装、启用或卸载插件', icon: 'puzzle', run: () => CHO.settingsUI.open('plugins') },
        { id: 'settings', title: '设置', hint: '搜索引擎、隐私、下载', icon: 'settings', kbd: 'Ctrl ,', run: () => CHO.settingsUI.open('general') },
        { id: 'devtools', title: '开发者工具', hint: '检查当前页面的结构与网络请求', icon: 'code', kbd: 'Ctrl Shift I', run: () => CHO.view.openDevTools() },
        { id: 'copy-url', title: '复制当前网址', hint: '把地址栏内容写入剪贴板', icon: 'copy', run: () => CHO.state.url && U.copy(CHO.state.url) },
        { id: 'zoom-reset', title: '重置缩放为 100%', hint: '恢复默认页面比例', icon: 'search', run: () => CHO.view.setZoom(1) },
        {
          id: 'clear',
          title: '清除浏览数据',
          hint: '删除 Cookie、站点存储与缓存',
          icon: 'trash',
          run: () =>
            CHO.dialogConfirm({
              title: '清除全部浏览数据？',
              message: 'Cookie、LocalStorage、IndexedDB 与缓存都会被删除。',
              confirmText: '清除',
              danger: true,
              onConfirm: async () => {
                await window.chozem.cookies.clearSiteData();
                U.toast('浏览数据已清除');
              },
            }),
        },
        { id: 'quit', title: '退出 Chozem', hint: '关闭浏览器', icon: 'close', run: () => window.chozem.win.close() },
      ];
    },

    all() {
      return this.baseCommands().concat(CHO.plugins.commands || []);
    },

    open() {
      if (this.ctl) return;
      const input = U.el('input', { id: 'pal-input', placeholder: '输入命令或搜索插件功能…', spellcheck: 'false', autocomplete: 'off' });
      const inputRow = U.el('div', { class: 'pal-input-row' }, U.svg('command'), input, U.el('span', { class: 'pal-kbd', text: 'Esc' }));
      const listEl = U.el('div', { class: 'pal-list' });
      const body = U.el('div', { class: 'pal-wrap' }, inputRow, listEl);

      this.input = input;
      this.listEl = listEl;

      this.ctl = CHO.modal.open({
        head: false,
        className: 'palette',
        body,
        bodyClass: 'pal-wrap',
        onClose: () => {
          this.ctl = null;
          this.items = [];
        },
      });

      input.addEventListener('input', () => this.render(input.value));
      input.addEventListener('keydown', (e) => this.onKey(e));
      this.render('');
      setTimeout(() => input.focus(), 40);
    },

    score(text, query) {
      if (!query) return 1;
      const hay = (text || '').toLowerCase();
      const q = query.toLowerCase();
      if (hay.includes(q)) return 100 - hay.indexOf(q);
      
      let i = 0;
      for (const ch of hay) {
        if (ch === q[i]) i += 1;
        if (i === q.length) return 40;
      }
      return 0;
    },

    render(query) {
      const all = this.all();
      const scored = all
        .map((cmd) => ({ cmd, score: this.score(cmd.title + ' ' + (cmd.hint || ''), query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.cmd);

      this.items = scored;
      this.active = 0;
      this.listEl.replaceChildren();

      if (!scored.length) {
        this.listEl.appendChild(U.el('div', { class: 'pal-empty', text: '没有匹配的命令' }));
        return;
      }

      scored.forEach((cmd, index) => {
        const iconBox = U.el('span', { class: 'pal-ico' });
        if (cmd.icon) iconBox.appendChild(U.svg(cmd.icon));
        else iconBox.textContent = '·';
        const node = U.el(
          'button',
          { class: 'pal-item' + (index === 0 ? ' active' : ''), type: 'button' },
          iconBox,
          U.el('span', { class: 'pal-text' }, U.el('div', { class: 'pal-title', text: cmd.title }), cmd.hint ? U.el('div', { class: 'pal-hint', text: cmd.hint }) : null),
          cmd.kbd ? U.el('span', { class: 'pal-kbd', text: cmd.kbd }) : cmd.plugin ? U.el('span', { class: 'pal-kbd', text: cmd.plugin }) : null
        );
        node.addEventListener('mousemove', () => this.setActive(index));
        node.addEventListener('click', () => this.run(index));
        this.listEl.appendChild(node);
      });
    },

    setActive(index) {
      this.active = index;
      U.$$('.pal-item', this.listEl).forEach((n, i) => n.classList.toggle('active', i === index));
    },

    onKey(e) {
      if (!this.items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setActive((this.active + 1) % this.items.length);
        this.scrollActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setActive((this.active - 1 + this.items.length) % this.items.length);
        this.scrollActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.run(this.active);
      }
    },

    scrollActive() {
      const node = U.$$('.pal-item', this.listEl)[this.active];
      if (node) node.scrollIntoView({ block: 'nearest' });
    },

    run(index) {
      const cmd = this.items[index];
      if (!cmd) return;
      const close = this.ctl;
      this.ctl = null;
      if (close) close.close();
      setTimeout(() => {
        try {
          cmd.run();
        } catch (err) {
          console.error(err);
          U.toast('命令执行失败：' + err.message, 'err');
        }
      }, 30);
    },
  };

  CHO.palette = palette;
  try {
    Cho.services.register('palette', palette);
    Cho.cleanup(() => {
      if (palette.ctl) palette.ctl.close();
      delete CHO.palette;
    });
  } catch (_) {}
})();
