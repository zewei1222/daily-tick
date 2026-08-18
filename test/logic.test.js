/* 純邏輯測試（node 執行，不需瀏覽器）：node test/logic.test.js
   對應 ACCEPTANCE 的 A / B / C / F / G / H 各項可自動驗證的部分。 */
globalThis.App = {};
var path = require('path');
var root = path.join(__dirname, '..');
['util', 'store', 'model', 'sync'].forEach(function (m) {
  require(path.join(root, 'js', m + '.js'));
});
var A = globalThis.App;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want });
}
function group(t) { console.log('\n' + t); }

/* 建一份乾淨狀態 */
function setState(tasks, resetHour) {
  A.state = {
    schema_version: 1,
    updated_at: new Date(0).toISOString(),
    settings: { reset_hour: resetHour === undefined ? 4 : resetHour },
    tasks: tasks
  };
}
function daily(title, history, order) {
  return { id: title, type: 'daily', title: title, order_index: order || 1000,
           created_at: new Date(0).toISOString(), history: history || [] };
}
function general(title, completed_at, order) {
  return { id: title, type: 'general', title: title, order_index: order || 1000,
           created_at: new Date(0).toISOString(), completed_at: completed_at || null };
}
/* 讓 logicalToday() 可控 */
function freeze(y, m, d, h, mi) {
  A.logicalToday = function () { return A.logicalDate(new Date(y, m - 1, d, h, mi || 0), A.resetHour()); };
}

group('A. 日期與重置（reset_hour = 4）');
eq('A3 03:00 算前一天', A.logicalDate(new Date(2026, 7, 18, 3, 0), 4), '2026-08-17');
eq('A4 03:59 算前一天', A.logicalDate(new Date(2026, 7, 18, 3, 59), 4), '2026-08-17');
eq('A4 04:01 算當天', A.logicalDate(new Date(2026, 7, 18, 4, 1), 4), '2026-08-18');
eq('A2 05:00 算當天', A.logicalDate(new Date(2026, 7, 18, 5, 0), 4), '2026-08-18');
eq('A5 07:00（台灣早上）不得因 UTC 而變前一天',
   A.logicalDate(new Date(2026, 7, 18, 7, 0), 4), '2026-08-18');
eq('reset_hour = 0 時 00:30 就是當天', A.logicalDate(new Date(2026, 7, 18, 0, 30), 0), '2026-08-18');
eq('reset_hour = 2 時 01:00 算前一天', A.logicalDate(new Date(2026, 7, 18, 1, 0), 2), '2026-08-17');
eq('跨月：9/1 03:00 → 8/31', A.logicalDate(new Date(2026, 8, 1, 3, 0), 4), '2026-08-31');
eq('閏年 shiftDate', A.shiftDate('2024-02-28', 1), '2024-02-29');
eq('跨年 shiftDate', A.shiftDate('2025-12-31', 1), '2026-01-01');
eq('往前跨月 shiftDate', A.shiftDate('2026-03-01', -1), '2026-02-28');

group('A7 / A8 勾選與設定變更');
setState([daily('a')], 4);
freeze(2026, 8, 18, 10);
var t = A.state.tasks[0];
A.toggle(t);
eq('A1 勾選後今天已完成', A.isDoneToday(t), true);
eq('A7 取消勾選後移除紀錄', (A.toggle(t), t.history), []);
A.toggle(t);
var histBefore = t.history.slice();
A.state.settings.reset_hour = 2;
eq('A8 改 reset_hour 不動歷史', t.history, histBefore);

