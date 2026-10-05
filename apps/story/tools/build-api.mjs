// Builds the story video Guide API (dist/api/story/*) with the shared video builder. The story Skill
// links to the product Skill for the steps both share (init details, template sync, translate).
//
//   node apps/story/tools/build-api.mjs [--site-url <url>] [--out <dir>]
import { fileURLToPath } from 'node:url'
import { buildVideoApi, runCli } from '../../../packages/video-core/tools/build-video-api.mjs'

/** This app's settings for the shared builder (also used by tools/build-platform-api.mjs for /api/video). */
export const config = {
  slug: 'story',
  appDir: fileURLToPath(new URL('../', import.meta.url)),
  skill: 'story-video',
  title: '故事動畫影片',
  siblings: { 'product-video': 'product' },
}

export const build = ({ siteUrl, out }) => buildVideoApi({ ...config, siteUrl, out })

runCli(import.meta.url, build)
