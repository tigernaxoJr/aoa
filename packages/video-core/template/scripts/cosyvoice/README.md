# Fun-CosyVoice 3.0 (Basic) 本地伺服器

本目錄提供 **CosyVoice 3 (Fun-CosyVoice 3.0)** 本地語音合成服務，配合 `pnpm run tts` 進行高品質語音旁白與語音克隆。

> **重要說明**：
> 本系統採用阿里官方開源的 **CosyVoice 3 代 Basic 基礎模型**（ModelScope / HuggingFace: `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`）。
> **嚴格排除 RL (Reinforcement Learning) 實驗版本**（`Fun-CosyVoice3-0.5B-2512_RL`），避免本地推論時遭遇環境依賴衝突或運行失敗。

---

## 📦 跨專案共用安裝位置

PyTorch、CosyVoice 與模型權重合計數 GB，而本機服務與專案無關，所以**整台機器只裝一份**，所有影片專案共用：

```text
~/.aoa/cosyvoice/
├── .venv/                                 # Python 虛擬環境（torch、cosyvoice、fastapi…）
└── pretrained_models/Fun-CosyVoice3-0.5B/ # 模型權重
```

- 設定環境變數 `AOA_HOME` 可改放到其他位置（例如空間較大的磁碟）：`AOA_HOME=D:oa`。
- 第二個專案起執行 `pnpm run cosyvoice:setup` 會沿用已安裝的環境與權重，不會重複下載。
- 一個 `pnpm run cosyvoice:serve` 可同時供所有專案使用；聲音克隆的 `@/` 參考音檔由各專案的 `pnpm run tts` 換成絕對路徑後送出。
- 舊版範本把權重下載在專案內的 `scripts/cosyvoice/pretrained_models/`；執行 `cosyvoice:setup` 或 `cosyvoice:serve` 時會自動搬到共用位置（共用位置已有時則刪除專案內的重複副本）。
- 若之前為專案另外建立過 Python 虛擬環境（例如專案內的 `.venv/`），確認不再需要後可自行刪除。

---

## ⚡ 硬體加速環境導引 (Hardware Acceleration)

`pnpm run cosyvoice:setup` 具備**智慧硬體偵測**，會自動替您的系統安裝最佳加速版本：

| 硬體平台 | 自動偵測目標 | 安裝之 PyTorch 版本 | 推論效能 |
|---|---|---|---|
| **NVIDIA GPU** | 偵測 `nvidia-smi` | **PyTorch with CUDA 12.4** (`--index-url .../whl/cu124`) | **極速 (幾百毫秒~1秒)** |
| **AMD GPU (Linux)** | 偵測 `rocm-smi` | **PyTorch with ROCm 6.1** (`--index-url .../whl/rocm6.1`) | **極速** |
| **AMD GPU (Windows)** | 偵測 WMI Radeon 顯卡 | 標準 PyTorch（提示在 WSL2 或配備 DirectML 獲得最佳加速） | 良好 |
| **Apple Silicon (Mac)** | 偵測 M 系列 ARM64 晶片 | **Apple MPS (Metal Performance Shaders)** 原生加速 | **快速 (1~2秒)** |
| **純 CPU 模式** | 無獨立顯卡時 | 標準 CPU 版 PyTorch（或建議配置 `DASHSCOPE_API_KEY` 雲端模式） | 一般 (10~30秒) |

---

## 快速啟動指令

在專案目錄下：

1. **安裝環境與權重**（自動偵測 GPU/CUDA/ROCm、安裝對應 PyTorch 並下載 3 代 Basic 模型）：
   ```bash
   pnpm run cosyvoice:setup
   ```

2. **啟動本機服務**（於背景執行，預設監聽 `http://127.0.0.1:50000`）：
   ```bash
   pnpm run cosyvoice:serve
   ```

3. **測試模擬模式（無需 GPU 與權重，供介面與流程測試）**：
   ```bash
   python scripts/cosyvoice/server.py --mock
   ```

---

## 音色與情緒指令設定指南 (`video.project.json`)

```json
{
  "project": {
    "tts": {
      "provider": "cosyvoice3",
      "voice": "中文女 <用熱情興奮的語氣說>"
    }
  }
}
```

### 1. 內建預設音色
可執行 `pnpm run tts --list-voices` 查詢：
- `中文女`：中文女聲（柔和清晰）
- `中文男`：中文男聲（沉穩大氣）
- `粵語女`：粵語女聲（生動）
- `英文女`：英文女聲（國際）
- `英文男`：英文男聲（專業）
- `日語男`：日語男聲
- `韓語女`：韓語女聲

### 2. 自然語言情緒/風格指令 (Instruct Control)
在 `voice` 設定中加入 `<指令>` 或 `(指令)`：
- `"中文女 <用熱情興奮的語氣說>"`
- `"中文男 <專業嚴肅的紀錄片旁白>"`
- `"中文女 <用台語/閩南語親切地說>"`
- `"中文男 <用四川話幽默地說>"`

### 3. 聲音克隆（Zero-shot Clone）
將 3 秒以上的參考音訊（WAV 格式）放入專案，例如：
```json
{
  "project": {
    "tts": {
      "provider": "cosyvoice3",
      "voice": "@/assets/voices/star-prompt.wav <用英語說>"
    }
  }
}
```
CosyVoice 3 代模型將自動提取聲紋進行零樣本聲音克隆，並可跨語言朗讀。
