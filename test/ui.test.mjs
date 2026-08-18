import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:8731/daily-tick/';
let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), { got, want });
const group = t => console.log('\n' + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const errors = [];
async function newPage(ctx) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  return page;
}

async function tapEl(page, sel) {
  const box = await page.$eval(sel, el => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(box.x, box.y);
}

async function swipeLeft(page, sel, dist) {
  const box = await page.$eval(sel, el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width - 30, y: r.y + r.height / 2 };
  });
  await page.touchscreen.touchStart(box.x, box.y);
  for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(box.x - (dist * i / 8), box.y);
  await page.touchscreen.touchEnd();
  await sleep(300);
}

const addTask = (page, type, title, fields) => page.evaluate((type, title, fields) => {
  const t = App.addTask(type, Object.assign({ title: title }, fields || {}));
  App.render.list(type, { animate: false }); App.save(); return t.id;
}, type, title, fields);

const titles = (page, type) => page.$$eval('#list-' + type + ' .card-title', ns => ns.map(n => n.textContent));

/* ================================================================= */
group('啟動與首屏（J1 / J4 / §9.1）');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  eq('J4 首次啟動顯示空狀態', await page.$eval('#empty-daily', e => !e.hidden), true);
  eq('清單為空', (await titles(page, 'daily')).length, 0);

  for (let i = 1; i <= 20; i++) await addTask(page, 'daily', '任務' + i);
  await page.evaluate(() => App.save());
  await sleep(150);

  /* 重新載入：檢查 DOMContentLoaded 當下清單就已經有 20 筆（不得先空白） */
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  eq('J1 首屏（DOMContentLoaded）已有 20 筆', (await titles(page, 'daily')).length, 20);
  eq('空狀態隱藏', await page.$eval('#empty-daily', e => e.hidden), true);
  eq('mirror 已寫入 localStorage',
     await page.evaluate(() => JSON.parse(localStorage.getItem('mirror')).tasks.length), 20);

  /* 清掉 mirror，只留 IndexedDB → 階段二補上 */
  await page.evaluate(() => localStorage.removeItem('mirror'));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(300);
  eq('mirror 遺失時由 IndexedDB 還原', (await titles(page, 'daily')).length, 20);
  await ctx.close();
}

