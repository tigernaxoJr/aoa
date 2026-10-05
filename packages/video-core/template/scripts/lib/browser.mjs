// Browser for Playwright-driven scripts (render-scene; capture and login in product projects).
import { UsageError } from './project.mjs'

/**
 * Launches Chromium from the first of `channels` that works (undefined: Playwright's own Chromium).
 * By default Playwright's own Chromium, then installed Chrome, then Edge; VIDEO_AGENT_BROWSER_CHANNEL
 * forces one channel.
 */
export async function launchBrowser({ channels = [undefined, 'chrome', 'msedge'], headless = true } = {}) {
  const { chromium } = await import('playwright')
  const forced = process.env.VIDEO_AGENT_BROWSER_CHANNEL
  const errors = []
  for (const channel of forced ? [forced] : channels) {
    try {
      return await chromium.launch({ channel, headless })
    } catch (err) {
      errors.push(`${channel ?? 'bundled chromium'}: ${err.message.split('\n')[0]}`)
    }
  }
  throw new UsageError(`no usable browser. Run "pnpm exec playwright install chromium" or install Chrome/Edge.\n  ${errors.join('\n  ')}`)
}