group('B. 連續天數');
setState([daily('s', [])], 4);
freeze(2026, 8, 18, 10);
eq('B1 沒有紀錄 → 0', A.streak(A.state.tasks[0]), 0);
setState([daily('s', ['2026-08-16', '2026-08-17', '2026-08-18'])], 4);
eq('B2 連續 3 天 → 3', A.streak(A.state.tasks[0]), 3);
setState([daily('s', ['2026-08-15', '2026-08-16', '2026-08-17'])], 4);
eq('B3 今天還沒勾但昨天有 → 仍是 3', A.streak(A.state.tasks[0]), 3);
setState([daily('s', ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-18'])], 4);
eq('B4 中斷後今天勾 → 1', A.streak(A.state.tasks[0]), 1);
eq('B4 最長連續 → 3', A.longestStreak(A.state.tasks[0]), 3);
setState([daily('s', ['2026-08-13', '2026-08-16'])], 4);
eq('前天以前才有紀錄 → 0', A.streak(A.state.tasks[0]), 0);
var many = [];
for (var i = 0; i < 400; i++) many.push(A.shiftDate('2026-08-18', -i));
setState([daily('s', many)], 4);
eq('B5 長歷史 streak', A.streak(A.state.tasks[0]), 400);
eq('B5 長歷史總數', A.state.tasks[0].history.length, 400);

group('C. 排序');
freeze(2026, 8, 18, 10);
setState([
  daily('d1', [], 1000),
  daily('d2', ['2026-08-18'], 2000),
  daily('d3', [], 3000)
], 4);
eq('C1 一般模式：已完成沉底',
   A.sortedTasks('daily', 'normal').map(function (x) { return x.title; }),
   ['d1', 'd3', 'd2']);
eq('C2/C3 編輯模式：依 order_index 原位',
   A.sortedTasks('daily', 'edit').map(function (x) { return x.title; }),
   ['d1', 'd2', 'd3']);
setState([general('g1', null, 1000), general('g2', '2026-08-18T02:00:00.000Z', 2000),
          general('g3', null, 3000)], 4);
eq('C6 一般分頁不沉底',
   A.sortedTasks('general', 'normal').map(function (x) { return x.title; }),
   ['g1', 'g2', 'g3']);

group('C7 / §3.2 order_index');
setState([daily('d1', [], 1000), daily('d2', [], 2000), general('g1', null, 5000)], 4);
eq('新增 daily 取 max+1000', A.nextOrder('daily'), 3000);
eq('新增 general 取 max+1000', A.nextOrder('general'), 6000);
setState([], 4);
eq('空清單 → 1000', A.nextOrder('daily'), 1000);
setState([daily('d1', [], 1000), daily('d2', [], 2000), daily('d3', [], 3000)], 4);
A.applyOrder('daily', ['d3', 'd1', 'd2']);
eq('拖曳後重新指派 (i+1)*1000',
   A.sortedTasks('daily', 'edit').map(function (x) { return [x.title, x.order_index]; }),
   [['d3', 1000], ['d1', 2000], ['d2', 3000]]);

group('H. 清除已完成');
setState([daily('d1', ['2026-08-18'], 1000), general('g1', '2026-08-18T00:00:00.000Z', 1000),
          general('g2', null, 2000)], 4);
eq('H2 只刪 general 已完成', A.clearCompletedGeneral(), 1);
eq('H2 每日任務與未完成一般任務不受影響',
   A.state.tasks.map(function (x) { return x.title; }), ['d1', 'g2']);

group('F. 同步決策（§6.3）');
var L = function (n, when) { return { tasks: new Array(n).fill(0), updated_at: when }; };
eq('無遠端 → push', A.syncDecision(L(3, '2026-08-18T00:00:00Z'), null), 'push');
eq('F6 本機 0 筆、遠端有資料 → pull（硬規則）',
   A.syncDecision(L(0, '2026-08-18T00:00:00Z'), L(10, '2000-01-01T00:00:00Z')), 'pull');
eq('F5 遠端空且較舊 → push（不清空本機）',
   A.syncDecision(L(5, '2026-08-18T00:00:00Z'), L(0, '2000-01-01T00:00:00Z')), 'push');
eq('遠端較新 → pull',
   A.syncDecision(L(5, '2026-08-18T00:00:00Z'), L(7, '2026-08-19T00:00:00Z')), 'pull');
eq('本機較新 → push',
   A.syncDecision(L(5, '2026-08-19T00:00:00Z'), L(7, '2026-08-18T00:00:00Z')), 'push');
eq('相同 → noop',
   A.syncDecision(L(5, '2026-08-18T00:00:00Z'), L(5, '2026-08-18T00:00:00Z')), 'noop');
eq('雙方皆空 → noop',
   A.syncDecision(L(0, '2026-08-18T00:00:00Z'), L(0, '2026-08-18T00:00:00Z')), 'noop');
ok('F3 匯出內容不含 PAT', (function () {
  setState([daily('d1', ['2026-08-18'])], 4);
  return JSON.stringify(A.state).indexOf('gist_token') < 0 &&
         JSON.stringify(A.state).indexOf('ghp_') < 0;
})());

group('G. 匯入驗證（§6.4）');
ok('G1 亂碼 → 拒絕', A.parsePayload('這不是 JSON').ok === false);
ok('G2 tasks 非陣列 → 拒絕', A.parsePayload('{"schema_version":1,"tasks":"abc"}').ok === false);
ok('G2 缺 schema_version → 拒絕', A.parsePayload('{"tasks":[]}').ok === false);
ok('G3 版本過新 → 拒絕', A.parsePayload('{"schema_version":99,"tasks":[]}').ok === false);
ok('G3 錯誤訊息提到版本',
   /版本/.test(A.parsePayload('{"schema_version":99,"tasks":[]}').error));
var good = A.parsePayload(JSON.stringify({
  schema_version: 1,
  updated_at: '2026-08-18T00:00:00.000Z',
  settings: { reset_hour: 4 },
  tasks: [{ id: 'x', type: 'daily', title: '喝水', order_index: 1000,
            created_at: '2026-08-01T00:00:00.000Z', history: ['2026-08-02', '2026-08-01'] }]
}));
ok('G4 合法 JSON → 通過', good.ok === true);
eq('history 排序去重', good.state.tasks[0].history, ['2026-08-01', '2026-08-02']);

group('正規化修復');
var n = A.normalizeState({
  tasks: [
    { type: 'daily', title: ' 空白會被 trim ', history: ['2026-08-01', '2026-08-01', 'bad', '2026-02-30'] },
    { type: 'general', title: '', completed_at: null },
    { type: '???', title: '未知型別當一般', completed_at: 'x' },
    'not an object'
  ],
  settings: { reset_hour: 99 }
});
eq('丟掉無名稱與非物件的項目', n.tasks.length, 2);
eq('trim 標題', n.tasks[0].title, '空白會被 trim');
eq('過濾非法日期並去重', n.tasks[0].history, ['2026-08-01']);
eq('未知型別 → general', n.tasks[1].type, 'general');
eq('reset_hour 夾在 0..23', n.settings.reset_hour, 23);
ok('自動補 order_index', typeof n.tasks[0].order_index === 'number');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
