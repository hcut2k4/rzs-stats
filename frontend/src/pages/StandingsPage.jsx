import { useState, useEffect } from 'react'
import { getSeasons, getStandings } from '../api/client'
import * as XLSX from 'xlsx'

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
  a.download = `standings-season-${season + 2025}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportExcel(standings, season) {
  const rows = buildStandingsRows(standings)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Season ${season + 2025}`)
  XLSX.writeFile(wb, `standings-season-${season + 2025}.xlsx`)
}

function heatColor(value, allValues, direction) {
  if (value == null || isNaN(value)) return undefined
  const vals = allValues.filter(v => v != null && !isNaN(v))
  if (vals.length < 2) return undefined
  const min = Math.min(...vals), max = Math.max(...vals)
  if (max === min) return undefined
  let t = (value - min) / (max - min)
  if (direction === 'lower') t = 1 - t
  return `hsl(${Math.round(t * 120)}, 55%, 18%)`
}

function divergeColor(value) {
  if (value == null || isNaN(value)) return undefined
  const clamped = Math.max(-3, Math.min(3, value))
  if (clamped >= 0) {
    const t = clamped / 3
    return `hsl(${Math.round(60 - t * 60)}, 65%, 18%)`
  }
  const t = -clamped / 3
  return `hsl(${Math.round(180 - t * 30)}, 60%, 18%)`
}

