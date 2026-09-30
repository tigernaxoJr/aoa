---
name: product-video
description: 在使用者本機製作產品介紹影片：分析產品網址或原始碼、規劃分鏡與旁白、逐段產生語音與畫面、以 Remotion 或 HTML 擷取渲染，最後用 FFmpeg 合成。當使用者要做產品介紹影片、產品 demo 影片、宣傳短片，或目錄中有 video.project.json 並要求繼續、修改、重做某段、合成、翻譯影片時使用。
---

# Product Video

以 Agent Video Producer 協議（specVersion 1.0）在本機製作產品介紹影片。影片拆成多個獨立 scene，每段可單獨修改與重做；所有檔案與運算都留在使用者電腦上。

## 1. 判斷目前在哪裡

依序檢查：

1. **目前目錄有 `video.project.json`** → 已是影片專案。讀取專案根目錄的 `AGENTS.md`，**之後一律以它的規則為準**；執行 `npm run status` 取得各 scene 狀態與建議的下一步，再依使用者要求執行對應步驟（§3）。
2. **目前目錄沒有 `video.project.json`，但使用者提到某個影片專案目錄** → 請使用者確認後切換到該目錄，回到第 1 點。
3. **都沒有** → 這是新專案，執行 §2 初始化。

## 2. 初始化新專案（init）

1. **確認位置**：詢問使用者專案要建立在哪個目錄。目錄必須是空的或不存在；不要在產品本身的原始碼目錄裡建立。
2. **取得範本**：在專案目錄下載範本，以 manifest 的 `zip.sha256` 驗證後解壓，再刪除 zip。雜湊不符就停止並告知使用者，不使用該檔案。
   ```bash
   curl -fsSL -o product-video.zip {{SITE_URL}}/api/templates/product-video.zip
   curl -fsSL {{SITE_URL}}/api/templates/product-video/manifest.json
   node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('product-video.zip')).digest('hex'))"
   ```
   解壓：macOS / Linux 用 `unzip -q product-video.zip`；Windows 用 PowerShell `Expand-Archive product-video.zip -DestinationPath .`（Git Bash 內的 `tar` 無法解 zip）。
3. **收集來源**：至少需要以下一項，缺少時詢問使用者：
   - 產品網址（`sources.productUrl`）
   - 產品原始碼路徑（`sources.sourceCodePath`，唯讀，不修改該目錄）
   - 產品文字描述（`sources.description`）
   - （可選）風格參考影片網址（`sources.referenceVideoUrl`）
4. **確認格式**：語言、目標受眾、畫面比例（16:9 橫式 / 9:16 直式 / 1:1 / 4:5）、目標長度。使用者沒有偏好時沿用範本預設（zh-TW、16:9、1920×1080、30fps、45 秒）。
5. **填寫專案檔**：範本的 `video.project.json` 是可通過驗證的佔位內容，必須替換：
   - `project.id`：產生新的 UUID v4（範本為全 0，`npm run validate` 會視為未初始化）
   - `project.name`、`project.sources`、`project.language`、`project.targetAudience`、`project.format`
   - `project.tts.voice`：依語言選擇（見 §4）
   - `updatedAt`：目前時間
   新專案沒有其他寫入者，這一次可以直接編輯 `video.project.json`；之後一律依 `AGENTS.md` 透過 `npm run state` 修改。
6. **安裝與檢查**：執行 `npm install`；檢查 `ffmpeg -version`、`ffprobe -version`、Playwright 瀏覽器（`npx playwright install chromium` 由使用者同意後執行）。缺少的系統工具只告知安裝方式，不自行以系統權限安裝。
7. **Gates**：依 `schemas/workflow.json` 的 `gates`，向使用者說明並取得確認：
   - `rendererLicense`：Remotion 授權級距。使用者不符合免費條件且未購買授權時，改用 `html-capture`。
   - `onlineTtsConsent`：旁白文字會送到 TTS 服務。使用者不同意時，改選離線 provider 或 `manual`。
   以 `npm run state` 寫入結果。
8. **驗證**：執行 `npm run validate`，通過後告知使用者專案已建立，下一步是 `/video-analyze`。

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

其他語言執行 `npm run tts -- --list-voices` 查詢目前 provider 可用的聲音。使用其他 provider 時，聲音名稱依該 provider 的格式。

## 5. 與使用者互動的原則

- **checkpoint 一定停下**：分鏡完成後、每個 scene 渲染後，列出結果並等使用者確認或提出修改。
- **修改只重做受影響的部分**：使用者說「第三段文案改成…」，只改該 scene 的 `script.md`，只重做該 scene，再重新合成。
- **回報具體路徑**：完成時告知檔案位置（例如 `scenes/003-solution/output/scene.mp4`），讓使用者可以直接開啟預覽。
- **Web UI**：使用者可能同時開著 Agent Video Producer 網頁工作台，它會直接修改專案檔。使用者說「我在網頁上改好了」時，執行 `/video-sync`。
