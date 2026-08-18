/* farm.js — 闖關進度、自動刷關、待領池、離線推算（GAME_SPEC §3c.4、§4.4）。
   自動刷關以固定節奏（BATTLE_SECONDS）結算一場；App 關閉期間的場次於回到
   前景時一次補算。待領池上限 = 30 場當前層數的掉落量，滿了就停止累積。 */
(function (A) {
  'use strict';

  var F = {};
  A.farm = F;

  F.onChange = null;    /* UI 掛勾 */
  F.onBattle = null;    /* 自動刷關打完一場（給對戰畫面播新戰報用） */

  function C() { return A.gc.CONST; }
  function st() { return A.game.stage; }

  F.pendingCap = function () {
    var d = A.gc.dropAt(Math.max(1, st().current_stage));
    return {
      material: d.material * C().PENDING_CAP_BATTLES,
      gold: d.gold * C().PENDING_CAP_BATTLES
    };
  };

  F.pendingFull = function () {
    var cap = F.pendingCap();
    return st().pending.material >= cap.material && st().pending.gold >= cap.gold;
  };

  /* 打一場（stage 可指定；預設 current_stage）。回傳戰報。 */
  F.battleOnce = function (stage, opts) {
    opts = opts || {};
    var s = st();
    var n = stage || s.current_stage;
    var result = A.battle.fight(n);

    if (result.winner === 'player') {
      var drop = A.gc.dropAt(n);
      var cap = F.pendingCap();
      s.pending.material = Math.min(cap.material, s.pending.material + drop.material);
      s.pending.gold = Math.min(cap.gold, s.pending.gold + drop.gold);
      s.pending_battles += 1;
      result.drop = drop;

      if (n > s.highest_stage) s.highest_stage = n;        /* 只增不減 */
      if (n === s.current_stage) s.current_stage = n + 1;  /* 通關自動進下一層（§4a.4） */
    } else if (n === s.current_stage && s.highest_stage >= 1 && !opts.manual) {
      /* 自動模式在最前線打輸：退回刷最後通過的層（保證產出）。
         玩家可隨時手動再挑戰前線。規格未明定，此為避免空轉的取捨。 */
      s.current_stage = Math.max(1, s.highest_stage);
    }

    /* 戰鬥過程本身不觸發同步（§0.4），僅本機落地 */
    A.gstore.save({ milestone: false });
    return result;
  };

  /* 領取待領池 → 資源入袋（§0.4：領取＝里程碑，觸發同步） */
  F.claim = function () {
    var s = st();
    var got = { material: s.pending.material, gold: s.pending.gold };
    if (!got.material && !got.gold) return null;
    A.game.resources.material += got.material;
    A.game.resources.gold += got.gold;
    s.pending.material = 0;
    s.pending.gold = 0;
    s.pending_battles = 0;
    A.gstore.save({ milestone: true });
    return got;
  };

  /* ================= 自動刷關 ================= */
  var timer = null;

  function tick() {
    if (!st().auto_farming) return;
    if (F.pendingFull()) {
      if (F.onChange) F.onChange();
      return;   /* 池滿：暫停累積，不浪費（§3c.4），計時器持續但不打 */
    }
    var result = F.battleOnce(null, {});
    st().last_farm_ts = A.nowIso();
    A.gstore.save({ milestone: false, bump: false });
    if (F.onBattle) F.onBattle(result);
    if (F.onChange) F.onChange();
  }

  F.setAuto = function (on) {
    var s = st();
    if (s.auto_farming === !!on) return;
    s.auto_farming = !!on;
    s.last_farm_ts = A.nowIso();
    A.gstore.save({ milestone: false });
    if (on) {
      if (!timer) timer = setInterval(tick, C().BATTLE_SECONDS * 1000);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (F.onChange) F.onChange();
  };

  /* 離線／背景期間的補算：回到前景時呼叫。
     推算場數 = 經過時間 / 每場秒數，且不超過把待領池補滿所需的場數。 */
  F.catchUp = function () {
    var s = st();
    if (!s.auto_farming || !s.last_farm_ts) return 0;
    var elapsed = (Date.now() - Date.parse(s.last_farm_ts)) / 1000;
    var n = Math.floor(elapsed / C().BATTLE_SECONDS);
    if (n <= 0) return 0;

    var fought = 0;
    for (var i = 0; i < n && i < C().PENDING_CAP_BATTLES; i++) {
      if (F.pendingFull()) break;
      F.battleOnce(null, {});
      fought++;
    }
    s.last_farm_ts = A.nowIso();
    A.gstore.save({ milestone: false });
    if (timer) { clearInterval(timer); timer = null; }
    if (s.auto_farming) timer = setInterval(tick, C().BATTLE_SECONDS * 1000);
    if (F.onChange) F.onChange();
    return fought;
  };

  F.stopTimer = function () {
    if (timer) { clearInterval(timer); timer = null; }
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
