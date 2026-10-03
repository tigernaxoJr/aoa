// Slide web UI, served at <site>/slide/. Shared recipe: ../vite.shared.ts.
import { appConfig, here } from '../vite.shared'

export default appConfig(here(import.meta.url, '.'), 'slide')
