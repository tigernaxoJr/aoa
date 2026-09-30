#!/usr/bin/env node
// video-agent: Local MCP server and Companion for Agent Video Producer projects (SPEC §10.1).
//
//   video-agent mcp   [--project <dir>]                               stdio MCP server
//   video-agent serve [--project <dir>] [--port <n>] [--persist-token] Companion for the Web UI
import { runMcp } from '../mcp/server.mjs'
import { startCompanion } from '../serve/server.mjs'

const [command, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const usage = `usage:
  video-agent mcp   [--project <dir>]
  video-agent serve [--project <dir>] [--port <n>] [--persist-token]

environment:
  VIDEO_AGENT_SITE_URL   site with the Guide API (default https://tigernaxojr.github.io/index-url-director)
  VIDEO_AGENT_GUIDE_DIR  local copy of the site's /api directory (offline use)`

try {
  if (command === 'mcp') {
    await runMcp({ projectDir: flag('project') ?? process.cwd() })
  } else if (command === 'serve') {
    const port = flag('port') ? Number(flag('port')) : undefined
    const companion = await startCompanion({ projectDir: flag('project') ?? process.cwd(), port, persistToken: rest.includes('--persist-token') })
    const stop = async () => {
      await companion.close()
      process.exit(0)
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  } else {
    console.log(usage)
    process.exitCode = command && command !== '--help' ? 1 : 0
  }
} catch (err) {
  console.error(`error: ${err.message}`)
  process.exitCode = 1
}
