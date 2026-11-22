import { useEffect, useState } from 'react'

// Stats change once a night, so a few minutes of reuse saves refetching all-time history on every profile visit.
const FRESH_MS = 5 * 60 * 1000
const cache = new Map()

export const clearLoadCache = () => cache.clear()

function load(key, loader, { freshMs = FRESH_MS, cacheErrors = false } = {}) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < freshMs) return hit.promise
  const promise = Promise.resolve().then(loader)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => { if (!cacheErrors && cache.get(key)?.promise === promise) cache.delete(key) })
  return promise
}

// Data is only handed out for the key it was loaded for, so a slow response for a season or team the user has left never renders.
export function useLoad(key, loader, options) {
  const [state, setState] = useState({ key: null, data: null, error: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (key == null) return
    let live = true
    setState({ key: null, data: null, error: false })
    load(key, loader, options)
      .then(data => { if (live) setState({ key, data, error: false }) })
      .catch(error => { if (live) setState({ key, data: null, error }) })
    return () => { live = false }
  }, [key, attempt])
  const ready = key != null && state.key === key
  const retry = () => { cache.delete(key); setAttempt(a => a + 1) }
  return { retry, data: ready ? state.data : null, error: ready && state.error, loading: key != null && !ready }
}
