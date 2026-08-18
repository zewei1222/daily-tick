/* render.js — DOM 渲染。差異更新（保留節點）＋ FLIP 動畫（SPEC §9.3）。 */
(function (A) {
  'use strict';

  var R = {};
  A.render = R;

  var els = null;
  R.init = function () {
    els = {
      title:     A.$('#app-title'),
      btnEdit:   A.$('#btn-edit'),
      fab:       A.$('#fab'),
      lists:     { daily: A.$('#list-daily'), general: A.$('#list-general') },
      empties:   { daily: A.$('#empty-daily'), general: A.$('#empty-general') },
      views:     { daily: A.$('#view-daily'), general: A.$('#view-general'), stats: A.$('#view-stats') },
      footGeneral: A.$('#foot-general'),
      stats:     A.$('#stats-body'),
      tabs:      A.$$('.tab')
    };
    R.els = els;
  };

  /* ---------- FLIP ---------- */
  function flip(container, mutate) {
    if (A.reducedMotion()) { mutate(); return; }

    var before = new Map();
    A.$$(':scope > .row', container).forEach(function (n) {
      n.style.transition = 'none';
      n.style.transform = '';
      before.set(n, n.getBoundingClientRect().top);
    });

    mutate();

    var dur = A.token('--dur-slow', 240);
    var ease = getComputedStyle(document.documentElement)
                 .getPropertyValue('--ease-out').trim() || 'ease-out';

    A.$$(':scope > .row', container).forEach(function (n) {
      var prev = before.get(n);
      var now = n.getBoundingClientRect().top;

      if (prev === undefined) {                     /* 新節點：淡入 */
        n.style.transition = 'none';
        n.style.opacity = '0';
        void n.offsetHeight;
        n.style.transition = 'opacity ' + dur + 'ms ' + ease;
        n.style.opacity = '';
        return;
      }
      var dy = prev - now;
      if (!dy) { n.style.transition = ''; return; }
      n.style.transition = 'none';
      n.style.transform = 'translateY(' + dy + 'px)';
      void n.offsetHeight;                          /* 強制套用起始值 */
      n.style.transition = 'transform ' + dur + 'ms ' + ease;
      n.style.transform = '';
    });
  }
  R.flip = flip;

  /* ---------- 卡片 ---------- */
  function buildRow(task) {
    var row = A.el('li', 'row');
    row.dataset.id = task.id;

    var actions = A.el('div', 'row-actions');
    var del = A.el('button', 'btn-del', '刪除');
    del.type = 'button';
    del.dataset.act = 'delete';
    actions.appendChild(del);

    var card = A.el('div', 'card');
    var check = A.el('span', 'check');
    check.appendChild(A.el('span', 'check-mark', '✓'));
    card.appendChild(check);
    card.appendChild(A.el('span', 'card-title'));
    card.appendChild(A.el('span', 'streak'));
    var handle = A.el('span', 'drag-handle', '≡');
    handle.setAttribute('aria-hidden', 'true');
    card.appendChild(handle);

    row.appendChild(actions);
    row.appendChild(card);
    return row;
  }

  function updateRow(row, task) {
    var card = A.$('.card', row);
    var titleEl = A.$('.card-title', row);
    var streakEl = A.$('.streak', row);

    if (titleEl.textContent !== task.title) titleEl.textContent = task.title;

    var done = A.isDone(task);
    card.classList.toggle('is-done', done);
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', done ? 'true' : 'false');
    card.setAttribute('aria-label', task.title);

    if (task.type === 'daily') {
      var n = A.streak(task);
      if (n > 0) {
        streakEl.hidden = false;
        var txt = String(n);
        if (streakEl.textContent !== txt) streakEl.textContent = txt;
      } else {
        streakEl.hidden = true;
      }
    } else {
      streakEl.hidden = true;
    }
  }

  function reconcile(listEl, tasks) {
    var existing = new Map();
    A.$$(':scope > .row', listEl).forEach(function (li) { existing.set(li.dataset.id, li); });

    var wanted = Object.create(null);
    tasks.forEach(function (t) { wanted[t.id] = true; });
    existing.forEach(function (li, id) { if (!wanted[id]) li.remove(); });

    var prev = null;
    tasks.forEach(function (t) {
      var li = existing.get(t.id);
      if (!li) li = buildRow(t);
      updateRow(li, t);
      var ref = prev ? prev.nextSibling : listEl.firstChild;
      if (li !== ref) listEl.insertBefore(li, ref);
      prev = li;
    });
  }

  /* ---------- 清單 ---------- */
  R.list = function (type, opts) {
    opts = opts || {};
    var listEl = els.lists[type];
    if (!listEl) return;
    var tasks = A.sortedTasks(type, A.mode);

    listEl.classList.toggle('is-edit', A.mode === 'edit');

    var mutate = function () { reconcile(listEl, tasks); };
    if (opts.animate === false) mutate();
    else flip(listEl, mutate);

    els.empties[type].hidden = tasks.length > 0;
    if (type === 'general') {
      els.footGeneral.hidden = !(A.mode === 'normal' && A.hasCompletedGeneral());
    }
  };

  /* ---------- Header / Tab / FAB ---------- */
  var TITLES = { daily: '每日', general: '一般', stats: '統計' };

  R.chrome = function () {
    els.title.textContent = TITLES[A.tab] || '';
    var onList = A.tab === 'daily' || A.tab === 'general';
    els.btnEdit.classList.toggle('is-invisible', !onList);
    els.btnEdit.textContent = A.mode === 'edit' ? '完成' : '編輯';
    els.fab.hidden = !onList || A.mode === 'edit';

    els.tabs.forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === A.tab ? 'true' : 'false');
    });
    Object.keys(els.views).forEach(function (k) {
      els.views[k].hidden = k !== A.tab;
    });
  };

  /* ---------- 統計 ---------- */
  var GRID_DAYS = 30;

  R.stats = function () {
    var host = els.stats;
    var tasks = A.sortedTasks('daily', 'edit');
    host.textContent = '';

    if (!tasks.length) {
      var p = A.el('p', 'empty', '還沒有每日任務，統計是空的。');
      host.appendChild(p);
      return;
    }

    tasks.forEach(function (t) {
      var s = A.statsFor(t);
      var box = A.el('div', 'stat-item');
      box.appendChild(A.el('div', 'stat-name', s.title));

      var meta = A.el('div', 'stat-meta');
      meta.appendChild(A.el('span', null, '目前連續 ' + s.streak + ' 天'));
      meta.appendChild(A.el('span', null, '最長 ' + s.longest + ' 天'));
      meta.appendChild(A.el('span', null, '總完成 ' + s.total + ' 次'));
      box.appendChild(meta);

      var grid = A.el('div', 'grid30');
      A.recentDays(t, GRID_DAYS).forEach(function (d) {
        var c = A.el('div', 'cell' + (d.done ? ' is-on' : ''));
        c.title = d.date;
        grid.appendChild(c);
      });
      box.appendChild(grid);
      box.appendChild(A.el('p', 'grid-legend', '最近 ' + GRID_DAYS + ' 天'));

      host.appendChild(box);
    });
  };

  /* ---------- 全部 ---------- */
  R.all = function (opts) {
    opts = opts || {};
    R.chrome();
    R.list('daily', opts);
    R.list('general', opts);
    if (A.tab === 'stats') R.stats();
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
