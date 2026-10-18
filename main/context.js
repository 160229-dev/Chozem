'use strict';
const { Menu, clipboard, nativeImage } = require('electron');

function navState(contents) {
  try {
    const nav = contents.navigationHistory;
    if (nav && typeof nav.canGoBack === 'function') {
      return { back: nav.canGoBack(), forward: nav.canGoForward() };
    }
  } catch (_) {}
  return { back: false, forward: false };
}

function globMatch(pattern, url) {
  if (!pattern || pattern === '*') return true;
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  try {
    return new RegExp('^' + escaped + '$', 'i').test(url || '');
  } catch (_) {
    return false;
  }
}


function popupForWebContents(contents, params, ownerWindow, extras) {
  const template = [];
  const { back, forward } = navState(contents);
  const isLink = !!params.linkURL;

  if (!params.isEditable && !isLink) {
    template.push(
      { label: '后退', enabled: back, click: () => contents.navigationHistory.goBack() },
      { label: '前进', enabled: forward, click: () => contents.navigationHistory.goForward() },
      { label: '刷新', click: () => contents.reload() },
      { type: 'separator' }
    );
  }

  if (isLink) {
    template.push(
      {
        label: '在新标签页打开链接',
        click: () => {
          const host = contents.hostWebContents;
          if (host && !host.isDestroyed()) host.send('webview:open-url', { url: params.linkURL, newTab: true });
        },
      },
      { label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' }
    );
  }

  if (params.mediaType === 'image' && params.srcURL) {
    template.push(
      { label: '图片另存为…', click: () => contents.downloadURL(params.srcURL) },
      { label: '复制图片地址', click: () => clipboard.writeText(params.srcURL) },
      { type: 'separator' }
    );
  }

  if (params.selectionText && params.selectionText.trim()) {
    template.push({ label: '复制', click: () => contents.copy() });
    if (!params.isEditable) {
      template.push({
        label: '用当前搜索引擎搜索',
        click: () => {
          const host = contents.hostWebContents;
          if (host && !host.isDestroyed()) host.send('webview:search-text', params.selectionText.trim());
        },
      });
    }
    template.push({ type: 'separator' });
  }

  if (params.isEditable) {
    template.push(
      { label: '剪切', enabled: params.editFlags.canCut, click: () => contents.cut() },
      { label: '复制', enabled: params.editFlags.canCopy, click: () => contents.copy() },
      { label: '粘贴', enabled: params.editFlags.canPaste, click: () => contents.paste() },
      { label: '全选', click: () => contents.selectAll() },
      { type: 'separator' }
    );
  }

  if (!template.length) {
    template.push({ label: '全选', click: () => contents.selectAll() }, { type: 'separator' });
  }

  const extraItems = (extras || []).filter((item) => item && item.label && globMatch(item.match, params.pageURL));
  if (extraItems.length) {
    template.push({ type: 'separator' });
    for (const item of extraItems) {
      template.push({
        label: item.label,
        click: () => {
          const host = contents.hostWebContents;
          if (host && !host.isDestroyed()) host.send('context:item', { id: item.id });
        },
      });
    }
  }

  template.push({ label: '检查元素', click: () => contents.inspectElement(params.x, params.y) });

  Menu.buildFromTemplate(template).popup({ window: ownerWindow || undefined });
}


function popupForInput(win, params) {
  const template = [
    { role: 'undo', label: '撤销' },
    { role: 'redo', label: '重做' },
    { type: 'separator' },
    { role: 'cut', label: '剪切', enabled: params.editFlags.canCut },
    { role: 'copy', label: '复制', enabled: params.editFlags.canCopy },
    { role: 'paste', label: '粘贴', enabled: params.editFlags.canPaste },
    { role: 'selectAll', label: '全选' },
  ];
  Menu.buildFromTemplate(template).popup({ window: win });
}

module.exports = { popupForWebContents, popupForInput };
