# AOA: Agent-Offloaded Architecture

**English** \| [繁體中文](architecture.zh-TW.md)

> **An AI product architecture whose service runs no inference: reasoning and execution are offloaded to the agent the user already has**

---

## 1. Executive Summary

**AOA (Agent-Offloaded Architecture)** is a software architecture pattern for the AI agent era: a product offloads its agent work — LLM reasoning, tool use, and the tokens they consume — to the coding agent the user already has. The service keeps whatever else it needs, including a backend, databases, or lightweight models; what it does not run is the agent.

On the frontend, AOA takes the form of a static web app that works with the user's agent through a local folder (this frontend form is sometimes called AOFA, Agent-Offloaded Frontend Architecture). Most of this document describes that form, the most direct way to apply AOA; Modes B and C (§5) show AOA with a backend and with no frontend at all.

In the traditional generative AI product (SaaS) model, the vendor bears the heavy cost of cloud inference, media transcoding, and storage, while users bear the risk of privacy leaks and cloud lock-in of their data.

AOA inverts and redraws these responsibility boundaries:
- **The frontend (Presentation Layer)** does not depend on a backend for inference or computation. It is reduced to a purely static **protocol workbench** that can be hosted at zero cost on static platforms such as GitHub Pages.
- **Inference and execution (Execution & Inference Layer)** are offloaded to the **Coding Agent** the user already has (e.g., Claude Code, Cursor, Codex, Gemini CLI, Pi) and to local open-source toolchains (e.g., FFmpeg, Playwright).
  - **Inference**: By default it runs on the user's existing agent plan in that provider's cloud, so the cost is covered by the user's agent subscription / API quota rather than by the app vendor. When needed, the agent can instead be pointed at self-hosted local models, as Pi Agent does (e.g., LLMs on Ollama / llama.cpp, local TTS such as Piper / Kokoro), enabling fully offline operation.
  - **Execution**: File I/O, scraping, transcoding, compositing, and other heavy work run on the user's machine.
- **The communication and storage bus (Bus & SSOT)** uses the browser's **File System Access API** together with structured specifications (JSON Schema), making the local filesystem the Single Source of Truth.

---

## 2. Background: The Problems with Traditional AI Systems

### 2.1 The Three Costs of Cloud AI SaaS
1. **Compute Tax**: Every model inference, image generation, speech synthesis, or video render burns the vendor's server budget, pushing products toward expensive subscriptions or credit-based pricing.
2. **Privacy Black Box**: Users' source code, confidential data, voice, and custom assets must be uploaded to and stored in the vendor's cloud, which makes enterprises and individuals hesitant.
3. **Rigid Outputs**: Videos or assets produced by SaaS tools cannot be precisely fine-tuned; if the result is unsatisfying, the only option is to spend more credits regenerating it.

### 2.2 The Rise of Local Compute and Coding Agents
The user's local development environment has changed dramatically in recent years:
- A typical development machine easily handles execution-layer work such as scraping, transcoding, and compositing; some high-end machines can even run local LLM / TTS models.
- Local open-source pipelines (FFmpeg for audio/video compositing, Playwright for browser rendering) are extremely mature and completely free.
- **Coding Agents** have become widespread, with strong abilities in file I/O, command orchestration, reasoning, and self-repair — and most users are already paying for one.

**The core question**: If the user already has an agent that can reason and operate local tools, why should the frontend stand up a cloud backend and pay for inference and compute a second time?

---

## 3. Core Metaphor: Brain & Engine

> *An AI product needs a **brain** (LLM inference) and an **engine** (the tokens that inference consumes). In traditional SaaS the vendor provides both and recovers the cost through subscriptions. In AOA both belong to the user's agent; the service provides only the interface and the specification.*

| Role | What it does | Who provides it |
|---|---|---|
| **Service** | Interface (web workbench or API), specifications published at URLs, validation of the agent's results | The vendor, at near-zero marginal cost |
| **Brain** | LLM inference: understanding requests, planning, writing files, calling local tools | The user's agent and the model the user chose |
| **Engine** | Tokens consumed by inference | The user's agent plan, or local hardware running a self-hosted model |

