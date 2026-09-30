// Bundles the Guide API into guide/ at pack time so the MCP server works offline. Built with the
// same tool as the site (tools/build-api.mjs), for the site URL the package points at.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../../../tools/build-api.mjs'
import { siteUrl } from '../core/guide.mjs'

const guide = fileURLToPath(new URL('../guide/', import.meta.url))
const out = mkdtempSync(join(tmpdir(), 'video-agent-guide-'))
try {
  build({ siteUrl: siteUrl(), out })
  rmSync(guide, { recursive: true, force: true })
  cpSync(join(out, 'api'), guide, { recursive: true })
  console.log(`bundled guide for ${siteUrl()} into ${guide}`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
