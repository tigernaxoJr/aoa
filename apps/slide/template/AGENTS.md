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
| `components/*.vue` | 自訂 Vue / Three.js / SVG 組件，Slidev 自動註冊，不必 import；`RoughSketch.vue` 把 SVG 畫成手繪風格 |
| `setup/mermaid.ts` | Mermaid 全域設定（固定手繪線條的種子） |
| `uno.config.ts` | 讓 SVG 的 `font-size` 等屬性不被 UnoCSS 當成樣式；不要刪除 |
| `schemas/` | 協議 Schema 與 `workflow.json`，`validate` 與 `state` 依此驗證 |
| `output/check.json`、`output/slides-png/` | `pnpm run check` 的檢查結果與每頁截圖，網頁工作台會顯示 |
| `output/slides.pdf` | 匯出的 PDF 檔案 |
| `dist/index.html` | 匯出的單檔網頁簡報，雙擊即可離線放映（由 `vite.config.ts` 內嵌所有資源；需保留 `slides.md` 的 `routerMode: hash`） |

---

## 2. 工作流程

1. **規劃大綱（`/slide-outline`）**：規劃分頁結構、頁數與每頁核心訊息。**停下確認**，確認後狀態改為 `outlined`。
2. **撰寫內文（`/slide-draft`）**：編寫 `slides.md`，善用 Slidev 版型（`cover`、`two-cols`、`center`、`quote`）。講者備忘錄寫在每頁**最後一個** HTML 註解裡，例如 `<!-- 這裡停頓，先問聽眾 -->`。`pnpm run check` 通過後**停下確認**，確認後狀態改為 `drafted`。
3. **注入視覺（`/slide-visual`）**：SVG 架構圖、Mermaid 流程圖與時序圖、`<RoughSketch>` 手繪風格、Iconify 圖示、`<ThreeGlobe />` 等 3D 組件、`v-click` 動畫。WebGL 畫面在 PDF 中是點陣圖，需要閱讀的資訊放在 HTML / SVG。`pnpm run check` 通過後狀態改為 `visualized`。
4. **匯出簡報（`/slide-export`）**：`pnpm run export` 產生 `output/slides.pdf`；需要放映網頁時以 `pnpm run build` 打包為單檔網頁簡報（`dist/index.html`）。成功後狀態改為 `exported`，失敗改為 `failed` 並告知使用者原因。

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

---

## 4. 渲染檢查

`slides.md` 或 `components/` 改過之後、請使用者確認或匯出之前，一定要執行：

```bash
pnpm run check
```

它以 `slidev export` 相同的方式逐頁渲染，回報內容超出版面、文字被截斷、找不到的組件或圖示、無法編譯的頁面、載入失敗的圖片、空白畫布與執行錯誤（附頁碼與 `slides.md` 行號），並把每頁截圖存到 `output/slides-png/`。修到通過為止，並打開截圖親眼確認版面。
