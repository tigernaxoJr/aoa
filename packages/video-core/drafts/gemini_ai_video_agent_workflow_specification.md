# Local AI Product Video Generator: Agent & Project Spec

本專案旨在透過 Agent（如 Claude Code）在用戶本機端完成產品展示影片的生成與管理，並搭配純前端 Dashboard（無伺服器架構）進行視覺化檢視與分段調整。

---

## 1. 系統架構理念 (Architecture)

1. **零後端 (Zero-Backend)**：
   - 網站純靜態託管（GitHub Pages / Cloudflare Pages）。
   - 瀏覽器端使用 **File System Access API** 讀取與寫入本機專案目錄。
2. **本機隔離與執行 (Local Execution)**：
   - 所有原始碼抓取、TTS 語音合成、截圖與影片渲染（Remotion / FFmpeg）均由 Agent 在本機端 CLI 執行。
3. **分段式設計 (Modular Scenes)**：
   - 影片必須以「分段（Scene）」為單位拆解。
   - 單一段落文案或畫面修改時，僅需重新渲染該片段，節省時間與算力。

---

## 2. 本地專案結構規範 (Project Directory Structure)

Agent 在本地初始化影片專案時，必須遵循以下標準目錄與檔案結構：

```text
my-video-project/
├── video-spec.json            # 專案核心狀態檔（前端 UI 讀取此檔以渲染畫面）
├── package.json               # 依賴定義（Remotion 核心、TTS 工具等）
├── scenes/                    # 各分段腳本與單獨配置
│   ├── scene-01.json
│   ├── scene-02.json
│   └── ...
├── assets/                    # 本地素材存放區
│   ├── audio/                 # TTS 生成之語音 (.mp3 / .wav)
│   ├── captures/              # Puppeteer / 瀏覽器截圖與錄影
│   └── outputs/               # 渲染產出的分段與最終 mp4
└── src/                       # Remotion 程式碼
    ├── Root.tsx
    ├── Composition.tsx
    └── components/
        └── SceneRenderer.tsx
```

---

## 3. 核心資料規格 (Data Schema)

### `video-spec.json` (專案核心定義)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0.0",
  "project": {
    "name": "Product Launch Demo",
    "targetUrl": "https://example.com",
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30
  },
  "scenes": [
    {
      "id": "scene-01",
      "index": 1,
      "title": "Problem Statement",
      "durationInFrames": 150,
      "script": "Is your workflow interrupted by fragmented tools?",
      "audioPath": "assets/audio/scene-01.mp3",
      "visualType": "web-capture",
      "status": "ready"
    }
  ],
  "buildStatus": {
    "lastUpdated": "2026-09-30T14:00:00Z",
    "renderedScenes": ["scene-01"]
  }
}
```

### `scenes/scene-XX.json` (單一分段結構)

```json
{
  "id": "scene-01",
  "index": 1,
  "title": "痛點展示與首頁導覽",
  "narrative": {
    "script": "現代團隊常常面臨協作工具破碎化的困擾...",
    "voice": "zh-TW-YunJheNeural",
    "speed": 1.0
  },
  "visuals": {
    "action": "scroll-and-highlight",
    "targetSelector": "#features",
    "durationSeconds": 5
  },
  "status": "pending"
}
```

---

## 4. Agent 執行工作流規範 (Agent Instructions)

當 Agent 被呼叫處理此任務時，必須依照下列順序執行：

### 階段一：分析與規劃 (Analyze & Scaffold)
1. **讀取輸入**：解析用戶提供的產品網址或原始碼，提取核心功能、價值主張與品牌配色。
2. **初始化專案**：若本地目錄未初始化，產生標準 `package.json`（包含 `@remotion/cli`、`remotion`、`edge-tts` 或相關工具）。
3. **規劃分鏡**：將影片切分為 3 至 6 個獨立 Scene，並輸出至 `video-spec.json` 與 `scenes/scene-*.json`。

### 階段二：資產生成 (Asset Generation)
1. **語音生成 (Audio)**：
   - 讀取各分鏡的 `script`，呼叫本機端免費命令（如 `edge-tts --text "..." --write-media assets/audio/scene-XX.mp3`）。
   - 依據生成音訊時長反推該分鏡所需的 `durationInFrames`（秒數 × 30fps），並更新 `video-spec.json`。
2. **畫面擷取 (Visual Captures)**：
   - 依據視覺腳本，以 Headless 瀏覽器擷取目標網頁截圖或操作錄影。

### 階段三：組裝與渲染 (Composition & Render)
1. 透過 Remotion 範本組裝分段：
   - 每個 Scene 皆為獨立 React 組件。
2. 支援單段渲染指令（例如：`npx remotion render src/Root.tsx scene-01 assets/outputs/scene-01.mp4`）。
3. 當用戶在前端 UI 調整某一特定段落的文案時，**僅重新執行該段的語音與渲染**。

---

## 5. 前端 Dashboard 連動機制 (UI Integration)

純靜態的前端 UI 應提供以下操作體驗：
1. **本地授權按鈕**：點擊「開啟本地專案目錄」，觸發 `window.showDirectoryPicker()`。
2. **即時監聽**：讀取 `video-spec.json`，在網頁上以看板方式列出各分鏡卡片、文字與音訊狀態。
3. **視覺化調整**：
   - 用戶可在網頁上編輯文案、調整順序。
   - 編輯完成後，網頁直接將異動覆寫回本機 `video-spec.json`。
   - Agent 下次喚起時，只需掃描檔案變動即可進行差異化重渲染。