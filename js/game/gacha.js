/* gacha.js — 抽卡、保底、owned_count / level_cap、強化（GAME_SPEC §3a）。 */
(function (A) {
  'use strict';

  var GA = {};
  A.gacha = GA;

  /* rng 可注入以便測試；預設 Math.random */
  GA.rng = Math.random;

  function itemsOfRarity(pool, rarityId) {
    var ids = pool.item_ids;   /* null = 通用池 = 整個目錄 */
    return A.gc.ITEMS.filter(function (it) {
      if (it.rarity !== rarityId) return false;
      if (ids && ids.indexOf(it.id) < 0) return false;
      return true;
    });
  }

  function rollRarity() {
    var total = 0;
    A.gc.RARITIES.forEach(function (r) { total += r.weight; });
    var x = GA.rng() * total;
    for (var i = 0; i < A.gc.RARITIES.length; i++) {
      x -= A.gc.RARITIES[i].weight;
      if (x < 0) return A.gc.RARITIES[i].id;
    }
    return A.gc.RARITIES[0].id;
  }

  function pickRandom(list) {
    return list[Math.floor(GA.rng() * list.length)];
  }

  function rarityRank(id) {
    for (var i = 0; i < A.gc.RARITIES.length; i++) if (A.gc.RARITIES[i].id === id) return i;
    return 0;
  }

  GA.activePools = function () {
    return A.gc.POOLS.filter(function (p) {
      var st = A.game.pools[p.pool_id];
      var retired = (st && st.retired_at) || p.retired_at;
      return !retired;
    });
  };

  /* 抽中後入帳：owned_count +1，第一次抽中補建紀錄 */
  function grant(itemId) {
    var rec = A.game.items[itemId];
    var isNew = !rec;
    if (rec) rec.owned_count += 1;
    else A.game.items[itemId] = { owned_count: 1, current_level: 1 };
    return isNew;
  }

  /* 單抽。回傳 { item, isNew, ownedCount, levelCap, byPity } 或 { error }。
     機制對通用/限定池完全相同，僅保底命中的對象範圍不同（§3a.2）。 */
  GA.pull = function (poolId) {
    var pool = null;
    GA.activePools().forEach(function (p) { if (p.pool_id === poolId) pool = p; });
    if (!pool) return { error: '此卡池不存在或已關閉' };

    if (!A.economy.spendGems(A.gc.CONST.PULL_COST, 'pull:' + poolId)) {
      return { error: '寶石不足（每抽 ' + A.gc.CONST.PULL_COST + ' 顆）' };
    }

    var pulls = A.game.pulls;
    pulls.total += 1;
    pulls.pity_rare_counter += 1;
    pulls.pity_mythic_counter += 1;

    var isLimited = pool.pool_type === 'limited';
    var pityThreshold = isLimited ? (pool.pity_threshold || A.gc.CONST.PITY_RARE)
                                  : A.gc.CONST.PITY_RARE;

    var item = null;
    var byPity = false;

    if (!isLimited && pulls.pity_mythic_counter >= A.gc.CONST.PITY_MYTHIC) {
      /* mythic 保底：rare 以上 → 一併重置 rare 計數器（§3a.6） */
      item = pickRandom(itemsOfRarity(pool, 'mythic'));
      byPity = true;
    } else if (pulls.pity_rare_counter >= pityThreshold) {
      byPity = true;
      if (isLimited) {
        item = A.gc.item(pool.item_ids[0]);          /* 限定池保底＝就是該項目 */
      } else {
        var rares = itemsOfRarity(pool, 'rare').concat(itemsOfRarity(pool, 'mythic'));
        item = pickRandom(rares);
      }
    } else {
      var rarity = rollRarity();
      var candidates = itemsOfRarity(pool, rarity);
      /* 該稀有度在池內沒有項目時往下遞補（資料驅動，池子內容可任意增減） */
      var rank = rarityRank(rarity);
      while (!candidates.length && rank > 0) {
        rank -= 1;
        candidates = itemsOfRarity(pool, A.gc.RARITIES[rank].id);
      }
      item = pickRandom(candidates);
    }

    /* 計數器重置規則（§3a.6） */
    var gotRank = rarityRank(item.rarity);
    if (gotRank >= rarityRank('rare')) pulls.pity_rare_counter = 0;
    if (item.rarity === 'mythic') pulls.pity_mythic_counter = 0;

    var isNew = grant(item.id);

    /* 限定池抽中該項目一次即退役併入通用池（§3a.2） */
    if (isLimited && pool.item_ids.indexOf(item.id) >= 0) {
      A.game.pools[pool.pool_id] = { retired_at: A.nowIso() };
    }

    var rec = A.game.items[item.id];
    A.gstore.save({ milestone: true });              /* 抽卡完成＝里程碑（§0.4） */

    return {
      item: item,
      isNew: isNew,
      ownedCount: rec.owned_count,
      levelCap: A.gc.levelCap(rec.owned_count),
      byPity: byPity
    };
  };

  /* ================= 強化（§3a.4、§3c.2） ================= */
  GA.upgradeCost = function (itemId) {
    var rec = A.game.items[itemId];
    if (!rec) return null;
    var L = rec.current_level;
    if (L >= A.gc.levelCap(rec.owned_count)) return { capped: true };
    return {
      capped: false,
      material: A.gc.upgradeMaterialCost(L),
      gold: A.gc.upgradeGoldCost(L)
    };
  };

  GA.upgrade = function (itemId) {
    var rec = A.game.items[itemId];
    if (!rec) return { error: '未擁有此項目' };
    var cost = GA.upgradeCost(itemId);
    if (cost.capped) return { error: '已達等級上限（抽到重複可提升上限）' };
    if (!A.economy.spendResources(cost.material, cost.gold)) {
      return { error: '素材或金幣不足' };
    }
    rec.current_level += 1;
    A.gstore.save({ milestone: true });              /* 強化完成＝里程碑（§0.4） */
    return { level: rec.current_level, cap: A.gc.levelCap(rec.owned_count) };
  };

  /* ================= 裝備 / 卸下 ================= */
  GA.equip = function (itemId) {
    var it = A.gc.item(itemId);
    if (!it || !A.game.items[itemId]) return { error: '未擁有此項目' };
    var eq = A.game.equipped;
    if (it.type === 'character') eq.character = itemId;
    else if (it.type === 'pet') eq.pet = itemId;
    else if (it.type === 'gear') eq.gear[it.slot] = itemId;
    A.gstore.save({ milestone: true });              /* 裝備變更＝里程碑（§0.4） */
    return { ok: true };
  };

  GA.unequip = function (itemId) {
    var it = A.gc.item(itemId);
    if (!it) return { error: '未知項目' };
    var eq = A.game.equipped;
    if (it.type === 'character') return { error: '角色不能卸下' };
    if (it.type === 'pet' && eq.pet === itemId) eq.pet = null;
    else if (it.type === 'gear' && eq.gear[it.slot] === itemId) eq.gear[it.slot] = null;
    A.gstore.save({ milestone: true });
    return { ok: true };
  };

  GA.isEquipped = function (itemId) {
    var eq = A.game.equipped;
    if (eq.character === itemId || eq.pet === itemId) return true;
    return A.gc.GEAR_SLOTS.some(function (s) { return eq.gear[s.id] === itemId; });
  };

  /* ================= 玩家最終數值（§2a.3 可總） ================= */
  GA.playerStats = function () {
    var eq = A.game.equipped;
    var total = { atk: 0, hp: 0, def: 0, speed: 0, hit_rate: 0, dodge_rate: 0 };
    var effects = [];   /* [{tag, trigger, amount}]，角色被動倍率已乘入 */

    var charItem = A.gc.item(eq.character);
    var charRec = A.game.items[eq.character];
    var passive = charItem && charItem.passive ? charItem.passive : null;

    function addStats(base, level) {
      var s = A.gc.statsAtLevel(base, level);
      Object.keys(s).forEach(function (k) {
        if (k === 'hit_rate' || k === 'dodge_rate') total[k] = Math.max(total[k], s[k]);
        else total[k] += s[k];
      });
    }

    if (charItem && charRec) addStats(charItem.base_stats, charRec.current_level);

    A.gc.GEAR_SLOTS.forEach(function (slot) {
      var id = eq.gear[slot.id];
      if (!id) return;
      var it = A.gc.item(id);
      var rec = A.game.items[id];
      if (!it || !rec) return;
      addStats(it.base_stats, rec.current_level);
      if (it.effect) {
        var amount = it.effect.amount;
        if (passive && passive.tag === it.effect.tag) amount *= passive.multiplier;
        effects.push({ tag: it.effect.tag, trigger: it.effect.trigger, amount: amount });
      }
    });

    if (eq.pet) {
      var pet = A.gc.item(eq.pet);
      var petRec = A.game.items[eq.pet];
      if (pet && petRec) addStats(pet.base_stats, petRec.current_level);
      /* v1 寵物 has_effect: false，不引用標籤（§2a.1） */
    }

    return { stats: total, effects: effects, passive: passive };
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
