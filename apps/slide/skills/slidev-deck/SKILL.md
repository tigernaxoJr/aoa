---
name: slidev-deck
description: 協助使用者在本機建立高質感 Slidev 簡報，結合 HTML/Tailwind、SVG 向量圖、Three.js 3D 視覺並匯出 PDF。使用者要求製作簡報、或資料夾中有 slide.start.json / slide.project.json 時使用。
---

# Slidev Deck Skill

本 Skill 指引 Coding Agent（如 Claude Code）在使用者本機以 Slidev 製作簡報，並透過 Slidev CLI 匯出 PDF。網頁工作台 {{SITE_URL}}/slide/ 只讀寫使用者授權的資料夾，所有內容與運算都留在本機。

- 協議：專案檔 [{{SITE_URL}}/api/slide/schemas/project.schema.json]({{SITE_URL}}/api/slide/schemas/project.schema.json)、進度檔 [{{SITE_URL}}/api/slide/schemas/activity.schema.json]({{SITE_URL}}/api/slide/schemas/activity.schema.json)、流程 [{{SITE_URL}}/api/slide/workflow.json]({{SITE_URL}}/api/slide/workflow.json)
- 視覺做法：[visual-guide.md](visual-guide.md)；匯出：[export-guide.md](export-guide.md)

---

## <a id="init"></a>1. 判斷狀態與初始化（`/slide-init`）

先看目前資料夾：

1. **有 `slide.project.json`** → 既有專案，跳到 §2 對應的階段（依 `status`：`initialized` → 大綱、`outlined` → 文案、`drafted` → 視覺、`visualized` → 匯出；`exported` → 已完成，問使用者要改哪裡，從對應階段重做後重新匯出；`failed` → 讀 `slide.activity.json` 的訊息找出匯出失敗的原因，修正後重新匯出）。
2. **只有 `slide.start.json`**（網頁準備的空資料夾，可能另有使用者上傳的 `references/`）→ 專案就建在這裡，不要另建子資料夾；網頁一直在看這個資料夾。
3. **都沒有** → 在目前工作資料夾建立 `<主題英文小寫>-slides`，先用白話向使用者確認位置。資料夾必須是空的或不存在。

初始化步驟：

1. **下載並驗證範本**（雜湊不符就停止並告知使用者，不使用該檔案）：
   ```bash
   curl -fsSL -o slidev-deck.zip {{SITE_URL}}/api/slide/templates/slidev-deck.zip
   curl -fsSL {{SITE_URL}}/api/slide/templates/slidev-deck/manifest.json
   node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('slidev-deck.zip')).digest('hex'))"
   ```
   比對 manifest 的 `zip.sha256` 後解壓：macOS / Linux `unzip -q slidev-deck.zip`；Windows PowerShell `Expand-Archive slidev-deck.zip -DestinationPath .`。解壓後刪除 zip。範本不含 `slide.start.json`、`slide.activity.json` 與 `references/`，不會覆蓋網頁寫的檔案。
2. **安裝依賴**：`pnpm install`。`pnpm run state` 要裝好依賴才能執行，所以在這之前網頁顯示的是它寫的「等待 Agent」；裝好後立刻 `pnpm run state activity --step init --message "範本已解壓，正在建立專案"`（匯出 PDF 需要 Chromium；第一次匯出若出現 `Executable doesn't exist`，執行 `pnpm exec playwright install chromium`）。
3. **確認要講什麼**：`slide.start.json` 的 `content` 是使用者寫的簡報內容（重點、章節、資料，或要讀取的本機檔案路徑），`notes` 是視覺偏好。`references/` 有檔案時全部讀過（用途見 `references/index.json`，讀法與規則見專案 `AGENTS.md`「參考資料」），它們和 `content` 一樣是簡報內容的來源。`content` 是空的、沒有 `slide.start.json`、或內容只有一個標題（且沒有參考資料）時，**先停下來問使用者**：這份簡報要傳達什麼、給誰看、有沒有現成資料可以參考。用 `pnpm run state activity --step init --message "請在對話中告訴我簡報要講什麼" --waiting` 讓網頁顯示正在等待。拿到內容前不規劃大綱。
4. **填寫專案檔**：範本的 `slide.project.json` 是佔位內容。有 `slide.start.json` 時以它為準（`title`、`audience`、`pagesCount`、`theme`、`aspectRatio`），`--description` 用一句話概括 `content`；沒有就用上一步問到的答案。`pagesCount` 沒填代表交給你評估：先省略 `--pages`，到大綱階段再依內容決定：
   ```bash
   pnpm run state project --id <英文小寫-連字號> --title "<主題>" --description "<一句說明>" --pages <頁數> --theme <主題風格> --status initialized
   ```
   `theme` 不是 `default` 時安裝對應套件（例如 `pnpm add @slidev/theme-seriph`），並同步修改 `slides.md` 開頭的 `theme:`。
   **把封面換成這份簡報**：範本的 `slides.md` 只有一頁佔位封面（「新簡報專案」），網頁工作台會直接顯示它。把開頭 frontmatter 的 `title:` 與 `# ` 標題改成使用者的主題，有 `audience` 就在標題下加一行副標（例如場合或受眾），`theme:` 與專案檔一致；刪掉佔位用的 HTML 註解。其餘頁面等大綱確認後再寫。
