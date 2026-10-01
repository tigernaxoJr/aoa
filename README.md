# Agent Video Producer

讓 Coding Agent（如 Claude Code）在使用者自己的電腦上製作影片，有兩種：

- **產品介紹影片**：分析產品網址或原始碼，錄畫面、配旁白。
- **故事動畫影片**：把使用者的故事（全文、大綱或只有點子）補完整，用 SVG 畫出角色與場景，旁白與每個角色各自配音。

這不是「AI 幫你產生影片」的 SaaS：網站只提供協議（JSON Schema）、工作流程、Skill、專案範本與視覺化工作台；推理由本機 Agent 負責，原始碼、素材、語音、渲染與最終影片都留在本機。

- 網站與工作台：https://tigernaxojr.github.io/index-url-director/
- Agent 入口：https://tigernaxojr.github.io/index-url-director/api/index.json（產品影片讀 `agent-guide.md`，故事影片讀 `story-guide.md`）
- 完整設計規格：[doc/SPEC.md](doc/SPEC.md)

## 怎麼使用

1. 打開網站工作台，選擇「產品介紹影片」或「把故事做成動畫」，依步驟選擇一個空資料夾並填寫產品資訊（網址、原始碼或文字描述）或故事。
2. 把網頁產生的一段話貼給 Agent。
   - 產品影片：Agent 讀取 [product-video Skill](skills/product-video/SKILL.md)，下載並驗證專案範本，接著依序分析產品、規劃分鏡與旁白、逐段產生語音與畫面，最後用 FFmpeg 合成 `output/final.mp4` 與字幕檔。
   - 故事影片：Agent 讀取 [story-video Skill](skills/story-video/SKILL.md)，用同一份範本，依序和使用者整理故事、設計角色與聲音（設定稿與試聽檔）、寫分鏡與對白、逐段畫 SVG 動畫，最後合成。
3. 影片以 scene 為單位，可以在工作台預覽、修改旁白，再請 Agent 只重做受影響的段落。

產生的專案怎麼操作，見範本的 [README](templates/product-video/README.md)。

## Repository 結構

| 路徑 | 內容 |
|---|---|
| `specs/` | 協議的唯一來源：`project` / `scene` / `common` / `workflow` Schema、`workflow.json` 與驗證範例 |
| `skills/product-video/` | 產品影片的 Skill（`SKILL.md`、`workflow.md`、`script-guide.md`、`rendering-guide.md`） |
| `skills/story-video/` | 故事影片的 Skill（`SKILL.md`、`story-guide.md`、`design-guide.md`；渲染沿用 `rendering-guide.md`） |
| `templates/product-video/` | 兩種影片共用的本機專案範本：TTS、擷取、渲染、合成腳本、角色動畫工具 `src/lib/rig.js` 與 `AGENTS.md` |
| `apps/web/` | Vue 工作台（File System Access API 讀寫本機專案） |
| `packages/video-agent/` | 本機 MCP server（`video-agent mcp`；`video-agent serve` 會啟動專案的 Companion） |
| `tools/` | `build-api.mjs`（產生靜態 Guide API 與 zip）、`gen-types.mjs`（由 Schema 產生 TS 型別） |
| `tests/` | `template/`、`site/`、`web/`、`agent/` 測試 |
| `doc/` | 設計規格與原始草稿 |

## 開發

需要 Node.js 20.12 以上與 pnpm。

```bash
pnpm install
```

| 指令 | 作用 |
|---|---|
| `pnpm dev` | 啟動工作台開發伺服器 |
| `pnpm test` | 全部單元測試 + Schema 範例驗證 + 型別產生檢查 |
| `pnpm run test:template` | 只跑範本管線測試 |
| `pnpm run test:web` | 工作台與網站建置測試 |
| `pnpm run typecheck` | 工作台型別檢查 |
| `pnpm run gen:types` | 修改 `specs/` 後重新產生 `apps/web/src/types` |
| `pnpm run build` | 建置工作台並產生 `dist/api/*`（Schema、prompts、rules、Skill 與範本 zip、manifest） |

Skill 與範本中的網址以 `{{SITE_URL}}` 撰寫，建置時替換。`SITE_URL` 依序取自 `--site-url`、環境變數 `SITE_URL`、`GITHUB_REPOSITORY`、git remote `origin`。`prompts/*` 與 `rules/*` 由 Skill 文件擷取產生，只需維護 Skill。

## MCP 與 Companion

```bash
claude mcp add video-agent -- node "$PWD/packages/video-agent/bin/video-agent.mjs" mcp
```

- `video-agent mcp`：讓 Agent 透過 MCP 讀取 Guide 並操作專案（建立、更新 scene、渲染、合成）。
- Companion：隨專案範本提供，在專案中執行 `pnpm run companion`（或 `video-agent serve`）會在 `127.0.0.1` 啟動它，工作台配對後可直接按鈕重做 scene 或合成，不必切到 Agent。

細節見 [SPEC §10](doc/SPEC.md#10-mcp-與-companionphase-5)。

## 部署

push 到 `main` 時，[deploy-pages.yml](.github/workflows/deploy-pages.yml) 會檢查 Schema 與型別、建置網站，並發佈到 `gh-pages` 分支（GitHub Pages）。
