# Slidev Deck Project — Agent 規則

本目錄是一個基於 Slidev 的簡報專案，遵循 Slide Studio AOFA 協議。
你的任務是依循工作流程，在本機協助使用者生成高質感的簡報，並透過 Slidev CLI 匯出 PDF。

---

## 1. 核心檔案與角色

| 檔案 | 說明 |
|---|---|
| `slides.md` | Slidev 主簡報 Markdown 文件，以 `---` 分頁 |
| `slide.project.json` | 專案設定檔（主題、標題、頁數、狀態） |
| `slide.activity.json` | 即時進度回報（供前端網頁輪詢顯示） |
| `components/*.vue` | 自訂 Vue 3 / Three.js / SVG 組件（自動註冊免 import） |
| `output/slides.pdf` | 匯出的最終向量 PDF 簡報 |

---

## 2. 工作流程 (Workflow)

1. **規劃大綱 (`/slide-outline`)**：
   - 根據使用者主題，規劃分頁結構、頁數、每頁核心資訊與視覺形式。
   - 記錄到 `slide.project.json`，並更新 `slide.activity.json`。
   - **停下確認**：向使用者展示大綱，等待確認。
2. **編寫內文 (`/slide-draft`)**：
   - 編寫 `slides.md`。善用 Slidev 內建 layout（`cover`, `two-cols`, `center`, `quote` 等）。
   - 每頁底部以 `<!-- notes -->` 撰寫講者備忘錄。
3. **注入視覺 (`/slide-visual`)**：
   - 加入 SVG 向量架構圖、流程圖、Iconify 標籤。
   - 在關鍵頁面使用 `<ThreeGlobe />` 等 Three.js 3D 組件。
   - 設定 `v-click` 揭示動畫。
4. **匯出 PDF (`/slide-export`)**：
   - 執行 `pnpm run export` 產生 `output/slides.pdf`。
   - 更新狀態為 `exported`。

---

## 3. 狀態更新守則

任何工作階段開始與等待使用者時，使用腳本更新狀態：

```bash
# 回報正在進行的工作
node scripts/state.mjs activity --message "正在編寫第 3 頁架構圖" --step visual --slide 3 --total 8

# 等待使用者回覆確認
node scripts/state.mjs activity --message "大綱規劃完成，請確認是否繼續" --step outline --waiting

# 更新專案狀態
node scripts/state.mjs project --status drafted --pages 8
```
