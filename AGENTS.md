# Monorepo Developer & Agent 規範 (AGENTS.md)

本文件是給在本 Monorepo 工作、維護或擴充功能的 Coding Agent（如 Claude Code, Antigravity, Cursor 等）的最高準則。

---

## 0. 語言與溝通準則（Language & Communication）

- **優先使用正體中文（繁體中文，Traditional Chinese）** 回答使用者問題、回報進度、撰寫說明與生成各項提示詞。
- 專案程式碼註解、UI 介面文案、文件手冊與各項規範均優先以正體中文撰寫。

---

## 1. 核心架構：AOFA (Agent Offload Front Architecture)

本平台遵循 AOFA 架構模式：

1. **前端零後端（Zero Backend）**：
   - 網站為純靜態前端（GitHub Pages 託管），不架設後端伺服器、不保存使用者隱私或專案資料、不呼叫任何付費雲端大模型 API。
   - 所有實質推理、畫面錄製、程式碼生成、語音合成與媒體合成，完全 **Offload 給使用者本機執行的 Coding Agent**。
2. **前後端溝通機制（File System Access API + 檔案輪詢）**：
   - **預設通訊管道**：前端使用瀏覽器標準 **File System Access API (`showDirectoryPicker()`)** 取得使用者本機工作目錄的授權。
   - **輪詢狀態同步（State Polling）**：前端透過定期讀取本機狀態檔（例如 `*.activity.json` 取得 Agent 即時進度、`*.project.json` 取得專案狀態、`output/` 取得產物）來反映進度，無需架設雲端中繼。
   - **本機可選助手（Optional Local Companion）**：若需在網頁上直接觸發本機指令重跑，僅透過本機 localhost WebSocket 配對本機進程，通訊全程不出本機。

---

## 2. 上下文隔離與維護守則（Context Isolation）

在修改或開發某個子專案時，**必須保持嚴格的上下文隔離**：

1. **單一子應用 Context 邊界**：
   - 修改特定子專案（如 `apps/video`）時，**只讀取該子專案目錄內的檔案**。
   - **嚴禁將其他無關子應用（如 `apps/slide`、`apps/portal`）的原始碼載入 Context**，避免無謂消耗 Token 並防止上下文污染。
