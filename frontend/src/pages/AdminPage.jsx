import { useState, useEffect } from 'react'
import { triggerSync, getSyncStatus } from '../api/client'

export default function AdminPage() {
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    getSyncStatus().then(setStatus).catch(() => {})
  }, [])

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

      <p className="mt-4 text-xs text-gray-600">
        Data syncs automatically every night at 2am ET.
      </p>
    </div>
  )
}
