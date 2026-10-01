(function () {
  'use strict';

  // 字号：14–24px，记住用户选择
  var KEY = 'md2phone.fs';
  var fs = 17;
  try {
    var saved = parseInt(localStorage.getItem(KEY) || '', 10);
    if (saved >= 14 && saved <= 24) fs = saved;
  } catch (e) { /* 隐私模式等场景下 localStorage 不可用，用默认字号 */ }

  function applyFs() { document.documentElement.style.setProperty('--fs', fs + 'px'); }
  applyFs();

  document.querySelectorAll('[data-fs]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fs = Math.min(24, Math.max(14, fs + parseInt(btn.dataset.fs, 10)));
      applyFs();
      try { localStorage.setItem(KEY, String(fs)); } catch (e) {}
    });
  });

  // 目录抽屉
  var body = document.body;
  var tocBtn = document.getElementById('tocBtn');
  var backdrop = document.querySelector('.toc-backdrop');
  if (tocBtn) {
    // 没有目录条目时隐藏按钮
    if (!document.querySelector('.toc-panel a')) tocBtn.style.display = 'none';
    tocBtn.addEventListener('click', function () { body.classList.toggle('toc-open'); });
  }
  if (backdrop) backdrop.addEventListener('click', function () { body.classList.remove('toc-open'); });
  document.querySelectorAll('.toc-panel a').forEach(function (a) {
    a.addEventListener('click', function () { body.classList.remove('toc-open'); });
  });

  // Service Worker：HTTPS（或 localhost）下注册；离线回退与更新由 sw.js 负责
  var secure = location.protocol === 'https:' ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
