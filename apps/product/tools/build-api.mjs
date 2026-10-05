// Builds the product video Guide API (dist/api/product/*) with the shared video builder.
//
//   node apps/product/tools/build-api.mjs [--site-url <url>] [--out <dir>]
import { fileURLToPath } from 'node:url'
import { buildVideoApi, runCli } from '../../../packages/video-core/tools/build-video-api.mjs'

/** Published prompts and rules, cut from the Skill so the Skill stays the single source (SPEC §5). */
const EXTRACTS = {
  'prompts/analyze-product.md': { title: '分析產品', from: [['workflow.md', 'analyze']] },
  'prompts/analyze-style.md': { title: '分析參考影片風格', from: [['workflow.md', 'style']] },
  'prompts/storyboard.md': { title: '規劃分鏡與旁白', from: [['script-guide.md', null]] },
  'prompts/scene-script.md': { title: '撰寫單一 scene 的旁白與畫面', from: [['script-guide.md', 'narration'], ['script-guide.md', 'visual']] },
  'rules/script.md': { title: '文案規則', from: [['script-guide.md', 'narration']] },
  'rules/visual.md': {
    title: '視覺規則',
    from: [['script-guide.md', 'visual'], ['rendering-guide.md', 'visual-types'], ['rendering-guide.md', 'elements']],
  },
}

/** This app's settings for the shared builder (also used by tools/build-platform-api.mjs for /api/video). */
export const config = {
  slug: 'product',
  appDir: fileURLToPath(new URL('../', import.meta.url)),
  skill: 'product-video',
  title: '產品介紹影片',
  extracts: EXTRACTS,
}

export const build = ({ siteUrl, out }) => buildVideoApi({ ...config, siteUrl, out })

runCli(import.meta.url, build)
