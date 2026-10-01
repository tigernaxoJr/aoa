# Product Video Project — Agent 規則

本目錄是一個「產品介紹影片」專案，遵循 Agent Video Producer 協議（specVersion 1.0）。
你的任務是依工作流程，在本機一步步產生影片。所有運算與檔案都留在本機。

---

## 1. 先讀這些

| 檔案 | 用途 |
|---|---|
| `schemas/workflow.json` | 工作流程：步驟、前置條件、狀態轉換、checkpoint、gates |
| `schemas/project.schema.json` | `video.project.json` 的格式 |
| `schemas/scene.schema.json` | `scenes/*/scene.json` 的格式 |
| `video.project.json` | 專案設定與 scene 播放順序 |
| `brief/product-brief.md` | 產品分析結果（analyze 之後才存在） |

詳細做法（文案寫法、渲染實作）在 Skill `product-video` 中；`workflow.json` 每個步驟的 `guide` 欄位指出對應章節。

## 2. 工作流程

| 步驟 | 指令 | 完成後 project.status | 需停下確認 |
|---|---|---|---|
| 1 初始化 | 由 Skill 或網站 `agent-guide.md` 執行（專案建立前沒有專案指令） | `initialized` | — |
| 2 分析產品 | `/video-analyze` | `analyzed` | **是**：確認對象、風格與影片長度 |
| 3 分鏡與旁白 | `/video-storyboard` | `script_generated` | **是**：分鏡與完整旁白稿審閱 |
| 4 產生 scene | `/video-scene <id\|all>` | `producing` → `ready_to_assemble` | **是**：每個 scene 預覽 |
| 5 合成 | `/video-assemble` | `completed` | 回報結果 |

影片做到一半或已合成後，仍可再執行 `/video-storyboard` 重新規劃分鏡：只修改被點名的段落，保留的段落沿用現有影片，確認後以 `/video-sync` 只重做有變更的段落並重新合成。

隨時可用：`/video-status`（狀態摘要）、`/video-sync`（只重做有變更的 scene 並重新合成）、`/video-approve <id>`（核准）、`/video-translate <locale>`（複製專案並翻譯）。

不確定下一步時，執行 `pnpm run status`，它會列出每個 scene 的狀態、是否過期，以及建議的下一個指令。

## 3. 硬性規則

1. **依步驟執行，不跳步。** 遇到 checkpoint 必須停下，等使用者明確確認後才繼續。
2. **修改既有 JSON 一律透過 `pnpm run state`**（見 §4），不得直接編輯 `video.project.json` 或既有的 `scene.json`。只有新建 `scene.json` 時可直接寫入檔案，寫完立即執行 `pnpm run validate`。
3. **只重做受影響的 scene。** 修改只重做受影響的 scene，不重新產生整部影片。多個 scene 都要渲染時，可一次交給 `render:scene` 平行處理。
4. **不動鎖定或已核准的 scene。** `locked: true` 或 `status: approved` 的 scene，除非使用者明確要求，否則不修改、不重做。
5. **尊重使用者的修改。** 編輯任何檔案前先重新讀取（Web UI 或使用者可能剛改過）。不覆蓋使用者寫的內容；原樣保留所有 `x-` 開頭的欄位。
6. **路徑規則。**
   - 一律使用正斜線的相對路徑；不得使用絕對路徑或 `..`。
   - `scene.json` 內的路徑相對於該 scene 目錄；引用專案共用素材用 `@/` 開頭（如 `@/assets/logo.png`）。
   - 產生的素材只能放在 `assets/` 或 `scenes/*/assets/`；渲染結果只能放在 `output/` 或 `scenes/*/output/`。
