'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ENGINES = [
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={q}', short: 'B', builtin: true },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}', short: 'G', builtin: true },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={q}', short: '百', builtin: true },
  { id: 'wikipedia', name: '维基百科', url: 'https://zh.wikipedia.org/wiki/Special:Search?search={q}', short: 'W', builtin: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}', short: 'D', builtin: true },
];

const DEFAULTS = {
  schema: 1,
  engines: DEFAULT_ENGINES,
  searchEngine: 'bing',
  theme: 'system', 
  downloadDir: '',
  askWhereToSave: false,
  zoom: 1,
  privacy: {
    blockThirdPartyCookies: false,
    doNotTrack: true,
    clearOnExit: false,
  },
  window: { width: 1240, height: 820, x: null, y: null, maximized: false },
  plugins: { disabled: [], installed: [] },
  ui: { homeGlow: true, commandPaletteHint: true },
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const key of Object.keys(patch || {})) {
    const value = patch[key];
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined) {
      out[key] = Array.isArray(value) ? value.slice() : value;
    }
  }
  return out;
}

class Settings {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'settings.json');
    this.data = DEFAULTS;
    this._timer = null;
    this._listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = deepMerge(DEFAULTS, parsed);
      
      const ids = new Set(this.data.engines.map((e) => e.id));
      for (const e of DEFAULT_ENGINES) {
        if (!ids.has(e.id)) this.data.engines.push(e);
      }
      if (!this.data.engines.some((e) => e.id === this.data.searchEngine)) {
        this.data.searchEngine = 'bing';
      }
    } catch (_) {
      this.data = JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  get() {
    return this.data;
  }

  getEngine(id) {
    return this.data.engines.find((e) => e.id === id) || this.data.engines[0] || DEFAULT_ENGINES[0];
  }

  set(patch, opts = {}) {
    const before = JSON.stringify(this.data);
    this.data = deepMerge(this.data, patch || {});
    if (this.data.engines.length === 0) this.data.engines = DEFAULT_ENGINES.slice();
    if (!this.data.engines.some((e) => e.id === this.data.searchEngine)) {
      this.data.searchEngine = this.data.engines[0].id;
    }
    if (JSON.stringify(this.data) === before) return this.data;
    this.save();
    if (!opts.silent) {
      for (const fn of this._listeners) {
        try {
          fn(this.data);
        } catch (err) {
          console.error('[settings] listener failed', err);
        }
      }
    }
    return this.data;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this._timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[settings] save failed', err);
    }
  }
}

module.exports = { Settings, DEFAULTS, DEFAULT_ENGINES };
