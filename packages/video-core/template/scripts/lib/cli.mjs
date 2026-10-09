// Shared entry-point wrapper: expected failures print a message; anything else prints a stack.
import { browserAbandoned } from './browser.mjs'
import { UsageError } from './project.mjs'

export async function run(main) {
  try {
    const code = await main(process.argv.slice(2))
    process.exitCode = code ?? 0
  } catch (err) {
    console.error(err instanceof UsageError ? `error: ${err.message}` : err)
    process.exitCode = 1
  }
  // A browser that would not close keeps the process alive; exiting has Playwright kill it.
  if (browserAbandoned()) process.exit()
}

/** Minimal flag parser: positional args plus `--flag`, `--flag value`. Values listed in `takes` consume the next arg. */
export function parseArgs(argv, takes = {}) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    const count = takes[name] ?? 0
    if (count === 0) flags[name] = true
    else {
      const values = argv.slice(i + 1, i + 1 + count)
      if (values.length < count || values.some((v) => v.startsWith('--'))) {
        throw new UsageError(`--${name} expects ${count} value(s)`)
      }
      flags[name] = count === 1 ? values[0] : values
      i += count
    }
  }
  return { positional, flags }
}
