// Bundles the video Guide APIs (/api/product, /api/story) into packages/video-agent/guide/ at pack time
// so the MCP server works offline. Built with the same tools as the site, for the site URL the package
// points at. Lives in tools/ because it reads the apps; the package runs it from its prepack script.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as buildProduct } from '../apps/product/tools/build-api.mjs'
import { build as buildStory } from '../apps/story/tools/build-api.mjs'
import { siteUrl } from '../packages/video-agent/core/guide.mjs'

const guide = fileURLToPath(new URL('../packages/video-agent/guide/', import.meta.url))
const out = mkdtempSync(join(tmpdir(), 'video-agent-guide-'))
try {
  for (const build of [buildProduct, buildStory]) build({ siteUrl: siteUrl(), out })
  rmSync(guide, { recursive: true, force: true })
  cpSync(join(out, 'api'), guide, { recursive: true })
  console.log(`bundled guide for ${siteUrl()} into ${guide}`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
