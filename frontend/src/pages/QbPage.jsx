import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import { getSeasons, getAvailableWeeks, getQbLeaderboard, getQbMovement } from '../api/client'
import { TeamLogo } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'
import InfoTip from '../components/InfoTip'
import Tabs from '../components/Tabs'
import { goodBadColor, divergeColor } from '../utils/heat'
import { COLORS } from '../utils/chartColors'

const n2 = v => v != null ? v.toFixed(2) : '—'
const n1 = v => v != null ? v.toFixed(1) : '—'
const signed2 = v => v != null ? (v > 0 ? '+' : '') + v.toFixed(2) : '—'
const pct1 = v => v != null ? (v * 100).toFixed(1) + '%' : '—'

const PRESETS = [
  { value: 'efficiency', label: 'Efficiency' },
  { value: 'classic', label: 'Classic' },
  { value: 'rushing', label: 'Rushing' },
  { value: 'all', label: 'All' },
]

const SCOPES = [
  { value: 'week', label: 'Week' },
  { value: 'season', label: 'Season' },
  { value: 'alltime', label: 'All-time' },
]

const STAGES = [
  { value: 'regular', label: 'Regular' },
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'both', label: 'Both' },
]

const TANYA_TIP = 'Total Adjusted Net Yards per Attempt. (PassYds − SackYds + RushYds + 20×(PassTD + RushTD) − 45×(INT + FumblesLost)) ÷ (Att + Sacks + RushAtt). Rushing counts in both the numerator and the denominator, so volume alone does not inflate it.'
const RUSHPLUS_TIP = 'Adjusted QB rushing production above a baseline of 4 yards per carry, including rushing touchdowns and estimated lost fumbles, normalized per passing opportunity. All estimated QB fumbles lost are charged to rushing because passing and rushing fumbles cannot be distinguished.'
const EST_TIP = 'Estimated. Madden does not expose individual sack yardage or lost fumbles, so each is allocated from the team game total — sack yards by share of sacks taken, lost fumbles by share of team fumbles.'

