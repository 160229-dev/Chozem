


let active = false;
let exitBtn = null;

const button = Cho.toolbar.addButton({
  id: 'focus',
  icon: 'eye',
  title: '专注模式  (隐藏工具栏)',
  order: 30,
  onClick: () => toggle(),
});

function toggle(force) {
  const next = force === undefined ? !active : !!force;
  active = next;
  document.body.classList.toggle('cho-focus', next);
  button.setActive(next);

  if (next) {
    if (!exitBtn) {
      exitBtn = Cho.ui.el(
        'button',
        { class: 'cho-focus-exit', type: 'button', title: '退出专注模式  (Esc)' },
        Cho.ui.icon('close'),
        Cho.ui.el('span', { text: '退出专注' })
      );
      exitBtn.addEventListener('click', () => toggle(false));
    }
    document.body.appendChild(exitBtn);
  } else if (exitBtn) {
    exitBtn.remove();
  }
}

const onKey = (e) => {
  if (e.key === 'Escape' && active) {
    e.preventDefault();
    toggle(false);
  }
};
document.addEventListener('keydown', onKey);

Cho.commands.register({
  id: 'toggle',
  title: active ? '退出专注模式' : '进入专注模式',
  hint: '隐藏工具栏，只留下网页',
  icon: 'eye',
  run: () => toggle(),
});

Cho.cleanup(() => {
  document.removeEventListener('keydown', onKey);
  document.body.classList.remove('cho-focus');
  if (exitBtn) exitBtn.remove();
});
