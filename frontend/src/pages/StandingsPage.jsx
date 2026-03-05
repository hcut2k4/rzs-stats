import { useState, useEffect } from 'react'
import { getSeasons, getStandings } from '../api/client'

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
        if (s.length) setSeason(s.length > 1 ? s[s.length - 2] : s[0])
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

  const sorted = [...standings].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const sosCols = [
    {
      key:   sosMode === 'curr' ? 'oppPyPatCurr'          : 'oppPyPatPrev',
      label: 'SoS Played',
      fmt:   v => v != null ? (v * 100).toFixed(1) + '%' : '—',
      heat:  'lower',
      title: sosMode === 'curr'
        ? 'Played SoS: avg opponent PyPAT from current season'
        : 'Played SoS: avg opponent PyPAT from previous season',
    },
    {
      key:   sosMode === 'curr' ? 'oppPyPatRemainingCurr' : 'oppPyPatRemainingPrev',
      label: 'SoS Left',
      fmt:   v => v != null ? (v * 100).toFixed(1) + '%' : '—',
      heat:  'lower',
      title: sosMode === 'curr'
        ? "Remaining SoS: future opponents' current season PyPAT"
        : "Remaining SoS: future opponents' previous season PyPAT",
    },
  ]

  const COLS = [
    { key: 'rank',           label: '#',     fmt: (_, i) => i + 1 },
    { key: 'displayName',    label: 'Team',  fmt: (v, _, row) => <TeamCell row={row} /> },
    { key: 'wins',           label: 'W' },
    { key: 'losses',         label: 'L' },
    { key: 'ties',           label: 'T' },
    { key: 'winPct',         label: 'Win%',  fmt: v => v.toFixed(3), heat: 'higher' },
    { key: 'pointsFor',      label: 'PF' },
    { key: 'pointsAgainst',  label: 'PA' },
    { key: 'pythagoreanPat', label: 'PyPAT', fmt: v => (v * 100).toFixed(1) + '%', heat: 'higher',
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
          onChange={e => setSeason(Number(e.target.value))}
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

        <div className="flex items-center gap-1 text-sm bg-gray-800 rounded px-1 py-1">
          <button
            onClick={() => setSosMode('curr')}
            className={`px-2 py-0.5 rounded text-xs ${sosMode === 'curr' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
          >
            SoS: This Season
          </button>
          <button
            onClick={() => setSosMode('prev')}
            className={`px-2 py-0.5 rounded text-xs ${sosMode === 'prev' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
          >
            SoS: Prior Season
          </button>
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
