'use strict';

const {
  app, BrowserWindow, ipcMain, shell, dialog, clipboard, Menu, nativeTheme, screen, session,
  Notification, webContents,
} = require('electron');
const fs = require('fs');
const path = require('path');

const { Settings } = require('./settings');
const { Browser, PARTITION } = require('./browser');
const { Plugins } = require('./plugins');
const { popupForWebContents, popupForInput } = require('./context');

const APP_ROOT = path.join(__dirname, '..');
const UI_INDEX = path.join(APP_ROOT, 'ui', 'index.html');
const isDev = process.argv.includes('--dev');
const shotMode = process.argv.includes('--shot');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.setName('Chozem');
app.setAppUserModelId('com.chozem.browser');


const userDataArg = process.argv.find((a) => a.startsWith('--user-data='));
if (userDataArg) {
  app.setPath('userData', path.resolve(userDataArg.slice('--user-data='.length)));
}
if (process.argv.includes('--disable-gpu') || shotMode) app.disableHardwareAcceleration();
if (process.argv.includes('--no-sandbox')) app.commandLine.appendSwitch('no-sandbox');
if (process.platform === 'win32') app.commandLine.appendSwitch('enable-features', 'WinUseBrowserSpellChecker');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let settings = null;
let browser = null;
let plugins = null;
let scopedKeys = new Set();
let contextItems = [];
const windows = new Set();

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function visibleBounds(bounds) {
  const displays = screen.getAllDisplays();
  const onScreen = displays.some((d) => {
    const a = d.workArea;
    return (
      bounds.x < a.x + a.width - 80 &&
      bounds.x + bounds.width > a.x + 80 &&
      bounds.y < a.y + a.height - 40 &&
      bounds.y + bounds.height > a.y + 40
    );
  });
  return onScreen ? bounds : null;
}

function windowIcon() {
  const ico = path.join(APP_ROOT, 'ui', 'assets', 'icon.ico');
  const png = path.join(APP_ROOT, 'ui', 'assets', 'icon-256.png');
  return process.platform === 'win32' && fs.existsSync(ico) ? ico : png;
}

function createWindow(opts = {}) {
  const saved = settings.get().window || {};
  const bounds = visibleBounds({
    width: Math.max(saved.width || 1240, 720),
    height: Math.max(saved.height || 820, 480),
    x: saved.x,
    y: saved.y,
  }) || { width: 1240, height: 820 };

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111113' : '#ffffff',
    icon: windowIcon(),
    title: 'Chozem',
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload', 'chrome.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  windows.add(win);
  if (saved.maximized) win.maximize();

  const query = opts.url ? { url: opts.url } : {};
  win.loadFile(UI_INDEX, { query });

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));

  const persistBounds = () => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
    const b = win.getBounds();
    settings.set({ window: { width: b.width, height: b.height, x: b.x, y: b.y } }, { silent: true });
  };
  let boundsTimer = null;
  const later = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistBounds, 400);
  };
  win.on('resize', later);
  win.on('move', later);
  win.on('maximize', () => settings.set({ window: { maximized: true } }, { silent: true }));
  win.on('unmaximize', () => settings.set({ window: { maximized: false } }, { silent: true }));

  win.on('closed', () => windows.delete(win));

  if (isDev || shotMode) {
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const tag = ['log', 'warn', 'error', 'debug'][level] || 'log';
      console.log(`[ui:${tag}] ${message}  (${String(sourceId).split('/').pop()}:${line})`);
    });
  }

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    if (isDev && input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  return win;
}

function currentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getAllWindows()[0];
}



