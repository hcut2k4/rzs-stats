import { useState, useEffect } from 'react'
import { getSeasons, getStandings } from '../api/client'
import * as XLSX from 'xlsx'
import { TeamCell } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'
import InfoTip from '../components/InfoTip'
import { goodBadColor, divergeColor } from '../utils/heat'
import { seasonLabel, seasonNumber } from '../utils/seasons'

export function buildStandingsRows(standings) {
  const headers = ['Rank', 'Team', 'W', 'L', 'T', 'Win%', 'Avg PF', 'Avg PA', 'PyPAT%', 'Luck', 'SoS (Played, Curr)']
  const rows = standings.map((r, i) => [
    i + 1,
    `${r.cityName} ${r.displayName}`,
    r.wins,
    r.losses,
    r.ties,
    r.winPct != null ? r.winPct.toFixed(3) : '',
    r.gamesPlayed > 0 ? (r.pointsFor / r.gamesPlayed).toFixed(1) : '',
    r.gamesPlayed > 0 ? (r.pointsAgainst / r.gamesPlayed).toFixed(1) : '',
    r.pythagoreanPat != null ? (r.pythagoreanPat * 100).toFixed(1) + '%' : '',
    r.winDiff != null ? (r.winDiff > 0 ? '+' : '') + r.winDiff.toFixed(1) : '',
    r.oppPyPatCurr != null ? (r.oppPyPatCurr * 100).toFixed(1) + '%' : '',
  ])
  return [headers, ...rows]
}

