# 渲染指引

用於 `/video-scene`：為單一 scene 產生旁白與素材，渲染成 `output/scene.mp4`。每個 scene 獨立處理，修改只重做受影響的 scene。

---

## <a id="flow"></a>1. 流程

```bash
pnpm run state project --status producing          # 專案仍是 script_generated 等狀態時
pnpm run tts scene-003                             # 旁白 → assets/narration.mp3、assets/captions.json
pnpm run capture scene-003                         # 只有 web-capture / screenshot 需要
pnpm run state scene-003 --status assets_ready
pnpm run state scene-003 --status rendering
pnpm run render:scene scene-003                    # → output/scene.mp4
pnpm run state scene-003 --rendered                # 寫入 inputHash、實際秒數
pnpm run validate
```

完成後回報 `scenes/<dir>/output/scene.mp4` 的路徑與實際秒數（`render.actualDurationSec`），請使用者預覽。這是 checkpoint，必須等使用者確認。

- 旁白沒有改動、`assets/narration.mp3` 仍在時，可以跳過 `tts`。擷取素材也一樣。
- `render:scene` 只產生檔案，不改 JSON。狀態一律用 `pnpm run state` 寫回。

### 多個 scene 一起渲染

`/video-scene all` 或 `/video-sync` 有多個 scene 要渲染時，先對每個 scene 做完 `tts`、`capture`，狀態依序設為 `assets_ready`、`rendering`，再把它們一次交給 `render:scene`，會平行渲染（預設同時跑 CPU 核心數一半的 scene）：

```bash
pnpm run render:scene scene-001 scene-002 scene-003   # 可加 --jobs 2 限制同時數量
```

最後一行列出 `rendered:` 與 `failed:` 的 scene。成功的各自 `pnpm run state <id> --rendered`；失敗的依第 6 節以 `--failed render …` 記錄（錯誤訊息在該 scene id 開頭的輸出行）。電腦記憶體不足或很卡時，用 `--jobs 1 --pages 1`。

## <a id="duration"></a>2. 時長

| `durationSec` | 實際長度 |
|---|---|
| `null` | 旁白音長 + 0.5 秒。沒有旁白音檔時 `render:scene` 會失敗，要先執行 `tts` 或設定秒數 |
| 數值 | 固定秒數；旁白比它長時會被截掉，`render:scene` 會印出警告 |

幀數由秒數 × `format.fps` 推得，不儲存。

### <a id="pacing"></a>節奏太趕時

產生旁白或渲染後，出現以下任一情況就算太趕：

- `render:scene` 警告錄影比 scene 長（`the recording … is longer than the scene`）：操作還沒做完畫面就切走。
- 旁白一講完就換下一段，畫面上的操作、highlight 或疊加文字來不及看清楚（例如最後一個元素在結束前不到 1 秒才出現）。
- 實際總長超出目標長度 10% 以上。

依 `project.durationAdjust` 處理：

| 設定 | 可以自行做的 | 做完 |
|---|---|---|
| `auto` | 只改**長度**：把該 scene 的 `durationSec` 設為「旁白音長 + 0.5 秒 + 需要的緩衝」，每段最多多加 3 秒；或在 `script.md` 句子之間加 `<!-- pause -->`；或縮短 `capture.actions` 中的 `wait`。全片總長不超過目標長度的 +15% | 在該 scene 的預覽回報中說明調了什麼、為什麼（例如「第 4 段操作比旁白長，多留了 2 秒」） |
| `ask`（預設） | 不改，先停下 | 說明哪一段太趕、建議的調整與調整後的總長，等使用者選擇 |

不論哪種設定，以下都**必須先問使用者**：刪改旁白文字（使用者已確認過稿子）、增減 scene、超出上述限度、改目標長度。也不要靠加快語速解決（`narration.speed` 保持 1.0）。

改 `durationSec` 用 `pnpm run state <id> --patch-file`，再依第 1 節重做該 scene（旁白沒改時不必重做 `tts`）。

## <a id="visual-types"></a>3. 各 visual.type 的畫面