2. **嚴禁跨 App 相互引入（No Cross-App Imports）**：
   - `apps/video`、`apps/slide`、`apps/portal` 彼此完全獨立，嚴禁相互 `import` 任何代碼或元件。
   - 跨前端共用邏輯僅限於平台層的 [`apps/vite.shared.ts`](file:///C:/workspace/index-url-director/apps/vite.shared.ts)（Vite 打包配方）。
3. **公開 API 契約相容性（Public API Compatibility）**：
   - 網站打包產出的 `/api/*`（如 `/api/skills/*.zip`、`/api/templates/*.zip`、`/api/index.json`）是已發布給外部 Agent 的端點，其 URL 結構與 manifest 規則必須維持向後相容，不可任意破壞。

---

## 3. 建立新 Sub-App 的標準結構（參考 `apps/video`）

當使用者要求新增子專案（例如簡報、文件或其他 AOFA 子應用）時，必須產出對齊 `apps/video` 的完整結構：

```text
apps/<slug>/
├── src/               # 前端 UI 原始碼（Vue 3 + Tailwind CSS）
│   ├── components/    # 視圖與組件
│   ├── lib/           # 本機 FSA 檔案讀寫、活動輪詢、狀態管理
│   ├── types/         # protocol.ts（由 specs 自動產生，嚴禁手寫）
│   ├── App.vue        # 根組件
│   └── main.ts        # 入口點
├── specs/             # 該應用的協議唯一真理來源 (Single Source of Truth)
│   ├── *.schema.json  # 狀態、專案、任務的 JSON Schema 定義
│   ├── workflow.json  # 步驟狀態機轉換、前置條件 (requires)、gates
│   └── examples/      # valid/ 與 invalid/ 的 Schema 測試用例
├── skills/            # 對應此應用的 Agent Skills（供使用者本機 Agent 安裝或讀取）
│   └── <skill-name>/  # SKILL.md（Agent Skills 格式）、分步指引文件
├── template/          # 供 Agent 在本機 unpack 的空專案範本
│   ├── scripts/       # 本機執行腳本（validate, state, companion 等）
│   ├── package.json   # 本機專案依賴
│   ├── AGENTS.md      # 專案內的 Agent 規則與工作流程
│   └── *.project.json # 範本設定檔
├── tests/             # 該應用專屬測試套件（template/、web/、specs.test.mjs）
├── tools/             # 該應用專屬工具（gen-types.mjs, build-api.mjs）
├── SPEC.md            # 該子系統完整的設計規格書
├── vite.config.ts     # 調用 appConfig(import.meta.dirname, '<slug>')
└── tsconfig.json      # 獨立 TypeScript 設定
```

### 新增 Sub-App 的 5 步 SOP：
1. **建立目錄結構**：建立 `apps/<slug>/`，其 `vite.config.ts` 調用 `appConfig(import.meta.dirname, '<slug>')`。
2. **新增入口卡片**：在 [`apps/portal/index.html`](file:///C:/workspace/index-url-director/apps/portal/index.html) 增加導向 `/<slug>/` 的功能卡片。
3. **加入建置管線**：在根目錄 `package.json` 的 `build:web` 與 `typecheck` 登記該 App。
4. **定義協議與資產**：在該功能目錄下建立自己的 `specs/`、`skills/`、`template/`、`tools/` 與 `tests/`。
5. **導航回到總覽**：在該 App 頂部導航列（Header）左側，必須強制加上回到總覽的按鈕（`<a href="../">← 平台總覽</a>`）。

---

## 4. 程式碼規範與不可觸碰的禁忌

1. **型別永遠由 Schema 產生**：
   - 各 App 的 `src/types/protocol.ts` 必須由專屬的 `apps/<app>/tools/gen-types.mjs` 從 `specs/*.schema.json` 編譯產出。
   - **嚴禁手寫或手動修改 `protocol.ts`**。修改協議時，先改 `specs/`，再執行 `pnpm run gen:types`。
2. **本機狀態檔案寫入安全**：
   - 範本專案中的狀態更新必須維持原子寫入（atomic write），不可留下損壞的 partial JSON。
3. **全站導航規範（強制提供回到 Portal 按鈕）**：
   - 每個獨立產品/子應用（如 `apps/video`、`apps/slide`）的頂部導航列（Header）最左側，**必須強制提供返回 Portal 的按鈕**（例如 `<a href="../">← 平台總覽</a>`），嚴禁讓使用者陷入無法返回首頁的孤島體驗。
4. **測試與驗證義務**：
   - 修改任何前端代碼後，必須執行 `pnpm run typecheck` 確保零型別報錯。
   - 修改任何工具或協議後，必須執行 `pnpm test` 確保既有單元測試、整合測試與規格驗證全部通過。
   - 部署與打包前確認 `pnpm run build` 成功。

---

## 5. 常用開發指令速查

| 指令 | 說明 |
|---|---|
| `pnpm dev` | 啟動 Video 工作台本機開發預覽 |
| `pnpm run dev:portal` | 啟動 Portal 平台總覽開發預覽 |
| `pnpm run dev:slide` | 啟動 Slide 簡報工作台開發預覽 |
| `pnpm run build` | 完整打包全站（Portal ➔ Video ➔ Slide ➔ Guide API） |
| `pnpm test` | 執行所有 App 的單元測試、規格測試與整合測試 |
| `pnpm run test:video` | 僅執行 Video 相關測試 |
| `pnpm run test:agent` | 僅執行 Video Agent (MCP/Companion) 測試 |
| `pnpm run test:specs` | 僅執行 Video 協議與 Schema 測試 |
| `pnpm run typecheck` | 檢查所有 App 的 TypeScript 型別 |
| `pnpm run gen:types` | 依據 `apps/video/specs/` 重新生成前端協議型別 |
