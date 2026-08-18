/* economy.js — 貨幣事件帳本（GAME_SPEC §0.1、§0.3）。
   完成任務 → 寫入不可變事件；取消 → 沖銷同日同任務事件（voided，不刪除）。
   餘額 = 未沖銷事件加總 − 消費紀錄加總。todo 資料永不被遊戲層改動。 */
(function (A) {
  'use strict';

  var E = {};
  A.economy = E;

  E.gemBalance = function () {
    var earned = 0;
    A.game.events.forEach(function (e) { if (!e.voided) earned += e.currency_granted; });
    var spent = 0;
    A.game.spends.forEach(function (s) { spent += s.amount; });
    return earned - spent;
  };

  E.gemsEarnedTotal = function () {
    var earned = 0;
    A.game.events.forEach(function (e) { if (!e.voided) earned += e.currency_granted; });
    return earned;
  };

  /* 完成當下呼叫。date 用任務的「本期到期日」（週期任務在非到期日勾選也記對期）。 */
  E.onTaskCompleted = function (task, date) {
    var granted = A.gc.coinsFor(task.type, task.difficulty);
    A.game.events.push({
      event_id: A.uuid(),
      task_id: task.id,
      task_title_snapshot: task.title,
      task_type: task.type,
      difficulty_at_time: Math.min(5, Math.max(1, Math.round(Number(task.difficulty) || 1))),
      date: date,
      currency_granted: granted,
      voided: false
    });
    A.gstore.save({ milestone: false });   /* 高頻操作：本機落地即可，同步等里程碑 */
    return granted;
  };

  /* 取消勾選：沖銷同日同 task_id 的最後一筆未沖銷事件（不刪除，理念同軟刪除）。 */
  E.onTaskUncompleted = function (task, date) {
    for (var i = A.game.events.length - 1; i >= 0; i--) {
      var e = A.game.events[i];
      if (e.task_id === task.id && e.date === date && !e.voided) {
        e.voided = true;
        A.gstore.save({ milestone: false });
        return true;
      }
    }
    return false;   /* 找不到（例如跨期取消）：原事件不動，規格如此 */
  };

  /* 花寶石（抽卡）。餘額不足回 false，不寫入任何紀錄。 */
  E.spendGems = function (amount, reason) {
    if (E.gemBalance() < amount) return false;
    A.game.spends.push({ id: A.uuid(), amount: amount, reason: reason || 'pull', at: A.nowIso() });
    return true;
  };

  /* 花戰鬥資源（強化）。 */
  E.spendResources = function (material, gold) {
    var r = A.game.resources;
    if (r.material < material || r.gold < gold) return false;
    r.material -= material;
    r.gold -= gold;
    return true;
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
