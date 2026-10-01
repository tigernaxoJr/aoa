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