```
┌────────────────────────────────────────────────────────┐
│                   Web Browser                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │     AOA Frontend (Static Workbench / Protocol)   │  │
│  │     - Zero-Inference                             │  │
│  │     - Schema Validator                           │  │
│  │     - Visualizer & Editor                        │  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │ File System Access API
                            │ (Local Directory Handle)
┌───────────────────────────┼────────────────────────────┐
│ User Local Machine        │                            │
│                           ▼                            │
│    ┌──────────────────────────────────────────────┐    │
│    │ Local Filesystem (Shared SSOT)               │    │
│    │ ├── specs / schemas                          │    │
│    │ ├── project.json / scene.json                │    │
│    │ ├── activity.json (progress signal)          │    │
│    │ └── assets / output                          │    │
│    └──────────────────────▲───────────────────────┘    │
│                           │                            │
│    ┌──────────────────────┴───────────────────────┐    │
│    │ Local Coding Agent                           │    │
│    │ - Brain: LLM reasoning                       │    │
│    │ - Engine: tokens from the user's plan        │    │
│    │   cloud LLM (default) / local model (opt.)   │    │
│    │ - Local tools (FFmpeg, Playwright, TTS)      │    │
│    │ - Protocol Conformant                        │    │
│    └──────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

---

## 4. Four Core Principles

### Principle 1: Offloaded Agent Work
- **A clear agent boundary**: Work that needs an agent's reasoning and tools — and the tokens it consumes — runs in the user's agent. The application layer, whether a purely static frontend or a backend with accounts and billing, **does not run that agent work**; it may still run its own services, including lightweight models.
- **Near-zero marginal agent cost for the vendor**: The service focuses on human-computer interaction (HCI), workflow guidance, collaboration metadata, and protocol validation; the agent's inference and the heavy execution it drives are handled by the user's agent (inference may use the user's own cloud plan or local models).

### Principle 2: Schema as the Contract
- The presentation/control layer and the executing agent are **not coupled through opaque proprietary commands or black-box APIs**.
- Their sole contract for communication and state transitions is a strictly defined, openly published set of **JSON Schemas / specifications**.
- The interface structures human intent into schema-conformant specs; the agent reads the environment, produces files, and updates the state machine according to the schema.

### Principle 3: Filesystem-Centric SSOT & Bus
- **Local SSOT**: All concrete source code, intermediate assets, temporary files, and generated outputs use the local filesystem as the single source of truth.
- **Files as signals**:
  - In the pure-frontend scenario, the frontend reads and writes files via the File System Access API and detects the agent's output through metadata fingerprint polling; the agent side is triggered by the user, who pastes the command the page prepares (see Mode A).
  - In the backend-collaboration scenario, the cloud only syncs sanitized project metadata (Metadata Plane), while the core data (Data Plane) always stays local.
  - Both sides follow a locking convention for writes (e.g., lock files and write-temp-then-rename) to reduce the risk of races. The File System Access API itself provides no cross-process file locking, and agent compliance with the convention must be verified, so the frontend should still validate against the schema and tolerate errors when reading.

### Principle 4: Local-First & Data Sovereignty
- **Assets never pass through the service**: Proprietary code, private assets, internal site credentials, and original drafts stay in the user's controlled environment; the service's servers (if any) never handle them.
- **The privacy boundary is the user's choice**: During inference, the agent sends the necessary context to the LLM provider the user chose, so the privacy boundary equals that provider's data policy. If data must never leave the machine, local LLM / TTS models can be used instead.
- **Inference can migrate step by step**: Where inference runs is part of the agent's configuration, not the service. An organization can adopt AOA on a cloud LLM or a CSP-hosted plan (such as AWS Bedrock, Google Vertex AI, or Azure OpenAI), then move to a self-hosted model served with tools such as Ollama or vLLM as privacy and compliance needs grow. The migration touches no part of the service, frontend, protocol, or existing projects; only the agent's model setting changes. Self-hosted models may handle complex tasks less well, but agent output is already validated against the schema with retry and repair paths, which absorbs that gap.
- **Self-Sustaining**: Even if the cloud backend goes offline or the service shuts down, local projects and generated assets remain fully readable and can be built and run independently with local toolchains.

---

## 5. Collaboration Modes

AOA supports three progressive modes. Mode A is a frontend working with a local folder; Mode B adds a thin backend; Mode C has no frontend at all.

### Mode A: Pure Workbench (File-Driven)
*The simplest frontend form; no extra local server is required.*
1. The frontend obtains a directory handle via the File System Access API.
2. Every N seconds, the frontend compares metadata of key files (a fingerprint computed from `lastModified` and file size).
3. When the agent finishes a storyboard or generates audio, the fingerprint changes and the frontend updates automatically.
4. When the frontend needs the agent to act (e.g., after the user edits the script), it marks the state file as `stale` and provides a standard command (e.g., `/video-sync`) for the user to paste into their terminal.

### Mode B: Backend-Enabled (Hybrid AOA)
*For multi-tenant systems that need team collaboration, account permissions, or enterprise management.*

**Key idea**: AOA does not reject backend servers! In systems with a backend, AOA achieves **a full decoupling of the Control Plane from the Compute Plane**:

```
[ Cloud Backend (Control Plane) ]
  ├── Auth & Billing
  ├── Team Sync & Project Metadata
  └── Shared Protocol / Prompt Registry
         ▲
         │ (lightweight JSON / Schema Sync)
         ▼
[ Web UI / Native App ] <──(local protocol bus)──> [ Local SSOT ] <──> [ Local Agent ]
                                                 └── private code, assets, heavy execution
