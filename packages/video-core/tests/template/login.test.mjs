// Signing in for capture: the productLogin gate, the saved sign-in, and spotting a sign-in redirect.
// The sign-in window itself needs a person; these cover what capture does with its result.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { afterEach, test } from 'node:test'
import { isLoginUrl } from '../../template/scripts/lib/login.mjs'
import { baseProject, baseScene, makeProject } from './helpers.mjs'

let p
afterEach(() => p?.cleanup())
/**
 * Tests that start browsers: each script run is already killed after a few minutes (runAsync), so a
 * stuck browser fails the test rather than holding up the suite.
 */
const BROWSER = { timeout: 15 * 60_000 }

test('isLoginUrl spots sign-in pages and identity providers, not ordinary pages', () => {
  for (const url of [
    'https://app.acme.test/login',
    'https://app.acme.test/users/sign_in',
    'https://app.acme.test/auth/callback?next=/',
    'https://app.acme.test/signin?return=/dashboard',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://login.microsoftonline.com/common/oauth2/authorize',
    'https://acme.auth0.com/u/login',
  ]) {
    assert.ok(isLoginUrl(url), url)
  }
  for (const url of ['https://acme.test/', 'https://acme.test/dashboard', 'https://acme.test/authors/jane', 'https://acme.test/blog/logging-in-made-easy', 'not a url']) {
    assert.ok(!isLoginUrl(url), url)
  }
})

/** A product whose /app needs the `sid=ok` cookie and otherwise redirects to /login. */
async function withProduct(fn) {
  const server = createServer((req, res) => {
    if (req.url.startsWith('/app') && !/\bsid=ok\b/.test(req.headers.cookie ?? '')) {
      res.writeHead(302, { location: '/login' })
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<html><body style="margin:0;font:40px sans-serif"><h1>${req.url.startsWith('/app') ? 'Dashboard' : 'Sign in'}</h1></body></html>`)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

const shotScene = (url) => baseScene('scene-001', { durationSec: 1, visual: { type: 'screenshot', description: 'dashboard', capture: { url } } })
const SIGNED_IN = {
  cookies: [{ name: 'sid', value: 'ok', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }],
  origins: [],
}

test('a product marked requiresLogin cannot be captured before the user signs in', () => {
  const project = baseProject()
  project.project.sources.requiresLogin = true
  p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: shotScene('https://example.com/app') }] })
  for (const args of [['scene-001'], ['--url', 'https://example.com/app', '--out', 'brief/screens']]) {
    const r = p.run('capture.mjs', args)
    assert.equal(r.code, 1)
    assert.match(r.stderr, /gate productLogin: .*pnpm run login/)
  }
})

test('capture opens the page with the saved sign-in', BROWSER, async (t) => {
  await withProduct(async (origin) => {
    const project = baseProject()
    project.project.sources.requiresLogin = true
    p = makeProject({ project, scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: shotScene(`${origin}/app`) }] })
    p.write('.auth/login.json', SIGNED_IN)
    const r = await p.runAsync('capture.mjs', ['--url', `${origin}/app`, '--out', 'brief/screens'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    assert.match(readFileSync(p.path('brief/screens/127-0-0-1-app.txt'), 'utf8'), /Dashboard/, 'signed in, the app page shows')
  })
})

test('a redirect to a sign-in page stops capture and asks for login, saved or not', BROWSER, async (t) => {
  await withProduct(async (origin) => {
    p = makeProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', scene: shotScene(`${origin}/app`) }] })
    let r = await p.runAsync('capture.mjs', ['scene-001'])
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /gate productLogin: .*\/app went to a sign-in page \(.*\/login\): the page needs signing in/)
    assert.equal(existsSync(p.path('scenes/001-hook/assets/capture.png')), false)

    p.write('.auth/login.json', { cookies: [], origins: [] })
    r = await p.runAsync('capture.mjs', ['scene-001'])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /the saved sign-in has expired/)

    // The sign-in page itself is fine to capture.
    r = await p.runAsync('capture.mjs', ['--url', `${origin}/login`, '--out', 'brief/screens'])
    assert.equal(r.code, 0, r.stderr)
  })
})

test('login --clear deletes the saved sign-in', () => {
  p = makeProject()
  p.write('.auth/login.json', { cookies: [], origins: [] })
  const r = p.run('login.mjs', ['--clear'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(existsSync(p.path('.auth')), false)
})

/**
 * The sign-in window, with the "user" played by the pages: /login signs in by itself (or, with
 * ?giveup, never does); /app reports what the window's note says. The window closes when the wait runs out
 * (a page cannot close a window Playwright opened), as when the user closes it.
 */
async function withSelfSigningProduct(fn) {
  const notes = []
  const server = createServer((req, res) => {
    const html = (body) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<html><body><h1>${body}</h1></body></html>`)
    }
    const cookie = /\bsid=ok\b/.test(req.headers.cookie ?? '')
    if (req.url.startsWith('/note')) {
      notes.push(req.url.split('=')[1])
      return html('ok')
    }
    if (req.url.startsWith('/app') && !cookie) {
      res.writeHead(302, { location: `/login${req.url.includes('giveup') ? '?giveup' : ''}` })
      return res.end()
    }
    if (req.url.startsWith('/login')) {
      return html(`<input type="password"><script>setTimeout(() => {
        if (location.search.includes('giveup')) return
        document.cookie = 'sid=ok; path=/'; location.href = '/app'
      }, 1500)</script>`)
    }
    html(`Dashboard<script>setTimeout(async () => {
      await fetch('/note?done=' + (await window.avpSignedIn()))
    }, 2500)</script>`)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, notes)
  } finally {
    server.close()
  }
}

const HIDDEN = { VIDEO_AGENT_HEADLESS: '1', VIDEO_AGENT_LOGIN_WAIT_SEC: '7' }

test('login keeps the sign-in once the user is past the sign-in page, and the note says so', BROWSER, async (t) => {
  await withSelfSigningProduct(async (origin, notes) => {
    const project = baseProject()
    project.project.sources = { productUrl: `${origin}/app`, requiresLogin: true }
    p = makeProject({ project })
    p.write('.auth/login.json', { cookies: [], origins: [] }) // an expired sign-in is replaced
    const r = await p.runAsync('login.mjs', [], HIDDEN)
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /login: signed in/)
    assert.deepEqual(notes, ['true'], 'the note turned to "done" after signing in')
    assert.ok(p.read('.auth/login.json').cookies.some((c) => c.name === 'sid' && c.value === 'ok'))

    const c = await p.runAsync('capture.mjs', ['--url', `${origin}/app`, '--out', 'brief/screens'])
    assert.equal(c.code, 0, c.stderr)
  })
})

test('closing the sign-in window without signing in keeps nothing', BROWSER, async (t) => {
  await withSelfSigningProduct(async (origin) => {
    p = makeProject()
    const r = await p.runAsync('login.mjs', [`${origin}/app?giveup`], HIDDEN)
    if (/no usable browser/.test(r.stderr)) return t.skip('no browser available')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /closed before the user signed in; nothing was kept/)
    assert.equal(existsSync(p.path('.auth/login.json')), false)
  })
})
