import { useState, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { triggerSync, triggerForceSync, getSyncStatus, triggerCacheWarm, getCacheWarmStatus, checkAdminAuth, setAdminToken, getEloConfig, putEloConfig, triggerQbSync, getQbSyncStatus, getSeasons, triggerProbabilityBackfill } from '../api/client'

const ELO_DEFAULTS = { initialRating: 1500, k: 25, divisor: 400, movEnabled: true, marginCap: 28, homeFieldAdvantage: 0, offseasonRetention: 0.78 }

const ELO_FIELDS = [
  ['initialRating', 'Initial rating'],
  ['k', 'K factor'],
  ['divisor', 'Probability divisor'],
  ['marginCap', 'Margin cap (points)'],
  ['homeFieldAdvantage', 'Home-field advantage (Elo points)'],
  ['offseasonRetention', 'Retention (offseason and mid-season owner changes, 0–1)'],
]

function ProbabilityHistoryPanel() {
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState('')
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    getSeasons().then(list => { setSeasons(list); setSeason(String(list.at(-1) ?? '')) }).catch(() => {})
  }, [])

  const run = async () => {
    setRunning(true)
    setMessage(null)
    try {
      const r = await triggerProbabilityBackfill(Number(season))
      setMessage({ ok: true, text: `Saved ${r.created} week${r.created === 1 ? '' : 's'}; ${r.skipped} already saved.` })
    } catch {
      setMessage({ ok: false, text: 'Request failed' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mt-6 border border-line rounded p-5 space-y-3">
      <div>
        <p className="text-sm font-medium text-ink">Backfill playoff probability history</p>
        <p className="text-xs text-muted mt-1">
          Recreates the weekly playoff probability snapshots for earlier weeks of a season, using the Elo ratings as of each week.
          Never overwrites a saved week, so it is safe to run again. New weeks are saved automatically after each sync.
        </p>
      </div>
      <label className="text-sm block">Season
        <select className="field ml-2" aria-label="Season" value={season} onChange={e => setSeason(e.target.value)} disabled={running}>
          {seasons.map(s => <option key={s} value={s}>{s + 103} (index {s})</option>)}
        </select>
      </label>
      {message && <p className={`text-xs ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
      <button onClick={run} disabled={running || season === ''} className="btn w-full justify-center py-2">
        {running ? 'Backfilling...' : 'Backfill probability history'}
      </button>
    </div>
  )
}

function EloConfigPanel() {
  const [config, setConfig] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => { getEloConfig().then(setConfig).catch(() => setMessage({ ok: false, text: 'Failed to load Elo settings' })) }, [])

  const save = async e => {
    e.preventDefault()
    setMessage(null)
    try {
      setConfig(await putEloConfig(config))
      setMessage({ ok: true, text: 'Saved. Ratings recalculate from all games.' })
    } catch {
      setMessage({ ok: false, text: 'Rejected: check the values are in range.' })
    }
  }

  if (!config) return null

  return (
    <form onSubmit={save} className="mt-6 border border-line rounded p-5 space-y-3">
      <div>
        <p className="text-sm font-medium">Elo Settings</p>
        <p className="text-xs text-muted mt-1">Changing these recalculates every rating from the full game history.</p>
      </div>
      {ELO_FIELDS.map(([key, text]) => (
        <label key={key} className="flex items-center justify-between gap-3 text-sm">
          {text}
          <input
            type="number"
            step="any"
            className="field w-28 text-right"
            value={config[key]}
            onChange={e => setConfig({ ...config, [key]: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="flex items-center justify-between gap-3 text-sm">
        Margin-of-victory adjustment
        <input type="checkbox" className="accent-accent" checked={config.movEnabled} onChange={e => setConfig({ ...config, movEnabled: e.target.checked })} />
      </label>
      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1 justify-center py-2">Save</button>
        <button type="button" className="btn py-2" onClick={() => setConfig(ELO_DEFAULTS)}>Reset to defaults</button>
      </div>
    </form>
  )
}

function AdminTools() {
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [warmStatus, setWarmStatus] = useState(null)
  const [warming, setWarming] = useState(false)
  const [qbStatus, setQbStatus] = useState(null)
  const [qbSyncing, setQbSyncing] = useState(false)

  useEffect(() => {
    getSyncStatus().then(setStatus).catch(() => {})
    getCacheWarmStatus().then(setWarmStatus).catch(() => {})
    getQbSyncStatus().then(setQbStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!qbSyncing) return
    const id = setInterval(() => {
      getQbSyncStatus().then(s => {
        setQbStatus(s)
        if (!s.inProgress) setQbSyncing(false)
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [qbSyncing])

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

  const handleQbSync = async () => {
    if (!window.confirm(
      'Re-pull every QB and team game stat line from the passing, rushing, kicking, punting and team endpoints for all seasons.\n\n' +
      'This is several hundred API requests, grows with league history, and runs in the background.\n\nProceed?'
    )) return
    setQbSyncing(true)
    try {
      await triggerQbSync()
    } catch {
      setQbSyncing(false)
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

      <div className="mt-6 border border-line rounded p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">Re-sync Player & Team Stats</p>
          <p className="text-xs text-muted mt-1">
            Re-pulls every QB and team game line for all seasons from the passing, rushing, kicking, punting and team endpoints.
            Nightly sync only fetches new weeks, so use this after a schema or allocation change.
          </p>
        </div>
        {qbStatus?.completedAt && !qbStatus.inProgress && (
          <div>
            <p className="text-sm text-muted mb-0.5">Last QB sync</p>
            <p className="font-mono text-sm">{new Date(qbStatus.completedAt).toLocaleString()}</p>
            {qbStatus.message && (
              <p className={`text-xs mt-1 ${qbStatus.success ? 'text-good' : 'text-bad'}`}>
                {qbStatus.message}
              </p>
            )}
          </div>
        )}
        {qbStatus?.inProgress && (
          <p className="text-sm text-accent animate-pulse">{qbStatus.message}</p>
        )}
        <button
          onClick={handleQbSync}
          disabled={qbSyncing || syncing}
          className="btn w-full justify-center py-2"
        >
          {qbSyncing ? 'Syncing player & team stats...' : 'Re-sync Player & Team Stats'}
        </button>
      </div>

      <ProbabilityHistoryPanel />

      <EloConfigPanel />

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
