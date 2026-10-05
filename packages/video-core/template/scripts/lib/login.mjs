// Signing in to the product for capture (SPEC §11). The user signs in by hand in a visible window
// (`pnpm run login`); the session (cookies, local storage, IndexedDB) is kept in .auth/ and loaded
// by capture. The agent never reads .auth/ and never sees a password.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { UsageError } from './project.mjs'

export const AUTH_FILE = '.auth/login.json'

const LOGIN_PATH = /(^|[/._-])(log[-_]?in|sign[-_]?in|auth|sso|oauth2?|saml|session)([/._-]|$)/i
const LOGIN_HOST = /^(login|auth|sso|accounts?|id|signin|identity)\./i

/** Whether a URL looks like a sign-in page (its own path, or an identity provider's host). */
export function isLoginUrl(url) {
  try {
    const { hostname, pathname } = new URL(url)
    return LOGIN_HOST.test(hostname) || LOGIN_PATH.test(pathname)
  } catch {
    return false
  }
}

/**
 * Browser context options carrying the saved sign-in. Gate productLogin: a product marked
 * `sources.requiresLogin` cannot be captured before the user has signed in once.
 */
export function signInOptions(root, project) {
  const file = join(root, AUTH_FILE)
  if (existsSync(file)) return { storageState: file }
  if (project?.project.sources.requiresLogin) {
    throw new UsageError('gate productLogin: the product needs signing in and the user has not signed in yet. Run "pnpm run login" so the user signs in, then capture again.')
  }
  return {}
}

/** Fails when opening `requested` landed on a sign-in page instead: never signed in, or the sign-in expired. */
export function checkSignedIn(requested, landed, signedIn) {
  if (isLoginUrl(requested) || !isLoginUrl(landed)) return
  const why = signedIn ? 'the saved sign-in has expired' : 'the page needs signing in'
  throw new UsageError(`gate productLogin: ${requested} went to a sign-in page (${landed}): ${why}. Run "pnpm run login" so the user signs in, then capture again.`)
}

/**
 * Runs in every page of the sign-in window: a note pinned to the bottom telling the user what to do,
 * switching to "done" once login.mjs (window.avpSignedIn) has seen the user through a sign-in page
 * and the page is past it. Never shown while recording.
 */
export function signInNote() {
  const show = () => {
    if (!document.documentElement || document.getElementById('avp-login-note')) return
    const note = document.createElement('div')
    note.id = 'avp-login-note'
    const shadow = note.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `<style>
      div { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647;
        max-width: calc(100vw - 32px); box-sizing: border-box; padding: 12px 20px; border-radius: 12px;
        font: 600 16px/1.5 system-ui, sans-serif; color: #fff; background: #1d4ed8;
        box-shadow: 0 6px 24px rgba(0,0,0,.3); pointer-events: none; text-align: center; }
      div.done { background: #15803d; }
    </style><div></div>`
    const box = shadow.querySelector('div')
    const update = async () => {
      const done = await window.avpSignedIn().catch(() => false)
      box.className = done ? 'done' : ''
      box.textContent = done
        ? '✓ 已經登入了，可以關閉這個視窗。'
        : '請在這個視窗登入你的產品（帳號密碼只在這裡輸入，Agent 看不到）。登入完成後，關閉這個視窗就好。'
    }
    update()
    setInterval(update, 1000)
    document.documentElement.append(note)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show)
  else show()
}
