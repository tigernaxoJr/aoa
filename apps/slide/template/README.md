# Slidev 簡報專案

這是一個以 Slidev 與 AOA 模式建立的簡報專案，所有檔案與運算都留在你的電腦上。

## 本機預覽與匯出

```bash
# 安裝依賴
pnpm install

# 啟動本機即時預覽（http://localhost:3030）
pnpm run dev

# 匯出 PDF 到 output/slides.pdf
pnpm run export

# 匯出 PowerPoint 到 output/slides.pptx（文字可編輯，圖表為圖片）
pnpm run export:pptx

# 打包單檔網頁簡報到 dist/index.html（雙擊即可離線放映）
pnpm run build
```

## 講者模式

網頁簡報有講者畫面：目前頁、下一頁預覽、講者備忘錄與計時器。在網址的 `#/` 後面加上 `presenter/`：

- 講者畫面：`dist/index.html#/presenter/1`（開發預覽時是 `http://localhost:3030/#/presenter/1`）
- 觀眾畫面：`dist/index.html#/1`，拖到投影機後按 F 全螢幕

在講者畫面翻頁，觀眾畫面會跟著換頁。Chrome / Edge 直接開檔即可同步；如果不同步（例如 Firefox），在 `dist/` 執行 `npx serve`，改用它提供的 http 網址開啟。上台前先翻幾頁確認。

想看進度、逐頁預覽或檢視 PDF，可以打開網頁工作台 {{SITE_URL}}/slide/ ，選擇這個資料夾。
