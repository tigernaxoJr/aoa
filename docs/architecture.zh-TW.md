# AOA: Agent-Offloaded Architecture

[English](architecture.md) \| **繁體中文**

> **代理卸載式架構：服務本身不跑推論，推理與執行交給使用者既有的 Agent**

*本文為英文版 [architecture.md](architecture.md) 的翻譯，內容如有出入以英文版為準。*

---

## 1. 摘要 (Executive Summary)

**AOA（Agent-Offloaded Architecture，代理卸載式架構）** 是一種針對 AI Agent 時代提出的軟體架構模式：產品把其中的 Agent 工作——LLM 推理、工具操作，以及它們消耗的 token——卸載給使用者既有的 Coding Agent。服務端仍可保留它需要的其他部分，包括後端、資料庫或輕量模型；它不執行的是 Agent。

AOA 在前端的形式，是一個透過本機資料夾與使用者 Agent 協作的靜態網頁應用（這種前端形式有時也稱為 AOFA，Agent-Offloaded Frontend Architecture）。本文多數篇幅描述這種形式，因為它是套用 AOA 最直接的方式；模式 B、C（§5）則說明有後端，以及完全沒有前端時的 AOA。

在傳統生成式 AI 產品（SaaS）模式中，服務商必須在雲端承擔高昂的推論算力、多媒體轉碼與儲存成本，同時使用者必須承擔隱私外洩與資料被雲端綁定的風險。

AOA 提出責任邊界的反轉與重構：
- **前端（Presentation Layer）** 不依賴後端執行推論與運算，簡化為一份純靜態的**協議工作台（Protocol Workbench）**，可零成本託管於 GitHub Pages 等靜態平台。
- **推論與執行（Execution & Inference Layer）** 卸載（Offloaded）給使用者自備的 **Coding Agent**（如 Claude Code, Cursor, Codex, Gemini CLI, Pi）與本地開源工具鏈（如 FFmpeg, Playwright）。
  - **推論**：一般情況下由使用者既有的 Agent 方案在其供應商雲端執行，成本由使用者的 Agent 訂閱 / API 額度承擔，而非本服務；有需要時，也可如 Pi Agent 般改接本機自建模型（如 Ollama / llama.cpp 上的 LLM、Piper / Kokoro 等本機 TTS），達成完全離線。
  - **執行**：檔案讀寫、擷取、轉碼、合成等重度運算在使用者本機完成。
- **通訊與儲存匯流排（Bus & SSOT）** 則藉由現代瀏覽器的 **File System Access API** 搭配結構化規範（JSON Schema），以本機檔案系統作為唯一的真實來源（Single Source of Truth）。

---

## 2. 背景與痛點：傳統 AI 系統的困境

### 2.1 雲端 AI SaaS 的三大代價
1. **算力稅 (Compute Tax)**：每次模型推理、圖像生成、語音合成或影片渲染，都在燃燒服務商的伺服器成本，迫使產品採取昂貴的訂閱制或點數制。
2. **隱私與安全黑盒 (Privacy Black Box)**：使用者的產品原始碼、機密資料、個人聲音與自訂素材必須上傳至服務商雲端處理與保存，企業與個人顧慮重重。
3. **成品難以微調 (Rigid Outputs)**：SaaS 產出的成片或素材無法精準細修，一旦不滿意只能重新花費點數重新生成。

### 2.2 本地運算與 Coding Agent 的普及
近年來，使用者的本機開發環境發生了劇變：
- 一般開發機已足以負擔擷取、轉碼、合成等執行層工作；部分高階機器甚至能跑本機 LLM / TTS 模型。
- 本地開源管線（如 FFmpeg 音視訊合成、Playwright 瀏覽器渲染）極其成熟且完全免費。
- **Coding Agent** 普及，具備強大的檔案讀寫、指令調度、邏輯推理與自動修復能力，且使用者多半已為其付費。

**核心反思**：既然使用者手上已有一具能推理、能操作本機工具的 Agent，前端為何還要在雲端架設後端、重複支付一次推論與運算成本？

---

## 3. 核心概念：頭腦與引擎 (Brain & Engine)

> *AI 產品需要**頭腦**（LLM 推論）與**引擎**（推論所消耗的 token）。傳統 SaaS 兩者都由服務商提供，再以訂閱費回收成本。AOA 把兩者都交給使用者的 Agent；服務只提供介面與規格。*

