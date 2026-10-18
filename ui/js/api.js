'use strict';
window.CHO = window.CHO || {};

(function () {
  const bus = {
    map: new Map(),
    on(event, fn) {
      if (!this.map.has(event)) this.map.set(event, new Set());
      this.map.get(event).add(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      const set = this.map.get(event);
      if (set) set.delete(fn);
    },
    emit(event, payload) {
      const set = this.map.get(event);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[chozem] event handler failed', event, err);
        }
      }
    },
  };

  const api = {
    info: null,
    settings: null,
    ready: false,

    async init() {
      this.info = await window.chozem.info();
      this.settings = await window.chozem.settings.get();
      this.ready = true;
      return this.settings;
    },

    async setSettings(patch) {
      this.settings = await window.chozem.settings.set(patch);
      bus.emit('settings', this.settings);
      return this.settings;
    },

    async setTheme(theme) {
      const res = await window.chozem.theme.set(theme);
      this.settings.theme = theme;
      document.documentElement.dataset.theme = res.dark ? 'dark' : 'light';
      bus.emit('theme', res);
      return res;
    },

    engine() {
      const s = this.settings;
      if (!s) return { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={q}', short: 'B' };
      return s.engines.find((e) => e.id === s.searchEngine) || s.engines[0];
    },

    engineById(id) {
      const s = this.settings;
      return s && s.engines.find((e) => e.id === id);
    },

    searchUrl(query, engineId) {
      const engine = this.engineById(engineId) || this.engine();
      return engine.url.replace(/\{q\}/g, encodeURIComponent(query));
    },
  };

  CHO.services = {
    map: new Map(),
    register(name, impl) {
      this.map.set(name, impl);
      return impl;
    },
    unregister(name) {
      this.map.delete(name);
    },
    get(name) {
      return this.map.get(name);
    },
    has(name) {
      return this.map.has(name);
    },
  };

  function comboOf(payload) {
    const parts = [];
    if (payload.ctrl) parts.push('ctrl');
    if (payload.alt) parts.push('alt');
    if (payload.shift) parts.push('shift');
    parts.push(String(payload.key || '').toLowerCase());
    return parts.join('+');
  }

  CHO.keys = {
    map: new Map(),
    normalize(combo) {
      const parts = String(combo || '')
        .toLowerCase()
        .split('+')
        .map((x) => x.trim())
        .filter(Boolean);
      if (!parts.length) return '';
      const key = parts.pop();
      const has = (m) => parts.includes(m);
      return [
        has('ctrl') || has('control') || has('cmd') || has('meta') ? 'ctrl' : '',
        has('alt') || has('option') ? 'alt' : '',
        has('shift') ? 'shift' : '',
        key,
      ]
        .filter(Boolean)
        .join('+');
    },
    register(combo, fn, owner) {
      const norm = this.normalize(combo);
      if (!norm || typeof fn !== 'function') throw new Error('快捷键需要组合键与回调');
      const entry = { fn, owner: owner || 'unknown' };
      this.map.set(norm, entry);
      this.sync();
      return () => {
        if (this.map.get(norm) === entry) {
          this.map.delete(norm);
          this.sync();
        }
      };
    },
    sync() {
      try {
        window.chozem.keys.sync(Array.from(this.map.keys()));
      } catch (_) {}
    },
    dispatch(payload) {
      const entry = this.map.get(comboOf(payload));
      if (!entry) return false;
      try {
        entry.fn(payload);
      } catch (err) {
        console.error('[chozem] shortcut handler', err);
      }
      return true;
    },
  };

  CHO.routes = new Map();
  CHO.menuExtras = [];
  CHO.pendingSections = [];

  CHO.contextItems = [];
  CHO.syncContextItems = function () {
    try {
      window.chozem.context.setItems(
        CHO.contextItems.map((i) => ({ id: i.id, label: i.label, match: i.match }))
      );
    } catch (_) {}
  };
  CHO.dispatchContextItem = function (id) {
    const item = CHO.contextItems.find((i) => i.id === id);
    if (!item) return false;
    try {
      item.run();
    } catch (err) {
      console.error('[chozem] context item', err);
    }
    return true;
  };

  CHO.net = {
    rules: [],
    headers: [],
    header(name, value, opts) {
      const entry = { name: String(name), value: String(value), match: (opts && opts.match) || '*' };
      this.headers.push(entry);
      this.syncHeaders();
      return () => {
        this.headers = this.headers.filter((h) => h !== entry);
        this.syncHeaders();
      };
    },
    syncHeaders() {
      try {
        window.chozem.net.syncHeaders(this.headers.map((h) => ({ name: h.name, value: h.value, match: h.match })));
      } catch (_) {}
    },
    block(pattern, owner) {
      const entry = { id: 'r' + Math.random().toString(36).slice(2), pattern: String(pattern), owner: owner || 'unknown' };
      this.rules.push(entry);
      this.sync();
      return () => {
        this.rules = this.rules.filter((r) => r !== entry);
        this.sync();
      };
    },
    sync() {
      try {
        window.chozem.net.sync(this.rules.map((r) => ({ pattern: r.pattern })));
      } catch (_) {}
    },
  };

  CHO.bus = bus;
  CHO.api = api;

  CHO.state = {
    mode: 'home', 
    url: '',
    title: '',
    favicon: '',
    loading: false,
    canBack: false,
    canForward: false,
    secure: false,
    failed: false,
    zoom: 1,
    findOpen: false,
    focused: false,
  };
})();
