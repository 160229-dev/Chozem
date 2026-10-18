


const VARS = {
  '--bg': '#0a0a0b',
  '--bg-elev': '#141416',
  '--surface': '#1b1b1f',
  '--surface-2': '#24242a',
  '--text': '#f4f0e9',
  '--text-2': '#a8a29a',
  '--muted': '#6f6a64',
  '--line': 'rgba(255, 255, 255, 0.08)',
  '--line-strong': 'rgba(255, 255, 255, 0.16)',
  '--accent': '#e5a15c',
  '--accent-solid': '#c4681f',
  '--accent-soft': 'rgba(229, 161, 92, 0.16)',
  '--accent-softer': 'rgba(229, 161, 92, 0.07)',
  '--shadow-1': '0 1px 2px rgba(0, 0, 0, 0.45), 0 6px 20px rgba(0, 0, 0, 0.32)',
  '--shadow-2': '0 20px 60px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.42)',
};

const root = document.documentElement;
let button = null;
let on = false;

function apply(next, silent) {
  on = !!next;
  if (on) {
    Cho.theme.setVars(VARS);
    root.dataset.chozemMidnight = 'true';
    root.style.colorScheme = 'dark';
  } else {
    Cho.theme.reset();
    delete root.dataset.chozemMidnight;
    root.style.colorScheme = '';
  }
  if (button) button.setActive(on);
  Cho.storage.set('enabled', on);
  if (!silent) Cho.toast(on ? '午夜主题已开启' : '已恢复默认主题');
}

button = Cho.toolbar.addButton({
  id: 'midnight',
  icon: 'moon',
  title: '午夜主题',
  order: 40,
  onClick: () => apply(!on),
});

apply(Cho.storage.get('enabled', false), true);

Cho.commands.register({
  id: 'toggle',
  title: '切换午夜主题',
  hint: '暖炭黑配色',
  icon: 'moon',
  run: () => apply(!on),
});

Cho.cleanup(() => {
  if (on) {
    Cho.theme.reset();
    delete root.dataset.chozemMidnight;
    root.style.colorScheme = '';
  }
});
