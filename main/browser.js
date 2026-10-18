'use strict';

const fs = require('fs');
const path = require('path');
const { session, shell, dialog, app, BrowserWindow } = require('electron');

const PARTITION = 'persist:chozem';

const AUTO_ALLOW = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
  'keyboardLock',
  'idle-detection',
]);

const PERMISSION_LABEL = {
  media: '使用摄像头 / 麦克风',
  geolocation: '获取你的位置',
  notifications: '发送桌面通知',
  'clipboard-read': '读取剪贴板',
  midi: '使用 MIDI 设备',
  midiSysex: '使用 MIDI 设备',
  'window-management': '管理窗口',
  openExternal: '打开外部应用',
  'display-capture': '录制屏幕',
  unknown: '访问敏感权限',
};

function siteKey(host) {
  if (!host) return '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const twoPart = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);
  if (parts.length >= 3 && twoPart.has(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function globToRegex(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$', 'i');
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
    if (i > 500) break;
  }
  return candidate;
}

class Browser {
  constructor({ settings, broadcast }) {
    this.settings = settings;
    this.broadcast = broadcast;
    this.downloads = new Map();
    this._seq = 0;
    this._dlTimer = null;
    this._pendingPerms = new Map();
    this._allowedOrigins = new Set();
  }

  init() {
    this.ses = session.fromPartition(PARTITION);
    this.applyUserAgent();
    this.setupDownloads();
    this.setupPermissions();
    this.setupHeaders();
    this.setupBlocking();
    this.setupCookieWatch();
    this.setupWebContents();
  }

  applyUserAgent() {
    const raw = this.ses.getUserAgent();
    const ua = raw
      .replace(/\sElectron\/[\d.]+/i, '')
      .replace(/\sChozem\/[\d.]+/i, '')
      .replace(/\schozem\/[\d.]+/i, '')
      .trim();
    this.ses.setUserAgent(ua);
    app.userAgentFallback = ua;
    this.userAgent = ua;
  }

  

  downloadDir() {
    const custom = this.settings.get().downloadDir;
    const dir = custom && custom.trim() ? custom : app.getPath('downloads');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
      return app.getPath('downloads');
    }
    return dir;
  }

  setupDownloads() {
    this.ses.on('will-download', (event, item, webContents) => {
      const filename = item.getFilename() || 'chozem-download';
      let savePath;
      const owner = webContents ? BrowserWindow.fromWebContents(webContents.hostWebContents || webContents) : null;

      if (this.settings.get().askWhereToSave) {
        const opts = {
          title: '保存文件',
          defaultPath: path.join(this.downloadDir(), filename),
        };
        savePath = owner ? dialog.showSaveDialogSync(owner, opts) : dialog.showSaveDialogSync(opts);
        if (!savePath) {
          item.cancel();
          return;
        }
      } else {
        savePath = uniquePath(this.downloadDir(), filename);
      }

      item.setSavePath(savePath);

      const id = `d${Date.now().toString(36)}${++this._seq}`;
      const rec = {
        id,
        filename: path.basename(savePath),
        path: savePath,
        url: item.getURL(),
        mime: item.getMimeType(),
        total: item.getTotalBytes(),
        received: 0,
        state: 'progressing',
        paused: false,
        canResume: false,
        startedAt: Date.now(),
        endedAt: null,
      };
      this.downloads.set(id, { item, rec });
      this.pushDownloads(true);

      item.on('updated', (e, state) => {
        rec.received = item.getReceivedBytes();
        rec.total = item.getTotalBytes();
        rec.paused = item.isPaused();
        rec.canResume = item.canResume();
        rec.state = state === 'interrupted' ? 'paused' : state;
        this.pushDownloads();
      });

      item.once('done', (e, state) => {
        rec.received = item.getReceivedBytes();
        rec.total = item.getTotalBytes();
        rec.endedAt = Date.now();
        rec.paused = false;
        rec.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'failed';
        this.pushDownloads(true);
      });
    });
  }

  pushDownloads(force = false) {
    if (force) {
      clearTimeout(this._dlTimer);
      this._dlTimer = null;
      this.broadcast('downloads:list', this.listDownloads());
      return;
    }
    if (this._dlTimer) return;
    this._dlTimer = setTimeout(() => {
      this._dlTimer = null;
      this.broadcast('downloads:list', this.listDownloads());
    }, 160);
  }

  listDownloads() {
    return Array.from(this.downloads.values())
      .map((d) => d.rec)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  downloadAction(id, action) {
    const entry = this.downloads.get(id);
    if (!entry) return false;
    const { item, rec } = entry;
    try {
      if (action === 'cancel') item.cancel();
      else if (action === 'pause' && !item.isPaused()) item.pause();
      else if (action === 'resume' && item.canResume()) item.resume();
      else if (action === 'remove') {
        if (rec.state === 'progressing' && !rec.paused) item.cancel();
        this.downloads.delete(id);
        this.pushDownloads(true);
        return true;
      } else if (action === 'open') {
        if (rec.state === 'completed') shell.openPath(rec.path);
      } else if (action === 'reveal') {
        shell.showItemInFolder(rec.path);
      }
    } catch (err) {
      console.error('[download]', action, err);
    }
    this.pushDownloads(true);
    return true;
  }

  clearDownloads() {
    for (const [id, { item, rec }] of this.downloads) {
      if (rec.state === 'progressing' || rec.paused) {
        try {
          item.cancel();
        } catch (_) {}
      }
      this.downloads.delete(id);
    }
    this.pushDownloads(true);
  }

  

  isAllowed(origin, permission) {
    return this._allowedOrigins.has(`${origin}|${permission}`);
  }

  setupPermissions() {
    this.ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (AUTO_ALLOW.has(permission)) return callback(true);
      const origin = (() => {
        try {
          return new URL(details.requestingUrl || wc.getURL()).origin;
        } catch (_) {
          return 'unknown';
        }
      })();
      if (this.isAllowed(origin, permission)) return callback(true);

      const id = `p${Date.now().toString(36)}${++this._seq}`;
      const timer = setTimeout(() => {
        if (this._pendingPerms.has(id)) {
          this._pendingPerms.delete(id);
          callback(false);
        }
      }, 25000);

      this._pendingPerms.set(id, { callback, timer, permission, origin });
      this.broadcast('perm:ask', {
        id,
        permission,
        label: PERMISSION_LABEL[permission] || PERMISSION_LABEL.unknown,
        origin,
        mediaTypes: details.mediaTypes || [],
      });
    });

    this.ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
      if (AUTO_ALLOW.has(permission)) return true;
      return this.isAllowed(requestingOrigin, permission);
    });
  }

  respondPermission(id, allow, remember) {
    const entry = this._pendingPerms.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this._pendingPerms.delete(id);
    if (allow && remember) this._allowedOrigins.add(`${entry.origin}|${entry.permission}`);
    try {
      entry.callback(!!allow);
    } catch (_) {}
    return true;
  }

  

  setHeaderRules(rules) {
    this.headerRules = (Array.isArray(rules) ? rules : [])
      .filter((r) => r && r.name)
      .map((r) => ({ name: String(r.name), value: String(r.value), regex: globToRegex(r.match || '*') }));
    return this.headerRules.length;
  }

  setBlockRules(rules) {
    this.blockRules = (Array.isArray(rules) ? rules : [])
      .filter((r) => r && typeof r.pattern === 'string')
      .map((r) => ({ pattern: r.pattern, regex: globToRegex(r.pattern) }));
    return this.blockRules.length;
  }

  setupBlocking() {
    this.blockRules = [];
    this.ses.webRequest.onBeforeRequest((details, callback) => {
      if (!this.blockRules.length) return callback({});
      for (const rule of this.blockRules) {
        if (rule.regex.test(details.url)) return callback({ cancel: true });
      }
      callback({});
    });
  }

  

  setupHeaders() {
    this.headerRules = [];
    this.ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = Object.assign({}, details.requestHeaders);
      const privacy = this.settings.get().privacy;
      if (privacy.doNotTrack) headers.DNT = '1';
      for (const rule of this.headerRules) {
        if (rule.regex.test(details.url)) headers[rule.name] = rule.value;
      }
      if (privacy.blockThirdPartyCookies && headers.Cookie) {
        try {
          const reqHost = new URL(details.url).hostname;
          let topUrl = '';
          if (details.frame && details.frame.url) topUrl = details.frame.url;
          else if (details.webContents && !details.webContents.isDestroyed()) topUrl = details.webContents.getURL();
          if (topUrl) {
            const topHost = new URL(topUrl).hostname;
            if (siteKey(topHost) !== siteKey(reqHost)) delete headers.Cookie;
          }
        } catch (_) {}
      }
      callback({ requestHeaders: headers });
    });
  }

  setupCookieWatch() {
    let timer = null;
    this.ses.cookies.on('changed', () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        this.broadcast('cookies:changed', null);
      }, 500);
    });
  }

  setupWebContents() {
    
    app.on('web-contents-created', (event, contents) => {
      if (contents.getType() !== 'webview') return;
      contents.setWindowOpenHandler(({ url, disposition }) => {
        const host = contents.hostWebContents;
        if (host && !host.isDestroyed()) {
          host.send('webview:open-url', { url, disposition });
        }
        return { action: 'deny' };
      });
    });
  }

  

  async listCookies(url) {
    if (url && !/^https?:/i.test(url)) return [];
    const query = url ? { url } : {};
    const cookies = await this.ses.cookies.get(query);
    return cookies
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        session: c.session,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate || null,
        hostOnly: c.hostOnly,
      }))
      .sort((a, b) => (a.domain + a.name).localeCompare(b.domain + b.name));
  }

  async removeCookie(url, name) {
    try {
      await this.ses.cookies.remove(url, name);
      return true;
    } catch (err) {
      console.error('[cookie] remove', err);
      return false;
    }
  }

  async clearCookies() {
    await this.ses.clearStorageData({ storages: ['cookies'] });
    this.broadcast('cookies:changed', null);
    return true;
  }

  async clearSiteData() {
    await this.ses.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'shadercache'],
    });
    this.broadcast('cookies:changed', null);
    return true;
  }

  async exportCookies() {
    const cookies = await this.listCookies();
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const opts = {
      title: '导出 Cookie',
      defaultPath: path.join(app.getPath('downloads'), `chozem-cookies-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), cookies }, null, 2), 'utf8');
    return res.filePath;
  }

  async clearOnExitIfNeeded() {
    if (!this.settings.get().privacy.clearOnExit) return;
    try {
      await this.ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
    } catch (err) {
      console.error('[privacy] clear on exit failed', err);
    }
  }
}

module.exports = { Browser, PARTITION, siteKey };
