'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const cookies = {
    win: null,
    all: [],
    query: '',
    siteOnly: true,
    loading: false,

    init() {
      Cho.on('cookies:changed', () => {
        if (this.win && this.win.isOpen()) this.load();
      });
      CHO.bus.on('navigate', () => {
        if (this.win && this.win.isOpen() && this.siteOnly) this.load();
      });
    },

    toggle() {
      if (this.win && this.win.isOpen()) this.win.close();
      else this.open();
    },

    open(opts = {}) {
      this.siteOnly = opts.siteOnly !== undefined ? opts.siteOnly : CHO.state.mode === 'web';
      if (!this.win || this.win.closed) {
        this.win = new CHO.MiniWindow({
          id: 'cookies',
          title: 'Cookie',
          icon: 'cookie',
          width: 470,
          height: 500,
        });
        this.win.body.style.display = 'flex';
        this.win.body.style.flexDirection = 'column';
      }
      this.win.open();
      this.renderShell();
      this.load();
    },

    async load() {
      this.loading = true;
      this.renderShell();
      try {
        const url = this.siteOnly ? CHO.state.url : undefined;
        this.all = await window.chozem.cookies.list(url || undefined);
      } catch (err) {
        console.error(err);
        this.all = [];
      }
      this.loading = false;
      this.renderList();
    },

    renderShell() {
      if (!this.win) return;
      const body = this.win.body;
      body.replaceChildren();

      const search = U.el('input', {
        class: 'input',
        placeholder: '按名称或域名过滤',
        value: this.query,
        style: { flex: '1' },
      });
      search.addEventListener('input', () => {
        this.query = search.value.trim().toLowerCase();
        this.renderList();
      });

      const siteToggle = U.el(
        'button',
        { class: 'seg-btn' + (this.siteOnly ? ' active' : ''), type: 'button' },
        U.el('span', { text: this.siteOnly ? '仅当前站点' : '全部站点' })
      );
      siteToggle.addEventListener('click', () => {
        this.siteOnly = !this.siteOnly;
        this.load();
      });

      const bar = U.el(
        'div',
        { class: 'mini-toolbar' },
        search,
        siteToggle,
        U.el('button', { class: 'icon-btn', type: 'button', title: '刷新', onclick: () => this.load() }, U.svg('reload'))
      );
      body.appendChild(bar);
      this.listHost = U.el('div', { class: 'mini-scroll', style: { flex: '1 1 auto', minHeight: '0' } });
      body.appendChild(this.listHost);

      const count = U.el('span', { class: 'mini-count', text: '' });
      this.countEl = count;

      const foot = U.el(
        'div',
        { class: 'mini-foot' },
        count,
        U.el('span', { style: { flex: '1' } }),
        U.el('button', { class: 'btn btn-ghost', type: 'button', text: '导出', onclick: () => this.exportAll() }),
        U.el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          text: '清除站点数据',
          onclick: () =>
            CHO.dialogConfirm({
              title: '清除当前站点的数据？',
              message: '将删除当前站点的 Cookie、LocalStorage、IndexedDB 与缓存，可能会让你退出登录。',
              confirmText: '清除',
              danger: true,
              onConfirm: async () => {
                await window.chozem.cookies.clearSiteData();
                U.toast('站点数据已清除');
                this.load();
              },
            }),
        }),
        U.el('button', {
          class: 'btn btn-danger',
          type: 'button',
          text: '清除全部',
          onclick: () =>
            CHO.dialogConfirm({
              title: '清除全部 Cookie？',
              message: '所有网站的登录状态与偏好都会被清除，且无法恢复。',
              confirmText: '全部清除',
              danger: true,
              onConfirm: async () => {
                await window.chozem.cookies.clear();
                U.toast('全部 Cookie 已清除');
                this.load();
              },
            }),
        })
      );
      body.appendChild(foot);
    },

    filtered() {
      const q = this.query;
      if (!q) return this.all;
      return this.all.filter((c) => c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q));
    },

    renderList() {
      if (!this.listHost) return;
      const host = this.listHost;
      host.replaceChildren();
      const list = this.filtered();

      if (this.countEl) {
        this.countEl.textContent = `${list.length} 条` + (this.siteOnly ? ' · 当前站点' : ' · 全部');
      }

      if (this.loading) {
        host.appendChild(U.el('div', { class: 'empty', text: '正在读取…' }));
        return;
      }
      if (!this.all.length) {
        host.appendChild(
          U.el(
            'div',
            { class: 'empty' },
            U.svg('cookie'),
            U.el('div', { text: this.siteOnly ? '当前站点没有 Cookie' : '还没有任何 Cookie' }),
            this.siteOnly ? U.el('div', { text: '访问网站后这里会出现它的 Cookie', style: { fontSize: '11px', opacity: '.7' } }) : null
          )
        );
        return;
      }
      if (!list.length) {
        host.appendChild(U.el('div', { class: 'empty', text: '没有匹配的 Cookie' }));
        return;
      }

      let currentDomain = null;
      const render = list.slice(0, 400);
      for (const c of render) {
        if (c.domain !== currentDomain) {
          currentDomain = c.domain;
          host.appendChild(U.el('div', { class: 'ck-domain', text: currentDomain }));
        }
        host.appendChild(this.row(c));
      }
      if (list.length > render.length) {
        host.appendChild(U.el('div', { class: 'empty', text: `仅显示前 ${render.length} 条，请用过滤缩小范围` }));
      }
    },

    row(c) {
      const flags = [];
      if (c.secure) flags.push('Secure');
      if (c.httpOnly) flags.push('HttpOnly');
      if (c.session) flags.push('Session');
      if (c.sameSite && c.sameSite !== 'unspecified') flags.push(c.sameSite);

      const del = U.el('button', { class: 'icon-btn', type: 'button', title: '删除此 Cookie' }, U.svg('trash'));
      del.addEventListener('click', async () => {
        const url = (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path;
        await window.chozem.cookies.remove(url, c.name);
        this.all = this.all.filter((x) => !(x.name === c.name && x.domain === c.domain && x.path === c.path));
        this.renderList();
        U.toast(`已删除 ${c.name}`);
      });

      return U.el(
        'div',
        { class: 'ck-row' },
        U.el(
          'div',
          { class: 'ck-main' },
          U.el('div', { class: 'ck-name', text: c.name }),
          U.el('div', { class: 'ck-value', text: c.value || '（空）', title: c.value }),
          U.el('div', { class: 'ck-meta', text: `${c.path} · ${flags.join(' · ') || '普通'}` })
        ),
        del
      );
    },

    async exportAll() {
      const file = await window.chozem.cookies.export();
      if (file) U.toast('已导出 Cookie');
    },
  };

  CHO.cookies = cookies;
  cookies.init();
  try {
    Cho.services.register('cookies', cookies);
    Cho.cleanup(() => { delete CHO.cookies; });
  } catch (_) {}
})();
