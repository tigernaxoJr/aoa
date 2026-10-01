#!/usr/bin/env node
// video-agent: Local MCP server and Companion for Agent Video Producer projects (SPEC §10.1).
//
//   video-agent mcp   [--project <dir>]                               stdio MCP server
//   video-agent serve [--project <dir>] [--port <n>] [--persist-token] Companion for the Web UI
//                                        (runs the project's own `pnpm run companion`)
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { siteUrl } from '../core/guide.mjs'
import { findProject } from '../core/project.mjs'
import { runMcp } from '../mcp/server.mjs'

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
    const root = findProject(flag('project') ?? process.cwd())
    const script = join(root, 'scripts', 'companion.mjs')
    if (!existsSync(script)) throw new Error('this project was created from an older template without scripts/companion.mjs; sync the template first')
    const args = [script, ...(flag('port') ? ['--port', flag('port')] : []), ...(rest.includes('--persist-token') ? ['--persist-token'] : [])]
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, VIDEO_AGENT_SITE_URL: siteUrl() } })
    child.on('exit', (code) => (process.exitCode = code ?? 1))
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  } else {
    console.log(usage)
    process.exitCode = command && command !== '--help' ? 1 : 0
  }
} catch (err) {
  console.error(`error: ${err.message}`)
  process.exitCode = 1
}
