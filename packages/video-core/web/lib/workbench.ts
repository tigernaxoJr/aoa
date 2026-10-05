// What a video app can add to the shared workbench (App.vue).
import type { Component } from 'vue'
import type { IconName } from '../components/Icon.vue'
import type { ProjectState } from './project'

/** A tab beside the scene board, e.g. the story's cast studio. */
export interface WorkbenchTab {
  id: string
  icon: IconName
  label: (state: ProjectState) => string
  component: Component
}
