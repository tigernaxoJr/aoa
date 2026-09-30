/// <reference types="vite/client" />

declare const __SITE_URL__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '@core' {
  export const MISSING: string
  export function hashFiles(sceneDir: string, scene: unknown, assetFiles: string[]): string[]
  export function hashParts(project: unknown, scene: unknown, files: string[]): ({ label: string; text: string; file?: undefined } | { label: string; file: string; text?: undefined })[]
  export function suggestNext(
    project: { status: string },
    scenes: { id: string; status: string; outdated: boolean; locked: boolean; error: string | null }[],
    errors?: string[],
  ): { command: string | null; reason: string }
  export function checkTransition(workflow: unknown, target: 'project' | 'scene', from: string, to: string): string | null
  export function deriveStatus(projectStatus: string, facts: ({ status: string; upToDate: boolean; outputMtime: number } | null)[], finalMtime: number): string | null
}

// File System Access API pieces not yet in TypeScript's DOM lib.
interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}
interface Window {
  showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle>
}
