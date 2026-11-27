import { useState, useEffect, useRef, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import { triggerSync, triggerForceSync, getAdminStatus, triggerCacheWarm, checkAdminAuth, setAdminToken, getEloConfig, putEloConfig, triggerQbSync, getSeasons, triggerProbabilityBackfill, putSyncSettings } from '../api/client'

const ELO_DEFAULTS = { initialRating: 1500, k: 25, divisor: 400, movEnabled: true, marginCap: 28, homeFieldAdvantage: 0, offseasonRetention: 0.78 }
const ELO_FIELDS = [
  ['initialRating', 'Initial rating'], ['k', 'K factor'], ['divisor', 'Probability divisor'],
  ['marginCap', 'Margin cap (points)'], ['homeFieldAdvantage', 'Home-field advantage (Elo points)'],
  ['offseasonRetention', 'Retention (offseason and mid-season owner changes, 0–1)'],
]
const INTERVALS = [[0, 'Off'], [5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h'], [360, '6 h']]
const errorText = e => typeof e.response?.data === 'string' && e.response.data ? e.response.data : e.response?.data?.message || e.response?.data?.detail || e.message || 'Request failed'
const busy = s => s?.pipeline?.inProgress

function relative(time, now, empty = 'Never') {
  if (!time) return empty
  const seconds = Math.round((new Date(time).getTime() - now) / 1000)
  const amount = Math.abs(seconds)
  const value = amount < 60 ? `${amount}s` : amount < 3600 ? `${Math.floor(amount / 60)} min` : amount < 86400 ? `${Math.floor(amount / 3600)} h` : `${Math.floor(amount / 86400)} d`
  return seconds > 0 ? `in ${value}` : `${value} ago`
}

function duration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function useAdminStatus() {
  const [data, setData] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [error, setError] = useState(null)
  const refreshRef = useRef(() => {})
  const fastUntil = useRef(0)
  useEffect(() => {
    let active = true, timer, loading = false, queued = false
    let latest, controller
    const refresh = async () => {
      clearTimeout(timer)
      if (!active || document.hidden) return
      if (loading) { queued = true; return }
      loading = true
      try {
        controller = new AbortController()
        const next = await getAdminStatus(controller.signal)
        if (active) { latest = next; setData(next); setUpdatedAt(Date.now()); setError(null) }
      } catch (e) { if (active) setError(errorText(e)) }
      finally {
        loading = false
        if (active && !document.hidden) {
          if (queued) { queued = false; refresh() }
          else timer = setTimeout(refresh, busy(latest) || Date.now() < fastUntil.current ? 2000 : 10000)
        }
      }
    }
    const visibility = () => { if (document.hidden) clearTimeout(timer); else refresh() }
    refreshRef.current = refresh
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visibility)
    return () => { active = false; controller?.abort(); clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  const refresh = useCallback(() => { fastUntil.current = Date.now() + 6000; refreshRef.current() }, [])
  return { data, updatedAt, error, refresh, setSettings: settings => setData(previous => ({ ...previous, settings })) }
}

function Section({ title, description, children }) {
  return <section className="border border-line rounded p-5 space-y-4">
    <div><h2 className="text-xs uppercase tracking-widest font-semibold">{title}</h2><p className="text-sm text-muted mt-1">{description}</p></div>
    {children}
  </section>
}

function EloConfigPanel({ run, locked }) {
  const [config, setConfig] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)
  useEffect(() => { getEloConfig().then(c => { setConfig(c); setSaved(c) }).catch(e => setLoadError(errorText(e))) }, [])
  if (!config) return <Section title="Elo model" description="Saving recalculates all ratings from the full game history."><p className={loadError ? 'text-bad' : 'text-muted'}>{loadError || 'Loading…'}</p></Section>
  const changed = Object.keys(ELO_DEFAULTS).some(key => config[key] !== saved[key])
  return <Section title="Elo model" description="Saving recalculates all ratings from the full game history.">
    <form className="space-y-3" onSubmit={async e => {
      e.preventDefault(); setSaving(true)
      await run(async () => { const c = await putEloConfig(config); setConfig(c); setSaved(c); return { message: 'Saved. Ratings recalculate from all games.' } })
      setSaving(false)
    }}>
      {ELO_FIELDS.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 text-sm">
        <div><label htmlFor={`elo-${key}`}>{label}</label>{config[key] !== ELO_DEFAULTS[key] && <p className="text-xs text-muted">Default: {ELO_DEFAULTS[key]}</p>}</div>
        <input id={`elo-${key}`} type="number" step="any" className="field w-28 text-right" value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value === '' ? '' : Number(e.target.value) })} />
      </div>)}
      <div className="flex justify-between text-sm"><div><label htmlFor="elo-mov">Margin-of-victory adjustment</label>{config.movEnabled !== ELO_DEFAULTS.movEnabled && <p className="text-xs text-muted">Default: On</p>}</div>
        <input id="elo-mov" type="checkbox" checked={config.movEnabled} onChange={e => setConfig({ ...config, movEnabled: e.target.checked })} />
      </div>
      <div className="flex gap-2"><button className="btn-primary" disabled={!changed || saving || locked}>Save</button><button type="button" className="btn" disabled={saving} onClick={() => setConfig({ ...ELO_DEFAULTS })}>Reset to defaults</button></div>
    </form>
  </Section>
}

