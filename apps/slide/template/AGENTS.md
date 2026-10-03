# Slidev Deck Project — Agent 規則

本目錄是一個 Slidev 簡報專案，遵循 Slide Studio 的 AOA 協議。完整做法見 slidev-deck Skill（{{SITE_URL}}/api/slide/skills/slidev-deck/SKILL.md）；本檔是專案內的精簡規則。

---

## 1. 核心檔案

| 檔案 | 說明 |
|---|---|
| `slides.md` | Slidev 主簡報，以單獨一行的 `---` 分頁；簡報內容的唯一來源 |
| `slide.project.json` | 專案設定與狀態（格式見 `schemas/project.schema.json`） |
| `slide.activity.json` | 即時進度，網頁工作台會顯示（格式見 `schemas/activity.schema.json`） |
| `slide.start.json` | 網頁表單寫入的需求（只在網頁準備的資料夾中出現；唯讀） |
| `components/*.vue` | 自訂 Vue / Three.js / SVG 組件，Slidev 自動註冊，不必 import |
| `schemas/` | 協議 Schema 與 `workflow.json`，`validate` 與 `state` 依此驗證 |
| `output/slides.pdf` | 匯出的 PDF |

---

## 2. 工作流程

1. **規劃大綱（`/slide-outline`）**：規劃分頁結構、頁數與每頁核心訊息。**停下確認**，確認後狀態改為 `outlined`。
2. **撰寫內文（`/slide-draft`）**：編寫 `slides.md`，善用 Slidev 版型（`cover`、`two-cols`、`center`、`quote`）。講者備忘錄寫在每頁**最後一個** HTML 註解裡，例如 `<!-- 這裡停頓，先問聽眾 -->`。**停下確認**，確認後狀態改為 `drafted`。
3. **注入視覺（`/slide-visual`）**：SVG 架構圖與流程圖、Iconify 圖示、`<ThreeGlobe />` 等 3D 組件、`v-click` 動畫。WebGL 畫面在 PDF 中是點陣圖，需要閱讀的資訊放在 HTML / SVG。完成後狀態改為 `visualized`。
4. **匯出 PDF（`/slide-export`）**：`pnpm run export` 產生 `output/slides.pdf`，成功後狀態改為 `exported`，失敗改為 `failed` 並告知使用者原因。

---

## 3. 狀態更新守則

只用腳本修改狀態檔，不手寫 JSON。腳本會先依 `schemas/` 驗證，驗證失敗不寫檔，並以原子寫入避免留下損壞的檔案：

```bash
# 回報正在進行的工作
pnpm run state activity --step visual --slide 3 --total 8 --message "正在畫第 3 頁的架構圖"

# 等待使用者回覆確認
pnpm run state activity --step outline --message "大綱完成，請確認是否繼續" --waiting

# 更新專案狀態
pnpm run state project --status drafted --pages 8
```

每次修改後執行 `pnpm run validate`。