| 角色 | 職責 | 由誰提供 |
|---|---|---|
| **服務** | 介面（網頁工作台或 API）、以 URL 發布的規格、驗證 Agent 的結果 | 服務方，邊際成本趨近於零 |
| **頭腦** | LLM 推論：理解需求、規劃步驟、寫檔、呼叫本機工具 | 使用者的 Agent，以及使用者選擇的模型 |
| **引擎** | 推論所消耗的 token | 使用者的 Agent 方案，或執行自建模型的本機硬體 |

```
┌────────────────────────────────────────────────────────┐
│                   Web Browser                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │     AOA Frontend (靜態工作台 / 協議載體)           │  │
│  │     - 零推論 (Zero-Inference)                    │  │
│  │     - 協議驗證器 (Schema Validator)              │  │
│  │     - 狀態視覺化與編輯器 (Visualizer & Editor)    │  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │ File System Access API
                            │ (Local Directory Handle)
┌───────────────────────────┼────────────────────────────┐
│ User Local Machine        │                            │
│                           ▼                            │
│    ┌──────────────────────────────────────────────┐    │
│    │ Local Filesystem (Shared SSOT)               │    │
│    │ ├── specs / schemas                          │    │
│    │ ├── project.json / scene.json                │    │
│    │ ├── activity.json (進度訊號)                 │    │
│    │ └── assets / output                          │    │
│    └──────────────────────▲───────────────────────┘    │
│                           │                            │
│    ┌──────────────────────┴───────────────────────┐    │
│    │ Local Coding Agent                           │    │
│    │ - 頭腦：LLM 推論                             │    │
│    │ - 引擎：使用者方案的 token                   │    │
│    │   雲端 LLM (預設) / 本機模型 (可選)          │    │
│    │ - 本機工具 (FFmpeg, Playwright, TTS)         │    │
│    │ - 協議遵守者 (Protocol Conformant)           │    │
│    └──────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

---

## 4. AOA 四大核心架構原則 (Core Principles)

### 原則一：Agent 工作卸載（Offloaded Agent Work）
- **清楚的 Agent 邊界**：需要 Agent 推理與工具操作的工作，以及它消耗的 token，都在使用者的 Agent 上執行。應用層（不論是純靜態前端，或是包含帳號、計費的後端）**不執行這部分 Agent 工作**，但仍可執行自己的服務，包括輕量模型。
- **服務商的 Agent 邊際成本趨近於零**：服務專注於人機互動（HCI）、工作流程導引、協同中繼資料與協議校驗；Agent 的推論以及它驅動的重度執行，交由使用者端的 Agent 處理（推論可走使用者自己的雲端方案或本機模型）。

### 原則二：Schema as the Contract（Schema 即合約）
- 展現/控制層與執行 Agent 之間**不以不透明的私有指令或黑盒 API 耦合**。
- 雙方的唯一通訊與狀態轉換合約是一組嚴格定義、開源公開的 **JSON Schema / 規格定義**。
- 介面負責將人類意圖結構化為符合 Schema 的規格；Agent 則依照 Schema 規範讀取環境、產出檔案與更新狀態機。

### 原則三：Filesystem-Centric SSOT & Bus（以檔案系統為核心的真實來源與匯流排）
- **本地執行真實來源 (Local SSOT)**：所有具體的原始碼、中間素材、暫存檔與生成產物，均以本機檔案系統為唯一真實來源。
- **檔案即通訊訊號**：
  - 在純前端場景，前端透過 File System Access API 讀寫檔案，並以中繼資料特徵碼輪詢（Fingerprint Polling）偵測 Agent 的產出；Agent 端則由使用者貼上網頁準備好的指令來觸發（見模式 A）。
  - 在具後端協同場景，雲端僅同步脫敏後的專案中繼資料（Metadata Plane），核心資料（Data Plane）永遠扎根本機。
  - 雙方寫入遵守鎖定約定（如 lock 檔、先寫暫存檔再改名的 write-temp-then-rename），以降低並行競態風險。File System Access API 本身不提供跨行程檔案鎖，Agent 是否遵守約定亦需驗證，因此前端讀取時仍應做 Schema 驗證與容錯。

### 原則四：Local-First & Data Sovereignty（本地優先與資料主權）
- **資產不經過本服務**：專利代碼、私有素材、內部網站登入憑證與創作原稿保存在使用者受控環境，本服務的伺服器（若有）不經手這些資料。
- **隱私邊界由使用者選擇**：Agent 推論時，必要的上下文會送往使用者所選的 LLM 供應商，隱私邊界等同該供應商的資料政策；若需完全不出本機，可改用本機 LLM / TTS。
- **自給自足（Self-Sustaining）**：即便雲端後端斷線或服務停止營運，本機專案與產出資產依然完整可讀、可透過本地工具鏈獨立編譯與運行。

---

## 5. 協作模式 (Collaboration Modes)

AOA 支援漸進式的三種模式：模式 A 是搭配本機資料夾的前端；模式 B 加上輕量後端；模式 C 則完全沒有前端。

### 模式 A：純工作台模式（Pure Workbench / File-Driven）
*最簡單的前端形式，無需本機安裝任何額外伺服器。*
1. 前端透過 File System Access API 取得 Handle。
2. 前端每 N 秒比對關鍵檔案中繼資料（`lastModified` 與檔案大小計算的 Fingerprint）。
3. 當 Agent 完成分鏡或生成音訊時，特徵碼變更，前端無感自動更新。
4. 前端需要 Agent 介入時（例如修改了文案），在狀態檔標註 `stale`，並提供標準指令（如 `/video-sync`），使用者在終端機貼上執行。

### 模式 B：具後端混合架構（Backend-Enabled / Hybrid AOA）
*適用於需要團隊協作、帳號權限或企業級管理的多租戶系統。*

**重要觀念**：AOA 並不排斥後端伺服器！在具後端的系統中，AOA 實現了**「控制平面（Control Plane）與算力平面（Compute Plane）的徹底解耦」**：

```
[ Cloud Backend (控制平面) ]
  ├── 帳號認證 (Auth) & 訂閱計費 (Billing)
  ├── 團隊協同 (Team Sync) & 專案中繼資料 (Metadata)
  └── 共享範本庫 (Shared Protocol / Prompt Registry)
         ▲
         │ (輕量 JSON / Schema Sync)
         ▼
