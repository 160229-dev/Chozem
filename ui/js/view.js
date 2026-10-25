'use strict';

window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const view = {
    sessions: new Map(),
    order: [],
    activeId: null,
    seq: 0,
    bound: false,
    lastError: null,
    zoom: 1,

    init() {
      this.host = U.$('#stage');
      this.bound = true;
    },

    

    create(opts = {}) {
      if (!this.host) this.init();
      const id = 'v' + ++this.seq;
      const el = document.createElement('webview');
      el.className = 'tabview';
      el.setAttribute('partition', 'persist:chozem');
      el.setAttribute('allowpopups', '');
      el.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no');
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.display = 'none';

      const anchor = U.$('#home') || U.$('#page-error');
      this.host.insertBefore(el, anchor);

      const session = {
        id,
        el,
        home: true,
        guestReady: false,
        state: {
          url: '',
          title: '',
          favicon: '',
          badge: '',
          badgeOwner: '',
          loading: false,
          canBack: false,
          canForward: false,
          secure: false,
          failed: false,
        },
      };

      this.sessions.set(id, session);
      this.order.push(id);
      this.bind(session);

      if (opts.url) this.load(opts.url, id);
      if (opts.activate !== false) this.activate(id);
      else this.emit();

      return this.handle(id);
    },

    handle(id) {
      const self = this;
      return {
        id,
        get el() {
          const s = self.sessions.get(id);
          return s ? s.el : null;
        },
        state() {
          const s = self.sessions.get(id);
          return s ? Object.assign({ id, active: id === self.activeId }, s.state) : null;
        },
        activate: () => self.activate(id),
        close: () => self.close(id),
        navigate: (input) => self.navigate(input, id),
        load: (url) => self.load(url, id),
        back: () => self.back(id),
        forward: () => self.forward(id),
        reload: () => self.reload(id),
        stop: () => self.stop(id),
      };
    },

    bind(session) {
      const el = session.el;
      const update = (patch) => {
        Object.assign(session.state, patch);
        this.sync(session);
      };

      el.addEventListener('did-start-loading', () => update({ loading: true }));

      el.addEventListener('did-stop-loading', () => {
        try {
          session.state.canBack = el.canGoBack();
          session.state.canForward = el.canGoForward();
        } catch (_) {}
        update({ loading: false });
      });

      el.addEventListener('did-start-navigation', (e) => {
        if (!e.isMainFrame) return;
        this.lastError = null;
        update({ loading: true, failed: false });
      });

      el.addEventListener('did-navigate', (e) => {
        this.setUrl(session, e.url);
        CHO.plugins.emitPageEvent('navigate', { url: e.url, tabId: session.id });
      });

      el.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame) this.setUrl(session, e.url);
      });

      el.addEventListener('page-title-updated', (e) => {
        update({ title: e.title || '' });
        CHO.bus.emit('title', e.title || '');
      });

      el.addEventListener('page-favicon-updated', (e) => {
        const list = e.favicons || [];
        if (list.length) update({ favicon: list[list.length - 1] });
      });

      el.addEventListener('dom-ready', () => {
        session.guestReady = true;
        try {
          el.setZoomFactor(this.zoom);
        } catch (_) {}
        CHO.plugins.applyPageInjections(el, session.state.url);
        CHO.plugins.emitPageEvent('dom-ready', { url: session.state.url, tabId: session.id });
      });

      el.addEventListener('did-fail-load', (e) => {
        if (!e.isMainFrame || e.errorCode === -3) return;
        this.lastError = {
          code: e.errorCode,
          description: e.errorDescription || '未知错误',
          url: e.validatedURL || e.url,
        };
        update({ loading: false, failed: true });
      });

      el.addEventListener('found-in-page', (e) => {
        CHO.bus.emit('find:result', {
          matches: e.result.matches,
          active: e.result.activeMatchOrdinal,
        });
      });

      el.addEventListener('enter-html-full-screen', () => document.body.classList.add('html-fullscreen'));
      el.addEventListener('leave-html-full-screen', () => document.body.classList.remove('html-fullscreen'));
    },

    setUrl(session, url) {
      if (!url || url === 'about:blank') return;
      session.home = false;
      session.state.url = url;
      session.state.failed = false;
      let secure = false;
      try {
        secure = new URL(url).protocol === 'https:';
      } catch (_) {}
      session.state.secure = secure;
      try {
        session.state.canBack = session.el.canGoBack();
        session.state.canForward = session.el.canGoForward();
      } catch (_) {}
      this.sync(session);
      if (session.id === this.activeId) CHO.bus.emit('navigate', url);
    },

    sync(session) {
      if (session.id === this.activeId) {
        Object.assign(CHO.state, session.state, { mode: session.state.url ? 'web' : 'home' });
        document.body.dataset.mode = CHO.state.mode;
        CHO.bus.emit('view:state', CHO.state);
      }
      this.emit();
    },

    emit() {
      CHO.bus.emit('tabs:change', this.list());
    },

    list() {
      return this.order.map((id) => {
        const s = this.sessions.get(id);
        return Object.assign({ id, active: id === this.activeId }, s ? s.state : {});
      });
    },

    active() {
      return this.sessions.get(this.activeId) || null;
    },

    get el() {
      const s = this.active();
      return s ? s.el : null;
    },

    activate(id) {
      const session = this.sessions.get(id);
      if (!session) return;
      if (this.activeId === id && !session.home) return;
      this.activeId = id;
      for (const other of this.sessions.values()) {
        other.el.style.display = 'none';
      }
      const home = !session.state.url;
      if (!home) session.el.style.display = 'flex';
      CHO.state.mode = home ? 'home' : 'web';
      Object.assign(CHO.state, session.state, { mode: CHO.state.mode });
      document.body.dataset.mode = CHO.state.mode;
      CHO.bus.emit('view:state', CHO.state);
      this.emit();
      if (home) {
        setTimeout(() => {
          const input = U.$('#home-input');
          if (input) input.focus({ preventScroll: true });
        }, 40);
      }
    },

    close(id) {
      const session = this.sessions.get(id);
      if (!session) return;
      const index = this.order.indexOf(id);
      try {
        session.el.remove();
      } catch (_) {}
      this.sessions.delete(id);
      this.order = this.order.filter((x) => x !== id);

      if (this.activeId === id) {
        const next = this.order[Math.min(index, this.order.length - 1)];
        if (next) this.activate(next);
        else this.create({});
      } else {
        this.emit();
      }
    },

    closeActive() {
      if (this.activeId) this.close(this.activeId);
    },

    setBadge(id, text, owner) {
      const session = this.sessions.get(id || this.activeId);
      if (!session) return false;
      const value = String(text == null ? '' : text).slice(0, 4);
      session.state.badge = value;
      session.state.badgeOwner = value ? String(owner || '') : '';
      this.sync(session);
      return true;
    },

    clearBadges(owner) {
      if (!owner) return;
      for (const session of this.sessions.values()) {
        if (session.state.badgeOwner === owner) {
          session.state.badge = '';
          session.state.badgeOwner = '';
          this.sync(session);
        }
      }
    },

    setMuted(id, muted) {
      const session = this.sessions.get(id || this.activeId);
      if (!session) return false;
      try {
        session.el.setAudioMuted(!!muted);
        return true;
      } catch (_) {
        return false;
      }
    },

    setZoomFor(id, factor) {
      const session = this.sessions.get(id || this.activeId);
      if (!session) return false;
      const next = U.clamp(Math.round(factor * 100) / 100, 0.3, 3);
      try {
        session.el.setZoomFactor(next);
        session.state.zoom = next;
        this.sync(session);
        return true;
      } catch (_) {
        return false;
      }
    },

    webContentsId(id) {
      const session = this.sessions.get(id || this.activeId);
      if (!session) return null;
      try {
        return session.el.getWebContentsId();
      } catch (_) {
        return null;
      }
    },

    move(id, targetId, after) {
      const from = this.order.indexOf(id);
      if (from < 0 || id === targetId) return;
      const [moved] = this.order.splice(from, 1);
      let to = this.order.indexOf(targetId);
      if (to < 0) this.order.push(moved);
      else {
        if (after) to += 1;
        this.order.splice(to, 0, moved);
      }
      this.emit();
    },

    

    resolve(input) {
      const raw = String(input || '').trim();
      if (!raw) return null;
      if (/^chozem:\/\//i.test(raw)) return { internal: raw };
      if (/^(https?|file|about|data|view-source|mailto|ftp):/i.test(raw)) return { url: raw };
      if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#]|$)/i.test(raw)) return { url: 'http://' + raw };
      if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(raw)) return { url: 'http://' + raw };

      const hostLike =
        /^(?:[a-z0-9\u4e00-\u9fa5](?:[a-z0-9\u4e00-\u9fa5-]*[a-z0-9\u4e00-\u9fa5])?\.)+(?:[a-z]{2,24}|中国|公司|网络|在线|中文网)(?::\d{1,5})?(?:[/?#]\S*)?$/i;
      if (!/\s/.test(raw) && hostLike.test(raw)) return { url: 'https://' + raw };

      return { url: CHO.api.searchUrl(raw), search: raw };
    },

    navigate(input, id) {
      const target = this.resolve(input);
      if (!target) return false;
      if (target.internal) {
        CHO.app.route(target.internal);
        return true;
      }
      this.load(target.url, id);
      return true;
    },

    load(url, id) {
      let session = id ? this.sessions.get(id) : this.active();
      if (!session) session = this.sessions.get(this.create({ activate: true }).id);
      session.home = false;
      session.state.url = url;
      session.state.title = '';
      session.state.favicon = '';
      session.state.failed = false;

      if (session.id === this.activeId) {
        CHO.state.mode = 'web';
        Object.assign(CHO.state, session.state, { mode: 'web' });
        document.body.dataset.mode = 'web';
        const err = U.$('#page-error');
        if (err) err.hidden = true;
      }
      session.el.style.display = session.id === this.activeId ? 'flex' : 'none';

      try {
        if (!session.guestReady) session.el.src = url;
        else session.el.loadURL(url).catch((err) => console.warn('[chozem] load', err && err.message));
      } catch (err) {
        console.warn('[chozem] load failed', err);
      }

      this.sync(session);
      if (session.id === this.activeId) CHO.bus.emit('navigate', url);
    },

    goHome(focus) {
      const session = this.active() || this.sessions.get(this.create({}).id);
      session.home = true;
      session.state.url = '';
      session.state.title = '';
      session.state.failed = false;
      session.state.loading = false;
      session.state.canForward = false;
      try {
        session.el.stop();
      } catch (_) {}
      session.el.style.display = 'none';
      CHO.state.mode = 'home';
      Object.assign(CHO.state, session.state, { mode: 'home' });
      document.body.dataset.mode = 'home';
      const err = U.$('#page-error');
      if (err) err.hidden = true;
      CHO.bus.emit('view:state', CHO.state);
      this.emit();
      CHO.bus.emit('navigate', '');
      if (focus !== false) {
        setTimeout(() => {
          const input = U.$('#home-input');
          if (input) input.focus({ preventScroll: true });
        }, 40);
      }
    },

    back(id) {
      const session = id ? this.sessions.get(id) : this.active();
      if (!session) return;
      if (!session.state.url) return;
      try {
        if (session.el.canGoBack()) session.el.goBack();
        else this.goHome(false);
      } catch (_) {}
    },

    forward(id) {
      const session = id ? this.sessions.get(id) : this.active();
      if (session && session.state.url) session.el.goForward();
    },

    reload(id) {
      const session = id ? this.sessions.get(id) : this.active();
      if (!session || !session.state.url) return;
      session.el.reload();
    },

    stop(id) {
      const session = id ? this.sessions.get(id) : this.active();
      if (!session) return;
      try {
        session.el.stop();
      } catch (_) {}
    },

    async openDevTools() {
      const id = this.webContentsId();
      try {
        if (id && (await window.chozem.page.devtools(id))) return;
      } catch (_) {}
      try {
        await window.chozem.ui.devtools();
      } catch (_) {}
    },

    setZoom(factor) {
      const next = U.clamp(Math.round(factor * 100) / 100, 0.3, 3);
      this.zoom = next;
      CHO.state.zoom = next;
      for (const session of this.sessions.values()) {
        try {
          session.el.setZoomFactor(next);
        } catch (_) {}
      }
      CHO.bus.emit('zoom', next);
      return next;
    },

    find(text, opts) {
      const session = this.active();
      if (!session || !session.state.url) return;
      const query = String(text || '');
      if (!query) {
        this.stopFind();
        return;
      }
      session.el.findInPage(query, opts || {});
    },

    stopFind() {
      const session = this.active();
      if (!session) return;
      try {
        session.el.stopFindInPage('clearSelection');
      } catch (_) {}
    },

    
    sync2() {},
    hideError() {
      const box = U.$('#page-error');
      if (box) box.hidden = true;
    },
  };

  CHO.view = view;
})();
