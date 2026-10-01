// Browser for Playwright-driven scripts (capture, render-scene).
import { UsageError } from './project.mjs'

/** Launches Chromium: an explicit channel wins; otherwise Playwright's own Chromium, then installed Chrome, then Edge. */
export async function launchBrowser() {
  const { chromium } = await import('playwright')
  const forced = process.env.VIDEO_AGENT_BROWSER_CHANNEL
  const channels = forced ? [forced] : [undefined, 'chrome', 'msedge']
  const errors = []
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel })
    } catch (err) {
      errors.push(`${channel ?? 'bundled chromium'}: ${err.message.split('\n')[0]}`)
    }
  }
  throw new UsageError(`no usable browser. Run "pnpm exec playwright install chromium" or install Chrome/Edge.\n  ${errors.join('\n  ')}`)
}
