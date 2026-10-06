// Product video workbench end to end, built and served like the site (see the shared harness in
// packages/video-core/tests/web/harness.mjs): the start page and the scene workbench.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { baseProject } from '../../../../packages/video-core/tests/template/helpers.mjs'
import { BASE, activityJson, fixture, prepareFolder, readOpfs, storyFixture, waitForStart, webApp } from '../../../../packages/video-core/tests/web/harness.mjs'
import { build as buildApi } from '../../tools/build-api.mjs'

const web = webApp({ slug: 'product', viteConfig: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)), buildApi })
const openApp = (...args) => web.openApp(...args)

test('home page: prepare a folder first, then a plain-language message tells the agent to build the project there', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  assert.equal(await page.getByTestId('video-kind').count(), 0, 'no kind to choose: this workbench makes product videos')
  assert.match(await page.getByTestId('step-run').textContent(), /請先在步驟 1 準備/, 'no message before the folder is prepared')

  await prepareFolder(page, 'not-empty', { 'notes.txt': 'x' })
  assert.match(await page.getByTestId('step-folder').getByRole('alert').textContent(), /已經有其他檔案/, 'a folder with other files is refused')
  assert.equal(await page.getByTestId('project-folder').count(), 0)

  await prepareFolder(page, 'acme-video', { '.DS_Store': '' })
  await page.getByTestId('project-folder').getByText('acme-video').waitFor()
  assert.match(await page.getByTestId('waiting').textContent(), /等 Agent 在「acme-video」建立專案/)
  assert.match(await page.getByTestId('step-run').textContent(), /請先在步驟 2 填入/, 'no message before any source')

  await page.getByPlaceholder('https://example.com').fill('https://acme.test')
  // The form is mirrored into the folder for the agent, with an id it uses to find the folder.
  await waitForStart(page, 'https://acme.test')
  const start = JSON.parse(await readOpfs(page, 'acme-video/video.start.json'))
  assert.match(start.id, /^[0-9a-f]{8}$/)
  assert.deepEqual({ ...start, updatedAt: undefined }, { id: start.id, productUrl: 'https://acme.test', requiresLogin: false, sourceCodePath: null, sourceFolder: null, description: null, updatedAt: undefined })

  const message = await page.getByTestId('launch-message').textContent()
  assert.equal(
    message,
    `請讀取 ${web.origin}${BASE}/api/product/agent-guide.md，依照裡面的步驟幫我製作產品介紹影片。\n你的工作資料夾是我在網頁上準備好的「acme-video」：裡面的 video.start.json 記有產品資訊與識別碼 ${start.id}。請確認你的工作目錄已切換至「acme-video」，所有檔案都放在那裡，不要在其他地方建立專案。\n・產品網址：https://acme.test\n我不熟悉電腦操作：需要執行的指令請直接替我執行；需要我自己動手的地方（例如安裝軟體、按允許），請一步一步用白話告訴我要點哪裡。`,
  )
  assert.match(await page.getByTestId('step-run').textContent(), /請在 Agent 中開啟步驟 1 準備的「acme-video」資料夾/)
  const visible = await page.locator('main').innerText()
  assert.doesNotMatch(visible, /終端機中開啟|p?npm install|cd /, 'the main path never asks for a terminal')

  // A product behind a sign-in: the user ticks a box; no password field, ever.
  assert.equal(await page.getByTestId('requires-login-help').count(), 0)
  await page.getByTestId('requires-login').check()
  assert.match(await page.getByTestId('requires-login-help').textContent(), /不用在這裡填帳號密碼/)
  assert.equal(await page.locator('input[type=password]').count(), 0)
  assert.match(await page.getByTestId('launch-message').textContent(), /・這個網站要登入才看得到：請打開視窗讓我自己登入，我不會把帳號密碼告訴你\n/)
  await waitForStart(page, '"requiresLogin": true')
  await page.getByTestId('requires-login').uncheck()
  await waitForStart(page, '"requiresLogin": false')

  // Reopening the folder keeps its id, so a message already pasted still finds it.
  await page.evaluate(async () => window.__avp.open(await (await navigator.storage.getDirectory()).getDirectoryHandle('acme-video')))
  await page.getByTestId('launch-message').getByText(start.id).waitFor()

  // Once the agent writes the project, the page switches to the workbench by itself.
  const project = baseProject()
  project.project.name = '自動切換專案'
  await page.evaluate(async (text) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('acme-video')
    const w = await (await dir.getFileHandle('video.project.json', { create: true })).createWritable()
    await w.write(text)
    await w.close()
  }, JSON.stringify(project))
  await page.getByTestId('project-name').getByText('自動切換專案').waitFor({ timeout: 10_000 })
})