/* ================================================================= */
group('D. 手勢：點擊 / 左滑刪除');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await addTask(page, 'daily', '喝水');
  await addTask(page, 'daily', '運動');

  await tapEl(page, '#list-daily .row:first-child .check');
  await sleep(300);
  eq('D1 點勾選框即完成', await page.$eval('#list-daily .row:last-child .card',
     c => c.classList.contains('is-done')), true);
  eq('C1 已完成沉底', await titles(page, 'daily'), ['運動', '喝水']);
  eq('B 勾選後出現連續期數 1', await page.$eval('#list-daily .row:last-child .badge',
     s => s.hidden ? null : s.textContent), '1');

  await tapEl(page, '#list-daily .row:last-child .card-title');
  await sleep(300);
  eq('D1b 點文字取消完成', await titles(page, 'daily'), ['喝水', '運動']);
  eq('B1 未完成不顯示數字', await page.$eval('#list-daily .row:first-child .badge',
     s => s.hidden), true);

  /* D2b 快速連點 10 次（用一般任務：不會沉底，座標固定指向同一張卡） */
  await tapEl(page, '.tab[data-tab="general"]');
  await sleep(200);
  await addTask(page, 'general', '連點');
  await page.evaluate(() => {
    window.__toggles = 0;
    const real = App.toggle;
    App.toggle = function (t) { window.__toggles++; return real(t); };
  });
  const box = await page.$eval('#list-general .row:first-child .card', el => {
    const r = el.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 };
  });
  for (let i = 0; i < 10; i++) { await page.touchscreen.tap(box.x, box.y); }
  await sleep(400);
  eq('D2b 連點 10 次 = 10 次切換', await page.evaluate(() => window.__toggles), 10);
  eq('D2b 最終回到未完成',
     await page.evaluate(() => App.state.tasks.find(t => t.title === '連點').completed_at), null);
  const idbVal = await page.evaluate(async () => {
    const rec = await App.idbLoad(); return rec.tasks.find(t => t.title === '連點').completed_at;
  });
  eq('D2b IndexedDB 與記憶體一致', idbVal, null);
  await page.evaluate(() => { App.deleteTask(App.state.tasks.find(t => t.title === '連點').id);
                              App.render.list('general', { animate: false }); App.save(); });
  await tapEl(page, '.tab[data-tab="daily"]');
  await sleep(200);

  /* D3-D6 左滑 */
  await swipeLeft(page, '#list-daily .row:first-child .card', 80);
  const tx = await page.$eval('#list-daily .row:first-child .card', c => c.style.transform);
  ok('D3 左滑後卡片位移並露出刪除', /translateX\(-9[0-9](\.\d+)?px\)/.test(tx), tx);
  eq('D3 卡片未被刪除', (await titles(page, 'daily')).length, 2);

  /* D5 點畫面其他處收回 */
  await tapEl(page, '#app-title');
  await sleep(300);
  eq('D5 點其他處收回', await page.$eval('#list-daily .row:first-child .card',
     c => c.style.transform), '');
  eq('D5 未刪除', (await titles(page, 'daily')).length, 2);

  /* D6 一次只有一張露出 */
  await swipeLeft(page, '#list-daily .row:first-child .card', 80);
  await swipeLeft(page, '#list-daily .row:last-child .card', 80);
  await sleep(300);
  eq('D6 第一張自動收回',
     await page.$$eval('#list-daily .card', cs => cs.filter(c => c.style.transform).length), 1);

  /* D4 點刪除鈕 */
  await tapEl(page, '#list-daily .row:last-child .btn-del');
  await sleep(350);
  eq('D4 刪除生效', await titles(page, 'daily'), ['喝水']);

  /* D7 垂直捲動不觸發左滑 */
  for (let i = 0; i < 12; i++) await addTask(page, 'daily', 'x' + i);
  await sleep(100);
  const p = await page.$eval('#list-daily .row:first-child .card', el => {
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.touchStart(p.x, p.y);
  for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(p.x, p.y - i * 20);
  await page.touchscreen.touchEnd();
  await sleep(300);
  eq('D7 垂直滑動不產生左滑位移',
     await page.$$eval('#list-daily .card', cs => cs.filter(c => c.style.transform).length), 0);
  eq('D7 也沒有誤觸勾選',
     await page.evaluate(() => App.state.tasks.filter(t => App.isDone(t)).length), 0);
  await ctx.close();
}

/* ================================================================= */
group('C / 編輯模式');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await addTask(page, 'daily', 'a');
  await addTask(page, 'daily', 'b');
  await addTask(page, 'daily', 'c');
  await tapEl(page, '#list-daily .row:nth-child(2) .card');   /* b 完成 → 沉底 */
  await sleep(300);
  eq('C1 中間任務沉底', await titles(page, 'daily'), ['a', 'c', 'b']);

  eq('編輯模式前未載入 Sortable', await page.evaluate(() => typeof window.Sortable), 'undefined');
  await tapEl(page, '#btn-edit');
  await sleep(300);
  eq('C2 編輯模式回到原位', await titles(page, 'daily'), ['a', 'b', 'c']);
  eq('C2 仍是已完成樣式', await page.$eval('#list-daily .row:nth-child(2) .card',
     c => c.classList.contains('is-done')), true);
  eq('C9 編輯模式隱藏 FAB', await page.$eval('#fab', e => e.hidden), true);
  eq('編輯模式顯示拖曳把手', await page.$eval('#list-daily .drag-handle',
     h => getComputedStyle(h).display !== 'none'), true);
  eq('進編輯模式才載入 Sortable', await page.evaluate(() => typeof window.Sortable), 'function');

  /* C8 編輯模式點勾選框無反應 */
  await tapEl(page, '#list-daily .row:first-child .check');
  await sleep(250);
  eq('C8 勾選狀態不變', await page.evaluate(() => App.isDone(App.state.tasks.find(t => t.title === 'a'))), false);
  eq('C8 不開 Modal', await page.$eval('#sheet-task', e => e.hidden), true);

  /* D1c 編輯模式點卡片開 Modal 改名 */
  await tapEl(page, '#list-daily .row:first-child .card-title');
  await sleep(300);
  eq('D1c 開啟編輯 Modal', await page.$eval('#sheet-task', e => !e.hidden), true);
  eq('Modal 帶入原標題', await page.$eval('#input-title', i => i.value), 'a');
  eq('編輯既有任務不顯示類型切換', await page.$eval('#group-type', e => e.hidden), true);
  await page.$eval('#input-title', i => { i.value = 'a2'; });
  await tapEl(page, '#sheet-task [data-act="save"]');
  await sleep(300);
  eq('D1c 改名生效', await titles(page, 'daily'), ['a2', 'b', 'c']);
  eq('D1c 完成狀態未被改動',
     await page.evaluate(() => App.isDone(App.state.tasks.find(t => t.title === 'b'))), true);

  /* §3.2 拖曳排序 → order_index 重排 */
  await page.evaluate(() => {
    const ids = App.sortedTasks('daily', 'edit').map(t => t.id);
    App.applyOrder('daily', [ids[2], ids[0], ids[1]]);
    App.save();
    App.render.list('daily', { animate: false });
  });
  await tapEl(page, '#btn-edit');
  await sleep(300);
  eq('C3 離開編輯模式套用新順序（已完成仍沉底）', await titles(page, 'daily'), ['c', 'a2', 'b']);
  eq('order_index 為 1000 遞增',
     await page.evaluate(() => App.sortedTasks('daily', 'edit').map(t => t.order_index)),
     [1000, 2000, 3000]);

  /* J9 從背景回來以一般模式 */
  await tapEl(page, '#btn-edit');
  await sleep(250);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(250);
  eq('J9 回前景強制回到一般模式', await page.evaluate(() => App.mode), 'normal');
  await ctx.close();
}

