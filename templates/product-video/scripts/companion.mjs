// pnpm run companion [--port <n>] [--persist-token]
// Starts the local Companion (SPEC §10.1) for this project and prints the link that pairs the Web UI.
// Keeps running until stopped. --persist-token keeps the pairing in ~/.video-agent/token so the
// page reconnects after a restart without a new link.
import { parseArgs, run } from './lib/cli.mjs'
import { startCompanion } from './lib/companion.mjs'
import { UsageError } from './lib/project.mjs'

// The site fills in BUILT_SITE when it builds the template zip; the fallback covers the repo copy.
const BUILT_SITE = '{{SITE_URL}}'
const site = (process.env.VIDEO_AGENT_SITE_URL || (BUILT_SITE.startsWith('http') ? BUILT_SITE : 'https://tigernaxojr.github.io/index-url-director')).replace(/\/+$/, '')

run(async (argv) => {
  const { flags } = parseArgs(argv, { port: 1 })
  const port = flags.port === undefined ? undefined : Number(flags.port)
  if (port !== undefined && !Number.isInteger(port)) throw new UsageError('--port expects a number')
  const companion = await startCompanion({ port, persistToken: !!flags['persist-token'], site })
  const stop = async () => {
    await companion.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
})
