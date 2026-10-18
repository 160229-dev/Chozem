'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const ROUTES = [
    { id: 'settings', title: '设置', sub: 'chozem://settings', icon: 'settings' },
    { id: 'plugins', title: '插件', sub: 'chozem://plugins', icon: 'puzzle' },
    { id: 'downloads', title: '下载内容', sub: 'chozem://downloads', icon: 'download' },
    { id: 'cookies', title: 'Cookie 管理', sub: 'chozem://cookies', icon: 'cookie' },
    { id: 'about', title: '关于 Chozem', sub: 'chozem://about', icon: 'info' },
  ];

  const omnibox = {
    input: null,
    shell: null,
    list: null,
    clearBtn: null,
    items: [],
    active: -1,
    focused: false,

    init() {
      this.input = U.$('#omni-input');
      this.shell = U.$('#omni-shell');
      this.list = U.$('#omni-suggest');
      this.clearBtn = U.$('#btn-omni-clear');

      this.input.addEventListener('focus', () => this.onFocus());
      this.input.addEventListener('blur', () => setTimeout(() => this.onBlur(), 110));
      this.input.addEventListener('input', () => {
        this.renderClear();
        this.build(this.input.value);
      });
      this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
      this.clearBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.input.value = '';
        this.input.focus();
        this.build('');
        this.renderClear();
      });
      this.input.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.chozem.app.inputMenu();
      });

      CHO.bus.on('view:state', () => {
        if (!this.focused) this.renderValue();
        this.renderSite();
      });
      CHO.bus.on('navigate', () => {
        if (!this.focused) this.renderValue();
        this.renderSite();
      });
      CHO.bus.on('settings', () => {
        if (!this.focused) this.renderValue();
      });

      this.renderValue();
      this.renderSite();
    },

    focus(selectAll) {
      this.input.focus();
      this.input.value = CHO.state.url || '';
      this.renderClear();
      if (selectAll !== false) this.input.select();
      this.shell.classList.add('focused');
      this.build('');
    },

    onFocus() {
      this.focused = true;
      this.shell.classList.add('focused');
      this.input.value = CHO.state.url || '';
      this.renderClear();
      setTimeout(() => this.input.select(), 0);
      this.build('');
    },

    onBlur() {
      this.focused = false;
      this.shell.classList.remove('focused');
      this.hide();
      this.renderValue();
      this.renderClear();
    },

    renderValue() {
      if (this.focused) return;
      this.input.value = CHO.state.url ? U.prettyUrl(CHO.state.url) : '';
    },

    renderClear() {
      this.clearBtn.hidden = !(this.focused && this.input.value.length > 0);
    },

    renderSite() {
      const host = U.$('#omni-site');
      if (!host) return;
      host.replaceChildren();
      host.classList.remove('secure');
      if (CHO.state.mode === 'home' || !CHO.state.url) {
        host.appendChild(U.svg('search'));
        return;
      }
      if (CHO.state.favicon) {
        const img = U.el('img', { src: CHO.state.favicon, alt: '' });
        img.addEventListener('error', () => {
          host.replaceChildren(U.svg(CHO.state.secure ? 'lock' : 'globe'));
        });
        host.appendChild(img);
        if (CHO.state.secure) host.classList.add('secure');
        return;
      }
      host.appendChild(U.svg(CHO.state.secure ? 'lock' : 'globe'));
      if (CHO.state.secure) host.classList.add('secure');
    },

    

    build(raw) {
      const text = String(raw || '').trim();
      const engine = CHO.api.engine();
      const items = [];

      const addHead = (title) => items.push({ head: title });

      if (!text) {
        addHead('快捷操作');
        for (const route of ROUTES.slice(0, 4)) {
          items.push({
            title: route.title,
            sub: route.sub,
            icon: route.icon,
            kind: '页面',
            run: () => CHO.app.route('chozem://' + route.id),
          });
        }
        items.push({
          title: '命令面板',
          sub: '搜索所有操作与插件命令',
          icon: 'command',
          kind: 'Ctrl K',
          run: () => { const p = CHO.services.get('palette'); if (p) p.open(); },
        });
        this.show(items);
        return;
      }

      const resolved = CHO.view.resolve(text);
      const isUrl = resolved && resolved.url && !resolved.search;

      addHead('打开');
      if (isUrl) {
        items.push({
          title: text,
          sub: '打开网址',
          icon: 'globe',
          kind: 'Enter',
          run: () => CHO.view.load(resolved.url),
        });
      }
      items.push({
        title: text,
        sub: `用 ${engine.name} 搜索`,
        letter: engine.short || engine.name.slice(0, 1),
        kind: '搜索',
        run: () => CHO.view.load(CHO.api.searchUrl(text)),
      });

      const matchedRoutes = ROUTES.filter(
        (r) => r.title.includes(text) || r.id.includes(text.toLowerCase()) || r.sub.includes(text)
      );
      if (matchedRoutes.length) {
        addHead('Chozem');
        for (const route of matchedRoutes) {
          items.push({
            title: route.title,
            sub: route.sub,
            icon: route.icon,
            kind: '页面',
            run: () => CHO.app.route('chozem://' + route.id),
          });
        }
      }

      const pluginItems = CHO.plugins.omniboxItems(text);
      if (pluginItems.length) {
        addHead('插件建议');
        for (const item of pluginItems) items.push(item);
      }

      this.show(items);
    },

    show(items) {
      this.items = items;
      this.active = -1;
      const list = this.list;
      list.replaceChildren();
      if (!items.length) {
        list.hidden = true;
        return;
      }
      let index = 0;
      for (const item of items) {
        if (item.head) {
          list.appendChild(U.el('div', { class: 'sg-head', text: item.head }));
          continue;
        }
        const i = index++;
        const iconBox = U.el('span', { class: 'sg-icon' });
        if (item.icon) iconBox.appendChild(U.svg(item.icon));
        else iconBox.textContent = item.letter || '·';
        const node = U.el(
          'button',
          { class: 'sg-item', type: 'button', dataset: { index: i } },
          iconBox,
          U.el('span', { class: 'sg-text' }, U.el('span', { class: 'sg-title', text: item.title }), item.sub ? U.el('span', { class: 'sg-sub', text: item.sub }) : null),
          item.kind ? U.el('span', { class: 'sg-kind', text: item.kind }) : null
        );
        node.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.run(i);
        });
        list.appendChild(node);
      }
      list.hidden = false;
    },

    hide() {
      this.list.hidden = true;
      this.active = -1;
    },

    run(index) {
      const item = this.items.filter((x) => !x.head)[index];
      if (!item) return;
      this.hide();
      this.input.blur();
      try {
        item.run();
      } catch (err) {
        console.error('[omnibox]', err);
        U.toast('执行失败：' + err.message, 'err');
      }
    },

    move(delta) {
      const actionable = this.items.filter((x) => !x.head);
      if (!actionable.length) return;
      const count = actionable.length;
      this.active = (this.active + delta + count) % count;
      const nodes = U.$$('.sg-item', this.list);
      nodes.forEach((n, i) => n.classList.toggle('active', i === this.active));
      const node = nodes[this.active];
      if (node) node.scrollIntoView({ block: 'nearest' });
    },

    onKeyDown(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.move(-1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (!this.list.hidden) {
          this.hide();
          this.renderValue();
        } else {
          this.input.blur();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.active >= 0) {
          this.run(this.active);
          return;
        }
        const text = this.input.value.trim();
        if (!text) return;
        if (CHO.plugins.interceptOmnibox(text)) {
          this.hide();
          this.input.blur();
          return;
        }
        this.hide();
        this.input.blur();
        CHO.view.navigate(text);
      } else if (e.key === 'Tab') {
        const active = this.items.filter((x) => !x.head)[this.active];
        if (active) {
          e.preventDefault();
          this.input.value = active.title;
        }
      }
    },
  };

  CHO.omnibox = omnibox;
})();