7. **不儲存幀數。** 時長一律以秒記錄（`durationSec`），`null` 表示由旁白音長決定。
8. **資料不離開本機。** 不上傳使用者的原始碼、素材或影片到任何遠端服務。使用連網 TTS 前必須通過 `onlineTtsConsent` gate（§5）。
9. **不處理機密。** 不讀取 `.env`，不把 API key、密碼、token 寫進任何 JSON 或旁白稿。需要登入的產品頁面，請使用者自行在瀏覽器中登入。
10. **失敗時保留現場。** 不刪除既有檔案；以 `pnpm run state <id> --failed …` 記錄錯誤。同一 scene 自動重試至多 2 次（看 `attempts`），之後停下並告訴使用者原因與重試方式。
11. **未經同意不安裝工具。** 缺少 Node.js、Playwright 瀏覽器或 TTS 工具時，用白話說明用途並取得同意；同意後可代為執行一般安裝，不使用系統管理員權限、不改系統設定。需要使用者點擊確認時，給逐步說明。
12. **太趕時依 `project.durationAdjust` 處理。** `auto` 時可自行在限度內拉長 scene 並事後回報，`ask` 時先問；刪改已確認的旁白、增減 scene 一律先問。做法見 Skill `rendering-guide.md#pacing`。
13. **假設使用者不懂電腦操作。** 所有指令由你執行，不要求使用者開終端機或打指令；使用者用白話下指示（「繼續」「第三段改成…」），由你對應到工作流程步驟。說明避免術語，回報檔案位置用「文件 > 專案 > output > final.mp4」這類資料夾順序，並可建議用網頁工作台預覽。

## 4. 寫入狀態：`pnpm run state`

`state` 會取得鎖檔、重新讀取目標檔、套用修改、原子寫入、執行驗證，並自動更新 `updatedAt` 與 `updatedBy: "agent"`。寫入 scene 後，或以 patch 修改 `video.project.json` 的 `scenes`（新增、移除、調整順序）時，會依 `workflow.json` 的 `derivedProjectStatus` 重算 `project.status`；scene 清單變了就不會是 `completed`，需要重新合成。

```bash
# 改狀態
pnpm run state project --status analyzed
pnpm run state scene-003 --status assets_ready

# 渲染成功：計算 inputHash、寫入 render、狀態設為 rendered、attempts 歸零
pnpm run state scene-003 --rendered

# 失敗：狀態設為 failed、寫入 error、attempts + 1
pnpm run state scene-003 --failed tts "edge-tts timeout" --hint "稍後重試或改用 manual"

# 其他修改：JSON Patch（RFC 6902），寫成檔案再套用，避免 shell 引號問題
pnpm run state scene-003 --patch-file .tmp/patch.json
```

`--patch-file` 範例（`.tmp/` 不納入版本控制，用完可刪）：

```json
[
  { "op": "replace", "path": "/title", "value": "三步完成部署" },
  { "op": "replace", "path": "/durationSec", "value": null }
]
```

`state` 失敗（驗證不過、鎖定逾時）時不會寫入任何東西；讀錯誤訊息、修正後重試。

## 5. Gates：執行前必須取得使用者確認

| Gate | 何時需要 | 未通過時不得執行 |
|---|---|---|
| `onlineTtsConsent` | TTS provider 為 `edge-tts`、`azure`、`openai`、`elevenlabs` | `tts` |
| `domEditConsent` | scene 的 `capture.actions` 有 `script`（錄製時改寫頁面，例如報表資料太少時填入示意資料） | 該 scene 的 `capture` |

要向使用者說明的內容、使用者拒絕時的處理方式，見 `schemas/workflow.json` 的 `gates`。確認結果以 `pnpm run state` 寫入 `project.tts.consent` 或該 scene 的 `visual.capture.domEditConsent`。

## 6. Scene 狀態

```text
draft → assets_ready → rendering → rendered → approved
                                        ↘          ↘
                              內容被修改 → stale（需重做）
任一步驟失敗 → failed（修正後可重試）
```

- `render.inputHash` 與目前內容不符時，scene 視為過期，即使 `status` 仍是 `rendered`。`pnpm run status` 會標示出來。
- BGM 只在合成時使用，改它不需要重做 scene，只要重新合成。字幕樣式也是，除非 `captions.mode` 是 `burn`（字幕畫在每個 scene 裡，改了要重新渲染所有 scene）。

## 7. 常用指令

| 指令 | 作用 |
|---|---|
| `pnpm run status` | 各 scene 狀態、是否過期、下一步建議 |
| `pnpm run validate` | 驗證所有 JSON 與路徑；非 0 代表有錯 |
| `pnpm run tts <id>` | 產生旁白音檔與字幕時間軸 |
| `pnpm run capture <id>` | 擷取網頁畫面 |
| `pnpm run render:scene <id>…` | 渲染 scene；多個 id 時平行渲染（`--jobs N`） |
| `pnpm run assemble` | 依順序合成 `output/final.mp4` |
