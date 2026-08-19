/* grender.js — 遊戲層 UI（VISUAL_SPEC 全面套用）。
   sprite 一律 <img class="px">（最近鄰縮放）；每個遊戲道具都套稀有度框（.rframe）；
   金色只出現在寶石數字與抽卡入口。全部由資料表驅動，零硬編碼名稱。 */
(function (A) {
  'use strict';

  var R = {};
  A.grender = R;

  var fmt = function (n) { return A.gc.fmt(n); };
  var url = function (rel) { return A.gc.spriteUrl(rel); };

  function img(rel, cls, alt) {
    var el = document.createElement('img');
    el.className = cls || 'px';
    el.src = url(rel);
    el.alt = alt || '';
    return el;
  }

  /* 稀有度框：全 App 簽名元素（VISUAL_SPEC §5） */
  function rframe(item, opts) {
    opts = opts || {};
    var box = A.el('div', 'rframe rar-' + item.rarity);
    if (opts.unowned) box.classList.add('is-unowned');
    if (opts.equipped) box.classList.add('is-equipped');
    box.appendChild(img(item.sprite, 'px', item.name));
    if (opts.ownedCount > 1) {
      box.appendChild(A.el('span', 'own-badge', 'x' + opts.ownedCount));
    }
    return box;
  }

  /* ================= 資源列 ================= */
  R.resources = function () {
    A.$('#res-gems').textContent = fmt(A.economy.gemBalance());
    A.$('#res-material').textContent = fmt(A.game.resources.material);
    A.$('#res-gold').textContent = fmt(A.game.resources.gold);
    var p = A.game.stage.pending;
    A.$('#res-claim-dot').hidden = !(p.material > 0 || p.gold > 0);
  };

  /* ================= 對戰畫面 ================= */
  var replay = { timer: null, log: null, idx: 0 };
  var maxes = { player: 1, monster: 1 };

  function setBars(side, hp, maxHp, shield) {
    var pct = maxHp > 0 ? Math.max(0, Math.min(100, hp / maxHp * 100)) : 0;
    A.$('#hp-' + side).style.width = pct + '%';
    A.$('#shield-' + side).style.width = Math.min(100, shield / maxHp * 100) + '%';
    A.$('#hpnum-' + side).textContent = fmt(Math.max(0, hp)) + '/' + fmt(maxHp) +
      (shield > 0 ? ' +' + fmt(shield) : '');
  }

  function logLine(html, cls) {
    var log = A.$('#battle-log');
    var div = A.el('div', cls || null);
    div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 4) log.removeChild(log.firstChild);   /* 固定 4 行 */
  }
  function n(x) { return '<span class="num">' + fmt(x) + '</span>'; }

  /* 浮動傷害數字（VISUAL_SPEC §8） */
  function floatText(side, text, cls) {
    var unit = A.$('#unit-' + side);
    if (!unit) return;
    var el = A.el('span', 'dmg-float' + (cls ? ' ' + cls : ''), text);
    unit.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-gone'); });
    setTimeout(function () { el.remove(); }, 300);
  }

  function hitFlash(side) {
    var unit = A.$('#unit-' + side);
    unit.classList.add('is-hit');
    setTimeout(function () { unit.classList.remove('is-hit'); }, 120);
  }

  function traitList(host, traits) {
    host.textContent = '';
    traits.forEach(function (t) {
      var tag = A.gc.tag(t.tag);
      if (!tag) return;
      var wrap = A.el('span', 'trait ' + (t.type === 'resist' ? 'is-resist' : 'is-counter'));
      wrap.title = tag.name + (t.type === 'resist' ? '抗性' : '反制');
      wrap.appendChild(img(tag.sprite, 'px', tag.name));
      host.appendChild(wrap);
    });
  }

  function setMonster(mDef) {
    A.$('#bu-monster-sprite').src = url(mDef.sprite);
    A.$('#bu-monster-name').textContent = mDef.name;
    traitList(A.$('#bu-monster-traits'), mDef.traits);
  }

  function describe(e) {
    var who = e.side === 'player' ? '你' : '敵人';
    switch (e.type) {
      case 'hit':        return who + ' 造成 ' + n(e.amount);
      case 'crit':       return who + ' 暴擊 ' + n(e.amount) + '!';
      case 'miss':       return who + ' 落空';
      case 'burn_apply': return who + ' 疊燒傷 ' + n(e.stacks);
      case 'burn_tick':  return who + ' 燒傷 ' + n(e.amount);
      case 'reflect':    return who + ' 反彈 ' + n(e.amount);
      case 'lifesteal':  return who + ' 吸血 ' + n(e.amount);
      case 'shield':     return who + ' 護盾 ' + n(e.amount);
      case 'timeout':    return '超過 100 回合，判定戰敗';
      default: return null;
    }
  }

  function applyEvent(e, silent) {
    if (e.round != null) A.$('#round-counter').textContent = 'R ' + e.round;
    if (e.type === 'battle_start') {
      setMonster(e.monster);
      maxes.player = e.p.hp;
      maxes.monster = e.m.hp;
      if (!silent) { A.$('#battle-log').textContent = ''; logLine('遭遇 ' + e.monster.name); }
    } else if (e.type === 'battle_end') {
      var win = e.winner === 'player';
      logLine(win ? '勝利!' : '戰敗…可免費再挑戰', win ? 'log-win' : 'log-lose');
    } else if (!silent) {
      var text = describe(e);
      if (text) logLine(text);
      if (e.type === 'hit' || e.type === 'crit') {
        var target = e.side === 'player' ? 'monster' : 'player';
        hitFlash(target);
        floatText(target, '-' + fmt(e.amount));
      } else if (e.type === 'lifesteal') {
        floatText(e.side, '+' + fmt(e.amount), 'is-heal');
      } else if (e.type === 'shield') {
        floatText(e.side, '+' + fmt(e.amount), 'is-shield');
      } else if (e.type === 'burn_tick') {
        floatText(e.side, '-' + fmt(e.amount));
      }
    }
    setBars('player', e.p.hp, maxes.player, e.p.shield);
    setBars('monster', e.m.hp, maxes.monster, e.m.shield);
  }

  R.stopReplay = function (jumpToEnd) {
    if (replay.timer) { clearInterval(replay.timer); replay.timer = null; }
    if (jumpToEnd && replay.log) {
      for (var i = replay.idx; i < replay.log.length; i++) {
        applyEvent(replay.log[i], i < replay.log.length - 4);
      }
    }
    replay.log = null;
    A.$('#btn-skip').hidden = true;
  };

  R.playResult = function (result, opts) {
    opts = opts || {};
    R.stopReplay(false);
    var interesting = result.log.filter(function (e) {
      return ['battle_start', 'hit', 'crit', 'miss', 'burn_apply', 'burn_tick',
              'reflect', 'lifesteal', 'shield', 'timeout', 'battle_end'].indexOf(e.type) >= 0;
    });
    if (opts.instant || A.reducedMotion()) {
      interesting.forEach(function (e, i) { applyEvent(e, i < interesting.length - 4); });
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
    if (!A.gc.loaded) return;
    var s = A.game.stage;
    A.$('#stage-now').textContent = s.current_stage;
    A.$('#stage-max').textContent = s.highest_stage;

    var char = A.gc.item(A.game.equipped.character);
    if (char && char.battle_sprite) A.$('#bu-player-sprite').src = url(char.battle_sprite);

    /* 此層怪物預覽（VISUAL_SPEC §8：未打過也要顯示 sprite 與詞綴）。
       詞綴由層數種子決定，預覽與實戰必然一致。 */
    if (!replay.timer) {
      setMonster(A.battle.monsterFor(s.current_stage));
      var ps = A.gacha.playerStats();
      setBars('player', ps.stats.hp, ps.stats.hp, 0);
      var m = A.battle.monsterFor(s.current_stage);
      setBars('monster', m.base_stats.hp, m.base_stats.hp, 0);
    }

    var cap = A.farm.pendingCap();
    var host = A.$('#pending-nums');
    host.textContent = '';
    host.appendChild(img(A.gc.RES_SPRITES.material, 'px', '素材'));
    host.appendChild(document.createTextNode(fmt(s.pending.material) + '/' + fmt(cap.material) + ' '));
    host.appendChild(img(A.gc.RES_SPRITES.gold, 'px', '金幣'));
    host.appendChild(document.createTextNode(fmt(s.pending.gold) + '/' + fmt(cap.gold)));

    var auto = A.$('#btn-auto');
    auto.textContent = '';
    if (s.auto_farming) {
      auto.appendChild(A.el('span', 'run-dot'));
      auto.appendChild(document.createTextNode('自動刷關中'));
      auto.classList.add('is-running');
    } else {
      auto.textContent = '自動刷關';
      auto.classList.remove('is-running');
    }
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
      card.appendChild(rframe(r.item, {}));
      card.appendChild(A.el('div', 'pc-name rar-' + r.item.rarity, r.item.name));
      card.appendChild(A.el('div', 'pc-tag',
        r.isNew ? 'NEW' : 'cap ' + r.levelCap + (r.byPity ? ' P' : '')));
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
    var typeOrder = {};
    A.gc.ENTITY_TYPES.forEach(function (t, i) { typeOrder[t.id] = i; });
    out.sort(function (a, b) {
      return (typeOrder[a.item.type] - typeOrder[b.item.type]) ||
             a.item.id.localeCompare(b.item.id);
    });
    return out;
  }

  var STAT_LABELS = [['atk', 'ATK'], ['hp', 'HP'], ['def', 'DEF'], ['speed', 'SPD']];

  function statTags(stats) {
    var host = A.el('div', 'stat-tags');
    STAT_LABELS.forEach(function (pair) {
      if (!stats[pair[0]]) return;
      var cell = A.el('span', null, pair[1] + ' ');
      cell.appendChild(A.el('span', 'num', fmt(stats[pair[0]])));
      host.appendChild(cell);
    });
    return host;
  }

  /* 裝備欄位列（VISUAL_SPEC §8）：角色/武器/頭/身/飾品/寵物 48px 格 */
  function equipSlotRow() {
    var host = A.el('div', 'equip-slots');
    var eq = A.game.equipped;

    function slot(placeholderSprite, itemId, label) {
      var box = A.el('div', 'equip-slot ' + (itemId ? 'is-filled' : 'is-empty'));
      box.title = label;
      if (itemId && A.gc.item(itemId)) {
        box.appendChild(img(A.gc.item(itemId).sprite, 'px', A.gc.item(itemId).name));
      } else {
        box.appendChild(img(placeholderSprite, 'px', label + '（空）'));
      }
      host.appendChild(box);
    }

    A.gc.ENTITY_TYPES.forEach(function (t) {
      if (t.id === 'gear') {
        A.gc.GEAR_SLOTS.forEach(function (gs) { slot(gs.sprite, eq.gear[gs.id], gs.name); });
      } else if (t.id === 'character') {
        slot(A.gc.SLOT_SPRITES.character, eq.character, t.name);
      } else if (t.id === 'pet') {
        slot(A.gc.SLOT_SPRITES.pet, eq.pet, t.name);
      }
    });
    return host;
  }

  R.owned = function () {
    if (!A.gc.loaded) return;
    var host = A.$('#pane-owned');
    host.textContent = '';
    host.appendChild(equipSlotRow());

    ownedList().forEach(function (o) {
      var it = o.item, rec = o.rec;
      var cap = A.gc.levelCap(rec.owned_count);
      var equipped = A.gacha.isEquipped(it.id);

      var row = A.el('div', 'item-row');
      row.dataset.id = it.id;
      row.appendChild(rframe(it, { equipped: equipped, ownedCount: rec.owned_count }));

      var main = A.el('div', 'item-main');
      var name = A.el('div', 'item-name');
      name.appendChild(A.el('span', 'rar-' + it.rarity, it.name));
      var lv = A.el('span', 'lv', 'Lv ' + rec.current_level + '/' + cap);
      name.appendChild(lv);
      main.appendChild(name);
      main.appendChild(statTags(A.gc.statsAtLevel(it.base_stats, rec.current_level)));
      if (it.effect || it.passive) main.appendChild(A.el('div', 'item-desc', it.description));
      row.appendChild(main);

      var acts = A.el('div', 'item-actions');
      if (it.type !== 'character') {
        var eqBtn = A.el('button', equipped ? 'btn-l3' : 'btn-l2', equipped ? '卸下' : '裝備');
        eqBtn.type = 'button';
        eqBtn.dataset.act = equipped ? 'unequip' : 'equip';
        eqBtn.dataset.id = it.id;
        acts.appendChild(eqBtn);
      }
      var cost = A.gacha.upgradeCost(it.id);
      var upBtn = A.el('button', 'btn-l2');
      upBtn.type = 'button';
      upBtn.dataset.act = 'upgrade';
      upBtn.dataset.id = it.id;
      if (cost.capped) {
        upBtn.textContent = 'MAX';
        upBtn.disabled = true;
      } else {
        upBtn.textContent = '強化 ' + fmt(cost.material) + '/' + fmt(cost.gold);
      }
      acts.appendChild(upBtn);
      row.appendChild(acts);
      host.appendChild(row);
    });
  };

  /* ================= 背包：圖鑑 ================= */
  var dex = { type: null, tag: 'all', rarity: 'all', sort: 'id', q: '', selected: null };
  R.dexState = dex;

  R.dexFilters = function () {
    var host = A.$('#dex-filters');
    host.textContent = '';

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

    var row = A.el('div', 'filter-row');
    var tagSel = A.el('select', 'input');
    tagSel.id = 'dex-tag';
    tagSel.appendChild(new Option('全部流派', 'all'));
    A.gc.TAGS.forEach(function (t) { tagSel.appendChild(new Option(t.name, t.id)); });
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
        if ((it.effect && it.effect.tag) || (it.passive && it.passive.tag)) return false;
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
      var cell = A.el('div', 'dex-cell' + (dex.selected === it.id ? ' is-selected' : ''));
      cell.dataset.id = it.id;
      cell.appendChild(rframe(it, { unowned: !owned }));
      cell.appendChild(A.el('div', 'dx-id', it.id.replace(/^[a-z]+_/, '#')));
      host.appendChild(cell);
    });
    R.dexDetail();
  };

  R.dexDetail = function () {
    var panel = A.$('#dex-detail');
    if (!dex.selected) { panel.hidden = true; return; }
    var it = A.gc.item(dex.selected);
    if (!it || it.type !== dex.type) { panel.hidden = true; return; }
    var owned = !!A.game.items[it.id];

    panel.hidden = false;
    panel.textContent = '';
    panel.appendChild(rframe(it, { unowned: !owned }));
    var main = A.el('div', 'dd-main');
    main.appendChild(A.el('div', 'dd-name rar-' + it.rarity, it.name));

    var sub = A.el('div', 'dd-sub');
    sub.appendChild(A.el('span', 'rar-' + it.rarity, A.gc.rarity(it.rarity).name));
    var tagId = (it.effect && it.effect.tag) || (it.passive && it.passive.tag);
    if (tagId) {
      var tag = A.gc.tag(tagId);
      sub.appendChild(img(tag.sprite, 'px', tag.name));
      sub.appendChild(A.el('span', null, tag.name));
    } else {
      sub.appendChild(A.el('span', null, '無流派'));
    }
    if (it.type === 'gear') sub.appendChild(A.el('span', null, A.gc.slotName(it.slot)));
    main.appendChild(sub);
    main.appendChild(A.el('div', 'dd-desc', it.description));
    panel.appendChild(main);
  };

  R.dex = function () {
    if (!A.gc.loaded) return;
    R.dexFilters();
    R.dexGrid();
  };

  /* ================= 遊戲統計 ================= */
  R.gameStats = function () {
    var host = A.$('#gstat-grid');
    host.textContent = '';
    var pairs = [
      ['最高通過層數', A.game.stage.highest_stage],
      ['總抽卡次數', A.game.pulls.total],
      ['寶石累計獲得', fmt(A.economy.gemsEarnedTotal())],
      ['圖鑑收集', Object.keys(A.game.items).length +
        (A.gc.loaded ? '/' + A.gc.ITEMS.length : '')]
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
