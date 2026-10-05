// 產品介紹影片工作台, served at <site>/product/. Shared recipe: ../vite.shared.ts; video settings: packages/video-core/web/vite.ts.
import { appConfig, here } from '../vite.shared'
import { videoApp } from '../../packages/video-core/web/vite'

const appDir = here(import.meta.url, '.')
export default appConfig(appDir, 'product', videoApp('product', appDir))
