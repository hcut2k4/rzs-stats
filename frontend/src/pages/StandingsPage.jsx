import { useState, useEffect } from 'react'
import { getSeasons, getStandings } from '../api/client'

const COLS = [
  { key: 'rank',           label: '#',          fmt: (_, i) => i + 1 },
  { key: 'displayName',    label: 'Team',        fmt: (v, _, row) => <TeamCell row={row} /> },
  { key: 'wins',           label: 'W' },
  { key: 'losses',         label: 'L' },
  { key: 'ties',           label: 'T' },
  { key: 'winPct',         label: 'Win%',        fmt: v => v.toFixed(3) },
  { key: 'pointsFor',      label: 'PF' },
  { key: 'pointsAgainst',  label: 'PA' },
  { key: 'pythagoreanPat', label: 'PyPat',       fmt: v => v.toFixed(4), title: 'Pythagorean Win Expectancy' },
  { key: 'oppPyPatCurr',   label: 'SoS (Curr)',  fmt: v => v.toFixed(4), title: 'In-season Strength of Schedule' },
  { key: 'oppPyPatPrev',   label: 'SoS (Prev)',  fmt: v => v.toFixed(4), title: 'Pre-season Strength of Schedule (prior season)' },
]

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
            <option key={s} value={s}>Season {s + 1}</option>
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
                    {COLS.map(col => (
                      <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                        {col.fmt
                          ? col.fmt(row[col.key], i, row)
                          : row[col.key] ?? '—'}
                      </td>
                    ))}
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