```

1. **The cloud backend is only a thin control layer**:
   - It focuses on user permissions, collaboration notifications, billing and plan management, and publishing standardized schemas and prompt modules.
   - **The backend runs no energy-hungry model inference or media rendering, so the vendor's marginal compute cost approaches zero (Near-Zero Marginal Compute Cost)**.
2. **Compute and data stay on the user side (BYOA - Bring Your Own Agent)**:
   - Enterprise users' proprietary source code, trade secrets, and large media assets stay on employees' machines, processed and rendered by the agent, never passing through the service's backend.
   - Inference goes to the enterprise's chosen LLM provider (possibly an enterprise plan with a signed data agreement) or an in-house model.
   - Only sanitized, schema-validated "final project metadata" or videos the user explicitly chooses to publish are uploaded to the cloud backend, greatly narrowing the enterprise's privacy-compliance scope.
3. **The agent drives, the frontend shows it live**:
   - The agent calls the backend API as the specification describes (or attaches the MCP server the service provides). The backend validates against the schema, stores the state, and pushes events to every open frontend over WebSocket, SSE, or gRPC streaming.
   - The frontend subscribes to those events and redraws immediately, replacing Mode A's fingerprint polling. The user follows the agent's steps, intermediate results, and errors, and can correct any step directly in the UI; the correction goes back to the backend and becomes the agent's next input.
   - While the agent stays connected (for example through the MCP server or by listening on a task queue), the frontend can queue tasks on the backend for the agent to pick up, so the user no longer copies and pastes commands. The agent still runs on the user's side, limited to what the user has authorized.
   - Team members on the same project subscribe to the same event stream and see the agent's changes at the same time.
   - The backend only validates, stores, and broadcasts; it runs no inference, so marginal compute cost stays near zero.

### Mode C: Backend-Only (Agent-Operated API)
*For services with no user interface: the agent itself is the client.*

1. The service exposes an HTTP API (or wraps it as an MCP server) and publishes its specification at a URL: an OpenAPI document, a guide or skill, and JSON Schemas.
2. The agent reads the specification, plans, and calls the API directly. The service stores data and state and validates every request against the schema.
3. The service still runs no inference: the brain (LLM reasoning) and the engine (tokens) stay with the user's agent.
4. The API authenticates the agent with user-scoped credentials and treats every agent request as untrusted input.

### The specification entry point
Whatever the mode, the agent must first obtain the specification, and the entry point is usually a URL: a guide page, an OpenAPI document, or an index such as `/api/index.json`. A good entry point lists every schema, template, and command with absolute URLs and checksums, so the agent can verify what it downloads. This platform provides dedicated indexes at `/api/video/index.json` and `/api/slide/index.json`.

---

## 6. Reference Implementations

The AOA site ships two workbenches, each with its own static UI, protocol schemas, agent skill, and project template:
- **Slide Studio (Mode A)**: the agent builds a Slidev deck with HTML, SVG diagrams, and Three.js components and exports a PDF locally; the page only reads and writes the folder.
- **Video Studio (Mode A)**: the agent turns a product URL or a story into a narrated video, described below.

Video Studio in detail:
- **Frontend workbench**: A Vue 3 + Tailwind static site hosted on GitHub Pages, providing product spec input, a storyboard, narration editing, and video preview.
- **Protocol library**: `packages/video-core/specs/*.schema.json` (shared by the story and product video apps) defines the `project`, `scene`, `workflow`, and `activity` formats.
- **Local agent**: Claude Code reads an online guide and local skills, then uses local Playwright to capture web pages, Edge-TTS (Microsoft's online speech service, replaceable with local TTS such as Piper / Kokoro) to generate speech, and FFmpeg to compose 60fps video.
- **Benefits**:
  - Developers: $0 server rent, $0 GPU bills, no database to maintain.
  - Users: the service itself is free of charge (inference cost is covered by the user's existing agent plan); assets never pass through the service's servers, and source code and audio assets stay fully under the user's control.

---

## 7. When to Use & Limitations

### Good fits
- **Generation tasks that rely heavily on local toolchains**: code generation, local testing, audio/video post-production, document layout.
- **Privacy-sensitive products**: internal enterprise system analysis, private storybooks/animations, personal data processing (best paired with an enterprise LLM plan or local models).
- **Developer tools and productivity suites**: tools designed for engineers or professionals who already use a Coding Agent.

### Limitations
- **Browser compatibility**: Relies on the File System Access API (`showDirectoryPicker`), which is currently supported only by desktop Chromium browsers such as Chrome and Edge; Brave disables it by default, and Firefox and Safari do not support it.
- **Depends on the user's local environment**: Users need a basic runtime (e.g., Node.js, a Coding Agent) and must pay for their agent's subscription or API usage themselves.
- **Agent output is non-deterministic**: Agent output may not fully conform to the schema; the frontend must validate it and provide retry or repair guidance.
- **The page cannot wake the agent**: In Mode A, users start the agent and paste the command the page prepares; the page only reflects what the agent writes. Mode B eases this with a backend task queue: a connected agent picks up tasks the page queues, though the user still has to start the agent first.
- **Directory permission must be re-granted**: After a page reload, read/write permission for the directory handle usually has to be granted again.

---

## 8. Conclusion

AOA breaks the assumption that "an AI product must be a cloud SaaS." It restores the frontend to a pure interaction interface and protocol standard, and hands inference cost, execution, and data sovereignty back to the user's own agent — including the choice of whether inference runs in the cloud or on a local model.

It is a new architectural path that combines **zero maintenance cost for the vendor**, **user-controlled data privacy**, and **flexible extensibility**.
