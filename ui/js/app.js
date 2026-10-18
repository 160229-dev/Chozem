'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;
  const S = CHO.state;

  const ERROR_TEXT = {
    '-106': '网络连接已断开',
    '-105': '找不到这个网站',
    '-102': '连接被拒绝',
    '-118': '连接超时',
    '-107': '安全连接失败',
    '-200': '证书无效',
    '-201': '证书已过期',
    '-501': '不支持的协议',
  };

  const app = {
    async boot() {
      this.cacheDom();
      this.bindWindow();
      this.bindToolbar();
      this.bindMenu();
      this.bindShortcuts();
      this.bindDrop();
      this.bindEvents();

      try {
        const settings = await CHO.api.init();
        this.applyTheme(settings.theme);
        CHO.state.zoom = settings.zoom || 1;
      } catch (err) {
        console.error('[chozem] boot failed', err);
        U.toast('初始化失败：' + err.message, 'err');
      }

      CHO.view.init();
      CHO.omnibox.init();
      CHO.perm.init();

      this.renderChrome();

      try {
        await CHO.plugins.init();
      } catch (err) {
        console.error(err);
      }

      
      CHO.view.create({});

      
      const initial = new URLSearchParams(location.search).get('url');
      if (initial) CHO.view.navigate(initial);

      window.chozem.win.state().then((st) => this.setMaximized(st && st.maximized));
    },

    cacheDom() {
      this.back = U.$('#btn-back');
      this.forward = U.$('#btn-forward');
      this.reload = U.$('#btn-reload');
      this.loadingBar = U.$('#loading-bar');
      this.homeEl = U.$('#home');
      this.errorEl = U.$('#page-error');
    },

    

    bindWindow() {
      U.$('#win-min').addEventListener('click', () => window.chozem.win.minimize());
      U.$('#win-max').addEventListener('click', () => window.chozem.win.toggleMaximize());
      U.$('#win-close').addEventListener('click', () => window.chozem.win.close());

      U.$('#titlebar').addEventListener('dblclick', (e) => {
        if (e.target.closest('.tab, .tab-new, .win-btn')) return;
        window.chozem.win.toggleMaximize();
      });

      U.$('#toolbar').addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, #omnibox, .plugin-buttons')) return;
        window.chozem.win.toggleMaximize();
      });

      window.chozem.on('win:state', (st) => this.setMaximized(st && st.maximized));
    },

    setMaximized(on) {
      const use = U.$('#win-max use');
      if (use) use.setAttribute('href', on ? '#i-restore' : '#i-max');
      U.$('#win-max').title = on ? '还原' : '最大化';
    },

    

    bindToolbar() {
      this.back.addEventListener('click', () => CHO.view.back());
      this.forward.addEventListener('click', () => CHO.view.forward());
      this.reload.addEventListener('click', () => {
        if (CHO.state.loading) CHO.view.stop();
        else CHO.view.reload();
      });
      U.$('#btn-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        this.showMenu(e.currentTarget);
      });
    },

    bindMenu() {},

    showMenu(anchor) {
      const zoomRow = U.el(
        'div',
        { class: 'mi zoom-row' },
        U.svg('search'),
        U.el('span', { text: '缩放' }),
        U.el(
          'div',
          { class: 'zoom-ctl' },
          U.el('button', { type: 'button', title: '缩小', text: '−', onclick: () => CHO.view.setZoom(S.zoom - 0.1) }),
          U.el('span', { text: Math.round(S.zoom * 100) + '%' }),
          U.el('button', { type: 'button', title: '放大', text: '+', onclick: () => CHO.view.setZoom(S.zoom + 0.1) })
        )
      );

      CHO.menu.show({
        anchor,
        align: 'right',
        width: 246,
        items: [
          { label: '新建窗口', icon: 'plus', kbd: 'Ctrl N', onClick: () => window.chozem.win.newWindow() },
          ...this.menuService('命令面板', 'command', 'Ctrl K', 'palette', (s) => s.open()),
          { sep: true },
          ...this.menuService('下载内容', 'download', 'Ctrl J', 'downloads', (s) => s.open()),
          ...this.menuService('Cookie', 'cookie', '', 'cookies', (s) => s.open()),
          ...this.menuService('历史记录', 'reload', '', 'history', (s) => s.open()),
          ...this.menuService('书签', 'star', '', 'bookmarks', (s) => s.open()),
          { sep: true },
          ...this.menuService('插件', 'puzzle', '', 'settings', (s) => s.open('plugins')),
          ...this.menuService('设置', 'settings', 'Ctrl ,', 'settings', (s) => s.open('general')),
          { sep: true },
          { node: zoomRow },
          { sep: true },
          { label: '开发者工具', icon: 'code', kbd: 'Ctrl ⇧ I', onClick: () => CHO.view.openDevTools() },
          ...this.menuService('关于 Chozem', 'info', '', 'settings', (s) => s.open('about')),
          ...(CHO.menuExtras.length ? [{ sep: true }] : []),
          ...CHO.menuExtras.map((item) => ({
            label: item.label,
            icon: item.icon,
            kbd: item.kbd,
            onClick: item.onClick,
          })),
          { sep: true },
          { label: '退出', icon: 'close', onClick: () => window.chozem.win.close() },
        ],
      });
    },

    menuService(label, icon, kbd, service, run) {
      const target = CHO.services.get(service);
      if (!target) return [];
      return [{ label, icon, kbd, onClick: () => run(target) }];
    },

    

    bindEvents() {
      CHO.bus.on('view:state', () => this.renderChrome());
      CHO.bus.on('navigate', () => this.renderChrome());
      CHO.bus.on('theme', (res) => {
        document.documentElement.dataset.theme = res.dark ? 'dark' : 'light';
      });
      CHO.bus.on('zoom', () => {
        U.toast(`缩放 ${Math.round(S.zoom * 100)}%`);
      });
      CHO.bus.on('settings', (settings) => {
        this.applyTheme(settings.theme);
      });

      window.chozem.on('theme:changed', (res) => {
        if (res && typeof res.dark === 'boolean') {
          document.documentElement.dataset.theme = res.dark ? 'dark' : 'light';
        }
      });

      window.chozem.on('webview:open-url', ({ url, disposition, newWindow, newTab }) => {
        if (!url) return;
        if (newWindow || newTab || disposition === 'new-window' || disposition === 'foreground-tab') {
          
          CHO.view.create({ url });
        } else {
          CHO.view.load(url);
        }
      });

      window.chozem.on('webview:search-text', (text) => {
        if (text) CHO.view.load(CHO.api.searchUrl(text));
      });

      window.chozem.on('shortcut', (payload) => this.handleShortcut(payload));

      
      document.addEventListener(
        'pointermove',
        (e) => {
          const el = e.target.closest && e.target.closest('#home-search, .omni-shell');
          if (!el) return;
          const rect = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
          el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        },
        { passive: true }
      );
      window.chozem.on('downloads:list', (list) => CHO.bus.emit('downloads:list', list));
      window.chozem.on('context:item', (payload) => CHO.dispatchContextItem(payload && payload.id));
      window.chozem.on('cookies:changed', () => CHO.bus.emit('cookies:changed'));

      U.$('#pe-retry').addEventListener('click', () => CHO.view.reload());
      U.$('#pe-home').addEventListener('click', () => CHO.view.goHome());

      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const theme = CHO.api.settings ? CHO.api.settings.theme : 'system';
        if (theme === 'system') this.applyTheme('system');
      });
    },

    applyTheme(theme) {
      const dark =
        theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    },

    renderChrome() {
      document.body.dataset.mode = S.mode;
      this.back.disabled = S.mode === 'home' ? true : !S.canBack;
      this.forward.disabled = S.mode === 'home' ? true : !S.canForward;
      this.reload.disabled = S.mode === 'home';
      const use = this.reload.querySelector('use');
      use.setAttribute('href', S.loading ? '#i-close' : '#i-reload');
      this.reload.title = S.loading ? '停止加载  (Esc)' : '刷新  (Ctrl + R)';

      this.loadingBar.hidden = !S.loading;
      this.errorEl.hidden = !S.failed;

      if (S.failed && CHO.view.lastError) {
        const err = CHO.view.lastError;
        U.$('#pe-title').textContent = ERROR_TEXT[String(err.code)] || '无法访问此网站';
        U.$('#pe-detail').textContent = `${err.description}（${err.code}）\n${err.url || ''}`.trim();
        U.$('#pe-detail').style.whiteSpace = 'pre-line';
      }

      document.title = S.mode === 'web' && S.title ? `${S.title} — Chozem` : 'Chozem';

      const dl = U.$('#btn-download');
      if (dl) dl.hidden = !CHO.services.get('downloads');
    },

    

    route(url) {
      const match = /^chozem:\/\/([a-z-]+)(?:\/([a-z-]+))?/i.exec(String(url || ''));
      const page = match ? match[1].toLowerCase() : 'home';
      const sub = match && match[2];
      if (CHO.omnibox) CHO.omnibox.hide();
      const custom = CHO.routes.get(page);
      if (custom) {
        try {
          custom({ sub, url });
        } catch (err) {
          console.error('[chozem] route', err);
          U.toast('插件页面出错：' + err.message, 'err');
        }
        return;
      }
      const settings = CHO.services.get('settings');
      switch (page) {
        case 'settings':
          settings ? settings.open(sub || 'general') : U.toast('设置插件未启用');
          break;
        case 'plugins':
          settings ? settings.open('plugins') : U.toast('设置插件未启用');
          break;
        case 'downloads': {
          const svc = CHO.services.get('downloads');
          svc ? svc.open() : U.toast('下载插件未启用');
          break;
        }
        case 'cookies': {
          const svc = CHO.services.get('cookies');
          svc ? svc.open({ siteOnly: !!S.url }) : U.toast('Cookie 插件未启用');
          break;
        }
        case 'about':
          settings ? settings.open('about') : U.toast('设置插件未启用');
          break;
        case 'home':
        default:
          CHO.view.goHome();
      }
    },

    

    bindShortcuts() {
      document.addEventListener(
        'keydown',
        (e) => {
          if (CHO.modal.isOpen()) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
              e.preventDefault();
              const palette = CHO.services.get('palette');
              if (palette) palette.open();
            }
            return;
          }
          this.handleShortcut({
            key: e.key,
            ctrl: e.ctrlKey || e.metaKey,
            shift: e.shiftKey,
            alt: e.altKey,
          });
        },
        false
      );
    },

    handleShortcut({ key, ctrl, shift, alt }) {
      if (!key) return;
      const k = key.length === 1 ? key.toLowerCase() : key;
      const svc = (name) => CHO.services.get(name);

      if (ctrl && k === 'k') {
        const palette = svc('palette');
        palette ? palette.open() : U.toast('命令面板插件未启用');
        return;
      }
      if (ctrl && k === 'l') {
        CHO.omnibox.focus();
        return;
      }

      
      CHO.bus.emit('shortcut', { key, ctrl, shift, alt });
      if (CHO.keys.dispatch({ key, ctrl, shift, alt })) return;

      if (ctrl && k === 'r') {
        CHO.view.reload();
      } else if (ctrl && k === 'j') {
        const downloads = svc('downloads');
        if (downloads) downloads.toggle();
      } else if (ctrl && k === 'f') {
        const find = svc('find');
        if (find) find.open();
      } else if (ctrl && k === 'n') {
        window.chozem.win.newWindow();
      } else if (ctrl && key === ',') {
        const settings = svc('settings');
        if (settings) settings.open('general');
      } else if (ctrl && shift && k === 'i') {
        CHO.view.openDevTools();
      } else if (ctrl && (key === '=' || key === '+')) {
        CHO.view.setZoom(S.zoom + 0.1);
      } else if (ctrl && key === '-') {
        CHO.view.setZoom(S.zoom - 0.1);
      } else if (ctrl && key === '0') {
        CHO.view.setZoom(1);
      } else if (alt && key === 'ArrowLeft') {
        CHO.view.back();
      } else if (alt && key === 'ArrowRight') {
        CHO.view.forward();
      } else if (key === 'F5') {
        CHO.view.reload();
      } else if (key === 'F12') {
        CHO.view.openDevTools();
      } else if (key === 'Escape' && S.loading) {
        CHO.view.stop();
      }
    },

    

    bindDrop() {
      const veil = U.$('#drop-veil');
      let depth = 0;

      const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

      window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth += 1;
        veil.hidden = false;
      });
      window.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });
      window.addEventListener('dragleave', (e) => {
        if (!hasFiles(e)) return;
        depth = Math.max(0, depth - 1);
        if (depth === 0) veil.hidden = true;
      });
      window.addEventListener('drop', async (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        veil.hidden = true;
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!/\.zip$/i.test(file.name)) {
          U.toast('只支持 .zip 插件包', 'err');
          return;
        }
        try {
          const buffer = new Uint8Array(await file.arrayBuffer());
          const res = await window.chozem.plugins.installBuffer(file.name, buffer);
          U.toast(`已安装 ${res.manifest ? res.manifest.name : file.name}`);
        } catch (err) {
          U.toast('安装失败：' + String(err.message || err).replace(/^Error:\s*/, ''), 'err');
        }
      });
    },
  };

  CHO.app = app;
  window.addEventListener('DOMContentLoaded', () => app.boot());
})();