[ Web UI / Native App ] <──(本地協議匯流排)──> [ Local SSOT ] <──> [ Local Agent ]
                                                 └── 私有代碼、素材與重度執行算力
```

1. **雲端後端只做薄控制層**：
   - 後端專注於用戶權限、協同通知、計費與方案管理，以及發布標準化 Schema 與 Prompt 模組。
   - **後端完全不跑高耗能的模型推論與多媒體渲染，服務商的邊際算力成本趨近於零（Near-Zero Marginal Compute Cost）**。
2. **算力與資料留存使用者端 (BYOA - Bring Your Own Agent)**：
   - 企業用戶的專利原始碼、商業機密與龐大影音素材，留在員工本地由 Agent 運算與渲染，不經過本服務後端。
   - 推論則走企業自選的 LLM 供應商（可為已簽署資料協議的企業方案）或內部自建模型。
   - 只有經過脫敏、通過 Schema 驗證的「最終專案中繼資料」或使用者明確同意發布的成片，才會上傳同步至雲端後端，大幅簡化企業的隱私合規範圍。
3. **Agent 驅動、前端即時呈現**：
   - Agent 依規格呼叫後端 API（或掛上服務提供的 MCP server）；後端驗證 Schema、寫入狀態後，透過 WebSocket、SSE 或 gRPC 串流把事件推給所有開啟中的前端。
   - 前端訂閱事件即時重繪，取代模式 A 的檔案特徵碼輪詢。使用者能逐步看到 Agent 的操作、中間產物與錯誤，並在任一步驟直接於介面上修正；修正同樣寫回後端，成為 Agent 下一步的輸入。
   - Agent 保持連線時（例如掛著 MCP server 或監聽任務佇列），前端可以把任務放進後端佇列讓 Agent 領取，使用者不必再複製貼上指令。Agent 仍在使用者端執行，權限以使用者授權的範圍為限。
   - 同一專案的團隊成員訂閱同一條事件流，同時看到 Agent 的操作結果。
   - 後端只負責驗證、保存與廣播，不執行推論，仍維持近乎零的邊際算力成本。

### 模式 C：純後端（Backend-Only / Agent-Operated API）
*適用於沒有使用者介面的服務：Agent 本身就是客戶端。*

1. 服務提供 HTTP API（或包成 MCP server），並在一個 URL 發布規格：OpenAPI 文件、Guide 或 Skill，以及 JSON Schema。
2. Agent 讀取規格、規劃步驟，直接呼叫 API。服務端保存資料與狀態，並依 Schema 驗證每一個請求。
3. 服務端仍然不跑推論：頭腦（LLM 推論）與引擎（token）都留在使用者的 Agent。
4. API 以使用者範圍的憑證驗證 Agent，並把 Agent 的每個請求都視為不可信的輸入。

### 規格的入口
不論哪一種模式，Agent 都要先取得規格，而入口通常就是一個 URL：Guide 頁面、OpenAPI 文件或規格索引。好的入口會以絕對網址與雜湊值列出所有 Schema、範本與指令，讓 Agent 能驗證下載的內容。本平台於 `/api/index.json` 提供總索引，並分別在 `/api/video/index.json` 與 `/api/slide/index.json` 提供各工具的專屬規格入口。

---

## 6. 參考實作 (Reference Implementations)

AOA 網站提供兩個工作台，各自有獨立的靜態介面、協議 Schema、Agent Skill 與專案範本：
- **Slide Studio（模式 A）**：Agent 以 Slidev 搭配 HTML、SVG 架構圖與 Three.js 組件製作簡報，在本機匯出 PDF；網頁只讀寫資料夾。
- **Video Studio（模式 A）**：Agent 把產品網址或一段故事做成有旁白的影片，細節如下。

Video Studio 的組成：
- **前端工作台**：Vue 3 + Tailwind 靜態網站，託管於 GitHub Pages。提供產品規格填寫、分鏡看板、旁白編輯與成片預覽。
- **協議庫**：`packages/video-core/specs/*.schema.json`（故事與產品影片兩個 app 共用）定義了 `project`、`scene`、`workflow` 與 `activity` 格式。
- **本機 Agent**：由 Claude Code 讀取線上 Guide 與本機 Skill，調用本機 Playwright 擷取網頁、Edge-TTS（微軟線上語音服務，可替換為 Piper / Kokoro 等本機 TTS）生成語音、FFmpeg 合成 60fps 影片。
- **效益**：
  - 開發者：0 伺服器月租、0 GPU 帳單、免維護資料庫。
  - 使用者：本服務不收費（推論成本由使用者既有的 Agent 方案負擔）；素材不經過本服務伺服器，原始碼與音訊素材完整可控。

---

## 7. 適用場景與限制 (When to Use & Limitations)

### 適合採用的場景
- **重度依賴本機工具鏈的生成任務**：如程式碼生成、本地測試、音視訊後製、文件編排。
- **高度隱私敏感型產品**：企業內部系統分析、私人故事繪本/動畫、個人隱私資料處理（搭配企業級 LLM 方案或本機模型效果最佳）。
- **開發者工具與生產力套件**：專為已有 Coding Agent 的工程師或專業用戶設計的工具。

### 局限性與邊界
- **瀏覽器相容性**：依賴 File System Access API（`showDirectoryPicker`），目前僅桌面版 Chrome、Edge 等 Chromium 瀏覽器支援；Brave 預設停用，Firefox 與 Safari 不支援。
- **依賴使用者本機環境**：使用者環境需具備基本執行環境（如 Node.js、Coding Agent 等），並自行負擔 Agent 的訂閱或 API 費用。
- **Agent 輸出不具確定性**：Agent 產出未必完全符合 Schema，前端需驗證並提供重試或修復指引。
- **網頁無法喚起 Agent**：模式 A 下，使用者需自行啟動 Agent 並貼上網頁準備好的指令；網頁只反映 Agent 寫入的結果。模式 B 可以由後端任務佇列緩解：連線中的 Agent 會領取網頁派出的任務，但仍需使用者先啟動 Agent。
- **目錄授權需重新取得**：重新整理頁面後，目錄 Handle 的讀寫權限通常需使用者再次授權。

---

## 8. 結論 (Conclusion)

AOA（代理卸載式架構）打破了「AI 產品必須等於雲端 SaaS」的固有思維。它將前端還原為純粹的互動介面與協議標準，把推論成本、執行權與資料主權交還給使用者自備的 Agent——推論要走雲端還是本機模型，也由使用者決定。

這是一條兼顧**服務商零維護成本**、**使用者可控的資料隱私**與**靈活擴展能力**的全新架構路徑。
