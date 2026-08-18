/* main.js — 啟動流程、事件接線、Sheet、Service Worker（SPEC §9.1）。 */
(function (A) {
  'use strict';

  var BASE = '/daily-tick/';
  var ui = null;
  var lastLogical = null;
  var toastTimer = null;

  /* ================= Toast ================= */
  A.toast = function (msg, ms) {
    var el = A.$('#toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2200);
  };

  /* ================= 分頁與捲動記憶（SPEC §9.2、GAME_SPEC §4b.3） ================= */
  var saveUi = A.debounce(function () { A.writeUiState(ui); }, 200);

  function currentView() { return A.render.els.views[A.tab]; }

  function restoreScroll() {
    Object.keys(A.render.els.views).forEach(function (k) {
      var v = A.render.els.views[k];
      if (v) v.scrollTop = (ui.scroll && ui.scroll[k]) || 0;
    });
  }

  /* 舊版 ui_state 的 tab 是 daily/general/stats：遷移成新結構 */
  function migrateUi(u) {
    if (u.tab === 'daily' || u.tab === 'general') {
      u.taskPane = u.tab;
      u.tab = 'tasks';
    } else if (u.tab === 'stats') {
      u.tab = 'stats';
    }
    if (['battle', 'bag', 'tasks', 'stats'].indexOf(u.tab) < 0) u.tab = 'tasks';
    if (u.taskPane !== 'general') u.taskPane = 'daily';
    if (u.bagPane !== 'dex') u.bagPane = 'owned';
    u.scroll = u.scroll || {};
    return u;
  }

  function renderTab(tab, opts) {
    if (tab === 'tasks') {
      A.render.list('daily', opts || { animate: false });
      A.render.list('general', opts || { animate: false });
    } else if (tab === 'stats') {
      A.render.stats();
      A.grender.gameStats();
    } else if (tab === 'battle') {
      A.grender.battle();
    } else if (tab === 'bag') {
      if (ui.bagPane === 'dex') A.grender.dex();
      else A.grender.owned();
    }
  }

  function setTab(tab) {
    if (tab === A.tab) return;
    var v = currentView();
    if (v) ui.scroll[A.tab] = v.scrollTop;
    A.tab = tab;
    ui.tab = tab;
    if (A.mode === 'edit' && tab !== 'tasks') setMode('normal', true);
    A.gestures.closeOpen(false);
    A.grender.stopReplay(true);
    renderTab(tab);
    A.render.chrome();
    var nv = currentView();
    if (nv) nv.scrollTop = ui.scroll[tab] || 0;
    saveUi();
  }

  function setTaskPane(pane) {
    if (pane === A.taskPane) return;
    A.taskPane = pane;
    ui.taskPane = pane;
    A.gestures.closeOpen(false);
    A.render.chrome();
    saveUi();
  }

  function setBagPane(pane) {
    ui.bagPane = pane;
    A.$$('#seg-bag button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.pane === pane ? 'true' : 'false');
    });
    A.$('#pane-owned').hidden = pane !== 'owned';
    A.$('#pane-dex').hidden = pane !== 'dex';
    renderTab('bag');
    saveUi();
  }

  /* ================= 編輯模式 ================= */
  function setMode(mode, quiet) {
    A.mode = mode;
    A.gestures.closeOpen(false);
    A.render.chrome();
    if (!quiet) {
      A.render.list('daily', { animate: true });
      A.render.list('general', { animate: true });
    }
    enableSort(mode === 'edit');
  }

  /* ================= Sortable（本地檔案，進編輯模式才載入） ================= */
  var sortablePromise = null;
  var sortables = {};

  function loadSortable() {
    if (sortablePromise) return sortablePromise;
    sortablePromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BASE + 'vendor/sortable.min.js';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('sortable load failed')); };
      document.head.appendChild(s);
    });
    return sortablePromise;
  }

  function enableSort(on) {
    if (!on) {
      Object.keys(sortables).forEach(function (k) { sortables[k].option('disabled', true); });
      return;
    }
    loadSortable().then(function () {
      ['daily', 'general'].forEach(function (type) {
        var listEl = A.render.els.lists[type];
        if (sortables[type]) { sortables[type].option('disabled', false); return; }
        sortables[type] = new Sortable(listEl, {
          handle: '.drag-handle',
          draggable: '.row',
          animation: A.token('--dur-mid', 200),
          delay: 0,
          fallbackTolerance: 3,
          onEnd: function () {
            var ids = A.$$(':scope > .row', listEl).map(function (r) { return r.dataset.id; });
            A.applyOrder(type, ids);
            A.save();
          }
        });
      });
    }).catch(function () {
      A.toast('排序元件載入失敗，請連線後再試');
    });
  }

  /* ================= 任務 Sheet ================= */
  var editingId = null;
  var sheetType = 'daily';

  function openSheet(el) {
    el.hidden = false;
    void el.offsetHeight;
    el.classList.add('is-open');
  }

  function closeSheet(el) {
    dropKeyboard();
    el.classList.remove('is-open');
    var dur = A.token('--dur-mid', 200);
    setTimeout(function () { el.hidden = true; }, A.reducedMotion() ? 0 : dur);
  }

  var UNIT_WORD = { day: '天', week: '週', month: '個月', year: '年' };
  var sheetUnit = 'day';
  var sheetDifficulty = 1;

  function applyDifficultyUi() {
    A.$$('#seg-difficulty button').forEach(function (b) {
      b.setAttribute('aria-pressed', Number(b.dataset.diff) === sheetDifficulty ? 'true' : 'false');
    });
    /* 提示每難度對應的寶石（對照表在遊戲層，todo 只顯示） */
    var gems = A.gc.coinsFor(sheetType, sheetDifficulty);
    A.$('#diff-hint').textContent = '完成一次獲得 💎' + gems;
  }

  function sheetRepeatPreview() {
    return {
      type: 'daily',
      start_date: A.$('#input-start').value || A.logicalToday(),
      repeat: { unit: sheetUnit, interval: Number(A.$('#input-interval').value) || 1 }
    };
  }

  function applyRepeatUi() {
    A.$$('#seg-repeat button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.unit === sheetUnit ? 'true' : 'false');
    });
    A.$('#interval-unit').textContent = UNIT_WORD[sheetUnit] || '天';
    A.$('#repeat-summary').textContent = A.repeatLabel(sheetRepeatPreview());
  }

  function applySheetType() {
    A.$('#group-schedule').hidden = sheetType !== 'daily';
    A.$('#sheet-task-title').textContent =
      (editingId ? '編輯' : '新增') + (sheetType === 'daily' ? '日常任務' : '一般任務');
    A.$$('#seg-type button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.type === sheetType ? 'true' : 'false');
    });
  }

  A.openTaskSheet = function (task) {
    var sheet = A.$('#sheet-task');
    var input = A.$('#input-title');
    editingId = task ? task.id : null;
    sheetType = task ? task.type : (A.tab === 'general' ? 'general' : 'daily');

    A.$('#btn-task-save').textContent = task ? '儲存' : '創建';
    A.$('#group-type').hidden = !!task;              /* 既有任務不改類型 */
    input.value = task ? task.title : '';
    A.$('#input-note').value = task ? (task.note || '') : '';
    sheetDifficulty = task ? (task.difficulty || 1) : 1;   /* 預設最低（SPEC §4.1a） */

    var r = task && task.type === 'daily' ? A.repeatRule(task) : { unit: 'day', interval: 1 };
    sheetUnit = r.unit;
    A.$('#input-interval').value = String(r.interval);
    A.$('#input-start').value = (task && task.start_date) ? task.start_date : A.logicalToday();

    applySheetType();
    applyRepeatUi();
    applyDifficultyUi();

    openSheet(sheet);
    input.focus();
    if (task) input.setSelectionRange(input.value.length, input.value.length);
  };

  function collectSheetFields() {
    return {
      title: A.$('#input-title').value.trim(),
      note: A.$('#input-note').value.trim(),
      difficulty: sheetDifficulty,
      start_date: A.$('#input-start').value || A.logicalToday(),
      unit: sheetUnit,
      interval: Math.min(99, Math.max(1, Math.round(Number(A.$('#input-interval').value) || 1)))
    };
  }

  function saveTaskSheet() {
    var fields = collectSheetFields();
    if (!fields.title) { A.toast('請輸入任務標題'); A.$('#input-title').focus(); return; }

    if (editingId) {
      var t = A.updateTask(editingId, fields);
      if (t) A.render.list(t.type, { animate: true });
    } else {
      var nt = A.addTask(sheetType, fields);
      if (A.tab !== 'tasks') setTab('tasks');
      if (A.taskPane !== nt.type) setTaskPane(nt.type);
      A.render.list(nt.type, { animate: true });
      if (nt.type === 'daily' && !A.dueToday(nt)) {
        A.toast('已新增，下次到期 ' + A.nextDueAfter(nt, A.logicalToday()));
      }
    }
    if (A.tab === 'stats') A.render.stats();
    A.save();
    closeSheet(A.$('#sheet-task'));
    editingId = null;
  }

  /* ================= 設定 Sheet ================= */
  function fillSettings() {
    var sel = A.$('#input-reset-hour');
    if (!sel.options.length) {
      for (var h = 0; h < 24; h++) {
        var o = document.createElement('option');
        o.value = String(h);
        o.textContent = A.pad2(h) + ':00';
        sel.appendChild(o);
      }
    }
    sel.value = String(A.resetHour());

    var pat = A.$('#input-pat');
    pat.value = '';
    pat.placeholder = A.sync.token() ? '已設定（重新輸入可更換）' : 'ghp_...';

    A.$('#ta-export').value = JSON.stringify(A.state, null, 2);
    A.$('#ta-import').value = '';
    renderDeletedList();
    A.$('#about-line').textContent = '版本 ' + (A.version || '?') +
      ' ・ schema v' + A.SCHEMA_VERSION +
      (A.sync.gistId() ? ' ・ gist ' + A.sync.gistId().slice(0, 8) : '');
    renderSyncStatus();
  }

  /* ---------- 設定頁：已刪除的任務 ---------- */
  function shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + A.pad2(d.getMonth() + 1) + '-' + A.pad2(d.getDate());
  }

  function renderDeletedList() {
    var host = A.$('#deleted-list');
    if (!host) return;
    host.textContent = '';

    var list = A.deletedTasks();
    if (!list.length) {
      host.appendChild(A.el('p', 'hint', '沒有已刪除的任務'));
      return;
    }

    list.forEach(function (t) {
      var box = A.el('div', 'del-item');
      box.appendChild(A.el('div', 'del-name', t.title));

      var bits = [t.type === 'daily' ? '日常' : '一般', '刪除於 ' + shortDate(t.deleted_at)];
      if (t.type === 'daily') bits.push(t.history.length + ' 次紀錄');
      box.appendChild(A.el('div', 'del-meta', bits.join('・')));

      var acts = A.el('div', 'del-actions');
      var restore = A.el('button', 'btn is-compact on-surface-2', '還原');
      restore.type = 'button';
      restore.dataset.act = 'restore';
      restore.dataset.id = t.id;
      var purge = A.el('button', 'btn is-compact is-danger', '永久刪除');
      purge.type = 'button';
      purge.dataset.act = 'purge';
      purge.dataset.id = t.id;
      acts.appendChild(restore);
      acts.appendChild(purge);
      box.appendChild(acts);

      host.appendChild(box);
    });
  }

  function onDeletedListClick(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.dataset.id;
    var task = A.findTask(id);
    if (!task) return;

    if (btn.dataset.act === 'restore') {
      var t = A.restoreTask(id);
      if (!t) return;
      A.save();
      A.render.list(t.type, { animate: true });
      if (A.tab === 'stats') A.render.stats();
      renderDeletedList();
      A.toast('已還原「' + t.title + '」');
      return;
    }

    /* 永久刪除：唯一真的把資料丟掉的路徑，訊息要把代價講清楚 */
    var msg;
    if (task.type === 'daily' && task.history.length) {
      msg = '永久刪除「' + task.title + '」？此任務的 ' + task.history.length +
            ' 次完成紀錄將無法復原，未來的統計功能也不會計入。';
    } else {
      msg = '永久刪除「' + task.title + '」？此任務將無法復原。';
    }
    if (!confirm(msg)) return;
    A.purgeTask(id);
    A.save();
    renderDeletedList();
    A.toast('已永久刪除');
  }

  function renderSyncStatus() {
    var s = A.sync;
    var statusEl = A.$('#sync-status');
    if (statusEl) statusEl.textContent = s.statusText();

    var detail = A.$('#sync-detail');
    if (detail) {
      var parts = [];
      if (s.message) parts.push(s.message);
      var last = s.lastSyncedAt();
      if (last) {
        var d = new Date(last);
        parts.push('最後同步 ' + d.getFullYear() + '-' + A.pad2(d.getMonth() + 1) + '-' +
                   A.pad2(d.getDate()) + ' ' + A.pad2(d.getHours()) + ':' + A.pad2(d.getMinutes()));
      }
      detail.textContent = parts.join('　');
    }

    var dot = A.$('#sync-dot');
    if (dot) {
      var bad = s.status === 'error';
      var busy = s.status === 'syncing' || s.status === 'offline';
      dot.hidden = !(bad || busy);
      dot.classList.toggle('is-error', bad);
    }
  }

  function doImport() {
    var text = A.$('#ta-import').value.trim();
    if (!text) { A.toast('請先貼上要匯入的 JSON'); return; }
    var res = A.parsePayload(text);
    if (!res.ok) { A.toast(res.error); return; }
    if (!confirm('匯入會覆蓋這台裝置上的所有資料，並同步覆蓋雲端備份。確定要繼續嗎？')) return;

    A.state = res.state;
    A.save();                       /* 更新 updated_at 並排入上傳 */
    A.sync.pushNow();               /* 強制推一份，避免被舊備份蓋回 */
    lastLogical = A.logicalToday();
    A.render.all({ animate: false });
    restoreScroll();
    fillSettings();
    A.toast('已匯入 ' + A.activeTasks().length + ' 筆任務');
  }

  function copyExport() {
    var ta = A.$('#ta-export');
    var done = function () { A.toast('已複製'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done, function () { legacyCopy(ta, done); });
    } else {
      legacyCopy(ta, done);
    }
  }

  function legacyCopy(ta, done) {
    ta.removeAttribute('readonly');
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { A.toast('複製失敗，請長按選取'); }
    ta.setAttribute('readonly', 'readonly');
    ta.setSelectionRange(0, 0);
    ta.blur();
  }

  /* ================= 邏輯日期換日偵測 ================= */
  function checkDate() {
    var d = A.logicalToday();
    if (d === lastLogical) return;
    lastLogical = d;
    A.render.list('daily', { animate: true });
    if (A.tab === 'stats') A.render.stats();
  }

  /* ================= 可視區域與鍵盤（SPEC §7.5） =================
     iOS 的鍵盤是疊在畫面上的：layout viewport 不變，只有 visual viewport 縮小，
     而且 visualViewport 的通報永遠慢一拍（resize 多在動畫結束才來，scroll 在
     動畫期間零星地來）。用 JS 追著改 sheet 的幾何，必然在鍵盤滑上來的過程中
     產生位移；而只要 sheet 的高度變小，下緣以下就會露出背後的清單，鍵盤再一路
     蓋過去，看起來就是「畫面跟著晃」。

     因此這裡的原則是：**sheet 的幾何完全不變**（永遠不透明全螢幕）。鍵盤高度只
     餵給內容區的底部留白 --kb-h，改它不會讓畫面上任何東西移動，長內容也仍然
     能捲到鍵盤上方。--vv-top 只是保險：極少數情況 iOS 仍會搬動可視區域，等鍵盤
     靜止後才補償一次，動畫期間一律不動。 */
  var VP = (function () {
    var root = document.documentElement;
    var vv = window.visualViewport;
    var KB_ANIM = 420;            /* iOS 鍵盤動畫約 250-350ms，留餘裕 */
    var KB_GUESS_RATIO = 0.42;    /* 還沒量過時的估計值，之後由實測取代 */
    var MIN_KB = 100;             /* 小於此值不視為鍵盤 */
    var lockUntil = 0;
    var lockTimer = null;
    var queued = false;

    function set(kb, top) {
      root.style.setProperty('--kb-h', Math.round(kb) + 'px');
      root.style.setProperty('--vv-top', Math.round(top || 0) + 'px');
    }

    function remembered() {
      var v = Number(A.ls.get(A.LSK.kb));
      return isFinite(v) && v > MIN_KB ? v : 0;
    }

    function measure() {
      if (!vv) { set(0, 0); return; }
      var kb = window.innerHeight - vv.height;
      if (kb < MIN_KB) kb = 0;
      else A.ls.set(A.LSK.kb, String(Math.round(kb)));
      set(kb, vv.offsetTop);
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    }

    function lock() {
      lockUntil = Date.now() + KB_ANIM;
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(function () { lockTimer = null; measure(); }, KB_ANIM + 30);
    }

    function onChange() {
      if (Date.now() < lockUntil) return;     /* 鍵盤動畫期間一律不動 */
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; measure(); });
    }

    return {
      watch: function () {
        if (!vv) { set(0, 0); return; }
        vv.addEventListener('resize', onChange);
        vv.addEventListener('scroll', onChange);
        window.addEventListener('orientationchange', function () {
          lockUntil = 0;
          setTimeout(measure, 120);
        });
        measure();
      },
      /* 在 focus 的同一個 task 內呼叫：先把留白開好，讓 iOS 沒有捲動的理由 */
      keyboardOpening: function () {
        set(remembered() || Math.round(window.innerHeight * KB_GUESS_RATIO), 0);
        lock();
      },
      keyboardClosing: function () {
        set(0, 0);
        lock();
      }
    };
  })();

  function isTextField(el) {
    return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  /* 關閉 sheet 時收鍵盤，並把 iOS 可能留下的文件捲動歸零 */
  function dropKeyboard() {
    var a = document.activeElement;
    if (a && a.blur) a.blur();
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  }

  /* ================= 版本與更新提示 =================
     不只依賴 Service Worker 的訊息：訊息可能在頁面掛上監聽之前就發出去，
     所以（一）監聽在啟動時就掛好，（二）載入後主動問 SW，
     （三）另外用一個帶 live 參數、不被 SW 攔截的請求去比對線上版本。 */
  var APP_VERSION = (function () {
    var m = document.querySelector('meta[name="app-version"]');
    return m ? m.content : '';
  })();
  A.version = APP_VERSION;

  var barShown = false;
  function showUpdateBar() {
    if (barShown) return;
    barShown = true;
    A.$('#update-bar').hidden = false;
  }
  A.showUpdateBar = showUpdateBar;

  function onSwMessage(e) {
    if (e.data && e.data.type === 'asset-updated') showUpdateBar();
  }

  /* 直接問線上的 index.html 版本號（?live=1 不會被 SW 攔） */
  function pollVersion() {
    if (!APP_VERSION) return;
    fetch(BASE + 'index.html?live=1&t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (html) {
        if (!html) return;
        var m = html.match(/name="app-version"\s+content="([^"]+)"/);
        if (m && m[1] !== APP_VERSION) showUpdateBar();
      })
      .catch(function () { /* 離線：安靜略過 */ });
  }
  A.pollVersion = pollVersion;

  function reloadWithFreshCache() {
    var done = false;
    var go = function () { if (!done) { done = true; location.reload(); } };
    var sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) { go(); return; }
    var onMsg = function (e) { if (e.data && e.data.type === 'refreshed') go(); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    sw.postMessage({ type: 'refresh' });     /* 先把快取換成新版，再重載 */
    setTimeout(go, 2500);                    /* 逾時就直接重載 */
  }

  /* ================= Service Worker ================= */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE })
      .catch(function (e) { console.warn('SW 註冊失敗', e); });
    /* 主動問一次：補上「訊息比監聽早發出」的漏接 */
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'check' });
    }
    setTimeout(pollVersion, 2500);
  }

  /* ================= 事件接線 ================= */
  function wire() {
    A.$$('.tab').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });

    A.$('#seg-tasks').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setTaskPane(b.dataset.pane);
    });
    A.$('#seg-bag').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setBagPane(b.dataset.pane);
    });

    A.$('#btn-edit').addEventListener('click', function () {
      setMode(A.mode === 'edit' ? 'normal' : 'edit');
    });

    /* ---------- 對戰 ---------- */
    A.$('#btn-fight').addEventListener('click', function () {
      var result = A.farm.battleOnce(null, { manual: true });
      A.grender.playResult(result, { done: function () { A.grender.battle(); } });
      A.grender.battle();
    });
    A.$('#btn-auto').addEventListener('click', function () {
      A.farm.setAuto(!A.game.stage.auto_farming);
    });
    A.$('#btn-skip').addEventListener('click', function () {
      A.grender.stopReplay(true);
      A.grender.battle();
    });
    A.$('#btn-claim').addEventListener('click', function () {
      var got = A.farm.claim();
      if (!got) { A.toast('目前沒有待領的獎勵'); return; }
      A.grender.battle();
      A.toast('領取 🔧' + A.gc.fmt(got.material) + '　🪙' + A.gc.fmt(got.gold));
    });
    A.farm.onChange = function () {
      if (A.tab === 'battle') A.grender.battle();
      else A.grender.resources();
    };
    A.farm.onBattle = function (result) {
      if (A.tab === 'battle') A.grender.playResult(result, { instant: true });
    };

    /* ---------- 抽卡 ---------- */
    var gachaSheet = A.$('#sheet-gacha');
    A.$('#btn-gacha-open').addEventListener('click', function () {
      A.grender.gacha();
      A.$('#pull-result').textContent = '';
      openSheet(gachaSheet);
    });
    gachaSheet.addEventListener('click', function (e) {
      if (e.target.dataset && e.target.dataset.act === 'close') closeSheet(gachaSheet);
    });
    function doPulls(n) {
      var results = [];
      for (var i = 0; i < n; i++) {
        var r = A.gacha.pull('general');
        if (r.error) { if (!results.length) A.toast(r.error); break; }
        results.push(r);
      }
      if (results.length) {
        A.grender.showPulls(results);
        A.grender.gacha();
        A.grender.resources();
      }
    }
    A.$('#btn-pull-1').addEventListener('click', function () { doPulls(1); });
    A.$('#btn-pull-10').addEventListener('click', function () { doPulls(10); });

    /* ---------- 背包 ---------- */
    A.$('#pane-owned').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn || btn.disabled) return;
      var id = btn.dataset.id;
      var r;
      if (btn.dataset.act === 'equip') r = A.gacha.equip(id);
      else if (btn.dataset.act === 'unequip') r = A.gacha.unequip(id);
      else if (btn.dataset.act === 'upgrade') {
        r = A.gacha.upgrade(id);
        if (r && r.level) A.toast('強化成功　Lv ' + r.level + '/' + r.cap);
      }
      if (r && r.error) { A.toast(r.error); return; }
      A.grender.owned();
      A.grender.resources();
    });

    A.$('#pane-dex').addEventListener('click', function (e) {
      var typeBtn = e.target.closest('button[data-filter-type]');
      if (typeBtn) {
        A.grender.dexState.type = typeBtn.dataset.filterType;
        A.grender.dexState.selected = null;
        A.grender.dex();
        return;
      }
      var cell = e.target.closest('.dex-cell');
      if (cell) {
        A.grender.dexState.selected = cell.dataset.id;
        A.grender.dexGrid();
      }
    });
    A.$('#pane-dex').addEventListener('change', function (e) {
      var d = A.grender.dexState;
      if (e.target.id === 'dex-tag') d.tag = e.target.value;
      else if (e.target.id === 'dex-rarity') d.rarity = e.target.value;
      else if (e.target.id === 'dex-sort') d.sort = e.target.value;
      else return;
      A.grender.dexGrid();
    });
    A.$('#pane-dex').addEventListener('input', function (e) {
      if (e.target.id !== 'dex-q') return;
      A.grender.dexState.q = e.target.value.trim();
      A.grender.dexGrid();
    });

    A.$('#fab').addEventListener('click', function () { A.openTaskSheet(null); });

    A.$('#btn-clear-done').addEventListener('click', function () {
      if (!A.hasCompletedGeneral()) return;
      if (!confirm('清除「一般」分頁所有已完成的任務？此動作無法復原。')) return;
      var n = A.clearCompletedGeneral();
      A.render.list('general', { animate: true });
      A.save();
      A.toast('已清除 ' + n + ' 筆');
    });

    /* 任務 sheet */
    var taskSheet = A.$('#sheet-task');
    taskSheet.addEventListener('click', function (e) {
      var act = e.target.dataset ? e.target.dataset.act : null;
      if (act === 'cancel') { closeSheet(taskSheet); editingId = null; }
      else if (act === 'save') saveTaskSheet();
    });
    A.$('#seg-type').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      sheetType = b.dataset.type;
      applySheetType();
      applyDifficultyUi();
    });
    A.$('#seg-difficulty').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      sheetDifficulty = Number(b.dataset.diff);
      applyDifficultyUi();
    });
    A.$('#seg-repeat').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      sheetUnit = b.dataset.unit;
      applyRepeatUi();
    });
    A.$('#input-interval').addEventListener('input', function (e) {
      var v = Math.round(Number(e.target.value));
      if (isFinite(v) && v > 99) e.target.value = '99';
      applyRepeatUi();
    });
    A.$('#input-interval').addEventListener('blur', function (e) {
      var v = Math.min(99, Math.max(1, Math.round(Number(e.target.value) || 1)));
      e.target.value = String(v);
      applyRepeatUi();
    });
    A.$('#input-start').addEventListener('change', applyRepeatUi);
    A.$('#input-title').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); A.$('#input-note').focus(); }
    });

    /* 設定 sheet */
    var setSheet = A.$('#sheet-settings');
    A.$('#btn-settings').addEventListener('click', function () {
      fillSettings();
      openSheet(setSheet);
    });
    setSheet.addEventListener('click', function (e) {
      if (e.target.dataset && e.target.dataset.act === 'close') closeSheet(setSheet);
    });
    A.$('#input-reset-hour').addEventListener('change', function (e) {
      A.state.settings.reset_hour = A.clampHour(e.target.value);
      A.save();
      lastLogical = A.logicalToday();
      A.render.list('daily', { animate: true });
      A.render.stats();
    });
    A.$('#btn-pat-save').addEventListener('click', function () {
      var v = A.$('#input-pat').value.trim();
      if (!v) { A.toast('請貼上 PAT'); return; }
      A.sync.setToken(v);
      A.$('#input-pat').value = '';
      A.$('#input-pat').placeholder = '已設定（重新輸入可更換）';
      A.sync.startup().then(fillSettings);
    });
    A.$('#btn-pat-clear').addEventListener('click', function () {
      A.sync.setToken('');
      fillSettings();
      A.toast('已移除備份設定');
    });
    A.$('#btn-sync-now').addEventListener('click', function () {
      if (!A.sync.token()) { A.toast('尚未設定 PAT'); return; }
      A.sync.startup().then(fillSettings);
    });
    A.$('#deleted-list').addEventListener('click', onDeletedListClick);
    A.$('#btn-export-copy').addEventListener('click', copyExport);
    A.$('#btn-import').addEventListener('click', doImport);

    /* 鍵盤：在 focus 的同一個 task 內就把 sheet 縮好 */
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (isTextField(t) && t.closest && t.closest('.sheet')) VP.keyboardOpening();
    });
    document.addEventListener('focusout', function (e) {
      var t = e.target;
      if (!isTextField(t) || !t.closest || !t.closest('.sheet')) return;
      setTimeout(function () {
        var a = document.activeElement;
        if (isTextField(a) && a.closest && a.closest('.sheet')) return;   /* 換到另一個欄位 */
        VP.keyboardClosing();
      }, 60);
    });

    /* 更新提示 */
    A.$('#btn-reload').addEventListener('click', reloadWithFreshCache);

    /* 手勢 */
    ['daily', 'general'].forEach(function (type) {
      A.gestures.attach(A.render.els.lists[type]);
    });
    A.gestures.attachScrollClose(A.render.els.views.tasks);

    /* 捲動位置記憶 */
    Object.keys(A.render.els.views).forEach(function (k) {
      A.render.els.views[k].addEventListener('scroll', function () {
        ui.scroll[k] = A.render.els.views[k].scrollTop;
        saveUi();
      }, { passive: true });
    });

    /* 同步狀態 */
    A.sync.onChange = renderSyncStatus;
    A.sync.onGamePull = function () {
      A.grender.resources();
      renderTab(A.tab);
      A.toast('遊戲進度已從雲端備份更新');
    };
    A.sync.onPull = function () {
      lastLogical = A.logicalToday();
      A.render.all({ animate: true });
      restoreScroll();
      if (!A.$('#sheet-settings').hidden) fillSettings();
      A.toast('已從雲端備份更新');
    };

    /* 換日、回到前景、連線恢復 */
    setInterval(checkDate, 10000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (A.mode === 'edit') setMode('normal');   /* 編輯模式不記憶 */
      checkDate();
      A.sync.retryIfPending();
      pollVersion();
      var fought = A.farm.catchUp();
      if (fought > 0) A.toast('自動刷關進行了 ' + fought + ' 場');
    });
    window.addEventListener('focus', checkDate);
    window.addEventListener('pageshow', checkDate);
    window.addEventListener('online', function () { A.sync.retryIfPending(); });
    window.addEventListener('pagehide', function () {
      A.writeUiState(ui);
      /* 記下最後刷關時間，回來時 catchUp 會補算 */
      if (A.game && A.game.stage.auto_farming) A.gstore.save({ bump: false });
    });

    /* 卡片以外的按壓回饋 */
    A.$$('.tab').forEach(function (b) {
      b.addEventListener('pointerdown', function () { b.classList.add('is-press'); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        b.addEventListener(ev, function () { b.classList.remove('is-press'); });
      });
    });
  }

  /* ================= 啟動 ================= */
  function boot() {
    A.render.init();

    /* 這一行必須在最前面：SW 的更新通知可能比 load 事件更早到 */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    /* 階段一：同步讀 mirror，立刻畫出完整清單與資源列（SPEC §9.1、GAME_SPEC §4b.3） */
    ui = migrateUi(A.readUiState());
    A.tab = ui.tab;
    A.taskPane = ui.taskPane;
    var mirror = A.readMirror();
    A.state = mirror || A.defaultState();
    var gameMirror = A.gstore.readMirror();
    A.game = gameMirror || A.gstore.defaultState();
    lastLogical = A.logicalToday();
    A.render.all({ animate: false });
    A.grender.resources();
    setBagPane(ui.bagPane);
    renderTab(A.tab);
    restoreScroll();

    wire();
    VP.watch();

    /* 階段二：非同步讀 IndexedDB，不一致才重繪 */
    var todoReady = A.idbLoad().then(function (rec) {
      var stored = rec ? A.normalizeState(rec) : null;
      if (!stored) {
        if (mirror) A.queueIdbWrite();          /* 把 mirror 補回主資料 */
      } else if (JSON.stringify(stored) !== JSON.stringify(A.state)) {
        A.state = stored;
        A.writeMirror(A.state);
        lastLogical = A.logicalToday();
        A.render.all({ animate: true });
        restoreScroll();
      }
    }).catch(function (e) {
      console.warn('IndexedDB 讀取失敗，使用 mirror', e);
    });

    var gameReady = A.gstore.idbLoad().then(function (rec) {
      var stored = rec ? A.gstore.normalize(rec) : null;
      if (!stored) {
        if (gameMirror) A.gstore.save({ bump: false });
      } else if (JSON.stringify(stored) !== JSON.stringify(A.game)) {
        A.game = stored;
        A.gstore.writeMirror(A.game);
        A.grender.resources();
        renderTab(A.tab);
      }
    }).catch(function (e) {
      console.warn('game_data 讀取失敗，使用 mirror', e);
    }).then(function () {
      /* 離線期間的自動刷關補算 + 啟動計時器 */
      A.farm.catchUp();
      if (A.game.stage.auto_farming) A.farm.setAuto(true);
    });

    Promise.all([todoReady, gameReady]).then(function () {
      /* 階段三：背景同步 */
      renderSyncStatus();
      setTimeout(function () { A.sync.startup(); }, 0);
    });

    if (document.readyState === 'complete') registerSW();
    else window.addEventListener('load', registerSW);
  }

  boot();

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