/* ================================================================= */
group('C7 新增 / 一般分頁 / H 清除已完成');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  await tapEl(page, '#fab');
  await sleep(300);
  eq('FAB 開啟新增 Modal', await page.$eval('#sheet-task', e => !e.hidden), true);
  eq('新增時可選類型', await page.$eval('#group-type', e => e.hidden), false);
  await page.$eval('#input-title', i => { i.value = '第一筆'; });
  await tapEl(page, '#sheet-task [data-act="save"]');
  await sleep(300);
  eq('新增成功', await titles(page, 'daily'), ['第一筆']);

  await addTask(page, 'daily', '第二筆');
  await tapEl(page, '#list-daily .row:first-child .card');   /* 第一筆完成 */
  await sleep(300);
  await tapEl(page, '#fab');
  await sleep(250);
  await page.$eval('#input-title', i => { i.value = '第三筆'; });
  await tapEl(page, '#sheet-task [data-act="save"]');
  await sleep(300);
  eq('C7 新任務排在未完成的最後', await titles(page, 'daily'), ['第二筆', '第三筆', '第一筆']);

  /* 一般分頁 */
  await tapEl(page, '.tab[data-tab="general"]');
  await sleep(200);
  await addTask(page, 'general', 'g1');
  await addTask(page, 'general', 'g2');
  await tapEl(page, '#list-general .row:first-child .card');
  await sleep(300);
  eq('C6 一般任務原地變完成', await titles(page, 'general'), ['g1', 'g2']);
  eq('C6 樣式為已完成', await page.$eval('#list-general .row:first-child .card',
     c => c.classList.contains('is-done')), true);
  eq('H1 出現清除已完成', await page.$eval('#foot-general', e => e.hidden), false);

  await tapEl(page, '#btn-clear-done');
  await sleep(350);
  eq('H2 只清掉已完成的一般任務', await titles(page, 'general'), ['g2']);
  eq('H2 每日任務不受影響',
     await page.evaluate(() => App.tasksOf('daily').length), 3);
  eq('H1 清完後按鈕消失', await page.$eval('#foot-general', e => e.hidden), true);

  /* J7 分頁記憶 */
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  eq('J7 記住上次分頁', await page.evaluate(() => App.tab), 'general');
  eq('J7 標題正確', await page.$eval('#app-title', e => e.textContent), '一般');
  await ctx.close();
}

