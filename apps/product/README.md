# Product Video Studio（產品介紹影片工作台）

讓 Coding Agent（如 Claude Code）在使用者本機製作**產品介紹影片**的 AOA 子應用：分析產品網址或原始碼，自動錄製畫面、生成並合成旁白與字幕。部署路徑為 `/<repo>/product/`。

故事動畫影片是另一個工作台 [`apps/story`](../story)（`/<repo>/story/`）。兩者共用同一套影片協議、範本管線與工作台元件 [`packages/video-core`](../../packages/video-core)；本目錄只放產品影片專屬的部分。

---

## 核心特色

1. **零後端**：網站純靜態託管（GitHub Pages），不跑後端、不儲存使用者資料、不呼叫雲端模型。
2. **本機運算**：推理由本機 Agent 執行，原始碼、素材、語音、渲染、合成影片均保留在使用者本機。
3. **契約即檔案**：工作台與 Agent 僅透過本機專案目錄的 `video.project.json`、`scenes/` 等檔案互動。
4. **Scene 化架構**：以 Scene 為最小單元，支援在工作台局部預覽、修改文案，並讓 Agent 單獨重做受影響的段落。
5. **工具自動升級**：工作台可自動比對本機專案與網站範本的 SHA-256 差異，一鍵更新本機專案工具。

---

## 怎麼使用

1. **開啟工作台**：進入 `/<repo>/product/`。
2. **準備資料夾並填寫產品資訊**：點擊「選擇或建立資料夾」授權一個專案資料夾，再填寫產品網址、原始碼資料夾或說明。
3. **啟動 Agent**：將工作台產生的引導訊息貼入你的 Coding Agent。Agent 讀取 `/api/product/agent-guide.md`（或安裝 `product-video` Skill），下載並驗證範本，執行產品分析、分鏡規劃、語音生成、Playwright 畫面錄製與 FFmpeg 合成。
4. **工作台即時協作**：
   - 工作台自動輪詢顯示 `video.activity.json`（Agent 動態）。
   - 在 Scene Board 預覽、排序或調整旁白，Agent 透過 `/video-sync` 只重做變更的段落。

在這裡開啟故事專案時，工作台會提示改到故事動畫工作台開啟。

---

## 目錄結構

```text
apps/product/
├── src/               # 產品專屬前端：main.ts（掛載共用工作台）、ProductSource.vue（首頁步驟 2 表單）
├── specs/workflow.json # 產品影片的線性流程（init → analyze → storyboard → build_scene → assemble）
├── skills/product-video/ # 產品介紹影片 Skill（共用的 rendering-guide.md 在 packages/video-core/skills/）
├── tools/build-api.mjs # 產生 /api/product/*（呼叫 packages/video-core/tools/build-video-api.mjs）
├── tests/web/         # 產品工作台端對端測試
├── vite.config.ts     # 獨立 Vite 打包設定（輸出至 dist/product/）
└── tsconfig.json
```

協議 Schema、本機專案範本、共用工作台元件與範本測試都在 [`packages/video-core`](../../packages/video-core)。

---

## 本機助手與 MCP（可選）

- **Companion**：專案範本內建本機助手腳本。在專案目錄下執行 `pnpm run companion`，配對連結會依專案類型開啟 `/product/` 或 `/story/`，之後即可直接在網頁點擊按鈕重做 Scene。
- **Local MCP**：可透過 [`packages/video-agent`](../../packages/video-agent) 將本機 MCP 伺服器註冊至 Claude Code：
  ```bash
  claude mcp add video-agent -- node "<repo-path>/packages/video-agent/bin/video-agent.mjs" mcp
  ```

詳細協定與架構說明請見 [SPEC.md](../../packages/video-core/SPEC.md)。
