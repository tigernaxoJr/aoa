// Story video workbench end to end, built and served like the site (see the shared harness in
// packages/video-core/tests/web/harness.mjs): the story start page, story steps, the cast studio.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { startCompanion } from '../../../../packages/video-core/template/scripts/lib/companion.mjs'
import { FAKE_TTS, fullProject, motionScene } from '../../../../packages/video-agent/tests/helpers.mjs'
import { BASE, fixture, prepareFolder, readOpfs, storyFixture, waitForStart, webApp } from '../../../../packages/video-core/tests/web/harness.mjs'
import { build as buildApi } from '../../tools/build-api.mjs'

const web = webApp({ slug: 'story', viteConfig: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)), buildApi })

test('home page: write the story, and the message points the agent at the story guide', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  assert.equal(await page.getByTestId('video-kind').count(), 0, 'no kind to choose: this workbench makes story videos')
  assert.match(await page.getByTestId('intro').textContent(), /寫下你的故事/)
  assert.equal(await page.getByPlaceholder('https://example.com').count(), 0, 'no product fields for a story')
  assert.match(await page.getByTestId('step-run').textContent(), /請先在步驟 1 準備/, 'no message before the folder is prepared')

  await prepareFolder(page, 'acme-video', {})
  await page.getByTestId('project-folder').getByText('acme-video').waitFor()
  assert.match(await page.getByTestId('step-run').textContent(), /請先在步驟 2 寫下你的故事/)
  await page.getByTestId('story-text').fill('一隻小狐狸以為月亮掉進了池塘。\n牠想把月亮撈起來。')
  await page.getByTestId('story-audience').fill('4–7 歲的小朋友')
  await waitForStart(page, '4–7 歲的小朋友')
  const start = JSON.parse(await readOpfs(page, 'acme-video/video.start.json'))
  assert.deepEqual({ ...start, updatedAt: undefined }, { id: start.id, kind: 'story', story: '一隻小狐狸以為月亮掉進了池塘。\n牠想把月亮撈起來。', audience: '4–7 歲的小朋友', updatedAt: undefined })

  const message = await page.getByTestId('launch-message').textContent()
  assert.match(message, new RegExp(`^請讀取 ${web.origin}${BASE}/api/story/agent-guide\\.md，依照裡面的步驟幫我把故事做成動畫影片。\n`))
  assert.match(message, /記有故事內容與識別碼/)
  assert.match(message, /・故事：一隻小狐狸以為月亮掉進了池塘。\n牠想把月亮撈起來。\n・觀看對象：4–7 歲的小朋友\n/)

  // The story is remembered across a reload.
  await page.reload()
  await page.getByTestId('launch-message').waitFor()
  assert.equal(await page.getByTestId('story-text').inputValue(), '一隻小狐狸以為月亮掉進了池塘。\n牠想把月亮撈起來。')
})

