# AOFA — Agent Offload Front Architecture

純靜態前端架構，將 AI 推理、運算與檔案產出完全 **offload 給使用者本機的 Coding Agent**（如 Claude Code）。

網站不需後端、不呼叫雲端模型 API、不保存任何使用者資料；它只負責提供「協議標準（Guide API）」、「視覺化工作台」以及「雙向檔案同步機制」。

---

## 核心原則

1. **零後端（Zero-Backend）**：網站為純靜態部署（GitHub Pages），所有 API 皆為編譯時產生的靜態 JSON / Markdown / Zip。
2. **資料不離開本機**：網頁端僅透過 File System Access API 讀寫使用者明確授權的本機專案資料夾。
3. **契約即檔案**：網頁與 Agent 之間沒有直連通道，完全透過資料夾中的結構化檔案（如 `*.project.json`、`*.activity.json`、Schema）做為訊息與狀態匯流排。
4. **功能高度隔離**：每個功能為獨立的靜態應用，具有自己的路由、範本、Schema 與生命週期，彼此不互相 import。

---

## 包含的應用與模組

| 應用 / 模組 | 路由 / 目錄 | 說明 |
|---|---|---|
| **Portal** | `/` (`apps/portal`) | 平台總覽首頁，提供各子功能入口 |
| **Video Studio** | `/video/` (`apps/video`) | 產品介紹與故事動畫影片工作台（[詳細文件](apps/video/README.md) · [規格書](apps/video/SPEC.md)） |
| **Slide Studio** | `/slide/` (`apps/slide`) | 簡報製作工作台（規劃建置中，[詳細文件](apps/slide/README.md)） |
| **video-agent** | `packages/video-agent` | Video 專屬本機 MCP 伺服器與 Companion CLI（[詳細文件](packages/video-agent/README.md)） |

---

## Repository 結構

```text
├── apps/
│   ├── portal/            # 總覽首頁（站台根目錄 /，dist/）
│   ├── video/             # 影片工作台（/<repo>/video/，dist/video/）
│   │   ├── src/           # Vue 3 工作台原始碼
│   │   ├── specs/         # 協議 JSON Schema 唯一來源
│   │   ├── skills/        # Agent Skills（product-video、story-video）
│   │   ├── template/      # 本機專案範本
│   │   ├── tests/         # Video 專屬測試（template/、web/、specs.test.mjs）
│   │   ├── tools/         # Video 專屬建置工具（build-api.mjs、gen-types.mjs）
│   │   └── SPEC.md        # Video 系統設計規格書
│   ├── slide/             # 簡報工作台（/<repo>/slide/，dist/slide/）
│   └── vite.shared.ts     # 所有前端共用的 Vite 建置配方（base、輸出路徑）
├── packages/
│   └── video-agent/       # Video 專屬本機 MCP server 與 Companion
└── tests/
    └── site/              # 全站發佈與打包整合測試
```

---

## 本機開發與指令

需要 Node.js 20.12 以上與 pnpm。

```bash
pnpm install
```

| 指令 | 說明 |
|---|---|
| `pnpm dev` | 啟動 Video 工作台開發伺服器（localhost） |
| `pnpm run dev:portal` | 啟動 Portal 總覽首頁開發伺服器 |
| `pnpm run dev:slide` | 啟動 Slide 工作台開發伺服器 |
| `pnpm run build` | 依序打包 portal（清空 dist/）、video、slide，並由 Video 工具打包 `dist/api/` |
| `pnpm test` | 執行所有單元測試 + Spec 範例校驗 + 型別一致性檢查 |
| `pnpm run typecheck` | 檢查所有 App 的 TypeScript 型別 |
| `pnpm run gen:types` | 修改 `apps/video/specs/` 後重新生成前端型別 |

---

## 新增一個子功能（App）

1. **建立目錄**：建立 `apps/<slug>/`，其 `vite.config.ts` 呼叫 `appConfig(dir, '<slug>')`。
2. **加入入口卡片**：在 `apps/portal/index.html` 加入該功能的超連結卡片。
3. **加入建置管線**：在根目錄 `package.json` 的 `build:web` 與 `typecheck` 加上該 App。
4. **定義協議**：在該功能目錄下建立自己的 `specs/`、`template/` 與 `skills/`。

---

## 部署

推送至 `main` 分支時，[deploy-pages.yml](.github/workflows/deploy-pages.yml) 會自動校驗規格、型別與單元測試，建置後將 `dist/` 發佈至 GitHub Pages。
- 站台根目錄 `/` 呈現 Portal 總覽。
- 子功能位於 `/<slug>/`。
- 靜態 Guide API 位於 `/api/*`。
