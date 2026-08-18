/* gstore.js — 遊戲層存檔（GAME_SPEC §0.2）。
   同一個 IndexedDB、獨立 object store 'game_data'；localStorage 'game_mirror'
   供首屏同步渲染（資源列不得等 IndexedDB）。除了貨幣事件寫入這條管道外，
   遊戲層與 todo 層互不讀取對方資料。 */
(function (A) {
  'use strict';

  var G = {};
  A.gstore = G;

  A.GAME_SCHEMA_VERSION = 1;
  A.LSK.gameMirror = 'game_mirror';

  /* ================= 預設狀態 ================= */
  G.defaultState = function () {
    var items = {};
    A.gc.STARTER_ITEMS.forEach(function (id) {
      items[id] = { owned_count: 1, current_level: 1 };
    });
    return {
      game_schema_version: A.GAME_SCHEMA_VERSION,
      updated_at: new Date(0).toISOString(),
      events: [],                 /* §0.1 永久帳本：貨幣授予事件 */
      spends: [],                 /* 寶石消費紀錄（抽卡） */
      pulls: {
        total: 0,
        pity_rare_counter: 0,
        pity_mythic_counter: 0
      },
      items: items,               /* item_id → { owned_count, current_level } */
      equipped: {
        character: 'char_001',
        gear: { weapon: 'gear_001', head: null, body: null, accessory: null },
        pet: 'pet_001'
      },
      pools: {},                  /* pool_id → { retired_at } */
      resources: { material: 0, gold: 0 },
      stage: {
        highest_stage: 0,
        current_stage: 1,
        auto_farming: false,
        pending: { material: 0, gold: 0 },
        pending_battles: 0,
        last_farm_ts: null
      }
    };
  };

  /* ================= 正規化（讀備份 / 匯入 / 遷移用，缺欄位不得報錯） ================= */
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function int0(v) { return Math.max(0, Math.round(num(v, 0))); }

  G.normalize = function (raw) {
    if (!raw || typeof raw !== 'object') return null;
    var s = G.defaultState();

    s.updated_at = typeof raw.updated_at === 'string' ? raw.updated_at : s.updated_at;

    if (Array.isArray(raw.events)) {
      s.events = raw.events.filter(function (e) {
        return e && typeof e === 'object' && typeof e.event_id === 'string';
      }).map(function (e) {
        return {
          event_id: e.event_id,
          task_id: String(e.task_id || ''),
          task_title_snapshot: String(e.task_title_snapshot || ''),
          task_type: e.task_type === 'daily' ? 'daily' : 'general',
          difficulty_at_time: Math.min(5, Math.max(1, int0(e.difficulty_at_time) || 1)),
          date: A.isDateStr(e.date) ? e.date : '1970-01-01',
          currency_granted: int0(e.currency_granted),
          voided: e.voided === true
        };
      });
    }

    if (Array.isArray(raw.spends)) {
      s.spends = raw.spends.filter(function (e) {
        return e && typeof e === 'object' && typeof e.id === 'string';
      }).map(function (e) {
        return { id: e.id, amount: int0(e.amount), reason: String(e.reason || 'pull'),
                 at: typeof e.at === 'string' ? e.at : new Date(0).toISOString() };
      });
    }

    if (raw.pulls && typeof raw.pulls === 'object') {
      s.pulls.total = int0(raw.pulls.total);
      s.pulls.pity_rare_counter = int0(raw.pulls.pity_rare_counter);
      s.pulls.pity_mythic_counter = int0(raw.pulls.pity_mythic_counter);
    }

    if (raw.items && typeof raw.items === 'object') {
      Object.keys(raw.items).forEach(function (id) {
        if (!A.gc.item(id)) return;                 /* 目錄外的 id 直接忽略 */
        var it = raw.items[id] || {};
        var owned = int0(it.owned_count);
        if (owned < 1) return;
        var cap = A.gc.levelCap(owned);
        s.items[id] = {
          owned_count: owned,
          current_level: Math.min(cap, Math.max(1, int0(it.current_level) || 1))
        };
      });
      /* 初始三件永遠保底存在（starter 不可能被弄丟） */
      A.gc.STARTER_ITEMS.forEach(function (id) {
        if (!s.items[id]) s.items[id] = { owned_count: 1, current_level: 1 };
      });
    }

    if (raw.equipped && typeof raw.equipped === 'object') {
      var eq = raw.equipped;
      var own = function (id, type) {
        return typeof id === 'string' && s.items[id] &&
               A.gc.item(id) && A.gc.item(id).type === type ? id : null;
      };
      s.equipped.character = own(eq.character, 'character') || 'char_001';
      s.equipped.pet = own(eq.pet, 'pet');
      if (eq.gear && typeof eq.gear === 'object') {
        A.gc.GEAR_SLOTS.forEach(function (slot) {
          var id = own(eq.gear[slot.id], 'gear');
          if (id && A.gc.item(id).slot === slot.id) s.equipped.gear[slot.id] = id;
          else if (slot.id !== 'weapon') s.equipped.gear[slot.id] = null;
        });
      }
    }

    if (raw.pools && typeof raw.pools === 'object') {
      Object.keys(raw.pools).forEach(function (pid) {
        var p = raw.pools[pid] || {};
        s.pools[pid] = { retired_at: typeof p.retired_at === 'string' ? p.retired_at : null };
      });
    }

    if (raw.resources && typeof raw.resources === 'object') {
      s.resources.material = int0(raw.resources.material);
      s.resources.gold = int0(raw.resources.gold);
    }

    if (raw.stage && typeof raw.stage === 'object') {
      var st = raw.stage;
      s.stage.highest_stage = int0(st.highest_stage);
      s.stage.current_stage = Math.max(1, int0(st.current_stage) || 1);
      s.stage.auto_farming = st.auto_farming === true;
      if (st.pending && typeof st.pending === 'object') {
        s.stage.pending.material = int0(st.pending.material);
        s.stage.pending.gold = int0(st.pending.gold);
      }
      s.stage.pending_battles = int0(st.pending_battles);
      s.stage.last_farm_ts = typeof st.last_farm_ts === 'string' ? st.last_farm_ts : null;
    }

    return s;
  };

  /* 嚴格檢查（匯入 / 遠端備份用） */
  G.checkPayload = function (raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '格式錯誤：最外層必須是物件' };
    }
    if (typeof raw.game_schema_version !== 'number') {
      return { ok: false, error: '格式錯誤：缺少 game_schema_version' };
    }
    if (raw.game_schema_version > A.GAME_SCHEMA_VERSION) {
      return { ok: false, error: '版本不支援：資料為 v' + raw.game_schema_version };
    }
    return { ok: true, state: G.normalize(raw) };
  };

  G.parsePayload = function (text) {
    var raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, error: '不是合法的 JSON' }; }
    return G.checkPayload(raw);
  };

  /* ================= mirror ================= */
  G.readMirror = function () {
    var s = A.ls.get(A.LSK.gameMirror);
    if (!s) return null;
    try { return G.normalize(JSON.parse(s)); } catch (e) { return null; }
  };

  G.writeMirror = function (state) {
    try { A.ls.set(A.LSK.gameMirror, JSON.stringify(state)); } catch (e) {}
  };

  /* ================= IndexedDB（沿用 store.js 的 db，object store 'game_data'） ================= */
  var KEY = 'game';

  G.idbLoad = function () {
    return A.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains('game_data')) { resolve(null); return; }
        var tx = db.transaction('game_data', 'readonly');
        var req = tx.objectStore('game_data').get(KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  };

  function idbPut(state) {
    return A.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains('game_data')) { resolve(); return; }
        var tx = db.transaction('game_data', 'readwrite');
        tx.objectStore('game_data').put(state, KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  var writing = false, dirty = false;
  function flush() {
    writing = true;
    idbPut(JSON.parse(JSON.stringify(A.game)))
      .catch(function (e) { console.warn('game_data 寫入失敗，已寫入 mirror', e); })
      .then(function () {
        writing = false;
        if (dirty) { dirty = false; flush(); }
      });
  }

  /* 對外唯一儲存入口。
     milestone: true 表示這是 §0.4 列舉的里程碑事件，需要排程 gist 同步；
     戰鬥過程、待領池累積等高頻變動一律 milestone: false（僅本機落地）。 */
  G.save = function (opts) {
    opts = opts || {};
    if (!A.game) return;
    if (opts.bump !== false) A.game.updated_at = A.nowIso();
    G.writeMirror(A.game);
    if (writing) { dirty = true; } else { flush(); }
    if (opts.milestone && A.sync && A.sync.scheduleGamePush) A.sync.scheduleGamePush();
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
