# 極簡待辦（daily-tick）

單人使用的重複待辦 PWA。零框架、零建置步驟，直接放上 GitHub Pages，從 iPhone 主畫面以 standalone 開啟。

- 主資料：IndexedDB（單筆 record，key = `app`）
- 首屏同步渲染：localStorage `mirror`
- 備份：GitHub private gist（`todo-backup.json`），debounce 3 秒自動上傳
- 離線：Service Worker cache-first，開啟不等網路

## 部署

專案假設 Pages 路徑為 `https://zewei1222.github.io/daily-tick/`，所有路徑都寫死 `/daily-tick/` 前綴
（`manifest.json` 的 `start_url` / `scope`、SW 的註冊路徑與 scope、`index.html` 的資源連結）。

1. 把整個 repo 推到 `zewei1222/daily-tick` 的預設分支
2. Settings → Pages → Source 選該分支、資料夾 `/ (root)`
3. 用 Safari 開 `https://zewei1222.github.io/daily-tick/` → 分享 → 加入主畫面

**換 repo 名稱或帳號時**，要一起改：`index.html`（5 處連結）、`manifest.json`（`start_url`、`scope`）、
`js/main.js` 的 `BASE`、`sw.js` 的 `BASE`。前綴不一致會導致 scope 不符、加入主畫面後離線啟動失敗。

改完 code 推上去後，從主畫面開啟會先看到舊版（cache-first），SW 在背景比對到內容有變就會出現
「有新版本」提示條，點一下重新載入即為新版；不需要刪掉主畫面圖示重加。要強制更新可以改 `sw.js`
的 `CACHE_VERSION`。

## 備份設定

設定頁（右上齒輪）貼上 GitHub PAT，scope 只需要 `gist`。

- 第一次儲存會自動建立一個 private gist 並記住 `gist_id`
- 清掉瀏覽器資料後，重新填同一個 PAT 會自動用檔名 `todo-backup.json` 找回舊 gist 並拉回資料
- gist 與匯出的 JSON **都不含 PAT**；token 只存在這台裝置的 localStorage
- 沒設定 PAT 時 App 完全正常離線運作，狀態顯示「未設定備份」

同步方向的判斷（`js/sync.js` 的 `syncDecision`）：

| 情況 | 動作 |
|---|---|
| 遠端沒有備份 | 上傳 |
| **本機 0 筆、遠端有資料** | **一律拉回，永不上傳**（防止空資料覆蓋備份） |
| 遠端 `updated_at` 較新 | 拉回 |
| 本機 `updated_at` 較新 | 上傳 |
| 相同 | 不動作 |

## 開機圖（避免冷啟動白閃）

目前只放了 iPhone 15 Pro（393×852 @3x → 1179×2556）。換機或多裝置時：

```bash
# 1. 在 tools_gen_assets.py 的 __main__ 加一行，例如 iPhone SE 3：
#    splash(750, 1334, 200).save("splash/splash-750x1334.png")
python3 tools_gen_assets.py
# 2. 在 index.html 依該機型的 CSS 尺寸與 DPR 加一行 link
```

`icons/` 與 `splash/` 都由 `tools_gen_assets.py` 產生（需要 Pillow），圖形跟 App 的黑白高對比風格一致。

## 檔案結構

```
index.html            單頁；script 放在 body 尾端且不加 defer，確保首屏在解析完就畫好
manifest.json         PWA manifest
sw.js                 Service Worker：cache-first + 背景比對更新
css/tokens.css        唯一的視覺數值來源（色彩／邊框／圓角／間距／字級／動畫時間）
css/app.css           版面與元件，只引用 tokens 變數
js/util.js            日期（邏輯日期、shiftDate）、DOM、token 讀取
js/store.js           IndexedDB + mirror + ui_state、資料正規化與匯入驗證
js/model.js           勾選、連續天數、排序、order_index（無 DOM）
js/sync.js            gist 備份、同步方向決策
js/render.js          差異更新渲染 + FLIP 動畫 + 統計
js/gestures.js        點擊與左滑刪除（Pointer Events，1:1 跟手）
js/main.js            啟動三階段、事件接線、Sheet、Service Worker 註冊
vendor/sortable.min.js  Sortable 1.15.6（進編輯模式才動態載入）
tools_gen_assets.py   產生 icons/ 與 splash/
test/                 測試（開發用）
```

## 資料結構

```json
{
  "schema_version": 1,
  "updated_at": "2026-08-18T14:03:22.000Z",
  "settings": { "reset_hour": 4 },
  "tasks": [
    { "id": "uuid", "type": "daily",   "title": "喝水", "order_index": 1000,
      "created_at": "...", "history": ["2026-08-16", "2026-08-17"] },
    { "id": "uuid", "type": "general", "title": "繳費", "order_index": 1000,
      "created_at": "...", "completed_at": null }
  ]
}
```

「今天」一律用本地時間算，並往前推 `reset_hour` 小時（預設 4）。沒有任何重置流程：日期一過，
`logicalToday()` 回傳新值，每日任務自動變回未完成，`history` 永不裁切。改 `reset_hour` 不會動到既有紀錄。

## 測試

```bash
node test/logic.test.js          # 純邏輯：日期、連續天數、排序、匯入驗證、同步決策（52 項）

python3 test/serve.py            # 另開一個終端，掛在 /daily-tick/ 路徑
cd test && npm i                 # 只裝 puppeteer-core，用系統的 google-chrome
node ui.test.mjs                 # 瀏覽器行為：手勢、編輯模式、離線、匯入匯出、版面（80 項）
node sync.test.mjs               # 用假的 GitHub API 驗證備份流程 F1–F6、E5（26 項）
```

UI 測試預設 `executablePath: '/usr/bin/google-chrome'`，換環境時改掉即可。

## 與規格的取捨

- **Sortable.js 改為本地檔案 + 延遲載入**（規格寫 CDN）：CDN 會讓離線時無法排序，且弱網下第一次進
  編輯模式要等。現在放在 `vendor/`，進 SW 快取，首屏完全不載入它。
- **Modal 採全螢幕 sheet**：規格禁止半透明遮罩，所以不做浮層 + 遮罩，改成不透明整頁滑上來，
  順便讓輸入框固定在上方，鍵盤不會蓋住（另外仍用 `visualViewport` 把 `--kb-h` 餵給 sheet）。
- **新增任務的 sheet 多了「每日／一般」切換**：預設為當前分頁，避免站在一般分頁只能新增每日任務。
- **編輯模式點勾選框完全無反應**（不開 Modal，也不切換完成）；點卡片其他區域才開編輯 Modal。
- **回到前景會強制退出編輯模式**，符合「編輯模式狀態不記憶」。
- **SW 不用 `skipWaiting()`**：新內容在 fetch 階段比對後寫回同一份快取，避免使用中頁面的資源錯亂。
- Toast 是 `pointer-events: none`，不會吃掉底下按鈕的點擊。

## 平台限制（不實作，避免白費工）

iOS Safari / 加入主畫面的已知限制：

- 沒有觸覺回饋（不支援 Vibration API），改用 `:active` 視覺回饋
- 沒有推播提醒：Web Push 需要自架推送伺服器，與「單人、零成本」衝突，本專案不做時間提醒
- 沒有系統整合：無小工具、無 Spotlight、無分享選單接入
- 冷啟動不可避免，只能用 mirror 首屏 + 開機圖 + SW 快取把它壓到最短