5. 執行 `pnpm run validate`，通過後進入大綱階段。

## 2. 製作流程

每開始一個階段、每次停下來等使用者回覆前，都更新進度檔（網頁會顯示）：

```bash
pnpm run state activity --step outline --message "正在規劃大綱"
pnpm run state activity --step outline --message "大綱完成，請在對話中確認或告訴我要改哪裡" --waiting
pnpm run state activity --step visual --slide 3 --total 8 --message "正在畫第 3 頁的架構圖"
```

`--waiting` 只對那一次寫入有效：使用者回覆後，下一次不加 `--waiting` 的 `state activity` 就會清掉等待狀態，不必另外處理。`--step` 只能是 `init`、`outline`、`draft`、`visual`、`export`、`idle`；`--status` 只能是 schema 列出的值。腳本會先依 `schemas/` 驗證、驗證失敗不寫檔，並以原子寫入（暫存檔改名）避免留下損壞的 JSON。

<a id="check"></a>**渲染檢查（`pnpm run check`）**：以 `slidev export` 相同的方式逐頁渲染，檢查內容超出版面、區塊文字被截斷、找不到的組件或 Iconify 圖示、無法編譯的頁面與畫不出來的 Mermaid 圖、載入失敗的圖片、空白畫布（WebGL 匯出會是空的）與執行錯誤。每頁截圖存到 `output/slides-png/<頁碼>.png`，結果寫入 `output/check.json`（網頁工作台會顯示每頁的截圖與問題）。有問題時結束碼為 1，並列出頁碼、`slides.md` 行號與原因。

- 每次修改 `slides.md` 或 `components/` 後、停下來請使用者確認前，都執行 `pnpm run check`，修到通過為止。
- 打開有問題頁面的截圖親眼確認版面；檢查通過也要抽看幾頁，留意文字過小、對比不足、版面擁擠等腳本抓不到的問題。
- 「這頁沒有渲染出來」通常是別頁的錯誤中斷了渲染，先修正其他頁的錯誤再重新檢查。

1. <a id="outline"></a>**規劃大綱（`/slide-outline`）**：只依使用者給的主題、內容、對象與資料擬定分頁大綱；範本的 `examples/showcase.md`（介紹 AOA 與 Slide Studio 的語法示範）不是內容來源，決定每頁的核心訊息與呈現方式。
   - **整體風格**：和大綱一起向使用者提出一種（依場合推薦，使用者說了就照用），之後每頁都照這個風格選工具：

     | `style` | 適合 | 視覺工具 |
     |---|---|---|
     | `formal` 正式 | 對外報告、提案、管理層 | 簡潔排版、內嵌 SVG 圖、Mermaid（範本配色）、Iconify 圖示；不用手繪與 3D |
     | `tech` 科技 | 技術分享、架構介紹、新人訓練 | 深色卡片、SVG 架構圖、Mermaid 流程圖與 `sequenceDiagram`、程式碼區塊；開場或氛圍頁可用 `<ThreeGlobe />` |
     | `whiteboard` 白板手繪 | 工作坊、腦力激盪、教學、輕鬆分享 | 圖一律用 `<RoughSketch>` 手繪，Mermaid 區塊都加 `{look: 'handDrawn'}`；不用 3D 與漸層卡片 |

   - **每頁的呈現方式**：在大綱中逐頁寫出（文字、SVG 圖、Mermaid 圖表類型、手繪圖、3D、引言）。有步驟、流程、先後順序的內容用 Mermaid `flowchart`；有角色之間來回呼叫（服務、API、人與系統）的用 `sequenceDiagram`；時程用 `gantt` / `timeline`（見 [visual-guide.md](visual-guide.md)）。
   **頁數**：使用者指定了 `pagesCount` 就照做（內容放不下時提出來討論，不要自行增減）；沒指定就依內容份量、受眾與場合評估，在大綱中寫明建議頁數與理由。
   向使用者展示大綱與風格並等待確認，確認後 `pnpm run state project --status outlined --pages <頁數> --style <formal|tech|whiteboard>`。之後的階段（可能在新的對話中）先讀 `slide.project.json` 的 `style` 再動手。
