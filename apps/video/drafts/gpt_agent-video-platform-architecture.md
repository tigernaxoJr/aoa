# Agent Video Production Platform 規劃

## 1. 產品定位

本產品不是 AI 影片生成 SaaS，而是：

> A Web-based Agent Interface for Local Video Production

網站本身不提供 AI 算力、不保存使用者專案資料、不負責影片渲染。

核心價值是提供 Agent（例如 Claude Code）一套標準化的：

- Project Specification
- Workflow
- Skills
- Templates
- Schema
- UI
- Agent API / MCP Interface

讓 Agent 可以讀取產品資料後，在使用者本機一步一步建立產品介紹影片。

---

## 2. 建議整體架構

```text
                    Internet
                       │
                       ▼
             ┌─────────────────────┐
             │ 你的產品網站         │
             │                     │
             │  Web UI             │
             │  Agent API / MCP    │
             │  Workflow           │
             │  Skill              │
             │  Template           │
             └─────────┬───────────┘
                       │
                       │ HTTPS / MCP
                       ▼
                ┌─────────────┐
                │ Claude Code │
                └──────┬──────┘
                       │
                       │ Local
                       ▼
             ┌──────────────────────┐
             │ 使用者本機 Project    │
             │                      │
             │ source               │
             │ scenes               │
             │ assets               │
             │ scripts              │
             │ rendering            │
             │ output               │
             └──────────────────────┘
```

### Cloud / Website

負責：

- 網站 UI
- Workflow
- Project Schema
- Scene Schema
- Agent Skill
- Prompt
- Template
- 文件
- Agent API / MCP Resource

不負責：

- LLM
- Embedding
- Video rendering
- 使用者專案儲存
- 使用者素材永久保存

### Local

負責：

- Claude Code
- Source Code
- Project Files
- npm / Node.js
- FFmpeg
- Remotion 或其他影片工具
- Browser Automation
- Video Rendering
- 最終影片

---

## 3. 第一版可以完全沒有 Backend

MVP 可以做成 Static Web：

```text
Vue 3
Vite
TypeScript
       │
       ├── Web UI
       ├── Workflow
       ├── Schema
       ├── Skills
       └── Templates
```

部署到：

- Cloudflare Pages
- GitHub Pages
- Nginx
- S3 / Static Hosting

即可。

甚至可以不使用 ASP.NET Core。

如果未來需要版本管理、動態 MCP、Authentication 或其他服務，再加入很薄的 Backend。

---

## 4. Browser 本地檔案

不要把設計建立在任意 `file://` 存取。

Browser 不允許：

```javascript
fetch("file:///C:/project/video.json")
```

任意讀寫使用者電腦。

建議使用：

> File System Access API

由使用者主動選擇 Project Folder：

```text
[選擇 Project Folder]
```

取得：

```text
FileSystemDirectoryHandle
```

然後在授權範圍內讀寫：

```text
video.project.json
scenes/
assets/
output/
```

---

## 5. Project Specification

最重要的設計不是影片 UI，而是標準化 Project。

建議專案：

```text
video-project/
│
├── package.json
├── README.md
├── AGENTS.md
├── video.project.json
│
├── scenes/
│   ├── 001-introduction/
│   │   ├── scene.json
│   │   ├── script.md
│   │   ├── assets/
│   │   └── output/
│   │
│   ├── 002-problem/
│   │   ├── scene.json
│   │   ├── script.md
│   │   ├── assets/
│   │   └── output/
│   │
│   └── 003-solution/
│       ├── scene.json
│       ├── script.md
│       ├── assets/
│       └── output/
│
├── assets/
├── scripts/
├── src/
└── output/
```

---

## 6. 為什麼影片要 Scene 化

不要只產生：

```text
product-video.mp4
```

而應該：

```text
Scene 001
Scene 002
Scene 003
Scene 004
Scene 005
```

例如：

```text
001 Hook
002 Problem
003 Product
004 How it works
005 Benefits
006 CTA
```

每個 Scene 都可以獨立：

- 編輯
- 驗證
- Render
- Review
- 修改

例如使用者只對第三段不滿：

