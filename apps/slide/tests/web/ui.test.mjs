// Slide Studio end to end, built and served like the site (harness.mjs): the setup form, the prompt
// for the Agent, references, the workbench and the recent-projects list.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BASE, openFolder, putFiles, readOpfs, slideApp } from './harness.mjs'

const web = slideApp()

const project = (fields = {}) =>
  JSON.stringify({ specVersion: '1.0.0', id: 'q3-report', title: 'Q3 業績報告', theme: 'default', aspectRatio: '16/9', status: 'outlined', updatedAt: new Date().toISOString(), updatedBy: 'agent', ...fields })
const SLIDES = '---\ntheme: default\ntitle: Q3 業績報告\n---\n\n# Q3 業績報告\n\n---\n\n# 營收成長\n\n- 年增 30%\n'

test('setup: an empty folder gets the form; it writes slide.start.json and a prompt carrying the answers', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await openFolder(page, 'cloud-deck')
  await page.getByTestId('setup-title').waitFor()
  assert.equal(await page.getByTestId('setup-title').inputValue(), 'cloud-deck', 'a new project starts titled after its folder')
  assert.equal(await page.getByTestId('pages-count').count(), 0, 'the AI sizes the deck unless asked')

  await page.getByTestId('setup-title').fill('雲端遷移策略')
  await page.getByTestId('slide-content').fill('為什麼遷移、三個階段、風險')
  await page.getByTestId('setup-audience').fill('技術長')
  await page.getByTestId('pages-mode').selectOption('fixed')
  await page.getByTestId('pages-count').fill('12')
  await page.getByTestId('setup-create').click()
  await page.getByTestId('agent-prompt').waitFor()

  const start = JSON.parse(await readOpfs(page, 'cloud-deck/slide.start.json'))
  assert.deepEqual(
    { ...start, createdAt: undefined },
    { title: '雲端遷移策略', content: '為什麼遷移、三個階段、風險', audience: '技術長', pagesCount: 12, theme: 'default', notes: '', createdAt: undefined },
  )
  assert.equal(JSON.parse(await readOpfs(page, 'cloud-deck/slide.activity.json')).step, 'init')

  const prompt = await page.getByTestId('agent-prompt').inputValue()
  assert.match(prompt, /^你的工作資料夾是我在網頁上準備好的「cloud-deck」。.*為我製作一份 Slidev 簡報「雲端遷移策略」/)
  assert.match(prompt, /- 簡報內容：為什麼遷移、三個階段、風險\n- 目標受眾與場合：技術長\n- 頁數：12 頁\n/)
  assert.doesNotMatch(prompt, /請先問我要講什麼|參考資料/)
  assert.ok(prompt.endsWith(`請先閱讀並遵循這份 Skill：${web.origin}${BASE}/api/slide/skills/slidev-deck/SKILL.md`), prompt)
})

test('setup: without content the prompt asks the Agent to ask first', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await openFolder(page, 'empty-deck')
  await page.getByTestId('setup-create').click()
  const prompt = await page.getByTestId('agent-prompt').inputValue()
  assert.match(prompt, /我還沒寫簡報內容，請先問我要講什麼/)
  assert.match(prompt, /- 頁數：請依內容評估/)
  assert.equal(JSON.parse(await readOpfs(page, 'empty-deck/slide.start.json')).pagesCount, undefined)
})

test('a folder with other files is refused; one holding only references/ is still a new project', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await openFolder(page, 'not-empty', { 'notes.txt': 'x' })
  assert.match(await page.getByTestId('folder-error').textContent(), /「not-empty」不是空的資料夾.*notes\.txt/)
  assert.equal(await page.getByTestId('setup-title').count(), 0)

  await openFolder(page, 'with-refs', { 'references/report.pdf': '%PDF', '.DS_Store': '' })
  await page.getByTestId('setup-title').waitFor()
  assert.equal(await page.getByTestId('folder-error').count(), 0)
  await page.getByTestId('reference-item').waitFor()
  assert.equal(await page.getByTestId('reference-item').count(), 1, 'the setup form lists what is already there')
})

