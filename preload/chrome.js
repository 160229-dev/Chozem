'use strict';
const { contextBridge, ipcRenderer } = require('electron');

let seq = 0;
const handlers = new Map();

function on(channel, callback) {
  const id = ++seq;
  const listener = (_event, payload) => {
    try {
      callback(payload);
    } catch (err) {
      console.error('[chozem] listener error', channel, err);
    }
  };
  handlers.set(id, { channel, listener });
  ipcRenderer.on(channel, listener);
  return id;
}

function off(id) {
  const entry = handlers.get(id);
  if (!entry) return;
  ipcRenderer.removeListener(entry.channel, entry.listener);
  handlers.delete(id);
}

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('chozem', {
  on,
  off,
  info: () => ipcRenderer.invoke('app:info'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  theme: {
    set: (theme) => ipcRenderer.invoke('theme:set', theme),
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    copy: (text) => ipcRenderer.invoke('app:copy', text),
    showItem: (p) => ipcRenderer.invoke('app:showItem', p),
    pickDownloadDir: () => ipcRenderer.invoke('app:pickDownloadDir'),
    inputMenu: () => ipcRenderer.invoke('shell:inputMenu'),
  },
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    newWindow: (url) => ipcRenderer.invoke('win:new', url),
    state: () => ipcRenderer.invoke('win:state'),
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    action: (id, action) => ipcRenderer.invoke('downloads:action', { id, action }),
    clear: () => ipcRenderer.invoke('downloads:clear'),
  },
  cookies: {
    list: (url) => ipcRenderer.invoke('cookies:list', { url }),
    remove: (url, name) => ipcRenderer.invoke('cookies:remove', { url, name }),
    clear: () => ipcRenderer.invoke('cookies:clear'),
    clearSiteData: () => ipcRenderer.invoke('cookies:clearSiteData'),
    export: () => ipcRenderer.invoke('cookies:export'),
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    source: (id) => ipcRenderer.invoke('plugins:source', { id }),
    setEnabled: (id, enabled) => ipcRenderer.invoke('plugins:setEnabled', { id, enabled }),
    uninstall: (id) => ipcRenderer.invoke('plugins:uninstall', { id }),
    reveal: (id) => ipcRenderer.invoke('plugins:reveal', { id }),
    openFolder: () => ipcRenderer.invoke('plugins:openFolder'),
    installDialog: () => ipcRenderer.invoke('plugins:installDialog'),
    installPath: (zipPath) => ipcRenderer.invoke('plugins:installPath', { path: zipPath }),
    installBuffer: (name, data) => ipcRenderer.invoke('plugins:installBuffer', { name, data }),
    skill: () => ipcRenderer.invoke('plugins:skill'),
    asset: (id, name) => ipcRenderer.invoke('plugins:asset', { id, name }),
  },
  perm: {
    respond: (payload) => ipcRenderer.invoke('perm:respond', payload),
  },
  keys: {
    sync: (combos) => ipcRenderer.invoke('keys:sync', combos),
  },
  net: {
    sync: (rules) => ipcRenderer.invoke('net:setRules', rules),
    syncHeaders: (rules) => ipcRenderer.invoke('net:setHeaders', rules),
  },
  system: {
    notify: (payload) => ipcRenderer.invoke('system:notify', payload),
    readClipboard: () => ipcRenderer.invoke('system:readClipboard'),
    saveText: (payload) => ipcRenderer.invoke('file:saveText', payload),
    setTitle: (title) => ipcRenderer.invoke('win:setTitle', title),
  },
  page: {
    capture: (id) => ipcRenderer.invoke('page:capture', { id }),
    print: (id) => ipcRenderer.invoke('page:print', { id }),
  },
  context: {
    setItems: (items) => ipcRenderer.invoke('context:setItems', items),
  },
});
