import { useState, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { triggerSync, triggerForceSync, getSyncStatus, triggerCacheWarm, getCacheWarmStatus, checkAdminAuth, setAdminToken } from '../api/client'

function AdminTools() {
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [warmStatus, setWarmStatus] = useState(null)
  const [warming, setWarming] = useState(false)

  useEffect(() => {
    getSyncStatus().then(setStatus).catch(() => {})
    getCacheWarmStatus().then(setWarmStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!warming) return
    const id = setInterval(() => {
      getCacheWarmStatus().then(s => {
        setWarmStatus(s)
        if (!s.inProgress) setWarming(false)
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [warming])

  const handleSync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const r = await triggerSync()
      setResult(r)
      getSyncStatus().then(setStatus)
    } catch {
      setResult({ success: false, message: 'Request failed' })
    } finally {
      setSyncing(false)
    }
  }

  const handleCacheWarm = async () => {
    setWarming(true)
    try {
      await triggerCacheWarm()
    } catch {
      setWarming(false)
    }
  }

  const handleForceSync = async () => {
    if (!window.confirm(
      'Force re-sync will re-process ALL seasons from the API, bypassing the "already synced" check.\n\n' +
      'This can take up to 30 minutes and will generate a large number of database writes and API calls.\n\n' +
      'Only use this when you need to backfill missing data (e.g. after a schema change).\n\nProceed?'
    )) return
    setSyncing(true)
    setResult(null)
    try {
      const r = await triggerForceSync()
      setResult(r)
      getSyncStatus().then(setStatus)
    } catch {
      setResult({ success: false, message: 'Request failed' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-md">
      <PageHeader title="Admin" qualifier="Sync and cache controls" />

      <div className="border border-line rounded p-5 space-y-4">
        <div>
          <p className="text-sm text-muted mb-1">Last sync</p>
          <p className="font-mono text-sm">
            {status?.lastSyncTime
              ? new Date(status.lastSyncTime).toLocaleString()
              : 'Never'}
          </p>
          {status?.message && (
            <p className={`text-sm mt-1 ${status.success ? 'text-good' : 'text-bad'}`}>
              {status.message}
            </p>
          )}
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-primary w-full justify-center py-2"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>

        {result && (
          <div className={`text-sm rounded p-3 ${result.success ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
            {result.message}
          </div>
        )}
      </div>

      <div className="mt-6 border border-line rounded p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">Force Re-sync All Seasons</p>
          <p className="text-xs text-muted mt-1">
            Re-processes every season from the API, ignoring the "already synced" check.
            Use this to backfill missing data after schema changes. Can take up to 30 minutes.
          </p>
        </div>
        <button
          onClick={handleForceSync}
          disabled={syncing}
          className="btn w-full justify-center py-2"
        >
          {syncing ? 'Running...' : 'Force Re-sync All Seasons'}
        </button>
      </div>

      <div className="mt-6 border border-line rounded p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">Cache Pre-population</p>
          <p className="text-xs text-muted mt-1">
            Clears all caches and eagerly re-builds them. Use after a deploy, reboot,
            or whenever data feels stale. Runs in the background.
          </p>
        </div>
        {warmStatus?.completedAt && !warmStatus.inProgress && (
          <div>
            <p className="text-sm text-muted mb-0.5">Last warm</p>
            <p className="font-mono text-sm">{new Date(warmStatus.completedAt).toLocaleString()}</p>
            {warmStatus.message && (
              <p className={`text-xs mt-1 ${warmStatus.success ? 'text-good' : 'text-bad'}`}>
                {warmStatus.message}
              </p>
            )}
          </div>
        )}
        {warmStatus?.inProgress && (
          <p className="text-sm text-accent animate-pulse">{warmStatus.message}</p>
        )}
        <button
          onClick={handleCacheWarm}
          disabled={warming || syncing}
          className="btn w-full justify-center py-2"
        >
          {warming ? 'Warming...' : 'Warm Cache'}
        </button>
      </div>

      <p className="mt-4 text-xs text-muted">
        Data syncs automatically every night at 4am ET.
      </p>
    </div>
  )
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(null)
  const [passcode, setPasscode] = useState('')
  const [rejected, setRejected] = useState(false)

  const check = () =>
    checkAdminAuth()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))

  useEffect(() => { check() }, [])

  const submit = async e => {
    e.preventDefault()
    setAdminToken(passcode)
    setRejected(false)
    try {
      await checkAdminAuth()
      setAuthed(true)
    } catch {
      setAdminToken(null)
      setRejected(true)
    }
  }

  if (authed === null) return <div className="text-muted">Loading...</div>
  if (authed) return <AdminTools />

  return (
    <div className="max-w-md">
      <PageHeader title="Admin" qualifier="Passcode required" />
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoFocus
          aria-label="Passcode"
          value={passcode}
          onChange={e => setPasscode(e.target.value)}
          className="field w-full"
          placeholder="Passcode"
        />
        {rejected && <p className="text-sm text-bad">Incorrect passcode.</p>}
        <button type="submit" className="btn-primary w-full justify-center py-2">Unlock</button>
      </form>
    </div>
  )
}
