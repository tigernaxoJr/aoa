# 🎬 Agent Video Producer Guide (AVPG)

## 📌 專案簡介
這是一個「無狀態」的引導型網站，專門為本地運行的 AI Agent (如 Claude Code) 提供結構化的 API 指導，使其能一步一步自動完成「產品介紹影片」的企劃、錄製與生成。
本網站**不提供 AI 算力**，也**不儲存任何用戶資料**。所有運算、檔案生成與儲存均在用戶本地的 `file://` 環境中完成。

## 🏗️ 核心架構
1. **引導網站 (本專案)**：純靜態前端 + 靜態 JSON API (或無狀態 Serverless Function)。提供 SOP 步驟、文案模板與本地專案規範。
2. **本地 Agent (Claude Code)**：運行於用戶電腦。負責讀取本網站的 API，並在本地初始化專案、執行腳本、呼叫本地工具 (如 FFmpeg, Puppeteer) 完成影片分段生成。
3. **本地檔案系統**：所有上傳的素材、生成的文案、分段的影片 (`.mp4`) 均儲存在本地專案目錄中，方便隨時單獨修正某一段落。

## 🌐 網站 API 規格 (Guide API)
網站需提供一個端點 (例如 `/api/guide` 或靜態 `/guide.json`)，返回以下結構的 JSON，指導 Agent 行動：

```json
{
  "project_name": "local-video-producer",
  "description": "本地產品介紹影片自動化生成專案",
  "local_setup": {
    "init_command": "mkdir -p project && cd project && npm init -y",
    "required_files": [
      "package.json",
      "config.json",
      "assets/",
      "segments/",
      "output/"
    ],
    "dependencies": ["fluent-ffmpeg", "puppeteer", "dotenv"]
  },
  "workflow": [
    {
      "step": 1,
      "action": "analyze",
      "description": "讀取用戶提供的產品 URL 或本地 source code (如 package.json, README.md)，提取核心功能、目標受眾與 USP (獨特賣點)。",
      "output": "analysis.md (存於本地)"
    },
    {
      "step": 2,
      "action": "copywriting",
      "description": "根據 analysis.md，生成分段影片文案。每段需包含：畫面描述 (Visual)、旁白台詞 (Audio)、預計秒數。",
      "output": "script.md (存於本地，需明確分段如 Segment 1, Segment 2)"
    },
    {
      "step": 3,
      "action": "record_segment",
      "description": "根據 script.md，使用 Puppeteer 或本地螢幕錄製工具，『逐段』錄製產品 UI 操作。每段獨立存檔。",
      "output": "segments/seg_01.mp4, segments/seg_02.mp4 ..."
    },
    {
      "step": 4,
      "action": "review_and_fix",
      "description": "提供本地預覽指令。若用戶要求修改某一段，僅需重新執行該 segment 的錄製或文案生成，無需重做全部。",
      "output": "更新對應的 segments/seg_XX.mp4"
    },
    {
      "step": 5,
      "action": "compile",
      "description": "使用本地 FFmpeg 將所有 segments 合併，並可選加入背景音樂或字幕，輸出最終影片。",
      "output": "output/final_video.mp4"
    }
  ]
}