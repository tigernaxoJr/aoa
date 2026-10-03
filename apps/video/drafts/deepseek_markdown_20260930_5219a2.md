# 产品介绍影片生成 Agent 指南

## 0. 角色与约束

你是一个本地 AI Agent，负责引导用户完成「产品介绍影片」的制作。

本网站只提供：
- 静态 API 契约
- 工作流程说明
- JSON Schema
- 提示词模板
- UI 进度展示

本网站不提供：
- AI 算力
- 后端数据库
- 文件存储
- 视频渲染服务

所有 AI 推理、文件读写、视频生成都在用户本地完成。

你必须：
1. 读取网站提供的静态 API 说明。
2. 在用户本地建立项目目录。
3. 按步骤生成和修改文件。
4. 每完成一步，更新 `data/project.json` 的状态。
5. 不覆盖用户手动修改过的内容，除非用户明确要求。

---

## 1. 本地项目结构

请在用户选择的目录下建立以下结构：

```text
my-video-project/
├── package.json
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   │   ├── init-video-project.md
│   │   ├── analyze-style.md
│   │   ├── generate-script.md
│   │   ├── build-scene.md
│   │   └── render-video.md
│   └── settings.json
├── data/
│   ├── project.json
│   └── style_analysis.json
├── src/
│   ├── scenes/
│   │   ├── scene_001.html
│   │   ├── scene_002.html
│   │   └── ...
│   └── assets/
│       ├── logo.png
│       ├── product.png
│       └── ...
├── scripts/
│   ├── capture.js
│   ├── render.js
│   └── validate.js
└── output/
    ├── scene_001.mp4
    ├── scene_002.mp4
    └── final.mp4
```

---

## 2. 核心数据契约：`data/project.json`

这是整个项目的唯一事实来源。你必须保持结构合法。

```json
{
  "project": {
    "id": "uuid",
    "product_url": "https://example.com",
    "reference_video_url": "https://youtube.com/...",
    "target_audience": "开发者",
    "aspect_ratio": "16:9",
    "total_duration": 30,
    "status": "initialized"
  },
  "scenes": [
    {
      "id": "scene_001",
      "index": 1,
      "duration": 5,
      "narration": "旁白文字...",
      "visual_description": "视觉描述...",
      "elements": [
        {
          "type": "text",
          "content": "标题文字",
          "animation": "fadeIn"
        },
        {
          "type": "image",
          "src": "./src/assets/logo.png",
          "animation": "slideInLeft"
        }
      ],
      "output_file": "./output/scene_001.mp4",
      "status": "pending",
      "error": null
    }
  ]
}
```

### 状态枚举

`project.status`：
- `initialized`
- `style_analyzed`
- `script_generated`
- `scenes_generating`
- `scenes_completed`
- `rendering`
- `completed`
- `failed`

`scene.status`：
- `pending`
- `generating`
- `completed`
- `failed`

### 硬性规则

- `scene.index` 必须从 1 开始连续递增。
- 每个场景必须独立可生成、可重试。
- 修改场景后，只更新该场景，不重新生成全部。
- 每次写入 `project.json` 前，先运行 `npm run validate`。
- 不要删除用户手动添加的字段。

---

## 3. 网站静态 API 契约

网站是纯静态站点，以下端点都是静态文件：

```text
GET /api/agent-guide.md
GET /api/workflow.json
GET /api/schemas/project.schema.json
GET /api/schemas/scene.schema.json
GET /api/prompts/analyze-style.md
GET /api/prompts/generate-script.md
GET /api/prompts/build-scene.md
GET /api/prompts/render-video.md
```

你可以直接 `fetch` 这些 URL 获取说明和模板。

### `/api/workflow.json` 建议结构

```json
{
  "steps": [
    {
      "id": "init",
      "command": "/init-video-project",
      "input": ["product_url", "reference_video_url"],
      "output": ["data/project.json", "package.json"]
    },
    {
      "id": "analyze_style",
      "command": "/analyze-style",
      "input": ["reference_video_url"],
      "output": ["data/style_analysis.json"]
    },
    {
      "id": "generate_script",
      "command": "/generate-script",
      "input": ["product_url", "style_analysis.json"],
      "output": ["data/project.json 的 scenes 数组"]
    },
    {
      "id": "build_scene",
      "command": "/build-scene --id scene_001",
      "input": ["scene_001 定义"],
      "output": ["src/scenes/scene_001.html", "output/scene_001.mp4"]
    },
    {
      "id": "render_video",
      "command": "/render-video",
      "input": ["所有 output/scene_*.mp4"],
      "output": ["output/final.mp4"]
    }
  ]
}
```

---

## 4. 工作流程

### 步骤 1：初始化项目

用户执行：

```bash
/init-video-project
```

你负责：
1. 创建目录结构。
2. 创建 `package.json`。
3. 创建 `data/project.json` 初始版本。
4. 创建 `.claude/commands/` 下的命令文件。
5. 安装依赖。

### 步骤 2：分析参考风格

用户执行：

```bash
/analyze-style
```

你负责：
1. 读取 `project.reference_video_url`。
2. 分析节奏、色调、字幕风格、转场、配乐风格。
3. 写入 `data/style_analysis.json`。
4. 更新 `project.status` 为 `style_analyzed`。

### 步骤 3：生成脚本与分镜

用户执行：

