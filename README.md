# 極簡待辦（daily-tick）

單人使用的重複待辦 PWA ＋ 放置遊戲層。零框架、零建置步驟，直接放上 GitHub Pages，
從 iPhone 主畫面以 standalone 開啟。

兩種任務：**日常**（依週期重複，每日／每週／每月／每年，記連續期數）與**一般**（做完就結束）。
兩者都可以加一行敘述與 1–5 的難度。**完成任務產生寶石 → 抽卡集裝備 → 自動闖關 → 戰鬥資源
強化裝備**，形成把待辦當成遊戲燃料的核心迴圈（`GAME_SPEC_v1.md`）。

四個分頁：對戰／招募／背包／任務（統計在齒輪選單內）。App 永遠啟動在「任務」——
工具不被遊戲劫持。介面分五層（GAME_FEEL_SPEC §1）：L0 分頁場景、L1 常駐 HUD、
L2 全螢幕事件（戰鬥／抽卡結果，硬切、HUD 完全被接管、只能明確返回）、
L3 模態面板（底部升起 160ms＋85% 遮罩——全 App 唯一允許的透明度）、L4 瞬時回饋。
每個分頁只有一個視覺主體：對戰＝戰鬥舞台（待領改為資源列角標→L4 彈窗）、
招募＝祭壇、背包＝清單（操作在 L3）、任務＝清單。

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

改完 code 推上去後，從主畫面開啟會先看到舊版（cache-first）。App 用兩條路偵測新版：
Service Worker 在背景比對快取內容，另外每次啟動與回到前景時會用 `?live=1`（SW 不攔）直接抓線上
`index.html` 比對 `<meta name="app-version">`。任一條發現不同就顯示「有新版本」提示條；點「重新載入」
會先讓 SW 把 app shell 全部換成新版再 reload，拿到的一定是一致的新版本。

**發版守則：每次改動都要把 `index.html` 的 `app-version` 與 `sw.js` 的 `CACHE_VERSION` 一起 +1**
（兩者必須同號，測試會檢查）。忘了改版本號，使用者就不會收到更新提示。

設定頁最下方會顯示目前執行中的版本號，用來確認裝置上跑的是哪一版。

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

`icons/` 與 `splash/` 都由 `tools_gen_assets.py` 產生（需要 Pillow）。**開機圖必須是純黑底**
（與 App 啟動後的背景同色），否則冷啟動會閃一下白色。

## 檔案結構

```
index.html            單頁；script 放在 body 尾端且不加 defer，確保首屏在解析完就畫好
manifest.json         PWA manifest
sw.js                 Service Worker：cache-first + 背景比對更新
css/tokens.css        唯一的視覺數值來源（色彩／圓角／間距／字級／動畫時間）
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
  "schema_version": 2,
  "updated_at": "2026-08-18T14:03:22.000Z",
  "settings": { "reset_hour": 4 },
  "tasks": [
    { "id": "uuid", "type": "daily", "title": "倒垃圾", "note": "可回收與廚餘分開",
      "start_date": "2026-08-18", "repeat": { "unit": "week", "interval": 1 },
      "order_index": 1000, "created_at": "...", "deleted_at": null,
      "history": ["2026-08-18"] },
    { "id": "uuid", "type": "general", "title": "繳費", "note": "",
      "order_index": 1000, "created_at": "...", "deleted_at": null,
      "completed_at": null }
  ]
}
```

`unit` 為 `day` / `week` / `month` / `year`，`interval` 是「每 N 個單位」。

「今天」一律用本地時間算，並往前推 `reset_hour` 小時（預設 4）。沒有任何重置流程：日期一過，
`logicalToday()` 回傳新值，本期未完成的日常任務自動變回未勾，`history` 永不裁切。
改 `reset_hour` 不會動到既有紀錄。

### 週期規則

到期日一律從 `start_date` 起算，`history` 記的是**到期日**而不是字面上的今天：

| 情況 | 行為 |
|---|---|
| 每週 | 與起始日同一個星期幾；每 N 週就是每 N×7 天 |
| 每月 31 日遇到 2 月 | 夾到當月最後一天（2/28、閏年 2/29），下個月回到 31 日 |
| 每年 2/29 | 非閏年落在 2/28，閏年回到 2/29 |
| 起始日之前 | 一律不到期 |

