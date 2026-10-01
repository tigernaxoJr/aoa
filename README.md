# Agent Video Producer

讓 Coding Agent（如 Claude Code）在使用者自己的電腦上製作產品介紹影片。

這不是「AI 幫你產生影片」的 SaaS：網站只提供協議（JSON Schema）、工作流程、Skill、專案範本與視覺化工作台；推理由本機 Agent 負責，原始碼、素材、語音、渲染與最終影片都留在本機。

- 網站與工作台：https://tigernaxojr.github.io/index-url-director/
- Agent 入口：https://tigernaxojr.github.io/index-url-director/api/index.json
- 完整設計規格：[doc/SPEC.md](doc/SPEC.md)

## 怎麼使用

1. 打開網站工作台，依步驟選擇一個空資料夾並填寫產品資訊（網址、原始碼或文字描述）。
2. 在該資料夾開啟 Agent，告訴它「幫我做產品介紹影片」。Agent 會讀取 [Skill](skills/product-video/SKILL.md)，下載並驗證專案範本，接著依序分析產品、規劃分鏡與旁白、逐段產生語音與畫面，最後用 FFmpeg 合成 `output/final.mp4` 與字幕檔。
3. 影片以 scene 為單位，可以在工作台預覽、修改旁白，再請 Agent 只重做受影響的段落。

產生的專案怎麼操作，見範本的 [README](templates/product-video/README.md)。

## Repository 結構

| 路徑 | 內容 |
|---|---|
| `specs/` | 協議的唯一來源：`project` / `scene` / `common` / `workflow` Schema、`workflow.json` 與驗證範例 |
| `skills/product-video/` | Agent 的 Skill（`SKILL.md`、`workflow.md`、`script-guide.md`、`rendering-guide.md`） |
| `templates/product-video/` | 本機影片專案範本：TTS、擷取、渲染、合成腳本與 `AGENTS.md` |
| `apps/web/` | Vue 工作台（File System Access API 讀寫本機專案） |
| `packages/video-agent/` | 本機 MCP server 與 Companion（`video-agent mcp` / `video-agent serve`） |
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
- `video-agent serve`：在 `127.0.0.1` 啟動 Companion，工作台配對後可直接按鈕重做 scene 或合成，不必切到 Agent。

細節見 [SPEC §10](doc/SPEC.md#10-mcp-與-companionphase-5)。

## 部署

push 到 `main` 時，[deploy-pages.yml](.github/workflows/deploy-pages.yml) 會檢查 Schema 與型別、建置網站，並發佈到 `gh-pages` 分支（GitHub Pages）。
