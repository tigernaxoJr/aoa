# Set Up Your Agent

**English** \| [繁體中文](setup.zh-TW.md)

> **None of the three workbenches on this site runs AI in the cloud: the coding agent on your computer does the work. This page shows how to get one ready.**

---

## What you need

- **A coding agent**: an AI assistant that can read URLs, read and write folders on your computer, and run commands, such as Claude Code, Codex, Cursor, Gemini CLI, or Pi.
- **Its plan or API quota**: the workbenches are free; your own plan pays for the agent's inference.
- **Desktop Chrome or Edge** (recommended): the workbenches use the browser's folder access to show the agent's progress live.

You don't need to install anything else first (Node.js, FFmpeg, Playwright, text-to-speech). When the agent starts, it checks for them and installs what's missing, or tells you which command to run.

## Recommended: Claude

If you don't have a coding agent yet, start with Claude. Claude Code needs a Pro, Max, Team, or Enterprise plan, or an Anthropic Console API account; the free plan doesn't include Claude Code.

### New to the terminal: the Claude desktop app

1. Download the Claude desktop app from [claude.ai/download](https://claude.ai/download) (macOS, Windows), install it, and sign in.
2. Switch to the **Code** tab at the top of the window.
3. Start a new session and choose a folder: pick the one you prepared in the workbench.
4. Back in the workbench, click "Copy" and paste the message into the session.

The agent then works in that folder, and the workbench shows its progress automatically. The agent may ask before it runs a command or changes a file; read what it wants to do, then allow it.

### Developers: the Claude Code CLI

Run the installer in a terminal:

```bash
# macOS, Linux, WSL
curl -fsSL https://claude.ai/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://claude.ai/install.ps1 | iex
```

Homebrew (`brew install --cask claude-code`) and WinGet (`winget install Anthropic.ClaudeCode`) work too. Then change to the folder the workbench prepared and start it:

```bash
cd your-project-folder
claude
```

The first run opens a browser to sign in. After that, paste the message the workbench prepared. See the [Claude Code setup guide](https://code.claude.com/docs/en/setup) for details.

## Other coding agents

The workbenches don't depend on a particular agent. Any agent that can read URLs and read, write, and run things on your computer works:

| Agent | Where to get it |
| --- | --- |
| Codex (OpenAI) | [developers.openai.com/codex](https://developers.openai.com/codex) |
| Cursor | [cursor.com](https://cursor.com) |
| Gemini CLI (Google) | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Pi | [pi.dev](https://pi.dev) |

They all work the same way: open the folder the workbench prepared in the agent, and paste the message the workbench generated.

## Optional: use a self-hosted model

Where inference runs is a setting in the agent; the workbenches don't change. If data must stay on your network, an agent that supports custom models can use a self-hosted model served with [Ollama](https://ollama.com) or [vLLM](https://docs.vllm.ai), or a cloud model through a CSP-hosted service such as AWS Bedrock, Google Vertex AI, or Azure. Self-hosted models may handle complex tasks less well, so results vary by model. For the design behind this, see [Principle 4](architecture.md#principle-4-local-first--data-sovereignty) of the specification.

## Troubleshooting

**The page says this browser can't access folders.**
Folder access needs desktop Chrome or Edge; Brave turns it off by default, and Firefox and Safari don't support it. In another browser, the video workbenches still let you skip the folder step and the agent creates the project itself, but the page can't show its progress live.

**After reloading the page, I have to grant folder access again.**
That's a browser security rule. Follow the prompt on the page and pick the same folder again; nothing in the project is lost.

**The agent can't find the folder, or created the project somewhere else.**
Make sure the agent opened the folder the workbench prepared. In the Claude desktop app, choose the folder again in the session; with the CLI, `cd` into the folder before running `claude`.

**Can the page wake the agent by itself?**
No. The page prepares the folder and the message; you start the agent and paste it. That's a limit of [Mode A](architecture.md#mode-a-pure-workbench-file-driven), which this site uses.