- **一般模式的日常分頁只顯示「今天到期」的任務**；編輯模式顯示全部（含未到期），方便管理與排序
- 連續數在每日（間隔 1）時稱「天」，其他週期稱「期」。本期未完成但上一期有完成時，仍顯示上一期的連續數，不會一早就歸零
- 統計的 30 天格子有三種狀態：亮紫＝完成、深灰＝到期未完成、純黑＝非到期日

### 軟刪除

刪除任務**不會**移除資料，只把 `deleted_at` 從 `null` 設成刪除時間。`history`（連續天數與
未來統計的唯一資料來源）因此永遠不會被丟掉。

- **所有清單讀取只能經由 `A.activeTasks(type)`**（`js/model.js`），它是唯一會過濾 `deleted_at`
  的地方。呼叫端不得自己寫 `filter(t => !t.deleted_at)`，也不得直接遍歷 `A.state.tasks`
- 左滑刪除與「清除已完成」都只是設 `deleted_at`，不動 `history`、`completed_at`、`order_index`
- 設定頁的「已刪除的任務」可以**還原**（`deleted_at = null`，並排到該類型最後）或
  **永久刪除**（唯一真的從陣列移除物件的路徑，需 confirm 且訊息會講明會失去幾次紀錄）
- 沒有「全部清空」、沒有數量徽章、沒有自動清理期限 —— 刻意不做成「回收桶」，
  因為回收桶會誘導人去清空，而清空就是永久丟掉統計資料
- **匯出、`mirror`、gist 備份都包含已刪除的任務**，換裝置還原後它們仍是已刪除狀態

兩個刻意的例外（讀 `tasks` 但不經過 `activeTasks()`）：

| 位置 | 原因 |
|---|---|
| `syncDecision()` 的「本機 0 筆」硬規則 | 必須算**全部**筆數。若只算未刪除者，把所有任務都刪掉的裝置會被判定為「空白」而從遠端拉回，刪除就被還原了 |
| 正規化與序列化（`normalizeState` / `writeMirror` / gist payload / 匯出） | 定義上就要看到完整陣列 |

`findTask(id)` 也看得到已刪除的任務 —— 還原與永久刪除都得靠它命中，但它只以 id 查詢，
不會讓已刪除的任務出現在任何清單裡。

### 版本遷移

v1（只有標題）的資料可以直接讀入與匯入，會自動補上：`note` 為空字串、`repeat` 為每日、
`start_date` 取**最早的歷史紀錄**（沒有歷史才退回 `created_at` 當天），這樣既有的連續紀錄不會斷掉。

改版前的備份沒有 `deleted_at`，讀入時一律視為未刪除，不會報錯（`schema_version` 不需要因此變動，
此欄位向下相容）。

## 遊戲層（GAME_SPEC_v1.md）

| 主題 | 落點 |
|---|---|
| 內容資料檔 | `data/*.json`（標籤/實體類型/角色/裝備/寵物/怪物模板）——與程式碼分離、可直接手動編輯、不含玩家狀態；`js/game/content.js` 是載入器＋平衡常數＋卡池定義。新增道具＝改 JSON＋（如需新標籤行為）在 `battle.js` 的 `TAG_HANDLERS` 加 handler |
| 貨幣事件 | `js/game/economy.js` —— 完成任務寫入不可變事件（含任務快照與當時難度），取消是沖銷（voided）不刪除；餘額＝未沖銷加總−消費。事後改難度/刪任務都不影響既有事件 |
| 抽卡 | `js/game/gacha.js` —— 機率 70/25/4.5/0.5；階層保底（35 抽 rare+、200 抽 mythic，rare+ 重置 rare 計數器、mythic 重置兩者）；重複抽中推高該項目自己的等級上限（base 10 + 每次重複 +5）；限定池機制完整實作（保底＝該項目、抽中即退役併入通用池），v1 無現役限定池 |
| 成長 | 全遊戲唯一成長率 `GROWTH = 1.12`：強化成本、裝備/怪物數值、掉落全部同底數，任何階段的相對強度比例恆定 |
| 戰鬥 | `js/game/battle.js` —— 回合制、速度 carry 出手制（比 1.5 → 出手 1,2,1,2）、單回合出手上限 10、100 回合強制判敗；先完整模擬再回放，可跳過；怪物由公式生成＋詞綴以**層數為種子**隨機抽 1–2 個（同層固定 → 對戰畫面的預覽與實戰一致，可針對性換裝） |
| 闖關 | `js/game/farm.js` —— 通關自動進下一層；自動刷關每 20 秒一場，離線回來一次補算；待領池上限 30 場掉落，滿了停止累積；打輸免費重試不扣資源（自動模式打輸退回刷已通過層，避免空轉——規格未明定，此為取捨） |
| 備份 | 同一個 gist 的第二個檔案 `game-backup.json`，同一個 PAT。只在里程碑事件（抽卡/強化/領取/裝備變更/最高層數推進）後 debounce 10 秒上傳；戰鬥過程與待領池累積不打 API。硬規則：本機遊戲全新而遠端有進度 → 一律拉回 |
| 儲存 | 同一個 IndexedDB 新開 `game_data` store（DB v2）＋ `game_mirror` 供首屏同步渲染資源列。todo 資料與遊戲資料互不讀寫，唯一接點是完成事件 |

