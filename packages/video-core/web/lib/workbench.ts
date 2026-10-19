// What a video app can add to the shared workbench (App.vue).
import type { Component } from 'vue'
import type { IconName } from '../components/Icon.vue'
import type { ProjectState } from './project'

/** A tab beside the scene board, e.g. the story's cast studio. */
export interface WorkbenchTab {
  id: string
  icon: IconName
  label: string
  /** A number shown beside the label, e.g. how many characters the cast has. */
  count?: (state: ProjectState) => number
  component: Component
}
