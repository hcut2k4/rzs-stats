import { useState, useEffect } from 'react'
import { triggerSync, triggerForceSync, getSyncStatus, triggerCacheWarm, getCacheWarmStatus } from '../api/client'

export default function AdminPage() {
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
      <h1 className="text-xl font-bold mb-6">Admin</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
        <div>
          <p className="text-sm text-gray-400 mb-1">Last sync</p>
          <p className="font-mono text-sm">
            {status?.lastSyncTime
              ? new Date(status.lastSyncTime).toLocaleString()
              : 'Never'}
          </p>
          {status?.message && (
            <p className={`text-sm mt-1 ${status.success ? 'text-green-400' : 'text-red-400'}`}>
              {status.message}
            </p>
          )}
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full py-2 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>

        {result && (
          <div className={`text-sm rounded p-3 ${result.success ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
            {result.message}
          </div>
        )}
      </div>

      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-3">
        <div>
          <p className="text-sm font-medium text-yellow-400">Force Re-sync All Seasons</p>
          <p className="text-xs text-gray-500 mt-1">
            Re-processes every season from the API, ignoring the "already synced" check.
            Use this to backfill missing data after schema changes. Can take up to 30 minutes.
          </p>
        </div>
        <button
          onClick={handleForceSync}
          disabled={syncing}
          className="w-full py-2 px-4 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors text-sm"
        >
          {syncing ? 'Running...' : 'Force Re-sync All Seasons'}
        </button>
      </div>

      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-3">
        <div>
          <p className="text-sm font-medium text-blue-400">Cache Pre-population</p>
          <p className="text-xs text-gray-500 mt-1">
            Clears all caches and eagerly re-builds them. Use after a deploy, reboot,
            or whenever data feels stale. Runs in the background.
          </p>
        </div>
        {warmStatus?.completedAt && !warmStatus.inProgress && (
          <div>
            <p className="text-sm text-gray-400 mb-0.5">Last warm</p>
            <p className="font-mono text-sm">{new Date(warmStatus.completedAt).toLocaleString()}</p>
            {warmStatus.message && (
              <p className={`text-xs mt-1 ${warmStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                {warmStatus.message}
              </p>
            )}
          </div>
        )}
        {warmStatus?.inProgress && (
          <p className="text-sm text-blue-300 animate-pulse">{warmStatus.message}</p>
        )}
        <button
          onClick={handleCacheWarm}
          disabled={warming || syncing}
          className="w-full py-2 px-4 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors text-sm"
        >
          {warming ? 'Warming...' : 'Warm Cache'}
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-600">
        Data syncs automatically every night at 4am ET.
      </p>
    </div>
  )
}