v1 抽卡池決策：完整目錄（1 角色＋1 寵物＋10 特殊裝備＋8 普通裝備）全進通用池；
初始贈送掃地僧／木劍／石頭龜。金幣與素材依規格 §7-1 暫保留為兩種資源。

## 測試

```bash
node test/logic.test.js          # todo 邏輯：日期、週期、連續期數、排序、軟刪除、遷移（142 項）
node test/game.test.js           # 遊戲邏輯：貨幣事件、抽卡保底、戰鬥公式、闖關、備份決策（93 項）

python3 test/serve.py            # 另開一個終端，掛在 /daily-tick/ 路徑
cd test && npm i                 # 只裝 puppeteer-core，用系統的 google-chrome
node ui.test.mjs                 # 瀏覽器行為：手勢、編輯、軟刪除、難度、抽卡、背包、對戰、鍵盤、版面（221 項）
node sync.test.mjs               # 假 GitHub API：備份 F1–F6、E5、軟刪除同步、遊戲第二檔案（41 項）
```

UI 測試預設 `executablePath: '/usr/bin/google-chrome'`，換環境時改掉即可。

## 視覺規範（VISUAL_SPEC.md）

低飽和藍紫像素風。三段高度基底（`#0B0A12` / `#16141F` / `#221E2E`），2px 實線框、
4px 實色偏移陰影、直角（任務卡片 4px 是唯一圓角例外）。金色 `#FFC24B` 嚴格限定
寶石數字與抽卡按鈕兩處。稀有度四色只用於稀有度。

- **字體**：內文 Cubic 11（開源 zh-TW 點陣字，本地檔案）；所有數字用 Silkscreen。
  字級只有 10/12/14/18/28 五階
- **像素美術**：全部遊戲圖示與立繪由 `tools_gen_sprites.py` 以 ASCII pixel map 產生
  （38 張：20 道具、4 戰鬥立繪、5 標籤、3 資源、6 欄位圖示），禁止 emoji；
  顯示尺寸一律為邏輯格的整數倍、最近鄰縮放
- **稀有度框**：全 App 簽名元素——2px 稀有度色框＋左上角三角＋實色陰影；
  mythic 額外 1px 白色外線；未擁有灰階但角標保留稀有度色；裝備中右上實心方點
- **按鈕三層級**：金填色（僅抽卡，每畫面至多一個）／亮紫框（主要操作）／無框暗字（次要）
- 這些規則有測試把關（V1–V10：emoji 掃描、圓角稽核、漸層/blur 稽核、數字字體、金色用途）

備註：sprite 邏輯格為道具 16×16、立繪 32×32（規格表寫 32/64——手工 ASCII 授權下的
密度取捨，整數縮放與最近鄰規則完全遵守）。

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
- **鍵盤期間 sheet 的幾何完全不變**：iOS 的 `visualViewport` 通報永遠慢一拍，跟著事件改高度會在
  鍵盤滑上來的過程中晃動，而且只要 sheet 變矮就會露出背後的清單。改為只把鍵盤高度餵給內容區的
  底部留白 `--kb-h`，並在 focus 當下就先用記住的鍵盤高度開好留白。
- **不做子清單與難度**：難度在沒有經驗值系統時是沒有行為的欄位，子清單會讓卡片、手勢、統計都要
  重新設計。要加的時候升 `schema_version` 即可。

## 平台限制（不實作，避免白費工）

iOS Safari / 加入主畫面的已知限制：

- 沒有觸覺回饋（不支援 Vibration API），改用 `:active` 視覺回饋
- 沒有推播提醒：Web Push 需要自架推送伺服器，與「單人、零成本」衝突，本專案不做時間提醒
- 沒有系統整合：無小工具、無 Spotlight、無分享選單接入
- 冷啟動不可避免，只能用 mirror 首屏 + 開機圖 + SW 快取把它壓到最短
