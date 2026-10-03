# video-agent

`video-agent` 是專為 Video 功能提供的本機 CLI 與 MCP（Model Context Protocol）伺服器。

## 功能

1. **`video-agent mcp`**：
   啟動 stdio MCP 伺服器，讓 Coding Agent（如 Claude Code）能讀取 Guide API（prompt 模板、規格）並直接以工具操作專案目錄（建立/更新 Scene、渲染、合成）。
2. **`video-agent serve`**：
   啟動專案內的 Companion 伺服器，提供 WebSocket 連線，讓網頁工作台能即時監看專案進度並觸發重新渲染。

## 註冊至 Claude Code

從本專案目錄執行：

```bash
claude mcp add video-agent -- node "$PWD/bin/video-agent.mjs" mcp
```

或以絕對路徑註冊：

```bash
claude mcp add video-agent -- node "<repo-path>/packages/video-agent/bin/video-agent.mjs" mcp
```

> 注意：此套件為 private 套件，不發佈至 npm。npm 上同名的 `video-agent` 套件與本專案無關，請勿自 npm 下載。