test('guided start: the source folder is a full path; picking a folder prefills and records hints, never credentials', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await prepareFolder(page, 'acme-video')
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('acme-app', { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle('acme-app', { create: true })
    const put = async (d, name, text) => {
      const w = await (await d.getFileHandle(name, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    }
    await put(dir, 'package.json', JSON.stringify({ name: 'acme-deploy', homepage: 'https://acme.test' }))
    await put(dir, 'README.md', '# Acme\n\n[![build](https://x/badge.svg)](https://x)\n\nAcme 讓你**一鍵部署**網站，不用設定伺服器。\n\n## 安裝\n')
    await put(await dir.getDirectoryHandle('.git', { create: true }), 'config', '[remote "origin"]\n\turl = https://bob:secret@github.com/acme/deploy.git\n')
    await dir.getDirectoryHandle('src', { create: true })
    await window.__avp.pickSource(dir)
  })
  assert.equal(await page.getByTestId('source-folder').getByText('acme-app').count(), 1)
  assert.match(await page.getByTestId('source-filled').textContent(), /說明與網址/)
  assert.match(await page.getByTestId('source-path-missing').textContent(), /不會給完整路徑/, 'explains why the path must be pasted')
  let message = await page.getByTestId('launch-message').textContent()
  assert.match(message, /・產品網址：https:\/\/acme\.test/)
  assert.match(message, /・產品原始碼在我電腦上名為「acme-app」的資料夾（請幫我找到它；找不到就問我）/)
  assert.match(message, /・產品說明：acme-deploy：Acme 讓你一鍵部署網站，不用設定伺服器。/)

  await page.getByTestId('source-path').fill('/home/me/code/other')
  assert.equal(await page.getByTestId('source-path-mismatch').count(), 1, 'warns when the path names a different folder')
  await page.getByTestId('source-path').fill('/home/me/code/acme-app')
  assert.equal(await page.getByTestId('source-path-mismatch').count(), 0)
  assert.equal(await page.getByTestId('source-path-missing').count(), 0)
  message = await page.getByTestId('launch-message').textContent()
  assert.match(message, /・產品原始碼：\/home\/me\/code\/acme-app\n/, 'the full path goes to the agent')

  await waitForStart(page, '/home/me/code/acme-app')
  const start = JSON.parse(await readOpfs(page, 'acme-video/video.start.json'))
  assert.equal(start.sourceCodePath, '/home/me/code/acme-app')
  assert.deepEqual(start.sourceFolder, { name: 'acme-app', packageName: 'acme-deploy', gitRemote: 'https://github.com/acme/deploy.git', entries: ['README.md', 'package.json', 'src'] })

  await page.reload()
  await page.getByTestId('launch-message').waitFor()
  assert.equal(await page.getByTestId('launch-message').textContent(), message, 'inputs and the prepared folder survive a reload')
})

test('opened project shows scenes; browser inputHash matches the Node scripts', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page } = app
  await page.getByTestId('project-name').waitFor()
  assert.equal(await page.getByTestId('project-name').textContent(), '網頁測試專案')
  const status = (id) => page.getByTestId(`scene-${id}`).getByTestId('scene-status').textContent()
  assert.equal(await status('scene-001'), '已渲染', 'rendered, not "內容已變更": hashes agree')
  assert.equal(await status('scene-002'), '已渲染')
  assert.equal(await status('scene-003'), '草稿')
  const next = page.getByTestId('next-command')
  assert.equal(await next.getAttribute('data-command'), '/video-scene all')
  assert.equal(await next.getByTestId('agent-say-text').textContent(), '請繼續做影片：製作還沒完成的段落。（/video-scene all）', 'a plain request, not a bare command')
  assert.match(await page.getByTestId('scene-summary').textContent(), /^已完成 2\/3 · 約 \d+\.\d 秒$/)

  // Script view: every scene's narration, in playback order.
  await page.getByTestId('view-script').click()
  const script = await page.getByTestId('script-view').textContent()
  const at = ['第一句旁白。', '立即試用。', '這是一段旁白。'].map((line) => script.indexOf(line))
  assert.ok(at[0] >= 0 && at[0] < at[1] && at[1] < at[2], script)
  await page.getByTestId('script-view').getByText('立即試用。').click()
  await page.getByTestId('view-list').click()
  assert.match(await page.getByTestId('scene-scene-002').getAttribute('class'), /border-sky-500/, 'clicking a script entry selects that scene')
})

