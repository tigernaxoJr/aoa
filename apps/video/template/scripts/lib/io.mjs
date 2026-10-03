// Write protocol (SPEC §10.2): project-wide lock file + atomic JSON writes.
import { closeSync, openSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'

export const LOCK_FILE = '.video-agent.lock'
const STALE_MS = 30_000
const WAIT_MS = Number(process.env.VIDEO_AGENT_LOCK_WAIT_MS ?? 10_000)
const RETRY_MS = 100

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** Acquires the project lock, runs `fn`, and always releases the lock. */
export function withLock(root, writer, fn) {
  const lockPath = join(root, LOCK_FILE)
  const deadline = Date.now() + WAIT_MS
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx')
      writeSync(fd, JSON.stringify({ writer, pid: process.pid, at: new Date().toISOString() }))
      closeSync(fd)
      break
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      if (isStale(lockPath)) {
        rmSync(lockPath, { force: true })
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`project is locked (${lockPath}); another writer is active. Retry shortly.`)
      }
      sleep(RETRY_MS)
    }
  }
  try {
    return fn()
  } finally {
    rmSync(lockPath, { force: true })
  }
}

function isStale(lockPath) {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > STALE_MS
  } catch {
    return true // vanished between checks
  }
}

/** Writes JSON to a temp file next to the target, then renames it over the target. */
export function writeJsonAtomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  try {
    renameSync(tmp, path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}
