# 分鏡與旁白寫作指引

用於 `/video-storyboard`：根據 `brief/product-brief.md`（與可選的 `brief/style.json`）規劃 scene，產生每個 scene 的 `scene.json` 與 `script.md`。

---

## 1. <a id="structure"></a>規劃結構

### 依長度決定 scene 數

| 目標長度 | scene 數 | 建議結構 |
|---|---|---|
| ≤ 30 秒 | 3–4 | hook → solution → cta（可加一個 feature） |
| 31–60 秒 | 4–6 | hook → problem → solution → feature ×1–2 → cta |
| 61–90 秒 | 6–8 | hook → problem → solution → how-it-works → feature ×2 → benefit / social-proof → cta |

- 單一 scene 建議 4–12 秒；超過 12 秒就拆成兩個。
- 第一個 scene 必須是 `hook`，最後一個必須是 `cta`。
- `social-proof` 只在 brief 的「可信證據」有內容時使用。
- 有 `brief/style.json` 時，依 `pacing` 調整：`fast` 偏向較多、較短的 scene；`slow` 偏向較少、較長的 scene。

### 各 purpose 的寫法

| purpose | 目的 | 旁白要點 | 建議 visual.type |
|---|---|---|---|
| `hook` | 3 秒內抓住注意力 | 一個提問、反差或驚人的結果；不要先自我介紹 | `motion-graphic`、`web-capture`（最吸睛的畫面） |
| `problem` | 讓受眾覺得「這就是我」 | 具體情境，而非抽象描述 | `motion-graphic`、`screenshot` |
| `solution` | 介紹產品 | 產品名稱 + 一句話定位 | `web-capture`（首頁或主畫面） |
| `feature` | 展示一個功能 | 一個 scene 只講一個功能，講好處而非規格 | `web-capture`、`code` |
| `how-it-works` | 降低上手門檻 | 步驟化：「只要三步…」 | `web-capture`（操作流程）、`code` |
| `benefit` | 使用後的改變 | 量化或具體的結果 | `motion-graphic` |
| `social-proof` | 建立信任 | 只用 brief 中有出處的證據 | `screenshot`、`motion-graphic` |
| `cta` | 告訴觀眾下一步 | 一個明確動作 + 網址 | `motion-graphic`（logo + 網址） |
| `custom` | 以上都不適用 | — | 任意 |

### 範例（45 秒、zh-TW、開發者工具）

| # | purpose | 旁白 | 畫面 |
|---|---|---|---|
| 1 | hook | 部署一個網站，還要花你半天嗎？ | 時鐘快轉 + 終端機報錯畫面 |
| 2 | problem | 設定伺服器、申請憑證、串接 CI，每一步都可能卡關。 | 三張卡片依序出現並打叉 |
| 3 | solution | ShipIt 讓你推送程式碼，網站就上線。 | 產品首頁首屏 |
| 4 | feature | 每個分支自動產生預覽網址，直接貼給同事看。 | 錄製 PR 頁面出現預覽連結 |
| 5 | how-it-works | 只要連結 GitHub、選擇專案、按下部署。 | 錄製三步操作並高亮按鈕 |
| 6 | cta | 現在就到 example.com 免費開始。 | Logo + 網址置中 |

---

## 2. <a id="narration"></a>寫旁白（`script.md`）

### 語速與長度

| 語言 | 語速 | 5 秒約可說 |
|---|---|---|
| 中文 | 約 4 字／秒 | 20 字 |
| 英文 | 約 2.5 詞／秒（150 wpm） | 12 詞 |
| 日文 | 約 6 假名／秒 | 30 假名 |

- 所有 scene 旁白總時長應在 `project.format.targetDurationSec` 的 ±10% 內；每個 scene 另預留約 0.5 秒緩衝。
- 超出時**刪減內容**，不要靠加快語速（`narration.speed` 保持 1.0，除非使用者要求）。

### 寫作規則

1. **口語**：寫給耳朵聽，不是給眼睛看。避免括號、縮寫、符號（「&」「/」「→」）。
2. **短句**：中文每句 ≤ 20 字、英文 ≤ 15 詞。字幕每行上限中文 16 字、英文 42 字元，短句能自然斷行。
3. **一個 scene 一個重點**。
4. **講好處，不講規格**：「匯出只要一秒」勝過「採用多執行緒匯出引擎」。
5. **具體**：數字、情境、動作。避免「強大」「革命性」「無縫」這類空泛形容詞。
6. **符合受眾**：依 brief 的目標受眾決定術語深度。
7. **不捏造**：數據、客戶名稱、評價、獎項只能用 brief「可信證據」中的內容。不寫無法驗證的比較（「業界最快」）。
8. **數字與英文**：中文旁白中的數字寫成念法清楚的形式（「3 倍」而非「3x」）；產品名、技術名詞保留原文，TTS 念錯時再改寫成念法（例如在旁白中寫「G-P-T」）。

