// Shared Vite recipe for every front-end under apps/. Each app is an isolated build served at
// <site>/<slug>/ (dist/<slug>); the portal (slug '') is the site root and must build first because
// it empties dist/. The Guide API (dist/api) stays site-wide: apps/video/tools/build-api.mjs runs last.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, mergeConfig, type UserConfig } from 'vite'

export const here = (from: string, p: string) => fileURLToPath(new URL(p, from))

/**
 * The site URL: SITE_URL, else https://<owner>.github.io/<repo> from GITHUB_REPOSITORY or the git
 * remote. Each app's tools/build-api.mjs resolves it the same way (apps do not import each other).
 */
export function resolveSiteUrl(): string {
  let explicit = process.env.SITE_URL
  if (explicit) {
    explicit = explicit.trim().replace(/\/+$/, '')
    if (explicit !== 'true' && explicit !== 'false' && /^https?:\/\//.test(explicit)) {
      return explicit
    }
  }
  let repo = process.env.GITHUB_REPOSITORY
  if (!repo) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: here(import.meta.url, '..'), encoding: 'utf8' }).trim()
      repo = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(remote)?.[1]
    } catch {
      // no git or no remote
    }
  }
  if (!repo) throw new Error('cannot determine the site URL; set SITE_URL')
  const [owner, name] = repo.split('/')
  const host = `${owner.toLowerCase()}.github.io`
  return name.toLowerCase() === host ? `https://${host}` : `https://${host}/${name}`
}

export const siteUrl = (() => {
  try {
    return resolveSiteUrl()
  } catch {
    return 'http://localhost:5173'
  }
})()

export function appConfig(appDir: string, slug: string, extra: UserConfig = {}) {
  return defineConfig(
    mergeConfig(
      {
        root: appDir,
        base: new URL(siteUrl).pathname.replace(/\/?$/, '/') + (slug && `${slug}/`),
        plugins: [vue(), tailwindcss()],
        define: { __SITE_URL__: JSON.stringify(siteUrl) },
        server: { fs: { allow: [here(import.meta.url, '..')] } },
        build: { outDir: here(import.meta.url, `../dist/${slug}`), emptyOutDir: slug === '' },
      },
      extra,
    ),
  )
}
