// Portal: the overview page at the site root. Builds first (it empties dist/). Shared recipe: ../vite.shared.ts.
import { appConfig, here } from '../vite.shared'

export default appConfig(here(import.meta.url, '.'), '')
