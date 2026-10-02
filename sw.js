/* md2phone service worker
 * 策略：HTML 页面 network-first（保证手机端一刷新就是最新内容）；
 *       静态壳（样式/脚本/图标/清单）cache-first——打开即渲染，不被网络阻塞。
 * 每次构建生成新 BUILD_ID → 新缓存名 → activate 时清掉旧缓存；
 * 若激活时存在旧缓存（说明内容换代了），向页面广播「内容已更新」提示条。
 */
var VERSION = '7573ae63103d';
var CACHE = 'md2phone-' + VERSION;
var SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icon-64.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];
var SHELL_RE = new RegExp(
  '/(style\\.css|app\\.js|manifest\\.webmanifest'
  + '|assets/(icon-(64|192|512)\\.png|apple-touch-icon\\.png))$');

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        var olds = keys.filter(function (k) { return k !== CACHE; });
        return Promise.all(olds.map(function (k) { return caches.delete(k); }))
          .then(function () { return olds.length > 0; });
      })
      .then(function (hadOld) {
        return self.clients.claim().then(function () {
          if (!hadOld) return;   // 首次安装不算「更新」，不打扰
          return self.clients.matchAll({ includeUncontrolled: true })
            .then(function (cs) {
              cs.forEach(function (c) { c.postMessage({ type: 'md2phone:updated' }); });
            });
        });
      })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 静态壳：cache-first（缓存名随构建换代，命中即秒开，无过期问题）
  if (SHELL_RE.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // 其余（HTML 页面、docs 数据等）：network-first，失败回退缓存（离线可读）
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
