// Vite settings every video app (apps/product, apps/story) adds to the shared appConfig recipe:
// the aliases the workbench code imports through, and which kind of video this build makes.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'vite'

const core = fileURLToPath(new URL('../', import.meta.url))

export function videoApp(kind: 'product' | 'story', appDir: string): UserConfig {
  return {
    resolve: {
      alias: {
        '@core': join(core, 'template/scripts/lib/core.mjs'),
        '@specs': join(core, 'specs'),
        '@workflow': join(appDir, 'specs/workflow.json'),
        '@video-core': core,
      },
    },
    define: { __VIDEO_KIND__: JSON.stringify(kind) },
  }
}