test('editing a rendered scene marks it stale, re-derives the project, and asks the agent to apply it', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read } = app
  await page.getByTestId('scene-scene-001').getByRole('button', { name: /開場/ }).click()
  await page.getByTestId('script-input').fill('改過的第一句。')
  await page.getByTestId('save').click()
  await page.getByTestId('next-command').and(page.locator('[data-command="/video-sync"]')).waitFor()

  assert.equal(await read('scenes/001-hook/script.md'), '改過的第一句。\n')
  const scene = JSON.parse(await read('scenes/001-hook/scene.json'))
  assert.equal(scene.status, 'stale')
  assert.equal(scene.updatedBy, 'user')
  assert.ok(scene.render, 'render record is kept for comparison')
  const project = JSON.parse(await read('video.project.json'))
  assert.equal(project.status, 'producing')
  assert.match(await page.getByTestId('next-command').textContent(), /請套用我的修改/)
  assert.equal(await page.getByTestId('stale-banner').count(), 0, 'the next step already asks for the sync; no second banner')
})

test('recent projects: a reload reopens the last project; a closed one stays one click away', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page } = app
  await page.getByTestId('project-name').waitFor()
  await page.reload()
  await page.getByTestId('project-name').waitFor()
  assert.equal(await page.getByTestId('project-name').textContent(), '網頁測試專案', 'reopened without picking the folder again')

  await page.getByRole('button', { name: '關閉專案' }).click()
  const recent = page.getByTestId('recent')
  await recent.waitFor()
  assert.match(await recent.textContent(), /網頁測試專案/)
  assert.match(await recent.textContent(), /資料夾「proj」/)
  await page.reload()
  await recent.waitFor()
  assert.equal(await page.getByTestId('project-name').count(), 0, 'a closed project is not reopened by itself')

  await recent.getByTestId('recent-open').click()
  await page.getByTestId('project-name').waitFor()
  await page.getByRole('button', { name: '關閉專案' }).click()
  await page.getByRole('button', { name: '從清單移除 proj' }).click()
  await recent.waitFor({ state: 'detached' })
})