2. <a id="draft"></a>**撰寫簡報（`/slide-draft`）**：編輯 `slides.md`，以單獨一行的 `---` 分頁；每頁可在開頭用 frontmatter 指定版型：
   - `cover`：首頁與大標題；`two-cols`：左右雙欄（右欄以 `::right::` 開始）；`center`：聚焦單一重點；`quote`：引言。
   - **講者備忘錄**：寫在該頁**最後一個** HTML 註解裡（Slidev 的規則），例如 `<!-- 這裡先停頓，問聽眾是否用過 Agent -->`。不要寫成 `<!-- notes -->` 這種標籤；頁中其他註解不會被當成備忘錄。
   `pnpm run check` 通過後展示給使用者確認，`pnpm run state project --status drafted`。
3. **視覺升級（`/slide-visual`）**：見 [visual-guide.md](visual-guide.md)。先看 `slide.project.json` 的 `style`，照上表選工具：內嵌 SVG 架構圖、以 Mermaid 畫流程圖與時序圖、`whiteboard` 風格用 `<RoughSketch>` 手繪並在 Mermaid 加 `{look: 'handDrawn'}`、`tech` 風格可在關鍵頁使用 `<ThreeGlobe />` 等 3D 組件、以 `v-click` 逐步揭示。`pnpm run check` 通過後展示給使用者確認，`pnpm run state project --status visualized`。
4. **匯出簡報（`/slide-export`）**：見 [export-guide.md](export-guide.md)。通常在 `visualized` 之後；使用者不要視覺升級時也可以從 `drafted` 直接匯出。匯出前先確認 `pnpm run check` 通過。
   - **匯出 PDF**：`pnpm run export` 產出 `output/slides.pdf`。
   - **匯出網頁簡報**：`pnpm run build` 產出單檔網頁簡報 `dist/index.html`（雙擊即可離線放映；不要刪 `vite.config.ts` 或 `slides.md` 的 `routerMode: hash`）。
   - **匯出 PowerPoint**（使用者要求時）：`pnpm run export:pptx` 產出 `output/slides.pptx`：文字可編輯，SVG / Mermaid / 3D 是圖片、字型不內嵌、不含 `v-click` 動畫，匯出後告訴使用者。
   成功後 `pnpm run state project --status exported --pdf output/slides.pdf`（記下 PDF 路徑、時間與大小），再 `pnpm run state activity --step idle --message "匯出完成"`；失敗時 `--status failed` 並把錯誤用白話告訴使用者。

完成後告訴使用者可在網頁工作台 {{SITE_URL}}/slide/ 開啟這個資料夾預覽每一頁、PDF 與網頁。

---

## 3. 嚴格規則

1. **語言與溝通**：全程使用繁體中文（正體中文），大綱、撰寫、視覺三個階段結束時必須停下來讓使用者確認（初始化與匯出不必）。
2. **專案目錄規範**：新專案依 §1 下載範本、以 manifest SHA-256 驗證後解壓至目前目錄，依 slide.start.json 填寫 slide.project.json；嚴禁另建子資料夾。
3. **資料不離開本機**：不把使用者資料上傳到任何外部端點。
4. **單一真理來源**：簡報內容只在 `slides.md`；狀態只透過 `pnpm run state` 修改，不手寫 `slide.project.json` / `slide.activity.json`。
5. **先檢查再交付**：`pnpm run check` 沒通過，不請使用者確認、不匯出。
6. **內容來自使用者**：範本的 `examples/showcase.md` 只示範語法與組件用法，不要沿用它的主題或文字，也不要複製到 `slides.md`；使用者沒說要講什麼，就先問，不要自己挑主題。
7. **向量優先**：圖表與圖示優先使用 SVG、Mermaid 或 Iconify；文字與 SVG 在 PDF 中是向量。WebGL（Three.js）畫面匯出後是點陣圖，只用在裝飾或氛圍頁，不要用來承載需要放大閱讀的資訊。
