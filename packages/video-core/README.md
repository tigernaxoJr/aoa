# @aoa/video-core

故事動畫（[`apps/story`](../../apps/story)）與產品介紹影片（[`apps/product`](../../apps/product)）兩個工作台共用的影片核心。兩個 app 只放各自專屬的流程、Skill、首頁表單與元件；其餘都在這裡。

| 目錄 | 內容 |
|---|---|
| `specs/` | 影片協議 JSON Schema（project、scene、activity、workflow）與範例；各 app 的 `workflow.json` 以 `workflow.schema.json` 驗證 |
| `template/` | 本機專案範本本體（scripts、src、AGENTS.md…），兩種影片共用；打包時再加上各 app 的 `workflow.json` 與指令檔 |
| `skills/` | 兩個 Skill 共用的文件（`rendering-guide.md`），打包時放進各自的 Skill |
| `web/` | 共用工作台：`App.vue`（由各 app 以 `sourceForm`、`tabs` 掛載）、元件、`lib/`、產生的 `types/protocol.ts`、`vite.ts`（各 app 的 Vite 設定） |
| `tools/` | `build-video-api.mjs`（各 app 的 `tools/build-api.mjs` 呼叫）、`gen-types.mjs`、`lib/` |
| `tests/` | Schema 範例與範本腳本測試；`tests/web/harness.mjs` 是兩個 app 端對端測試的共用骨架 |
| `SPEC.md` | 完整的系統設計規格書 |

依賴方向：`apps/story`、`apps/product` 可引用這裡（`@video-core/*`）；這裡不引用任何 `apps/*`。工作台在建置時以 `__VIDEO_KIND__`（`story` / `product`）得知自己是哪一種。
