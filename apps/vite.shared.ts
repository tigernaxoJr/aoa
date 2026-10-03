// Shared Vite recipe for every front-end under apps/. Each app is an isolated build served at
// <site>/<slug>/ (dist/<slug>); the portal (slug '') is the site root and must build first because
// it empties dist/. The Guide API (dist/api) stays site-wide: apps/video/tools/build-api.mjs runs last.
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, mergeConfig, type UserConfig } from 'vite'
import { resolveSiteUrl } from './video/tools/build-api.mjs'

export const siteUrl = (() => {
  try {
    return resolveSiteUrl()
  } catch {
    return 'http://localhost:5173'
  }
})()
export const here = (from: string, p: string) => fileURLToPath(new URL(p, from))

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
