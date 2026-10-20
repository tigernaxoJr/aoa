# 美術、角色與動畫指引

用於 `/video-design`（定下畫風、畫角色與場景、挑聲音），以及 `/video-scene` 時為每一段寫動畫模組（[§7](#animate)）。

整部片的畫面都是你用 SVG 畫的。**角色只畫一次**：在這一步畫好可以動的角色檔，之後每一段都載入同一個檔案、只改姿勢和表情。這樣角色從頭到尾長得一樣，每段也不用重畫，省時間和用量。

---

## 1. <a id="style"></a>畫風設定 `brief/design.md`

依 `project.style` 與 `brief/story.md` 寫下整部片共用的規則，之後每段動畫都照它畫：

```markdown
# 美術設定：小狐狸找月亮

畫風：溫暖繪本風。圓潤、無尖角，色塊為主，線條只用在輪廓。
畫面：16:9，地平線在畫面高度 70% 處；角色站在地平線上。
配色：
- 夜空 #1e2a4a → #3b4a7a（由上往下漸層）、月光 #fde68a
- 草地 #3f6b4a、池水 #2c4f6e
- 小狐狸 #f97316 / #fdba74（肚子）、貓頭鷹 #8b5e3c / #e7d3b0
輪廓：#2b1d14、2.5px（以 1920 寬為準）、round linecap / linejoin
比例：小狐狸高 = 畫面高 35%；貓頭鷹高 = 畫面高 25%
光影：每個物件最多一層陰影色（同色相、暗 15%），不用漸層描邊、不用濾鏡
字：畫面上不畫字；標題用 scene 的 elements
```

- 色票控制在 10–14 個，寫出色碼。
- 「比例」與「地平線」是讓每段畫面接得起來的關鍵，一定要寫。
- **手法**：依畫風從下表選定，寫進 `brief/design.md` 的「手法」一行（例如「場景與道具用 Rough.js，seed 3、roughness 1.4、fillStyle solid；只有水波 boiling」），之後每段都照同一組參數，畫面才一致。

| 畫風 | 角色（`assets/cast/`） | 場景與道具（`assets/sets/`、道具） | 氛圍 |
|---|---|---|---|
| 溫暖繪本風 | 一般 SVG，色塊為主、圓角 | 一般 SVG，前中遠三層 | CSS 柔光、落地陰影（[§7](#animate)） |
| 扁平可愛風 | 一般 SVG，粗外框、高彩度 | 一般 SVG，少細節 | 幾乎不用濾鏡 |
| 剪紙風 | 一般 SVG，每層一個色塊 | 一般 SVG，多層疊放 | 每層 `drop-shadow` 做出紙張厚度 |
| 簡筆線條風 | 一般 SVG，黑色線條、無填色或一個重點色 | **Rough.js**：`roughness` 0.8–1.2、不填色或 `fillStyle: 'solid'` | 白底或淡色紙底；不用光暈 |
| 蠟筆／草圖風 | 一般 SVG，粗而不平整的外框 | **Rough.js**：`roughness` 1.5–2.5、`fillStyle: 'hachure'` / `'zigzag'`（大面積用 `'solid'` 或加大 `hachureGap`） | 可選 boiling：線條每秒換幾次 seed |

  Rough.js 的寫法、固定 `seed` 與 boiling 見 [rendering-guide.md#motion](rendering-guide.md#motion)；在場景上的用法見 [§3](#sets)。**角色不用 Rough.js**：`rig.morph()` 改的是原本的 `<path>`，換成 Rough.js 的線條就不能變形；角色用一般 SVG，外框粗細與顏色配合場景的手繪線條即可。沒選這兩種畫風時不需要 Rough.js，不要為了用而用。

## 2. <a id="rig"></a>角色檔 `assets/cast/<id>/<id>.svg`

每個角色一個資料夾（`id` 用英文小寫，例如 `fox`），主檔是 `<id>.svg`：**一個 SVG 裡用 `<g id>` 分出可以動的部件**，動畫模組用範本的 `src/lib/rig.js` 載入後逐格擺姿勢。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600">
  <g id="tail" data-pivot="120 470">…</g>
  <g id="leg-l" data-pivot="170 500">…</g>
  <g id="leg-r" data-pivot="230 500">…</g>
  <g id="body">…</g>
  <g id="arm-l" data-pivot="150 380">…</g>
  <g id="arm-r" data-pivot="250 380">…</g>
  <g id="head" data-pivot="200 300">
    <g id="ear-l" data-pivot="150 150">…</g>
    <g id="ear-r" data-pivot="250 150">…</g>
    <g id="face">…</g>
    <g id="eye-open">…</g>
    <g id="eye-closed">…</g>
    <g id="eye-happy">…</g>
    <g id="mouth-closed">…</g>
    <g id="mouth-open">…</g>
    <g id="mouth-smile">…</g>
  </g>
</svg>
```

規則：

- **畫布**：`viewBox` 讓角色站在畫布底部正中間（腳底在 `y` = 高度、`x` = 寬度一半），四周留 5% 空白。所有角色用同樣的慣例，動畫裡才好放到地平線上。
- **部件 id**：用上面的名稱（`head`、`body`、`arm-l`、`arm-r`、`leg-l`、`leg-r`、`tail`、`eye-*`、`mouth-*`）；角色特有的部件（`wing-l`、`hat`）用英文小寫加連字號。`-l` / `-r` 是**畫面上的**左右。
- **`data-pivot="x y"`**：部件旋轉、縮放的支點，用 viewBox 座標：手臂是肩膀、腿是髖、頭是脖子、尾巴是根部。沒寫時支點是 (0, 0)，轉起來會飛走。
- **疊放順序**：寫在後面的蓋在前面。手、腳和身體的接縫處要互相重疊一點，轉動時才不會露出縫。
- **表情是互斥的一組**：`eye-open` / `eye-closed` / `eye-happy`…、`mouth-closed` / `mouth-open` / `mouth-smile`…，同一組同一時間只顯示一個（`rig.only()`）。至少要有 `eye-open`、`eye-closed`、`mouth-closed`、`mouth-open`，說話和眨眼才做得出來。
- **會彎曲、擠壓的形狀用 `data-morph-<名稱>`**：轉動做不出來的變化（尾巴捲起、身體蹲下壓扁），在同一條 `<path>` 上多寫一份「變形後」的 `d`，動畫裡用 `rig.morph()` 在兩者之間漸變。**下面這些在畫角色時就要畫好**，不是之後有需要再補：角色檔是所有段落共用的，之後才加要改共用檔，用到這個角色的段落全部要重做。
  - **有尾巴**：`tail` 的 path 加 `data-morph-curl`（捲起、甩動）。
  - **會跳、蹲、跌倒或落地的角色**（大多數動物主角）：`body` 的 path 加 `data-morph-squash`（變矮變寬，腳底不動）。
  - **嘴型、眼型**仍是互斥的 `<g>`（`mouth-open`、`mouth-smile`…）用 `rig.only()` 切換，不要改成 morph。
  - 其他（耳朵垂下、翅膀收合、衣襬飄動）依故事需要再加。
  網頁「角色工坊」的部件檢測會提示缺少的 `curl` / `squash`。
  ```svg
  <g id="tail" data-pivot="120 470">
    <path d="M120 470 C60 460 40 400 70 350" data-morph-curl="M120 470 C50 480 20 420 60 390" …/>
  </g>
  ```
  ```svg
  <g id="body">
    <path d="M140 520 C140 400 260 400 260 520 Z" data-morph-squash="M120 520 C120 440 280 440 280 520 Z" …/>
  </g>
  ```
  兩份 `d` **必須用相同的指令、相同的順序**（上例分別是 `M` 加一個 `C`、`M` + `C` + `Z`），只有座標不同；最簡單的做法是先畫好原形，複製一份只挪動控制點。名稱用英文小寫（`curl`、`squash`、`wide`）。畫完在設定稿（[§4](#sheet)）旁邊放一張變形後的樣子，確認形狀沒有扭曲。
- **側面角色**：大多數故事角色畫成四分之三側面朝右即可；要朝左時在動畫裡把整個角色水平翻轉（`scale(-1, 1)`），不要另畫一份。
- 和 [rendering-guide.md#svg](rendering-guide.md#svg) 相同：要有 `xmlns`、`viewBox`、`width`、`height`；不放 `<script>`、SMIL / CSS 動畫、外部連結與外部字型；不用文字。顏色只用 `brief/design.md` 的色票。
- 每個檔案保持在 30 KB 以內；路徑點數太多的形狀簡化掉，畫面看不出差別。

在專案的 `project.cast` 記下角色（`art` 指向資料夾）：

```json
{ "id": "fox", "name": "小狐狸", "description": "橘色、大尾巴、好奇又急性子", "voice": "zh-TW-HsiaoYuNeural", "art": "@/assets/cast/fox/" }
```

`name` 是 `script.md` 裡【】中的名字，要和故事裡的稱呼一致。

## 3. <a id="sets"></a>場景與道具 `assets/sets/`

- 每個地點一個背景檔（`forest-night.svg`、`pond.svg`），大小和影片畫面一樣（16:9 用 `viewBox="0 0 1920 1080"`）；地平線位置照 `brief/design.md`。
- 會動的東西（月亮、水波、螢火蟲、飄落的葉子）不要畫死在背景裡：分成獨立的 `<g id>`，或在動畫模組裡用程式畫。
- 道具（`basket.svg`、`lantern.svg`）和角色一樣畫成獨立檔，需要時加 `data-pivot`。
- 背景可以分前景、中景、遠景三個 `<g id="far">`、`<g id="mid">`、`<g id="near">`，鏡頭移動時讓它們以不同速度移動，畫面會有深度。
- **用 Rough.js 的畫風**（[§1](#style) 的簡筆線條風、蠟筆／草圖風）：場景檔照常畫成一般 SVG，形狀**全部寫成 `<path>`**，動畫模組載入後再換成手繪線條。這樣場景檔仍可在設定稿與瀏覽器裡直接看、改，手繪參數集中在一處。在設定稿上也用同樣的程式畫一次，讓使用者確認的是手繪後的樣子。

  ```js
  import rough from 'roughjs'
  // 把 svg 裡的 <path> 換成手繪線條；variants > 1 時每條線畫幾份不同 seed，seek 裡輪流顯示（boiling）
  function sketch(svg, { seed = 3, variants = 1, ...style } = {}) {
    const rc = rough.svg(svg)
    const layers = Array.from({ length: variants }, () => [])
    for (const el of [...svg.querySelectorAll('path')]) {
      const base = { stroke: el.getAttribute('stroke') ?? 'none', fill: el.getAttribute('fill') ?? undefined, strokeWidth: Number(el.getAttribute('stroke-width') ?? 2), ...style }
      for (let i = 0; i < variants; i++) {
        const g = rc.path(el.getAttribute('d'), { ...base, seed: seed + i })
        el.before(g)
        layers[i].push(g)
      }
      el.remove()
    }
    return (t, hz = 8) => layers.forEach((gs, i) => gs.forEach((g) => (g.style.display = i === Math.floor(t * hz) % variants ? '' : 'none')))
  }

  // setup 裡：const boil = sketch(set.querySelector('#water'), { variants: 3, roughness: 1.6, fillStyle: 'solid' })
  //           sketch(set.querySelector('#far'), { roughness: 1.6, fillStyle: 'solid' })   // 不晃的部分只畫一份
  // seek 裡：boil(t)
  ```
  - 每個場景用固定的 `seed`（寫在 `brief/design.md`），同一個場景在不同段落才會長得一樣。
  - boiling 只用在需要「活著」的元素（水、火、草、主角身邊的特效），整個畫面一起晃會讓人累；`variants` 3、`hz` 6–8 就夠。
  - 會動的物件（月亮、葉子）照常是獨立的 `<g id>`，手繪化之後一樣用 `transform` 移動。

## 4. <a id="sheet"></a>設定稿與確認

畫完後寫一張 `brief/design-sheet.svg`（1920×1080）給使用者看：所有角色並排站在地平線上（顯示真實比例），每個角色旁邊列出表情（睜眼、閉眼、張嘴…），下方放每個場景的縮圖。用 `<use href>` 或直接嵌入部件都可以，這張圖只給人看，不會進影片。

告訴使用者「設定稿在『文件 > moon-fox-video > brief > design-sheet.svg』，用瀏覽器打開就能看」，請他逐個角色確認長相；要改的地方改好再給一次。

## 5. <a id="cast-studio"></a>前端工作台「角色工坊 (Cast Studio)」與 AI 協同引導

在 `/video-design` 階段，使用者可以開啟網頁工作台，切換至 **「🎭 角色工坊 (Cast)」** 分頁，與 Agent 進行高效率協同：

1. **AI 角色塑形訪談**：
   - Agent 主動提議角色清單、名稱、個性特徵與外觀描述，並寫入 `video.project.json` 的 `project.cast`。
   - 網頁端即時同步顯示各角色卡片。
2. **聲音設定三選一 (Voice Strategy)**：
   - **A. 線上錄音克隆 (CosyVoice 3 零樣本)**：引導使用者在網頁端點選「🎤 線上錄音克隆」，念 3-5 秒台詞，網頁自動轉為 16kHz PCM WAV 並存至 `assets/cast/<id>/voice-sample.wav`。Agent 自動配置 `provider: "cosyvoice3"`, `voice: "@/assets/cast/<id>/voice-sample.wav"`。
   - **B. CosyVoice 3 自然語言指令**：使用基礎發音人搭配口氣、情緒或方言指令（例如：`中文男 <用熱情開朗的大學生語氣>`、`<用台語說>`）。
   - **C. Edge-TTS 標準發音人**：選擇微軟神經網路語音（例如：`zh-TW-HsiaoChenNeural`、`zh-TW-YunJheNeural`）。
3. **概念參考圖與 AI 生成向量骨骼 (Art Studio)**：
   - 使用者可將喜歡的風格參考圖拖曳上傳至網頁（自動存為 `assets/cast/<id>/reference.png`）。
   - 點擊「請 Agent 繪製 SVG 骨骼」複製格式化提示詞給 Agent。
   - Agent 在 `assets/cast/<id>/<id>.svg` 繪製符合骨骼規範的分層向量部件（`<g id="head" data-pivot="...">` 等），網頁端即時渲染預覽並檢測骨骼完整度。

## 6. <a id="voices"></a>挑聲音與試聽

1. **AI 自動配合角色配音色（CosyVoice 3 Instruct）**：
   - 若專案使用 CosyVoice 3，Agent **必須主動分析每個角色的年齡、個性、外貌與情境，自動在 `project.cast[].voice` 填入適配的自然語言指令**，無需使用者手動一筆一筆編寫！
   - 範例格式：`基礎發音人 <自然語言語氣指令>`。下面只示範寫法，語氣要從**這個故事**的角色身分、年齡與情境寫出來，不要照抄：
     - 小孩主角：`中文男 <用〈角色的個性〉的小男孩語氣>`，例如「好奇又有點膽小」
     - 長輩：`中文女 <用〈角色的個性〉的老奶奶語氣>`，例如「慈祥、說話慢慢的」
     - 旁白：`中文女 <用溫暖柔和、娓娓道來的繪本旁白語氣>`
   - 若使用微軟 Edge-TTS，則依角色的年紀、個性從 `zh-TW` / `zh-CN` 選取發音人。旁白的聲音和任何一個角色都要不同。Edge-TTS 沒有老年人的聲音：長輩挑最沉穩的一個（男：`zh-CN-YunjianNeural`；女：`zh-TW-HsiaoChenNeural`，旁白就改用另一個），選 `zh-CN` 時告訴使用者會有大陸口音。
2. 產生試聽檔，每個角色一句符合他個性的台詞：

   ```bash
   pnpm run tts --sample narrator
   pnpm run tts --sample <角色id> --text "<這個角色會說的一句話>"
   ```

   檔案在 `brief/voices/<id>.mp3`。連網的聲音服務要先過 `onlineTtsConsent`（初始化時已問過）。
3. 告訴使用者試聽檔在哪裡，或引導使用者直接在網頁端「角色工坊」點選播放器試聽驗收；不喜歡的換一個再產生。

### checkpoint

角色長相與聲音**都**確認後，才 `pnpm run state project --status designed`，接著問使用者要不要開始寫分鏡。

## 7. <a id="animate"></a>寫每一段的動畫模組（`/video-scene`）

每段的 `assets/motion.js` 是一個動畫模組，基本規則（預設匯出 `setup(ctx)`、回傳 `seek(t)`、畫面只能由 `t` 決定、不用 `requestAnimationFrame` 與 CSS 動畫、亂數要固定種子）見 [rendering-guide.md#motion](rendering-guide.md#motion)。故事專案的 `ctx` 另外有：

| 欄位 | 內容 |
|---|---|
| `cues` | 這段的字幕時間軸 `[{ start, end, text, speaker? }]`；`speaker` 是說話的角色名，旁白沒有 |
| `cast` | `[{ id, name }]` |

先執行 `pnpm run tts <id>` 產生語音，`cues` 才有時間；動作要對著台詞的時間做。

### 範例

```js
import { blinking, loadSvg, mouthOpen, rig, speakerAt, tween, wave } from '../../../src/lib/rig.js'

const asset = (p) => new URL(`../../../assets/${p}`, import.meta.url)

export default async function setup({ root, width, height, cues }) {
  // 背景：場景 SVG 鋪滿畫面
  const set = await loadSvg(asset('sets/pond.svg'))
  Object.assign(set.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })
  // 角色：高度照 brief/design.md 的比例，腳底放在地平線（畫面高 70%）
  const svg = await loadSvg(asset('cast/fox/fox.svg'))
  const h = height * 0.35
  Object.assign(svg.style, { position: 'absolute', height: `${h}px`, width: 'auto', top: `${height * 0.7 - h}px` })
  root.append(set, svg)
  const fox = rig(svg)
  const moon = set.querySelector('#moon-reflection')

  return (t) => {
    const talking = speakerAt(cues, t) === '小狐狸'
    // 0–1.5 秒從左邊跑進來，之後停在 30% 處
    const x = tween(t, 0, 1.5, -h, width * 0.3)
    const running = t < 1.5
    svg.style.left = `${x}px`
    svg.style.transform = `translateY(${running ? -Math.abs(wave(t, 12, 3)) : 0}px)`
    fox.pose('leg-l', { rotate: running ? wave(t, 25, 3) : 0 })
    fox.pose('leg-r', { rotate: running ? -wave(t, 25, 3) : 0 })
    fox.pose('tail', { rotate: wave(t, talking ? 15 : 6, talking ? 2 : 0.5) })
    fox.pose('head', { rotate: talking ? wave(t, 3, 1.5) : 0 })
    fox.only(['mouth-open', 'mouth-closed'], mouthOpen(t, talking) ? 'mouth-open' : 'mouth-closed')
    fox.only(['eye-open', 'eye-closed'], blinking(t, 1) ? 'eye-closed' : 'eye-open')
    // 4 秒起伸爪撈水，水中月亮跟著晃散
    fox.pose('arm-r', { rotate: tween(t, 4, 4.6, 0, 50) })
    moon.setAttribute('transform', `translate(0 ${wave(t, t > 4.6 ? 6 : 1, 1.2)})`)
    moon.style.opacity = String(tween(t, 4.6, 6, 1, 0.3))
  }
}
```

`src/lib/rig.js` 提供：

| 函式 | 用途 |
|---|---|
| `loadSvg(url)` | 載入 SVG 檔成可操作的 `<svg>` 元素 |
| `rig(svg)` | `pose(id, { x, y, rotate, scale })` 依支點擺姿勢、`only(ids, id)` 切換表情、`show(id, bool)`、`part(id)`、`morph(id, 名稱, amount)` 把部件裡的 path 漸變成 `data-morph-<名稱>` 的形狀（0 是原形、1 是變形後，超過 1 會過頭） |
| `morphPath(from, to, amount)` | 兩條指令相同的 path `d` 之間的形狀；不在角色檔裡的形狀（道具、場景）直接用它設定 `d` |
| `speakerAt(cues, t)`、`cueAt(cues, t)` | 這個時間誰在說話、正在說哪句 |
| `mouthOpen(t, speaking)` | 說話時嘴巴開合 |
| `blinking(t, seed)` | 自然的眨眼；每個角色用不同 `seed` |
| `tween(t, t0, t1, a, b, ease)`、`ease` | 在 t0–t1 之間從 a 變到 b |
| `wave(t, amplitude, hz)` | 搖擺、呼吸、跑步的週期動作 |
| `mulberry32(seed)` | 固定種子的亂數 |

### 讓角色活起來

- **一直有一點動**：靜止的角色看起來像貼紙。站著時尾巴、耳朵慢慢晃（`wave` 0.3–0.6 Hz），身體有呼吸般的上下 1–2%。
- **說話的人要動**：說話時嘴巴開合、頭或手有小動作；**沒說話的人**偶爾眨眼、看向說話的人（頭轉向那邊）。
- **動作先預備再動**：跳之前先蹲一下、轉身前先停一下，動作結束時稍微過頭再回來（`ease.out` 之後補一點反向）。蹲下、落地的壓扁和尾巴的甩動用 `morph` 會比只轉動自然，例如 `fox.morph('body', 'squash', tween(t, 2, 2.2, 0, 1) - tween(t, 2.2, 2.5, 0, 1))`。
- **配合台詞時間**：用 `cues` 的 `start` 安排動作，例如角色開口前 0.2 秒先轉頭；旁白說「水面碎成好多片」時正好讓水波散開。
- **鏡頭**：要推近或平移時，把整個場景放在一個容器裡，對容器做 `transform`（例如 2 秒內 `scale` 1 → 1.15），角色跟背景一起動。一段最多一個鏡頭動作。
- **控制份量**：一段只做 3–5 個重點動作；太多動作搶戲，也會拖慢渲染。

### 善用現代 CSS 營造繪本光影氛圍

動畫模組由 Chromium 瀏覽器渲染，善用 CSS 能讓原本平面的向量插畫立刻獲得繪本般的溫度與電影級氛圍：
- **柔和落地陰影（Drop Shadows）**：
  - 角色 SVG 加上 `filter: drop-shadow(0 15px 25px rgba(0, 0, 0, 0.25))`，營造踏在地平線上的自然接觸陰影與層次感。
- **環境光暈與天氣氛圍（Ambient Lighting）**：
  - 在夜空場景疊加月光柔光：`background: radial-gradient(circle at 75% 20%, rgba(253, 230, 138, 0.3), transparent 60%)`。
  - 清晨或黃昏疊加暖橘或淡紫色的漸層覆蓋層（`opacity: 0.15`）。
- **發光物件與特效融合（Mix-Blend-Mode）**：
  - 螢火蟲、月光倒影、水波反射、星光粒子使用 `mix-blend-mode: screen` 或 `overlay`，在深色背景上發出自然柔和的輝光。

### 共用美術與 `motion.uses`

動畫模組讀進的每個共用檔都要列在 `scene.json` 的 `visual.motion.uses`（角色資料夾以 `/` 結尾），例如 `["@/assets/cast/fox/", "@/assets/sets/pond.svg"]`。列了，角色或場景改了這段就會自動標示需要重做；沒列的檔案改了，系統不知道。`src/lib/rig.js` 是範本的一部分，不用列。

### 渲染與預覽

依 [rendering-guide.md#flow](rendering-guide.md#flow)：`tts` → 寫 `assets/motion.js` → `render:scene` → `state --rendered`。故事專案沒有 `capture`。第一次寫某個角色的動畫時，先把這段 `durationSec` 設短（例如 3 秒）渲染一次確認角色擺得對，再改回 `null`。

渲染完請使用者預覽。使用者說「狐狸的手轉錯方向」這類意見時，多半是 `data-pivot` 或旋轉方向的問題，改角色檔會影響所有用到它的段落，改動畫模組只影響這一段，先判斷是哪一種再改。

## 8. <a id="changes"></a>之後要改角色

- **改長相**：改 `assets/cast/<id>/` 的檔案。所有在 `motion.uses` 列了這個資料夾的段落都會變成需要重做；先告訴使用者有幾段、大約多久，同意後再改，改完用 `/video-sync` 重做。
- **改聲音**：用 `pnpm run state project --patch-file` 改 `project.cast[].voice`。只有這個角色有說話的段落會變成需要重做（重新 `tts` 與渲染）；先告訴使用者是哪幾段。改旁白的聲音（`project.tts.voice`）不會自動標示，要自己把所有段落標為 `stale`。
- **改名字**：`project.cast[].name` 和每個 `script.md` 的【舊名】要一起改，否則 `pnpm run validate` 會報錯。
