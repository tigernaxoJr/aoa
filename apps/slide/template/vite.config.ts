// `pnpm run build` writes the whole deck into one dist/index.html (scripts, styles and images inlined),
// so it plays offline by double-clicking and the web workbench can open it straight from the folder.
// Browsers refuse to load module scripts next to a file:// or blob: page, which a split build needs.
import { viteSingleFile } from 'vite-plugin-singlefile'

export default {
  plugins: [
    viteSingleFile(),
    {
      // Slidev splits its own chunks; a single file needs them gone.
      name: 'single-file-chunks',
      apply: 'build',
      enforce: 'post',
      config(config) {
        const output = config.build?.rollupOptions?.output
        for (const o of Array.isArray(output) ? output : [output]) {
          if (!o) continue
          delete o.manualChunks
          delete o.chunkFileNames
        }
      },
    },
  ],
}