// Column order defines the table; `presets` controls which views show it.
const ALL_COLS = [
  { key: 'rank', label: '#', fmt: (_, i, row) => row.rank ?? i + 1, stickyLeft: 'left-0', w: 'w-10', presets: ['efficiency', 'classic', 'rushing', 'all'], sortable: false },
  { key: 'rankChange', label: 'Move', presets: ['efficiency', 'classic', 'rushing', 'all'], fmt: v => <Move value={v} /> },
  {
    key: 'playerName', label: 'QB', stickyLeft: 'left-10', presets: ['efficiency', 'classic', 'rushing', 'all'],
    fmt: (v, _, row) => (
      <span className="flex items-center gap-2">
        <TeamLogo abbr={row.teamAbbr} size={20} />
        <span className="font-semibold">{v}</span>
        <span className="text-muted text-xs">{row.teamAbbr}</span>
      </span>
    ),
  },
  { key: 'gamesPlayed', label: 'GP', presets: ['efficiency', 'classic', 'rushing', 'all'], group: 'Volume', groupStart: true },
  { key: 'passAtt', label: 'Att', presets: ['efficiency', 'classic', 'rushing', 'all'], group: 'Volume' },
  { key: 'tanya', label: 'TANY/A', fmt: n2, heat: 'higher', presets: ['efficiency', 'classic', 'rushing', 'all'], group: 'Efficiency', groupStart: true, title: TANYA_TIP },
  { key: 'anya', label: 'ANY/A', fmt: n2, heat: 'higher', presets: ['efficiency', 'all'], group: 'Efficiency', title: 'Adjusted Net Yards per Attempt — passing only, no fumble term. The classic benchmark.' },
  { key: 'rushValue', label: 'RUSH+', fmt: v => <RushPlus value={v} />, presets: ['efficiency', 'rushing', 'all'], group: 'Efficiency', title: RUSHPLUS_TIP },
  { key: 'passerRating', label: 'Rating', fmt: n1, heat: 'higher', presets: ['classic', 'all'], group: 'Efficiency' },
  { key: 'passComp', label: 'Cmp', presets: ['classic', 'all'], group: 'Passing', groupStart: true },
  { key: 'passYds', label: 'Yds', heat: 'higher', presets: ['classic', 'all'], group: 'Passing' },
  { key: 'passTd', label: 'TD', heat: 'higher', presets: ['classic', 'all'], group: 'Passing' },
  { key: 'passInt', label: 'INT', heat: 'lower', presets: ['classic', 'all'], group: 'Passing' },
  { key: 'tdPct', label: 'TD%', fmt: pct1, heat: 'higher', presets: ['classic', 'all'], group: 'Passing' },
  { key: 'intPct', label: 'INT%', fmt: pct1, heat: 'lower', presets: ['classic', 'all'], group: 'Passing' },
  { key: 'tdToInt', label: 'TD:INT', fmt: v => v != null ? v.toFixed(1) : 'n/a', heat: 'higher', presets: ['classic', 'all'], group: 'Passing' },
  { key: 'passSacks', label: 'Sk', heat: 'lower', presets: ['classic', 'all'], group: 'Pressure', groupStart: true },
  { key: 'sackYardsLost', label: '~SkYd', fmt: n1, heat: 'lower', presets: ['classic', 'all'], group: 'Pressure', title: EST_TIP },
  { key: 'fumblesLost', label: '~FL', fmt: n1, heat: 'lower', presets: ['classic', 'all'], group: 'Pressure', title: EST_TIP },
  { key: 'rushAtt', label: 'Att', presets: ['rushing', 'all'], group: 'Rushing', groupStart: true },
  { key: 'rushYds', label: 'Yds', heat: 'higher', presets: ['rushing', 'all'], group: 'Rushing' },
  { key: 'rushYdsPerAtt', label: 'YPC', fmt: n1, heat: 'higher', presets: ['rushing', 'all'], group: 'Rushing' },
  { key: 'rushTd', label: 'TD', heat: 'higher', presets: ['rushing', 'all'], group: 'Rushing' },
]

function RushPlus({ value }) {
  if (value == null) return <span className="text-muted">—</span>
  const tone = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : ''
  return <span className={tone}>{signed2(value)}</span>
}

function Move({ value }) {
  if (value == null) return <span className="text-muted text-xs">new</span>
  if (value === 0) return <span className="text-muted">—</span>
  const up = value > 0
  return (
    <span className={up ? 'text-good' : 'text-bad'}>
      {up ? '▲' : '▼'}{Math.abs(value)}
    </span>
  )
}

export function buildQbRows(rows) {
  const headers = ['Rank', 'QB', 'Team', 'GP', 'Att', 'TANY/A', 'ANY/A', 'RUSH+', 'Rating', 'Cmp', 'Yds', 'TD', 'INT',
    'TD%', 'INT%', 'TD:INT', 'Sacks', 'Est Sack Yds', 'Est Fumbles Lost', 'Rush Att', 'Rush Yds', 'YPC', 'Rush TD']
  const body = rows.map((r, i) => [
    r.rank ?? i + 1, r.playerName, r.teamAbbr, r.gamesPlayed, r.passAtt,
    n2(r.tanya), n2(r.anya), signed2(r.rushValue), n1(r.passerRating),
    r.passComp, r.passYds, r.passTd, r.passInt,
    pct1(r.tdPct), pct1(r.intPct), r.tdToInt != null ? r.tdToInt.toFixed(1) : 'n/a',
    r.passSacks, n1(r.sackYardsLost), n1(r.fumblesLost),
    r.rushAtt, r.rushYds, n1(r.rushYdsPerAtt), r.rushTd,
  ])
  return [headers, ...body]
}