function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => fn(event, ...args));

  handle('app:info', () => ({
    name: 'Chozem',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    appRoot: APP_ROOT,
    pluginsDir: plugins.userDir,
    downloadDir: browser.downloadDir(),
    settingsPath: settings.file,
    userAgent: browser.userAgent,
  }));

  handle('app:openExternal', (e, url) => {
    if (/^(https?:|mailto:)/i.test(url)) return shell.openExternal(url);
    return false;
  });

  handle('app:copy', (e, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  handle('app:showItem', (e, p) => {
    if (p && fs.existsSync(p)) shell.showItemInFolder(p);
  });

  handle('app:pickDownloadDir', async (event) => {
    const win = currentWindow(event);
    const res = await dialog.showOpenDialog(win, { title: '选择下载目录', properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    settings.set({ downloadDir: res.filePaths[0] });
    return res.filePaths[0];
  });

  
  handle('win:minimize', (event) => currentWindow(event).minimize());
  handle('win:toggleMaximize', (event) => {
    const win = currentWindow(event);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  handle('win:close', (event) => currentWindow(event).close());
  handle('win:new', (e, url) => {
    createWindow({ url });
    return true;
  });
  handle('win:state', (event) => ({ maximized: currentWindow(event).isMaximized() }));

  
  handle('settings:get', () => settings.get());
  handle('settings:set', (e, patch) => {
    const next = settings.set(patch);
    if (patch && patch.theme) {
      nativeTheme.themeSource = patch.theme;
      broadcast('theme:changed', { theme: patch.theme, dark: nativeTheme.shouldUseDarkColors });
    }
    broadcast('settings:changed', next);
    return next;
  });

  handle('theme:set', (e, theme) => {
    settings.set({ theme });
    nativeTheme.themeSource = theme;
    broadcast('theme:changed', { theme, dark: nativeTheme.shouldUseDarkColors });
    return { theme, dark: nativeTheme.shouldUseDarkColors };
  });

  
  handle('downloads:list', () => browser.listDownloads());
  handle('downloads:action', (e, { id, action }) => browser.downloadAction(id, action));
  handle('downloads:clear', () => browser.clearDownloads());

  
  handle('cookies:list', async (e, { url } = {}) => browser.listCookies(url));
  handle('cookies:remove', async (e, { url, name }) => browser.removeCookie(url, name));
  handle('cookies:clear', () => browser.clearCookies());
  handle('cookies:clearSiteData', () => browser.clearSiteData());
  handle('cookies:export', () => browser.exportCookies());

  
  handle('perm:respond', (e, { id, allow, remember }) => browser.respondPermission(id, allow, remember));

  
  handle('keys:sync', (e, combos) => {
    scopedKeys = new Set((Array.isArray(combos) ? combos : []).map((c) => String(c).toLowerCase()));
    return scopedKeys.size;
  });

  
  handle('net:setRules', (e, rules) => {
    browser.setBlockRules(rules);
    return true;
  });

  handle('net:setHeaders', (e, rules) => {
    browser.setHeaderRules(rules);
    return true;
  });

  
  handle('system:notify', (e, payload) => {
    if (!Notification.isSupported()) return false;
    new Notification({
      title: String((payload && payload.title) || 'Chozem'),
      body: String((payload && payload.body) || ''),
    }).show();
    return true;
  });

  handle('system:readClipboard', () => clipboard.readText());

  handle('file:saveText', async (event, payload) => {
    const win = currentWindow(event);
    const opts = {
      title: '保存文件',
      defaultPath: path.join(app.getPath('downloads'), (payload && payload.name) || 'chozem.txt'),
    };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, String((payload && payload.content) || ''), 'utf8');
    return res.filePath;
  });

  handle('win:setTitle', (event, title) => {
    currentWindow(event).setTitle(String(title || 'Chozem'));
    return true;
  });

  handle('page:capture', async (e, { id }) => {
    const wc = webContents.fromId(Number(id));
    if (!wc || wc.isDestroyed()) return null;
    const image = await wc.capturePage();
    return image.toPNG().toString('base64');
  });

  handle('page:print', async (event, { id }) => {
    const wc = webContents.fromId(Number(id));
    if (!wc || wc.isDestroyed()) return null;
    const data = await wc.printToPDF({ printBackground: true });
    const win = currentWindow(event);
    const opts = {
      title: '保存为 PDF',
      defaultPath: path.join(app.getPath('downloads'), 'page.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, data);
    return res.filePath;
  });

  handle('context:setItems', (e, items) => {
    contextItems = Array.isArray(items) ? items.slice(0, 20) : [];
    return true;
  });

  
  handle('plugins:list', () => plugins.list());
  handle('plugins:source', (e, { id }) => plugins.source(id));
  handle('plugins:setEnabled', (e, { id, enabled }) => {
    const list = plugins.setEnabled(id, enabled);
    broadcast('plugins:changed', list);
    return list;
  });
  handle('plugins:uninstall', (e, { id }) => {
    const list = plugins.uninstall(id);
    broadcast('plugins:changed', list);
    return list;
  });
  handle('plugins:reveal', (e, { id }) => plugins.reveal(id));
  handle('plugins:openFolder', () => plugins.openFolder());
  handle('plugins:installDialog', async (event) => {
    const win = currentWindow(event);
    const res = await dialog.showOpenDialog(win, {
      title: '安装 Chozem 插件',
      filters: [{ name: 'Chozem 插件包', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const result = await plugins.installZip(res.filePaths[0]);
    broadcast('plugins:changed', result.list);
    return { canceled: false, ...result };
  });
  handle('plugins:installPath', async (event, { path: zipPath }) => {
    const result = await plugins.installZip(zipPath);
    broadcast('plugins:changed', result.list);
    return result;
  });
  handle('plugins:installBuffer', async (event, { name, data }) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length > 26 * 1024 * 1024) throw new Error('插件包超过 26MB');
    const safeName = String(name || 'plugin.zip').replace(/[^\w.-]/g, '_');
    const tmp = path.join(app.getPath('temp'), `chozem-${Date.now()}-${safeName}`);
    fs.writeFileSync(tmp, buf);
    try {
      const result = await plugins.installZip(tmp);
      broadcast('plugins:changed', result.list);
      return result;
    } finally {
      fs.unlink(tmp, () => {});
    }
  });
  handle('plugins:skill', () => {
    const file = path.join(APP_ROOT, 'SKILL.md');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  });
  handle('plugins:asset', (e, { id, name }) => plugins.assetPath(id, name));

  handle('shell:inputMenu', (event) => {
    popupForInput(currentWindow(event), { editFlags: {} });
  });
}



function attachGuestHandlers() {
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.on('context-menu', (e, params) => {
      const host = contents.hostWebContents;
      const owner = host ? BrowserWindow.fromWebContents(host) : null;
      popupForWebContents(contents, params, owner, contextItems);
    });

    
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = input.key;
      const ctrl = input.control || input.meta;
      const lower = String(key).toLowerCase();
      const ctrlKeys = ['l', 'k', 'r', 'j', 'f', 'n', ',', '0', '=', '+', '-'];
      const combo = [input.control || input.meta ? 'ctrl' : '', input.alt ? 'alt' : '', input.shift ? 'shift' : '', lower]
        .filter(Boolean)
        .join('+');
      const isBrowserShortcut =
        (ctrl && ctrlKeys.includes(lower)) ||
        (ctrl && input.shift && lower === 'i') ||
        (input.alt && (key === 'ArrowLeft' || key === 'ArrowRight')) ||
        key === 'F5' ||
        key === 'F12' ||
        scopedKeys.has(combo);
      if (!isBrowserShortcut) return;
      const host = contents.hostWebContents;
      if (host && !host.isDestroyed()) {
        host.send('shortcut', { key, ctrl, shift: input.shift, alt: input.alt });
        event.preventDefault();
      }
    });
  });
}



app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  settings = new Settings(app.getPath('userData'));
  nativeTheme.themeSource = settings.get().theme || 'system';

  browser = new Browser({ settings, broadcast });
  browser.init();

  
  plugins = new Plugins({ appRoot: APP_ROOT, userDataDir: app.getPath('userData'), settings });
  plugins.list();

  registerIpc();
  attachGuestHandlers();
  createWindow();

  nativeTheme.on('updated', () => {
    broadcast('theme:changed', { theme: settings.get().theme, dark: nativeTheme.shouldUseDarkColors });
  });

  if (shotMode) runShots();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function runShots() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const outDir = path.join(APP_ROOT, '.design');
  fs.mkdirSync(outDir, { recursive: true });
  const win = BrowserWindow.getAllWindows()[0];
  try {
    await sleep(1800);
    let img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-home.png'), img.toPNG());

    const glassSupport = await win.webContents.executeJavaScript(
      `({ url: CSS.supports('backdrop-filter', 'url(#lg-lens)'), webkit: CSS.supports('-webkit-backdrop-filter', 'url(#lg-lens)'), plain: CSS.supports('backdrop-filter', 'blur(10px)') })`,
      true
    );
    console.log('[shot] glass-support:', JSON.stringify(glassSupport));

    const pointerReport = await win.webContents.executeJavaScript(
      `(function(){
        const el = document.querySelector('#home-search');
        if (!el) return 'missing';
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.78, clientY: r.top + r.height * 0.55, bubbles: true }));
        return { mx: getComputedStyle(el).getPropertyValue('--mx').trim(), my: getComputedStyle(el).getPropertyValue('--my').trim() };
      })()`,
      true
    );
    console.log('[shot] pointer-specular:', JSON.stringify(pointerReport));
    await sleep(300);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-glass.png'), img.toPNG());

    console.log('[shot] step: web');
    const testPage = path.join(outDir, 'test.html');
    fs.writeFileSync(
      testPage,
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Chozem test page</title>' +
        '<style>html,body{height:100%}body{margin:0;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:10px;font:15px/1.6 -apple-system,"Segoe UI",sans-serif;color:#2b2721;background:#fbf8f2}' +
        'h1{font-size:22px;margin:0}a{color:#8c4615}p{color:#8a8075;font-size:13px}</style></head><body>' +
        '<h1>Chozem test page</h1>' +
        '<a id="blank-link" href="test.html" target="_blank">open in a new tab</a>' +
        '<p id="out">fixture used by npm run shot</p></body></html>',
      'utf8'
    );
    const testUrl = require('url').pathToFileURL(testPage).href;
    await win.webContents.executeJavaScript(`window.CHO && CHO.view.load(${JSON.stringify(testUrl)})`, true);
    await sleep(1600);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-web.png'), img.toPNG());

    const tabsReport = await win.webContents.executeJavaScript(
      `(function(){ try { CHO.view.create({}); return CHO.view.list().length; } catch (e) { return e.stack; } })()`,
      true
    );
    console.log('[shot] tabs:', tabsReport);
    await sleep(600);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-tabs.png'), img.toPNG());

    const shortcutReport = await win.webContents.executeJavaScript(
      `(function(){ try {
        const before = CHO.view.list().length;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true }));
        const afterT = CHO.view.list().length;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }));
        const afterW = CHO.view.list().length;
        return { before, afterT, afterW };
      } catch (e) { return e.stack; } })()`,
      true
    );
    console.log('[shot] shortcuts:', JSON.stringify(shortcutReport));

    
    const closeInfo = await win.webContents.executeJavaScript(
      `(function(){
        const tabs = Array.from(document.querySelectorAll('#tab-strip .tab'));
        const target = tabs.find(t => !t.classList.contains('active')) || tabs[0];
        const btn = target.querySelector('.tab-close');
        const r = btn.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: tabs.length };
      })()`,
      true
    );
    win.webContents.sendInputEvent({ type: 'mouseDown', x: closeInfo.x, y: closeInfo.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: closeInfo.x, y: closeInfo.y, button: 'left', clickCount: 1 });
    await sleep(500);
    const afterClose = await win.webContents.executeJavaScript('CHO.view.list().length', true);
    console.log('[shot] close-tab:', JSON.stringify({ before: closeInfo.before, after: afterClose, at: [closeInfo.x, closeInfo.y] }));

    console.log('[shot] step: home');
    await win.webContents.executeJavaScript('window.CHO && CHO.view.goHome(false)', true);
    await sleep(400);
    console.log('[shot] step: settings');
    await win.webContents.executeJavaScript('window.__chozemShot && window.__chozemShot("settings")', true);
    await sleep(1000);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-settings.png'), img.toPNG());

    console.log('[shot] step: plugins');
    await win.webContents.executeJavaScript('window.__chozemShot && window.__chozemShot("plugins")', true);
    await sleep(800);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-plugins.png'), img.toPNG());

    await win.webContents.executeJavaScript('window.__chozemShot && window.__chozemShot("palette")', true);
    await sleep(800);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-palette.png'), img.toPNG());

    const panelsReport = await win.webContents.executeJavaScript(
      `(function(){ try { if (CHO.palette && CHO.palette.ctl) CHO.palette.ctl.close(); CHO.downloads.open(); return 'ok'; } catch (e) { return e.stack; } })()`,
      true
    );
    console.log('[shot] panels:', panelsReport);
    await sleep(700);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-downloads.png'), img.toPNG());

    await win.webContents.executeJavaScript(`CHO.cookies.open({ siteOnly: false })`, true);
    await sleep(800);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-panels.png'), img.toPNG());

    const notesReport = await win.webContents.executeJavaScript(
      `(function(){ try { document.querySelectorAll('#panel-layer .mini').forEach(n => n.remove()); const b = document.querySelector('[data-plugin-button="quick-notes:notes"]'); if (b) b.click(); return 'ok'; } catch (e) { return e.stack; } })()`,
      true
    );
    console.log('[shot] notes:', notesReport);

    const keepReport = await win.webContents.executeJavaScript(
      `(async function(){
        try {
          const dl = CHO.services.get('downloads');
          if (dl) dl.open();
          await new Promise(r => setTimeout(r, 500));
          const before = !!document.querySelector('#mini-downloads');
          await window.chozem.plugins.setEnabled('bookmarks', false);
          await new Promise(r => setTimeout(r, 700));
          const after = !!document.querySelector('#mini-downloads');
          const gone = !document.querySelector('[data-plugin-button="bookmarks:bookmark"]');
          await window.chozem.plugins.setEnabled('bookmarks', true);
          await new Promise(r => setTimeout(r, 500));
          const back = !!document.querySelector('[data-plugin-button="bookmarks:bookmark"]');
          return { before, after, buttonGone: gone, buttonBack: back };
        } catch (e) { return 'ERR ' + e.stack; }
      })()`,
      true
    );
    console.log('[shot] panels-keep:', JSON.stringify(keepReport));

    const modalKeep = await win.webContents.executeJavaScript(
      `(async function(){
        try {
          const svc = CHO.services.get('settings');
          svc.open('plugins');
          await new Promise(r => setTimeout(r, 400));
          const before = !!document.querySelector('.modal.settings');
          await window.chozem.plugins.setEnabled('history', false);
          await new Promise(r => setTimeout(r, 700));
          const after = !!document.querySelector('.modal.settings');
          await window.chozem.plugins.setEnabled('history', true);
          await new Promise(r => setTimeout(r, 400));
          const still = !!document.querySelector('.modal.settings');
          if (svc.ctl) svc.ctl.close();
          return { before, after, still };
        } catch (e) { return 'ERR ' + e.stack; }
      })()`,
      true
    );
    console.log('[shot] modal-keep:', JSON.stringify(modalKeep));
    await sleep(800);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'shot-notes.png'), img.toPNG());

    
    const zipPath = path.join(outDir, 'zip-test.zip');
    if (fs.existsSync(zipPath)) {
      const b64 = fs.readFileSync(zipPath).toString('base64');
      const report = await win.webContents.executeJavaScript(
        `(async () => {
          const bin = atob(${JSON.stringify(b64)});
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const installed = await window.chozem.plugins.installBuffer('zip-test.zip', bytes);
          await CHO.plugins.reload();
          const btn = document.querySelector('[data-plugin-button="zip-test:hello"]');
          const cmd = CHO.plugins.commands.some(c => c.id === 'zip-test:hello');
          const list = await window.chozem.plugins.uninstall('zip-test');
          await CHO.plugins.reload();
          return { id: installed.manifest.id, button: !!btn, command: cmd, remaining: list.length };
        })().catch(e => 'ERR ' + e.stack)`,
        true
      );
      console.log('[shot] zip self-test', JSON.stringify(report));
    }

    const dupReport = await win.webContents.executeJavaScript(
      `(async function(){
        try {
          await Promise.all([CHO.plugins.reload(), CHO.plugins.reload(), CHO.plugins.reload()]);
          await new Promise(r => setTimeout(r, 400));
          const ids = Array.from(document.querySelectorAll('#plugin-buttons [data-plugin-button]')).map(b => b.dataset.pluginButton);
          return { count: ids.length, unique: new Set(ids).size };
        } catch (e) { return 'ERR ' + e.stack; }
      })()`,
      true
    );
    console.log('[shot] duplicate-buttons:', JSON.stringify(dupReport));

    const toggleReport = await win.webContents.executeJavaScript(
      `(async function(){
        try {
          await window.chozem.plugins.setEnabled('downloads', false);
          await CHO.plugins.reload();
          CHO.app.renderChrome();
          const hidden = document.getElementById('btn-download').hidden;
          const noService = !CHO.services.get('downloads');
          await window.chozem.plugins.setEnabled('downloads', true);
          await CHO.plugins.reload();
          CHO.app.renderChrome();
          const shown = !document.getElementById('btn-download').hidden;
          return { hidden, noService, shown };
        } catch (e) { return 'ERR ' + e.stack; }
      })()`,
      true
    );
    console.log('[shot] enable/disable:', JSON.stringify(toggleReport));

    
    const themeZip = path.join(APP_ROOT, 'examples', 'warm-paper.zip');
    if (fs.existsSync(themeZip)) {
      const b64 = fs.readFileSync(themeZip).toString('base64');
      const report = await win.webContents.executeJavaScript(
        `(async function(){
          try {
            const bin = atob(${JSON.stringify(b64)});
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            await window.chozem.plugins.installBuffer('warm-paper.zip', bytes);
            await new Promise(r => setTimeout(r, 200));
            await CHO.plugins.reload();
            await new Promise(r => setTimeout(r, 200));
            const glow = document.querySelector('.home-glow');
            return {
              bodyBg: getComputedStyle(document.body).backgroundColor,
              glow: glow ? getComputedStyle(glow).backgroundImage : 'missing',
              accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
              errors: Array.from(CHO.plugins.errors.entries())
            };
          } catch (e) { return 'ERR ' + e.stack; }
        })()`,
        true
      );
      console.log('[shot] theme-pack:', JSON.stringify(report));
      await sleep(500);
      img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'shot-theme.png'), img.toPNG());
      await win.webContents.executeJavaScript(
        `window.chozem.plugins.uninstall('warm-paper').then(() => CHO.plugins.reload())`,
        true
      );
    }

    
    const brokenZip = path.join(outDir, 'broken-test.zip');
    if (fs.existsSync(brokenZip)) {
      const b64 = fs.readFileSync(brokenZip).toString('base64');
      const report = await win.webContents.executeJavaScript(
        `(async function(){
          try {
            const bin = atob(${JSON.stringify(b64)});
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            await window.chozem.plugins.installBuffer('broken-test.zip', bytes);
            await new Promise(r => setTimeout(r, 200));
            await CHO.plugins.reload();
            const error = CHO.plugins.errors.get('broken-test') || null;
            await window.chozem.plugins.uninstall('broken-test');
            await CHO.plugins.reload();
            return { error };
          } catch (e) { return 'ERR ' + e.stack; }
        })()`,
        true
      );
      console.log('[shot] broken-plugin:', JSON.stringify(report));
    }

    
    const blankReport = await win.webContents.executeJavaScript(
      `(async function(){
        try {
          CHO.view.create({ url: ${JSON.stringify(testUrl)} });
          await new Promise(r => setTimeout(r, 1300));
          const before = CHO.view.list().length;
          await CHO.view.el.executeJavaScript("document.getElementById('blank-link').click()");
          await new Promise(r => setTimeout(r, 1000));
          const after = CHO.view.list().length;
          return { before, after };
        } catch (e) { return 'ERR ' + e.stack; }
      })()`,
      true
    );

    console.log('[shot] target-blank:', JSON.stringify(blankReport));

    
    const apiZip = path.join(outDir, 'api-test.zip');
    if (fs.existsSync(apiZip)) {
      const b64 = fs.readFileSync(apiZip).toString('base64');
      const apiReport = await win.webContents.executeJavaScript(
        `(async function(){
          try {
            const bin = atob(${JSON.stringify(b64)});
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            await window.chozem.plugins.installBuffer('api-test.zip', bytes);
            await new Promise(r => setTimeout(r, 200));
            await CHO.plugins.reload();

            CHO.view.create({ url: ${JSON.stringify(testUrl)} });
            await new Promise(r => setTimeout(r, 1400));

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Y', ctrlKey: true, shiftKey: true, bubbles: true }));
            const shot = window.__apiCapture ? await window.__apiCapture() : null;
            let lockedError = null;
            try { await window.chozem.plugins.setEnabled('settings', false); } catch (e) { lockedError = String(e.message); }
            CHO.app.route('chozem://api-test/sub');

            const settingsSvc = CHO.services.get('settings');
            settingsSvc.open('api-test');
            const navBtn = document.querySelector('button[data-sec="api-test"]');
            const section = document.querySelector('.settings-section[data-sec="api-test"]');
            if (settingsSvc.ctl) settingsSvc.ctl.close();

            return {
              keys: window.__apiTestKeys || 0,
              menuItems: CHO.menuExtras.length,
              route: window.__apiTestRoute || null,
              settingsNav: !!navBtn,
              sectionText: section ? section.textContent.trim() : '',
              netRules: CHO.net.rules.length,
              headers: CHO.net.headers.length,
              contextItems: CHO.contextItems.length,
              badge: CHO.view.list().some(t => t.badge === '9'),
              capture: shot ? shot.length : 0,
              settingsLocked: lockedError && lockedError.includes('核心插件'),
              errors: Array.from(CHO.plugins.errors.entries())
            };
          } catch (e) { return 'ERR ' + e.stack; }
        })()`,
        true
      );
      console.log('[shot] plugin-api:', JSON.stringify(apiReport));
      img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'shot-badge.png'), img.toPNG());
      await win.webContents.executeJavaScript(
        `window.chozem.plugins.uninstall('api-test').then(() => CHO.plugins.reload())`,
        true
      );
    }

    
    const dogZip = path.join(APP_ROOT, 'examples', 'dog-search.zip');
    if (fs.existsSync(dogZip)) {
      const b64 = fs.readFileSync(dogZip).toString('base64');
      const dogReport = await win.webContents.executeJavaScript(
        `(async function(){
          try {
            const bin = atob(${JSON.stringify(b64)});
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            await window.chozem.plugins.installBuffer('dog-search.zip', bytes);
            await new Promise(r => setTimeout(r, 200));
            await CHO.plugins.reload();
            CHO.view.goHome(false);
            await new Promise(r => setTimeout(r, 500));
            const btn = document.querySelector('#home-search .hs-submit');
            const content = btn ? getComputedStyle(btn, '::after').content : '';
            return {
              loaded: !!CHO.plugins.loaded.get('dog-search'),
              content: content.replace(/"/g, ''),
              title: btn ? btn.title : ''
            };
          } catch (e) { return 'ERR ' + e.stack; }
        })()`,
        true
      );
      console.log('[shot] dog-search:', JSON.stringify(dogReport));
      await sleep(400);
      img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'shot-dog.png'), img.toPNG());
      await win.webContents.executeJavaScript(
        `window.chozem.plugins.uninstall('dog-search').then(() => CHO.plugins.reload())`,
        true
      );
    }

    
    const snakeZip = path.join(APP_ROOT, 'examples', 'snake-home.zip');
    if (fs.existsSync(snakeZip)) {
      const b64 = fs.readFileSync(snakeZip).toString('base64');
      const snakeReport = await win.webContents.executeJavaScript(
        `(async function(){
          try {
            const bin = atob(${JSON.stringify(b64)});
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            await window.chozem.plugins.installBuffer('snake-home.zip', bytes);
            await new Promise(r => setTimeout(r, 200));
            await CHO.plugins.reload();
            CHO.view.goHome(false);
            await new Promise(r => setTimeout(r, 800));

            const dock = document.querySelector('.snake-dock');
            const canvas = dock && dock.querySelector('canvas');
            const stage = dock && dock.querySelector('.snake-stage');
            if (!canvas || !stage) return { ok: false };
            canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            const clicked = dock.dataset.state;
            if (dock.dataset.state === 'paused') {
              stage.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
              await new Promise(r => setTimeout(r, 250));
            }
            stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 300));
            return {
              ok: true,
              canvas: [canvas.width, canvas.height],
              clicked,
              after: dock.dataset.state,
              score: dock.dataset.score,
              hint: dock.querySelector('.snake-hint').textContent,
              box: (() => { const r = dock.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; })()
            };
          } catch (e) { return 'ERR ' + e.stack; }
        })()`,
        true
      );
      console.log('[shot] snake:', JSON.stringify(snakeReport));
      await sleep(300);
      img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'shot-snake.png'), img.toPNG());
      await win.webContents.executeJavaScript(
        `window.chozem.plugins.uninstall('snake-home').then(() => CHO.plugins.reload())`,
        true
      );
    }

    console.log('[shot] done');
  } catch (err) {
    console.error('[shot] failed', err && err.stack);
  }
  app.exit(0);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let quitting = false;
app.on('before-quit', (event) => {
  if (settings) settings.flush();
  if (quitting || !browser) return;
  if (settings.get().privacy.clearOnExit) {
    event.preventDefault();
    quitting = true;
    browser.clearOnExitIfNeeded().finally(() => app.quit());
  }
});

process.on('uncaughtException', (err) => {
  console.error('[chozem] uncaught', err);
});