/* ================================================================= */
group('A6 換日 / A8 reset_hour');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await addTask(page, 'daily', '每天');
  await tapEl(page, '#list-daily .row:first-child .card');
  await sleep(250);
  eq('已完成', await page.evaluate(() => App.isDone(App.state.tasks[0])), true);
  const before = await page.evaluate(() => App.state.tasks[0].history.slice());

  /* 模擬跨越 reset_hour：換掉 logicalToday，再觸發回前景檢查 */
  await page.evaluate(() => {
    const real = App.logicalToday();
    App.logicalToday = () => App.shiftDate(real, 1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(300);
  eq('A6 跨日後自動變回未完成', await page.$eval('#list-daily .row:first-child .card',
     c => c.classList.contains('is-done')), false);
  eq('A6 歷史未被改寫', await page.evaluate(() => App.state.tasks[0].history), before);
  eq('B3 昨天有完成 → streak 仍顯示 1', await page.$eval('#list-daily .row:first-child .badge',
     s => s.hidden ? null : s.textContent), '1');

  /* A8 改 reset_hour 不動歷史 */
  await page.evaluate(() => {
    App.state.settings.reset_hour = 2; App.save();
  });
  eq('A8 歷史不變', await page.evaluate(() => App.state.tasks[0].history), before);
  await ctx.close();
}

/* ================================================================= */
group('G. 匯入匯出');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await addTask(page, 'daily', '原本的');
  await tapEl(page, '#btn-settings');
  await sleep(300);
  const exported = await page.$eval('#ta-export', t => t.value);
  ok('匯出含任務', exported.includes('原本的'));
  ok('F3/G5 匯出不含 PAT', !/gist_token|ghp_/.test(exported));

  await page.$eval('#ta-import', t => { t.value = '@@@ 亂碼'; });
  await tapEl(page, '#btn-import');
  await sleep(250);
  eq('G1 亂碼被擋', await page.$eval('#toast', t => t.hidden ? '' : t.textContent), '不是合法的 JSON');
  eq('G1 資料未變', await titles(page, 'daily'), ['原本的']);

  await page.$eval('#ta-import', t => { t.value = '{"tasks":"abc"}'; });
  await tapEl(page, '#btn-import');
  await sleep(250);
  ok('G2 格式錯誤被擋', (await page.$eval('#toast', t => t.textContent)).includes('schema_version'));

  await page.$eval('#ta-import', t => { t.value = '{"schema_version":99,"tasks":[]}'; });
  await tapEl(page, '#btn-import');
  await sleep(250);
  ok('G3 版本過新被擋', (await page.$eval('#toast', t => t.textContent)).includes('版本'));
  eq('G3 資料未變', await titles(page, 'daily'), ['原本的']);

  await page.evaluate(() => {
    document.querySelector('#ta-import').value = JSON.stringify({
      schema_version: 1, updated_at: '2030-01-01T00:00:00.000Z',
      settings: { reset_hour: 5 },
      tasks: [{ id: 'i1', type: 'daily', title: '匯入的', order_index: 1000,
                created_at: '2020-01-01T00:00:00.000Z', history: [] }]
    });
  });
  await tapEl(page, '#btn-import');
  await sleep(400);
  eq('G5 匯入後資料被覆蓋', await titles(page, 'daily'), ['匯入的']);
  eq('G5 設定一併覆蓋', await page.evaluate(() => App.state.settings.reset_hour), 5);
  await ctx.close();
}

/* ================================================================= */
group('註釋 / 日程 / 週期（新功能）');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  /* 從面板新增：標題 + 敘述 + 每週 */
  await tapEl(page, '#fab');
  await sleep(250);
  eq('新增面板預設為日常任務',
     await page.$eval('#sheet-task-title', e => e.textContent), '新增日常任務');
  eq('日常任務顯示預定日程', await page.$eval('#group-schedule', e => e.hidden), false);
  eq('預設週期摘要', await page.$eval('#repeat-summary', e => e.textContent), '每日');

  await page.$eval('#input-title', i => { i.value = '倒垃圾'; });
  await page.$eval('#input-note', i => { i.value = '記得先分類'; });
  await tapEl(page, '#seg-repeat button[data-unit="week"]');
  await sleep(80);
  const wk = await page.evaluate(() => ({
    summary: document.querySelector('#repeat-summary').textContent,
    unit: document.querySelector('#interval-unit').textContent
  }));
  ok('切到每週後摘要含星期', /^每週[日一二三四五六]$/.test(wk.summary), wk);
  eq('間隔單位跟著換', wk.unit, '週');

  await tapEl(page, '#sheet-task [data-act="save"]');
  await sleep(350);

  const saved = await page.evaluate(() => {
    const t = App.state.tasks[0];
    return { title: t.title, note: t.note, unit: t.repeat.unit,
             interval: t.repeat.interval, start: t.start_date, today: App.logicalToday() };
  });
  eq('標題與敘述都寫入', [saved.title, saved.note], ['倒垃圾', '記得先分類']);
  eq('週期寫入', [saved.unit, saved.interval], ['week', 1]);
  eq('起始日預設今天', saved.start, saved.today);

  /* 敘述顯示在卡片上，字體比標題小 */
  eq('卡片顯示敘述',
     await page.$eval('#list-daily .card-note', n => n.hidden ? null : n.textContent), '記得先分類');
  ok('敘述字級小於標題', await page.evaluate(() => {
    const t = parseFloat(getComputedStyle(document.querySelector('#list-daily .card-title')).fontSize);
    const n = parseFloat(getComputedStyle(document.querySelector('#list-daily .card-note')).fontSize);
    return n < t;
  }));

  /* 一般模式只顯示今天到期的；編輯模式顯示全部 */
  await addTask(page, 'daily', '下週才開始', { start_date: '2099-01-01' });
  await sleep(150);
  eq('未到期的不出現在一般模式', await titles(page, 'daily'), ['倒垃圾']);
  await tapEl(page, '#btn-edit');
  await sleep(300);
  eq('編輯模式顯示全部', await titles(page, 'daily'), ['倒垃圾', '下週才開始']);
  ok('編輯模式的標籤顯示週期',
     /^每週[日一二三四五六]$/.test(await page.$eval('#list-daily .row:first-child .badge',
       b => b.textContent)));
  await tapEl(page, '#btn-edit');
  await sleep(300);

  /* 改成每週且今天不是到期日 → 從一般模式清單消失 */
  await page.evaluate(() => {
    const t = App.state.tasks.find(x => x.title === '倒垃圾');
    App.updateTask(t.id, { title: t.title, note: t.note, unit: 'week', interval: 1,
                           start_date: App.shiftDate(App.logicalToday(), -3) });
    App.save(); App.render.list('daily', { animate: false });
  });
  await sleep(150);
  eq('非到期日就不出現', await titles(page, 'daily'), []);
  eq('清單空時顯示「今天沒有到期」', await page.$eval('#empty-daily',
     e => e.hidden ? null : e.textContent), '今天沒有到期的日常任務。');

  /* 一般任務不顯示日程 */
  await tapEl(page, '#fab');
  await sleep(250);
  await tapEl(page, '#seg-type button[data-type="general"]');
  await sleep(80);
  eq('切成一般任務就隱藏日程', await page.$eval('#group-schedule', e => e.hidden), true);
  eq('標題跟著換', await page.$eval('#sheet-task-title', e => e.textContent), '新增一般任務');
  await page.$eval('#input-title', i => { i.value = '一般的'; });
  await page.$eval('#input-note', i => { i.value = '也有敘述'; });
  await tapEl(page, '#sheet-task [data-act="save"]');
  await sleep(350);
  eq('一般任務也存得下敘述',
     await page.evaluate(() => App.state.tasks.find(t => t.title === '一般的').note), '也有敘述');
  ok('一般任務沒有週期欄位',
     await page.evaluate(() => App.state.tasks.find(t => t.title === '一般的').repeat === undefined));

  /* 統計：週期與三態格子 */
  await tapEl(page, '.tab[data-tab="stats"]');
  await sleep(250);
  const stats = await page.evaluate(() => ({
    meta: Array.from(document.querySelectorAll('.stat-item')[0].querySelectorAll('.stat-meta span'))
            .map(s => s.textContent),
    note: document.querySelector('.stat-note') ? document.querySelector('.stat-note').textContent : null,
    cells: document.querySelectorAll('.stat-item:first-child .cell').length,
    done: document.querySelectorAll('.stat-item:first-child .cell.is-done').length,
    missed: document.querySelectorAll('.stat-item:first-child .cell.is-missed').length
  }));
  ok('統計顯示週期', /^每週[日一二三四五六]$/.test(stats.meta[0]), stats.meta);
  ok('連續單位為「期」', stats.meta[1].indexOf('期') > 0, stats.meta);
  eq('統計顯示敘述', stats.note, '記得先分類');
  eq('30 格', stats.cells, 30);
  ok('到期未完成有標出來', stats.missed > 0 && stats.missed < 30, stats);
  await ctx.close();
}

