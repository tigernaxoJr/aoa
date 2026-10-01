---
name: product-video
description: 在使用者本機製作產品介紹影片：分析產品網址或原始碼、規劃分鏡與旁白、逐段產生語音與畫面並渲染，最後用 FFmpeg 合成。當使用者要做產品介紹影片、產品 demo 影片、宣傳短片，或目錄中有 video.project.json 並要求繼續、修改、重做某段、合成、翻譯影片時使用。
---

# Product Video

以 Agent Video Producer 協議（specVersion 1.0）在本機製作產品介紹影片。影片拆成多個獨立 scene，每段可單獨修改與重做；所有檔案與運算都留在使用者電腦上。

**先假設使用者不懂電腦操作**：他只會開 Agent 和網頁，不會開終端機、打指令或看懂路徑。所有指令由你執行；需要使用者動手時，給點擊式的逐步說明（見 §5）。

## 1. 判斷目前在哪裡

依序檢查：

1. **目前目錄有 `video.project.json`** → 已是影片專案。讀取專案根目錄的 `AGENTS.md`，**之後一律以它的規則為準**；執行 `pnpm run status` 取得各 scene 狀態與建議的下一步，再依使用者要求執行對應步驟（§3）。
2. **目前目錄沒有 `video.project.json`，但使用者提到某個影片專案目錄** → 請使用者確認後切換到該目錄，回到第 1 點。
3. **都沒有** → 這是新專案，執行 §2 初始化。

## 2. 初始化新專案（init）

1. **確認位置**：預設在目前的工作資料夾裡建立新資料夾 `<產品名稱英文小寫>-video`（例如 `acme-video`），用白話向使用者確認：「我會在『文件』資料夾裡建立 acme-video 來放影片專案，可以嗎？」。不要要求使用者提供路徑。目錄必須是空的或不存在；不要建立在產品原始碼資料夾裡面。之後的指令都在這個專案資料夾中執行。
2. **取得範本**：在專案目錄下載範本，以 manifest 的 `zip.sha256` 驗證後解壓，再刪除 zip。雜湊不符就停止並告知使用者，不使用該檔案。
   ```bash
   curl -fsSL -o product-video.zip {{SITE_URL}}/api/templates/product-video.zip
   curl -fsSL {{SITE_URL}}/api/templates/product-video/manifest.json
   node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('product-video.zip')).digest('hex'))"
   ```
   解壓：macOS / Linux 用 `unzip -q product-video.zip`；Windows 用 PowerShell `Expand-Archive product-video.zip -DestinationPath .`（Git Bash 內的 `tar` 無法解 zip）。
3. **收集來源**：至少需要以下一項，缺少時詢問使用者：
   - 產品網址（`sources.productUrl`）
   - 產品原始碼路徑（`sources.sourceCodePath`，唯讀，不修改該目錄）。使用者可能只說出資料夾名稱（網頁無法取得完整路徑）：依序在工作資料夾、它的上一層、使用者的「文件」「桌面」「下載」與常見程式碼資料夾（如 `~/code`、`~/source/repos`）尋找同名資料夾；找到一個就用白話確認，找到多個請使用者選，找不到就請使用者把資料夾從檔案總管／Finder 拖進對話框，或說出它放在哪裡。
   - 產品文字描述（`sources.description`）
   - （可選）風格參考影片網址（`sources.referenceVideoUrl`）
4. **確認格式**：語言、目標受眾、畫面比例（16:9 橫式 / 9:16 直式 / 1:1 / 4:5）、目標長度。使用者沒有偏好時沿用範本預設（zh-TW、16:9、1920×1080、30fps、45 秒）。
5. **填寫專案檔**：範本的 `video.project.json` 是可通過驗證的佔位內容，必須替換：
   - `project.id`：產生新的 UUID v4（範本為全 0，`pnpm run validate` 會視為未初始化）
   - `project.name`、`project.sources`、`project.language`、`project.targetAudience`、`project.format`
   - `project.tts.voice`：依語言選擇（見 §4）
   - `updatedAt`：目前時間
   新專案沒有其他寫入者，這一次可以直接編輯 `video.project.json`；之後一律依 `AGENTS.md` 透過 `pnpm run state` 修改。
