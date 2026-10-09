# 準備你的 Agent

[English](setup.md) \| **繁體中文**

> **本站的三個工作台都不在雲端跑 AI：真正動手的是你電腦上的 Coding Agent。這頁說明怎麼準備一個。**

---

## 你需要什麼

- **一個 Coding Agent**：能讀網址、讀寫你電腦上的資料夾、執行指令的 AI 助手，例如 Claude Code、Codex、Cursor、Gemini CLI 或 Pi。
- **它的方案或 API 額度**：工作台本身免費，Agent 的推論費用由你自己的方案支付。
- **桌面版 Chrome 或 Edge**（建議）：工作台透過瀏覽器的資料夾存取功能，即時顯示 Agent 的進度。

其他工具（Node.js、FFmpeg、Playwright、語音合成等）不用先裝：Agent 開工時會檢查，缺什麼就替你安裝，或告訴你要執行哪一行指令。

## 推薦：Claude

如果你還沒有任何 Coding Agent，建議從 Claude 開始。使用 Claude Code 需要 Pro、Max、Team 或 Enterprise 方案，或 Anthropic Console 的 API 帳號；免費方案不包含 Claude Code。

### 不熟悉終端機：Claude 桌面版

1. 到 [claude.ai/download](https://claude.ai/download) 下載 Claude 桌面版（macOS、Windows），安裝後登入。
2. 切到視窗上方的 **Code** 分頁。
3. 開一個新的對話，選擇資料夾：選你在工作台上準備的那個資料夾。
4. 回到工作台按「複製」，把那段話貼進對話框送出。

接下來 Agent 會在那個資料夾裡工作，工作台會自動顯示進度。Agent 要執行指令或修改檔案前可能會先詢問你，看清楚內容再允許即可。

### 工程師：Claude Code CLI

在終端機執行安裝指令：

```bash
# macOS、Linux、WSL
curl -fsSL https://claude.ai/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://claude.ai/install.ps1 | iex
```

也可以用 Homebrew（`brew install --cask claude-code`）或 WinGet（`winget install Anthropic.ClaudeCode`）安裝。裝好後，切到工作台準備的資料夾再啟動：

```bash
cd 你的專案資料夾
claude
```

第一次啟動會開瀏覽器請你登入。之後把工作台產生的那段話貼進去即可。完整說明見 [Claude Code 安裝文件](https://code.claude.com/docs/en/setup)。

## 其他 Coding Agent

工作台不綁定特定 Agent。只要它能讀網址、在你的電腦上讀寫檔案並執行指令，就能使用：

| Agent | 取得方式 |
| --- | --- |
| Codex（OpenAI） | [developers.openai.com/codex](https://developers.openai.com/codex) |
| Cursor | [cursor.com](https://cursor.com) |
| Gemini CLI（Google） | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Pi | [pi.dev](https://pi.dev) |

使用方式都一樣：在 Agent 裡開啟工作台準備的資料夾，貼上工作台產生的那段話。

## 選讀：改用地端模型

推論接在哪裡是 Agent 的設定，工作台不需要改。如果資料不能離開內網，可以讓支援自訂模型的 Agent 改接以 [Ollama](https://ollama.com) 或 [vLLM](https://docs.vllm.ai) 架設的地端模型，或透過 AWS Bedrock、Google Vertex AI、Azure 等 CSP 託管服務使用雲端模型。地端模型處理複雜任務的能力可能較弱，產出品質會因模型而異。背後的設計見架構規格的[原則四](architecture.zh-TW.md#原則四local-first--data-sovereignty本地優先與資料主權)。

## 常見問題

**網頁說這個瀏覽器不能存取資料夾。**
資料夾存取需要桌面版 Chrome 或 Edge；Brave 預設停用，Firefox 與 Safari 不支援。換用其他瀏覽器時，影片工作台仍可略過準備資料夾這一步，Agent 會自己建立專案，只是網頁無法即時顯示進度。

**重新整理網頁後，資料夾要重新授權。**
這是瀏覽器的安全限制。按網頁上的提示重新選取同一個資料夾即可，專案內容不會遺失。

**Agent 說找不到資料夾，或在別的地方建立了專案。**
確認 Agent 開啟的資料夾就是工作台準備的那一個。Claude 桌面版可以在對話中重新選擇資料夾；CLI 則先 `cd` 到該資料夾再啟動 `claude`。

**網頁能不能直接叫醒 Agent？**
不行。網頁只負責準備資料夾和那段話，Agent 需要由你啟動並貼上。這是本站採用的[模式 A](architecture.zh-TW.md#模式-a純工作台模式pure-workbench--file-driven) 的限制。
