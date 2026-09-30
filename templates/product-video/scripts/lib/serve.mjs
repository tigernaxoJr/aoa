// Minimal static file server on 127.0.0.1 for renderers: serves files under the project root only,
// with Range support (video elements seek). Both renderers load scene assets through it.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, relative } from 'node:path'
import { isInside } from './project.mjs'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

/** Starts the server. Returns { origin, url(absPath), close() }. */
export async function serveProject(root) {
  const server = createServer((req, res) => {
    let file
    try {
      file = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    } catch {
      return end(res, 400)
    }
    if (!isInside(root, file) || !existsSync(file) || !statSync(file).isFile()) return end(res, 404)
    const size = statSync(file).size
    const headers = {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      const last = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start > last) return end(res, 416, { 'Content-Range': `bytes */${size}` })
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${last}/${size}`, 'Content-Length': last - start + 1 })
      if (req.method === 'HEAD') return res.end()
      return createReadStream(file, { start, end: last }).pipe(res)
    }
    res.writeHead(200, { ...headers, 'Content-Length': size })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin,
    url: (abs) => `${origin}/${relative(root, abs).split(/[\\/]/).map(encodeURIComponent).join('/')}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections() // keep-alive sockets would otherwise hold close() open
      }),
  }
}

function end(res, status, headers = {}) {
  res.writeHead(status, headers)
  res.end()
}
