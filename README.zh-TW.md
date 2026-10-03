# AOFA：代理卸載式前端架構 (Agent-Offloaded Frontend Architecture)

[English](README.md) | **繁體中文** | [官方網站](https://aofa.tigernaxo.com/)

**AOFA** 是一種「後端不跑 AI」的現代 AI 產品架構模式。網頁應用只是一份靜態的**協議皮囊（Protocol Shell）**；**使用者手上既有的 Coding Agent**（Claude Code、Codex、Cursor、Gemini CLI、Pi 等）才是負責推理與執行的心臟引擎。

```
[ 靜態 Web UI ]  ──File System Access API──▶  [ 本機資料夾 (SSOT) ]  ◀──▶  [ 使用者的 Coding Agent ]
  工作台、Schema                                 規格、狀態、素材               本機工具 (FFmpeg, Playwright, TTS)
  驗證器、編輯器                                                                LLM：Agent 的雲端（預設）／本機模型（可選）
```

---

## 核心概念

- **零推論控制層**：應用以靜態檔案發佈（如 GitHub Pages），不跑模型、不做重度運算，服務商的邊際算力成本趨近於零。
- **自備 Agent（BYOA, Bring Your Own Agent）**：推論走使用者既有的 Agent 方案，或改接自建模型完全離線；應用方不付任何推論費用。
- **Schema 即合約**：UI 與 Agent 透過公開的 JSON Schema 協作，而非私有 API；UI 隨時校驗 Agent 寫入的所有內容。
- **檔案系統即匯流排**：本機資料夾是唯一真實來源（SSOT），UI 以輕量檔案中繼資料特徵碼偵測變更。
- **資料邊界由使用者決定**：使用者資料不經過應用方伺服器；唯一會看到上下文的第三方是使用者自選的 LLM 供應商（改用本機模型則完全離線）。

AOFA 也適用於有後端的系統：帳號、計費、團隊協同留在輕量的雲端控制平面，算力與資料留在使用者端。

---

## 官方參考實作 (Live Workbenches)

本倉庫內建完整的 AOFA 參考實作工具，供線上體驗與二次開發：

| 工具工作台 | 路由路徑 | 通訊模式 | 特色技術與說明 |
|---|---|---|---|
| **Slide Studio** | [`/slide/`](https://aofa.tigernaxo.com/slide/) | **模式 A：純工作台** | 純 FSA API + Slidev + Three.js 3D 視覺 + 向量 SVG 圖表 + Playwright 無損向量 PDF 匯出（零常駐伴侶、極簡零依賴）。 |
| **Video Studio** | [`/video/`](https://aofa.tigernaxo.com/video/) | **模式 B：伴侶增強** | FSA API + 本機 Companion WebSocket 配對，將產品網址自動轉為包含繁中配音（TTS）、動態截圖與 FFmpeg 合成的展示影片。 |

---

## 核心文獻與論文

| 文件 | 說明 |
| :--- | :--- |
| [架構說明 (繁中)](docs/architecture.zh-TW.md) · ([English](docs/architecture.md)) | 完整規格：原則、通訊模式（模式 A/B/C）、安全模型與限制 |
| [Introducing AOFA](posts/2026-10-introducing-aofa.md) | 深度介紹此架構的技術長文（英文） |
| [論文提案草稿](paper/proposal.md) | 學術論文提案草稿（英文，Agent-Offloaded Frontend Architecture） |

---

## 雲端 GenAI SaaS vs. AOFA

| 比較項目 | 雲端 GenAI SaaS | AOFA 代理卸載式架構 |
|---|---|---|
| **主機託管** | GPU 主機、資料庫、巨額流量費 | CDN 上的純靜態檔案（GitHub Pages） |
| **推論成本** | 服務商先行墊付，轉嫁為訂閱制 | 使用者自備 Agent（Claude Code/Cursor）或本機模型 |
| **資料隱私** | 上傳並儲存在服務商雲端資料庫 | 留在使用者本機磁碟，完全不出本機 |
| **產物透明度** | 黑盒介面，不滿意只能碰運氣重跑 | 透明標準檔案（Markdown、SVG、Vue、MP4），隨意修改 |
| **系統維運** | 7x24 小時後端監控與告警 | 零後端需要維運 |

---

## 本機開發與指令

需要 Node.js 20.12+ 與 pnpm：

```bash
pnpm install
```

```bash
# 啟動總覽入口
pnpm run dev:portal

# 啟動 Slide Studio 簡報工作台
pnpm run dev:slide

# 啟動 Video Studio 影片工作台
pnpm dev

# 執行全站測試（129+ tests）
pnpm test

# 全站打包構建
pnpm run build
```

---

## 授權聲明

© 2026 tigernaxo。本作品採用 [創用 CC 姓名標示 4.0 國際授權條款（CC BY 4.0）](LICENSE)。只要適當標示出處，即可自由分享與改作。
