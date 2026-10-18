'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.el = function (tag, props, ...children) {
    const node = document.createElement(tag);
    const attrs = props || {};
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'value') node.value = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(3)) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  U.svg = function (name, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  };

  U.esc = (str) =>
    String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  U.debounce = function (fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  U.throttle = function (fn, ms) {
    let last = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const wait = ms - (now - last);
      if (wait <= 0) {
        last = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          fn.apply(this, args);
        }, wait);
      }
    };
  };

  U.fmtBytes = function (bytes) {
    if (!bytes || bytes < 0) return '未知大小';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
  };

  U.fmtTime = function (ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  U.hostOf = function (url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return '';
    }
  };

  U.prettyUrl = function (url) {
    if (!url) return '';
    let out = String(url);
    try {
      out = decodeURI(out);
    } catch (_) {}
    try {
      const u = new URL(out);
      if (u.protocol === 'https:') out = out.replace(/^https:\/\//i, '');
      else if (u.protocol === 'http:') out = out.replace(/^http:\/\//i, '');
      if (out.endsWith('/') && u.pathname === '/' && !u.search && !u.hash) out = out.slice(0, -1);
    } catch (_) {}
    return out;
  };

  U.copy = async function (text) {
    try {
      await window.chozem.app.copy(text);
      U.toast('已复制到剪贴板');
      return true;
    } catch (_) {
      U.toast('复制失败', 'err');
      return false;
    }
  };

  U.toast = function (message, type) {
    const box = U.$('#toasts');
    if (!box) return;
    const node = U.el('div', { class: 'toast' + (type === 'err' ? ' err' : '') }, U.svg(type === 'err' ? 'info' : 'check'), U.el('span', { text: message }));
    box.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 220);
    }, 2600);
    while (box.children.length > 4) box.firstElementChild.remove();
  };

  
  U.matchPattern = function (pattern, url) {
    if (!pattern || pattern === '*') return true;
    const escaped = String(pattern)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      return new RegExp('^' + escaped + '$', 'i').test(url);
    } catch (_) {
      return false;
    }
  };

  U.clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  U.uuid = () => 'x' + Math.random().toString(36).slice(2, 10);

  U.platform = (navigator.platform || '').toLowerCase().includes('mac') ? 'mac' : 'win';

  U.kbd = function (text) {
    return text.split('+').map((k) => U.el('kbd', { text: k.trim() }));
  };

  U.fileUrl = function (absPath) {
    let p = String(absPath).replace(/\\/g, '/');
    if (!p.startsWith('/')) p = '/' + p;
    return 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
  };

  CHO.util = U;
})();
