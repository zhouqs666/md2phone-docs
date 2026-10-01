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

  // ---- 阅读位置记忆（按文档存手机本地，百分比定位：调字号/换设备仍落回同处）----
  function docHeight() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }
  var isSingle = !!document.querySelector('.single-doc');   // 单文件整库形态
  var isReader = !isSingle && !!document.querySelector('.doc'); // 多页阅读形态

  function savePos() {
    try {
      if (isReader) {
        var h = docHeight();
        if (h <= 0) return;
        var y = window.scrollY / h;
        if (y <= 0.002 || y >= 0.998) y = 0;
        localStorage.setItem('md2phone.pos:' + location.pathname, y.toFixed(4));
      } else if (isSingle) {
        var secs = document.querySelectorAll('.single-doc');
        if (!secs.length) return;
        var cur = secs[0];
        for (var i = 0; i < secs.length; i++) {
          if (secs[i].offsetTop <= window.scrollY + window.innerHeight * 0.35) cur = secs[i];
        }
        var rel = cur.offsetHeight > 0
          ? (window.scrollY - cur.offsetTop) / cur.offsetHeight : 0;
        localStorage.setItem('md2phone.pos:single',
          JSON.stringify({ s: cur.id, r: +Math.max(0, Math.min(0.998, rel)).toFixed(4) }));
      }
    } catch (e) { /* localStorage 不可用则不记忆 */ }
  }

  function restorePos() {
    try {
      if (isReader) {
        var saved = parseFloat(localStorage.getItem('md2phone.pos:' + location.pathname));
        if (!(saved > 0.002 && saved < 0.998)) return;
        setTimeout(function () {
          if (window.scrollY > 0) return; // 用户已自行滚动，不打扰
          var h = docHeight();
          if (h > 0) window.scrollTo(0, saved * h);
        }, 150);
        window.addEventListener('load', function () {
          if (window.scrollY > 0) return;
          var h2 = docHeight();
          if (h2 > 0) window.scrollTo(0, saved * h2);
        });
      } else if (isSingle) {
        var raw = localStorage.getItem('md2phone.pos:single');
        if (!raw) return;
        var o = JSON.parse(raw);
        var el = o.s && document.getElementById(o.s);
        if (!el || !(o.r > 0.002 && o.r < 0.998)) return;
        setTimeout(function () {
          if (window.scrollY > 0) return;
          window.scrollTo(0, el.offsetTop + o.r * el.offsetHeight);
        }, 150);
      }
    } catch (e) {}
  }
  restorePos();

  var saveTimer = null;
  window.addEventListener('scroll', function () {
    if (saveTimer) return;
    saveTimer = setTimeout(function () { saveTimer = null; savePos(); }, 400);
  }, { passive: true });
  window.addEventListener('pagehide', savePos);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') savePos();
  });

  // Service Worker：HTTPS（或 localhost）下注册；离线回退与更新由 sw.js 负责
  var secure = location.protocol === 'https:' ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