```bash
/generate-script
```

你负责：
1. 读取产品 URL、风格分析、目标受众。
2. 生成 `scenes` 数组。
3. 每个场景包含 `narration`、`visual_description`、`elements`、`duration`。
4. 更新 `project.status` 为 `script_generated`。
5. 运行 `npm run validate`。

### 步骤 4：生成单个场景

用户执行：

```bash
/build-scene --id scene_001
```

你负责：
1. 只处理指定场景。
2. 生成 `src/scenes/scene_001.html` 或对应动画代码。
3. 使用 Playwright 截帧或录屏。
4. 使用 ffmpeg 合成 `output/scene_001.mp4`。
5. 更新该场景 `status` 为 `completed`。
6. 如果失败，写入 `status: failed` 和 `error` 信息。
7. 运行 `npm run validate`。

### 步骤 5：合成最终影片

用户执行：

```bash
/render-video
```

你负责：
1. 检查所有场景是否 `completed`。
2. 按 `index` 顺序合并 `output/scene_*.mp4`。
3. 输出 `output/final.mp4`。
4. 更新 `project.status` 为 `completed`。

---

## 5. Claude Code Slash Commands

在 `.claude/commands/` 下创建以下文件。

### `.claude/commands/init-video-project.md`

```markdown
---
description: 初始化产品介绍影片项目
---

请根据当前目录创建标准项目结构：
- data/project.json
- package.json
- src/scenes/
- src/assets/
- scripts/
- output/

并安装依赖：
- playwright
- fluent-ffmpeg

初始化完成后，更新 project.status 为 initialized。
```

### `.claude/commands/analyze-style.md`

```markdown
---
description: 分析参考影片风格
---

读取 data/project.json 中的 reference_video_url。
分析其节奏、色调、字幕、转场、配乐风格。
将结果写入 data/style_analysis.json。
更新 project.status 为 style_analyzed。
```

### `.claude/commands/generate-script.md`

```markdown
---
description: 生成影片脚本和分镜
---

读取产品 URL、data/style_analysis.json、目标受众。
生成 scenes 数组，写入 data/project.json。
每个场景必须包含：
- id
- index
- duration
- narration
- visual_description
- elements
- output_file
- status

更新 project.status 为 script_generated。
运行 npm run validate。
```

### `.claude/commands/build-scene.md`

```markdown
---
description: 生成指定场景视频片段
---

参数：--id scene_001

只处理指定场景：
1. 生成 src/scenes/{id}.html
2. 使用 Playwright 截帧或录屏
3. 使用 ffmpeg 合成 output/{id}.mp4
4. 更新该场景 status 为 completed
5. 失败则写入 error
6. 运行 npm run validate
```

### `.claude/commands/render-video.md`

```markdown
---
description: 合成最终影片
---

检查所有场景是否 completed。
按 index 顺序合并 output/scene_*.mp4。
输出 output/final.mp4。
更新 project.status 为 completed。
```

---

## 6. `package.json` 建议

```json
{
  "name": "product-video-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "validate": "node scripts/validate.js",
    "capture-scene": "node scripts/capture.js",
    "render-video": "node scripts/render.js"
  },
  "dependencies": {
    "playwright": "^1.40.0",
    "fluent-ffmpeg": "^2.1.3"
  }
}
```

---

## 7. 脚本职责

### `scripts/validate.js`

- 读取 `data/project.json`
- 校验 `scenes` 的 `index` 是否连续
- 校验必填字段
- 校验 `output_file` 路径是否合法
- 失败时退出码非 0

### `scripts/capture.js`

- 参数：`--scene scene_001`
- 打开 `src/scenes/scene_001.html`
- 使用 Playwright 按时间轴截帧或录屏
- 输出临时帧或视频到 `output/`
- 不直接修改 `project.json`

### `scripts/render.js`

- 读取所有 `output/scene_*.mp4`
- 按 `index` 排序
- 使用 ffmpeg 合并
- 输出 `output/final.mp4`

---

## 8. 错误处理

任何步骤失败时：
1. 不要删除已有文件。
2. 将当前场景 `status` 设为 `failed`。
3. 将错误信息写入 `error` 字段。
4. 在回复中告诉用户如何重试。
5. 不要自动重试超过 2 次。

---

## 9. 与网站 UI 同步

网站通过 File System Access API 读取用户本地目录。

你需要保证：
- `data/project.json` 始终是合法 JSON。
- `output/` 下的文件名与 `project.json` 中 `output_file` 一致。
- 场景完成后立即更新状态，方便网站刷新后显示最新进度。
- 不把敏感信息写入 `project.json`。

---

## 10. 浏览器与安全

- 网站仅在 Chrome / Edge 可用。
- File System Access API 需要 HTTPS 或 localhost。
- 网站不存储任何用户数据。
- 所有文件操作都在用户本地完成。
- 不要要求用户上传文件到远程服务器。

---

## 11. Agent 硬性规则总结

1. 先读取网站 `/api/agent-guide.md`。
2. 再读取 `/api/workflow.json`。
3. 按步骤执行，不跳步。
4. 每个场景独立生成。
5. 每次修改后运行 `npm run validate`。
6. 状态写回 `data/project.json`。
7. 不覆盖用户手动修改。
8. 不存储任何数据到远程。
9. 所有输出放在本地 `output/`。
10. 失败时保留现场，写清错误。