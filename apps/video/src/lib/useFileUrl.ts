// Object URL for a file inside the project folder (e.g. a scene video), refreshed when its mtime
// changes and revoked when no longer shown.
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { tryFile } from '@aoa/web-shared/fsa'
import { root } from './store'

export function useFileUrl(path: Ref<string | null>, mtime: Ref<number>) {
  const url = ref<string | null>(null)
  const revoke = () => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = null
  }
  let latest = 0
  watch(
    [path, mtime, root],
    async ([p]) => {
      const run = ++latest
      revoke()
      if (!p || !root.value) return
      const file = await tryFile(root.value, p)
      // A newer change started while this read was in flight; its result wins.
      if (file && run === latest) url.value = URL.createObjectURL(file)
    },
    { immediate: true },
  )
  onBeforeUnmount(revoke)
  return url
}
