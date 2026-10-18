'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const LABEL = {
    progressing: '下载中',
    paused: '已暂停',
    completed: '已完成',
    cancelled: '已取消',
    failed: '下载失败',
  };

  const downloads = {
    list: [],
    win: null,
    known: new Set(),
    first: true,

    init() {
      Cho.on('downloads:list', (list) => this.update(list));
      window.chozem.downloads.list().then((list) => this.update(list));
      const btn = U.$('#btn-download');
      if (btn) btn.onclick = () => this.toggle();
    },

    update(list) {
      this.list = Array.isArray(list) ? list : [];
      for (const item of this.list) {
        if (!this.known.has(item.id)) {
          this.known.add(item.id);
          if (!this.first && item.state === 'progressing') {
            U.toast(`开始下载：${item.filename}`);
            if (this.win && this.win.isOpen()) this.win.el.style.zIndex = 58;
          }
        }
      }
      this.first = false;
      this.renderBadge();
      if (this.win && this.win.isOpen()) this.render();
      CHO.bus.emit('downloads', this.list);
    },

    activeCount() {
      return this.list.filter((d) => d.state === 'progressing' || d.state === 'paused').length;
    },

    renderBadge() {
      const badge = U.$('#dl-badge');
      const count = this.activeCount();
      badge.hidden = count === 0;
      badge.textContent = count > 9 ? '9+' : String(count);
      U.$('#btn-download').title = count ? `${count} 个下载进行中` : '下载内容  (Ctrl + J)';
    },

    toggle() {
      if (this.win && this.win.isOpen()) this.win.close();
      else this.open();
    },

    open() {
      if (!this.win || this.win.closed) {
        this.win = new CHO.MiniWindow({
          id: 'downloads',
          title: '下载内容',
          icon: 'download',
          width: 400,
          height: 460,
          onClose: () => {},
        });
        
        this.win.body.style.display = 'flex';
        this.win.body.style.flexDirection = 'column';
      }
      this.win.open();
      this.render();
    },

    async act(id, action) {
      await window.chozem.downloads.action(id, action);
      setTimeout(() => window.chozem.downloads.list().then((list) => this.update(list)), 60);
    },

    render() {
      if (!this.win) return;
      const body = this.win.body;
      body.replaceChildren();

      if (!this.list.length) {
        body.appendChild(
          U.el(
            'div',
            { class: 'empty', style: { flex: '1 1 auto' } },
            U.svg('download'),
            U.el('div', { text: '还没有下载内容' }),
            U.el('div', { text: '网页里的下载会出现在这里', style: { fontSize: '11px', opacity: '0.7' } })
          )
        );
      } else {
        const list = U.el('div', { class: 'mini-list', style: { flex: '0 0 auto' } });
        for (const item of this.list) list.appendChild(this.row(item));
        body.appendChild(list);
      }

      const foot = U.el(
        'div',
        { class: 'mini-foot', style: { marginTop: 'auto' } },
        U.el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          text: '全部清除',
          onclick: async () => {
            await window.chozem.downloads.clear();
          },
        }),
        U.el('span', { style: { flex: '1' } }),
        U.el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          text: '打开下载目录',
          onclick: () => {
            const dir = (CHO.api.info && CHO.api.info.downloadDir) || CHO.api.settings.downloadDir;
            window.chozem.app.showItem(dir);
          },
        })
      );
      body.appendChild(foot);
    },

    row(item) {
      const name = item.filename || '未知文件';
      const done = item.state === 'completed';
      const percent = item.total > 0 ? Math.min(100, Math.round((item.received / item.total) * 100)) : done ? 100 : 0;
      const sizeText = item.total > 0 ? `${U.fmtBytes(item.received)} / ${U.fmtBytes(item.total)}` : U.fmtBytes(item.received);

      const actions = U.el('div', { class: 'dl-actions' });
      const iconBtn = (icon, title, handler, cls) => {
        const btn = U.el('button', { class: 'icon-btn ' + (cls || ''), type: 'button', title, onclick: handler }, U.svg(icon));
        return btn;
      };

      if (item.state === 'progressing') {
        actions.appendChild(iconBtn('pause', '暂停', () => this.act(item.id, 'pause')));
        actions.appendChild(iconBtn('close', '取消', () => this.act(item.id, 'cancel')));
      } else if (item.state === 'paused') {
        actions.appendChild(iconBtn('play', '继续', () => this.act(item.id, 'resume')));
        actions.appendChild(iconBtn('close', '取消', () => this.act(item.id, 'cancel')));
      } else if (done) {
        actions.appendChild(iconBtn('external', '打开文件', () => this.act(item.id, 'open')));
        actions.appendChild(iconBtn('folder', '打开所在文件夹', () => this.act(item.id, 'reveal')));
        actions.appendChild(iconBtn('trash', '从列表移除', () => this.act(item.id, 'remove')));
      } else {
        actions.appendChild(iconBtn('reload', '重新下载', () => CHO.view.load(item.url)));
        actions.appendChild(iconBtn('trash', '从列表移除', () => this.act(item.id, 'remove')));
      }

      const node = U.el(
        'div',
        { class: 'dl-item' },
        U.el('div', { class: 'dl-ico ' + (done ? 'done' : '') }, U.svg(done ? 'check' : 'download')),
        U.el(
          'div',
          { class: 'dl-main' },
          U.el('div', { class: 'dl-name', text: name, title: name }),
          U.el('div', { class: 'dl-meta' }, U.el('span', { text: LABEL[item.state] || item.state }), U.el('span', { text: sizeText })),
          item.state === 'progressing'
            ? U.el('div', { class: 'dl-bar' }, U.el('i', { style: { width: percent + '%' } }))
            : null
        ),
        actions
      );
      return node;
    },
  };

  CHO.downloads = downloads;
  downloads.init();
  try {
    Cho.services.register('downloads', downloads);
    Cho.cleanup(() => { delete CHO.downloads; });
  } catch (_) {}
})();
