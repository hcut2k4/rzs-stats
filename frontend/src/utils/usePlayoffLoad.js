import { useLoad } from './useLoad'

export const isBusy = error => error?.response?.status === 503 || error?.status === 503

export async function withBusyRetry(loader, signal) {
  try { return await loader() } catch (error) {
    if (!isBusy(error) || signal?.aborted || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') throw error
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, 1000 + Math.random() * 2000)
      signal?.addEventListener('abort', abort, { once: true })
    })
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return loader()
  }
}

export function usePlayoffLoad(key, loader) {
  return useLoad(key, () => withBusyRetry(loader))
}
