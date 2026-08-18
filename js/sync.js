/* sync.js — GitHub Gist 備份（SPEC §6）。永遠在背景執行，絕不阻塞首屏。 */
(function (A) {
  'use strict';

  var FILENAME = 'todo-backup.json';
  var FILENAME_GAME = 'game-backup.json';   /* 同一個 gist 的第二個檔案（GAME_SPEC §0.4） */
  var API = 'https://api.github.com';
  var PUSH_DEBOUNCE = 3000;
  var TIMEOUT = 15000;

  var S = {
    status: 'unset',     /* unset | syncing | synced | offline | error */
    message: '',
    pendingPush: false,
    onChange: null,      /* 由 main.js 指派 */
    onPull: null
  };
  A.sync = S;

  S.token = function () { return A.ls.get(A.LSK.token) || ''; };
  S.gistId = function () { return A.ls.get(A.LSK.gistId) || ''; };
  S.lastSyncedAt = function () { return A.ls.get(A.LSK.synced) || ''; };

  S.setToken = function (t) {
    t = (t || '').trim();
    if (t) A.ls.set(A.LSK.token, t);
    else { A.ls.del(A.LSK.token); A.ls.del(A.LSK.gistId); A.ls.del(A.LSK.synced); }
    if (!t) setStatus('unset', '');
  };

  function setStatus(status, message) {
    S.status = status;
    S.message = message || '';
    if (S.onChange) S.onChange(S);
  }
  S.setStatus = setStatus;

  S.statusText = function () {
    switch (S.status) {
      case 'syncing': return '同步中';
      case 'synced':  return '已同步';
      case 'offline': return '離線待同步';
      case 'error':   return '同步失敗';
      default:        return '未設定備份';
    }
  };

  /* ---------- HTTP ---------- */
  function request(path, opts) {
    opts = opts || {};
    var token = S.token();
    if (!token) return Promise.reject({ kind: 'unset', message: '未設定 PAT' });

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;

    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        return Promise.reject({ kind: 'auth', message: 'PAT 無效或缺少 gist 權限' });
      }
      if (res.status === 404) return Promise.reject({ kind: 'notfound', message: '找不到 gist' });
      if (!res.ok) {
        return Promise.reject({ kind: 'http', message: 'GitHub 回應 ' + res.status });
      }
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      return Promise.reject({ kind: 'net', message: '連線失敗', cause: err });
    });
  }

  /* ---------- gist 讀寫 ---------- */
  function findGistId() {
    return request('/gists?per_page=100').then(function (list) {
      var found = (list || []).filter(function (g) {
        return g && g.files && (g.files[FILENAME] || g.files[FILENAME_GAME]);
      }).sort(function (a, b) {
        return Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0);
      })[0];
      return found ? found.id : '';
    });
  }
  S.findGistId = findGistId;

  function payload() {
    /* 只序列化主資料；PAT 從不在 state 裡（SPEC §6.4-5） */
    return JSON.stringify(A.state, null, 2);
  }
  S.payload = payload;

  function gamePayload() {
    return A.game ? JSON.stringify(A.game, null, 2) : null;
  }

  function fileText(g, name) {
    var f = g && g.files && g.files[name];
    if (!f) return Promise.resolve(null);
    if (f.truncated && f.raw_url) {
      return fetch(f.raw_url).then(function (r) { return r.text(); });
    }
    return Promise.resolve(f.content);
  }

  /* 回傳 { todo, game }（各自可為 null） */
  function readGist(id) {
    return request('/gists/' + id).then(function (g) {
      return Promise.all([fileText(g, FILENAME), fileText(g, FILENAME_GAME)]);
    }).then(function (texts) {
      var todo = null, game = null;
      if (texts[0]) {
        var r1 = A.parsePayload(texts[0]);
        if (r1.ok) todo = r1.state;
        else console.warn('遠端 todo 備份無法解析：' + r1.error);
      }
      if (texts[1] && A.gstore) {
        var r2 = A.gstore.parsePayload(texts[1]);
        if (r2.ok) game = r2.state;
        else console.warn('遠端遊戲備份無法解析：' + r2.error);
      }
      return { todo: todo, game: game };
    });
  }

  function writeGist(id) {
    var files = {};
    files[FILENAME] = { content: payload() };
    var gp = gamePayload();
    if (gp) files[FILENAME_GAME] = { content: gp };
    if (id) {
      return request('/gists/' + id, { method: 'PATCH', body: { files: files } })
        .then(function () { return id; });
    }
    return request('/gists', {
      method: 'POST',
      body: { description: 'daily-tick backup', public: false, files: files }
    }).then(function (g) { return g.id; });
  }

  /* ---------- 決策（SPEC §6.3，純函式，可測） ---------- */
  A.syncDecision = function (local, remote) {
    if (!remote) return 'push';
    /* 硬規則：本機 0 筆而遠端有資料 → 一律拉回，永不上傳覆蓋 */
    if (local.tasks.length === 0 && remote.tasks.length > 0) return 'pull';
    var lt = Date.parse(local.updated_at) || 0;
    var rt = Date.parse(remote.updated_at) || 0;
    if (rt > lt) return 'pull';
    if (lt > rt) return 'push';
    return 'noop';
  };

  /* 遊戲層決策（GAME_SPEC §0.4）：沿用同一組規則，含硬規則。
     「本機為空」的定義：從未有任何貨幣事件、也從未抽過卡、也沒打過任何層。 */
  A.gameIsEmpty = function (g) {
    return g.events.length === 0 && g.pulls.total === 0 && g.stage.highest_stage === 0;
  };

  A.gameSyncDecision = function (local, remote) {
    /* 遠端沒有遊戲檔且本機也全新：沒有東西值得上傳，不要為此打 API */
    if (!remote) return A.gameIsEmpty(local) ? 'noop' : 'push';
    if (A.gameIsEmpty(local) && !A.gameIsEmpty(remote)) return 'pull';
    var lt = Date.parse(local.updated_at) || 0;
    var rt = Date.parse(remote.updated_at) || 0;
    if (rt > lt) return 'pull';
    if (lt > rt) return 'push';
    return 'noop';
  };

  /* ---------- 動作 ---------- */
  var chain = Promise.resolve();
  function serial(fn) {
    chain = chain.then(fn, fn);
    return chain;
  }

  function handleError(err) {
    if (!err) { setStatus('error', '未知錯誤'); return; }
    if (err.kind === 'unset') { setStatus('unset', ''); return; }
    if (err.kind === 'net') { S.pendingPush = true; setStatus('offline', ''); return; }
    if (err.kind === 'auth') { setStatus('error', err.message); return; }
    setStatus('error', err.message || '同步失敗');
  }

  function markSynced() {
    A.ls.set(A.LSK.synced, A.nowIso());
    S.pendingPush = false;
    setStatus('synced', '');
  }

  function doPush() {
    var id = S.gistId();
    setStatus('syncing', '');
    return writeGist(id).then(function (newId) {
      if (newId && newId !== id) A.ls.set(A.LSK.gistId, newId);
      markSynced();
    }, function (err) {
      if (err && err.kind === 'notfound' && id) {
        /* gist 被刪掉了：重建一份 */
        A.ls.del(A.LSK.gistId);
        return writeGist('').then(function (newId) {
          A.ls.set(A.LSK.gistId, newId);
          markSynced();
        }, handleError);
      }
      handleError(err);
    });
  }

  function doPullTodo(remote) {
    A.state = remote;                       /* 已由 parsePayload 正規化 */
    A.save({ bump: false, sync: false });   /* 保留遠端 updated_at */
    if (S.onPull) S.onPull();
  }

  function doPullGame(remote) {
    A.game = remote;
    if (A.gstore) A.gstore.save({ bump: false });
    if (S.onGamePull) S.onGamePull();
  }

  /* 任何資料變動 → debounce 3 秒後推上去 */
  var debounced = A.debounce(function () {
    if (!S.token()) return;
    serial(function () { return doPush(); });
  }, PUSH_DEBOUNCE);

  S.schedulePush = function () {
    if (!S.token()) { setStatus('unset', ''); return; }
    S.pendingPush = true;
    debounced();
  };

  /* 遊戲層：僅里程碑事件觸發，debounce 10 秒（GAME_SPEC §0.4）。
     上傳動作與 todo 共用（一次 PATCH 兩個檔案）。 */
  var debouncedGame = A.debounce(function () {
    if (!S.token()) return;
    serial(function () { return doPush(); });
  }, (A.gc && A.gc.CONST.SYNC_DEBOUNCE_MS) || 10000);

  S.scheduleGamePush = function () {
    if (!S.token()) return;
    S.pendingPush = true;
    debouncedGame();
  };

  S.pushNow = function () {
    if (!S.token()) { setStatus('unset', ''); return Promise.resolve(); }
    return serial(function () { return doPush(); });
  };

  /* 啟動同步：完全在背景 */
  S.startup = function () {
    if (!S.token()) { setStatus('unset', ''); return Promise.resolve(); }
    return serial(function () {
      setStatus('syncing', '');
      var idPromise = S.gistId() ? Promise.resolve(S.gistId())
                                 : findGistId().then(function (id) {
                                     if (id) A.ls.set(A.LSK.gistId, id);
                                     return id;
                                   });
      return idPromise.then(function (id) {
        return (id ? readGist(id) : Promise.resolve({ todo: null, game: null }))
          .then(function (remote) {
            var todoDecision = A.syncDecision(A.state, remote.todo);
            var gameDecision = A.game ? A.gameSyncDecision(A.game, remote.game) : 'noop';

            if (todoDecision === 'pull') doPullTodo(remote.todo);
            if (gameDecision === 'pull') doPullGame(remote.game);

            /* 任一份需要上傳就推一次（writeGist 一次寫兩個檔案） */
            if (todoDecision === 'push' || gameDecision === 'push') return doPush();
            if (todoDecision === 'pull' || gameDecision === 'pull') {
              A.ls.set(A.LSK.synced, A.nowIso());
              S.pendingPush = false;
              setStatus('synced', '');
              return;
            }
            markSynced();
          }, function (err) {
            if (err && err.kind === 'notfound') { A.ls.del(A.LSK.gistId); return doPush(); }
            return Promise.reject(err);
          });
      });
    }).catch(handleError);
  };

  /* 連線恢復 / 回到前景時重試 */
  S.retryIfPending = function () {
    if (!S.token()) return;
    if (S.pendingPush || S.status === 'offline' || S.status === 'error') S.pushNow();
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
