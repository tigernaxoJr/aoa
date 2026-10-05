// 故事動畫工作台, served at <site>/story/. Shared recipe: ../vite.shared.ts; video settings: packages/video-core/web/vite.ts.
import { appConfig, here } from '../vite.shared'
import { videoApp } from '../../packages/video-core/web/vite'

const appDir = here(import.meta.url, '.')
export default appConfig(appDir, 'story', videoApp('story', appDir))
