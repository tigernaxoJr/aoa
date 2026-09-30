# 渲染指引

用於 `/video-scene`：為單一 scene 產生旁白與素材，渲染成 `output/scene.mp4`。每個 scene 獨立處理，修改只重做受影響的 scene。

---

## <a id="flow"></a>1. 流程

```bash
npm run state -- project --status producing          # 專案仍是 script_generated 等狀態時
npm run tts -- scene-003                             # 旁白 → assets/narration.mp3、assets/captions.json
npm run capture -- scene-003                         # 只有 web-capture / screenshot 需要
npm run state -- scene-003 --status assets_ready
npm run state -- scene-003 --status rendering
npm run render:scene -- scene-003                    # → output/scene.mp4
npm run state -- scene-003 --rendered                # 寫入 inputHash、renderer、實際秒數
npm run validate
```

完成後回報 `scenes/<dir>/output/scene.mp4` 的路徑與實際秒數（`render.actualDurationSec`），請使用者預覽。這是 checkpoint，必須等使用者確認。

- 旁白沒有改動、`assets/narration.mp3` 仍在時，可以跳過 `tts`。擷取素材也一樣。
- `render:scene` 只產生檔案，不改 JSON。狀態一律用 `npm run state` 寫回。

## <a id="duration"></a>2. 時長

| `durationSec` | 實際長度 |
|---|---|
| `null` | 旁白音長 + 0.5 秒。沒有旁白音檔時 `render:scene` 會失敗，要先執行 `tts` 或設定秒數 |
| 數值 | 固定秒數；旁白比它長時會被截掉，`render:scene` 會印出警告 |

幀數由秒數 × `format.fps` 推得，不儲存。

## <a id="visual-types"></a>3. 各 visual.type 的畫面

| `visual.type` | 背景 | 需要的素材 |
|---|---|---|
| `web-capture` | 網頁操作錄影，完整顯示在畫面內 | `assets/capture.mp4`（`npm run capture`） |
| `screenshot` | 截圖填滿畫面，整段緩慢放大 | `assets/capture.png`（`npm run capture`） |
| `motion-graphic` | 深色漸層背景，畫面由 `elements` 構成 | 無 |
| `code` | 程式碼面板置中；`highlightLines` 以外的行會變淡 | `code.file` 或 `code.content` |
| `user-asset` | 使用者的圖片或影片，依 `fit`（`contain` / `cover`）縮放 | `asset.src` |

影片素材（錄影、`user-asset` 影片、影片元素）比它應在畫面上的時間短時，停在最後一格；比較長時截掉。`trimStartSec` / `trimEndSec` 先裁切，再套用上述規則。影片素材的原聲不會使用，scene 的聲音只有旁白。

## <a id="elements"></a>4. 疊加元素 `visual.elements`

| 欄位 | 說明 |
|---|---|
| `at` | 出現時間（scene 內秒數）。超過 scene 長度的元素會被略過並警告 |
| `duration` | 顯示秒數，結束前 0.3 秒淡出；省略則留到 scene 結束 |
| `animation` | 進場 0.5 秒：`fadeIn`（預設）· `slideInLeft/Right/Up/Down` · `zoomIn` · `typewriter`（只用於文字，逐字出現）· `none` |
| `position` | `center`（預設）、`top`、`bottom`、`left`、`right`、四個角落，或 `{ "x": 30, "y": 70 }`（元素中心點，畫面百分比）。預設位置保留 8% 安全邊距 |

寫法建議：

- 文字元素是畫面上的標題，不是字幕：一則 12 字以內，同一時間最多兩則。字幕由 assemble 從旁白產生。
- 文字的出現時間對齊旁白中對應的詞；可以參考 `assets/captions.json` 的時間。
- 圖片元素最大約畫面的 42%，影片元素約 50%；需要更大的畫面時改用 `user-asset` 當背景。
- 和背景錄影重疊時，把文字放在 `top` 或 `bottom`，避免蓋住操作重點。

## <a id="render"></a>5. 渲染器

`npm run render:scene -- <id>` 依 `project.renderer` 選擇渲染器。兩者使用相同的版面與動畫定義（`src/lib/motion.js`），畫面一致。

| | `remotion` | `html-capture` |
|---|---|---|
| 前置條件 | `rendererLicense` gate 已通過 | 無 |
| 首次執行 | 打包 `src/`（快取於 `.tmp/remotion-bundle/`），並下載 Remotion 專用的瀏覽器 | 使用 Playwright 瀏覽器（與 capture 相同） |
| 速度 | 較快（平行渲染） | 逐幀截圖，1080p 約每秒 5 幀 |

- 輸出一律是 H.264 + AAC 48 kHz 立體聲、BT.709。沒有旁白的 scene 也會有靜音音軌，合成時才能直接串接。
- 渲染失敗時，既有的 `output/scene.mp4` 不會被刪除或覆蓋。
- 轉場（`transitionIn`）、字幕與 BGM 不在這裡處理，而是在合成時處理。

