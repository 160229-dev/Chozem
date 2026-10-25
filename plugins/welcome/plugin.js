'use strict';
window.CHO = window.CHO || {};

(function () {
  const U = CHO.util;

  const MEDIA = {
    logo: 'assets/onboarding/chozem-logo.mp4',
    cookie: 'assets/onboarding/chozem-cookie.mp4',
  };

  const STEPS = {
    1: {
      title: '欢迎使用 Chozem',
      desc: '标签页、首页、设置、下载都是插件，可以随时停用，也可以自己写一个。内核只保留窗口、网页和插件加载。',
    },
    2: {
      title: '网站 Cookie',
      desc: 'Cookie 用来记住登录状态和偏好。允许所有网站使用后，Chozem 不再询问；不同意则每个新网站第一次访问时先问你。',
    },
  };

  let layer = null;
  let videos = [];
  let part = {};
  let step = 1;
  let closing = false;
  let disposed = false;

  

  function buildVideo(src) {
    const video = U.el('video', { class: 'welcome-video', src, preload: 'auto', playsinline: '' });
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.disablePictureInPicture = true;
    video.addEventListener('error', () => {
      if (part.media) part.media.classList.add('is-fallback');
    });
    return video;
  }

  function build() {
    layer = U.el('div', { id: 'welcome-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': '欢迎使用 Chozem' });

    const media = U.el('div', { class: 'welcome-media' });
    videos = [buildVideo(MEDIA.logo), buildVideo(MEDIA.cookie)];
    videos[0].classList.add('is-on');
    media.append(videos[0], videos[1]);
    media.appendChild(
      U.el(
        'div',
        { class: 'welcome-fallback' },
        U.el('img', { src: 'assets/icon-256.png', alt: '' }),
        U.el('span', { text: 'CHOZEM' })
      )
    );

    const title = U.el('h2', { class: 'welcome-title', text: STEPS[1].title });
    const desc = U.el('p', { class: 'welcome-desc', text: STEPS[1].desc });
    const copy = U.el('div', { class: 'welcome-copy' }, title, desc);

    const skip = U.el('button', { class: 'btn welcome-skip', type: 'button', text: '跳过' });
    const disagree = U.el('button', { class: 'btn welcome-disagree', type: 'button', text: '不同意' });
    disagree.hidden = true;
    const primary = U.el('button', { class: 'btn btn-primary welcome-primary', type: 'button', text: '下一步' });

    const card = U.el(
      'div',
      { class: 'welcome-card' },
      media,
      copy,
      U.el('div', { class: 'welcome-foot' }, skip, U.el('div', { class: 'welcome-gap' }), disagree, primary)
    );

    layer.append(U.el('div', { class: 'welcome-scrim' }), card);
    document.body.appendChild(layer);

    part = { card, media, title, desc, skip, disagree, primary };

    skip.addEventListener('click', () => finish('allowAll'));
    disagree.addEventListener('click', () => finish('ask'));
    primary.addEventListener('click', () => (step === 1 ? next() : finish('allowAll')));

    document.addEventListener('keydown', onKey, true);
    videos[0].play().catch(() => {});
    primary.focus({ preventScroll: true });
  }

  

  function onKey(event) {
    if (event.key !== 'Escape' || !layer) return;
    event.preventDefault();
    event.stopPropagation();
    
    finish(step === 1 ? 'allowAll' : 'ask');
  }

  async function next() {
    if (step !== 1) return;
    step = 2;
    part.card.dataset.step = '2';
    part.title.textContent = STEPS[2].title;
    part.desc.textContent = STEPS[2].desc;
    part.skip.hidden = true;
    part.disagree.hidden = false;
    part.primary.textContent = '同意';

    const logo = videos[0];
    const cookie = videos[1];

    
    if (logo && !logo.ended && Number.isFinite(logo.duration) && logo.duration - logo.currentTime > 0.3) {
      try {
        logo.currentTime = Math.max(0, logo.duration - 0.06);
      } catch (_) {}
    }

    if (cookie && cookie.readyState < 2) {
      
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 900);
        cookie.addEventListener(
          'canplay',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
    }
    if (!layer || !cookie) return;

    cookie.currentTime = 0;
    cookie.play().catch(() => {});
    cookie.classList.add('is-on');
    logo.classList.remove('is-on');
    logo.pause();
    part.primary.focus({ preventScroll: true });
  }

  async function finish(choice) {
    if (closing || !layer) return;
    closing = true;

    const value = choice === 'ask' ? 'ask' : 'allowAll';
    try {
      await Cho.settings.set({ onboarding: { done: true }, privacy: { cookieConsent: value } });
    } catch (err) {
      console.error('[welcome] 保存引导状态失败', err);
    }

    close();
  }

  function close() {
    if (!layer) return;
    document.removeEventListener('keydown', onKey, true);
    for (const video of videos) {
      try {
        video.pause();
      } catch (_) {}
    }

    const node = layer;
    layer = null;
    videos = [];
    part = {};
    node.classList.add('is-closing');
    setTimeout(() => node.remove(), 240);
  }

  function open(force) {
    if (disposed || layer) return;
    const state = Cho.settings.get().onboarding;
    if (!force && state && state.done) return;
    closing = false;
    step = 1;
    build();
  }

  function maybeOpen() {
    const state = Cho.settings.get().onboarding;
    if (state && state.done) return;
    
    setTimeout(() => {
      if (!disposed) open(false);
    }, 480);
  }

  Cho.services.register('welcome', { open: () => open(true), close });

  Cho.commands.register({
    id: 'replay',
    title: '重新观看欢迎引导',
    hint: '播放介绍动画，并重新设置 Cookie 权限',
    icon: 'play',
    run: () => open(true),
  });

  Cho.cleanup(() => {
    disposed = true;
    document.removeEventListener('keydown', onKey, true);
    if (layer) layer.remove();
    layer = null;
    videos = [];
    part = {};
  });

  Cho.log('欢迎引导已就绪');
  maybeOpen();
})();
