# AOA: Agent-Offloaded Architecture

**English** | [繁體中文](README.zh-TW.md) | [Website](https://aoa.tigernaxo.com/)

**AOA (Agent-Offloaded Architecture)** is an architectural pattern in which a product offloads its agent work — LLM reasoning, tool use, and the tokens they consume — to the **coding agent the user already has** (Claude Code, Codex, Cursor, Gemini CLI, Pi, etc.). The service provides the interface and the specification and keeps whatever else it needs, including a backend or lightweight models. On the frontend, the web application is just a static **protocol workbench** that works with the user's agent through a local folder.

```
[ Static Web UI ]  ──File System Access API──▶  [ Local folder (SSOT) ]  ◀──▶  [ User's Coding Agent ]
  workbench, schema                               specs, state, assets            local tools (FFmpeg, Playwright, TTS)
  validator, editor                                                               LLM: agent's cloud (default) / local model (optional)
```

---

## Core Principles

- **Zero-Inference Control Plane** — The web app ships as static files (e.g. GitHub Pages) and never runs models or heavy compute. Marginal compute cost to the vendor is effectively zero.
- **Bring Your Own Agent (BYOA)** — Inference runs on the user's existing agent subscription, or fully offline on self-hosted models. The app vendor pays nothing for LLM calls.
- **Schema as the Contract** — The UI and Agent coordinate via open JSON Schemas rather than proprietary APIs. The UI validates everything the Agent writes.
- **Filesystem as the Bus** — The local directory is the single source of truth (SSOT). The UI detects changes via lightweight file-metadata fingerprints.
- **User-Defined Data Boundary** — User files never touch vendor servers. The only third party with access to the context is the user's chosen LLM provider (or none if self-hosted).

---

## Reference Implementations (Live Workbenches)

This repository includes two AOA workbenches:

| Workbench | Path | Collaboration Mode | Highlights & Description |
|---|---|---|---|
| **Slide Studio** | [`/slide/`](https://aoa.tigernaxo.com/slide/) | **Mode A: Pure Workbench** | Pure FSA API + Slidev + Three.js 3D visuals + Vector SVG diagrams + Lossless vector PDF export via Playwright. Zero local companion daemon needed. |
| **Video Studio** | [`/video/`](https://aoa.tigernaxo.com/video/) | **Mode B: Companion-Enhanced** | FSA API + Local companion WebSocket pairing. Converts product URLs into animated walkthrough videos with voiceover (TTS), dynamic capture, and FFmpeg assembly. |

---

## Documentation & Academic Papers

| Document | Description |
| :--- | :--- |
| [Architecture Specification](docs/architecture.md) ([繁體中文](docs/architecture.zh-TW.md)) | Comprehensive specification: principles, collaboration modes (A–D, including backend-only), security, and boundaries. |
| [Introducing AOA](posts/2026-10-introducing-aofa.md) | Technical deep-dive article on why and how AOA was created. |
| [Academic Proposal](paper/proposal.md) | Academic paper proposal draft for the Agent-Offloaded Architecture pattern. |

---

## Cloud GenAI SaaS vs. AOA

| Dimension | Cloud GenAI SaaS | AOA |
|---|---|---|
| **Hosting** | GPU instances, databases, high bandwidth costs | Pure static files on a CDN (GitHub Pages) |
| **Inference Cost** | Paid upfront by vendor, recouped via subscriptions | User brings their own Agent (Claude Code / Cursor) or local LLM |
| **Data Privacy** | Uploaded and stored in vendor's cloud | Stays 100% on the user's local disk |
| **Artifact Transparency** | Black box; unsatisfactory results require re-generation | Transparent standard files (Markdown, SVG, Vue, MP4) editable at any step |
| **Operations** | 24/7 backend monitoring and on-call | Zero backend to maintain |

---

## Local Development

Requires Node.js 20.12+ and pnpm:

```bash
pnpm install
```

```bash
# Launch portal showcase
pnpm run dev:portal

# Launch Slide Studio
pnpm run dev:slide

# Launch Video Studio
pnpm dev

# Run all tests (129+ tests)
pnpm test

# Build production bundle
pnpm run build
```

---

## License

© 2026 tigernaxo. Source code is licensed under the [MIT License](LICENSE). Articles and specifications in `docs/`, `paper/` and `posts/` are licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE-docs).
