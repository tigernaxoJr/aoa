# Agent Video Producer — 系統設計規格 (v1.0)

> 狀態：Final Draft · 日期：2026-09-30
> 來源：整合 `drafts/` 下四份草稿（Qwen / DeepSeek / Gemini / GPT），衝突處的取捨見 [§14 設計決策紀錄](#14-設計決策紀錄)。
>
> 範圍：本文件是 **video 功能**的規格（`/video/`）。跨功能的通用架構（AOA：純靜態前端 + 本機 Agent offload）與功能隔離規則見 [專案 README](../../README.md)。

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
                         Node.js · Playwright · TTS · FFmpeg
                                     ▼
                              output/final.mp4
```

**Agent 與 UI 之間沒有直接連線**，兩者只透過本機專案檔溝通（檔案即訊息匯流排）：

- Agent 寫入狀態 → UI 重新讀取顯示進度。
- 使用者在 UI 修改文案 → UI 寫回檔案並標記 scene 為 `stale` → Agent 下次執行時只重做過期的 scene。

### 2.1 UI ↔ Agent 通訊模式

網站為靜態部署，UI 只透過使用者授權的資料夾與 Agent 溝通：

| 模式 | 雲端 | 本機 | Agent → UI | UI → Agent | 階段 |
|---|---|---|---|---|---|
| **A. 檔案輪詢** | 靜態 | Claude Code | UI 輪詢檔案（自動） | 使用者在終端機下指令（手動） | **MVP** |
| A'. 檔案佇列 | 靜態 | Claude Code 常駐監看 | UI 輪詢檔案 | UI 寫 `requests/*.json`，Agent 監看並處理 | 不採用 |
| B. 本機 Companion | 靜態 | Claude Code + 常駐的本機 WebSocket 程序 | WebSocket 推送 | WebSocket → Companion 執行腳本或 `claude -p` | 已移除 |

**模式 A 的限制（MVP 必須在 UI 明示）**：Claude Code 是請求驅動的，不會背景監聽檔案；瀏覽器也無法喚起它。因此 UI → Agent 方向不是即時的——UI 修改只會把 scene 標為 `stale`，UI 顯示「N 個 scene 待更新」並提供一鍵複製 `/video-sync` 指令，由使用者在終端機觸發。

**不採用 A'**：Agent 對話需長時間開著且每次檢查都消耗 token，閒置成本高。

**不採用 B（本機 Companion）**：曾實作過（Phase 5），讓網頁經 `127.0.0.1` WebSocket 觸發白名單腳本與 `claude -p "/video-sync"`，後移除。輪詢已足以反映 Agent 進度；確定性的重做（`pnpm run <script> <scene-id>`）使用者的 Agent 一樣能執行；而它要另外常駐程序、配對 token、Origin 檢查、處理 Local Network Access 授權，`sync` 還會在背景啟動帶寫入權限的 Agent、消耗使用者看不到的 token。省下的只是回到對話下一句指令。

**檔案協議**：狀態只存在 `scene.json` / `video.project.json`；「待處理」以 `status: stale` 表達（即工作佇列）；腳本介面為 `pnpm run <script> <scene-id>`，Agent 與 MCP 同樣呼叫。

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
│   ├── activity.schema.json
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
│   └── music/                  # pnpm run music 的產物：bgm.wav、song.mid、bgm.json（§7.5）
├── scripts/
│   ├── validate.mjs
│   ├── tts.mjs
│   ├── capture.mjs
│   ├── render-scene.mjs
│   ├── assemble.mjs
│   ├── music.mjs               # 生成配樂（§7.5）
│   ├── music-setup.mjs         # 安裝 FluidSynth 與音色庫到 ~/.aoa/
│   └── state.mjs               # 唯一的 JSON 寫入入口（§10.2）
├── src/                        # 渲染器程式碼（§7.6）
│   ├── lib/motion.js           # 版面、動畫、配色（純函式）
│   ├── html/player.js          # scene 版面（純 DOM，`window.__seek(t)`）
│   └── fonts/                  # 內附字型（Noto Sans TC Bold、JetBrains Mono，OFL）
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
    "style": "產品操作教學",
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
| `visual.type` | `web-capture`（Playwright 擷取網頁操作）· `screenshot`（靜態截圖 + 動效）· `motion-graphic`（純動畫，無擷取素材；`visual.motion.file` 可指定 Agent 撰寫的動畫模組，預設匯出 `setup(ctx)` 並回傳 `seek(t)`，受 `project.customMotion` 限制）· `code`（程式碼展示）· `user-asset`（使用者提供的影片/圖片） |
| `narration.provider` | TTS 提供者，省略時沿用 `project.tts.provider`。見 §7.4 |
| `durationSec` | `null` 表示由 TTS 音檔長度決定（音長 + 0.5s 緩衝）；有值則為強制秒數。幀數一律由 `durationSec × fps` 推得，**不存幀數**。 |
| `render.inputHash` | 對 scene.json（排除 `$schema`、`status`、`render`、`error`、`attempts`、`locked`、`feedback`、`updatedAt`、`updatedBy`，鍵排序後序列化）、旁白稿、該 scene `assets/` 下所有檔案、scene 引用的 `@/` 檔案、專案 `format`（`captions.mode` 為 `burn` 時連同 `captions`）計算的 SHA-256。與目前內容不符即視為過期。 |
| `locked` | `true` 時 Agent 不得修改此 scene（除非使用者明確要求）。使用者在 UI 手動核准後可設為 `true`。 |

### 4.2.1 共通規則（由 Schema 強制）

- **路徑**：一律使用正斜線的相對路徑，不得為絕對路徑、不得含 `..` 片段。scene.json 內的路徑相對於該 scene 目錄；以 `@/` 開頭表示相對於專案根目錄（如 `@/assets/logo.png`）。`video.project.json` 內的路徑相對於專案根目錄。唯一例外是 `project.sources.sourceCodePath`（唯讀輸入，可在專案外）。
- **擴充欄位**：Schema 不接受未定義的欄位，以免拼錯欄位名稱被默默忽略。使用者或第三方工具需要自訂欄位時，一律以 `x-` 開頭（可用於專案根、`project`、scene 根、`visual`），Agent 必須原樣保留。
- **寫入者**：`updatedBy` 為 `agent` · `user` · `mcp`（`companion` 為已移除的本機 Companion 所寫，Schema 仍接受以相容舊專案）。
- **Schema 無法表達、由 `validate.mjs` 檢查的規則**：scene id 與 dir 唯一且目錄存在；`format` 寬高與 `aspectRatio` 相符；各 scene.json 的 `id` 與 `video.project.json` 引用一致；解析後路徑不得跳出專案根目錄；狀態為 `rendered` / `approved` 時輸出檔存在且 `inputHash` 相符；`project.id` 為全 0 UUID 時視為「範本尚未初始化」；專案沒有 `scripts/capture.mjs`（故事範本）時，`web-capture` / `screenshot` 類型的 scene 視為錯誤。
- Schema 原始檔位於產品 repo 的 `specs/`（`common` / `project` / `scene` 三個檔案），`specs/examples/` 內的有效與無效範例由 `pnpm run test:specs` 驗證。

### 4.3 `script.md`

旁白稿獨立成 Markdown，讓使用者可直接用編輯器或 UI 修改。純文字，一段即一句旁白；可用 `<!-- pause 0.5 -->` 插入停頓。

故事專案（§4.6）中，以 `【角色名】` 開頭的行由 `project.cast` 中同名的角色說，`tts` 改用該角色的 `provider` / `voice` 合成，字幕 cue 多一個 `speaker` 欄位；其餘行是旁白。

#### 4.3.1 字幕（視覺）與 TTS（聽覺）差異結構化規範

為解決多音字唸錯、英文縮寫念法與數字口語化問題，同時保證字幕畫面純淨無錯字，`script.md` 支援行內結構化標註語法：
`[畫面字幕文字](tts: 發音替換文字)`

差異呈現的四大結構化範疇：

| 範疇 | 結構化語法 | 旁白 (Narration) 應用重點 | 對白 (Dialogue) 應用重點 |
|---|---|---|---|
| **多音字 / 破音字** | `[漢字](tts: 同音替代字)` | 確保地名、專有名詞標準讀音（例：`[重慶](tts: 蟲慶)`） | 確保口語化用詞讀音（例：`到底[行不行](tts: 形不行)`） |
| **英文專有名詞與縮寫** | `[英文](tts: 拼讀或音譯)` | 區分逐字母唸或單字唸（例：`[API](tts: A-P-I)`、`[SaaS](tts: 薩斯)`） | 角色日常口語唸法（例：`這款 [App](tts: ㄟㄆ)`） |
| **數字、符號與年份** | `[數字符號](tts: 展開念法)` | 避免年代與數量混淆（例：`[2024](tts: 二零二四) 年`、`[$500](tts: 五百美元)`） | 角色自然數量口吻（例：`超過 [100%](tts: 百分之百)`） |
| **語氣、輕聲與方言** | `[標準字](tts: 擬真口音)` | 通常不使用，保持旁白端莊沉穩 | 表達童音、輕聲或猶豫（例：`真[的](tts: ㄉㄜ˙)嗎`、`我[不敢](tts: 不、不敢)`） |

- **字幕萃取**：取中括號 `[...]` 內的純淨正體字，寫入 `captions.json` 與 SRT 字幕檔。
- **TTS 萃取**：取 `(tts: ...)` 內的發音引導文字，結合 `tts.pronunciation` 字典送入語音合成引擎。


### 4.6 影片類型 `project.kind`

同一套協議、範本、渲染器與工作台支援兩種影片，以 `project.kind` 區分（預設 `product`，舊專案不需修改）：

| | `product`：產品介紹 | `story`：故事動畫 |
|---|---|---|
| Skill / 入口 | `product-video` / `/api/agent-guide.md` | `story-video` / `/api/story-guide.md` |
| `sources` 至少需要 | `productUrl`、`sourceCodePath`、`description` 之一 | `story` 或 `description` |
| 流程 | init → analyze → storyboard → build_scene → assemble | init → develop_story → design → storyboard → build_scene → assemble |
| 畫面 | 網頁錄影、截圖為主 | 每段都是 `motion-graphic` + 動畫模組（SVG） |
| 聲音 | 旁白一種聲音 | 旁白 + `project.cast[]` 每個角色各自的聲音 |

- `workflow.json` 的步驟以 `kinds` 標示只適用於哪些類型。
- 故事專案的角色美術放在 `assets/cast/<id>/`（一個 SVG 內以 `<g id>` 分出部件、`data-pivot` 標示支點，需要彎曲或擠壓的 `<path>` 以 `data-morph-<名稱>` 附上變形後的形狀），場景在 `assets/sets/`；動畫模組以範本的 `src/lib/rig.js` 擺姿勢，並把用到的共用檔列在 `visual.motion.uses`（資料夾以 `/` 結尾）。
- `inputHash` 另外涵蓋 `motion.uses` 的檔案，以及該 scene 中有說話的角色的 `cast` 設定（D22）。
- 動畫模組的 `setup(ctx)` 多收到 `cues`（含 `speaker` 的字幕時間軸）與 `cast`，讓說話的角色動嘴、做動作。
- **角色工坊 (Cast Studio)**：當 `project.kind === 'story'` 時，前端工作台提供專屬角色管理視圖：
  1. **角色名冊**：視覺化管理 `project.cast[]`（ID、名稱、外觀與性格描述），支援原子更新專案設定。
  2. **聲音工坊 (Voice Studio)**：支援三大配音方式：
     - *線上錄音克隆*：使用瀏覽器原生 `MediaRecorder` 錄音 3-5 秒，轉為標準 16kHz PCM WAV 直接寫入 `@/assets/cast/<id>/voice-sample.wav`，供 CosyVoice 3 零樣本克隆。
     - *CosyVoice 3 語氣指令*：基礎發音人結合自然語言情緒／風格／方言指令（如 `中文男 <用熱情開朗的大學生語氣>`、`<用台語說>`）。
     - *Edge-TTS 標準語音*：免 GPU 的微軟神經網路發音人選單。
     - *試聽機制*：透過 `brief/voices/<id>.mp3` 即時在網頁端試聽驗收。
  3. **視覺與美術工坊 (Art Studio)**：
     - *參考概念圖*：支援拖曳上傳圖片至 `assets/cast/<id>/reference.png` 作為視覺設定基準。
     - *向量骨骼預覽*：即時渲染 `assets/cast/<id>/<id>.svg`，並自動檢測 `<g id>` 與 `data-pivot` 骨骼部件（head, body, arm, leg, 表情）。
     - *AI 繪圖提示詞*：一鍵複製格式化 Prompt 傳遞給 Coding Agent 繪製符合骨骼規格的向量組件。

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
initialized → analyzed → [designed] → script_generated → producing → ready_to_assemble → completed
                                                   ↘            ↘
                                                    failed ←─────┘
```

| 值 | 意義 |
|---|---|
| `initialized` | 專案骨架已建立 |
| `analyzed` | product：`brief/product-brief.md`（及可選 `style.json`）已產生；story：`brief/story.md` 已定稿 |
| `designed` | 只有 story：`brief/design.md`、角色與場景 SVG、`project.cast` 的聲音已確認 |
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

路徑皆相對於網站根網址 `SITE_URL`（部署於子路徑，見 §12.1），例如 `https://aoa.tigernaxo.com/api/video/index.json`。

```text
GET /api/video/index.json                          # 入口：列出所有資源（絕對網址）、版本與 zip 雜湊
GET /api/video/agent-guide.md                      # Agent 必讀總綱（= Skill 的 SKILL.md + 安裝與資源說明）
GET /api/video/workflow.json                       # 機器可讀工作流程（§6）
GET /api/video/schemas/{common,project,scene,workflow}.schema.json
GET /api/video/prompts/analyze-product.md
GET /api/video/prompts/analyze-style.md
GET /api/video/prompts/storyboard.md
GET /api/video/prompts/scene-script.md
GET /api/video/rules/script.md                     # 文案規則（字數/秒、語氣、禁用詞）
GET /api/video/rules/visual.md                     # 視覺規則（安全邊距、字級、配色）
GET /api/video/skills/product-video.zip            # 完整 Skill 套件（根目錄為 product-video/）
GET /api/video/skills/product-video/*.md           # Skill 各文件（未安裝 Skill 的 Agent 線上讀取）
GET /api/video/templates/product-video.zip         # 專案範本（含 schemas/ 與 .claude/commands/）
GET /api/video/templates/product-video/manifest.json  # 範本 zip 與每個檔案的 SHA-256
```

既有專案每次被 Agent 打開時，先以 manifest 的逐檔 SHA-256 比對本機範本檔；有差異就下載、驗證範本 zip，覆蓋除 `video.project.json` 以外的範本檔（影片內容不在範本內），必要時 `pnpm install`，`specVersion` 不同時把專案資料遷移到新 Schema（SKILL §1「既有專案：同步範本」）。網頁開啟既有專案時做同樣的比對；有差異就顯示「更新專案工具」，按下後以同一份 zip 覆蓋不同的範本檔、移除新版 Schema 已不認得的欄位並更新 `specVersion`（只在移除後即通過驗證時才寫回），`package.json` 有變時提示讓 Agent 執行 `pnpm install`。

`/api/video/index.json`（節錄）：

```json
{
  "specVersion": "1.0.0",
  "siteUrl": "https://aoa.tigernaxo.com",
  "workbench": "https://aoa.tigernaxo.com/video/",
  "entry": "https://aoa.tigernaxo.com/api/video/agent-guide.md",
  "workflow": "https://aoa.tigernaxo.com/api/video/workflow.json",
  "schemas": { "project": "…/api/video/schemas/project.schema.json", "scene": "…/api/video/schemas/scene.schema.json" },
  "prompts": { "storyboard": "…/api/video/prompts/storyboard.md" },
  "rules": { "script": "…/api/video/rules/script.md" },
  "skill": "…/api/video/skills/product-video.zip",
  "template": "…/api/video/templates/product-video.zip",
  "templateManifest": "…/api/video/templates/product-video/manifest.json",
  "checksums": { "skill": "<sha256>", "template": "<sha256>" }
}
```

- 網址一律為絕對網址：網站部署在子路徑時，以 `/` 開頭的路徑會指到網域根目錄而失效。
- **單一來源**：`prompts/*`、`rules/*`、`agent-guide.md` 由各影片 app 的 `tools/build-api.mjs`（共用 `packages/video-core/tools/build-video-api.mjs`）從 Skill 文件以 `<a id>` 錨點擷取產生，不另外手寫；Skill 是唯一需要維護的文字。對應：`analyze-product` ← `workflow.md#analyze`、`analyze-style` ← `workflow.md#style`、`storyboard` ← `script-guide.md`、`scene-script` ← `script-guide.md#narration` + `#visual`、`rules/script` ← `script-guide.md#narration`、`rules/visual` ← `script-guide.md#visual` + `rendering-guide.md#visual-types` + `#elements`。
- zip 以固定時間戳建立，相同輸入產生相同位元組與雜湊。

版本規則：`specVersion` 採 SemVer。Major 版變更需提供遷移說明；本機專案的 `specVersion` 與網站不同 major 時，Agent 必須先提示使用者。

---

## 6. 工作流程

### 6.1 `workflow.json`

原始檔：產品 repo 的 `specs/workflow.json`（格式由 `specs/workflow.schema.json` 定義），發佈為 `/api/workflow.json`，並隨範本同步到專案的 `schemas/workflow.json`。

| 區塊 | 內容 |
|---|---|
| `gates` | 執行特定腳本前必須取得的使用者確認：`onlineTtsConsent`（擋 `tts`）、`domEditConsent`（scene 錄製時以 `script` 動作改寫頁面，例如報表資料太少時填入示意資料；擋該 scene 的 `capture`）、`productLogin`（產品要登入才看得到：`sources.requiresLogin`，或擷取時被導到登入頁；擋 `capture`，由使用者以 `pnpm run login` 自己登入，見 §11）。含說明內容、記錄欄位與拒絕時的處理 |
| `steps` | 主流程 `init` → `analyze` → `storyboard` → `build_scene` → `assemble`。每步定義 `command`、`scope`（project / scene）、`requires`（允許的 project / scene 狀態、gates）、`skipWhen`、`reads` / `writes`、有序的 `actions`（含狀態轉換）、`checkpoint`、`guide`（Skill 章節） |
| `operations` | 隨時可執行的操作：`sync`、`status`、`approve`、`translate` |
| `derivedProjectStatus` | 由 scene 狀態推導 `project.status` 的規則；`state.mjs` 每次寫入 scene 後重算 |

`pnpm run test:specs` 會驗證 workflow.json 符合 schema，並交叉檢查所有狀態轉換值皆為合法的 project / scene 狀態、引用的 gate 皆已定義、指令不重複。

### 6.2 步驟細節

**Step 1 — init**
1. 下載並解壓專案範本；填入 `video.project.json` 的 `sources` 與 `format`。
2. 由 Agent 執行 `pnpm install`（含 FFmpeg）；檢查 Node.js、pnpm、瀏覽器（Playwright Chromium 或系統 Chrome / Edge）、TTS 工具。缺少時用白話說明並取得同意，同意後可代為執行一般安裝（如 `winget` / `brew`），不使用系統管理員權限；無法代為安裝時給點擊式步驟。
3. 確認 TTS 連網同意（§7.4），寫入 `project.tts.consent`。
4. 同步 `schemas/`，執行 `pnpm run validate`。

**Step 2 — analyze**
1. 讀取產品網址（Playwright 擷取頁面文字與主要截圖）、本機原始碼（README、package.json、路由/頁面）、使用者描述。
2. 產出 `brief/product-brief.md`：產品一句話、目標受眾、痛點、核心功能（≤5）、USP、品牌色與字型、CTA。
3. （可選）若有 `referenceVideoUrl` 或使用者提供的參考影片檔：以 FFmpeg 抽取關鍵影格，分析節奏、色調、字幕樣式、轉場，寫入 `brief/style.json`。無法取得影片時跳過並註明，不臆測。
4. **Checkpoint**：先摘要產品重點，再一次一題與使用者確認觀看對象、影片風格（`project.style`）、長度（依內容提出 2–3 個選項與理由；使用者給範圍時取範圍內一個建議值寫入 `targetDurationSec`，原話記在 brief，schema 不另設範圍欄位以維持相容），已表態或沿用預設的項目只需一句話確認；確認後寫入 `targetAudience`、`style`、`format.targetDurationSec`。

**Step 3 — storyboard**
1. 依 brief 規劃 **3–8 個 scene**，建議骨架：Hook → Problem → Solution → Feature(s) → Benefit → CTA。
2. 每個 scene 產生 `scene.json` + `script.md`；總旁白估算時長需接近 `targetDurationSec`（中文約 4 字/秒、英文約 2.5 字/秒）。
3. 執行 `pnpm run validate`。
4. **Checkpoint**：停下來請使用者審閱分鏡與完整旁白稿（在終端或 UI），確認後才進入 Step 4（產生語音與渲染）。

**Step 4 — build_scene（逐 scene、可單獨重跑）**
1. 若 `locked: true` 或狀態為 `rendered/approved` 且未過期 → 跳過。
2. **TTS**：`pnpm run tts <id>` → `assets/narration.mp3`；以 `ffprobe` 取得音長，決定 `durationSec`（若未強制指定）。
3. **Capture**：依 `visual.type` 執行 `pnpm run capture <id>`（Playwright 截圖或錄製網頁操作）→ `assets/`。
4. 狀態設為 `assets_ready`。
5. **Render**：`pnpm run render:scene <id>` → `output/scene.mp4`（多個 scene 可一次傳入，平行渲染，見 §7.6）；寫入 `render.inputHash`、`renderedAt`，狀態 `rendered`。
6. 執行 `pnpm run validate`。
7. **Checkpoint**：回報該 scene 預覽路徑，使用者可要求修改；修改只重跑該 scene。

**Step 5 — assemble**
1. 檢查所有 scene 為 `rendered` 或 `approved` 且 `inputHash` 相符；否則列出需重做的 scene 並停止。
2. 依 `video.project.json.scenes` 順序以 FFmpeg 串接：有 `transitionIn` 的 scene 以 `xfade` 與前一個 scene 重疊 0.5 秒（不超過兩者各自長度的一半，並對齊整幀），聲音同時以 `acrossfade` 交叉淡化；`none` 直接串接。每個 scene 的聲音先補齊或截到其視訊長度，避免音畫漂移。
   - 各 scene 視訊編碼參數相同（codec、profile、解析度、幀率、色彩標記、SPS/PPS）時，視訊不整支重新編碼：scene 在關鍵幀處以 segment muxer 直接切開複製，只有轉場前後到最近關鍵幀之間的片段以相同參數重新編碼（含 xfade），最後以 concat demuxer 串接（`-c:v copy`，每段依其幀數定位）；聲音另外整條混音與編碼。render-scene 在距頭尾各 0.5 秒處強制 IDR 關鍵幀，所以重新編碼的長度通常剛好等於轉場長度。編碼參數不同、或重新編碼的片段與 scene 參數不符時，退回整支重新編碼。
3. **字幕**：合併各 scene 的 `assets/captions.json`（依 scene 起始時間位移）為 `output/final.srt`；`captions.mode` 為 `burn` 時字幕已在 scene 渲染時燒入（§7.5）。
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

**重新規劃分鏡**：專案已有 scene（含 `completed`）時仍可執行 `/video-storyboard`，改為修訂現有分鏡：先列出每段保留／修改／新增／移除並經使用者確認，才寫入檔案；保留的 scene 沿用原 id 與目錄（目錄路徑算在 `inputHash` 內）。以 patch 修改 `scenes` 陣列時，`state.mjs` 依 `derivedProjectStatus` 重算 project 狀態，且 scene 清單變更後最多為 `ready_to_assemble`（`final.mp4` 已不符）。之後以 sync 只重做修改與新增的 scene 並重新合成。

---

## 7. 本機工具鏈

### 7.1 依賴

| 用途 | 工具 | 備註 |
|---|---|---|
| 執行環境 | Node.js ≥ 24、pnpm | 目前的 Active LTS；Node 20 已於 2026-04 停止維護，版本由 nvm 依 `.nvmrc` 管理 |
| 網頁擷取 | Playwright | 截圖、錄製操作、抓取產品頁內容。瀏覽器依序使用：Playwright 內建 Chromium → 系統 Chrome → 系統 Edge（可用 `VIDEO_AGENT_BROWSER_CHANNEL` 指定），Windows 使用者無需另外下載 |
| 語音合成 | 可替換 provider，預設 `edge-tts` | 見 §7.4 |
| 影片合成 | Playwright 逐幀截圖 + FFmpeg | 不需額外授權；見 §7.6 |
| 配樂生成 | FluidSynth + SoundFont（建議）或 WebAudio（免安裝） | 選用；FluidSynth 與音色庫由 `pnpm run music:setup` 裝在每台機器共用的 `~/.aoa/`；見 §7.5 |
| 轉檔/合併 | FFmpeg / ffprobe | ffmpeg 依序使用：環境變數 `VIDEO_AGENT_FFMPEG` → 系統 PATH → 套件內建（`ffmpeg-static`）。ffprobe 依序使用：`VIDEO_AGENT_FFPROBE` → 套件內建（`ffprobe-static`）→ 系統 PATH，因為不同版本量出的 MP3 長度不同（新版扣除編碼器補白），固定版本才能讓各平台 scene 長度一致。使用者無需預先安裝 |

### 7.2 `package.json` scripts

```json
{
  "name": "video-project",
  "private": true,
  "type": "module",
  "scripts": {
    "validate":     "node scripts/validate.mjs",
    "tts":          "node scripts/tts.mjs",
    "capture":      "node scripts/capture.mjs",
    "login":        "node scripts/login.mjs",
    "render:scene": "node scripts/render-scene.mjs",
    "assemble":     "node scripts/assemble.mjs",
    "music":        "node scripts/music.mjs",
    "music:setup":  "node scripts/music-setup.mjs",
    "state":        "node scripts/state.mjs",
    "status":       "node scripts/validate.mjs --report"
  },
  "dependencies": {
    "playwright": "^1", "ajv": "^8"
  }
}
```

### 7.3 腳本職責

| 腳本 | 輸入 | 輸出 | 可修改 JSON？ |
|---|---|---|---|
| `validate.mjs` | 全專案 | 退出碼（非 0 = 失敗）；`--report` 輸出各 scene 狀態、是否過期與建議的下一個指令；`--json` 輸出機器可讀結果（供 Web UI / MCP）。輸入已變更（`inputHash` 不符）只是警告，不算錯誤 | 否 |
| `tts.mjs <id>` | script.md、voice 設定 | `assets/narration.mp3`、`assets/captions.json`；`--list-voices` 列出目前 provider 的聲音 | 否 |
| `capture.mjs <id>` | `visual.capture` | `assets/capture.*`；`--url <網址> --out <目錄>` 模式供 analyze 擷取產品頁（整頁 + 首屏截圖、頁面文字、可 highlight 的元素與 selector）；`highlight` 一次框一個元素，找不到時警告並略過；`script` 需 `domEditConsent`。有保存的登入時以它開頁；`sources.requiresLogin` 卻沒有登入、或開頁被導到登入頁時以 `gate productLogin` 失敗 | 否 |
| `login.mjs [url]` | `sources.productUrl` | 打開**可見**的瀏覽器視窗（優先用已安裝的 Chrome / Edge），使用者自己登入後關閉；登入狀態（cookie、localStorage、IndexedDB）存到 `.auth/login.json`（列入 `.gitignore`，Agent 不讀）。只在看過登入頁、又離開登入頁後才算登入成功，視窗下方的提示隨之由藍轉綠。`--clear` 刪除 | 否 |
| `render-scene.mjs <id>` | scene 全部輸入 | `output/scene.mp4`（H.264 + AAC 48 kHz 立體聲、BT.709，無旁白時為靜音音軌）；失敗時保留既有輸出 | 否 |
| `state.mjs <target> <patch>` | Agent 提供的修改 | 更新後的 JSON（鎖檔 + 原子寫入 + validate，§10.2） | **是**（唯一例外，由 Agent 呼叫） |
| `assemble.mjs` | 所有 scene 輸出、`audio`、`captions` | `output/final.mp4`、`output/final.srt`（`captions.mode` 為 `none` 時不產生）。有 scene 未 `rendered`/`approved`、缺輸出或 `inputHash` 不符時列出並失敗；失敗時保留既有輸出。視訊直接複製，只重新編碼轉場片段；聲音（含 BGM）整條混音編碼。scene 編碼參數不一致時整支重新編碼 | 否 |
| `music.mjs` | `project.audio.music`（段落對齊 scene 時另讀各 scene 輸出的長度） | `assets/music/bgm.wav`、`song.mid`、`bgm.json`（`--stems` 另存 `stems/*.wav`）。樂譜、引擎、音色庫與對齊結果都沒變時略過（`--force` 重做）。不改 `audio.bgm`，只印出設定它的 `state` 指令 | 否 |
| `music-setup.mjs` | — | FluidSynth（Windows 下載官方版；macOS／Linux 請使用者以套件管理員安裝）與音色庫，裝在 `~/.aoa/`；`--with <名稱>` 加裝其他音色庫，`--list` 列出可裝的音色庫與授權 | 否 |

`state.mjs` 介面（Agent 使用方式見範本 `AGENTS.md` §4）：

| 用法 | 效果 |
|---|---|
| `pnpm run state <project\|scene-id> --status <status>` | 設定狀態（檢查轉換是否合法） |
| `pnpm run state <scene-id> --rendered` | 計算 `inputHash`，寫入 `render`（含 `renderer` 與以 ffprobe 量得的 `actualDurationSec`；輸出檔無法讀取則拒絕），狀態 `rendered`，`attempts` 歸零，清除 `error` |
| `pnpm run state <scene-id> --failed <step> "<message>" [--hint "<hint>"]` | 狀態 `failed`，寫入 `error`，`attempts` + 1 |
| `pnpm run state <target> --patch-file <path>` | 套用 JSON Patch（RFC 6902）。不用 JSON Merge Patch，因為它以 `null` 表示刪除，無法把 `durationSec` 設為 `null` |

所有用法皆自動更新 `updatedAt` / `updatedBy`，寫入前驗證，失敗則不寫入。新建 `scene.json` 是唯一可直接寫檔的情況（尚無其他寫入者），寫完須執行 `pnpm run validate`。

**產出類腳本只產生檔案，不改 JSON；狀態一律由 Agent 決定並經 `state.mjs` 寫回**，確保狀態寫入集中、可追蹤且不互相覆蓋。

`validate.mjs` 檢查項目：JSON Schema 合法；`scenes` id 唯一、`dir` 存在；`render.outputFile` 等路徑位於專案內且檔案存在（當狀態聲稱已渲染時）；`inputHash` 一致性；所有路徑不得跳出專案根目錄。

### 7.4 TTS Provider

`scripts/tts.mjs` 依 `narration.provider`（scene 層）→ `project.tts.provider`（專案層）決定實作，介面固定為「script.md → `assets/narration.mp3`」。

| provider | 說明 | 連網 | 備註 |
|---|---|---|---|
| `edge-tts`（預設） | 免費、繁中品質佳 | 是，文字送至 Microsoft | 非官方介面，可能失效；失敗時提示改用其他 provider |
| `azure` / `openai` / `elevenlabs` | 使用者自帶 API key | 是 | key 只放 `.env`，Agent 不讀取、不寫入 JSON。**目前範本尚未實作**，執行時提示改用其他 provider |
| `piper` | 完全離線 | 否 | 無 zh-TW 聲音，適合英文或隱私優先 |
| `system` | Windows SAPI / macOS `say` / Linux `espeak-ng` | 否 | 跨平台聲音不一致；`voice` 可省略（使用系統預設聲音） |
| `cosyvoice3`（或 `cosyvoice`） | 本地 CosyVoice 3 服務 / 語音克隆 | 預設否（本地） | 呼叫本地 `COSYVOICE_URL`（預設 `http://127.0.0.1:50000/api/tts`）；若指向遠端端點則需 `onlineTts` 同意；支援預設發音人或參考音檔 |
| `manual` | 使用者自行錄音 | 否 | 放入 `assets/narration.mp3` 即跳過合成，只以 ffprobe 取音長 |

規則：

- 使用任何連網 provider 前，Agent 必須告知「旁白文字將送至 <服務>」並取得同意，記錄於 `project.tts.consent`；未同意則停下請使用者選擇離線 provider 或 `manual`。
- provider 失敗視同 scene 失敗（§8.1 規則 10），不自動切換到其他連網 provider。
- 實作：`<!-- pause -->` 之間的文字區塊各自合成，停頓以靜音補上，全部轉為相同格式後串接成 `narration.mp3`。edge-tts 以 `msedge-tts` 套件實作，並使用其詞邊界時間產生字幕。
- 環境變數 `VIDEO_AGENT_FAKE_TTS=1` 以離線的測試音（每字 0.25 秒）取代實際合成，供自動化測試與無網路試跑使用。

### 7.5 字幕與 BGM

**字幕**

- `tts.mjs` 同時輸出 `assets/captions.json`：`[{ "start": 0.0, "end": 1.8, "text": "…" }]`（scene 內相對秒數）。
  - `edge-tts`：使用其回傳的字詞邊界時間，精準對齊。
  - 其他 provider / `manual`：依句子（句號、問號、換行）切分，按字數比例分配音長。
- 單條字幕上限：中文 16 字、英文 42 字元，超過則再切。
- `captions.mode`：`srt`（預設，只輸出 `output/final.srt`）｜`burn`（燒入並同時輸出 srt）｜`none`。
- **燒入在 scene 渲染時進行**（`render-scene.mjs`），assemble 不燒字幕，視訊可直接串接。代價：`captions.mode` 為 `burn` 時，`captions` 設定納入每個 scene 的 `inputHash`，修改字幕樣式會使所有 scene 過期、需重新渲染；`srt` / `none` 時不納入，只需重跑 assemble。
- 燒入的字幕只截到該 scene 結尾；有轉場時，前一段結尾的字幕會隨畫面一起淡出（`final.srt` 仍截在下一段起點）。
- 合併：各 scene 的字幕依該 scene 在成片中的起點位移；跨過下一個 scene 起點（含轉場重疊）的部分截斷。
- 燒入實作：產生 ASS 字幕（`PlayResX/Y` = 輸出解析度，故 `style.fontSize` 以成片像素計，省略時為高度 × 48/1080），在 scene 編碼時以 FFmpeg `ass` 濾鏡（libass，`fontsdir` 指向 `src/fonts/`）繪製；白字深色描邊，`position` 對應下／中／上。字型先找 `src/fonts/`，找不到才用系統字型（各平台結果可能不同）。libass 不支援 woff2 與可變字型，`src/fonts/` 只放靜態字重的 OTF／TTF。內建 FFmpeg 的 libass 不支援 Unicode 斷行，長字幕依賴上述單條字數上限。

**BGM**

- 來源二擇一：使用者自備音檔放入 `assets/`，或由 `pnpm run music` 生成（見下方「生成配樂」）；都以 `audio.bgm` 指定。網站不提供音樂庫，也不使用 AI 音樂模型（避免音樂授權責任）。
- assemble 時混音：BGM 循環播放至成片長度，`bgmVolume` 為基準音量，`ducking: true` 時以旁白為 sidechain 經 `sidechaincompress` 自動壓低，影片頭尾 1 秒淡入淡出（成片短於 2 秒時縮短）。`audio.bgm` 檔案不存在時警告並略過。
- BGM 同樣只在 assemble 處理，不影響 scene 的 `inputHash`。

**生成配樂**（D23）

不使用音樂模型：Agent 依影片風格寫一份樂譜（`project.audio.music`：速度、調性、段落的和弦與能量），腳本依規則編曲、再以本機合成器演奏，輸出 `assets/music/bgm.wav`，再把 `audio.bgm` 設為它。

- **編曲**（`scripts/lib/music.mjs`，純函式）：`style` 曲風模板（pop、warm、fairytale、suspense、anthem、lofi）決定配器、鋼琴型態（節奏和弦、分解和弦、琶音、重音）、貝斯型態、中高能量的鼓組格點、旋律節奏型組合與搖擺；每種型態有 2–3 種變體，每個段落依 `seed` 各自挑選且不與前一段相同，每第四小節鋼琴換成另一種型態。段落的 `texture`（full、piano、strings、breakdown、build）決定由哪些樂器演奏，無鼓段落進入有鼓段落時自動加小鼓過門與鈸。`energy` 決定演奏多少：`<0.3` 只有鋪底，`0.3–0.6` 加入鋼琴、貝斯與中能量鼓組，`≥0.6` 高能量鼓組與旋律，`≥0.85` 旋律移高。和弦以最少移動的轉位銜接；貝斯在換和弦前以經過音接近下一個根音；旋律兩小節為一個半句，問句結束在三音或五音、答句（及段落結尾）回到根音，音高沿樂句弧線起伏。進入能量較高的段落前漸強、過門並在新段落加鈸，`ending` 段落逐小節漸弱並延長主和弦收尾。所有隨機（旋律選擇、力度與時間的微小變化）都來自 `seed`，同一份樂譜每次輸出相同。
- **自寫旋律**：段落的 `melody` 是 Agent 自己作的旋律（文字記譜，`C5/4 E5/8 r/8 | …`），取代自動旋律、不論 energy 都演奏，比段落短時循環；伴奏與鼓仍由曲風模板產生。腳本檢查每小節剛好 4 拍、音域 G3–G6，不合格就以錯誤指出段落、小節與記號；第 1、3 拍上與和弦相差半音的長音只警告。曲風預設沒有旋律（`suspense`）而 Agent 寫了旋律時，以長笛演奏。
- **長度**：段落以 `bars` 指定小節數，或以 `scenes` 對齊這些 scene 在成片中的範圍（需全部已渲染；以 assemble 相同的 timeline 計算）。對齊時各段落終點取「從影片開頭起最接近的小節線」，誤差不會累積。音樂比影片短時印出警告（assemble 仍會循環）。
- **引擎**（`music.engine`，預設 `auto`）：
  - `fluidsynth`（建議）：樂譜轉為 General MIDI（`assets/music/song.mid`，可用 MuseScore 等軟體打開修改），以 FluidSynth 加 SoundFont 演奏真實樂器取樣。**分軌渲染**：lead、keys、pad、bass、drums 各自轉成單軌 MIDI、各自用 `music.soundfonts` 指定的音色庫渲染，再依 `music.mix`（dB）混音；指定的音色庫未安裝時改用預設並警告。
  - `webaudio`：在 headless Chromium 的 `OfflineAudioContext` 以振盪器、濾波器、噪音鼓與程式產生的殘響合成，不需安裝任何東西，音色偏電子。
  - `auto`：已安裝 FluidSynth 與預設音色庫時用 `fluidsynth`，否則用 `webaudio` 並提示可執行 `pnpm run music:setup`。
- **成品**：裁到樂譜長度、結尾 0.3 秒淡出，以 `loudnorm` 統一到 -18 LUFS，使兩種引擎在旁白下的音量相同，`bgmVolume` 意義一致。`bgm.json` 記錄引擎、各聲部實際使用的音色庫、小節數與長度。
- **安裝**（`pnpm run music:setup`）：FluidSynth 與音色庫整台機器只裝一份，放在 `~/.aoa/fluidsynth/`、`~/.aoa/soundfonts/`（`AOA_HOME` 可改位置），所有專案共用；下載前 Agent 須取得使用者同意（範本 AGENTS.md 規則 11）。只收錄可用於商業作品的音色庫：

  | 名稱 | 大小 | 授權 | 用途 |
  |---|---|---|---|
  | `GeneralUser-GS.sf2`（預設） | 32 MB | GeneralUser GS License v2.0 | 全部聲部 |
  | `MuseScore_General.sf3` | 40 MB | MIT | 全部聲部 |
  | `UprightPianoKW.sf2` | 29 MB | CC0 | 只有鋼琴（keys） |

- 環境變數 `VIDEO_AGENT_FAKE_MUSIC=1` 以測試音取代實際演奏，供自動化測試使用。

### 7.6 渲染器

以 Playwright（Apache-2.0）逐幀截圖、FFmpeg 編碼，不需額外授權（`scripts/render-scene.mjs`）：

- **Render plan**：`scripts/lib/scene-plan.mjs` 將 scene.json + `project.format` 轉為 plan（時長、幀數、背景層、疊加元素、旁白）。渲染器只畫 plan；版面、動畫與配色由 `src/lib/motion.js` 的純函式定義。
- **影片素材正規化**：所有影片層（錄影、`user-asset` 影片、影片元素）先以 FFmpeg 轉為專案 fps、依 trim 裁切、補到精確幀數（較短時停在最後一格），再交給渲染器。素材原聲不使用。
- **素材存取**：渲染期間在 `127.0.0.1` 隨機埠啟動唯讀靜態伺服器，只提供專案根目錄內的檔案（支援 Range）。不使用 `file://`。
- **字型**：畫面與燒入字幕只使用 `src/fonts/` 內附的字型（Noto Sans TC Bold、JetBrains Mono），不依賴系統字型，因此 Windows、macOS、Linux 輸出相同。
- 暫存檔放在 `.tmp/render-<id>/`，結束即刪除。輸出先寫到 `*.partial.mp4`，成功後才替換 `output/scene.mp4`。
- scene 間轉場（`transitionIn`）、`final.srt`、BGM 不在 scene 渲染中處理，由 `assemble.mjs` 負責；`captions.mode: burn` 的字幕在 scene 渲染時燒入（§7.5）。
- **關鍵幀**：編碼時在距頭尾各 0.5 秒（`TRANSITION_SEC`）處強制 IDR 關鍵幀，讓 assemble 只需重新編碼轉場片段。
- **平行渲染**：`render:scene` 一次傳入多個 id 時，各 scene 在獨立程序中平行渲染（`--jobs N`，預設為 CPU 核心數的一半，且每個約保留 1 GB 可用記憶體）。單一 scene 失敗不影響其他 scene；最後列出成功與失敗的 id，有失敗時退出碼為 1。單一 scene 內也以多個瀏覽器分攤影格（`--pages N`，每個瀏覽器輪流負責第 k、k+N、… 幀，依序交給 FFmpeg）；預設為上述預算除以同時渲染的 scene 數，最多 4 個、每秒影片至多 1 個。因畫面只由 `t` 決定，結果與單一瀏覽器逐幀相同。
- `src/` 不納入 `inputHash`：修改外觀不會自動使既有 scene 過期，需由 Agent 經使用者同意後將受影響的 scene 設為 `stale`。

實作要求：

- 每個 scene 渲染時產生暫存頁 `.tmp/render-<id>/scene.html`（內嵌 plan，載入 `src/html/player.js`），所有畫面由單一時間變數 `t` 驅動（`window.__seek(t)`）。
- **逐幀截圖**：依 `fps` 逐幀呼叫 `__seek(frame / fps)`，等待所有圖片解碼後截圖，以 PNG 串流交給 FFmpeg 編碼（BT.709）並混入旁白。**不得**使用 Playwright 內建 `recordVideo`（webm、幀率不穩，無法確定性重現）。
- 影片層在頁面中以預先抽出的 JPEG 影格呈現，而非 `<video>` 定位，確保每幀確定且不受瀏覽器影片解碼器影響。
- scene 間轉場由 `assemble.mjs` 以 FFmpeg `xfade` 實作。

---

## 8. Agent 整合

### 8.1 Agent 硬性規則（寫入 `AGENTS.md`）

1. 開始前先讀取 `/api/video/agent-guide.md` 與 `/api/video/workflow.json`（或本機 Skill）。
2. 依步驟執行，不跳步；到 checkpoint 必須停下等待使用者確認。
3. 所有 JSON 必須符合 Schema；每次寫入後執行 `pnpm run validate`。
4. 每個 scene 獨立產生、獨立渲染；修改只重做受影響的 scene。
5. 不修改 `locked: true` 或 `approved` 的 scene，除非使用者明確要求。
6. 不覆蓋使用者手動修改的內容；原樣保留 `x-` 開頭的擴充欄位（§4.2.1）。
7. 寫入 JSON 前先重新讀取檔案（UI 可能已修改），並更新 `updatedAt`、`updatedBy: "agent"`；遵守 §10.2 寫入協定（鎖檔 + 原子寫入）。
8. 生成素材只放在 `assets/`、`scenes/*/assets/`；輸出只放在 `output/`、`scenes/*/output/`。
9. 不上傳任何使用者資料到遠端；使用線上服務（如 edge-tts）前需告知。
10. 失敗時保留現場，不刪既有檔案；寫入 `status: failed` 與 `error`，同一 scene 自動重試不超過 2 次，之後回報使用者並說明重試方式。
11. 假設使用者不懂電腦操作：指令一律由 Agent 執行，不要求使用者開終端機或打指令；使用者以白話下指示，由 Agent 對應到工作流程步驟；需要使用者動手時給逐步、點擊式說明。

### 8.2 Skill 套件

```text
skills/product-video/
├── SKILL.md              # 觸發描述 + 工作流程總覽 + 規則
├── workflow.md
├── script-guide.md       # 文案寫法、各 purpose 的範例
├── rendering-guide.md    # 渲染與 capture 實作指引
└── schemas/ → 連結至 specs/
```

安裝方式：Agent 下載 `/api/skills/product-video.zip` 解壓到專案 `.claude/skills/`（或使用者層級 skills 目錄）。不安裝也可以：`/api/agent-guide.md` 與 `/api/skills/product-video/*.md` 提供相同內容供線上讀取。

故事影片的 Skill 在 `skills/story-video/`（`SKILL.md`、`story-guide.md`、`design-guide.md`），共用的步驟（找專案、同步範本、安裝、sync、translate）以 `../product-video/…` 連到產品 Skill。打包時 `rendering-guide.md` 一併複製進 `story-video.zip`，其他跨 Skill 連結改寫成產品 Skill 的網址；入口為 `/api/story-guide.md`。

- `SKILL.md` 負責「判斷目前狀態」與「初始化新專案」（此時專案內尚無 `AGENTS.md`）；初始化之後的規則以專案 `AGENTS.md` 為準，SKILL 不重複規則。
- `workflow.md`（各步驟做法，含 `brief/product-brief.md` 與 `brief/style.json` 的格式）、`script-guide.md`（分鏡與旁白寫作）以 `<a id="…">` 明確錨點供 `workflow.json` 的 `guide` 引用；`pnpm run test:specs` 檢查所有 Skill 內部連結與錨點。
- `SKILL.md` 中的網站網址寫成 `{{SITE_URL}}`，由 `build-api.mjs` 打包時替換。
- 範本 `video.project.json` 使用可通過 Schema 的佔位值（全 0 UUID、`updatedAt` 為 1970-01-01），init 時由 Agent 替換。
- 範本原始檔只有一份（`packages/video-core/template/`），打包時依影片類型（各 app 設定的 `kind`）裁切：只有一種影片用到的檔案登記在 `build-video-api.mjs` 的 `KIND_FILES`（產品：`scripts/capture.mjs`、`scripts/login.mjs`、`scripts/lib/login.mjs`；故事：`src/lib/rig.js`），另一種影片的範本不放這些檔案，`package.json` 中執行它們的指令也一併移除；`AGENTS.md`、`README.md` 中行尾標 `<!-- kind:product -->` / `<!-- kind:story -->` 的行只留在該類型的範本（標記本身不會打包）。`/api/video` 的舊範本兩種影片共用，保留全部檔案與每一行。新增只有一種影片會用到的範本檔時，要登記到 `KIND_FILES`；`tests/site/build.test.mjs` 檢查每個範本內的腳本只引用該範本有的檔案、文件只提到該範本有的指令。

### 8.3 Slash Commands（Claude Code）

範本 zip 內建 `.claude/commands/`（由 `build-api.mjs` 產生，見 §8.4）：

| 指令 | 對應步驟 |
|---|---|
| `/video-analyze` | analyze |
| `/video-storyboard` | storyboard |
| `/video-scene <id\|all>` | build_scene |
| `/video-sync` | 找出 stale scene 並重做 + assemble |
| `/video-assemble` | assemble |
| `/video-status` | 執行 `pnpm run status` 並摘要 |
| `/video-approve <id>` | 將 `rendered` 的 scene 設為 `approved` |
| `/video-translate <locale>` | 複製專案並翻譯為指定語言（§4.4） |

指令檔內容僅為薄包裝：指向 `workflow.json` 的對應步驟與 Skill 章節，避免規則重複維護。

**init 沒有專案指令**：init 執行時專案（及其 `.claude/commands/`）尚不存在，因此入口是：

- 已安裝 Skill：`/product-video <產品網址>`（Skill 本身即可作為指令）。
- 未安裝任何東西：`claude "讀取 <SITE_URL>/api/agent-guide.md，為 <產品網址> 製作產品介紹影片"`。任何能讀網址的 Agent 皆適用，Web UI 的啟動指令採用此形式。

### 8.4 其他 Agent 相容性

| 層 | 通用性 | 規則 |
|---|---|---|
| pnpm scripts、JSON Schema、檔案協議 | 完全通用 | 協議本體，任何能讀檔、執行指令的 Agent 皆可用 |
| `AGENTS.md` | 多數 Agent 原生讀取 | 規則的唯一來源；Claude Code 以 `CLAUDE.md` 的 `@AGENTS.md` 引入 |
| `SKILL.md` | Agent Skills 開放格式，支援度各異 | 內容保持中立 |
| MCP | 通用 | Phase 5 |
| Slash commands | 各家格式不同 | 只是便利入口，不承載規則 |

- **中立寫法**：`AGENTS.md`、`SKILL.md`、prompts 不得使用任何 Agent 專屬語法或工具名稱（如 `$ARGUMENTS`、特定工具名），一律以「執行 `pnpm run …`」「讀取檔案 …」描述動作。Agent 專屬內容只能放在其專屬目錄（如 `.claude/`）。
- **支援等級**：MVP 只正式支援並端到端測試 **Claude Code**。
- **擴充方式**：指令的單一來源是 `specs/workflow.json` 中帶 `command` 的 steps / operations（名稱、參數、標題、guide 已在其中，不另設 YAML），由 `build-api.mjs`（`apps/video/tools/lib/commands.mjs`）產生各 Agent 格式（目前 `.claude/commands/*.md`；之後 `.gemini/commands/*.toml`、`.cursor/commands/*.md` 等）。依序加入 Codex、Gemini CLI；每個 Agent 通過與 Claude Code 相同的端到端驗收（§13 Phase 3 完成標準）後，網站才標示為「支援」。

---

## 9. Web UI（Agent 工作台）

UI 的目的 **不是執行 AI**，而是將本機專案與 Agent 工作狀態視覺化，並提供便利的編輯入口。

### 9.1 本機檔案存取

- 使用 **File System Access API**：使用者在首頁步驟 1 點擊「選擇或建立資料夾」（新專案時在 Agent 開始之前，見 §9.2）→ `window.showDirectoryPicker({ mode: "readwrite" })` → 取得 `FileSystemDirectoryHandle`。
- **不使用** `fetch("file://…")`（瀏覽器禁止）。
- 支援瀏覽器：Chrome / Edge（桌面版）；需 HTTPS 或 localhost。Firefox / Safari 顯示唯讀提示或引導改用支援的瀏覽器。
- 最近開過的 directory handle（最多 6 個，連同專案名稱與類型）存入 IndexedDB。下次開啟時，上次的專案若瀏覽器仍保有權限（Chrome 中使用者選了「每次造訪時都允許」）就直接開啟；否則首頁列出「最近的專案」，點一下重新授權即可，免重新選擇。「關閉專案」只取消自動開啟，不從清單移除。
- **更新偵測**：每 2 秒輪詢 `video.project.json` 與各 `scene.json` 的 `lastModified`（File System Observer API 可用時優先使用）。
- **反向通知**：模式 A 下 UI 無法喚起 Agent，只能標記 `stale`，並給使用者一句可以直接貼給 Agent 的白話（句末括號附上 `/video-sync` 等指令供 Agent 對照）。畫面上不出現指令、`pnpm` 或終端機操作：使用者只需要會跟 Agent 說話。

### 9.2 畫面

1. **首頁導引**（目標使用者只會開 Agent 與網頁，沒有其他 IT 知識；不出現終端機操作）。先選資料夾，網頁從一開始就以 File System Access API 掌握專案資料夾：
   1. 準備資料夾：以 `showDirectoryPicker({ mode: "readwrite" })` 選擇或在對話框中新建一個空資料夾（只允許空資料夾，或只含 `video.start.json`、`video.activity.json`、`references/` 與系統隱藏檔；已有 `video.project.json` 則直接開啟工作台）。Handle 存入 IndexedDB。
   2. 產品資訊：產品網址、原始碼資料夾、產品說明，至少一項；填了網址時可勾「這個網站要登入才看得到」（不提供帳密欄位，勾選後說明 Agent 會開視窗讓使用者自己登入、建議用展示帳號）；輸入內容保存在 `localStorage`，並同步寫入專案資料夾的 `video.start.json`。原始碼資料夾以**完整路徑**為主：瀏覽器無法取得選取資料夾的完整路徑，因此由使用者貼上（頁面依作業系統說明如何複製路徑）；資料夾選擇器只用來讀取 `package.json` / README 帶入說明與網址，並記下 `sourceFolder`（名稱、`packageName`、`gitRemote`（去除帳密）、最上層 `entries`），沒填路徑時供 Agent 依名稱尋找並比對。
   3. 打開 Agent（沒有的話下載 Claude 桌面版並登入），開新對話（不必再選步驟 1 的資料夾，Agent 預設或任意資料夾都可以），貼上白話訊息：「請讀取 <SITE_URL>/api/agent-guide.md，依照裡面的步驟幫我製作產品介紹影片」＋「你的工作資料夾是我準備好的『X』，裡面的 video.start.json 記有產品資訊與識別碼 <id>；請找到它、把工作目錄切換過去，所有檔案都放在那裡」＋來源＋「我不熟悉電腦操作，指令請直接替我執行，需要我動手時請一步一步說明」。瀏覽器無法取得資料夾的完整路徑，所以由 Agent 從目前目錄往下、再到常見位置尋找 `id` 相符的 `video.start.json`，切換過去後 init（SKILL §1–2）。終端機指令（`claude "…"`）只收在「習慣使用終端機？」之下。
   4. 網頁輪詢該資料夾，顯示 `video.activity.json`（Agent 正在做什麼），`video.project.json` 一出現就自動切換到工作台。
   - 不支援 File System Access API 的瀏覽器跳過步驟 1：訊息不含資料夾，Agent 在工作資料夾中自建 `<產品>-video`，網頁不提供工作台。

   `video.start.json`（網頁寫、Agent 讀，init 後保留不再更新）：`id`（8 碼隨機識別碼，資料夾第一次準備時產生，之後沿用）、`productUrl`、`requiresLogin`、`sourceCodePath`、`sourceFolder`（`{ name, packageName, gitRemote, entries }` 或 `null`）、`description`、`updatedAt`。

   **參考資料 `references/`**（網頁寫、Agent 唯讀）：首頁步驟 2 與工作台的「參考資料」分頁可上傳文件、圖片或貼上文字（存成 `.md`），檔案複製到專案的 `references/`（檔名保留使用者的文字，衝突時加 `-2`），每份的用途寫在 `references/index.json`：`{ "files": [{ "name", "note", "addedAt" }] }`。資料夾中有參考資料時，啟動訊息加一行請 Agent 先讀；工作台新增後顯示一句「我在 references/ 新增了參考資料…」讓使用者交給 Agent。實作在 `packages/web-shared`（`references.ts`、`ReferencesPanel.vue`），三個工作台共用。

   `video.activity.json`（Agent 寫、網頁讀，格式見 `activity.schema.json`，不納入版本控制，不經過鎖）：`message`（一句白話）、`waitingForUser`、`step`、`scene`、`updatedAt`。Agent 在每個步驟或 scene 開始時、每次停下來等使用者回覆前覆寫它，專案建立前就開始寫。網頁不能叫醒 Agent，所以這是使用者在網頁上得知「該回對話了」的唯一管道；讀不到或不合格式時不顯示。
2. **Activity**：首頁步驟 4 與工作台頂端顯示 Agent 動態。`waitingForUser` 時醒目提示回到對話；工作中的訊息超過 10 分鐘未更新視為 Agent 已停下，只以灰字顯示為「最後的動態」。
3. **Workflow**：五步驟進度條，顯示目前 project 狀態與下一步建議指令。
4. **Scene Board**：scene 卡片看板（標題、purpose、時長、狀態徽章、縮圖；Agent 正在處理的 scene 標「製作中」），可拖曳排序。
5. **Scene Editor**：編輯 `script.md`、視覺描述、voice、強制時長；鎖定/核准按鈕；以 `<video>` 從 handle 讀 blob 預覽 `scene.mp4`。
6. **Final**：預覽 `final.mp4`，列出過期 scene。

### 9.3 UI 寫入規則

- 只能寫：`script.md`、`scene.json` 的可編輯欄位（`title`、`visual.description`、`narration.voice/speed`、`durationSec`、`locked`、`status: approved|stale`、新增或刪除尚未處理的 `feedback`）、`video.project.json.scenes` 的順序。
- **回饋（`feedback`）**：使用者在一段影片上點一下畫面、寫一句話，UI 存成一則意見（原話、時間點 `atSec`、畫面位置 `point`），不必用文字描述是哪一段、哪一秒、哪個位置。對 `rendered` / `approved` 的 scene 留意見時同時設為 `stale`，所以下一步一樣是 sync；鎖定的 scene 不能留意見。UI 只能刪除尚未處理的意見；Agent 處理後以 `pnpm run state` 填 `resolvedAt` 與 `reply`，意見保留作為紀錄。`feedback` 不納入 `inputHash`：意見本身不改變影片，Agent 依意見做的修改才會。
- 內容修改後，`rendered` / `approved` 的 scene 設為 `stale`（其他狀態維持原狀，Agent 產生時自然使用新內容）；`approved` / `stale` 只依 workflow.json 允許的轉換寫入（核准僅限 `rendered` 且未過期）。
- 排序修改只影響 assemble；專案為 `completed` 時改為 `ready_to_assemble`，因為 `final.mp4` 已不符合新順序。
- 寫入 scene 後依 workflow.json `derivedProjectStatus` 重算並寫回 `project.status`（與 `state.mjs` 相同規則，實作共用）。
- 寫入前：鎖檔 `.video-agent.lock` 存在且未逾時（30 秒）則不寫入，提示稍後再試；再比對檔案 `lastModified`，若 Agent 已在期間修改，提示衝突並重新載入，不盲目覆寫。寫入內容先以 Schema 驗證。
- 寫入時設 `updatedAt`、`updatedBy: "user"`；以 `createWritable()` 寫入（暫存後替換）。
- 有未儲存的編輯時，輪詢到的新內容不覆蓋表單，只更新比對基準。

### 9.4 技術選型

Vue 3 + Vite + TypeScript + Tailwind，純靜態部署（GitHub Pages，§12.1）。Schema 驗證使用與本機相同的 JSON Schema（Ajv，瀏覽器端執行）；TypeScript 型別由 `specs/*.schema.json` 以 json-schema-to-typescript 產生（`pnpm run gen:types` → `apps/video/src/types/protocol.ts`，CI 以 `--check` 確認未過期），不手寫，確保 UI 與協議同步。

實作要點（共用工作台 `packages/video-core/web/`，由 `apps/story/`、`apps/product/` 各自掛載）：

- **與本機腳本共用協議邏輯**：`packages/video-core/template/scripts/lib/core.mjs` 不依賴 Node 或 DOM，提供 inputHash 的內容序列（`hashParts`）、下一步建議（`suggestNext`）、狀態轉換檢查與 `derivedProjectStatus`。Node 端以串流 SHA-256、瀏覽器以 WebCrypto 計算，結果逐位元組相同，因此 UI 能正確顯示「渲染後內容已變更」。雜湊依檔案大小與修改時間快取，輪詢時不重讀影片素材。
- **輪詢**：每 2 秒取各檔（專案、scene、旁白稿、輸出、素材、鎖檔、final）的 `lastModified` 與大小組成指紋，變了才重新載入；分頁隱藏或寫入中時暫停。
- **畫面**：首頁（尚無專案）＝ 準備資料夾 + Source 啟動訊息產生器 + 等待 Agent 建立專案 + Guide API 連結；開啟後為 Workflow（五步驟進度、專案狀態、下一步要交給 Agent 的一句話與複製按鈕）、Scene Board（拖曳或上下按鈕排序）、Scene Editor、Final。窄螢幕單欄排列。
- **測試**：原生資料夾選擇器無法自動化，E2E 以 OPFS（`navigator.storage.getDirectory()`，同樣是 `FileSystemDirectoryHandle`）搭配 `window.__avp.open(handle)` 開啟；fixture 由本機腳本產生，驗證瀏覽器與 Node 的 inputHash 一致（`tests/web/ui.test.mjs`）。

---

## 10. MCP（Phase 5）

實作：MCP 為 `packages/video-agent/`（執行檔 `video-agent`；不發佈到 npm，`package.json` 設為 `private`，npm 上同名的 `video-agent` 是無關的套件，不要使用）。

| | Guide（網站內容的 MCP 包裝） | Project（本機專案） |
|---|---|---|
| Resources | `video://guide`、`video://workflow`、`video://schemas/{common,project,scene}`、`video://rules/{script,visual}`、`video://templates/product-introduction`（範本 manifest） | `video://project/current`（`pnpm run status` 的 JSON） |
| Prompts | `analyze`、`analyze-style`、`storyboard`、`scene-script`（參數 `id`） | — |
| Tools | — | `project_status`、`validate_project`、`create_project`、`create_scene`、`update_scene`、`update_project`、`render_scene`、`assemble_video` |

- **沒有獨立的 Cloud MCP 伺服器**：網站部署於 GitHub Pages，只能提供靜態檔，無法運行 MCP。Guide 類 resources / prompts 改由本機 `video-agent mcp` 提供，內容依序取自 `VIDEO_AGENT_GUIDE_DIR` → 套件打包時內附的 `guide/`（`prepack` 以 `build-api.mjs` 產生）→ repo 的 `dist/api` → 以 HTTP 讀取 `VIDEO_AGENT_SITE_URL`（預設本站）。內容與 `/api/*` 完全相同（D21）。
- **不含協議邏輯**：所有專案操作都執行專案自己的 `scripts/*.mjs`（重做流程與合成也由專案的 `scripts/lib/runner.mjs` 執行），行為與專案的範本版本一致；JSON 只經 `state.mjs` 寫入，`updatedBy` 為 `mcp`。
- `create_project`：下載範本並以 manifest 的 SHA-256 驗證後解壓到空目錄，填入 `project.id`（UUID v4）、名稱、來源、語言；之後仍須 `pnpm install` 並經使用者確認後以 `update_project` 記錄 gates。
- `create_scene`：寫入新的 `scene.json` + `script.md`，再以 JSON Patch 加入 `scenes`；註冊失敗（例如 Schema 不符）時只移除本次建立的目錄。
- `update_scene` / `update_project`：JSON Patch，經 `state.mjs` 驗證並檢查狀態轉換。
- `render_scene`：執行 build_scene 的確定性部分（見下方「重做流程」），失敗時以 `state --failed` 記錄。`assemble_video`：`assemble` 後將專案設為 `completed`。
- 註冊方式（Claude Code）：從本 repo 以本機路徑註冊，`claude mcp add video-agent -- node <repo>/packages/video-agent/bin/video-agent.mjs mcp`。不從 npm 下載。

**重做流程（專案 `scripts/lib/runner.mjs` 的 `buildScene`，MCP 使用）**：專案若為 `script_generated` / `ready_to_assemble` / `completed` 先設為 `producing` → scene 為 `rendered` / `approved` 時先設為 `stale`（workflow 不允許直接跳回 `assets_ready`）；殘留在 `rendering` 的先記為失敗 → `tts` → `capture` → `assets_ready` → `rendering` → `render:scene` → `--rendered`。任一步失敗即停止並記錄。鎖定（`locked`）的 scene 拒絕執行。Gates 由各腳本本身把關。

### 10.1 Local MCP

Local MCP 隨 Agent 對話由 stdio 啟動與結束。它是獨立的套件（`packages/video-agent/`，不發佈到 npm），因為它要在專案建立前就註冊到 Agent。

```text
packages/video-agent/
├── bin/video-agent.mjs  # CLI：mcp
├── core/                # project.mjs（找專案、執行專案腳本；重做流程與合成委派給專案的 runner）、guide.mjs（Guide API、範本下載與驗證）
└── mcp/                 # `video-agent mcp [--project <dir>]` → stdio MCP server（由 Agent 啟動）

<專案>/scripts/
└── lib/runner.mjs（執行專案腳本、重做流程、合成）
```

### 10.2 寫入協定

Agent、Local MCP、UI 皆可能寫入專案 JSON，一律遵守（Agent 的檔案編輯工具無法取鎖與原子替換，因此 Agent 更新 JSON 時經由 `pnpm run state <scene-id|project> <json-patch>`，由 `scripts/state.mjs` 執行以下協定並於寫入後自動 validate）：

1. 寫入前取得專案根目錄的 `.video-agent.lock`（內容：寫入者、PID、時間）；已存在且未逾時（30 秒）則等待重試（最多 10 秒，可用環境變數 `VIDEO_AGENT_LOCK_WAIT_MS` 調整），逾時視為殘留鎖並覆蓋。
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
- Web capture 只擷取使用者提供的網址。
- 需要登入的產品（`sources.requiresLogin`，gate `productLogin`）：Agent 不索取、不輸入、不保存帳密。Agent 先提醒錄影會拍到登入後的內容（建議展示帳號，或經 `domEditConsent` 換成示意資料），再執行 `pnpm run login`：打開一個獨立的瀏覽器視窗，使用者照平常方式登入（含兩步驟驗證、SSO），關閉視窗即完成，不需回終端機操作。登入狀態存於專案的 `.auth/login.json`（`.gitignore`、檔案權限 600、Agent 不讀），capture 載入它開頁；被導到登入頁時回報 `gate productLogin`，Agent 以白話請使用者重新登入。不使用使用者平常的瀏覽器設定檔（Chrome 不允許自動化操作它，也會讓錄影程式接觸所有網站的登入）。影片完成後 Agent 詢問是否以 `pnpm run login --clear` 清除。

---

## 12. 產品 Repository 結構

```text
├── README.md                           # AOA 平台總覽
├── apps/
│   ├── portal/                         # 總覽首頁
│   ├── slide/                          # 簡報子功能
│   └── video/                          # 影片子功能（本規格所屬）
│       ├── src/                        # Vue 工作台
│       ├── specs/                      # 協議（唯一來源）
│       │   ├── common.schema.json
│       │   ├── project.schema.json
│       │   ├── scene.schema.json
│       │   ├── activity.schema.json
│       │   ├── workflow.schema.json
│       │   ├── workflow.json
│       │   └── examples/{valid,invalid}/   # pnpm run test:specs
│       ├── skills/                     # Skill 原始檔（product-video、story-video）
│       ├── template/                   # 專案範本（scripts/、src/、AGENTS.md、README.md 等）
│       ├── tests/                      # template/、web/、specs.test.mjs
│       ├── tools/                      # build-api.mjs、gen-types.mjs、lib/
│       ├── SPEC.md                     # 本文件
│       └── drafts/                     # 原始草稿
├── packages/video-agent/               # Local MCP（Phase 5，§10）
├── tests/site/                         # 全站發佈與打包整合測試
└── .github/workflows/deploy-pages.yml
```

建置時各影片 app 的 `tools/build-api.mjs` 產生 `/api/story/*`、`/api/product/*` 靜態檔（`tools/build-platform-api.mjs` 另外保留舊的 `/api/video/*`）、zip 與 manifest（含雜湊），與 web 一同部署。prompts 與 rules 由 Skill 擷取產生（§5），repo 中不存放。

### 12.1 部署（GitHub Pages）

- 網址：`https://tigernaxojr.github.io/index-url-director/`（repo 名稱 `index-url-director`）。
- `.github/workflows/deploy-pages.yml`：push 到 `main`（或手動觸發）→ `pnpm install --frozen-lockfile` → `test:specs`、型別產生檢查、`typecheck` → `pnpm run build`（依序打包 portal 至 `dist/`、video 至 `dist/video/`、slide 至 `dist/slide/`，再由 `build-api.mjs` 加入 `dist/api/`）→ 以 `peaceiris/actions-gh-pages` 將 `dist/` 發佈到 **`gh-pages` 分支**。
- **base path 不寫死**：`SITE_URL` 依序取自 `--site-url` → 環境變數 `SITE_URL`（CI 中為 repo 變數，可用於自訂網域）→ `GITHUB_REPOSITORY` → git remote `origin`，推得 `https://<owner>.github.io/<repo>`；repo 改名時自動跟隨。
- Skill 與範本中的網址以 `{{SITE_URL}}` 撰寫，建置時替換；Video UI 部署於 `<site>/video/`，與 `dist/api/` 並存。

---

## 13. 開發階段

| Phase | 內容 | 完成標準 |
|---|---|---|
| **1. 協議** | `project.schema.json`、`scene.schema.json`、`AGENTS.md`、`SKILL.md`、`workflow.json`、範本 `video.project.json` | Schema 通過自身範例驗證 |
| **2. 本機管線** | 範本 `scripts/*`、渲染器、TTS、capture、assemble | 以手寫 scene.json 可產出 final.mp4 |
| **3. Agent 流程** | Guide API 靜態檔、slash commands、prompts；GitHub Pages 部署（§12.1） | 網站部署完成；Claude Code 從一個產品網址端到端產出影片，並能只重做單一 scene |
| **4. Web UI** | 資料夾授權、Workflow、Scene Board/Editor、預覽 | UI 修改文案 → Agent `/video-sync` 只重做該 scene |
| **5. MCP** | Local MCP（Cloud MCP 見 D21） | Agent 可透過 MCP 完成相同流程 |
| **6. 進階（視需要）** | 帳號、雲端專案、團隊協作、歷史版本、物件儲存 | — 需重新評估零後端原則 |

> 註：GPT 草稿將 Web UI 排在 Agent 流程之前；本規格調整為先打通「本機管線 + Agent」，因為 UI 只是檔案的視覺化，沒有可運作的管線就無法驗證 UI。

---

## 14. 設計決策紀錄

| # | 議題 | 草稿分歧 | 決定 | 理由 |
|---|---|---|---|---|
| D1 | 專案核心檔名 | `config.json`(Q) / `data/project.json`(D) / `video-spec.json`(Gm) / `video.project.json`(GPT) | `video.project.json` 放根目錄 | 語意明確、易被 UI 辨識為專案 |
| D2 | Scene 資料放哪 | 全放 project.json(D)、兩處重複(Gm)、每 scene 一個目錄(GPT) | 每 scene 一個目錄；project 只存順序與引用 | 避免雙重事實來源；scene 可整包刪除/複製；素材就近存放 |
| D3 | 時長單位 | 秒(D, GPT) / 幀數(Gm) | 存秒，幀數推導；預設由 TTS 音長決定 | 人類可讀；改 fps 不需改資料；採 Gemini 的音長驅動設計 |
| D4 | 渲染方式 | Puppeteer 錄螢幕(Q) / HTML+Playwright 截幀(D) / Remotion(Gm, GPT) | HTML + Playwright 逐幀截圖；Playwright 也負責素材擷取 | 確定性重現、不需額外授權；原本以 Remotion 為預設，見 D15 |
| D5 | 狀態列舉 | 各稿不同 | §4.5 統一狀態機，新增 `stale`、`approved` | 支援 UI 修改後差異重做與使用者核准 |
| D6 | 如何偵測需重做 | 「掃描檔案變動」(Gm) | `inputHash` + `stale` 狀態 | 確定性判斷，不依賴時間戳 |
| D7 | 不覆蓋使用者修改 | 口頭規則(D, GPT) | `locked` 欄位 + `updatedBy` + 寫入前重讀/衝突檢查 | 規則需可被機器檢查 |
| D8 | 本機檔案存取 | `file://`(Q) / FS Access API(D, Gm, GPT) | File System Access API；明確禁止 `file://` fetch | 瀏覽器安全模型限制 |
| D9 | Agent 指引形式 | JSON guide(Q) / slash commands(D) / Skill + MCP(GPT) | 靜態 API + Skill 為主；slash commands 為薄包裝；MCP 為 Phase 5 | 單一來源維護規則，多入口使用 |
| D10 | 參考影片風格分析 | 必要步驟(D) | 可選；無法取得影片時跳過 | Agent 無法直接「觀看」線上影片，需本機抽影格 |
| D11 | 腳本是否改 JSON | 未規範 | 產出類腳本不改 JSON；狀態由 Agent 決定、經 `state.mjs` 寫入 | 集中狀態寫入，避免競態（見 D18 寫入協定） |
| D12 | 使用者審閱 | review 步驟(Q, GPT) | analyze（對象、風格、長度）、storyboard 與每 scene 渲染後各有 checkpoint | 在最便宜的階段攔截錯誤 |
| D13 | UI ↔ Agent 通訊 | 各稿僅提「UI 讀寫檔案」，未處理反向通知 | 採模式 A（檔案輪詢 + 使用者觸發）；不採檔案佇列 A'；本機 Companion（模式 B）曾於 Phase 5 加入，後移除（見 D18） | A' 閒置 token 成本高；B 的價值抵不過常駐程序、配對與安全面的成本 |
| D14 | TTS 預設 | edge-tts(Gm) / 未指定 | 可替換 provider；預設 edge-tts，首次使用需同意；支援自帶 key、Piper、系統、手動錄音 | 繁中免費堪用者僅 edge-tts，但其為非官方介面，不能綁死 |
| D15 | 渲染器授權 | 未處理 | 移除 Remotion，只保留逐幀截圖渲染器 | Remotion 對 >3 人公司需付費，使用者難以自行判斷級距；兩個渲染器畫面相同，維持兩套版面與授權詢問不划算。代價是渲染較慢 |
| D16 | BGM 與字幕 | 可選(Q) / 未規範 | 兩者皆進 MVP：字幕預設輸出 SRT、可選燒入；BGM 自備音檔或生成（D23）+ ducking；兩者只在 assemble 處理 | 旁白即字幕來源，成本低；集中在 assemble 使樣式調整不觸發 scene 重渲染 |
| D17 | 多語系 | 未提及 | MVP 一專案一語言；`/video-translate` 複製專案並翻譯；預留 `<locale>` 命名 | 語言影響時長→畫面時間軸→每 scene 重渲染，原生支援會使狀態機二維化，MVP 成本過高 |
| D18 | Companion 與寫入協定 | 無 | 不提供本機 Companion（曾實作 `video-agent serve` / `pnpm run companion`，已移除）；所有寫入者遵守統一寫入協定（鎖檔 + 原子寫入） | 網頁按鈕省下的只是一句指令，卻要常駐程序、token 配對、Origin 檢查與 Local Network Access 授權；`sync` 在背景啟動 Agent 有安全與成本疑慮 |
| D19 | 其他 Agent 相容性 | GPT 提及「未來支援其他 Agent」 | MVP 只測 Claude Code；AGENTS.md / Skill 中立寫法；指令檔單一來源產生各家格式，逐一驗收後才標示支援 | 協議層已通用，差異只在指令格式；支援宣告需有測試背書 |
| D20 | 網站部署與指令來源 | 未規範（§9.4 僅提 Cloudflare / GitHub Pages） | GitHub Pages（`gh-pages` 分支），網址 `/index-url-director`，base path 從 repo 名稱推得（可用 `SITE_URL` 覆寫）；Guide API 一律絕對網址；指令檔與 prompts/rules 皆由既有單一來源（workflow.json、Skill）產生；init 以 Skill 或 agent-guide 為入口 | 子路徑部署下根相對路徑會失效；避免 YAML 與 workflow.json、prompts 與 Skill 雙重維護；init 時專案指令尚不存在 |
| D21 | Cloud MCP | §10 原規劃由網站提供 Cloud MCP | 不另設雲端 MCP；Guide 類 resources / prompts 併入本機 `video-agent mcp`，內容來自內附或網站的 `/api/*`；專案操作只呼叫專案自己的腳本 | 網站為 GitHub Pages 靜態部署，無法運行 MCP；本機伺服器已隨 Agent 啟動，多一個雲端端點沒有額外價值；呼叫專案腳本可確保與專案的協議版本一致 |
| D22 | 故事影片 | 無 | 以 `project.kind` 區分，同一範本與渲染器（打包時各自去掉另一種影片專用的檔案，見 §8.2），另立 `story-video` Skill 與 `develop_story` / `design` 兩步；角色聲音以 script.md 行首【名字】指定；角色美術一次畫好、以 `rig.js` 擺姿勢 | 渲染、TTS、合成與工作台都與產品無關，分叉範本只會讓兩邊漂移；一個角色檔重複使用才能讓角色從頭到尾一致，也省 token；只把該段有說話的角色聲音算進 hash，換一個角色的聲音不必重做整部片 |
| D23 | 生成配樂 | 原 D16 不做 AI 生成音樂 | Agent 寫樂譜（和弦、段落、能量），規則編曲後由本機合成器演奏；不用音樂模型。引擎優先 FluidSynth + SoundFont（分軌渲染，各聲部可用不同音色庫），未安裝時退回 WebAudio 合成；音色庫只收可商用者，整台機器共用一份 | 不需 GPU、結果可重現、長度可精準對齊 scene；聲音由合成器產生，沒有模型訓練資料的授權疑慮。FluidSynth 試聽明顯優於 WebAudio，但需要下載約 35 MB，故保留免安裝的 WebAudio 作為後備 |
| D24 | HyperFrames | 無 | 不改用其渲染器、Skill 與 composition 格式（`window.__timelines`、`data-start`、`.html`），只把其 GSAP 動畫寫法吸收進 rendering-guide.md#motion（`tl.seek(t, false)` 讓 callback 觸發、先排版後動畫、有限次循環等） | 兩者同為瀏覽器逐幀 seek + FFmpeg，換過去渲染不會更穩；它要 Puppeteer 自帶的 Chrome（我們擷取素材仍需 Playwright）、要改寫協議，其 Skill 也會繞過本專案的狀態機。維持單一的 `setup(ctx)` → `seek(t)` 合約，Agent 只需學一種寫法 |