/* ================================================================= */
group('E. 離線與 Service Worker');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  ok('SW 註冊成功', await page.evaluate(() => !!navigator.serviceWorker.controller ||
     navigator.serviceWorker.getRegistration().then(r => !!r)));
  await addTask(page, 'daily', '離線也要在');
  await sleep(200);

  await page.reload({ waitUntil: 'load' });
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  eq('E3 離線可啟動並顯示資料', await titles(page, 'daily'), ['離線也要在']);
  eq('E4 離線可新增', await (async () => {
    await addTask(page, 'daily', '離線新增');
    return titles(page, 'daily');
  })(), ['離線也要在', '離線新增']);
  await page.setOfflineMode(false);
  await ctx.close();
}

/* ================================================================= */
group('F7 / F8 PAT 錯誤處理');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await addTask(page, 'daily', '本機資料');
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (!r.url().includes('api.github.com')) { r.continue(); return; }
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,accept,content-type,x-github-api-version'
    };
    if (r.method() === 'OPTIONS') { r.respond({ status: 204, headers: cors }); return; }
    r.respond({ status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Bad credentials' }) });
  });
  await tapEl(page, '#btn-settings');
  await sleep(250);
  await page.$eval('#input-pat', i => { i.value = 'ghp_invalid'; });
  await tapEl(page, '#btn-pat-save');
  await sleep(600);
  ok('F7 顯示明確錯誤', (await page.$eval('#sync-detail', e => e.textContent)).includes('PAT'));
  eq('F7 狀態為同步失敗', await page.$eval('#sync-status', e => e.textContent), '同步失敗');
  eq('F7 本機資料不受影響', await titles(page, 'daily'), ['本機資料']);
  await tapEl(page, '#btn-pat-clear');
  await sleep(250);
  eq('F8 移除後顯示未設定備份', await page.$eval('#sync-status', e => e.textContent), '未設定備份');
  eq('F8 App 仍可用', await titles(page, 'daily'), ['本機資料']);
  await ctx.close();
}

