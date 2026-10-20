// What the user should do next, in plain words, and the sentence to hand the Agent when there is one.
// As in the video workbench, a sentence is a plain request; a command only follows in brackets, for the Agent.
// Derived from slide.project.json, the activity and the render check; the Skill (skills/slidev-deck)
// stops for the user after the outline, the draft and the visuals.
import { computed } from 'vue'
import { useActivity } from '@aoa/web-shared/activity'
import { activity, check, project, rendersStale, slidesMarkdown, STARTER_MESSAGE } from './store'

export interface NextStep {
  title: string
  hint: string
  /** The sentence to paste to the Agent; absent while the Agent is working or nothing is due. */
  say?: string
  tone: 'work' | 'wait' | 'act' | 'done' | 'warn'
}

/** What each checkpoint step's approval sounds like. */
const APPROVE: Record<string, string> = {
  outline: '大綱沒問題，請開始撰寫簡報文案。',
  draft: '文案沒問題，請開始視覺升級。',
  visual: '視覺沒問題，請匯出 PDF 與單檔 HTML。',
}

/** The next request once a status is reached and nobody is waiting. */
const AFTER: Record<string, Omit<NextStep, 'tone'> & { tone?: NextStep['tone'] }> = {
  initialized: { title: '下一步：規劃大綱', hint: 'Agent 會依你的內容提出頁數與每頁重點，先給你確認。', say: '請繼續規劃簡報大綱。' },
  outlined: { title: '下一步：撰寫文案', hint: '大綱已確認。Agent 會寫出每一頁的內容與講者備忘錄。', say: '請繼續撰寫簡報文案。' },
  drafted: { title: '下一步：視覺升級或直接匯出', hint: '文案已完成。可以請 Agent 加上圖表與動畫，或直接匯出。', say: '請繼續做視覺升級。' },
  visualized: { title: '下一步：匯出', hint: '視覺已完成。匯出後可以在「成果」下載 PDF 或全螢幕放映。', say: '請匯出 PDF 與單檔 HTML。' },
  exported: { title: '簡報完成', hint: '要修改就告訴 Agent 第幾頁要改什麼；改完請它重新匯出。', tone: 'done' },
  failed: { title: 'Agent 上一步沒有完成', hint: '請它看一下錯誤原因，修好後繼續。', say: '上一步失敗了，請檢查錯誤原因並繼續。', tone: 'warn' },
}

export function useNextStep() {
  const live = useActivity(activity)
  return computed<NextStep>(() => {
    // The page's own first activity says nothing about the Agent.
    const act = live.value?.message === STARTER_MESSAGE ? null : live.value
    if (act?.waitingForUser) {
      const say = APPROVE[act.step ?? '']
      return {
        title: 'Agent 在等你確認',
        hint: say ? `${act.message.replace(/[。.!！]$/, '')}。看過下方的投影片，沒問題就把這句話交給它；要改哪裡就直接告訴它第幾頁改什麼。` : act.message,
        say,
        tone: 'wait',
      }
    }
    if (act?.current && act.step !== 'idle') return { title: 'Agent 正在製作', hint: act.message, tone: 'work' }

    const report = check.value
    const bad = report?.slides.filter((s) => s.issues.length).map((s) => s.no) ?? []
    if (bad.length && !rendersStale.value) {
      const pages = bad.length > 3 ? `${bad.slice(0, 3).join('、')} 等 ${bad.length} 頁` : bad.join('、')
      return {
        title: `${bad.length} 頁沒通過版面檢查`,
        hint: '超出版面、找不到組件之類的問題，交給 Agent 修正。',
        say: `版面檢查第 ${pages} 頁有問題，請修正後更新預覽畫面。（pnpm run check）`,
        tone: 'warn',
      }
    }
    if (rendersStale.value) {
      return { title: '預覽畫面不是最新的', hint: '簡報在上次截圖後改過了，請 Agent 重新產生畫面。', say: '請更新每一頁的預覽畫面。（pnpm run check）', tone: 'act' }
    }
    const status = project.value?.status
    const step = status ? AFTER[status] : undefined
    if (step) return { tone: 'act', ...step }
    if (!slidesMarkdown.value) return { title: '等待 Agent 建立簡報', hint: '把提示詞交給 Agent 後，投影片會出現在這裡。', tone: 'work' }
    return { title: '下一步：規劃大綱', hint: AFTER.initialized.hint, say: AFTER.initialized.say, tone: 'act' }
  })
}
