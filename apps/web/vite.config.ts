// Web UI (SPEC §9). Built into dist/ at the site root; tools/build-api.mjs then adds dist/api.
// The base path follows the site URL (GitHub Pages: /<repo>/), resolved like build-api does.
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolveSiteUrl } from '../../tools/build-api.mjs'

const siteUrl = (() => {
  try {
    return resolveSiteUrl()
  } catch {
    return 'http://localhost:5173'
  }
})()
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: here('.'),
  base: new URL(siteUrl).pathname.replace(/\/?$/, '/'),
  plugins: [vue(), tailwindcss()],
  define: { __SITE_URL__: JSON.stringify(siteUrl) },
  resolve: {
    alias: {
      '@core': here('../../templates/product-video/scripts/lib/core.mjs'),
      '@specs': here('../../specs'),
    },
  },
  server: { fs: { allow: [here('../..')] } },
  build: { outDir: here('../../dist'), emptyOutDir: true },
})
