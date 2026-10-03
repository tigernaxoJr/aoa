# Video Studio (Agent Video Producer)

讓 Coding Agent（如 Claude Code）在使用者本機製作影片的 AOA 子應用。部署路徑為 `/<repo>/video/`。

支援兩種影片製作模式：

- **產品介紹影片**（Product Video）：分析產品網址或原始碼，自動錄製畫面、生成並合成旁白與字幕。
- **故事動畫影片**（Story Video）：根據使用者故事（全文、大綱或點子），自動設計角色與場景 SVG，並為每個角色與旁白各自配音。

---

## 核心特色

1. **零後端**：網站純靜態託管（GitHub Pages），不跑後端、不儲存使用者資料、不呼叫雲端模型。
2. **本機運算**：推理由本機 Agent 執行，原始碼、素材、語音、渲染、合成影片均保留在使用者本機。
3. **契約即檔案**：工作台與 Agent 僅透過本機專案目錄的 `video.project.json`、`scenes/` 等檔案互動。
4. **Scene 化架構**：以 Scene 為最小單元，支援在工作台局部預覽、修改文案，並讓 Agent 單獨重做受影響的段落。
5. **工具自動升級**：工作台可自動比對本機專案與網站範本的 SHA-256 差異，一鍵更新本機專案工具。

---

## 怎麼使用

1. **開啟工作台**：進入 `/<repo>/video/`。
2. **選擇專案模式**：
   - 選擇「產品介紹影片」或「把故事做成動畫」。
   - 點擊「選擇或建立資料夾」授權一個專案資料夾。
   - 填寫產品資訊（網址、原始碼或說明）或故事內容。
3. **啟動 Agent**：將工作台產生的引導訊息貼入你的 Coding Agent（如 Claude Code）。
   - **產品影片**：Agent 讀取 `skills/product-video/SKILL.md`，下載並驗證範本，執行產品分析、分鏡規劃、語音生成、Playwright 畫面錄製與 FFmpeg 合成。
   - **故事動畫**：Agent 讀取 `skills/story-video/SKILL.md`，與使用者討論角色設定、生成 SVG 角色擺姿勢動畫、對白配音與合成。
4. **工作台即時協作**：
   - 工作台自動輪詢顯示 `video.activity.json`（Agent 動態）。
   - 在 Scene Board 預覽、排序或調整對白，Agent 透過 `/video-sync` 只重做變更的段落。

---

## 目錄結構

```text
apps/video/
├── src/               # Vue 3 工作台前端原始碼
├── specs/             # 影片協議唯一來源（JSON Schema、workflow.json 與測試用例）
├── skills/            # Agent Skills
│   ├── product-video/ # 產品介紹影片技能指引
│   └── story-video/   # 故事動畫影片技能指引
├── template/          # 本機專案範本（scripts/、src/、AGENTS.md、package.json 等）
├── tests/             # Video 專屬測試（template/、web/、specs.test.mjs）
├── tools/             # Video 專屬工具（build-api.mjs 打包 Guide API、gen-types.mjs 產生型別）
├── SPEC.md            # 完整的系統設計規格書
├── vite.config.ts     # 獨立 Vite 打包設定（輸出至 dist/video/）
└── tsconfig.json      # 獨立 TypeScript 設定
```

---

## 本機助手與 MCP（可選）

- **Companion**：專案範本內建本機助手腳本。在專案目錄下執行 `pnpm run companion`，工作台取得配對後即可直接在網頁點擊按鈕重做 Scene，不需切換終端機。
- **Local MCP**：可透過 [`packages/video-agent`](../../packages/video-agent) 將本機 MCP 伺服器註冊至 Claude Code：
  ```bash
  claude mcp add video-agent -- node "<repo-path>/packages/video-agent/bin/video-agent.mjs" mcp
  ```

詳細協定與架構說明請見 [SPEC.md](SPEC.md)。