```text
修改 Scene 003
      ↓
Render Scene 003
      ↓
重新組合 Final Video
```

不需要重新產生整部影片。

---

## 7. Scene Schema

可以先定義：

```json
{
  "id": "scene-003",
  "title": "產品介紹",
  "duration": 8,
  "script": "...",
  "visual": "...",
  "voice": "...",
  "transition": "...",
  "status": "draft"
}
```

正式版本建議再拆成 JSON Schema：

```text
schemas/
├── project.schema.json
├── scene.schema.json
└── asset.schema.json
```

Agent 必須遵守 Schema。

---

## 8. AGENTS.md

專案應該自帶 Agent 規則：

```md
# Product Video Project

## Goal

Create a product introduction video.

## Rules

1. Never modify completed scenes unless explicitly requested.
2. Each scene must be independently renderable.
3. All scene metadata must conform to scene.schema.json.
4. Never place generated assets outside assets/.
5. Run validation before rendering.
6. Render scenes individually.
7. Final video is assembled only after all scenes pass validation.

## Workflow

1. Analyze source
2. Create product brief
3. Create storyboard
4. Create scenes
5. Generate assets
6. Render scenes
7. Review
8. Assemble final video
```

---

## 9. Agent Skill

網站可以提供：

```text
skills/
└── product-video/
    ├── SKILL.md
    ├── workflow.md
    ├── project-schema.json
    ├── scene-schema.json
    ├── script-guide.md
    └── rendering-guide.md
```

Agent 讀取 Skill 後知道完整工作流程：

```text
Analyze Product
      ↓
Product Brief
      ↓
Storyboard
      ↓
Scene Planning
      ↓
Script
      ↓
Assets
      ↓
Render
      ↓
Review
      ↓
Revision
      ↓
Final Assembly
```

---

## 10. MCP

如果目標是讓 Claude Code 操作你的產品，建議第二階段加入 MCP。

可以提供 Resources：

```text
video://workflow
video://project-schema
video://scene-schema
video://best-practices
video://templates/product-introduction
```

也可以提供 Tools：

```text
create_project
create_scene
validate_project
validate_scene
get_scene
update_scene
render_scene
assemble_video
```

但要區分：

### Cloud MCP

主要提供：

- Resources
- Prompts
- Skills
- Templates
- Schemas

### Local MCP

主要處理：

- File System
- FFmpeg
- npm
- Remotion
- Browser
- Rendering

因此推薦：

```text
Claude Code
     │
     ├── Cloud MCP
     │       └── Workflow / Skill / Schema
     │
     └── Local MCP
             ├── File System
             ├── FFmpeg
             ├── Remotion
             └── Browser
```

---

## 11. API 設計

不建議第一版設計成：

```http
POST /api/video/generate
```

因為這會讓產品變成傳統 AI Video SaaS。

比較適合：

```http
GET /api/project/schema
GET /api/project/workflow

GET /api/scene/schema
GET /api/scene/workflow

GET /api/skills/product-video

GET /api/templates/product-video

GET /api/rules/script

GET /api/rules/visual
```

這些 API 本質上是：

> Agent 的說明書 + 作業規則

第一版甚至可以全部是 Static JSON / Markdown。

---

## 12. UI 定位

UI 不要做成：

```text
Upload
   ↓
Generate
   ↓
Download
```

而應該是 Agent 工作台。

例如：

```text
┌────────────────────────────────────────────┐
│ Product Video Agent                        │
├────────────────────────────────────────────┤
│ Source                                     │
│                                            │
│ URL                                        │
│ [ https://example.com              ]       │
│                                            │
│ Source Code                                │
│ [ Select local folder ]                    │
│                                            │
│ Product Description                        │
│ [                                    ]      │
│                                            │
│ Video Plan                                 │
│                                            │
│ ✓ 01 Product Overview                      │
│ ✓ 02 Problem                               │
│ ● 03 Solution                              │
│ ○ 04 Features                              │
│ ○ 05 CTA                                   │
└────────────────────────────────────────────┘
```

Agent Activity：