### 格式

```markdown
部署一個網站，還要花你半天嗎？
<!-- pause 0.5 -->
設定伺服器、申請憑證、串接 CI，每一步都可能卡關。
```

- 一行一句，空行會被忽略。
- `<!-- pause 秒數 -->` 插入停頓，用於轉折或讓畫面喘息；每個 scene 最多一兩個。
- 不寫畫面說明、講者標記或任何非旁白文字。
- 沒有旁白的 scene（例如純 logo 動畫）：`script.md` 留空，並在 `scene.json` 設定 `durationSec`。

---

## 3. <a id="visual"></a>設計畫面（`scene.json` 的 `visual`）

- **`description`**：用一兩句話描述觀眾會看到什麼，讓使用者在分鏡審閱時能想像畫面。
- **優先用真實產品畫面**：`web-capture` / `screenshot` 比抽象動畫更有說服力。從 brief 的「可用畫面」挑選。
- **`capture.actions`**：
  - 保持簡短（≤ 6 個動作），每個操作後加 `wait` 讓觀眾看清楚（300–800 ms）。
  - 優先使用穩定的 selector（`id`、`data-*`、有語意的 class），避免 `div:nth-child(7)`。
  - `type` 只輸入示範用的假資料，絕不輸入真實帳密或個資。
- **`elements`（疊加元素）**：
  - 畫面文字 ≤ 12 個中文字或 6 個英文詞；**不要把旁白原文搬上畫面**（字幕已經有了），而是提煉關鍵字。
  - `at` 對齊旁白中提到該關鍵字的時間點（依語速估算）。
  - 品牌 logo 用 `@/assets/brand/…`。
- **`transitionIn`**：預設 `none`（直接切換）；同一段落內的 scene 之間可用 `fade`。全片不超過兩種轉場。
- **`durationSec`**：一般保持 `null`（由旁白決定）；只有無旁白或需要與音樂對拍時才指定。

### 最小的 draft scene.json

```json
{
  "$schema": "../../schemas/scene.schema.json",
  "id": "scene-004",
  "title": "分支預覽",
  "purpose": "feature",
  "narration": { "scriptFile": "script.md" },
  "visual": {
    "type": "web-capture",
    "description": "PR 頁面出現預覽網址，點擊後開啟預覽站",
    "capture": {
      "url": "https://example.com/demo/pull/42",
      "actions": [
        { "do": "wait", "ms": 500 },
        { "do": "highlight", "selector": "[data-testid=preview-link]" },
        { "do": "wait", "ms": 800 },
        { "do": "click", "selector": "[data-testid=preview-link]" },
        { "do": "wait", "ms": 1200 }
      ]
    },
    "elements": [
      { "type": "text", "content": "每個分支自動預覽", "at": 0.5, "position": "top" }
    ]
  },
  "durationSec": null,
  "status": "draft",
  "locked": false
}
```

---

## 4. 建立檔案

1. scene id 依建立順序編號：`scene-001`、`scene-002`…；目錄為 `scenes/{三位數}-{purpose 或簡短英文 slug}/`，例如 `scenes/004-branch-preview/`。
2. 每個 scene 寫入 `scene.json` 與 `script.md`（新建檔案可直接寫入）。
3. 以 `npm run state -- project --patch-file <檔案>` 把 scene 依播放順序加入 `video.project.json` 的 `scenes`：

   ```json
   [
     { "op": "add", "path": "/scenes/-", "value": { "id": "scene-001", "dir": "scenes/001-hook" } },
     { "op": "add", "path": "/scenes/-", "value": { "id": "scene-002", "dir": "scenes/002-problem" } }
   ]
   ```

4. 執行 `npm run validate`，並將 project 狀態設為 `script_generated`。

---

## 5. <a id="review"></a>分鏡審閱（checkpoint）

完成後**必須停下**，以表格呈現給使用者：

```text
目標 45 秒｜預估 43.5 秒｜6 個 scene

| # | scene     | 用途         | 旁白                                   | 畫面                         | 秒數 |
|---|-----------|--------------|----------------------------------------|------------------------------|------|
| 1 | scene-001 | hook         | 部署一個網站，還要花你半天嗎？           | 時鐘快轉 + 終端機報錯        | 4.0  |
| 2 | scene-002 | problem      | 設定伺服器、申請憑證、串接 CI，…        | 三張卡片依序出現並打叉       | 7.5  |
| … |           |              |                                        |                              |      |

需要調整哪幾段？確認後我會開始逐段產生（/video-scene all）。
```

- 秒數為估算值，實際以 TTS 產生後的音長為準。
- 使用者提出修改時，**只改被點名的 scene**，改完再呈現一次更新後的表格。
- 使用者要求新增或刪除 scene 時，同步更新 `video.project.json` 的 `scenes`；刪除的 scene 目錄保留，由使用者自行決定是否刪除。
