import { useEffect, useState } from 'react'

// Stats change once a night, so a few minutes of reuse saves refetching all-time history on every profile visit.
const FRESH_MS = 5 * 60 * 1000
const cache = new Map()

export const clearLoadCache = () => cache.clear()

function load(key, loader) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise
  const promise = loader()
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => cache.delete(key))
  return promise
}

// Data is only handed out for the key it was loaded for, so a slow response for a season or team the user has left never renders.
export function useLoad(key, loader) {
  const [state, setState] = useState({ key: null, data: null, error: false })
  useEffect(() => {
    if (key == null) return
    let live = true
    load(key, loader)
      .then(data => { if (live) setState({ key, data, error: false }) })
      .catch(() => { if (live) setState({ key, data: null, error: true }) })
    return () => { live = false }
  }, [key])
  const ready = key != null && state.key === key
  return { data: ready ? state.data : null, error: ready && state.error, loading: key != null && !ready }
}
