/* battle.js — 戰鬥模擬引擎（GAME_SPEC §4、§4a）。
   先完整模擬產生結果紀錄，畫面照紀錄回放（§4.5）。
   標籤「行為」集中在 TAG_HANDLERS 註冊表：新增標籤＝資料表加一筆＋這裡加一個
   handler，其餘系統（圖鑑、篩選、怪物詞綴）全部自動跟上。 */
(function (A) {
  'use strict';

  var B = {};
  A.battle = B;

  B.rng = Math.random;   /* 可注入以便測試 */

  /* mulberry32：以層數為種子的 PRNG。
     詞綴由層數決定而非每場重骰 → 對戰畫面的「此層怪物預覽」與實戰必然一致，
     且同一層重打不會換詞綴（玩家可以針對性換裝，正是核心迴圈要的）。 */
  function seededRng(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= 怪物生成（§4.3，公式生成，不手動設計） ================= */
  B.monsterFor = function (stage, rng) {
    rng = rng || seededRng(stage * 2654435761);
    var tpl = A.gc.MONSTER_TEMPLATES[(stage - 1) % A.gc.MONSTER_TEMPLATES.length];
    var m = A.gc.growthAt(stage);
    var stats = {};
    Object.keys(tpl.base_stats).forEach(function (k) {
      stats[k] = (k === 'hit_rate' || k === 'dodge_rate') ? tpl.base_stats[k]
                                                          : tpl.base_stats[k] * m;
    });

    /* 詞綴：從 tags 表隨機挑 1–2 個，隨機決定 resist 或 counter（§4.1） */
    var tagPool = A.gc.TAGS.slice();
    var count = 1 + Math.floor(rng() * 2);
    var traits = [];
    for (var i = 0; i < count && tagPool.length; i++) {
      var idx = Math.floor(rng() * tagPool.length);
      var tag = tagPool.splice(idx, 1)[0];
      var isResist = rng() < 0.5;
      traits.push({
        tag: tag.id,
        type: isResist ? 'resist' : 'counter',
        value: isResist ? 0.5 : 0.5
      });
    }
    return {
      monster_template: tpl.id,
      name: tpl.name,
      sprite: tpl.sprite,
      level: stage,
      base_stats: stats,
      traits: traits
    };
  };

  /* ================= 標籤行為註冊表 =================
     ctx: { self, foe, log, damage(...), heal(...) }
     value 已含角色被動倍率（玩家側）或詞綴 value（怪物側）。 */
  var TAG_HANDLERS = {
    spike: {
      /* 受擊時反彈 value× 傷害 */
      on_damage_taken: function (ctx, value, info) {
        if (!info || !info.attacker || info.source === 'spike') return;
        var dmg = Math.max(1, Math.round(info.amount * value));
        ctx.damage(info.attacker, dmg, 'spike', ctx.self);
        ctx.log('reflect', ctx.self, { amount: dmg });
      }
    },
    burn: {
      /* 命中時對目標疊一層燒傷；每層每回合結算 value× 施加者攻擊力 */
      on_hit: function (ctx, value, info) {
        info.target.burns.push({ perRound: Math.max(1, Math.round(ctx.self.atkNow() * value)) });
        ctx.log('burn_apply', ctx.self, { stacks: info.target.burns.length });
      }
    },
    lifesteal: {
      /* 命中後回復造成傷害的 value× */
      on_hit: function (ctx, value, info) {
        var heal = Math.max(1, Math.round(info.amount * value));
        ctx.heal(ctx.self, heal);
        ctx.log('lifesteal', ctx.self, { amount: heal });
      }
    },
    crit: {
      /* 常駐：暴擊率 +value（0.15 = +15%） */
      passive_crit: function (value) { return value; }
    },
    shield: {
      on_battle_start: function (ctx, value) {
        var s = Math.round(ctx.self.maxHp * value);
        ctx.self.shield += s;
        ctx.log('shield', ctx.self, { amount: s });
      },
      on_low_hp: function (ctx, value) {
        var s = Math.round(ctx.self.maxHp * value);
        ctx.self.shield += s;
        ctx.log('shield', ctx.self, { amount: s });
      }
    }
  };
  B.TAG_HANDLERS = TAG_HANDLERS;

  /* ================= 戰鬥單位 ================= */
  function makeUnit(name, icon, stats, effects, side) {
    return {
      name: name,
      icon: icon,
      side: side,               /* 'player' | 'monster' */
      maxHp: Math.round(stats.hp),
      hp: Math.round(stats.hp),
      atk: stats.atk,
      def: stats.def,
      speed: Math.max(1, stats.speed),
      hitRate: stats.hit_rate != null ? stats.hit_rate : 100,
      dodgeRate: stats.dodge_rate || 0,
      effects: effects || [],   /* [{tag, trigger, amount}] */
      resists: Object.create(null),   /* tag → 減免比例（掛在「對手」查表） */
      shield: 0,
      burns: [],
      carry: 0,
      lowHpFiredThisRound: false,
      atkNow: function () { return this.atk; }
    };
  }

  function effectsFor(unit, trigger) {
    return unit.effects.filter(function (e) { return e.trigger === trigger; });
  }

  /* 對手對某標籤的 resist（§4.2）：削弱玩家該標籤效果的數值 */
  function resistedValue(target, tag, value) {
    var r = target.resists[tag];
    return r ? value * (1 - r) : value;
  }

  /* ================= 主模擬 ================= */
  B.simulate = function (opts) {
    var C = A.gc.CONST;
    var rng = opts.rng || B.rng;
    var log = [];
    var round = 0;

    function push(type, unit, extra) {
      var e = { type: type, side: unit ? unit.side : null, round: round };
      if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
      /* 快照雙方血量與護盾，回放不需重算 */
      e.p = { hp: Math.max(0, Math.round(player.hp)), shield: Math.round(player.shield) };
      e.m = { hp: Math.max(0, Math.round(monster.hp)), shield: Math.round(monster.shield) };
      log.push(e);
    }

    var player = makeUnit('你', opts.playerIcon || '🥷', opts.playerStats.stats,
                          opts.playerStats.effects, 'player');
    var mDef = opts.monster;
    var mEffects = [];
    /* 怪物詞綴：resist 掛表；counter 轉成怪物自己的效果（§4.2） */
    mDef.traits.forEach(function (t) {
      if (t.type === 'resist') player.resists[t.tag] = 0;   /* 佔位，實際掛在下面 */
    });
    var monster = makeUnit(mDef.name, mDef.sprite, mDef.base_stats, [], 'monster');
    mDef.traits.forEach(function (t) {
      if (t.type === 'resist') monster.resists[t.tag] = t.value;
      else {
        var trigger = { spike: 'on_damage_taken', burn: 'on_hit', lifesteal: 'on_hit',
                        crit: 'passive', shield: 'on_battle_start' }[t.tag] || 'on_hit';
        mEffects.push({ tag: t.tag, trigger: trigger, amount: t.value });
      }
    });
    monster.effects = mEffects;

    var over = false;
    var winner = null;

    function ctxFor(unit) {
      var foe = unit === player ? monster : player;
      return {
        self: unit,
        foe: foe,
        log: push,
        damage: dealRaw,
        heal: function (u, amount) { u.hp = Math.min(u.maxHp, u.hp + amount); }
      };
    }

    function fire(unit, trigger, info) {
      if (over) return;
      effectsFor(unit, trigger).forEach(function (e) {
        var h = TAG_HANDLERS[e.tag] && TAG_HANDLERS[e.tag][trigger];
        if (!h) return;
        var foe = unit === player ? monster : player;
        var v = resistedValue(foe, e.tag, e.amount);
        if (v <= 0) return;
        h(ctxFor(unit), v, info);
        checkDeath();
      });
    }

    function passiveCritBonus(unit) {
      var bonus = 0;
      effectsFor(unit, 'passive').forEach(function (e) {
        var h = TAG_HANDLERS[e.tag] && TAG_HANDLERS[e.tag].passive_crit;
        if (!h) return;
        var foe = unit === player ? monster : player;
        bonus += h(resistedValue(foe, e.tag, e.amount));
      });
      return bonus;
    }

    /* 傷害入口：護盾優先吸收（§4a.3 步驟 5），再廣播 on_damage_taken */
    function dealRaw(target, amount, source, attacker) {
      if (over) return;
      var left = amount;
      if (target.shield > 0) {
        var absorbed = Math.min(target.shield, left);
        target.shield -= absorbed;
        left -= absorbed;
      }
      target.hp -= left;
      fire(target, 'on_damage_taken', { amount: amount, source: source, attacker: attacker });
      checkLowHp(target);
      checkDeath();
    }

    function checkLowHp(unit) {
      if (over || unit.lowHpFiredThisRound) return;
      if (unit.hp > 0 && unit.hp / unit.maxHp < C.LOW_HP_THRESHOLD) {
        unit.lowHpFiredThisRound = true;
        fire(unit, 'on_low_hp', {});
      }
    }

    function checkDeath() {
      if (over) return;
      if (monster.hp <= 0) { over = true; winner = 'player'; fire(player, 'on_kill', {}); }
      else if (player.hp <= 0) { over = true; winner = 'monster'; }
    }

    /* 單次攻擊（§4a.3 完整順序） */
    function attack(attacker, target) {
      if (over) return;

      /* 1. 命中判定 */
      var hitChance = Math.min(100, Math.max(C.HIT_FLOOR, attacker.hitRate - target.dodgeRate));
      if (rng() * 100 >= hitChance) {
        push('miss', attacker, {});
        return;
      }

      /* 2–4. 傷害計算 */
      var baseAttack = attacker.atkNow();
      var critChance = passiveCritBonus(attacker);
      var isCrit = rng() < critChance;
      var roll = C.DMG_ROLL_MIN + rng() * (C.DMG_ROLL_MAX - C.DMG_ROLL_MIN);
      var damage = baseAttack
                 * (isCrit ? C.CRIT_MULT : 1)
                 * roll
                 * (1 - target.def / (target.def + C.DEF_K));
      damage = Math.max(1, Math.round(damage));

      /* 5. 護盾吸收 + 6. on_hit / on_crit + 7/8 在 dealRaw 內 */
      dealRaw(target, damage, 'attack', attacker);
      push(isCrit ? 'crit' : 'hit', attacker, { amount: damage });
      if (!over) {
        fire(attacker, 'on_hit', { amount: damage, target: target });
        if (isCrit) fire(attacker, 'on_crit', { amount: damage, target: target });
      }
    }

    /* DoT：每回合結束結算（§4a.3） */
    function settleDots(unit) {
      if (over || !unit.burns.length) return;
      var total = 0;
      unit.burns.forEach(function (b) { total += b.perRound; });
      dealRaw(unit, total, 'burn', null);
      push('burn_tick', unit, { amount: total });
    }

    /* ---- 戰鬥開始 ---- */
    push('battle_start', player, { monster: { name: mDef.name, sprite: mDef.sprite,
                                              level: mDef.level, traits: mDef.traits } });
    fire(player, 'on_battle_start', {});
    fire(monster, 'on_battle_start', {});

    /* ---- 回合迴圈（§4a.1 速度 carry 制） ---- */
    while (!over && round < C.MAX_ROUNDS) {
      round += 1;
      player.lowHpFiredThisRound = false;
      monster.lowHpFiredThisRound = false;
      push('turn_start', null, {});
      fire(player, 'on_turn_start', {});
      fire(monster, 'on_turn_start', {});

      var units = [player, monster];
      units.forEach(function (u) {
        var foe = u === player ? monster : player;
        u.carry += u.speed / foe.speed;
        u.actions = Math.min(C.MAX_ACTIONS_PER_TURN, Math.max(1, Math.floor(u.carry)));
        u.carry -= Math.floor(u.carry) > 0 ? u.actions : 0;
        if (u.carry < 0) u.carry = 0;
      });

      /* 速度高者先行動並連續出手（§4a.1）；速度相同玩家先 */
      units.sort(function (a, b) {
        return (b.speed - a.speed) || (a.side === 'player' ? -1 : 1);
      });
      for (var ui = 0; ui < units.length && !over; ui++) {
        var u = units[ui];
        var foe2 = u === player ? monster : player;
        for (var k = 0; k < u.actions && !over; k++) attack(u, foe2);
      }

      settleDots(player);
      settleDots(monster);
    }

    /* 龍套保護：100 回合未分勝負 → 玩家判敗（§4a.4） */
    if (!over) { winner = 'monster'; push('timeout', null, {}); }

    push('battle_end', null, { winner: winner });
    fire(player, 'on_battle_end', {});

    return { winner: winner, rounds: round, log: log };
  };

  /* 便捷入口：以目前裝備打第 N 層 */
  B.fight = function (stage, rng) {
    var r = rng || B.rng;
    return B.simulate({
      playerStats: A.gacha.playerStats(),
      monster: B.monsterFor(stage, r),
      rng: r
    });
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
