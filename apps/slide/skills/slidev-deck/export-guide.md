# PDF 與多元格式匯出指南 (export-guide.md)

本指南說明如何透過 Slidev 的 Playwright 匯出引擎輸出 PDF、含動畫步驟的 PDF 與圖片。

---

## 1. 匯出標準 PDF

```bash
pnpm run export
```

產出 `output/slides.pdf`（每頁一張）。Slidev 以 Chromium 列印頁面：文字、CSS 與 SVG 保持向量，放大不失真；WebGL / `<canvas>`（Three.js）會以點陣圖嵌入。

## 2. 匯出動畫步驟 PDF

簡報有許多 `v-click` 逐步出現效果，且使用者希望列印版保留每個步驟時，直接呼叫 Slidev CLI（`pnpm run export` 已固定輸出檔名，再加 `--output` 會重複）：

```bash
pnpm exec slidev export --with-clicks --output output/slides-clicks.pdf
```

## 3. 匯出 HTML 網頁簡報（方便放映展示）

```bash
pnpm run build
```

以 Slidev 原生 `slidev build` 打包，範本的 `vite.config.ts` 會把腳本、樣式與圖片全部內嵌成**單一檔案** `dist/index.html`，包含完整動畫、`v-click` 與鍵盤控制。雙擊即可離線放映，網頁工作台也能直接在新視窗開啟。

- 不要刪除 `vite.config.ts`，也不要移除 `slides.md` 開頭的 `routerMode: hash`：瀏覽器不允許 `file://` 或工作台的 blob 頁面載入外部模組腳本，拆檔的 build 或 history 路由開起來會是白畫面。
- 圖片放在 `public/` 或以相對路徑引用時會被內嵌；檔案很大時 `index.html` 也會跟著變大。
- 字型（Google Fonts）需要網路，離線時會改用系統字型。

### 講者模式

網頁簡報內建講者模式（目前頁、下一頁預覽、講者備忘錄與計時器）。在網址的 `#/` 後面加上 `presenter/` 進入：

```
dist/index.html#/presenter/1      ← 講者畫面，留在自己的螢幕
dist/index.html#/1                ← 觀眾畫面，拖到投影機按 F 全螢幕
```

開發預覽時一樣可以用：`http://localhost:3030/#/presenter/1`。

- 兩個視窗用瀏覽器內建的頻道同步，在講者畫面翻頁，觀眾畫面會跟著換頁，不需要伺服器。
- Chrome / Edge 直接雙擊開檔即可同步；Firefox 把每個本機檔案當成不同來源，可能不會同步。上台前先翻幾頁確認，不同步時在 `dist/` 執行 `npx serve` 改用 http 網址開啟。
- 講者備忘錄來自每頁**最後一個** HTML 註解，匯出前確認每頁都寫好了。

---

## 4. 匯出 PNG 圖片

適合分享到社群或製作縮圖：

```bash
pnpm run export:png
```

---

## 5. 匯出 PowerPoint（PPTX）

使用者需要 `.pptx`（例如要交給只用 PowerPoint 的人、或上傳到要求 Office 格式的系統）時：

```bash
pnpm run export:pptx
```

產出 `output/slides.pptx`，以 Slidev 的 `pptx-editable` 格式匯出：

- **文字可以編輯**：標題、段落、清單、卡片與色塊會轉成 PowerPoint 原生的文字框與圖形。
- **圖表是圖片**：SVG、Mermaid、`<RoughSketch>` 與 Three.js 畫面以圖片放在原位置，要改圖請改 `slides.md` 再重新匯出。無法轉換的頁面會整頁改用圖片，終端機會列出頁碼（`slide N: exported as an image`）。
- **字型不內嵌**：終端機會列出用到的字型，對方電腦沒有安裝時 PowerPoint 會換字，版面可能稍微跑掉。
- **不保留 `v-click` 動畫**：每頁匯出最終狀態，避免同一頁被拆成好幾張投影片；講者備忘錄會放進 PowerPoint 的備忘稿。

匯出後告訴使用者上述限制。使用者要和網頁完全一致的畫面（不需要編輯）時，改匯出成每頁一張圖片：

```bash
pnpm exec slidev export --format pptx --no-with-clicks --output output/slides.pptx
```

需要 ODP（LibreOffice Impress）時，以 LibreOffice 轉檔：`soffice --headless --convert-to odp --outdir output output/slides.pptx`。

---

## 6. 排錯與注意事項

- **Playwright 瀏覽器未安裝**：出現 `Executable doesn't exist at...` 時執行 `pnpm exec playwright install chromium`。
- **Three.js 畫面在 PDF 中空白**：`WebGLRenderer` 必須設定 `preserveDrawingBuffer: true`（範本的 `ThreeGlobe.vue` 已設定），否則列印時畫布已被清空。
- **匯出逾時或缺頁**：先 `pnpm run dev` 在瀏覽器確認每頁都能正常顯示，再匯出；組件不要依賴滑鼠互動才完成渲染。
- 匯出成功後執行 `pnpm run state project --status exported`，網頁工作台會自動偵測並預覽 `output/slides.pdf`。
