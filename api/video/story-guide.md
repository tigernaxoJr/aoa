# Agent Video Producer — 故事動畫影片 Agent 指引

> 給任何能讀檔、執行指令的 Coding Agent。本文件與 story-video Skill 的 `SKILL.md` 內容相同；支援 Agent Skills 的 Agent 可改為安裝 Skill（見文末）。
> 網站只提供規則與範本，不執行任何 AI 或渲染；所有工作都在使用者的電腦上完成。

以 Agent Video Producer 協議（specVersion 1.0）在本機把使用者的故事做成動畫影片。整部片由你用 SVG 畫出來：先和使用者把故事整理好，再定下角色長相與聲音，然後逐段（scene）畫動畫、配旁白與對白。每段可單獨修改與重做；所有檔案與運算都留在使用者電腦上。

這和產品介紹影片（Skill `product-video`）共用同一套製作工具，只有範本的流程與網頁工作台（https://aoa.tigernaxo.com/video/）不同：**沒有產品要分析，故事與角色才是素材**。

**先假設使用者不懂電腦操作**：他只會開 Agent 和網頁，不會開終端機、打指令或看懂路徑。所有指令由你執行；需要使用者動手時，給點擊式的逐步說明。

## 1. 判斷目前在哪裡

和產品影片相同，依 [product-video SKILL.md §1](https://aoa.tigernaxo.com/api/video/skills/product-video/SKILL.md) 的順序找專案資料夾（`video.start.json` 的識別碼、拖進對話框的資料夾等），只是：

- **已有 `video.project.json`**：先依 [同步範本](https://aoa.tigernaxo.com/api/video/skills/product-video/SKILL.md#sync-template) 把專案工具更新到網站上的版本（故事影片改用 https://aoa.tigernaxo.com/api/video/templates/product-video/manifest.json 與 https://aoa.tigernaxo.com/api/video/templates/product-video.zip），再讀專案根目錄的 `AGENTS.md`，**之後一律以它的規則為準**。`project.kind` 是 `story` 就照本 Skill 繼續；是 `product`（或沒有 `kind`）就是產品影片，改照 product-video Skill。執行 `pnpm run status` 取得建議的下一步。
- **新專案**：執行 §2。

## 2. <a id="init"></a>初始化新專案（init）

1. **確認位置**：有 `video.start.json` 時專案就建在目前目錄（使用者上傳的 `references/` 也在這裡，範本解壓不會覆蓋它）。否則在目前的工作資料夾裡建立 `<故事名英文小寫>-video`（例如 `moon-fox-video`），用白話確認：「我會在『文件』資料夾裡建立 moon-fox-video 來放這部影片，可以嗎？」不要要求使用者提供路徑。
2. **取得範本**：做法同 [product-video SKILL.md §2 第 2 點](https://aoa.tigernaxo.com/api/video/skills/product-video/SKILL.md#init)，但改用故事影片的範本：下載 https://aoa.tigernaxo.com/api/video/templates/product-video.zip，以 https://aoa.tigernaxo.com/api/video/templates/product-video/manifest.json 的 SHA-256 驗證、解壓、刪除 zip。
3. **收集故事與語音設定**：有 `video.start.json` 時先讀它（`kind` 為 `story`；`story` 是使用者在網頁填的故事或點子，`audience` 是觀看對象，`ttsProvider` 是偏好的語音引擎，預設為 `cosyvoice3`）。已填的不要再問。沒有時問一句：「想做成影片的故事是什麼？可以貼整篇故事，也可以只說一個點子，例如『一隻怕黑的小貓學會看星星』。」
   - 故事不論長短，原文寫入 `sources.story`；這一步**不改寫**，整理是下一步的事。
   - 使用者給的是檔案（Word、PDF、文字檔）時，讀出文字放進 `sources.story`，告訴他「我讀到了，共約 N 字」。
   - `references/` 有檔案時全部讀過（用途見 `references/index.json`，讀法與規則見專案 `AGENTS.md`「參考資料」）：故事原稿同樣讀進 `sources.story`；角色草圖、喜歡的畫風等圖片留到美術步驟當作設定依據，用途沒寫的問一句。`video.start.json` 的 `story` 是空的但參考資料裡有故事時，不必再問故事是什麼。
4. **確認對象、畫風與格式**：一次問一件事並附建議：
   - **觀看對象**（`video.start.json` 有 `audience` 時只要確認一句）：例如「學齡前小朋友」「國小學生」「大人（社群短片）」「家人朋友（紀念用）」。對象決定用詞、長度與節奏。
   - **畫風**：給 2–3 個選項並標出建議，例如「溫暖繪本風（柔和色塊、圓潤線條）」「扁平可愛風（高彩度、粗外框）」「剪紙風（紙張質感、分層）」「簡筆線條風（黑白線條加一個重點色）」「蠟筆／草圖風（手繪抖動線條、斜線上色）」。寫入 `project.style`，細節在美術步驟再定。畫風決定用什麼工具畫（對照表見 [design-guide.md#style](https://aoa.tigernaxo.com/api/video/skills/story-video/design-guide.md#style)）：**簡筆線條風、蠟筆／草圖風的場景與道具用 Rough.js 畫成手繪線條**，需要在專案安裝 `roughjs`，選定時就依專案 `AGENTS.md` 硬性規則 11 用白話取得同意（「這個畫風要裝一個畫手繪線條的小工具 roughjs，可以嗎？」），同意後 `pnpm add roughjs`。
   - 語言、畫面比例：沒有偏好時用 zh-TW、16:9（1920×1080、30fps）；要放上短影音平台時建議 9:16。
   - **字幕**：故事影片常給小朋友看，建議「印在畫面上」（`project.captions.mode: burn`）；不要的話用預設 `srt`。
   - **目標長度先不定案**：先填 60 秒，整理完故事再依故事長度建議。
5. **填寫專案檔**：範本的 `video.project.json` 是佔位內容，必須替換：
   - `project.id`：新的 UUID v4；`project.kind`：`"story"`；`project.name`：故事名
   - `project.sources`：`{ "story": "<原文>" }`（不需要 `productUrl` 等產品欄位）
   - `project.customMotion`：`"allow"`（故事的每一段都是你畫的動畫，不逐段詢問）
   - `project.language`、`project.targetAudience`、`project.style`、`project.format`、`project.captions`
   - `project.tts`：旁白的聲音，先依 `ttsProvider`（沒有就是 `cosyvoice3`）填；第 7 點使用者改選其他引擎時，以 `pnpm run state` 改寫。使用 CosyVoice 3 時設為 `{ "provider": "cosyvoice3", "voice": "中文女 <用溫暖柔和的繪本旁白語氣>" }`，角色的聲音在美術步驟由你自動依角色性格配置，寫在 `project.cast`（§4）
   - `updatedAt`：目前時間
   新專案沒有其他寫入者，這一次可以直接編輯 `video.project.json`；之後一律依 `AGENTS.md` 透過 `pnpm run state` 修改。
6. **安裝與檢查**：照 [product-video SKILL.md §2 第 6 點](https://aoa.tigernaxo.com/api/video/skills/product-video/SKILL.md#init)（Node.js、pnpm、`pnpm install`、瀏覽器）。故事影片不錄網頁，但渲染動畫仍需要瀏覽器。
7. **Gate `onlineTtsConsent`、`asrConsent` 與語音引擎**：
   - 故事影片推薦使用 **CosyVoice 3 智慧角色配音**；`video.start.json` 的 `ttsProvider` 是 `edge-tts` 時改用微軟語音，照 [product-video SKILL.md](https://aoa.tigernaxo.com/api/video/skills/product-video/SKILL.md#init) 的 `onlineTtsConsent` 問法確認，不要再推薦 CosyVoice 3。使用 CosyVoice 3 時向使用者確認（括號裡的例子換成**這個故事**的角色，不要沿用下面的佔位文字）：
     「影片中的旁白與角色對白，預計會使用 **CosyVoice 3 智慧語音** 產生自然生動的聲音，在後續角色設計階段，我會**自動配合每位角色的年齡、個性與情境配上專屬語氣指令**（例如〈角色甲〉用〈適合他的語氣〉、〈角色乙〉用〈適合他的語氣〉），亦支援自行錄音克隆。〔這台電腦還沒裝過時加這句：第一次使用要先安裝語音程式與模型，約需下載數 GB、佔用數 GB 硬碟空間，之後每部影片共用；製作時會在背景開一個本機語音服務。〕〔連到遠端語音服務時改說：台詞會傳送至該服務轉換。〕
     • 請問可以使用嗎？（若想使用微軟 Edge-TTS 或電腦內建離線語音，也可以告訴我改用）」
   - 使用者同意（回覆「可以」或「好」）時：用本機 CosyVoice 3 不必記錄 `onlineTts`（資料不出電腦），依 `AGENTS.md` 取得安裝同意後執行 `pnpm run cosyvoice:setup`；用遠端服務或 Edge-TTS 時以 `pnpm run state` 記錄 `project.tts.consent.onlineTts: true`。故事影片沒有 `productLogin`、`domEditConsent`。
   - **`asrConsent`（自動檢查發音）**：若欲啟用發音自我校正，向使用者說明：「系統具備語音合成後自動以本地 ASR 回聽檢查發音的功能。這需要使用本機開源模型，我會依您的硬體規格自動挑選：具備獨立顯卡（VRAM ≥ 4GB）預設推薦 **Qwen/Qwen3-ASR-1.7B**；無獨立顯卡或 CPU 輕量環境預設推薦 **Qwen/Qwen3-ASR-0.6B**（佔用小於 1.5GB、推論極快）。全程在本機執行、完全無雲端隱私疑慮。請問是否同意啟用並安裝？」同意時以 `pnpm run state` 記錄 `project.asr`，不同意則設為 `none`。
8. **驗證**：`pnpm run validate`，通過後告訴使用者專案建好了、資料夾在哪裡，並直接問他要不要開始整理故事。

## 3. 各步驟的做法

工作流程的權威定義是專案內的 `schemas/workflow.json`；有 `kinds` 的步驟只適用於該類型（故事專案跳過 `analyze`）。

| 步驟 / 操作 | 完成後狀態 | 參考 |
|---|---|---|
| `/video-story` 整理故事 | `analyzed` | [story-guide.md#develop](https://aoa.tigernaxo.com/api/video/skills/story-video/story-guide.md#develop) |
| `/video-design` 美術與角色 | `designed` | [design-guide.md](https://aoa.tigernaxo.com/api/video/skills/story-video/design-guide.md) |
| `/video-storyboard` 分鏡、旁白與對白 | `script_generated` | [story-guide.md#storyboard](https://aoa.tigernaxo.com/api/video/skills/story-video/story-guide.md#storyboard)；**自行評估並嚴格控制單段長度（4–8秒最佳，勿超過12秒），避免視覺元素過多難以繪製與動畫**；已有 scene 時見 [story-guide.md#revise](https://aoa.tigernaxo.com/api/video/skills/story-video/story-guide.md#revise) |
| `/video-scene` 產生 scene | `producing` → `ready_to_assemble` | [design-guide.md#animate](https://aoa.tigernaxo.com/api/video/skills/story-video/design-guide.md#animate)，渲染流程見 [rendering-guide.md](https://aoa.tigernaxo.com/api/video/skills/story-video/rendering-guide.md)；善用 CSS drop-shadow 落地陰影、環境光暈與混合模式提升繪本電影感 |
| `/video-assemble` 合成 | `completed` | [rendering-guide.md#assemble](https://aoa.tigernaxo.com/api/video/skills/story-video/rendering-guide.md#assemble) |
| `/video-sync` 同步變更 | — | [workflow.md#sync](https://aoa.tigernaxo.com/api/video/skills/product-video/workflow.md#sync) |
| `/video-translate` 翻譯 | — | [workflow.md#translate](https://aoa.tigernaxo.com/api/video/skills/product-video/workflow.md#translate)；`project.cast` 的 `name` 要一起翻譯，`script.md` 的【角色名】也要跟著改 |

只在執行到該步驟時才讀取對應檔案。

## 4. <a id="voices"></a>聲音與 AI 自動角色配音

旁白用 `project.tts`，每個角色在 `project.cast` 裡有自己的 `voice`（與可選的 `provider`）。同一部片裡，旁白和每個角色的聲音要聽得出差別。

- **CosyVoice 3 智慧角色配音（強烈推薦）**：
  - **AI 自動匹配角色音色**：Agent 在 `/video-design` 階段規劃角色設定時，**必須主動根據故事中角色的身分、年齡、性格特質與情感狀態，自動為每個角色設定最適配的 CosyVoice 3 自然語言指令（Instruct）**，無需使用者手動編寫！
  - **指令語法**：`基礎發音人 <自然語言語氣指令>`（基礎發音人可為 `中文男`、`中文女`、`粵語女`、`日語男`、`韓語女`、`英語男` 等）。
  - **語法範例（取自另一部影片《茶香與畫筆：古阿明的故事》，只示範寫法；角色與語氣一律依使用者的故事重新設計，不要沿用）**：
    - 主角阿明：`provider: "cosyvoice3", voice: "中文男 <用純真熱情、體弱但熱愛畫畫的小男孩語氣>"`
    - 父親（老茶農）：`provider: "cosyvoice3", voice: "中文男 <用歷經滄桑、疲憊但充滿慈愛的老茶農語氣>"`
    - 郭老師：`provider: "cosyvoice3", voice: "中文男 <用充滿熱忱與理想的年輕美術老師語氣>"`
    - 旁白：`provider: "cosyvoice3", voice: "中文女 <用溫暖柔和、娓娓道來且微帶感傷的繪本旁白語氣>"`
  - **聲音克隆**：引導使用者在網頁工作台「角色工坊」錄音 3-5 秒（存成 `@/assets/cast/<id>/voice-sample.wav`），`voice` 欄位填入該音檔路徑。
- **微軟 Edge-TTS 標準發音人庫**：
  - 台灣華語 `zh-TW`：`zh-TW-HsiaoChenNeural`（女，溫和，適合旁白）、`zh-TW-HsiaoYuNeural`（女，較年輕）、`zh-TW-YunJheNeural`（男）。
  - `zh-CN`：`zh-CN-XiaoxiaoNeural`（女）、`zh-CN-XiaoyiNeural`（女，活潑）、`zh-CN-YunxiNeural`（男，年輕）、`zh-CN-YunxiaNeural`（男孩）、`zh-CN-YunjianNeural`（男，渾厚）。
  - `en-US`：`en-US-AriaNeural`、`en-US-JennyNeural`、`en-US-AnaNeural`（女孩）、`en-US-GuyNeural`。
- 其他語言執行 `pnpm run tts --list-voices` 查詢。
- 選好後用 `pnpm run tts --sample <角色id>`（旁白用 `narrator`）產生試聽檔給使用者聽，或在網頁端「角色工坊」一鍵試聽，見 [design-guide.md#cast-studio](https://aoa.tigernaxo.com/api/video/skills/story-video/design-guide.md#cast-studio)。

## 5. 與使用者互動的原則

共通原則（說白話、一次問一件事、checkpoint 一定停下、更新 `video.activity.json`、告訴使用者怎麼看成果、網頁工作台）見 [product-video SKILL.md §5](https://aoa.tigernaxo.com/api/video/skills/product-video/SKILL.md#interaction)。故事影片另外注意：

- **善用前端「角色工坊 (Cast Studio)」**：在 `/video-design` 階段主動提醒使用者可打開工作台切換至「🎭 角色工坊」進行錄音、挑選情緒指令或拖入參考圖片，AI 與使用者保持同步。
- **故事是使用者的**。可以提議情節、補細節，但主角是誰、結局怎麼走、想傳達什麼，由使用者決定；他的原句盡量保留在旁白或對白裡。
- **三個 checkpoint**：故事定稿（`/video-story`）、角色長相與聲音（`/video-design`）、分鏡與完整稿（`/video-storyboard`）。之後每段渲染完都請使用者預覽。使用者沒有明確說「可以」之前，不往下一步。
- **給看得到、聽得到的東西**：講故事時用白話從頭講一次；講角色時給設定稿（`brief/design-sheet.svg`）與試聽檔，或提示至網頁端角色工坊預覽 SVG 骨骼與播放試聽。
- **改角色很貴**：角色長相或聲音一改，用到的每一段都要重做。美術步驟要讓使用者看清楚再確認；之後他想改角色時，先說明會重做哪幾段、大約多久。
- 給小朋友看的故事：避免恐怖、血腥的畫面與用詞；衝突用誇張可愛的方式表現。

## 安裝 Skill（可選）

下載 https://aoa.tigernaxo.com/api/video/skills/story-video.zip，解壓到 Agent 的 skills 目錄（Claude Code：使用者層級 `~/.claude/skills/`，或專案內 `.claude/skills/`）。zip 的 SHA-256 在 https://aoa.tigernaxo.com/api/video/index.json 的 `checksums.skill`。

## 資源

| 資源 | 網址 |
|---|---|
| 資源索引 | https://aoa.tigernaxo.com/api/video/index.json |
| 工作流程 | https://aoa.tigernaxo.com/api/video/workflow.json |
| 專案範本 | https://aoa.tigernaxo.com/api/video/templates/product-video.zip（雜湊：https://aoa.tigernaxo.com/api/video/templates/product-video/manifest.json） |
| Skill 文件 | https://aoa.tigernaxo.com/api/video/skills/story-video/SKILL.md |
