'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { shell } = require('electron');

const MAX_FILES = 800;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_SOURCE = 2 * 1024 * 1024;

function safeId(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizeManifest(raw, dirName) {
  if (!raw || typeof raw !== 'object') throw new Error('manifest.json 不是合法对象');
  const id = safeId(raw.id || dirName);
  if (!id) throw new Error('插件缺少合法 id');
  const name = String(raw.name || id).slice(0, 60);
  return {
    id,
    name,
    version: String(raw.version || '0.0.1').slice(0, 24),
    description: String(raw.description || '').slice(0, 300),
    author: String(raw.author || '').slice(0, 60),
    homepage: String(raw.homepage || '').slice(0, 300),
    main: String(raw.main || 'plugin.js').replace(/^[./\\]+/, ''),
    style: raw.style ? String(raw.style).replace(/^[./\\]+/, '') : '',
    icon: raw.icon ? String(raw.icon) : '',
    permissions: Array.isArray(raw.permissions) ? raw.permissions.map(String).slice(0, 20) : [],
    minAppVersion: String(raw.minAppVersion || ''),
    locked: Boolean(raw.locked),
  };
}

class Plugins {
  constructor({ appRoot, userDataDir, settings }) {
    this.appRoot = appRoot;
    this.settings = settings;
    this.builtinDir = path.join(appRoot, 'plugins');
    this.userDir = path.join(userDataDir, 'plugins');
    this.builtinDirReal = this.builtinDir;
    this.cache = new Map();
    fs.mkdirSync(this.userDir, { recursive: true });
    
    try {
      fs.mkdirSync(this.builtinDir, { recursive: true });
    } catch (_) {}
    
    try {
      for (const entry of fs.readdirSync(this.userDir)) {
        if (entry.startsWith('.tmp-') || entry.startsWith('.old-')) {
          fs.rmSync(path.join(this.userDir, entry), { recursive: true, force: true });
        }
      }
    } catch (_) {}
  }

  scan() {
    const disabled = new Set(this.settings.get().plugins.disabled || []);
    const found = [];
    const seen = new Set();

    const readDir = (base, builtin) => {
      let entries = [];
      try {
        entries = fs.readdirSync(base, { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const dir = path.join(base, entry.name);
        const manifestPath = path.join(dir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = normalizeManifest(readJson(manifestPath), entry.name);
          if (seen.has(manifest.id)) continue;
          if (!fs.existsSync(path.join(dir, manifest.main))) {
            console.warn('[plugins] missing entry', manifest.main, 'in', dir);
            continue;
          }
          seen.add(manifest.id);
          found.push({
            ...manifest,
            dir,
            builtin,
            
            enabled: manifest.locked ? true : !disabled.has(manifest.id),
          });
        } catch (err) {
          console.warn('[plugins] invalid manifest in', dir, err.message);
        }
      }
    };

    readDir(this.userDir, false);
    readDir(this.builtinDir, true);

    const PRIORITY = { settings: 0, tabs: 1, home: 2, palette: 3, downloads: 4 };
    found.sort((a, b) => {
      
      if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
      const pa = Object.prototype.hasOwnProperty.call(PRIORITY, a.id) ? PRIORITY[a.id] : 50;
      const pb = Object.prototype.hasOwnProperty.call(PRIORITY, b.id) ? PRIORITY[b.id] : 50;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    this.cache = new Map(found.map((p) => [p.id, p]));
    return found;
  }

  list() {
    return this.scan();
  }

  get(id) {
    if (!this.cache.has(id)) this.scan();
    return this.cache.get(id) || null;
  }

  source(id) {
    const plugin = this.get(id);
    if (!plugin) throw new Error('插件不存在');
    const jsPath = path.join(plugin.dir, plugin.main);
    const js = fs.readFileSync(jsPath, 'utf8').replace(/^\uFEFF/, '');
    if (js.length > MAX_SOURCE) throw new Error('插件入口文件过大（>2MB）');
    let css = '';
    let found = false;
    const candidates = plugin.style ? [plugin.style] : ['style.css', 'theme.css', 'plugin.css'];
    for (const name of candidates) {
      const cssPath = path.join(plugin.dir, name);
      if (fs.existsSync(cssPath)) {
        css = fs.readFileSync(cssPath, 'utf8').replace(/^\uFEFF/, '');
        if (css.length > MAX_SOURCE) throw new Error('插件样式文件过大（>2MB）');
        found = true;
        break;
      }
    }
    if (plugin.style && !found) {
      throw new Error(`manifest 指向的样式文件不存在：${plugin.style}`);
    }
    return { js, css, manifest: plugin };
  }

  setEnabled(id, enabled) {
    const plugin = this.get(id);
    if (plugin && plugin.locked && !enabled) {
      throw new Error(`「${plugin.name}」是核心插件，不能停用`);
    }
    const disabled = new Set(this.settings.get().plugins.disabled || []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    this.settings.set({ plugins: { disabled: Array.from(disabled) } });
    return this.list();
  }

  async installZip(zipPath) {
    if (!fs.existsSync(zipPath)) throw new Error('找不到 ZIP 文件');
    if (path.extname(zipPath).toLowerCase() !== '.zip') throw new Error('只支持 .zip 插件包');

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    if (!entries.length) throw new Error('ZIP 是空的');
    if (entries.length > MAX_FILES) throw new Error(`文件数量超限（>${MAX_FILES}）`);

    let prefix = '';
    const rootManifest = entries.find((e) => /^manifest\.json$/i.test(e.entryName));
    if (!rootManifest) {
      const nested = entries.find((e) => /^[^/]+\/manifest\.json$/i.test(e.entryName));
      if (!nested) throw new Error('ZIP 根目录（或唯一子目录）里没有 manifest.json');
      prefix = nested.entryName.split('/')[0] + '/';
    }

    const target = entries.filter((e) => e.entryName.startsWith(prefix));
    let total = 0;
    const files = [];
    for (const entry of target) {
      const rel = entry.entryName.slice(prefix.length);
      if (!rel) continue;
      if (rel.includes('..') || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) {
        throw new Error(`插件包包含非法路径：${entry.entryName}`);
      }
      total += entry.header.size;
      if (total > MAX_BYTES) throw new Error('插件解压后超过 24MB');
      files.push({ rel, data: entry.getData() });
    }
    if (!files.some((f) => f.rel.toLowerCase() === 'manifest.json')) {
      throw new Error('插件包里没有 manifest.json');
    }

    const manifestEntry = files.find((f) => f.rel.toLowerCase() === 'manifest.json');
    const manifest = normalizeManifest(JSON.parse(manifestEntry.data.toString('utf8').replace(/^\uFEFF/, '')), path.basename(zipPath, '.zip'));

    const existing = this.get(manifest.id);
    if (existing && existing.builtin) throw new Error(`插件 id「${manifest.id}」与内置插件冲突`);

    const tmp = path.join(this.userDir, `.tmp-${manifest.id}-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    for (const file of files) {
      const dest = path.join(tmp, file.rel);
      if (!dest.startsWith(tmp + path.sep)) throw new Error('插件包路径非法');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.data);
    }

    const destDir = path.join(this.userDir, manifest.id);
    try {
      
      let lastError = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
          fs.renameSync(tmp, destDir);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 90));
        }
      }
      if (lastError) throw lastError;

      if (!fs.existsSync(path.join(destDir, manifest.main))) {
        throw new Error(`manifest 指向的入口文件 ${manifest.main} 不存在`);
      }

      const list = this.list();
      return { manifest, list };
    } catch (err) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch (_) {}
      throw err;
    }
  }

  uninstall(id) {
    const plugin = this.get(id);
    if (!plugin) throw new Error('插件不存在');
    if (plugin.builtin) throw new Error('内置插件不可卸载，可先停用');
    try {
      fs.rmSync(plugin.dir, { recursive: true, force: true });
    } catch (_) {
      const trash = path.join(this.userDir, '.old-' + plugin.id + '-' + Date.now());
      fs.renameSync(plugin.dir, trash);
      try {
        fs.rmSync(trash, { recursive: true, force: true });
      } catch (_) {}
    }
    return this.list();
  }

  reveal(id) {
    const plugin = this.get(id);
    if (!plugin) return false;
    shell.showItemInFolder(path.join(plugin.dir, 'manifest.json'));
    return true;
  }

  openFolder() {
    shell.openPath(this.userDir);
    return this.userDir;
  }

  assetPath(id, name) {
    const plugin = this.get(id);
    if (!plugin) return null;
    const resolved = path.resolve(plugin.dir, name);
    if (!resolved.startsWith(path.resolve(plugin.dir) + path.sep)) return null;
    return resolved;
  }
}

module.exports = { Plugins, normalizeManifest, safeId };
