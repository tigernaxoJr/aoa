// Browser for Playwright-driven scripts (capture, render-scene, login).
import { UsageError } from './project.mjs'

/**
 * Launches Chromium: an explicit channel wins; otherwise Playwright's own Chromium, then installed Chrome, then Edge.
 * `visible` opens a window the user works in; it prefers their installed Chrome or Edge, which sign-in pages trust more.
 * VIDEO_AGENT_HEADLESS=1 keeps even that window hidden (tests).
 */
export async function launchBrowser({ visible = false } = {}) {
  const { chromium } = await import('playwright')
  const forced = process.env.VIDEO_AGENT_BROWSER_CHANNEL
  const channels = forced ? [forced] : visible ? ['chrome', 'msedge', undefined] : [undefined, 'chrome', 'msedge']
  const errors = []
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: !visible || process.env.VIDEO_AGENT_HEADLESS === '1' })
    } catch (err) {
      errors.push(`${channel ?? 'bundled chromium'}: ${err.message.split('\n')[0]}`)
    }
  }
  throw new UsageError(`no usable browser. Run "pnpm exec playwright install chromium" or install Chrome/Edge.\n  ${errors.join('\n  ')}`)
}
