'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  

  const escStack = [];

  function pushEsc(fn) {
    escStack.push(fn);
    return () => {
      const i = escStack.indexOf(fn);
      if (i >= 0) escStack.splice(i, 1);
    };
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !escStack.length) return;
      e.preventDefault();
      e.stopPropagation();
      const fn = escStack[escStack.length - 1];
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    },
    true
  );

  

  const menu = {
    el: null,
    release: null,

    show({ anchor, x, y, items, width, align }) {
      this.hide();
      const node = U.el('div', { class: 'menu' });
      if (width) node.style.width = width + 'px';

      for (const item of items) {
        if (item.sep) {
          node.appendChild(U.el('div', { class: 'mi-sep' }));
          continue;
        }
        if (item.node) {
          node.appendChild(item.node);
          continue;
        }
        const button = U.el('button', { class: 'mi', type: 'button', disabled: item.disabled });
        if (item.badge) {
          button.appendChild(U.el('span', { class: 'sg-icon', text: item.badge, style: { width: '20px', height: '20px', fontSize: '10px' } }));
        } else if (item.icon) {
          button.appendChild(U.svg(item.icon));
        }
        button.appendChild(U.el('span', { text: item.label }));
        if (item.checked) button.appendChild(U.svg('check', 'mi-check'));
        if (item.kbd) button.appendChild(U.el('span', { class: 'mi-kbd', text: item.kbd }));
        if (item.checked) button.style.color = 'var(--accent)';
        button.addEventListener('click', () => {
          this.hide();
          try {
            item.onClick && item.onClick();
          } catch (err) {
            console.error(err);
            U.toast('操作失败：' + err.message, 'err');
          }
        });
        node.appendChild(button);
      }

      document.body.appendChild(node);
      this.el = node;

      let left;
      let top;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        left = align === 'right' ? rect.right - node.offsetWidth : rect.left;
        top = rect.bottom + 8;
      } else {
        left = x || 0;
        top = y || 0;
      }
      left = U.clamp(left, 8, window.innerWidth - node.offsetWidth - 8);
      top = U.clamp(top, 8, window.innerHeight - node.offsetHeight - 8);
      node.style.left = left + 'px';
      node.style.top = top + 'px';
      node.style.position = 'fixed';

      const close = (e) => {
        if (node.contains(e.target)) return;
        this.hide();
      };
      const timer = setTimeout(() => document.addEventListener('mousedown', close), 0);
      this.release = () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', close);
      };
      const offEsc = pushEsc(() => this.hide());
      const prevRelease = this.release;
      this.release = () => {
        prevRelease();
        offEsc();
      };
      window.addEventListener('resize', () => this.hide(), { once: true });
      window.addEventListener('wheel', () => this.hide(), { once: true, passive: true });
    },

    hide() {
      if (this.el) {
        this.el.remove();
        this.el = null;
      }
      if (this.release) {
        this.release();
        this.release = null;
      }
    },
  };

  

  const modal = {
    stack: [],

    open(opts) {
      const root = U.$('#overlay-root');
      const scrim = U.el('div', { class: 'scrim' });
      const box = U.el('div', { class: 'modal ' + (opts.className || '') });
      let controllerCloseBtn = null;
      if (opts.width) box.style.width = typeof opts.width === 'number' ? opts.width + 'px' : opts.width;
      if (opts.height) box.style.height = typeof opts.height === 'number' ? opts.height + 'px' : opts.height;

      if (opts.head !== false) {
        const head = U.el('div', { class: 'modal-head' });
        if (opts.icon) head.appendChild(U.svg(opts.icon));
        head.appendChild(U.el('div', { class: 'modal-title', text: opts.title || '' }));
        if (opts.headExtra) head.appendChild(opts.headExtra);
        const closeBtn = U.el('button', { class: 'mini-close', type: 'button', title: '关闭' }, U.svg('close'));
        head.appendChild(closeBtn);
        box.appendChild(head);
        controllerCloseBtn = closeBtn;
      }

      let body;
      if (opts.body && opts.body.nodeType) {
        body = opts.body;
      } else {
        body = U.el('div', { class: 'modal-body' });
        if (typeof opts.body === 'string') body.innerHTML = opts.body;
      }
      body.classList.add(opts.bodyClass || 'modal-body');
      box.appendChild(body);

      root.replaceChildren(scrim, box);
      root.classList.add('open');

      const controller = {
        el: box,
        body,
        close: () => this.close(controller),
      };

      const onScrim = () => (opts.dismissible === false ? null : controller.close());
      scrim.addEventListener('click', onScrim);
      if (controllerCloseBtn) controllerCloseBtn.addEventListener('click', () => controller.close());
      const offEsc = pushEsc(() => controller.close());

      controller._cleanup = () => {
        offEsc();
        if (opts.onClose) {
          try {
            opts.onClose();
          } catch (err) {
            console.error(err);
          }
        }
        const i = this.stack.indexOf(controller);
        if (i >= 0) this.stack.splice(i, 1);
      };

      this.stack.push(controller);
      if (opts.onMount) opts.onMount(controller);
      return controller;
    },

    close(controller) {
      const target = controller || this.stack[this.stack.length - 1];
      if (!target) return;
      target._cleanup();
      const root = U.$('#overlay-root');
      root.replaceChildren();
      root.classList.remove('open');
      if (this.stack.length) {
        
      }
    },

    isOpen() {
      return this.stack.length > 0;
    },
  };

  

  let miniSeq = 0;

  class MiniWindow {
    constructor(opts) {
      this.opts = opts;
      this.id = opts.id || `mini-${++miniSeq}`;
      this.closed = false;

      const head = U.el('div', { class: 'mini-head' });
      if (opts.icon) head.appendChild(U.svg(opts.icon));
      this.titleEl = U.el('div', { class: 'mini-title' }, opts.title || '');
      head.appendChild(this.titleEl);
      this.closeBtn = U.el('button', { class: 'mini-close', type: 'button', title: '关闭' }, U.svg('close'));
      head.appendChild(this.closeBtn);

      this.body = U.el('div', { class: 'mini-body' });
      this.el = U.el('div', { class: 'mini ' + (opts.className || '') }, head, this.body);
      this.el.id = 'mini-' + this.id;
      this.el.style.width = (opts.width || 340) + 'px';
      this.el.style.height = (opts.height || 420) + 'px';
      this.head = head;

      this.closeBtn.addEventListener('click', () => this.close());
      this._bindDrag(head);

      this._offEsc = null;
      if (opts.modalEsc !== false) this._offEsc = pushEsc(() => this.close());
    }

    _bindDrag(handle) {
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;
      let dragging = false;

      handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.el.getBoundingClientRect();
        originX = rect.left;
        originY = rect.top;
        handle.setPointerCapture(e.pointerId);
        this.el.style.transition = 'none';
      });

      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const maxX = window.innerWidth - this.el.offsetWidth - 6;
        const maxY = window.innerHeight - this.el.offsetHeight - 6;
        const x = U.clamp(originX + e.clientX - startX, 6, Math.max(6, maxX));
        const y = U.clamp(originY + e.clientY - startY, 50, Math.max(50, maxY));
        this.el.style.left = x + 'px';
        this.el.style.top = y + 'px';
        this.el.style.right = 'auto';
      });

      const end = (e) => {
        if (!dragging) return;
        dragging = false;
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch (_) {}
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }

    setTitle(text) {
      this.titleEl.textContent = text;
    }

    setIcon(name) {
      const old = this.titleEl.querySelector('svg');
      if (old) old.remove();
      if (name) this.titleEl.prepend(U.svg(name));
    }

    open() {
      if (this.closed) return this;
      const layer = U.$('#panel-layer');
      layer.appendChild(this.el);
      if (!this.el.style.left) {
        const offset = layer.querySelectorAll('.mini').length - 1;
        const right = 20 + (offset % 4) * 34;
        const top = 62 + (offset % 6) * 32;
        this.el.style.right = right + 'px';
        this.el.style.top = top + 'px';
      }
      this.el.style.display = 'flex';
      return this;
    }

    close() {
      this.closed = true;
      if (this._offEsc) this._offEsc();
      this.el.remove();
      if (this.opts.onClose) {
        try {
          this.opts.onClose();
        } catch (err) {
          console.error(err);
        }
      }
    }

    toggle() {
      if (this.closed) {
        this.closed = false;
        this._offEsc = this.opts.modalEsc === false ? null : pushEsc(() => this.close());
        return this.open();
      }
      this.close();
      return this;
    }

    isOpen() {
      return !this.closed && this.el.isConnected;
    }
  }

  

  const perm = {
    queue: [],
    current: null,

    init() {
      window.chozem.on('perm:ask', (req) => {
        this.queue.push(req);
        this.next();
      });
    },

    next() {
      if (this.current || !this.queue.length) return;
      this.current = this.queue.shift();
      this.render(this.current);
    },

    render(req) {
      this.destroy();
      const isCookie = req.permission === 'cookies';
      const remember = U.el('input', { type: 'checkbox' });
      const card = U.el(
        'div',
        { class: 'perm-card', id: 'perm-card' },
        U.el(
          'div',
          { class: 'perm-head' },
          U.svg(isCookie ? 'cookie' : 'shield'),
          U.el('span', { text: isCookie ? 'Cookie 权限' : '权限请求' })
        ),
        U.el(
          'div',
          { class: 'perm-body' },
          isCookie ? '允许此网站保存 Cookie？之后访问会自动带上。' : `${req.origin} 请求${req.label}`,
          U.el('div', { class: 'perm-origin', text: req.origin })
        ),
        U.el(
          'div',
          { class: 'perm-actions' },
          isCookie
            ? U.el('span', { class: 'perm-remember', text: '此选择会被记住' })
            : U.el('label', { class: 'perm-remember' }, remember, U.el('span', { text: '记住此站点' })),
          U.el('button', {
            class: 'btn btn-ghost',
            type: 'button',
            text: '拒绝',
            onclick: () => this.answer(req, false, isCookie ? true : remember.checked),
          }),
          U.el('button', {
            class: 'btn btn-primary',
            type: 'button',
            text: '允许',
            onclick: () => this.answer(req, true, isCookie ? true : remember.checked),
          })
        )
      );
      document.body.appendChild(card);
      this.card = card;
    },

    async answer(req, allow, remember) {
      await window.chozem.perm.respond({ id: req.id, allow, remember });
      this.current = null;
      this.destroy();
      setTimeout(() => this.next(), 120);
    },

    destroy() {
      if (this.card) {
        this.card.remove();
        this.card = null;
      }
    },
  };

  
  function dialogConfirm({ title, message, confirmText, cancelText, danger, onConfirm }) {
    const wrap = U.el('div', { class: 'confirm-wrap' }, U.el('p', { class: 'confirm-msg', text: message || '' }));
    const foot = U.el('div', { class: 'confirm-foot' });
    wrap.appendChild(foot);

    const ctl = modal.open({
      title: title || '确认',
      icon: danger ? 'info' : 'check',
      className: 'confirm',
      body: wrap,
      bodyClass: 'confirm-body',
      width: 440,
    });

    const cancel = U.el('button', { class: 'btn', type: 'button', text: cancelText || '取消', onclick: () => ctl.close() });
    const ok = U.el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', text: confirmText || '确定' });
    ok.addEventListener('click', async () => {
      ctl.close();
      try {
        await onConfirm();
      } catch (err) {
        console.error(err);
        U.toast('操作失败：' + err.message, 'err');
      }
    });
    foot.append(cancel, ok);
    setTimeout(() => ok.focus(), 40);
    return ctl;
  }

  CHO.menu = menu;
  CHO.modal = modal;
  CHO.MiniWindow = MiniWindow;
  CHO.perm = perm;
  CHO.pushEsc = pushEsc;
  CHO.dialogConfirm = dialogConfirm;
})();