Remotion 無法下載瀏覽器時（例如離線），會改用 Playwright 的瀏覽器。仍然失敗時，告訴使用者可設定環境變數 `VIDEO_AGENT_BROWSER_EXECUTABLE` 指向 Chrome，或在取得同意後把 `project.renderer` 改為 `html-capture`。

## <a id="errors"></a>6. 失敗處理

| 訊息 | 原因 | 處理 | `--failed` 的 step |
|---|---|---|---|
| `durationSec is null and there is no narration audio` | 沒有旁白音檔 | 執行 `tts`，或設定 `durationSec` | `render` |
| `… (run npm run capture) not found` | 缺擷取素材 | 執行 `capture` | `capture` |
| `gate rendererLicense` | Remotion 授權尚未確認 | 依 gates 詢問使用者 | 不記錄，先處理 gate |
| `no usable browser` | 找不到瀏覽器 | 告知使用者執行 `npx playwright install chromium` 或安裝 Chrome / Edge | `render` |
| `ffmpeg failed: …` | 素材格式無法讀取 | 檢查該素材能否播放；請使用者提供其他格式 | `render` |
| `… is not a readable video`（`state --rendered`） | 輸出檔損壞 | 重新渲染 | `render` |

記錄方式：`npm run state -- <id> --failed render "<訊息>" --hint "<給使用者的建議>"`。同一 scene 自動重試至多 2 次。

## <a id="customize"></a>7. 客製外觀

配色、字型、字級都在 `src/lib/motion.js` 的 `THEME` 與 `styles()`；Remotion 版面在 `src/SceneVideo.tsx`，html-capture 版面在 `src/html/player.js`。兩個渲染器都會用到的改動，要同時改這兩個檔案。

`src/` 不納入 `inputHash`，所以改了 `src/` 之後，已渲染的 scene 不會自動被標為過期。只有在使用者要求時才改 `src/`；改完後告訴使用者哪些 scene 需要重做，經同意後對這些 scene 執行 `npm run state -- <id> --status stale`，再依第 1 節重做。`approved` 或 `locked` 的 scene 必須由使用者明確指定才重做。

---

## <a id="assemble"></a>8. 合成最終影片

用於 `/video-assemble`。所有 scene 都必須是 `rendered` 或 `approved`，而且渲染後輸入沒有變動。

```bash
npm run status                                   # 確認沒有未完成或過期的 scene
npm run assemble                                 # → output/final.mp4、output/final.srt
npm run state -- project --status completed
```

`assemble` 發現有 scene 未就緒時，會列出 scene id 與原因（狀態、缺輸出、輸入已變更）並停止，不產生任何檔案。把列出的 scene 依第 1 節重做，或執行 `/video-sync`。

### 合成內容

| 項目 | 來源 | 行為 |
|---|---|---|
| 順序 | `video.project.json` 的 `scenes` | 依陣列順序串接 |
| 轉場 | 各 scene 的 `visual.transitionIn` | `fade`、`slide-left`、`slide-right`、`wipe`、`zoom` 與前一個 scene 重疊 0.5 秒（scene 很短時縮短）；`none` 直接切換；第一個 scene 的轉場不使用。聲音在轉場期間交叉淡化 |
| 字幕 | 各 scene 的 `assets/captions.json` | 依 scene 在成片中的起點位移，寫成 `output/final.srt`；跨到下一個 scene 的字幕會被截斷 |
| 燒入字幕 | `captions.mode: burn` | 另外把字幕畫進影片；`captions.style` 的 `fontSize` 以成片像素為單位，`position` 為 `bottom` / `middle` / `top` |
| BGM | `audio.bgm` | 循環播放到影片結束，音量 `bgmVolume`，頭尾各淡入淡出 1 秒；`ducking: true` 時旁白出現處自動壓低 |

- `captions.mode: none` 不產生 `final.srt`。
- `audio.bgm` 指定的檔案不存在時，略過 BGM 並警告，不算失敗。BGM 由使用者自備，不要替使用者下載音樂。
- 字幕樣式、BGM、scene 順序都只影響合成：修改它們只需重新 `npm run assemble`，不需要重做 scene。
- 轉場會讓成片比各 scene 加總短（每個轉場 0.5 秒）。旁白預設留有 0.5 秒尾音，轉場只會蓋到這段靜音；若 scene 用 `durationSec` 強制秒數且旁白講到最後一刻，轉場會蓋到旁白結尾，這時把該 scene 下一個的 `transitionIn` 改為 `none`。
- 合成失敗時，既有的 `output/final.mp4` 不會被刪除或覆蓋。

### 完成

回報 `output/final.mp4` 的路徑與總長度（`assemble` 最後一行會印出），以及有無字幕檔、BGM。`assemble` 印出的 `warning:`（例如缺少字幕、找不到 BGM）要一併告訴使用者。