test('feedback: point at the frame, write a line; the scene goes stale and the agent reply shows up', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read } = app
  await page.getByTestId('scene-scene-001').getByRole('button', { name: /開場/ }).click()
  await page.getByTestId('scene-video').evaluate((v) => new Promise((resolve) => (v.readyState >= 1 ? resolve() : v.addEventListener('loadedmetadata', resolve))))

  // Point: the overlay maps the click to the picture (fixture videos are 16:9, so the whole player).
  await page.getByTestId('feedback-point').click()
  const box = await page.getByTestId('feedback-overlay').boundingBox()
  await page.getByTestId('feedback-overlay').click({ position: { x: box.width * 0.25, y: box.height * 0.5 } })
  await page.getByTestId('feedback-spot').waitFor()
  assert.match(await page.getByTestId('feedback-where').textContent(), /已標記位置 · 第 0:00\.0/)
  await page.getByTestId('feedback-text').fill('這裡太暗了')
  await page.getByTestId('feedback-submit').click()
  await page.getByTestId('feedback-open').getByText('這裡太暗了').waitFor()

  const scene = JSON.parse(await read('scenes/001-hook/scene.json'))
  assert.equal(scene.status, 'stale', 'a note on a rendered scene asks for a redo')
  assert.equal(scene.feedback.length, 1)
  const [note] = scene.feedback
  assert.match(note.id, /^fb-[0-9a-f]{8}$/)
  assert.equal(note.text, '這裡太暗了')
  assert.equal(note.atSec, 0)
  assert.ok(Math.abs(note.point.x - 0.25) < 0.02 && Math.abs(note.point.y - 0.5) < 0.02, JSON.stringify(note.point))
  assert.equal(await page.getByTestId('next-command').getAttribute('data-command'), '/video-sync')
  assert.equal(await page.getByTestId('scene-scene-001').getByTestId('scene-feedback-count').textContent(), '1')

  // A note without pointing, then taken back before the agent saw it.
  await page.getByTestId('feedback-text').fill('先不用改')
  await page.getByTestId('feedback-submit').click()
  await page.getByRole('button', { name: '刪除意見：先不用改' }).click()
  await page.getByTestId('notice').filter({ hasText: '已刪除意見' }).waitFor()
  assert.deepEqual(JSON.parse(await read('scenes/001-hook/scene.json')).feedback.map((f) => f.text), ['這裡太暗了'])

  // The agent handles it: the page shows its reply and drops the count.
  const handled = JSON.parse(await read('scenes/001-hook/scene.json'))
  Object.assign(handled.feedback[0], { resolvedAt: new Date().toISOString(), reply: '把背景調亮了' })
  await page.evaluate(async (text) => {
    const proj = await (await navigator.storage.getDirectory()).getDirectoryHandle('proj')
    const dir = await (await proj.getDirectoryHandle('scenes')).getDirectoryHandle('001-hook')
    const w = await (await dir.getFileHandle('scene.json')).createWritable()
    await w.write(text)
    await w.close()
  }, JSON.stringify(handled))
  await page.getByTestId('feedback-done').getByText('把背景調亮了').waitFor()
  assert.equal(await page.getByTestId('feedback-open').count(), 0)
  assert.equal(await page.getByTestId('scene-scene-001').getByTestId('scene-feedback-count').count(), 0)
  assert.equal(await page.getByRole('button', { name: /刪除意見/ }).count(), 0, 'handled notes stay as the record')
})

test('approve and reorder follow the UI write rules', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read } = app
  await page.getByTestId('scene-scene-002').getByRole('button', { name: /行動呼籲/ }).click()
  await page.getByTestId('approve').click()
  await page.getByTestId('notice').filter({ hasText: '已核准' }).waitFor()
  assert.equal(JSON.parse(await read('scenes/002-cta/scene.json')).status, 'approved')

  await page.getByRole('button', { name: '下移 scene-001' }).click()
  await page.getByTestId('notice').filter({ hasText: '順序' }).waitFor()
  const order = JSON.parse(await read('video.project.json')).scenes.map((s) => s.id)
  assert.deepEqual(order, ['scene-002', 'scene-001', 'scene-003'])
})

test('writes wait while an agent holds the lock', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, read, writeFile } = app
  await writeFile('.video-agent.lock', JSON.stringify({ writer: 'agent', pid: 1, at: new Date().toISOString() }))
  await page.getByTestId('scene-scene-003').getByRole('button', { name: /補充/ }).click()
  await page.getByTestId('script-input').fill('不會被寫入。')
  await page.getByTestId('save').click()
  await page.getByTestId('notice').filter({ hasText: 'Agent 正在寫入' }).waitFor()
  assert.equal(await read('scenes/003-extra/script.md'), '這是一段旁白。\n')
})

test('activity: before the project exists, the page shows what the agent is waiting for', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await prepareFolder(page, 'acme-video', { 'video.activity.json': activityJson({ message: '要不要使用線上語音？請在對話中回答', waitingForUser: true, step: 'init' }) })
  await page.getByTestId('project-folder').getByText('acme-video').waitFor()
  const banner = page.getByTestId('step-review').getByTestId('activity')
  assert.equal(await banner.getAttribute('data-state'), 'waiting', 'a folder holding only the start and activity files is accepted')
  assert.match(await banner.textContent(), /Agent 在等你回覆：要不要使用線上語音？請在對話中回答/)
  assert.match(await banner.textContent(), /回到 Agent 的對話/)
})

