

const stage = document.getElementById('stage');

const bar = document.createElement('div');
bar.id = 'findbar';
bar.hidden = true;
bar.innerHTML = `
  <svg class="ico"><use href="#i-search"></use></svg>
  <input id="find-input" type="text" placeholder="在页面中查找" spellcheck="false" />
  <span id="find-count">0/0</span>
  <button class="fb-btn" id="find-prev" title="上一个 (Shift+Enter)"><svg class="ico"><use href="#i-forward"></use></svg></button>
  <button class="fb-btn" id="find-next" title="下一个 (Enter)"><svg class="ico"><use href="#i-forward"></use></svg></button>
  <button class="fb-btn" id="find-close" title="关闭 (Esc)"><svg class="ico"><use href="#i-close"></use></svg></button>
`;
stage.appendChild(bar);

const input = bar.querySelector('#find-input');
const count = bar.querySelector('#find-count');
let query = '';
let offEsc = null;

function search(next, forward) {
  if (!query) return;
  Cho.web.find(query, next ? { findNext: true, forward } : undefined);
}

function open() {
  if (Cho.state().mode !== 'web') {
    Cho.toast('先打开一个网页再查找');
    return;
  }
  bar.hidden = false;
  if (!offEsc) offEsc = Cho.ui.esc(close);
  input.focus();
  input.select();
  if (query) search(false);
}

function close() {
  bar.hidden = true;
  Cho.web.stopFind();
  count.textContent = '';
  if (offEsc) {
    offEsc();
    offEsc = null;
  }
}

input.addEventListener('input', () => {
  query = input.value;
  if (!query) {
    Cho.web.stopFind();
    count.textContent = '';
    return;
  }
  search(false);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    search(true, !e.shiftKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
});

bar.querySelector('#find-next').addEventListener('click', () => search(true, true));
bar.querySelector('#find-prev').addEventListener('click', () => search(true, false));
bar.querySelector('#find-close').addEventListener('click', close);

Cho.on('find:result', (res) => {
  count.textContent = res.matches ? `${res.active}/${res.matches}` : '0/0';
});

Cho.on('navigate', () => {
  if (!bar.hidden) close();
});

Cho.services.register('find', { open, close });

Cho.cleanup(() => {
  if (offEsc) offEsc();
  bar.remove();
});

Cho.log('页内查找插件就绪');
