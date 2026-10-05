import { createApp } from 'vue'
import App from '@video-core/web/App.vue'
import type { WorkbenchTab } from '@video-core/web/lib/workbench'
import CastPanel from './components/CastPanel.vue'
import StorySource from './StorySource.vue'
import './style.css'

const tabs: WorkbenchTab[] = [
  { id: 'cast', icon: 'user', label: (st) => `🎭 角色工坊 (${st.project.project.cast?.length ?? 0} 人)`, component: CastPanel },
]

createApp(App, { sourceForm: StorySource, tabs }).mount('#app')