| `visual.type` | 背景 | 需要的素材 |
|---|---|---|
| `web-capture` | 網頁操作錄影，完整顯示在畫面內 | `assets/capture.mp4`（`pnpm run capture`） |
| `screenshot` | 截圖填滿畫面，整段緩慢放大 | `assets/capture.png`（`pnpm run capture`） |
| `motion-graphic` | 深色漸層背景，畫面由 `elements` 構成；有 `motion` 時改由動畫模組畫出（[#motion](#motion)） | 無；有 `motion` 時為 `motion.file` |
| `code` | 程式碼面板置中；`highlightLines` 以外的行會變淡 | `code.file` 或 `code.content` |
| `user-asset` | 使用者的圖片或影片，依 `fit`（`contain` / `cover`）縮放 | `asset.src` |

影片素材（錄影、`user-asset` 影片、影片元素）比它應在畫面上的時間短時，停在最後一格；比較長時截掉。`trimStartSec` / `trimEndSec` 先裁切，再套用上述規則。影片素材的原聲不會使用，scene 的聲音只有旁白。

### <a id="motion"></a>自訂動畫模組 `visual.motion`

`motion-graphic` 可以用你寫的 JavaScript 模組畫整個背景，取代預設漸層；`elements` 仍疊在上面。能不能用、要不要先問，依 `project.customMotion`（[script-guide.md#custom-motion](script-guide.md#custom-motion)）。

```json
"visual": { "type": "motion-graphic", "description": "粒子沿連線流向雲端", "motion": { "file": "assets/motion.js" } }
```

模組放在該 scene 的 `assets/`（例如 `assets/motion.js`），預設匯出 `setup(ctx)`，回傳 `seek(t)`：

```js
export default async function setup({ root, width, height, fps, durationSec, theme }) {
  // root：鋪滿畫面的 <div>，把 <svg>、<canvas> 等放進去。theme：配色與字型（src/lib/motion.js 的 THEME）
  // 在這裡建立所有節點、載入所有圖片（await 完成），之後不再載入任何東西
  return (t) => {
    // t：scene 內秒數。依 t 畫出這一格；可以是 async
  }
}
```

渲染器對每一格呼叫 `seek(t)` 再截圖，所以**畫面只能由 `t` 決定**：

- 不用 `requestAnimationFrame`、`setTimeout`、`Date.now()`、`performance.now()`、CSS animation / transition（截圖時會被停用），也不讓函式庫自己跑時間。
- 隨機一律用固定種子的亂數（例如自寫 mulberry32），粒子位置用 `t` 直接算出來，不要逐格累加。
- 素材用相對於模組的網址載入：`new URL('./logo.png', import.meta.url)`、`new URL('../../../assets/svg/cloud.svg', import.meta.url)`。不從網路（CDN、外部圖片）載入任何東西。
- 文字用內附字型 `theme.fontFamily`、`theme.monoFamily`；畫面上的主要標題仍建議用 `elements` 的文字元素（會自動排版、縮放）。
- 沒有聲音：scene 的聲音只有旁白，不用 Web Audio，也不要做需要音效才成立的畫面。
- 單一畫面不要過重：渲染器逐格截圖，Three.js / shader 在沒有顯示卡的電腦上很慢；粒子數千顆以內，避免後製特效疊很多層。

可用的做法：

| 做法 | 適合 | 寫法重點 |
|---|---|---|
| SVG | 圖示、流程圖、線條描繪、圖表 | 在 `root` 建 `<svg>`；`seek` 依 `t` 設定屬性。線條描繪用 `stroke-dasharray` + `stroke-dashoffset` |
| Canvas 2D | 粒子、大量圖形、數字跳動 | `seek` 每次清空重畫整張 |
| GSAP | 多段編排的動畫（依序進場、彈性緩動） | `const tl = gsap.timeline({ paused: true })` 編排好，`seek` 裡 `tl.seek(t)` |
| Three.js | 3D 物件、產品展示、空間感 | `new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })`，`seek` 依 `t` 設定位置與相機後 `renderer.render(scene, camera)` |
| GLSL shader | 光線流動、漸層波紋、背景質感 | Three.js 的 `ShaderMaterial` 或原生 WebGL，把 `t` 傳進 uniform（例如 `uTime`） |
| Rough.js | 手繪、草圖風格的圖形、流程圖、白板說明 | `rough.svg(svg)` 或 `rough.canvas(canvas)` 畫圖形，**一定要給 `seed`**，寫法見下方 |

GSAP、Three.js、Rough.js 不在範本裡，要用時先在專案安裝（`pnpm add gsap`、`pnpm add three`、`pnpm add roughjs`，依硬性規則 11 先用白話取得同意），模組裡直接 `import { gsap } from 'gsap'`、`import * as THREE from 'three'`、`import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`、`import rough from 'roughjs'`，渲染器會從專案的 `node_modules` 提供，不需要網路。其他函式庫不支援 bare import；需要時把單一 ES module 檔放在 `assets/` 以相對路徑匯入。

Rough.js 每次畫都會隨機抖動線條，沒給 `seed` 時每一格的線條都不同，畫面會一直亂跳。`seed` 要是 1 以上的整數（0 等於不固定）：

```js
import rough from 'roughjs'

export default async function setup({ root, width, height, theme }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.append(svg)
  const rc = rough.svg(svg)
  const style = { seed: 7, roughness: 1.4, stroke: theme.text, strokeWidth: 3, fill: theme.accent, fillStyle: 'hachure' }
  // 不會變形的圖形在 setup 畫一次，seek 只改位置、透明度
  const box = svg.appendChild(rc.rectangle(200, 200, 400, 240, style))
  return (t) => {
    box.style.opacity = String(Math.min(1, t / 0.5))
  }
}
```

- **靜態的圖形在 `setup` 畫一次**，`seek` 只改 `transform`、`opacity`；形狀會變（長度、大小隨 `t` 改）時才在 `seek` 裡清空重畫，`seed` 不變，線條就穩定。
- **想要手繪動畫那種線條微微晃動**（boiling），讓 seed 每隔幾格換一次並循環：`seed: 1 + (Math.floor(t * 8) % 3)`，每秒換 8 次、3 種輪流。只在需要手繪感的元素用，整個畫面都晃會讓人累。
- 現有的 SVG 形狀用 `rc.path(d, style)` 轉成手繪版，例如 `assets/svg/` 的圖示或角色部件的 `d`。
- 產生的是一般 `<path>`，可以照常用 `stroke-dasharray` / `stroke-dashoffset` 做線條描繪。`fillStyle: 'hachure'`、`'cross-hatch'` 會產生很多條線，大面積填色改用 `'solid'`，或把 `hachureGap` 調大讓線條少一點。
- 文字不要用 Rough.js 畫；搭配手繪風格的字仍用 `theme.fontFamily` 或 `elements` 的文字元素。

寫完先渲染這一段確認畫面（短的 scene 可以先把 `durationSec` 設短測試，確認後改回）。`motion.js` 與 scene `assets/` 內的檔案都納入 `inputHash`，修改後該 scene 會自動變成需要重做；模組匯入的共用檔案（`@/assets/` 下）不在內，改了要自己把用到它的 scene 標為 `stale`。

### <a id="css-styling"></a>善用現代 CSS 讓畫面質感大幅升級（重要技巧）

渲染器底層是完整的現代 Chromium 瀏覽器（Playwright 逐幀截圖），**強烈鼓勵善用現代 CSS 樣式打造媲美 Apple / Linear 官方宣傳片的精緻畫面**！
請注意：因截圖是受控時間（由 `seek(t)` 驅動），**不要使用自發的 `animation` / `transition`**，但在靜態排版、材質光影、以及由 `t` 即時計算的 inline style / CSS 變數上，請大力使用以下強大特性：

1. **多層柔和陰影（Layered Soft Shadows & Depth）**：
   - 避免生硬的單層黑色陰影，使用多層帶透明度的彌散陰影營造真實懸浮感：
     ```css
     box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 20px 25px -5px rgba(0, 0, 0, 0.2);
     ```
   - 對於透明 PNG 或 SVG 圖示，使用 `filter: drop-shadow(0 12px 24px rgba(0,0,0,0.3))` 順著不規則邊緣投下立體陰影。
2. **現代材質與毛玻璃（Glassmorphism & High-tech Cards）**：
   - 浮動卡片、終端機視窗、標籤面板使用毛玻璃磨砂質感：
     ```css
     background: rgba(15, 23, 42, 0.75);
     backdrop-filter: blur(16px) saturate(180%);
     border: 1px solid rgba(255, 255, 255, 0.12);
     box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15); /* 頂部內發光邊緣 */
     ```
3. **氛圍光暈與聚光燈（Radial Glows & Ambient Lighting）**：
   - 避免純黑或單調純色背景。在背景或重要元素背後疊加徑向光暈，科技感與空間深度立現：
     ```css
     background: radial-gradient(circle at 50% 20%, rgba(56, 189, 248, 0.18), transparent 60%), #0f172a;
     ```
   - 畫面四周加上微暗角（Vignette）聚焦中央視覺：
     ```css
     box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.6);
     ```
4. **漸層文字與精緻字級（Gradient Typography）**：
   - 重要大標題可使用金屬感或流光漸層文字：
     ```css
     background: linear-gradient(135deg, #ffffff 30%, #94a3b8 100%);
     -webkit-background-clip: text;
     -webkit-text-fill-color: transparent;
     letter-spacing: -0.02em; /* 負字距讓標題更緊湊幹練 */
     ```
5. **3D 透視與空間傾角展示（3D Perspective & Tilts）**：
   - 展示網頁操作錄影、架構圖或程式碼卡片時，不要永遠死板平鋪！加上輕微的 3D 透視傾角，質感倍增：
     ```css
     perspective: 1000px;
     transform: rotateX(6deg) rotateY(-8deg) scale(0.95);
     transform-style: preserve-3d;
     ```
6. **光影混合模式（Mix-Blend-Mode）**：
   - 光束、粒子、網格背景使用 `mix-blend-mode: screen` 或 `mix-blend-mode: overlay`，與底層自然融合不生硬。

### <a id="svg"></a>SVG 插圖（可存檔重複使用）

需要圖示、示意圖、插圖而產品裡沒有現成圖檔時，可以自己寫 SVG：

- 存成檔案再引用，不要每段重畫。只用在一段的放在該 scene 的 `assets/`；會重複使用的（品牌風格的圖示、背景圖形）放在專案 `assets/svg/`，檔名用說明用途的英文（`cloud-sync.svg`、`check-circle.svg`），以 `@/assets/svg/<檔名>` 引用。畫新的之前先看 `assets/svg/` 有沒有能直接用的。
- 用法：`elements` 的 `image`（`"src": "@/assets/svg/cloud-sync.svg"`），或 `user-asset` 的 `image` 背景，或在動畫模組中載入、內嵌後逐格控制。
- 檔案本身要能單獨顯示：寫 `xmlns="http://www.w3.org/2000/svg"`、`viewBox`，以及 `width`、`height`（決定元素顯示大小）。
- 檔案內不放 `<script>`、SMIL / CSS 動畫、外部連結與外部字型；要動就用元素的 `animation`，或在動畫模組中依 `t` 控制。文字盡量轉成路徑或交給 `elements`，避免字型不同。
- 配色沿用 `THEME`（深色背景、白字、強調色 `#38bdf8`），同一部影片的圖示線條粗細、圓角一致。
- 繪製新的插圖算[自訂動畫](script-guide.md#custom-motion)，受 `project.customMotion` 限制；重複使用已存的 SVG 與簡單圖形不受限。

## <a id="elements"></a>4. 疊加元素 `visual.elements`

| 欄位 | 說明 |
|---|---|
| `at` | 出現時間（scene 內秒數）。超過 scene 長度的元素會被略過並警告 |
| `duration` | 顯示秒數，結束前 0.3 秒淡出；省略則留到 scene 結束 |
| `animation` | 進場 0.5 秒：`fadeIn`（預設）· `slideInLeft/Right/Up/Down` · `zoomIn` · `typewriter`（只用於文字，逐字出現）· `none` |
| `size` | 文字字級：`normal`（預設，畫面短邊 6.2%）、`large`（×1.35）、`xl`（×1.7）。放大的字若超過兩行或超出畫面，會逐步縮小，最小回到 `normal` |
| `position` | `center`（預設）、`top`、`bottom`、`left`、`right`、四個角落，或 `{ "x": 30, "y": 70 }`（元素中心點，畫面百分比）。預設位置保留 8% 安全邊距 |

寫法建議：

- 文字元素是畫面上的標題，不是字幕：一則 12 字以內，同一時間最多兩則。字幕由 assemble 從旁白產生。
- 文字的出現時間對齊旁白中對應的詞；可以參考 `assets/captions.json` 的時間。
- 圖片元素最大約畫面的 42%，影片元素約 50%；需要更大的畫面時改用 `user-asset` 當背景。
- 和背景錄影重疊時，把文字放在 `top` 或 `bottom`，避免蓋住操作重點。

## <a id="render"></a>5. 渲染器

`pnpm run render:scene <id>` 用 Playwright 瀏覽器（與 capture 相同）逐幀截圖，再以 FFmpeg 編碼。單一 scene 也會開幾個瀏覽器分攤影格（`--pages N`，預設依 CPU 核心數，最多 4 個），1080p 約每秒 10–15 幀，長的 scene 要先告訴使用者需要等幾分鐘。

- 輸出一律是 H.264 + AAC 48 kHz 立體聲、BT.709。沒有旁白的 scene 也會有靜音音軌，合成時才能直接串接。
- 渲染失敗時，既有的 `output/scene.mp4` 不會被刪除或覆蓋。
- 轉場（`transitionIn`）、字幕與 BGM 不在這裡處理，而是在合成時處理。

## <a id="errors"></a>6. 失敗處理

| 訊息 | 原因 | 處理 | `--failed` 的 step |
|---|---|---|---|
| `durationSec is null and there is no narration audio` | 沒有旁白音檔 | 執行 `tts`，或設定 `durationSec` | `render` |
| `… (run pnpm run capture) not found` | 缺擷取素材 | 執行 `capture` | `capture` |
| `gate productLogin: …` | 產品要登入，還沒登入或登入已過期 | 依 [workflow.md#login](workflow.md#login) 請使用者登入後重新 capture；不算失敗，不記 `--failed` | — |
| `no usable browser` | 找不到瀏覽器 | 告知使用者執行 `pnpm exec playwright install chromium` 或安裝 Chrome / Edge | `render` |
| `player did not start: …`、`player error: …` | 動畫模組（`visual.motion`）載入或執行出錯，訊息為瀏覽器中的錯誤 | 修正模組後重新渲染；同一錯誤修不好時改用 `elements` 排版並告訴使用者 | `render` |
| `visual.motion.file not found` | 動畫模組檔不存在 | 寫好模組，或移除 `visual.motion` | `render` |
| `ffmpeg failed: …` | 素材格式無法讀取 | 檢查該素材能否播放；請使用者提供其他格式 | `render` |
| `… is not a readable video`（`state --rendered`） | 輸出檔損壞 | 重新渲染 | `render` |

記錄方式：`pnpm run state <id> --failed render "<訊息>" --hint "<給使用者的建議>"`。同一 scene 自動重試至多 2 次。

## <a id="customize"></a>7. 客製外觀

配色、字型、字級都在 `src/lib/motion.js` 的 `THEME` 與 `styles()`；版面在 `src/html/player.js`。

字型只用 `src/fonts/` 內附的檔案，不依賴使用者電腦上的字型，所以各平台畫面相同。要換字型時，把靜態字重的 OTF／TTF（不能是 woff2 或可變字型）放進 `src/fonts/`，在 `player.js` 的 `FONTS` 登記，再改 `THEME`；燒入字幕的 `captions.style.fontFamily` 也會先從 `src/fonts/` 找。

`src/` 不納入 `inputHash`，所以改了 `src/` 之後，已渲染的 scene 不會自動被標為過期。只有在使用者要求時才改 `src/`；改完後告訴使用者哪些 scene 需要重做，經同意後對這些 scene 執行 `pnpm run state <id> --status stale`，再依第 1 節重做。`approved` 或 `locked` 的 scene 必須由使用者明確指定才重做。

---

## <a id="assemble"></a>8. 合成最終影片

用於 `/video-assemble`。所有 scene 都必須是 `rendered` 或 `approved`，而且渲染後輸入沒有變動。

```bash
pnpm run status                                   # 確認沒有未完成或過期的 scene
pnpm run assemble                                 # → output/final.mp4、output/final.srt
pnpm run state project --status completed
```

`assemble` 發現有 scene 未就緒時，會列出 scene id 與原因（狀態、缺輸出、輸入已變更）並停止，不產生任何檔案。把列出的 scene 依第 1 節重做，或執行 `/video-sync`。

### 合成內容

| 項目 | 來源 | 行為 |
|---|---|---|
| 順序 | `video.project.json` 的 `scenes` | 依陣列順序串接 |
| 轉場 | 各 scene 的 `visual.transitionIn` | `fade`、`slide-left`、`slide-right`、`wipe`、`zoom` 與前一個 scene 重疊 0.5 秒（scene 很短時縮短）；`none` 直接切換；第一個 scene 的轉場不使用。聲音在轉場期間交叉淡化 |
| 字幕 | 各 scene 的 `assets/captions.json` | 依 scene 在成片中的起點位移，寫成 `output/final.srt`；跨到下一個 scene 的字幕會被截斷 |
| 燒入字幕 | `captions.mode: burn` | 字幕在 `render:scene` 時就畫進各 scene，assemble 不再處理；`captions.style` 的 `fontSize` 以成片像素為單位，`position` 為 `bottom` / `middle` / `top` |
| BGM | `audio.bgm` | 循環播放到影片結束，音量 `bgmVolume`，頭尾各淡入淡出 1 秒；`ducking: true` 時旁白出現處自動壓低 |

- `captions.mode: none` 不產生 `final.srt`。
- `audio.bgm` 指定的檔案不存在時，略過 BGM 並警告，不算失敗。BGM 可以由使用者自備，或以 `pnpm run music` 生成（第 9 節）；不要替使用者從網路下載音樂。
- 有 `audio.music` 時，合成前先執行 `pnpm run music`：樂譜沒變就自動略過；段落對齊 scene 時，scene 長度變了它會重新生成。
- BGM、scene 順序只影響合成：修改它們只需重新 `pnpm run assemble`，不需要重做 scene。字幕樣式在 `srt` 模式下也一樣；**`burn` 模式下修改 `captions`（含切換成或離開 `burn`）會使所有 scene 過期**，要重新渲染全部 scene，動手前先告訴使用者需要等待。
- assemble 直接串接各 scene 的畫面，只重新編碼每個轉場那 0.5 秒，通常幾秒內完成，不必事先提醒使用者等待。
- 轉場會讓成片比各 scene 加總短（每個轉場 0.5 秒）。旁白預設留有 0.5 秒尾音，轉場只會蓋到這段靜音；若 scene 用 `durationSec` 強制秒數且旁白講到最後一刻，轉場會蓋到旁白結尾，這時把該 scene 下一個的 `transitionIn` 改為 `none`。
- 合成失敗時，既有的 `output/final.mp4` 不會被刪除或覆蓋。

### 完成

回報 `output/final.mp4` 的路徑與總長度（`assemble` 最後一行會印出），以及有無字幕檔、BGM。`assemble` 印出的 `warning:`（例如缺少字幕、找不到 BGM）要一併告訴使用者。有保存登入資料（`sources.requiresLogin`）時，問使用者要不要清除（見 [workflow.md#login](workflow.md#login) 第 4 點）。

---

## <a id="music"></a>9. 配樂

使用者沒有自備 BGM 時，可以生成配樂：你寫樂譜（`project.audio.music`），`pnpm run music` 依規則編曲並以本機合成器演奏，輸出 `assets/music/bgm.wav`。不使用 AI 音樂模型，聲音不會離開本機。

### 何時做

- 風格分析（product 的 `brief/style.json` 的 `music`）或故事定稿已談到音樂氣氛時，在分鏡審閱時一併提議：「要不要幫影片配一段背景音樂？」使用者同意後才寫樂譜。
- 生成後請使用者試聽 `assets/music/bgm.wav`，確認後再把 `audio.bgm` 設為它並合成；不滿意就照下方「修改」調整。

### 寫樂譜

以 `pnpm run state project --patch-file` 寫入 `/project/audio/music`。格式見 `schemas/project.schema.json` 的 `$defs/music`。

```json
{
  "bpm": 108,
  "key": "C",
  "seed": 1,
  "instruments": { "lead": 11, "keys": 4, "pad": 89, "bass": 38 },
  "mix": { "lead": -4 },
  "sections": [
    { "name": "開場", "scenes": ["scene-001"], "chords": ["C", "G", "Am", "F"], "energy": 0.3 },
    { "name": "介紹", "scenes": ["scene-002", "scene-003", "scene-004"], "chords": ["F", "G", "Em", "Am"], "energy": 0.8 },
    { "name": "收尾", "scenes": ["scene-005"], "chords": ["F", "G", "C"], "energy": 0.4, "ending": true }
  ]
}
```

- **段落對齊 scene**：所有 scene 都渲染後，用 `scenes` 讓每段音樂的起訖落在畫面切換點（自動取最接近的小節線），這樣情緒轉折會跟著畫面走。還沒渲染時先用 `bars` 試聽，渲染完再改成 `scenes`。
- **energy**：`<0.3` 只有鋪底和弦（適合開場、沉靜處）；`0.3–0.6` 加入貝斯、輕鼓與鋼琴；`≥0.6` 完整鼓組與旋律（適合重點、高潮）。最後一段加 `ending: true` 收尾。
- **旋律與旁白**：旋律只在 `energy ≥ 0.6` 出現，容易和旁白搶耳朵；旁白密集時把 `mix.lead` 調低（-4 到 -8），或設 `instruments.lead: null` 不要旋律。
- **和弦**：每小節一個，不足時循環。大調常用 I–V–vi–IV（C G Am F）、vi–IV–I–V（Am F C G）；小調常用 i–VI–III–VII（Am F C G）。

依氣氛挑起點（`instruments` 為 General MIDI 編號，只影響 fluidsynth）：

| 氣氛 | bpm | key | 和弦 | instruments |
|---|---|---|---|---|
| 輕快科技、產品介紹 | 110–125 | C、G | C G Am F | lead 11 鐵琴、keys 4 電鋼琴、pad 89 暖墊、bass 38 合成貝斯 |
| 溫馨、生活故事 | 72–90 | F、C | F C Dm Bb | lead 73 長笛、keys 0 鋼琴、pad 48 弦樂、bass 32 原聲貝斯 |
| 童話、可愛 | 90–110 | F、G | F C Bb C | lead 9 鐘琴、keys 0 鋼琴、pad 49 弦樂、bass 32 原聲貝斯 |
| 懸疑、科幻 | 70–90 | Am、Dm | Am F C G | lead null、keys 46 豎琴、pad 95 掃頻墊、bass 38；`drums: false` 或 energy 壓低 |
| 激勵、片尾 | 120–135 | D、G | G D Em C | lead 61 銅管、keys 0 鋼琴、pad 48 弦樂、bass 33 電貝斯 |

### 引擎與音色庫

`engine` 預設 `auto`：電腦已安裝 FluidSynth 就用真實樂器取樣（音質明顯較好），否則用免安裝的 webaudio（偏電子音色）。`pnpm run music` 印出 `note: FluidSynth is not installed` 時，告訴使用者：「可以安裝一套真實樂器音色，約 35 MB，整台電腦只裝一次、所有專案共用，配樂會好聽很多。要安裝嗎？」同意後執行 `pnpm run music:setup`，再重新 `pnpm run music`（安裝後會自動改用 fluidsynth 重新生成）。

- 其他音色庫：`pnpm run music:setup --list` 列出可裝的音色庫、大小與授權；經同意後以 `--with <名稱>` 加裝。
- 各聲部可用不同音色庫（分軌渲染），例如鋼琴用專門的鋼琴音色：`"soundfonts": { "keys": "UprightPianoKW.sf2" }`。只有鋼琴的音色庫只能給 `keys`，且 `instruments.keys` 要是 0。
- macOS／Linux 上 `music:setup` 不會自動安裝 FluidSynth，會印出指令（`brew install fluid-synth`、`sudo apt install fluidsynth`）；請使用者自己執行，你不使用系統管理員權限。

### 修改

| 使用者說 | 改什麼 |
|---|---|
| 換一首、旋律不喜歡 | `seed` 換一個數字 |
| 太快、太慢 | `bpm` |
| 太吵、太平淡 | 各段 `energy`；整體太大聲改 `audio.bgmVolume` |
| 某個樂器太大聲 | `mix.<聲部>`（dB） |
| 換樂器 | `instruments.<聲部>` |
| 想自己編曲 | 告訴使用者 `assets/music/song.mid` 可以用 MuseScore 等軟體打開 |

改完重新 `pnpm run music` 再 `pnpm run assemble`；配樂只影響合成，不需要重做 scene。`--stems` 會把各聲部另存到 `assets/music/stems/`，使用者想自己混音時才用。
