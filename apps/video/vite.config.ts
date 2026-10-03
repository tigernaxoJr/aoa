// Video web UI (SPEC §9), served at <site>/video/. Shared recipe: ../vite.shared.ts.
import { appConfig, here } from '../vite.shared'

export default appConfig(here(import.meta.url, '.'), 'video', {
  resolve: {
    alias: {
      '@core': here(import.meta.url, './template/scripts/lib/core.mjs'),
      '@specs': here(import.meta.url, './specs'),
    },
  },
})
