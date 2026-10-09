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

/** How long a browser gets to shut down before it is left for the end of the script. */
const CLOSE_TIMEOUT_MS = 20_000
let abandoned = false

/**
 * Closes a browser from launchBrowser. Playwright waits for the browser process to exit with no time
 * limit, and on a busy machine a browser can hang while shutting down, which would keep this script
 * (and whoever waits for it) alive for good. After CLOSE_TIMEOUT_MS it stops waiting; run() (cli.mjs)
 * then ends the script, and Playwright kills the browsers it launched as the process exits.
 */
export async function closeBrowser(browser) {
  let timer
  const closed = await Promise.race([
    browser.close().then(
      () => true,
      () => true,
    ),
    new Promise((resolve) => (timer = setTimeout(resolve, CLOSE_TIMEOUT_MS, false))),
  ])
  clearTimeout(timer)
  if (!closed) {
    abandoned = true
    console.warn(`warning: the browser did not close within ${CLOSE_TIMEOUT_MS / 1000}s; it is stopped when this script ends`)
  }
}

/** Whether closeBrowser gave up on a browser, so the script must end itself to stop it. */
export const browserAbandoned = () => abandoned
