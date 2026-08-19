/* sw.js — cache-first + 背景更新（SPEC §7.3）。
   啟動速度優先：一律先回快取，絕不等網路。
   不使用 skipWaiting() / clients.claim()；新內容由 fetch 階段寫進同一份快取，
   下次載入即生效，並在本次瀏覽中以提示條告知。 */

var CACHE_VERSION = 'v6';
var BASE = '/daily-tick/';
var CACHE = 'daily-tick-' + CACHE_VERSION;

var SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'css/tokens.css',
  BASE + 'css/app.css',
  BASE + 'js/util.js',
  BASE + 'js/store.js',
  BASE + 'js/model.js',
  BASE + 'js/sync.js',
  BASE + 'js/render.js',
  BASE + 'js/gestures.js',
  BASE + 'js/main.js',
  BASE + 'js/game/content.js',
  BASE + 'js/game/gstore.js',
  BASE + 'js/game/economy.js',
  BASE + 'js/game/gacha.js',
  BASE + 'js/game/battle.js',
  BASE + 'js/game/farm.js',
  BASE + 'js/game/grender.js',
  BASE + 'vendor/sortable.min.js',
  BASE + 'vendor/fonts/cubic11.woff2',
  BASE + 'vendor/fonts/silkscreen.woff2',
  BASE + 'data/tags.json',
  BASE + 'data/entity_types.json',
  BASE + 'data/characters.json',
  BASE + 'data/gear.json',
  BASE + 'data/pets.json',
  BASE + 'data/monster_templates.json',
  BASE + 'assets/battle_armored.png',
  BASE + 'assets/battle_basic.png',
  BASE + 'assets/battle_char_001.png',
  BASE + 'assets/battle_swift.png',
  BASE + 'assets/char_001.png',
  BASE + 'assets/gear_001.png',
  BASE + 'assets/gear_002.png',
  BASE + 'assets/gear_003.png',
  BASE + 'assets/gear_004.png',
  BASE + 'assets/gear_005.png',
  BASE + 'assets/gear_006.png',
  BASE + 'assets/gear_007.png',
  BASE + 'assets/gear_008.png',
  BASE + 'assets/gear_101.png',
  BASE + 'assets/gear_102.png',
  BASE + 'assets/gear_103.png',
  BASE + 'assets/gear_104.png',
  BASE + 'assets/gear_105.png',
  BASE + 'assets/gear_106.png',
  BASE + 'assets/gear_107.png',
  BASE + 'assets/gear_108.png',
  BASE + 'assets/gear_109.png',
  BASE + 'assets/gear_110.png',
  BASE + 'assets/pet_001.png',
  BASE + 'assets/res_gem.png',
  BASE + 'assets/res_gold.png',
  BASE + 'assets/res_material.png',
  BASE + 'assets/slot_accessory.png',
  BASE + 'assets/slot_body.png',
  BASE + 'assets/slot_character.png',
  BASE + 'assets/slot_head.png',
  BASE + 'assets/slot_pet.png',
  BASE + 'assets/slot_weapon.png',
  BASE + 'assets/tag_burn.png',
  BASE + 'assets/tag_crit.png',
  BASE + 'assets/tag_lifesteal.png',
  BASE + 'assets/tag_shield.png',
  BASE + 'assets/tag_spike.png',
  BASE + 'icons/icon-180.png',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png'
];

var INDEX = BASE + 'index.html';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* 單筆失敗不要讓整個 install 失敗 */
      return Promise.all(SHELL.map(function (url) {
        return fetch(bust(url)).then(function (res) {
          if (res && res.ok) return cache.put(new Request(url), res);
        }).catch(function (err) {
          console.warn('precache 略過', url, err);
        });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      /* GitHub API 等交給網路 */
  if (!url.pathname.startsWith(BASE)) return;
  if (url.searchParams.has('live')) return;             /* 版本探測：一律走網路，不攔 */

  var key = req.mode === 'navigate' ? new Request(INDEX) : req;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(key).then(function (hit) {
        if (hit) {
          e.waitUntil(revalidate(cache, key));
          return hit;
        }
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
          return res;
        }).catch(function () {
          return cache.match(INDEX).then(function (fallback) {
            return fallback || new Response('離線且無快取', { status: 503 });
          });
        });
      });
    })
  );
});

/* 繞過 HTTP 快取，但寫回時仍用正規 key */
function bust(url) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_sw=' + Date.now();
}

function revalidate(cache, key) {
  return fetch(bust(key.url)).then(function (res) {
    if (!res || !res.ok) return;
    return cache.match(key).then(function (old) {
      return Promise.all([
        old ? old.clone().text() : Promise.resolve(null),
        res.clone().text()
      ]).then(function (pair) {
        return cache.put(key, res).then(function () {
          if (pair[0] !== null && pair[0] !== pair[1]) notify(key.url);
        });
      });
    });
  }).catch(function () { /* 離線：安靜略過 */ });
}

/* 記下背景更新過的檔案。用集合而不是一次性旗標：
   訊息可能在頁面掛上監聽之前就發出去，頁面之後還要能主動問。 */
var updatedUrls = [];

function notify(url) {
  if (updatedUrls.indexOf(url) < 0) updatedUrls.push(url);
  self.clients.matchAll({ type: 'window' }).then(function (list) {
    list.forEach(function (c) { c.postMessage({ type: 'asset-updated', url: url }); });
  });
}

/* 把 app shell 全部重抓一次寫回目前的快取，讓重新載入後拿到的是一致的新版 */
function refreshShell() {
  return caches.open(CACHE).then(function (cache) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(bust(u)).then(function (res) {
        if (res && res.ok) return cache.put(new Request(u), res);
      }).catch(function () {});
    }));
  }).then(function () { updatedUrls = []; });
}

self.addEventListener('message', function (e) {
  var data = e.data || {};
  var reply = function (msg) {
    if (e.source) e.source.postMessage(msg);
    else if (e.ports && e.ports[0]) e.ports[0].postMessage(msg);
  };
  if (data.type === 'check') {
    reply({ type: 'sw-state', version: CACHE_VERSION, updated: updatedUrls.length > 0 });
    if (updatedUrls.length) reply({ type: 'asset-updated', url: updatedUrls[0] });
  } else if (data.type === 'refresh') {
    e.waitUntil(refreshShell().then(function () { reply({ type: 'refreshed' }); }));
  }
});