/* ================================================================= */
group('I. 版面與 tokens');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'load' });
  await addTask(page, 'daily', '版面測試');
  const layout = await page.evaluate(() => {
    const tab = document.querySelector('.tab-bar').getBoundingClientRect();
    const fab = document.querySelector('#fab').getBoundingClientRect();
    return { tabBottom: tab.bottom, fabBottom: fab.bottom, tabTop: tab.top,
             h: window.innerHeight, fabOverTab: fab.bottom <= tab.top + 1 };
  });
  eq('I1 Tab bar 貼齊底部', Math.round(layout.tabBottom), layout.h);
  ok('I1 FAB 不壓在 Tab 上', layout.fabOverTab, layout);
  eq('I3 內容區可捲動', await page.$eval('#view-daily',
     v => getComputedStyle(v).overflowY), 'auto');
  eq('全局背景為純黑', await page.$eval('body', b => getComputedStyle(b).backgroundColor),
     'rgb(0, 0, 0)');
  eq('卡片為高對比深色，無透明度', await page.$eval('#list-daily .card',
     c => getComputedStyle(c).backgroundColor), 'rgb(28, 28, 30)');
  eq('無半透明遮罩：sheet 背景為實色純黑',
     await page.$eval('#sheet-task', s => getComputedStyle(s).backgroundColor), 'rgb(0, 0, 0)');
  eq('模態主色塊為純色深紫', await page.$eval('.sheet-hero',
     h => getComputedStyle(h).backgroundColor), 'rgb(94, 53, 177)');
  eq('膠囊輸入框為強調紫底黑字', await page.$eval('#input-title', i => {
    const cs = getComputedStyle(i);
    return [cs.backgroundColor, cs.color, cs.borderTopWidth];
  }), ['rgb(158, 123, 255)', 'rgb(0, 0, 0)', '0px']);
  ok('I6 卡片無模糊陰影', await page.$eval('#list-daily .card',
     c => getComputedStyle(c).boxShadow === 'none'));
  eq('全介面無任何邊框', await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      ['Top', 'Right', 'Bottom', 'Left'].forEach(side => {
        if (parseFloat(cs['border' + side + 'Width']) > 0 &&
            cs['border' + side + 'Style'] !== 'none') bad.push(el.className || el.tagName);
      });
    });
    return bad.slice(0, 5);
  }), []);
  ok('無 rgba 透明色出現在實際樣式上', await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return els.every(el => {
      const cs = getComputedStyle(el);
      return !/rgba\((?!0, 0, 0, 0\))/.test(cs.backgroundColor + cs.color);
    });
  }));
  ok('I5 tokens 有定義主要變數', await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return ['--c-bg', '--c-modal', '--c-surface', '--c-accent', '--c-ink-2',
            '--r-lg', '--r-md', '--r-pill', '--dur-mid', '--swipe-action-w']
      .every(k => cs.getPropertyValue(k).trim() !== '');
  }));
  await ctx.close();
}