6. **安裝與檢查**：由你執行，不要請使用者打指令。
   - **Node.js**（20.12 以上，`node -v`）：沒有時先說明「需要安裝一個叫 Node.js 的免費工具」並取得同意。可以代為安裝時（Windows `winget install OpenJS.NodeJS.LTS`、macOS `brew install node`）就代為執行；不行時給點擊式步驟：「打開 https://nodejs.org → 按左邊綠色的 LTS 下載 → 打開下載的檔案 → 一直按『下一步』直到完成 → 完成後告訴我」。安裝後可能需要重新開啟 Agent 的對話。
   - **pnpm**（安裝套件用的工具，`pnpm -v`）：沒有時說明並取得同意後代為安裝（Windows `winget install pnpm.pnpm`、macOS `brew install pnpm`；兩者都不能用時 `npm install -g pnpm`）。安裝後可能需要重新開啟 Agent 的對話。
   - 執行 `pnpm install`（會一併取得 FFmpeg）。
   - 瀏覽器：已有 Chrome 或 Edge 就不需要其他動作；都沒有時，取得同意後執行 `pnpm exec playwright install chromium`。
   - 不使用系統管理員權限、不修改系統設定；安裝需要使用者點擊確認時，告訴他會看到什麼視窗、要按哪個按鈕。
7. **Gates**：依 `schemas/workflow.json` 的 `gates`，用白話說明並取得確認：
   - `onlineTtsConsent`：例如「旁白語音會用微軟的線上語音服務產生，旁白文字會傳給微軟。可以嗎？不行的話可以改用電腦內建的語音或自己錄音。」。使用者不同意時，改選離線 provider 或 `manual`。
   以 `pnpm run state` 寫入結果。
8. **驗證**：執行 `pnpm run validate`，通過後告知使用者專案已建立、資料夾在哪裡（用「文件 > acme-video」這種說法），並直接問他是否要開始分析產品（即 analyze 步驟），不必要求他輸入指令。

## 3. 各步驟的做法

工作流程的權威定義是專案內的 `schemas/workflow.json`（步驟順序、前置狀態、狀態轉換、checkpoint）。以下檔案說明每一步**怎麼做好**：

| 步驟 / 操作 | 參考 |
|---|---|
| `/video-analyze` 分析產品 | [workflow.md#analyze](workflow.md#analyze) |
| `/video-storyboard` 分鏡與旁白 | [script-guide.md](script-guide.md) |
| `/video-scene` 產生 scene | [rendering-guide.md](rendering-guide.md) |
| `/video-assemble` 合成 | [rendering-guide.md#assemble](rendering-guide.md#assemble) |
| `/video-sync` 同步變更 | [workflow.md#sync](workflow.md#sync) |
| `/video-translate` 翻譯 | [workflow.md#translate](workflow.md#translate) |

只在執行到該步驟時才讀取對應檔案。

## 4. 預設聲音

| language | edge-tts 聲音 |
|---|---|
| `zh-TW` | `zh-TW-HsiaoChenNeural`（女）、`zh-TW-YunJheNeural`（男） |
| `zh-CN` | `zh-CN-XiaoxiaoNeural`（女）、`zh-CN-YunxiNeural`（男） |
| `en-US` / `en` | `en-US-AriaNeural`（女）、`en-US-GuyNeural`（男） |
| `ja` | `ja-JP-NanamiNeural`（女）、`ja-JP-KeitaNeural`（男） |

其他語言執行 `pnpm run tts --list-voices` 查詢目前 provider 可用的聲音。使用其他 provider 時，聲音名稱依該 provider 的格式。

## 5. 與使用者互動的原則

- **使用者不需要知道任何指令**：他用白話說「繼續」「第三段文案改成…」「重做開場」即可，你對應到工作流程的步驟（`/video-…` 指令只是有經驗的人的捷徑）。所有 `pnpm run …` 都由你執行。
- **說白話**：避免 JSON、pnpm、scene、render、commit 等術語；必須提到時順便解釋（例如「scene，也就是影片的一段」）。一次只問一件事，給選項時附上建議。
- **需要使用者動手時**（安裝軟體、允許權限、在網頁上按按鈕）：寫成編號步驟，說明會看到什麼、按哪裡、完成後回覆什麼。

- **checkpoint 一定停下**：分鏡完成後、每個 scene 渲染後，列出結果並等使用者確認或提出修改。
- **修改只重做受影響的部分**：使用者說「第三段文案改成…」，只改該 scene 的 `script.md`，只重做該 scene，再重新合成。
- **告訴使用者怎麼看成果**：用「文件 > acme-video > scenes > 003-solution > output > scene.mp4」這種資料夾順序描述位置，並建議打開網頁工作台 {{SITE_URL}}/ ，在步驟 4 選擇專案資料夾，就能預覽每一段、直接修改旁白。
- **Web UI**：使用者可能同時開著 Agent Video Producer 網頁工作台，它會直接修改專案檔。使用者說「我在網頁上改好了」時，執行 `/video-sync`。
