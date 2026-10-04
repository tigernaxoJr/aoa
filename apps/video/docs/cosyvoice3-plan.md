# CosyVoice 3 整合規劃書 (CosyVoice 3 Integration Plan)

> **目標子專案**：`apps/video`  
> **架構原則**：AOA (Agent-Offloaded Architecture) 前端零後端 + Ponytail (極簡相容、零不必要依賴)  
> **狀態**：規劃中 (Draft)

---

## 1. 概述與架構定位

本專案旨在為 `apps/video`（Agent Video Producer）擴充 **CosyVoice 3** 語音合成（TTS）能力。

### 1.1 AOA 架構對齊
* **零雲端中繼**：前端 Web UI（GitHub Pages 靜態託管）不直接連接大模型，亦不持有 API 金鑰。
* **本地算力卸載**：語音合成作業完全由本機 Node.js 腳本（`template/scripts/tts.mjs`）或本地 Coding Agent 調度本機運算資源（Local FastAPI/Docker）執行。
* **零新增 npm 依賴**：在 Node.js 端採用原生 `fetch()` 呼叫 CosyVoice HTTP API，不新增額外 npm 套件。

---

## 2. 模式設計 (Modes of Operation)

CosyVoice 3 支援以下兩種運行情境：

### 模式 A：本地 HTTP 服務（預設，推薦）
* **運作機制**：使用者於本機顯卡環境啟動 CosyVoice 3 服務（例如官方/社群 FastAPI 容器或獨立 Python 進程，預設埠為 `http://127.0.0.1:50000`）。
* **資料隱私**：旁白文本與合成音訊全程不出本機。
* **連網授權**：視為本地離線服務（類似 `piper` / `system`），無需強制要求 `onlineTts` 使用者同意。
* **環境變數**：`COSYVOICE_URL`（預設：`http://127.0.0.1:50000/api/tts`）。

### 模式 B：阿里百煉 DashScope 雲端 API（選配）
* **運作機制**：本地缺乏高階 GPU 時，可配置 `DASHSCOPE_API_KEY` 呼叫阿里雲 CosyVoice 遠端端點。
* **連網授權**：必須依循 SPEC §7.4 規範，在 `project.tts.consent.onlineTts` 記錄使用者同意後方可觸發。

---

## 3. 檔案變動與改動清單 (Change Manifest)

| 檔案路徑 | 變更性質 | 說明 |
|---|---|---|
| `apps/video/specs/common.schema.json` | 協議規範 | 在 `$defs.ttsProvider` 的 enum 中增加 `"cosyvoice3"` 與 `"cosyvoice"` |
| `apps/video/src/types/protocol.ts` | 型別檔案 | **嚴禁手動修改**，由 `pnpm run gen:types` 自 Schema 自動編譯產生 |
| `apps/video/template/scripts/lib/tts-providers.mjs` | 核心實作 | 增加 `cosyvoice3` provider 實作：發送請求、存成 WAV、支援音色與參考音檔 |
| `apps/video/template/scripts/tts.mjs` | 調度邏輯 | 調整 `ONLINE_PROVIDERS` 判定（本地 URL 豁免，遠端 URL 納入 consent 檢查） |
| `apps/video/SPEC.md` | 規格文件 | 更新 §7.4 TTS Provider 清單與參數說明 |
| `apps/video/template/AGENTS.md` | Agent 指引 | 新增 CosyVoice 3 的配置指引（如何設置 `video.project.json` 及環境變數） |
| `apps/video/tests/template/media.test.mjs` | 自動化測試 | 增加 CosyVoice 3 provider 的單元測試與 Mock 驗證 |

---

## 4. 核心實作原型 (Implementation Draft)

### 4.1 Schema 變更 (`apps/video/specs/common.schema.json`)
```json
"ttsProvider": {
  "description": "見 SPEC §7.4。",
  "enum": ["edge-tts", "azure", "openai", "elevenlabs", "piper", "system", "manual", "cosyvoice3", "cosyvoice"]
}
```

### 4.2 Provider 實作 (`apps/video/template/scripts/lib/tts-providers.mjs`)
```javascript
cosyvoice3: {
  async synthesize({ text, voice, speed, workDir }) {
    const endpoint = process.env.COSYVOICE_URL ?? 'http://127.0.0.1:50000/api/tts'
    const wavFile = join(workDir, 'cosyvoice.wav')
    
    // 支援：voice 可以是預置音色名稱，或是本機參考音訊路徑 (Zero-shot clone)
    const payload = {
      text,
      speaker: voice ?? 'default',
      speed: speed ?? 1.0,
      format: 'wav'
    }

    let res
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (err) {
      throw new UsageError(`CosyVoice 3 service unavailable at ${endpoint}: ${err.message}`)
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`CosyVoice 3 synthesis failed (${res.status}): ${errText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    writeFileSync(wavFile, Buffer.from(arrayBuffer))
    return { file: wavFile, words: null }
  },

  async listVoices() {
    const endpoint = process.env.COSYVOICE_URL ?? 'http://127.0.0.1:50000/api/tts'
    const res = await fetch(`${endpoint.replace(/\/api\/tts\/?$/, '')}/api/speakers`).catch(() => null)
    if (!res || !res.ok) return ['default\tDefault Speaker\tzh-TW']
    const data = await res.json()
    return (data.speakers ?? []).map((s) => `${s.id}\t${s.name ?? s.id}\t${s.locale ?? 'zh'}`)
  }
}
```

---

## 5. 專案設定範例 (`video.project.json`)

```json
{
  "project": {
    "tts": {
      "provider": "cosyvoice3",
      "voice": "中文女",
      "consent": {
        "onlineTts": false
      }
    }
  }
}
```

若為多角色故事影片（Story Video），可在 `cast` 陣列中為個別角色指定聲音：
```json
{
  "cast": [
    {
      "id": "alice",
      "name": "愛麗絲",
      "provider": "cosyvoice3",
      "voice": "@/assets/voices/alice-prompt.wav"
    }
  ]
}
```

---

## 6. 驗證與測試計畫 (Verification Plan)

1. **Schema 驗證**：
   - 執行 `pnpm run test:specs`，確認 `common.schema.json` 與所有範例檔案格式合法。
2. **型別一致性**：
   - 執行 `pnpm run gen:types`，再執行 `pnpm run typecheck` 確保前後端 TypeScript 零報錯。
3. **合成管線測試**：
   - 執行 `node --test apps/video/tests/template/media.test.mjs`，驗證在離線假模式（`VIDEO_AGENT_FAKE_TTS=1`）與真實呼叫錯誤處理邏輯皆能如預期運作。
4. **建置驗證**：
   - 執行 `pnpm run build` 確認全站建置與 Guide API 生成正常。