test('story project: story steps, cast hint, and the browser hash covers shared art and character voices', async (t) => {
  const p = storyFixture()
  t.after(() => p.cleanup())
  const app = await web.openApp(t, p)
  if (!app) return
  const { page } = app
  await page.getByTestId('project-name').waitFor()
  const status = () => page.getByTestId('scene-scene-001').getByTestId('scene-status').textContent()
  assert.equal(await status(), '已渲染', 'the browser hashes motion.uses folders and speaking voices like Node')
  const bar = await page.getByRole('list', { name: '工作流程' }).textContent()
  assert.match(bar, /整理故事.*美術與角色.*分鏡與對白/)
  assert.doesNotMatch(bar, /分析產品/)

  await page.getByTestId('scene-scene-001').getByRole('button', { name: /池塘/ }).click()
  assert.match(await page.getByTestId('cast-hint').textContent(), /【小狐狸】、【貓頭鷹】/)

  // Redrawing the fox makes the scene outdated without anyone touching scene.json.
  await page.evaluate(async () => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('proj')
    for (const part of ['assets', 'cast', 'fox']) dir = await dir.getDirectoryHandle(part)
    const w = await (await dir.getFileHandle('fox.svg')).createWritable()
    await w.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"/>\n')
    await w.close()
  })
  for (let i = 0; i < 100 && (await status()) !== '內容已變更'; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(await status(), '內容已變更')

  // The cast studio tab
  await page.getByTestId('tab-cast').click()
  await page.getByText('登場角色名冊').waitFor()
  assert.match(await page.locator('main').innerText(), /小狐狸/)
  assert.match(await page.locator('main').innerText(), /貓頭鷹/)

  // Add a new character "志明"
  await page.getByRole('button', { name: /新增角色/ }).first().click()
  await page.getByPlaceholder('例如：志明').fill('志明')
  await page.getByPlaceholder(/例如：20歲熱血青年/).fill('熱血青年，個性樂觀')
  await page.getByPlaceholder('例如：zhiming').fill('zhiming')
  await page.getByRole('button', { name: '儲存角色' }).click()
  await page.getByText('角色【志明】已儲存').waitFor({ timeout: 5000 })

  const savedProject = JSON.parse(await app.read('video.project.json'))
  const zhiming = savedProject.project.cast.find((c) => c.id === 'zhiming')
  assert.ok(zhiming, 'zhiming is saved into video.project.json')
  assert.equal(zhiming.name, '志明')
  assert.equal(zhiming.description, '熱血青年，個性樂觀')
  assert.equal(zhiming.provider, 'cosyvoice3')

  // Back to the scene board
  await page.getByRole('tab', { name: /分鏡故事板/ }).click()
  assert.equal(await page.getByTestId('scene-scene-001').isVisible(), true)
})

test('with the Companion, "立即產生試聽" synthesizes the saved voice; unsaved voice changes must be saved first', async (t) => {
  if (!web.browser) return t.skip('no browser available')
  Object.assign(process.env, FAKE_TTS)
  const p = fullProject({ scenes: [{ id: 'scene-001', dir: 'scenes/001-pond', scene: motionScene('scene-001') }] })
  t.after(p.cleanup)
  const doc = JSON.parse(readFileSync(p.path('video.project.json'), 'utf8'))
  Object.assign(doc.project, { kind: 'story', sources: { story: '小狐狸以為月亮掉進了池塘。' }, cast: [{ id: 'fox', name: '小狐狸', voice: 'zh-TW-HsiaoYuNeural' }] })
  writeFileSync(p.path('video.project.json'), JSON.stringify(doc))
  const c = await startCompanion({ projectDir: p.root, port: 0, site: `${web.origin}${BASE}`, log: () => {} })
  t.after(() => c.close())

  const { page } = await web.openApp(t, p, `#pair=${c.port}:${c.token}`)
  await page.getByTestId('companion-status').getByText('本機助手已連線').waitFor()
  await page.getByTestId('tab-cast').click()
  const audition = page.getByTestId('audition')
  await audition.getByText('立即產生試聽').waitFor()

  // A voice picked but not saved is not what tts --sample would read.
  const voice = page.locator('select').filter({ has: page.locator('option[value="zh-TW-YunJheNeural"]') })
  await voice.selectOption('zh-TW-YunJheNeural')
  assert.equal(await audition.isDisabled(), true)
  await page.getByTestId('audition-unsaved').waitFor()
  await voice.selectOption('zh-TW-HsiaoYuNeural')
  await page.getByRole('button', { name: '儲存角色' }).click()
  await page.getByText('角色【小狐狸】已儲存').waitFor({ timeout: 5000 })
  await page.getByTestId('audition-unsaved').waitFor({ state: 'detached' })

  await audition.click()
  await page.getByTestId('notice').filter({ hasText: '已產生 小狐狸 試聽語音' }).waitFor({ timeout: 60_000 })
  assert.ok(existsSync(p.path('brief/voices/fox.mp3')))
})

test('a product project opened here points to the product workbench', async (t) => {
  const p = fixture()
  t.after(() => p.cleanup())
  const app = await web.openApp(t, p)
  if (!app) return
  const { page } = app
  await page.getByTestId('other-kind').waitFor()
  assert.match(await page.getByTestId('other-kind').textContent(), /「網頁測試專案」是產品介紹影片專案/)
  assert.equal(await page.getByTestId('open-other-kind').getAttribute('href'), `${web.origin}${BASE}/product/`)
})
