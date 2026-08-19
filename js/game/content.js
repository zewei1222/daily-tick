/* content.js — 遊戲層內容載入器與平衡常數（GAME_SPEC §0.3、§3b.4、§3c）。
   ★ 內容定義（標籤/實體類型/道具/怪物模板）存於 data/*.json，與程式碼分離、
   可直接手動編輯，且不含任何玩家狀態。本檔只保留：平衡常數、換算表、
   卡池定義、查詢工具。瀏覽器以 fetch 載入（SW 快取，毫秒級）；node 測試
   以 fs 同步讀取。 */
(function (A) {
  'use strict';

  var C = {};
  A.gc = C;

  /* ================= 常數（§3c.1、§3a、§4a.5） ================= */
  C.CONST = {
    GROWTH: 1.12,
    BASE_CAP: 10,
    CAP_INCREMENT: 5,
    PULL_COST: 5,
    PITY_RARE: 35,
    PITY_MYTHIC: 200,
    UPGRADE_MATERIAL_BASE: 5,
    UPGRADE_GOLD_BASE: 20,
    DROP_MATERIAL_BASE: 2,
    DROP_GOLD_BASE: 8,
    PENDING_CAP_BATTLES: 30,
    BATTLE_SECONDS: 20,
    CRIT_MULT: 1.5,
    DMG_ROLL_MIN: 0.7,
    DMG_ROLL_MAX: 1.2,
    HIT_FLOOR: 5,
    DEF_K: 100,
    MAX_ACTIONS_PER_TURN: 10,
    MAX_ROUNDS: 100,
    LOW_HP_THRESHOLD: 0.5,
    SYNC_DEBOUNCE_MS: 10000
  };

  /* 難度 → 寶石對照表（§0.3，只存在於遊戲層） */
  C.COIN_TABLE = {
    daily:   { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
    general: { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 }
  };

  /* 稀有度與抽卡機率（§3a.5；全域統一 common/unrare/rare/mythic） */
  C.RARITIES = [
    { id: 'common', name: '普通', weight: 70,  special: false },
    { id: 'unrare', name: '優良', weight: 25,  special: false },
    { id: 'rare',   name: '稀有', weight: 4.5, special: true },
    { id: 'mythic', name: '神話', weight: 0.5, special: true }
  ];

  C.GEAR_SLOTS = [
    { id: 'weapon',    name: '武器', sprite: 'assets/slot_weapon.png' },
    { id: 'head',      name: '頭部', sprite: 'assets/slot_head.png' },
    { id: 'body',      name: '身體', sprite: 'assets/slot_body.png' },
    { id: 'accessory', name: '飾品', sprite: 'assets/slot_accessory.png' }
  ];
  C.SLOT_SPRITES = {
    character: 'assets/slot_character.png',
    pet: 'assets/slot_pet.png'
  };
  C.RES_SPRITES = {
    gem: 'assets/res_gem.png',
    material: 'assets/res_material.png',
    gold: 'assets/res_gold.png'
  };

  C.STARTER_ITEMS = ['char_001', 'gear_001', 'pet_001'];

  /* 抽卡池（§3a.1）。v1 決策：完整目錄全進通用池；限定池機制就緒但無現役池。 */
  C.POOLS = [
    { pool_id: 'general', pool_type: 'general', item_ids: null, retired_at: null }
  ];

  /* ================= 內容載入（data/*.json） ================= */
  C.TAGS = [];
  C.ENTITY_TYPES = [];
  C.ITEMS = [];
  C.MONSTER_TEMPLATES = [];
  C.loaded = false;

  var itemIndex = Object.create(null);

  function assemble(tags, entityTypes, characters, gear, pets, monsters) {
    C.TAGS = tags;
    C.ENTITY_TYPES = entityTypes;
    C.MONSTER_TEMPLATES = monsters;
    C.ITEMS = [];
    characters.forEach(function (it) { it.type = 'character'; C.ITEMS.push(it); });
    gear.forEach(function (it) { it.type = 'gear'; C.ITEMS.push(it); });
    pets.forEach(function (it) { it.type = 'pet'; C.ITEMS.push(it); });
    itemIndex = Object.create(null);
    C.ITEMS.forEach(function (it) { itemIndex[it.id] = it; });
    C.loaded = true;
  }

  var FILES = ['tags', 'entity_types', 'characters', 'gear', 'pets', 'monster_templates'];

  if (typeof window === 'undefined' && typeof require === 'function') {
    /* node（測試）：同步載入 */
    var fs = require('fs');
    var path = require('path');
    var base = path.join(__dirname, '..', '..', 'data');
    var loadedFiles = FILES.map(function (f) {
      return JSON.parse(fs.readFileSync(path.join(base, f + '.json'), 'utf8'));
    });
    assemble.apply(null, loadedFiles);
    C.load = function () { return Promise.resolve(); };
  } else {
    /* 瀏覽器：fetch（SW 快取後為本機讀取）。base 由 script 路徑推導。 */
    var BASE = (function () {
      try {
        var el = document.querySelector('script[src*="game/content.js"]');
        return el ? el.src.replace(/js\/game\/content\.js.*$/, '') : './';
      } catch (e) { return './'; }
    })();

    var loadPromise = null;
    C.load = function () {
      if (loadPromise) return loadPromise;
      loadPromise = Promise.all(FILES.map(function (f) {
        return fetch(BASE + 'data/' + f + '.json').then(function (r) {
          if (!r.ok) throw new Error('content load failed: ' + f);
          return r.json();
        });
      })).then(function (results) {
        assemble.apply(null, results);
      });
      return loadPromise;
    };
    C.spriteUrl = function (rel) { return BASE + rel; };
  }
  if (!C.spriteUrl) C.spriteUrl = function (rel) { return rel; };

  /* ================= 查詢工具 ================= */
  C.item = function (id) { return itemIndex[id] || null; };

  C.tag = function (id) {
    for (var i = 0; i < C.TAGS.length; i++) if (C.TAGS[i].id === id) return C.TAGS[i];
    return null;
  };

  C.rarity = function (id) {
    for (var i = 0; i < C.RARITIES.length; i++) if (C.RARITIES[i].id === id) return C.RARITIES[i];
    return null;
  };

  C.entityType = function (id) {
    for (var i = 0; i < C.ENTITY_TYPES.length; i++) {
      if (C.ENTITY_TYPES[i].id === id) return C.ENTITY_TYPES[i];
    }
    return null;
  };

  C.slotName = function (id) {
    for (var i = 0; i < C.GEAR_SLOTS.length; i++) if (C.GEAR_SLOTS[i].id === id) return C.GEAR_SLOTS[i].name;
    return id;
  };

  /* ================= 公式（§3a.3、§3c.2） ================= */
  C.levelCap = function (ownedCount) {
    if (!ownedCount || ownedCount < 1) return 0;
    return C.CONST.BASE_CAP + (ownedCount - 1) * C.CONST.CAP_INCREMENT;
  };

  C.growthAt = function (n) { return Math.pow(C.CONST.GROWTH, n - 1); };
  C.upgradeMaterialCost = function (level) {
    return Math.round(C.CONST.UPGRADE_MATERIAL_BASE * C.growthAt(level));
  };
  C.upgradeGoldCost = function (level) {
    return Math.round(C.CONST.UPGRADE_GOLD_BASE * C.growthAt(level));
  };
  C.statsAtLevel = function (base, level) {
    var m = C.growthAt(level), out = {};
    Object.keys(base).forEach(function (k) {
      out[k] = (k === 'hit_rate' || k === 'dodge_rate') ? base[k] : base[k] * m;
    });
    return out;
  };
  C.dropAt = function (stage) {
    return {
      material: Math.round(C.CONST.DROP_MATERIAL_BASE * C.growthAt(stage)),
      gold: Math.round(C.CONST.DROP_GOLD_BASE * C.growthAt(stage))
    };
  };

  /* 大數字簡寫（§3c.1） */
  C.fmt = function (n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    var units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    var u = -1;
    var x = n;
    while (x >= 1000 && u < units.length - 1) { x /= 1000; u++; }
    return (x >= 100 ? Math.floor(x) : x.toFixed(1).replace(/\.0$/, '')) + units[u];
  };

  /* 難度 → 寶石（§0.3 唯一換算入口） */
  C.coinsFor = function (taskType, difficulty) {
    var table = C.COIN_TABLE[taskType === 'daily' ? 'daily' : 'general'];
    var d = Math.min(5, Math.max(1, Math.round(Number(difficulty) || 1)));
    return table[d];
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