```text
✓ Analyze product
✓ Read source website
✓ Create product brief
✓ Create storyboard
● Generate Scene 03
  ├─ Generate script
  ├─ Generate visual description
  ├─ Generate animation
  └─ Render
○ Scene 04
○ Scene 05
```

UI 的主要目的不是執行 AI，而是：

> 將本機 Agent 的工作狀態、Project 與 Scene 視覺化。

---

## 13. 建議的技術架構

### Frontend

```text
Vue 3
Vite
TypeScript
Tailwind / Vuetify
File System Access API
```

### Cloud

MVP：

```text
Static Hosting
```

之後：

```text
ASP.NET Core Minimal API
```

只在真正需要時加入。

### Agent

```text
Claude Code
MCP
Agent Skills
```

### Local Video

```text
Node.js
npm
FFmpeg
Remotion
Playwright
```

---

## 14. 開發階段

### Phase 1 — Specification

先完成：

```text
video.project.json
project.schema.json
scene.schema.json
AGENTS.md
SKILL.md
workflow.md
```

這是整個產品最重要的基礎。

### Phase 2 — Web UI

完成：

```text
Product Input
Project Viewer
Scene List
Scene Editor
Workflow Viewer
Local Folder Access
```

### Phase 3 — Claude Code

讓 Claude Code 可以：

```text
讀取 Skill
↓
建立 Project
↓
建立 Scene
↓
修改 Scene
↓
Render
```

### Phase 4 — MCP

加入：

```text
Cloud MCP
Local MCP
```

### Phase 5 — Local Video Pipeline

整合：

```text
Remotion
FFmpeg
Playwright
```

### Phase 6 — Advanced

未來才考慮：

```text
Authentication
Cloud Project
Team Collaboration
Project History
Object Storage
Database
```

---

## 15. 最終產品模型

整體可以濃縮成：

```text
                  YOUR WEBSITE
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Workflow        Skills         Schema
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
                  CLAUDE CODE
                       │
             ┌─────────┴─────────┐
             │                   │
          Planning            Coding
             │                   │
             └─────────┬─────────┘
                       │
                       ▼
                 LOCAL PROJECT
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Source         Scenes         Assets
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
                 Local Render
                       │
                       ▼
                   final.mp4
```

---

## 16. 核心產品理念

最重要的是把產品定義成：

> **讓 Coding Agent 具備「影片製作能力」。**

而不是：

> AI 幫你產生影片。

網站負責：

```text
Specification
Workflow
Skills
UI
Validation
Templates
```

Agent 負責：

```text
Reasoning
Planning
Coding
File Manipulation
Calling Local Tools
```

本機負責：

```text
Source Code
Assets
Project
Rendering
Output
```

這樣可以保持：

- 零 AI 算力成本
- 不保存使用者專案
- 不需要大型 Backend
- 使用者資料留在本機
- Agent 可以自動化整個工作流程
- Scene 可以獨立修改
- 未來可以支援 Claude Code 以外的 Agent
- 未來可以再加入 MCP、Team Collaboration 或 Cloud Project

---

## 17. 最終建議

第一版不要急著開發完整網站。

先把下面五個檔案定義好：

```text
AGENTS.md
SKILL.md
video.project.json
project.schema.json
scene.schema.json
```

這五個檔案決定你的產品真正的「協議」。

Vue UI、MCP、Claude Code、FFmpeg、Remotion 都只是建立在這套協議之上的實作。

---

## 18. 建議的 MVP Repository

```text
agent-video-platform/
│
├── apps/
│   └── web/
│
├── specs/
│   ├── project.schema.json
│   ├── scene.schema.json
│   └── asset.schema.json
│
├── skills/
│   └── product-video/
│       ├── SKILL.md
│       ├── workflow.md
│       ├── script-guide.md
│       └── rendering-guide.md
│
├── templates/
│   └── product-video/
│       ├── package.json
│       ├── AGENTS.md
│       ├── README.md
│       └── video.project.json
│
├── mcp/
│   ├── cloud/
│   └── local/
│
└── docs/
    ├── architecture.md
    ├── agent-workflow.md
    └── local-development.md
```

這個 Repository 結構本身也可以直接成為你後續開發的起點。
