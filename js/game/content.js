/* content.js — 遊戲層內容註冊表（GAME_SPEC_v1.md）。
   ★ 這裡是「資料，不是程式碼」：標籤、實體類型、稀有度、道具目錄、怪物模板、
   常數全在此。其他檔案禁止硬編碼任何標籤名稱、類型名稱或平衡數值。 */
(function (A) {
  'use strict';

  var C = {};
  A.gc = C;

  /* ================= 常數（§3c.1、§3a、§4a.5） ================= */
  C.CONST = {
    GROWTH: 1.12,              /* 全遊戲唯一成長率，調整此值即改變整體節奏 */
    BASE_CAP: 10,              /* 等級上限基準（§3a.3） */
    CAP_INCREMENT: 5,          /* 每次重複 +5 上限 */
    PULL_COST: 5,              /* 每抽寶石 */
    PITY_RARE: 35,             /* §3a.6 */
    PITY_MYTHIC: 200,
    UPGRADE_MATERIAL_BASE: 5,  /* 素材成本 5×G^(L-1) */
    UPGRADE_GOLD_BASE: 20,     /* 金幣成本 20×G^(L-1) */
    DROP_MATERIAL_BASE: 2,     /* 素材掉落 2×G^(N-1) */
    DROP_GOLD_BASE: 8,         /* 金幣掉落 8×G^(N-1) */
    PENDING_CAP_BATTLES: 30,   /* 待領池上限 = 30 場掉落（§3c.4） */
    BATTLE_SECONDS: 20,        /* 自動刷關每場所需秒數（暫定，含離線推算） */
    CRIT_MULT: 1.5,            /* §4a.5 */
    DMG_ROLL_MIN: 0.7,
    DMG_ROLL_MAX: 1.2,
    HIT_FLOOR: 5,              /* 有效命中率下限 % */
    DEF_K: 100,                /* 防禦減傷常數 */
    MAX_ACTIONS_PER_TURN: 10,
    MAX_ROUNDS: 100,
    LOW_HP_THRESHOLD: 0.5,     /* on_low_hp 預設門檻 */
    SYNC_DEBOUNCE_MS: 10000    /* 里程碑事件後 10 秒才上傳（§0.4） */
  };

  /* ================= 難度 → 寶石對照表（§0.3，只存在於遊戲層） ================= */
  C.COIN_TABLE = {
    daily:   { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
    general: { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 }
  };

  /* ================= 標籤（§1.2） ================= */
  C.TAGS = [
    { id: 'spike',     name: '尖刺', icon: '🔵', description: '受到攻擊時反傷' },
    { id: 'burn',      name: '燒傷', icon: '🔥', description: '持續傷害，可疊加層數' },
    { id: 'lifesteal', name: '吸血', icon: '🩸', description: '造成傷害時吸收生命' },
    { id: 'crit',      name: '暴擊', icon: '💥', description: '提升暴擊率與暴擊傷害' },
    { id: 'shield',    name: '護盾', icon: '🛡️', description: '格擋傷害的額外血層' }
  ];

  /* ================= 實體類型（§1.4） ================= */
  C.ENTITY_TYPES = [
    { id: 'character', name: '角色', has_effect: true,  equip_slots: 1 },
    { id: 'gear',      name: '武裝', has_effect: true,  equip_slots: 4 },
    { id: 'pet',       name: '寵物', has_effect: false, equip_slots: 1 }
  ];

  /* ================= 稀有度與抽卡機率（§3a.5） ================= */
  C.RARITIES = [
    { id: 'common',   name: '普通', weight: 70,  special: false },
    { id: 'uncommon', name: '優良', weight: 25,  special: false },
    { id: 'rare',     name: '稀有', weight: 4.5, special: true },
    { id: 'mythic',   name: '神話', weight: 0.5, special: true }
  ];

  /* ================= 裝備欄位 ================= */
  C.GEAR_SLOTS = [
    { id: 'weapon',    name: '武器' },
    { id: 'head',      name: '頭部' },
    { id: 'body',      name: '身體' },
    { id: 'accessory', name: '飾品' }
  ];

  /* ================= 道具目錄 =================
     完整目錄全進通用池（v1 決策）。初始贈送：char_001 / gear_001 / pet_001。
     特殊裝備：每個標籤 2 件（rare + mythic 各一）＝10 件。
     普通裝備：每欄位 2 件（common + uncommon）＝8 件。 */
  C.ITEMS = [
    /* ---- 角色 ---- */
    { id: 'char_001', type: 'character', name: '掃地僧', icon: '🧹', rarity: 'rare',
      base_stats: { atk: 100, hp: 500, def: 20, speed: 10, hit_rate: 100, dodge_rate: 0 },
      passive: { tag: 'spike', multiplier: 2.0 },
      description: '看似平凡。被打到的人才知道痛。' },

    /* ---- 寵物（v1 無效果，純數值） ---- */
    { id: 'pet_001', type: 'pet', name: '石頭龜', icon: '🐢', rarity: 'common',
      base_stats: { atk: 20, hp: 100, def: 5, speed: 2 },
      effect: null,
      description: '走得慢，但很硬。' },

    /* ---- 普通裝備（純數值，effect: null） ---- */
    { id: 'gear_001', type: 'gear', name: '木劍',   icon: '🗡️', rarity: 'common',   slot: 'weapon',
      base_stats: { atk: 30 },            effect: null, description: '新手的第一把劍。' },
    { id: 'gear_002', type: 'gear', name: '鐵劍',   icon: '⚔️', rarity: 'uncommon', slot: 'weapon',
      base_stats: { atk: 55 },            effect: null, description: '比木劍好一點。真的。' },
    { id: 'gear_003', type: 'gear', name: '布帽',   icon: '🧢', rarity: 'common',   slot: 'head',
      base_stats: { hp: 80 },             effect: null, description: '至少能擋太陽。' },
    { id: 'gear_004', type: 'gear', name: '鐵盔',   icon: '🪖', rarity: 'uncommon', slot: 'head',
      base_stats: { hp: 120, def: 8 },    effect: null, description: '敲起來鏗鏗響。' },
    { id: 'gear_005', type: 'gear', name: '皮甲',   icon: '🦺', rarity: 'common',   slot: 'body',
      base_stats: { def: 15 },            effect: null, description: '牛皮做的，別問哪隻牛。' },
    { id: 'gear_006', type: 'gear', name: '鎖子甲', icon: '🥋', rarity: 'uncommon', slot: 'body',
      base_stats: { def: 25, hp: 60 },    effect: null, description: '一環扣一環。' },
    { id: 'gear_007', type: 'gear', name: '銅戒指', icon: '💍', rarity: 'common',   slot: 'accessory',
      base_stats: { atk: 12, speed: 1 },  effect: null, description: '會在手指留下綠色痕跡。' },
    { id: 'gear_008', type: 'gear', name: '護身符', icon: '📿', rarity: 'uncommon', slot: 'accessory',
      base_stats: { hp: 90, speed: 2 },   effect: null, description: '心誠則靈。' },

    /* ---- 特殊裝備：每標籤 2 件（帶標籤效果，§3.1） ---- */
    { id: 'gear_101', type: 'gear', name: '荊棘盾', icon: '🌵', rarity: 'rare', slot: 'body',
      base_stats: { def: 40, hp: 150 },
      effect: { tag: 'spike', trigger: 'on_damage_taken', amount: 0.5 },
      description: '反傷：受擊時反彈 50% 傷害。' },
    { id: 'gear_102', type: 'gear', name: '刺蝟王之鎧', icon: '🦔', rarity: 'mythic', slot: 'body',
      base_stats: { def: 80, hp: 300 },
      effect: { tag: 'spike', trigger: 'on_damage_taken', amount: 1.0 },
      description: '反傷：受擊時反彈 100% 傷害。' },

    { id: 'gear_103', type: 'gear', name: '火把', icon: '🕯️', rarity: 'rare', slot: 'weapon',
      base_stats: { atk: 70 },
      effect: { tag: 'burn', trigger: 'on_hit', amount: 0.15 },
      description: '燒傷：命中時疊加 1 層（每層每回合 15% 攻擊力）。' },
    { id: 'gear_104', type: 'gear', name: '熔岩之心', icon: '🌋', rarity: 'mythic', slot: 'accessory',
      base_stats: { atk: 90, hp: 200 },
      effect: { tag: 'burn', trigger: 'on_hit', amount: 0.3 },
      description: '燒傷：命中時疊加 1 層（每層每回合 30% 攻擊力）。' },

    { id: 'gear_105', type: 'gear', name: '蝙蝠牙', icon: '🦇', rarity: 'rare', slot: 'weapon',
      base_stats: { atk: 65 },
      effect: { tag: 'lifesteal', trigger: 'on_hit', amount: 0.2 },
      description: '吸血：回復造成傷害 20% 的生命。' },
    { id: 'gear_106', type: 'gear', name: '猩紅聖杯', icon: '🍷', rarity: 'mythic', slot: 'accessory',
      base_stats: { atk: 50, hp: 250 },
      effect: { tag: 'lifesteal', trigger: 'on_hit', amount: 0.4 },
      description: '吸血：回復造成傷害 40% 的生命。' },

    { id: 'gear_107', type: 'gear', name: '鷹眼鏡片', icon: '🧿', rarity: 'rare', slot: 'head',
      base_stats: { atk: 45 },
      effect: { tag: 'crit', trigger: 'passive', amount: 0.15 },
      description: '暴擊：暴擊率 +15%。' },
    { id: 'gear_108', type: 'gear', name: '弒神之瞳', icon: '👁️', rarity: 'mythic', slot: 'head',
      base_stats: { atk: 85, hp: 100 },
      effect: { tag: 'crit', trigger: 'passive', amount: 0.3 },
      description: '暴擊：暴擊率 +30%。' },

    { id: 'gear_109', type: 'gear', name: '龜甲護符', icon: '🐚', rarity: 'rare', slot: 'accessory',
      base_stats: { def: 30, hp: 120 },
      effect: { tag: 'shield', trigger: 'on_battle_start', amount: 0.2 },
      description: '護盾：戰鬥開始時獲得 20% 最大生命的護盾。' },
    { id: 'gear_110', type: 'gear', name: '聖光壁壘', icon: '✨', rarity: 'mythic', slot: 'body',
      base_stats: { def: 60, hp: 350 },
      effect: { tag: 'shield', trigger: 'on_low_hp', amount: 0.35 },
      description: '護盾：生命低於 50% 時獲得 35% 最大生命的護盾（每回合最多一次）。' }
  ];

  /* 初始贈送（§3b.4 精神：一開場就有一套完整流派可玩） */
  C.STARTER_ITEMS = ['char_001', 'gear_001', 'pet_001'];

  /* ================= 抽卡池（§3a.1） =================
     v1 決策：完整目錄全進通用池；限定池機制就緒但無現役池。 */
  C.POOLS = [
    { pool_id: 'general', pool_type: 'general', item_ids: null, retired_at: null }
    /* 未來新項目：{ pool_id: 'limited_gear_201', pool_type: 'limited',
                     item_ids: ['gear_201'], pity_threshold: 35, retired_at: null } */
  ];

  /* ================= 怪物模板（§4.2、§4.3） ================= */
  C.MONSTER_TEMPLATES = [
    { id: 'basic',   name: '史萊姆', icon: '🟢',
      base_stats: { hp: 400, atk: 40, def: 10, speed: 8,  hit_rate: 100, dodge_rate: 0 } },
    { id: 'armored', name: '石像鬼', icon: '🗿',
      base_stats: { hp: 550, atk: 32, def: 30, speed: 5,  hit_rate: 100, dodge_rate: 0 } },
    { id: 'swift',   name: '疾風狼', icon: '🐺',
      base_stats: { hp: 320, atk: 48, def: 5,  speed: 14, hit_rate: 100, dodge_rate: 5 } }
  ];

  /* ================= 查詢工具（純資料存取，無遊戲邏輯） ================= */
  var itemIndex = null;
  C.item = function (id) {
    if (!itemIndex) {
      itemIndex = Object.create(null);
      C.ITEMS.forEach(function (it) { itemIndex[it.id] = it; });
    }
    return itemIndex[id] || null;
  };

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

  /* 等級上限（§3a.3）：所有項目一體適用 */
  C.levelCap = function (ownedCount) {
    if (!ownedCount || ownedCount < 1) return 0;
    return C.CONST.BASE_CAP + (ownedCount - 1) * C.CONST.CAP_INCREMENT;
  };

  /* 成長公式（§3c.2） */
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
      /* 命中/迴避是機率，不隨等級成長 */
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

  /* 大數字簡寫（§3c.1：由簡寫顯示處理絕對數字的膨脹） */
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
