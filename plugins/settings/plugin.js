'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const SECTIONS = [
    { id: 'general', title: '通用', icon: 'settings' },
    { id: 'privacy', title: '隐私', icon: 'shield' },
    { id: 'downloads', title: '下载', icon: 'download' },
    { id: 'plugins', title: '插件', icon: 'puzzle' },
    { id: 'about', title: '关于', icon: 'info' },
  ];

  function row(label, desc, ctrl, extra) {
    const text = U.el(
      'div',
      { class: 'srow-text' },
      U.el('div', { class: 'srow-label', text: label }),
      desc ? U.el('div', { class: 'srow-desc', text: desc }) : null
    );
    return U.el('div', { class: 'srow' + (ctrl ? '' : ' block') }, text, ctrl ? U.el('div', { class: 'srow-ctrl' }, ctrl, extra) : null);
  }

  function sw(on, onChange) {
    const btn = U.el('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false' });
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('on');
      btn.classList.toggle('on', next);
      btn.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next);
    });
    return btn;
  }

  function selectEl(options, value, onChange) {
    const sel = U.el('select', { class: 'select' });
    for (const opt of options) {
      const o = U.el('option', { value: opt.value, text: opt.label });
      if (String(opt.value) === String(value)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function seg(items, value, onChange) {
    const box = U.el('div', { class: 'seg' });
    for (const item of items) {
      const btn = U.el('button', { class: 'seg-btn' + (item.value === value ? ' active' : ''), type: 'button', text: item.label });
      btn.addEventListener('click', () => {
        U.$$('button', box).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(item.value);
      });
      box.appendChild(btn);
    }
    return box;
  }

  const settingsUI = {
    ctl: null,
    section: 'general',
    navEl: null,
    mainEl: null,
    hosts: {},
    extraSections: [],

    allSections() {
      return SECTIONS.concat(this.extraSections);
    },

    addSection(sec = {}) {
      if (!sec.id) throw new Error('设置页需要 id');
      if (this.allSections().some((s) => s.id === sec.id)) throw new Error('设置页 id 重复：' + sec.id);
      const entry = {
        id: sec.id,
        title: sec.title || sec.id,
        icon: sec.icon || 'puzzle',
        render: sec.render,
        owner: sec.owner,
        custom: true,
      };
      this.extraSections.push(entry);
      if (this.ctl) {
        const btn = this.makeNavButton(entry);
        this.navEl.appendChild(btn);
        const host = U.el('section', { class: 'settings-section', dataset: { sec: entry.id } });
        this.mainEl.appendChild(host);
        this.hosts[entry.id] = host;
        this.renderCustom(entry, host);
      }
      return () => this.removeSection(entry.id);
    },

    removeSection(id) {
      const index = this.extraSections.findIndex((s) => s.id === id);
      if (index < 0) return;
      this.extraSections.splice(index, 1);
      if (this.hosts[id]) {
        this.hosts[id].remove();
        delete this.hosts[id];
      }
      if (this.navEl) {
        const btn = U.$(`button[data-sec="${id}"]`, this.navEl);
        if (btn) btn.remove();
      }
      if (this.section === id) this.select('general');
    },

    makeNavButton(sec) {
      const btn = U.el('button', { type: 'button', dataset: { sec: sec.id } }, U.svg(sec.icon), U.el('span', { text: sec.title }));
      btn.addEventListener('click', () => this.select(sec.id));
      return btn;
    },

    renderCustom(sec, host) {
      if (!sec.render) return;
      host.replaceChildren();
      try {
        sec.render(host, { close: () => this.ctl && this.ctl.close() });
      } catch (err) {
        console.error(err);
        host.appendChild(U.el('div', { class: 'empty', text: '设置页渲染失败：' + err.message }));
      }
    },

    open(section) {
      if (section) this.section = section;
      if (this.ctl) {
        this.select(this.section);
        return;
      }

      const grid = U.el('div', { class: 'settings-grid' });
      const nav = U.el('nav', { class: 'settings-nav' });
      const main = U.el('div', { class: 'settings-main' });
      grid.append(nav, main);
      this.navEl = nav;
      this.mainEl = main;
      this.hosts = {};

      for (const sec of this.allSections()) {
        nav.appendChild(this.makeNavButton(sec));
        const host = U.el('section', { class: 'settings-section', dataset: { sec: sec.id } });
        main.appendChild(host);
        this.hosts[sec.id] = host;
        if (sec.custom) this.renderCustom(sec, host);
      }

      const info = CHO.api.info || {};
      nav.appendChild(
        U.el('div', {
          class: 'nav-foot',
          text: `Chozem ${info.version || ''}\nChromium ${String(info.chrome || '').split('.')[0]}`,
          style: { whiteSpace: 'pre-line' },
        })
      );

      this.renderAll();

      this.ctl = CHO.modal.open({
        title: '设置',
        icon: 'settings',
        className: 'settings',
        body: grid,
        bodyClass: 'settings-grid',
        onClose: () => {
          this.ctl = null;
        },
      });

      this.select(this.section);
    },

    select(id) {
      this.section = id;
      for (const btn of U.$$('button', this.navEl)) {
        btn.classList.toggle('active', btn.dataset.sec === id);
      }
      for (const key of Object.keys(this.hosts)) {
        this.hosts[key].classList.toggle('active', key === id);
      }
      this.mainEl.scrollTop = 0;
    },

    renderAll() {
      this.renderGeneral(this.hosts.general);
      this.renderPrivacy(this.hosts.privacy);
      this.renderDownloads(this.hosts.downloads);
      this.renderPlugins(this.hosts.plugins);
      this.renderAbout(this.hosts.about);
    },

    

    renderGeneral(host) {
      const s = CHO.api.settings;
      host.replaceChildren();
      host.append(
        U.el('h2', { text: '通用' }),
        U.el('p', { class: 'section-desc', text: '搜索、外观与页面显示的默认行为。' })
      );

      const engineOptions = s.engines.map((e) => ({ value: e.id, label: e.name }));
      host.appendChild(
        row(
          '默认搜索引擎',
          '新标签页、地址栏输入非网址内容时使用。',
          selectEl(engineOptions, s.searchEngine, (value) => this.patch({ searchEngine: value }))
        )
      );

      const custom = s.engines.filter((e) => !e.builtin);
      const engineBox = U.el('div', { class: 'engine-list' });
      for (const engine of custom) {
        engineBox.appendChild(
          U.el(
            'div',
            { class: 'engine-item' },
            U.el('span', { class: 'engine-item-name', text: engine.name }),
            U.el('span', { class: 'engine-item-url', text: engine.url, title: engine.url }),
            U.el(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                title: '删除',
                onclick: () => this.removeEngine(engine.id),
              },
              U.svg('trash')
            )
          )
        );
      }
      const addBtn = U.el('button', { class: 'btn btn-ghost', type: 'button' }, U.svg('plus'), U.el('span', { text: '添加自定义搜索引擎' }));
      addBtn.addEventListener('click', () => this.addEngineDialog());
      engineBox.appendChild(addBtn);
      host.appendChild(U.el('div', { class: 'srow block' }, engineBox));

      host.appendChild(
        row(
          '主题',
          '跟随系统会自动响应操作系统的深浅色设置。',
          seg(
            [
              { value: 'system', label: '跟随系统' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ],
            s.theme,
            (value) => this.setTheme(value)
          )
        )
      );

      host.appendChild(
        row(
          '页面缩放',
          '对所有网页生效，也可以按 Ctrl + 加减号临时调整。',
          selectEl(
            [80, 90, 100, 110, 125, 150].map((n) => ({ value: n, label: n + '%' })),
            Math.round((CHO.state.zoom || 1) * 100),
            (value) => {
              const zoom = Number(value) / 100;
              CHO.view.setZoom(zoom);
              this.patch({ zoom });
            }
          )
        )
      );
    },

    async patch(patch) {
      try {
        await CHO.api.setSettings(patch);
      } catch (err) {
        U.toast('保存失败：' + err.message, 'err');
      }
    },

    async setTheme(theme) {
      await CHO.api.setTheme(theme);
      this.patch({ theme });
    },

    removeEngine(id) {
      const s = CHO.api.settings;
      const engines = s.engines.filter((e) => e.id !== id);
      this.patch({ engines }).then(() => this.renderGeneral(this.hosts.general));
      U.toast('已删除搜索引擎');
    },

    addEngineDialog() {
      const nameInput = U.el('input', { class: 'input', placeholder: '例如：知乎', style: { width: '100%' } });
      const urlInput = U.el('input', { class: 'input', placeholder: 'https://www.zhihu.com/search?q={q}', style: { width: '100%' } });
      const wrap = U.el(
        'div',
        { class: 'form-wrap' },
        U.el('label', { class: 'form-label', text: '名称' }),
        nameInput,
        U.el('label', { class: 'form-label', text: '搜索地址（用 {q} 代表关键词）' }),
        urlInput,
        U.el('p', { class: 'form-hint', text: '在目标网站搜索一次，把地址栏里的关键词替换成 {q} 即可。' })
      );
      const foot = U.el('div', { class: 'confirm-foot' });
      wrap.appendChild(foot);

      const ctl = CHO.modal.open({ title: '添加搜索引擎', icon: 'plus', className: 'confirm', body: wrap, bodyClass: 'form-body', width: 460 });
      const cancel = U.el('button', { class: 'btn', type: 'button', text: '取消', onclick: () => ctl.close() });
      const ok = U.el('button', { class: 'btn btn-primary', type: 'button', text: '添加' });
      ok.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        if (!name || !url) return U.toast('名称和地址都要填', 'err');
        if (!/\{q\}/.test(url)) return U.toast('地址里需要包含 {q}', 'err');
        const id = 'custom-' + Date.now().toString(36);
        const engines = CHO.api.settings.engines.concat([
          { id, name, url, short: name.slice(0, 1), builtin: false },
        ]);
        await this.patch({ engines });
        ctl.close();
        this.renderGeneral(this.hosts.general);
        U.toast(`已添加 ${name}`);
      });
      foot.append(cancel, ok);
      setTimeout(() => nameInput.focus(), 60);
    },

    

    renderPrivacy(host) {
      const p = CHO.api.settings.privacy;
      host.replaceChildren();
      host.append(U.el('h2', { text: '隐私' }), U.el('p', { class: 'section-desc', text: 'Cookie 与会话数据完全存放在本机，默认不上传任何信息。' }));

      host.appendChild(
        row(
          '阻止第三方 Cookie',
          '跨站请求不携带 Cookie。开启后少数网站可能无法保持登录（实验性）。',
          sw(p.blockThirdPartyCookies, (value) => this.patch({ privacy: { blockThirdPartyCookies: value } }))
        )
      );
      host.appendChild(
        row('发送 Do Not Track', '在请求头中附加 DNT: 1，表达不跟踪的偏好。', sw(p.doNotTrack, (value) => this.patch({ privacy: { doNotTrack: value } })))
      );
      host.appendChild(
        row('退出时清除浏览数据', '退出 Chozem 时删除 Cookie 与站点存储。', sw(p.clearOnExit, (value) => this.patch({ privacy: { clearOnExit: value } })))
      );

      const openCookies = U.el('button', { class: 'btn', type: 'button' }, U.svg('cookie'), U.el('span', { text: '打开 Cookie 管理器' }));
      openCookies.addEventListener('click', () => {
        this.ctl && this.ctl.close();
        (CHO.cookies || {}).open && setTimeout(() => CHO.cookies.open({ siteOnly: false }), 120);
      });
      host.appendChild(row('Cookie', '查看、删除、导出每个站点的 Cookie。', openCookies));

      const clearBtn = U.el('button', { class: 'btn btn-danger', type: 'button', text: '清除全部数据' });
      clearBtn.addEventListener('click', () =>
        CHO.dialogConfirm({
          title: '清除全部浏览数据？',
          message: 'Cookie、LocalStorage、IndexedDB 与缓存都会被删除，所有网站将退出登录。',
          confirmText: '清除',
          danger: true,
          onConfirm: async () => {
            await window.chozem.cookies.clearSiteData();
            U.toast('浏览数据已清除');
          },
        })
      );
      host.appendChild(row('清除数据', '立即删除本机保存的所有站点数据。', clearBtn));
    },

    

    renderDownloads(host) {
      const s = CHO.api.settings;
      host.replaceChildren();
      host.append(U.el('h2', { text: '下载' }), U.el('p', { class: 'section-desc', text: '文件默认保存到系统下载目录，也可以指定其他位置。' }));

      const dirText = U.el('span', { class: 'path-text', text: s.downloadDir || (CHO.api.info && CHO.api.info.downloadDir) || '系统下载目录' });
      const pick = U.el('button', { class: 'btn', type: 'button', text: '更改…' });
      pick.addEventListener('click', async () => {
        const dir = await window.chozem.app.pickDownloadDir();
        if (dir) {
          dirText.textContent = dir;
          U.toast('下载目录已更新');
        }
      });
      host.appendChild(row('下载目录', '新下载的文件会保存到这里。', U.el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, dirText, pick)));

      host.appendChild(
        row('下载前询问保存位置', '关闭时自动按原文件名保存，重名会自动追加序号。', sw(s.askWhereToSave, (value) => this.patch({ askWhereToSave: value })))
      );

      const openPanel = U.el('button', { class: 'btn', type: 'button' }, U.svg('download'), U.el('span', { text: '打开下载面板' }));
      openPanel.addEventListener('click', () => {
        this.ctl && this.ctl.close();
        (CHO.downloads || {}).open && setTimeout(() => CHO.downloads.open(), 100);
      });
      host.appendChild(row('下载列表', '查看进度、暂停、打开文件所在位置。', openPanel));
    },

    

    async renderPlugins(host) {
      if (!host) return;
      host.replaceChildren();
      host.append(
        U.el('h2', { text: '插件' }),
        U.el('p', { class: 'section-desc', text: '插件可以改变界面布局、增加按钮、面板、搜索源，甚至改写网页样式。每个插件都是一个 ZIP。' })
      );

      const install = U.el('button', { class: 'btn btn-primary', type: 'button' }, U.svg('plus'), U.el('span', { text: '安装 ZIP 插件' }));
      install.addEventListener('click', () => this.installPlugin());

      const folder = U.el('button', { class: 'btn', type: 'button' }, U.svg('folder'), U.el('span', { text: '打开插件目录' }));
      folder.addEventListener('click', () => window.chozem.plugins.openFolder());

      const reload = U.el('button', { class: 'btn', type: 'button' }, U.svg('reload'), U.el('span', { text: '重新加载' }));
      reload.addEventListener('click', async () => {
        await CHO.plugins.reload();
        this.renderPlugins(this.hosts.plugins);
        U.toast('插件已重新加载');
      });

      host.appendChild(
        U.el(
          'div',
          { class: 'plugin-toolbar' },
          install,
          folder,
          reload,
          U.el('span', { class: 'plugin-hint', text: '也可以把 ZIP 直接拖进窗口' })
        )
      );

      const list = CHO.plugins.list || [];
      if (!list.length) {
        host.appendChild(
          U.el(
            'div',
            { class: 'empty' },
            U.svg('puzzle'),
            U.el('div', { text: '还没有安装插件' }),
            U.el('div', { text: '把插件 ZIP 拖进窗口即可安装', style: { fontSize: '11px', opacity: '.7' } })
          )
        );
        return;
      }

      const wrap = U.el('div', { class: 'plugin-list' });
      for (const plugin of list) {
        wrap.appendChild(this.pluginCard(plugin));
      }
      host.appendChild(wrap);
    },

    pluginCard(plugin) {
      const card = U.el('div', { class: 'plugin-card' + (plugin.enabled ? '' : ' disabled') });
      const avatar = U.el('div', { class: 'plugin-avatar' });
      if (plugin.icon && /^[a-z0-9-]+$/i.test(plugin.icon) && U.$('#i-' + plugin.icon)) {
        avatar.appendChild(U.svg(plugin.icon));
      } else if (plugin.icon) {
        const img = U.el('img', { src: U.fileUrl(plugin.dir + '\\' + plugin.icon), alt: '' });
        img.addEventListener('error', () => {
          avatar.replaceChildren(document.createTextNode(plugin.name.slice(0, 1)));
        });
        avatar.appendChild(img);
      } else {
        avatar.textContent = plugin.name.slice(0, 1);
      }

      const loadError = CHO.plugins.errors && CHO.plugins.errors.get(plugin.id);
      const info = U.el(
        'div',
        { class: 'plugin-info' },
        U.el(
          'div',
          { class: 'plugin-name' },
          U.el('span', { text: plugin.name }),
          U.el('span', { class: 'plugin-badge' + (plugin.enabled ? ' on' : ''), text: plugin.enabled ? '已启用' : '已停用' }),
          plugin.builtin ? U.el('span', { class: 'plugin-badge', text: '内置' }) : null,
          loadError ? U.el('span', { class: 'plugin-badge err', text: '加载失败' }) : null
        ),
        plugin.description ? U.el('div', { class: 'plugin-desc', text: plugin.description }) : null,
        loadError ? U.el('div', { class: 'plugin-error', text: loadError }) : null,
        U.el('div', {
          class: 'plugin-meta',
          text: `v${plugin.version}${plugin.author ? ' · ' + plugin.author : ''} · ${plugin.id}`,
        })
      );

      const actions = U.el('div', { class: 'plugin-actions' });
      if (plugin.locked) {
        actions.appendChild(U.el('span', { class: 'plugin-lock', title: '核心插件，不能停用', text: '必需' }));
      } else {
        actions.appendChild(
          sw(plugin.enabled, async (value) => {
            try {
              await window.chozem.plugins.setEnabled(plugin.id, value);
              this.renderPlugins(this.hosts.plugins);
              U.toast(value ? `已启用 ${plugin.name}` : `已停用 ${plugin.name}`);
            } catch (err) {
              U.toast('操作失败：' + err.message, 'err');
            }
          })
        );
      }

      if (!plugin.builtin) {
        const del = U.el('button', { class: 'btn btn-danger', type: 'button', text: '卸载' });
        del.addEventListener('click', () =>
          CHO.dialogConfirm({
            title: `卸载「${plugin.name}」？`,
            message: '插件文件夹会从本机删除，无法恢复。',
            confirmText: '卸载',
            danger: true,
            onConfirm: async () => {
              await window.chozem.plugins.uninstall(plugin.id);
              this.renderPlugins(this.hosts.plugins);
              U.toast('插件已卸载');
            },
          })
        );
        actions.appendChild(del);
      }

      const reveal = U.el('button', { class: 'btn btn-ghost', type: 'button', text: '文件夹' });
      reveal.addEventListener('click', () => window.chozem.plugins.reveal(plugin.id));
      actions.appendChild(reveal);

      card.append(avatar, info, actions);
      return card;
    },

    async installPlugin() {
      try {
        const res = await window.chozem.plugins.installDialog();
        if (!res || res.canceled) return;
        this.renderPlugins(this.hosts.plugins);
        U.toast(`已安装 ${res.manifest.name}`);
      } catch (err) {
        U.toast('安装失败：' + String(err.message || err).replace(/^Error:\s*/, ''), 'err');
      }
    },

    

    renderAbout(host) {
      const info = CHO.api.info || {};
      host.replaceChildren();
      const hero = U.el(
        'div',
        { class: 'about-hero' },
        U.el('img', { src: 'assets/icon-128.png', alt: 'Chozem' }),
        U.el('div', {}, U.el('h3', { text: 'Chozem' }), U.el('p', { text: '极简浏览器 · 一切皆插件' }))
      );
      host.appendChild(hero);

      const meta = U.el('dl', { class: 'meta-grid' });
      const add = (k, v) => meta.append(U.el('dt', { text: k }), U.el('dd', { text: v || '—' }));
      add('版本', info.version);
      add('Chromium', info.chrome);
      add('Electron', info.electron);
      add('Node', info.node);
      add('平台', `${info.platform} ${info.arch}`);
      add('用户数据', info.userData);
      add('插件目录', info.pluginsDir);
      add('User Agent', info.userAgent);
      host.appendChild(meta);

      const kb = U.el('div', { class: 'kbd-table' });
      const pairs = [
        ['聚焦地址栏', 'Ctrl + L'],
        ['刷新页面', 'Ctrl + R'],
        ['前进 / 后退', 'Alt + ← / →'],
        ['命令面板', 'Ctrl + K'],
        ['下载内容', 'Ctrl + J'],
        ['页内查找', 'Ctrl + F'],
        ['设置', 'Ctrl + ,'],
        ['开发者工具', 'Ctrl + Shift + I'],
        ['缩放', 'Ctrl + + / - / 0'],
        ['关闭浮层', 'Esc'],
      ];
      for (const [label, key] of pairs) kb.append(U.el('span', { text: label }), U.el('b', { text: key }));
      host.appendChild(U.el('h2', { text: '快捷键', style: { fontSize: '13px', marginTop: '20px' } }));
      host.appendChild(kb);

      const actions = U.el('div', { class: 'plugin-toolbar', style: { marginTop: '22px' } });
      const dataBtn = U.el('button', { class: 'btn', type: 'button' }, U.svg('folder'), U.el('span', { text: '打开数据目录' }));
      dataBtn.addEventListener('click', () => {
        if (info.userData) window.chozem.app.showItem(info.userData);
      });
      actions.append(dataBtn);
      host.appendChild(actions);
    },
  };

  window.__chozemShot = function (which) {
    if (which === 'settings') settingsUI.open('general');
    if (which === 'plugins') settingsUI.open('plugins');
    if (which === 'palette') {
      if (settingsUI.ctl) settingsUI.ctl.close();
      if (CHO.palette) CHO.palette.open();
    }
  };

  CHO.settingsUI = settingsUI;
  try {
    Cho.services.register('settings', settingsUI);

    
    if (CHO.pendingSections && CHO.pendingSections.length) {
      const pending = CHO.pendingSections.splice(0);
      for (const entry of pending) {
        try {
          entry.off = settingsUI.addSection(entry.opts);
        } catch (err) {
          console.error('[settings] pending section failed', err);
        }
      }
    }

    Cho.cleanup(() => {
      if (settingsUI.ctl) settingsUI.ctl.close();
      delete CHO.settingsUI;
    });
  } catch (_) {}
  window.__CHozemOpenSettings = () => settingsUI.open('general');
})();