const realErrors = errors.filter(e => !/api\.github\.com|net::ERR_FAILED|Failed to load resource/.test(e));
/* ================================================================= */
group('I2 鍵盤與可視區域');
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await addTask(page, 'daily', '改名測試');

  eq('文件層不可捲動（iOS 才不會把畫面推走）', await page.evaluate(() => {
    const el = document.scrollingElement;
    return el.scrollHeight <= el.clientHeight && getComputedStyle(document.body).position === 'fixed';
  }), true);

  const geo = () => page.$eval('#sheet-task', s => {
    const r = s.getBoundingClientRect();
    return { transform: getComputedStyle(s).transform, top: Math.round(r.top), h: Math.round(r.height) };
  });
  const kbVar = () => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--kb-h').trim());
  const padBottom = () => page.$eval('.sheet-body',
    b => Math.round(parseFloat(getComputedStyle(b).paddingBottom)));

  /* 開啟 + focus 之後，sheet 幾何必須一動也不動（動了就會露出背後清單 → 看起來在晃） */
  await tapEl(page, '#fab');
  await sleep(30);
  eq('開啟第一帧就在最終位置、無位移動畫、滿高',
     await geo(), { transform: 'none', top: 0, h: 852 });
  ok('focus 當下就先開好鍵盤留白（不等鍵盤動畫）',
     parseFloat(await kbVar()) > 300, await kbVar());
  ok('留白吃在內容區，不動 sheet 幾何', (await padBottom()) > 300, await padBottom());

  const inputBox = await page.$eval('#input-title', i => {
    const r = i.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
  ok('輸入框緊貼標題列下方，遠離鍵盤（iOS 沒有捲動的理由）',
     inputBox.top > 0 && inputBox.bottom < 300, inputBox);

  /* 鍵盤動畫期間：任何 viewport 事件都不得改變畫面 */
  await page.evaluate(() => {
    window.visualViewport.dispatchEvent(new Event('scroll'));
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await sleep(80);
  eq('動畫期間 sheet 幾何不變', await geo(), { transform: 'none', top: 0, h: 852 });
  ok('動畫期間留白不變', parseFloat(await kbVar()) > 300, await kbVar());

  await sleep(500);
  eq('鎖定到期後量測真值（headless 無鍵盤 → 0）', await kbVar(), '0px');
  eq('全程 sheet 幾何未變', await geo(), { transform: 'none', top: 0, h: 852 });

  /* 第二次起用實測鍵盤高度，預測即實測 */
  await tapEl(page, '#sheet-task [data-act="cancel"]');
  await sleep(300);
  await page.evaluate(() => localStorage.setItem('kb_height', '336'));
  await tapEl(page, '#fab');
  await sleep(30);
  eq('用實測鍵盤高度開留白', await kbVar(), '336px');
  eq('sheet 幾何仍然不變', await geo(), { transform: 'none', top: 0, h: 852 });
  eq('sheet 內容區可捲動', await page.$eval('.sheet-body',
     b => getComputedStyle(b).overflowY), 'auto');
  await sleep(500);

  /* 保險：極少數情況 iOS 仍搬動可視區域時的補償 */
  await page.evaluate(() => document.documentElement.style.setProperty('--vv-top', '40px'));
  await sleep(50);
  eq('iOS 若仍搬動可視區域，sheet 會補償回來',
     await page.$eval('#sheet-task', s => Math.round(s.getBoundingClientRect().top)), 40);
  await ctx.close();
}

console.log('\nconsole errors: ' + (realErrors.length ? JSON.stringify(realErrors, null, 1) : 'none'));
ok('無 console 錯誤', realErrors.length === 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail ? 1 : 0);
