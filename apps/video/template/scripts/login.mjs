// pnpm run login [url]   → opens a visible browser window at the product (default sources.productUrl).
//                          The user signs in by hand and closes the window; the sign-in is kept in
//                          .auth/login.json for capture. Never read by the agent (AGENTS.md §3).
// pnpm run login --clear → deletes the kept sign-in.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs, run } from './lib/cli.mjs'
import { launchBrowser } from './lib/browser.mjs'
import { AUTH_FILE, isLoginUrl, signInNote } from './lib/login.mjs'
import { UsageError, findRoot, loadProject } from './lib/project.mjs'

const POLL_MS = 1_500
/** Gives up waiting for the user after this long (tests shorten it); what was kept by then stays. */
const MAX_WAIT_MS = Number(process.env.VIDEO_AGENT_LOGIN_WAIT_SEC ?? 30 * 60) * 1000

run(async (argv) => {
  const { positional, flags } = parseArgs(argv)
  const root = findRoot()
  const file = join(root, AUTH_FILE)
  // Signing in again replaces the old sign-in, which is usually why this runs (it expired).
  rmSync(dirname(file), { recursive: true, force: true })
  if (flags.clear) {
    console.log('login: saved sign-in cleared')
    return 0
  }
  const url = positional[0] ?? loadProject(root).project.sources.productUrl
  if (!url) throw new UsageError('usage: login [url]  (the project has no sources.productUrl)')
  if (!/^https?:\/\//.test(url)) throw new UsageError('url must start with http:// or https://')

  const browser = await launchBrowser({ visible: true })
  // The window's note asks the user to sign in until a sign-in page has come and gone.
  let sawSignIn = false
  let kept = false
  let signedIn = false
  try {
    const context = await browser.newContext({ viewport: null })
    await context.exposeBinding('avpSignedIn', () => signedIn)
    await context.addInitScript(signInNote)
    const page = await context.newPage()
    await page.goto(url).catch(() => {}) // a slow or failing first load still leaves the window to the user
    console.log('login: window open; waiting for the user to sign in and close it')

    const deadline = Date.now() + MAX_WAIT_MS
    while (Date.now() < deadline && browser.isConnected() && context.pages().length) {
      const front = await signInPage(context.pages().at(-1))
      if (front === true) sawSignIn = true
      // Kept on every past-sign-in look, so the copy is never older than one poll when the window closes.
      else if (front === false && (await keep(context, file))) {
        kept = true
        signedIn = sawSignIn
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  } finally {
    await browser.close().catch(() => {})
  }
  if (!kept) throw new UsageError('login: the window was closed before the user signed in; nothing was kept')
  if (!signedIn) {
    // Some sign-ins (an emailed code on the home page) never look like one; capture catches a wrong guess.
    console.log(`login: kept in ${AUTH_FILE}, but no sign-in page was seen; ask the user whether they signed in`)
    return 0
  }
  console.log(`login: signed in; kept in ${AUTH_FILE} for capture`)
  return 0
})

/** true on a sign-in page, false past it, null when it cannot tell (blank page, window closing). */
async function signInPage(page) {
  try {
    if (!page || !/^https?:/.test(page.url())) return null
    return isLoginUrl(page.url()) || (await page.locator('input[type=password]:visible').count()) > 0
  } catch {
    return null
  }
}

async function keep(context, file) {
  try {
    const state = await context.storageState({ indexedDB: true })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
    return true
  } catch {
    return false // the window closed mid-copy
  }
}