test('activity: the workbench shows current work, marks the scene, and fades an old message', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page, writeFile } = app
  await page.getByTestId('scene-scene-001').waitFor()
  assert.equal(await page.getByTestId('activity').count(), 0, 'nothing shown without an activity file')

  await writeFile('video.activity.json', activityJson({ message: '正在錄第 2 段的畫面', step: 'build_scene', scene: 'scene-002' }))
  await page.locator('[data-testid="activity"][data-state="working"]').getByText('正在錄第 2 段的畫面').waitFor({ timeout: 10_000 })
  assert.equal(await page.getByTestId('scene-scene-002').getByTestId('scene-working').count(), 1)
  assert.equal(await page.getByTestId('scene-scene-001').getByTestId('scene-working').count(), 0)

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  await writeFile('video.activity.json', activityJson({ message: '正在錄第 3 段的畫面', scene: 'scene-003', updatedAt: hourAgo }))
  await page.locator('[data-testid="activity"][data-state="idle"]', { hasText: '最後的動態（1 小時前）：正在錄第 3 段的畫面' }).waitFor({ timeout: 10_000 })
  assert.equal(await page.getByTestId('scene-working').count(), 0, 'an agent that went quiet is not shown as working')

  await writeFile('video.activity.json', '{ "message": ')
  await page.getByTestId('activity').waitFor({ state: 'detached', timeout: 10_000 })
})

test('unsaved edits: switching scenes asks first; the full video is a list entry', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await openApp(t, p)
  if (!app) return
  const { page } = app
  await page.getByTestId('scene-scene-001').getByRole('button', { name: /開場/ }).click()
  await page.getByTestId('script-input').fill('還沒存的修改。')

  page.once('dialog', (d) => d.dismiss())
  await page.getByTestId('scene-scene-002').getByRole('button', { name: /行動呼籲/ }).click()
  assert.equal(await page.getByTestId('editor-scene-001').count(), 1, 'cancelling keeps the editor and the edit')
  assert.equal(await page.getByTestId('script-input').inputValue(), '還沒存的修改。')

  page.once('dialog', (d) => d.accept())
  await page.getByTestId('final-entry').click()
  await page.getByTestId('final-outdated').waitFor()
  assert.equal(await page.getByTestId('editor-scene-001').count(), 0)

  // Outdated scenes listed under the full video open their editor.
  await page.getByTestId('final-outdated').getByRole('button', { name: /補充/ }).click()
  await page.getByTestId('editor-scene-003').waitFor()
})

test('a project from an older template: one click updates its tools and drops retired fields', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const project = p.read('video.project.json')
  Object.assign(project.project, { renderer: 'remotion', rendererLicense: 'free' })
  p.write('video.project.json', project)
  const app = await openApp(t, p)
  if (!app) return
  const { page, read } = app
  await page.getByTestId('template-outdated').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /unknown field "renderer"/)

  await page.getByTestId('template-update').click()
  await page.getByTestId('template-outdated').waitFor({ state: 'detached' })
  const updated = JSON.parse(await read('video.project.json'))
  assert.equal(updated.project.renderer, undefined)
  assert.equal(updated.project.rendererLicense, undefined)
  assert.equal(updated.updatedBy, 'user')
  assert.equal(updated.project.name, '網頁測試專案', 'video content is kept')
  assert.match(await read('scripts/validate.mjs'), /validate/, 'template files are written')
  assert.equal(await page.getByRole('alert').count(), 0, 'the project is valid again')
  assert.equal(await page.getByTestId('scene-scene-001').getByTestId('scene-status').textContent(), '已渲染')
})

test('a story project opened here points to the story workbench', async (t) => {
  const p = storyFixture()
  t.after(() => p.cleanup())
  const opened = await openApp(t, p)
  if (!opened) return
  const { page } = opened
  await page.getByTestId('other-kind').waitFor()
  assert.match(await page.getByTestId('other-kind').textContent(), /「小狐狸找月亮」是故事動畫專案/)
  assert.equal(await page.getByTestId('open-other-kind').getAttribute('href'), `${web.origin}${BASE}/story/`)
  assert.equal(await page.getByTestId('scene-scene-001').count(), 0, 'the scene board stays in the story workbench')
})
