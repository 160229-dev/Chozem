
const setTitle = () => {
  const btn = document.querySelector('#home-search .hs-submit');
  if (btn) btn.title = '汪！搜索';
};

setTitle();


const observer = new MutationObserver(setTitle);
const home = document.getElementById('home');
if (home) observer.observe(home, { childList: true, subtree: true });

Cho.cleanup(() => observer.disconnect());
Cho.log('狗头搜索已启用');
