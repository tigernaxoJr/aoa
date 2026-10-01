// Site-level facts for the UI: where the Guide API lives and how to start an agent (SPEC §8.3, §9.2).

export const SITE_URL: string = __SITE_URL__
export const api = (path: string) => `${SITE_URL}/api/${path}`

/** Written by the page into a prepared project folder; the agent reads it at init (SPEC §9.2). */
export const START_FILE = 'video.start.json'

/** What the picked source folder looks like, so the agent can tell it apart from same-named folders. */
export interface SourceHints {
  packageName: string | null
  gitRemote: string | null
  entries: string[]
}

export interface SourceInput {
  productUrl: string
  /** The product page needs signing in; the agent then has the user sign in in a window of its own. */
  requiresLogin: boolean
  /** Name of a folder the user picked (browsers never reveal its full path). */
  sourceFolder: string
  sourceHints: SourceHints | null
  /** The full path, typed or pasted by the user. */
  sourceCodePath: string
  description: string
}

/** Escapes double quotes so the text can sit inside a double-quoted shell argument. */
const quote = (s: string) => s.replace(/"/g, '\\"')

function sources(src: SourceInput) {
  const parts: string[] = []
  if (src.productUrl.trim()) parts.push(`產品網址：${src.productUrl.trim()}`)
  if (src.productUrl.trim() && src.requiresLogin) parts.push('這個網站要登入才看得到：請打開視窗讓我自己登入，我不會把帳號密碼告訴你')
  if (src.sourceCodePath.trim()) parts.push(`產品原始碼：${src.sourceCodePath.trim()}`)
  else if (src.sourceFolder.trim()) parts.push(`產品原始碼在我電腦上名為「${src.sourceFolder.trim()}」的資料夾（請幫我找到它；找不到就問我）`)
  if (src.description.trim()) parts.push(`產品說明：${src.description.trim().replace(/\s+/g, ' ')}`)
  return parts
}

/** A short random code the agent matches to find the prepared folder (the page never learns its path). */
export const newFolderId = () => crypto.randomUUID().slice(0, 8)

/** The start file's contents: the folder's id, the same sources, and the hints for finding the source folder. */
export function startJson(src: SourceInput, id: string) {
  const value = (s: string) => s.trim() || null
  const folder = value(src.sourceFolder)
  return `${JSON.stringify(
    {
      id,
      productUrl: value(src.productUrl),
      requiresLogin: Boolean(value(src.productUrl) && src.requiresLogin),
      sourceCodePath: value(src.sourceCodePath),
      sourceFolder: folder && { name: folder, ...src.sourceHints },
      description: value(src.description),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`
}

/**
 * The message a user pastes into their agent (SPEC §9.2). Needs no installed Skill and assumes no
 * IT knowledge: the agent runs every command itself and explains any step the user must do.
 * `projectFolder` names the folder the page prepared and the id in its start file, so the agent can
 * find it from whatever folder it was opened in and build the project right there.
 */
export function launchMessage(src: SourceInput, projectFolder: { name: string; id: string } | null = null) {
  const parts = sources(src)
  return [
    `請讀取 ${api('agent-guide.md')}，依照裡面的步驟幫我製作產品介紹影片。`,
    ...(projectFolder
      ? [
          `你的工作資料夾是我在網頁上準備好的「${projectFolder.name}」：裡面的 ${START_FILE} 記有產品資訊與識別碼 ${projectFolder.id}。我開對話時沒有特別選它，請你自己找到這個資料夾、把工作目錄切換過去，所有檔案都放在那裡，不要在其他地方建立專案。`,
        ]
      : []),
    ...parts.map((p) => `・${p}`),
    '我不熟悉電腦操作：需要執行的指令請直接替我執行；需要我自己動手的地方（例如安裝軟體、按允許），請一步一步用白話告訴我要點哪裡。',
  ].join('\n')
}

/** The same request as a one-line terminal command, for people who use a shell. */
export function launchCommand(src: SourceInput, projectFolder: { name: string; id: string } | null = null) {
  const parts = sources(src)
  const what = parts.length ? `，${parts.join('；')}` : ''
  const here = projectFolder ? `，在目前資料夾建立專案（產品資訊在 ${START_FILE}，識別碼 ${projectFolder.id}）` : ''
  return `claude "${quote(`讀取 ${api('agent-guide.md')}，製作產品介紹影片${here}${what}`)}"`
}

export const STEPS = [
  { id: 'init', label: '初始化', done: ['initialized', 'analyzed', 'script_generated', 'producing', 'ready_to_assemble', 'completed'] },
  { id: 'analyze', label: '分析產品', done: ['analyzed', 'script_generated', 'producing', 'ready_to_assemble', 'completed'] },
  { id: 'storyboard', label: '分鏡與旁白', done: ['script_generated', 'producing', 'ready_to_assemble', 'completed'] },
  { id: 'build_scene', label: '產生 scene', done: ['ready_to_assemble', 'completed'] },
  { id: 'assemble', label: '合成', done: ['completed'] },
] as const

export const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  assets_ready: '素材完成',
  rendering: '渲染中',
  rendered: '已渲染',
  approved: '已核准',
  stale: '需要重做',
  failed: '失敗',
  missing: '缺少檔案',
}