function exportCsv(standings, season) {
  const rows = buildStandingsRows(standings)
  const csv = rows.map(row => row.map(cell => {
    const s = String(cell)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `standings-season-${seasonNumber(season)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportExcel(standings, season) {
  const rows = buildStandingsRows(standings)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, seasonLabel(season))
  XLSX.writeFile(wb, `standings-season-${seasonNumber(season)}.xlsx`)
}

const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—'

export default function StandingsPage() {
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [standings, setStandings] = useState([])
  const [sortKey, setSortKey] = useState('pythagoreanPat')
  const [sortAsc, setSortAsc] = useState(false)
  const [groupByConf, setGroupByConf] = useState(false)
  const [sosMode, setSosMode] = useState('curr')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSeasons()
      .then(s => {
        setSeasons(s)
        if (s.length) {
          const defaultSeason = s[s.length - 1]
          setSeason(defaultSeason)
          // Default to prior season stats for the active/current season (insufficient games),
          // current season stats for all historical seasons (full data available)
          setSosMode(defaultSeason === s[s.length - 1] ? 'prev' : 'curr')
        }
      })
      .catch(() => setError('Failed to load seasons'))
  }, [])

  useEffect(() => {
    if (season == null) return
    setLoading(true)
    setError(null)
    getStandings(season)
      .then(data => { setStandings(data); setLoading(false) })
      .catch(() => { setError('Failed to load standings'); setLoading(false) })
  }, [season])

  const handleSort = key => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const isCurrentSeason = seasons.length > 0 && season === seasons[seasons.length - 1]

  const pfAvg = r => r.gamesPlayed > 0 ? r.pointsFor / r.gamesPlayed : 0
  const paAvg = r => r.gamesPlayed > 0 ? r.pointsAgainst / r.gamesPlayed : 0
  const sortGetters = { pointsFor: pfAvg, pointsAgainst: paAvg }

  const sorted = [...standings].sort((a, b) => {
    const getter = sortGetters[sortKey]
    const av = getter ? getter(a) : a[sortKey]
    const bv = getter ? getter(b) : b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const sosPrefix = sosMode === 'curr' ? 'Curr' : 'Prev'
  const sosSource = sosMode === 'curr' ? 'current season' : 'previous season'
  const sosCols = isCurrentSeason
    ? [
        { key: `oppPyPat${sosPrefix}`, label: 'Played', title: `Played SoS: avg opponent-adjusted PyPAT, ${sosSource}. Lower = easier schedule.` },
        { key: `oppPyPatRemaining${sosPrefix}`, label: 'Left', title: `Remaining SoS: future opponents' opponent-adjusted PyPAT, ${sosSource}.` },
        { key: `oppPyPatTotal${sosPrefix}`, label: 'Total', title: `Full-season SoS: all scheduled opponents, ${sosSource}.` },
      ]
    : [
        { key: `oppPyPat${sosPrefix}`, label: 'SoS', title: `Strength of Schedule: avg opponent-adjusted PyPAT, ${sosSource}. Lower = easier schedule.` },
      ]

  const COLS = [
    { key: 'rank',           label: '#',       fmt: (_, i) => i + 1, stickyLeft: 'left-0', w: 'w-10' },
    { key: 'displayName',    label: 'Team',    fmt: (v, _, row) => <TeamCell abbr={row.abbrName} name={`${row.cityName} ${row.displayName}`} />, stickyLeft: 'left-10' },
    { key: 'wins',           label: 'W', group: 'Record', groupStart: true },
    { key: 'losses',         label: 'L', group: 'Record' },
    { key: 'ties',           label: 'T', group: 'Record' },
    { key: 'winPct',         label: 'Win%',    fmt: v => v.toFixed(3), heat: 'higher', group: 'Record' },
    { key: 'pointsFor',      label: 'Avg PF', heat: 'higher', getValue: pfAvg, group: 'Scoring', groupStart: true,
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pointsAgainst',  label: 'Avg PA', heat: 'lower',  getValue: paAvg, group: 'Scoring',
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pythagoreanPat', label: 'PyPAT',   fmt: pct, heat: 'higher', group: 'Advanced', groupStart: true,
      title: 'PythagoreanPAT win expectancy' },
    { key: 'winDiff',        label: 'Luck', group: 'Advanced',
      fmt: v => v != null ? (v > 0 ? '+' : '') + v.toFixed(1) : '—',
      heat: 'diverge',
      title: 'Wins above PyPAT expectation. Positive = lucky (regression risk).' },
    ...sosCols.map((c, i) => ({ ...c, fmt: pct, heat: 'lower', group: 'Strength of schedule', groupStart: i === 0 })),
  ]

  const groupSpans = []
  for (const col of COLS) {
    const g = col.group ?? ''
    const last = groupSpans[groupSpans.length - 1]
    if (last && last.group === g && !col.groupStart) last.span++
    else groupSpans.push({ group: g, span: 1, start: col.groupStart })
  }

  const colValues = {}
  for (const col of COLS) {
    if (col.heat) colValues[col.key] = sorted.map(r => col.getValue ? col.getValue(r) : r[col.key])
  }

  const cellColor = (col, heatVal) => {
    if (col.heat === 'diverge') return divergeColor(heatVal)
    if (col.heat) return goodBadColor(heatVal, colValues[col.key] ?? [], col.heat)
    return undefined
  }

  const groups = groupByConf
    ? [
        { label: 'AFC', rows: sorted.filter(r => r.conference === 'AFC') },
        { label: 'NFC', rows: sorted.filter(r => r.conference === 'NFC') },
      ]
    : [{ label: null, rows: sorted }]

  const gamesLabel = standings.length ? `${Math.max(...standings.map(r => r.gamesPlayed))} games played` : null

  return (
    <div>
      <PageHeader
        title="Standings"
        qualifier={season != null ? `${seasonLabel(season)}${gamesLabel ? ` · ${gamesLabel}` : ''} · ranked by PyPAT` : null}
      >
        <select
          className="field"
          value={season ?? ''}
          onChange={e => {
            const newSeason = Number(e.target.value)
            setSeason(newSeason)
            setSosMode(newSeason === seasons[seasons.length - 1] ? 'prev' : 'curr')
          }}
        >
          {seasons.map(s => (
            <option key={s} value={s}>Season {seasonNumber(s)}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={groupByConf}
            onChange={e => setGroupByConf(e.target.checked)}
            className="accent-accent"
          />
          Group by conference
        </label>

        <div className="flex items-center gap-2 text-sm">
          <InfoTip text="SoS is calculated using opponent-adjusted PyPAT — each opponent's quality is measured without their games against the team being evaluated, so H2H results don't inflate their rating. Previous season is more reliable early in the current season before enough games have been played to produce accurate team ratings.">
            <span className="text-muted">SoS opponent PyPAT</span>
          </InfoTip>
          <div className="flex border border-line rounded overflow-hidden">
            {[['curr', 'This season'], ['prev', 'Prior season']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSosMode(mode)}
                className={`px-2 py-1 text-xs font-medium ${sosMode === mode ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {error && <div className="text-bad mb-4">{error}</div>}
      {loading && <div className="text-muted">Loading...</div>}

      {!loading && !error && groups.map(group => (
        <div key={group.label ?? 'all'} className="mb-8">
          <div className="flex items-center justify-between mb-1 min-h-[1.5rem]">
            {group.label
              ? <h2 className="font-display font-bold uppercase text-xl">{group.label}</h2>
              : <span />}
            {standings.length > 0 && (
              <div className="hidden sm:flex items-center gap-1">
                <button onClick={() => exportCsv(sorted, season)} title="Export CSV" className="px-2 py-1 text-xs text-muted hover:text-ink">
                  CSV
                </button>
                <button onClick={() => exportExcel(sorted, season)} title="Export Excel" className="px-2 py-1 text-xs text-muted hover:text-ink">
                  Excel
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto border-y border-rule">
            <table className="w-full text-sm num">
              <thead className="bg-bg">
                <tr className="border-b border-line">
                  {groupSpans.map((g, i) => (
                    <th
                      key={i}
                      colSpan={g.span}
                      className={`px-2 pt-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink ${g.start ? 'border-l border-rule' : ''}`}
                    >
                      {g.group}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-rule">
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className={`th cursor-pointer hover:text-ink${
                        col.stickyLeft ? ` sticky ${col.stickyLeft} z-20 bg-bg ${col.w ?? ''}` : ''
                      }${col.groupStart ? ' border-l border-rule' : ''}`}
                      title={col.title}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && (sortAsc ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => (
                  <tr key={row.teamId} className={`border-t border-line group ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                    {COLS.map(col => {
                      const val = row[col.key]
                      const heatVal = col.getValue ? col.getValue(row) : val
                      const bgColor = cellColor(col, heatVal)
                      return (
                        <td
                          key={col.key}
                          className={`px-2 py-1.5 whitespace-nowrap${
                            col.stickyLeft ? ` sticky ${col.stickyLeft} z-10 ${i % 2 ? 'bg-surface' : 'bg-bg'} ${col.w ?? ''}` : ''
                          }${col.groupStart ? ' border-l border-rule' : ''}${col.key === 'displayName' ? ' font-semibold' : ''}${col.stickyLeft && col.key !== 'rank' ? ' border-r border-line' : ''}`}
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
          <p className="text-xs text-muted mt-2">
            Green = better, red = worse (lower is better for Avg PA and SoS). Luck: blue = won more than expected, orange = fewer.
          </p>
        </div>
      ))}
    </div>
  )
}
