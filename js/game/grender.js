/* grender.js — 遊戲層 UI：資源列、對戰、背包（擁有/圖鑑）、抽卡、遊戲統計。
   全部由 entity_types / tags / rarities 資料表驅動，不硬編碼任何類型或標籤名。 */
(function (A) {
  'use strict';

  var R = {};
  A.grender = R;

  var fmt = function (n) { return A.gc.fmt(n); };

  /* ================= 資源列（§4b.1） ================= */
  R.resources = function () {
    A.$('#res-gems').textContent = fmt(A.economy.gemBalance());
    A.$('#res-material').textContent = fmt(A.game.resources.material);
    A.$('#res-gold').textContent = fmt(A.game.resources.gold);
    var p = A.game.stage.pending;
    A.$('#res-claim-dot').hidden = !(p.material > 0 || p.gold > 0);
  };

  /* ================= 對戰畫面 ================= */
  var replay = { timer: null, log: null, idx: 0 };

  function setBars(side, hp, maxHp, shield) {
    var fill = A.$('#hp-' + side);
    var sh = A.$('#shield-' + side);
    var pct = maxHp > 0 ? Math.max(0, Math.min(100, hp / maxHp * 100)) : 0;
    fill.style.width = pct + '%';
    sh.style.width = Math.min(100, shield / maxHp * 100) + '%';
    A.$('#hpnum-' + side).textContent = fmt(Math.max(0, hp)) + ' / ' + fmt(maxHp) +
      (shield > 0 ? '（🛡' + fmt(shield) + '）' : '');
  }

  function logLine(text, cls) {
    var log = A.$('#battle-log');
    var div = A.el('div', cls || null, text);
    log.appendChild(div);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  function traitText(traits) {
    return traits.map(function (t) {
      var tag = A.gc.tag(t.tag);
      return (tag ? tag.icon + tag.name : t.tag) + (t.type === 'resist' ? '抗' : '反');
    }).join('　');
  }

  function describe(e) {
    var who = e.side === 'player' ? '你' : '敵人';
    switch (e.type) {
      case 'hit':        return who + ' 攻擊，造成 ' + fmt(e.amount) + ' 傷害';
      case 'crit':       return who + ' 暴擊！造成 ' + fmt(e.amount) + ' 傷害';
      case 'miss':       return who + ' 的攻擊落空';
      case 'burn_apply': return who + ' 疊加燒傷（' + e.stacks + ' 層）';
      case 'burn_tick':  return who + ' 受燒傷 ' + fmt(e.amount) + ' 點';
      case 'reflect':    return who + ' 反彈 ' + fmt(e.amount) + ' 傷害';
      case 'lifesteal':  return who + ' 吸血回復 ' + fmt(e.amount);
      case 'shield':     return who + ' 獲得護盾 ' + fmt(e.amount);
      case 'timeout':    return '戰鬥拖太久，被裁判趕出場…';
      default: return null;
    }
  }

  R.stopReplay = function (jumpToEnd) {
    if (replay.timer) { clearInterval(replay.timer); replay.timer = null; }
    if (jumpToEnd && replay.log) {
      var log = replay.log;
      for (var i = replay.idx; i < log.length; i++) applyEvent(log[i], true);
    }
    replay.log = null;
    A.$('#btn-skip').hidden = true;
  };

  var maxes = { player: 1, monster: 1 };

  function applyEvent(e, silent) {
    if (e.type === 'battle_start') {
      var m = e.monster;
      A.$('#bu-monster-icon').textContent = m.icon;
      A.$('#bu-monster-name').textContent = m.name + '（第 ' + m.level + ' 層）';
      A.$('#bu-monster-traits').textContent = traitText(m.traits);
      maxes.player = e.p.hp + e.p.shield ? e.p.hp : maxes.player;
      maxes.monster = e.m.hp;
      if (!silent) { A.$('#battle-log').textContent = ''; logLine('⚔️ 遭遇 ' + m.name + '！'); }
    } else if (e.type === 'battle_end') {
      var win = e.winner === 'player';
      logLine(win ? '🎉 勝利！' : '💀 戰敗…可免費再挑戰',
              win ? 'log-win' : 'log-lose');
    } else if (!silent) {
      var text = describe(e);
      if (text) logLine(text);
    }
    setBars('player', e.p.hp, maxes.player, e.p.shield);
    setBars('monster', e.m.hp, maxes.monster, e.m.shield);
  }

  /* 回放戰報（§4.5：先模擬後回放，可跳過） */
  R.playResult = function (result, opts) {
    opts = opts || {};
    R.stopReplay(false);
    var interesting = result.log.filter(function (e) {
      return ['battle_start', 'hit', 'crit', 'miss', 'burn_apply', 'burn_tick',
              'reflect', 'lifesteal', 'shield', 'timeout', 'battle_end'].indexOf(e.type) >= 0;
    });
    if (opts.instant || A.reducedMotion()) {
      interesting.forEach(function (e, i) { applyEvent(e, i < interesting.length - 8); });
      if (opts.done) opts.done();
      return;
    }
    replay.log = interesting;
    replay.idx = 0;
    A.$('#btn-skip').hidden = false;
    replay.timer = setInterval(function () {
      if (replay.idx >= replay.log.length) {
        R.stopReplay(false);
        if (opts.done) opts.done();
        return;
      }
      applyEvent(replay.log[replay.idx], false);
      replay.idx++;
    }, 160);
  };

  R.battle = function () {
    var s = A.game.stage;
    A.$('#stage-now').textContent = s.current_stage;
    A.$('#stage-max').textContent = s.highest_stage;
    var ps = A.gacha.playerStats();
    A.$('#bu-player-power').textContent =
      '⚔' + fmt(ps.stats.atk) + '　🛡' + fmt(ps.stats.def);
    if (!replay.timer) {
      setBars('player', ps.stats.hp, ps.stats.hp, 0);
    }
    var cap = A.farm.pendingCap();
    A.$('#pending-nums').textContent =
      '🔧 ' + fmt(s.pending.material) + '/' + fmt(cap.material) +
      '　🪙 ' + fmt(s.pending.gold) + '/' + fmt(cap.gold);
    var auto = A.$('#btn-auto');
    auto.textContent = s.auto_farming ? '自動刷關中' : '自動刷關';
    auto.classList.toggle('is-on', s.auto_farming);
    R.resources();
  };

  /* ================= 抽卡 ================= */
  R.gacha = function () {
    var C = A.gc.CONST;
    A.$('#gacha-gems').textContent = fmt(A.economy.gemBalance());
    A.$('#pity-rare').textContent = A.game.pulls.pity_rare_counter;
    A.$('#pity-rare-max').textContent = C.PITY_RARE;
    A.$('#pity-mythic').textContent = A.game.pulls.pity_mythic_counter;
    A.$('#pity-mythic-max').textContent = C.PITY_MYTHIC;
  };

  R.showPulls = function (results) {
    var host = A.$('#pull-result');
    host.textContent = '';
    results.forEach(function (r) {
      var card = A.el('div', 'pull-card' + (r.isNew ? ' is-new' : ''));
      card.appendChild(A.el('div', 'pc-icon', r.item.icon));
      var name = A.el('div', 'pc-name rar-' + r.item.rarity, r.item.name);
      card.appendChild(name);
      card.appendChild(A.el('div', 'pc-tag',
        r.isNew ? 'NEW' : '上限→' + r.levelCap + (r.byPity ? '・保底' : '')));
      host.appendChild(card);
    });
  };

  /* ================= 背包：擁有 ================= */
  function ownedList() {
    var out = [];
    Object.keys(A.game.items).forEach(function (id) {
      var it = A.gc.item(id);
      if (it) out.push({ item: it, rec: A.game.items[id] });
    });
    /* 類型順序照 entity_types 表，同類型內照 id */
    var typeOrder = {};
    A.gc.ENTITY_TYPES.forEach(function (t, i) { typeOrder[t.id] = i; });
    out.sort(function (a, b) {
      return (typeOrder[a.item.type] - typeOrder[b.item.type]) ||
             a.item.id.localeCompare(b.item.id);
    });
    return out;
  }

  R.owned = function () {
    var host = A.$('#pane-owned');
    host.textContent = '';

    /* 裝備中摘要 */
    var summary = A.el('div', 'equip-summary');
    var eq = A.game.equipped;
    function chip(label, itemId) {
      var c = A.el('span', 'equip-chip');
      c.appendChild(A.el('span', null, label + '：'));
      if (itemId && A.gc.item(itemId)) {
        var it = A.gc.item(itemId);
        c.appendChild(A.el('span', null, it.icon + ' ' + it.name));
      } else {
        c.appendChild(A.el('span', 'ec-empty', '（空）'));
      }
      summary.appendChild(c);
    }
    A.gc.ENTITY_TYPES.forEach(function (t) {
      if (t.id === 'gear') {
        A.gc.GEAR_SLOTS.forEach(function (slot) { chip(slot.name, eq.gear[slot.id]); });
      } else {
        chip(t.name, t.id === 'character' ? eq.character : eq.pet);
      }
    });
    host.appendChild(summary);

    ownedList().forEach(function (o) {
      var it = o.item, rec = o.rec;
      var cap = A.gc.levelCap(rec.owned_count);
      var equipped = A.gacha.isEquipped(it.id);

      var row = A.el('div', 'item-row' + (equipped ? ' is-equipped' : ''));
      row.dataset.id = it.id;
      row.appendChild(A.el('span', 'item-icon', it.icon));

      var main = A.el('div', 'item-main');
      var name = A.el('div', 'item-name');
      name.appendChild(A.el('span', 'rar-' + it.rarity, it.name));
      if (equipped) name.appendChild(A.el('span', 'equip-mark', '　✓裝備中'));
      main.appendChild(name);

      var stats = A.gc.statsAtLevel(it.base_stats, rec.current_level);
      var statBits = [];
      if (stats.atk) statBits.push('⚔' + fmt(stats.atk));
      if (stats.hp) statBits.push('❤' + fmt(stats.hp));
      if (stats.def) statBits.push('🛡' + fmt(stats.def));
      if (stats.speed) statBits.push('👟' + fmt(stats.speed));
      main.appendChild(A.el('div', 'item-sub',
        'Lv ' + rec.current_level + '/' + cap + '　×' + rec.owned_count + '　' + statBits.join(' ')));
      if (it.effect) {
        main.appendChild(A.el('div', 'item-desc', it.description));
      }
      row.appendChild(main);

      var acts = A.el('div', 'item-actions');
      var et = A.gc.entityType(it.type);
      if (et && it.type !== 'character') {
        var eqBtn = A.el('button', 'btn', equipped ? '卸下' : '裝備');
        eqBtn.type = 'button';
        eqBtn.dataset.act = equipped ? 'unequip' : 'equip';
        eqBtn.dataset.id = it.id;
        acts.appendChild(eqBtn);
      }
      var cost = A.gacha.upgradeCost(it.id);
      var upBtn = A.el('button', 'btn is-primary');
      upBtn.type = 'button';
      upBtn.dataset.act = 'upgrade';
      upBtn.dataset.id = it.id;
      if (cost.capped) {
        upBtn.textContent = '已滿級';
        upBtn.disabled = true;
        upBtn.classList.remove('is-primary');
      } else {
        upBtn.textContent = '強化 🔧' + fmt(cost.material) + ' 🪙' + fmt(cost.gold);
      }
      acts.appendChild(upBtn);
      row.appendChild(acts);
      host.appendChild(row);
    });
  };

  /* ================= 背包：圖鑑（§3b.1） ================= */
  var dex = { type: null, tag: 'all', rarity: 'all', sort: 'id', q: '', selected: null };
  R.dexState = dex;

  R.dexFilters = function () {
    var host = A.$('#dex-filters');
    host.textContent = '';

    /* 第一排：類型頁籤（entity_types 表驅動） */
    var typeSeg = A.el('div', 'seg');
    if (!dex.type) dex.type = A.gc.ENTITY_TYPES[0].id;
    A.gc.ENTITY_TYPES.forEach(function (t) {
      var b = A.el('button', null, t.name);
      b.type = 'button';
      b.dataset.filterType = t.id;
      b.setAttribute('aria-pressed', dex.type === t.id ? 'true' : 'false');
      typeSeg.appendChild(b);
    });
    host.appendChild(typeSeg);

    /* 第二排：流派 / 稀有度 / 排序 */
    var row = A.el('div', 'filter-row');
    var tagSel = A.el('select', 'input');
    tagSel.id = 'dex-tag';
    tagSel.appendChild(new Option('全部流派', 'all'));
    A.gc.TAGS.forEach(function (t) { tagSel.appendChild(new Option(t.icon + t.name, t.id)); });
    tagSel.appendChild(new Option('無流派', 'none'));
    tagSel.value = dex.tag;
    row.appendChild(tagSel);

    var rarSel = A.el('select', 'input');
    rarSel.id = 'dex-rarity';
    rarSel.appendChild(new Option('全部稀有度', 'all'));
    A.gc.RARITIES.forEach(function (r) { rarSel.appendChild(new Option(r.name, r.id)); });
    rarSel.value = dex.rarity;
    row.appendChild(rarSel);

    var sortSel = A.el('select', 'input');
    sortSel.id = 'dex-sort';
    sortSel.appendChild(new Option('依編號', 'id'));
    sortSel.appendChild(new Option('依稀有度', 'rarity'));
    sortSel.value = dex.sort;
    row.appendChild(sortSel);
    host.appendChild(row);

    /* 第三排：搜尋（名稱部分比對） */
    var q = A.el('input', 'input');
    q.id = 'dex-q';
    q.type = 'search';
    q.placeholder = '搜尋名稱…';
    q.value = dex.q;
    host.appendChild(q);
  };

  function dexItems() {
    var rank = {};
    A.gc.RARITIES.forEach(function (r, i) { rank[r.id] = i; });
    return A.gc.ITEMS.filter(function (it) {
      if (it.type !== dex.type) return false;
      if (dex.rarity !== 'all' && it.rarity !== dex.rarity) return false;
      if (dex.tag === 'none') {
        var hasTag = (it.effect && it.effect.tag) || (it.passive && it.passive.tag);
        if (hasTag) return false;
      } else if (dex.tag !== 'all') {
        var t = (it.effect && it.effect.tag) || (it.passive && it.passive.tag);
        if (t !== dex.tag) return false;
      }
      if (dex.q && it.name.indexOf(dex.q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      if (dex.sort === 'rarity') return (rank[b.rarity] - rank[a.rarity]) || a.id.localeCompare(b.id);
      return a.id.localeCompare(b.id);
    });
  }

  R.dexGrid = function () {
    var host = A.$('#dex-grid');
    host.textContent = '';
    dexItems().forEach(function (it) {
      var owned = !!A.game.items[it.id];
      var cell = A.el('div', 'dex-cell' + (owned ? '' : ' is-unowned') +
                             (dex.selected === it.id ? ' is-selected' : ''));
      cell.dataset.id = it.id;
      var rar = A.el('span', 'dx-rar rar-' + it.rarity, '◆');
      cell.appendChild(rar);
      cell.appendChild(A.el('div', 'dx-icon', it.icon));
      cell.appendChild(A.el('div', 'dx-id', it.id.replace(/^[a-z]+_/, '#')));
      host.appendChild(cell);
    });
    R.dexDetail();
  };

  /* 詳情面板（§3b.2）：未擁有一樣顯示完整資訊；不顯示等級/owned_count（那屬於擁有頁） */
  R.dexDetail = function () {
    var panel = A.$('#dex-detail');
    if (!dex.selected) { panel.hidden = true; return; }
    var it = A.gc.item(dex.selected);
    if (!it || it.type !== dex.type) { panel.hidden = true; return; }
    var owned = !!A.game.items[it.id];

    panel.hidden = false;
    panel.classList.toggle('is-unowned', !owned);
    panel.textContent = '';
    panel.appendChild(A.el('div', 'dd-icon', it.icon));
    var main = A.el('div', 'dd-main');
    main.appendChild(A.el('div', 'dd-name rar-' + it.rarity, it.name));

    var bits = [A.gc.rarity(it.rarity).name];
    var tagId = (it.effect && it.effect.tag) || (it.passive && it.passive.tag);
    if (tagId) {
      var tag = A.gc.tag(tagId);
      bits.push(tag.icon + tag.name);
    } else {
      bits.push('無流派');
    }
    if (it.type === 'gear') bits.push(A.gc.slotName(it.slot));
    main.appendChild(A.el('div', 'dd-sub', bits.join('・')));
    main.appendChild(A.el('div', 'dd-desc', it.description));
    panel.appendChild(main);
  };

  R.dex = function () {
    R.dexFilters();
    R.dexGrid();
  };

  /* ================= 遊戲統計 ================= */
  R.gameStats = function () {
    var host = A.$('#gstat-grid');
    host.textContent = '';
    var ownedCount = Object.keys(A.game.items).length;
    var pairs = [
      ['最高通過層數', A.game.stage.highest_stage],
      ['總抽卡次數', A.game.pulls.total],
      ['寶石累計獲得', fmt(A.economy.gemsEarnedTotal())],
      ['圖鑑收集', ownedCount + ' / ' + A.gc.ITEMS.length]
    ];
    pairs.forEach(function (p) {
      var box = A.el('div', 'gstat-item');
      box.appendChild(A.el('div', 'gstat-num', String(p[1])));
      box.appendChild(A.el('div', 'gstat-label', p[0]));
      host.appendChild(box);
    });
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