export const PURPOSE_LABEL: Record<string, string> = {
  hook: '開場',
  problem: '痛點',
  solution: '解方',
  feature: '功能',
  'how-it-works': '運作方式',
  benefit: '效益',
  'social-proof': '信任',
  cta: '行動呼籲',
  custom: '自訂',
}

/** What the project's next step means for the user, in plain words; the slash command stays for copying. */
export function nextStep(next: { command: string | null; reason: string }, scenes: number) {
  const cmd = next.command?.split(' ')[0]
  const n = Number(next.reason.match(/^(\d+)/)?.[1] ?? 0)
  switch (cmd) {
    case '/video-analyze':
      return { title: '下一步：分析產品', hint: 'Agent 會研究你提供的網址與資料，整理出影片要講的重點。' }
    case '/video-storyboard':
      return { title: '下一步：寫分鏡與旁白', hint: 'Agent 會把影片拆成幾段 scene，並寫好每段的旁白。' }
    case '/video-scene':
      return next.command === '/video-scene all'
        ? { title: `下一步：製作剩下的${n ? ` ${n} 段` : ''} scene`, hint: '旁白、畫面與影片都由 Agent 產生；你可以先檢查已完成的段落。' }
        : { title: '有 scene 製作失敗', hint: '請 Agent 重做失敗的段落；點選該段可以看到錯誤原因。' }
    case '/video-sync':
      return { title: `有${n ? ` ${n} 段` : ''} scene 修改過，需要重做`, hint: '你在網頁上的修改要讓 Agent 套用，重新產生那幾段影片。' }
    case '/video-assemble':
      return { title: '所有 scene 都完成了，可以合成影片', hint: 'Agent 會把每段接起來，加上字幕與背景音樂，輸出完整影片。' }
  }
  if (next.reason.startsWith('done')) return { title: '影片完成', hint: '完整影片與所有 scene 一致，可以下載或分享了。' }
  if (next.reason.startsWith('locked')) return { title: '已鎖定的 scene 有變動', hint: 'Agent 不會修改鎖定的段落；請確認後解除鎖定，或在對話中告訴 Agent 怎麼處理。' }
  if (next.reason.startsWith('fix')) return { title: '專案檔有問題', hint: '請讓 Agent 執行 pnpm run validate 並修正。' }
  return { title: scenes ? '下一步' : '等待 Agent', hint: next.reason }
}

export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-300 dark:bg-slate-600',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
}

const STATUS_TONE: Record<string, Tone> = { approved: 'success', rendered: 'info', stale: 'warn', failed: 'danger', rendering: 'info', assets_ready: 'neutral' }

/** A scene's status as shown to the user: its label and color. */
export function sceneBadge(s: { scene: { status: string } | null; outdated: boolean }): { text: string; tone: Tone } {
  if (!s.scene) return { text: STATUS_LABEL.missing, tone: 'danger' }
  if (s.outdated && s.scene.status !== 'stale') return { text: '內容已變更', tone: 'warn' }
  return { text: STATUS_LABEL[s.scene.status] ?? s.scene.status, tone: STATUS_TONE[s.scene.status] ?? 'neutral' }
}
