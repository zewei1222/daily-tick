/* 遊戲層純邏輯測試：node test/game.test.js
   對應 GAME_SPEC_v1.md 各節。RNG 全部注入，結果可精確斷言。 */
globalThis.App = {};
var path = require('path');
var root = path.join(__dirname, '..');
['util', 'store', 'model', 'sync'].forEach(function (m) {
  require(path.join(root, 'js', m + '.js'));
});
['content', 'gstore', 'economy', 'gacha', 'battle', 'farm'].forEach(function (m) {
  require(path.join(root, 'js', 'game', m + '.js'));
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

function fresh() { A.game = A.gstore.defaultState(); }
function seq(values) {          /* 依序回傳固定值的假 RNG */
  var i = 0;
  return function () { var v = values[i % values.length]; i++; return v; };
}
function task(type, diff) {
  return { id: 't-' + type + '-' + diff, type: type, title: 'T', difficulty: diff };
}

/* ================================================================ */
group('§0.3 難度 → 寶石對照表');
eq('每日 1..5', [1,2,3,4,5].map(function (d) { return A.gc.coinsFor('daily', d); }), [1,2,3,4,5]);
eq('一般 1..5', [1,2,3,4,5].map(function (d) { return A.gc.coinsFor('general', d); }), [2,4,6,8,10]);
eq('非法難度夾回 1', A.gc.coinsFor('daily', 99), 5);
eq('缺難度當 1', A.gc.coinsFor('general', undefined), 2);

group('§0.1 貨幣事件帳本');
fresh();
var t1 = task('daily', 3);
eq('完成寫入事件並回傳金額', A.economy.onTaskCompleted(t1, '2026-08-18'), 3);
eq('餘額 = 3', A.economy.gemBalance(), 3);
var ev = A.game.events[0];
ok('事件欄位齊全', ev.event_id && ev.task_id === t1.id && ev.task_title_snapshot === 'T' &&
   ev.task_type === 'daily' && ev.difficulty_at_time === 3 && ev.date === '2026-08-18' &&
   ev.currency_granted === 3 && ev.voided === false);
eq('取消沖銷同日事件', A.economy.onTaskUncompleted(t1, '2026-08-18'), true);
eq('事件不刪除只標記', [A.game.events.length, A.game.events[0].voided], [1, true]);
eq('沖銷後餘額 0', A.economy.gemBalance(), 0);
eq('跨日取消找不到事件 → 不動', A.economy.onTaskUncompleted(t1, '2026-08-19'), false);
A.economy.onTaskCompleted(t1, '2026-08-19');   /* 難度仍是 3 */
t1.difficulty = 5;
A.economy.onTaskCompleted(t1, '2026-08-20');   /* 改難度只影響之後 */
eq('事件金額序列（第一筆已沖銷）',
   A.game.events.map(function (e) { return [e.currency_granted, e.voided]; }),
   [[3, true], [3, false], [5, false]]);
eq('餘額只算未沖銷 = 3+5', A.economy.gemBalance(), 8);

group('§3a.3 owned_count 與 level_cap');
eq('cap(1)=10', A.gc.levelCap(1), 10);
eq('cap(3)=20', A.gc.levelCap(3), 20);
eq('cap(0)=0', A.gc.levelCap(0), 0);

group('§3c.2 公式表（GROWTH=1.12）');
eq('素材成本 L1', A.gc.upgradeMaterialCost(1), 5);
eq('金幣成本 L1', A.gc.upgradeGoldCost(1), 20);
eq('素材成本 L10 = 5×1.12^9 ≈ 14', A.gc.upgradeMaterialCost(10), Math.round(5 * Math.pow(1.12, 9)));
eq('掉落 N=1', A.gc.dropAt(1), { material: 2, gold: 8 });
eq('掉落 N=30', A.gc.dropAt(30), { material: Math.round(2 * Math.pow(1.12, 29)),
                                    gold: Math.round(8 * Math.pow(1.12, 29)) });
var st = A.gc.statsAtLevel({ atk: 100, hit_rate: 100, dodge_rate: 5 }, 5);
ok('數值隨等級乘算', Math.abs(st.atk - 100 * Math.pow(1.12, 4)) < 1e-9);
eq('命中/迴避不隨等級成長', [st.hit_rate, st.dodge_rate], [100, 5]);

group('大數字簡寫');
eq('999', A.gc.fmt(999), '999');
eq('1.2K', A.gc.fmt(1200), '1.2K');
eq('3.4M', A.gc.fmt(3400000), '3.4M');
eq('1B', A.gc.fmt(1000000000), '1B');

group('§3a.5 抽卡機率與稀有度對應');
fresh();
/* rng 序列：第一個值決定稀有度（權重 70/25/4.5/0.5 → 0~1 比例），第二個值選項目 */
A.gacha.rng = seq([0.0, 0.0]);          /* 0 → common */
A.game.spends = []; A.game.events = [{ event_id: 'x', task_id: '', task_title_snapshot: '',
  task_type: 'daily', difficulty_at_time: 1, date: '2026-01-01',
  currency_granted: 100000, voided: false }];
var r = A.gacha.pull('general');
eq('rng=0 → common', A.gc.rarity(r.item.rarity).id, 'common');
A.gacha.rng = seq([0.949, 0.0]);        /* 0.949×100=94.9 <95 → uncommon */
r = A.gacha.pull('general');
eq('94.9% 位置 → uncommon', r.item.rarity, 'uncommon');
A.gacha.rng = seq([0.951, 0.0]);        /* 95.1 → rare 區 */
r = A.gacha.pull('general');
eq('95.1% 位置 → rare（特殊裝備）', r.item.rarity, 'rare');
A.gacha.rng = seq([0.9999, 0.0]);
r = A.gacha.pull('general');
eq('99.99% 位置 → mythic', r.item.rarity, 'mythic');
ok('common/uncommon 全是普通（無效果）', A.gc.ITEMS.filter(function (it) {
  return it.type === 'gear' && (it.rarity === 'common' || it.rarity === 'uncommon');
}).every(function (it) { return it.effect === null; }));
ok('rare/mythic 裝備全帶標籤效果', A.gc.ITEMS.filter(function (it) {
  return it.type === 'gear' && (it.rarity === 'rare' || it.rarity === 'mythic');
}).every(function (it) { return it.effect && it.effect.tag; }));

group('§3a.6 保底：階層累積制');
fresh();
A.game.events = [{ event_id: 'x', task_id: '', task_title_snapshot: '', task_type: 'daily',
  difficulty_at_time: 1, date: '2026-01-01', currency_granted: 10000000, voided: false }];
A.gacha.rng = seq([0.0, 0.5]);          /* 永遠 common → 只能靠保底 */
var rarities = [];
for (var i = 0; i < 35; i++) rarities.push(A.gacha.pull('general').item.rarity);
ok('前 34 抽全 common', rarities.slice(0, 34).every(function (x) { return x === 'common'; }));
ok('第 35 抽保底 rare 以上', rarities[34] === 'rare' || rarities[34] === 'mythic');
eq('保底後 rare 計數器歸零', A.game.pulls.pity_rare_counter, 0);
ok('mythic 計數器不歸零（除非抽中 mythic）', A.game.pulls.pity_mythic_counter === 35);

/* mythic 200 抽保底 */
fresh();
A.game.events = [{ event_id: 'x', task_id: '', task_title_snapshot: '', task_type: 'daily',
  difficulty_at_time: 1, date: '2026-01-01', currency_granted: 10000000, voided: false }];
A.gacha.rng = seq([0.0, 0.5]);
var gotMythicAt = 0;
for (var j = 1; j <= 200; j++) {
  var rr = A.gacha.pull('general');
  if (rr.item.rarity === 'mythic') { gotMythicAt = j; break; }
}
eq('第 200 抽必得 mythic', gotMythicAt, 200);
eq('mythic 保底後兩個計數器都歸零',
   [A.game.pulls.pity_rare_counter, A.game.pulls.pity_mythic_counter], [0, 0]);

group('§3a.3 重複 → 上限提升');
fresh();
A.game.events = [{ event_id: 'x', task_id: '', task_title_snapshot: '', task_type: 'daily',
  difficulty_at_time: 1, date: '2026-01-01', currency_granted: 10000, voided: false }];
A.gacha.rng = seq([0.0, 0.0]);          /* 固定抽同一件 common */
var r1 = A.gacha.pull('general');
var firstId = r1.item.id;
var before = A.game.items[firstId].owned_count;
A.gacha.rng = seq([0.0, 0.0]);
var r2 = A.gacha.pull('general');
eq('抽到同一件', r2.item.id, firstId);
eq('owned_count +1', A.game.items[firstId].owned_count, before + 1);
eq('level_cap 跟著 +5', r2.levelCap, A.gc.levelCap(before + 1));
eq('寶石有扣', A.economy.gemBalance(), 10000 - 10);

group('寶石不足');
fresh();
var rr2 = A.gacha.pull('general');
ok('餘額 0 抽卡失敗', !!rr2.error);
eq('失敗不寫消費、不動計數器', [A.game.spends.length, A.game.pulls.total], [0, 0]);

group('§3a.4 強化');
fresh();
A.game.resources = { material: 1000, gold: 1000 };
var up = A.gacha.upgrade('char_001');
eq('升到 Lv2', up.level, 2);
eq('扣素材 5 金幣 20', [A.game.resources.material, A.game.resources.gold], [995, 980]);
A.game.items.char_001.current_level = 10;   /* cap(owned=1)=10 */
var up2 = A.gacha.upgrade('char_001');
ok('滿級擋下', !!up2.error);
A.game.resources = { material: 0, gold: 0 };
A.game.items.char_001.current_level = 5;
var up3 = A.gacha.upgrade('char_001');
ok('資源不足擋下', !!up3.error);
eq('失敗不動等級', A.game.items.char_001.current_level, 5);

group('§2a.3 數值可總');
fresh();
var ps = A.gacha.playerStats();
var char1 = A.gc.item('char_001'), gear1 = A.gc.item('gear_001'), pet1 = A.gc.item('pet_001');
eq('atk = 角色+武器+寵物', ps.stats.atk,
   char1.base_stats.atk + gear1.base_stats.atk + pet1.base_stats.atk);
eq('hp = 角色+寵物（木劍無 hp）', ps.stats.hp, char1.base_stats.hp + pet1.base_stats.hp);
eq('v1 寵物不提供效果', ps.effects.length, 0);
/* 裝上尖刺裝備 → 角色被動（spike ×2）放大 */
A.game.items.gear_101 = { owned_count: 1, current_level: 1 };
A.gacha.equip('gear_101');
ps = A.gacha.playerStats();
eq('特殊裝備效果進列表且被動放大 0.5→1.0',
   ps.effects.map(function (e) { return [e.tag, e.amount]; }), [['spike', 1.0]]);

group('§4.3 怪物生成');
var m1 = A.battle.monsterFor(1, seq([0.1, 0.3, 0.6]));
var m4 = A.battle.monsterFor(4, seq([0.1, 0.3, 0.6]));   /* 同模板（每 3 層循環） */
ok('數值 = base × GROWTH^(N-1)（同模板比較）',
   Math.abs(m4.base_stats.hp / m1.base_stats.hp - Math.pow(1.12, 3)) < 1e-6);
ok('詞綴 1–2 個且來自 tags 表', m4.traits.length >= 1 && m4.traits.length <= 2 &&
   m4.traits.every(function (t) { return !!A.gc.tag(t.tag); }));
eq('模板每 10 層循環（3 種）', [A.battle.monsterFor(1, seq([0.9])).monster_template,
                                A.battle.monsterFor(4, seq([0.9])).monster_template],
   ['basic', 'basic']);

group('§4a.1 速度 carry 制');
/* 速度比 1.5：出手次數應 1,2,1,2 交替。用兩個假單位直接驗 carry 邏輯 —— 
   透過完整 simulate 驗：玩家速度 15 vs 怪 10，數 4 回合內玩家出手數 */
(function () {
  var stats = { stats: { atk: 1, hp: 100000, def: 0, speed: 15, hit_rate: 100, dodge_rate: 0 },
                effects: [], passive: null };
  var monster = { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
                  base_stats: { hp: 100000, atk: 1, def: 0, speed: 10, hit_rate: 100, dodge_rate: 0 },
                  traits: [] };
  var res = A.battle.simulate({ playerStats: stats, monster: monster, rng: seq([0.5]) });
  var perRound = {};
  res.log.forEach(function (e) {
    if ((e.type === 'hit' || e.type === 'crit' || e.type === 'miss') && e.side === 'player') {
      perRound[e.round] = (perRound[e.round] || 0) + 1;
    }
  });
  eq('速度比 1.5 → 出手 1,2,1,2', [perRound[1], perRound[2], perRound[3], perRound[4]],
     [1, 2, 1, 2]);
  var mPerRound = {};
  res.log.forEach(function (e) {
    if ((e.type === 'hit' || e.type === 'crit' || e.type === 'miss') && e.side === 'monster') {
      mPerRound[e.round] = (mPerRound[e.round] || 0) + 1;
    }
  });
  eq('慢方每回合仍至少出手 1 次', [mPerRound[1], mPerRound[2]], [1, 1]);
})();

group('§4a.3 傷害公式');
(function () {
  /* 攻 100、防 100、K=100 → 減傷 50%；roll 固定 0.7（rng=0）；無暴擊 */
  var stats = { stats: { atk: 100, hp: 100000, def: 0, speed: 10, hit_rate: 100, dodge_rate: 0 },
                effects: [], passive: null };
  var monster = { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
                  base_stats: { hp: 100000, atk: 1, def: 100, speed: 1, hit_rate: 100, dodge_rate: 0 },
                  traits: [] };
  var res = A.battle.simulate({ playerStats: stats, monster: monster, rng: seq([0.0]) });
  var first = res.log.filter(function (e) { return e.type === 'hit' && e.side === 'player'; })[0];
  eq('damage = 100×0.7×0.5 = 35', first.amount, 35);
})();
(function () {
  /* 命中下限：hit 100 vs dodge 200 → 有效命中 5%。rng 常 0.5 → 全 miss */
  var stats = { stats: { atk: 100, hp: 1000, def: 0, speed: 10, hit_rate: 100, dodge_rate: 0 },
                effects: [], passive: null };
  var monster = { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
                  base_stats: { hp: 1000, atk: 0, def: 0, speed: 1, hit_rate: 100, dodge_rate: 200 },
                  traits: [] };
  var res = A.battle.simulate({ playerStats: stats, monster: monster, rng: seq([0.5]) });
  var misses = res.log.filter(function (e) { return e.type === 'miss' && e.side === 'player'; });
  ok('極高迴避 → 玩家攻擊落空（但保有 5% 下限）', misses.length > 0);
})();

group('§4a.4 終止與保護');
(function () {
  /* 雙方都打不動 → 100 回合強制玩家判敗 */
  var stats = { stats: { atk: 0.0001, hp: 1e12, def: 1e12, speed: 10, hit_rate: 100, dodge_rate: 0 },
                effects: [], passive: null };
  var monster = { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
                  base_stats: { hp: 1e12, atk: 0.0001, def: 1e12, speed: 10, hit_rate: 100, dodge_rate: 0 },
                  traits: [] };
  var res = A.battle.simulate({ playerStats: stats, monster: monster, rng: seq([0.5]) });
  eq('100 回合上限 → 玩家判敗', [res.rounds, res.winner], [100, 'monster']);
})();

group('標籤效果');
(function () {
  function base(over) {
    var s = { atk: 100, hp: 10000, def: 0, speed: 10, hit_rate: 100, dodge_rate: 0 };
    Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
    return s;
  }
  /* 燒傷：每層每回合結算 */
  var res = A.battle.simulate({
    playerStats: { stats: base(), effects: [{ tag: 'burn', trigger: 'on_hit', amount: 0.15 }],
                   passive: null },
    monster: { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
               base_stats: base({ hp: 100000, atk: 1 }), traits: [] },
    rng: seq([0.5])
  });
  ok('燒傷有疊加與結算', res.log.some(function (e) { return e.type === 'burn_apply'; }) &&
     res.log.some(function (e) { return e.type === 'burn_tick' && e.side === 'monster'; }));

  /* 吸血 */
  res = A.battle.simulate({
    playerStats: { stats: base(), effects: [{ tag: 'lifesteal', trigger: 'on_hit', amount: 0.2 }],
                   passive: null },
    monster: { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
               base_stats: base({ atk: 50 }), traits: [] },
    rng: seq([0.5])
  });
  ok('吸血有觸發', res.log.some(function (e) { return e.type === 'lifesteal' && e.side === 'player'; }));

  /* 護盾：開場獲得，先吸收傷害 */
  res = A.battle.simulate({
    playerStats: { stats: base(), effects: [{ tag: 'shield', trigger: 'on_battle_start', amount: 0.2 }],
                   passive: null },
    monster: { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
               base_stats: base({ atk: 50 }), traits: [] },
    rng: seq([0.5])
  });
  var shieldEv = res.log.filter(function (e) { return e.type === 'shield' && e.side === 'player'; })[0];
  eq('開場護盾 = 20% 最大生命', shieldEv.amount, 2000);

  /* 怪物 resist 削弱玩家效果：尖刺 0.5 對上 50% 抗 → 反傷減半 */
  res = A.battle.simulate({
    playerStats: { stats: base({ atk: 0.0001, hp: 100000 }),
                   effects: [{ tag: 'spike', trigger: 'on_damage_taken', amount: 1.0 }],
                   passive: null },
    monster: { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
               base_stats: base({ atk: 100, hp: 100000 }),
               traits: [{ tag: 'spike', type: 'resist', value: 0.5 }] },
    rng: seq([0.0])
  });
  var refl = res.log.filter(function (e) { return e.type === 'reflect' && e.side === 'player'; })[0];
  var hitBefore = res.log.filter(function (e) { return e.type === 'hit' && e.side === 'monster'; })[0];
  eq('反傷被 resist 減半', refl.amount, Math.max(1, Math.round(hitBefore.amount * 0.5)));

  /* 怪物 counter：怪物帶著玩家的標籤效果反打 */
  res = A.battle.simulate({
    playerStats: { stats: base({ hp: 100000 }), effects: [], passive: null },
    monster: { monster_template: 'basic', name: 'x', icon: 'x', level: 1,
               base_stats: base({ atk: 50, hp: 100000 }),
               traits: [{ tag: 'lifesteal', type: 'counter', value: 0.5 }] },
    rng: seq([0.5])
  });
  ok('counter：怪物吸血', res.log.some(function (e) {
    return e.type === 'lifesteal' && e.side === 'monster';
  }));
})();

group('§3c.4 / §4.4 闖關與待領池');
fresh();
A.game.items.char_001.current_level = 10;   /* 拉高數值保證第 1 層能贏 */
A.game.items.gear_001.current_level = 10;
A.battle.rng = seq([0.5]);
var res1 = A.farm.battleOnce(null, { manual: true });
eq('第 1 層勝利', res1.winner, 'player');
eq('通關自動進下一層', A.game.stage.current_stage, 2);
eq('highest_stage 更新', A.game.stage.highest_stage, 1);
eq('掉落進待領池（第 1 層 = 2/8）', [A.game.stage.pending.material, A.game.stage.pending.gold], [2, 8]);
var got = A.farm.claim();
eq('領取入袋', [A.game.resources.material, A.game.resources.gold], [2, 8]);
eq('領取後清空', [A.game.stage.pending.material, A.game.stage.pending_battles], [0, 0]);
ok('空池領取回 null', A.farm.claim() === null);

/* 待領池上限 */
fresh();
A.game.stage.current_stage = 1;
A.game.stage.pending = { material: 60, gold: 240 };   /* = 30 場 × (2/8) 滿了 */
ok('池滿判定', A.farm.pendingFull());
eq('上限 = 30 × drop', A.farm.pendingCap(), { material: 60, gold: 240 });

group('打輸的行為');
fresh();
/* 不強化直接打第 50 層必輸 */
A.game.stage.current_stage = 50;
A.game.stage.highest_stage = 49;
A.battle.rng = seq([0.5]);
var resL = A.farm.battleOnce(null, {});           /* 自動模式 */
eq('自動模式打輸退回刷已通過層', A.game.stage.current_stage, 49);
fresh();
A.game.stage.current_stage = 50;
A.game.stage.highest_stage = 49;
var resM = A.farm.battleOnce(null, { manual: true });
eq('手動挑戰打輸不退層（可立即免費再挑戰）', A.game.stage.current_stage, 50);
eq('打輸不掉資源', [A.game.stage.pending.material, A.game.stage.pending.gold], [0, 0]);

group('§0.4 遊戲同步決策');
function g(over) {
  var x = A.gstore.defaultState();
  Object.keys(over || {}).forEach(function (k) { x[k] = over[k]; });
  return x;
}
var emptyG = g({ updated_at: '2026-08-18T10:00:00Z' });
var richG = g({ updated_at: '2000-01-01T00:00:00Z' });
richG.pulls.total = 5;
eq('本機全新、遠端有進度 → pull（硬規則，無視時間）', A.gameSyncDecision(emptyG, richG), 'pull');
eq('無遠端 → push', A.gameSyncDecision(richG, null), 'push');
eq('無遠端且本機全新 → noop（不為空資料打 API）', A.gameSyncDecision(emptyG, null), 'noop');
var newer = g({ updated_at: '2026-08-18T10:00:00Z' }); newer.pulls.total = 1;
var older = g({ updated_at: '2026-08-18T09:00:00Z' }); older.pulls.total = 2;
eq('本機較新 → push', A.gameSyncDecision(newer, older), 'push');
eq('遠端較新 → pull', A.gameSyncDecision(older, newer), 'pull');

group('gstore 正規化');
var n1 = A.gstore.normalize({});
ok('空物件 → 完整預設（含初始三件）', n1.items.char_001 && n1.items.gear_001 && n1.items.pet_001);
var n2 = A.gstore.normalize({ items: { char_001: { owned_count: 3, current_level: 999 } } });
eq('等級夾在上限內', n2.items.char_001.current_level, A.gc.levelCap(3));
var n3 = A.gstore.normalize({ items: { 'hacked_item': { owned_count: 5, current_level: 1 } } });
ok('目錄外的 id 被忽略', !n3.items.hacked_item);
var n4 = A.gstore.normalize({ equipped: { character: 'pet_001', gear: { weapon: 'gear_101' } } });
eq('裝備型別錯誤 → 回預設', n4.equipped.character, 'char_001');
eq('未擁有的裝備不掛上', n4.equipped.gear.weapon, 'gear_001');
ok('checkPayload 擋掉未來版本',
   A.gstore.checkPayload({ game_schema_version: 99 }).ok === false);

group('限定池機制（v1 無現役池，但機制要能動）');
fresh();
A.game.events = [{ event_id: 'x', task_id: '', task_title_snapshot: '', task_type: 'daily',
  difficulty_at_time: 1, date: '2026-01-01', currency_granted: 10000, voided: false }];
A.gc.POOLS.push({ pool_id: 'limited_test', pool_type: 'limited',
                  item_ids: ['gear_110'], pity_threshold: 35, retired_at: null });
A.game.pulls.pity_rare_counter = 34;              /* 下一抽觸發保底 */
A.gacha.rng = seq([0.0, 0.0]);
var rl = A.gacha.pull('limited_test');
eq('限定池保底＝就是該項目', rl.item.id, 'gear_110');
ok('抽中後池子退役', !!A.game.pools.limited_test.retired_at);
var rl2 = A.gacha.pull('limited_test');
ok('退役後不可再抽', !!rl2.error);
A.gc.POOLS.pop();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
