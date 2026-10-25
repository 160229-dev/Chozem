Cho.log('液态玻璃已启用');

Cho.commands.register({
  id: 'disable',
  title: '关闭液态玻璃',
  hint: '恢复纯色界面（可在设置里重新启用）',
  icon: 'palette',
  run() {
    Cho.system.plugins.setEnabled('liquid-glass', false);
    Cho.toast('已关闭液态玻璃');
  },
});
