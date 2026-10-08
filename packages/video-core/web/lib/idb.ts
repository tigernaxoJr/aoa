// Recently opened project folders (SPEC §9.1). Shared by both video workbenches (same origin and
// database); each shows only its own kind.
import { recentFolders } from '@aoa/web-shared/recent'

export type { RecentFolder } from '@aoa/web-shared/recent'

export const recent = recentFolders({ db: 'agent-video-producer', legacyKey: 'project' })
