


const GRID = 20;
const CELL = 12;
const SIZE = GRID * CELL;

let dock = null;
let stage = null;
let canvas = null;
let ctx = null;
let scoreEl = null;
let bestEl = null;
let hintEl = null;

let state = 'idle'; 
let snake = [];
let dir = { x: 1, y: 0 };
let pendingDir = null;
let food = { x: 5, y: 5 };
let score = 0;
let speed = 120;
let timer = null;
let best = Cho.storage.get('best', 0);
let disposed = false;



function colors() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    surface: pick('--surface', '#f4f4f7'),
    line: pick('--line', 'rgba(0,0,0,.08)'),
    accent: pick('--text', '#1d1d1f'),
    text: pick('--text', '#16161c'),
  };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function draw() {
  if (!ctx) return;
  const c = colors();

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = c.surface;
  ctx.fillRect(0, 0, SIZE, SIZE);

  
  ctx.beginPath();
  ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.33, 0, Math.PI * 2);
  ctx.fillStyle = '#ff3b30';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(food.x * CELL + CELL * 0.62, food.y * CELL + CELL * 0.26, CELL * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#4c9a52';
  ctx.fill();

  
  for (let i = 0; i < snake.length; i += 1) {
    const seg = snake[i];
    ctx.globalAlpha = i === 0 ? 1 : Math.max(0.32, 0.86 - i * 0.022);
    ctx.fillStyle = c.accent;
    roundRect(seg.x * CELL + 1.2, seg.y * CELL + 1.2, CELL - 2.4, CELL - 2.4, 3.2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  
  const head = snake[0];
  if (head) {
    const cx = head.x * CELL + CELL / 2;
    const cy = head.y * CELL + CELL / 2;
    const fx = dir.x * 2.2;
    const fy = dir.y * 2.2;
    const px = dir.y !== 0 ? 2.6 : 0;
    const py = dir.x !== 0 ? 2.6 : 0;
    ctx.fillStyle = c.surface;
    ctx.beginPath();
    ctx.arc(cx + fx + px, cy + fy + py, 1.5, 0, Math.PI * 2);
    ctx.arc(cx + fx - px, cy + fy - py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state === 'running') return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';

  if (state === 'idle') {
    ctx.font = '600 14px "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText('点击开始', SIZE / 2, SIZE / 2 - 4);
    ctx.font = '11px "Segoe UI", "PingFang SC", sans-serif';
    ctx.globalAlpha = 0.75;
    ctx.fillText('方向键 / WASD 控制', SIZE / 2, SIZE / 2 + 16);
    ctx.globalAlpha = 1;
  } else if (state === 'paused') {
    ctx.font = '600 14px "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText('已暂停', SIZE / 2, SIZE / 2 - 2);
    ctx.font = '11px "Segoe UI", "PingFang SC", sans-serif';
    ctx.globalAlpha = 0.75;
    ctx.fillText('点击继续', SIZE / 2, SIZE / 2 + 17);
    ctx.globalAlpha = 1;
  } else if (state === 'over') {
    ctx.font = '600 14px "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText('游戏结束', SIZE / 2, SIZE / 2 - 12);
    ctx.font = '600 20px "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText(String(score), SIZE / 2, SIZE / 2 + 14);
    ctx.font = '11px "Segoe UI", "PingFang SC", sans-serif';
    ctx.globalAlpha = 0.75;
    ctx.fillText('点击再来一局', SIZE / 2, SIZE / 2 + 34);
    ctx.globalAlpha = 1;
  }
}



const HINTS = {
  idle: '点击开始 · ↑↓←→ / WASD',
  running: '空格暂停 · 撞墙结束',
  paused: '点击继续 · 空格继续',
  over: '点击再来一局',
};

function setState(next) {
  state = next;
  if (dock) dock.dataset.state = next;
  if (hintEl) hintEl.textContent = HINTS[next] || '';
}

function syncScore() {
  if (scoreEl) scoreEl.textContent = String(score);
  if (bestEl) bestEl.textContent = String(best);
  if (dock) dock.dataset.score = String(score);
}

function placeFood() {
  for (let i = 0; i < 400; i += 1) {
    const x = Math.floor(Math.random() * GRID);
    const y = Math.floor(Math.random() * GRID);
    if (!snake.some((s) => s.x === x && s.y === y)) {
      food = { x, y };
      return;
    }
  }
  food = { x: 0, y: 0 };
}

function startTimer() {
  clearInterval(timer);
  timer = setInterval(step, speed);
}

function resetBoard() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  dir = { x: 1, y: 0 };
  pendingDir = null;
  score = 0;
  speed = 120;
  placeFood();
  syncScore();
}

function start() {
  resetBoard();
  setState('running');
  startTimer();
  draw();
}

function pause() {
  if (state !== 'running') return;
  clearInterval(timer);
  timer = null;
  setState('paused');
  draw();
}

function resume() {
  if (state !== 'paused') return;
  setState('running');
  startTimer();
  draw();
}

function gameOver() {
  clearInterval(timer);
  timer = null;
  setState('over');
  if (score > best) {
    best = score;
    Cho.storage.set('best', best);
  }
  syncScore();
  draw();
}

function step() {
  if (state !== 'running') return;

  if (pendingDir && !(pendingDir.x === -dir.x && pendingDir.y === -dir.y)) {
    dir = pendingDir;
  }
  pendingDir = null;

  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
    gameOver();
    return;
  }
  
  for (let i = 0; i < snake.length - 1; i += 1) {
    if (snake[i].x === head.x && snake[i].y === head.y) {
      gameOver();
      return;
    }
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 1;
    syncScore();
    placeFood();
    if (score % 5 === 0 && speed > 72) {
      speed -= 8;
      startTimer();
    }
  } else {
    snake.pop();
  }
  draw();
}

function setDir(x, y) {
  if (state === 'idle' || state === 'over') start();
  if (state !== 'running') return;
  const base = pendingDir || dir;
  if (base.x === -x && base.y === -y) return;
  if (base.x === x && base.y === y) return;
  pendingDir = { x, y };
}

function toggle() {
  if (state === 'idle' || state === 'over') start();
  else if (state === 'running') pause();
  else if (state === 'paused') resume();
}



function mount() {
  if (disposed || document.querySelector('.snake-dock')) return;
  const home = document.getElementById('home');
  if (!home) return;

  dock = Cho.ui.el('div', { class: 'snake-dock', dataset: { state: 'idle', score: '0' } });
  dock.appendChild(
    Cho.ui.el(
      'div',
      { class: 'snake-head' },
      Cho.ui.el('span', { class: 'snake-title', text: '🐍 贪吃蛇' }),
      Cho.ui.el(
        'span',
        { class: 'snake-score' },
        Cho.ui.el('b', { text: '0' }),
        ' 分 · 最高 ',
        Cho.ui.el('b', { text: String(best) })
      )
    )
  );

  stage = Cho.ui.el('div', { class: 'snake-stage', tabindex: '0', 'aria-label': '贪吃蛇游戏区域' });
  canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stage.appendChild(canvas);

  dock.appendChild(stage);
  hintEl = Cho.ui.el('div', { class: 'snake-hint', text: HINTS[state] || HINTS.idle });
  dock.appendChild(hintEl);
  home.appendChild(dock);

  scoreEl = dock.querySelector('.snake-score b');
  bestEl = dock.querySelectorAll('.snake-score b')[1];
  syncScore();

  if (!snake.length) resetBoard();
  dock.dataset.state = state;
  dock.dataset.score = String(score);

  canvas.addEventListener('click', () => {
    stage.focus();
    toggle();
  });

  stage.addEventListener('keydown', (e) => {
    const k = String(e.key).toLowerCase();
    if (k === 'arrowup' || k === 'w') {
      e.preventDefault();
      setDir(0, -1);
    } else if (k === 'arrowdown' || k === 's') {
      e.preventDefault();
      setDir(0, 1);
    } else if (k === 'arrowleft' || k === 'a') {
      e.preventDefault();
      setDir(-1, 0);
    } else if (k === 'arrowright' || k === 'd') {
      e.preventDefault();
      setDir(1, 0);
    } else if (k === ' ' || k === 'spacebar') {
      e.preventDefault();
      toggle();
    }
  });

  stage.addEventListener('blur', () => pause());

  draw();
}

function onVisibility() {
  if (document.hidden) pause();
}

function onResize() {
  if (!stage || state !== 'running') return;
  if (!stage.offsetParent || stage.getBoundingClientRect().width < 20) pause();
}

document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('resize', onResize);

mount();


const homeEl = document.getElementById('home');
const observer = new MutationObserver(() => {
  if (!document.querySelector('.snake-dock')) mount();
});
if (homeEl) observer.observe(homeEl, { childList: true });

Cho.cleanup(() => {
  disposed = true;
  clearInterval(timer);
  timer = null;
  observer.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('resize', onResize);
  if (dock) dock.remove();
  dock = null;
  stage = null;
  canvas = null;
  ctx = null;
});

Cho.log('首页贪吃蛇已加载');
