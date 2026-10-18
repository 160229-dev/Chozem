


const ENGINE_ICONS = {
  bing: 'assets/engines/bing.png',
  baidu: 'assets/engines/baidu.png',
  google:
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87z"/>' +
    '<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"/>' +
    '<path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"/>' +
    '<path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>' +
    '</svg>',
  wikipedia:
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="11" fill="#f8f9fa" stroke="#c8ccd1" stroke-width="1"/>' +
    '<text x="12" y="17.2" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-size="14" font-weight="600" fill="#202122">W</text>' +
    '</svg>',
  duckduckgo:
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="11" fill="#DE5833"/>' +
    '<text x="12" y="17" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="#fff">D</text>' +
    '</svg>',
};

const HOME_HTML = `
  <div class="home-glow"></div>
  <div class="home-inner">
    <div class="brand">
      <img id="home-logo" src="assets/icon-256.png" alt="Chozem" draggable="false" />
      <h1 class="brand-name">Chozem</h1>
    </div>

    <form id="home-search" autocomplete="off">
      <span class="hs-engine" id="hs-engine" title="在设置中更换搜索引擎">
        <span class="engine-dot" id="hs-engine-dot"></span>
        <span id="hs-engine-name">Bing</span>
      </span>
      <input id="home-input" type="text" spellcheck="false" placeholder="搜索，或输入网址" aria-label="搜索" />
      <button type="submit" class="hs-submit" title="搜索">
        <svg class="ico"><use href="#i-search"></use></svg>
      </button>
    </form>

    <div id="home-widgets" class="home-widgets"></div>
  </div>
`;

const root = document.getElementById('home');
root.innerHTML = HOME_HTML;

function paintIcon(host, engine) {
  host.replaceChildren();
  const icon = engine.icon || ENGINE_ICONS[engine.id];
  if (icon && String(icon).trim().startsWith('<svg')) {
    host.innerHTML = icon;
    host.classList.add('has-icon');
    return;
  }
  if (icon) {
    host.classList.add('has-icon');
    const img = Cho.ui.el('img', { src: icon, alt: '' });
    img.addEventListener('error', () => {
      host.classList.remove('has-icon');
      host.replaceChildren();
      host.textContent = engine.short || engine.name.slice(0, 1);
    });
    host.appendChild(img);
    return;
  }
  host.classList.remove('has-icon');
  host.textContent = engine.short || engine.name.slice(0, 1);
}

function currentEngine() {
  return Cho.engines.current();
}

function renderEngines() {
  const engine = currentEngine();
  paintIcon(document.getElementById('hs-engine-dot'), engine);
  document.getElementById('hs-engine-name').textContent = engine.name;
}

document.getElementById('home-search').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = document.getElementById('home-input').value.trim();
  if (value) Cho.navigate(value);
});

Cho.on('settings', () => renderEngines());
Cho.on('view:state', () => {
  if (Cho.state().mode === 'home') {
    const input = document.getElementById('home-input');
    if (input && document.activeElement !== input) input.focus({ preventScroll: true });
  }
});

renderEngines();

Cho.services.register('home', {
  focus: () => document.getElementById('home-input').focus(),
});

Cho.cleanup(() => {
  root.replaceChildren();
});

Cho.log('搜索首页插件就绪');
