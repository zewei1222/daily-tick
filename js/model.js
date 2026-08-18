/* model.js — 任務邏輯：邏輯日期、勾選、連續天數、排序、order_index。無 DOM。 */
(function (A) {
  'use strict';

  A.state = null;              /* 由 main.js 載入 */
  A.mode = 'normal';           /* 'normal' | 'edit' */
  A.tab = 'daily';             /* 'daily' | 'general' | 'stats' */

  A.resetHour = function () {
    return A.state && A.state.settings ? A.clampHour(A.state.settings.reset_hour) : 4;
  };

  A.logicalToday = function () {
    return A.logicalDate(new Date(), A.resetHour());
  };

  /* ---------- 完成狀態 ---------- */
  A.isDoneToday = function (task) {
    return task.history.indexOf(A.logicalToday()) >= 0;
  };

  A.isDone = function (task) {
    return task.type === 'daily' ? A.isDoneToday(task) : !!task.completed_at;
  };

  A.toggle = function (task) {
    if (task.type === 'daily') {
      var d = A.logicalToday();
      var i = task.history.indexOf(d);
      if (i >= 0) task.history.splice(i, 1);
      else { task.history.push(d); task.history.sort(); }
    } else {
      task.completed_at = task.completed_at ? null : A.nowIso();
    }
  };

  /* ---------- 連續天數（SPEC §2.4） ---------- */
  A.streak = function (task) {
    if (task.type !== 'daily' || !task.history.length) return 0;
    var set = Object.create(null);
    task.history.forEach(function (d) { set[d] = true; });
    var today = A.logicalToday();
    var yest = A.shiftDate(today, -1);
    var cursor = set[today] ? today : (set[yest] ? yest : null);
    if (!cursor) return 0;
    var n = 0;
    while (set[cursor]) { n++; cursor = A.shiftDate(cursor, -1); }
    return n;
  };

  A.longestStreak = function (task) {
    if (task.type !== 'daily' || !task.history.length) return 0;
    var h = task.history.slice().sort();
    var best = 1, run = 1;
    for (var i = 1; i < h.length; i++) {
      if (A.shiftDate(h[i - 1], 1) === h[i]) run++;
      else run = 1;
      if (run > best) best = run;
    }
    return best;
  };

  /* ---------- 取用 / 排序（SPEC §3.1，排序純屬渲染層） ---------- */
  A.tasksOf = function (type) {
    return A.state.tasks.filter(function (t) { return t.type === type; });
  };

  A.sortedTasks = function (type, mode) {
    var list = A.tasksOf(type);
    if (mode === 'edit' || type === 'general') {
      return list.sort(function (a, b) { return a.order_index - b.order_index; });
    }
    /* 一般模式的每日分頁：已完成沉底 */
    return list.sort(function (a, b) {
      return (A.isDoneToday(a) - A.isDoneToday(b)) || (a.order_index - b.order_index);
    });
  };

  A.findTask = function (id) {
    for (var i = 0; i < A.state.tasks.length; i++) {
      if (A.state.tasks[i].id === id) return A.state.tasks[i];
    }
    return null;
  };

  /* ---------- 變更 ---------- */
  A.nextOrder = function (type) {
    var max = null;
    A.tasksOf(type).forEach(function (t) {
      if (max === null || t.order_index > max) max = t.order_index;
    });
    return max === null ? 1000 : max + 1000;
  };

  A.addTask = function (type, title) {
    var t = {
      id: A.uuid(),
      type: type,
      title: title,
      order_index: A.nextOrder(type),
      created_at: A.nowIso()
    };
    if (type === 'daily') t.history = [];
    else t.completed_at = null;
    A.state.tasks.push(t);
    return t;
  };

  A.renameTask = function (id, title) {
    var t = A.findTask(id);
    if (t) t.title = title;
    return t;
  };

  A.deleteTask = function (id) {
    var i = A.state.tasks.findIndex(function (t) { return t.id === id; });
    if (i >= 0) A.state.tasks.splice(i, 1);
    return i >= 0;
  };

  /* 只清 general 且已完成的（ACCEPTANCE H2） */
  A.clearCompletedGeneral = function () {
    var before = A.state.tasks.length;
    A.state.tasks = A.state.tasks.filter(function (t) {
      return !(t.type === 'general' && t.completed_at);
    });
    return before - A.state.tasks.length;
  };

  A.hasCompletedGeneral = function () {
    return A.state.tasks.some(function (t) { return t.type === 'general' && t.completed_at; });
  };

  /* 拖曳結束後依 DOM 順序重排（SPEC §3.2） */
  A.applyOrder = function (type, idsInOrder) {
    idsInOrder.forEach(function (id, i) {
      var t = A.findTask(id);
      if (t && t.type === type) t.order_index = (i + 1) * 1000;
    });
  };

  /* ---------- 統計 ---------- */
  A.statsFor = function (task) {
    return {
      title: task.title,
      streak: A.streak(task),
      longest: A.longestStreak(task),
      total: task.history.length
    };
  };

  A.recentDays = function (task, days) {
    var today = A.logicalToday();
    var set = Object.create(null);
    task.history.forEach(function (d) { set[d] = true; });
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = A.shiftDate(today, -i);
      out.push({ date: d, done: !!set[d] });
    }
    return out;
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
