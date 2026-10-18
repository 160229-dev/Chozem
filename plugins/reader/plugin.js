


const READER_CSS = `
  html { background: #fbf8f2 !important; }
  body {
    max-width: 720px !important;
    margin: 0 auto !important;
    padding: 56px 26px 120px !important;
    font-family: "Charter", "Songti SC", "Noto Serif SC", Georgia, serif !important;
    font-size: 18px !important;
    line-height: 1.95 !important;
    color: #2b2721 !important;
    letter-spacing: 0.01em !important;
  }
  body * { max-width: 100% !important; box-sizing: border-box !important; }
  nav, aside, footer, [role="navigation"], [role="banner"], .sidebar, .ads, .ad, .advertisement { display: none !important; }
  img, video, figure { height: auto !important; border-radius: 6px !important; }
  h1, h2, h3 { line-height: 1.35 !important; letter-spacing: -0.01em !important; }
  a { color: #b4601f !important; }
  pre, code { font-size: 14px !important; }
  @media (prefers-color-scheme: dark) {
    html { background: #12110f !important; }
    body { color: #e9e3d8 !important; }
  }
`;

let on = false;

const button = Cho.toolbar.addButton({
  id: 'reader',
  icon: 'book',
  title: '阅读模式',
  order: 15,
  onClick: () => toggle(),
});

async function toggle() {
  if (Cho.state().mode !== 'web') {
    Cho.toast('先打开一个网页');
    return;
  }
  on = !on;
  const cssLiteral = JSON.stringify(READER_CSS);
  if (on) {
    await Cho.page.run(`(function () {
      var old = document.getElementById('cho-reader');
      if (old) old.remove();
      var style = document.createElement('style');
      style.id = 'cho-reader';
      style.textContent = ${cssLiteral};
      document.head.appendChild(style);
    })()`);
  } else {
    await Cho.page.run(`(function () {
      var old = document.getElementById('cho-reader');
      if (old) old.remove();
    })()`);
  }
  button.setActive(on);
  Cho.toast(on ? '阅读模式已开启' : '已退出阅读模式');
}

Cho.on('navigate', () => {
  on = false;
  button.setActive(false);
});

Cho.commands.register({
  id: 'toggle',
  title: '切换阅读模式',
  hint: '隐藏噪音，把正文排成适合阅读的样子',
  icon: 'book',
  run: () => toggle(),
});

Cho.log('阅读模式插件就绪');
