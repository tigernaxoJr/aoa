# Story Video Studio（故事動畫工作台）

讓 Coding Agent（如 Claude Code）在使用者本機把**故事做成動畫影片**的 AOA 子應用：根據使用者的故事（全文、大綱或只是一個點子），陪使用者把故事補完整、設計角色與場景 SVG、為每個角色與旁白各自配音，並渲染成動畫。部署路徑為 `/<repo>/story/`。

產品介紹影片是另一個工作台 [`apps/product`](../product)（`/<repo>/product/`）。兩者共用同一套影片協議、範本管線與工作台元件 [`packages/video-core`](../../packages/video-core)；本目錄只放故事影片專屬的部分。

---

## 怎麼使用

1. **開啟工作台**：進入 `/<repo>/story/`。
2. **準備資料夾並寫下故事**：點擊「選擇或建立資料夾」授權一個專案資料夾，再貼上故事或點子、填寫觀看對象與語音引擎偏好。
3. **啟動 Agent**：將工作台產生的引導訊息貼入你的 Coding Agent。Agent 讀取 `/api/story/agent-guide.md`（或安裝 `story-video` Skill），下載並驗證故事範本，依序整理故事、設計角色與聲音、寫分鏡與對白、產生每段動畫並合成。
4. **工作台**：
   - **🎬 分鏡故事板**：預覽每段動畫、修改旁白與對白（角色台詞以【名字】開頭）。
   - **🎭 角色工坊**：管理登場角色、錄音克隆與試聽聲音、上傳參考圖並預覽 SVG 骨骼。

在這裡開啟產品專案時，工作台會提示改到產品介紹影片工作台開啟。

---

## 目錄結構

```text
apps/story/
├── src/               # 故事專屬前端：main.ts、StorySource.vue（首頁步驟 2 表單）、audio.ts
│   └── components/    # 角色工坊：CastPanel、CastEditor、VoiceStudio、ArtStudio
├── specs/workflow.json # 故事影片的線性流程（init → develop_story → design → storyboard → build_scene → assemble）
├── skills/story-video/ # 故事動畫影片 Skill（部分步驟連到 product-video Skill；rendering-guide.md 共用）
├── tools/build-api.mjs # 產生 /api/story/*（呼叫 packages/video-core/tools/build-video-api.mjs）
├── tests/web/         # 故事工作台端對端測試
├── docs/              # 角色工坊規劃書
├── vite.config.ts     # 獨立 Vite 打包設定（輸出至 dist/story/）
└── tsconfig.json
```

協議 Schema、本機專案範本、共用工作台元件與範本測試都在 [`packages/video-core`](../../packages/video-core)，詳見 [SPEC.md](../../packages/video-core/SPEC.md)。