function exportCsv(rows, label) {
  const csv = buildQbRows(rows).map(row => row.map(cell => {
    const s = String(cell ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `qb-stats-${label}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportExcel(rows, label) {
  const ws = XLSX.utils.aoa_to_sheet(buildQbRows(rows))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'QB Stats')
  XLSX.writeFile(wb, `qb-stats-${label}.xlsx`)
}

function Leaderboard({ rows, preset, sortKey, sortAsc, onSort, scopeLabel }) {
  const cols = ALL_COLS.filter(c => c.presets.includes(preset))

  const groupSpans = []
  for (const col of cols) {
    const g = col.group ?? ''
    const last = groupSpans[groupSpans.length - 1]
    if (last && last.group === g && !col.groupStart) last.span++
    else groupSpans.push({ group: g, span: 1, start: col.groupStart })
  }

  const colValues = {}
  for (const col of cols) {
    if (col.heat) colValues[col.key] = rows.filter(r => r.qualified !== false).map(r => r[col.key])
  }

  const cellColor = (col, val, row) => {
    if (row.qualified === false) return undefined
    if (col.heat === 'diverge') return divergeColor(val, col.divergeLimit ?? 3)
    if (col.heat) return goodBadColor(val, colValues[col.key] ?? [], col.heat)
    return undefined
  }

  return (
    <>
      <div className="flex items-center justify-end mb-1 min-h-[1.5rem]">
        {rows.length > 0 && (
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => exportCsv(rows, scopeLabel)} title="Export CSV" className="px-2 py-1 text-xs text-muted hover:text-ink">CSV</button>
            <button onClick={() => exportExcel(rows, scopeLabel)} title="Export Excel" className="px-2 py-1 text-xs text-muted hover:text-ink">Excel</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead className="bg-bg">
            <tr className="border-b border-line">
              {groupSpans.map((g, i) => (
                <th key={i} colSpan={g.span} className={`px-2 pt-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink ${g.start ? 'border-l border-rule' : ''}`}>
                  {g.group}
                </th>
              ))}
            </tr>
            <tr className="border-b border-rule">
              {cols.map(col => (
                <th
                  key={col.key}
                  className={`th${col.sortable === false ? '' : ' cursor-pointer hover:text-ink'}${
                    col.stickyLeft ? ` sticky ${col.stickyLeft} z-20 bg-bg ${col.w ?? ''}` : ''
                  }${col.groupStart ? ' border-l border-rule' : ''}`}
                  title={col.title}
                  onClick={() => col.sortable !== false && onSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (sortAsc ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.rosterId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}${row.qualified === false ? ' opacity-50' : ''}`}>
                {cols.map(col => {
                  const val = row[col.key]
                  const bgColor = cellColor(col, val, row)
                  return (
                    <td
                      key={col.key}
                      className={`px-2 py-1.5 whitespace-nowrap${
                        col.stickyLeft ? ` sticky ${col.stickyLeft} z-10 ${i % 2 ? 'bg-surface' : 'bg-bg'} ${col.w ?? ''}` : ''
                      }${col.groupStart ? ' border-l border-rule' : ''}${col.stickyLeft && col.key !== 'rank' ? ' border-r border-line' : ''}`}
                      style={bgColor ? { backgroundColor: bgColor } : undefined}
                    >
                      {col.fmt ? col.fmt(val, i, row) : val ?? '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="text-muted py-6">No qualifying quarterbacks for this scope.</p>}
      <p className="text-xs text-muted mt-2">
        Green = better, red = worse. RUSH+ is adjusted rushing production per passing opportunity, above a 4-yard-per-carry baseline. ~ marks an estimated value. Faded rows are below the attempt minimum.
      </p>
    </>
  )
}

function MoverList({ title, rows, direction }) {
  return (
    <div>
      <h3 className="font-display font-bold uppercase text-lg mb-2">{title}</h3>
      {rows.length === 0 && <p className="text-muted text-sm">Not enough data yet.</p>}
      <div className="border-y border-rule divide-y divide-line">
        {rows.map(r => (
          <div key={r.rosterId} className="flex items-center gap-3 py-2 px-1">
            <span className={`num font-semibold w-12 ${direction === 'up' ? 'text-good' : 'text-bad'}`}>
              {direction === 'up' ? '▲' : '▼'}{Math.abs(r.rankChange)}
            </span>
            <TeamLogo abbr={r.teamAbbr} size={20} />
            <span className="font-semibold flex-1 truncate">{r.playerName}</span>
            <span className="num text-sm text-muted">#{r.rank}</span>
            <span className="num text-sm w-14 text-right">{n2(r.tanya)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Movement({ data, loading }) {
  const [hidden, setHidden] = useState({})
  if (loading) return <div className="text-muted">Loading...</div>
  if (!data) return null

  const series = data.series ?? []
  const weeks = [...new Set(series.flatMap(s => (s.ranks ?? []).map(p => p.week)))].sort((a, b) => a - b)
  const chartData = weeks.map(week => {
    const point = { week: `W${week + 1}` }
    for (const s of series) {
      const hit = (s.ranks ?? []).find(p => p.week === week)
      if (hit) point[s.rosterId] = hit.rank
    }
    return point
  })
  const maxRank = Math.max(1, ...series.flatMap(s => (s.ranks ?? []).map(p => p.rank)))

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 gap-6">
        <MoverList title="Risers" rows={data.risers ?? []} direction="up" />
        <MoverList title="Fallers" rows={data.fallers ?? []} direction="down" />
      </div>

      {series.length > 0 && (
        <div>
          <h3 className="font-display font-bold uppercase text-lg mb-1">Rank by week</h3>
          <p className="text-xs text-muted mb-3">Cumulative TANY/A rank through each week. Click a name to show or hide it.</p>
          <div className="h-96 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="rgb(var(--muted))" />
                <YAxis reversed domain={[1, maxRank]} allowDecimals={false} tick={{ fontSize: 12 }} stroke="rgb(var(--muted))" width={32} />
                <RTooltip
                  contentStyle={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--line))', fontSize: 12 }}
                  formatter={(value, key) => [`#${value}`, series.find(s => s.rosterId === key)?.playerName ?? key]}
                />
                {series.map((s, i) => !hidden[s.rosterId] && (
                  <Line
                    key={s.rosterId}
                    type="monotone"
                    dataKey={s.rosterId}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {series.map((s, i) => (
              <button
                key={s.rosterId}
                onClick={() => setHidden(h => ({ ...h, [s.rosterId]: !h[s.rosterId] }))}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs border border-line rounded ${hidden[s.rosterId] ? 'opacity-40' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                {s.playerName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function QbPage() {
  const [tab, setTab] = useState('leaderboard')
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [weeks, setWeeks] = useState([])
  const [week, setWeek] = useState(null)
  const [scope, setScope] = useState('season')
  const [stage, setStage] = useState('regular')
  const [preset, setPreset] = useState('efficiency')
  const [minAtt, setMinAtt] = useState('')
  const [includeUnqualified, setIncludeUnqualified] = useState(false)
  const [rows, setRows] = useState([])
  const [movement, setMovement] = useState(null)
  const [sortKey, setSortKey] = useState('tanya')
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSeasons()
      .then(s => {
        setSeasons(s)
        if (s.length) setSeason(s[s.length - 1])
      })
      .catch(() => setError('Failed to load seasons'))
  }, [])

  useEffect(() => {
    if (season == null) return
    getAvailableWeeks(season, 1)
      .then(w => {
        setWeeks(w)
        if (w.length) setWeek(prev => (prev != null && w.includes(prev) ? prev : w[w.length - 1]))
      })
      .catch(() => setWeeks([]))
  }, [season])

  useEffect(() => {
    if (tab !== 'leaderboard') return
    if (scope !== 'alltime' && season == null) return
    if (scope === 'week' && week == null) return
    setLoading(true)
    setError(null)
    getQbLeaderboard({
      scope,
      season: scope === 'alltime' ? undefined : season,
      week: scope === 'week' ? week : undefined,
      stage,
      minAtt: minAtt === '' ? undefined : Number(minAtt),
      includeUnqualified,
    })
      .then(setRows)
      .catch(() => setError('Failed to load QB stats'))
      .finally(() => setLoading(false))
  }, [tab, scope, season, week, stage, minAtt, includeUnqualified])

  useEffect(() => {
    if (tab !== 'movement' || season == null) return
    setLoading(true)
    setError(null)
    getQbMovement({ season, stage })
      .then(setMovement)
      .catch(() => setError('Failed to load movement'))
      .finally(() => setLoading(false))
  }, [tab, season, stage])

  const handleSort = key => {
    if (key === sortKey) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const scopeLabel = scope === 'alltime'
    ? 'all-time'
    : scope === 'week'
      ? `${season + 2026}-week-${week != null ? week + 1 : ''}`
      : `season-${season + 2026}`

  const qualifier = scope === 'alltime'
    ? 'All seasons · min 250 attempts'
    : scope === 'week'
      ? `Season ${season + 2026} · Week ${week != null ? week + 1 : '—'} · min 10 attempts`
      : `Season ${season + 2026} · min 10 attempts per team game`

  return (
    <div>
      <PageHeader
        title="Quarterbacks"
        qualifier={`${qualifier} · ranked by TANY/A`}
        takeaway="TANY/A folds a quarterback's rushing into his passing efficiency, so scramblers and pocket passers sit on one scale."
      >
        <div className="flex border border-line rounded overflow-hidden">
          {SCOPES.map(s => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={`px-2 py-1 text-xs font-medium ${scope === s.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scope !== 'alltime' && (
          <select className="field" value={season ?? ''} onChange={e => setSeason(Number(e.target.value))}>
            {seasons.map(s => <option key={s} value={s}>Season {s + 2026}</option>)}
          </select>
        )}

        {scope === 'week' && (
          <select className="field" value={week ?? ''} onChange={e => setWeek(Number(e.target.value))}>
            {weeks.map(w => <option key={w} value={w}>Week {w + 1}</option>)}
          </select>
        )}

        <div className="flex border border-line rounded overflow-hidden">
          {STAGES.map(s => (
            <button
              key={s.value}
              onClick={() => setStage(s.value)}
              className={`px-2 py-1 text-xs font-medium ${stage === s.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <Tabs
        tabs={[{ value: 'leaderboard', label: 'Leaderboard' }, { value: 'movement', label: 'Movement' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'leaderboard' && (
        <div className="flex items-center gap-4 flex-wrap mb-4">
          <div className="flex border border-line rounded overflow-hidden">
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`px-2 py-1 text-xs font-medium ${preset === p.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <InfoTip text="Minimum pass attempts to qualify. Leave blank for the default for this scope.">
              <span className="text-muted">Min att</span>
            </InfoTip>
            <input
              type="number"
              min="0"
              value={minAtt}
              onChange={e => setMinAtt(e.target.value)}
              placeholder="default"
              className="field w-24"
            />
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includeUnqualified}
              onChange={e => setIncludeUnqualified(e.target.checked)}
              className="accent-accent"
            />
            Show unqualified
          </label>
        </div>
      )}

      {error && <div className="text-bad mb-4">{error}</div>}
      {loading && <div className="text-muted">Loading...</div>}

      {!loading && !error && tab === 'leaderboard' && (
        <Leaderboard
          rows={sorted}
          preset={preset}
          sortKey={sortKey}
          sortAsc={sortAsc}
          onSort={handleSort}
          scopeLabel={scopeLabel}
        />
      )}

      {!loading && !error && tab === 'movement' && <Movement data={movement} loading={false} />}
    </div>
  )
}