test('references: added on the setup form, they reach the prompt; with no content they lead the plan', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await openFolder(page, 'refs-deck')
  await page.getByTestId('references-note').fill('數據做成圖表')
  // Enter in the note field must not submit the setup form.
  await page.getByTestId('references-note').press('Enter')
  assert.equal(await readOpfs(page, 'refs-deck/slide.start.json'), null)
  await page.getByTestId('references-input').setInputFiles([
    { name: 'Q3 營收.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('xlsx') },
    { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('png') },
  ])
  await page.getByTestId('reference-item').nth(1).waitFor()
  assert.equal(await readOpfs(page, 'refs-deck/references/Q3 營收.xlsx'), 'xlsx')
  const index = JSON.parse(await readOpfs(page, 'refs-deck/references/index.json'))
  assert.deepEqual(index.files.map((f) => [f.name, f.note]), [['Q3 營收.xlsx', '數據做成圖表'], ['logo.png', '數據做成圖表']])

  await page.getByTestId('setup-create').click()
  await page.getByTestId('agent-prompt').waitFor()
  await page.waitForFunction(() => document.querySelector('[data-testid=agent-prompt]')?.value.includes('放了 2 份參考資料'))
  const prompt = await page.getByTestId('agent-prompt').inputValue()
  assert.match(prompt, /請以 references\/ 的參考資料為主規劃/)
  assert.doesNotMatch(prompt, /請先問我要講什麼/)
  assert.match(await page.getByTestId('pending-references').textContent(), /參考資料（2 份）/)
})

test('workbench: the project from the Agent replaces the prompt; the references tab gives the sentence to hand over', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await openFolder(page, 'q3-deck')
  await page.getByTestId('setup-create').click()
  await page.getByTestId('agent-prompt').waitFor()

  // The Agent unpacks the template and writes the project; polling switches the page by itself.
  await putFiles(page, 'q3-deck', { 'slide.project.json': project(), 'slides.md': SLIDES })
  await page.getByTestId('tab-slides').waitFor({ timeout: 10_000 })
  assert.equal(await page.getByTestId('agent-prompt').count(), 0)
  await page.getByTestId('project-name').getByText('Q3 業績報告').waitFor()
  await page.getByText('營收成長').first().waitFor()

  await page.getByTestId('tab-references').click()
  assert.equal(await page.getByTestId('references-ask').count(), 0, 'nothing to say before anything is added')
  await page.getByTestId('references-text-toggle').click()
  await page.getByTestId('references-text-title').fill('講者筆記')
  await page.getByTestId('references-text-body').fill('第二頁補上去年同期數字')
  await page.getByTestId('references-text-save').click()
  await page.getByTestId('references-ask').waitFor()
  assert.equal(await readOpfs(page, 'q3-deck/references/講者筆記.md'), '第二頁補上去年同期數字\n')
  assert.match(await page.getByTestId('references-ask').textContent(), /我在 references\/ 新增了參考資料：講者筆記\.md。.*再更新簡報。/)
  await page.getByTestId('tab-references').getByText('(1)').waitFor()

  page.once('dialog', (d) => d.accept())
  await page.getByTestId('reference-remove').click()
  await page.getByTestId('references-ask').waitFor({ state: 'detached' })
  assert.equal(await readOpfs(page, 'q3-deck/references/講者筆記.md'), null)
  assert.deepEqual(JSON.parse(await readOpfs(page, 'q3-deck/references/index.json')).files, [])
})

test('recent projects: a reload reopens the last project; a closed one stays one click away', async (t) => {
  const page = await web.newPage(t)
  if (!page) return
  await openFolder(page, 'kept-deck', { 'slide.project.json': project({ title: '留著的簡報' }), 'slides.md': SLIDES })
  await page.getByTestId('project-name').getByText('留著的簡報').waitFor()

  await page.reload()
  await page.getByTestId('project-name').getByText('留著的簡報').waitFor({ timeout: 10_000 })

  await page.getByTestId('project-switcher').getByRole('button').first().click()
  await page.getByRole('menuitem', { name: /關閉/ }).click()
  await page.getByTestId('recent').waitFor()
  await page.reload()
  await page.getByTestId('recent').getByText('留著的簡報').waitFor()
  assert.equal(await page.getByTestId('project-name').count(), 0, 'a closed project is not reopened by itself')
  await page.getByTestId('recent-open').click()
  await page.getByTestId('project-name').getByText('留著的簡報').waitFor()
})
