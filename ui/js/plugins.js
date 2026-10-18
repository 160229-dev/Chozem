'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const plugins = {
    list: [],
    loaded: new Map(),
    commands: [],
    omniboxProviders: [],
    interceptors: [],
    injections: [],
    errors: new Map(),
    ready: false,
    _queue: null,

    async init() {
      try {
        this.list = await window.chozem.plugins.list();
      } catch (err) {
        console.error('[chozem] plugin list failed', err);
        this.list = [];
      }
      for (const plugin of this.list) {
        if (plugin.enabled) await this.load(plugin);
      }
      this.ready = true;

      window.chozem.on('plugins:changed', async (list) => {
        await this.sync(list);
      });
    },

    
    async sync(list) {
      this._syncQueue = (this._syncQueue || Promise.resolve()).catch(() => {}).then(async () => {
        this.list = Array.isArray(list) ? list : await window.chozem.plugins.list();
        const enabled = new Set(this.list.filter((p) => p.enabled).map((p) => p.id));

        for (const id of Array.from(this.loaded.keys())) {
          if (!enabled.has(id)) this.unload(id);
        }
        for (const plugin of this.list) {
          if (plugin.enabled && !this.loaded.has(plugin.id)) await this.load(plugin);
        }
        for (const id of Array.from(this.errors.keys())) {
          if (!this.list.some((p) => p.id === id)) this.errors.delete(id);
        }
        CHO.bus.emit('plugins', this.list);
      });
      return this._syncQueue;
    },

    reload() {
      
      this._queue = (this._queue || Promise.resolve())
        .catch(() => {})
        .then(() => this.doReload());
      return this._queue;
    },

    async doReload() {
      for (const id of Array.from(this.loaded.keys())) this.unload(id);
      this.commands = [];
      this.omniboxProviders = [];
      this.interceptors = [];
      this.injections = [];
      for (const selector of ['#plugin-buttons', '#tb-extra-left', '#home-widgets']) {
        const node = U.$(selector);
        if (node) node.replaceChildren();
      }

      try {
        this.list = await window.chozem.plugins.list();
      } catch (_) {}
      for (const plugin of this.list) {
        if (plugin.enabled) await this.load(plugin);
      }
      for (const id of Array.from(this.errors.keys())) {
        if (!this.list.some((p) => p.id === id)) this.errors.delete(id);
      }
      CHO.bus.emit('plugins', this.list);
    },

    async load(plugin) {
      if (this.loaded.has(plugin.id)) return;
      const inst = {
        manifest: plugin,
        cleanups: [],
        styles: [],
        buttons: [],
        panels: [],
        widgets: [],
        commands: [],
        services: [],
        menuItems: [],
        themeVars: [],
        loaded: false,
      };

      try {
        let src;
        try {
          src = await window.chozem.plugins.source(plugin.id);
        } catch (firstErr) {
          
          await new Promise((r) => setTimeout(r, 150));
          try {
            src = await window.chozem.plugins.source(plugin.id);
          } catch (secondErr) {
            if (/插件不存在/.test(secondErr.message || '')) return;
            throw secondErr;
          }
        }
        if (this.loaded.has(plugin.id)) return;

        
        if (/^\s*(?:import\s|export\s)/m.test(src.js.split('\n').slice(0, 60).join('\n'))) {
          throw new Error('插件代码不能使用 import/export，请写成普通脚本');
        }

        if (src.css) {
          const style = document.createElement('style');
          style.dataset.chozemPlugin = plugin.id;
          style.textContent = src.css;
          document.head.appendChild(style);
          inst.styles.push(style);
        }

        const api = this.createApi(inst);
        const code = '"use strict";\n' + src.js + '\n//# sourceURL=chozem-plugin://' + plugin.id + '/' + (src.manifest.main || 'plugin.js');
        const run = new Function('Cho', code);
        run(api);

        inst.loaded = true;
        this.loaded.set(plugin.id, inst);
        this.errors.delete(plugin.id);
        console.log(`%c[chozem] ${plugin.name} v${plugin.version} loaded`, 'color:#e09a4a');
        CHO.bus.emit('plugins:error', { id: plugin.id, error: null });
      } catch (err) {
        console.error('[chozem] plugin failed:', plugin.id, err);
        this.disposeInstance(inst);
        this.errors.set(plugin.id, err.message || String(err));
        CHO.bus.emit('plugins:error', { id: plugin.id, error: this.errors.get(plugin.id) });
        U.toast(`插件「${plugin.name}」加载失败：${err.message}`, 'err');
      }
    },

    unload(id) {
      const inst = this.loaded.get(id);
      if (!inst) return;
      this.disposeInstance(inst);
      this.loaded.delete(id);
    },

    disposeInstance(inst) {
      for (const fn of inst.cleanups) {
        try {
          fn();
        } catch (err) {
          console.error(err);
        }
      }
      for (const style of inst.styles) style.remove();
      for (const entry of inst.buttons) entry.el.remove();
      for (const panel of inst.panels) {
        try {
          panel.destroy();
        } catch (_) {}
      }
      for (const widget of inst.widgets) widget.el.remove();
      for (const name of inst.themeVars) document.documentElement.style.removeProperty(name);
      this.commands = this.commands.filter((c) => c.pluginId !== inst.manifest.id);
      this.omniboxProviders = this.omniboxProviders.filter((p) => p.pluginId !== inst.manifest.id);
      this.interceptors = this.interceptors.filter((p) => p.pluginId !== inst.manifest.id);
      this.injections = this.injections.filter((i) => i.pluginId !== inst.manifest.id);
      for (const name of inst.services) CHO.services.unregister(name);
      CHO.view.clearBadges(inst.manifest.id);
      for (const item of inst.menuItems) {
        CHO.menuExtras = CHO.menuExtras.filter((i) => i !== item);
      }
      inst.menuItems = [];
      inst.loaded = false;
    },

    

    createApi(inst) {
      const plugin = inst.manifest;
      const self = this;

      const storeKey = 'chozem.plugin.' + plugin.id;
      const readStore = () => {
        try {
          return JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
        } catch (_) {
          return {};
        }
      };
      const writeStore = (obj) => localStorage.setItem(storeKey, JSON.stringify(obj));
      const guard = (label, fn) => (...args) => {
        try {
          return fn(...args);
        } catch (err) {
          console.error(`[${plugin.id}] ${label}`, err);
          U.toast(`插件「${plugin.name}」出错：${err.message}`, 'err');
          return null;
        }
      };

      const api = {
        version: (CHO.api.info && CHO.api.info.version) || '0.0.0',
        id: plugin.id,
        manifest: plugin,
        dir: plugin.dir,

        log: (...args) => console.log(`%c[${plugin.name}]`, 'color:#e09a4a', ...args),

        toast: (message, type) => U.toast(String(message), type),

        on(event, cb) {
          if (typeof cb !== 'function') return () => {};
          const off = CHO.bus.on(event, cb);
          inst.cleanups.push(off);
          return off;
        },

        cleanup(fn) {
          if (typeof fn === 'function') inst.cleanups.push(fn);
        },

        

        settings: {
          get: () => CHO.api.settings,
          set: (patch) => CHO.api.setSettings(patch),
          onChange: (cb) => {
            const off = CHO.bus.on('settings', cb);
            inst.cleanups.push(off);
            return off;
          },
        },

        storage: {
          get(key, fallback) {
            const all = readStore();
            return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : fallback;
          },
          set(key, value) {
            const all = readStore();
            all[key] = value;
            writeStore(all);
            return value;
          },
          remove(key) {
            const all = readStore();
            delete all[key];
            writeStore(all);
          },
          all: () => readStore(),
          clear: () => writeStore({}),
        },

        

        ui: {
          doc: document,
          root: document.body,
          $: (sel) => document.querySelector(sel),
          $$: (sel) => Array.from(document.querySelectorAll(sel)),
          el: U.el,
          icon: U.svg,
          css(cssText) {
            return api.ui.injectStyle(cssText);
          },
          injectStyle(cssText) {
            const style = document.createElement('style');
            style.dataset.chozemPlugin = plugin.id;
            style.textContent = String(cssText);
            document.head.appendChild(style);
            inst.styles.push(style);
            return () => style.remove();
          },
          hide(sel) {
            document.querySelectorAll(sel).forEach((node) => {
              if (!node.dataset.chozemDisplay) node.dataset.chozemDisplay = node.style.display || '';
              node.style.display = 'none';
            });
          },
          show(sel) {
            document.querySelectorAll(sel).forEach((node) => {
              node.style.display = node.dataset.chozemDisplay || '';
              delete node.dataset.chozemDisplay;
            });
          },
          addClass(sel, cls) {
            document.querySelectorAll(sel).forEach((n) => n.classList.add(cls));
          },
          removeClass(sel, cls) {
            document.querySelectorAll(sel).forEach((n) => n.classList.remove(cls));
          },
          toast: (message, type) => U.toast(String(message), type),
        },

        

        toolbar: {
          addButton: guard('toolbar.addButton', (opts = {}) => {
            const id = String(opts.id || U.uuid());
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'plugin-btn';
            btn.dataset.pluginButton = plugin.id + ':' + id;
            btn.dataset.order = String(opts.order == null ? 100 : opts.order);
            if (opts.title || opts.label) btn.title = opts.title || opts.label;

            const render = () => {
              btn.replaceChildren();
              const icon = opts.icon;
              if (icon && /^[a-z0-9-]+$/i.test(icon)) {
                btn.appendChild(U.svg(icon));
              } else if (icon && /^(https?:|file:|data:)/i.test(icon)) {
                btn.appendChild(U.el('img', { src: icon, style: { width: '17px', height: '17px', borderRadius: '4px' } }));
              } else if (icon && String(icon).startsWith('<svg')) {
                const span = U.el('span', { style: { display: 'flex' } });
                span.innerHTML = icon;
                btn.appendChild(span);
              } else if (icon) {
                btn.appendChild(U.el('span', { style: { fontSize: '14px', lineHeight: '1' }, text: icon }));
              }
              if (opts.label) btn.appendChild(U.el('span', { class: 'plugin-label', text: opts.label }));
            };
            render();

            const ctl = {
              id,
              el: btn,
              setActive(on) {
                btn.classList.toggle('active', !!on);
              },
              setLabel(label) {
                opts.label = label;
                btn.title = opts.title || label || plugin.name;
                render();
              },
              setIcon(icon) {
                opts.icon = icon;
                render();
              },
              remove() {
                btn.remove();
                inst.buttons = inst.buttons.filter((entry) => entry.el !== btn);
              },
            };

            btn.addEventListener('click', () => {
              try {
                opts.onClick && opts.onClick(ctl);
              } catch (err) {
                console.error(err);
                U.toast(`插件「${plugin.name}」按钮出错：${err.message}`, 'err');
              }
            });

            const host = opts.side === 'left' ? U.$('#tb-extra-left') : U.$('#plugin-buttons');
            const duplicate = document.querySelector(`[data-plugin-button="${plugin.id}:${id}"]`);
            if (duplicate) duplicate.remove();
            const order = Number(btn.dataset.order) || 100;
            const next = Array.from(host.children).find((child) => (Number(child.dataset.order) || 100) > order);
            host.insertBefore(btn, next || null);
            inst.buttons.push({ el: btn, ctl });
            return ctl;
          }),
        },

        

        panel: {
          create: guard('panel.create', (opts = {}) => {
            let win = null;
            const ctl = {
              id: opts.id || U.uuid(),
              get isOpen() {
                return !!win && win.isOpen();
              },
              get body() {
                return win ? win.body : null;
              },
              open() {
                if (!win || win.closed) {
                  win = new CHO.MiniWindow({
                    id: `${plugin.id}-${ctl.id}`,
                    title: opts.title || plugin.name,
                    icon: opts.icon,
                    width: opts.width || 360,
                    height: opts.height || 420,
                    className: 'plugin-panel',
                    onClose: () => opts.onClose && opts.onClose(ctl),
                  });
                  const body = win.body;
                  body.replaceChildren();
                  try {
                    opts.render && opts.render(body, ctl);
                  } catch (err) {
                    console.error(err);
                    body.appendChild(U.el('div', { class: 'empty', text: '面板渲染失败：' + err.message }));
                  }
                }
                win.open();
                opts.onOpen && opts.onOpen(ctl);
                return ctl;
              },
              close() {
                if (win) win.close();
                win = null;
              },
              toggle() {
                return ctl.isOpen ? (ctl.close(), ctl) : ctl.open();
              },
              refresh() {
                if (!win) return;
                win.body.replaceChildren();
                try {
                  opts.render && opts.render(win.body, ctl);
                } catch (err) {
                  console.error(err);
                }
              },
              setTitle(title) {
                if (win) win.setTitle(title);
              },
            };
            inst.panels.push({
              ctl,
              destroy: () => {
                if (win) win.close();
                win = null;
              },
            });
            return ctl;
          }),
        },

        

        home: {
          addWidget: guard('home.addWidget', (opts = {}) => {
            const wrap = U.el('div', { class: 'home-widget' });
            const head = U.el('div', { class: 'home-widget-head' }, U.el('span', { text: opts.title || plugin.name }));
            if (opts.action && opts.action.label) {
              const btn = U.el('button', { class: 'link-btn', type: 'button', text: opts.action.label });
              btn.addEventListener('click', () => opts.action.onClick && opts.action.onClick());
              head.appendChild(btn);
            }
            const body = U.el('div', { class: 'home-widget-body' });
            wrap.append(head, body);
            let host = U.$('#home-widgets');
            if (!host) {
              const home = U.$('#home');
              if (!home) throw new Error('首页插件未启用，无法添加首页组件');
              host = U.el('div', { id: 'home-widgets', class: 'home-widgets' });
              home.appendChild(host);
            }
            host.appendChild(wrap);
            inst.widgets.push({ el: wrap });

            const render = () => {
              body.replaceChildren();
              try {
                opts.render && opts.render(body, { refresh: render });
              } catch (err) {
                console.error(err);
                body.appendChild(U.el('div', { class: 'empty', text: '组件渲染失败' }));
              }
            };
            render();

            return {
              el: wrap,
              body,
              refresh: render,
              remove() {
                wrap.remove();
                inst.widgets = inst.widgets.filter((w) => w.el !== wrap);
              },
            };
          }),
        },

        

        search: {
          addEngine: guard('search.addEngine', (engine = {}) => {
            if (!engine.url || !/\{q\}/.test(engine.url)) {
              throw new Error('搜索引擎地址必须包含 {q}');
            }
            const id = String(engine.id || `${plugin.id}-${U.uuid()}`);
            const entry = {
              id,
              name: String(engine.name || id),
              url: String(engine.url),
              short: String(engine.short || engine.name || '?').slice(0, 1),
              builtin: false,
              plugin: plugin.id,
            };
            const engines = CHO.api.settings.engines.filter((e) => e.id !== id).concat([entry]);
            return CHO.api.setSettings({ engines }).then(() => id);
          }),
          removeEngine: guard('search.removeEngine', (id) => {
            const engines = CHO.api.settings.engines.filter((e) => e.id !== id);
            return CHO.api.setSettings({ engines });
          }),
        },

        

        omnibox: {
          addProvider: guard('omnibox.addProvider', (provider = {}) => {
            if (typeof provider.items !== 'function') throw new Error('provider.items 必须是函数');
            const entry = { pluginId: plugin.id, id: provider.id || U.uuid(), items: provider.items };
            self.omniboxProviders.push(entry);
            return () => {
              self.omniboxProviders = self.omniboxProviders.filter((p) => p !== entry);
            };
          }),
          intercept: guard('omnibox.intercept', (fn) => {
            if (typeof fn !== 'function') throw new Error('intercept 需要函数');
            const entry = { pluginId: plugin.id, fn };
            self.interceptors.push(entry);
            return () => {
              self.interceptors = self.interceptors.filter((p) => p !== entry);
            };
          }),
        },

        

        page: {
          current: () => ({ url: CHO.state.url, title: CHO.state.title, secure: CHO.state.secure }),
          on(event, cb) {
            const off = CHO.bus.on('page:' + event, cb);
            inst.cleanups.push(off);
            return off;
          },
          run(js) {
            const el = CHO.view.el;
            if (!el) return Promise.resolve(null);
            return el.executeJavaScript(String(js), true).catch((err) => {
              console.warn('[chozem] page.run', err);
              return null;
            });
          },
          injectCSS(css, opts = {}) {
            const entry = { pluginId: plugin.id, type: 'css', code: String(css), match: opts.match || '*' };
            self.injections.push(entry);
            if (CHO.view.el && CHO.state.url) {
              try {
                CHO.view.el.insertCSS(entry.code);
              } catch (_) {}
            }
            return () => {
              self.injections = self.injections.filter((i) => i !== entry);
            };
          },
          injectJS(js, opts = {}) {
            const entry = { pluginId: plugin.id, type: 'js', code: String(js), match: opts.match || '*' };
            self.injections.push(entry);
            return () => {
              self.injections = self.injections.filter((i) => i !== entry);
            };
          },
        },

        

        commands: {
          register: guard('commands.register', (cmd = {}) => {
            if (!cmd.title || typeof cmd.run !== 'function') throw new Error('命令需要 title 与 run');
            const entry = {
              id: `${plugin.id}:${cmd.id || U.uuid()}`,
              title: String(cmd.title),
              hint: cmd.hint || '',
              icon: cmd.icon || 'puzzle',
              plugin: plugin.name,
              pluginId: plugin.id,
              run: (...args) => {
                try {
                  return cmd.run(...args);
                } catch (err) {
                  console.error(err);
                  U.toast(`命令「${cmd.title}」出错：${err.message}`, 'err');
                }
              },
            };
            self.commands.push(entry);
            inst.commands.push(entry);
            return () => {
              self.commands = self.commands.filter((c) => c !== entry);
            };
          }),
        },

        

        theme: {
          setVars(vars) {
            for (const key of Object.keys(vars || {})) {
              const name = key.startsWith('--') ? key : '--' + key;
              document.documentElement.style.setProperty(name, String(vars[key]));
              inst.themeVars.push(name);
            }
          },
          reset() {
            for (const name of inst.themeVars) document.documentElement.style.removeProperty(name);
            inst.themeVars = [];
          },
          set(mode) {
            return CHO.api.setTheme(mode);
          },
          current() {
            return document.documentElement.dataset.theme;
          },
          onChange(cb) {
            const off = CHO.bus.on('theme', cb);
            inst.cleanups.push(off);
            return off;
          },
        },

        

        navigate: (url) => CHO.view.navigate(url),
        load: (url) => CHO.view.load(url),
        back: () => CHO.view.back(),
        forward: () => CHO.view.forward(),
        reload: () => CHO.view.reload(),
        home: () => CHO.view.goHome(),
        openWindow: (url) => window.chozem.win.newWindow(url),
        state: () => Object.assign({}, CHO.state),

        asset(name) {
          return U.fileUrl(String(plugin.dir).replace(/\/$/, '') + '\\' + String(name));
        },
      };

      

      api.util = U;

      api.keys = {
        register(combo, fn) {
          const off = CHO.keys.register(combo, fn, plugin.id);
          inst.cleanups.push(off);
          return off;
        },
      };

      api.menu = {
        addItem(opts = {}) {
          if (typeof opts.onClick !== 'function') throw new Error('菜单项需要 onClick');
          const item = {
            owner: plugin.id,
            label: opts.label || plugin.name,
            icon: opts.icon,
            kbd: opts.kbd,
            onClick: opts.onClick,
          };
          CHO.menuExtras.push(item);
          inst.menuItems.push(item);
          return () => {
            CHO.menuExtras = CHO.menuExtras.filter((i) => i !== item);
            inst.menuItems = inst.menuItems.filter((i) => i !== item);
          };
        },
      };

      api.routes = {
        register(name, handler) {
          const key = String(name || '')
            .replace(/^chozem:/i, '')
            .replace(/^\/+/, '')
            .split('/')[0]
            .toLowerCase();
          if (!key || typeof handler !== 'function') throw new Error('路由需要名称与处理函数');
          CHO.routes.set(key, handler);
          const off = () => CHO.routes.delete(key);
          inst.cleanups.push(off);
          return off;
        },
      };

      api.net = {
        block(pattern) {
          const off = CHO.net.block(pattern, plugin.id);
          inst.cleanups.push(off);
          return off;
        },
        header(name, value, opts) {
          const off = CHO.net.header(name, value, opts);
          inst.cleanups.push(off);
          return off;
        },
      };


      api.settings.addSection = (opts = {}) => {
        const payload = Object.assign({ owner: plugin.id }, opts);
        const svc = CHO.services.get('settings');
        if (svc && typeof svc.addSection === 'function') {
          const off = svc.addSection(payload);
          inst.cleanups.push(off);
          return off;
        }
        
        const entry = { opts: payload, off: null };
        CHO.pendingSections.push(entry);
        const dispose = () => {
          if (entry.off) {
            entry.off();
            entry.off = null;
          } else {
            CHO.pendingSections = CHO.pendingSections.filter((e) => e !== entry);
          }
        };
        inst.cleanups.push(dispose);
        return dispose;
      };

      api.ui.menu = (opts) => CHO.menu.show(opts);
      api.ui.esc = (fn) => CHO.pushEsc(fn);

      api.services = {
        register(name, impl) {
          CHO.services.register(name, impl);
          inst.services.push(name);
          return impl;
        },
        get: (name) => CHO.services.get(name),
        has: (name) => CHO.services.has(name),
      };

      api.engines = {
        list: () => CHO.api.settings.engines,
        current: () => CHO.api.engine(),
        setDefault: (id) => CHO.api.setSettings({ searchEngine: id }),
        searchUrl: (query, id) => CHO.api.searchUrl(query, id),
      };

      api.web = {
        create: (opts) => CHO.view.create(opts || {}),
        list: () => CHO.view.list(),
        active: () => CHO.view.list().find((t) => t.active) || null,
        activate: (id) => CHO.view.activate(id),
        close: (id) => CHO.view.close(id),
        closeActive: () => CHO.view.closeActive(),
        move: (id, targetId, after) => CHO.view.move(id, targetId, after),
        find: (text, opts) => CHO.view.find(text, opts),
        stopFind: () => CHO.view.stopFind(),
      };

      api.system = {
        info: () => window.chozem.info(),
        window: {
          minimize: () => window.chozem.win.minimize(),
          toggleMaximize: () => window.chozem.win.toggleMaximize(),
          close: () => window.chozem.win.close(),
          newWindow: (url) => window.chozem.win.newWindow(url),
          state: () => window.chozem.win.state(),
        },
        app: {
          copy: (text) => window.chozem.app.copy(text),
          showItem: (p) => window.chozem.app.showItem(p),
          pickDownloadDir: () => window.chozem.app.pickDownloadDir(),
          openExternal: (url) => window.chozem.app.openExternal(url),
        },
        downloads: {
          list: () => window.chozem.downloads.list(),
          action: (id, action) => window.chozem.downloads.action(id, action),
          clear: () => window.chozem.downloads.clear(),
        },
        cookies: {
          list: (url) => window.chozem.cookies.list(url),
          remove: (url, name) => window.chozem.cookies.remove(url, name),
          clear: () => window.chozem.cookies.clear(),
          clearSiteData: () => window.chozem.cookies.clearSiteData(),
          export: () => window.chozem.cookies.export(),
        },
        plugins: {
          list: () => window.chozem.plugins.list(),
          setEnabled: (id, enabled) => window.chozem.plugins.setEnabled(id, enabled),
          uninstall: (id) => window.chozem.plugins.uninstall(id),
          installDialog: () => window.chozem.plugins.installDialog(),
          openFolder: () => window.chozem.plugins.openFolder(),
          reveal: (id) => window.chozem.plugins.reveal(id),
          skill: () => window.chozem.plugins.skill(),
          source: (id) => window.chozem.plugins.source(id),
        },
        permission: {
          respond: (payload) => window.chozem.perm.respond(payload),
          onAsk: (cb) => CHO.bus.on('permission:ask', cb),
        },
      };

      Object.assign(api.page, {
        capture: async () => {
          const id = CHO.view.webContentsId();
          if (!id) return null;
          const b64 = await window.chozem.page.capture(id);
          return b64 ? 'data:image/png;base64,' + b64 : null;
        },
        print: async () => {
          const id = CHO.view.webContentsId();
          if (!id) return null;
          return window.chozem.page.print(id);
        },
        devtools: () => CHO.view.openDevTools(),
        contextMenu: (opts = {}) => {
          if (!opts.label || typeof opts.run !== 'function') throw new Error('右键项需要 label 与 run');
          const entry = {
            id: `${plugin.id}:${opts.id || U.uuid()}`,
            label: String(opts.label),
            match: opts.match || '*',
            run: opts.run,
            owner: plugin.id,
          };
          CHO.contextItems.push(entry);
          CHO.syncContextItems();
          const off = () => {
            CHO.contextItems = CHO.contextItems.filter((i) => i !== entry);
            CHO.syncContextItems();
          };
          inst.cleanups.push(off);
          return off;
        },
      });

      Object.assign(api.web, {
        setBadge: (text, id) => CHO.view.setBadge(id, text, plugin.id),
        setMuted: (muted, id) => CHO.view.setMuted(id, muted),
        setZoom: (factor, id) => CHO.view.setZoomFor(id, factor),
      });

      Object.assign(api.system, {
        notify: (title, body) => window.chozem.system.notify({ title, body }),
        readClipboard: () => window.chozem.system.readClipboard(),
        saveFile: (name, content) => window.chozem.system.saveText({ name, content }),
      });
      api.system.window.setTitle = (title) => window.chozem.system.setTitle(title);

      return api;
    },

    

    applyPageInjections(el, url) {
      if (!el || !url) return;
      for (const injection of this.injections) {
        if (!U.matchPattern(injection.match, url)) continue;
        try {
          if (injection.type === 'css') el.insertCSS(injection.code);
          else el.executeJavaScript(injection.code, true).catch(() => {});
        } catch (err) {
          console.warn('[chozem] injection failed', err);
        }
      }
    },

    emitPageEvent(event, payload) {
      CHO.bus.emit('page:' + event, payload);
    },

    omniboxItems(text) {
      const out = [];
      for (const provider of this.omniboxProviders) {
        try {
          const items = provider.items(text) || [];
          for (const item of items.slice(0, 5)) {
            if (!item) continue;
            if (typeof item === 'string') {
              out.push({ title: item, icon: 'puzzle', kind: '插件', run: () => CHO.view.navigate(item) });
            } else {
              out.push({
                title: String(item.title || ''),
                sub: item.sub || item.hint || '',
                icon: item.icon || 'puzzle',
                kind: '插件',
                run: typeof item.run === 'function' ? item.run : () => {},
              });
            }
          }
        } catch (err) {
          console.error('[chozem] omnibox provider failed', err);
        }
      }
      return out;
    },

    interceptOmnibox(text) {
      for (const entry of this.interceptors) {
        try {
          if (entry.fn(text)) return true;
        } catch (err) {
          console.error('[chozem] omnibox intercept failed', err);
        }
      }
      return false;
    },
  };

  CHO.plugins = plugins;
})();
