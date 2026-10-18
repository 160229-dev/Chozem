
Cho.theme.setVars({
  '--bg': '#f6efe3',
  '--bg-elev': '#fffaf1',
  '--surface': '#efe6d7',
  '--surface-2': '#e4d7c3',
  '--text': '#2c2418',
  '--text-2': '#6b5c49',
  '--muted': '#9a8a78',
  '--line': 'rgba(60, 44, 24, 0.12)',
  '--line-strong': 'rgba(60, 44, 24, 0.20)',
  '--accent': '#a4551d',
  '--accent-hover': '#8c4615',
  '--accent-solid': '#a4551d',
  '--accent-soft': 'rgba(164, 85, 29, 0.12)',
});

const previousTheme = document.documentElement.dataset.theme;
document.documentElement.dataset.theme = 'light';
Cho.toast('暖纸主题已启用');
Cho.cleanup(() => {
  Cho.theme.reset();
  document.documentElement.dataset.theme = previousTheme || 'light';
});