function TeamCell({ row }) {
  const logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${row.abbrName?.toLowerCase()}.png`
  return (
    <div className="flex items-center gap-2">
      <img src={logoUrl} alt="" className="w-6 h-6 object-contain" onError={e => { e.target.style.display = 'none' }} />
      <span>{row.cityName} {row.displayName}</span>
    </div>
  )
}

export default function StandingsPage() {
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [standings, setStandings] = useState([])
  const [sortKey, setSortKey] = useState('winPct')
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

  const sorted = [...standings].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const sosCols = isCurrentSeason
    ? [
        {
          key:   sosMode === 'curr' ? 'oppPyPatCurr'          : 'oppPyPatPrev',
          label: 'SoS Played',
          fmt:   v => v != null ? (v * 100).toFixed(1) + '%' : '—',
          heat:  'lower',
          title: sosMode === 'curr'
            ? 'Played SoS: avg opponent-adjusted PyPAT from current season'
            : 'Played SoS: avg opponent-adjusted PyPAT from previous season',
        },
        {
          key:   sosMode === 'curr' ? 'oppPyPatRemainingCurr' : 'oppPyPatRemainingPrev',
          label: 'SoS Left',
          fmt:   v => v != null ? (v * 100).toFixed(1) + '%' : '—',
          heat:  'lower',
          title: sosMode === 'curr'
            ? "Remaining SoS: future opponents' opponent-adjusted PyPAT (current season)"
            : "Remaining SoS: future opponents' opponent-adjusted PyPAT (previous season)",
        },
        {
          key:   sosMode === 'curr' ? 'oppPyPatTotalCurr' : 'oppPyPatTotalPrev',
          label: 'SoS Total',
          fmt:   v => v != null ? (v * 100).toFixed(1) + '%' : '—',
          heat:  'lower',
          title: sosMode === 'curr'
            ? 'Full-season SoS: all scheduled opponents (current season stats)'
            : 'Full-season SoS: all scheduled opponents (previous season stats)',
        },
      ]
    : [
        {
          key:   sosMode === 'curr' ? 'oppPyPatCurr' : 'oppPyPatPrev',
          label: 'SoS',
          fmt:   v => v != null ? (v * 100).toFixed(1) + '%' : '—',
          heat:  'lower',
          title: sosMode === 'curr'
            ? 'Strength of Schedule: avg opponent-adjusted PyPAT (current season stats)'
            : 'Strength of Schedule: avg opponent-adjusted PyPAT (previous season stats)',
        },
      ]

  const COLS = [
    { key: 'rank',           label: '#',       fmt: (_, i) => i + 1 },
    { key: 'displayName',    label: 'Team',    fmt: (v, _, row) => <TeamCell row={row} /> },
    { key: 'wins',           label: 'W' },
    { key: 'losses',         label: 'L' },
    { key: 'ties',           label: 'T' },
    { key: 'winPct',         label: 'Win%',    fmt: v => v.toFixed(3), heat: 'higher' },
    { key: 'pointsFor',      label: 'Avg PF',
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pointsAgainst',  label: 'Avg PA',
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pythagoreanPat', label: 'PyPAT',   fmt: v => (v * 100).toFixed(1) + '%', heat: 'higher',
      title: 'PythagoreanPAT win expectancy' },
    { key: 'winDiff',        label: 'Luck',
      fmt: v => v != null ? (v > 0 ? '+' : '') + v.toFixed(1) : '—',
      heat: 'diverge',
      title: 'Wins above PyPAT expectation. Positive = lucky (regression risk).' },
    ...sosCols,
  ]

  const colValues = {}
  for (const col of COLS) {
    if (col.heat) colValues[col.key] = sorted.map(r => r[col.key])
  }

  const groups = groupByConf
    ? [
        { label: 'AFC', rows: sorted.filter(r => r.conference === 'AFC') },
        { label: 'NFC', rows: sorted.filter(r => r.conference === 'NFC') },
      ]
    : [{ label: null, rows: sorted }]

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h1 className="text-xl font-bold">Standings</h1>

        <select
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
          value={season ?? ''}
          onChange={e => {
            const newSeason = Number(e.target.value)
            setSeason(newSeason)
            setSosMode(newSeason === seasons[seasons.length - 1] ? 'prev' : 'curr')
          }}
        >
          {seasons.map(s => (
            <option key={s} value={s}>Season {s + 2025}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={groupByConf}
            onChange={e => setGroupByConf(e.target.checked)}
            className="accent-green-500"
          />
          Group by conference
        </label>

        <div className="flex items-center gap-2 text-sm">
          <span
            className="text-gray-400 cursor-help"
            title="SoS is calculated using opponent-adjusted PyPAT — each opponent's quality is measured without their games against the team being evaluated, so H2H results don't inflate their rating. Previous season is more reliable early in the current season before enough games have been played to produce accurate team ratings."
          >
            SoS Opponent PyPat:
          </span>
          <div className="flex items-center gap-1 bg-gray-800 rounded px-1 py-1">
            <button
              onClick={() => setSosMode('curr')}
              className={`px-2 py-0.5 rounded text-xs ${sosMode === 'curr' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
            >
              This Season
            </button>
            <button
              onClick={() => setSosMode('prev')}
              className={`px-2 py-0.5 rounded text-xs ${sosMode === 'prev' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
            >
              Prior Season
            </button>
          </div>
        </div>
      </div>

      {error && <div className="text-red-400 mb-4">{error}</div>}
      {loading && <div className="text-gray-400">Loading...</div>}

      {!loading && !error && groups.map(group => (
        <div key={group.label ?? 'all'} className="mb-8">
          {group.label && <h2 className="text-green-400 font-semibold mb-2">{group.label}</h2>}
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className="px-3 py-2 text-left cursor-pointer hover:text-white select-none whitespace-nowrap"
                      title={col.title}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && (sortAsc ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">
                    {standings.length > 0 && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => exportCsv(sorted, season)}
                          title="Export CSV"
                          className="text-gray-500 hover:text-white transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="12" y1="18" x2="12" y2="12"/>
                            <line x1="9" y1="15" x2="15" y2="15"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => exportExcel(sorted, season)}
                          title="Export Excel"
                          className="text-gray-500 hover:text-white transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="3" y1="9" x2="21" y2="9"/>
                            <line x1="3" y1="15" x2="21" y2="15"/>
                            <line x1="9" y1="3" x2="9" y2="21"/>
                            <line x1="15" y1="3" x2="15" y2="21"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => (
                  <tr key={row.teamId} className="border-t border-gray-800 hover:bg-gray-800/50">
                    {COLS.map(col => {
                      const val = row[col.key]
                      const bgColor = col.heat === 'diverge'
                        ? divergeColor(val)
                        : col.heat
                          ? heatColor(val, colValues[col.key] ?? [], col.heat)
                          : undefined
                      return (
                        <td
                          key={col.key}
                          className="px-3 py-2 whitespace-nowrap"
                          style={bgColor ? { backgroundColor: bgColor } : undefined}
                        >
                          {col.fmt ? col.fmt(val, i, row) : val ?? '—'}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
