(function () {
  'use strict';

  // ============ 小工具 ============
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) {
    return Array.prototype.slice.call((el || document).querySelectorAll(sel));
  }
  function on(el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式等场景下不可用 */ } }
  function throttle(ms, fn) {
    var t = null;
    return function () {
      if (t) return;
      t = setTimeout(function () { t = null; fn(); }, ms);
    };
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // 把 text 中命中的 q（不区分大小写）包上 <mark>，其余部分转义
  function markHtml(text, q) {
    try {
      var parts = text.split(new RegExp('(' + escapeReg(q) + ')', 'gi'));
      return parts.map(function (p, i) {
        return i % 2 ? '<mark>' + escHtml(p) + '</mark>' : escHtml(p);
      }).join('');
    } catch (e) { return escHtml(text); }
  }

  // ============ 形态判定 ============
  var isSingle = !!$('.single-doc');                    // 单文件整库形态
  var isReader = !isSingle && !!$('.doc');              // 多页阅读形态
  var isIndex = !isSingle && !isReader && !!$('.list'); // 文档列表页

  // ============ 外观主题：跟随系统 / 浅色 / 深色 ============
  var THEME_KEY = 'md2phone.theme';
  var THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
  function applyTheme() {
    var mode = lsGet(THEME_KEY) || 'auto';
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var btn = $('#themeBtn');   // 列表页顶栏的循环切换钮（若有）
    if (btn) {
      btn.textContent = mode === 'dark' ? '☾' : (mode === 'light' ? '☀' : '◐');
      btn.title = '外观：' + THEME_LABEL[mode] + '（点击切换）';
      btn.setAttribute('aria-label', btn.title);
    }
    $all('#themeSeg [data-theme-set]').forEach(function (b) {   // 面板三选钮（若有）
      b.classList.toggle('on', b.dataset.themeSet === mode);
    });
  }
  on($('#themeBtn'), 'click', function () {
    var order = ['auto', 'light', 'dark'];
    var cur = lsGet(THEME_KEY) || 'auto';
    lsSet(THEME_KEY, order[(order.indexOf(cur) + 1) % order.length]);
    applyTheme();
  });
  $all('#themeSeg [data-theme-set]').forEach(function (b) {
    on(b, 'click', function () {
      lsSet(THEME_KEY, b.dataset.themeSet);
      applyTheme();
    });
  });
  applyTheme();

  // ============ 字号：五档预设，改字号时锚定当前阅读位置不跳动 ============
  var FS_KEY = 'md2phone.fs';
  var FS_PRESETS = [14, 17, 20, 23, 26];
  var FS_DEFAULT = 17;
  var fs = FS_DEFAULT;
  var savedFs = parseInt(lsGet(FS_KEY) || '', 10);
  if (FS_PRESETS.indexOf(savedFs) >= 0) fs = savedFs;
  else if (savedFs >= 14 && savedFs <= 26) {
    // 旧版逐 px 记忆的值吸附到最近档位
    fs = FS_PRESETS.reduce(function (a, b) {
      return Math.abs(b - savedFs) < Math.abs(a - savedFs) ? b : a;
    });
  }
  function applyFs() {
    document.documentElement.style.setProperty('--fs', fs + 'px');
    $all('#fsSeg [data-fs-preset]').forEach(function (b) {
      b.classList.toggle('on', parseInt(b.dataset.fsPreset, 10) === fs);
    });
  }
  // 改字号会整页重排：记住视口顶正在读的那个块，重排后把它按回原视口位置
  function visibleAnchor() {
    // 单文件版整库同页：须在全部文档小节里找锚点，不能只看第一篇
    var root = isSingle ? document.body : $('.doc');
    if (!root) return null;
    var blocks = root.querySelectorAll(
      'h1,h2,h3,h4,p,li,pre,blockquote,table,img,.table-wrap,.pre-wrap,.doc-meta');
    for (var i = 0; i < blocks.length; i++) {
      var r = blocks[i].getBoundingClientRect();
      if (!r.height && !r.width) continue;   // 折叠/隐藏中的块不作为锚点
      if (r.bottom >= 0) return blocks[i];   // 第一个底部还在视口顶之后的块
    }
    return null;
  }
  function setFs(v) {
    if (FS_PRESETS.indexOf(v) < 0) v = FS_DEFAULT;
    if (v === fs) { applyFs(); return; }
    var anchor = window.scrollY > 0 ? visibleAnchor() : null;
    var vpBefore = anchor ? anchor.getBoundingClientRect().bottom : 0;
    fs = v;
    applyFs();
    lsSet(FS_KEY, String(fs));
    if (!anchor) { adaptTables(); savePos(); return; }
    requestAnimationFrame(function () {
      adaptTables();   // 先让表格在新字号下适配到位，再量锚点位移
      // 钉住锚点底边：锚点下方（正要读的内容）保持稳定，
      // 锚点自身与上方内容随字号自然伸缩（下方间距随 em 缩放，允许小幅漂移）
      var vpAfter = anchor.getBoundingClientRect().bottom;
      var drift = vpAfter - vpBefore;
      if (Math.abs(drift) > 0.5) {
        window.scrollTo(0, Math.round(window.scrollY + drift));
      }
      savePos();
    });
  }
  $all('#fsSeg [data-fs-preset]').forEach(function (b) {
    on(b, 'click', function () { setFs(parseInt(b.dataset.fsPreset, 10)); });
  });
  on($('#fsReset'), 'click', function () { setFs(FS_DEFAULT); });
  applyFs();

  // ============ 代码换行：默认开（阅读优先），可关回「保结构横向滑动」 ============
  var PREWRAP_KEY = 'md2phone.prewrap';
  function applyPrewrap() {
    var wrapOn = lsGet(PREWRAP_KEY) !== '0';
    document.body.classList.toggle('code-wrap', wrapOn);
    var sw = $('#prewrapBtn');
    if (sw) sw.setAttribute('aria-checked', wrapOn ? 'true' : 'false');
  }
  on($('#prewrapBtn'), 'click', function () {
    lsSet(PREWRAP_KEY, document.body.classList.contains('code-wrap') ? '0' : '1');
    applyPrewrap();
  });
  applyPrewrap();

  // ============ 表格自适应：放不下先压缩收窄，仍放不下才容器内横滑 ============
  function adaptTables() {
    $all('.table-wrap').forEach(function (w) {
      if (w.getAttribute('tabindex') === null) w.setAttribute('tabindex', '0');
      w.classList.remove('compact');
      if (w.scrollWidth > w.clientWidth + 1) w.classList.add('compact');
    });
  }

  // ============ 顶栏/底部工具条滚动隐退（下滑阅读让位内容，上滑唤出） ============
  var lastY = window.scrollY;
  function showTopbar() { document.body.classList.remove('top-hidden'); }
  // 首次进入沉浸阅读时提示一次「点屏幕唤出工具条」，解决手势可发现性
  function tapHint() {
    try { if (sessionStorage.getItem('md2phone.hint')) return; } catch (e) { return; }
    try { sessionStorage.setItem('md2phone.hint', '1'); } catch (e) { return; }
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = '轻点屏幕可呼出 目录 · 字号 · 查找';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 400);
    }, 3600);
  }
  function syncTopbar() {
    if (document.body.classList.contains('toc-open')) { showTopbar(); lastY = window.scrollY; return; }
    if (fsPop && !fsPop.hidden) { showTopbar(); return; }   // 设置面板打开时不隐退
    var y = window.scrollY;
    if (y < 120) showTopbar();
    else if (y > lastY + 6) { document.body.classList.add('top-hidden'); tapHint(); }
    else if (y < lastY - 6) showTopbar();
    lastY = y;
  }

  // ============ 字号/外观/代码换行 底部设置面板（工具条 Aa） ============
  var fsPop = $('#fsPop');
  function closePopover() {
    if (fsPop && !fsPop.hidden) { fsPop.hidden = true; syncTopbar(); }
  }
  on($('#fsBtn'), 'click', function () {
    if (!fsPop) return;
    var willOpen = fsPop.hidden;
    fsPop.hidden = !fsPop.hidden;
    if (willOpen) showTopbar();
  });
  on(document, 'click', function (e) {
    if (!fsPop || fsPop.hidden) return;
    if (e.target.closest && (e.target.closest('#fsPop') || e.target.closest('#fsBtn'))) return;
    closePopover();
  });

  // ============ 点击正文空白处：唤出/收起阅读控制层（顶栏 + 工具条一起） ============
  // 阅读类 App 的通行做法：屏幕中央轻点切换控制层，随手可调字号/看目录，不必滚回篇首。
  var TAP_SKIP = 'a,button,input,textarea,select,summary,img,video,pre,table,code,'
    + '.table-wrap,.fs-pop,.readbar,.top,.find-bar,.toc-panel,.toc-backdrop,'
    + '.doc-nav,.resume-card,.sw-banner,.lightbox,details';
  on(document, 'click', function (e) {
    if (!isReader && !isSingle) return;
    if (fsPop && !fsPop.hidden) return;                        // 面板开着：只关面板
    if (document.body.classList.contains('toc-open')) return;  // 抽屉有自己的关闭逻辑
    var t = e.target;
    if (!t.closest || t.closest(TAP_SKIP)) return;
    var sel = window.getSelection ? window.getSelection() : null;
    if (sel && String(sel).length) return;                     // 正在选字，别打扰
    if (window.scrollY < 120) return;                          // 篇首顶栏常驻
    if (document.body.classList.contains('top-hidden')) showTopbar();
    else document.body.classList.add('top-hidden');
  });

  // ============ 回到顶部（工具条第 4 键，深滚动时出现） ============
  on($('#topBtn'), 'click', function () {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { window.scrollTo(0, 0); }
  });

  // ============ 目录抽屉 ============
  var spyItems = [];
  function buildSpy(panel) {
    spyItems = [];
    $all('a', panel).forEach(function (a) {
      var hid = (a.getAttribute('href') || '').slice(1);
      var h = hid && document.getElementById(hid);
      if (h) spyItems.push({ h: h, a: a });
    });
  }
  var tocBtn = $('#tocBtn');
  var backdrop = $('.toc-backdrop');
  // 单文件版：抽屉内容按「当前读到的文档」动态装配
  function populateSingleToc() {
    var panel = $('.toc-panel');
    if (!panel) return;
    var secs = $all('.single-doc');
    var cur = secs[0] || null;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].offsetTop <= window.scrollY + window.innerHeight * 0.35) cur = secs[i];
    }
    var links = cur ? $all('.doctoc nav a', cur) : [];
    var h1 = cur ? cur.querySelector('h1') : null;
    var head = '<div class="toc-head"><span>' + escHtml(h1 ? h1.textContent : '目录')
      + '</span><span class="toc-pct" id="tocPct"></span></div>';
    panel.innerHTML = head + (links.length
      ? links.map(function (a) { return a.outerHTML; }).join('\n')
      : '<div class="toc-none">本文档没有可用的目录。</div>');
    buildSpy(panel);
  }
  if (tocBtn) {
    if (isReader && !$('.toc-panel a')) tocBtn.style.display = 'none';
    on(tocBtn, 'click', function () {
      var opening = !document.body.classList.contains('toc-open');
      if (isSingle && opening) populateSingleToc();
      document.body.classList.toggle('toc-open', opening);
      if (opening) {
        showTopbar();
        updateSpy();
        // 打开即定位到当前小节（在抽屉内部滚动，不动正文）
        var panel = $('.toc-panel');
        var act = $('.toc-panel a.active');
        if (panel && act) panel.scrollTop = Math.max(0, act.offsetTop - panel.clientHeight * 0.4);
        var tp = $('#tocPct');
        if (tp) updateProgress();
      }
    });
  }
  on(backdrop, 'click', function () {
    document.body.classList.remove('toc-open');
    showTopbar();
  });
  // 抽屉链接点击用事件委托：单文件版每次打开重建内容也能接住
  on($('.toc-panel'), 'click', function (e) {
    if (!e.target.closest('a')) return;
    document.body.classList.remove('toc-open');
    showTopbar();
  });

  // ============ 阅读位置记忆（按文档存本机，百分比定位；带时间戳供「继续阅读」取最近） ============
  var POS_PREFIX = 'md2phone.pos:';
  function docHeight() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }
  // 兼容两种存储格式：旧版纯数字，新版 JSON {r: 比例, t: 时间戳}
  function parsePos(raw) {
    if (!raw) return null;
    try {
      if (raw.charAt(0) === '{') {
        var o = JSON.parse(raw);
        return (o && typeof o.r === 'number') ? o : null;
      }
      var f = parseFloat(raw);
      return isFinite(f) ? { r: f, t: 0 } : null;
    } catch (e) { return null; }
  }

  function savePos() {
    try {
      if (isReader) {
        var h = docHeight();
        if (h <= 0) return;
        var y = window.scrollY / h;
        if (y <= 0.002 || y >= 0.998) y = 0;
        lsSet(POS_PREFIX + location.pathname,
          JSON.stringify({ r: +y.toFixed(4), t: Date.now() }));
      } else if (isSingle) {
        var secs = $all('.single-doc');
        if (!secs.length) return;
        var cur = secs[0];
        for (var i = 0; i < secs.length; i++) {
          if (secs[i].offsetTop <= window.scrollY + window.innerHeight * 0.35) cur = secs[i];
        }
        var rel = cur.offsetHeight > 0
          ? (window.scrollY - cur.offsetTop) / cur.offsetHeight : 0;
        lsSet(POS_PREFIX + 'single', JSON.stringify({
          s: cur.id, r: +Math.max(0, Math.min(0.998, rel)).toFixed(4), t: Date.now()
        }));
      }
    } catch (e) { /* localStorage 不可用则不记忆 */ }
  }

  function restorePos() {
    try {
      if (isReader) {
        var p = parsePos(lsGet(POS_PREFIX + location.pathname));
        if (!(p && p.r > 0.002 && p.r < 0.998)) return;
        setTimeout(function () {
          if (window.scrollY > 0) return; // 用户已自行滚动，不打扰
          var h = docHeight();
          if (h > 0) window.scrollTo(0, p.r * h);
        }, 150);
        window.addEventListener('load', function () {
          if (window.scrollY > 0) return;
          var h2 = docHeight();
          if (h2 > 0) window.scrollTo(0, p.r * h2);
        });
      } else if (isSingle) {
        var o = parsePos(lsGet(POS_PREFIX + 'single'));
        if (!(o && o.s)) return;
        var el = document.getElementById(o.s);
        if (!el || !(o.r > 0.002 && o.r < 0.998)) return;
        setTimeout(function () {
          if (window.scrollY > 0) return;
          window.scrollTo(0, el.offsetTop + o.r * el.offsetHeight);
        }, 150);
      }
    } catch (e) {}
  }

  // ============ 继续阅读（列表页横幅，取最近在读的一篇） ============
  function resumeBanner() {
    if (!isIndex && !isSingle) return;
    var list = $('.list');
    if (!list) return;
    var a = document.createElement('a');
    a.className = 'resume-card';
    if (isSingle) {
      var o = parsePos(lsGet(POS_PREFIX + 'single'));
      if (!(o && o.s && o.r > 0.002 && o.r < 0.998)) return;
      var el = document.getElementById(o.s);
      if (!el) return;   // 该文档可能已被删除
      var h1 = el.querySelector('h1');
      a.href = '#' + o.s;
      a.innerHTML = '<span class="r-label">继续阅读</span>'
        + '<span class="r-title"></span>'
        + '<span class="r-meta">上次读到约 ' + Math.round(o.r * 100) + '%</span>';
      a.querySelector('.r-title').textContent = h1 ? h1.textContent : '上次阅读的文档';
      on(a, 'click', function (e) {
        e.preventDefault();
        window.scrollTo(0, el.offsetTop + o.r * el.offsetHeight);
      });
    } else {
      // 扫描全部位置记录，取最近写入的一条（旧格式无时间戳按 0 处理）
      var best = null;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(POS_PREFIX) === 0 && k !== POS_PREFIX + 'single') {
            var p = parsePos(lsGet(k));
            if (p && p.r > 0.002 && p.r < 0.998 && (!best || p.t > best.t)) {
              best = { t: p.t, r: p.r, slug: k.slice(POS_PREFIX.length) };
            }
          }
        }
      } catch (e) { best = null; }
      if (!best) return;
      var name = best.slug.split('/').pop().replace(/\.html$/, '');
      var card = document.querySelector('.card[data-slug="' + name + '"]');
      if (!card) return;   // 文档已删除，位置记录作废
      a.href = card.getAttribute('href');
      a.innerHTML = '<span class="r-label">继续阅读</span>'
        + '<span class="r-title"></span>'
        + '<span class="r-meta">上次读到约 ' + Math.round(best.r * 100) + '%</span>';
      var h2 = card.querySelector('h2');
      a.querySelector('.r-title').textContent = h2 ? h2.textContent : '上次阅读的文档';
    }
    list.insertBefore(a, list.firstChild);
  }

  // ============ 列表搜索（列表页：标题 + 正文；单文件版：Enter 跳到第一篇命中） ============
  function initSearch() {
    var input = $('#searchInput');
    var listEl = $('.list');
    var cards = $all('.card', listEl);
    if (!input || !listEl || !cards.length) return;
    var countEl = $('#searchCount');
    var clearBtn = $('#searchClear');
    var emptyHit = null;

    // 卡片原始标题（高亮后要能还原）
    cards.forEach(function (c) {
      var h2 = c.querySelector('h2');
      c.__title = h2 ? h2.textContent : '';
    });

    function reset() {
      $all('.card .snippet', listEl).forEach(function (n) { n.remove(); });
      cards.forEach(function (c) {
        c.classList.remove('hit-title', 'hit-body');
        var h2 = c.querySelector('h2');
        if (h2 && h2.innerHTML !== escHtml(c.__title)) h2.textContent = c.__title;
      });
      listEl.classList.remove('filtering');
      if (countEl) countEl.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      if (emptyHit) { emptyHit.remove(); emptyHit = null; }
    }

    function showCount(text) {
      if (!countEl) return;
      if (text === null) { countEl.hidden = true; return; }
      countEl.textContent = text;
      countEl.hidden = false;
    }

    // 索引：列表页用构建时内联的 JSON；单文件版直接扫 DOM
    var idx = null, byKey = null, keyName = null;
    function loadIndex() {
      if (idx) return idx;
      if (isSingle) {
        keyName = 'id';
        idx = $all('.single-doc').map(function (sec) {
          var h1 = sec.querySelector('h1');
          return { id: sec.id, title: h1 ? h1.textContent : '', text: sec.textContent.toLowerCase() };
        });
      } else {
        keyName = 'slug';
        try {
          var node = document.getElementById('search-data');
          idx = node ? JSON.parse(node.textContent || '[]') : [];
        } catch (e) { idx = []; }
      }
      idx.forEach(function (d) { d.text = (d.text || '').toLowerCase(); });
      byKey = {};
      idx.forEach(function (d) { byKey[d[keyName]] = d; });
      return idx;
    }

    function cardKey(c) {
      return isSingle
        ? (c.getAttribute('href') || '').replace(/^#/, '')
        : (c.getAttribute('data-slug') || '');
    }

    function run() {
      reset();
      var q = input.value.trim().toLowerCase();
      if (!q) return;
      loadIndex();
      var hits = 0;
      cards.forEach(function (c) {
        var d = byKey[cardKey(c)];
        var inTitle = !!(d && d.title.toLowerCase().indexOf(q) >= 0);
        var pos = d ? d.text.indexOf(q) : -1;
        if (!inTitle && pos < 0) return;
        hits++;
        c.classList.add(inTitle ? 'hit-title' : 'hit-body');
        var h2 = c.querySelector('h2');
        if (h2 && inTitle) h2.innerHTML = markHtml(c.__title, q);
        if (pos >= 0 && !inTitle) {
          var start = Math.max(0, pos - 24);
          var frag = d.text.slice(start, pos + q.length + 56);
          var s = document.createElement('div');
          s.className = 'snippet';
          s.innerHTML = (start > 0 ? '…' : '') + markHtml(frag, q) + '…';
          var meta = c.querySelector('.meta');
          if (meta) c.insertBefore(s, meta); else c.appendChild(s);
        }
      });
      listEl.classList.add('filtering');
      showCount('命中 ' + hits + ' / ' + cards.length + ' 篇');
      if (clearBtn) clearBtn.hidden = false;
      if (!hits) {
        emptyHit = document.createElement('div');
        emptyHit.className = 'empty';
        emptyHit.textContent = '没有找到「' + input.value.trim() + '」';
        listEl.appendChild(emptyHit);
      }
    }

    on(input, 'input', throttle(200, run));
    on(input, 'keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (isSingle) {
        // 单文件版：跳到第一篇命中的文档
        var first = $all('.card.hit-title, .card.hit-body', listEl)[0];
        if (first) {
          var sec = document.getElementById(cardKey(first));
          if (sec) {
            window.scrollTo(0, Math.max(0, sec.offsetTop - 12));
            sec.classList.remove('flash');
            // 触发一次闪烁动画，标记落点
            void sec.offsetWidth;
            sec.classList.add('flash');
          }
        }
      } else {
        run();
      }
    });
    on(clearBtn, 'click', function () {
      input.value = '';
      reset();
      input.focus();
    });
  }

  // ============ 页内查找（阅读页 / 单文件版：高亮 + 上一个/下一个） ============
  var closeFindFn = null;
  function initFind() {
    var bar = $('#findBar');
    var input = $('#findInput');
    var cnt = $('#findCount');
    if (!bar || !input) return;
    var marks = [], curIdx = -1, timer = null;
    var SKIP = 'header, .readbar, .fs-pop, .find-bar, .toc-panel, .copy-btn, script, style, mark, '
      + '.search-row, .resume-card, .sw-banner, .lightbox, .progress, .doc-nav';

    function clearMarks() {
      marks.forEach(function (m) {
        var p = m.parentNode;
        if (!p) return;
        p.replaceChild(document.createTextNode(m.textContent), m);
        p.normalize();
      });
      marks = [];
      curIdx = -1;
    }
    function setCur(i, scroll) {
      if (!marks.length) return;
      if (curIdx >= 0 && marks[curIdx]) marks[curIdx].classList.remove('cur');
      curIdx = ((i % marks.length) + marks.length) % marks.length;
      var m = marks[curIdx];
      m.classList.add('cur');
      if (cnt) cnt.textContent = (curIdx + 1) + ' / ' + marks.length;
      if (scroll !== false) {
        var y = m.getBoundingClientRect().top + window.scrollY - 110;
        window.scrollTo(0, Math.max(0, y));
      }
    }
    function doFind() {
      clearMarks();
      var q = input.value.trim();
      if (!q) { if (cnt) cnt.textContent = ''; return; }
      var root = isSingle ? document.body : ($('.doc') || document.body);
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var el = n.parentElement;
          if (el && el.closest && el.closest(SKIP)) return NodeFilter.FILTER_REJECT;
          return n.nodeValue.toLowerCase().indexOf(q.toLowerCase()) >= 0
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      var ql = q.toLowerCase();
      nodes.forEach(function (n) {
        if (marks.length > 500) return;   // 防极端长文卡顿
        var text = n.nodeValue, low = text.toLowerCase(), i = 0, j;
        var parts = [];
        while ((j = low.indexOf(ql, i)) >= 0) {
          if (j > i) parts.push(document.createTextNode(text.slice(i, j)));
          var mk = document.createElement('mark');
          mk.textContent = text.slice(j, j + q.length);
          parts.push(mk);
          marks.push(mk);
          i = j + q.length;
        }
        if (!parts.length) return;
        if (i < text.length) parts.push(document.createTextNode(text.slice(i)));
        var parent = n.parentNode;
        if (!parent) return;
        parts.forEach(function (f) { parent.insertBefore(f, n); });
        parent.removeChild(n);
      });
      if (marks.length) setCur(0, true);
      else if (cnt) cnt.textContent = '无结果';
    }
    function closeFind() {
      bar.hidden = true;
      clearMarks();
      if (cnt) cnt.textContent = '';
    }
    closeFindFn = closeFind;
    on($('#findBtn'), 'click', function () {
      bar.hidden = false;
      input.focus();
      input.select();
    });
    on($('#findClose'), 'click', closeFind);
    on($('#findNext'), 'click', function () { if (marks.length) setCur(curIdx + 1, true); });
    on($('#findPrev'), 'click', function () { if (marks.length) setCur(curIdx - 1, true); });
    on(input, 'input', function () {
      clearTimeout(timer);
      timer = setTimeout(doFind, 250);
    });
    on(input, 'keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (marks.length) setCur(curIdx + 1, true);
        else doFind();
      }
    });
  }

  // ============ 目录 scrollspy：滚到哪节，目录里高亮到哪条；顶栏标题随之切换 ============
  var titleEl = $('#docTitle');
  if (titleEl) titleEl.dataset.base = titleEl.textContent;
  if (isReader) buildSpy($('.toc-panel'));
  function updateSpy() {
    if (!spyItems.length) return;
    var line = window.scrollY + window.innerHeight * 0.35;
    var cur = null;
    for (var i = 0; i < spyItems.length; i++) {
      if (spyItems[i].h.offsetTop <= line) cur = spyItems[i];
      else break;
    }
    spyItems.forEach(function (it) {
      var active = it === cur;
      if (it.a.classList.contains('active') !== active) {
        it.a.classList.toggle('active', active);
        if (active && document.body.classList.contains('toc-open')) {
          it.a.scrollIntoView({ block: 'nearest' });
        }
      }
    });
    // 顶栏标题：深处阅读时显示当前小节，回到篇首恢复文档标题
    if (titleEl) {
      var name = cur ? cur.a.textContent : (titleEl.dataset.base || '');
      if (titleEl.textContent !== name) titleEl.textContent = name;
    }
  }

  // ============ 阅读进度条（顺带刷新目录抽屉里的「已读 x%」） ============
  var progress = $('#progress');
  function updateProgress() {
    if (!progress) return;
    var h = docHeight();
    var pct = h > 0 ? Math.min(100, Math.max(0, window.scrollY / h * 100)) : 0;
    progress.style.width = pct + '%';
    var tp = $('#tocPct');
    if (tp) tp.textContent = pct > 1 ? '已读 ' + Math.round(pct) + '%' : '';
  }

  // ============ 代码块一键复制 ============
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function copyText(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); },
        function () { cb(fallbackCopy(text)); });
    } else {
      cb(fallbackCopy(text));
    }
  }
  $all('.doc pre').forEach(function (pre) {
    pre.setAttribute('tabindex', '0');   // 可滚动区域可聚焦（可访问性）
    // 按钮包在滚动容器外：代码横向滚动时按钮仍固定在右上角
    if (pre.parentElement && pre.parentElement.classList.contains('pre-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'pre-wrap';
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    on(btn, 'click', function () {
      var code = pre.querySelector('code') || pre;
      copyText(code.innerText || code.textContent, function (ok) {
        btn.textContent = ok ? '已复制' : '复制失败';
        btn.classList.toggle('ok', ok);
        setTimeout(function () {
          btn.textContent = '复制';
          btn.classList.remove('ok');
        }, 1200);
      });
    });
    wrap.appendChild(btn);
  });

  // ============ 图片灯箱（点击正文图片全屏查看） ============
  var lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.innerHTML = '<img alt="">';
  document.body.appendChild(lightbox);
  $all('.doc img').forEach(function (img) {
    img.classList.add('zoomable');
    on(img, 'click', function () {
      lightbox.querySelector('img').src = img.currentSrc || img.src;
      document.body.classList.add('img-zoom');
    });
  });
  on(lightbox, 'click', function () { document.body.classList.remove('img-zoom'); });

  // Esc：依次关灯箱 / 查找条 / 设置面板 / 目录抽屉
  on(document, 'keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('img-zoom')) {
      document.body.classList.remove('img-zoom');
    } else if (closeFindFn && $('#findBar') && !$('#findBar').hidden) {
      closeFindFn();
    } else if (fsPop && !fsPop.hidden) {
      closePopover();
    } else if (document.body.classList.contains('toc-open')) {
      document.body.classList.remove('toc-open');
      showTopbar();
    }
  });

  // ============ 列表排序切换（更新时间 / 标题） ============
  function initSort() {
    var btn = $('#sortBtn');
    var listEl = $('.list');
    var cards = $all('.card', listEl);
    if (!btn || !listEl || !cards.length) return;
    var KEY = 'md2phone.sort';
    function apply(mode) {
      var sorted = cards.slice().sort(function (a, b) {
        if (mode === 'title') {
          return (a.getAttribute('data-title') || '')
            .localeCompare(b.getAttribute('data-title') || '', 'zh-Hans-CN');
        }
        return (parseInt(b.getAttribute('data-mts'), 10) || 0)
          - (parseInt(a.getAttribute('data-mts'), 10) || 0);
      });
      sorted.forEach(function (c) { listEl.appendChild(c); });
      btn.textContent = mode === 'title' ? '⇅ 标题' : '⇅ 时间';
      btn.title = '排序：' + (mode === 'title' ? '按标题' : '按更新时间') + '（点击切换）';
      btn.setAttribute('aria-label', btn.title);
    }
    var mode = lsGet(KEY) === 'title' ? 'title' : 'time';
    apply(mode);
    on(btn, 'click', function () {
      mode = mode === 'title' ? 'time' : 'title';
      lsSet(KEY, mode);
      apply(mode);
    });
  }

  // ============ 列表滚动位置记忆（从阅读页返回不回顶） ============
  function initListScroll() {
    var KEY = 'md2phone.listScroll';
    var y = 0;
    try { y = parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0; } catch (e) {}
    if (y > 0 && !location.hash) {
      setTimeout(function () { window.scrollTo(0, y); }, 80);
    }
    var save = throttle(300, function () {
      try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {}
    });
    on(window, 'scroll', save, { passive: true });
  }

  // ============ 初始化（顺序有讲究：横幅先插入，列表位置恢复在其后） ============
  restorePos();
  resumeBanner();
  adaptTables();
  if (isIndex) {
    initListScroll();
    initSort();
  }
  initSearch();
  initFind();

  // ============ 滚动统一处理：rAF 节流渲染 + 400ms 节流写位置 ============
  var savePosThrottled = throttle(400, savePos);
  var ticking = false;
  on(window, 'scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      updateSpy();
      updateProgress();
      syncTopbar();
      document.body.classList.toggle('deep-scroll',
        window.scrollY > window.innerHeight * 2.5);
      savePosThrottled();
    });
  }, { passive: true });
  on(window, 'resize', throttle(180, adaptTables));
  window.addEventListener('pagehide', savePos);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') savePos();
  });
  window.addEventListener('load', function () {
    updateProgress();
    updateSpy();
    syncTopbar();
    adaptTables();
    document.body.classList.toggle('deep-scroll',
      window.scrollY > window.innerHeight * 2.5);
  });

  // ============ 内容身份标识（排障：一眼看出加载的是哪份内容、有没有脚本异常） ============
  function fillSrc(text) {
    $all('.build-id .fs-src, .fs-ver .fs-src').forEach(function (el) { el.textContent = text; });
  }
  fillSrc(/android_asset/.test(location.href) ? 'APK 内置'
        : /\/files\//.test(location.href) ? '导入快照' : '网页');
  window.onerror = function (msg, src2, line) {
    fillSrc('脚本异常 ' + String(msg).slice(0, 60) + ' @' + line);
  };

  // ============ Service Worker：HTTPS（或 localhost）下注册 ============
  // shell 资源 cache-first 秒开；SW 换代激活后广播「内容已更新」提示条
  var secure = location.protocol === 'https:' ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'md2phone:updated' && !$('#swBanner')) {
        var b = document.createElement('div');
        b.id = 'swBanner';
        b.className = 'sw-banner';
        b.innerHTML = '<span>内容已更新</span>';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '刷新查看';
        on(btn, 'click', function () { location.reload(); });
        b.appendChild(btn);
        document.body.appendChild(b);
        requestAnimationFrame(function () { document.body.classList.add('sw-update'); });
        setTimeout(function () { document.body.classList.remove('sw-update'); }, 10000);
      }
    });
  }
})();