function AdminTools() {
  const { data, updatedAt, error, refresh, setSettings } = useAdminStatus()
  const [now, setNow] = useState(Date.now())
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [qbSeason, setQbSeason] = useState('')
  const [historySeason, setHistorySeason] = useState('')
  const [custom, setCustom] = useState(false)
  const [intervalInput, setIntervalInput] = useState('')
  const { pipeline = {}, qb = {}, warm = {}, settings } = data || {}
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => { getSeasons().then(list => { setSeasons(list); setHistorySeason(String(list.at(-1) ?? '')) }).catch(e => setMessage({ ok: false, text: errorText(e) })) }, [])
  useEffect(() => { if (settings) setIntervalInput(String(settings.intervalMinutes)) }, [settings?.intervalMinutes])
  const run = async action => {
    setPending(true); setMessage(null); refresh()
    try { const result = await action(); if (result?.message) setMessage({ ok: true, text: result.message }) }
    catch (e) { setMessage({ ok: false, text: errorText(e) }) }
    finally { setPending(false); refresh() }
  }
  const stale = updatedAt && now - updatedAt > 20000
  const disconnected = error || stale
  const locked = pending || pipeline.inProgress
  const operation = pipeline.operation || 'Sync'
  const repair = (key, action, needsConfirm = true) => {
    if (needsConfirm && confirm !== key) { setConfirm(key); return }
    setConfirm(null); run(action)
  }
  const confirmButton = (key, title, action, needsConfirm = true) => <div className="flex gap-2 items-center">
    <button className="btn" disabled={locked} onClick={() => repair(key, action, needsConfirm)}>{confirm === key ? 'Confirm ' + title.toLowerCase() : title}</button>
    {confirm === key && <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>}
  </div>
  const saveInterval = value => run(async () => { const saved = await putSyncSettings(Number(value)); setSettings(saved); setIntervalInput(String(saved.intervalMinutes)); setCustom(!INTERVALS.some(([n]) => n === saved.intervalMinutes)) })
  const preset = custom || (settings && !INTERVALS.some(([n]) => n === settings.intervalMinutes)) ? 'custom' : String(settings?.intervalMinutes ?? 0)
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Admin" qualifier="Data, maintenance and model settings" />
      <section className="border border-line rounded p-5 space-y-3" aria-label="Live status">
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${disconnected ? 'bg-bad' : 'bg-good'}`} />
          {updatedAt ? `Updated ${Math.max(0, Math.floor((now - updatedAt) / 1000))}s ago` : 'Connecting'}
          {disconnected ? <span className="text-bad">{error ? 'Disconnected' : 'Stale'}</span> : updatedAt && <span className="text-good">Live</span>}
        </p>
        {busy(data) ? (
          <div>
            <p className="font-medium text-accent">{operation}</p>
            <p className="text-sm mt-1">{warm.inProgress ? warm.message : qb.inProgress ? qb.message : pipeline.message}</p>
            <p className="text-xs text-muted mt-1">
              Elapsed {duration(now - new Date(pipeline.startedAt || now).getTime())}
            </p>
          </div>
        ) : (
          <div>
            <p className={pipeline.success === false ? 'text-bad' : pipeline.success ? 'text-good' : 'text-muted'}>
              {pipeline.operation ? `${pipeline.operation} · ${pipeline.success === false ? 'Failed' : 'Completed'}` : 'No runs yet'}
            </p>
            {pipeline.operation && <p className="text-xs text-muted mt-1">Last run {relative(pipeline.completedAt, now)}</p>}
            {pipeline.success === false && pipeline.message && <p className="text-sm mt-1">{pipeline.message}</p>}
          </div>
        )}
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          {[['Data last changed', settings?.lastChangedAt], ['Last checked', settings?.lastCheckedAt], ['Next auto-check', settings?.nextRunAt]].map(([label, time]) => (
            <div key={label}>
              <dt className="text-muted text-xs">{label}</dt>
              <dd>{relative(time, now, label === 'Next auto-check' ? settings ? 'Off' : 'Loading…' : 'Never')}</dd>
            </div>
          ))}
        </dl>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </section>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded p-3 text-sm ${message.ok ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>{message.text}</p>}
      {pipeline.inProgress && <p className="text-sm text-muted">Waiting for {operation} to finish</p>}
      <Section title="Sync" description="Check for new games and refresh data from NeonSportz.">
        <button className="btn-primary" disabled={locked} onClick={() => run(triggerSync)}>Sync now</button>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="sync-interval">Auto-sync interval</label>
          <select id="sync-interval" className="field" value={preset} disabled={!settings || pending} onChange={e => {
            if (e.target.value === 'custom') {
              setCustom(true)
              setIntervalInput(String(settings.intervalMinutes))
            } else {
              setCustom(false)
              saveInterval(e.target.value)
            }
          }}>
            {INTERVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            <option value="custom">Custom</option>
          </select>
          {preset === 'custom' && (
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); saveInterval(intervalInput) }}>
              <input aria-label="Custom interval in minutes" className="field w-24" type="number" min="0" max="10080" step="1" value={intervalInput} onChange={e => setIntervalInput(e.target.value)} />
              <button className="btn" disabled={pending || intervalInput === '' || !Number.isInteger(Number(intervalInput)) || Number(intervalInput) < 0 || Number(intervalInput) > 10080}>Save interval</button>
            </form>
          )}
        </div>
        <p className="text-xs text-muted">Full reconciliation runs nightly at 4am ET. Custom intervals are 0–10080 minutes.</p>
      </Section>
      <Section title="Maintenance" description="Occasional upkeep after a deploy or when numbers look stale.">
        <p className="text-sm text-muted">Clears and rebuilds all cached stats.</p>
        <button className="btn" disabled={locked} onClick={() => run(triggerCacheWarm)}>Rebuild caches</button>
      </Section>
      <Section title="Repairs & backfills" description="Rare, heavy operations. Use these to repair missing or incorrect historical data.">
        <div className="border-l-2 border-bad/30 pl-4 space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Re-sync all seasons</h3>
            <p className="text-sm text-muted">Re-pulls every season, including data already saved. Can take up to 30 minutes.</p>
            {confirmButton('force', 'Re-sync all seasons', triggerForceSync)}
          </div>
          <div className="border-t border-line pt-4 space-y-2">
            <h3 className="text-sm font-medium">Re-sync player & team stats</h3>
            <p className="text-sm text-muted">Replaces player and team game stats for the selected seasons, then rebuilds caches.</p>
            <label className="text-sm">Stats season{' '}
              <select aria-label="Stats season" className="field" value={qbSeason} disabled={locked} onChange={e => { setQbSeason(e.target.value); setConfirm(null) }}>
                <option value="">All seasons</option>
                {seasons.map(s => <option key={s} value={s}>Season {s + 103}</option>)}
              </select>
            </label>
            {confirmButton('qb', 'Re-sync player & team stats', () => triggerQbSync(qbSeason === '' ? undefined : Number(qbSeason)), qbSeason === '')}
          </div>
          <div className="border-t border-line pt-4 space-y-2">
            <h3 className="text-sm font-medium">Backfill probability history</h3>
            <p className="text-sm text-muted">Recreates missing weekly playoff probability snapshots. Keeps saved weeks.</p>
            <label className="text-sm">Season{' '}
              <select aria-label="Season" className="field" value={historySeason} disabled={locked} onChange={e => setHistorySeason(e.target.value)}>
                {seasons.map(s => <option key={s} value={s}>Season {s + 103}</option>)}
              </select>
            </label>
            <button className="btn block" disabled={locked || historySeason === ''} onClick={() => run(async () => {
              const r = await triggerProbabilityBackfill(Number(historySeason))
              return { message: `Saved ${r.created} week${r.created === 1 ? '' : 's'}; ${r.skipped} already saved.` }
            })}>Backfill probability history</button>
          </div>
        </div>
      </Section>
      <EloConfigPanel run={run} locked={locked} />
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

  useEffect(() => {
    const unauthorized = () => { setPasscode(''); setAuthed(false) }
    window.addEventListener('admin-unauthorized', unauthorized)
    check()
    return () => window.removeEventListener('admin-unauthorized', unauthorized)
  }, [])

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
