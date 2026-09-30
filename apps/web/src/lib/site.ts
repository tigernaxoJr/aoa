// Site-level facts for the UI: where the Guide API lives and how to start an agent (SPEC §8.3, §9.2).

export const SITE_URL: string = __SITE_URL__
export const api = (path: string) => `${SITE_URL}/api/${path}`

export interface SourceInput {
  productUrl: string
  sourceCodePath: string
  description: string
}

/** Escapes double quotes so the text can sit inside a double-quoted shell argument. */
const quote = (s: string) => s.replace(/"/g, '\\"')

/**
 * The launch command: needs no installed Skill, works for any agent that can read a URL.
 * Only the sources the user filled in are mentioned.
 */
export function launchCommand(src: SourceInput) {
  const parts: string[] = []
  if (src.productUrl.trim()) parts.push(`產品網址 ${src.productUrl.trim()}`)
  if (src.sourceCodePath.trim()) parts.push(`原始碼 ${src.sourceCodePath.trim()}`)
  if (src.description.trim()) parts.push(`產品說明：${src.description.trim().replace(/\s+/g, ' ')}`)
  const what = parts.length ? `，來源：${parts.join('；')}` : ''
  return `claude "${quote(`讀取 ${api('agent-guide.md')}，製作產品介紹影片${what}`)}"`
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
