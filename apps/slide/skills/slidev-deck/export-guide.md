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

---

## 4. 匯出 PNG 圖片

適合分享到社群或製作縮圖：

```bash
pnpm run export:png
```

---

## 5. 排錯與注意事項

- **Playwright 瀏覽器未安裝**：出現 `Executable doesn't exist at...` 時執行 `pnpm exec playwright install chromium`。
- **Three.js 畫面在 PDF 中空白**：`WebGLRenderer` 必須設定 `preserveDrawingBuffer: true`（範本的 `ThreeGlobe.vue` 已設定），否則列印時畫布已被清空。
- **匯出逾時或缺頁**：先 `pnpm run dev` 在瀏覽器確認每頁都能正常顯示，再匯出；組件不要依賴滑鼠互動才完成渲染。
- 匯出成功後執行 `pnpm run state project --status exported`，網頁工作台會自動偵測並預覽 `output/slides.pdf`。
