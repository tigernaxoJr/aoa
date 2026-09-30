# Agent Video Producer — 系統設計規格 (v1.0)

> 狀態：Final Draft · 日期：2026-09-30
> 來源：整合 `doc/drafts/` 下四份草稿（Qwen / DeepSeek / Gemini / GPT），衝突處的取捨見 [§14 設計決策紀錄](#14-設計決策紀錄)。

---

## 1. 產品定位

**讓 Coding Agent（如 Claude Code）具備「製作產品介紹影片」的能力**，而不是「AI 幫你產生影片」的 SaaS。

| 層 | 負責 | 不負責 |
|---|---|---|
| **網站（本產品）** | 協議（Schema）、工作流程、Skill、Prompt 模板、專案範本、驗證規則、視覺化工作台 UI | LLM 算力、資料庫、使用者檔案儲存、影片渲染 |
| **本機 Agent** | 推理、規劃、撰寫程式與文案、檔案操作、呼叫本機工具 | 自行發明專案結構（必須遵守 Schema） |
| **本機環境** | 原始碼、素材、專案檔、TTS、擷取、渲染、最終影片 | — |

核心原則：

1. **零後端（Zero-Backend）**：MVP 為純靜態網站，所有 API 都是靜態 JSON / Markdown 檔。
2. **資料不離開本機**：網站不上傳、不保存任何使用者資料。
3. **Scene 化**：影片以 Scene 為最小單位，可獨立編輯、驗證、渲染、審閱、重做。
4. **協議優先**：Schema + Skill + 專案範本即產品本體；UI、MCP、渲染引擎皆為其上的實作。
5. **Agent 無關**：協議不綁定 Claude Code，任何能讀檔、跑指令的 Agent 均可使用。

---

## 2. 系統架構

```text
                    ┌──────────────────────────────────┐
                    │  網站（Static Hosting）            │
                    │  ├─ Web UI（Agent 工作台）          │
                    │  ├─ /api/*  靜態 Guide API          │
                    │  ├─ Skills / Prompts / Templates    │
                    │  └─ JSON Schemas                    │
                    └──────┬───────────────────┬─────────┘
             HTTPS (GET)   │                   │  瀏覽器載入 UI
                           ▼                   ▼
                  ┌────────────────┐   ┌──────────────────────┐
                  │  Claude Code   │   │  Browser (Chrome/Edge)│
                  │  (本機 Agent)   │   │  File System Access API│
                  └───────┬────────┘   └──────────┬───────────┘
                          │ 讀寫 / 執行             │ 使用者授權後讀寫
                          ▼                        ▼
                  ┌──────────────────────────────────────────┐
                  │  本機 Video Project（唯一事實來源）          │
                  │  video.project.json · scenes/ · assets/    │
                  │  scripts/ · src/ · output/                 │
                  └──────────────────┬───────────────────────┘
                                     ▼
                     Node.js · Playwright · TTS · Remotion · FFmpeg
                                     ▼
                              output/final.mp4
```

**Agent 與 UI 之間沒有直接連線**，兩者只透過本機專案檔溝通（檔案即訊息匯流排）：

- Agent 寫入狀態 → UI 重新讀取顯示進度。
- 使用者在 UI 修改文案 → UI 寫回檔案並標記 scene 為 `stale` → Agent 下次執行時只重做過期的 scene。

### 2.1 UI ↔ Agent 通訊模式

「靜態部署」只約束**雲端**不跑後端，不約束使用者本機。HTTPS 靜態頁連 `http://localhost` / `ws://127.0.0.1` 為瀏覽器允許的例外，因此以下模式皆與靜態部署相容：

| 模式 | 雲端 | 本機 | Agent → UI | UI → Agent | 階段 |
|---|---|---|---|---|---|
| **A. 檔案輪詢** | 靜態 | Claude Code | UI 輪詢檔案（自動） | 使用者在終端機下指令（手動） | **MVP** |
| A'. 檔案佇列 | 靜態 | Claude Code 常駐監看 | UI 輪詢檔案 | UI 寫 `requests/*.json`，Agent 監看並處理 | 不採用 |
| **B. 本機 Companion** | 靜態 | Claude Code + `npx video-agent serve` | WebSocket 推送 | WebSocket → Companion 執行腳本或 `claude -p` | Phase 5 |

**模式 A 的限制（MVP 必須在 UI 明示）**：Claude Code 是請求驅動的，不會背景監聽檔案；瀏覽器也無法喚起它。因此 UI → Agent 方向不是即時的——UI 修改只會把 scene 標為 `stale`，UI 顯示「N 個 scene 待更新」並提供一鍵複製 `/video-sync` 指令，由使用者在終端機觸發。

**不採用 A'**：Agent 對話需長時間開著且每次檢查都消耗 token，閒置成本高。

**模式 B 的設計要求**：

- Companion 是無狀態的：所有狀態仍只存在專案檔中，Companion 只監看檔案並轉發事件；關掉 Companion 系統即退回模式 A，不影響資料。
- 職責劃分：**確定性工作**（重跑 TTS、render 單一 scene、assemble）由 Companion 直接執行 npm scripts；**需要推理的工作**（改寫文案、重規劃分鏡）才以 `claude -p "/video-sync"` 呼叫 Agent。
- 安全：只綁定 `127.0.0.1`；CORS 只允許網站 origin，並檢查每個請求的 `Origin`；啟動時產生隨機配對 token，所有請求須帶 token——否則任何網頁都能叫本機執行指令。只暴露白名單動作，不接受任意指令字串。
- 形態與配對：見 §10.1。
- 瀏覽器限制：Chrome 對「公開網站存取本機網路」會要求使用者授權（Local Network Access），UI 需引導；Safari 對 localhost 連線限制較多，列為不支援。
- 相容性：UI 偵測到 Companion（連 `ws://127.0.0.1:<port>` 成功）時啟用「立即重新渲染」等按鈕與推送更新；否則自動回退到模式 A。

**為了讓 A → B 無痛升級，MVP 的檔案協議即須滿足**：狀態只存在 `scene.json` / `video.project.json`；「待處理」以 `status: stale` 表達（即工作佇列）；腳本介面為 `npm run <script> -- <scene-id>`，可被 Agent 或 Companion 同樣呼叫。

---

## 3. 本機專案結構

Agent 初始化專案時 **必須** 產生以下結構（由網站提供的 template 產生）：

```text
my-video-project/
├── video.project.json          # 專案層級定義與 scene 順序（唯一事實來源之一）
├── package.json
├── AGENTS.md                   # Agent 規則（Agent 無關）
├── CLAUDE.md                   # 內容僅 `@AGENTS.md`，供 Claude Code 自動載入
├── README.md
├── .claude/
│   ├── skills/product-video/   # 從網站下載的 Skill（可選，亦可線上讀取）
│   └── commands/               # Slash commands（見 §8.3）
├── schemas/                    # 從網站同步的協議檔（離線使用）
│   ├── common.schema.json
│   ├── project.schema.json
│   ├── scene.schema.json
│   ├── workflow.schema.json
│   └── workflow.json
├── brief/
│   ├── product-brief.md        # 產品分析結果
│   └── style.json              # 風格分析結果（可選）
├── scenes/
│   ├── 001-hook/
│   │   ├── scene.json          # 單一 scene 定義與狀態
│   │   ├── script.md           # 旁白稿（人類可讀、可直接編輯）
│   │   ├── assets/             # 該 scene 專屬素材（截圖、錄影、TTS 音檔）
│   │   └── output/             # scene.mp4
│   ├── 002-problem/
│   └── ...
├── assets/                     # 全域共用素材（logo、字型、BGM）
├── scripts/
│   ├── validate.mjs
│   ├── tts.mjs
│   ├── capture.mjs
│   ├── render-scene.mjs
│   ├── assemble.mjs
│   └── state.mjs               # 唯一的 JSON 寫入入口（§10.2）
├── src/                        # Remotion 程式碼
│   ├── Root.tsx
│   └── scenes/                 # 每個 scene 一個 React 組件（可選客製）
└── output/
    └── final.mp4
```

規則：

- Scene 目錄命名：`{index 三位數}-{slug}`，例如 `003-solution`。重新排序時**只改 `video.project.json` 的順序**，不必重新命名目錄。
- 生成素材只能放在 `assets/` 或 `scenes/*/assets/`，渲染產物只能放在 `scenes/*/output/` 或 `output/`。
- 不得寫入任何密鑰或個人敏感資訊到 JSON 檔。

---

## 4. 資料規格

### 4.1 `video.project.json`

專案層級資訊 + scene 的**順序與引用**。scene 的內容與狀態存在各自的 `scene.json`，避免雙重事實來源。

```json
{
  "$schema": "./schemas/project.schema.json",
  "specVersion": "1.0.0",
  "project": {
    "id": "8f1c2e0a-...",
    "name": "Product Launch Demo",
    "sources": {
      "productUrl": "https://example.com",
      "sourceCodePath": "../my-product",
      "description": "使用者補充的產品說明",
      "referenceVideoUrl": null
    },
    "targetAudience": "開發者",
    "language": "zh-TW",
    "format": {
      "aspectRatio": "16:9",
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "targetDurationSec": 45
    },
    "audio": {
      "bgm": "assets/bgm.mp3",
      "bgmVolume": 0.25,
      "ducking": true
    },
    "captions": {
      "mode": "srt",
      "style": { "fontFamily": "Noto Sans TC", "fontSize": 48, "position": "bottom" }
    },
    "renderer": "remotion",
    "rendererLicense": { "acknowledged": true, "tier": "free-individual", "acknowledgedAt": "2026-09-30T13:00:00Z" },
    "tts": {
      "provider": "edge-tts",
      "voice": "zh-TW-HsiaoChenNeural",
      "consent": { "onlineTts": true, "grantedAt": "2026-09-30T13:00:00Z" }
    }
  },
  "scenes": [
    { "id": "scene-001", "dir": "scenes/001-hook" },
    { "id": "scene-002", "dir": "scenes/002-problem" }
  ],
  "status": "script_generated",
  "updatedAt": "2026-09-30T14:00:00Z",
  "updatedBy": "agent"
}
```

- `scenes` 陣列的順序 **即為** 影片播放順序。
- `renderer`：`"remotion"`（預設）｜`"html-capture"`（見 §7.6）。
- `rendererLicense`：選用 Remotion 時必填。`tier`：`free-individual`（個人／≤3 人營利組織／非營利）｜`company-licensed`（已購買公司授權）。未確認時 Agent 不得執行渲染。

### 4.2 `scenes/*/scene.json`

```json
{
  "$schema": "../../schemas/scene.schema.json",
  "id": "scene-003",
  "title": "產品介紹",
  "purpose": "solution",
  "narration": {
    "scriptFile": "script.md",
    "provider": "edge-tts",
    "voice": "zh-TW-HsiaoChenNeural",
    "speed": 1.0,
    "audioFile": "assets/narration.mp3"
  },
  "visual": {
    "type": "web-capture",
    "description": "捲動至功能區並高亮第一張卡片",
    "capture": {
      "url": "https://example.com",
      "actions": [
        { "do": "scroll", "selector": "#features" },
        { "do": "highlight", "selector": "#features .card:first-child" }
      ]
    },
    "elements": [
      { "type": "text", "content": "一鍵部署", "animation": "fadeIn", "at": 0.5 },
      { "type": "image", "src": "@/assets/logo.png", "animation": "slideInLeft", "at": 0 }
    ],
    "transitionIn": "fade"
  },
  "durationSec": null,
  "status": "rendered",
  "render": {
    "inputHash": "sha256:…",
    "outputFile": "output/scene.mp4",
    "renderedAt": "2026-09-30T14:10:00Z"
  },
  "locked": false,
  "error": null,
  "attempts": 0
}
```

欄位說明：

| 欄位 | 說明 |
|---|---|
| `purpose` | `hook` · `problem` · `solution` · `feature` · `how-it-works` · `benefit` · `social-proof` · `cta` · `custom` |
| `visual.type` | `web-capture`（Playwright 擷取網頁操作）· `screenshot`（靜態截圖 + 動效）· `motion-graphic`（純 Remotion 動畫）· `code`（程式碼展示）· `user-asset`（使用者提供的影片/圖片） |
| `narration.provider` | TTS 提供者，省略時沿用 `project.tts.provider`。見 §7.4 |
| `durationSec` | `null` 表示由 TTS 音檔長度決定（音長 + 0.5s 緩衝）；有值則為強制秒數。幀數一律由 `durationSec × fps` 推得，**不存幀數**。 |
| `render.inputHash` | 對 scene.json（排除 `status`、`render`、`error`、`attempts`、`locked`、`updatedAt`、`updatedBy`）、script.md、該 scene 素材、專案 `format` 與 `renderer` 計算的雜湊。與目前內容不符即視為過期。 |
| `locked` | `true` 時 Agent 不得修改此 scene（除非使用者明確要求）。使用者在 UI 手動核准後可設為 `true`。 |

### 4.2.1 共通規則（由 Schema 強制）

- **路徑**：一律使用正斜線的相對路徑，不得為絕對路徑、不得含 `..` 片段。scene.json 內的路徑相對於該 scene 目錄；以 `@/` 開頭表示相對於專案根目錄（如 `@/assets/logo.png`）。`video.project.json` 內的路徑相對於專案根目錄。唯一例外是 `project.sources.sourceCodePath`（唯讀輸入，可在專案外）。
- **擴充欄位**：Schema 不接受未定義的欄位，以免拼錯欄位名稱被默默忽略。使用者或第三方工具需要自訂欄位時，一律以 `x-` 開頭（可用於專案根、`project`、scene 根、`visual`），Agent 必須原樣保留。
- **寫入者**：`updatedBy` 為 `agent` · `user` · `companion` · `mcp`。
- **Schema 無法表達、由 `validate.mjs` 檢查的規則**：scene id 與 dir 唯一且目錄存在；`format` 寬高與 `aspectRatio` 相符；各 scene.json 的 `id` 與 `video.project.json` 引用一致；解析後路徑不得跳出專案根目錄；狀態為 `rendered` / `approved` 時輸出檔存在且 `inputHash` 相符。
- Schema 原始檔位於產品 repo 的 `specs/`（`common` / `project` / `scene` 三個檔案），`specs/examples/` 內的有效與無效範例由 `npm run test:specs` 驗證。

### 4.3 `script.md`

旁白稿獨立成 Markdown，讓使用者可直接用編輯器或 UI 修改。純文字，一段即一句旁白；可用 `<!-- pause 0.5 -->` 插入停頓。

### 4.4 多語系

- **一個專案 = 一個語言**（`project.language`）。MVP 不支援同一專案輸出多語版本。
- 需要其他語言時，使用 `/video-translate <locale>`：
  1. 將專案複製到同層的 `<專案名>-<locale>/`（不含 `output/`、`scenes/*/output/`、`scenes/*/assets/narration.*`、`captions.json`）。
  2. 新專案產生新的 `project.id`，並記錄 `project.translatedFrom: { "id": "<原專案 id>", "language": "zh-TW" }`。
  3. Agent 翻譯所有 `script.md`、`visual.elements` 中的文字、`title`；更新 `language` 與 `tts.voice`。
  4. 所有 scene 設為 `draft`，截圖類素材若產品有對應語系頁面則標記需重新擷取。
  5. 在新專案中從 Step 4（build_scene）繼續；原專案不受影響。
- **保留命名**（供未來原生多語系使用，現在不得使用這些名稱）：`script.<locale>.md`、`scenes/*/output/<locale>/`、`output/<locale>/`、`assets/narration.<locale>.*`、`assets/captions.<locale>.json`。

### 4.5 狀態機

**Project `status`**

```text
initialized → analyzed → script_generated → producing → ready_to_assemble → completed
                                                   ↘            ↘
                                                    failed ←─────┘
```

| 值 | 意義 |
|---|---|
| `initialized` | 專案骨架已建立 |
| `analyzed` | `brief/product-brief.md`（及可選 `style.json`）已產生 |
| `script_generated` | 所有 scene 已規劃，scene.json + script.md 已產生 |
| `producing` | 至少一個 scene 正在產生素材或渲染 |
| `ready_to_assemble` | 所有 scene 皆為 `approved` 或 `rendered` 且未過期 |
| `completed` | `output/final.mp4` 已產生且對應目前所有 scene |
| `failed` | 專案層級錯誤（如依賴安裝失敗） |

**Scene `status`**

```text
draft → assets_ready → rendering → rendered → approved
  ▲                                    │           │
  └──────────── stale ◄────────────────┴───────────┘   （內容被修改）
任一步驟失敗 → failed（可重試回到前一狀態）
```

| 值 | 意義 |
|---|---|
| `draft` | 已有文案與視覺描述，尚無素材 |
| `assets_ready` | TTS 音檔與擷取素材已完成，時長已確定 |
| `rendering` | 渲染中 |
| `rendered` | `output/scene.mp4` 已產生且 `inputHash` 相符 |
| `approved` | 使用者已審閱通過 |
| `stale` | 已渲染過但輸入被修改（UI 編輯或手動改檔），需重做 |
| `failed` | 失敗，`error` 欄位記錄原因 |

---

## 5. 網站靜態 API（Guide API）

所有端點皆為靜態檔案，Agent 以 HTTP GET（如 `WebFetch` / `curl`）讀取。這些 API 本質是 **Agent 的說明書與作業規則**，刻意 **不提供** `POST /api/video/generate` 這類生成式端點。

```text
GET /api/index.json                          # 入口：列出所有資源與版本
GET /api/agent-guide.md                      # Agent 必讀總綱（本規格的 Agent 版摘要）
GET /api/workflow.json                       # 機器可讀工作流程（§6）
GET /api/schemas/project.schema.json
GET /api/schemas/scene.schema.json
GET /api/prompts/analyze-product.md
GET /api/prompts/analyze-style.md
GET /api/prompts/storyboard.md
GET /api/prompts/scene-script.md
GET /api/rules/script.md                     # 文案規則（字數/秒、語氣、禁用詞）
GET /api/rules/visual.md                     # 視覺規則（安全邊距、字級、配色）
GET /api/skills/product-video.zip            # 完整 Skill 套件
GET /api/templates/product-video.zip         # 專案範本
GET /api/templates/product-video/manifest.json
```

`/api/index.json`：

```json
{
  "specVersion": "1.0.0",
  "entry": "/api/agent-guide.md",
  "workflow": "/api/workflow.json",
  "schemas": {
    "project": "/api/schemas/project.schema.json",
    "scene": "/api/schemas/scene.schema.json"
  },
  "skill": "/api/skills/product-video.zip",
  "template": "/api/templates/product-video.zip"
}
```

版本規則：`specVersion` 採 SemVer。Major 版變更需提供遷移說明；本機專案的 `specVersion` 與網站不同 major 時，Agent 必須先提示使用者。

---

## 6. 工作流程

### 6.1 `workflow.json`

原始檔：產品 repo 的 `specs/workflow.json`（格式由 `specs/workflow.schema.json` 定義），發佈為 `/api/workflow.json`，並隨範本同步到專案的 `schemas/workflow.json`。

| 區塊 | 內容 |
|---|---|
| `gates` | 執行特定腳本前必須取得的使用者確認：`rendererLicense`（擋 `render:scene`、`assemble`）、`onlineTtsConsent`（擋 `tts`）。含說明內容、記錄欄位與拒絕時的處理 |
| `steps` | 主流程 `init` → `analyze` → `storyboard` → `build_scene` → `assemble`。每步定義 `command`、`scope`（project / scene）、`requires`（允許的 project / scene 狀態、gates）、`skipWhen`、`reads` / `writes`、有序的 `actions`（含狀態轉換）、`checkpoint`、`guide`（Skill 章節） |
| `operations` | 隨時可執行的操作：`sync`、`status`、`approve`、`translate` |
| `derivedProjectStatus` | 由 scene 狀態推導 `project.status` 的規則；`state.mjs` 每次寫入 scene 後重算 |

`npm run test:specs` 會驗證 workflow.json 符合 schema，並交叉檢查所有狀態轉換值皆為合法的 project / scene 狀態、引用的 gate 皆已定義、指令不重複。

### 6.2 步驟細節

**Step 1 — init**
1. 下載並解壓專案範本；填入 `video.project.json` 的 `sources` 與 `format`。
2. `npm install`；檢查 `ffmpeg -version`、Playwright 瀏覽器、TTS 工具是否可用，缺少時告知使用者安裝方式，不自行以系統權限安裝。
3. 確認渲染器授權（§7.6）與 TTS 連網同意（§7.4），寫入 `project.rendererLicense` / `project.tts.consent`。
4. 同步 `schemas/`，執行 `npm run validate`。

**Step 2 — analyze**
1. 讀取產品網址（Playwright 擷取頁面文字與主要截圖）、本機原始碼（README、package.json、路由/頁面）、使用者描述。
2. 產出 `brief/product-brief.md`：產品一句話、目標受眾、痛點、核心功能（≤5）、USP、品牌色與字型、CTA。
3. （可選）若有 `referenceVideoUrl` 或使用者提供的參考影片檔：以 FFmpeg 抽取關鍵影格，分析節奏、色調、字幕樣式、轉場，寫入 `brief/style.json`。無法取得影片時跳過並註明，不臆測。

**Step 3 — storyboard**
1. 依 brief 規劃 **3–8 個 scene**，建議骨架：Hook → Problem → Solution → Feature(s) → Benefit → CTA。
2. 每個 scene 產生 `scene.json` + `script.md`；總旁白估算時長需接近 `targetDurationSec`（中文約 4 字/秒、英文約 2.5 字/秒）。
3. 執行 `npm run validate`。
4. **Checkpoint**：停下來請使用者審閱分鏡（在終端或 UI），確認後才進入 Step 4。

**Step 4 — build_scene（逐 scene、可單獨重跑）**
1. 若 `locked: true` 或狀態為 `rendered/approved` 且未過期 → 跳過。
2. **TTS**：`npm run tts -- <id>` → `assets/narration.mp3`；以 `ffprobe` 取得音長，決定 `durationSec`（若未強制指定）。
3. **Capture**：依 `visual.type` 執行 `npm run capture -- <id>`（Playwright 截圖或錄製網頁操作）→ `assets/`。
4. 狀態設為 `assets_ready`。
5. **Render**：`npm run render:scene -- <id>` → `output/scene.mp4`；寫入 `render.inputHash`、`renderedAt`，狀態 `rendered`。
6. 執行 `npm run validate`。
7. **Checkpoint**：回報該 scene 預覽路徑，使用者可要求修改；修改只重跑該 scene。

**Step 5 — assemble**
1. 檢查所有 scene 為 `rendered` 或 `approved` 且 `inputHash` 相符；否則列出需重做的 scene 並停止。
2. 依 `video.project.json.scenes` 順序以 FFmpeg concat（或 Remotion 整體合成以套用 scene 間轉場）。
3. **字幕**：合併各 scene 的 `assets/captions.json`（依 scene 起始時間位移）為 `output/final.srt`；`captions.mode` 為 `burn` 時再以 FFmpeg 燒入畫面。
4. **BGM**：若 `audio.bgm` 檔案存在，以 FFmpeg `sidechaincompress` 在旁白出現時壓低音量，頭尾淡入淡出；不存在則略過。
5. 輸出 `output/final.mp4`，project 狀態設為 `completed`。

### 6.3 修改流程（差異化重做）

```text
使用者在 UI / 編輯器修改 scene-003 的文案
          ↓
UI 寫回 script.md，scene.status → stale，project.status → producing
          ↓
使用者對 Agent 說「更新影片」或執行 /video-sync
          ↓
Agent 重算所有 scene 的 inputHash，找出 stale / 不相符者
          ↓
只重跑 scene-003 的 TTS → Render
          ↓
重新 assemble
```

---

## 7. 本機工具鏈

### 7.1 依賴

| 用途 | 工具 | 備註 |
|---|---|---|
| 執行環境 | Node.js ≥ 20、npm | |
| 網頁擷取 | Playwright | 截圖、錄製操作、抓取產品頁內容 |
| 語音合成 | 可替換 provider，預設 `edge-tts` | 見 §7.4 |
| 影片合成 | Remotion（預設）／html-capture | Remotion 授權：個人、≤3 人營利組織、非營利免費，其餘需 Company License（義務在實際渲染者）；見 §7.6 |
| 轉檔/合併 | FFmpeg / ffprobe | 系統需預先安裝 |

### 7.2 `package.json` scripts

```json
{
  "name": "product-video-project",
  "private": true,
  "type": "module",
  "scripts": {
    "validate":     "node scripts/validate.mjs",
    "tts":          "node scripts/tts.mjs",
    "capture":      "node scripts/capture.mjs",
    "render:scene": "node scripts/render-scene.mjs",
    "assemble":     "node scripts/assemble.mjs",
    "state":        "node scripts/state.mjs",
    "status":       "node scripts/validate.mjs --report",
    "preview":      "remotion studio src/Root.tsx"
  },
  "dependencies": {
    "remotion": "^4", "@remotion/cli": "^4",
    "playwright": "^1", "ajv": "^8"
  }
}
```

### 7.3 腳本職責

| 腳本 | 輸入 | 輸出 | 可修改 JSON？ |
|---|---|---|---|
| `validate.mjs` | 全專案 | 退出碼（非 0 = 失敗）；`--report` 輸出各 scene 狀態與是否過期 | 否 |
| `tts.mjs <id>` | script.md、voice 設定 | `assets/narration.mp3`、`assets/captions.json` | 否 |
| `capture.mjs <id>` | `visual.capture` | `assets/capture.*` | 否 |
| `render-scene.mjs <id>` | scene 全部輸入 | `output/scene.mp4` | 否 |
| `state.mjs <target> <patch>` | Agent 提供的修改 | 更新後的 JSON（鎖檔 + 原子寫入 + validate，§10.2） | **是**（唯一例外，由 Agent 呼叫） |
| `assemble.mjs` | 所有 scene 輸出、`audio`、`captions` | `output/final.mp4`、`output/final.srt` | 否 |

`state.mjs` 介面（Agent 使用方式見範本 `AGENTS.md` §4）：

| 用法 | 效果 |
|---|---|
| `npm run state -- <project\|scene-id> --status <status>` | 設定狀態（檢查轉換是否合法） |
| `npm run state -- <scene-id> --rendered` | 計算 `inputHash`，寫入 `render`，狀態 `rendered`，`attempts` 歸零，清除 `error` |
| `npm run state -- <scene-id> --failed <step> "<message>" [--hint "<hint>"]` | 狀態 `failed`，寫入 `error`，`attempts` + 1 |
| `npm run state -- <target> --patch-file <path>` | 套用 JSON Patch（RFC 6902）。不用 JSON Merge Patch，因為它以 `null` 表示刪除，無法把 `durationSec` 設為 `null` |

所有用法皆自動更新 `updatedAt` / `updatedBy`，寫入前驗證，失敗則不寫入。新建 `scene.json` 是唯一可直接寫檔的情況（尚無其他寫入者），寫完須執行 `npm run validate`。

**產出類腳本只產生檔案，不改 JSON；狀態一律由 Agent 決定並經 `state.mjs` 寫回**，確保狀態寫入集中、可追蹤且不互相覆蓋。

`validate.mjs` 檢查項目：JSON Schema 合法；`scenes` id 唯一、`dir` 存在；`render.outputFile` 等路徑位於專案內且檔案存在（當狀態聲稱已渲染時）；`inputHash` 一致性；所有路徑不得跳出專案根目錄。

### 7.4 TTS Provider

`scripts/tts.mjs` 依 `narration.provider`（scene 層）→ `project.tts.provider`（專案層）決定實作，介面固定為「script.md → `assets/narration.mp3`」。

| provider | 說明 | 連網 | 備註 |
|---|---|---|---|
| `edge-tts`（預設） | 免費、繁中品質佳 | 是，文字送至 Microsoft | 非官方介面，可能失效；失敗時提示改用其他 provider |
| `azure` / `openai` / `elevenlabs` | 使用者自帶 API key | 是 | key 只放 `.env`，Agent 不讀取、不寫入 JSON |
| `piper` | 完全離線 | 否 | 無 zh-TW 聲音，適合英文或隱私優先 |
| `system` | Windows SAPI / macOS `say` | 否 | 跨平台聲音不一致 |
| `manual` | 使用者自行錄音 | 否 | 放入 `assets/narration.mp3` 即跳過合成，只以 ffprobe 取音長 |

規則：

- 使用任何連網 provider 前，Agent 必須告知「旁白文字將送至 <服務>」並取得同意，記錄於 `project.tts.consent`；未同意則停下請使用者選擇離線 provider 或 `manual`。
- provider 失敗視同 scene 失敗（§8.1 規則 10），不自動切換到其他連網 provider。

### 7.5 字幕與 BGM

**字幕**

- `tts.mjs` 同時輸出 `assets/captions.json`：`[{ "start": 0.0, "end": 1.8, "text": "…" }]`（scene 內相對秒數）。
  - `edge-tts`：使用其回傳的字詞邊界時間，精準對齊。
  - 其他 provider / `manual`：依句子（句號、問號、換行）切分，按字數比例分配音長。
- 單條字幕上限：中文 16 字、英文 42 字元，超過則再切。
- `captions.mode`：`srt`（預設，只輸出 `output/final.srt`）｜`burn`（燒入並同時輸出 srt）｜`none`。
- **燒入只在 assemble 進行**，不在 scene 渲染時燒入——修改字幕樣式只需重跑 assemble，不使 scene 過期；`captions` 設定因此不納入 scene 的 `inputHash`。

**BGM**

- 由使用者自備音檔放入 `assets/`，於 `audio.bgm` 指定；網站不提供音樂庫（避免音樂授權責任），不做 AI 生成音樂。
- assemble 時混音：`bgmVolume` 為基準音量，`ducking: true` 時旁白出現處自動壓低，影片頭尾 1 秒淡入淡出。
- BGM 同樣只在 assemble 處理，不影響 scene 的 `inputHash`。

### 7.6 渲染器

| renderer | 定位 | 授權 |
|---|---|---|
| `remotion`（預設） | 成熟、單 scene 渲染與轉場完整、LLM 熟悉度高 | 個人／≤3 人營利組織／非營利免費；其餘需 Company License |
| `html-capture` | 正式支援的免授權替代方案 | Playwright（Apache-2.0）、FFmpeg |

`html-capture` 實作要求：

- 每個 scene 產生 `scenes/*/scene.html`，所有動畫由單一時間變數 `t` 驅動（CSS 動畫暫停並以 `animation-delay` 定位，或 JS 以 `window.__seek(t)` 設定）。
- **逐幀截圖**：依 `fps` 逐幀呼叫 `__seek(frame / fps)` 後截圖，再由 FFmpeg 編碼並混入旁白。**不得**使用 Playwright 內建 `recordVideo`（webm、幀率不穩，無法確定性重現）。
- `web-capture` 類素材仍可用錄影取得，但須先以 FFmpeg 轉為固定幀率再嵌入。
- scene 間轉場由 `assemble.mjs` 以 FFmpeg `xfade` 實作。
- 腳本介面與 Remotion 相同（`npm run render:scene -- <id>`），切換 renderer 不需改 scene 資料。

**授權告知**：`init` 選用 Remotion 時，Agent 必須說明授權條件並請使用者確認身分級距，寫入 `project.rendererLicense`；使用者表示不符合免費條件且未購買授權時，改用 `html-capture`。

---

## 8. Agent 整合

### 8.1 Agent 硬性規則（寫入 `AGENTS.md`）

1. 開始前先讀取 `/api/agent-guide.md` 與 `/api/workflow.json`（或本機 Skill）。
2. 依步驟執行，不跳步；到 checkpoint 必須停下等待使用者確認。
3. 所有 JSON 必須符合 Schema；每次寫入後執行 `npm run validate`。
4. 每個 scene 獨立產生、獨立渲染；修改只重做受影響的 scene。
5. 不修改 `locked: true` 或 `approved` 的 scene，除非使用者明確要求。
6. 不覆蓋使用者手動修改的內容；原樣保留 `x-` 開頭的擴充欄位（§4.2.1）。
7. 寫入 JSON 前先重新讀取檔案（UI 可能已修改），並更新 `updatedAt`、`updatedBy: "agent"`；遵守 §10.2 寫入協定（鎖檔 + 原子寫入）。
8. 生成素材只放在 `assets/`、`scenes/*/assets/`；輸出只放在 `output/`、`scenes/*/output/`。
9. 不上傳任何使用者資料到遠端；使用線上服務（如 edge-tts）前需告知。
10. 失敗時保留現場，不刪既有檔案；寫入 `status: failed` 與 `error`，同一 scene 自動重試不超過 2 次，之後回報使用者並說明重試方式。

### 8.2 Skill 套件

```text
skills/product-video/
├── SKILL.md              # 觸發描述 + 工作流程總覽 + 規則
├── workflow.md
├── script-guide.md       # 文案寫法、各 purpose 的範例
├── rendering-guide.md    # Remotion / capture 實作指引
└── schemas/ → 連結至 specs/
```

安裝方式：Agent 下載 `/api/skills/product-video.zip` 解壓到專案 `.claude/skills/`（或使用者層級 skills 目錄）。

### 8.3 Slash Commands（Claude Code）

範本內建 `.claude/commands/`：

| 指令 | 對應步驟 |
|---|---|
| `/video-init` | init |
| `/video-analyze` | analyze |
| `/video-storyboard` | storyboard |
| `/video-scene <id\|all>` | build_scene |
| `/video-sync` | 找出 stale scene 並重做 + assemble |
| `/video-assemble` | assemble |
| `/video-status` | 執行 `npm run status` 並摘要 |
| `/video-approve <id>` | 將 `rendered` 的 scene 設為 `approved` |
| `/video-translate <locale>` | 複製專案並翻譯為指定語言（§4.4） |

指令檔內容僅為薄包裝：指向 Skill 中對應章節，避免規則重複維護。

### 8.4 其他 Agent 相容性

| 層 | 通用性 | 規則 |
|---|---|---|
| npm scripts、JSON Schema、檔案協議 | 完全通用 | 協議本體，任何能讀檔、執行指令的 Agent 皆可用 |
| `AGENTS.md` | 多數 Agent 原生讀取 | 規則的唯一來源；Claude Code 以 `CLAUDE.md` 的 `@AGENTS.md` 引入 |
| `SKILL.md` | Agent Skills 開放格式，支援度各異 | 內容保持中立 |
| MCP | 通用 | Phase 5 |
| Slash commands | 各家格式不同 | 只是便利入口，不承載規則 |

- **中立寫法**：`AGENTS.md`、`SKILL.md`、prompts 不得使用任何 Agent 專屬語法或工具名稱（如 `$ARGUMENTS`、特定工具名），一律以「執行 `npm run …`」「讀取檔案 …」描述動作。Agent 專屬內容只能放在其專屬目錄（如 `.claude/`）。
- **支援等級**：MVP 只正式支援並端到端測試 **Claude Code**。
- **擴充方式**：指令以單一來源 `templates/commands/*.yaml` 定義，由 `build-api.mjs` 產生各 Agent 格式（`.claude/commands/*.md`、`.gemini/commands/*.toml`、`.cursor/commands/*.md` 等）。依序加入 Codex、Gemini CLI；每個 Agent 通過與 Claude Code 相同的端到端驗收（§13 Phase 3 完成標準）後，網站才標示為「支援」。

---

## 9. Web UI（Agent 工作台）

UI 的目的 **不是執行 AI**，而是將本機專案與 Agent 工作狀態視覺化，並提供便利的編輯入口。

### 9.1 本機檔案存取

- 使用 **File System Access API**：使用者點擊「開啟專案資料夾」→ `window.showDirectoryPicker({ mode: "readwrite" })` → 取得 `FileSystemDirectoryHandle`。
- **不使用** `fetch("file://…")`（瀏覽器禁止）。
- 支援瀏覽器：Chrome / Edge（桌面版）；需 HTTPS 或 localhost。Firefox / Safari 顯示唯讀提示或引導改用支援的瀏覽器。
- Directory handle 存入 IndexedDB，下次開啟時請求重新授權即可，免重新選擇。
- **更新偵測**：每 2 秒輪詢 `video.project.json` 與各 `scene.json` 的 `lastModified`（File System Observer API 可用時優先使用）；連上 Companion 時改用其 WebSocket 推送（見 §2.1）。
- **反向通知**：模式 A 下 UI 無法喚起 Agent，只能標記 `stale` 並提示使用者執行 `/video-sync`。

### 9.2 畫面

1. **Source**：產品網址、原始碼資料夾、產品描述 → 產生給 Agent 的啟動指令（一鍵複製，例如 `claude "/video-init https://example.com"`）。
2. **Workflow**：五步驟進度條，顯示目前 project 狀態與下一步建議指令。
3. **Scene Board**：scene 卡片看板（標題、purpose、時長、狀態徽章、縮圖），可拖曳排序。
4. **Scene Editor**：編輯 `script.md`、視覺描述、voice、強制時長；鎖定/核准按鈕；以 `<video>` 從 handle 讀 blob 預覽 `scene.mp4`。
5. **Final**：預覽 `final.mp4`，列出過期 scene。

### 9.3 UI 寫入規則

- 只能寫：`script.md`、`scene.json` 的可編輯欄位（`title`、`visual.description`、`narration.voice/speed`、`durationSec`、`locked`、`status: approved|stale`）、`video.project.json.scenes` 的順序。
- 內容修改後將該 scene 設為 `stale`；排序修改只影響 assemble。
- 寫入前比對檔案 `lastModified`；若 Agent 已在期間修改，提示衝突並重新載入，不盲目覆寫。
- 寫入時設 `updatedBy: "user"`。

### 9.4 技術選型

Vue 3 + Vite + TypeScript + Tailwind，純靜態部署（Cloudflare Pages / GitHub Pages）。Schema 驗證使用與本機相同的 JSON Schema（Ajv，瀏覽器端執行）；TypeScript 型別由 `specs/*.schema.json` 自動產生（如 json-schema-to-typescript），不手寫，確保 UI 與協議同步。

---

## 10. MCP 與 Companion（Phase 5）

| | Cloud MCP（網站提供） | Local MCP（本機執行） |
|---|---|---|
| Resources | `video://workflow`、`video://schemas/project`、`video://schemas/scene`、`video://rules/*`、`video://templates/product-introduction` | `video://project/current` |
| Prompts | analyze / storyboard / scene-script | — |
| Tools | 無副作用工具（如 `validate_scene_json`） | `create_project`、`create_scene`、`update_scene`、`validate_project`、`render_scene`、`assemble_video`、`project_status` |

Cloud MCP 僅是靜態 API 的 MCP 包裝；Local MCP 包裝 §7 的 npm scripts，並負責集中寫入狀態。MVP 不需要 MCP，Agent 直接讀靜態檔與執行 npm scripts 即可。

### 10.1 `video-agent` 套件（Local MCP + Companion）

Local MCP 與 Companion 生命週期不同（前者隨 Agent 對話由 stdio 啟動與結束；後者須獨立常駐，才能在 Agent 未開啟時服務 UI），因此**同一 npm 套件、兩個入口、共用核心**：

```text
video-agent/
├── core/        # validate、inputHash、腳本執行、狀態寫入、鎖
├── mcp/         # `video-agent mcp`   → stdio MCP server（由 Claude Code 啟動）
└── serve/       # `video-agent serve` → 127.0.0.1 WebSocket（使用者手動啟動）
```

`video-agent serve`：

- **Port**：預設 `47831`，被占用時依序嘗試至 `47840`；`--port` 可強制指定。
- **配對**：啟動時產生隨機 token，於終端機印出配對連結
  `https://<網站>/app#pair=<port>:<token>`
  使用者點擊即開啟 UI 並完成配對。資訊放在 URL fragment（`#` 之後），不會送到網站伺服器。UI 將 port 與 token 存入 IndexedDB 供之後自動重連；token 於 `serve` 重啟時更換（`--persist-token` 可保留）。
- UI **不主動掃描 port**（避免反覆觸發 Local Network Access 授權）。
- 只接受白名單動作：`status`、`validate`、`tts <id>`、`capture <id>`、`render-scene <id>`、`assemble`、`sync`（呼叫 `claude -p "/video-sync"`）。

### 10.2 寫入協定

Agent、Local MCP、Companion、UI 皆可能寫入專案 JSON，一律遵守（Agent 的檔案編輯工具無法取鎖與原子替換，因此 Agent 更新 JSON 時經由 `npm run state -- <scene-id|project> <json-patch>`，由 `scripts/state.mjs` 執行以下協定並於寫入後自動 validate）：

1. 寫入前取得專案根目錄的 `.video-agent.lock`（內容：寫入者、PID、時間）；已存在且未逾時（30 秒）則等待重試，逾時視為殘留鎖並覆蓋。
2. 重新讀取目標檔 → 修改 → 寫到 `<file>.tmp` → rename 覆蓋（原子寫入）。
3. 釋放鎖。
4. UI（File System Access API 無法可靠實作鎖語意）：寫入前檢查鎖檔存在則延後寫入；寫入時使用 `createWritable()`（本身即寫暫存後替換），並以 `lastModified` 比對偵測衝突（§9.3）。

---

## 11. 安全與隱私

- 網站無帳號、無 cookie 追蹤、無使用者資料儲存；若加入分析工具，只收匿名頁面瀏覽數據。
- 所有處理在本機完成；使用線上 TTS 等第三方服務時，Agent 與 UI 需明確標示。
- 範本內容（腳本、指令）由網站提供並在本機執行 → 範本 zip 需附 SHA-256 雜湊並公開於 `manifest.json`，Agent 下載後驗證。
- 所有檔案路徑需驗證不得跳出專案根目錄（防止 `../` 路徑穿越）。
- JSON 檔不得包含 API key、帳密等敏感資訊；需要時使用 `.env`（並列入 `.gitignore`）。
- Web capture 只擷取使用者提供的網址；需要登入的頁面由使用者自行在 Playwright 開啟的瀏覽器中登入，Agent 不處理密碼。

---

## 12. 產品 Repository 結構（本網站）

```text
agent-video-platform/
├── apps/web/                       # Vue 工作台
├── specs/                          # 協議（唯一來源）
│   ├── common.schema.json
│   ├── project.schema.json
│   ├── scene.schema.json
│   ├── workflow.schema.json
│   ├── workflow.json
│   └── examples/{valid,invalid}/   # npm run test:specs
├── skills/product-video/           # Skill 原始檔
├── templates/product-video/        # 專案範本（含 scripts/、src/、AGENTS.md、.claude/commands/）
├── templates/commands/*.yaml       # 各 Agent 指令檔的單一來源（§8.4）
├── prompts/                        # analyze / storyboard / scene-script
├── rules/                          # script.md / visual.md
├── mcp/{cloud,local}/              # Phase 4
├── tools/build-api.mjs             # 將 specs/skills/templates 打包成 dist/api/*
└── doc/
    ├── SPEC.md                     # 本文件
    └── drafts/                     # 原始草稿
```

建置時 `build-api.mjs` 產生 `/api/*` 靜態檔、zip 與 manifest（含雜湊），與 web 一同部署。

---

## 13. 開發階段

| Phase | 內容 | 完成標準 |
|---|---|---|
| **1. 協議** | `project.schema.json`、`scene.schema.json`、`AGENTS.md`、`SKILL.md`、`workflow.json`、範本 `video.project.json` | Schema 通過自身範例驗證 |
| **2. 本機管線** | 範本 `scripts/*`、Remotion 範本、TTS、capture、assemble | 以手寫 scene.json 可產出 final.mp4 |
| **3. Agent 流程** | Guide API 靜態檔、slash commands、prompts | Claude Code 從一個產品網址端到端產出影片，並能只重做單一 scene |
| **4. Web UI** | 資料夾授權、Workflow、Scene Board/Editor、預覽 | UI 修改文案 → Agent `/video-sync` 只重做該 scene |
| **5. MCP + Companion** | Cloud MCP + Local MCP；本機 Companion（§2.1 模式 B，可與 Local MCP 同一程式） | Agent 可透過 MCP 完成相同流程；UI 按「立即重新渲染」無需切到終端機 |
| **6. 進階（視需要）** | 帳號、雲端專案、團隊協作、歷史版本、物件儲存 | — 需重新評估零後端原則 |

> 註：GPT 草稿將 Web UI 排在 Agent 流程之前；本規格調整為先打通「本機管線 + Agent」，因為 UI 只是檔案的視覺化，沒有可運作的管線就無法驗證 UI。

---

## 14. 設計決策紀錄

| # | 議題 | 草稿分歧 | 決定 | 理由 |
|---|---|---|---|---|
| D1 | 專案核心檔名 | `config.json`(Q) / `data/project.json`(D) / `video-spec.json`(Gm) / `video.project.json`(GPT) | `video.project.json` 放根目錄 | 語意明確、易被 UI 辨識為專案 |
| D2 | Scene 資料放哪 | 全放 project.json(D)、兩處重複(Gm)、每 scene 一個目錄(GPT) | 每 scene 一個目錄；project 只存順序與引用 | 避免雙重事實來源；scene 可整包刪除/複製；素材就近存放 |
| D3 | 時長單位 | 秒(D, GPT) / 幀數(Gm) | 存秒，幀數推導；預設由 TTS 音長決定 | 人類可讀；改 fps 不需改資料；採 Gemini 的音長驅動設計 |
| D4 | 渲染方式 | Puppeteer 錄螢幕(Q) / HTML+Playwright 截幀(D) / Remotion(Gm, GPT) | Remotion 預設，`html-capture` 為替代；Playwright 負責素材擷取 | Remotion 可程式化、單 scene 渲染與轉場支援佳；保留無 Remotion 路徑 |
| D5 | 狀態列舉 | 各稿不同 | §4.5 統一狀態機，新增 `stale`、`approved` | 支援 UI 修改後差異重做與使用者核准 |
| D6 | 如何偵測需重做 | 「掃描檔案變動」(Gm) | `inputHash` + `stale` 狀態 | 確定性判斷，不依賴時間戳 |
| D7 | 不覆蓋使用者修改 | 口頭規則(D, GPT) | `locked` 欄位 + `updatedBy` + 寫入前重讀/衝突檢查 | 規則需可被機器檢查 |
| D8 | 本機檔案存取 | `file://`(Q) / FS Access API(D, Gm, GPT) | File System Access API；明確禁止 `file://` fetch | 瀏覽器安全模型限制 |
| D9 | Agent 指引形式 | JSON guide(Q) / slash commands(D) / Skill + MCP(GPT) | 靜態 API + Skill 為主；slash commands 為薄包裝；MCP 為 Phase 5 | 單一來源維護規則，多入口使用 |
| D10 | 參考影片風格分析 | 必要步驟(D) | 可選；無法取得影片時跳過 | Agent 無法直接「觀看」線上影片，需本機抽影格 |
| D11 | 腳本是否改 JSON | 未規範 | 產出類腳本不改 JSON；狀態由 Agent 決定、經 `state.mjs` 寫入 | 集中狀態寫入，避免競態（見 D18 寫入協定） |
| D12 | 使用者審閱 | review 步驟(Q, GPT) | storyboard 與每 scene 渲染後各有 checkpoint | 在最便宜的階段攔截錯誤 |
| D13 | UI ↔ Agent 通訊 | 各稿僅提「UI 讀寫檔案」，未處理反向通知 | MVP 採模式 A（檔案輪詢 + 使用者觸發）；Phase 5 加本機 Companion（模式 B）；不採檔案佇列 A' | 靜態部署不排除本機服務；A' 閒置 token 成本高；協議預先設計成可無痛升級 |
| D14 | TTS 預設 | edge-tts(Gm) / 未指定 | 可替換 provider；預設 edge-tts，首次使用需同意；支援自帶 key、Piper、系統、手動錄音 | 繁中免費堪用者僅 edge-tts，但其為非官方介面，不能綁死 |
| D15 | 渲染器授權 | 未處理 | Remotion 預設 + init 時授權告知並記錄；html-capture（逐幀截圖）為正式免授權替代；Revideo 暫不評估 | 主力使用者多屬免費級距；renderer 已抽象化，不綁死 |
| D16 | BGM 與字幕 | 可選(Q) / 未規範 | 兩者皆進 MVP：字幕預設輸出 SRT、可選燒入；BGM 自備音檔 + ducking；兩者只在 assemble 處理 | 旁白即字幕來源，成本低；集中在 assemble 使樣式調整不觸發 scene 重渲染 |
| D17 | 多語系 | 未提及 | MVP 一專案一語言；`/video-translate` 複製專案並翻譯；預留 `<locale>` 命名 | 語言影響時長→畫面時間軸→每 scene 重渲染，原生支援會使狀態機二維化，MVP 成本過高 |
| D18 | Companion 形態 | 無 | 同一套件 `video-agent` 兩入口（`mcp` / `serve`）共用核心；port 47831–47840；以 `#pair=` 連結配對；統一寫入協定（鎖檔 + 原子寫入） | 生命週期不同不能同程序；邏輯相同應共用；fragment 不外洩 token 且免掃 port |
| D19 | 其他 Agent 相容性 | GPT 提及「未來支援其他 Agent」 | MVP 只測 Claude Code；AGENTS.md / Skill 中立寫法；指令檔單一來源產生各家格式，逐一驗收後才標示支援 | 協議層已通用，差異只在指令格式；支援宣告需有測試背書 |
