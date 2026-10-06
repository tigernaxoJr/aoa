#!/usr/bin/env node
// video-agent: Local MCP server for Agent Video Producer projects (SPEC §10.1).
//
//   video-agent mcp [--project <dir>]   stdio MCP server
import { runMcp } from '../mcp/server.mjs'

const [command, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const usage = `usage:
  video-agent mcp [--project <dir>]

environment:
  VIDEO_AGENT_SITE_URL   site with the Guide API (default https://tigernaxojr.github.io/index-url-director)
  VIDEO_AGENT_GUIDE_DIR  local copy of the site's /api directory (offline use)`

try {
  if (command === 'mcp') {
    await runMcp({ projectDir: flag('project') ?? process.cwd() })
  } else {
    console.log(usage)
    process.exitCode = command && command !== '--help' ? 1 : 0
  }
} catch (err) {
  console.error(`error: ${err.message}`)
  process.exitCode = 1
}
